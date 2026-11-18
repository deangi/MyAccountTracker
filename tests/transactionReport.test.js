import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReportTransactions } from '../src/utils/transactionReport.js';

const transactions = [
  { id: 'b', accountId: 'savings', date: '2026-02-28', payee: 'Bank', category: 'Transfer', payment: '', deposit: '25.00' },
  { id: 'a', accountId: 'checking', date: '2026-02-01', payee: 'Bank', category: 'Transfer', payment: '25', deposit: '' },
  { id: 'c', accountId: 'card', date: '2026-02-15', payee: 'Shop', category: 'Food', payment: '25.01', deposit: '' },
  { id: 'd', accountId: 'checking', date: '2026-03-01', payee: 'Shop', category: 'Food', payment: '25', deposit: '' },
];
const dates = { fromDate: '2026-02-01', toDate: '2026-02-28' };

test('all transactions in an inclusive date range cover every account', () => {
  assert.deepEqual(selectReportTransactions(transactions, dates).map((item) => item.id), ['a', 'c', 'b']);
});

test('payee and category filters combine across accounts', () => {
  assert.deepEqual(selectReportTransactions(transactions, { ...dates, payees: ['Bank'], categories: ['Transfer'] }).map((item) => item.id), ['a', 'b']);
});

test('amount compares cents and distinguishes payment, deposit and either', () => {
  assert.deepEqual(selectReportTransactions(transactions, { ...dates, amount: '25.00' }).map((item) => item.id), ['a', 'b']);
  assert.deepEqual(selectReportTransactions(transactions, { ...dates, amount: '25', direction: 'payment' }).map((item) => item.id), ['a']);
  assert.deepEqual(selectReportTransactions(transactions, { ...dates, amount: '25', direction: 'deposit' }).map((item) => item.id), ['b']);
});

test('invalid dates and amounts fail before report creation', () => {
  assert.throws(() => selectReportTransactions([], { fromDate: '', toDate: '2026-02-28' }), /start and end dates/);
  assert.throws(() => selectReportTransactions([], { fromDate: '2026-03-01', toDate: '2026-02-28' }), /start and end dates/);
  assert.throws(() => selectReportTransactions([], { ...dates, amount: '-25' }), /positive amount/);
  assert.throws(() => selectReportTransactions([], { ...dates, amount: '25.001' }), /positive amount/);
});
