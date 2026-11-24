import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {createNeonStore} from '../lib/neon-store.mjs';
import {validateSnapshot} from '../worker/api.mjs';
const folder=process.argv[2];if(!folder)throw Error('Pass the backup directory');
const store=createNeonStore(process.env);
const manifest=JSON.parse(await readFile(join(resolve(folder),'manifest.json'),'utf8'));
const saved=JSON.parse(await readFile(join(resolve(folder),'snapshot.json'),'utf8'));
const snapshot=validateSnapshot({...saved,expectedRevision:saved.revision});
if(saved.revision!==manifest.revision)throw Error('Backup revisions do not match');
if(await store.read())throw Error('Destination already contains data; refusing to overwrite');
for(const media of manifest.media){
 if(!/^[a-f0-9]{64}$/.test(media.hash))throw Error('Invalid hash');
 const bytes=await readFile(join(resolve(folder),'media',media.hash));
 if(createHash('sha256').update(bytes).digest('hex')!==media.hash)throw Error('Backup checksum mismatch');
 await store.importMedia(media.hash,bytes,media.type);
}
await store.importSnapshot({id:'team',revision:saved.revision,snapshot,updated_at:saved.updatedAt||new Date().toISOString(),updated_by:'sites-migration'});
const row=await store.read();
for(const [key,value] of Object.entries(snapshot.data))if(row.snapshot.data[key]!==value)throw Error('Imported data mismatch');
for(const [key,value] of Object.entries(snapshot.photos))if(row.snapshot.photos[key]!==value)throw Error('Imported photo map mismatch');
console.log(JSON.stringify({revision:row.revision,mediaVerified:manifest.media.length,verified:true}));
