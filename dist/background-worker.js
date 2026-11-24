import {FilesetResolver,ImageSegmenter} from './vendor/mediapipe/vision_bundle.mjs';
let segmenter;
self.onmessage=async({data:{bitmap}})=>{
  try{
    if(!segmenter){
      self.postMessage({stage:'loading'});
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',import.meta.url).href,true);
      segmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/selfie_segmenter.tflite',import.meta.url).href,delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
    }
    self.postMessage({stage:'processing'});
    const result=segmenter.segment(bitmap);
    try{
      const labels=segmenter.getLabels(),personIndex=labels.findIndex(label=>/person|selfie|foreground/i.test(label));
      const mask=result.confidenceMasks?.[personIndex>=0?personIndex:(result.confidenceMasks.length===1?0:1)];
      if(!mask)throw new Error('인물 영역을 찾지 못했습니다.');
      const values=mask.getAsFloat32Array(),pixels=new ImageData(mask.width,mask.height);let foreground=0;
      for(let i=0;i<values.length;i++){
        // A smooth transition suppresses background halos while keeping a soft hair edge.
        const t=Math.max(0,Math.min(1,(values[i]-.2)/.6));
        const alpha=Math.round(255*t*t*(3-2*t));
        pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=alpha;
        if(alpha>128)foreground++;
      }
      if(foreground/values.length<.01)throw new Error('인물을 찾지 못했습니다. 얼굴과 상반신이 보이는 사진을 선택해 주세요.');
      const maskCanvas=new OffscreenCanvas(mask.width,mask.height);maskCanvas.getContext('2d').putImageData(pixels,0,0);
      const output=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=output.getContext('2d');
      ctx.drawImage(bitmap,0,0);ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(maskCanvas,0,0,bitmap.width,bitmap.height);
      const blob=await output.convertToBlob({type:'image/png'});
      self.postMessage({blob,stage:'done'});
    }finally{result.close();}
  }catch(error){self.postMessage({error:error.message||'배경 제거를 완료하지 못했습니다.'});}
  finally{bitmap.close();}
};
