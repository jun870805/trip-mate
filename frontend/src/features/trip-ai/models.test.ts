import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readModelOptions, readFirebaseConfig } from './config.ts';
const env={VITE_AI_ENABLED:'true',VITE_AI_FIREBASE_CONFIG:'{"apiKey":"public","projectId":"p","appId":"app"}',VITE_AI_DEFAULT_MODEL:'default-model',VITE_AI_APP_CHECK_SITE_KEY:'site'};
it('default model stays available and recommended with normalized unique model choices',()=>{
  assert.deepEqual(readModelOptions(env),{defaultModel:'default-model',models:['default-model']});
  assert.deepEqual(readModelOptions({...env,VITE_AI_MODELS:'[" second-model ","default-model","second-model"]'}),{defaultModel:'default-model',models:['default-model','second-model']});
  assert.deepEqual(readModelOptions({...env,VITE_AI_MODELS:'[]'}).models,['default-model']);
});
it('factory configuration defaults to VITE_AI_DEFAULT_MODEL and accepts only listed alternatives',()=>{
  const configured={...env,VITE_AI_MODELS:'["second-model"]'};
  assert.equal(readFirebaseConfig(configured)?.model,'default-model');
  assert.equal(readFirebaseConfig(configured,'second-model')?.model,'second-model');
  assert.throws(()=>readFirebaseConfig(configured,'unlisted-model'));
});
it('rejects invalid lists, missing defaults, empty names and oversized model names',()=>{
  for(const VITE_AI_MODELS of ['bad','{}','[12]','[""]','[" "]',JSON.stringify(['x'.repeat(201)]),JSON.stringify(Array.from({length:21},(_,i)=>`m${i}`))]){
    assert.throws(()=>readModelOptions({...env,VITE_AI_MODELS}));
  }
  assert.throws(()=>readModelOptions({}));
});
