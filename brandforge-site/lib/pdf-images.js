'use strict';

// A PDF made of pictures, one per page: how a carousel becomes a slide deck (LinkedIn and others show a PDF as a swipeable
// document). JPEG pages are stored as they are (DCTDecode), so the file is small and nothing is re-encoded. No library.

function bytesOf(text) {
  return new TextEncoder().encode(text);
}

/**
 * pages: [{ jpeg: Uint8Array, width: number, height: number }] (pixel sizes). Each page is sized to its picture at 72 dpi
 * scaled so the long side is 792 points (a letter page's height), keeping its shape.
 * @returns {Uint8Array}
 */
function imagesToPdf(pages) {
  const list = (Array.isArray(pages) ? pages : []).filter((page) => page && page.jpeg && page.jpeg.length > 0 && page.width > 0 && page.height > 0);
  if (list.length === 0) throw new Error('no_pages');
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? bytesOf(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const piece of body) push(piece);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // Objects: 1 catalog, 2 pages, then per page: page, image, content (3 each).
  const kids = list.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Count ${list.length} /Kids [${kids}] >>`]);
  list.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const scale = 792 / Math.max(page.width, page.height);
    const w = Math.round(page.width * scale * 100) / 100;
    const h = Math.round(page.height * scale * 100) / 100;
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
    object(imageId, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`, page.jpeg, '\nendstream']);
    object(contentId, [`<< /Length ${bytesOf(draw).length} >>\nstream\n${draw}\nendstream`]);
  });
  const count = 3 + list.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const bytes of parts) {
    out.set(bytes, at);
    at += bytes.length;
  }
  return out;
}

module.exports = { imagesToPdf };
