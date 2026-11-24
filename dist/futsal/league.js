/* 흑표범 리그: online futsal client. The match runs on the server (realtime/src/room-engine.mjs);
   this page shows the lobby, sends this person's controls and draws the server's snapshots.
   Others are drawn 100 ms in the past between two snapshots (smooth); my own player is predicted
   locally from my inputs and corrected toward the server, so my controls answer instantly. */
import {createStage,mobile} from './scene.js?v=3';

const C=window.FutsalCore;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const SERVER=document.querySelector('meta[name="league-server"]')?.content||location.origin;
const TICK=1/60,INTERP=0.1,SEND_MS=33;
const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
const cid=store.get('league-cid')||(()=>{const v=(crypto.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36)).replace(/[^a-z0-9-]/gi,'');store.set('league-cid',v);return v;})();
if(mobile)document.body.classList.add('touch-ui');

/* ---------------- entry ---------------- */
const params=new URLSearchParams(location.search);
let code=(params.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
$('#my-name').value=store.get('league-name')||'';
$('#join-code').value=code;
function myName(){const n=$('#my-name').value.trim().slice(0,12);if(n)store.set('league-name',n);return n;}
function needName(){if(myName())return false;$('#entry-status').textContent='이름을 먼저 적어 주세요.';$('#my-name').focus();return true;}
$('#create').addEventListener('click',async()=>{
  if(needName())return;$('#create').disabled=true;$('#entry-status').textContent='방을 만드는 중…';
  try{const r=await fetch(SERVER+'/api/league/room',{method:'POST'});if(!r.ok)throw Error();code=(await r.json()).code;enterRoom();}
  catch(err){console.error('create room',err);$('#entry-status').textContent='서버에 연결하지 못했어요. 잠시 후 다시 눌러 주세요.';}
  finally{$('#create').disabled=false;}
});
$('#join-form').addEventListener('submit',e=>{e.preventDefault();if(needName())return;const c=$('#join-code').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length!==5){$('#entry-status').textContent='방 코드는 5자리예요.';return;}code=c;enterRoom();});
function enterRoom(){
  const u=new URL(location.href);u.searchParams.set('room',code);window.history.replaceState(null,'',u);
  $('#room-code').textContent=code;$('#entry').hidden=true;$('#room').hidden=false;connect();
  // 흑표범 리그 story (story-scenes.js modes.league) plays over the lobby; kickoff from the server ends it early
  window.FutsalStory?.intro({team:'블랙',opponent:'화이트'},'league');
}

/* ---------------- connection ---------------- */
let ws=null,retry=0,lobby=null,welcome=null,rtt=null;
function connect(){
  const url=SERVER.replace(/^http/,'ws')+'/api/league/room/'+code;
  ws=new WebSocket(url);const sock=ws;
  setConn('연결 중…','');
  sock.onopen=()=>{retry=0;sock.send(JSON.stringify({t:'hello',cid,name:store.get('league-name')||'선수'}));setConn('연결됨','ok');};
  sock.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}onMessage(m);};
  sock.onclose=ev=>{if(sock!==ws)return;if(ev.code===4001){setConn('입장할 수 없어요','bad');return;}setConn('다시 연결하는 중…','bad');setTimeout(connect,Math.min(5000,400*2**retry++));};
}
function send(m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m));}
function setConn(t,k){const c=$('#conn');c.textContent=t;c.className='conn '+k;}
setInterval(()=>send({t:'ping',c:performance.now()}),2000);
function onMessage(m){
  if(m.t==='welcome'){welcome=m;fillCards();}
  else if(m.t==='lobby'){lobby=m;renderLobby();if(m.phase==='lobby'&&(running||!$('#result').hidden))backToRoom();}
  else if(m.t==='kickoff')startMatch(m);
  else if(m.t==='s')onSnapshot(m);
  else if(m.t==='result')showResult(m);
  else if(m.t==='error'){$('#room-status').textContent=m.msg;$('#entry-status').textContent=m.msg;}
  else if(m.t==='pong'){rtt=performance.now()-m.c;const n=$('#net');n.textContent=Math.round(rtt)+'ms';n.className='net'+(rtt>180?' bad':'');}
}

/* ---------------- lobby ---------------- */
function fillCards(){
  const sel=$('#card-pick');const cur=sel.value;
  sel.innerHTML='<option value="">카드 없이 게스트로 (능력치 60)</option>'+welcome.roster.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.pos)}${c.ovr!=null?' · '+c.ovr:''}</option>`).join('');
  sel.value=cur;
}
$('#card-pick').addEventListener('change',e=>send({t:'card',id:e.target.value===''?null:e.target.value}));
function renderLobby(){
  const L=lobby;if(!L)return;const me=L.members.find(m=>m.cid===cid);const isHost=L.host===cid;
  const holder=(t,s)=>L.members.find(m=>m.team===t&&m.slot===s);
  const names=welcome?.teams||['블랙','화이트'];
  $('#pitch-pick').innerHTML=[0,1].map(t=>{
    const filled=L.members.filter(m=>m.team===t).length;
    return `<div class="team-col t${t}"><h3>${esc(names[t])}<small>${filled}명 · AI ${L.size-filled}</small></h3><ol class="seats">`+
      L.roles.map((role,s)=>{const h=holder(t,s);const mine=h&&h.cid===cid;
        return `<li><button type="button" class="seat${h?' taken':''}${mine?' mine':''}${h&&!h.connected?' off':''}" data-team="${t}" data-slot="${s}" ${h&&!mine?'disabled':''}><em>${esc(role)}</em><strong>${h?esc(h.name)+(h.cid===L.host?'<span class="host-badge">방장</span>':''):'AI'}</strong></button></li>`;}).join('')+'</ol></div>';
  }).join('');
  const spect=L.members.filter(m=>m.team===null);
  $('#spectators').innerHTML=spect.length?'자리 고르는 중: '+spect.map(m=>`<b>${esc(m.name)}</b>${m.cid===L.host?'<span class="host-badge">방장</span>':''}`).join(', '):'';
  for(const [id,v] of [['size',L.size],['duration',L.duration]])$('#'+id).querySelectorAll('button').forEach(b=>b.classList.toggle('on',Number(b.dataset.v)===v));
  $('#host-options').classList.toggle('locked',!isHost);
  const seated=L.members.filter(m=>m.team!==null&&m.connected).length;
  $('#kickoff').hidden=!isHost;
  $('#kickoff').disabled=!seated||L.phase==='match';
  const hostName=L.members.find(m=>m.cid===L.host)?.name||'';
  $('#room-status').textContent=L.phase==='match'?'경기가 진행 중이에요. 자리를 고르면 다음 경기부터 함께 뛸 수 있어요.':isHost?(seated?`${seated}명이 자리를 골랐어요. 준비되면 킥오프!`:'자리를 하나 골라야 킥오프할 수 있어요.'):`방장 ${hostName}님이 킥오프하기를 기다리는 중…`;
  if(me&&welcome){const sel=$('#card-pick');const v=me.cardId===null?'':String(me.cardId);if(sel.value!==v)sel.value=v;}
  $('#again').hidden=!isHost;$('#to-room').hidden=!isHost;$('#result-wait').textContent=isHost?'':'방장이 다음 경기를 고르는 중이에요.';
}
document.addEventListener('click',e=>{
  const b=e.target.closest('.seat');if(!b||!lobby)return;
  const t=Number(b.dataset.team),s=Number(b.dataset.slot);
  send(b.classList.contains('mine')?{t:'seat',team:null}:{t:'seat',team:t,slot:s});
});
for(const id of ['size','duration'])$('#'+id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;send({t:'cfg',[id]:Number(b.dataset.v)});});
$('#kickoff').addEventListener('click',()=>{lockLandscape();send({t:'start'});});
$('#again').addEventListener('click',()=>send({t:'start'}));
$('#to-room').addEventListener('click',()=>send({t:'lobby'}));
$('#share').addEventListener('click',async()=>{
  const url=location.origin+location.pathname+'?room='+code,text=`흑표범 리그 풋살 한 판! 방 코드 ${code}`;
  try{if(navigator.share){await navigator.share({title:'흑표범 리그',text,url});return;}}catch{return;}
  try{await navigator.clipboard.writeText(text+'\n'+url);$('#room-status').textContent='초대 링크를 복사했어요. 단톡방에 붙여 넣으세요.';}catch{$('#room-status').textContent=url;}
});

/* ---------------- 3D stage ---------------- */
const stage=createStage({theme:'league',onResize:()=>checkOrientation()});
let world=null,running=false,kick=null,myKey=null,views=new Map();
let snaps=[],offset=null,score=[0,0],clock=0,phase='countdown',ballOwner=-1;
const ball={x:0,y:0.11,z:0,vx:0,vy:0,vz:0};
let pred=null,shown=null; // my predicted / displayed state
function startMatch(k){
  window.FutsalStory?.stop?.();
  kick=k;myKey=k.you;stage.init();const scene=stage.scene;
  if(world){for(const v of world.views)scene.remove(v.root);scene.remove(world.ball.m,world.ball.sh);}
  views=new Map();
  const list=k.players.map(p=>{
    const pl={team:p.team,slot:p.slot,role:p.role,roleLabel:p.label,name:p.name,card:{name:p.name,field:p.field},a:p.a,owner:p.owner,x:0,z:0,vx:0,vz:0,facing:p.team?Math.PI:0,anim:0,dive:0,stun:0,human:false};
    const key=p.team*10+p.slot,mine=key===myKey;
    const v={p:pl,...stage.makePlayer(pl,{kit:p.team?'clubWhite':'club',label:p.owner?{text:p.name,home:p.team===0}:null})};
    if(v.label&&mine)v.label.material.opacity=1;
    views.set(key,v);return v;
  });
  const bm=stage.ballMesh();scene.add(bm.m,bm.sh);scene.add(stage.ring,stage.arrow);
  world={views:list,ball:bm};
  snaps=[];offset=null;score=[0,0];pred=null;shown=null;ballOwner=-1;
  $('#score-home').textContent='0';$('#score-away').textContent='0';
  document.querySelectorAll('.t0').forEach(n=>n.textContent=k.teams[0]);document.querySelectorAll('.t1').forEach(n=>n.textContent=k.teams[1]);
  const me=myKey!==null?views.get(myKey)?.p:null;
  $('#me').innerHTML=me?`<em>${esc(me.roleLabel)} · ${esc(k.teams[me.team])}</em><strong>${esc(me.name)}</strong><span class="stats">${C.FIELD.map(c=>`<span><b>${me.card.field?.[c]??60}</b>${c}</span>`).join('')}</span>`:'<em>관전 중</em><strong>자리 없이 보는 중</strong>';
  $('#touch').hidden=myKey===null;
  $('#entry').hidden=true;$('#room').hidden=true;$('#result').hidden=true;$('#hud').hidden=false;document.body.classList.add('playing');
  stage.updateCamera(0,0,0,true);banner('킥오프 준비',1.6);
  running=true;lockTried=false;last=performance.now();checkOrientation();requestAnimationFrame(frame);
}
function backToRoom(){window.FutsalStory?.stop?.();running=false;checkOrientation();unlockLandscape();$('#hud').hidden=true;$('#result').hidden=true;$('#room').hidden=false;document.body.classList.remove('playing');renderLobby();}
function onSnapshot(s){
  if(!running)return;
  const now=performance.now()/1000,st=s.n*TICK,sample=now-st;
  offset=offset===null||sample<offset?sample:offset+(sample-offset)*0.02; // track the fastest arrival, drift slowly
  snaps.push(s);while(snaps.length>30)snaps.shift();
  clock=s.c;phase=s.ph;ballOwner=s.b[6];
  if(s.sc[0]!==score[0]||s.sc[1]!==score[1]){score=s.sc;$('#score-home').textContent=score[0];$('#score-away').textContent=score[1];}
  for(const e of s.e)onEvent(e);
  if(myKey!==null){
    const i=kick.players.findIndex(p=>p.team*10+p.slot===myKey),row=s.p[i];
    if(row){
      const srv={x:row[0],z:row[1],vx:row[2],vz:row[3],facing:row[4],stun:row[7]};
      if(!pred||phase!=='play'||!row[8]){pred={...srv};}
      else{ // replay inputs the server has not seen yet on top of its answer
        const p={...srv};for(const h of sentLog)if(h.seq>s.a)predictStep(p,h,h.dt);
        pred.x=p.x;pred.z=p.z;pred.vx=p.vx;pred.vz=p.vz;pred.facing=p.facing;pred.stun=p.stun;
      }
      while(sentLog.length&&sentLog[0].seq<=s.a)sentLog.shift();
    }
  }
}
let bannerTimer=0;
function banner(text,sec=1.6,kind=''){const b=$('#banner');b.textContent=text;b.className='banner show '+kind;bannerTimer=sec;}
function myTeam(){return myKey===null?0:Math.floor(myKey/10);}
function onEvent(e){
  const names=kick.teams;
  if(e.type==='goal'){banner(`골! ${e.name||names[e.team]} · ${names[e.team]}`,2.4,e.team===myTeam()?'goal':'concede');buzz(e.team===myTeam()?[60,40,120]:[200]);}
  else if(e.type==='save'||e.type==='catch')banner(`선방 · ${e.name}`,1.2);
  else if(e.type==='tackle'&&e.team===myTeam())banner('태클 성공',0.9);
  else if(e.type==='post')banner('골대 맞음',1);
  else if(e.type==='whistle')banner('',0.01);
}
function buzz(p){try{navigator.vibrate?.(p);}catch{}}
function showResult(r){
  running=false;checkOrientation();
  const [h,a]=r.score||[0,0],t=r.teams||['블랙','화이트'],s=r.stats||{shots:[0,0],passes:[0,0],tackles:[0,0],saves:[0,0]};
  const mine=myTeam(),won=myKey===null?null:(mine?a>h:h>a),draw=h===a;
  $('#result-title').textContent=draw?'무승부':myKey===null?(h>a?t[0]+' 승리':t[1]+' 승리'):won?'승리':'패배';
  $('#final').innerHTML=`<span>${esc(t[0])}</span><b>${h} : ${a}</b><span>${esc(t[1])}</span>`;
  $('#match-stats').innerHTML=[['슈팅',s.shots],['패스',s.passes],['태클 성공',s.tackles],['선방',s.saves]].map(([k,v])=>`<div><dt>${k}</dt><dd><b>${v[0]}</b><i></i><b>${v[1]}</b></dd></div>`).join('');
  $('#scorers').innerHTML=(r.goals||[]).map(g=>`<li class="${g.team?'away':'home'}"><time>${C.formatClock(g.time)}</time>${esc(g.name||t[g.team])}</li>`).join('');
  renderLobby();
  const reveal=()=>{if(!running&&$('#hud').hidden===false)$('#result').hidden=false;};
  // seated players see the win/lose/draw story first (story-scenes.js modes.league), then the result card
  const Story=window.FutsalStory;
  if(Story&&myKey!==null){const mineG=mine?a:h,theirG=mine?h:a;setTimeout(()=>{if(running)return;Story.outro(mineG,theirG,{team:t[mine],opponent:t[1-mine]},'league').then(reveal);},700);}
  else setTimeout(reveal,700);
}

/* ---------------- my controls ---------------- */
const keys=new Set();const input={moveX:0,moveZ:0,sprint:false};let pressPass=false,pressShoot=false,power=0.6;
let shootHeld=null,shootWasTackle=false,stick={id:null,ox:0,oy:0,x:0,y:0};
const carrying=()=>myKey!==null&&ballOwner===myKey;
const doPass=()=>{pressPass=true;flush();};
function downShoot(){if(carrying()){shootHeld=performance.now();shootWasTackle=false;}else{pressShoot=true;shootWasTackle=true;flush();}}
function upShoot(){if(shootHeld!==null&&!shootWasTackle){power=Math.min(1,(performance.now()-shootHeld)/900);pressShoot=true;flush();}shootHeld=null;}
const PASS_KEYS=['KeyS','KeyW','KeyA','KeyJ','Space'],SHOOT_KEYS=['KeyD','KeyK'];
addEventListener('keydown',e=>{
  if(!running)return;const k=e.code;
  if(k.startsWith('Arrow')||PASS_KEYS.includes(k)||SHOOT_KEYS.includes(k)||k==='KeyE')e.preventDefault();
  if(e.repeat)return;keys.add(k);
  if(PASS_KEYS.includes(k))doPass();else if(SHOOT_KEYS.includes(k))downShoot();
});
addEventListener('keyup',e=>{keys.delete(e.code);if(SHOOT_KEYS.includes(e.code))upShoot();});
addEventListener('blur',()=>{keys.clear();shootHeld=null;});
const stickEl=$('#stick'),knob=$('#knob'),touchEl=$('#touch');
touchEl.addEventListener('pointerdown',e=>{
  const btn=e.target.closest('[data-btn]');
  if(btn){e.preventDefault();btn.setPointerCapture(e.pointerId);btn.classList.add('down');const b=btn.dataset.btn;if(b==='pass')doPass();else if(b==='shoot')downShoot();else input.sprint=true;
    const up=()=>{btn.classList.remove('down');if(b==='shoot')upShoot();if(b==='sprint')input.sprint=false;btn.removeEventListener('pointerup',up);btn.removeEventListener('pointercancel',up);};btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);return;}
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
  if(rotateHold){x=0;z=0;}
  input.moveX=x;input.moveZ=z;
  if(keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('KeyE'))input.sprint=true;else if(stick.id===null&&!document.querySelector('[data-btn="sprint"].down'))input.sprint=false;
}
/* inputs go out ~30 times a second (and at once on a pass/shot); each carries a sequence number the server echoes back */
let seq=0,lastSend=0;const sentLog=[];
function flush(){
  if(!running||myKey===null)return;
  seq++;send({t:'in',s:seq,x:+input.moveX.toFixed(2),z:+input.moveZ.toFixed(2),r:input.sprint?1:0,p:pressPass?1:0,k:pressShoot?1:0,w:+power.toFixed(2)});
  pressPass=pressShoot=false;lastSend=performance.now();
}
/* same movement rule as core.js humanUpdate, for my player only */
function predictStep(p,inp,dt){
  const me=views.get(myKey)?.p;if(!me)return;const a=me.a;
  const mx=inp.x,mz=inp.z,ml=Math.min(1,Math.hypot(mx,mz)),carry=ballOwner===myKey;
  const max=a.speed*(inp.r?1.13:0.94)*(carry?a.carry*(inp.r?0.97:1):1)*(p.stun?0.45:1);
  const tvx=ml>0.05?mx/ml*max*ml:0,tvz=ml>0.05?mz/ml*max*ml:0;
  const ax=tvx-p.vx,az=tvz-p.vz,al=Math.hypot(ax,az),maxA=a.accel*dt;
  if(al>maxA){p.vx+=ax/al*maxA;p.vz+=az/al*maxA;}else{p.vx=tvx;p.vz=tvz;}
  if(ml>0.05){let d=Math.atan2(mz,mx)-p.facing;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;const rate=carry?(inp.r?7:11):14;p.facing+=Math.max(-rate*dt,Math.min(rate*dt,d));}
  p.x+=p.vx*dt;p.z+=p.vz*dt;
  if(me.role==='GK'){const dir=me.team?-1:1,line=-20*dir,lo=Math.min(line,line+dir*6),hi=Math.max(line,line+dir*6);p.x=Math.max(lo,Math.min(hi,p.x));p.z=Math.max(-6,Math.min(6,p.z));}
  p.x=Math.max(-19.75,Math.min(19.75,p.x));p.z=Math.max(-9.75,Math.min(9.75,p.z));
}

/* ---------------- loop ---------------- */
let last=0;
const lerp=(a,b,t)=>a+(b-a)*t;
function lerpAng(a,b,t){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return a+d*t;}
function frame(){
  if(!running)return;requestAnimationFrame(frame);
  const now=performance.now(),dt=Math.min(0.1,(now-last)/1000);last=now;
  readMove();
  if(myKey!==null&&phase==='play'&&pred){const h={seq:seq+1,dt,x:input.moveX,z:input.moveZ,r:input.sprint?1:0};sentLog.push(h);if(sentLog.length>240)sentLog.shift();predictStep(pred,h,dt);}
  if(now-lastSend>=SEND_MS)flush();
  interpolate();
  draw(dt);
}
function interpolate(){
  if(!snaps.length||offset===null)return;
  const t=performance.now()/1000-offset-INTERP;
  let a=snaps[0],b=snaps[snaps.length-1];
  for(let i=snaps.length-1;i>0;i--){if(snaps[i-1].n*TICK<=t){a=snaps[i-1];b=snaps[i];break;}}
  const span=(b.n-a.n)*TICK;let f=span>0?(t-a.n*TICK)/span:1;
  let extra=0;if(f>1){extra=Math.min(0.1,(f-1)*span);f=1;}
  kick.players.forEach((p,i)=>{
    const v=views.get(p.team*10+p.slot),pa=a.p[i],pb=b.p[i];if(!v||!pa||!pb)return;const o=v.p;
    o.x=lerp(pa[0],pb[0],f)+pb[2]*extra;o.z=lerp(pa[1],pb[1],f)+pb[3]*extra;o.vx=lerp(pa[2],pb[2],f);o.vz=lerp(pa[3],pb[3],f);
    o.facing=lerpAng(pa[4],pb[4],f);o.anim=pb[5];o.dive=pb[6];o.stun=pb[7];o.human=!!pb[8];
  });
  const ba=a.b,bb=b.b;
  ball.x=lerp(ba[0],bb[0],f)+bb[3]*extra;ball.y=Math.max(0.11,lerp(ba[1],bb[1],f));ball.z=lerp(ba[2],bb[2],f)+bb[5]*extra;ball.vx=bb[3];ball.vz=bb[5];
}
function draw(dt){
  const {ring,arrow}=stage;
  const me=myKey!==null?views.get(myKey):null;
  if(me&&pred){
    // my player: predicted state, eased so server corrections never snap
    shown??={...pred};const k=1-Math.exp(-dt*18);
    shown.x+=(pred.x-shown.x)*k;shown.z+=(pred.z-shown.z)*k;shown.facing=lerpAng(shown.facing,pred.facing,k);
    Object.assign(me.p,{x:shown.x,z:shown.z,vx:pred.vx,vz:pred.vz,facing:shown.facing});
    if(ballOwner===myKey){ball.x=shown.x+Math.cos(shown.facing)*0.55;ball.z=shown.z+Math.sin(shown.facing)*0.55;ball.y=0.11;ball.vx=pred.vx;ball.vz=pred.vz;}
  }
  for(const v of views.values()){const p=v.p;v.root.position.set(p.x,0,p.z);v.root.rotation.y=-p.facing;stage.animate(v,p,ball,dt);}
  if(me){ring.visible=arrow.visible=true;ring.position.set(me.p.x,0.02,me.p.z);arrow.position.set(me.p.x,2.5+Math.sin(performance.now()/180)*0.06,me.p.z);ring.material.color.set(ballOwner===myKey?0xffffff:0xc6f432);}else ring.visible=arrow.visible=false;
  stage.placeBallView(world.ball,ball,dt);
  const fx=me?ball.x*0.7+me.p.x*0.3:ball.x,fz=me?ball.z*0.7+me.p.z*0.3:ball.z;
  stage.updateCamera(fx,fz,dt);stage.render();
  $('#clock').textContent=C.formatClock(clock);
  const carry=carrying();
  document.querySelector('[data-label-pass]').textContent='패스';
  document.querySelector('[data-label-shoot]').textContent=carry?'슛':'태클';
  const pw=$('#power');if(shootHeld!==null&&!shootWasTackle){pw.classList.add('show');pw.firstElementChild.style.width=Math.min(100,(performance.now()-shootHeld)/9)+'%';}else pw.classList.remove('show');
  if(bannerTimer>0){bannerTimer-=dt;if(bannerTimer<=0)$('#banner').classList.remove('show');}
}

/* phones play in landscape: in portrait a rotate prompt covers the screen (the match keeps going on the server) */
let rotateHold=false;
function checkOrientation(){const hold=running&&mobile&&innerWidth<innerHeight;if(hold!==rotateHold){rotateHold=hold;$('#rotate').hidden=!hold;}}
async function lockLandscape(){if(!mobile)return;try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{}try{await screen.orientation?.lock?.('landscape');}catch{}}
function unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}try{if(document.fullscreenElement)document.exitFullscreen();}catch{}}
// joining from an invite: ask for the kick-off landscape lock on the first tap anywhere
let lockTried=false;
document.addEventListener('pointerdown',()=>{if(running&&!lockTried){lockTried=true;lockLandscape();}},{passive:true});

// read-only handle for automated checks
window.__league={get state(){return {running,myKey,phase,score,clock,lobby,pred,ball:{...ball},views:[...views.values()].map(v=>({key:v.p.team*10+v.p.slot,x:v.p.x,z:v.p.z,human:v.p.human}))};}};

if(code&&store.get('league-name'))enterRoom();
window.FutsalLoading?.done?.();
