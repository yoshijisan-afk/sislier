/**
 * SisliR v10.1 — Scene JSON Schema v10.0.0
 * packages/shared/src/schemas/scene.ts
 *
 * 設計根拠: Part NN.2.1（不変/可変フィールド分離）
 * ADR-136: ImmutablePropertySchema として建物構造を分離
 * ADR-144: FloorplanVLM廃止 → 'floorplan_claude_vision' に統一
 * ADR-160: structureSource enum の整合
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────
// 建物構造サブスキーマ（不変・Part NN.2.2）
// ─────────────────────────────────────────────────────

export const RoomTypeSchema = z.enum([
  'ldk', 'bedroom', 'bathroom', 'toilet',
  'entrance', 'closet', 'balcony', 'garage',
  'study', 'japanese_room', 'storage',
])
export type RoomType = z.infer<typeof RoomTypeSchema>

export const RoomSchema = z.object({
  id:     z.string().min(1),
  type:   RoomTypeSchema,
  /** 左下角 X座標（メートル・建物原点からの相対）*/
  x:      z.number(),
  /** 左下角 Y座標（メートル）*/
  y:      z.number(),
  width:  z.number().positive(),
  depth:  z.number().positive(),
  height: z.number().positive().default(2.4),
  /** 階数（1=1F / 2=2F）*/
  floor:  z.number().int().min(1),
  /** 面積（㎡）*/
  area:   z.number().positive(),
  /** 表示ラベル例: "LDK 20.5畳" */
  label:  z.string().optional(),
})
export type RoomDef = z.infer<typeof RoomSchema>

export const WallSchema = z.object({
  id:         z.string().min(1),
  x1: z.number(), y1: z.number(),
  x2: z.number(), y2: z.number(),
  /** 壁厚（m）デフォルト 0.12m */
  thickness:  z.number().positive().default(0.12),
  floor:      z.number().int().min(1),
  isExternal: z.boolean(),
})
export type WallDef = z.infer<typeof WallSchema>

export const OpeningTypeSchema = z.enum([
  'door', 'window', 'sliding_door', 'french_window',
])

export const OpeningSchema = z.object({
  id:         z.string().min(1),
  type:       OpeningTypeSchema,
  /** 所属する WallSchema の id */
  wallId:     z.string().min(1),
  /** 壁上の位置（0.0〜1.0）*/
  position:   z.number().min(0).max(1),
  width:      z.number().positive(),
  /** 窓台高さ（m）窓のみ */
  sillHeight: z.number().optional(),
  /** まぐさ高さ（m）*/
  headHeight: z.number().optional(),
})
export type OpeningDef = z.infer<typeof OpeningSchema>

// ─────────────────────────────────────────────────────
// structureSource（ADR-144 / ADR-160）
// ─────────────────────────────────────────────────────

export const StructureSourceSchema = z.enum([
  /** Claude Vision による間取り図解析（実測 75〜85% IoU）*/
  'floorplan_claude_vision',
  /** BIM/IFC から生成（精度 0.95+）*/
  'bim_ifc',
  /** 手動入力 */
  'manual_input',
  /** AI 自動生成（LP 表示時に免責文必須）*/
  'procedural',
  // 'floorplan_vlm' は ADR-144 で廃止。旧データは SceneAdapter でマイグレーション
])
export type StructureSource = z.infer<typeof StructureSourceSchema>

// ─────────────────────────────────────────────────────
// ImmutablePropertySchema（Part NN.2.1）
// ADR-136: エディタ UI から変更不可フィールド
// ─────────────────────────────────────────────────────

export const PropertyTypeSchema = z.enum([
  'mansion',    // マンション
  'house',      // 一戸建て
  'land',       // 土地
  'office',     // 事務所
  'shop',       // 店舗
  'warehouse',  // 倉庫
])
export type PropertyType = z.infer<typeof PropertyTypeSchema>

export const PropertyStructureSchema = z.object({
  rooms:      z.array(RoomSchema),
  walls:      z.array(WallSchema),
  openings:   z.array(OpeningSchema),
  /** 北方向角度（度）：日照計算・採光シミュレーションの基準 */
  northAngle: z.number().min(0).max(360),
})
export type PropertyStructure = z.infer<typeof PropertyStructureSchema>

export const ImmutablePropertySchema = z.object({
  propertyType:       PropertyTypeSchema,
  /** 所在地（宅建業法 第35条 重要事項説明の必須記載事項）*/
  address:            z.string().min(1),
  landArea:           z.number().positive().optional(),
  buildingArea:       z.number().positive().optional(),
  totalFloors:        z.number().int().positive().optional(),
  builtYear:          z.number().int().optional(),
  /** 間取り表記例: "3LDK" */
  layoutDescription:  z.string().optional(),
  structure:          PropertyStructureSchema.optional(),
  structureSource:    StructureSourceSchema,
  /** 構造解析精度（0.0〜1.0）ADR-151 ルーティング閾値と整合 */
  structureAccuracy:  z.number().min(0).max(1),
})
export type ImmutableProperty = z.infer<typeof ImmutablePropertySchema>

// ─────────────────────────────────────────────────────
// MutablePresentationSchema（Part NN.2.1）
// エディタで自由に編集可能
// ─────────────────────────────────────────────────────

/** Part MM v5.3 / Part NN.2.1 で確定した 10 種プリセット */
export const PostFXPresetSchema = z.enum([
  'none',
  'cinematic',
  'golden_hour',
  'blue_hour',
  'misty_morning',
  'warm_interior',
  'cool_modern',
  'vibrant_resort',
  'monochrome_luxury',
  'natural_light',
  'dramatic_dusk',
])
export type PostFXPreset = z.infer<typeof PostFXPresetSchema>

export const PostFXConfigSchema = z.object({
  preset:    PostFXPresetSchema.default('none'),
  intensity: z.number().min(0).max(1).default(1.0),
})

export const TimePresetSchema = z.enum([
  'dawn', 'morning', 'midday', 'afternoon', 'golden_hour', 'dusk',
])
export type TimePreset = z.infer<typeof TimePresetSchema>

export const LpTemplateConfigSchema = z.object({
  type:           PropertyTypeSchema.optional(),
  startTimePreset: TimePresetSchema.optional(),
  postfxPreset:   PostFXPresetSchema.default('none'),
  emotionCurve:   z.array(z.number()).optional(),
})

export const CTAConfigSchema = z.object({
  primaryCTA: z.object({
    label: z.string().optional(),
    url:   z.string().url().optional(),
  }).optional(),
  secondaryCTA: z.object({
    label: z.string().optional(),
    url:   z.string().url().optional(),
  }).optional(),
  lineEnabled:  z.boolean().default(false),
  priceDisplay: z.boolean().default(false),
})

export const SEOConfigSchema = z.object({
  title:          z.string().max(30).optional(),
  description:    z.string().max(120).optional(),
  structuredData: z.record(z.unknown()).optional(),
})

export const FAQItemSchema = z.object({
  question: z.string(),
  answer:   z.string(),
})

export const AIConfigSchema = z.object({
  faqItems: z.array(FAQItemSchema).default([]),
})

export const SectionCopySchema = z.object({
  id:                      z.string(),
  content:                 z.string(),
  isAiGenerated:           z.boolean().default(false),
  aiLabel:                 z.string().optional(),
  hasProceduralDisclaimer: z.boolean().default(false),
  hasAccuracyDisclaimer:   z.boolean().default(false),
})

export const MutablePresentationSchema = z.object({
  lpTemplate: LpTemplateConfigSchema,
  postFX:     PostFXConfigSchema,
  sections:   z.array(SectionCopySchema).default([]),
  ctaConfig:  CTAConfigSchema,
  ai:         AIConfigSchema,
  seo:        SEOConfigSchema,
})
export type MutablePresentation = z.infer<typeof MutablePresentationSchema>

// ─────────────────────────────────────────────────────
// ComplianceStatusSchema（Part NN.2.3）
// ADR-138: エクスポート API の必須ミドルウェア
// ─────────────────────────────────────────────────────

export const ComplianceItemsSchema = z.object({
  // 宅建業法 第35条 重要事項説明（必須）
  addressDisplayed:     z.boolean(),
  areaDisplayed:        z.boolean(),
  layoutDisplayed:      z.boolean(),
  priceDisplayed:       z.boolean(),
  // 景品表示法 / 公正競争規約
  aiImageLabeled:       z.boolean(),
  proceduralDisclaimer: z.boolean(),
  accuracyDisclaimer:   z.boolean(),
  // 独自追加
  northAngleSet:        z.boolean(),
  structureSourceSet:   z.boolean(),
})
export type ComplianceItems = z.infer<typeof ComplianceItemsSchema>

export const ComplianceOverallSchema = z.enum(['pass', 'warning', 'fail'])
export type ComplianceOverall = z.infer<typeof ComplianceOverallSchema>

export const ComplianceStatusSchema = z.object({
  checkedAt: z.string().datetime(),
  overall:   ComplianceOverallSchema,
  items:     ComplianceItemsSchema,
})
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>

// ─────────────────────────────────────────────────────
// SceneSchema — メインスキーマ
// ─────────────────────────────────────────────────────

export const SceneSchema = z.object({
  version:      z.literal('10.0.0'),
  sceneId:      z.string().uuid(),
  propertyId:   z.string().uuid(),
  agencyId:     z.string().uuid(),
  createdAt:    z.string().datetime(),
  updatedAt:    z.string().datetime(),
  property:     ImmutablePropertySchema,
  presentation: MutablePresentationSchema,
  compliance:   ComplianceStatusSchema,
})
export type SceneConfig = z.infer<typeof SceneSchema>

// ─────────────────────────────────────────────────────
// ファクトリー（テスト・初期化用）
// ─────────────────────────────────────────────────────

export function createDefaultScene(
  overrides: Partial<SceneConfig> = {},
): SceneConfig {
  const now = new Date().toISOString()
  const base: SceneConfig = {
    version:    '10.0.0',
    sceneId:    crypto.randomUUID(),
    propertyId: crypto.randomUUID(),
    agencyId:   crypto.randomUUID(),
    createdAt:  now,
    updatedAt:  now,
    property: {
      propertyType:      'mansion',
      address:           '東京都渋谷区渋谷1-1-1',
      buildingArea:      75.0,
      layoutDescription: '3LDK',
      structureSource:   'procedural',
      structureAccuracy: 0.0,
    },
    presentation: {
      lpTemplate: { postfxPreset: 'none' },
      postFX:     { preset: 'none', intensity: 1.0 },
      sections:   [],
      ctaConfig:  { lineEnabled: false, priceDisplay: false },
      ai:         { faqItems: [] },
      seo:        {},
    },
    compliance: {
      checkedAt: now,
      overall:   'warning',
      items: {
        addressDisplayed:     true,
        areaDisplayed:        true,
        layoutDisplayed:      true,
        priceDisplayed:       false,
        aiImageLabeled:       true,
        proceduralDisclaimer: false,
        accuracyDisclaimer:   false,
        northAngleSet:        false,
        structureSourceSet:   true,
      },
    },
  }
  return { ...base, ...overrides }
}
