import { getReliefGL } from './relief-gl.mjs';

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
    textures=Promise.all([loadImage(art.coverSurface.artwork || art.cover),loadImage(art.coverSurface.map)]).catch(error=>{
      if(textureKey===key) textureKey=null;
      throw error;
    });
  }
  return textures;
}

// Start decoding while the gallery is open. Inspection shares this promise and can retry a failed preload.
export function preloadCoverRelief(art) {
  if (art?.coverSurface) prepareTextures(art).catch(()=>{});
}

export async function enableCoverRelief(button,art) {
  if(!art?.coverSurface)return;
  button.setAttribute('data-relief-pending','');
  try {
    const [picture,map]=await prepareTextures(art);
    if(!button.isConnected)return;
    const tilt=button.querySelector('.display-tilt'),turn=button.querySelector('.card-turn');
    const faces=[...button.querySelectorAll('.book-face')];
    for(const face of faces)face.style.backgroundImage='url('+JSON.stringify(picture.src)+')';
    let gpu=getReliefGL(picture,map,art.coverSurface.encodingDepth);
    let worker=null,ready=false,busy=false,frame=0,until=0,submitted='',latest=null;
    const rasterFaces=[];

    function revealFirstFrame(){
      if(!button.hasAttribute('data-relief-pending'))return;
      button.removeAttribute('data-relief-pending');
      refresh(); // Track the entire entry animation even after slow first-frame preparation.
    }

    function submit(){
      if(!latest || latest.key===submitted || !button.isConnected)return;
      if(gpu){
        const face=faces[Number(latest.back)];
        if(gpu.canvas.parentElement!==face)face.append(gpu.canvas);
        gpu.draw(latest);
        if(!gpu.gl.isContextLost()){
          gpu.canvas.style.visibility='visible';
          revealFirstFrame();
        }
      }else{
        if(!worker || !ready || busy)return;
        busy=true;
        worker.postMessage({pose:latest});
      }
      submitted=latest.key;
    }
    function paint(time){
      frame=0;
      if(!button.isConnected)return;
      if(time<until)frame=requestAnimationFrame(paint);
      const width=button.clientWidth,height=button.clientHeight;
      if(!width || !height)return;
      const transform=getComputedStyle(tilt).transform;
      const m=new DOMMatrixReadOnly(transform==='none'?undefined:transform);
      const flip=Math.PI*(parseFloat(getComputedStyle(turn).getPropertyValue('--turn-progress'))||0);
      const angle=Math.atan2(m.m31,m.m11)+flip,back=Math.cos(angle)<0;
      const yaw=angle-(back?Math.PI:0),pitch=-Math.atan2(m.m23,m.m22);
      const shine=Math.max(parseFloat(getComputedStyle(button).getPropertyValue('--drag-shine'))||0,Math.abs(Math.sin(flip)));
      const zoom=Number(button.style.getPropertyValue('--card-zoom'))||1;
      // Same texture density while moving or resting. Allocate in steps during a pinch.
      const w=Math.min(picture.naturalWidth,Math.ceil(width*devicePixelRatio*zoom*1.15/128)*128);
      const h=Math.round(height*w/width);
      const key=[back,yaw.toFixed(4),pitch.toFixed(4),shine.toFixed(2),width,height,w].join('/');
      latest={w,h,width,height,back,yaw,pitch,shine,key};
      submit();
    }
    function refresh(){
      until=performance.now()+600;
      if(!frame && button.isConnected)frame=requestAnimationFrame(paint);
    }
    function stopWorker(){
      worker?.terminate();
      worker=null;
      for(const ctx of rasterFaces)ctx?.canvas.remove();
    }
    function fallbackToArtwork(){
      stopWorker();
      button.removeAttribute('data-relief-pending');
    }
    async function startWorker(){
      if(typeof Worker!=='function' || typeof OffscreenCanvas!=='function' || typeof createImageBitmap!=='function'){fallbackToArtwork();return;}
      try{
        worker=new Worker(new URL('./relief-worker.mjs',import.meta.url),{type:'module'});
        worker.onerror=fallbackToArtwork;
        worker.onmessage=({data})=>{
          if(data.error){fallbackToArtwork();return;}
          if(data.bitmap){
            const {pose,bitmap}=data;
            // The worker coalesces input on the caller side; never queue an old series of tilts.
            if(button.isConnected && latest?.w===pose.w && latest.back===pose.back){
              const side=Number(pose.back);
              if(!rasterFaces[side]){
                const canvas=document.createElement('canvas');
                canvas.className='relief-canvas';
                faces[side].append(canvas);
                rasterFaces[side]=canvas.getContext('2d',{alpha:false});
              }
              const ctx=rasterFaces[side];
              if(!ctx){bitmap.close();fallbackToArtwork();return;}
              if(ctx.canvas.width!==pose.w || ctx.canvas.height!==pose.h){ctx.canvas.width=pose.w;ctx.canvas.height=pose.h;}
              ctx.drawImage(bitmap,0,0);
              ctx.canvas.style.visibility='visible';
              revealFirstFrame();
            }
            bitmap.close();
          }
          ready=true;busy=false;submit();
        };
        const [artwork,relief]=await Promise.all([createImageBitmap(picture),createImageBitmap(map)]);
        if(!worker || !button.isConnected){artwork.close();relief.close();return;}
        worker.postMessage({artwork,relief,depth:art.coverSurface.encodingDepth},[artwork,relief]);
      }catch{fallbackToArtwork();}
    }
    function onContextLost(){
      gpu.canvas.remove();
      gpu=null;submitted='';
      if(button.isConnected)startWorker();
    }
    if(gpu)gpu.canvas.addEventListener('webglcontextlost',onContextLost,{once:true});
    else startWorker();
    for(const type of ['pointermove','pointerup','pointercancel','click','transitionrun'])button.addEventListener(type,refresh);
    const resize=new ResizeObserver(refresh);resize.observe(button);
    const cleanup=new MutationObserver(()=>{
      if(button.isConnected)return;
      gpu?.canvas.removeEventListener('webglcontextlost',onContextLost);
      stopWorker();resize.disconnect();cleanup.disconnect();cancelAnimationFrame(frame);
    });
    cleanup.observe(button.closest('#inspection'),{childList:true});
    refresh();
  }catch(error){
    button.removeAttribute('data-relief-pending');
    console.warn('Cover relief unavailable',error);
  }
}
