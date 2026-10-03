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
    otp_disabled: 'Email sign-in is not enabled yet — continue with Google for now.',
    signup_disabled: 'Email sign-up is not enabled yet — continue with Google for now.',
    email_not_allowed: 'That email cannot be used to sign in. Try Google instead.',
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

// Only same-site absolute paths may round-trip through ?next=. A bare startsWith('/') check
// is NOT enough: '//evil.com' and '/\evil.com' are protocol-relative URLs that a browser
// resolves to another origin, turning the post-sign-in redirect into an open redirect
// (phishing straight out of a fresh login). Reject those, then re-parse against the known
// origin and require the origin to survive — belt and braces for URL parser quirks.
function sanitizeNextPath(raw, siteOrigin) {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return '/chat';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/chat';

  const base = (() => {
    try {
      return siteOrigin ? new URL(siteOrigin).origin : 'http://localhost:3000';
    } catch {
      return 'http://localhost:3000';
    }
  })();

  try {
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return '/chat';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/chat';
  }
}

function buildOAuthRedirectUrl(nextPath = '/chat', customSiteUrl) {
  const siteUrl = resolveSiteUrl(customSiteUrl);
  const safeNextPath = sanitizeNextPath(nextPath, siteUrl);
  const url = new URL('/auth/callback', siteUrl);
  url.searchParams.set('next', safeNextPath);
  return url.toString();
}

module.exports = {
  isValidEmail,
  getAuthErrorMessage,
  resolveSiteUrl,
  sanitizeNextPath,
  buildOAuthRedirectUrl,
};
