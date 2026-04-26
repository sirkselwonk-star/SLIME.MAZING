// eyesbleed.js — "Eyes Bleed!" mode: animated shader effects on maze walls
// V2: GPU particles + vertex distortion + canvas overlay (scanlines/grain)

import * as THREE from 'three';

// --- GLOW ORBS (original floating particles) ---
const GLOW_VERTEX = `
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    void main(){
        float t = fract(uTime / 3.0 + aPhase);
        vec3 p = position;
        p.y += t * 3.5;
        p.x += sin(t * 6.2832 + aPhase * 10.0) * 0.3;
        p.z += cos(t * 6.2832 + aPhase * 7.0) * 0.3;
        vAlpha = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.6, t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 8.0 * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const GLOW_FRAGMENT = `
    varying float vAlpha;
    uniform vec3 uColor;
    void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d * d * 2.0);
        gl_FragColor = vec4(uColor * glow, vAlpha * glow);
    }
`;

// --- FIRE (rising embers that flicker and fade) ---
const FIRE_VERTEX = `
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    varying float vHeat;
    void main(){
        float t = fract(uTime / 2.0 + aPhase);
        vec3 p = position;
        p.y += t * 4.0;
        // Turbulent horizontal flicker
        p.x += sin(t * 12.0 + aPhase * 20.0) * 0.2 * (1.0 - t);
        p.z += cos(t * 10.0 + aPhase * 15.0) * 0.15 * (1.0 - t);
        // Hot at base, cool at top
        vHeat = 1.0 - t;
        vAlpha = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.3, t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = mix(10.0, 4.0, t) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const FIRE_FRAGMENT = `
    varying float vAlpha;
    varying float vHeat;
    void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d * d * 3.0);
        // Yellow-white core → orange → red at edges
        vec3 col = mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.9, 0.3), vHeat * vHeat);
        col = mix(col, vec3(1.0, 1.0, 0.8), pow(vHeat, 4.0) * glow);
        gl_FragColor = vec4(col * glow, vAlpha * glow);
    }
`;

// --- LIGHTNING (electric sparks that strike downward from ceiling) ---
const LIGHTNING_VERTEX = `
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    varying float vIntensity;
    void main(){
        // Burst cycle: sparks appear in short flashes
        float cycle = uTime * 1.5 + aPhase * 6.2832;
        float burst = step(0.7, fract(cycle * 0.3 + aPhase));
        vec3 p = position;
        // Violent jitter — biased downward from ceiling
        float jitter = burst * step(0.5, fract(sin(uTime * 50.0 + aPhase * 100.0) * 43758.5));
        p.x += (fract(sin(uTime * 30.0 + aPhase * 73.0) * 43758.5) - 0.5) * 1.2 * jitter;
        p.y -= (fract(sin(uTime * 37.0 + aPhase * 91.0) * 43758.5)) * 3.5 * jitter;
        p.z += (fract(sin(uTime * 43.0 + aPhase * 57.0) * 43758.5) - 0.5) * 1.2 * jitter;
        vIntensity = burst;
        vAlpha = burst * (0.5 + 0.5 * sin(uTime * 20.0 + aPhase * 30.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (6.0 + 8.0 * burst) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const LIGHTNING_FRAGMENT = `
    varying float vAlpha;
    varying float vIntensity;
    void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d * d * 2.5);
        // Electric blue-white core
        vec3 col = mix(vec3(0.3, 0.5, 1.0), vec3(0.8, 0.9, 1.0), glow * vIntensity);
        gl_FragColor = vec4(col * glow, vAlpha * glow);
    }
`;

// --- SNOW (drifting flakes that fall and sway) ---
const SNOW_VERTEX = `
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    void main(){
        float t = fract(uTime * 0.25 + aPhase);
        vec3 p = position;
        // Fall downward from ceiling height
        p.y += (1.0 - t) * 4.0;
        // Gentle swaying drift
        p.x += sin(t * 4.0 + aPhase * 8.0) * 0.5;
        p.z += cos(t * 3.0 + aPhase * 6.0) * 0.4;
        vAlpha = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.8, t) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = mix(4.0, 7.0, aPhase) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const SNOW_FRAGMENT = `
    varying float vAlpha;
    void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        // Soft round flake
        float flake = smoothstep(1.0, 0.3, d);
        vec3 col = vec3(0.9, 0.92, 1.0);
        gl_FragColor = vec4(col * flake, vAlpha * flake);
    }
`;

// --- WAVE SYNTH (oscillating particles forming interference wave patterns) ---
const WAVESYNTH_VERTEX = `
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    varying float vWave;
    void main(){
        vec3 p = position;
        float t = uTime;
        // Multiple overlapping sine waves at different frequencies
        float wave1 = sin(p.x * 3.0 + t * 2.5) * 0.6;
        float wave2 = sin(p.z * 4.0 + t * 1.8) * 0.4;
        float wave3 = sin((p.x + p.z) * 2.0 - t * 3.2) * 0.3;
        float wave4 = sin(length(p.xz) * 2.5 - t * 2.0) * 0.35;
        float combined = wave1 + wave2 + wave3 + wave4;
        // Particles ride the wave surface
        p.y += 1.5 + combined;
        // Horizontal ripple displacement
        p.x += sin(p.z * 5.0 + t * 1.5 + aPhase * 6.28) * 0.12;
        p.z += cos(p.x * 5.0 + t * 1.3 + aPhase * 4.0) * 0.12;
        // Wave peak = bright, trough = dim
        vWave = combined * 0.3 + 0.5;
        vAlpha = 0.4 + 0.6 * smoothstep(-0.5, 1.0, combined);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (5.0 + 4.0 * vWave) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const WAVESYNTH_FRAGMENT = `
    varying float vAlpha;
    varying float vWave;
    uniform vec3 uColor;
    void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d * d * 2.0);
        // Cycle through synth colors based on wave height
        vec3 lo = vec3(0.1, 0.0, 0.4);   // deep purple in troughs
        vec3 mid = vec3(0.0, 0.8, 0.6);  // teal at midpoint
        vec3 hi = vec3(1.0, 0.3, 0.8);   // hot pink at peaks
        vec3 col = mix(lo, mid, smoothstep(0.0, 0.5, vWave));
        col = mix(col, hi, smoothstep(0.5, 1.0, vWave));
        // Add white-hot core at peaks
        col += vec3(0.8, 0.9, 1.0) * pow(vWave, 3.0) * glow;
        gl_FragColor = vec4(col * glow, vAlpha * glow);
    }
`;

// Effect type definitions for the 5 cubic-space particle effects
const CUBIC_EFFECTS = [
    { name: 'glow',      vert: GLOW_VERTEX,       frag: GLOW_FRAGMENT,       perCell: 8,  useZoneColor: true  },
    { name: 'fire',      vert: FIRE_VERTEX,        frag: FIRE_FRAGMENT,       perCell: 12, useZoneColor: false },
    { name: 'lightning',  vert: LIGHTNING_VERTEX,    frag: LIGHTNING_FRAGMENT,   perCell: 10, useZoneColor: false },
    { name: 'snow',      vert: SNOW_VERTEX,        frag: SNOW_FRAGMENT,       perCell: 14, useZoneColor: false },
    { name: 'wavesynth', vert: WAVESYNTH_VERTEX,   frag: WAVESYNTH_FRAGMENT,  perCell: 20, useZoneColor: false },
];

// HSL → RGB helper for zone-based particle coloring
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [r, g, b];
}

// Shared noise library (simplex, fbm, hash, value noise, voronoi)
const NOISE_GLSL = `
vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289v2(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289v3(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)),x0=v-i+dot(i,C.xx),i1;
  i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;
  i=mod289v2(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m;m=m*m;
  vec3 x2=2.*fract(p*C.www)-1.,h=abs(x2)-.5,ox=floor(x2+.5),a0=x2-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}
float fbm(vec2 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*snoise(p);p*=2.;a*=.5;}return f;}
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
vec2 voronoi(vec2 x){vec2 n=floor(x),f=fract(x);float md=8.;vec2 mr;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j)),o=vec2(hash21(n+g),hash21(n+g+vec2(31,17))),r=g+o-f;float d=dot(r,r);if(d<md){md=d;mr=r;}}return vec2(sqrt(md),0.);}
`;

const VERTEX_SHADER = `
uniform float time;
varying vec2 vUv;
void main() {
    vUv = uv;
    // UV warping — visible surface undulation
    vUv += 0.03 * vec2(
        sin(position.x * 4.0 + time * 1.2),
        cos(position.z * 4.0 + time * 1.0)
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 25 curated effects — fragment shader bodies (main() body only)
const EFFECTS = [
    // --- Psychedelic (6) ---
    { name: 'Rainbow Spiral', frag: `vec2 u=vUv-.5;float a=atan(u.y,u.x);float r=length(u);float spiral=fract(a/6.2832+r*3.-time*.3);vec3 col=.5+.5*cos(6.2832*(spiral+vec3(0.,.33,.67)));col*=smoothstep(.0,.1,r);gl_FragColor=vec4(col,1.);` },
    { name: 'Kaleidoscope', frag: `vec2 u=vUv-.5;float a=atan(u.y,u.x);float r=length(u);a=abs(mod(a,1.047)-.524);vec2 k=r*vec2(cos(a),sin(a));float n=fbm(k*4.+time*.3);vec3 col=.5+.5*cos(n*4.+time+vec3(0.,2.,4.));gl_FragColor=vec4(col*smoothstep(.5,.1,r),1.);` },
    { name: 'Acid Trip', frag: `vec2 u=vUv*3.;float t=time*.5;float n=sin(u.x*3.+sin(u.y*4.+t))+sin(u.y*3.+sin(u.x*2.+t*1.3));n=n*.25+.5;vec3 col=.5+.5*cos(n*8.+t*2.+vec3(0.,2.,4.));gl_FragColor=vec4(col,1.);` },
    { name: 'Plasma Wave', frag: `vec2 u=vUv*4.;float v=sin(u.x+time)+sin(u.y+time*1.1)+sin((u.x+u.y)+time*.7)+sin(length(u)+time*1.3);v=v*.25+.5;vec3 col=.5+.5*cos(v*6.2832+vec3(0.,2.1,4.2));gl_FragColor=vec4(col,1.);` },
    { name: 'Tie Dye', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float swirl=a+r*5.+time*.5;float n=fbm(vec2(swirl,r*3.));vec3 col=.5+.5*cos(n*5.+vec3(1.,3.,5.));col*=.8+.2*sin(swirl*3.);gl_FragColor=vec4(col,1.);` },
    { name: 'Hypno Rings', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float ring=sin(r*25.-time*3.+sin(a*3.)*2.)*.5+.5;vec3 col=mix(vec3(.1,.0,.2),vec3(.8,.2,.8),ring);col+=vec3(.4,.1,.5)*smoothstep(.03,.0,abs(r-.2-.05*sin(time*2.)));gl_FragColor=vec4(col,1.);` },

    // --- Sci-Fi (6) ---
    { name: 'Matrix Rain', frag: `vec2 u=vUv*vec2(20.,1.);float col_id=floor(u.x);float speed=.5+hash21(vec2(col_id,0.))*.8;float y=fract(vUv.y-time*speed+hash21(vec2(col_id,1.)));float bright=pow(y,3.);float cn=step(.5,hash21(floor(vec2(u.x,vUv.y*30.+time*5.))));vec3 col=vec3(.0,.8,.2)*bright*cn;gl_FragColor=vec4(col,1.);` },
    { name: 'Circuit Board', frag: `vec2 u=vUv*8.;vec2 cell=floor(u);vec2 f=fract(u);float h=hash21(cell);float line=0.;if(h>.5){line=smoothstep(.06,.02,abs(f.x-.5));}else{line=smoothstep(.06,.02,abs(f.y-.5));}float node=smoothstep(.12,.08,length(f-.5));float pulse=sin(time*3.+cell.x+cell.y)*.5+.5;vec3 col=vec3(.02,.04,.02)+vec3(.0,.6,.3)*line*(.3+.7*pulse)+vec3(.1,1.,.3)*node;gl_FragColor=vec4(col,1.);` },
    { name: 'Neon Grid', frag: `vec2 u=vUv*10.;vec2 g=abs(fract(u)-.5);float grid=smoothstep(.04,.01,min(g.x,g.y));float pulse=sin(time*2.+floor(u.x)+floor(u.y)*3.)*.5+.5;vec3 col=vec3(.02,.0,.05)+vec3(1.,.0,.5)*grid*(.3+.7*pulse);col+=vec3(.2,.0,.3)*smoothstep(.3,.0,min(g.x,g.y));gl_FragColor=vec4(col,1.);` },
    { name: 'Plasma Ball', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float bolt=0.;for(int i=0;i<5;i++){float aa=float(i)*1.2566+time;float d=abs(a-aa+sin(r*10.+time*3.)*.3);d=min(d,6.28-d);bolt+=smoothstep(.15,.0,d)*smoothstep(.45,.1,r);}vec3 col=vec3(.05,.0,.1)+vec3(.5,.2,1.)*bolt+vec3(.8,.5,1.)*smoothstep(.05,.0,r);gl_FragColor=vec4(col,1.);` },
    { name: 'Electric Arc', frag: `float arc=0.;for(int i=0;i<3;i++){float t=time*2.+float(i)*2.;vec2 u=vUv;float xp=u.x;float y=.5+.2*sin(xp*5.+t)+.1*vnoise(vec2(xp*10.,t));arc+=smoothstep(.03,.0,abs(u.y-y));}vec3 col=vec3(.02,.0,.05)+vec3(.3,.3,1.)*arc+vec3(.5,.5,1.)*pow(arc,3.);gl_FragColor=vec4(col,1.);` },
    { name: 'Hex Grid', frag: `vec2 u=vUv*8.;vec2 r=vec2(1.,1.732);vec2 h=r*.5;vec2 a=mod(u,r)-h;vec2 b=mod(u-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;float d=max(abs(g.x),abs(g.y*.577+abs(g.x)*.5));float hex=smoothstep(.5,.48,d);float pulse=sin(time+dot(floor(u),vec2(1.,1.7)))*.5+.5;vec3 col=vec3(.02,.02,.06)+vec3(.0,.4,.6)*hex*(.2+.8*pulse);gl_FragColor=vec4(col,1.);` },

    // --- Lava/Fire (5) ---
    { name: 'Molten Lava', frag: `vec2 u=vUv*3.;float n=fbm(u+time*.2);float n2=fbm(u*2.-time*.15);float heat=smoothstep(.0,.4,n);vec3 col=mix(vec3(.1,.02,.02),vec3(1.,.3,.0),heat);col=mix(col,vec3(1.,.9,.3),smoothstep(.5,.8,n2)*heat);gl_FragColor=vec4(col,1.);` },
    { name: 'Fire Wall', frag: `vec2 u=vUv*3.;u.y-=time*1.5;float f=0.;f+=.5*vnoise(u);u*=2.;f+=.25*vnoise(u);u*=2.;f+=.125*vnoise(u);f=f*smoothstep(0.,.8,vUv.y);vec3 col=mix(vec3(1.,.2,.0),vec3(1.,.9,.1),f);col=mix(vec3(.02),col,smoothstep(-.1,.3,f));gl_FragColor=vec4(col,1.);` },
    { name: 'Magma Cracks', frag: `vec2 u=vUv*4.;vec2 v=voronoi(u+time*.1);float crack=smoothstep(.15,.0,v.x);float n=fbm(u*2.+time*.2);vec3 rock=vec3(.15,.12,.1)+.05*n;vec3 magma=mix(vec3(1.,.2,.0),vec3(1.,.7,.0),n);gl_FragColor=vec4(mix(rock,magma,crack),1.);` },
    { name: 'Hell Portal', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float swirl=a+r*5.-time*2.;float n=fbm(vec2(swirl,r*3.));float ring=smoothstep(.35,.3,r)*smoothstep(.1,.15,r);vec3 col=vec3(.05);col+=vec3(1.,.2,.0)*ring*(.5+.5*n);col+=vec3(1.,.6,.0)*smoothstep(.12,.0,r)*(.7+.3*sin(time*3.));gl_FragColor=vec4(col,1.);` },
    { name: 'Inferno', frag: `vec2 u=vUv*4.;float t=time*2.;float f=0.;for(int i=0;i<4;i++){u=vec2(u.x*1.5+sin(u.y+t),u.y*1.5+cos(u.x+t));f+=sin(u.x+u.y);}f=f*.25+.5;vec3 col=mix(vec3(0.),vec3(1.,.1,.0),smoothstep(.2,.5,f));col=mix(col,vec3(1.,.9,.2),smoothstep(.6,.9,f));gl_FragColor=vec4(col,1.);` },

    // --- Nature (4) ---
    { name: 'Aurora', frag: `vec2 u=vUv*2.;float t=time*.3;float wave=sin(u.x*3.+t)*sin(u.x*5.+t*1.3)*.5+.5;float n=fbm(vec2(u.x*2.+t,u.y*.5));float band=exp(-pow(u.y-.5-wave*.3,2.)*8.);vec3 col=vec3(.02,.02,.05);col+=vec3(.1,.6,.3)*band*n;col+=vec3(.2,.3,.8)*band*(1.-n)*.5;gl_FragColor=vec4(col,1.);` },
    { name: 'Galaxy', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float spiral=fbm(vec2(a+r*5.-time*.2,r*3.));float stars=pow(hash21(floor(vUv*200.)),20.);vec3 col=vec3(.02,.01,.04)+vec3(.3,.1,.5)*spiral*exp(-r*3.)+vec3(.8,.6,.3)*spiral*exp(-r*5.);col+=stars;gl_FragColor=vec4(col,1.);` },
    { name: 'Nebula', frag: `vec2 u=vUv*3.;float n1=fbm(u+time*.1);float n2=fbm(u*2.-time*.15+5.);vec3 col=vec3(.02,.01,.05);col+=vec3(.5,.1,.3)*smoothstep(.3,.7,n1);col+=vec3(.1,.2,.6)*smoothstep(.4,.8,n2);col+=vec3(.8,.4,.1)*pow(n1*n2,2.);float stars=pow(hash21(floor(vUv*150.)),25.);col+=stars;gl_FragColor=vec4(col,1.);` },
    { name: 'Starfield', frag: `vec3 col=vec3(.01,.01,.02);for(int layer=0;layer<3;layer++){vec2 u=vUv*pow(2.,float(layer+3));u+=time*.02*float(layer+1);vec2 id=floor(u);float star=pow(hash21(id),30.-float(layer)*8.);float twinkle=sin(time*2.+hash21(id+.5)*6.28)*.3+.7;col+=star*twinkle;}gl_FragColor=vec4(col,1.);` },

    // --- Wild (4) ---
    { name: 'Stained Glass', frag: `vec2 u=vUv*5.;vec2 v=voronoi(u);float edge=smoothstep(.05,.1,v.x);float id=hash21(floor(u+.5));vec3 hue=.5+.5*cos(id*6.28+vec3(0.,2.,4.));vec3 col=hue*edge*.8;float light=.7+.3*sin(time+id*5.);col*=light;col+=vec3(.05)*(1.-edge);gl_FragColor=vec4(col,1.);` },
    { name: 'Crystal', frag: `vec2 u=vUv*5.;vec2 v=voronoi(u);float facet=v.x;float edge=smoothstep(.05,.02,facet);float n=vnoise(u*10.)*.1;vec3 col=mix(vec3(.6,.3,.7),vec3(.9,.7,.95),facet*2.);col+=vec3(.3,.15,.35)*edge;col+=n;float sparkle=pow(vnoise(u*20.+time*2.),10.);col+=sparkle;gl_FragColor=vec4(col,1.);` },
    { name: 'Energy Shield', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float hex=cos(a*6.)*.03;float shield=smoothstep(.4+hex,.38+hex,r)*smoothstep(.2,.22,r);float pulse=sin(r*20.-time*5.)*.5+.5;float hit=exp(-3.*length(u-vec2(.1*sin(time),.1*cos(time))));vec3 col=vec3(.0,.5,1.)*shield*(.3+.7*pulse)+vec3(.5,.8,1.)*hit*.5;gl_FragColor=vec4(col,1.);` },
    { name: 'Force Field', frag: `vec2 u=vUv-.5;float r=length(u);float a=atan(u.y,u.x);float field=sin(a*8.+r*15.-time*4.)*.5+.5;field*=smoothstep(.45,.3,r)*smoothstep(.05,.15,r);float edge=smoothstep(.42,.38,r)*smoothstep(.35,.38,r);vec3 col=vec3(.0,.2,.4)*field+vec3(.3,.6,1.)*edge;col+=vec3(.1,.3,.6)*pow(field,3.);gl_FragColor=vec4(col,1.);` },
];

function buildFragmentShader(fragBody) {
    return `
varying vec2 vUv;
uniform float time;
${NOISE_GLSL}
void main() {
    ${fragBody}
}
`;
}

export class EyesBleedManager {
    constructor() {
        this._active = false;
        // Shared time uniform object — all materials reference this same object
        this.timeUniform = { value: 0 };
        // Map<mesh, originalMaterial> for restoration
        this._originalMaterials = new Map();
        // Array of ShaderMaterials created (for disposal)
        this._shaderMaterials = [];
        // V2: cubic-space particle systems + overlay canvas
        this._particleSystems = [];  // array of THREE.Points
        this._particleTimeUniform = { value: 0 };
        this._scene = null;
        this._overlayCanvas = null;
        this._overlayCtx = null;
    }

    get isActive() {
        return this._active;
    }

    /**
     * Activate Eyes Bleed mode — swap wall materials to animated shaders.
     * @param {Object} wallMeshes - dict keyed "r,c,dir" → THREE.Mesh
     * @param {Object} [floorMeshes] - dict keyed "r,c" → THREE.Mesh
     * @param {Object} [ceilingMeshes] - dict keyed "r,c" → THREE.Mesh
     * @param {Object} [renderContext] - { renderer, scene, camera } for V2 particles
     */
    activate(wallMeshes, floorMeshes, ceilingMeshes, renderContext = {}) {
        if (this._active) return;
        this._active = true;

        // Build one ShaderMaterial per effect (25 total), sharing the time uniform
        const materials = EFFECTS.map(effect => {
            const mat = new THREE.ShaderMaterial({
                vertexShader: VERTEX_SHADER,
                fragmentShader: buildFragmentShader(effect.frag),
                uniforms: {
                    time: this.timeUniform
                },
                side: THREE.DoubleSide,
                fog: false  // intentional — walls glow through fog
            });
            return mat;
        });
        this._shaderMaterials = materials;

        // Assign zones and swap materials
        const seed = Math.floor(Math.random() * 99999);
        for (const key in wallMeshes) {
            const mesh = wallMeshes[key];
            if (!mesh || !mesh.visible) continue;

            // Parse row,col from key "r,c,dir"
            const parts = key.split(',');
            const row = parseInt(parts[0]);
            const col = parseInt(parts[1]);

            // Zone: 6x6 cell blocks
            const zoneR = Math.floor(row / 6);
            const zoneC = Math.floor(col / 6);

            // Hash zone to pick effect index (0..24)
            const zoneHash = this._hashZone(zoneR, zoneC, seed);
            const effectIdx = zoneHash % EFFECTS.length;

            // Store original material
            this._originalMaterials.set(mesh, mesh.material);

            // Swap to shader material
            mesh.material = materials[effectIdx];
        }

        // Apply effects to ~20% of floor/ceiling tiles (sparse placement)
        const surfaceSets = [floorMeshes, ceilingMeshes];
        for (const meshDict of surfaceSets) {
            if (!meshDict) continue;
            for (const key in meshDict) {
                const mesh = meshDict[key];
                if (!mesh || !mesh.visible) continue;

                const parts = key.split(',');
                const row = parseInt(parts[0]);
                const col = parseInt(parts[1]);

                // Zone hash for effect selection (matches surrounding walls)
                const zoneR = Math.floor(row / 6);
                const zoneC = Math.floor(col / 6);
                const zoneHash = this._hashZone(zoneR, zoneC, seed);

                // Sparse: only ~20% of cells get the effect
                if ((zoneHash + row * 31 + col * 17) % 5 !== 0) continue;

                const effectIdx = zoneHash % EFFECTS.length;
                this._originalMaterials.set(mesh, mesh.material);
                mesh.material = materials[effectIdx];
            }
        }

        // V2: particles + overlay (only if render context supplied)
        const { renderer, scene: sc } = renderContext;
        if (sc) {
            this._scene = sc;
            this._createParticles(sc, floorMeshes, ceilingMeshes);
        }
        if (renderer) {
            this._createOverlay(renderer);
        }
    }

    /**
     * Deactivate — restore original materials and dispose V2 systems.
     */
    deactivate() {
        if (!this._active) return;
        this._active = false;

        // Restore originals
        for (const [mesh, origMat] of this._originalMaterials) {
            mesh.material = origMat;
        }
        this._originalMaterials.clear();

        // Dispose shader materials
        for (const mat of this._shaderMaterials) {
            mat.dispose();
        }
        this._shaderMaterials = [];

        // V2: dispose all particle systems
        for (const ps of this._particleSystems) {
            if (this._scene) this._scene.remove(ps);
            ps.geometry.dispose();
            ps.material.dispose();
        }
        this._particleSystems = [];

        // V2: remove overlay canvas
        if (this._overlayCanvas) {
            this._overlayCanvas.remove();
            this._overlayCanvas = null;
            this._overlayCtx = null;
        }

        this._scene = null;
    }

    /**
     * Update the shared time uniform + V2 systems. Call from animate loop.
     */
    update(time) {
        if (this._active) {
            this.timeUniform.value = time;
            this._particleTimeUniform.value = time;
            // Draw overlay scanlines + grain
            this._drawOverlay(time);
        }
    }

    /**
     * Full cleanup — call on level restart.
     */
    cleanup() {
        this.deactivate();
    }

    /**
     * Render — no EffectComposer, just normal rendering.
     */
    render(renderer, scene, camera) {
        renderer.render(scene, camera);
    }

    /**
     * Resize — match overlay canvas to viewport.
     */
    resize(width, height) {
        if (this._overlayCanvas) {
            this._overlayCanvas.width = width;
            this._overlayCanvas.height = height;
            this._overlayCanvas.style.width = width + 'px';
            this._overlayCanvas.style.height = height + 'px';
        }
    }

    /**
     * V2: Create a 2D canvas overlay for scanlines + grain.
     * Positioned directly on top of the renderer canvas.
     */
    _createOverlay(renderer) {
        const glCanvas = renderer.domElement;
        const canvas = document.createElement('canvas');
        canvas.width = glCanvas.width;
        canvas.height = glCanvas.height;
        canvas.style.position = 'absolute';
        canvas.style.left = glCanvas.style.left;
        canvas.style.top = glCanvas.style.top;
        canvas.style.width = glCanvas.style.width || glCanvas.width + 'px';
        canvas.style.height = glCanvas.style.height || glCanvas.height + 'px';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '1';
        // Insert right after the GL canvas
        glCanvas.parentNode.insertBefore(canvas, glCanvas.nextSibling);
        this._overlayCanvas = canvas;
        this._overlayCtx = canvas.getContext('2d');
    }

    /**
     * V2: Draw scanlines + subtle grain onto the overlay canvas each frame.
     */
    _drawOverlay(time) {
        const ctx = this._overlayCtx;
        if (!ctx) return;
        const w = this._overlayCanvas.width;
        const h = this._overlayCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // Scanlines — dark horizontal lines every 3px
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        for (let y = 0; y < h; y += 3) {
            ctx.fillRect(0, y, w, 1);
        }

        // Grain — random noise dots
        const grainAlpha = 0.12;
        const dotCount = Math.floor(w * h * 0.005);
        for (let i = 0; i < dotCount; i++) {
            const x = (Math.random() * w) | 0;
            const y = (Math.random() * h) | 0;
            const bright = Math.random() > 0.5;
            ctx.fillStyle = bright
                ? `rgba(255,255,255,${grainAlpha})`
                : `rgba(0,0,0,${grainAlpha * 2})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    /**
     * V2: Spawn 4 types of cubic-space particle effects across ~60% of floor cells.
     * Zone hash determines effect type: glow orbs, fire, lightning, or snow.
     */
    _createParticles(scene, floorMeshes, ceilingMeshes) {
        if (!floorMeshes) return;

        // Index of lightning in CUBIC_EFFECTS
        const LIGHTNING_IDX = CUBIC_EFFECTS.findIndex(e => e.name === 'lightning');

        // Bucket cells by effect type
        const buckets = CUBIC_EFFECTS.map(() => ({ positions: [], hues: [] }));

        for (const key in floorMeshes) {
            const mesh = floorMeshes[key];
            if (!mesh || !mesh.visible) continue;

            const parts = key.split(',');
            const row = parseInt(parts[0]);
            const col = parseInt(parts[1]);

            // ~60% of cells
            if ((row * 7 + col * 13 + 37) % 10 >= 6) continue;

            // Zone determines effect type
            const zoneR = Math.floor(row / 6);
            const zoneC = Math.floor(col / 6);
            const zoneHash = (zoneR * 7919 + zoneC * 6271 + 42) & 0xffff;
            const effectIdx = zoneHash % CUBIC_EFFECTS.length;
            const hue = zoneHash / 65536.0;

            // Lightning sources from ceiling, others from floor
            if (effectIdx === LIGHTNING_IDX && ceilingMeshes && ceilingMeshes[key]) {
                buckets[effectIdx].positions.push(ceilingMeshes[key].position);
            } else {
                buckets[effectIdx].positions.push(mesh.position);
            }
            buckets[effectIdx].hues.push(hue);
        }

        // Build one Points system per effect type
        for (let e = 0; e < CUBIC_EFFECTS.length; e++) {
            const bucket = buckets[e];
            if (bucket.positions.length === 0) continue;

            const effect = CUBIC_EFFECTS[e];
            const perCell = effect.perCell;
            const total = bucket.positions.length * perCell;

            const posArr = new Float32Array(total * 3);
            const phaseArr = new Float32Array(total);
            let rSum = 0, gSum = 0, bSum = 0;

            let idx = 0;
            for (let c = 0; c < bucket.positions.length; c++) {
                const pos = bucket.positions[c];
                const [r, g, b] = hslToRgb(bucket.hues[c], 0.8, 0.55);
                rSum += r; gSum += g; bSum += b;

                for (let p = 0; p < perCell; p++) {
                    posArr[idx * 3]     = pos.x + (Math.random() - 0.5) * 1.5;
                    posArr[idx * 3 + 1] = pos.y;
                    posArr[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 1.5;
                    phaseArr[idx] = Math.random();
                    idx++;
                }
            }

            const n = bucket.positions.length;
            const avgColor = new THREE.Color(rSum / n, gSum / n, bSum / n);

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
            geo.setAttribute('aPhase', new THREE.BufferAttribute(phaseArr, 1));

            const mat = new THREE.ShaderMaterial({
                vertexShader: effect.vert,
                fragmentShader: effect.frag,
                uniforms: {
                    uTime: this._particleTimeUniform,
                    uColor: { value: avgColor }
                },
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const points = new THREE.Points(geo, mat);
            points.renderOrder = 999;  // draw after all solid geometry + labels
            scene.add(points);
            this._particleSystems.push(points);
        }
    }

    /**
     * Simple integer hash for zone → effect mapping.
     * Ensures adjacent zones get different effects.
     */
    _hashZone(zr, zc, seed) {
        let h = (zr * 7919 + zc * 6271 + seed) | 0;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = (h >> 16) ^ h;
        return Math.abs(h);
    }
}
