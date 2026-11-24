const KEYS=['unit-fc-club-v1','unit-fc-pilot-roster-v1','unit-fc-player-info-v1','unit-fc-player-traits-v1','unit-fc-squads-v1','unit-fc-v1'];
const noCache={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(body,status=200)=>Response.json(body,{status,headers:noCache});
export function isAdmin(request,env){const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');return Boolean(id&&email&&env.TEAM_ADMIN_EMAIL&&email.toLowerCase()===env.TEAM_ADMIN_EMAIL.toLowerCase());}
export function validateSnapshot(input){
 if(!input||!Number.isInteger(input.expectedRevision)||input.expectedRevision<0||!input.data||typeof input.data!=='object'||Array.isArray(input.data))throw Error('잘못된 공유 데이터입니다.');
 const data={};for(const key of KEYS){const value=input.data[key];if(value===undefined||value===null)continue;if(typeof value!=='string')throw Error('잘못된 저장 형식입니다.');const parsed=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('잘못된 저장 형식입니다.');data[key]=value;}
 const traitsKey='unit-fc-player-traits-v1';
 if(data[traitsKey])for(const [id,value] of Object.entries(JSON.parse(data[traitsKey]))){
  if(!/^(9|10[1-9]|110|111)$/.test(id)||!value||!['active','injured'].includes(value.status)||!Array.isArray(value.traits)||value.traits.length>8||value.traits.some(t=>typeof t!=='string'||!t.trim()||Array.from(t).length>24))throw Error('선수 현황 또는 특기를 확인해 주세요.');
 }
 const photos={};for(const [id,path] of Object.entries(input.photos||{})){if(!/^(9|10[1-9]|110|111)$/.test(id)||typeof path!=='string'||(path!==''&&!/^\/api\/media\/[a-f0-9]{64}$/.test(path)))throw Error('잘못된 사진 정보입니다.');photos[id]=path;}
 return {data,photos};
}
export async function api(request,env){
 const url=new URL(request.url),path=url.pathname,admin=isAdmin(request,env);
 if(!path.startsWith('/api/'))return null;
 try{
  if(path==='/api/shared'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT * FROM shared_team WHERE id = ?').bind('team').first();
   if(!row)return json({revision:0,data:null,photos:{},canEdit:admin});
   const snapshot=await env.BUCKET.get(row.snapshot_key);if(!snapshot)throw Error('공유 데이터 파일을 찾을 수 없습니다.');
   return json({...await snapshot.json(),revision:row.revision,updatedAt:row.updated_at,canEdit:admin});
  }
  if(path.startsWith('/api/media/')&&request.method==='GET'){
   const hash=path.slice('/api/media/'.length);if(!/^[a-f0-9]{64}$/.test(hash))return json({error:'사진을 찾을 수 없습니다.'},404);
   const object=await env.BUCKET.get('media/'+hash);if(!object)return json({error:'사진을 찾을 수 없습니다.'},404);
   return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
  }
  if(!admin)return json({error:'관리자 로그인이 필요합니다.'},403);
  if(request.headers.get('Origin')!==url.origin)return json({error:'허용되지 않은 요청입니다.'},403);
  if(path==='/api/media'&&request.method==='POST'){
   const type=request.headers.get('Content-Type')||'';if(!['image/png','image/jpeg','image/webp'].includes(type))return json({error:'PNG, JPG, WebP만 업로드할 수 있습니다.'},400);
   if(Number(request.headers.get('Content-Length'))>8000000)return json({error:'사진이 너무 큽니다.'},413);
   const buffer=await request.arrayBuffer();if(buffer.byteLength>8000000)return json({error:'사진이 너무 큽니다.'},413);
   const b=new Uint8Array(buffer);const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71,jpeg=b[0]===255&&b[1]===216,webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
   if(!(type==='image/png'?png:type==='image/jpeg'?jpeg:webp))return json({error:'이미지 형식이 올바르지 않습니다.'},400);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');
   await env.BUCKET.put('media/'+hash,buffer,{httpMetadata:{contentType:type}});return json({url:'/api/media/'+hash});
  }
  if(path==='/api/shared'&&request.method==='PUT'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON 형식이 필요합니다.'},400);
   if(Number(request.headers.get('Content-Length'))>8000000)return json({error:'데이터가 너무 큽니다.'},413);
   const text=await request.text();if(new TextEncoder().encode(text).length>8000000)return json({error:'데이터가 너무 큽니다.'},413);
   let input,snapshot;try{input=JSON.parse(text);snapshot=validateSnapshot(input);}catch(error){return json({error:error.message},400);}
   // An older open tab does not know this key; preserve it during unrelated saves.
   const traitsKey='unit-fc-player-traits-v1';
   if(!Object.hasOwn(snapshot.data,traitsKey)&&input.expectedRevision>0){
    const current=await env.DB.prepare('SELECT * FROM shared_team WHERE id = ?').bind('team').first();
    if(current&&current.revision===input.expectedRevision){
     const previous=await env.BUCKET.get(current.snapshot_key);if(!previous)throw Error('기존 선수 정보를 읽지 못했습니다.');
     const old=await previous.json();if(old.data?.[traitsKey])snapshot.data[traitsKey]=old.data[traitsKey];
    }
   }
   const now=new Date().toISOString(),revision=input.expectedRevision+1,key='snapshots/'+crypto.randomUUID()+'.json';
   await env.BUCKET.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
   const result=input.expectedRevision===0
    ?await env.DB.prepare('INSERT OR IGNORE INTO shared_team (id, revision, snapshot_key, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)').bind('team',revision,key,now,request.headers.get('oai-authenticated-user-id')).run()
    :await env.DB.prepare('UPDATE shared_team SET revision = ?, snapshot_key = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?').bind(revision,key,now,request.headers.get('oai-authenticated-user-id'),'team',input.expectedRevision).run();
   if(result.meta.changes!==1){await env.BUCKET.delete(key);return json({error:'다른 기기에서 먼저 저장했습니다. 입력값은 이 기기에 보관되어 있습니다. 새로고침 후 최신 데이터를 확인해 주세요.'},409);}
   return json({revision,updatedAt:now});
  }
  return json({error:'지원하지 않는 요청입니다.'},405);
 }catch(error){console.error('Shared data API failed:',error.message);return json({error:'공유 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
