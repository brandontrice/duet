-- ============================================================
-- Duet — push notifications for the three moments where someone
-- needs to come back and take a turn: your partner answered
-- first, your partner wants to skip tonight's question, or your
-- partner declined your skip request.
-- Run whole file in Supabase > SQL Editor, AFTER 06_v2_game_loop.sql.
--
-- Requires the pg_net extension (bundled with Supabase; enables
-- async HTTP calls from Postgres) to reach Expo's push API. If
-- "create extension pg_net" errors on your plan, enable it via
-- Dashboard > Database > Extensions instead, then re-run this file.
--
-- The client is responsible for registering an Expo push token
-- into push_tokens once the user is signed in and paired — see
-- lib/pushNotifications.js. Nothing here sends anything until a
-- token exists for the recipient.
-- ============================================================

create extension if not exists pg_net with schema extensions;


-- ------------------------------------------------------------
-- 1) push_tokens — one row per device. A user may have several
--    (multiple phones); notify_user() fans out to all of them.
-- ------------------------------------------------------------

create table if not exists push_tokens (
    token text primary key,
    user_id uuid not null references profiles(id) on delete cascade,
    updated_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on push_tokens using btree (user_id);

alter table push_tokens enable row level security;

drop policy if exists push_tokens_select on push_tokens;
create policy push_tokens_select
on push_tokens for select
to authenticated
using (user_id = auth.uid());

drop policy if exists push_tokens_insert on push_tokens;
create policy push_tokens_insert
on push_tokens for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists push_tokens_update on push_tokens;
create policy push_tokens_update
on push_tokens for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists push_tokens_delete on push_tokens;
create policy push_tokens_delete
on push_tokens for delete
to authenticated
using (user_id = auth.uid());


-- ------------------------------------------------------------
-- 2) notify_user — fire-and-forget push to every device a user
--    has registered. Silently does nothing if they have none.
-- ------------------------------------------------------------

create or replace function notify_user(p_user_id uuid, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_messages jsonb;
begin
    select jsonb_agg(jsonb_build_object(
        'to', pt.token,
        'title', p_title,
        'body', p_body,
        'data', p_data,
        'sound', 'default'
    ))
    into v_messages
    from push_tokens pt
    where pt.user_id = p_user_id;

    if v_messages is null then
        return;
    end if;

    perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_messages,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
    );
end;
$$;

grant execute on function notify_user(uuid, text, text, jsonb) to authenticated, service_role;


-- ------------------------------------------------------------
-- 3) submit_answer — unchanged scoring logic, plus: when you're
--    the first to answer, notify your partner it's their turn.
-- ------------------------------------------------------------

create or replace function submit_answer(p_round_id uuid, p_answer text, p_prediction text default null, p_wager smallint default 1)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    c_hot_hand_bonus constant smallint := 5;
    c_hot_hand_run   constant int := 3;

    v_round       rounds;
    v_count       int;
    v_state       couple_state;
    v_new_streak  int;
    v_gap         int;
    v_double_ace  boolean;
    v_sub         record;
    v_hot         boolean;
    v_partner_id  uuid;
    v_my_name     text;
begin
    select * into v_round from rounds where id = p_round_id;

    if v_round is null or not is_couple_member(v_round.couple_id) then
        raise exception 'round not found';
    end if;

    if v_round.status <> 'open' then
        raise exception 'round is not open';
    end if;

    if v_round.mode = 'quiz' and p_prediction is null then
        raise exception 'prediction required';
    end if;

    insert into submissions (round_id, user_id, answer, prediction, wager)
    values (
        p_round_id,
        auth.uid(),
        p_answer,
        case when v_round.mode = 'quiz' then p_prediction else null end,
        case when v_round.mode = 'quiz' then p_wager else 1 end
    );

    select count(*) into v_count from submissions where round_id = p_round_id;

    if v_count < 2 then
        select cm.user_id into v_partner_id
        from couple_members cm
        where cm.couple_id = v_round.couple_id and cm.user_id <> auth.uid();

        select display_name into v_my_name from profiles where id = auth.uid();

        if v_partner_id is not null then
            perform notify_user(v_partner_id, 'Duet', coalesce(v_my_name, 'Your partner') || ' just answered — your turn!');
        end if;

        return 'waiting';
    end if;

    -- ---- both in: score (quiz only) ------------------------------------------
    if v_round.mode = 'quiz' then
        update submissions s
        set called_it = (s.prediction = o.answer),
            points = case
                when s.prediction = o.answer then s.wager * 10
                else -(s.wager - 1) * 10
            end
        from submissions o
        where s.round_id = p_round_id
            and o.round_id = p_round_id
            and o.user_id <> s.user_id;

        -- hot hand: a correct call preceded by 3 straight correct calls pays +5.
        for v_sub in
            select s.user_id, s.called_it
            from submissions s
            where s.round_id = p_round_id
        loop
            if v_sub.called_it then
                select (count(*) = c_hot_hand_run and bool_and(x.called_it)) into v_hot
                from (
                    select s2.called_it
                    from submissions s2
                    join rounds r2 on r2.id = s2.round_id
                    where s2.user_id = v_sub.user_id
                        and r2.couple_id = v_round.couple_id
                        and r2.status = 'revealed'
                        and r2.mode = 'quiz'
                        and s2.called_it is not null
                        and (r2.round_date, r2.round_number) < (v_round.round_date, v_round.round_number)
                    order by r2.round_date desc, r2.round_number desc
                    limit c_hot_hand_run
                ) x;

                if v_hot then
                    update submissions
                    set bonus = c_hot_hand_bonus,
                        points = points + c_hot_hand_bonus
                    where round_id = p_round_id and user_id = v_sub.user_id;
                end if;
            end if;
        end loop;
    end if;

    -- vault rounds park at 'sealed' until their open date; everything else reveals.
    if v_round.sealed_until is not null and v_round.sealed_until > v_round.round_date then
        update rounds set status = 'sealed' where id = p_round_id;
    else
        update rounds set status = 'revealed' where id = p_round_id;
    end if;

    -- ---- streak + freeze logic (a completed day counts once, any mode) ---------
    select * into v_state
    from couple_state
    where couple_id = v_round.couple_id
    for update;

    if v_state.last_completed is null then
        v_new_streak := 1;
    else
        v_gap := v_round.round_date - v_state.last_completed;
        if v_gap <= 0 then
            v_new_streak := v_state.current_streak;   -- quickfire rounds 2–5 land here
        elsif v_gap = 1 then
            v_new_streak := v_state.current_streak + 1;
        elsif v_gap = 2 and v_state.freezes_available > 0 then
            update couple_state
            set freezes_available = freezes_available - 1
            where couple_id = v_round.couple_id;
            v_new_streak := v_state.current_streak + 1;
        else
            v_new_streak := 1;
        end if;
    end if;

    select bool_and(s.wager = 3 and s.called_it) into v_double_ace
    from submissions s
    where s.round_id = p_round_id;

    update couple_state
    set current_streak = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        last_completed = v_round.round_date,
        freezes_available = case
            when coalesce(v_double_ace, false) then least(freezes_available + 1, 2)
            else freezes_available
        end
    where couple_id = v_round.couple_id;

    return case
        when v_round.sealed_until is not null and v_round.sealed_until > v_round.round_date
            then 'sealed'
        else 'revealed'
    end;
end;
$$;


-- ------------------------------------------------------------
-- 4) request_skip — unchanged logic, plus: notify your partner
--    there's a skip request waiting on them.
-- ------------------------------------------------------------

create or replace function request_skip(p_round_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple      uuid;
    v_id          uuid;
    v_partner_id  uuid;
    v_my_name     text;
begin
    select couple_id into v_couple from rounds where id = p_round_id;
    if v_couple is null or not is_couple_member(v_couple) then
        raise exception 'round not found';
    end if;
    if exists (
        select 1 from skip_requests
        where round_id = p_round_id and status = 'pending'
    ) then
        raise exception 'skip already pending';
    end if;

    insert into skip_requests (round_id, requested_by)
    values (p_round_id, auth.uid())
    returning id into v_id;

    select cm.user_id into v_partner_id
    from couple_members cm
    where cm.couple_id = v_couple and cm.user_id <> auth.uid();

    select display_name into v_my_name from profiles where id = auth.uid();

    if v_partner_id is not null then
        perform notify_user(v_partner_id, 'Duet', coalesce(v_my_name, 'Your partner') || ' wants to skip tonight''s question.');
    end if;

    return v_id;
end;
$$;


-- ------------------------------------------------------------
-- 5) resolve_skip — unchanged logic, plus: if declined, notify
--    the original requester to go answer the question.
-- ------------------------------------------------------------

create or replace function resolve_skip(p_request_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    c_prompt_count constant int := 99;   -- keep in sync with PROMPTS.length
    v_req         skip_requests;
    v_round       rounds;
    v_day_number  bigint;
    v_my_name     text;
begin
    select * into v_req from skip_requests where id = p_request_id;
    if v_req is null or v_req.status <> 'pending' then
        raise exception 'no pending skip';
    end if;

    select * into v_round from rounds where id = v_req.round_id;
    if not is_couple_member(v_round.couple_id) then
        raise exception 'not your round';
    end if;

    if p_resolution not in ('agreed', 'declined', 'expired') then
        raise exception 'bad resolution';
    end if;

    update skip_requests
    set status = p_resolution, resolved_at = now()
    where id = p_request_id;

    if p_resolution = 'declined' then
        select display_name into v_my_name from profiles where id = auth.uid();
        perform notify_user(v_req.requested_by, 'Duet', coalesce(v_my_name, 'Your partner') || ' wants to keep this one — answer up!');
    end if;

    if p_resolution in ('agreed', 'expired') then
        delete from submissions where round_id = v_round.id;

        v_day_number := extract(epoch from v_round.round_date)::bigint / 86400;

        update rounds
        set skip_offset = skip_offset + 1,
            mode = 'quiz',                    -- a skipped free-text round re-rolls to quiz
            prompt_index =
                ((((v_day_number * 2654435761) % 4294967296)
                    + (round_number - 1) + skip_offset + 1) % c_prompt_count)::int,
            custom_prompt_id = null,          -- skipping an author-night prompt
            redemption_of = null              -- or a redemption falls back to normal
        where id = v_round.id;
    end if;
end;
$$;
