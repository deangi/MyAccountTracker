import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceAppState } from '../src/store/appReducer.js';

test('reconciliation completion updates history, selected rows and draft together', () => {
  const state = {
    transactions: [{ id: 'a', cleared: 'FALSE' }, { id: 'b', cleared: 'FALSE' }],
    reconciliations: [], reconcileDrafts: [{ id: 'draft' }],
  };
  const next = reduceAppState(state, {
    type: 'COMPLETE_RECONCILIATION',
    payload: { reconciliation: { id: 'recon' }, transactionIds: ['a'], draftId: 'draft' },
  });
  assert.deepEqual(next.reconciliations, [{ id: 'recon' }]);
  assert.deepEqual(next.reconcileDrafts, []);
  assert.equal(next.transactions[0].cleared, 'TRUE');
  assert.equal(next.transactions[0].reconciliationId, 'recon');
  assert.equal(next.transactions[1].cleared, 'FALSE');
  assert.equal(state.transactions[0].cleared, 'FALSE');
});
