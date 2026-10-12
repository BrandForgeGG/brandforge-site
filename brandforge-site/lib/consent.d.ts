export const CONSENT_COOKIE: string;
export const CONSENT_EVENT: string;
export function readConsent(cookieString: string | null | undefined): 'all' | 'essential' | null;
export function consentCookie(value: 'all' | 'essential', secure?: boolean): string;
export function analyticsAllowed(cookieString: string | null | undefined): boolean;
