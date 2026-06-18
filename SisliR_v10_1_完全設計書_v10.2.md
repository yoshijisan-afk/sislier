# SisliR 完全設計書 v10.2
## AI住宅マーケティングOS + 住宅デジタルツイン基盤
## 集客・反響・改善ループ統合版 — テスト・可観測性・運用・OrchestrationLoop完全版

> **Confidential** | 2026年6月 | v10.2.0
>
> ### v10.2 更新内容（2026-06-13）
>
> | 変更点 | 内容 |
> |--------|------|
> | AIモデル文字列更新 | `claude-sonnet-4-20250514` → `claude-sonnet-4-6`、`claude-haiku-4-5-20251001` → `claude-haiku-4-5` |
> | claude-opus-4-6追加 | 高精度AI枠として限定使用（複雑法令チェック・高単価物件コピー） |
> | 埋め込みモデル更新 | `voyage-3` → `voyage-3-large`（同コスト帯で精度+3%） |
> | 画像生成枠明記 | `gpt-image-1`をB.3表に追記（Part SS ADR-170） |
> | B.1 3Dエンジン表記修正 | 「Three.js r184 WebGPU」→「Three.js r184（WebGPURenderer標準・WebGL2自動フォールバック、ADR-162.1）」 |
> | B.7 不採用技術追記 | WebGLRenderer単独・voyage-3無印を追加 |
> | Part B見出し更新 | v10.0確定版 → v10.2確定版 |
> | partOO / partMM / partDD | AIモデル文字列・Three.js表記の整合（別ファイル更新分と同期） |
>
> ### v10.0 統合方針
>
> | ソース | 採用内容 |
> |--------|---------|
> | v8.0（完全設計書） | Part A〜R の全設計（基盤・技術スタック・アーキテクチャ） |
> | v9.0（集客・反響追加） | Part S〜V（SNSサムネイル・SEO・反響計測・自動改善ループ） |
> | v9.1（追補） | Part W〜Y（ダイナミックLP・セクション計測・VideoSitemap） |
> | v9.1-Z（ポータル・CMS） | Part Z（反響CMS・チャネル取り込み・ポータル設計） |
> | v10.0（新規追加） | Part AA（テスト戦略）・Part BB（可観測性）・Part CC（運用・障害対応）・全設計のクリティカル課題修正 |
> | v10.1（本書・新規追加） | Part DD（OrchestrationLoop設計）・Part EE（ループテスト戦略）・Part FF（v10.1サマリー）・ADR-101〜105 |
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
> | OrchestrationLoop設計を追加（v10.1） | 自律的シグナル検知・AgentLoop起動・Haltingポリシー |
> | Skill Library設計を追加（v10.1） | ループから呼ばれる再利用可能スキル群の定義 |
> | ループHaltingポリシーを追加（v10.1） | 無限ループ・コスト爆発を設計レベルで防止（ADR-102） |
> | LoopCostTrackerを追加（v10.1） | リアルタイムコスト追跡・自動停止（ADR-101） |
> | LOOP_EMERGENCY_STOP緊急停止を追加（v10.1） | 環境変数1つで全ループ即停止 |
> | ループ固有テスト戦略を追加（v10.1） | 無限ループ検知・重複起動防止・コスト爆発テスト |
> | ADR-101〜105を追加（v10.1） | OrchestrationLoop設計の確定決定5件 |

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
- [**Part DD — OrchestrationLoop設計（v10.1新規）**](#part-dd)
- [**Part EE — ループテスト戦略（v10.1新規）**](#part-ee)
- [**Part FF — v10.1アップデートサマリー（v10.1新規）**](#part-ff)
- [**Part GG — ポータル自動入力 Chrome拡張機能設計（v10.1追加）**](#part-gg)

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
| 建築前物件3D | ✗ | ✗ 要撮影 | ✗ | ★★★★★ Claude Vision間取り解析 |
| デジタルツイン | ✗ | △ | ✗ | ★★★★★ OpenUSD中心 |
| AI動画自動生成 | ✗ | ✗ | ✗ | ★★★★★ VideoGeneratorRouter |
| Gaussian Splat | ✗ | ✗ | △ | ★★★★★ SPZ4 + SOG |
| AR内覧 | ✗ | △ 専用アプリ | ✗ | ★★★★★ WebXR + USDZ |
| 反響計測・A/Bテスト | △ 外部ツール | ✗ | ✗ | ★★★★★ 内製完結 |
| BIM連携 | ✗ | ✗ | ✗ | ★★★★★ IFC → OpenUSD |
| 宅建業法準拠 | △ | ✗ | ✗ | ★★★★★ 完全自動準拠 |
| **可観測性・運用設計** | **—** | **—** | **—** | **★★★★★ OpenTelemetry完全統合** |

---

## Part B — 技術スタック v10.2確定版 {#part-b}

> **v10.2更新（2026-06-13）**: AIモデル文字列を最新版に更新（claude-sonnet-4-6 / claude-haiku-4-5）。
> claude-opus-4-6を高精度AI枠として追加（限定使用）。voyage-3 → voyage-3-large に更新。
> gpt-image-1を画像生成枠として明記（Part SS ADR-170）。
> Three.js WebGPURenderer標準（ADR-162.1）をスタック表に反映。

### B.1 フロントエンド

| カテゴリ | 技術 | バージョン | 選定根拠 |
|----------|------|-----------|---------| 
| 言語 | TypeScript | 5.x | 型安全性。Scene JSONスキーマに必須 |
| フレームワーク | React | 19.x | Concurrent Mode + React Compiler自動メモ化 |
| ビルドツール | Vite | 6.x | ESM Native / HMR高速 / Terser難読化 |
| 3Dエンジン | Three.js r184 | r184 | **WebGPURenderer標準・WebGL2自動フォールバック（ADR-162.1）** |
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
| Vector DB | pgvector（Supabase） | 最新 | voyage-3-large RAG + 動画品質ログ + 反響パターンベクトル化（ADR: voyage-3-largeを標準採用） |
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
| コアAI | claude-sonnet-4-6 | PropertyIntakeAgent・コピー生成・図面解析・動画プロンプト・品質判定・サムネイルデザイン指示 |
| 軽量AI | claude-haiku-4-5 | 単純分類・コスト最適タスク・SEOキーワード生成・RAGコンシェルジュ応答 |
| 高精度AI（要所） | claude-opus-4-6 | 複雑な法令チェック・高単価物件コピー・品質最終判定（コスト管理下で限定使用） |
| A/Bテスト | gemini-2.5-pro / gpt-4.1 | 精度比較用（マルチプロバイダー） |
| 画像生成 | gpt-image-1（ChatGPT 4o） | 背景差し替え・空演出・3Dアイソメ化（Part SS ADR-170） |
| エージェントSDK | Anthropic SDK + MCP SDK | 13 MCPサーバーとの通信 |
| 埋め込み | voyage-3-large（1024次元） | pgvector RAG + 動画品質ログ + 反響パターンベクトル化（voyage-3より精度+3%） |
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
| Claude Vision（FloorplanAnalyzer） | — | 間取り図PNG→構造JSON（75〜85% IoU・ADR-144でFloorplanVLM廃止） |
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
| FloorplanWorker | floorplan.worker.ts | Claude Vision間取り解析・ProceduralMesh |
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
| WebGLRenderer単独 | 2026年6月時点で主要4ブラウザWebGPU既定出荷。WebGL2のみはパフォーマンス・Splat品質で劣後 | ADR-162.1 |
| voyage-3（無印） | voyage-3-largeが同コスト帯で精度+3%。新規実装はlargeを使用 | — |

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
    ? 'claude-haiku-4-5'
    : 'claude-sonnet-4-6'

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
---

## Part F — PropertyIntakeAgent & MCPサーバー設計 + べき等性設計 {#part-f}

### F.1 エージェント実行フロー

```
[トリガー]
ダッシュボード アップロード / Google Drive連携 / API POST
        │
        ▼
[pg-boss ジョブキュー]
  job: 'property-intake-agent'
  retryLimit: 3 / retryDelay: exponential
        │
        ▼
[PropertyIntakeAgent（Claude Sonnet 4 + MCP 13サーバー）]

  Step 1: PDF解析
    extract_sales_sheet  → 販売図面から基本情報
    extract_spec_sheet   → 仕様書から設備・素材
    extract_floor_plan   → 間取り図から構造JSON

  Step 2: 写真処理
    process_photos       → プロ仕様補正・WebP変換
    generate_thumbnail   → OGP / ポータル / SNS用
    analyze_hero_photo   → Claude Vision でベスト写真選定・最適クロップ位置判定

  Step 3: SNSサムネイル生成
    generate_sns_thumbnails → 全プラットフォーム向けサムネイル一括生成

  Step 4: テキスト生成（Claude API）
    キャッチコピー（20〜35文字・宅建業法準拠）
    物件説明文（300〜500文字）
    特徴3点（購入動機直結）
    SEOメタタイトル・ディスクリプション
    YouTubeタイトル・説明文・ハッシュタグ
    ダイナミックLP軸別キャッチコピー（7軸）

  Step 5: SEO設定
    generate_structured_data     → schema.org/PropertyListing JSON-LD生成
    generate_sitemap_entry       → テキストサイトマップエントリ生成
    generate_video_sitemap_entry → VideoSitemapエントリ生成（動画完了後に実行）

  Step 6: 成果物生成（並列実行）
    generate_suumo_data  → SUUMO入稿CSV
    generate_athome_data → アットホーム入稿CSV
    generate_lp          → LP生成・公開URL発行
    generate_pamphlet    → パンフレットPDF
    generate_video       → 動画（VideoGeneratorRouter経由）

  Step 7: UTM付与・配信準備
    assign_utm_params    → 全成果物URLにUTMパラメータ自動付与
    schedule_distribution → SNS投稿スケジュール登録

  Step 8: ステータス更新 + 完了通知
        │
        ▼
[成果物: R2 + Supabase + メール通知]
```

### F.2 べき等性マトリクス（v10.0新規・必読）

エージェントの各Stepが中断後に再実行されても安全かを定義する。
**pg-bossのリトライ（最大3回・指数バックオフ）時にこのマトリクスに従う。**

| Step | 処理内容 | べき等性 | 再実行安全性 | 再開戦略 |
|------|---------|---------|------------|---------|
| Step 1 | PDF解析・PropertyInfo生成 | ✅ べき等 | ✅ 安全 | 同一PDF → 同一出力。再実行可 |
| Step 2 | 写真補正・WebP変換 | ✅ べき等 | ✅ 安全 | 出力ファイルが既存の場合はスキップ（R2キー存在チェック） |
| Step 3 | SNSサムネイル生成 | ✅ べき等 | ✅ 安全 | platform別にR2キー存在チェック。生成済みはスキップ |
| Step 4 | テキスト生成 | ⚠️ 非べき等 | ⚠️ 要注意 | 生成済み（genStatus.copy='done'）の場合はスキップ。AI出力は毎回異なる可能性あり → 承認フロー推奨 |
| Step 5 | SEO設定 | ✅ べき等 | ✅ 安全 | seo_configsテーブルをUPSERT（ON CONFLICT DO UPDATE） |
| Step 6-LP | LP生成 | ⚠️ 非べき等 | ⚠️ 要注意 | genStatus.lp='done'の場合はスキップ。URL変更には手動承認が必要 |
| Step 6-CSV | CSV生成 | ✅ べき等 | ✅ 安全 | 同一PropertyInfo → 同一CSV。R2上書きで問題なし |
| Step 6-動画 | 動画生成（外部MCP） | ❌ 非べき等 | ❌ 注意 | genStatus.videoSlide='done'の場合はスキップ。Higgsfield課金が発生するため必須 |
| Step 6-PDF | パンフレット生成 | ✅ べき等 | ✅ 安全 | Puppeteer HTML→PDF。R2上書き可 |
| Step 7 | UTM付与・配信スケジュール | ✅ べき等 | ✅ 安全 | UTMは決定論的生成（propertyId基準）。重複スケジュール → UNIQUEキー制約で防止 |
| Step 8 | ステータス更新・通知 | ✅ べき等 | ✅ 安全 | UPSERTとメール重複送信防止（notif_sent フラグ） |

#### F.2.1 部分成功からの再開実装

```typescript
// lib/agent/PropertyIntakeAgent.ts

export class PropertyIntakeAgent {
  async run(input: { propertyId: string; uploadedFiles: UploadedFile[] }): Promise<void> {
    const span = tracer.startSpan('agent.property_intake', {
      attributes: { 'property.id': input.propertyId }
    })

    try {
      // 現在のgenStatusを取得（再開ポイントの判定に使用）
      const currentStatus = await this.getGenStatus(input.propertyId)

      // Step 1: PDF解析（常に実行可能）
      const propertyInfo = await this.runStep1_parse(input, currentStatus)

      // Step 2: 写真処理（未完了の場合のみ実行）
      if (currentStatus.photo !== 'done') {
        await this.runStep2_photos(input.propertyId, input.uploadedFiles)
      }

      // Step 3: SNSサムネイル（未完了の場合のみ実行）
      if (currentStatus.thumbnail !== 'done') {
        await this.runStep3_thumbnails(input.propertyId, propertyInfo)
      }

      // Step 4: テキスト生成（未完了の場合のみ実行）
      if (!this.isCopyGenerated(currentStatus)) {
        await this.runStep4_text(input.propertyId, propertyInfo)
      }

      // Step 5: SEO（未完了の場合のみ実行）
      if (currentStatus.seo !== 'done') {
        await this.runStep5_seo(input.propertyId, propertyInfo)
      }

      // Step 6: 成果物並列生成
      await this.runStep6_artifacts(input.propertyId, currentStatus)

      // Step 7: UTM・配信準備
      await this.runStep7_distribution(input.propertyId)

      // Step 8: 完了通知
      await this.runStep8_notify(input.propertyId)

      span.setStatus({ code: SpanStatusCode.OK })
    } catch (e) {
      span.recordException(e as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw e
    } finally {
      span.end()
    }
  }

  private async runStep6_artifacts(
    propertyId: string,
    status: GenerationStatus
  ): Promise<void> {
    // 動画生成: 課金発生のため完了済みチェックを厳格に
    if (status.videoSlide !== 'done') {
      const creditCheck = await this.checkHiggsfieldCredit(propertyId)
      if (creditCheck.sufficient) {
        await this.generateVideo(propertyId, 'slideshow')
      }
    }

    // LP・CSV・PDF は並列実行（それぞれべき等）
    await Promise.allSettled([
      status.lp !== 'done'          && this.generateLp(propertyId),
      status.portalSuumo !== 'done' && this.generateCsv(propertyId, 'suumo'),
      status.portalAthome !== 'done'&& this.generateCsv(propertyId, 'athome'),
      status.pamphlet !== 'done'    && this.generatePamphlet(propertyId),
    ].filter(Boolean))
  }
}
```

### F.3 MCPサーバー一覧（14サーバー）

| サーバー名 | 役割 | Phase |
|-----------|------|-------|
| `mcp_sisliR_db` | 物件DB・SceneJSON CRUD | 1 |
| `mcp_sisliR_storage` | ローカルHDD ↔ R2 操作 | 1 |
| `mcp_sisliR_pdf` | 図面・仕様書解析（Claude Vision間取り解析含む） | 1 |
| `mcp_sisliR_image` | 写真補正・変換・サムネイル | 1 |
| `mcp_sisliR_lp` | LP生成・公開URL発行 | 1 |
| `mcp_sisliR_portal` | SUUMO/アットホームCSV生成 | 1 |
| `mcp_sisliR_doc` | パンフレットPDF生成（Puppeteer） | 1 |
| `mcp_sisliR_video` | 動画生成（VideoGeneratorRouter経由） | 1 |
| `mcp_sisliR_usd` | OpenUSD変換・USDZ生成 | 1.5 |
| `mcp_sisliR_thumbnail` | SNSサムネイル生成（全プラットフォーム） | 1 |
| `mcp_sisliR_seo` | SEO構造化データ・VideoSitemap自動生成 | 1 |
| `mcp_sisliR_distribute` | SNS自動投稿スケジューラー | 2 |
| `mcp_sisliR_analytics` | 反響計測・UTM追跡・改善キュー | 2 |
| `mcp_sisliR_abtest` | ABテスト作成・統計的有意性計算・勝者デプロイ（Part QQ） | 2 |

### F.4 品質チェッカー

```typescript
// lib/agent/QualityChecker.ts
export class QualityChecker {
  checkCatchCopy(copy: string): { passed: boolean; violations: string[] } {
    const FORBIDDEN = ['最高', '一番', '完璧', '絶対', '必ず', '激安', '格安', 'No.1', '確約']
    const violations = FORBIDDEN.filter(w => copy.includes(w))
    return {
      passed: violations.length === 0 && copy.length >= 15 && copy.length <= 40,
      violations,
    }
  }

  checkSeoMeta(meta: { title: string; description: string }): { passed: boolean } {
    return {
      passed: meta.title.length >= 20 && meta.title.length <= 60
           && meta.description.length >= 50 && meta.description.length <= 160,
    }
  }
}
```

---

## Part G — 動画生成フロー（VideoGeneratorRouter + フォールバック） {#part-g}

### G.1 設計思想（責任分離）

```
意思決定・学習層: Claude Sonnet 4
  - プロンプト動的生成（pgvector RAG参照）
  - 品質スコアリング（Claude Vision）
  - 学習ループ（pgvectorに蓄積）
  - プロバイダー選択指示

ルーティング層: VideoGeneratorRouter
  - コスト上限チェック（テナントごとの月次上限）
  - 障害検知・フォールバック制御（3段フォールバック）
  - プロバイダー切り替え

レンダリング層: 外部MCP（交換可能）
  1. OpenCut MCP → スライドショー型（標準）
  2. Higgsfield MCP → AIシネマティック型（オプション・高コスト）
  3. Runway Gen-4 API → Higgsfield障害時フォールバック（ADR-090）
  4. Kling AI API → Runway障害時フォールバック（ADR-090）
  5. ffmpeg → 全外部サービス障害時の最終フォールバック

【採用しない設計】
  構造が変化するImage-to-Video は不採用。
  住宅の壁・柱・窓が変形するAI生成動画は
  不動産広告として使用不可（ADR-059）。
```

### G.2 VideoGeneratorRouter（フォールバック完全版）

```typescript
// lib/video/VideoGeneratorRouter.ts

export type VideoTrack = 'slideshow' | 'cinematic'

export interface VideoRequest {
  propertyId:  string
  track:       VideoTrack
  photoUrls:   string[]
  sceneJson:   SceneConfig
  tenantId:    string
  quality:     'standard' | 'premium'
}

export interface VideoResult {
  url:         string
  provider:    string
  durationSec: number
  cost:        number
}

export class VideoGeneratorRouter {
  async generate(req: VideoRequest): Promise<VideoResult> {
    const span = tracer.startSpan('video.generate', {
      attributes: { 'video.track': req.track, 'tenant.id': req.tenantId }
    })

    try {
      // コスト上限チェック
      if (req.track === 'cinematic') {
        const usage = await this.getCreditUsage(req.tenantId)
        if (usage.remaining <= 0) {
          span.addEvent('fallback.credit_exceeded', { reason: 'monthly_limit' })
          req.track = 'slideshow'
        }
      }

      // プロバイダー優先順位（slideshowとcinematicで異なる）
      const providers: VideoProvider[] =
        req.track === 'slideshow'
          ? [new OpenCutProvider(), new FfmpegProvider()]
          : [
              new HiggsfieldProvider(),
              new RunwayGen4Provider(),   // フォールバック1（ADR-090）
              new KlingAIProvider(),      // フォールバック2（ADR-090）
              new OpenCutProvider(),      // スライドショーに格下げ
              new FfmpegProvider(),       // 最終手段
            ]

      for (const provider of providers) {
        try {
          const healthy = await Promise.race([
            provider.healthCheck(),
            new Promise<false>((_, reject) =>
              setTimeout(() => reject(new Error('health_check_timeout')), 5000)
            ),
          ])
          if (!healthy) continue

          const result = await provider.generate(req)
          span.setAttributes({
            'video.provider': provider.name,
            'video.cost': result.cost,
          })
          span.setStatus({ code: SpanStatusCode.OK })
          return result
        } catch (e) {
          span.addEvent('provider.failed', {
            provider: provider.name,
            error: (e as Error).message,
          })
          // 次のプロバイダーへ
          continue
        }
      }

      throw new Error('全プロバイダーで動画生成に失敗しました')
    } finally {
      span.end()
    }
  }
}
```

### G.3 CinematicPromptBuilder（Claude意思決定層）

```typescript
// lib/video/CinematicPromptBuilder.ts
export class CinematicPromptBuilder {
  async build(sceneJson: SceneConfig, propertyId: string): Promise<string> {
    const similarPrompts = await this.searchSimilarPrompts(sceneJson.property, propertyId)
    return callAI({
      task:   'video_prompt',
      system: `あなたは不動産物件の動画プロンプト生成の専門家です。
過去の成功プロンプトを参考に、この物件に最適なシネマティック動画プロンプトを生成してください。
住宅の構造（壁・柱・窓）が変形・変化するような表現は絶対に含めないでください。`,
      user: `物件情報: ${JSON.stringify(sceneJson.property)}
過去の成功プロンプト例: ${JSON.stringify(similarPrompts)}`,
    })
  }
}
```

---

## Part H — ファイルインポートパイプライン {#part-h}

### H.1 対応フォーマットと精度評価

| 形式 | 精度 | 解析手法 | 3D出力 |
|------|------|---------|--------|
| IFC（BIM） | ★★★★★ | @thatopen/web-ifc WASM | GLB + USD直接生成 |
| PDF（テキスト層） | ★★★★★ | pdfjs-dist + Claude Documents API | Scene JSON自動生成 |
| PDF（スキャン図面） | ★★★★☆ | Claude Vision マルチモーダル | ProceduralMesh |
| 間取り図PNG/JPG | ★★★★☆ | Claude Vision（FloorplanAnalyzer・75〜85% IoU） | ProceduralMesh / 3D生成 |
| DXF（CAD） | ★★★★☆ | dxf-parser + chardet（Shift-JIS対応） | Three.js LineSegments |
| PLY / SPZ（Splat） | ★★★★★ | splat-transform直接処理 | Gaussian Splat LP |
| JPEG / PNG / WebP | ★★★★☆ | sharp前処理 + Claude Vision | ProceduralMesh |

### H.2 信頼度別フォールバック

| 信頼度 | 挙動 |
|--------|------|
| ≥ 0.90 | Scene JSON自動完成・LP即反映・公開可能 |
| 0.70〜0.89 | 警告バナー表示・確認済みまで公開ボタン無効 |
| 0.50〜0.69 | 解析できたフィールドのみ補完・要手動入力 |
| < 0.50 | 空テンプレート・エラー表示・サポートリンク |

### H.3 Claude Vision 間取り解析パイプライン（ADR-144）

```
間取り図 PNG / PDF
      ↓
Claude Vision（FloorplanAnalyzer・Part OO.6）
  ※ FloorplanVLMは商用ライセンス問題により廃止（ADR-144）
  ※ Claude Vision単独での間取り解析（精度75〜85% IoU）
  ※ 信頼度帯別ルーティング: ≥0.85 自動承認 / 0.60〜0.84 マスター確認 / <0.60 手動入力必須
      ↓
構造JSON（rooms / walls / openings）
      ↓
Claude API（素材推定・仕様書照合）
      ↓
ProceduralMesh（Three.js）← Phase 1
      ↓
GLB → SPZ4変換 → 既存パイプラインへ合流
```

---

## Part I — 3Dキャプチャ & 生成パイプライン {#part-i}

### I.1 キャプチャ推奨優先順位

```
【第0推奨】Claude Vision間取り解析経由（図面→3D）★★★★☆
  対象: 建築前物件・間取り図のみの既存物件
  入力: 間取り図PNG/JPG/PDF / 所要: 5〜20分（全自動）
  ※ ADR-144: FloorplanVLM廃止。Claude Vision（FloorplanAnalyzer）に完全移行

【第1推奨】Scaniverse（iPhone・無料）★★★★★
  20〜30分歩き撮り → SPZ直接出力 / 所要: 25〜35分

【第2推奨】Polycam（iPhone・フリーミアム）★★★★★
  LiDAR対応・PLY/SPZ/USDZ出力 / 所要: 30〜40分

【第3推奨】Apple SHARP（写真1枚→3D）★★★☆☆
  既存物件写真1枚 → <1秒でGaussian Splat

【第4推奨】Polycam / DJI ドローン（外観）★★★★★
  外観高品質・敷地全体を俯瞰 / コスト: $50〜200/物件

【IFC優先】BIM図面がある場合 ★★★★★
  @thatopen/web-ifc → Three.js → GLB / 信頼度0.95+
```

### I.2 後処理パイプライン（SuperSplat QC含む）

```
PLY（raw）
      ↓
SuperSplat QC（ブラウザ・コストゼロ）
  - フローター除去（目視確認）
  - QCスコア ≥ 0.75 → 次へ / < 0.75 → 手動確認依頼
      ↓
splat-transform v2.0（GPU版）
  filterFloaters --gpu / filterCluster --gpu
  filterHarmonics 1（SH削減・サイズ40%削減）
      ↓
      ├── 単体LP → Niantic SPZ4（PLYの90%削減）
      └── 仮想展示場 → SOG（Phase 2）
```

### I.3 QCスコア判定

```typescript
export function calcQCScore(stats: GaussianQCStats): number {
  const nanRatio     = stats.nanCount      / stats.totalGaussians
  const floaterRatio = stats.floaterEstimate / stats.totalGaussians
  const sizeOk       = stats.estimatedSizeMb.spz4 < 80

  return Math.max(0, Math.min(1,
    (1 - nanRatio     * 10) * 0.3 +
    (1 - floaterRatio *  5) * 0.4 +
    (sizeOk ? 1 : 0.5)      * 0.3
  ))
}
// ≥ 0.75 → auto_passed
// 0.50〜0.74 → manual_review
// < 0.50 → rescan
```

---

## Part J — OpenUSD統合設計 {#part-j}

### J.1 デジタルツイン中心設計

```
IFC / DXF / PDF図面 / 写真 / SPZ / PLY
              ↓
    web-ifc / dxf-parser / Claude Vision（FloorplanAnalyzer）
              ↓
    ┌─────────────────────────────────────┐
    │  OpenUSD（USDA/USDC）               │
    │  ← デジタルツインの中心フォーマット   │
    └─────────────────────────────────────┘
         ↓           ↓            ↓
        GLB         USDZ      USDカメラシーケンス
    Three.js表示  iOS QuickLook  CinematicPromptBuilderへ
```

### J.2 技術スタック

| 技術 | 用途 | Phase |
|------|------|-------|
| OpenUSD 25.x（USDA/USDC） | メインシーングラフ | 1 |
| usd-core（Pixar Python SDK） | IFC→USD変換・処理 | 1 |
| usd_from_gltf | GLB → USD変換 | 1 |
| USDZ | iOS AR Quick Look / Vision Pro | 1 |

### J.3 将来拡張（Phase 3〜）

```
NVIDIA Omniverse Kit → 都市スケールのデジタルツイン
Cesium + PLATEAU → 都市デジタルツイン連携
Apple Vision Pro visionOS対応（USDZ拡張）
BIM継続的デプロイ（USD差分更新）
```

---

## Part K — LP Runtime（3D体験設計） {#part-k}

### K.1 モジュール構成

| モジュール | 役割 | 技術 |
|-----------|------|------|
| SceneLoader | Scene JSON → Three.js | async/await + Zod + IndexedDB |
| GaussianEngine | SPZ4 LODストリーミング | @mkkellogg/gaussian-splats-3d |
| ModelEngine | GLB / Hybrid | GLTFLoader + DRACOLoader |
| UsdLoader | USDZ → AR Quick Look | ArQuickLookButton |
| RelightEngine | 昼夜サイクル・照明 | TSLシェーダー + GSAP 4 |
| GPUBudgetManager | VRAM突然死対策（60%閾値でLRU eviction） | WebGL拡張 + カスタム |
| CameraSystem | スクロール駆動 | GSAP 4 + CatmullRomCurve3 |
| HotspotEngine | 3Dピン・クリック・フライ | Three.js Sprite + Raycaster |
| CameraTourEngine | 自動ツアー・手動ナビ | GSAP 4 Timeline |
| PostFXEngine | ブルーム・ビネット・グレード | Three.js TSL + PostProcessing |
| AIChat | Claude RAGチャット | Vercel AI SDK v4 + pgvector |
| CTAEngine | 資料請求 / LINE / 予約 | LINE Messaging API + LeadConfig |
| BehavioralAnalytics | 行動ログ収集・匿名化 | fetch + crypto.subtle |
| UtmTracker | UTMパラメータ取得・セッション追跡 | URLSearchParams + sessionStorage |
| AbTestRenderer | A/Bバリアント表示制御 | AbVariantSchema参照 |
| DynamicLpRenderer | 広告軸別ファーストビュー切替 | AdCreativeAxis + utm_content |
| SectionBeacon | セクション別滞在・離脱計測 | IntersectionObserver + sendBeacon |
| SogLoader | Streamed LOD（仮想展示場） | SOG + Three.js（Phase 2） |

### K.2 GPUBudgetManager 実装詳細

```typescript
// apps/runtime/lib/GPUBudgetManager.ts
export class GPUBudgetManager {
  private readonly EVICTION_THRESHOLD = 0.60  // VRAM使用率60%で eviction開始
  private lruCache: LRUCache<string, THREE.Object3D>

  constructor(private renderer: THREE.WebGPURenderer) {
    this.lruCache = new LRUCache({ max: 50 })
    this.startMonitoring()
  }

  private async getVramUsage(): Promise<number> {
    // WebGPU: GPUDevice.limits.maxBufferSize から推定
    // WebGL: WEBGL_debug_renderer_info + 経験的推定
    try {
      const adapter = await navigator.gpu?.requestAdapter()
      if (adapter) {
        const info = await adapter.requestAdapterInfo()
        // 実VRAM取得はAPIにより異なる。フォールバックとして250MBを想定
        return this.estimateUsage()
      }
    } catch { /* ignore */ }
    return this.estimateUsage()
  }

  private estimateUsage(): number {
    const info = this.renderer.info
    return (info.memory.geometries * 0.1 + info.memory.textures * 5) / 1024 // MB
  }

  async requestLoad(key: string, loader: () => Promise<THREE.Object3D>): Promise<THREE.Object3D> {
    if (this.lruCache.has(key)) return this.lruCache.get(key)!

    const usage = await this.getVramUsage()
    if (usage > this.EVICTION_THRESHOLD * 100) {
      const evicted = this.lruCache.pop()
      if (evicted) {
        evicted.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
            else obj.material.dispose()
          }
        })
      }
    }

    const obj = await loader()
    this.lruCache.set(key, obj)
    return obj
  }
}
```

### K.3 SectionBeacon（デバウンス付き・iOS Safari対応）

```typescript
// apps/runtime/lib/SectionBeacon.ts
export class SectionBeacon {
  private sectionTimers: Map<string, number> = new Map()
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private readonly DEBOUNCE_MS = 300  // 300ms以内の連続enter/exitを無視

  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach(entry => {
      const sectionId = entry.target.id.replace('section-', '')
      const key = `${sectionId}_${entry.isIntersecting ? 'in' : 'out'}`

      // 既存のデバウンスタイマーをクリア
      clearTimeout(this.debounceTimers.get(key))

      this.debounceTimers.set(key, setTimeout(() => {
        if (entry.isIntersecting) {
          this.sectionTimers.set(sectionId, performance.now())
          this.beacon('section_enter', sectionId, 0)
        } else {
          const startedAt = this.sectionTimers.get(sectionId)
          if (startedAt != null) {
            const dwellMs = Math.round(performance.now() - startedAt)
            this.sectionTimers.delete(sectionId)
            this.beacon('section_exit', sectionId, dwellMs)
          }
        }
      }, this.DEBOUNCE_MS))
    })
  }

  // iOS Safari対応: sendBeaconが使えない場合はfetch + keepaliveにフォールバック
  private async beacon(
    eventType: string,
    sectionId: string,
    dwellMs: number,
    extra?: Record<string, string>
  ): Promise<void> {
    const payload = JSON.stringify({
      anonymized_session_id: this.sessionId,
      scene_id:    this.sceneId,
      event_type:  eventType,
      section_id:  sectionId,
      dwell_ms:    dwellMs,
      utm_source:  this.utmParams.utm_source,
      utm_medium:  this.utmParams.utm_medium,
      utm_campaign: this.utmParams.utm_campaign,
      utm_content:  this.utmParams.utm_content,
      ab_variant_id: this.abVariantId,
      ad_axis: this.utmParams.utm_content?.split('_')[1] ?? 'default',
      ...extra,
    })

    const url = '/api/beacon'

    // sendBeacon（ページ離脱時も確実）
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(url, payload)
      if (sent) return
      // iOS Safariでsendが失敗した場合はfetchにフォールバック
    }

    // fetch + keepalive（iOS Safari フォールバック）
    try {
      await fetch(url, {
        method: 'POST',
        body: payload,
        keepalive: true,  // ページ離脱後もリクエスト継続
        headers: { 'Content-Type': 'application/json' },
      })
    } catch { /* ベストエフォート */ }
  }
}
```

### K.4 PostFXプリセット（物件タイプ別デフォルト）

| プリセット | 用途 | 特徴 |
|-----------|------|------|
| `none` | 全物件共通デフォルト | エフェクトなし |
| `fresh` | 土地・新築 | 明るめ・シャープ・ニュートラル |
| `cinematic` | 新築戸建て・分譲 | ブルーム中・ビネット・ウォームトーン |
| `vintage` | 中古リノベ | コントラスト強め・彩度低め |
| `luxury` | モデルハウス | ブルーム弱・ビネット強・ゴールドトーン |

---

## Part L — Event Driven設計 {#part-l}

### L.1 イベント一覧

```typescript
// events/index.ts
export type SisliREvent =
  | { type: 'PropertyImported';      propertyId: string; agencyId: string }
  | { type: 'PhotoRetouched';        propertyId: string; photoUrls: string[] }
  | { type: 'ThumbnailGenerated';    propertyId: string; platforms: string[] }
  | { type: 'LpGenerated';           propertyId: string; lpUrl: string }
  | { type: 'SeoConfigured';         propertyId: string; metaTitle: string }
  | { type: 'VideoGenerated';        propertyId: string; videoUrl: string; provider: string }
  | { type: 'PdfGenerated';          propertyId: string; pdfUrl: string }
  | { type: 'DistributionScheduled'; propertyId: string; platforms: string[] }
  | { type: 'LeadCreated';           propertyId: string; source: string; utmSource?: string }
  | { type: 'ImprovementTriggered';  propertyId: string; reason: string }
  | { type: 'AgentJobCompleted';     propertyId: string; jobType: string }
  | { type: 'AgentJobFailed';        propertyId: string; jobType: string; error: string }
```

### L.2 イベント駆動ワークフロー

```
PropertyImported
    ↓
PhotoRetouched（mcp_sisliR_image）
    ↓（並列）
    ├── ThumbnailGenerated（mcp_sisliR_thumbnail）
    ├── LpGenerated（mcp_sisliR_lp）
    │     └── SeoConfigured（mcp_sisliR_seo）← LP生成後に自動SEO設定
    ├── VideoGenerated（mcp_sisliR_video）
    │     └── VideoSitemapGenerated（mcp_sisliR_seo）← 動画完了後
    ├── PdfGenerated（mcp_sisliR_doc）
    └── SNSGenerated（mcp_sisliR_sns）
    ↓（全完了）
AgentJobCompleted
    ↓
DistributionScheduled（mcp_sisliR_distribute）
    ↓（公開後72時間・反響ゼロ判定時）
ImprovementTriggered → improvement_queue へ登録
```

---

## Part M — データベース設計 {#part-m}

### M.1 主要テーブル（コア）

```sql
-- テナント（不動産会社）
CREATE TABLE tenants (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            TEXT NOT NULL,
  plan                            TEXT NOT NULL DEFAULT 'starter',
  higgsfield_monthly_credit_limit INTEGER DEFAULT 500,
  created_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- 不動産エージェント（担当者）
CREATE TABLE agents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  role       TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 物件
CREATE TABLE properties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  property_type     TEXT NOT NULL,
  ownership_type    TEXT NOT NULL DEFAULT 'owned',  -- 'owned' | 'brokerage'
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  pref              TEXT,
  city              TEXT,
  ward              TEXT,
  price             BIGINT,
  land_area         DECIMAL(10,2),
  building_area     DECIMAL(10,2),
  layout            TEXT,
  access            TEXT,
  built_year        INTEGER,
  catch_copy        TEXT,
  description       TEXT,
  -- 生成ステータス（全成果物）
  gen_photo_status            TEXT DEFAULT 'pending',
  gen_thumbnail_status        TEXT DEFAULT 'pending',
  gen_portal_suumo_status     TEXT DEFAULT 'pending',
  gen_portal_athome_status    TEXT DEFAULT 'pending',
  gen_lp_status               TEXT DEFAULT 'pending',
  gen_seo_status              TEXT DEFAULT 'pending',
  gen_video_slideshow_status  TEXT DEFAULT 'pending',
  gen_video_cinematic_status  TEXT DEFAULT 'pending',
  gen_sns_status              TEXT DEFAULT 'pending',
  gen_distribution_status     TEXT DEFAULT 'pending',
  gen_pamphlet_status         TEXT DEFAULT 'pending',
  gen_threed_status           TEXT DEFAULT 'pending',
  gen_usdz_status             TEXT DEFAULT 'pending',
  -- 成果物URL
  gen_lp_url                   TEXT,
  gen_video_slideshow_url      TEXT,
  gen_video_cinematic_url      TEXT,
  gen_pamphlet_url             TEXT,
  gen_threed_url               TEXT,
  gen_usdz_url                 TEXT,
  gen_video_slideshow_provider TEXT,
  gen_video_cinematic_provider TEXT,
  status     TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON properties (tenant_id, status);
CREATE INDEX ON properties (tenant_id, pref, city, ward);

-- Scene JSON
CREATE TABLE scenes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  scene_json  JSONB NOT NULL,
  status      TEXT DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 物件埋め込み（RAG用）
CREATE TABLE property_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id    UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(1024),
  chunk_index INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON property_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 動画品質ログ（Claude学習ループ用）
CREATE TABLE video_quality_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES properties(id),
  prompt       TEXT NOT NULL,
  score        DECIMAL(3,2) NOT NULL CHECK (score >= 0 AND score <= 1),
  reason       TEXT,
  improvements TEXT[],
  embedding    vector(1024),
  provider     TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON video_quality_logs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Higgsfield月次クレジット
CREATE TABLE higgsfield_credit_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  year_month   TEXT NOT NULL,
  credits_used INTEGER DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, year_month)
);

-- 行動ログ（匿名化）
CREATE TABLE behavior_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymized_session_id TEXT NOT NULL,
  scene_id              UUID REFERENCES scenes(id),
  event_type            TEXT NOT NULL,
  section_id            TEXT,
  dwell_ms              INTEGER,
  scroll_pct            INTEGER,
  utm_source            TEXT,
  utm_medium            TEXT,
  utm_campaign          TEXT,
  utm_content           TEXT,
  ab_variant_id         TEXT,
  ad_axis               TEXT,  -- utm_contentから抽出した訴求軸
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  expires_at            TIMESTAMPTZ
);
CREATE INDEX ON behavior_logs (scene_id, created_at);
CREATE INDEX ON behavior_logs (section_id, event_type);

-- エージェント実行ログ
CREATE TABLE agent_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  job_id      TEXT,
  status      TEXT DEFAULT 'running',
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_msg   TEXT,
  result_json JSONB
);
```

### M.2 Growth Loop テーブル

```sql
-- SNSサムネイルログ
CREATE TABLE thumbnail_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES properties(id),
  platform     TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  style        TEXT NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- リード（問い合わせ）
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  scene_id        UUID REFERENCES scenes(id),
  source          TEXT NOT NULL,          -- 'lp' | 'suumo' | 'instagram' | 'line' | 'phone' | 'visit'
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_content     TEXT,
  ab_variant_id   TEXT,
  contact_type    TEXT NOT NULL,          -- 'inquiry' | 'reservation' | 'line' | 'phone' | 'visit'
  anonymized_hash TEXT,                   -- SHA-3ハッシュ（ADR-098）
  ownership_type  TEXT,                   -- 'owned' | 'brokerage'
  -- 反響CMS管理フィールド
  status          TEXT DEFAULT 'new',     -- 'new' | 'contacted' | 'preview' | 'negotiation' | 'applied' | 'contracted' | 'lost'
  assigned_agent_id UUID REFERENCES agents(id),
  notes           TEXT,
  last_contacted_at TIMESTAMPTZ,
  next_action     TEXT,
  next_action_at  TIMESTAMPTZ,
  lost_reason     TEXT,
  converted_at    TIMESTAMPTZ,
  raw_email_hash  TEXT,                   -- メール自動パース用重複防止
  auto_parsed     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON leads (property_id, created_at);
CREATE INDEX ON leads (tenant_id, status);
CREATE INDEX ON leads (assigned_agent_id, next_action_at) WHERE status NOT IN ('contracted', 'lost');
CREATE INDEX ON leads (tenant_id, created_at DESC) WHERE status = 'new' AND assigned_agent_id IS NULL;

-- UTMトラッキング（日次集計）
CREATE TABLE utm_tracking (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id     UUID NOT NULL REFERENCES scenes(id),
  utm_source   TEXT NOT NULL,
  utm_medium   TEXT NOT NULL,
  utm_campaign TEXT,
  sessions     INTEGER DEFAULT 0,
  page_views   INTEGER DEFAULT 0,
  avg_dwell_ms INTEGER DEFAULT 0,
  leads_count  INTEGER DEFAULT 0,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(scene_id, utm_source, utm_medium, utm_campaign, date)
);
CREATE INDEX ON utm_tracking (scene_id, date DESC);

-- A/Bテストバリアント
CREATE TABLE ab_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id        UUID NOT NULL REFERENCES scenes(id),
  variant_name    TEXT NOT NULL,
  catch_copy      TEXT,
  hero_image_url  TEXT,
  cta_label       TEXT,
  sessions        INTEGER DEFAULT 0,
  leads_count     INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,4) DEFAULT 0,
  is_winner       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 自動改善キュー
CREATE TABLE improvement_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES properties(id),
  trigger_type TEXT NOT NULL,   -- 'no_lead_72h' | 'low_ctr' | 'high_bounce' | 'price_section_dropout' | 'hero_dropout' | 'cta_not_reached' | 'manual'
  metrics_json JSONB,
  status       TEXT DEFAULT 'pending',   -- 'pending' | 'waiting_approval' | 'running' | 'done' | 'skipped'
  action_taken TEXT,
  result_json  JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX ON improvement_queue (status, created_at);

-- SEOメタデータ
CREATE TABLE seo_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id              UUID NOT NULL REFERENCES scenes(id) UNIQUE,
  meta_title            TEXT,
  meta_description      TEXT,
  keywords              TEXT[],
  structured_data_json  JSONB,
  canonical_url         TEXT,
  youtube_title         TEXT,
  youtube_description   TEXT,
  youtube_hashtags      TEXT[],
  video_sitemap_url     TEXT,
  sitemap_entry_url     TEXT,
  video_duration_sec    INTEGER,
  google_indexed_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- テナントサイトマップ管理
CREATE TABLE tenant_sitemaps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  sitemap_url  TEXT NOT NULL,
  entry_count  INTEGER DEFAULT 0,
  last_built   TIMESTAMPTZ DEFAULT NOW(),
  last_pinged  TIMESTAMPTZ
);

-- メール自動取り込みログ
CREATE TABLE email_intake_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at  TIMESTAMPTZ NOT NULL,
  source       TEXT NOT NULL,   -- 'suumo' | 'homes' | 'athome' | 'unknown'
  email_hash   TEXT NOT NULL UNIQUE,
  lead_id      UUID REFERENCES leads(id),
  parse_status TEXT DEFAULT 'pending',  -- 'pending' | 'success' | 'failed' | 'duplicate'
  parse_error  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- セクション別ファネル（マテリアライズドビュー）
CREATE MATERIALIZED VIEW section_funnel AS
SELECT
  scene_id,
  section_id,
  COUNT(DISTINCT anonymized_session_id)
    FILTER (WHERE event_type = 'section_enter')  AS reach_count,
  COUNT(DISTINCT anonymized_session_id)
    FILTER (WHERE event_type = 'section_exit')   AS exit_count,
  AVG(dwell_ms)
    FILTER (WHERE event_type = 'section_exit')   AS avg_dwell_ms,
  COUNT(DISTINCT anonymized_session_id)
    FILTER (WHERE event_type = 'cta_click')      AS cta_clicks,
  utm_source,
  ad_axis,
  date_trunc('day', created_at)                  AS day
FROM behavior_logs
WHERE section_id IS NOT NULL
GROUP BY scene_id, section_id, utm_source, ad_axis, day;

CREATE UNIQUE INDEX ON section_funnel (scene_id, section_id, utm_source, ad_axis, day);
-- pg-boss で1時間ごとに REFRESH MATERIALIZED VIEW CONCURRENTLY section_funnel を実行
```

### M.3 ポータル・注文住宅テーブル

```sql
-- 工務店・ハウスメーカーマスタ（portal-builders用・tenants完全分離）
CREATE TABLE builders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL,
  company_slug    TEXT NOT NULL UNIQUE,  -- 一度公開したら変更不可（ADR-082）
  pref            TEXT NOT NULL,
  city            TEXT NOT NULL,
  address_full    TEXT,
  tel             TEXT,
  official_url    TEXT,
  service_areas   TEXT[],
  plan            TEXT NOT NULL DEFAULT 'free',
  plan_started_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  description     TEXT,
  logo_url        TEXT,
  cover_image_url TEXT,
  founded_year    INTEGER,
  employee_count  INTEGER,
  annual_builds   INTEGER,
  construction_methods TEXT[],
  thermal_grade   TEXT,
  ua_value        DECIMAL(4,2),
  c_value         DECIMAL(4,2),
  zeh_compatible  BOOLEAN DEFAULT FALSE,
  price_range_min INTEGER,
  price_range_max INTEGER,
  seo_title       TEXT,
  seo_description TEXT,
  last_scraped_at TIMESTAMPTZ,
  scrape_status   TEXT DEFAULT 'pending',
  status          TEXT DEFAULT 'active',
  is_verified     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON builders (pref, city);
CREATE INDEX ON builders (plan, status);
```

### M.4 Row Level Security（RLS）

```sql
-- 全テーブルにRLS有効化
ALTER TABLE properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_tracking    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE thumbnail_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_configs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs      ENABLE ROW LEVEL SECURITY;

-- テナント分離ポリシー（全テーブル共通パターン）
CREATE POLICY tenant_isolation ON properties
  USING (tenant_id = (
    SELECT tenant_id FROM agents WHERE user_id = auth.uid()
  ));

CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = (
    SELECT tenant_id FROM agents WHERE user_id = auth.uid()
  ));

-- buildersテーブルはRLS不要（公開情報主体・ADR-081）
-- ただしbuilder_leadsはRLS有効化
```
---

## Part N — セキュリティ・法規制・WAF防御 {#part-n}

### N.1 APIキーセキュリティ（ADR-019）

```
サーバーサイドのみ（絶対にクライアントに露出しない）:
  ANTHROPIC_API_KEY
  HIGGSFIELD_API_KEY
  RUNWAY_API_KEY              ← v10.0追加
  KLING_API_KEY               ← v10.0追加
  CLOUDFLARE_R2_ACCESS_KEY / SECRET_KEY
  SUPABASE_SERVICE_ROLE_KEY（旧形式）→ SUPABASE_SECRET_KEY（新形式）

クライアントサイド（公開可）:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  ← 旧anon_keyから移行（2026年Q4まで）
```

### N.2 宅建業法・景品表示法対応

```typescript
// 自動付与する法的表記
const LEGAL_COMPLIANCE = {
  aiDisclaimer:    '※本コンテンツはAIが生成しています。詳細は担当者にご確認ください。',
  priceDisclaimer: '※価格は変更になる場合があります。詳細はお問い合わせください。',
  forbidden: [
    '最高', '一番', '完璧', '絶対', '必ず', '激安', '格安', 'No.1',
    '確約', '最安値', '絶対に契約できる', '間違いない',
  ],
}

// チャットAI: 宅建業法準拠システムプロンプト
// - 取引態様・宅建業者番号の自動付与
// - 断定的表現の禁止（「必ず値上がりします」等）
// - 「担当者にお問い合わせください」へのフォールバック
// - AI生成コンテンツにはhumanReviewedフラグが必要
```

### N.3 個人情報保護法対応（2022年改正）

| 対応項目 | 実装 |
|----------|------|
| 行動ログ匿名化 | sessionIdをSHA-3（ソルト付き）でハッシュ化。生IDはDB保存しない（ADR-098） |
| リード個人情報 | anonymized_hashのみ保存。生氏名・電話番号はDB保存しない |
| 保持期間 | behavior_logs: 90日後に自動削除（expires_at + PostgreSQL cron） |
| AI生成コンテンツ | 全成果物末尾に「※AIが生成しています」を自動付与 |
| IPアドレス | behavior_logsには保存しない |
| 量子耐性暗号移行 | SHA-256 → SHA-3への移行計画（ADR-098・2027年Q2目標） |

### N.4 Cloudflare WAF設定

```
WAFルール:
  - DDoS防御
  - Bot管理
  - Rate Limiting（APIエンドポイント: 100req/min）
  - 地理的ブロック（必要に応じて）
  - R2バケット: GoogleクローラーのIPレンジを許可（VideoSitemap用・ADR-099）

CSP（Content Security Policy）:
  script-src  'self' cdn.jsdelivr.net
  img-src     'self' *.r2.cloudflarestorage.com data:
  connect-src 'self' *.supabase.co *.anthropic.com
  media-src   'self' *.r2.cloudflarestorage.com
```

### N.5 Supabase APIキー移行（必須・2026年Q4まで）

```bash
# 旧形式（廃止予定）
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 新形式（移行先）
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

---

## Part O — ポータル連動設計 {#part-o}

### O.1 現実的な連動戦略

| 手法 | Phase | 実装可否 |
|------|-------|---------|
| 入稿データCSV自動生成（担当者がコピペするだけ） | 1 | ✅ 即時実装可 |
| LP URL自動生成・SUUMO欄に貼付 | 1 | ✅ 即時実装可 |
| OGP最適化（SNSシェア時に3D LPプレビュー表示） | 1 | ✅ 即時実装可 |
| QRコード自動生成（チラシ・ポータル画像に埋め込み） | 1 | ✅ 即時実装可 |
| LIFULL Connect API連携（審査申請必要） | 2 | 🔍 審査中 |
| ONet（不動産流通標準XML）対応 | 2 | 🔍 設計済み |
| SUUMO直接API連携 | 永続不可 | ❌ API非公開 |

### O.2 SUUMOデータ自動生成フォーマット

```typescript
const SUUMO_FIELDS = {
  物件名:        property.name,
  所在地:        property.address,
  価格:          `${(property.price / 10000).toLocaleString()}万円`,
  土地面積:      `${property.landArea}㎡`,
  建物面積:      property.buildingArea ? `${property.buildingArea}㎡` : '',
  間取り:        property.layout,
  交通:          property.access,
  キャッチコピー: property.catchCopy,
  物件説明:      property.description,
  広告主:        property.agencyName,
  免許番号:      property.realtorLicense,
  物件詳細URL:   property.lpUrl,
}
```

---

## Part P — ビジネスモデル & プライシング {#part-p}

### P.1 SaaSプライシング

| プラン | 月額 | 物件数/月 | 主な機能 | ターゲット |
|--------|------|---------|---------|-----------|
| **Starter** | ¥29,800 | 3件 | 写真補正・CSV・LP・パンフ・サムネイル・SEO | 個人〜小規模 |
| **Growth** | ¥79,800 | 15件 | Starter + 動画・SNS・ホットスポット・反響計測・A/Bテスト | 中小規模 |
| **Premium** | ¥198,000 | 無制限 | Growth + シネマティック動画・自動改善ループ・IFCパイプライン | 中堅〜大手 |
| **Enterprise** | 要相談 | 無制限 | Premium + API連携・ホワイトラベル・専任CSM | 大手・チェーン |

### P.2 受注制作プライシング（トラックB）

| グレード | 価格 | 成果物 |
|---------|------|-------|
| Basic3D | ¥49,800 | Gaussian Splat LP + USDZ |
| Standard | ¥98,000 | Basic3D + シネマティック動画 + SNSサムネイルセット |
| Premium | ¥198,000 | Standard + ホットスポット + ツアー |
| Luxury | ¥398,000 | Premium + BIMデジタルツイン（IFC→OpenUSD）|

### P.3 コスト試算（月間・Growthプラン15件想定）

| コスト項目 | 単価 | 月間想定 | 金額 |
|-----------|------|---------|------|
| Claude API（Sonnet 4） | 約¥800/物件 | 15件 | ¥12,000 |
| Claude API（Haiku） | 約¥100/物件 | 15件 | ¥1,500 |
| Higgsfield クレジット | 約¥1,500/本 | 15本 | ¥22,500 |
| Cloudflare R2 ストレージ | ¥0.015/GB | 50GB | ¥750 |
| Cloudflare R2 エグレス | ¥0（無料） | — | ¥0 |
| Supabase（Pro） | — | 固定 | ¥7,500 |
| Cloudflare Workers | — | 固定 | ¥1,500 |
| Grafana Cloud | — | 固定 | ¥3,000 |
| **原価合計** | | | **≈¥49,000** |
| **Growth売上** | | | **¥79,800** |
| **粗利（1社あたり）** | | | **≈¥30,800（39%）** |

### P.4 損益分岐点

```
固定費（月額）:
  インフラ（Supabase/Cloudflare/Grafana）: 約  80,000円
  AI API費（Claude/voyage-3-large基本）:         約  50,000円
  Grafana Cloud可観測性:                   約  30,000円
  その他（ドメイン・メール等）:             約  20,000円
  合計:                                    約 180,000円

Phase 1目標:
  Starter×10 + Growth×5 + Premium×2 = MRR約140万円
  → 固定費回収後の利益: 約130万円/月（開発者1名・一人体制）
```

---

## Part Q — 実装ロードマップ {#part-q}

### Q.1 Phase 0（Week 0）: ブロッカー解消

| 作業 | 内容 | 期限 |
|------|------|------|
| Claude Vision間取り解析 動作確認 | FloorplanAnalyzer（Part OO.6）の間取り図PNG解析テスト実施。信頼度帯別ルーティング確認 | Week 0 |
| Supabase APIキー移行 | 新形式（sb_publishable_xxx）に移行 | Week 0 |
| OpenCut MCP動作確認 | 実動作テスト・ツール一覧取得 | Week 0 |
| Higgsfield MCP動作確認 | クレジット単価・レート制限確認 | Week 0 |
| Runway Gen-4 API キー取得 | フォールバック用（ADR-090） | Week 0 |

### Q.2 Phase 1（Week 1〜4）: コア自動化

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 1 | MCPサーバー基底クラス / `mcp_sisliR_storage` / `mcp_sisliR_db` / pg-boss / Supabase Auth / OpenTelemetry初期設定 | 最高 |
| Week 2 | `mcp_sisliR_pdf` / `mcp_sisliR_image`（sharp）/ `mcp_sisliR_thumbnail` / CopyGenerator / QualityChecker | 最高 |
| Week 3 | `mcp_sisliR_portal` / `mcp_sisliR_lp` / `mcp_sisliR_seo` / `mcp_sisliR_doc`（Puppeteer） | 高 |
| Week 4 | PropertyIntakeAgent + べき等性ロジック / ダッシュボードUI / 完了通知メール / UTMパラメータ付与 | 高 |

**Phase 1完了定義（DoD）:**
- 写真→補正→SNSサムネイル→SEO→CSV→LP→パンフが30分以内に自動生成できる
- PropertyIntakeAgentが中断後に安全に再実行できる（べき等性マトリクス全Step確認）
- OpenTelemetryが全MCPサーバーのスパンを記録している
- 最初の顧客1社にデモできる状態

### Q.3 Phase 1.5（Week 5〜8）: 動画 + OpenUSD + 可観測性強化

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 5 | OpenCut MCP接続 / `mcp_sisliR_video`（スライドショー型）/ VideoGeneratorRouter（フォールバック完全実装） | 高 |
| Week 6 | CinematicPromptBuilder / VideoQualityScorer / Higgsfield MCP接続 / Runway Gen-4フォールバック確認 | 高 |
| Week 7 | `mcp_sisliR_usd` / IFC→USD変換 / USDZ書き出し / ArQuickLookButton | 高 |
| Week 8 | Grafana Cloud本格設定 / SLO/SLIダッシュボード / アラートルール設定 | 高 |

**Phase 1.5完了定義（DoD）:**
- 動画生成フォールバックが3段階で動作確認済み
- Grafana Cloudでトレース・メトリクス・ログが可視化されている
- SLO（LP生成成功率99.5%）の計測が開始されている

### Q.4 Phase 2（Week 9〜16）: Growth Loop + テスト強化

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 9〜10 | 反響計測基盤（UTM追跡・behavior_logs・leads）/ DynamicLP（広告軸別切替） | 高 |
| Week 11 | SectionBeacon（デバウンス付き・iOS Safari対応）/ A/Bテスト基盤 | 高 |
| Week 12 | ImprovementAgent / improvement_queue / 自動改善ループ | 中 |
| Week 13 | Claude Vision間取り解析パイプライン（FloorplanAnalyzer）/ ProceduralMeshBuilder | 中 |
| Week 14 | テストスイート完成（Unit/Integration/E2E: Part AA参照） | 高 |
| Week 15〜16 | VideoSitemap / llms.txt / SOGストリーミング基盤（Phase 2用） | 中 |

### Q.5 Phase 3〜（2027〜）

```
仮想住宅展示場（出展料収益モデル）
独自不動産ポータル（掲載料）
Apple Vision Pro対応（USDZ拡張）
LIFULL Connect API連携（審査通過後）
Mapbox GL JS + PLATEAU 地域情報連携
BIM継続的デプロイ（USD差分更新）
量子耐性暗号完全移行（ADR-098）
Edge Function移行評価（Cloudflare Workers + DynamicLP）
```

---

## Part R — ADR完全ログ v10.0 {#part-r}

### R.1 既存ADR（ADR-001〜089）

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-001 | Three.js r184 WebGPUを採用 | 全ブラウザWebGPU対応確認済み | PlayCanvas Engine |
| ADR-002 | Niantic SPZ4を単体LP用フォーマットに採用 | PLYの90%削減・MIT | KSPLAT |
| ADR-003 | 内製Gaussian圧縮エンジン | 技術的モート形成 | SPZ4のみ |
| ADR-010 | @thatopen/web-ifc採用 | MIT・ブラウザ動作・BIM義務化対応 | IFC.js |
| ADR-013 | Supabase Auth採用（Clerk廃止） | 日本リージョン（ap-northeast-1）確実 | Clerk |
| ADR-019 | APIキーはサーバーサイドのみ | クライアント露出はセキュリティリスク | 直接クライアント利用 |
| ADR-025 | Genie 3不採用 | ゲーム向け・米国限定・不動産不適 | Genie 3採用 |
| ADR-035 | SuperSplatを社内QCツールとして採用 | MIT・ブラウザ完結・コストゼロ | 独自QCツール |
| ADR-036 | SOGを仮想展示場向けに追加採用（Phase 2） | Streamed LOD・10M+Gaussian対応 | SPZ4のみ |
| ADR-039 | HotspotEngine: Three.js Spriteで実装 | Raycaster + Canvas2D軽量実装 | CSS3DObject |
| ADR-040 | CameraTourEngine: GSAP 4 Timelineで実装 | 既存GSAP 4を最大活用 | Tween.js |
| ADR-041 | PostFXEngine: Three.js TSL + PostProcessing | ノードベース・プリセット切替容易 | three-stdlib |
| ADR-042 | フローター除去を3段階（自動→統計→手動） | QCスコア閾値0.75で手動介入最小化 | 全自動のみ |
| ADR-043 | プロダクトを「不動産マーケティング自動化」に再定義 | 3D特化より市場が広い | 3D特化継続 |
| ADR-044 | MCPサーバー自作（13サーバー構成） | 型安全・エラー管理一元化 | 既存MCP OSS |
| ADR-045 | PropertyIntakeAgent: claude-sonnet-4で実装 | 複雑タスク分解・品質判断が必要 | GPT-4o |
| ADR-046 | ジョブキュー: pg-boss 10.x | Redis不要・Supabase統合 | BullMQ |
| ADR-047 | 写真補正: sharp.js（サーバーサイド） | 安定・高速 | Cloudinary |
| ADR-048 | SUUMO連動: CSV自動生成 | API非公開。CSV自動生成で入稿5分に短縮 | 直接API |
| ADR-049 | パンフPDF: Puppeteer | デザイン自由度最高・日本語フォント対応 | WeasyPrint |
| ADR-050 | 3DコンテンツはオプションLayer | 全不動産会社が3Dを必要とするわけではない | 3Dを標準機能 |
| ADR-051 | 動画編集: OpenCut MCP Controller | 実装コスト1/5以下 | FFmpeg直接実装 |
| ADR-052 | 開発IDE: Cursor/Windsurf + Claude Code | AI補完 + CLIエージェント | Helmor |
| ADR-053 | 3D中間フォーマット: OpenUSD採用 | iOS AR・IFC継続デプロイを単一フォーマットで解決 | GLBのみ |
| ADR-054 | 3Dキャプチャ標準: Scaniverse/Polycam | モバイル品質がCOLMAPと区別がつかないレベル | COLMAP |
| ADR-055 | 動画生成2トラック設計 | スライドショーとシネマティックを分離 | 単一ツールのみ |
| ADR-056 | 動画制御をClaudeに集約・Higgsfieldはレンダリング専任 | プロバイダー変更時も資産引継ぎ可能 | Higgsfield直接依存 |
| ADR-057 | FloorplanVLMのBeikeライセンス確認の結果、商用利用不可と判断 → Claude Vision（FloorplanAnalyzer）に移行（ADR-144参照） | 商用ライセンス取得不可のリスク回避。Claude Vision単独パイプラインで自社完結 | FloorplanVLM継続採用 |
| ADR-058 | Supabase APIキーを2026年Q4までに新形式へ移行 | 旧キーが2026年末廃止予定 | 移行延期 |
| ADR-059 | 構造が変化するImage-to-Videoは不採用 | 住宅が変形するAI動画は不動産広告として使用不可 | Image-to-Video採用 |
| ADR-060 | ローカルHDDをSource of Truthとする | クラウド依存排除。R2はキャッシュのみ | クラウドをSoT |
| ADR-061 | SNSサムネイル生成を全自動化（13サイズ） | 手動作業の最大ボトルネックを排除 | 手動作成継続 |
| ADR-062 | SEO構造化データ自動生成（schema.org/PropertyListing） | Google物件リッチリザルト取得 | 手動設定 |
| ADR-063 | UTMパラメータを全成果物に自動付与 | 集客チャネル効果を測定可能にする | 手動付与 |
| ADR-064 | リード個人情報はSHA-3ハッシュのみ保存 | 個人情報保護法・漏洩リスク最小化 | 平文保存 |
| ADR-065 | DynamicLP: utm_content軸で表示切替 | 広告文脈とLPの一致でCVR改善 | 全員同一LP |
| ADR-066 | SectionBeacon: IntersectionObserver threshold 0.5 | セクション半分以上が画面内に入った時点を「到達」と判定 | threshold 0.1 |
| ADR-067 | SectionBeaconにデバウンス300msを実装 | 上スクロール時の重複section_enterを防止（ADR-066の補完） | デバウンスなし |
| ADR-068 | sendBeacon失敗時はfetch+keepaliveにフォールバック | iOS Safariでsendなしは24%のセッション喪失 | sendBeaconのみ |
| ADR-069 | VideoSitemap: R2 URLをcontent_locに使用 | R2 URLはGoogleクローラー到達可能（WAF設定要） | CDN経由URL |
| ADR-070 | improvement_queueの自動改善は人間承認を経てから実行 | LP自動変更は誤解を生む可能性がある | 全自動 |
| ADR-071 | section_funnelをマテリアライズドビューで実装 | 毎リクエスト集計は重すぎる。1時間ごとのrefreshで十分 | 毎回集計 |
| ADR-072 | A/Bテストは統計的有意差(p<0.05)まで継続 | 早期終了でサンプルバイアス発生を防止 | 3日で判定 |
| ADR-073 | メール自動取り込みにemail_hashで重複防止 | 同一メールの二重登録でリード数が水増しされる | 重複チェックなし |
| ADR-074 | llms.txt / AI検索SEO対応 | Perplexity・Claude Search等のAI検索エンジン向け | 対応しない |
| ADR-075 | builders テーブルを tenants と完全分離 | 工務店ポータルは別事業体として設計 | テナントに統合 |
| ADR-076 | company_slugは一度公開したら変更不可 | SEO資産（被リンク等）を守るため | 変更自由 |
| ADR-080 | VideoGeneratorRouterに3段フォールバックを実装（Higgsfield→Runway→Kling） | 外部サービス障害時の動画生成停止を防止 | Higgsfield障害時はスライドショーのみ |
| ADR-081 | buildersテーブルはRLS不要 | 公開情報主体。認証不要での閲覧を想定 | RLS有効化 |
| ADR-082 | GPUBudgetManagerのVRAM eviction閾値を60%に設定 | 60%超過でLRUオブジェクトを解放してOOM防止 | 80%（遅すぎる） |

### R.2 v10.0新規ADR（ADR-090〜100）

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-090 | VideoGeneratorRouterに Runway Gen-4 / Kling AI フォールバックを追加 | Higgsfield単独障害時の動画生成全停止を防止。3段フォールバックで可用性99.9%を目指す | Higgsfield障害時はOpenCut（スライドショー）にフォールバック（品質劣化） |
| ADR-091 | 可観測性スタック: OpenTelemetry + Grafana Cloud | ①Sentry/LogRocketは個人情報送信リスクあり ②自前Prometheusはメンテ負荷高 ③Grafana CloudのFreeティアで開始可能 ④MCPサーバー間の分散トレーシングが可能 | Datadog（高コスト）/ Sentry（個人情報リスク）|
| ADR-092 | Scene JSON マイグレーションは「非破壊的追加のみ」ポリシーを採用 | 既存本番データの破壊を防止。古いバージョンのJSONはSceneAdapterで変換 | メジャーバージョンアップ時に全件マイグレーション |
| ADR-093 | SceneAdapterをリクエスト時に自動適用（lenientモード） | 本番移行中に旧バージョンJSONがエラーになることを防止 | デプロイ時に全件マイグレーション（ダウンタイムリスク） |
| ADR-094 | PropertyIntakeAgentのべき等性をStep単位で設計 | pg-bossのリトライ時に課金重複（Higgsfield）や状態不整合を防止 | ジョブ全体を冪等として扱う（課金重複リスク） |
| ADR-095 | テスト戦略: Unit+Integration+E2E+Loadの4層（Part AA参照） | テストなしでのCI/CD本番デプロイはリスクが高すぎる。Claude Codeへの実装委任にも品質基準が必要 | テスト省略（速度優先） |
| ADR-096 | マルチテナントRLS侵害テストをCIに組み込む | テナント間情報漏洩はSaaSで最も深刻なセキュリティリスク。自動化で検出 | 手動テストのみ |
| ADR-097 | SectionBeaconデバウンス300msを採用（ADR-067の確定版） | AnalyticsデータのノイズがImprovementAgentの精度を下げる。300msは体感ではわからない遅延 | 500ms（長すぎ）/ なし（ノイズ大） |
| ADR-098 | リード個人情報のハッシュアルゴリズムをSHA-3に移行（ADR-064更新） | 量子コンピュータへの耐性。SHA-256からSHA-3への移行を2027年Q2を目標に計画 | SHA-256維持（当面は安全だが長期計画として危険） |
| ADR-099 | R2バケットのGoogleクローラーIPレンジをCloudflare WAFで許可 | VideoSitemapのcontent_locがR2 URLの場合、WAFブロックでIndexingが無効化される | CDN経由URLに変更（追加設定コスト） |
| ADR-100 | テストデータファクトリーを shared/testing 配下に集中管理 | 各テストファイルでのバラバラなモックデータ作成は保守性が低い。Zodスキーマに準拠したファクトリーでデータ品質を担保 | 各テストで個別にモック作成 |
---

## Part S — 集客エンジン設計 {#part-s}

### S.1 集客チャネル全体像

```
物件公開
    │
    ├── 1. 自社LP（3D体験）← UTM付きURL自動生成
    │       utm_source=direct / utm_medium=lp
    │
    ├── 2. ポータル掲載（SUUMO / HOME'S / アットホーム）
    │       utm_source=suumo|homes|athome / utm_medium=portal
    │       → CSV自動生成 + LP URL自動貼付
    │
    ├── 3. Instagram（フィード / ストーリーズ / リール）
    │       utm_source=instagram / utm_medium=social
    │       → SNSサムネイル自動生成 + 投稿スケジュール登録
    │
    ├── 4. YouTube（動画 / YouTube Shorts）
    │       utm_source=youtube / utm_medium=video
    │       → 動画自動生成 + VideoSitemap + SEO最適化
    │
    ├── 5. X（旧Twitter）
    │       utm_source=x / utm_medium=social
    │       → X用サムネイル自動生成（1200×675）
    │
    ├── 6. LINE（公式アカウント / チラシQR）
    │       utm_source=line / utm_medium=messaging
    │       → LINE用サムネイル（1200×630）+ QRコード
    │
    ├── 7. Google検索広告 / Meta広告
    │       utm_source=google|meta / utm_medium=cpc
    │       → DynamicLP（広告軸別ファーストビュー切替）
    │
    └── 8. チラシ / 折込
            utm_source=flyer / utm_medium=print
            → QRコード自動生成 + パンフレットPDF
```

### S.2 UTMパラメータ設計

```typescript
// lib/utm/UtmGenerator.ts

export const UTM_SOURCES = {
  suumo:     'suumo',
  homes:     'homes',
  athome:    'athome',
  instagram: 'instagram',
  youtube:   'youtube',
  x:         'x',
  line:      'line',
  google:    'google',
  meta:      'meta',
  flyer:     'flyer',
  direct:    'direct',
} as const

export const UTM_MEDIUMS = {
  portal:    'portal',
  social:    'social',
  video:     'video',
  messaging: 'messaging',
  cpc:       'cpc',
  print:     'print',
  lp:        'lp',
} as const

export function generateUtmUrl(params: {
  baseUrl:     string
  propertyId:  string
  source:      keyof typeof UTM_SOURCES
  medium:      keyof typeof UTM_MEDIUMS
  campaign?:   string
  content?:    string  // DynamicLP: 'axis_living' | 'axis_price' 等
}): string {
  const url = new URL(params.baseUrl)
  url.searchParams.set('utm_source',   UTM_SOURCES[params.source])
  url.searchParams.set('utm_medium',   UTM_MEDIUMS[params.medium])
  url.searchParams.set('utm_campaign', params.campaign ?? params.propertyId)
  if (params.content) {
    url.searchParams.set('utm_content', params.content)
  }
  return url.toString()
}
```

### S.3 SNS自動投稿スケジューラー

```typescript
// lib/distribute/SnsScheduler.ts

export const SNS_OPTIMAL_TIMES = {
  instagram: { day: 'tuesday',   hour: 19, minute: 0  },  // 火曜19:00
  youtube:   { day: 'saturday',  hour: 10, minute: 0  },  // 土曜10:00
  x:         { day: 'wednesday', hour: 12, minute: 0  },  // 水曜12:00
  line:      { day: 'sunday',    hour: 20, minute: 0  },  // 日曜20:00
} as const

// pg-bossジョブでスケジュール登録
export async function scheduleAllPosts(propertyId: string, sceneJson: SceneConfig): Promise<void> {
  const boss = await getBoss()
  for (const [platform, time] of Object.entries(SNS_OPTIMAL_TIMES)) {
    const nextOptimal = calcNextOptimalTime(time)
    await boss.sendAfter(
      `sns-post-${platform}`,
      { propertyId, platform, sceneJson },
      {},
      nextOptimal
    )
  }
}
```

---

## Part T — 反響計測設計 {#part-t}

### T.1 反響計測の全体像

```
訪問者（LP）
    │
    ├── UTMパラメータ取得（UtmTracker）
    │     → sessionStorage保存
    │
    ├── セクション行動計測（SectionBeacon）
    │     → behavior_logs（匿名化）
    │
    ├── CTAクリック計測
    │     → behavior_logs + leads生成トリガー
    │
    ├── A/Bバリアント表示（AbTestRenderer）
    │     → ab_variants.sessions +1
    │
    └── リード（問い合わせ）発生
          → leads テーブル登録
          → utm_tracking 日次集計更新
          → ab_variants.leads_count +1
```

### T.2 リード計測API

```typescript
// app/api/lead/route.ts
export async function POST(req: NextRequest) {
  const span = tracer.startSpan('api.lead.create')
  try {
    const body = await req.json()
    const { propertyId, sceneId, contactType, utmParams, abVariantId } = body

    // 個人情報はハッシュ化（ADR-064 / ADR-098）
    const anonymizedHash = await hashWithSalt(body.email ?? body.phone ?? '')

    // 重複チェック（同一ハッシュが24時間以内に存在する場合はスキップ）
    const existing = await supabase
      .from('leads')
      .select('id')
      .eq('anonymized_hash', anonymizedHash)
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .single()
    if (existing.data) {
      span.addEvent('lead.duplicate')
      return NextResponse.json({ status: 'duplicate' }, { status: 200 })
    }

    // リード登録
    await supabase.from('leads').insert({
      property_id:      propertyId,
      tenant_id:        await getTenantId(propertyId),
      scene_id:         sceneId,
      source:           'lp',
      utm_source:       utmParams?.utm_source,
      utm_medium:       utmParams?.utm_medium,
      utm_campaign:     utmParams?.utm_campaign,
      utm_content:      utmParams?.utm_content,
      ab_variant_id:    abVariantId,
      contact_type:     contactType,
      anonymized_hash:  anonymizedHash,
    })

    // ab_variants カウント更新
    if (abVariantId) {
      await supabase.rpc('increment_ab_variant_lead', { variant_id: abVariantId })
    }

    span.setStatus({ code: SpanStatusCode.OK })
    return NextResponse.json({ status: 'created' })
  } catch (e) {
    span.recordException(e as Error)
    throw e
  } finally {
    span.end()
  }
}
```

### T.3 utm_tracking 日次集計

```typescript
// lib/analytics/UtmAggregator.ts
// pg-bossで毎日0:00に実行

export async function aggregateDailyUtm(date: Date): Promise<void> {
  // behavior_logsから日次集計をutm_trackingにUPSERT
  await supabase.rpc('upsert_utm_tracking', { target_date: date.toISOString().split('T')[0] })
}

// PostgreSQL Function（Supabase上で定義）
/*
CREATE OR REPLACE FUNCTION upsert_utm_tracking(target_date DATE)
RETURNS VOID AS $$
INSERT INTO utm_tracking (scene_id, utm_source, utm_medium, utm_campaign, sessions, page_views, avg_dwell_ms, date)
SELECT
  scene_id,
  utm_source,
  utm_medium,
  utm_campaign,
  COUNT(DISTINCT anonymized_session_id) AS sessions,
  COUNT(*) FILTER (WHERE event_type = 'page_view') AS page_views,
  AVG(dwell_ms) FILTER (WHERE event_type = 'section_exit') AS avg_dwell_ms,
  target_date
FROM behavior_logs
WHERE created_at::date = target_date
GROUP BY scene_id, utm_source, utm_medium, utm_campaign
ON CONFLICT (scene_id, utm_source, utm_medium, utm_campaign, date)
DO UPDATE SET
  sessions     = EXCLUDED.sessions,
  page_views   = EXCLUDED.page_views,
  avg_dwell_ms = EXCLUDED.avg_dwell_ms;
$$ LANGUAGE sql;
*/
```

---

## Part U — 自動改善ループ設計 {#part-u}

### U.1 改善トリガー一覧

| トリガー | 条件 | 改善アクション |
|---------|------|-------------|
| `no_lead_72h` | 公開後72時間でリード0 | キャッチコピー・ヒーロー画像・CTA文言を再生成 |
| `low_ctr` | CTR < 0.5%（ポータル比較） | OGPサムネイル・メタタイトルを再生成 |
| `high_bounce` | 直帰率 > 80%（72時間） | ファーストビューのキャッチコピー・ヒーロー画像を改善 |
| `price_section_dropout` | 価格セクション離脱率 > 70% | 価格説明テキスト・周辺相場情報を追加 |
| `hero_dropout` | ヒーロー画像での離脱率 > 60% | 別写真をヒーロー画像として差し替え |
| `cta_not_reached` | CTA到達率 < 30% | CTAセクションをページ上部に移動 |
| `ab_test_winner` | A/Bテストで統計的有意差（p<0.05）確認 | 勝者バリアントをデフォルトに昇格 |
| `manual` | 担当者が手動でトリガー | 任意のアクションを実行 |

### U.2 ImprovementAgent

```typescript
// lib/agent/ImprovementAgent.ts

export class ImprovementAgent {
  async process(queueItem: ImprovementQueueItem): Promise<void> {
    const span = tracer.startSpan('agent.improvement', {
      attributes: { 'property.id': queueItem.property_id, 'trigger': queueItem.trigger_type }
    })

    try {
      // Step 1: 現在のLP・行動ログ・リード数を取得
      const analytics = await this.getAnalytics(queueItem.property_id)
      const currentScene = await this.getCurrentScene(queueItem.property_id)

      // Step 2: Claudeに改善提案を依頼
      const proposal = await callAI({
        task: 'copy',
        system: IMPROVEMENT_SYSTEM_PROMPT,
        user: `
トリガー: ${queueItem.trigger_type}
現在の指標: ${JSON.stringify(analytics)}
現在のキャッチコピー: ${currentScene.property.catchCopy}
現在のヒーロー画像: ${currentScene.assets.heroImageUrl}
改善提案を具体的に出してください。
`,
      })

      // Step 3: improvement_queueのステータスを「承認待ち」に更新
      // ADR-070: 自動改善は人間承認を経てから実行
      await supabase.from('improvement_queue').update({
        status:       'waiting_approval',
        action_taken: proposal,
        result_json:  { proposal },
      }).eq('id', queueItem.id)

      // Step 4: 担当者に承認依頼メールを送信
      await this.sendApprovalRequest(queueItem.property_id, proposal)

      span.setStatus({ code: SpanStatusCode.OK })
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  }

  // 担当者が承認した場合のみ実際の改善を実行
  async applyApprovedImprovement(queueItemId: string): Promise<void> {
    const item = await supabase
      .from('improvement_queue')
      .select('*')
      .eq('id', queueItemId)
      .eq('status', 'waiting_approval')
      .single()

    if (!item.data) throw new Error('承認待ちアイテムが見つかりません')

    await supabase.from('improvement_queue')
      .update({ status: 'running' })
      .eq('id', queueItemId)

    // 改善内容をScene JSONに反映してLPを再生成
    await this.applyToScene(item.data.property_id, item.data.result_json?.proposal)
    await this.regenerateLp(item.data.property_id)

    await supabase.from('improvement_queue')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', queueItemId)
  }
}

const IMPROVEMENT_SYSTEM_PROMPT = `
あなたはSisliRの自動改善エージェントです。
物件LPの反響率を改善するための具体的な変更提案を出してください。

制約:
- 宅建業法・不動産公正競争規約に違反しない
- 禁止表現（最高、一番、完璧、絶対等）を使わない
- キャッチコピーは15〜40文字
- 改善提案は必ず JSON形式で出力すること
  { "catchCopy": "...", "heroImageIndex": 0, "ctaLabel": "..." }
`
```

### U.3 A/Bテスト設計

```typescript
// lib/ab/AbTestManager.ts

export class AbTestManager {
  // セッションごとにバリアントを割り当て
  assignVariant(sceneId: string, sessionId: string): AbVariantConfig {
    const variants = this.getActiveVariants(sceneId)
    if (variants.length === 0) return this.getDefaultVariant(sceneId)

    // セッションIDのハッシュで決定論的に割り当て（毎リクエスト変わらない）
    const hash = cyrb53(sessionId + sceneId)
    return variants[hash % variants.length]
  }

  // 統計的有意差チェック（p < 0.05）
  checkSignificance(variantA: AbVariant, variantB: AbVariant): {
    significant: boolean
    winner: string | null
    pValue: number
  } {
    const { pValue } = chiSquareTest(
      variantA.sessions, variantA.leads_count,
      variantB.sessions, variantB.leads_count,
    )
    if (pValue < 0.05) {
      const winner = variantA.conversion_rate > variantB.conversion_rate
        ? variantA.variant_name
        : variantB.variant_name
      return { significant: true, winner, pValue }
    }
    return { significant: false, winner: null, pValue }
  }
}
```

---

## Part V — SNSサムネイル生成設計 {#part-v}

### V.1 サムネイル仕様一覧

| プラットフォーム | サイズ | フォーマット | フレームレート | 用途 |
|----------------|--------|------------|-------------|------|
| Instagram フィード | 1080×1080 | WebP | — | 正方形投稿 |
| Instagram ストーリーズ | 1080×1920 | WebP | — | 縦型投稿 |
| YouTube サムネイル | 1280×720 | WebP | — | 動画サムネイル |
| YouTube Shorts | 1080×1920 | WebP | — | 縦型動画 |
| X（旧Twitter） | 1200×675 | WebP | — | 投稿画像 |
| LINE タイムライン | 1200×630 | JPEG | — | LINE共有 |
| OGP / SNSシェア | 1200×630 | WebP | — | URLシェア時プレビュー |

### V.2 ThumbnailGenerator実装

```typescript
// lib/thumbnail/ThumbnailGenerator.ts
import sharp from 'sharp'
import { createCanvas, loadImage, registerFont } from '@napi-rs/canvas'

export class ThumbnailGenerator {
  async generate(params: {
    propertyId:  string
    sceneJson:   SceneConfig
    baseImageUrl: string
    platform:    ThumbnailPlatform
  }): Promise<Buffer> {
    const span = tracer.startSpan('thumbnail.generate', {
      attributes: { 'thumbnail.platform': params.platform }
    })

    try {
      const spec = THUMBNAIL_SPECS[params.platform]

      // Step 1: Claude Visionでベスト写真の最適クロップ位置を判定
      const cropGuidance = await this.analyzeCropPosition(params.baseImageUrl, spec)

      // Step 2: sharpでベース画像をリサイズ・クロップ
      const baseImage = await sharp(await fetchBuffer(params.baseImageUrl))
        .resize(spec.width, spec.height, {
          fit: 'cover',
          position: cropGuidance.gravity ?? 'centre',
        })
        .toBuffer()

      // Step 3: @napi-rs/canvasでテキスト・オーバーレイ合成
      const canvas = createCanvas(spec.width, spec.height)
      const ctx = canvas.getContext('2d')

      // ベース画像を描画
      const img = await loadImage(baseImage)
      ctx.drawImage(img, 0, 0, spec.width, spec.height)

      // オーバーレイ（半透明）
      const config = params.sceneJson.thumbnailConfig
      ctx.fillStyle = `rgba(0,0,0,${config.overlayOpacity})`
      ctx.fillRect(0, 0, spec.width, spec.height)

      // テキスト（日本語フォント）
      ctx.font = this.buildFont(config.fontFamily, spec)
      ctx.fillStyle = config.primaryColor
      ctx.textAlign = 'center'

      // キャッチコピー
      if (params.sceneJson.property.catchCopy) {
        this.drawWrappedText(ctx, params.sceneJson.property.catchCopy, spec.width / 2, spec.height * 0.4, spec.width * 0.85)
      }

      // 価格・間取り・交通情報
      if (config.showPrice && params.sceneJson.property.price) {
        const priceText = `${(params.sceneJson.property.price / 10000).toLocaleString()}万円`
        ctx.font = this.buildSubFont(config.fontFamily, spec)
        ctx.fillText(priceText, spec.width / 2, spec.height * 0.65)
      }

      // ロゴ（右下）
      if (config.showLogo && params.sceneJson.property.agencyName) {
        ctx.font = `bold ${spec.logoSize}px Noto Sans JP`
        ctx.fillStyle = config.accentColor
        ctx.textAlign = 'right'
        ctx.fillText(params.sceneJson.property.agencyName, spec.width - 24, spec.height - 24)
      }

      // Step 4: sharpで最終フォーマット変換
      const buf = canvas.toBuffer('image/png')
      const output = await sharp(buf)
        .toFormat(spec.format === 'jpeg' ? 'jpeg' : 'webp', { quality: 85 })
        .toBuffer()

      span.setStatus({ code: SpanStatusCode.OK })
      return output
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  }
}

const THUMBNAIL_SPECS: Record<ThumbnailPlatform, ThumbnailSpec> = {
  instagram_feed:   { width: 1080, height: 1080, format: 'webp', logoSize: 28 },
  instagram_story:  { width: 1080, height: 1920, format: 'webp', logoSize: 32 },
  youtube_thumb:    { width: 1280, height:  720, format: 'webp', logoSize: 36 },
  youtube_short:    { width: 1080, height: 1920, format: 'webp', logoSize: 32 },
  x_post:           { width: 1200, height:  675, format: 'webp', logoSize: 28 },
  line_timeline:    { width: 1200, height:  630, format: 'jpeg', logoSize: 28 },
  ogp:              { width: 1200, height:  630, format: 'webp', logoSize: 28 },
}
```

---

## Part W — ダイナミックLP設計（広告文脈整合） {#part-w}

### W.1 設計思想

```
問題:
  広告「リビングが広い！」→ LP トップ「価格訴求」
  文脈が一致しない → CVRが低下する

解決:
  utm_content パラメータで広告クリエイティブの「訴求軸」を取得
  → LPのファーストビュー（ヒーロー画像・キャッチコピー・CTA）を
     広告文脈に合わせて自動切替
  → 「リビングが広い！」広告からの訪問者には
     リビング写真ヒーロー + 「開放的なリビングで家族の時間を」コピー
```

### W.2 訴求軸別設定

| utm_content 値 | 訴求軸 | ヒーロー画像 | キャッチコピー例 | CTAラベル |
|--------------|--------|------------|--------------|---------|
| `axis_living` | リビング | リビング写真 | 「○○家族みんなが集まれる広いリビング」 | リビングの詳細を見る |
| `axis_exterior` | 外観 | 外観写真 | 「○○街に映える、○○の外観デザイン」 | 外観ギャラリーを見る |
| `axis_price` | 価格 | 外観写真 | 「○○万円台。○○地区で最高コスパ」 | 資料請求（無料）|
| `axis_access` | 交通 | 最寄り駅写真 | 「○○駅○○分。都心へのアクセス最高」 | 内覧予約はこちら |
| `axis_floor_plan` | 間取り | 間取り図 | 「○○LDK、○○㎡。暮らしを想像して」 | 間取りをもっと見る |
| `axis_family` | 家族 | 庭・子供部屋写真 | 「子育て世代に選ばれる○○の家」 | 子育て支援情報を見る |
| `default` | 総合 | ヒーロー写真 | Scene JSONのデフォルトコピー | お問い合わせ |

### W.3 DynamicLpRenderer実装

```typescript
// apps/runtime/lib/DynamicLpRenderer.ts

export class DynamicLpRenderer {
  private utmContent: AdCreativeAxis

  constructor() {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('utm_content') ?? 'default'
    // 'axis_living' → 'living'
    this.utmContent = raw.replace('axis_', '') as AdCreativeAxis
  }

  getActiveVariant(config: DynamicLpConfigSchema): DynamicLpVariant {
    if (!config.enabled) return this.getDefaultVariant(config)

    const match = config.variants.find(v => v.axis === this.utmContent)
    return match ?? config.fallback ?? this.getDefaultVariant(config)
  }

  applyVariant(variant: DynamicLpVariant): void {
    // ヒーロー画像切替
    if (variant.heroImageUrl) {
      document.querySelector<HTMLImageElement>('#hero-image')?.setAttribute('src', variant.heroImageUrl)
    }
    // キャッチコピー切替
    if (variant.catchCopy) {
      const el = document.querySelector('#catch-copy')
      if (el) el.textContent = variant.catchCopy
    }
    // CTAラベル切替
    if (variant.ctaLabel) {
      document.querySelectorAll<HTMLElement>('.cta-button').forEach(el => {
        el.textContent = variant.ctaLabel!
      })
    }
    // セクション順序変更
    if (variant.sectionOrder.length > 0) {
      this.reorderSections(variant.sectionOrder)
    }
    // ハイライトセクションまでスクロールアニメーション
    if (variant.highlightSection) {
      setTimeout(() => this.highlightSection(variant.highlightSection!), 2000)
    }
  }
}
```

---

## Part X — セクション別行動計測設計 {#part-x}

### X.1 計測セクション定義

| section_id | セクション名 | 計測目的 |
|-----------|------------|---------|
| `hero` | ファーストビュー | ヒーロー画像・コピーの訴求力 |
| `gallery` | 写真ギャラリー | 物件への関心度 |
| `3d_tour` | 3Dバーチャルツアー | 3D体験の利用率 |
| `floor_plan` | 間取り | 間取り関心度 |
| `features` | 特徴・設備 | 物件スペックへの反応 |
| `price` | 価格・費用 | 価格への反応・離脱ポイント |
| `access` | 交通・立地 | 立地訴求の効果 |
| `area_info` | 周辺環境 | 生活環境訴求の効果 |
| `video` | 紹介動画 | 動画視聴率 |
| `cta` | CTA（問い合わせ） | コンバージョン直前の行動 |
| `chat` | AIチャット | チャット利用率・質問傾向 |

### X.2 behavior_logs イベント種別

| event_type | 発生タイミング | dwell_ms |
|-----------|-------------|---------|
| `page_view` | ページ読み込み完了時 | — |
| `section_enter` | セクションが画面に50%入った時 | — |
| `section_exit` | セクションが画面から50%出た時 | セクション滞在時間 |
| `cta_click` | CTAボタンクリック時 | — |
| `video_play` | 動画再生ボタンクリック時 | — |
| `video_complete` | 動画視聴完了時（95%以上） | — |
| `tour_start` | 3Dツアー開始時 | — |
| `tour_complete` | 3Dツアー完了時 | ツアー滞在時間 |
| `chat_start` | AIチャット開始時 | — |
| `share_click` | SNSシェアボタンクリック時 | — |
| `ar_launch` | ARボタンクリック時 | — |
| `scroll_depth` | スクロール率25/50/75/100%到達時 | — |

### X.3 セクション別ファネル分析（Grafanaダッシュボード）

```
100% ── ページ訪問
 85% ── heroセクション到達（平均滞在: 12秒）
 72% ── galleryセクション到達（平均滞在: 28秒）
 58% ── 3d_tourセクション到達（平均滞在: 45秒）
 45% ── featuresセクション到達（平均滞在: 18秒）
 32% ── priceセクション到達（平均滞在: 22秒）  ← ここで大きな離脱
 28% ── accessセクション到達
 18% ── videoセクション到達（動画再生率: 65%）
 12% ── ctaセクション到達
  3% ── CTA クリック（問い合わせ）← CVR 3%

改善トリガー例:
  priceセクション離脱率 > 70%
  → improvement_queue に 'price_section_dropout' を登録
  → ImprovementAgent が周辺相場情報・費用シミュレーション追加を提案
```

---

## Part Y — 動画SEO・VideoSitemap設計 {#part-y}

### Y.1 三点露出戦略

```
1本の物件紹介動画から3つの検索露出を獲得:

① Google動画検索
   VideoSitemap → Google Search Console登録
   → 「相武台 新築 4LDK」で動画リッチリザルト表示

② YouTube検索
   YouTube Data API v3 → 動画アップロード自動化
   → youtube.com 内検索でヒット
   → YouTube Shorts（縦型版）も並行アップロード

③ Google不動産
   schema.org/PropertyListing → 構造化データ
   → Google不動産タブでのリッチリザルト
```

### Y.2 VideoSitemap自動生成

```typescript
// lib/seo/VideoSitemapGenerator.ts

export class VideoSitemapGenerator {
  async generateEntry(scene: SceneConfig, videoUrl: string): Promise<string> {
    const prop = scene.property
    const seoConfig = scene.seoConfig

    return `
<url>
  <loc>${scene.assets.heroImageUrl ? `https://sisliR.com/lp/${scene.sceneId}` : ''}</loc>
  <video:video>
    <video:thumbnail_loc>${scene.assets.snsAssets.youtubeThumbnailUrl}</video:thumbnail_loc>
    <video:title>${this.escapeXml(seoConfig.youtubeTitle ?? `${prop.name} 物件紹介`)}</video:title>
    <video:description>${this.escapeXml(seoConfig.youtubeDescription ?? prop.description ?? '')}</video:description>
    <video:content_loc>${videoUrl}</video:content_loc>
    <video:duration>${seoConfig.videoSitemapDurationSec ?? 60}</video:duration>
    <video:publication_date>${scene.publishedAt ?? scene.createdAt}</video:publication_date>
    <video:family_friendly>yes</video:family_friendly>
    <video:uploader info="https://sisliR.com">${this.escapeXml(prop.agencyName ?? '')}</video:uploader>
    <video:tag>${prop.pref ?? ''}</video:tag>
    <video:tag>${prop.city ?? ''}</video:tag>
    <video:tag>${prop.layout ?? ''}</video:tag>
    <video:tag>不動産</video:tag>
    <video:tag>新築</video:tag>
  </video:video>
</url>`
  }
}
```

### Y.3 llms.txt / AI検索SEO対応

```markdown
<!-- https://sisliR.com/lp/{sceneId}/llms.txt として配置 -->
# {物件名}

> {キャッチコピー}

## 物件概要
- 所在地: {address}
- 価格: {price}万円
- 間取り: {layout}
- 面積: 土地{landArea}㎡ / 建物{buildingArea}㎡
- 交通: {access}

## 特徴
{features を箇条書き}

## 詳細情報
- 構造: {structure}
- 築年月: {builtYear}年
- 取引態様: {transactionType}
- 免許番号: {realtorLicense}

## お問い合わせ
- 会社名: {agencyName}
- 問い合わせ: {leadConfig.inquiryFormUrl}
- 電話: {leadConfig.phoneNumber}

## AI注記
※本コンテンツはAIが生成しています。詳細は担当者にご確認ください。
```

### Y.4 schema.org/PropertyListing 構造化データ

```typescript
// lib/seo/StructuredDataGenerator.ts

export function generatePropertyListingStructuredData(scene: SceneConfig): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'PropertyListing',
    name:         scene.property.name,
    description:  scene.property.description,
    url:          `https://sisliR.com/lp/${scene.sceneId}`,
    image:        scene.assets.heroImageUrl,
    datePosted:   scene.publishedAt ?? scene.createdAt,
    price:        scene.property.price ? `${scene.property.price}` : undefined,
    priceCurrency: 'JPY',
    address: {
      '@type': 'PostalAddress',
      addressLocality: scene.property.city,
      addressRegion:   scene.property.pref,
      streetAddress:   scene.property.address,
      addressCountry:  'JP',
    },
    floorSize: scene.property.buildingArea ? {
      '@type': 'QuantitativeValue',
      value:    scene.property.buildingArea,
      unitCode: 'MTK',
    } : undefined,
    numberOfRooms: scene.property.layout,
    video: scene.assets.videoSlideshowUrl ? {
      '@type':       'VideoObject',
      name:          scene.seoConfig.youtubeTitle,
      description:   scene.seoConfig.youtubeDescription,
      thumbnailUrl:  scene.assets.snsAssets.youtubeThumbnailUrl,
      contentUrl:    scene.assets.videoSlideshowUrl,
      uploadDate:    scene.publishedAt ?? scene.createdAt,
    } : undefined,
  }
}
```

---

## Part Z — 反響最大化・ポータル・CMS設計 {#part-z}

### Z.1 反響CMS（担当者向け）

```
反響CMS機能一覧:

① リード一覧（テナント分離・RLS）
   - 新着リード通知（メール / LINE通知）
   - ステータス管理（new → contacted → preview → negotiation → applied → contracted | lost）
   - 担当者アサイン
   - 次回アクション登録（カレンダー連携）

② 物件別反響ダッシュボード
   - UTMチャネル別リード数
   - セクション別ファネル（どこで離脱しているか）
   - A/Bテスト結果
   - 動画視聴率
   - 改善提案（ImprovementAgent）

③ 自動改善管理
   - 改善提案の承認・却下
   - 実行結果の確認
   - A/Bテスト設定
```

### Z.2 メール自動取り込み設計

```
ポータルからの反響メール
（SUUMO / HOME'S / アットホームからの自動送信メール）
        ↓
メール受信サーバー（Cloudflare Email Routing等）
        ↓
Webhook → /api/email-intake
        ↓
EmailParser（Claude API）
  → 物件名・連絡先・問い合わせ内容を抽出
  → email_hashで重複チェック
        ↓
leads テーブルに登録
  source = 'suumo' | 'homes' | 'athome'
  auto_parsed = true
        ↓
担当者に新着通知
```

```typescript
// app/api/email-intake/route.ts

export async function POST(req: NextRequest) {
  const body = await req.json()
  const emailHash = await sha3(body.rawEmail)

  // 重複チェック
  const existing = await supabase
    .from('email_intake_logs')
    .select('id')
    .eq('email_hash', emailHash)
    .single()
  if (existing.data) return NextResponse.json({ status: 'duplicate' })

  // Claude APIでメール本文を解析
  const parsed = await callAI({
    task: 'extraction',
    system: EMAIL_PARSE_SYSTEM_PROMPT,
    user: body.rawEmail,
  })

  let parsedData: { propertyId?: string; source?: string; contactType?: string } = {}
  try {
    parsedData = JSON.parse(parsed)
  } catch { /* 解析失敗 */ }

  // email_intake_logsに記録
  await supabase.from('email_intake_logs').insert({
    received_at:  new Date().toISOString(),
    source:       parsedData.source ?? 'unknown',
    email_hash:   emailHash,
    parse_status: parsedData.propertyId ? 'success' : 'failed',
  })

  // リード登録
  if (parsedData.propertyId) {
    await supabase.from('leads').insert({
      property_id:   parsedData.propertyId,
      tenant_id:     await getTenantIdByProperty(parsedData.propertyId),
      source:        parsedData.source ?? 'portal',
      contact_type:  parsedData.contactType ?? 'inquiry',
      auto_parsed:   true,
      raw_email_hash: emailHash,
    })
  }

  return NextResponse.json({ status: 'ok' })
}

const EMAIL_PARSE_SYSTEM_PROMPT = `
あなたは不動産反響メールの解析AIです。
メール本文から以下の情報をJSON形式で抽出してください:
{
  "propertyId": "物件ID（メール内のURLから取得）",
  "source": "suumo | homes | athome | unknown",
  "contactType": "inquiry | reservation | visit",
  "propertyName": "物件名"
}
情報が取得できない場合はnullを入力してください。
JSONのみを出力し、前後の説明文は不要です。
`
```

### Z.3 独自不動産ポータル設計（Phase 3〜）

#### Z.3.1 ポータル設計思想

```
SisliR が生成した全物件LP を
公開・検索・発見できる独自ポータル

差別化:
  - 全物件が3D Gaussian Splat LP付き
  - 動画付き（スライドショー / シネマティック）
  - AR内覧対応（USDZ）
  - AI物件コンシェルジュ（RAGチャット）
  - セクション別反響データを公開（人気の間取りランキング等）

収益:
  - 掲載料（無料〜有料プラン）
  - リード手数料
  - ポータル広告
```

#### Z.3.2 ポータル検索設計

```typescript
// ポータル検索API（pgvectorセマンティック検索）

export async function searchProperties(query: {
  text?:        string   // フリーワード
  pref?:        string   // 都道府県
  city?:        string   // 市区町村
  priceMin?:    number
  priceMax?:    number
  layout?:      string
  propertyType?: string
}): Promise<Property[]> {
  // テキスト検索: pgvectorセマンティック検索
  if (query.text) {
    const embedding = await generateEmbedding(query.text)
    return supabase.rpc('search_properties_semantic', {
      query_embedding: embedding,
      pref:     query.pref,
      city:     query.city,
      price_min: query.priceMin,
      price_max: query.priceMax,
    })
  }

  // 条件絞り込み検索
  return supabase.from('properties')
    .select('*')
    .eq('status', 'published')
    .eq('pref', query.pref ?? '')
    .gte('price', query.priceMin ?? 0)
    .lte('price', query.priceMax ?? 999999999)
    .order('created_at', { ascending: false })
}
```

### Z.4 注文住宅ポータル設計（builders）

```
portal-builders:
  /builders                     工務店・HMリスト（都道府県別）
  /builders/{slug}              工務店詳細ページ（会社情報・施工事例・スペック）
  /builders/{slug}/works        施工事例（SisliR生成LP一覧）
  /builders/{slug}/contact      問い合わせ
  /compare                      工務店比較機能（最大3社）

SEO戦略:
  /builders/kanagawa/yamato     「大和市 注文住宅 工務店」でSEOヒット
  /builders/tokyo/setagaya      「世田谷区 注文住宅」

コンテンツ取得:
  自動: Googleマップ・公式サイトスクレイピング（法的注意・robots.txt遵守）
  手動: 工務店の担当者によるダッシュボード入力
  AI:   Claude APIによる会社情報の要約・特徴抽出
```
---

## Part AA — テスト戦略（v10.0新規） {#part-aa}

### AA.1 設計思想

```
原則:
  「テストは設計の一部である」
  実装と同時にテストを書く。Claude Codeへの指示にも
  テスト仕様を含めることで、生成コードの品質を担保する。

4層テストピラミッド:
  Layer 1: Unit Tests      (カバレッジ目標: 80%+)
  Layer 2: Integration Tests (主要フロー: 100%)
  Layer 3: E2E Tests        (Critical Path: 5本)
  Layer 4: Load Tests       (SLO達成確認)

CI実行順序:
  Push → Lint/TypeCheck → Unit → Integration → (PR only) E2E
  Merge to main → 全テスト → Load Test（週次）
```

### AA.2 テストフレームワーク

| 層 | ツール | 用途 |
|----|--------|------|
| Unit | Vitest | 純関数・クラス・Zodスキーマ |
| Integration | Vitest + Supabase Test Client | DB・APIエンドポイント |
| E2E | Playwright | ブラウザ操作・Critical Path |
| Load | k6 | API負荷・SLO達成確認 |
| Visual Regression | Playwright + pixelmatch | LP描画確認 |
| RLS侵害テスト | Vitest + Supabase Test Client | テナント分離確認 |

### AA.3 テストデータファクトリー

```typescript
// shared/testing/factories.ts
// ADR-100: テストデータファクトリーは共通管理

import { SceneSchema, PropertyInfoSchema } from '../schemas/scene'

export const createTestProperty = (overrides?: Partial<PropertyInfo>): PropertyInfo => ({
  propertyType: 'newBuild',
  name:         'テスト新築物件',
  address:      '神奈川県秦野市テスト1-2-3',
  pref:         '神奈川県',
  city:         '秦野市',
  price:        35000000,
  landArea:     125.5,
  buildingArea: 98.3,
  layout:       '4LDK',
  access:       '小田急小田原線「秦野」駅 徒歩12分',
  catchCopy:    '秦野の自然の中で育む、家族の笑顔',
  description:  'テスト物件説明文。AI生成の品質チェック用。',
  features:     ['南向きリビング', '床暖房完備', '収納充実'],
  agencyName:   'テスト不動産株式会社',
  realtorLicense: '神奈川県知事（1）第99999号',
  ...overrides,
})

export const createTestScene = (overrides?: Partial<SceneConfig>): SceneConfig => {
  const now = new Date().toISOString()
  return SceneSchema.parse({
    version:    '10.0.0',
    sceneId:    '00000000-0000-0000-0000-000000000001',
    propertyId: '00000000-0000-0000-0000-000000000002',
    agencyId:   '00000000-0000-0000-0000-000000000003',
    property:   createTestProperty(),
    createdAt:  now,
    updatedAt:  now,
    ...overrides,
  })
}

export const createTestTenant = () => ({
  id:   '00000000-0000-0000-0000-000000000010',
  name: 'テストテナント',
  plan: 'growth',
})

export const createTestAgent = (tenantId: string) => ({
  id:        '00000000-0000-0000-0000-000000000011',
  tenant_id: tenantId,
  user_id:   '00000000-0000-0000-0000-000000000012',
  role:      'admin',
})
```

### AA.4 Unit Tests

```typescript
// tests/unit/QualityChecker.test.ts
import { describe, it, expect } from 'vitest'
import { QualityChecker } from '../../lib/agent/QualityChecker'

describe('QualityChecker', () => {
  const checker = new QualityChecker()

  describe('checkCatchCopy', () => {
    it('正常なキャッチコピーはパスする', () => {
      const result = checker.checkCatchCopy('秦野の自然の中で育む、家族の笑顔')
      expect(result.passed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('禁止語「最高」を含む場合は失敗する', () => {
      const result = checker.checkCatchCopy('最高の住まいがここにあります')
      expect(result.passed).toBe(false)
      expect(result.violations).toContain('最高')
    })

    it('15文字未満は失敗する', () => {
      const result = checker.checkCatchCopy('短すぎる')
      expect(result.passed).toBe(false)
    })

    it('40文字超は失敗する', () => {
      const result = checker.checkCatchCopy('a'.repeat(41))
      expect(result.passed).toBe(false)
    })
  })

  describe('checkSeoMeta', () => {
    it('正常なメタタグはパスする', () => {
      const result = checker.checkSeoMeta({
        title:       '秦野市 新築4LDK | テスト不動産',
        description: '神奈川県秦野市の新築4LDK物件。3500万円台。秦野駅徒歩12分。南向きリビング・床暖房完備の人気物件です。',
      })
      expect(result.passed).toBe(true)
    })
  })
})

// tests/unit/SceneSchema.test.ts
describe('SceneSchema', () => {
  it('v10.0.0のSceneJSONを正しくパースする', () => {
    const scene = createTestScene()
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(true)
  })

  it('バージョンが異なる場合はsafeParseがfalseを返す', () => {
    const scene = { ...createTestScene(), version: '9.0.0' }
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(false)
  })
})

// tests/unit/SceneAdapter.test.ts
describe('SceneAdapter', () => {
  it('v8.0.0のJSONをv10.0.0に変換できる', () => {
    const v8Scene = {
      version:    '8.0.0',
      sceneId:    '00000000-0000-0000-0000-000000000001',
      propertyId: '00000000-0000-0000-0000-000000000002',
      agencyId:   '00000000-0000-0000-0000-000000000003',
      property:   createTestProperty(),
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    }
    const adapted = adaptSceneJson(v8Scene)
    expect(adapted.version).toBe('10.0.0')
    expect(adapted.thumbnailConfig).toBeDefined()
    expect(adapted.dynamicLp).toBeDefined()
  })

  it('v9.1.0のJSONをv10.0.0に変換できる', () => {
    const v91Scene = { ...createTestScene(), version: '9.1.0' as any }
    const adapted = adaptSceneJson(v91Scene as any)
    expect(adapted.version).toBe('10.0.0')
    expect(adapted.property.prefCode).toBeUndefined()  // デフォルトundefined
  })
})

// tests/unit/VideoGeneratorRouter.test.ts
describe('VideoGeneratorRouter', () => {
  it('Higgsfield正常時はHiggsfieldを使用する', async () => {
    const router = new VideoGeneratorRouter()
    vi.spyOn(HiggsfieldProvider.prototype, 'healthCheck').mockResolvedValue(true)
    vi.spyOn(HiggsfieldProvider.prototype, 'generate').mockResolvedValue({
      url: 'https://r2.example.com/video.mp4',
      provider: 'higgsfield',
      durationSec: 60,
      cost: 10,
    })
    const result = await router.generate({ ...createVideoRequest(), track: 'cinematic' })
    expect(result.provider).toBe('higgsfield')
  })

  it('Higgsfield障害時はRunway Gen-4にフォールバックする', async () => {
    const router = new VideoGeneratorRouter()
    vi.spyOn(HiggsfieldProvider.prototype, 'healthCheck').mockRejectedValue(new Error('timeout'))
    vi.spyOn(RunwayGen4Provider.prototype, 'healthCheck').mockResolvedValue(true)
    vi.spyOn(RunwayGen4Provider.prototype, 'generate').mockResolvedValue({
      url: 'https://r2.example.com/video.mp4',
      provider: 'runway_gen4',
      durationSec: 60,
      cost: 8,
    })
    const result = await router.generate({ ...createVideoRequest(), track: 'cinematic' })
    expect(result.provider).toBe('runway_gen4')
  })

  it('全プロバイダー障害時はエラーをスローする', async () => {
    const router = new VideoGeneratorRouter()
    vi.spyOn(HiggsfieldProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(RunwayGen4Provider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(KlingAIProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(OpenCutProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(FfmpegProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    await expect(router.generate(createVideoRequest())).rejects.toThrow('全プロバイダーで動画生成に失敗しました')
  })
})

// tests/unit/SectionBeacon.test.ts
describe('SectionBeacon', () => {
  it('300ms以内の連続enterイベントはデバウンスされる', async () => {
    const beacon = new SectionBeacon({ sceneId: 'test', sessionId: 'sess' })
    const sendSpy = vi.spyOn(beacon as any, 'beacon')

    // 100ms間隔で2回enterをトリガー（デバウンス内）
    beacon['handleEntry']('price', true)
    await sleep(100)
    beacon['handleEntry']('price', true)

    await sleep(400)  // デバウンス完了を待つ
    expect(sendSpy).toHaveBeenCalledTimes(1)  // 1回のみ
  })

  it('300ms超の間隔では両方のイベントが記録される', async () => {
    const beacon = new SectionBeacon({ sceneId: 'test', sessionId: 'sess' })
    const sendSpy = vi.spyOn(beacon as any, 'beacon')

    beacon['handleEntry']('gallery', true)
    await sleep(400)  // デバウンス超過
    beacon['handleEntry']('features', true)

    await sleep(400)
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })
})
```

### AA.5 Integration Tests

```typescript
// tests/integration/api/lead.test.ts
describe('POST /api/lead', () => {
  beforeEach(async () => {
    await cleanupTestLeads()
  })

  it('正常なリードを登録できる', async () => {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId:   TEST_PROPERTY_ID,
        sceneId:      TEST_SCENE_ID,
        contactType:  'inquiry',
        utmParams:    { utm_source: 'suumo', utm_medium: 'portal' },
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('created')

    // DBに登録されているか確認
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('property_id', TEST_PROPERTY_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(lead?.source).toBe('lp')
    expect(lead?.utm_source).toBe('suumo')
  })

  it('24時間以内の重複リードはduplicateを返す', async () => {
    // 1回目
    await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: TEST_PROPERTY_ID, contactType: 'inquiry' }),
    })
    // 2回目（同じセッション）
    const res2 = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: TEST_PROPERTY_ID, contactType: 'inquiry' }),
    })
    const data2 = await res2.json()
    expect(data2.status).toBe('duplicate')
  })
})

// tests/integration/rls/tenant-isolation.test.ts
// ADR-096: マルチテナントRLS侵害テスト（CIに必須組み込み）
describe('RLS テナント分離テスト', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeAll(async () => {
    tenantA = await createTestTenantWithUser()
    tenantB = await createTestTenantWithUser()
  })

  afterAll(async () => {
    await cleanupTestTenants([tenantA.id, tenantB.id])
  })

  it('テナントAはテナントBの物件を参照できない', async () => {
    // テナントBに物件を作成
    const propB = await createPropertyForTenant(tenantB)

    // テナントAのセッションでテナントBの物件を取得しようとする
    const { data, error } = await supabase
      .auth.setSession(tenantA.session)  // テナントAとして認証
      .then(() => supabase.from('properties').select('*').eq('id', propB.id).single())

    // RLSによりデータが返らないこと
    expect(data).toBeNull()
  })

  it('テナントAはテナントBのleadsを参照できない', async () => {
    const leadB = await createLeadForTenant(tenantB)

    await supabase.auth.setSession(tenantA.session)
    const { data } = await supabase.from('leads').select('*').eq('id', leadB.id).single()

    expect(data).toBeNull()
  })

  it('テナントAはテナントBのbehavior_logsを参照できない', async () => {
    const sceneB = await createSceneForTenant(tenantB)
    await createBehaviorLog(sceneB.id)

    await supabase.auth.setSession(tenantA.session)
    const { data } = await supabase
      .from('behavior_logs')
      .select('*')
      .eq('scene_id', sceneB.id)

    expect(data).toHaveLength(0)
  })
})

// tests/integration/agent/PropertyIntakeAgent.test.ts
describe('PropertyIntakeAgent べき等性テスト', () => {
  it('同じpropertyIdで2回実行しても課金系Stepは1回のみ実行される', async () => {
    const agent = new PropertyIntakeAgent()
    const higgsfieldSpy = vi.spyOn(HiggsfieldProvider.prototype, 'generate')

    await agent.run({ propertyId: TEST_PROPERTY_ID, uploadedFiles: TEST_FILES })
    await agent.run({ propertyId: TEST_PROPERTY_ID, uploadedFiles: TEST_FILES })

    // Higgsfield（課金）は1回のみ呼ばれる
    expect(higgsfieldSpy).toHaveBeenCalledTimes(1)
  })

  it('Step 3完了後にStep 4で失敗した場合、再実行でStep 1〜3はスキップされる', async () => {
    const agent = new PropertyIntakeAgent()
    const step1Spy = vi.spyOn(agent as any, 'runStep1_parse')
    const step2Spy = vi.spyOn(agent as any, 'runStep2_photos')
    const step3Spy = vi.spyOn(agent as any, 'runStep3_thumbnails')

    // Step 4でエラーをシミュレート（Step 3まで完了状態を事前設定）
    await setGenStatus(TEST_PROPERTY_ID, { photo: 'done', thumbnail: 'done' })

    await agent.run({ propertyId: TEST_PROPERTY_ID, uploadedFiles: TEST_FILES })

    expect(step1Spy).toHaveBeenCalledTimes(1)  // 常にStep 1は実行
    expect(step2Spy).not.toHaveBeenCalled()     // Skip
    expect(step3Spy).not.toHaveBeenCalled()     // Skip
  })
})
```

### AA.6 E2E Tests（Playwright）

```typescript
// tests/e2e/critical-paths.spec.ts

test.describe('Critical Path 1: 物件アップロード → LP公開', () => {
  test('CSV + 写真アップロードから30分以内にLPが公開される', async ({ page }) => {
    await page.goto('/dashboard/upload')

    // ファイルアップロード
    await page.setInputFiles('#photo-upload', TEST_PHOTO_PATH)
    await page.setInputFiles('#pdf-upload', TEST_PDF_PATH)
    await page.click('#start-generation')

    // 生成完了を待つ（最大5分）
    await expect(page.locator('#lp-url')).toBeVisible({ timeout: 300000 })

    const lpUrl = await page.locator('#lp-url').inputValue()
    expect(lpUrl).toMatch(/^https:\/\/sisliR\.com\/lp\//)

    // 公開LPに遷移してキャッチコピーが表示されていることを確認
    await page.goto(lpUrl)
    await expect(page.locator('#catch-copy')).toBeVisible()
    await expect(page.locator('#catch-copy')).not.toBeEmpty()
  })
})

test.describe('Critical Path 2: DynamicLP 広告軸切替', () => {
  test('utm_content=axis_living でリビング訴求LPが表示される', async ({ page }) => {
    await page.goto(`/lp/${TEST_SCENE_ID}?utm_content=axis_living&utm_source=meta&utm_medium=cpc`)
    await page.waitForLoadState('networkidle')

    const heroSrc = await page.locator('#hero-image').getAttribute('src')
    // リビング用ヒーロー画像が設定されていること
    expect(heroSrc).toContain('living')

    const catchCopy = await page.locator('#catch-copy').textContent()
    expect(catchCopy).not.toBe('')
  })
})

test.describe('Critical Path 3: リード計測 → UTM記録', () => {
  test('UTMパラメータ付きでCTAクリックするとleadsにUTMが記録される', async ({ page }) => {
    await page.goto(`/lp/${TEST_SCENE_ID}?utm_source=suumo&utm_medium=portal&utm_campaign=test`)
    await page.click('#cta-button')

    // フォーム送信
    await page.fill('#inquiry-form textarea', 'テストお問い合わせ')
    await page.click('#inquiry-form button[type=submit]')

    // DBにUTMが記録されているか確認
    await page.waitForTimeout(2000)
    const lead = await getLatestLead(TEST_SCENE_ID)
    expect(lead?.utm_source).toBe('suumo')
    expect(lead?.utm_medium).toBe('portal')
  })
})

test.describe('Critical Path 4: A/Bテスト バリアント表示', () => {
  test('セッションIDが同じなら毎回同じバリアントが表示される', async ({ browser }) => {
    // 同じsessionStorageを使用する2ページを開く
    const context = await browser.newContext()
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    await page1.goto(`/lp/${TEST_SCENE_ID}`)
    const variant1 = await page1.locator('#ab-variant-id').getAttribute('data-variant')

    await page2.goto(`/lp/${TEST_SCENE_ID}`)
    const variant2 = await page2.locator('#ab-variant-id').getAttribute('data-variant')

    expect(variant1).toBe(variant2)
    await context.close()
  })
})

test.describe('Critical Path 5: テナント分離 UI確認', () => {
  test('テナントAでログインするとテナントBの物件は表示されない', async ({ page }) => {
    await loginAsTenantA(page)
    await page.goto('/dashboard/properties')

    const propertyIds = await page.locator('[data-property-id]').allTextContents()
    expect(propertyIds).not.toContain(TENANT_B_PROPERTY_ID)
  })
})
```

### AA.7 Load Tests（k6）

```javascript
// tests/load/lp-runtime.js
import http from 'k6/http'
import { sleep, check } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 50  },   // ランプアップ
    { duration: '3m', target: 100 },   // 定常負荷
    { duration: '1m', target: 0   },   // ランプダウン
  ],
  thresholds: {
    // SLO: LP読み込み 95%ile が 2秒以内（Part BB参照）
    'http_req_duration': ['p(95)<2000'],
    // エラー率 0.1% 以下
    'http_req_failed':   ['rate<0.001'],
  },
}

export default function () {
  const res = http.get(`https://sisliR.com/lp/${LOAD_TEST_SCENE_ID}`)
  check(res, {
    'status is 200':       (r) => r.status === 200,
    'response time < 2s':  (r) => r.timings.duration < 2000,
    'catch copy exists':   (r) => r.body.includes('catch-copy'),
  })
  sleep(1)
}
```

### AA.8 CIパイプライン設定

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck:
    name: Lint & TypeCheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    name: Unit Tests
    needs: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v4
        with:
          fail_ci_if_error: true
          threshold: 80  # カバレッジ80%未満でCI失敗

  integration-tests:
    name: Integration Tests (incl. RLS)
    needs: unit-tests
    runs-on: ubuntu-latest
    env:
      SUPABASE_URL:    ${{ secrets.TEST_SUPABASE_URL }}
      SUPABASE_SECRET_KEY: ${{ secrets.TEST_SUPABASE_SECRET_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:integration  # RLS侵害テスト含む（ADR-096）

  e2e-tests:
    name: E2E Tests (Critical Paths)
    needs: integration-tests
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  load-tests:
    name: Load Tests (SLO Check)
    needs: integration-tests
    if: github.ref == 'refs/heads/main'  # mainマージ時のみ
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - run: k6 run tests/load/lp-runtime.js
```

### AA.9 テストカバレッジ目標

| カテゴリ | 目標カバレッジ | 優先度 |
|---------|-------------|-------|
| Zodスキーマ（Scene JSON・全バリアント） | 100% | 最高 |
| QualityChecker（全禁止語パターン） | 100% | 最高 |
| SceneAdapter（全バージョン変換） | 100% | 最高 |
| VideoGeneratorRouter（全フォールバック） | 100% | 最高 |
| SectionBeacon（デバウンス・iOS Safari） | 100% | 最高 |
| PropertyIntakeAgent（べき等性・全Step） | 90%+ | 高 |
| ThumbnailGenerator | 80%+ | 高 |
| UTMGenerator | 100% | 高 |
| API エンドポイント | 80%+ | 高 |
| UI コンポーネント | 60%+ | 中 |
| **全体目標** | **80%+** | — |

---

## Part BB — 可観測性・監視設計（v10.0新規） {#part-bb}

### BB.1 設計思想

```
原則: 「測定できないものは改善できない」（ADR-091）

3本柱:
  Traces  → OpenTelemetry → Grafana Tempo
  Metrics → OpenTelemetry → Grafana Cloud（Prometheus互換）
  Logs    → 構造化ログ → Grafana Loki

全MCPサーバー・全エージェントステップ・全外部API呼び出しに
スパンを設定し、エンドツーエンドの処理時間と失敗率を可視化する。
```

### BB.2 OpenTelemetry初期設定

```typescript
// lib/observability/tracer.ts

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { trace, metrics } from '@opentelemetry/api'

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:    'sisliR-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: '10.0.0',
    environment: process.env.NODE_ENV,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: { Authorization: `Bearer ${process.env.GRAFANA_CLOUD_TOKEN}` },
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
      headers: { Authorization: `Bearer ${process.env.GRAFANA_CLOUD_TOKEN}` },
    }),
    exportIntervalMillis: 60000,  // 1分ごとにメトリクスをエクスポート
  }),
})

sdk.start()

export const tracer = trace.getTracer('sisliR', '10.0.0')
export const meter  = metrics.getMeter('sisliR', '10.0.0')

// カスタムメトリクス
export const agentDuration       = meter.createHistogram('agent.duration_ms',       { description: 'エージェント実行時間' })
export const apiCallCounter      = meter.createCounter('api.calls_total',           { description: 'API呼び出し回数' })
export const leadCreatedCounter  = meter.createCounter('leads.created_total',       { description: 'リード生成数' })
export const videoGenSuccessRate = meter.createObservableGauge('video.success_rate',{ description: '動画生成成功率' })
export const lpLoadDuration      = meter.createHistogram('lp.load_duration_ms',     { description: 'LP読み込み時間' })
```

### BB.3 SLO / SLI 定義

| サービス | SLI指標 | SLO目標 | アラート閾値 |
|---------|---------|---------|-----------|
| LP読み込み | P95レイテンシ | < 2,000ms | > 2,500ms（5分間） |
| LP読み込み | エラー率 | < 0.1% | > 0.5%（5分間） |
| PropertyIntakeAgent | 成功率 | ≥ 99.5% | < 99%（30分間） |
| 動画生成 | 成功率 | ≥ 95% | < 90%（1時間） |
| APIエンドポイント全体 | P99レイテンシ | < 5,000ms | > 7,000ms（5分間） |
| Supabase接続 | エラー率 | < 0.1% | > 0.5%（5分間） |
| Higgsfield API | 成功率 | ≥ 90% | < 80%（30分間）|
| R2アップロード | 成功率 | ≥ 99.9% | < 99%（5分間） |
| リード登録 | エラー率 | < 0.01% | > 0.1%（5分間） |

### BB.4 構造化ログ設計

```typescript
// lib/observability/logger.ts

import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'sisliR-api',
    version: '10.0.0',
    env:     process.env.NODE_ENV,
  },
  // Grafana Loki向けのフォーマット
  transport: process.env.NODE_ENV === 'production'
    ? { target: '@logtail/pino' }
    : { target: 'pino-pretty' },
})

// 標準ログフィールド定義
export function logAgentStep(params: {
  propertyId: string
  step:       string
  status:     'start' | 'success' | 'error' | 'skip'
  durationMs?: number
  error?:      Error
}): void {
  const level = params.status === 'error' ? 'error' : 'info'
  logger[level]({
    event:       'agent.step',
    property_id: params.propertyId,
    step:        params.step,
    status:      params.status,
    duration_ms: params.durationMs,
    err:         params.error ? { message: params.error.message, stack: params.error.stack } : undefined,
  })
}

export function logApiCall(params: {
  api:        string
  method:     string
  statusCode: number
  durationMs: number
  tenantId?:  string
}): void {
  logger.info({
    event:       'api.call',
    api:         params.api,
    method:      params.method,
    status_code: params.statusCode,
    duration_ms: params.durationMs,
    tenant_id:   params.tenantId,
  })
}
```

### BB.5 Grafana Cloudダッシュボード設計

#### ダッシュボード 1: エージェント実行状況

```
パネル構成:
  1. 今日の物件生成数（Counter）
  2. エージェント成功率（Gauge: 目標99.5%）
  3. エージェント平均実行時間（Stat: 目標< 30分）
  4. Step別実行時間分布（Histogram）
  5. 直近24時間のエラー一覧（Logs: level=error）
  6. プロバイダー別動画生成数（Bar Chart: Higgsfield/Runway/Kling/OpenCut）
```

#### ダッシュボード 2: LP パフォーマンス

```
パネル構成:
  1. LP P95読み込み時間（Gauge: SLO < 2,000ms）
  2. LP エラー率（Gauge: SLO < 0.1%）
  3. 時間帯別アクセス数（Time Series）
  4. UTMチャネル別セッション数（Pie Chart）
  5. A/Bテスト現在の状況（Table）
  6. 改善キュー待ち件数（Stat）
```

#### ダッシュボード 3: Growth Loop

```
パネル構成:
  1. 今日のリード数（Counter）
  2. チャネル別リード数（Bar Chart）
  3. セクション別平均滞在時間（Heatmap）
  4. CVR推移（Time Series: 目標> 2%）
  5. 改善後CVR変化（Before/After比較）
  6. A/Bテスト勝者（Table）
```

### BB.6 アラート設定

```yaml
# Grafana Alert Rules（Grafana Cloud管理画面で設定）

groups:
  - name: sisliR-critical
    rules:
      - alert: LpHighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5..",path=~"/lp/.*"}[5m]))
          / sum(rate(http_requests_total{path=~"/lp/.*"}[5m])) > 0.005
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "LP エラー率が0.5%を超えています"
          runbook: "https://sisliR.com/runbooks/lp-high-error-rate"

      - alert: AgentSuccessRateLow
        expr: |
          sum(rate(agent_completions_total{status="success"}[30m]))
          / sum(rate(agent_completions_total[30m])) < 0.99
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "PropertyIntakeAgent成功率が99%を下回っています"
          runbook: "https://sisliR.com/runbooks/agent-low-success-rate"

      - alert: VideoGenAllProvidersFailing
        expr: |
          sum(rate(video_generation_total{status="success"}[1h])) == 0
          and sum(rate(video_generation_total[1h])) > 0
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "全動画生成プロバイダーが失敗しています"
          runbook: "https://sisliR.com/runbooks/video-all-providers-failing"

  - name: sisliR-warning
    rules:
      - alert: LpP95LatencyHigh
        expr: |
          histogram_quantile(0.95, rate(lp_load_duration_ms_bucket[5m])) > 2500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "LP P95レイテンシが2.5秒を超えています"

      - alert: HiggsfieldApiErrorHigh
        expr: |
          sum(rate(external_api_calls_total{api="higgsfield",status="error"}[30m]))
          / sum(rate(external_api_calls_total{api="higgsfield"}[30m])) > 0.2
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Higgsfield APIエラー率が20%を超えています（フォールバック動作中の可能性）"

      - alert: MonthlyAICostThreshold
        expr: |
          sum(ai_api_cost_total) > 80000  # 月額8万円超
        labels:
          severity: warning
        annotations:
          summary: "AI APIコストが月間予算の80%に達しました"
```

---

## Part CC — 運用・障害対応設計（v10.0新規） {#part-cc}

### CC.1 通常運用フロー

```
毎日:
  □ Grafana Cloudで昨日のエラー率・成功率を確認（5分）
  □ improvement_queueの承認待ちアイテムを処理（10〜30分）
  □ 新着リードの担当者アサイン確認（5分）

毎週:
  □ k6ロードテスト実行（SLO達成確認）
  □ コスト集計（Claude API / Higgsfield / R2）
  □ A/Bテスト統計的有意差チェック

毎月:
  □ Supabase バックアップ確認
  □ 依存ライブラリのセキュリティアップデート（npm audit）
  □ ADR確認・更新（新しい設計決定があれば追加）
  □ 月次コスト vs 売上 の損益確認
```

### CC.2 障害対応ランブック

#### ランブック 1: PropertyIntakeAgent 失敗

```
症状: エージェントジョブが繰り返し失敗する / タイムアウトが多発

確認手順:
  1. Grafana Cloud → ダッシュボード「エージェント実行状況」確認
  2. Grafana Loki → event=agent.step status=error で直近ログを確認
  3. Supabase → agent_runs テーブルで error_msg を確認
  4. pg-boss → failed_jobs テーブルで失敗ジョブを確認

原因別対処:
  A. Claude API タイムアウト
     → timeout を 120秒に延長（env: AI_TIMEOUT_MS）
     → 対象ジョブを pg-boss で再投入

  B. Claude Vision 間取り解析エラー
     → structureAccuracy が 0.60 未満の場合はマスター管理画面で手動確認
     → 該当物件を手動で再実行（Part OO.6.3 信頼度別ルーティング参照）

  C. Higgsfield API 障害
     → VideoGeneratorRouter の自動フォールバックを確認
     → HIGGSFIELD_DISABLE=true で Higgsfield を一時無効化
     → Runway Gen-4 がフォールバックとして動作することを確認

  D. R2 アップロード失敗
     → Cloudflare Status Page を確認
     → 障害の場合は待機。回復後に再実行
```

#### ランブック 2: LP 高エラー率

```
症状: LpHighErrorRate アラートが発火 / LP が 5xx を返す

確認手順:
  1. Grafana Cloud → LP エラー率の時刻を特定
  2. Grafana Loki → level=error で該当時刻のログを確認
  3. Cloudflare Dashboard → Workers/Pages のエラーを確認
  4. Supabase Dashboard → DB接続数・クエリエラーを確認

原因別対処:
  A. Supabase 接続数上限
     → SUPABASE_CONNECTION_POOL_SIZE を削減
     → Supabase Pro → Enterprise へのアップグレードを検討

  B. Scene JSON パースエラー（バージョン不整合）
     → validateScene を lenient モードに切替（env: SCENE_VALIDATE_MODE=lenient）
     → SceneAdapter の変換処理を確認

  C. R2 CDN 障害
     → Cloudflare Status Page を確認
     → 回復まで静的フォールバックページを表示

  D. Three.js WebGPU レンダリングエラー（クライアント）
     → エラーバウンダリーが WebGL フォールバックを表示しているか確認
     → 特定デバイスでの再現性を確認
```

#### ランブック 3: 全動画生成プロバイダー障害

```
症状: VideoGenAllProvidersFailing アラートが発火

確認手順:
  1. Higgsfield ステータスページを確認
  2. Runway ステータスページを確認
  3. Kling AI ステータスページを確認
  4. VideoGeneratorRouter のログを確認（どのプロバイダーでエラーが出ているか）

対処:
  1. 全プロバイダー本当に障害の場合 → 動画生成ジョブを一時停止
     pg-boss: UPDATE jobs SET state='failed' WHERE name='video-generate' AND state='created'

  2. 1プロバイダーのみ回復した場合 → 該当プロバイダーのみ使用するよう設定変更
     env: VIDEO_PROVIDER_PRIORITY=runway,kling,ffmpeg

  3. 全回復後 → 停止中だったジョブを再投入
     pg-boss: CALL reschedule_failed_video_jobs()
```

#### ランブック 4: テナントデータ漏洩が疑われる場合

```
症状: あるテナントが他テナントのデータを参照できたと報告

初動（30分以内）:
  1. 報告を受けたテナントの access_log を確認
  2. 疑いのある SQL クエリを特定
  3. 必要であれば該当テナントのセッションを強制ログアウト
     supabase.auth.admin.signOut(userId)
  4. Supabase Dashboard → Auth → Logs でアクセス履歴を確認

調査:
  1. RLS ポリシーが正しく適用されているか確認
     SELECT * FROM pg_policies WHERE tablename = 'properties';
  2. 問題のあるクエリを再現してテスト
  3. RLS 侵害テスト（Part AA参照）を手動実行

報告:
  1. インシデントレポートを作成（発生時刻・影響範囲・対処内容）
  2. 個人情報保護法の観点から法的対応を検討
  3. 影響を受けたテナントへの通知を検討
```

### CC.3 エスカレーションマトリクス

| 重大度 | 条件 | 初動時間 | 対応者 |
|--------|------|---------|-------|
| P0（致命的） | LP全停止 / データ漏洩疑い / 全エージェント停止 | 15分以内 | 開発者（24h対応） |
| P1（重大） | エラー率 > 1% / SLO違反継続30分以上 / 全動画プロバイダー障害 | 1時間以内 | 開発者（業務時間内） |
| P2（軽微） | 特定機能の不具合 / 単一プロバイダー障害 | 翌業務日 | 開発者 |
| P3（情報） | コスト超過警告 / SLO緩やかな悪化 | 週次確認 | 開発者 |

### CC.4 コスト監視・キャパシティプランニング

#### コストアラート設定

```typescript
// lib/cost/CostMonitor.ts

export class CostMonitor {
  // 月次AIコストを追跡（pg-bossで日次実行）
  async checkMonthlyCost(tenantId: string): Promise<void> {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const usage = await supabase
      .from('api_cost_logs')
      .select('cost_jpy')
      .eq('tenant_id', tenantId)
      .gte('created_at', `${currentMonth}-01`)
      .then(({ data }) => data?.reduce((sum, r) => sum + r.cost_jpy, 0) ?? 0)

    const MONTHLY_BUDGET_ALERT_THRESHOLD_JPY = 80000  // 8万円

    if (usage > MONTHLY_BUDGET_ALERT_THRESHOLD_JPY) {
      // Grafana アラートも発火（BB.6参照）
      logger.warn({
        event:     'cost.monthly_threshold_exceeded',
        tenant_id: tenantId,
        usage_jpy: usage,
        budget_jpy: MONTHLY_BUDGET_ALERT_THRESHOLD_JPY,
      })
      await this.notifyAdmin(tenantId, usage)
    }
  }

  // Higgsfield クレジット残量確認（動画生成前に必須）
  async checkHiggsfieldCredit(tenantId: string): Promise<{ sufficient: boolean; remaining: number }> {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const { data } = await supabase
      .from('higgsfield_credit_usage')
      .select('credits_used')
      .eq('tenant_id', tenantId)
      .eq('year_month', currentMonth)
      .single()

    const limit = await this.getTenantCreditLimit(tenantId)
    const used = data?.credits_used ?? 0
    return { sufficient: used < limit, remaining: limit - used }
  }
}
```

#### キャパシティプランニング指標

| 指標 | 現在（1社）| 目標（50社）| スケーリング方法 |
|------|----------|-----------|--------------|
| Supabase接続数 | ~20 | ~500 | Pro → Enterprise |
| pg-boss ワーカー | 2 | 20 | 水平スケール |
| R2ストレージ | ~50GB | ~2.5TB | 従量課金（対応不要） |
| Claude API | ~5万円/月 | ~250万円/月 | Anthropic Volume Discount |
| Cloudflare Pages | 無制限 | 無制限 | 対応不要 |
| Grafana Cloud | Free | Pro（$29/月）| 50社時点でアップグレード |

### CC.5 バックアップ・リカバリー設計

```
バックアップ戦略:
  Supabase DB:
    - Supabase Pro の自動バックアップ（7日間・日次）
    - 週次 pg_dump を Cloudflare R2 に手動保存
    - RPO（目標復旧時点）: 24時間以内
    - RTO（目標復旧時間）: 4時間以内

  Cloudflare R2（アセット）:
    - R2 は地理的冗長化済み（Cloudflare標準）
    - 重要アセット（USDZ / SPZ4）はローカルHDDがSource of Truth
    - R2 障害時はローカルHDDから再アップロード可能

  Scene JSON:
    - DB（Supabase）+ ローカルファイル（08_SceneJSON/）の2重保持
    - ローカルが正しい場合はDBに再投入可能

リカバリー手順:
  1. Supabase バックアップから復元
     supabase db restore --backup-id <id>

  2. R2 アセット欠損時
     node scripts/restore-r2-from-local.ts --project-dir D:\SisliR_Projects\

  3. Scene JSON 欠損時
     node scripts/restore-scenes-from-json.ts --dir D:\SisliR_Projects\
```

---

## 付録: 環境変数一覧（v10.0確定版）

```bash
# ── Supabase ─────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx   # 旧anon_key（2026年Q4移行）
SUPABASE_SECRET_KEY=sb_secret_xxx                          # 旧service_role_key（2026年Q4移行）

# ── AI ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxx
AI_TIMEOUT_MS=120000

# ── 動画生成（VideoGeneratorRouter）─────────────────────────
HIGGSFIELD_API_KEY=xxx
HIGGSFIELD_DISABLE=false                     # 緊急無効化フラグ
RUNWAY_API_KEY=xxx                           # v10.0追加（ADR-090）
KLING_API_KEY=xxx                            # v10.0追加（ADR-090）
VIDEO_PROVIDER_PRIORITY=higgsfield,runway,kling,opencut,ffmpeg  # v10.0追加

# ── ストレージ ────────────────────────────────────────────────
CLOUDFLARE_R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=xxx
CLOUDFLARE_R2_SECRET_KEY=xxx
CLOUDFLARE_R2_BUCKET=sisliR-assets
LOCAL_PROJECTS_DIR=D:\SisliR_Projects

# ── 可観測性（v10.0追加）─────────────────────────────────────
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/metrics
GRAFANA_CLOUD_TOKEN=glc_xxx
LOG_LEVEL=info

# ── テスト設定 ───────────────────────────────────────────────
SCENE_VALIDATE_MODE=strict    # 通常: strict / 移行中: lenient
FLOORPLAN_VLM_FALLBACK=auto   # auto（ライセンスNG時にClaude Visionへ自動切替）

# ── Stripe（課金）────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ── LINE（リード）────────────────────────────────────────────
LINE_CHANNEL_ACCESS_TOKEN=xxx
LINE_CHANNEL_SECRET=xxx
```

---

## 付録: CLAUDE.md（Claude Code向けプロジェクト指示）

```markdown
# SisliR v10.0 — Claude Code プロジェクト指示

## このプロジェクトについて
SisliRはAI住宅マーケティングOS+デジタルツイン基盤です。
Turborepo モノレポ。packages/配下が共通パッケージ、apps/配下がアプリケーション。

## 必読設計書
- /docs/design/SisliR_v10_1_partAE.md (ビジョン・技術スタック・スキーマ)
- /docs/design/SisliR_v10_1_partFM.md (エージェント・DB設計)
- /docs/design/SisliR_v10_1_partNR.md (セキュリティ・ADR)
- /docs/design/SisliR_v10_1_partAA_CC.md (テスト・可観測性・運用)
- /docs/design/SisliR_v10_1_partDD.md (OrchestrationLoop・Skill Library・Haltingポリシー)

## 実装ルール（必ず守ること）
1. TypeScript strict mode。any禁止（型が難しければunknown + 型ガード）
2. Scene JSONはSceneSchemaでZodバリデーション必須
3. Supabase操作は必ずRLSが有効なテーブルを使用
4. 外部API呼び出しは必ずOpenTelemetryスパンで囲む
5. MCPサーバーはmcp_sisliR_*の命名規則に従う
6. DBへの書き込みはDrizzle ORMのみ（rawSQL禁止）
7. 個人情報（メール・電話番号）は平文でDBに保存しない（SHA-3ハッシュのみ）
8. テストを必ず書く（Unitテスト最低1本・カバレッジ80%目標）
9. ログはlogger.info/error（console.log禁止）

## ファイル命名規則
- MCPサーバー: apps/mcp/src/servers/mcp_sisliR_{name}/
- エージェント: lib/agent/{Name}Agent.ts
- テスト: tests/unit/{module}.test.ts / tests/integration/{module}.test.ts

## よく使うコマンド
npm run dev      # 開発サーバー起動
npm run test:unit        # Unitテスト
npm run test:integration # Integrationテスト（Supabase接続必要）
npm run typecheck        # 型チェック
npm run lint             # ESLint
```

---

*SisliR v10.1 完全設計書 — 全Part（A〜GG）統合版*
*最終更新: 2026年6月 | v10.1.0*
*次回更新予定: Phase 1完了時（v10.2）*
---

## Part DD — OrchestrationLoop設計（v10.1新規） {#part-dd}

### DD.1 設計思想：ループが主役になる

```
v10.0までの設計:
  人間 → ダッシュボード「生成」ボタン → PropertyIntakeAgent → 終了

v10.1以降の設計:
  人間 → ループを書く → ループが自律的にAgentを起動し続ける

「あなたはAgentにプロンプトを送るのをやめるべきです。
 Agentにプロンプトを送るループを設計すべきです。」
  — Peter Steinberger, June 7, 2026

SisliR における具体的な意味:
  ✗ 担当者が毎朝ダッシュボードを開いて「改善実行」を押す
  ✓ OrchestrationLoopが24時間、反響データを監視し
    必要なAgentを自律的に起動・検証・完了させる
```

### DD.2 ループ階層設計（3層）

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: OrchestrationLoop（最上位・5分ごとにcron）      │
│  役割: 全物件の状態を監視し、起動すべきAgentを決定する     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Layer 2: AgentLoop（タスク単位・pg-boss管理）     │   │
│  │  役割: 1つのAgentタスクをべき等に完走させる        │   │
│  │                                                   │   │
│  │  ┌───────────────────────────────────────────┐   │   │
│  │  │  Layer 3: ToolLoop（Claude内部・MCP呼び出し）│   │   │
│  │  │  役割: 1ステップをツール呼び出しで解決する    │   │   │
│  │  └───────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### DD.3 OrchestrationLoop 実装

```typescript
// lib/loop/OrchestrationLoop.ts
// pg-bossで5分ごとに実行（ADR-101）

export class OrchestrationLoop {
  private readonly MAX_AGENTS_PER_TICK = 10   // 1ティックあたりの最大起動Agent数
  private readonly LOOP_BUDGET_JPY     = 5000 // 1ティックあたりのAPIコスト上限

  async tick(): Promise<LoopTickResult> {
    const span = tracer.startSpan('loop.orchestration.tick')
    const tickStart = Date.now()

    try {
      // ── 1. コスト上限チェック（Haltingポリシー優先） ────────
      const monthlyCost = await this.getMonthlyApiCost()
      if (monthlyCost.total_jpy >= monthlyCost.budget_jpy * 0.95) {
        span.addEvent('loop.halted.cost_limit')
        logger.warn({ event: 'loop.halted', reason: 'monthly_cost_limit', cost: monthlyCost })
        return { halted: true, reason: 'monthly_cost_limit', agentsStarted: 0 }
      }

      // ── 2. 全物件の状態スキャン ──────────────────────────────
      const signals = await this.scanAllProperties()

      // ── 3. 起動すべきAgentタスクを決定 ──────────────────────
      const tasks = this.decideTasks(signals).slice(0, this.MAX_AGENTS_PER_TICK)

      // ── 4. pg-bossにジョブ投入（重複防止付き） ───────────────
      let agentsStarted = 0
      for (const task of tasks) {
        const enqueued = await this.enqueueIfNotRunning(task)
        if (enqueued) agentsStarted++
      }

      span.setAttributes({ 'loop.agents_started': agentsStarted })
      span.setStatus({ code: SpanStatusCode.OK })

      return { halted: false, agentsStarted, tickDurationMs: Date.now() - tickStart }
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  }

  // ── 物件状態スキャン ────────────────────────────────────────
  private async scanAllProperties(): Promise<PropertySignal[]> {
    const signals: PropertySignal[] = []

    // シグナル1: 公開後72時間でリードゼロ
    const noLeadProperties = await supabase.rpc('find_no_lead_properties', {
      hours_since_publish: 72
    })
    for (const p of noLeadProperties.data ?? []) {
      signals.push({ propertyId: p.id, trigger: 'no_lead_72h', priority: 10 })
    }

    // シグナル2: 高直帰率（> 80%・48時間）
    const highBounceProperties = await supabase.rpc('find_high_bounce_properties', {
      bounce_threshold: 0.8, hours: 48
    })
    for (const p of highBounceProperties.data ?? []) {
      signals.push({ propertyId: p.id, trigger: 'high_bounce', priority: 8 })
    }

    // シグナル3: 価格セクション離脱率高い
    const priceDropoutProperties = await supabase.rpc('find_price_dropout_properties', {
      dropout_threshold: 0.7, hours: 48
    })
    for (const p of priceDropoutProperties.data ?? []) {
      signals.push({ propertyId: p.id, trigger: 'price_section_dropout', priority: 7 })
    }

    // シグナル4: A/Bテストの統計的有意差確認
    const abReadyVariants = await supabase.rpc('find_ab_significant_variants')
    for (const v of abReadyVariants.data ?? []) {
      signals.push({ propertyId: v.property_id, trigger: 'ab_test_winner', priority: 9 })
    }

    // シグナル5: improvement_queueの承認済みアイテム
    const approvedImprovements = await supabase
      .from('improvement_queue')
      .select('property_id')
      .eq('status', 'waiting_approval')  // 担当者が承認済み → runningに変更
      .eq('human_approved', true)
    for (const item of approvedImprovements.data ?? []) {
      signals.push({ propertyId: item.property_id, trigger: 'manual', priority: 10 })
    }

    // 優先度順にソート
    return signals.sort((a, b) => b.priority - a.priority)
  }

  // ── タスク決定ロジック ──────────────────────────────────────
  private decideTasks(signals: PropertySignal[]): AgentTask[] {
    return signals.map(s => ({
      jobName:    `agent-${s.trigger}`,
      propertyId: s.propertyId,
      trigger:    s.trigger,
      priority:   s.priority,
    }))
  }

  // ── 重複起動防止付きエンキュー ──────────────────────────────
  private async enqueueIfNotRunning(task: AgentTask): Promise<boolean> {
    const boss = await getBoss()

    // 同一propertyId + jobNameが既に実行中または待機中なら投入しない
    const existing = await boss.getJobById(
      task.jobName,
      `${task.propertyId}_${task.trigger}`
    )
    if (existing && ['created', 'active'].includes(existing.state)) {
      return false
    }

    await boss.send({
      name:    task.jobName,
      data:    { propertyId: task.propertyId, trigger: task.trigger },
      options: {
        id:          `${task.propertyId}_${task.trigger}`,  // 冪等キー
        priority:    task.priority,
        retryLimit:  3,
        retryDelay:  60,
        expireInSeconds: 3600,  // 1時間でタイムアウト（Halting保証）
      },
    })
    return true
  }
}
```

### DD.4 AgentLoop（Layer 2）

```typescript
// lib/loop/AgentLoop.ts
// pg-bossワーカーとして動作。1タスクを完走させる責任を持つ

export class AgentLoop {
  // Haltingポリシー定数（ADR-102）
  private readonly MAX_ITERATIONS   = 5    // 最大反復回数
  private readonly MAX_DURATION_MS  = 1800000  // 最大30分
  private readonly NO_PROGRESS_LIMIT = 2   // 無進捗を2回検知したら停止
  private readonly COST_LIMIT_JPY   = 500  // 1タスクあたりのAPIコスト上限

  async run(task: AgentTask): Promise<AgentLoopResult> {
    const span = tracer.startSpan('loop.agent', {
      attributes: { 'task.trigger': task.trigger, 'property.id': task.propertyId }
    })
    const startTime = Date.now()

    let iteration      = 0
    let noProgressCount = 0
    let lastStateHash  = ''
    let totalCostJpy   = 0

    try {
      while (true) {
        iteration++

        // ── Haltingポリシーチェック（毎イテレーション） ──────────
        const halt = await this.checkHaltConditions({
          iteration, startTime, noProgressCount, totalCostJpy
        })
        if (halt) {
          span.addEvent('loop.halted', { reason: halt.reason, iteration })
          logger.warn({ event: 'agent_loop.halted', ...halt, task })
          await this.recordHalt(task, halt)
          return { status: 'halted', reason: halt.reason, iterations: iteration }
        }

        // ── エージェント実行 ──────────────────────────────────────
        const result = await this.runAgentStep(task, iteration)
        totalCostJpy += result.costJpy

        // ── 進捗チェック（無限ループ検知） ───────────────────────
        const newHash = this.hashState(result.state)
        if (newHash === lastStateHash) {
          noProgressCount++
          span.addEvent('loop.no_progress', { iteration, noProgressCount })
        } else {
          noProgressCount = 0
          lastStateHash   = newHash
        }

        // ── 完了判定 ──────────────────────────────────────────────
        if (result.done) {
          span.setStatus({ code: SpanStatusCode.OK })
          return { status: 'completed', iterations: iteration, costJpy: totalCostJpy }
        }
      }
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  }

  private async checkHaltConditions(state: {
    iteration:      number
    startTime:      number
    noProgressCount: number
    totalCostJpy:   number
  }): Promise<{ reason: string } | null> {
    // 条件1: 最大イテレーション超過
    if (state.iteration > this.MAX_ITERATIONS) {
      return { reason: 'max_iterations_exceeded' }
    }
    // 条件2: タイムアウト
    if (Date.now() - state.startTime > this.MAX_DURATION_MS) {
      return { reason: 'timeout' }
    }
    // 条件3: 無進捗検知
    if (state.noProgressCount >= this.NO_PROGRESS_LIMIT) {
      return { reason: 'no_progress_detected' }
    }
    // 条件4: タスクコスト上限
    if (state.totalCostJpy >= this.COST_LIMIT_JPY) {
      return { reason: 'task_cost_limit_exceeded' }
    }
    return null
  }

  // エージェントステップ実行（ImprovementAgentに委譲）
  private async runAgentStep(task: AgentTask, iteration: number): Promise<AgentStepResult> {
    const agent = new ImprovementAgent()
    return agent.runStep(task, iteration)
  }

  // 状態ハッシュ（無進捗検知用）
  private hashState(state: unknown): string {
    return cyrb53(JSON.stringify(state)).toString()
  }
}
```

### DD.5 Skill Library（再利用可能スキル設計）

```
設計原則（ADR-103）:
  「ループから何度も呼ばれる処理はSkillとして定義する。
   Skillは入力→出力が明確で、副作用が宣言されており、
   単独でテスト可能でなければならない。」

Skill ≠ MCPサーバーの直接呼び出し
Skill = 「何をするか」を名前で表現した再利用可能な関数
```

```typescript
// lib/skills/index.ts
// SkillはOrchestrationLoopからもAgentLoopからも呼べる再利用単位

// ──────────────────────────────────────────────────────────
// 反響改善スキル群
// ──────────────────────────────────────────────────────────

export const Skills = {

  // キャッチコピーを再生成して品質チェックまで行う
  regenerateCatchCopy: async (propertyId: string): Promise<SkillResult<string>> => {
    const scene = await getScene(propertyId)
    const copy  = await CopyGenerator.generate(scene.property)
    const check = new QualityChecker().checkCatchCopy(copy)
    if (!check.passed) return { ok: false, error: `品質チェック失敗: ${check.violations}` }
    await updateSceneCatchCopy(propertyId, copy)
    return { ok: true, value: copy }
  },

  // ヒーロー画像をギャラリーの中からClaude Visionで最適選択して差し替え
  swapHeroImage: async (propertyId: string): Promise<SkillResult<string>> => {
    const scene    = await getScene(propertyId)
    const bestUrl  = await PhotoSelector.selectBest(scene.assets.galleryUrls)
    await updateSceneHeroImage(propertyId, bestUrl)
    await regenerateThumbnails(propertyId)  // サムネイルも連動更新
    return { ok: true, value: bestUrl }
  },

  // OGPサムネイルを再生成してR2に再アップロード
  regenerateOgpThumbnail: async (propertyId: string): Promise<SkillResult<string>> => {
    const scene = await getScene(propertyId)
    const buf   = await new ThumbnailGenerator().generate({
      propertyId, sceneJson: scene, baseImageUrl: scene.assets.heroImageUrl!, platform: 'ogp'
    })
    const url = await uploadToR2(propertyId, 'thumbnail/ogp.webp', buf)
    return { ok: true, value: url }
  },

  // 価格セクションに周辺相場情報を追加
  enrichPriceSection: async (propertyId: string): Promise<SkillResult<void>> => {
    const scene   = await getScene(propertyId)
    const comps   = await ComparableSearch.find(scene.property)
    const enriched = await CopyGenerator.enrichPriceSection(scene.property, comps)
    await updateScenePriceSection(propertyId, enriched)
    return { ok: true, value: undefined }
  },

  // A/Bテスト勝者をデフォルトに昇格
  promoteAbWinner: async (propertyId: string): Promise<SkillResult<void>> => {
    const winner = await AbTestManager.getWinner(propertyId)
    if (!winner) return { ok: false, error: '統計的有意差なし' }
    await updateSceneFromVariant(propertyId, winner)
    await supabase.from('ab_variants').update({ is_winner: true }).eq('id', winner.id)
    return { ok: true, value: undefined }
  },

  // LPを再生成・デプロイ（Skill呼び出し後の最終ステップとして使う）
  redeployLp: async (propertyId: string): Promise<SkillResult<string>> => {
    const url = await LpGenerator.generate(propertyId)
    await updateGenStatus(propertyId, { lp: 'done' })
    return { ok: true, value: url }
  },

} satisfies Record<string, (...args: any[]) => Promise<SkillResult<unknown>>>
```

### DD.6 trigger → Skill マッピング

```typescript
// lib/loop/SkillRouter.ts
// OrchestrationLoopがシグナルを受け取ったとき
// どのSkillを何の順序で実行するかを決定するルーター

export const TRIGGER_SKILL_MAP: Record<TriggerType, SkillChain> = {
  no_lead_72h: {
    skills: [
      Skills.regenerateCatchCopy,
      Skills.swapHeroImage,
      Skills.regenerateOgpThumbnail,
      Skills.redeployLp,
    ],
    requiresApproval: true,   // ADR-070: 人間承認を経てから実行
    description:      'リード0のため、コピー・ヒーロー画像を刷新してLP再デプロイ',
  },

  high_bounce: {
    skills: [
      Skills.regenerateCatchCopy,
      Skills.regenerateOgpThumbnail,
      Skills.redeployLp,
    ],
    requiresApproval: true,
    description:      '直帰率高のため、ファーストビューを改善',
  },

  price_section_dropout: {
    skills: [
      Skills.enrichPriceSection,
      Skills.redeployLp,
    ],
    requiresApproval: true,
    description:      '価格セクション離脱率高のため、周辺相場情報を追加',
  },

  ab_test_winner: {
    skills: [
      Skills.promoteAbWinner,
      Skills.redeployLp,
    ],
    requiresApproval: false,  // 統計的有意差確認済みなので自動実行可
    description:      'A/Bテスト勝者を自動昇格',
  },

  hero_dropout: {
    skills: [
      Skills.swapHeroImage,
      Skills.regenerateOgpThumbnail,
      Skills.redeployLp,
    ],
    requiresApproval: true,
    description:      'ヒーロー画像での離脱率高のため、画像を差し替え',
  },

  manual: {
    skills: [],  // improvement_queueのresult_jsonからスキルを動的解決
    requiresApproval: false,  // 担当者が既に承認済み
    description:      '手動承認済みの改善を実行',
  },
}
```

### DD.7 ループの停止保証（Halting Policy）

```
ADR-102 確定: 全ループに以下の3ハードストップを義務付ける

┌───────────────────────────────────────────────────────────┐
│  Halting Policy（SisliR全ループ共通）                       │
├──────────────────┬────────────────┬───────────────────────┤
│  ストップ条件     │  OrchestrationLoop │  AgentLoop          │
├──────────────────┼────────────────┼───────────────────────┤
│  最大イテレーション│  設計上無限        │  5回まで              │
│  タイムアウト      │  月予算95%到達で停止│  30分でタイムアウト   │
│  無進捗検知        │  n/a（1ティックのみ）│  2回連続で停止        │
│  コスト上限        │  月額APIコスト監視 │  1タスク¥500上限      │
│  緊急停止         │  LOOP_EMERGENCY_STOP=true 環境変数    │
└──────────────────┴────────────────┴───────────────────────┘

緊急停止手順（ランブック CC.2参照）:
  1. 環境変数 LOOP_EMERGENCY_STOP=true を設定
  2. OrchestrationLoopは次のティックで全ジョブ投入を停止
  3. 実行中のAgentLoopは現在のステップ完了後に停止
  4. pg-boss: UPDATE jobs SET state='failed' WHERE state='created'
```

### DD.8 ループコスト設計

```typescript
// lib/loop/LoopCostTracker.ts

export class LoopCostTracker {
  // APIコストをDBに記録（全ループが呼ぶ共通処理）
  async record(params: {
    tenantId:   string
    task:       string
    provider:   string
    tokens?:    number
    costJpy:    number
  }): Promise<void> {
    await supabase.from('api_cost_logs').insert({
      tenant_id:  params.tenantId,
      task:       params.task,
      provider:   params.provider,
      tokens:     params.tokens,
      cost_jpy:   params.costJpy,
      created_at: new Date().toISOString(),
    })

    // 月次コスト上限チェック（メトリクス記録）
    const monthly = await this.getMonthlyTotal(params.tenantId)
    meter.createObservableGauge('loop.monthly_cost_jpy').addCallback(obs => {
      obs.observe(monthly, { tenant_id: params.tenantId })
    })
  }

  // 1ティックあたりの予算チェック
  async checkTickBudget(tenantId: string, limitJpy: number): Promise<boolean> {
    const lastTickCost = await this.getLastTickCost(tenantId)
    return lastTickCost < limitJpy
  }
}
```

### DD.9 ループ設計のcron設定

```typescript
// apps/api/cron/orchestration.ts
// Cloudflare Workers Cron Triggers / Vercel Cron

// 本番: 5分ごとに OrchestrationLoop を実行
export const config = {
  schedule: '*/5 * * * *',  // 5分ごと
}

export default async function handler() {
  // 緊急停止チェック
  if (process.env.LOOP_EMERGENCY_STOP === 'true') {
    logger.warn({ event: 'loop.emergency_stopped' })
    return
  }

  const loop = new OrchestrationLoop()
  const result = await loop.tick()

  logger.info({
    event:          'loop.tick_completed',
    agents_started: result.agentsStarted,
    halted:         result.halted,
    reason:         result.reason,
    duration_ms:    result.tickDurationMs,
  })
}
```

### DD.10 ループ設計のSQL補足

```sql
-- OrchestrationLoopが使うRPC関数群

-- 公開後72時間リードゼロの物件を返す
CREATE OR REPLACE FUNCTION find_no_lead_properties(hours_since_publish INTEGER)
RETURNS TABLE(id UUID, name TEXT) AS $$
  SELECT p.id, p.name
  FROM properties p
  LEFT JOIN leads l ON l.property_id = p.id
  WHERE p.status = 'published'
    AND p.updated_at < NOW() - (hours_since_publish || ' hours')::INTERVAL
    AND p.gen_lp_status = 'done'
    AND l.id IS NULL
    -- 既にimprovement_queueに入っているものは除外
    AND NOT EXISTS (
      SELECT 1 FROM improvement_queue iq
      WHERE iq.property_id = p.id
        AND iq.trigger_type = 'no_lead_72h'
        AND iq.status NOT IN ('done', 'skipped')
    )
  LIMIT 50;
$$ LANGUAGE sql SECURITY DEFINER;

-- 直帰率が閾値を超える物件を返す
CREATE OR REPLACE FUNCTION find_high_bounce_properties(
  bounce_threshold FLOAT, hours INTEGER
)
RETURNS TABLE(id UUID, bounce_rate FLOAT) AS $$
  SELECT
    b.scene_id AS id,
    COUNT(DISTINCT b.anonymized_session_id) FILTER (
      WHERE b.event_type = 'section_enter' AND b.section_id = 'hero'
        AND NOT EXISTS (
          SELECT 1 FROM behavior_logs b2
          WHERE b2.anonymized_session_id = b.anonymized_session_id
            AND b2.scene_id = b.scene_id
            AND b2.section_id != 'hero'
        )
    )::FLOAT
    / NULLIF(COUNT(DISTINCT b.anonymized_session_id), 0) AS bounce_rate
  FROM behavior_logs b
  WHERE b.created_at > NOW() - (hours || ' hours')::INTERVAL
  GROUP BY b.scene_id
  HAVING COUNT(DISTINCT b.anonymized_session_id) >= 20  -- 最低20セッション以上
     AND (
       COUNT(DISTINCT b.anonymized_session_id) FILTER (
         WHERE b.event_type = 'section_enter' AND b.section_id = 'hero'
           AND NOT EXISTS (
             SELECT 1 FROM behavior_logs b2
             WHERE b2.anonymized_session_id = b.anonymized_session_id
               AND b2.scene_id = b.scene_id AND b2.section_id != 'hero'
           )
       )::FLOAT
       / NULLIF(COUNT(DISTINCT b.anonymized_session_id), 0)
     ) > bounce_threshold;
$$ LANGUAGE sql SECURITY DEFINER;

-- api_cost_logsテーブル（LoopCostTracker用）
CREATE TABLE api_cost_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  task        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  tokens      INTEGER,
  cost_jpy    DECIMAL(10, 2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON api_cost_logs (tenant_id, created_at DESC);
CREATE INDEX ON api_cost_logs (tenant_id, created_at DESC)
  WHERE created_at > date_trunc('month', NOW());  -- 月次集計用パーシャルインデックス
```

---

## Part EE — ループテスト戦略（v10.1新規） {#part-ee}

### EE.1 ループ固有のテスト要件

```
通常のAgentテストと異なる点:
  1. 無限ループしないことを証明しなければならない
  2. Haltingポリシーが全条件で発火することを確認する
  3. 同一ジョブが重複起動されないことを確認する
  4. コスト追跡が正確であることを確認する
  5. 緊急停止フラグが即座に機能することを確認する
```

### EE.2 HaltingポリシーUnit Tests

```typescript
// tests/unit/AgentLoop.test.ts

describe('AgentLoop — Haltingポリシー', () => {

  it('MAX_ITERATIONS超過で停止する', async () => {
    const loop = new AgentLoop()
    // 常にdone=falseを返すモック
    vi.spyOn(loop as any, 'runAgentStep').mockResolvedValue({
      done: false, costJpy: 1, state: { iteration: 1 }
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('max_iterations_exceeded')
    expect(result.iterations).toBe(6)  // MAX_ITERATIONS(5) + 1回チェック
  })

  it('タイムアウトで停止する', async () => {
    const loop = new AgentLoop()
    vi.useFakeTimers()
    vi.spyOn(loop as any, 'runAgentStep').mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(1900000)  // 31分経過をシミュレート
      return { done: false, costJpy: 1, state: { ts: Date.now() } }
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('timeout')
    vi.useRealTimers()
  })

  it('無進捗を2回検知で停止する', async () => {
    const loop = new AgentLoop()
    const FIXED_STATE = { unchanged: true }
    vi.spyOn(loop as any, 'runAgentStep').mockResolvedValue({
      done: false, costJpy: 1, state: FIXED_STATE  // 毎回同じstate
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('no_progress_detected')
    expect(result.iterations).toBeLessThanOrEqual(4)  // NO_PROGRESS_LIMIT(2) + バッファ
  })

  it('タスクコスト上限で停止する', async () => {
    const loop = new AgentLoop()
    vi.spyOn(loop as any, 'runAgentStep').mockResolvedValue({
      done: false, costJpy: 300, state: { step: Math.random() }  // 毎回異なるstate
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('task_cost_limit_exceeded')
    // ¥300 × 2回 = ¥600 > COST_LIMIT_JPY(¥500)
    expect(result.iterations).toBe(2)
  })

  it('正常完了時はcompletedを返す', async () => {
    const loop = new AgentLoop()
    vi.spyOn(loop as any, 'runAgentStep')
      .mockResolvedValueOnce({ done: false, costJpy: 50, state: { step: 1 } })
      .mockResolvedValueOnce({ done: true,  costJpy: 50, state: { step: 2 } })

    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('completed')
    expect(result.iterations).toBe(2)
    expect(result.costJpy).toBe(100)
  })
})

describe('OrchestrationLoop — 重複起動防止', () => {

  it('同一propertyId + triggerのジョブが実行中なら投入しない', async () => {
    const loop = new OrchestrationLoop()
    const boss = await getBoss()

    // 既存ジョブを作成
    await boss.send({
      name: 'agent-no_lead_72h',
      data: { propertyId: TEST_ID, trigger: 'no_lead_72h' },
      options: { id: `${TEST_ID}_no_lead_72h` }
    })

    // 同一タスクの投入を試みる
    const enqueued = await (loop as any).enqueueIfNotRunning({
      jobName:    'agent-no_lead_72h',
      propertyId: TEST_ID,
      trigger:    'no_lead_72h',
      priority:   10,
    })

    expect(enqueued).toBe(false)
  })

  it('緊急停止フラグが設定されている場合はtickが即座にhaltedを返す', async () => {
    process.env.LOOP_EMERGENCY_STOP = 'true'
    const loop = new OrchestrationLoop()
    const scanSpy = vi.spyOn(loop as any, 'scanAllProperties')

    const result = await loop.tick()

    expect(result.halted).toBe(true)
    expect(result.reason).toBe('emergency_stop')
    expect(scanSpy).not.toHaveBeenCalled()  // スキャンすら行わない

    delete process.env.LOOP_EMERGENCY_STOP
  })
})

describe('SkillRouter — trigger → Skill マッピング', () => {

  it('no_lead_72hトリガーは4つのSkillを順に実行する', async () => {
    const copySpy    = vi.spyOn(Skills, 'regenerateCatchCopy').mockResolvedValue({ ok: true, value: 'new copy' })
    const heroSpy    = vi.spyOn(Skills, 'swapHeroImage').mockResolvedValue({ ok: true, value: 'url' })
    const ogpSpy     = vi.spyOn(Skills, 'regenerateOgpThumbnail').mockResolvedValue({ ok: true, value: 'url' })
    const deploySpy  = vi.spyOn(Skills, 'redeployLp').mockResolvedValue({ ok: true, value: 'url' })

    const router = new SkillRouter()
    await router.execute('no_lead_72h', TEST_PROPERTY_ID, { skipApproval: true })

    expect(copySpy).toHaveBeenCalledOnce()
    expect(heroSpy).toHaveBeenCalledOnce()
    expect(ogpSpy).toHaveBeenCalledOnce()
    expect(deploySpy).toHaveBeenCalledOnce()
    // 順序確認（copySpy → heroSpy → ogpSpy → deploySpy）
    expect(copySpy.mock.invocationCallOrder[0]).toBeLessThan(heroSpy.mock.invocationCallOrder[0])
  })

  it('Skillが失敗した場合は後続Skillを実行しない', async () => {
    vi.spyOn(Skills, 'regenerateCatchCopy').mockResolvedValue({ ok: false, error: 'QC失敗' })
    const heroSpy = vi.spyOn(Skills, 'swapHeroImage')

    const router = new SkillRouter()
    const result = await router.execute('no_lead_72h', TEST_PROPERTY_ID, { skipApproval: true })

    expect(result.ok).toBe(false)
    expect(heroSpy).not.toHaveBeenCalled()
  })
})
```

### EE.3 ループ統合テスト

```typescript
// tests/integration/loop/orchestration.test.ts

describe('OrchestrationLoop — E2E統合', () => {

  it('公開後72時間リードゼロの物件にimprovement_queueが生成される', async () => {
    // 72時間前に公開・リードゼロの物件をセットアップ
    const property = await createPublishedProperty({ hoursAgo: 73 })

    const loop = new OrchestrationLoop()
    await loop.tick()

    // improvement_queueに登録されていることを確認
    const { data: queue } = await supabase
      .from('improvement_queue')
      .select('*')
      .eq('property_id', property.id)
      .eq('trigger_type', 'no_lead_72h')
      .single()

    expect(queue).not.toBeNull()
    expect(queue?.status).toBe('waiting_approval')
  })

  it('月次コスト上限に達した場合はAgentを起動しない', async () => {
    // 月次コストを上限の95%にセット
    await setMonthlyCost(TEST_TENANT_ID, MONTHLY_BUDGET_JPY * 0.96)

    const noLeadProperty = await createPublishedProperty({ hoursAgo: 73 })
    const enqueueSpy = vi.spyOn(OrchestrationLoop.prototype as any, 'enqueueIfNotRunning')

    const loop = new OrchestrationLoop()
    const result = await loop.tick()

    expect(result.halted).toBe(true)
    expect(result.reason).toBe('monthly_cost_limit')
    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})
```

### EE.4 ループ監視（Grafanaダッシュボード追加）

```
ダッシュボード 4: OrchestrationLoop状況

パネル構成:
  1. 今日のループティック回数（Counter）
  2. ループ停止回数・理由別（Bar: cost_limit / timeout / no_progress）
  3. 自動起動Agent数推移（Time Series: 24時間）
  4. Skill実行成功率（Gauge: 目標>90%）
  5. 月次ループAPIコスト累積（Stat: 予算対比）
  6. 現在実行中のAgentLoop一覧（Table: propertyId / trigger / iteration）
  7. 緊急停止フラグ状態（Red/Green インジケーター）
```

### EE.5 ループ追加ランブック（Part CCへの追記）

```
ランブック 5: OrchestrationLoopが止まらない / コスト爆発

症状: api_cost_logsが急増・月次予算を大幅超過

即時対処:
  1. 緊急停止フラグを設定
     Vercel Dashboard → Environment Variables → LOOP_EMERGENCY_STOP=true
     （Cloudflare Workers の場合: wrangler secret put LOOP_EMERGENCY_STOP）

  2. 実行中のpg-bossジョブを停止
     UPDATE jobs SET state='failed'
     WHERE name LIKE 'agent-%' AND state IN ('created', 'active');

  3. Grafana → api_cost_logsで異常コストの発生源を特定
     SELECT task, provider, SUM(cost_jpy), COUNT(*)
     FROM api_cost_logs
     WHERE created_at > NOW() - INTERVAL '1 hour'
     GROUP BY task, provider ORDER BY 3 DESC;

原因別対処:
  A. Skillが常にok=falseを返す → AgentLoopが無進捗ループ
     → 該当Skillのバグを修正 → LOOP_EMERGENCY_STOPを解除

  B. OrchestrationLoopのシグナルスキャンが同じ物件を毎回返す
     → improvement_queueへの登録漏れを確認
     → find_no_lead_properties のWHERE句を確認

  C. pg-bossのリトライが暴走している
     → UPDATE jobs SET retry_limit=0 WHERE state='failed' AND name LIKE 'agent-%'

回復後:
  1. LOOP_EMERGENCY_STOPを削除
  2. 停止中だった正常タスクを手動で再投入
  3. コスト超過分をテナントに通知（必要に応じて）
```

---

## v10.1 追加ADR

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-101 | OrchestrationLoopをpg-boss + cron（5分間隔）で実装 | Redisなし・既存インフラ活用・pg-bossの冪等キーで重複防止 | 専用メッセージキュー（Kafka等） |
| ADR-102 | 全AgentLoopにHaltingポリシー（MAX_ITERATIONS/タイムアウト/無進捗/コスト上限）を義務付け | APIコスト爆発とAgentの無限ループを設計レベルで防止。Uberの4ヶ月で年間予算消費の事故を教訓とする | 実行時監視のみで対応（遅すぎる） |
| ADR-103 | ループから呼ばれる処理はSkillとして命名・定義する | 「何をするか」が名前で明確になり、テスト・再利用・ループからの差し替えが容易になる。プロンプト直書きと比較して品質が安定する | MCPサーバーを直接呼ぶ |
| ADR-104 | SkillはSkillResult<T>を返す（例外を外に漏らさない） | ループがSkill失敗を検知して後続処理を止めるために必要。例外が外に漏れるとAgentLoopのHaltingポリシーが正しく動作しない | 例外スロー方式 |
| ADR-105 | requiresApproval=trueのSkillChainは担当者承認後に実行 | v10.0のADR-070を引き継ぎ。ループ化しても「自動改善は人間承認を経る」原則は維持する。A/Bテスト勝者昇格のみ自動実行を許可 | 全自動実行 |

---

## Part FF — v10.1 設計書全体アップデートサマリー {#part-ff}

### FF.1 v10.0 → v10.1 変更差分

| 対象 | v10.0 | v10.1 |
|------|-------|-------|
| 集客改善の起点 | 担当者がダッシュボードで手動トリガー | OrchestrationLoopが5分ごとに自律的に検知・起動 |
| improvement_queue | 手動登録のみ | ループが自動登録（重複防止付き） |
| ImprovementAgent | 単発実行 | AgentLoop（Haltingポリシー付き）で管理 |
| コスト管理 | 月次確認のみ | LoopCostTrackerがリアルタイム追跡・自動停止 |
| MCPスキル呼び出し | AgentがMCPを直接呼ぶ | Skill Libraryを経由して呼ぶ |
| 停止保証 | なし | HaltingPolicy（3ハードストップ）を全ループに義務化 |
| 緊急停止 | なし | LOOP_EMERGENCY_STOP環境変数で即停止 |
| テスト | Agentレベルのみ | ループ固有テスト（無限ループ・重複起動・コスト爆発）追加 |
| Grafanaダッシュボード | 3枚 | 4枚（ループ監視ダッシュ追加） |
| ADR | 001〜100 | 001〜105（ADR-101〜105追加） |

### FF.2 v10.1 完成後の自律度レベル

```
Level 0（手動）:
  人間 → ボタン → Agent → 終了

Level 1（v10.0まで）:
  人間 → ボタン → Agent（べき等・フォールバック付き）→ 終了
  ↑ ここまでが「Agentにプロンプトを送る」段階

Level 2（v10.1）:
  OrchestrationLoop（5分cron）
    → シグナルを検知
    → Skill Chainを決定
    → AgentLoop（Halting付き）を起動
    → 結果を検証
    → 次のティックへ
  ↑ ここから「ループがAgentにプロンプトを送る」段階

Level 3（将来・v11.0〜）:
  LoopがSkill Libraryを自律的に拡張する
  LoopがLoopを生成する（Gas Town的アーキテクチャ）
  ↑ Steinberger / Boris が描く最終形
```

### FF.3 v10.1の優先実装順序

| 優先度 | 実装内容 | 依存 |
|--------|---------|------|
| 1 | `api_cost_logs`テーブル + LoopCostTracker | Part BB（コスト監視）が先に必要 |
| 2 | `find_no_lead_properties` RPC関数 | improvement_queueテーブルが必要 |
| 3 | AgentLoop（Haltingポリシーのみ）+ テスト | pg-bossが先に必要 |
| 4 | Skill Library（4スキル）+ テスト | MCPサーバーが先に必要 |
| 5 | SkillRouter（trigger→Skillマッピング）| Skill Libraryが先に必要 |
| 6 | OrchestrationLoop本体 + テスト | AgentLoop・SkillRouterが先に必要 |
| 7 | cron設定（5分間隔） | OrchestrationLoopが先に必要 |
| 8 | Grafanaダッシュボード 4追加 | OpenTelemetryが先に必要 |
| 9 | ランブック 5をPart CCに追記 | — |
---

## Part GG — ポータル自動入力 Chrome拡張機能設計（v10.1追加） {#part-gg}

### GG.1 設計思想

```
目標:
  CSV手作業コピペ（15〜30分）を
  「ボタン1クリック + 担当者目視確認 + 送信」（30秒）に短縮する

原則:
  ① 最終送信は必ず人間が行う（ADR-070準拠）
  ② Scene JSON v10.0 が唯一のデータソース（Asset First原則）
  ③ SUUMOのUI変更に強い設計（セレクタを設定ファイルで管理）
  ④ 自動入力したフィールドは視覚的に明示する（誤入力防止）

法的位置づけ:
  本拡張機能は「フォームへの自動入力補助ツール」であり
  SUUMOへの自動送信・スクレイピングは行わない。
  最終的な送信操作は必ず担当者が手動で行う。
  実装前に媒介契約の約款・利用規約を法務確認すること（ADR-106）。
```

### GG.2 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  SisliR ダッシュボード（Next.js）                         │
│  「SUUMOに入力」ボタン → chrome.runtime.sendMessage()    │
└────────────────────────┬────────────────────────────────┘
                         │ postMessage / chrome.storage
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Chrome拡張機能                                          │
│                                                         │
│  popup.html          ── 物件選択・ポータル選択UI          │
│  background.js       ── タブ管理・メッセージルーティング  │
│  content/suumo.js    ── SUUMO入稿画面へのDOM操作         │
│  content/homes.js    ── HOME'S入稿画面へのDOM操作        │
│  content/athome.js   ── アットホーム入稿画面へのDOM操作  │
│  field-map.json      ── ポータル別フィールドセレクタ定義  │
└────────────────────────┬────────────────────────────────┘
                         │ DOM操作（入力のみ・送信しない）
                         ▼
┌─────────────────────────────────────────────────────────┐
│  ポータル入稿画面（SUUMO / HOME'S / アットホーム）        │
│  → フィールドが黄色ハイライトで自動入力される             │
│  → 担当者が目視確認                                      │
│  → 担当者が手動で「登録」ボタンを押す                     │
└─────────────────────────────────────────────────────────┘
```

### GG.3 ファイル構成

```
sisliR-portal-extension/
├── manifest.json               Chrome拡張マニフェスト（MV3）
├── popup/
│   ├── popup.html              拡張アイコンクリック時のUI
│   └── popup.js                物件選択・実行ロジック
├── background/
│   └── background.js           Service Worker・タブ管理
├── content/
│   ├── content.js              全ポータル共通の入力ロジック
│   └── content.css             自動入力フィールドのハイライトCSS
├── field-maps/
│   ├── suumo.json              SUUMOフィールドセレクタ定義
│   ├── homes.json              HOME'Sフィールドセレクタ定義
│   └── athome.json             アットホームフィールドセレクタ定義
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### GG.4 manifest.json

```json
{
  "manifest_version": 3,
  "name": "SisliR ポータル自動入力",
  "version": "1.0.0",
  "description": "SisliRの物件データをSUUMO・HOME'S・アットホームの入稿画面に自動入力します",
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon":  "icons/icon48.png"
  },
  "background": {
    "service_worker": "background/background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.suumo.jp/*",
        "https://*.homes.co.jp/*",
        "https://*.athome.co.jp/*"
      ],
      "js":     ["content/content.js"],
      "css":    ["content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "permissions":      ["activeTab", "storage", "tabs"],
  "host_permissions": [
    "https://*.suumo.jp/*",
    "https://*.homes.co.jp/*",
    "https://*.athome.co.jp/*"
  ]
}
```

### GG.5 フィールドマップ設計（field-maps/suumo.json）

```json
{
  "portal": "suumo",
  "version": "2026-06",
  "comment": "SUUMOのUI変更時はここのセレクタのみ更新する",
  "urlPattern": "https://*.suumo.jp/*/nyusho/*",
  "fields": {
    "name":          { "selector": "#bukken_name",       "type": "input" },
    "price":         { "selector": "#kakaku",            "type": "input",  "transform": "manToYen" },
    "address":       { "selector": "#shozaichi",         "type": "input" },
    "layout":        { "selector": "#madori",            "type": "select" },
    "landArea":      { "selector": "#tochi_menseki",     "type": "input" },
    "buildingArea":  { "selector": "#tatemo_menseki",    "type": "input" },
    "access":        { "selector": "#kotsu",             "type": "input" },
    "catchCopy":     { "selector": "#catch_copy",        "type": "input",  "maxLength": 40 },
    "description":   { "selector": "#setsumei_bun",      "type": "textarea","maxLength": 500 },
    "agencyName":    { "selector": "#kaisha_name",       "type": "input" },
    "realtorLicense":{ "selector": "#menkyobangou",      "type": "input" }
  },
  "transforms": {
    "manToYen": "value => Math.floor(value / 10000)"
  }
}
```

### GG.6 content.js（全ポータル共通の入力ロジック）

```javascript
// content/content.js
// chrome.runtime.onMessage で物件データを受け取り、
// field-mapに従ってフォームに入力する

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'SISLIР_FILL') return

  const { property, fieldMap } = msg

  const results = { filled: [], skipped: [], errors: [] }

  for (const [fieldKey, fieldDef] of Object.entries(fieldMap.fields)) {
    const el    = document.querySelector(fieldDef.selector)
    const value = resolveValue(property, fieldKey, fieldDef)

    if (!el) {
      results.skipped.push({ field: fieldKey, reason: 'selector_not_found' })
      continue
    }
    if (value === null || value === undefined) {
      results.skipped.push({ field: fieldKey, reason: 'no_value' })
      continue
    }

    try {
      fillField(el, fieldDef.type, String(value), fieldDef.maxLength)
      highlightField(el)
      results.filled.push(fieldKey)
    } catch (e) {
      results.errors.push({ field: fieldKey, error: e.message })
    }
  }

  // 結果サマリーをページ上部にトースト表示
  showToast(results)
  sendResponse(results)
})

// ── フィールド値の解決 ────────────────────────────────────────
function resolveValue(property, fieldKey, fieldDef) {
  const raw = property[fieldKey]
  if (raw === null || raw === undefined) return null

  // transform適用（例: 万→円変換）
  if (fieldDef.transform === 'manToYen') {
    return Math.floor(raw / 10000)
  }
  return raw
}

// ── フィールドへの入力（React管理フォーム対応）────────────────
// SUUMOはReact管理のフォームの場合があり
// element.value = x だけでは onChange が発火しない。
// NativeInputValueSetter を使って強制的に発火させる。
function fillField(el, type, value, maxLength) {
  const trimmed = maxLength ? value.slice(0, maxLength) : value

  if (type === 'select') {
    // <select> の場合: option の text or value が一致するものを選択
    const options = Array.from(el.options)
    const match   = options.find(o => o.text === trimmed || o.value === trimmed)
    if (match) {
      el.value = match.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return
  }

  // input / textarea: React対応
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, trimmed)
  } else {
    el.value = trimmed
  }

  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// ── 入力済みフィールドをハイライト ───────────────────────────
function highlightField(el) {
  el.setAttribute('data-sisliR-filled', 'true')
  // CSSクラスでスタイリング（content.css参照）
  el.classList.add('sisliR-filled')
}

// ── 結果トースト ──────────────────────────────────────────────
function showToast({ filled, skipped, errors }) {
  const existing = document.getElementById('sisliR-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'sisliR-toast'
  toast.innerHTML = `
    <div class="sisliR-toast-header">
      <img src="${chrome.runtime.getURL('icons/icon16.png')}" />
      <strong>SisliR 自動入力完了</strong>
    </div>
    <div class="sisliR-toast-body">
      ✅ 入力済み: ${filled.length}項目<br>
      ⚠️ スキップ: ${skipped.length}項目<br>
      ${errors.length > 0 ? `❌ エラー: ${errors.length}項目<br>` : ''}
      <hr>
      内容を確認して「登録」ボタンを押してください。
    </div>
    <button class="sisliR-toast-close" onclick="this.parentElement.remove()">×</button>
  `
  document.body.appendChild(toast)

  // 30秒後に自動消去
  setTimeout(() => toast.remove(), 30000)
}
```

### GG.7 content.css（ハイライトスタイル）

```css
/* content/content.css */

/* 自動入力されたフィールド */
.sisliR-filled {
  background-color: #fffde7 !important;
  border: 2px solid #f9a825 !important;
  transition: background-color 0.3s ease;
}

/* トースト通知 */
#sisliR-toast {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 999999;
  width: 280px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-left: 4px solid #1976d2;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  padding: 12px 16px;
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 13px;
  line-height: 1.6;
}

.sisliR-toast-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #1976d2;
}

.sisliR-toast-body {
  color: #333;
}

.sisliR-toast-body hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 8px 0;
}

.sisliR-toast-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: #999;
}
```

### GG.8 background.js（Service Worker）

```javascript
// background/background.js
// ポップアップ → コンテンツスクリプトへのメッセージ中継

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'POPUP_FILL_REQUEST') return

  // 現在アクティブなタブにfillメッセージを送信
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    // ポータルを判定してfield-mapを選択
    const portal   = detectPortal(tab.url)
    const fieldMap = await loadFieldMap(portal)

    if (!fieldMap) {
      sendResponse({ error: `未対応のURL: ${tab.url}` })
      return
    }

    const result = await chrome.tabs.sendMessage(tab.id, {
      type:     'SISLIР_FILL',
      property: msg.property,
      fieldMap,
    })
    sendResponse(result)
  })

  return true  // 非同期レスポンスのためtrueを返す
})

function detectPortal(url) {
  if (url.includes('suumo.jp'))   return 'suumo'
  if (url.includes('homes.co.jp'))return 'homes'
  if (url.includes('athome.co.jp'))return 'athome'
  return null
}

async function loadFieldMap(portal) {
  if (!portal) return null
  const url  = chrome.runtime.getURL(`field-maps/${portal}.json`)
  const resp = await fetch(url)
  return resp.json()
}
```

### GG.9 popup.html / popup.js（拡張アイコンクリック時のUI）

```html
<!-- popup/popup.html -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 320px; font-family: 'Noto Sans JP', sans-serif;
           font-size: 13px; padding: 16px; color: #333; }
    h1   { font-size: 15px; color: #1976d2; margin: 0 0 12px; }
    select, input { width: 100%; padding: 6px 8px; margin-bottom: 8px;
                    border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button.primary { width: 100%; padding: 10px; background: #1976d2;
                     color: #fff; border: none; border-radius: 4px;
                     font-size: 14px; cursor: pointer; }
    button.primary:hover { background: #1565c0; }
    .status { margin-top: 10px; font-size: 12px; color: #666; text-align: center; }
    .warning { background: #fff8e1; border: 1px solid #f9a825;
               border-radius: 4px; padding: 8px; font-size: 12px;
               margin-top: 10px; color: #795548; }
  </style>
</head>
<body>
  <h1>🏠 SisliR 自動入力</h1>

  <label>SisliR URL（ダッシュボードのAPI）</label>
  <input type="text" id="apiUrl" placeholder="https://your-sisliR.vercel.app" />

  <label>物件を選択</label>
  <select id="propertySelect">
    <option value="">── 物件を読み込み中 ──</option>
  </select>

  <button class="primary" id="fillBtn">このページに自動入力する</button>

  <div class="warning">
    ⚠️ 自動入力後は必ず内容を確認し、<br>
    「登録」ボタンは手動で押してください。
  </div>

  <div class="status" id="status"></div>

  <script src="popup.js"></script>
</body>
</html>
```

```javascript
// popup/popup.js

const apiUrlInput     = document.getElementById('apiUrl')
const propertySelect  = document.getElementById('propertySelect')
const fillBtn         = document.getElementById('fillBtn')
const statusEl        = document.getElementById('status')

// ── 保存済みAPIのURLを復元 ────────────────────────────────────
chrome.storage.local.get(['sisliRApiUrl'], ({ sisliRApiUrl }) => {
  if (sisliRApiUrl) {
    apiUrlInput.value = sisliRApiUrl
    loadProperties(sisliRApiUrl)
  }
})

apiUrlInput.addEventListener('change', () => {
  const url = apiUrlInput.value.trim()
  chrome.storage.local.set({ sisliRApiUrl: url })
  loadProperties(url)
})

// ── SisliR APIから物件一覧を取得 ──────────────────────────────
async function loadProperties(baseUrl) {
  if (!baseUrl) return
  statusEl.textContent = '物件を読み込み中...'
  try {
    const resp = await fetch(`${baseUrl}/api/extension/properties`, {
      headers: { 'X-Extension-Token': await getToken() }
    })
    const { properties } = await resp.json()

    propertySelect.innerHTML = '<option value="">── 物件を選択 ──</option>'
    for (const p of properties) {
      const opt = document.createElement('option')
      opt.value       = p.id
      opt.textContent = `${p.name}（${p.address}）`
      propertySelect.appendChild(opt)
    }
    statusEl.textContent = `${properties.length}件の物件を取得しました`
  } catch (e) {
    statusEl.textContent = `❌ 取得失敗: ${e.message}`
  }
}

// ── 自動入力実行 ──────────────────────────────────────────────
fillBtn.addEventListener('click', async () => {
  const propertyId = propertySelect.value
  if (!propertyId) { statusEl.textContent = '物件を選択してください'; return }

  statusEl.textContent = '物件データを取得中...'

  try {
    const baseUrl = apiUrlInput.value.trim()
    const resp    = await fetch(`${baseUrl}/api/extension/property/${propertyId}`, {
      headers: { 'X-Extension-Token': await getToken() }
    })
    const { property } = await resp.json()

    // background.js 経由でcontent.jsにメッセージ送信
    const result = await chrome.runtime.sendMessage({
      type: 'POPUP_FILL_REQUEST',
      property,
    })

    if (result?.error) {
      statusEl.textContent = `❌ ${result.error}`
    } else {
      statusEl.textContent =
        `✅ ${result?.filled?.length ?? 0}項目を入力しました`
    }
  } catch (e) {
    statusEl.textContent = `❌ エラー: ${e.message}`
  }
})

async function getToken() {
  const { extensionToken } = await chrome.storage.local.get(['extensionToken'])
  return extensionToken ?? ''
}
```

### GG.10 SisliR側APIエンドポイント（Next.js）

```typescript
// app/api/extension/properties/route.ts
// Chrome拡張機能専用の物件一覧取得API

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // 拡張機能トークン認証（Supabase Auth JWTとは別に設ける）
  const token = req.headers.get('X-Extension-Token')
  const tenantId = await verifyExtensionToken(token)
  if (!tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ properties })
}
```

```typescript
// app/api/extension/property/[id]/route.ts
// 拡張機能用: Scene JSONから入力用プロパティデータを返す

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token    = req.headers.get('X-Extension-Token')
  const tenantId = await verifyExtensionToken(token)
  if (!tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: scene } = await supabase
    .from('scenes')
    .select('scene_json')
    .eq('property_id', params.id)
    .single()

  // 拡張機能に必要なフィールドのみ返す（Scene JSON全体は不要）
  const p = scene.scene_json.property
  return NextResponse.json({
    property: {
      name:           p.name,
      price:          p.price,
      address:        p.address,
      layout:         p.layout,
      landArea:       p.landArea,
      buildingArea:   p.buildingArea,
      access:         p.access,
      catchCopy:      p.catchCopy,
      description:    p.description,
      agencyName:     p.agencyName,
      realtorLicense: p.realtorLicense,
      builtYear:      p.builtYear,
      structure:      p.structure,
    }
  })
}
```

### GG.11 SUUMOのUI変更への対応方針

```
課題:
  ポータルのUIは予告なく変更される。
  セレクタが変わると拡張機能が動かなくなる。

対策（3層）:

Layer 1: field-mapの外部化
  セレクタをJSONファイルに集約し、
  コード変更なしにセレクタのみ更新できる設計。
  → UI変更時の修正コスト: 5分以内

Layer 2: セレクタの多段フォールバック
  {
    "selector": "#bukken_name",          // 第1候補
    "fallbacks": [
      "[name='bukken_name']",            // 第2候補（name属性）
      "[data-field='property-name']",    // 第3候補（data属性）
      "input[placeholder='物件名']"      // 第4候補（placeholder）
    ]
  }

Layer 3: 未入力フィールドの可視化
  入力できなかったフィールドはポップアップに一覧表示。
  担当者が手動で補完できる状態にする。
  → 「完璧な自動化」より「確実な補助ツール」を優先。
```

### GG.12 対応ポータル拡張ロードマップ

| フェーズ | ポータル | 優先度 | 備考 |
|---------|---------|-------|------|
| v1.0 | SUUMO（売買・戸建て） | 最高 | 最大流通量 |
| v1.1 | HOME'S | 高 | SUUMO次点 |
| v1.2 | アットホーム | 高 | 中古物件に強い |
| v2.0 | SUUMO（土地・マンション） | 中 | 物件種別ごとにfield-map追加 |
| v2.1 | LIFULL Connect（API申請通過後） | 中 | Part Oを参照 |
| v3.0 | 独自ポータル（SisliR内製・Part Z参照）| 低 | 拡張機能不要（内製APIで直接入力） |

### GG.13 ADR-106（法的確認）

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-106 | ポータル自動入力は「フォーム補助」に限定し最終送信は人間が行う | SUUMOの利用規約では自動送信・スクレイピングが禁止されている可能性がある。「補助ツール」として設計することで利用規約リスクを最小化。実装前に各ポータルの媒介契約約款・利用規約を法務確認すること | 全自動送信（規約リスク大）|
