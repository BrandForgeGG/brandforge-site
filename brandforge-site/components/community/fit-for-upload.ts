'use client';

import { uploadPlan } from '@/lib/upload-fit.js';

// Makes a set of pictures small enough to send in one request. Usually they already are and go untouched; a long carousel
// is re-encoded as high-quality JPEG (on white, since JPEG has no transparency), and only a very large set is scaled down.
export async function fitForUpload(blobs: Blob[]): Promise<Blob[]> {
  const plan = uploadPlan(blobs.map((blob) => blob.size));
  if (!plan.reencode) return blobs;
  const out: Blob[] = [];
  for (const blob of blobs) {
    const bitmap = await createImageBitmap(blob);
    const width = Math.round(bitmap.width * plan.scale);
    const height = Math.round(bitmap.height * plan.scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      out.push(blob);
      continue;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob((value) => resolve(value), 'image/jpeg', plan.quality));
    out.push(jpeg ?? blob);
  }
  return out;
}

export function extensionOf(blob: Blob): string {
  return blob.type === 'image/jpeg' ? 'jpg' : 'png';
}
