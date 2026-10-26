'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/ai_context.js'),O=require('../src/optimizer.js'),S=require('../src/ai_service.js');
const {snapshot,reportedTeams}=require('./lineup_snapshot.cjs'),{candidatesFor}=require('./lineup_fixture.cjs');
const rate=(p,v)=>Object.assign(p,Object.fromEntries(C.KEYS.map(k=>[k,v])));
const roster=n=>Array.from({length:n},(_,i)=>rate({n:'Priority '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14},6));
const context=(p,t)=>({players:p,history:[],rosterNames:p.map(x=>x.n),lineupCandidates:candidatesFor(t),instruction:''});
const output=swaps=>JSON.stringify({title:'Priority regression',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Fake test content.'})),candidateId:'c0',flipTeams:false,swaps});

test('reported Chrome lineup is rejected: Hưng and Văn Thanh cannot be sacrificed to balance teams',()=>{
  const p=snapshot(),t=reportedTeams(),before=JSON.stringify(p);
  assert.throws(()=>C.lineup(p,t),/không được dự bị.*chuỗi đổi vị trí/);
  assert.throws(()=>S.prepare({task:'lineup',context:context(p,t)}),/không được dự bị/,'No paid call can start from the reported bad base');
  const results=O.solve(p,null,{strictGuests:true});assert.equal(results.length,12);
  const mustStart=['Hưng','Văn Thanh','Huy Hoàng','Nguyen Quy Bong','Nguyễn Khắc Trọng','Mạnh Tiến'];
  const mustBench=['Nguyễn Văn Quyền','Quý Tàu','Quang Minh'];
  for(const r of results){
    const t={A:r.evA,B:r.evB},checked=C.lineup(p,t),names=[...t.A.starters,...t.B.starters].map(i=>p[i].n);
    for(const name of mustStart)assert.ok(names.includes(name),name+' must start');
    for(const name of mustBench)assert.ok(!names.includes(name),name+' must bench');
    // Independent upper bound: the two primary keepers plus the strongest 12
    // outfield profiles. This snapshot has a legal assignment for that set.
    const upper=p.filter(x=>x.pos==='GK').reduce((s,x)=>s+C.positionScore(x,x.pos),0)+p.filter(x=>x.pos!=='GK').map(x=>C.positionScore(x,x.pos)).sort((a,b)=>b-a).slice(0,12).reduce((s,x)=>s+x,0);
    assert.ok(Math.abs(checked.checks.priority.strength-upper)<1e-9);
    assert.ok(checked.checks.metrics.benchGroups.every(g=>g.gap<=0.5+1e-9));
  }
  assert.equal(JSON.stringify(p),before,'No profile or rating is rewritten');
});

test('weakest reserve cannot hide two stronger reserves concentrated on one side',()=>{
  const p=roster(20),t={A:{starters:[0,1,2,3,4,5,6],bench:[14,16,18]},B:{starters:[7,8,9,10,11,12,13],bench:[15,17,19]}};
  [14,16].forEach(i=>rate(p[i],6.8));rate(p[18],4.1);rate(p[15],6.3);[17,19].forEach(i=>rate(p[i],5.9));
  const m=C.lineupMetrics(p,t);assert.ok(m.difference.benchMean<0.5);assert.ok(m.benchGroups[1].gap>0.5);
  assert.throws(()=>C.lineup(p,t),/nhóm 2 người mạnh nhất.*không lấy người yếu/);
  const good=structuredClone(t);[good.A.bench[1],good.B.bench[0]]=[good.B.bench[0],good.A.bench[1]];
  assert.doesNotThrow(()=>C.lineup(p,good));
  const prepared=S.prepare({task:'lineup',context:context(p,good)}),out=S.validateOutput(output([{first:'p16',second:'p15'}]),prepared);
  assert.equal(out.plan.applied,0);assert.match(out.warnings.join(' '),/nhóm 2 người mạnh nhất/);
  const data=JSON.parse(prepared.messages[1].content);assert.equal(data.lineupRequirements.reserveStrength.strongestPrefixes,true);
});

test('priority uses a legal chain, not a raw top-14 cut that leaves required positions empty',()=>{
  const p=roster(16);p.forEach(x=>x.guest=false);p[14].pos='Thòng';p[15].pos='Thòng';rate(p[14],8);rate(p[15],8);
  // Only two sweeper seats exist; without a secondary role not all four
  // sweepers can start, however strong they are.
  const r=O.solve(p,null,{strictGuests:true});assert.ok(r.length>0);
  for(const x of r){const t={A:x.evA,B:x.evB};assert.doesNotThrow(()=>C.lineup(p,t));assert.ok(t.A.starters.includes(14)||t.B.starters.includes(14));assert.ok(t.A.starters.includes(15)||t.B.starters.includes(15));}
  p[1].pos2=['HV'];p[8].pos2=['HV'];
  const guard=C.lineupGuard(p);assert.equal(guard.priority.best.members,14);
});

test('AI cannot bench a member after selecting a strongest-starting base',()=>{
  const p=snapshot(),r=O.solve(p,null,{strictGuests:true})[0],t={A:r.evA,B:r.evB};
  const bench=[...t.A.bench,...t.B.bench].find(i=>p[i].n==='Nguyễn Văn Quyền'),starter=[...t.A.starters,...t.B.starters].find(i=>p[i].n==='Văn Thanh');
  const out=S.validateOutput(output([{first:'p'+bench,second:'p'+starter}]),S.prepare({task:'lineup',context:context(p,t)}));
  assert.equal(out.plan.applied,0);
  for(const side of ['A','B'])for(const key of ['starters','bench'])assert.deepEqual(out.teams[side][key],t[side][key]);
});

test('starting selection agrees with an independent role-count upper bound on a small flexible roster',()=>{
  const p=roster(16);p.forEach((x,i)=>{x.guest=false;if(i>=14)x.pos='HV';});
  for(let i=0;i<p.length;i++)rate(p[i],5+(i%5)/10);
  // This roster has exactly the required pair in every role except HV, so
  // both keepers/sweepers/CMs/wingers/strikers plus the top four HVs must start.
  const required=p.map((x,i)=>({x,i})).filter(({x})=>x.pos!=='HV').map(({i})=>i);
  const fullbacks=p.map((x,i)=>({x,i})).filter(({x})=>x.pos==='HV').sort((a,b)=>C.positionScore(b.x,b.x.pos)-C.positionScore(a.x,a.x.pos)).slice(0,4).map(({i})=>i);
  const expected=[...required,...fullbacks].reduce((s,i)=>s+C.positionScore(p[i],p[i].pos),0);
  assert.ok(Math.abs(C.lineupGuard(p).priority.best.strength-expected)<1e-9);
});
