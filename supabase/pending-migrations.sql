-- Pending migrations for production: 009 → 013
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: all DDL uses IF NOT EXISTS / CREATE OR REPLACE.

-- ── 009: add domain + due_date to things; drop stale recurrence cols ──────────

alter table things add column if not exists domain text;
alter table things add column if not exists due_date date;

drop index if exists steps_user_next_due;

alter table steps
  drop column if exists recurrence_rule,
  drop column if exists next_due,
  drop column if exists last_done_at;

-- ── 010: add 'why' event type; targeted indexes for offer counts ──────────────

alter type event_type add value if not exists 'why';

create index if not exists step_events_user_done
  on step_events (user_id) where event_type = 'done';

create index if not exists step_events_user_nudged_back
  on step_events (user_id, thing_id) where event_type = 'nudged_back';

-- ── 011: fix step advancement + clear started_at on record_step_event_done ────

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

  select id into v_next_step_id
  from steps
  where thing_id = v_step.thing_id
    and done = false
    and id != p_step_id
    and step_order > v_done_order
  order by step_order asc
  limit 1;

  update things
  set live_step_id = v_next_step_id, started_at = null
  where id = v_step.thing_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── 012: add stop_note event type ────────────────────────────────────────────

alter type event_type add value if not exists 'stop_note';

-- ── 013: fix insert_thing_with_steps — respect caller-supplied step_order ─────

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

  select id into v_first_step_id
  from steps
  where thing_id = v_thing_id
  order by step_order asc
  limit 1;

  update things set live_step_id = v_first_step_id where id = v_thing_id;
  return v_thing_id;
end;
$$;
