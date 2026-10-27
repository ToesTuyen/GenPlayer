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
  const cloudDocs=options.cloudDocs||new Map(),cloudReads=[],cloudCollection={
    doc:id=>({set:async payload=>{cloudDocs.set(id,structuredClone(payload));}}),
    orderBy(){let after=null,count=Infinity;return {startAfter(doc){after=doc;return this;},limit(n){count=n;return this;},async get(){if(options.failCloud?.())throw Error('offline');const entries=[...cloudDocs.entries()].sort((a,b)=>String(b[1].startedAt).localeCompare(String(a[1].startedAt))||b[0].localeCompare(a[0])),offset=after?entries.findIndex(([id])=>id===after.id)+1:0,docs=entries.slice(offset,offset+count).map(([id,data])=>({id,data:()=>structuredClone(data)}));cloudReads.push({after:after?.id||null,count,returned:docs.length});return {docs};}};}
  };
  function element(id){if(!elements.has(id))elements.set(id,{textContent:'',value:'',style:{},dataset:{},children:[],hidden:false,classList:{toggle(){}},addEventListener(){},setAttribute(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},scrollIntoView(){},querySelectorAll(){return [];},replaceChildren(...children){this.children=children;},appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},prepend(child){this.children.unshift(child);},querySelector(sel){if(id==='createProcessSteps'){const key=sel.match(/data-step="([^"]+)"/)[1];if(!steps.has(key))steps.set(key,element('step-'+key));return steps.get(key);}return element(id+sel);}});return elements.get(id);}
  const sandbox={GPAIContext:C,GPCreationLog:L,localStorage:shared,Date,performance:{now:()=>0},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,
    $:element,document:{querySelector:()=>({content:'test-release'}),createElement:()=>element('node-'+Math.random())},
    STATE:options.cloud?{cloud:true,docRef:{parent:cloudCollection}}:{cloud:false,docRef:null},firebase:options.cloud?{firestore:()=>({})}:undefined,aiIsPreview:()=>!options.cloud,
    AI_STATE:{busy:false},AI_KEYS:{has:()=>mode!=='algorithm'},cstate:{results:[],idx:0},
    aiMessage(){},aiTaskChanged(){},aiSyncDraftAction(){},aiRenderStatus(){},updateCount(){},fitMatch(){},esc:s=>s,structuredClone,getHistory:()=>[],GPIcons:{render:()=>''},TITLES:{'screen-create':'Tạo đội'},
    selectedIdx:()=>p.map((_,i)=>i),aiContextSnapshot:()=>({...context(p),instruction:element('aiInstruction').value}),confirm:()=>mode!=='cancel',canEdit:!!options.canEdit,alert:message=>alerts.push(message),openAdminModal:()=>alerts.push('OPEN_ADMIN'),
    render:(r,players)=>renders.push({r,players}),
    aiFetch:async(action,request)=>{
      if(action==='status')return {};
      requests.push(request);
      if(mode==='network')throw Object.assign(new Error('Fixture network unavailable'),{kind:'network'});
      const prepared=S.prepare(request);
      if(request.task==='lineup-edit'){
        const raw=options.clarifyEdit?{status:'clarify',message:'Bạn muốn p15 đổi với P8 hay p99?',swaps:[]}:{status:'ready',message:'Đổi p1 với p8.',swaps:[{first:'p1',second:options.invalidEdit?'p99':'p8'}]};
        return {output:{...S.validateOutput(JSON.stringify(raw),prepared),generationId:'gen-edit-fixture',model:'fake/model',usage:{cost:0}}};
      }
      const raw={title:'Fixture',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Controlled test, not real analysis.'})),candidateId:mode==='invalid'?'c99':'c0',flipTeams:false,swaps:mode==='swaps'?[{first:'p1',second:'p8'}]:[]};
      try{return {output:{...S.validateOutput(mode==='json'?'not-json':JSON.stringify(raw),prepared),generationId:'gen-fixture',model:'fake/model',usage:{cost:0.003}}};}
      catch(e){e.aiMeta={generationId:'gen-fixture',model:'fake/model',usage:{cost:0.003}};throw e;}
    }
  };
  // Retain the actual VM global, including cstate assignments from createTeams.
  const scope={...sandbox,solver:O.solve};vm.createContext(scope);
  scope.aiDraftFingerprint=()=>scope.cstate.results?.length?JSON.stringify({subset:scope.cstate.subset,result:scope.cstate.results[scope.cstate.idx]}):null;
  vm.runInContext(fs.readFileSync(require.resolve('../src/create_flow.js'),'utf8')+`
    createCompleteStep=async(id,state,detail)=>createStep(id,state,detail);
    createSolveInWorker=async(p,instruction,history,now,excludeGroups)=>solver(p,null,{strictGuests:true,instruction,history,now,excludeGroups});
    globalThis.flow={run:createTeams,state:CREATE_STATE,log:CREATE_LOG,cloudPush:createCloudPush,cloudFetch:createCloudFetch,draftFromLog:createDraftFromLog,useLog:createUseLog,logIssue:createLogIssue,renderLogCards:createRenderLogCards,setStep:createSetWizardStep,reveal:createRevealDraft,openEdit:createOpenEdit,runEdit:createRunEdit,applyEdit:createApplyEdit,setLogView:records=>{CREATE_LOG_VIEW=records;},openLogs:createOpenLogs,loadMoreLogs:createLoadMoreLogs,setTab:createSetTab,visibleLogs:()=>CREATE_LOG_VIEW};
  `,scope);
  return {scope,elements,renders,requests,alerts,storage:shared,cloudDocs,cloudReads,...scope.flow};
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

test('generation applies a keeper comparison before solving and retains it in the match log only',async()=>{
  const p=roster();p[0].pos2=['TĐ'];p[6].n='Nguyễn Danh Tuyên';p[6].TM=0;p[15].n='Mạnh Tiến';p[15].pos='GK';p[15].TM=6;const original=JSON.stringify(p);
  const x=controller('valid',p);x.scope.$('aiInstruction').value='Tuyên bắt gôn, chỉ số thủ môn như Mạnh Tiên';await x.run();
  assert.equal(x.state.success,true);const target=x.scope.cstate.subset.find(y=>y.n==='Nguyễn Danh Tuyên'),score=C.positionScore(p[15],'GK');
  assert.equal(target.matchGkRating,score);assert.equal(JSON.stringify(p),original);assert.equal(x.requests[0].context.players.find(y=>y.n===target.n).matchGkRating,score);
  const saved=x.log.list()[0],restored=x.draftFromLog(saved);assert.equal(restored.players.find(y=>y.n===target.n).matchGkRating,score);assert.equal(L.cloudRecord(saved).input.players.find(y=>y.n===target.n).matchGkRating,score);
  x.scope.$('aiInstruction').value='';await x.run();assert.equal(x.state.success,true);assert.equal(x.scope.cstate.subset.find(y=>y.n===target.n).matchGkRating,undefined,'A later match does not inherit the override');
});

test('each usable history lineup has one row of adjacent edit and schedule actions above the teams',async()=>{
  const x=controller('valid');await x.run();const record=x.log.list()[0];x.setLogView([record]);x.renderLogCards([record]);
  const card=x.elements.get('createLogList').children[0],actions=card.children.filter(n=>n.className==='create-log-actions'),teamsIndex=card.children.findIndex(n=>n.className==='create-log-teams');
  assert.equal(actions.length,1);assert.ok(card.children.indexOf(actions[0])<teamsIndex);
  for(const row of actions){assert.deepEqual(row.children.map(n=>n.textContent),['Sửa đội hình','Đặt làm trận tuần này']);row.children[0].onclick();assert.equal(x.elements.get('lineupEditDialog').open,true);assert.match(x.elements.get('lineupEditSource').textContent,new RegExp(record.id));x.scope.createCloseEdit();}
  assert.match(card.children.at(-1).textContent,/Mã log:/);
});

test('AI editing previews explicit swaps and preserves the source history without regenerating',async()=>{
  const x=controller('valid');await x.run();const source=x.log.list()[0],before=JSON.stringify(x.scope.cstate),sourceBefore=JSON.stringify(source);
  x.openEdit();assert.equal(x.elements.get('lineupEditDialog').open,true);x.elements.get('lineupEditInstruction').value='Đổi Flow 0 và Flow 7';await x.runEdit();
  assert.equal(JSON.stringify(x.scope.cstate),before,'Preview does not mutate the draft');assert.equal(x.elements.get('lineupEditApply').hidden,false);
  const previewText=x.elements.get('lineupEditPreview').children.map(n=>n.textContent).join(' ');assert.match(previewText,/Flow 1/);assert.match(previewText,/Flow 8/);assert.doesNotMatch(previewText,/\bp\d+\b/i);
  assert.equal(x.requests.at(-1).task,'lineup-edit');assert.equal(x.requests.length,2,'One edit call, no regeneration');
  x.applyEdit();assert.notEqual(JSON.stringify(x.scope.cstate),before);assert.equal(x.elements.get('lineupEditDialog').open,false);
  const latest=x.log.list(),original=latest.find(r=>r.id===source.id);assert.equal(JSON.stringify(original),sourceBefore);assert.equal(latest.length,2);assert.equal(latest[0].engine,'AI · Sửa đội');
  assert.equal(x.state.draftNote,'','Edit instruction does not falsely mark the generation note stale');
  const teams=latest[0].output.teams;assert.ok(teams.A.length&&teams.B.length);
  x.setLogView([source]);x.openEdit(source.id);x.elements.get('lineupEditInstruction').value='Đổi Flow 0 và Flow 7';await x.runEdit();x.applyEdit();
  assert.equal(JSON.stringify(x.log.list().find(r=>r.id===source.id)),sourceBefore,'Editing a history item does not overwrite it');
});

test('AI clarification shows real names and team locations instead of internal player IDs',async()=>{
  const x=controller('valid',roster(),storage(),{clarifyEdit:true});await x.run();const before=JSON.stringify(x.scope.cstate);x.openEdit();
  x.elements.get('lineupEditInstruction').value='Cho Flow 15 dự bị';await x.runEdit();const message=x.elements.get('lineupEditStatus').textContent;
  assert.match(message,/Flow 15 \(Team [AB] ·/);assert.match(message,/Flow 8 \(Team [AB] ·/);assert.match(message,/cầu thủ chưa xác định/);assert.doesNotMatch(message,/\bp\d+\b/i);
  assert.equal(x.elements.get('lineupEditApply').hidden,true);assert.equal(JSON.stringify(x.scope.cstate),before);
});

test('invalid AI edit leaves the existing draft untouched',async()=>{
  const x=controller('valid',roster(),storage(),{invalidEdit:true});await x.run();const before=JSON.stringify(x.scope.cstate);x.openEdit();
  x.elements.get('lineupEditInstruction').value='Đổi hai người';await x.runEdit();
  assert.equal(JSON.stringify(x.scope.cstate),before);assert.equal(x.elements.get('lineupEditApply').hidden,true);assert.match(x.elements.get('lineupEditStatus').textContent,/Chưa áp dụng/);assert.equal(x.log.list().length,1);
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

test('new logs record only a compact browser and device label, including cloud copies',()=>{
  const examples=[
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1','iPhone · Safari'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/127.0 Mobile/15E148 Safari/604.1','iPhone · Chrome'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36','Android · Chrome'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/127.0 Safari/537.36','Mac · Chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36 Edg/127.0','Windows · Edge']
  ];
  for(const [userAgent,label] of examples)assert.equal(L.deviceLabel({userAgent}),label);
  assert.equal(L.deviceLabel({userAgent:'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17 Safari/605.1',maxTouchPoints:5}),'iPad · Safari');assert.equal(L.deviceLabel(null),'');
  const store=L.createStore(storage(),{device:()=>L.deviceLabel({userAgent:examples[0][0]})}),id=store.begin(),record=store.list().find(r=>r.id===id),cloud=L.cloudRecord(record);
  assert.equal(record.device,'iPhone · Safari');assert.equal(cloud.device,record.device);assert.ok(!JSON.stringify(cloud).includes('Mozilla/5.0'),'Raw browser fingerprint is not stored');
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

test('history pages local and cloud logs in tens, deduplicates and restores the screen title',async()=>{
  const cloudDocs=new Map(),shared=storage(),cloudRecords=[];
  for(let i=0;i<42;i++){
    const startedAt=new Date(Date.UTC(2026,9,27,0,0,i)).toISOString(),record={id:'run-cloud-'+String(i).padStart(2,'0'),startedAt,updatedAt:startedAt,status:'failed',input:{players:[]},error:{message:'test'}};
    cloudRecords.push(record);cloudDocs.set('generation_'+record.id,{kind:'generationLog',startedAt,record});
  }
  const localExtra=Array.from({length:3},(_,i)=>{const startedAt=new Date(Date.UTC(2026,9,27,0,0,50+i)).toISOString();return {id:'run-local-'+i,startedAt,updatedAt:startedAt,status:'failed',input:{players:[]}};});
  shared.setItem(L.KEY,JSON.stringify({version:1,runs:[...localExtra,cloudRecords[40],cloudRecords[10]]}));
  cloudDocs.set('unrelated-doc',{kind:'other',startedAt:new Date(Date.UTC(2026,9,27,0,0,41,500)).toISOString()});
  const x=controller('algorithm',roster(),shared,{cloud:true,cloudDocs});await x.openLogs();
  const expected=[...cloudRecords,...localExtra].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.id.localeCompare(a.id));
  const ids=()=>Array.from(x.visibleLogs(),r=>r.id);
  assert.equal(x.elements.get('appTitle').innerHTML,' Lịch sử tạo đội');assert.deepEqual(ids(),expected.slice(0,10).map(r=>r.id));assert.equal(x.elements.get('createLogList').children.length,10);
  for(const count of [20,30,40,45]){await x.loadMoreLogs();assert.deepEqual(ids(),expected.slice(0,count).map(r=>r.id));assert.equal(new Set(ids()).size,ids().length);}
  assert.equal(x.elements.get('createLogMore').hidden,true);assert.ok(x.cloudReads.length>=5);assert.ok(x.cloudReads.every(r=>r.count===10&&r.returned<=10));
  assert.equal(JSON.parse(L.exportRecords(x.visibleLogs())).runs.length,45,'Export includes all displayed records, not only the first 30');
  const reads=x.cloudReads.length;await x.loadMoreLogs();assert.equal(x.cloudReads.length,reads);x.setTab('build');assert.equal(x.elements.get('appTitle').innerHTML,'Tạo đội');
});

test('history preserves local pages and allows retry when cloud reading fails',async()=>{
  const shared=storage(),records=Array.from({length:16},(_,i)=>{const startedAt=new Date(Date.UTC(2026,9,27,0,0,i)).toISOString();return {id:'run-local-'+i,startedAt,updatedAt:startedAt,status:'failed',input:{players:[]}};});
  shared.setItem(L.KEY,JSON.stringify({version:1,runs:records}));let offline=true;
  const x=controller('algorithm',roster(),shared,{cloud:true,failCloud:()=>offline});await x.openLogs();
  assert.equal(x.visibleLogs().length,10);assert.match(x.elements.get('createLogNotice').textContent,/Không đọc được log cloud/);assert.equal(x.elements.get('createLogMore').hidden,false);
  await x.loadMoreLogs();assert.equal(x.visibleLogs().length,16,'Older local records remain accessible offline');
  offline=false;await x.loadMoreLogs();assert.equal(x.visibleLogs().length,16);assert.match(x.elements.get('createLogNotice').textContent,/gộp log/);assert.equal(x.elements.get('createLogMore').hidden,true);
});

test('snapshot whitelists football context and input identity is stable under selected-player order',()=>{
  const c=context(roster());Object.assign(c,{apiKey:'PRIVATE_KEY',finance:'PRIVATE_FINANCE',accounts:'PRIVATE_ACCOUNTS'});c.players[0].raters=['PRIVATE_RATER'];
  const a=L.snapshot(c),b=L.snapshot({...c,rosterNames:c.rosterNames.slice().reverse()});assert.equal(L.inputKey(a),L.inputKey(b));
  for(const text of ['PRIVATE_KEY','PRIVATE_FINANCE','PRIVATE_ACCOUNTS','PRIVATE_RATER'])assert.ok(!JSON.stringify(a).includes(text));
  assert.equal(a.forms.length,16);assert.equal(a.rotationReference,null);assert.equal(a.players.length,16);
});
