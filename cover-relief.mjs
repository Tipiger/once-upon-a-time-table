import { createReliefPainter } from './relief-surface.mjs';

async function loadImage(src) {
  const image=new Image();
  image.src=src;
  await image.decode();
  return image;
}

let textureKey, textures;
function prepareTextures(art) {
  const key=JSON.stringify([art.cover,art.coverSurface]);
  if (textureKey!==key) {
    textureKey=key;
    textures=Promise.all([loadImage(art.cover),loadImage(art.coverSurface.map)]).catch(error=>{
      if(textureKey===key) textureKey=null;
      throw error;
    });
  }
  return textures;
}

export async function enableCoverRelief(button,art) {
  if(!art.coverSurface)return;
  try {
    const [picture,map]=await prepareTextures(art);
    if(!button.isConnected)return;
    const tilt=button.querySelector('.display-tilt'),turn=button.querySelector('.card-turn');
    const faces=[...button.querySelectorAll('.book-face')].map(face=>{
      const canvas=document.createElement('canvas');
      canvas.className='relief-canvas';
      face.append(canvas);
      return canvas.getContext('2d',{alpha:false});
    });
    const paintLocally=createReliefPainter(picture,map,art.coverSurface.encodingDepth);
    let worker=null,ready=false,busy=false,frame=0,until=0,refineTimer=0;
    let previousPose='',lastChange=0,submitted='',latest=null;

    function show(result,pose) {
      const ctx=faces[Number(pose.back)];
      if(ctx.canvas.width!==pose.w || ctx.canvas.height!==pose.h){
        ctx.canvas.width=pose.w;ctx.canvas.height=pose.h;
      }
      if(result instanceof ImageData)ctx.putImageData(result,0,0);
      else ctx.drawImage(result,0,0);
      ctx.canvas.style.visibility='visible';
    }
    function submit(){
      if(!ready || busy || !latest || latest.key===submitted || !button.isConnected)return;
      submitted=latest.key;
      if(worker){
        busy=true;
        worker.postMessage({pose:latest});
      }else show(paintLocally(latest),latest);
    }
    function fallback(){
      worker?.terminate();
      worker=null;busy=false;ready=true;submitted='';
      refresh();
    }
    function paint(time) {
      frame=0;
      if(!button.isConnected)return;
      if(time<until)frame=requestAnimationFrame(paint);
      const width=button.clientWidth,height=button.clientHeight;
      if(!width||!height)return;
      const transform=getComputedStyle(tilt).transform;
      const m=new DOMMatrixReadOnly(transform==='none'?undefined:transform);
      const flip=Math.PI*(parseFloat(getComputedStyle(turn).getPropertyValue('--turn-progress'))||0);
      const angle=Math.atan2(m.m31,m.m11)+flip,back=Math.cos(angle)<0;
      const yaw=angle-(back?Math.PI:0),pitch=-Math.atan2(m.m23,m.m22);
      const shine=Math.max(parseFloat(getComputedStyle(button).getPropertyValue('--drag-shine'))||0,Math.abs(Math.sin(flip)));
      const zoom=Math.max(1,Number(button.style.getPropertyValue('--card-zoom'))||1);
      const poseKey=[back,yaw.toFixed(3),pitch.toFixed(3),shine.toFixed(2),zoom.toFixed(2),width,height].join('/');
      if(poseKey!==previousPose){
        previousPose=poseKey;
        lastChange=time;
        clearTimeout(refineTimer);
        // Schedule a final full-resolution frame even when the browser throttles rAF.
        refineTimer=setTimeout(schedule,180);
      }
      const moving=time-lastChange<150 || button.classList.contains('is-pinching');
      const cap=moving ? (worker?360:240) : Math.min(800,490*zoom);
      const ratio=Math.min(devicePixelRatio*zoom,1.65*zoom,cap/width,picture.width/width);
      const w=Math.round(width*ratio),h=Math.round(height*ratio);
      latest={w,h,width,height,back,yaw,pitch,shine,key:poseKey+'/'+w};
      submit();
    }
    function schedule(){
      if(!frame && button.isConnected)frame=requestAnimationFrame(paint);
    }
    function refresh(){
      until=performance.now()+750;
      schedule();
    }
    for(const type of ['pointermove','pointerup','pointercancel','click','transitionrun'])button.addEventListener(type,refresh);
    const resize=new ResizeObserver(refresh);resize.observe(button);
    const cleanup=new MutationObserver(()=>{
      if(button.isConnected)return;
      worker?.terminate();worker=null;
      resize.disconnect();cleanup.disconnect();cancelAnimationFrame(frame);clearTimeout(refineTimer);
    });
    cleanup.observe(button.closest('#inspection'),{childList:true});
    if(typeof Worker==='function' && typeof OffscreenCanvas==='function' && typeof createImageBitmap==='function'){
      try {
        worker=new Worker(new URL('./relief-worker.mjs',import.meta.url),{type:'module'});
        worker.onerror=fallback;
        worker.onmessage=({data})=>{
          if(data.error){fallback();return;}
          if(data.bitmap){
            if(button.isConnected && (data.pose.key===latest?.key || data.pose.w<=360))show(data.bitmap,data.pose);
            data.bitmap.close();
          }
          ready=true;busy=false;
          submit();
        };
        const [artwork,relief]=await Promise.all([createImageBitmap(picture),createImageBitmap(map)]);
        if(!worker || !button.isConnected){artwork.close();relief.close();return;}
        worker.postMessage({artwork,relief,depth:art.coverSurface.encodingDepth},[artwork,relief]);
      }catch{fallback();}
    }else fallback();
    refresh();
  }catch(error){console.warn('Cover relief unavailable',error);}
}
