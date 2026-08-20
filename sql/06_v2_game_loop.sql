-- ============================================================
-- Duet — the "v2" game loop, captured into version control for
-- the first time.
-- Run whole file in Supabase > SQL Editor, AFTER 05_fix_schema_drift.sql.
--
-- Since 03_rls_policies.sql was committed, the live project grew
-- a second generation of schema that was applied directly in the
-- Supabase SQL Editor and never captured here: a "rounds" table
-- (replacing daily_rounds), couple streak/freeze state, custom
-- prompts ("Author Night"), multi-use invite codes, post-reveal
-- reactions, weekly winners, and the RPC functions that drive all
-- of it (start_todays_round, submit_answer, get_scoreboard, and
-- friends). This file reconstructs that generation from the live
-- database so sql/ finally describes what's actually running.
--
-- Everything here is idempotent (create table/policy if not
-- exists, create or replace function) — safe to run even though
-- it's already live. It does NOT touch skip_requests.status, the
-- submissions/skip_requests foreign keys, or the submissions
-- peek-policy — those are 05_fix_schema_drift.sql's job; run that
-- first.
-- ============================================================


-- ------------------------------------------------------------
-- 1) New tables
-- ------------------------------------------------------------

-- Streak/freeze state, one row per couple.
create table if not exists couple_state (
    couple_id uuid primary key references couples(id) on delete cascade,
    current_streak integer not null default 0,
    longest_streak integer not null default 0,
    last_completed date,
    freezes_available smallint not null default 1,
    constraint couple_state_freezes_available_check check (freezes_available >= 0 and freezes_available <= 2)
);

-- Anniversaries / significant dates a couple tracks. Not yet
-- wired into the client.
create table if not exists couple_dates (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references couples(id) on delete cascade,
    label text not null,
    event_date date not null,
    created_at timestamptz not null default now(),
    constraint couple_dates_label_check check (char_length(label) >= 1 and char_length(label) <= 40)
);

-- Author Night: a player writes tonight's question themselves.
-- Created before rounds — rounds.custom_prompt_id references it.
create table if not exists custom_prompts (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references couples(id) on delete cascade,
    author_id uuid not null references profiles(id),
    question text not null,
    options text[] not null,
    created_at timestamptz not null default now(),
    constraint custom_prompts_options_check check (cardinality(options) = 4),
    constraint custom_prompts_question_check check (char_length(question) >= 5 and char_length(question) <= 140)
);

-- One row per couple per day (per quickfire round, early on):
-- replaces daily_rounds as the live round record.
create table if not exists rounds (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references couples(id) on delete cascade,
    round_date date not null,
    prompt_index integer,
    custom_prompt_id uuid references custom_prompts(id),
    redemption_of uuid references rounds(id),
    skip_offset integer not null default 0,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    round_number smallint not null default 1,
    mode text not null default 'quiz',
    sealed_until date,
    constraint rounds_check check (prompt_index is not null or custom_prompt_id is not null),
    constraint rounds_mode_check check (mode = any (array['quiz', 'free_text'])),
    constraint rounds_status_check check (status = any (array['open', 'revealed', 'skipped', 'sealed'])),
    constraint rounds_couple_day_number_key unique (couple_id, round_date, round_number)
);

create index if not exists idx_rounds_couple_date on rounds using btree (couple_id, round_date desc);

-- Multi-use invite codes, replacing couples.invite_code as the
-- pairing mechanism (a couple can hold several live codes; the
-- first one used wins and the rest are cleared by join_couple()).
create table if not exists invite_codes (
    code text primary key,
    couple_id uuid not null references couples(id) on delete cascade,
    created_by uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now()
);

-- Post-reveal reactions. Schema is live; the client doesn't call
-- this yet.
create table if not exists reactions (
    id uuid primary key default gen_random_uuid(),
    round_id uuid not null references rounds(id) on delete cascade,
    user_id uuid not null references profiles(id),
    body text not null,
    created_at timestamptz not null default now(),
    constraint reactions_body_check check (char_length(body) >= 1 and char_length(body) <= 80),
    constraint reactions_round_id_user_id_key unique (round_id, user_id)
);

create index if not exists idx_reactions_round on reactions using btree (round_id);

-- One row per couple per week, once that week is scored.
create table if not exists week_results (
    couple_id uuid not null references couples(id) on delete cascade,
    week_start date not null,
    winner_id uuid references profiles(id),
    decided_at timestamptz not null default now(),
    constraint week_results_pkey primary key (couple_id, week_start)
);


-- ------------------------------------------------------------
-- 2) round_progress view — "has this user submitted?" without
--    exposing the answer itself. security_invoker so it runs
--    under the querying user's RLS, not the view owner's.
-- ------------------------------------------------------------

create or replace view round_progress
with (security_invoker = true) as
select round_id, user_id, submitted_at
from submissions;


-- ------------------------------------------------------------
-- 3) Helper: is_couple_member — same recursion-trap fix as
--    my_couple_ids()/i_have_submitted() in 03_rls_policies.sql,
--    just phrased as "is this user in this specific couple?"
-- ------------------------------------------------------------

create or replace function is_couple_member(p_couple uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from couple_members cm
        where cm.couple_id = p_couple and cm.user_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- 4) Pairing — create_couple/join_couple, updated to run on
--    invite_codes instead of couples.invite_code, plus the code
--    generator they share.
-- ------------------------------------------------------------

create or replace function generate_code()
returns text
language sql
set search_path = public
as $$
    select string_agg(
        substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
    from generate_series(1, 6);
$$;

create or replace function create_couple(p_display_name text)
returns table (couple_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_code text;
    v_couple_id uuid;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    if exists (select 1 from couple_members where user_id = auth.uid()) then
        raise exception 'already in a couple';
    end if;
    -- ensure a profile row exists
    insert into profiles (id, display_name)
    values (auth.uid(), p_display_name)
    on conflict (id) do update set display_name = excluded.display_name;
    -- 6-char code, unambiguous alphabet, retry on the rare collision
    loop
        v_code := upper(substr(translate(encode(gen_random_bytes(8), 'base64'),
                        '0OIl+/=', 'WXYZQK'), 1, 6));
        begin
            insert into couples (invite_code) values (v_code)
            returning id into v_couple_id;
            exit;
        exception when unique_violation then
            -- collision: loop and try a new code
        end;
    end loop;
    -- mirror the code into invite_codes so join_couple can find it
    insert into invite_codes (code, couple_id) values (v_code, v_couple_id);
    insert into couple_members (couple_id, user_id)
    values (v_couple_id, auth.uid());
    return query select v_couple_id, v_code;
end;
$$;

create or replace function generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple_id uuid;
    v_code text;
begin
    select couple_id into v_couple_id
    from couple_members where user_id = auth.uid();

    if v_couple_id is null then
        raise exception 'You are not in a duet yet.';
    end if;

    if (select count(*) from couple_members where couple_id = v_couple_id) >= 2 then
        raise exception 'Your duet is already paired.';
    end if;

    loop
        v_code := generate_code();
        begin
            insert into invite_codes (code, couple_id) values (v_code, v_couple_id);
            return v_code;
        exception when unique_violation then
            -- collision: loop and try again
        end;
    end loop;
end;
$$;

create or replace function join_couple(p_invite_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple_id uuid;
    v_member_count int;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    if exists (select 1 from couple_members where user_id = auth.uid()) then
        raise exception 'already in a couple';
    end if;
    select ic.couple_id into v_couple_id
    from invite_codes ic
    where ic.code = upper(trim(p_invite_code));
    if v_couple_id is null then
        raise exception 'invalid invite code';
    end if;
    select count(*) into v_member_count
    from couple_members
    where couple_id = v_couple_id;
    if v_member_count >= 2 then
        raise exception 'couple is full';
    end if;
    insert into profiles (id, display_name)
    values (auth.uid(), p_display_name)
    on conflict (id) do update set display_name = excluded.display_name;
    insert into couple_members (couple_id, user_id)
    values (v_couple_id, auth.uid());
    delete from invite_codes where couple_id = v_couple_id;
    return v_couple_id;
end;
$$;


-- ------------------------------------------------------------
-- 5) Read models — get_scoreboard / get_achievements /
--    get_month_rewind. All security definer + auth.uid()-scoped,
--    so they return only the caller's own couple's data.
-- ------------------------------------------------------------

create or replace function get_scoreboard(p_today date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple uuid;
    v_week   date;
begin
    select cm.couple_id into v_couple
    from couple_members cm where cm.user_id = auth.uid();

    if v_couple is null then
        raise exception 'not paired';
    end if;

    v_week := (date_trunc('week', p_today))::date;

    return json_build_object(
        'week_start', v_week,
        'scores', (
            select coalesce(json_agg(json_build_object(
                'user_id', t.user_id,
                'points', t.pts,
                'on_fire', (
                    -- last 3 revealed quiz calls all correct → hot hand is live
                    select count(*) = 3 and bool_and(x.called_it)
                    from (
                        select s2.called_it
                        from submissions s2
                        join rounds r2 on r2.id = s2.round_id
                        where s2.user_id = t.user_id
                            and r2.couple_id = v_couple
                            and r2.status = 'revealed'
                            and r2.mode = 'quiz'
                            and s2.called_it is not null
                        order by r2.round_date desc, r2.round_number desc
                        limit 3
                    ) x
                )
            )), '[]'::json)
            from (
                select s.user_id, sum(s.points) as pts
                from rounds r
                join submissions s on s.round_id = r.id
                where r.couple_id = v_couple
                    and r.round_date >= v_week
                    and s.points is not null
                group by s.user_id
            ) t
        ),
        'streak', (
            select json_build_object(
                'current', cs.current_streak,
                'longest', cs.longest_streak,
                'freezes', cs.freezes_available
            )
            from couple_state cs where cs.couple_id = v_couple
        ),
        'last_week_winner', (
            select wr.winner_id from week_results wr
            where wr.couple_id = v_couple and wr.week_start = v_week - 7
        )
    );
end;
$$;

create or replace function get_achievements()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple uuid;
begin
    select cm.couple_id into v_couple
    from couple_members cm where cm.user_id = auth.uid();

    if v_couple is null then
        raise exception 'not paired';
    end if;

    return json_build_object(
        'rounds_played', (
            select count(*) from rounds r
            where r.couple_id = v_couple and r.status = 'revealed'
        ),
        'couple_badges', (
            select json_build_object(
                'streak_7',   cs.longest_streak >= 7,
                'streak_30',  cs.longest_streak >= 30,
                'streak_100', cs.longest_streak >= 100,
                'double_ace', exists (
                    select 1 from rounds r
                    where r.couple_id = v_couple
                        and r.status = 'revealed'
                        and (
                            select count(*) from submissions s
                            where s.round_id = r.id and s.wager = 3 and s.called_it
                        ) = 2
                ),
                'rounds_50', (
                    select count(*) >= 50 from rounds r
                    where r.couple_id = v_couple and r.status = 'revealed'
                ),
                'weeks_5', (
                    select count(*) >= 5 from week_results wr
                    where wr.couple_id = v_couple
                )
            )
            from couple_state cs where cs.couple_id = v_couple
        ),
        'player_badges', (
            select coalesce(json_agg(json_build_object(
                'user_id', p.user_id,
                'first_x3_win', p.first_x3_win,
                'hot_hand', p.best_run >= 3,
                'best_run', p.best_run,
                'weeks_won', p.weeks_won
            )), '[]'::json)
            from (
                select
                    cm.user_id,
                    exists (
                        select 1 from submissions s
                        join rounds r on r.id = s.round_id
                        where s.user_id = cm.user_id
                            and r.couple_id = v_couple
                            and s.wager = 3 and s.called_it
                    ) as first_x3_win,
                    coalesce((
                        with ordered as (
                            select s2.called_it,
                                row_number() over (order by r2.round_date, r2.round_number) as rn
                            from submissions s2
                            join rounds r2 on r2.id = s2.round_id
                            where s2.user_id = cm.user_id
                                and r2.couple_id = v_couple
                                and r2.status = 'revealed'
                                and r2.mode = 'quiz'
                                and s2.called_it is not null
                        ),
                        runs as (
                            select count(*) as run_len
                            from (
                                select called_it,
                                    rn - row_number() over (partition by called_it order by rn) as grp
                                from ordered
                            ) t
                            where called_it
                            group by grp
                        )
                        select max(run_len) from runs
                    ), 0) as best_run,
                    (
                        select count(*) from week_results wr
                        where wr.couple_id = v_couple and wr.winner_id = cm.user_id
                    ) as weeks_won
                from couple_members cm
                where cm.couple_id = v_couple
            ) p
        )
    );
end;
$$;

create or replace function get_month_rewind(p_month date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple uuid;
    v_start  date;
    v_end    date;
begin
    select cm.couple_id into v_couple
    from couple_members cm where cm.user_id = auth.uid();

    if v_couple is null then
        raise exception 'not paired';
    end if;

    v_start := date_trunc('month', p_month)::date;
    v_end   := (v_start + interval '1 month')::date;

    return json_build_object(
        'month', v_start,
        'rounds_played', (
            select count(*) from rounds r
            where r.couple_id = v_couple
                and r.round_date >= v_start and r.round_date < v_end
                and r.status = 'revealed'
        ),
        'totals', (
            select coalesce(json_agg(json_build_object(
                'user_id', t.user_id,
                'points', t.pts,
                'calls_made', t.hits,
                'accuracy_pct', t.acc
            )), '[]'::json)
            from (
                select s.user_id,
                       sum(s.points) as pts,
                       count(*) filter (where s.called_it) as hits,
                       round(100.0 * count(*) filter (where s.called_it) / count(*)) as acc
                from rounds r
                join submissions s on s.round_id = r.id
                where r.couple_id = v_couple
                    and r.round_date >= v_start and r.round_date < v_end
                    and s.points is not null
                group by s.user_id
            ) t
        ),
        'best_call', (
            select json_build_object(
                'user_id', s.user_id, 'points', s.points,
                'round_date', r.round_date, 'prompt_index', r.prompt_index
            )
            from rounds r join submissions s on s.round_id = r.id
            where r.couple_id = v_couple
                and r.round_date >= v_start and r.round_date < v_end
                and s.called_it
            order by s.points desc, r.round_date
            limit 1
        ),
        'worst_whiff', (
            select json_build_object(
                'user_id', s.user_id, 'points', s.points,
                'round_date', r.round_date, 'prompt_index', r.prompt_index
            )
            from rounds r join submissions s on s.round_id = r.id
            where r.couple_id = v_couple
                and r.round_date >= v_start and r.round_date < v_end
                and s.called_it = false
            order by s.points asc, r.round_date
            limit 1
        ),
        'weeks_won', (
            select coalesce(json_agg(json_build_object(
                'week_start', wr.week_start, 'winner_id', wr.winner_id
            ) order by wr.week_start), '[]'::json)
            from week_results wr
            where wr.couple_id = v_couple
                and wr.week_start >= v_start and wr.week_start < v_end
        )
    );
end;
$$;


-- ------------------------------------------------------------
-- 6) Skip flow — request_skip / resolve_skip.
--    c_prompt_count must match EXPECTED_PROMPT_COUNT in theme.js
--    and PROMPTS.length in data/prompts.js (currently 99).
-- ------------------------------------------------------------

create or replace function request_skip(p_round_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_couple uuid;
    v_id     uuid;
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
    return v_id;
end;
$$;

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


-- ------------------------------------------------------------
-- 7) The daily round: start_todays_round.
--    c_prompt_count must match EXPECTED_PROMPT_COUNT in theme.js
--    and PROMPTS.length in data/prompts.js (currently 99).
--    c_free_text_sundays is off — the app doesn't render
--    free-text rounds yet.
-- ------------------------------------------------------------

create or replace function start_todays_round(p_today date)
returns rounds
language plpgsql
security definer
set search_path = public
as $$
declare
    -- keep in sync with PROMPTS.length in the app
    c_prompt_count constant int := 99;
    -- keep in sync with FREE_PROMPTS.length in the app (once it exists)
    c_free_prompt_count constant int := 12;
    -- flip to true once the app renders free-text rounds
    c_free_text_sundays constant boolean := false;
    -- calibration night length for brand-new couples
    c_quickfire_rounds constant int := 5;

    v_couple      uuid;
    v_round       rounds;
    v_prev_week   date;
    v_winner      uuid;
    v_ties        boolean;
    v_redeem      rounds;
    v_custom      uuid;
    v_day_number  bigint;
    v_index       int;
    v_first_day   boolean;
begin
    select cm.couple_id into v_couple
    from couple_members cm
    where cm.user_id = auth.uid();

    if v_couple is null then
        raise exception 'not paired';
    end if;

    insert into couple_state (couple_id) values (v_couple)
    on conflict do nothing;

    -- ---- lazy weekly rollover ---------------------------------------------
    v_prev_week := (date_trunc('week', p_today))::date - 7;

    if not exists (
             select 1 from week_results wr
             where wr.couple_id = v_couple and wr.week_start = v_prev_week
         )
         and exists (
             select 1 from rounds r
             join submissions s on s.round_id = r.id
             where r.couple_id = v_couple
                 and r.round_date >= v_prev_week
                 and r.round_date < v_prev_week + 7
                 and s.points is not null
         )
    then
        with totals as (
            select s.user_id, sum(s.points) as pts
            from rounds r
            join submissions s on s.round_id = r.id
            where r.couple_id = v_couple
                and r.round_date >= v_prev_week
                and r.round_date < v_prev_week + 7
                and s.points is not null
            group by s.user_id
        )
        select
            case when count(*) filter (where pts = (select max(pts) from totals)) > 1
                     then null
                     else (select user_id from totals order by pts desc limit 1)
            end,
            count(*) filter (where pts = (select max(pts) from totals)) > 1
        into v_winner, v_ties
        from totals;

        insert into week_results (couple_id, week_start, winner_id)
        values (v_couple, v_prev_week, v_winner);

        update couple_state
        set freezes_available = greatest(freezes_available, 1)
        where couple_id = v_couple;
    end if;

    v_day_number := extract(epoch from p_today)::bigint / 86400;
    v_first_day := not exists (
        select 1 from rounds r
        where r.couple_id = v_couple and r.round_date < p_today
    );

    -- ---- today's latest round, if any --------------------------------------
    select * into v_round
    from rounds
    where couple_id = v_couple and round_date = p_today
    order by round_number desc
    limit 1;

    if found then
        -- quickfire: on the first day, a revealed round spawns the next one.
        if v_round.status = 'revealed'
             and v_first_day
             and v_round.round_number < c_quickfire_rounds
        then
            v_index := (((v_day_number * 2654435761) % 4294967296
                                     + v_round.round_number) % c_prompt_count)::int;
            insert into rounds (couple_id, round_date, round_number, prompt_index)
            values (v_couple, p_today, v_round.round_number + 1, v_index)
            returning * into v_round;
        end if;
        return v_round;
    end if;

    -- ---- free-text sunday (gated) --------------------------------------------
    if c_free_text_sundays and extract(isodow from p_today) = 7 then
        v_index := (((v_day_number * 2654435761) % 4294967296) % c_free_prompt_count)::int;
        insert into rounds (couple_id, round_date, prompt_index, mode)
        values (v_couple, p_today, v_index, 'free_text')
        returning * into v_round;
        return v_round;
    end if;

    -- ---- redemption wednesday ----------------------------------------------
    if extract(isodow from p_today) = 3 then
        select r.* into v_redeem
        from rounds r
        where r.couple_id = v_couple
            and r.status = 'revealed'
            and r.mode = 'quiz'
            and r.prompt_index is not null
            and r.round_date <= p_today - 21
            and exists (
                select 1 from submissions s
                where s.round_id = r.id and s.called_it = false
            )
            and not exists (
                select 1 from rounds r2 where r2.redemption_of = r.id
            )
        order by r.round_date
        limit 1;

        if found then
            insert into rounds (couple_id, round_date, prompt_index, redemption_of)
            values (v_couple, p_today, v_redeem.prompt_index, v_redeem.id)
            returning * into v_round;
            return v_round;
        end if;
    end if;

    -- ---- author night saturday -----------------------------------------------
    if extract(isodow from p_today) = 6 then
        select cp.id into v_custom
        from custom_prompts cp
        where cp.couple_id = v_couple
            and not exists (
                select 1 from rounds r where r.custom_prompt_id = cp.id
            )
        order by cp.created_at
        limit 1;

        if found then
            insert into rounds (couple_id, round_date, custom_prompt_id)
            values (v_couple, p_today, v_custom)
            returning * into v_round;
            return v_round;
        end if;
    end if;

    -- ---- default: hash the day into the library -----------------------------
    v_index := (((v_day_number * 2654435761) % 4294967296) % c_prompt_count)::int;

    insert into rounds (couple_id, round_date, prompt_index)
    values (v_couple, p_today, v_index)
    returning * into v_round;

    return v_round;
end;
$$;


-- ------------------------------------------------------------
-- 8) Submitting: submit_answer. Scores the wager, applies hot-
--    hand bonus, and rolls streak/freeze state once both
--    partners are in.
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
-- 9) RLS: enable + policies for every new table.
-- ------------------------------------------------------------

alter table rounds enable row level security;
drop policy if exists rounds_select on rounds;
create policy rounds_select
on rounds for select
using (is_couple_member(couple_id));

alter table couple_state enable row level security;
drop policy if exists couple_state_select on couple_state;
create policy couple_state_select
on couple_state for select
using (is_couple_member(couple_id));

alter table couple_dates enable row level security;
drop policy if exists couple_dates_select on couple_dates;
create policy couple_dates_select
on couple_dates for select
using (is_couple_member(couple_id));
drop policy if exists couple_dates_write on couple_dates;
create policy couple_dates_write
on couple_dates
using (is_couple_member(couple_id))
with check (is_couple_member(couple_id));

alter table custom_prompts enable row level security;
drop policy if exists custom_prompts_select on custom_prompts;
create policy custom_prompts_select
on custom_prompts for select
using (is_couple_member(couple_id));
drop policy if exists custom_prompts_insert on custom_prompts;
create policy custom_prompts_insert
on custom_prompts for insert
with check (author_id = auth.uid() and is_couple_member(couple_id));

alter table invite_codes enable row level security;
drop policy if exists "members read own couple codes" on invite_codes;
create policy "members read own couple codes"
on invite_codes for select
using (
    couple_id in (
        select couple_members.couple_id
        from couple_members
        where couple_members.user_id = auth.uid()
    )
);

alter table reactions enable row level security;
drop policy if exists reactions_select on reactions;
create policy reactions_select
on reactions for select
using (is_couple_member((select r.couple_id from rounds r where r.id = reactions.round_id)));
drop policy if exists reactions_insert on reactions;
create policy reactions_insert
on reactions for insert
with check (
    user_id = auth.uid()
    and is_couple_member((select r.couple_id from rounds r where r.id = reactions.round_id))
    and (select r.status from rounds r where r.id = reactions.round_id) = 'revealed'
);

alter table week_results enable row level security;
drop policy if exists week_results_select on week_results;
create policy week_results_select
on week_results for select
using (is_couple_member(couple_id));


-- ------------------------------------------------------------
-- 10) submissions/skip_requests select policies that reference
--     rounds (not daily_rounds) — these are the CORRECT, already-
--     live versions; repeated here only so this file is a
--     complete record. submissions_select_own and the FK/insert/
--     update fixes live in 05_fix_schema_drift.sql — don't touch
--     them here.
-- ------------------------------------------------------------

drop policy if exists submissions_select on submissions;
-- NOTE: intentionally not recreated — this was the ungated
-- peek-hole policy. See 05_fix_schema_drift.sql.

drop policy if exists skip_requests_select on skip_requests;
create policy skip_requests_select
on skip_requests for select
using (is_couple_member((select r.couple_id from rounds r where r.id = skip_requests.round_id)));


-- ------------------------------------------------------------
-- 11) Grants
-- ------------------------------------------------------------

grant select, insert, update, delete on rounds, couple_state, couple_dates, custom_prompts, invite_codes, reactions, week_results
    to anon, authenticated, service_role;
grant select on round_progress to anon, authenticated, service_role;

grant execute on function is_couple_member(uuid) to anon, authenticated, service_role;
grant execute on function generate_code() to anon, authenticated, service_role;
grant execute on function generate_invite_code() to anon, authenticated, service_role;
grant execute on function get_scoreboard(date) to anon, authenticated, service_role;
grant execute on function get_achievements() to anon, authenticated, service_role;
grant execute on function get_month_rewind(date) to anon, authenticated, service_role;
grant execute on function request_skip(uuid) to anon, authenticated, service_role;
grant execute on function resolve_skip(uuid, text) to anon, authenticated, service_role;
grant execute on function start_todays_round(date) to anon, authenticated, service_role;
grant execute on function submit_answer(uuid, text, text, smallint) to anon, authenticated, service_role;

revoke execute on function create_couple(text) from public, anon;
revoke execute on function join_couple(text, text) from public, anon;
grant execute on function create_couple(text) to authenticated, service_role;
grant execute on function join_couple(text, text) to authenticated, service_role;
