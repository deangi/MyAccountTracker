import { netWorthClassFor } from './accountTypes.js';
import { formatCurrency } from './formatters.js';

function cents(value, field, accountName) {
  if (value == null || value === '') return 0;
  const normalized = String(value).replace(/[$,\s]/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${accountName} has an invalid ${field} amount: ${value}.`);
  }
  return Math.round(Number(normalized) * 100);
}

export function buildNetWorthStatement({ accounts = [], transactions = [], asOfDate }) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOfDate || '');
  const date = dateParts && new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]));
  if (!dateParts || date.getFullYear() !== Number(dateParts[1]) || date.getMonth() !== Number(dateParts[2]) - 1 || date.getDate() !== Number(dateParts[3])) {
    throw new Error('Select a valid as-of date.');
  }
  const balances = new Map(accounts.map(account => [account.id, 0]));
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  for (const transaction of transactions) {
    if (!balances.has(transaction.accountId)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date || '')) throw new Error('A transaction has an invalid date. Correct it before running the Net Worth Statement.');
    if (transaction.date > asOfDate) continue;
    const account = accountsById.get(transaction.accountId);
    const change = cents(transaction.deposit, 'deposit', account.name) - cents(transaction.payment, 'payment', account.name);
    balances.set(account.id, balances.get(account.id) + change);
  }
  const assets = [];
  const liabilities = [];
  for (const account of accounts) {
    const isLiability = netWorthClassFor(account.type) === 'liability';
    const balanceCents = balances.get(account.id) || 0;
    (isLiability ? liabilities : assets).push({
      id: account.id,
      name: account.nickname || account.name,
      amount: (balanceCents === 0 ? 0 : isLiability ? -balanceCents : balanceCents) / 100,
    });
  }
  const totalAssets = assets.reduce((sum, account) => sum + Math.round(account.amount * 100), 0) / 100;
  const totalLiabilities = liabilities.reduce((sum, account) => sum + Math.round(account.amount * 100), 0) / 100;
  return { assets, liabilities, totalAssets, totalLiabilities, netWorth: (Math.round(totalAssets * 100) - Math.round(totalLiabilities * 100)) / 100 };
}

export function netWorthStatementRows(statement) {
  return [
    ['Assets'],
    ...statement.assets.map(account => [formatCurrency(account.amount), account.name]),
    [formatCurrency(statement.totalAssets), 'Total Assets'],
    [],
    ['Liabilities'],
    ...statement.liabilities.map(account => [formatCurrency(account.amount), account.name]),
    [formatCurrency(statement.totalLiabilities), 'Total Liabilities'],
    [],
    [formatCurrency(statement.netWorth), 'Net Worth'],
  ];
}
