import assert from 'node:assert/strict';
import test from 'node:test';
import { overlayPendingOperations } from '../src/utils/pendingOverlay.js';

test('pending transfer and reconciliation changes appear after reload', () => {
  const data = { transactions: [{ id: 'source', cleared: 'FALSE' }], reconciliations: [], reconcile_drafts: [{ id: 'draft' }] };
  const operations = [{ status: 'sending', sequence: 1, payload: { changes: [
    { tab: 'transactions', id: 'destination', after: { id: 'destination', deposit: '20' } },
    { tab: 'transactions', id: 'source', after: { id: 'source', cleared: 'TRUE' } },
    { tab: 'reconciliations', id: 'recon', after: { id: 'recon' } },
    { tab: 'reconcile_drafts', id: 'draft', after: null },
  ] } }];
  const result = overlayPendingOperations(data, operations);
  assert.deepEqual(result.transactions.map((row) => row.id).sort(), ['destination', 'source']);
  assert.equal(result.transactions.find((row) => row.id === 'source').cleared, 'TRUE');
  assert.deepEqual(result.reconciliations, [{ id: 'recon' }]);
  assert.deepEqual(result.reconcile_drafts, []);
  assert.equal(data.transactions[0].cleared, 'FALSE');
});
