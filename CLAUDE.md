@AGENTS.md

# Duet

Daily couples quiz game. Expo/React Native client (`App.js`, currently one file) talking to Supabase (Postgres + Auth + Realtime) via `lib/supabase.js`. No backend server of its own — game logic (round selection, scoring, skip negotiation) lives in Postgres functions (RPCs) called with `supabase.rpc(...)`.

## SQL style

Convention is set by `sql/01_schema.sql`'s own header. Follow it in every file under `sql/`:

- **Keywords lowercase, always** — `select`, `from`, `where`, `create table`, `create or replace function`, `security definer`, etc. Never `SELECT`/`Select`.
- **Identifiers keep whatever case they were created with.** Table and column names here are lowercase snake_case (`couple_id`, `daily_rounds`) — don't invent camelCase or quote-forced mixed case.
- **Migrations are numbered, standalone files**: `sql/NN_description.sql` (`01_schema.sql`, `02_seed_prompts.sql`, ...). The next one is `05_...`.
  - Each file opens with a header comment block stating what the file does and that you run the whole file in Supabase → SQL Editor.
  - Each file is complete, runnable SQL on its own — not a diff/patch. If you're changing an existing table or function, write the full `create or replace function ...` / `alter table ...` statements needed, not `-- change X to Y`.
- Comment the *why*, not the *what* — see the existing files for the tone (e.g. the RLS recursion-trap explanation in `03_rls_policies.sql`).

## Migration history

- `01_schema.sql` / `02_seed_prompts.sql` / `03_rls_policies.sql` — the original schema, since superseded in several places (e.g. `daily_rounds` was replaced by `rounds`).
- `04_realtime.sql` — realtime publication membership.
- `05_fix_schema_drift.sql` — fixes bugs found by diffing the live database (via `supabase db dump`) against what the app actually calls: missing `submissions.wager/called_it/points` columns, missing `skip_requests.status`, FKs on `submissions`/`skip_requests` pointing at the dead `daily_rounds` table instead of `rounds`, and an ungated `submissions_select` RLS policy that broke the "no peeking at your partner's answer" guarantee.
- `06_v2_game_loop.sql` — the rest of the "v2" schema that was live but never committed: the `rounds` table itself, `couple_state`/`couple_dates`/`custom_prompts`/`invite_codes`/`reactions`/`week_results`, the `round_progress` view, and every RPC function (`start_todays_round`, `submit_answer`, `request_skip`, `resolve_skip`, `get_scoreboard`, `get_achievements`, `get_month_rewind`, `create_couple`/`join_couple`/`generate_invite_code` in their current form).
- `07_get_round_state.sql` — `get_round_state()`, a single RPC that replaces `loadRound()`'s five sequential Supabase calls with one round trip (round + custom prompt + who's submitted + submissions-if-revealed + latest skip request).
- `08_push_notifications.sql` — `push_tokens` table, `notify_user()` (fire-and-forget push via Expo's push API over `pg_net`), and the three trigger points wired into `submit_answer`/`request_skip`/`resolve_skip`: partner answered first, partner wants to skip, skip was declined. Client-side registration is `lib/pushNotifications.js`, called once the user is paired.

Run 04 → 08 in order in Supabase's SQL Editor to bring a fresh or drifted project up to what's actually live. All are idempotent — safe to re-run.

Known-dead, low-priority cleanup candidates (not yet acted on): the `daily_rounds` and `prompts` tables are fully unused by any current code path; `couples.streak_count`/`streak_updated_on` are superseded by `couple_state`; `submissions.points_awarded` is superseded by `submissions.points`.
