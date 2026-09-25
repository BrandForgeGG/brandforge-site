// Task-board depth: due-date input validation + assignee roster shaping.
// The route logic itself needs Supabase, so the pure helpers it depends on live here and are
// unit-tested; the route imports normalizeTaskDueDate from lib/task-board.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTaskDueDate, shapeTaskRoster, summarizeTaskProgress } from './task-board.js';


describe('summarizeTaskProgress', () => {
  it('reports delivery state and completion percentage', () => {
    assert.deepEqual(summarizeTaskProgress([]), { total: 0, done: 0, inProgress: 0, review: 0, queued: 0, percent: 0 });
    assert.deepEqual(summarizeTaskProgress([
      { status: 'DONE' }, { status: 'DONE' }, { status: 'IN_PROGRESS' }, { status: 'REVIEW' }, {}
    ]), { total: 5, done: 2, inProgress: 1, review: 1, queued: 1, percent: 40 });
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
