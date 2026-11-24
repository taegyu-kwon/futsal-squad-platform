/* Formation positions are UI presets; ratings are never recalculated. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SquadLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const presets={
    4:{'1-2':[['LW',30,25],['RW',70,25],['CB',50,61]],'2-1':[['ST',50,24],['CB',30,61],['CB',70,61]],'1-1-1':[['ST',50,21],['CM',50,43],['CB',50,65]]},
    5:{'1-2-1':[['ST',50,21],['LM',23,45],['RM',77,45],['CB',50,66]],'2-2':[['LW',30,25],['RW',70,25],['CB',30,63],['CB',70,63]],'3-1':[['ST',50,24],['LB',20,61],['CB',50,61],['RB',80,61]]},
    6:{'2-2-1':[['ST',50,20],['LM',27,43],['RM',73,43],['CB',30,65],['CB',70,65]],'1-3-1':[['ST',50,20],['LM',20,43],['CM',50,43],['RM',80,43],['CB',50,66]],'3-2':[['LW',30,25],['RW',70,25],['LB',20,62],['CB',50,62],['RB',80,62]]},
    7:{'2-3-1':[['ST',50,19],['LM',20,42],['CM',50,42],['RM',80,42],['CB',30,65],['CB',70,65]],'3-2-1':[['ST',50,19],['CM',30,42],['CM',70,42],['LB',20,65],['CB',50,65],['RB',80,65]],'2-2-2':[['ST',30,20],['ST',70,20],['LM',27,43],['RM',73,43],['CB',30,65],['CB',70,65]],'3-3':[['LW',20,25],['ST',50,25],['RW',80,25],['LB',20,63],['CB',50,63],['RB',80,63]]}
  };
  const positions=['ST','CF','LW','RW','CAM','CM','LM','RM','CDM','CB','LB','RB','LWB','RWB'];
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const zoneBounds={left:33,right:67,attack:34,defense:58};
  function zoneAt(x,y,keeper=false){
    if(keeper)return {key:'gk',name:'골키퍼',positions:['GK'],defaultPosition:'GK'};
    const lane=x<zoneBounds.left?'left':x>zoneBounds.right?'right':'center',band=y<zoneBounds.attack?'attack':y>=zoneBounds.defense?'defense':'midfield';
    const choices={attack:{left:['LW','ST','CF'],center:['ST','CF'],right:['RW','ST','CF']},midfield:{left:['LM','CM','LWB'],center:['CM','CAM','CDM'],right:['RM','CM','RWB']},defense:{left:['LB','CB','LWB'],center:['CB'],right:['RB','CB','RWB']}};
    const list=choices[band][lane];return {key:band+'-'+lane,name:({attack:'공격',midfield:'중원',defense:'수비'})[band]+' · '+({left:'왼쪽',center:'중앙',right:'오른쪽'})[lane],positions:[...list],defaultPosition:list[0]};
  }
  function positionAt(slot,x,y,keeper=false,requested=slot.pos){
    const next=zoneAt(x,y,keeper),crossed=next.key!==zoneAt(slot.x,slot.y,keeper).key;
    return !crossed&&next.positions.includes(requested)?requested:next.defaultPosition;
  }
  function normalizeSlot(slot,keeper){const zone=zoneAt(slot.x,slot.y,keeper);return {...slot,pos:zone.positions.includes(slot.pos)?slot.pos:zone.defaultPosition};}
  function create(roster,legacy={},saved){
    const field=roster.filter(p=>p.pos!=='GK'),specialists=roster.filter(p=>p.pos==='GK'),keepers=specialists.length?specialists:roster;
    const validIds=ids=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>roster.some(p=>p.id===id));
    const validSetup=(s,size)=>s&&Array.isArray(s.slots)&&s.slots.length===size&&s.slots.every(x=>x&&typeof x==='object')&&validIds(s.slots.map(x=>x.id))&&(s.formation==='custom'||presets[size][s.formation])&&s.slots.every((x,i)=>Number.isFinite(x.x)&&x.x>=12&&x.x<=88&&Number.isFinite(x.y)&&x.y>=14&&x.y<=88&&(i===size-1?x.pos==='GK'&&roster.some(p=>p.id===x.id):positions.includes(x.pos)&&field.some(p=>p.id===x.id)));
    const validShape=(slots,size)=>Array.isArray(slots)&&slots.length===size&&slots.every((x,i)=>x&&Number.isFinite(x.x)&&x.x>=12&&x.x<=88&&Number.isFinite(x.y)&&x.y>=14&&x.y<=88&&(i===size-1?x.pos==='GK':positions.includes(x.pos)));
    const templates=[];
    for(const t of Array.isArray(saved?.templates)?saved.templates:[]){if(t&&typeof t.id==='string'&&typeof t.name==='string'&&t.name.trim()&&t.name.length<=32&&[4,5,6,7].includes(t.size)&&validShape(t.slots,t.size)&&!templates.some(x=>x.id===t.id)){templates.push({id:t.id,name:t.name.trim(),size:t.size,slots:t.slots.map(({pos,x,y},i)=>normalizeSlot({pos,x,y},i===t.size-1))});}}
    const book={size:[4,5,6,7].includes(saved?.size)?saved.size:5,setups:{},templates,snapEnabled:saved?.snapEnabled!==false};
    for(const size of [4,5,6,7]){
      const previous=saved?.setups?.[size];
      if(validSetup(previous,size)){book.setups[size]=JSON.parse(JSON.stringify(previous));book.setups[size].slots=book.setups[size].slots.map((slot,i)=>normalizeSlot(slot,i===size-1));continue;}
      const starters=field.slice(0,size-1).map(p=>p.id);let ids=[...starters,keepers.find(p=>!starters.includes(p.id)).id];
      if(size===5&&validIds(legacy.lineup)&&legacy.lineup.length===5&&legacy.lineup.slice(0,-1).every(id=>field.some(p=>p.id===id))&&keepers.some(p=>p.id===legacy.lineup.at(-1)))ids=[...legacy.lineup];
      const formation=size===5&&presets[5][legacy.formation]?legacy.formation:Object.keys(presets[size])[0];
      book.setups[size]={formation,slots:[...presets[size][formation],['GK',50,87]].map(([pos,x,y],i)=>({id:ids[i],pos,x,y}))};
    }
    const current=()=>book.setups[book.size];
    function title(){return book.templates.find(t=>t.id===current().templateId)?.name||(current().formation==='custom'?'자유 배치':current().formation);}
    function saveTemplate(id,name,replaceId){
      name=String(name).trim().replace(/\s+/g,' ');if(!name||name.length>32)throw Error('포메이션 이름을 1~32자로 입력해 주세요.');
      if(book.templates.some(t=>t.size===book.size&&t.name.toLocaleLowerCase()===name.toLocaleLowerCase()&&t.id!==replaceId))throw Error('같은 인원에 같은 이름이 있습니다. 다른 이름을 입력하거나 기존 포메이션을 갱신해 주세요.');
      const index=book.templates.findIndex(t=>t.id===replaceId);if(replaceId&&(index<0||book.templates[index].size!==book.size))throw Error('현재 경기 인원과 같은 포메이션만 갱신할 수 있습니다.');
      if(!replaceId&&book.templates.some(t=>t.id===id))throw Error('다시 저장해 주세요.');
      const t={id:replaceId||id,name,size:book.size,slots:current().slots.map(({pos,x,y})=>({pos,x,y}))};
      if(replaceId)book.templates[index]=t;else book.templates.push(t);current().formation='custom';current().templateId=t.id;return t;
    }
    function loadTemplate(id){const t=book.templates.find(t=>t.id===id);if(!t)throw Error('저장된 포메이션을 찾을 수 없습니다.');book.size=t.size;const s=current();s.slots=t.slots.map((slot,i)=>({...slot,id:s.slots[i].id}));s.formation='custom';s.templateId=id;}
    function removeTemplate(id){const i=book.templates.findIndex(t=>t.id===id);if(i<0)return null;const [t]=book.templates.splice(i,1);Object.values(book.setups).forEach(s=>{if(s.templateId===id)delete s.templateId;});return t;}
    function restoreTemplate(t){if(!t||book.templates.some(x=>x.id===t.id))return;if(book.templates.some(x=>x.size===t.size&&x.name.toLocaleLowerCase()===t.name.toLocaleLowerCase()))throw Error('같은 이름이 이미 있어 복원할 수 없습니다.');book.templates.push(JSON.parse(JSON.stringify(t)));}
    function setSize(size){if(!presets[size])throw Error('지원하지 않는 인원입니다.');book.size=Number(size);}
    function setFormation(key){const s=current();delete s.templateId;if(key==='custom'){s.formation=key;return;}const p=presets[book.size][key];if(!p)throw Error('포메이션을 선택해 주세요.');s.slots=[...p,['GK',50,87]].map(([pos,x,y],i)=>({id:s.slots[i].id,pos,x,y}));s.formation=key;}
    function edit(index,{id,pos,x,y}){
      const s=current(),slot=s.slots[index];if(!slot)throw Error('선수를 선택해 주세요.');
      const keeper=index===book.size-1,available=keeper?keepers:field;
      if((!available.some(p=>p.id===id)&&!(keeper&&slot.id===id&&roster.some(p=>p.id===id)))||!(keeper?pos==='GK':positions.includes(pos))||!Number.isFinite(x)||!Number.isFinite(y))throw Error('선수와 포지션을 확인해 주세요.');
      x=clamp(x,12,88);y=clamp(y,14,88);pos=positionAt(slot,x,y,keeper,pos);
      const other=s.slots.findIndex(p=>p.id===id);if(other!==-1&&other!==index)s.slots[other].id=slot.id;
      if(slot.pos!==pos||slot.x!==clamp(x,12,88)||slot.y!==clamp(y,14,88)){s.formation='custom';delete s.templateId;}
      Object.assign(slot,{id,pos,x:clamp(x,12,88),y:clamp(y,14,88)});
    }
    function arrange(mode,rng=Math.random){let list=[...field];if(mode==='best'){list=list.filter(p=>Number.isFinite(p.ovr));if(list.length<book.size-1)throw Error('OVR이 입력된 선수가 부족합니다. 랜덤 선발을 이용해 주세요.');list.sort((a,b)=>b.ovr-a.ovr);}else for(let i=list.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[list[i],list[j]]=[list[j],list[i]];}const starters=list.slice(0,book.size-1),candidates=keepers.filter(p=>!starters.some(x=>x.id===p.id)&&(mode!=='best'||Number.isFinite(p.ovr))),keeper=[...candidates].sort((a,b)=>(b.ovr??0)-(a.ovr??0))[0];if(!keeper)throw Error('골키퍼 자리에 배치할 선수의 OVR을 입력하거나 랜덤 선발을 이용해 주세요.');current().slots.forEach((s,i)=>s.id=i===book.size-1?keeper.id:starters[i].id);}
    return {book,current,title,setSize,setFormation,edit,arrange,saveTemplate,loadTemplate,removeTemplate,restoreTemplate};
  }
  function snap(slots,index,x,y,width,height,enabled=true,threshold=9){
    x=clamp(x,12,88);y=clamp(y,14,88);const guides={};
    if(!enabled||width<=0||height<=0)return {x,y,guides};
    for(const [axis,value,pixels] of [['x',x,width],['y',y,height]]){
      const candidates=[{value:50,center:true},...slots.filter((_,i)=>i!==index).map(s=>({value:s[axis],center:false}))];
      let best=null,distance=Infinity;
      for(const c of candidates){const delta=Math.abs(c.value-value)*pixels/100;if(delta<=threshold&&delta<distance){best=c;distance=delta;}}
      if(best){guides[axis]=best;if(axis==='x')x=best.value;else y=best.value;}
    }
    return {x,y,guides};
  }
  return {presets,positions,zoneBounds,zoneAt,positionAt,create,snap};
});
