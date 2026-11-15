import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceAppState } from '../src/store/appReducer.js';

test('closing clears workbook data and sync state while keeping Google sign-in', () => {
  const initialState = {
    meta: { title: '', version: '3' },
    syncStatus: { pending: 0, failed: 0 },
  };
  const state = {
    isAuthenticated: true,
    spreadsheetId: 'sheet-1',
    spreadsheetTitle: 'Company',
    meta: { title: 'Company', version: '3' },
    accounts: [{ id: 'account-1' }],
    transactions: [{ id: 'transaction-1' }],
    payees: [{ id: 'payee-1' }],
    categories: [{ id: 'category-1' }],
    reconciliations: [{ id: 'reconciliation-1' }],
    reconcileDrafts: [{ id: 'draft-1' }],
    chartOfAccounts: [{ id: 'chart-1' }],
    journalEntries: [{ id: 'entry-1' }],
    postings: [{ id: 'posting-1' }],
    selectedAccountId: 'account-1',
    loading: true,
    error: 'old error',
    syncStatus: { pending: 2, failed: 1 },
  };
  const next = reduceAppState(state, { type: 'CLEAR_DATA' }, initialState);

  assert.equal(next.isAuthenticated, true);
  assert.equal(next.spreadsheetId, null);
  assert.equal(next.spreadsheetTitle, '');
  assert.equal(next.selectedAccountId, null);
  assert.equal(next.loading, false);
  assert.equal(next.error, null);
  assert.deepEqual(next.meta, initialState.meta);
  assert.deepEqual(next.syncStatus, initialState.syncStatus);
  for (const key of ['accounts', 'transactions', 'payees', 'categories', 'reconciliations', 'reconcileDrafts', 'chartOfAccounts', 'journalEntries', 'postings']) {
    assert.deepEqual(next[key], [], key);
  }
});
