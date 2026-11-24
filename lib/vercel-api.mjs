import {createHash} from 'node:crypto';
import {validateSnapshot} from '../worker/api.mjs';
import {readSession,sealSession,sessionCookie} from './session.mjs';
import {ownerAuthRoute,ownerSession} from './owner-auth.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const validHash=h=>/^[a-f0-9]{64}$/.test(h);
const isOwner=(user,env)=>Boolean(user?.id&&user.email_confirmed_at&&user.email?.toLowerCase()===env.TEAM_ADMIN_EMAIL?.toLowerCase());
export async function handleApi(request,env,store){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const secure=url.protocol==='https:';
 let newCookie;
 const finish=response=>{if(newCookie)response.headers.set('Set-Cookie',newCookie);return response;};
 try{
  if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')!==url.origin)return json({error:'허용되지 않은 요청입니다.'},403);
  if(env.AUTH_PROVIDER==='credentials'){
   const authResponse=await ownerAuthRoute(request,env,store);if(authResponse)return authResponse;
  }
  if(path==='/api/media'&&method==='POST')return json({error:'사진 업로드 화면을 새로고침해 주세요.'},400);
  const session=env.AUTH_PROVIDER==='credentials'?null:readSession(request,env.SESSION_SECRET);
  let user=env.AUTH_PROVIDER==='credentials'?await ownerSession(request,env,store):session?await store.user(session.access_token):null;
  if(session&&!user&&session.refresh_token){
   const renewed=await store.refresh(session.refresh_token);
   if(renewed?.session&&isOwner(renewed.user,env)){user=renewed.user;session.access_token=renewed.session.access_token;newCookie=sessionCookie(sealSession(renewed.session,env.SESSION_SECRET),secure);}
  }
  const admin=isOwner(user,env);
  if(path==='/api/auth/session'&&method==='GET')return finish(json({canEdit:admin}));
  if(path==='/api/auth/login'&&method==='POST'){
   const body=await request.json();
   if(typeof body.email!=='string'||typeof body.password!=='string'||body.password.length>1024||body.email.trim().toLowerCase()!==env.TEAM_ADMIN_EMAIL?.toLowerCase())return json({error:'이메일 또는 비밀번호를 확인해 주세요.'},401);
   const result=await store.signIn(body.email.trim(),body.password);
   if(!result?.session||!isOwner(result.user,env))return json({error:'이메일 또는 비밀번호를 확인해 주세요.'},401);
   const response=json({canEdit:true});response.headers.set('Set-Cookie',sessionCookie(sealSession(result.session,env.SESSION_SECRET),secure));return response;
  }
  if(path==='/api/auth/logout'&&method==='POST'){
   if(session)await store.signOut(session.access_token);
   const response=json({ok:true});response.headers.set('Set-Cookie',sessionCookie('',secure));return response;
  }
  if(path==='/api/shared'&&method==='GET'){
   const row=await store.read();
   if(!row)return finish(json({error:'선수 데이터 이전을 준비하고 있습니다.'},503));
   return finish(json({...row.snapshot,revision:row.revision,updatedAt:row.updated_at,canEdit:admin}));
  }
  if(path.startsWith('/api/media/')&&method==='GET'){
   const hash=path.slice('/api/media/'.length);if(!validHash(hash))return json({error:'사진을 찾을 수 없습니다.'},404);
   if(store.completeUpload){const blob=await store.download(hash);if(!blob)return json({error:'사진을 찾을 수 없습니다.'},404);return new Response(blob.stream(),{headers:{'Content-Type':blob.type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}
   const location=await store.mediaUrl(hash);if(!location)return json({error:'사진을 찾을 수 없습니다.'},404);
   return new Response(null,{status:307,headers:{...headers,Location:location}});
  }
  if(!admin)return json({error:'관리자 로그인이 필요합니다.'},403);
  if(path.startsWith('/api/media/chunk/')&&method==='POST'&&store.uploadChunk){
   const match=path.match(/^\/api\/media\/chunk\/([a-f0-9-]{36})\/([0-3])$/);if(!match)return json({error:'잘못된 업로드입니다.'},400);
   const bytes=Buffer.from(await request.arrayBuffer());if(!await store.uploadChunk(match[1],Number(match[2]),bytes))return json({error:'사진 조각을 저장하지 못했습니다.'},400);return json({ok:true});
  }
  if(path==='/api/media/sign'&&method==='POST'){
   const body=await request.json();
   if(!validHash(body.hash)||!['image/png','image/jpeg','image/webp'].includes(body.type)||!Number.isInteger(body.size)||body.size<1||body.size>8000000)return json({error:'8MB 이하의 PNG, JPG, WebP 사진을 선택해 주세요.'},400);
   // Existing content-addressed images are immutable and can be reused.
   if(await store.mediaUrl(body.hash))return finish(json({url:'/api/media/'+body.hash,exists:true}));
   const upload=await store.signUpload(body.hash,body.type,body.size);
   return finish(json({uploadUrl:upload.signedUrl,uploadId:upload.uploadId,chunkSize:upload.chunkSize,url:'/api/media/'+body.hash}));
  }
  if(path==='/api/media/complete'&&method==='POST'){
   const {hash,uploadId}=await request.json();if(!validHash(hash))return json({error:'잘못된 사진 정보입니다.'},400);
   if(uploadId&&store.completeUpload){if(!/^[a-f0-9-]{36}$/.test(uploadId)||!await store.completeUpload(uploadId,hash))return json({error:'사진 검증에 실패했습니다.'},400);}
   const blob=await store.download(hash);if(!blob||blob.size>8000000)return json({error:'사진 업로드를 완료하지 못했습니다.'},400);
   const bytes=Buffer.from(await blob.arrayBuffer());
   const mime=bytes.subarray(0,4).equals(Buffer.from([137,80,78,71]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;
   if(!mime||mime!==blob.type||createHash('sha256').update(bytes).digest('hex')!==hash)return json({error:'사진 검증에 실패했습니다. 다시 선택해 주세요.'},400);
   return finish(json({url:'/api/media/'+hash}));
  }
  if(path==='/api/shared'&&method==='PUT'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON 형식이 필요합니다.'},400);
   const text=await request.text();if(Buffer.byteLength(text)>4000000)return json({error:'저장할 데이터가 너무 큽니다.'},413);
   let input,snapshot;try{input=JSON.parse(text);snapshot=validateSnapshot(input);}catch{return json({error:'선수 정보 형식을 확인해 주세요.'},400);}
   const key='unit-fc-player-traits-v1';
   if(!Object.hasOwn(snapshot.data,key)){
    const old=await store.read();if(old?.revision===input.expectedRevision&&old.snapshot.data?.[key])snapshot.data[key]=old.snapshot.data[key];
   }
   const row=await store.save(snapshot,input.expectedRevision,user.id);
   if(!row)return finish(json({error:'다른 기기에서 먼저 저장했습니다. 새로고침 후 최신 정보를 확인해 주세요.'},409));
   return finish(json({revision:row.revision,updatedAt:row.updated_at}));
  }
  return finish(json({error:'지원하지 않는 요청입니다.'},405));
 }catch(error){console.error('Team API failed',error?.name||'Error');return json({error:'공유 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
}
