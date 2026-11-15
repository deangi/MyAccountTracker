import assert from 'node:assert/strict';
import test from 'node:test';
import { planImportRows, transactionRowForChange } from '../src/services/importBatch.js';

const V3_TRANSACTION_HEADERS = ['id', 'accountId', 'checkNum', 'payment', 'deposit', 'deleted', 'rowVersion', 'lastOperationId'];
const row = (id, operationId = '') => ({
  id, accountId: 'account', checkNum: 'EFT', payment: '10', deposit: '',
  deleted: 'FALSE', rowVersion: '1', lastOperationId: operationId,
});
const change = (id) => ({ tab: 'transactions', id, before: null, after: row(id) });
const sheet = (rows) => ({ fields: V3_TRANSACTION_HEADERS, rows: rows.map((data, i) => ({ number: i + 2, data })) });

test('plans one row per imported transaction with stable row numbers', () => {
  const plan = planImportRows(sheet([]), [change('a'), change('b'), change('c')], 'import-1', V3_TRANSACTION_HEADERS);
  assert.deepEqual(plan.writes.map((write) => write.rowNumber), [2, 3, 4]);
  assert.deepEqual(plan.writes.map((write) => write.desired.lastOperationId), ['import-1', 'import-1', 'import-1']);
  assert.deepEqual(plan.locators.map((locator) => locator.rowNumber), [2, 3, 4]);
});

test('retry skips previously written rows and appends only missing rows', () => {
  const existing = row('a', 'import-1');
  const plan = planImportRows(sheet([existing]), [change('a'), change('b')], 'import-1', V3_TRANSACTION_HEADERS);
  assert.deepEqual(plan.writes.map((write) => [write.id, write.rowNumber]), [['b', 3]]);
  assert.deepEqual(plan.locators.map((locator) => locator.rowNumber), [2, 3]);
  assert.deepEqual(planImportRows(sheet([existing]), [change('a')], 'import-1', V3_TRANSACTION_HEADERS).writes, []);
});

test('retry stops if a previously written row changed', () => {
  assert.throws(() => planImportRows(sheet([{ ...row('a', 'import-1'), payment: '20' }]), [change('a')], 'import-1', V3_TRANSACTION_HEADERS), /changed/);
});

test('import stops rather than overwrite an existing transaction', () => {
  assert.throws(() => planImportRows(sheet([row('a', 'other-operation')]), [change('a')], 'import-1', V3_TRANSACTION_HEADERS), /already exists/);
});

test('deleting a transaction retains details in a tombstone', () => {
  const before = { ...row('a'), description: 'Disposable edit delete test', payment: '7.00' };
  const operation = { id: 'delete-1', createdAt: '2026-11-15T20:00:00Z' };
  const result = transactionRowForChange({ id: 'a', before, after: null }, { ...before, rowVersion: '2' }, operation);
  assert.equal(result.id, 'a');
  assert.equal(result.description, before.description);
  assert.equal(result.payment, '7.00');
  assert.equal(result.deleted, 'TRUE');
  assert.equal(result.deletedAt, operation.createdAt);
  assert.equal(result.deletedByOperationId, operation.id);
  assert.equal(result.rowVersion, '3');
});
