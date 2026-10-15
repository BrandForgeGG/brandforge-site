'use strict';

// The house writing rules every BrandForge writer follows, so what members get reads like a sharp person wrote it, not
// like AI. Adapted from the MIT-licensed ECC article-writing and content-engine skills (affaan-m/ECC) and from what makes
// posts travel: the strongest thing first, one idea per piece, proof instead of adjectives, nothing invented.

const CRAFT_RULES = [
  'House style (follow strictly):',
  '- Lead with the strongest concrete thing: a result, a number, a tension, a before/after. No warm-up.',
  '- One idea per piece. Every line earns its place; cut anything templated, generic or self-congratulatory.',
  '- Proof over adjectives: name the specific thing, not how amazing it is.',
  '- Short, plain sentences in a sharp, human voice. Talk to one reader as "you".',
  '- Never invent facts, numbers, customers, reviews or results.',
  '- No engagement bait (no "agree?", no closing question added just for replies), no hashtag walls, no emoji strings.',
  '- Never use these: "in today\'s fast-paced world", "rapidly evolving", "landscape", "game-changer", "cutting-edge",',
  '  "revolutionary", "unlock", "unleash", "elevate", "seamless", "leverage", "delve", "harness the power",',
  '  "take it to the next level", "supercharge", "skyrocket", "empower", "embark", "journey", "look no further",',
  '  "dive into", "here\'s why this matters", "in conclusion", "transform your", "boost your", "the world of".',
].join('\n');

const BANNED = [
  /\bin today'?s (?:fast[- ]paced|digital|modern|rapidly)/i,
  /\brapidly evolving\b/i,
  /\b(?:digital |ever[- ]changing |competitive )?landscape\b/i,
  /\bgame[- ]?changer\b/i,
  /\bcutting[- ]edge\b/i,
  /\brevolutioni[sz]e|\brevolutionary\b/i,
  /\bunlock(?:s|ing)?\b/i,
  /\bunleash/i,
  /\belevate(?:s|d)?\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bleverag(?:e|es|ing)\b/i,
  /\bdelve/i,
  /\bharness the power/i,
  /\bnext level\b/i,
  /\bsupercharg/i,
  /\bskyrocket/i,
  /\bempower/i,
  /\bembark/i,
  /\blook no further\b/i,
  /\bdive (?:deep )?into\b/i,
  /\bhere'?s why (?:this|it) matters\b/i,
  /\bin conclusion\b/i,
  /\btransform your\b/i,
  /\bboost your\b/i,
  /\bthe world of\b/i,
];

/** The banned AI-isms found in a piece of text (empty when it is clean). */
function findSlop(text) {
  const value = String(text || '');
  const found = [];
  for (const pattern of BANNED) {
    const m = pattern.exec(value);
    if (m) found.push(m[0]);
  }
  return found;
}

/** Two or more AI-isms: worth asking another writer before settling for it. */
function isSloppy(text) {
  return findSlop(text).length >= 2;
}

/** A system prompt with the house rules added. */
function withCraft(system) {
  return `${String(system || '').trim()}\n\n${CRAFT_RULES}`;
}

module.exports = { CRAFT_RULES, findSlop, isSloppy, withCraft };
