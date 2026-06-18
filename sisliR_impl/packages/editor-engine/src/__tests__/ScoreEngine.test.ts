/**
 * SisliR v10.1 — ScoreEngine Unit Tests
 * packages/editor-engine/src/__tests__/ScoreEngine.test.ts
 *
 * 実行: npx vitest run
 */

import { describe, it, expect } from 'vitest'
import { ScoreEngine } from '../ScoreEngine'
import { createDefaultScene } from '../../../shared/src/schemas/scene'
import type { SceneConfig } from '../../../shared/src/schemas/scene'

// ─────────────────────────────────────────────────────
// テスト用ヘルパー: 100点満点シーン
// ─────────────────────────────────────────────────────

function makeMaxScene(): SceneConfig {
  const scene = createDefaultScene()

  // structure 20点
  scene.property.structure = {
    rooms: [
      { id: 'r1', type: 'ldk', x: 0, y: 0, width: 6, depth: 5, height: 2.4, floor: 1, area: 30 },
      { id: 'r2', type: 'bedroom', x: 6, y: 0, width: 4, depth: 4, height: 2.4, floor: 1, area: 16 },
    ],
    walls: [
      { id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0, thickness: 0.12, floor: 1, isExternal: true },
    ],
    openings: [
      { id: 'o1', type: 'window', wallId: 'w1', position: 0.3, width: 1.6, sillHeight: 0.8 },
      { id: 'o2', type: 'door',   wallId: 'w1', position: 0.7, width: 0.9 },
    ],
    northAngle: 0,
  }
  scene.property.structureSource   = 'bim_ifc'
  scene.property.structureAccuracy = 0.95

  // compliance 20点
  scene.property.address           = '東京都渋谷区渋谷1-1-1'
  scene.property.buildingArea      = 75.0
  scene.property.layoutDescription = '3LDK'
  scene.presentation.ctaConfig.priceDisplay = true
  scene.presentation.sections = [
    {
      id: 's1',
      content: 'テスト',
      isAiGenerated: false,
      hasProceduralDisclaimer: false,
      hasAccuracyDisclaimer:   true,
    },
  ]
  scene.compliance = {
    checkedAt: new Date().toISOString(),
    overall:   'pass',
    items: {
      addressDisplayed:     true,
      areaDisplayed:        true,
      layoutDisplayed:      true,
      priceDisplayed:       true,
      aiImageLabeled:       true,
      proceduralDisclaimer: true,
      accuracyDisclaimer:   true,
      northAngleSet:        true,
      structureSourceSet:   true,
    },
  }

  // emotionDesign 15点
  scene.presentation.lpTemplate = {
    type:            'mansion',
    startTimePreset: 'golden_hour',
    postfxPreset:    'cinematic',
  }
  scene.presentation.postFX = { preset: 'cinematic', intensity: 1.0 }

  // aiContent 10点
  scene.presentation.seo = {
    title:          '渋谷区の高級マンション',
    description:    '駅徒歩3分・3LDK・南向き・2026年築',
    structuredData: { '@type': 'RealEstateListing' },
  }
  scene.presentation.ai = {
    faqItems: [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3' },
      { question: 'Q4', answer: 'A4' },
      { question: 'Q5', answer: 'A5' },
    ],
  }

  // cta 10点
  scene.presentation.ctaConfig = {
    primaryCTA:   { label: '内見予約する', url: 'https://example.com/contact' },
    secondaryCTA: { label: '詳細を見る',   url: 'https://example.com/detail' },
    lineEnabled:   true,
    priceDisplay:  true,
  }

  return scene
}

// ─────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────

describe('ScoreEngine', () => {
  it('全項目最高評価のシーンで 100点（performance は 8点固定）', () => {
    const result = ScoreEngine.compute(makeMaxScene())
    // performance は本番実測前のデフォルト 8点
    expect(result.total).toBe(98)
    expect(result.breakdown.structure).toBe(20)
    expect(result.breakdown.compliance).toBe(20)
    expect(result.breakdown.assets).toBe(15)
    expect(result.breakdown.emotionDesign).toBe(15)
    expect(result.breakdown.aiContent).toBe(10)
    expect(result.breakdown.performance).toBe(8)
    expect(result.breakdown.cta).toBe(10)
  })

  it('structure: rooms が空のとき structure ≤ 5点になる', () => {
    const scene = makeMaxScene()
    scene.property.structure = {
      rooms:      [],
      walls:      [],
      openings:   [],
      northAngle: 0,
    }
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.structure).toBeLessThanOrEqual(5)
    // issues に structure のエントリが含まれる
    expect(result.issues.some(i => i.area === 'structure')).toBe(true)
  })

  it('structure: northAngle 未設定で -5点になる', () => {
    const scene = makeMaxScene()
    const s = scene.property.structure!
    // @ts-expect-error: undefined をテストで設定
    scene.property.structure = { ...s, northAngle: undefined }
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.structure).toBe(15)  // 20 - 5
    expect(result.issues.some(i => i.msg.includes('方位'))).toBe(true)
  })

  it('structure: openings が rooms 未満のとき -5点になる', () => {
    const scene = makeMaxScene()
    scene.property.structure!.openings = []  // openings を空に
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.structure).toBe(15)  // 10(rooms)+5(north) = 15
  })

  it('compliance: address なしで compliance が減点される', () => {
    const scene = makeMaxScene()
    scene.compliance.items.addressDisplayed = false
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.compliance).toBe(15)  // 20 - 5
  })

  it('assets: bim_ifc で 15点', () => {
    const scene = makeMaxScene()
    scene.property.structureSource = 'bim_ifc'
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.assets).toBe(15)
  })

  it('assets: floorplan_claude_vision + accuracy=0.90 で 12点', () => {
    const scene = makeMaxScene()
    scene.property.structureSource   = 'floorplan_claude_vision'
    scene.property.structureAccuracy = 0.90
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.assets).toBe(12)
  })

  it('assets: floorplan_claude_vision + accuracy=0.70 で 10点', () => {
    const scene = makeMaxScene()
    scene.property.structureSource   = 'floorplan_claude_vision'
    scene.property.structureAccuracy = 0.70
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.assets).toBe(10)
  })

  it('assets: floorplan_claude_vision + accuracy=0.50 で 7点', () => {
    const scene = makeMaxScene()
    scene.property.structureSource   = 'floorplan_claude_vision'
    scene.property.structureAccuracy = 0.50
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.assets).toBe(7)
  })

  it('assets: procedural で 4点 + issue + autoFix なし（autoFix は assets ではなく aiContent）', () => {
    const scene = makeMaxScene()
    scene.property.structureSource   = 'procedural'
    scene.property.structureAccuracy = 0.0
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.assets).toBe(4)
    expect(result.issues.some(i => i.area === 'assets')).toBe(true)
  })

  it('aiContent: FAQ 5件未満で autoFix に generate_faq が入る', () => {
    const scene = makeMaxScene()
    scene.presentation.ai.faqItems = [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
    ]
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.aiContent).toBe(7)  // title+desc+structured = 7, FAQ=0
    expect(result.autoFix.some(f => f.action === 'generate_faq')).toBe(true)
  })

  it('cta: LINE 無効のとき cta が 7点になる', () => {
    const scene = makeMaxScene()
    scene.presentation.ctaConfig.lineEnabled = false
    const result = ScoreEngine.compute(scene)
    expect(result.breakdown.cta).toBe(7)
    expect(result.issues.some(i => i.area === 'cta' && i.msg.includes('LINE'))).toBe(true)
  })

  it('issues は score 降順でソートされる', () => {
    // structure を空にして最大 issues を発生させる
    const scene = createDefaultScene()
    scene.property.structure = { rooms: [], walls: [], openings: [], northAngle: 0 }
    const result = ScoreEngine.compute(scene)
    for (let i = 1; i < result.issues.length; i++) {
      expect(result.issues[i - 1]!.score).toBeGreaterThanOrEqual(result.issues[i]!.score)
    }
  })

  it('toGrade: 95点以上は S', () => {
    expect(ScoreEngine.toGrade(98)).toBe('S')
    expect(ScoreEngine.toGrade(95)).toBe('S')
  })

  it('toGrade: 80〜94点は A', () => {
    expect(ScoreEngine.toGrade(80)).toBe('A')
    expect(ScoreEngine.toGrade(94)).toBe('A')
  })

  it('toGrade: 50点未満は D', () => {
    expect(ScoreEngine.toGrade(49)).toBe('D')
    expect(ScoreEngine.toGrade(0)).toBe('D')
  })

  it('maxScores の合計は 100 になる', () => {
    const max = ScoreEngine.maxScores()
    const total = Object.values(max).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
  })
})
