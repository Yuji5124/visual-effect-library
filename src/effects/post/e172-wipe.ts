import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_TRANSITION } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '172',
  params: [
    ...TRANSITION_PARAMS,
    {
      key: 'shape',
      label: 'ワイプの形',
      type: 'select',
      options: [
        { value: 'linear', label: '直線（斜め）' },
        { value: 'circle', label: '円（アイリス）' },
        { value: 'clock', label: '時計回り' },
        { value: 'blinds', label: 'ブラインド' },
        { value: 'diamond', label: 'ダイヤ格子' },
      ],
      default: 'clock',
    },
    { key: 'softness', label: '境界のぼかし', type: 'number', min: 0, max: 0.2, step: 0.002, default: 0.01 },
    { key: 'border', label: '境界線', type: 'number', min: 0, max: 0.03, step: 0.001, default: 0.006 },
  ],
  notes: `画素ごとに「何%進んだら切り替わるか」を形状関数（距離・角度・格子）で決め、進行度と比較する。形状関数を差し替えるだけで任意の形のワイプが作れる。${TRANSITION_NOTE}`,
  body: /* glsl */ `
${GLSL_TRANSITION}
void main() {
  float p = transitionProgress();
  float aspect = uResolution.x / uResolution.y;
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float f;
  if (uShape < 0.5) f = (vUv.x * 0.8 + vUv.y * 0.2);
  else if (uShape < 1.5) f = length(q) / length(vec2(aspect, 1.0) * 0.5);
  else if (uShape < 2.5) f = fract(0.25 - atan(q.y, q.x) / 6.28318);
  else if (uShape < 3.5) f = fract(vUv.x * 8.0) * 0.6 + vUv.y * 0.4;
  else { vec2 g = fract(vUv * vec2(aspect, 1.0) * 6.0) - 0.5; f = (abs(g.x) + abs(g.y)) * 0.7 + vUv.x * 0.3; }
  float e = p * (1.0 + uSoftness * 2.0) - uSoftness;
  float k = smoothstep(e - uSoftness, e + uSoftness, f);
  vec3 col = mix(sceneB(vUv), texture2D(tDiffuse, vUv).rgb, k);
  col += vec3(1.0) * smoothstep(uBorder, 0.0, abs(f - e)) * step(0.001, p) * step(p, 0.999) * step(0.0001, uBorder);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
