import { NextRequest, NextResponse } from 'next/server';
import { growthConfig } from '@/lib/growth-config';
import { extractBrandKitFromUrl, normalizeBrandKitInput } from '@/lib/growth-brand-kit';
import { createSupabaseAdminClient } from '@/lib/project-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const config = growthConfig();
    if (!config.enabled || !config.brandKitEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { url, edits } = body as { url?: string; edits?: Record<string, unknown> };

    if (edits) {
      const normalized = normalizeBrandKitInput(edits);
      if (!normalized) {
        return NextResponse.json({ error: 'Invalid brand kit data' }, { status: 400 });
      }
      const admin = createSupabaseAdminClient();
      if (!admin) {
        return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
      }
      const row = { domain: String(body.domain || 'manual') ?? 'manual', ...(normalized as NonNullable<typeof normalized>) };
      const { error } = await admin.from('brand_kits').insert(row);
      if (error) {
        return NextResponse.json({ error: 'Save failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, brandKit: normalized });
    }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const result = await extractBrandKitFromUrl(url, { config });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, detail: result.detail },
        { status: result.error === 'fetch_failed' ? 400 : 502 }
      );
    }

    const admin = createSupabaseAdminClient();
    if (admin && result.brandKit) {
      await admin.from('brand_kits').insert(result.brandKit);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Brand kit error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
