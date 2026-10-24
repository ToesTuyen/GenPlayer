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
const AI_STATE={status:null,busy:false,output:null,request:null};
function aiSecurePage(){return location.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);}
function aiIsPreview(){return window.GP_APP_CONFIG?.backend&&window.GP_APP_CONFIG.dataMode!=='cloud';}
function aiInit(){
  aiRenderStatus();
  window.addEventListener('storage',event=>{if(event.key===AI_KEYS.storageName||event.key===null){AI_KEYS.reload();aiRenderStatus();}});
  if(!window.GP_APP_CONFIG?.backend)return;
  const banner=$('aiModeBanner');banner.style.display='block';
  banner.textContent=aiIsPreview()?'BẢN WEB APP · Xem thử an toàn — đọc dữ liệu cloud; thay đổi chỉ lưu trên máy này, không ghi lên web đang chạy.':'BẢN WEB APP · Đồng bộ cloud đang bật — thao tác lưu sẽ cập nhật dữ liệu chung.';
}
async function aiFetch(route,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),125000);
  try{
    const headers=body?{'Content-Type':'application/json'}:{};
    if(route==='run'){
      if(!aiSecurePage())throw new Error('Cần HTTPS để gửi key cá nhân. Link Wi-Fi HTTP chỉ dùng thuật toán.');
      if(!AI_KEYS.has())throw new Error('Nhập và lưu key OpenRouter trên trình duyệt này trước.');
      headers.Authorization='Bearer '+AI_KEYS.get();
    }
    const response=await fetch('/api/ai/'+route,{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers,body:body?JSON.stringify(body):undefined});
    if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Khu vực AI cần backend. Chạy npm start và mở APP_ORIGIN; GitHub Pages không chạy API.');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Không gọi được AI.');
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('Đã hết thời gian chờ AI. Không tự gửi lại yêu cầu.');throw e;}
  finally{clearTimeout(timer);}
}
function aiMessage(text,error=false){const el=$('aiMessage');el.hidden=!text;el.textContent=text;el.className='ai-message'+(error?' error':'');}
function aiRenderStatus(){
  const s=AI_STATE.status,secure=aiSecurePage(),hasKey=AI_KEYS.has();
  $('aiServerStatus').textContent=(s?`OpenRouter · ${s.model} · ${s.remainingRequests} lượt backend còn lại trong giờ. `:window.GP_APP_CONFIG?.backend?'Chưa kết nối backend AI. ':'Bản static cần backend để gọi AI. ')+(!secure?'Trang đang dùng HTTP: không nhập/gửi key ở đây. Hãy mở HTTPS hoặc localhost trên Mac.':hasKey?(AI_KEYS.remembered()?'Đã lưu key trên trình duyệt này. ':'Key chỉ dùng trong phiên trang này. ')+'Chưa kiểm tra key với OpenRouter; chi phí thuộc key của bạn.':'Chưa có key cá nhân. Không dùng key chung của server.');
  $('aiConnectionSummary').textContent=!secure?'Cần HTTPS':!hasKey?'Chưa có key':AI_KEYS.remembered()?'Đã lưu trên máy':'Chỉ phiên này';
  $('aiKey').disabled=!secure;$('aiSaveKeyBtn').disabled=!secure;
  $('aiRemoveKey').hidden=!hasKey;
  $('aiKey').placeholder=hasKey?'Nhập key mới nếu muốn thay':'sk-or-…';
  if(!hasKey||!secure)$('aiConnection').open=true;
  $('aiRun').disabled=AI_STATE.busy||!secure||!hasKey||!s?.secureTransport||s?.keyMode!=='device';
}
async function aiRefresh(){
  if(!window.GP_APP_CONFIG?.backend){AI_STATE.status=null;aiRenderStatus();return;}
  try{AI_STATE.status=await aiFetch('status');aiRenderStatus();}catch(e){AI_STATE.status=null;aiRenderStatus();aiMessage(e.message,true);}
}
function aiSaveKey(event){
  event.preventDefault();const input=$('aiKey');
  try{if(!aiSecurePage())throw new Error('Chỉ nhập key trên HTTPS hoặc localhost.');AI_KEYS.save(input.value,$('aiRememberKey').checked);input.value='';aiRenderStatus();aiMessage(AI_KEYS.remembered()?'Đã lưu key riêng trên trình duyệt/địa chỉ web này. Không đồng bộ sang máy khác.':'Key chỉ dùng tới khi đóng hoặc tải lại trang.');}
  catch(e){input.value='';aiMessage(e.message,true);}
}
function aiForgetKey(){try{AI_KEYS.clear();$('aiKey').value='';aiRenderStatus();aiMessage('Đã xoá key khỏi trình duyệt này. Không thu hồi key tại OpenRouter hoặc huỷ lượt đã gửi trước đó.');}catch(e){aiMessage(e.message,true);}}
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
  $('aiTask').value=task;
  $('aiAnalysisTools').open=task!=='lineup';
  renderAIWorkspace();if(matchId!==undefined)$('aiMatch').value=String(matchId);aiTaskChanged();
  $('createAI').scrollIntoView({behavior:'smooth',block:'start'});
}
function aiShowRoster(){
  $('roster').style.display='';const toggle=$('toggleRoster');if(toggle.style.display!=='none')toggle.textContent='🙈 Ẩn danh sách';
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
async function aiRun(){
  if(AI_STATE.busy||CREATE_STATE.busy)return;
  if($('aiTask').value==='lineup')return createTeams();
  let context;const task=$('aiTask').value;
  try{context=aiContextSnapshot();if(task==='lineup'&&context.rosterNames.length<14)throw new Error('Chọn ít nhất 14 người có mặt trước khi tạo đội bằng AI.');}catch(e){aiMessage(e.message,true);return;}
  if(!confirm('Gửi dữ liệu bóng đá tới OpenRouter/model bằng key cá nhân trên thiết bị này? Có thể tính phí. Key chỉ dùng xác thực qua HTTPS, không vào prompt; không gửi tài khoản hoặc thu chi.'))return;
  AI_STATE.busy=true;aiRenderStatus();$('aiRun').textContent='Đang phân tích…';aiMessage('AI đang đọc chỉ số, chuỗi kết quả và bàn thắng. Không tự lưu đội hình hay thay đổi điểm.');
  try{
    const response=await aiFetch('run',{task,context});
    AI_STATE.output=response.output;AI_STATE.request={task,context,matchId:context.match?.id,matchSnapshot:aiMatchFingerprint(context.match,context.players)};
    aiRenderOutput();aiMessage('Đã có bản nháp AI. Kiểm tra nội dung/bảng so kè trước khi sử dụng.');
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
  $('aiOutputMeta').textContent=`${o.model} · ${new Date(o.createdAt).toLocaleString('vi-VN')} · ${o.usage?o.usage.promptTokens+' token vào / '+o.usage.completionTokens+' token ra':'chưa có số token'} · bản nháp, cần kiểm tra dữ kiện.`;
  $('aiUseLineup').hidden=task!=='lineup'||!showLineupPreview;$('aiSaveReview').hidden=task!=='match-review';
  $('aiLineupPreview').innerHTML='';$('aiWarnings').textContent=(o.warnings||[]).join('\n');
  if(task==='lineup'&&showLineupPreview)render(o.result,o.subset,'aiLineupPreview','<p>Bản nháp AI chưa chốt. Kiểm tra riêng công, thủ và từng cặp trong bảng so kè; không mặc định cân chỉ vì tổng điểm gần nhau.</p>',false);
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
  render(cstate.results[0],cstate.subset,'result','<p>Bản nháp AI chưa chốt. Kiểm tra từng tuyến và bảng so kè trước khi lưu trận.</p>',true);$('saveWeek').style.display='inline-block';
  $('status').textContent='Bản nháp AI · Chưa lưu trận. Kiểm tra so kè rồi chọn Lưu làm đội tuần này nếu đồng ý.';
  $('result').scrollIntoView({behavior:'smooth',block:'start'});
}
async function aiSaveReview(){
  if(AI_STATE.request?.task!=='match-review'||!AI_STATE.output)return;
  if(aiIsPreview()){aiMessage('Chế độ xem thử không ghi nhận định lên cloud. Dùng Sao chép; chỉ bật APP_DATA_MODE=cloud khi sẵn sàng.',true);return;}
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
    });aiMessage('Đã lưu nhận định vào đúng trận. Không thay đổi đội hình, tỉ số hay bàn thắng.');
  }catch(e){aiMessage(e.message,true);}
}
