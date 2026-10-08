import { NextRequest, NextResponse } from 'next/server';
import { adminDeleteChats, adminListChats, isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  if (!(await isAdminAccount(user.id))) return { error: NextResponse.json({ error: 'Admin access only' }, { status: 403 }) } as const;
  return { user } as const;
}

// GET /api/admin/chats: every chat, newest first, with who owns it and whether it is test traffic.
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ('error' in gate) return gate.error;
  return NextResponse.json({ chats: await adminListChats(500) });
}

// DELETE /api/admin/chats
//   { ids: [...] }                      delete the chosen chats
//   { mode: 'test' }                    delete every test or staff chat
//   { mode: 'all', confirm: 'DELETE ALL CHATS' }   delete every chat
// Bulk modes skip chats with money committed (a funded contract or live escrow); those are
// deleted one by one, on purpose.
export async function DELETE(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ('error' in gate) return gate.error;

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === 'all' ? 'all' : body.mode === 'test' ? 'test' : 'ids';

    if (mode === 'all' && body.confirm !== 'DELETE ALL CHATS') {
      return NextResponse.json({ error: 'Type DELETE ALL CHATS to confirm.' }, { status: 400 });
    }
    if (mode === 'ids' && !(Array.isArray(body.ids) && body.ids.length > 0)) {
      return NextResponse.json({ error: 'Pick at least one chat.' }, { status: 400 });
    }

    const result = await adminDeleteChats({ ids: Array.isArray(body.ids) ? body.ids : [], mode });
    console.info(`[admin] ${gate.user.id} deleted ${result.deleted} chats (mode ${mode}, ${result.skippedMoney} kept for money)`);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Admin chat delete error:', error);
    return NextResponse.json({ error: 'Could not delete the chats' }, { status: 500 });
  }
}
