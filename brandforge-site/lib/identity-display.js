// Deterministic, fabrication-free identity display helpers shared by the rail,
// transcript, header and project panel. Plain CJS so node --test can require it.

// Two-letter initials for a person's name. Handles single names and multi-part names
// ("Ada Lovelace" -> "AL", "cher" -> "CH"); falls back to "?" when there is nothing
// to derive from. Never random: the same name always yields the same initials.
function initialsFor(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A small, muted palette. Avatars must establish identity without dominating the
// interface, so tones are dark, low-saturation variants - never a rainbow.
const AVATAR_TONES = [
  { backgroundColor: '#2b3238', color: '#ece7de' },
  { backgroundColor: '#27312c', color: '#d9f7ea' },
  { backgroundColor: '#332b25', color: '#f2e3d3' },
  { backgroundColor: '#2a2c33', color: '#e3e6ee' },
];

// djb2 over a stable key (user id, display name). The same key must map to the same
// tone across sessions and devices - a fallback avatar may never change randomly.
function hashKey(key) {
  const text = String(key ?? '');
  let hash = 5381;

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function avatarTone(key) {
  return AVATAR_TONES[hashKey(key) % AVATAR_TONES.length];
}

// Accessible alt/aria text for an avatar image. Unknown people stay neutral:
// we never invent a name the system does not have.
function avatarLabel(displayName) {
  const name = String(displayName ?? '').trim();
  return name ? `${name}'s avatar` : 'Avatar';
}

// Roles arrive lowercase from the database ("founder", "operator"). Capitalize the
// first letter only - never relabel a role into something friendlier than the truth.
function formatRole(role) {
  const value = String(role ?? '').trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// The role line under a person's name. Admins read "Admin", operators "Operator", everyone else shows their
// own @username (or "Member" until they have picked one). The word "user" is never shown.
function roleLine(role, username) {
  const key = String(role ?? '').trim().toLowerCase();
  if (key === 'admin' || key === 'founder') return 'Admin';
  if (key === 'operator') return 'Operator';
  const handle = String(username ?? '').trim().replace(/^@/, '');
  return handle ? `@${handle}` : 'Member';
}

module.exports = {
  roleLine,
  initialsFor,
  avatarTone,
  avatarLabel,
  formatRole,
  AVATAR_TONES,
};
