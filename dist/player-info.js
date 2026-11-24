(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PlayerInfo=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const key='unit-fc-player-info-v1';
  function normalize(input={}){
    const number=(value,min,max,integer=false)=>{if(value===''||value==null)return null;const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error('입력 범위를 확인해 주세요.');return n;};
    const star=value=>{const n=number(value,0.5,5);if(n!==null&&!Number.isInteger(n*2))throw new Error('별점은 0.5점 단위로 입력해 주세요.');return n;};
    const dominant=input.dominant||'';
    if(!['','left','right','both'].includes(dominant))throw new Error('주발을 선택해 주세요.');
    return {height:number(input.height,50,250),weight:number(input.weight,20,300),dominant,left:number(input.left,1,5,true),right:number(input.right,1,5,true),staminaStars:star(input.staminaStars),skillStars:star(input.skillStars)};
  }
  function read(storage,id){try{return normalize(JSON.parse(storage.getItem(key)||'{}')[id]||{});}catch{return normalize();}}
  function write(storage,id,input){const value=normalize(input);let all={};try{all=JSON.parse(storage.getItem(key)||'{}');if(!all||typeof all!=='object'||Array.isArray(all))all={};}catch{}all[id]=value;storage.setItem(key,JSON.stringify(all));return value;}
  return {normalize,read,write};
});
