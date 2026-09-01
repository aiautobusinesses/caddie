-- Migration 013: fix insert_thing_with_steps — respect caller-supplied step_order.
--
-- Bug: the function used a local counter (v_step_order = 0,1,2…) as the DB step_order
-- rather than reading the step_order field from each JSON element. The two coincided
-- only because the caller always passes steps in order. Under any reordering the chain
-- would be stored incorrectly.
--
-- Fix:
--   1. Use coalesce((v_step.value->>'step_order')::int, v_step_order) so the caller's
--      value is preferred and the counter is a fallback.
--   2. Derive live_step_id with a post-loop SELECT min(step_order) query instead of
--      capturing the first inserted row — the array traversal order no longer determines
--      which step is first.

create or replace function public.insert_thing_with_steps(
  p_user_id         uuid,
  p_name            text,
  p_class           text,
  p_domain          text,
  p_due_date        text,
  p_notify_window   int,
  p_notify_time_of_day text,
  p_notify_escalate bool,
  p_source          text,
  p_steps           jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_thing_id      uuid;
  v_step          record;
  v_step_id       uuid;
  v_first_step_id uuid;
  v_step_order    int := 0;
begin
  insert into things (user_id, name, class, domain, due_date, notify_window, notify_time_of_day, notify_escalate, source)
  values (
    p_user_id, p_name, p_class::thing_class, p_domain,
    case when p_due_date is not null and p_due_date != 'null' then p_due_date::date else null end,
    p_notify_window, p_notify_time_of_day::notify_time_of_day, p_notify_escalate, p_source::task_source
  )
  returning id into v_thing_id;

  for v_step in select * from jsonb_array_elements(p_steps)
  loop
    insert into steps (thing_id, user_id, name, step_order, band, mode, shape, needs_know_how, done)
    values (
      v_thing_id, p_user_id,
      (v_step.value->>'name'),
      coalesce((v_step.value->>'step_order')::int, v_step_order),
      coalesce(v_step.value->>'band', 'sitting')::step_band,
      coalesce(v_step.value->>'mode', 'doing')::step_mode,
      coalesce(v_step.value->>'shape', 'clean')::step_shape,
      coalesce((v_step.value->>'needs_know_how')::bool, false),
      false
    )
    returning id into v_step_id;

    v_step_order := v_step_order + 1;
  end loop;

  -- Pick the step with the lowest step_order as the live step — correct regardless
  -- of JSON array traversal order.
  select id into v_first_step_id
  from steps
  where thing_id = v_thing_id
  order by step_order asc
  limit 1;

  update things set live_step_id = v_first_step_id where id = v_thing_id;
  return v_thing_id;
end;
$$;
