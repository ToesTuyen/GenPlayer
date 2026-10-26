// Mandatory quality end-to-end: fake key/provider, no paid calls or cloud writes.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),C=require('../src/ai_context.js');
const {getConfig,createApp}=require('../scripts/serve_web.cjs');
const secret='sk-or-quality-browser-fake-key',screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-mandatory-quality-'));
const players=Array.from({length:16},(_,i)=>({n:'Quality browser '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
for(const k of C.KEYS){players[5][k]=5;players[6][k]=7;}
async function main(){
  const config=getConfig({}),app=createApp(config);await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const errors=[],writes=[];let calls=0;
  try{
    for(const width of [1280,390]){
      const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await ctx.newPage();
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await ctx.addInitScript(players=>{try{localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history','[]');}catch{}},players);
      await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* Firebase disabled */'}));
      await ctx.route('**/firestore.googleapis.com/**',r=>{writes.push(r.request().method());return r.abort();});
      await ctx.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
        const req=route.request(),cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-openrouter-title','Access-Control-Allow-Methods':'POST,OPTIONS'};
        if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
        calls++;assert.equal(req.headers().authorization,'Bearer '+secret);
        const data=JSON.parse(JSON.parse(req.postData()).messages[1].content),base=data.candidates[0];
        const t=Object.fromEntries(['A','B'].map(side=>[side,{starters:base.teams[side].starters.map(id=>data.players.findIndex(p=>p.id===id)),bench:base.teams[side].bench.map(id=>data.players.findIndex(p=>p.id===id))}]));
        assert.doesNotThrow(()=>C.lineup(data.players,t));
        let bad;
        for(let a=0;a<7&&!bad;a++)for(let b=0;b<7&&!bad;b++){
          const next=structuredClone(t),i=next.A.starters[a],j=next.B.starters[b];next.A.starters[a]=j;next.B.starters[b]=i;
          try{C.lineup(data.players,next);}catch(e){if(/vượt ngưỡng bắt buộc/.test(e.message))bad={first:data.players[i].id,second:data.players[j].id};}
        }
        assert.ok(bad,'Provider fixture must break balance: '+JSON.stringify(data.players.map(p=>({n:p.n,KT:p.KT,pos:p.pos}))));
        const out={title:'Fake unbalanced AI plan',sections:[0,1,2].map(i=>({heading:'Section '+i,body:'Fake content.'})),candidateId:base.id,flipTeams:false,swaps:[bad]};
        await route.fulfill({headers:{...cors,'Content-Type':'application/json'},body:JSON.stringify({id:'gen-quality-fixture',model:'fake/quality',choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]})});
      });
      await page.goto(config.origin);await page.getByRole('button',{name:'Tạo đội',exact:true}).click();await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();
      const before=calls;
      await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
      assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng AI/);assert.equal(calls,before+1);
      assert.equal(await page.evaluate(()=>AI_STATE.output.plan.applied),0);assert.equal(await page.evaluate(()=>AI_STATE.output.plan.skipped),1);
      assert.match(await page.locator('#result').innerText(),/Không áp dụng chuỗi đổi chỗ/);
      assert.equal(await page.locator('[data-step="balance"]').getAttribute('data-state'),'done');
      const draft=await page.evaluate(()=>{const r=cstate.results[cstate.idx];GPAIContext.lineup(cstate.subset,{A:r.evA,B:r.evB});return JSON.stringify(cstate);});
      await page.locator('#createProcessClose').click();await page.locator('#toggleRoster').click();
      // Simulate updated member ratings in memory, leaving old draft/storage alone.
      // The two registered keepers stay in goal. Three outfield 10s among
      // otherwise all-1 players cannot be distributed evenly in both lines.
      await page.evaluate(()=>{
        const members=STATE.players.filter(p=>!p.guest);
        const strong=new Set(members.filter(p=>p.pos!=='GK').slice(0,3).map(p=>p.n));
        members.forEach(p=>GPAIContext.KEYS.forEach(k=>p[k]=strong.has(p.n)?10:1));
      });
      for(const box of await page.locator('#roster .pl-item.guest input').all())await box.uncheck();
      const stored=await page.evaluate(()=>JSON.stringify({players:localStorage.getItem(LS.players),history:localStorage.getItem(LS.history)}));
      for(const engine of ['AI','algorithm']){
        if(engine==='algorithm')await page.evaluate(()=>AI_KEYS.clear());
        await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
        assert.equal(await page.evaluate(()=>CREATE_STATE.success),false,engine+' must fail without a legal base');assert.equal(calls,before+1,'No paid request without a legal base');
        assert.match(await page.locator('#createProcessSummary').innerText(),/Không tìm được đội hình đạt tiêu chí bắt buộc/);
        assert.equal(await page.evaluate(()=>JSON.stringify(cstate)),draft,'Failed creation preserves the prior draft');
        assert.equal(await page.locator('#result .field .player').count(),14);
        assert.equal(await page.evaluate(()=>JSON.stringify({players:localStorage.getItem(LS.players),history:localStorage.getItem(LS.history)})),stored);
        if(engine==='algorithm')await page.screenshot({path:path.join(screenshots,'no-valid-lineup-'+width+'.png'),animations:'disabled'});
        await page.locator('#createProcessClose').click();
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await ctx.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log(JSON.stringify({ok:true,calls,screenshots,coverage:'mandatory quality rollback, impossible roster with AI and algorithm, no paid call without valid base, old draft/storage preserved, desktop/mobile'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
