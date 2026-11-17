import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCategoryTransactions } from '../src/utils/categoryReport.js';

test('category report includes matching transactions from every account and both date boundaries', () => {
  const transactions = [
    { id: 'late', accountId: 'credit-card', date: '2026-02-28', category: 'Travel' },
    { id: 'outside', accountId: 'checking', date: '2026-03-01', category: 'Travel' },
    { id: 'other', accountId: 'savings', date: '2026-02-15', category: 'Food' },
    { id: 'early', accountId: 'checking', date: '2026-02-01', category: 'Travel' },
  ];
  const selected = selectCategoryTransactions(transactions, 'Travel', '2026-02-01', '2026-02-28');
  assert.deepEqual(selected.map((transaction) => transaction.id), ['early', 'late']);
  assert.deepEqual(transactions.map((transaction) => transaction.id), ['late', 'outside', 'other', 'early']);
});

test('category report requires one category and a valid date range', () => {
  assert.throws(() => selectCategoryTransactions([], '', '2026-02-01', '2026-02-28'), /Select a category/);
  assert.throws(() => selectCategoryTransactions([], 'Travel', '', '2026-02-28'), /start and end date/);
  assert.throws(() => selectCategoryTransactions([], 'Travel', '2026-03-01', '2026-02-28'), /start and end date/);
});
