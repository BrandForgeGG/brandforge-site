const test = require('node:test');
const assert = require('node:assert/strict');

const { getUserRoleFromEmail, getVisibleProjects } = require('./user-roles.js');

test('getUserRoleFromEmail maps founder and client accounts correctly', () => {
  assert.equal(getUserRoleFromEmail('demo@brandforge.gg'), 'founder');
  assert.equal(getUserRoleFromEmail('client@brandforge.gg'), 'client');
  assert.equal(getUserRoleFromEmail('nora@brandforge.gg'), 'user');
});

test('getUserRoleFromEmail maps privileged Google accounts and open signups', () => {
  assert.equal(getUserRoleFromEmail('brandforge.gg@gmail.com'), 'founder');
  assert.equal(getUserRoleFromEmail('mxstermind.com@gmail.com'), 'operator');
  assert.equal(getUserRoleFromEmail('MXSTERMIND.COM@GMAIL.COM'), 'operator');
  assert.equal(getUserRoleFromEmail('someone.new@gmail.com'), 'user');
  assert.equal(getUserRoleFromEmail(''), 'guest');
});

test('getVisibleProjects limits client views to the right project set', () => {
  const projects = [
    { id: 'a', status: 'IN_PROGRESS' },
    { id: 'b', status: 'REVIEW' },
    { id: 'c', status: 'AWAITING_APPROVAL' },
    { id: 'd', status: 'COMPLETED' },
  ];

  const visible = getVisibleProjects(projects, 'client@brandforge.gg');
  assert.deepEqual(visible.map((project) => project.id), ['a', 'b', 'c']);
});

test('getVisibleProjects shows every project to founder, operator, and regular users', () => {
  const projects = [
    { id: 'a', status: 'IN_PROGRESS' },
    { id: 'b', status: 'COMPLETED' },
  ];

  assert.equal(getVisibleProjects(projects, 'brandforge.gg@gmail.com').length, 2);
  assert.equal(getVisibleProjects(projects, 'mxstermind.com@gmail.com').length, 2);
  assert.equal(getVisibleProjects(projects, 'someone.new@gmail.com').length, 2);
});
