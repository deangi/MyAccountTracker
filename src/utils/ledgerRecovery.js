function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '';
}

// Recover register rows when a V2 ledger exists but all txn_* register tabs
// are empty. The ledger does not retain a check number, so that field must be
// left blank. Do not use this when any register transaction is still present.
export function recoverTransactionsFromLedger({ accounts = [], journalEntries = [], postings = [] }) {
  const accountIds = new Set(accounts.map((account) => account.id));
  const entries = new Map(journalEntries.map((entry) => [entry.id, entry]));
  const registerPostings = postings.filter((posting) => (
    posting.sourceTransactionId && accountIds.has(posting.accountId)
  ));
  const bySourceId = new Map();
  for (const posting of registerPostings) {
    if (!bySourceId.has(posting.sourceTransactionId)) bySourceId.set(posting.sourceTransactionId, []);
    bySourceId.get(posting.sourceTransactionId).push(posting);
  }

  const recovered = [];
  for (const [sourceTransactionId, sourcePostings] of bySourceId) {
    const posting = sourcePostings.find((item) => money(item.debit) || money(item.credit));
    const entry = entries.get(posting?.journalEntryId);
    if (!posting || !entry) continue;

    const sourceIds = String(entry.sourceTransactionIds || '').split(',').filter(Boolean);
    const linkedTransfer = sourceIds.length === 2;
    const counterpart = linkedTransfer
      ? registerPostings.find((item) => item.journalEntryId === entry.id && item.sourceTransactionId !== sourceTransactionId)
      : null;

    recovered.push({
      id: sourceTransactionId,
      accountId: posting.accountId,
      date: entry.date || '',
      checkNum: '',
      payee: posting.payee || '',
      description: entry.description || posting.payee || '',
      payment: money(posting.credit),
      deposit: money(posting.debit),
      category: posting.category || '',
      cleared: posting.reconciliationId ? 'TRUE' : 'FALSE',
      reconciliationId: posting.reconciliationId || '',
      transferId: linkedTransfer && entry.id.startsWith('entry-') ? entry.id.slice('entry-'.length) : '',
      transferAccountId: counterpart?.accountId || '',
    });
  }

  return recovered.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
