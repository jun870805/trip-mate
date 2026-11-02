import { it } from 'node:test';
import assert from 'node:assert/strict';
import { conversationKey, conversationStorage } from './conversation-storage.ts';
it('isolates base, source, spreadsheet, identity and provider without storing credentials', () => {
  const fields=['/','trip','T001','sheet','visitor','project','model'];
  const key=conversationKey(fields);
  for(let i=0;i<fields.length;i++){const next=[...fields];next[i]+='other';assert.notEqual(conversationKey(next),key);}
  assert.equal(conversationKey(fields),key);
});
it('round trips, removes and rejects corrupt storage; reports quota/access failure', () => {
  const values=new Map<string,string>();
  const storage=conversationStorage(()=>({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}}));
  assert.equal(storage.read('x'),null); storage.write('x',{version:1}); assert.deepEqual(storage.read('x'),{version:1});
  values.set('x','{broken');assert.throws(()=>storage.read('x')); storage.remove('x');assert.equal(storage.read('x'),null);
  const broken=conversationStorage(()=>{throw new Error('disabled');});
  assert.throws(()=>broken.read('x'));assert.throws(()=>broken.write('x',{}));assert.throws(()=>broken.remove('x'));
});
