const { DEMO_EMAIL, CLIENT_EMAIL } = require('./auth-utils.js');
const { ADMIN_LOGIN_EMAILS, OPERATOR_LOGIN_EMAILS, normalizeEmail } = require('./auth-allowlist.js');

function getUserRoleFromEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized) return 'guest';
  if (OPERATOR_LOGIN_EMAILS.includes(normalized)) return 'operator';
  if (ADMIN_LOGIN_EMAILS.includes(normalized) || normalized === DEMO_EMAIL) return 'founder';
  if (normalized === CLIENT_EMAIL) return 'client';
  return 'user';
}

function isFounderEmail(email) {
  return getUserRoleFromEmail(email) === 'founder';
}

function isClientEmail(email) {
  return getUserRoleFromEmail(email) === 'client';
}

function getVisibleProjects(projects, email) {
  const list = Array.isArray(projects) ? projects : [];
  const role = getUserRoleFromEmail(email);

  if (role === 'client') {
    return list.filter(
      (project, index) => index === 0 || project.status === 'REVIEW' || project.status === 'AWAITING_APPROVAL'
    );
  }

  if (role === 'guest') {
    return list.slice(0, 1);
  }

  // founder / operator / user / team: RLS already scopes the list to the signed-in account.
  return list;
}

module.exports = {
  getUserRoleFromEmail,
  isFounderEmail,
  isClientEmail,
  getVisibleProjects,
};
