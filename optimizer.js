// Thuat toan chia 2 doi can bang (chay trong trinh duyet hoac node) - khong can server
// Port tu team_builder.py
(function(global){
  const SLOTS = ["GK","Thòng","HV","HV","TVtt","TV","TĐ"];      // 1-3-3

  function fit(s, p){
    const KT=s.KT,CH=s.CH,DD=s.DD,PN=s.PN,TC=s.TC,TL=s.TL,DN=s.DN,TD=s.TD,TM=s.TM;
    if(p==="GK")    return TM;
    if(p==="Thòng") return 0.40*PN+0.25*TD+0.20*TL+0.15*CH-0.20*Math.max(0,DD-6);
    if(p==="HV")    return 0.30*PN+0.25*TC+0.20*TL+0.15*DN+0.10*TD;
    if(p==="TVtt")  return 0.30*CH+0.30*TD+0.20*KT+0.10*DN+0.10*PN;
    if(p==="TV")    return 0.30*KT+0.20*TC+0.20*CH+0.15*DN+0.15*DD;
    if(p==="TĐ")    return 0.45*DD+0.20*KT+0.15*TL+0.10*TD+0.10*TC;
    return 0;
  }

  // Hungarian (min-cost perfect assignment), square n x n. Returns ans[row]=col.
  function hungarian(cost){
    const n=cost.length, INF=1e9;
    const u=new Array(n+1).fill(0), v=new Array(n+1).fill(0);
    const p=new Array(n+1).fill(0), way=new Array(n+1).fill(0);
    for(let i=1;i<=n;i++){
      p[0]=i; let j0=0;
      const minv=new Array(n+1).fill(INF), used=new Array(n+1).fill(false);
      do{
        used[j0]=true; const i0=p[j0]; let delta=INF, j1=-1;
        for(let j=1;j<=n;j++) if(!used[j]){
          const cur=cost[i0-1][j-1]-u[i0]-v[j];
          if(cur<minv[j]){minv[j]=cur; way[j]=j0;}
          if(minv[j]<delta){delta=minv[j]; j1=j;}
        }
        for(let j=0;j<=n;j++){
          if(used[j]){u[p[j]]+=delta; v[j]-=delta;} else minv[j]-=delta;
        }
        j0=j1;
      }while(p[j0]!==0);
      do{ const j1=way[j0]; p[j0]=p[j1]; j0=j1; }while(j0);
    }
    const ans=new Array(n);
    for(let j=1;j<=n;j++) ans[p[j]-1]=j-1;
    return ans;
  }

  // gia tri 8 chi so ngoai san
  function overallOf(s){ return (s.KT+s.CH+s.DD+s.PN+s.TC+s.TL+s.DN+s.TD)/8; }

  // danh gia 1 doi (mang index global). Tra ve starters[slot]=idx, bench[], cac chi so.
  function evalTeam(team, ctx){
    const k=team.length;
    // cost k x k: cot 0..6 = slot (dung fitPen de gan), 7..k-1 = bench (0)
    const cost=[];
    for(let r=0;r<k;r++){
      const pi=team[r], row=new Array(k).fill(0);
      for(let c=0;c<7;c++) row[c]=-ctx.fitPen[pi][c];
      cost.push(row);
    }
    const ans=hungarian(cost);
    const starters=new Array(7).fill(-1); const bench=[];
    let startFit=0, benchOv=0, gkFit=0;
    for(let r=0;r<k;r++){
      const pi=team[r], c=ans[r];
      if(c<7){ starters[c]=pi; startFit+=ctx.fitT[pi][c]; if(c===0) gkFit=ctx.fitT[pi][c]; }
      else { bench.push(pi); benchOv+=ctx.overall[pi]; }
    }
    const S=ctx.players;
    const backs=[starters[1],starters[2],starters[3]];
    const fronts=[starters[4],starters[5],starters[6]];
    const mean=(a,f)=>a.reduce((s,i)=>s+f(S[i]),0)/a.length;
    return {
      starters, bench, startFit, benchOv, gkFit,
      defPN: mean(backs,s=>s.PN),
      atk:   mean(fronts,s=>s.DD),
      pace:  mean(starters,s=>s.TC),
      heat:  mean(starters,s=>s.DN),
      stars: team.filter(i=>ctx.overall[i]>=8).length,
      total: startFit+benchOv,
    };
  }

  function combinations(pool, k, cb){
    const n=pool.length, idx=new Array(k);
    (function rec(start, depth){
      if(depth===k){ cb(idx.slice()); return; }
      for(let i=start;i<=n-(k-depth);i++){ idx[depth]=pool[i]; rec(i+1, depth+1); }
    })(0,0);
  }

  // players: mang object {n,KT,...,TM}. Tra ve {A,B,evA,evB,J} hoac null neu loi.
  function solve(players){
    const N=players.length;
    if(N<14) return {error:"Cần ít nhất 14 người (7 vs 7)."};
    const overall=players.map(overallOf);
    const fitT=players.map(p=>SLOTS.map(sl=>fit(p,sl)));
    // uu tien vi tri dang ky: +chinh, +phu nhe, -vi tri khong dang ky (chi khi co set p.pos)
    const PRI=2.5, SEC=1.0, OFF=3.0;
    const fitPen=fitT.map((row,i)=>{
      const pr=players[i].pos, sec=Array.isArray(players[i].pos2)?players[i].pos2:[];
      if(!pr) return row;                                   // chua chon vi tri -> trung tinh
      return row.map((v,c)=>{ const sl=SLOTS[c];
        return v + (sl===pr?PRI:(sec.indexOf(sl)>=0?SEC:-OFF)); });
    });
    const TM=players.map(p=>p.TM);
    const ctx={players,overall,fitT,fitPen};
    const sizeA=Math.ceil(N/2), even=(N%2===0);

    const K=12, top=[];   // giu top-K cach chia can nhat (de nut "Tao lai" doi doi)
    function consider(c){
      if(top.length<K){top.push(c);top.sort((a,b)=>a.J-b.J);}
      else if(c.J<top[K-1].J){top[K-1]=c;top.sort((a,b)=>a.J-b.J);}
    }
    const all=Array.from({length:N},(_,i)=>i);
    const pool = even ? all.slice(1) : all;          // even: co dinh player0 o A (khu trung lap)
    const need = even ? sizeA-1 : sizeA;
    const baseA = even ? [0] : [];

    combinations(pool, need, (pick)=>{
      const A=baseA.concat(pick);
      const inA=new Array(N).fill(false); A.forEach(i=>inA[i]=true);
      const B=all.filter(i=>!inA[i]);
      // moi doi can it nhat 1 thu mon
      let okA=false,okB=false;
      for(const i of A) if(TM[i]>0){okA=true;break;}
      for(const i of B) if(TM[i]>0){okB=true;break;}
      if(!okA||!okB) return;
      const eA=evalTeam(A,ctx), eB=evalTeam(B,ctx);
      const J = 3.0*Math.abs(eA.stars-eB.stars)
              + 1.0*Math.abs(eA.startFit-eB.startFit)
              + 0.6*Math.abs(eA.total-eB.total)
              + 0.5*Math.abs(eA.benchOv-eB.benchOv)
              + 1.0*Math.abs(eA.defPN-eB.defPN)
              + 0.4*Math.abs(eA.atk-eB.atk)
              + 0.4*Math.abs(eA.pace-eB.pace)
              + 0.4*Math.abs(eA.heat-eB.heat)
              + 0.3*Math.abs(eA.gkFit-eB.gkFit);
      consider({J,A,B,evA:eA,evB:eB});
    });
    return top;   // mang da sap xep tang dan theo J (top[0] = can nhat)
  }

  const api={solve,fit,SLOTS,overallOf};
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  global.TeamSolver=api;
})(typeof window!=="undefined"?window:globalThis);

// ===== Node test =====
if(typeof require!=="undefined" && require.main===module){
  const fs=require("fs");
  const players=JSON.parse(fs.readFileSync(__dirname+"/players.json","utf-8"));
  const {solve,SLOTS,overallOf}=module.exports;
  const t0=Date.now();
  const arr=solve(players);
  const ms=Date.now()-t0;
  const r=arr[0];   // top[0] = can nhat
  const lab=["Thủ môn","Trung vệ","Hậu vệ","Hậu vệ","Tiền vệ giữa","Tiền vệ cánh","Tiền đạo"];
  function show(tag,ev){
    console.log(`\n=== ĐỘI ${tag} === start=${ev.startFit.toFixed(1)} total=${ev.total.toFixed(1)} thủ=${ev.defPN.toFixed(1)} sao=${ev.stars}`);
    ev.starters.forEach((pi,c)=>console.log(`  ${lab[c].padEnd(13)} ${players[pi].n}`));
    console.log("  Dự bị:", ev.bench.map(i=>players[i].n).join(", "));
  }
  console.log(`Số cách chia đã duyệt xong trong ${ms}ms · J=${r.J.toFixed(3)}`);
  show("A",r.evA); show("B",r.evB);
}
