'use strict';

// Phone sign-in input rules, kept pure so the form and the tests share them. Numbers go to the provider in international
// (E.164) form: a plus, then 8 to 15 digits, the first not zero.
function normalizePhone(raw) {
  let text = String(raw == null ? '' : raw).trim().replace(/[\s().-]/g, '');
  if (text.startsWith('00')) text = `+${text.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(text) ? text : null;
}

/** The six digits of a texted code, or null. Spaces and dashes people type or paste are ignored. */
function normalizeCode(raw) {
  const digits = String(raw == null ? '' : raw).replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** "+971501234567" -> "+971 50 *** 4567": enough to recognise the number, not enough to read it out. */
function maskPhone(phone) {
  const text = String(phone || '');
  if (text.length < 8) return text;
  return `${text.slice(0, 4)} ••• ${text.slice(-4)}`;
}

module.exports = { normalizePhone, normalizeCode, maskPhone };
