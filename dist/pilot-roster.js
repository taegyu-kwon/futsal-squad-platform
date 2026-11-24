/* Club roster. Detail ratings are entered by the manager; category ratings are rounded means; OVR uses position weights. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./abilities.js'):root.Abilities);if(typeof module==='object'&&module.exports)module.exports=api;else root.PilotRoster=api;})(typeof globalThis!=='undefined'?globalThis:this,function(abilities){
  const key='unit-fc-pilot-roster-v1';
  const names=Array.from({length:10},(_,i)=>`선수 ${i+1}`);
  const seeds=[...names.map((name,i)=>({id:101+i,name})),{id:111,name:'선수 11',pos:'GK'}];
  const positions={'미정':'포지션 미정',ST:'스트라이커',CF:'중앙 공격수',LW:'왼쪽 윙어',RW:'오른쪽 윙어',CAM:'공격형 미드필더',CM:'중앙 미드필더',CDM:'수비형 미드필더',LM:'왼쪽 미드필더',RM:'오른쪽 미드필더',CB:'센터백',LB:'왼쪽 풀백',RB:'오른쪽 풀백',LWB:'왼쪽 윙백',RWB:'오른쪽 윙백',GK:'골키퍼'};
  function rating(value){if(value==null||value==='')return null;if(typeof value==='boolean')throw new Error('능력치는 1~99 사이의 정수로 입력해 주세요.');const n=Number(value);if(!Number.isInteger(n)||n<1||n>99)throw new Error('능력치는 1~99 사이의 정수로 입력해 주세요.');return n;}
  function normalize(input={}){
    const pos=input.pos||'미정';if(!Object.hasOwn(positions,pos))throw new Error('포지션을 확인해 주세요.');
    const inputDetails=abilities.renameDetails(input.detail);
    const detail=Object.fromEntries([...abilities.field,...abilities.keeper].flatMap(a=>a[2]).map(label=>[label,rating(inputDetails[label])]));
    const values=Object.fromEntries([...abilities.field,...abilities.keeper].map(([code,,labels])=>[code,average(labels.map(label=>detail[label]))]));
    const legacyKeeper=Object.fromEntries(Object.entries(abilities.keeperLegacy).map(([code,label])=>[code,rating(input.legacyKeeper?.[code]??inputDetails[label])]));
    return {legacyKeeper,pos,ovr:abilities.overall(values,pos),values,detail};
  }
  function average(values){return values.length&&values.every(Number.isFinite)?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null;}

  function read(storage){try{const all=JSON.parse(storage.getItem(key)||'{}');return all&&typeof all==='object'&&!Array.isArray(all)?all:{};}catch{return {};}}
  function apply(player,record){
    const data=normalize(record),schema=abilities.schema(data);
    Object.assign(player,{pos:data.pos,role:positions[data.pos],ovr:data.ovr,stats:schema.map(([code])=>data.values[code]),manual:data});return player;
  }
  function hydrate(storage){const saved=read(storage);return seeds.map(seed=>{const p={...seed,managed:true,secondary:[],goals:0,assists:0,matchRating:'—',tone:'gold'};const defaults={pos:seed.pos||'미정'};try{return apply(p,{...defaults,...saved[seed.id]});}catch{return apply(p,defaults);}});}
  function save(storage,id,input){if(Number(id)!==9&&!seeds.some(p=>p.id===Number(id)))throw new Error('등록된 선수를 확인해 주세요.');const record=normalize(input),all=read(storage);all[id]=record;storage.setItem(key,JSON.stringify(all));return record;}
  function restoreExisting(player,storage){
    const saved=read(storage),labels=abilities.schema(player).flatMap(a=>a[2]);
    const fallback={pos:player.pos,detail:Object.fromEntries(labels.map((label,i)=>[label,player.demo?.detail[i]??null]))};
    let record;try{record=normalize(saved[player.id]||fallback);}catch{record=normalize(fallback);}
    player.managed=true;player.randomStats=!saved[player.id];return apply(player,record);
  }
  const complete=p=>p.pos!=='미정'&&Number.isFinite(p.ovr)&&p.stats.every(Number.isFinite);
  return {seeds,positions,normalize,hydrate,restoreExisting,apply,save,complete};
});
