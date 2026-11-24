/* 3D futsal prototype: pure match simulation (no rendering, no storage writes).
   Coordinates in metres. x runs along the pitch (-20..20), z across (-10..10), y is up.
   Team 0 (our club) attacks +x, team 1 (computer) attacks -x. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FutsalCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const PITCH={halfLength:20,halfWidth:10,goalHalfWidth:1.5,goalHeight:2,boxDepth:6,ballRadius:0.11};
  const FIELD=['PAC','SHO','PAS','DRI','DEF','PHY'],KEEPER=['REF','POS','1V1','HAN','BLD'];
  const ROLES=[
    {key:'GK',label:'골레이로',def:[-18.6,0],att:[-17.5,0]},
    {key:'FIX',label:'픽소',def:[-10,0],att:[-3,0]},
    {key:'ALA_L',label:'아라',def:[-7,-5],att:[4,-6.5]},
    {key:'ALA_R',label:'아라',def:[-7,5],att:[4,6.5]},
    {key:'PIV',label:'피보',def:[-2,0],att:[11,0]}
  ];
  /* Online matches can be 5, 6 or 7 a side. The pivot (kick-off taker) is always last. */
  const ROLESETS={5:ROLES,
    6:[ROLES[0],{key:'FIX_L',label:'픽소',def:[-10,-3],att:[-3,-3.5]},{key:'FIX_R',label:'픽소',def:[-10,3],att:[-3,3.5]},{key:'ALA_L',label:'아라',def:[-6,-6.5],att:[5,-6.5]},{key:'ALA_R',label:'아라',def:[-6,6.5],att:[5,6.5]},{key:'PIV',label:'피보',def:[-2,0],att:[11,0]}],
    7:[ROLES[0],{key:'FIX_L',label:'픽소',def:[-11,-3.5],att:[-4,-4]},{key:'FIX_R',label:'픽소',def:[-11,3.5],att:[-4,4]},{key:'ALA_L',label:'아라',def:[-6,-7],att:[5,-7]},{key:'ALA_R',label:'아라',def:[-6,7],att:[5,7]},{key:'MEI',label:'중앙',def:[-5,0],att:[4,0]},{key:'PIV',label:'피보',def:[-1.5,0],att:[11.5,0]}]};
  const roleSet=size=>ROLESETS[size]||ROLES;
  const DIFFICULTY={easy:{label:'쉬움',rating:58,think:0.45,error:1.35},normal:{label:'보통',rating:68,think:0.3,error:1},hard:{label:'어려움',rating:78,think:0.18,error:0.8}};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const num=(v,d)=>Number.isFinite(v)?v:d;
  function rng(seed){let a=seed>>>0||1;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function gauss(r){return (r()+r()+r()-1.5)*1.15;}

  /* ---------- roster ---------- */
  function fieldStats(p){
    const stats=Array.isArray(p.stats)?p.stats:[];
    if(p.pos==='GK'){const base=num(Math.round(stats.filter(Number.isFinite).reduce((s,v)=>s+v,0)/Math.max(1,stats.filter(Number.isFinite).length)),55);return {PAC:clamp(base-15,30,99),SHO:clamp(base-25,30,99),PAS:clamp(num(stats[4],base)-5,30,99),DRI:clamp(base-20,30,99),DEF:clamp(base-10,30,99),PHY:clamp(base-5,30,99)};}
    return Object.fromEntries(FIELD.map((code,i)=>[code,clamp(Math.round(num(stats[i],60)),30,99)]));
  }
  function keeperStats(p){
    const stats=Array.isArray(p.stats)?p.stats:[];
    if(p.pos==='GK')return Object.fromEntries(KEEPER.map((code,i)=>[code,clamp(Math.round(num(stats[i],60)),30,99)]));
    const f=fieldStats(p),base=Math.round((f.DEF+f.PHY)/2)-12;
    return {REF:clamp(base,30,99),POS:clamp(base,30,99),'1V1':clamp(base,30,99),HAN:clamp(base-4,30,99),BLD:clamp(f.PAS-8,30,99)};
  }
  /* Read-only: accepts the app's hydrated player objects ({id,name,pos,ovr,stats}). */
  function normalizeRoster(players){
    return (players||[]).filter(p=>p&&p.name).map(p=>{
      const rated=Array.isArray(p.stats)&&p.stats.length>0&&p.stats.every(Number.isFinite);
      return {id:p.id,name:String(p.name),pos:p.pos||'미정',ovr:Number.isFinite(p.ovr)?p.ovr:null,rated,field:fieldStats(p),keeper:keeperStats(p)};
    });
  }
  /* Same roster the club app shows (app.js): the featured player plus the managed roster. Read-only storage. */
  function clubRoster(storage,PilotRoster,Abilities){
    const featured={id:9,name:'데모 선수',pos:'CM',secondary:[],stats:[68,82,83,86,78,80],demo:Abilities&&Abilities.demo?Abilities.demo[9]:undefined};
    const list=[];
    try{PilotRoster.restoreExisting(featured,storage);list.push(featured);}catch{}
    try{list.push(...PilotRoster.hydrate(storage));}catch{}
    return list;
  }
  function clubName(storage,fallback='우리 팀'){try{const v=JSON.parse(storage.getItem('unit-fc-club-v1')||'{}');return typeof v.name==='string'&&v.name.trim()?v.name.trim().slice(0,24):fallback;}catch{return fallback;}}
  const score=p=>p.ovr??Math.round(FIELD.reduce((s,c)=>s+p.field[c],0)/6)-5;
  function pickLineup(roster){
    const list=[...roster];if(list.length<1)return [];
    const keeper=list.filter(p=>p.pos==='GK').sort((a,b)=>score(b)-score(a))[0]||list.slice().sort((a,b)=>(b.keeper.REF+b.keeper.HAN)-(a.keeper.REF+a.keeper.HAN))[0];
    const outfield=list.filter(p=>p!==keeper).sort((a,b)=>Number(b.rated)-Number(a.rated)||score(b)-score(a)).slice(0,4);
    return assignRoles([keeper,...outfield]);
  }
  /* Starter order is always GK, FIX, ALA_L, ALA_R, PIV. */
  function assignRoles(five){
    const [gk,...rest]=five;const pool=rest.filter(Boolean);
    const take=fn=>{if(!pool.length)return null;pool.sort((a,b)=>fn(b)-fn(a));return pool.shift();};
    const fix=take(p=>p.field.DEF*2+p.field.PHY-p.field.SHO);
    const piv=take(p=>p.field.SHO*2+p.field.PHY);
    const alaL=take(p=>p.field.PAC+p.field.DRI),alaR=take(p=>p.field.PAC+p.field.DRI);
    return [gk,fix,alaL,alaR,piv];
  }
  function cpuTeam(level='normal',seed=7,size=5){
    const r=rng(seed),base=(DIFFICULTY[level]||DIFFICULTY.normal).rating;
    return roleSet(size).map((role,i)=>{
      const v=()=>clamp(Math.round(base+gauss(r)*5),35,95);
      const p={id:'cpu'+i,name:'상대 '+role.label,pos:role.key==='GK'?'GK':'CM',stats:role.key==='GK'?KEEPER.map(v):FIELD.map(v)};
      if(role.key==='PIV')p.stats[1]+=5;if(role.key==='FIX')p.stats[4]+=5;
      return normalizeRoster([p])[0];
    });
  }

  /* ---------- attributes derived from card stats ---------- */
  function attributes(p,role){
    const f=p.field,k=p.keeper,s=v=>(clamp(v,30,99)-30)/69;
    return {
      speed:5.0+s(f.PAC)*2.7,
      accel:13+s(f.PHY)*5+s(f.PAC)*4,
      carry:0.86+s(f.DRI)*0.1,
      control:s(f.DRI),
      shotPower:16+s(f.SHO)*6+s(f.PHY)*3,
      shotError:0.035+(1-s(f.SHO))*0.11,
      passError:0.012+(1-s(f.PAS))*0.075,
      tackle:s(f.DEF),strength:s(f.PHY),
      gkReflex:s(k.REF),gkPosition:s(k.POS),gkOneOnOne:s(k['1V1']),gkHandling:s(k.HAN),gkDistribution:s(k.BLD),
      isKeeper:role==='GK'
    };
  }

  /* ---------- match state ---------- */
  /* online:true = every player may be driven by its own person (step input.players[team*10+slot]); no auto switching. */
  function createMatch({home,away,homeName='우리 팀',awayName='상대 팀',duration=180,level='normal',seed=1,size=5,online=false}={}){
    const diff=DIFFICULTY[level]||DIFFICULTY.normal,roles=roleSet(size);
    const teams=[home,away].map((list,t)=>({index:t,name:t?awayName:homeName,dir:t?-1:1,score:0,players:roles.map((role,i)=>{
      const card=list[i];const pl={team:t,slot:i,role:role.key,roleLabel:role.label,card,name:card?.name||role.label,attr:attributes(card,role.key),x:0,z:0,vx:0,vz:0,facing:t?Math.PI:0,kickLock:0,stun:0,think:0,human:false,receiving:false,run:0,anim:0,tackleCd:0,dive:0};
      return pl;
    })}));
    const m={t:0,size:roles.length,roles,online:!!online,clock:duration,duration,phase:'countdown',phaseTimer:2.2,level,diff,teams,r:rng(seed),events:[],controlled:null,
      ball:{x:0,y:PITCH.ballRadius,z:0,vx:0,vy:0,vz:0,owner:null,last:null,lastTeam:0,shot:null,passTo:null,spin:0},kickoffTeam:0,stats:{shots:[0,0],passes:[0,0],tackles:[0,0],saves:[0,0]}};
    resetPositions(m,0);
    return m;
  }
  const allPlayers=m=>m.teams[0].players.concat(m.teams[1].players);
  function roleSpot(m,pl,attacking){
    const role=m.roles[pl.slot],dir=m.teams[pl.team].dir,b=m.ball;
    const base=attacking?role.att:role.def;
    let ox=base[0],oz=base[1];
    if(pl.role!=='GK'){const bx=b.x*dir;ox+=clamp(bx*0.35,-4,5);oz+=clamp(b.z*0.35,-3,3);}
    return {x:clamp(ox*dir,-19.2,19.2),z:clamp(oz,-9.2,9.2)};
  }
  function resetPositions(m,kickoffTeam){
    m.kickoffTeam=kickoffTeam;const b=m.ball;Object.assign(b,{x:0,y:PITCH.ballRadius,z:0,vx:0,vy:0,vz:0,owner:null,shot:null,passTo:null});
    for(const pl of allPlayers(m)){
      const dir=m.teams[pl.team].dir,role=m.roles[pl.slot];let x=role.def[0]*dir,z=role.def[1];
      x=dir>0?Math.min(x,-1.5):Math.max(x,1.5);
      Object.assign(pl,{x,z,vx:0,vz:0,facing:pl.team?Math.PI:0,kickLock:0,stun:0,receiving:false,dive:0});
    }
    const kp=m.teams[kickoffTeam].players,taker=kp[kp.length-1];taker.x=-0.35*m.teams[kickoffTeam].dir;taker.z=0;
    giveBall(m,taker);
  }
  function giveBall(m,pl){const b=m.ball;b.owner=pl;b.last=pl;b.lastTeam=pl.team;b.shot=null;b.passTo=null;for(const p of allPlayers(m))p.receiving=false;if(!m.online&&pl.team===0&&!pl.attr.isKeeper)m.controlled=pl;}
  function emit(m,type,data={}){m.events.push({type,t:m.t,...data});}
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const goalX=team=>PITCH.halfLength*(team?-1:1); // goal a team attacks

  /* ---------- actions ---------- */
  function choosePassTarget(m,pl,dirX,dirZ){
    const mates=m.teams[pl.team].players.filter(p=>p!==pl);const opp=m.teams[1-pl.team].players;
    const hasDir=Math.hypot(dirX,dirZ)>0.2;const fx=hasDir?dirX:Math.cos(pl.facing),fz=hasDir?dirZ:Math.sin(pl.facing);const fl=Math.hypot(fx,fz)||1;
    let best=null,bestScore=-Infinity;
    for(const mate of mates){
      const dx=mate.x-pl.x,dz=mate.z-pl.z,d=Math.hypot(dx,dz);if(d<1.5)continue;
      const cos=(dx*fx+dz*fz)/(d*fl);if(hasDir&&cos<0.35)continue;
      let risk=0;for(const o of opp){const t=clamp(((o.x-pl.x)*dx+(o.z-pl.z)*dz)/(d*d),0,1);const px=pl.x+dx*t,pz=pl.z+dz*t;const off=Math.hypot(o.x-px,o.z-pz);if(off<1.6)risk+=(1.6-off)*(0.4+t);}
      const forward=(mate.x-pl.x)*m.teams[pl.team].dir/20;
      const s=cos*(hasDir?3:1)-d/22-risk*1.2+forward*(hasDir?0.2:0.8)-(mate.role==='GK'?1.2:0);
      if(s>bestScore){bestScore=s;best=mate;}
    }
    return {target:best,score:bestScore};
  }
  function pass(m,pl,dirX=0,dirZ=0){
    const b=m.ball;if(b.owner!==pl)return false;
    const {target}=choosePassTarget(m,pl,dirX,dirZ);
    let tx,tz;
    if(target){const d0=dist(pl,target),lead=clamp(d0/14,0.15,0.7);tx=target.x+target.vx*lead;tz=target.z+target.vz*lead;}
    else{const l=Math.hypot(dirX,dirZ)||1;tx=pl.x+(dirX/l||Math.cos(pl.facing))*10;tz=pl.z+(dirZ/l||Math.sin(pl.facing))*10;}
    const d=Math.hypot(tx-pl.x,tz-pl.z)||1;const err=gauss(m.r)*pl.attr.passError*(pl.team===1?m.diff.error:1);
    const ang=Math.atan2(tz-pl.z,tx-pl.x)+err;const speed=clamp(7+d*0.85,8,19);
    release(m,pl,Math.cos(ang)*speed,d>16?2.2:0.6,Math.sin(ang)*speed);
    b.passTo=target||null;if(target)target.receiving=true;
    if(!m.online&&target&&pl.team===0&&!target.attr.isKeeper)m.controlled=target;
    m.stats.passes[pl.team]++;emit(m,'pass',{team:pl.team});return true;
  }
  function shoot(m,pl,power=0.7,aimZ=null){
    const b=m.ball;if(b.owner!==pl)return false;
    const gx=goalX(pl.team);let gk=m.teams[1-pl.team].players[0];
    let z=aimZ;if(z===null||!Number.isFinite(z)){z=gk.z>pl.z*0.1?-1.1:1.1;}
    z=clamp(z,-1.3,1.3);
    const err=gauss(m.r)*pl.attr.shotError*(1+power*0.5)*(pl.team===1?m.diff.error:1);
    const ang=Math.atan2(z-pl.z,gx-pl.x)+err;const speed=pl.attr.shotPower*(0.7+power*0.45);
    const d=Math.hypot(gx-pl.x,z-pl.z);
    const lift=clamp(0.6+power*2.4+(gauss(m.r)*0.9*(1+power))*(pl.attr.shotError*6),0.2,6)*clamp(d/12,0.55,1.2);
    release(m,pl,Math.cos(ang)*speed,lift,Math.sin(ang)*speed);
    b.shot={team:pl.team,by:pl,saved:false};m.stats.shots[pl.team]++;emit(m,'shot',{team:pl.team,name:pl.name});return true;
  }
  function release(m,pl,vx,vy,vz){const b=m.ball;b.owner=null;b.last=pl;b.lastTeam=pl.team;b.x=pl.x+Math.cos(pl.facing)*0.5;b.z=pl.z+Math.sin(pl.facing)*0.5;b.y=PITCH.ballRadius+0.02;b.vx=vx;b.vy=vy;b.vz=vz;pl.kickLock=0.3;pl.anim=0.25;b.shot=null;b.passTo=null;for(const p of allPlayers(m))p.receiving=false;}
  function tackle(m,pl){
    const b=m.ball,o=b.owner;if(pl.tackleCd>0||pl.stun>0)return false;pl.tackleCd=0.7;pl.anim=0.3;
    if(!o||o.team===pl.team||dist(pl,o)>1.5){emit(m,'whiff',{team:pl.team});return false;}
    const p=clamp(0.42+(pl.attr.tackle-o.attr.control)*0.45+(pl.attr.strength-o.attr.strength)*0.2,0.15,0.85);
    if(m.r()<p){
      o.kickLock=0.55;o.stun=0.35;m.stats.tackles[pl.team]++;
      if(m.r()<0.55){giveBall(m,pl);}else{const a=Math.atan2(o.z-pl.z,o.x-pl.x)+(m.r()-0.5)*1.6;b.owner=null;b.last=pl;b.lastTeam=pl.team;b.vx=Math.cos(a)*4;b.vz=Math.sin(a)*4;b.vy=0.4;pl.kickLock=0.15;}
      emit(m,'tackle',{team:pl.team,name:pl.name});return true;
    }
    pl.stun=0.55;emit(m,'miss',{team:pl.team});return false;
  }
  function nearestToBall(m,team,exclude){let best=null,bd=Infinity;for(const p of m.teams[team].players){if(p===exclude||p.attr.isKeeper)continue;const d=dist(p,m.ball);if(d<bd){bd=d;best=p;}}return best;}
  function switchPlayer(m){const next=nearestToBall(m,0,m.controlled);if(next)m.controlled=next;return next;}

  /* ---------- per-step updates ---------- */
  function moveToward(pl,tx,tz,speedScale,dt){
    const dx=tx-pl.x,dz=tz-pl.z,d=Math.hypot(dx,dz);
    const max=pl.attr.speed*speedScale*(pl.stun>0?0.45:1)*(m_ownerCarry(pl));
    const desired=d<0.15?0:Math.min(max,d*3.2);
    steer(pl,d>0?dx/d*desired:0,d>0?dz/d*desired:0,dt);
  }
  let currentBall=null;
  function m_ownerCarry(pl){return currentBall&&currentBall.owner===pl?pl.attr.carry:1;}
  function steer(pl,tvx,tvz,dt){
    const ax=tvx-pl.vx,az=tvz-pl.vz,a=Math.hypot(ax,az),maxA=pl.attr.accel*dt;
    if(a>maxA){pl.vx+=ax/a*maxA;pl.vz+=az/a*maxA;}else{pl.vx=tvx;pl.vz=tvz;}
  }
  function faceTo(pl,ang,dt,rate=10){let d=ang-pl.facing;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;pl.facing+=clamp(d,-rate*dt,rate*dt);}

  function keeperAI(m,pl,dt){
    const b=m.ball,dir=m.teams[pl.team].dir,lineX=-PITCH.halfLength*dir;
    const a=pl.attr;
    if(b.owner===pl){
      pl.think-=dt;pl.vx*=0.8;pl.vz*=0.8;
      if(pl.think<=0){const {target}=choosePassTarget(m,pl,dir,0);if(target){faceTo(pl,Math.atan2(target.z-pl.z,target.x-pl.x),1,100);pass(m,pl,target.x-pl.x,target.z-pl.z);}else pl.think=0.4;}
      return;
    }
    const threat=b.vx*dir<-4;let tz;
    if(threat){const t=(lineX+dir*0.9-b.x)/(b.vx||-1e-6);tz=t>0&&t<1.5?b.z+b.vz*t:b.z*0.5;}
    else tz=b.z*0.55;
    const advance=0.8+a.gkPosition*1.2+(Math.abs(b.x-lineX)<9&&!threat?1.2*a.gkOneOnOne:0);
    const tx=lineX+dir*advance;tz=clamp(tz,-1.9,1.9);
    // free ball in own box: go claim it
    const inBox=Math.abs(b.x-lineX)<PITCH.boxDepth&&Math.abs(b.z)<6;
    if(!b.owner&&inBox&&!threat&&Math.hypot(b.vx,b.vz)<9){moveToward(pl,b.x,b.z,1,dt);}
    else moveToward(pl,tx,tz,threat?1.35:0.9,dt);
    faceTo(pl,Math.atan2(b.z-pl.z,b.x-pl.x),dt);
  }

  function fieldAI(m,pl,dt){
    const b=m.ball,team=m.teams[pl.team],dir=team.dir;const owner=b.owner;
    const attacking=owner?owner.team===pl.team:b.lastTeam===pl.team&&!!b.passTo;
    if(owner===pl){carrierAI(m,pl,dt);return;}
    if(pl.receiving&&!owner){const t=0.25;moveToward(pl,b.x+b.vx*t,b.z+b.vz*t,1,dt);faceTo(pl,Math.atan2(b.z-pl.z,b.x-pl.x),dt);return;}
    if(!owner){
      const chaser=nearestToBall(m,pl.team,null);
      if(chaser===pl){const t=clamp(dist(pl,b)/8,0,0.6);moveToward(pl,b.x+b.vx*t,b.z+b.vz*t,1,dt);faceTo(pl,Math.atan2(b.z-pl.z,b.x-pl.x),dt);return;}
    }
    if(owner&&owner.team!==pl.team){
      const presser=nearestToBall(m,pl.team,null);
      if(presser===pl){
        const own=-PITCH.halfLength*dir;const gx=own-owner.x,gz=-owner.z,gl=Math.hypot(gx,gz)||1;
        const tx=owner.x+gx/gl*0.7,tz=owner.z+gz/gl*0.7;moveToward(pl,tx,tz,1,dt);faceTo(pl,Math.atan2(owner.z-pl.z,owner.x-pl.x),dt);
        pl.think-=dt;const close=dist(pl,owner)<1.15;
        if(close&&pl.think<=0&&pl.tackleCd<=0){pl.think=pl.team===1?m.diff.think*2.2:0.6;if(m.r()<(pl.team===1?0.55:0.35))tackle(m,pl);}
        return;
      }
      // mark the nearest attacker goal-side, blended with shape
      const spot=roleSpot(m,pl,false);let mark=null,md=Infinity;for(const o of m.teams[1-pl.team].players){if(o.attr.isKeeper||o===owner)continue;const d=Math.hypot(o.x-spot.x,o.z-spot.z);if(d<md){md=d;mark=o;}}
      let tx=spot.x,tz=spot.z;if(mark&&md<8){const own=-PITCH.halfLength*dir;tx=lerp(spot.x,mark.x+(own-mark.x)*0.12,0.6);tz=lerp(spot.z,mark.z,0.6);}
      moveToward(pl,tx,tz,0.92,dt);faceTo(pl,Math.atan2(b.z-pl.z,b.x-pl.x),dt);return;
    }
    const spot=roleSpot(m,pl,attacking);
    // find a little space away from the nearest opponent
    let nx=0,nz=0;for(const o of m.teams[1-pl.team].players){const d=dist(o,spot);if(d<3.5&&d>0.01){nx+=(spot.x-o.x)/d*(3.5-d);nz+=(spot.z-o.z)/d*(3.5-d);}}
    moveToward(pl,clamp(spot.x+nx*0.6,-19,19),clamp(spot.z+nz*0.6,-9.3,9.3),attacking?0.85:0.9,dt);
    faceTo(pl,Math.atan2(b.z-pl.z,b.x-pl.x),dt);
  }

  function carrierAI(m,pl,dt){
    const team=m.teams[pl.team],dir=team.dir,gx=goalX(pl.team),opp=m.teams[1-pl.team].players;
    const dGoal=Math.hypot(gx-pl.x,pl.z);
    let press=null,pd=Infinity;for(const o of opp){const d=dist(o,pl);if(d<pd){pd=d;press=o;}}
    // dribble direction: toward goal, pushed away from opponents ahead
    let dx=gx-pl.x,dz=(0-pl.z)*0.6;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
    for(const o of opp){const ox=o.x-pl.x,oz=o.z-pl.z,d=Math.hypot(ox,oz);if(d<3.2&&d>0.01&&(ox*dx+oz*dz)>-0.5){dx-=ox/d*(3.2-d)*0.35;dz-=oz/d*(3.2-d)*0.45;}}
    if(Math.abs(pl.z)>8.6)dz-=Math.sign(pl.z)*0.6;
    const dl=Math.hypot(dx,dz)||1;dx/=dl;dz/=dl;
    const speed=pl.attr.speed*pl.attr.carry*0.92;steer(pl,dx*speed,dz*speed,dt);faceTo(pl,Math.atan2(dz,dx),dt,7);
    pl.think-=dt;if(pl.think>0)return;
    pl.think=pl.team===1?m.diff.think:0.3;
    const angleOk=Math.abs(pl.z)<7.5&&(gx-pl.x)*dir>0;
    let blocked=0;for(const o of opp){if(o.attr.isKeeper)continue;const t=clamp(((o.x-pl.x)*(gx-pl.x)+(o.z-pl.z)*(-pl.z))/(dGoal*dGoal),0,1);const px=pl.x+(gx-pl.x)*t,pz=pl.z-pl.z*t;if(Math.hypot(o.x-px,o.z-pz)<0.9&&t<0.95)blocked++;}
    if(angleOk&&(dGoal<7||(dGoal<12.5&&blocked===0)||(dGoal<15&&blocked===0&&m.r()<0.25))){
      faceTo(pl,Math.atan2(-pl.z,gx-pl.x),1,100);const gk=opp[0];shoot(m,pl,clamp(0.45+dGoal/30+m.r()*0.2,0.4,0.95),gk.z>0?-1.05:1.05);return;
    }
    const opt=choosePassTarget(m,pl,0,0);
    if(opt.target&&((pd<1.9&&opt.score>-0.6)||(opt.score>0.15&&m.r()<0.35))){faceTo(pl,Math.atan2(opt.target.z-pl.z,opt.target.x-pl.x),1,100);pass(m,pl,opt.target.x-pl.x,opt.target.z-pl.z);}
  }

  function humanUpdate(m,pl,input,dt){
    const b=m.ball,mx=input.moveX||0,mz=input.moveZ||0,ml=Math.min(1,Math.hypot(mx,mz));
    const sprint=input.sprint?1.13:0.94;const carrying=b.owner===pl;
    const max=pl.attr.speed*sprint*(carrying?pl.attr.carry*(input.sprint?0.97:1):1)*(pl.stun>0?0.45:1);
    if(ml>0.05){steer(pl,mx/ml*max*ml,mz/ml*max*ml,dt);faceTo(pl,Math.atan2(mz,mx),dt,carrying?(input.sprint?7:11):14);}
    else steer(pl,0,0,dt);
    if(carrying&&input.sprint&&ml>0.5){pl.run+=dt;if(pl.run>0.65&&m.r()<dt*(1.3-pl.attr.control)*1.6){pl.run=0;const a=pl.facing;b.owner=null;b.last=pl;b.vx=Math.cos(a)*(pl.attr.speed+2.6);b.vz=Math.sin(a)*(pl.attr.speed+2.6);b.vy=0;pl.kickLock=0.22;emit(m,'touch',{team:pl.team});}}else pl.run=0;
    if(carrying){
      if(input.pass)pass(m,pl,mx,mz);
      else if(input.shoot)shoot(m,pl,clamp(input.power??0.6,0,1),ml>0.2?mz*1.6:null);
    }else{
      if(input.shoot)tackle(m,pl);
      if(input.pass&&!m.online)switchPlayer(m);
    }
  }
  /* a person playing in goal stays inside their own penalty area */
  function keepInBox(m,pl){const dir=m.teams[pl.team].dir,lineX=-PITCH.halfLength*dir;const a=Math.min(lineX,lineX+dir*PITCH.boxDepth),b=Math.max(lineX,lineX+dir*PITCH.boxDepth);if(pl.x<a||pl.x>b){pl.x=clamp(pl.x,a,b);pl.vx=0;}if(Math.abs(pl.z)>6){pl.z=clamp(pl.z,-6,6);pl.vz=0;}}

  function ballPhysics(m,dt){
    const b=m.ball,R=PITCH.ballRadius;
    if(b.owner){const o=b.owner;const off=o.attr.isKeeper?0.35:0.55;const tx=o.x+Math.cos(o.facing)*off,tz=o.z+Math.sin(o.facing)*off;b.x=clamp(lerp(b.x,tx,clamp(dt*18,0,1)),-PITCH.halfLength+R,PITCH.halfLength-R);b.z=clamp(lerp(b.z,tz,clamp(dt*18,0,1)),-PITCH.halfWidth+R,PITCH.halfWidth-R);b.y=o.attr.isKeeper?1.0:R;b.vx=o.vx;b.vz=o.vz;b.vy=0;b.spin+=Math.hypot(o.vx,o.vz)*dt/R;return;}
    b.px=b.x;b.pz=b.z;b.vy-=9.8*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
    if(b.y<=R){b.y=R;if(b.vy<-1.2)b.vy*=-0.42;else b.vy=0;}
    const onGround=b.y<=R+0.01,sp=Math.hypot(b.vx,b.vz);
    if(sp>0){const dec=onGround?(0.9+sp*0.045):0.08;const ns=Math.max(0,sp-dec*dt*(onGround?1.5:1));b.vx*=ns/sp;b.vz*=ns/sp;}
    b.spin+=sp*dt/R;
    const W=PITCH.halfWidth-R,L=PITCH.halfLength;
    if(Math.abs(b.z)>W){b.z=Math.sign(b.z)*W;b.vz*=-0.55;b.vx*=0.85;emit(m,'board');}
    if(Math.abs(b.x)>L+R&&Math.abs(b.px??b.x)>L){ // inside the net
      const side=Math.sign(b.x),G=PITCH.goalHalfWidth-R;
      if(Math.abs(b.x)>L+0.9){b.x=side*(L+0.9);b.vx*=-0.2;}
      if(Math.abs(b.z)>G){b.z=Math.sign(b.z)*G;b.vz*=-0.3;}
      if(b.y>PITCH.goalHeight-R){b.y=PITCH.goalHeight-R;b.vy=0;}
      return;
    }
    if(Math.abs(b.x)>L-R){
      const side=Math.sign(b.x);const inMouth=Math.abs(b.z)<PITCH.goalHalfWidth-R&&b.y<PITCH.goalHeight-R;
      if(inMouth&&Math.abs(b.x)>L+R){if(m.phase==='play')scoreGoal(m,side>0?0:1);else if(Math.abs(b.x)>L+1){b.x=side*(L+1);b.vx=0;b.vz*=0.5;}return;}
      if(!inMouth){
        const nearPost=Math.abs(Math.abs(b.z)-PITCH.goalHalfWidth)<0.25&&b.y<PITCH.goalHeight;
        b.x=side*(L-R);b.vx*=-(nearPost?0.7:0.5);b.vz*=0.85;emit(m,nearPost?'post':'board');
        if(b.shot&&!b.shot.saved){emit(m,'miss-shot',{team:b.shot.team});b.shot=null;}
      }
    }
  }

  function scoreGoal(m,team){const t=m.teams[team];t.score++;const by=m.ball.last&&m.ball.last.team===team?m.ball.last.name:null;emit(m,'goal',{team,name:by,score:[m.teams[0].score,m.teams[1].score]});m.phase='goal';m.phaseTimer=2.6;m.ball.vx*=0.2;m.ball.vz*=0.2;m.pendingKickoff=1-team;}

  function keeperSave(m,dt){
    const b=m.ball;if(b.owner)return;const sp=Math.hypot(b.vx,b.vz);
    for(const t of m.teams){
      const gk=t.players[0],dir=t.dir,lineX=-PITCH.halfLength*dir;if(gk.stun>0)continue;
      const towards=b.vx*dir<-1;const reach=0.85+gk.attr.gkOneOnOne*0.5+gk.attr.gkReflex*0.25;let d=dist(gk,b);
      if(towards&&Number.isFinite(b.px)&&(b.px-gk.x)*(b.x-gk.x)<=0){const f=(gk.x-b.px)/((b.x-b.px)||1e-6);d=Math.min(d,Math.abs(b.pz+(b.z-b.pz)*f-gk.z));}
      if(d<reach&&b.y<2.25&&gk.kickLock<=0&&b.lastTeam!==t.index||d<0.75&&b.y<1.9&&gk.kickLock<=0&&!towards){
        if(b.shot&&b.shot.team!==t.index&&!b.shot.saved&&sp>8){
          const p=clamp(0.66+gk.attr.gkReflex*0.28+gk.attr.gkHandling*0.12-(sp-17)/22-(d/reach)*0.2-(b.y>1.5?0.12:0)*(1-gk.attr.gkReflex)+(m.teams[1-t.index]===m.teams[0]?0:0)-(t.index===1?(m.diff.error-1)*0.6:0),0.12,0.92);
          b.shot.saved=true;
          if(m.r()<p){
            gk.dive=0.6;m.stats.saves[t.index]++;
            if(sp<17&&m.r()<0.35+gk.attr.gkHandling*0.5){gk.think=0.9;giveBall(m,gk);emit(m,'catch',{team:t.index,name:gk.name});}
            else{const a=(dir>0?0:Math.PI)+(m.r()-0.5)*2.2;b.vx=Math.cos(a)*sp*0.38;b.vz=Math.sin(a)*sp*0.38;b.vy=2+m.r()*2;b.last=gk;b.lastTeam=t.index;b.shot=null;gk.kickLock=0.4;emit(m,'save',{team:t.index,name:gk.name});}
          }else{gk.dive=0.6;gk.stun=0.35;}
          return;
        }
        if((!b.shot||b.shot.saved===false&&b.shot.team===t.index)&&Math.abs(b.x-lineX)<PITCH.boxDepth&&Math.abs(b.z)<6&&sp<11){gk.think=0.9;giveBall(m,gk);emit(m,'catch',{team:t.index,name:gk.name});return;}
      }
    }
  }

  function pickups(m){
    const b=m.ball;if(b.owner||b.y>0.95)return;
    let best=null,bd=Infinity;
    for(const p of allPlayers(m)){if(p.kickLock>0||p.attr.isKeeper)continue;const d=dist(p,b);if(d<0.62&&d<bd){bd=d;best=p;}}
    if(!best)return;
    const sp=Math.hypot(b.vx-best.vx,b.vz-best.vz);
    if(sp>11&&best.team!==b.lastTeam){if(m.r()>0.35+best.attr.control*0.4){b.vx*=-0.3;b.vz=b.vz*0.4+(m.r()-0.5)*5;best.kickLock=0.3;b.last=best;b.lastTeam=best.team;b.shot=null;emit(m,'deflect');return;}}
    const wasOpp=best.team!==b.lastTeam;giveBall(m,best);if(wasOpp)emit(m,'intercept',{team:best.team,name:best.name});
  }

  function separate(m){
    const ps=allPlayers(m);for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],c=ps[j],dx=c.x-a.x,dz=c.z-a.z,d=Math.hypot(dx,dz),min=0.62;if(d<min&&d>1e-4){const push=(min-d)/2;a.x-=dx/d*push;a.z-=dz/d*push;c.x+=dx/d*push;c.z+=dz/d*push;}}
    for(const p of ps){p.x=clamp(p.x,-PITCH.halfLength+0.25,PITCH.halfLength-0.25);p.z=clamp(p.z,-PITCH.halfWidth+0.25,PITCH.halfWidth-0.25);}
  }

  function step(m,dt,input={}){
    m.events.length=0;currentBall=m.ball;m.t+=dt;
    if(m.phase==='end')return m;
    if(m.phase==='countdown'||m.phase==='kickoff'){m.phaseTimer-=dt;if(m.phaseTimer<=0){m.phase='play';emit(m,'whistle');}return m;}
    if(m.phase==='goal'){m.phaseTimer-=dt;ballPhysics(m,dt);if(m.phaseTimer<=0){if(m.clock<=0){m.phase='end';emit(m,'end');}else{resetPositions(m,m.pendingKickoff);m.phase='kickoff';m.phaseTimer=1.2;}}return m;}
    m.clock=Math.max(0,m.clock-dt);
    if(m.clock<=0){m.phase='end';emit(m,'end');return m;}
    const b=m.ball;
    if(!m.online&&b.owner&&b.owner.team===1&&m.controlled&&input.autoSwitch!==false){const near=nearestToBall(m,0,null);if(near&&near!==m.controlled&&dist(near,b)+2<dist(m.controlled,b))m.controlled=near;}
    if(!m.online&&(!m.controlled||m.controlled.attr.isKeeper))m.controlled=nearestToBall(m,0,null);
    const byPlayer=m.online?(input.players||{}):null;
    for(const p of allPlayers(m)){
      p.kickLock=Math.max(0,p.kickLock-dt);p.stun=Math.max(0,p.stun-dt);p.tackleCd=Math.max(0,p.tackleCd-dt);p.anim=Math.max(0,p.anim-dt);p.dive=Math.max(0,p.dive-dt);
      if(m.online){const own=byPlayer[p.team*10+p.slot];p.human=!!own;
        if(own){humanUpdate(m,p,own,dt);p.x+=p.vx*dt;p.z+=p.vz*dt;if(p.attr.isKeeper)keepInBox(m,p);continue;}}
      else p.human=p===m.controlled&&!input.cpuOnly;
      if(p.attr.isKeeper)keeperAI(m,p,dt);else if(p.human)humanUpdate(m,p,input,dt);else fieldAI(m,p,dt);
      p.x+=p.vx*dt;p.z+=p.vz*dt;
    }
    separate(m);
    ballPhysics(m,dt);
    if(m.phase!=='play')return m;
    keeperSave(m,dt);pickups(m);
    return m;
  }

  function formatClock(sec){sec=Math.ceil(Math.max(0,sec));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}

  return {clubRoster,clubName,PITCH,ROLES,ROLESETS,DIFFICULTY,FIELD,KEEPER,normalizeRoster,pickLineup,assignRoles,cpuTeam,attributes,createMatch,step,pass,shoot,tackle,switchPlayer,choosePassTarget,allPlayers,formatClock,rng};
});
