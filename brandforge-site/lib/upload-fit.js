'use strict';

// One request to the site can carry at most about 4.5 MB (the hosting limit), and a carousel saved as full-quality PNG can
// be bigger than that. This decides, from the picture sizes alone, whether the pictures go as they are or are re-encoded
// as high-quality JPEG first, and how hard. Pure, so the browser and the tests share it.
const BUDGET = 3.8 * 1024 * 1024; // leaves room for the caption and the form's own overhead

/** @returns {{ reencode: false } | { reencode: true, quality: number, scale: number }} */
function uploadPlan(sizes, budget = BUDGET) {
  const total = (Array.isArray(sizes) ? sizes : []).reduce((sum, size) => sum + (Number(size) || 0), 0);
  if (total <= budget) return { reencode: false };
  // JPEG at 0.88 is usually 5 to 8 times smaller than these PNGs; very long carousels also get a little smaller.
  if (total <= budget * 6) return { reencode: true, quality: 0.88, scale: 1 };
  return { reencode: true, quality: 0.8, scale: 0.85 };
}

module.exports = { BUDGET, uploadPlan };
