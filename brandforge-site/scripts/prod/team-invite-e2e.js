// Team invite e2e against a LOCAL dev server (BASE, default http://localhost:3000).
// Creates two throwaway users with random passwords, runs founder -> invite link
// -> teammate join -> shared chat, then deletes every row and user it made.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require(path.join(__dirname, '..', '..', 'node_modules', '@supabase', 'supabase-js'));

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const svc = get('SUPABASE_SERVICE_ROLE_KEY');
const ref = new URL(url).hostname.split('.')[0];
const BASE = process.env.BASE || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error('Refusing to run against a non-local BASE');

const admin = createClient(url, svc, { auth: { persistSession: false } });
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
const cookieFor = (s) =>
  `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: s.access_token, token_type: s.token_type, expires_in: s.expires_in, expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user }), 'utf8').toString('base64url')}`;

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('FAIL  ' + name + (detail ? ' -- ' + detail : '')); }
};

(async () => {
  const stamp = Date.now();
  const password = crypto.randomBytes(18).toString('base64url');
  const mk = async (label) => {
    const email = `probe-${label}-${stamp}@brandforge.gg`;
    const u = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
    const s = (await anonClient.auth.signInWithPassword({ email, password })).data.session;
    return { id: u.id, access: s.access_token, refresh: s.refresh_token, headers: { 'Content-Type': 'application/json', Cookie: cookieFor(s) } };
  };
  let founder, mate, outsider, convId;
  try {
    founder = await mk('founder');
    mate = await mk('mate');
    outsider = await mk('outsider');
    const conv = (await admin.from('conversations').insert({ user_id: founder.id, title: 'Team invite probe', status: 'DISCOVERY' }).select('id').single()).data;
    convId = conv.id;

    const link = await fetch(`${BASE}/api/invite`, { method: 'POST', headers: founder.headers, body: JSON.stringify({ conversationId: convId, link: true }) });
    const linkBody = await link.json();
    check('founder mints a team link', link.status === 200 && /\/join\?token=/.test(linkBody.url || ''), JSON.stringify(linkBody));
    const outsiderLink = await fetch(`${BASE}/api/invite`, { method: 'POST', headers: outsider.headers, body: JSON.stringify({ conversationId: convId, link: true }) });
    check('non-member cannot mint a link (403)', outsiderLink.status === 403, String(outsiderLink.status));

    const token = decodeURIComponent(new URL(linkBody.url).searchParams.get('token'));
    const pre = await fetch(`${BASE}/api/participants?conversationId=${convId}`, { headers: mate.headers });
    check('teammate has no access before joining (403)', pre.status === 403, String(pre.status));

    const bad = await fetch(`${BASE}/api/join`, { method: 'POST', headers: mate.headers, body: JSON.stringify({ token: token.slice(0, -2) + 'xx' }) });
    check('tampered token rejected (400)', bad.status === 400, String(bad.status));
    const anonJoin = await fetch(`${BASE}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    check('signed-out join rejected (401)', anonJoin.status === 401, String(anonJoin.status));

    const join = await fetch(`${BASE}/api/join`, { method: 'POST', headers: mate.headers, body: JSON.stringify({ token }) });
    const joinBody = await join.json();
    check('teammate joins (200, right chat)', join.status === 200 && joinBody.conversationId === convId, JSON.stringify(joinBody));
    const again = await fetch(`${BASE}/api/join`, { method: 'POST', headers: mate.headers, body: JSON.stringify({ token }) });
    check('re-joining is idempotent', again.status === 200 && (await again.json()).already === true);

    const parts = await fetch(`${BASE}/api/participants?conversationId=${convId}`, { headers: mate.headers });
    const partsBody = await parts.json();
    check('teammate can read participants', parts.status === 200 && (partsBody.participants || []).some((p) => p.user_id === mate.id && p.role === 'member'), JSON.stringify(partsBody).slice(0, 200));

    const msgs = await fetch(`${BASE}/api/messages?conversationId=${convId}`, { headers: mate.headers });
    check('teammate can read the chat', msgs.status === 200, String(msgs.status));
    // Writes go through /api/chat (which also triggers the AI); here we only prove the
    // row-level-security path a member's own session would use.
    const asMate = createClient(url, anon, { auth: { persistSession: false } });
    await asMate.auth.setSession({ access_token: mate.access, refresh_token: mate.refresh });
    const ins = await asMate.from('messages').insert({ conversation_id: convId, sender_type: 'user', sender_id: mate.id, sender_name: 'Probe', content: 'hello from the team', content_type: 'text' });
    check('teammate can post a message (RLS)', !ins.error, ins.error && ins.error.message);
    const asOutsider = createClient(url, anon, { auth: { persistSession: false } });
    await asOutsider.auth.setSession({ access_token: outsider.access, refresh_token: outsider.refresh });
    const insOut = await asOutsider.from('messages').insert({ conversation_id: convId, sender_type: 'user', sender_id: outsider.id, sender_name: 'Probe', content: 'let me in', content_type: 'text' });
    check('outsider cannot post (RLS)', Boolean(insOut.error), 'insert unexpectedly succeeded');
  } catch (error) {
    failures++;
    console.log('FAIL  exception -- ' + (error && error.message));
  } finally {
    if (convId) await admin.from('conversations').delete().eq('id', convId);
    for (const u of [founder, mate, outsider]) if (u) await admin.auth.admin.deleteUser(u.id).catch(() => {});
    console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
    process.exit(failures ? 1 : 0);
  }
})();
