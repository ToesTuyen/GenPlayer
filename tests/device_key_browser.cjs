// Optional BYOK browser QA. Fake keys only, provider calls forbidden, Firebase blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {getConfig,createApp}=require('../server/index.cjs');
const secret='sk-or-device-browser-fake-key',storageName='gp_openrouter_device_key_v1';
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-device-key-'));
async function main(){
  let providerCalls=0;const errors=[],apiRequests=[];
  const config=getConfig({}),app=createApp(config,{fetchImpl:async()=>{providerCalls++;throw new Error('Provider must not be called by key management');}});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  async function newContext(){
    const ctx=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});
    await ctx.route('https://**',r=>r.request().url().includes('www.gstatic.com/firebasejs/')?r.fulfill({contentType:'application/javascript',body:'/* Firebase disabled for QA */'}):r.abort());
    ctx.on('page',page=>{
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(r.url().includes('/api/'))apiRequests.push({url:r.url(),headers:r.headers(),body:r.postData()||''});});
    });return ctx;
  }
  async function open(ctx){const page=await ctx.newPage();await page.goto(config.origin);await page.getByRole('button',{name:'Tạo đội',exact:true}).click();assert.equal(await page.locator('#aiCreateToggle').count(),0);assert.equal(await page.locator('#createAI').isVisible(),true);await page.waitForFunction(()=>AI_STATE.status?.keyMode==='device');return page;}
  try{
    const ctx=await newContext(),page=await open(ctx);
    assert.equal(await page.locator('#aiKey').getAttribute('type'),'password');assert.equal(await page.locator('#aiPassword,#aiLoginForm,#aiLogout').count(),0);
    const before=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()}));
    await page.locator('#aiKey').fill('not-a-key');await page.locator('#aiSaveKeyBtn').click();assert.match(await page.locator('#aiMessage').innerText(),/định dạng/);
    assert.equal(await page.evaluate(()=>AI_KEYS.has()),false);assert.equal(await page.locator('#aiKey').inputValue(),'');
    await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();
    assert.equal(await page.evaluate(name=>localStorage.getItem(name),storageName),secret);assert.equal(await page.locator('#aiKey').inputValue(),'');
    assert.equal(await page.evaluate(secret=>document.body.innerText.includes(secret),secret),false);
    assert.equal(await page.evaluate(secret=>JSON.stringify({state:STATE,ai:AI_STATE,players:getPlayers(),history:getHistory(),finance:getFinance()}).includes(secret),secret),false);
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Key settings fit at '+width);
      await page.screenshot({path:path.join(screenshots,'key-'+width+'.png'),fullPage:true,animations:'disabled'});
    }
    await page.reload();assert.equal(await page.evaluate(()=>AI_KEYS.has()),true,'Saved key survives page reload');
    await page.evaluate(()=>openAITask('lineup'));assert.equal(await page.locator('#aiKey').inputValue(),'','Reload never puts stored key into DOM input');
    const other=await newContext(),isolated=await open(other);assert.equal(await isolated.evaluate(()=>AI_KEYS.has()),false,'Other device/browser has no key');
    await isolated.locator('#aiRememberKey').uncheck();await isolated.locator('#aiKey').fill(secret);await isolated.locator('#aiSaveKeyBtn').click();
    assert.equal(await isolated.evaluate(()=>AI_KEYS.has()),true);assert.equal(await isolated.evaluate(name=>localStorage.getItem(name),storageName),null);
    await isolated.reload();assert.equal(await isolated.evaluate(()=>AI_KEYS.has()),false,'Unremembered key disappears on reload');await other.close();
    const tab=await open(ctx);assert.equal(await tab.evaluate(()=>AI_KEYS.has()),true);await tab.locator('#aiConnection summary').click();
    await tab.locator('#aiRemoveKey').click();await page.waitForFunction(()=>!AI_KEYS.has());
    assert.equal(await page.evaluate(name=>localStorage.getItem(name),storageName),null,'Deletion updates the first tab');
    await page.reload();assert.equal(await page.evaluate(()=>AI_KEYS.has()),false,'Deleted key cannot return after reload');
    const after=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()}));assert.equal(after,before,'Key operations preserve football and ledger data');
    await tab.close();await ctx.close();
    const blocked=await newContext();await blocked.addInitScript(name=>{
      const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===name)throw new DOMException('Blocked','SecurityError');return original.call(this,k,v);};
    },storageName);
    const fail=await open(blocked);await fail.locator('#aiKey').fill(secret);await fail.locator('#aiSaveKeyBtn').click();
    assert.equal(await fail.evaluate(()=>AI_KEYS.has()),false);assert.match(await fail.locator('#aiMessage').innerText(),/chưa thay key/);assert.equal(await fail.locator('#aiKey').inputValue(),'');await blocked.close();
    // Simulate an HTTP LAN host with Chromium's loopback DNS mapping; no external connection.
    const unsafe=await newContext();await unsafe.route('http://genplayer-lan.test/**',async route=>{
      const local=config.origin+new URL(route.request().url()).pathname;
      const response=await route.fetch({url:local});await route.fulfill({response});
    });
    const lan=await unsafe.newPage();await lan.goto('http://genplayer-lan.test');await lan.evaluate(()=>openAITask('lineup'));
    assert.equal(await lan.locator('#aiKey').isDisabled(),true);assert.equal(await lan.locator('#aiSaveKeyBtn').isDisabled(),true);
    assert.match(await lan.locator('#aiServerStatus').innerText(),/HTTP/);await unsafe.close();
    assert.equal(providerCalls,0,'Saving, reloading and deleting keys never calls the provider');
    assert.ok(apiRequests.every(r=>!r.headers.authorization&&!r.body.includes(secret)),'Status/key management cannot transmit a key');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,screenshots,coverage:'masked input, persist/reload, device isolation, ephemeral mode, multi-tab delete, blocked storage, unsafe HTTP blocked, zero paid calls or cloud writes, unchanged data'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
