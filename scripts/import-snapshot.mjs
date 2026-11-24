// Run with Node --env-file=.env.local scripts/import-snapshot.mjs /absolute/backup-folder
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {validateSnapshot} from '../worker/api.mjs';
const folder=process.argv[2];if(!folder)throw Error('Pass the backup directory');
const env=process.env;if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase credentials required');
const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const manifest=JSON.parse(await readFile(join(resolve(folder),'manifest.json'),'utf8'));
const saved=JSON.parse(await readFile(join(resolve(folder),'snapshot.json'),'utf8'));
const snapshot=validateSnapshot({...saved,expectedRevision:saved.revision});
if(saved.revision!==manifest.revision)throw Error('Backup revisions do not match');
const {data:existing,error:readError}=await client.from('shared_team').select('revision').eq('id','team').maybeSingle();
if(readError)throw readError;if(existing)throw Error('Destination already has data; refusing to overwrite it');
const bucket=client.storage.from(env.SUPABASE_MEDIA_BUCKET||'team-media');
for(const media of manifest.media){
 if(!/^[a-f0-9]{64}$/.test(media.hash))throw Error('Invalid hash');
 const bytes=await readFile(join(resolve(folder),'media',media.hash));
 if(createHash('sha256').update(bytes).digest('hex')!==media.hash)throw Error('Backup checksum mismatch');
 const {error}=await bucket.upload('media/'+media.hash,bytes,{contentType:media.type,upsert:false});
 if(error&&String(error.statusCode)!=='409')throw error;
 const {data,error:verifyError}=await bucket.download('media/'+media.hash);if(verifyError)throw verifyError;
 if(createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex')!==media.hash)throw Error('Uploaded checksum mismatch');
}
const {error}=await client.from('shared_team').insert({id:'team',revision:saved.revision,snapshot,updated_at:saved.updatedAt||new Date().toISOString(),updated_by:'sites-migration'});if(error)throw error;
const {data:verified,error:verifyError}=await client.from('shared_team').select('*').eq('id','team').single();if(verifyError)throw verifyError;
for(const [k,v] of Object.entries(snapshot.data))if(verified.snapshot.data[k]!==v)throw Error('Imported data mismatch');
for(const [k,v] of Object.entries(snapshot.photos))if(verified.snapshot.photos[k]!==v)throw Error('Imported photo map mismatch');
console.log(JSON.stringify({revision:verified.revision,mediaVerified:manifest.media.length,verified:true}));
