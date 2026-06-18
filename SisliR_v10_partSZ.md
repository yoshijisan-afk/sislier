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
