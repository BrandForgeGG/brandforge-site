// Peer contract + Trade Center e2e against a LOCAL dev server (BASE, default http://localhost:3100)
// using the production database. Creates throwaway users with random passwords, runs the whole
// flow through the real routes, then deletes every row and user it made.
// "Staff verifies the deposit" is simulated by a fixture write (no admin account is created).
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
const BASE = process.env.BASE || 'http://localhost:3100';
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
  const users = [];
  const mk = async (label) => {
    const email = `probe-${label}-${stamp}@brandforge.gg`;
    const u = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
    const s = (await anonClient.auth.signInWithPassword({ email, password })).data.session;
    const user = { id: u.id, headers: { 'Content-Type': 'application/json', Cookie: cookieFor(s) } };
    users.push(user);
    return user;
  };
  const call = async (user, method, p, body) => {
    const res = await fetch(`${BASE}${p}`, { method, headers: user ? user.headers : { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  let payer, worker, outsider, convId, contractId, listingId, tradeConvId;
  try {
    payer = await mk('payer');
    worker = await mk('worker');
    outsider = await mk('outsider');
    convId = (await admin.from('conversations').insert({ user_id: payer.id, title: 'Peer contract probe', status: 'DISCOVERY' }).select('id').single()).data.id;
    await admin.from('participants').insert({ conversation_id: convId, user_id: worker.id, role: 'member', display_name: 'Probe Worker' });

    const people = await call(payer, 'GET', `/api/peer-contracts?conversationId=${convId}&people=1`);
    check('people picker lists the teammate and the fee', people.status === 200 && people.body.people?.some((p) => p.userId === worker.id) && people.body.feePercent === 5, JSON.stringify(people.body));
    check('outsider cannot list people (403)', (await call(outsider, 'GET', `/api/peer-contracts?conversationId=${convId}&people=1`)).status === 403);

    const draft = { conversationId: convId, counterpartyId: worker.id, myRole: 'payer', title: 'Launch video', scope: 'One 30-second launch video with captions.', currency: 'EUR', milestones: [{ title: 'Script', amount: 100 }, { title: 'Final video', amount: 300 }] };
    const blocked = await call(payer, 'POST', '/api/peer-contracts', { ...draft, title: 'Ads for my online casino' });
    check('unsupported sector is declined (422)', blocked.status === 422, JSON.stringify(blocked.body));
    check('outsider cannot create in this chat (403)', (await call(outsider, 'POST', '/api/peer-contracts', draft)).status === 403);
    check('signed-out create rejected (401)', (await call(null, 'POST', '/api/peer-contracts', draft)).status === 401);
    check('bad milestones rejected (400)', (await call(payer, 'POST', '/api/peer-contracts', { ...draft, milestones: [] })).status === 400);

    const created = await call(payer, 'POST', '/api/peer-contracts', draft);
    contractId = created.body.contract?.id;
    check('contract created, proposer already signed', created.status === 200 && created.body.contract.status === 'proposed' && created.body.contract.signatures.payer && !created.body.contract.signatures.payee, JSON.stringify(created.body).slice(0, 300));
    check('total is 400.00 EUR in cents', created.body.contract?.totalCents === 40000);

    const msg = await admin.from('messages').select('artifact_data').eq('conversation_id', convId).eq('content_type', 'system');
    check('a contract card message landed in the chat', (msg.data || []).some((m) => m.artifact_data?.type === 'peer_contract' && m.artifact_data.id === contractId));

    check('outsider cannot read the contract (403)', (await call(outsider, 'GET', `/api/peer-contracts/${contractId}`)).status === 403);
    check('worker can read it', (await call(worker, 'GET', `/api/peer-contracts/${contractId}`)).body.contract?.viewerSide === 'payee');
    check('outsider cannot act (403)', (await call(outsider, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'accept' })).status === 403);

    const early = await call(payer, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_funding', tx: '0xabc123abc' });
    check('cannot fund before both sign (409)', early.status === 409, JSON.stringify(early.body));

    const accepted = await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'accept' });
    check('worker accepts, contract is active', accepted.status === 200 && accepted.body.contract.status === 'active', JSON.stringify(accepted.body).slice(0, 200));

    check('worker cannot fund (403)', (await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_funding', tx: '0xabc123abc' })).status === 403);
    check('worker cannot verify funding (403, staff only)', (await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'verify_funding' })).status === 403);
    const funding = await call(payer, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_funding', tx: '0xabc123abc' });
    check('payer submits a deposit reference', funding.status === 200 && funding.body.contract.fundingStatus === 'verifying' && funding.body.contract.fundingTx === '0xabc123abc');
    check('worker does not see the payment reference', (await call(worker, 'GET', `/api/peer-contracts/${contractId}`)).body.contract?.fundingTx === null);

    const notYet = await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_milestone', index: 0, proofUrl: 'https://example.com/script' });
    check('no work before funding is confirmed (409)', notYet.status === 409, JSON.stringify(notYet.body));

    await admin.from('peer_contracts').update({ funding_status: 'funded', updated_at: new Date().toISOString() }).eq('id', contractId);

    check('milestones go in order (409 on #2 first)', (await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_milestone', index: 1, proofUrl: 'https://example.com/v' })).status === 409);
    check('proof must be a link (400)', (await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_milestone', index: 0, proofUrl: 'done' })).status === 400);
    const sub1 = await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_milestone', index: 0, proofUrl: 'https://example.com/script' });
    check('worker submits milestone 1', sub1.status === 200 && sub1.body.contract.milestones[0].status === 'submitted' && sub1.body.contract.milestones[0].autoReleaseAt);
    check('worker cannot approve own work (403)', (await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'approve_milestone', index: 0 })).status === 403);

    // Auto-release: move the deadline into the past; the next read settles it.
    const row = (await admin.from('peer_contracts').select('milestones').eq('id', contractId).single()).data;
    row.milestones[0].autoReleaseAt = new Date(Date.now() - 60000).toISOString();
    await admin.from('peer_contracts').update({ milestones: row.milestones, updated_at: new Date().toISOString() }).eq('id', contractId);
    const auto = await call(payer, 'GET', `/api/peer-contracts/${contractId}`);
    check('48h window passed: milestone 1 auto-released with 5% fee', auto.body.contract?.milestones[0].status === 'released' && auto.body.contract.milestones[0].feeCents === 500, JSON.stringify(auto.body.contract?.milestones[0]));

    const sub2 = await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'submit_milestone', index: 1, proofUrl: 'https://example.com/final' });
    check('worker submits milestone 2', sub2.status === 200);
    check('a vague dispute is rejected (400)', (await call(payer, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'dispute_milestone', index: 1, reason: 'no' })).status === 400);
    const disp = await call(payer, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'dispute_milestone', index: 1, reason: 'The captions are missing.' });
    check('payer raises an issue, contract is in review', disp.status === 200 && disp.body.contract.status === 'disputed' && disp.body.contract.milestones[1].status === 'disputed');
    check('payer cannot resolve their own dispute (403)', (await call(payer, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'resolve_dispute', index: 1, outcome: 'refund' })).status === 403);
    check('worker cannot resolve it either (403)', (await call(worker, 'PATCH', `/api/peer-contracts/${contractId}`, { action: 'resolve_dispute', index: 1, outcome: 'release' })).status === 403);

    const list = await call(worker, 'GET', '/api/peer-contracts');
    check('"my contracts" lists it for the worker', list.status === 200 && list.body.contracts?.some((c) => c.id === contractId));

    // ---- Trade Center ----
    check('signed-out cannot post a listing (401)', (await call(null, 'POST', '/api/trade', {})).status === 401);
    const listing = { kind: 'offer', category: 'Video and motion', title: 'Short-form video editing', description: 'I cut Reels and Shorts for small brands, captions included, two-day turnaround.', budgetMin: 200, budgetMax: 600 };
    check('unsupported sector listing declined (422)', (await call(payer, 'POST', '/api/trade', { ...listing, title: 'Promo for my payday loans' })).status === 422);
    check('invalid listing rejected (400)', (await call(payer, 'POST', '/api/trade', { ...listing, title: 'x' })).status === 400);
    const posted = await call(payer, 'POST', '/api/trade', listing);
    listingId = posted.body.listing?.id;
    check('listing posted', posted.status === 200 && posted.body.listing.mine === true, JSON.stringify(posted.body).slice(0, 200));
    const browse = await call(null, 'GET', '/api/trade?q=reels');
    check('anyone can browse and search it', browse.status === 200 && browse.body.listings?.some((l) => l.id === listingId && l.mine === false));
    check('filters exclude it', !(await call(null, 'GET', '/api/trade?kind=request')).body.listings?.some((l) => l.id === listingId));
    check('cannot contact your own listing (400)', (await call(payer, 'POST', `/api/trade/${listingId}/contact`, { message: 'hello there friend' })).status === 400);
    check('signed-out cannot contact (401)', (await call(null, 'POST', `/api/trade/${listingId}/contact`, { message: 'hello there friend' })).status === 401);
    check('too-short message rejected (400)', (await call(outsider, 'POST', `/api/trade/${listingId}/contact`, { message: 'hi' })).status === 400);
    const contact = await call(outsider, 'POST', `/api/trade/${listingId}/contact`, { message: 'Hi, I need a launch reel next week.' });
    tradeConvId = contact.body.conversationId;
    check('contacting opens a chat', contact.status === 200 && tradeConvId, JSON.stringify(contact.body));
    const parts = await admin.from('participants').select('user_id').eq('conversation_id', tradeConvId);
    check('the listing owner is in that chat', (parts.data || []).some((p) => p.user_id === payer.id));
    const tradePeople = await call(payer, 'GET', `/api/peer-contracts?conversationId=${tradeConvId}&people=1`);
    check('the owner can start a contract with the visitor from there', tradePeople.status === 200 && tradePeople.body.people?.some((p) => p.userId === outsider.id));
    check('only the owner can close it (404 for others)', (await call(outsider, 'DELETE', `/api/trade/${listingId}`)).status === 404);
    check('owner closes the listing', (await call(payer, 'DELETE', `/api/trade/${listingId}`)).status === 200);
    check('closed listing disappears', !(await call(null, 'GET', '/api/trade')).body.listings?.some((l) => l.id === listingId));
  } catch (error) {
    failures++;
    console.log('FAIL  exception -- ' + (error && error.message));
  } finally {
    if (listingId) await admin.from('trade_listings').delete().eq('id', listingId);
    if (convId) await admin.from('conversations').delete().eq('id', convId);
    if (tradeConvId) await admin.from('conversations').delete().eq('id', tradeConvId);
    await admin.from('trade_listings').delete().in('owner_id', users.map((u) => u.id));
    for (const u of users) await admin.auth.admin.deleteUser(u.id).catch(() => {});
    console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
    process.exit(failures ? 1 : 0);
  }
})();
