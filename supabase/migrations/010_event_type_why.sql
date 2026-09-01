-- Migration 010: add 'why' to event_type enum; add targeted indexes for offer counts.
--
-- 'why' is a real event type (user explains why they are or aren't starting something).
-- It was stored as event_type='edited' with metadata {kind:'why'}, but that collapses
-- all edits/stops/why events into one value, breaking nudgeBackCounts.
--
-- Postgres ALTER TYPE ... ADD VALUE is transactional in PG >= 12.
alter type event_type add value if not exists 'why';

-- Targeted indexes for the two offer-time count queries (completionCount + nudgeBackCounts).
-- Both replace the previous full-table scan of step_events.
create index if not exists step_events_user_done
  on step_events (user_id) where event_type = 'done';

create index if not exists step_events_user_nudged_back
  on step_events (user_id, thing_id) where event_type = 'nudged_back';
