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
const CREATE_LOG=typeof GPCreationLog==='undefined'?null:GPCreationLog.createStore({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)},{device:()=>GPCreationLog.deviceLabel(typeof navigator==='undefined'?null:navigator)});
const CREATE_CLOUD_PREFIX='generation_';
const CREATE_CLOUD={state:'idle',records:[],error:'',cursor:null,cursorTime:null,exhausted:false};
const CREATE_LOG_PAGE={size:10,limit:10,loading:false,generation:0,observer:null};
let CREATE_LOG_VIEW=[];
let CREATE_RUN_ID=null;
let CREATE_TAB='build';
let CREATE_WIZARD_STEP='roster';
let CREATE_WIZARD_KEY_PROMPTED=false;
function createHasDraft(){return typeof cstate!=='undefined'&&!!cstate.subset&&!!cstate.results?.[cstate.idx];}
function createSyncWizard(count){
  const n=Number.isFinite(count)?count:(typeof selectedIdx==='function'?selectedIdx().length:0),valid=n>=14&&n<=24;
  const next=$('createNextStep'),rules=$('createRulesStepBtn'),result=$('createResultStepBtn'),badge=$('createStepCount');
  if(next)next.disabled=!valid;if(rules)rules.disabled=!valid;if(result)result.disabled=!createHasDraft();if(badge)badge.textContent=n+' người đã chọn';
  return valid;
}
function createSetWizardStep(step='roster',force=false,promptForKey=true){
  const rules=step==='rules';
  if(rules&&!force&&!createSyncWizard())return false;
  if(step==='result'&&!createHasDraft())return false;
  CREATE_WIZARD_STEP=['roster','rules','result'].includes(step)?step:'roster';
  $('createBuildTab').dataset.createStep=CREATE_WIZARD_STEP;
  for(const [name,panelId,buttonId] of [['roster','createRosterStep','createRosterStepBtn'],['rules','createRulesStep','createRulesStepBtn'],['result','createResultStep','createResultStepBtn']]){
    const active=CREATE_WIZARD_STEP===name,panel=$(panelId),button=$(buttonId);panel.hidden=!active;button.classList.toggle('on',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  createSyncWizard();
  if(rules&&promptForKey&&!CREATE_WIZARD_KEY_PROMPTED){CREATE_WIZARD_KEY_PROMPTED=true;aiEnterCreate();}
  if(CREATE_WIZARD_STEP==='result')requestAnimationFrame(()=>{try{fitMatch();}catch{}});
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
async function createCloudFetch(generation=CREATE_LOG_PAGE.generation){
  if(!createCloudEnabled())return [];
  try{
    let query=createCloudCollection().orderBy('startedAt','desc');if(CREATE_CLOUD.cursor)query=query.startAfter(CREATE_CLOUD.cursor);
    const snap=await createCloudTimeout(query.limit(CREATE_LOG_PAGE.size).get(),8000),records=[];
    if(generation!==CREATE_LOG_PAGE.generation)return CREATE_CLOUD.records;
    for(const doc of snap.docs||[]){const d=doc.data();if(!doc.id.startsWith(CREATE_CLOUD_PREFIX)||d?.kind!=='generationLog'||!d.record)continue;const r=GPCreationLog.cloudRecord(d.record);if(r.id&&r.startedAt)records.push(r);}
    const docs=snap.docs||[],last=docs[docs.length-1];if(last){CREATE_CLOUD.cursor=last;CREATE_CLOUD.cursorTime=typeof last.data()?.startedAt==='string'?last.data().startedAt:null;}
    CREATE_CLOUD.exhausted=docs.length<CREATE_LOG_PAGE.size;CREATE_CLOUD.records=createMergeLogs(CREATE_CLOUD.records,records);CREATE_CLOUD.state='loaded';CREATE_CLOUD.error='';return CREATE_CLOUD.records;
  }catch{
    if(generation!==CREATE_LOG_PAGE.generation)return CREATE_CLOUD.records;
    CREATE_CLOUD.state='failed';CREATE_CLOUD.error='Không đọc được log cloud.';return CREATE_CLOUD.records;
  }
}
function createMergeLogs(local,cloud){
  const records=new Map();for(const r of cloud||[])if(r?.id)records.set(r.id,r);for(const r of local||[])if(r?.id)records.set(r.id,r);
  return [...records.values()].sort((a,b)=>String(b.startedAt||'').localeCompare(String(a.startedAt||''))||String(b.id).localeCompare(String(a.id)));
}
const CREATE_LOG_STATUS={running:'Đang xử lý',success:'Hoàn tất',failed:'Thất bại',cancelled:'Đã huỷ',interrupted:'Bị gián đoạn'};
const CREATE_LOG_ROLE={GK:'Gôn',Thòng:'Thòng',HV:'Hậu vệ',TVtt:'Giữa',TV:'Cánh','TĐ':'Tiền đạo'};
function createLogNode(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function createLogGenerationId(r){return typeof r?.ai?.generationId==='string'&&r.ai.generationId?r.ai.generationId:'';}
function createLogUsable(r){return r?.status==='success'&&Array.isArray(r?.input?.players)&&r.input.players.length>=14&&['A','B'].every(side=>Array.isArray(r?.output?.teams?.[side])&&r.output.teams[side].filter(p=>!p.bench).length===7);}
function createLogIssue(r){
  if(r.status==='success')return r.fallback?.reason?{title:'AI chưa thành công — đã dùng thuật toán',detail:r.fallback.reason,hint:''}:null;
  if(r.status==='running')return null;
  const lastError=[...(r.events||[])].reverse().find(e=>e.state==='error'&&e.detail);
  const detail=r.error?.message||lastError?.detail||({cancelled:'Lượt tạo đã bị huỷ.',interrupted:'Lượt tạo bị gián đoạn trước khi hoàn tất; yêu cầu AI có thể vẫn đang chạy.'}[r.status])||'Log này không ghi lại nguyên nhân cụ thể.';
  let hint='';
  // Explain old and new logs using their recorded player/Note snapshot, not
  // today’s player profiles. Only diagnose keepers for the early top-14 error.
  if(r.error?.kind==='solver'&&r.error?.search?.totalPartitions===0&&Array.isArray(r.error.search.top14)&&Array.isArray(r.input?.players))try{
    const players=r.input.players.map(GPAIContext.player),top=new Set(r.error.search.top14),roles=GPAIContext.lineupRoles(players,r.input.instruction||'');
    const keepers=players.filter((p,i)=>top.has(p.n)&&roles.allowed[i][0]);
    if(keepers.length<2)hint=`Nhóm đá chính chỉ có ${keepers.length} người đủ điều kiện bắt gôn${keepers.length?': '+keepers.map(p=>p.n).join(', '):''}; cần 2. Chọn thêm người phù hợp hoặc chỉ định gôn trong Note cho trận này.`;
  }catch{/* Older or incomplete snapshots retain the original error only. */}
  return {title:r.status==='failed'?'Lý do không tạo được đội':r.status==='interrupted'?'Lượt tạo bị gián đoạn':'Thông tin lượt tạo',detail,hint};
}
function createLogTeam(side,rows){
  const box=createLogNode('section','create-log-team'),title=createLogNode('div','create-log-team-title',(side==='A'?'🔴':'🟡')+' Team '+side);box.appendChild(title);
  const starters=rows.filter(p=>!p.bench),bench=rows.filter(p=>p.bench);
  for(const p of starters){const row=createLogNode('div','create-log-player'),name=createLogNode('span','',p.n||'—'),meta=createLogNode('span','',`${CREATE_LOG_ROLE[p.slot]||p.slot||'Vị trí'}${Number.isFinite(+p.rating)?' · '+(+p.rating).toFixed(1):''}`);row.append(name,meta);box.appendChild(row);}
  const reserve=createLogNode('div','create-log-bench','Dự bị: '+(bench.length?bench.map(p=>p.n+(Number.isFinite(+p.rating)?' '+(+p.rating).toFixed(1):'')).join(', '):'—'));box.appendChild(reserve);return box;
}
function createLogActions(r){
  const actions=createLogNode('div','create-log-actions');
  if(createLogUsable(r)){
    const edit=createLogNode('button','btn alt sm','Sửa đội hình'),save=createLogNode('button','btn sm','Đặt làm trận tuần này');
    edit.type=save.type='button';edit.onclick=()=>createOpenEdit(r.id);save.onclick=()=>createUseLog(r.id);actions.append(edit,save);
  }else{const button=createLogNode('button','btn sm','Không thể dùng');button.type='button';button.disabled=true;actions.appendChild(button);}
  return actions;
}
function createRenderLogCards(records){
  const list=$('createLogList');list.replaceChildren();
  if(!records.length){list.appendChild(createLogNode('div','create-log-empty','Chưa có lượt tạo đội nào.'));return;}
  for(const r of records){
    const card=createLogNode('article','create-log-card'),head=createLogNode('div','create-log-head'),headText=createLogNode('div',''),when=new Date(r.startedAt),title=createLogNode('div','create-log-title',Number.isNaN(when.getTime())?'Lượt tạo đội':when.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}));
    const meta=createLogNode('div','create-log-meta',(r.engine||r.requestedEngine||'Chưa rõ')+' · '+(r.input?.players?.length||0)+' người'),device=createLogNode('div','create-log-device',r.device||'Thiết bị không rõ (log cũ)'),status=createLogNode('span','create-log-status '+(r.status||''),CREATE_LOG_STATUS[r.status]||r.status||'Chưa rõ');headText.append(title,meta,device);head.append(headText,status);card.appendChild(head);
    const usable=createLogUsable(r);if(usable)card.appendChild(createLogActions(r));
    if(usable){const teams=createLogNode('div','create-log-teams');teams.append(createLogTeam('A',r.output.teams.A),createLogTeam('B',r.output.teams.B));card.appendChild(teams);}
    else card.appendChild(createLogNode('div','create-log-empty',r.status==='success'?'Lượt cũ thiếu dữ liệu đội hình để dùng lại.':'Không có đội hình hoàn tất.'));
    const issue=createLogIssue(r);if(issue){const box=createLogNode('div','create-log-issue '+(r.status==='success'?'fallback':'error'));box.appendChild(createLogNode('strong','',issue.title));if(issue.hint)box.appendChild(createLogNode('p','',issue.hint));box.appendChild(createLogNode('p','',issue.detail));card.appendChild(box);}
    if(!usable)card.appendChild(createLogActions(r));card.appendChild(createLogNode('div','create-log-code','Mã log: '+r.id+(createLogGenerationId(r)?'\nMã gen AI: '+createLogGenerationId(r):'')));list.appendChild(card);
  }
}
function createRenderLogList(records){
  CREATE_LOG_VIEW=records.slice(0,CREATE_LOG_PAGE.limit);const select=$('createLogSelect'),selected=select.value;select.replaceChildren();
  for(const r of CREATE_LOG_VIEW){const option=document.createElement('option');option.value=r.id;option.textContent=new Date(r.startedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' · '+(CREATE_LOG_STATUS[r.status]||r.status)+' · '+(r.engine||'')+' · '+r.id;select.appendChild(option);}
  if(selected&&CREATE_LOG_VIEW.some(r=>r.id===selected))select.value=selected;
  const localOk=CREATE_LOG?.persisted();
  $('createLogNotice').textContent=CREATE_LOG_PAGE.loading?'Đang tải lịch sử…':CREATE_CLOUD.state==='loaded'||CREATE_CLOUD.state==='saved'?'Đã gộp log trên máy và cloud. Không lưu key OpenRouter.':CREATE_CLOUD.state==='failed'?(CREATE_CLOUD.error+' Log trên máy vẫn dùng được.'):(localOk?'Log đang lưu trên máy; cloud chưa kết nối.':'Trình duyệt chặn lưu local; cloud chưa kết nối.');
  const more=records.length>CREATE_LOG_VIEW.length||(createCloudEnabled()&&!CREATE_CLOUD.exhausted);$('createLogMore').hidden=!more;$('createLogMore').disabled=CREATE_LOG_PAGE.loading;$('createLogMore').textContent=CREATE_LOG_PAGE.loading?'Đang tải…':CREATE_CLOUD.state==='failed'?'Thử tải thêm':'Tải thêm';
  $('createLogExport').disabled=!CREATE_LOG_VIEW.length;createRenderLogCards(CREATE_LOG_VIEW);createShowLog();
}
function createSetTab(tab='build'){
  CREATE_TAB=tab==='history'?'history':'build';const history=CREATE_TAB==='history';
  $('createBuildTab').hidden=history;$('createHistoryTab').hidden=!history;
  const button=$('createHistoryHeaderBtn'),label=$('createHistoryHeaderLabel');
  if(button){button.setAttribute('aria-label',history?'Quay lại tạo đội':'Mở lịch sử tạo đội');button.setAttribute('aria-pressed',String(history));}
  if(label)label.textContent=history?'Tạo đội':'Lịch sử';
  $('appTitle').innerHTML=history?GPIcons.render('match-history')+' Lịch sử tạo đội':TITLES['screen-create'];
  if(!history){CREATE_LOG_PAGE.generation++;CREATE_LOG_PAGE.observer?.disconnect();CREATE_LOG_PAGE.observer=null;CREATE_LOG_PAGE.loading=false;}
}
function createToggleHeaderView(){if(CREATE_TAB==='history')createSetTab('build');else createOpenLogs();}
async function createOpenLogs(){
  createSetTab('history');
  const generation=++CREATE_LOG_PAGE.generation;CREATE_LOG_PAGE.limit=CREATE_LOG_PAGE.size;CREATE_LOG_PAGE.loading=false;
  Object.assign(CREATE_CLOUD,{state:createCloudEnabled()?'loading':'off',records:[],error:'',cursor:null,cursorTime:null,exhausted:!createCloudEnabled()});
  if(typeof window!=='undefined'){window.scrollTo(0,0);if(typeof IntersectionObserver!=='undefined'){CREATE_LOG_PAGE.observer?.disconnect();CREATE_LOG_PAGE.observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&CREATE_TAB==='history'&&CREATE_CLOUD.state!=='failed')createLoadMoreLogs();},{rootMargin:'300px 0px'});CREATE_LOG_PAGE.observer.observe($('createLogMore'));}}
  await createLoadLogPage(generation);
}
async function createLoadLogPage(generation=CREATE_LOG_PAGE.generation){
  if(CREATE_LOG_PAGE.loading||CREATE_TAB!=='history')return;CREATE_LOG_PAGE.loading=true;
  const merged=()=>createMergeLogs(CREATE_LOG?.list()||[],CREATE_CLOUD.records);createRenderLogList(merged());
  try{
    while(createCloudEnabled()&&!CREATE_CLOUD.exhausted){
      const all=merged(),cutoff=all[CREATE_LOG_PAGE.limit-1]?.startedAt;
      if(CREATE_CLOUD.cursor&&cutoff&&CREATE_CLOUD.cursorTime&&CREATE_CLOUD.cursorTime<cutoff)break;
      await createCloudFetch(generation);if(generation!==CREATE_LOG_PAGE.generation||CREATE_CLOUD.state==='failed')return;
    }
  }finally{if(generation===CREATE_LOG_PAGE.generation){CREATE_LOG_PAGE.loading=false;createRenderLogList(merged());}}
}
async function createLoadMoreLogs(){
  if(CREATE_TAB!=='history'||CREATE_LOG_PAGE.loading)return;
  const all=createMergeLogs(CREATE_LOG?.list()||[],CREATE_CLOUD.records);if(all.length<=CREATE_LOG_PAGE.limit&&(!createCloudEnabled()||CREATE_CLOUD.exhausted))return;
  if(CREATE_CLOUD.state!=='failed'||all.length>CREATE_LOG_PAGE.limit)CREATE_LOG_PAGE.limit+=CREATE_LOG_PAGE.size;
  await createLoadLogPage();
}
if(typeof window!=='undefined'&&typeof IntersectionObserver==='undefined')window.addEventListener('scroll',()=>{const more=$('createLogMore');if(CREATE_TAB==='history'&&CREATE_CLOUD.state!=='failed'&&!more.hidden&&more.getBoundingClientRect().top<=window.innerHeight+300)createLoadMoreLogs();},{passive:true});
function createShowLog(){const r=CREATE_LOG_VIEW.find(r=>r.id===$('createLogSelect').value);$('createLogDetails').textContent=r?JSON.stringify(r,null,2):'Chưa có nhật ký tạo đội.';}
function createDraftFromLog(r,manualEdit=false){
  if(!createLogUsable(r))throw new Error('Lượt này không có đội hình hoàn tất để dùng lại.');
  const players=r.input.players.map(GPAIContext.player),indices=new Map(players.map((p,i)=>[p.n,i])),teams={A:{starters:[],bench:[]},B:{starters:[],bench:[]}};
  for(const side of ['A','B'])for(const p of r.output.teams[side]){const i=indices.get(p.n);if(i===undefined)throw new Error('Thiếu cầu thủ '+p.n+' trong dữ liệu lượt tạo.');teams[side][p.bench?'bench':'starters'].push(i);}
  const history=Array.isArray(r.input.history)?r.input.history:(r.input.rotationReference?[r.input.rotationReference]:[]),now=Date.parse(r.startedAt)||Date.now();
  const legacyPolicy=r.selection?.starterPolicy!=='keepers-first-v1',checked=GPAIContext.lineup(players,teams,{instruction:r.input.instruction||'',history,now,manualEdit:manualEdit||r.engine==='AI · Sửa đội'||legacyPolicy});
  return {players,result:checked.result,warnings:legacyPolicy?checked.warnings:[]};
}
function createUseLog(id){
  if(!canEdit){alert('🔒 Đặt làm trận tuần này cần đăng nhập admin.');openAdminModal();return;}
  const record=CREATE_LOG_VIEW.find(r=>r.id===id);let draft;
  try{draft=createDraftFromLog(record);}catch(e){alert('Không nạp được đội hình: '+e.message);return;}
  cstate={key:'history:'+record.id,results:[draft.result],idx:0,subset:draft.players,inputKey:''};
  AI_STATE.draftReview=null;$('aiOutput').hidden=true;aiSyncDraftAction();
  CREATE_STATE.draftNote=record.input?.instruction||'';CREATE_STATE.draftEngine=record.engine||'Lịch sử';CREATE_STATE.hasReport=false;$('reviewProcessRules').style.display='none';createNoteChanged();
  const warning=draft.warnings.length?'<p>Đội hình lịch sử dùng tiêu chí cũ. Cần đối chiếu tiêu chí hiện tại:</p><ul>'+draft.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'';
  render(draft.result,draft.players,'result',warning,true);$('status').textContent='Đã nạp đội hình từ '+record.id;$('saveWeek').style.display='inline-block';
  createRevealDraft();openMatchModal('create');
}
function createExportLogs(){
  if(!CREATE_LOG)return;const body=GPCreationLog.exportRecords?GPCreationLog.exportRecords(CREATE_LOG_VIEW):CREATE_LOG.export(),url=URL.createObjectURL(new Blob([body],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='genplayer-gen-log-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let CREATE_EDIT=null;
function createOpenEdit(logId=''){
  if(AI_STATE.busy||CREATE_STATE.busy)return;
  let players,result,note='',uiNote='',fingerprint=null;
  try{
    if(logId){const record=CREATE_LOG_VIEW.find(r=>r.id===logId);const draft=createDraftFromLog(record,true);players=draft.players;result=draft.result;note=record.input?.instruction||'';uiNote=note;}
    else{fingerprint=aiDraftFingerprint();if(!fingerprint)throw new Error('Chưa có đội hình để sửa.');players=cstate.subset.map(GPAIContext.player);result=structuredClone(cstate.results[cstate.idx]);uiNote=CREATE_STATE.draftNote||'';note=cstate.editNote||uiNote;}
    const teams={A:{starters:result.evA.starters.slice(),bench:result.evA.bench.slice()},B:{starters:result.evB.starters.slice(),bench:result.evB.bench.slice()}};
    GPAIContext.validateLineupRoster(players,teams,{manualEdit:true});
    const history=getHistory().filter(r=>r.result&&Array.isArray(r.subset)).slice(0,500).map(GPAIContext.compactLegacy);
    CREATE_EDIT={players,teams,note,uiNote,history,fingerprint,logId,proposal:null,busy:false};
    $('lineupEditInstruction').value='';$('lineupEditSource').textContent=logId?'Đội hình từ log '+logId+' · Bản gốc được giữ nguyên.':'Đội hình đang xem · Bản gốc được giữ đến khi áp dụng.';
    $('lineupEditStatus').hidden=true;$('lineupEditPreview').hidden=true;$('lineupEditApply').hidden=true;$('lineupEditRun').disabled=false;
    $('lineupEditDialog').showModal();
  }catch(e){alert('Không mở được đội hình để sửa: '+e.message);}
}
function createCloseEdit(){const dialog=$('lineupEditDialog');if(dialog.open)dialog.close();CREATE_EDIT=null;}
function createEditChanged(){if(!CREATE_EDIT)return;CREATE_EDIT.proposal=null;$('lineupEditPreview').hidden=true;$('lineupEditApply').hidden=true;$('lineupEditStatus').hidden=true;}
function createEditPositions(teams,players){
  const positions=new Map();for(const side of ['A','B']){teams[side].starters.forEach((i,k)=>positions.set(i,'Team '+side+' · '+(CREATE_LOG_ROLE[GPAIContext.SLOTS[k]]||GPAIContext.SLOTS[k])));teams[side].bench.forEach(i=>positions.set(i,'Team '+side+' · dự bị'));}return positions;
}
function createEditHumanText(text,edit){
  const positions=createEditPositions(edit.teams,edit.players);
  return String(text||'').replace(/\bp\d+\b/gi,code=>{const index=Number(code.slice(1)),player=edit.players[index];return player?`${player.n} (${positions.get(index)||'không rõ vị trí'})`:'cầu thủ chưa xác định';});
}
async function createRunEdit(){
  const edit=CREATE_EDIT,instruction=$('lineupEditInstruction').value.trim();if(!edit||edit.busy||AI_STATE.busy||CREATE_STATE.busy)return;
  const status=$('lineupEditStatus');status.hidden=false;status.className='ai-message';
  if(!instruction){status.className='ai-message error';status.textContent='Nhập yêu cầu sửa đội hình.';return;}
  if(!AI_KEYS.has()){aiOpenKeyDialog(true);aiKeyMessage('Cần key OpenRouter để sửa đội hình bằng AI.');return;}
  edit.proposal=null;$('lineupEditPreview').hidden=true;$('lineupEditApply').hidden=true;edit.busy=true;AI_STATE.busy=true;aiRenderStatus();$('lineupEditRun').disabled=true;status.textContent='AI đang xem yêu cầu sửa…';
  try{
    const context={players:edit.players,rosterNames:edit.players.map(p=>p.n),history:edit.history,instruction,editBaseInstruction:edit.note.slice(0,Math.max(0,1998-instruction.length)),editTeams:edit.teams};
    const response=await aiFetch('run',{task:'lineup-edit',context}),out=response.output;
    if(CREATE_EDIT!==edit||$('lineupEditInstruction').value.trim()!==instruction)return;
    if(out.status==='clarify'){status.textContent=createEditHumanText(out.message,edit);return;}
    if(out.status!=='ready'||!out.result||!out.teams)throw new Error('AI chưa trả được phương án sửa hợp lệ.');
    const before=createEditPositions(edit.teams,edit.players),after=createEditPositions(out.teams,edit.players),preview=$('lineupEditPreview');preview.replaceChildren();
    preview.appendChild(createLogNode('strong','','AI hiểu yêu cầu'));preview.appendChild(createLogNode('p','',createEditHumanText(out.message,edit)));
    preview.appendChild(createLogNode('strong','','Thay đổi đề xuất'));
    const changes=edit.players.flatMap((p,i)=>before.get(i)!==after.get(i)?[`${p.n}: ${before.get(i)} → ${after.get(i)}`]:[]);
    if(!changes.length)throw new Error('Đề xuất không thay đổi đội hình.');
    const list=createLogNode('ul');for(const text of changes)list.appendChild(createLogNode('li','',text));preview.appendChild(list);
    if(out.warnings?.length){const box=createLogNode('div','lineup-edit-warning');box.appendChild(createLogNode('strong','','Cần xem lại tiêu chí'));for(const warning of out.warnings)box.appendChild(createLogNode('p','',createEditHumanText(warning,edit)));preview.appendChild(box);}
    edit.proposal={output:out,instruction,context};preview.hidden=false;$('lineupEditApply').hidden=false;status.textContent='Kiểm tra thay đổi rồi bấm Áp dụng.';
  }catch(e){if(CREATE_EDIT===edit){status.className='ai-message error';status.textContent=createEditHumanText(e.message,edit)+' Chưa áp dụng thay đổi.';}}
  finally{edit.busy=false;AI_STATE.busy=false;aiRenderStatus();if(CREATE_EDIT===edit)$('lineupEditRun').disabled=false;}
}
function createApplyEdit(){
  const edit=CREATE_EDIT,proposal=edit?.proposal;if(!edit||!proposal||edit.busy||AI_STATE.busy||CREATE_STATE.busy)return;
  const status=$('lineupEditStatus');
  if(!edit.logId&&edit.fingerprint!==aiDraftFingerprint()){status.hidden=false;status.className='ai-message error';status.textContent='Đội hình đã thay đổi; hãy mở lại cửa sổ sửa.';return;}
  try{
    const {output,instruction,context}=proposal,note=[context.editBaseInstruction,instruction].filter(Boolean).join('; '),checked=GPAIContext.lineup(edit.players,output.teams,{instruction:note,history:edit.history,manualEdit:true});
    const warnings=[...new Set(checked.warnings)],report='<p>Đội hình sửa theo yêu cầu · Chưa lưu trận.</p>'+(warnings.length?'<ul>'+warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'');
    render(checked.result,edit.players,'result',report,true);
    cstate={key:'edited:'+Date.now(),results:[checked.result],idx:0,subset:edit.players,inputKey:'',editNote:note};AI_STATE.draftReview=null;AI_STATE.output=null;AI_STATE.request=null;$('aiOutput').hidden=true;
    CREATE_STATE.draftNote=edit.uiNote;CREATE_STATE.draftEngine='AI · Sửa đội';CREATE_STATE.hasReport=false;$('reviewProcessRules').style.display='none';
    $('saveWeek').style.display='inline-block';$('status').textContent='';createNoteChanged();aiSyncDraftAction();
    try{
      const now=Date.now(),input=GPCreationLog.snapshot({...context,instruction:note},now),id=CREATE_LOG?.begin(document.querySelector('meta[name="genplayer-release"]')?.content||'');
      if(id){CREATE_LOG.patch(id,{status:'success',endedAt:new Date(now).toISOString(),engine:'AI · Sửa đội',requestedEngine:'AI · Sửa đội',input,ai:{decision:'edited',generationId:output.generationId,model:output.model,usage:output.usage},validation:{limits:GPAIContext.LINEUP_LIMITS,checks:checked.checks,warnings},output:{groupKey:GPAIContext.lineupGroupKey(edit.players,output.teams),teams:GPAIContext.compactLegacy({id:'draft',kickoff:now,subset:edit.players,result:checked.result}).teams}});createCloudPush(id).catch(()=>{});}
    }catch{/* The edited draft remains usable even if its log cannot be stored. */}
    createCloseEdit();createRevealDraft();
  }catch(e){status.hidden=false;status.className='ai-message error';status.textContent=e.message+' Chưa áp dụng thay đổi.';}
}
if(typeof window!=='undefined')$('lineupEditDialog').addEventListener('cancel',event=>{event.preventDefault();createCloseEdit();});
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
  for(const p of cstate.subset||[])if(typeof p.matchGkRating==='number'){const detail=document.createElement('p');detail.textContent=`Chỉ trận này: ${p.n} bắt gôn ${p.matchGkRating.toFixed(1)} như ${p.matchGkSource}.`;box.appendChild(detail);}
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
  $('reviewProcessRules').style.display='none';
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
  $('reviewProcessRules').style.display='';createSyncWizard();
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
  createSetTab('build');createSetWizardStep('result',true,false);const result=$('result');result.hidden=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    try{fitMatch();}catch{}
    try{window.scrollTo({top:0,behavior:'auto'});}catch{}
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
    const keeperNote=GPAIContext.applyMatchKeeperNote(context.players,context.rosterNames,context.instruction);context.players=keeperNote.players;
    const lineupNow=Date.now();
    subset=context.rosterNames.map(n=>context.players.find(p=>p.n===n));
    // Lineup creation never needs an unrelated match/player selected for another AI task.
    context.match=null;context.playerName='';
    const logInput=GPCreationLog.snapshot(context,lineupNow);inputKey=GPCreationLog.inputKey(logInput);
    const seenGroups=new Set(CREATE_LOG?.seen(inputKey)||[]);
    if(cstate.inputKey===inputKey&&cstate.results.length)seenGroups.add(GPAIContext.lineupGroupKey(cstate.subset,{A:cstate.results[cstate.idx].evA,B:cstate.results[cstate.idx].evB}));
    createLogPatch({input:logInput,inputKey,selection:{excludedCount:seenGroups.size,starterPolicy:'keepers-first-v1'},validation:{limits:GPAIContext.LINEUP_LIMITS}});
    const noPosition=subset.filter(p=>!p.pos).length;
    const keeperDetail=keeperNote.applied.map(o=>`${o.name} bắt gôn ${o.rating.toFixed(1)} như ${o.source} (chỉ trận này).`).join(' ');
    await createCompleteStep('ratings',noPosition?'warn':'done',(noPosition?noPosition+' người chưa đăng ký vị trí; cần kiểm tra khi xếp sân.':'Điểm hợp lệ; đã đọc vị trí chính/phụ của từng người.')+(keeperDetail?' '+keeperDetail:''));
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
    createLogPatch({selection:{excludedCount:seenGroups.size,candidateCount:localResults.length,candidateGroups:[...allowedGroups],starterPolicy:'keepers-first-v1'}});
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
    await createCompleteStep('quality','done',`Chênh điểm chính ${d.start.toFixed(2)}, tổng lực ${d.total.toFixed(2)} (bắt buộc tối đa ${limits.strengthDifference}); tốc độ ${Math.max(d.pace,d.totalPace).toFixed(2)}/${limits.paceDifference}, thể lực ${Math.max(d.stamina,d.totalStamina).toFixed(2)}/${limits.staminaDifference}. Ngôi sao chính/dự bị/tổng lệch ${d.stars}/${d.benchStars}/${d.totalStars}: ưu tiên cao, không block.`);
    createStep('positions','active','Đối chiếu vị trí và chất lượng người dự bị…');await createYield();
    const positionWarnings=check.warnings.filter(w=>!w.startsWith('Chênh '));
    await createCompleteStep('positions',positionWarnings.length?'warn':'done',positionWarnings.length?positionWarnings.join(' '):'Đã ưu tiên 2 thủ môn, chọn 12 người còn lại theo điểm hiển thị và áp dụng ngoại lệ Note cho trận này.');
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
