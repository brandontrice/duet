-- ============================================================
-- Duet — get_round_state: one round trip instead of five.
-- Run whole file in Supabase > SQL Editor.
--
-- loadRound() in the client currently calls start_todays_round(),
-- then separately fetches the custom prompt, who's submitted
-- (round_progress), the full submissions (once revealed), and the
-- latest skip request — up to five sequential requests on every
-- load, foreground, and realtime tick. This wraps all of it in
-- one security definer function returning a single JSON payload.
--
-- Peek safety: this bypasses RLS (security definer), so the gate
-- that used to come from submissions_select_partner_after_lock is
-- reproduced explicitly here — full submission rows are only
-- included once the round's own status is 'revealed' (which only
-- happens after both partners have submitted), and the
-- "who's submitted" list only ever exposes user_id, never the
-- answer/prediction.
-- ============================================================

create or replace function get_round_state(p_today date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_round rounds;
begin
    v_round := start_todays_round(p_today);

    return json_build_object(
        'round', row_to_json(v_round),
        'custom_prompt', (
            select json_build_object(
                'id', cp.id,
                'question', cp.question,
                'options', cp.options,
                'author_id', cp.author_id
            )
            from custom_prompts cp
            where cp.id = v_round.custom_prompt_id
        ),
        'submitted_user_ids', (
            select coalesce(json_agg(s.user_id), '[]'::json)
            from submissions s
            where s.round_id = v_round.id
        ),
        'submissions', (
            case when v_round.status = 'revealed' then (
                select coalesce(json_agg(json_build_object(
                    'user_id', s.user_id,
                    'answer', s.answer,
                    'prediction', s.prediction,
                    'wager', s.wager,
                    'called_it', s.called_it,
                    'points', s.points
                )), '[]'::json)
                from submissions s
                where s.round_id = v_round.id
            ) else null end
        ),
        'latest_skip_request', (
            select json_build_object(
                'id', sr.id,
                'requested_by', sr.requested_by,
                'status', sr.status,
                'requested_at', sr.requested_at
            )
            from skip_requests sr
            where sr.round_id = v_round.id
            order by sr.requested_at desc
            limit 1
        )
    );
end;
$$;

grant execute on function get_round_state(date) to anon, authenticated, service_role;
