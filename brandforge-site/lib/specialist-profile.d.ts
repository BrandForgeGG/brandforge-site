export interface SpecialistProfileInput {
  handle: string;
  displayName: string;
  headline: string;
  bio: string;
  skills: string[] | string;
  portfolio: { title: string; url: string }[];
  isPublic: boolean;
}
export interface SpecialistProfileValue {
  handle: string;
  displayName: string;
  headline: string;
  bio: string;
  skills: string[];
  portfolio: { title: string; url: string }[];
  isPublic: boolean;
}
export declare const HANDLE: RegExp;
export declare function toHandle(value: string): string;
export declare function safeUrl(value: string): string | null;
export declare function validateProfile(input: Partial<SpecialistProfileInput>): { ok: true; value: SpecialistProfileValue } | { ok: false; error: string };
