const test = require('node:test');
const assert = require('node:assert/strict');
const {
  exitsForLane,
  seedBlueprintDocument,
  normalizeBlueprint,
  validateBlueprint,
  hasGuaranteeLanguage,
  ESTIMATE_LABEL,
} = require('./blueprint-schema.js');

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);

function baseDoc(overrides = {}) {
  const doc = normalizeBlueprint(
    {
      lane: 'deliver_now',
      confidence: 'high',
      mirror: 'You want a booking page for your restaurant that actually takes deposits.',
      sources: [{ id: 'src_input', kind: 'text', label: 'booking page for my restaurant', status: 'read' }],
      findings: [
        {
          id: 'f1',
          kind: 'strength',
          text: 'Clear single purpose: take deposits.',
          evidence: [{ kind: 'input', sourceId: 'src_input' }],
        },
      ],
      blocks: [
        {
          id: 'b_vision',
          type: 'vision',
          headline: 'Deposits collected before the rush',
          outcome: 'A page that holds a deposit per booking',
          audience: 'Busy restaurant owners',
          successMetric: '10 paying bookings in week one',
        },
        {
          id: 'b_arch',
          type: 'architecture',
          headline: 'Three parts, no platform tax',
          components: [
            { name: 'Booking form', role: 'Captures slot and card hold', by: 'ai' },
          ],
          flow: [{ from: 'Visitor', to: 'Booking form' }],
        },
        {
          id: 'b_road',
          type: 'roadmap',
          headline: 'Two weeks to live',
          owner: 'both',
          totalDuration: '2 weeks',
          phases: {
            plan: { label: 'Scope', duration: '2 days', deliverable: 'One-pager scope' },
            design: { label: 'Wire', duration: '2 days', deliverable: 'Wireframe' },
            build: { label: 'Build', duration: '5 days', deliverable: 'Working page' },
            qa: { label: 'Test', duration: '2 days', deliverable: 'QA notes' },
            launch: { label: 'Ship', duration: '1 day', deliverable: 'Live page' },
          },
        },
        {
          id: 'b_est',
          type: 'estimate',
          headline: 'Fixed price, four to five thousand',
          kind: 'fixed',
          currency: 'EUR',
          low: 4000,
          high: null,
          label: ESTIMATE_LABEL,
          included: ['Booking page with card hold'],
          notIncluded: ['Native mobile apps'],
          assumptions: ['Client provides brand assets'],
        },
      ],
      quickWins: [],
      clarifyingQuestion: null,
      ethics: { status: 'clear', checks: [{ principle: 'honest claims', result: 'pass' }] },
    },
    { version: 1, cost: { tokensIn: 100, tokensOut: 400, searches: 0, usdEstimate: 0.01 }, now: NOW }
  );
  return { ...doc, ...overrides };
}

test('a well-formed deliver_now document validates clean', () => {
  const result = validateBlueprint(baseDoc());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('the normaliser fills server territory: exits, status, timestamps, cost', () => {
  const doc = normalizeBlueprint({ lane: 'reframe', confidence: 'reframed' }, { version: 3, cost: { tokensIn: 5 }, now: NOW });
  assert.equal(doc.version, 3);
  assert.equal(doc.status, 'validated');
  assert.equal(doc.createdAt, new Date(NOW).toISOString());
  assert.deepEqual(doc.exits, ['refine', 'convert']);
  assert.equal(doc.cost.tokensIn, 5);
  assert.equal(doc.cost.tokensOut, 0, 'missing usage is zero, never NaN');

  // Model-invented exits are overwritten, not trusted.
  const withExits = normalizeBlueprint({ lane: 'decline', exits: ['convert', 'buy'] });
  assert.deepEqual(withExits.exits, ['refine']);
});

test('non-objects normalise to null so the caller can repair', () => {
  assert.equal(normalizeBlueprint(null), null);
  assert.equal(normalizeBlueprint('a string'), null);
  assert.equal(normalizeBlueprint([1, 2]), null);
});

test('exits follow the lane and only grow for quick wins', () => {
  assert.deepEqual(exitsForLane('deliver_now', 0), ['refine', 'convert']);
  assert.deepEqual(exitsForLane('deliver_now', 2), ['refine', 'convert', 'quick_win']);
  assert.deepEqual(exitsForLane('decline', 3), ['refine']);
  assert.deepEqual(exitsForLane('needs_review'), ['refine']);
});

test('lane/confidence pairing is enforced', () => {
  assert.equal(validateBlueprint(baseDoc({ confidence: 'medium' })).ok, false);
  assert.match(validateBlueprint(baseDoc({ confidence: 'medium' })).errors.join(), /requires confidence high/);
  assert.equal(validateBlueprint(baseDoc({ lane: 'scope_first', confidence: 'needs_discovery' })).ok, false,
    'scope_first needs the discovery-sprint estimate, missing here');
  assert.equal(validateBlueprint(baseDoc({ lane: 'alien' })).ok, false);
});

test('word caps hard-fail: mirror, findings, headlines', () => {
  const long = (n) => Array.from({ length: n + 1 }, (_, i) => `w${i}`).join(' ');
  assert.equal(validateBlueprint(baseDoc({ mirror: long(31) })).ok, false);
  assert.equal(validateBlueprint(baseDoc({ findings: [{ id: 'f', kind: 'gap', text: long(10), evidence: [{ kind: 'input', sourceId: 'src_input' }] }] })).ok, false);

  const doc = baseDoc();
  doc.blocks[0].headline = long(13);
  assert.equal(validateBlueprint(doc).ok, false);
});

test('findings are capped at three and every one needs resolvable evidence', () => {
  const mk = (id) => ({ id, kind: 'insight', text: 'Short and sharp', evidence: [{ kind: 'input', sourceId: 'src_input' }] });
  assert.equal(validateBlueprint(baseDoc({ findings: [mk(1), mk(2), mk(3), mk(4)] })).ok, false);

  const orphan = baseDoc();
  orphan.findings[0].evidence = [{ kind: 'input', sourceId: 'missing_source' }];
  const result = validateBlueprint(orphan);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /unknown source/);

  const unweb = baseDoc();
  unweb.findings[0].evidence = [{ kind: 'research', url: 'https://example.com/x' }];
  assert.equal(validateBlueprint(unweb, { fetchedUrls: [] }).ok, false, 'research needs a fetched url');
  assert.equal(validateBlueprint(unweb, { fetchedUrls: ['https://example.com/x'] }).ok, true);
});

test('block order is checked and buildable lanes need all four blocks', () => {
  const doc = baseDoc();
  const [vision, arch, road, est] = doc.blocks;
  doc.blocks = [est, road, arch, vision];
  const result = validateBlueprint(doc);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /out of order/);

  const missing = baseDoc();
  missing.blocks = missing.blocks.slice(0, 3);
  assert.match(validateBlueprint(missing).errors.join(), /requires a estimate block/);
});

test('decline and needs_review carry no blocks and pair with ethics', () => {
  const declined = baseDoc({ lane: 'decline', confidence: null, blocks: [], exits: ['refine'], ethics: { status: 'declined', checks: [] } });
  assert.deepEqual(validateBlueprint(declined).errors, []);

  const badDecline = baseDoc({ lane: 'decline', confidence: null, exits: ['refine'], ethics: { status: 'clear', checks: [] } });
  assert.match(validateBlueprint(badDecline).errors.join(), /ethics.status declined/);

  const withBlocks = baseDoc({ lane: 'decline', confidence: null, exits: ['refine'], ethics: { status: 'declined', checks: [] } });
  assert.match(validateBlueprint(withBlocks).errors.join(), /must not carry blocks/);
});

test('estimate kind is pinned per lane and the label is exact', () => {
  const doc = baseDoc();
  doc.blocks[3].label = 'Draft estimate';
  assert.match(validateBlueprint(doc).errors.join(), /label must be exactly/);

  const sprint = baseDoc({ lane: 'scope_first', confidence: 'needs_discovery' });
  sprint.blocks[3].kind = 'discovery_sprint';
  sprint.blocks[3].low = 800;
  sprint.blocks[3].high = 1500;
  assert.deepEqual(validateBlueprint(sprint).errors, []);

  const wrong = baseDoc();
  wrong.blocks[3].kind = 'discovery_sprint';
  wrong.blocks[3].high = 1500;
  assert.match(validateBlueprint(wrong).errors.join(), /lane deliver_now requires estimate kind/);
});

test('guarantee language is blocked anywhere, honest negations pass', () => {
  assert.equal(hasGuaranteeLanguage('We guarantee results in 30 days'), true);
  assert.equal(hasGuaranteeLanguage('100% success rate'), true);
  assert.equal(hasGuaranteeLanguage('No risk for you at all'), true);
  assert.equal(hasGuaranteeLanguage('We make no guarantees in this business'), false);
  assert.equal(hasGuaranteeLanguage('Nothing here is guaranteed'), false);
  assert.equal(hasGuaranteeLanguage('A fixed price you can plan around'), false);

  const doc = baseDoc();
  doc.blocks[3].assumptions = ['Guaranteed delivery within the sprint'];
  const result = validateBlueprint(doc);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(), /guarantee language/);
});

test('clarifying questions need 2 to 4 short options', () => {
  const ok = baseDoc({ clarifyingQuestion: { text: 'Is this for one venue or a chain?', options: ['One venue', 'A chain'] } });
  assert.deepEqual(validateBlueprint(ok).errors, []);

  const bad = baseDoc({ clarifyingQuestion: { text: 'Pick one', options: ['Only one option'] } });
  assert.match(validateBlueprint(bad).errors.join(), /2 to 4 entries/);

  const none = baseDoc({ clarifyingQuestion: { text: 'Pick', options: ['a', 'b', 'c', 'd', 'e'] } });
  assert.match(validateBlueprint(none).errors.join(), /2 to 4 entries/);
});

test('exits that are not server-computed fail validation', () => {
  const doc = baseDoc({ exits: ['refine'] });
  assert.match(validateBlueprint(doc).errors.join(), /exits must be the server-computed/);
});

test('the draft seed carries only the intake, nothing invented', () => {
  const seed = seedBlueprintDocument('  A booking page for my restaurant  ');
  assert.equal(seed.input, 'A booking page for my restaurant');
  assert.equal(seed.sources.length, 1);
  assert.equal(seed.sources[0].status, 'read');
  assert.equal('findings' in seed, false);
  assert.equal('blocks' in seed, false);
});

test('cost must be present and non-negative', () => {
  const doc = baseDoc();
  doc.cost.usdEstimate = -1;
  assert.match(validateBlueprint(doc).errors.join(), /cost.usdEstimate/);
  const missing = baseDoc();
  delete missing.cost.tokensIn;
  assert.match(validateBlueprint(missing).errors.join(), /cost.tokensIn/);
});
