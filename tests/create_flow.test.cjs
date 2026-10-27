'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../src/ai_context.js'),O=require('../src/optimizer.js'),S=require('../src/ai_service.js'),L=require('../src/create_log.js');
const {snapshot}=require('./lineup_snapshot.cjs');
const roster=(n=16)=>Array.from({length:n},(_,i)=>({n:'Flow '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const context=p=>({players:p,rosterNames:p.map(p=>p.n),history:[],instruction:''});
const group=(p,r)=>C.lineupGroupKey(p,{A:r.evA,B:r.evB});
function storage(){const data=new Map([['gp_history','PROTECTED_HISTORY'],['gp_openrouter_key','PRIVATE_DEVICE_KEY']]);return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
function controller(mode='algorithm',p=roster(),shared=storage(),options={}){
  const elements=new Map(),steps=new Map(),renders=[],requests=[],alerts=[];
  const cloudDocs=options.cloudDocs||new Map(),cloudCollection={
    doc:id=>({set:async payload=>{cloudDocs.set(id,structuredClone(payload));}}),
    orderBy(){return this;},limit(){return this;},
    get:async()=>({docs:[...cloudDocs.entries()].sort((a,b)=>String(b[1].startedAt).localeCompare(String(a[1].startedAt))).map(([id,data])=>({id,data:()=>structuredClone(data)}))})
  };
  function element(id){if(!elements.has(id))elements.set(id,{textContent:'',value:'',style:{},dataset:{},hidden:false,classList:{toggle(){}},addEventListener(){},setAttribute(){},focus(){},showModal(){},close(){},scrollIntoView(){},querySelectorAll(){return [];},replaceChildren(){},appendChild(){},prepend(){},querySelector(sel){if(id==='createProcessSteps'){const key=sel.match(/data-step="([^"]+)"/)[1];if(!steps.has(key))steps.set(key,element('step-'+key));return steps.get(key);}return element(id+sel);}});return elements.get(id);}
  const sandbox={GPAIContext:C,GPCreationLog:L,localStorage:shared,Date,performance:{now:()=>0},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,
    $:element,document:{querySelector:()=>({content:'test-release'}),createElement:()=>element('node-'+Math.random())},
    STATE:options.cloud?{cloud:true,docRef:{parent:cloudCollection}}:{cloud:false,docRef:null},firebase:options.cloud?{firestore:()=>({})}:undefined,aiIsPreview:()=>!options.cloud,
    AI_STATE:{busy:false},AI_KEYS:{has:()=>mode!=='algorithm'},cstate:{results:[],idx:0},
    aiMessage(){},aiTaskChanged(){},aiSyncDraftAction(){},aiRenderStatus(){},updateCount(){},fitMatch(){},esc:s=>s,
    selectedIdx:()=>p.map((_,i)=>i),aiContextSnapshot:()=>context(p),confirm:()=>mode!=='cancel',canEdit:!!options.canEdit,alert:message=>alerts.push(message),openAdminModal:()=>alerts.push('OPEN_ADMIN'),
    render:(r,players)=>renders.push({r,players}),
    aiFetch:async(action,request)=>{
      if(action==='status')return {};
      requests.push(request);
      if(mode==='network')throw Object.assign(new Error('Fixture network unavailable'),{kind:'network'});
      const prepared=S.prepare(request);
      const raw={title:'Fixture',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Controlled test, not real analysis.'})),candidateId:mode==='invalid'?'c99':'c0',flipTeams:false,swaps:mode==='swaps'?[{first:'p1',second:'p8'}]:[]};
      try{return {output:{...S.validateOutput(mode==='json'?'not-json':JSON.stringify(raw),prepared),generationId:'gen-fixture',model:'fake/model',usage:{cost:0.003}}};}
      catch(e){e.aiMeta={generationId:'gen-fixture',model:'fake/model',usage:{cost:0.003}};throw e;}
    }
  };
  // Retain the actual VM global, including cstate assignments from createTeams.
  const scope={...sandbox,solver:O.solve};vm.createContext(scope);
  vm.runInContext(fs.readFileSync(require.resolve('../src/create_flow.js'),'utf8')+`
    createCompleteStep=async(id,state,detail)=>createStep(id,state,detail);
    createSolveInWorker=async(p,instruction,history,now,excludeGroups)=>solver(p,null,{strictGuests:true,instruction,history,now,excludeGroups});
    globalThis.flow={run:createTeams,state:CREATE_STATE,log:CREATE_LOG,cloudPush:createCloudPush,cloudFetch:createCloudFetch,draftFromLog:createDraftFromLog,useLog:createUseLog,logIssue:createLogIssue,renderLogCards:createRenderLogCards,setStep:createSetWizardStep,reveal:createRevealDraft};
  `,scope);
  return {scope,elements,renders,requests,alerts,storage:shared,cloudDocs,...scope.flow};
}

test('solver supplies distinct starting groups, ignoring color flips, role-only changes and reserve order',()=>{
  const p=snapshot(),before=JSON.stringify(p),seen=new Set(),options={strictGuests:true,instruction:'Quang Minh bắt gôn'};
  for(let run=0;run<3;run++){
    const choices=O.solve(p,null,{...options,excludeGroups:[...seen]});assert.equal(choices.length,12);
    for(const r of choices){assert.doesNotThrow(()=>C.lineup(p,{A:r.evA,B:r.evB},options));const key=group(p,r);assert.ok(!seen.has(key));seen.add(key);}
    const r=choices[0],t={A:structuredClone(r.evA),B:structuredClone(r.evB)};
    t.A.starters.reverse();t.A.bench.reverse();assert.equal(C.lineupGroupKey(p,t),group(p,r));
    assert.equal(C.lineupGroupKey(p,{A:r.evB,B:r.evA}),group(p,r));
  }
  assert.equal(seen.size,36);assert.equal(JSON.stringify(p),before);
});

for(const mode of ['invalid','swaps','json','network'])test(mode+' AI response actually falls back once to a valid algorithm draft with a durable log',async()=>{
  const x=controller(mode),before=[...x.storage.data];await x.run();
  assert.equal(x.state.success,true);assert.equal(x.requests.length,1,'Never retries a paid call');assert.equal(x.renders.length,1);
  assert.match(x.elements.get('createProcessSummary').textContent,/Hoàn tất bằng Thuật toán/);
  assert.equal(x.scope.AI_STATE.output,null);assert.ok(x.scope.AI_STATE.lastFailure);
  const records=x.log.list(),r=records[0];assert.equal(r.status,'success');assert.equal(r.engine,'Thuật toán');assert.equal(r.ai.decision,'rejected');
  assert.equal(r.fallback.to,'Thuật toán');assert.ok(r.output.groupKey);assert.ok(r.validation.checks);
  assert.doesNotThrow(()=>C.lineup(x.renders[0].players,{A:x.renders[0].r.evA,B:x.renders[0].r.evB}));
  assert.equal(L.createStore(x.storage).list()[0].id,r.id,'Survives a reload');
  for(const [key,value] of before)assert.equal(x.storage.data.get(key),value,'Football and key storage untouched');
  assert.deepEqual([...x.storage.data.keys()].filter(k=>!before.some(([old])=>old===k)),[L.KEY]);
});

test('accepted AI only chooses a candidate and is labeled AI; three runs use different groups',async()=>{
  const x=controller('valid'),seen=new Set();
  for(let run=0;run<3;run++){
    await x.run();assert.equal(x.state.success,true);assert.match(x.elements.get('createProcessSummary').textContent,/Hoàn tất bằng AI/);
    const r=x.log.list().find(r=>r.id===x.log.list().filter(r=>r.status==='success')[0].id);
    const key=group(x.scope.cstate.subset,x.scope.cstate.results[0]);assert.ok(!seen.has(key));seen.add(key);
    assert.equal(r.ai.decision,'accepted');assert.equal(r.ai.candidateId,'c0');
  }
  assert.equal(x.requests.length,3);assert.equal(x.log.list().filter(r=>r.status==='success').length,3);
});

test('result is a separate step, locked until a draft and navigable back to criteria',async()=>{
  const x=controller('algorithm');assert.equal(x.setStep('result'),false,'No result without a draft');
  await x.run();assert.equal(x.state.success,true);x.reveal();
  assert.equal(x.elements.get('createResultStep').hidden,false);assert.equal(x.elements.get('createRulesStep').hidden,true);assert.equal(x.elements.get('createRosterStep').hidden,true);assert.equal(x.elements.get('createResultStepBtn').disabled,false);
  assert.equal(x.setStep('rules',false,false),true);assert.equal(x.elements.get('createRulesStep').hidden,false);assert.equal(x.elements.get('createResultStep').hidden,true);
  assert.equal(x.setStep('result'),true);assert.equal(x.elements.get('createResultStep').hidden,false);
});

test('a successful generation log restores the exact two teams for scheduling',async()=>{
  const x=controller('valid');await x.run();const record=x.log.list()[0],draft=x.draftFromLog(record);
  const names=(side,kind)=>draft.result['ev'+side][kind].map(i=>draft.players[i].n);
  for(const side of ['A','B']){
    assert.equal(JSON.stringify(names(side,'starters')),JSON.stringify(record.output.teams[side].filter(p=>!p.bench).map(p=>p.n)));
    assert.equal(JSON.stringify(names(side,'bench')),JSON.stringify(record.output.teams[side].filter(p=>p.bench).map(p=>p.n)));
  }
  assert.equal(record.ai.generationId,'gen-fixture');
});

test('scheduling a generated lineup is blocked before draft loading when admin is logged out',async()=>{
  const x=controller('valid');await x.run();const before=JSON.stringify(x.scope.cstate),record=x.log.list()[0];
  x.useLog(record.id);
  assert.equal(JSON.stringify(x.scope.cstate),before);assert.match(x.alerts[0],/cần đăng nhập admin/);assert.equal(x.alerts[1],'OPEN_ADMIN');
});

test('algorithm generations remain different after reload using only sanitized own logs',async()=>{
  const shared=storage(),seen=new Set();
  for(let run=0;run<3;run++){
    const x=controller('algorithm',roster(),shared);await x.run();assert.equal(x.state.success,true);assert.equal(x.requests.length,0);
    const key=group(x.scope.cstate.subset,x.scope.cstate.results[0]);assert.ok(!seen.has(key));seen.add(key);
  }
  assert.equal(seen.size,3);
});

test('no legal candidate stops before paid AI, keeps previous draft and records detailed diagnostics',async()=>{
  const p=roster();p[4].pos='TĐ';p[11].pos='TĐ';
  const x=controller('valid',p),old={results:[{sentinel:true}],idx:0};x.scope.cstate=old;await x.run();
  assert.equal(x.state.success,false);assert.equal(x.requests.length,0);assert.equal(x.renders.length,0);assert.equal(x.scope.cstate,old);
  const log=x.log.list()[0];assert.equal(log.status,'failed');assert.equal(log.error.kind,'solver');assert.ok(log.error.diagnostics.length);assert.ok(log.error.search);assert.ok(!log.output);
});

test('history explains missing keepers from the recorded snapshot and preserves the logged reason',()=>{
  const x=controller(),p=roster(16);for(const player of p)player.TM=0;p[0].TM=6;p[7].pos='HV';p[7].pos2=[];
  const record={status:'failed',input:{players:p,instruction:''},error:{kind:'solver',message:'Không phủ đủ hai bộ vị trí.',search:{totalPartitions:0,top14:p.slice(0,14).map(y=>y.n)}}};
  const issue=x.logIssue(record);assert.match(issue.title,/Lý do/);assert.match(issue.detail,/Không phủ đủ/);assert.match(issue.hint,/chỉ có 1 người.*Flow 0.*cần 2/);
  record.input.instruction='Flow 7 bắt gôn';assert.equal(x.logIssue(record).hint,'','Current Note authorizes the second keeper');
  const old=x.logIssue({status:'failed',events:[{state:'error',detail:'Hàng công chênh 2 điểm.'}]});assert.match(old.detail,/Hàng công/);assert.equal(old.hint,'');
  const fallback=x.logIssue({status:'success',fallback:{reason:'Kết nối AI không thành công.'}});assert.match(fallback.title,/dùng thuật toán/);assert.match(fallback.detail,/Kết nối AI/);
  assert.equal(x.logIssue({status:'running'}),null);
});

test('history card displays the exact failure and log id for a reserve imbalance',()=>{
  const x=controller(),node=()=>({textContent:'',className:'',children:[],appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}});
  x.scope.document.createElement=node;const list=node();x.elements.set('createLogList',list);
  x.renderLogCards([{id:'run-test-8lju2om1',startedAt:'2026-10-27T09:31:45.147Z',status:'failed',engine:'AI',input:{players:[]},error:{kind:'solver',message:'Sức mạnh dự bị chênh 1.30 điểm, vượt ngưỡng 1.',search:{totalPartitions:6435}}}]);
  const findText=n=>[n.textContent,...n.children.flatMap(findText)].join(' '),text=findText(list);
  assert.match(text,/Lý do không tạo được đội/);assert.match(text,/dự bị chênh 1\.30/);assert.match(text,/run-test-8lju2om1/);assert.doesNotMatch(text,/chỉ có 1 người đủ điều kiện bắt gôn/);
});

test('exhausted group exclusions return an explicit stop instead of reusing an old team',()=>{
  const p=roster(14),seen=new Set();let result;
  for(let i=0;i<10;i++){
    result=O.solve(p,null,{strictGuests:true,excludeGroups:[...seen]});if(result.error)break;
    for(const r of result){assert.ok(!seen.has(group(p,r)));seen.add(group(p,r));}
  }
  assert.equal(result.code,'no-new-lineup');assert.match(result.error,/không gọi AI/i);assert.ok(seen.size>0);
});

test('AI lineup creation proceeds without a confirmation popup',async()=>{
  const x=controller('valid');x.scope.confirm=()=>{throw new Error('Unexpected confirmation popup');};await x.run();
  assert.equal(x.state.success,true);assert.equal(x.requests.length,1);assert.equal(x.renders.length,1);assert.equal(x.log.list()[0].status,'success');
});

test('local journal is bounded, sanitizes secrets and never reads unrelated storage',()=>{
  const shared=storage(),access=[];let tick=0;
  const log=L.createStore({getItem:k=>{access.push(k);return shared.getItem(k);},setItem:(k,v)=>{access.push(k);shared.setItem(k,v);}},{limit:3,now:()=>new Date(1000+tick++).toISOString()});
  const secret='sk-or-v1-'+'a'.repeat(64);
  for(let i=0;i<5;i++){const id=log.begin('test');log.patch(id,{status:'success',inputKey:'input',output:{groupKey:'group'+i},apiKey:secret,finance:'PRIVATE_FINANCE',account:'PRIVATE_ACCOUNT',error:{message:secret+' Bearer PRIVATE_ACCESS_TOKEN1234',authorization:secret},ai:{usage:{promptTokens:2,completionTokens:3,cost:0.003}}});}
  assert.equal(log.list().length,3);assert.equal(log.seen('input').length,3);
  const json=log.export();for(const text of [secret,'PRIVATE_ACCESS_TOKEN1234','PRIVATE_FINANCE','PRIVATE_ACCOUNT','PRIVATE_DEVICE_KEY','PROTECTED_HISTORY'])assert.ok(!json.includes(text));
  assert.ok(json.includes('promptTokens'));assert.ok(access.every(k=>k===L.KEY));
  const blocked=L.createStore({getItem(){throw Error('blocked');},setItem(){throw Error('quota');}}),id=blocked.begin();blocked.patch(id,{status:'failed',error:{message:'test'}});
  assert.equal(blocked.persisted(),false);assert.equal(blocked.list()[0].status,'failed');assert.ok(blocked.export().includes('test'));
  const malformed=L.createStore({getItem:()=>'{"runs":[{"id":"bad"}]}',setItem(){}});assert.doesNotThrow(()=>malformed.begin());
});

test('cloud journal stores one sanitized compact document and can be read by another device',async()=>{
  const cloudDocs=new Map(),first=controller('algorithm',roster(),storage(),{cloud:true,cloudDocs});await first.run();
  assert.equal(cloudDocs.size,1);const [docId,payload]=[...cloudDocs.entries()][0];assert.match(docId,/^generation_run-/);
  assert.equal(payload.kind,'generationLog');assert.equal(payload.runId,payload.record.id);assert.equal(payload.status,'success');
  const json=JSON.stringify(payload);for(const text of ['inputKey','candidateGroups','apiKey','authorization','finance','account'])assert.ok(!json.includes(text));
  assert.ok(payload.record.input.players.length);assert.ok(payload.record.input.forms.length);assert.ok(payload.record.output.groupKey);assert.equal(payload.record.output.teams.A.length,8);assert.equal(payload.record.output.teams.B.length,8);assert.ok(payload.record.events.length);
  const second=controller('algorithm',roster(),storage(),{cloud:true,cloudDocs}),remote=await second.cloudFetch();
  assert.equal(remote.length,1);assert.equal(remote[0].id,payload.runId);assert.equal(remote[0].status,'success');
});

test('snapshot whitelists football context and input identity is stable under selected-player order',()=>{
  const c=context(roster());Object.assign(c,{apiKey:'PRIVATE_KEY',finance:'PRIVATE_FINANCE',accounts:'PRIVATE_ACCOUNTS'});c.players[0].raters=['PRIVATE_RATER'];
  const a=L.snapshot(c),b=L.snapshot({...c,rosterNames:c.rosterNames.slice().reverse()});assert.equal(L.inputKey(a),L.inputKey(b));
  for(const text of ['PRIVATE_KEY','PRIVATE_FINANCE','PRIVATE_ACCOUNTS','PRIVATE_RATER'])assert.ok(!JSON.stringify(a).includes(text));
  assert.equal(a.forms.length,16);assert.equal(a.rotationReference,null);assert.equal(a.players.length,16);
});
