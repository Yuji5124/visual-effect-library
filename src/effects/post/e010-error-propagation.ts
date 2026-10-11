import * as THREE from 'three';
import { defineShaderPost } from '../../engine/shaderEffect';
import { FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import { GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '010', status: 'implemented',
  params: [
    { key: 'amount', label: '破損強度', type: 'number', min: 0, max: 1, step: .01, default: .8 },
    { key: 'spread', label: '感染速度', type: 'number', min: 0, max: 1, step: .01, default: .8 },
    { key: 'seeds', label: '感染源密度', type: 'number', min: 0, max: .03, step: .001, default: .006 },
    { key: 'recovery', label: '回復速度', type: 'number', min: 0, max: 1, step: .01, default: .12 },
    { key: 'speed', label: 'シミュレーション速度', type: 'number', min: 0, max: 3, step: .1, default: 1 },
  ],
  notes: '縮小格子の感染状態をピンポン更新する。新しい破損の種が上下左右の近傍へ伝播し、回復と競合する。画素をチャンネル置換・座標破損する強さを感染度で制御する。速度0で状態が停止する。',
  extraDecl: 'uniform sampler2D tInfection;',
  extra(ctx) {
    let w = Math.max(1, Math.ceil(ctx.width/8)), h = Math.max(1, Math.ceil(ctx.height/8));
    let a = createTarget(w,h), b = createTarget(w,h), initialized = false, tick = 0, elapsed = 0, steps = 0;
    const quad = new FullscreenQuad();
    const uniforms = { tInfection: { value: a.texture } };
    const sim = makeShader(/* glsl */ `
      uniform sampler2D tState;
      uniform vec2 uTexel;
      uniform float uSpread, uRecovery, uSeeds, uTick, uReset;
      varying vec2 vUv;
      ${GLSL_HASH}
      void main() {
        if (uReset > .5) { gl_FragColor = vec4(0.,0.,0.,1.); return; }
        float value = texture2D(tState,vUv).r;
        float neighbor = max(max(texture2D(tState,vUv+vec2(uTexel.x,0.)).r,texture2D(tState,vUv-vec2(uTexel.x,0.)).r),max(texture2D(tState,vUv+vec2(0.,uTexel.y)).r,texture2D(tState,vUv-vec2(0.,uTexel.y)).r));
        vec2 cell = floor(vUv/uTexel);
        float chance = hash12(cell+uTick*vec2(1.73,9.31));
        float seed = chance < uSeeds ? 1. : 0.;
        float infection = chance < uSpread ? neighbor*.96 : 0.;
        gl_FragColor = vec4(max(seed,max(infection,max(0.,value-uRecovery*.08))),0.,0.,1.);
      }`, {
        tState:{value:a.texture}, uTexel:{value:new THREE.Vector2(1/w,1/h)},
        uSpread:{value:.8},uRecovery:{value:.12},uSeeds:{value:.006},uTick:{value:0},uReset:{value:1},
      });
    return {
      uniforms,
      update(frame,params) {
        elapsed += Math.max(0, Math.min(.1,frame.dt))*Number(params.speed ?? 1);
        steps = Math.min(9,Math.floor(elapsed*30)); elapsed -= steps/30;
        sim.uniforms.uSpread.value = params.spread ?? .8;
        sim.uniforms.uRecovery.value = params.recovery ?? .12;
        sim.uniforms.uSeeds.value = params.seeds ?? .006;
      },
      beforeRender() {
        if (!initialized) {
          sim.uniforms.uReset.value = 1;
          // Avoid binding the same texture as input and attachment, even on reset.
          sim.uniforms.tState.value = a.texture; quad.render(ctx.renderer,sim,b);
          [a,b] = [b,a]; initialized = true;
        }
        sim.uniforms.uReset.value = 0;
        for (let i=0;i<steps;i++) {
          sim.uniforms.tState.value = a.texture; sim.uniforms.uTick.value = tick++;
          quad.render(ctx.renderer,sim,b); [a,b] = [b,a];
        }
        uniforms.tInfection.value = a.texture;
      },
      resize(width,height) {
        w=Math.max(1,Math.ceil(width/8));h=Math.max(1,Math.ceil(height/8));
        a.setSize(w,h);b.setSize(w,h);sim.uniforms.uTexel.value.set(1/w,1/h);
        initialized=false;elapsed=0;tick=0;
      },
      dispose() { a.dispose();b.dispose();sim.dispose();quad.dispose(); },
    };
  },
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  float infection = texture2D(tInfection,vUv).r;
  vec3 original = texture2D(tDiffuse,vUv).rgb;
  vec2 cell = floor(vUv*uResolution/8.);
  vec2 shift = (vec2(hash12(cell),hash12(cell+19.))-.5)*.12*infection;
  vec3 damaged = texture2D(tDiffuse,clamp(vUv+shift,vec2(0.),vec2(1.))).brg;
  damaged = floor(damaged*5.)/5.;
  gl_FragColor = vec4(mix(original,damaged,clamp(infection*uAmount,0.,1.)),1.);
}`,
});
