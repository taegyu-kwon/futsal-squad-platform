/* Manager-entered availability and specialties, independent from ability scores. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PlayerTraits=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const key='unit-fc-player-traits-v1';
 function normalize(input={}){
  const status=input.status??'active';
  if(!['active','injured'].includes(status))throw Error('선수 현황을 선택해 주세요.');
  const raw=typeof input.traits==='string'?input.traits.split(/\r?\n/):input.traits??[];
  if(!Array.isArray(raw)||raw.some(v=>typeof v!=='string'))throw Error('특기를 한 줄에 하나씩 입력해 주세요.');
  const traits=[...new Set(raw.map(v=>v.trim().replace(/\s+/g,' ')).filter(Boolean))];
  if(traits.length>8)throw Error('특기는 최대 8개까지 입력할 수 있습니다.');
  if(traits.some(v=>Array.from(v).length>24))throw Error('각 특기는 24자 이내로 입력해 주세요.');
  return {status,traits};
 }
 function read(storage,id){try{return normalize(JSON.parse(storage.getItem(key)||'{}')[id]||{});}catch{return normalize();}}
 function write(storage,id,input,canEdit){
  if(canEdit!==true)throw Error('관리자만 수정할 수 있습니다.');
  if(!/^(9|10[1-9]|110|111)$/.test(String(id)))throw Error('선수를 찾을 수 없습니다.');
  const value=normalize(input);let all={};
  try{const parsed=JSON.parse(storage.getItem(key)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))all=parsed;}catch{}
  all[id]=value;storage.setItem(key,JSON.stringify(all));return value;
 }
 return {key,normalize,read,write};
});
