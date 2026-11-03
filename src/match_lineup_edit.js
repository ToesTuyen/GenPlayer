// Edit a saved match without creating another match or overwriting unrelated fields.
let MATCH_LINEUP_EDIT=null;
function matchLineupPositions(players,teams){
  const map=new Map();
  for(const side of ['A','B']){
    teams[side].starters.forEach((i,k)=>map.set(players[i].n,'Team '+side+' · '+(CREATE_LOG_ROLE[GPAIContext.SLOTS[k]]||GPAIContext.SLOTS[k])));
    teams[side].bench.forEach(i=>map.set(players[i].n,'Team '+side+' · dự bị'));
  }
  return map;
}
function matchLineupTeams(record){
  if(!Array.isArray(record.subset)||!record.result?.evA||!record.result?.evB)throw new Error('Trận này không có đủ dữ liệu đội hình.');
  return Object.fromEntries(['A','B'].map(side=>[side,{starters:record.result['ev'+side].starters.slice(),bench:record.result['ev'+side].bench.slice()}]));
}
function matchLineupOpen(id){
  if(!canEdit){openAdminModal();return;}
  try{
    const record=getHistory().find(r=>String(r.id)===String(id));if(!record)throw new Error('Không tìm thấy trận.');
    const teams=matchLineupTeams(record),players=record.subset.map(GPAIContext.player);
    GPAIContext.validateLineupRoster(players,teams,{manualEdit:true,allowUnevenBench:true});
    const pool=record.subset.slice(),names=new Set(pool.map(p=>p.n));
    for(const p of getPlayers())if(!names.has(p.n)){pool.push(p);names.add(p.n);}
    MATCH_LINEUP_EDIT={id:record.id,fingerprint:JSON.stringify(record),record:structuredClone(record),players,pool:pool.map(GPAIContext.player),rawPool:pool,teams,proposal:null,busy:false};
    $('matchLineupSource').textContent=(fmtKick(record.kickoff)||record.label||'Trận đấu')+(record.score?' · Trận đã có tỉ số: thay đổi sẽ ảnh hưởng thống kê cầu thủ.':'')+' · Chỉ cập nhật trận này.';
    $('matchLineupInstruction').value='';$('matchLineupStatus').hidden=true;$('matchLineupPreview').hidden=true;$('matchLineupApply').hidden=true;$('matchLineupRun').disabled=false;
    $('matchLineupEditDialog').showModal();
  }catch(e){alert('Không mở được đội hình: '+e.message+' Chức năng này hỗ trợ trận sân 7 có đủ dữ liệu.');}
}
function matchLineupClose(){if(MATCH_LINEUP_EDIT?.saving)return;const dialog=$('matchLineupEditDialog');if(dialog.open)dialog.close();MATCH_LINEUP_EDIT=null;}
function matchLineupChanged(){if(!MATCH_LINEUP_EDIT)return;MATCH_LINEUP_EDIT.proposal=null;$('matchLineupPreview').hidden=true;$('matchLineupApply').hidden=true;$('matchLineupStatus').hidden=true;}
function matchLineupHuman(text,edit){return String(text||'').replace(/\bp\d+\b/gi,code=>edit.pool[+code.slice(1)]?.n||'cầu thủ chưa xác định');}
function matchLineupCheckGoals(record,players,teams){
  const old=matchLineupPositions(record.subset,matchLineupTeams(record)),next=matchLineupPositions(players,teams);
  for(const [name,count] of Object.entries(record.goals||{}))if(+count>0&&(!next.has(name)||old.get(name)?.slice(0,6)!==next.get(name)?.slice(0,6)))throw new Error(name+' đã có bàn thắng; không thể xóa hoặc chuyển đội khi bàn thắng chưa được điều chỉnh.');
}
async function matchLineupRun(){
  const edit=MATCH_LINEUP_EDIT,instruction=$('matchLineupInstruction').value.trim(),status=$('matchLineupStatus');
  if(!edit||edit.busy||AI_STATE.busy)return;status.hidden=false;status.className='ai-message';
  if(!instruction){status.className='ai-message error';status.textContent='Hãy nhập yêu cầu sửa đội hình.';return;}
  if(!AI_KEYS.has()){aiOpenKeyDialog(true);aiKeyMessage('Cần key OpenRouter để sửa đội hình bằng AI.');return;}
  edit.proposal=null;$('matchLineupApply').hidden=true;$('matchLineupPreview').hidden=true;edit.busy=true;AI_STATE.busy=true;$('matchLineupRun').disabled=true;status.textContent='AI đang xem yêu cầu sửa…';
  try{
    const history=getHistory().filter(r=>r.result&&Array.isArray(r.subset)).slice(0,500).map(GPAIContext.compactLegacy);
    const response=await aiFetch('run',{task:'match-lineup-edit',context:{players:edit.pool,rosterNames:edit.players.map(p=>p.n),history,instruction,editTeams:edit.teams}}),out=response.output;
    if(MATCH_LINEUP_EDIT!==edit||$('matchLineupInstruction').value.trim()!==instruction)return;
    if(out.status==='clarify'){status.textContent=matchLineupHuman(out.message,edit);return;}
    if(out.status!=='ready'||!out.result||!out.teams||!Array.isArray(out.subset))throw new Error('AI chưa trả đội hình hợp lệ.');
    matchLineupCheckGoals(edit.record,out.subset,out.teams);
    const before=matchLineupPositions(edit.players,edit.teams),after=matchLineupPositions(out.subset,out.teams),changes=[];
    for(const name of new Set([...before.keys(),...after.keys()]))if(before.get(name)!==after.get(name))changes.push(name+': '+(before.get(name)||'Ngoài trận')+' → '+(after.get(name)||'Nghỉ / rời trận'));
    if(!changes.length)throw new Error('Đề xuất không thay đổi đội hình.');
    const preview=$('matchLineupPreview');preview.replaceChildren();preview.appendChild(createLogNode('strong','','AI hiểu yêu cầu'));preview.appendChild(createLogNode('p','',matchLineupHuman(out.message,edit)));
    preview.appendChild(createLogNode('strong','','Thay đổi đề xuất'));const list=createLogNode('ul');for(const change of changes)list.appendChild(createLogNode('li','',change));preview.appendChild(list);
    if(edit.record.score||Object.values(edit.record.goals||{}).some(g=>+g>0))preview.appendChild(createLogNode('p','lineup-edit-warning','Trận đã có kết quả hoặc bàn thắng: thay đổi đội hình sẽ ảnh hưởng thống kê. Tỉ số và bàn thắng được giữ nguyên.'));
    if(edit.record.review)preview.appendChild(createLogNode('p','lineup-edit-warning','Nhận định cũ sẽ được giữ lại và đánh dấu cần cập nhật.'));
    if(out.warnings?.length){const box=createLogNode('div','lineup-edit-warning');box.appendChild(createLogNode('strong','','Cần xem lại'));for(const warning of out.warnings)box.appendChild(createLogNode('p','',matchLineupHuman(warning,edit)));preview.appendChild(box);}
    edit.proposal={out,instruction,changes};preview.hidden=false;$('matchLineupApply').hidden=false;status.textContent='Kiểm tra thay đổi trước khi lưu.';
  }catch(e){if(MATCH_LINEUP_EDIT===edit){status.className='ai-message error';status.textContent=matchLineupHuman(e.message,edit)+' Chưa lưu thay đổi.';}}
  finally{edit.busy=false;AI_STATE.busy=false;if(MATCH_LINEUP_EDIT===edit)$('matchLineupRun').disabled=false;}
}
async function matchLineupApply(){
  const edit=MATCH_LINEUP_EDIT,proposal=edit?.proposal,status=$('matchLineupStatus');if(!edit||!proposal||edit.busy||edit.saving||AI_STATE.busy)return;
  if(!canEdit){status.hidden=false;status.className='ai-message error';status.textContent='Phiên đăng nhập đã hết. Hãy đăng nhập lại.';return;}
  if(aiIsPreview()||!(STATE.cloud&&STATE.docRef)){status.hidden=false;status.className='ai-message error';status.textContent='Chưa kết nối cloud; không lưu để tránh mất dữ liệu.';return;}
  edit.saving=true;$('matchLineupApply').disabled=true;$('matchLineupRun').disabled=true;status.hidden=false;status.className='ai-message';status.textContent='Đang lưu thay đổi…';
  try{
    const {out,instruction,changes}=proposal,rawByName=new Map(edit.rawPool.map(p=>[p.n,p])),subset=out.subset.map(p=>rawByName.get(p.n));
    if(subset.some(p=>!p))throw new Error('Thiếu dữ liệu cầu thủ.');
    const checked=GPAIContext.lineup(subset.map(GPAIContext.player),out.teams,{instruction,history:[],manualEdit:true,allowUnevenBench:true});
    await firebase.firestore().runTransaction(async tx=>{
      const snap=await tx.get(STATE.docRef),history=snap.data()?.history;if(!Array.isArray(history))throw new Error('Không đọc được lịch sử trên cloud.');
      const index=history.findIndex(r=>String(r.id)===String(edit.id));if(index<0)throw new Error('Trận đã bị xóa.');
      const current=history[index];if(JSON.stringify(current)!==edit.fingerprint)throw new Error('Trận đã thay đổi ở thiết bị khác. Hãy mở lại và thực hiện lại.');
      matchLineupCheckGoals(current,subset,out.teams);
      history[index]={...current,subset,result:checked.result,n:subset.length,...(current.review?{reviewStale:true}:{})};
      tx.update(STATE.docRef,{history});
    });
    try{logMatchAct('lineup_edit',edit.id,fmtKick(edit.record.kickoff)||edit.record.label||'',changes.join('; '));}catch(e){console.warn('Không ghi được nhật ký sửa đội hình:',e);}
    edit.saving=false;matchLineupClose();toast('Đã cập nhật đội hình trận.','ok');
    // The existing Firestore snapshot listener updates the history in all views.
    try{showHistory();}catch(e){console.warn('Không làm mới được lịch sử:',e);}
  }catch(e){status.className='ai-message error';status.textContent=(e.message||'Không lưu được thay đổi.')+' Chưa ghi đè trận.';}
  finally{edit.saving=false;$('matchLineupApply').disabled=false;$('matchLineupRun').disabled=false;}
}
if(typeof window!=='undefined')$('matchLineupEditDialog').addEventListener('cancel',event=>{event.preventDefault();matchLineupClose();});
