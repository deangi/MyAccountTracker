const tabToKey = {
  accounts: 'accounts', payees: 'payees', categories: 'categories',
  transactions: 'transactions', reconciliations: 'reconciliations',
  reconcile_drafts: 'reconcile_drafts',
};

export function overlayPendingOperations(data, operations) {
  const result = { ...data };
  for (const operation of operations
    .filter((item) => item.status !== 'acknowledged')
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.createdAt.localeCompare(b.createdAt))) {
    for (const change of operation.payload?.changes || []) {
      const key = tabToKey[change.tab];
      if (!key) continue;
      const rows = [...(result[key] || [])];
      const index = rows.findIndex((row) => row.id === change.id);
      if (change.after) {
        if (index < 0) rows.push(change.after);
        else rows[index] = change.after;
      } else if (index >= 0) {
        rows.splice(index, 1);
      }
      result[key] = rows;
    }
  }
  return result;
}
