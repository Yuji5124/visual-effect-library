import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HISTORY, HistoryAtlas } from '../../engine/history';

export default defineShaderPost({
  id: '015', status: 'implemented',
  params: [
    { key: 'frames', label: '録画フレーム数', type: 'number', min: 4, max: 31, step: 1, default: 24 },
    { key: 'speed', label: '逆再生速度', type: 'number', min: 0, max: 3, step: .05, default: 1 },
    { key: 'smooth', label: '逆再生の補間', type: 'bool', default: true },
  ],
  notes: '30Hzで入力映像を録画し、履歴を書き換えず最新から最古へ逆順再生する。逆再生完了後は新しい入力の録画へ戻る。録画中は現在の入力を表示。速度0は録画・逆再生とも停止する。録画可能な時間は有限で、無限の過去へ巻き戻す方式ではない。',
  extraDecl: GLSL_HISTORY+'\nuniform float uReverseAge; uniform float uRecording;',
  extra(ctx) {
    const atlas = new HistoryAtlas(ctx.width,ctx.height,{frames:32,scale:ctx.quality==='low'?.375:.5});
    const uniforms = {...atlas.uniforms,uReverseAge:{value:0},uRecording:{value:1}};
    let recording=true, elapsed=0, age=0, count=0, wanted=24, speed=1, dt=0;
    return {
      uniforms,
      update(frame,params) {
        dt=Math.max(0,Math.min(.1,frame.dt)); speed=Number(params.speed ?? 1);
        wanted=Math.max(4,Math.min(31,Math.floor(Number(params.frames ?? 24))));
      },
      beforeRender(input) {
        if (!input) return;
        if (recording) {
          elapsed += dt*speed;
          if (count===0 || elapsed>=1/30) {
            atlas.push(ctx.renderer,input);count++;elapsed%=1/30;
            if(count>=wanted){recording=false;age=0;}
          }
        } else {
          age += dt*30*speed;
          if(age>count-1) { recording=true;count=0;age=0;elapsed=0; }
        }
        uniforms.uRecording.value=recording && speed>0 ? 1 : 0;
        uniforms.uReverseAge.value=Math.min(age,Math.max(0,count-1));
      },
      resize(w,h){atlas.resize(w,h);recording=true;elapsed=0;age=0;count=0;},
      dispose(){atlas.dispose();},
    };
  },
  body: /* glsl */ `
void main() {
  if (uRecording>.5) { gl_FragColor=vec4(texture2D(tDiffuse,vUv).rgb,1.);return; }
  vec3 color=historyAt(vUv,uReverseAge);
  if(uSmooth>.5)color=mix(color,historyAt(vUv,uReverseAge+1.),fract(uReverseAge));
  gl_FragColor=vec4(color,1.);
}`,
});
