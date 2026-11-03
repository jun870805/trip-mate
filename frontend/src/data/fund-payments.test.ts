import { it } from 'node:test';
import assert from 'node:assert/strict';
import demo from './demo.json' with { type: 'json' };
import { parseCatalog, parseTrip } from './portal.ts';
import { mutateTripBook } from './trip-editor.ts';
import { commonFundAmount, equalFundShares, fundTypeLabel } from './fund-payments.ts';
const selected=[{memberId:'M001',amount:''},{memberId:'M003',amount:''}];
it('records equal per-person receipts and refunds with correct totals and member balances',()=>{
  const trip=parseCatalog(demo['旅程清單'])[0];
  const before=parseTrip(trip,demo);
  for(const type of ['儲值','退款']) {
    const book=mutateTripBook(trip,demo,{kind:'fund',mode:'add',values:{交易ID:'F099',日期:trip.start,類型:type,項目:'共同金額測試'},shares:equalFundShares(selected,'100','JPY'),expense:{}});
    const data=parseTrip(trip,book), sign=type==='退款'?-1:1;
    const transaction=data.transactions.find(row=>row.id==='F099')!;
    assert.equal(transaction.amount,sign*200);
    assert.deepEqual(transaction.shares.map(share=>share.amount),[sign*100,sign*100]);
    for(const member of data.members) assert.equal(member.balance,before.members.find(row=>row.id===member.id)!.balance+(['M001','M003'].includes(member.id)?sign*100:0));
  }
});
it('validates positive integer common amounts without coercing invalid input',()=>{
  for(const amount of ['','0','-1','1.5','1e2','1,000',' 100 ']) assert.throws(()=>equalFundShares(selected,amount,'JPY'));
  assert.throws(()=>equalFundShares([],'100','JPY'));
  assert.deepEqual(equalFundShares(selected,'100','JPY'),[{memberId:'M001',amount:'100'},{memberId:'M003',amount:'100'}]);
});
it('preserves unequal legacy payments unless a common amount is explicitly provided',()=>{
  const legacy=[{memberId:'M001',amount:'100'},{memberId:'M003',amount:'200'}];
  assert.equal(commonFundAmount(legacy,'JPY'),'');
  assert.equal(commonFundAmount([{memberId:'M001',amount:'100.00'},{memberId:'M003',amount:'100'}],'TWD'),'100.00');
  assert.equal(commonFundAmount([],'JPY'),'');
  assert.deepEqual(equalFundShares(selected,'','JPY',legacy),legacy);
  assert.deepEqual(equalFundShares(selected,'50','JPY',legacy),[{memberId:'M001',amount:'50'},{memberId:'M003',amount:'50'}]);
  assert.throws(()=>equalFundShares([...selected,{memberId:'M002',amount:''}],'','JPY',legacy));
  assert.equal(fundTypeLabel('儲值'),'收款');assert.equal(fundTypeLabel('退款'),'退款');
});
