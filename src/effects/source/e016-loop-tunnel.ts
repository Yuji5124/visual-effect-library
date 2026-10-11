import { defineShaderSource } from '../../engine/shaderEffect';
import { demoScene } from '../../engine/demoScene';
import { createTarget } from '../../engine/fullscreen';
import type { FrameInfo, ParamValues } from '../../engine/types';

export default defineShaderSource({
  id: '016',
  status: 'implemented',
  params: [
    { key: 'speed', label: '前進速度', type: 'number', min: 0, max: 4, step: 0.01, default: 1 },
    { key: 'twist', label: 'ねじれ', type: 'number', min: -2, max: 2, step: 0.01, default: 0.4 },
    { key: 'sides', label: '断面の角数', type: 'number', min: 3, max: 12, step: 1, default: 6 },
  ],
  notes: '3Dデモ映像を一度テクスチャへ描画し、対数半径による多角形の入れ子へ反復配置する。前進すると同じ映像が次の奥行き層から繰り返し現れる。速度0で映像とトンネルが停止する。既存のsource形式を維持するため任意入力ではなく内蔵デモ映像を使う。',
  extraDecl: 'uniform sampler2D tScene; uniform float uTravel;',
  extra(ctx) {
    const scene = demoScene.create(ctx);
    const target = createTarget(ctx.width,ctx.height);
    const uniforms={tScene:{value:target.texture},uTravel:{value:0}};
    return {
      uniforms,
      update(frame: FrameInfo,params: ParamValues) {
        uniforms.uTravel.value += Math.max(0,frame.dt)*Number(params.speed ?? 1)*.35;
        scene.render(target,{speed:Number(params.speed ?? 1),exposure:1.1},frame);
      },
      resize(w:number,h:number){target.setSize(w,h);scene.resize?.(w,h);},
      dispose(){scene.dispose();target.dispose();},
    };
  },
  body: /* glsl */ `
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * vec2(uResolution.x / uResolution.y, 1.0);
  float a = atan(p.y, p.x);
  float seg = 6.28318 / floor(uSides);
  float r = length(p) * cos(mod(a, seg) - seg * 0.5);
  float travel = uTravel;
  float depth = -log2(max(r, .0001)) + travel;
  float layer = floor(depth);
  float twist = layer*uTwist*.15;
  mat2 rotation = mat2(cos(twist),-sin(twist),sin(twist),cos(twist));
  vec2 uv = .5 + (rotation*p)*exp2(layer-travel)*.5;
  vec3 col = texture2D(tScene,clamp(uv,vec2(0.),vec2(1.))).rgb;
  float rim = smoothstep(.94,1.,fract(depth));
  col *= (1.-rim*.5)*smoothstep(.001,.015,r);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
