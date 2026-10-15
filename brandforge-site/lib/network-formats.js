'use strict';

// One post, every network, each in its own format. A single picture is drawn at the shape each network shows best
// (4:5 in Instagram, Facebook, Threads, LinkedIn and Tumblr; 16:9 in X, Mastodon and Discord; square in Bluesky and
// Telegram), and the caption is fitted to each network's length and hashtag habits, cut at a sentence and keeping the
// call to action, instead of being chopped mid-word. Pure, so node:test can check every rule.

const NETWORKS = {
  instagram: { label: 'Instagram', shape: 'portrait', ratio: '4:5', limit: 2200, tags: 8 },
  facebook: { label: 'Facebook', shape: 'portrait', ratio: '4:5', limit: 2000, tags: 2 },
  threads: { label: 'Threads', shape: 'portrait', ratio: '4:5', limit: 500, tags: 1 },
  linkedin: { label: 'LinkedIn', shape: 'portrait', ratio: '4:5', limit: 3000, tags: 3 },
  tumblr: { label: 'Tumblr', shape: 'portrait', ratio: '4:5', limit: 4000, tags: 5 },
  x: { label: 'X', shape: 'wide', ratio: '16:9', limit: 280, tags: 2 },
  mastodon: { label: 'Mastodon', shape: 'wide', ratio: '16:9', limit: 500, tags: 3 },
  discord: { label: 'Discord', shape: 'wide', ratio: '16:9', limit: 2000, tags: 0 },
  bluesky: { label: 'Bluesky', shape: 'square', ratio: '1:1', limit: 300, tags: 2 },
  telegram: { label: 'Telegram', shape: 'square', ratio: '1:1', limit: 1024, tags: 2 },
  slack: { label: 'Slack', shape: 'square', ratio: '1:1', limit: 3000, tags: 0 },
};

const FALLBACK = { label: 'Other', shape: 'portrait', ratio: '4:5', limit: 2000, tags: 3 };

function networkOf(kind) {
  return NETWORKS[kind] || FALLBACK;
}

const length = (text) => [...text].length;
const TAG = /(^|\s)#[\p{L}\p{N}_]+/gu;

/** The caption's hashtags (as written) and the text without them. */
function splitTags(caption) {
  const tags = [];
  const body = String(caption || '')
    .replace(TAG, (match) => {
      tags.push(match.trim());
      return ' ';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { body, tags: [...new Set(tags)] };
}

/** Cuts text to at most `max` characters at the last sentence end, else the last word, adding an ellipsis. */
function cutText(text, max) {
  if (length(text) <= max) return text;
  if (max <= 1) return '';
  const chars = [...text].slice(0, max - 1).join('');
  const sentence = Math.max(chars.lastIndexOf('. '), chars.lastIndexOf('! '), chars.lastIndexOf('? '), chars.lastIndexOf('\n'));
  if (sentence > max * 0.3) return chars.slice(0, sentence + 1).trim();
  const word = chars.lastIndexOf(' ');
  return `${(word > max * 0.5 ? chars.slice(0, word) : chars).trimEnd()}…`;
}

/**
 * The caption for one network: its hashtag budget, its length limit, cut at a sentence (never mid-word), and the last
 * line kept when it is a short call to action ("Comment GUIDE…", "Link in bio") so the ask survives the cut.
 */
function fitCaption(kind, caption) {
  const net = networkOf(kind);
  const { body, tags } = splitTags(caption);
  const tagLine = tags.slice(0, net.tags).join(' ');
  const join = (text) => [text, tagLine].filter(Boolean).join('\n\n');
  if (length(join(body)) <= net.limit) return join(body);
  // Drop hashtags before words when space is tight.
  const room = net.limit - (tagLine ? length(tagLine) + 2 : 0);
  if (room < Math.min(120, net.limit / 2)) return cutText(body, net.limit);
  const lines = body.split('\n');
  let last = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      last = lines[i].trim();
      break;
    }
  }
  const keepLast = last && length(last) <= Math.min(120, room / 3) && lines.length > 1;
  if (keepLast) {
    const head = body.slice(0, body.lastIndexOf(last)).trim();
    const cut = cutText(head, room - length(last) - 2);
    if (cut) return join(`${cut}\n\n${last}`);
  }
  return join(cutText(body, room));
}

/**
 * Groups the chosen channels into versions: channels that get the same picture shape and the same caption go out
 * together. `kinds` maps a channel id to its kind. Returns [{ shape, caption, channelIds }].
 */
function versionsFor(channelIds, kinds, caption, singlePicture) {
  const groups = new Map();
  for (const id of channelIds) {
    const kind = kinds[id];
    const shape = singlePicture ? networkOf(kind).shape : 'native';
    const text = fitCaption(kind, caption);
    const key = `${shape}\u0000${text}`;
    if (!groups.has(key)) groups.set(key, { shape, caption: text, channelIds: [] });
    groups.get(key).channelIds.push(id);
  }
  return [...groups.values()];
}

module.exports = { NETWORKS, networkOf, splitTags, cutText, fitCaption, versionsFor };
