-- supabase/functions.sql
--
-- CANONICAL CURRENT STATE of all public Postgres functions.
--
-- This file is the single source of truth for "what does this RPC actually do?"
-- It is kept in sync manually whenever a migration changes a function body.
-- Migrations are still the authoritative apply mechanism — this file is for
-- reading, not for running. If you fix a bug in a function, update it here too.
--
-- Functions listed:
--   1. insert_thing_with_steps    — insert thing + ordered steps atomically
--   2. mark_thing_done            — mark live step done, advance chain
--   3. record_step_event_done     — step-level done path (via /api/steps/[id]/event)
--   4. prepend_lookup_step        — prepend "Look up how to…" step on familiarity=no
--   5. insert_entity_with_care_plan — insert entity + care plan atomically
--   6. accept_invite              — accept invite and upgrade profile tier
--   7. report_care_group          — batch-process a care group report


-- ── 1. insert_thing_with_steps ───────────────────────────────────────────────
-- Last changed: migration 013 (fix step_order + live_step_id derivation)

create or replace function public.insert_thing_with_steps(
  p_user_id         uuid,
  p_name            text,
  p_class           text,
  p_domain          text,
  p_due_date        text,   -- ISO date string or null; obligations only
  p_notify_window   int,
  p_notify_time_of_day text,
  p_notify_escalate bool,
  p_source          text,
  p_steps           jsonb   -- array of step objects
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
    -- Use the caller-supplied step_order when present; fall back to the local counter
    -- so insertion order is the tie-breaker when the field is absent.
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


-- ── 2. mark_thing_done ───────────────────────────────────────────────────────
-- Last changed: migration 011 (fix step advancement to step_order > done_order)

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
-- Last changed: migration 011 (fix step advancement; clear started_at)

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


-- ── 4. prepend_lookup_step ───────────────────────────────────────────────────
-- Last changed: migration 006 (original)

create or replace function public.prepend_lookup_step(
  p_thing_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_thing record;
  v_live_step_name text;
  v_min_order int;
  v_new_step_id uuid;
begin
  select id, live_step_id into v_thing
  from things where id = p_thing_id and user_id = p_user_id;

  if not found then
    raise exception 'Thing not found';
  end if;

  select name into v_live_step_name
  from steps where id = v_thing.live_step_id;

  select coalesce(min(step_order), 0) - 1 into v_min_order
  from steps where thing_id = p_thing_id;

  insert into steps (thing_id, user_id, name, step_order, band, mode, shape, needs_know_how, done)
  values (
    p_thing_id, p_user_id,
    coalesce('Look up how to: ' || v_live_step_name, 'Look up how to do this'),
    v_min_order, 'short', 'thinking', 'clean', false, false
  )
  returning id into v_new_step_id;

  update things set live_step_id = v_new_step_id where id = p_thing_id;

  return jsonb_build_object('step_id', v_new_step_id);
end;
$$;


-- ── 5. insert_entity_with_care_plan ─────────────────────────────────────────
-- Last changed: migration 006 (original)

create or replace function public.insert_entity_with_care_plan(
  p_user_id uuid,
  p_name text,
  p_kind text,
  p_location text,
  p_action text,
  p_intervals jsonb,
  p_tolerance_days int,
  p_overdue_days int,
  p_next_due_at text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_plan_id uuid;
begin
  insert into entities (user_id, name, kind, location)
  values (p_user_id, p_name, p_kind, p_location)
  returning id into v_entity_id;

  insert into care_plans (entity_id, user_id, action, intervals, tolerance_days, overdue_days, next_due_at, source)
  values (v_entity_id, p_user_id, p_action, p_intervals, p_tolerance_days, p_overdue_days, p_next_due_at::date, 'generated')
  returning id into v_plan_id;

  return jsonb_build_object('entity_id', v_entity_id, 'plan_id', v_plan_id);
end;
$$;


-- ── 6. accept_invite ────────────────────────────────────────────────────────
-- Last changed: migration 006 (original)
-- SECURITY DEFINER: must bypass RLS to acquire FOR UPDATE lock on invites.

create or replace function public.accept_invite(
  p_user_id uuid,
  p_email text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite record;
  v_tier text;
begin
  select id, account_tier into v_invite
  from public.invites
  where lower(email) = lower(trim(p_email))
    and accepted_by is null
  for update;  -- row-level lock prevents concurrent acceptance

  if not found then
    return null;
  end if;

  update public.invites
  set accepted_by = p_user_id, accepted_at = now()
  where id = v_invite.id;

  v_tier := v_invite.account_tier;

  update public.profiles
  set account_tier = v_tier
  where id = p_user_id;

  return v_tier;
end;
$$;


-- ── 7. report_care_group ─────────────────────────────────────────────────────
-- Last changed: migration 006 (original)

create or replace function public.report_care_group(
  p_user_id uuid,
  p_plan_ids uuid[],
  p_done_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan record;
  v_done_month int;
  v_days int;
  v_next_due_at date;
  v_now timestamptz := now();
  v_today text := to_char(v_now, 'YYYY-MM-DD');
begin
  for v_plan in
    select id, intervals from care_plans
    where id = any(p_plan_ids) and user_id = p_user_id
  loop
    if v_plan.id = any(p_done_ids) then
      v_done_month := extract(month from v_now)::int;
      v_days := coalesce((v_plan.intervals->>(v_done_month::text))::int, 7);
      v_next_due_at := (v_now::date) + v_days;

      update care_plans
      set last_done_at = v_now, next_due_at = v_next_due_at
      where id = v_plan.id;

      insert into care_events (care_plan_id, user_id, type)
      values (v_plan.id, p_user_id, 'done');
    else
      insert into care_events (care_plan_id, user_id, type)
      values (v_plan.id, p_user_id, 'not_done');
    end if;
  end loop;

  update profiles set last_care_offer_date = v_today where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;
