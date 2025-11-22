/**
 * Morphing Particles - Full Library
 * * fixes:
 * 1. Decoupled 'size' (vector image scale) from 'particlesScale' (individual dot size).
 * 2. AUTOMATIC DENSITY ADJUSTMENT: Spacing now remains consistent regardless of vector size.
 * 3. Dynamic Texture Sizing: Engine now supports high-density/large-scale images by resizing internal buffers automatically.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

// --- SHADER DEFINITIONS ---

const NOISE_GLSL = `
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec2 v){
const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
vec2 i  = floor(v + dot(v, C.yy) );
vec2 x0 = v -   i + dot(i, C.xx);
vec2 i1;
i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
vec4 x12 = x0.xyxy + C.xxzz;
x12.xy -= i1;
i = mod(i, 289.0);
vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
m = m*m ; m = m*m ;
vec3 x = 2.0 * fract(p * C.www) - 1.0;
vec3 h = abs(x) - 0.5;
vec3 ox = floor(x + 0.5);
vec3 a0 = x - ox;
m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
vec3 g;
g.x  = a0.x  * x0.x  + h.x  * x0.y;
g.yz = a0.yz * x12.xz + h.yz * x12.yw;
return 130.0 * dot(m, g);
}
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
vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
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
p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
m = m * m;
return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
`;

const SIM_VERTEX_SHADER = `void main() { gl_Position = vec4(position, 1.0); }`;

const SIM_FRAGMENT_SHADER_TEMPLATE = `
precision highp float;
uniform sampler2D uPosition;
uniform sampler2D uPosRefs;
uniform sampler2D uPosNearest;
uniform vec2 uMousePos;
uniform float uTime;
uniform float uDeltaTime;
uniform float uIsHovering;
${NOISE_GLSL}
vec2 hash( vec2 p ){ p = vec2( dot(p,vec2(2127.1,81.17)), dot(p,vec2(1269.5,283.37)) ); return fract(sin(p)*43758.5453); }
void main() {
    // TEXTURE_SIZE_PLACEHOLDER gets replaced by JS
    vec2 simTexCoords = gl_FragCoord.xy / vec2(TEXTURE_SIZE_PLACEHOLDER, TEXTURE_SIZE_PLACEHOLDER);
    vec4 pFrame = texture2D(uPosition, simTexCoords);
    float scale = pFrame.z;
    float velocity = pFrame.w;
    vec2 refPos = texture2D(uPosRefs, simTexCoords).xy;
    vec2 nearestPos = texture2D(uPosNearest, simTexCoords).xy;
    float seed = hash(simTexCoords).x;
    float seed2 = hash(simTexCoords).y;
    float time = uTime * .5;
    float lifeEnd = 3. + sin(seed2 * 100.) * 1.;
    float lifeTime = mod((seed * 100.) + time, lifeEnd);
    vec2 disp = vec2(0., 0.);
    vec2 pos = pFrame.xy;
    float distRadius = 0.15;
    
    // Interaction logic
    vec2 targetPos = refPos;
    targetPos = mix(targetPos, nearestPos, uIsHovering * uIsHovering);
    
    vec2 direction = normalize(targetPos - pos);
    direction *= .01;
    float dist = length(targetPos - pos);
    float distStrength = smoothstep(distRadius, 0., dist);
    if(dist > 0.005){ pos += direction * distStrength; }
    if(lifeTime < .01){ pos = refPos; pFrame.xy = refPos; scale = 0.; }
    float targetScale = smoothstep(.01, 0.5, lifeTime) - smoothstep(0.5, 1., lifeTime/lifeEnd);
    targetScale += smoothstep(0.1, 0., smoothstep(0.001, .1, dist)) * 1.5 * uIsHovering;
    float scaleDiff = targetScale - scale;
    scaleDiff *= .1;
    scale += scaleDiff;
    
    vec2 finalPos = pos + (disp * smoothstep(0.001, distRadius, dist));
    vec2 diff = finalPos - pFrame.xy;
    diff *= .2;
    velocity = smoothstep(distRadius, .001, dist) * uIsHovering;
    vec4 frame = vec4(pFrame.xy + diff, scale, velocity);
    gl_FragColor = frame;
}
`;

const RENDER_VERTEX_SHADER = `
precision highp float;
attribute vec4 seeds;
uniform sampler2D uPosition;
uniform float uTime;
uniform float uParticleScale;
uniform float uPixelRatio;
uniform int uColorScheme;
uniform float uIsHovering;
uniform float uPulseProgress;
varying vec4 vSeeds;
varying float vVelocity;
varying vec2 vLocalPos;
varying vec2 vScreenPos;
varying float vScale;
${NOISE_GLSL}
void main() {
    vec4 pos = texture2D(uPosition, uv);
    vSeeds = seeds;
    float noiseX = snoise(vec3( vec2(pos.xy * 10.), uTime * .2 + 100.));
    float noiseY = snoise(vec3( vec2(pos.xy * 10.), uTime * .2));
    float noiseX2 = snoise(vec3( vec2(pos.xy * .5), uTime * .15 + 45.));
    float noiseY2 = snoise(vec3( vec2(pos.xy * .5), uTime * .15 + 87.));
    float cDist = length(pos.xy) * 1.;
    float progress = uPulseProgress;
    float t = smoothstep(progress - .25, progress, cDist) - smoothstep(progress, progress + .25, cDist);
    t *= smoothstep(1., .0, cDist);
    pos.xy *= 1. + (t * .02);
    float dist = smoothstep(0., 0.9, pos.w);
    dist = mix(0., dist, uIsHovering);
    pos.y += noiseY * 0.005 * dist;
    pos.x += noiseX * 0.005 * dist;
    pos.y += noiseY2 * 0.02;
    pos.x += noiseX2 * 0.02;
    vVelocity = pos.w;
    vScale = pos.z;
    vLocalPos = pos.xy;
    vec4 viewSpace  = modelViewMatrix * vec4(vec3(pos.xy, 0.), 1.0);
    gl_Position = projectionMatrix * viewSpace;
    vScreenPos = gl_Position.xy;
    float minScale = .25;
    minScale += float(uColorScheme) * .75;
    
    gl_PointSize = ((vScale * 7.) * (uPixelRatio * 0.5) * uParticleScale) + (minScale * uPixelRatio);
}
`;

const RENDER_FRAGMENT_SHADER = `
precision highp float;
varying vec4 vSeeds;
varying vec2 vScreenPos;
varying vec2 vLocalPos;
varying float vScale;
varying float vVelocity;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uMousePos;
uniform vec2 uRez;
uniform float uAlpha;
uniform float uTime;
uniform int uColorScheme;
${NOISE_GLSL}
float sdRoundBox( in vec2 p, in vec2 b, in vec4 r ){
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
    float uBorderSize = 0.2;
    float ratio = uRez.x / uRez.y;
    vec2 uv = gl_PointCoord.xy;
    uv -= vec2(0.5);
    uv.y *= -1.;
    vec2 tuv = vScreenPos;
    tuv = rotate(tuv, uTime * 1.);
    tuv.y *= 1./ratio;
    tuv += .5;
    float h = 0.8;
    float progress = vVelocity;
    vec3 col = mix(mix(uColor1, uColor2, progress/h), mix(uColor2, uColor3, (progress - h)/(1.0 - h)), step(h, progress));
    vec3 color = col;
    float dist = sqrt(dot(uv, uv));
    float dr = .5;
    float t = smoothstep(dr+(uBorderSize + .0001), dr-uBorderSize, dist);
    t = clamp(t, 0., 1.);
    float rounded = sdRoundBox(uv, vec2(0.5, 0.2), vec4(.25));
    rounded = smoothstep(.1, 0., rounded);
    float disc = smoothstep(.5, .45, length(uv));
    float a = uAlpha * disc * smoothstep(0.1, 0.2, vScale);
    if(a < 0.01){ discard; }
    color = clamp(color, 0., 1.);
    color = mix(color, color * clamp(vVelocity, 0., 1.), float(uColorScheme));
    gl_FragColor = vec4(color, clamp(a, 0., 1.));
}
`;

// Inline Worker with Vector Size Compensation
const WORKER_SCRIPT = `
self.onmessage = function(e) {
    (function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.PoissonDiskSampling=f()}})((function(){var define,module,exports;return function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,(function(r){var n=e[i][1][r];return o(n||r)}),p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r}()({1:[function(require,module,exports){module.exports=function moore(range,dimensions){range=range||1;dimensions=dimensions||2;var size=range*2+1;var length=Math.pow(size,dimensions)-1;var neighbors=new Array(length);for(var i=0;i<length;i++){var neighbor=neighbors[i]=new Array(dimensions);var index=i<length/2?i:i+1;for(var dimension=1;dimension<=dimensions;dimension++){var value=index%Math.pow(size,dimension);neighbor[dimension-1]=value/Math.pow(size,dimension-1)-range;index-=value}}return neighbors}},{}],2:[function(require,module,exports){"use strict";var tinyNDArray=require("./../tiny-ndarray").integer,sphereRandom=require("./../sphere-random"),getNeighbourhood=require("./../neighbourhood");function squaredEuclideanDistance(point1,point2){var result=0,i=0;for(;i<point1.length;i++){result+=Math.pow(point1[i]-point2[i],2)}return result}function FixedDensityPDS(options,rng){if(typeof options.distanceFunction==="function"){throw new Error("PoissonDiskSampling: Tried to instantiate the fixed density implementation with a distanceFunction")}this.shape=options.shape;this.minDistance=options.minDistance;this.maxDistance=options.maxDistance||options.minDistance*2;this.maxTries=Math.ceil(Math.max(1,options.tries||30));this.rng=rng||Math.random;var maxShape=0;for(var i=0;i<this.shape.length;i++){maxShape=Math.max(maxShape,this.shape[i])}var floatPrecisionMitigation=Math.max(1,maxShape/128|0);var epsilonDistance=1e-14*floatPrecisionMitigation;this.dimension=this.shape.length;this.squaredMinDistance=this.minDistance*this.minDistance;this.minDistancePlusEpsilon=this.minDistance+epsilonDistance;this.deltaDistance=Math.max(0,this.maxDistance-this.minDistancePlusEpsilon);this.cellSize=this.minDistance/Math.sqrt(this.dimension);this.neighbourhood=getNeighbourhood(this.dimension);this.currentPoint=null;this.processList=[];this.samplePoints=[];this.gridShape=[];for(var i=0;i<this.dimension;i++){this.gridShape.push(Math.ceil(this.shape[i]/this.cellSize))}this.grid=tinyNDArray(this.gridShape)}FixedDensityPDS.prototype.shape=null;FixedDensityPDS.prototype.dimension=null;FixedDensityPDS.prototype.minDistance=null;FixedDensityPDS.prototype.maxDistance=null;FixedDensityPDS.prototype.minDistancePlusEpsilon=null;FixedDensityPDS.prototype.squaredMinDistance=null;FixedDensityPDS.prototype.deltaDistance=null;FixedDensityPDS.prototype.cellSize=null;FixedDensityPDS.prototype.maxTries=null;FixedDensityPDS.prototype.rng=null;FixedDensityPDS.prototype.neighbourhood=null;FixedDensityPDS.prototype.currentPoint=null;FixedDensityPDS.prototype.processList=null;FixedDensityPDS.prototype.samplePoints=null;FixedDensityPDS.prototype.gridShape=null;FixedDensityPDS.prototype.grid=null;FixedDensityPDS.prototype.addRandomPoint=function(){var point=new Array(this.dimension);for(var i=0;i<this.dimension;i++){point[i]=this.rng()*this.shape[i]}return this.directAddPoint(point)};FixedDensityPDS.prototype.addPoint=function(point){var dimension,valid=true;if(point.length===this.dimension){for(dimension=0;dimension<this.dimension&&valid;dimension++){valid=point[dimension]>=0&&point[dimension]<this.shape[dimension]}}else{valid=false}return valid?this.directAddPoint(point):null};FixedDensityPDS.prototype.directAddPoint=function(point){var internalArrayIndex=0,stride=this.grid.stride,dimension;this.processList.push(point);this.samplePoints.push(point);for(dimension=0;dimension<this.dimension;dimension++){internalArrayIndex+=(point[dimension]/this.cellSize|0)*stride[dimension]}this.grid.data[internalArrayIndex]=this.samplePoints.length;return point};FixedDensityPDS.prototype.inNeighbourhood=function(point){var dimensionNumber=this.dimension,stride=this.grid.stride,neighbourIndex,internalArrayIndex,dimension,currentDimensionValue,existingPoint;for(neighbourIndex=0;neighbourIndex<this.neighbourhood.length;neighbourIndex++){internalArrayIndex=0;for(dimension=0;dimension<dimensionNumber;dimension++){currentDimensionValue=(point[dimension]/this.cellSize|0)+this.neighbourhood[neighbourIndex][dimension];if(currentDimensionValue<0||currentDimensionValue>=this.gridShape[dimension]){internalArrayIndex=-1;break}internalArrayIndex+=currentDimensionValue*stride[dimension]}if(internalArrayIndex!==-1&&this.grid.data[internalArrayIndex]!==0){existingPoint=this.samplePoints[this.grid.data[internalArrayIndex]-1];if(squaredEuclideanDistance(point,existingPoint)<this.squaredMinDistance){return true}}}return false};FixedDensityPDS.prototype.next=function(){var tries,angle,distance,currentPoint,newPoint,inShape,i;while(this.processList.length>0){if(this.currentPoint===null){this.currentPoint=this.processList.shift()}currentPoint=this.currentPoint;for(tries=0;tries<this.maxTries;tries++){inShape=true;distance=this.minDistancePlusEpsilon+this.deltaDistance*this.rng();if(this.dimension===2){angle=this.rng()*Math.PI*2;newPoint=[Math.cos(angle),Math.sin(angle)]}else{newPoint=sphereRandom(this.dimension,this.rng)}for(i=0;inShape&&i<this.dimension;i++){newPoint[i]=currentPoint[i]+newPoint[i]*distance;inShape=newPoint[i]>=0&&newPoint[i]<this.shape[i]}if(inShape&&!this.inNeighbourhood(newPoint)){return this.directAddPoint(newPoint)}}if(tries===this.maxTries){this.currentPoint=null}}return null};FixedDensityPDS.prototype.fill=function(){if(this.samplePoints.length===0){this.addRandomPoint()}while(this.next()){}return this.samplePoints};FixedDensityPDS.prototype.getAllPoints=function(){return this.samplePoints};FixedDensityPDS.prototype.getAllPointsWithDistance=function(){throw new Error("PoissonDiskSampling: getAllPointsWithDistance() is not available in fixed-density implementation")};FixedDensityPDS.prototype.reset=function(){var gridData=this.grid.data,i=0;for(i=0;i<gridData.length;i++){gridData[i]=0}this.samplePoints=[];this.currentPoint=null;this.processList.length=0};module.exports=FixedDensityPDS},{"./../neighbourhood":4,"./../sphere-random":6,"./../tiny-ndarray":7}],3:[function(require,module,exports){"use strict";var tinyNDArray=require("./../tiny-ndarray").array,sphereRandom=require("./../sphere-random"),getNeighbourhood=require("./../neighbourhood");function euclideanDistance(point1,point2){var result=0,i=0;for(;i<point1.length;i++){result+=Math.pow(point1[i]-point2[i],2)}return Math.sqrt(result)}function VariableDensityPDS(options,rng){if(typeof options.distanceFunction!=="function"){throw new Error("PoissonDiskSampling: Tried to instantiate the variable density implementation without a distanceFunction")}this.shape=options.shape;this.minDistance=options.minDistance;this.maxDistance=options.maxDistance||options.minDistance*2;this.maxTries=Math.ceil(Math.max(1,options.tries||30));this.distanceFunction=options.distanceFunction;this.bias=Math.max(0,Math.min(1,options.bias||0));this.rng=rng||Math.random;var maxShape=0;for(var i=0;i<this.shape.length;i++){maxShape=Math.max(maxShape,this.shape[i])}var floatPrecisionMitigation=Math.max(1,maxShape/128|0);var epsilonDistance=1e-14*floatPrecisionMitigation;this.dimension=this.shape.length;this.minDistancePlusEpsilon=this.minDistance+epsilonDistance;this.deltaDistance=Math.max(0,this.maxDistance-this.minDistancePlusEpsilon);this.cellSize=this.maxDistance/Math.sqrt(this.dimension);this.neighbourhood=getNeighbourhood(this.dimension);this.currentPoint=null;this.currentDistance=0;this.processList=[];this.samplePoints=[];this.sampleDistance=[];this.gridShape=[];for(var i=0;i<this.dimension;i++){this.gridShape.push(Math.ceil(this.shape[i]/this.cellSize))}this.grid=tinyNDArray(this.gridShape)}VariableDensityPDS.prototype.shape=null;VariableDensityPDS.prototype.dimension=null;VariableDensityPDS.prototype.minDistance=null;VariableDensityPDS.prototype.maxDistance=null;VariableDensityPDS.prototype.minDistancePlusEpsilon=null;VariableDensityPDS.prototype.deltaDistance=null;VariableDensityPDS.prototype.cellSize=null;VariableDensityPDS.prototype.maxTries=null;VariableDensityPDS.prototype.distanceFunction=null;VariableDensityPDS.prototype.bias=null;VariableDensityPDS.prototype.rng=null;VariableDensityPDS.prototype.neighbourhood=null;VariableDensityPDS.prototype.currentPoint=null;VariableDensityPDS.prototype.currentDistance=null;VariableDensityPDS.prototype.processList=null;VariableDensityPDS.prototype.samplePoints=null;VariableDensityPDS.prototype.sampleDistance=null;VariableDensityPDS.prototype.gridShape=null;VariableDensityPDS.prototype.grid=null;VariableDensityPDS.prototype.addRandomPoint=function(){var point=new Array(this.dimension);for(var i=0;i<this.dimension;i++){point[i]=this.rng()*this.shape[i]}return this.directAddPoint(point)};VariableDensityPDS.prototype.addPoint=function(point){var dimension,valid=true;if(point.length===this.dimension){for(dimension=0;dimension<this.dimension&&valid;dimension++){valid=point[dimension]>=0&&point[dimension]<this.shape[dimension]}}else{valid=false}return valid?this.directAddPoint(point):null};VariableDensityPDS.prototype.directAddPoint=function(point){var internalArrayIndex=0,stride=this.grid.stride,pointIndex=this.samplePoints.length,dimension;this.processList.push(pointIndex);this.samplePoints.push(point);this.sampleDistance.push(this.distanceFunction(point));for(dimension=0;dimension<this.dimension;dimension++){internalArrayIndex+=(point[dimension]/this.cellSize|0)*stride[dimension]}this.grid.data[internalArrayIndex].push(pointIndex);return point};VariableDensityPDS.prototype.inNeighbourhood=function(point){var dimensionNumber=this.dimension,stride=this.grid.stride,neighbourIndex,internalArrayIndex,dimension,currentDimensionValue,existingPoint,existingPointDistance;var pointDistance=this.distanceFunction(point);for(neighbourIndex=0;neighbourIndex<this.neighbourhood.length;neighbourIndex++){internalArrayIndex=0;for(dimension=0;dimension<dimensionNumber;dimension++){currentDimensionValue=(point[dimension]/this.cellSize|0)+this.neighbourhood[neighbourIndex][dimension];if(currentDimensionValue<0||currentDimensionValue>=this.gridShape[dimension]){internalArrayIndex=-1;break}internalArrayIndex+=currentDimensionValue*stride[dimension]}if(internalArrayIndex!==-1&&this.grid.data[internalArrayIndex].length>0){for(var i=0;i<this.grid.data[internalArrayIndex].length;i++){existingPoint=this.samplePoints[this.grid.data[internalArrayIndex][i]];existingPointDistance=this.sampleDistance[this.grid.data[internalArrayIndex][i]];var minDistance=Math.min(existingPointDistance,pointDistance);var maxDistance=Math.max(existingPointDistance,pointDistance);var dist=minDistance+(maxDistance-minDistance)*this.bias;if(euclideanDistance(point,existingPoint)<this.minDistance+this.deltaDistance*dist){return true}}}}return false};VariableDensityPDS.prototype.next=function(){var tries,angle,distance,currentPoint,currentDistance,newPoint,inShape,i;while(this.processList.length>0){if(this.currentPoint===null){var sampleIndex=this.processList.shift();this.currentPoint=this.samplePoints[sampleIndex];this.currentDistance=this.sampleDistance[sampleIndex]}currentPoint=this.currentPoint;currentDistance=this.currentDistance;for(tries=0;tries<this.maxTries;tries++){inShape=true;distance=this.minDistancePlusEpsilon+this.deltaDistance*(currentDistance+(1-currentDistance)*this.bias);if(this.dimension===2){angle=this.rng()*Math.PI*2;newPoint=[Math.cos(angle),Math.sin(angle)]}else{newPoint=sphereRandom(this.dimension,this.rng)}for(i=0;inShape&&i<this.dimension;i++){newPoint[i]=currentPoint[i]+newPoint[i]*distance;inShape=newPoint[i]>=0&&newPoint[i]<this.shape[i]}if(inShape&&!this.inNeighbourhood(newPoint)){return this.directAddPoint(newPoint)}}if(tries===this.maxTries){this.currentPoint=null}}return null};VariableDensityPDS.prototype.fill=function(){if(this.samplePoints.length===0){this.addRandomPoint()}while(this.next()){}return this.samplePoints};VariableDensityPDS.prototype.getAllPoints=function(){return this.samplePoints};VariableDensityPDS.prototype.getAllPointsWithDistance=function(){var result=new Array(this.samplePoints.length),i=0,dimension=0,point;for(i=0;i<this.samplePoints.length;i++){point=new Array(this.dimension+1);for(dimension=0;dimension<this.dimension;dimension++){point[dimension]=this.samplePoints[i][dimension]}point[this.dimension]=this.sampleDistance[i];result[i]=point}return result};VariableDensityPDS.prototype.reset=function(){var gridData=this.grid.data,i=0;for(i=0;i<gridData.length;i++){gridData[i]=[]}this.samplePoints=[];this.currentPoint=null;this.processList.length=0};module.exports=VariableDensityPDS},{"./../neighbourhood":4,"./../sphere-random":6,"./../tiny-ndarray":7}],4:[function(require,module,exports){"use strict";var moore=require("moore");function getNeighbourhood(dimensionNumber){var neighbourhood=moore(2,dimensionNumber),origin=[],dimension;neighbourhood=neighbourhood.filter((function(n){var dist=0;for(var d=0;d<dimensionNumber;d++){dist+=Math.pow(Math.max(0,Math.abs(n[d])-1),2)}return dist<dimensionNumber}));for(dimension=0;dimension<dimensionNumber;dimension++){origin.push(0)}neighbourhood.push(origin);neighbourhood.sort((function(n1,n2){var squareDist1=0,squareDist2=0,dimension;for(dimension=0;dimension<dimensionNumber;dimension++){squareDist1+=Math.pow(n1[dimension],2);squareDist2+=Math.pow(n2[dimension],2)}if(squareDist1<squareDist2){return-1}else if(squareDist1>squareDist2){return 1}else{return 0}}));return neighbourhood}var neighbourhoodCache={};function getNeighbourhoodMemoized(dimensionNumber){if(!neighbourhoodCache[dimensionNumber]){neighbourhoodCache[dimensionNumber]=getNeighbourhood(dimensionNumber)}return neighbourhoodCache[dimensionNumber]}module.exports=getNeighbourhoodMemoized},{moore:1}],5:[function(require,module,exports){"use strict";var FixedDensityPDS=require("./implementations/fixed-density");var VariableDensityPDS=require("./implementations/variable-density");function PoissonDiskSampling(options,rng){this.shape=options.shape;if(typeof options.distanceFunction==="function"){this.implementation=new VariableDensityPDS(options,rng)}else{this.implementation=new FixedDensityPDS(options,rng)}}PoissonDiskSampling.prototype.implementation=null;PoissonDiskSampling.prototype.addRandomPoint=function(){return this.implementation.addRandomPoint()};PoissonDiskSampling.prototype.addPoint=function(point){return this.implementation.addPoint(point)};PoissonDiskSampling.prototype.next=function(){return this.implementation.next()};PoissonDiskSampling.prototype.fill=function(){return this.implementation.fill()};PoissonDiskSampling.prototype.getAllPoints=function(){return this.implementation.getAllPoints()};PoissonDiskSampling.prototype.getAllPointsWithDistance=function(){return this.implementation.getAllPointsWithDistance()};PoissonDiskSampling.prototype.reset=function(){this.implementation.reset()};module.exports=PoissonDiskSampling},{"./implementations/fixed-density":2,"./implementations/variable-density":3}],6:[function(require,module,exports){"use strict";module.exports=sampleSphere;function sampleSphere(d,rng){var v=new Array(d),d2=Math.floor(d/2)<<1,r2=0,rr,r,theta,h,i;for(i=0;i<d2;i+=2){rr=-2*Math.log(rng());r=Math.sqrt(rr);theta=2*Math.PI*rng();r2+=rr;v[i]=r*Math.cos(theta);v[i+1]=r*Math.sin(theta)}if(d%2){var x=Math.sqrt(-2*Math.log(rng()))*Math.cos(2*Math.PI*rng());v[d-1]=x;r2+=Math.pow(x,2)}h=1/Math.sqrt(r2);for(i=0;i<d;++i){v[i]*=h}return v}},{}],7:[function(require,module,exports){"use strict";function tinyNDArrayOfInteger(gridShape){var dimensions=gridShape.length,totalLength=1,stride=new Array(dimensions),dimension;for(dimension=dimensions;dimension>0;dimension--){stride[dimension-1]=totalLength;totalLength=totalLength*gridShape[dimension-1]}return{stride:stride,data:new Uint32Array(totalLength)}}function tinyNDArrayOfArray(gridShape){var dimensions=gridShape.length,totalLength=1,stride=new Array(dimensions),data=[],dimension,index;for(dimension=dimensions;dimension>0;dimension--){stride[dimension-1]=totalLength;totalLength=totalLength*gridShape[dimension-1]}for(index=0;index<totalLength;index++){data.push([])}return{stride:stride,data:data}}module.exports={integer:tinyNDArrayOfInteger,array:tinyNDArrayOfArray}},{}]},{},[5])(5)}));

    const { imageData, pointsBase, index, density, vectorSize } = e.data;

    const distanceFunction = function (point, imageData) {
        const pixelRedIndex = (Math.round(point[0]) + Math.round(point[1]) * imageData.width) * 4;
        const pixel = imageData.data[pixelRedIndex] / 255;
        return pixel * pixel * pixel;
    }

    const linearMap = (x, a, b, c, d) => {
        return ((x - a) * (d - c)) / (b - a) + c
    }

    // Compensation factor: 5 is the baseline size. If size is 9, factor is < 1, so distance is smaller, density is higher.
    const sizeFactor = 5.0 / (vectorSize || 5.0);
    
    // Apply factor to maxDistance
    const maxDistance = linearMap(density, 0, 300, 10, 50) * sizeFactor;
    
    // Also apply to minDistance used by PDS (defaults to 1, we scale it down)
    const minDistance = 1 * sizeFactor;

    const poissonDisk = new PoissonDiskSampling({
        shape: [500, 500],
        minDistance: minDistance,
        maxDistance: maxDistance,
        tries: 20,
        distanceFunction: function (point) {
            return distanceFunction(point, imageData);
        }
    });
    const points = poissonDisk.fill();

    const nearestPoints = []
    for (let i = 0; i < pointsBase.length; i++) {
        let nearestPoint = null;
        let nearestDistance = Infinity;
        for (let j = 0; j < points.length; j++) {
            if( Math.random() < .75) { continue; }
            const distance = Math.sqrt(Math.pow(points[j][0] - pointsBase[i][0], 2) + Math.pow(points[j][1] - pointsBase[i][1], 2));
            const pixelRedValue = distanceFunction(points[j], imageData);
            if (pixelRedValue < 1 && distance < nearestDistance) {
                nearestDistance = distance;
                nearestPoint = points[j];
            }
        }
        nearestPoints.push(
            nearestPoint[0] - 250,
            nearestPoint[1] - 250
        );
    }

    self.postMessage({ nearestPoints, index });
};
`;

// --- UTILS ---

const linearMap = (n, e, t, i, r) => (n - e) * (r - i) / (t - e) + i;

// --- LOADER ---
let loadPromise = null;

function loadLibs() {
    if (loadPromise) return loadPromise;

    loadPromise = new Promise(async (resolve, reject) => {
        const load = (url) => new Promise((res, rej) => {
            let existingScript = document.querySelector(`script[src="${url}"]`);
            if (existingScript) {
                if(url.includes('gsap') && window.gsap) return res();
                if(url.includes('poisson') && window.PoissonDiskSampling) return res();
                existingScript.addEventListener('load', res);
                existingScript.addEventListener('error', rej);
            } else {
                const s = document.createElement('script');
                s.src = url;
                s.onload = res;
                s.onerror = rej;
                document.head.appendChild(s);
            }
        });

        try {
            if(!window.gsap) await load('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js');
            if(!window.PoissonDiskSampling) await load('https://cdn.jsdelivr.net/gh/kchapelier/poisson-disk-sampling@2.3.1/build/poisson-disk-sampling.min.js');
            resolve();
        } catch (err) {
            reject(err);
        }
    });

    return loadPromise;
}

// --- MAIN CLASS ---

export class MorphingParticles {
    constructor(options) {
        this.options = options;
        this.containerId = options.containerId;
        this.imageUrl = options.imageUrl || "https://iili.io/f3MM7VV.md.png";
        this.theme = options.theme || "light";
        
        // 1. IMAGE SIZE: Controls the scale of the vector shape
        this.vectorSize = options.size || 5; 
        
        // 2. PARTICLE SIZE: Controls the individual dot size
        this.particlesScale = options.particlesScale || 0.5;

        // MOBILE DETECT & OPTIMIZATION
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

        let baseDensity = options.density || 130;
        if(this.isMobile) {
            baseDensity = Math.min(baseDensity, 80); 
        }
        this.density = baseDensity;

        this.cameraZoom = options.cameraZoom || 7.5;

        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.error(`MorphingParticles: Container #${this.containerId} not found.`);
            return;
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particles = null;
        this.animationId = null;
        this.destroyed = false;

        this.colorControls = {
            color1: "#93bbfb",
            color2: "#8ab4f8",
            color3: "#93bbfb"
        };
        this.hoverProgress = 0;
        this.time = 0;
        
        this.init();
    }

    async init() {
        try {
            await loadLibs();
            this.setupScene();
            this.setupParticles();
            this.setupEvents();
            this.animate();
        } catch (e) {
            console.error("Failed to init MorphingParticles:", e);
        }
    }

    setupScene() {
        this.scene = new THREE.Scene();
        
        const maxPixelRatio = this.isMobile ? 1.5 : window.devicePixelRatio;
        this.pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
        
        this.camera = new THREE.PerspectiveCamera(40, this.container.offsetWidth / this.container.offsetHeight, 0.1, 1000);
        this.camera.position.z = this.cameraZoom;

        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: !this.isMobile,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.domElement.style.display = 'block';
        
        this.container.appendChild(this.renderer.domElement);
        this.clock = new THREE.Clock();
    }

    async setupParticles() {
        this.particleSystem = new ParticleSystem(this, [this.imageUrl]);
        await this.particleSystem.init();
    }

    setupEvents() {
        this.resizeHandler = () => {
            this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
            this.camera.aspect = this.container.offsetWidth / this.container.offsetHeight;
            this.camera.updateProjectionMatrix();
            if(this.particleSystem) this.particleSystem.resize();
        };
        
        this.interactionHandler = (e) => {
            if(this.destroyed || !this.container) return;

            let clientX, clientY;
            if(e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            const rect = this.container.getBoundingClientRect();
            
            const isInside = (
                clientX >= rect.left && 
                clientX <= rect.right && 
                clientY >= rect.top && 
                clientY <= rect.bottom
            );

            if(isInside) {
                const x = ((clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((clientY - rect.top) / rect.height) * 2 + 1;
                
                if(this.particleSystem) {
                    this.particleSystem.mousePos.set(x, y);
                }
                gsap.to(this, { hoverProgress: 1, duration: 0.5, ease: "power3.out" });
            } else {
                gsap.to(this, { hoverProgress: 0, duration: 0.5, ease: "power3.out" });
            }
        };

        window.addEventListener("resize", this.resizeHandler);
        window.addEventListener("mousemove", this.interactionHandler);
        window.addEventListener("touchstart", this.interactionHandler, { passive: true });
        window.addEventListener("touchmove", this.interactionHandler, { passive: true });
    }

    animate() {
        if(this.destroyed) return;
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        this.time += this.clock.getDelta();

        if(this.particleSystem && this.particleSystem.initialized) {
            this.particleSystem.update();
        }
        
        if(this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    dispose() {
        this.destroyed = true;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener("resize", this.resizeHandler);
        window.removeEventListener("mousemove", this.interactionHandler);
        window.removeEventListener("touchstart", this.interactionHandler);
        window.removeEventListener("touchmove", this.interactionHandler);

        if(this.renderer) {
            this.renderer.dispose();
            this.container.removeChild(this.renderer.domElement);
        }
    }
}

// --- PARTICLE SYSTEM ---

class ParticleSystem {
    constructor(sceneController, textureUrls) {
        this.parent = sceneController;
        this.scene = sceneController.scene;
        this.renderer = sceneController.renderer;
        this.camera = sceneController.camera;
        this.textures = textureUrls;
        this.lastTime = 0;
        this.everRendered = false;
        this.mousePos = new THREE.Vector2(999,999);
        this.colorScheme = sceneController.theme === "dark" ? 0 : 1;
        
        // Initial Calculation of Particle Size (Independent of Vector Size)
        this.calculateParticleScale();
        
        this.initialized = false;
    }

    calculateParticleScale() {
        // This calculates how big the dots are based on screen width + particlesScale option
        let currentScale = this.renderer.domElement.width / this.parent.pixelRatio / 2e3 * this.parent.particlesScale;
        if(this.parent.isMobile) currentScale *= 1.5;
        this.particleScale = currentScale;
    }

    async init() {
        this.createPoints(); // Populates this.count and this.pointsBaseData

        // --- DYNAMIC TEXTURE SIZE CALCULATION ---
        // If we have a huge image, we might generate more points than 256x256 (65k) can hold.
        // We find the smallest power of 2 that can hold all points.
        // Baseline: 500x500 area.
        const neededSide = Math.ceil(Math.sqrt(this.count));
        this.size = THREE.MathUtils.ceilPowerOfTwo(neededSide);
        // Enforce minimum 256 for quality
        this.size = Math.max(256, this.size);
        
        this.length = this.size * this.size;
        
        // --- SHADER INJECTION ---
        // Inject the dynamic size into the shader string
        const simFragmentShader = SIM_FRAGMENT_SHADER_TEMPLATE.replace(
            /TEXTURE_SIZE_PLACEHOLDER/g, 
            this.size.toFixed(1)
        );

        await this.createPointsFromImage();

        this.posTex = this.createDataTexturePosition(this.pointsData);
        this.posNearestTex = this.createDataTexturePosition(this.nearestPointsData[0]);
        this.rt1 = this.createRenderTarget();
        this.rt2 = this.createRenderTarget();

        this.renderer.setRenderTarget(this.rt1); this.renderer.clear();
        this.renderer.setRenderTarget(this.rt2); this.renderer.clear();
        this.renderer.setRenderTarget(null);
        
        this.simScene = new THREE.Scene();
        this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        this.simMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTex },
                uPosRefs: { value: this.posTex },
                uPosNearest: { value: this.posNearestTex },
                uMousePos: { value: new THREE.Vector2(0, 0) },
                uRingRadius: { value: .2 },
                uDeltaTime: { value: 0 },
                uRingWidth: { value: .05 },
                uRingWidth2: { value: .015 },
                uIsHovering: { value: 0 },
                uTime: { value: 0 }
            },
            vertexShader: SIM_VERTEX_SHADER,
            fragmentShader: simFragmentShader // Use the injected shader
        });

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial);
        this.simScene.add(plane);

        const geometry = new THREE.BufferGeometry();
        const uvs = new Float32Array(this.count * 2);
        const positions = new Float32Array(this.count * 3);
        const seeds = new Float32Array(this.count * 4);

        for (let i = 0; i < this.count; i++) {
            let x = i % this.size;
            let y = Math.floor(i / this.size);
            uvs[i * 2] = x / this.size;
            uvs[i * 2 + 1] = y / this.size;
            seeds[i*4] = Math.random();
            seeds[i*4+1] = Math.random();
            seeds[i*4+2] = Math.random();
            seeds[i*4+3] = Math.random();
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute("seeds", new THREE.BufferAttribute(seeds, 4));

        this.renderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uPosition: { value: this.posTex },
                uTime: { value: 0 },
                uColor1: { value: new THREE.Color(this.parent.colorControls.color1) },
                uColor2: { value: new THREE.Color(this.parent.colorControls.color2) },
                uColor3: { value: new THREE.Color(this.parent.colorControls.color3) },
                uAlpha: { value: 1 },
                uIsHovering: { value: 0 },
                uPulseProgress: { value: 0 },
                uMousePos: { value: new THREE.Vector2(0, 0) },
                uRez: { value: new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height) },
                uParticleScale: { value: this.particleScale },
                uPixelRatio: { value: this.parent.pixelRatio },
                uColorScheme: { value: this.colorScheme }
            },
            vertexShader: RENDER_VERTEX_SHADER,
            fragmentShader: RENDER_FRAGMENT_SHADER,
            transparent: true, depthTest: false, depthWrite: false
        });

        this.mesh = new THREE.Points(geometry, this.renderMaterial);
        this.mesh.position.set(0, 0, 0);
        
        // --- STRICTLY APPLY VECTOR SIZE TO MESH TRANSFORM ONLY ---
        const s = this.parent.vectorSize;
        this.mesh.scale.set(s, -s, s); 
        
        this.scene.add(this.mesh);
        this.initialized = true;
    }

    createPoints() {
        if (typeof PoissonDiskSampling === 'undefined') {
            console.error("PoissonDiskSampling failed to load.");
            return;
        }

        // --- AUTOMATIC DENSITY ADJUSTMENT ---
        // If vectorSize is 5 (baseline), factor is 1.
        // If vectorSize is 9, factor is ~0.55 (creates smaller distance -> more points).
        // This keeps visual spacing constant regardless of scale.
        const sizeFactor = 5.0 / (this.parent.vectorSize || 5.0);

        const pds = new PoissonDiskSampling({
            shape: [500, 500],
            minDistance: linearMap(this.parent.density, 0, 300, 10, 2) * sizeFactor,
            maxDistance: linearMap(this.parent.density, 0, 300, 11, 3) * sizeFactor,
            tries: 20
        });
        const points = pds.fill();
        this.pointsBaseData = points;
        this.pointsData = [];
        for (let i = 0; i < points.length; i++) {
            this.pointsData.push(points[i][0] - 250, points[i][1] - 250);
        }
        this.count = this.pointsData.length / 2;
    }

    async getImageData(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = src;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = 500;
                canvas.height = 500;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, 500, 500);
                const data = ctx.getImageData(0, 0, 500, 500);
                resolve(data);
            };
            img.onerror = reject;
        });
    }

    async createPointsFromImage() {
        const imageDatas = [];
        for (let i = 0; i < this.textures.length; i++) {
            const data = await this.getImageData(this.textures[i]);
            imageDatas.push(data);
        }
        this.nearestPointsData = [];
        const workerPromises = [];
        for (let i = 0; i < this.textures.length; i++) {
            workerPromises.push(this.createPointsDistanceDataWorker(imageDatas[i], this.pointsBaseData, i));
        }
        const results = await Promise.all(workerPromises);
        results.sort((a, b) => a.index - b.index);
        results.forEach(r => this.nearestPointsData.push(r.nearestPoints));
    }

    createPointsDistanceDataWorker(imageData, pointsBase, index) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);
            worker.onmessage = function(e) {
                const { nearestPoints, index } = e.data;
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve({ nearestPoints, index });
            };
            worker.onerror = function(e) {
                worker.terminate();
                URL.revokeObjectURL(url);
                reject(e);
            };
            worker.postMessage({
                imageData: imageData,
                pointsBase: pointsBase,
                index: index,
                density: this.parent.density,
                vectorSize: this.parent.vectorSize // Pass vector size to worker
            });
        });
    }

    createDataTexturePosition(data) {
        // Initialize with correct size based on dynamic this.length
        const arr = new Float32Array(this.length * 4);
        for (let i = 0; i < this.count; i++) {
            const idx = i * 4;
            arr[idx + 0] = data[i * 2 + 0] * (1 / 250); 
            arr[idx + 1] = data[i * 2 + 1] * (1 / 250);
            arr[idx + 2] = 0;
            arr[idx + 3] = 0;
        }
        // Use dynamic this.size
        const tex = new THREE.DataTexture(arr, this.size, this.size, THREE.RGBAFormat, THREE.FloatType);
        tex.needsUpdate = true;
        return tex;
    }

    createRenderTarget() {
        return new THREE.WebGLRenderTarget(this.size, this.size, {
            wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat, type: THREE.HalfFloatType,
            depthBuffer: false, stencilBuffer: false
        });
    }

    resize() {
        if (!this.initialized) return;
        
        // 1. Update Uniforms for Shaders
        this.renderMaterial.uniforms.uRez.value = new THREE.Vector2(
            this.renderer.domElement.width,
            this.renderer.domElement.height
        );
        this.renderMaterial.uniforms.uPixelRatio.value = this.parent.pixelRatio;
        
        // 2. Re-apply Vector Size (Mesh Scale) logic in case it changed
        const s = this.parent.vectorSize;
        this.mesh.scale.set(s, -s, s);

        // 3. Re-calculate Particle Scale logic (Independent of Mesh Scale)
        this.calculateParticleScale();
        this.renderMaterial.uniforms.uParticleScale.value = this.particleScale;
        
        this.renderMaterial.needsUpdate = true;
    }

    update() {
        if (!this.initialized) return;
        const deltaTime = this.parent.clock.getElapsedTime() - this.lastTime;
        this.lastTime = this.parent.clock.getElapsedTime();
        
        // Ensure particle scale updates based on screen size, but ignores Mesh Scale
        this.calculateParticleScale();

        this.simMaterial.uniforms.uPosition.value = this.everRendered ? this.rt1.texture : this.posTex;
        this.simMaterial.uniforms.uTime.value = this.parent.clock.getElapsedTime();
        this.simMaterial.uniforms.uDeltaTime.value = deltaTime;
        this.simMaterial.uniforms.uRingRadius.value = .175 + Math.sin(this.parent.time * 1) * .03 + Math.cos(this.parent.time * 3) * .02;
        this.simMaterial.uniforms.uMousePos.value = this.mousePos;
        this.simMaterial.uniforms.uIsHovering.value = this.parent.hoverProgress;
        this.simMaterial.uniforms.uPosNearest.value = this.posNearestTex;

        this.renderer.setRenderTarget(this.rt2);
        this.renderer.render(this.simScene, this.simCamera);
        this.renderer.setRenderTarget(null);

        this.renderMaterial.uniforms.uPosition.value = this.everRendered ? this.rt2.texture : this.posTex;
        this.renderMaterial.uniforms.uTime.value = this.parent.clock.getElapsedTime();
        this.renderMaterial.uniforms.uMousePos.value = this.mousePos;
        
        // Pass the strictly calculated particle scale
        this.renderMaterial.uniforms.uParticleScale.value = this.particleScale;
        
        this.renderMaterial.uniforms.uIsHovering.value = this.parent.hoverProgress;
        
        let temp = this.rt1;
        this.rt1 = this.rt2;
        this.rt2 = temp;
        this.everRendered = true;
    }
}
