const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeApprovalStatus,
  buildApprovalSummary,
  upsertApproval,
} = require('./workflow-utils.js');

test('normalizeApprovalStatus accepts project approval states and defaults safely', () => {
  assert.equal(normalizeApprovalStatus('approved'), 'APPROVED');
  assert.equal(normalizeApprovalStatus('changes_requested'), 'CHANGES_REQUESTED');
  assert.equal(normalizeApprovalStatus('mystery-state'), 'PENDING');
});

test('buildApprovalSummary counts approval states accurately', () => {
  const summary = buildApprovalSummary([
    { status: 'APPROVED' },
    { status: 'APPROVED' },
    { status: 'CHANGES_REQUESTED' },
    { status: 'PENDING' },
  ]);

  assert.deepEqual(summary, {
    total: 4,
    approved: 2,
    pending: 1,
    changesRequested: 1,
  });
});

test('upsertApproval replaces the matching project milestone record and preserves others', () => {
  const current = [
    { projectId: 'proj-1', milestone: 'Alpha', status: 'PENDING' },
    { projectId: 'proj-2', milestone: 'Beta', status: 'APPROVED' },
  ];

  const next = upsertApproval(current, {
    projectId: 'proj-1',
    milestone: 'Alpha',
    status: 'APPROVED',
    owner: 'Alicia',
    updatedAt: 'Now',
    comment: 'Approved for next sprint.',
  });

  assert.equal(next.length, 2);
  assert.equal(next[0].status, 'APPROVED');
  assert.equal(next[1].status, 'APPROVED');
});
