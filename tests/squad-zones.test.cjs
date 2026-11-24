const {test}=require('node:test');const assert=require('node:assert/strict');const L=require('../dist/squad-layout.js');const roster=require('./rated-roster-fixture.cjs');
const make=saved=>L.create(roster,{},saved);
test('zone boundaries limit forward, midfield and defensive choices with mirrored flanks',()=>{
 assert.deepEqual(L.zoneAt(50,33.99).positions,['ST','CF']);assert.deepEqual(L.zoneAt(50,34).positions,['CM','CAM','CDM']);assert.deepEqual(L.zoneAt(50,58).positions,['CB']);
 assert.equal(L.zoneAt(32.99,20).defaultPosition,'LW');assert.equal(L.zoneAt(33,20).defaultPosition,'ST');assert.equal(L.zoneAt(67,20).defaultPosition,'ST');assert.equal(L.zoneAt(67.01,20).defaultPosition,'RW');
 for(const [x,left,right] of [[20,'LM','RM']]){assert.equal(L.zoneAt(x,45).defaultPosition,left);assert.equal(L.zoneAt(100-x,45).defaultPosition,right);}
 assert.ok(!L.zoneAt(50,20).positions.includes('CB'));assert.ok(!L.zoneAt(20,65).positions.includes('ST'));
});
test('moving across zones changes roles while fine adjustments retain chosen specialties',()=>{
 const m=make();const edit=(values)=>m.edit(0,{...m.current().slots[0],...values});
 edit({x:50,y:45});assert.equal(m.current().slots[0].pos,'CM');edit({pos:'CAM'});edit({x:55,y:46});assert.equal(m.current().slots[0].pos,'CAM');
 edit({x:80});assert.equal(m.current().slots[0].pos,'RM');edit({y:65});assert.equal(m.current().slots[0].pos,'RB');edit({x:50});assert.equal(m.current().slots[0].pos,'CB');edit({y:20});assert.equal(m.current().slots[0].pos,'ST');
 edit({pos:'CB'});assert.equal(m.current().slots[0].pos,'ST');
});
test('goalkeeper is stable and every preset is valid for its zone',()=>{
 const m=make();for(const size of [4,5,6,7]){m.setSize(size);for(const key of Object.keys(L.presets[size])){m.setFormation(key);m.current().slots.forEach((s,i)=>assert.ok(L.zoneAt(s.x,s.y,i===size-1).positions.includes(s.pos)));}const i=size-1;m.edit(i,{...m.current().slots[i],x:20,y:20});assert.equal(m.current().slots[i].pos,'GK');}
});
test('legacy layouts and templates normalize invalid roles without losing coordinates, names or assignments',()=>{
 const m=make();m.setFormation('custom');m.saveTemplate('legacy','기존 전술');m.current().slots[0].pos='CB';m.book.templates[0].slots[0].pos='CB';const original={...m.current().slots[0]};const fresh=make(JSON.parse(JSON.stringify(m.book)));assert.equal(fresh.current().slots[0].pos,'ST');assert.equal(fresh.current().slots[0].id,original.id);assert.equal(fresh.current().slots[0].x,original.x);assert.equal(fresh.current().slots[0].y,original.y);fresh.loadTemplate('legacy');assert.equal(fresh.title(),'기존 전술');assert.equal(fresh.current().slots[0].pos,'ST');
});
