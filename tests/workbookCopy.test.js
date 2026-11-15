import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWorkbookCopy } from '../src/utils/workbookCopy.js';

const source = {
  _meta: [['title', 'version'], ['Original', '3']],
  txn_Checking: [['id', 'checkNum', 'deleted'], ['a', '1042', 'FALSE'], ['b', 'EFT', 'TRUE']],
};

test('Save As comparison preserves every register value, including tombstones', () => {
  const copy = structuredClone(source);
  copy._meta[1][0] = 'Copy';
  assert.doesNotThrow(() => assertWorkbookCopy(source, copy, 'Copy'));
  copy.txn_Checking[2][1] = '';
  assert.throws(() => assertWorkbookCopy(source, copy, 'Copy'), /txn_Checking differs/);
});

test('Save As comparison rejects missing tabs and metadata changes', () => {
  assert.throws(() => assertWorkbookCopy(source, { _meta: source._meta }, 'Copy'), /tabs differ/);
  const copy = structuredClone(source);
  copy._meta[1] = ['Copy', '2'];
  assert.throws(() => assertWorkbookCopy(source, copy, 'Copy'), /metadata differs/);
});
