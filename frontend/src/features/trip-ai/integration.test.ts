import { it } from 'node:test';
import assert from 'node:assert/strict';
import demo from '../../data/demo.json' with { type: 'json' };
import type { Workbook } from '../../data/portal.ts';
import { parseCatalog, parseTrip } from '../../data/portal.ts';
import { readGuideConfig, WRITE_SCOPE } from '../../data/guide-auth.ts';
import type { GuideSession } from '../../data/guide-auth.ts';
import { readRows } from '../../data/trip-editor.ts';
import { createTripAgent } from './index.ts';
import { createTripTools } from './tools.ts';
import type { Message, ProviderRequest } from '../../ai/contracts.ts';

const trip = parseCatalog(demo['旅程清單'])[0];
const config = readGuideConfig({ VITE_GOOGLE_CLIENT_ID:'client', VITE_GUIDE_EMAILS:'["guide@example.com"]' });
function setup(source: 'trip' | 'demo' = 'trip') {
  let book: Workbook = structuredClone(demo), writes = 0, denied = 0, failAfter = false;
  let session: GuideSession | null = {email:'guide@example.com',token:'secret-token',expiresAt:Date.now()+60000,scopes:[WRITE_SCOPE]};
  let readHook: (()=>void) | undefined;
  const replies: Omit<Message,'role'>[] = [];
  const requests: ProviderRequest[] = [];
  const grids = Object.keys(book).filter(name => name !== '旅程清單').map((title,index)=>({sheetId:index+1,title,gridProperties:{rowCount:1000,columnCount:30}}));
  const fetcher: typeof fetch = async (input,init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer secret-token');
    const url = new URL(String(input));
    if (denied) return Response.json({}, {status:denied});
    if (url.pathname.endsWith(':batchUpdate')) {
      writes++;
      for (const request of JSON.parse(String(init?.body)).requests) {
        if (!request.updateCells) continue;
        const {start,rows}=request.updateCells;
        const sheet=grids.find(grid=>grid.sheetId===start.sheetId)!.title;
        while (book[sheet].length<=start.rowIndex) book[sheet].push([]);
        while (book[sheet][start.rowIndex].length<=start.columnIndex) book[sheet][start.rowIndex].push('');
        book[sheet][start.rowIndex][start.columnIndex]=rows[0].values[0].userEnteredValue.stringValue;
      }
      if (failAfter) throw new Error('ambiguous write');
      return Response.json({});
    }
    if (url.pathname.endsWith('values:batchGet')) { const hook=readHook;readHook=undefined;hook?.(); }
    if (url.pathname.endsWith('values:batchGet')) return Response.json({valueRanges:url.searchParams.getAll('ranges').map(range=>({values:book[range.split('!')[0].replaceAll("'",'')]}))});
    return Response.json({sheets:grids.map(properties=>({properties}))});
  };
  const result = createTripAgent({trip,source,config,getSession:()=>session,readData:async()=>parseTrip(trip,book),fetcher,
    provider:{async generate(request){requests.push(request);return replies.shift()||{parts:[{text:'依工具結果處理。'}]};}}});
  return {...result,replies,requests,get writes(){return writes;},get book(){return book;},setSession(value: GuideSession|null){session=value;},
    onNextRead(hook:()=>void){readHook=hook;},
    change(){book['每日行程'][1][1]='2026-01-01';},deny(value:number){denied=value;},ambiguous(){failAfter=true;}};
}
function call(name:string,args:unknown): Omit<Message,'role'> {return {parts:[{call:{name,args}}]};}
const signal = () => new AbortController().signal;

it('reads and searches real current itinerary without exposing account tokens or unrelated tables',async()=>{
  const f=setup();
  for (const name of ['itinerary_get_summary','itinerary_get_activities','itinerary_search','itinerary_missing_maps']) {
    f.replies.push(call(name,name==='itinerary_search'?{query:'午餐'}:{}));
    await f.agent.send('讀行程');
    assert.equal(f.agent.getState().results.at(-1)?.status,'success');
  }
  assert.equal(f.writes,0);
  const sent=JSON.stringify(f.requests);
  assert.ok(!sent.includes('secret-token')&&!sent.includes('guide@example.com')&&!sent.includes('公積金交易'));
  await assert.rejects(f.host.read({...f.host.getContext(),scopeId:'T999'},signal()));
});
it('previews and commits add/update/delete with real mutation validation and one write each',async()=>{
  const f=setup();
  f.replies.push(call('itinerary_add',{date:trip.start,title:'AI 新景點',time:'09:30',body:'  空白\n\n保留'}));
  await f.agent.send('新增');
  assert.equal(f.writes,0);
  await f.agent.approve(f.agent.getState().pending!.id);
  let row=readRows(f.book,'每日行程').find(row=>row['標題']==='AI 新景點')!;
  assert.equal(row['內文'],'  空白\n\n保留');
  f.replies.push(call('itinerary_update',{id:row['行程ID'],patch:{title:'AI 已修改'}}));
  await f.agent.send('修改'); await f.agent.approve(f.agent.getState().pending!.id);
  row=readRows(f.book,'每日行程').find(item=>item['行程ID']===row['行程ID'])!;
  assert.equal(row['標題'],'AI 已修改');
  f.replies.push(call('itinerary_delete',{id:row['行程ID']}));
  await f.agent.send('刪除'); await f.agent.approve(f.agent.getState().pending!.id);
  assert.equal(f.writes,3);
  assert.ok(!readRows(f.book,'每日行程').some(item=>item['行程ID']===row['行程ID']));
});
it('rejects stale snapshots and ambiguous results and blocks subsequent writes until explicit reload',async()=>{
  for (const failure of ['conflict','ambiguous','denied']) {
    const f=setup();
    f.replies.push(call('itinerary_add',{date:trip.start,title:'新景點'})); await f.agent.send('新增');
    if(failure==='conflict')f.change(); else if(failure==='ambiguous')f.ambiguous(); else f.deny(403);
    await f.agent.approve(f.agent.getState().pending!.id);
    assert.equal(f.agent.getState().status,'error');
    assert.ok(!f.host.getContext().permissions.includes('write'));
    assert.equal(f.writes,failure==='ambiguous'?1:0);
    if(failure==='denied'){f.deny(0);await f.host.reload();assert.ok(f.host.getContext().permissions.includes('write'));}
  }
});
it('visitors cannot prepare writes and logout before confirmation prevents requests',async()=>{
  const f=setup();
  f.replies.push(call('itinerary_add',{date:trip.start,title:'新景點'}));await f.agent.send('新增');
  f.setSession(null);await f.agent.approve(f.agent.getState().pending!.id);assert.equal(f.writes,0);
  const visitor=setup();visitor.setSession(null);
  assert.ok(createTripTools(visitor.host).filter(tool=>tool.enabled(visitor.host.getContext())).every(tool=>tool.risk==='read'));
});
it('imports multiple rows in one batch, warns about duplicates and rejects unknown or out-of-range dates',async()=>{
  const f=setup();
  const row=readRows(f.book,'每日行程')[0];
  f.replies.push(call('itinerary_import',{activities:[{date:row['日期'],time:row['開始時間'],title:row['標題']},{date:trip.start,title:'新增匯入'}],warnings:['第三筆日期不明，未匯入。']}));
  await f.agent.send('匯入');
  assert.equal(f.agent.getState().pending!.warnings!.length,2);
  await f.agent.approve(f.agent.getState().pending!.id);assert.equal(f.writes,1);
  for(const input of [{title:'日期不明'},{date:'2000-01-01',title:'超出旅程'}]){
    f.replies.push(call('itinerary_import',{activities:[input],warnings:[]}));await f.agent.send('匯入');assert.equal(f.agent.getState().pending,undefined);
  }
  assert.equal(f.writes,1);
});
it('moves a timed item with conflict preview and preserves other activity times',async()=>{
  const f=setup();
  f.replies.push(call('itinerary_add',{date:trip.start,time:'23:00',title:'移動用景點'}));await f.agent.send('新增');await f.agent.approve(f.agent.getState().pending!.id);
  const row=readRows(f.book,'每日行程').find(row=>row['標題']==='移動用景點')!;
  const before=readRows(f.book,'每日行程').filter(item=>item['行程ID']!==row['行程ID']).map(item=>[item['行程ID'],item['開始時間']]);
  f.replies.push(call('itinerary_move',{id:row['行程ID'],date:trip.start,index:0}));await f.agent.send('移到前面');
  assert.ok(f.agent.getState().pending!.warnings!.some(text=>text.includes('時間順序衝突')));
  await f.agent.approve(f.agent.getState().pending!.id);
  assert.equal(readRows(f.book,'每日行程').find(item=>item['行程ID']===row['行程ID'])!['開始時間'],'');
  assert.deepEqual(readRows(f.book,'每日行程').filter(item=>item['行程ID']!==row['行程ID']).map(item=>[item['行程ID'],item['開始時間']]),before);
});
it('adds only map search URLs and preserves an existing link',async()=>{
  const f=setup();
  f.replies.push(call('itinerary_add',{date:trip.start,title:'由布院車站'}));await f.agent.send('新增');await f.agent.approve(f.agent.getState().pending!.id);
  const row=readRows(f.book,'每日行程').find(row=>row['標題']==='由布院車站')!;
  f.replies.push(call('itinerary_apply_maps',{ids:[row['行程ID']]}));await f.agent.send('補地圖');
  assert.ok(f.agent.getState().pending!.warnings![0].includes('尚未核實'));
  await f.agent.approve(f.agent.getState().pending!.id);assert.equal(f.writes,2);
  assert.ok(readRows(f.book,'每日行程').find(item=>item['行程ID']===row['行程ID'])!['說明'].includes('https://www.google.com/maps/search/'));
  f.replies.push(call('itinerary_apply_maps',{ids:[row['行程ID']]}));await f.agent.send('再補一次');assert.equal(f.agent.getState().pending,undefined);assert.equal(f.writes,2);
});

it('keeps demo read-only and denies access after demo logout',async()=>{
  const f=setup('demo');
  assert.deepEqual(f.host.getContext().permissions,['read']);
  await assert.rejects(f.host.prepare(f.host.getContext(),signal(),()=>({summary:'no',mutations:[]})),/範例/);
  f.setSession(null);assert.deepEqual(f.host.getContext().permissions,[]);
  await assert.rejects(f.host.read(f.host.getContext(),signal()));
});
it('configuration remains opt-in and rejects secrets or incomplete public config',async()=>{
  const {readFirebaseConfig}=await import('./config.ts');
  const {createConfiguredTripAgent}=await import('./index.ts');
  assert.equal(readFirebaseConfig({}),null);
  const f=setup();
  const options={trip,source:'trip' as const,config,getSession:()=>null,readData:async()=>parseTrip(trip,f.book)};
  assert.equal(await createConfiguredTripAgent(options,{}),null);
  assert.throws(()=>readFirebaseConfig({VITE_AI_ENABLED:'true'}));
  assert.throws(()=>readFirebaseConfig({VITE_AI_ENABLED:'true',VITE_AI_FIREBASE_CONFIG:JSON.stringify({apiKey:'public',projectId:'p',appId:'app',secret:'no'}),VITE_AI_MODEL:'configured',VITE_AI_APP_CHECK_SITE_KEY:'public-site'}));
  assert.equal(readFirebaseConfig({VITE_AI_ENABLED:'true',VITE_AI_FIREBASE_CONFIG:JSON.stringify({apiKey:'public',projectId:'p',appId:'app'}),VITE_AI_MODEL:'configured',VITE_AI_APP_CHECK_SITE_KEY:'public-site'})!.model,'configured');
});

it('disposal during revalidation prevents an undispatched write',async()=>{
  const f=setup();
  f.replies.push(call('itinerary_add',{date:trip.start,title:'不應送出'}));await f.agent.send('新增');
  const id=f.agent.getState().pending!.id;
  f.onNextRead(()=>f.agent.dispose());
  await f.agent.approve(id);
  assert.equal(f.writes,0);assert.equal(f.agent.getState().status,'disposed');
});
it('rechecks actual session immediately before the write request',async()=>{
  const f=setup();
  f.replies.push(call('itinerary_add',{date:trip.start,title:'不應送出'}));await f.agent.send('新增');
  f.onNextRead(()=>f.setSession(null));
  await f.agent.approve(f.agent.getState().pending!.id);
  assert.equal(f.writes,0);assert.equal(f.agent.getState().status,'error');
});
