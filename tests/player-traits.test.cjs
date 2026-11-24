const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const Traits=require('../dist/player-traits.js');const SharedStore=require('../dist/shared-store.js');
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('availability defaults safely and specialties trim, deduplicate and validate limits',()=>{
 assert.deepEqual(Traits.normalize(),{status:'active',traits:[]});
 assert.deepEqual(Traits.normalize({status:'injured',traits:' 중거리 슛 \n\n빠른  역습\n중거리 슛'}),{status:'injured',traits:['중거리 슛','빠른 역습']});
 for(const input of [{status:'unknown'},{traits:Array.from({length:9},(_,i)=>String(i))},{traits:['가'.repeat(25)]},{traits:[false]}])assert.throws(()=>Traits.normalize(input));
});
test('owner changes persist per player and recovery does not lose specialties or other players',()=>{
 const s=memory();Traits.write(s,9,{status:'injured',traits:['중거리 슛']},true);Traits.write(s,101,{traits:['헤딩']},true);
 assert.equal(Traits.read(s,9).status,'injured');Traits.write(s,9,{status:'active',traits:['중거리 슛']},true);
 assert.deepEqual(Traits.read(s,9),{status:'active',traits:['중거리 슛']});assert.deepEqual(Traits.read(s,101).traits,['헤딩']);
 const before=s.getItem(Traits.key);assert.throws(()=>Traits.write(s,9,{status:'injured'},false));assert.throws(()=>Traits.write(s,999,{traits:[]},true));assert.equal(s.getItem(Traits.key),before);
});
test('shared read-only storage still rejects a forced client-side owner flag',()=>{
 const s=SharedStore.create({keys:[Traits.key],readData:()=>({}),writeData:()=>assert.fail('cannot mutate'),storage:memory(),canEdit:()=>false});
 assert.throws(()=>Traits.write(s,9,{status:'injured'},true),/관리자/);
});
test('public detail omits editing controls and renders specialties as escaped text',()=>{
 const s=memory();Traits.write(s,9,{status:'injured',traits:['<img src=x onerror=x>']},true);
 const c=vm.createContext({PlayerTraits:Traits,TeamStore:s,TeamSync:{canEdit:false},document:{addEventListener(){}},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
 vm.runInContext(fs.readFileSync('dist/player-traits-ui.js','utf8'),c);
 let html=vm.runInContext('playerTraitsPanel({id:9})',c);assert.doesNotMatch(html,/data-action="player-traits-edit"|<img/);assert.match(html,/&lt;img/);assert.match(html,/부상/);
 c.TeamSync.canEdit=true;html=vm.runInContext('playerTraitsPanel({id:9})',c);assert.match(html,/data-action="player-traits-edit"/);
});
