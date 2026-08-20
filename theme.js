// --- Theme -------------------------------------------------------------------

export const STAGE_TOP = '#1c1140';
export const STAGE_BOTTOM = '#120b28';
export const RAISED = 'rgba(255,255,255,0.055)';
export const LINE = 'rgba(255,255,255,0.14)';
export const CHALK = '#f7f3ff';
export const DIM = '#a89dcf';
export const GOLD = '#ffc84a';
export const SELECT_GREEN = '#4ade80';
export const SELECT_GREEN_TINT = 'rgba(74,222,128,0.16)';
export const MISS_RED = '#ff5d73';
export const MISS_RED_SOFT = '#ff8fa0';

export const INSTAGRAM_USERNAME = 'brandonricey';

// Creator (first to join) gets slot 0, partner gets slot 1.
export const PLAYER_SLOTS = [
  { color: '#ff5d73', tint: 'rgba(255,93,115,0.18)' },
  { color: '#3fd8c7', tint: 'rgba(63,216,199,0.18)' },
];

// Wager scoring — display copy only. The MATH now happens server-side in
// submit_answer(); the reveal renders the points the database computed.
//   win  → wager × 10   (10 / 20 / 30)
//   miss → −(wager−1) × 10   (0 / −10 / −20) — a 1× call is the safe play
export const WAGER_BASE = 10;
export const wagerWin = (wager) => wager * WAGER_BASE;

// Skip request auto-resolves after this long with no partner response.
// Must match the product promise in the copy below. (Drop to 60000 — one
// minute — to test the auto-expire without waiting 6 hours.)
export const SKIP_TIMEOUT_MS = 6 * 60 * 60 * 1000;

// Must match c_prompt_count in start_todays_round / resolve_skip on Supabase.
export const EXPECTED_PROMPT_COUNT = 99;
