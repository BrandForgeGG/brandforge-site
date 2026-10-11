const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRoomBlock, labelForRoom, VALUES } = require('./chat-room');

test('nothing is added when one person is alone in the chat', () => {
  assert.equal(buildRoomBlock({ people: [{ name: 'Sara', role: 'user', isOwner: true }], speaker: 'Sara' }), '');
  assert.equal(buildRoomBlock({ people: [], speaker: '' }), '');
  assert.equal(buildRoomBlock({ people: null }), '');
});

test('with two people the AI is told who is here, their roles, who started it and who is speaking', () => {
  const block = buildRoomBlock({ people: [{ name: 'Sara', role: 'user', isOwner: true }, { name: 'Omar', role: 'operator' }], speaker: 'Omar' });
  assert.match(block, /Sara: Member, started this chat/);
  assert.match(block, /Omar: BrandForge Team/);
  assert.match(block, /Speaking now: Omar\./);
  assert.match(block, /Match each person's tone and register/);
  assert.match(block, /Be even-handed/);
});

test('the values come from the Quranic guidance and are applied silently', () => {
  for (const ref of ['2:83', '17:53', '5:8', '4:58', '49:6', '49:11-12', '4:29', '16:125']) assert.ok(VALUES.includes(ref), ref);
  assert.match(VALUES, /never quote a verse/);
  assert.match(buildRoomBlock({ people: [{ name: 'A' }, { name: 'B' }] }), /never quote a verse/);
});

test('messages are labelled with who said them', () => {
  assert.equal(labelForRoom('Sara', 'hello'), 'Sara: hello');
  assert.equal(labelForRoom('', 'hello'), 'Someone: hello');
});
