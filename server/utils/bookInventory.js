export const BOOK_ITEM_TYPES = ['book', 'diary'];
export const GLOBAL_BOOK_CLASS_NAME = 'All Students';

export const normalizeBookItemType = (value) =>
  String(value || '').trim().toLowerCase() === 'diary' ? 'diary' : 'book';

export const isDiaryItem = (item = {}) => normalizeBookItemType(item.itemType) === 'diary';

export const allowsRepeatIssue = (item = {}) => isDiaryItem(item);

export const isReturnableItem = (item = {}) => !isDiaryItem(item);

export const resolveInventoryIssueClassName = ({
  requestedClassName = '',
  fallbackClassName = '',
  items = [],
} = {}) => {
  const requested = String(requestedClassName || '').trim();
  if (requested && requested !== 'N/A') return requested;

  const fallback = String(fallbackClassName || '').trim();
  if (fallback && fallback !== 'N/A') return fallback;

  return items.length > 0 && items.every(isDiaryItem) ? GLOBAL_BOOK_CLASS_NAME : '';
};
