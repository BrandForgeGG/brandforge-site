// Types for the dependency-free GitHub webhook layer (lib/github-webhooks.js).

export declare const PUBLIC_CHANGELOG_LABEL: string;

export declare function verifyGitHubSignature(input: {
  rawBody?: string;
  signatureHeader?: string;
  secret?: string;
}): boolean;

export declare function devLogForGithubEvent(input: {
  eventName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}): { title: string; description?: string; url?: string } | null;
