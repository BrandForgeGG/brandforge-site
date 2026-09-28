'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  PUBLIC_CHANGELOG_LABEL,
  verifyGitHubSignature,
  devLogForGithubEvent,
} = require('./github-webhooks.js');

function sign(body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

// ---------- signatures ----------

test('a correctly signed delivery verifies, anything else fails', () => {
  const body = JSON.stringify({ action: 'published' });
  const secret = 's3cret';
  assert.equal(
    verifyGitHubSignature({ rawBody: body, signatureHeader: sign(body, secret), secret }),
    true
  );
  assert.equal(
    verifyGitHubSignature({ rawBody: body, signatureHeader: sign(body, 'other'), secret }),
    false,
    'wrong secret'
  );
  assert.equal(
    verifyGitHubSignature({ rawBody: `${body} `, signatureHeader: sign(body, secret), secret }),
    false,
    'tampered body'
  );
  assert.equal(verifyGitHubSignature({ rawBody: body, signatureHeader: 'md5=abc', secret }), false);
  assert.equal(verifyGitHubSignature({ rawBody: body, signatureHeader: sign(body, secret) }), false);
  assert.equal(verifyGitHubSignature({}), false);
});

// ---------- event filtering ----------

test('stable releases are public, prereleases are not', () => {
  const post = devLogForGithubEvent({
    eventName: 'release',
    payload: {
      action: 'published',
      release: { name: 'v1.4.0', body: 'Scroll that respects you.', html_url: 'https://x/r' },
    },
  });
  assert.equal(post.title, 'Shipped: v1.4.0');
  assert.equal(post.url, 'https://x/r');

  assert.equal(
    devLogForGithubEvent({
      eventName: 'release',
      payload: { action: 'published', release: { tag_name: 'v9', prerelease: true } },
    }),
    null,
    'prereleases stay internal'
  );
});

test('only merged PRs with the public label reach the channel', () => {
  const labeled = (name) => ({
    eventName: 'pull_request',
    payload: {
      action: 'closed',
      pull_request: { merged: true, title: 'Fix scroll', labels: [{ name }], html_url: 'https://x/p' },
    },
  });
  assert.equal(devLogForGithubEvent(labeled(PUBLIC_CHANGELOG_LABEL)).title, 'Merged: Fix scroll');
  assert.equal(devLogForGithubEvent(labeled('internal')), null, 'unlabeled stays internal');
});

test('unmerged closes, opened PRs, pushes and junk never post', () => {
  const closed = {
    eventName: 'pull_request',
    payload: {
      action: 'closed',
      pull_request: { merged: false, title: 'Abandoned', labels: [{ name: PUBLIC_CHANGELOG_LABEL }] },
    },
  };
  assert.equal(devLogForGithubEvent(closed), null, 'unmerged close');

  assert.equal(
    devLogForGithubEvent({
      eventName: 'pull_request',
      payload: { action: 'opened', pull_request: { title: 'WIP', labels: [{ name: PUBLIC_CHANGELOG_LABEL }] } },
    }),
    null,
    'opened PR'
  );
  assert.equal(devLogForGithubEvent({ eventName: 'push', payload: { commits: [] } }), null);
  assert.equal(devLogForGithubEvent({ eventName: 'release', payload: null }), null);
  assert.equal(devLogForGithubEvent({}), null);
});
