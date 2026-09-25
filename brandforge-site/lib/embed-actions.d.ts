// Types for the dependency-free CommonJS embed rendering rules (lib/embed-actions.js).

export type EmbedActionName = 'accept' | 'details' | 'submit_funding';

export interface EmbedControl {
  action: EmbedActionName;
  label: string;
}

export declare function isActionable(
  embed: { type: string; status?: string } | null | undefined,
  canDecide: boolean | undefined
): boolean;

export declare function embedActions(input: {
  embed?: { type: string; status?: string } | null;
  canDecide?: boolean;
}): EmbedControl[];

export declare function showsFundingForm(
  embed: { type: string; status?: string } | null | undefined,
  canDecide: boolean | undefined
): boolean;
