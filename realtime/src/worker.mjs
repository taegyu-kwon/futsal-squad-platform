/* Cloudflare Worker for 흑표범 리그 (online futsal).
   - Static files (futsal-league.html, three.js, court art) come from the assets folder.
   - /api/league/room        POST -> new room code
   - /api/league/room/:code  GET (WebSocket upgrade) -> that room's Durable Object
   One Durable Object per room runs the authoritative match (RoomEngine) at 60 steps a second
   and sends 20 snapshots a second. The club roster is read (GET only) from the main app's public API. */
import {DurableObject} from 'cloudflare:workers';
import {RoomEngine,TICK,STEPS_PER_SEND} from './room-engine.mjs';
import PilotRoster from '../../dist/pilot-roster.js';
import Abilities from '../../dist/abilities.js';
import C from '../../dist/futsal/core.js';

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE=/^[A-Z2-9]{5}$/;
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/league/room'&&request.method==='POST'){
      const bytes=crypto.getRandomValues(new Uint8Array(5));
      return json({code:[...bytes].map(b=>CODE_CHARS[b%CODE_CHARS.length]).join('')});
    }
    const m=url.pathname.match(/^\/api\/league\/room\/([A-Za-z0-9]{5})$/);
    if(m){
      const code=m[1].toUpperCase();if(!CODE_RE.test(code))return json({error:'bad code'},400);
      if(request.headers.get('Upgrade')!=='websocket')return json({error:'websocket only'},426);
      const origin=request.headers.get('Origin');
      if(origin&&new URL(origin).host!==url.host&&!(env.EXTRA_ORIGINS||'').split(',').includes(origin))return json({error:'origin'},403);
      const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request(url.origin+'/ws?code='+code,request));
    }
    if(url.pathname==='/'||url.pathname==='/index.html')return Response.redirect(url.origin+'/futsal-league',302);
    return env.ASSETS.fetch(request);
  }
};

/* Read-only: the club's player cards and team name from the main app (same code the app uses). */
async function loadRoster(env){
  const fallback={roster:[],clubName:'흑표범 FC'};
  if(!env.ROSTER_URL)return fallback;
  try{
    const r=await fetch(env.ROSTER_URL,{headers:{Accept:'application/json'},cf:{cacheTtl:60}});
    if(!r.ok)return fallback;
    const data=(await r.json()).data||{};
    const storage={getItem:k=>Object.hasOwn(data,k)?data[k]:null};
    return {roster:C.clubRoster(storage,PilotRoster,Abilities),clubName:C.clubName(storage,'흑표범 FC')};
  }catch{return fallback;}
}

export class LeagueRoom extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.env=env;this.sockets=new Map();this.engine=null;this.timer=null;this.ready=null;}
  async setup(code){
    if(this.engine)return;
    this.ready??=(async()=>{
      const {roster,clubName}=await loadRoster(this.env);
      this.engine=new RoomEngine({code,roster,clubName,send:(cid,obj)=>this.send(cid,obj)});
    })();
    await this.ready;
  }
  send(cid,obj){const ws=this.sockets.get(cid);if(!ws)return;try{ws.send(JSON.stringify(obj));}catch{}}
  async fetch(request){
    const url=new URL(request.url);
    await this.setup(url.searchParams.get('code'));
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);
    server.accept();
    let cid=null;
    server.addEventListener('message',ev=>{
      let msg;try{msg=JSON.parse(typeof ev.data==='string'?ev.data:'');}catch{return;}
      if(!msg)return;
      if(msg.t==='hello'){
        if(cid)return;
        if(typeof msg.cid!=='string')return;
        const old=this.sockets.get(msg.cid);if(old&&old!==server){try{old.close(4000,'replaced');}catch{}}
        this.sockets.set(msg.cid,server); // registered first so join() can send welcome/lobby/kickoff straight away
        const res=this.engine.join(msg.cid,msg.name);
        if(res.error){this.sockets.delete(msg.cid);if(old)this.sockets.set(msg.cid,old);server.send(JSON.stringify({t:'error',msg:res.error==='full'?'방이 꽉 찼어요.':'접속 정보를 확인해 주세요.'}));server.close(4001,res.error);return;}
        cid=msg.cid;this.syncLoop();
        return;
      }
      if(!cid)return;
      this.engine.handle(cid,msg);
      this.syncLoop();
    });
    const gone=()=>{if(cid&&this.sockets.get(cid)===server){this.sockets.delete(cid);this.engine.leave(cid);}this.syncLoop();};
    server.addEventListener('close',gone);server.addEventListener('error',gone);
    return new Response(null,{status:101,webSocket:client});
  }
  /* run the match clock only while a match is on and someone is connected */
  syncLoop(){
    const want=this.engine&&this.engine.phase==='match'&&this.sockets.size>0;
    if(want&&!this.timer){
      let last=Date.now(),acc=0;const ms=TICK*STEPS_PER_SEND*1000;
      this.timer=setInterval(()=>{
        const now=Date.now();acc+=now-last;last=now;
        let n=0;while(acc>=ms&&n<4){this.engine.tick();acc-=ms;n++;}
        if(n===4)acc=0;
        if(this.engine.phase!=='match')this.syncLoop();
      },ms/2);
    }else if(!want&&this.timer){clearInterval(this.timer);this.timer=null;}
  }
}
