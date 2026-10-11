import * as THREE from 'three';
import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

const RAMP = ' .:-=+*#%@';

function glyphAtlas(): THREE.CanvasTexture {
  const cell = 48;
  const canvas = document.createElement('canvas');
  canvas.width = cell * RAMP.length;
  canvas.height = cell;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#fff';
  g.font = `bold ${cell * 0.9}px "Consolas", "Menlo", "Courier New", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < RAMP.length; i++) g.fillText(RAMP[i], cell * (i + 0.5), cell * 0.55);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export default defineShaderPost({
  id: '022',
  params: [
    { key: 'cellSize', label: '文字サイズ(px)', type: 'number', min: 6, max: 40, step: 1, default: 12 },
    {
      key: 'mode',
      label: '色',
      type: 'select',
      options: [
        { value: 'source', label: '元の色' },
        { value: 'terminal', label: 'ターミナル緑' },
        { value: 'mono', label: 'モノクロ' },
      ],
      default: 'source',
    },
    { key: 'contrast', label: 'コントラスト', type: 'number', min: 0.5, max: 3, step: 0.01, default: 1.3 },
  ],
  notes: '輝度順に並べた10文字のグリフをCanvas2Dでテクスチャ化し、セルごとの平均輝度でグリフを選んで描く。',
  extraDecl: 'uniform sampler2D tGlyphs;',
  extra() {
    const tex = glyphAtlas();
    return { uniforms: { tGlyphs: { value: tex } }, dispose: () => tex.dispose() };
  },
  body: /* glsl */ `
${GLSL_COLOR}
const float GLYPHS = 10.0;
void main() {
  vec2 cell = vec2(uCellSize, uCellSize * 1.6) / uResolution;
  vec2 c = floor(vUv / cell);
  vec2 center = (c + 0.5) * cell;
  vec3 src = texture2D(tDiffuse, center).rgb;
  float l = clamp((pow(luma(src), 0.55) - 0.5) * uContrast + 0.5, 0.0, 0.999);
  float idx = floor(l * GLYPHS);
  vec2 f = fract(vUv / cell);
  float g = texture2D(tGlyphs, vec2((idx + f.x) / GLYPHS, f.y)).r;
  vec3 tint = uMode < 0.5 ? src * 1.5 + 0.1 : (uMode < 1.5 ? vec3(0.35, 1.0, 0.55) : vec3(1.0));
  gl_FragColor = vec4(tint * g, 1.0);
}
`,
});
