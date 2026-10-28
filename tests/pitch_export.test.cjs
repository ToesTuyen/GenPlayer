'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8');
function setup(){
  const start=source.indexOf('const PITCH_DATA='),end=source.indexOf('// ============ TAO DOI ============',start);
  const make=()=>({hidden:false,disabled:false,textContent:'',style:{},attrs:{},removeAttribute(k){delete this[k];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this[k]=fn;}});
  const ids=['pitchViewDialog','pitchExportDialog','pitchExportButton','pitchExportStatus','pitchExportPreview','pitchDownload','pitchShareButton','pitchExportMessage','pitchViewCanvas'];
  const els=Object.fromEntries(ids.map(id=>[id,make()]));
  els.pitchExportDialog.showModal=function(){this.open=true;};els.pitchExportDialog.close=function(){this.open=false;this.closeEvent?.();};
  els.pitchViewCanvas.replaceChildren=()=>{};
  const revoked=[],shared=[],captured=[],cloned={style:{}},moved=[];
  const context={$:id=>els[id],document:{documentElement:{classList:{remove(){}}}},window:{addEventListener(){}},URL:{createObjectURL:()=> 'blob:test-image',revokeObjectURL:url=>revoked.push(url)},File:class{constructor(parts,name,opts){this.parts=parts;this.name=name;this.type=opts.type;}},navigator:{canShare:()=>true,share:async data=>shared.push(data)},html2canvas:async(node,options)=>{captured.push({node,options});options.onclone({querySelector:()=>cloned,body:{appendChild:node=>moved.push(node)}});return {toBlob:cb=>cb({type:'image/png'})};}};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.pitchTest={PITCH_VIEW,PITCH_EXPORT,pitchExport,pitchShareImage,pitchExportCleanup};',context);
  return {context,els,revoked,shared,captured,cloned,moved};
}
test('exports current orientation at full resolution, with share and cleanup',async()=>{
  const t=setup(),p=t.context.pitchTest,node={};Object.assign(p.PITCH_VIEW,{node,width:832,height:460,orientation:'horizontal'});
  await p.pitchExport();assert.equal(t.captured[0].node,node);assert.equal(t.captured[0].options.scale,2);assert.equal(t.captured[0].options.width,832);assert.equal(t.cloned.style.transform,'none');assert.equal(t.cloned.style.height,'460px');assert.equal(t.moved[0],t.cloned);
  assert.equal(t.els.pitchDownload.href,'blob:test-image');assert.equal(t.els.pitchDownload.download,'doi-hinh-ngang.png');assert.equal(t.els.pitchExportPreview.src,'blob:test-image');assert.equal(t.els.pitchExportDialog.open,true);assert.equal(t.els.pitchShareButton.hidden,false);
  await p.pitchShareImage();assert.equal(t.shared[0].files[0].name,'doi-hinh-ngang.png');p.pitchExportCleanup();assert.deepEqual(t.revoked,['blob:test-image']);assert.equal(p.PITCH_EXPORT.file,null);
  Object.assign(p.PITCH_VIEW,{node,width:440,height:600,orientation:'vertical'});await p.pitchExport();assert.equal(t.els.pitchDownload.download,'doi-hinh-doc.png');assert.equal(t.captured[1].options.width,440);
});
test('reports an export error without changing the lineup',async()=>{
  const t=setup(),p=t.context.pitchTest,node={};Object.assign(p.PITCH_VIEW,{node,width:832,height:460});t.context.html2canvas=async()=>{throw new Error('Thử lại');};await p.pitchExport();assert.equal(t.els.pitchExportStatus.textContent,'Thử lại');assert.equal(t.els.pitchExportStatus.hidden,false);assert.equal(p.PITCH_VIEW.node,node);assert.equal(t.els.pitchExportButton.disabled,false);
});
