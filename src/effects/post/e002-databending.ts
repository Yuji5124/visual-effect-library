import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '002', status: 'implemented',
  params: [
    { key: 'amount', label: '破損率', type: 'number', min: 0, max: 1, step: .01, default: .45 },
    { key: 'bytes', label: '破損ビット数', type: 'number', min: 1, max: 8, step: 1, default: 4 },
    { key: 'rows', label: '行レコード数', type: 'number', min: 8, max: 128, step: 1, default: 48 },
    { key: 'speed', label: '書き換え速度', type: 'number', min: 0, max: 10, step: .1, default: 2 },
  ],
  notes: '画像を行レコードとバイト列として扱う破損模擬。行の再配置とチャンネル順序の置換に加え、8bit画素値の下位ビットをXORで反転する。実ファイルは変更せず、フレーム履歴に依存しない。',
  body: /* glsl */ `
${GLSL_HASH}
float xorByte(float value, float mask) {
  float result = 0., bit = 1.;
  for (int i = 0; i < 8; i++) {
    result += mod(floor(value/bit) + floor(mask/bit), 2.) * bit;
    bit *= 2.;
  }
  return result;
}
void main() {
  vec3 original = texture2D(tDiffuse, vUv).rgb;
  float row = floor(vUv.y * uRows), tick = floor(uTime*uSpeed);
  float seed = hash12(vec2(row, tick));
  if (seed >= uAmount || uAmount <= 0.) { gl_FragColor = vec4(original, 1.); return; }
  float dest = floor(hash12(vec2(row + 17., tick)) * uRows);
  vec2 uv = vec2(fract(vUv.x + floor(seed * 8.) / 8.), (dest + fract(vUv.y*uRows))/uRows);
  vec3 bytes = floor(texture2D(tDiffuse, uv).rgb * 255. + .5);
  float mask = floor(hash12(vec2(floor(vUv.x*32.), row+tick)) * (exp2(uBytes)-1.)) + 1.;
  vec3 corrupt = vec3(xorByte(bytes.r,mask),xorByte(bytes.g,mask),xorByte(bytes.b,mask))/255.;
  if (seed < uAmount*.5) corrupt = corrupt.gbr;
  gl_FragColor = vec4(corrupt, 1.);
}`,
});
