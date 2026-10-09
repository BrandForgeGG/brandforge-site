'use strict';

// Who may make the AI generate in a shared chat. The chat owner and admins always can; anyone else has to
// ask, and the owner decides. Pure, so the rule is tested without a database.

/** @param {{ isOwner: boolean, isAdmin: boolean, status: 'requested'|'granted'|'denied'|null }} who */
function canGenerate(who) {
  if (!who) return false;
  if (who.isOwner || who.isAdmin) return true;
  return who.status === 'granted';
}

/** What a participant who cannot generate should see. */
function accessState(who) {
  if (canGenerate(who)) return 'allowed';
  if (who && who.status === 'requested') return 'requested';
  if (who && who.status === 'denied') return 'denied';
  return 'none';
}

module.exports = { canGenerate, accessState };
