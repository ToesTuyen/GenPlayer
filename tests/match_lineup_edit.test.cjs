'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../src/ai_context.js'),S=require('../src/ai_service.js');
const players=()=>Array.from({length:17},(_,i)=>({n:'Flow '+i,pos:C.SLOTS[i%7],pos2:[],guest:false,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const teams=()=>({A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}});
const make=(instruction='Đổi Flow 1 và Flow 8')=>{const all=players(),old=all.slice(0,16);return S.prepare({task:'match-lineup-edit',context:{players:all,rosterNames:old.map(p=>p.n),history:[],instruction,editTeams:teams()}});};
const swap=()=>({status:'ready',message:'Đã đổi hai cầu thủ.',A:{starters:['p0','p8','p2','p3','p4','p5','p6'],bench:['p14']},B:{starters:['p7','p1','p9','p10','p11','p12','p13'],bench:['p15']}});
test('saved-match AI edits preserve membership, remove absent players and add only named registered players',()=>{
  const q=make(),out=S.validateOutput(JSON.stringify(swap()),q);assert.equal(out.subset.length,16);assert.equal(out.subset[out.teams.A.starters[1]].n,'Flow 8');
  const removal={status:'ready',message:'Flow 0 nghỉ, Flow 14 thay.',A:{starters:['p14','p1','p2','p3','p4','p5','p6'],bench:[]},B:{starters:['p7','p8','p9','p10','p11','p12','p13'],bench:['p15']}};
  const removed=S.validateOutput(JSON.stringify(removal),make('Flow 0 nghỉ, Flow 14 thay'));assert.equal(removed.subset.length,15);assert.ok(!removed.subset.some(p=>p.n==='Flow 0'));
  const replacement=structuredClone(removal);replacement.A.starters[0]='p16';replacement.A.bench=['p14'];
  const replaced=S.validateOutput(JSON.stringify(replacement),make('Flow 0 nghỉ, Flow 16 thay'));assert.ok(replaced.subset.some(p=>p.n==='Flow 16'));assert.ok(!replaced.subset.some(p=>p.n==='Flow 0'));
  assert.throws(()=>S.validateOutput(JSON.stringify(replacement),make('Flow 0 nghỉ')),/chưa nêu rõ tên/);
  assert.throws(()=>S.validateOutput(JSON.stringify(removal),make('Đổi Flow 1 và Flow 8')),/chưa nêu rõ tên/);
  const duplicate=swap();duplicate.A.starters[0]='p8';assert.throws(()=>S.validateOutput(JSON.stringify(duplicate),q),/trùng cầu thủ/);
});
test('Hưng can leave and the existing reserve can replace him without confusing Duy Hùng',()=>{
  const all=players();all[8].n='Hưng';all[11].n='Duy Hùng';all[15].n='B quyền';
  const prepare=instruction=>S.prepare({task:'match-lineup-edit',context:{players:all,rosterNames:all.slice(0,16).map(p=>p.n),history:[],instruction,editTeams:teams()}});
  const proposal={status:'ready',message:'Hưng nghỉ, B quyền vào thay.',A:{starters:['p0','p1','p2','p3','p4','p5','p6'],bench:['p14']},B:{starters:['p7','p15','p9','p10','p11','p12','p13'],bench:[]}};
  const out=S.validateOutput(JSON.stringify(proposal),prepare('Hưng nghỉ, thay dự bị vào'));
  assert.ok(!out.subset.some(p=>p.n==='Hưng'));assert.ok(out.subset.some(p=>p.n==='Duy Hùng'));assert.equal(out.subset[out.teams.B.starters[1]].n,'B quyền');
  assert.throws(()=>S.validateOutput(JSON.stringify(proposal),prepare('Duy Hùng nghỉ, thay dự bị vào')),/Hưng.*chưa nêu rõ tên/);
  assert.throws(()=>S.validateOutput(JSON.stringify(proposal),prepare('Hùng nghỉ, thay dự bị vào')),/Hưng.*chưa nêu rõ tên/);
  assert.throws(()=>S.validateOutput(JSON.stringify(proposal),prepare('Hung nghi, thay du bi vao')),/Hưng.*chưa nêu rõ tên/,'Ambiguous unaccented name must not silently choose');
  const both=structuredClone(proposal);both.B.starters[4]='p14';both.A.bench=[];
  assert.doesNotThrow(()=>S.validateOutput(JSON.stringify(both),prepare('Hưng và Duy Hùng nghỉ, thay dự bị vào')));
});
function fixture(){
  const p=players(),t=teams(),result=C.lineup(p.slice(0,16),t,{manualEdit:true}).result;
  let doc={history:[{id:123,kickoff:1000,subset:structuredClone(p.slice(0,16)),result,n:16,score:{a:3,b:2},goals:{'Flow 2':1},review:'<p>Old review</p>',venue:'Old venue'},{id:456,score:{a:1,b:0},other:'untouched'}]};
  const elements=new Map(),logs=[];
  function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:true,disabled:false,children:[],showModal(){this.open=true;},close(){this.open=false;},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},addEventListener(){}});return elements.get(id);}
  const ctx={GPAIContext:C,CREATE_LOG_ROLE:{},AI_STATE:{busy:false},AI_KEYS:{has:()=>true},STATE:{cloud:true,docRef:{}},canEdit:true,
    $:el,getHistory:()=>structuredClone(doc.history),getPlayers:()=>structuredClone(p),fmtKick:()=>'',structuredClone,aiIsPreview:()=>false,alert:s=>{throw Error(s);},openAdminModal(){},aiOpenKeyDialog(){},aiKeyMessage(){},toast(){},showHistory(){},console,
    createLogNode:(tag,cls,text)=>({textContent:text||'',children:[],appendChild(x){this.children.push(x);}}),logMatchAct:(...args)=>logs.push(args),
    aiFetch:async(_,req)=>({output:S.validateOutput(JSON.stringify(swap()),S.prepare(req))}),
    firebase:{firestore:()=>({runTransaction:async fn=>{const snap=structuredClone(doc);let write;await fn({get:async()=>({data:()=>snap}),update:(_,v)=>{write=structuredClone(v);}});if(write)doc={...doc,...write};}})}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../src/match_lineup_edit.js'),'utf8'),ctx);
  return {ctx,el,logs,getDoc:()=>structuredClone(doc),setDoc:v=>{doc=v;}};
}
test('saved-match edit previews without writing then atomically changes only target lineup',async()=>{
  const x=fixture(),before=x.getDoc();x.ctx.canEdit=false;x.ctx.matchLineupOpen(123);assert.equal(x.el('matchLineupEditDialog').open,true,'No login is required');x.el('matchLineupInstruction').value='Đổi Flow 1 và Flow 8';await x.ctx.matchLineupRun();
  assert.deepEqual(x.getDoc(),before);assert.equal(x.el('matchLineupApply').hidden,false);
  await x.ctx.matchLineupApply();const after=x.getDoc();assert.deepEqual(after.history[1],before.history[1]);assert.deepEqual(after.history[0].score,before.history[0].score);assert.deepEqual(after.history[0].goals,before.history[0].goals);assert.equal(after.history[0].review,before.history[0].review);assert.equal(after.history[0].reviewStale,true);assert.equal(after.history[0].subset[after.history[0].result.evA.starters[1]].n,'Flow 8');assert.equal(x.logs.length,1);
});
test('saved-match AI editing requires the local key before making a request or applying',async()=>{
  const x=fixture(),before=x.getDoc();let prompts=0,calls=0;x.ctx.canEdit=false;x.ctx.AI_KEYS.has=()=>false;x.ctx.aiOpenKeyDialog=()=>{prompts++;};x.ctx.aiFetch=async()=>{calls++;};
  x.ctx.matchLineupOpen(123);x.el('matchLineupInstruction').value='Đổi Flow 1 và Flow 8';await x.ctx.matchLineupRun();assert.equal(prompts,1);assert.equal(calls,0);assert.deepEqual(x.getDoc(),before);
});
test('saved-match edits ignore field ordering and preserve unrelated concurrent changes',async()=>{
  const x=fixture();x.ctx.matchLineupOpen(123);x.el('matchLineupInstruction').value='Đổi Flow 1 và Flow 8';await x.ctx.matchLineupRun();const changed=x.getDoc();
  const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
  changed.history[0]=reorder(changed.history[0]);changed.history[0].venue='Changed elsewhere';changed.history[0].review='<p>New review</p>';changed.history[1].other='also changed';x.setDoc(changed);
  await x.ctx.matchLineupApply();const after=x.getDoc();assert.equal(after.history[0].venue,'Changed elsewhere');assert.equal(after.history[0].review,'<p>New review</p>');assert.equal(after.history[0].reviewStale,true);assert.equal(after.history[1].other,'also changed');assert.equal(after.history[0].subset[after.history[0].result.evA.starters[1]].n,'Flow 8');assert.equal(x.logs.length,1);
});
test('saved-match edits reject actual lineup, score, goals and goal-lock changes',async()=>{
  for(const change of [r=>{r.result.evA.starters[1]=3;},r=>{r.score.a=4;},r=>{r.goals['Flow 2']=2;},r=>{r.goalsLocked=true;},r=>{r.subset[1].KT=9; }]){
    const x=fixture();x.ctx.matchLineupOpen(123);x.el('matchLineupInstruction').value='Đổi Flow 1 và Flow 8';await x.ctx.matchLineupRun();const changed=x.getDoc();change(changed.history[0]);x.setDoc(changed);await x.ctx.matchLineupApply();assert.deepEqual(x.getDoc(),changed);assert.match(x.el('matchLineupStatus').textContent,/đã thay đổi kể từ khi mở/);assert.equal(x.logs.length,0);
  }
});
test('saved-match edits reject changes to goalscorer side',async()=>{
  const y=fixture(),d=y.getDoc();d.history[0].goals={'Flow 1':1};y.setDoc(d);y.ctx.matchLineupOpen(123);y.el('matchLineupInstruction').value='Đổi Flow 1 và Flow 8';await y.ctx.matchLineupRun();assert.match(y.el('matchLineupStatus').textContent,/đã có bàn thắng/);assert.equal(y.el('matchLineupApply').hidden,true);assert.deepEqual(y.getDoc(),d);
});
