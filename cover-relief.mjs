// Ray-cast the continuous height field into ONE color surface. CSS still owns
// the card's perspective and flip, just as it does for story and ending cards.
async function loadImage(src) {
  const image=new Image();
  image.src=src;
  await image.decode();
  return image;
}

function readPixels(image,w,h) {
  const canvas=document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,w,h);
  return ctx.getImageData(0,0,w,h).data;
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

function makeSurface(picture,map,w,h,cssWidth,cssHeight,scale) {
  const rgb=readPixels(picture,w,h), material=readPixels(map,w,h);
  const height=new Float32Array(w*h), nx=new Float32Array(w*h), ny=new Float32Array(w*h);
  const nz=new Float32Array(w*h), tint=new Float32Array(w*h);
  for(let i=0;i<height.length;i++) height[i]=material[i*4]*scale/255;
  const px=w/cssWidth, py=h/cssHeight;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=y*w+x;
    const dx=(height[i+(x>0?-1:0)]-height[i+(x<w-1?1:0)])*.5*px;
    const dy=(height[i+(y>0?-w:0)]-height[i+(y<h-1?w:0)])*.5*py;
    const length=Math.hypot(dx,dy,1);
    nx[i]=dx/length; ny[i]=dy/length; nz[i]=1/length;
    // A fixed broad light brings out the bevel even when the card is still.
    tint[i]=1+.58*(-.41*nx[i]-.48*ny[i]+.78*(nz[i]-1));
  }
  const frame=new ImageData(w,h);
  const out=frame.data;
  const clampX=v=>Math.max(0,Math.min(w-1,v));
  const clampY=v=>Math.max(0,Math.min(h-1,v));
  return (yaw,pitch,shine)=>{
    // Looking almost parallel to the plane, compress the displacement smoothly.
    // The native flip supplies the edge silhouette.
    const vx=Math.sin(yaw)*Math.cos(pitch), vy=Math.sin(pitch), vz=Math.abs(Math.cos(yaw)*Math.cos(pitch));
    const sx=px*vx/Math.max(.60,vz), sy=py*vy/Math.max(.60,vz);
    const hx=-.41-vx,hy=-.48-vy,hz=.78+vz,len=Math.hypot(hx,hy,hz);
    const lx=hx/len,ly=hy/len,lz=hz/len;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      // First intersection from the viewer wins. No second, stationary artwork
      // exists underneath a raised silhouette, even where it hides nearby cloth.
      let z=scale, prev=1;
      for(;z>=0;z-=1) {
        const u=clampX(Math.round(x-sx*z)),v=clampY(Math.round(y-sy*z));
        const gap=z-height[v*w+u];
        if(gap<=0){z+=-gap/(prev-gap||1);break;}
        prev=gap;
      }
      const u=clampX(x-sx*z),v=clampY(y-sy*z),ix=Math.floor(u),iy=Math.floor(v);
      const i=iy*w+ix,j=i+(ix<w-1?1:0),k=i+(iy<h-1?w:0),m=k+(ix<w-1?1:0);
      const fx=u-ix,fy=v-iy, nearest=(fy<.5?(fx<.5?i:j):(fx<.5?k:m));
      const n=nearest,lit=Math.max(0,nx[n]*lx+ny[n]*ly+nz[n]*lz);
      let spec=lit*lit;spec*=spec;spec*=spec;spec*=spec;
      const band=Math.max(0,1-Math.abs(u/w+.35*v/h-.65+vx*.92-vy*.45)*2.4);
      const glint=material[n*4+1]*spec*band*(.13+.65*shine);
      const dst=(y*w+x)*4;
      for(let c=0;c<3;c++){
        const top=rgb[i*4+c]*(1-fx)+rgb[j*4+c]*fx;
        const bottom=rgb[k*4+c]*(1-fx)+rgb[m*4+c]*fx;
        out[dst+c]=(top*(1-fy)+bottom*fy)*tint[n]+glint*(1-c*.16);
      }
      out[dst+3]=255;
    }
    return frame;
  };
}

export async function enableCoverRelief(button,art) {
  if(!art.coverSurface)return;
  try {
    const [picture,map]=await prepareTextures(art);
    if(!button.isConnected)return;
    const tilt=button.querySelector('.display-tilt'),turn=button.querySelector('.card-turn');
    const faces=[...button.querySelectorAll('.book-face')].map(face=>{
      const canvas=document.createElement('canvas');
      canvas.className='relief-canvas';face.append(canvas);
      return canvas.getContext('2d',{alpha:false});
    });
    let paintSurface,signature='',previous='',pending=0,until=0,lastTime=0;
    let detailScale=1;
    function paint(time) {
      pending=0;
      if(!button.isConnected)return;
      if(time<until)pending=requestAnimationFrame(paint);
      if(time-lastTime<30 && pending)return;
      const width=button.clientWidth,height=button.clientHeight;
      if(!width||!height)return;
      // Increase detail once fingers lift, without rebuilding the relief map on every pinch move.
      if (!button.classList.contains('is-pinching')) detailScale=Math.max(1,Number(button.style.getPropertyValue('--card-zoom'))||1);
      const ratio=Math.min(devicePixelRatio*detailScale,1.65*detailScale,Math.min(800,490*detailScale)/width,picture.width/width);
      const w=Math.round(width*ratio),h=Math.round(height*ratio);
      const size=[w,h,width,height].join('/');
      if(size!==signature){
        paintSurface=makeSurface(picture,map,w,h,width,height,art.coverSurface.encodingDepth);
        for(const ctx of faces){ctx.canvas.width=w;ctx.canvas.height=h;}
        signature=size;previous='';
      }
      const transform=getComputedStyle(tilt).transform;
      const m=new DOMMatrixReadOnly(transform==='none'?undefined:transform);
      const flip=Math.PI*(parseFloat(getComputedStyle(turn).getPropertyValue('--turn-progress'))||0);
      const angle=Math.atan2(m.m31,m.m11)+flip;
      const back=Math.cos(angle)<0;
      const yaw=angle-(back?Math.PI:0),pitch=-Math.atan2(m.m23,m.m22);
      const shine=Math.max(parseFloat(getComputedStyle(button).getPropertyValue('--drag-shine'))||0,Math.abs(Math.sin(flip)));
      const state=[back,yaw.toFixed(3),pitch.toFixed(3),shine.toFixed(2)].join('/');
      if(state===previous)return;
      faces[Number(back)].putImageData(paintSurface(yaw,pitch,shine),0,0);
      faces[Number(back)].canvas.style.visibility='visible';
      previous=state;lastTime=time;
    }
    function refresh(){
      until=performance.now()+560;
      if(!pending)pending=requestAnimationFrame(paint);
    }
    for(const type of ['pointermove','pointerup','pointercancel','click','transitionrun'])button.addEventListener(type,refresh);
    const resize=new ResizeObserver(refresh);resize.observe(button);
    const cleanup=new MutationObserver(()=>{
      if(button.isConnected)return;
      resize.disconnect();cleanup.disconnect();cancelAnimationFrame(pending);
    });
    cleanup.observe(button.closest('#inspection'),{childList:true});
    refresh();
  } catch(error) { console.warn('Cover relief unavailable',error); }
}
