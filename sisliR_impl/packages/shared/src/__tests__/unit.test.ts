/**
 * SisliR v10.1 — Unit Tests
 * packages/shared/src/__tests__/
 *
 * 実行: npx vitest run
 * ADR-100: テストデータファクトリー必須
 */

import { describe, it, expect } from 'vitest'
import { SceneSchema, createDefaultScene } from '../schemas/scene'
import { ComplianceChecker } from '../lib/ComplianceChecker'
import { SceneAdapter } from '../lib/SceneAdapter'
// ScoreEngine は editor-engine パッケージからインポート
// import { ScoreEngine } from '../../editor-engine/src/ScoreEngine'

// ─────────────────────────────────────────────────────
// SceneSchema Tests
// ─────────────────────────────────────────────────────

describe('SceneSchema', () => {
  it('v10.0.0 の正常パースが成功する', () => {
    const scene = createDefaultScene()
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(true)
  })

  it('version が 10.0.0 以外のとき失敗する', () => {
    const scene = { ...createDefaultScene(), version: '9.0.0' }
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(false)
  })

  it('address が空文字のとき失敗する', () => {
    const scene = createDefaultScene()
    scene.property.address = ''
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(false)
  })

  it("structureSource='floorplan_vlm' は廃止済みのため失敗する（ADR-144）", () => {
    const scene = createDefaultScene()
    // @ts-expect-error: テスト用に廃止済み値を設定
    scene.property.structureSource = 'floorplan_vlm'
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(false)
  })

  it('structureAccuracy が 0〜1 の範囲外のとき失敗する', () => {
    const scene = createDefaultScene()
    scene.property.structureAccuracy = 1.1
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(false)
  })

  it('structureAccuracy が 0.0 のとき成功する（境界値）', () => {
    const scene = createDefaultScene()
    scene.property.structureAccuracy = 0.0
    expect(SceneSchema.safeParse(scene).success).toBe(true)
  })

  it('structureAccuracy が 1.0 のとき成功する（境界値）', () => {
    const scene = createDefaultScene()
    scene.property.structureAccuracy = 1.0
    expect(SceneSchema.safeParse(scene).success).toBe(true)
  })

  it('デフォルトの postFX.preset が none になる', () => {
    const scene = createDefaultScene()
    expect(scene.presentation.postFX.preset).toBe('none')
  })

  it('compliance.overall がデフォルトで warning になる', () => {
    const scene = createDefaultScene()
    // デフォルトシーンは proceduralDisclaimer / accuracyDisclaimer / northAngleSet が false
    expect(scene.compliance.overall).toBe('warning')
  })
})

// ─────────────────────────────────────────────────────
// ComplianceChecker Tests
// ─────────────────────────────────────────────────────

describe('ComplianceChecker', () => {
  function makeFullScene() {
    const scene = createDefaultScene()
    scene.property.address           = '東京都渋谷区渋谷1-1-1'
    scene.property.buildingArea      = 75.0
    scene.property.layoutDescription = '3LDK'
    scene.presentation.ctaConfig.priceDisplay = true
    scene.presentation.sections = [
      {
        id: 's1',
        content: 'テストセクション',
        isAiGenerated: false,
        aiLabel: undefined,
        hasProceduralDisclaimer: true,
        hasAccuracyDisclaimer:   true,
      },
    ]
    scene.property.structure = {
      rooms:    [],
      walls:    [],
      openings: [],
      northAngle: 0,
    }
    scene.property.structureSource   = 'floorplan_claude_vision'
    scene.property.structureAccuracy = 0.9
    return scene
  }

  it('全必須項目OK のとき overall: pass になる', () => {
    const scene  = makeFullScene()
    const status = ComplianceChecker.check(scene)
    expect(status.overall).toBe('pass')
    expect(status.items.addressDisplayed).toBe(true)
    expect(status.items.areaDisplayed).toBe(true)
    expect(status.items.layoutDisplayed).toBe(true)
  })

  it('address が空のとき overall: fail になる', () => {
    const scene = makeFullScene()
    scene.property.address = ''
    // Zod が通らないが、ComplianceChecker は独立して動作することを確認
    const sceneAny = scene as any
    sceneAny.property.address = ''
    const status = ComplianceChecker.check(sceneAny)
    expect(status.overall).toBe('fail')
    expect(status.items.addressDisplayed).toBe(false)
  })

  it('buildingArea/landArea 両方 undefined のとき overall: fail になる', () => {
    const scene = makeFullScene()
    scene.property.buildingArea = undefined
    scene.property.landArea     = undefined
    const status = ComplianceChecker.check(scene)
    expect(status.overall).toBe('fail')
    expect(status.items.areaDisplayed).toBe(false)
  })

  it('AI画像ラベルなし（isAiGenerated=true で aiLabel なし）→ overall: warning になる', () => {
    const scene = makeFullScene()
    scene.presentation.sections = [
      {
        id:                      's1',
        content:                 'AI生成コピー',
        isAiGenerated:           true,
        aiLabel:                 undefined,  // ← ラベルなし
        hasProceduralDisclaimer: true,
        hasAccuracyDisclaimer:   true,
      },
    ]
    const status = ComplianceChecker.check(scene)
    expect(status.items.aiImageLabeled).toBe(false)
    // 必須項目は全てOKなので fail ではなく warning
    expect(status.overall).toBe('warning')
  })

  it('structureSource=procedural で proceduralDisclaimer なし → overall: warning になる', () => {
    const scene = makeFullScene()
    scene.property.structureSource = 'procedural'
    scene.presentation.sections = [
      {
        id:                      's1',
        content:                 'コンテンツ',
        isAiGenerated:           false,
        hasProceduralDisclaimer: false, // ← 免責文なし
        hasAccuracyDisclaimer:   true,
      },
    ]
    const status = ComplianceChecker.check(scene)
    expect(status.items.proceduralDisclaimer).toBe(false)
    expect(status.overall).toBe('warning')
  })

  it('northAngleSet は structure.northAngle が設定されたとき true になる', () => {
    const scene = makeFullScene()
    // northAngle は makeFullScene で 0 を設定済み
    const status = ComplianceChecker.check(scene)
    expect(status.items.northAngleSet).toBe(true)
  })

  it('sections が空配列のとき aiImageLabeled は true（対象なし）になる', () => {
    const scene = makeFullScene()
    scene.presentation.sections = []
    const status = ComplianceChecker.check(scene)
    expect(status.items.aiImageLabeled).toBe(true)
  })

  it('getDisclaimerText: procedural の免責文が正しい', () => {
    const scene = makeFullScene()
    scene.property.structureSource = 'procedural'
    const text = ComplianceChecker.getDisclaimerText(scene)
    expect(text).toContain('イメージCG')
  })

  it('getDisclaimerText: floorplan_claude_vision の免責文に精度% が含まれる', () => {
    const scene = makeFullScene()
    scene.property.structureSource   = 'floorplan_claude_vision'
    scene.property.structureAccuracy = 0.82
    const text = ComplianceChecker.getDisclaimerText(scene)
    expect(text).toContain('82%')
    expect(text).toContain('Claude Vision')
  })

  it('getDisclaimerText: bim_ifc の免責文が正しい', () => {
    const scene = makeFullScene()
    scene.property.structureSource = 'bim_ifc'
    const text = ComplianceChecker.getDisclaimerText(scene)
    expect(text).toContain('BIM')
  })
})

// ─────────────────────────────────────────────────────
// SceneAdapter Tests
// ─────────────────────────────────────────────────────

describe('SceneAdapter', () => {
  it('v10.0.0 のデータはそのまま成功する', () => {
    const scene = createDefaultScene()
    const result = SceneAdapter.migrate(scene)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.scene.version).toBe('10.0.0')
      expect(result.migratedFrom).toBeUndefined()
    }
  })

  it("structureSource='floorplan_vlm' が 'floorplan_claude_vision' に変換される（ADR-160）", () => {
    const scene = createDefaultScene() as any
    scene.property.structureSource = 'floorplan_vlm'
    scene.version = '9.0.0'  // v9として渡す
    const result = SceneAdapter.migrate(scene)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.scene.property.structureSource).toBe('floorplan_claude_vision')
      expect(result.migratedFrom).toBe('9.0.0')
    }
  })

  it('v9.0.0 → v10.0.0 に変換成功する', () => {
    const v9Scene = {
      version:    '9.0.0',
      sceneId:    crypto.randomUUID(),
      propertyId: crypto.randomUUID(),
      agencyId:   crypto.randomUUID(),
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
      property: {
        propertyType:      'mansion',
        address:           '東京都港区',
        structureSource:   'procedural',
        structureAccuracy: 0.0,
      },
      presentation: {
        lpTemplate: {},
        sections:   [],
        ai: {},
        seo: {},
      },
    }
    const result = SceneAdapter.migrate(v9Scene)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.scene.version).toBe('10.0.0')
      expect(result.scene.presentation.postFX.preset).toBe('none')
      expect(result.scene.presentation.ai.faqItems).toEqual([])
    }
  })

  it('v8.0.0 → v10.0.0 に変換成功する', () => {
    const v8Scene = {
      version:    '8.0.0',
      sceneId:    crypto.randomUUID(),
      propertyId: crypto.randomUUID(),
      agencyId:   crypto.randomUUID(),
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
      property: {
        propertyType:      'house',
        address:           '大阪府大阪市',
        structureSource:   'manual_input',
        structureAccuracy: 0.5,
      },
      // v8 では presentation なし
    }
    const result = SceneAdapter.migrate(v8Scene)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.scene.version).toBe('10.0.0')
      expect(result.migratedFrom).toBe('8.0.0')
    }
  })

  it('null を渡すと ok: false を返す', () => {
    const result = SceneAdapter.migrate(null)
    expect(result.ok).toBe(false)
  })

  it('スキーマを大きく逸脱したオブジェクトは ok: false を返す', () => {
    const result = SceneAdapter.migrate({ broken: true })
    expect(result.ok).toBe(false)
  })
})
