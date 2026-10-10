import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { clearProfileAvatar, setProfileAvatar } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 1024 * 1024;

// What the bytes really are, whatever the file name says.
function kind(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// POST (multipart, field "file"): your new profile picture. The browser has already cropped and shrunk it.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to change your picture.' }, { status: 401 });
  const rate = checkRateLimit(`avatar:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'That is a lot of changes. Try again in a while.' }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Pick a picture first.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That picture is too large.' }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = kind(bytes);
  if (!type) return NextResponse.json({ error: 'Use a JPG, PNG or WebP picture.' }, { status: 400 });
  const saved = await setProfileAvatar(user.id, bytes, type);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
  return NextResponse.json({ url: saved.url });
}

// DELETE: go back to the initials.
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await clearProfileAvatar(user.id))) return NextResponse.json({ error: 'Could not remove the picture. Try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
