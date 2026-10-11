import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderPost({
  id: '088',
  params: [
    { key: 'impactX', label: '衝撃点X', type: 'number', min: 0, max: 1, step: 0.01, default: 0.62 },
    { key: 'impactY', label: '衝撃点Y', type: 'number', min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: 'cracks', label: 'ひびの量', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'bleed', label: '液晶漏れ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'lines', label: '縦線欠陥', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  notes: '衝撃点から放射状のひび（角度方向のハッシュで割れ線）と同心円状の割れを作り、周囲に黒い液晶漏れと虹色のにじみを広げる。さらに縦の色線（ドライバ故障）を重ねる。',
  body: /* glsl */ `
${GLSL_NOISE}
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 d = (vUv - vec2(uImpactX, uImpactY)) * vec2(aspect, 1.0);
  float r = length(d);
  float a = atan(d.y, d.x);
  float spokes = 0.0;
  for (int i = 0; i < 14; i++) {
    float sa = hash11(float(i) * 3.7) * 6.28318;
    float len = 0.2 + hash11(float(i) * 1.9) * 0.8;
    float da = abs(mod(a - sa + 3.14159 + vnoise(vec2(r * 12.0, float(i))) * 0.12, 6.28318) - 3.14159);
    spokes += smoothstep(0.012 / max(r, 0.02) * 0.02 + 0.004, 0.0, da * r) * step(r, len * uCracks + 0.05);
  }
  float rings = smoothstep(0.004, 0.0, abs(fract(r * 9.0 + vnoise(vec2(a * 3.0, 1.0)) * 0.4) - 0.5) * 0.11) * step(r, 0.35 * uCracks) * 0.7;
  float crack = clamp(spokes + rings, 0.0, 1.0);
  vec2 uv = vUv + d * crack * 0.01;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float blob = smoothstep(0.25 * uBleed, 0.0, r - fbm(vec2(a * 2.0, r * 4.0)) * 0.15);
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (r * 6.0 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, rainbow * col * 1.5, smoothstep(0.35 * uBleed, 0.1 * uBleed, r) * 0.6 * uBleed);
  col = mix(col, vec3(0.0), blob * 0.95);
  col = mix(col, vec3(0.85, 0.95, 1.0), crack * 0.8);
  float colLine = floor(vUv.x * uResolution.x);
  float defect = step(1.0 - uLines * 0.015, hash11(colLine * 0.37));
  vec3 lineCol = vec3(step(0.33, hash11(colLine)), step(0.5, hash11(colLine + 1.0)), step(0.66, hash11(colLine + 2.0)));
  col = mix(col, lineCol, defect * 0.9);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
