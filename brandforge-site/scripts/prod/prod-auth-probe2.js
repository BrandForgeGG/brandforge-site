// Post-fix probes: fresh cookie, EXPIRED cookie (middleware must refresh + route
// must verify the refreshed token), no cookie, landing.
const fs = require('fs');
const { createClient } = require('C:/Users/user/Desktop/BrandForge/brandforge-site/node_modules/@supabase/supabase-js');

const envs = {};
for (const line of fs.readFileSync('C:/Users/user/Desktop/BrandForge/brandforge-site/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) envs[m[1]] = m[2];
}
const url = envs.NEXT_PUBLIC_SUPABASE_URL;
const anon = envs.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = envs.SUPABASE_SERVICE_ROLE_KEY;
const ref = new URL(url).hostname.split('.')[0];

function cookieFor(session, { expireNow = false } = {}) {
  const json = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: expireNow ? Math.floor(Date.now() / 1000) - 7200 : session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  return `sb-${ref}-auth-token=base64-${Buffer.from(json, 'utf8').toString('base64url')}`;
}

async function probe(name, cookie) {
  const headers = cookie ? { Cookie: cookie } : {};
  try {
    const r = await fetch('https://brandforge.gg/api/identity', { headers });
    const body = await r.text();
    const setCookie = r.headers.get('set-cookie') || '';
    const rotated = /auth-token/.test(setCookie) ? ' [set-cookie: auth-token rotated]' : '';
    console.log(`${name} -> ${r.status}${rotated}: ${body.slice(0, 160)}`);
  } catch (e) {
    console.log(`${name} -> transport error: ${e.message}`);
  }
}

async function main() {
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const made = [];

  async function freshSession(label) {
    const email = `probe-${label}-${Date.now()}@brandforge.gg`;
    const password = 'Probe!2026x';
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) throw new Error(`${label} createUser: ${error.message}`);
    made.push(created.user.id);
    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error(`${label} signIn: ${signInErr.message}`);
    return signIn.session;
  }

  try {
    const s1 = await freshSession('fresh');
    await probe('fresh cookie   ', cookieFor(s1));

    const s2 = await freshSession('expired');
    await probe('expired cookie ', cookieFor(s2, { expireNow: true }));

    await probe('no cookie      ', null);

    const landing = await fetch('https://brandforge.gg/');
    console.log(`landing        -> ${landing.status}`);
  } finally {
    for (const id of made) {
      try { await admin.auth.admin.deleteUser(id); } catch (e) { console.log('delete failed', id, e.message); }
    }
    console.log(`cleaned ${made.length} test users`);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
