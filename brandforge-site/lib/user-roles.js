// UI role hints only. profiles.role (migration 0006) is authoritative for access;
// this module just labels known staff emails in the interface.
const { ADMIN_LOGIN_EMAILS, OPERATOR_LOGIN_EMAILS, normalizeEmail } = require('./auth-allowlist.js');

function getUserRoleFromEmail(email) {
  const normalized = normalizeEmail(email);

  if (!normalized) return 'guest';
  if (OPERATOR_LOGIN_EMAILS.includes(normalized)) return 'operator';
  if (ADMIN_LOGIN_EMAILS.includes(normalized)) return 'founder';
  return 'user';
}

function isFounderEmail(email) {
  return getUserRoleFromEmail(email) === 'founder';
}

module.exports = {
  getUserRoleFromEmail,
  isFounderEmail,
};
