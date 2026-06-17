// Thuat toan chia 2 doi can bang (chay trong trinh duyet hoac node) - khong can server
// Port tu team_builder.py
(function(global){
  const SLOTS = ["GK","Thòng","HV","HV","TVtt","TV","TĐ"];      // sơ đồ hiển thị 1-3-1-2 (GK · 3 thủ · TVtt · TV+TĐ)
  const STAR_MIN = 8;   // ⭐ Ngôi sao = overall >= ngưỡng này (PHẢI khớp STAR_MIN trong web_template.html)

  // Độ hợp vị trí = KỸ NĂNG thuần ở vị trí đó (không trộn Ổn định vào đây — OD cân riêng qua odMean ở hàm J).
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

  // gia tri tong quat = 8 chi so san. OD (On dinh) TAM KHONG tinh vao diem (chi hien thi).
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
    // ĐÚNG VỊ TRÍ: đếm starter bị xếp NGOÀI vị trí đăng ký (chính+phụ). Cầu thủ chưa chọn vị trí (pos rỗng) -> bỏ qua.
    let offPos=0, guestStart=0;
    for(let c=0;c<7;c++){ const pi=starters[c]; if(pi<0)continue;
      if(S[pi].guest)guestStart++;                          // KHACH da chinh -> phat o J de uu tien du bi
      const pr=S[pi].pos; if(!pr)continue;
      const p2=S[pi].pos2; if(pr!==SLOTS[c] && !(Array.isArray(p2)&&p2.includes(SLOTS[c]))) offPos++; }
    const backs=[starters[1],starters[2],starters[3]];
    const fronts=[starters[4],starters[5],starters[6]];
    const mean=(a,f)=>a.reduce((s,i)=>s+f(S[i]),0)/a.length;
    const bmean=f=>bench.length?bench.reduce((s,i)=>s+f(S[i]),0)/bench.length:0;
    const flat=s=>(s.KT+s.CH+s.DD+s.PN+s.TC+s.TL+s.DN+s.TD)/8;   // chất lượng tổng quát (8 chỉ số sân; OD tạm KHÔNG tính)
    return {
      starters, bench, startFit, benchOv, gkFit,
      defPN: mean(backs,s=>s.PN),     // THỦ tuyến dưới (3 hậu vệ) — giữ cân hình
      atk:   mean(fronts,s=>s.DD),    // CÔNG tuyến trên (3 mũi) — giữ cân hình
      def7:  mean(starters,s=>s.PN),  // THỦ toàn đội hình chính (cả tuyến giữa)
      atk7:  mean(starters,s=>s.DD),  // CÔNG toàn đội hình chính (cả tuyến giữa)
      defOv: mean(backs,flat),        // CHẤT LƯỢNG tuyến dưới (overall 3 hậu vệ, không chỉ PN)
      atkOv: mean(fronts,flat),       // CHẤT LƯỢNG tuyến trên (overall 3 mũi)
      benchDef: bmean(s=>s.PN),       // THỦ của ghế dự bị
      benchAtk: bmean(s=>s.DD),       // CÔNG của ghế dự bị
      pace:  mean(starters,s=>s.TC),
      heat:  mean(starters,s=>s.DN),
      run:   mean(starters,s=>s.TC+s.TL+s.DN),  // SỨC CHẠY tổng (tốc độ+thể lực+năng nổ) — để 2 đội chạy đều
      stars: team.filter(i=>ctx.overall[i]>=STAR_MIN).length,
      total: startFit+benchOv,
      odMean: team.reduce((a,i)=>a+(+S[i].OD||0),0)/team.length,  // ỔN ĐỊNH trung bình cả đội — để cân phong độ
      startOv: mean(starters,flat),   // OVERALL trung bình ĐỘI HÌNH CHÍNH — cân để ko dồn người mạnh 1 đội
      offPos,                         // số starter ĐÁ SAI vị trí đăng ký — phạt nặng để ưu tiên xếp đúng vị trí
      guestStart,                     // số KHÁCH (người ngoài) phải đá chính — phạt để ưu tiên dự bị
    };
  }

  function combinations(pool, k, cb){
    const n=pool.length, idx=new Array(k);
    (function rec(start, depth){
      if(depth===k){ cb(idx.slice()); return; }
      for(let i=start;i<=n-(k-depth);i++){ idx[depth]=pool[i]; rec(i+1, depth+1); }
    })(0,0);
  }

  // Trong so ham muc tieu J (cang nho cang can). CONG = THU de "khong cai nhau".
  const DEFW={
    stars:2.5,        // chenh so ngoi sao
    startFit:1.0,     // suc manh doi hinh chinh (Hungarian fit)
    total:1.0,        // tong ca doi (chinh + du bi) — can tong luc 2 doi
    cong:1.0, thu:1.0,        // CONG/THU toan doi hinh chinh (ca tuyen giua) — NGANG NHAU
    congLine:0.5, thuLine:0.5, // giu can hinh tuyen tren/duoi
    defq:1.0, atkq:0.7,       // CHAT LUONG tuyen duoi / tuyen tren (overall, khong chi PN/DD) — tranh don ngoi sao 1 tuyen
    benchOv:0.5,              // du bi: suc manh
    benchCong:0.5, benchThu:0.5, // du bi: can ca cong lan thu (khong lech thanh phan)
    pace:0.3, heat:0.3, run:0.7, // SUC CHAY can deu (run gom ca the luc) — tach 2 may chay ra 2 doi
    gk:0.4,           // thu mon
    stab:0,           // ON DINH (OD) — TAM TAT khoi chia doi (OD chi hien thi); doi >0 de bat lai sau
    startq:4.0,       // CHAT LUONG doi hinh chinh (overall TB) — chia deu nguoi MANH/YEU, ko don sao 1 doi (lon nhat: 2 doi manh ngang nhau)
    posbad:6.0,       // PHAT TUYET DOI moi starter da SAI vi tri dang ky — uu tien xep DUNG vi tri (loai phuong an sai khoi "Tao lai")
    guestbad:5.0,     // PHAT moi KHACH phai da chinh -> uu tien chia khach ve doi con ghe du bi
  };

  // players: mang object {n,KT,...,TM}. Tra ve top-K {A,B,evA,evB,J} (mang) hoac {error}.
  function solve(players, Wover){
    const W=Object.assign({}, DEFW, Wover||{});
    const N=players.length;
    if(N<14) return {error:"Cần ít nhất 14 người (7 vs 7)."};
    const overall=players.map(overallOf);
    const fitT=players.map(p=>SLOTS.map(sl=>fit(p,sl)));
    // uu tien vi tri dang ky: +chinh, +phu nhe, -vi tri khong dang ky (chi khi co set p.pos)
    const PRI=2.5, SEC=1.0, OFF=3.0, GKLOCK=50, GUEST_PEN=4.0;   // GUEST_PEN: phat KHACH (nguoi ngoai) o moi vi tri -> uu tien day xuong du bi
    const isGK=players.map(p=>p.pos==="GK" && !p.guest);   // KHACH ko tinh la thu mon CO DINH -> uu tien du bi, nhuong gon cho GK that
    const lockGK=isGK.filter(Boolean).length>=2;            // co >=2 thu mon co dinh -> khoa khung gon cho ho, khong xet nguoi khac (du TM cao)
    const fitPen=fitT.map((row,i)=>{
      const pr=players[i].pos, sec=Array.isArray(players[i].pos2)?players[i].pos2:[];
      const gp=players[i].guest?GUEST_PEN:0;                 // KHACH -> tru deu o moi vi tri => uu tien du bi
      return row.map((v,c)=>{ const sl=SLOTS[c];
        if(lockGK && sl==="GK") return v + (isGK[i]?GKLOCK:-GKLOCK) - gp;   // gon chi danh cho thu mon co dinh (THAT, ko phai khach)
        if(!pr) return v - gp;                              // chua chon vi tri -> trung tinh
        return v + (sl===pr?PRI:(sec.indexOf(sl)>=0?SEC:-OFF)) - gp; });
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
      // moi doi can it nhat 1 thu mon (thu mon CO DINH neu da khoa; nguoc lai chi can co nguoi biet bat)
      const okGK=i=>lockGK?isGK[i]:TM[i]>0;
      let okA=false,okB=false;
      for(const i of A) if(okGK(i)){okA=true;break;}
      for(const i of B) if(okGK(i)){okB=true;break;}
      if(!okA||!okB) return;
      const eA=evalTeam(A,ctx), eB=evalTeam(B,ctx);
      const d=k=>Math.abs(eA[k]-eB[k]);
      const J = W.stars*d('stars')
              + W.startFit*d('startFit')
              + W.total*d('total')
              + W.cong*d('atk7') + W.thu*d('def7')        // CÔNG/THỦ toàn đội — ngang nhau
              + W.congLine*d('atk') + W.thuLine*d('defPN') // giữ cân hình tuyến trên/dưới
              + W.defq*d('defOv') + W.atkq*d('atkOv')      // cân CHẤT LƯỢNG tuyến dưới/trên (overall)
              + W.benchOv*d('benchOv')
              + W.benchCong*d('benchAtk') + W.benchThu*d('benchDef') // dự bị cân công-thủ
              + W.pace*d('pace') + W.heat*d('heat') + W.run*d('run')
              + W.gk*d('gkFit')
              + W.stab*d('odMean')                          // cân ỔN ĐỊNH (OD) giữa 2 đội
              + W.startq*d('startOv')                       // cân OVERALL đội hình chính — người mạnh/yếu chia đều
              + W.posbad*(eA.offPos+eB.offPos)              // PHẠT tuyệt đối starter đá sai vị trí (ko phải chênh lệch)
              + W.guestbad*(eA.guestStart+eB.guestStart);   // PHẠT khách đá chính -> ưu tiên dự bị
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
