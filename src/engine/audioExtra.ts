import * as THREE from 'three';
import { AudioLink, type AudioInput } from './audio';
import type { FrameInfo, ParamDef, ParamValues } from './types';

/** 音響演出に共通のパラメータ */
export const AUDIO_PARAMS: ParamDef[] = [
  {
    key: 'input',
    label: '音の入力',
    type: 'select',
    options: [
      { value: 'synth', label: '内蔵シンセ（自動演奏）' },
      { value: 'mic', label: 'マイク' },
    ],
    default: 'synth',
  },
  { key: 'volume', label: 'シンセの音量', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: 'sensitivity', label: '感度', type: 'number', min: 0.2, max: 4, step: 0.01, default: 1.2 },
];

/** GLSL 側の宣言（tAudio: 行0=スペクトラム, 行1=波形） */
export const GLSL_AUDIO = /* glsl */ `
uniform sampler2D tAudio;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLevel;
uniform float uBeat;
float spectrum(float x) { return texture2D(tAudio, vec2(x, 0.25)).r; }
float waveform(float x) { return texture2D(tAudio, vec2(x, 0.75)).r * 2.0 - 1.0; }
`;

/** defineShaderPost / defineShaderSource の extra として使う音声接続 */
export function audioExtra() {
  return () => {
    const link = new AudioLink();
    let params: ParamValues = {};
    const uniforms: Record<string, THREE.IUniform> = {
      tAudio: { value: link.texture },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uLevel: { value: 0 },
      uBeat: { value: 0 },
    };
    return {
      uniforms,
      update(frame: FrameInfo, p: ParamValues) {
        params = p;
        link.update(frame.time);
        link.hub.setVolume(Number(p.volume ?? 0.4));
        const s = Number(p.sensitivity ?? 1);
        uniforms.uBass.value = Math.min(1.5, link.hub.bass * s);
        uniforms.uMid.value = Math.min(1.5, link.hub.mid * s);
        uniforms.uTreble.value = Math.min(1.5, link.hub.treble * s);
        uniforms.uLevel.value = Math.min(1.5, link.hub.level * s * 3);
        uniforms.uBeat.value = link.hub.beat;
      },
      pointer(_x: number, _y: number, down: boolean) {
        if (down) link.startFromGesture((params.input as AudioInput) ?? 'synth');
      },
      status: () => link.status((params.input as AudioInput) ?? 'synth'),
      dispose: () => link.dispose(),
    };
  };
}
