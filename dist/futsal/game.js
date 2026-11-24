/* 3D futsal prototype: Three.js rendering, input and lobby. Simulation lives in core.js (window.FutsalCore). */
import {createStage,mobile} from './scene.js?v=3';

const C=window.FutsalCore;
const $=s=>document.querySelector(s);
const OPPONENT='레드 FC';

/* ---------------- data (read-only) ---------------- */
let roster=[],teamName='흑표범 FC',lineup=[],bench=[],selected=null;
const settings={level:'normal',duration:240,kit:'rivalHome'};
async function loadData(){
  const status=$('#lobby-status');let data=null,offline=false;
  try{
    const r=await fetch('/api/shared?fresh='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error();const json=await r.json();data=json.data||{};
  }catch{offline=true;data={};for(const k of ['unit-fc-club-v1','unit-fc-pilot-roster-v1']){try{const v=localStorage.getItem(k);if(v!==null)data[k]=v;}catch{}}}
  const storage={getItem:k=>Object.hasOwn(data,k)?data[k]:null};
  teamName=C.clubName(storage,'흑표범 FC');
  roster=C.normalizeRoster(C.clubRoster(storage,window.PilotRoster,window.Abilities));
  if(roster.length<5){
    const fill=['선수 A','선수 B','선수 C','선수 D','선수 E'].slice(0,5-roster.length).map((name,i)=>({id:'fill'+i,name,pos:'미정',stats:[]}));
    roster=roster.concat(C.normalizeRoster(fill));
  }
  lineup=C.pickLineup(roster);bench=roster.filter(p=>!lineup.includes(p));
  document.querySelectorAll('[data-team-name]').forEach(n=>n.textContent=teamName);
  document.querySelectorAll('[data-opp-name]').forEach(n=>n.textContent=OPPONENT);
  document.title=`${teamName} 풋살 매치`;
  const unrated=roster.filter(p=>!p.rated).length;
  status.textContent=(offline?'서버에 연결하지 못해 이 기기에 저장된 정보로 시작합니다. ':'')+`선수 ${roster.length}명을 불러왔어요.`+(unrated?` 능력치가 아직 없는 ${unrated}명은 기본값 60으로 뜁니다.`:'');
  renderLineup();$('#start').disabled=false;
}

/* ---------------- lobby ---------------- */
function statRow(p,gk){const src=gk?p.keeper:p.field;return (gk?C.KEEPER.slice(0,4):C.FIELD).map(c=>`<span><b>${src[c]}</b>${c}</span>`).join('');}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function renderLineup(){
  $('#lineup').innerHTML=lineup.map((p,i)=>`<li><button type="button" class="slot${selected?.list==='lineup'&&selected.i===i?' sel':''}" data-list="lineup" data-i="${i}"><em>${C.ROLES[i].label}</em><strong>${esc(p.name)}</strong><span class="ovr">${p.ovr??'-'}</span><span class="stats">${statRow(p,i===0)}</span></button></li>`).join('');
  $('#bench').innerHTML=bench.length?bench.map((p,i)=>`<li><button type="button" class="slot small${selected?.list==='bench'&&selected.i===i?' sel':''}" data-list="bench" data-i="${i}"><strong>${esc(p.name)}</strong><span class="ovr">${p.ovr??'-'}</span></button></li>`).join(''):'<li class="empty">교체 선수 없음</li>';
}
document.addEventListener('click',e=>{
  const b=e.target.closest('.slot');if(!b)return;
  const pick={list:b.dataset.list,i:Number(b.dataset.i)};
  if(!selected){selected=pick;renderLineup();return;}
  if(selected.list===pick.list&&selected.i===pick.i){selected=null;renderLineup();return;}
  const lists={lineup,bench};
  if(selected.list==='bench'&&pick.list==='bench'){selected=pick;renderLineup();return;}
  const a=lists[selected.list],bb=lists[pick.list];[a[selected.i],bb[pick.i]]=[bb[pick.i],a[selected.i]];
  selected=null;renderLineup();
});
for(const id of ['level','duration','kit'])$('#'+id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('#'+id).querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));settings[id]=id==='duration'?Number(b.dataset.v):b.dataset.v;});
$('#start').addEventListener('click',()=>{lockLandscape();startMatch();});

/* ---------------- three.js scene (shared with the online page: scene.js) ---------------- */
let world=null;
const stage=createStage({onResize:()=>checkOrientation()});
if(mobile)document.body.classList.add('touch-ui');
const initRenderer=()=>stage.init();
/* the match vs the computer is landscape only: in portrait the sim holds and a rotate prompt covers the screen */
let rotateHold=false;
function checkOrientation(){
  const port=innerWidth<innerHeight,hold=running&&port;
  if(hold!==rotateHold){rotateHold=hold;$('#rotate').hidden=!hold;if(!hold)last=performance.now();for(const k of Object.keys(input))if(typeof input[k]==='boolean')input[k]=false;}
}
async function lockLandscape(){
  if(!mobile)return;
  try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{}
  try{await screen.orientation?.lock?.('landscape');}catch{}
}
function unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}try{if(document.fullscreenElement)document.exitFullscreen();}catch{}}

/* ---------------- match ---------------- */
let match=null,running=false,paused=false,acc=0,last=0,goals=[];
function startMatch(){
  initRenderer();
  const scene=stage.scene,{ring,arrow}=stage;
  if(world){for(const v of world.views)scene.remove(v.root);scene.remove(world.ball.m,world.ball.sh);}
  const seed=(Date.now()%100000)+1;
  match=C.createMatch({home:lineup,away:C.cpuTeam(settings.level,seed),homeName:teamName,awayName:OPPONENT,duration:settings.duration,level:settings.level,seed});
  const views=C.allPlayers(match).map(p=>({p,...stage.makePlayer(p,{kit:p.team?settings.kit:'club',label:p.team===0?{text:p.name,home:true}:null})}));
  const ball=stage.ballMesh();scene.add(ball.m,ball.sh);scene.add(ring,arrow);
  world={views,ball};goals=[];
  $('#lobby').hidden=true;$('#result').hidden=true;$('#pause-menu').hidden=true;$('#hud').hidden=false;
  document.body.classList.add('playing');
  stage.updateCamera(0,0,0,true);banner('킥오프 준비',1.8);
  running=true;paused=false;acc=0;last=performance.now();checkOrientation();requestAnimationFrame(frame);
}
let bannerTimer=0;
function banner(text,sec=1.6,kind=''){const b=$('#banner');b.textContent=text;b.className='banner show '+kind;bannerTimer=sec;}
function onEvent(e){
  const t=match.teams;
  if(e.type==='goal'){goals.push({team:e.team,name:e.name,time:match.duration-match.clock});banner(e.team===0?`골! ${e.name||teamName}`:`실점 · ${OPPONENT} 득점`,2.4,e.team===0?'goal':'concede');$('#score-home').textContent=t[0].score;$('#score-away').textContent=t[1].score;buzz(e.team===0?[60,40,120]:[200]);}
  else if(e.type==='save'||e.type==='catch'){if(e.team===0)banner(`선방 · ${e.name}`,1.2);else banner('상대 골레이로 선방',1.1);}
  else if(e.type==='tackle'&&e.team===0)banner('태클 성공',0.9);
  else if(e.type==='post')banner('골대 맞음',1);
  else if(e.type==='whistle')banner('',0.01);
  else if(e.type==='end')finish();
}
function buzz(p){try{navigator.vibrate?.(p);}catch{}}

/* ---------------- input ---------------- */
const keys=new Set();const input={moveX:0,moveZ:0,sprint:false,pass:false,shoot:false,power:0.6};
let shootHeld=null,shootWasTackle=false,stick={id:null,ox:0,oy:0,x:0,y:0};
const carrying=()=>match&&match.ball.owner&&match.ball.owner===match.controlled;
function pressPass(){input.pass=true;}
function pressShoot(){if(carrying()){shootHeld=performance.now();shootWasTackle=false;}else{input.shoot=true;shootWasTackle=true;}}
function releaseShoot(){if(shootHeld!==null&&!shootWasTackle){input.power=Math.min(1,(performance.now()-shootHeld)/900);input.shoot=true;}shootHeld=null;}
/* Football-game style keys (the requested layout). e.code is the physical key, so it works with the Korean IME on (e.key would be ㄴ, ㅇ ...).
   Arrows move · S/W/A pass (switch player when defending) · D shoot, hold for power (tackle when defending)
   · E or Shift sprint · Q switch player · P/Esc pause */
const PASS_KEYS=['KeyS','KeyW','KeyA','KeyJ'],SHOOT_KEYS=['KeyD','KeyK'];
addEventListener('keydown',e=>{
  if(!running)return;const k=e.code;
  if(k.startsWith('Arrow')||k==='Space'||PASS_KEYS.includes(k)||SHOOT_KEYS.includes(k)||k==='KeyQ'||k==='KeyE')e.preventDefault();
  if(e.repeat)return;keys.add(k);
  if(PASS_KEYS.includes(k)||k==='Space')pressPass();
  else if(SHOOT_KEYS.includes(k))pressShoot();
  else if(k==='KeyQ'){if(!carrying())pressPass();}
  else if(k==='KeyP'||k==='Escape')togglePause();
});
addEventListener('keyup',e=>{const k=e.code;keys.delete(k);if(SHOOT_KEYS.includes(k))releaseShoot();});
addEventListener('blur',()=>{keys.clear();shootHeld=null;});
const stickEl=$('#stick'),knob=$('#knob'),touchEl=$('#touch');
touchEl.addEventListener('pointerdown',e=>{
  const btn=e.target.closest('[data-btn]');
  if(btn){e.preventDefault();btn.setPointerCapture(e.pointerId);btn.classList.add('down');const b=btn.dataset.btn;if(b==='pass')pressPass();else if(b==='shoot')pressShoot();else input.sprint=true;
    const up=()=>{btn.classList.remove('down');if(b==='shoot')releaseShoot();if(b==='sprint')input.sprint=false;btn.removeEventListener('pointerup',up);btn.removeEventListener('pointercancel',up);};btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);return;}
  if(e.clientX>innerWidth*0.5||stick.id!==null)return;
  e.preventDefault();stick={id:e.pointerId,ox:e.clientX,oy:e.clientY,x:0,y:0};touchEl.setPointerCapture(e.pointerId);
  stickEl.style.left=e.clientX+'px';stickEl.style.top=e.clientY+'px';stickEl.classList.add('active');knob.style.transform='translate(-50%,-50%)';
});
touchEl.addEventListener('pointermove',e=>{if(e.pointerId!==stick.id)return;let dx=e.clientX-stick.ox,dy=e.clientY-stick.oy;const l=Math.hypot(dx,dy),R=52;if(l>R){dx*=R/l;dy*=R/l;}stick.x=dx/R;stick.y=dy/R;knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;});
const endStick=e=>{if(e.pointerId!==stick.id)return;stick={id:null,ox:0,oy:0,x:0,y:0};stickEl.classList.remove('active');knob.style.transform='translate(-50%,-50%)';};
touchEl.addEventListener('pointerup',endStick);touchEl.addEventListener('pointercancel',endStick);
document.addEventListener('gesturestart',e=>e.preventDefault());
function readMove(){
  let x=0,z=0;if(keys.has('ArrowLeft'))x-=1;if(keys.has('ArrowRight'))x+=1;if(keys.has('ArrowUp'))z-=1;if(keys.has('ArrowDown'))z+=1;
  if(stick.id!==null){x=stick.x;z=stick.y;if(Math.hypot(x,z)<0.18){x=0;z=0;}}
  const l=Math.hypot(x,z);if(l>1){x/=l;z/=l;}
  // portrait view looks down the pitch toward the opponent goal: screen up = attack direction
  if(stage.camera&&stage.camera.aspect<1){input.moveX=-z;input.moveZ=x;}else{input.moveX=x;input.moveZ=z;}
  if(keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('KeyE'))input.sprint=true;else if(stick.id===null&&!document.querySelector('[data-btn="sprint"].down'))input.sprint=false;
}

/* ---------------- loop ---------------- */
function frame(){const now=performance.now();
  if(!running)return;requestAnimationFrame(frame);
  const dt=Math.min(0.1,(now-last)/1000);last=now;
  if(!paused&&!rotateHold){
    acc+=dt;readMove();let steps=0;
    while(acc>=1/60&&steps<5){C.step(match,1/60,input);for(const e of match.events)onEvent(e);input.pass=false;input.shoot=false;acc-=1/60;steps++;if(!running)break;}
    if(steps===5)acc=0;
  }
  draw(dt);
}
function draw(dt){
  const m=match,b=m.ball,{ring,arrow}=stage;
  for(const v of world.views){
    const p=v.p;v.root.position.set(p.x,0,p.z);v.root.rotation.y=-p.facing;
    stage.animate(v,p,b,dt);
    if(v.label)v.label.material.opacity=p===m.controlled?1:0.72;
  }
  const c=m.controlled;
  if(c){ring.visible=arrow.visible=true;ring.position.set(c.x,0.02,c.z);arrow.position.set(c.x,2.5+Math.sin(performance.now()/180)*0.06,c.z);ring.material.color.set(b.owner===c?0xffffff:0xc6f432);}else ring.visible=arrow.visible=false;
  stage.placeBallView(world.ball,b,dt);
  // camera: broadcast view that follows the ball
  stage.updateCamera(b.x,b.z,dt);
  stage.render();
  // HUD
  $('#clock').textContent=C.formatClock(m.clock);
  const carry=b.owner&&b.owner===c;
  document.querySelector('[data-label-pass]').textContent=carry?'패스':'전환';
  document.querySelector('[data-label-shoot]').textContent=carry?'슛':'태클';
  const pw=$('#power');if(shootHeld!==null&&!shootWasTackle){pw.classList.add('show');pw.firstElementChild.style.width=Math.min(100,(performance.now()-shootHeld)/9)+'%';}else pw.classList.remove('show');
  if(c&&c!==drawMe.last){drawMe.last=c;$('#me').innerHTML=`<em>${c.roleLabel}</em><strong>${esc(c.name)}</strong><span class="stats">${C.FIELD.map(k=>`<span><b>${c.card.field[k]}</b>${k}</span>`).join('')}</span>`;}
  if(bannerTimer>0){bannerTimer-=dt;if(bannerTimer<=0)$('#banner').classList.remove('show');}
}
const drawMe={last:null};

function togglePause(force){if(!running)return;paused=force??!paused;$('#pause-menu').hidden=!paused;if(!paused){last=performance.now();}}
$('#pause').addEventListener('click',()=>togglePause(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)togglePause(true);});
function finish(){
  running=false;checkOrientation();const t=match.teams,s=match.stats;
  const [h,a]=[t[0].score,t[1].score];
  $('#result-title').textContent=h>a?'승리':h<a?'패배':'무승부';
  $('#final').innerHTML=`<span>${esc(teamName)}</span><b>${h} : ${a}</b><span>${OPPONENT}</span>`;
  $('#match-stats').innerHTML=[['슈팅',s.shots],['패스',s.passes],['태클 성공',s.tackles],['선방',s.saves]].map(([k,v])=>`<div><dt>${k}</dt><dd><b>${v[0]}</b><i></i><b>${v[1]}</b></dd></div>`).join('');
  $('#scorers').innerHTML=goals.map(g=>`<li class="${g.team?'away':'home'}"><time>${C.formatClock(g.time)}</time>${g.team?OPPONENT:esc(g.name||teamName)}</li>`).join('');
  setTimeout(()=>{$('#result').hidden=false;},900);
}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-act]');if(!a)return;const act=a.dataset.act;
  if(act==='resume')togglePause(false);
  else if(act==='restart'){startMatch();}
  else if(act==='lobby'){running=false;paused=false;checkOrientation();unlockLandscape();$('#pause-menu').hidden=true;$('#result').hidden=true;$('#hud').hidden=true;$('#lobby').hidden=false;document.body.classList.remove('playing');}
});
// expose a read-only handle for automated checks
window.__futsal={get match(){return match;},get renderer(){return stage.renderer;},start:()=>startMatch()};
loadData();
