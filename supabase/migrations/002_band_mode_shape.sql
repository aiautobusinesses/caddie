-- Migration 002: replace estimated_minutes/ends_cleanly with band/mode/shape enums.
-- Also extends event_type with offered/accepted/skipped/nudged_back/nudged_forward.
-- Safe to run against existing data — old columns dropped, new columns added with defaults.

-- ── New enums ────────────────────────────────────────────────────────────────

create type step_band  as enum ('short', 'sitting', 'run');
create type step_mode  as enum ('thinking', 'doing');
create type step_shape as enum ('clean', 'bleeds');

-- ── Extend event_type ────────────────────────────────────────────────────────
-- Postgres does not support removing enum values; we recreate the type.

alter type event_type rename to event_type_old;

create type event_type as enum (
  'done',
  'edited',
  'notified',
  'offered',
  'accepted',
  'skipped',
  'nudged_back',
  'nudged_forward'
);

alter table step_events
  alter column event_type type event_type
  using event_type::text::event_type;

drop type event_type_old;

-- ── Replace steps columns ────────────────────────────────────────────────────

alter table steps
  drop column if exists estimated_minutes,
  drop column if exists ends_cleanly;

alter table steps
  add column band  step_band  not null default 'sitting',
  add column mode  step_mode  not null default 'doing',
  add column shape step_shape not null default 'clean';

-- ── Add started_at to things (was missing from migration 001) ────────────────

alter table things
  add column if not exists started_at timestamptz;
