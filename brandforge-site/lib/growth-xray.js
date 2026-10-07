'use strict';

const { fetchUrl } = require('./growth-fetch.js');
const { llmJsonWithRepair } = require('./growth-llm.js');
const { growthConfig } = require('./growth-config.js');

const XRAY_SYSTEM = `You are a competitive analyst. Analyze the provided competitor data and return a structured X-ray.
Return JSON with:
- positioning_map: array of { competitor, positioning, strengths, weaknesses }
- offers: array of { competitor, offer, pricing_signal }
- hooks: array of { competitor, hook, platform }
- formats: array of { competitor, format, posting_frequency }
- gaps: array of { area, your_opportunity, effort }
- angles: array of { angle, rationale, test_hypothesis }

Every claim must cite its source URL or "user-provided screenshot".`;

function validateXray(result) {
  if (!result || typeof result !== 'object') return { ok: false, errors: ['not_an_object'] };
  const errors = [];
  if (!Array.isArray(result.positioning_map)) errors.push('positioning_map_not_array');
  if (!Array.isArray(result.offers)) errors.push('offers_not_array');
  if (!Array.isArray(result.hooks)) errors.push('hooks_not_array');
  if (!Array.isArray(result.formats)) errors.push('formats_not_array');
  if (!Array.isArray(result.gaps)) errors.push('gaps_not_array');
  if (!Array.isArray(result.angles)) errors.push('angles_not_array');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [] };
}

function buildRepairPrompt({ previousJson, errors }) {
  return `Your previous X-ray failed validation. Fix every issue and return the complete corrected JSON object only.
VALIDATION ERRORS: ${errors.join(', ')}
PREVIOUS OUTPUT: ${String(previousJson).slice(0, 8000)}`;
}

async function analyzeCompetitors(competitorData, brandKit, { fetchImpl, lookupImpl, config: configOverride } = {}) {
  const config = configOverride || growthConfig();

  const competitorSummary = competitorData.map((c, i) => {
    const parts = [`Competitor ${i + 1}: ${c.url}`];
    if (c.content) parts.push(`Content: ${c.content.slice(0, 3000)}`);
    if (c.notes) parts.push(`Notes: ${c.notes}`);
    return parts.join('\n');
  }).join('\n\n');

  const brandSummary = brandKit
    ? `Your brand kit:\nName: ${brandKit.name || 'N/A'}\nOffer: ${brandKit.offer || 'N/A'}\nAudience: ${brandKit.audience || 'N/A'}\nKey claims: ${(brandKit.key_claims || []).join(', ')}`
    : 'No brand kit provided.';

  const userPrompt = `${brandSummary}

${competitorSummary}

Analyze these competitors and identify gaps and angles worth testing.`;

  const result = await llmJsonWithRepair({
    system: XRAY_SYSTEM,
    user: userPrompt,
    validate: validateXray,
    buildRepairPrompt,
    cheap: false,
    fetchImpl,
    config,
  });

  if (!result.parsed) {
    return { ok: false, error: 'parse_failed', detail: 'LLM returned unparseable JSON' };
  }

  const validation = validateXray(result.parsed);
  if (!validation.ok) {
    return { ok: false, error: 'validation_failed', detail: validation.errors.join(', ') };
  }

  return {
    ok: true,
    xray: result.parsed,
    sources: competitorData.map((c) => c.url),
    cost: {
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      usdEstimate: result.usdEstimate,
    },
  };
}

async function runCompetitorXray(competitors, brandKit, { fetchImpl, lookupImpl, config: configOverride } = {}) {
  const config = configOverride || growthConfig();

  const competitorData = [];
  for (const comp of competitors) {
    if (comp.content) {
      competitorData.push({ url: comp.url, content: comp.content, notes: comp.notes });
    } else {
      try {
        const page = await fetchUrl(comp.url, { fetchImpl, lookupImpl, config });
        competitorData.push({ url: comp.url, content: page.text.slice(0, 8000) });
      } catch (err) {
        competitorData.push({ url: comp.url, content: null, notes: `Fetch failed: ${String(err).slice(0, 200)}` });
      }
    }
  }

  return analyzeCompetitors(competitorData, brandKit, { fetchImpl, lookupImpl, config });
}

module.exports = {
  analyzeCompetitors,
  runCompetitorXray,
  validateXray,
  XRAY_SYSTEM,
};
