const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../dist/futsal/core.js');
const Abilities=require('../dist/abilities.js');
const PilotRoster=require('../dist/pilot-roster.js');

const card=(id,name,pos,stats,ovr=null)=>({id,name,pos,stats,ovr});
const squad=()=>C.normalizeRoster([
  card(1,'수문장','GK',[82,80,78,75,70],80),
  card(2,'빠른윙','LW',[92,70,72,88,40,60],78),
  card(3,'골잡이','ST',[75,93,70,80,35,82],84),
  card(4,'철벽','CB',[65,40,68,55,91,88],80),
  card(5,'조율사','CM',[70,72,90,82,66,70],79),
  card(6,'후보','미정',[]),
]);

test('lineup always has a goalkeeper first and fills futsal roles by stats',()=>{
  const five=C.pickLineup(squad());
  assert.equal(five.length,5);
  assert.equal(five[0].name,'수문장');
  assert.equal(five[1].name,'철벽');   // 픽소: best defender
  assert.equal(five[4].name,'골잡이'); // 피보: best finisher
  assert.ok(!five.some(p=>p.name==='후보'),'unrated players start on the bench');
});

test('unrated players get neutral defaults instead of breaking the match',()=>{
  const [p]=C.normalizeRoster([card(7,'신입','미정',[null,null,null,null,null,null])]);
  assert.equal(p.rated,false);
  assert.deepEqual(Object.values(p.field),[60,60,60,60,60,60]);
});

test('card stats drive speed, shot accuracy, pass accuracy and tackling',()=>{
  const [slow,fast]=C.normalizeRoster([card(1,'a','CM',[40,40,40,40,40,40]),card(2,'b','CM',[95,95,95,95,95,95])]);
  const a=C.attributes(slow,'ALA'),b=C.attributes(fast,'ALA');
  assert.ok(b.speed>a.speed+2);
  assert.ok(b.shotError<a.shotError/2);
  assert.ok(b.passError<a.passError/2);
  assert.ok(b.tackle>a.tackle&&b.control>a.control&&b.shotPower>a.shotPower);
});

test('club roster is read through the app roster code without writing',()=>{
  const writes=[];
  const storage={getItem:k=>k==='unit-fc-pilot-roster-v1'?JSON.stringify({111:{pos:'GK'}}):k==='unit-fc-club-v1'?JSON.stringify({name:'번개 FC'}):null,setItem:(k)=>writes.push(k)};
  const list=C.clubRoster(storage,PilotRoster,Abilities);
  assert.ok(list.length>=10);
  assert.equal(C.clubName(storage),'번개 FC');
  assert.equal(C.clubName({getItem:()=>null},'흑표범 FC'),'흑표범 FC');
  assert.deepEqual(writes,[]);
});

function run(seed,level='normal',seconds=180){
  const m=C.createMatch({home:C.pickLineup(squad()),away:C.cpuTeam(level,seed),duration:seconds,seed,level});
  let n=0;while(m.phase!=='end'&&n<60*(seconds+120)){C.step(m,1/60,{cpuOnly:true});n++;
    for(const p of C.allPlayers(m)){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));assert.ok(Math.abs(p.x)<=20&&Math.abs(p.z)<=10);}
    assert.ok(Number.isFinite(m.ball.x)&&Math.abs(m.ball.z)<=10&&Math.abs(m.ball.x)<=21);
  }
  return m;
}
test('a full computer-vs-computer match finishes with sane numbers',()=>{
  let goals=0,shots=0,passes=0;
  for(let s=1;s<=6;s++){const m=run(s);assert.equal(m.phase,'end');goals+=m.teams[0].score+m.teams[1].score;shots+=m.stats.shots[0]+m.stats.shots[1];passes+=m.stats.passes[0]+m.stats.passes[1];}
  assert.ok(goals>0&&goals/6<16,`goals per match ${goals/6}`);
  assert.ok(shots/6>4&&passes/6>10);
});

test('human input moves, passes and shoots with the controlled player',()=>{
  const m=C.createMatch({home:C.pickLineup(squad()),away:C.cpuTeam('easy',3),duration:60,seed:3});
  for(let i=0;i<200;i++)C.step(m,1/60,{});
  const me=m.controlled;assert.ok(me&&me.team===0&&me.role!=='GK');
  const x0=me.x;
  for(let i=0;i<30;i++){m.controlled=me;C.step(m,1/60,{moveX:1,moveZ:0,autoSwitch:false});}
  assert.ok(me.x>x0+0.5,'moves toward the opponent goal');
  const passer=m.controlled;m.ball.owner=passer;
  C.step(m,1/60,{pass:true,moveX:0,moveZ:0});
  assert.notEqual(m.ball.owner,passer);assert.equal(m.stats.passes[0],1);
  const shooter=m.controlled;m.ball.owner=shooter;
  C.step(m,1/60,{shoot:true,power:1});
  assert.notEqual(m.ball.owner,shooter);assert.equal(m.stats.shots[0],1);
});

test('game page is standalone, read-only and uses the vendored engine',()=>{
  const html=fs.readFileSync(require.resolve('../dist/futsal.html'),'utf8');
  const game=fs.readFileSync(require.resolve('../dist/futsal/game.js'),'utf8');
  const scene=fs.readFileSync(require.resolve('../dist/futsal/scene.js'),'utf8');
  assert.match(game,/from '\.\/scene\.js/);
  assert.match(scene,/from '\.\.\/vendor\/three\/three\.module\.min\.js'/);
  assert.ok(fs.existsSync(require.resolve('../dist/vendor/three/three.module.min.js')));
  assert.doesNotMatch(game,/method:\s*'(PUT|POST)'/);
  assert.doesNotMatch(game,/setItem/);
  for(const text of [html,game])assert.doesNotMatch(text,/FIFA|EA SPORTS|등번호/i);
  assert.match(fs.readFileSync(require.resolve('../dist/app.js'),'utf8'),/futsal\.html/);
});

test('흑표범 리그 page is its own mode: no vs-computer opponent theme, no writes to club data, no banned wording',()=>{
  const html=fs.readFileSync(require.resolve('../dist/futsal-league.html'),'utf8');
  const league=fs.readFileSync(require.resolve('../dist/futsal/league.js'),'utf8');
  assert.match(html,/흑표범 리그/);
  assert.match(league,/theme:'league'/);
  for(const text of [html,league]){assert.doesNotMatch(text,/레드 FC|FIFA|EA SPORTS|등번호/i);}
  assert.doesNotMatch(league,/api\/shared/,'the league page never touches the club data API');
  const worker=fs.readFileSync(require.resolve('../realtime/src/worker.mjs'),'utf8');
  assert.doesNotMatch(worker,/method:\s*'(PUT|POST|DELETE)'/,'the realtime server only reads the roster');
});
