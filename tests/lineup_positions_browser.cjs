// Explicit current-Note role authorization, and isolated algorithm fallback.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),C=require('../src/ai_context.js');
const {getConfig,createApp}=require('../scripts/serve_web.cjs');
const secret='sk-or-position-browser-fake-key',note='Position 6 đá giữa';
const players=Array.from({length:16},(_,i)=>({n:'Position '+i,pos:C.SLOTS[i%7],pos2:i===4?['TĐ']:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-position-note-'));
async function main(){
  const config=getConfig({}),app=createApp(config);await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const errors=[],writes=[];let calls=0;
  try{
    for(const width of [1280,390]){
      const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await ctx.newPage();let failProvider=false;
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await ctx.addInitScript(players=>{try{localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history','[]');}catch{}},players);
      await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* Firebase disabled */'}));
      await ctx.route('**/firestore.googleapis.com/**',r=>{writes.push(r.request().method());return r.abort();});
      await ctx.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
        const req=route.request(),cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-openrouter-title','Access-Control-Allow-Methods':'POST,OPTIONS'};
        if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
        calls++;assert.equal(req.headers().authorization,'Bearer '+secret);
        if(failProvider)return route.fulfill({status:401,headers:cors,body:'{"error":{"message":"Fake invalid key"}}'});
        const data=JSON.parse(JSON.parse(req.postData()).messages[1].content),cm=data.players.find(p=>p.n==='Position 4').id,st=data.players.find(p=>p.n==='Position 6').id;
        assert.equal(data.instruction,note);assert.ok(data.players.find(p=>p.id===st).allowedRoles.includes('TVtt'));
        const base=data.candidates.find(c=>['A','B'].some(side=>c.teams[side].starters[4]===cm&&c.teams[side].starters[6]===st));assert.ok(base);
        const out={title:'Explicit position Note fixture',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Fake content.'})),candidateId:base.id,flipTeams:false,swaps:[]};
        await route.fulfill({headers:{...cors,'Content-Type':'application/json'},body:JSON.stringify({model:'fake/position',choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]})});
      });
      await page.goto(config.origin);await page.getByRole('button',{name:'Tạo đội',exact:true}).click();await page.locator('#createNextStep').click();await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();await page.locator('#aiInstruction').fill(note);
      await page.evaluate(()=>{window.qaWorkerNotes=[];const solve=createSolveInWorker;createSolveInWorker=(players,instruction='',...rest)=>{window.qaWorkerNotes.push(instruction);return solve(players,instruction,...rest);};});
      const before=calls,stored=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()}));
      await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
      assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng AI/);assert.equal(calls,before+1);
      assert.equal(await page.evaluate(()=>AI_STATE.output.plan.applied),0);
      const withNote=await page.evaluate(()=>{const r=cstate.results[0];return {players:cstate.subset,teams:{A:r.evA,B:r.evB}};});
      assert.doesNotThrow(()=>C.lineup(withNote.players,withNote.teams,{instruction:note}));
      assert.deepEqual(await page.evaluate(()=>window.qaWorkerNotes),[note]);await page.locator('#createProcessClose').click();
      failProvider=true;await page.locator('#createRulesStepBtn').click();await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
      assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng Thuật toán/);assert.equal(calls,before+2);
      assert.deepEqual(await page.evaluate(()=>window.qaWorkerNotes),[note,note],'Fallback reuses validated candidates with the same Note-authorized roles');
      const fallback=await page.evaluate(()=>{const r=cstate.results[cstate.idx];return {players:cstate.subset,teams:{A:r.evA,B:r.evB}};});
      assert.doesNotThrow(()=>C.lineup(fallback.players,fallback.teams,{instruction:note}));assert.match(await page.locator('#createNoteStatus').textContent(),/Note khác cần đối chiếu/);
      assert.equal(await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()})),stored);
      await page.screenshot({path:path.join(screenshots,'fallback-'+width+'.png'),animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await ctx.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({ok:true,calls,screenshots,coverage:'explicit Note role exception, both positions validated, fallback uses same validated candidates, no retries/data changes, desktop/mobile'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
