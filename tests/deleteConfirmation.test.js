import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteTransactionConfirmation } from '../src/utils/deleteConfirmation.js';

test('cleared transactions recommend a reversal before deletion', () => {
  const message = deleteTransactionConfirmation({ id: 'a', cleared: 'TRUE' }, []);
  assert.match(message, /not advised/);
  assert.match(message, /new transaction that reverses it/);
  assert.match(message, /Delete this transaction anyway/);
});

test('a cleared transfer partner triggers the warning from either side', () => {
  const source = { id: 'a', transferId: 'transfer', cleared: 'FALSE' };
  const destination = { id: 'b', transferId: 'transfer', cleared: 'TRUE' };
  const message = deleteTransactionConfirmation(source, [source, destination]);
  assert.match(message, /includes a cleared transaction/);
  assert.match(message, /Delete both sides of the transfer anyway/);
});

test('uncleared transactions retain the ordinary confirmation', () => {
  assert.equal(deleteTransactionConfirmation({ id: 'a', cleared: 'FALSE' }, []), 'Delete this transaction?');
});
