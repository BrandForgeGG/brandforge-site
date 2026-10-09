'use strict';

// Fetches a picture a person points at (a page's preview image) for the carousel tool, behind the
// same default-deny network rules as research: every hostname is resolved and refused if it points
// at a private, loopback or metadata address, every redirect is re-checked, the body is capped while
// it streams, and the bytes must really be an image (sniffed, not trusted from the header).
const { assertSafeUrl } = require('./research');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function sniff(bytes) {
  if (!bytes || bytes.length < 200) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  return null;
}

/** @returns {Promise<{ bytes: Uint8Array, contentType: string }>} throws a short error code on failure */
async function fetchImageSafe(rawUrl, { fetchImpl = fetch, lookupImpl, timeoutMs = 6000, maxBytes = MAX_IMAGE_BYTES } = {}) {
  let current = await assertSafeUrl(String(rawUrl || '').trim(), { lookupImpl });
  let response;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await fetchImpl(current.href, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'image/*' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) break;
    if (hop === MAX_REDIRECTS) throw new Error('image_too_many_redirects');
    current = await assertSafeUrl(new URL(location, current.href).href, { lookupImpl });
  }
  if (!response.ok) throw new Error(`image_http_${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('image_too_large');

  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  let bytes;
  if (reader) {
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('image_too_large');
      }
      chunks.push(value);
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error('image_too_large');
  }
  const contentType = sniff(bytes);
  if (!contentType) throw new Error('image_not_an_image');
  return { bytes, contentType };
}

module.exports = { fetchImageSafe, sniff, MAX_IMAGE_BYTES };
