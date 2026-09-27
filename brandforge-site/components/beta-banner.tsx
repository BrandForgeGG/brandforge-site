// One slim strip at the very top of every surface: landing, chat, and the AppShell pages.
// Open-beta context plus the promise the journey runs on — a human picks the project up.
// Server-safe (no state): it stays until the beta ends, then it is deleted in one commit.
export function BetaBanner() {
  return (
    <div
      className="border-b border-[#e8571e]/25 bg-[#191b1e]"
      role="status"
      aria-label="BrandForge open beta"
    >
      <div className="flex items-center gap-3 px-4 py-1.5 sm:px-6">
        <span className="shrink-0 rounded-full border border-[#e8571e]/40 bg-[#e8571e]/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#f6d6c3]">
          Open beta
        </span>
        <p className="truncate text-xs text-[#9aa0a6]">
          <span className="text-[#ece7de]">Real specialists are online.</span> Describe your
          project and one picks it up in your chat.
        </p>
      </div>
    </div>
  );
}
