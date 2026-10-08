'use strict';

// Sector guardrail for what BrandForge will create or promote. Deliberately plain: a short list of
// clear-cut categories matched on whole words, a neutral explanation, and a way to ask a person to
// look again. It runs on what people type, never silently rewrites anything.

const CATEGORIES = [
  {
    id: 'gambling',
    label: 'gambling',
    pattern: /\b(casino|sportsbook|sports betting|online betting|bookmaker|slot machines?|online slots|poker site|lottery tickets?|betting tips)\b/i,
  },
  {
    id: 'lending',
    label: 'interest-based lending',
    pattern: /\b(payday loans?|loan sharks?|interest[- ]bearing loans?|high[- ]interest loans?|cash advance loans?|buy now pay later with interest)\b/i,
  },
  {
    id: 'adult',
    label: 'adult content',
    pattern: /\b(porn|pornography|xxx|escort service|adult entertainment|nsfw|strip club|erotic)\b/i,
  },
  {
    id: 'intoxicants',
    label: 'alcohol, tobacco or drugs',
    pattern: /\b(alcohol brand|beer brand|vodka|whisk(?:e)?y|cocktail bar|liquor store|brewery|winery|cannabis|marijuana|weed shop|vape shop|tobacco|cigarettes?)\b/i,
  },
  {
    id: 'deceptive',
    label: 'misleading offers',
    pattern: /\b(ponzi|pyramid scheme|get[- ]rich[- ]quick|guaranteed returns?|fake reviews?|buy followers|miracle cure)\b/i,
  },
];

// Returns { ok: true } or { ok: false, category, label, message }.
function screenText(text) {
  const value = typeof text === 'string' ? text : '';
  if (!value) return { ok: true };
  for (const category of CATEGORIES) {
    if (category.pattern.test(value)) {
      return {
        ok: false,
        category: category.id,
        label: category.label,
        message: `BrandForge doesn't create or promote ${category.label}. If this is a mistake, say what the business really does and a person will take a look.`,
      };
    }
  }
  return { ok: true };
}

module.exports = { CATEGORIES, screenText };
