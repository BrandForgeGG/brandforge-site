// The BrandForge mark as an app icon (a rounded square), with the wordmark beside it unless iconOnly.
export function BrandMark({ iconOnly = false, size = 28 }: { iconOnly?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
      <img src="/discord-server-icon.png" alt="" width={size} height={size} className="shrink-0 rounded-[9px] shadow-sm ring-1 ring-black/5" style={{ width: size, height: size }} />
      {iconOnly ? null : (
        <span className="font-serif tracking-tight text-foreground">
          Brand<span className="text-ember">Forge</span>
        </span>
      )}
    </span>
  );
}
