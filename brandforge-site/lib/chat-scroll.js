// Transcript scroll behavior, kept dependency-free so node:test can cover the decision that
// decides whether a reader gets dragged back down while the AI is still writing.

// Within this many pixels of the end we treat the reader as "at the newest message".
export const STICK_THRESHOLD_PX = 140;

// True when the scroller already shows the newest content, including a transcript too short to
// scroll. Non-finite geometry (a detached node, a zero-height panel) counts as "at the end" so
// the view keeps following new messages instead of silently refusing to move.
export function isNearBottom(geometry, threshold = STICK_THRESHOLD_PX) {
  const scrollTop = Number(geometry?.scrollTop);
  const scrollHeight = Number(geometry?.scrollHeight);
  const clientHeight = Number(geometry?.clientHeight);

  if (
    !Number.isFinite(scrollTop) ||
    !Number.isFinite(scrollHeight) ||
    !Number.isFinite(clientHeight)
  ) {
    return true;
  }

  return scrollHeight - clientHeight - scrollTop <= Math.max(0, threshold);
}

// Should new content pull the view down? Only while the reader is at the end, or when the caller
// forces it - a message the reader just sent must always come into view.
export function shouldFollowNewContent({ stick }, force = false) {
  return force === true || stick === true;
}
