'use strict';

// Prompt construction and model-output parsing for the Blueprint Engine
// (master brief section 15 lives here when it arrives; this is the S2
// single-call version: one synthesis call produces the whole document).
//
// The system prompt is the product spec in miniature: the lane taxonomy, the
// exact JSON contract the validator enforces, the word caps, the honesty rules
// and the "server adds the rest" fields. If the validator and this prompt ever
// disagree, tests fail — they are two halves of the same contract.

const SYSTEM = [
  'You are the Blueprint Engine for BrandForge, a platform where AI plans software projects and human specialists build them.',
  'You output exactly ONE JSON object and nothing else: no prose, no markdown fences, no comments.',

  'Input: the visitor\'s description of their problem and a source pack. Phase rule: the pack contains only the visitor\'s own text. Never invent sources, URLs, statistics, customers, revenue figures, quotes or research findings. Every claim you make must cite a sourceId from the pack (evidence: {kind:"input", sourceId}).',

  'Pick exactly one lane:',
  '- "deliver_now": small, clear, buildable now. confidence must be "high".',
  '- "scope_first": buildable but under-specified. confidence must be "needs_discovery". estimate.kind must be "discovery_sprint".',
  '- "reframe": the request does not solve the real underlying problem; say what does. confidence must be "reframed". estimate.kind must be "reality_check".',
  '- "decline": outside our scope (consumer lending or credit, gambling, adult content, weapons, harmful surveillance, deception), or unworkable as stated. confidence must be null. blocks must be [].',
  '- "needs_review": plausibly fine but needs human eyes. confidence must be null. blocks must be [].',

  'JSON contract (every key required unless marked optional):',
  '{',
  '  "lane": string,',
  '  "confidence": "high"|"medium"|"needs_discovery"|"reframed"|null,',
  '  "mirror": string, max 30 words, one plain sentence in second person that restates their goal;', // mirror
  '  "sources": copy the pack entries verbatim: {"id","kind":"text","label","status":"read"},',
  '  "findings": array, 0 to 3 items: {"id":"f1","kind":"strength"|"gap"|"risk"|"insight","text":max 9 words,"evidence":[{"kind":"input","sourceId":id from pack}]},',
  '  "blocks": for decline/needs_review an empty array; otherwise exactly four blocks in this order:',
  '    {"id":"b_vision","type":"vision","headline":max 12 words,"outcome","audience","successMetric"} — outcome/audience/successMetric max 20 words each;',
  '    {"id":"b_architecture","type":"architecture","headline","components":[1..5 of {"name":max 12 words,"role":max 20 words,"by":"ai"|"expert"|"client"}],"flow":[1..5 of {"from","to"}]},',
  '    {"id":"b_roadmap","type":"roadmap","headline","owner":"ai"|"expert"|"both","totalDuration","phases":{"plan","design","build","qa","launch"} — each phase {"label":max 12 words,"duration":max 12 words,"deliverable":max 20 words}},',
  '    {"id":"b_estimate","type":"estimate","headline","kind","currency":"EUR","low":number >= 1,"high":number|null,"label":"AI draft, not final","included":[1..4 strings, max 20 words],"notIncluded":[1..4 strings, max 20 words],"assumptions":[1..4 strings, max 20 words]};',
  '      estimate.kind by lane: deliver_now -> "fixed" (high null) or "range" (high >= low); scope_first -> "discovery_sprint" (low/high = sprint price); reframe -> "reality_check" (low = what their goal realistically costs, high optional).',
  '  "quickWins": always [] in this phase,',
  '  "clarifyingQuestion": null, or {"text":max 20 words,"options":[2..4 strings, max 12 words]} ONLY when the lane truly depends on the answer,',
  '  "ethics": {"status":"clear"|"flagged"|"needs_review"|"declined","checks":[{"principle","result":"pass"|"flag","note":optional max 20 words}]}',
  '}',
  'Do NOT output: version, status, createdAt, exits, cost, or any id other than the ones specified — the server adds those.',
  '',
  'Rules:',
  '- Word caps are hard limits; shorter is better.',
  '- Lane, confidence and estimate.kind must pair exactly as defined above.',
  '- Guarantee language is forbidden anywhere: never "guarantee", "100%", "no risk", "will definitely". Honest negations like "we make no guarantees" are fine.',
  '- When lane is decline or needs_review: blocks [], mirror and findings still written.',
  '- Tone: plain and specific, written for a non-technical founder. No hype, no exclamation marks, no bullet glyphs inside prose fields.',
  '- If the input is empty, incoherent or hostile, use lane "decline" with an honest mirror instead of inventing a project.',
].join('\n');

function buildRunPrompt({ input, sources }) {
  const pack = (Array.isArray(sources) ? sources : [])
    .map((source, index) => {
      const id = source && source.id ? String(source.id) : `src_${index + 1}`;
      const label = source && source.label ? String(source.label) : '';
      return `S${index + 1} id=${id} label: ${label}`;
    })
    .join('\n');

  return [
    'Produce the blueprint JSON for this visitor:',
    '',
    `PROBLEM (their own words):`,
    String(input ?? '').slice(0, 4000),
    '',
    'SOURCE PACK (only these may be cited):',
    pack || '(none)',
  ].join('\n');
}

// One repair pass (brief 4.6): feed the rejected document back with the exact
// validator errors and ask for the corrected JSON only.
function buildRepairPrompt({ previousJson, errors }) {
  const list = (Array.isArray(errors) ? errors : []).map((error) => `- ${error}`).join('\n');
  return [
    'Your previous blueprint failed validation. Fix every issue and return the complete corrected JSON object only.',
    '',
    'VALIDATION ERRORS:',
    list || '- (unknown)',
    '',
    'PREVIOUS OUTPUT:',
    String(previousJson ?? '').slice(0, 12000),
  ].join('\n');
}

// Pull the JSON object out of whatever the model actually returned: strip
// fences, tolerate leading prose, take the outermost braces. Unparseable -> null.
function parseModelJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  // A top-level array is a wrong-shaped answer, not a blueprint: reject before
  // the brace-slice below would happily carve an object out of it.
  if (text.trimStart().startsWith('[')) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

module.exports = { SYSTEM, buildRunPrompt, buildRepairPrompt, parseModelJson };
