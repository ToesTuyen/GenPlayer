'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/ai_context.js'),O=require('../src/optimizer.js'),S=require('../src/ai_service.js');
const {snapshot}=require('./lineup_snapshot.cjs'),{candidatesFor}=require('./lineup_fixture.cjs');
const rate=(p,v)=>Object.assign(p,Object.fromEntries(C.KEYS.map(k=>[k,v])));
const roster=n=>Array.from({length:n},(_,i)=>rate({n:'Priority '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14},6));
const context=(p,t)=>({players:p,history:[],rosterNames:p.map(x=>x.n),lineupCandidates:candidatesFor(t),instruction:''});
const output=swaps=>JSON.stringify({title:'Priority regression',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Fake test content.'})),candidateId:'c0',flipTeams:false,swaps});

test('two highest-rated primary keepers start before the highest-rated remaining twelve',()=>{
  const p=roster(17);p.forEach(x=>{x.guest=false;rate(x,7);});rate(p[0],9);rate(p[7],5);rate(p[14],6);
  const guard=C.lineupGuard(p),keepers=guard.priority.keepers;assert.deepEqual(keepers,[0,14]);assert.ok(!guard.priority.fixed.includes(7));
  const others=p.map((x,i)=>i).filter(i=>!keepers.includes(i)).sort((a,b)=>guard.priority.primary[b]-guard.priority.primary[a]||a-b).slice(0,12);
  assert.deepEqual(guard.priority.fixed.slice().sort((a,b)=>a-b),[...keepers,...others].sort((a,b)=>a-b));
  assert.equal(guard.roles.allowed[0][0],true);assert.equal(guard.roles.allowed[14][0],true);assert.equal(guard.roles.allowed[7][0],false);
  const benched=C.lineupGuard(p,{instruction:'Priority 0 dự bị'});assert.deepEqual(benched.priority.keepers,[14,7]);assert.ok(!benched.priority.fixed.includes(0));
  const forced=C.lineupGuard(p,{instruction:'Priority 6 bắt gôn'});assert.deepEqual(forced.priority.keepers,[6,0]);assert.ok(forced.priority.fixed.includes(6));
});

test('a secondary registered keeper can fill a shortage, otherwise the exact shortage is reported',()=>{
  const p=roster(16);p.forEach(x=>{x.guest=false;});p[7].pos='TĐ';p[7].pos2=[];p[14].pos='HV';p[14].pos2=[];p[6].pos2=['GK'];
  assert.deepEqual(C.lineupGuard(p).priority.keepers,[0,6]);p[6].pos2=[];
  const blocked=O.solve(p,null,{strictGuests:true});assert.equal(blocked.diagnostics[0].code,'keeper');assert.match(blocked.error,/có 1 thủ môn hợp lệ \(Priority 0\), còn thiếu 1/);
  const forced=C.lineupGuard(p,{instruction:'Priority 6 bắt gôn'});assert.deepEqual(forced.priority.keepers,[6,0]);
  p[0].TM=0;const none=O.solve(p,null,{strictGuests:true});assert.match(none.error,/có 0 thủ môn hợp lệ, còn thiếu 2/);
});

test('the displayed top 14 are fixed before team balancing',()=>{
  const p=snapshot(),before=JSON.stringify(p),options={instruction:'Quang Minh bắt gôn'},results=O.solve(p,null,{strictGuests:true,...options});assert.equal(results.length,12);
  const guard=C.lineupGuard(p,options),fixed=guard.priority.fixed,mustStart=fixed.map(i=>p[i].n),mustBench=p.filter((_,i)=>!fixed.includes(i)).map(x=>x.n);
  const valid={A:structuredClone(results[0].evA),B:structuredClone(results[0].evB)};
  const promptContext=context(p,valid);promptContext.instruction=options.instruction;const prompt=JSON.parse(S.prepare({task:'lineup',context:promptContext}).messages[1].content);assert.equal(prompt.lineupRequirements.starterPriority.keepersFirst,true);assert.equal(prompt.lineupRequirements.starterPriority.remainingStarters,12);assert.deepEqual(prompt.lineupRequirements.starterPriority.keeperPlayerIds,guard.priority.keepers.map(i=>'p'+i));
  let pair;
  for(const side of ['A','B'])for(let k=1;k<7&&!pair;k++)for(const bench of [...valid.A.bench,...valid.B.bench])if(guard.roles.allowed[bench][k]){pair={starter:valid[side].starters[k],bench};break;}
  assert.ok(pair);const invalid=structuredClone(valid);
  for(const side of ['A','B'])for(const key of ['starters','bench'])invalid[side][key]=invalid[side][key].map(i=>i===pair.starter?pair.bench:i===pair.bench?pair.starter:i);
  assert.throws(()=>C.lineup(p,invalid,options),/thuộc nhóm 14 sau khi áp dụng Note và xếp điểm/);
  const invalidContext=context(p,invalid);invalidContext.instruction=options.instruction;
  assert.throws(()=>S.prepare({task:'lineup',context:invalidContext}),/thuộc nhóm 14 sau khi áp dụng Note và xếp điểm/,'No paid call can start from a base that benches a top-14 player');
  for(const r of results){
    const t={A:r.evA,B:r.evB},checked=C.lineup(p,t,options),names=[...t.A.starters,...t.B.starters].map(i=>p[i].n);
    for(const name of mustStart)assert.ok(names.includes(name),name+' must start');
    for(const name of mustBench)assert.ok(!names.includes(name),name+' must bench');
    const upper=fixed.reduce((s,i)=>s+Number(C.positionScore(p[i],p[i].pos).toFixed(1)),0);
    assert.ok(Math.abs(checked.checks.priority.strength-upper)<1e-9);
    assert.ok(checked.checks.metrics.benchGroups.every(g=>g.gap<=C.LINEUP_LIMITS.benchMeanDifference+1e-9));
  }
  assert.equal(JSON.stringify(p),before,'No profile or rating is rewritten');
});

test('weakest reserve cannot hide two stronger reserves concentrated on one side',()=>{
  const p=roster(20),t={A:{starters:[0,1,2,3,4,5,6],bench:[14,16,18]},B:{starters:[7,8,9,10,11,12,13],bench:[15,17,19]}};
  [14,16].forEach(i=>rate(p[i],8.8));rate(p[18],3);rate(p[15],7);[17,19].forEach(i=>rate(p[i],6));
  const m=C.lineupMetrics(p,t);assert.ok(m.difference.benchMean<2);assert.ok(m.benchGroups[0].gap<=2);assert.ok(m.benchGroups[1].gap>2);
  assert.throws(()=>C.lineup(p,t),/nhóm 2 người mạnh nhất.*không lấy người yếu/);
  const good=structuredClone(t);[good.A.bench[1],good.B.bench[0]]=[good.B.bench[0],good.A.bench[1]];
  assert.doesNotThrow(()=>C.lineup(p,good));
  const prepared=S.prepare({task:'lineup',context:context(p,good)});
  assert.throws(()=>S.validateOutput(output([{first:'p16',second:'p15'}]),prepared),e=>e.kind==='lineup');
  const data=JSON.parse(prepared.messages[1].content);assert.equal(data.lineupRequirements.reserveStrength.strongestPrefixes,true);assert.equal(data.lineupRequirements.reserveStrength.meanDifference,2);
});

test('a raw displayed top-14 cut is never replaced by lower-rated specialists',()=>{
  const p=roster(16);p.forEach(x=>x.guest=false);p[14].pos='Thòng';p[15].pos='Thòng';rate(p[14],8);rate(p[15],8);
  const blocked=O.solve(p,null,{strictGuests:true});assert.equal(blocked.code,'no-valid-lineup');assert.match(blocked.error,/Nguyên nhân: Nhóm ưu tiên gồm 2 thủ môn và 12 cầu thủ/);assert.match(blocked.error,/\nGiải pháp: Kiểm tra lại danh sách/);
  p[14].pos2=['TV'];p[15].pos2=['TĐ'];
  const r=O.solve(p,null,{strictGuests:true});assert.ok(r.length>0);
  const fixed=C.lineupGuard(p).priority.fixed;
  for(const x of r){const starters=[...x.evA.starters,...x.evB.starters];assert.deepEqual(starters.slice().sort((a,b)=>a-b),fixed.slice().sort((a,b)=>a-b));}
});

test('an explicit current Note can bench a top-14 member and promotes the strongest remaining player',()=>{
  const p=roster(16);p[14].pos='TĐ';rate(p[14],6.5);const options={strictGuests:true,instruction:'Priority 13 dự bị'};
  const guard=C.lineupGuard(p,options);assert.ok(guard.priority.baseFixed.includes(13),'Original top 14 is computed before Note');assert.ok(!guard.priority.baseFixed.includes(14),'Guest starts outside the original member top 14');
  assert.deepEqual(guard.priority.forcedBench,[13]);assert.ok(!guard.priority.fixed.includes(13));assert.ok(guard.priority.fixed.includes(14),'The strongest eligible reserve replaces the Note-benched player');
  const results=O.solve(p,null,options);assert.ok(results.length>0);
  for(const r of results){
    const starters=[...r.evA.starters,...r.evB.starters];assert.ok(starters.includes(14));assert.ok(!starters.includes(13));
    assert.doesNotThrow(()=>C.lineup(p,{A:r.evA,B:r.evB},options));
  }
  assert.equal(C.lineupGuard(p,{instruction:'Priority 13 không dự bị'}).priority.forcedBench.length,0,'A negative Note must not create an override');
});

test('AI cannot bench a top-14 member after selecting a valid base',()=>{
  const p=roster(16),r=O.solve(p,null,{strictGuests:true})[0],t={A:r.evA,B:r.evB};
  const bench=[...t.A.bench,...t.B.bench][0],starter=[...t.A.starters,...t.B.starters][0];
  assert.throws(()=>S.validateOutput(output([{first:'p'+bench,second:'p'+starter}]),S.prepare({task:'lineup',context:context(p,t)})),e=>e.kind==='lineup');
});

test('starting selection agrees with an independent role-count upper bound on a small flexible roster',()=>{
  const p=roster(16);p.forEach((x,i)=>{x.guest=false;if(i>=14)x.pos='HV';});
  for(let i=0;i<p.length;i++)rate(p[i],5+(i%5)/10);
  // This roster has exactly the required pair in every role except HV, so
  // both keepers/sweepers/CMs/wingers/strikers plus the top four HVs must start.
  const required=p.map((x,i)=>({x,i})).filter(({x})=>x.pos!=='HV').map(({i})=>i);
  const fullbacks=p.map((x,i)=>({x,i})).filter(({x})=>x.pos==='HV').sort((a,b)=>C.positionScore(b.x,b.x.pos)-C.positionScore(a.x,a.x.pos)).slice(0,4).map(({i})=>i);
  const expected=[...required,...fullbacks].reduce((s,i)=>s+Number(C.positionScore(p[i],p[i].pos).toFixed(1)),0);
  assert.ok(Math.abs(C.lineupGuard(p).priority.best.strength-expected)<1e-9);
});
