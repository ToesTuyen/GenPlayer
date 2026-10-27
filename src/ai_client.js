// BYOK: keys are separate from football state, backups, prompts and Firebase.
const AI_KEYS=(()=>{
  const storageName='gp_openrouter_device_key_v1';let key='',remembered=false;
  const valid=value=>/^sk-or-[A-Za-z0-9_-]{12,240}$/.test(value);
  function reload(){try{const value=localStorage.getItem(storageName)||'';key=valid(value)?value:'';remembered=!!key;}catch{key='';remembered=false;}}
  reload();
  return {storageName,has:()=>!!key,get:()=>key,remembered:()=>remembered,reload,
    save(value,remember){value=value.trim();if(!valid(value))throw new Error('Key OpenRouter không đúng định dạng. Hãy kiểm tra lại, không dán vào Note.');
      try{if(remember)localStorage.setItem(storageName,value);else localStorage.removeItem(storageName);}catch{throw new Error('Trình duyệt không cho lưu/xoá key. Hãy kiểm tra quyền lưu trữ; chưa thay key đang dùng.');}
      key=value;remembered=remember;
    },
    clear(){try{localStorage.removeItem(storageName);}catch{throw new Error('Chưa xoá được key đã lưu. Hãy xoá dữ liệu trang trong cài đặt trình duyệt.');}key='';remembered=false;}
  };
})();
const AI_STATE={status:null,busy:false,output:null,request:null,draftReview:null,reviewingDraft:false,lastFailure:null};
function aiSecurePage(){return location.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);}
function aiIsPreview(){return window.GP_APP_CONFIG?.dataMode==='preview';}
function aiClientStatus(){return {mode:'direct',keyMode:'device',model:GPAIService.DEFAULTS.model,tasks:GPAIService.TASKS};}
function aiInit(){
  AI_STATE.status=aiClientStatus();
  aiRenderStatus();
  $('aiKeyDialog').addEventListener('cancel',event=>{event.preventDefault();aiSkipKeyDialog();});
  $('aiKeyDialog').addEventListener('close',()=>{$('aiKey').value='';});
  window.addEventListener('storage',event=>{if(event.key===AI_KEYS.storageName||event.key===null){AI_KEYS.reload();aiRenderStatus();}});
  if(!window.GP_APP_CONFIG?.dataMode)return;
  const banner=$('aiModeBanner');banner.style.display='block';
  banner.textContent=aiIsPreview()?'Xem thử · Thay đổi chỉ lưu trên máy, không ghi cloud.':'Đồng bộ cloud · Thay đổi sẽ cập nhật dữ liệu chung.';
}
async function aiFetch(route,body){
  if(route==='status')return aiClientStatus(); // Local metadata only; never contacts a server/provider.
  if(route!=='run')throw new Error('Chức năng AI không hợp lệ.');
  if(!AI_KEYS.has())throw new Error('Nhập và lưu key OpenRouter trên trình duyệt này trước.');
  const prepared=GPAIService.prepare(body);
  const output=await GPAIService.complete(prepared,{...GPAIService.DEFAULTS,apiKey:AI_KEYS.get()});
  return {ok:true,task:prepared.task,output};
}
function aiMessage(text,error=false){const el=$('aiMessage');el.hidden=!text;el.textContent=text;el.className='ai-message'+(error?' error':'');}
function aiKeyMessage(text,error=false){const el=$('aiKeyMessage');el.hidden=!text;el.textContent=text;el.className='ai-message'+(error?' error':'');}
function aiEnterCreate(){if(!AI_KEYS.has())aiOpenKeyDialog();}
function aiOpenKeyDialog(){aiRenderStatus();aiKeyMessage('');const dialog=$('aiKeyDialog');if(!dialog.open)dialog.showModal();}
function aiCloseKeyDialog(){$('aiKey').value='';if($('aiKeyDialog').open)$('aiKeyDialog').close();}
function aiSkipKeyDialog(){aiCloseKeyDialog();aiMessage('');}
function aiRenderStatus(){
  const s=AI_STATE.status||aiClientStatus(),hasKey=AI_KEYS.has();
  $('aiServerStatus').textContent=`${s.model} · Phí tính theo key.`+(hasKey?' Key chưa được xác thực.':'')+(!aiSecurePage()&&location.protocol==='http:'?' Trang HTTP có nguy cơ bị can thiệp; nên dùng HTTPS. API OpenRouter luôn dùng HTTPS.':'');
  $('aiConnectionSummary').textContent=!hasKey?'Chưa có key':AI_KEYS.remembered()?'Đã lưu trên máy':'Chỉ phiên này';
  $('aiKey').disabled=false;$('aiSaveKeyBtn').disabled=false;
  $('aiRemoveKey').hidden=!hasKey;
  $('aiKey').placeholder=hasKey?'Nhập key mới nếu muốn thay':'sk-or-…';
  $('aiKeySkip').textContent=hasKey?'Đóng':'Bỏ qua, dùng thuật toán';
  $('aiRun').disabled=AI_STATE.busy||!hasKey;
  aiSyncDraftAction();
}
async function aiRefresh(){
  AI_STATE.status=aiClientStatus();aiRenderStatus();
}
function aiSaveKey(event){
  event.preventDefault();const input=$('aiKey');
  try{AI_KEYS.save(input.value,$('aiRememberKey').checked);input.value='';aiKeyMessage('');aiRenderStatus();aiCloseKeyDialog();aiMessage('');}
  catch(e){input.value='';aiKeyMessage(e.message,true);}
}
function aiForgetKey(){try{AI_KEYS.clear();$('aiKey').value='';aiRenderStatus();const message='Đã xoá key trên máy, không thu hồi tại OpenRouter.';aiKeyMessage(message);aiMessage(message);}catch(e){aiKeyMessage(e.message,true);}}
function aiPopulateSources(){
  const matchSelect=$('aiMatch'),playerSelect=$('aiPlayer'),oldMatch=matchSelect.value,oldPlayer=playerSelect.value;
  matchSelect.innerHTML=getHistory().slice().sort((a,b)=>(b.kickoff||b.id)-(a.kickoff||a.id)).map(r=>`<option value="${esc(String(r.id))}">${esc(fmtKick(r.kickoff)||r.label||String(r.id))}${r.score?` · ${r.score.a}–${r.score.b}`:' · chưa có tỉ số'}</option>`).join('');
  if([...matchSelect.options].some(o=>o.value===oldMatch))matchSelect.value=oldMatch;
  playerSelect.innerHTML=getPlayers().slice().sort((a,b)=>a.n.localeCompare(b.n,'vi')).map(p=>`<option value="${esc(p.n)}">${esc(p.n)}</option>`).join('');
  if([...playerSelect.options].some(o=>o.value===oldPlayer))playerSelect.value=oldPlayer;
  aiTaskChanged();
}
function renderAIWorkspace(){aiPopulateSources();aiRefresh();}
function aiTaskChanged(){
  const task=$('aiTask').value;
  $('aiRun').hidden=task==='lineup';
  $('aiAnalysisInstructionField').hidden=task==='lineup';
  $('aiMatchField').hidden=task!=='match-review';$('aiPlayerField').hidden=!['player-form','player-description'].includes(task);
}
function openAITask(task,matchId){
  if($('screen-create').style.display!=='block')show('screen-create');
  createSetWizardStep('rules');
  $('aiTask').value=task;
  $('aiAnalysisTools').hidden=task==='lineup';
  renderAIWorkspace();if(matchId!==undefined)$('aiMatch').value=String(matchId);aiTaskChanged();
  $('createAI').scrollIntoView({behavior:'smooth',block:'start'});
}
function aiShowRoster(){
  createSetWizardStep('roster');
  $('roster').closest('.card-box').scrollIntoView({behavior:'smooth',block:'start'});
}
function aiContextSnapshot(task=$('aiTask').value){
  const all=getPlayers().concat(guestPlayers),names=new Set();
  const players=all.map(p=>{names.add(p.n);return GPAIContext.player(p);});
  const matchRecord=getHistory().find(r=>String(r.id)===$('aiMatch').value);
  for(const p of matchRecord?.subset||[])if(p){
    if(!names.has(p.n)){players.push(GPAIContext.player(p));names.add(p.n);}
    else if(task==='match-review')players[players.findIndex(x=>x.n===p.n)]=GPAIContext.player(p);
  }
  const history=getHistory().filter(r=>r.result&&Array.isArray(r.subset)).slice(0,500).map(GPAIContext.compactLegacy);
  return {players,history,rosterNames:selectedIdx().map(i=>curPlayers[i]?.n).filter(Boolean),match:matchRecord?GPAIContext.compactLegacy(matchRecord):null,playerName:$('aiPlayer').value,instruction:$(task==='lineup'?'aiInstruction':'aiAnalysisInstruction').value.trim()};
}
function aiMatchFingerprint(match,players){
  if(!match)return null;const names=new Set([...match.teams.A,...match.teams.B].map(p=>p.n));
  return JSON.stringify({match,profiles:players.filter(p=>names.has(p.n)).map(GPAIContext.player).sort((a,b)=>a.n.localeCompare(b.n,'vi'))});
}
function aiDraftFingerprint(){
  if(typeof cstate==='undefined'||!cstate.subset||!cstate.results[cstate.idx])return null;
  return JSON.stringify({key:cstate.key,index:cstate.idx,subset:cstate.subset,result:cstate.results[cstate.idx]});
}
function aiSyncDraftAction(){
  const button=$('reviewDraft');button.hidden=!aiDraftFingerprint();
  button.disabled=AI_STATE.busy||(typeof CREATE_STATE!=='undefined'&&CREATE_STATE.busy);
  $('reviewDraftLabel').textContent=AI_STATE.reviewingDraft?'Đang đánh giá…':'Đánh giá';
}
function aiDraftContext(){
  if(!aiDraftFingerprint())throw new Error('Tạo đội hình trước khi đánh giá.');
  const subset=structuredClone(cstate.subset),result=structuredClone(cstate.results[cstate.idx]);
  const match=GPAIContext.compactLegacy({id:'current-lineup-draft',kickoff:Date.now(),subset,result});
  match.kickoff=0; // Draft has no scheduled date; prepare() uses past completed matches, not this placeholder.
  return {players:subset.map(GPAIContext.player),history:getHistory().filter(r=>r.result&&Array.isArray(r.subset)).slice(0,500).map(GPAIContext.compactLegacy),rosterNames:subset.map(p=>p.n),match,playerName:'',instruction:''};
}
function aiDraftReviewFields(){
  const review=AI_STATE.draftReview;if(!review||review.fingerprint!==aiDraftFingerprint())return {};
  return {review:aiReviewHTML(review.output),aiReview:{model:review.output.model,createdAt:review.output.createdAt}};
}
async function aiReviewDraft(){
  if(AI_STATE.busy||CREATE_STATE.busy)return;
  let context,fingerprint;
  try{fingerprint=aiDraftFingerprint();context=aiDraftContext();}catch(e){aiMessage(e.message,true);return;}
  if(!AI_KEYS.has()){aiOpenKeyDialog();aiKeyMessage('Cần key để đánh giá. Bỏ qua vẫn giữ đội hình.');return;}
  if(!confirm('Gửi đội hình, chỉ số và kết quả bóng đá tới OpenRouter để đánh giá? Có thể tính phí. Không gửi Note, tài khoản hoặc thu chi.'))return;
  AI_STATE.busy=true;AI_STATE.reviewingDraft=true;aiRenderStatus();$('go').disabled=true;
  aiMessage('Đang đánh giá đội hình…');
  try{
    const response=await aiFetch('run',{task:'match-review',context});
    if(fingerprint!==aiDraftFingerprint()){aiMessage('Đội hình đã thay đổi trong lúc đánh giá. Đã bỏ kết quả cũ; hãy đánh giá lại.',true);return;}
    AI_STATE.draftReview={fingerprint,output:response.output};AI_STATE.output=response.output;
    AI_STATE.request={task:'match-review',context,source:'draft',draftFingerprint:fingerprint};
    aiRenderOutput();aiMessage('');
  }catch(e){aiMessage(e.message,true);}finally{AI_STATE.busy=false;AI_STATE.reviewingDraft=false;$('go').disabled=false;aiRenderStatus();}
}
async function aiRun(){
  if(AI_STATE.busy||CREATE_STATE.busy)return;
  if($('aiTask').value==='lineup')return createTeams();
  let context;const task=$('aiTask').value;
  try{context=aiContextSnapshot();if(task==='lineup'&&context.rosterNames.length<14)throw new Error('Chọn ít nhất 14 người có mặt trước khi tạo đội bằng AI.');}catch(e){aiMessage(e.message,true);return;}
  if(!confirm('Gửi dữ liệu bóng đá trực tiếp tới OpenRouter bằng key của bạn? Có thể tính phí. Không gửi tài khoản hoặc thu chi.'))return;
  AI_STATE.busy=true;aiRenderStatus();$('aiRun').textContent='Đang phân tích…';aiMessage('Đang phân tích…');
  try{
    const response=await aiFetch('run',{task,context});
    AI_STATE.output=response.output;AI_STATE.request={task,context,matchId:context.match?.id,matchSnapshot:aiMatchFingerprint(context.match,context.players)};
    aiRenderOutput();aiMessage('');
  }catch(e){aiMessage(e.message,true);}finally{AI_STATE.busy=false;$('aiRun').textContent='Phân tích';await aiRefresh();}
}
function aiPlainOutput(){const o=AI_STATE.output;if(!o)return '';return o.title+'\n\n'+o.sections.map(s=>s.heading+'\n'+s.body).join('\n\n');}
function aiReviewHTML(o){return '<p class="rv-lead"><b>'+esc(o.title)+'</b></p>'+o.sections.map(s=>'<p><b>'+esc(s.heading)+'</b><br>'+esc(s.body).replace(/\n/g,'<br>')+'</p>').join('');}
function aiRenderOutput(showLineupPreview=true){
  const o=AI_STATE.output,task=AI_STATE.request.task;
  $('aiOutput').hidden=false;$('aiOutputText').innerHTML='<h2>'+esc(o.title)+'</h2>'+o.sections.map(s=>'<section><h3>'+esc(s.heading)+'</h3><p>'+esc(s.body)+'</p></section>').join('');
  if(task==='player-form'){
    const labels={increase:'Cân nhắc tăng',decrease:'Cân nhắc giảm',keep:'Giữ điểm',insufficient:'Chưa đủ dữ liệu'};
    $('aiOutputText').innerHTML+='<div class="ai-label">'+labels[o.verdict]+' · chỉ đề xuất, không tự sửa điểm</div>'+o.suggestions.map(s=>'<p>'+esc(s.attribute+' · '+({increase:'tăng',decrease:'giảm',keep:'giữ'}[s.direction])+': '+s.reason)+'</p>').join('');
  }
  $('aiOutputMeta').textContent=`${o.model} · ${new Date(o.createdAt).toLocaleString('vi-VN')}`+(o.usage?` · ${o.usage.promptTokens} token vào / ${o.usage.completionTokens} token ra`:'');
  $('aiUseLineup').hidden=task!=='lineup'||!showLineupPreview;$('aiSaveReview').hidden=task!=='match-review'||AI_STATE.request.source==='draft';
  $('aiLineupPreview').innerHTML='';$('aiWarnings').textContent=(o.warnings||[]).join('\n');
  if(task==='lineup'&&showLineupPreview)render(o.result,o.subset,'aiLineupPreview','<p>Bản nháp AI · Chưa lưu trận.</p>',false);
  if(showLineupPreview)$('aiOutput').scrollIntoView({behavior:'smooth',block:'start'});
}
async function aiCopy(){try{await navigator.clipboard.writeText(aiPlainOutput());aiMessage('Đã sao chép nội dung AI.');}catch{aiMessage('Trình duyệt không cho sao chép. Bạn có thể chọn nội dung bên dưới để copy.',true);}}
function aiUseLineup(){
  if(AI_STATE.request?.task!=='lineup'||!AI_STATE.output)return;
  const o=AI_STATE.output;if($('screen-create').style.display!=='block')show('screen-create');
  const chosen=new Set(o.subset.map(p=>p.n)),current=selectedIdx().map(i=>curPlayers[i]?.n).filter(Boolean);
  if(current.length!==chosen.size||current.some(n=>!chosen.has(n)))if(!confirm('Danh sách người có mặt đã đổi sau khi AI tạo đội. Dùng lại danh sách của bản nháp AI này?'))return;
  $('roster').querySelectorAll('input').forEach(c=>{c.checked=chosen.has(curPlayers[+c.dataset.i].n);c.closest('.pl-item').classList.toggle('on',c.checked);c.closest('.pl-item').classList.toggle('off',!c.checked);});updateCount();
  cstate={key:'AI:'+Date.now(),results:[structuredClone(o.result)],idx:0,subset:structuredClone(o.subset)};
  AI_STATE.draftReview=null;aiSyncDraftAction();
  render(cstate.results[0],cstate.subset,'result','<p>Bản nháp AI · Chưa lưu trận.</p>',true);$('saveWeek').style.display='inline-block';
  $('status').textContent='';
  $('result').scrollIntoView({behavior:'smooth',block:'start'});
}
async function aiSaveReview(){
  if(AI_STATE.request?.task!=='match-review'||!AI_STATE.output)return;
  if(AI_STATE.request.source==='draft'){aiMessage('Chọn Lưu làm đội tuần này để lưu kèm nhận định.');return;}
  if(aiIsPreview()){aiMessage('Bản xem thử không ghi nhận định lên cloud. Bạn có thể Sao chép.',true);return;}
  if(!requireAdmin())return;
  const request=AI_STATE.request,output=AI_STATE.output;
  if(!confirm('Lưu nhận định vào đúng trận đã chọn? Chỉ thay phần nhận định, giữ đội hình, tỉ số và bàn thắng.'))return;
  if(!(STATE.cloud&&STATE.docRef)){aiMessage('Chưa kết nối Firestore; không lưu để tránh ghi nhầm dữ liệu.',true);return;}
  try{
    await firebase.firestore().runTransaction(async tx=>{
      const snap=await tx.get(STATE.docRef),history=snap.data()?.history;if(!Array.isArray(history))throw new Error('Không đọc được lịch sử.');
      const r=history.find(m=>String(m.id)===String(request.matchId));if(!r)throw new Error('Trận đã bị xóa.');
      if(aiMatchFingerprint(GPAIContext.compactLegacy(r),r.subset)!==request.matchSnapshot)throw new Error('Đội hình/kết quả đã thay đổi. Hãy tạo nhận định mới để không lưu bản cũ.');
      r.review=aiReviewHTML(output);r.aiReview={model:output.model,createdAt:output.createdAt};tx.update(STATE.docRef,{history});
    });aiMessage('Đã lưu nhận định.');
  }catch(e){aiMessage(e.message,true);}
}
