/* Images stay on this device; IndexedDB keeps them separate from match data. */
(function(root){
  function cropRect(width,height,zoom=1,x=50,y=50){
    const ratio=512/544,z=Math.max(.25,Math.min(4,Number(zoom)||1));
    const w=Math.min(width,height*ratio)/z,h=w/ratio;
    return {x:(width-w)*Math.max(0,Math.min(100,x))/100,y:(height-h)*Math.max(0,Math.min(100,y))/100,width:w,height:h};
  }
  const bounded=(v,a,b)=>Math.max(a,Math.min(b,v));
  function fromRect(width,height,zoom,left,top){const r=cropRect(width,height,zoom);return {zoom:bounded(zoom,.25,4),x:Math.abs(width-r.width)>1e-8?bounded(left/(width-r.width)*100,0,100):50,y:Math.abs(height-r.height)>1e-8?bounded(top/(height-r.height)*100,0,100):50};}
  function panCrop(width,height,t,dx,dy,vw,vh){const r=cropRect(width,height,t.zoom,t.x,t.y);return fromRect(width,height,t.zoom,r.x-dx*r.width/vw,r.y-dy*r.height/vh);}
  function zoomCrop(width,height,t,zoom,ax=.5,ay=.5){const r=cropRect(width,height,t.zoom,t.x,t.y),next=cropRect(width,height,zoom);return fromRect(width,height,zoom,r.x+ax*(r.width-next.width),r.y+ay*(r.height-next.height));}
  function gestureCrop(width,height,t,start,now,rect){
    if(start.length<2||now.length<2)return panCrop(width,height,t,now[0].x-start[0].x,now[0].y-start[0].y,rect.width,rect.height);
    const mid=p=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}),distance=p=>Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),a=mid(start),b=mid(now);
    const zoom=t.zoom*distance(now)/Math.max(1,distance(start)),next=zoomCrop(width,height,t,zoom,(a.x-rect.left)/rect.width,(a.y-rect.top)/rect.height);
    return panCrop(width,height,next,b.x-a.x,b.y-a.y,rect.width,rect.height);
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={cropRect,panCrop,zoomCrop,gestureCrop};return;}
  const urls=new Map(),originals=new Map(),editors=new Map();
  function clearEditor(id){const e=editors.get(id);if(e){URL.revokeObjectURL(e.source);if(e.cutout)URL.revokeObjectURL(e.cutout);}editors.delete(id);}
  function installEditor(id,value){clearEditor(id);if(value?.source instanceof Blob)editors.set(id,{source:URL.createObjectURL(value.source),cutout:value.cutout instanceof Blob?URL.createObjectURL(value.cutout):'',crop:{zoom:bounded(Number(value.crop?.zoom)||1,.25,4),x:bounded(Number(value.crop?.x??50),0,100),y:bounded(Number(value.crop?.y??50),0,100),view:value.crop?.view==='cutout'?'cutout':'original'}});}
  const database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('unit-fc-player-photos',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('portraits');
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db)};
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('사진 저장소가 다른 창에서 사용 중입니다.'));
  });
  const ready=database.then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('portraits','readonly'),request=tx.objectStore('portraits').openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(cursor){if(cursor.value instanceof Blob)urls.set(Number(cursor.key),URL.createObjectURL(cursor.value));else if(cursor.value?.image instanceof Blob){urls.set(Number(cursor.key),URL.createObjectURL(cursor.value.image));if(cursor.value.original instanceof Blob)originals.set(Number(cursor.key),URL.createObjectURL(cursor.value.original));}else if(cursor.value?.removed)urls.set(Number(cursor.key),'');installEditor(Number(cursor.key),cursor.value?.editor);cursor.continue()}};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  }));
  // A failed store must not prevent the rest of the app from opening.
  ready.catch(()=>{});
  async function write(id,blob,original,editor){
    await ready;const db=await database;
    await new Promise((resolve,reject)=>{const tx=db.transaction('portraits','readwrite');const store=tx.objectStore('portraits');if(blob)store.put(editor?{image:blob,original,editor}:original?{image:blob,original}:blob,id);else store.put({removed:true},id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
    if(window.TeamSync)await TeamSync.photoSaved(id,blob);
    installEditor(id,editor);
    const old=urls.get(id);if(blob)urls.set(id,URL.createObjectURL(blob));else urls.set(id,'');if(old)URL.revokeObjectURL(old);const oldOriginal=originals.get(id);if(original)originals.set(id,URL.createObjectURL(original));else originals.delete(id);if(oldOriginal)URL.revokeObjectURL(oldOriginal);
  }
  root.PlayerPhotos={exportLocal:async()=>{await ready;return Promise.all([...urls].map(async([id,url])=>[id,url?await (await fetch(url)).blob():null]));},ready,cropRect,panCrop,zoomCrop,gestureCrop,editorState:id=>editors.get(id),url:(id,fallback='')=>window.TeamSync?.photoUrl(id)??(urls.has(id)?urls.get(id):fallback),originalUrl:id=>originals.get(id)||'',save:(id,blob,original,editor)=>write(id,blob,original,editor),remove:id=>write(id,null)};
})(typeof window!=='undefined'?window:globalThis);
