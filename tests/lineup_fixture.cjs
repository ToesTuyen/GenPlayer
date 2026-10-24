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
module.exports={assignmentsFor};
