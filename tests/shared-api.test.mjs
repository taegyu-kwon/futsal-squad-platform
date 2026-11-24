import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,validateSnapshot} from '../worker/api.mjs';
function environment(){
 let row=null;const objects=new Map();
 return {TEAM_ADMIN_EMAIL:'owner@example.com',DB:{prepare(sql){return {bind(...args){return {async first(){return row;},async run(){if(sql.startsWith('INSERT')){if(row)return {meta:{changes:0}};const [id,revision,snapshot_key,updated_at,updated_by]=args;row={id,revision,snapshot_key,updated_at,updated_by};}else {const [revision,snapshot_key,updated_at,updated_by,id,expected]=args;if(!row||row.revision!==expected)return {meta:{changes:0}};row={id,revision,snapshot_key,updated_at,updated_by};}return {meta:{changes:1}};}};}};}},BUCKET:{async put(k,b,m){objects.set(k,{b,m});},async get(k){const o=objects.get(k);return o?{body:o.b,httpMetadata:o.m?.httpMetadata,json:async()=>JSON.parse(o.b)}:null;},async delete(k){objects.delete(k);}},objects};
}
function req(method,path,body,{admin=true,origin='https://team.test'}={}){return new Request('https://team.test'+path,{method,headers:{...(admin?{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.com'}:{}),'Origin':origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
const snapshot={expectedRevision:0,data:{'unit-fc-club-v1':JSON.stringify({name:'우리 팀'})},photos:{}};
test('public reads but cannot initialize or overwrite team',async()=>{const e=environment();assert.equal((await api(req('PUT','/api/shared',snapshot,{admin:false}),e)).status,403);assert.deepEqual(await (await api(req('GET','/api/shared',null,{admin:false}),e)).json(),{revision:0,data:null,photos:{},canEdit:false});assert.equal((await api(req('PUT','/api/shared',snapshot),e)).status,200);const publicData=await(await api(req('GET','/api/shared',null,{admin:false}),e)).json();assert.equal(publicData.revision,1);assert.equal(JSON.parse(publicData.data['unit-fc-club-v1']).name,'우리 팀');assert.equal(publicData.canEdit,false);});
test('stale saves cannot overwrite a newer snapshot',async()=>{const e=environment();await api(req('PUT','/api/shared',snapshot),e);assert.equal((await api(req('PUT','/api/shared',snapshot),e)).status,409);assert.equal((await api(req('PUT','/api/shared',{...snapshot,expectedRevision:1}),e)).status,200);assert.equal((await api(req('PUT','/api/shared',{...snapshot,expectedRevision:1}),e)).status,409);assert.equal(e.objects.size,2);});
test('writes require owner identity and same origin',async()=>{const e=environment();assert.equal((await api(req('PUT','/api/shared',snapshot,{origin:'https://evil.test'}),e)).status,403);const r=req('PUT','/api/shared',snapshot);r.headers.set('oai-authenticated-user-email','viewer@example.com');assert.equal((await api(r,e)).status,403);r.headers.set('oai-authenticated-user-email','owner@example.com');r.headers.delete('oai-authenticated-user-id');assert.equal((await api(r,e)).status,403);assert.equal(e.objects.size,0);});
test('only application keys and safe image references are accepted',()=>{assert.equal(validateSnapshot({...snapshot,data:{...snapshot.data,secret:'no'}}).data.secret,undefined);assert.throws(()=>validateSnapshot({...snapshot,photos:{9:'https://evil.test/x'}}));assert.throws(()=>validateSnapshot({...snapshot,data:{'unit-fc-club-v1':'not json'}}));assert.throws(()=>validateSnapshot({...snapshot,expectedRevision:-1}));});
test('media rejects anonymous uploads and fake images',async()=>{const e=environment();const r=req('POST','/api/media',null);r.headers.set('Content-Type','image/png');const invalid=new Request(r,{body:'not an image'});assert.equal((await api(invalid,e)).status,400);assert.equal((await api(req('POST','/api/media',null,{admin:false}),e)).status,403);const png=new Uint8Array([137,80,78,71,13,10,26,10]);const upload=new Request(r,{body:png});const result=await(await api(upload,e)).json();assert.match(result.url,/^\/api\/media\/[a-f0-9]{64}$/);const image=await api(req('GET',result.url,null,{admin:false}),e);assert.equal(image.status,200);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);});
test('only owner can persist availability and specialties; public readers see the result',async()=>{
 const e=environment(),key='unit-fc-player-traits-v1',body={...snapshot,data:{...snapshot.data,[key]:JSON.stringify({9:{status:'injured',traits:['중거리 슛','정확한 패스']}})}};
 assert.equal((await api(req('PUT','/api/shared',body,{admin:false}),e)).status,403);
 const other=req('PUT','/api/shared',body);other.headers.set('oai-authenticated-user-email','player@example.com');assert.equal((await api(other,e)).status,403);
 assert.equal((await api(req('PUT','/api/shared',body),e)).status,200);
 const current=await(await api(req('GET','/api/shared',null,{admin:false}),e)).json();assert.equal(JSON.parse(current.data[key])[9].status,'injured');assert.equal(current.canEdit,false);
 // A previously opened app has no new key. Its unrelated save must preserve it.
 assert.equal((await api(req('PUT','/api/shared',{...snapshot,expectedRevision:1}),e)).status,200);
 const preserved=await(await api(req('GET','/api/shared',null,{admin:false}),e)).json();assert.equal(preserved.data[key],body.data[key]);
 body.expectedRevision=2;body.data[key]=JSON.stringify({9:{status:'active',traits:[]}});assert.equal((await api(req('PUT','/api/shared',body),e)).status,200);
 const recovered=await(await api(req('GET','/api/shared',null,{admin:false}),e)).json();assert.deepEqual(JSON.parse(recovered.data[key])[9],{status:'active',traits:[]});
});
test('invalid availability and oversized specialties are rejected by server',async()=>{
 const key='unit-fc-player-traits-v1';
 for(const entry of [{9:{status:'unknown',traits:[]}},{999:{status:'active',traits:[]}},{9:{status:'injured',traits:['가'.repeat(25)]}},{9:{status:'active',traits:[4]}}]){
  const e=environment(),body={...snapshot,data:{[key]:JSON.stringify(entry)}};assert.equal((await api(req('PUT','/api/shared',body),e)).status,400);assert.equal(e.objects.size,0);
 }
});
