-- ============================================================
-- Duet — fix schema drift between the live database and the
-- app's actual game loop (rounds/submissions/skip_requests).
-- Run whole file in Supabase > SQL Editor.
--
-- What broke, and why:
--   1) submissions is missing the wager/called_it/points columns
--      entirely — only points_awarded (dead, unread by anything)
--      and bonus exist. submit_answer() inserts a "wager" value
--      and later updates "called_it"/"points" on every call; none
--      of those columns exist, so it fails immediately.
--   2) submissions.round_id and skip_requests.round_id still
--      have foreign keys pointing at "daily_rounds" — a table
--      left over from the original schema. The live game loop
--      (start_todays_round / submit_answer / request_skip) has
--      moved on to a new "rounds" table, but these two FKs were
--      never repointed. daily_rounds is never written to, so
--      every insert into submissions or skip_requests fails with
--      a foreign-key violation, unconditionally.
--   3) skip_requests is missing a "status" column entirely, even
--      though request_skip(), resolve_skip(), and the client all
--      read/write it.
--   4) "submissions_select" is a second, ungated RLS policy that
--      lets any couple member read any submission for their
--      couple's rounds at any time — including their partner's
--      answer before they've locked in their own. Postgres ORs
--      permissive policies together, so this silently defeats
--      the lock-gated "submissions_select_partner_after_lock"
--      policy that's supposed to be the only way in. Dropping it
--      restores the original "no peeking" guarantee.
-- ============================================================


-- ------------------------------------------------------------
-- 1) submissions: add the missing scoring columns
-- ------------------------------------------------------------

alter table submissions
    add column if not exists wager smallint,
    add column if not exists called_it boolean,
    add column if not exists points integer;

update submissions set wager = 1 where wager is null;

alter table submissions
    alter column wager set not null,
    alter column wager set default 1;

alter table submissions
    drop constraint if exists submissions_wager_check;

alter table submissions
    add constraint submissions_wager_check
    check (wager between 1 and 3);


-- ------------------------------------------------------------
-- 2) skip_requests: add the missing status column
-- ------------------------------------------------------------

alter table skip_requests
    add column if not exists status text;

update skip_requests
set status = coalesce(status, resolution, 'pending')
where status is null;

alter table skip_requests
    alter column status set not null,
    alter column status set default 'pending';

alter table skip_requests
    drop constraint if exists skip_requests_status_check;

alter table skip_requests
    add constraint skip_requests_status_check
    check (status in ('pending', 'agreed', 'declined', 'expired'));


-- ------------------------------------------------------------
-- 3) Repoint the FKs from the dead daily_rounds table to rounds
-- ------------------------------------------------------------

alter table submissions
    drop constraint if exists submissions_round_id_fkey;

alter table submissions
    add constraint submissions_round_id_fkey
    foreign key (round_id) references rounds(id);

alter table skip_requests
    drop constraint if exists skip_requests_round_id_fkey;

alter table skip_requests
    add constraint skip_requests_round_id_fkey
    foreign key (round_id) references rounds(id);


-- ------------------------------------------------------------
-- 4) Repoint the RLS policies that still check daily_rounds
--    instead of rounds (only matters for direct client access —
--    the RPCs are security definer and bypass RLS — but these
--    should still describe reality, and defense in depth matters
--    if that ever changes).
-- ------------------------------------------------------------

drop policy if exists submissions_insert on submissions;
create policy submissions_insert
on submissions for insert
to authenticated
with check (
    user_id = auth.uid()
    and round_id in (
        select id from rounds
        where couple_id in (select my_couple_ids())
    )
);

drop policy if exists skip_requests_insert on skip_requests;
create policy skip_requests_insert
on skip_requests for insert
to authenticated
with check (
    requested_by = auth.uid()
    and round_id in (
        select id from rounds
        where couple_id in (select my_couple_ids())
    )
);

drop policy if exists skip_requests_update on skip_requests;
create policy skip_requests_update
on skip_requests for update
to authenticated
using (
    round_id in (
        select id from rounds
        where couple_id in (select my_couple_ids())
    )
);


-- ------------------------------------------------------------
-- 5) Restore the "no peeking" guarantee: drop the ungated
--    submissions_select policy. submissions_select_own (always
--    your own row) and submissions_select_partner_after_lock
--    (partner's row, only once you've submitted) already cover
--    every legitimate read.
-- ------------------------------------------------------------

drop policy if exists submissions_select on submissions;


-- Verify: expect 0, 1, 3.
select
    (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'submissions'
       and policyname = 'submissions_select') as leftover_peek_policy,
    (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'skip_requests'
       and column_name = 'status') as status_column_present,
    (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'submissions'
       and column_name in ('wager', 'called_it', 'points')) as submissions_columns_present;
