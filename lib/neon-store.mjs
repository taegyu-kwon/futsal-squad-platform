import {neon} from '@neondatabase/serverless';
import {createHash,randomUUID} from 'node:crypto';
const CHUNK=2000000;
export function createNeonStore(env){
 if(!env.DATABASE_URL)throw Error('Missing database connection');
 const sql=neon(env.DATABASE_URL);
 const store={
  async read(){return (await sql`SELECT * FROM shared_team WHERE id='team'`)[0]||null;},
  async save(snapshot,expected,userId){return (await sql`UPDATE shared_team SET snapshot=${JSON.stringify(snapshot)}::jsonb,revision=revision+1,updated_at=now(),updated_by=${userId} WHERE id='team' AND revision=${expected} RETURNING *`)[0]||null;},
  async importSnapshot(row){await sql`INSERT INTO shared_team(id,revision,snapshot,updated_at,updated_by) VALUES('team',${row.revision},${JSON.stringify(row.snapshot)}::jsonb,${row.updated_at},${row.updated_by})`;},
  async consumeLoginAttempt(ip){
   const key=createHash('sha256').update(ip||'unknown').digest('hex'),bucket=Math.floor(Date.now()/900000);
   await sql`DELETE FROM login_attempts WHERE bucket < ${bucket-2}`;
   return (await sql`INSERT INTO login_attempts(key,bucket,count) VALUES(${key},${bucket},1) ON CONFLICT(key,bucket) DO UPDATE SET count=login_attempts.count+1 WHERE login_attempts.count<10 RETURNING count`).length>0;
  },
  async mediaUrl(hash){return (await sql`SELECT hash FROM team_media WHERE hash=${hash}`).length?'/api/media/'+hash:null;},
  async download(hash){const row=(await sql`SELECT content_type,encode(bytes,'base64') AS encoded FROM team_media WHERE hash=${hash}`)[0];return row?new Blob([Buffer.from(row.encoded,'base64')],{type:row.content_type}):null;},
  async importMedia(hash,bytes,type){
   if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Media hash mismatch');
   await sql`INSERT INTO team_media(hash,content_type,bytes) VALUES(${hash},${type},decode(${bytes.toString('base64')},'base64')) ON CONFLICT(hash) DO NOTHING`;
   const actual=await store.download(hash);if(!actual||createHash('sha256').update(Buffer.from(await actual.arrayBuffer())).digest('hex')!==hash)throw Error('Media verification failed');
  },
  async signUpload(hash,type,size){
   await sql`DELETE FROM media_uploads WHERE expires_at<now()`;
   const id=randomUUID();await sql`INSERT INTO media_uploads(id,hash,content_type,size) VALUES(${id},${hash},${type},${size})`;
   return {uploadId:id,chunkSize:CHUNK};
  },
  async uploadChunk(id,index,bytes){
   if(!Number.isInteger(index)||index<0||index>3||bytes.length>CHUNK)return false;
   return (await sql`INSERT INTO media_chunks(upload_id,part,bytes) SELECT id,${index},decode(${bytes.toString('base64')},'base64') FROM media_uploads WHERE id=${id} AND expires_at>now() AND ${index}::integer*${CHUNK}::integer<size AND ${bytes.length}=LEAST(${CHUNK}::integer,size-${index}::integer*${CHUNK}::integer) ON CONFLICT(upload_id,part) DO UPDATE SET bytes=EXCLUDED.bytes RETURNING part`).length>0;
  },
  async completeUpload(id,hash){
   const row=(await sql`SELECT * FROM media_uploads WHERE id=${id} AND hash=${hash} AND expires_at>now()`)[0];if(!row)return false;
   const parts=await sql`SELECT part,encode(bytes,'base64') AS encoded FROM media_chunks WHERE upload_id=${id} ORDER BY part`;
   if(parts.length!==Math.ceil(row.size/CHUNK)||parts.some((p,i)=>p.part!==i))return false;
   const bytes=Buffer.concat(parts.map(p=>Buffer.from(p.encoded,'base64')));
   const type=bytes.subarray(0,4).equals(Buffer.from([137,80,78,71]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;
   if(bytes.length!==row.size||!type||type!==row.content_type||createHash('sha256').update(bytes).digest('hex')!==hash)return false;
   await store.importMedia(hash,bytes,type);await sql`DELETE FROM media_uploads WHERE id=${id}`;return true;
  }
 };
 return store;
}
