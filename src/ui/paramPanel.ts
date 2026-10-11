import type { ParamDef, ParamValues } from '../engine/types';
import { h } from './dom';

function formatNumber(v: number, step?: number): string {
  if (!step || step >= 1) return String(Math.round(v * 100) / 100);
  const decimals = Math.min(5, Math.max(0, Math.ceil(-Math.log10(step))));
  return v.toFixed(decimals);
}

/** パラメータ定義からリアルタイム調整UIを生成する。値は params オブジェクトを直接書き換える */
export function buildParamControls(defs: ParamDef[], params: ParamValues, onChange?: () => void): HTMLElement {
  const root = h('div', { class: 'params' });
  if (!defs.length) {
    root.append(h('p', { class: 'muted small', text: '調整可能なパラメータはありません' }));
    return root;
  }
  for (const def of defs) {
    const id = `p-${Math.random().toString(36).slice(2, 9)}`;
    const row = h('div', { class: `param param-${def.type}` });
    const label = h('label', { for: id, text: def.label });
    row.append(label);
    switch (def.type) {
      case 'number': {
        const value = h('output', { class: 'param-value', for: id });
        const input = h('input', {
          id,
          type: 'range',
          min: def.min,
          max: def.max,
          step: def.step ?? (def.max - def.min) / 100,
        });
        input.value = String(params[def.key] ?? def.default);
        value.textContent = formatNumber(Number(input.value), def.step);
        input.addEventListener('input', () => {
          params[def.key] = Number(input.value);
          value.textContent = formatNumber(Number(input.value), def.step);
          onChange?.();
        });
        label.append(value);
        row.append(input);
        break;
      }
      case 'color': {
        const input = h('input', { id, type: 'color' });
        input.value = String(params[def.key] ?? def.default);
        input.addEventListener('input', () => {
          params[def.key] = input.value;
          onChange?.();
        });
        row.append(input);
        break;
      }
      case 'bool': {
        const input = h('input', { id, type: 'checkbox' });
        input.checked = Boolean(params[def.key] ?? def.default);
        input.addEventListener('change', () => {
          params[def.key] = input.checked;
          onChange?.();
        });
        row.append(input);
        break;
      }
      case 'select': {
        const input = h('select', { id });
        for (const o of def.options) input.append(h('option', { value: o.value, text: o.label }));
        input.value = String(params[def.key] ?? def.default);
        input.addEventListener('change', () => {
          params[def.key] = input.value;
          onChange?.();
        });
        row.append(input);
        break;
      }
    }
    root.append(row);
  }
  return root;
}

/** パラメータをランダム化（ランダム組み合わせ用） */
export function randomizeParams(defs: ParamDef[], params: ParamValues): void {
  for (const d of defs) {
    switch (d.type) {
      case 'number': {
        // 極端な値を避けるため中央寄りに分布させる
        const t = (Math.random() + Math.random()) / 2;
        const v = d.min + (d.max - d.min) * t;
        params[d.key] = d.step ? Math.round(v / d.step) * d.step : v;
        break;
      }
      case 'color':
        params[d.key] =
          '#' +
          Math.floor(Math.random() * 0xffffff)
            .toString(16)
            .padStart(6, '0');
        break;
      case 'bool':
        params[d.key] = Math.random() < 0.5;
        break;
      case 'select':
        params[d.key] = d.options[Math.floor(Math.random() * d.options.length)].value;
        break;
    }
  }
}
