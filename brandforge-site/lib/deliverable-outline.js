'use strict';

// Reads the structure of an AI answer so the right-hand panel can mirror it live: the goal
// line, the stated assumptions, and the section headings with how many steps sit under each.
// Pure and forgiving: the answer is markdown written by a model, so every pattern is optional.

const MAX_SECTIONS = 12;

function clean(text) {
  return String(text ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[:\s]+$/, '')
    .trim();
}

function labelled(markdown, label) {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s+)?\\*{0,2}(?:${label})\\*{0,2}\\s*:?\\s*\\*{0,2}\\s*(.+)$`, 'im');
  const match = pattern.exec(markdown);
  if (!match) return null;
  const value = clean(match[1]);
  return value.length > 0 ? value.slice(0, 400) : null;
}

function extractOutline(markdown) {
  const text = String(markdown ?? '');
  if (!text.trim()) return null;

  const goal = labelled(text, 'Goal');
  const assumptions = labelled(text, 'Assuming|Assumptions');

  const sections = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const heading = /^#{1,4}\s+(.+)$/.exec(line) || /^\*\*([^*]{3,60})\*\*\s*:?\s*$/.exec(line.trim());
    if (heading) {
      const title = clean(heading[1]);
      if (title && !/^(goal|assuming|assumptions)$/i.test(title)) {
        current = { title: title.slice(0, 80), items: 0 };
        sections.push(current);
        if (sections.length >= MAX_SECTIONS) break;
      }
      continue;
    }
    if (current && /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line)) current.items += 1;
  }

  if (!goal && !assumptions && sections.length === 0) return null;
  return { goal, assumptions, sections };
}

module.exports = { extractOutline };
