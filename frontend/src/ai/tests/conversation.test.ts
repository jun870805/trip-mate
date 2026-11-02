import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createAgent } from '../core/controller.ts';
import type { Message, Provider } from '../contracts.ts';
const context = { scope: 'test', scopeId: 'A', locale: 'zh-TW', permissions: [] };
const provider: Provider = { async generate() { return { parts: [{ text: '回答' }], opaque: { role: 'model', parts: [{ text: '回答', thoughtSignature: 'signed' }] } }; } };
const make = (scopeId = 'A') => createAgent({ provider, tools: [], getContext: () => ({ ...context, scopeId }) });
it('restores completed model context including opaque without executing a provider or tool', async () => {
  const first = make(); await first.send('問題');
  const checkpoint = first.exportConversation();
  const second = make(); second.restoreConversation(checkpoint);
  assert.deepEqual(second.getState().messages, first.getState().messages);
  assert.equal(second.getState().status, 'idle');
  await second.send('繼續'); assert.equal(second.getState().messages.length, 4);
  second.cancel(); assert.equal(second.exportConversation()?.messages.length, 0);
});
it('rejects cross-scope, malformed, incomplete, attachment and oversized checkpoints', async () => {
  const first = make(); await first.send('問題'); const valid = first.exportConversation()!;
  assert.throws(() => make('B').restoreConversation(valid));
  for (const bad of [null, { ...valid, version: 2 }, { ...valid, messages: [{role:'user',parts:[{text:'unfinished'}]}] },
    { ...valid, messages: [{role:'model',parts:[{call:{name:'x',args:{}}}]}] },
    { ...valid, messages: [{role:'user',parts:[{result:{name:'x',response:{status:'success'}}}]}] },
    { ...valid, messages: [{role:'user',parts:[{attachment:{name:'x',data:'YWJj',mimeType:'image/png'}}]}] },
    { ...valid, messages: [{role:'user',parts:[{text:'x'.repeat(1100000)}]}] }]) assert.throws(() => make().restoreConversation(bad));
});
it('requires balanced call/result history and never restores a pending approval', () => {
  const messages: Message[] = [{role:'user',parts:[{text:'query'}]}, {role:'model',parts:[{call:{name:'read',args:{}}}]},
    {role:'user',parts:[{result:{name:'read',response:{status:'success',data:'value'}}}]}, {role:'model',parts:[{text:'done'}]}];
  const agent = make(); agent.restoreConversation({version:1,scope:'test',scopeId:'A',messages});
  assert.equal(agent.getState().results.length, 1); assert.equal(agent.getState().pending, undefined);
  messages[2].parts = [{result:{name:'wrong',response:{status:'success'}}}];
  assert.throws(() => make().restoreConversation({version:1,scope:'test',scopeId:'A',messages}));
});
it('does not export attachments or in-flight work, and blocks replacing an active agent', async () => {
  const agent = make(); await agent.send('file', [{text:'untrusted file text'}]);
  assert.equal(agent.exportConversation(), null);
  let finish!: (response: {parts:{text:string}[]}) => void;
  const pending = createAgent({ provider: {generate:()=>new Promise(resolve=>{finish=resolve;})}, tools:[],getContext:()=>context });
  const sending = pending.send('wait'); assert.equal(pending.exportConversation(), null);
  assert.throws(()=>pending.restoreConversation({})); finish({parts:[{text:'done'}]}); await sending;
  pending.dispose(); assert.throws(()=>pending.restoreConversation({}));
});
