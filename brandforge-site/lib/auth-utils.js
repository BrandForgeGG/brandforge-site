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
    over_email_send_rate_limit: 'Too many sign-in emails were sent just now. Wait a minute and try again, or continue with Google.',
    over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
    email_address_not_authorized: 'We cannot send email to that address yet. Continue with Google for now.',
    email_address_invalid: 'Please enter a valid email address.',
    otp_expired: 'That code has expired. Ask for a new one.',
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

// What went wrong when someone arrives from a sign-in email, in words that say what to do next. The two real cases:
// the link was opened in a different browser or app than the one that asked for it (the security code it needs lives
// only in that first browser), or the link expired or was already used.
function linkErrorMessage(description, code) {
  const text = `${code || ''} ${description || ''}`.toLowerCase();
  if (/expired|already been used|otp_expired|invalid or has expired|access_denied/.test(text)) {
    return 'That sign-in link has expired or was already used. Enter your email to get a new one.';
  }
  if (/code verifier|code_verifier|flow state|flow_state|non-empty|bad_code_verifier|pkce/.test(text)) {
    return 'That link was opened in a different browser or app. Type the 6-digit code from the email instead, or ask for a new link here.';
  }
  return 'That sign-in link did not work. Enter your email to get a new one, or continue with Google.';
}

// The kinds of email link Supabase can send with a token hash, checked on the server (no same-browser requirement).
const EMAIL_LINK_TYPES = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'];

module.exports = {
  linkErrorMessage,
  EMAIL_LINK_TYPES,
  isValidEmail,
  getAuthErrorMessage,
  resolveSiteUrl,
  sanitizeNextPath,
  buildOAuthRedirectUrl,
};
