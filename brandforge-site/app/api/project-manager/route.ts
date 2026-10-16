import { NextResponse } from 'next/server';
import { getProjectManager } from '@/lib/project-db';

export const revalidate = 3600;

// GET: who manages funded projects (the founder): name and picture only, so chats can mark them as project manager.
export async function GET() {
  const manager = await getProjectManager().catch(() => null);
  return NextResponse.json({ name: manager?.name ?? null, avatarUrl: manager?.avatarUrl ?? null });
}
