import { it } from 'node:test';
import assert from 'node:assert/strict';
import { previewRows, displayAIText, writeResultLabel } from './preview.ts';
it('presents changed fields and hides business IDs for ordinary users',()=>{
  const change={operation:'update' as const,target:'I001',before:{行程ID:'I001',標題:'景點',日期:'2027-01-01',開始時間:'09:00',排序:'10'},after:{行程ID:'I001',標題:'景點',日期:'2027-01-02',開始時間:'',排序:'20'}};
  const rows=previewRows(change,false);
  assert.equal(rows.title,'景點');
  assert.equal(rows.id,undefined);
  assert.deepEqual(rows.fields.map(field=>field.name),['日期','開始時間']);
  assert.equal(rows.fields[1].after,'未填寫');
  assert.equal(previewRows(change,true).id,'I001');
  assert.ok(!displayAIText('請看 I001 與 T001',false).includes('I001'));
});
it('shows create/delete fields and truthful write status',()=>{
  assert.equal(previewRows({operation:'create',after:{標題:'新增',內文:'  x\n\n'}},false).fields[1].after,'  x\n\n');
  assert.equal(previewRows({operation:'delete',before:{標題:'刪除'}},false).title,'刪除');
  assert.equal(writeResultLabel('itinerary_get_summary',{status:'success'}),null);
  assert.match(writeResultLabel('itinerary_add',{status:'success',data:{count:1}})!,/已儲存/);
  assert.match(writeResultLabel('itinerary_add',{status:'cancelled'})!,/未執行/);
  assert.match(writeResultLabel('itinerary_add',{status:'conflict'})!,/未確認/);
});

it('email results report accepted requests without claiming itinerary writes or delivery',()=>{
  assert.equal(writeResultLabel('itinerary_request_email',{status:'success'}),'郵件服務已接受寄送申請，等待導遊回覆；行程尚未修改。');
  assert.equal(writeResultLabel('itinerary_request_email',{status:'cancelled'}),'已取消寄送，未寄出郵件。');
  assert.ok(writeResultLabel('itinerary_request_email',{status:'error'})?.includes('勿直接重送'));
});
