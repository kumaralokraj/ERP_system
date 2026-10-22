import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateUniformStockValue,
  getUniformPriceSummary,
  getUniformSizesWithPrices,
  resolveUniformSizePrice,
} from '../utils/uniformPricing.js';

test('size price overrides the legacy item price', () => {
  const item = {
    pricePerItem: 100,
    sizes: [{ size: 'S', stock: 2, pricePerItem: 125 }],
  };

  assert.equal(resolveUniformSizePrice(item, 'S'), 125);
});

test('legacy item price hydrates old sizes without a price', () => {
  const item = {
    pricePerItem: 100,
    sizes: [{ size: 'S', stock: 2 }],
  };

  assert.deepEqual(getUniformSizesWithPrices(item), [
    { size: 'S', stock: 2, pricePerItem: 100 },
  ]);
});

test('legacy item price also hydrates null size prices', () => {
  const item = {
    pricePerItem: 100,
    sizes: [{ size: 'S', stock: 2, pricePerItem: null }],
  };

  assert.equal(resolveUniformSizePrice(item, 'S'), 100);
});

test('unknown sizes do not use the legacy item price', () => {
  const item = {
    pricePerItem: 100,
    sizes: [{ size: 'S', stock: 2 }],
  };

  assert.equal(resolveUniformSizePrice(item, 'L'), 0);
});

test('stock value and range use each size price', () => {
  const item = {
    sizes: [
      { size: 'S', stock: 2, pricePerItem: 100 },
      { size: 'L', stock: 3, pricePerItem: 150 },
    ],
  };

  assert.equal(calculateUniformStockValue(item), 650);
  assert.deepEqual(getUniformPriceSummary(item), {
    minPrice: 100,
    maxPrice: 150,
    hasVariablePrices: true,
  });
});
