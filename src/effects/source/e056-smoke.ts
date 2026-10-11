import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { FluidSim } from '../../engine/fluid';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const DISPLAY = /* glsl */ `
uniform sampler2D tDye;
uniform vec2 uTexel;
uniform vec3 uBg;
uniform vec3 uLight;
varying vec2 vUv;
void main() {
  float d = dot(texture2D(tDye, vUv).rgb, vec3(0.333));
  vec3 c = texture2D(tDye, vUv).rgb;
  float dx = dot(texture2D(tDye, vUv + vec2(uTexel.x, 0.0)).rgb - texture2D(tDye, vUv - vec2(uTexel.x, 0.0)).rgb, vec3(0.333));
  float dy = dot(texture2D(tDye, vUv + vec2(0.0, uTexel.y)).rgb - texture2D(tDye, vUv - vec2(0.0, uTexel.y)).rgb, vec3(0.333));
  vec3 n = normalize(vec3(-dx * 3.0, -dy * 3.0, 1.0));
  float lit = 0.55 + 0.6 * max(dot(n, normalize(vec3(-0.3, 0.7, 0.6))), 0.0);
  vec3 smoke = c / max(d, 1e-3) * uLight * lit;
  float alpha = 1.0 - exp(-d * 2.5);
  vec3 bg = uBg * (0.6 + 0.4 * vUv.y);
  gl_FragColor = vec4(mix(bg, smoke, alpha), 1.0);
}
`;

const effect: SourceEffect = {
  id: '056',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'buoyancy', label: '浮力', type: 'number', min: 0, max: 400, step: 1, default: 160 },
    { key: 'curl', label: '渦の強さ', type: 'number', min: 0, max: 60, step: 0.5, default: 30 },
    { key: 'emission', label: '煙の量', type: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
    { key: 'fade', label: '煙の消え方', type: 'number', min: 0, max: 3, step: 0.01, default: 0.45 },
    { key: 'tint', label: '煙の色', type: 'color', default: '#d9dde8' },
    { key: 'bg', label: '背景色', type: 'color', default: '#0b0d18' },
  ],
  notes:
    '流体ソルバーに「煙の密度に比例した上向きの浮力」と「渦度強調（vorticity confinement）」を加え、数値拡散で失われがちな細かい渦を保つ。表示では密度の勾配から擬似法線を作り、煙に立体的な陰影を付ける。ドラッグで煙をかき混ぜられる。',
  create(ctx) {
    const hi = ctx.quality === 'high';
    const aspect = ctx.width / ctx.height;
    const simH = hi ? 192 : 112;
    const dyeH = hi ? 600 : 300;
    const sim = new FluidSim(ctx.renderer, Math.round(simH * aspect), simH, Math.round(dyeH * aspect), dyeH);
    const quad = new FullscreenQuad();
    const display = makeShader(DISPLAY, {
      tDye: { value: null },
      uTexel: { value: new THREE.Vector2(1 / Math.round(dyeH * aspect), 1 / dyeH) },
      uBg: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Vector3(1, 1, 1) },
    });
    const color = new THREE.Vector3();
    const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false };
    let t = 0;
    return {
      render(target, params, frame) {
        const dt = Math.min(frame.dt, 1 / 30);
        t += dt;
        const em = Number(params.emission);
        hexToVec3(String(params.tint), color);
        // 床の数か所から煙を噴き出す（位置と向きはゆっくり揺れる）
        for (let i = 0; i < 3; i++) {
          const x = 0.25 + i * 0.25 + Math.sin(t * 0.7 + i * 2) * 0.05;
          const sway = Math.sin(t * 1.3 + i) * 80;
          sim.splat(x, 0.06, sway, 120, color.clone().multiplyScalar(em * dt * 6), 0.0009);
        }
        if (pointer.down) {
          sim.splat(pointer.x, pointer.y, (pointer.x - pointer.px) * 5000, (pointer.y - pointer.py) * 5000, null, 0.002);
        }
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        sim.step(dt, {
          buoyancy: Number(params.buoyancy),
          curl: Number(params.curl),
          dyeDissipation: Number(params.fade),
          velocityDissipation: 0.4,
          pressureIterations: hi ? 20 : 12,
        });
        display.uniforms.tDye.value = sim.dye.read.texture;
        hexToVec3(String(params.bg), display.uniforms.uBg.value);
        quad.render(ctx.renderer, display, target);
      },
      pointer(x, y, down) {
        if (down && !pointer.down) {
          pointer.px = x;
          pointer.py = y;
        }
        pointer.x = x;
        pointer.y = y;
        pointer.down = down;
      },
      dispose() {
        sim.dispose();
        display.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
