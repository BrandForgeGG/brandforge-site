'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { processJob, jobOutcome, JOBS_MAX_ATTEMPTS } = require('./jobs.js');

test('processJob returns ok for known types', () => {
  assert.deepEqual(processJob({ type: 'quick_win' }), { ok: true });
  assert.deepEqual(processJob({ type: 'nurture' }), { ok: true });
});

test('processJob returns terminal error for unknown types', () => {
  const result = processJob({ type: 'unknown_type' });
  assert.equal(result.ok, false);
  assert.equal(result.terminal, true);
  assert.ok(result.error.includes('unknown_type'));
});

test('jobOutcome returns completed for successful jobs', () => {
  const result = jobOutcome({ id: '1' }, { ok: true }, 1);
  assert.equal(result.status, 'completed');
  assert.equal(result.errorText, null);
});

test('jobOutcome returns failed for terminal errors', () => {
  const result = jobOutcome({ id: '1' }, { ok: false, terminal: true, error: 'bad' }, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorText, 'bad');
});

test('jobOutcome returns failed after max attempts', () => {
  const result = jobOutcome({ id: '1' }, { ok: false, error: 'timeout' }, JOBS_MAX_ATTEMPTS);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorText, 'timeout');
});

test('jobOutcome returns pending for retryable errors under max attempts', () => {
  const result = jobOutcome({ id: '1' }, { ok: false, error: 'timeout' }, 1);
  assert.equal(result.status, 'pending');
  assert.equal(result.errorText, 'timeout');
});
