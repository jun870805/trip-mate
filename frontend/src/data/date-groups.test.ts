import { it } from 'node:test';
import assert from 'node:assert/strict';
import { groupRowsByDate } from './date-groups.ts';

it('groups accounting records chronologically without changing same-day order or source rows', () => {
  const rows = [
    { 日期: '2027-05-03', 項目: 'later' },
    { 日期: '2027-05-01', 項目: 'first' },
    { 日期: '2027-05-01', 項目: 'second' },
  ];
  const original = structuredClone(rows);
  const groups = groupRowsByDate(rows, '日期');
  assert.deepEqual(groups.map(group => group.date), ['2027-05-01', '2027-05-03']);
  assert.deepEqual(groups[0].rows.map(row => row['項目']), ['first', 'second']);
  assert.deepEqual(rows, original);
  assert.deepEqual(groupRowsByDate([], '日期'), []);
});

it('uses the receipt date for collection batches', () => {
  const rows = [{ 收款日期: '2027-05-02' }, { 收款日期: '2027-04-30' }];
  assert.deepEqual(groupRowsByDate(rows, '收款日期').map(group => group.date), ['2027-04-30', '2027-05-02']);
});
