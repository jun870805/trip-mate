import { it } from 'node:test';
import assert from 'node:assert/strict';
import { chatEntries } from '../ui/presentation.ts';

it('shows user text and filenames but never extracted documents, tool arguments or opaque content',()=>{
  const entries=chatEntries([
    {role:'user',parts:[{text:'幫我匯入'},{text:JSON.stringify({sourceFile:'plan.csv',untrustedContent:'private document'})}]},
    {role:'model',opaque:{secret:'opaque secret'},parts:[{call:{name:'update',args:{token:'never display'}}}]},
    {role:'user',parts:[{result:{name:'update',response:{status:'success',data:{token:'never display'}}}}]},
    {role:'model',parts:[{text:'已收到結果。'}]},
  ]);
  assert.equal(entries.length,2);
  assert.deepEqual(entries[0].files,['plan.csv']);
  assert.ok(!JSON.stringify(entries).includes('private document'));
  assert.ok(!JSON.stringify(entries).includes('never display'));
  assert.ok(!JSON.stringify(entries).includes('opaque secret'));
});
it('renders safe tool status only through a host formatter and binary attachment names',()=>{
  const entries=chatEntries([
    {role:'user',parts:[{text:'看圖片'},{attachment:{name:'photo.png',mimeType:'image/png',data:'secret base64'}}]},
    {role:'user',parts:[{result:{name:'write',response:{status:'cancelled'}}}]},
  ],(_name,result)=>result.status==='cancelled'?'未執行修改':null);
  assert.equal(entries[0].files[0],'photo.png');
  assert.equal(entries[1].text,'未執行修改');
  assert.ok(!JSON.stringify(entries).includes('base64'));
});
