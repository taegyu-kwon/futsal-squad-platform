import {cp,rm,mkdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await rm(new URL('public/',root),{recursive:true,force:true});
await mkdir(new URL('public/',root));
await cp(new URL('dist/',root),new URL('public/',root),{recursive:true,filter:p=>!p.split('/').some(s=>s==='server'||s==='.openai')});
const html=await readFile(new URL('public/index.html',root),'utf8');
if(!html.includes('admin-auth.js'))throw Error('Admin sign-in is missing');
console.log('Built static app; Vercel API handles shared data.');
