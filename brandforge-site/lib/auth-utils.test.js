const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidEmail,
  getAuthErrorMessage,
  resolveSiteUrl,
  sanitizeNextPath,
  buildOAuthRedirectUrl,
} = require('./auth-utils.js');

test('isValidEmail accepts standard email addresses', () => {
  assert.equal(isValidEmail('founder@brandforge.gg'), true);
  assert.equal(isValidEmail('hello+team@example.com'), true);
});

test('isValidEmail rejects invalid addresses', () => {
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail(''), false);
});

test('getAuthErrorMessage provides a friendly message for auth failures', () => {
  assert.match(getAuthErrorMessage('email_exists'), /already/);
  assert.match(getAuthErrorMessage('invalid_credentials'), /email or password/i);
});

test('resolveSiteUrl prefers the configured production URL and trims trailing slashes', () => {
  const siteUrl = resolveSiteUrl('https://brandforge.gg/');
  assert.equal(siteUrl, 'https://brandforge.gg');
});

test('buildOAuthRedirectUrl creates the correct callback route with the next param', () => {
  const redirectUrl = buildOAuthRedirectUrl('/chat', 'https://brandforge.gg/');
  assert.equal(redirectUrl, 'https://brandforge.gg/auth/callback?next=%2Fchat');
});

test('sanitizeNextPath keeps genuine same-site paths, with query and hash', () => {
  const origin = 'https://brandforge.gg';
  assert.equal(sanitizeNextPath('/chat', origin), '/chat');
  assert.equal(sanitizeNextPath('/chat?conversationId=abc', origin), '/chat?conversationId=abc');
  assert.equal(sanitizeNextPath('/settings#email', origin), '/settings#email');
});

test('sanitizeNextPath rejects protocol-relative and backslash open redirects', () => {
  const origin = 'https://brandforge.gg';
  assert.equal(sanitizeNextPath('//evil.com', origin), '/chat');
  assert.equal(sanitizeNextPath('/\\evil.com', origin), '/chat');
  assert.equal(sanitizeNextPath('//evil.com/chat', origin), '/chat');
  assert.equal(sanitizeNextPath('https://evil.com', origin), '/chat');
  assert.equal(sanitizeNextPath('javascript:alert(1)', origin), '/chat');
  assert.equal(sanitizeNextPath('', origin), '/chat');
  assert.equal(sanitizeNextPath(null, origin), '/chat');
  assert.equal(sanitizeNextPath(123, origin), '/chat');
});

test('buildOAuthRedirectUrl sanitises a hostile next before it reaches the callback', () => {
  const redirectUrl = buildOAuthRedirectUrl('//evil.com', 'https://brandforge.gg');
  assert.equal(redirectUrl, 'https://brandforge.gg/auth/callback?next=%2Fchat');
});

test('the legacy demo-session helpers are gone', () => {
  const utils = require('./auth-utils.js');
  assert.equal(utils.isDemoCredentials, undefined);
  assert.equal(utils.getDemoSessionEmail, undefined);
  assert.equal(utils.saveDemoSession, undefined);
  assert.equal(utils.clearDemoSession, undefined);
});
