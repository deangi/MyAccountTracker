import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetWorthStatement, netWorthStatementRows } from '../src/utils/netWorth.js';

test('personal Net Worth Statement lists every account and matches the requested totals', () => {
  const definitions = [
    ['checking', 'Checking account', 'checking', 100],
    ['savings', 'Savings account', 'savings', 200],
    ['retirement', 'Retirement account', 'retirement', 100],
    ['home', 'Home value', 'property', 300],
    ['auto', 'Value of Auto', 'vehicle', 150],
    ['rv', 'Value of RV', 'other asset', 50],
    ['mortgage', 'Mortgage balance', 'mortgage', -50],
    ['company-loan', 'Loan owing to ABC Company', 'loan', -25],
    ['car-loan', 'Car Loan', 'other liability', -10],
  ];
  const accounts = definitions.map(([id, name, type]) => ({ id, name, type }));
  const transactions = definitions.map(([id, , , amount]) => ({
    accountId: id, date: '2026-10-01', deposit: amount > 0 ? String(amount) : '', payment: amount < 0 ? String(-amount) : '',
  }));
  const statement = buildNetWorthStatement({ accounts, transactions, asOfDate: '2026-10-26' });
  assert.deepEqual(statement.assets.map(account => account.name), definitions.slice(0, 6).map(([, name]) => name));
  assert.deepEqual(statement.liabilities.map(account => account.name), definitions.slice(6).map(([, name]) => name));
  assert.deepEqual([statement.totalAssets, statement.totalLiabilities, statement.netWorth], [900, 85, 815]);
  assert.deepEqual(netWorthStatementRows(statement), [
    ['Assets'],
    ['$100.00', 'Checking account'],
    ['$200.00', 'Savings account'],
    ['$100.00', 'Retirement account'],
    ['$300.00', 'Home value'],
    ['$150.00', 'Value of Auto'],
    ['$50.00', 'Value of RV'],
    ['$900.00', 'Total Assets'],
    [],
    ['Liabilities'],
    ['$50.00', 'Mortgage balance'],
    ['$25.00', 'Loan owing to ABC Company'],
    ['$10.00', 'Car Loan'],
    ['$85.00', 'Total Liabilities'],
    [],
    ['$815.00', 'Net Worth'],
  ]);
});

test('statement includes zero-balance and equity accounts and honors the selected date', () => {
  const accounts = [
    { id: 'a', name: 'Checking', type: 'checking' },
    { id: 'b', name: 'Card', type: 'credit card' },
    { id: 'c', name: 'Investment equity', type: 'equity' },
    { id: 'd', name: 'Unused loan', type: 'loan' },
  ];
  const transactions = [
    { accountId: 'a', date: '2026-10-01', deposit: '1,000.00', payment: '' },
    { accountId: 'a', date: '2026-11-01', deposit: '999.00', payment: '' },
    { accountId: 'b', date: '2026-10-01', deposit: '', payment: '75.50' },
    { accountId: 'b', date: '2026-10-10', deposit: '25.00', payment: '' },
    { accountId: 'c', date: '2026-10-01', deposit: '$200.00', payment: '' },
  ];
  const statement = buildNetWorthStatement({ accounts, transactions, asOfDate: '2026-10-26' });
  assert.deepEqual(statement.assets.map(account => account.amount), [1000, 200]);
  assert.deepEqual(statement.liabilities.map(account => account.amount), [50.5, 0]);
  assert.equal(statement.netWorth, 1149.5);
  assert.equal(statement.assets.length + statement.liabilities.length, accounts.length);
});

test('invalid dates and amounts fail before a misleading statement is shown', () => {
  const accounts = [{ id: 'a', name: 'Checking', type: 'checking' }];
  assert.throws(() => buildNetWorthStatement({ accounts, asOfDate: '2026-02-30' }), /valid as-of date/);
  assert.throws(() => buildNetWorthStatement({ accounts, asOfDate: '2026-10-26', transactions: [{ accountId: 'a', date: 'bad', deposit: '10' }] }), /invalid date/);
  assert.throws(() => buildNetWorthStatement({ accounts, asOfDate: '2026-10-26', transactions: [{ accountId: 'a', date: '2026-10-01', deposit: 'ten' }] }), /invalid deposit amount/);
});
