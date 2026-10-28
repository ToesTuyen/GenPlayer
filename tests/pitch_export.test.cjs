'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8');
function setup(mobile=false){
  const start=source.indexOf('const PITCH_DATA='),end=source.indexOf('// ============ TAO DOI ============',start);
  const els={pitchExportButton:{disabled:false,textContent:''},pitchExportStatus:{hidden:false,textContent:''}},shared=[],drawn=[],textOps=[],colors=[],heatNames=[],canvases=[],downloads=[];
  const ctx={measureText:s=>({width:String(s).length*7}),fillText:(s,x,y)=>{drawn.push(s);textOps.push({s,x,y});}};
  for(const fn of ['scale','fillRect','beginPath','moveTo','lineTo','arc','rect','stroke','save','translate','quadraticCurveTo','closePath','fill','restore'])ctx[fn]=()=>{};
  ctx.fill=()=>colors.push(ctx.fillStyle);
  const document={documentElement:{dataset:{theme:'light'},classList:{remove(){}}},body:{appendChild(){}},createElement:tag=>{if(tag==='a')return {style:{},click(){downloads.push({href:this.href,name:this.download});},remove(){}};const canvas={getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,UE5H'};canvases.push(canvas);return canvas;}};
  const context={$:id=>els[id],document,window:{addEventListener(){}},atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,File:class{constructor(parts,name,opts){this.parts=parts;this.name=name;this.type=opts.type;}},navigator:{userAgent:mobile?'iPhone':'Desktop',canShare:()=>true,share:async data=>shared.push(data)},KIT_A:{body:'#b21',sleeve:'#a10',trim:'#fff'},KIT_B:{body:'#fb0',sleeve:'#123',trim:'#123'},ov:()=>6,shortName:n=>n,playerStats:name=>{heatNames.push(name);return {form:['W','W']};},playerAbsentStreak:()=>0,heatTier:()=>({k:'fire'}),matchLineupRating:()=>6,lineupSlots:ev=>ev.starters.length===6?['GK','Thòng','HV','HV','TV','TĐ']:['GK','Thòng','HV','HV','TVtt','TV','TĐ'],POSNAME:{GK:'Thủ môn',HV:'Hậu vệ'}};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.pitchTest={PITCH_VIEW,PITCH_EXPORT,pitchExport};',context);
  const sel=Array.from({length:16},(_,i)=>({n:'Player '+i})),res={evA:{starters:[0,1,2,3,4,5,6],bench:[14]},evB:{starters:[7,8,9,10,11,12,13],bench:[15]}};
  return {context,els,shared,drawn,textOps,colors,heatNames,canvases,downloads,data:{sel,res}};
}
test('downloads the complete opaque PNG directly without a preview',async()=>{
  const t=setup(),p=t.context.pitchTest,node={};Object.assign(p.PITCH_VIEW,{node,data:t.data,orientation:'horizontal'});
  await p.pitchExport();assert.equal(t.canvases[0].width,1920);assert.ok(t.canvases[0].height>960);assert.equal(t.downloads[0].name,'doi-hinh-ngang.png');assert.match(t.downloads[0].href,/^data:image\/png;base64,/);assert.equal(t.shared.length,0);
  for(let i=0;i<16;i++)assert.ok(t.drawn.some(s=>s.includes('Player '+i)),`Missing player ${i}`);
  Object.assign(p.PITCH_VIEW,{node,data:t.data,orientation:'vertical'});await p.pitchExport();assert.equal(t.downloads[1].name,'doi-hinh-doc.png');assert.equal(t.canvases[1].width,1200);assert.ok(t.canvases[1].height>1400);
  assert.doesNotMatch(source,/id="pitchExportDialog"/);
});
test('opens the native share sheet on iPhone with the PNG immediately',async()=>{
  const t=setup(true),p=t.context.pitchTest;Object.assign(p.PITCH_VIEW,{node:{},data:t.data,orientation:'horizontal'});const pending=p.pitchExport();assert.equal(t.shared.length,1,'share must start in the click activation before awaiting');await pending;assert.equal(t.shared[0].files[0].name,'doi-hinh-ngang.png');assert.equal(t.downloads.length,0);
});
test('falls back to download if sharing files is unsupported',async()=>{
  const t=setup(true),p=t.context.pitchTest;t.context.navigator.canShare=()=>false;Object.assign(p.PITCH_VIEW,{node:{},data:t.data,orientation:'vertical'});await p.pitchExport();assert.equal(t.downloads[0].name,'doi-hinh-doc.png');assert.equal(t.shared.length,0);
});
test('vertical PNG puts each substitute on a separate line and draws form indicators',async()=>{
  const t=setup(),p=t.context.pitchTest;for(let i=16;i<22;i++)t.data.sel.push({n:'Player '+i});t.data.res.evA.bench=[14,16,18,20];t.data.res.evB.bench=[15,17,19,21];t.data.showHeat=true;Object.assign(p.PITCH_VIEW,{node:{},data:t.data,orientation:'vertical'});
  await p.pitchExport();assert.equal(t.heatNames.length,14);assert.ok(t.colors.includes('#de3c0b'));assert.ok(t.colors.includes('#ffe35a'));
  const a=[14,16,18,20].map(i=>t.textOps.find(item=>item.s==='Player '+i+' 6.0'));const b=[15,17,19,21].map(i=>t.textOps.find(item=>item.s==='Player '+i+' 6.0'));assert.ok(a.every(Boolean)&&b.every(Boolean));assert.equal(new Set(a.map(item=>item.y)).size,4);assert.equal(new Set(b.map(item=>item.y)).size,4);assert.ok(t.canvases[0].height>1600,'Canvas expands to include all bench rows');
});
test('completed-match PNG does not invent current-form flames',async()=>{
  const t=setup(),p=t.context.pitchTest;t.data.showHeat=false;Object.assign(p.PITCH_VIEW,{node:{},data:t.data,orientation:'vertical'});await p.pitchExport();assert.equal(t.heatNames.length,0);
});
test('reports an export error without changing the lineup',async()=>{
  const t=setup(),p=t.context.pitchTest,node={};Object.assign(p.PITCH_VIEW,{node,data:t.data});t.context.document.createElement=()=>({getContext:()=>null});await p.pitchExport();assert.match(t.els.pitchExportStatus.textContent,/không hỗ trợ/);assert.equal(t.els.pitchExportStatus.hidden,false);assert.equal(p.PITCH_VIEW.node,node);assert.equal(t.els.pitchExportButton.disabled,false);
});
