import * as THREE from 'three';

export type AudioInput = 'synth' | 'mic';

const FFT = 1024;
const BINS = FFT / 2;

/**
 * 音響反応演出で共有するオーディオ解析ハブ（ページに1つ）。
 * - 入力は「内蔵シンセ（外部音源ファイル不要の自動演奏）」または「マイク」
 * - ブラウザの自動再生制限のため、開始はユーザー操作（タップ/クリック）の中で行う
 * - 利用中の演出が0になると演奏を止め、AudioContext を停止する
 */
class AudioHub {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private input: AudioNode | null = null;
  private mic: MediaStream | null = null;
  private timer = 0;
  private nextNote = 0;
  private step = 0;
  private users = 0;
  mode: AudioInput | null = null;
  error: string | null = null;

  readonly waveform = new Uint8Array(FFT);
  readonly spectrum = new Uint8Array(BINS);
  /** 0..1 の帯域エネルギー */
  bass = 0;
  mid = 0;
  treble = 0;
  level = 0;
  /** ビート検出（立ち上がりで1、以後減衰） */
  beat = 0;
  private energyAvg = 0;
  private lastUpdate = -1;

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.input;
  }

  acquire(): void {
    this.users++;
  }

  release(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0) this.stop();
  }

  setVolume(v: number): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** ユーザー操作のイベントハンドラ内から呼ぶこと */
  async start(mode: AudioInput): Promise<void> {
    if (this.running && this.mode === mode) return;
    this.stopInput();
    this.error = null;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = FFT;
        this.analyser.smoothingTimeConstant = 0.75;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      await this.ctx.resume();
      if (mode === 'mic') {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
        const src = this.ctx.createMediaStreamSource(this.mic);
        src.connect(this.analyser!); // マイクはスピーカーへ出さない（ハウリング防止）
        this.input = src;
      } else {
        const bus = this.ctx.createGain();
        bus.connect(this.analyser!);
        bus.connect(this.master!);
        this.input = bus;
        this.nextNote = this.ctx.currentTime + 0.05;
        this.step = 0;
        this.timer = window.setInterval(() => this.schedule(), 25);
      }
      this.mode = mode;
    } catch (e) {
      this.error = mode === 'mic' ? 'マイクを使用できません（許可が必要です）' : '音声を開始できません';
      console.warn('[VFX] audio', e);
      this.stopInput();
    }
  }

  private stopInput(): void {
    clearInterval(this.timer);
    this.timer = 0;
    this.input?.disconnect();
    this.input = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.mode = null;
  }

  stop(): void {
    this.stopInput();
    void this.ctx?.suspend().catch(() => {});
    this.waveform.fill(128);
    this.spectrum.fill(0);
    this.bass = this.mid = this.treble = this.level = this.beat = 0;
  }

  /** 1フレームに1回だけ解析を更新する（複数の演出から呼ばれても良い） */
  update(frameTime: number): void {
    if (frameTime === this.lastUpdate) return;
    this.lastUpdate = frameTime;
    if (!this.running || !this.analyser) {
      this.waveform.fill(128);
      this.spectrum.fill(0);
      this.beat *= 0.9;
      return;
    }
    this.analyser.getByteTimeDomainData(this.waveform);
    this.analyser.getByteFrequencyData(this.spectrum);
    const band = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += this.spectrum[i];
      return s / ((b - a) * 255);
    };
    this.bass = band(1, 8);
    this.mid = band(8, 64);
    this.treble = band(64, 256);
    let rms = 0;
    for (let i = 0; i < FFT; i++) {
      const v = (this.waveform[i] - 128) / 128;
      rms += v * v;
    }
    this.level = Math.sqrt(rms / FFT);
    const e = this.bass;
    this.beat *= 0.88;
    if (e > this.energyAvg * 1.35 && e > 0.25) this.beat = 1;
    this.energyAvg = this.energyAvg * 0.92 + e * 0.08;
  }

  // ---------------- 内蔵シンセ（自動作曲ループ） ----------------
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.input) return;
    const spb = 60 / 118 / 4; // 16分音符
    while (this.nextNote < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNote);
      this.nextNote += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number): void {
    const s = step % 16;
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.noise(t, 0.18, 0.35, 1800);
    if (s % 2 === 1) this.noise(t, 0.04, 0.08, 7000);
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const bar = Math.floor(step / 16);
    const roots = [45, 41, 43, 38];
    const root = roots[bar % 4];
    if (s % 4 === 2 || s === 0) this.tone(t, root - 12, 'sawtooth', 0.22, 0.18, 600);
    const pattern = [0, 2, 4, 5, 4, 2, 6, 4];
    if (s % 2 === 0) {
      const n = root + 12 + scale[pattern[(step / 2) % pattern.length | 0]];
      this.tone(t, n, 'triangle', 0.16, 0.09, 3000);
    }
  }

  private tone(t: number, midi: number, type: OscillatorType, dur: number, gain: number, cutoff: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.input!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.input!);
    o.start(t);
    o.stop(t + 0.32);
  }

  private noiseBuf: AudioBuffer | null = null;
  private noise(t: number, dur: number, gain: number, hp: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.input!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const audioHub = new AudioHub();

/**
 * 音響演出1インスタンス分の接続。スペクトラム(行0)と波形(行1)を 512×2 のテクスチャで提供する。
 */
export class AudioLink {
  readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(BINS * 2 * 4);

  constructor() {
    audioHub.acquire();
    this.texture = new THREE.DataTexture(this.data, BINS, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  get hub(): AudioHub {
    return audioHub;
  }

  update(time: number): void {
    audioHub.update(time);
    const d = this.data;
    for (let i = 0; i < BINS; i++) {
      const s = audioHub.spectrum[i];
      const w = audioHub.waveform[i * 2];
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = s;
      d[i * 4 + 3] = 255;
      const o = (BINS + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = w;
      d[o + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  /** ポインタ操作（ユーザー操作）で音声を開始する */
  startFromGesture(input: AudioInput): void {
    void audioHub.start(input);
  }

  status(input: AudioInput): string | null {
    if (audioHub.error) return audioHub.error;
    if (!audioHub.running) {
      return input === 'mic' ? '画面をタップ／クリックするとマイク入力を開始します' : '画面をタップ／クリックすると内蔵シンセが鳴り始めます（音が出ます）';
    }
    return null;
  }

  dispose(): void {
    this.texture.dispose();
    audioHub.release();
  }
}
