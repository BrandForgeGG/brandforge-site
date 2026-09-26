// Types for the dependency-free CommonJS identity display helpers (lib/identity-display.js).

export interface AvatarTone {
  backgroundColor: string;
  color: string;
}

export declare function initialsFor(name: string | null | undefined): string;
export declare function avatarTone(key: string | null | undefined): AvatarTone;
export declare function avatarLabel(displayName: string | null | undefined): string;
export declare function formatRole(role: string | null | undefined): string;
export declare const AVATAR_TONES: AvatarTone[];
