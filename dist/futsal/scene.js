/* Shared 3D stage for the futsal pages: renderer, floodlit court, night stadium, player and ball meshes,
   limb animation and the broadcast camera. No game rules here: the vs-computer page (game.js) and the online
   page (online.js) feed it player/ball states each frame. */
import * as THREE from '../vendor/three/three.module.min.js';
import {createCharacters,makeEnvironment,buildFor,SKIN,HAIR} from './characters.js?v=4';
export {THREE};

export const BALL_R=0.22; // drawn bigger than the 0.11 physics radius so it reads on a phone; core.js unchanged
export const mobile=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;

/* opts.onResize(portrait) runs after every resize; opts.mount is the element that receives the canvas */
export function createStage(opts={}){
const stage={THREE,mobile,init,resize,makePlayer,ballMesh,animate,placeBallView,updateCamera,render,ring:null,arrow:null};
let renderer,scene,camera,sun=null,characters=null;
function init(){
  if(renderer)return stage;
  const dpr=Math.min(window.devicePixelRatio||1,mobile?1.5:1.75);
  renderer=new THREE.WebGLRenderer({antialias:dpr<1.6,powerPreference:'high-performance'});
  renderer.setPixelRatio(dpr);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  (opts.mount||document.getElementById('stage')).appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color(NIGHT);scene.fog=new THREE.Fog(NIGHT,55,140);
  camera=new THREE.PerspectiveCamera(42,1,0.5,260);
  scene.environment=makeEnvironment(THREE,renderer);scene.environmentIntensity=0.55;
  scene.add(new THREE.HemisphereLight(0xc9d6ff,0x1a2420,0.38));
  sun=new THREE.DirectionalLight(0xf2f5ff,2.6);sun.position.set(-6,18,10);sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);const sc=sun.shadow.camera;sc.left=-12;sc.right=12;sc.top=12;sc.bottom=-12;sc.near=1;sc.far=50;sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.02;
  scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(0xffd9a8,0.9);rim.position.set(6,8,-14);scene.add(rim);
  buildArena();resize();addEventListener('resize',resize);
  stage.renderer=renderer;stage.scene=scene;stage.camera=camera;return stage;
}
function resize(){if(!renderer)return;const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();document.body.classList.toggle('portrait',w<h);placeBackdrop(w<h);opts.onResize?.(w<h);}

function courtTexture(){
  const W=2048,H=1024,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const sx=W/40,sz=H/20,X=x=>(x+20)*sx,Z=z=>(z+10)*sz;
  // floodlit grass: mown stripes plus fine blade noise
  g.fillStyle='#245a20';g.fillRect(0,0,W,H);
  for(let i=0;i<12;i++){g.fillStyle=i%2?'#28621f':'#215219';g.fillRect(i*W/12,0,W/12,H);}
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<70000;i++){const v=rnd();g.fillStyle=v<0.5?'rgba(14,40,12,.16)':'rgba(150,200,110,.10)';g.fillRect(rnd()*W,rnd()*H,1.5,2.5+rnd()*2);}
  const vg=g.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,W*0.62);vg.addColorStop(0,'rgba(255,250,225,.06)');vg.addColorStop(1,'rgba(0,0,0,.22)');g.fillStyle=vg;g.fillRect(0,0,W,H);
  g.strokeStyle='#eef5ea';g.lineWidth=7;g.strokeRect(4,4,W-8,H-8);
  g.beginPath();g.moveTo(X(0),0);g.lineTo(X(0),H);g.stroke();
  g.beginPath();g.arc(X(0),Z(0),3*sx,0,Math.PI*2);g.stroke();
  g.fillStyle='#eef5ea';g.beginPath();g.arc(X(0),Z(0),8,0,Math.PI*2);g.fill();
  for(const s of [-1,1]){
    const gx=X(20*s),r=6*sx,inward=s<0?0:Math.PI;
    g.beginPath();g.arc(gx,Z(-1.5),r,-Math.PI/2,inward,s>0);g.stroke();
    g.beginPath();g.moveTo(X(20*s-6*s),Z(-1.5));g.lineTo(X(20*s-6*s),Z(1.5));g.stroke();
    g.beginPath();g.arc(gx,Z(1.5),r,inward,Math.PI/2,s>0);g.stroke();
    for(const d of [6,10]){g.beginPath();g.arc(X(20*s-d*s),Z(0),7,0,Math.PI*2);g.fill();}
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const img=new Image();img.onload=()=>{g.save();g.globalAlpha=0.22;const r=2.6*sx;g.drawImage(img,X(0)-r,Z(0)-r,r*2,r*2);g.restore();tex.needsUpdate=true;};img.src='assets/team-emblem.png';
  return tex;
}
function netLines(w,h,step,place){const pts=[];for(let a=0;a<=w+1e-6;a+=step)pts.push(place(a,0),place(a,h));for(let b=0;b<=h+1e-6;b+=step)pts.push(place(0,b),place(w,b));return pts;}
function buildArena(){
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,34),new THREE.MeshStandardMaterial({color:0x2a2d2c,roughness:0.85}));floor.receiveShadow=true;floor.rotation.x=-Math.PI/2;floor.position.y=-0.01;scene.add(floor);
  const court=new THREE.Mesh(new THREE.PlaneGeometry(40,20),new THREE.MeshStandardMaterial({map:courtTexture(),roughness:0.95}));court.receiveShadow=true;court.rotation.x=-Math.PI/2;scene.add(court);
  const boardMat=new THREE.MeshStandardMaterial({color:0x0e110f}),stripe=new THREE.MeshBasicMaterial({color:0xc6f432});
  const board=(w,x,z,rot)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,0.7,0.15),boardMat);b.position.set(x,0.35,z);b.rotation.y=rot;scene.add(b);const s=new THREE.Mesh(new THREE.BoxGeometry(w,0.06,0.16),stripe);s.position.set(x,0.6,z);s.rotation.y=rot;scene.add(s);};
  board(44,0,-11.4,0);board(44,0,11.4,0);board(22.8,-22,0,Math.PI/2);board(22.8,22,0,Math.PI/2);
  buildPlaza();
  const postMat=new THREE.MeshStandardMaterial({color:0xf5f5f0,roughness:0.3,metalness:0.2}),netMat=new THREE.LineBasicMaterial({color:0xdfe7dc,transparent:true,opacity:0.45});
  for(const s of [-1,1]){
    const g=new THREE.Group();const x=20*s;
    const post=()=>new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2,8),postMat);
    for(const z of [-1.5,1.5]){const p=post();p.position.set(x,1,z);g.add(p);}
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,3.1,8),postMat);bar.rotation.x=Math.PI/2;bar.position.set(x,2,0);g.add(bar);
    const d=1*s,pts=[];
    pts.push(...netLines(3,2,0.25,(a,b)=>new THREE.Vector3(x+d,b,a-1.5)));
    pts.push(...netLines(1,3,0.25,(a,b)=>new THREE.Vector3(x+a*s,2,b-1.5)));
    for(const z of [-1.5,1.5])pts.push(...netLines(1,2,0.25,(a,b)=>new THREE.Vector3(x+a*s,b,z)));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),netMat));scene.add(g);
  }
}

/* ---------------- night stadium: floodlights, end walls, stands ---------------- */
const NIGHT=0x080b14;
let backdrop=null;
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(0.18,'rgba(255,250,235,.75)');r.addColorStop(0.5,'rgba(255,240,210,.16)');r.addColorStop(1,'rgba(255,240,210,0)');g.fillStyle=r;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function buildPlaza(){
  const FZ=-13.2;
  // dark ground around the court
  const plaza=new THREE.Mesh(new THREE.PlaneGeometry(67,51),new THREE.MeshStandardMaterial({color:0x1d2024,roughness:0.95}));plaza.rotation.x=-Math.PI/2;plaza.position.y=-0.03;plaza.receiveShadow=true;scene.add(plaza);
  // low end walls behind each goal
  const wallMat=new THREE.MeshStandardMaterial({color:0x202428,roughness:0.8});
  for(const s of [-1,1]){const w=new THREE.Mesh(new THREE.BoxGeometry(0.4,1.2,27),wallMat);w.position.set(s*25,0.6,0);scene.add(w);}
  // floodlight towers: two behind the far corners, two behind the camera light the near side
  const glow=glowTexture(),poleMat=new THREE.MeshStandardMaterial({color:0x2e3237,metalness:0.6,roughness:0.5}),lampMat=new THREE.MeshBasicMaterial({color:0xe9ece4,fog:false}),lampGeo=new THREE.CircleGeometry(0.27,12);
  const haloMat=new THREE.SpriteMaterial({map:glow,color:0xfff3da,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  const hazeMat=new THREE.SpriteMaterial({map:glow,color:0xffe6bd,transparent:true,opacity:0.22,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  for(const [x,z,H] of [[-21,-18.5,8.2],[21,-18.5,8.2],[-27,16,15],[27,16,15]]){
    const g=new THREE.Group();g.position.set(x,0,z);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.24,H,8),poleMat);pole.position.y=H/2;g.add(pole);
    const head=new THREE.Group();head.position.y=H+0.5;head.rotation.order='YXZ';head.rotation.y=Math.atan2(-x,-z);head.rotation.x=0.38;g.add(head);
    head.add(new THREE.Mesh(new THREE.BoxGeometry(3,1.7,0.35),poleMat));
    for(let i=0;i<8;i++){const l=new THREE.Mesh(lampGeo,lampMat);l.position.set(-1.05+(i%4)*0.7,i<4?0.37:-0.37,0.18);head.add(l);}
    const halo=new THREE.Sprite(haloMat);halo.scale.set(5,5,1);head.add(halo);halo.position.z=0.4;
    const haze=new THREE.Sprite(hazeMat);haze.scale.set(20,20,1);head.add(haze);haze.position.z=0.6;
    scene.add(g);
  }
  buildStands(glow,poleMat);
}
/* 흑표범 리그: a club stadium — stands with a crowd, LED boards and the emblem */
function buildStands(glow,poleMat){
  const standMat=new THREE.MeshStandardMaterial({color:0x15181a,roughness:0.9}),seatMat=new THREE.MeshStandardMaterial({color:0x202329,roughness:0.8});
  const L=50,rows=9,crowdCols=[0x202329,0xb6ff28,0xeef0ea,0x2c3036,0x9adf20,0x3a3f46];
  const per=Math.round(L/0.55),total=rows*per*2;
  const crowd=new THREE.InstancedMesh(new THREE.BoxGeometry(0.34,0.5,0.3),new THREE.MeshLambertMaterial(),total);
  const m4=new THREE.Matrix4(),c=new THREE.Color();let n=0,seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(const side of [-1,1]){
    if(side>0)continue; // only the far side: the near stand would block the broadcast camera
    for(let r=0;r<rows;r++){
      const z=-13.6-r*0.9,y=0.35+r*0.55;
      const step=new THREE.Mesh(new THREE.BoxGeometry(L,0.55,0.9),r%2?standMat:seatMat);step.position.set(0,y-0.27,z);step.receiveShadow=true;scene.add(step);
      for(let i=0;i<per;i++){if(rnd()<0.18)continue;m4.makeTranslation(-L/2+i*0.55+rnd()*0.12,y+0.25,z+0.05);crowd.setMatrixAt(n,m4);c.setHex(crowdCols[Math.floor(rnd()*crowdCols.length)]);crowd.setColorAt(n,c);n++;}
    }
  }
  crowd.count=n;scene.add(crowd);
  // back wall with the club emblem and name strip
  const wall=new THREE.Mesh(new THREE.BoxGeometry(L+4,6,0.4),standMat);wall.position.set(0,3+rows*0.55-1,-14-rows*0.9);scene.add(wall);
  const em=new THREE.TextureLoader().load('assets/team-emblem.png');em.colorSpace=THREE.SRGBColorSpace;
  const emblem=new THREE.Mesh(new THREE.PlaneGeometry(4.4,4.4),new THREE.MeshBasicMaterial({map:em,transparent:true,fog:false,toneMapped:false}));emblem.position.set(0,rows*0.55+3.4,-13.75-rows*0.9);scene.add(emblem);
  // LED advertising boards along the far touchline, club lime on black
  const cv=document.createElement('canvas');cv.width=1024;cv.height=64;const g=cv.getContext('2d');
  const paint=()=>{g.fillStyle='#0b0f0c';g.fillRect(0,0,1024,64);g.font='900 34px "Noto Sans KR",sans-serif';g.textBaseline='middle';g.fillStyle='#c6f432';
    const text=(opts.boardText||'흑표범 리그'),w=g.measureText(text).width+60;for(let x=20;x<1024;x+=w){g.fillText(text,x,34);g.fillRect(x+w-38,30,8,8);}led.needsUpdate=true;};
  const led=new THREE.CanvasTexture(cv);led.colorSpace=THREE.SRGBColorSpace;led.wrapS=THREE.RepeatWrapping;led.repeat.set(4,1);
  paint();document.fonts?.load('900 34px "Noto Sans KR"','흑표범').then(paint,()=>{});
  const board=new THREE.Mesh(new THREE.BoxGeometry(46,0.8,0.2),[standMat,standMat,standMat,standMat,new THREE.MeshBasicMaterial({map:led,toneMapped:false}),standMat]);board.position.set(0,0.45,-12.6);scene.add(board);
  stage.ledTexture=led;
  const warmMat=new THREE.SpriteMaterial({map:glow,color:0xc6f432,transparent:true,opacity:0.18,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  for(let x=-20;x<=20.01;x+=10){const sp=new THREE.Sprite(warmMat);sp.scale.set(9,3,1);sp.position.set(x,0.6,-12.4);scene.add(sp);}
}
function placeBackdrop(portrait){
  if(!backdrop)return;const h=backdrop.userData.h;
  if(portrait){const k=0.5;backdrop.scale.setScalar(k);backdrop.position.set(36,h*k/2-4,0);backdrop.rotation.set(0,-Math.PI/2,0);}
  else{backdrop.scale.setScalar(1);backdrop.position.set(0,h/2-11.5,-26);backdrop.rotation.set(0,0,0);}
}

/* low-poly player */
const geo={
  shadow:new THREE.CircleGeometry(0.42,14).rotateX(-Math.PI/2),
  ring:new THREE.RingGeometry(0.5,0.62,24).rotateX(-Math.PI/2),
  arrow:new THREE.ConeGeometry(0.16,0.3,4).rotateX(Math.PI)
};
const shadowMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.32,depthWrite:false});
const softShadow=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.16,depthWrite:false});
function nameSprite(text,home){
  const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
  g.font='800 34px "Noto Sans KR",sans-serif';const w=Math.min(240,g.measureText(text).width+28);
  g.fillStyle=home?'rgba(12,16,13,.78)':'rgba(48,50,28,.82)';g.beginPath();g.roundRect((256-w)/2,10,w,44,10);g.fill();
  g.fillStyle=home?'#c6f432':'#f6e9cf';g.textAlign='center';g.textBaseline='middle';g.fillText(text,128,33);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(1.7,0.42,1);s.position.y=2.15;s.renderOrder=5;return s;
}
function makePlayer(pl,{kit='club',label=null}={}){
  characters??=createCharacters(THREE,{shadows:true});
  const gk=pl.role==='GK',seed=(pl.slot*7+pl.team*3+(pl.card?.name?.length||0))%5;
  const ch=characters.build({kit,gk,body:buildFor(pl.card?.field),skin:SKIN[seed],hair:HAIR[seed%HAIR.length]});
  const sh=new THREE.Mesh(geo.shadow,shadowMat);sh.position.y=0.012;sh.scale.setScalar(0.8);sh.material=softShadow;ch.root.add(sh);
  let tag=null;if(label){tag=nameSprite(label.text,label.home!==false);tag.position.y=ch.height+0.3;ch.root.add(tag);}
  scene.add(ch.root);
  return {root:ch.root,body:ch.body,limbs:ch.limbs,label:tag,phase:Math.random()*6};
}
const ring=new THREE.Mesh(geo.ring,new THREE.MeshBasicMaterial({color:0xc6f432,transparent:true,opacity:0.9,depthWrite:false}));ring.position.y=0.02;
const arrow=new THREE.Mesh(geo.arrow,new THREE.MeshBasicMaterial({color:0xc6f432}));
function ballMesh(){
  const c=document.createElement('canvas');c.width=128;c.height=64;const g=c.getContext('2d');g.fillStyle='#f7f7f2';g.fillRect(0,0,128,64);
  g.fillStyle='#14171a';for(const [x,y] of [[16,16],[56,12],[96,18],[36,44],[78,46],[118,44]]){g.beginPath();for(let k=0;k<5;k++){const a=k/5*Math.PI*2-Math.PI/2;g.lineTo(x+Math.cos(a)*8,y+Math.sin(a)*8);}g.fill();}
  g.fillStyle='#c6f432';g.fillRect(0,30,128,4);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.SphereGeometry(BALL_R,22,16),new THREE.MeshStandardMaterial({map:t,roughness:0.45}));m.castShadow=true;
  const sh=new THREE.Mesh(new THREE.CircleGeometry(BALL_R*1.05,14).rotateX(-Math.PI/2),shadowMat);
  return {m,sh};
}

stage.ring=ring;stage.arrow=arrow;
const BALL_PHYS_R=0.11;
/* ball mesh + ground shadow at a sim ball state {x,y,z,vx,vz} */
const spinAxis=new THREE.Vector3();
function placeBallView(view,b,dt){
  view.m.position.set(b.x,b.y-BALL_PHYS_R+BALL_R+0.01,b.z);view.sh.position.set(b.x,0.013,b.z);view.sh.scale.setScalar(Math.max(0.4,1-b.y*0.25));
  const sp=Math.hypot(b.vx,b.vz);if(sp>0.05){spinAxis.set(b.vz,0,-b.vx).normalize();view.m.rotateOnWorldAxis(spinAxis,sp*dt/BALL_R);}
}
/* broadcast camera that follows a point (normally the ball) */
let camX=0,camZ=0;const look=new THREE.Vector3();
function updateCamera(fx,fz,dt,snap=false){
  const aspect=camera.aspect,portrait=aspect<1;
  const tx=THREE.MathUtils.clamp(fx,portrait?-14:-9,portrait?12:9),tz=THREE.MathUtils.clamp(fz,-6,6);
  const k=snap?1:1-Math.exp(-dt*3.2);camX+=(tx-camX)*k;camZ+=(tz-camZ)*k;
  if(portrait){const far=aspect<0.6?1:0.85;camera.fov=52;camera.position.set(camX-17*far,17*far,camZ*0.35);look.set(camX+7,0,camZ*0.35);}
  else{camera.fov=40;const far=aspect<1.5?1.18:0.95;camera.position.set(camX*0.85,8.8*far,21*far+camZ*0.3);look.set(camX,0,camZ*0.3-8);}
  camera.updateProjectionMatrix();camera.lookAt(look);
  if(sun){sun.target.position.set(camX,0,0);sun.position.set(camX-6,18,10);}
}
function render(){renderer.render(scene,camera);}
/* limb poses: targets are computed from the sim state, then eased so nothing snaps */
function animate(v,p,b,dt){
  const sp=Math.hypot(p.vx,p.vz);v.phase+=dt*(4.5+sp*1.6);const amp=Math.min(1,sp/4.2)*0.8;
  const swing=Math.sin(v.phase)*amp;
  const T=v.pose??={legL:0,legR:0,armL:0,armR:0,lean:0,roll:0,tilt:0};
  let legL=swing,legR=-swing,armL=-swing*0.8,armR=swing*0.8,lean=-amp*0.12,roll=0,tilt=0;
  // a kick/tackle starts the frame core.js raises p.anim; remember which one and how long it lasts
  if(p.anim>0&&!v.act){v.act={dur:p.anim,tackle:p.anim>=0.28};}
  if(p.anim<=0)v.act=null;
  if(v.act){
    const t=1-p.anim/v.act.dur; // 0 at the instant the ball is released / the tackle is judged
    if(v.act.tackle){legR=1.25;legL=-0.35;armL=-0.9;armR=0.5;lean=-0.32;}
    else{const f=Math.cos(t*Math.PI*0.5);legR=1.2*f+(-0.15)*(1-f);armL=-0.7*f;armR=0.35*f;lean=-0.18*f;}
  }
  if(p.role==='GK'&&sp<0.6&&!v.act){armL=-0.25;armR=-0.25;roll=0;}
  if(p.dive>0)roll=Math.sin(p.dive/0.6*Math.PI)*1.1*(b.z>p.z?1:-1)*(p.team?-1:1);
  if(p.stun>0)tilt=-0.25;
  const fast=1-Math.exp(-dt*(v.act?30:16)),slow=1-Math.exp(-dt*10);
  T.legL+=(legL-T.legL)*fast;T.legR+=(legR-T.legR)*fast;T.armL+=(armL-T.armL)*fast;T.armR+=(armR-T.armR)*fast;
  T.lean+=(lean-T.lean)*slow;T.roll+=(roll-T.roll)*(p.dive>0?fast:slow);T.tilt+=(tilt-T.tilt)*slow;
  v.limbs.legL.rotation.z=T.legL;v.limbs.legR.rotation.z=T.legR;v.limbs.armL.rotation.z=T.armL;v.limbs.armR.rotation.z=T.armR;
  // GK ready stance spreads the arms sideways
  const spread=p.role==='GK'?(p.dive>0?1.2:0.35):0.08;v.limbs.armL.rotation.x=spread;v.limbs.armR.rotation.x=-spread;
  v.body.position.y=Math.abs(Math.sin(v.phase))*0.05*amp;
  v.body.rotation.x=T.roll;v.body.rotation.z=T.tilt+T.lean;
}

return stage;
}
