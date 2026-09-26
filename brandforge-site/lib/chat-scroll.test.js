// Scroll follow behaviour: a founder who scrolled up to re-read their own brief must not be
// dragged back to the bottom by every streamed token, while a message they just sent always
// comes into view.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNearBottom, shouldFollowNewContent, STICK_THRESHOLD_PX } from './chat-scroll.js';

const atBottom = { scrollTop: 900, scrollHeight: 1000, clientHeight: 100 };

describe('isNearBottom', () => {
  it('treats the exact bottom and a short overshoot as at the end', () => {
    assert.equal(isNearBottom(atBottom), true);
    assert.equal(isNearBottom({ ...atBottom, scrollTop: 900 - STICK_THRESHOLD_PX }), true);
  });

  it('reports a reader who scrolled up as not at the end', () => {
    assert.equal(isNearBottom({ ...atBottom, scrollTop: 120 }), false);
    assert.equal(isNearBottom({ ...atBottom, scrollTop: 0 }), false);
  });

  it('follows the view for a transcript that cannot scroll', () => {
    assert.equal(isNearBottom({ scrollTop: 0, scrollHeight: 320, clientHeight: 600 }), true);
  });

  it('treats unusable geometry as at the end instead of refusing to move', () => {
    assert.equal(isNearBottom({}), true);
    assert.equal(isNearBottom(undefined), true);
    assert.equal(isNearBottom({ scrollTop: NaN, scrollHeight: 1000, clientHeight: 100 }), true);
  });

  it('honours a custom threshold', () => {
    const geometry = { scrollTop: 800, scrollHeight: 1000, clientHeight: 100 };
    assert.equal(isNearBottom(geometry, 40), false);
    assert.equal(isNearBottom(geometry, 200), true);
  });
});

describe('shouldFollowNewContent', () => {
  it('follows new content only while the reader is at the end', () => {
    assert.equal(shouldFollowNewContent({ stick: true }), true);
    assert.equal(shouldFollowNewContent({ stick: false }), false);
  });

  it('always follows a message the reader just sent', () => {
    assert.equal(shouldFollowNewContent({ stick: false }, true), true);
  });
});
