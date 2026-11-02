import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createAIErrorReporter } from './error-report.ts';
import { lastUserMessage } from '../../ai/ui/presentation.ts';
const config={serviceId:'service',templateId:'template',publicKey:'public'};
const report={failure:{id:'failure-1',code:'401',message:'Firebase App Check token is invalid.'},lastMessage:'請調整午餐',tripName:'測試旅程',tripId:'T001',model:'gemini-test',projectId:'test-project',pageUrl:'https://example.com/trip/T001?token=secret'};
it('reports the final user message and safe API details through the existing fixed EmailJS template once',async()=>{
  const bodies:Record<string,unknown>[]=[];
  const reporter=createAIErrorReporter(config,async(url,init)=>{assert.equal(url,'https://api.emailjs.com/api/v1.0/email/send');bodies.push(JSON.parse(String(init?.body)));return new Response('OK');});
  await reporter.send(report,new AbortController().signal);
  const params=bodies[0].template_params as Record<string,string>;
  assert.equal(params.name,'錯誤回報');assert.equal(params.title,'測試旅程');
  assert.match(params.time,/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  for(const part of ['請調整午餐','401','Firebase App Check token is invalid.','gemini-test','test-project','generateContent']) assert.ok(params.message.includes(part));
  assert.ok(!params.message.includes('token=secret'));
  assert.equal(params.to_email,undefined);
  await assert.rejects(reporter.send(report,new AbortController().signal));assert.equal(bodies.length,1);
});
it('blocks concurrent reports and never retries a failed or unknown report',async()=>{
  let sends=0,finish!:()=>void;
  const reporter=createAIErrorReporter(config,async()=>{sends++;await new Promise<void>(resolve=>{finish=resolve;});return new Response('rejected',{status:500});});
  const sending=reporter.send(report,new AbortController().signal);
  await assert.rejects(reporter.send(report,new AbortController().signal));
  await assert.rejects(reporter.send({...report,failure:{...report.failure,id:'other'}},new AbortController().signal));
  finish();await assert.rejects(sending);
  await assert.rejects(reporter.send(report,new AbortController().signal));assert.equal(sends,1);
});
it('includes only the latest real user text, not tool results, files or earlier turns',()=>{
  assert.equal(lastUserMessage([{role:'user',parts:[{text:'先前內容'}]},{role:'user',parts:[{text:'最後內容'},{text:'附件原文不可寄送'}]},{role:'user',parts:[{result:{name:'tool',response:{status:'success',data:'private'}}}]}]),'最後內容');
  assert.equal(lastUserMessage([]),'');
});
it('bounds and redacts reports without serializing arbitrary fields',async()=>{
  let bytes=0;
  const reporter=createAIErrorReporter(config,async(_url,init)=>{const body=String(init?.body);bytes=new TextEncoder().encode(body).byteLength;assert.ok(!body.includes('very-secret-token'));assert.ok(!body.includes('do-not-send'));return new Response('OK');});
  await reporter.send({...report,lastMessage:'中'.repeat(20000)+' Bearer very-secret-token',failure:{...report.failure,message:'Bearer very-secret-token'},opaque:'do-not-send'} as typeof report,new AbortController().signal);
  assert.ok(bytes<45000);
});
