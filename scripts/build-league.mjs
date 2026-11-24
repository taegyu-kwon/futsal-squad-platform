/* Copies the files 흑표범 리그 needs into realtime/public for the Cloudflare Worker (static assets). */
import {cp,rm,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('realtime/public/',root);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const files=['futsal-league.html','futsal/core.js','futsal/scene.js','futsal/characters.js','futsal/league.js','futsal/league.css','futsal/game.css',
  'vendor/three/three.module.min.js','vendor/three/LICENSE','assets/team-emblem.png'];
for(const f of files)await cp(new URL('dist/'+f,root),new URL(f,out),{recursive:true});
console.log('Built realtime/public for 흑표범 리그 ('+files.length+' files).');
