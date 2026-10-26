// Thuat toan chia 2 doi can bang (chay trong trinh duyet hoac node) - khong can server
// Port tu team_builder.py
(function(global){
  const C=typeof module!=="undefined"&&module.exports?require('./ai_context.js'):global.GPAIContext;
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

  const hungarian=C.minimumAssignment;

  // gia tri tong quat = 8 chi so san. OD (On dinh) TAM KHONG tinh vao diem (chi hien thi).
  function overallOf(s){ return (s.KT+s.CH+s.DD+s.PN+s.TC+s.TL+s.DN+s.TD)/8; }

  // danh gia 1 doi (mang index global). Tra ve starters[slot]=idx, bench[], cac chi so.
  function evalTeam(team, ctx){
    const k=team.length;
    // First maximize the selected members' profile ratings across all legal
    // role chains. Position bonuses may place the chosen seven, never replace
    // a stronger member with a weaker primary-role specialist for balance.
    const chosen=ctx.priority.chooseTeam(team);if(!chosen)return null;
    const selected=new Set(chosen.starters);
    // cost k x k: cot 0..6 = slot (dung fitPen de gan), 7..k-1 = bench (0)
    const cost=[];
    for(let r=0;r<k;r++){
      const pi=team[r], row=new Array(k).fill(0);
      for(let c=0;c<k;c++)row[c]=c<7?(selected.has(pi)?-ctx.fitPen[pi][c]:1e6):(selected.has(pi)?1e6:0);
      cost.push(row);
    }
    const ans=hungarian(cost);
    const starters=new Array(7).fill(-1); const bench=[];
    let startFit=0, benchOv=0, gkFit=0, frontFit=0, backFit=0;
    for(let r=0;r<k;r++){
      const pi=team[r], c=ans[r];
      if(c<7){ starters[c]=pi; const fc=ctx.fitT[pi][c]; startFit+=fc; if(c===0) gkFit=fc;
        if(c>=4&&c<=6) frontFit+=fc; if(c>=1&&c<=3) backFit+=fc; }  // tuyến trên / tuyến dưới (theo fit)
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
      starters, bench, startFit, benchOv, gkFit, frontFit, backFit,startPriority:chosen.value,
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
      gkWaste: (starters[0]>=0 && S[starters[0]].pos!=="GK") ? ctx.bestOut[starters[0]] : 0,  // bắt gôn nhưng KO phải thủ môn chính -> phí giá trị ngoài sân (phạt: đừng nhét tiền đạo/HV giỏi vào gôn)
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
    frontBal:1.5, backBal:1.5, // CAN TUYEN TREN/DUOI theo DIEM-VI-TRI (fit) — nhu cach chia AI thu cong
    defq:1.0, atkq:0.7,       // CHAT LUONG tuyen duoi / tuyen tren (overall, khong chi PN/DD) — tranh don ngoi sao 1 tuyen
    benchOv:0.5,              // du bi: suc manh
    benchCong:0.5, benchThu:0.5, // du bi: can ca cong lan thu (khong lech thanh phan)
    pace:0.3, heat:0.3, run:0.7, // SUC CHAY can deu (run gom ca the luc) — tach 2 may chay ra 2 doi
    gk:0.2,           // thu mon CHI la phu — khong de ganh can can
    stab:0,           // ON DINH (OD) — TAM TAT khoi chia doi (OD chi hien thi); doi >0 de bat lai sau
    startq:4.0,       // CHAT LUONG doi hinh chinh (overall TB) — chia deu nguoi MANH/YEU, ko don sao 1 doi (lon nhat: 2 doi manh ngang nhau)
    posbad:6.0,       // PHAT TUYET DOI moi starter da SAI vi tri dang ky — uu tien xep DUNG vi tri (loai phuong an sai khoi "Tao lai")
    guestbad:5.0,     // PHAT moi KHACH phai da chinh -> uu tien chia khach ve doi con ghe du bi
    gkwaste:2.0,      // PHAT khi nguoi NGOAI SAN gioi phai bat gon -> chia thu mon sao cho tien dao/HV gioi dung vi tri
  };

  // players: mang object {n,KT,...,TM}. Tra ve top-K {A,B,evA,evB,J} (mang) hoac {error}.
  function solve(players, Wover, options={}){
    const W=Object.assign({}, DEFW, Wover||{});
    const N=players.length;
    if(N<14) return {error:"Cần ít nhất 14 người (7 vs 7)."};
    if(N>24) return {error:"Tối đa 24 người khi tạo đội 7 vs 7."};
    const members=players.filter(p=>!p.guest).length;
    const overall=players.map(overallOf);
    // Use the same role scores and mandatory thresholds as the displayed draft.
    const guard=C.lineupGuard(players,options),fitT=guard.scores;
    if(!guard.priority.best)return {error:'Không tìm được đội hình đạt tiêu chí bắt buộc: không đủ nhóm 14 cầu thủ đá chính đúng vị trí. Không tự nới tiêu chí; chưa sửa trận.',code:'no-valid-lineup',diagnostics:[{code:'position',count:1,message:'Không đủ nhóm 14 cầu thủ đá chính đúng vị trí.'}]};
    // uu tien vi tri dang ky: +chinh, +phu nhe, -vi tri khong dang ky (chi khi co set p.pos)
    const PRI=4.5, SEC=1.0, OFF=3.0, GKLOCK=50, GUEST_PEN=4.0;   // PRI cao: ƯU TIÊN MẠNH vị trí CHÍNH (tiền đạo giỏi đá tiền đạo, ko bị kéo về gôn vì TM cao). GUEST_PEN: phạt khách -> dự bị
    const isGK=players.map(p=>p.pos==="GK" && !p.guest);   // KHACH ko tinh la thu mon CO DINH -> uu tien du bi, nhuong gon cho GK that
    const lockGK=isGK.filter(Boolean).length>=2;            // co >=2 thu mon co dinh -> khoa khung gon cho ho, khong xet nguoi khac (du TM cao)
    const bestOut=fitT.map(row=>Math.max(row[1],row[2],row[3],row[4],row[5],row[6]));  // fit cao nhat o vi tri NGOAI SAN (do "gia tri ngoai san")
    const fitPen=fitT.map((row,i)=>{
      const pr=players[i].pos, sec=Array.isArray(players[i].pos2)?players[i].pos2:[];
      const gp=players[i].guest?GUEST_PEN:0;                 // KHACH -> tru deu o moi vi tri => uu tien du bi
      return row.map((v,c)=>{ const sl=SLOTS[c];
        if(!guard.roles.allowed[i][c])return -1e6;
        if(sl==="GK"){
          if(lockGK) return v + (isGK[i]?GKLOCK:-GKLOCK) - gp;     // >=2 thu mon co dinh -> khoa gon cho ho
          if(pr==="GK") return v + PRI - gp;                      // thu mon CHINH
          if(players[i].TM>0) return -bestOut[i] - gp;            // biet bat nhung KO phai TM chinh -> uu tien nguoi NGOAI SAN KEM nhat bat gon (giu tien dao/HV gioi dung vi tri)
          return -1e6;                                            // ko biet bat -> khong bao gio vao gon
        }
        if(!pr) return v - gp;                              // chua chon vi tri -> trung tinh
        return v + (sl===pr?PRI:(sec.indexOf(sl)>=0?SEC:-OFF)) - gp; });
    });
    const TM=players.map(p=>p.TM);
    const ctx={players,overall,fitT,fitPen,bestOut,priority:guard.priority};
    const sizeA=Math.ceil(N/2), even=(N%2===0);

    const K=12, top=[],rejections={},excluded=new Set(options.excludeGroups||[]);
    const reject=(code,message)=>{if(!rejections[code])rejections[code]={code,count:0,message};rejections[code].count++;};
    function consider(c){
      const groupKey=C.lineupGroupKey(players,{A:c.evA,B:c.evB});
      if(excluded.has(groupKey)){reject('duplicate','Các nhóm đá chính đã xuất hiện trong những lượt gen trước.');return;}
      const duplicate=top.findIndex(r=>r.groupKey===groupKey);
      if(duplicate>=0){if(c.J<top[duplicate].J){top[duplicate]={...c,groupKey};top.sort((a,b)=>a.J-b.J);}return;}
      c.groupKey=groupKey;
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
      if(options.strictGuests&&Math.abs(A.filter(i=>players[i].guest).length-B.filter(i=>players[i].guest).length)>1){reject('guests','Không chia đều được khách.');return;}
      // moi doi can it nhat 1 thu mon (thu mon CO DINH neu da khoa; nguoc lai chi can co nguoi biet bat)
      const okGK=i=>lockGK?isGK[i]:TM[i]>0;
      let okA=false,okB=false;
      for(const i of A) if(okGK(i)){okA=true;break;}
      for(const i of B) if(okGK(i)){okB=true;break;}
      if(!okA||!okB){reject('keeper','Thiếu thủ môn phù hợp cho một bên.');return;}
      const eA=evalTeam(A,ctx), eB=evalTeam(B,ctx);
      if(!eA||!eB){reject('position','Không đủ vị trí chính/phụ phù hợp ở một bên.');return;}
      if(eA.startPriority+eB.startPriority+1e-9<guard.priority.best.value){reject('selection','Chưa chọn nhóm đá chính mạnh nhất có thể xếp đúng vị trí; không để người mạnh dự bị để cân hai đội.');return;}
      if(options.strictGuests&&members>=14&&(eA.guestStart||eB.guestStart)){reject('guests','Khách phải dự bị khi đủ thành viên.');return;}
      // Filter BEFORE keeping the top 12, not afterwards: a highly ranked but
      // invalid partition must not crowd valid balanced/strongest-starting ones out.
      const issue=guard.violation({A:eA,B:eB});
      if(issue){reject(issue.kind,rejections[issue.kind]?.message||guard.describe(issue));return;}
      const m=guard.metrics({A:eA,B:eB});
      const d=k=>Math.abs(eA[k]-eB[k]);
      const J = W.stars*m.difference.totalStars
              + W.startFit*d('startFit')
              + W.total*m.difference.total
              + W.cong*d('atk7') + W.thu*d('def7')        // CÔNG/THỦ toàn đội — ngang nhau
              + W.congLine*d('atk') + W.thuLine*d('defPN') // giữ cân hình tuyến trên/dưới
              + W.frontBal*d('frontFit') + W.backBal*d('backFit') // CÂN TUYẾN TRÊN/DƯỚI theo điểm-vị-trí (fit) — như chia AI
              + W.defq*d('defOv') + W.atkq*d('atkOv')      // cân CHẤT LƯỢNG tuyến dưới/trên (overall)
              + W.benchOv*Math.abs(m.A.benchTotal-m.B.benchTotal)
              + W.benchOv*m.benchMaxGroupDifference
              + W.benchCong*Math.abs(m.A.benchAttack-m.B.benchAttack) + W.benchThu*Math.abs(m.A.benchDefense-m.B.benchDefense) // dự bị: cùng số người
              + W.pace*d('pace') + W.heat*d('heat') + W.run*d('run')
              + W.gk*d('gkFit')
              + W.stab*d('odMean')                          // cân ỔN ĐỊNH (OD) giữa 2 đội
              + W.startq*d('startOv')                       // cân OVERALL đội hình chính — người mạnh/yếu chia đều
              + W.posbad*(eA.offPos+eB.offPos)              // PHẠT tuyệt đối starter đá sai vị trí (ko phải chênh lệch)
              + W.guestbad*(eA.guestStart+eB.guestStart)    // PHẠT khách đá chính -> ưu tiên dự bị
              + W.gkwaste*(eA.gkWaste+eB.gkWaste);          // PHẠT phí người ngoài sân giỏi vào gôn -> giữ tiền đạo/HV đúng vị trí
      consider({J,A,B,evA:eA,evB:eB});
    });
    if(!top.length){
      const order=['guests','keeper','position','centers','selection','balance','bench','reserve','strength','stars','pace','stamina','rotation'];
      const diagnostics=Object.values(rejections).sort((a,b)=>order.indexOf(b.code)-order.indexOf(a.code));
      if(rejections.duplicate)return {error:'Chưa tìm được nhóm đá chính khác với các lượt đã xem mà vẫn đạt đủ tiêu chí. Không gọi AI hoặc nới ngưỡng; giữ nguyên bản nháp trước.',code:'no-new-lineup',diagnostics};
      return {error:'Không tìm được đội hình đạt tiêu chí bắt buộc. Phương án gần đạt còn vướng: '+diagnostics.slice(0,3).map(x=>x.message).join(' ')+' Không tự nới tiêu chí; chưa sửa trận.',code:'no-valid-lineup',diagnostics};
    }
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
