import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HISTORY, historyExtra } from '../../engine/history';

export default defineShaderPost({
  id: '013', status: 'implemented',
  params: [
    { key: 'slices', label: '扇形の時間分割数', type: 'number', min: 2, max: 24, step: 1, default: 12 },
    { key: 'depth', label: '遡るフレーム数', type: 'number', min: 0, max: 47, step: 1, default: 36 },
    { key: 'speed', label: '分割面の回転速度', type: 'number', min: -2, max: 2, step: .01, default: .15 },
    { key: 'smooth', label: '時刻の補間', type: 'bool', default: true },
  ],
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 48, scale: .5 }),
  notes: '画面を中心から放射状に分割し、扇形ごとに連続した異なる過去時刻を割り当てる。領域内の時刻は一定で、走査線ごとの連続遅延とは異なる。回転する時間境界により、動く対象が時間ごとに分断される。',
  body: /* glsl */ `
void main() {
  if (uDepth < .5) { gl_FragColor = vec4(texture2D(tDiffuse,vUv).rgb,1.); return; }
  vec2 p = (vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
  float angle = atan(p.y,p.x)/6.2831853 + .5 + uTime*uSpeed*.1;
  float slice = floor(fract(angle)*uSlices);
  float age = slice/max(1.,uSlices-1.) * uDepth;
  vec3 color = historyAt(vUv,age);
  if (uSmooth > .5) color = mix(color,historyAt(vUv,age+1.),fract(age));
  gl_FragColor = vec4(color,1.);
}`,
});
