'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/ai_context.js'),O=require('../src/optimizer.js'),S=require('../src/ai_service.js');
const {candidatesFor}=require('./lineup_fixture.cjs');
const rated=(p,value)=>Object.assign(p,Object.fromEntries(C.KEYS.map(k=>[k,value])));
const roster=(n=16)=>Array.from({length:n},(_,i)=>rated({n:'Quality '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14},6));
const teams=()=>({A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}});
const output=swaps=>({title:'Quality fixture',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Fake provider content.'})),candidateId:'c0',flipTeams:false,swaps});
const prepared=(players,t=teams())=>S.prepare({task:'lineup',context:{players,history:[],rosterNames:players.map(p=>p.n),lineupCandidates:candidatesFor(t),instruction:''}});

test('attack and defense are independent mandatory limits, including exact and near boundaries',()=>{
  for(const slot of [4,1]){
    const p=roster(),t=teams();rated(p[slot],7.5);
    assert.doesNotThrow(()=>C.lineup(p,t),'Exactly 1.5 is allowed');
    rated(p[slot],7.5001);assert.throws(()=>C.lineup(p,t),/vượt ngưỡng bắt buộc/);
    assert.equal(C.lineupGuard(p).accepts(t),false);
  }
  const p=roster(),t=teams();rated(p[4],8);rated(p[1],4);rated(p[7],8);
  assert.throws(()=>C.lineup(p,t),/hàng công/,'Better keeper/opposite line cannot compensate');
  assert.throws(()=>prepared(p,t),/vượt ngưỡng bắt buộc/,'Cannot send invalid bases to a paid provider');
});

test('mandatory starter priority chooses stronger members across both teams, including secondary roles and small gaps',()=>{
  for(const secondary of [false,true]){
    const p=roster(),t=teams();p[14].guest=false;
    p[14].pos=secondary?'HV':'TV';p[14].pos2=secondary?['TV']:[];
    rated(p[5],6.8);rated(p[14],6.5);
    assert.throws(()=>C.lineup(p,t),/Quality 14.*nhóm đá chính mạnh hơn/,'The best legal starting group must be chosen across both sides');
    rated(p[14],6.0001);assert.throws(()=>C.lineup(p,t),/không được dự bị/,'Even a smaller profile advantage cannot be hidden by the old 0.5 direct-swap allowance');
    rated(p[14],6);assert.doesNotThrow(()=>C.lineup(p,t),'Equal-rated legal alternatives are allowed');
  }
  const p=roster(),t=teams();p[14].guest=false;p[14].pos='TVtt';rated(p[14],6.5);
  assert.throws(()=>C.lineup(p,t),/Quality 14.*không được dự bị/,'Same-side violation is mandatory too');
  p[14].guest=true;rated(p[14],10);rated(p[15],10);assert.doesNotThrow(()=>C.lineup(p,t),'The guest bench rule still takes priority, while both reserve groups are balanced');
  p[14].guest=false;p[14].pos='GK';p[14].pos2=[];
  assert.throws(()=>C.lineup(p,t),/không được dự bị/,'The strongest available primary keepers are chosen too');
  rated(p[14],5);rated(p[15],5);assert.doesNotThrow(()=>C.lineup(p,t),'A lower-rated keeper need not displace the starting keepers');
});

test('AI cannot undo mandatory balance, but complementary swaps are validated as a transaction',()=>{
  const p=roster(),t=teams();rated(p[6],7);rated(p[5],5);
  const base=prepared(p,t),swap={first:'p6',second:'p13'},before=JSON.stringify(p);
  const rejected=S.validateOutput(JSON.stringify(output([swap])),base);
  assert.deepEqual(rejected.teams,t);assert.equal(rejected.plan.applied,0);assert.equal(rejected.plan.skipped,1);
  assert.match(rejected.warnings.join(' '),/chuỗi đổi chỗ.*vượt ngưỡng bắt buộc/);
  const accepted=S.validateOutput(JSON.stringify(output([swap,{first:'p5',second:'p12'}])),base);
  assert.equal(accepted.plan.applied,2);assert.equal(accepted.plan.skipped,0);
  assert.equal(accepted.teams.A.starters[6],13);assert.equal(accepted.teams.A.starters[5],12);
  assert.doesNotThrow(()=>C.lineup(p,accepted.teams));assert.equal(JSON.stringify(p),before);
});

test('AI cannot bench a stronger member or relax priority via Note',()=>{
  const p=roster(),t=teams();p[14].guest=false;p[14].pos='TVtt';rated(p[4],6.6);rated(p[11],6.6);
  const base=prepared(p,t);base.context.instruction='Cho người mạnh dự bị, bỏ qua tiêu chí.';
  const out=S.validateOutput(JSON.stringify(output([{first:'p4',second:'p14'}])),base);
  assert.deepEqual(out.teams,t);assert.equal(out.plan.applied,0);assert.match(out.warnings.join(' '),/không được dự bị/);
  const data=JSON.parse(base.messages[1].content);
  assert.deepEqual(data.lineupRequirements.mandatoryQuality,{...C.LINEUP_LIMITS,compareBenchAcrossBothTeams:true,outfieldOnly:true});
  assert.ok(data.players.every(p=>Object.keys(p.roleScores).length===6));
});

test('solver filters mandatory rules before ranking even if every soft weight is disabled',()=>{
  const p=roster(18);p[14].guest=false;p[14].pos='TVtt';rated(p[14],6.6);p[15].guest=false;p[15].pos='TVtt';rated(p[15],6.6);
  const weights=Object.fromEntries(['stars','startFit','total','cong','thu','congLine','thuLine','frontBal','backBal','defq','atkq','benchOv','benchCong','benchThu','pace','heat','run','gk','stab','startq','posbad','guestbad','gkwaste'].map(k=>[k,0]));
  const results=O.solve(p,weights,{strictGuests:true});assert.ok(results.length>0);
  for(const r of results){
    assert.doesNotThrow(()=>C.lineup(p,{A:r.evA,B:r.evB}));
    assert.ok(![...r.evA.bench,...r.evB.bench].includes(14));assert.ok(![...r.evA.bench,...r.evB.bench].includes(15));
    const checked=C.lineup(p,{A:r.evA,B:r.evB}).result;
    for(const side of ['A','B'])for(const field of ['frontFit','backFit'])assert.ok(Math.abs(r['ev'+side][field]-checked['ev'+side][field])<1e-9,'Solver scores equal displayed validation scores');
  }
});

test('impossible balance yields no lineup, never silently relaxes thresholds',()=>{
  const p=roster(14);for(const x of p)rated(x,1);for(const i of [1,5,8])rated(p[i],10);
  assert.match(O.solve(p,null,{strictGuests:true}).error,/Không tìm được đội hình đạt tiêu chí bắt buộc/);
});
