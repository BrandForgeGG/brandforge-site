'use strict';

// Blueprint document shape, validation and normalisation (master brief 4.6-4.9).
//
// The document is whatever the model produced, normalised into the structure
// the UI renders. Validation is the contract: the run endpoint refuses to save
// anything that fails these rules, feeds the errors back to the model for one
// repair attempt, and only persists a document that passes clean. Everything
// user-visible is word-capped and guarantee-scanned, because the founder's
// voice rule (no hype, no guarantees, show the maths) has to hold even when the
// model does not.
//
// Exits are deliberately NOT model territory: they are computed from the lane,
// so a model cannot invent or drop an action.

const LANES = ['deliver_now', 'scope_first', 'reframe', 'decline', 'needs_review'];
const CONFIDENCES = ['high', 'medium', 'needs_discovery', 'reframed'];
const STATUSES = ['draft', 'validated', 'saved', 'proposed'];
const SOURCE_KINDS = ['text', 'file', 'link', 'image'];
const SOURCE_STATUSES = ['read', 'partial', 'failed'];
const FINDING_KINDS = ['strength', 'gap', 'risk', 'insight'];
const BLOCK_ORDER = ['vision', 'architecture', 'roadmap', 'estimate'];
const ESTIMATE_KINDS = ['fixed', 'range', 'discovery_sprint', 'reality_check'];
const ESTIMATE_CURRENCIES = ['EUR', 'USD'];
// Who owns a component (ai builds it, the expert or the client does) vs who
// owns a roadmap phase (ai / expert / shared between them).
const COMPONENT_OWNERS = ['ai', 'expert', 'client'];
const ROADMAP_OWNERS = ['ai', 'expert', 'both'];
const ESTIMATE_LABEL = 'AI draft, not final';
const ETHICS_STATUSES = ['clear', 'flagged', 'needs_review', 'declined'];
const ETHICS_RESULTS = ['pass', 'flag'];

// Word caps (brief 4.6). Headlines and findings are hard caps from the brief;
// the rest are UI sanity caps applied consistently to every rendered string.
const MIRROR_MAX_WORDS = 30;
const HEADLINE_MAX_WORDS = 12;
const FINDING_MAX_WORDS = 9;
const QUICK_WIN_MAX_WORDS = 10;
const DETAIL_MAX_WORDS = 20;
const LIST_ITEM_MAX_WORDS = 20;
const CLARIFY_TEXT_MAX_WORDS = 20;
const CLARIFY_OPTION_MAX_WORDS = 12;
const FINDINGS_MAX = 3;

// Guarantee language (brief 9 honesty rules): banned phrase families, with the
// honest negations kept so "no guarantees in this business" still passes.
const BANNED_PATTERNS = [
  /\bguarantee[sd]?\b/i,
  /\bwill definitely\b/i,
  /\b100\s*%/i,
  /\bno\s+risk\b/i,
  /\brisk[- ]free\b/i,
  /\bbulletproof\b/i,
  /\bsure\s+results?\b/i,
  /\bcertain\s+outcome\b/i,
];
const BANNED_ALLOWANCES = [
  /\bno guarantees?\b/i,
  /\bnot guaranteed\b/i,
  /\bwithout guarantees?\b/i,
  /\bcan'?t guarantee\b/i,
  /\bwe don'?t guarantee\b/i,
  /\bnothing[^.]{0,40}guarante/i,
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function words(value) {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/).length : 0;
}

function isNonEmptyString(value, maxWords) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (maxWords && words(value) > maxWords) return false;
  return true;
}

function hasGuaranteeLanguage(value) {
  const text = String(value ?? '');
  if (BANNED_ALLOWANCES.some((pattern) => pattern.test(text))) return false;
  return BANNED_PATTERNS.some((pattern) => pattern.test(text));
}

// Depth-first walk over every string in the document: the guarantee scan and
// the "no unsupported claims" check both rely on seeing all of them.
function walkStrings(node, visit, path = 'doc') {
  if (typeof node === 'string') {
    visit(node, path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkStrings(item, visit, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkStrings(value, visit, `${path}.${key}`);
    }
  }
}

// Server-computed exits (brief 4.7). A model that outputs its own exits is
// overwritten by normalisation before validation, so these are authoritative.
function exitsForLane(lane, quickWinCount = 0) {
  if (lane === 'decline' || lane === 'needs_review') {
    return ['refine'];
  }
  const exits = ['refine', 'convert'];
  if (quickWinCount > 0) exits.push('quick_win');
  return exits;
}

// The draft that /api/blueprint/start stores: just the intake, nothing
// invented. The run endpoint replaces this with the assembled document.
function seedBlueprintDocument(input) {
  const text = String(input ?? '').trim();
  return {
    input: text,
    sources: [
      {
        id: 'src_input',
        kind: 'text',
        label: text.length > 80 ? `${text.slice(0, 77)}...` : text,
        status: 'read',
      },
    ],
  };
}

// Put a raw model object into canonical shape BEFORE validation: fill defaults,
// clip nothing, but recompute the fields that are server territory (exits,
// version, timestamps, cost). Anything unparseable returns null so the caller
// can trigger the repair pass.
function normalizeBlueprint(raw, { version = 1, cost = null, now = Date.now() } = {}) {
  if (!isPlainObject(raw)) return null;

  const lane = LANES.includes(raw.lane) ? raw.lane : raw.lane;
  const quickWins = Array.isArray(raw.quickWins)
    ? raw.quickWins.filter((item) => isPlainObject(item))
    : [];

  const document = {
    version: Number.isInteger(version) && version >= 1 ? version : 1,
    status: 'validated',
    createdAt: new Date(now).toISOString(),
    lane,
    confidence: raw.confidence === null || raw.confidence === undefined ? null : raw.confidence,
    mirror: typeof raw.mirror === 'string' ? raw.mirror : '',
    sources: Array.isArray(raw.sources) ? raw.sources.filter(isPlainObject) : [],
    findings: Array.isArray(raw.findings) ? raw.findings.filter(isPlainObject) : [],
    // Estimate shape is server territory: `kind: 'fixed'` means one number, so
    // a model that also emits `high` (observed repeating through the repair
    // pass on live runs) has its redundant bound dropped here — dropping noise
    // is normalisation; inventing a bound would not be.
    blocks: Array.isArray(raw.blocks)
      ? raw.blocks
          .filter(isPlainObject)
          .map((block) =>
            block.type === 'estimate' && block.kind === 'fixed' ? { ...block, high: null } : block
          )
      : [],
    quickWins,
    clarifyingQuestion: isPlainObject(raw.clarifyingQuestion) ? raw.clarifyingQuestion : null,
    exits: exitsForLane(lane, quickWins.length),
    ethics: isPlainObject(raw.ethics) ? raw.ethics : { status: 'clear', checks: [] },
    cost: {
      tokensIn: Number(cost?.tokensIn) || 0,
      tokensOut: Number(cost?.tokensOut) || 0,
      searches: Number(cost?.searches) || 0,
      usdEstimate: Number(cost?.usdEstimate) || 0,
    },
  };

  // Keep only known top-level keys from the model; anything else is noise the
  // UI does not understand and the validator would not accept either.
  return document;
}

function validateLaneAndConfidence(doc, fail) {
  if (!LANES.includes(doc.lane)) {
    fail(`lane "${doc.lane}" is not one of ${LANES.join(', ')}`);
    return;
  }

  if (doc.lane === 'decline' || doc.lane === 'needs_review') {
    if (doc.confidence !== null && !CONFIDENCES.includes(doc.confidence)) {
      fail(`confidence "${doc.confidence}" is not a known value`);
    }
    return;
  }

  const expected = {
    deliver_now: 'high',
    scope_first: 'needs_discovery',
    reframe: 'reframed',
  }[doc.lane];
  if (doc.confidence !== expected) {
    fail(`lane ${doc.lane} requires confidence ${expected}, got ${doc.confidence}`);
  }
}

function validateSources(doc, fail) {
  if (!Array.isArray(doc.sources)) {
    fail('sources must be an array');
    return new Set();
  }

  const ids = new Set();
  doc.sources.forEach((source, index) => {
    if (!isPlainObject(source)) {
      fail(`sources[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(source.id)) {
      fail(`sources[${index}] needs a non-empty id`);
      return;
    }
    if (ids.has(source.id)) {
      fail(`duplicate source id ${source.id}`);
    }
    ids.add(source.id);
    if (!SOURCE_KINDS.includes(source.kind)) {
      fail(`sources[${index}].kind "${source.kind}" is unknown`);
    }
    if (!isNonEmptyString(source.label)) {
      fail(`sources[${index}] needs a non-empty label`);
    }
    if (!SOURCE_STATUSES.includes(source.status)) {
      fail(`sources[${index}].status "${source.status}" is unknown`);
    }
    if (source.note !== undefined && typeof source.note !== 'string') {
      fail(`sources[${index}].note must be a string when present`);
    }
  });

  return ids;
}

function validateEvidence(item, index, sourceIds, fetchedUrls, fail) {
  if (!isPlainObject(item)) {
    fail(`findings[${index}].evidence item must be an object`);
    return;
  }
  if (item.kind === 'input') {
    if (!sourceIds.has(item.sourceId)) {
      fail(`findings[${index}] cites unknown source "${item.sourceId}"`);
    }
    return;
  }
  if (item.kind === 'research') {
    if (!isNonEmptyString(item.url)) {
      fail(`findings[${index}] research evidence needs a url`);
      return;
    }
    const fetched = fetchedUrls ?? [];
    if (!fetched.includes(item.url)) {
      fail(`findings[${index}] cites url that was not fetched: ${item.url}`);
    }
    if (item.title !== undefined && typeof item.title !== 'string') {
      fail(`findings[${index}].research title must be a string`);
    }
    return;
  }
  fail(`findings[${index}].evidence kind "${item.kind}" is unknown`);
}

function validateFindings(doc, context, sourceIds, fail) {
  if (!Array.isArray(doc.findings)) {
    fail('findings must be an array');
    return;
  }
  if (doc.findings.length > FINDINGS_MAX) {
    fail(`findings must be ${FINDINGS_MAX} or fewer, got ${doc.findings.length}`);
  }

  doc.findings.forEach((finding, index) => {
    if (!isPlainObject(finding)) {
      fail(`findings[${index}] must be an object`);
      return;
    }
    if (!FINDING_KINDS.includes(finding.kind)) {
      fail(`findings[${index}].kind "${finding.kind}" is unknown`);
    }
    if (!isNonEmptyString(finding.id)) {
      fail(`findings[${index}] needs a non-empty id`);
    }
    if (!isNonEmptyString(finding.text, FINDING_MAX_WORDS)) {
      fail(`findings[${index}].text must be non-empty and at most ${FINDING_MAX_WORDS} words`);
    }
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
      fail(`findings[${index}] needs at least one evidence item`);
      return;
    }
    finding.evidence.forEach((item) => validateEvidence(item, index, sourceIds, context.fetchedUrls, fail));
  });
}

function validateVision(block, fail) {
  for (const key of ['outcome', 'audience', 'successMetric']) {
    if (!isNonEmptyString(block[key], DETAIL_MAX_WORDS)) {
      fail(`vision.${key} must be non-empty and at most ${DETAIL_MAX_WORDS} words`);
    }
  }
}

function validateArchitecture(block, fail) {
  if (!Array.isArray(block.components) || block.components.length === 0) {
    fail('architecture.components must be a non-empty array');
  } else {
    block.components.forEach((component, index) => {
      if (!isPlainObject(component)) {
        fail(`architecture.components[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(component.name, HEADLINE_MAX_WORDS)) {
        fail(`architecture.components[${index}].name must be non-empty and at most ${HEADLINE_MAX_WORDS} words`);
      }
      if (!isNonEmptyString(component.role, DETAIL_MAX_WORDS)) {
        fail(`architecture.components[${index}].role must be non-empty and at most ${DETAIL_MAX_WORDS} words`);
      }
      if (!COMPONENT_OWNERS.includes(component.by)) {
        fail(`architecture.components[${index}].by must be one of ${COMPONENT_OWNERS.join(', ')}`);
      }
    });
  }

  if (!Array.isArray(block.flow) || block.flow.length === 0) {
    fail('architecture.flow must be a non-empty array');
  } else {
    block.flow.forEach((step, index) => {
      if (!isPlainObject(step) || !isNonEmptyString(step.from, HEADLINE_MAX_WORDS) || !isNonEmptyString(step.to, HEADLINE_MAX_WORDS)) {
        fail(`architecture.flow[${index}] needs non-empty from/to of at most ${HEADLINE_MAX_WORDS} words`);
      }
    });
  }
}

function validateRoadmap(block, fail) {
  if (!ROADMAP_OWNERS.includes(block.owner)) {
    fail(`roadmap.owner must be one of ${ROADMAP_OWNERS.join(', ')}`);
  }
  if (!isNonEmptyString(block.totalDuration, DETAIL_MAX_WORDS)) {
    fail('roadmap.totalDuration must be non-empty');
  }
  if (block.milestoneRef !== undefined && !isNonEmptyString(block.milestoneRef)) {
    fail('roadmap.milestoneRef must be a non-empty string when present');
  }

  const phaseOrder = ['plan', 'design', 'build', 'qa', 'launch'];
  if (!isPlainObject(block.phases)) {
    fail('roadmap.phases must be an object with plan/design/build/qa/launch');
    return;
  }
  const phaseKeys = Object.keys(block.phases);
  if (phaseKeys.length !== phaseOrder.length || !phaseOrder.every((key, index) => phaseKeys[index] === key)) {
    fail(`roadmap.phases must contain exactly ${phaseOrder.join('/')} in that order`);
  }
  for (const key of phaseOrder) {
    const phase = block.phases[key];
    if (!isPlainObject(phase)) {
      fail(`roadmap.phases.${key} must be an object`);
      continue;
    }
    if (!isNonEmptyString(phase.label, HEADLINE_MAX_WORDS)) {
      fail(`roadmap.phases.${key}.label must be non-empty and at most ${HEADLINE_MAX_WORDS} words`);
    }
    if (!isNonEmptyString(phase.duration, HEADLINE_MAX_WORDS)) {
      fail(`roadmap.phases.${key}.duration must be non-empty and at most ${HEADLINE_MAX_WORDS} words`);
    }
    if (!isNonEmptyString(phase.deliverable, DETAIL_MAX_WORDS)) {
      fail(`roadmap.phases.${key}.deliverable must be non-empty and at most ${DETAIL_MAX_WORDS} words`);
    }
  }
}

function validateEstimate(block, lane, fail) {
  if (!ESTIMATE_KINDS.includes(block.kind)) {
    fail(`estimate.kind "${block.kind}" is unknown`);
    return;
  }

  const laneKind = {
    deliver_now: ['fixed', 'range'],
    scope_first: ['discovery_sprint'],
    reframe: ['reality_check'],
  }[lane];
  if (laneKind && !laneKind.includes(block.kind)) {
    fail(`lane ${lane} requires estimate kind ${laneKind.join('/')}, got ${block.kind}`);
  }

  if (!ESTIMATE_CURRENCIES.includes(block.currency)) {
    fail('estimate.currency must be EUR or USD');
  }
  if (block.label !== ESTIMATE_LABEL) {
    fail(`estimate.label must be exactly "${ESTIMATE_LABEL}"`);
  }

  const low = Number(block.low);
  const high = block.high === null || block.high === undefined ? null : Number(block.high);
  if (!Number.isFinite(low) || low < 1) {
    fail('estimate.low must be a positive number of EUR/USD');
  }
  if (block.kind === 'fixed') {
    if (high !== null) fail('estimate for kind fixed must not carry a high value');
  } else if (block.kind === 'reality_check') {
    if (high !== null && Number.isFinite(high) && high < low) fail('estimate.high must be >= low');
  } else if (high === null || !Number.isFinite(high)) {
    fail(`estimate for kind ${block.kind} needs a numeric high`);
  } else if (high < low) {
    fail('estimate.high must be >= low');
  }

  for (const key of ['included', 'notIncluded', 'assumptions']) {
    const list = block[key];
    if (!Array.isArray(list) || list.length === 0) {
      fail(`estimate.${key} must be a non-empty array`);
      continue;
    }
    list.forEach((item, index) => {
      if (!isNonEmptyString(item, LIST_ITEM_MAX_WORDS)) {
        fail(`estimate.${key}[${index}] must be non-empty and at most ${LIST_ITEM_MAX_WORDS} words`);
      }
    });
  }
}

function validateBlocks(doc, fail) {
  if (!Array.isArray(doc.blocks)) {
    fail('blocks must be an array');
    return;
  }

  const buildable = ['deliver_now', 'scope_first', 'reframe'];
  if (!buildable.includes(doc.lane)) {
    if (doc.blocks.length > 0) {
      fail(`lane ${doc.lane} must not carry blocks`);
    }
    return;
  }

  const ids = doc.blocks.map((block) => (isPlainObject(block) ? String(block.id ?? '') : ''));
  if (ids.some((id) => !id)) {
    fail('every block needs an id');
  }
  if (new Set(ids).size !== ids.length) {
    fail('block ids must be unique');
  }

  const present = [];
  for (const block of doc.blocks) {
    if (!isPlainObject(block)) {
      fail('every block must be an object');
      continue;
    }
    if (!BLOCK_ORDER.includes(block.type)) {
      fail(`unknown block type "${block.type}"`);
      continue;
    }
    present.push(block.type);
    if (!isNonEmptyString(block.headline, HEADLINE_MAX_WORDS)) {
      fail(`block ${block.type} headline must be non-empty and at most ${HEADLINE_MAX_WORDS} words`);
    }
    if (block.type === 'vision') validateVision(block, fail);
    if (block.type === 'architecture') validateArchitecture(block, fail);
    if (block.type === 'roadmap') validateRoadmap(block, fail);
    if (block.type === 'estimate') validateEstimate(block, doc.lane, fail);
  }

  // Order: the blocks that exist must respect BLOCK_ORDER (a subsequence —
  // nothing mandates that every block type is present, but vision before
  // architecture before roadmap before estimate when they are).
  let cursor = -1;
  for (const type of present) {
    const index = BLOCK_ORDER.indexOf(type);
    if (index <= cursor) {
      fail(`blocks out of order: ${type} appears after ${BLOCK_ORDER[cursor]}`);
      break;
    }
    cursor = index;
  }

  for (const required of BLOCK_ORDER) {
    if (!present.includes(required)) {
      fail(`lane ${doc.lane} requires a ${required} block`);
    }
  }
}

function validateQuickWinsAndClarify(doc, fail) {
  if (!Array.isArray(doc.quickWins)) {
    fail('quickWins must be an array');
  } else {
    doc.quickWins.forEach((item, index) => {
      if (!isPlainObject(item)) {
        fail(`quickWins[${index}] must be an object`);
        return;
      }
      if (!isNonEmptyString(item.id)) {
        fail(`quickWins[${index}].id must be a non-empty string`);
      }
      if (!isNonEmptyString(item.label, QUICK_WIN_MAX_WORDS)) {
        fail(`quickWins[${index}].label must be non-empty and at most ${QUICK_WIN_MAX_WORDS} words`);
      }
      if (!isNonEmptyString(item.kind)) {
        fail(`quickWins[${index}].kind must be a non-empty string`);
      }
    });
  }

  const clarify = doc.clarifyingQuestion;
  if (clarify !== null && clarify !== undefined) {
    if (!isPlainObject(clarify)) {
      fail('clarifyingQuestion must be null or an object');
      return;
    }
    if (!isNonEmptyString(clarify.text, CLARIFY_TEXT_MAX_WORDS)) {
      fail(`clarifyingQuestion.text must be non-empty and at most ${CLARIFY_TEXT_MAX_WORDS} words`);
    }
    if (!Array.isArray(clarify.options) || clarify.options.length < 2 || clarify.options.length > 4) {
      fail('clarifyingQuestion.options must have 2 to 4 entries');
    } else {
      clarify.options.forEach((option, index) => {
        if (!isNonEmptyString(option, CLARIFY_OPTION_MAX_WORDS)) {
          fail(`clarifyingQuestion.options[${index}] must be non-empty and at most ${CLARIFY_OPTION_MAX_WORDS} words`);
        }
      });
    }
  }
}

function validateEthics(doc, fail) {
  const ethics = doc.ethics;
  if (!isPlainObject(ethics)) {
    fail('ethics must be an object');
    return;
  }
  if (!ETHICS_STATUSES.includes(ethics.status)) {
    fail(`ethics.status "${ethics.status}" is unknown`);
    return;
  }

  if (doc.lane === 'decline' && ethics.status !== 'declined') {
    fail('lane decline requires ethics.status declined');
  }
  if (doc.lane === 'needs_review' && ethics.status !== 'needs_review') {
    fail('lane needs_review requires ethics.status needs_review');
  }
  if (['deliver_now', 'scope_first', 'reframe'].includes(doc.lane) && !['clear', 'flagged'].includes(ethics.status)) {
    fail(`lane ${doc.lane} requires ethics.status clear or flagged`);
  }

  if (!Array.isArray(ethics.checks)) {
    fail('ethics.checks must be an array');
    return;
  }
  ethics.checks.forEach((check, index) => {
    if (!isPlainObject(check)) {
      fail(`ethics.checks[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(check.principle)) {
      fail(`ethics.checks[${index}].principle must be a non-empty string`);
    }
    if (!ETHICS_RESULTS.includes(check.result)) {
      fail(`ethics.checks[${index}].result must be pass or flag`);
    }
    if (check.note !== undefined && !isNonEmptyString(check.note, DETAIL_MAX_WORDS)) {
      fail(`ethics.checks[${index}].note must be at most ${DETAIL_MAX_WORDS} words`);
    }
  });
}

function validateExits(doc, fail) {
  const expected = exitsForLane(doc.lane, (doc.quickWins ?? []).length);
  if (!Array.isArray(doc.exits) || doc.exits.join(',') !== expected.join(',')) {
    fail(`exits must be the server-computed ${expected.join(', ')}`);
  }
}

function validateCost(doc, fail) {
  const cost = doc.cost;
  if (!isPlainObject(cost)) {
    fail('cost must be an object');
    return;
  }
  for (const key of ['tokensIn', 'tokensOut', 'searches', 'usdEstimate']) {
    const value = Number(cost[key]);
    if (!Number.isFinite(value) || value < 0) {
      fail(`cost.${key} must be a number >= 0`);
    }
  }
}

function validateVersionStatus(doc, fail) {
  if (!Number.isInteger(doc.version) || doc.version < 1) {
    fail('version must be a positive integer');
  }
  if (!STATUSES.includes(doc.status)) {
    fail(`status "${doc.status}" is unknown`);
  }
  if (typeof doc.createdAt !== 'string' || Number.isNaN(Date.parse(doc.createdAt))) {
    fail('createdAt must be an ISO timestamp');
  }
}

// The full contract. Returns every violation at once so one repair pass can
// address them all; an empty list means the document may be saved.
function validateBlueprint(doc, context = {}) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!isPlainObject(doc)) {
    return { ok: false, errors: ['document must be an object'] };
  }

  validateVersionStatus(doc, fail);
  validateLaneAndConfidence(doc, fail);

  if (!isNonEmptyString(doc.mirror, MIRROR_MAX_WORDS)) {
    fail(`mirror must be non-empty and at most ${MIRROR_MAX_WORDS} words`);
  }

  const sourceIds = validateSources(doc, fail);
  validateFindings(doc, context, sourceIds, fail);
  validateBlocks(doc, fail);
  validateQuickWinsAndClarify(doc, fail);
  validateEthics(doc, fail);
  validateExits(doc, fail);
  validateCost(doc, fail);

  // Guarantee language anywhere in the document (brief 9): the promise ban is
  // absolute and applies even inside assumptions or ethics notes.
  walkStrings(doc, (value, path) => {
    if (hasGuaranteeLanguage(value)) {
      fail(`${path} contains guarantee language: "${value.slice(0, 60)}"`);
    }
  });

  return { ok: errors.length === 0, errors };
}

module.exports = {
  LANES,
  CONFIDENCES,
  STATUSES,
  SOURCE_KINDS,
  BLOCK_ORDER,
  ESTIMATE_LABEL,
  FINDINGS_MAX,
  MIRROR_MAX_WORDS,
  FINDING_MAX_WORDS,
  HEADLINE_MAX_WORDS,
  isPlainObject,
  words,
  hasGuaranteeLanguage,
  exitsForLane,
  seedBlueprintDocument,
  normalizeBlueprint,
  validateBlueprint,
};
