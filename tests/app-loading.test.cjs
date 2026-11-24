const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const node=()=>({hidden:false,open:false,isConnected:true,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},showModal(){this.open=true;},close(){this.open=false;},focus(){},matches(){return !!this.popover;},showPopover(){this.popover=true;},hidePopover(){this.popover=false;},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}});
 const overlay=node(),small=node(),label=node(),retry=node(),video=node(),smallVideo=node(),smallLabel=node();
 const main={querySelectorAll:()=>[]};
 overlay.querySelector=s=>s==='video'?video:s==='.loading-label'?label:retry;small.querySelector=s=>s==='video'?smallVideo:smallLabel;
 const document={hidden:false,activeElement:node(),fonts:{ready:Promise.resolve()},addEventListener(){},getElementById:id=>({'app-loading':overlay,'app-loading-background':small,main})[id]};
 const context={window:{},document,matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout,clearTimeout,location:{reload(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../dist/app-loading.js'),'utf8'),context);
 return {app:context.window.AppLoading,overlay,small,label};
}
test('overlapping preparations keep loading visible until every task finishes',async()=>{
 const {app,overlay}=setup();await app.finishBoot();assert.equal(overlay.open,false);
 const one=app.begin('사진',{delay:0}),two=app.begin('카드',{delay:0});assert.equal(overlay.open,true);
 one();one();assert.equal(overlay.open,true);two();assert.equal(overlay.open,false);
});
test('failed operations release loading and shared saves use the fullscreen modal',async()=>{
 const {app,overlay,small}=setup();await app.finishBoot();
 await assert.rejects(app.during('사진 처리',()=>Promise.reject(Error('failed')),{delay:0}));assert.equal(overlay.open,false);
 const end=app.begin('공유 저장',{mode:'background',delay:0});assert.equal(overlay.open,true);end();assert.equal(overlay.open,false);
});
test('cached work never flashes a delayed overlay and image errors unblock preparation',async()=>{
 const {app,overlay}=setup();await app.finishBoot();const end=app.begin('캐시',{delay:10});end();await new Promise(r=>setTimeout(r,20));assert.equal(overlay.open,false);
 const image={complete:true,naturalWidth:10,getAttribute:()=>'/bad.png',decode:()=>Promise.reject(Error('decode'))};await app.prepare({querySelectorAll:()=>[image]});assert.equal(overlay.open,false);
});
test('slow card images share the fullscreen loader and cancellation releases it',async()=>{
 const {app,overlay,small}=setup();await app.finishBoot();let resolve;
 const image={complete:true,naturalWidth:10,getAttribute:()=>'/portrait.png',decode:()=>new Promise(r=>{resolve=r;})};
 const root={querySelectorAll:()=>[image]},pending=app.prepare(root);
 assert.equal(overlay.open,false);
 await new Promise(r=>setTimeout(r,380));assert.equal(overlay.open,true);
 app.cancel(root);assert.equal(overlay.open,false);resolve();await pending;
});
