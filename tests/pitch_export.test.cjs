'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8');
function setup(){
  const start=source.indexOf('const PITCH_DATA='),end=source.indexOf('// ============ TAO DOI ============',start);
  const make=()=>({hidden:false,disabled:false,textContent:'',style:{},attrs:{},removeAttribute(k){delete this[k];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this[k]=fn;}});
  const ids=['pitchViewDialog','pitchExportDialog','pitchExportButton','pitchExportStatus','pitchExportPreview','pitchDownload','pitchShareButton','pitchExportMessage','pitchViewCanvas'];
  const els=Object.fromEntries(ids.map(id=>[id,make()]));els.pitchExportDialog.showModal=function(){this.open=true;};els.pitchViewCanvas.replaceChildren=()=>{};
  const revoked=[],shared=[],drawn=[],canvases=[];
  const ctx={measureText:s=>({width:String(s).length*7}),fillText:s=>drawn.push(s)};
  for(const fn of ['scale','fillRect','beginPath','moveTo','lineTo','arc','rect','stroke','save','translate','quadraticCurveTo','closePath','fill','restore'])ctx[fn]=()=>{};
  const document={documentElement:{dataset:{theme:'light'},classList:{remove(){}}},createElement:()=>{const canvas={getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,UE5H',toBlob:cb=>cb({type:'image/png'})};canvases.push(canvas);return canvas;}};
  const context={$:id=>els[id],document,window:{addEventListener(){}},URL:{createObjectURL:()=> 'blob:test-image',revokeObjectURL:url=>revoked.push(url)},File:class{constructor(parts,name,opts){this.parts=parts;this.name=name;this.type=opts.type;}},navigator:{canShare:()=>true,share:async data=>shared.push(data)},KIT_A:{body:'#b21',sleeve:'#a10',trim:'#fff'},KIT_B:{body:'#fb0',sleeve:'#123',trim:'#123'},ov:()=>6,shortName:n=>n,matchLineupRating:()=>6,lineupSlots:ev=>ev.starters.length===6?['GK','Thòng','HV','HV','TV','TĐ']:['GK','Thòng','HV','HV','TVtt','TV','TĐ'],POSNAME:{GK:'Thủ môn',HV:'Hậu vệ'}};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.pitchTest={PITCH_VIEW,PITCH_EXPORT,pitchExport,pitchShareImage,pitchExportCleanup};',context);
  const sel=Array.from({length:16},(_,i)=>({n:'Player '+i})),res={evA:{starters:[0,1,2,3,4,5,6],bench:[14]},evB:{starters:[7,8,9,10,11,12,13],bench:[15]}};
  return {context,els,revoked,shared,drawn,canvases,data:{sel,res}};
}
test('exports full opaque canvas and supports photos sharing for either orientation',async()=>{
  const t=setup(),p=t.context.pitchTest,node={};Object.assign(p.PITCH_VIEW,{node,data:t.data,orientation:'horizontal'});
  await p.pitchExport();assert.equal(t.canvases[0].width,1920);assert.ok(t.canvases[0].height>960);assert.equal(t.els.pitchDownload.download,'doi-hinh-ngang.png');assert.equal(t.els.pitchExportPreview.src,'data:image/png;base64,UE5H');assert.equal(t.els.pitchExportDialog.open,true);assert.equal(t.els.pitchShareButton.hidden,false);
  for(let i=0;i<16;i++)assert.ok(t.drawn.some(s=>s.includes('Player '+i)),`Missing player ${i}`);
  await p.pitchShareImage();assert.equal(t.shared[0].files[0].name,'doi-hinh-ngang.png');p.pitchExportCleanup();assert.deepEqual(t.revoked,['blob:test-image']);assert.equal(p.PITCH_EXPORT.file,null);
  Object.assign(p.PITCH_VIEW,{node,data:t.data,orientation:'vertical'});await p.pitchExport();assert.equal(t.els.pitchDownload.download,'doi-hinh-doc.png');assert.equal(t.canvases[1].width,1200);assert.ok(t.canvases[1].height>1400);
});
test('reports an export error without changing the lineup',async()=>{
  const t=setup(),p=t.context.pitchTest,node={};Object.assign(p.PITCH_VIEW,{node,data:t.data});t.context.document.createElement=()=>({getContext:()=>null});await p.pitchExport();assert.match(t.els.pitchExportStatus.textContent,/không hỗ trợ/);assert.equal(t.els.pitchExportStatus.hidden,false);assert.equal(p.PITCH_VIEW.node,node);assert.equal(t.els.pitchExportButton.disabled,false);
});
