import { SHEET_TABS, V3_TRANSACTION_HEADERS, getSheetHeadersForVersion } from '../config';

const collections = [
  ['accounts', SHEET_TABS.ACCOUNTS], ['payees', SHEET_TABS.PAYEES],
  ['categories', SHEET_TABS.CATEGORIES], ['transactions', 'transactions'],
  ['reconciliations', SHEET_TABS.RECONCILIATIONS],
  ['reconcileDrafts', SHEET_TABS.RECONCILE_DRAFTS],
];

export function changesForAction(before, after, action) {
  const changes = [];
  for (const [key, tab] of collections) {
    const oldRows = new Map((before[key] || []).map((row) => [row.id, row]));
    const newRows = new Map((after[key] || []).map((row) => [row.id, row]));
    const fields = tab === 'transactions' ? V3_TRANSACTION_HEADERS : getSheetHeadersForVersion('3')[tab];
    for (const [id, row] of newRows) {
      const prior = oldRows.get(id);
      if (tab === 'transactions' && prior && prior.accountId !== row.accountId) {
        changes.push({ tab, id, before: prior, after: null });
        changes.push({ tab, id, before: null, after: row });
        continue;
      }
      if (!prior || fields.some((field) => String(prior[field] ?? '') !== String(row[field] ?? ''))) {
        changes.push({ tab, id, before: prior || null, after: row });
      }
    }
    for (const [id, row] of oldRows) {
      if (!newRows.has(id)) changes.push({ tab, id, before: row, after: null });
    }
  }
  return { actionType: action.type, changes };
}
