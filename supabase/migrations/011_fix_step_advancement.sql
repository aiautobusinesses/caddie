-- Migration 011: fix step advancement and clear started_at on record_step_event_done.
--
-- Bug A: mark_thing_done and record_step_event_done both advanced to the next undone
-- step by step_order asc without constraining to steps *after* the completed step.
-- With nudge-forward or prepended lookup steps the "next lowest undone" could be an
-- earlier step, sending the user backwards. Fixed: next step must have
-- step_order > completed step's order.
--
-- Bug B: record_step_event_done did not clear started_at on the thing. mark_thing_done
-- did. Two paths to "step is done" with different side-effects: arriving via
-- /api/steps/[id]/event left the thing permanently in-progress, blanking the entire
-- offer (computeOffer returns early on any in-progress thing). Fixed: also clear
-- started_at in record_step_event_done.

-- ── 2. mark_thing_done ───────────────────────────────────────────────────────

create or replace function public.mark_thing_done(
  p_thing_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_thing         record;
  v_done_order    int;
  v_next_step_id  uuid;
  v_thing_complete bool;
begin
  select id, name, live_step_id into v_thing
  from things where id = p_thing_id and user_id = p_user_id;

  if not found then
    raise exception 'Thing not found';
  end if;

  if v_thing.live_step_id is not null then
    -- Capture the completed step's order before marking it done.
    select step_order into v_done_order
    from steps where id = v_thing.live_step_id;

    update steps set done = true, done_at = now()
    where id = v_thing.live_step_id;

    -- Advance to the next undone step strictly after the completed step's order.
    select id into v_next_step_id
    from steps
    where thing_id = p_thing_id
      and done = false
      and id != v_thing.live_step_id
      and step_order > v_done_order
    order by step_order asc
    limit 1;

    v_thing_complete := v_next_step_id is null;

    update things set live_step_id = v_next_step_id, started_at = null
    where id = p_thing_id;

    insert into step_events (step_id, thing_id, user_id, event_type, metadata)
    values (v_thing.live_step_id, p_thing_id, p_user_id, 'done', '{"source":"thing_done"}'::jsonb);
  else
    v_thing_complete := false;
    update things set started_at = null where id = p_thing_id and user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'thing_complete', v_thing_complete,
    'thing_name', case when v_thing_complete then v_thing.name else null end
  );
end;
$$;

-- ── 3. record_step_event_done ────────────────────────────────────────────────

create or replace function public.record_step_event_done(
  p_step_id  uuid,
  p_user_id  uuid,
  p_metadata jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_step          record;
  v_done_order    int;
  v_next_step_id  uuid;
begin
  select id, thing_id, step_order into v_step
  from steps where id = p_step_id and user_id = p_user_id;

  if not found then
    raise exception 'Step not found';
  end if;

  v_done_order := v_step.step_order;

  insert into step_events (step_id, thing_id, user_id, event_type, metadata)
  values (p_step_id, v_step.thing_id, p_user_id, 'done', p_metadata);

  update steps set done = true, done_at = now()
  where id = p_step_id;

  -- Advance to the next undone step strictly after the completed step's order.
  select id into v_next_step_id
  from steps
  where thing_id = v_step.thing_id
    and done = false
    and id != p_step_id
    and step_order > v_done_order
  order by step_order asc
  limit 1;

  -- Clear started_at so the thing is no longer flagged as in-progress.
  update things
  set live_step_id = v_next_step_id, started_at = null
  where id = v_step.thing_id;

  return jsonb_build_object('ok', true);
end;
$$;
