import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTsvText, generateTsv } from '../src/utils/csv.js';
import { buildImportedTransactions } from '../src/utils/transactionImport.js';

const accounts = [{ id: 'checking', name: 'Checking' }];
let nextId = 0;
function build(parsed, columnMap, options = {}) {
  return buildImportedTransactions({ rows: parsed.data, columnMap, accounts, accountId: 'checking', generateUUID: () => `import-${++nextId}`, ...options });
}

test('quoted, BOM-prefixed TSV imports real transactions, including embedded tab and newline', () => {
  const parsed = parseTsvText('\uFEFF"date"\t"Check #"\t"Payee"\t"Memo"\t"Amount"\r\n"10/6/2026"\t"EFT"\t"Electric Company"\t"October\tbill\npaid"\t"($125.40)"\r\n"2026-10-07"\t"DEP"\t"Employer"\t"Payroll"\t"$2,500.00"');
  const txns = build(parsed, { date: 'date', 'Check #': 'checkNum', Payee: 'payee', Memo: 'description', Amount: 'amount' });
  assert.equal(txns.length, 2);
  assert.deepEqual(txns.map(t => [t.accountId, t.date, t.payment, t.deposit]), [['checking', '2026-10-06', '125.40', ''], ['checking', '2026-10-07', '', '2500.00']]);
  assert.equal(txns[0].description, 'October\tbill\npaid');
});

test('native export with title, date range and totals imports once without footer rows', () => {
  const text = generateTsv([{ Date: '2026-10-06', Payee: 'Store', Description: 'Supplies', Payment: '12.34', Deposit: '' }], { title: 'MyAccountTracker - Checking', dateRange: '2026-10-06 through 2026-10-06' });
  const parsed = parseTsvText(text);
  const txns = build(parsed, { Date: 'date', Payee: 'payee', Description: 'description', Payment: 'payment', Deposit: 'deposit' });
  assert.equal(txns.length, 1);assert.equal(txns[0].payment, '12.34');assert.equal(txns[0].description, 'Supplies');
});

test('TestCo fixture imports every row into its named account', () => {
  const parsed = parseTsvText(readFileSync(new URL('../test-data/TestCo/TestCo-Inc-Transactions.tsv', import.meta.url), 'utf8'));
  const fixtureAccounts = [...new Set(parsed.data.map(r => r.Account))].map((name, index) => ({ name, id: String(index) }));
  const txns = build(parsed, { Date: 'date', Account: 'account', 'Check #': 'checkNum', Payee: 'payee', Memo: 'description', Payment: 'payment', Deposit: 'deposit', Category: 'category', Cleared: 'cleared' }, { accounts: fixtureAccounts, accountId: undefined });
  assert.equal(txns.length, parsed.data.length);assert(txns.length > 100);assert(txns.every(t => fixtureAccounts.some(a => a.id === t.accountId)));
});

test('unrecognized dates are retained for mapping and produce actionable errors', () => {
  const parsed = parseTsvText('Date\tAmount\n6-Oct-2026\t10.00');
  assert.equal(parsed.data.length, 1);
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'amount' }), /Transaction row 1: Use M\/D\/YYYY/);
  assert.throws(() => build({ data: [{ Date: '2/30/2026', Amount: '1' }] }, { Date: 'date', Amount: 'amount' }), /Invalid date/);
});

test('empty, header-only, malformed and duplicate header files fail before import', () => {
  for (const text of ['', 'Date\tAmount', 'Date\tAmount\tamount\n10/6/2026\t1\t2', 'Date\tAmount\n"10/6/2026\t1']) assert.throws(() => parseTsvText(text));
});

test('missing, duplicate and conflicting mappings cannot create blank records', () => {
  const parsed = parseTsvText('Date\tAmount\tPayment\n10/6/2026\t10\t5');
  assert.throws(() => build(parsed, { Amount: 'amount' }), /Map a column to Date/);
  assert.throws(() => build(parsed, { Date: 'date' }), /Map Payment/);
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'amount', Payment: 'amount' }), /only once/);
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'amount', Payment: 'payment' }), /not both/);
});

test('account matching ignores surrounding whitespace/case and rejects unknown accounts', () => {
  const parsed = parseTsvText('Date\tAccount\tAmount\n10/6/2026\t checking \t10');
  const mapping = { Date: 'date', Account: 'account', Amount: 'amount' };
  assert.equal(build(parsed, mapping)[0].accountId, 'checking');
  parsed.data[0].Account = 'Unknown';assert.throws(() => build(parsed, mapping), /Account "Unknown" was not found/);
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'amount' }, { accountId: undefined }), /Select an account/);
});

test('bad or empty amounts fail the whole batch rather than silently becoming blank', () => {
  const parsed = parseTsvText('Date\tAmount\n10/6/2026\t10\n10/7/2026\t12oops');
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'amount' }), /Transaction row 2: Invalid amount/);
  parsed.data[1].Amount = '';assert.throws(() => build(parsed, { Date: 'date', Amount: 'amount' }), /Amount is empty/);
});


test('consistent repeated tabs preserve blank columns and mapped data', () => {
  const parsed = parseTsvText('Date\t\tPayee\t\tAmount\n10/6/2026\t\tStore\t\t-10.00');
  assert.equal(parsed.meta.fields.length, 5);
  assert.equal(parsed.meta.fields[1], 'Column 2 (no heading)');
  assert.equal(build(parsed, { Date: 'date', Payee: 'payee', Amount: 'amount' })[0].payee, 'Store');
});

test('values under unnamed columns remain available for manual mapping', () => {
  const parsed = parseTsvText('Date\t\tAmount\n10/6/2026\tStore\t-10.00');
  assert.equal(build(parsed, { Date: 'date', 'Column 2 (no heading)': 'payee', Amount: 'amount' })[0].payee, 'Store');
});

test('inconsistent visual-alignment tabs produce an error instead of blank transactions', () => {
  assert.throws(() => parseTsvText('Date\tPayee\tAmount\n10/6/2026\t\tStore\t\t-10.00'), /File row 2 has 5 columns; the headings have 3/);
  assert.throws(() => parseTsvText('Date\t\tPayee\tAmount\n10/6/2026\tStore\t-10.00'), /Each tab separates a column/);
});

test('Citi padding normalizes differently sized tab runs and keeps charge/credit signs', () => {
  // Synthetic rows preserving the sample's delimiter pattern, without customer data.
  const parsed = parseTsvText('\tStatus\t\tDate\t\t\tDescription\t\t\tAmount\t\tMember Name\t\r\n\tCleared\t\t10/21/2026\t\tEXAMPLE SHOP\t\t\t$ 13.94\t\tSAMPLE MEMBER\t\r\n\tCleared\t\t10/16/2026\t\tEXAMPLE REFUND\t\t\t -$ 65.96\t\tSAMPLE MEMBER\t');
  assert.equal(parsed.meta.format, 'citi-credit-card');
  assert.deepEqual(parsed.meta.fields, ['Status', 'Date', 'Description', 'Amount', 'Member Name']);
  const txns = build(parsed, { Date: 'date', Description: 'payee', Amount: 'cardAmount' });
  assert.equal(txns.length, 2);
  assert.deepEqual(txns.map(t => [t.payee, t.payment, t.deposit, t.cleared]), [['EXAMPLE SHOP', '13.94', '', 'FALSE'], ['EXAMPLE REFUND', '', '65.96', 'FALSE']]);
});

test('incomplete Citi rows fail rather than shifting a missing value into another field', () => {
  assert.throws(() => parseTsvText('Status\tDate\tDescription\tAmount\tMember Name\nCleared\t10/21/2026\t\t$ 13.94\tSAMPLE'), /Citi transaction row 1: expected/);
  assert.throws(() => parseTsvText('Status\tDate\tDescription\tAmount\tMember Name\nCleared\tSHOP\t10/21/2026\t$ 13.94\tSAMPLE'), /Date column could not be identified/);
});

test('credit card amount cannot overlap another amount mapping', () => {
  const parsed = { data: [{ Date: '10/21/2026', Amount: '10', Payment: '10' }] };
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'cardAmount', Payment: 'payment' }), /not both/);
  assert.throws(() => build(parsed, { Date: 'date', Amount: 'cardAmount', Payment: 'amount' }), /not both/);
});

test('automatic Citi mapping delivers exact amounts and totals into the application store', async () => {
  const { autoMapTransactionColumns } = await import('../src/utils/transactionImport.js');
  const { reduceAppState } = await import('../src/store/appReducer.js');
  const text = '\tStatus\t\tDate\t\t\tDescription\t\t\tAmount\t\tMember Name\t\n'
    + '\tCleared\t\t10/21/2026\t\tSHOP ONE\t\t\t$ 5.44\t\tTEST MEMBER\t\n'
    + '\tCleared\t\t10/20/2026\t\tSHOP TWO\t\t\t$ 1,234.56\t\tTEST MEMBER\t\n'
    + '\tCleared\t\t10/19/2026\t\tREFUND ONE\t\t\t -$ 65.96\t\tTEST MEMBER\t\n'
    + '\tCleared\t\t10/18/2026\t\tREFUND TWO\t\t\t-$ 5.44\t\tTEST MEMBER\t';
  const parsed = parseTsvText(text);
  // Use the exact automatic mapping called by the dialog, never a hand-picked mapping.
  const columnMap = autoMapTransactionColumns(parsed.meta);
  assert.equal(columnMap.Amount, 'cardAmount');
  assert.equal(columnMap.Description, 'payee');
  const imported = build(parsed, columnMap);
  const previous = { id: 'existing', accountId: 'checking', date: '2026-01-01', payee: 'OLD', payment: '9.99', deposit: '' };
  const state = { accounts, transactions: [previous] };
  const next = reduceAppState(state, { type: 'IMPORT_TRANSACTIONS', payload: imported });
  assert.equal(next.transactions.length, 5);
  assert.deepEqual(next.transactions.find(t => t.id === 'existing'), previous);
  assert.deepEqual(next.transactions.filter(t => t.id !== 'existing').map(({date, payee, payment, deposit, accountId}) => ({date, payee, payment, deposit, accountId})), [
    { date: '2026-10-18', payee: 'REFUND TWO', payment: '', deposit: '5.44', accountId: 'checking' },
    { date: '2026-10-19', payee: 'REFUND ONE', payment: '', deposit: '65.96', accountId: 'checking' },
    { date: '2026-10-20', payee: 'SHOP TWO', payment: '1234.56', deposit: '', accountId: 'checking' },
    { date: '2026-10-21', payee: 'SHOP ONE', payment: '5.44', deposit: '', accountId: 'checking' },
  ]);
  const importedInStore = next.transactions.filter(t => t.id !== 'existing');
  const cents = value => Math.round(Number(value || '0') * 100);
  assert.equal(importedInStore.reduce((sum, t) => sum + cents(t.payment), 0), 124000);
  assert.equal(importedInStore.reduce((sum, t) => sum + cents(t.deposit), 0), 7140);
  // A row count alone cannot pass these tests if an amount is blank or on the wrong side.
  assert(importedInStore.every(t => t.payment !== '' || t.deposit !== ''));
  assert.equal(state.transactions.length, 1);
});

test('native and Quicken mappings retain their different descriptions and amount directions', async () => {
  const { autoMapTransactionColumns } = await import('../src/utils/transactionImport.js');
  const native = parseTsvText('Date\tPayee\tDescription\tPayment\tDeposit\n10/21/2026\tSHOP\tNOTES\t$ 5.44\t');
  const txn = build(native, autoMapTransactionColumns(native.meta))[0];
  assert.equal(txn.payee, 'SHOP');assert.equal(txn.description, 'NOTES');assert.equal(txn.payment, '5.44');assert.equal(txn.deposit, '');
  const quicken = parseTsvText('Date\tDescription\tMemo\tAmount\n10/21/2026\tSHOP\tNOTES\t-$ 5.44');
  const q = build(quicken, autoMapTransactionColumns(quicken.meta))[0];
  assert.equal(q.payee, 'SHOP');assert.equal(q.description, 'NOTES');assert.equal(q.payment, '5.44');assert.equal(q.deposit, '');
});
