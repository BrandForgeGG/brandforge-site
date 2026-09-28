// Task-board depth: due-date input validation + assignee roster shaping.
// The route logic itself needs Supabase, so the pure helpers it depends on live here and are
// unit-tested; the route imports normalizeTaskDueDate from lib/task-board.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectPulse, getNextDeliveryTask, describeAgreementStatus, describeNextDeliveryAction, describePaymentStatus, describeProposalStatus, isTaskOverdue, normalizeTaskDueDate, shapeTaskRoster, summarizeTaskProgress } from './task-board.js';

describe('isTaskOverdue', () => {
  it('marks unfinished past-due tasks but never completed tasks', () => {
    const now = new Date('2026-09-25T12:00:00Z');
    assert.equal(isTaskOverdue({ status: 'IN_PROGRESS', dueDate: '2026-09-24T00:00:00.000Z' }, now), true);
    assert.equal(isTaskOverdue({ status: 'DONE', dueDate: '2026-09-24T00:00:00.000Z' }, now), false);
    assert.equal(isTaskOverdue({ status: 'TODO', dueDate: '2026-09-25T00:00:00.000Z' }, now), false);
  });
});

describe('getNextDeliveryTask', () => {
  it('prioritizes review, then active work, then queued work', () => {
    const queued = { id: 'queued', status: 'TODO' };
    const review = { id: 'review', status: 'REVIEW' };
    assert.equal(getNextDeliveryTask([queued, review])?.id, 'review');
    assert.equal(getNextDeliveryTask([queued, { id: 'done', status: 'DONE' }])?.id, 'queued');
    assert.equal(getNextDeliveryTask([{ id: 'done', status: 'DONE' }]), null);
  });
});

describe('describeNextDeliveryAction', () => {
  it('turns persisted task priority into a clear next action', () => {
    assert.equal(describeNextDeliveryAction([{ status: 'TODO', title: 'Build the landing page' }]), 'Next: start Build the landing page · unassigned.');
    assert.equal(describeNextDeliveryAction([{ status: 'REVIEW', title: 'Approve the prototype', assigneeName: 'Ada' }]), 'Next: review Approve the prototype · Ada.');
    assert.equal(describeNextDeliveryAction([{ status: 'DONE', title: 'Ship it' }]), 'No delivery tasks are planned yet.');
  });
});

describe('describeAgreementStatus', () => {
  it('turns agreement state into a clear founder next step', () => {
    assert.match(describeAgreementStatus('pending_funding'), /Awaiting funding/);
    assert.match(describeAgreementStatus('active'), /In delivery/);
    assert.equal(describeAgreementStatus('unknown'), 'Agreement status unavailable.');
  });
});


describe('describePaymentStatus', () => {
  it('turns persisted payment state into a clear next step', () => {
    assert.match(describePaymentStatus('pending'), /Verifying/);
    assert.match(describePaymentStatus('paid'), /Held by BrandForge/);
    assert.equal(describePaymentStatus('unknown'), 'Payment status unavailable');
  });
describe('buildProjectPulse', () => {
  it('keeps the panel focused on five decision-critical items', () => {
    const pulse = buildProjectPulse({
      state: { status: 'ACTIVE', openQuestions: [{ id: 'q1' }, { id: 'q2' }] },
      tasks: [{ status: 'REVIEW', title: 'Approve copy' }],
      proposal: { status: 'pending' },
      agreement: { status: 'pending_funding' },
    });
    assert.deepEqual(pulse.map((item) => item.key), ['status', 'next', 'proposal', 'funding', 'questions']);
  });
});


});



describe('describeProposalStatus', () => {
  it('turns proposal states into founder-readable next steps', () => {
    assert.match(describeProposalStatus('pending'), /Awaiting your decision/);
    assert.match(describeProposalStatus('changes_requested'), /revising/);
    assert.match(describeProposalStatus('countered'), /Countered/);
    assert.match(describeProposalStatus('counter_back'), /final decision/);
    assert.equal(describeProposalStatus('unknown'), 'Proposal status unavailable.');
  });
});

describe('buildProjectPulse counter round', () => {
  it('points the founder at the outstanding counter-back', () => {
    const pulse = buildProjectPulse({
      state: { status: 'PROPOSED' },
      tasks: [],
      proposal: { status: 'counter_back' },
      agreement: null,
    });
    const proposalItem = pulse.find((item) => item.key === 'proposal');
    assert.match(proposalItem.value, /Answer the counter offer/);
  });
});



describe('summarizeTaskProgress', () => {
  it('reports delivery state and completion percentage', () => {
    assert.deepEqual(summarizeTaskProgress([]), { total: 0, done: 0, inProgress: 0, review: 0, queued: 0, overdue: 0, percent: 0 });
    assert.deepEqual(summarizeTaskProgress([
      { status: 'DONE' }, { status: 'DONE' }, { status: 'IN_PROGRESS' }, { status: 'REVIEW' }, {}
    ]), { total: 5, done: 2, inProgress: 1, review: 1, queued: 1, overdue: 0, percent: 40 });
  });
});

describe('normalizeTaskDueDate', () => {
  it('clears the date on null/undefined/empty', () => {
    assert.deepEqual(normalizeTaskDueDate(null), { ok: true, iso: null });
    assert.deepEqual(normalizeTaskDueDate(undefined), { ok: true, iso: null });
    assert.deepEqual(normalizeTaskDueDate(''), { ok: true, iso: null });
  });

  it('accepts YYYY-MM-DD and stores midnight UTC', () => {
    assert.deepEqual(normalizeTaskDueDate('2026-10-01'), { ok: true, iso: '2026-10-01T00:00:00.000Z' });
  });

  it('rejects wrong shapes and impossible dates', () => {
    assert.deepEqual(normalizeTaskDueDate('01-10-2026').ok, false);
    assert.deepEqual(normalizeTaskDueDate('2026-10-01T00:00:00Z').ok, false);
    assert.deepEqual(normalizeTaskDueDate('2026-13-40').ok, false);
    assert.deepEqual(normalizeTaskDueDate(20261001).ok, false);
    assert.deepEqual(normalizeTaskDueDate('next friday').ok, false);
  });
});

describe('shapeTaskRoster', () => {
  it('keeps only rows with a user id and fills display fallbacks', () => {
    const roster = shapeTaskRoster([
      { user_id: 'u1', display_name: '  Ada  ', role: 'operator' },
      { user_id: 'u2', display_name: '', role: 'founder' },
      { user_id: '', display_name: 'Ghost', role: 'observer' },
      { user_id: null, display_name: 'Nobody', role: 'builder' },
    ]);

    assert.deepEqual(roster, [
      { userId: 'u1', displayName: 'Ada', role: 'operator' },
      { userId: 'u2', displayName: 'Founder', role: 'founder' },
    ]);
  });

  it('returns an empty roster for missing input', () => {
    assert.deepEqual(shapeTaskRoster(undefined), []);
    assert.deepEqual(shapeTaskRoster(null), []);
  });
});
