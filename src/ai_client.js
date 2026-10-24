// AI is opt-in; no provider key, password, or output is stored in localStorage.
const AI_STATE={status:null,csrf:null,busy:false,output:null,request:null};
function aiIsPreview(){return window.GP_APP_CONFIG?.backend&&window.GP_APP_CONFIG.dataMode!=='cloud';}
function aiInit(){
  if(!window.GP_APP_CONFIG?.backend)return;
  const banner=$('aiModeBanner');banner.style.display='block';
  banner.textContent=aiIsPreview()?'BẢN WEB APP · Xem thử an toàn — đọc dữ liệu cloud; thay đổi chỉ lưu trên máy này, không ghi lên web đang chạy.':'BẢN WEB APP · Đồng bộ cloud đang bật — thao tác lưu sẽ cập nhật dữ liệu chung.';
}
async function aiFetch(route,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),125000);
  try{
    const response=await fetch('/api/ai/'+route,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json','X-GP-CSRF':AI_STATE.csrf||''}:{},body:body?JSON.stringify(body):undefined});
    if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Khu vực AI cần backend. Chạy npm start và mở APP_ORIGIN; GitHub Pages không chạy API.');
    const data=await response.json();
    if(!response.ok){if(response.status===401){AI_STATE.csrf=null;if(AI_STATE.status)AI_STATE.status.authenticated=false;aiRenderStatus();}throw new Error(data.error||'Không gọi được AI.');}
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('Đã hết thời gian chờ AI. Không tự gửi lại yêu cầu.');throw e;}
  finally{clearTimeout(timer);}
}
function aiMessage(text,error=false){const el=$('aiMessage');el.hidden=!text;el.textContent=text;el.className='ai-message'+(error?' error':'');}
function aiRenderStatus(){
  const s=AI_STATE.status,box=$('aiServerStatus');
  if(!s){box.textContent='Chưa kết nối backend AI.';return;}
  box.textContent=`OpenRouter · ${s.model} · ${s.remainingRequests} lượt còn lại trong giờ · ${s.dataMode==='cloud'?'đồng bộ cloud':'xem thử, không ghi cloud'}. `+(s.configured?(s.authenticated?'Đã mở quyền AI (30 phút).':'Cần mở quyền AI để sử dụng.'):`Chưa cấu hình: ${s.missing.join(', ')}. Điền trong .env trên server rồi chạy lại npm start. Không nhập API key vào giao diện.`);
  $('aiLoginForm').hidden=!s.configured||s.authenticated;$('aiLogout').hidden=!s.authenticated;
  $('aiConnectionSummary').textContent=!s.configured?'Chưa cấu hình':s.authenticated?'Đã mở quyền AI':'Cần đăng nhập';
  if(!s.configured||!s.authenticated)$('aiConnection').open=true;
  $('aiRun').disabled=AI_STATE.busy||!s.configured||!s.authenticated;
}
async function aiRefresh(){
  if(!window.GP_APP_CONFIG?.backend){$('aiServerStatus').textContent='AI chỉ hoạt động ở bản web app có backend. Chạy npm start, sau đó mở http://localhost:3000 (hoặc APP_ORIGIN đã cấu hình). Bản GitHub Pages vẫn hoạt động như cũ.';$('aiConnectionSummary').textContent='Cần chạy backend';$('aiConnection').open=true;$('aiRun').disabled=true;$('aiLoginForm').hidden=true;return;}
  try{AI_STATE.status=await aiFetch('status');AI_STATE.csrf=AI_STATE.status.csrf;aiRenderStatus();}catch(e){aiMessage(e.message,true);}
}
async function aiLogin(event){
  event.preventDefault();const input=$('aiPassword'),btn=$('aiLoginBtn');btn.disabled=true;
  try{const data=await aiFetch('login',{password:input.value});AI_STATE.csrf=data.csrf;aiMessage('Đã mở quyền sử dụng AI.');await aiRefresh();$('aiConnection').open=false;}catch(e){aiMessage(e.message,true);}finally{input.value='';btn.disabled=false;}
}
async function aiLogout(){try{await aiFetch('logout',{});AI_STATE.csrf=null;await aiRefresh();}catch(e){aiMessage(e.message,true);}}
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
  $('aiRun').hidden=task==='lineup';$('aiLineupHint').hidden=task!=='lineup';
  $('aiAnalysisInstructionField').hidden=task==='lineup';
  $('aiMatchField').hidden=task!=='match-review';$('aiPlayerField').hidden=!['player-form','player-description'].includes(task);
  const selected=selectedIdx().map(i=>curPlayers[i]).filter(Boolean);
  $('aiRosterInfo').hidden=task!=='lineup';
  $('aiRosterInfo').textContent=`Đang chọn ${selected.length} người. AI chia sân 7 (14–24 người), đọc 3 trận gần nhất để hạn chế lặp đồng đội/vị trí. Yêu cầu riêng lấy từ ô Note ở đầu danh sách.`;
}
function openAITask(task,matchId){
  if($('screen-create').style.display!=='block')show('screen-create');
  $('createAI').hidden=false;$('aiCreateToggle').setAttribute('aria-expanded','true');$('aiTask').value=task;
  renderAIWorkspace();if(matchId!==undefined)$('aiMatch').value=String(matchId);aiTaskChanged();
  $('createAI').scrollIntoView({behavior:'smooth',block:'start'});
}
function aiClosePanel(){$('createAI').hidden=true;$('aiCreateToggle').setAttribute('aria-expanded','false');}
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
  if(!confirm('Gửi tên, chỉ số cầu thủ và lịch sử bóng đá liên quan tới OpenRouter/model để tạo nội dung? Mỗi lượt có thể tính phí. Không gửi tài khoản, thu chi hay API key.'))return;
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
  aiClosePanel();$('result').scrollIntoView({behavior:'smooth',block:'start'});
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
