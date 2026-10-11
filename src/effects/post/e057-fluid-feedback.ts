import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { FluidSim } from '../../engine/fluid';
import type { PostEffect } from '../../engine/types';

const INJECT = /* glsl */ `
uniform sampler2D tState;
uniform sampler2D tInput;
uniform float uRefresh;
varying vec2 vUv;
void main() {
  vec3 dye = texture2D(tState, vUv).rgb;
  vec3 img = texture2D(tInput, vUv).rgb;
  gl_FragColor = vec4(mix(dye, img, uRefresh), 1.0);
}
`;

const effect: PostEffect = {
  id: '057',
  kind: 'post',
  status: 'implemented',
  params: [
    { key: 'refresh', label: '元映像の再注入', type: 'number', min: 0, max: 0.3, step: 0.002, default: 0.04 },
    { key: 'turbulence', label: '乱流の強さ', type: 'number', min: 0, max: 3000, step: 10, default: 900 },
    { key: 'curl', label: '渦の強さ', type: 'number', min: 0, max: 60, step: 0.5, default: 35 },
    { key: 'blend', label: '流体映像の割合', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  notes:
    '入力映像そのものを流体の「染料」として流す。毎フレーム少しずつ元映像を再注入するので、形を保ちつつ絵の具のように渦を巻いて溶けていく。ランダムな位置に力を加えて乱流を維持し、ドラッグでもかき混ぜられる。',
  create(ctx) {
    const hi = ctx.quality === 'high';
    const aspect = ctx.width / ctx.height;
    const simH = hi ? 160 : 96;
    const dyeH = Math.min(ctx.height, hi ? 720 : 400);
    const sim = new FluidSim(ctx.renderer, Math.round(simH * aspect), simH, Math.round(dyeH * aspect), dyeH);
    const quad = new FullscreenQuad();
    const inject = makeShader(INJECT, { tState: { value: null }, tInput: { value: null }, uRefresh: { value: 0.05 } });
    const mixMat = makeShader(
      /* glsl */ `
      uniform sampler2D tDiffuse; uniform sampler2D tFluid; uniform float uBlend; varying vec2 vUv;
      void main() { gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, texture2D(tFluid, vUv).rgb, uBlend), 1.0); }`,
      { tDiffuse: { value: null }, tFluid: { value: null }, uBlend: { value: 1 } },
    );
    const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false };
    let first = true;
    return {
      render(input, target, params, frame) {
        const dt = Math.min(frame.dt, 1 / 30);
        inject.uniforms.tInput.value = input;
        inject.uniforms.uRefresh.value = first ? 1 : Number(params.refresh);
        first = false;
        sim.drawDye(inject);
        const turb = Number(params.turbulence);
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          sim.splat(Math.random(), Math.random(), Math.cos(a) * turb, Math.sin(a) * turb, null, 0.004);
        }
        if (pointer.down) sim.splat(pointer.x, pointer.y, (pointer.x - pointer.px) * 6000, (pointer.y - pointer.py) * 6000, null, 0.002);
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        sim.step(dt, { curl: Number(params.curl), dyeDissipation: 0, velocityDissipation: 0.6, pressureIterations: hi ? 16 : 10 });
        mixMat.uniforms.tDiffuse.value = input;
        mixMat.uniforms.tFluid.value = sim.dye.read.texture;
        mixMat.uniforms.uBlend.value = Number(params.blend);
        quad.render(ctx.renderer, mixMat, target);
      },
      pointer(x, y, down) {
        if (down && !pointer.down) {
          pointer.px = x;
          pointer.py = y;
        }
        pointer.x = x;
        pointer.y = y;
        pointer.down = down;
      },
      dispose() {
        sim.dispose();
        inject.dispose();
        mixMat.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
