const toFinitePrice = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

export const resolveUniformSizePrice = (item, size) => {
  const hasRequestedSize = typeof size === 'string' && size.length > 0;
  const sizeRecord =
    typeof size === 'object'
      ? size
      : item?.sizes?.find((sizeItem) => sizeItem.size === size);
  const sizePrice = toFinitePrice(sizeRecord?.pricePerItem);

  if (sizePrice !== null) {
    return sizePrice;
  }

  if (hasRequestedSize && !sizeRecord) {
    return 0;
  }

  return toFinitePrice(item?.pricePerItem ?? item?.price) ?? 0;
};

export const getUniformSizesWithPrices = (item) =>
  (item?.sizes || []).map((sizeItem) => ({
    ...(typeof sizeItem?.toObject === 'function' ? sizeItem.toObject() : sizeItem),
    pricePerItem: resolveUniformSizePrice(item, sizeItem),
  }));

export const calculateUniformStockValue = (item) =>
  getUniformSizesWithPrices(item).reduce(
    (sum, sizeItem) =>
      sum + Number(sizeItem.stock || 0) * Number(sizeItem.pricePerItem || 0),
    0
  );

export const getUniformPriceSummary = (item) => {
  const prices = getUniformSizesWithPrices(item).map((sizeItem) => sizeItem.pricePerItem);

  if (prices.length === 0) {
    const legacyPrice = resolveUniformSizePrice(item);
    return {
      minPrice: legacyPrice,
      maxPrice: legacyPrice,
      hasVariablePrices: false,
    };
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  return {
    minPrice,
    maxPrice,
    hasVariablePrices: minPrice !== maxPrice,
  };
};
