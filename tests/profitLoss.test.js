import test from 'node:test';
import assert from 'node:assert/strict';
import { netProfitLossCategories, sortProfitLossItems, transactionsForProfitLoss } from '../src/utils/profitLoss.js';

test('profit and loss line items sort alphabetically without changing amounts', () => {
  const items = [
    { name: 'Utilities', amount: 31 },
    { name: 'advertising', amount: 12 },
    { name: 'Meals', amount: 8 },
  ];
  assert.deepEqual(sortProfitLossItems(items), [
    { name: 'advertising', amount: 12 },
    { name: 'Meals', amount: 8 },
    { name: 'Utilities', amount: 31 },
  ]);
  assert.deepEqual(items.map((item) => item.name), ['Utilities', 'advertising', 'Meals']);
});

test('profit and loss includes only checking, savings, and credit card activity, not linked transfers', () => {
  const accounts = [
    { id: 'checking', type: 'checking' }, { id: 'savings', type: 'savings' }, { id: 'card', type: 'credit card' },
    { id: 'retirement', type: 'retirement' }, { id: 'property', type: 'property' }, { id: 'vehicle', type: 'vehicle' },
    { id: 'asset', type: 'other asset' }, { id: 'equity', type: 'equity' }, { id: 'liability', type: 'other liability' },
  ];
  const transactions = [
    { id: 'checking-income', accountId: 'checking' }, { id: 'savings-income', accountId: 'savings' }, { id: 'card-expense', accountId: 'card' },
    { id: 'checking-transfer', accountId: 'checking', transferId: 'transfer-1' }, { id: 'card-transfer', accountId: 'card', transferId: 'transfer-1' },
    { id: 'retirement-income', accountId: 'retirement' }, { id: 'property-income', accountId: 'property' }, { id: 'vehicle-income', accountId: 'vehicle' },
    { id: 'asset-income', accountId: 'asset' }, { id: 'equity-income', accountId: 'equity' }, { id: 'liability-income', accountId: 'liability' },
  ];
  assert.deepEqual(transactionsForProfitLoss(accounts, transactions).map((transaction) => transaction.id), [
    'checking-income', 'savings-income', 'card-expense',
  ]);
});

test('profit and loss nets matching categories and retains zero values in expenses', () => {
  const result = netProfitLossCategories(
    [
      { name: 'Income: Consulting', amount: 200 },
      { name: 'Income: Rebate', amount: 30 },
      { name: 'Income: Zeroed', amount: 50 },
      { name: 'Income: Conversion Review', amount: 10 },
    ],
    [
      { name: 'Expense: Consulting', amount: 75 },
      { name: 'Expense: Office', amount: 20 },
      { name: 'Expense: zeroed', amount: 50 },
    ],
  );
  assert.deepEqual(result.income, [
    { name: 'Consulting', amount: 125 },
    { name: 'Rebate', amount: 30 },
    { name: 'Uncategorized', amount: 10 },
  ]);
  assert.deepEqual(result.expenses, [
    { name: 'Office', amount: 20 },
    { name: 'Zeroed', amount: 0 },
  ]);
  assert.equal(
    result.income.reduce((sum, item) => sum + item.amount, 0) - result.expenses.reduce((sum, item) => sum + item.amount, 0),
    145,
  );
});
