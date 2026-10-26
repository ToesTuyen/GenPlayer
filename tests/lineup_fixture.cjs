'use strict';
// Test producer kept independent of the implementation's decoder.
const roles=['GK','SW','LB','RB','CM','WG','ST'];
function assignmentsFor(teams){
  const out={};
  for(const side of ['A','B']){
    teams[side].starters.forEach((i,k)=>{if(Object.hasOwn(out,'p'+i))throw new Error('Duplicate fixture player');out['p'+i]=side+'_'+roles[k];});
    teams[side].bench.forEach(i=>{if(Object.hasOwn(out,'p'+i))throw new Error('Duplicate fixture player');out['p'+i]=side+'_BENCH';});
  }
  return out;
}
function teamsForPlayers(players){
  // Independent role-aware fixture producer, including reversed player orders.
  const slots=['GK','Thòng','HV','HV','TVtt','TV','TĐ'],teams={A:{starters:[],bench:[]},B:{starters:[],bench:[]}},used=new Set();
  const indexes=()=>Array.from({length:players.length},(_,i)=>i).filter(i=>!used.has(i));
  const count=(side,fn)=>[...teams[side].starters,...teams[side].bench].filter(i=>fn(players[i])).length;
  for(const slot of slots){
    const pair=indexes().filter(i=>players[i].pos===slot).sort((a,b)=>Number(players[a].guest)-Number(players[b].guest)).slice(0,2);
    if(pair.length!==2)throw new Error('Fixture needs two primary players per slot');
    if(count('A',p=>p.guest)<count('B',p=>p.guest))pair.reverse();
    teams.A.starters.push(pair[0]);teams.B.starters.push(pair[1]);pair.forEach(i=>used.add(i));
  }
  const capacity={A:Math.ceil(players.length/2),B:Math.floor(players.length/2)};
  const remaining=indexes().sort((a,b)=>Number(players[b].pos==='TVtt'&&!players[b].guest)-Number(players[a].pos==='TVtt'&&!players[a].guest)||Number(players[b].guest)-Number(players[a].guest));
  for(const i of remaining){
    const p=players[i],sides=['A','B'].filter(s=>teams[s].starters.length+teams[s].bench.length<capacity[s]);
    sides.sort((a,b)=>p.guest?count(a,x=>x.guest)-count(b,x=>x.guest):p.pos==='TVtt'?count(a,x=>x.pos==='TVtt'&&!x.guest)-count(b,x=>x.pos==='TVtt'&&!x.guest):teams[a].bench.length-teams[b].bench.length);
    teams[sides[0]].bench.push(i);
  }
  return teams;
}
const candidatesFor=teams=>[{teams:structuredClone(teams)}];
module.exports={assignmentsFor,teamsForPlayers,candidatesFor};
