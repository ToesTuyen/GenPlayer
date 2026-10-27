'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/ai_context.js'),S=require('../src/ai_service.js'),{DEFAULTS,prepare,validateOutput,complete}=S,{getConfig,createApp}=require('../scripts/serve_web.cjs');
const {assignmentsFor,teamsForPlayers,candidatesFor}=require('./lineup_fixture.cjs');
const password='test-ai-password-private',secret='sk-or-test-key-not-real';
const player=(i,guest=false)=>({n:'Cầu thủ '+i,pos:C.SLOTS[i%7],pos2:[],guest,...Object.fromEntries(C.KEYS.map(k=>[k,6]))});
const players=Array.from({length:16},(_,i)=>player(i,i>=14));
const teams={A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}};
const match=(i=1,score={a:3,b:1})=>({id:String(i),kickoff:Date.now()-i*86400000,score,teams:{A:[0,1,9,10,4,12,6].map(j=>({n:players[j].n,slot:players[j].pos,bench:false})),B:[7,8,2,3,11,5,13].map(j=>({n:players[j].n,slot:players[j].pos,bench:false}))},goals:{[players[0].n]:2},goalsLocked:true});
const context=()=>({players:structuredClone(players),history:Array.from({length:5},(_,i)=>match(i+1)),rosterNames:players.map(p=>p.n),lineupCandidates:candidatesFor(teams),match:match(6,null),playerName:players[0].n,instruction:'Cân công và thủ riêng.'});
const output=(task='lineup')=>({title:'Nhận định kiểm thử',sections:Array.from({length:task==='match-review'?6:3},(_,i)=>({heading:'Phần '+i,body:'Văn bản dựa trên dữ liệu bóng đá.'})),...(task==='lineup'?{candidateId:'c0',flipTeams:false,swaps:[]}:{}),...(task==='player-form'?{verdict:'keep',suggestions:[]}:{})});
const provider=value=>async(url,init)=>new Response(JSON.stringify({model:'test/model',choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:30,completion_tokens:50}}),{status:200,headers:{'Content-Type':'application/json'}});
test('light is the HTML and runtime default, including blocked storage; an explicit saved dark choice remains available',()=>{
  const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/web_template.html'),'utf8');
  const bootstrap=source.match(/<script>(try\{document\.documentElement\.dataset\.theme=[\s\S]*?)<\/script>/)[1];
  const current=source.match(/function currentTheme\(\)\{[^}]*\}/)[0];
  for(const saved of [null,'light','invalid','dark','blocked']){
    const sandbox={document:{documentElement:{dataset:{}}},localStorage:{getItem:()=>{if(saved==='blocked')throw Error('blocked');return saved;}}};
    vm.runInNewContext(bootstrap,sandbox);
    assert.equal(sandbox.document.documentElement.dataset.theme,saved==='dark'?'dark':'light');
    assert.equal(vm.runInNewContext(current+';currentTheme()',sandbox),saved==='dark'?'dark':'light');
  }
  assert.equal(vm.runInNewContext(current+';currentTheme()',{document:{documentElement:{dataset:{}}}}),'light');
  for(const entry of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(root,entry),'utf8');
    assert.ok(html.startsWith('<!doctype html><html lang="vi" data-theme="light">'));
    assert.match(html,/id="themeBtn"[^>]+aria-label="Chuyển sang giao diện tối">☾<\/button>/);
  }
});
test('public release preserves legacy storage and Firebase, and only replaces GenPlayer service-worker caches',async()=>{
  const root=path.join(__dirname,'..'),entries=['index.html','score-update.html','dist/index.html','dist/score-update.html'];
  const config=JSON.parse(fs.readFileSync(path.join(root,'firebase_config.json'),'utf8'));
  for(const entry of entries){
    const html=fs.readFileSync(path.join(root,entry),'utf8');
    assert.match(html,/<meta name="genplayer-release" content="web-app-2026-10-27-history-header">/);
    assert.ok(html.includes('window.GP_APP_CONFIG=null;'),'Static public entry must not be baked as a local preview');
    assert.ok(html.includes('sw.js?v=genplayer-v15'));
    assert.ok(html.includes("kind:'generationLog'"));
    assert.ok(html.includes("CREATE_CLOUD_PREFIX='generation_'"));
    assert.deepEqual(JSON.parse(html.match(/const FIREBASE_CONFIG = ([\s\S]*?);\s*\n/)[1]),config);
    assert.match(html,/history:"gp_history"/);assert.match(html,/players:"gp_players"/);
  }
  const events={},deleted=[],pending=[];
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{
    self:{addEventListener:(name,fn)=>events[name]=fn,clients:{claim:async()=>{}}},
    caches:{keys:async()=>['genplayer-v3','genplayer-v4','genplayer-v5','genplayer-v6','genplayer-v7','genplayer-v8','genplayer-v9','genplayer-v10','genplayer-v11','genplayer-v12','genplayer-v13','genplayer-v14','genplayer-v15','another-app-data'],delete:async key=>deleted.push(key)}
  });
  events.activate({waitUntil:p=>pending.push(p)});await Promise.all(pending);
  assert.deepEqual(deleted,['genplayer-v3','genplayer-v4','genplayer-v5','genplayer-v6','genplayer-v7','genplayer-v8','genplayer-v9','genplayer-v10','genplayer-v11','genplayer-v12','genplayer-v13','genplayer-v14'],'Unrelated apps and the active release cache are untouched');
});
async function withServer(fn,options={}){
  const config={...getConfig({OPENROUTER_API_KEY:secret,AI_ACCESS_PASSWORD:password,APP_ORIGIN:'http://localhost:3000'}),...options};
  const app=createApp(config,options);await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;
  const request=(route,body,headers={})=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:config.origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const headers={Authorization:'Bearer '+secret};
  try{await fn({request,headers,config});}finally{app.closeAllConnections();await new Promise(r=>app.close(r));}
}
test('config safe defaults; obsolete shared credentials are ignored, ambiguous origins fail closed',()=>{
  assert.equal(getConfig({}).dataMode,'preview');assert.equal(getConfig({}).host,'127.0.0.1');
  const config=getConfig({OPENROUTER_API_KEY:secret,AI_ACCESS_PASSWORD:'short'});
  assert.ok(!('apiKey' in config));assert.ok(!('password' in config));assert.ok(!JSON.stringify(config).includes(secret));
  assert.throws(()=>getConfig({APP_ORIGIN:'https://app.example/'}));assert.throws(()=>getConfig({APP_DATA_MODE:'wrong'}));
});
function deviceSandbox(initial={},options={}){
  const store=new Map(Object.entries(initial)),elements=new Map(),events={};
  const sandbox={location:{protocol:'https:',hostname:'genplayer.example'},window:{addEventListener:(name,fn)=>events[name]=fn},AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:k=>{if(options.blocked)throw new Error('blocked');return store.get(k)??null;},setItem:(k,v)=>{if(options.blocked)throw new Error('blocked');store.set(k,v);},removeItem:k=>{if(options.blocked)throw new Error('blocked');store.delete(k);}},
    $:id=>{if(!elements.has(id))elements.set(id,{value:'',checked:true,style:{},open:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();}});return elements.get(id);},fetch:options.fetch||(()=>{throw new Error('Unexpected request');})};
  sandbox.GPAIService={...S,complete:(prepared,config)=>S.complete(prepared,config,sandbox.fetch)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/ai_client.js'),'utf8')+'\nglobalThis.qa={keys:AI_KEYS,state:AI_STATE,fetch:aiFetch,init:aiInit,save:aiSaveKey,forget:aiForgetKey,enter:aiEnterCreate,open:aiOpenKeyDialog,skip:aiSkipKeyDialog};',sandbox);
  return {...sandbox.qa,sandbox,store,elements,events};
}
test('device key is isolated from app state; remember, ephemeral, reload, replace and clear are honest',()=>{
  const first=deviceSandbox(),name=first.keys.storageName,secondKey='sk-or-other-device-key-for-tests';
  assert.equal(first.keys.has(),false);assert.throws(()=>first.keys.save('wrong',true),/định dạng/);
  first.keys.save(' '+secret+' ',true);assert.equal(first.store.get(name),secret);assert.equal(first.keys.remembered(),true);
  assert.equal(deviceSandbox(Object.fromEntries(first.store)).keys.get(),secret,'Reload restores this browser origin only');
  assert.equal(deviceSandbox().keys.has(),false,'A different browser/device starts without a key');
  assert.ok(!JSON.stringify(first.state).includes(secret));assert.equal(first.store.size,1,'Only dedicated key storage is changed');
  first.keys.save(secondKey,false);assert.equal(first.store.has(name),false);assert.equal(first.keys.get(),secondKey);assert.equal(first.keys.remembered(),false);
  assert.equal(deviceSandbox(Object.fromEntries(first.store)).keys.has(),false,'Ephemeral keys cannot survive reload');
  first.keys.save(secret,true);first.keys.clear();assert.equal(first.keys.has(),false);assert.equal(first.store.has(name),false);
  assert.equal(deviceSandbox({[name]:'invalid'}).keys.has(),false);
});
test('blocked storage cannot claim success or silently replace an existing key',()=>{
  const options={},x=deviceSandbox({},options);x.keys.save(secret,true);options.blocked=true;
  assert.throws(()=>x.keys.save('sk-or-different-private-test-key',true),/chưa thay key/);assert.equal(x.keys.get(),secret);
  assert.throws(()=>x.keys.clear(),/Chưa xoá được/);assert.equal(x.keys.get(),secret);
  assert.equal(deviceSandbox({}, {blocked:true}).keys.has(),false,'Read failure fails closed');
});
test('saving clears the masked input; storage deletion in another tab revokes the in-memory key',()=>{
  const x=deviceSandbox();x.init();const input=x.elements.get('aiKey');input.value=secret;x.save({preventDefault(){}});
  assert.equal(input.value,'');assert.ok(!JSON.stringify([...x.elements.values()]).includes(secret),'The key must not enter rendered UI text or placeholder');
  x.store.delete(x.keys.storageName);x.events.storage({key:x.keys.storageName});assert.equal(x.keys.has(),false);assert.equal(x.elements.get('aiRun').disabled,true);
  x.sandbox.location={protocol:'http:',hostname:'192.168.1.10'};input.value=secret;x.save({preventDefault(){}});assert.equal(x.keys.has(),true);assert.equal(input.value,'');assert.equal(x.elements.get('aiKey').disabled,false);
});
test('key dialog prompts on entry only without a key; skip, Escape and save clear input without calling AI',()=>{
  const x=deviceSandbox();x.init();x.enter();const dialog=x.elements.get('aiKeyDialog'),input=x.elements.get('aiKey');
  assert.equal(dialog.open,true);input.value='unsaved-value';x.skip();assert.equal(dialog.open,false);assert.equal(input.value,'');assert.equal(x.keys.has(),false);assert.equal(x.store.size,0);
  assert.equal(x.elements.get('aiMessage').hidden,true,'Skipping does not add a redundant status banner');
  x.enter();assert.equal(dialog.open,true,'A later entry can prompt again');input.value='another-unsaved-value';let prevented=false;
  dialog.listeners.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(dialog.open,false);assert.equal(input.value,'');
  x.enter();input.value='bad';x.save({preventDefault(){}});assert.equal(dialog.open,true,'Invalid input cannot close the dialog');assert.match(x.elements.get('aiKeyMessage').textContent,/định dạng/);
  input.value=secret;x.save({preventDefault(){}});assert.equal(dialog.open,false);assert.equal(x.keys.has(),true);assert.equal(input.value,'');
  assert.equal(x.elements.get('aiMessage').hidden,true,'Saved-key status is already visible on the settings button');
  x.enter();assert.equal(dialog.open,false,'A saved or ephemeral key suppresses the automatic popup');
  x.open();assert.equal(dialog.open,true,'The key can still be managed manually');x.skip();assert.equal(x.keys.get(),secret,'Closing management does not remove a saved key');
});
test('browser calls HTTPS OpenRouter directly even from LAN HTTP; status/key save sends nothing',async()=>{
  const calls=[],x=deviceSandbox({}, {fetch:async(url,init)=>{calls.push({url,init});return provider(output())(url,init);}});
  x.keys.save(secret,true);assert.equal((await x.fetch('status')).mode,'direct');assert.equal(calls.length,0);
  const response=await x.fetch('run',{task:'lineup',context:context()});assert.equal(response.output.subset.length,16);
  assert.equal(calls[0].url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(calls[0].init.headers.Authorization,'Bearer '+secret);
  assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.mode,'cors');
  assert.ok(!calls[0].init.body.includes(secret));assert.ok(!JSON.stringify(x.state).includes(secret));
  x.sandbox.location={protocol:'http:',hostname:'192.168.1.10'};x.init();assert.equal(x.elements.get('aiKey').disabled,false);
  await x.fetch('run',{task:'lineup',context:context()});assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url==='https://openrouter.ai/api/v1/chat/completions'));
  await assert.rejects(x.fetch('run',{task:'invalid',context:context()}));assert.equal(calls.length,2,'Bad inputs cannot incur a paid request');
  x.keys.clear();await assert.rejects(x.fetch('run',{}),/Nhập và lưu key/);assert.equal(calls.length,2);
});
test('two browser/device keys go independently to OpenRouter, with no shared-key fallback',async()=>{
  const seen=[],other='sk-or-another-device-test-key',fetch=async(url,init)=>{seen.push(init.headers.Authorization);return provider(output())(url,init);};
  const a=deviceSandbox({}, {fetch}),b=deviceSandbox({}, {fetch});
  a.keys.save(secret,true);b.keys.save(other,true);await a.fetch('run',{task:'lineup',context:context()});await b.fetch('run',{task:'lineup',context:context()});
  assert.deepEqual(seen,['Bearer '+secret,'Bearer '+other]);a.keys.clear();await assert.rejects(a.fetch('run',{}));assert.equal(seen.length,2);
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
test('draft review uses recent history but never invents a kickoff time',()=>{
  const c=context();c.match={...c.match,id:'current-lineup-draft',kickoff:0};c.instruction='';
  const data=JSON.parse(prepare({task:'match-review',context:c}).messages[1].content);
  assert.equal(data.isDraft,true);assert.equal(data.match.kickoff,null);assert.equal(data.players[0].form.played,5);assert.equal(data.players[0].form.goalsRecorded,10);assert.equal(data.instruction,'');
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
test('AI can only select validated candidates, with all 12 criteria intact',()=>{
  for(let n=14;n<=24;n++){
    const c=context();c.history=[];c.players=Array.from({length:n},(_,i)=>player(i,i>=14));c.rosterNames=c.players.map(p=>p.n).reverse();
    c.lineupCandidates=candidatesFor(teamsForPlayers(c.rosterNames.map(n=>c.players.find(p=>p.n===n))));
    const p=prepare({task:'lineup',context:c}),data=JSON.parse(p.messages[1].content),s=p.schema.properties;
    const ids=Array.from({length:n},(_,i)=>'p'+i);
    assert.equal(p.schema.additionalProperties,false);assert.equal(s.teams,undefined);assert.equal(s.assignments,undefined);
    assert.deepEqual(s.candidateId.enum,['c0']);assert.deepEqual(s.swaps.items.properties.first.enum,ids);assert.deepEqual(s.swaps.items.properties.second.enum,ids);
    assert.equal(s.swaps.items.additionalProperties,false);assert.equal(s.swaps.maxItems,0);assert.deepEqual(s.flipTeams.enum,[false]);
    assert.deepEqual(data.players.map(p=>p.id),ids);assert.deepEqual(data.players.map(p=>p.n),c.rosterNames);
    assert.equal(data.lineupRequirements.requiredStarterSlots.length,14);
    assert.deepEqual(data.lineupRequirements.benchPerTeam,{min:Math.floor((n-14)/2),max:Math.ceil((n-14)/2)});
    assert.equal(data.candidates.length,1);assert.equal(new Set([...data.candidates[0].teams.A.starters,...data.candidates[0].teams.A.bench,...data.candidates[0].teams.B.starters,...data.candidates[0].teams.B.bench]).size,n);
    assert.equal(data.rules.length,12,'All 12 existing criteria reach the model');
    for(const term of ['hàng công','hàng thủ','Gôn','vị trí','tốc độ','phong độ','Xoay tua','instruction'])assert.ok(data.rules.join(' ').includes(term));
    assert.match(p.messages[0].content,/KHÔNG đề xuất đổi chỗ/);
  }
  const c=context();delete c.lineupCandidates;assert.throws(()=>prepare({task:'lineup',context:c}),/phương án hợp lệ trước khi gọi AI/);
  c.lineupCandidates=candidatesFor({...teams,A:{...teams.A,starters:[0,0,2,3,4,5,6]}});assert.throws(()=>prepare({task:'lineup',context:c}),/trùng/);
});
test('Nam Khắc / Trịnh Mạnh A_SW regression: free swaps are rejected, never disguised as successful AI',()=>{
  const c=context();c.history=[];c.players=Array.from({length:20},(_,i)=>player(i));c.players[1].n='Nam Khắc';c.players[8].n='Trịnh Mạnh';c.rosterNames=c.players.map(p=>p.n);
  const t={A:{starters:[0,1,2,3,4,5,6],bench:[14,16,18]},B:{starters:[7,8,9,10,11,12,13],bench:[15,17,19]}};c.lineupCandidates=candidatesFor(t);
  const p=prepare({task:'lineup',context:c}),raw={...output(),swaps:[{first:'p1',second:'p8'}]},before=JSON.stringify(c);
  assert.throws(()=>validateOutput(JSON.stringify(raw),p),e=>e.kind==='lineup'&&/chuyển sang thuật toán/.test(e.message));
  const out=validateOutput(JSON.stringify(output()),p);
  assert.equal(out.teams.A.starters[1],1);assert.equal(out.teams.B.starters[1],8);assert.equal(out.plan.applied,0);
  assert.equal(new Set([...out.result.A,...out.result.B]).size,20);assert.equal(out.result.evA.bench.length,3);assert.equal(out.result.evB.bench.length,3);
  assert.equal(JSON.stringify(c),before,'No profile, history, Note or rating mutations');
  assert.throws(()=>validateOutput(JSON.stringify({...raw,swaps:[...raw.swaps,...raw.swaps,{first:'p1',second:'p1'}]}),p),/chuyển sang thuật toán/);
  const legacy={...output('player-description'),assignments:assignmentsFor(t)};legacy.assignments.p8='A_SW';
  assert.throws(()=>validateOutput(JSON.stringify(legacy),p),/mã phương án ngoài danh sách/,'Old position assignment contract is no longer used');
  assert.throws(()=>validateOutput(JSON.stringify({...raw,candidateId:'c99'}),p),/mã phương án ngoài danh sách/);
  assert.throws(()=>validateOutput(JSON.stringify({...raw,swaps:[{first:'p0',second:'p99'}]}),p),/chuyển sang thuật toán/);
});
test('unsafe guest swaps throw a lineup error for real algorithm fallback',()=>{
  const c=context();c.players=Array.from({length:20},(_,i)=>player(i,i>=16));c.rosterNames=c.players.map(p=>p.n);
  const t={A:{starters:[0,1,2,3,4,5,6],bench:[14,16,18]},B:{starters:[7,8,9,10,11,12,13],bench:[15,17,19]}};
  c.lineupCandidates=candidatesFor(t);const p=prepare({task:'lineup',context:c});
  assert.throws(()=>validateOutput(JSON.stringify({...output(),swaps:[{first:'p15',second:'p18'},{first:'p0',second:'p16'}]}),p),e=>e.kind==='lineup'&&e.aiProposal.swaps.length===2);
  assert.deepEqual(p.context.lineupCandidates[0].teams,t);
});
test('invalid quality and position candidates are rejected before AI',()=>{
  const strong=context();for(const i of [4,5,6])for(const k of C.KEYS)strong.players[i][k]=10;
  strong.players[14].guest=false;strong.players[14].pos='TĐ';
  for(const k of C.KEYS)strong.players[14][k]=10;strong.players[5].KT=1;
  assert.throws(()=>prepare({task:'lineup',context:strong}),/thuộc nhóm 14 sau khi áp dụng Note và xếp điểm/,'A top-14 player cannot be benched even before checking line balance');
  const c=context();c.players[1].pos='TĐ';
  assert.throws(()=>prepare({task:'lineup',context:c}),/không được xếp thòng/,'Wrong registered positions are now mandatory, not warnings');
});
test('1100 arbitrary swap/flip plans are rejected and untouched candidates still meet every guard',()=>{
  let seed=918273;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  let count=0;
  for(let n=14;n<=24;n++)for(let variant=0;variant<100;variant++){
    const c=context(),guestStart=[n,14,10][variant%3];c.history=[];c.players=Array.from({length:n},(_,i)=>player(i,i>=guestStart));c.rosterNames=c.players.map(p=>p.n);
    c.lineupCandidates=candidatesFor(teamsForPlayers(c.players));
    const p=prepare({task:'lineup',context:c}),swaps=Array.from({length:24},()=>({first:'p'+random(n),second:'p'+random(n)}));
    assert.throws(()=>validateOutput(JSON.stringify({...output(),flipTeams:variant%2===1,swaps}),p),e=>e.kind==='lineup');
    const out=validateOutput(JSON.stringify(output()),p);
    assert.equal(new Set([...out.result.A,...out.result.B]).size,n);assert.equal(out.teams.A.starters.length,7);assert.equal(out.teams.B.starters.length,7);
    assert.doesNotThrow(()=>C.lineup(c.players,out.teams));count++;
  }
  assert.equal(count,1100);
});
test('invalid paid-style response retains safe request metadata, identifies failure stage, never retries',async()=>{
  const p=prepare({task:'lineup',context:context()}),bad={...output(),candidateId:'c99'};
  let calls=0;
  await assert.rejects(complete(p,{...DEFAULTS,apiKey:secret},async()=>{
    calls++;return new Response(JSON.stringify({id:'gen-fixture-rejected',model:'fake/model',private:'PRIVATE_ACCOUNT_CANARY',choices:[{finish_reason:'stop',message:{content:JSON.stringify(bad)}}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.003},apiKey:secret}));
  }),e=>{
    assert.equal(e.kind,'lineup');assert.match(e.message,/mã phương án ngoài danh sách/);assert.equal(e.aiMeta.generationId,'gen-fixture-rejected');
    assert.deepEqual(e.aiMeta.usage,{promptTokens:100,completionTokens:50,cost:0.003});assert.equal(e.aiMeta.finishReason,'stop');
    assert.ok(!JSON.stringify(e.aiMeta).includes(secret));assert.ok(!JSON.stringify(e.aiMeta).includes('PRIVATE_ACCOUNT_CANARY'));assert.ok(!JSON.stringify(e.aiMeta).includes('assignments'));
    return true;
  });assert.equal(calls,1);
  await assert.rejects(complete(p,{...DEFAULTS,apiKey:secret},async()=>new Response(JSON.stringify({id:'gen-fixture-length',choices:[{finish_reason:'length'}],usage:{prompt_tokens:10,completion_tokens:5000}}))),e=>e.kind==='output'&&e.aiMeta.generationId==='gen-fixture-length');
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
test('provider fixed endpoint, request-local key, strict schema and safe error messages',async()=>{
  const config={...DEFAULTS,apiKey:secret};let sent;
  await complete(prepare({task:'lineup',context:context()}),config,async(url,init)=>{sent={url,init};return provider(output())(url,init);});
  assert.equal(sent.url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(sent.init.headers.Authorization,'Bearer '+secret);
  assert.equal(JSON.parse(sent.init.body).response_format.json_schema.strict,true);
  for(const code of [401,402,429,500])await assert.rejects(complete(prepare({task:'lineup',context:context()}),config,async()=>new Response(secret,{status:code})),e=>!e.message.includes(secret));
});
test('malformed/truncated/oversized provider output and timeout do not apply anything',async()=>{
  const p=prepare({task:'lineup',context:context()}),c={...DEFAULTS,apiKey:secret};
  assert.throws(()=>validateOutput('not json',p));assert.throws(()=>validateOutput('{"title":"bad"}',p));
  await assert.rejects(complete(p,c,async()=>new Response(JSON.stringify({choices:[{finish_reason:'length'}]}))),/chưa hoàn tất/);
  await assert.rejects(complete(p,c,async()=>new Response('x'.repeat(600000))),/vượt giới hạn/);
  await assert.rejects(complete(p,{...c,timeoutMs:10},async(_,init)=>new Promise((r,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))))),/quá thời gian/);
});
test('optional local file server has no AI API or provider proxy',async()=>{
  await withServer(async({request})=>{
    for(const route of ['status','run','login','logout']){
      const r=await request('/api/ai/'+route,route==='status'?undefined:{task:'lineup',context:context()},{Authorization:'Bearer '+secret});
      assert.equal(r.status,404);assert.ok(!(await r.text()).includes(secret));
    }
  });
});
test('provider input limit, Unicode streaming and network/CORS failures are safe and never retry',async()=>{
  const c=context();c.instruction='x'.repeat(2001);assert.throws(()=>prepare({task:'lineup',context:c}));
  const p=prepare({task:'lineup',context:context()}),bytes=new TextEncoder().encode(JSON.stringify({model:'fake/unicode',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output())}}]}));
  let i=0;const stream=new ReadableStream({pull(controller){if(i===bytes.length)return controller.close();controller.enqueue(bytes.slice(i,i+1));i++;}});
  assert.equal((await complete(p,{...DEFAULTS,apiKey:secret},async()=>new Response(stream))).title,output().title);
  let calls=0;await assert.rejects(complete(p,{...DEFAULTS,apiKey:secret},async()=>{calls++;throw new TypeError(secret);}),e=>e.message.includes('CORS')&&!e.message.includes(secret));assert.equal(calls,1);
});
test('static allowlist never serves .env, backups, source, Git or symlink secrets',async()=>{
  await withServer(async({request})=>{for(const route of ['/.env','/.git/config','/backups/data.json','/server/index.cjs','/firebase_config.json','/src/web_template.html','/assets/%2e%2e/.env'])assert.equal((await request(route)).status,404);const r=await request('/');assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('window.GP_APP_CONFIG={"dataMode":"preview"}'));assert.ok(!html.includes(secret));assert.ok(!html.includes(password));assert.equal(r.headers.get('cache-control'),'no-store');});
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
    assert.ok(!html.includes('id="aiCreateToggle"'),file+' no extra AI options button');
    assert.ok(!html.includes('Tuỳ chọn AI'),file+' no redundant AI options label');
    assert.match(html,/<section id="createAI"[^>]*>/);assert.ok(!html.match(/<section id="createAI"[^>]*\bhidden\b/),file+' connection is directly accessible');
    assert.ok(!html.includes('AI trong Tạo đội'),file+' no redundant workspace heading');
    assert.ok(!html.includes('ai-inline-head'),file+' no separate AI header wrapper');
    assert.ok(!html.includes('id="aiRosterInfo"'),file+' no duplicate roster explanation');
    const menu=html.slice(html.indexOf('<div class="ap-grid">'),html.indexOf('<div class="dash-main">'));
    assert.ok(!menu.includes('Trợ lý AI'),file+' no extra AI menu item');
  }
});
test('key input lives in a dismissible dialog reached from the criteria step, not in the Create card',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8'),start=html.indexOf('<section id="createAI"'),end=html.indexOf('</section>',start),inline=html.slice(start,end);
    assert.ok(!inline.includes('id="aiKeyForm"'),file+' no inline key form');assert.ok(inline.includes('id="aiKeySettings"'),file+' manual key management');
    assert.match(html,/<dialog id="aiKeyDialog"[^>]*aria-labelledby="aiKeyTitle"/);assert.ok(html.includes('id="aiKeySkip"'));assert.ok(html.includes('Bỏ qua, dùng thuật toán'));
    const wizardSource=file==='src/web_template.html'?fs.readFileSync(path.join(__dirname,'../src/create_flow.js'),'utf8'):html;
    assert.ok(wizardSource.includes("if(rules&&promptForKey&&!CREATE_WIZARD_KEY_PROMPTED){CREATE_WIZARD_KEY_PROMPTED=true;aiEnterCreate();}"),file+' prompt after a valid roster reaches criteria');
  }
});
test('Create has a contextual review button, not a generic analysis menu',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.ok(!html.includes('Công cụ phân tích'),file+' no generic analysis menu');
    assert.match(html,/<button[^>]*id="reviewDraft"[^>]*\bhidden\b/);assert.ok(html.includes('onclick="aiReviewDraft()"'));
  }
});
test('Create uses a gated two-step wizard, one action and an embedded worker in every entry',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const start=html.indexOf('<div id="screen-create"'),end=html.indexOf('<div id="screen-players"'),create=html.slice(start,end);
    assert.ok(create.indexOf('id="roster"')<create.indexOf('id="go"'),file+' player selection precedes Create action');
    assert.ok(create.indexOf('id="roster"')<create.indexOf('id="saveWeek"'),file+' player selection precedes save action');
    assert.match(create,/id="createRosterStepBtn"[^>]*aria-controls="createRosterStep"/);
    assert.match(create,/id="createRulesStepBtn"[^>]*aria-controls="createRulesStep"[^>]*disabled/);
    assert.ok(create.includes('id="createRosterStep"'));assert.ok(create.includes('id="createRulesStep"'));
    assert.ok(create.includes('id="createNextStep"'),file+' gates criteria behind a valid roster');
    assert.ok(!create.includes('id="toggleRoster"'),file+' criteria has no redundant edit-player button');
    assert.ok(!create.includes('Sửa cầu thủ'),file+' criteria has no redundant edit-player label');
    assert.match(create,/<input type="checkbox" id="selectAll"/);
    assert.ok(!/id="(?:all|none)"/.test(create));
    assert.ok(!create.includes('Tạo đội bằng AI'));assert.ok(!create.includes('Tạo đội (Thuật Toán)'));
    assert.ok(create.includes('id="createProcess"'));assert.ok(create.includes('id="createProcessSteps"'));
    assert.ok(html.includes('id="solverWorkerSource" type="text/plain"'));
  }
});
test('Create roster uses compact two-column tappable cards without visible per-player checkboxes',()=>{
  const template=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../src/ai.css'),'utf8');
  assert.ok(template.includes('el.setAttribute("role","checkbox")'));
  assert.ok(template.includes('el.setAttribute("aria-checked","true")'));
  assert.ok(template.includes('class="pl-title"'));
  assert.ok(!template.includes('Người có mặt hôm nay'));
  assert.ok(template.includes('className="roster-guest-add"'));
  assert.ok(template.indexOf('roster.appendChild(addGuestButton)')>template.indexOf('roster.appendChild(el)'));
  assert.match(template,/#roster \.pl-item>input\[type=checkbox\]\{[^}]*opacity:0/);
  assert.match(css,/#screen-create #roster\.grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(template,/-webkit-line-clamp:2/);
});
test('Create stepper highlights only the active number and bold label',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/ai.css'),'utf8');
  assert.match(css,/\.create-stepper button\.on\{background:transparent;color:var\(--text\);font-weight:750\}/);
  assert.match(css,/\.create-stepper button\.on \.create-step-number\{border-color:var\(--action\);background:var\(--action\);color:#fff\}/);
});
test('Create moves history to one header action and removes the space-consuming tab row',()=>{
  for(const file of ['src/web_template.html','index.html','score-update.html','dist/index.html','dist/score-update.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const start=html.indexOf('<div id="screen-create"'),end=html.indexOf('<div id="screen-players"'),create=html.slice(start,end);
    assert.ok(!create.includes('class="create-tabs"'),file+' removes the two-tab row');
    assert.ok(!html.includes('id="createBuildTabBtn"'),file+' removes Create tab button');
    assert.ok(!html.includes('id="createHistoryTabBtn"'),file+' removes history tab button');
    assert.match(html,/id="createHistoryHeaderBtn"[^>]*onclick="createToggleHeaderView\(\)"[^>]*hidden/,file+' exposes history in the header');
    assert.ok(create.includes('id="createBuildTab"'));assert.ok(create.includes('id="createHistoryTab"'));
    assert.ok(create.includes('id="createLogList"'),file+' renders lineup cards inline');
    assert.ok(create.includes('id="createLogDetails"'),file+' keeps technical diagnostics');
    assert.ok(create.includes('Chi tiết kiểm tra bug'),file+' labels bug diagnostics clearly');
    assert.ok(!create.includes('id="createLogsBtn"'),file+' removes redundant log toolbar action');
    assert.ok(!create.includes('id="createLogDialog"'),file+' removes old log dialog');
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
    const start=html.indexOf('<div id="screen-create"'),inline=html.indexOf('<section id="createAI"'),end=html.indexOf('</section>',inline),setup=html.slice(html.indexOf('<section id="createRulesStep"',start),inline);
    assert.ok(setup.includes('id="createCriteria"'));assert.ok(setup.includes('id="aiInstruction"'));
    const noteIndex=html.indexOf('id="aiInstruction"',start);assert.ok(noteIndex<inline||noteIndex>end,'Lineup Note stays outside optional AI settings');
    assert.equal((html.match(/id="aiInstruction"/g)||[]).length,1);
    const rules=setup.slice(setup.indexOf('<ol class="create-rule-list">'),setup.indexOf('</ol>'));
    assert.equal((rules.match(/<li>/g)||[]).length,12);
    assert.ok(html.includes('id="aiAnalysisInstruction"'));assert.ok(html.includes('id="createNoteStatus"'));
  }
});
test('compact UI removes repeated explanations but keeps criteria, key safety and cost notice',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8');
  assert.ok(!html.includes('class="create-priorities"'));
  assert.ok(!html.includes('Các công cụ của đội bóng'));
  assert.ok(!html.includes('Thông tin kết nối'));
  assert.match(html,/<p id="createNoteHelp"[^>]*>Note hiện tại; yêu cầu chưa xác minh sẽ có cảnh báo\.<\/p>/);
  const privacy=html.match(/<p id="aiKeyHelp"[^>]*>(.*?)<\/p>/)[1];
  for(const term of ['trình duyệt','Git','Firebase','backup','OpenRouter','HTTPS','script độc hại'])assert.ok(privacy.includes(term));
  const x=deviceSandbox();x.init();
  assert.match(x.elements.get('aiServerStatus').textContent,/openai\/gpt-4\.1-mini.*Phí tính theo key/);
  x.sandbox.location={protocol:'http:',hostname:'192.168.1.10'};x.init();
  assert.match(x.elements.get('aiServerStatus').textContent,/HTTP có nguy cơ bị can thiệp/);
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
test('active progress row stays first, including when an earlier step gets a fallback warning',()=>{
  const ids=['roster','ratings','engine','search','partition'];
  const rows=new Map(ids.map(id=>[id,{dataset:{step:id},querySelector:()=>({textContent:'',setAttribute(){}})}]));
  const list={children:ids.map(id=>rows.get(id)),scrollTop:50,
    get firstElementChild(){return this.children[0];},
    querySelector(selector){return rows.get(selector.match(/"([^"]+)"/)[1]);},
    prepend(row){this.children=[row,...this.children.filter(x=>x!==row)];}
  };
  const controls=new Map([['createProcessSteps',list]]),sandbox={performance:{now:()=>100},$:id=>{
    if(!controls.has(id))controls.set(id,{addEventListener(){}});return controls.get(id);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/create_flow.js'),'utf8')+'\nglobalThis.qaStep=createStep;',sandbox);
  const step=sandbox.qaStep,order=()=>list.children.map(row=>row.dataset.step);
  for(const id of ['roster','ratings','engine']){step(id,'active');step(id,'done');}
  step('search','active');
  assert.deepEqual(order(),['search','engine','ratings','roster','partition']);assert.equal(list.scrollTop,0);
  step('engine','warn','AI failed, using algorithm');
  assert.deepEqual(order(),['search','engine','ratings','roster','partition'],'Updating a previous warning cannot displace the active row');
  step('search','done');step('partition','active');step('partition','done');
  assert.deepEqual(order(),ids.slice().reverse(),'Completed rows remain in reverse order');
});
