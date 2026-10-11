import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_TRANSITION } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '176',
  params: [
    ...TRANSITION_PARAMS,
    { key: 'zoom', label: 'ズーム量', type: 'number', min: 1, max: 12, step: 0.1, default: 6 },
    { key: 'blur', label: '放射ブラー', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'flash', label: '切替時の白フラッシュ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  notes: `前半はAへ高速ズームイン、中間でBに入れ替わり、後半はBが拡大状態から引いてくる。ズーム速度に比例した放射ブラー（中心へ向かう多重サンプル）で速度感を出す。${TRANSITION_NOTE}`,
  body: /* glsl */ `
${GLSL_TRANSITION}
vec3 sampleAB(vec2 uv, float useB) { return useB > 0.5 ? sceneB(uv) : texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb; }
void main() {
  float p = transitionProgress();
  float useB = step(0.5, p);
  float t = useB > 0.5 ? 1.0 - p : p;      // 0→0.5 を2回
  float s = 1.0 + pow(t * 2.0, 3.0) * (uZoom - 1.0);
  float speed = t * 2.0;
  vec2 c = vUv - 0.5;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float k = 1.0 - float(i) / 16.0 * uBlur * speed * 0.35;
    acc += sampleAB(0.5 + c / s * k, useB);
  }
  vec3 col = acc / 16.0;
  col += vec3(1.0) * uFlash * exp(-abs(p - 0.5) * 30.0);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
