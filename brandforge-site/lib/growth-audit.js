'use strict';

const { fetchUrl } = require('./growth-fetch.js');
const { llmJsonWithRepair } = require('./growth-llm.js');
const { growthConfig } = require('./growth-config.js');

const AUDIT_RUBRIC = [
  { key: 'message_clarity', weight: 20, description: 'Is the value proposition clear within 5 seconds?' },
  { key: 'offer_cta', weight: 20, description: 'Is there a clear offer and call-to-action?' },
  { key: 'seo_basics', weight: 15, description: 'Are SEO basics present (title, meta, headings)?' },
  { key: 'speed', weight: 15, description: 'Is the page fast (LCP < 2.5s)?' },
  { key: 'social_presence', weight: 15, description: 'Are social links and signals present?' },
  { key: 'ads_presence', weight: 10, description: 'Is there evidence of ads or conversion tracking?' },
  { key: 'ai_search_visibility', weight: 5, description: 'Is the brand mentioned in AI search results?' },
];

function scoreFromContent(text, meta) {
  const scores = {};
  const lower = text.toLowerCase();

  const hasH1 = /<h1[\s>]/i.test(text);
  const hasTitle = meta.title && meta.title.length > 10;
  const hasMetaDesc = meta.description && meta.description.length > 50;
  const hasValueProp = /(we|our|help|build|create|make|grow|improve|boost|increase|save|reduce|get|find|discover|learn|start|try|free|best|top|leading|#1)/i.test(text.slice(0, 2000));
  scores.message_clarity = (hasH1 ? 10 : 0) + (hasValueProp ? 10 : 0);

  const hasCTA = /(sign up|subscribe|contact|call|book|schedule|buy|order|download|register|get started|try now|learn more|read more|click here|shop now|add to cart|checkout|donate|join|follow|share)/i.test(lower);
  const hasOffer = /(price|pricing|plan|package|service|product|solution|feature|benefit|guarantee|free|discount|sale|offer|deal|promo)/i.test(lower);
  scores.offer_cta = (hasCTA ? 10 : 0) + (hasOffer ? 10 : 0);

  scores.seo_basics = (hasTitle ? 5 : 0) + (hasMetaDesc ? 5 : 0) + (hasH1 ? 5 : 0);

  const hasFavicon = /<link[^>]*rel=["']?icon/i.test(text);
  const hasOgTags = /<meta[^>]*property=["']og:/i.test(text);
  const hasTwitterCard = /<meta[^>]*name=["']twitter:/i.test(text);
  const hasCanonical = /<link[^>]*rel=["']canonical/i.test(text);
  scores.speed = (hasFavicon ? 5 : 0) + (hasOgTags ? 5 : 0) + (hasTwitterCard ? 3 : 0) + (hasCanonical ? 2 : 0);

  const socialPatterns = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'github.com'];
  const socialCount = socialPatterns.filter((p) => lower.includes(p)).length;
  scores.social_presence = Math.min(15, socialCount * 3);

  const hasGtm = /googletagmanager\.com|gtm-/i.test(text);
  const hasGa = /google-analytics\.com|gtag\(|ga\(/i.test(text);
  const hasFbq = /facebook\.com\/tr|fbq\(/i.test(text);
  const hasTiktokPixel = /tiktok\.com\/i18n\/pixel/i.test(text);
  scores.ads_presence = (hasGtm ? 4 : 0) + (hasGa ? 3 : 0) + (hasFbq ? 2 : 0) + (hasTiktokPixel ? 1 : 0);

  scores.ai_search_visibility = 0;

  return scores;
}

function computeTotal(scores) {
  let total = 0;
  for (const item of AUDIT_RUBRIC) {
    total += scores[item.key] || 0;
  }
  return Math.min(100, Math.round(total));
}

function identifyGaps(scores) {
  const gaps = [];
  for (const item of AUDIT_RUBRIC) {
    const score = scores[item.key] || 0;
    const max = item.weight;
    const pct = score / max;
    if (pct < 0.6) {
      gaps.push({
        key: item.key,
        score,
        max,
        severity: pct < 0.3 ? 'high' : 'medium',
        description: item.description,
        fix: getFixForGap(item.key),
        effort: getEffortForGap(item.key),
      });
    }
  }
  return gaps.sort((a, b) => (a.score / a.max) - (b.score / b.max)).slice(0, 5);
}

function getFixForGap(key) {
  const fixes = {
    message_clarity: 'Add a clear H1 with your value proposition in the first 10 words',
    offer_cta: 'Add a prominent CTA button above the fold with action-oriented copy',
    seo_basics: 'Add a unique title tag (50-60 chars) and meta description (150-160 chars)',
    speed: 'Optimize images, enable compression, and use a CDN for static assets',
    social_presence: 'Add social media links in the header or footer',
    ads_presence: 'Install Google Tag Manager and set up conversion tracking',
    ai_search_visibility: 'Create content that answers common questions about your industry',
  };
  return fixes[key] || 'Review and improve this area';
}

function getEffortForGap(key) {
  const efforts = {
    message_clarity: 'low',
    offer_cta: 'low',
    seo_basics: 'low',
    speed: 'medium',
    social_presence: 'low',
    ads_presence: 'medium',
    ai_search_visibility: 'high',
  };
  return efforts[key] || 'medium';
}

const AI_SEARCH_SYSTEM = `You are a search analyst. Given a brand name and category, respond with whether this brand would likely appear in AI search results for that category.
Return JSON: { "mentioned": boolean, "reason": string, "confidence": "low" | "medium" | "high" }`;

async function checkAiSearchVisibility(brandName, category, { fetchImpl, config: configOverride } = {}) {
  const config = configOverride || growthConfig();
  const userPrompt = `Brand: ${brandName}\nCategory: ${category}\nWould this brand be mentioned or cited in AI search results for this category?`;

  const result = await llmJsonWithRepair({
    system: AI_SEARCH_SYSTEM,
    user: userPrompt,
    validate: (r) => {
      if (!r || typeof r.mentioned !== 'boolean') return { ok: false, errors: ['invalid_shape'] };
      return { ok: true, errors: [] };
    },
    buildRepairPrompt: ({ errors }) => `Fix: ${errors.join(', ')}`,
    cheap: true,
    fetchImpl,
    config,
  });

  return result.parsed || { mentioned: false, reason: 'Analysis failed', confidence: 'low' };
}

async function runAudit(url, { socialHandles, fetchImpl, lookupImpl, config: configOverride } = {}) {
  const config = configOverride || growthConfig();

  let page;
  try {
    page = await fetchUrl(url, { fetchImpl, lookupImpl, config });
  } catch (err) {
    return { ok: false, error: 'fetch_failed', detail: String(err) };
  }

  const meta = extractMeta(page.text);
  const scores = scoreFromContent(page.text, meta);

  if (socialHandles && socialHandles.length > 0) {
    scores.social_presence = Math.min(15, scores.social_presence + socialHandles.length * 2);
  }

  const total = computeTotal(scores);
  const gaps = identifyGaps(scores);

  const brandName = meta.title?.split(/[|\-–—]/)[0]?.trim() || new URL(page.url).hostname;
  const category = meta.description?.slice(0, 50) || 'general';

  let aiVisibility = { mentioned: false, reason: 'Not checked', confidence: 'low' };
  if (config.researchEnabled) {
    aiVisibility = await checkAiSearchVisibility(brandName, category, { fetchImpl, config });
    if (aiVisibility.mentioned) {
      scores.ai_search_visibility = 5;
    }
  }

  const finalTotal = computeTotal(scores);

  return {
    ok: true,
    url: page.url,
    score: finalTotal,
    breakdown: scores,
    gaps,
    aiVisibility,
    meta: {
      title: meta.title,
      description: meta.description,
    },
    cost: {
      tokensIn: 0,
      tokensOut: 0,
      usdEstimate: 0,
    },
  };
}

function extractMeta(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    description: descMatch ? descMatch[1].trim() : null,
  };
}

module.exports = {
  AUDIT_RUBRIC,
  scoreFromContent,
  computeTotal,
  identifyGaps,
  runAudit,
  checkAiSearchVisibility,
  extractMeta,
};
