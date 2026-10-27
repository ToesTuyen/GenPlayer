/* Shared, pure football context. No credentials, finance, Firebase or DOM. */
(function(root){
  'use strict';
  const SLOTS=['GK','Thòng','HV','HV','TVtt','TV','TĐ'];
  const KEYS=['KT','CH','DD','PN','TC','TL','DN','TD','OD','TM'];
  const LINEUP_LIMITS=Object.freeze({lineDifference:1.5,benchAdvantage:0.5,benchMeanDifference:2,strengthDifference:2,starThreshold:8,starDifference:1,paceDifference:0.5,staminaDifference:0.5,previousTeammates:4});
  const ROLE_LABELS={GK:'thủ môn','Thòng':'thòng',HV:'hậu vệ',TVtt:'tiền vệ trung tâm',TV:'tiền vệ cánh','TĐ':'tiền đạo'};
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
  // Exact role matching is also used to choose WHO starts, before balancing
  // teams. Looking only for a direct bench -> starter replacement misses role
  // chains (e.g. stronger sweeper in, current sweeper to full-back).
  function minimumAssignment(cost){
    const n=cost.length,u=new Array(n+1).fill(0),v=new Array(n+1).fill(0),p=new Array(n+1).fill(0),way=new Array(n+1).fill(0);
    for(let i=1;i<=n;i++){
      p[0]=i;let j0=0;
      const minv=new Array(n+1).fill(Infinity),used=new Array(n+1).fill(false);
      do{
        used[j0]=true;const i0=p[j0];let delta=Infinity,j1=-1;
        for(let j=1;j<=n;j++)if(!used[j]){
          const cur=cost[i0-1][j-1]-u[i0]-v[j];
          if(cur<minv[j]){minv[j]=cur;way[j]=j0;}
          if(minv[j]<delta){delta=minv[j];j1=j;}
        }
        for(let j=0;j<=n;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minv[j]-=delta;
        j0=j1;
      }while(p[j0]!==0);
      do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
    }
    const ans=new Array(n);for(let j=1;j<=n;j++)ans[p[j]-1]=j-1;return ans;
  }
  // Only a clear, positive position instruction for one unambiguous player can
  // authorize an extra role. Model-supplied role overrides are never trusted.
  function lineupRoles(players,instruction=''){
    const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
    const names=players.map(p=>norm(p.n)),escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const patterns={GK:'thu mon|gon|khung thanh','Thòng':'thong|trung ve',HV:'hau ve canh|hau ve bien|hau ve|hau canh|hau bien',TVtt:'tien ve trung tam|tien ve giua|tvtt|trung tam|giua',TV:'tien ve canh|tv canh|canh','TĐ':'tien dao|td|cam'};
    const found=new Map(),benchOverrides=new Set(),clauses=typeof instruction==='string'?instruction.split(/[;,.!?\n]+/).map(norm).filter(Boolean):[];
    for(let i=0;i<players.length;i++){
      const words=names[i].split(' '),aliases=words.map((_,k)=>words.slice(k).join(' ')).filter(a=>names.filter(n=>n===a||n.endsWith(' '+a)).length===1);
      for(const [slot,pattern] of Object.entries(patterns))for(const clause of clauses){
        const match=aliases.some(a=>new RegExp('^(?:(?:cho|de|xep) )?'+escape(a)+' (?:uu tien )?(?:(?:sang da|xep o|da|choi|bat|giu|o) )?(?:'+pattern+')(?: (?:team|doi|ben) [ab])?(?: nhe| di)?$').test(clause.trim()));
        if(match){if(!found.has(i))found.set(i,new Set());found.get(i).add(slot);}
      }
      for(const clause of clauses){
        const match=aliases.some(a=>new RegExp('^(?:(?:cho|de|xep) )?(?:cau thu )?'+escape(a)+' (?:uu tien )?(?:du bi|ngoi du bi)(?: nhe| di)?$').test(clause.trim()));
        if(match)benchOverrides.add(i);
      }
    }
    const overrides=[...found].filter(([,slots])=>slots.size===1).map(([index,slots])=>({index,slot:[...slots][0]}));
    const extra=new Map(overrides.map(x=>[x.index,x.slot])),centers=players.flatMap((p,i)=>!p.guest&&p.pos==='TVtt'?[i]:[]);
    const keeperCount=players.filter(p=>!p.guest&&p.pos==='GK').length;
    const allowed=players.map((p,i)=>SLOTS.map(slot=>{
      // A clear Note is an instruction for this draft, not merely permission:
      // the named player must use that role. It never mutates the profile.
      if(extra.has(i))return slot===extra.get(i);
      const declared=p.pos===slot||(p.pos2||[]).includes(slot),explicit=extra.get(i)===slot;
      if(slot==='GK')return (p.TM||0)>0&&(keeperCount>=2?p.pos==='GK'&&!p.guest:declared||keeperCount<2);
      if(slot==='TVtt'&&centers.length>=2)return p.pos==='TVtt'||explicit;
      return declared||explicit;
    }));
    return {allowed,centers,overrides,benchOverrides:[...benchOverrides],historical:[]};
  }
  // Lịch sử chỉ mở thêm vai trò Thòng khi nhóm vị trí đăng ký/Note hiện tại
  // không thể lấp đủ 14 chỗ. Một lần đá Thòng ở trận đã có tỉ số hòa hoặc
  // chênh tối đa một bàn là bằng chứng tham khảo; trận thắng/thua đậm không
  // được dùng để hợp thức hóa vị trí. Hồ sơ cầu thủ tuyệt đối không bị sửa.
  function historicalSweeperRoles(players,history=[],now=Date.now()){
    const byName=new Map(players.map((p,i)=>[p.n,i])),evidence=new Map();
    for(const m of Array.isArray(history)?history:[]){
      if(!m?.score||!(m.kickoff>0)||m.kickoff>now||Math.abs(m.score.a-m.score.b)>1)continue;
      for(const side of ['A','B'])for(const entry of m.teams?.[side]||[]){
        if(entry?.bench||entry?.slot!=='Thòng')continue;
        const index=byName.get(entry.n);if(index===undefined||players[index].guest)continue;
        if(players[index].pos==='Thòng'||players[index].pos2?.includes('Thòng'))continue;
        if(!evidence.has(index))evidence.set(index,[]);
        evidence.get(index).push({id:m.id,kickoff:m.kickoff,score:{a:m.score.a,b:m.score.b}});
      }
    }
    return [...evidence].map(([index,matches])=>({index,slot:'Thòng',matches:matches.length,draws:matches.filter(m=>m.score.a===m.score.b).length,samples:matches.slice(0,3)}));
  }
  function priorityReader(players,roles){
    // Ranking follows the one-decimal overall shown on player cards and the
    // pitch; hidden floating-point fractions must never move someone across
    // the 14th-place boundary.
    const primary=players.map(p=>+positionScore(p,p.pos).toFixed(1)),forcedBench=new Set(roles.benchOverrides||[]),forcedStart=new Set((roles.overrides||[]).map(x=>x.index));
    // First establish the original top 14 from the displayed one-decimal
    // rating. Only afterwards may the current Note alter that base: a forced
    // reserve is removed, a forced role is inserted, and the strongest
    // remaining eligible reserve fills any vacancy. This preserves an explicit
    // before/after audit instead of silently applying Note before ranking.
    const members=players.filter(p=>!p.guest).length;
    const baseEligible=players.flatMap((p,i)=>members>=14&&p.guest?[]:[i]);
    const baseRanked=baseEligible.slice().sort((a,b)=>primary[b]-primary[a]||a-b),baseFixed=baseRanked.slice(0,14);
    const conflictingNote=[...forcedBench].filter(i=>forcedStart.has(i));
    const availableMembers=players.filter((p,i)=>!p.guest&&!forcedBench.has(i)).length;
    const eligible=players.flatMap((p,i)=>forcedBench.has(i)||(availableMembers>=14&&p.guest&&!forcedStart.has(i))?[]:[i]);
    const ranked=eligible.slice().sort((a,b)=>primary[b]-primary[a]||a-b),required=ranked.filter(i=>forcedStart.has(i));
    const fixed=[...required,...ranked.filter(i=>!forcedStart.has(i))].slice(0,14).sort((a,b)=>primary[b]-primary[a]||a-b),fixedSet=new Set(fixed);
    function assign(selected,slots){
      if(selected.length!==slots.length)return null;
      const cost=selected.map(i=>slots.map(k=>roles.allowed[i][k]?-primary[i]:1e6));
      const ans=minimumAssignment(cost);
      for(let r=0;r<selected.length;r++)if(cost[r][ans[r]]>=1e6)return null;
      return {starters:selected.slice(),value:selected.reduce((s,i)=>s+primary[i],0),strength:selected.reduce((s,i)=>s+primary[i],0),members:selected.filter(i=>!players[i].guest).length};
    }
    const best=conflictingNote.length||required.length>14?null:assign(fixed,[0,1,2,3,4,5,6,0,1,2,3,4,5,6]);
    return {
      best,primary,baseRanked,baseFixed,ranked,fixed,forcedBench:[...forcedBench],forcedStart:[...forcedStart],availableMembers,conflictingNote,
      value:idx=>idx.reduce((s,i)=>s+primary[i],0),
      chooseTeam:team=>assign(team.filter(i=>fixedSet.has(i)),[0,1,2,3,4,5,6])
    };
  }
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
  function metricReader(players,scores=players.map(p=>SLOTS.map(slot=>positionScore(p,slot)))){
    const primary=players.map(p=>positionScore(p,p.pos));
    // Dự bị được hiển thị và người dùng so theo một chữ số thập phân. Dùng
    // đúng mức điểm nhìn thấy để 5.9 so với 5.4 được hiểu là chênh 0.5, không
    // âm thầm loại vì phần lẻ ẩn 0.508865...
    const benchRating=players.map((p,i)=>+primary[i].toFixed(1));
    const sum=(a,f)=>a.reduce((s,i)=>s+f(i),0),mean=(a,f)=>a.length?sum(a,f)/a.length:0;
    return teams=>{
      const benchCount=Math.min(teams.A.bench.length,teams.B.bench.length),out={benchCount};
      for(const side of ['A','B']){
        const t=teams[side],bench=t.bench.slice().sort((a,b)=>primary[b]-primary[a]||players[a].n.localeCompare(players[b].n)).slice(0,benchCount);
        const field=t.starters.slice(1),pool=[...field,...bench],star=i=>primary[i]>=LINEUP_LIMITS.starThreshold?1:0;
        const start=t.starters.reduce((s,i,k)=>s+scores[i][k],0),benchTotal=sum(bench,i=>benchRating[i]);
        out[side]={bench,benchTotal,benchMean:benchCount?benchTotal/benchCount:0,benchAttack:mean(bench,i=>players[i].DD),benchDefense:mean(bench,i=>players[i].PN),start,total:start+benchTotal,stars:sum(t.starters,star),benchStars:sum(bench,star),totalStars:sum([...t.starters,...bench],star),pace:mean(field,i=>players[i].TC),stamina:mean(field,i=>players[i].TL),benchPace:mean(bench,i=>players[i].TC),benchStamina:mean(bench,i=>players[i].TL),totalPace:mean(pool,i=>players[i].TC),totalStamina:mean(pool,i=>players[i].TL)};
      }
      let a=0,b=0;
      out.benchGroups=Array.from({length:benchCount},(_,k)=>{a+=benchRating[out.A.bench[k]];b+=benchRating[out.B.bench[k]];return {count:k+1,A:a/(k+1),B:b/(k+1),gap:Math.abs(a-b)/(k+1)};});
      out.benchMaxGroupDifference=Math.max(0,...out.benchGroups.map(g=>g.gap));
      out.difference=Object.fromEntries(['benchMean','start','total','stars','benchStars','totalStars','pace','stamina','benchPace','benchStamina','totalPace','totalStamina'].map(k=>[k,Math.abs(out.A[k]-out.B[k])]));
      return out;
    };
  }
  function lineupMetrics(players,teams){return metricReader(players)(teams);}
  // Compare the actual starting groups, not colors, bench ordering or the two
  // equivalent full-back seats. Used by BOTH candidate search and final checks.
  function lineupGroupKey(players,teams){
    return JSON.stringify(['A','B'].map(side=>teams[side].starters.map(i=>players[i].n).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  }
  function rotationReader(players,history=[],now=Date.now()){
    const last=(Array.isArray(history)?history:[]).filter(m=>m.kickoff>0&&m.kickoff<=now&&['A','B'].every(s=>Array.isArray(m.teams?.[s])&&m.teams[s].filter(p=>!p.bench).length>=6)).slice().sort((a,b)=>b.kickoff-a.kickoff)[0];
    const previous=new Map();
    if(last)for(const side of ['A','B'])for(const p of last.teams[side])if(!p.bench)previous.set(p.n,{side,slot:p.slot});
    const returning=players.filter(p=>previous.has(p.n)).length;
    return teams=>{
      let maxTogether=0,samePositions=0;
      for(const side of ['A','B']){
        const counts={A:0,B:0};
        teams[side].starters.forEach((i,k)=>{const old=previous.get(players[i].n);if(old){counts[old.side]++;if(old.slot===SLOTS[k])samePositions++;}});
        maxTogether=Math.max(maxTogether,counts.A,counts.B);
      }
      return {checked:!!last&&returning>0,previousMatchId:last?.id||null,returning,maxTogether,samePositions,limit:LINEUP_LIMITS.previousTeammates,reason:!last?'Chưa có trận trước hợp lệ để đối chiếu.':!returning?'Không có cầu thủ đã đá chính trận trước trong danh sách này.':''};
    };
  }
  function lineupRotation(players,teams,history=[],now=Date.now()){return rotationReader(players,history,now)(teams);}
  // Shared by the solver and final AI validation. Compute once per solver run,
  // not once per partition; masks cover the supported maximum of 24 people.
  function lineupGuard(players,options={}){
    const scores=players.map(p=>SLOTS.map(slot=>positionScore(p,slot))),epsilon=1e-9;
    let roles=lineupRoles(players,options.instruction);
    const metrics=metricReader(players,scores),rotation=rotationReader(players,options.history,options.now);
    let priority=priorityReader(players,roles);
    // Chỉ viện tới lịch sử khi bộ vị trí đăng ký + Note không tạo nổi hai đội
    // đúng vai trò. Vì vậy lịch sử không tranh chỗ với vị trí chính/phụ trong
    // những danh sách vốn đã hợp lệ.
    if(!priority.best){
      const historical=historicalSweeperRoles(players,options.history,options.now??Date.now());
      if(historical.length){
        const allowed=roles.allowed.map(row=>row.slice());
        for(const item of historical)allowed[item.index][SLOTS.indexOf(item.slot)]=true;
        roles={...roles,allowed,historical};priority=priorityReader(players,roles);
      }
    }
    const stronger=players.map((p,i)=>SLOTS.map((slot,k)=>k===0?0:players.reduce((mask,q,j)=>
      !q.guest&&roles.allowed[j][k]&&scores[j][k]-scores[i][k]>=LINEUP_LIMITS.benchAdvantage-epsilon?mask|(1<<j):mask,0)));
    function violations(teams){
      const out=[];
      for(const side of ['A','B'])for(let k=0;k<7;k++){
        const i=teams[side].starters[k];
        if(!roles.allowed[i][k])out.push({kind:'position',player:i,slot:SLOTS[k]});
      }
      if(roles.centers.length>=2){
        const count=side=>[...teams[side].starters,...teams[side].bench].filter(i=>roles.centers.includes(i)).length;
        if(Math.abs(count('A')-count('B'))>1)out.push({kind:'centers'});
      }
      const starting=[...teams.A.starters,...teams.B.starters],startingValue=priority.value(starting);
      if(!priority.best)out.push({kind:'selection',unavailable:true});
      else if(startingValue+epsilon<priority.best.value||priority.best.starters.some(i=>!starting.includes(i))){
        const missed=priority.best.starters.filter(i=>!starting.includes(i)).sort((a,b)=>priority.primary[b]-priority.primary[a]);
        out.push({kind:'selection',bench:missed[0],gap:Math.max(0,priority.best.value-startingValue)});
      }
      for(const [from,to,label] of [[4,7,'hàng công'],[1,4,'hàng thủ']]){
        let a=0,b=0;
        for(let k=from;k<to;k++){a+=scores[teams.A.starters[k]][k];b+=scores[teams.B.starters[k]][k];}
        const gap=Math.abs(a-b);
        if(gap>LINEUP_LIMITS.lineDifference+epsilon)out.push({kind:'balance',label,gap,limit:LINEUP_LIMITS.lineDifference});
      }
      const bench=[...teams.A.bench,...teams.B.bench],mask=bench.reduce((m,i)=>m|(1<<i),0);
      for(const side of ['A','B'])for(let k=1;k<7;k++){
        const i=teams[side].starters[k],blocked=stronger[i][k]&mask;
        if(blocked)out.push({kind:'bench',starter:i,bench:bench.find(j=>blocked&(1<<j)),slot:SLOTS[k]});
      }
      const m=metrics(teams),d=m.difference;
      for(const group of m.benchGroups)if(group.gap>LINEUP_LIMITS.benchMeanDifference+epsilon)out.push({kind:'reserve',gap:group.gap,count:group.count,limit:LINEUP_LIMITS.benchMeanDifference});
      for(const key of ['start','total'])if(d[key]>LINEUP_LIMITS.strengthDifference+epsilon)out.push({kind:'strength',key,gap:d[key],limit:LINEUP_LIMITS.strengthDifference});
      // Ngôi sao là ưu tiên cao trong hàm xếp hạng, không phải điều kiện loại.
      for(const [key,limit] of [['pace',LINEUP_LIMITS.paceDifference],['totalPace',LINEUP_LIMITS.paceDifference],['stamina',LINEUP_LIMITS.staminaDifference],['totalStamina',LINEUP_LIMITS.staminaDifference]])if(d[key]>limit+epsilon)out.push({kind:key.includes('Stamina')||key==='stamina'?'stamina':'pace',key,gap:d[key],limit});
      const r=rotation(teams);
      if(r.checked&&r.maxTogether>LINEUP_LIMITS.previousTeammates)out.push({kind:'rotation',count:r.maxTogether,limit:LINEUP_LIMITS.previousTeammates});
      return out;
    }
    const violation=teams=>violations(teams)[0]||null;
    function describe(v){
      if(v.kind==='position')return `${players[v.player].n}: không được xếp ${ROLE_LABELS[v.slot]}; phải dùng vị trí chính/phụ phù hợp hoặc chỉ định vị trí rõ trong Note. Đủ tiền vệ trung tâm chính thì mỗi đội phải có một người đá giữa.`;
      if(v.kind==='centers')return 'Tiền vệ trung tâm chính đang dồn một bên; phải chia đều hai đội, chênh tối đa một người, kể cả dự bị.';
      if(v.kind==='selection')return v.unavailable?'Nhóm 14 cầu thủ sau khi áp dụng Note và xếp điểm không phủ đủ hai bộ vị trí. Không tự bỏ qua Note hoặc thay người khác.':`${players[v.bench]?.n||'Cầu thủ thuộc top 14'}: phải đá chính vì thuộc nhóm 14 sau khi áp dụng Note và xếp điểm; không đưa người khác vào thay để cân đội.`;
      if(v.kind==='balance')return `Chênh ${v.label} ${v.gap.toFixed(2)} điểm, vượt ngưỡng bắt buộc ${LINEUP_LIMITS.lineDifference} điểm.`;
      if(v.kind==='bench')return `${players[v.bench].n}: không được dự bị khi điểm ${v.slot} cao hơn ${players[v.starter].n} từ ${LINEUP_LIMITS.benchAdvantage} điểm (đối chiếu cả hai đội).`;
      if(v.kind==='reserve')return `Sức mạnh dự bị: nhóm ${v.count} người mạnh nhất mỗi bên chênh trung bình ${v.gap.toFixed(2)} điểm, vượt ngưỡng bắt buộc ${LINEUP_LIMITS.benchMeanDifference}; không lấy người yếu kéo trung bình xuống để bù nhóm mạnh.`;
      if(v.kind==='strength')return `${v.key==='start'?'Đội hình chính':'Tổng sức mạnh (cùng số dự bị)'} chênh ${v.gap.toFixed(2)} điểm, vượt ngưỡng bắt buộc ${LINEUP_LIMITS.strengthDifference}.`;
      if(v.kind==='rotation')return `Có ${v.count} đồng đội cũ cùng bên, vượt ngưỡng bắt buộc ${LINEUP_LIMITS.previousTeammates}; phải trộn đội, không chỉ đổi màu A/B.`;
      return `${v.kind==='pace'?'Tốc độ':'Thể lực'} trung bình chênh ${v.gap.toFixed(2)}, vượt ngưỡng bắt buộc ${v.limit} (${v.key.startsWith('bench')?'dự bị cùng số người':v.key.startsWith('total')?'ngoài sân và dự bị cùng số người':'6 cầu thủ ngoài sân'}).`;
    }
    return {scores,roles,metrics,rotation,priority,violation,violations,describe,accepts:teams=>!violation(teams),assert(teams){const v=violation(teams);if(v)fail(describe(v));}};
  }
  // Only for intermediate swaps: a multi-swap plan may temporarily unbalance a
  // line. Its completed result must still pass lineup(), including quality.
  function validateLineupRoster(players,teams,options={}){
    if(!Array.isArray(players)||players.length<14||players.length>24)fail('Chia đội AI hiện hỗ trợ sân 7, từ 14–24 người.');
    const used=[];
    for(const side of ['A','B']){
      const t=teams&&teams[side];if(!t||!Array.isArray(t.starters)||t.starters.length!==7||!Array.isArray(t.bench))fail('Mỗi đội phải có đúng 7 cầu thủ đá chính.');
      for(const i of [...t.starters,...t.bench]){if(!Number.isInteger(i)||i<0||i>=players.length)fail('AI trả về cầu thủ ngoài danh sách.');used.push(i);}
    }
    if(used.length!==players.length||new Set(used).size!==players.length)fail('AI bỏ sót hoặc xếp trùng cầu thủ.');
    if(Math.abs(teams.A.bench.length-teams.B.bench.length)>1)fail('Số dự bị hai đội chênh lệch quá nhiều.');
    if(options.manualEdit)return; // Explicit user edits still enforce structure; other conflicts are reported as warnings.
    const roles=lineupRoles(players,options.instruction),forcedBench=new Set(roles.benchOverrides||[]),forcedStart=new Set((roles.overrides||[]).map(x=>x.index)),starters=[...teams.A.starters,...teams.B.starters];
    if(starters.some(i=>forcedBench.has(i)))fail(`${players[starters.find(i=>forcedBench.has(i))].n}: Note hiện tại yêu cầu dự bị.`);
    const availableMembers=players.filter((p,i)=>!p.guest&&!forcedBench.has(i)).length;
    if(availableMembers>=14&&starters.some(i=>players[i].guest&&!forcedStart.has(i)))fail('Khách phải dự bị khi còn đủ 14 thành viên không bị Note chỉ định dự bị, trừ người được Note yêu cầu đá vị trí cụ thể. Hãy tạo lại.');
    const guestCount=side=>[...teams[side].starters,...teams[side].bench].filter(i=>players[i].guest).length;
    if(Math.abs(guestCount('A')-guestCount('B'))>1)fail('Cần chia khách đều hai bên. Hãy tạo lại.');
  }
  function lineup(players,teams,options={}){
    validateLineupRoster(players,teams,options);
    const guard=lineupGuard(players,options);if(!options.manualEdit)guard.assert(teams);
    const evaluate=t=>{
      const ps=idx=>idx.map(i=>players[i]),mean=(idx,f)=>idx.length?ps(idx).reduce((s,p)=>s+f(p),0)/idx.length:0;
      const backs=t.starters.slice(1,4),fronts=t.starters.slice(4),scores=t.starters.map((i,k)=>positionScore(players[i],SLOTS[k]));
      const startFit=scores.reduce((a,b)=>a+b,0),benchOv=ps(t.bench).reduce((s,p)=>s+positionScore(p,p.pos),0);
      return {starters:t.starters.slice(),bench:t.bench.slice(),startFit,benchOv,total:startFit+benchOv,gkFit:scores[0],gkRated:true,ratingsByRole:true,pairedBenchComparison:true,frontFit:scores.slice(4).reduce((a,b)=>a+b,0),backFit:scores.slice(1,4).reduce((a,b)=>a+b,0),defPN:mean(backs,p=>p.PN),atk:mean(fronts,p=>p.DD),def7:mean(t.starters,p=>p.PN),atk7:mean(t.starters,p=>p.DD),defOv:mean(backs,p=>positionScore(p,p.pos)),atkOv:mean(fronts,p=>positionScore(p,p.pos)),benchDef:mean(t.bench,p=>p.PN),benchAtk:mean(t.bench,p=>p.DD),pace:mean(t.starters,p=>p.TC),heat:mean(t.starters,p=>p.DN),stars:ps([...t.starters,...t.bench]).filter(p=>positionScore(p,p.pos)>=8).length};
    };
    const evA=evaluate(teams.A),evB=evaluate(teams.B),warnings=[];
    if(options.manualEdit){
      try{validateLineupRoster(players,teams,{...options,manualEdit:false});}catch(e){warnings.push(e.message);}
      warnings.push(...guard.violations(teams).map(guard.describe));
    }
    const metrics=guard.metrics(teams),rotation=guard.rotation(teams);
    for(const side of ['A','B'])Object.assign(side==='A'?evA:evB,{stars:metrics[side].totalStars,starsPaired:true,pace:metrics[side].pace,stamina:metrics[side].stamina,physicalOutfield:true});
    for(const side of ['A','B']){
      const i=teams[side].starters[0],p=players[i];
      if(p.pos!=='GK'&&!(p.pos2||[]).includes('GK')&&!guard.roles.overrides.some(x=>x.index===i&&x.slot==='GK'))warnings.push(`${p.n}: bắt gôn dự phòng do thiếu thủ môn đăng ký; cần xác nhận.`);
    }
    for(const side of ['A','B'])for(let k=0;k<7;k++){
      const i=teams[side].starters[k],historical=guard.roles.historical.find(x=>x.index===i&&x.slot===SLOTS[k]);
      if(historical)warnings.push(`${players[i].n}: đá Thòng theo ${historical.matches} trận tham khảo có tỉ số hòa hoặc chênh tối đa 1 bàn.`);
    }
    const priority=guard.priority.best?{strength:guard.priority.best.strength,members:guard.priority.best.members,optimal:true}:null;
    const historyRoles=guard.roles.historical.map(x=>({player:players[x.index].n,slot:x.slot,matches:x.matches,draws:x.draws,samples:x.samples}));
    return {result:{A:[...teams.A.starters,...teams.A.bench],B:[...teams.B.starters,...teams.B.bench],evA,evB,J:0},warnings,checks:{metrics,rotation,priority,historyRoles}};
  }
  const api={SLOTS,KEYS,LINEUP_LIMITS,player,match,normalize,form,compactLegacy,lineup,lineupGuard,lineupRoles,lineupMetrics,lineupRotation,lineupGroupKey,validateLineupRoster,positionScore,minimumAssignment};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GPAIContext=api;
})(typeof window==='undefined'?globalThis:window);
