const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DISCOVERY_THRESHOLD,
  computeDiscovery,
  isDiscoveryComplete,
} = require('./discovery.js');

function requirement(overrides = {}) {
  return {
    title: 'Football match discovery',
    category: 'feature',
    status: 'captured',
    ...overrides,
  };
}

test('computeDiscovery reports zero progress for an empty conversation', () => {
  const result = computeDiscovery(null, []);

  assert.equal(result.completeness, 0);
  assert.equal(result.percent, 0);
  assert.equal(result.checklist.length, 7);
  assert.deepEqual(result.missing, [
    'Project name',
    'Problem statement',
    'Target users',
    'Platforms',
    'At least 3 requirements',
    'Timeline estimate',
    'Budget estimate',
  ]);
});

test('computeDiscovery weights each captured pillar of discovery', () => {
  const result = computeDiscovery(
    { project_name: 'Football App', problem_statement: 'Find games nearby' },
    []
  );

  assert.equal(result.percent, 25);
  assert.equal(result.missing.length, 5);
});

test('computeDiscovery ignores blank array entries', () => {
  const result = computeDiscovery(
    { target_users: ['  ', ''], platforms: [] },
    []
  );

  assert.equal(result.checklist.find((step) => step.key === 'target_users')?.met, false);
  assert.equal(result.checklist.find((step) => step.key === 'platforms')?.met, false);
});

test('computeDiscovery reaches a complete discovery from persisted state', () => {
  const result = computeDiscovery(
    {
      project_name: 'Football App',
      problem_statement: 'Players cannot find nearby games',
      target_users: ['Casual players'],
      platforms: ['iOS', 'Android'],
      estimated_weeks_min: 4,
      estimated_weeks_max: 6,
      estimated_cost_min: 2000,
      estimated_cost_max: 4000,
    },
    [requirement(), requirement({ title: 'Create a match' }), requirement({ title: 'Join a match' })]
  );

  assert.equal(result.completeness, 1);
  assert.equal(result.percent, 100);
  assert.deepEqual(result.missing, []);
});

test('computeDiscovery excludes open questions and rejected requirements from the requirement count', () => {
  const result = computeDiscovery(
    {},
    [
      requirement({ title: 'Create a match' }),
      requirement({ title: 'Join a match' }),
      requirement({ title: 'Chat inside the app' }),
      requirement({ title: 'Which payment provider?', category: 'open_question', status: 'open' }),
      requirement({ title: 'Blockchain scoring', status: 'rejected' }),
    ]
  );

  assert.equal(result.requirementsCount, 3);
  assert.equal(result.openQuestionsCount, 1);
  assert.equal(result.checklist.find((step) => step.key === 'requirements')?.met, true);
});

test('resolved open questions no longer count as open', () => {
  const result = computeDiscovery(
    {},
    [requirement({ title: 'Which payment provider?', category: 'open_question', status: 'resolved' })]
  );

  assert.equal(result.openQuestionsCount, 0);
});

test('isDiscoveryComplete uses the shared threshold', () => {
  assert.equal(DISCOVERY_THRESHOLD, 0.7);
  assert.equal(isDiscoveryComplete(0.69), false);
  assert.equal(isDiscoveryComplete(0.7), true);
  assert.equal(isDiscoveryComplete(undefined), false);
});
