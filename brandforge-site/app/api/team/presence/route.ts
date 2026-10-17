import { NextResponse } from 'next/server';
import { listTeamPresence } from '@/lib/project-db';

export const revalidate = 60;

// GET: who is on the BrandForge team and when each was last active (names, roles and times only).
export async function GET() {
  const team = await listTeamPresence().catch(() => []);
  return NextResponse.json({ team });
}
