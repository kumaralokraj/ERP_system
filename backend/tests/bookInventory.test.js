import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GLOBAL_BOOK_CLASS_NAME,
  allowsRepeatIssue,
  isDiaryItem,
  isReturnableItem,
  normalizeBookItemType,
  resolveInventoryIssueClassName,
} from '../utils/bookInventory.js';

test('ordinary books retain one-active-issue and return behavior', () => {
  const book = { itemType: 'book', className: '5' };

  assert.equal(normalizeBookItemType(undefined), 'book');
  assert.equal(isDiaryItem(book), false);
  assert.equal(allowsRepeatIssue(book), false);
  assert.equal(isReturnableItem(book), true);
});

test('diaries are global, repeat-issuable, and non-returnable', () => {
  const diary = { itemType: 'DIARY', className: GLOBAL_BOOK_CLASS_NAME };

  assert.equal(normalizeBookItemType(diary.itemType), 'diary');
  assert.equal(diary.className, 'All Students');
  assert.equal(isDiaryItem(diary), true);
  assert.equal(allowsRepeatIssue(diary), true);
  assert.equal(isReturnableItem(diary), false);
});

test('a diary-only issue works even when the student has no class', () => {
  assert.equal(
    resolveInventoryIssueClassName({
      requestedClassName: 'N/A',
      fallbackClassName: 'N/A',
      items: [{ itemType: 'diary' }],
    }),
    GLOBAL_BOOK_CLASS_NAME
  );

  assert.equal(
    resolveInventoryIssueClassName({
      requestedClassName: '',
      fallbackClassName: 'N/A',
      items: [{ itemType: 'book' }],
    }),
    ''
  );
});
