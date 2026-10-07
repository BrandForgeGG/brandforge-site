'use strict';

// Jobs worker (master brief section 8) — scheduled background work.
//
// The jobs table (migration 0026) stores async tasks: quick wins, nurture
// sequences, and other deferred work. This module contains the pure decision
// logic (processJob) so it can be testable with node --test. The service-role
// queue work lives in lib/project-db.ts (H7 boundary).

const JOBS_MAX_ATTEMPTS = 3;

/**
 * Process a single job row. Returns { ok, terminal?, error? }.
 * Extend this function when new job types are added.
 */
function processJob(row) {
  switch (row.type) {
    case 'quick_win':
      return { ok: true };
    case 'nurture':
      return { ok: true };
    default:
      return { ok: false, terminal: true, error: `Unknown job type: ${row.type}` };
  }
}

/**
 * Determine the next status for a job after an attempt.
 * Returns { status, errorText }.
 */
function jobOutcome(row, outcome, attempts) {
  const errorText = outcome.ok ? null : String(outcome.error ?? 'job failed').slice(0, 500);

  if (outcome.ok) {
    return { status: 'completed', errorText: null };
  }
  if (outcome.terminal || attempts >= JOBS_MAX_ATTEMPTS) {
    return { status: 'failed', errorText };
  }
  return { status: 'pending', errorText };
}

module.exports = {
  JOBS_MAX_ATTEMPTS,
  processJob,
  jobOutcome,
};
