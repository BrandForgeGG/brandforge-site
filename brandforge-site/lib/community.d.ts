// Types for the dependency-free CommonJS community links (lib/community.js).

export interface CommunityLink {
  label: string;
  href: string;
  description: string;
  handle?: string;
}

export declare const COMMUNITY_LINKS: {
  discord: CommunityLink;
  telegramChannel: CommunityLink;
  telegramGroup: CommunityLink;
  telegramManager: CommunityLink & { handle: string };
};
