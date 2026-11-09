import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverTransactionsFromLedger } from '../src/utils/ledgerRecovery.js';

test('recovers standard and linked-transfer register rows from a V2 ledger', () => {
  const accounts = [{ id: 'checking' }, { id: 'savings' }];
  const journalEntries = [
    { id: 'entry-standard', date: '2026-11-08', description: 'Utility bill', sourceTransactionIds: 'txn-standard' },
    { id: 'entry-transfer-123', date: '2026-11-09', description: 'Savings transfer', sourceTransactionIds: 'txn-source,txn-destination' },
  ];
  const postings = [
    { journalEntryId: 'entry-standard', accountId: 'checking', credit: '42.50', payee: 'Utility Co', category: 'Utilities', sourceTransactionId: 'txn-standard', reconciliationId: 'rec-1' },
    { journalEntryId: 'entry-standard', accountId: 'expense:utilities', debit: '42.50', sourceTransactionId: 'txn-standard' },
    { journalEntryId: 'entry-transfer-123', accountId: 'checking', credit: '100.00', payee: 'Savings', sourceTransactionId: 'txn-source' },
    { journalEntryId: 'entry-transfer-123', accountId: 'savings', debit: '100.00', payee: 'Checking', sourceTransactionId: 'txn-destination' },
  ];

  const recovered = recoverTransactionsFromLedger({ accounts, journalEntries, postings });
  assert.deepEqual(recovered.map(({ id, accountId, payment, deposit, category, cleared, transferId, transferAccountId }) => ({ id, accountId, payment, deposit, category, cleared, transferId, transferAccountId })), [
    { id: 'txn-standard', accountId: 'checking', payment: '42.50', deposit: '', category: 'Utilities', cleared: 'TRUE', transferId: '', transferAccountId: '' },
    { id: 'txn-destination', accountId: 'savings', payment: '', deposit: '100.00', category: '', cleared: 'FALSE', transferId: 'transfer-123', transferAccountId: 'checking' },
    { id: 'txn-source', accountId: 'checking', payment: '100.00', deposit: '', category: '', cleared: 'FALSE', transferId: 'transfer-123', transferAccountId: 'savings' },
  ]);
});
