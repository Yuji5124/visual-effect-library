import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderPost({
  id: '035',
  params: [
    {
      key: 'shape',
      label: '反転領域',
      type: 'select',
      options: [
        { value: 'circle', label: '広がる円' },
        { value: 'wipe', label: '斜めワイプ' },
        { value: 'noise', label: 'ノイズの斑' },
        { value: 'full', label: '全面' },
      ],
      default: 'circle',
    },
    { key: 'speed', label: '速度', type: 'number', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'softness', label: '境界のぼかし', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.01 },
    { key: 'hueKeep', label: '色相を保つ反転', type: 'bool', default: false },
  ],
  notes: '色反転そのものは 1-色 だが、反転領域の形をアニメーションさせて演出にする。「色相を保つ反転」は輝度だけを反転する（YIQ空間）。',
  body: /* glsl */ `
${GLSL_NOISE}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float t = uTime * uSpeed;
  float m;
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  if (uShape < 0.5) m = length(p) - fract(t * 0.5) * 1.2;
  else if (uShape < 1.5) m = (vUv.x + vUv.y) * 0.5 - fract(t * 0.4) * 1.4 + 0.2;
  else if (uShape < 2.5) m = fbm(p * 3.0 + t * 0.4) - 0.5;
  else m = -1.0;
  float k = 1.0 - smoothstep(-uSoftness, uSoftness, m);
  vec3 inv;
  if (uHueKeep > 0.5) {
    vec3 yiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
    yiq.x = 1.0 - yiq.x;
    inv = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * yiq;
  } else inv = 1.0 - c;
  gl_FragColor = vec4(mix(c, clamp(inv, 0.0, 1.0), k), 1.0);
}
`,
});
