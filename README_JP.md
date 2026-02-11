# Bio:gram

[🇺🇸 English](README.md)

![title](assets/zen_mode.png)

## 現在のプロダクト概要

Bio:gram は、ブラウザ上で動作する AI DJ システムです。主な要素は以下です。

- Google Lyria (`lyria-realtime-exp`) によるデュアルデッキのリアルタイム音楽生成
- Mix計画時のみ Gemini 3 Pro (`gemini-3-pro-preview`) による統合ミックスプラン生成
- Grid/解析など軽量処理には Gemini Flash Lite (`gemini-flash-lite-latest`) を使用
- AudioWorklet ベースのDSPとミキシング
- Three.js ベースのライブビジュアル
- IndexedDB を使ったローカルループライブラリ

## 実装済み機能（コード基準）

### 1. デッキとトランスポート

- Deck A / Deck B の独立再生・停止
- SYNC トグル、BPM調整、TAP BPM
- デッキごとのプロンプト入力と `GEN` トリガー
- デッキ単位の可視化（`hydra-visualizer`）
- `AudioEngine` 側で BPM 比率同期 + 位相合わせ

関連:

- `src/ui/modules/deck-controller.ts`
- `src/audio/engine.ts`

![Main Interface](assets/screen1.png)

### 2. AI Prompt-to-Music フロー

- 初回は `INITIALIZE SYSTEM` で初期化
- AudioWorklet ロード後、両デッキの Lyria セッションを接続
- `GEN` でプロンプト更新（停止中デッキはハードリセット経由）
- プロンプトは UI 状態（Ambient/Minimal/Dub/Impact/Color、Texture/Pulse、Key/Scale、Deck特性、SLAM状態）から生成

関連:

- `src/main.ts`
- `src/ai/prompt-generator.ts`
- `src/ai/music-client.ts`

### 3. AI Mix（Director Panel）

- `A->B` / `B->A` のミックス生成要求
- Duration（16/32/64/128）、Mood、Visual指定を付与
- Gemini 3 Pro が統合ミックスプランを返却し、その `audio_plan` を `AutomationScore` として実行
- `AutomationEngine` が小節進行で補間実行（安全制御・禁止パラメータ制御あり）
- UI 状態遷移: `IDLE -> GENERATING -> READY -> MIXING`

関連:

- `src/ui/modules/super-controls.ts`
- `src/ai/mix-generator.ts`
- `src/ai/automation-engine.ts`

![AI Mix](assets/screen4.png)

### 4. DSP / Mixer / FX

- AudioWorklet Processor を中心にDSPを処理
- クロスフェーダー、EQ/KILL、TRIM/DRIVE 連携
- FXラック（Filter/Tape Echo/Bloom Verb/Spectral Gate/Cloud Grain/Decimator/Dynamics など）
- SLAM マクロ（Filter/Res/Drive/Noise を連動）

関連:

- `src/audio/worklet/processor.ts`
- `src/audio/worklet/dsp/*`
- `src/ui/modules/dj-mixer.ts`
- `src/ui/modules/fx-rack.ts`

### 5. Visual System

- 背景 `three-viz` を中心にビジュアル描画
- Visual Controls:
  - モード切替（`organic`, `wireframe`, `monochrome`, `rings`, `waves`, `suibokuga`, `grid`, `ai_grid`）
  - Deckごとの画像/動画テクスチャ投入、Webcam入力
  - Blur FX、描画ON/OFF
  - `/?mode=viz` プロジェクターモード
  - Zen Mode オーバーレイ
- AI Grid パラメータ生成
- Visualスコア同期は `MusicClient` が出すオーディオフレーム時刻（`startFrame/endFrame`）を優先し、ドリフトを抑制

関連:

- `src/ui/visuals/ThreeViz.ts`
- `src/ui/visuals/VisualControls.ts`
- `src/ai/grid-generator.ts`

![Visual System](assets/screen3.png)

### 6. ループライブラリ

- 現在デッキ音声を 8/16/32/64/128 小節で保存
- 保存前に音声有効率チェック
- IndexedDB にタグ・ベクトル・BPM・プロンプト付きで保存
- インポート/エクスポート（WAV）/削除
- 現在デッキ特徴量との類似推薦
- サイドバー開閉は明示制御（`setLibraryPanelVisible`）に変更し、開いた後に閉じられない問題を回避

関連:

- `src/ui/modules/loop-library-panel.ts`
- `src/audio/db/library-store.ts`
- `src/audio/utils/audio-analysis.ts`
- `src/ui/bootstrap/library-sidebar.ts`

### 7. モバイルUI（現状）

- 下部固定タブバーでビュー切替（`DECK / FX / VISUAL / AI MIX`）
- デッキのモバイルミニ操作をタッチ向けに拡大（PLAY/GEN/BPM）
- GENボタンに短いパルス演出を追加（押下フィードバック）

## 実行アーキテクチャ

- Main/UIスレッド:
  - Lit コンポーネント
  - `main.ts` で全体オーケストレーション
  - AI API 呼び出し（Mix生成、Visual解析）
  - bootstrap モジュールでイベント配線とクリーンアップを管理:
    - `src/ui/bootstrap/deck-transport-events.ts`
    - `src/ui/bootstrap/visual-sync-events.ts`
    - `src/ui/bootstrap/library-sidebar.ts`
    - `src/ui/bootstrap/zen-overlay.ts`
- Audioスレッド:
  - AudioWorklet + SharedArrayBuffer
  - DSPチェーン処理
- データ層:
  - IndexedDB（`promptdj-ghost-memory`）

## セットアップ

### 前提

- Node.js 18+
- コード内で使用する Gemini/Lyria へアクセスできる API キー

### インストール

```bash
npm install
```

### 環境変数

プロジェクトルートに `.env` を作成:

```env
GEMINI_API_KEY=your_api_key_here
```

補足:

- `GEMINI_API_KEY` はローカルバックエンドミドルウェア（`/api/*`）のみで使用され、ブラウザ側コードには露出しません。
- Realtime Lyria（Deck生成）は、WSリレー実装前のため、現状はアプリ内 API 設定ダイアログで入力したキーをクライアント側で利用します。

### 起動

```bash
npm run dev
```

`http://localhost:3000` を開きます。

## 基本操作フロー

1. `INITIALIZE SYSTEM` を押す
2. Deck A/B の再生と BPM・プロンプトを調整
3. `GEN` でデッキの生成文脈を更新
4. `SUPER` 画面で `A->B` または `B->A` を生成要求
5. `START MIX` で実行開始
6. 必要に応じて Visual モード切替 / Projector 利用
7. ループを保存し、ライブラリから再読込

## WebMCP（AIMIX のエージェント操作）

Bio:gram は WebMCP（Imperative API）で AIMIX 操作を外部エージェントに公開しています。

### 公開ツール

- `aimix_generate`: ミックス生成要求（single/free 両対応）
- `aimix_start`: 生成済みミックスの開始（`READY` 必須）
- `aimix_cancel`: 開始前キャンセル（`READY` 必須）
- `aimix_abort`: 実行中停止（`MIXING/WAIT_NEXT/POST_REGEN` 必須）
- `aimix_get_state`: AIMIX/Deck の状態スナップショット取得

### 利用者側設定（Chrome Early Preview）

1. Chrome `146.0.7672.0` 以上を使用
2. `chrome://flags/#enable-webmcp-testing` を開く
3. **WebMCP for testing** を `Enabled` にする
4. Chrome を再起動
5. `npm run dev` で Bio:gram を起動してタブを開く
6. （推奨）**Model Context Tool Inspector** 拡張を入れて、
   - ツール登録確認
   - 手動実行
   - Gemini 連携で自然言語呼び出しテスト

### 推奨呼び出しフロー

1. ユーザーに `INITIALIZE SYSTEM` を押してもらう
2. `aimix_generate` を呼ぶ
3. `aimix_get_state` で `mixState === "READY"` を待つ
4. `aimix_start` を呼ぶ
5. 実行中は `aimix_get_state` を参照し、必要時に `aimix_abort`

### 重要: MCP と WebMCP の違い

- 今回の実装は **WebMCP**（ブラウザ内・タブ文脈必須）です。単体の MCP サーバーではありません。
- サーバー側/リモート MCP クライアント対応が必要なら、別途 MCP サーバー層を追加してください。

## 評価・検証アセット

現時点では `npm test` は未定義です。補助スクリプトとして以下があります。

- `scripts/eval-beat-detector.ts`
- `scripts/eval-beat-detector.js`
- `py_bridge/analyze.py`
- `py_bridge/test_analyze.py`

## 重要な制約

- `SharedArrayBuffer` 利用のため、Vite 開発サーバーでは COOP/COEP ヘッダを設定しています（`vite.config.ts`）。
- Docker/Nginx 側は SPA 配信設定はありますが、COOP/COEP ヘッダはデフォルトで追加していません。
- 品質・応答速度は外部モデルの可用性、API制限、レイテンシに依存します。

## ディレクトリ概要

```text
src/
  ai/           Gemini/Lyria クライアント、Mix生成
  audio/        AudioEngine、解析、Worklet DSP、IndexedDB
  ui/           Lit UI（deck/mixer/super/visual）
  midi/         MIDI 管理
  types/        型定義
```

## ライセンス

MIT
