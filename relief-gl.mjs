// A single displaced mesh carries the artwork. CSS handles the rigid tilt and flip.
// With depth testing, overlapping relief is resolved once even at grazing angles.
const vertex = `
attribute vec2 uv;
uniform sampler2D relief;
uniform vec2 faceSize;
uniform vec3 view;
uniform float depth;
varying highp vec2 surfaceUV;
void main() {
  surfaceUV = uv;
  vec2 edge = min(uv, 1.-uv);
  float z = texture2D(relief, uv).r * depth * smoothstep(0.,.008,min(edge.x,edge.y));
  vec2 projected = uv + (view.xy / max(.6, view.z)) * z / faceSize;
  gl_Position = vec4(projected * vec2(2., -2.) + vec2(-1., 1.), -z/(depth+1.), 1.);
}`;
const fragment = `
precision highp float;
uniform sampler2D artwork, relief;
uniform vec2 faceSize;
uniform vec3 view;
uniform float depth, shine;
varying highp vec2 surfaceUV;
void main() {
  vec2 uv = surfaceUV;
  vec2 stepUV = 1. / faceSize;
  vec2 slope = .5 * depth * vec2(
    texture2D(relief, uv-vec2(stepUV.x,0.)).r - texture2D(relief, uv+vec2(stepUV.x,0.)).r,
    texture2D(relief, uv-vec2(0.,stepUV.y)).r - texture2D(relief, uv+vec2(0.,stepUV.y)).r);
  vec3 normal = normalize(vec3(slope,1.));
  vec3 light = vec3(-.41,-.48,.78);
  float diffuse = 1.+.58*(dot(normal, light)-light.z);
  float specular = pow(max(dot(normal,normalize(light+vec3(-view.xy,view.z))),0.),16.);
  float band = max(0.,1.-abs(uv.x+.35*uv.y-.65+view.x*.92-view.y*.45)*2.4);
  float gold = texture2D(relief,uv).g * specular * band * (.13+.65*shine);
  gl_FragColor = vec4(texture2D(artwork,uv).rgb*diffuse + gold*vec3(1.,.84,.68),1.);
}`;

function compile(gl,type,source) {
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
  return shader;
}

function mesh(gl,program,aspect) {
  const nx=192, ny=Math.min(335,Math.ceil(nx*aspect));
  const uv=new Float32Array((nx+1)*(ny+1)*2);
  const indices=new Uint16Array(6*nx*ny);
  let n=0,i=0;
  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    uv[n++]=x/nx; uv[n++]=y/ny;
    if(x===nx || y===ny)continue;
    const a=y*(nx+1)+x,b=a+nx+1;
    indices[i++]=a;indices[i++]=b;indices[i++]=a+1;
    indices[i++]=a+1;indices[i++]=b;indices[i++]=b+1;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(program,'uv');
  gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  gl.enableVertexAttribArray(attr);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  return indices.length;
}

let cached;
export function getReliefGL(picture,map,depth) {
  if(cached?.picture===picture && cached.map===map && cached.depth===depth && !cached.gl.isContextLost()) return cached;
  cached?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  cached=null;
  const canvas=document.createElement('canvas');
  canvas.className='relief-canvas';
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:true,stencil:false});
  if(!gl)return null;
  try{
    if(!gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS))throw Error('Vertex textures unavailable');
    const p=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=compile(gl,type,source);
      gl.attachShader(p,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    const count=mesh(gl,p,map.naturalHeight/map.naturalWidth);
    const u=Object.fromEntries(['artwork','relief','faceSize','view','depth','shine'].map(name=>[name,gl.getUniformLocation(p,name)]));
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    for(const [unit,image,sampler] of [[0,picture,u.artwork],[1,map,u.relief]]){
      gl.activeTexture(gl.TEXTURE0+unit);
      gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
      gl.uniform1i(sampler,unit);
    }
    gl.uniform1f(u.depth,depth);
    gl.enable(gl.DEPTH_TEST);
    cached={picture,map,depth,canvas,gl,draw({width,height,w,h,yaw,pitch,shine}){
      if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(u.faceSize,width,height);
      gl.uniform3f(u.view,Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.abs(Math.cos(yaw)*Math.cos(pitch)));
      gl.uniform1f(u.shine,shine);
      gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,0);
    }};
    return cached;
  }catch(error){
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    console.warn('Cover GPU rendering unavailable',error);
    return null;
  }
}
