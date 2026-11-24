/* 흑표범 리그 room: lobby, seats and the authoritative match loop for one online room.
   Pure logic (no Cloudflare APIs) so node tests can drive it; room.mjs wires it to WebSockets.
   Wire format is small JSON. Client -> server: hello, seat, card, cfg, start, lobby, in. Server -> client: welcome, lobby, kickoff, s (snapshot), result, error. */
import C from '../../dist/futsal/core.js';

export const TEAM_NAMES=['블랙','화이트'];
export const SIZES=[5,6,7];
export const DURATIONS=[180,300,420,600];
export const TICK=1/60;            // simulation step
export const STEPS_PER_SEND=3;     // snapshot every 3 steps = 20 per second
export const IDLE_TO_AI=3;         // seconds without input before the computer takes over a seat
const MAX_MEMBERS=24,NAME_MAX=12;

const r2=v=>Math.round(v*100)/100;
const cleanName=v=>String(v??'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,NAME_MAX);

export class RoomEngine{
  /* send(cid,obj) delivers to one member; roster = app player cards (raw), clubName = saved team name */
  constructor({code,roster=[],clubName='흑표범 FC',send,now=()=>Date.now(),seed=Date.now()}){
    this.code=code;this.send=send;this.now=now;this.seed=seed>>>0||1;
    this.clubName=clubName;
    this.cards=C.normalizeRoster(roster);
    this.members=new Map();this.order=0;
    this.host=null;this.size=5;this.duration=300;
    this.phase='lobby';this.match=null;this.goals=[];this.stepCount=0;this.events=[];
  }
  /* ---------- membership ---------- */
  join(cid,name){
    if(!/^[a-z0-9-]{6,40}$/i.test(cid||''))return {error:'bad-id'};
    let m=this.members.get(cid);
    if(!m){
      if(this.members.size>=MAX_MEMBERS)return {error:'full'};
      m={cid,name:cleanName(name)||'선수',team:null,slot:null,cardId:null,connected:true,joined:++this.order,input:null,lastInput:0,seq:0};
      this.members.set(cid,m);
    }else{m.connected=true;if(cleanName(name))m.name=cleanName(name);}
    if(!this.host||!this.members.get(this.host)?.connected)this.host=cid;
    this.send(cid,{t:'welcome',cid,code:this.code,club:this.clubName,teams:TEAM_NAMES,roster:this.cards.map(c=>({id:c.id,name:c.name,pos:c.pos,ovr:c.ovr,rated:c.rated,field:c.field}))});
    this.broadcastLobby();
    if(this.phase==='match')this.send(cid,this.kickoffMessage(cid));
    if(this.phase==='result')this.send(cid,this.resultMessage());
    return {ok:true};
  }
  leave(cid){
    const m=this.members.get(cid);if(!m)return;
    m.connected=false;m.input=null;
    // in the lobby a departed member frees their seat; during a match the seat stays theirs (the computer plays it) so they can rejoin
    if(this.phase!=='match')this.members.delete(cid);
    if(this.host===cid){const next=[...this.members.values()].filter(x=>x.connected).sort((a,b)=>a.joined-b.joined)[0];this.host=next?next.cid:null;}
    this.broadcastLobby();
  }
  get connectedCount(){let n=0;for(const m of this.members.values())if(m.connected)n++;return n;}
  /* ---------- messages ---------- */
  handle(cid,msg){
    const m=this.members.get(cid);if(!m||!msg||typeof msg.t!=='string')return;
    const isHost=cid===this.host;
    switch(msg.t){
      case 'in':return this.onInput(m,msg);
      case 'seat':{
        if(this.phase==='match'&&m.team!==null)return; // no swapping sides mid-match
        if(msg.team===null){m.team=m.slot=null;return this.broadcastLobby();}
        const team=msg.team===1?1:msg.team===0?0:-1,slot=Number(msg.slot);
        if(team<0||!Number.isInteger(slot)||slot<0||slot>=this.size)return;
        if(this.seatHolder(team,slot)&&this.seatHolder(team,slot)!==m)return this.send(cid,{t:'error',msg:'이미 다른 사람이 고른 자리예요.'});
        m.team=team;m.slot=slot;return this.broadcastLobby();
      }
      case 'card':{
        if(this.phase==='match')return;
        if(msg.id===null){m.cardId=null;return this.broadcastLobby();}
        const card=this.cards.find(c=>String(c.id)===String(msg.id));if(!card)return;
        const taken=[...this.members.values()].find(x=>x!==m&&String(x.cardId)===String(card.id));
        if(taken)return this.send(cid,{t:'error',msg:`${card.name} 카드는 ${taken.name}님이 이미 골랐어요.`});
        m.cardId=card.id;m.name=card.name.slice(0,NAME_MAX);return this.broadcastLobby();
      }
      case 'name':{if(this.phase==='match')return;const n=cleanName(msg.name);if(n&&m.cardId===null){m.name=n;this.broadcastLobby();}return;}
      case 'cfg':{
        if(!isHost||this.phase==='match')return;
        if(SIZES.includes(msg.size)){this.size=msg.size;for(const x of this.members.values())if(x.slot!==null&&x.slot>=this.size)x.team=x.slot=null;}
        if(DURATIONS.includes(msg.duration))this.duration=msg.duration;
        return this.broadcastLobby();
      }
      case 'start':if(isHost&&this.phase!=='match')this.startMatch();return;
      case 'lobby':if(isHost&&this.phase==='result'){this.phase='lobby';this.match=null;this.broadcastLobby();}return;
      case 'ping':return this.send(cid,{t:'pong',c:msg.c});
    }
  }
  seatHolder(team,slot){for(const m of this.members.values())if(m.team===team&&m.slot===slot)return m;return null;}
  lobbyState(){
    return {t:'lobby',phase:this.phase,host:this.host,size:this.size,duration:this.duration,
      roles:C.ROLESETS[this.size].map(r=>r.label),
      members:[...this.members.values()].sort((a,b)=>a.joined-b.joined).map(m=>({cid:m.cid,name:m.name,team:m.team,slot:m.slot,cardId:m.cardId,connected:m.connected}))};
  }
  broadcastLobby(){const s=this.lobbyState();for(const m of this.members.values())if(m.connected)this.send(m.cid,s);}
  broadcast(obj){for(const m of this.members.values())if(m.connected)this.send(m.cid,obj);}
  /* ---------- match ---------- */
  guestCard(m){return C.normalizeRoster([{id:'guest-'+m.cid,name:m.name,pos:'미정',stats:[]}])[0];}
  lineups(){
    const used=new Set([...this.members.values()].filter(m=>m.team!==null&&m.cardId!==null).map(m=>String(m.cardId)));
    // computer players: club cards nobody picked, keepers first for slot 0, then by rating
    const spare=this.cards.filter(c=>!used.has(String(c.id)));
    const take=gk=>{let i=gk?spare.findIndex(c=>c.pos==='GK'):-1;if(i<0){spare.sort((a,b)=>Number(b.rated)-Number(a.rated)||(b.ovr??0)-(a.ovr??0));i=spare.length?0:-1;}return i<0?null:spare.splice(i,1)[0];};
    const filler=C.cpuTeam('normal',this.seed,this.size);
    return [0,1].map(team=>Array.from({length:this.size},(_,slot)=>{
      const m=this.seatHolder(team,slot);
      if(m)return m.cardId!==null?this.cards.find(c=>String(c.id)===String(m.cardId))||this.guestCard(m):this.guestCard(m);
      const card=take(slot===0);if(card)return {...card,ai:true};
      return {...filler[slot],name:'AI '+C.ROLESETS[this.size][slot].label,ai:true};
    }));
  }
  startMatch(){
    const humans=[...this.members.values()].filter(m=>m.connected&&m.team!==null);
    if(!humans.length)return this.send(this.host,{t:'error',msg:'경기를 시작하려면 한 명 이상 자리를 골라야 해요.'});
    // members who left the lobby without a seat are gone; seated but disconnected members are dropped too
    for(const m of [...this.members.values()])if(!m.connected)this.members.delete(m.cid);
    const [home,away]=this.lineups();this.seed=(this.seed*1103515245+12345)>>>0;
    this.match=C.createMatch({home,away,homeName:TEAM_NAMES[0],awayName:TEAM_NAMES[1],duration:this.duration,size:this.size,online:true,seed:this.seed});
    this.phase='match';this.goals=[];this.stepCount=0;this.events=[];
    for(const m of this.members.values()){m.input=null;m.lastInput=0;m.seq=0;}
    this.broadcastLobby();
    for(const m of this.members.values())if(m.connected)this.send(m.cid,this.kickoffMessage(m.cid));
  }
  kickoffMessage(cid){
    const mt=this.match,me=this.members.get(cid);
    return {t:'kickoff',size:mt.size,duration:mt.duration,club:this.clubName,teams:TEAM_NAMES,
      you:me&&me.team!==null?me.team*10+me.slot:null,
      players:C.allPlayers(mt).map(p=>({team:p.team,slot:p.slot,role:p.role,label:p.roleLabel,name:p.name,ai:!!p.card?.ai,
        field:p.card?.field,a:{speed:r2(p.attr.speed),accel:r2(p.attr.accel),carry:r2(p.attr.carry)},
        owner:this.seatHolder(p.team,p.slot)?.cid||null}))};
  }
  onInput(m,msg){
    if(this.phase!=='match'||m.team===null)return;
    const seq=Number(msg.s)||0;if(seq<=m.seq)return;m.seq=seq;
    const f=v=>Math.max(-1,Math.min(1,Number(v)||0));
    const prev=m.input||{};
    m.input={moveX:f(msg.x),moveZ:f(msg.z),sprint:!!msg.r,
      // pass/shoot are presses: latch until a sim step consumes them
      pass:prev.pass||!!msg.p,shoot:prev.shoot||!!msg.k,power:Math.max(0,Math.min(1,Number(msg.w)||0.6))};
    m.lastInput=this.now();
  }
  /* advance one network tick (3 sim steps) and send each member a snapshot */
  tick(){
    if(this.phase!=='match'||!this.match)return;
    const mt=this.match,now=this.now();
    const players={};
    for(const m of this.members.values()){
      if(m.team===null||!m.connected||!m.input||now-m.lastInput>IDLE_TO_AI*1000)continue;
      players[m.team*10+m.slot]=m.input;
    }
    const events=[];
    for(let i=0;i<STEPS_PER_SEND;i++){
      C.step(mt,TICK,{players});this.stepCount++;
      for(const e of mt.events){events.push(e);if(e.type==='goal')this.goals.push({team:e.team,name:e.name,time:Math.round(mt.duration-mt.clock)});}
      for(const k in players){players[k].pass=false;players[k].shoot=false;}
      if(mt.phase==='end')break;
    }
    const snap=this.snapshot(events);
    for(const m of this.members.values())if(m.connected)this.send(m.cid,{...snap,a:m.seq});
    if(mt.phase==='end'){this.phase='result';this.broadcast(this.resultMessage());this.broadcastLobby();}
  }
  snapshot(events){
    const mt=this.match,b=mt.ball,all=C.allPlayers(mt);
    return {t:'s',n:this.stepCount,c:r2(mt.clock),ph:mt.phase,sc:[mt.teams[0].score,mt.teams[1].score],
      b:[r2(b.x),r2(b.y),r2(b.z),r2(b.vx),r2(b.vy),r2(b.vz),b.owner?b.owner.team*10+b.owner.slot:-1],
      p:all.map(p=>[r2(p.x),r2(p.z),r2(p.vx),r2(p.vz),r2(p.facing),r2(p.anim),r2(p.dive),p.stun>0?1:0,p.human?1:0]),
      e:events.filter(e=>e.type!=='board').map(e=>({type:e.type,team:e.team,name:e.name}))};
  }
  resultMessage(){
    const mt=this.match;if(!mt)return {t:'result'};
    return {t:'result',score:[mt.teams[0].score,mt.teams[1].score],teams:TEAM_NAMES,stats:mt.stats,goals:this.goals};
  }
}
