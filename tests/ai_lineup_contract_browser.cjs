// 20-player regression for the rejected paid response. Fake provider/keys only.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),C=require('../src/ai_context.js');
const {getConfig,createApp}=require('../scripts/serve_web.cjs'),{assignmentsFor}=require('./lineup_fixture.cjs');
const secret='sk-or-contract-browser-fake-key',note='Giữ cân riêng công và thủ; không lấy gôn bù tuyến trên.';
const players=Array.from({length:20},(_,i)=>({n:'Contract '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const teams={A:{starters:[0,1,2,3,4,5,6],bench:[14,16,18]},B:{starters:[7,8,9,10,11,12,13],bench:[15,17,19]}};
const result=C.lineup(players,teams).result,history=Array.from({length:5},(_,i)=>({id:400+i,kickoff:Date.now()-(i+1)*86400000,n:20,subset:players,result,score:{a:3,b:2},goals:{'Contract 6':1},goalsLocked:true}));
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-ai-contract-'));
async function main(){
  const config=getConfig({}),app=createApp(config);await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  let calls=0;const errors=[],writes=[];
  try{
    for(const width of [1280,390]){
      const ctx=await browser.newContext({viewport:{width,height:1050},serviceWorkers:'block'}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await ctx.addInitScript(({players,history})=>{try{localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history',JSON.stringify(history));}catch{}},{players,history});
      await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* Firebase disabled */'}));
      await ctx.route('**/firestore.googleapis.com/**',r=>{writes.push(r.request().method());return r.abort();});
      let invalid=false,missingName='';
      await ctx.route('https://openrouter.ai/api/v1/chat/completions',async route=>{
        const req=route.request(),cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-openrouter-title','Access-Control-Allow-Methods':'POST,OPTIONS'};
        if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
        calls++;assert.equal(req.headers().authorization,'Bearer '+secret);assert.ok(!req.postData().includes(secret));
        const body=JSON.parse(req.postData()),data=JSON.parse(body.messages[1].content),schema=body.response_format.json_schema.schema;
        assert.equal(body.response_format.json_schema.strict,true);assert.equal(data.players.length,20);assert.equal(data.rules.length,12);assert.equal(data.instruction,note);assert.equal(data.previousMatches.length,3);
        assert.equal(schema.properties.teams,undefined);assert.deepEqual(schema.properties.assignments.required,data.players.map(p=>p.id));
        const members=data.players.filter(p=>!p.guest).sort((a,b)=>+a.n.split(' ')[1]- +b.n.split(' ')[1]).map(p=>p.index),guests=data.players.filter(p=>p.guest).map(p=>p.index);
        data.players.filter(p=>p.guest).forEach(p=>assert.deepEqual(schema.properties.assignments.properties[p.id].enum,['A_BENCH','B_BENCH']));
        const t={A:{starters:members.slice(0,7),bench:guests.filter((_,i)=>i%2===0)},B:{starters:members.slice(7,14),bench:guests.filter((_,i)=>i%2===1)}};
        // Deliberately reorder object keys: decoding must use IDs, not object iteration.
        const assignments=Object.fromEntries(Object.entries(assignmentsFor(t)).reverse());
        if(invalid){const id=data.players.find(p=>p.guest).id;missingName=data.players.find(p=>p.id===id).n;delete assignments[id];}
        const out={title:'Fixture đội hình 20 người',sections:[0,1,2].map(i=>({heading:'Phần '+i,body:'Nội dung kiểm thử, không phải nhận định thật.'})),assignments};
        await route.fulfill({headers:{...cors,'Content-Type':'application/json'},body:JSON.stringify({id:invalid?'gen-contract-rejected':'gen-contract-valid',model:'fake/contract',choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.003}})});
      });
      await page.goto(config.origin);await page.getByRole('button',{name:'Tạo đội',exact:true}).click();await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();await page.locator('#aiInstruction').fill(note);
      const snapshot=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()})),beforeCalls=calls;
      await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
      assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng AI/);assert.equal(calls,beforeCalls+1);
      assert.equal(await page.locator('#result .field .player').count(),14);
      const selected=await page.evaluate(()=>({count:cstate.subset.length,used:new Set([...cstate.results[0].A,...cstate.results[0].B]).size,benchA:cstate.results[0].evA.bench.length,benchB:cstate.results[0].evB.bench.length,failure:AI_STATE.lastFailure}));
      assert.deepEqual(selected,{count:20,used:20,benchA:3,benchB:3,failure:null});
      assert.equal(await page.locator('.create-rule-list li').count(),12);assert.equal(await page.locator('[data-step="partition"]').getAttribute('data-state'),'done');assert.equal(await page.locator('[data-step="balance"]').getAttribute('data-state'),'done');assert.equal(await page.locator('[data-step="note"]').getAttribute('data-state'),'warn');
      await page.locator('#createProcessClose').click();
      invalid=true;await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
      assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng Thuật toán/);assert.equal(calls,beforeCalls+2,'Malformed result cannot trigger another paid call');
      const engine=await page.locator('[data-step="engine"]').innerText();assert.match(engine,/Kết quả AI chưa hợp lệ/);assert.ok(engine.includes(missingName));assert.ok(engine.includes('gen-contract-rejected'));assert.ok(!engine.includes('AI không khả dụng'));
      const failure=await page.evaluate(()=>AI_STATE.lastFailure);assert.equal(failure.kind,'lineup');assert.equal(failure.usage.cost,0.003);assert.equal(failure.generationId,'gen-contract-rejected');assert.ok(!JSON.stringify(failure).includes(secret));assert.equal(failure.assignments,undefined);
      assert.match(await page.locator('#createNoteStatus').innerText(),/Chưa áp dụng Note/);assert.equal(await page.locator('#result .field .player').count(),14);
      await page.locator('[data-step="engine"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,'failure-'+width+'.png'),animations:'disabled'});
      assert.equal(await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()})),snapshot);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await ctx.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({ok:true,calls,screenshots,coverage:'20 required player IDs, reversed keys, 14 starters/6 bench, guest schema, all 12 criteria and Note, exact invalid-result label/name/request ID/usage, no automatic retries, desktop/mobile, no cloud writes'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
