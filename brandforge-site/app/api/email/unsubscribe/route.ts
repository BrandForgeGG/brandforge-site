import { NextRequest, NextResponse } from 'next/server';
import { setMarketingOptIn } from '@/lib/project-db';
import { readUnsubscribeToken } from '@/lib/unsubscribe-token';

export const dynamic = 'force-dynamic';

// GET /api/email/unsubscribe?token=… — one click from any email footer turns
// off product-update emails (profiles.marketing_opt_in). Project email
// (proposals, contracts, delivery) always stays: those are transactional.
//
// GET is deliberate: it is the only method an email link can trigger without
// HTML. The action is idempotent, so a mail-scanner prefetch just re-runs an
// unsubscribe that already happened — it never re-subscribes anyone.

function page(title: string, message: string, ok: boolean) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;background:#faf9f7;color:#14171a;font-family:Georgia,serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
main{max-width:480px;background:#fff;border:1px solid #e6e1d8;border-radius:16px;padding:32px}
h1{font-size:24px;margin:0 0 12px}p{font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#55595e;margin:0 0 8px}
a{color:#e8571e}.k{color:#e8571e;text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-family:Arial,sans-serif;margin:0 0 14px}</style>
</head><body><main><p class="k">${ok ? 'BrandForge' : 'Unsubscribe'}</p><h1>${title}</h1><p>${message}</p>
<p><a href="https://brandforge.gg">brandforge.gg</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') ?? '';
    const userId = readUnsubscribeToken(token);

    if (!userId) {
      return page(
        'This link is not valid',
        'The unsubscribe link could not be verified. Sign in and turn off product updates in Settings instead, or ignore this message.',
        false
      );
    }

    const updated = await setMarketingOptIn(userId, false);
    if (!updated) {
      return page(
        'Could not update your choice',
        'Something went wrong on our side. Please ignore this — or unsubscribe from Settings after signing in.',
        false
      );
    }

    return page(
      'You are unsubscribed',
      'Product updates are off. You will still get project email — proposals, contracts, delivery and payment notices — because those belong to your project, not to marketing.',
      true
    );
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return page('Could not update your choice', 'Something went wrong. Please try again later.', false);
  }
}
