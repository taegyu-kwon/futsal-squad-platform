const test=require('node:test');
const assert=require('node:assert/strict');
const roster=require('../dist/pilot-roster.js');
const teams=require('../dist/team-builder.js');
function memory(){let value=null;return {getItem:()=>value,setItem:(_key,next)=>{value=next;}};}
test('the requested players have stable unique IDs and no invented ratings',()=>{
  const players=roster.hydrate(memory());
  assert.deepEqual(players.map(p=>p.name),Array.from({length:11},(_,i)=>`선수 ${i+1}`));
  assert.equal(new Set(players.map(p=>p.id)).size,11);
  for(const p of players){assert.equal(p.ovr,null);assert.equal(p.pos,p.id===111?'GK':'미정');assert.ok(p.stats.every(v=>v===null));assert.equal(roster.complete(p),false);assert.equal(p.num,undefined);}
});
const abilities=require('../dist/abilities.js');
const allDetails=value=>Object.fromEntries([...abilities.field,...abilities.keeper].flatMap(a=>a[2]).map(label=>[label,value]));
test('category means are rounded before position-weighted OVR',()=>{
  const detail=allDetails(80);detail['스피드']=60;detail['가속력']=61;
  const d=roster.normalize({pos:'ST',ovr:99,values:{PAC:99},detail});
  assert.equal(d.values.PAC,61);assert.equal(d.ovr,77);
  assert.equal(roster.normalize({pos:'CB',detail}).ovr,78);
  detail['스피드']='';const incomplete=roster.normalize({pos:'CM',detail});
  assert.equal(incomplete.values.PAC,null);assert.equal(incomplete.values.PAS,80);assert.equal(incomplete.ovr,null);
});
test('detail ratings persist by player and position changes switch the computed schema',()=>{
  const storage=memory(),detail=allDetails(80);for(const name of abilities.keeper[0][2])detail[name]=90;
  roster.save(storage,101,{pos:'CM',detail});
  let p=roster.hydrate(storage)[0];assert.equal(p.ovr,80);assert.equal(p.stats[2],80);assert.equal(roster.complete(p),true);
  roster.save(storage,101,{...p.manual,pos:'GK'});p=roster.hydrate(storage)[0];assert.equal(p.stats.length,5);assert.equal(p.stats[0],90);assert.equal(p.ovr,83);assert.equal(p.manual.values.PAS,80);
  assert.equal(roster.hydrate(storage)[1].ovr,null);
  roster.save(storage,101,{...p.manual,pos:'CM',detail:{...detail,'짧은 패스':''}});p=roster.hydrate(storage)[0];assert.equal(p.ovr,null);assert.equal(p.stats[2],null);
});
test('legacy saved details and captain details recalculate without inventing missing input',()=>{
  const storage=memory();storage.setItem('',JSON.stringify({101:{pos:'CM',ovr:90,values:{PAC:95},detail:{'속력':80,'가속력':90}}}));
  const p=roster.hydrate(storage)[0];assert.equal(p.stats[0],85);assert.equal(p.ovr,null);
  const captain={id:9,pos:'CM',demo:abilities.demo[9],photo:'keep.jpeg'};
  roster.restoreExisting(captain,storage);assert.equal(captain.managed,true);assert.equal(captain.photo,'keep.jpeg');assert.equal(captain.manual.detail['스피드'],67);assert.equal(captain.ovr,82);
  roster.save(storage,9,{pos:'CM',detail:allDetails(91)});roster.restoreExisting(captain,storage);assert.equal(captain.ovr,91);
});
test('validation and failed storage writes cannot silently change a saved profile',()=>{
  const storage=memory();roster.save(storage,101,{pos:'CM',detail:allDetails(80)});
  for(const value of [0,100,1.5,'x',true])assert.throws(()=>roster.save(storage,101,{detail:{'스피드':value}}));
  assert.throws(()=>roster.save(storage,101,{pos:'INVALID'}));assert.throws(()=>roster.save(storage,999,{}));
  assert.equal(roster.hydrate(storage)[0].ovr,80);
  assert.throws(()=>roster.save({getItem:()=>null,setItem:()=>{throw Error('quota');}},101,{detail:allDetails(75)}));
  assert.equal(roster.hydrate({getItem:()=>'{bad JSON'})[0].ovr,null);
});
test('unrated players can be randomly allocated but cannot be treated as zero in balancing',()=>{
  const players=roster.hydrate(memory()),ids=players.map(p=>p.id);
  const result=teams.build(ids,players,'random');
  assert.deepEqual([...result.a,...result.b].sort((a,b)=>a-b),ids);
  assert.equal(teams.summarize(result.a,players).average,null);
  assert.equal(teams.summarize(result.b,players).total,null);
  assert.throws(()=>teams.build(ids,players,'balanced'),/OVR/);
});
test('removed demo players do not survive saved squad restoration, including a roster with no specialist goalkeeper',()=>{
  const layout=require('../dist/squad-layout.js');
  const players=[{id:9,pos:'CM',ovr:82},...roster.hydrate(memory()).filter(p=>p.id!==111)];
  const old=layout.create(require('./rated-roster-fixture.cjs'),{lineup:[1,2,3,4,5]}).book;
  const model=layout.create(players,{lineup:[1,2,3,4,5]},old);
  for(const size of [4,5,6,7]){
    model.setSize(size);model.arrange('random');
    const slots=model.current().slots;assert.equal(slots.length,size);assert.equal(new Set(slots.map(s=>s.id)).size,size);
    assert.ok(slots.every(s=>players.some(p=>p.id===s.id)));assert.equal(slots.at(-1).pos,'GK');
  }
});

test('renamed speed retains old profile and review values, including intentional clearing',()=>{
  const old={'속력':80,'가속력':90};
  assert.deepEqual(abilities.renameDetails(old),{'스피드':80,'가속력':90});
  assert.equal(old['속력'],80);
  assert.equal(roster.normalize({detail:old}).values.PAC,85);
  assert.equal(roster.normalize({detail:{...old,'스피드':''}}).values.PAC,null);
  assert.equal(abilities.renameDetails({'속력':'4'})['스피드'],'4');
});

test('renamed pass attributes retain profile and review values and honor cleared new fields',()=>{
  const old={'짧은 패스':70,'원터치 패스':80,'시야':90,'침투 패스':60};
  const current=abilities.renameDetails(old);
  assert.deepEqual(current,{'짧은 패스':70,'긴패스':80,'시야':90,'스루 패스':60});
  assert.equal(roster.normalize({detail:old}).values.PAS,80);
  assert.equal(roster.normalize({detail:{...old,'긴패스':''}}).values.PAS,null);
  assert.deepEqual(abilities.renameDetails({'원터치 패스':'3','침투 패스':'4'}),{'긴패스':'3','스루 패스':'4'});
});

test('passing uses only three active attributes; removed values cannot block or change OVR',()=>{
  const detail={...allDetails(80),'짧은 패스':85,'긴패스':85,'시야':75};
  assert.deepEqual(abilities.field.find(a=>a[0]==='PAS')[2],['짧은 패스','긴패스','시야']);
  assert.equal(abilities.field.flatMap(a=>a[2]).length,20);
  for(const removed of [null,1,99,'']){
    const d=roster.normalize({pos:'CM',detail:{...detail,'스루 패스':removed,'침투 패스':removed}});
    assert.equal(d.values.PAS,82);assert.equal(d.ovr,81);assert.equal(Object.hasOwn(d.detail,'스루 패스'),false);
  }
  const captain={id:9,pos:'CM',demo:abilities.demo[9]};roster.restoreExisting(captain,memory());
  assert.equal(captain.manual.detail['볼 컨트롤'],84);assert.equal(captain.manual.detail['밸런스'],78);
  assert.deepEqual(captain.stats,[68,82,88,86,78,80]);
});

test('keeper groups use three independent details and five position-weighted category means',()=>{
  assert.equal(abilities.keeper.length,5);assert.ok(abilities.keeper.every(a=>a[2].length===3));
  const detail=allDetails(80);Object.assign(detail,{'근거리 슛 반응':70,'굴절 대응':80,'연속 선방':90,'짧은 패스':99,'GK 짧은 패스':60});
  const d=roster.normalize({pos:'GK',detail});assert.equal(d.values.REF,80);assert.equal(d.values.BLD,73);assert.equal(d.values.PAS,86);assert.equal(d.ovr,80);
  const incomplete=roster.normalize({pos:'GK',detail:{...detail,'캐칭':''}});assert.equal(incomplete.values.HAN,null);assert.equal(incomplete.ovr,null);
});
test('old keeper scores remain reference values without fabricating new detail ratings',()=>{
  const storage=memory();const legacy={'GK 반사신경':90,'GK 위치 선정':85,'GK 1대1 방어':80,'GK 핸들링':75,'GK 빌드업':70};
  storage.setItem('',JSON.stringify({101:{pos:'GK',detail:legacy}}));
  let p=roster.hydrate(storage)[0];assert.equal(p.ovr,null);assert.ok(p.stats.every(v=>v===null));assert.equal(p.manual.legacyKeeper.REF,90);
  roster.save(storage,101,{...p.manual,detail:{...p.manual.detail,'근거리 슛 반응':81}});
  p=roster.hydrate(storage)[0];assert.equal(p.manual.legacyKeeper.REF,90);assert.equal(p.manual.detail['근거리 슛 반응'],81);assert.equal(p.manual.detail['굴절 대응'],null);
  roster.save(storage,101,{...p.manual,detail:allDetails(82)});p=roster.hydrate(storage)[0];assert.equal(p.ovr,82);assert.equal(p.manual.legacyKeeper.REF,90);
});

test('new keeper starts with fifteen blank details and preserves saved roster and custom layouts',()=>{
  const storage=memory();roster.save(storage,101,{pos:'CF',detail:allDetails(88)});
  const players=roster.hydrate(storage),keeper=players.find(p=>p.id===111);
  assert.equal(keeper.name,'선수 11');assert.equal(keeper.pos,'GK');assert.equal(keeper.stats.length,5);assert.equal(keeper.ovr,null);
  assert.ok(abilities.keeper.flatMap(a=>a[2]).every(name=>keeper.manual.detail[name]===null));
  roster.save(storage,111,{pos:'GK',detail:allDetails(80)});assert.equal(roster.hydrate(storage).find(p=>p.id===111).ovr,80);assert.equal(roster.hydrate(storage)[0].ovr,88);
  const layout=require('../dist/squad-layout.js'),oldRoster=players.filter(p=>p.id!==111);
  const old=layout.create(oldRoster);old.current().formation='custom';old.current().slots[0].x=42;
  const restored=layout.create(players,{},old.book);
  assert.deepEqual(restored.current(),old.current());
  const slot=restored.current().slots.at(-1);assert.doesNotThrow(()=>restored.edit(4,{...slot,x:51}));
});
