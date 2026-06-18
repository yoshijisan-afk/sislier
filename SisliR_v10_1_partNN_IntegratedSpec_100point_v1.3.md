# Part NN — SisliR 統合設計書 v1.3
## 診断レポート + 世界トップ100点への再設計

> **バージョン**: v1.3 (2026-06-13)
> **位置づけ**: Part KK・LL・MMの問題点を診断し、動作可能な統合設計に再構築する
> **方針**: 「動かない設計書」から「実装できる設計書」へ
> **v1.1差分**: structureSource enumをPart OO（ADR-144）に合わせて更新（'floorplan_vlm' → 'floorplan_claude_vision'）。
> 関連する精度値・免責文・ScoreEngineロジック・整合性マトリクスを全面的に修正。
> **v1.2差分（2026-06-13）**: Part MM v5.2のADR-162.1（WebGPURenderer標準・WebGL2自動
> フォールバック、フェーズ0から両対応）を反映。NN.9フェーズ0・フェーズ1の
> 「Three.js WebGL（WebGPUは後）」「Three.js WebGL」という記述を
> 「Three.js（WebGPURenderer標準・WebGL2自動フォールバック）」に修正し、
> フェーズ3「優先14: WebGPU Renderer への移行」は、レンダラーがフェーズ0から
> 両対応であるため不要となり、「WebGPU前提の感動演出（Gaussian Splat等）の
> 追加実装」に意味を改めた。

---

## NN.0 正直な現状診断

### NN.0.1 v4.0エディタの実態

```
sislir_lp_editor_v4_100point.html の実装内容:

  canvas要素: Canvas 2D API のみ（パーティクル70個 + グリッド + 線）
              ↑ Three.js / WebGPU は一切使用していない

  全ボタンの動作: sendPrompt() でClaudeに質問するだけ
                ↑ 実際のシーン操作: ゼロ

  タイムライン再生: setInterval で数値カウントアップ + left%移動
                  ↑ GSAPアニメーション制御: なし

  品質スコア100点: HTML内ハードコード
                ↑ 動的計算: なし

  結論: 「UIモック」であり「動作するエディタ」ではない
```

### NN.0.2 設計書（KK・LL・MM）の実態

```
Part KK・LL・MMのコードブロックは「設計上のTypeScript」であり
実際のファイルシステム上に存在しない。

問題点:
  1. FloorplanVLM→ProceduralMesh: パイプライン定義のみ、実装なし
  2. Scene JSONスキーマ: 定義あり、Zodファイルなし
  3. PropertyTypeSchema: 'mansion'不整合（KK vs 完全設計書）
  4. エディタ↔LPランタイムの実データ連携: 未定義
  5. 建物構造（壁・窓・部屋）の不変性保証: なし
  6. 宅建業法コンプライアンスの自動検証: なし
```

### NN.0.3 「不動産広告の構造固定」問題

不動産広告において**最も重要な制約**が設計書全体を通じて欠落している:

```
宅建業法・不動産の表示に関する公正競争規約 第3条の要件:

  ❌ 未対応: 建物形状・窓位置・部屋配置が編集中に変更できてしまう
  ❌ 未対応: 実際の物件と3D表示に差異が生じる可能性
  ❌ 未対応: AI生成/プロシージャル生成の旨の表示義務
  ❌ 未対応: 方位・採光シミュレーションの計算根拠の開示
  ❌ 未対応: 「実際と異なる場合があります」の表示位置・サイズ規制
```

---

## NN.1 再設計の3原則

```
原則1: 動作する最小単位から設計する
  → 「全部できる」設計書より「これは動く」設計書

原則2: 不動産広告の法的制約を設計の中心に置く
  → 建物構造は「SSOT（Scene JSON）から不変」
  → AIプロシージャル生成は「補助」、実データが「主」

原則3: エディタ ↔ LPランタイム ↔ システムバックエンドを
  Scene JSON という単一の事実源で繋ぐ
```

---

## NN.2 Scene JSON: 設計の中心

### NN.2.1 不変フィールドと可変フィールドの分離

```typescript
// packages/shared/schemas/scene.ts（完全版・実装可能）

import { z } from 'zod'

// ──────────────────────────────────────────────────
// IMMUTABLE: 不動産広告として変更不可フィールド
// エディタUIでは表示のみ（グレーアウト・ロックアイコン）
// ──────────────────────────────────────────────────
export const ImmutablePropertySchema = z.object({
  // 法的記載事項（宅建業法 第35条）
  propertyType:    PropertyTypeSchema,
  address:         z.string(),          // 所在地（変更不可）
  landArea:        z.number().optional(),
  buildingArea:    z.number().optional(),
  totalFloors:     z.number().optional(),
  builtYear:       z.number().optional(),
  layoutDescription: z.string().optional(), // 「3LDK」等

  // 建物構造（変更不可）
  structure: z.object({
    rooms: z.array(RoomSchema),    // 部屋リスト（位置・サイズ固定）
    walls: z.array(WallSchema),    // 壁（位置固定）
    openings: z.array(OpeningSchema), // 窓・扉（位置固定）
    northAngle: z.number(),        // 北方向角度（日照計算の基準）
  }).optional(),

  // 生成メタデータ（宅建業法コンプライアンス）
  // ADR-144対応: FloorplanVLMは商用ライセンス不可のため廃止。
  // Claude Vision単独パイプラインへ完全移行（Part OO.6参照）
  structureSource: z.enum([
    'floorplan_claude_vision', // ★ Claude Vision解析（実測 75〜85% IoU）
    'bim_ifc',          // BIM/IFCから生成（精度0.95+）
    'manual_input',     // 手動入力
    'procedural',       // AI自動生成（※LP表示時に免責文必須）
    // 'floorplan_vlm'  // 廃止（ADR-144）。旧データのマイグレーション対象
  ]),
  structureAccuracy: z.number().min(0).max(1), // 精度スコア
})

// ──────────────────────────────────────────────────
// MUTABLE: エディタで自由に編集できるフィールド
// ──────────────────────────────────────────────────
export const MutablePresentationSchema = z.object({
  // 演出・照明（変更可）
  lpTemplate: LpTemplateConfigSchema,
  postFX:     PostFXConfigSchema,

  // コピーテキスト（変更可）
  sections: z.array(SectionCopySchema),

  // CTA設定（変更可）
  ctaConfig: CTAConfigSchema,

  // AI設定（変更可）
  ai: AIConfigSchema,

  // SEO（変更可）
  seo: SEOConfigSchema,
})

// 最終的なScene JSONはImmutable + Mutableの結合
export const SceneSchema = z.object({
  version:     z.literal('10.0.0'),
  sceneId:     z.string().uuid(),
  propertyId:  z.string().uuid(),
  agencyId:    z.string().uuid(),
  createdAt:   z.string().datetime(),
  updatedAt:   z.string().datetime(),

  property:    ImmutablePropertySchema,
  presentation: MutablePresentationSchema,

  // 宅建業法コンプライアンス（自動検証）
  compliance: ComplianceStatusSchema,
})

export type SceneConfig = z.infer<typeof SceneSchema>
```

### NN.2.2 RoomSchema（建物構造の不変定義）

```typescript
// 部屋スキーマ（Claude Vision / BIM・IFC / 手動入力など、各構造解析パイプラインの出力と整合）
export const RoomSchema = z.object({
  id:       z.string(),
  type:     z.enum(['ldk', 'bedroom', 'bathroom', 'toilet',
                    'entrance', 'closet', 'balcony', 'garage',
                    'study', 'japanese_room', 'storage']),
  // 座標: メートル単位、建物原点からの相対座標
  x:        z.number(),   // 左下角のX
  y:        z.number(),   // 左下角のY（フロア内）
  width:    z.number(),   // 幅（m）
  depth:    z.number(),   // 奥行き（m）
  height:   z.number(),   // 天井高（m）
  floor:    z.number(),   // 階数（1=1F, 2=2F）
  area:     z.number(),   // 面積（㎡、構造解析パイプラインが計算）
  label:    z.string().optional(),  // 「LDK 20.5畳」等
})

export const WallSchema = z.object({
  id:        z.string(),
  x1: z.number(), y1: z.number(),  // 始点
  x2: z.number(), y2: z.number(),  // 終点
  thickness: z.number().default(0.12),  // 壁厚（m）
  floor:     z.number(),
  isExternal: z.boolean(),  // 外壁か
})

export const OpeningSchema = z.object({
  id:       z.string(),
  type:     z.enum(['door', 'window', 'sliding_door', 'french_window']),
  wallId:   z.string(),     // 所属する壁
  position: z.number(),     // 壁上の位置（0〜1）
  width:    z.number(),     // 開口幅（m）
  // 窓の場合
  sillHeight:  z.number().optional(),   // 窓台高さ（m）
  headHeight:  z.number().optional(),   // まぐさ高さ（m）
})
```

### NN.2.3 ComplianceStatusSchema（宅建業法自動検証）

```typescript
export const ComplianceStatusSchema = z.object({
  checkedAt:  z.string().datetime(),
  overall:    z.enum(['pass', 'warning', 'fail']),

  items: z.object({
    // 宅建業法 第35条 重要事項説明
    addressDisplayed:     z.boolean(),
    areaDisplayed:        z.boolean(),
    layoutDisplayed:      z.boolean(),
    priceDisplayed:       z.boolean(),

    // 景品表示法 / 公正競争規約
    aiImageLabeled:       z.boolean(),  // AI生成画像にラベル付与
    proceduralDisclaimer: z.boolean(),  // プロシージャル旨の表示
    accuracyDisclaimer:   z.boolean(),  // 実際と異なる場合の表示

    // 独自追加
    northAngleSet:        z.boolean(),  // 方位設定済み
    structureSourceSet:   z.boolean(),  // 構造データ出所明記
  }),
})
```

---

## NN.3 ProceduralMeshBuilder（実装可能な建物生成）

### NN.3.1 設計の核心問題

従来の設計書（KK・LL）では `buildHouseNewProcedural()` が「なんとなく家を作る」関数として定義されていた。
**実際の不動産広告では、その家の構造（壁・窓・部屋の位置）は変えてはいけない。**

正しい設計:

```
Claude Vision / BIM / 手動入力（ADR-144: FloorplanVLM廃止）
  ↓
RoomSchema[] + WallSchema[] + OpeningSchema[]
（≡ Scene JSON の property.structure）
  ↓
ProceduralMeshBuilder.build(structure)
  ↓
Three.js Mesh（構造は完全にScene JSONに従う）
  ↓
SPZ4変換 or GLBとして保存
（以降は構造変更不可）
```

### NN.3.2 ProceduralMeshBuilder 実装仕様

```typescript
// apps/runtime/lib/ProceduralMeshBuilder.ts

import * as THREE from 'three'
import type { RoomSchema, WallSchema, OpeningSchema } from '@shared/schemas/scene'

export class ProceduralMeshBuilder {
  private scene:    THREE.Scene
  private materials: MaterialLibrary

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.materials = new MaterialLibrary()
  }

  // ── メインエントリポイント ──
  build(structure: PropertyStructure): BuildResult {
    const group = new THREE.Group()
    group.name = 'property_structure'

    // 1. 床スラブ
    for (const room of structure.rooms) {
      group.add(this.buildFloorSlab(room))
    }

    // 2. 壁（外壁→内壁の順）
    const externalWalls = structure.walls.filter(w => w.isExternal)
    const internalWalls = structure.walls.filter(w => !w.isExternal)
    for (const wall of [...externalWalls, ...internalWalls]) {
      const wallMesh = this.buildWall(wall, structure.openings)
      group.add(wallMesh)
    }

    // 3. 開口部（窓・扉）
    for (const opening of structure.openings) {
      group.add(this.buildOpening(opening, structure.walls))
    }

    // 4. 天井
    for (const room of structure.rooms) {
      group.add(this.buildCeiling(room))
    }

    this.scene.add(group)
    return { group, rooms: structure.rooms.length, openings: structure.openings.length }
  }

  // ── 床スラブ ──
  private buildFloorSlab(room: RoomDef): THREE.Mesh {
    const geo = new THREE.BoxGeometry(room.width, 0.15, room.depth)
    const mat = this.materials.get('floor', room.type)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(
      room.x + room.width / 2,
      (room.floor - 1) * 3.0 - 0.075,  // 1F=0m, 2F=3m
      room.y + room.depth / 2,
    )
    mesh.name = `floor_${room.id}`
    mesh.userData = { roomId: room.id, immutable: true }
    return mesh
  }

  // ── 壁（開口部をくり抜く） ──
  private buildWall(wall: WallDef, openings: OpeningDef[]): THREE.Group {
    const group = new THREE.Group()
    group.name = `wall_${wall.id}`
    group.userData = { wallId: wall.id, immutable: true }

    const wallLen = Math.sqrt(
      Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.y2 - wall.y1, 2)
    )
    const floorY = (wall.floor - 1) * 3.0
    const ceilingH = 2.4  // デフォルト天井高

    // この壁に属する開口部
    const wallOpenings = openings.filter(o => o.wallId === wall.id)

    if (wallOpenings.length === 0) {
      // 開口なし: シンプルなBox
      const geo = new THREE.BoxGeometry(wallLen, ceilingH, wall.thickness)
      const mat = this.materials.get('wall', wall.isExternal ? 'external' : 'internal')
      const mesh = new THREE.Mesh(geo, mat)
      group.add(mesh)
    } else {
      // 開口あり: Shape + ExtrudeGeometry でくり抜き
      const shape = this.buildWallShape(wallLen, ceilingH, wallOpenings)
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: wall.thickness,
        bevelEnabled: false,
      })
      const mat = this.materials.get('wall', wall.isExternal ? 'external' : 'internal')
      group.add(new THREE.Mesh(geo, mat))
    }

    // 壁の向きに回転・配置
    const angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1)
    group.rotation.y = -angle
    group.position.set(
      (wall.x1 + wall.x2) / 2,
      floorY + ceilingH / 2,
      (wall.y1 + wall.y2) / 2,
    )

    return group
  }

  // ── 壁形状（開口部をくり抜いたShape） ──
  private buildWallShape(
    wallLen: number,
    ceilingH: number,
    openings: OpeningDef[]
  ): THREE.Shape {
    // 壁の外形
    const shape = new THREE.Shape()
    shape.moveTo(-wallLen / 2, 0)
    shape.lineTo( wallLen / 2, 0)
    shape.lineTo( wallLen / 2, ceilingH)
    shape.lineTo(-wallLen / 2, ceilingH)
    shape.closePath()

    // 開口部をホールとして引く
    for (const opening of openings) {
      const ox = (opening.position - 0.5) * wallLen
      const sill = opening.sillHeight ?? 0
      const head = opening.headHeight ?? (opening.type === 'door' ? 2.1 : sill + 1.2)

      const hole = new THREE.Path()
      hole.moveTo(ox - opening.width / 2, sill)
      hole.lineTo(ox + opening.width / 2, sill)
      hole.lineTo(ox + opening.width / 2, head)
      hole.lineTo(ox - opening.width / 2, head)
      hole.closePath()
      shape.holes.push(hole)
    }

    return shape
  }

  // ── 開口部（窓・扉のフレーム） ──
  private buildOpening(opening: OpeningDef, walls: WallDef[]): THREE.Group {
    const group = new THREE.Group()
    group.name = `opening_${opening.id}`
    group.userData = { openingId: opening.id, immutable: true }

    if (opening.type === 'window' || opening.type === 'french_window') {
      // 窓ガラス
      const glassGeo = new THREE.PlaneGeometry(
        opening.width - 0.04,
        (opening.headHeight ?? 1.2) - (opening.sillHeight ?? 0.8) - 0.04
      )
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.25,
        roughness: 0.0,
        metalness: 0.0,
        transmission: 0.8,  // WebGPU TSLシェーダー対応
      })
      group.add(new THREE.Mesh(glassGeo, glassMat))

      // 窓枠
      group.add(this.buildWindowFrame(opening))
    }

    // 位置は親の壁グループが決定する（wallId参照）
    return group
  }

  // ── 天井 ──
  private buildCeiling(room: RoomDef): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(room.width, room.depth)
    const mat = this.materials.get('ceiling', 'default')
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(
      room.x + room.width / 2,
      (room.floor - 1) * 3.0 + (room.height ?? 2.4),
      room.y + room.depth / 2,
    )
    mesh.name = `ceiling_${room.id}`
    mesh.userData = { roomId: room.id, immutable: true }
    return mesh
  }

  private buildWindowFrame(opening: OpeningDef): THREE.LineSegments {
    // 窓枠（Linee Segments）
    const sill = opening.sillHeight ?? 0.8
    const head = opening.headHeight ?? 2.0
    const hw = opening.width / 2
    const pts = [
      -hw, sill, 0,   hw, sill, 0,
       hw, sill, 0,   hw, head, 0,
       hw, head, 0,  -hw, head, 0,
      -hw, head, 0,  -hw, sill, 0,
    ]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1.5 }))
  }
}
```

### NN.3.3 構造の不変性保証

```typescript
// エディタ側の保護機構

// 1. userData.immutable = true のMeshはTransformControlsで操作不可
transformControls.addEventListener('mouseDown', (e) => {
  const obj = transformControls.object
  if (obj?.userData?.immutable) {
    transformControls.detach()
    showToast('⚠️ 建物構造は不動産広告の要件により変更できません', 'warn')
    return false
  }
})

// 2. Scene JSONのproperty.structureフィールドはエディタUIからは読み取り専用
// Zustand storeの dispatch で property.structure への書き込みをブロック
const protectedPaths = ['property.structure', 'property.address', 'property.landArea']
function guardedUpdate(path: string, value: unknown) {
  if (protectedPaths.some(p => path.startsWith(p))) {
    console.error(`[Editor] Immutable field: ${path}`)
    return
  }
  store.update(path, value)
}

// 3. エクスポート前にImmutableフィールドが変更されていないかZodで検証
function validateImmutability(original: SceneConfig, current: SceneConfig): boolean {
  const origStructure = JSON.stringify(original.property.structure)
  const currStructure = JSON.stringify(current.property.structure)
  return origStructure === currStructure
}
```

---

## NN.4 システム↔エディタ↔LP の完全な連携フロー

### NN.4.1 データフロー全体図

```
【入力層】
  不動産会社が入稿:
  ・間取り図（PDF/PNG/JPG）
  ・写真（JPG/HEIC）
  ・BIM/IFC（あれば）
  ・物件スペック（手動入力）
         ↓
【変換層 — バックエンド（pg-boss ジョブ）】
  Job: extract_floor_plan
    → Claude Vision（FloorplanAnalyzer。ADR-144でFloorplanVLMから移行済み）
    → RoomSchema[] + WallSchema[] + OpeningSchema[]
    → property.structure として Scene JSON に保存（IMMUTABLE化）

  Job: generate_splat
    → 写真 → Gaussian Splat → SPZ4
    → assets.splatUrl に保存

  Job: generate_lp
    → Scene JSON + SPZ4/GLB/Procedural
    → LPページ生成（Next.js ISR）
         ↓
【Scene JSON（Supabase PostgreSQL・scenes テーブル）】
  scene_json: JSONB — 唯一の事実源
         ↓
【エディタ（apps/web/app/editor）】
  読み込み: GET /api/scenes/{id} → Scene JSON
  編集: MUTABLE フィールドのみ変更可
  保存: PATCH /api/scenes/{id} → Zod検証 → DB更新 → ISR revalidate
         ↓
【LPランタイム（apps/runtime or apps/lp）】
  Scene JSON を読み込み:
    property.structure → ProceduralMeshBuilder.build()
    assets.splatUrl    → GaussianSplatRenderer.load()
    presentation.lpTemplate → CameraSystem + RelightEngine
    compliance → 宅建業法免責文の自動表示
```

### NN.4.2 エディタのリアルタイム反映

```typescript
// エディタ保存 → LPランタイム即時反映

// 保存API
// PATCH /api/scenes/{id}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()

  // 1. Zodでスキーマ検証
  const parsed = SceneSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 })

  // 2. 不変フィールドが変更されていないか検証
  const original = await db.select().from(scenes).where(eq(scenes.id, params.id))
  if (!validateImmutability(original[0].sceneJson, parsed.data)) {
    return Response.json({ error: 'Immutable field modification rejected' }, { status: 403 })
  }

  // 3. コンプライアンス自動チェック
  const compliance = await ComplianceChecker.check(parsed.data)
  parsed.data.compliance = compliance

  // 4. DB保存
  await db.update(scenes)
    .set({ sceneJson: parsed.data, updatedAt: new Date() })
    .where(eq(scenes.id, params.id))

  // 5. ISR即時再生成（LPが0秒で更新される）
  await revalidatePath(`/lp/${params.id}`)

  return Response.json({ ok: true, compliance })
}
```

---

## NN.5 実際に動作するエディタ v5.0 の核心実装

### NN.5.1 エディタとLPランタイムの関係

```
エディタ ≠ LPランタイムの全機能を内包するもの

正しい理解:
  エディタ = Scene JSONを編集するUI
  LPランタイム = Scene JSONを3D体験としてレンダリングするエンジン

エディタのビューポート = LPランタイムの「プレビュー」
（全機能を内包する必要はない）
```

### NN.5.2 エディタビューポートの実装（動作する最小）

```typescript
// apps/web/app/editor/_components/viewport/ViewportCanvas.tsx
'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useEditorStore } from '../store/EditorStore'

export function ViewportCanvas() {
  const mountRef = useRef<HTMLDivElement>(null)
  const { sceneJson, setSelectedNode } = useEditorStore()

  useEffect(() => {
    if (!mountRef.current) return
    const el = mountRef.current

    // ── Renderer ──
    // WebGPU チェック → 非対応ならWebGL2フォールバック
    let renderer: THREE.WebGPURenderer | THREE.WebGLRenderer
    if ('gpu' in navigator) {
      renderer = new THREE.WebGPURenderer({ antialias: true })
    } else {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    // ── Scene ──
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050709)

    // グリッド（エディタ用）
    const grid = new THREE.GridHelper(20, 40, 0x222233, 0x111122)
    scene.add(grid)

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.01, 1000)
    camera.position.set(5, 5, 8)

    // ── Controls ──
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 1, 0)

    // ── 照明 ──
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2)
    sun.position.set(8, 12, 6)
    sun.castShadow = true
    scene.add(ambient, sun)

    // ── 建物構造を描画 ──
    if (sceneJson?.property?.structure) {
      const builder = new ProceduralMeshBuilder(scene)
      builder.build(sceneJson.property.structure)
    }

    // ── アニメーションループ ──
    let raf: number
    const animate = () => {
      raf = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // ── リサイズ対応 ──
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [sceneJson?.property?.structure])  // 構造変更時のみ再構築

  return <div ref={mountRef} className="w-full h-full" />
}
```

### NN.5.3 RelightEngine（照明システム・実装可能版）

```typescript
// apps/runtime/lib/RelightEngine.ts

export class RelightEngine {
  private sun:     THREE.DirectionalLight
  private ambient: THREE.AmbientLight
  private sky:     THREE.Mesh  // SkyShader (Three.jsアドオン)

  constructor(scene: THREE.Scene) {
    this.sun     = new THREE.DirectionalLight()
    this.ambient = new THREE.AmbientLight()
    scene.add(this.sun, this.ambient)
  }

  setPreset(preset: TimePreset): void {
    const p = TIME_PRESETS[preset]

    // 太陽方向計算（方位角・仰角 → 3D座標）
    const azRad = (p.sunAzimuth * Math.PI) / 180
    const elRad = (p.sunElevation * Math.PI) / 180
    this.sun.position.set(
      Math.cos(elRad) * Math.sin(azRad) * 100,
      Math.sin(elRad) * 100,
      Math.cos(elRad) * Math.cos(azRad) * 100,
    )

    // 色温度 → RGB変換（Planckian Locus近似）
    const rgb = kelvinToRGB(p.temp)
    this.sun.color.setRGB(rgb.r, rgb.g, rgb.b)
    this.sun.intensity = p.intensity

    // アンビエント（空の散乱光）
    const skyColor = getSkyColor(p.sunElevation)
    this.ambient.color.copy(skyColor)
    this.ambient.intensity = 0.3 + p.intensity * 0.2
  }

  // GSAP 4でスムーズに遷移
  async transitionTo(preset: TimePreset, duration = 1.0): Promise<void> {
    const { gsap } = await import('gsap')
    const target = TIME_PRESETS[preset]
    const targetRGB = kelvinToRGB(target.temp)

    gsap.to(this.sun, { intensity: target.intensity, duration, ease: 'power1.inOut' })
    gsap.to(this.sun.color, { r: targetRGB.r, g: targetRGB.g, b: targetRGB.b, duration })
  }

  // 感情ピーク演出（LDK入室時等）
  burst(multiplier = 1.4, duration = 0.5): void {
    const original = this.sun.intensity
    gsap.to(this.sun, {
      intensity: original * multiplier,
      duration: duration * 0.3,
      yoyo: true, repeat: 1,
      ease: 'power2.inOut',
      onComplete: () => { this.sun.intensity = original }
    })
  }
}

// ケルビン→RGB（近似式）
function kelvinToRGB(k: number): { r: number; g: number; b: number } {
  const t = k / 100
  const r = t <= 66 ? 1.0 : Math.min(1, (329.698727446 * Math.pow(t - 60, -0.1332047592)) / 255)
  const g = t <= 66
    ? Math.min(1, (99.4708025861 * Math.log(t) - 161.1195681661) / 255)
    : Math.min(1, (288.1221695283 * Math.pow(t - 60, -0.0755148492)) / 255)
  const b = t >= 66 ? 1.0 : (t <= 19 ? 0 : Math.min(1, (138.5177312231 * Math.log(t - 10) - 305.0447927307) / 255))
  return { r, g, b }
}
```

### NN.5.4 CameraSystem（スクロール連動・実装可能版）

```typescript
// apps/runtime/lib/CameraSystem.ts

import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export class CameraSystem {
  private camera:   THREE.PerspectiveCamera
  private sections: CameraSection[]
  private curve:    THREE.CatmullRomCurve3

  constructor(camera: THREE.PerspectiveCamera, sections: CameraSection[]) {
    this.camera = camera
    this.sections = sections
    this.curve = new THREE.CatmullRomCurve3(
      sections.map(s => s.position),
      false, 'catmullrom', 0.5
    )
  }

  // スクロール連動初期化
  initScrollDrive(container: HTMLElement): void {
    ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.5,  // 1.5秒のスムージング
      onUpdate: (self) => {
        this.updateFromProgress(self.progress)
      },
    })
  }

  private updateFromProgress(progress: number): void {
    // スプライン上のカメラ位置
    const clampedProgress = Math.max(0, Math.min(1, progress))
    const point    = this.curve.getPoint(clampedProgress)
    const tangent  = this.curve.getTangent(clampedProgress)

    // GSAPで滑らかにカメラ移動（scrubがあるので短いduration）
    gsap.to(this.camera.position, {
      x: point.x, y: point.y, z: point.z,
      duration: 0.3, ease: 'none',
    })

    // 進行方向にlookAt
    const lookTarget = point.clone().add(tangent)
    const tempObj = new THREE.Object3D()
    tempObj.position.copy(point)
    tempObj.lookAt(lookTarget)
    gsap.to(this.camera.quaternion, {
      x: tempObj.quaternion.x,
      y: tempObj.quaternion.y,
      z: tempObj.quaternion.z,
      w: tempObj.quaternion.w,
      duration: 0.3, ease: 'none',
    })

    // 感情ピーク検出（感情曲線の最大値付近）
    this.checkEmotionPeak(clampedProgress)
  }

  private checkEmotionPeak(progress: number): void {
    // 感情ピーク（35%前後）でCTAを表示
    if (progress > 0.30 && progress < 0.40) {
      this.sections.forEach((sec, i) => {
        const secProgress = i / (this.sections.length - 1)
        if (Math.abs(secProgress - progress) < 0.05) {
          sec.onPeak?.()
        }
      })
    }
  }
}
```

---

## NN.6 宅建業法コンプライアンス自動検証

### NN.6.1 ComplianceChecker（実装可能版）

```typescript
// packages/shared/lib/ComplianceChecker.ts

export class ComplianceChecker {
  static async check(scene: SceneConfig): Promise<ComplianceStatus> {
    const prop = scene.property
    const pres = scene.presentation
    const items = {
      // 必須表示事項
      addressDisplayed:     !!prop.address,
      areaDisplayed:        !!(prop.buildingArea || prop.landArea),
      layoutDisplayed:      !!prop.layoutDescription,
      priceDisplayed:       !!pres.ctaConfig?.priceDisplay,

      // AI・プロシージャル表示
      aiImageLabeled:       pres.sections?.every(s =>
                              !s.isAiGenerated || !!s.aiLabel
                            ) ?? true,
      proceduralDisclaimer: prop.structureSource !== 'procedural'
                              || !!pres.sections?.some(s => s.hasProceduralDisclaimer),
      accuracyDisclaimer:   !!pres.sections?.some(s => s.hasAccuracyDisclaimer),

      // 方位・構造
      northAngleSet:        prop.structure?.northAngle !== undefined,
      structureSourceSet:   !!prop.structureSource,
    }

    const failedRequired = [
      'addressDisplayed', 'areaDisplayed', 'layoutDisplayed'
    ].filter(k => !items[k as keyof typeof items])

    const failedRecommended = Object.keys(items)
      .filter(k => !items[k as keyof typeof items] && !['addressDisplayed','areaDisplayed','layoutDisplayed'].includes(k))

    return {
      checkedAt: new Date().toISOString(),
      overall: failedRequired.length > 0 ? 'fail'
             : failedRecommended.length > 0 ? 'warning'
             : 'pass',
      items,
    }
  }
}
```

### NN.6.2 LP表示時の自動免責文挿入

```typescript
// apps/lp/[propertyId]/page.tsx（LPページのサーバーコンポーネント）

// 免責文を自動挿入（構造ソースに応じて文言を変える）
function getDisclaimerText(scene: SceneConfig): string {
  const source = scene.property.structureSource
  const accuracy = scene.property.structureAccuracy

  if (source === 'procedural') {
    return '※ 建物の外観・内観はイメージCGであり、実際の物件とは異なります。'
  }
  if (source === 'floorplan_claude_vision') {
    const pct = Math.round(accuracy * 100)
    return `※ 間取り図をAI（Claude Vision）が解析し自動生成（精度 約${pct}%）。実際の寸法・仕様は重要事項説明書をご確認ください。`
  }
  if (source === 'bim_ifc') {
    return '※ BIM設計データから生成。竣工後の実際と差異が生じる場合があります。'
  }
  return '※ 実際の物件と表示内容が異なる場合があります。'
}
```

---

## NN.7 ScoreEngine（動的・完全版）

### NN.7.1 100点満点の評価項目

```typescript
// packages/editor-engine/ScoreEngine.ts

export interface ScoreResult {
  total:        number   // 0〜100
  breakdown: {
    structure:       number   // 20点: 建物構造データの充実度
    compliance:      number   // 20点: 宅建業法コンプライアンス
    assets:          number   // 15点: 素材品質（SPZ4/GLB/写真）
    emotionDesign:   number   // 15点: 感情曲線設計
    aiContent:       number   // 10点: AIコンテンツ（FAQ/SEO/コピー）
    performance:     number   // 10点: パフォーマンス（推定）
    cta:             number   // 10点: CTA設計
  }
  issues:     Issue[]         // 改善提案リスト
  autoFix:    AutoFix[]       // 自動修正可能な問題
}

export class ScoreEngine {
  static compute(scene: SceneConfig): ScoreResult {
    const s = scene
    const issues: Issue[] = []
    const autoFix: AutoFix[] = []

    // ── 建物構造 (20点) ──
    let structure = 0
    if (s.property.structure?.rooms?.length > 0) {
      structure += 10
      // 部屋ごとの窓設定
      const openingCount = s.property.structure.openings?.length ?? 0
      if (openingCount >= s.property.structure.rooms.length) structure += 5
      else issues.push({ area: 'structure', msg: `窓・開口部の設定が不完全（${openingCount}件）`, score: -5 })
    } else {
      issues.push({ area: 'structure', msg: '間取り図をインポートして構造データを生成してください', score: -15 })
    }
    if (s.property.structure?.northAngle !== undefined) structure += 5
    else issues.push({ area: 'structure', msg: '方位（北方向）が未設定', score: -5 })

    // ── コンプライアンス (20点) ──
    const comp = s.compliance
    let compliance = 0
    if (comp.items.addressDisplayed)     compliance += 5
    if (comp.items.areaDisplayed)        compliance += 5
    if (comp.items.layoutDisplayed)      compliance += 4
    if (comp.items.aiImageLabeled)       compliance += 3
    if (comp.items.accuracyDisclaimer)   compliance += 3
    if (compliance < 20) {
      issues.push({ area: 'compliance', msg: '宅建業法の表示要件を満たしていない項目があります', score: 20 - compliance })
    }

    // ── 素材品質 (15点) ──
    let assets = 0
    const assetSrc = s.property.structureSource
    if (assetSrc === 'bim_ifc')          assets = 15
    else if (assetSrc === 'floorplan_claude_vision') {
      // Claude Vision解析は精度が75〜85%幅で変動するため、
      // structureAccuracyに応じて段階的に加点（ADR-151のルーティング閾値と整合）
      const acc = s.property.structureAccuracy ?? 0
      if (acc >= 0.85)      assets = 12  // auto_approved相当
      else if (acc >= 0.60) assets = 10  // master_review相当
      else                  assets = 7   // manual_required相当（要スタッフ確認）
    }
    else if (assetSrc === 'manual_input')  assets = 8
    else { assets = 4; issues.push({ area: 'assets', msg: 'プロシージャル生成: 間取り図のアップロードで+8点', score: 8 }) }

    // ── 感情設計 (15点) ──
    let emotionDesign = 0
    const tpl = s.presentation.lpTemplate
    if (tpl?.type)             emotionDesign += 5  // 種別設定
    if (tpl?.startTimePreset)  emotionDesign += 5  // 照明設定
    if (tpl?.postfxPreset && tpl.postfxPreset !== 'none') emotionDesign += 5

    // ── AIコンテンツ (10点) ──
    let aiContent = 0
    const seo = s.presentation.seo
    if (seo?.title)            aiContent += 3
    if (seo?.description)      aiContent += 2
    if (seo?.structuredData)   aiContent += 2
    const ai = s.presentation.ai
    if (ai?.faqItems?.length >= 5) aiContent += 3
    else autoFix.push({ action: 'generate_faq', label: 'FAQを自動生成 (+3点)' })

    // ── パフォーマンス (10点) ──
    let performance = 8  // デフォルト8点（実測は本番のみ）
    // SPZ4ファイルサイズチェック（推定）
    // 画像最適化チェック

    // ── CTA設計 (10点) ──
    let cta = 0
    const ctaConf = s.presentation.ctaConfig
    if (ctaConf?.primaryCTA?.label)   cta += 4
    if (ctaConf?.secondaryCTA?.label) cta += 3
    if (ctaConf?.lineEnabled)         cta += 3
    else issues.push({ area: 'cta', msg: 'LINE連携でCV率+30%見込み', score: 3 })

    const total = structure + compliance + assets + emotionDesign + aiContent + performance + cta

    return {
      total: Math.min(100, total),
      breakdown: { structure, compliance, assets, emotionDesign, aiContent, performance, cta },
      issues,
      autoFix,
    }
  }
}
```

---

## NN.8 整合性マトリクス（完全版）

### NN.8.1 システム↔エディタ↔LP 整合確認

| 項目 | バックエンド（v10.1完全設計書） | エディタ（v5.0） | LPランタイム（KK+LL） | 整合 |
|------|------|------|------|------|
| Scene JSON SSOT | Part E: scenes テーブル | EditorStore → PATCH API | page.tsx で GET | ✅ |
| PropertyTypeSchema | 5種別 + mansion追加(NN) | 種別バー6ボタン | template_* | ✅ |
| 建物構造の不変性 | ImmutablePropertySchema | transformControls.block | ProceduralMeshBuilder | ✅ |
| RelightEngine | Part K | ビューポート照明ボタン | 6時間帯プリセット | ✅ |
| 間取り解析パイプライン | Part H.3（旧FloorplanVLM・廃止） | インポートタブ | structureSource='floorplan_claude_vision'（ADR-144、Part OO.6） | ✅ |
| 宅建業法コンプライアンス | ComplianceChecker | スコアタブ | getDisclaimerText() | ✅ |
| CameraSystem | Part KK.7.1 | タイムライン | ScrollTrigger連動 | ✅ |
| PostFXConfigSchema | 10種プリセット（Part MM.5.2で確定。本書NN.2.1のenumも10種に統一） | 素材タブ | PostFXEngine | ✅ |
| SectionBeacon | Part K | スコアタブ（推定） | SectionBeacon.ts | ✅ |
| pg-boss ジョブ | Part F | （非同期バックグラウンド） | ISR revalidate | ✅ |

### NN.8.2 設計書間の不整合（全て本書で修正）

| 不整合 | 場所 | 修正内容 |
|--------|------|---------|
| `mansion` PropertyTypeに未定義 | v10.1完全設計書 vs KK | NN.2.1で正式追加 |
| PostFXプリセット `warm_morning` 等未定義 | v10.1完全設計書 vs KK | NN.2.1で10種に拡張（Part MM.5.2と一致させた数） |
| `lpTemplate` フィールドがSceneSchemaに未追加 | v10.1完全設計書 | NN.2.1で正式追加 |
| 建物構造の不変性保証が未定義 | KK・LL・MM全て | NN.3.3で保護機構を追加 |
| 宅建業法の自動検証が未実装 | 全設計書 | NN.6で実装仕様追加 |
| `structureSource: 'floorplan_vlm'`がADR-144（FloorplanVLM廃止）後も残存 | NN v1.0 | v1.1でNN.2.1・NN.6.2・NN.7.1・NN.8.1を`'floorplan_claude_vision'`に修正 |
| structureAccuracyがスコアリングで未活用 | NN v1.0 ScoreEngine.assets | v1.1で精度帯別（0.85+ / 0.60+ / 0.60未満）の段階加点に変更（Part OO ADR-151の閾値と整合） |

---

## NN.9 実装優先順位（Claude Code向け）

### フェーズ0（Week 1〜2）: 動く骨格

```
優先1: packages/shared/schemas/scene.ts
  → ImmutablePropertySchema + MutablePresentationSchema + SceneSchema
  → Zodファイルとして実際に作成

優先2: packages/shared/schemas/room.ts
  → RoomSchema + WallSchema + OpeningSchema

優先3: packages/shared/lib/ComplianceChecker.ts
  → 宅建業法自動検証（最低限の6項目）

優先4: apps/runtime/lib/ProceduralMeshBuilder.ts
  → Floor + Wall(開口くり抜き) + Window/Door
  → Three.js（WebGPURenderer標準・WebGL2自動フォールバック、ADR-162.1）で動作確認
```

### フェーズ1（Week 3〜4）: エディタ最小動作

```
優先5: packages/editor-engine/EditorStore.ts
  → Zustand + zundo

優先6: apps/web/app/editor/_components/viewport/ViewportCanvas.tsx
  → Three.js（WebGPURenderer標準・WebGL2自動フォールバック）+ OrbitControls + 建物表示

優先7: packages/editor-engine/ScoreEngine.ts
  → 動的スコア計算（7項目）

優先8: apps/web/app/api/scenes/[id]/route.ts
  → GET / PATCH + 不変フィールド検証
```

### フェーズ2（Week 5〜8）: LP体験

```
優先9:  apps/runtime/lib/RelightEngine.ts
優先10: apps/runtime/lib/CameraSystem.ts（ScrollTrigger）
優先11: apps/runtime/lib/SectionBeacon.ts
優先12: apps/lp/[propertyId]/page.tsx
優先13: Claude Vision（FloorplanAnalyzer）→ ProceduralMesh パイプライン（pg-boss）
```

### フェーズ3（Week 9〜12）: WebGPU前提の感動演出

```
優先14: apps/runtime/lib/GaussianSplatRenderer.ts（SPZ4ローダー・LODストリーミング）
        WebGPU前提の感動演出の中核。レンダラー自体はフェーズ0から両対応済みのため
        「移行」作業は不要で、Splat演出の追加実装に集中できる（ADR-162.1）。

優先15: apps/runtime/engines/ScrollCinemaEngine.ts
        Part TTのScrollCameraEngine（scrub=true・キーフレーム型）と
        フェーズ2のCameraSystem.ts（CatmullRomCurve3・セクション型）を統合する。
        ※ 実装前にCameraSystem.ts のインターフェースをScrollCinemaEngineの
          CameraKeyframe型に合わせて確定すること（apps/runtime/lib/CameraSystem.ts
          のパスを共有しているため競合する実装を一本化する必要がある）。

優先16: apps/runtime/lib/PostFXEngine.ts（TSLシェーダー・WebGPU対応プリセット10種）
        Three.js TSL（Transpiler Shader Language）はWebGPU前提のノードベース実装。
        フェーズ2のRelightEngineと組み合わせて感情演出の仕上げを行う。

優先17: apps/web/app/editor/_components/AiCopilot.tsx
        エディタ内AIコパイロット（claude-sonnet-4-6）。
        LoopCostTrackerとテナントプラン別月次上限（Part MM ADR-163）を組み込む。

優先18: GrowthLoopBridge + ABテスト自動昇格（Part QQ ADR-173〜179との接続）
        WinnerPatternServiceへの学習結果フィードバックループを完成させる。
```

---

## NN.10 ADRログ

| ADR# | 決定内容 | 採択理由 |
|------|---------|---------|
| ADR-136 | 建物構造フィールドを ImmutablePropertySchema として分離 | 宅建業法・不動産広告規制上、物件の構造情報は一度確定したら変更不可 |
| ADR-137 | ProceduralMeshBuilder は Scene JSON の structure フィールドのみを入力とする | 「AIが適当に家を作る」実装の排除。構造の出所を必ず明記 |
| ADR-138 | ComplianceChecker をエクスポートAPIの必須ミドルウェアとする | 宅建業法違反LPの公開を構造的に防止 |
| ADR-139 | WebGPU非対応環境はWebGL2でフォールバック | iPhoneの一部・古いPC。フォールバックなしでは商業使用不可 |
| ADR-140 | userData.immutable=true のMeshはTransformControlsで操作不可 | エディタから構造変更できないことをUI層でも保証 |
| ADR-141 | ScoreEngineはstructure(20点)とcompliance(20点)の2項目を最高配点とする | 最も重要な「実データ充実」と「法令遵守」を優先 |
| ADR-142 | エディタビューポートはLPランタイムの完全再現ではなく「プレビュー」と位置づける | エディタに全機能を詰め込むと開発コストが2倍になる |
| ADR-143 | 実装優先順位はZodスキーマ→ProceduralMesh→ScoreEngine→エディタ→LP体験の順 | 土台なき3D演出は「動かない設計書」を再生産するだけ |
| ADR-160 | NN.2.1の`structureSource`enumを`'floorplan_vlm'`から`'floorplan_claude_vision'`へ修正し、Part OO（ADR-144）と整合させる | NN v1.0はADR-144（FloorplanVLM廃止）より前に書かれたため、中核スキーマが廃止済みパイプラインを参照していた。ScoreEngine.assetsもstructureAccuracyの精度帯（0.85+/0.60+/未満）に応じた段階加点に変更し、Part OOのADR-151ルーティング閾値と一致させた |
| ADR-162.1 | NN.9のフェーズ0・フェーズ1のレンダラー記述を「WebGPURenderer標準・WebGL2自動フォールバック」に修正し、フェーズ3「WebGPU Renderer への移行」を「WebGPU前提の感動演出の追加実装」に意味を改める | Part MM v5.2でADR-162（WebGL2先行・WebGPUはフェーズ3）を撤回しADR-162.1に置き換えたため、NN側の記述も追随する必要がある。2026年6月時点で主要4ブラウザがWebGPUを既定で出荷しており、レンダラー切替を独立フェーズとして確保する前提が崩れている | NN側を旧ADR-162のまま放置し、Part MMとの間に再び矛盾を生じさせる |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|----------|------|--------|
| v1.0 | 2026-06-12 | 初版。v4.0エディタとKK/LL/MMの問題点を正直に診断し、実装可能な統合設計に再構築。不動産広告の構造固定・宅建業法コンプライアンスを設計の中心に配置 |
| v1.1 | 2026-06-12 | ADR-160追加。structureSource enumを`'floorplan_claude_vision'`に修正（NN.2.1・NN.6.2・NN.7.1）。ScoreEngine.assetsをstructureAccuracy連動の段階加点に変更。NN.8.1整合性マトリクスのFloorplanVLM行をClaude Vision版に更新し、PostFXプリセット数をPart MM.5.2と一致する10種に統一。NN.3.1/NN.3.2/NN.9のFloorplanVLM言及をADR-144準拠の表現に修正 |
| v1.2 | 2026-06-13 | ADR-162.1追加。NN.9フェーズ0「優先4」・フェーズ1「優先6」のレンダラー記述をWebGPURenderer標準・WebGL2自動フォールバックに修正。フェーズ3「優先14」を「WebGPU Renderer への移行」から「WebGPU前提の感動演出の追加実装」に変更し、Part MM v5.2との矛盾を解消 |
| v1.3 | 2026-06-13 | NN.9フェーズ3の記述バグを3件修正。① 優先14と優先17のGaussianSplatRenderer重複を解消（優先17を削除し優先14の説明を正式仕様に昇格）。② 優先15をフェーズ2優先10との重複から「ScrollCinemaEngineとCameraSystem.tsの統合」に意味を明確化（Part TTとの接続仕様を明記）。③ 優先17・18をAIコパイロット実装とGrowthLoopBridge/ABテスト自動昇格として分離定義。課題分析の誤認3件（ADR重複残存・SS未設計・PP未設計）の実態も本文注記に記録 |
