// Maps incoming column names (lowercased) to our internal field names.
// Covers both our own export format and Quicken register export columns.
const COLUMN_AUTO_MAP = {
  date: 'date',
  account: 'account',
  num: 'checkNum',
  checknum: 'checkNum',
  'check #': 'checkNum',
  payee: 'payee',
  description: 'payee',   // Quicken: Description = payee name
  memo: 'description',    // Quicken: Memo = our description/notes
  payment: 'payment',
  'payment (money out)': 'payment',
  deposit: 'deposit',
  'deposit (money in)': 'deposit',
  amount: 'amount',
  category: 'category',
  clr: 'cleared',
  cleared: 'cleared',
};

export function autoMapTransactionColumns({ fields = [], format }) {
  const hasPayee = fields.some((field) => field.trim().toLowerCase() === 'payee');
  return Object.fromEntries(fields.flatMap((field) => {
    const lower = field.trim().toLowerCase();
    const mapped = lower === 'amount' && format === 'citi-credit-card'
      ? 'cardAmount' : lower === 'description' && hasPayee
        ? 'description' : COLUMN_AUTO_MAP[lower];
    return mapped ? [[field, mapped]] : [];
  }));
}

// Validate the entire mapped file before dispatching any imported records.
function importDate(value) {
  const match = value.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))$/);
  if (!match) throw new Error('Use M/D/YYYY or YYYY-MM-DD dates.');
  const [, y, m, d, slashM, slashD, slashY] = match;
  const year = Number(y || slashY), month = Number(m || slashM), day = Number(d || slashD);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error(`Invalid date: ${value}.`);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function importAmount(value) {
  if (!value) return null;
  const normalized = value.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(Number(normalized))) throw new Error(`Invalid amount: ${value}.`);
  return Number(normalized);
}

export function buildImportedTransactions({ rows, columnMap, accounts, accountId, generateUUID }) {
  if (!rows.length) throw new Error('No transactions were found to import.');
  const fields = Object.values(columnMap).filter(Boolean);
  if (!fields.includes('date')) throw new Error('Map a column to Date before importing.');
  if (!fields.some((field) => ['payment', 'deposit', 'amount', 'cardAmount'].includes(field))) throw new Error('Map Payment, Deposit, or Amount before importing.');
  if (new Set(fields).size !== fields.length) throw new Error('Map each transaction field only once; set duplicate mappings to (skip).');
  if (fields.filter((field) => ['amount', 'cardAmount'].includes(field)).length && fields.filter((field) => ['amount', 'cardAmount', 'payment', 'deposit'].includes(field)).length > 1) throw new Error('Map either a signed Amount, a credit card Amount, or separate Payment/Deposit columns, not both.');
  const accountByName = new Map(accounts.map((account) => [account.name.trim().toLowerCase(), account]));
  return rows.map((row, index) => {
    try {
      const values = {};
      for (const [column, field] of Object.entries(columnMap)) {
        if (field) values[field] = String(row[column] ?? '').trim();
      }
      const targetAccount = values.account ? accountByName.get(values.account.toLowerCase()) : accounts.find((account) => account.id === accountId);
      if (!targetAccount) throw new Error(values.account ? `Account "${values.account}" was not found. Create it first or skip the Account column to use the current account.` : 'Select an account or map an Account column.');
      const txn = {
        id: generateUUID(), accountId: targetAccount.id, date: importDate(values.date || ''),
        checkNum: (values.checkNum || '').toUpperCase(), payee: values.payee || '',
        description: values.description || '', category: values.category || '',
        payment: '', deposit: '', reconciliationId: '',
        cleared: ['R', '*', 'TRUE'].includes((values.cleared || '').toUpperCase()) ? 'TRUE' : 'FALSE',
      };
      if (fields.includes('amount') || fields.includes('cardAmount')) {
        const isCardAmount = fields.includes('cardAmount');
        const amount = importAmount(isCardAmount ? values.cardAmount : values.amount);
        if (amount == null) throw new Error('Amount is empty.');
        const isPayment = isCardAmount ? amount >= 0 : amount < 0;
        txn[isPayment ? 'payment' : 'deposit'] = Math.abs(amount).toFixed(2);
      } else {
        const payment = importAmount(values.payment), deposit = importAmount(values.deposit);
        if (payment == null && deposit == null) throw new Error('Payment and Deposit are both empty.');
        txn.payment = payment == null ? '' : Math.abs(payment).toFixed(2);
        txn.deposit = deposit == null ? '' : Math.abs(deposit).toFixed(2);
      }
      return txn;
    } catch (error) {
      throw new Error(`Transaction row ${index + 1}: ${error.message}`);
    }
  });
}
