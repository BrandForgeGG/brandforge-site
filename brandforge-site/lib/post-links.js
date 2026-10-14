'use strict';

// The public address of a post BrandForge just sent, built from what the network answered. Networks that answer with an
// address directly (Mastodon, Threads, Instagram) pass it through; the rest give an id that is turned into the page people
// open. Anything that cannot be turned into a public https address returns null, and nothing is listed.
function postUrl(kind, channel, result) {
  if (!result || !result.ok) return null;
  if (typeof result.url === 'string' && /^https:\/\//.test(result.url)) return result.url;
  const ref = result.ref == null ? '' : String(result.ref);
  if (!ref) return null;
  const meta = (channel && channel.meta) || {};
  const label = String((channel && channel.label) || '');
  if (kind === 'telegram') {
    // Only public channels (linked as @name) have public message links.
    const handle = label.startsWith('@') ? label.slice(1) : '';
    return handle && /^\d+$/.test(ref) ? `https://t.me/${handle}/${ref}` : null;
  }
  if (kind === 'bluesky') {
    const rkey = ref.split('/').pop();
    const handle = String(meta.handle || '');
    return handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null;
  }
  if (kind === 'tumblr') {
    const blog = String(meta.blog || '');
    return blog && /^\d+$/.test(ref) ? `https://${blog}.tumblr.com/post/${ref}` : null;
  }
  if (kind === 'linkedin') return /^urn:li:(share|ugcPost|activity):\d+$/.test(ref) ? `https://www.linkedin.com/feed/update/${ref}` : null;
  if (kind === 'facebook') return /^\d+(_\d+)?$/.test(ref) ? `https://www.facebook.com/${ref}` : null;
  return null;
}

module.exports = { postUrl };
