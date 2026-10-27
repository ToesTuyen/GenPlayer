// One Create action. Stages report real work/checks, never simulated model reasoning.
const CREATE_STEPS=[
  ['roster','Danh sách & thể thức 7 vs 7'],
  ['ratings','Chỉ số & vị trí đăng ký'],
  ['history','Dữ liệu phong độ, thắng thua & bàn thắng'],
  ['engine','Kết nối bộ xử lý'],
  ['search','Tìm phương án chia đội'],
  ['partition','Đủ người, dự bị & chia khách'],
  ['balance','Cân riêng hàng công & hàng thủ'],
  ['reserves','Cân sức mạnh dự bị'],
  ['quality','Tổng lực, ngôi sao, tốc độ & thể lực'],
  ['positions','Đúng vị trí & ưu tiên người mạnh'],
  ['rotation','Đối chiếu đội hình gần nhất'],
  ['note','Yêu cầu riêng từ Note'],
  ['draft','Hiển thị đội hình & bảng so kè']
];
const CREATE_STEP_READ_MS=1000; // Presentation dwell only; never marks unfinished work as complete.
const CREATE_STATE={busy:false,steps:new Map(),startedAt:new Map(),success:false,hasReport:false,draftNote:null,draftEngine:null,cancelled:false};
const CREATE_LOG=typeof GPCreationLog==='undefined'?null:GPCreationLog.createStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)});
const CREATE_CLOUD_PREFIX='generation_';
const CREATE_CLOUD={state:'idle',records:[],error:''};
let CREATE_LOG_VIEW=[];
let CREATE_RUN_ID=null;
let CREATE_TAB='build';
let CREATE_WIZARD_STEP='roster';
let CREATE_WIZARD_KEY_PROMPTED=false;
function createSyncWizard(count){
  const n=Number.isFinite(count)?count:(typeof selectedIdx==='function'?selectedIdx().length:0),valid=n>=14&&n<=24;
  const next=$('createNextStep'),rules=$('createRulesStepBtn'),badge=$('createStepCount');
  if(next)next.disabled=!valid;if(rules)rules.disabled=!valid;if(badge)badge.textContent=n+' người đã chọn';
  return valid;
}
function createSetWizardStep(step='roster',force=false,promptForKey=true){
  const rules=step==='rules';
  if(rules&&!force&&!createSyncWizard())return false;
  CREATE_WIZARD_STEP=rules?'rules':'roster';
  const rosterPanel=$('createRosterStep'),rulesPanel=$('createRulesStep'),rosterButton=$('createRosterStepBtn'),rulesButton=$('createRulesStepBtn');
  rosterPanel.hidden=rules;rulesPanel.hidden=!rules;
  rosterButton.classList.toggle('on',!rules);rulesButton.classList.toggle('on',rules);
  rosterButton.setAttribute('aria-selected',String(!rules));rulesButton.setAttribute('aria-selected',String(rules));
  rosterButton.tabIndex=rules?-1:0;rulesButton.tabIndex=rules?0:-1;
  createSyncWizard();
  if(rules&&promptForKey&&!CREATE_WIZARD_KEY_PROMPTED){CREATE_WIZARD_KEY_PROMPTED=true;aiEnterCreate();}
  return true;
}
function createResetWizard(){CREATE_WIZARD_KEY_PROMPTED=false;createSetWizardStep('roster');}
function createLogPatch(changes){try{CREATE_LOG?.patch(CREATE_RUN_ID,changes);}catch{}}
function createCloudEnabled(){
  try{return !(typeof aiIsPreview==='function'&&aiIsPreview())&&typeof STATE!=='undefined'&&STATE.cloud&&STATE.docRef&&typeof firebase!=='undefined'&&firebase.firestore;}catch{return false;}
}
function createCloudCollection(){return createCloudEnabled()?STATE.docRef.parent:null;}
function createCloudDocId(id){return CREATE_CLOUD_PREFIX+String(id||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,120);}
function createCloudTimeout(promise,ms=8000){
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('cloud-timeout')),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
}
async function createCloudPush(runId=CREATE_RUN_ID){
  if(!createCloudEnabled()||!runId)return {state:'off'};
  const run=(CREATE_LOG?.list()||[]).find(r=>r.id===runId);if(!run)return {state:'missing'};
  const record=GPCreationLog.cloudRecord(run),startedAt=record.startedAt||new Date().toISOString();
  const payload={kind:'generationLog',schemaVersion:1,runId:record.id,startedAt,updatedAt:record.updatedAt||startedAt,endedAt:record.endedAt||null,status:record.status||'unknown',engine:record.engine||'',appRelease:record.appRelease||'',expiresAt:new Date(Date.parse(startedAt)+30*86400000).toISOString(),record};
  try{
    await createCloudTimeout(createCloudCollection().doc(createCloudDocId(runId)).set(payload),8000);
    CREATE_CLOUD.state='saved';CREATE_CLOUD.error='';return {state:'saved'};
  }catch{
    CREATE_CLOUD.state='failed';CREATE_CLOUD.error='Không kết nối được nơi lưu log cloud.';return {state:'failed'};
  }
}
async function createCloudFetch(){
  if(!createCloudEnabled())return [];
  try{
    const snap=await createCloudTimeout(createCloudCollection().orderBy('startedAt','desc').limit(30).get(),8000),records=[];
    for(const doc of snap.docs||[]){const d=doc.data();if(!doc.id.startsWith(CREATE_CLOUD_PREFIX)||d?.kind!=='generationLog'||!d.record)continue;const r=GPCreationLog.cloudRecord(d.record);if(r.id&&r.startedAt)records.push(r);}
    CREATE_CLOUD.records=records;CREATE_CLOUD.state='loaded';CREATE_CLOUD.error='';return records;
  }catch{
    CREATE_CLOUD.state='failed';CREATE_CLOUD.error='Không đọc được log cloud.';return CREATE_CLOUD.records;
  }
}
function createMergeLogs(local,cloud){
  const records=new Map();for(const r of cloud||[])if(r?.id)records.set(r.id,r);for(const r of local||[])if(r?.id)records.set(r.id,r);
  return [...records.values()].sort((a,b)=>String(b.startedAt||'').localeCompare(String(a.startedAt||''))).slice(0,GPCreationLog.MAX_RUNS||30);
}
const CREATE_LOG_STATUS={running:'Đang xử lý',success:'Hoàn tất',failed:'Thất bại',cancelled:'Đã huỷ',interrupted:'Bị gián đoạn'};
const CREATE_LOG_ROLE={GK:'Gôn',Thòng:'Thòng',HV:'Hậu vệ',TVtt:'Giữa',TV:'Cánh','TĐ':'Tiền đạo'};
function createLogNode(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function createLogGenerationId(r){return typeof r?.ai?.generationId==='string'&&r.ai.generationId?r.ai.generationId:'';}
function createLogUsable(r){return r?.status==='success'&&Array.isArray(r?.input?.players)&&r.input.players.length>=14&&['A','B'].every(side=>Array.isArray(r?.output?.teams?.[side])&&r.output.teams[side].filter(p=>!p.bench).length===7);}
function createLogTeam(side,rows){
  const box=createLogNode('section','create-log-team'),title=createLogNode('div','create-log-team-title',(side==='A'?'🔴':'🟡')+' Team '+side);box.appendChild(title);
  const starters=rows.filter(p=>!p.bench),bench=rows.filter(p=>p.bench);
  for(const p of starters){const row=createLogNode('div','create-log-player'),name=createLogNode('span','',p.n||'—'),meta=createLogNode('span','',`${CREATE_LOG_ROLE[p.slot]||p.slot||'Vị trí'}${Number.isFinite(+p.rating)?' · '+(+p.rating).toFixed(1):''}`);row.append(name,meta);box.appendChild(row);}
  const reserve=createLogNode('div','create-log-bench','Dự bị: '+(bench.length?bench.map(p=>p.n+(Number.isFinite(+p.rating)?' '+(+p.rating).toFixed(1):'')).join(', '):'—'));box.appendChild(reserve);return box;
}
function createRenderLogCards(records){
  const list=$('createLogList');list.replaceChildren();
  if(!records.length){list.appendChild(createLogNode('div','create-log-empty','Chưa có lượt tạo đội nào.'));return;}
  for(const r of records){
    const card=createLogNode('article','create-log-card'),head=createLogNode('div','create-log-head'),headText=createLogNode('div',''),when=new Date(r.startedAt),title=createLogNode('div','create-log-title',Number.isNaN(when.getTime())?'Lượt tạo đội':when.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}));
    const meta=createLogNode('div','create-log-meta',(r.engine||r.requestedEngine||'Chưa rõ')+' · '+(r.input?.players?.length||0)+' người'),status=createLogNode('span','create-log-status '+(r.status||''),CREATE_LOG_STATUS[r.status]||r.status||'Chưa rõ');headText.append(title,meta);head.append(headText,status);card.appendChild(head);
    if(createLogUsable(r)){const teams=createLogNode('div','create-log-teams');teams.append(createLogTeam('A',r.output.teams.A),createLogTeam('B',r.output.teams.B));card.appendChild(teams);}
    else card.appendChild(createLogNode('div','create-log-empty',r.status==='success'?'Lượt cũ thiếu dữ liệu đội hình để dùng lại.':'Không có đội hình hoàn tất.'));
    const actions=createLogNode('div','create-log-actions'),codes=createLogNode('div','create-log-code','Mã log: '+r.id+(createLogGenerationId(r)?'\nMã gen AI: '+createLogGenerationId(r):'')),button=createLogNode('button','btn sm',createLogUsable(r)?'Đặt làm trận tuần này':'Không thể dùng');
    button.type='button';button.disabled=!createLogUsable(r);if(!button.disabled)button.onclick=()=>createUseLog(r.id);actions.append(codes,button);card.appendChild(actions);list.appendChild(card);
  }
}
function createRenderLogList(records){
  CREATE_LOG_VIEW=records;const select=$('createLogSelect'),selected=select.value;select.replaceChildren();
  for(const r of records){const option=document.createElement('option');option.value=r.id;option.textContent=new Date(r.startedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' · '+(CREATE_LOG_STATUS[r.status]||r.status)+' · '+(r.engine||'')+' · '+r.id;select.appendChild(option);}
  if(selected&&records.some(r=>r.id===selected))select.value=selected;
  const localOk=CREATE_LOG?.persisted();
  $('createLogNotice').textContent=CREATE_CLOUD.state==='loading'?'Đang đọc 30 lượt gần nhất từ cloud…':CREATE_CLOUD.state==='loaded'||CREATE_CLOUD.state==='saved'?'Đã gộp log trên máy và cloud. Không lưu key OpenRouter.':CREATE_CLOUD.state==='failed'?(CREATE_CLOUD.error+' Log trên máy vẫn dùng được.'):(localOk?'Log đang lưu trên máy; cloud chưa kết nối.':'Trình duyệt chặn lưu local; cloud chưa kết nối.');
  $('createLogExport').disabled=!records.length;createRenderLogCards(records);createShowLog();
}
function createSetTab(tab='build'){
  CREATE_TAB=tab==='history'?'history':'build';const history=CREATE_TAB==='history';
  $('createBuildTab').hidden=history;$('createHistoryTab').hidden=!history;
  $('createBuildTabBtn').classList.toggle('on',!history);$('createHistoryTabBtn').classList.toggle('on',history);
  $('createBuildTabBtn').setAttribute('aria-selected',String(!history));$('createHistoryTabBtn').setAttribute('aria-selected',String(history));
  $('createBuildTabBtn').tabIndex=history?-1:0;$('createHistoryTabBtn').tabIndex=history?0:-1;
}
async function createOpenLogs(){
  createSetTab('history');
  const local=CREATE_LOG?.list()||[];CREATE_CLOUD.state=createCloudEnabled()?'loading':'off';
  createRenderLogList(createMergeLogs(local,CREATE_CLOUD.records));
  if(CREATE_CLOUD.state!=='loading')return;
  const cloud=await createCloudFetch();createRenderLogList(createMergeLogs(CREATE_LOG?.list()||[],cloud));
}
function createShowLog(){const r=CREATE_LOG_VIEW.find(r=>r.id===$('createLogSelect').value);$('createLogDetails').textContent=r?JSON.stringify(r,null,2):'Chưa có nhật ký tạo đội.';}
function createDraftFromLog(r){
  if(!createLogUsable(r))throw new Error('Lượt này không có đội hình hoàn tất để dùng lại.');
  const players=r.input.players.map(GPAIContext.player),indices=new Map(players.map((p,i)=>[p.n,i])),teams={A:{starters:[],bench:[]},B:{starters:[],bench:[]}};
  for(const side of ['A','B'])for(const p of r.output.teams[side]){const i=indices.get(p.n);if(i===undefined)throw new Error('Thiếu cầu thủ '+p.n+' trong dữ liệu lượt tạo.');teams[side][p.bench?'bench':'starters'].push(i);}
  const history=Array.isArray(r.input.history)?r.input.history:(r.input.rotationReference?[r.input.rotationReference]:[]),now=Date.parse(r.startedAt)||Date.now();
  const checked=GPAIContext.lineup(players,teams,{instruction:r.input.instruction||'',history,now});
  return {players,result:checked.result};
}
function createUseLog(id){
  if(!canEdit){alert('🔒 Đặt làm trận tuần này cần đăng nhập admin.');openAdminModal();return;}
  const record=CREATE_LOG_VIEW.find(r=>r.id===id);let draft;
  try{draft=createDraftFromLog(record);}catch(e){alert('Không nạp được đội hình: '+e.message);return;}
  cstate={key:'history:'+record.id,results:[draft.result],idx:0,subset:draft.players,inputKey:''};
  AI_STATE.draftReview=null;$('aiOutput').hidden=true;aiSyncDraftAction();
  CREATE_STATE.draftNote=record.input?.instruction||'';CREATE_STATE.draftEngine=record.engine||'Lịch sử';CREATE_STATE.hasReport=false;$('reviewProcess').style.display='none';createNoteChanged();
  render(draft.result,draft.players,'result','',true);$('status').textContent='Đã nạp đội hình từ '+record.id;$('saveWeek').style.display='inline-block';
  createRevealDraft();openMatchModal('create');
}
function createExportLogs(){
  if(!CREATE_LOG)return;const body=GPCreationLog.exportRecords?GPCreationLog.exportRecords(CREATE_LOG_VIEW):CREATE_LOG.export(),url=URL.createObjectURL(new Blob([body],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='genplayer-gen-log-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{if(CREATE_STATE.busy){createLogPatch({status:'interrupted',error:{message:'Trang đã đóng hoặc tải lại khi đang xử lý; yêu cầu provider có thể vẫn đang chạy.'}});createCloudPush().catch(()=>{});}});
function createNoteChanged(){
  const box=$('createNoteStatus'),note=CREATE_STATE.draftNote;
  if(note===null){box.hidden=true;return;}
  const changed=$('aiInstruction').value.trim()!==note,algorithm=CREATE_STATE.draftEngine==='Thuật toán';
  if(!note&&!changed){box.hidden=true;box.replaceChildren();return;}
  box.hidden=false;box.dataset.state='warn';
  const heading=document.createElement('strong');
  heading.textContent=changed?'Note đã thay đổi — cần tạo đội lại':algorithm?'Thuật toán dùng quy tắc và ngoại lệ vị trí rõ ràng; Note khác cần đối chiếu':'Note đã gửi AI — chưa xác minh tự động';
  box.replaceChildren(heading);
  if(note){const quote=document.createElement('blockquote');quote.textContent=note;box.appendChild(quote);}
}
const createYield=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
function createStep(id,state,detail=''){
  try{CREATE_LOG?.event(CREATE_RUN_ID,id,state,detail);}catch{}
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
  CREATE_RUN_ID=null;try{CREATE_RUN_ID=CREATE_LOG?.begin(document.querySelector('meta[name="genplayer-release"]')?.content||'')||null;}catch{}
  CREATE_STATE.cancelled=false;
  if($('createRunLabel'))$('createRunLabel').textContent=CREATE_RUN_ID?'Log: '+CREATE_RUN_ID:'';
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
async function createFinish(success,message){
  createLogPatch({status:success?'success':CREATE_STATE.cancelled?'cancelled':'failed',endedAt:new Date().toISOString(),...(success?{error:null}:{})});
  const cloud=await createCloudPush();
  CREATE_STATE.busy=false;CREATE_STATE.success=success;CREATE_STATE.hasReport=true;$('go').disabled=false;
  aiSyncDraftAction();
  $('reviewProcess').style.display='';
  $('roster').querySelectorAll('input').forEach(c=>c.disabled=false);updateCount();
  $('createProcessTitle').textContent=success?'Đã tạo đội hình nháp':'Chưa tạo được đội';
  $('createProcessSummary').textContent=message+(cloud.state==='saved'?' Log cloud đã lưu.':cloud.state==='failed'?' Log chỉ lưu trên máy này vì cloud chưa xác nhận.':'');$('createProcessSummary').hidden=false;
  $('createProcessClose').disabled=false;$('createProcessClose').textContent=success?'Xem đội hình':'Đóng';
  $('createProcessClose').focus();
  $('createProcessSteps').scrollTop=0;
}
function createReviewProcess(){
  if(CREATE_STATE.busy||!CREATE_STATE.hasReport)return;
  $('createProcess').showModal();$('createProcessSteps').scrollTop=0;
}
$('createProcess').addEventListener('cancel',event=>{if(CREATE_STATE.busy)event.preventDefault();});
function createRevealDraft(){
  createSetTab('build');createSetWizardStep('rules',true,false);const result=$('result');result.hidden=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    try{fitMatch();}catch{}
    try{result.scrollIntoView({behavior:'auto',block:'start'});}catch{window.scrollTo(0,result.offsetTop||0);}
  }));
}
$('createProcessClose').onclick=()=>{
  if(CREATE_STATE.busy)return;
  const dialog=$('createProcess');if(dialog.open)dialog.close();
  if(CREATE_STATE.success)createRevealDraft();
  else $('go').focus();
};
function createSolveInWorker(players,instruction='',history=[],now=Date.now(),excludeGroups=[]){
  return new Promise((resolve,reject)=>{
    let worker,url,timer;
    const finish=(error,data)=>{clearTimeout(timer);if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);error?reject(error):resolve(data);};
    try{
      url=URL.createObjectURL(new Blob([$('solverWorkerSource').textContent],{type:'application/javascript'}));
      worker=new Worker(url);
      worker.onmessage=event=>event.data.error?finish(new Error(event.data.error)):finish(null,event.data.results);
      worker.onerror=event=>{event.preventDefault();finish(new Error('Không chạy được thuật toán trong trình duyệt này. Hãy tải lại trang và thử lại.'));};
      timer=setTimeout(()=>finish(new Error('Thuật toán vượt quá 90 giây. Hãy giảm danh sách rồi thử lại. Chưa thay đổi trận.')),90000);
      worker.postMessage({players,instruction,history,now,excludeGroups});
    }catch{finish(new Error('Trình duyệt không mở được bộ xử lý thuật toán. Hãy cho phép Web Worker rồi thử lại.'));}
  });
}
function createRotation(result,subset,history,now=Date.now()){
  const r=GPAIContext.lineupRotation(subset,{A:result.evA,B:result.evB},history,now);
  return {state:r.checked&&r.maxTogether<=r.limit?'done':'warn',detail:!r.checked?r.reason:`Tối đa ${r.maxTogether}/${r.limit} đồng đội cũ cùng bên, không phụ thuộc màu áo. ${r.samePositions} người giữ vai trò phù hợp; không ép đổi sai vị trí.`};
}
async function createTeams(){
  if(CREATE_STATE.busy||AI_STATE.busy)return;
  createBegin();let engine='Thuật toán',fallback='',context,subset,results,localResults,idx=0,key,output,inputKey,requestedAI=false;
  try{
    createStep('roster','active','Đọc danh sách đang chọn…');await createYield();
    const selected=selectedIdx();
    if(selected.length<14||selected.length>24)throw new Error('Cần chọn từ 14 đến 24 người (7 vs 7).');
    await createCompleteStep('roster','done',selected.length+' người · 14 đá chính, '+(selected.length-14)+' dự bị.');
    createStep('ratings','active','Kiểm tra điểm và vị trí trước khi chia…');await createYield();
    context=GPAIContext.normalize(aiContextSnapshot('lineup'));
    const lineupNow=Date.now();
    subset=context.rosterNames.map(n=>context.players.find(p=>p.n===n));
    // Lineup creation never needs an unrelated match/player selected for another AI task.
    context.match=null;context.playerName='';
    const logInput=GPCreationLog.snapshot(context,lineupNow);inputKey=GPCreationLog.inputKey(logInput);
    const seenGroups=new Set(CREATE_LOG?.seen(inputKey)||[]);
    if(cstate.inputKey===inputKey&&cstate.results.length)seenGroups.add(GPAIContext.lineupGroupKey(cstate.subset,{A:cstate.results[cstate.idx].evA,B:cstate.results[cstate.idx].evB}));
    createLogPatch({input:logInput,inputKey,selection:{excludedCount:seenGroups.size},validation:{limits:GPAIContext.LINEUP_LIMITS}});
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
      requestedAI=true;createLogPatch({requestedEngine:'AI'});
      if(!confirm('Gửi dữ liệu bóng đá và Note trực tiếp tới OpenRouter bằng key của bạn? Có thể tính phí. Không gửi tài khoản hoặc thu chi.')){
        CREATE_STATE.cancelled=true;
        createStep('engine','skip','Đã huỷ, không gọi AI.');
        for(const [id,state] of CREATE_STATE.steps)if(state==='pending')createStep(id,'skip');
        await createFinish(false,'Đã huỷ. Giữ nguyên danh sách và bản nháp trước đó.');return;
      }
      await createCompleteStep('engine','done','Dùng key cá nhân, gọi trực tiếp OpenRouter qua HTTPS.');
    }else{createLogPatch({requestedEngine:'Thuật toán',fallback:{reason:fallback,from:'AI',to:'Thuật toán'}});await createCompleteStep('engine','warn',fallback+' Dùng thuật toán.');}
    $('createProcessEngine').textContent=engine;
    createStep('search','active',engine==='AI'?'Chuẩn bị các phương án đủ người, đúng số vị trí…':'Thuật toán đang tìm cách chia và xếp vị trí…');await createYield();
    const lineupOptions=()=>({instruction:context.instruction,history:context.history,now:lineupNow});
    const noCandidate='Không tìm được đội hình đạt tiêu chí bắt buộc về vị trí, người mạnh đá chính, công/thủ, dự bị, tổng lực, thể chất và xoay tua. Không tự nới tiêu chí; hãy kiểm tra danh sách và dữ liệu trận trước.';
    const validCandidates=candidates=>{
      if(candidates?.error)throw Object.assign(new Error(candidates.error),{kind:'solver',code:candidates.code,diagnostics:candidates.diagnostics,search:candidates.search});
      return (Array.isArray(candidates)?candidates:[]).flatMap(r=>{
        try{const checked=GPAIContext.lineup(subset,{A:{starters:r.evA.starters,bench:r.evA.bench},B:{starters:r.evB.starters,bench:r.evB.bench}},lineupOptions()).result;return seenGroups.has(GPAIContext.lineupGroupKey(subset,{A:checked.evA,B:checked.evB}))?[]:[checked];}catch{return [];}
      });
    };
    localResults=validCandidates(await createSolveInWorker(subset,context.instruction,context.history,lineupNow,[...seenGroups]));
    if(!localResults.length)throw new Error(noCandidate+' Chưa gọi AI.');
    const allowedGroups=new Set(localResults.map(r=>GPAIContext.lineupGroupKey(subset,{A:r.evA,B:r.evB})));
    createLogPatch({selection:{excludedCount:seenGroups.size,candidateCount:localResults.length,candidateGroups:[...allowedGroups]}});
    if(engine==='AI'){
      context.lineupCandidates=localResults.slice(0,8).map(r=>({teams:{A:{starters:r.evA.starters,bench:r.evA.bench},B:{starters:r.evB.starters,bench:r.evB.bench}}}));
      createStep('search','active','AI đang chọn trong các phương án khác nhau đã đạt đủ tiêu chí…');await createYield();
    }
    if(engine==='AI')try{
      const response=await aiFetch('run',{task:'lineup',context});output=response.output;
      if(!output||!Array.isArray(output.subset)||output.subset.length!==subset.length||new Set(output.subset.map(p=>p.n)).size!==subset.length||output.subset.some(p=>!context.rosterNames.includes(p.n)))throw new Error('Kết quả AI không khớp danh sách đã chọn.');
      // Recalculate from our snapshot, not any ratings/evaluation supplied by a model.
      const ordered=output.subset.map(p=>subset.find(x=>x.n===p.n));
      const checked=GPAIContext.lineup(ordered,output.teams,lineupOptions());
      const group=GPAIContext.lineupGroupKey(ordered,output.teams);
      if(output.plan?.skipped||output.plan?.requested||seenGroups.has(group)||!allowedGroups.has(group))throw Object.assign(new Error('Kết quả AI không phải phương án mới đã được kiểm tra.'),{kind:'lineup',aiMeta:{generationId:output.generationId,model:output.model,usage:output.usage}});
      createLogPatch({ai:{decision:'accepted',candidateId:output.plan?.candidateId,generationId:output.generationId,model:output.model,usage:output.usage}});
      subset=ordered;results=[checked.result];output={...output,...checked,warnings:[...new Set([...checked.warnings,...(output.warnings||[])])],subset};key='AI:'+Date.now();
    }catch(e){
      fallback=e.message;engine='Thuật toán';output=null;
      AI_STATE.lastFailure={kind:e.kind||'unknown',message:e.message,...(e.aiMeta||{}),proposal:e.aiProposal};
      createLogPatch({ai:{decision:'rejected',kind:e.kind||'unknown',reason:e.message,generationId:e.aiMeta?.generationId,model:e.aiMeta?.model,usage:e.aiMeta?.usage,finishReason:e.aiMeta?.finishReason,proposal:e.aiProposal},fallback:{from:'AI',to:'Thuật toán',reason:e.message}});
      $('createProcessEngine').textContent=engine;
      const rejected=['lineup','output'].includes(e.kind),generationId=e.aiMeta?.generationId;
      createStep('engine','warn',(rejected?'Kết quả AI chưa hợp lệ: ':'Không dùng được AI: ')+fallback+' Đã dùng thuật toán; không gọi lại AI.'+(generationId?' Mã lượt: '+generationId+'.':''));
      createStep('search','active','Đang chia bằng thuật toán thay thế…');await createYield();
    }
    if(engine==='Thuật toán'){
      key='algorithm:'+inputKey;results=localResults;
    }
    await createCompleteStep('search','done',engine==='AI'?`AI chọn ${output.plan.candidateId} trong các phương án mới đã kiểm tra; không tự thay vị trí.`:`Đã tìm được ${results.length} nhóm đá chính mới hợp lệ · đang xem cách ${idx+1}.`);
    createStep('partition','active','Kiểm tra lại số lượng, người trùng/thiếu và khách…');await createYield();
    const r=results[idx],check=GPAIContext.lineup(subset,{A:{starters:r.evA.starters,bench:r.evA.bench},B:{starters:r.evB.starters,bench:r.evB.bench}},lineupOptions());
    if(output?.warnings)check.warnings=[...new Set([...check.warnings,...output.warnings])];
    if(seenGroups.has(GPAIContext.lineupGroupKey(subset,{A:r.evA,B:r.evB})))throw new Error('Nhóm đá chính đã xuất hiện; không ghi đè bản nháp bằng một đội cũ.');
    createLogPatch({engine,validation:{limits:GPAIContext.LINEUP_LIMITS,checks:check.checks,warnings:check.warnings}});
    await createCompleteStep('partition','done',`Mỗi bên 7 đá chính · Dự bị A: ${r.evA.bench.length}, B: ${r.evB.bench.length}. Đủ người, không trùng; khách chia đều.`);
    createStep('balance','active','So điểm tuyến trên và tuyến dưới theo vị trí…');await createYield();
    const front=Math.abs(r.evA.frontFit-r.evB.frontFit),back=Math.abs(r.evA.backFit-r.evB.backFit);
    await createCompleteStep('balance','done',`Chênh tổng điểm 3 vị trí: công ${front.toFixed(2)}, thủ ${back.toFixed(2)}. Đạt ngưỡng bắt buộc ${GPAIContext.LINEUP_LIMITS.lineDifference} điểm mỗi tuyến; không lấy gôn bù công/thủ.`);
    const m=check.checks.metrics,d=m.difference,limits=GPAIContext.LINEUP_LIMITS;
    createStep('reserves','active','So lần lượt các nhóm dự bị mạnh nhất mỗi bên…');await createYield();
    await createCompleteStep('reserves','done',m.benchCount?`Nhóm mạnh nhất 1→${m.benchCount} người: chênh trung bình ${m.benchGroups.map(g=>g.gap.toFixed(2)).join(' / ')} (tối đa ${limits.benchMeanDifference} mỗi nhóm). Không lấy người yếu bù nhóm mạnh; không cộng người dư.`:'Không có cặp dự bị để so; người dư không cộng lợi thế.');
    createStep('quality','active','Kiểm tra các ngưỡng tổng lực và thể chất…');await createYield();
    await createCompleteStep('quality','done',`Chênh điểm chính ${d.start.toFixed(2)}, tổng lực ${d.total.toFixed(2)} (tối đa ${limits.strengthDifference}); ngôi sao chính/dự bị/tổng ${d.stars}/${d.benchStars}/${d.totalStars} (tối đa ${limits.starDifference}); tốc độ ${Math.max(d.pace,d.totalPace).toFixed(2)}/${limits.paceDifference}, thể lực ${Math.max(d.stamina,d.totalStamina).toFixed(2)}/${limits.staminaDifference}. Thể chất kiểm tra ngoài sân và ngoài sân cộng cùng số dự bị.`);
    createStep('positions','active','Đối chiếu vị trí và chất lượng người dự bị…');await createYield();
    const positionWarnings=check.warnings.filter(w=>!w.startsWith('Chênh '));
    await createCompleteStep('positions',positionWarnings.length?'warn':'done',positionWarnings.length?positionWarnings.join(' '):'Đã lấy top 14 gốc theo điểm hiển thị, áp dụng ngoại lệ Note cho trận này, rồi xếp vị trí chính/phụ và cân hai đội.');
    createStep('rotation','active','So với trận gần nhất, không phụ thuộc màu áo…');await createYield();
    const rotation=createRotation(r,subset,context.history,lineupNow);await createCompleteStep('rotation',rotation.state,rotation.detail);
    createStep('note','active','Đối chiếu với Note của lần tạo này…');await createYield();
    const hasNote=!!context.instruction;
    await createCompleteStep('note',hasNote?'warn':'done',!hasNote?'Note trống: không có yêu cầu riêng.':engine==='AI'?'Đã gửi Note hiện tại cho AI; cần đối chiếu trên đội hình.':'Thuật toán dùng quy tắc và ngoại lệ vị trí rõ ràng được Note cho phép; yêu cầu khác cần đối chiếu.');
    createStep('draft','active','Vẽ sân và bảng so kè…');await createYield();
    const notes=[...check.warnings];
    if(requestedAI&&engine==='Thuật toán')notes.push('AI không dùng được: '+fallback+' Đã chuyển sang thuật toán, không gọi lại AI.');
    if(rotation.state==='warn')notes.push(rotation.detail);
    const review='<p>Bản nháp '+engine+' · Chưa lưu trận.</p>'+(notes.length?'<ul>'+notes.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'');
    render(r,subset,'result',review,true);
    cstate={key,results,idx,subset,inputKey};
    createLogPatch({output:{groupKey:GPAIContext.lineupGroupKey(subset,{A:r.evA,B:r.evB}),teams:GPAIContext.compactLegacy({id:'draft',kickoff:lineupNow,subset,result:r}).teams},engine});
    AI_STATE.draftReview=null;$('aiOutput').hidden=true;
    CREATE_STATE.draftNote=context.instruction;CREATE_STATE.draftEngine=engine;createNoteChanged();
    if(output){
      AI_STATE.output=output;AI_STATE.request={task:'lineup',context};
    }else{$('aiOutput').hidden=true;AI_STATE.output=null;AI_STATE.request=null;}
    $('saveWeek').style.display='inline-block';
    $('status').textContent='';
    await createCompleteStep('draft','done','Đã hiển thị đội hình và bảng so kè. Chưa lưu trận.');
    const warnings=[...CREATE_STATE.steps.values()].filter(s=>s==='warn').length;
    await createFinish(true,`Hoàn tất bằng ${engine}. ${warnings?warnings+' mục cần lưu ý.':'Đã kiểm tra xong.'}`);
  }catch(e){
    createLogPatch({error:{kind:e.kind||'unknown',code:e.code,message:e.message,diagnostics:e.diagnostics,search:e.search},engine});
    for(const [id,state] of CREATE_STATE.steps)if(state==='active')createStep(id,'error',e.message);
    for(const [id,state] of CREATE_STATE.steps)if(state==='pending')createStep(id,'skip');
    $('status').textContent=e.message+' Giữ nguyên bản nháp trước đó (nếu có).';
    await createFinish(false,e.message+' Chưa lưu hoặc sửa trận nào.');
  }
}
