import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {createNeonStore} from '../lib/neon-store.mjs';
const sql=neon(process.env.DATABASE_URL),store=createNeonStore(process.env);
if(await store.read())throw Error('Run before import on empty destination');
const ip='migration-test-'+randomUUID(),key=createHash('sha256').update(ip).digest('hex');
const bytes=Buffer.alloc(3000000,1);Buffer.from([137,80,78,71]).copy(bytes);const hash=createHash('sha256').update(bytes).digest('hex');let upload;
try{
 await store.importSnapshot({revision:0,snapshot:{data:{},photos:{}},updated_at:new Date().toISOString(),updated_by:'migration-test'});
 const saves=await Promise.all([store.save({data:{a:'one'},photos:{}},0,'migration-test'),store.save({data:{a:'two'},photos:{}},0,'migration-test')]);assert.equal(saves.filter(Boolean).length,1);assert.equal((await store.read()).revision,1);
 const attempts=await Promise.all(Array.from({length:12},()=>store.consumeLoginAttempt(ip)));assert.equal(attempts.filter(Boolean).length,10);
 upload=await store.signUpload(hash,'image/png',bytes.length);
 assert.equal(await store.uploadChunk(upload.uploadId,0,bytes.subarray(0,2000000)),true);
 assert.equal(await store.completeUpload(upload.uploadId,hash),false);
 assert.equal(await store.uploadChunk(upload.uploadId,1,bytes.subarray(2000000)),true);
 assert.equal(await store.completeUpload(upload.uploadId,hash),true);
 assert.equal(createHash('sha256').update(Buffer.from(await(await store.download(hash)).arrayBuffer())).digest('hex'),hash);
 console.log('Neon verified: concurrent save conflict, rate limit, chunked upload, complete download.');
}finally{
 await sql`DELETE FROM shared_team WHERE updated_by='migration-test'`;
 await sql`DELETE FROM team_media WHERE hash=${hash}`;
 if(upload)await sql`DELETE FROM media_uploads WHERE id=${upload.uploadId}`;
 await sql`DELETE FROM login_attempts WHERE key=${key}`;
}
