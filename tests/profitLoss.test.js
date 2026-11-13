import test from 'node:test';
import assert from 'node:assert/strict';
import { sortProfitLossItems } from '../src/utils/profitLoss.js';

test('profit and loss line items sort alphabetically without changing amounts', () => {
  const items = [
    { name: 'Utilities', amount: 31 },
    { name: 'advertising', amount: 12 },
    { name: 'Meals', amount: 8 },
  ];
  assert.deepEqual(sortProfitLossItems(items), [
    { name: 'advertising', amount: 12 },
    { name: 'Meals', amount: 8 },
    { name: 'Utilities', amount: 31 },
  ]);
  assert.deepEqual(items.map((item) => item.name), ['Utilities', 'advertising', 'Meals']);
});
