// Optional theme QA: Playwright + Chrome. All data is a local fixture; Firebase is blocked.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createApp,getConfig}=require('../server/index.cjs'),C=require('../src/ai_context.js');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/const DEFAULT_PLAYERS = (.*?);\s*\n/)[1]);
const players=seed.map(C.player),rest=players.map((_,i)=>i).slice(14),teams={A:{starters:[0,1,2,3,4,5,6],bench:rest.filter((_,i)=>i%2===0)},B:{starters:[7,8,9,10,11,12,13],bench:rest.filter((_,i)=>i%2===1)}};
const result=C.lineup(players,teams).result;
const history=Array.from({length:4},(_,i)=>({id:200+i,kickoff:Date.now()+(i===0?86400000:-(i*7*86400000)),n:players.length,subset:players,result,...(i===0?{}:{score:{a:3,b:2},goals:{[players[5].n]:2},goalsLocked:true})}));
const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'genplayer-calm-theme-'));
async function main(){
  const config=getConfig({}),app=createApp(config);await new Promise(r=>app.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+app.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    for(const mobile of [false,true]){
      const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},timezoneId:'Asia/Ho_Chi_Minh',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[],network=[];
      page.on('pageerror',e=>errors.push(e.message));
      await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:'/* disabled */'}));
      await ctx.route('**/firestore.googleapis.com/**',r=>{network.push(r.request().method());return r.abort();});
      await ctx.addInitScript(({players,history})=>{localStorage.setItem('gp_web_preview_players',JSON.stringify(players));localStorage.setItem('gp_web_preview_history',JSON.stringify(history));localStorage.setItem('gp_web_preview_finance',JSON.stringify([{id:'hidden-ledger-fixture',amount:100000}]));},{players,history});
      await page.goto(config.origin);
      assert.equal(await page.evaluate(()=>currentTheme()),'light','First visit defaults to calm light theme');
      const original=await page.evaluate(()=>JSON.stringify(getHistory()));
      const originalFinance=await page.evaluate(()=>JSON.stringify(getFinance()));
      assert.equal(await page.locator('#financeNavBtn').isVisible(),false,'Finance navigation stays hidden');
      await page.evaluate(()=>show('screen-finance'));
      assert.equal(await page.locator('#screen-finance').isVisible(),false,'Stale navigation cannot reopen hidden finance screen');
      assert.equal(await page.locator('#home').isVisible(),true);
      for(const width of [320,390,768,900,1440]){
        await page.setViewportSize({width,height:1100});
        const menu=await page.evaluate(()=>{
          const buttons=[...document.querySelectorAll('.ap-grid .ap-btn')].filter(b=>b.getClientRects().length),labels=buttons.map(b=>b.lastElementChild);
          return {count:buttons.length,rows:new Set(buttons.map(b=>Math.round(b.getBoundingClientRect().top))).size,labelsFit:labels.every(el=>el.scrollWidth<=el.clientWidth+1&&el.clientHeight<=parseFloat(getComputedStyle(el).lineHeight)+1),heights:buttons.map(b=>b.getBoundingClientRect().height),overflow:document.documentElement.scrollWidth>innerWidth+1};
        });
        assert.equal(menu.count,5);assert.equal(menu.rows,2,'Menu uses only two rows at '+width);assert.equal(menu.labelsFit,true,'Menu labels fit one line at '+width);assert.ok(menu.heights.every(h=>h>=44&&h<=70),'Compact but tappable menu items at '+width);assert.equal(menu.overflow,false);
      }
      await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1100});
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>{if(currentTheme()!==theme)toggleTheme();show('home');},theme);
        const density=await page.evaluate(()=>({menuPadding:parseFloat(getComputedStyle(document.querySelector('.action-panel')).paddingTop),historyPadding:[...document.querySelectorAll('#matchList .mc-main')].map(x=>parseFloat(getComputedStyle(x).paddingBottom)),historyHeights:[...document.querySelectorAll('#matchList .mc')].map(x=>x.getBoundingClientRect().height)}));
        assert.ok(density.menuPadding<=12);assert.ok(density.historyPadding.every(v=>v===0),'No phantom action space on dashboard history');assert.ok(density.historyHeights.every(v=>v<=115),'Dashboard match cards are compact');
        await page.screenshot({path:path.join(screenshots,`${mobile?'mobile':'desktop'}-${theme}-home.png`),fullPage:true,animations:'disabled'});
        for(const id of ['home','screen-create','screen-players','screen-rank','screen-week','screen-player-status','screen-history']){
          await page.evaluate(id=>show(id),id);
          const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,body:getComputedStyle(document.body).backgroundImage,header:getComputedStyle(document.querySelector('.appbar')).backgroundImage}));
          assert.equal(state.overflow,false,`${id}/${theme} no horizontal overflow`);assert.equal(state.body,'none');assert.equal(state.header,'none');
        }
        await page.evaluate(()=>openAITask('lineup'));
        await page.locator('#createCriteria').evaluate(el=>el.open=true);
        assert.equal(await page.locator('#aiInstruction').isVisible(),true);
        assert.equal(await page.locator('.create-rule-list li').count(),12);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Expanded criteria fit both themes and mobile');
        await page.screenshot({path:path.join(screenshots,`${mobile?'mobile':'desktop'}-${theme}-criteria-note.png`),fullPage:true,animations:'disabled'});
        await page.locator('#createCriteria').evaluate(el=>el.open=false);
        assert.equal(await page.locator('#createAI').isVisible(),true);assert.equal(await page.locator('#screen-create').isVisible(),true);
        assert.equal(await page.locator('#createAI').evaluate(el=>el.closest('.screen').id),'screen-create');
        await page.screenshot({path:path.join(screenshots,`${mobile?'mobile':'desktop'}-${theme}-ai.png`),fullPage:true,animations:'disabled'});
        await page.evaluate(()=>{isAdmin=true;canEdit=true;role='admin';sessionName='QA';show('screen-history');});
        const actions=await page.evaluate(()=>[...document.querySelectorAll('#history-list .mc-item-actions')].map(bar=>{
          const b=bar.getBoundingClientRect(),m=bar.closest('.mc-main').getBoundingClientRect();
          return {position:getComputedStyle(bar).position,inside:b.top>=m.top&&b.bottom<=m.bottom+1,buttons:[...bar.querySelectorAll('button')].map(x=>({touchButton:x.classList.contains('btn'),height:x.getBoundingClientRect().height,left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right})),left:m.left,right:m.right};
        }));
        assert.ok(actions.length>0);for(const row of actions){assert.equal(row.position,'static');assert.ok(row.inside,'History actions stay in normal flow');assert.ok(row.buttons.every(b=>b.left>=row.left-1&&b.right<=row.right+1));if(mobile)assert.ok(row.buttons.filter(b=>b.touchButton).every(b=>b.height>=43.99));}
        await page.screenshot({path:path.join(screenshots,`${mobile?'mobile':'desktop'}-${theme}-history-admin.png`),fullPage:true,animations:'disabled'});
        await page.locator('#history-list .score-action').first().click();assert.equal(await page.locator('#scoreModal').isVisible(),true);await page.evaluate(()=>closeScoreModal());
        await page.evaluate(()=>{isAdmin=false;canEdit=false;role='guest';sessionName='';});
        await page.evaluate(()=>{show('screen-players');openPlayer(0);});
        await page.screenshot({path:path.join(screenshots,`${mobile?'mobile':'desktop'}-${theme}-profile.png`),animations:'disabled'});
        const profile=await page.evaluate(()=>({background:getComputedStyle(document.querySelector('.pm-panel')).backgroundImage,rating:getComputedStyle(document.querySelector('.pm-attr .val')).color}));assert.equal(profile.background,'none');assert.notEqual(profile.rating,'rgb(232, 236, 246)','Profile scores cannot retain unreadable dark-only text');
        await page.evaluate(()=>{document.querySelector('#playerModal').classList.remove('on');openAdminModal();});
        await page.screenshot({path:path.join(screenshots,`${mobile?'mobile':'desktop'}-${theme}-login.png`),animations:'disabled'});
        const login=await page.evaluate(()=>({panel:getComputedStyle(document.querySelector('#adminModal .modal-box')).backgroundImage,button:getComputedStyle(document.querySelector('.admin-login-submit')).backgroundImage}));assert.equal(login.panel,'none');assert.equal(login.button,'none');
        await page.evaluate(()=>{closeAdminModal();show('screen-create');});
        const contrast=await page.evaluate(()=>{
          const s=getComputedStyle(document.querySelector('#go')),linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;},luminance=css=>{const n=css.match(/[\d.]+/g).slice(0,3).map(Number).map(linear);return n[0]*.2126+n[1]*.7152+n[2]*.0722;};
          const a=luminance(s.color),b=luminance(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        });assert.ok(contrast>=4.5,'Primary button text contrast >=4.5: '+contrast);
        await page.reload();assert.equal(await page.evaluate(()=>currentTheme()),theme,'Remember explicit theme preference');
      }
      assert.equal(await page.evaluate(()=>JSON.stringify(getHistory())),original);assert.equal(await page.evaluate(()=>JSON.stringify(getFinance())),originalFinance,'Hiding finance must preserve its data');assert.deepEqual(network,[]);assert.deepEqual(errors,[]);await ctx.close();
    }
    console.log(JSON.stringify({ok:true,screenshots,coverage:'7 screens + inline AI/login/profile, finance hidden with preserved data, desktop/mobile, light/dark, button contrast, saved preference, unchanged data'}));
  }finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
