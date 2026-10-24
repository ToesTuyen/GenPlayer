// One Create action. Stages report real work/checks, never simulated model reasoning.
const CREATE_STEPS=[
  ['roster','Danh sách & thể thức 7 vs 7'],
  ['ratings','Chỉ số & vị trí đăng ký'],
  ['history','Dữ liệu phong độ, thắng thua & bàn thắng'],
  ['engine','Kết nối bộ xử lý'],
  ['search','Tìm phương án chia đội'],
  ['partition','Đủ người, dự bị & chia khách'],
  ['balance','Cân riêng hàng công & hàng thủ'],
  ['positions','Đúng vị trí & ưu tiên người mạnh'],
  ['rotation','Đối chiếu đội hình gần nhất'],
  ['note','Yêu cầu riêng từ Note'],
  ['draft','Hiển thị đội hình & bảng so kè']
];
const CREATE_STEP_READ_MS=1000; // Presentation dwell only; never marks unfinished work as complete.
const CREATE_STATE={busy:false,steps:new Map(),startedAt:new Map(),success:false,hasReport:false,draftNote:null,draftEngine:null};
function createNoteChanged(){
  const box=$('createNoteStatus'),note=CREATE_STATE.draftNote;
  if(note===null){box.hidden=true;return;}
  const changed=$('aiInstruction').value.trim()!==note,algorithm=CREATE_STATE.draftEngine==='Thuật toán';
  if(!note&&!changed){box.hidden=true;box.replaceChildren();return;}
  box.hidden=false;box.dataset.state='warn';
  const heading=document.createElement('strong');
  heading.textContent=changed?'Note đã thay đổi — cần tạo đội lại':algorithm?'Chưa áp dụng Note — thuật toán không hỗ trợ':'Note đã gửi AI — chưa xác minh tự động';
  box.replaceChildren(heading);
  if(note){const quote=document.createElement('blockquote');quote.textContent=note;box.appendChild(quote);}
}
const createYield=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
function createStep(id,state,detail=''){
  if(state==='active'&&CREATE_STATE.steps.get(id)!=='active')CREATE_STATE.startedAt.set(id,performance.now());
  CREATE_STATE.steps.set(id,state);
  const row=$('createProcessSteps').querySelector('[data-step="'+id+'"]');
  row.dataset.state=state;row.querySelector('.process-step-detail').textContent=detail;
  const labels={pending:'Chờ xử lý',active:'Đang xử lý',done:'Đã kiểm tra',warn:'Cần lưu ý',error:'Không hoàn tất',skip:'Chưa kiểm tra'};
  row.querySelector('.process-step-icon').textContent=({done:'✓',warn:'!',error:'×',skip:'–'})[state]||'';
  row.querySelector('.process-step-icon').setAttribute('aria-label',labels[state]);
  if(state==='active'){
    // Current step first, then previously run steps newest-first; untouched steps stay below.
    // Move the actual node so visual, keyboard and screen-reader order stay consistent.
    const list=$('createProcessSteps');
    if(list.firstElementChild!==row)list.prepend(row);
    list.scrollTop=0;
  }
  const finished=[...CREATE_STATE.steps.values()].filter(s=>['done','warn'].includes(s)).length;
  $('createProcessProgress').value=finished;$('createProcessCount').textContent=finished+'/'+CREATE_STEPS.length+' bước đã xử lý';
}
async function createCompleteStep(id,state,detail){
  const started=CREATE_STATE.startedAt.get(id),remaining=started===undefined?0:Math.max(0,CREATE_STEP_READ_MS-(performance.now()-started));
  // The check has already run. Keep its current row readable before showing its result.
  // A slow API/solver naturally consumes this interval; it does not get an extra delay.
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  createStep(id,state,detail);
}
function createBegin(){
  CREATE_STATE.busy=true;CREATE_STATE.success=false;CREATE_STATE.hasReport=false;CREATE_STATE.steps.clear();CREATE_STATE.startedAt.clear();
  aiMessage('');AI_STATE.lastFailure=null;
  $('reviewProcess').style.display='none';
  $('aiTask').value='lineup';$('aiAnalysisTools').hidden=true;aiTaskChanged();aiSyncDraftAction();
  $('go').disabled=true;$('selectAll').disabled=true;
  $('roster').querySelectorAll('input').forEach(c=>c.disabled=true);
  $('createProcessTitle').textContent='Đang tạo đội';$('createProcessEngine').textContent='Chuẩn bị';
  $('createProcessSummary').hidden=true;$('createProcessClose').disabled=true;$('createProcessClose').textContent='Đang xử lý…';
  $('createProcessSteps').innerHTML=CREATE_STEPS.map(([id,title])=>'<li data-step="'+id+'" data-state="pending"><span class="process-step-icon" role="img" aria-label="Chờ xử lý"></span><div><span class="process-step-title">'+title+'</span><span class="process-step-detail"></span></div></li>').join('');
  CREATE_STEPS.forEach(([id])=>CREATE_STATE.steps.set(id,'pending'));
  $('createProcessProgress').value=0;$('createProcessCount').textContent='0/'+CREATE_STEPS.length+' bước đã xử lý';
  $('createProcessProgress').max=CREATE_STEPS.length;
  $('createProcess').showModal();
}
function createFinish(success,message){
  CREATE_STATE.busy=false;CREATE_STATE.success=success;CREATE_STATE.hasReport=true;$('go').disabled=false;
  aiSyncDraftAction();
  $('reviewProcess').style.display='';
  $('roster').querySelectorAll('input').forEach(c=>c.disabled=false);updateCount();
  $('createProcessTitle').textContent=success?'Đã tạo đội hình nháp':'Chưa tạo được đội';
  $('createProcessSummary').textContent=message;$('createProcessSummary').hidden=false;
  $('createProcessClose').disabled=false;$('createProcessClose').textContent=success?'Xem đội hình':'Đóng';
  $('createProcessClose').focus();
  $('createProcessSteps').scrollTop=0;
}
function createReviewProcess(){
  if(CREATE_STATE.busy||!CREATE_STATE.hasReport)return;
  $('createProcess').showModal();$('createProcessSteps').scrollTop=0;
}
$('createProcess').addEventListener('cancel',event=>{if(CREATE_STATE.busy)event.preventDefault();});
$('createProcessClose').onclick=()=>{
  if(CREATE_STATE.busy)return;
  $('createProcess').close();
  if(CREATE_STATE.success){$('result').scrollIntoView({behavior:'smooth',block:'start'});fitMatch();}
  else $('go').focus();
};
function createSolveInWorker(players){
  return new Promise((resolve,reject)=>{
    let worker,url,timer;
    const finish=(error,data)=>{clearTimeout(timer);if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);error?reject(error):resolve(data);};
    try{
      url=URL.createObjectURL(new Blob([$('solverWorkerSource').textContent],{type:'application/javascript'}));
      worker=new Worker(url);
      worker.onmessage=event=>event.data.error?finish(new Error(event.data.error)):finish(null,event.data.results);
      worker.onerror=event=>{event.preventDefault();finish(new Error('Không chạy được thuật toán trong trình duyệt này. Hãy tải lại trang và thử lại.'));};
      timer=setTimeout(()=>finish(new Error('Thuật toán vượt quá 90 giây. Hãy giảm danh sách rồi thử lại. Chưa thay đổi trận.')),90000);
      worker.postMessage({players});
    }catch{finish(new Error('Trình duyệt không mở được bộ xử lý thuật toán. Hãy cho phép Web Worker rồi thử lại.'));}
  });
}
function createRotation(result,subset,history){
  const recent=history.filter(m=>m.kickoff<=Date.now()).slice(0,3),last=recent[0];
  if(!last)return {state:'warn',detail:'Chưa có trận trước để đối chiếu xoay tua.'};
  const previous=new Map();
  for(const side of ['A','B'])for(const p of last.teams[side])if(!p.bench)previous.set(p.n,{side,slot:p.slot});
  let samePositions=0,maxTogether=0;
  for(const side of ['A','B']){
    const counts={A:0,B:0};
    result['ev'+side].starters.forEach((i,k)=>{const old=previous.get(subset[i].n);if(old){counts[old.side]++;if(old.slot===GPAIContext.SLOTS[k])samePositions++;}});
    maxTogether=Math.max(maxTogether,counts.A,counts.B);
  }
  const warn=samePositions>0||maxTogether>=4;
  return {state:warn?'warn':'done',detail:`${samePositions} người giữ vị trí · Tối đa ${maxTogether} đồng đội cũ cùng bên.`+(warn?' Cần xem lại xoay tua.':'')};
}
async function createTeams(){
  if(CREATE_STATE.busy||AI_STATE.busy)return;
  createBegin();let engine='Thuật toán',fallback='',context,subset,results,idx=0,key,output;
  try{
    createStep('roster','active','Đọc danh sách đang chọn…');await createYield();
    const selected=selectedIdx();
    if(selected.length<14||selected.length>24)throw new Error('Cần chọn từ 14 đến 24 người (7 vs 7).');
    await createCompleteStep('roster','done',selected.length+' người · 14 đá chính, '+(selected.length-14)+' dự bị.');
    createStep('ratings','active','Kiểm tra điểm và vị trí trước khi chia…');await createYield();
    context=GPAIContext.normalize(aiContextSnapshot('lineup'));
    subset=context.rosterNames.map(n=>context.players.find(p=>p.n===n));
    // Lineup creation never needs an unrelated match/player selected for another AI task.
    context.match=null;context.playerName='';
    const noPosition=subset.filter(p=>!p.pos).length;
    await createCompleteStep('ratings',noPosition?'warn':'done',noPosition?noPosition+' người chưa đăng ký vị trí; cần kiểm tra khi xếp sân.':'Điểm hợp lệ; đã đọc vị trí chính/phụ của từng người.');
    createStep('history','active','Tổng hợp lịch sử bóng đá hiện có…');await createYield();
    const forms=subset.map(p=>GPAIContext.form(p.n,context.history)),done=context.history.filter(m=>m.score&&m.kickoff<=Date.now());
    const withData=forms.filter(f=>f.played>0).length;
    await createCompleteStep('history',done.length?'done':'warn',`${done.length} trận có tỉ số · ${withData}/${subset.length} người có dữ liệu kết quả.`);
    createStep('engine','active','Kiểm tra khả năng dùng AI…');await createYield();
    try{
      AI_STATE.status=await aiFetch('status');aiRenderStatus();
      if(!AI_KEYS.has())fallback='Chưa có key OpenRouter trên trình duyệt này.';
      else engine='AI';
    }catch(e){fallback=e.message;}
    if(engine==='AI'){
      if(!confirm('Gửi dữ liệu bóng đá và Note trực tiếp tới OpenRouter bằng key của bạn? Có thể tính phí. Không gửi tài khoản hoặc thu chi.')){
        createStep('engine','skip','Đã huỷ, không gọi AI.');
        for(const [id,state] of CREATE_STATE.steps)if(state==='pending')createStep(id,'skip');
        createFinish(false,'Đã huỷ. Giữ nguyên danh sách và bản nháp trước đó.');return;
      }
      await createCompleteStep('engine','done','Dùng key cá nhân, gọi trực tiếp OpenRouter qua HTTPS.');
    }else await createCompleteStep('engine','warn',fallback+' Dùng thuật toán.');
    $('createProcessEngine').textContent=engine;
    createStep('search','active',engine==='AI'?'AI đang chia đội…':'Thuật toán đang tìm cách chia và xếp vị trí…');await createYield();
    if(engine==='AI')try{
      const response=await aiFetch('run',{task:'lineup',context});output=response.output;
      if(!output||!Array.isArray(output.subset)||output.subset.length!==subset.length||new Set(output.subset.map(p=>p.n)).size!==subset.length||output.subset.some(p=>!context.rosterNames.includes(p.n)))throw new Error('Kết quả AI không khớp danh sách đã chọn.');
      // Recalculate from our snapshot, not any ratings/evaluation supplied by a model.
      const ordered=output.subset.map(p=>subset.find(x=>x.n===p.n));
      const checked=GPAIContext.lineup(ordered,output.teams);
      subset=ordered;results=[checked.result];output={...output,...checked,subset};key='AI:'+Date.now();
    }catch(e){
      fallback=e.message;engine='Thuật toán';output=null;
      // Metadata only, in memory: never persist keys, prompts or raw responses.
      AI_STATE.lastFailure={kind:e.kind||'unknown',message:e.message,...(e.aiMeta||{})};
      $('createProcessEngine').textContent=engine;
      const rejected=['lineup','output'].includes(e.kind),generationId=e.aiMeta?.generationId;
      createStep('engine','warn',(rejected?'Kết quả AI chưa hợp lệ: ':'Không dùng được AI: ')+fallback+' Đã dùng thuật toán; không gọi lại AI.'+(generationId?' Mã lượt: '+generationId+'.':''));
      createStep('search','active','Đang chia bằng thuật toán thay thế…');await createYield();
    }
    if(engine==='Thuật toán'){
      key='algorithm:'+JSON.stringify({subset,instruction:context.instruction,history:context.history.slice(0,3)});
      if(cstate.key===key&&cstate.results.length){results=cstate.results;idx=(cstate.idx+1)%results.length;}
      else{
        const candidates=await createSolveInWorker(subset);
        if(candidates?.error)throw new Error(candidates.error);
        results=(candidates||[]).flatMap(r=>{
          try{return [GPAIContext.lineup(subset,{A:{starters:r.evA.starters,bench:r.evA.bench},B:{starters:r.evB.starters,bench:r.evB.bench}}).result];}catch{return [];}
        });
        if(!results.length)throw new Error('Không tìm được phương án hợp lệ (gôn, đủ người, chia khách/dự bị). Hãy kiểm tra danh sách và vị trí.');
      }
    }
    await createCompleteStep('search','done',engine==='AI'?'Đã nhận phương án AI; đang kiểm tra độc lập.':`Đã tìm được ${results.length} phương án hợp lệ · đang xem cách ${idx+1}.`);
    createStep('partition','active','Kiểm tra lại số lượng, người trùng/thiếu và khách…');await createYield();
    const r=results[idx],check=GPAIContext.lineup(subset,{A:{starters:r.evA.starters,bench:r.evA.bench},B:{starters:r.evB.starters,bench:r.evB.bench}});
    await createCompleteStep('partition','done',`Mỗi bên 7 đá chính · Dự bị A: ${r.evA.bench.length}, B: ${r.evB.bench.length}. Đủ người, không trùng; khách chia đều.`);
    createStep('balance','active','So điểm tuyến trên và tuyến dưới theo vị trí…');await createYield();
    const front=Math.abs(r.evA.frontFit-r.evB.frontFit),back=Math.abs(r.evA.backFit-r.evB.backFit);
    await createCompleteStep('balance',front>1.5||back>1.5?'warn':'done',`Chênh tổng điểm 3 vị trí: công ${front.toFixed(1)}, thủ ${back.toFixed(1)}. `+(front>1.5||back>1.5?'Có tuyến chênh trên 1.5 điểm; cần kiểm tra so kè.':'Trong ngưỡng kiểm tra 1.5 điểm mỗi tuyến; không lấy gôn bù công/thủ.'));
    createStep('positions','active','Đối chiếu vị trí và chất lượng người dự bị…');await createYield();
    const positionWarnings=check.warnings.filter(w=>!w.startsWith('Chênh '));
    await createCompleteStep('positions',positionWarnings.length?'warn':'done',positionWarnings.length?positionWarnings.join(' '):'Không lệch vị trí; không có dự bị mạnh hơn người đá chính cùng vai trò từ 0.5 điểm.');
    createStep('rotation','active','So với trận gần nhất, không phụ thuộc màu áo…');await createYield();
    const rotation=createRotation(r,subset,context.history);await createCompleteStep('rotation',rotation.state,rotation.detail);
    createStep('note','active','Đối chiếu với Note của lần tạo này…');await createYield();
    const hasNote=!!context.instruction;
    await createCompleteStep('note',hasNote?'warn':'done',!hasNote?'Note trống: không có yêu cầu riêng.':engine==='AI'?'Đã gửi Note hiện tại cho AI; cần đối chiếu trên đội hình.':'Chưa áp dụng Note: thuật toán không hỗ trợ.');
    createStep('draft','active','Vẽ sân và bảng so kè…');await createYield();
    const notes=[...check.warnings];
    if(rotation.state==='warn')notes.push(rotation.detail);
    const review='<p>Bản nháp '+engine+' · Chưa lưu trận.</p>'+(notes.length?'<ul>'+notes.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'');
    render(r,subset,'result',review,true);
    cstate={key,results,idx,subset};
    AI_STATE.draftReview=null;$('aiOutput').hidden=true;
    CREATE_STATE.draftNote=context.instruction;CREATE_STATE.draftEngine=engine;createNoteChanged();
    if(output){
      AI_STATE.output=output;AI_STATE.request={task:'lineup',context};
    }else{$('aiOutput').hidden=true;AI_STATE.output=null;AI_STATE.request=null;}
    $('saveWeek').style.display='inline-block';$('roster').style.display='none';$('toggleRoster').style.display='';$('toggleRoster').textContent='👥 Hiện danh sách';
    $('status').textContent='';
    await createCompleteStep('draft','done','Đã hiển thị đội hình và bảng so kè. Chưa lưu trận.');
    const warnings=[...CREATE_STATE.steps.values()].filter(s=>s==='warn').length;
    createFinish(true,`Hoàn tất bằng ${engine}. ${warnings?warnings+' mục cần lưu ý.':'Đã kiểm tra xong.'}`);
  }catch(e){
    for(const [id,state] of CREATE_STATE.steps)if(state==='active')createStep(id,'error',e.message);
    for(const [id,state] of CREATE_STATE.steps)if(state==='pending')createStep(id,'skip');
    $('status').textContent=e.message+' Giữ nguyên bản nháp trước đó (nếu có).';
    createFinish(false,e.message+' Chưa lưu hoặc sửa trận nào.');
  }
}
