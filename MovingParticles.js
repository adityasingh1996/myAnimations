/**
 * * Usage: 
 * <script type="module" src="path/to/gravity-particles.js"></script>
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// --- 1. CONFIGURATION & STYLES ---

const CONFIG = {
    density: 230,
    particlesScale: 0.59,
    ringWidth: 0.011,
    ringWidth2: 0.107,
    ringDisplacement: 0.53
};

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #gravity-particles-canvas {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: -1; /* Behind content */
            pointer-events: none; /* Let clicks pass through */
            background-color: #ffffff;
        }
    `;
    document.head.appendChild(style);
}

// --- 2. UTILITIES & SHADERS ---

const mapRange = (n, e, t, i, r) => (n - e) * (r - i) / (t - e) + i;

const noiseGLSL = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 1.0/7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                            dot(p2,x2), dot(p3,x3) ) );
}
`;

class Simple1DNoise {
    constructor() {
        this.MAX_VERTICES = 256;
        this.MAX_VERTICES_MASK = 255;
        this.amplitude = 1;
        this.scale = 1;
        this.r = [];
        for (var e = 0; e < this.MAX_VERTICES; ++e) this.r.push(Math.random())
    }
    getVal(e) {
        var t = e * this.scale
        , i = Math.floor(t)
        , r = t - i
        , o = r * r * (3 - 2 * r)
        , s = i % this.MAX_VERTICES_MASK
        , a = (s + 1) % this.MAX_VERTICES_MASK
        , l = this.lerp(this.r[s], this.r[a], o);
        return l * this.amplitude
    }
    lerp(e, t, i) {
        return e * (1 - i) + t * i
    }
}

// --- 3. PARTICLE SYSTEM LOGIC ---

class GravityParticles {
    constructor(container, options) {
        this.container = container;
        
        this.density = options.density || 230;
        this.particlesScale = options.particlesScale || 0.59;
        this.ringWidth = options.ringWidth || 0.011;
        this.ringWidth2 = options.ringWidth2 || 0.107;
        this.ringDisplacement = options.ringDisplacement || 0.53;

        this.colorControls = {
            color1: "#2c64ed",
            color2: "#617ff4",
            color3: "#517ffc"
        };
        
        this.pixelRatio = window.devicePixelRatio;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.clock = new THREE.Clock();
        this.lastTime = 0;
        this.time = 0;
        this.particleScale = 1.0;
        
        this.ringPos = new THREE.Vector2(0, 0);
        this.cursorPos = new THREE.Vector2(0, 0);
        this.mouse = new THREE.Vector2(0, 0);

        this.initThree();
        this.initParticles();
        this.initEvents();
    }

    initThree() {
        this.scene = new THREE.Scene();
        // Note: Background handled by CSS on the canvas for transparency flexibility
        this.scene.background = null; 

        this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 3.5;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.domElement.id = 'gravity-particles-canvas';
        this.container.appendChild(this.renderer.domElement);

        this.raycaster = new THREE.Raycaster();
        this.raycastPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(12.5, 12.5),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        this.scene.add(this.raycastPlane);
    }

    initParticles() {
        const minDistance = mapRange(this.density, 0, 300, 10, 2);
        const maxDistance = mapRange(this.density, 0, 300, 11, 3);
        
        const pds = new PoissonDiskSampling({
            shape: [500, 500],
            minDistance: minDistance,
            maxDistance: maxDistance,
            tries: 20
        });
        
        const points = pds.fill();
        const pointsData = [];
        
        for (let i = 0; i < points.length; i++) {
            pointsData.push(points[i][0] - 250, points[i][1] - 250);
        }
        this.count = pointsData.length / 2;
        this.size = 256; 
        
        this.posTex = this.createDataTexturePosition(pointsData);
        
        this.rt1 = this.createRenderTarget();
        this.rt2 = this.createRenderTarget();

        this.noise = new Simple1DNoise();
        this.simScene = new THREE.Scene();
        this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.simMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTex },
                uPosRefs: { value: this.posTex },
                uRingPos: { value: new THREE.Vector2(0, 0) },
                uRingRadius: { value: 0.2 },
                uDeltaTime: { value: 0 },
                uRingWidth: { value: this.ringWidth },
                uRingWidth2: { value: this.ringWidth2 },
                uRingDisplacement: { value: this.ringDisplacement },
                uTime: { value: 0 }
            },
            vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                precision highp float;
                uniform sampler2D uPosition;
                uniform sampler2D uPosRefs;
                uniform vec2 uRingPos;
                uniform float uTime;
                uniform float uDeltaTime;
                uniform float uRingRadius;
                uniform float uRingWidth;
                uniform float uRingWidth2;
                uniform float uRingDisplacement;
                ${noiseGLSL}
                void main() {
                    vec2 simTexCoords = gl_FragCoord.xy / vec2(${this.size.toFixed(1)}, ${this.size.toFixed(1)});
                    vec4 pFrame = texture2D(uPosition, simTexCoords);
                    float scale = pFrame.z;
                    float velocity = pFrame.w;
                    vec2 refPos = texture2D(uPosRefs, simTexCoords).xy;
                    float time = uTime * .5;
                    vec2 curentPos = refPos;
                    vec2 pos = pFrame.xy;
                    pos *= .98; 
                    float dist = distance(curentPos.xy, uRingPos);
                    float noise0 = snoise(vec3(curentPos.xy * .2 + vec2(18.4924, 72.9744), time * 0.5));
                    float dist1 = distance(curentPos.xy + (noise0 * .005), uRingPos);
                    float t = smoothstep(uRingRadius - (uRingWidth * 2.), uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth, dist1);
                    float t2 = smoothstep(uRingRadius - (uRingWidth2 * 2.), uRingRadius, dist) - smoothstep(uRingRadius, uRingRadius + uRingWidth2, dist1);
                    float t3 = smoothstep(uRingRadius + uRingWidth2, uRingRadius, dist);
                    t = pow(t, 2.);
                    t2 = pow(t2, 3.);
                    t += t2 * 3.;
                    t += t3 * .4;
                    t += snoise(vec3(curentPos.xy * 30. + vec2(11.4924, 12.9744), time * 0.5)) * t3 * .5;
                    float nS = snoise(vec3(curentPos.xy * 2. + vec2(18.4924, 72.9744), time * 0.5));
                    t += pow((nS + 1.5) * .5, 2.) * .6;
                    float noise1 = snoise(vec3(curentPos.xy * 4. + vec2(88.494, 32.4397), time * 0.35));
                    float noise2 = snoise(vec3(curentPos.xy * 4. + vec2(50.904, 120.947), time * 0.35));
                    float noise3 = snoise(vec3(curentPos.xy * 20. + vec2(18.4924, 72.9744), time * .5));
                    float noise4 = snoise(vec3(curentPos.xy * 20. + vec2(50.904, 120.947), time * .5));
                    vec2 disp = vec2(noise1, noise2) * .03;
                    disp += vec2(noise3, noise4) * .005;
                    disp.x += sin((refPos.x * 20.) + (time * 4.)) * .02 * clamp(dist, 0., 1.);
                    disp.y += cos((refPos.y * 20.) + (time * 3.)) * .02 * clamp(dist, 0., 1.);
                    pos -= (uRingPos - (curentPos + disp)) * pow(t2, .75) * uRingDisplacement;
                    float scaleDiff = t - scale;
                    scaleDiff *= .2;
                    scale += scaleDiff;
                    vec2 finalPos = curentPos + disp + (pos * .25);
                    velocity *= .5;
                    velocity += scale * .25;
                    vec4 frame = vec4(finalPos, scale, velocity);
                    gl_FragColor = frame;
                }
            `
        });

        const simPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial);
        this.simScene.add(simPlane);

        const geometry = new THREE.BufferGeometry();
        const uvs = new Float32Array(this.count * 2);
        const positions = new Float32Array(this.count * 3);

        for (let i = 0; i < this.count; i++) {
            let x = i % this.size;
            let y = Math.floor(i / this.size);
            uvs[i * 2] = (x + 0.5) / this.size;
            uvs[i * 2 + 1] = (y + 0.5) / this.size;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        this.renderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTex },
                uTime: { value: 0 },
                uColor1: { value: new THREE.Color(this.colorControls.color1) },
                uColor2: { value: new THREE.Color(this.colorControls.color2) },
                uColor3: { value: new THREE.Color(this.colorControls.color3) },
                uAlpha: { value: 1 },
                uRingPos: { value: this.ringPos },
                uRez: { value: new THREE.Vector2(this.width, this.height) },
                uParticleScale: { value: this.particleScale },
                uPixelRatio: { value: this.pixelRatio }
            },
            vertexShader: `
                precision highp float;
                uniform sampler2D uPosition;
                uniform float uParticleScale;
                uniform float uPixelRatio;
                varying float vVelocity;
                varying vec2 vLocalPos;
                varying float vScale;
                void main() {
                    vec4 pos = texture2D(uPosition, uv);
                    vVelocity = pos.w;
                    vScale = pos.z;
                    vLocalPos = pos.xy;
                    vec4 viewSpace = modelViewMatrix * vec4(vec3(pos.xy, 0.0), 1.0);
                    gl_Position = projectionMatrix * viewSpace;
                    float sizeMult = (vScale > 0.001) ? vScale : 1.0;
                    gl_PointSize = ((sizeMult * 7.0) * (uPixelRatio * 0.5) * uParticleScale);
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec2 vLocalPos;
                varying float vScale;
                varying float vVelocity;
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform vec3 uColor3;
                uniform vec2 uRingPos;
                uniform vec2 uRez;
                uniform float uAlpha;
                uniform float uTime;
                ${noiseGLSL}
                float sdRoundBox( in vec2 p, in vec2 b, in vec4 r ) {
                    r.xy = (p.x>0.0)?r.xy : r.zw;
                    r.x  = (p.y>0.0)?r.x  : r.y;
                    vec2 q = abs(p)-b+r.x;
                    return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r.x;
                }
                vec2 rotate(vec2 v, float a) {
                    float s = sin(a);
                    float c = cos(a);
                    mat2 m = mat2(c, s, -s, c);
                    return m * v;
                }
                void main() {
                    float noiseAngle = snoise(vec3(vLocalPos * 10. + vec2(18.4924, 72.9744), uTime * .85));
                    float noiseColor = snoise(vec3(vLocalPos * 2. + vec2(74.664, 91.556), uTime * .5));
                    noiseColor = (noiseColor + 1.) * .5;
                    float angle = atan(vLocalPos.y - uRingPos.y, vLocalPos.x - uRingPos.x);
                    vec2 uv = gl_PointCoord.xy;
                    uv -= vec2(0.5);
                    uv.y *= -1.;
                    uv = rotate(uv, -angle + (noiseAngle * .5));
                    float h = 0.8; 
                    float progress = smoothstep(0., .75, pow(noiseColor, 2.));
                    vec3 col = mix(mix(uColor1, uColor2, progress/h), mix(uColor2, uColor3, (progress - h)/(1.0 - h)), step(h, progress));
                    float rounded = sdRoundBox(uv, vec2(0.5, 0.2), vec4(.25));
                    rounded = smoothstep(.1, 0., rounded);
                    float a = uAlpha * rounded * smoothstep(0.1, 0.2, vScale);
                    if(a < 0.01) discard;
                    vec3 color = clamp(col, 0., 1.);
                    gl_FragColor = vec4(color, clamp(a, 0., 1.));
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.mesh = new THREE.Points(geometry, this.renderMaterial);
        this.mesh.scale.set(5, 5, 5);
        this.scene.add(this.mesh);

        this.resize();
        this.animate();
    }

    createDataTexturePosition(pointsData) {
        const data = new Float32Array(this.size * this.size * 4);
        for (let i = 0; i < this.size * this.size; i++) {
            const r = i * 4;
            if (i < this.count) {
                data[r + 0] = pointsData[i * 2 + 0] * (1 / 250);
                data[r + 1] = pointsData[i * 2 + 1] * (1 / 250);
                data[r + 2] = 1.0; 
                data[r + 3] = 0.0; 
            } else {
                data[r] = 0; data[r+1] = 0; data[r+2] = 0; data[r+3] = 0;
            }
        }
        const tex = new THREE.DataTexture(data, this.size, this.size, THREE.RGBAFormat, THREE.FloatType);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.needsUpdate = true;
        return tex;
    }

    createRenderTarget() {
        return new THREE.WebGLRenderTarget(this.size, this.size, {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false
        });
    }

    initEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / this.width) * 2 - 1;
            this.mouse.y = -(e.clientY / this.height) * 2 + 1;
        });
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        if (this.renderer) this.renderer.setSize(this.width, this.height);
        if (this.camera) {
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
        }
        
        if (this.renderMaterial && this.renderMaterial.uniforms) {
            if (this.renderMaterial.uniforms.uRez) 
                this.renderMaterial.uniforms.uRez.value.set(this.width, this.height);
            if (this.renderMaterial.uniforms.uPixelRatio) 
                this.renderMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
            
            if (this.renderer && this.renderer.domElement) {
                const width = this.renderer.domElement.width || window.innerWidth;
                this.particleScale = (width / this.pixelRatio / 2000) * this.particlesScale;
                if (this.particleScale < 0.1) this.particleScale = 0.1;
                this.renderMaterial.uniforms.uParticleScale.value = this.particleScale;
            }
        }
    }

    update() {
        const elapsedTime = this.clock.getElapsedTime();
        const dt = elapsedTime - this.lastTime;
        this.lastTime = elapsedTime;
        this.time = elapsedTime;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.raycastPlane);
        
        const noiseX = (this.noise.getVal(this.time * .66 + 94.234) - .5) * 2;
        const noiseY = (this.noise.getVal(this.time * .75 + 21.028) - .5) * 2;

        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.cursorPos.set(point.x * .175 + noiseX * .1, point.y * .175 + noiseY * .1);
            this.ringPos.lerp(this.cursorPos, 0.02);
        } else {
            this.cursorPos.set(noiseX * .2, noiseY * .1);
            this.ringPos.lerp(this.cursorPos, 0.01);
        }

        if (this.simMaterial && this.simMaterial.uniforms) {
            this.simMaterial.uniforms.uPosition.value = this.everRendered ? this.rt1.texture : this.posTex;
            this.simMaterial.uniforms.uTime.value = this.time;
            this.simMaterial.uniforms.uDeltaTime.value = dt;
            this.simMaterial.uniforms.uRingRadius.value = .175 + Math.sin(this.time * 1) * .03 + Math.cos(this.time * 3) * .02;
            this.simMaterial.uniforms.uRingPos.value = this.ringPos;
        }

        if (this.renderer && this.simScene && this.simCamera) {
            this.renderer.setRenderTarget(this.rt2);
            this.renderer.render(this.simScene, this.simCamera);
            this.renderer.setRenderTarget(null);
            if (this.renderMaterial && this.renderMaterial.uniforms) {
                this.renderMaterial.uniforms.uPosition.value = this.rt2.texture;
                this.renderMaterial.uniforms.uTime.value = this.time;
                this.renderMaterial.uniforms.uRingPos.value = this.ringPos;
            }
            this.renderer.render(this.scene, this.camera);
        }

        let temp = this.rt1;
        this.rt1 = this.rt2;
        this.rt2 = temp;
        this.everRendered = true;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
    }
}

// --- 4. INITIALIZATION ---

function loadPDS() {
    return new Promise((resolve, reject) => {
        if (window.PoissonDiskSampling) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/kchapelier/poisson-disk-sampling@2.3.1/build/poisson-disk-sampling.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load PDS'));
        document.head.appendChild(script);
    });
}

async function init() {
    injectStyles();
    try {
        await loadPDS();
        // Create a container if one doesn't exist
        let container = document.getElementById('gravity-particles-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'gravity-particles-container';
            document.body.appendChild(container);
        }
        new GravityParticles(container, CONFIG);
        console.log('Gravity Particles Loaded');
    } catch (e) {
        console.error('Gravity Particles failed to load:', e);
    }
}

// Auto-start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
