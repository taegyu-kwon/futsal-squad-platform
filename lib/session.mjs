import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export const cookieName='futsal_session';
const key=secret=>createHash('sha256').update(secret).digest();
export function sealSession(session,secret){
 if(!secret||secret.length<32)throw Error('Missing session secret');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,sessionExpires:Date.now()+7*86400000}),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function openSession(value,secret){
 try{
  if(!secret||secret.length<32||!value||value.length>10000)return null;
  const bytes=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',key(secret),bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  const session=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
  return session.sessionExpires>Date.now()&&typeof session.access_token==='string'?session:null;
 }catch{return null;}
}
export function sessionCookie(value,secure=true){return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value?604800:0}${secure?'; Secure':''}`;}
export function readSession(request,secret){const pair=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));return openSession(pair?.slice(cookieName.length+1),secret);}
