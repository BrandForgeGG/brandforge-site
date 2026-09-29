import { NextRequest, NextResponse } from 'next/server';
import { verifyGitHubSignature, devLogForGithubEvent } from '@/lib/github-webhooks';
import { postDevLog, postPublicChangelog } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

// GitHub -> changelog receiver (build-in-public layer). Split routing: the staff
// dev-log gets everything public-eligible (stable releases + labeled merges), while
// the public changelog gets releases only — merge internals never leave the team.
// Only stable releases and merged PRs carrying the `public-changelog` label are
// eligible at all; everything else is acknowledged and ignored. Without
// GITHUB_WEBHOOK_SECRET the route does not exist (404) so scanners learn nothing.
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') ?? '';
    if (!verifyGitHubSignature({ rawBody, signatureHeader: signature, secret })) {
      console.warn('github webhook: signature mismatch');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    let payload: unknown = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const eventName = request.headers.get('x-github-event') ?? '';
    const post = devLogForGithubEvent({ eventName, payload });
    if (!post) {
      return NextResponse.json({ ignored: true });
    }

    await postDevLog(post);
    if (eventName === 'release') {
      await postPublicChangelog(post);
    }
    return NextResponse.json({ posted: true });
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
