import { NextRequest, NextResponse } from "next/server";

/**
 * Determines if a request should be publicly accessible.
 * Guest conversations (no HttpOnly cookie) are public; all others require authentication.
 */
function isGuestConversation(request: NextRequest): boolean {
  // Guest conversations have no HttpOnly cookie (bf_guest)
  const guestCookie = request.cookies.get("bf_guest")?.value;
  return guestCookie === undefined;
}

/**
 * Handles guest chat requests.
 * Only serves /chat* endpoints when the user is a guest (no HttpOnly cookie).
 * All other routes remain protected.
 */
function handleGuestChat(request: NextRequest): NextResponse {
  const isGuest = isGuestConversation(request);

  if (isGuest) {
    // Guest can access /chat but not /blueprint (still protected by other guards)
    return NextResponse.json({
      status: 200,
      body: "Guest access granted"
    });
  }

  // Non-guest (authenticated) requests are handled normally by the app
  return NextResponse.next();
}

export function proxyHandler(req: NextRequest): NextResponse {
  const response = handleGuestChat(req);
  return response;
}
