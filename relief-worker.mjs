import { createReliefPainter } from './relief-surface.mjs';

let paint, canvas, context;
self.onmessage=({data})=>{
  try {
    if(data.artwork){
      paint=createReliefPainter(data.artwork,data.relief,data.depth);
      canvas=new OffscreenCanvas(1,1);
      context=canvas.getContext('2d',{alpha:false});
      self.postMessage({ready:true});
      return;
    }
    const {pose}=data;
    const pixels=paint(pose);
    if(canvas.width!==pose.w || canvas.height!==pose.h){
      canvas.width=pose.w;canvas.height=pose.h;
    }
    context.putImageData(pixels,0,0);
    const bitmap=canvas.transferToImageBitmap();
    self.postMessage({bitmap,pose},[bitmap]);
  }catch{self.postMessage({error:true});}
};
