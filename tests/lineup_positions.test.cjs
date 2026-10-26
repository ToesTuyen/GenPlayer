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
  const prepared=S.prepare({task:'lineup',context:context(p,teams(),instruction)});
  const data=JSON.parse(prepared.messages[1].content);assert.deepEqual(data.lineupRequirements.positions.notePositionOverrides,[{playerId:'p6',slot:'TVtt'}]);
  assert.throws(()=>S.validateOutput(output([{first:'p4',second:'p6'}]),prepared),e=>e.kind==='lineup');
  const selected=S.prepare({task:'lineup',context:context(p,t,instruction)});
  assert.deepEqual(S.validateOutput(output([]),selected).teams,t,'The Note-authorized candidate must be prepared before the model selects it');
  const fake=context(p);fake.roleOverrides=[{index:6,slot:'TVtt'}];
  assert.throws(()=>S.validateOutput(output([{first:'p4',second:'p6'}]),S.prepare({task:'lineup',context:fake})),e=>e.kind==='lineup');
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
