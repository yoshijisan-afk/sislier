/**
 * SisliR v10.1 — ComplianceChecker
 * packages/shared/src/lib/ComplianceChecker.ts
 *
 * 設計根拠: Part NN.6.1（宅建業法コンプライアンス自動検証）
 * ADR-138: エクスポート API の必須ミドルウェア
 *
 * 宅建業法・不動産の表示に関する公正競争規約 第3条 準拠
 */

import type {
  SceneConfig,
  ComplianceStatus,
  ComplianceItems,
  ComplianceOverall,
} from '../schemas/scene'

// ─────────────────────────────────────────────────────
// 判定ロジック
// ─────────────────────────────────────────────────────

/** 宅建業法 第35条 必須表示項目（falseが1つでも → overall: 'fail'）*/
const REQUIRED_ITEMS: ReadonlyArray<keyof ComplianceItems> = [
  'addressDisplayed',
  'areaDisplayed',
  'layoutDisplayed',
]

/**
 * ComplianceChecker
 *
 * Scene JSON を受け取り、宅建業法・公正競争規約への
 * 準拠状況を自動検証して ComplianceStatus を返す。
 *
 * @example
 * const status = ComplianceChecker.check(scene)
 * if (status.overall === 'fail') {
 *   throw new Error('宅建業法の必須表示要件を満たしていません')
 * }
 */
export const ComplianceChecker = {
  check(scene: SceneConfig): ComplianceStatus {
    const prop = scene.property
    const pres = scene.presentation

    // ── 各項目の判定 ──────────────────────────────────

    // 所在地表示（宅建業法 第35条）
    const addressDisplayed = typeof prop.address === 'string' && prop.address.length > 0

    // 面積表示（建物面積 or 土地面積のいずれかで可）
    const areaDisplayed = !!(prop.buildingArea || prop.landArea)

    // 間取り表記（「3LDK」等）
    const layoutDisplayed =
      typeof prop.layoutDescription === 'string' &&
      prop.layoutDescription.length > 0

    // 価格表示（任意だが推奨）
    const priceDisplayed = !!pres.ctaConfig?.priceDisplay

    // AI 生成画像のラベル付与
    // sections が空の場合は「対象なし」として pass
    const aiImageLabeled =
      pres.sections.length === 0 ||
      pres.sections.every(
        (s) => !s.isAiGenerated || (typeof s.aiLabel === 'string' && s.aiLabel.length > 0),
      )

    // プロシージャル生成の旨の表示
    // structureSource が 'procedural' の場合のみ必須
    const proceduralDisclaimer =
      prop.structureSource !== 'procedural' ||
      pres.sections.some((s) => s.hasProceduralDisclaimer)

    // 精度免責文（実際と異なる場合の表示）
    const accuracyDisclaimer = pres.sections.some((s) => s.hasAccuracyDisclaimer)

    // 方位（北方向）設定
    const northAngleSet = prop.structure?.northAngle !== undefined

    // 構造データ出所明記
    const structureSourceSet = typeof prop.structureSource === 'string' && prop.structureSource.length > 0

    const items: ComplianceItems = {
      addressDisplayed,
      areaDisplayed,
      layoutDisplayed,
      priceDisplayed,
      aiImageLabeled,
      proceduralDisclaimer,
      accuracyDisclaimer,
      northAngleSet,
      structureSourceSet,
    }

    // ── overall 判定 ──────────────────────────────────
    const overall = resolveOverall(items)

    return {
      checkedAt: new Date().toISOString(),
      overall,
      items,
    }
  },

  /**
   * コンプライアンス違反の概要テキストを返す（UI 表示用）
   */
  getSummaryText(status: ComplianceStatus): string {
    switch (status.overall) {
      case 'pass':
        return '✅ 宅建業法・公正競争規約の要件を満たしています'
      case 'warning': {
        const failedItems = getFailedRecommended(status.items)
        return `⚠️ 推奨項目が未対応です: ${failedItems.join(' / ')}`
      }
      case 'fail': {
        const failedItems = getFailedRequired(status.items)
        return `❌ 必須表示要件が未対応です（公開不可）: ${failedItems.join(' / ')}`
      }
    }
  },

  /**
   * LP 表示時の免責文テキストを返す（Part NN.6.2）
   * structureSource に応じて文言を自動選択
   */
  getDisclaimerText(scene: SceneConfig): string {
    const source   = scene.property.structureSource
    const accuracy = scene.property.structureAccuracy

    if (source === 'procedural') {
      return '※ 建物の外観・内観はイメージCGであり、実際の物件とは異なります。'
    }
    if (source === 'floorplan_claude_vision') {
      const pct = Math.round(accuracy * 100)
      return (
        `※ 間取り図をAI（Claude Vision）が解析し自動生成（精度 約${pct}%）。` +
        '実際の寸法・仕様は重要事項説明書をご確認ください。'
      )
    }
    if (source === 'bim_ifc') {
      return '※ BIM設計データから生成。竣工後の実際と差異が生じる場合があります。'
    }
    // manual_input
    return '※ 実際の物件と表示内容が異なる場合があります。'
  },
}

// ─────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────

function resolveOverall(items: ComplianceItems): ComplianceOverall {
  const failedRequired = getFailedRequired(items)
  if (failedRequired.length > 0) return 'fail'

  const failedRecommended = getFailedRecommended(items)
  if (failedRecommended.length > 0) return 'warning'

  return 'pass'
}

function getFailedRequired(items: ComplianceItems): string[] {
  return REQUIRED_ITEMS.filter((k) => !items[k]).map(labelOf)
}

function getFailedRecommended(items: ComplianceItems): string[] {
  const recommended = (Object.keys(items) as Array<keyof ComplianceItems>).filter(
    (k) => !REQUIRED_ITEMS.includes(k),
  )
  return recommended.filter((k) => !items[k]).map(labelOf)
}

const ITEM_LABELS: Record<keyof ComplianceItems, string> = {
  addressDisplayed:     '所在地',
  areaDisplayed:        '面積',
  layoutDisplayed:      '間取り',
  priceDisplayed:       '価格',
  aiImageLabeled:       'AI画像ラベル',
  proceduralDisclaimer: 'プロシージャル免責文',
  accuracyDisclaimer:   '精度免責文',
  northAngleSet:        '方位設定',
  structureSourceSet:   '構造データ出所',
}

function labelOf(key: keyof ComplianceItems): string {
  return ITEM_LABELS[key] ?? key
}
