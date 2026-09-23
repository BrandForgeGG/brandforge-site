// Privileged BrandForge accounts. Login is OPEN — any Google account may sign in.
// These lists only seed profiles.role (migration 0006) and drive UI role hints until
// profiles.role is fully authoritative in the client.

const ADMIN_LOGIN_EMAILS = ['brandforge.gg@gmail.com'];
const OPERATOR_LOGIN_EMAILS = ['mxstermind.com@gmail.com'];

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function isAdminLoginEmail(email) {
  return ADMIN_LOGIN_EMAILS.includes(normalizeEmail(email));
}

function isOperatorLoginEmail(email) {
  return OPERATOR_LOGIN_EMAILS.includes(normalizeEmail(email));
}

module.exports = {
  ADMIN_LOGIN_EMAILS,
  OPERATOR_LOGIN_EMAILS,
  normalizeEmail,
  isAdminLoginEmail,
  isOperatorLoginEmail,
};
