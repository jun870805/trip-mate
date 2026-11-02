import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseProvider } from '../providers/firebase.ts';
import { createAgent } from '../core/controller.ts';

it('keeps API code and sanitized response in a reportable failure without credentials or opaque data',async()=>{
  const secret='AIza'+'x'.repeat(35);
  const provider=createFirebaseProvider({async generateContent(){throw Object.assign(new Error(`Error fetching from https://firebasevertexai.googleapis.com/v1beta/models/model:generateContent?key=${secret}: [401 Unauthorized] Firebase App Check token is invalid. Authorization: Bearer very-secret-token`),{code:'ai/fetch-error',customErrorData:{status:401,errorDetails:[{authorization:'do-not-serialize'}]}});}});
  const agent=createAgent({provider,tools:[],getContext:()=>({scope:'trip',scopeId:'T001',locale:'zh-TW',permissions:['read']})});
  await agent.send('最後一句話');
  const state=agent.getState();
  assert.equal(state.status,'error');
  assert.equal(state.failure?.code,'401');
  assert.match(state.error!,/錯誤代碼：401/);
  assert.match(state.error!,/Firebase App Check token is invalid/);
  assert.ok(state.failure?.id);
  const serialized=JSON.stringify(state.failure);
  for(const value of [secret,'very-secret-token','do-not-serialize']) assert.ok(!serialized.includes(value));
  assert.equal(agent.exportConversation(),null);
  agent.cancel();assert.equal(agent.getState().failure,undefined);
});
it('retains quota and model guidance alongside reportable HTTP details',async()=>{
  for(const [status,code] of [[404,'model_unavailable'],[429,'rate_limit']] as const){
    const provider=createFirebaseProvider({async generateContent(){throw {customErrorData:{status},message:'Server unavailable'};}});
    const agent=createAgent({provider,tools:[],getContext:()=>({scope:'trip',scopeId:'T001',locale:'zh-TW',permissions:[]})});
    await agent.send('測試');assert.equal(agent.getState().errorCode,code);assert.equal(agent.getState().failure?.code,String(status));
  }
});
it('bounds unstructured provider failures and distinguishes them from local validation errors',async()=>{
  const provider=createFirebaseProvider({async generateContent(){throw new Error('x'.repeat(20000));}});
  const agent=createAgent({provider,tools:[],getContext:()=>({scope:'trip',scopeId:'T001',locale:'zh-TW',permissions:[]})});
  await agent.send('測試');assert.ok(agent.getState().failure!.message.length<=2000);
  assert.equal(agent.getState().failure!.code,'unknown');
  await assert.rejects(agent.send(''));
});
