export const GLOBAL_BOOK_CLASS_NAME = 'All Students';

export const getBookItemType = (item = {}) =>
  String(item.itemType || '').trim().toLowerCase() === 'diary' ? 'diary' : 'book';

export const isDiaryItem = (item = {}) => getBookItemType(item) === 'diary';

export const allowsRepeatIssue = (item = {}) => isDiaryItem(item);

export const isReturnableItem = (item = {}) => !isDiaryItem(item);

