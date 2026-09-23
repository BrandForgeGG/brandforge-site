import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProjectRecord } from './brandforge-data.ts';

test('buildProjectRecord builds a DRAFT project from title and client', () => {
  const project = buildProjectRecord({
    title: 'Atlas rebrand',
    client: 'Maya Chen',
    budget: '$9,000',
    timeline: '6 weeks',
    description: 'Rebrand for Atlas',
  });

  assert.ok(project);
  assert.match(project.id, /^proj-/);
  assert.equal(project.title, 'Atlas rebrand');
  assert.equal(project.client, 'Maya Chen');
  assert.equal(project.budget, '$9,000');
  assert.equal(project.timeline, '6 weeks');
  assert.equal(project.description, 'Rebrand for Atlas');
  assert.equal(project.status, 'DRAFT');
  assert.equal(project.progress, 12);
  assert.equal(project.operator, 'BrandForge Team');
  assert.equal(project.owner, 'founder');
  assert.equal(project.nextMilestone, 'Scope lock + kickoff');
  assert.equal(project.members?.length, 1);
  assert.ok(project.createdAt);
  assert.ok(project.updatedAt);
});

test('buildProjectRecord returns null without a title or client', () => {
  assert.equal(buildProjectRecord(), null);
  assert.equal(buildProjectRecord({ title: 'Only a title' }), null);
  assert.equal(buildProjectRecord({ client: 'Only a client' }), null);
});

test('buildProjectRecord applies intake defaults for optional fields', () => {
  const project = buildProjectRecord({ title: 'Landing sprint', client: 'Acme' });

  assert.ok(project);
  assert.equal(project.budget, '$4,000');
  assert.equal(project.timeline, '4 weeks');
  assert.equal(project.description, 'New client engagement created from the project intake flow.');
});
