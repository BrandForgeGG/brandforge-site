function normalizeApprovalStatus(value) {
  const normalized = String(value ?? 'PENDING').trim().toUpperCase();

  if (normalized === 'APPROVED') return 'APPROVED';
  if (normalized === 'CHANGES_REQUESTED' || normalized === 'CHANGES-REQUESTED') return 'CHANGES_REQUESTED';
  return 'PENDING';
}

function buildApprovalSummary(items) {
  const summary = {
    total: Array.isArray(items) ? items.length : 0,
    approved: 0,
    pending: 0,
    changesRequested: 0,
  };

  for (const item of items ?? []) {
    const status = normalizeApprovalStatus(item?.status);

    if (status === 'APPROVED') summary.approved += 1;
    if (status === 'PENDING') summary.pending += 1;
    if (status === 'CHANGES_REQUESTED') summary.changesRequested += 1;
  }

  return summary;
}

function upsertApproval(current, next) {
  const list = Array.isArray(current) ? current.slice() : [];
  const targetProjectId = next?.projectId;
  const nextRecord = {
    id: next?.id ?? `approval-${Date.now()}`,
    projectId: targetProjectId,
    milestone: next?.milestone ?? 'Current milestone',
    status: normalizeApprovalStatus(next?.status),
    owner: next?.owner ?? 'BrandForge Team',
    updatedAt: next?.updatedAt ?? 'Now',
    comment: next?.comment ?? 'No update recorded yet.',
  };

  const existingIndex = list.findIndex((item) => item?.projectId === targetProjectId);

  if (existingIndex >= 0) {
    list[existingIndex] = nextRecord;
    return list;
  }

  list.unshift(nextRecord);
  return list;
}

module.exports = {
  normalizeApprovalStatus,
  buildApprovalSummary,
  upsertApproval,
};
