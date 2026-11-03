import { it } from 'node:test';
import assert from 'node:assert/strict';
import type { Transaction } from './portal.ts';
import { fullParticipationFundCost, perPersonPretripCost } from './expense-summary.ts';
const spend = (amount: number, members: string[]): Transaction => ({
  id: 'F001',date:'2027-05-01',type:'支出',title:'消費',amount:-amount,
  shares:members.map(memberId=>({memberId,amount:-Math.ceil(amount/members.length)})),
});
it('adds one share of every actual expense even when no member participated in all of them', () => {
  assert.equal(fullParticipationFundCost([spend(1000,['M001','M002']),spend(600,['M002','M003']),spend(300,['M001','M003'])]),950);
});
it('rounds up each actual cost share and excludes top-ups, refunds and adjustments', () => {
  const expense=spend(1000,['M001','M002','M003']);
  assert.equal(fullParticipationFundCost([expense,expense,expense]),1002);
  assert.equal(fullParticipationFundCost([expense,expense]),668);
  for(const type of ['儲值','退款','調整']) assert.equal(fullParticipationFundCost([{...expense,type},expense]),334);
  assert.equal(fullParticipationFundCost([]),0);
});
it('does not display a valid zero if a spending record has no participants', () => {
  assert.equal(fullParticipationFundCost([spend(1000,[])]),null);
});

it('divides each pretrip expense by its own participants and rounds up in minor units', () => {
  const expense={id:'E001',amount:100001};
  const dues=[{expenseId:'E001',memberId:'M001'},{expenseId:'E001',memberId:'M002'},{expenseId:'E001',memberId:'M003'},{expenseId:'E002',memberId:'M004'}];
  assert.equal(perPersonPretripCost(expense,dues),33334);
  assert.equal(perPersonPretripCost({...expense,amount:90000},dues),30000);
  assert.equal(perPersonPretripCost({id:'E003',amount:100},dues),null);
  assert.equal(perPersonPretripCost(expense,[...dues,dues[0]]),33334);
});
