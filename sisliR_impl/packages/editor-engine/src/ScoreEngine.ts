/**
 * SisliR v10.1 — ScoreEngine
 * packages/editor-engine/src/ScoreEngine.ts
 *
 * 設計根拠: Part NN.7（動的 100点満点スコア計算）
 * ADR-141: structure(20点) / compliance(20点) を最高配点とする
 * ADR-151: structureAccuracy の精度帯ルーティング閾値と整合
 */

import type { SceneConfig } from '../../shared/src/schemas/scene'

// ─────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────

export type ScoreCategory =
  | 'structure'
  | 'compliance'
  | 'assets'
  | 'emotionDesign'
  | 'aiContent'
  | 'performance'
  | 'cta'

/** 改善提案（score は未達点数の目安）*/
export interface Issue {
  area:  ScoreCategory
  msg:   string
  score: number
}

/** ScoreEngine が自動修正可能な問題 */
export interface AutoFix {
  action: string
  label:  string
}

/** ScoreEngine の出力 */
export interface ScoreResult {
  /** 合計スコア（0〜100）*/
  total:     number
  /** 7項目の内訳*/
  breakdown: Record<ScoreCategory, number>
  /** 改善提案リスト（score 降順）*/
  issues:    Issue[]
  /** 自動修正可能な問題リスト */
  autoFix:   AutoFix[]
}

// ─────────────────────────────────────────────────────
// 配点定数（Part NN.7.1 準拠・合計100点）
// ─────────────────────────────────────────────────────

const MAX_SCORES: Record<ScoreCategory, number> = {
  structure:    20,
  compliance:   20,
  assets:       15,
  emotionDesign: 15,
  aiContent:    10,
  performance:  10,
  cta:          10,
}

// ─────────────────────────────────────────────────────
// ScoreEngine
// ─────────────────────────────────────────────────────

export const ScoreEngine = {
  /**
   * Scene JSON を受け取り ScoreResult を返す（純粋関数）
   */
  compute(scene: SceneConfig): ScoreResult {
    const issues:  Issue[]   = []
    const autoFix: AutoFix[] = []

    const structure    = calcStructure(scene, issues)
    const compliance   = calcCompliance(scene, issues)
    const assets       = calcAssets(scene, issues)
    const emotionDesign = calcEmotionDesign(scene, issues)
    const aiContent    = calcAiContent(scene, issues, autoFix)
    const performance  = calcPerformance(scene, issues)
    const cta          = calcCta(scene, issues)

    const breakdown: Record<ScoreCategory, number> = {
      structure,
      compliance,
      assets,
      emotionDesign,
      aiContent,
      performance,
      cta,
    }

    const total = Math.min(
      100,
      Object.values(breakdown).reduce((a, b) => a + b, 0),
    )

    // issues を未達点数の降順でソート
    issues.sort((a, b) => b.score - a.score)

    return { total, breakdown, issues, autoFix }
  },

  /**
   * スコアをグレード文字列に変換（UI 表示用）
   */
  toGrade(total: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (total >= 95) return 'S'
    if (total >= 80) return 'A'
    if (total >= 65) return 'B'
    if (total >= 50) return 'C'
    return 'D'
  },

  /** 配点の最大値を返す（テスト用）*/
  maxScores(): Record<ScoreCategory, number> {
    return { ...MAX_SCORES }
  },
}

// ─────────────────────────────────────────────────────
// 各カテゴリの計算関数
// ─────────────────────────────────────────────────────

/**
 * structure（20点）
 * 建物構造データの充実度
 */
function calcStructure(scene: SceneConfig, issues: Issue[]): number {
  const structure = scene.property.structure
  let score = 0

  if (!structure || structure.rooms.length === 0) {
    issues.push({
      area:  'structure',
      msg:   '間取り図をインポートして構造データを生成してください（最大+15点）',
      score: 15,
    })
    // rooms なし: northAngle のみ判定
    if (structure?.northAngle !== undefined) score += 5
    else issues.push({ area: 'structure', msg: '方位（北方向）が未設定（+5点）', score: 5 })
    return score
  }

  // rooms あり: +10点
  score += 10

  // 開口部（窓・扉）が rooms 数以上あれば +5点
  const openingCount = structure.openings?.length ?? 0
  if (openingCount >= structure.rooms.length) {
    score += 5
  } else {
    issues.push({
      area:  'structure',
      msg:   `窓・開口部の設定が不完全（${openingCount}件 / 部屋${structure.rooms.length}件）`,
      score: 5,
    })
  }

  // northAngle +5点
  if (structure.northAngle !== undefined) {
    score += 5
  } else {
    issues.push({ area: 'structure', msg: '方位（北方向）が未設定（+5点）', score: 5 })
  }

  return Math.min(score, MAX_SCORES.structure)
}

/**
 * compliance（20点）
 * 宅建業法コンプライアンス準拠度
 */
function calcCompliance(scene: SceneConfig, issues: Issue[]): number {
  const items = scene.compliance.items
  let score = 0

  if (items.addressDisplayed)   score += 5
  if (items.areaDisplayed)      score += 5
  if (items.layoutDisplayed)    score += 4
  if (items.aiImageLabeled)     score += 3
  if (items.accuracyDisclaimer) score += 3

  if (score < MAX_SCORES.compliance) {
    issues.push({
      area:  'compliance',
      msg:   '宅建業法の表示要件を満たしていない項目があります',
      score: MAX_SCORES.compliance - score,
    })
  }

  return Math.min(score, MAX_SCORES.compliance)
}

/**
 * assets（15点）
 * 構造データの品質・精度
 * ADR-151 精度帯ルーティング閾値と整合:
 *   acc ≥ 0.85 → auto_approved 相当 → 12点
 *   0.60 ≤ acc < 0.85 → master_review 相当 → 10点
 *   acc < 0.60 → manual_required 相当 → 7点
 */
function calcAssets(scene: SceneConfig, issues: Issue[]): number {
  const source   = scene.property.structureSource
  const accuracy = scene.property.structureAccuracy ?? 0

  switch (source) {
    case 'bim_ifc':
      return 15

    case 'floorplan_claude_vision': {
      if (accuracy >= 0.85)  return 12
      if (accuracy >= 0.60)  return 10
      issues.push({
        area:  'assets',
        msg:   `間取り解析精度が低い（${Math.round(accuracy * 100)}%）。再スキャンを推奨`,
        score: 12 - 7,
      })
      return 7
    }

    case 'manual_input':
      return 8

    case 'procedural':
      issues.push({
        area:  'assets',
        msg:   'プロシージャル生成: 間取り図のアップロードで最大+11点',
        score: 11,
      })
      return 4

    default:
      return 0
  }
}

/**
 * emotionDesign（15点）
 * 感情曲線・照明・演出の設計
 */
function calcEmotionDesign(scene: SceneConfig, issues: Issue[]): number {
  const tpl = scene.presentation.lpTemplate
  let score = 0

  if (tpl?.type) {
    score += 5
  } else {
    issues.push({ area: 'emotionDesign', msg: 'LPテンプレート種別が未設定（+5点）', score: 5 })
  }

  if (tpl?.startTimePreset) {
    score += 5
  } else {
    issues.push({ area: 'emotionDesign', msg: '照明スタートプリセットが未設定（+5点）', score: 5 })
  }

  const postfx = tpl?.postfxPreset ?? scene.presentation.postFX.preset
  if (postfx && postfx !== 'none') {
    score += 5
  } else {
    issues.push({ area: 'emotionDesign', msg: 'PostFX プリセットが未設定（+5点）', score: 5 })
  }

  return Math.min(score, MAX_SCORES.emotionDesign)
}

/**
 * aiContent（10点）
 * SEO / FAQ / AIコピーの充実度
 */
function calcAiContent(
  scene: SceneConfig,
  issues: Issue[],
  autoFix: AutoFix[],
): number {
  const seo = scene.presentation.seo
  const ai  = scene.presentation.ai
  let score = 0

  if (seo?.title)          score += 3
  else issues.push({ area: 'aiContent', msg: 'SEOタイトルが未設定（+3点）', score: 3 })

  if (seo?.description)    score += 2
  else issues.push({ area: 'aiContent', msg: 'SEOディスクリプションが未設定（+2点）', score: 2 })

  if (seo?.structuredData) score += 2
  else issues.push({ area: 'aiContent', msg: '構造化データ（JSON-LD）が未設定（+2点）', score: 2 })

  const faqCount = ai?.faqItems?.length ?? 0
  if (faqCount >= 5) {
    score += 3
  } else {
    issues.push({
      area:  'aiContent',
      msg:   `FAQ が${faqCount}件（5件以上で+3点）`,
      score: 3,
    })
    autoFix.push({ action: 'generate_faq', label: `FAQを自動生成 (+3点)` })
  }

  return Math.min(score, MAX_SCORES.aiContent)
}

/**
 * performance（10点）
 * 実測値は本番ロードテストで更新。デフォルト 8点。
 */
function calcPerformance(_scene: SceneConfig, _issues: Issue[]): number {
  // フェーズ3のロードテスト結果（P95 < 2000ms）で 10点に更新
  // 現時点では推定 8点（最適化の余地あり）
  return 8
}

/**
 * cta（10点）
 * CTA 設計の充実度
 */
function calcCta(scene: SceneConfig, issues: Issue[]): number {
  const ctaConf = scene.presentation.ctaConfig
  let score = 0

  if (ctaConf?.primaryCTA?.label) {
    score += 4
  } else {
    issues.push({ area: 'cta', msg: 'プライマリCTAのラベルが未設定（+4点）', score: 4 })
  }

  if (ctaConf?.secondaryCTA?.label) {
    score += 3
  } else {
    issues.push({ area: 'cta', msg: 'セカンダリCTAのラベルが未設定（+3点）', score: 3 })
  }

  if (ctaConf?.lineEnabled) {
    score += 3
  } else {
    issues.push({
      area:  'cta',
      msg:   'LINE連携でCV率+30%見込み（+3点）',
      score: 3,
    })
  }

  return Math.min(score, MAX_SCORES.cta)
}
