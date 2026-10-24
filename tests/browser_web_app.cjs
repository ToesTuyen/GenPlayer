// Optional visual/integration QA. Requires Playwright + an installed Chrome.
// No provider/Firebase writes: fake provider, Firebase SDK stubbed, network blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {getConfig,createApp}=require('../scripts/serve_web.cjs'),C=require('../src/ai_context.js');
const secret='sk-or-browser-test-not-real';
const names=['Danh Tuyên','Trịnh Mạnh','Văn Quyền','Nam Khắc','Quy Bong','Huy Hoàng','Quyết Nguyễn','Khắc Trọng','Hưng','Quốc An','Duy Hùng','Doan Ha','Việt Dũng','Văn Thanh','Khách (Mạnh Tiến)','Khách (Mạnh Khắc)'];
const players=names.map((n,i)=>({n,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const teams={A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}};
const result=C.lineup(players,teams).result;
const history=Array.from({length:5},(_,i)=>({id:100+i,kickoff:Date.now()-(i+1)*86400000,n:16,subset:players,result,score:{a:3,b:2},goals:{'Huy Hoàng':2},goalsLocked:true}));
const reports=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-web-app-qa-'));
const progressOnly=process.env.GP_QA_PROGRESS_ONLY==='1';
let providerCalls=0,lineupGate=null,providerFailure=false;const providerInputs=[];
const lineupNote='Tách hai tiền vệ giữa, cân riêng công và thủ.';
const fakeProvider=async(url,init)=>{
  providerCalls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer '+secret);
  const req=JSON.parse(init.body),task=req.response_format.json_schema.name.replaceAll('_','-'),data=JSON.parse(req.messages[1].content);
  providerInputs.push({task,instruction:data.instruction});
  if(task==='lineup'&&lineupGate)await lineupGate;
  if(task==='lineup'&&providerFailure)return new Response('{"error":{"message":"private provider detail"}}',{status:401});
  const output={title:'Bản phân tích kiểm thử',sections:Array.from({length:task==='match-review'?6:3},(_,i)=>({heading:'Phân tích '+(i+1),body:i===0?'<img src=x onerror="window.AI_XSS=true"> — văn bản AI phải được escape.':'Đội hình được đối chiếu chỉ số và kết quả gần đây; đây là dữ liệu kiểm thử, không phải nhận định thật.'}))};
  if(task==='lineup'){
    output.candidateId=data.candidates[0].id;output.flipTeams=false;output.swaps=[];
  }
  if(task==='player-form'){output.verdict='keep';output.suggestions=[{attribute:'DD',direction:'keep',reason:'Cần quan sát trực tiếp trước khi đổi điểm.'}];}
  return new Response(JSON.stringify({model:'fake/qa',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:100,completion_tokens:200}}));
};
async function installProviderRoute(ctx){
  await ctx.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
    const req=route.request();
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,x-openrouter-title'}});
    const response=await fakeProvider(req.url(),{headers:{Authorization:req.headers().authorization},body:req.postData()});
    await route.fulfill({status:response.status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:await response.text()});
  });
}
async function main(){
  const config={...getConfig({}),origin:''},app=createApp(config);
  await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try{
    for(const mobile of [false,true]){
      const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},timezoneId:'Asia/Ho_Chi_Minh',serviceWorkers:'block'});
      const errors=[],writes=[],requests=[];const page=await ctx.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await ctx.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:'/* cloud disabled for QA */'}));
      await ctx.route('**/firestore.googleapis.com/**',route=>{writes.push(route.request().method());return route.abort();});
      await installProviderRoute(ctx);
      page.on('request',r=>{if(r.url().includes('/api/'))requests.push({url:r.url(),body:r.postData()||''});});
      await ctx.addInitScript(({players,history})=>{
        localStorage.setItem('gp_theme','dark');
        localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history',JSON.stringify(history));
        localStorage.setItem('gp_web_preview_finance',JSON.stringify([{amount:99999,note:'PRIVATE_FINANCE_CANARY'}]));
      },{players,history});
      let acceptDialogs=true;page.on('dialog',d=>acceptDialogs?d.accept():d.dismiss());
      await page.goto(config.origin);
      assert.equal(await page.getByRole('button',{name:'Trợ lý AI',exact:true}).count(),0,'No separate AI navigation');
      await page.getByRole('button',{name:'Tạo đội',exact:true}).click();
      assert.equal(await page.locator('#aiKeyDialog').isVisible(),true,'Missing key prompts on entering Create');
      await page.locator('#aiKeySkip').click();assert.equal(await page.locator('#aiKeyDialog').isVisible(),false,'Skip does not block roster selection');
      assert.equal(await page.locator('#aiInstruction').isVisible(),true,'Lineup Note is visible without opening AI options');
      assert.equal(await page.locator('#aiInstruction').evaluate(el=>el.closest('#createAI')),null,'Lineup Note is not hidden inside AI options');
      await page.locator('#createCriteria summary').click();
      assert.equal(await page.locator('.create-rule-list li').count(),12);
      assert.equal(await page.locator('.create-rule-list').isVisible(),true);
      assert.match(await page.locator('.criteria-scope').innerText(),/chưa tối ưu/);
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-criteria-note.png'),fullPage:true,animations:'disabled'});
      await page.locator('#createCriteria summary').click();
      await page.locator('#selectAll').uncheck();
      assert.equal(await page.locator('#all,#none').count(),0);
      assert.ok(await page.locator('#go').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('#roster'))&Node.DOCUMENT_POSITION_FOLLOWING)));
      assert.equal(await page.locator('#screen-create button').filter({hasText:/^Tạo đội$/}).count(),1,'Only one lineup create action');
      await page.locator('#go').click();await page.locator('#createProcessClose').waitFor({state:'visible'});
      await page.waitForFunction(()=>!CREATE_STATE.busy);
      assert.match(await page.locator('#createProcessSummary').innerText(),/14 đến 24/);
      assert.equal(await page.locator('[data-step="roster"]').getAttribute('data-state'),'error');
      assert.equal(await page.locator('#createProcessSteps [data-state="done"]').count(),0);
      await page.locator('#createProcessClose').click();
      assert.equal(await page.locator('#aiCreateToggle').count(),0,'No redundant AI options button');
      assert.equal(await page.locator('#createAI').isVisible(),true,'Connection is directly available on Create');
      assert.equal(await page.locator('#createAI').evaluate(el=>el.closest('.screen').id),'screen-create');
      assert.equal(await page.locator('.ai-inline-head').count(),0,'No separate AI workspace header');
      assert.ok(await page.locator('#createAI').evaluate(el=>el.closest('.card-box')===document.querySelector('#roster').closest('.card-box')),'AI settings stay in the same roster card');
      assert.equal(await page.locator('#aiAnalysisTools').isVisible(),false,'No generic analysis tools on Create');
      await page.locator('#aiKeySettings').click();
      await page.locator('#aiKeyForm').waitFor({state:'visible'});
      await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();
      await page.waitForFunction(()=>!document.querySelector('#aiRun').disabled);
      assert.equal(await page.locator('#aiKey').inputValue(),'','Never prefill or retain the key in the input');
      assert.equal(await page.evaluate(()=>localStorage.getItem(AI_KEYS.storageName)),secret);
      assert.equal(await page.locator('#aiMatchField').isVisible(),false);
      assert.equal(await page.locator('#aiRun').isVisible(),false,'No duplicate create button for AI');
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-ai-dark.png'),fullPage:true});
      assert.equal(await page.locator('#aiKeyForm').isVisible(),false,'Saving closes the key popup');
      assert.equal(await page.locator('#createAI').isVisible(),true,'Connection summary stays accessible');
      assert.equal(await page.evaluate(()=>selectedIdx().length),0,'Returning to roster must not reset selections');
      await page.locator('#selectAll').check();await page.locator('#roster .pl-item.guest input').last().uncheck();
      assert.equal(await page.locator('#selectAll').evaluate(el=>el.indeterminate),true,'Partial selection reflected on master checkbox');
      assert.equal(await page.evaluate(()=>selectedIdx().length),15);
      await page.locator('#aiKeySettings').click();
      assert.equal(await page.locator('#aiKeyDialog').isVisible(),true);await page.locator('#aiKeySkip').click();
      assert.equal(await page.evaluate(()=>selectedIdx().length),15,'Opening inline AI preserves selected roster');
      assert.equal(await page.locator('#createAI').isVisible(),true);
      await page.locator('#aiInstruction').fill(lineupNote);
      await page.locator('#aiKeySettings').click();await page.locator('#aiKeySkip').click();
      assert.equal(await page.locator('#aiInstruction').inputValue(),lineupNote);
      assert.equal(await page.locator('#aiAnalysisInstructionField').isVisible(),false);
      await page.evaluate(()=>{
        window.QA_STEP_TIMES=[];
        window.QA_STEP_OBSERVER=new MutationObserver(records=>{
          for(const m of records)if(m.type==='attributes'&&m.target.matches('li[data-step]'))window.QA_STEP_TIMES.push({id:m.target.dataset.step,state:m.target.dataset.state,at:performance.now(),top:document.querySelector('#createProcessSteps').firstElementChild.dataset.step});
        });
        window.QA_STEP_OBSERVER.observe(document.querySelector('#createProcessSteps'),{attributes:true,attributeFilter:['data-state'],subtree:true});
      });
      let release;lineupGate=new Promise(r=>release=r);const beforeProvider=providerCalls;
      await page.locator('#go').click();
      await page.waitForFunction(()=>document.querySelector('[data-step="search"]').dataset.state==='active');
      assert.equal(await page.locator('#createProcess').isVisible(),true);
      assert.equal(await page.locator('[data-step="balance"]').getAttribute('data-state'),'pending','No fabricated checks before the model returns');
      assert.equal(await page.locator('#go').isDisabled(),true);
      assert.deepEqual(await page.locator('#createProcessSteps > li').evaluateAll(rows=>rows.slice(0,5).map(el=>el.dataset.step)),['search','engine','history','ratings','roster'],'Active step precedes completed steps, newest first');
      assert.equal(await page.locator('#createProcessSteps').evaluate(el=>el.scrollTop),0,'Active step is visible at the top without following it down');
      // A second call while busy cannot send an extra request.
      await page.evaluate(()=>createTeams());
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-process.png'),animations:'disabled'});
      release();lineupGate=null;
      await page.waitForFunction(()=>!CREATE_STATE.busy);
      assert.equal(providerCalls,beforeProvider+1);
      assert.equal(await page.locator('#result .field .player').count(),14);
      assert.equal(await page.locator('#reviewDraft').isVisible(),true,'A review action appears only after a lineup exists');
      assert.equal(await page.locator('#aiOutput').isVisible(),false,'Generation does not show a generic analysis panel');
      assert.equal(await page.locator('[data-step="partition"]').getAttribute('data-state'),'done');
      assert.equal(await page.locator('[data-step="note"]').getAttribute('data-state'),'warn','Free-text Note must not be marked satisfied without verification');
      assert.match(await page.locator('[data-step="note"]').innerText(),/Đã gửi Note hiện tại/);
      assert.equal(await page.locator('#createProcessProgress').getAttribute('max'),'11');
      assert.equal(await page.locator('[data-step="rotation"]').getAttribute('data-state'),'warn','Repeated positions must not receive a green check');
      assert.equal(await page.evaluate(()=>window.AI_XSS),undefined);assert.equal(await page.locator('#aiOutputText img').count(),0);
      assert.equal(await page.evaluate(()=>getHistory().length),5,'AI generation must not create a match');
      const durations=await page.evaluate(()=>{
        window.QA_STEP_OBSERVER.disconnect();return CREATE_STEPS.map(([id])=>{
          const events=window.QA_STEP_TIMES.filter(e=>e.id===id),start=events.find(e=>e.state==='active'),end=events.find(e=>['done','warn'].includes(e.state));
          return {id,ms:start&&end?end.at-start.at:0,first:start?.top===id};
        });
      });assert.ok(durations.every(s=>s.ms>=950),'Every completed row stays visible for about one second: '+JSON.stringify(durations));
      assert.ok(durations.every(s=>s.first),'Every active row moves to the top');
      assert.deepEqual(await page.locator('#createProcessSteps > li').evaluateAll(rows=>rows.map(el=>el.dataset.step)),await page.evaluate(()=>CREATE_STEPS.map(([id])=>id).reverse()),'Finished checklist remains newest-first');
      assert.equal(await page.locator('#createProcess').isVisible(),true,'Completion leaves the checklist open');
      assert.equal(await page.locator('#createProcessSteps').evaluate(el=>el.scrollTop),0,'Completed checklist returns to the beginning for reading');
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-lineup.png'),fullPage:true});
      await page.locator('#createProcessClose').click();
      const draftBeforeReview=await page.evaluate(()=>JSON.stringify(cstate)),callsBeforeReview=providerCalls;
      await page.locator('#reviewProcess').click();assert.equal(await page.locator('#createProcess').isVisible(),true);
      assert.equal(await page.locator('#createProcessSteps > li').first().getAttribute('data-step'),'draft','Reopened report preserves reverse order');
      assert.equal(await page.locator('[data-step="partition"]').getAttribute('data-state'),'done');
      assert.equal(providerCalls,callsBeforeReview,'Reopening the checklist cannot call AI');
      assert.equal(await page.evaluate(()=>JSON.stringify(cstate)),draftBeforeReview,'Reopening checklist cannot modify a draft');
      await page.locator('#createProcessClose').click();
      if(progressOnly){assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await ctx.close();continue;}
      assert.match(await page.locator('#createNoteStatus').innerText(),/Note đã gửi AI/);
      assert.ok((await page.locator('#createNoteStatus').innerText()).includes(lineupNote));
      await page.locator('#aiInstruction').fill('Tuyên bắt gôn theo Note mới');
      assert.match(await page.locator('#createNoteStatus').innerText(),/Note đã thay đổi/);
      assert.equal(await page.evaluate(()=>CREATE_STATE.draftNote),lineupNote,'Displayed draft keeps its actual Note snapshot');
      await page.locator('#aiInstruction').fill(lineupNote);
      assert.equal(await page.locator('#saveWeek').isVisible(),true);assert.equal(await page.evaluate(()=>getHistory().length),5);
      assert.equal(await page.locator('#screen-create').isVisible(),true);
      assert.equal(await page.evaluate(()=>selectedIdx().length),15);assert.equal(await page.evaluate(()=>cstate.subset.length),15);
      // Invalid provider key: exactly one paid attempt, then a responsive worker fallback.
      providerFailure=true;const beforeFailure=providerCalls;
      await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{},{timeout:30000});providerFailure=false;
      assert.equal(providerCalls,beforeFailure+1,'No retry of an invalid key');
      assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng Thuật toán/);
      assert.equal(await page.locator('[data-step="engine"]').getAttribute('data-state'),'warn');
      assert.equal(await page.locator('[data-step="note"]').getAttribute('data-state'),'warn');
      assert.match(await page.locator('#createNoteStatus').innerText(),/Chưa áp dụng Note/);
      assert.equal(await page.locator('#result').evaluate((el,note)=>el.innerText.includes(note),lineupNote),false,'Private Note is not inserted into a publishable review');
      assert.equal(await page.locator('#result .field .player').count(),14);
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-fallback.png'),animations:'disabled'});
      await page.locator('#createProcessClose').click();
      // Removing the local key must not attempt a paid request at all.
      await page.locator('#aiKeySettings').click();await page.locator('#aiRemoveKey').click();await page.locator('#aiKeySkip').click();
      const beforeMissing=providerCalls;await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy);
      assert.equal(providerCalls,beforeMissing);assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng Thuật toán/);
      assert.equal(await page.evaluate(()=>cstate.idx),1,'Repeated Create cycles algorithm alternatives without another paid call');
      await page.locator('#createProcessClose').click();
      await page.locator('#aiKeySettings').click();await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();
      const beforeCancel=await page.evaluate(()=>JSON.stringify(cstate)),callsBeforeCancel=providerCalls;
      acceptDialogs=false;await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy);acceptDialogs=true;
      assert.match(await page.locator('#createProcessSummary').innerText(),/Đã huỷ/);
      assert.equal(providerCalls,callsBeforeCancel,'Declining data sharing cannot call the provider');
      assert.equal(await page.evaluate(()=>JSON.stringify(cstate)),beforeCancel,'Cancellation preserves the previous draft');
      await page.locator('#createProcessClose').click();
      await page.evaluate(()=>openAITask('match-review',100));
      assert.equal(await page.locator('#aiAnalysisInstructionField').isVisible(),true);
      assert.equal(await page.locator('#aiAnalysisInstruction').inputValue(),'');
      assert.equal(await page.evaluate(()=>aiContextSnapshot().instruction),'','Lineup Note is not reused as review instructions');
      await page.locator('#aiAnalysisInstruction').fill('Phân tích chuỗi kết quả.');
      await page.locator('#aiRun').click();await page.waitForFunction(()=>AI_STATE.request?.task==='match-review'&&!AI_STATE.busy);
      assert.equal(await page.evaluate(()=>AI_STATE.request.context.instruction),'Phân tích chuỗi kết quả.');
      assert.equal(await page.locator('#aiOutputText section').count(),6);await page.locator('#aiSaveReview').click();assert.match(await page.locator('#aiMessage').innerText(),/không ghi nhận định lên cloud/);
      await page.locator('#aiTask').selectOption('player-form');await page.locator('#aiRun').click();await page.waitForFunction(()=>AI_STATE.request?.task==='player-form'&&!AI_STATE.busy);
      assert.equal(await page.locator('#aiMessage').isVisible(),false,'Visible analysis replaces routine success explanations');
      assert.equal(await page.locator('#aiPlayerField').isVisible(),true);assert.equal(await page.locator('#aiMatchField').isVisible(),false);
      await page.locator('#aiTask').selectOption('player-description');await page.locator('#aiRun').click();await page.waitForFunction(()=>AI_STATE.request?.task==='player-description'&&!AI_STATE.busy);
      await page.locator('#themeBtn').click();await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-ai-light.png'),fullPage:true,animations:'disabled'});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'No horizontal overflow');
      // Simulate the live connection and exercise EVERY direct write path in preview.
      const blocked=await page.evaluate(()=>{
        let writes=0;STATE.cloud=true;STATE.docRef={set:()=>{writes++;return Promise.resolve();}};
        window.firebase={firestore:Object.assign(()=>({}),{FieldValue:{arrayUnion:x=>x}})};
        STATE._lastWritten={};persist();logMatchAct('score',100,'test','preview-only');return writes;
      });assert.equal(blocked,0,'Preview cannot call Firestore set');
      await page.locator('#aiKeySettings').click();await page.locator('#aiRemoveKey').click();await page.waitForFunction(()=>document.querySelector('#aiRun').disabled);await page.locator('#aiKeySkip').click();
      assert.equal(await page.evaluate(()=>localStorage.getItem(AI_KEYS.storageName)),null);
      // Empty Note really means no per-match requests, even with history available.
      await page.locator('#aiInstruction').fill(' ');await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy);
      assert.equal(await page.locator('[data-step="note"]').getAttribute('data-state'),'done');
      assert.match(await page.locator('[data-step="note"]').innerText(),/không có yêu cầu riêng/);
      assert.equal(await page.evaluate(()=>CREATE_STATE.draftNote),'');
      assert.equal(await page.locator('#createNoteStatus').isVisible(),false,'Empty Note does not add a redundant explanation box');
      assert.equal(await page.locator('#status').textContent(),'','Draft status is not repeated above the pitch');
      await page.locator('#createProcessClose').click();
      await page.locator('#aiInstruction').fill('Yêu cầu mới sau khi tạo đội');
      assert.match(await page.locator('#createNoteStatus').innerText(),/Note đã thay đổi/);
      await page.locator('#aiInstruction').fill('');
      assert.equal(await page.locator('#createNoteStatus').isVisible(),false);
      assert.ok(providerInputs.filter(x=>x.task==='lineup').every(x=>x.instruction===lineupNote),'Provider receives the exact current lineup Note');
      assert.ok(providerInputs.filter(x=>x.task!=='lineup').every(x=>x.instruction!==lineupNote),'Lineup Note cannot leak into other AI tasks');
      assert.ok(requests.every(r=>r.url==='https://openrouter.ai/api/v1/chat/completions'&&!r.body.includes(secret)&&!r.body.includes('PRIVATE_FINANCE_CANARY')),'Only OpenRouter receives AI requests; no app backend');assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
      await ctx.close();
    }
    if(progressOnly){console.log(JSON.stringify({ok:true,providerCalls,reports,coverage:'desktop/mobile progress: active first, newest completed first, pending last, readable timing, persistent/reopened reverse checklist, no Firebase writes'}));return;}
    // Test review save against an isolated in-memory transaction, NEVER live Firebase.
    config.dataMode='cloud';
    const ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage();page.on('dialog',d=>d.accept());
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* cloud disabled */'}));
    await ctx.route('**/firestore.googleapis.com/**',r=>r.abort());
    await installProviderRoute(ctx);
    await ctx.addInitScript(({players,history})=>{localStorage.setItem('gp_web_cloud_players',JSON.stringify(players));localStorage.setItem('gp_web_cloud_history',JSON.stringify(history));},{players,history});
    await page.goto(config.origin);await page.evaluate(()=>openAITask('match-review',100));await page.locator('#aiKeyForm').waitFor({state:'visible'});
    await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();await page.waitForFunction(()=>!document.querySelector('#aiRun').disabled);
    await page.locator('#aiRun').click();await page.waitForFunction(()=>AI_STATE.request?.task==='match-review'&&!AI_STATE.busy);
    await page.evaluate(()=>{
      window.QA_DOC={history:structuredClone(getHistory()),finance:[{amount:4321}]};window.QA_BEFORE=structuredClone(window.QA_DOC);window.QA_UPDATES=0;
      STATE.cloud=true;STATE.docRef={};isAdmin=true;
      window.firebase={firestore:()=>({runTransaction:async fn=>{await fn({get:async()=>({data:()=>structuredClone(window.QA_DOC)}),update:(ref,patch)=>{window.QA_DOC={...window.QA_DOC,...patch};window.QA_UPDATES++;}});}})};
    });
    await page.locator('#aiSaveReview').click();await page.waitForFunction(()=>window.QA_UPDATES===1);
    const saved=await page.evaluate(()=>{
      const after=structuredClone(window.QA_DOC),r=after.history.find(m=>m.id===100),html=r.review;delete r.review;delete r.aiReview;
      return {same:JSON.stringify(after)===JSON.stringify(window.QA_BEFORE),safeHTML:html.includes('&lt;img')&&!html.includes('<img'),matches:after.history.length};
    });assert.equal(saved.same,true);assert.equal(saved.safeHTML,true);assert.equal(saved.matches,5);
    await page.evaluate(()=>{window.QA_DOC.history.find(m=>m.id===100).score={a:9,b:9};});await page.locator('#aiSaveReview').click();assert.match(await page.locator('#aiMessage').innerText(),/đã thay đổi/);assert.equal(await page.evaluate(()=>window.QA_UPDATES),1);
    await ctx.close();
    console.log(JSON.stringify({ok:true,providerCalls,reports,coverage:'single Create button, tri-state select-all, top toolbar, real progress, bad/missing key algorithm fallback, no duplicate requests, AI tasks, desktop/mobile, dark/light, no XSS or Firebase writes'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
