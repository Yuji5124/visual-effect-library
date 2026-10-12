import './styles/main.css';
import { BASE_CATALOG, EXTENSION_CATALOG } from './data/catalog';
import { availability } from './effects/registry';
import { LIBRARY, MAIN_CATEGORIES, libraryStats } from './data/library';
import { CatalogView } from './ui/catalogView';
import { PreviewManager } from './ui/previewManager';
import { Viewer } from './ui/viewer';
import { h, toast } from './ui/dom';
import { getPreviewsEnabled, getQuality, setPreviewsEnabled, setQuality } from './ui/storage';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const app = document.getElementById('app')!;

if (!webglAvailable()) {
  app.append(
    h('div', { class: 'fatal' }, h('h1', { text: 'WebGL2が利用できません' }), h('p', { text: 'Chrome / Edge / Safari の最新版でアクセスしてください。カタログ閲覧のみ行う場合も WebGL2 が必要です。' })),
  );
} else {
  boot();
}

function boot(): void {
  let quality = getQuality();
  const previews = new PreviewManager(quality);
  const navigate = (id: string) => {
    location.hash = `#/fx/${id}`;
  };
  const viewer = new Viewer(
    quality,
    () => {
      location.hash = '#/';
    },
    navigate,
  );
  const catalog = new CatalogView(previews, navigate);

  const stats = libraryStats();
  const perMain = MAIN_CATEGORIES.map((m) => `${m.label} ${LIBRARY.filter((e) => e.mainCategory === m.id).length}`).join(' / ');

  const qualityBtn = h('button', { class: 'tool-btn', title: '描画品質（iPadでは「軽量」推奨）' });
  const renderQuality = () => (qualityBtn.textContent = quality === 'high' ? '品質: 高' : '品質: 軽量');
  renderQuality();
  qualityBtn.addEventListener('click', () => {
    quality = quality === 'high' ? 'low' : 'high';
    setQuality(quality);
    toast('品質設定を変更しました。再読み込みで反映します');
    renderQuality();
    setTimeout(() => location.reload(), 600);
  });

  let previewsOn = getPreviewsEnabled();
  const previewBtn = h('button', { class: 'tool-btn', title: 'カードのライブプレビューを再生／停止' });
  const renderPreviewBtn = () => (previewBtn.textContent = previewsOn ? 'プレビュー: ON' : 'プレビュー: OFF');
  renderPreviewBtn();
  previews.setEnabled(previewsOn);
  previewBtn.addEventListener('click', () => {
    previewsOn = !previewsOn;
    setPreviewsEnabled(previewsOn);
    previews.setEnabled(previewsOn);
    renderPreviewBtn();
  });

  const header = h(
    'header',
    { class: 'app-header' },
    h(
      'div',
      { class: 'brand' },
      h('h1', {}, 'VISUAL EFFECT LIBRARY ', h('span', { class: 'accent', text: String(stats.total) })),
      h('p', {
        class: 'stats',
        text: `${perMain}（VISUAL＝基本${BASE_CATALOG.length}＋拡張${EXTENSION_CATALOG.length}） · 実装済み ${stats.implemented} · 実験中 ${stats.experimental} · 未実装 ${stats.planned}`,
      }),
    ),
    h(
      'div',
      { class: 'header-actions' },
      h('button', {
        class: 'tool-btn primary',
        text: '🎲 ランダム再生',
        onclick: () => {
          const list = LIBRARY.filter((e) => availability(e.id) !== 'planned');
          navigate(list[Math.floor(Math.random() * list.length)].id);
          viewer.startAutoplay();
        },
      }),
      previewBtn,
      qualityBtn,
      h('a', { class: 'tool-btn', href: '#/selftest', text: 'セルフテスト' }),
    ),
  );
  const footer = h(
    'footer',
    { class: 'app-footer' },
    h('p', {
      text: '全項目は Three.js（MIT License）上の独自実装です。クリックで全画面・パラメータ調整・組み合わせ・JSON／GLB書き出し・移植コード表示。参考資料のコードは複製していません。',
    }),
  );
  app.append(header, catalog.root, footer);

  const route = () => {
    const hash = location.hash;
    const fx = hash.match(/^#\/fx\/([A-Z]{3}-\d{3}|\d{3})/);
    const selftest = hash.startsWith('#/selftest');
    if (fx) {
      previews.setPaused(true);
      if (!viewer.opened || viewer.currentId !== fx[1]) void viewer.open(fx[1]);
    } else {
      if (viewer.opened) viewer.close();
      previews.setPaused(selftest);
    }
    document.body.classList.toggle('selftest-open', selftest);
    if (selftest && !document.getElementById('selftest')) {
      const box = h('div', { id: 'selftest', class: 'selftest-page' }, h('a', { href: '#/', class: 'tool-btn', text: '← 一覧' }));
      document.body.append(box);
      void import('./ui/selfTest').then((m) => m.runSelfTest(box));
    } else if (!selftest) {
      document.getElementById('selftest')?.remove();
    }
  };
  window.addEventListener('hashchange', route);
  route();
  previews.start();
}
