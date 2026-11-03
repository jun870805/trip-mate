import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createReplyFeedbackReporter } from './reply-feedback.ts';
import type { Message } from '../../ai/contracts.ts';
import { questionForReply } from '../../ai/ui/presentation.ts';
const config={serviceId:'service',templateId:'template',publicKey:'public'};
const report={id:'reply-1',question:'這天午餐吃什麼？',answer:'建議這間餐廳。',tripName:'測試旅程',tripId:'T001',model:'gemini-test',pageUrl:'https://example.com/trip/T001?token=private-token'};
it('reports the selected bad reply with the exact title and fixed recipient template only once',async()=>{
  const bodies:Record<string,unknown>[]=[];
  const reporter=createReplyFeedbackReporter(config,async(url,init)=>{assert.equal(url,'https://api.emailjs.com/api/v1.0/email/send');bodies.push(JSON.parse(String(init?.body)));return new Response('OK');});
  await reporter.send(report,new AbortController().signal);
  const params=bodies[0].template_params as Record<string,string>;
  assert.equal(params.title,'AI回覆不佳回報');assert.equal(params.subject,'AI回覆不佳回報');
  assert.ok(params.message.includes(report.question) && params.message.includes(report.answer) && params.message.includes(report.model));
  assert.ok(!params.message.includes('private-token'));assert.equal(params.to_email,undefined);
  await assert.rejects(reporter.send(report,new AbortController().signal));assert.equal(bodies.length,1);
});
it('pairs feedback with the question preceding that reply, ignoring later questions and tool results',()=>{
  const messages:Message[]=[{role:'user',parts:[{text:'原問題'},{text:'附件不應寄出'}]},{role:'model',parts:[{call:{name:'tool',args:{}}}]},{role:'user',parts:[{result:{name:'tool',response:{status:'success'}}}]},{role:'model',parts:[{text:'被評分回答'}]},{role:'user',parts:[{text:'較晚的問題'}]}];
  assert.equal(questionForReply(messages,3),'原問題');assert.equal(questionForReply(messages,0),'');
});
it('bounds and redacts reply feedback and never retries unknown failures',async()=>{
  let calls=0;
  const reporter=createReplyFeedbackReporter(config,async(_url,init)=>{calls++;const body=String(init?.body);assert.ok(new TextEncoder().encode(body).byteLength<45000);assert.ok(!body.includes('private-secret'));throw new Error('network');});
  await assert.rejects(reporter.send({...report,question:'中'.repeat(20000),answer:'Bearer private-secret '+'文'.repeat(20000)},new AbortController().signal));
  await assert.rejects(reporter.send(report,new AbortController().signal));assert.equal(calls,1);
});
