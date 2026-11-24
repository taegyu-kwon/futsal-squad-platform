const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const SquadLayout=require('../dist/squad-layout.js');
const roster=require('./rated-roster-fixture.cjs');
function setup(canEdit){
 const handlers={},writes=[],state={lineup:[1,2,3,4,5],formation:'1-2-1'};
 const TeamSync={canEdit};
 const context={SquadLayout,TeamSync,window:{TeamSync},document:{addEventListener(type,fn){(handlers[type]??=[]).push(fn);}},TeamStore:{getItem:()=>null,setItem:(...args)=>writes.push(args)},render(){},toast(message){throw Error(message);}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../dist/squad-ui.js'),'utf8')+'\nthis.ui=SquadUI;',context);
 context.ui.init(roster,state);
 return {writes,state,ui:context.ui,click(action,value){const event={target:{closest:()=>({dataset:{action,value}})}};handlers.click.forEach(fn=>fn(event));}};
}
test('viewer can select 6-player preset and free layout without writing shared storage',()=>{
 const app=setup(false);
 app.click('squad-size','6');
 app.click('squad-formation','2-2-1');
 assert.equal(app.state.lineup.length,6);
 assert.equal(app.state.formation,'2-2-1');
 app.click('squad-formation','custom');
 assert.equal(app.state.formation,'자유 배치');
 assert.equal(app.ui.previewChanged,true);
 assert.equal(app.writes.length,0);
});
test('administrator formation changes still use shared storage',()=>{
 const app=setup(true);
 app.click('squad-size','6');
 app.click('squad-formation','2-2-1');
 assert.equal(app.writes.length,2);
 const [key,value]=app.writes.at(-1);
 assert.equal(key,'unit-fc-squads-v1');
 assert.equal(JSON.parse(value).size,6);
 assert.equal(app.ui.previewChanged,false);
});
