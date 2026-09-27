// Types for the dependency-free CommonJS embed rendering rules (lib/embed-actions.js).

export type EmbedActionName =
  | 'accept'
  | 'details'
  | 'submit_funding'
  | 'accept_contract'
  | 'edit_contract';

export interface EmbedControl {
  action: EmbedActionName;
  label: string;
}

/** Live contract row as far as the card rules care about it. */
export interface EmbedContract {
  status?: string;
  founder_accepted_at?: string | null;
  team_accepted_at?: string | null;
}

export declare function isActionable(
  embed: { type: string; status?: string } | null | undefined,
  canDecide: boolean | undefined
): boolean;

export declare function embedActions(input: {
  embed?: { type: string; status?: string } | null;
  canDecide?: boolean;
  isStaff?: boolean;
  contract?: EmbedContract | null;
}): EmbedControl[];

export declare function contractSignature(
  contract: EmbedContract | null | undefined
): { status: string; founderSigned: boolean; teamSigned: boolean } | null;

export declare function showsFundingForm(
  embed: { type: string; status?: string } | null | undefined,
  canDecide: boolean | undefined
): boolean;
