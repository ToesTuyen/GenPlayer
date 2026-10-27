// Proves the built HTML works on a plain static host/subpath, with NO app runtime/API.
// All provider responses/keys are fake; Firebase and other external traffic are blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),C=require('../src/ai_context.js');
const root=path.resolve(__dirname,'..'),secret='sk-or-static-browser-fake-key';
const players=Array.from({length:16},(_,i)=>({n:'Static cầu thủ '+i,pos:C.SLOTS[i%7],pos2:[],guest:i>=14,...Object.fromEntries(C.KEYS.map(k=>[k,6]))}));
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-direct-static-'));
async function main(){
  const localAPI=[],errors=[];let paidCalls=0;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.includes('/api/')){localAPI.push(pathname);res.writeHead(404);return res.end();}
    const relative=pathname.replace(/^\/GenPlayer\//,''),file=relative===''||relative==='index.html'?path.join(root,'dist/index.html'):path.resolve(root,relative);
    const allowed=relative===''||relative==='index.html'||relative.startsWith('assets/')||['sw.js','manifest.webmanifest'].includes(relative);
    if(!allowed||!pathname.startsWith('/GenPlayer/')||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const scenario of [{origin:'https://genplayer-static.test',width:1280},{origin:'http://genplayer-lan.test',width:390}]){
      const ctx=await browser.newContext({viewport:{width:scenario.width,height:950},serviceWorkers:'block'}),page=await ctx.newPage(),beforeCalls=paidCalls;
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await ctx.addInitScript(players=>{try{localStorage.setItem('gp_players',JSON.stringify(players));localStorage.setItem('gp_history','[]');localStorage.setItem('gp_finance',JSON.stringify([{note:'PRIVATE_FINANCE_CANARY'}]));}catch{}},players);
      await ctx.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.origin===scenario.origin){
          if(url.pathname.includes('/api/')){localAPI.push(req.url());return route.fulfill({status:404,body:'No API exists'});}
          const response=await route.fetch({url:base+url.pathname+url.search});return route.fulfill({response});
        }
        if(req.url().startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'application/javascript',body:'/* Firebase disabled */'});
        if(req.url()==='https://openrouter.ai/api/v1/chat/completions'){
          const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-openrouter-title','Access-Control-Allow-Methods':'POST,OPTIONS'};
          if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
          paidCalls++;assert.equal(req.headers().authorization,'Bearer '+secret);assert.ok(!req.postData().includes(secret)&&!req.postData().includes('PRIVATE_FINANCE_CANARY'));
          const data=JSON.parse(JSON.parse(req.postData()).messages[1].content);assert.equal(data.players.length,16);assert.equal(data.instruction,'Cân công và thủ.');
          const output={title:'Bản nháp static',sections:[0,1,2].map(i=>({heading:'Phân tích '+i,body:'Nội dung thử, không phải nhận định thật.'})),candidateId:data.candidates[0].id,flipTeams:false,swaps:[]};
          return route.fulfill({headers:{...cors,'Content-Type':'application/json'},body:JSON.stringify({model:'fake/static',choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})});
        }
        return route.abort();
      });
      await page.goto(scenario.origin+'/GenPlayer/');assert.equal(await page.evaluate(()=>window.GP_APP_CONFIG),null,'No app runtime/backend config');assert.equal(await page.evaluate(()=>STATE.cloud),false);
      const before=await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()}));
      await page.getByRole('button',{name:'Tạo đội',exact:true}).click();assert.equal(await page.locator('#aiKeyDialog').isVisible(),false);await page.locator('#createNextStep').click();assert.equal(await page.locator('#aiKeyDialog').isVisible(),true);assert.equal(await page.locator('#aiKey').isDisabled(),false);
      await page.locator('#aiKey').fill(secret);await page.locator('#aiSaveKeyBtn').click();assert.equal(paidCalls,beforeCalls,'Saving a key is entirely local');
      await page.locator('#aiInstruction').fill('Cân công và thủ.');await page.locator('#go').click();await page.waitForFunction(()=>!CREATE_STATE.busy,{}, {timeout:30000});
      assert.equal(paidCalls,beforeCalls+1);assert.match(await page.locator('#createProcessSummary').innerText(),/Hoàn tất bằng AI/);assert.equal(await page.locator('#result .field .player').count(),14);
      await page.locator('#createProcessClose').click();await page.screenshot({path:path.join(screenshots,'direct-static-'+scenario.width+'.png'),fullPage:true,animations:'disabled'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      assert.equal(await page.evaluate(()=>JSON.stringify({players:getPlayers(),history:getHistory(),finance:getFinance()})),before,'AI generation cannot modify stored football/finance data');
      assert.equal(await page.evaluate(secret=>JSON.stringify({state:STATE,ai:AI_STATE,draft:cstate}).includes(secret),secret),false);
      await ctx.close();
    }
    assert.deepEqual(localAPI,[]);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,paidCalls,screenshots,coverage:'plain static HTML under /GenPlayer/, no runtime/API/backend, HTTPS and LAN HTTP, key input/save, direct HTTPS OpenRouter, whitelist, validated lineup, unchanged data'}));
  }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
