import * as THREE from 'three';
import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+-<>¦|ZTXE';

function atlas(): THREE.CanvasTexture {
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * 8;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#fff';
  g.font = `${cell * 0.8}px "MS Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * cell + cell / 2;
    const y = Math.floor(i / 8) * cell + cell / 2;
    g.save();
    g.translate(x, y);
    g.scale(-1, 1); // 鏡文字にしてデジタル感を出す
    g.fillText(GLYPHS[i % GLYPHS.length], 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export default defineShaderSource({
  id: '144',
  params: [
    { key: 'cellSize', label: '文字サイズ(px)', type: 'number', min: 8, max: 48, step: 1, default: 18 },
    { key: 'speed', label: '落下速度', type: 'number', min: 0.1, max: 4, step: 0.01, default: 1 },
    { key: 'density', label: '列の密度', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.75 },
    { key: 'color', label: '色', type: 'color', default: '#3dff7a' },
    { key: 'flicker', label: '文字の書き換え頻度', type: 'number', min: 0, max: 20, step: 0.1, default: 6 },
  ],
  notes: '列ごとにハッシュで速度・長さ・位相を決め、先頭からの距離で明るさを減衰させる。文字はCanvas2Dで作った8×8グリフアトラスから選択。DOMを使わず全画面1パスで描画。',
  extraDecl: 'uniform sampler2D tGlyphs;',
  extra() {
    const tex = atlas();
    return { uniforms: { tGlyphs: { value: tex } }, dispose: () => tex.dispose() };
  },
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  vec2 grid = floor(uResolution / uCellSize);
  vec2 cell = floor(vUv * grid);
  vec2 f = fract(vUv * grid);
  float colId = cell.x;
  float speed = (0.4 + hash11(colId * 1.7)) * uSpeed * 9.0;
  float len = 6.0 + hash11(colId * 5.1) * 26.0;
  float span = grid.y + len;
  float head = mod(uTime * speed + hash11(colId * 3.3) * span, span);
  float yTop = grid.y - 1.0 - cell.y;
  float d = head - yTop;
  float on = step(0.0, d) * step(d, len) * step(hash11(colId * 7.7), uDensity);
  float bright = on * pow(1.0 - d / len, 1.6);
  float rate = uFlicker * (0.3 + hash12(cell));
  float gi = floor(hash12(cell + floor(uTime * rate) * 0.37) * 64.0);
  vec2 guv = (vec2(mod(gi, 8.0), 7.0 - floor(gi / 8.0)) + f) / 8.0;
  float glyph = texture2D(tGlyphs, guv).r;
  vec3 col = uColor * glyph * bright * 2.0;
  col += vec3(0.85, 1.0, 0.9) * glyph * on * step(d, 1.0);
  col += uColor * 0.03 * hash12(cell);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
