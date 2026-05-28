/**
 * hero-terrain.js — CroquetClaude dithered ember-terrain hero.
 *
 * A WebGL fragment shader: an angular, faceted heightfield is lit with a
 * fake normal, then run through pixelate -> ordered (Bayer) dither ->
 * colour-quantise against the CC warm ramp (ink -> terracotta -> burnt
 * orange -> amber -> paper). The field is massed at the left/right edges so
 * the centre stays clean for the headline, and it drifts/morphs over time.
 *
 * Drop-in: needs <canvas id="cc-hero-canvas"> inside an element. Respects
 * prefers-reduced-motion (renders one static frame) and pauses when the hero
 * scrolls out of view.
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
    float v=0.0, amp=0.55, fq=1.0;
    for(int i=0;i<5;i++){
      float n=vnoise(p*fq);
      n=1.0-abs(n*2.0-1.0);
      n*=n;
      v+=n*amp; fq*=2.03; amp*=0.5;
    }
    return v;
  }
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
    vec3 c = vec3(0.055,0.043,0.031);                 // 0 deep ink
    c = mix(c, vec3(0.247,0.114,0.106), step(0.5,i)); // 1 dark terracotta
    c = mix(c, vec3(0.678,0.310,0.322), step(1.5,i)); // 2 terracotta  #ad4f52
    c = mix(c, vec3(0.831,0.439,0.220), step(2.5,i)); // 3 burnt orange
    c = mix(c, vec3(0.851,0.604,0.235), step(3.5,i)); // 4 amber       #d99a3c
    c = mix(c, vec3(0.956,0.933,0.859), step(4.5,i)); // 5 paper highlight
    return c;
  }

  void main(){
    float PIX = 5.0;                                    // pixel-cell size (device px)
    vec2 frag = floor(gl_FragCoord.xy / PIX) * PIX + PIX*0.5;
    vec2 uv = frag / u_res;
    float aspect = u_res.x / u_res.y;

    // canyon walls: field at the left & right edges, clean centre for text
    float edge = abs(uv.x - 0.5) * 2.0;                 // 0 centre -> 1 edges
    float wall = smoothstep(0.34, 1.0, edge);
    // top & bottom fade so the band feels contained
    float vfade = smoothstep(0.0, 0.16, uv.y) * smoothstep(0.0, 0.22, 1.0 - uv.y);
    wall *= mix(0.55, 1.0, vfade);

    // animated / morphing domain (the form drifting behind the dither)
    vec2 q = vec2(uv.x*aspect, uv.y) * 5.2;
    q += vec2(u_time*0.045, sin(u_time*0.11)*0.35 - u_time*0.02);
    float ang = sin(u_time*0.05)*0.18;
    mat2 rot = mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
    q = rot*q;

    // height + fake-normal lighting for faceted 3D feel
    float e = 0.05;
    float h  = ridge(q);
    float hx = ridge(q+vec2(e,0.0));
    float hy = ridge(q+vec2(0.0,e));
    vec3  n  = normalize(vec3(h-hx, h-hy, e*1.6));
    float lit = clamp(dot(n, normalize(vec3(-0.55,0.5,0.62))), 0.0, 1.0);
    float rim = smoothstep(0.04, 0.16, length(vec2(h-hx, h-hy))); // crisp canyon edges

    float val = h * (0.42 + 0.78*lit) + rim*0.30;
    float field = val * wall;

    // quantise to bands with ordered dither
    float levels = 5.0;
    float dith = bayer4(gl_FragCoord.xy / PIX) - 0.5;
    float band = clamp(floor(field*levels + dith), 0.0, levels);
    vec3 col = pal(band);

    // LED / aperture-grille texture: thin gaps + per-column shimmer
    vec2 cell = fract(gl_FragCoord.xy / PIX);
    float gap = smoothstep(0.0,0.12,cell.x)*smoothstep(0.0,0.12,cell.y)
              * smoothstep(0.0,0.12,1.0-cell.x)*smoothstep(0.0,0.12,1.0-cell.y);
    col *= 0.80 + 0.20*gap;
    float colm = mod(floor(gl_FragCoord.x/PIX),3.0);
    col *= 0.92 + 0.08*step(0.5,colm);

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

  if (reduced) { draw(8.0); return; }      // single representative frame

  let running = true, t0 = null;
  function frame(t) {
    if (!running) return;
    if (t0 === null) t0 = t;
    draw((t - t0) / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // pause when scrolled away (battery / GPU)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => {
      const vis = ents[0].isIntersecting;
      if (vis && !running) { running = true; t0 = null; requestAnimationFrame(frame); }
      else if (!vis) { running = false; }
    }, { threshold: 0.01 }).observe(cv);
  }
})();
