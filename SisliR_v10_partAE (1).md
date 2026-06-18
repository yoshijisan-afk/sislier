# SisliR 完全設計書 v10.0

> ⚠️ **DEPRECATED — このファイルはv10.1完全設計書に置き換えられています**
>
> 本ファイル（v10.0）は `SisliR_v10_1_完全設計書.md`（v10.1）によって全面的に上書きされました。
> v10.1ではOrchestrationLoop（Part DD）・ポータル自動入力（Part GG）等が追加され、
> FloorplanVLMに関する記述（H.3、ADR-057等）も含めてv10.1版が最新です。
>
> **実装・設計の参照先**: `SisliR_v10_1_完全設計書.md` + Part NN v1.1（structureSource修正版）+ Part OO（ADR-144: FloorplanVLM廃止）
>
> 以下は履歴として保持していますが、新規実装の参照には使用しないでください。

---

## AI住宅マーケティングOS + 住宅デジタルツイン基盤
## 集客・反響・改善ループ統合版 — テスト・可観測性・運用完全版

> **Confidential** | 2026年6月 | v10.0.0
>
> ### v10.0 統合方針
>
> | ソース | 採用内容 |
> |--------|---------|
> | v8.0（完全設計書） | Part A〜R の全設計（基盤・技術スタック・アーキテクチャ） |
> | v9.0（集客・反響追加） | Part S〜V（SNSサムネイル・SEO・反響計測・自動改善ループ） |
> | v9.1（追補） | Part W〜Y（ダイナミックLP・セクション計測・VideoSitemap） |
> | v9.1-Z（ポータル・CMS） | Part Z（反響CMS・チャネル取り込み・ポータル設計） |
> | v10.0（本書・新規追加） | Part AA（テスト戦略）・Part BB（可観測性）・Part CC（運用・障害対応）・全設計のクリティカル課題修正 |
>
> ### v10.0での重要変更・追加
>
> | 変更点 | 理由 |
> |--------|------|
> | Scene JSON マイグレーション戦略を確定 | v8→v9→v10のDrizzle migration SQLと後方互換ポリシーを明文化 |
> | PropertyIntakeAgent べき等性マトリクスを追加 | Step別の再実行安全性・部分成功からの再開手順を明記 |
> | Part AA — テスト戦略を新規追加 | Unit/Integration/E2E/Loadテスト・CI設定・カバレッジ目標を定義 |
> | Part BB — 可観測性設計を新規追加 | OpenTelemetry・SLO/SLI・分散トレーシング・アラート設計 |
> | Part CC — 運用・障害対応設計を新規追加 | ランブック・エスカレーション・コスト監視・キャパシティプランニング |
> | Higgsfield フォールバック設計を追加 | Runway Gen-4 / Kling AI への自動切替をVideoGeneratorRouterに組み込み |
> | SectionBeacon デバウンス設計を追加 | 上スクロール時の重複カウント防止ロジック |
> | iOS Safari sendBeacon 代替実装を追加 | fetch + keepalive フォールバック実装 |
> | 量子耐性暗号移行計画を追加 | leadsテーブルのSHA-256 → SHA-3移行ADR |
> | ADR 090〜100を追加 | v10.0で確定した設計決定10件 |

---

## 目次

- [Part A — ビジョン・思想・ビジネスモデル](#part-a)
- [Part B — 技術スタック v10.0確定版](#part-b)
- [Part C — システムアーキテクチャ](#part-c)
- [Part D — アセット管理 & ストレージ設計](#part-d)
- [Part E — Scene JSON v10.0 完全スキーマ + マイグレーション戦略](#part-e)
- [Part F — PropertyIntakeAgent & MCPサーバー設計 + べき等性設計](#part-f)
- [Part G — 動画生成フロー（VideoGeneratorRouter + フォールバック）](#part-g)
- [Part H — ファイルインポートパイプライン](#part-h)
- [Part I — 3Dキャプチャ & 生成パイプライン](#part-i)
- [Part J — OpenUSD統合設計](#part-j)
- [Part K — LP Runtime（3D体験設計）](#part-k)
- [Part L — Event Driven設計](#part-l)
- [Part M — データベース設計](#part-m)
- [Part N — セキュリティ・法規制・WAF防御](#part-n)
- [Part O — ポータル連動設計](#part-o)
- [Part P — ビジネスモデル & プライシング](#part-p)
- [Part Q — 実装ロードマップ](#part-q)
- [Part R — ADR完全ログ v10.0](#part-r)
- [Part S — 集客エンジン設計](#part-s)
- [Part T — 反響計測設計](#part-t)
- [Part U — 自動改善ループ設計](#part-u)
- [Part V — SNSサムネイル生成設計](#part-v)
- [Part W — ダイナミックLP設計（広告文脈整合）](#part-w)
- [Part X — セクション別行動計測設計](#part-x)
- [Part Y — 動画SEO・VideoSitemap設計](#part-y)
- [Part Z — 反響最大化・ポータル・CMS設計](#part-z)
- [**Part AA — テスト戦略（v10.0新規）**](#part-aa)
- [**Part BB — 可観測性・監視設計（v10.0新規）**](#part-bb)
- [**Part CC — 運用・障害対応設計（v10.0新規）**](#part-cc)

---

## Part A — ビジョン・思想・ビジネスモデル {#part-a}

### A.1 プロダクトビジョン

```
SisliRは不動産SaaSではなく
「AI住宅マーケティングOS + 住宅デジタルツイン基盤」である。

素材を1回登録するだけで
Claudeエージェントが全マーケティング成果物を30分で自動生成し
集客・反響・改善ループを自律的に回し続ける。

v10.0の追加ビジョン:
  「作る」から「売れるまで」から「信頼して任せられるシステムへ」。
  壊れても自己回復し、測定可能で、変化に追従できるシステム設計が
  世界トップレベルのプラットフォームの条件である。

最終目標:
  Matterportを超える住宅デジタルツインOSと
  AI住宅マーケティングOSを統合した
  世界トップレベルのプラットフォーム
```

### A.2 設計5原則（v10.0更新）

```
1. Asset First
   素材（写真・動画・図面・SPZ）を一度登録すれば
   全ての成果物がそこから生成される。
   アセットこそが唯一の真実のソース（Source of Truth）。

2. Agent First
   人間が操作するのは「生成ボタン」1回のみ。
   ClaudeエージェントがMCPサーバーを通じて
   全自動で成果物を生成・品質チェック・公開・配信・改善する。

3. Digital Twin First
   全物件は「住宅デジタルツイン（Scene JSON + OpenUSD）」として管理する。
   LP・動画・Instagram・YouTube・PDF・LINEは
   全てデジタルツインから派生生成される。
   デジタルツインが更新されれば、全成果物が自動更新される。

4. Growth Loop First
   「作成」だけでなく「集客→反響→学習→改善」の
   自律的ループを設計の第一級概念とする。
   反響率・成約率がシステムの主要KPIであり
   全ての生成物はそのKPI改善のために存在する。

5. Observable First（v10.0新規）
   測定できないものは改善できない。
   全MCPサーバー・全エージェントステップ・全外部API呼び出しに
   分散トレーシングとメトリクスを組み込む。
   SLO/SLI を定義し、自動アラートで問題を先回りして検知する。
```

### A.3 2トラック事業モデル

#### トラックA：AI住宅マーケティングOS（SaaS・月額定額）

```
対象: 全不動産会社（売主・仲介・デベロッパー）

SisliR導入後（v10.0）:
  素材アップロード（10〜15分）
    ↓ ClaudeエージェントがMCP経由で全自動実行（〜30分）
  ① 写真プロ仕様補正・WebP変換
  ② SNSサムネイル自動生成（全プラットフォーム対応）
  ③ SUUMO / HOME'S / at home 入稿データ生成（CSV）
  ④ キャッチコピー・物件説明文生成（宅建業法準拠）
  ⑤ 3D LP生成・公開URL発行（OGP最適化済み）
  ⑥ SEO構造化データ自動生成（schema.org/PropertyListing）
  ⑦ 紹介動画生成（OpenCut MCP / Higgsfield MCP）
  ⑧ SNSコンテンツ生成 + 自動投稿スケジュール
  ⑨ パンフレットPDF生成（A4・QR入り・印刷対応）
  ⑩ 集客チャネル追跡開始（UTMパラメータ自動付与）
```

#### トラックB：AI住宅制作スタジオ（受注制作・高単価）

```
受注 → 生成ボタン → 90%自動生成 → 人間編集10% → 納品

成果物:
  高品質Gaussian Splat LP（SPZ4 / SOG）
  シネマティック4K動画（Higgsfield MCP）
  SNSサムネイルセット（全プラットフォーム）
  USDZ（Apple Vision Pro / iOS AR）
  BIMデジタルツイン（IFC → OpenUSD）

価格帯: ¥49,800 〜 ¥398,000 / 物件
```

### A.4 Before / After（v10.0）

#### After（SisliR v10.0 導入後）

| 作業 | コスト | 時間 |
|------|--------|------|
| 素材アップロード | 月額サブスク | 10〜15分 |
| 写真補正・WebP変換 | 自動 | 30〜60秒 |
| SNSサムネイル生成（全サイズ） | 自動 | 20〜30秒 |
| SUUMO / at home 入稿データ | 自動 | 10〜20秒 |
| キャッチコピー・説明文 | 自動 | 10〜20秒 |
| LP生成・公開 + SEO設定 | 自動 | 20〜40秒 |
| 紹介動画 | 自動 | 3〜8分 |
| SNSコンテンツ + 投稿スケジュール | 自動 | 20〜30秒 |
| パンフレットPDF | 自動 | 30〜60秒 |
| 集客チャネル追跡開始 | 自動 | 即時 |
| **合計** | **月額サブスク** | **〜30分/物件** |

### A.5 競合優位性マトリクス

| 比較軸 | SUUMO/LIFULL | Matterport | バーチャル系 | **SisliR v10.0** |
|--------|-------------|-----------|------------|----------------|
| マーケ全自動化 | ✗ | ✗ | ✗ | ★★★★★ MCPエージェント |
| SNSサムネイル自動生成 | ✗ | ✗ | ✗ | ★★★★★ 全プラットフォーム |
| 集客→反響ループ | ✗ | ✗ | ✗ | ★★★★★ 自律改善 |
| 建築前物件3D | ✗ | ✗ 要撮影 | ✗ | ★★★★★ FloorplanVLM |
| デジタルツイン | ✗ | △ | ✗ | ★★★★★ OpenUSD中心 |
| AI動画自動生成 | ✗ | ✗ | ✗ | ★★★★★ VideoGeneratorRouter |
| Gaussian Splat | ✗ | ✗ | △ | ★★★★★ SPZ4 + SOG |
| AR内覧 | ✗ | △ 専用アプリ | ✗ | ★★★★★ WebXR + USDZ |
| 反響計測・A/Bテスト | △ 外部ツール | ✗ | ✗ | ★★★★★ 内製完結 |
| BIM連携 | ✗ | ✗ | ✗ | ★★★★★ IFC → OpenUSD |
| 宅建業法準拠 | △ | ✗ | ✗ | ★★★★★ 完全自動準拠 |
| **可観測性・運用設計** | **—** | **—** | **—** | **★★★★★ OpenTelemetry完全統合** |

---

## Part B — 技術スタック v10.0確定版 {#part-b}

### B.1 フロントエンド

| カテゴリ | 技術 | バージョン | 選定根拠 |
|----------|------|-----------|---------| 
| 言語 | TypeScript | 5.x | 型安全性。Scene JSONスキーマに必須 |
| フレームワーク | React | 19.x | Concurrent Mode + React Compiler自動メモ化 |
| ビルドツール | Vite | 6.x | ESM Native / HMR高速 / Terser難読化 |
| 3Dエンジン | Three.js r184 WebGPU | r184 | 全ブラウザWebGPU対応確認済み |
| R3F | React Three Fiber | 9.x | WebGPURenderer async gl対応 |
| アニメーション | GSAP 4.x | 4.x | ScrollTrigger v4 WebGPU統合 |
| 状態管理 | Zustand + Immer | 5.x + 10.x | Undo/Redo |
| サーバー状態 | TanStack Query | v5 | 楽観的更新・キャッシュ |
| スキーマ検証 | Zod v4 | v4 | Scene JSON v10.0ランタイムバリデーション |
| Gaussian Splat | @mkkellogg/gaussian-splats-3d | 最新 | Three.js唯一の実績あるGS統合 |
| Semantic AI | @xenova/transformers（SegFormer） | 最新 | WASM・API費ゼロ |
| Worker通信 | Comlink | 4.x | 型安全RPC |
| 協働編集 | Yjs CRDT | 最新 | エディタリアルタイム協働 |
| スタイリング | Tailwind CSS | 4.x | JIT / CSS Variables |

### B.2 バックエンド・インフラ

| カテゴリ | 技術 | バージョン | 用途 |
|----------|------|-----------|------|
| APIサーバー | Next.js | 15.x | App Router + Server Actions + Streaming |
| ORM | Drizzle ORM | 0.30.x | Supabase PostgreSQL 型安全クエリ |
| DB | Supabase PostgreSQL | 最新 | 物件データ・Scene JSON・pgvector |
| Vector DB | pgvector（Supabase） | 最新 | voyage-3 RAG + 動画品質ログ + 反響パターンベクトル化 |
| 認証 | Supabase Auth | 最新 | マルチテナント・日本リージョン確実（ADR-013） |
| アセット | Cloudflare R2 | 最新 | 公開キャッシュ・エグレス無料 |
| CDN / WAF | Cloudflare | 最新 | Pages + WAF + DDoS防御 |
| ジョブキュー | pg-boss 10.x | 10.x | Redis不要・Supabase統合（ADR-046） |
| 画像処理 | sharp | 0.33.x | 写真補正・WebP変換・サムネイル |
| サムネイル生成 | sharp + @napi-rs/canvas | 最新 | SNSサムネイル合成・テキストオーバーレイ |
| PDF生成 | Puppeteer | 最新 | パンフレットHTML→PDF |
| イベントバス | PostgreSQL LISTEN/NOTIFY | — | Event Driven基盤 |
| 課金 | Stripe | 最新 | SaaSサブスクリプション |
| **可観測性** | **OpenTelemetry SDK** | **最新** | **分散トレーシング・メトリクス（Part BB）** |
| **ログ集約** | **Grafana Loki** | **最新** | **構造化ログ集約・クエリ（Part BB）** |
| **メトリクス** | **Grafana Cloud** | **最新** | **Prometheus互換メトリクス可視化（Part BB）** |

### B.3 AI・エージェント統合

| カテゴリ | 技術 | 役割 |
|----------|------|------|
| コアAI | claude-sonnet-4-20250514 | PropertyIntakeAgent・コピー生成・図面解析・動画プロンプト・品質判定・サムネイルデザイン指示 |
| 軽量AI | claude-haiku-4-5-20251001 | 単純分類・コスト最適タスク・SEOキーワード生成・RAGコンシェルジュ応答 |
| A/Bテスト | gemini-2.5-pro / gpt-4.1 | 精度比較用（マルチプロバイダー） |
| エージェントSDK | Anthropic SDK + MCP SDK | 13 MCPサーバーとの通信 |
| 埋め込み | voyage-3（1024次元） | pgvector RAG + 動画品質ログ + 反響パターンベクトル化 |
| AI SDK | Vercel AI SDK v4 | LPチャット SSEストリーミング |
| 動画編集MCP | OpenCut MCP Controller | スライドショー型動画自動編集 |
| AI動画生成MCP | Higgsfield MCP（30+モデル内包） | VideoGeneratorRouter経由 |
| **動画フォールバック1** | **Runway Gen-4 API** | **Higgsfield障害時の自動切替（ADR-090）** |
| **動画フォールバック2** | **Kling AI API** | **Runway障害時の自動切替（ADR-090）** |

### B.4 SNSサムネイル生成

| 技術 | バージョン | 用途 |
|------|-----------|------|
| sharp | 0.33.x | ベース画像リサイズ・フォーマット変換・合成 |
| @napi-rs/canvas | 最新 | Node.js高速Canvas（sharp連携） |
| Google Fonts API / Noto Sans JP | — | 日本語フォント埋め込み |
| Claude Vision API | — | 写真の被写体認識・最適クロップ位置判定 |

### B.5 ファイル解析・3D変換

| 技術 | バージョン | 用途 |
|------|-----------|------|
| pdfjs-dist | 4.x | PDF テキスト抽出・ページ画像化 |
| dxf-parser | 1.1.x | DXF CAD図面解析 |
| LibreOffice headless | 最新 | DWG → DXF変換 |
| @thatopen/web-ifc | 0.0.68 | IFC BIM WASM解析 |
| chardet | 2.x | 日本語CAD Shift-JIS文字化け防止 |
| FloorplanVLM | — | 間取り図PNG→構造JSON（92.52% IoU）※ライセンス要確認 |
| Apple SHARP | — | 写真1枚→Gaussian Splat（<1秒・OSS） |
| MASt3R-SLAM | — | RGB動画→点群（Phase 2） |

### B.6 Web Workers（9ワーカー）

| Worker | ファイル | 処理内容 |
|--------|---------|---------|
| ThumbnailWorker | thumbnail.worker.ts | SNSサムネイル並列生成 |
| TerrainWorker | terrain.worker.ts | GeoTIFF / PLATEAUパース |
| GlbWorker | gltf.worker.ts | Draco / GLBデコード |
| GaussianWorker | gaussian.worker.ts | PLY後処理・SPZ4変換 |
| ValidationWorker | validation.worker.ts | Zod同期ブロッキング防止 |
| SemanticWorker | semantic.worker.ts | SegFormer WASM推論 |
| UsdWorker | usd.worker.ts | USDパース・GLB変換 |
| FloorplanWorker | floorplan.worker.ts | FloorplanVLM推論・ProceduralMesh |
| ImageWorker | image.worker.ts | sharp・バッチ処理 |

### B.7 不採用技術（確定）

| 技術 | 不採用理由 | ADR |
|------|-----------|-----|
| Clerk | 日本リージョン不明確 → Supabase Auth | ADR-013 |
| BullMQ + ioredis | Redis不要 → pg-boss 10.x | ADR-046 |
| Sentry / LogRocket | 外部サービス個人情報送信リスク → 内製 + OpenTelemetry | ADR-091 |
| Pinecone | 外部依存 → Supabase pgvector | — |
| Genie 3 | ゲーム向け・米国限定 | ADR-025 |
| Remotion | 3DカメラトラベルとRemotionの統合未検証 | — |
| Theatre.js | WebGPU相性問題・メンテ低下 | — |
| World Model | 不動産LPにオーバースペック | — |

---

## Part C — システムアーキテクチャ {#part-c}

### C.1 全体構成図（v10.0）

```
┌─────────────────────────────────────────────────────────────┐
│                   SisliR v10.0 全体像                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Asset Storage Layer                       │  │
│  │  [Local: Source of Truth]    [Cloud: Public Cache]    │  │
│  │  HDD1: D:\SisliR_Projects    Cloudflare R2            │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Digital Twin Layer（OpenUSD中心）              │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   PropertyIntakeAgent（Claude Sonnet 4）               │  │
│  │         13 MCPサーバー + pg-boss                       │  │
│  │  [コア] mcp_sisliR_db / storage / pdf / image          │  │
│  │         mcp_sisliR_lp / portal / doc / video / usd    │  │
│  │  [集客] mcp_sisliR_thumbnail / seo / distribute       │  │
│  │  [計測] mcp_sisliR_analytics                          │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Event Driven Layer                           │  │
│  │  PropertyImported → PhotoRetouched → LpGenerated      │  │
│  │  ThumbnailGenerated → VideoGenerated → LeadCreated    │  │
│  │  ImprovementTriggered → AgentJobCompleted             │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              成果物配信レイヤー                          │  │
│  │  3D LP / 動画 / SNS / PDF / ポータル                   │  │
│  │  SNSサムネイルセット（全プラットフォーム）               │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Growth Loop Layer                              │  │
│  │  集客エンジン → 反響計測 → 学習 → 自動改善              │  │
│  │  UTM追跡 / leads / ab_variants / improvement_queue    │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   Observability Layer（v10.0新規）                     │  │
│  │  OpenTelemetry → Grafana Cloud（Traces / Metrics）     │  │
│  │  Grafana Loki（Logs）/ Grafana Alerting               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### C.2 LLMプロバイダー抽象化

```typescript
// lib/ai/provider.ts
type AITask =
  | 'extraction'     // PDF・図面からの情報抽出
  | 'copy'           // キャッチコピー・説明文生成
  | 'pbr'            // PBRマテリアル推定
  | 'classification' // 分類タスク
  | 'video_prompt'   // 動画プロンプト生成
  | 'quality_score'  // 品質スコアリング

export async function callAI(params: {
  task:    AITask
  system:  string
  user:    string
  images?: string[]  // base64
}): Promise<string> {
  const model = params.task === 'classification'
    ? 'claude-haiku-4-5-20251001'
    : 'claude-sonnet-4-20250514'

  // OpenTelemetryスパン開始（Part BB参照）
  const span = tracer.startSpan(`ai.${params.task}`, {
    attributes: { 'ai.model': model, 'ai.task': params.task }
  })

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    })
    span.setStatus({ code: SpanStatusCode.OK })
    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (e) {
    span.recordException(e as Error)
    span.setStatus({ code: SpanStatusCode.ERROR })
    throw e
  } finally {
    span.end()
  }
}
```

### C.3 マルチテナントアーキテクチャ

```
テナント（不動産会社）
    ├── エージェント（担当者）
    │     └── Supabase Auth user_id と紐付け
    ├── 物件 → scenes → property_embeddings
    ├── leads → utm_tracking → ab_variants
    └── RLS: tenant_idで完全分離（全テーブル）

テナント間データ漏洩防止:
  - 全テーブルにROW LEVEL SECURITY有効化
  - tenant_isolationポリシー（auth.uid() → tenant_id取得）
  - マルチテナントRLS侵害テスト（Part AA参照）
```

---

## Part D — アセット管理 & ストレージ設計 {#part-d}

### D.1 ストレージ階層

```
[Layer 1] ローカルHDD（Source of Truth）
  HDD1: D:\SisliR_Projects\  ← 運用
  HDD2: E:\SisliR_Backup\    ← ローカルバックアップ
  将来: NAS → Backblaze B2（4重化）

[Layer 2] Cloudflare R2（公開キャッシュ）
[Layer 3] Supabase PostgreSQL（メタデータ）
```

### D.2 案件フォルダ構成（v10.0）

```
D:\SisliR_Projects\
└── 2026-001_相武台新築\
    ├── 01_Photos\           元写真（RAW / JPEG）
    ├── 02_Videos\           撮影動画
    ├── 03_FloorPlans\       間取り図（PDF / PNG / DXF）
    ├── 04_PDF\              販売図面・仕様書
    ├── 05_Retouched\        補正済み写真（sharp出力）
    ├── 06_OpenUSD\          デジタルツイン（USDA / USDC / USDZ）
    ├── 07_SPZ\              Gaussian Splat（SPZ4 / SOG）
    ├── 08_SceneJSON\        Scene JSON v10.0
    ├── 09_LP_Source\        LP ソースコード
    ├── 10_Video_Source\     動画素材・プロジェクト
    ├── 11_Instagram\        SNSコンテンツ（縦型 9:16）
    ├── 12_YouTube\          動画（横型 16:9）
    ├── 13_PDF_Brochure\     パンフレットPDF
    ├── 14_Delivery\         納品物
    ├── 15_Archive\          アーカイブ
    ├── 16_Thumbnails\       SNSサムネイルセット
    │     ├── instagram_feed_1080x1080\
    │     ├── instagram_story_1080x1920\
    │     ├── youtube_thumbnail_1280x720\
    │     ├── youtube_short_1080x1920\
    │     ├── x_post_1200x675\
    │     ├── line_timeline_1200x630\
    │     └── ogp_1200x630\
    ├── 17_SEO\              構造化データ・サイトマップ
    └── 18_Analytics\        反響ログ・UTMレポート
```

### D.3 R2キー設計

```
properties/{propertyId}/
  photo_raw/
  photo_processed/
  thumbnail/
    ogp.webp                1200×630 OGP用
    portal.jpg              640×480 ポータル用
    instagram_feed.webp     1080×1080
    instagram_story.webp    1080×1920
    youtube_thumb.webp      1280×720
    youtube_short.webp      1080×1920
    x_post.webp             1200×675
    line_timeline.webp      1200×630（JPEG）
  floor_plan/
  spec_pdf/
  video/
    slideshow.mp4
    cinematic.mp4（オプション）
  splat/
    full.spz4
    streamed/（仮想展示場用・Phase 2）
  usd/
    scene.usdc
    scene.usdz
  lp/
    scene.min.json
  pamphlet/
    pamphlet.pdf
  portal/
    suumo.csv
    athome.csv
  seo/
    structured_data.json
    sitemap_entry.xml
    video_sitemap_entry.xml
```

---

## Part E — Scene JSON v10.0 完全スキーマ + マイグレーション戦略 {#part-e}

### E.1 コアスキーマ

```typescript
// shared/schemas/scene.ts
import { z } from 'zod'

// ── 物件タイプ ────────────────────────────────────────────────
export const PropertyTypeSchema = z.enum([
  'newBuild',     // 新築戸建て
  'land',         // 分譲地
  'preowned',     // 中古戸建て
  'landSingle',   // 土地（単独）
  'modelHouse',   // 注文住宅モデルハウス
])

// ── SNSサムネイル設定 ─────────────────────────────────────────
export const ThumbnailPlatformSchema = z.enum([
  'instagram_feed',    // 1080×1080
  'instagram_story',   // 1080×1920
  'youtube_thumb',     // 1280×720
  'youtube_short',     // 1080×1920
  'x_post',            // 1200×675
  'line_timeline',     // 1200×630
  'ogp',               // 1200×630
])

export const ThumbnailStyleSchema = z.enum([
  'luxury',     // 高級感・暗めのオーバーレイ・ゴールドテキスト
  'fresh',      // 爽やか・白系・明るいトーン
  'minimal',    // ミニマル・テキスト少なめ
  'energetic',  // 強調色・大きいテキスト・アクションドリブン
])

export const ThumbnailConfigSchema = z.object({
  style:             ThumbnailStyleSchema.default('fresh'),
  showPrice:         z.boolean().default(true),
  showLayout:        z.boolean().default(true),
  showAccess:        z.boolean().default(true),
  showLogo:          z.boolean().default(true),
  overlayOpacity:    z.number().min(0).max(1).default(0.45),
  primaryColor:      z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
  accentColor:       z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#D4A853'),
  fontFamily:        z.enum(['noto_sans', 'noto_serif', 'zen_kaku']).default('noto_sans'),
  generatedPlatforms: z.array(ThumbnailPlatformSchema).default([]),
})

// ── SNSアセット ──────────────────────────────────────────────
export const SnsAssetsSchema = z.object({
  instagramFeedUrl:    z.string().url().optional(),
  instagramStoryUrl:   z.string().url().optional(),
  youtubeThumbnailUrl: z.string().url().optional(),
  youtubeShortUrl:     z.string().url().optional(),
  xPostUrl:            z.string().url().optional(),
  lineTimelineUrl:     z.string().url().optional(),
  ogpUrl:              z.string().url().optional(),
})

// ── SEO設定 ─────────────────────────────────────────────────
export const SeoConfigSchema = z.object({
  metaTitle:          z.string().max(60).optional(),
  metaDescription:    z.string().max(160).optional(),
  keywords:           z.array(z.string()).max(10).default([]),
  structuredDataJson: z.string().optional(),
  canonicalUrl:       z.string().url().optional(),
  ogTitle:            z.string().max(60).optional(),
  ogDescription:      z.string().max(160).optional(),
  youtubeTitle:       z.string().max(100).optional(),
  youtubeDescription: z.string().max(5000).optional(),
  youtubeHashtags:    z.array(z.string()).max(15).default([]),
})

// ── A/Bバリアント ────────────────────────────────────────────
export const AbVariantSchema = z.object({
  variantId:        z.string().uuid().optional(),
  variantName:      z.string().max(30).optional(),
  catchCopyVariant: z.string().max(40).optional(),
  heroImageVariant: z.string().url().optional(),
  ctaLabelVariant:  z.string().max(20).optional(),
})

// ── リード設定 ───────────────────────────────────────────────
export const LeadConfigSchema = z.object({
  lineOfficialAccountId: z.string().optional(),
  inquiryFormUrl:        z.string().url().optional(),
  reservationFormUrl:    z.string().url().optional(),
  phoneNumber:           z.string().optional(),
  ctaLabel:              z.string().max(20).default('お問い合わせ'),
  ctaStyle:              z.enum(['line', 'form', 'phone', 'multi']).default('form'),
})

// ── ダイナミックLP設定 ────────────────────────────────────────
export const AdCreativeAxisSchema = z.enum([
  'living', 'exterior', 'price', 'access', 'floor_plan', 'family', 'default'
])

export const DynamicLpVariantSchema = z.object({
  axis:             AdCreativeAxisSchema,
  heroImageUrl:     z.string().url().optional(),
  catchCopy:        z.string().max(40),
  subCopy:          z.string().max(80).optional(),
  sectionOrder:     z.array(z.string()).default([]),
  ctaLabel:         z.string().max(20).optional(),
  ctaStyle:         z.enum(['line', 'form', 'phone', 'multi']).optional(),
  highlightSection: z.string().optional(),
})

export const DynamicLpConfigSchema = z.object({
  enabled:  z.boolean().default(false),
  variants: z.array(DynamicLpVariantSchema).max(8).default([]),
  fallback: DynamicLpVariantSchema.optional(),
})

// ── 物件基本情報 ─────────────────────────────────────────────
export const PropertyInfoSchema = z.object({
  propertyType:     PropertyTypeSchema,
  name:             z.string(),
  address:          z.string(),
  prefCode:         z.string().optional(),
  pref:             z.string().optional(),
  city:             z.string().optional(),
  ward:             z.string().optional(),
  price:            z.number().optional(),
  landArea:         z.number().optional(),
  buildingArea:     z.number().optional(),
  layout:           z.string().optional(),
  access:           z.string().optional(),
  builtYear:        z.number().int().optional(),
  structure:        z.string().optional(),
  catchCopy:        z.string().max(40).optional(),
  description:      z.string().max(600).optional(),
  features:         z.array(z.string()).max(5).default([]),
  transactionType:  z.string().optional(),
  realtorLicense:   z.string().optional(),
  legalDisclaimer:  z.string().optional(),
  agencyName:       z.string().optional(),
})

// ── アセット ─────────────────────────────────────────────────
export const SceneAssetsSchema = z.object({
  heroImageUrl:       z.string().url().optional(),
  galleryUrls:        z.array(z.string().url()).max(20).default([]),
  videoSlideshowUrl:  z.string().url().optional(),
  videoCinematicUrl:  z.string().url().optional(),
  spz4Url:            z.string().url().optional(),
  sogManifestUrl:     z.string().url().optional(),
  usdzUrl:            z.string().url().optional(),
  pamphletUrl:        z.string().url().optional(),
  floorPlanUrl:       z.string().url().optional(),
  snsAssets:          SnsAssetsSchema.default({}),
})

// ── 生成ステータス ────────────────────────────────────────────
const GenStatus = z.enum(['pending', 'processing', 'done', 'error'])

export const GenerationStatusSchema = z.object({
  photo:        GenStatus.default('pending'),
  thumbnail:    GenStatus.default('pending'),
  portalSuumo:  GenStatus.default('pending'),
  portalAthome: GenStatus.default('pending'),
  lp:           GenStatus.default('pending'),
  seo:          GenStatus.default('pending'),
  videoSlide:   GenStatus.default('pending'),
  videoCinematic: GenStatus.default('pending'),
  sns:          GenStatus.default('pending'),
  distribution: GenStatus.default('pending'),
  pamphlet:     GenStatus.default('pending'),
  threed:       GenStatus.default('pending'),
  usdz:         GenStatus.default('pending'),
})

// ── ホットスポット ────────────────────────────────────────────
export const HotspotSchema = z.object({
  id:          z.string().uuid(),
  position:    z.object({ x: z.number(), y: z.number(), z: z.number() }),
  label:       z.string().max(20),
  description: z.string().max(200).optional(),
  imageUrl:    z.string().url().optional(),
  category:    z.enum(['room', 'equipment', 'view', 'feature']),
})

// ── カメラツアー ─────────────────────────────────────────────
export const TourConfigSchema = z.object({
  id:    z.string().uuid(),
  name:  z.string().max(30),
  stops: z.array(z.object({
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    target:   z.object({ x: z.number(), y: z.number(), z: z.number() }),
    duration: z.number().min(0.5).max(10),
    label:    z.string().max(20).optional(),
  })).max(20),
})

// ── PostFX ───────────────────────────────────────────────────
export const PostFXConfigSchema = z.object({
  preset:   z.enum(['none', 'fresh', 'cinematic', 'vintage', 'luxury']).default('none'),
  bloom:    z.number().min(0).max(1).default(0),
  vignette: z.number().min(0).max(1).default(0),
  grade:    z.enum(['neutral', 'warm', 'cool', 'gold']).default('neutral'),
})

// ── AI設定 ───────────────────────────────────────────────────
export const AIConfigSchema = z.object({
  chatEnabled:      z.boolean().default(false),
  chatPersonality:  z.string().max(200).optional(),
  humanReviewed:    z.boolean().default(false),
  reviewedAt:       z.string().datetime().optional(),
  reviewedBy:       z.string().optional(),
})

// ── Scene JSON メインスキーマ（v10.0）────────────────────────
export const SceneSchema = z.object({
  version:     z.literal('10.0.0'),
  sceneId:     z.string().uuid(),
  propertyId:  z.string().uuid(),
  agencyId:    z.string().uuid(),

  property:     PropertyInfoSchema,
  assets:       SceneAssetsSchema.default({}),
  hotspots:     z.array(HotspotSchema).max(25).default([]),
  tours:        z.array(TourConfigSchema).max(5).default([]),
  postFX:       PostFXConfigSchema.default({}),
  ai:           AIConfigSchema.default({}),
  floorplanVlm: z.any().optional(),
  genStatus:    GenerationStatusSchema.default({}),

  thumbnailConfig: ThumbnailConfigSchema.default({}),
  seoConfig:       SeoConfigSchema.default({}),
  abVariant:       AbVariantSchema.optional(),
  leadConfig:      LeadConfigSchema.default({}),
  dynamicLp:       DynamicLpConfigSchema.default({}),

  createdAt:   z.string().datetime(),
  updatedAt:   z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
})

export type SceneConfig = z.infer<typeof SceneSchema>
```

### E.2 マイグレーション戦略（v10.0確定）

#### E.2.1 後方互換性ポリシー

```
原則: Scene JSONスキーマへの変更は「非破壊的追加のみ」を許可する。

許可される変更:
  ✅ 新フィールドの追加（オプショナル or デフォルト値あり）
  ✅ 既存enumへの新値追加（既存値を変更しない）
  ✅ 既存フィールドの最大値制約の緩和（例: max(20) → max(25)）

禁止される変更（メジャーバージョンアップが必要）:
  ❌ 既存フィールドの削除
  ❌ 既存フィールドの型変更
  ❌ 既存enumの値変更・削除
  ❌ 必須フィールドの追加（既存データが壊れる）
  ❌ 既存フィールドの最大値制約の厳格化
```

#### E.2.2 Drizzle migration SQLテンプレート

```sql
-- ===================================================
-- Scene JSON バージョンアップ用マイグレーションテンプレート
-- ファイル命名規則: YYYYMMDD_scene_vX_X_upgrade.sql
-- ===================================================

-- Step 1: scenes テーブルの新カラム追加（NULLABLE のみ）
-- ALTER TABLE scenes ADD COLUMN IF NOT EXISTS new_field TEXT;

-- Step 2: scene_json内の新フィールドにデフォルト値を設定するバッチ更新
-- （大量レコードは1000件ずつ分割実行してロックを避ける）
DO $$
DECLARE
  batch_size INT := 1000;
  offset_val INT := 0;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE scenes
    SET scene_json = jsonb_set(
      scene_json,
      '{version}',
      '"10.0.0"'
    )
    WHERE id IN (
      SELECT id FROM scenes
      WHERE (scene_json->>'version') != '10.0.0'
      LIMIT batch_size OFFSET offset_val
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    offset_val := offset_val + batch_size;
    PERFORM pg_sleep(0.1); -- 過負荷防止
  END LOOP;
END $$;

-- Step 3: バージョン検証（全レコードが新バージョンに移行済みか確認）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM scenes
    WHERE (scene_json->>'version') NOT IN ('8.0.0', '9.0.0', '9.1.0', '10.0.0')
  ) THEN
    RAISE EXCEPTION '未知のSceneJSONバージョンが存在します。移行を中止してください。';
  END IF;
END $$;
```

#### E.2.3 バージョン別読み込みアダプター

```typescript
// lib/schema/SceneAdapter.ts
// 古いバージョンのScene JSONを現行スキーマに変換する

export function adaptSceneJson(raw: Record<string, unknown>): SceneConfig {
  const version = raw.version as string | undefined

  // v8.0 → v10.0 変換
  if (!version || version.startsWith('8.')) {
    raw.version = '10.0.0'
    raw.thumbnailConfig = raw.thumbnailConfig ?? {}
    raw.seoConfig = raw.seoConfig ?? {}
    raw.leadConfig = raw.leadConfig ?? {}
    raw.dynamicLp = raw.dynamicLp ?? { enabled: false, variants: [] }
    // genStatus に新フィールド追加
    const gs = raw.genStatus as Record<string, string> ?? {}
    gs.thumbnail = gs.thumbnail ?? 'pending'
    gs.seo = gs.seo ?? 'pending'
    gs.distribution = gs.distribution ?? 'pending'
    raw.genStatus = gs
  }

  // v9.0 / v9.1 → v10.0 変換
  if (version?.startsWith('9.')) {
    raw.version = '10.0.0'
    raw.dynamicLp = raw.dynamicLp ?? { enabled: false, variants: [] }
    // property に位置情報フィールドを追加
    const prop = raw.property as Record<string, unknown> ?? {}
    prop.prefCode = prop.prefCode ?? undefined
    prop.pref = prop.pref ?? undefined
    prop.city = prop.city ?? undefined
    prop.ward = prop.ward ?? undefined
    raw.property = prop
  }

  return SceneSchema.parse(raw)
}
```

#### E.2.4 Zodバリデーションの互換モード

```typescript
// lib/schema/validateScene.ts
// 本番ではstrictモード、マイグレーション中はlenientモードを使用

export function validateScene(
  raw: unknown,
  mode: 'strict' | 'lenient' = 'strict'
): { success: true; data: SceneConfig } | { success: false; error: string } {
  if (mode === 'lenient') {
    // 古いバージョンのJSONは一度adaptしてから検証
    const adapted = adaptSceneJson(raw as Record<string, unknown>)
    return { success: true, data: adapted }
  }

  const result = SceneSchema.safeParse(raw)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: result.error.message }
}
```
