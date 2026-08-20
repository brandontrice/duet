-- ============================================================
-- Duet — realtime publication membership
-- Run whole file in Supabase > SQL Editor.
--
-- Every table the client subscribes to via postgres_changes must
-- be added to the supabase_realtime publication, or the listener
-- silently receives nothing. This mirrors what's actually enabled
-- live: couple_members (partner-joined), rounds (reveal/status
-- flips), skip_requests (skip negotiation), submissions (partner
-- locked in), plus reactions for the (unshipped) reactions
-- feature already present in the schema.
-- ============================================================

do $$
declare
    t text;
begin
    foreach t in array array['couple_members', 'rounds', 'skip_requests', 'submissions', 'reactions']
    loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table %I', t);
        end if;
    end loop;
end $$;
