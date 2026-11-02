import { it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAgent } from '../core/controller.ts';
import type { AgentContext, Provider, Tool } from '../contracts.ts';

const context: AgentContext = { scope: 'example', scopeId: 'A', permissions: ['write'], locale: 'zh-TW' };
function fixture(responses: unknown[] = []) {
  let current = context, writes = 0;
  const requests: unknown[] = [];
  const provider: Provider = { async generate(request) {
    requests.push(request);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return (next || { parts: [{ text: 'done' }] }) as Awaited<ReturnType<Provider['generate']>>;
  } };
  const tool: Tool = {
    name: 'change', description: 'change', risk: 'write',
    schema: z.strictObject({ value: z.string() }),
    enabled: c => c.permissions.includes('write'),
    async prepare(input) {
      const value = (input as { value: string }).value;
      return { preview: { summary: 'Change', changes: [{ operation: 'update', before: 'old', after: value }] },
        async commit() { writes++; return { status: 'success', data: value }; } };
    },
  };
  const agent = createAgent({ provider, tools: [tool], getContext: () => current });
  return { agent, requests, tool, setContext: (c: AgentContext) => { current = c; }, get writes() { return writes; } };
}
const call = (name = 'change', args: unknown = { value: 'new' }) => ({ parts: [{ call: { name, args } }] });
it('previews writes, locks arguments and commits only once after matching approval', async () => {
  const f = fixture([call()]);
  await f.agent.send('change');
  assert.equal(f.writes, 0);
  const state = f.agent.getState();
  assert.equal(state.status, 'awaiting_confirmation');
  const pending = state.pending!;
  pending.changes[0].after = 'tampered';
  await assert.rejects(f.agent.approve('wrong'));
  await f.agent.approve(pending.id);
  assert.equal(f.writes, 1);
  assert.equal(f.agent.getState().results[0].data, 'new');
  await assert.rejects(f.agent.approve(pending.id));
});
it('rejects without writing and gives the provider a cancelled result', async () => {
  const f = fixture([call()]);
  await f.agent.send('change');
  await f.agent.reject(f.agent.getState().pending!.id);
  assert.equal(f.writes, 0);
  assert.equal(f.agent.getState().results[0].status, 'cancelled');
});
it('rechecks scope and permissions at approval', async () => {
  for (const next of [{ ...context, scopeId: 'B' }, { ...context, permissions: [] }]) {
    const f = fixture([call()]);
    await f.agent.send('change');
    f.setContext(next);
    await f.agent.approve(f.agent.getState().pending!.id);
    assert.equal(f.writes, 0);
    assert.equal(f.agent.getState().status, 'error');
  }
});
it('rejects unknown tools and unexpected parameters without writes', async () => {
  for (const response of [call('unknown'), call('change', { value: 'new', scopeId: 'B' })]) {
    const f = fixture([response]);
    await f.agent.send('change');
    assert.equal(f.writes, 0);
    assert.equal(f.agent.getState().results[0].status, 'validation_error');
  }
});
it('cancels pending work, isolates disposed sessions and prevents concurrent sends', async () => {
  const f = fixture([call()]);
  await f.agent.send('change');
  await assert.rejects(f.agent.send('another'));
  f.agent.cancel();
  assert.equal(f.agent.getState().pending, undefined);
  assert.equal(f.writes, 0);
  f.agent.dispose();
  await assert.rejects(f.agent.send('again'));
});
it('bounds a model tool loop and preserves read results', async () => {
  const f = fixture();
  let calls = 0;
  const read: Tool = { name: 'read', description: 'read', risk: 'read', schema: z.strictObject({}), enabled: () => true,
    async execute() { calls++; return { status: 'success', data: 'value' }; } };
  const provider: Provider = { async generate() { return call('read', {}); } };
  const agent = createAgent({ provider, tools: [read], getContext: () => context, maxTurns: 2 });
  await agent.send('read');
  assert.equal(calls, 2);
  assert.equal(agent.getState().status, 'error');
  f.agent.dispose();
});
it('reports model errors and blocks multiple simultaneous write calls', async () => {
  const f = fixture([new Error('private SDK detail')]);
  await f.agent.send('test');
  assert.equal(f.agent.getState().status, 'error');
  assert.ok(!f.agent.getState().error?.includes('private SDK detail'));
  const g = fixture([{ parts: [...call().parts, ...call().parts] }]);
  await g.agent.send('change');
  assert.equal(g.writes, 0);
  assert.equal(g.agent.getState().status, 'error');
});

it('validates registry entries, subscriptions, limits, input and attachments', async () => {
  const f=fixture();
  assert.throws(()=>createAgent({provider:{async generate(){return {parts:[]};}},tools:[f.tool,f.tool],getContext:()=>context}));
  assert.throws(()=>createAgent({provider:{async generate(){return {parts:[]};}},tools:[],getContext:()=>context,maxTurns:0}));
  assert.throws(()=>createAgent({provider:{async generate(){return {parts:[]};}},tools:[{...f.tool,prepare:undefined}],getContext:()=>context}));
  let updates=0;const unsubscribe=f.agent.subscribe(()=>updates++);
  f.agent.subscribe(()=>{throw new Error('observer error');});
  await assert.rejects(f.agent.send(''));
  await assert.rejects(f.agent.send('a'.repeat(20001)));
  await assert.rejects(f.agent.send('x',[{attachment:{name:'x',mimeType:'text/html',data:'abc'}}]));
  await f.agent.send('hello',[{text:'file content'},{attachment:{name:'x',mimeType:'image/png',data:'YWJj'}}]);
  assert.ok(updates>0);unsubscribe();
  f.agent.cancel();
});
it('does not accept a late provider response after cancel or dispose',async()=>{
  let resolve!: (value: {parts:{text:string}[]})=>void;
  const agent=createAgent({provider:{generate:()=>new Promise(done=>{resolve=done;})},tools:[],getContext:()=>context});
  const sending=agent.send('hello');agent.cancel();resolve({parts:[{text:'late'}]});await sending;
  assert.equal(agent.getState().messages.length,0);
  const another=agent.send('hello');agent.dispose();resolve({parts:[{text:'late'}]});await another;
  assert.equal(agent.getState().status,'disposed');agent.cancel();
});
it('prevents cancellation and duplicate approval while a commit is in flight',async()=>{
  let finish!: ()=>void;
  const base=fixture();
  const tool={...base.tool,async prepare(){return {preview:{summary:'change',changes:[]},commit:()=>new Promise<import('../contracts.ts').ToolResult>(done=>{finish=()=>done({status:'success'});})};}};
  const agent=createAgent({provider:{async generate(request){return request.messages.length===1?call():{parts:[{text:'done'}]};}},tools:[tool],getContext:()=>context});
  await agent.send('change');const id=agent.getState().pending!.id;
  const approval=agent.approve(id);assert.throws(()=>agent.cancel());await assert.rejects(agent.approve(id));finish();await approval;
  assert.equal(agent.getState().status,'idle');
});
it('enforces call limits, disabled tools and handles throwing readers/preparers',async()=>{
  for (const variant of ['disabled','throw','limit']) {
    const f=fixture();
    const tool={...f.tool,enabled:()=>variant!=='disabled',async prepare(){throw new Error('private');}};
    const agent=createAgent({provider:{async generate(){return call();}},tools:[tool],getContext:()=>context,maxToolCalls:1});
    await agent.send('change');assert.equal(agent.getState().status,'error');
    assert.equal(agent.getState().results[0].status,variant==='disabled'?'permission_denied':'error');
  }
});
