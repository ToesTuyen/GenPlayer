// Optional BYOK browser QA. Fake keys only, provider calls forbidden, Firebase blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {getConfig,createApp}=require('../scripts/serve_web.cjs');
const C=require('../src/ai_context.js');
const secret='sk-or-device-browser-fake-key',storageName='gp_openrouter_device_key_v1';
const players=Array.from({length:16},(_,i)=>({n:'QA cầu thủ '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-device-key-'));
async function main(){
  let providerCalls=0;const errors=[],apiRequests=[];
  const config=getConfig({}),app=createApp(config);
  await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  async function newContext(){
    const ctx=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});
    await ctx.addInitScript(players=>{try{localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history','[]');}catch{/* Initial about:blank can have an opaque origin. */}},players);
    await ctx.route(/^https:\/\//,r=>r.request().url().includes('www.gstatic.com/firebasejs/')?r.fulfill({contentType:'application/javascript',body:'/* Firebase disabled for QA */'}):r.abort());
    await ctx.route('https://openrouter.ai/api/v1/chat/completions',r=>{providerCalls++;return r.abort();});
    ctx.on('page',page=>{
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(r.url().includes('/api/'))apiRequests.push({url:r.url(),headers:r.headers(),body:r.postData()||''});});
    });return ctx;
  }
  async function open(ctx){const page=await ctx.newPage();await page.goto(config.origin);await page.getByRole('button',{name:'Tạo đội',exact:true}).click();assert.equal(await page.locator('#aiCreateToggle').count(),0);assert.equal(await page.locator('#createAI').isVisible(),false);await page.locator('#createNextStep').click();assert.equal(await page.locator('#createAI').isVisible(),true);await page.waitForFunction(()=>AI_STATE.status?.keyMode==='device');return page;}
  try{
    const ctx=await newContext(),page=await open(ctx);
    assert.equal(await page.locator('#aiKeyDialog').isVisible(),true,'No key prompts on entry');
    assert.equal(await page.locator('#aiKey').getAttribute('type'),'password');assert.equal(await page.locator('#aiPassword,#aiLoginForm,#aiLogout').count(),0);
    const before=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()}));
    const selected=await page.evaluate(()=>JSON.stringify(selectedIdx()));
    await page.locator('#aiKey').fill('not-a-key');await page.locator('#aiSaveKeyBtn').click();assert.match(await page.locator('#aiKeyMessage').innerText(),/định dạng/);
    assert.equal(await page.evaluate(()=>AI_KEYS.has()),false);assert.equal(await page.locator('#aiKey').inputValue(),'');
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:844});
      const bounds=await page.locator('#aiKeyDialog').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:el.scrollWidth>el.clientWidth+1};});
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width&&bounds.top>=0&&bounds.bottom<=bounds.height);assert.equal(bounds.overflow,false,'Key popup fits at '+width);
      await page.screenshot({path:path.join(screenshots,'key-'+width+'.png'),animations:'disabled'});
    }
    await page.locator('#aiKey').fill('unsaved-value');await page.locator('#aiKeySkip').click();
    assert.equal(await page.locator('#aiKeyDialog').isVisible(),false);assert.equal(await page.locator('#aiKey').inputValue(),'');assert.equal(await page.evaluate(()=>JSON.stringify(selectedIdx())),selected,'Skip preserves the roster');
    assert.equal(await page.evaluate(name=>localStorage.getItem(name),storageName),null);assert.equal(providerCalls,0);
    const rosterSnapshot=await page.evaluate(()=>{const c=aiContextSnapshot('lineup');return {selected:c.rosterNames,players:c.players.map(p=>p.n)};});
    assert.ok(rosterSnapshot.selected.length<=24&&new Set(rosterSnapshot.selected).size===rosterSnapshot.selected.length&&rosterSnapshot.selected.every(n=>rosterSnapshot.players.includes(n)),JSON.stringify(rosterSnapshot));
    assert.equal(await page.evaluate(()=>{try{GPAIContext.normalize(aiContextSnapshot('lineup'));return '';}catch(e){return e.stack;}}),'');
    assert.equal(await page.evaluate(()=>STATE.cloud),false,'Firebase is disabled; fixtures cannot be replaced by live snapshots');
    await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
    assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng Thuật toán/);assert.equal(await page.locator('#result .field .player').count(),14);assert.equal(await page.locator('#aiKeyDialog').isVisible(),false,'Create never re-prompts after skip');
    assert.equal(providerCalls,0,'Skip really uses the offline solver');await page.locator('#createProcessClose').click();
    await page.locator('#aiKeySettings').click();await page.locator('#aiKey').fill('unsaved-value');await page.keyboard.press('Escape');
    assert.equal(await page.locator('#aiKeyDialog').isVisible(),false);assert.equal(await page.locator('#aiKey').inputValue(),'');
    await page.evaluate(()=>{show('home');show('screen-create');});assert.equal(await page.locator('#aiKeyDialog').isVisible(),false);await page.locator('#createNextStep').click();assert.equal(await page.locator('#aiKeyDialog').isVisible(),true,'A later criteria step with no key prompts again');
    await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();
    assert.equal(await page.locator('#aiKeyDialog').isVisible(),false,'Save closes the popup without generating');
    assert.equal(await page.evaluate(name=>localStorage.getItem(name),storageName),secret);assert.equal(await page.locator('#aiKey').inputValue(),'');
    assert.equal(await page.evaluate(secret=>document.body.innerText.includes(secret),secret),false);
    assert.equal(await page.evaluate(secret=>JSON.stringify({state:STATE,ai:AI_STATE,players:getPlayers(),history:getHistory(),finance:getFinance()}).includes(secret),secret),false);
    await page.reload();assert.equal(await page.evaluate(()=>AI_KEYS.has()),true,'Saved key survives page reload');
    await page.evaluate(()=>openAITask('lineup'));assert.equal(await page.locator('#aiKeyDialog').isVisible(),false,'An existing key suppresses the popup');assert.equal(await page.locator('#aiKey').inputValue(),'','Reload never puts stored key into DOM input');
    const other=await newContext(),isolated=await open(other);assert.equal(await isolated.evaluate(()=>AI_KEYS.has()),false,'Other device/browser has no key');
    await isolated.locator('#aiRememberKey').uncheck();await isolated.locator('#aiKey').fill(secret);await isolated.locator('#aiSaveKeyBtn').click();
    assert.equal(await isolated.evaluate(()=>AI_KEYS.has()),true);assert.equal(await isolated.evaluate(name=>localStorage.getItem(name),storageName),null);
    await isolated.reload();assert.equal(await isolated.evaluate(()=>AI_KEYS.has()),false,'Unremembered key disappears on reload');await other.close();
    const tab=await open(ctx);assert.equal(await tab.evaluate(()=>AI_KEYS.has()),true);assert.equal(await tab.locator('#aiKeyDialog').isVisible(),false);await tab.locator('#aiKeySettings').click();
    await tab.locator('#aiRemoveKey').click();await page.waitForFunction(()=>!AI_KEYS.has());
    assert.equal(await page.evaluate(name=>localStorage.getItem(name),storageName),null,'Deletion updates the first tab');
    assert.equal(await page.locator('#aiKeyDialog').isVisible(),false,'A storage event cannot interrupt an open roster');
    await page.reload();assert.equal(await page.evaluate(()=>AI_KEYS.has()),false,'Deleted key cannot return after reload');
    const after=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()}));assert.equal(after,before,'Key operations preserve football and ledger data');
    await tab.close();await ctx.close();
    const blocked=await newContext();await blocked.addInitScript(name=>{
      const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===name)throw new DOMException('Blocked','SecurityError');return original.call(this,k,v);};
    },storageName);
    const fail=await open(blocked);await fail.locator('#aiKey').fill(secret);await fail.locator('#aiSaveKeyBtn').click();
    assert.equal(await fail.evaluate(()=>AI_KEYS.has()),false);assert.match(await fail.locator('#aiKeyMessage').innerText(),/chưa thay key/);assert.equal(await fail.locator('#aiKey').inputValue(),'');assert.equal(await fail.locator('#aiKeyDialog').isVisible(),true);await fail.locator('#aiKeySkip').click();await blocked.close();
    // Simulate an HTTP LAN host with Chromium's loopback DNS mapping; no external connection.
    const unsafe=await newContext();await unsafe.route('http://genplayer-lan.test/**',async route=>{
      const local=config.origin+new URL(route.request().url()).pathname;
      const response=await route.fetch({url:local});await route.fulfill({response});
    });
    const lan=await unsafe.newPage();await lan.goto('http://genplayer-lan.test');await lan.evaluate(()=>openAITask('lineup'));
    assert.equal(await lan.locator('#aiKey').isDisabled(),false);assert.equal(await lan.locator('#aiSaveKeyBtn').isDisabled(),false);
    assert.match(await lan.locator('#aiServerStatus').innerText(),/HTTP/);await lan.locator('#aiKey').fill(secret);await lan.locator('#aiSaveKeyBtn').click();assert.equal(await lan.locator('#aiKeyDialog').isVisible(),false,'LAN HTTP allows local entry/save without contacting a backend');assert.equal(await lan.evaluate(()=>AI_KEYS.has()),true);await unsafe.close();
    assert.equal(providerCalls,0,'Saving, reloading and deleting keys never calls the provider');
    assert.ok(apiRequests.every(r=>!r.headers.authorization&&!r.body.includes(secret)),'Status/key management cannot transmit a key');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,screenshots,coverage:'auto popup only without key, skip/Escape, real offline fallback, save closes popup, manual management, masked input, persist/reload, device isolation, ephemeral mode, multi-tab delete, blocked storage, LAN HTTP entry/save, zero paid calls or app API/cloud writes, unchanged data'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
