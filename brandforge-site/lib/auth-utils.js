function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  const trimmed = email.trim();
  if (!trimmed) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function getAuthErrorMessage(code) {
  const messages = {
    invalid_credentials: 'The email or password is incorrect.',
    email_exists: 'An account with this email already exists.',
    weak_password: 'Your password is too weak. Please use at least 8 characters.',
    email_not_confirmed: 'Please confirm your email before signing in.',
    user_already_exists: 'This account already exists. Please sign in instead.',
    rate_limit_exceeded: 'Too many attempts. Please wait a moment and try again.',
    invalid_email: 'Please enter a valid email address.',
    missing_password: 'Please enter your password.',
    oauth_provider_not_found: 'Google sign-in is not enabled in Supabase yet.',
    oauth_provider_not_supported: 'Google sign-in is not configured for this project.',
    provider_disabled: 'Google sign-in is currently disabled in the auth provider settings.',
    invalid_oauth_provider: 'Google sign-in is not configured for this project.',
    generic: 'Something went wrong. Please try again.',
  };

  return messages[code] || messages.generic;
}

function resolveSiteUrl(customSiteUrl) {
  const base = (customSiteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  if (!base) {
    if (typeof window !== 'undefined') {
      return window.location.origin.replace(/\/$/, '');
    }
    return 'http://localhost:3000';
  }

  return base.replace(/\/$/, '');
}

function buildOAuthRedirectUrl(nextPath = '/chat', customSiteUrl) {
  const safeNextPath = nextPath && nextPath.startsWith('/') ? nextPath : '/chat';
  const siteUrl = resolveSiteUrl(customSiteUrl);
  const url = new URL('/auth/callback', siteUrl);
  url.searchParams.set('next', safeNextPath);
  return url.toString();
}

module.exports = {
  isValidEmail,
  getAuthErrorMessage,
  resolveSiteUrl,
  buildOAuthRedirectUrl,
};
