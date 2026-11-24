const test=require('node:test');
const assert=require('node:assert/strict');
const {cropRect}=require('../dist/player-photos.js');
test('portrait, landscape and square photos always cover the card without empty edges',()=>{
  for(const [w,h] of [[4000,2000],[2000,4000],[2000,2000]])for(const zoom of [1,2,3])for(const x of [0,50,100])for(const y of [0,50,100]){
    const r=cropRect(w,h,zoom,x,y);
    assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w+1e-8&&r.y+r.height<=h+1e-8);
    assert.ok(Math.abs(r.width/r.height-512/544)<1e-10);
  }
});
test('centering, zoom, and edge positions select the expected source region',()=>{
  const centered=cropRect(2000,2000,1,50,50);
  assert.equal(centered.height,2000);assert.equal(centered.y,0);
  assert.ok(Math.abs(centered.x-(2000-centered.width)/2)<1e-10);
  const zoomed=cropRect(2000,2000,2,100,100);
  assert.equal(zoomed.height,1000);assert.equal(zoomed.x+zoomed.width,2000);assert.equal(zoomed.y+zoomed.height,2000);
});
const {panCrop,zoomCrop,gestureCrop}=require('../dist/player-photos.js');
test('drag follows the finger and respects crop edges',()=>{
 const t={zoom:2,x:50,y:50},r=cropRect(2000,2000,t.zoom,t.x,t.y),next=panCrop(2000,2000,t,20,-10,200,212.5),after=cropRect(2000,2000,next.zoom,next.x,next.y);
 assert.ok(Math.abs(after.x-(r.x-20*r.width/200))<1e-8);assert.ok(Math.abs(after.y-(r.y+10*r.height/212.5))<1e-8);
 const edge=panCrop(2000,2000,t,99999,-99999,200,212.5);assert.equal(edge.x,0);assert.equal(edge.y,100);
});
test('zoom preserves the image point under the pointer, clamps limits, and round-trips',()=>{
 const t={zoom:2,x:50,y:50},r=cropRect(2000,3000,t.zoom,t.x,t.y),next=zoomCrop(2000,3000,t,3,.3,.6),after=cropRect(2000,3000,next.zoom,next.x,next.y);
 assert.ok(Math.abs((r.x+.3*r.width)-(after.x+.3*after.width))<1e-8);assert.ok(Math.abs((r.y+.6*r.height)-(after.y+.6*after.height))<1e-8);
 const back=zoomCrop(2000,3000,next,2,.3,.6);assert.ok(Math.abs(back.x-50)<1e-8);assert.ok(Math.abs(back.y-50)<1e-8);
 assert.equal(zoomCrop(2000,3000,t,100).zoom,4);assert.equal(zoomCrop(2000,3000,t,.1).zoom,.25);
});
test('two-finger pinch combines magnification and translation',()=>{
 const t={zoom:1.5,x:50,y:50},rect={left:0,top:0,width:200,height:200};
 const next=gestureCrop(2000,2000,t,[{x:60,y:100},{x:140,y:100}],[{x:30,y:110},{x:190,y:110}],rect);
 assert.equal(next.zoom,3);const centered=zoomCrop(2000,2000,t,3),expected=panCrop(2000,2000,centered,10,10,200,200);assert.deepEqual(next,expected);
});

test('reduced photos leave transparent margins and remain draggable',()=>{
 const t=zoomCrop(512,544,{zoom:1,x:50,y:50},.5),r=cropRect(512,544,t.zoom,t.x,t.y);
 assert.equal(t.zoom,.5);assert.equal(r.x,-256);assert.equal(r.y,-272);
 const moved=panCrop(512,544,t,20,10,512,544),after=cropRect(512,544,moved.zoom,moved.x,moved.y);
 assert.ok(Math.abs(after.x-(r.x-40))<1e-8);assert.ok(Math.abs(after.y-(r.y-20))<1e-8);
 const reset=zoomCrop(512,544,{zoom:.5,x:50,y:50},1);assert.deepEqual(reset,{zoom:1,x:50,y:50});
});
