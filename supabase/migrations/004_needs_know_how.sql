-- Migration 004: add needs_know_how to steps.
-- Flags steps that require domain knowledge a non-expert might not have.
-- Used at accept-time to fire a familiarity question before the focus screen.

alter table steps
  add column if not exists needs_know_how bool not null default false;
