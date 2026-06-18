/**
 * SisliR v10.1 — SceneAdapter
 * packages/shared/src/lib/SceneAdapter.ts
 *
 * 設計根拠: Part E.2.3（バージョン別読み込みアダプター）
 * ADR-092: Scene JSON 後方互換ポリシー
 * ADR-160: 'floorplan_vlm' → 'floorplan_claude_vision' 自動変換
 */

import { SceneSchema, type SceneConfig } from '../schemas/scene'

export type MigrationResult =
  | { ok: true;  scene: SceneConfig; migratedFrom?: string }
  | { ok: false; error: string; raw: unknown }

/**
 * SceneAdapter
 *
 * DB から取得した任意バージョンの scene_json を
 * v10.0.0 の SceneConfig に変換する。
 *
 * @example
 * const result = SceneAdapter.migrate(row.scene_json)
 * if (!result.ok) throw new Error(result.error)
 * const scene: SceneConfig = result.scene
 */
export const SceneAdapter = {
  migrate(raw: unknown): MigrationResult {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'scene_json が null または非オブジェクト', raw }
    }

    const obj = raw as Record<string, unknown>
    const version = obj['version'] as string | undefined

    // すでに v10.0.0 → Zod バリデーションのみ
    if (version === '10.0.0') {
      return validateFinal(obj)
    }

    // v9.x → v10.0.0
    if (version?.startsWith('9.')) {
      const migrated = migrateFromV9(obj)
      return validateFinal(migrated, version)
    }

    // v8.x → v9.x → v10.0.0
    if (version?.startsWith('8.')) {
      const v9 = migrateFromV8(obj)
      const migrated = migrateFromV9(v9)
      return validateFinal(migrated, version)
    }

    // バージョン不明でも構造が近い場合は変換を試みる
    const migrated = migrateFromV9(obj)
    return validateFinal(migrated, version ?? 'unknown')
  },
}

// ─────────────────────────────────────────────────────
// バージョン別マイグレーション
// ─────────────────────────────────────────────────────

/** v8.x → v9.x（プレゼンテーション構造の分離）*/
function migrateFromV8(obj: Record<string, unknown>): Record<string, unknown> {
  // v8 では presentation が存在しない場合がある
  const presentation = obj['presentation'] as Record<string, unknown> | undefined
  return {
    ...obj,
    version: '9.0.0',
    presentation: presentation ?? {
      lpTemplate:  {},
      postFX:      { preset: 'none', intensity: 1.0 },
      sections:    [],
      ctaConfig:   { lineEnabled: false, priceDisplay: false },
      ai:          { faqItems: [] },
      seo:         {},
    },
  }
}

/** v9.x → v10.0.0 */
function migrateFromV9(obj: Record<string, unknown>): Record<string, unknown> {
  const property = (obj['property'] ?? {}) as Record<string, unknown>

  // ADR-160: 廃止済み 'floorplan_vlm' → 'floorplan_claude_vision' に自動変換
  let structureSource = property['structureSource'] as string | undefined
  if (structureSource === 'floorplan_vlm') {
    structureSource = 'floorplan_claude_vision'
    console.warn(
      `[SceneAdapter] structureSource='floorplan_vlm' を 'floorplan_claude_vision' に変換しました（ADR-160）`,
    )
  }
  // デフォルト
  if (!structureSource) structureSource = 'procedural'

  // structureAccuracy デフォルト
  const structureAccuracy =
    typeof property['structureAccuracy'] === 'number'
      ? property['structureAccuracy']
      : 0.0

  // presentation のデフォルト埋め
  const presentation = (obj['presentation'] ?? {}) as Record<string, unknown>
  const postFX = (presentation['postFX'] ?? {}) as Record<string, unknown>
  const ai     = (presentation['ai'] ?? {}) as Record<string, unknown>
  const cta    = (presentation['ctaConfig'] ?? {}) as Record<string, unknown>

  // compliance のデフォルト
  const now = new Date().toISOString()
  const compliance = (obj['compliance'] ?? {
    checkedAt: now,
    overall: 'warning',
    items: {
      addressDisplayed: false,
      areaDisplayed: false,
      layoutDisplayed: false,
      priceDisplayed: false,
      aiImageLabeled: true,
      proceduralDisclaimer: false,
      accuracyDisclaimer: false,
      northAngleSet: false,
      structureSourceSet: true,
    },
  }) as Record<string, unknown>

  return {
    ...obj,
    version: '10.0.0',
    property: {
      ...property,
      structureSource,
      structureAccuracy,
    },
    presentation: {
      lpTemplate: presentation['lpTemplate'] ?? { postfxPreset: 'none' },
      postFX: {
        preset:    postFX['preset'] ?? 'none',
        intensity: postFX['intensity'] ?? 1.0,
      },
      sections:  presentation['sections']  ?? [],
      ctaConfig: {
        lineEnabled:  cta['lineEnabled']  ?? false,
        priceDisplay: cta['priceDisplay'] ?? false,
        ...cta,
      },
      ai: {
        faqItems: ai['faqItems'] ?? [],
      },
      seo: presentation['seo'] ?? {},
    },
    compliance,
  }
}

// ─────────────────────────────────────────────────────
// 最終 Zod バリデーション
// ─────────────────────────────────────────────────────

function validateFinal(
  obj: Record<string, unknown>,
  migratedFrom?: string,
): MigrationResult {
  const result = SceneSchema.safeParse(obj)
  if (result.success) {
    return { ok: true, scene: result.data, migratedFrom }
  }
  return {
    ok:    false,
    error: `SceneSchema バリデーション失敗: ${result.error.message}`,
    raw:   obj,
  }
}
