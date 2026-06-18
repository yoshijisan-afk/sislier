# Part QQ — ABテストエンジン完全設計書
## SisliR v10.1 | 動画 × SNS × LP × 配信時間帯 × 物件種別 統合ABテスト基盤

> **バージョン**: v1.0 (2026-06-12)
> **位置づけ**: SisliR v10.1 完全設計書（Part A〜OO・PP）への追加 Part
> **依存**: Part T（反響計測）・Part U（自動改善ループ）・Part V（SNSサムネイル）・Part G（動画生成）・Part OO（マスター管理画面）
> **設計方針**: ABテストを「LPのバリアント切り替え」から「全成果物 × 全配信軸 × 物件種別」の3次元に拡張する

---

## 目次

- [QQ.0 設計方針と現状ギャップ](#qq0)
- [QQ.1 ABテストの対象と軸定義](#qq1)
- [QQ.2 DBスキーマ拡張（既存 ab_variants を含む全移行）](#qq2)
- [QQ.3 Zodスキーマ定義（packages/shared）](#qq3)
- [QQ.4 統計エンジン（ABSignificanceEngine）](#qq4)
- [QQ.5 LPバリアントエンジン拡張](#qq5)
- [QQ.6 SNSサムネイルABエンジン（新規）](#qq6)
- [QQ.7 動画スタイルABエンジン（新規）](#qq7)
- [QQ.8 配信時間帯ABエンジン（新規）](#qq8)
- [QQ.9 物件種別ごとの戦略分離設計](#qq9)
- [QQ.10 OrchestrationLoopとの統合](#qq10)
- [QQ.11 マスター管理画面 ABテストモジュール](#qq11)
- [QQ.12 テナント向け最小限ダッシュボード](#qq12)
- [QQ.13 MCPサーバー `mcp_sisliR_abtest`](#qq13)
- [QQ.14 pg-bossジョブ定義](#qq14)
- [QQ.15 テスト戦略（Part AAとの統合）](#qq15)
- [QQ.16 ADRログ](#qq16)
- [QQ.17 実装ロードマップ](#qq17)

---

## QQ.0 設計方針と現状ギャップ {#qq0}

### QQ.0.1 なぜこのPartが必要か

v10.1時点で `ab_variants` テーブルと `AbVariantSchema` は存在するが、設計が3つの重大な欠陥を抱えている。

```
欠陥1: 対象がLP（キャッチコピー・ヒーロー画像・CTA）のみ
  → SNSサムネイル・動画・配信時間帯にABテストが存在しない
  → thumbnail_logs / video_quality_logs はあるが「比較」の概念がない

欠陥2: 物件種別の次元が欠落
  → 注文住宅モデルハウス（高関与・検討期間長・感情訴求）と
     分譲土地（価格感度高・即決傾向・スペック訴求）は
     全く異なるクリエイティブ戦略が必要なのに
     ab_variants は property_type を持たない

欠陥3: 勝者判定が手動フラグ（is_winner: boolean）のみ
  → 統計的有意性の計算なし
  → 自動停止・自動デプロイなし
  → ADR-072「p<0.05まで継続」の方針が実装されていない
```

### QQ.0.2 設計原則

```
原則1: 全成果物をABテストの対象とする
  LP / SNSサムネイル / 動画 / 配信時間帯の4タイプを統一エンジンで管理

原則2: 物件種別ごとに独立した「勝者知識」を蓄積する
  newBuild で勝ったパターンが landSingle でも勝つとは限らない
  種別ごとに winning_patterns テーブルに知識を蓄積し次の生成に還元する

原則3: 統計的厳密性（ADR-072準拠）
  カイ二乗検定（p<0.05）+ サンプルサイズ下限（variants別50セッション以上）
  早期終了バイアスを防ぐためのsequential testingルールを適用

原則4: マスター画面は神視点、テナント画面は最小限
  マスター: 全テナント横断 × 全コンテンツタイプ × 統計詳細
  テナント: 「今何件テスト中」「先週の勝者」の2情報のみ
```

---

## QQ.1 ABテストの対象と軸定義 {#qq1}

### QQ.1.1 コンテンツタイプと対応する比較軸

| content_type | 比較軸 | KPI | 物件種別分離 |
|---|---|---|---|
| `lp` | キャッチコピー / ヒーロー画像 / CTA文言 / セクション順序 | CVR（訪問→リード） | ✅ 必須 |
| `sns_thumbnail` | デザインパターン / テキスト有無 / 色調 / 価格表示 | CTR（インプレッション→クリック） | ✅ 必須 |
| `video` | スタイルプリセット / ナレーション有無 / BGMタイプ / 冒頭3秒 | 視聴完了率 / リード転化率 | ✅ 必須 |
| `delivery_time` | 配信曜日 × 時間帯 | エンゲージメント率 / クリック率 | △ 任意（プラットフォーム依存） |

### QQ.1.2 物件種別ごとのクリエイティブ方針（ABテストの仮説起点）

```typescript
// packages/shared/constants/abHypotheses.ts

export const PROPERTY_TYPE_CREATIVE_STRATEGY = {
  newBuild: {
    // 新築戸建て: 生活イメージ + 安心感
    primaryAxis:    'lifestyle',    // 家族の暮らしイメージを訴求
    secondaryAxis:  'spec',         // 性能・設備を補足
    heroPattern:    'emotion_hero', // 感情喚起型ヒーロー画像
    ctaStyle:       'soft',         // 「まずは見学予約」ソフトCTA
    videoStyle:     'cinematic',    // 映画的・感情的
    sns_pattern:    'lifestyle',    // 家族・暮らし訴求
    avgSampleNeeded: 80,            // 検討期間が長いため多めのサンプルが必要
  },
  modelHouse: {
    // 注文住宅モデルハウス: 世界観 + 感情 + ブランド
    primaryAxis:    'lifestyle',
    secondaryAxis:  'exterior',     // 外観・デザイン訴求
    heroPattern:    'emotion_hero',
    ctaStyle:       'soft',         // 「モデルハウス見学」
    videoStyle:     'emotional',    // 感情的・ブランド的
    sns_pattern:    'lifestyle',
    avgSampleNeeded: 100,           // 高関与・検討期間が最も長い
  },
  preowned: {
    // 中古戸建て: 価格 + リフォーム提案 + 立地
    primaryAxis:    'price',        // 価格・コスパを前面に
    secondaryAxis:  'access',       // 立地・アクセス
    heroPattern:    'price_focus',  // 価格強調型
    ctaStyle:       'direct',       // 「今すぐ問い合わせ」ダイレクトCTA
    videoStyle:     'bright',       // 明るく・機能的
    sns_pattern:    'price_focus',
    avgSampleNeeded: 50,            // 価格感度高く即決傾向
  },
  land: {
    // 分譲地: 価格 + 区画 + 周辺環境
    primaryAxis:    'price',
    secondaryAxis:  'floor_plan',   // 区画・配置図
    heroPattern:    'price_focus',
    ctaStyle:       'direct',
    videoStyle:     'bright',
    sns_pattern:    'price_focus',
    avgSampleNeeded: 50,
  },
  landSingle: {
    // 土地（単独）: 価格 + 面積 + 建築自由度
    primaryAxis:    'price',
    secondaryAxis:  'floor_plan',
    heroPattern:    'price_focus',
    ctaStyle:       'direct',
    videoStyle:     'minimal',      // シンプル・データ重視
    sns_pattern:    'feature_list', // スペックリスト
    avgSampleNeeded: 50,
  },
} as const satisfies Record<z.infer<typeof PropertyTypeSchema>, PropertyCreativeStrategy>
```

---

## QQ.2 DBスキーマ拡張 {#qq2}

### QQ.2.1 既存 ab_variants テーブルの移行（Migration）

```sql
-- Migration: 0015_ab_variants_v2.sql
-- 既存カラムをそのまま残し、新カラムをすべて NULLABLE で追加

ALTER TABLE ab_variants
  ADD COLUMN IF NOT EXISTS content_type    TEXT NOT NULL DEFAULT 'lp',
  -- 'lp' | 'sns_thumbnail' | 'video' | 'delivery_time'

  ADD COLUMN IF NOT EXISTS property_type   TEXT,
  -- PropertyTypeSchema の値 | NULL = 全種別共通テスト

  ADD COLUMN IF NOT EXISTS hypothesis      TEXT,
  -- 「価格訴求CTAはモデルハウスでCVR+8%のはず」など仮説メモ

  ADD COLUMN IF NOT EXISTS traffic_split   DECIMAL(3,2) DEFAULT 0.50,
  -- バリアントBへのトラフィック割合（0.1〜0.9）

  ADD COLUMN IF NOT EXISTS sample_size_target INTEGER DEFAULT 200,
  -- 統計的有意性判定に必要な最小サンプル数（PROPERTY_TYPE_CREATIVE_STRATEGYのavgSampleNeeded参照）

  ADD COLUMN IF NOT EXISTS p_value         DECIMAL(7,6),
  -- 最後に計算したp値（daily jobが更新）

  ADD COLUMN IF NOT EXISTS lift            DECIMAL(6,4),
  -- 対照群比の改善率（+0.05 = +5%改善）

  ADD COLUMN IF NOT EXISTS confidence      DECIMAL(5,4),
  -- 信頼水準（通常0.95 = 95%）

  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'running',
  -- 'draft' | 'running' | 'paused' | 'winner_found' | 'stopped' | 'inconclusive'

  ADD COLUMN IF NOT EXISTS auto_deploy     BOOLEAN DEFAULT FALSE,
  -- TRUE = 勝者確定時に自動でデフォルトへ昇格

  ADD COLUMN IF NOT EXISTS control_variant_id UUID REFERENCES ab_variants(id),
  -- 対照群（Aバリアント）のID（NULLの場合は現在のデフォルト設定が対照群）

  ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ended_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winner_variant_id UUID REFERENCES ab_variants(id);
  -- 勝者確定後に winner_variant_id をセット

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_ab_variants_status_content_type
  ON ab_variants (status, content_type, property_type);

CREATE INDEX IF NOT EXISTS idx_ab_variants_scene_status
  ON ab_variants (scene_id, status)
  WHERE status = 'running';
```

### QQ.2.2 SNSサムネイルABテーブル（新規）

```sql
CREATE TABLE ab_thumbnail_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_variant_id    UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  -- ThumbnailPlatformSchema の値（instagram_feed / youtube_thumb 等）

  design_pattern   TEXT NOT NULL,
  -- 'price_focus'    : 価格強調・数値大きく・コスパ訴求
  -- 'emotion_hero'   : 感情喚起・家族・暮らし・大判写真
  -- 'lifestyle'      : ライフスタイル・日常感・シーン訴求
  -- 'minimal'        : テキスト最小・写真主役・高級感
  -- 'feature_list'   : 仕様列挙・スペック重視
  -- 'exterior_focus' : 外観・建物フォーカス

  show_price       BOOLEAN DEFAULT TRUE,
  show_layout      BOOLEAN DEFAULT TRUE,
  overlay_opacity  DECIMAL(3,2) DEFAULT 0.45,
  primary_color    TEXT DEFAULT '#FFFFFF',
  accent_color     TEXT DEFAULT '#D4A853',
  font_family      TEXT DEFAULT 'noto_sans',
  layout_json      JSONB,               -- sharp合成パラメータ（詳細）

  -- 計測値
  r2_key           TEXT,                -- 生成済みサムネイルのR2キー
  impressions      INTEGER DEFAULT 0,
  clicks           INTEGER DEFAULT 0,
  ctr              DECIMAL(5,4) DEFAULT 0,   -- clicks / impressions

  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON ab_thumbnail_variants (ab_variant_id);
CREATE INDEX ON ab_thumbnail_variants (platform, design_pattern);
```

### QQ.2.3 動画スタイルABテーブル（新規）

```sql
CREATE TABLE ab_video_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_variant_id     UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,

  style_preset      TEXT NOT NULL,
  -- 'cinematic'    : 映画的・ウォームトーン・ブルーム・ビネット（新築・注文住宅向き）
  -- 'bright'       : 明るめ・シャープ・ニュートラル（土地・中古向き）
  -- 'minimal'      : ミニマル・データ重視・テキストオーバーレイ（土地単独向き）
  -- 'emotional'    : 感情的・BGMあり・家族シーン（モデルハウス向き）
  -- 'documentary'  : ドキュメンタリー調・現場取材風

  has_narration     BOOLEAN DEFAULT FALSE,
  narration_tone    TEXT,
  -- 'warm'         : 温かみ・親しみやすい
  -- 'professional' : プロフェッショナル・信頼感
  -- 'energetic'    : テンション高め・若年層向け
  -- NULL           : ナレーションなし

  bgm_type          TEXT DEFAULT 'none',
  -- 'upbeat'       : 明るく前向き
  -- 'calm'         : 落ち着き・高級感
  -- 'dramatic'     : 感情的・クライマックス
  -- 'none'         : BGMなし

  opening_3sec_type TEXT,
  -- 'hero_shot'    : 建物外観から始まる
  -- 'family_scene' : 家族の暮らしシーンから始まる
  -- 'price_reveal' : 価格・スペック情報から始まる
  -- 'drone_fly'    : ドローン空撮から始まる

  video_url         TEXT,              -- 生成済み動画のR2 URL
  duration_sec      INTEGER,           -- 動画尺（秒）

  -- 計測値
  view_count        INTEGER DEFAULT 0,
  completion_rate   DECIMAL(5,4) DEFAULT 0,  -- 最後まで視聴した割合
  mid_roll_drop_rate DECIMAL(5,4) DEFAULT 0, -- 中間離脱率
  lead_from_video   INTEGER DEFAULT 0,       -- 動画視聴後のリード数
  lead_rate         DECIMAL(5,4) DEFAULT 0,  -- lead_from_video / view_count

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON ab_video_variants (ab_variant_id);
CREATE INDEX ON ab_video_variants (style_preset);
```

### QQ.2.4 配信時間帯ABテーブル（新規）

```sql
CREATE TABLE ab_delivery_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_variant_id    UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,

  platform         TEXT NOT NULL,
  -- 'instagram' | 'youtube' | 'x' | 'line'

  day_of_week      TEXT NOT NULL,
  -- 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  -- | 'friday' | 'saturday' | 'sunday'

  hour             INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  -- JST（日本標準時）で統一

  -- 計測値（配信1回ごとに蓄積）
  posts_sent       INTEGER DEFAULT 0,
  impressions      INTEGER DEFAULT 0,
  engagements      INTEGER DEFAULT 0,     -- いいね + コメント + シェア + 保存
  clicks           INTEGER DEFAULT 0,
  engagement_rate  DECIMAL(5,4) DEFAULT 0,  -- engagements / impressions
  click_rate       DECIMAL(5,4) DEFAULT 0,  -- clicks / impressions

  created_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ab_variant_id, platform, day_of_week, hour)
);

CREATE INDEX ON ab_delivery_schedules (ab_variant_id);
CREATE INDEX ON ab_delivery_schedules (platform, day_of_week, hour);
```

### QQ.2.5 統計計算ログテーブル（新規）

```sql
CREATE TABLE ab_significance_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_variant_id    UUID NOT NULL REFERENCES ab_variants(id),

  calculated_at    TIMESTAMPTZ DEFAULT NOW(),

  -- 計算時点のスナップショット
  control_sessions   INTEGER NOT NULL,
  control_conversions INTEGER NOT NULL,
  variant_sessions   INTEGER NOT NULL,
  variant_conversions INTEGER NOT NULL,

  -- 統計結果
  p_value          DECIMAL(7,6) NOT NULL,
  lift             DECIMAL(6,4) NOT NULL,       -- 正 = バリアントBが優位
  confidence       DECIMAL(5,4) NOT NULL DEFAULT 0.95,
  z_score          DECIMAL(6,3),

  recommendation   TEXT NOT NULL,
  -- 'continue'          : サンプル不足 or 有意差なし → 継続
  -- 'stop_winner_b'     : バリアントBが有意に優位 → Bを採用
  -- 'stop_winner_a'     : バリアントA（対照群）が有意に優位 → 現状維持
  -- 'stop_inconclusive' : 十分なサンプルが集まったが有意差なし

  notes            TEXT   -- 「サンプルサイズ不足（現在34/目標80）」等
);

CREATE INDEX ON ab_significance_log (ab_variant_id, calculated_at DESC);
```

### QQ.2.6 勝者知識テーブル（新規）— 物件種別ごとの蓄積

```sql
CREATE TABLE ab_winning_patterns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),  -- NULL = 全テナント共通パターン

  property_type    TEXT NOT NULL,  -- PropertyTypeSchema

  content_type     TEXT NOT NULL,  -- 'lp' | 'sns_thumbnail' | 'video' | 'delivery_time'

  winning_pattern  JSONB NOT NULL,
  -- LP例:      { "primaryAxis": "lifestyle", "ctaStyle": "soft", "lift": 0.18 }
  -- SNS例:     { "designPattern": "emotion_hero", "platform": "instagram_feed", "ctr": 0.043 }
  -- 動画例:    { "stylePreset": "cinematic", "hasNarration": true, "completionRate": 0.62 }
  -- 配信例:    { "platform": "instagram", "dayOfWeek": "saturday", "hour": 10, "engagementRate": 0.067 }

  win_count        INTEGER DEFAULT 1,    -- 同パターンが勝者になった回数
  avg_lift         DECIMAL(6,4),         -- 平均改善率
  confidence_score DECIMAL(5,4),         -- 勝者パターンとしての信頼度（win_count連動）

  recorded_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, property_type, content_type, winning_pattern)
);

CREATE INDEX ON ab_winning_patterns (property_type, content_type);
CREATE INDEX ON ab_winning_patterns (tenant_id, property_type);
```

---

## QQ.3 Zodスキーマ定義 {#qq3}

```typescript
// packages/shared/schemas/abTest.ts

import { z } from 'zod'
import { PropertyTypeSchema, ThumbnailPlatformSchema } from './scene'

// ── コンテンツタイプ ──────────────────────────────────────────
export const AbContentTypeSchema = z.enum([
  'lp',
  'sns_thumbnail',
  'video',
  'delivery_time',
])

// ── テストステータス ──────────────────────────────────────────
export const AbStatusSchema = z.enum([
  'draft',          // 設定済み・未開始
  'running',        // 実行中
  'paused',         // 一時停止
  'winner_found',   // 勝者確定
  'stopped',        // 手動停止
  'inconclusive',   // サンプル十分・有意差なし
])

// ── SNSサムネイルABバリアント ────────────────────────────────
export const AbThumbnailDesignPattern = z.enum([
  'price_focus',
  'emotion_hero',
  'lifestyle',
  'minimal',
  'feature_list',
  'exterior_focus',
])

export const AbThumbnailVariantSchema = z.object({
  platform:        ThumbnailPlatformSchema,
  designPattern:   AbThumbnailDesignPattern,
  showPrice:       z.boolean().default(true),
  showLayout:      z.boolean().default(true),
  overlayOpacity:  z.number().min(0).max(1).default(0.45),
  primaryColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
  accentColor:     z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#D4A853'),
  fontFamily:      z.enum(['noto_sans', 'noto_serif', 'zen_kaku']).default('noto_sans'),
  layoutJson:      z.record(z.unknown()).optional(),
})

// ── 動画スタイルABバリアント ─────────────────────────────────
export const AbVideoStylePreset = z.enum([
  'cinematic',
  'bright',
  'minimal',
  'emotional',
  'documentary',
])

export const AbVideoVariantSchema = z.object({
  stylePreset:      AbVideoStylePreset,
  hasNarration:     z.boolean().default(false),
  narrationTone:    z.enum(['warm', 'professional', 'energetic']).optional(),
  bgmType:          z.enum(['upbeat', 'calm', 'dramatic', 'none']).default('none'),
  opening3secType:  z.enum(['hero_shot', 'family_scene', 'price_reveal', 'drone_fly']).optional(),
})

// ── 配信時間帯ABバリアント ───────────────────────────────────
export const AbDeliveryScheduleSchema = z.object({
  platform:   z.enum(['instagram', 'youtube', 'x', 'line']),
  dayOfWeek:  z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),
  hour:       z.number().int().min(0).max(23),
})

// ── 統計結果 ──────────────────────────────────────────────────
export const AbSignificanceResultSchema = z.object({
  pValue:         z.number(),
  lift:           z.number(),           // 正 = バリアントBが優位
  confidence:     z.number().default(0.95),
  zScore:         z.number().optional(),
  recommendation: z.enum(['continue', 'stop_winner_b', 'stop_winner_a', 'stop_inconclusive']),
  notes:          z.string().optional(),
})

// ── ABテスト設定（メインスキーマ） ──────────────────────────
export const AbTestConfigSchema = z.object({
  id:                z.string().uuid().optional(),
  contentType:       AbContentTypeSchema,
  propertyType:      PropertyTypeSchema.optional(),  // 種別特化 or NULL（全種別）
  variantName:       z.string().max(50),
  hypothesis:        z.string().max(300).optional(),
  trafficSplit:      z.number().min(0.1).max(0.9).default(0.5),
  sampleSizeTarget:  z.number().int().min(30).default(200),
  status:            AbStatusSchema.default('draft'),
  autoDeploy:        z.boolean().default(false),

  // コンテンツタイプ別の詳細設定（使用するタイプのみ指定）
  lpVariant:         z.object({
    catchCopyVariant:    z.string().max(40).optional(),
    heroImageVariant:    z.string().url().optional(),
    ctaLabelVariant:     z.string().max(20).optional(),
    sectionOrderVariant: z.array(z.string()).optional(),
    adAxisVariant:       z.enum(['living','exterior','price','access','floor_plan','family']).optional(),
  }).optional(),

  thumbnailVariant:  AbThumbnailVariantSchema.optional(),
  videoVariant:      AbVideoVariantSchema.optional(),
  deliverySchedule:  AbDeliveryScheduleSchema.optional(),
})

export type AbTestConfig    = z.infer<typeof AbTestConfigSchema>
export type AbContentType   = z.infer<typeof AbContentTypeSchema>
export type AbStatus        = z.infer<typeof AbStatusSchema>
```

---

## QQ.4 統計エンジン（ABSignificanceEngine） {#qq4}

### QQ.4.1 コアロジック

```typescript
// packages/analytics/src/ABSignificanceEngine.ts
import { z } from 'zod'
import { AbSignificanceResultSchema } from '@sislir/shared/schemas/abTest'

/**
 * 正規分布の累積分布関数（CDF）近似
 * Abramowitz & Stegun による精度の高い近似式
 */
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly = t * (0.319381530
    + t * (-0.356563782
    + t * (1.781477937
    + t * (-1.821255978
    + t * 1.330274429))))
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
  const p = 1 - pdf * poly
  return z >= 0 ? p : 1 - p
}

/**
 * 2標本比率のZ検定
 * H0: 対照群（A）とバリアント（B）のコンバージョン率に差はない
 */
export function zTestTwoProportions(
  controlSessions:   number,
  controlConversions: number,
  variantSessions:   number,
  variantConversions: number,
): { zScore: number; pValue: number; lift: number } {
  // 最小サンプルガード
  if (controlSessions < 5 || variantSessions < 5) {
    return { zScore: 0, pValue: 1, lift: 0 }
  }

  const p1 = controlConversions / controlSessions    // 対照群CVR
  const p2 = variantConversions / variantSessions    // バリアントCVR
  const p  = (controlConversions + variantConversions) / (controlSessions + variantSessions)

  const se = Math.sqrt(p * (1 - p) * (1 / controlSessions + 1 / variantSessions))
  if (se === 0) return { zScore: 0, pValue: 1, lift: 0 }

  const zScore = (p2 - p1) / se
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)))  // 両側検定
  const lift   = p1 > 0 ? (p2 - p1) / p1 : 0           // 相対改善率

  return { zScore, pValue, lift }
}

/**
 * ABテストの有意性チェック
 */
export function checkSignificance(params: {
  controlSessions:    number
  controlConversions: number
  variantSessions:    number
  variantConversions: number
  sampleSizeTarget:   number
  confidence?:        number  // default 0.95
}): z.infer<typeof AbSignificanceResultSchema> {
  const alpha      = 1 - (params.confidence ?? 0.95)
  const minSample  = Math.min(params.controlSessions, params.variantSessions)
  const { zScore, pValue, lift } = zTestTwoProportions(
    params.controlSessions,
    params.controlConversions,
    params.variantSessions,
    params.variantConversions,
  )

  // サンプルサイズ不足: まだ継続
  if (minSample < Math.min(params.sampleSizeTarget * 0.5, 30)) {
    return {
      pValue,
      lift,
      confidence: params.confidence ?? 0.95,
      zScore,
      recommendation: 'continue',
      notes: `サンプル不足（現在${minSample}件 / 目標${params.sampleSizeTarget}件）`,
    }
  }

  // 有意差あり: 勝者を判定
  if (pValue < alpha) {
    return {
      pValue,
      lift,
      confidence: params.confidence ?? 0.95,
      zScore,
      recommendation: lift > 0 ? 'stop_winner_b' : 'stop_winner_a',
      notes: `p=${pValue.toFixed(4)}, lift=${(lift * 100).toFixed(1)}%`,
    }
  }

  // 十分なサンプルがあり有意差なし: 決着なし
  if (minSample >= params.sampleSizeTarget) {
    return {
      pValue,
      lift,
      confidence: params.confidence ?? 0.95,
      zScore,
      recommendation: 'stop_inconclusive',
      notes: `有意差なし（p=${pValue.toFixed(4)}）。目標サンプル到達済み`,
    }
  }

  // 継続
  return {
    pValue,
    lift,
    confidence: params.confidence ?? 0.95,
    zScore,
    recommendation: 'continue',
    notes: `経過良好 p=${pValue.toFixed(4)}、継続中`,
  }
}
```

### QQ.4.2 コンテンツタイプ別のコンバージョン指標マッピング

```typescript
// packages/analytics/src/abMetricsMapper.ts

/**
 * コンテンツタイプ別のセッション数・コンバージョン数の取得ロジック
 */
export async function getAbMetrics(
  variantId: string,
  contentType: AbContentType,
  db: SupabaseClient,
): Promise<{ sessions: number; conversions: number }> {
  switch (contentType) {
    case 'lp': {
      // セッション = ab_variants.sessions
      // コンバージョン = ab_variants.leads_count
      const { data } = await db
        .from('ab_variants')
        .select('sessions, leads_count')
        .eq('id', variantId)
        .single()
      return { sessions: data?.sessions ?? 0, conversions: data?.leads_count ?? 0 }
    }

    case 'sns_thumbnail': {
      // セッション = impressions（表示回数）
      // コンバージョン = clicks（クリック数）
      const { data } = await db
        .from('ab_thumbnail_variants')
        .select('impressions, clicks')
        .eq('ab_variant_id', variantId)
        .single()
      return { sessions: data?.impressions ?? 0, conversions: data?.clicks ?? 0 }
    }

    case 'video': {
      // セッション = view_count
      // コンバージョン = lead_from_video（動画視聴後リード）
      // ※ 補助指標: completion_rate は別途 ab_significance_log に記録
      const { data } = await db
        .from('ab_video_variants')
        .select('view_count, lead_from_video')
        .eq('ab_variant_id', variantId)
        .single()
      return { sessions: data?.view_count ?? 0, conversions: data?.lead_from_video ?? 0 }
    }

    case 'delivery_time': {
      // セッション = posts_sent × 1000（インプレッション推定）
      // コンバージョン = engagements
      const { data } = await db
        .from('ab_delivery_schedules')
        .select('impressions, engagements')
        .eq('ab_variant_id', variantId)
        .single()
      return { sessions: data?.impressions ?? 0, conversions: data?.engagements ?? 0 }
    }
  }
}
```

---

## QQ.5 LPバリアントエンジン拡張 {#qq5}

### QQ.5.1 AbTestRenderer の拡張

```typescript
// apps/runtime/lib/AbTestRenderer.ts（既存クラスを拡張）

import { cyrb53 } from '../utils/hash'
import { AbTestConfigSchema } from '@sislir/shared/schemas/abTest'

export class AbTestRenderer {
  /**
   * セッションIDのハッシュで決定論的にバリアントを割り当て
   * traffic_split を考慮した割り当て（v10.1の固定50/50から拡張）
   */
  async assignVariant(params: {
    sceneId:    string
    sessionId:  string
    propertyType: string
    contentType:  string
  }): Promise<{ variantId: string | null; isControl: boolean }> {
    // 実行中のABテストを取得（物件種別 or 全種別対象のもの）
    const { data: variants } = await supabase
      .from('ab_variants')
      .select('id, traffic_split, control_variant_id')
      .eq('scene_id', params.sceneId)
      .eq('status', 'running')
      .eq('content_type', params.contentType)
      .or(`property_type.eq.${params.propertyType},property_type.is.null`)
      .limit(1)
      .single()

    if (!variants) return { variantId: null, isControl: true }

    // cyrb53ハッシュで 0.0〜1.0 の決定論的な値を生成
    const hash = cyrb53(params.sessionId + params.sceneId + params.contentType)
    const ratio = (hash % 10000) / 10000   // 0.0000〜0.9999

    const isControl = ratio >= variants.traffic_split
    return {
      variantId: isControl ? null : variants.id,
      isControl,
    }
  }

  /**
   * セクション順序バリアントの適用
   */
  applySectionOrder(
    defaultOrder: string[],
    variantOrder: string[] | undefined,
  ): string[] {
    if (!variantOrder || variantOrder.length === 0) return defaultOrder
    // バリアントに含まれないセクションをデフォルト順序の末尾に追加
    const missing = defaultOrder.filter(s => !variantOrder.includes(s))
    return [...variantOrder, ...missing]
  }
}
```

---

## QQ.6 SNSサムネイルABエンジン（新規） {#qq6}

### QQ.6.1 ThumbnailAbGenerator

```typescript
// lib/thumbnail/ThumbnailAbGenerator.ts

import { ThumbnailGenerator } from './ThumbnailGenerator'
import { AbThumbnailVariantSchema } from '@sislir/shared/schemas/abTest'
import { PROPERTY_TYPE_CREATIVE_STRATEGY } from '@sislir/shared/constants/abHypotheses'

export class ThumbnailAbGenerator {
  private generator = new ThumbnailGenerator()

  /**
   * 物件種別に応じた推奨ABテストペアを自動生成
   * （Claudeに仮説を作らせて比較する）
   */
  async generateAbPair(params: {
    propertyId:    string
    sceneJson:     SceneConfig
    baseImageUrl:  string
    platform:      ThumbnailPlatform
    propertyType:  PropertyTypeSchema
  }): Promise<{ controlR2Key: string; variantR2Key: string; hypothesis: string }> {
    const strategy = PROPERTY_TYPE_CREATIVE_STRATEGY[params.propertyType]

    // 対照群（A）: 現在のデフォルト設定
    const controlConfig = {
      designPattern: strategy.sns_pattern,
      showPrice: true,
    }

    // バリアント（B）: Claudeが仮説を立てる
    const variantHypothesis = await this.generateHypothesis(params.sceneJson, params.propertyType)
    const variantConfig = variantHypothesis.thumbnailConfig

    const span = tracer.startSpan('thumbnail_ab.generate_pair')
    try {
      const [controlBuf, variantBuf] = await Promise.all([
        this.generator.generate({ ...params, ...controlConfig }),
        this.generator.generate({ ...params, ...variantConfig }),
      ])

      const controlR2Key = `thumbnails/${params.propertyId}/${params.platform}_ab_control.webp`
      const variantR2Key = `thumbnails/${params.propertyId}/${params.platform}_ab_variant.webp`

      await Promise.all([
        r2.put(controlR2Key, controlBuf),
        r2.put(variantR2Key, variantBuf),
      ])

      return { controlR2Key, variantR2Key, hypothesis: variantHypothesis.text }
    } finally {
      span.end()
    }
  }

  /**
   * Claudeにサムネイル改善仮説を立てさせる
   */
  private async generateHypothesis(
    sceneJson: SceneConfig,
    propertyType: string,
  ): Promise<{ thumbnailConfig: Partial<AbThumbnailVariantSchema>; text: string }> {
    // 過去の勝者パターンをコンテキストに含める
    const { data: winningPatterns } = await supabase
      .from('ab_winning_patterns')
      .select('winning_pattern, avg_lift, win_count')
      .eq('property_type', propertyType)
      .eq('content_type', 'sns_thumbnail')
      .order('avg_lift', { ascending: false })
      .limit(3)

    const systemPrompt = `あなたはSNS広告クリエイティブの専門家です。
不動産物件のSNSサムネイルについて、CTR改善の仮説を立ててください。
物件種別: ${propertyType}
過去の勝者パターン: ${JSON.stringify(winningPatterns ?? [])}
JSON形式で { thumbnailConfig: {...}, text: "仮説の説明" } を返してください。`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: JSON.stringify(sceneJson.propertyInfo) }],
      system: systemPrompt,
    })
    return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}')
  }
}
```

### QQ.6.2 CTR計測の実装（SNS投稿リンクのUTM + クリック追跡）

```typescript
// lib/distribute/SnsAbTracker.ts

/**
 * SNS投稿URLにABテスト識別子を埋め込む
 */
export function generateAbTrackedUrl(params: {
  baseUrl:       string
  propertyId:    string
  platform:      string
  abVariantId:   string
  isControl:     boolean
}): string {
  const url = new URL(params.baseUrl)
  url.searchParams.set('utm_source',   params.platform)
  url.searchParams.set('utm_medium',   'social')
  url.searchParams.set('utm_campaign', params.propertyId)
  url.searchParams.set('utm_content',  `ab_${params.isControl ? 'ctrl' : params.abVariantId.slice(0, 8)}`)
  return url.toString()
}

/**
 * Webhookまたはバッチ処理でCTRを更新
 * （SNS APIのインサイトデータを定期取得して反映）
 */
export async function syncSnsInsights(
  abVariantId: string,
  platform:    string,
  insights: { impressions: number; clicks: number },
): Promise<void> {
  const ctr = insights.impressions > 0
    ? insights.clicks / insights.impressions
    : 0

  await supabase
    .from('ab_thumbnail_variants')
    .update({
      impressions: insights.impressions,
      clicks:      insights.clicks,
      ctr,
    })
    .eq('ab_variant_id', abVariantId)

  // ab_variants 側の集計も更新（統計エンジンが参照する）
  await supabase
    .from('ab_variants')
    .update({
      sessions:        insights.impressions,
      leads_count:     insights.clicks,
      conversion_rate: ctr,
    })
    .eq('id', abVariantId)
}
```

---

## QQ.7 動画スタイルABエンジン（新規） {#qq7}

### QQ.7.1 VideoAbRouter（VideoGeneratorRouter の拡張）

```typescript
// lib/video/VideoAbRouter.ts

/**
 * 既存の VideoGeneratorRouter を拡張してABテストを統合
 */
export class VideoAbRouter extends VideoGeneratorRouter {

  /**
   * 物件種別と過去の勝者パターンを考慮して、ABテスト用の2バリアントを生成
   */
  async generateAbPair(params: {
    propertyId:    string
    sceneJson:     SceneConfig
    propertyType:  string
  }): Promise<void> {
    const strategy  = PROPERTY_TYPE_CREATIVE_STRATEGY[params.propertyType]
    const winners   = await this.getWinningPatterns(params.propertyType, 'video')

    // 対照群（A）: 物件種別の推奨スタイル
    const controlStyle: AbVideoVariantConfig = {
      stylePreset:  strategy.videoStyle,
      hasNarration: false,
      bgmType:      'calm',
    }

    // バリアント（B）: 勝者パターンから候補を選択、なければClaudeに仮説生成
    const variantStyle = winners.length > 0
      ? this.nextUntested(winners, params.propertyType)
      : await this.claudeGenerateVideoHypothesis(params.sceneJson, params.propertyType)

    const span = tracer.startSpan('video_ab.generate_pair')
    try {
      await Promise.all([
        this.generateVariantVideo({ ...params, style: controlStyle, label: 'control' }),
        this.generateVariantVideo({ ...params, style: variantStyle, label: 'variant' }),
      ])
    } finally {
      span.end()
    }
  }

  /**
   * 過去の勝者パターンのうちまだテストしていないスタイルを選ぶ
   */
  private nextUntested(
    winners: AbWinningPattern[],
    propertyType: string,
  ): AbVideoVariantConfig {
    const alreadyTested = new Set(winners.map(w => w.winning_pattern.stylePreset))
    const allPresets    = ['cinematic', 'bright', 'minimal', 'emotional', 'documentary'] as const
    const untested      = allPresets.filter(p => !alreadyTested.has(p))

    if (untested.length > 0) {
      return { stylePreset: untested[0], hasNarration: false, bgmType: 'none' }
    }
    // 全スタイル試済みの場合はナレーション有無で差分
    return { stylePreset: winners[0].winning_pattern.stylePreset, hasNarration: true, bgmType: 'calm' }
  }
}
```

### QQ.7.2 視聴完了率の計測（フロントエンド）

```typescript
// apps/runtime/lib/VideoAbBeacon.ts

export class VideoAbBeacon {
  private startedAt: number | null = null
  private lastHeartbeat: number = 0

  constructor(
    private readonly videoElement: HTMLVideoElement,
    private readonly abVariantId:  string,
  ) {
    this.attach()
  }

  private attach(): void {
    this.videoElement.addEventListener('play',  () => { this.startedAt = Date.now() })
    this.videoElement.addEventListener('ended', () => this.sendCompletion(1.0))
    this.videoElement.addEventListener('timeupdate', () => this.throttledHeartbeat())
  }

  private throttledHeartbeat(): void {
    if (Date.now() - this.lastHeartbeat < 5000) return  // 5秒ごと
    this.lastHeartbeat = Date.now()

    const pct = this.videoElement.currentTime / (this.videoElement.duration || 1)
    if (pct >= 0.5) this.sendMidRollCheck(pct)
  }

  private sendCompletion(pct: number): void {
    navigator.sendBeacon('/api/ab/video-metric', JSON.stringify({
      abVariantId:    this.abVariantId,
      completionRate: pct,
      durationMs:     this.startedAt ? Date.now() - this.startedAt : null,
    }))
  }

  private sendMidRollCheck(pct: number): void {
    navigator.sendBeacon('/api/ab/video-metric', JSON.stringify({
      abVariantId:  this.abVariantId,
      midRollRate:  pct,
    }))
  }
}
```

---

## QQ.8 配信時間帯ABエンジン（新規） {#qq8}

### QQ.8.1 SnsSchedulerの拡張（固定値からAB対応へ）

```typescript
// lib/distribute/SnsAbScheduler.ts

/**
 * 既存の SnsScheduler（固定時間）を拡張して
 * ABテスト対応の動的スケジューリングを実装
 */
export class SnsAbScheduler {

  /**
   * 配信時間帯のABテストが実行中かチェックし
   * 実行中なら半分のジョブをバリアント時間帯に振り分ける
   */
  async scheduleWithAbTest(params: {
    propertyId: string
    platform:   'instagram' | 'youtube' | 'x' | 'line'
    sceneJson:  SceneConfig
  }): Promise<void> {
    const boss = await getBoss()

    // 実行中の配信時間帯ABテストを確認
    const { data: activeTest } = await supabase
      .from('ab_variants')
      .select('id, traffic_split, ab_delivery_schedules(*)')
      .eq('status', 'running')
      .eq('content_type', 'delivery_time')
      .limit(1)
      .maybeSingle()

    if (!activeTest || !activeTest.ab_delivery_schedules?.[0]) {
      // ABテストなし: 既存の最適固定時間で配信
      await this.scheduleDefault(boss, params)
      return
    }

    const schedule = activeTest.ab_delivery_schedules[0]

    // traffic_split に従って振り分け
    // 例: traffic_split = 0.5 なら次回配信はバリアント時間帯
    const useVariant = Math.random() < activeTest.traffic_split

    if (useVariant) {
      await this.scheduleAt(boss, params, {
        day: schedule.day_of_week,
        hour: schedule.hour,
        abVariantId: activeTest.id,
      })
      // posts_sent をインクリメント
      await supabase.rpc('increment_delivery_schedule_posts', {
        variant_id: activeTest.id,
      })
    } else {
      await this.scheduleDefault(boss, params)
    }
  }

  /**
   * デフォルトの最適時間帯で配信
   * （既存 SNS_OPTIMAL_TIMES の固定値 → ABテスト知識から動的に学習した値）
   */
  private async scheduleDefault(boss: PgBoss, params: ScheduleParams): Promise<void> {
    // 過去の勝者パターンがあればそれを使用、なければ従来の固定値にフォールバック
    const { data: winner } = await supabase
      .from('ab_winning_patterns')
      .select('winning_pattern')
      .eq('content_type', 'delivery_time')
      .eq('winning_pattern->>platform', params.platform)
      .order('avg_lift', { ascending: false })
      .limit(1)
      .maybeSingle()

    const defaultTimes: Record<string, { day: string; hour: number }> = {
      instagram: { day: 'tuesday',   hour: 19 },
      youtube:   { day: 'saturday',  hour: 10 },
      x:         { day: 'wednesday', hour: 12 },
      line:      { day: 'sunday',    hour: 20 },
    }

    const time = winner?.winning_pattern ?? defaultTimes[params.platform]
    await this.scheduleAt(boss, params, time)
  }

  private async scheduleAt(boss: PgBoss, params: ScheduleParams, time: {
    day: string; hour: number; abVariantId?: string
  }): Promise<void> {
    const nextTime = calcNextDayHour(time.day, time.hour)
    await boss.sendAfter(
      `sns-post-${params.platform}`,
      { ...params, abVariantId: time.abVariantId ?? null },
      {},
      nextTime,
    )
  }
}
```

### QQ.8.2 配信時間帯ヒートマップのデータ集計

```sql
-- マスター管理画面の配信時間帯ヒートマップ用ビュー
CREATE MATERIALIZED VIEW delivery_time_heatmap AS
SELECT
  ds.platform,
  ds.day_of_week,
  ds.hour,
  v.property_type,
  AVG(ds.engagement_rate) AS avg_engagement_rate,
  AVG(ds.click_rate)      AS avg_click_rate,
  SUM(ds.posts_sent)      AS total_posts,
  COUNT(DISTINCT v.id)    AS test_count
FROM ab_delivery_schedules ds
JOIN ab_variants v ON v.id = ds.ab_variant_id
WHERE v.status IN ('winner_found', 'stopped', 'inconclusive')
GROUP BY ds.platform, ds.day_of_week, ds.hour, v.property_type;

-- 1時間ごとにリフレッシュ（pg-bossで管理）
```

---

## QQ.9 物件種別ごとの戦略分離設計 {#qq9}

### QQ.9.1 WinnerPatternService（勝者知識の蓄積と活用）

```typescript
// lib/abtest/WinnerPatternService.ts

export class WinnerPatternService {
  /**
   * ABテスト終了時に勝者パターンを記録
   */
  async recordWinner(params: {
    abVariantId:  string
    contentType:  AbContentType
    propertyType: string
    winnerConfig: Record<string, unknown>
    lift:         number
  }): Promise<void> {
    // 既存のパターンがあればwin_countと平均liftを更新
    const { data: existing } = await supabase
      .from('ab_winning_patterns')
      .select('id, win_count, avg_lift')
      .eq('property_type', params.propertyType)
      .eq('content_type', params.contentType)
      // JSONB の等値比較
      .filter('winning_pattern', 'eq', JSON.stringify(params.winnerConfig))
      .maybeSingle()

    if (existing) {
      const newWinCount = existing.win_count + 1
      const newAvgLift  = ((existing.avg_lift ?? 0) * existing.win_count + params.lift) / newWinCount
      await supabase
        .from('ab_winning_patterns')
        .update({
          win_count:        newWinCount,
          avg_lift:         newAvgLift,
          confidence_score: Math.min(newWinCount / 10, 1.0),  // 10勝で信頼度MAX
          updated_at:       new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('ab_winning_patterns')
        .insert({
          property_type:    params.propertyType,
          content_type:     params.contentType,
          winning_pattern:  params.winnerConfig,
          win_count:        1,
          avg_lift:         params.lift,
          confidence_score: 0.1,
        })
    }
  }

  /**
   * 次のABテスト生成時に使用する推奨パターンを返す
   */
  async getRecommendedPattern(
    propertyType: string,
    contentType:  AbContentType,
    tenantId?:    string,
  ): Promise<Record<string, unknown> | null> {
    // テナント固有パターンを優先、なければグローバルパターン
    const { data } = await supabase
      .from('ab_winning_patterns')
      .select('winning_pattern, avg_lift, confidence_score')
      .eq('property_type', propertyType)
      .eq('content_type', contentType)
      .or(`tenant_id.eq.${tenantId ?? 'null'},tenant_id.is.null`)
      .order('confidence_score', { ascending: false })
      .order('avg_lift', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data?.winning_pattern ?? null
  }
}
```

---

## QQ.10 OrchestrationLoopとの統合 {#qq10}

### QQ.10.1 スキャンシグナルへのABテストシグナル追加

```typescript
// lib/agent/OrchestrationLoop.ts（既存ファイルの拡張箇所）

// 既存の scanAllProperties() に追加するシグナル検出ロジック

// シグナル QQ-1: ABテストで統計的有意差が確認された
const significantTests = await supabase
  .from('ab_variants')
  .select('id, scene_id, content_type, property_type, auto_deploy')
  .eq('status', 'running')
  .not('p_value', 'is', null)
  .lte('p_value', 0.05)
  // scenes -> properties の JOIN
  .select(`
    id, content_type, property_type, auto_deploy,
    scenes!inner ( property_id )
  `)

for (const test of significantTests.data ?? []) {
  signals.push({
    propertyId: test.scenes.property_id,
    trigger:    'ab_test_winner',
    priority:   9,
    metadata:   { abVariantId: test.id, contentType: test.content_type, autoDeploy: test.auto_deploy },
  })
}

// シグナル QQ-2: サムネイルABテストのサンプル不足（72時間経過・50件未達）
const staleAbTests = await supabase
  .from('ab_variants')
  .select('id, content_type, scenes!inner(property_id)')
  .eq('status', 'running')
  .eq('content_type', 'sns_thumbnail')
  .lt('sessions', 50)
  .lt('started_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())

for (const test of staleAbTests.data ?? []) {
  signals.push({
    propertyId: test.scenes.property_id,
    trigger:    'ab_stale_thumbnail',
    priority:   4,
    metadata:   { abVariantId: test.id },
  })
}
```

### QQ.10.2 ABテスト勝者の自動デプロイ（ImprovementAgent拡張）

```typescript
// lib/agent/ImprovementAgent.ts（既存ファイルへの追加）

// トリガー 'ab_test_winner' の処理
case 'ab_test_winner': {
  const { abVariantId, contentType, autoDeploy } = trigger.metadata

  const { data: variant } = await supabase
    .from('ab_variants')
    .select('*, ab_thumbnail_variants(*), ab_video_variants(*)')
    .eq('id', abVariantId)
    .single()

  if (!variant) break

  // 1. 勝者パターンを記録
  await winnerPatternService.recordWinner({
    abVariantId,
    contentType,
    propertyType:  variant.property_type ?? 'unknown',
    winnerConfig:  this.extractWinnerConfig(variant, contentType),
    lift:          variant.lift ?? 0,
  })

  // 2. auto_deploy が有効なら自動でデフォルトに昇格
  if (autoDeploy) {
    await this.deployWinner(variant, contentType)
  } else {
    // 手動承認待ちキューに追加
    await supabase.from('improvement_queue').insert({
      property_id:  trigger.propertyId,
      trigger_type: 'ab_test_winner',
      metrics_json: { abVariantId, contentType, lift: variant.lift },
      status:       'waiting_approval',
    })
  }

  // 3. ABテストを終了
  await supabase
    .from('ab_variants')
    .update({
      status:           'winner_found',
      ended_at:         new Date().toISOString(),
      winner_variant_id: abVariantId,
    })
    .eq('id', abVariantId)

  break
}
```

---

## QQ.11 マスター管理画面 ABテストモジュール {#qq11}

### QQ.11.1 ファイル構造

```
apps/master/app/ab-tests/
├── page.tsx                    # ABテスト一覧（全テナント・全タイプ横断）
├── new/
│   └── page.tsx                # 新規テスト設計ウィザード
└── [id]/
    ├── page.tsx                # テスト詳細・リアルタイム統計
    ├── significance/page.tsx   # 統計的有意性レポート
    ├── heatmap/page.tsx        # 配信時間帯ヒートマップ（delivery_timeのみ）
    └── deploy/page.tsx         # 勝者デプロイ承認（auto_deploy=false の場合）
```

### QQ.11.2 一覧画面の主要表示項目

```typescript
// apps/master/app/ab-tests/page.tsx

interface AbTestListItem {
  id:              string
  tenantName:      string           // テナント名
  propertyName:    string           // 物件名
  contentType:     AbContentType    // 'lp' | 'sns_thumbnail' | 'video' | 'delivery_time'
  propertyType:    string | null    // 種別（nullは全種別）
  status:          AbStatus
  controlLabel:    string           // 「デザインA」
  variantLabel:    string           // 「デザインB: emotion_hero」
  controlCvr:      number           // 対照群コンバージョン率
  variantCvr:      number           // バリアントコンバージョン率
  lift:            number | null    // 改善率
  pValue:          number | null    // p値
  sampleProgress:  number           // 現在サンプル数 / 目標サンプル数（0.0〜1.0+）
  startedAt:       string
  daysRunning:     number
}

// フィルタ・ソート
type AbTestFilter = {
  contentType?:  AbContentType
  status?:       AbStatus
  propertyType?: string
  tenantId?:     string
}
```

### QQ.11.3 統計詳細ダッシュボード（significance/page.tsx）

```
┌─────────────────────────────────────────────────────────────────────┐
│  ABテスト詳細: 「新築向けサムネイル price_focus vs emotion_hero」         │
│  物件: 秦野市新築4LDK  |  種別: newBuild  |  実行中 7日目              │
├──────────────────────────┬──────────────────────────────────────────┤
│  対照群（A）: price_focus  │  バリアント（B）: emotion_hero               │
│                          │                                          │
│  インプレッション: 1,240     │  インプレッション: 1,198                    │
│  クリック数: 42             │  クリック数: 67                            │
│  CTR: 3.39%              │  CTR: 5.59%                            │
│                          │  ▲ +64.9% リフト                        │
├──────────────────────────┴──────────────────────────────────────────┤
│  統計的有意性                                                          │
│                                                                     │
│  p値: 0.0031  ✅ 有意（閾値 p < 0.05）                               │
│  信頼水準: 95%   Z スコア: 2.97                                       │
│  推奨: 🏆 バリアントB（emotion_hero）を採用                             │
│                                                                     │
│  サンプル進捗: ████████████████████ 1,198 / 目標 80 ✅ 達成済み         │
├─────────────────────────────────────────────────────────────────────┤
│  [勝者を承認してデプロイ] [継続する] [テストを停止]                        │
└─────────────────────────────────────────────────────────────────────┘
```

### QQ.11.4 物件種別 × コンテンツタイプ 勝者マトリクス

```typescript
// apps/master/app/ab-tests/page.tsx の下部に表示

// 勝者知識テーブルから集計した「何が勝ちやすいか」マトリクス
interface WinnerMatrix {
  propertyType: string
  contentType:  string
  topPattern:   string    // 最も勝率の高いパターン名
  avgLift:      number    // 平均改善率
  confidence:   number    // 信頼度（勝ち数 / 10）
  winCount:     number    // 勝利回数
}

// 表示例:
// | 種別         | LP          | SNSサムネイル  | 動画         | 配信時間帯     |
// |-------------|-------------|-------------|-------------|--------------|
// | newBuild    | lifestyle◎  | emotion_hero◎| cinematic◎  | 土曜10時◎    |
// | modelHouse  | lifestyle◎  | emotion_hero○| emotional△  | 未定          |
// | preowned    | price○      | price_focus○ | bright○     | 水曜12時○    |
// | land        | price◎      | price_focus◎ | bright◎     | 火曜19時○    |
// | landSingle  | price○      | feature_list△| minimal△   | 未定          |
// ◎=信頼度高  ○=データ蓄積中  △=サンプル少  未定=テスト未実施
```

---

## QQ.12 テナント向け最小限ダッシュボード {#qq12}

### QQ.12.1 表示項目（意図的に絞る）

```typescript
// apps/dashboard/app/(tenant)/analytics/ab/page.tsx

// テナントが見るのはこれだけ
interface TenantAbSummary {
  activeTestCount: number           // 「現在 3 件のABテストを自動実行中」
  completedThisMonth: number        // 「今月 2 件のテストが完了」

  lastWinner: {
    contentType:     string         // 「SNSサムネイル」
    improvement:     string         // 「クリック率 +64%」
    deployedAt:      string         // 「3日前に自動適用済み」
    propertyName:    string         // 「秦野市新築4LDK」
  } | null

  cumulativeLift: number            // 「今月の反響数改善合計: +23%」
}

// ❌ テナントには表示しない:
//   - p値・Z値などの統計値
//   - 他のテナントとの比較
//   - 個別バリアントの詳細設定
//   - マスター管理画面へのリンク・案内
```

### QQ.12.2 テナント向けUI構成（Part PP との整合）

```
テナントダッシュボード「最適化」タブ:

  ┌─────────────────────────────────┐
  │  🔬 自動最適化 実行中            │
  │                                 │
  │  現在 3件のテストを実行中         │
  │  ──────────────────────────    │
  │  先週の成果:                     │
  │  SNSサムネイルのクリック率 +64%   │
  │  （秦野市新築4LDK・自動適用済み）  │
  │                                 │
  │  今月の合計改善: +23%            │
  └─────────────────────────────────┘
```

---

## QQ.13 MCPサーバー `mcp_sisliR_abtest` {#qq13}

```typescript
// apps/mcp/src/servers/mcp_sisliR_abtest/index.ts

export const mcp_sisliR_abtest = createMcpServer({
  name: 'mcp_sisliR_abtest',
  tools: [
    {
      name: 'create_ab_test',
      description: '新しいABテストを作成する',
      inputSchema: AbTestConfigSchema.omit({ id: true }),
      handler: async (input) => {
        // 物件種別の推奨サンプルサイズを自動設定
        const strategy = PROPERTY_TYPE_CREATIVE_STRATEGY[input.propertyType ?? 'newBuild']
        const sampleSizeTarget = input.sampleSizeTarget ?? strategy.avgSampleNeeded

        const { data, error } = await supabase
          .from('ab_variants')
          .insert({ ...input, sample_size_target: sampleSizeTarget, status: 'running' })
          .select()
          .single()
        if (error) throw error
        return data
      },
    },
    {
      name: 'get_ab_significance',
      description: '指定したABテストの統計的有意性を計算して返す',
      inputSchema: z.object({ variantId: z.string().uuid() }),
      handler: async ({ variantId }) => {
        const { data: variant } = await supabase
          .from('ab_variants')
          .select('sessions, leads_count, control_variant_id, sample_size_target, content_type')
          .eq('id', variantId)
          .single()

        if (!variant?.control_variant_id) {
          return { error: '対照群のvariantIdが設定されていません' }
        }

        const { data: control } = await supabase
          .from('ab_variants')
          .select('sessions, leads_count')
          .eq('id', variant.control_variant_id)
          .single()

        return checkSignificance({
          controlSessions:    control?.sessions    ?? 0,
          controlConversions: control?.leads_count ?? 0,
          variantSessions:    variant.sessions     ?? 0,
          variantConversions: variant.leads_count  ?? 0,
          sampleSizeTarget:   variant.sample_size_target ?? 200,
        })
      },
    },
    {
      name: 'deploy_winner',
      description: 'ABテストの勝者バリアントをデフォルトに昇格する',
      inputSchema: z.object({
        variantId:   z.string().uuid(),
        confirmedBy: z.string(),  // スタッフ名（監査ログ用）
      }),
      handler: async ({ variantId, confirmedBy }) => {
        // ... 勝者デプロイロジック（scene JSON の更新 + ISR再生成）
      },
    },
    {
      name: 'list_winning_patterns',
      description: '物件種別・コンテンツタイプ別の勝者パターン一覧を返す',
      inputSchema: z.object({
        propertyType: PropertyTypeSchema.optional(),
        contentType:  AbContentTypeSchema.optional(),
        limit:        z.number().int().max(20).default(10),
      }),
      handler: async (input) => {
        let query = supabase
          .from('ab_winning_patterns')
          .select('*')
          .order('avg_lift', { ascending: false })
          .limit(input.limit)
        if (input.propertyType) query = query.eq('property_type', input.propertyType)
        if (input.contentType)  query = query.eq('content_type',  input.contentType)
        const { data } = await query
        return data
      },
    },
  ],
})
```

---

## QQ.14 pg-bossジョブ定義 {#qq14}

### QQ.14.1 ジョブ一覧

```typescript
// apps/api/cron/abTestJobs.ts

// ジョブ1: ABテスト有意性の日次チェック（毎日0:30）
export const AB_SIGNIFICANCE_DAILY_JOB = {
  name: 'ab-significance-daily',
  cron: '30 0 * * *',  // 毎日 JST 9:30（UTC 0:30）
  handler: async () => {
    const span = tracer.startSpan('job.ab_significance_daily')
    try {
      const { data: runningTests } = await supabase
        .from('ab_variants')
        .select(`
          id, content_type, property_type,
          sessions, leads_count,
          control_variant_id,
          sample_size_target, auto_deploy
        `)
        .eq('status', 'running')

      for (const test of runningTests ?? []) {
        if (!test.control_variant_id) continue

        const { data: control } = await supabase
          .from('ab_variants')
          .select('sessions, leads_count')
          .eq('id', test.control_variant_id)
          .single()

        // コンテンツタイプ別の計測値を取得
        const variantMetrics = await getAbMetrics(test.id, test.content_type, supabase)
        const controlMetrics = await getAbMetrics(test.control_variant_id, test.content_type, supabase)

        const result = checkSignificance({
          controlSessions:    controlMetrics.sessions,
          controlConversions: controlMetrics.conversions,
          variantSessions:    variantMetrics.sessions,
          variantConversions: variantMetrics.conversions,
          sampleSizeTarget:   test.sample_size_target,
        })

        // ログ保存
        await supabase.from('ab_significance_log').insert({
          ab_variant_id:        test.id,
          control_sessions:     controlMetrics.sessions,
          control_conversions:  controlMetrics.conversions,
          variant_sessions:     variantMetrics.sessions,
          variant_conversions:  variantMetrics.conversions,
          p_value:     result.pValue,
          lift:        result.lift,
          confidence:  result.confidence,
          z_score:     result.zScore,
          recommendation: result.recommendation,
          notes:       result.notes ?? '',
        })

        // ab_variants を最新値で更新
        await supabase
          .from('ab_variants')
          .update({ p_value: result.pValue, lift: result.lift })
          .eq('id', test.id)

        // 停止推奨なら status を更新してシグナルを立てる
        if (result.recommendation !== 'continue') {
          const newStatus = result.recommendation === 'stop_inconclusive'
            ? 'inconclusive'
            : 'winner_found'
          await supabase
            .from('ab_variants')
            .update({ status: newStatus, ended_at: new Date().toISOString() })
            .eq('id', test.id)
        }
      }

      span.setStatus({ code: SpanStatusCode.OK })
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  },
}

// ジョブ2: SNSインサイト同期（6時間ごと）
export const SNS_INSIGHTS_SYNC_JOB = {
  name: 'sns-insights-sync',
  cron: '0 */6 * * *',
  handler: async () => {
    // 各プラットフォームのAPIからインサイトを取得してab_thumbnail_variantsを更新
    // （Instagram Graph API / YouTube Analytics API / X Analytics API / LINE Analytics API）
  },
}

// ジョブ3: 配信時間帯ヒートマップのマテリアライズドビュー更新（1時間ごと）
export const DELIVERY_HEATMAP_REFRESH_JOB = {
  name: 'delivery-heatmap-refresh',
  cron: '0 * * * *',
  handler: async () => {
    await supabase.rpc('refresh_delivery_time_heatmap')
  },
}
```

---

## QQ.15 テスト戦略（Part AAとの統合） {#qq15}

### QQ.15.1 ABテストエンジン固有のUnit Tests

```typescript
// tests/unit/ABSignificanceEngine.test.ts
import { describe, it, expect } from 'vitest'
import { checkSignificance, zTestTwoProportions } from '@sislir/analytics/ABSignificanceEngine'

describe('zTestTwoProportions', () => {
  it('同一CVRの場合 p値が1に近い（有意差なし）', () => {
    const { pValue } = zTestTwoProportions(100, 10, 100, 10)
    expect(pValue).toBeGreaterThan(0.9)
  })

  it('明確な差がある場合 p値が0.05未満', () => {
    // A: 100セッションで5リード（5%）
    // B: 100セッションで15リード（15%）
    const { pValue, lift } = zTestTwoProportions(100, 5, 100, 15)
    expect(pValue).toBeLessThan(0.05)
    expect(lift).toBeGreaterThan(0)  // Bが優位
  })

  it('サンプル数5未満は p値1を返す（ガード）', () => {
    const { pValue } = zTestTwoProportions(3, 1, 3, 2)
    expect(pValue).toBe(1)
  })
})

describe('checkSignificance', () => {
  it('サンプル不足時は continue を推奨', () => {
    const result = checkSignificance({
      controlSessions: 20, controlConversions: 2,
      variantSessions: 20, variantConversions: 4,
      sampleSizeTarget: 80,
    })
    expect(result.recommendation).toBe('continue')
  })

  it('有意差ありでBが優位な場合 stop_winner_b を推奨', () => {
    const result = checkSignificance({
      controlSessions: 200, controlConversions: 10,  // 5%
      variantSessions: 200, variantConversions: 30,  // 15%
      sampleSizeTarget: 80,
    })
    expect(result.recommendation).toBe('stop_winner_b')
    expect(result.pValue).toBeLessThan(0.05)
  })

  it('十分なサンプルで有意差なし → stop_inconclusive', () => {
    const result = checkSignificance({
      controlSessions: 500, controlConversions: 50,
      variantSessions: 500, variantConversions: 51,
      sampleSizeTarget: 80,  // 十分に達成
    })
    expect(result.recommendation).toBe('stop_inconclusive')
  })
})
```

```typescript
// tests/unit/WinnerPatternService.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('WinnerPatternService.recordWinner', () => {
  it('新規パターンは win_count=1 で登録される', async () => {
    // ...
  })

  it('既存パターンは win_count が加算される', async () => {
    // ...
  })

  it('avg_lift が累積平均で更新される', async () => {
    // 1回目: lift=0.20、2回目: lift=0.10 → avg=0.15
    // ...
  })
})
```

```typescript
// tests/integration/abtest/abtest-flow.test.ts
describe('ABテスト完全フロー', () => {
  it('テスト作成 → 日次チェック → 勝者確定 → パターン記録 までが正常に動作する', async () => {
    // 1. ABテスト作成
    // 2. セッション・コンバージョンをシミュレート挿入
    // 3. ab-significance-daily ジョブを手動実行
    // 4. status が winner_found になることを確認
    // 5. ab_winning_patterns に記録されることを確認
  })

  it('RLSテナント分離: 他テナントのABテストを参照・更新できない', async () => {
    // tenant Aのユーザーが tenant BのABテストにアクセスしようとしてもRLSで遮断される
  })
})
```

### QQ.15.2 カバレッジ目標（Part AA整合）

| テスト種別 | 対象ファイル | カバレッジ目標 |
|---|---|---|
| Unit | `ABSignificanceEngine.ts` | **100%** （統計計算は完全カバー必須） |
| Unit | `WinnerPatternService.ts` | 90%+ |
| Unit | `ThumbnailAbGenerator.ts` | 80%+ |
| Integration | `abtest-flow.test.ts` | 全ハッピーパス + RLS分離 |
| E2E | マスター画面でのデプロイ承認フロー | クリティカルパスのみ |

---

## QQ.16 ADRログ {#qq16}

| ADR番号 | 決定内容 | 理由 | 代替案 |
|---------|---------|------|--------|
| **ADR-173** | ABテスト対象を LP / SNSサムネイル / 動画 / 配信時間帯の4タイプに拡張する | v10.1時点でLPのみのABテストは「LPの入口」しかテストしていない。集客の最上流（SNSサムネイルのCTR）と最下流（動画視聴後のリード）も最適化対象とすることで改善ループの精度が飛躍的に向上する | LPのみに留める（改善速度が遅い・根本原因特定が困難） |
| **ADR-174** | 物件種別ごとに独立した勝者知識（ab_winning_patterns）を蓄積する | 注文住宅モデルハウス（高関与・感情訴求・平均検討期間3ヶ月）と分譲地（価格感度高・即決・スペック比較）では購買ペルソナが根本的に異なる。同一テーブルで平均化した知識は誤った改善を引き起こすリスクがある | 全種別を1つのモデルで学習（精度低下） |
| **ADR-175** | 統計的有意性の判定にカイ二乗検定ではなくZ検定（2標本比率）を採用する | 既存の `chiSquareTest` 関数より実装が透明で、2比率の直接比較に特化している。p値・Z値・信頼区間の解釈がチームメンバーにとって分かりやすい | カイ二乗検定（既存実装）、ベイズ推定（実装コスト高） |
| **ADR-176** | ABテストの自動デプロイは `auto_deploy=TRUE` を明示設定したテストのみに適用する | 全テストを自動デプロイすると「仮説なしの偶然の結果」が本番に適用されるリスクがある。高単価の受注制作物件（トラックB）では特に人間の確認が必要 | 全テスト自動デプロイ（ヒューマンエラーリスク）、全テスト手動（改善ループが遅い） |
| **ADR-177** | テナント向けダッシュボードにはABテストの統計的詳細（p値・Z値）を表示しない | テナントの大多数は統計的有意性の概念を持たない。p値を誤解したテナントが早期終了を要求するサポートコストが高くなる可能性がある。「改善率 +X%」という結果のみ伝えれば十分 | 全情報をテナントに開示（マスター画面との実質的な一致・混乱リスク） |
| **ADR-178** | 配信時間帯の固定値（SNS_OPTIMAL_TIMES）を廃止し、ABテスト知識から動的に学習した値にフォールバックする | 固定値は不動産業界の一般的な最適時間帯に基づくが、テナントの物件種別・エリア・ターゲット層によって最適時間帯は大きく異なる。ABテストの蓄積知識を優先することで精度が向上する | 固定値を維持（実装コスト低いが精度が向上しない） |
| **ADR-179** | ABテストエンジンはOrchestrationLoopのシグナルスキャンに統合し、独立したcronジョブは設けない | OrchestrationLoopが既に全物件のシグナルスキャンを行っている。ABテスト勝者確定もその1シグナルとして扱うことでシステムの複雑度を増やさずに済む。ただし統計計算のバッチ（AB_SIGNIFICANCE_DAILY_JOB）は独立jobとして維持する | ABテスト専用のcronループ（重複スキャンによるDBコスト増加） |

---

## QQ.17 実装ロードマップ {#qq17}

### Phase 1（Week 1〜2）: DB基盤 + 統計エンジン
| タスク | 担当 | 優先度 |
|---|---|---|
| Migration `0015_ab_variants_v2.sql` 実行 | Backend | 最高 |
| `ab_thumbnail_variants` / `ab_video_variants` / `ab_delivery_schedules` テーブル作成 | Backend | 最高 |
| `ab_winning_patterns` / `ab_significance_log` テーブル作成 | Backend | 最高 |
| `ABSignificanceEngine.ts` 実装 + Unit Tests 100% | Backend | 最高 |
| `WinnerPatternService.ts` 実装 + Unit Tests | Backend | 高 |
| Zodスキーマ `packages/shared/schemas/abTest.ts` 追加 | Backend | 最高 |

### Phase 2（Week 3〜4）: SNSサムネイルAB
| タスク | 担当 | 優先度 |
|---|---|---|
| `ThumbnailAbGenerator.ts` 実装 | Backend | 高 |
| `PROPERTY_TYPE_CREATIVE_STRATEGY` 定数定義 | Backend | 高 |
| SNSインサイト同期ジョブ実装（SNS_INSIGHTS_SYNC_JOB） | Backend | 高 |
| `AbTestRenderer` traffic_split 対応拡張 | Frontend | 高 |
| Integration Tests（abtest-flow.test.ts） | Backend | 高 |

### Phase 3（Week 5〜6）: 動画AB + 配信時間帯AB
| タスク | 担当 | 優先度 |
|---|---|---|
| `VideoAbRouter.ts` 実装 | Backend | 中 |
| `VideoAbBeacon.ts` 実装（フロントエンド計測） | Frontend | 中 |
| `SnsAbScheduler.ts` 実装（固定値廃止） | Backend | 中 |
| `delivery_time_heatmap` マテリアライズドビュー作成 | Backend | 中 |
| `AB_SIGNIFICANCE_DAILY_JOB` pg-boss 登録 | Backend | 高 |

### Phase 4（Week 7〜8）: マスター管理画面 + テナントUI
| タスク | 担当 | 優先度 |
|---|---|---|
| `apps/master/app/ab-tests/` 全画面実装 | Frontend | 中 |
| 統計詳細ダッシュボード（significance/page.tsx） | Frontend | 中 |
| 配信時間帯ヒートマップ（heatmap/page.tsx） | Frontend | 中 |
| テナント向け最小限サマリーUI（TenantAbSummary） | Frontend | 中 |
| `mcp_sisliR_abtest` MCP サーバー実装 | Backend | 中 |
| E2E テスト（マスター画面デプロイ承認フロー） | QA | 中 |

---

## バージョン履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1.0 | 2026-06-12 | 初版。v10.1のABテスト設計ギャップ分析（ADR-173〜179）を受けて策定。LP・SNSサムネイル・動画・配信時間帯の4コンテンツタイプと物件種別分離ABテスト基盤を定義。統計エンジン（Z検定）・勝者知識蓄積・OrchestrationLoop統合・マスター管理画面モジュールを包含 |
| v1.1 | 2026-06-13 | ADR番号体系棚卸し（ADR-161〜167→ADR-173〜179）に伴いリナンバリング。旧ADR-161〜167は他Part（MM/RR/SS）と番号衝突していたため、本Partの専有帯（ADR-173〜179）へ移動 |

---

*SisliR v10.1 Part QQ — ABテストエンジン完全設計書*
*最終更新: 2026年6月 | v1.0*
