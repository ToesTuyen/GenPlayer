'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../src/web_template.html'),'utf8');
function fixture(){
  const names=['Quyền','Tuyên','Hưng'],members=names.map((n,i)=>({n,pos:'HV',pos2:['TV'],KT:6+i,CH:6,DD:6,PN:6,TC:6,TL:6,DN:6,TD:6,OD:6,TM:0}));
  const els=new Map(),selected=new Set(['Quyền','Tuyên']);let latest=null;
  const el=id=>{if(!els.has(id))els.set(id,{value:'',innerHTML:'',classList:{add(){},remove(){}},focus(){}});return els.get(id);};
  const box={curPlayers:members.slice(),guestPlayers:[],guestSerial:0,getPlayers:()=>members.map(p=>({...p})),selectedIdx:()=>box.curPlayers.flatMap((p,i)=>selected.has(p.n)?[i]:[]),
    buildRoster:names=>{latest=names;selected.clear();for(const n of names)selected.add(n);box.curPlayers=members.concat(box.guestPlayers);},
    $:el,alert:s=>{throw new Error(s);},setTimeout:fn=>fn(),esc:s=>s,ov:()=>6,posCodeOf:()=> 'HV',POS_LABEL:{HV:'Hậu vệ'}};
  vm.createContext(box);vm.runInContext(html.slice(html.indexOf('function openGuestModal(){'),html.indexOf('function selectedIdx(){')),box);
  return {box,el,selected,getLatest:()=>latest};
}
test('guest names are automatic, optional friend labels are preserved, and rating comes from the selected player',()=>{
  const f=fixture();f.box.openGuestModal();assert.equal(f.el('gst-friend').value,'');
  f.el('gst-like').value='Tuyên';f.el('gst-friend').value='  Quyền  ';f.box.addGuest();
  assert.equal(f.box.guestPlayers[0].n,'Khách 1 (Quyền)');assert.equal(f.box.guestPlayers[0].likeOf,'Tuyên');assert.equal(f.box.guestPlayers[0].KT,7);
  assert.deepEqual([...f.getLatest()],['Quyền','Tuyên','Khách 1 (Quyền)']);assert.ok(!f.selected.has('Hưng'),'Unselected member remains unselected');
  f.el('gst-friend').value='';f.box.addGuest();assert.equal(f.box.guestPlayers[1].n,'Khách 2');
  f.el('gst-friend').value='Tuyên';f.box.addGuest();assert.equal(f.box.guestPlayers[2].n,'Khách 3 (Tuyên)');
  f.box.removeGuest(encodeURIComponent('Khách 2'));assert.ok(!f.selected.has('Hưng'));assert.ok(!f.selected.has('Khách 2'));
  f.el('gst-friend').value='';f.box.addGuest();assert.equal(f.box.guestPlayers[2].n,'Khách 4','Removing a guest must not reuse or renumber another guest');
});
test('numbered guest names stay complete on the pitch including multiword friend names',()=>{
  const box={};vm.createContext(box);vm.runInContext(html.slice(html.indexOf('function shortName(n){'),html.indexOf('function vpitch(r){')),box);
  for(const name of ['Khách 1','Khách 1 (Quyền)','Khách 2 (Nguyễn Văn Quyền)','Khách (Mạnh Tiến)'])assert.equal(box.shortName(name),name);
  assert.equal(box.shortName('Nguyễn Danh Tuyên'),'Danh Tuyên');
});
test('guest form does not ask for a guest name',()=>{
  const form=html.slice(html.indexOf('<div class="pm-overlay" id="guestModal"'),html.indexOf('</select>',html.indexOf('<div class="pm-overlay" id="guestModal"')));
  assert.match(form,/Bạn của ai \(không bắt buộc\)/);assert.match(form,/id="gst-friend"/);assert.doesNotMatch(form,/Tên người ngoài|id="gst-name"/);assert.match(form,/Đá giống ai/);
});
