const toFinitePrice = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

export const getUniformSizePrice = (item, size) => {
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

export const getUniformPriceSummary = (item) => {
  const prices = (item?.sizes || []).map((sizeItem) => getUniformSizePrice(item, sizeItem));

  if (prices.length === 0) {
    const price = getUniformSizePrice(item);
    return { minPrice: price, maxPrice: price, hasVariablePrices: false };
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return { minPrice, maxPrice, hasVariablePrices: minPrice !== maxPrice };
};

export const calculateUniformStockValue = (item) =>
  (item?.sizes || []).reduce(
    (sum, sizeItem) =>
      sum + Number(sizeItem.stock || 0) * getUniformSizePrice(item, sizeItem),
    0
  );
