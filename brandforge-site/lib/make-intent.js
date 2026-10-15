// Spots when someone is asking the chat to make a post, so the chat can offer the visual maker.
// Pure and conservative: it needs both a "make something" verb and a format word.

// Order matters: the first match wins. Image kinds need the word for the thing itself ("an ad", "an announcement")
// or "quote/tip/poll" followed by an image word, so "write a quote for the client" or "create a poll for my
// newsletter readers" never open a maker by accident.
const KINDS = [
  // Videos and articles open their maker in the chat too.
  ['video-launch', /\b(?:launch|promo|product)\s+(?:videos?|films?|trailers?)\b|\bpromo\s+clips?\b/i],
  ['video-long', /\b(?:long|youtube|widescreen|explainer)\s+videos?\b/i],
  ['video-square', /\bvideo\s+carousels?\b|\bsquare\s+videos?\b/i],
  ['video-short', /\b(?:videos?|reels?|shorts|tiktoks?)\b/i],
  ['article', /\b(?:articles?|blog\s+posts?)\b/i],
  ['carousel', /\b(carousels?|slides?|slideshow)\b/i],
  ['ad', /\b(?:ads?|adverts?|advertisements?)\b/i],
  ['quote', /\bquote\s+(?:cards?|images?|graphics?|posts?)\b/i],
  ['tip', /\btip\s+(?:cards?|images?|graphics?|posts?)\b/i],
  ['announcement', /\bannouncements?\b/i],
  ['question', /\bpoll\s+(?:cards?|images?|graphics?|posts?)\b/i],
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
