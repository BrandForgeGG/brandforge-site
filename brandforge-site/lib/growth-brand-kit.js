'use strict';

const { llmJsonWithRepair } = require('./growth-llm.js');
const { fetchUrl } = require('./growth-fetch.js');
const { growthConfig } = require('./growth-config.js');

const BRAND_KIT_SYSTEM = `You are a brand analyst. Extract brand identity from the provided web page content.
Return JSON with these fields:
- name: brand name (string)
- logo_url: URL to the logo if found (string or null)
- palette: array of hex color codes found on the site (array of strings)
- fonts: array of font families detected (array of strings)
- tone_of_voice: short description of the brand's communication style (string)
- audience: target audience description (string)
- offer: main product or service offer (string)
- key_claims: array of key marketing claims (array of strings)
- social_links: array of social media URLs (array of strings)

Only include information that is clearly present on the page. Use null for missing fields.`;

function validateBrandKit(result) {
  if (!result || typeof result !== 'object') return { ok: false, errors: ['not_an_object'] };
  const errors = [];
  if (result.name !== null && typeof result.name !== 'string') errors.push('name_not_string');
  if (result.logo_url !== null && typeof result.logo_url !== 'string') errors.push('logo_url_not_string');
  if (!Array.isArray(result.palette)) errors.push('palette_not_array');
  if (!Array.isArray(result.fonts)) errors.push('fonts_not_array');
  if (result.tone_of_voice !== null && typeof result.tone_of_voice !== 'string') errors.push('tone_not_string');
  if (result.audience !== null && typeof result.audience !== 'string') errors.push('audience_not_string');
  if (result.offer !== null && typeof result.offer !== 'string') errors.push('offer_not_string');
  if (!Array.isArray(result.key_claims)) errors.push('key_claims_not_array');
  if (!Array.isArray(result.social_links)) errors.push('social_links_not_array');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [] };
}

function buildRepairPrompt({ previousJson, errors }) {
  return `Your previous brand kit extraction failed validation. Fix every issue and return the complete corrected JSON object only.
VALIDATION ERRORS: ${errors.join(', ')}
PREVIOUS OUTPUT: ${String(previousJson).slice(0, 8000)}`;
}

async function extractBrandKitFromUrl(url, { fetchImpl, lookupImpl, config: configOverride } = {}) {
  const config = configOverride || growthConfig();

  let page;
  try {
    page = await fetchUrl(url, { fetchImpl, lookupImpl, config });
  } catch (err) {
    return { ok: false, error: 'fetch_failed', detail: String(err) };
  }

  const userPrompt = `Extract the brand kit from this web page:

URL: ${page.url}
Content-Type: ${page.contentType}
Content (first 12000 chars):
${page.text.slice(0, 12000)}`;

  const result = await llmJsonWithRepair({
    system: BRAND_KIT_SYSTEM,
    user: userPrompt,
    validate: validateBrandKit,
    buildRepairPrompt,
    cheap: true,
    fetchImpl,
    config,
  });

  if (!result.parsed) {
    return { ok: false, error: 'parse_failed', detail: 'LLM returned unparseable JSON' };
  }

  const validation = validateBrandKit(result.parsed);
  if (!validation.ok) {
    return { ok: false, error: 'validation_failed', detail: validation.errors.join(', ') };
  }

  return {
    ok: true,
    brandKit: {
      domain: new URL(page.url).hostname,
      name: result.parsed.name,
      logo_url: result.parsed.logo_url,
      palette: result.parsed.palette,
      fonts: result.parsed.fonts,
      tone_of_voice: result.parsed.tone_of_voice,
      audience: result.parsed.audience,
      offer: result.parsed.offer,
      key_claims: result.parsed.key_claims,
      social_links: result.parsed.social_links,
    },
    cost: {
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      usdEstimate: result.usdEstimate,
    },
  };
}

function normalizeBrandKitInput(input) {
  return {
    name: String(input.name || '').trim() || null,
    logo_url: String(input.logo_url || '').trim() || null,
    palette: Array.isArray(input.palette) ? input.palette.map(String) : [],
    fonts: Array.isArray(input.fonts) ? input.fonts.map(String) : [],
    tone_of_voice: String(input.tone_of_voice || '').trim() || null,
    audience: String(input.audience || '').trim() || null,
    offer: String(input.offer || '').trim() || null,
    key_claims: Array.isArray(input.key_claims) ? input.key_claims.map(String) : [],
    social_links: Array.isArray(input.social_links) ? input.social_links.map(String) : [],
  };
}

module.exports = {
  extractBrandKitFromUrl,
  validateBrandKit,
  normalizeBrandKitInput,
  BRAND_KIT_SYSTEM,
};
