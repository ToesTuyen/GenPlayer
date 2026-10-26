// Local, bounded football diagnostics. Never read credential/app storage keys,
// send telemetry, or write Firebase. Export uses this same sanitized whitelist.
(function(root,factory){
  const api=factory(typeof module!=='undefined'&&module.exports?require('./ai_context.js'):root.GPAIContext);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GPCreationLog=api;
})(typeof window==='undefined'?globalThis:window,function(C){
  'use strict';
  const KEY='gp_create_runs_v1',MAX_RUNS=30,MAX_BYTES=1500000;
  const fields=new Set(['id','startedAt','updatedAt','endedAt','status','engine','requestedEngine','input','inputKey','events','ai','validation','fallback','output','error','appRelease','selection']);
  const privateField=/^(?:api[_-]?key|authorization|password|cookie|credentials|account|finance|accessToken|refreshToken|token)$/i;
  function redact(value){return String(value).replace(/sk-(?:or-|proj-)?[A-Za-z0-9_-]{12,}/g,'[ẩn key]').replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [ẩn]').replace(/([?&](?:key|token|api_key)=)[^&\s]+/gi,'$1[ẩn]');}
  function clean(value,depth=0,key=''){
    if(depth>12)return '[quá sâu]';
    if(typeof value==='string')return redact(value).slice(0,key==='inputKey'?50000:4000);
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(Array.isArray(value))return value.slice(0,100).map(v=>clean(v,depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!privateField.test(k)&&!['__proto__','constructor','prototype'].includes(k)).slice(0,100).map(([k,v])=>[k,clean(v,depth+1,k)]));
    return null;
  }
  function snapshot(context,now=Date.now()){
    const c=C.normalize(context),players=c.rosterNames.map(n=>c.players.find(p=>p.n===n));
    const reference=c.history.find(m=>m.kickoff>0&&m.kickoff<=now&&['A','B'].every(s=>m.teams[s].filter(p=>!p.bench).length>=6))||null;
    return clean({rosterNames:c.rosterNames,players,instruction:c.instruction,historyCount:c.history.length,history:c.history.slice(0,5),rotationReference:reference,forms:players.map(p=>({n:p.n,...C.form(p.n,c.history,now)}))});
  }
  function inputKey(input){
    const sorted=a=>a.slice().sort((a,b)=>a.n.localeCompare(b.n));
    return JSON.stringify({players:sorted(input.players),instruction:input.instruction,forms:sorted(input.forms),reference:input.rotationReference});
  }
  const safeRecord=r=>Object.fromEntries(Object.entries(r||{}).filter(([k])=>fields.has(k)).map(([k,v])=>[k,clean(v,0,k)]));
  function createStore(storage,options={}){
    let memory=[],persisted=true;
    const limit=options.limit||MAX_RUNS,bytes=options.maxBytes||MAX_BYTES,now=options.now||(()=>new Date().toISOString());
    function list(){
      let stored=[];
      try{const raw=storage?.getItem(KEY);if(raw){const data=JSON.parse(raw);if(Array.isArray(data?.runs))stored=data.runs.filter(r=>r&&typeof r.id==='string'&&typeof r.startedAt==='string'&&typeof r.updatedAt==='string').map(safeRecord);}}catch{persisted=false;}
      const records=new Map(stored.map(r=>[r.id,r]));
      for(const r of memory){const old=records.get(r.id);if(!old||r.updatedAt>=old.updatedAt)records.set(r.id,r);}
      memory=[...records.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,limit);
      return JSON.parse(JSON.stringify(memory));
    }
    function save(){
      let data=JSON.stringify({version:1,runs:memory});
      while(memory.length>1&&new TextEncoder().encode(data).length>bytes){memory.pop();data=JSON.stringify({version:1,runs:memory});}
      try{if(!storage)throw Error('no storage');storage.setItem(KEY,data);persisted=true;}catch{persisted=false;}
    }
    function patch(id,changes){
      list();const i=memory.findIndex(r=>r.id===id);if(i<0)return;
      memory[i]=safeRecord({...memory[i],...changes,id,updatedAt:now()});save();
    }
    function begin(appRelease=''){
      list();const ts=now(),id='run-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
      memory.unshift({id,startedAt:ts,updatedAt:ts,status:'running',engine:'Chuẩn bị',appRelease,events:[]});memory=memory.slice(0,limit);save();return id;
    }
    function event(id,step,state,detail){
      const r=list().find(r=>r.id===id);if(!r)return;
      patch(id,{events:[...(r.events||[]),{at:now(),step,state,detail}].slice(-80)});
    }
    function seen(key){return list().filter(r=>r.status==='success'&&r.inputKey===key&&r.output?.groupKey).map(r=>r.output.groupKey);}
    return {begin,patch,event,list,seen,persisted:()=>persisted,export:()=>JSON.stringify({version:1,exportedAt:now(),runs:list()},null,2),key:KEY};
  }
  return {KEY,MAX_RUNS,redact,clean,snapshot,inputKey,createStore};
});
