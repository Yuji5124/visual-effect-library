# VISUAL EFFECT LIBRARY 366 拡張進捗

このファイルだけを読めば作業を再開できるように、各段階の終わりに更新する。既存の `docs/implementation-progress.md`（Codexの基本200種の記録）は残し、こちらは GEOMETRY / MOTION / WORLD GENERATION の150件追加を扱う。

## 開始時点（Phase 0）

- 基準: `main` = `703c2a7`（Fix viewer reopening and record protected extension regression checks）
- 作業ブランチ: `claude/gracious-hypatia-qrd9kt`（main から再作成）
- 作業ディレクトリ: `/home/user/visual-effect-library`（指示書の `/workspace` はこの環境に存在しない）
- 登録 216（基本200＋追加16）/ 実装済み 138（基本122＋追加16）/ 実験中 0 / 未実装 78
- 再実行した検証: Vitest 159件成功、型チェック成功、本番ビルド成功、ブラウザセルフテスト 138/138 成功・演出由来リーク0（Chromium + SwiftShader WebGL2）

## 保護対象と制約

- `tests/extensions-protection.test.ts` が `src/data/catalog.ts`・`src/data/categories.ts`・`src/effects/{post,source}/e2*.ts` 全体のSHA-256と、registry.ts の `id: '2xx'` 行を検査する。**これらのファイルは1バイトも変更しない。**
  → 新規150件のデータ・実装・登録は別ファイル（`src/data/library/`・`src/lab/`）に置き、統合レイヤーで既存カタログと合成する。
- 001〜216 のID・status・順序・登録内容は変更しない。直近改良の 001・002・010・013〜016 は触らない。
- ビューアの「閉じて再度開くとcanvasが失われる」不具合の修正（canvas差し替え）を維持し、新カテゴリでも開閉再開をテストする。

## 設計方針

- 共通エントリ型 `LibraryEntry`（id, nameJa, nameEn, mainCategory, subcategory, description, principle, implementation, status, referenceUrls, parameters, tags, relatedIds, performanceClass, mobileCompatibility, updatedAt）。既存216件はアダプターで変換（元データは不変）。
- メインカテゴリ: VISUAL EFFECT / GEOMETRY / MOTION / WORLD GENERATION。ID は `GEO-001`〜`GEO-050`、`MOT-001`〜、`WRD-001`〜。
- 新規デモも既存の `SourceEffect`（mount/update/resize/dispose）として実装し、パイプライン・プレビュー共有レンダラー・セルフテスト・ビューアをそのまま使う。新規の描画エンジンは導入しない。
- 共通の実験場フレームワーク（`src/lab/`）: 3Dの軌道カメラ（ドラッグ回転・ホイール/ピンチズーム）、ワイヤーフレーム切替、生成前後の比較、シード、再生成・リセット・GLB書き出しなどの「操作ボタン（actions）」、一時停止。
- ステータスは「固有アルゴリズムが動作し、操作・再描画・破棄が正常」を満たしたものだけ実装済みにする。

## 進捗ログ

（各段階の終わりに追記）
