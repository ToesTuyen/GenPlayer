'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/ai_context.js'),{prepare,validateOutput,complete}=require('../server/ai.cjs'),{getConfig,createApp}=require('../server/index.cjs');
const password='test-ai-password-private',secret='sk-or-test-key-not-real';
const player=(i,guest=false)=>({n:'Cầu thủ '+i,pos:C.SLOTS[i%7],pos2:[],guest,...Object.fromEntries(C.KEYS.map(k=>[k,6]))});
const players=Array.from({length:16},(_,i)=>player(i,i>=14));
const teams={A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}};
const match=(i=1,score={a:3,b:1})=>({id:String(i),kickoff:Date.now()-i*86400000,score,teams:{A:players.slice(0,7).map(p=>({n:p.n,slot:p.pos,bench:false})),B:players.slice(7,14).map(p=>({n:p.n,slot:p.pos,bench:false}))},goals:{[players[0].n]:2},goalsLocked:true});
const context=()=>({players:structuredClone(players),history:Array.from({length:5},(_,i)=>match(i+1)),rosterNames:players.map(p=>p.n),match:match(6,null),playerName:players[0].n,instruction:'Cân công và thủ riêng.'});
const output=(task='lineup')=>({title:'Nhận định kiểm thử',sections:Array.from({length:task==='match-review'?6:3},(_,i)=>({heading:'Phần '+i,body:'Văn bản dựa trên dữ liệu bóng đá.'})),...(task==='lineup'?{teams}:{}),...(task==='player-form'?{verdict:'keep',suggestions:[]}:{})});
const provider=value=>async(url,init)=>new Response(JSON.stringify({model:'test/model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:30,completion_tokens:50}}),{status:200,headers:{'Content-Type':'application/json'}});
async function withServer(fn,options={}){
  const config={...getConfig({OPENROUTER_API_KEY:secret,AI_ACCESS_PASSWORD:password,APP_ORIGIN:'http://localhost:3000'}),...options};
  const app=createApp(config,{fetchImpl:options.fetchImpl||provider(output())});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;
  const request=(route,body,headers={})=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:config.origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const login=async()=>{const r=await request('/api/ai/login',{password});assert.equal(r.status,200);const b=await r.json();return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-GP-CSRF':b.csrf};};
  try{await fn({request,login,config});}finally{app.closeAllConnections();await new Promise(r=>app.close(r));}
}
test('config safe defaults; short password and ambiguous origins fail closed',()=>{
  assert.equal(getConfig({}).dataMode,'preview');assert.equal(getConfig({}).host,'127.0.0.1');
  assert.throws(()=>getConfig({AI_ACCESS_PASSWORD:'short'}));assert.throws(()=>getConfig({APP_ORIGIN:'https://app.example/'}));assert.throws(()=>getConfig({APP_DATA_MODE:'wrong'}));
});
test('only whitelisted football data reaches provider; no credentials or finance',()=>{
  const c=context();c.finance=[{secret:'private-finance'}];c.players[0]={...c.players[0],ratings:{secret:'private-rater'},apiKey:'private-key'};
  const p=prepare({task:'lineup',context:c,apiKey:'private-key'}),s=JSON.stringify(p.messages);
  assert.ok(!s.includes('private-'));assert.ok(!s.includes('ratings'));assert.ok(s.includes('previousMatches'));
  assert.equal(JSON.parse(p.messages[1].content).players[0].form.goalsRecorded,10);
});
test('form counts five team matches, absences, oldest-first results and real streak',()=>{
  const h=context().history;h[0].teams.A=h[0].teams.A.filter(p=>p.n!==players[0].n);
  const f=C.form(players[0].n,h);assert.equal(f.recent.played,4);assert.equal(f.recent.absent,1);assert.equal(f.goalsRecorded,8);assert.equal(f.winStreak,4);assert.equal(f.recent.resultsOldestFirst.at(-1),null);
  h[1].score={a:1,b:3};assert.equal(C.form(players[0].n,h).lossStreak,1);
});
test('target match never counted in its own pre-match form',()=>{
  const c=context();c.match=c.history[0];const p=prepare({task:'match-review',context:c});const d=JSON.parse(p.messages[1].content);assert.equal(d.players[0].form.played,4);
});
test('match context keeps explicit keeper and role ratings without editing profiles',()=>{
  const r={id:10,kickoff:1000,subset:structuredClone(players),result:C.lineup(players,teams).result};
  r.result.evA.gkFit=7.4;r.result.evB.gkRated=false;
  const m=C.compactLegacy(r);assert.equal(m.teams.A[0].rating,7.4);assert.equal(m.teams.B[0].rating,null);assert.equal(r.subset[0].TM,6);
});
test('lineup recomputes ratings locally, ignores model stats, covers each name once',()=>{
  const p=prepare({task:'lineup',context:context()}),out=validateOutput(JSON.stringify({...output(),result:{evA:{startFit:999}}}),p);
  assert.notEqual(out.result.evA.startFit,999);assert.equal(out.result.evA.startFit,42);assert.equal(out.subset.length,16);assert.equal(out.result.evA.pairedBenchComparison,true);
  assert.throws(()=>C.lineup(players,{A:{...teams.A,starters:[0,0,2,3,4,5,6]},B:teams.B}),/trùng/);
  assert.throws(()=>C.lineup(players,{A:{starters:[14,1,2,3,4,5,6],bench:[0]},B:teams.B}),/Khách phải dự bị/);
  assert.throws(()=>C.lineup(players,{A:{...teams.A,bench:[99]},B:teams.B}),/ngoài danh sách/);
});
test('invalid task/input rejected before a paid request',()=>{
  assert.throws(()=>prepare({task:'arbitrary-chat',context:context()}));const c=context();c.players[0].KT=100;assert.throws(()=>prepare({task:'lineup',context:c}));
  const c2=context();c2.rosterNames=['missing'];assert.throws(()=>prepare({task:'lineup',context:c2}));
});
test('insufficient recent attendance suppresses point changes; prose still needs review',()=>{
  const c=context();for(const m of c.history.slice(0,4))m.teams.A=m.teams.A.filter(p=>p.n!==players[0].n);
  const p=prepare({task:'player-form',context:c}),out=validateOutput(JSON.stringify({...output('player-form'),verdict:'increase',suggestions:[{attribute:'DD',direction:'increase',reason:'test'}]}),p);
  assert.equal(out.verdict,'insufficient');assert.deepEqual(out.suggestions,[]);
});
test('provider fixed endpoint, server key, strict schema and safe error messages',async()=>{
  const config=getConfig({OPENROUTER_API_KEY:secret,AI_ACCESS_PASSWORD:password});let sent;
  await complete(prepare({task:'lineup',context:context()}),config,async(url,init)=>{sent={url,init};return provider(output())(url,init);});
  assert.equal(sent.url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(sent.init.headers.Authorization,'Bearer '+secret);
  assert.equal(JSON.parse(sent.init.body).response_format.json_schema.strict,true);
  for(const code of [401,402,429,500])await assert.rejects(complete(prepare({task:'lineup',context:context()}),config,async()=>new Response(secret,{status:code})),e=>!e.message.includes(secret));
});
test('malformed/truncated/oversized provider output and timeout do not apply anything',async()=>{
  const p=prepare({task:'lineup',context:context()}),c=getConfig({});
  assert.throws(()=>validateOutput('not json',p));assert.throws(()=>validateOutput('{"title":"bad"}',p));
  await assert.rejects(complete(p,c,async()=>new Response(JSON.stringify({choices:[{finish_reason:'length'}]}))),/chưa hoàn tất/);
  await assert.rejects(complete(p,c,async()=>new Response('x'.repeat(600000))),/vượt giới hạn/);
  await assert.rejects(complete(p,{...c,timeoutMs:10},async(_,init)=>new Promise((r,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))))),/quá thời gian/);
});
test('API fails closed without key/password; no unauthenticated paid calls',async()=>{
  await withServer(async({request})=>{assert.equal((await request('/api/ai/run',{task:'lineup',context:context()})).status,401);const status=await(await request('/api/ai/status')).json();assert.equal(status.configured,false);assert.ok(!JSON.stringify(status).includes(secret));assert.equal((await request('/api/ai/login',{password})).status,503);},{apiKey:''});
});
test('cookie session, CSRF/origin guards, successful AI roundtrip and logout',async()=>{
  await withServer(async({request,login})=>{
    const headers=await login();assert.ok(headers.Cookie.startsWith('gp_ai_session='));
    assert.equal((await request('/api/ai/run',{task:'lineup',context:context()},{...headers,Origin:'https://evil.example'})).status,403);
    assert.equal((await request('/api/ai/run',{task:'lineup',context:context()},{Cookie:headers.Cookie})).status,403);
    const r=await request('/api/ai/run',{task:'lineup',context:context()},headers);assert.equal(r.status,200);const b=await r.json();assert.equal(b.output.subset.length,16);assert.ok(!JSON.stringify(b).includes(secret));
    assert.equal((await request('/api/ai/logout',{},headers)).status,200);assert.equal((await request('/api/ai/run',{},headers)).status,401);
  });
});
test('login brute force, request budgets, malformed JSON and size limits',async()=>{
  await withServer(async({request,login})=>{const h=await login();assert.equal((await request('/api/ai/run','{bad',h)).status,400);assert.equal((await request('/api/ai/run',{large:'x'.repeat(270000)},h)).status,413);assert.equal((await request('/api/ai/run',{task:'lineup',context:context()},h)).status,200);assert.equal((await request('/api/ai/run',{task:'lineup',context:context()},h)).status,429);},{hourLimit:1});
  await withServer(async({request})=>{for(let i=0;i<5;i++)assert.equal((await request('/api/ai/login',{password:'bad'})).status,401);assert.equal((await request('/api/ai/login',{password})).status,429);});
});
test('static allowlist never serves .env, backups, source, Git or symlink secrets',async()=>{
  await withServer(async({request})=>{for(const route of ['/.env','/.git/config','/backups/data.json','/server/index.cjs','/firebase_config.json','/src/web_template.html','/assets/%2e%2e/.env'])assert.equal((await request(route)).status,404);const r=await request('/');assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('window.GP_APP_CONFIG={"backend":true,"dataMode":"preview"}'));assert.ok(!html.includes(secret));assert.ok(!html.includes(password));assert.equal(r.headers.get('cache-control'),'no-store');});
});
test('built JavaScript parses; preview blocks every existing direct cloud write',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
  const blocks=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);for(const script of blocks)new vm.Script(script);
  const src=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8');
  assert.ok(src.includes('if(aiIsPreview())return true;'));assert.ok(src.includes('else if(!aiIsPreview())STATE.docRef.set'));
  assert.ok(src.includes('if(!aiIsPreview()&&STATE.cloud&&STATE.docRef'));
  assert.ok(!html.includes('/*__AI_'));
  const rootIndex=path.join(__dirname,'../index.html'),rootScore=path.join(__dirname,'../score-update.html'),before=[fs.readFileSync(rootIndex,'utf8'),fs.readFileSync(rootScore,'utf8')];
  require('node:child_process').execFileSync('python3',['build_web.py','--offline','--output-dir','dist'],{cwd:path.join(__dirname,'..')});
  assert.deepEqual([fs.readFileSync(rootIndex,'utf8'),fs.readFileSync(rootScore,'utf8')],before,'Offline web-app build must not modify deployed outputs');
});
test('finance is hidden in every local HTML entry, not just the backend build',()=>{
  for(const file of ['index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.match(html,/<button[^>]*id="financeNavBtn"[^>]*\bhidden\b/,file+' finance navigation');
    assert.match(html,/<div[^>]*id="screen-finance"[^>]*\bhidden\b/,file+' finance screen');
    assert.ok(html.includes('.screen[hidden],.ap-btn[hidden]{display:none!important}'),file+' explicit hidden styles');
  }
});
test('home has no unsolicited introduction block in any local entry',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.ok(!html.includes('club-intro'),file+' has no extra intro');
    assert.ok(!html.includes('Đội bóng của chúng ta'),file+' has no extra headline');
    assert.ok(!html.includes('gọn trong một chỗ'),file+' has no extra slogan');
    assert.ok(html.includes('class="ab-logo"'),file+' keeps existing header logo');
  }
});
test('AI controls live inside Create instead of a separate navigation screen',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const create=html.indexOf('<div id="screen-create"'),inline=html.indexOf('<section id="createAI"'),nextScreen=html.indexOf('<div id="screen-players"');
    assert.ok(create<inline&&inline<nextScreen,file+' embeds AI in Create');
    assert.ok(!html.includes('id="screen-ai"'),file+' no separate AI screen');
    assert.ok(html.includes('id="aiCreateToggle"'),file+' has inline entry');
    const menu=html.slice(html.indexOf('<div class="ap-grid">'),html.indexOf('<div class="dash-main">'));
    assert.ok(!menu.includes('Trợ lý AI'),file+' no extra AI menu item');
  }
});
test('Create has one action, a top select-all checkbox and an embedded worker in every entry',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const start=html.indexOf('<div id="screen-create"'),end=html.indexOf('<div id="screen-players"'),create=html.slice(start,end);
    assert.ok(create.indexOf('id="go"')<create.indexOf('id="roster"'),file+' toolbar precedes players');
    assert.ok(create.indexOf('id="saveWeek"')<create.indexOf('id="roster"'),file+' save action at top');
    assert.match(create,/<input type="checkbox" id="selectAll"/);
    assert.ok(!/id="(?:all|none)"/.test(create));
    assert.ok(!create.includes('Tạo đội bằng AI'));assert.ok(!create.includes('Tạo đội (Thuật Toán)'));
    assert.ok(create.includes('id="createProcess"'));assert.ok(create.includes('id="createProcessSteps"'));
    assert.ok(html.includes('id="solverWorkerSource" type="text/plain"'));
  }
});
test('offline strict solver respects guest benches and distribution',()=>{
  const candidates=require('../src/optimizer.js').solve(players,null,{strictGuests:true});
  assert.ok(candidates.length>0);
  for(const r of candidates)assert.doesNotThrow(()=>C.lineup(players,{A:{starters:r.evA.starters,bench:r.evA.bench},B:{starters:r.evB.starters,bench:r.evB.bench}}));
});
test('criteria and lineup Note are visible outside the optional AI panel in every entry',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const start=html.indexOf('<div id="screen-create"'),inline=html.indexOf('<section id="createAI"'),setup=html.slice(start,inline);
    assert.ok(setup.includes('id="createCriteria"'));assert.ok(setup.includes('id="aiInstruction"'));
    assert.equal((html.match(/id="aiInstruction"/g)||[]).length,1);
    const rules=setup.slice(setup.indexOf('<ol class="create-rule-list">'),setup.indexOf('</ol>'));
    assert.equal((rules.match(/<li>/g)||[]).length,12);
    assert.ok(html.includes('id="aiAnalysisInstruction"'));assert.ok(html.includes('id="createNoteStatus"'));
  }
});
test('current Note is the only source of per-match lineup instructions',()=>{
  const c=context();c.instruction='Tuyên bắt gôn theo Note hiện tại.';c.history[0].instruction='OLD_MATCH_INSTRUCTION_CANARY';
  const prepared=prepare({task:'lineup',context:c}),payload=JSON.parse(prepared.messages[1].content);
  assert.equal(payload.instruction,c.instruction);
  assert.ok(payload.rules.some(r=>r.includes('nguồn duy nhất')&&r.includes('không tự kế thừa')));
  assert.ok(!JSON.stringify(payload).includes('OLD_MATCH_INSTRUCTION_CANARY'));
  c.instruction='';const empty=JSON.parse(prepare({task:'lineup',context:c}).messages[1].content);
  assert.equal(empty.instruction,'');
});
test('progress holds fast steps for reading, but never adds a full delay after slow work',async()=>{
  let now=1750;const delays=[],events=[],controls=new Map();
  const sandbox={performance:{now:()=>now},setTimeout:(fn,ms)=>{delays.push(ms);now+=ms;fn();},events,$:id=>{
    if(!controls.has(id))controls.set(id,{addEventListener(){}});return controls.get(id);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/create_flow.js'),'utf8')+'\ncreateStep=(...args)=>events.push(args);globalThis.qa={state:CREATE_STATE,complete:createCompleteStep,minimum:CREATE_STEP_READ_MS};',sandbox);
  const {state,complete,minimum}=sandbox.qa;assert.equal(minimum,1000);
  state.startedAt.set('roster',1000);const first=complete('roster','done','Checked');
  assert.equal(events.length,0,'Completion cannot be shown before its reading interval');
  await first;assert.deepEqual(delays,[250]);assert.equal(events[0][1],'done');
  now=5000;state.startedAt.set('engine',3000);await complete('engine','warn','Unavailable');
  assert.deepEqual(delays,[250],'Two seconds of real work already exceed the minimum; no extra wait');
  assert.equal(events[1][1],'warn','Pacing must preserve warning semantics');
});
