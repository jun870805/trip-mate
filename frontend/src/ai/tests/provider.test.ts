import type { Content } from '@firebase/ai';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseProvider, firebaseSchema } from '../providers/firebase.ts';
import { z } from 'zod';
import type { ProviderRequest } from '../contracts.ts';
const request: ProviderRequest = {
  context: {scope:'example', scopeId:'A', locale:'zh-TW', permissions:[]}, system:'rules',
  messages:[{role:'user',parts:[{text:'test'}]}], tools:[], signal: new AbortController().signal,
};
it('maps tool requests and responses and preserves signed provider content', async () => {
  const signedPart = { functionCall: {name:'read',args:{}}, thoughtSignature: 'signature' };
  const content: Content = { role: 'model', parts: [signedPart] };
  const calls: unknown[] = [];
  const provider = createFirebaseProvider({ async generateContent(value) {
    calls.push(value); return { response: { candidates: [{content}] } };
  } });
  const result = await provider.generate(request);
  assert.deepEqual(result.parts, [{call:{name:'read',args:{}}}]);
  await provider.generate({...request, tools:[{ name:'read',description:'read',parameters:z.toJSONSchema(z.strictObject({value:z.string().optional()})) }], messages:[
    ...request.messages, {role:'model',...result}, {role:'user',parts:[{result:{name:'read',response:{status:'success',data:'real'}}}]},
  ]});
  const second = calls[1] as {contents: unknown[]};
  assert.deepEqual(second.contents[1], content);
  assert.deepEqual(second.contents[2], {role:'user',parts:[{functionResponse:{name:'read',response:{status:'success',data:'real'}}}]});
});
it('converts supported JSON Schema and refuses unsupported schema shapes', () => {
  const schema = firebaseSchema(z.toJSONSchema(z.strictObject({ n:z.number().int(), yes:z.boolean(), list:z.array(z.enum(['a','b'])) })));
  assert.ok(schema);
  assert.throws(() => firebaseSchema({ type:'null' }));
});
it('rejects blocked/empty content, aborts and ignores unsupported model executable code', async () => {
  for (const response of [{}, {candidates:[{content:{role:'model',parts:[{executableCode:{code:'evil()',language:'PYTHON'}}]} as unknown as Content}]}]) {
    const provider = createFirebaseProvider({ async generateContent() {return {response};} });
    await assert.rejects(provider.generate(request));
  }
  const provider = createFirebaseProvider({ async generateContent() {throw new Error('should not call');} });
  await assert.rejects(provider.generate({...request,signal:AbortSignal.abort()}));
});

it('fails incomplete runtime configuration before any SDK initialization',async()=>{
  const {initializeFirebaseProvider}=await import('../providers/firebase-runtime.ts');
  await assert.rejects(initializeFirebaseProvider({firebase:{},model:'',appCheckSiteKey:''}),/設定不完整/);
});

it('normalizes Firebase HTTP 429 without exposing raw provider error details',async()=>{
  const {ProviderRateLimitError}=await import('../core/errors.ts');
  for(const error of [{customErrorData:{status:429},message:'private key details'},{status:429}]){
    const provider=createFirebaseProvider({async generateContent(){throw error;}});
    await assert.rejects(provider.generate(request),ProviderRateLimitError);
  }
  const privateError=new Error('private SDK failure');
  const provider=createFirebaseProvider({async generateContent(){throw privateError;}});
  await assert.rejects(provider.generate(request),error=>error===privateError);
});

it('normalizes Firebase 404 as model unavailable while leaving unrelated errors unchanged',async()=>{
  const {ProviderModelUnavailableError}=await import('../core/errors.ts');
  for(const error of [{customErrorData:{status:404},message:'private model URL'},{status:404}]){
    const provider=createFirebaseProvider({async generateContent(){throw error;}});
    await assert.rejects(provider.generate(request),ProviderModelUnavailableError);
  }
  for(const status of [400,403,500]){
    const error={customErrorData:{status},message:'private details'};
    const provider=createFirebaseProvider({async generateContent(){throw error;}});
    await assert.rejects(provider.generate(request),value=>value===error);
  }
});
