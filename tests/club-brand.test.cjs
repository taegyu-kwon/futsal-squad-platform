const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../dist/club-settings.js'),'utf8');
function el(){return {textContent:'',innerHTML:'',title:'',attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;}};}
function setup(stored){
 const nodes={'.brand-name':[el(),el()],'.mobile-brand':[el()],'.club-brand-name':[el()]};
 const listeners={};
 const document={querySelectorAll:s=>s.split(',').flatMap(part=>nodes[part.trim()]||[]),querySelector:()=>null,addEventListener(){}};
 const window={addEventListener(type,fn){listeners[type]=fn;}};
 const store=new Map(stored===undefined?[]:[['unit-fc-club-v1',stored]]);
 const context={document,window,TeamStore:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},render(){}};
 vm.runInNewContext(`${source};this.ClubSettings=ClubSettings;`,context);
 return {club:context.ClubSettings,nodes,listeners};
}
test('logo, footer and title name follow the saved team name with an escaped accent word',()=>{
 const {club,nodes}=setup(JSON.stringify({name:'번개 <b>FC</b>',emblem:'번'}));
 club.sync();
 assert.equal(club.name(),'번개 <b>FC</b>');
 for(const node of nodes['.brand-name']){assert.equal(node.innerHTML,'번개 <span class="lime">&lt;b&gt;FC&lt;/b&gt;</span>');assert.equal(node.title,'번개 <b>FC</b>');}
 assert.equal(nodes['.club-brand-name'][0].textContent,'번개 <b>FC</b>');
 assert.equal(nodes['.mobile-brand'][0].attrs['aria-label'],'번개 <b>FC</b> 홈');
 assert.doesNotMatch(fs.readFileSync(require.resolve('../dist/index.html'),'utf8'),/UNITED FC/);
 assert.match(fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),/document\.title=`\$\{ClubSettings\.name\(\)\}/);
});
test('missing or blank team name falls back to the default and a single word has no accent',()=>{
 let {club,nodes}=setup();club.sync();
 assert.equal(club.name(),'흑표범 FC');assert.equal(nodes['.brand-name'][0].innerHTML,'흑표범 <span class="lime">FC</span>');
 ({club,nodes}=setup(JSON.stringify({name:'   '})));club.sync();assert.equal(club.name(),'흑표범 FC');
 ({club,nodes}=setup(JSON.stringify({name:'천둥'})));club.sync();assert.equal(nodes['.brand-name'][0].innerHTML,'천둥');
});
test('a team name change from shared storage updates the logo live',()=>{
 const {club,nodes,listeners}=setup(JSON.stringify({name:'흑표범 FC'}));club.sync();
 listeners.storage({key:'unit-fc-club-v1',newValue:JSON.stringify({name:'새 팀 FC'})});
 assert.equal(club.name(),'새 팀 FC');assert.equal(nodes['.brand-name'][1].innerHTML,'새 팀 <span class="lime">FC</span>');
});
