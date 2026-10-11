import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { FluidSim } from '../../engine/fluid';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const DISPLAY = /* glsl */ `
uniform sampler2D tDye;
uniform vec3 uPaper;
uniform float uDensity;
varying vec2 vUv;
void main() {
  vec3 a = texture2D(tDye, vUv).rgb;   // 吸光度（インクの濃さ）
  vec3 col = uPaper * exp(-a * uDensity);
  float grain = fract(sin(dot(floor(vUv * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
  col *= 0.97 + 0.03 * grain;
  gl_FragColor = vec4(col, 1.0);
}
`;

const INKS = ['#1b3fff', '#ff2a6a', '#00a88a', '#ffb000', '#3b1d6e'];

const effect: SourceEffect = {
  id: '055',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'curl', label: '渦の強さ', type: 'number', min: 0, max: 60, step: 0.5, default: 25 },
    { key: 'fade', label: 'インクの薄まり', type: 'number', min: 0, max: 2, step: 0.01, default: 0.08 },
    { key: 'density', label: 'インクの濃さ', type: 'number', min: 0.5, max: 6, step: 0.01, default: 2.2 },
    { key: 'auto', label: '自動で垂らす', type: 'bool', default: true },
    { key: 'paper', label: '紙の色', type: 'color', default: '#f4efe4' },
  ],
  notes:
    'Stable Fluids（半ラグランジュ移流＋圧力投影）で非圧縮流体を解き、インクの「吸光度」を染料として流す。表示は紙の色 × exp(−吸光度) で、重なるほど暗く濁る減法混色になる。ドラッグでインクと流れを加えられる。',
  create(ctx) {
    const hi = ctx.quality === 'high';
    const aspect = ctx.width / ctx.height;
    const simH = hi ? 192 : 112;
    const dyeH = hi ? 720 : 360;
    const sim = new FluidSim(ctx.renderer, Math.round(simH * aspect), simH, Math.round(dyeH * aspect), dyeH);
    const quad = new FullscreenQuad();
    const display = makeShader(DISPLAY, { tDye: { value: null }, uPaper: { value: new THREE.Vector3() }, uDensity: { value: 2 } });
    const ink = new THREE.Vector3();
    const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false, color: 0 };
    let autoT = 0;
    let nextDrop = 0;
    const inkAbsorb = (hex: string, amount: number) => {
      hexToVec3(hex, ink);
      return ink.set((1 - ink.x) * amount, (1 - ink.y) * amount, (1 - ink.z) * amount);
    };
    return {
      render(target, params, frame) {
        const dt = Math.min(frame.dt, 1 / 30);
        autoT += dt;
        if (params.auto && autoT > nextDrop) {
          nextDrop = autoT + 0.6 + Math.random() * 1.2;
          const x = 0.15 + Math.random() * 0.7;
          const y = 0.15 + Math.random() * 0.7;
          const a = Math.random() * Math.PI * 2;
          const sp = 300 + Math.random() * 500;
          sim.splat(x, y, Math.cos(a) * sp, Math.sin(a) * sp, inkAbsorb(INKS[Math.floor(Math.random() * INKS.length)], 1.2), 0.0012);
        }
        if (pointer.down) {
          const dx = (pointer.x - pointer.px) * 4000;
          const dy = (pointer.y - pointer.py) * 4000;
          sim.splat(pointer.x, pointer.y, dx, dy, inkAbsorb(INKS[pointer.color % INKS.length], 0.35), 0.0008);
        }
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        sim.step(dt, {
          curl: Number(params.curl),
          dyeDissipation: Number(params.fade),
          velocityDissipation: 0.3,
          pressureIterations: hi ? 20 : 12,
        });
        display.uniforms.tDye.value = sim.dye.read.texture;
        hexToVec3(String(params.paper), display.uniforms.uPaper.value);
        display.uniforms.uDensity.value = Number(params.density);
        quad.render(ctx.renderer, display, target);
      },
      pointer(x, y, down) {
        if (down && !pointer.down) {
          pointer.px = x;
          pointer.py = y;
          pointer.color++;
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
