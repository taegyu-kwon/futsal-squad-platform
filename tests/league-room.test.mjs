import {test} from 'node:test';
import assert from 'node:assert/strict';
import C from '../dist/futsal/core.js';
import {RoomEngine,IDLE_TO_AI} from '../realtime/src/room-engine.mjs';

const card=(id,name,pos,stats)=>({id,name,pos,stats});
const roster=[card(1,'수문장','GK',[82,80,78,75,70]),card(2,'빠른윙','LW',[92,70,72,88,40,60]),card(3,'골잡이','ST',[75,93,70,80,35,82]),
  card(4,'철벽','CB',[65,40,68,55,91,88]),card(5,'조율사','CM',[70,72,90,82,66,70]),card(6,'신입','미정',[])];

function room(opts={}){
  const inbox=new Map();let clock=0;
  const r=new RoomEngine({code:'ABCDE',roster,send:(cid,obj)=>{if(!inbox.has(cid))inbox.set(cid,[]);inbox.get(cid).push(obj);},now:()=>clock,seed:5,...opts});
  return {r,inbox,last:(cid,t)=>[...(inbox.get(cid)||[])].reverse().find(m=>m.t===t),advance:ms=>{clock+=ms;}};
}
const ids=n=>Array.from({length:n},(_,i)=>'player-'+String(i).padStart(3,'0'));

test('core runs 5, 6 and 7 a side with the pivot taking kick-off',()=>{
  for(const size of [5,6,7]){
    const m=C.createMatch({home:C.cpuTeam('normal',1,size),away:C.cpuTeam('normal',2,size),size,online:true,duration:30,seed:3});
    assert.equal(m.teams[0].players.length,size);assert.equal(m.teams[1].players.length,size);
    assert.equal(m.ball.owner,m.teams[0].players[size-1]);
    let n=0;while(m.phase!=='end'&&n<60*60){C.step(m,1/60,{players:{}});n++;
      for(const p of C.allPlayers(m))assert.ok(Number.isFinite(p.x)&&Math.abs(p.x)<=20&&Math.abs(p.z)<=10);}
    assert.equal(m.phase,'end');
  }
});

test('every online seat is driven by its own input, the rest by the computer',()=>{
  const m=C.createMatch({home:C.cpuTeam('normal',1,7),away:C.cpuTeam('normal',2,7),size:7,online:true,duration:60,seed:3});
  for(let i=0;i<200;i++)C.step(m,1/60,{players:{}}); // past the countdown
  const right={moveX:1,moveZ:0},left={moveX:-1,moveZ:0};
  const a=m.teams[0].players[2],b=m.teams[1].players[3];const ax=a.x,bx=b.x;
  for(let i=0;i<60;i++)C.step(m,1/60,{players:{2:right,13:left}});
  assert.ok(a.human&&b.human);assert.ok(a.x>ax+2,'home ala ran right');assert.ok(b.x<bx-2,'away ala ran left');
  assert.ok(!m.teams[0].players[1].human);
});

test('a person in goal stays inside the penalty area',()=>{
  const m=C.createMatch({home:C.cpuTeam('normal',1,5),away:C.cpuTeam('normal',2,5),size:5,online:true,duration:60,seed:3});
  for(let i=0;i<200;i++)C.step(m,1/60,{players:{}});
  for(let i=0;i<300;i++)C.step(m,1/60,{players:{0:{moveX:1,moveZ:1}}});
  const gk=m.teams[0].players[0];assert.ok(gk.x<=-20+6+1e-6&&Math.abs(gk.z)<=6+1e-6);
});

test('lobby: seats are unique, cards are unique, host controls size and start',()=>{
  const {r,last}=room();const [a,b,c]=ids(3);
  r.join(a,'가');r.join(b,'나');r.join(c,'다');
  assert.equal(last(a,'welcome').roster.length,6);
  r.handle(a,{t:'seat',team:0,slot:4});r.handle(b,{t:'seat',team:0,slot:4});
  assert.equal(last(b,'error').msg,'이미 다른 사람이 고른 자리예요.');
  r.handle(b,{t:'seat',team:1,slot:6});assert.equal(r.members.get(b).slot,null,'slot 6 does not exist at 5 a side');
  r.handle(b,{t:'cfg',size:7});assert.equal(r.size,5,'only the host changes the size');
  r.handle(a,{t:'cfg',size:7,duration:420});assert.equal(r.size,7);assert.equal(r.duration,420);
  r.handle(b,{t:'seat',team:1,slot:6});assert.equal(r.members.get(b).slot,6);
  r.handle(a,{t:'card',id:3});r.handle(c,{t:'card',id:3});
  assert.match(last(c,'error').msg,/이미 골랐어요/);assert.equal(r.members.get(a).name,'골잡이');
  r.handle(a,{t:'cfg',size:5});assert.equal(r.members.get(b).slot,null,'shrinking the room frees seats that no longer exist');
  r.handle(b,{t:'start'});assert.equal(r.phase,'lobby');
  r.handle(a,{t:'start'});assert.equal(r.phase,'match');
  const k=last(a,'kickoff');assert.equal(k.you,4);assert.equal(k.players.length,10);
  assert.equal(k.players[4].name,'골잡이');
  assert.equal(k.players[0].name,'수문장','spare keeper card fills the empty goal');
  assert.ok(k.players.filter(p=>p.ai).length===9);
});

test('match: inputs move my player, idle seats fall back to the computer, full time sends a result',()=>{
  const {r,last,advance}=room();const [a,b]=ids(2);
  r.join(a,'가');r.join(b,'나');r.handle(a,{t:'seat',team:0,slot:2});r.handle(b,{t:'seat',team:1,slot:3});
  r.handle(a,{t:'cfg',duration:180});r.handle(a,{t:'start'});
  for(let i=0;i<60;i++){advance(50);r.tick();} // countdown
  const me=r.match.teams[0].players[2],x0=me.x;
  for(let i=1;i<=20;i++){r.handle(a,{t:'in',s:i,x:1,z:0});advance(50);r.tick();}
  assert.ok(me.human&&me.x>x0+3);
  const s=last(a,'s');assert.equal(s.a,20);assert.equal(s.p.length,10);assert.equal(s.p[2][8],1);
  advance(IDLE_TO_AI*1000+100);r.tick();assert.equal(me.human,false,'computer takes over an idle seat');
  r.handle(a,{t:'in',s:5,x:-1,z:0});assert.equal(r.members.get(a).seq,20,'old input sequence is ignored');
  let n=0;while(r.phase==='match'&&n<20*400){advance(50);r.tick();n++;}
  assert.equal(r.phase,'result');const res=last(b,'result');assert.equal(res.score.length,2);
  r.handle(a,{t:'lobby'});assert.equal(r.phase,'lobby');
});

test('a player who drops mid-match keeps the seat and gets the match back on rejoin',()=>{
  const {r,last}=room();const [a,b]=ids(2);
  r.join(a,'가');r.join(b,'나');r.handle(a,{t:'seat',team:0,slot:1});r.handle(a,{t:'start'});
  r.leave(a);assert.equal(r.host,b,'host passes on');r.tick();
  r.join(a,'가');assert.equal(last(a,'kickoff').you,1);
});
