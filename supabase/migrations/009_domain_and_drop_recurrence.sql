-- Migration 009: add domain + due_date to things; drop recurrence columns from steps.
--
-- Safety check: assert no rows have a non-null recurrence_rule before dropping.
-- This is a single-author app in early development; all data is test data.
-- If this assertion fails, inspect the rows and migrate them to entities/care_plans first.
do $$
begin
  if exists (select 1 from steps where recurrence_rule is not null) then
    raise exception
      'Migration 009 blocked: steps rows with non-null recurrence_rule exist. '
      'Migrate them to entities/care_plans before re-running this migration.';
  end if;
end
$$;

-- Add domain (coarse LLM-assigned category — nullable, no enum, intentionally evolvable).
alter table things add column if not exists domain text;

-- Add due_date (obligations only — the single date something is due; not recurrence).
alter table things add column if not exists due_date date;

-- Drop the index that covered the now-removed next_due column.
drop index if exists steps_user_next_due;

-- Remove the columns that the design has decided belong on care_plans, not steps.
alter table steps
  drop column if exists recurrence_rule,
  drop column if exists next_due,
  drop column if exists last_done_at;
