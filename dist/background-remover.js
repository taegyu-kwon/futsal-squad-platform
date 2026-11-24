/* Inference runs in a worker. Only app-hosted code/model assets are fetched. */
window.BackgroundRemover=(()=>{
  let worker=null,pending=null,revision=0;
  function cancel(){revision++;if(worker){worker.terminate();worker=null}if(pending){clearTimeout(pending.timer);pending.reject(new Error('cancelled'));pending=null}}
  async function remove(image,onProgress=()=>{}){
    cancel();const request=revision;
    if(!window.Worker||!window.OffscreenCanvas||!window.createImageBitmap)throw new Error('이 브라우저에서는 배경 제거를 지원하지 않습니다. 최신 Chrome 또는 Safari에서 다시 시도해 주세요.');
    // Bound memory and inference input size for phones. Original remains untouched.
    const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const bitmap=await createImageBitmap(canvas);
    if(request!==revision){bitmap.close();throw new Error('cancelled')}
    return new Promise((resolve,reject)=>{
      const finish=(error,blob)=>{if(request!==revision)return;clearTimeout(pending?.timer);pending=null;if(worker){worker.terminate();worker=null}error?reject(error):resolve(blob)};
      try{
        worker=new Worker(new URL('background-worker.js?v=10',document.baseURI),{type:'module'});
        pending={reject,timer:setTimeout(()=>finish(new Error('처리 시간이 길어지고 있습니다. 네트워크를 확인하고 다시 시도해 주세요.')),60000)};
        worker.onmessage=({data})=>{if(data.error)finish(new Error(data.error));else if(data.blob)finish(null,data.blob);else onProgress(data.stage)};
        worker.onerror=()=>finish(new Error('배경 제거 도구를 실행하지 못했습니다. 잠시 후 다시 시도하거나 다른 브라우저를 사용해 주세요.'));
        worker.postMessage({bitmap},[bitmap]);
      }catch(error){bitmap.close();finish(error)}
    });
  }
  return {remove,cancel};
})();
