// iOS audio/video playback requests byte ranges, including a two-byte metadata probe.
export function videoResponse(request,bytes,baseHeaders={}){
 const length=bytes.byteLength,headers=new Headers({...baseHeaders,'Content-Type':baseHeaders['Content-Type']||'video/mp4','Accept-Ranges':'bytes','Content-Length':String(length)});
 const range=request.headers.get('Range');
 if(!range||request.method==='HEAD')return new Response(request.method==='HEAD'?null:bytes,{headers});
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);
 let start,end;
 if(match&&(match[1]||match[2])){
  if(!match[1]){const count=Number(match[2]);start=Math.max(0,length-count);end=length-1;}
  else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),length-1):length-1;}
 }
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=length||end<start){headers.set('Content-Range','bytes */'+length);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
 headers.set('Content-Range',`bytes ${start}-${end}/${length}`);headers.set('Content-Length',String(end-start+1));
 return new Response(bytes.slice(start,end+1),{status:206,headers});
}
