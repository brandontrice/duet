-- ============================================================
-- Duet — Phase 2 schema
-- Run in Supabase SQL editor (Postgres)
-- ============================================================

-- players (Supabase's built-in auth creates auth.users for us;
-- this table holds game-facing profile data keyed to it)
create table profiles (
    id uuid primary key references auth.users(id),
    display_name text not null,
    color_hex text not null default '#ff5d73',
    created_at timestamptz not null default now()
);

-- a couple is the core unit; invite_code is how partner 2 joins
create table couples (
    id uuid primary key default gen_random_uuid(),
    invite_code text not null unique,
    streak_count int not null default 0,
    streak_updated_on date null,
    created_at timestamptz not null default now()
);

-- two rows per couple
create table couple_members (
    couple_id uuid not null references couples(id),
    user_id uuid not null references profiles(id),
    joined_at timestamptz not null default now(),
    primary key (couple_id, user_id)
);

-- the prompt library moves out of App.js and into here
create table prompts (
    id int generated always as identity primary key,
    self_question text not null,
    partner_question text not null,
    reveal_question text not null,
    options jsonb not null,          -- ["Dishes","Laundry",...]
    spice_level text not null default 'sweet',
    active bit_varying null,          -- placeholder; see note below
    created_at timestamptz not null default now()
);

-- one row per couple per day: THE snapshot record you asked about
create table daily_rounds (
    id uuid primary key default gen_random_uuid(),
    couple_id uuid not null references couples(id),
    prompt_id int not null references prompts(id),
    round_date date not null,
    skip_count int not null default 0,
    revealed_at timestamptz null,
    constraint uq_round unique (couple_id, round_date)
);

-- one row per player per round: answers, predictions, points
create table submissions (
    id uuid primary key default gen_random_uuid(),
    round_id uuid not null references daily_rounds(id),
    user_id uuid not null references profiles(id),
    answer text not null,
    prediction text not null,
    points_awarded int not null default 0,
    submitted_at timestamptz not null default now(),
    constraint uq_submission unique (round_id, user_id)
);

-- skip negotiations, so history shows them too
create table skip_requests (
    id uuid primary key default gen_random_uuid(),
    round_id uuid not null references daily_rounds(id),
    requested_by uuid not null references profiles(id),
    requested_at timestamptz not null default now(),
    resolved_at timestamptz null,
    resolution text null    -- 'agreed' / 'declined' / 'auto'
);