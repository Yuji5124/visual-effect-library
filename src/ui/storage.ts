import type { Quality } from '../engine/types';

/** localStorage はプライベートモード等で例外を投げることがあるため、必ずガードして使う */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できない環境では無視 */
  }
}

const FAV_KEY = 'vfx200.favorites';
const QUALITY_KEY = 'vfx200.quality';
const PRESET_KEY = 'vfx200.presets';
const PREVIEW_KEY = 'vfx200.previews';

let favorites = new Set<string>(read<string[]>(FAV_KEY, []));
const listeners = new Set<() => void>();

export const favoritesStore = {
  has: (id: string) => favorites.has(id),
  all: () => [...favorites],
  toggle(id: string) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    write(FAV_KEY, [...favorites]);
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reload() {
    favorites = new Set(read<string[]>(FAV_KEY, []));
  },
};

/** iPad / iPhone / Android 等のモバイルGPUかどうか（iPadOSはMacを名乗るのでタッチ点数で判定） */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iPadOS || /iPad|iPhone|iPod|Android/.test(ua);
}

export function getQuality(): Quality {
  return read<Quality | null>(QUALITY_KEY, null) ?? (isMobileDevice() ? 'low' : 'high');
}

export function setQuality(q: Quality): void {
  write(QUALITY_KEY, q);
}

export function getPreviewsEnabled(): boolean {
  return read<boolean>(PREVIEW_KEY, true);
}

export function setPreviewsEnabled(v: boolean): void {
  write(PREVIEW_KEY, v);
}

export interface SavedPreset {
  name: string;
  savedAt: string;
  config: StackConfig;
}

export interface StackConfig {
  format: 'vfx200-stack';
  version: 1;
  source: { id: string; params: Record<string, number | string | boolean> };
  posts: { id: string; enabled: boolean; params: Record<string, number | string | boolean> }[];
}

export const presetStore = {
  all: () => read<SavedPreset[]>(PRESET_KEY, []),
  save(name: string, config: StackConfig) {
    const list = presetStore.all().filter((p) => p.name !== name);
    list.unshift({ name, savedAt: new Date().toISOString(), config });
    write(PRESET_KEY, list.slice(0, 50));
  },
  remove(name: string) {
    write(
      PRESET_KEY,
      presetStore.all().filter((p) => p.name !== name),
    );
  },
};
