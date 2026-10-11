import * as THREE from 'three';
import { defineShaderPost } from '../../engine/shaderEffect';

const SIZE = 32;
type Grade = (r: number, g: number, b: number) => [number, number, number];

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sCurve = (x: number, k: number) => {
  const y = x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k);
  return y;
};

/** 色調プリセット：入力RGB(0..1, 表示空間) → 出力RGB。すべて独自に設計した変換 */
const GRADES: Record<string, Grade> = {
  tealOrange: (r, g, b) => {
    const l = luma(r, g, b);
    const shadow = 1 - l;
    // 暗部を青緑に、肌の明るさ帯をオレンジ寄りに
    return [
      clamp(sCurve(r, 1.25) + 0.08 * l - 0.06 * shadow),
      clamp(sCurve(g, 1.2) + 0.02 * l + 0.03 * shadow),
      clamp(sCurve(b, 1.2) - 0.08 * l + 0.1 * shadow),
    ];
  },
  bleachBypass: (r, g, b) => {
    const l = luma(r, g, b);
    const mix = (c: number) => clamp(sCurve(c * 0.45 + l * 0.55, 1.6));
    return [mix(r), mix(g), mix(b)];
  },
  crossProcess: (r, g, b) => [clamp(sCurve(r, 1.5) * 1.05), clamp(sCurve(g, 1.2) * 1.02 + 0.03), clamp(b * 0.75 + 0.12)],
  vintage: (r, g, b) => {
    const l = luma(r, g, b);
    return [clamp(0.12 + l * 0.85 * 1.05 + (r - l) * 0.3), clamp(0.08 + l * 0.85 * 0.95 + (g - l) * 0.3), clamp(0.05 + l * 0.75 * 0.8 + (b - l) * 0.3)];
  },
  cyberpunk: (r, g, b) => {
    const l = luma(r, g, b);
    return [clamp(sCurve(r, 1.3) + 0.12 * (1 - l) * 0.5 + 0.1 * l), clamp(sCurve(g, 1.4) * 0.85), clamp(sCurve(b, 1.2) + 0.18 * (1 - l))];
  },
  noir: (r, g, b) => {
    const l = sCurve(luma(r, g, b), 1.9);
    return [clamp(l * 0.98), clamp(l), clamp(l * 1.04 + 0.03 * (1 - l))];
  },
};

function buildLut(grade: Grade): THREE.Data3DTexture {
  const data = new Uint8Array(SIZE * SIZE * SIZE * 4);
  let i = 0;
  for (let z = 0; z < SIZE; z++)
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const [r, g, b] = grade(x / (SIZE - 1), y / (SIZE - 1), z / (SIZE - 1));
        data[i++] = r * 255;
        data[i++] = g * 255;
        data[i++] = b * 255;
        data[i++] = 255;
      }
  const tex = new THREE.Data3DTexture(data, SIZE, SIZE, SIZE);
  tex.format = THREE.RGBAFormat;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export default defineShaderPost({
  id: '204',
  params: [
    {
      key: 'preset',
      label: '色調',
      type: 'select',
      options: [
        { value: 'tealOrange', label: 'ティール＆オレンジ（映画）' },
        { value: 'bleachBypass', label: '銀残し' },
        { value: 'crossProcess', label: 'クロスプロセス' },
        { value: 'vintage', label: 'ヴィンテージ' },
        { value: 'cyberpunk', label: 'サイバーパンク' },
        { value: 'noir', label: 'ノワール' },
      ],
      default: 'tealOrange',
    },
    { key: 'strength', label: '適用量', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'compare', label: '左右比較（左が元）', type: 'bool', default: false },
  ],
  notes:
    '32×32×32 の3D LUT（色の対応表）を3Dテクスチャとして持ち、入力色をそのまま3D座標として三線形補間で引く。どんなに複雑な色調補正でも1回のテクスチャ参照で済むため、ゲームの色調統一・時間帯表現・回想シーンなどに使える。LUTはプリセット関数からJSで生成（.cubeファイルを読み込めば外部ツールの色調も使える）。（着想: pmndrs/postprocessing の LUT3DEffect。実装は独自）',
  extraDecl: 'uniform highp sampler3D tLut;',
  extra() {
    const luts = new Map<string, THREE.Data3DTexture>();
    const uniform = { value: null as THREE.Data3DTexture | null };
    return {
      uniforms: { tLut: uniform },
      update(_frame, params) {
        const key = String(params.preset) in GRADES ? String(params.preset) : 'tealOrange';
        let t = luts.get(key);
        if (!t) {
          t = buildLut(GRADES[key]);
          luts.set(key, t);
        }
        uniform.value = t;
      },
      dispose() {
        luts.forEach((t) => t.dispose());
      },
    };
  },
  body: /* glsl */ `
void main() {
  vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
  // テクセル中心に合わせて補正してから3Dテクスチャを引く
  vec3 lutCoord = c * (31.0 / 32.0) + 0.5 / 32.0;
  vec3 graded = texture(tLut, lutCoord).rgb;
  vec3 col = mix(c, graded, uStrength);
  if (uCompare > 0.5 && vUv.x < 0.5) col = c;
  if (uCompare > 0.5) col = mix(col, vec3(1.0), smoothstep(0.0015, 0.0, abs(vUv.x - 0.5)));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
