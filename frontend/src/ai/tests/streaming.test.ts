import { it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAgent } from '../core/controller.ts';
import { createFirebaseProvider } from '../providers/firebase.ts';
import type { Content } from '@firebase/ai';
import type { AgentState, ProviderRequest } from '../contracts.ts';
const context={scope:'test',scopeId:'A',locale:'zh-TW',permissions:['read']};
const request:ProviderRequest={context,system:'rules',messages:[{role:'user',parts:[{text:'問題'}]}],tools:[],signal:new AbortController().signal};
const content=(text:string,thought=false):Content=>({role:'model',parts:[{text,...(thought?{thought:true}:{})}]});
it('streams visible text while waiting for the final signed response; never executes partial tool calls',async()=>{
  let release!:()=>void,generated=0;
  const final={role:'model' as const,parts:[{text:'第一段\n第二段',thoughtSignature:'signature'},{functionCall:{name:'read',args:{query:'完整參數'}},thoughtSignature:'tool-signature'}]};
  const chunks:string[]=[];
  const provider=createFirebaseProvider({async generateContent(){generated++;return {response:{candidates:[{content:final}]}};},async generateContentStream(){return {
    stream:(async function*(){yield {candidates:[{content:content('內部思考',true)}]};yield {candidates:[{content:content('第一段\n')}]};await new Promise<void>(resolve=>{release=resolve;});yield {candidates:[{content:content('第二段')}]};})(),
    response:Promise.resolve({candidates:[{content:final}]}),
  };}});
  const work=provider.generate({...request,onText:delta=>chunks.push(delta)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(chunks,['第一段\n']);release();
  const response=await work;
  assert.deepEqual(chunks,['第一段\n','第二段']);assert.equal(generated,0);
  assert.deepEqual(response.opaque,final);
  assert.equal(response.parts.filter(p=>'call'in p).length,1);
});
it('publishes partial answers and actual tool progress, then commits only the final answer to history',async()=>{
  let release!:()=>void,turn=0;
  const states:AgentState[]=[];
  const agent=createAgent({getContext:()=>context,tools:[{name:'read',description:'read',risk:'read',schema:z.strictObject({}),enabled:()=>true,
    async execute(){assert.equal(agent.getState().activity?.phase,'tool');assert.equal(agent.getState().activity?.toolName,'read');return {status:'success'};}}],provider:{async generate(req){
    if(turn++===0)return {parts:[{call:{name:'read',args:{}}}]};
    req.onText?.('第一段');await new Promise<void>(resolve=>{release=resolve;});req.onText?.('第二段');
    return {parts:[{text:'第一段第二段'}]};
  }}});
  agent.subscribe(()=>states.push(agent.getState()));
  const work=agent.send('問題');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(agent.getState().partialText,'第一段');assert.equal(agent.getState().activity?.phase,'responding');
  assert.equal(agent.exportConversation(),null);release();await work;
  assert.equal(agent.getState().partialText,undefined);assert.equal(agent.getState().activity,undefined);
  assert.equal(agent.getState().messages.filter(m=>m.role==='model'&&m.parts.some(p=>'text'in p)).length,1);
  assert.ok(agent.exportConversation());assert.ok(states.some(s=>s.activity?.phase==='tool'));
});
it('drops late chunks and failed partial output without persisting or retrying it',async()=>{
  let release!:()=>void,emit!:(delta:string)=>void;
  const agent=createAgent({getContext:()=>context,tools:[],provider:{async generate(req){emit=req.onText!;emit('未完成');await new Promise<void>(resolve=>{release=resolve;});emit('晚到');return {parts:[{text:'晚到'}]};}}});
  const work=agent.send('問題');await new Promise(resolve=>setImmediate(resolve));
  agent.cancel();emit('取消之後');release();await work;
  assert.equal(agent.getState().messages.length,0);assert.equal(agent.getState().partialText,undefined);
  const broken=createAgent({getContext:()=>context,tools:[],provider:{async generate(req){req.onText?.('不完整答案');throw new Error('broken');}}});
  await broken.send('問題');assert.equal(broken.getState().status,'error');assert.equal(broken.getState().partialText,undefined);assert.equal(broken.exportConversation(),null);
});

it('handles iterator and aggregate failures as one reportable streaming failure, without retry',async()=>{
  let calls=0;
  const provider=createFirebaseProvider({async generateContent(){calls++;throw new Error('must not fall back');},async generateContentStream(){return {
    stream:(async function*(){yield {candidates:[{content:content('未完成')} ]};throw Object.assign(new Error('Disconnected'),{status:503});})(),
    response:Promise.reject(new Error('aggregate failed')),
  };}});
  await assert.rejects(provider.generate({...request,onText(){}}),(error:unknown)=>{
    const value=error as {details?:{code?:string;operation?:string}};
    return value.details?.code==='503' && value.details.operation==='streamGenerateContent';
  });
  assert.equal(calls,0);
});
it('coalesces text parts while preserving the full signed streaming response',async()=>{
  const final:Content={role:'model',parts:Array.from({length:100},(_,i)=>({text:String(i),thoughtSignature:`sig-${i}`}))};
  const provider=createFirebaseProvider({async generateContent(){return {response:{candidates:[{content:final}]}};},async generateContentStream(){return {
    stream:(async function*(){yield {};yield {candidates:[{content:content('文字')}]};})(),response:Promise.resolve({candidates:[{content:final}]}),
  };}});
  const result=await provider.generate({...request,onText(){}});
  assert.equal(result.parts.length,1);assert.deepEqual(result.opaque,final);
});
