// Spots when someone is asking the chat to make a post, so the chat can offer the visual maker.
// Pure and conservative: it needs both a "make something" verb and a format word.

const KINDS = [
  ['carousel', /\b(carousels?|slides?|slideshow)\b/i],
];

const VERB = /\b(make|create|write|build|design|draft|generate|turn)\b/i;

// -> { kind, topic } | null. topic is the part after "about / on / for" when there is one.
function detectMakeIntent(text) {
  const value = String(text ?? '').trim();
  if (value.length < 8 || value.length > 600 || !VERB.test(value)) return null;
  for (const [kind, pattern] of KINDS) {
    if (!pattern.test(value)) continue;
    const about = value.match(/\b(?:about|on|for|regarding)\s+(.{4,})$/i);
    return { kind, topic: about ? about[1].trim().slice(0, 500) : '' };
  }
  return null;
}

module.exports = { detectMakeIntent };
