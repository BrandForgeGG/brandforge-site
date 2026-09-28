'use strict';

// Pure layer for the GitHub -> #dev-log receiver (app/api/webhooks/github).
//
// Public-eligibility is deliberately narrow, per the spec's security guardrail:
// only stable releases and merged PRs carrying the `public-changelog` label may
// reach the public channel. Raw pushes, opened PRs, deployment failures and
// anything security-shaped stay internal — a public changelog must never become
// a vulnerability disclosure feed.

const crypto = require('node:crypto');

const PUBLIC_CHANGELOG_LABEL = 'public-changelog';

/** HMAC-SHA256 check for the x-hub-signature-256 header. False on any mismatch. */
function verifyGitHubSignature({ rawBody, signatureHeader, secret }) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  let actual;
  try {
    actual = Buffer.from(signatureHeader.slice(prefix.length), 'hex');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Map a GitHub webhook delivery to a dev-log post, or null when the delivery is
 * not public-eligible. Never throws on hostile payloads.
 */
function devLogForGithubEvent({ eventName, payload }) {
  if (!payload || typeof payload !== 'object') return null;

  if (eventName === 'release' && payload.action === 'published') {
    const release = payload.release || {};
    if (release.prerelease) return null;
    const name = String(release.name || release.tag_name || '').trim();
    if (!name) return null;
    const notes = String(release.body || '').trim();
    return {
      title: `Shipped: ${name}`,
      description: notes ? notes.slice(0, 500) : undefined,
      url: typeof release.html_url === 'string' ? release.html_url : undefined,
    };
  }

  if (eventName === 'pull_request' && payload.action === 'closed') {
    const pr = payload.pull_request || {};
    if (!pr.merged) return null;
    const labels = Array.isArray(pr.labels) ? pr.labels : [];
    const publicLabeled = labels.some(
      (label) => label && String(label.name || label).toLowerCase() === PUBLIC_CHANGELOG_LABEL
    );
    if (!publicLabeled) return null;
    const title = String(pr.title || '').trim();
    if (!title) return null;
    return {
      title: `Merged: ${title}`,
      description: undefined,
      url: typeof pr.html_url === 'string' ? pr.html_url : undefined,
    };
  }

  return null;
}

module.exports = { PUBLIC_CHANGELOG_LABEL, verifyGitHubSignature, devLogForGithubEvent };
