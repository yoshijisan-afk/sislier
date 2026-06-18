---

> ⚠️ **一部DEPRECATED — H.3「FloorplanVLMパイプライン」はPart OO（ADR-144）で廃止されました**
>
> 本ファイル内のH.3セクション（FloorplanVLM・Beike社製・92.52% IoU）は、
> 商用ライセンス取得不可と判明したため廃止されました（ADR-144）。
> 間取り解析は Claude Vision 単独パイプラインに完全移行しています。
> 新規実装では **Part OO.6（間取り解析パイプライン Claude Vision完全移行版）** の
> `FloorplanAnalyzer`・信頼度別ルーティング（OO.6.3）を参照してください。
>
> 影響箇所: L167（mcp_sisliR_pdf）, L349, L363〜（H.3全体）, L388, L453
> これら以外（PropertyIntakeAgent全体構成・MCPサーバー設計）は引き続き有効です。

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

### F.3 MCPサーバー一覧（13サーバー）

| サーバー名 | 役割 | Phase |
|-----------|------|-------|
| `mcp_sisliR_db` | 物件DB・SceneJSON CRUD | 1 |
| `mcp_sisliR_storage` | ローカルHDD ↔ R2 操作 | 1 |
| `mcp_sisliR_pdf` | 図面・仕様書解析（FloorplanVLM含む） | 1 |
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
| 間取り図PNG/JPG | ★★★★☆ | FloorplanVLM（92.52% IoU） | ProceduralMesh / 3D生成 |
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

### H.3 FloorplanVLM パイプライン

```
間取り図 PNG / PDF
      ↓
FloorplanVLM（Beike製・92.52% IoU）
  ※ライセンス確認必須（Phase 0 ブロッカー）
  ※NG時代替: Claude Vision単独での間取り解析（精度80%程度・追加API費用あり）
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
【第0推奨】FloorplanVLM経由（図面→3D）★★★★☆
  対象: 建築前物件・間取り図のみの既存物件
  入力: 間取り図PNG/JPG/PDF / 所要: 5〜20分（全自動）

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
    web-ifc / dxf-parser / FloorplanVLM
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
