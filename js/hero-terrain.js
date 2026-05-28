/**
 * hero-terrain.js — CroquetClaude dithered ember-terrain hero.
 *
 * A WebGL fragment shader. A terraced, angular heightfield is relief-mapped so
 * the blocks appear to extrude toward the viewer, lit with a fake normal, then
 * run through pixelate -> ordered (Bayer) dither -> colour-quantise against the
 * CC warm ramp (ink -> terracotta -> burnt orange -> amber -> paper), and
 * finally an RGB-triad LED shadow-mask for the warm pixel shimmer. The field is
 * massed at the left/right edges so the centre stays clean for the headline,
 * and it drifts / morphs over time.
 *
 * Drop-in: needs <canvas id="cc-hero-canvas">. Respects prefers-reduced-motion
 * (one static frame) and pauses when scrolled out of view.
 */
(function () {
  const cv = document.getElementById('cc-hero-canvas');
  if (!cv) return;
  const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) { cv.style.background = '#0e0b08'; return; }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

  const FS = `
  precision highp float;
  uniform vec2  u_res;
  uniform float u_time;

  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  // ridged fbm -> sharp angular canyon facets
  float ridge(vec2 p){
    float v=0.0, amp=0.58, fq=1.0;
    for(int i=0;i<4;i++){
      float n=vnoise(p*fq);
      n=1.0-abs(n*2.0-1.0);
      n*=n;
      v+=n*amp; fq*=2.05; amp*=0.5;
    }
    return v;
  }
  // terraced height -> flat blocky facets
  float terr(vec2 p){ return floor(ridge(p)*7.0)/7.0; }

  // 4x4 ordered (Bayer) dither -> 0..1 threshold
  float bayer4(vec2 c){
    int x=int(mod(c.x,4.0)); int y=int(mod(c.y,4.0));
    int idx=x+y*4;
    float t=0.0;
    if(idx==0)t=0.0;       else if(idx==1)t=8.0;   else if(idx==2)t=2.0;   else if(idx==3)t=10.0;
    else if(idx==4)t=12.0; else if(idx==5)t=4.0;   else if(idx==6)t=14.0;  else if(idx==7)t=6.0;
    else if(idx==8)t=3.0;  else if(idx==9)t=11.0;  else if(idx==10)t=1.0;  else if(idx==11)t=9.0;
    else if(idx==12)t=15.0;else if(idx==13)t=7.0;  else if(idx==14)t=13.0; else t=5.0;
    return (t+0.5)/16.0;
  }
  // CC warm palette ramp by band index
  vec3 pal(float i){
    vec3 c = vec3(0.043,0.034,0.025);                 // 0 deep ink
    c = mix(c, vec3(0.247,0.114,0.106), step(0.5,i)); // 1 dark terracotta
    c = mix(c, vec3(0.678,0.310,0.322), step(1.5,i)); // 2 terracotta  #ad4f52
    c = mix(c, vec3(0.847,0.435,0.196), step(2.5,i)); // 3 burnt orange
    c = mix(c, vec3(0.882,0.624,0.235), step(3.5,i)); // 4 amber       #e19f3c
    c = mix(c, vec3(0.964,0.941,0.871), step(4.5,i)); // 5 paper highlight
    return c;
  }

  void main(){
    float PIX = 6.0;                                    // pixel-cell size (device px)
    vec2 frag = floor(gl_FragCoord.xy / PIX) * PIX + PIX*0.5;
    vec2 uv = frag / u_res;
    float aspect = u_res.x / u_res.y;

    // canyon walls: field at the left & right edges, clean centre for text
    float edge = abs(uv.x - 0.5) * 2.0;                 // 0 centre -> 1 edges
    float wall = smoothstep(0.30, 1.0, edge);
    float vfade = smoothstep(0.0, 0.16, uv.y) * smoothstep(0.0, 0.22, 1.0 - uv.y);
    wall *= mix(0.5, 1.0, vfade);

    // animated / morphing domain
    vec2 q = vec2(uv.x*aspect, uv.y) * 5.0;
    q += vec2(u_time*0.045, sin(u_time*0.11)*0.35 - u_time*0.02);
    float ang = sin(u_time*0.05)*0.18;
    mat2 rot = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
    q = rot*q;

    // RELIEF MARCH: blocks extrude toward the viewer (downward = nearer).
    // Step a ray from the near plane (rayH=1) into the field; first terrace it
    // pierces is the visible surface. The distance marched = how far the block
    // face recedes, which we darken to read the extruded side.
    vec2 ex = vec2(0.0, 0.085);                         // domain march per step
    float rayH = 1.0;
    vec2 sp = q;
    float h = terr(sp);
    for (int i=0;i<8;i++){
      if (h >= rayH) break;
      rayH -= 0.125;
      sp += ex;
      h = terr(sp);
    }
    float depth = 1.0 - rayH;                           // 0 near .. ~1 deep (side faces)

    // fake-normal lighting from the relief-shifted position
    float e = 0.05;
    float hx = terr(sp+vec2(e,0.0));
    float hy = terr(sp+vec2(0.0,e));
    vec3  n  = normalize(vec3(h-hx, h-hy, e*1.4));
    float lit = clamp(dot(n, normalize(vec3(-0.55,0.5,0.62))), 0.0, 1.0);
    float rim = step(0.0001, abs(h-hx)+abs(h-hy));      // hard facet edges (top lips)

    float side = smoothstep(0.0, 0.5, depth);           // receding front/side faces
    float val = h * (0.42 + 0.70*lit);
    val *= (1.0 - 0.34*side);                           // darken extruded faces -> 3D
    val += rim * 0.26 * (1.0 - side);                   // bright top lip
    val = pow(clamp(val, 0.0, 1.5), 1.04);              // mild contrast
    float field = val * wall;

    // quantise to bands with ordered dither
    float levels = 5.0;
    float dith = bayer4(gl_FragCoord.xy / PIX) - 0.5;
    float band = clamp(floor(field*levels + dith), 0.0, levels);
    vec3 col = pal(band);

    // RGB-triad LED shadow-mask: each cell split into R|G|B sub-columns. A warm
    // colour decomposes into bright red + green dots with dark "blue" gaps, which
    // is the warm Hermes shimmer (never blue-tinted).
    float sub = mod(floor(gl_FragCoord.x / (PIX/3.0)), 3.0);
    vec3 chan = sub < 0.5 ? vec3(col.r, 0.0, 0.0)
              : sub < 1.5 ? vec3(0.0, col.g, 0.0)
                          : vec3(0.0, 0.0, col.b);
    chan *= 2.9;
    vec2 cell = fract(gl_FragCoord.xy / PIX);
    float scan = smoothstep(0.0,0.14,cell.y)*smoothstep(0.0,0.14,1.0-cell.y);
    chan *= 0.6 + 0.4*scan;
    col = mix(col, chan, 0.5);

    gl_FragColor = vec4(col,1.0);
  }`;

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[hero-terrain]', gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(cv.clientWidth * dpr));
    const h = Math.max(1, Math.floor(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, cv.width, cv.height);
  }
  window.addEventListener('resize', resize);

  function draw(tSec) {
    resize();
    gl.uniform2f(uRes, cv.width, cv.height);
    gl.uniform1f(uTime, tSec);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if (reduced) { draw(8.0); return; }

  let running = true, t0 = null;
  function frame(t) {
    if (!running) return;
    if (t0 === null) t0 = t;
    draw((t - t0) / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => {
      const vis = ents[0].isIntersecting;
      if (vis && !running) { running = true; t0 = null; requestAnimationFrame(frame); }
      else if (!vis) { running = false; }
    }, { threshold: 0.01 }).observe(cv);
  }
})();
