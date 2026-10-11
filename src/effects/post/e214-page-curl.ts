import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_TRANSITION } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '214',
  params: [
    ...TRANSITION_PARAMS,
    { key: 'radius', label: 'めくれの丸み', type: 'number', min: 0.02, max: 0.3, step: 0.005, default: 0.1 },
    { key: 'angle', label: 'めくる方向（度）', type: 'number', min: 0, max: 90, step: 1, default: 30 },
    { key: 'backTint', label: '紙の裏の白さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.75 },
  ],
  notes: `紙を半径 r の円柱に巻き付けるモデルで、画素ごとに「平らな表」「円柱の表」「円柱の裏」「めくれて重なった裏面」のどれが一番上に見えるかを判定し、元の紙の位置へ逆写像してサンプリングする。めくれた先の地面には円柱からの距離に応じた影を落とす。${TRANSITION_NOTE}（着想: gl-transitions の InvertedPageCurl。実装は独自）`,
  body: /* glsl */ `
${GLSL_TRANSITION}
vec2 aspectV;
bool inside(vec2 q) { vec2 u = q / aspectV; return u.x >= 0.0 && u.x <= 1.0 && u.y >= 0.0 && u.y <= 1.0; }
vec3 pageA(vec2 q) { return texture2D(tDiffuse, q / aspectV).rgb; }
vec3 backSide(vec2 q) {
  vec3 c = pageA(q);
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  return mix(vec3(l), vec3(0.95, 0.93, 0.88), uBackTint);
}
void main() {
  float p = transitionProgress();
  aspectV = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 q = vUv * aspectV;
  float a = radians(uAngle);
  vec2 dir = normalize(vec2(cos(a), -sin(a)));     // めくれていく角の方向（右下寄り）
  float r = uRadius;
  const float PI = 3.14159265;
  vec2 corner = vec2(dir.x > 0.0 ? aspectV.x : 0.0, dir.y > 0.0 ? 1.0 : 0.0);
  float span = length(aspectV) * 1.05 + PI * r;
  vec2 foldPoint = corner - dir * p * span * 1.15;
  float s = dot(q - foldPoint, dir);              // 折り目からの距離（+側が持ち上がっている）
  vec3 col;
  // 1. めくれて裏返り、平らに重なった裏面（一番上）
  float tFlat = PI * r - s;
  vec2 srcFlat = q + dir * (tFlat - s);
  // 2・3. 円柱の裏・表
  float th = asin(clamp(s / r, -1.0, 1.0));
  vec2 srcBack = q + dir * (r * (PI - th) - s);
  vec2 srcFront = q + dir * (r * th - s);
  if (s < 0.0 && inside(srcFlat)) {
    col = backSide(srcFlat) * 0.92;
  } else if (s >= 0.0 && s <= r && inside(srcBack)) {
    col = backSide(srcBack) * (0.75 + 0.25 * cos(th));
  } else if (s >= 0.0 && s <= r && inside(srcFront)) {
    col = pageA(srcFront) * (0.55 + 0.45 * cos(th));
  } else if (s < 0.0) {
    col = pageA(q);
    // めくれて重なった裏面の縁がつくる落ち影
    float shadowDist = -s - PI * r * 0.0;
    col *= 1.0 - 0.3 * exp(-abs(shadowDist - (PI * r - r)) * 12.0) * step(0.0, p - 0.001);
  } else {
    col = sceneB(vUv);
    col *= 1.0 - 0.55 * exp(-(s - r) / (r * 0.9 + 0.01));
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
