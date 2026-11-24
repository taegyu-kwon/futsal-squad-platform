import {test} from 'node:test';
import assert from 'node:assert/strict';
import {videoResponse} from '../worker/static-media.mjs';
const bytes=new Uint8Array([1,2,3,4,5,6]);
const get=range=>new Request('https://example.test/knight.mp4',{headers:range?{Range:range}:{}});
test('video supports Safari metadata probes and remaining byte ranges',async()=>{
 let r=videoResponse(get('bytes=0-1'),bytes);
 assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-1/6');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2]);
 r=videoResponse(get('bytes=2-'),bytes);assert.equal(r.headers.get('Content-Length'),'4');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[3,4,5,6]);
 r=videoResponse(get('bytes=-2'),bytes);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[5,6]);
});
test('whole video, HEAD, and invalid ranges have correct responses',async()=>{
 const whole=videoResponse(get(),bytes);assert.equal(whole.status,200);assert.equal(whole.headers.get('Content-Type'),'video/mp4');assert.equal(whole.headers.get('Accept-Ranges'),'bytes');
 const head=videoResponse(new Request('https://example.test/knight.mp4',{method:'HEAD'}),bytes);assert.equal(head.headers.get('Content-Length'),'6');assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const range of ['bytes=6-','bytes=4-2','bytes=-0','bytes=bad','bytes=0-1,3-4'])assert.equal(videoResponse(get(range),bytes).status,416);
});
test('AAC music serves correct audio MIME, byte ranges, and HEAD for mobile playback',async()=>{
 const headers={'Content-Type':'audio/mp4'},url='https://example.test/music.m4a';
 const probe=videoResponse(new Request(url,{headers:{Range:'bytes=0-1'}}),bytes,headers);assert.equal(probe.status,206);assert.equal(probe.headers.get('Content-Type'),'audio/mp4');assert.deepEqual([...new Uint8Array(await probe.arrayBuffer())],[1,2]);
 const head=videoResponse(new Request(url,{method:'HEAD'}),bytes,headers);assert.equal(head.headers.get('Content-Type'),'audio/mp4');assert.equal((await head.arrayBuffer()).byteLength,0);
});
