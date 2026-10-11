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

### Phase 1 基盤（完了）
- `src/data/library/`：共通型 `LibraryEntry`、4分野＋サブカテゴリ（VISUAL は既存22カテゴリをそのまま `vfx-01`〜`vfx-22`、新規 GEO-A〜E / MOT-A〜E / WRD-A〜E）、既存216件のアダプター（`legacy` に元の CatalogEntry を保持・不変）、`LIBRARY`・`getLibraryEntry`・`matchesQuery`・`libraryStats`。
- `src/lab/registry.ts`（生成）＋ `src/effects/registry.ts` の `ALL_REGISTRY`（既存の `REGISTRY` 配列は不変、後ろに合成）。`scripts/gen-registry.mjs` が `src/lab/{geometry,motion,world}/` を走査。
- 実験場フレームワーク `src/lab/framework/`：`sceneLab.ts`（GEOMETRY/WORLD：軌道カメラ、パラメーター変更時だけ再生成して旧生成物を解放、生成前後の比較、ワイヤーフレーム、シード、操作ボタン、GLB書き出し）、`motionLab.ts`＋`draw2d.ts`（MOTION：2D即時描画・軌跡・クリックで目標変更・初期化）、`worldKit.ts`、`random.ts`、`orbit.ts`、`stage.ts`。
- UI：一覧に ALL / VISUAL EFFECT / GEOMETRY / MOTION / WORLD GENERATION のタブ、サブカテゴリ、状況・技術・お気に入り・検索（ID・日英名・原理・タグ）。カードにサブカテゴリと状況。
- ビューア：`GEO-001` 形式のルート、操作ボタン（再生成・同じシードで再生成・視点リセット等）、ホイール／ピンチズーム、再生／停止（Space）、GLB書き出し（GLTFExporter、書き出せない場合は理由を表示）、解説タブに原理・実装・参考資料（ライセンス）・関連技術リンク・負荷・モバイル対応。閉じて開き直す際の canvas 差し替え（Codex の修正）はそのまま維持。
- セルフテストは `ALL_REGISTRY` 全件を対象にし、操作ボタンも押して例外を検出。`#/selftest?only=GEO` で絞り込み可。
- ブラウザ検査 `scripts/lab-qa.mjs`（開く→操作ボタン→比較/ワイヤー→ドラッグ/ズーム→閉じて再度開く→スクリーンショット→セルフテスト）。

### Phase 2 150件の登録（完了）
- `src/data/library/geometry.ts` / `motion.ts` / `world.ts` に各50件。各件に原理・実装方法・参考資料（URL・ライセンス）・パラメーター・タグ・関連ID・負荷・モバイル対応。
- 参考資料URLの到達確認 `npx vite-node scripts/check-references.ts` → `docs/reference-check.json`。初回 239/243 到達。到達できなかった4件（誤ったDOI 1件、存在しないWikipedia記事 1件、503 のPDF 1件、ボット拒否 1件）は到達できる資料へ差し替え、確認できない出典に基づく記述は削除した。**到達確認はHTTP応答の確認であり、全文を読んだことの証明ではない。** ライセンス欄は各資料の公開条件（Wikipedia＝CC BY-SA、GitHub リポジトリ＝そのライセンス、論文＝「—（論文）」）で、コードはどこからも複製していない。
- テスト `tests/library.test.ts`：366件・ID重複なし・分野別件数・サブカテゴリ各10件・既存216件の順序と内容の不変・必須メタデータ・関連IDの実在・登録表との整合・検索／絞り込み。

### Phase 3〜5 デモ実装（進行中）
- 手本として GEO-022（ツイスト）、MOT-003（ばね）、WRD-001（fBm地形）を実装し、ブラウザ検査（操作・再オープン・リーク0）を通過。
- 残りは分担して実装中（GEO 001–021/023–050、MOT 001–002/004–050、WRD 002–050）。
