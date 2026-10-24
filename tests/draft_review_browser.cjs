// Contextual draft review QA: fake OpenRouter, no Firebase, never writes live data.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),C=require('../src/ai_context.js');
const {getConfig,createApp}=require('../scripts/serve_web.cjs');
const secret='sk-or-draft-review-fake-key',note='PRIVATE_DRAFT_NOTE_CANARY';
const players=Array.from({length:16},(_,i)=>({n:'Review cầu thủ '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const result=C.lineup(players,{A:{starters:[0,1,2,3,4,5,6],bench:[14]},B:{starters:[7,8,9,10,11,12,13],bench:[15]}}).result;
const history=Array.from({length:5},(_,i)=>({id:100+i,kickoff:Date.now()-(i+1)*86400000,n:16,subset:players,result,score:{a:3,b:1},goals:{[players[0].n]:2},goalsLocked:true}));
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-draft-review-'));
async function main(){
  const config=getConfig({}),server=createApp(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  let calls=0;const errors=[];
  try{
    for(const width of [1280,390]){
      const ctx=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await ctx.addInitScript(({players,history})=>{try{localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history',JSON.stringify(history));}catch{}},{players,history});
      await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* disabled */'}));
      await ctx.route('**/firestore.googleapis.com/**',r=>r.abort());
      let release,gate,expectedTeams;const inputs=[];
      await ctx.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
        calls++;assert.equal(route.request().headers().authorization,'Bearer '+secret);
        const body=route.request().postData(),request=JSON.parse(body),data=JSON.parse(request.messages[1].content);inputs.push(data);
        assert.equal(request.response_format.json_schema.name,'match_review');assert.equal(data.isDraft,true);assert.equal(data.match.id,'current-lineup-draft');assert.equal(data.match.kickoff,null);assert.equal(data.match.score,null);
        assert.equal(data.instruction,'');assert.ok(!body.includes(note)&&!body.includes('PRIVATE_OTHER_ANALYSIS')&&!body.includes(secret));assert.deepEqual(data.match.teams,expectedTeams);
        assert.ok(data.players.every(p=>p.form.played===5),'Recent wins/losses/goals must reach draft assessment');
        await gate;
        const output={title:'Đánh giá bản nháp',sections:Array.from({length:6},(_,i)=>({heading:'Đánh giá '+i,body:i===0?'<img src=x onerror="window.BAD_AI=true">':'Phân tích thử dựa trên đội hình, chuỗi kết quả và bàn thắng.'}))};
        await route.fulfill({headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:JSON.stringify({model:'fake/review',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})});
      });
      async function saveKey(){await page.locator('#aiKeySettings').click();await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();}
      async function removeKey(){await page.locator('#aiKeySettings').click();await page.locator('#aiRemoveKey').click();await page.locator('#aiKeySkip').click();}
      await page.goto(config.origin);await page.getByRole('button',{name:'Tạo đội',exact:true}).click();await page.locator('#aiKeySkip').click();
      assert.equal(await page.locator('#reviewDraft').isVisible(),false);assert.equal(await page.locator('#aiAnalysisTools').isVisible(),false);assert.equal(await page.getByText('Công cụ phân tích',{exact:true}).count(),0);
      await page.locator('#aiInstruction').fill(note);await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});await page.locator('#createProcessClose').click();
      assert.equal(await page.locator('#reviewDraft').isVisible(),true);assert.equal(await page.locator('#aiOutput').isVisible(),false);
      const original=await page.evaluate(()=>JSON.stringify(cstate)),originalHistory=await page.evaluate(()=>JSON.stringify(getHistory())),beforeCalls=calls;
      await page.locator('#reviewDraft').click();assert.equal(await page.locator('#aiKeyDialog').isVisible(),true);await page.locator('#aiKeySkip').click();assert.equal(calls,beforeCalls);assert.equal(await page.evaluate(()=>JSON.stringify(cstate)),original);
      await saveKey();await page.evaluate(()=>{$('aiMatch').value='100';$('aiAnalysisInstruction').value='PRIVATE_OTHER_ANALYSIS';});
      await page.locator('#toggleRoster').click();await page.locator('#roster .pl-item.guest input').last().uncheck();
      expectedTeams=await page.evaluate(()=>aiDraftContext().match.teams);gate=new Promise(r=>release=r);
      await page.locator('#reviewDraft').click();await page.waitForFunction(()=>AI_STATE.reviewingDraft);
      assert.equal(await page.locator('#reviewDraft').isDisabled(),true);assert.equal(await page.locator('#go').isDisabled(),true);assert.match(await page.locator('#reviewDraft').innerText(),/Đang đánh giá/);
      await page.evaluate(()=>aiReviewDraft());release();await page.waitForFunction(()=>!AI_STATE.busy);
      assert.equal(calls,beforeCalls+1,'Double invocation cannot incur another model call');assert.equal(await page.locator('#aiOutputText section').count(),6);assert.equal(await page.locator('#aiOutputText img').count(),0);assert.equal(await page.evaluate(()=>window.BAD_AI),undefined);
      assert.equal(await page.locator('#aiSaveReview').isVisible(),false,'Draft assessment must never overwrite a history match');
      assert.equal(await page.evaluate(()=>JSON.stringify(cstate)),original,'Assessing or changing pending attendance cannot change the displayed draft');assert.equal(await page.evaluate(()=>JSON.stringify(getHistory())),originalHistory);
      const pending=await page.evaluate(()=>{canEdit=true;openMatchModal('create');const data={review:mmDraft.review,subset:mmDraft.subset.length,meta:mmDraft.aiReview};closeMatchModal();return data;});
      assert.ok(pending.review.includes('&lt;img')&&!pending.review.includes('<img'));assert.equal(pending.subset,16);assert.equal(pending.meta.model,'fake/review');
      await page.screenshot({path:path.join(screenshots,'review-'+width+'.png'),fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await removeKey();await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});await page.locator('#createProcessClose').click();
      assert.equal(await page.locator('#aiOutput').isVisible(),false);assert.equal(await page.evaluate(()=>AI_STATE.draftReview),null);assert.deepEqual(await page.evaluate(()=>aiDraftReviewFields()),{});
      await saveKey();expectedTeams=await page.evaluate(()=>aiDraftContext().match.teams);gate=new Promise(r=>release=r);
      await page.locator('#reviewDraft').click();await page.waitForFunction(()=>AI_STATE.reviewingDraft);await page.evaluate(()=>{cstate.key+=':changed-during-review';});release();await page.waitForFunction(()=>!AI_STATE.busy);
      assert.match(await page.locator('#aiMessage').innerText(),/Đội hình đã thay đổi/);assert.equal(await page.locator('#aiOutput').isVisible(),false);assert.equal(await page.evaluate(()=>AI_STATE.draftReview),null);
      assert.equal(calls,beforeCalls+2);assert.equal(inputs.length,2);assert.equal(await page.evaluate(()=>JSON.stringify(getHistory())),originalHistory);await ctx.close();
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,calls,screenshots,coverage:'review action only after draft, algorithm drafts, missing key, exact displayed lineup not selected history/attendance, private notes excluded, recent form/goals, busy/double-click, stale rejection, save snapshot, new draft clears review, desktop/mobile, no cloud writes'}));
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
