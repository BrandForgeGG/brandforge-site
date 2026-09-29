const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require(path.join(os.homedir(), 'Desktop', 'BrandForge', 'brandforge-site', 'node_modules', '@supabase', 'supabase-js'));

const site = path.join(os.homedir(), 'Desktop', 'BrandForge', 'brandforge-site');
const env = fs.readFileSync(path.join(site, '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const svc = get('SUPABASE_SERVICE_ROLE_KEY');
const ref = new URL(url).hostname.split('.')[0];

const admin = createClient(url, svc, { auth: { persistSession: false } });
const anonClient = createClient(url, anon, { auth: { persistSession: false } });

function cookieFor(session) {
  const json = JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  });
  return `sb-${ref}-auth-token=base64-${Buffer.from(json, 'utf8').toString('base64url')}`;
}

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('FAIL  ' + name + (detail ? ' -- ' + detail : '')); }
};
const H = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };

(async () => {
  const stamp = Date.now();
  const fEmail = `probe-founder-${stamp}@brandforge.gg`;
  const oEmail = `probe-operator-${stamp}@brandforge.gg`;

  const fCreated = (await admin.auth.admin.createUser({ email: fEmail, password: 'Probe!2026x', email_confirm: true })).data.user;
  const oCreated = (await admin.auth.admin.createUser({ email: oEmail, password: 'Probe!2026x', email_confirm: true })).data.user;
  const fid = fCreated.id, oid = oCreated.id;

  let convId = null, proposalId = null, funnelMarker = 0;

  try {
    // operator gets the real staff role
    const roleRes = await fetch(`${url}/rest/v1/profiles?id=eq.${oid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ role: 'operator' }) });
    check('probe operator role set', roleRes.status === 204 || roleRes.status === 200, String(roleRes.status));

    const fSession = (await anonClient.auth.signInWithPassword({ email: fEmail, password: 'Probe!2026x' })).data.session;
    const oSession = (await anonClient.auth.signInWithPassword({ email: oEmail, password: 'Probe!2026x' })).data.session;
    const fCookie = { Cookie: cookieFor(fSession) };
    const oCookie = { Cookie: cookieFor(oSession) };

    // funnel cleanup marker
    const marker = await (await fetch(`${url}/rest/v1/funnel_events?select=id&order=id.desc&limit=1`, { headers: H })).json();
    funnelMarker = marker[0] ? marker[0].id : 0;

    // founder conversation
    const conv = await (await fetch(`${url}/rest/v1/conversations`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ user_id: fid, title: 'Telegram fix test', status: 'DISCOVERY' }) })).json();
    convId = conv[0] && conv[0].id;
    check('conversation created', Boolean(convId));

    // 1) request-review: fires Discord embed + the real Telegram DM to @headstartup
    const rr = await fetch('https://brandforge.gg/api/request-review', { method: 'POST', headers: { 'Content-Type': 'application/json', ...fCookie }, body: JSON.stringify({ conversationId: convId }) });
    const rrBody = await rr.text();
    console.log('request-review ->', rr.status, rrBody.slice(0, 160));
    check('brief sent for review (200)', rr.status === 200, rrBody.slice(0, 200));

    // 2) operator sends a proposal pre-acceptance (allowed: read + propose)
    const pr = await fetch('https://brandforge.gg/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json', ...oCookie }, body: JSON.stringify({ conversationId: convId, title: 'Fix test proposal', scope: 'scope', deliverables: 'deliverables', totalAmount: 1000, estimatedWeeksMin: 1, estimatedWeeksMax: 2 }) });
    const prBody = await pr.json();
    console.log('proposal POST ->', pr.status, JSON.stringify(prBody).slice(0, 160));
    proposalId = prBody.proposal && prBody.proposal.id;
    check('operator proposal created', pr.status === 200 && Boolean(proposalId));

    // 2b) the proposal moment must be visible to the founder: status flipped and the
    // chat card landed (both writes used to die on RLS for a non-participant operator).
    const convProposed = await (await fetch(`${url}/rest/v1/conversations?id=eq.${convId}&select=status`, { headers: H })).json();
    check('conversation PROPOSED after submit', convProposed[0] && convProposed[0].status === 'PROPOSED', JSON.stringify(convProposed));

    const msgsAfterPost = await (await fetch(`${url}/rest/v1/messages?conversation_id=eq.${convId}&select=content_type,artifact_data`, { headers: H })).json();
    check('proposal card landed in chat', msgsAfterPost.some((m) => m.content_type === 'system' && m.artifact_data && m.artifact_data.type === 'proposal'), JSON.stringify(msgsAfterPost.map((m) => ({ ct: m.content_type, a: m.artifact_data && m.artifact_data.type }))));

    // 2c) counter round (spec: founder counters once, specialist counters back once as
    // their final offer, then the founder's accept promotes the counter into the deal).
    const cc = (body) => fetch('https://brandforge.gg/api/proposals', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...body.cookie }, body: JSON.stringify({ proposalId, ...body.patch }) });

    // invalid jumps first: the matrix must refuse them with 409 (with terms attached,
    // so the request passes field validation and reaches the transition check)
    const badPending = await cc({ cookie: fCookie, patch: { status: 'counter_back', counterTotalAmount: 700, counterWeeksMin: 2, counterWeeksMax: 2 } });
    check('owner cannot counter_back from pending (409)', badPending.status === 409, String(badPending.status));

    // 1) founder counters: 1000 EUR / 1-2 weeks offer -> 800 EUR / 3 weeks
    const c1 = await cc({ cookie: fCookie, patch: { status: 'countered', counterTotalAmount: 800, counterWeeksMin: 3, counterWeeksMax: 3, counterNote: 'Probe counter' } });
    const c1Body = await c1.text();
    console.log('founder counter ->', c1.status, c1Body.slice(0, 140));
    check('founder counter accepted (200)', c1.status === 200, c1Body.slice(0, 200));

    let row = (await (await fetch(`${url}/rest/v1/proposals?id=eq.${proposalId}&select=status,counter_total_amount,counter_weeks_min,counter_weeks_max,counter_round`, { headers: H })).json())[0];
    check('counter row stored (round 1)', row && row.status === 'countered' && row.counter_total_amount === 800 && row.counter_round === 1, JSON.stringify(row));

    const convMid = await (await fetch(`${url}/rest/v1/conversations?id=eq.${convId}&select=status`, { headers: H })).json();
    check('conversation still PROPOSED through counters', convMid[0] && convMid[0].status === 'PROPOSED', JSON.stringify(convMid));

    // invalid jumps during the round
    const secondCounter = await cc({ cookie: fCookie, patch: { status: 'countered', counterTotalAmount: 700, counterWeeksMin: 2, counterWeeksMax: 2 } });
    check('no second founder counter (409)', secondCounter.status === 409, String(secondCounter.status));
    const ownerCounterBack = await cc({ cookie: fCookie, patch: { status: 'counter_back', counterTotalAmount: 700, counterWeeksMin: 2, counterWeeksMax: 2 } });
    check('owner cannot counter_back (409)', ownerCounterBack.status === 409, String(ownerCounterBack.status));

    // 2) specialist counters back: 900 EUR / 3 weeks, their final offer
    const c2 = await cc({ cookie: oCookie, patch: { status: 'counter_back', counterTotalAmount: 900, counterWeeksMin: 3, counterWeeksMax: 3, counterNote: 'Final offer' } });
    const c2Body = await c2.text();
    console.log('specialist counter back ->', c2.status, c2Body.slice(0, 140));
    check('specialist counter back accepted (200)', c2.status === 200, c2Body.slice(0, 200));

    row = (await (await fetch(`${url}/rest/v1/proposals?id=eq.${proposalId}&select=status,counter_total_amount,counter_round`, { headers: H })).json())[0];
    check('counter_back row stored (round 2)', row && row.status === 'counter_back' && row.counter_total_amount === 900 && row.counter_round === 2, JSON.stringify(row));

    const staffSelfAccept = await cc({ cookie: oCookie, patch: { status: 'accepted' } });
    check('staff cannot accept own counter_back (409)', staffSelfAccept.status === 409, String(staffSelfAccept.status));

    const msgsAfterCounter = await (await fetch(`${url}/rest/v1/messages?conversation_id=eq.${convId}&select=content_type,artifact_data`, { headers: H })).json();
    check('counter system card in chat', msgsAfterCounter.some((m) => m.content_type === 'system' && m.artifact_data && m.artifact_data.status === 'counter_back'), JSON.stringify(msgsAfterCounter.map((m) => m.artifact_data && m.artifact_data.status)));

    // 3) pre-acceptance participation is gated
    const j = await fetch('https://brandforge.gg/api/staff/join', { method: 'POST', headers: { 'Content-Type': 'application/json', ...oCookie }, body: JSON.stringify({ conversationId: convId }) });
    const jBody = await j.text();
    check('pre-accept staff/join refused (403)', j.status === 403, j.status + ' ' + jBody.slice(0, 120));

    const p = await fetch('https://brandforge.gg/api/staff/post', { method: 'POST', headers: { 'Content-Type': 'application/json', ...oCookie }, body: JSON.stringify({ conversationId: convId, message: 'pre-accept post attempt' }) });
    const pBody = await p.text();
    check('pre-accept staff/post refused (403)', p.status === 403, p.status + ' ' + pBody.slice(0, 120));

    // 4) founder accepts -> the counter terms become the deal terms -> auto-invite
    const ac = await fetch('https://brandforge.gg/api/proposals', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...fCookie }, body: JSON.stringify({ proposalId, status: 'accepted' }) });
    const acBody = await ac.text();
    console.log('accept ->', ac.status, acBody.slice(0, 140));
    check('proposal accepted (200)', ac.status === 200, acBody.slice(0, 200));

    row = (await (await fetch(`${url}/rest/v1/proposals?id=eq.${proposalId}&select=total_amount,estimated_weeks_min,estimated_weeks_max,accepted_at`, { headers: H })).json())[0];
    check('counter promoted into deal terms', row && row.total_amount === 900 && row.estimated_weeks_min === 3 && row.estimated_weeks_max === 3 && Boolean(row.accepted_at), JSON.stringify(row));

    const funnelRows = await (await fetch(`${url}/rest/v1/funnel_events?id=gt.${funnelMarker}&event=eq.proposal_accepted&select=properties`, { headers: H })).json();
    check('funnel prices the promoted total', funnelRows.length > 0 && funnelRows[0].properties && funnelRows[0].properties.total_amount === 900, JSON.stringify(funnelRows));

    // 5) verify the invite landed
    const parts = await (await fetch(`${url}/rest/v1/participants?conversation_id=eq.${convId}&select=user_id,role`, { headers: H })).json();
    check('author auto-joined as operator', parts.some((r) => r.user_id === oid && r.role === 'operator'), JSON.stringify(parts));

    const msgs = await (await fetch(`${url}/rest/v1/messages?conversation_id=eq.${convId}&select=content`, { headers: H })).json();
    check('visible join line in chat', msgs.some((m) => (m.content || '').includes('joined this conversation (their proposal was accepted)')), JSON.stringify(msgs.map((m) => m.content)));

    const convAfter = await (await fetch(`${url}/rest/v1/conversations?id=eq.${convId}&select=status`, { headers: H })).json();
    check('conversation ACCEPTED', convAfter[0] && convAfter[0].status === 'ACCEPTED', JSON.stringify(convAfter));

    // 6) post-acceptance participation works
    const p2 = await fetch('https://brandforge.gg/api/staff/post', { method: 'POST', headers: { 'Content-Type': 'application/json', ...oCookie }, body: JSON.stringify({ conversationId: convId, message: 'post-accept post works' }) });
    check('post-accept staff/post allowed (200)', p2.status === 200, String(p2.status));

    const j2 = await fetch('https://brandforge.gg/api/staff/join', { method: 'POST', headers: { 'Content-Type': 'application/json', ...oCookie }, body: JSON.stringify({ conversationId: convId }) });
    check('post-accept staff/join allowed (200)', j2.status === 200, String(j2.status));
  } finally {
    // cleanup
    if (convId) {
      await fetch(`${url}/rest/v1/messages?conversation_id=eq.${convId}`, { method: 'DELETE', headers: H });
      await fetch(`${url}/rest/v1/participants?conversation_id=eq.${convId}`, { method: 'DELETE', headers: H });
      await fetch(`${url}/rest/v1/proposals?conversation_id=eq.${convId}`, { method: 'DELETE', headers: H });
      await fetch(`${url}/rest/v1/project_context?conversation_id=eq.${convId}`, { method: 'DELETE', headers: H });
      await fetch(`${url}/rest/v1/conversations?id=eq.${convId}`, { method: 'DELETE', headers: H });
    }
    if (funnelMarker) {
      await fetch(`${url}/rest/v1/funnel_events?id=gt.${funnelMarker}`, { method: 'DELETE', headers: H });
    }
    await admin.auth.admin.deleteUser(fid).catch(() => {});
    await admin.auth.admin.deleteUser(oid).catch(() => {});
    console.log('  (probe rows removed)');
  }

  console.log(failures === 0 ? '\nPIPELINE E2E: ALL PASS' : `\n${failures} checks FAILED`);
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
