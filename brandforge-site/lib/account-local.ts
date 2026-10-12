// What this browser keeps for the signed-in person (a written week, the channels picked, drafts). Signing out must not leave
// the last person's work on screen for the next one, so every sign-out path calls this.
const KEYS = ['bf:distribute', 'bf:distribute-channels', 'bf:carousel-draft', 'bf:carousel-resume'];
const PREFIXES = ['bf:composer:'];

export function clearAccountLocalState(): void {
  try {
    for (const key of KEYS) window.localStorage.removeItem(key);
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && PREFIXES.some((prefix) => key.startsWith(prefix))) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be blocked; nothing was kept then.
  }
}
