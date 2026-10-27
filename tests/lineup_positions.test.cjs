'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/ai_context.js'),O=require('../src/optimizer.js'),S=require('../src/ai_service.js');
const {candidatesFor}=require('./lineup_fixture.cjs');
const roster=(n=16)=>Array.from({length:n},(_,i)=>({n:'Position '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const teams=()=>({A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}});
const context=(p,t=teams(),instruction='')=>({players:p,history:[],rosterNames:p.map(x=>x.n),lineupCandidates:candidatesFor(t),instruction});
const output=swaps=>JSON.stringify({title:'Position fixture',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Fake content.'})),candidateId:'c0',flipTeams:false,swaps});
const exchange=(t,a,b)=>{const next=structuredClone(t);for(const side of ['A','B'])for(const key of ['starters','bench'])next[side][key]=next[side][key].map(i=>i===a?b:i===b?a:i);return next;};

test('balanced scores cannot turn a striker into a central midfielder',()=>{
  const p=roster(),t=teams(),wrong=exchange(t,4,6);
  assert.throws(()=>C.lineup(p,wrong),/Position 6.*không được xếp tiền vệ trung tâm/);
  assert.throws(()=>S.prepare({task:'lineup',context:context(p,wrong)}),/không được xếp/,'No paid call with an invalid base');
  const prepared=S.prepare({task:'lineup',context:context(p,t)});
  assert.throws(()=>S.validateOutput(output([{first:'p4',second:'p6'}]),prepared),e=>e.kind==='lineup');
});

test('two natural central midfielders stay on opposite sides and occupy the two center slots',()=>{
  const p=roster();p[4].pos2=['TV'];p[11].pos2=['TV'];p[5].pos2=['TVtt'];p[12].pos2=['TVtt'];
  const wrong=exchange(teams(),5,11);
  assert.throws(()=>C.lineup(p,wrong),/không được xếp tiền vệ trung tâm/,'A secondary CM cannot replace the missing primary CM on B');
  const results=O.solve(p,null,{strictGuests:true});assert.ok(results.length>0);
  for(const r of results){
    for(const side of ['A','B']){
      const e=r['ev'+side];assert.equal(p[e.starters[4]].pos,'TVtt');
      assert.equal([...e.starters,...e.bench].filter(i=>p[i].pos==='TVtt'&&!p[i].guest).length,1);
    }
    assert.doesNotThrow(()=>C.lineup(p,{A:r.evA,B:r.evB}));
  }
});

test('extra primary central midfielders are distributed, including benches',()=>{
  const p=roster(18);p.forEach(x=>x.guest=false);p[14].pos='TVtt';p[16].pos='TVtt';
  const wrong={A:{starters:[0,1,2,3,4,5,6],bench:[14,16]},B:{starters:[7,8,9,10,11,12,13],bench:[15,17]}};
  assert.throws(()=>C.lineup(p,wrong),/Tiền vệ trung tâm chính đang dồn một bên/);
  const valid={A:{...wrong.A,bench:[14,15]},B:{...wrong.B,bench:[16,17]}};
  assert.doesNotThrow(()=>C.lineup(p,valid));
});

test('a registered secondary role remains allowed; no profile is rewritten',()=>{
  const p=roster();p[5].pos2=['TĐ'];p[6].pos2=['TV'];const before=JSON.stringify(p);
  assert.doesNotThrow(()=>C.lineup(p,exchange(teams(),5,6)));assert.equal(JSON.stringify(p),before);
  p[11].pos='TV';p[11].pos2=['TVtt'];
  assert.doesNotThrow(()=>C.lineup(p,teams()),'With fewer than two primary CMs, a registered secondary CM may fill in');
});

test('only a clear current Note can authorize an extra role, not AI-supplied overrides',()=>{
  const p=roster();p[4].pos2=['TĐ'];const t=exchange(teams(),4,6),instruction='Position 6 đá giữa';
  assert.throws(()=>C.lineup(p,t),/không được xếp/);
  assert.doesNotThrow(()=>C.lineup(p,t,{instruction}));
  const prepared=S.prepare({task:'lineup',context:context(p,t,instruction)});
  const data=JSON.parse(prepared.messages[1].content);assert.deepEqual(data.lineupRequirements.positions.notePositionOverrides,[{playerId:'p6',slot:'TVtt'}]);
  assert.throws(()=>S.validateOutput(output([{first:'p4',second:'p6'}]),prepared),e=>e.kind==='lineup');
  assert.deepEqual(S.validateOutput(output([]),prepared).teams,t,'The Note-authorized candidate must be prepared before the model selects it');
  const fake=context(p);fake.roleOverrides=[{index:6,slot:'TVtt'}];
  assert.throws(()=>S.validateOutput(output([{first:'p4',second:'p6'}]),S.prepare({task:'lineup',context:fake})),e=>e.kind==='lineup');
});

test('a current Note can force an outfield player with TM 0 into goal without mutating the profile',()=>{
  const p=roster();p[0].pos2=['TĐ'];p[6].TM=0;p[7].TM=0.0001;const before=JSON.stringify(p),options={strictGuests:true,instruction:'Position 6 bắt gôn'};
  const guard=C.lineupGuard(p,options);assert.deepEqual(guard.roles.overrides,[{index:6,slot:'GK'}]);assert.deepEqual(guard.priority.forcedStart,[6]);assert.equal(guard.roles.allowed[6][0],true);assert.equal(guard.roles.allowed[6].filter(Boolean).length,1);
  const results=O.solve(p,null,options);assert.ok(results.length>0);
  for(const r of results){
    const keepers=[r.evA.starters[0],r.evB.starters[0]];assert.ok(keepers.includes(6));
    assert.doesNotThrow(()=>C.lineup(p,{A:r.evA,B:r.evB},options));
  }
  assert.equal(JSON.stringify(p),before,'A one-match Note must never rewrite player positions or ratings');
});

test('a keeper comparison in the current Note applies only to the match snapshot',()=>{
  const p=roster();p[0].pos2=['TĐ'];p[6].n='Nguyễn Danh Tuyên';p[6].TM=0;p[15].n='Mạnh Tiến';p[15].pos='GK';p[15].TM=6;
  const before=JSON.stringify(p),names=p.slice(0,14).map(x=>x.n),instruction='Tuyên bắt gôn, chỉ số thủ môn như Mạnh Tiên';
  const applied=C.applyMatchKeeperNote(p,names,instruction),target=applied.players[6],score=C.positionScore(p[15],'GK');
  assert.equal(target.matchGkRating,score);assert.equal(target.matchGkSource,'Mạnh Tiến');assert.equal(target.TM,0);assert.equal(JSON.stringify(p),before);
  assert.equal(C.positionScore(target,'GK'),score);assert.equal(C.positionScore(target,'TĐ'),C.positionScore(p[6],'TĐ'));
  assert.equal(C.player(target).matchGkRating,score);assert.deepEqual(C.applyMatchKeeperNote(p,names,'Tuyên bắt gôn').applied,[]);
  for(const note of ['Tuyên bắt gôn như Mạnh Tiến','Tuyên bắt gôn; chỉ số như Mạnh Tiến'])assert.equal(C.applyMatchKeeperNote(p,names,note).applied[0].rating,score);
  const selected=names.map(n=>applied.players.find(x=>x.n===n)),options={strictGuests:true,instruction},results=O.solve(selected,null,options);assert.ok(results.length>0);
  for(const r of results){const ev=[r.evA,r.evB].find(e=>selected[e.starters[0]].n===target.n);assert.ok(ev);assert.equal(ev.gkFit,score);const checked=C.lineup(selected,{A:r.evA,B:r.evB},options);assert.equal([checked.result.evA,checked.result.evB].find(e=>selected[e.starters[0]].n===target.n).gkFit,score);}
  const context={players:applied.players,rosterNames:names,history:[],instruction,lineupCandidates:candidatesFor({A:results[0].evA,B:results[0].evB})},prepared=S.prepare({task:'lineup',context});
  assert.equal(prepared.context.players.find(x=>x.n===target.n).matchGkRating,score);const data=JSON.parse(prepared.messages[1].content);assert.equal(data.players.find(x=>x.n===target.n).roleScores.GK,score);assert.deepEqual(data.lineupRequirements.keeperRatingOverrides,[{playerId:'p6',source:'Mạnh Tiến',rating:score,scope:'trận này'}]);
});

test('an unclear keeper reference is reported instead of silently disregarded or guessed',()=>{
  const p=roster();p[6].n='Nguyễn Danh Tuyên';p[15].n='Mạnh Tiến';p[15].pos='GK';p[15].TM=6;const names=p.map(x=>x.n);
  assert.throws(()=>C.applyMatchKeeperNote(p,names,'Tuyên bắt gôn; chỉ số thủ môn như không rõ'),/Không xác định duy nhất/);
  p[14].n='Khách (Mạnh Tiến)';p[14].pos='GK';p[14].TM=5;const updatedNames=p.map(x=>x.n);
  assert.equal(C.applyMatchKeeperNote(p,updatedNames,'Tuyên bắt gôn; chỉ số thủ môn như Mạnh Tiến').applied[0].source,'Mạnh Tiến','Exact name wins over a guest suffix');
  assert.throws(()=>C.applyMatchKeeperNote(p,updatedNames,'Tuyên bắt gôn; chỉ số thủ môn như Tiến'),/Không xác định duy nhất/);
});

test('temporary keeper ratings do not change the original top-14 baseline',()=>{
  const p=roster();p.forEach(x=>x.guest=false);p[0].n='Thủ môn A';p[0].TM=1;p[7].n='Thủ môn B';p[7].TM=9;
  const instruction='Thủ môn A bắt gôn; chỉ số thủ môn như Thủ môn B',names=p.map(x=>x.n),before=C.lineupGuard(p,{instruction}).priority.baseFixed;
  const applied=C.applyMatchKeeperNote(p,names,instruction);assert.equal(applied.applied.length,1);
  assert.deepEqual(C.lineupGuard(applied.players,{instruction}).priority.baseFixed,before);
});

test('negative, ambiguous, conflicting and historical Notes cannot grant a role',()=>{
  const p=roster();p[6].n='Nguyễn Danh Tuyên';p[14].n='Khách (Danh Tuyên)';
  for(const instruction of ['Không cho Nguyễn Danh Tuyên đá giữa','Tuyên đá giữa','Nguyễn Danh Tuyên đá giữa; Nguyễn Danh Tuyên đá cánh','Ví dụ Nguyễn Danh Tuyên đá giữa'])assert.deepEqual(C.lineupRoles(p,instruction).overrides,[]);
  assert.deepEqual(C.lineupRoles(p,'Nguyễn Danh Tuyên đá giữa\nPosition 5 đá tiền đạo').overrides,[{index:5,slot:'TĐ'},{index:6,slot:'TVtt'}]);
  assert.deepEqual(C.lineupRoles(p,'Tách hai đội cho cân bằng').overrides,[]);
});

test('no suitable center means no lineup instead of a high-scoring striker assigned there',()=>{
  const p=roster();p[4].pos='TĐ';p[11].pos='TĐ';
  assert.match(O.solve(p,null,{strictGuests:true}).error,/Không tìm được đội hình đạt tiêu chí bắt buộc/);
});

test('a close scored match can supply a missing sweeper role without rewriting the profile',()=>{
  const p=roster();p[8].pos='HV';p[8].pos2=[];const before=JSON.stringify(p),now=2_000;
  const match=score=>({id:'history-sweeper',kickoff:1_000,score,goals:{},goalsLocked:true,teams:{
    A:[{n:p[8].n,slot:'Thòng',bench:false}],B:[]
  }});
  assert.match(O.solve(p,null,{strictGuests:true,history:[match({a:4,b:1})],now}).error,/Không tìm được đội hình/,'A clear result is not role evidence');
  const results=O.solve(p,null,{strictGuests:true,history:[match({a:2,b:2})],now});assert.ok(results.length>0);
  const guard=C.lineupGuard(p,{history:[match({a:2,b:2})],now});
  assert.deepEqual(guard.roles.historical.map(x=>({index:x.index,slot:x.slot,matches:x.matches,draws:x.draws})),[{index:8,slot:'Thòng',matches:1,draws:1}]);
  const chosen=results.find(r=>[r.evA.starters[1],r.evB.starters[1]].includes(8));assert.ok(chosen);
  const checked=C.lineup(p,{A:chosen.evA,B:chosen.evB},{history:[match({a:2,b:2})],now});
  assert.ok(checked.warnings.some(x=>x.includes(p[8].n)&&x.includes('đá Thòng theo 1 trận tham khảo')));
  assert.equal(checked.checks.historyRoles[0].player,p[8].n);assert.equal(JSON.stringify(p),before);
});

test('AI receives only the same verified historical role already accepted by code',()=>{
  const p=roster();p[8].pos='HV';p[8].pos2=[];const t=teams();
  const history=[{id:'history-sweeper',kickoff:1_000,score:{a:3,b:2},goals:{},goalsLocked:true,teams:{A:[{n:p[8].n,slot:'Thòng',bench:false}],B:[]}}];
  const prepared=S.prepare({task:'lineup',context:{players:p,history,rosterNames:p.map(x=>x.n),lineupCandidates:candidatesFor(t),instruction:''}},2_000);
  const data=JSON.parse(prepared.messages[1].content),rule=data.lineupRequirements.positions;
  assert.deepEqual(rule.historyPositionOverrides.map(x=>({playerId:x.playerId,slot:x.slot,matches:x.matches})),[{playerId:'p8',slot:'Thòng',matches:1}]);
  assert.ok(data.players[8].allowedRoles.includes('Thòng'));
});

test('reserve strength uses the same one-decimal ratings shown in the UI',()=>{
  const p=roster(),t=teams();
  p[14].pos='TV';p[14].KT=5;p[14].CH=6;p[14].DD=6;p[14].PN=5;p[14].TC=6;p[14].TL=6;p[14].DN=6;p[14].TD=6;
  const metrics=C.lineupMetrics(p,t);assert.equal(metrics.A.benchTotal,+C.positionScore(p[14],p[14].pos).toFixed(1));
});
