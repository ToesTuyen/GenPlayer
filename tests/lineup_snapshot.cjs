'use strict';
// Fixed, credential-free snapshot from the user's reported Chrome lineup.
// Do not read mutable live ratings to decide the regression's expected result.
const C=require('../src/ai_context.js');
const rows=[
  ['Doan Ha','TĐ',[],6,6,7,5,6,5,5,7,6,0],
  ['Duy Hùng','TV',['HV'],6,5,7,6,6,6,6,5,6,0],
  ['Hoàng Duy','HV',['TV'],6,5,5,7,8,8,8,5,6,0],
  ['Hoàng Thiên','TĐ',['GK'],7,6,8,7,7,6,6,7,7,9],
  ['Hưng','Thòng',[],7,8,4,7,5,6,6,7,6,0],
  ['Huy Hoàng','TVtt',['TV'],9,8,8,7,8,8,8,7,7,0],
  ['Mạnh Khắc','TV',['HV'],7,7,7,5,7,5,5,6,5,0],
  ['Mạnh Tiến','GK',['HV'],4,5,3,7,6,6,6,4,4,6],
  ['Nam Khắc','Thòng',['HV'],6,7,4,7,8,6,6,8,6,0],
  ['Nguyễn Danh Tuyên','HV',['TV'],7,7,4,6,7,5,5,7,6,0],
  ['Nguyễn Khắc Trọng','GK',['Thòng'],7,7,3,7,5,4,4,5,6,8],
  ['Nguyen Quy Bong','TVtt',[],9,8,7,6,7,7,7,8,7,0],
  ['Nguyễn Văn Quyền','HV',['TĐ'],6,5,6,6,5,5,5,6,6,0],
  ['Quang Minh','TV',['GK','HV'],5,5,6,6,7,7,7,6,6,6],
  ['Quý Tàu','HV',['TĐ'],5,4,3,4,4,4,4,4,4,0],
  ['Quyết Nguyễn','HV',['TĐ'],6,7,7,7,7,5,5,6,6,0],
  ['Trịnh Mạnh','Thòng',['Thòng','HV'],6,7,6,7,6,6,6,7,6,0],
  ['Văn Thanh','TVtt',['TV'],7,7,7,7,6,6,6,7,6,0],
  ['Nguyễn Việt Dũng','TV',['TĐ'],6,6,7,6,6,6,6,6,6,0],
  ['Nguyen Quoc An','TV',['HV'],6,5,7,6,6,6,6,5,6,0]
];
const snapshot=()=>rows.map(([n,pos,pos2,...values])=>({n,pos,pos2:pos2.slice(),guest:false,...Object.fromEntries(C.KEYS.map((key,k)=>[key,values[k]]))}));
const reportedTeams=()=>({A:{starters:[10,8,2,12,5,6,18],bench:[4,17,14]},B:{starters:[7,16,15,9,11,13,3],bench:[0,1,19]}});
module.exports={snapshot,reportedTeams};
