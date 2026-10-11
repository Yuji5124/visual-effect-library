import * as THREE from 'three';
import { AudioLink, type AudioInput } from '../../engine/audio';
import { AUDIO_PARAMS } from '../../engine/audioExtra';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const BINS = 128;
const ROWS = 96;

const VERT = /* glsl */ `
uniform sampler2D tHistory;
uniform float uHeight;
varying float vH;
varying float vDepth;
void main() {
  // uv.x = 周波数（中央が低音・左右対称）, uv.y = 時間（奥ほど過去）
  float f = abs(uv.x * 2.0 - 1.0);
  float h = texture2D(tHistory, vec2(f * f, uv.y)).r;
  vH = h;
  vec3 p = position;
  p.z += h * uHeight;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uFog;
varying float vH;
varying float vDepth;
void main() {
  vec3 c = mix(uLow, uHigh, smoothstep(0.0, 0.8, vH)) * (0.5 + vH * 1.5);
  c = mix(c, uFog, smoothstep(6.0, 22.0, vDepth));
  gl_FragColor = vec4(c, 1.0);
}
`;

const effect: SourceEffect = {
  id: '159',
  kind: 'source',
  status: 'implemented',
  params: [
    ...AUDIO_PARAMS,
    { key: 'height', label: '山の高さ', type: 'number', min: 0, max: 6, step: 0.01, default: 2.4 },
    { key: 'low', label: '谷の色', type: 'color', default: '#3d1bff' },
    { key: 'high', label: '峰の色', type: 'color', default: '#ff3dbe' },
  ],
  notes:
    '毎フレームのスペクトラムを1行として履歴テクスチャに積み、手前から奥へ送る。メッシュの頂点シェーダーがその履歴を読んで高さに変換するので、音楽の時間変化がそのまま山脈となって流れていく（周波数×時間の3Dスペクトログラム）。タップで音声開始。',
  create(ctx) {
    const link = new AudioLink();
    const data = new Uint8Array(BINS * ROWS * 4);
    const hist = new THREE.DataTexture(data, BINS, ROWS, THREE.RGBAFormat);
    hist.magFilter = THREE.LinearFilter;
    hist.minFilter = THREE.LinearFilter;
    hist.needsUpdate = true;
    const scene = new THREE.Scene();
    const fog = new THREE.Color(0x05010d).convertLinearToSRGB();
    scene.background = fog;
    const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.1, 100);
    camera.position.set(0, 2.2, 4.5);
    camera.lookAt(0, 0.6, -6);
    const geo = new THREE.PlaneGeometry(16, 24, BINS - 1, ROWS - 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tHistory: { value: hist },
        uHeight: { value: 2 },
        uLow: { value: new THREE.Vector3() },
        uHigh: { value: new THREE.Vector3() },
        uFog: { value: new THREE.Vector3(fog.r, fog.g, fog.b) },
      },
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // ローカルz（頂点シェーダーで持ち上げる方向）を世界の上方向にする
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -8;
    scene.add(mesh);
    let input: AudioInput = 'synth';
    let t = 0;
    return {
      render(target, params, frame) {
        input = (params.input as AudioInput) ?? 'synth';
        link.update(frame.time);
        link.hub.setVolume(Number(params.volume));
        t += frame.dt;
        // 履歴を1行ずらして、先頭（手前 = uv.y=0）に最新のスペクトラムを書く
        data.copyWithin(BINS * 4, 0, BINS * (ROWS - 1) * 4);
        const s = Number(params.sensitivity);
        for (let i = 0; i < BINS; i++) {
          const bin = Math.floor(Math.pow(i / BINS, 1.6) * 400);
          const v = Math.min(255, link.hub.spectrum[bin] * s);
          data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
          data[i * 4 + 3] = 255;
        }
        hist.needsUpdate = true;
        mat.uniforms.uHeight.value = Number(params.height);
        hexToVec3(String(params.low), mat.uniforms.uLow.value);
        hexToVec3(String(params.high), mat.uniforms.uHigh.value);
        camera.position.x = Math.sin(t * 0.2) * 1.2;
        camera.lookAt(0, 0.4, -8);
        camera.aspect = ctx.width / ctx.height;
        camera.updateProjectionMatrix();
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(scene, camera);
      },
      pointer(_x, _y, down) {
        if (down) link.startFromGesture(input);
      },
      status: () => link.status(input),
      dispose() {
        link.dispose();
        hist.dispose();
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

export default effect;
