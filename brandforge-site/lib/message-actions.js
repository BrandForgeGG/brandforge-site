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

module.exports = {
  normalizeMessageEdit,
  normalizeReactionEmoji,
  canMutateMessage,
};
