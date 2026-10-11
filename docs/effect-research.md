# 演出の技術調査

確認日: 2026-10-11。第一カテゴリ001〜010から調査する。リンクを列挙しただけの資料は参照済みとして数えない。コード・素材の転用は行っていない。

## 実際に取得・確認した資料

| URL / 作者 | 種別・ライセンス | 読んだ内容と採否 |
| --- | --- | --- |
| https://github.com/niccolofanton/data-mosh / Niccolò Fanton | GitHub、MIT（LICENSE確認） | README、datamosh-demo/src/main.ts、datamosh/index.ts。動きベクトル＋前回出力＋残差による擬似Pフレーム、Iフレーム復帰、履歴の精度。原理を採用。シーン依存の速度パス、React、外部モデルは導入しない。第三者アセットはMIT対象外であり不使用。 |
| https://github.com/mrdoob/three.js / three.js authors | GitHub公式Example、MIT（LICENSE確認） | webgl_postprocessing_afterimage.html、examples/jsm/postprocessing/AfterimagePass.js。履歴バッファ交換・dispose・resizeを確認。現在のThree.js基盤を継続使用。単なるAfterimagePassでは001の動き補償にならないためそのまま採用しない。 |
| https://github.com/pmndrs/postprocessing / Raoul van Rüschenほか | GitHub、Zlib（LICENSE.md確認） | 今回取得したのはライセンスのみ。DataMoshManager側でのEffectComposer利用を確認。既存パイプラインで実装可能なので新規依存として不採用。SSAO等の既存追加16件は変更しない。 |
| https://github.com/ashima/webgl-noise / Ashima Arts、Stefan Gustavson | GitHub、MIT（LICENSE確認） | 今回はライセンス調査のみ。既存hashユーティリティでグリッチの決定的乱数を賄えるので新しいノイズコードは不採用。 |
| https://github.com/regl-project/regl / regl contributors | GitHub README（今回ライセンス未確認） | resource/commandのWebGL抽象化を確認。Three.jsと二重のGPU所有系になるため不採用。コードの転用なし。 |

参照したGitHubリポジトリは5件（うちライセンスのみの確認2件）。X投稿、GitLab、Shadertoy、CodePen、YouTube、論文はこの段階では未調査。確認済みのX投稿URLはない。

## エフェクト別の方針

| ID / 名称 | 参考・作者・種別・ライセンス | 原理と実装 | 性能・採否 |
| --- | --- | --- | --- |
| 001 データモッシュ | data-mosh / Niccolò Fanton / GitHub / MIT、three.js / authors / 公式Example / MIT | 入力の前フレームと現在フレームから正則化付き輝度勾配法で動きを推定。ブロック解像度の専用パスをNearestFilterで読む。前回の破損出力を移流し量子化残差を加える。Iフレーム周期、初回、巻き戻し、リサイズで復帰。 | 旧実装の25点推定を全画素で繰り返す方式を9点/ブロックへ変更。入力履歴と出力履歴はRGBA8、float拡張不要。大きな移動、遮蔽、低テクスチャ面では推定が不完全。原理採用、外部コード不使用。 |
| 002 データベンディング | 外部コード参照なし / 独自実装 / 当リポジトリMIT | 行レコードの再配置、水平バイト列オフセット、RGB置換、8bit画素値へのXOR。履歴を必要とせず001と差別化。GLSLの浮動小数点算術で8bit XORを計算。 | 単一パス、追加ターゲット不要、強度0は元入力をそのまま出力。速度0で破損パターン固定。採用。 |
| 003〜009 既存グリッチ | このリポジトリ / MIT | 既存のチャンネル分離、ブロック、スライス、ティア、履歴凍結、量子化、走査線欠落を維持。 | 生成・描画・破棄を回帰検証。明確な改修理由がないため変更しない。 |
| 010 エラー増殖 | 外部コード参照なし / 独自実装 / 当リポジトリMIT | 8px格子の状態をピンポン更新する近傍感染モデル。上下左右からの感染、ランダム感染源、回復を30Hz固定ステップで計算。感染度で画像の座標・色順序・量子化を破損。 | 縮小RGBA8ターゲット2枚。dtを制限し1フレーム9ステップ上限、停止時更新なし。強度0は元映像。一般的な近傍更新の原理を独自実装。 |

WebGPUは研究候補だが今回の3効果に必須ではない。WebGL2で動く既存端末を優先する。巨大なシミュレーションライブラリ、React Three Fiber、Pixi、p5.js、Taichiは今回の第一カテゴリに必要ないため導入していない。

## 閲覧できなかった資料

- https://thebookofshaders.com/10/ : 通常アクセス・権限拡張後とも403。解説は未確認。
- GitHub contents APIのdata-mosh/datamosh-demo/src/datamosh: 403。raw.githubusercontent.comから実在するファイルを個別に取得。
- 仮定したDatamoshPass.tsのraw URL: 404。参照済み扱いにしない。実際のdatamosh/index.tsを取得して調査。
- data-mosh READMEに記載されたCodrops URLは `?p=` の未完成リンク。記事本文を確認したと扱わない。

次のカテゴリでは履歴時間の定義と録画/逆再生、物体時間とカメラ時間の分離を研究する。アルゴリズムの近似と実際の互換性検証の範囲は進捗文書に記録する。
