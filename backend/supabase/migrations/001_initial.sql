-- Rounds table: one row per game round
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  round_number integer not null unique,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  winner_zone text,
  total_classified_txns integer default 0
);

create index if not exists idx_rounds_round_number on rounds(round_number);

-- Per-zone stats for each round (one row per zone per round)
create table if not exists round_zone_stats (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  zone_id text not null,
  tx_count integer default 0,
  volume numeric default 0,
  multiplier numeric not null default 1.0,
  weighted_score numeric default 0,
  unique(round_id, zone_id)
);

create index if not exists idx_round_zone_stats_round_id on round_zone_stats(round_id);
