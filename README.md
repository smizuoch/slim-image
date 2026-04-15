# slim-image

`slim-image` は、PNG / JPEG / WebP をブラウザ内だけで最適化する完全静的サイトです。  
画像は外部サーバーへ送信されません。GitHub Pages にそのまま配置でき、幅・高さと出力拡張子を変えずに「目標サイズ以下で最高画質」を狙います。

## 特徴

- 完全静的サイト
- バックエンドなし
- 画像はブラウザ外へ送信しない
- HTML / CSS / JavaScript / Rust-WASM のみ
- TypeScript なし
- React / Vue / Svelte なし
- Web Worker + WASM で探索を分離
- GitHub Pages 配下の相対パスで動作

## 対応形式

- PNG
- JPEG / JPG
- WebP

## できること

- 画像ドラッグ&ドロップ / ファイル選択
- 目標サイズの KB / MB 入力
- 元画像情報の表示
  - 拡張子
  - 幅
  - 高さ
  - 元サイズ
  - 透過あり / なし
- 最適化結果の表示
  - 出力サイズ
  - 圧縮率
  - 出力形式
  - 品質スコア
  - 採用パラメータ
- Before / After プレビュー
- 詳細ログ
- ダウンロード

## 重要な注意

- このツールは完全静的サイトです。
- 画像はサーバーへ送信されません。
- GitHub Pages で動作します。
- `file://` 直開きは、ブラウザによっては WASM 読み込み制限で失敗します。
- ローカル確認は簡易静的サーバー経由を推奨します。
- 出力品質は「目標サイズ以下で最高画質」を狙う探索であり、形式ごとに探索方法が異なります。
- `package.json` は JS unit test を ESM として実行しやすくするための最小設定であり、本番実行には不要です。

## ディレクトリ構成

```text
/
  index.html
  package.json
  build-wasm.sh
  /assets
    /css
      reset.css
      base.css
      layout.css
      components.css
    /js
      app.js
      ui.js
      state.js
      bytes.js
      image-io.js
      download.js
      worker-client.js
      score-preview.js
    /worker
      optimizer-worker.js
    /wasm
      optimizer.js
      optimizer_bg.wasm
      optimizer.d.ts
      optimizer_bg.wasm.d.ts
  /rust
    Cargo.toml
    Cargo.lock
    /src
      lib.rs
      types.rs
      score.rs
      rgba.rs
      pareto.rs
      search.rs
      png.rs
      jpeg.rs
      webp.rs
  /tests
    /unit
      index.html
      runner.js
      test-helpers.js
      bytes.test.js
      state.test.js
      score-preview.test.js
    /manual
      index.html
  README.md
```

## 全体設計

### 1. UI レイヤ

- `index.html`
  - 参照元 `/home/smizuoch/resize-image/` のダイアログ型 UI をベースに構成
  - 左にワークスペース、右に設定サイドパネル
- `assets/css/*`
  - 参照元のトーンを維持しつつ、責務ごとに分割

### 2. JavaScript レイヤ

- `app.js`
  - 全体統括
  - ファイル読込、状態遷移、Worker 呼び出し、ダウンロード
- `ui.js`
  - DOM バインドとレンダリング
  - テーマ切替
- `state.js`
  - 状態生成
  - Worker メッセージ適用
  - ログ、エラー、結果の更新
- `bytes.js`
  - KB / MB 変換
  - バイト表示
  - 圧縮率表示
- `image-io.js`
  - 入力検証
  - ファイル読込
  - プレビュー URL 管理
  - 透過の簡易検出
- `download.js`
  - 保存ファイル名生成
  - ダウンロード処理
- `worker-client.js`
  - Web Worker 通信ラッパー
- `score-preview.js`
  - UI 用の要約文字列生成

### 3. Worker レイヤ

- `assets/worker/optimizer-worker.js`
  - 重い探索を実行
  - WASM をロード
  - 画像デコード
  - 候補生成
  - 候補評価
  - 進捗 / ログ / 結果を UI に返却

### 4. Rust / WASM レイヤ

- `lib.rs`
  - wasm-bindgen エクスポート定義
- `types.rs`
  - `CandidateResult`
  - `ScoreResult`
- `rgba.rs`
  - RGBA 背景合成
  - 完全透明 RGB 正規化
- `score.rs`
  - MSE
  - PSNR
  - SSIM 近似
  - alpha-aware score
- `pareto.rs`
  - Pareto front 抽出
  - 制約内候補の選択補助
- `search.rs`
  - 早期終了判定
  - 品質探索窓
- `jpeg.rs`
  - JPEG エンコード
- `webp.rs`
  - WebP lossless / lossy エンコード
- `png.rs`
  - PNG lossless pass
  - PNG lossy 候補生成
  - palette / grayscale / rgba などの表現切替

## コアデータ構造

### Rust 側

```rust
pub struct CandidateResult {
    pub bytes_len: usize,
    pub score: f64,
    pub format_kind: u32,
    pub width: u32,
    pub height: u32,
}
```

```rust
pub struct ScoreResult {
    pub score: f64,
    pub mse: f64,
    pub psnr: f64,
    pub ssim: f64,
    pub alpha_delta: f64,
}
```

### JavaScript 側

- `state.source`
  - 入力ファイル、プレビュー URL、寸法、透過有無
- `state.target`
  - ユーザー入力の目標サイズ
- `state.progress`
  - ratio / attempts / branch / paretoCount
- `state.result`
  - 出力 Blob
  - 出力 URL
  - 品質メトリクス
  - 採用パラメータ

## Worker 通信設計

### UI → Worker

```js
{
  id,
  type: "optimize",
  payload: {
    inputBuffer: ArrayBuffer,
    fileName: "example.png",
    mimeType: "image/png",
    targetBytes: 1048576,
    sourceSize: 4382192
  }
}
```

### Worker → UI

- `progress`
  - 探索中の候補数、進捗率、現在の分岐
- `log`
  - ユーザー向けの探索ログ
- `result`
  - 成功時の出力バイト列
- `error`
  - 失敗時メッセージ

## 最適化アルゴリズム

### 品質評価 `Q(x, y)`

現実装では軽量性優先で次を組み合わせています。

- RGB MSE
- PSNR
- 輝度ベースの SSIM 近似
- RGBA の場合は背景合成を 4 パターンで評価
  - 白
  - 黒
  - グレー
  - チェッカー
- Alpha 差分ペナルティ

概念的には以下です。

```text
maximize Q(x, y)
subject to B(y) <= T
```

### JPEG

- subsampling を `4:4:4` / `4:2:0` に分岐
- progressive の有無で分岐
- quality を二分探索
- 最後に近傍品質を局所探索
- 制約内で最高スコアの候補を採用

### WebP

- まず lossless を試す
- alpha なし
  - lossy quality を二分探索
- alpha あり
  - 透過を保つため lossless を維持
  - 事前量子化した RGBA を lossless WebP に再エンコードする alpha-safe 探索

### PNG

- lossless pass
  - metadata を再エンコードで除去
  - 透明 RGB 正規化
  - filter / compression 探索
  - color type 見直し
    - RGBA
    - RGB
    - Grayscale
    - Grayscale + Alpha
    - Indexed palette
- lossy pass
  - posterize
  - ordered dithering
  - alpha protection
  - coarse search
  - Pareto front 抽出
  - local refinement

## 最小実装の骨組み

このリポジトリの現状は「まず動く最小構成」を超えて、以下まで実装済みです。

- UI 骨組み
- 入出力
- Worker 通信
- Rust/WASM 呼び出し基盤
- JPEG 最適化
- WebP 最適化
- PNG lossless
- PNG lossy の粗探索 + 局所探索
- JS / Rust テスト

## 段階的改善案

### Phase 1

- UI、Worker、WASM の土台
- モック探索器ではなく実エンコードまで到達

### Phase 2

- JPEG / WebP / PNG lossless 実装

### Phase 3

- PNG lossy の探索強化
- RGBA 評価改善
- 探索の枝刈り強化
- 候補の重複排除

### Phase 4

- 視覚比較 UI 強化
- 候補ごとの詳細統計
- AVIF / JPEG XL の追加

## Rust / WASM ビルド方法

### 前提

- Rust toolchain
- `wasm-bindgen-cli`

### 一発ビルド

```bash
./build-wasm.sh
```

### 手動ビルド

```bash
rustup target add wasm32-unknown-unknown
cd rust
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen \
  --target web \
  --out-dir ../assets/wasm \
  --out-name optimizer \
  target/wasm32-unknown-unknown/release/slim_image_wasm.wasm
```

## ローカル確認

`file://` 直開きは避けてください。WASM や Worker がブラウザ制約で失敗する場合があります。

```bash
python3 -m http.server 4173
```

その後、`http://localhost:4173/` を開いて確認します。

## GitHub Pages に置く手順

1. `./build-wasm.sh` を実行して `assets/wasm` を更新する
2. リポジトリルートをそのまま push する
3. GitHub Pages の公開元を `main` ブランチの `/ (root)` に設定する
4. 公開 URL を開き、PNG / JPEG / WebP で動作確認する

この構成はすべて相対パスなので、GitHub Pages のサブパス配下でも動きやすい設計です。

## テスト

### Rust

```bash
cd rust
cargo test
```

対象:

- MSE / PSNR
- alpha-aware score
- RGBA 合成
- Pareto front
- 早期終了補助
- PNG 候補生成

### JavaScript

```bash
node tests/unit/runner.js
```

対象:

- bytes 変換
- state 遷移
- score preview 要約

### ブラウザで JS unit test を見る

`tests/unit/index.html` を静的サーバー経由で開きます。

### 手動確認

`tests/manual/index.html`

## 主要ファイルの説明

- [index.html](./index.html)
  - アプリの骨格 UI
- [assets/js/app.js](./assets/js/app.js)
  - アプリ全体の統括
- [assets/js/ui.js](./assets/js/ui.js)
  - DOM イベントとレンダリング
- [assets/worker/optimizer-worker.js](./assets/worker/optimizer-worker.js)
  - 形式ごとの探索本体
- [rust/src/lib.rs](./rust/src/lib.rs)
  - JS に公開する WASM API
- [rust/src/png.rs](./rust/src/png.rs)
  - PNG の lossless / lossy 候補生成
- [rust/src/jpeg.rs](./rust/src/jpeg.rs)
  - JPEG エンコード
- [rust/src/webp.rs](./rust/src/webp.rs)
  - WebP エンコード
- [rust/src/score.rs](./rust/src/score.rs)
  - 品質評価

## AVIF / JPEG XL を足す拡張ポイント

### 追加すべき場所

- `rust/src/avif.rs`
- `rust/src/jxl.rs`
- `rust/src/lib.rs` にエクスポート追加
- `assets/worker/optimizer-worker.js`
  - `optimizeAvif`
  - `optimizeJxl`
- UI の形式説明欄

### 追加時の方針

- AVIF
  - alpha / speed tier / CQ を探索パラメータに持つ
- JPEG XL
  - distance / effort / lossless を探索パラメータに持つ
- いずれも `score.rs` の品質評価は再利用可能
- Worker の分岐追加だけで UI はほぼ流用できる

## 制約と既知のトレードオフ

- PNG の sub-8bit indexed 最適化まではまだ入れていません
- alpha 付き WebP lossy は利用ライブラリ制約を避けるため、alpha-safe な lossless 再エンコード戦略を採用しています
- 画質評価は軽量な近似スコアであり、SSIMULACRA2 などの重い指標はまだ入れていません

## ライセンス

MIT
