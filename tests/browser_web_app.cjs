// Optional visual/integration QA. Requires Playwright + an installed Chrome.
// No provider/Firebase writes: fake provider, Firebase SDK stubbed, network blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {getConfig,createApp}=require('../server/index.cjs'),C=require('../src/ai_context.js');
const password='browser-test-password-not-real',secret='sk-or-browser-test-not-real';
const names=['Danh Tuyên','Trịnh Mạnh','Văn Quyền','Nam Khắc','Quy Bong','Huy Hoàng','Quyết Nguyễn','Khắc Trọng','Hưng','Quốc An','Duy Hùng','Doan Ha','Việt Dũng','Văn Thanh','Khách (Mạnh Tiến)','Khách (Mạnh Khắc)'];
const players=names.map((n,i)=>({n,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const teams={A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}};
const result=C.lineup(players,teams).result;
const history=Array.from({length:5},(_,i)=>({id:100+i,kickoff:Date.now()-(i+1)*86400000,n:16,subset:players,result,score:{a:3,b:2},goals:{'Huy Hoàng':2},goalsLocked:true}));
const reports=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-web-app-qa-'));
let providerCalls=0;
const fakeProvider=async(url,init)=>{
  providerCalls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
  const req=JSON.parse(init.body),task=req.response_format.json_schema.name.replaceAll('_','-'),data=JSON.parse(req.messages[1].content);
  const output={title:'Bản phân tích kiểm thử',sections:Array.from({length:task==='match-review'?6:3},(_,i)=>({heading:'Phân tích '+(i+1),body:i===0?'<img src=x onerror="window.AI_XSS=true"> — văn bản AI phải được escape.':'Đội hình được đối chiếu chỉ số và kết quả gần đây; đây là dữ liệu kiểm thử, không phải nhận định thật.'}))};
  if(task==='lineup'){
    const member=data.players.filter(p=>!p.guest).map(p=>p.index),guests=data.players.filter(p=>p.guest).map(p=>p.index),rest=[...member.slice(14),...guests];
    output.teams={A:{starters:member.slice(0,7),bench:rest.filter((_,i)=>i%2===0)},B:{starters:member.slice(7,14),bench:rest.filter((_,i)=>i%2===1)}};
  }
  if(task==='player-form'){output.verdict='keep';output.suggestions=[{attribute:'DD',direction:'keep',reason:'Cần quan sát trực tiếp trước khi đổi điểm.'}];}
  return new Response(JSON.stringify({model:'fake/qa',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:100,completion_tokens:200}}));
};
async function main(){
  const config={...getConfig({OPENROUTER_API_KEY:secret,AI_ACCESS_PASSWORD:password}),origin:''},app=createApp(config,{fetchImpl:fakeProvider});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try{
    for(const mobile of [false,true]){
      const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},timezoneId:'Asia/Ho_Chi_Minh',serviceWorkers:'block'});
      const errors=[],writes=[],requests=[];const page=await ctx.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await ctx.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:'/* cloud disabled for QA */'}));
      await ctx.route('**/firestore.googleapis.com/**',route=>{writes.push(route.request().method());return route.abort();});
      page.on('request',r=>{if(r.url().includes('/api/'))requests.push({url:r.url(),body:r.postData()||''});});
      await ctx.addInitScript(({players,history})=>{
        localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history',JSON.stringify(history));
        localStorage.setItem('gp_web_preview_finance',JSON.stringify([{amount:99999,note:'PRIVATE_FINANCE_CANARY'}]));
      },{players,history});
      page.on('dialog',d=>d.accept());
      await page.goto(config.origin);await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
      await page.locator('#aiLoginForm').waitFor({state:'visible'});
      await page.locator('#aiPassword').fill(password);await page.locator('#aiLoginBtn').click();
      await page.waitForFunction(()=>!document.querySelector('#aiRun').disabled);
      assert.equal(await page.locator('#aiMatchField').isVisible(),false);
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-ai-dark.png'),fullPage:true});
      await page.locator('#aiRun').click();assert.match(await page.locator('#aiMessage').innerText(),/chọn ít nhất 14/i);
      await page.getByRole('button',{name:'Chọn người có mặt',exact:true}).click();
      await page.getByRole('button',{name:'Tạo đội bằng AI',exact:true}).click();
      await page.locator('#aiRun').click();await page.locator('#aiOutput').waitFor({state:'visible'});
      assert.equal(await page.locator('#aiLineupPreview .field .player').count(),14);
      assert.equal(await page.evaluate(()=>window.AI_XSS),undefined);assert.equal(await page.locator('#aiOutputText img').count(),0);
      assert.equal(await page.evaluate(()=>getHistory().length),5,'AI generation must not create a match');
      await page.screenshot({path:path.join(reports,(mobile?'mobile':'desktop')+'-lineup.png'),fullPage:true});
      await page.locator('#aiUseLineup').click();assert.equal(await page.locator('#saveWeek').isVisible(),true);assert.equal(await page.evaluate(()=>getHistory().length),5);
      await page.evaluate(()=>openAITask('match-review',100));
      await page.locator('#aiRun').click();await page.waitForFunction(()=>AI_STATE.request?.task==='match-review'&&!AI_STATE.busy);
      assert.equal(await page.locator('#aiOutputText section').count(),6);await page.locator('#aiSaveReview').click();assert.match(await page.locator('#aiMessage').innerText(),/không ghi nhận định lên cloud/);
      await page.locator('#aiTask').selectOption('player-form');await page.locator('#aiRun').click();await page.waitForFunction(()=>AI_STATE.request?.task==='player-form'&&!AI_STATE.busy);
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
      await page.locator('#aiLogout').click();await page.waitForFunction(()=>document.querySelector('#aiRun').disabled);
      assert.ok(requests.every(r=>!r.body.includes(secret)&&!r.body.includes('PRIVATE_FINANCE_CANARY')));assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
      await ctx.close();
    }
    // Test review save against an isolated in-memory transaction, NEVER live Firebase.
    config.dataMode='cloud';
    const ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage();page.on('dialog',d=>d.accept());
    await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* cloud disabled */'}));
    await ctx.route('**/firestore.googleapis.com/**',r=>r.abort());
    await ctx.addInitScript(({players,history})=>{localStorage.setItem('gp_web_cloud_players',JSON.stringify(players));localStorage.setItem('gp_web_cloud_history',JSON.stringify(history));},{players,history});
    await page.goto(config.origin);await page.evaluate(()=>openAITask('match-review',100));await page.locator('#aiLoginForm').waitFor({state:'visible'});
    await page.locator('#aiPassword').fill(password);await page.locator('#aiLoginBtn').click();await page.waitForFunction(()=>!document.querySelector('#aiRun').disabled);
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
    console.log(JSON.stringify({ok:true,providerCalls,reports,coverage:'desktop/mobile, dark/light, login/logout, all 4 tasks, preview/apply draft, no XSS, no Firebase writes, no secret/finance payloads'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
