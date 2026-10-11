import type { ActionDef, EffectContext, EffectStatus, ParamDef, ParamValues, SourceEffect } from '../../engine/types';
import { Draw2D } from './draw2d';
import { makeRng } from './random';

export interface MotionEnv {
  rng: () => number;
  quality: 'high' | 'low';
  /** 現在の表示範囲の半分（ワールド単位） */
  bounds(): { w: number; h: number };
}

export interface MotionSim {
  /** dt は速度倍率を掛けた後の秒（最大 1/60 秒ずつ渡される） */
  step(dt: number, params: ParamValues): void;
  draw(g: Draw2D, params: ParamValues): void;
  /** ワールド座標のポインタ（クリックで目標を置く等） */
  pointer?(x: number, y: number, down: boolean, params: ParamValues): void;
  action?(key: string, params: ParamValues): Partial<ParamValues> | void;
  status?(params: ParamValues): string | null;
}

export interface MotionDemoDef {
  id: string;
  status?: EffectStatus;
  params: ParamDef[];
  notes: string;
  create(env: MotionEnv, params: ParamValues): MotionSim;
  /** これらのパラメーターが変わったら初期化し直す（数を変えた時など） */
  resetKeys?: string[];
  extraActions?: ActionDef[];
  background?: number;
}

export const COMMON_MOTION_PARAMS: ParamDef[] = [
  { key: 'timeScale', label: '速度（時間倍率）', type: 'number', min: 0, max: 3, step: 0.01, default: 1 },
  { key: 'showTrails', label: '軌跡を表示', type: 'bool', default: true },
];

/**
 * MOTION の実験場。上から見た2D平面で、アルゴリズム固有の動き・軌跡・ベクトルを描く。
 * 一時停止はビューア側の再生／停止で dt=0 になる。
 */
export function defineMotionDemo(def: MotionDemoDef): SourceEffect {
  const actions: ActionDef[] = [...(def.extraActions ?? []), { key: 'reset', label: '⟲ 動作を初期化' }];
  return {
    id: def.id,
    kind: 'source',
    status: def.status ?? 'implemented',
    params: [...def.params, ...COMMON_MOTION_PARAMS],
    notes: def.notes,
    actions,
    interaction: 'pointer',
    create(ctx: EffectContext) {
      const g = new Draw2D(def.background);
      let seed = 1;
      let sim: MotionSim | null = null;
      let resetKey = '';
      let lastParams: ParamValues = {};
      const env: MotionEnv = {
        rng: makeRng(seed),
        quality: ctx.quality,
        bounds: () => ({ w: g.halfW, h: g.halfH }),
      };
      const init = (p: ParamValues) => {
        env.rng = makeRng(seed++);
        g.begin(ctx.width / ctx.height);
        sim = def.create(env, p);
      };
      return {
        render(target, p, frame) {
          lastParams = p;
          const k = JSON.stringify((def.resetKeys ?? []).map((name) => p[name]));
          if (!sim || k !== resetKey) {
            resetKey = k;
            init(p);
          }
          g.begin(ctx.width / ctx.height);
          let remaining = frame.dt * Number(p.timeScale ?? 1);
          // 大きな dt を細かく分けて、フレームレートに依存しにくくする
          let guard = 0;
          while (remaining > 1e-6 && guard++ < 8) {
            const step = Math.min(remaining, 1 / 60);
            sim!.step(step, p);
            remaining -= step;
          }
          sim!.draw(g, p);
          g.render(ctx.renderer, target);
        },
        pointer(x, y, down) {
          const [wx, wy] = g.toWorld(x, y);
          sim?.pointer?.(wx, wy, down, lastParams);
        },
        wheel(d) {
          g.zoom = Math.min(4, Math.max(0.25, g.zoom * Math.exp(d * 0.0015)));
        },
        action(key, p) {
          if (key === 'reset') {
            init(p);
            return;
          }
          return sim?.action?.(key, p);
        },
        status: () => sim?.status?.(lastParams) ?? null,
        exportUnavailableReason: () => 'MOTIONは時間に沿った運動のデモなので、形状としての書き出しは対象外です（パラメーターはJSONで書き出せます）。',
        dispose() {
          g.dispose();
          sim = null;
        },
      };
    },
  };
}
