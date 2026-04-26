// eyesbleed.js — "Eyes Bleed!" mode: animated shader effects on maze walls
// V2: post-processing stack + GPU particles + vertex distortion

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';

// Custom film grain + scanlines shader (v0.164 FilmShader lacks scanlines)
const FilmGrainScanlineShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        grainIntensity: { value: 0.04 },
        scanlineIntensity: { value: 0.03 },
        scanlineCount: { value: 400.0 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float grainIntensity;
        uniform float scanlineIntensity;
        uniform float scanlineCount;
        varying vec2 vUv;
        float rand(vec2 co){ return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453); }
        void main(){
            vec4 col = texture2D(tDiffuse, vUv);
            float grain = (rand(vUv + fract(time)) - 0.5) * grainIntensity;
            col.rgb += grain;
            float scanline = sin(vUv.y * scanlineCount * 3.14159) * scanlineIntensity;
            col.rgb -= scanline;
            gl_FragColor = col;
        }
    `
};

// GPU particle shaders
const PARTICLE_VERTEX_SHADER = `
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    void main(){
        float t = fract(uTime / 3.0 + aPhase);          // loop every 3s
        vec3 p = position;
        p.y += t * 2.5;                                   // float upward
        p.x += sin(t * 6.2832 + aPhase * 10.0) * 0.15;   // drift
        p.z += cos(t * 6.2832 + aPhase * 7.0) * 0.15;
        vAlpha = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.6, t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 3.0 * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;

const PARTICLE_FRAGMENT_SHADER = `
    varying float vAlpha;
    uniform vec3 uColor;
    void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-d * d * 2.0);
        gl_FragColor = vec4(uColor * glow, vAlpha * glow);
    }
`;

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
    // UV warping — gentle surface undulation
    vUv += 0.005 * vec2(
        sin(position.x * 4.0 + time * 1.0),
        cos(position.z * 4.0 + time * 0.8)
    );
    // Geometric breathing — very subtle mesh displacement along normal
    vec3 displaced = position + normal * sin(time * 1.5 + position.x * 3.0 + position.z * 3.0) * 0.025;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
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
precision mediump float;
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
        // V2: post-processing + particles
        this._composer = null;
        this._filmPass = null;
        this._particleSystem = null;
        this._particleTimeUniform = { value: 0 };
        this._scene = null;
        this._renderer = null;
        this._camera = null;
    }

    get isActive() {
        return this._active;
    }

    /**
     * Activate Eyes Bleed mode — swap wall materials to animated shaders.
     * @param {Object} wallMeshes - dict keyed "r,c,dir" → THREE.Mesh
     * @param {Object} [floorMeshes] - dict keyed "r,c" → THREE.Mesh
     * @param {Object} [ceilingMeshes] - dict keyed "r,c" → THREE.Mesh
     * @param {Object} [renderContext] - { renderer, scene, camera } for V2 post-processing
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

        // V2: post-processing + particles (only if render context supplied)
        const { renderer, scene: sc, camera } = renderContext;
        if (renderer && sc && camera) {
            this._renderer = renderer;
            this._scene = sc;
            this._camera = camera;
            this._createComposer(renderer, sc, camera);
            this._createParticles(sc, floorMeshes);
        }
    }

    /**
     * Deactivate — restore original materials and dispose shaders + V2 systems.
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

        // V2: dispose post-processing
        if (this._composer) {
            for (const pass of this._composer.passes) {
                if (pass.dispose) pass.dispose();
            }
            this._composer.dispose();
            this._composer = null;
            this._filmPass = null;
        }

        // V2: dispose particles
        if (this._particleSystem) {
            if (this._scene) this._scene.remove(this._particleSystem);
            this._particleSystem.geometry.dispose();
            this._particleSystem.material.dispose();
            this._particleSystem = null;
        }

        this._renderer = null;
        this._scene = null;
        this._camera = null;
    }

    /**
     * Update the shared time uniform + V2 systems. Call from animate loop.
     */
    update(time) {
        if (this._active) {
            this.timeUniform.value = time;
            // V2: update film shader time
            if (this._filmPass) {
                this._filmPass.uniforms.time.value = time;
            }
            // V2: update particle time
            this._particleTimeUniform.value = time;
        }
    }

    /**
     * Full cleanup — call on level restart.
     */
    cleanup() {
        this.deactivate();
    }

    /**
     * V2: Render through composer if active, otherwise normal render.
     */
    render(renderer, scene, camera) {
        if (this._active && this._composer) {
            this._composer.render();
        } else {
            renderer.render(scene, camera);
        }
    }

    /**
     * V2: Resize composer render targets on window resize.
     */
    resize(width, height) {
        if (this._composer) {
            this._composer.setSize(width, height);
        }
    }

    /**
     * V2: Build the post-processing chain.
     */
    _createComposer(renderer, scene, camera) {
        const size = renderer.getSize(new THREE.Vector2());
        const composer = new EffectComposer(renderer);

        // 1. Base scene render
        composer.addPass(new RenderPass(scene, camera));

        // 2. Bloom — gentle glow from shader walls
        const bloom = new UnrealBloomPass(size, 0.3, 0.4, 0.4);
        composer.addPass(bloom);

        // 3. Afterimage — faint motion trails
        const afterimage = new AfterimagePass(0.4);
        composer.addPass(afterimage);

        // 4. RGB shift — barely-there chromatic aberration
        const rgbShift = new ShaderPass(RGBShiftShader);
        rgbShift.uniforms['amount'].value = 0.001;
        composer.addPass(rgbShift);

        // 5. Film grain + scanlines (mild)
        const film = new ShaderPass(FilmGrainScanlineShader);
        composer.addPass(film);
        this._filmPass = film;

        // 6. Output — gamma/tonemapping (must be last)
        composer.addPass(new OutputPass());

        this._composer = composer;
    }

    /**
     * V2: Spawn GPU particles in ~30% of floor cells.
     */
    _createParticles(scene, floorMeshes) {
        if (!floorMeshes) return;

        const PARTICLES_PER_CELL = 4;
        const cellPositions = [];
        const cellHues = [];

        for (const key in floorMeshes) {
            const mesh = floorMeshes[key];
            if (!mesh || !mesh.visible) continue;

            const parts = key.split(',');
            const row = parseInt(parts[0]);
            const col = parseInt(parts[1]);

            // ~15% of cells via deterministic hash
            if ((row * 7 + col * 13 + 37) % 20 >= 3) continue;

            // Zone hue from zone hash
            const zoneR = Math.floor(row / 6);
            const zoneC = Math.floor(col / 6);
            const hue = ((zoneR * 7919 + zoneC * 6271) & 0xffff) / 65536.0;

            cellPositions.push(mesh.position);
            cellHues.push(hue);
        }

        const totalParticles = cellPositions.length * PARTICLES_PER_CELL;
        if (totalParticles === 0) return;

        const positions = new Float32Array(totalParticles * 3);
        const phases = new Float32Array(totalParticles);
        // Average color across all cells for the single material
        let rSum = 0, gSum = 0, bSum = 0;

        let idx = 0;
        for (let c = 0; c < cellPositions.length; c++) {
            const pos = cellPositions[c];
            const [r, g, b] = hslToRgb(cellHues[c], 0.6, 0.45);
            rSum += r; gSum += g; bSum += b;

            for (let p = 0; p < PARTICLES_PER_CELL; p++) {
                positions[idx * 3]     = pos.x + (Math.random() - 0.5) * 0.8;
                positions[idx * 3 + 1] = pos.y;
                positions[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.8;
                phases[idx] = Math.random();
                idx++;
            }
        }

        const n = cellPositions.length;
        const avgColor = new THREE.Color(rSum / n, gSum / n, bSum / n);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

        const mat = new THREE.ShaderMaterial({
            vertexShader: PARTICLE_VERTEX_SHADER,
            fragmentShader: PARTICLE_FRAGMENT_SHADER,
            uniforms: {
                uTime: this._particleTimeUniform,
                uColor: { value: avgColor }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this._particleSystem = new THREE.Points(geo, mat);
        scene.add(this._particleSystem);
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
