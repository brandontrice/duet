-- ============================================================
-- Duet — Row Level Security policies
-- Run AFTER schema + seed, in the Supabase SQL editor.
--
-- Mental model for the SQL Server brain:
--   * RLS = a WHERE clause the database bolts onto every query,
--     based on who is asking. auth.uid() returns the calling
--     user's id (from their JWT). Postgres enforces it; the app
--     cannot bypass it with the public (anon) key.
--   * Once RLS is enabled on a table, DEFAULT = DENY EVERYTHING.
--     Each policy selectively re-opens a door. No update/delete
--     policy on submissions? Then submissions are immutable to
--     users. That's a feature here, not an oversight.
--   * security definer functions = stored procs that execute as
--     their owner (like EXECUTE AS OWNER), letting us do trusted
--     checks that would otherwise trip over RLS recursion.
-- ============================================================


-- ------------------------------------------------------------
-- 0) Helper functions
-- ------------------------------------------------------------
-- THE RECURSION TRAP: a policy on couple_members that queries
-- couple_members ("show me rows for couples I'm in") re-triggers
-- its own policy, forever. The standard fix: a security definer
-- function that reads the table WITHOUT RLS applying, and have
-- policies call the function instead.

create or replace function my_couple_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
    select couple_id
    from couple_members
    where user_id = auth.uid();
$$;

-- Same trap exists on submissions (the reveal gate needs to ask
-- "does MY row exist for this round?" from within a policy on
-- submissions itself). Helper:

create or replace function i_have_submitted(p_round_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from submissions
        where round_id = p_round_id
          and user_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- 1) Enable RLS everywhere (default deny)
-- ------------------------------------------------------------

alter table profiles       enable row level security;
alter table couples        enable row level security;
alter table couple_members enable row level security;
alter table prompts        enable row level security;
alter table daily_rounds   enable row level security;
alter table submissions    enable row level security;
alter table skip_requests  enable row level security;


-- ------------------------------------------------------------
-- 2) profiles — read self + partner, write self
-- ------------------------------------------------------------

create policy profiles_select
on profiles for select
to authenticated
using (
    id = auth.uid()
    or id in (
        select user_id
        from couple_members
        where couple_id in (select my_couple_ids())
    )
);

create policy profiles_insert
on profiles for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update
on profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());


-- ------------------------------------------------------------
-- 3) couples — members can see and update their couple
-- ------------------------------------------------------------
-- Note: creating/joining couples happens ONLY through the
-- functions in section 8, so no insert policy exists here.

create policy couples_select
on couples for select
to authenticated
using (id in (select my_couple_ids()));

create policy couples_update
on couples for update
to authenticated
using (id in (select my_couple_ids()))
with check (id in (select my_couple_ids()));


-- ------------------------------------------------------------
-- 4) couple_members — see the roster of your own couple
-- ------------------------------------------------------------

create policy couple_members_select
on couple_members for select
to authenticated
using (couple_id in (select my_couple_ids()));


-- ------------------------------------------------------------
-- 5) prompts — the library is read-only, readable by anyone
--    signed in. Nobody writes prompts from the app.
-- ------------------------------------------------------------

create policy prompts_select
on prompts for select
to authenticated
using (active = true);


-- ------------------------------------------------------------
-- 6) daily_rounds — members read + create their couple's rounds
-- ------------------------------------------------------------

create policy daily_rounds_select
on daily_rounds for select
to authenticated
using (couple_id in (select my_couple_ids()));

create policy daily_rounds_insert
on daily_rounds for insert
to authenticated
with check (couple_id in (select my_couple_ids()));

create policy daily_rounds_update
on daily_rounds for update
to authenticated
using (couple_id in (select my_couple_ids()))
with check (couple_id in (select my_couple_ids()));


-- ------------------------------------------------------------
-- 7) submissions — THE REVEAL GATE
-- ------------------------------------------------------------
-- Rule 1: you can always read your own submission.

create policy submissions_select_own
on submissions for select
to authenticated
using (user_id = auth.uid());

-- Rule 2 (the gate): you can read your PARTNER's submission only
-- when (a) the round belongs to your couple AND (b) your own
-- submission for that round already exists. Until you've locked
-- in, their row is invisible — not hidden by the app: invisible
-- to your database session. Peeking is structurally impossible.

create policy submissions_select_partner_after_lock
on submissions for select
to authenticated
using (
    user_id <> auth.uid()
    and round_id in (
        select id from daily_rounds
        where couple_id in (select my_couple_ids())
    )
    and i_have_submitted(round_id)
);

-- Rule 3: you may insert only your own submission, only into a
-- round belonging to your couple. (The unique constraint from
-- the schema already prevents double-submitting.)

create policy submissions_insert
on submissions for insert
to authenticated
with check (
    user_id = auth.uid()
    and round_id in (
        select id from daily_rounds
        where couple_id in (select my_couple_ids())
    )
);

-- Rules 4 & 5, by omission: NO update policy, NO delete policy.
-- Locked in means locked in — answers are immutable history.


-- ------------------------------------------------------------
-- 8) skip_requests — members of the round's couple negotiate
-- ------------------------------------------------------------

create policy skip_requests_select
on skip_requests for select
to authenticated
using (
    round_id in (
        select id from daily_rounds
        where couple_id in (select my_couple_ids())
    )
);

create policy skip_requests_insert
on skip_requests for insert
to authenticated
with check (
    requested_by = auth.uid()
    and round_id in (
        select id from daily_rounds
        where couple_id in (select my_couple_ids())
    )
);

-- Resolving (agree/decline) is an update by either member:
create policy skip_requests_update
on skip_requests for update
to authenticated
using (
    round_id in (
        select id from daily_rounds
        where couple_id in (select my_couple_ids())
    )
);


-- ------------------------------------------------------------
-- 9) Pairing functions — the "stored procedures"
-- ------------------------------------------------------------
-- Creating and joining couples can't be plain inserts: creating
-- requires writing couples + couple_members atomically, and
-- joining requires looking up a couple by invite code that you
-- are NOT yet a member of (so RLS would hide it). Both are
-- security definer functions: trusted, validated entry points.

create or replace function create_couple(p_display_name text)
returns table (couple_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
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

    insert into couple_members (couple_id, user_id)
    values (v_couple_id, auth.uid());

    return query select v_couple_id, v_code;
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

    select id into v_couple_id
    from couples
    where invite_code = upper(trim(p_invite_code));

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

    return v_couple_id;
end;
$$;

-- Lock the functions down: callable by signed-in users only.
revoke execute on function create_couple(text) from public, anon;
revoke execute on function join_couple(text, text) from public, anon;
grant execute on function create_couple(text) to authenticated;
grant execute on function join_couple(text, text) to authenticated;
grant execute on function my_couple_ids() to authenticated;
grant execute on function i_have_submitted(uuid) to authenticated;