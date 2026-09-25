function normalizeMessageEdit(value) {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content || content.length > 8000) return null;
  return content;
}

function normalizeReactionEmoji(value) {
  const emoji = typeof value === 'string' ? value.trim() : '';
  const characters = [...emoji];
  if (characters.length < 1 || [...emoji].length > 8) return null;
  return emoji;
}

function canMutateMessage(message, userId) {
  return Boolean(
    message &&
    typeof message.id === 'string' &&
    message.id &&
    typeof userId === 'string' &&
    message.sender_id === userId &&
    message.sender_type !== 'ai' &&
    message.content_type !== 'system' &&
    !message.deleted_at
  );
}

function displayAttachmentName(storageName) {
  const decoded = decodeURIComponent(storageName);
  const uuidPrefix = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i;
  return decoded.replace(uuidPrefix, '') || 'attachment';
}

function safeDownloadName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

module.exports = {
  normalizeMessageEdit,
  normalizeReactionEmoji,
  canMutateMessage,
  displayAttachmentName,
  safeDownloadName,
};

