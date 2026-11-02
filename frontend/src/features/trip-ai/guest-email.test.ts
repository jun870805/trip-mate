import { it } from 'node:test';
import assert from 'node:assert/strict';
import demo from '../../data/demo.json' with {type:'json'};
import { parseCatalog, parseTrip } from '../../data/portal.ts';
import { readGuideConfig } from '../../data/guide-auth.ts';
import type { GuideSession } from '../../data/guide-auth.ts';
import { createGuestEmailTool } from './guest-email.ts';
import { createTripAgent } from './index.ts';
import { createEmailSender, readEmailConfig, formatEmailTime } from './emailjs.ts';
import type { Message, ProviderRequest } from '../../ai/contracts.ts';
const trip=parseCatalog(demo['旅程清單'])[0];
const config=readGuideConfig({VITE_GOOGLE_CLIENT_ID:'client',VITE_GUIDE_EMAILS:'[" First@Example.com ","other@example.com"]'});
const mail={serviceId:'service_test',templateId:'template_test',publicKey:'public_test'};
const call=(args:unknown={request:'希望第二天午餐改成素食餐廳。'})=>({parts:[{call:{name:'itinerary_request_email',args}}]});
function fixture(source:'trip'|'demo'='trip',status=200) {
  let session:GuideSession|null=null,reads=0;
  const requests:RequestInit[]=[], modelRequests:ProviderRequest[]=[], replies:Omit<Message,'role'>[]=[];
  const instance=createTripAgent({trip,source,config,email:mail,getSession:()=>session,
    readData:async()=>{reads++;return parseTrip(trip,demo);},
    fetcher:async(input,init)=>{assert.equal(String(input),'https://api.emailjs.com/api/v1.0/email/send');requests.push(init!);return new Response(status===200?'OK':'rejected',{status});},
    provider:{async generate(request){modelRequests.push(request);return replies.shift()||{parts:[{text:'依實際結果回覆。'}]};}}});
  return {...instance,requests,modelRequests,replies,setSession(value:GuideSession|null){session=value;},get reads(){return reads;}};
}
it('visitor email is a separate permission and sends only after one matching approval',async()=>{
  const f=fixture();f.replies.push(call());
  await f.agent.send('想調整午餐，請轉交導遊');
  assert.ok(f.host.getContext().permissions.includes('contact_guide'));
  assert.ok(!f.host.getContext().permissions.includes('write'));
  assert.equal(f.requests.length,0);
  const preview=f.agent.getState().pending!;
  assert.equal(preview.toolName,'itinerary_request_email');
  assert.equal((preview.changes[0].after as Record<string,string>)['收件人'],'first@example.com');
  await f.agent.approve(preview.id);
  assert.equal(f.requests.length,1);await assert.rejects(f.agent.approve(preview.id));
  const body=JSON.parse(String(f.requests[0].body));
  assert.deepEqual(Object.keys(body).sort(),['service_id','template_id','template_params','user_id']);
  assert.equal(body.template_params.to_email,undefined);
  assert.equal(body.template_params.title,trip.name);
  assert.equal(body.template_params.name,'未知使用者');
  assert.match(body.template_params.time,/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(body.template_params.message.includes('素食餐廳'));
  assert.ok(body.template_params.message.includes(trip.name));
  assert.equal(f.agent.getState().results.at(-1)?.status,'success');
  assert.equal(f.reads,2);
});
it('cancel never sends; unconfigured, demo, logged-in and cross-scope calls cannot send',async()=>{
  const f=fixture();f.replies.push(call());await f.agent.send('寄送');await f.agent.reject(f.agent.getState().pending!.id);assert.equal(f.requests.length,0);
  for(const source of ['demo','trip'] as const){
    const g=fixture(source);g.setSession({email:'first@example.com',token:'token',expiresAt:Date.now()+60000});
    g.replies.push(call());await g.agent.send('寄送');assert.equal(g.agent.getState().pending,undefined);assert.equal(g.requests.length,0);
  }
  const g=fixture();g.replies.push(call());await g.agent.send('寄送');g.setSession({email:'first@example.com',token:'token',expiresAt:Date.now()+60000});
  await g.agent.approve(g.agent.getState().pending!.id);assert.equal(g.requests.length,0);
});
it('strict schema rejects a model-selected recipient and invalid contact details',async()=>{
  for(const args of [{request:'調整',to:'attacker@example.com'},{request:'調整',replyTo:'bad'},{request:'x'.repeat(4001)}]){
    const f=fixture();f.replies.push(call(args));await f.agent.send('寄送');assert.equal(f.agent.getState().pending,undefined);assert.equal(f.requests.length,0);
    assert.equal(f.agent.getState().results[0]?.status,'validation_error');
  }
});
it('rejected provider response stops and never retries',async()=>{
  const f=fixture('trip',429);f.replies.push(call());await f.agent.send('寄送');await f.agent.approve(f.agent.getState().pending!.id);
  assert.equal(f.requests.length,1);assert.equal(f.agent.getState().status,'error');
});
it('email configuration is opt-in and incomplete settings disable email only',()=>{
  assert.equal(readEmailConfig({}),null);
  assert.equal(readEmailConfig({VITE_EMAILJS_ENABLED:'true'}),null);
  assert.deepEqual(readEmailConfig({VITE_EMAILJS_ENABLED:'true',VITE_EMAILJS_SERVICE_ID:' service_test ',VITE_EMAILJS_TEMPLATE_ID:'template_test',VITE_EMAILJS_PUBLIC_KEY:'public_test'}),mail);
});
it('sender validates status, response, size, cancellation and throttles without automatic retries',async()=>{
  let sends=0,now=0;
  const sender=createEmailSender(mail,async()=>{sends++;return new Response('OK');},()=>now);
  const controller=new AbortController();
  await sender.send({message:'hello'},controller.signal);assert.equal(sends,1);
  await assert.rejects(sender.send({message:'again'},controller.signal));assert.equal(sends,1);
  now=60001;await sender.send({message:'again'},controller.signal);assert.equal(sends,2);
  await assert.rejects(createEmailSender(mail).send({message:'x'.repeat(50000)},controller.signal));
  controller.abort();await assert.rejects(createEmailSender(mail).send({},controller.signal));
  await assert.rejects(createEmailSender(mail,async()=>new Response('unexpected')).send({},new AbortController().signal));
  await assert.rejects(createEmailSender(mail,async()=>{throw new Error('network');}).send({},new AbortController().signal));
});

it('sender aborts on timeout and external cancellation without retrying',async()=>{
  const blocked:typeof fetch=async(_input,init)=>new Promise((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  });
  await assert.rejects(createEmailSender(mail,blocked,Date.now,1).send({},new AbortController().signal));
  const controller=new AbortController();const sending=createEmailSender(mail,blocked).send({},controller.signal);
  controller.abort();await assert.rejects(sending);
});

it('mail preparation and commit reject stale data, changed recipient and duplicate direct commits',async()=>{
  const context={scope:'trip-itinerary',scopeId:trip.id,locale:'zh-TW',permissions:['read','contact_guide']};
  for(const variant of ['scope','data','recipient','duplicate','reply'] as const){
    const localConfig=structuredClone(config);let sent=0;
    const data=structuredClone(parseTrip(trip,demo));
    const tool=createGuestEmailTool({trip,source:'trip',config:localConfig,email:mail,getSession:()=>null,readData:async()=>data,
      fetcher:async(_input,init)=>{const params=JSON.parse(String(init?.body)).template_params;assert.equal(params.title,trip.name);assert.equal(params.name,variant==='reply'?'訪客':'未知使用者');sent++;return new Response('OK');}});
    const args={request:'午餐想換成素食。',...(variant==='reply'?{contactName:'訪客',replyTo:'visitor@example.com'}:{})};
    if(variant==='scope') {await assert.rejects(tool.prepare!(args,{...context,scopeId:'T999'},new AbortController().signal));continue;}
    const prepared=await tool.prepare!(args,context,new AbortController().signal);
    if(variant==='data') data.trip.id='T999';
    if(variant==='recipient') localConfig.emails[0]='other@example.com';
    const result=await prepared.commit(context,new AbortController().signal);
    assert.equal(sent,variant==='data'||variant==='recipient'?0:1);
    assert.equal(result.status,sent?'success':'error');
    if(variant==='duplicate'){assert.equal((await prepared.commit(context,new AbortController().signal)).status,'error');assert.equal(sent,1);}
  }
});
it('missing email config and missing guide address expose no mail capability',async()=>{
  for(const empty of ['email','recipient']){
    let calls=0;
    const instance=createTripAgent({trip,source:'trip',config:empty==='recipient'?{...config,emails:[]}:config,
      email:empty==='email'?undefined:mail,getSession:()=>null,readData:async()=>parseTrip(trip,demo),
      fetcher:async()=>{calls++;throw new Error('must not send');},
      provider:{async generate(request){return request.messages.length===1?call():{parts:[{text:'未啟用寄送'}]};}}});
    assert.ok(!instance.host.getContext().permissions.includes('contact_guide'));
    await instance.agent.send('請寄送需求');assert.equal(calls,0);assert.equal(instance.agent.getState().pending,undefined);
  }
});

it('email time uses Taiwan calendar date and 24-hour time at UTC day boundaries',()=>{
  assert.equal(formatEmailTime(new Date('2026-11-02T16:00:01Z')),'2026/11/03 00:00:01');
  assert.equal(formatEmailTime(new Date('2026-11-02T01:02:03Z')),'2026/11/02 09:02:03');
});
