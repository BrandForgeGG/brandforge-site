export type Theme = 'light' | 'original';

export declare const THEME_KEY: string;
export declare const VALID_THEMES: Theme[];
export declare function normalizeTheme(value: string | null | undefined): Theme;
export declare function applyTheme(theme: Theme): void;
export declare function getStoredTheme(): Theme;
export declare function setStoredTheme(theme: Theme): Theme;
