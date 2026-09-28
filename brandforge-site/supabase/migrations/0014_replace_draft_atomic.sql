-- 0014: atomic AI draft replaces (fixes the replaceDraft* read-modify-write race).
--
-- lib/project-db.ts replaceDraftMilestones / replaceDraftTasks spread one replace
-- across several statements: read the current drafts, update the reusable ones,
-- insert the surplus, retire the rest. Two concurrent AI passes on the same
-- conversation could both read the pre-state and duplicate or clobber rows.
-- The functions below do the same work in one transaction behind a lock on the
-- conversation row, so concurrent replaces serialize instead of racing.
--
-- Faithful port of the JS behavior: same filters (milestones drop proposal rows,
-- tasks keep only unassigned TODOs), same pairing order (sequence for milestones,
-- created_at for tasks), same retire states ('cancelled' / 'DONE'), same reuse
-- loop. Two deliberate tightenings:
--   * task.milestone_sequence resolves against DRAFT milestones only
--     (proposal_id is null). The JS map read every milestone, so once a proposal
--     existed a sequence number could nondeterministically resolve to the
--     proposal row instead of the draft the AI had just written.
--   * all-or-nothing: a failing step raises and rolls the replace back instead
--     of logging and leaving half a replace behind.
--
-- security invoker: RLS still applies to whoever calls; server routes call as
-- the service role (bypasses RLS) exactly as before. Callers keep their own
-- read-back — these functions only write.

create or replace function public.replace_draft_milestones(
  p_conversation_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security invoker
as $$
declare
  v_new jsonb;
  v_rows int;
  v_existing uuid[] := '{}';
  v_count int;
  v_reusable int;
  v_id uuid;
  i int;
begin
  -- Same early exit as the JS: nothing cleaned, nothing written — and no lock
  -- is taken for a no-op. Sequence numbers are assigned after the title filter,
  -- exactly like the JS index+1, and pinned to input order via ordinality.
  with cleaned as (
    select row_number() over (order by e.ord) as seq,
           btrim(e.value ->> 'title', e' \t\n\r\f\v') as title,
           e.value ->> 'description' as description,
           (e.value ->> 'amount')::numeric as amount,
           (e.value ->> 'estimated_weeks')::int as estimated_weeks
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
         with ordinality as e(value, ord)
    where btrim(coalesce(e.value ->> 'title', ''), e' \t\n\r\f\v') <> ''
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.seq), '[]'::jsonb)
  into v_new
  from cleaned c;

  v_rows := jsonb_array_length(v_new);
  if v_rows = 0 then
    return;
  end if;

  -- Serialize replaces per conversation: a second pass waits here instead of
  -- reading the pre-state.
  perform 1 from conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'conversation % not found', p_conversation_id;
  end if;

  -- Existing drafts in the pairing order the JS used, locked for the same
  -- reason.
  for v_id in
    select m.id
    from milestones m
    where m.conversation_id = p_conversation_id
      and m.proposal_id is null
    order by m.sequence
    for update
  loop
    v_existing := array_append(v_existing, v_id);
  end loop;

  v_count := coalesce(array_length(v_existing, 1), 0);
  v_reusable := least(v_count, v_rows);

  -- 1) rewrite the first v_reusable drafts in place.
  for i in 1 .. v_reusable loop
    update milestones
    set sequence = (v_new -> (i - 1) ->> 'seq')::int,
        title = v_new -> (i - 1) ->> 'title',
        description = v_new -> (i - 1) ->> 'description',
        amount = (v_new -> (i - 1) ->> 'amount')::numeric,
        estimated_weeks = (v_new -> (i - 1) ->> 'estimated_weeks')::int,
        currency = 'EUR',
        status = 'pending'
    where id = v_existing[i];
  end loop;

  -- 2) insert the surplus as new drafts.
  insert into milestones
    (conversation_id, sequence, title, description, amount, estimated_weeks, currency, status)
  select p_conversation_id,
         (e.value ->> 'seq')::int,
         e.value ->> 'title',
         e.value ->> 'description',
         (e.value ->> 'amount')::numeric,
         (e.value ->> 'estimated_weeks')::int,
         'EUR',
         'pending'
  from jsonb_array_elements(v_new) as e(value)
  where (e.value ->> 'seq')::int > v_reusable;

  -- 3) retire leftover drafts (JS: status 'cancelled').
  for i in (v_reusable + 1) .. v_count loop
    update milestones set status = 'cancelled' where id = v_existing[i];
  end loop;
end;
$$;

create or replace function public.replace_draft_tasks(
  p_conversation_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security invoker
as $$
declare
  v_new jsonb;
  v_rows int;
  v_existing uuid[] := '{}';
  v_count int;
  v_reusable int;
  v_map jsonb;
  v_id uuid;
  i int;
  v_seq int;
begin
  with cleaned as (
    select row_number() over (order by e.ord) as seq,
           btrim(e.value ->> 'title', e' \t\n\r\f\v') as title,
           e.value ->> 'description' as description,
           e.value ->> 'assignee_name' as assignee_name,
           (e.value ->> 'milestone_sequence')::int as milestone_sequence
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
         with ordinality as e(value, ord)
    where btrim(coalesce(e.value ->> 'title', ''), e' \t\n\r\f\v') <> ''
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.seq), '[]'::jsonb)
  into v_new
  from cleaned c;

  v_rows := jsonb_array_length(v_new);
  if v_rows = 0 then
    return;
  end if;

  perform 1 from conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'conversation % not found', p_conversation_id;
  end if;

  -- Sequence -> draft milestone id. Drafts only (see header): the input's
  -- sequence numbers describe the draft set the AI just wrote.
  select coalesce(jsonb_object_agg(m.sequence, m.id), '{}'::jsonb)
  into v_map
  from milestones m
  where m.conversation_id = p_conversation_id
    and m.proposal_id is null
    and m.sequence is not null;

  -- Existing replaceable drafts: unassigned TODOs, paired in created_at order.
  for v_id in
    select t.id
    from tasks t
    where t.conversation_id = p_conversation_id
      and t.assignee_id is null
      and coalesce(t.status, 'TODO') = 'TODO'
    order by t.created_at
    for update
  loop
    v_existing := array_append(v_existing, v_id);
  end loop;

  v_count := coalesce(array_length(v_existing, 1), 0);
  v_reusable := least(v_count, v_rows);

  -- 1) rewrite the first v_reusable drafts in place.
  for i in 1 .. v_reusable loop
    v_seq := (v_new -> (i - 1) ->> 'milestone_sequence')::int;
    update tasks
    set title = v_new -> (i - 1) ->> 'title',
        description = v_new -> (i - 1) ->> 'description',
        assignee_name = v_new -> (i - 1) ->> 'assignee_name',
        milestone_id = case
          when v_seq is null then null
          else (v_map ->> v_seq::text)::uuid
        end,
        updated_at = now()
    where id = v_existing[i];
  end loop;

  -- 2) insert the surplus as new drafts.
  insert into tasks
    (conversation_id, title, description, assignee_name, milestone_id, status)
  select p_conversation_id,
         e.value ->> 'title',
         e.value ->> 'description',
         e.value ->> 'assignee_name',
         case
           when (e.value ->> 'milestone_sequence')::int is null then null
           else (v_map ->> ((e.value ->> 'milestone_sequence')::int)::text)::uuid
         end,
         'TODO'
  from jsonb_array_elements(v_new) as e(value)
  where (e.value ->> 'seq')::int > v_reusable;

  -- 3) retire leftover drafts (JS: status 'DONE').
  for i in (v_reusable + 1) .. v_count loop
    update tasks set status = 'DONE', updated_at = now() where id = v_existing[i];
  end loop;
end;
$$;

comment on function public.replace_draft_milestones(uuid, jsonb) is
  'Atomically replace a conversation''s AI-draft milestones (port of lib/project-db.replaceDraftMilestones; serializes concurrent AI passes).';
comment on function public.replace_draft_tasks(uuid, jsonb) is
  'Atomically replace a conversation''s AI-draft tasks (port of lib/project-db.replaceDraftTasks; serializes concurrent AI passes).';

-- Server-only: routes call these as the service role, same as before.
revoke execute on function public.replace_draft_milestones(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.replace_draft_tasks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_draft_milestones(uuid, jsonb) to service_role;
grant execute on function public.replace_draft_tasks(uuid, jsonb) to service_role;
