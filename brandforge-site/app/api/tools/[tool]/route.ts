import { NextRequest, NextResponse } from 'next/server';
import { growthConfig } from '@/lib/growth-config';
import { getTools } from '@/lib/growth-tools';

export const dynamic = 'force-dynamic';

const VALID_TOOLS = new Set(getTools().map((t) => t.name));

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  try {
    const config = growthConfig();
    if (!config.enabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { tool } = await params;
    if (!VALID_TOOLS.has(tool)) {
      return NextResponse.json({ error: 'Unknown tool' }, { status: 404 });
    }

    const toolConfigKey = tool === 'brand' ? 'brandKitEnabled' : `${tool}Enabled`;
    if (!config[toolConfigKey as keyof typeof config]) {
      return NextResponse.json({ error: 'Tool not enabled' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      tool,
      message: 'Tool shell — implementation coming in later slices',
    });
  } catch (error) {
    console.error('Tools API error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
