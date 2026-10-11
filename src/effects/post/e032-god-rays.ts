import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '032',
  params: [
    { key: 'lightX', label: '光源X', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'lightY', label: '光源Y', type: 'number', min: 0, max: 1, step: 0.01, default: 0.72 },
    { key: 'threshold', label: '光る明るさ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'density', label: '光芒の長さ', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.8 },
    { key: 'intensity', label: '強さ', type: 'number', min: 0, max: 3, step: 0.01, default: 1.2 },
    { key: 'orbit', label: '光源を動かす', type: 'bool', default: true },
  ],
  notes: '各画素から光源位置へ向かって複数回サンプリングし、明るい部分だけを減衰付きで積算する（スクリーンスペースのボリュームライト近似）。',
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec2 light = vec2(uLightX, uLightY);
  if (uOrbit > 0.5) light += vec2(sin(uTime * 0.4), cos(uTime * 0.3)) * 0.15;
  int samples = uQuality > 0.5 ? 64 : 32;
  vec2 delta = (vUv - light) * uDensity / float(samples);
  vec2 uv = vUv;
  float decay = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 64; i++) {
    if (i >= samples) break;
    uv -= delta;
    vec3 s = texture2D(tDiffuse, uv).rgb;
    acc += s * smoothstep(uThreshold, uThreshold + 0.2, luma(s)) * decay;
    decay *= 0.965;
  }
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  gl_FragColor = vec4(base + acc / float(samples) * uIntensity * 3.0, 1.0);
}
`,
});
