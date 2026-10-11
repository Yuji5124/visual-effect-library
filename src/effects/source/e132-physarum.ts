import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { PingPong } from '../../engine/gpgpu';
import { GLSL_HASH } from '../../engine/glsl';
import { hexToVec3 } from '../../engine/shaderEffect';
import { renderNoClear } from '../../engine/renderUtil';
import type { SourceEffect } from '../../engine/types';

const INIT = /* glsl */ `
${GLSL_HASH}
uniform float uSeed;
uniform float uShape;
varying vec2 vUv;
void main() {
  vec2 r = hash22(vUv * 1000.0 + uSeed);
  vec2 r2 = hash22(vUv * 731.0 + uSeed * 1.3);
  vec2 pos; float ang;
  if (uShape < 0.5) {
    // 中心の円盤から外向きに
    float a = r.x * 6.28318; float d = sqrt(r.y) * 0.25;
    pos = vec2(0.5) + vec2(cos(a), sin(a)) * d; ang = a;
  } else {
    pos = r; ang = r2.x * 6.28318;
  }
  gl_FragColor = vec4(pos, ang, 1.0);
}
`;

const UPDATE = /* glsl */ `
${GLSL_HASH}
uniform sampler2D tState;
uniform sampler2D tTrail;
uniform float uSensorAngle;
uniform float uSensorDist;
uniform float uTurn;
uniform float uSpeed;
uniform float uTime;
uniform vec2 uTrailTexel;
uniform float uAspect;
varying vec2 vUv;
float sense(vec2 p, float a) {
  vec2 d = vec2(cos(a), sin(a) * uAspect) * uSensorDist * uTrailTexel.x;
  return texture2D(tTrail, fract(p + d)).r;
}
void main() {
  vec4 s = texture2D(tState, vUv);
  vec2 p = s.xy;
  float a = s.z;
  float f = sense(p, a);
  float l = sense(p, a + uSensorAngle);
  float r = sense(p, a - uSensorAngle);
  float rnd = hash12(vUv * 997.0 + uTime);
  if (f > l && f > r) { }
  else if (f < l && f < r) a += (rnd - 0.5) * 2.0 * uTurn;
  else if (l > r) a += uTurn * (0.5 + rnd * 0.5);
  else if (r > l) a -= uTurn * (0.5 + rnd * 0.5);
  p += vec2(cos(a), sin(a) * uAspect) * uSpeed * uTrailTexel.x;
  gl_FragColor = vec4(fract(p), a, 1.0);
}
`;

const DEPOSIT_VERT = /* glsl */ `
uniform sampler2D tState;
uniform float uPointSize;
attribute vec2 aRef;
void main() {
  vec2 p = texture2D(tState, aRef).xy;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}
`;

const DEPOSIT_FRAG = /* glsl */ `
uniform float uAmount;
void main() { gl_FragColor = vec4(uAmount, uAmount, uAmount, 1.0); }
`;

const DIFFUSE = /* glsl */ `
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uDecay;
uniform vec3 uFood;
uniform float uAspect;
varying vec2 vUv;
void main() {
  float s = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) s += texture2D(tState, fract(vUv + vec2(float(x), float(y)) * uTexel)).r;
  s = s / 9.0 * uDecay;
  if (uFood.z > 0.0) s += 0.6 * smoothstep(uFood.z, 0.0, length((vUv - uFood.xy) * vec2(uAspect, 1.0)));
  gl_FragColor = vec4(min(s, 50.0), 0.0, 0.0, 1.0);
}
`;

const DISPLAY = /* glsl */ `
uniform sampler2D tTrail;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uGain;
varying vec2 vUv;
void main() {
  float v = 1.0 - exp(-texture2D(tTrail, vUv).r * uGain);
  vec3 col = mix(vec3(0.0), uColorA, smoothstep(0.0, 0.5, v));
  col = mix(col, uColorB, smoothstep(0.5, 1.0, v));
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '132',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'sensorAngle', label: 'センサー角（度）', type: 'number', min: 5, max: 90, step: 1, default: 30 },
    { key: 'sensorDist', label: 'センサー距離(px)', type: 'number', min: 2, max: 40, step: 0.5, default: 12 },
    { key: 'turn', label: '旋回角（度）', type: 'number', min: 5, max: 90, step: 1, default: 25 },
    { key: 'speed', label: '移動速度(px)', type: 'number', min: 0.3, max: 3, step: 0.05, default: 1.1 },
    { key: 'decay', label: 'フェロモン減衰', type: 'number', min: 0.8, max: 0.99, step: 0.001, default: 0.93 },
    { key: 'colorA', label: '色（薄い）', type: 'color', default: '#3d2bff' },
    { key: 'colorB', label: '色（濃い）', type: 'color', default: '#fff2a8' },
  ],
  notes:
    'Jeff Jones の Physarum モデル。数万〜十数万のエージェントが前方3方向のフェロモン濃度を感知して旋回・前進し、通った跡にフェロモンを置く。フェロモンは拡散・減衰する。エージェント状態は浮動小数点テクスチャ、フェロモンの付着は頂点シェーダーでテクスチャを読む点群描画で行い、すべてGPUで完結する。ドラッグで餌を置ける。',
  create(ctx) {
    const r = ctx.renderer;
    const hi = ctx.quality === 'high';
    const aw = hi ? 512 : 256;
    const ah = hi ? 256 : 128;
    const aspect = ctx.width / ctx.height;
    const th = hi ? 400 : 256;
    const tw = Math.round(th * aspect);
    // 位置の精度のため、可能なら32bit浮動小数点を使う
    const fullFloat = r.extensions.has('EXT_color_buffer_float');
    const makeRT = (w: number, h: number, type: THREE.TextureDataType, linear: boolean) =>
      new THREE.WebGLRenderTarget(w, h, {
        type,
        minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
        magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
        depthBuffer: false,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
      });
    const agents = new PingPong(aw, ah, { nearest: true });
    agents.read.dispose();
    agents.write.dispose();
    agents.read = makeRT(aw, ah, fullFloat ? THREE.FloatType : THREE.HalfFloatType, false);
    agents.write = makeRT(aw, ah, fullFloat ? THREE.FloatType : THREE.HalfFloatType, false);
    const trail = new PingPong(tw, th, { float: true, wrap: true });
    const quad = new FullscreenQuad();
    const init = makeShader(INIT, { uSeed: { value: Math.random() * 100 }, uShape: { value: 0 } });
    const update = makeShader(UPDATE, {
      tState: { value: null },
      tTrail: { value: null },
      uSensorAngle: { value: 0.5 },
      uSensorDist: { value: 9 },
      uTurn: { value: 0.4 },
      uSpeed: { value: 1 },
      uTime: { value: 0 },
      uTrailTexel: { value: new THREE.Vector2(1 / tw, 1 / th) },
      uAspect: { value: aspect },
    });
    const diffuse = makeShader(DIFFUSE, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2(1 / tw, 1 / th) },
      uDecay: { value: 0.93 },
      uFood: { value: new THREE.Vector3() },
      uAspect: { value: aspect },
    });
    const display = makeShader(DISPLAY, {
      tTrail: { value: null },
      uColorA: { value: new THREE.Vector3() },
      uColorB: { value: new THREE.Vector3() },
      uGain: { value: hi ? 0.35 : 0.6 },
    });
    // 各エージェントの状態テクセルを参照する点群
    const refs = new Float32Array(aw * ah * 2);
    for (let y = 0; y < ah; y++)
      for (let x = 0; x < aw; x++) {
        const i = (y * aw + x) * 2;
        refs[i] = (x + 0.5) / aw;
        refs[i + 1] = (y + 0.5) / ah;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(aw * ah * 3), 3));
    const depositMat = new THREE.ShaderMaterial({
      vertexShader: DEPOSIT_VERT,
      fragmentShader: DEPOSIT_FRAG,
      uniforms: { tState: { value: null }, uAmount: { value: hi ? 0.5 : 1 }, uPointSize: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const points = new THREE.Points(geo, depositMat);
    points.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(points);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    agents.fill(r, init);
    const food = { x: 0, y: 0, down: false };

    return {
      render(target, params, frame) {
        const deg = Math.PI / 180;
        const u = update.uniforms;
        u.uSensorAngle.value = Number(params.sensorAngle) * deg;
        u.uSensorDist.value = Number(params.sensorDist);
        u.uTurn.value = Number(params.turn) * deg;
        u.uSpeed.value = Number(params.speed);
        u.uTime.value = frame.time;
        u.tTrail.value = trail.read.texture;
        agents.step(r, update);
        depositMat.uniforms.tState.value = agents.read.texture;
        renderNoClear(r, scene, cam, trail.read);
        diffuse.uniforms.uDecay.value = Number(params.decay);
        diffuse.uniforms.uFood.value.set(food.x, food.y, food.down ? 0.03 : 0);
        trail.step(r, diffuse);
        display.uniforms.tTrail.value = trail.read.texture;
        hexToVec3(String(params.colorA), display.uniforms.uColorA.value);
        hexToVec3(String(params.colorB), display.uniforms.uColorB.value);
        quad.render(r, display, target);
      },
      pointer(x, y, down) {
        food.x = x;
        food.y = y;
        food.down = down;
      },
      dispose() {
        agents.dispose();
        trail.dispose();
        quad.dispose();
        init.dispose();
        update.dispose();
        diffuse.dispose();
        display.dispose();
        geo.dispose();
        depositMat.dispose();
      },
    };
  },
};

export default effect;
