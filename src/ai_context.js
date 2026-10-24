/* Shared, pure football context. No credentials, finance, Firebase or DOM. */
(function(root){
  'use strict';
  const SLOTS=['GK','Thòng','HV','HV','TVtt','TV','TĐ'];
  const KEYS=['KT','CH','DD','PN','TC','TL','DN','TD','OD','TM'];
  const validSlot=v=>typeof v==='string'&&SLOTS.includes(v);
  const WEIGHTS={GK:{TM:7,PN:1.5,TD:1,TL:.5},'Thòng':{PN:3,TD:2,DN:1.2,TL:1.2,CH:.8,KT:.6},HV:{PN:2.2,TC:2,TL:1.5,DN:1.2,KT:.9,CH:.9,TD:.9},TVtt:{CH:2.3,TD:2,KT:1.6,TL:1.1,DN:1,PN:1,DD:.7},TV:{TC:1.9,KT:1.9,DD:1.4,CH:1.3,TL:1.1,DN:1,TD:.8},'TĐ':{DD:3,KT:1.6,TC:1.5,DN:1.1,TD:.9,CH:.6}};
  function fail(s){throw new Error(s);}
  function text(v,max=160){if(typeof v!=='string'||!v.trim()||v.length>max)fail('Nội dung chữ không hợp lệ.');return v.trim();}
  function num(v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('Chỉ số ngoài phạm vi.');return v;}
  function player(p){
    if(!p||typeof p!=='object')fail('Thiếu dữ liệu cầu thủ.');
    const out={n:text(p.n),pos:validSlot(p.pos)?p.pos:'',pos2:[],guest:p.guest===true};
    out.pos2=Array.isArray(p.pos2)?[...new Set(p.pos2.filter(validSlot))]:[];
    for(const k of KEYS)out[k]=num(p[k]===undefined?0:p[k],0,10);
    if(p.likeOf)out.likeOf=text(p.likeOf);
    return out;
  }
  function positionScore(p,slot){const w=validSlot(slot)?WEIGHTS[slot]:{KT:1,CH:1,DD:1,PN:1,TC:1,TL:1,DN:1,TD:1};return Object.keys(w).reduce((s,k)=>s+p[k]*w[k],0)/Object.values(w).reduce((s,n)=>s+n,0);}
  function match(m){
    if(!m||!m.teams)fail('Thiếu đội hình trận.');
    const out={id:text(String(m.id),80),kickoff:num(m.kickoff||0,0,9e15),teams:{},score:null,goals:{},goalsLocked:m.goalsLocked===true};
    const names=new Set();
    for(const side of ['A','B']){
      if(!Array.isArray(m.teams[side])||m.teams[side].length>30)fail('Đội hình trận không hợp lệ.');
      out.teams[side]=m.teams[side].map(p=>{
        const name=text(p.n);if(names.has(name))fail('Trùng cầu thủ trong trận.');names.add(name);
        return {n:name,slot:validSlot(p.slot)?p.slot:'',bench:p.bench===true,rating:p.rating===undefined||p.rating===null?null:num(p.rating,0,10)};
      });
    }
    if(m.score){out.score={a:num(m.score.a,0,100),b:num(m.score.b,0,100)};}
    for(const n of names){const g=m.goals&&m.goals[n];if(typeof g==='number'&&g>0)out.goals[n]=num(g,0,100);}
    return out;
  }
  function normalize(input){
    if(!input||!Array.isArray(input.players)||input.players.length>80||!Array.isArray(input.history)||input.history.length>500)fail('Dữ liệu AI không hợp lệ (tối đa 80 cầu thủ, 500 trận).');
    const players=input.players.map(player);if(new Set(players.map(p=>p.n)).size!==players.length)fail('Tên cầu thủ bị trùng.');
    const history=input.history.map(match).sort((a,b)=>b.kickoff-a.kickoff);
    if(new Set(history.map(m=>m.id)).size!==history.length)fail('Trùng mã trận.');
    const selected=Array.isArray(input.rosterNames)?input.rosterNames.map(n=>text(n)):[];
    if(selected.length>24||new Set(selected).size!==selected.length||selected.some(n=>!players.some(p=>p.n===n)))fail('Danh sách chọn không hợp lệ.');
    return {players,history,rosterNames:selected,match:input.match?match(input.match):null,playerName:input.playerName?text(input.playerName):'',instruction:input.instruction?text(input.instruction,2000):''};
  }
  function form(name,history,now=Date.now()){
    const done=history.filter(m=>m.score&&m.kickoff<=now),recent=done.slice(0,5);
    const result=m=>{const s=m.teams.A.some(p=>p.n===name)?'A':m.teams.B.some(p=>p.n===name)?'B':null;if(!s)return null;return m.score.a===m.score.b?'D':((m.score.a>m.score.b)===(s==='A')?'W':'L');};
    const results=done.map(result).filter(Boolean), streak=r=>{let c=0;for(const x of results){if(x!==r)break;c++;}return c;};
    const recentResults=recent.map(result),played=recentResults.filter(Boolean).length;
    const goals=ms=>ms.reduce((s,m)=>s+(result(m)?m.goals[name]||0:0),0);
    return {played:results.length,wins:results.filter(x=>x==='W').length,draws:results.filter(x=>x==='D').length,losses:results.filter(x=>x==='L').length,goalsRecorded:goals(done),winStreak:streak('W'),lossStreak:streak('L'),recent:{teamMatches:recent.length,played,absent:recent.length-played,wins:recentResults.filter(x=>x==='W').length,draws:recentResults.filter(x=>x==='D').length,losses:recentResults.filter(x=>x==='L').length,goalsRecorded:goals(recent),resultsOldestFirst:recentResults.slice().reverse(),unlockedGoalRecords:recent.filter(m=>!m.goalsLocked).length}};
  }
  function compactLegacy(r){
    const teams={A:[],B:[]},sub=r.subset||[];
    for(const side of ['A','B']){
      const e=r.result&&r.result['ev'+side];if(!e)continue;
      (e.starters||[]).forEach((i,k)=>{if(sub[i]){
        const slot=(e.starters.length===6?['GK','HV','Thòng','HV','TV','TĐ']:SLOTS)[k],p=player(sub[i]);
        const rating=k===0&&e.gkRated===false?null:k===0&&e.gkRated===true?e.gkFit:positionScore(p,e.ratingsByRole?slot:p.pos);
        teams[side].push({n:p.n,slot,bench:false,rating});
      }});
      (e.bench||[]).forEach(i=>{if(sub[i]){const p=player(sub[i]);teams[side].push({n:p.n,slot:'',bench:true,rating:positionScore(p,p.pos)});}});
    }
    return match({id:r.id,kickoff:r.kickoff||r.id,teams,score:r.score,goals:r.goals,goalsLocked:!!(r.goalsLocked||r.goalsFinalized)});
  }
  function lineup(players,teams){
    if(!Array.isArray(players)||players.length<14||players.length>24)fail('Chia đội AI hiện hỗ trợ sân 7, từ 14–24 người.');
    const used=[];
    for(const side of ['A','B']){
      const t=teams&&teams[side];if(!t||!Array.isArray(t.starters)||t.starters.length!==7||!Array.isArray(t.bench))fail('Mỗi đội phải có đúng 7 cầu thủ đá chính.');
      for(const i of [...t.starters,...t.bench]){if(!Number.isInteger(i)||i<0||i>=players.length)fail('AI trả về cầu thủ ngoài danh sách.');used.push(i);}
    }
    if(used.length!==players.length||new Set(used).size!==players.length)fail('AI bỏ sót hoặc xếp trùng cầu thủ.');
    if(Math.abs(teams.A.bench.length-teams.B.bench.length)>1)fail('Số dự bị hai đội chênh lệch quá nhiều.');
    const members=players.filter(p=>!p.guest).length;
    if(members>=14&&[...teams.A.starters,...teams.B.starters].some(i=>players[i].guest))fail('Khách phải dự bị khi đủ 14 thành viên. Hãy tạo lại.');
    const guestCount=side=>[...teams[side].starters,...teams[side].bench].filter(i=>players[i].guest).length;
    if(Math.abs(guestCount('A')-guestCount('B'))>1)fail('Cần chia khách đều hai bên. Hãy tạo lại.');
    const evaluate=t=>{
      const ps=idx=>idx.map(i=>players[i]),mean=(idx,f)=>idx.length?ps(idx).reduce((s,p)=>s+f(p),0)/idx.length:0;
      const backs=t.starters.slice(1,4),fronts=t.starters.slice(4),scores=t.starters.map((i,k)=>positionScore(players[i],SLOTS[k]));
      const startFit=scores.reduce((a,b)=>a+b,0),benchOv=ps(t.bench).reduce((s,p)=>s+positionScore(p,p.pos),0);
      return {starters:t.starters.slice(),bench:t.bench.slice(),startFit,benchOv,total:startFit+benchOv,gkFit:scores[0],gkRated:true,ratingsByRole:true,pairedBenchComparison:true,frontFit:scores.slice(4).reduce((a,b)=>a+b,0),backFit:scores.slice(1,4).reduce((a,b)=>a+b,0),defPN:mean(backs,p=>p.PN),atk:mean(fronts,p=>p.DD),def7:mean(t.starters,p=>p.PN),atk7:mean(t.starters,p=>p.DD),defOv:mean(backs,p=>positionScore(p,p.pos)),atkOv:mean(fronts,p=>positionScore(p,p.pos)),benchDef:mean(t.bench,p=>p.PN),benchAtk:mean(t.bench,p=>p.DD),pace:mean(t.starters,p=>p.TC),heat:mean(t.starters,p=>p.DN),stars:ps([...t.starters,...t.bench]).filter(p=>positionScore(p,p.pos)>=8).length};
    };
    const evA=evaluate(teams.A),evB=evaluate(teams.B),warnings=[];
    for(const [key,label] of [['frontFit','tuyến trên'],['backFit','hàng thủ']])if(Math.abs(evA[key]-evB[key])>1.5)warnings.push(`Chênh ${label} ${Math.abs(evA[key]-evB[key]).toFixed(1)} điểm; cần kiểm tra bảng so kè.`);
    for(const side of ['A','B'])teams[side].starters.forEach((i,k)=>{const p=players[i];if(p.pos&&p.pos!==SLOTS[k]&&!p.pos2.includes(SLOTS[k]))warnings.push(`${p.n}: đang xếp ngoài vị trí đăng ký (${SLOTS[k]}).`);});
    for(const side of ['A','B'])for(const i of teams[side].bench){const p=players[i];if(p.guest)continue;const weaker=teams[side].starters.find((j,k)=>k>0&&(p.pos===SLOTS[k]||p.pos2.includes(SLOTS[k]))&&positionScore(p,SLOTS[k])-positionScore(players[j],SLOTS[k])>=.5);if(weaker!==undefined)warnings.push(`${p.n}: dự bị dù điểm vị trí cao hơn ${players[weaker].n}; kiểm tra ưu tiên người mạnh đá chính.`);}
    return {result:{A:[...teams.A.starters,...teams.A.bench],B:[...teams.B.starters,...teams.B.bench],evA,evB,J:0},warnings};
  }
  const api={SLOTS,KEYS,player,match,normalize,form,compactLegacy,lineup,positionScore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GPAIContext=api;
})(typeof window==='undefined'?globalThis:window);
