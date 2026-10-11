import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { GLSL_HASH } from '../../engine/glsl';
import type { SourceEffect } from '../../engine/types';

const LINES = [
  'VISUAL EFFECT LIBRARY 200',
  '映像演出の実験室へようこそ',
  'SIGNAL://MUTOPIA.WORLD/0xFF',
  'ERROR 404: REALITY NOT FOUND',
  'データは書き換えられ、また復元される',
];
const GLYPHS = '!<>-_\\/[]{}—=+*^?#ｱｲｳｴｵｶｷｸｹｺ01アイウエオ█▓▒░';

const DISPLAY = /* glsl */ `
${GLSL_HASH}
uniform sampler2D tText;
uniform float uTime;
uniform float uSplit;
varying vec2 vUv;
void main() {
  float t = floor(uTime * 20.0);
  float row = floor(vUv.y * 40.0);
  float shift = step(0.93, hash12(vec2(row, t))) * (hash12(vec2(row * 1.7, t)) - 0.5) * 0.06;
  vec2 uv = vUv + vec2(shift, 0.0);
  float o = uSplit * (0.002 + step(0.9, hash11(t)) * 0.006);
  float r = texture2D(tText, uv + vec2(o, 0.0)).r;
  float g = texture2D(tText, uv).g;
  float b = texture2D(tText, uv - vec2(o, 0.0)).b;
  vec3 col = vec3(r, g, b);
  col *= 0.9 + 0.1 * sin(vUv.y * 600.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '148',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'speed', label: '解読の速さ', type: 'number', min: 0.2, max: 3, step: 0.01, default: 1 },
    { key: 'corrupt', label: '再破損の頻度', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'split', label: '色ずれ', type: 'number', min: 0, max: 3, step: 0.01, default: 1 },
    { key: 'color', label: '文字色', type: 'color', default: '#e8f7ff' },
  ],
  notes:
    '各文字に「確定する時刻」を割り当て、確定前はランダムな記号に化けたまま毎フレーム書き換える（スクランブル→復元）。文字列はCanvas2Dで描いてテクスチャ化し、シェーダーで行単位の横ずれとRGB分離を加える。確定後もときどき一部の文字だけ再び化ける。',
  create(ctx) {
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const quad = new FullscreenQuad();
    const display = makeShader(DISPLAY, { tText: { value: tex }, uTime: { value: 0 }, uSplit: { value: 1 } });
    const size = () => {
      canvas.width = Math.min(1600, Math.max(320, Math.floor(ctx.width)));
      canvas.height = Math.min(900, Math.max(180, Math.floor(ctx.height)));
      tex.dispose();
    };
    size();
    const reveal: number[][] = LINES.map((l) => Array.from(l, () => 0));
    let t = 0;
    const restart = () => {
      t = 0;
      LINES.forEach((l, li) => {
        for (let i = 0; i < l.length; i++) reveal[li][i] = li * 0.6 + i * 0.05 + Math.random() * 0.8;
      });
    };
    restart();
    return {
      render(target, params, frame) {
        t += frame.dt * Number(params.speed);
        if (t > 10) restart();
        const W = canvas.width, H = canvas.height;
        g.fillStyle = '#04060a';
        g.fillRect(0, 0, W, H);
        const fs = Math.floor(H / 13);
        g.font = `700 ${fs}px "Consolas", "Menlo", "MS Gothic", monospace`;
        g.textBaseline = 'middle';
        const color = String(params.color);
        const corrupt = Number(params.corrupt);
        LINES.forEach((line, li) => {
          const y = H * 0.2 + li * fs * 1.6;
          let x = W * 0.08;
          for (let i = 0; i < line.length; i++) {
            let ch = line[i];
            const done = t > reveal[li][i];
            const recorrupt = done && Math.random() < corrupt * 0.01;
            if (!done || recorrupt) {
              ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
              g.fillStyle = Math.random() < 0.5 ? '#3dfff0' : '#ff3b8b';
            } else g.fillStyle = color;
            if (t > reveal[li][i] - 0.6 || recorrupt) g.fillText(ch, x, y);
            x += g.measureText(line[i]).width;
          }
        });
        tex.needsUpdate = true;
        display.uniforms.uTime.value = frame.time;
        display.uniforms.uSplit.value = Number(params.split);
        quad.render(ctx.renderer, display, target);
      },
      resize() {
        size();
      },
      dispose() {
        tex.dispose();
        display.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
