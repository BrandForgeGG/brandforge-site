import { NextRequest, NextResponse } from 'next/server';
import { growthConfig } from '@/lib/growth-config';
import { runCompetitorXray } from '@/lib/growth-xray';
import { getSearchProvider } from '@/lib/growth-search';
import { createSupabaseAdminClient } from '@/lib/project-db';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const XRAY_RATE_LIMIT = { limit: 5, windowMs: 2592000000 };

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const config = growthConfig();
    if (!config.enabled || !config.researchEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ip = clientIp(request);
    const rate = checkRateLimit(`xray:${ip}`, XRAY_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSeconds: rate.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { competitors, brandKit } = body as {
      competitors?: Array<{ url: string; content?: string; notes?: string }>;
      brandKit?: Record<string, unknown>;
    };

    if (!competitors || !Array.isArray(competitors) || competitors.length === 0) {
      return NextResponse.json({ error: 'competitors array is required' }, { status: 400 });
    }
    if (competitors.length > 3) {
      return NextResponse.json({ error: 'Maximum 3 competitors allowed' }, { status: 400 });
    }

    const searchProvider = getSearchProvider(config);
    const result = await runCompetitorXray(competitors, brandKit, { config });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, detail: result.detail },
        { status: 502 }
      );
    }

    const admin = createSupabaseAdminClient();
    if (admin) {
      await admin.from('assets').insert({
        kind: 'competitor_xray',
        format: 'json',
        url: `/xray/${crypto.randomUUID()}`,
        metadata: { xray: result.xray, sources: result.sources },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('X-ray error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
