function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  const trimmed = email.trim();
  if (!trimmed) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

const DEMO_EMAIL = 'demo@brandforge.gg';
const CLIENT_EMAIL = 'client@brandforge.gg';
const DEMO_PASSWORD = 'BrandForge2025!';
const DEMO_COOKIE_NAME = 'brandforge-demo-user';

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

function isDemoCredentials(email, password) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedPassword = String(password ?? '');

  return (
    normalizedEmail === DEMO_EMAIL &&
    normalizedPassword === DEMO_PASSWORD
  );
}

function saveDemoSession(email) {
  if (typeof document === 'undefined') {
    return false;
  }

  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const cookieValue = encodeURIComponent(normalizedEmail);

  document.cookie = `${DEMO_COOKIE_NAME}=${cookieValue}; path=/; max-age=604800; SameSite=Lax`;

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DEMO_COOKIE_NAME, normalizedEmail);
  }

  return true;
}

function clearDemoSession() {
  if (typeof document !== 'undefined') {
    document.cookie = `${DEMO_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(DEMO_COOKIE_NAME);
  }
}

function getDemoSessionEmail() {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookieMatch = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${DEMO_COOKIE_NAME}=`));

  if (cookieMatch) {
    return decodeURIComponent(cookieMatch.split('=').slice(1).join('=')).trim().toLowerCase();
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(DEMO_COOKIE_NAME);
    if (stored) {
      return String(stored).trim().toLowerCase();
    }
  }

  return null;
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
  DEMO_EMAIL,
  CLIENT_EMAIL,
  DEMO_PASSWORD,
  DEMO_COOKIE_NAME,
  isValidEmail,
  getAuthErrorMessage,
  isDemoCredentials,
  saveDemoSession,
  clearDemoSession,
  getDemoSessionEmail,
  resolveSiteUrl,
  buildOAuthRedirectUrl,
};
