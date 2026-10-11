# 調査と保護対象

調査元: `3e0df3854ae0192a8d443357dd61efd75dd57d0f`。基本200種類は001〜200、追加16種類は201〜216。初期状態は基本115実装済み / 2実験中 / 83未実装、追加16件はすべて実装済み。

## 構成

- Vite 7.3.7 / TypeScript 5.9.3 / Three.js 0.186.1。依存はpackage-lock.jsonで固定。CIはNode 22、今回の環境はNode 24.19.0。
- `src/data/catalog.ts` のROWSとEXT_ROWSが名称・説明・技術・順序を定義し、categories.tsが22カテゴリを定義する。CATALOGは基本200＋追加16。
- `src/effects/registry.ts` の登録情報と各モジュールのstatusが実装状態を定める。未登録はplanned。`import.meta.glob`で個別に遅延読み込みする。
- post/source各モジュールはPostEffect/SourceEffectを実装。shaderEffect.tsはパラメータuniformを生成し、追加リソースのupdate/beforeRender/afterRender/resize/disposeを呼ぶ。
- pipeline.tsはソース1つとpost複数をピンポン処理。失敗段を停止しShaderErrorTrapでコンパイル失敗を捕捉する。
- fullscreen.tsがRenderTargetとFullscreenQuadを生成。history.tsは縮小履歴アトラス、feedback.tsは前回出力のコピーを管理する。
- previewManager.tsは画面内カードを共有WebGLレンダラーで描画し、Canvas2Dへ転写。非表示カードを破棄する。
- viewer.tsは詳細表示用レンダラー・動的解像度・パラメータ・組み合わせ・移植コード・お気に入りを管理。閉じるとGPUリソースとコンテキストを解放する。
- storage.ts/configIO.tsはlocalStorageとJSON入出力。selfTest.tsは全登録モジュールを生成→8フレーム描画→破棄する。既存Vitestはカタログ、登録、JSON、移植コードを検査する。
- vite.config.tsのbaseは`./`。GitHub Actionsはtest→build、mainでのみPagesへ公開する。

## 保護

`tests/fixtures/extensions-protection.json` は変更前に生成したSHA-256スナップショット。201〜216の16モジュール、カタログ全体、カテゴリ全体、追加16件の登録行を記録した。`tests/extensions-protection.test.ts` は順序・件数・ファイル完全一致・登録内容を検証する。パラメータとShaderもモジュール全体のハッシュで保護する。

共通エンジン、UI、カタログ、カテゴリ、追加16モジュールには今回変更を加えていない。登録表の変更は基本200件の行のみ。初期状態との実行比較は、同じブラウザ・品質・入力で行い、Three.jsが所有する初回3D描画時の共有テクスチャは既存セルフテスト同様にデモシーンで予熱してから測定する。

## 開発・検証

```sh
cd /workspace/visual-effect-library
NPM_CONFIG_CACHE=/tmp/visual-effect-library-npm-cache npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run dev -- --host 127.0.0.1
# 別ターミナル。PlaywrightはQA用に外部で利用し、アプリ依存には追加しない。
QA_BASE_URL=http://127.0.0.1:5173 \
PLAYWRIGHT_MODULE_PATH=/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs \
node scripts/glitch-browser-qa.mjs
```

ポートが使用中ならViteが表示したポートをQA_BASE_URLへ設定する。成果物は既定で`/tmp/visual-effect-library-qa/`。この環境のChromiumはSwiftShaderでWebGL2を提供するため、実GPU性能・Windows Chrome・iPad Safariの検証結果とは区別する。
