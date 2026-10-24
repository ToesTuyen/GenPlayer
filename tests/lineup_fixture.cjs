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
  const members=players.flatMap((p,i)=>p.guest?[]:[i]),guests=players.flatMap((p,i)=>p.guest?[i]:[]),size=Math.ceil(players.length/2),ga=Math.ceil(guests.length/2);
  const a=[...members.slice(0,size-ga),...guests.slice(0,ga)],b=[...members.slice(size-ga),...guests.slice(ga)];
  return {A:{starters:a.slice(0,7),bench:a.slice(7)},B:{starters:b.slice(0,7),bench:b.slice(7)}};
}
const candidatesFor=teams=>[{teams:structuredClone(teams)}];
module.exports={assignmentsFor,teamsForPlayers,candidatesFor};
