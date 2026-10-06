import { notFound, permanentRedirect } from 'next/navigation';
import { blueprintConfig } from '@/lib/blueprint-config';

// Evaluated per request so flipping BLUEPRINT_ENABLED takes effect on the next
// redeploy without touching code. Dormant (404) whenever the flag is off —
// same gate as the API routes.
export const dynamic = 'force-dynamic';

// Redesign slice B: the blueprint flow now lives inside the chat shell (the
// chat-first architecture from the master brief), so the standalone page
// retires with a permanent redirect. Old links, bookmarks and the sitemap
// entry all land on /chat; the stash/panel flow takes over from there.
export default function BlueprintPage() {
  const config = blueprintConfig();
  if (!config.enabled) notFound();
  permanentRedirect('/chat');
}
