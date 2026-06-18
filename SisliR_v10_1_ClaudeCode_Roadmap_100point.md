# SisliR v10.1 — Claude Code 実装ロードマップ 100点版
## フェーズ0〜3 完全タスクリスト + コマンド集

> **バージョン**: v1.0 (2026-06-15)  
> **対象**: Claude Code セッション単位の実装ガイド  
> **原則**: NN spec 3原則 — 動く最小単位 / 法的制約が設計の中心 / Scene JSON SSOT  
> **スコア基準**: NN.7 ScoreEngine（structure 20点 / compliance 20点 / assets 15点 / emotionDesign 15点 / aiContent 10点 / performance 10点 / cta 10点）

---

## 前提確認チェックリスト（実装開始前に全て完了）

```bash
# 環境確認
node --version          # v20以上必須
npm --version           # v10以上推奨

# 必須サービス確認
# □ Supabase プロジェクト作成済み（ap-northeast-1 日本リージョン）
# □ Supabase APIキー → 新形式に移行済み
#     旧: SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
#     新: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY
# □ Cloudflare R2 バケット「sisliR-assets」作成済み
# □ Anthropic API キー取得済み（claude-sonnet-4-6 / claude-haiku-4-5）
# □ Grafana Cloud アカウント作成済み（Free プランで可）
# □ .env.local に全必須環境変数設定済み（下記参照）
```

### .env.local テンプレート（コピー用）

```bash
# === Supabase（新形式 2026 Q4移行済み）===
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
SUPABASE_SECRET_KEY=sb_secret_xxxx
SUPABASE_DB_URL=postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres

# === AI ===
ANTHROPIC_API_KEY=sk-ant-xxxx
AI_TIMEOUT_MS=120000

# === 動画生成（VideoGeneratorRouter フォールバック順）===
HIGGSFIELD_API_KEY=xxxx
HIGGSFIELD_DISABLE=false
RUNWAY_API_KEY=xxxx
KLING_API_KEY=xxxx
VIDEO_PROVIDER_PRIORITY=higgsfield,runway,kling,opencut,ffmpeg

# === ストレージ ===
CLOUDFLARE_R2_ENDPOINT=https://xxxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=xxxx
CLOUDFLARE_R2_SECRET_KEY=xxxx
CLOUDFLARE_R2_BUCKET=sisliR-assets
LOCAL_PROJECTS_DIR=D:\SisliR_Projects

# === 画像生成 AI（Part SS）===
OPENAI_API_KEY=xxxx
PHOTO_AI_EDIT_MONTHLY_LIMIT_GROWTH=10
PHOTO_AI_EDIT_MONTHLY_LIMIT_PREMIUM=50

# === 可観測性 ===
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://xxxx.grafana.net/otlp
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://xxxx.grafana.net/otlp
GRAFANA_CLOUD_TOKEN=xxxx

# === ループ制御 ===
LOOP_EMERGENCY_STOP=false
SCENE_VALIDATE_MODE=strict
```

---

---

# フェーズ 0 — プロジェクト基盤 + Scene JSON SSOT（Week 1〜2）
## ScoreEngine: structure +20点、compliance +20点 の土台

> **Claude Code 指示**: フェーズ0は「動く骨格」。3Dもエディタも後。まずZodスキーマとComplianceCheckerを動かす。

---

## タスク 0-1: モノレポ初期化

```
設計書参照: CLAUDE.md（モノレポ構成）、Part B（技術スタック）
優先度: 最高
見積もり: 30分
```

```bash
# Turborepo モノレポ作成
npx create-turbo@latest sisliR --package-manager npm
cd sisliR

# ルート共通ツール
npm install -D typescript@5 eslint prettier vitest @vitest/coverage-v8 playwright

# shared パッケージ（Zodスキーマ・ファクトリー）
cd packages/shared
npm install zod@4 uuid
npm install -D @types/uuid

# Next.js アプリ（apps/web）
cd ../../apps/web
npm install next@15 react@19 react-dom@19
npm install @supabase/supabase-js@latest
npm install drizzle-orm@0.30 drizzle-kit@latest
npm install pg-boss@10
npm install @anthropic-ai/sdk
npm install @opentelemetry/sdk-node @opentelemetry/api
npm install @opentelemetry/exporter-trace-otlp-http
npm install @opentelemetry/exporter-metrics-otlp-http
npm install @opentelemetry/sdk-metrics
npm install @opentelemetry/resources @opentelemetry/semantic-conventions
npm install pino

cd ../..
```

**turbo.json に pipeline 追加:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test:unit": { "dependsOn": ["^build"] },
    "test:integration": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

**完了確認:**
```bash
npm run typecheck   # エラーなし
npm run lint        # エラーなし
```

---

## タスク 0-2: TypeScript strict mode 設定

```
設計書参照: CLAUDE.md 絶対ルール#1
優先度: 最高
```

ルート `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "paths": {
      "@/lib/*": ["./lib/*"],
      "@/packages/*": ["./packages/*"],
      "@/apps/*": ["./apps/*"]
    }
  }
}
```

---

## タスク 0-3: Scene JSON v10.0 Zod スキーマ実装 ⭐ 最重要

```
設計書参照: Part NN（NN.2.1 完全版）、Part E.1（コアスキーマ）
優先度: 最高（全実装の土台）
見積もり: 2〜3時間
```

`packages/shared/src/schemas/scene.ts` を作成。以下を全て含めること:

**不変フィールド（宅建業法準拠・エディタから変更不可）:**
- `ImmutablePropertySchema`（address / landArea / buildingArea / totalFloors / builtYear / layoutDescription / structure）
- `structureSource` enum: `'floorplan_claude_vision' | 'bim_ifc' | 'manual_input' | 'procedural'`（`'floorplan_vlm'` は ADR-144 で廃止済み）
- `structureAccuracy: z.number().min(0).max(1)`

**建物構造スキーマ（不変・ProceduralMeshBuilderが参照）:**
- `RoomSchema`（id / type / x / y / width / depth / height / floor / area / label）
- `WallSchema`（id / x1 / y1 / x2 / y2 / thickness / floor / isExternal）
- `OpeningSchema`（id / wallId / type / x / width / height / sillHeight）

**可変フィールド（エディタで自由に編集可）:**
- `MutablePresentationSchema`（lpTemplate / postFX / sections / ctaConfig / ai / seo）
- `PostFXConfigSchema`（10種プリセット: cinematic / golden_hour / blue_hour / misty_morning / warm_interior / cool_modern / vibrant_resort / monochrome_luxury / natural_light / dramatic_dusk）
- `LpTemplateConfigSchema`（type / startTimePreset / postfxPreset / emotionCurve）
- `CTAConfigSchema`（primaryCTA / secondaryCTA / lineEnabled / priceDisplay）
- `SEOConfigSchema`（title / description / structuredData）
- `AIConfigSchema`（faqItems[]）

**コンプライアンス:**
- `ComplianceStatusSchema`（checkedAt / overall: 'pass'|'warning'|'fail' / items）

**メインスキーマ:**
```typescript
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
```

**Unit Test 作成（必須）:**
```
tests/unit/SceneSchema.test.ts
✓ v10.0.0 の正常パース
✓ version不一致でエラー
✓ 必須フィールド欠落でエラー
✓ structureSource='floorplan_vlm' でエラー（廃止済み）
✓ structureAccuracy が 0〜1 範囲外でエラー
✓ デフォルト値が正しく設定される
```

---

## タスク 0-4: 建物構造スキーマ分離 + ProceduralMeshBuilder 骨格

```
設計書参照: Part NN（NN.3.1〜NN.3.2）、フェーズ0 優先4
優先度: 最高
見積もり: 1〜2時間
```

`packages/shared/src/schemas/room.ts` — RoomSchema / WallSchema / OpeningSchema を分離定義

`apps/runtime/lib/ProceduralMeshBuilder.ts` — 骨格のみ作成（Three.js依存・後続フェーズで肉付け）:

```typescript
// ※ WebGPURenderer標準・WebGL2自動フォールバック（ADR-162.1）
// ※ フェーズ0では型定義と空メソッドのみ実装。Three.jsインポートはコメントアウト可
export class ProceduralMeshBuilder {
  constructor(private scene: unknown) {} // THREE.Scene は後続フェーズで型付け
  build(structure: PropertyStructure): void {
    // フェーズ1で実装（Floor + Wall + Window/Door）
  }
}
```

---

## タスク 0-5: ComplianceChecker 実装 ⭐ 法的必須

```
設計書参照: Part NN（NN.6.1 ComplianceChecker 実装可能版）
優先度: 最高（宅建業法違反LPの公開を構造的に防止）
見積もり: 1時間
```

`packages/shared/lib/ComplianceChecker.ts`:

**6必須チェック項目:**
1. `addressDisplayed` — 所在地表示（宅建業法 第35条）
2. `areaDisplayed` — 面積表示
3. `layoutDisplayed` — 間取り表示（「3LDK」等）
4. `aiImageLabeled` — AI生成画像の旨の表示
5. `accuracyDisclaimer` — 精度免責文の有無
6. `northAngleSet` — 方位（北方向）設定

**overall 判定:**
- `fail`: addressDisplayed / areaDisplayed / layoutDisplayed のいずれかが false
- `warning`: 推奨項目に未対応あり
- `pass`: 全項目OK

**Unit Test 作成（必須）:**
```
tests/unit/ComplianceChecker.test.ts
✓ 全必須項目OK → overall: 'pass'
✓ address未設定 → overall: 'fail'
✓ AI画像ラベルなし → overall: 'warning'
✓ procedural + 免責文なし → overall: 'fail'
```

---

## タスク 0-6: ScoreEngine 実装（動的100点計算）

```
設計書参照: Part NN（NN.7 ScoreEngine 完全版）
優先度: 最高
見積もり: 2時間
```

`packages/editor-engine/ScoreEngine.ts`:

**7項目の配点（合計100点）:**

| 項目 | 満点 | 主な判定ロジック |
|------|------|----------------|
| structure | 20 | rooms設定+10 / openings完備+5 / northAngle設定+5 |
| compliance | 20 | ComplianceChecker.items の各フラグに応じて加点 |
| assets | 15 | bim_ifc=15 / claude_vision(acc≥0.85)=12 / (acc≥0.60)=10 / (acc<0.60)=7 / manual=8 / procedural=4 |
| emotionDesign | 15 | lpTemplate.type+5 / startTimePreset+5 / postfxPreset≠none+5 |
| aiContent | 10 | SEO title+3 / description+2 / structuredData+2 / FAQ≥5件+3 |
| performance | 10 | デフォルト8点（本番実測で更新） |
| cta | 10 | primaryCTA+4 / secondaryCTA+3 / lineEnabled+3 |

**ScoreResult 型:**
```typescript
export interface ScoreResult {
  total:     number          // 0〜100
  breakdown: Record<ScoreCategory, number>
  issues:    Issue[]         // { area, msg, score }[]
  autoFix:   AutoFix[]      // { action, label }[]
}
```

**Unit Test 作成（必須）:**
```
tests/unit/ScoreEngine.test.ts
✓ 全項目最高評価で100点
✓ structure未設定で -15点
✓ compliance fail状態でstructure以外のスコア確認
✓ procedural + 免責文なしで assets=4
✓ FAQ5件未満で autoFix に 'generate_faq' が入る
```

---

## タスク 0-7: OpenTelemetry 可観測性基盤

```
設計書参照: Part BB.2（OpenTelemetry初期設定）、Part BB.4（構造化ログ）
CLAUDE.md 絶対ルール#5（外部API呼び出しは必ずスパンで囲む）
優先度: 最高（全実装がこれに依存）
見積もり: 1時間
```

`lib/observability/tracer.ts` — カスタムメトリクス5種含む:
- `agentDuration` / `apiCallCounter` / `leadCreatedCounter` / `videoGenSuccessRate` / `lpLoadDuration`

`lib/observability/logger.ts` — pino ベース構造化ログ（console.log 禁止）

`apps/web/src/instrumentation.ts`:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../lib/observability/tracer')
  }
}
```

---

## タスク 0-8: pg-boss セットアップ

```
設計書参照: Part F.1（エージェント実行フロー）、ADR-046（Redis不要）
優先度: 最高
見積もり: 30分
```

`lib/queue/boss.ts`:
```typescript
import PgBoss from 'pg-boss'

let boss: PgBoss | null = null

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss
  boss = new PgBoss({
    connectionString: process.env.SUPABASE_DB_URL,
    schema: 'pgboss',
    monitorStateIntervalSeconds: 30,
    archiveCompletedAfterSeconds: 86400,
  })
  await boss.start()
  return boss
}
```

---

## フェーズ0 完了チェック

```bash
# 型チェック
npm run typecheck

# Unit Test（全パス必須）
npm run test:unit -- --reporter=verbose

# 確認項目
# ✓ SceneSchema: v10.0.0 パース成功
# ✓ ComplianceChecker: pass/warning/fail 正確に判定
# ✓ ScoreEngine: 100点計算が動的に動作
# ✓ OpenTelemetry: スパン初期化エラーなし
# ✓ pg-boss: Supabase接続確認
```

---

---

# フェーズ 1 — DB・認証・エディタ最小動作（Week 3〜4）
## ScoreEngine: assets +15点（データ充実）の準備

---

## タスク 1-1: Drizzle ORM スキーマ定義

```
設計書参照: Part M（データベース設計）全体
優先度: 最高
見積もり: 3時間
```

`packages/shared/src/db/schema.ts` — 全テーブルを `pgTable` で定義:

**コアテーブル（この順番で）:**
1. `tenants` — id / name / plan / createdAt
2. `agents` — id / tenantId / userId / role
3. `properties` — id / tenantId / propertyType / address / gen_*_status（全ステータスカラム）
4. `scenes` — id / propertyId / sceneJson(jsonb) / updatedAt
5. `property_embeddings` — propertyId / embedding vector(1024) / updatedAt
6. `video_quality_logs` — id / propertyId / provider / score / embedding vector(1024)
7. `higgsfield_credit_usage` — id / tenantId / date / creditUsed / creditRemaining
8. `behavior_logs` — id / propertyId / sessionId / sectionId / eventType / durationMs
9. `agent_runs` — id / propertyId / jobId / status / startedAt / finishedAt / errorMsg

**Growth Loopテーブル:**
10. `thumbnail_logs` / 11. `leads` / 12. `utm_tracking` / 13. `ab_variants`
14. `improvement_queue` / 15. `seo_configs` / 16. `tenant_sitemaps`
17. `email_intake_logs` / 18. `api_cost_logs`（LoopCostTracker用）

**注意:**
- `vector` 型は `customType` で定義（drizzle-orm/pg-core）
- 全テーブルに `created_at TIMESTAMPTZ DEFAULT NOW()`
- `api_cost_logs`: `task / provider / model / cost_jpy / input_tokens / output_tokens / property_id`

---

## タスク 1-2: DB マイグレーション + RLS 設定

```
設計書参照: Part E（マイグレーション戦略）、Part M.4（RLS設定）
優先度: 最高
見積もり: 1〜2時間
```

```bash
# migration 生成
npm run db:generate

# Supabase SQL Editor で実行
```

```sql
-- pgvector 拡張
CREATE EXTENSION IF NOT EXISTS vector;

-- RLS 有効化（全対象テーブル）
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE thumbnail_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_cost_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_logs ENABLE ROW LEVEL SECURITY;

-- テナント分離ポリシー
CREATE POLICY tenant_isolation ON properties
  USING (tenant_id = (
    SELECT tenant_id FROM agents WHERE user_id = auth.uid()
  ));
-- 同様のポリシーを全 RLS テーブルに適用

-- HNSW インデックス（pgvector）
CREATE INDEX ON property_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Claude Vision 間取り解析結果検索用関数
CREATE OR REPLACE FUNCTION find_no_lead_properties(tenant_id_param UUID)
RETURNS TABLE(id UUID, address TEXT) AS $$
  SELECT p.id, p.address FROM properties p
  WHERE p.tenant_id = tenant_id_param
    AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.property_id = p.id)
  ORDER BY p.created_at DESC LIMIT 50;
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## タスク 1-3: SceneAdapter（バージョン変換）

```
設計書参照: Part E.2.3（バージョン別読み込みアダプター）
優先度: 高
見積もり: 1時間
```

`lib/schema/SceneAdapter.ts` — v8/v9/v9.1 → v10.0.0 自動変換

`lib/schema/validateScene.ts` — strict / lenient モード対応

**Unit Test:**
```
tests/unit/SceneAdapter.test.ts
✓ v8.0.0 → v10.0.0 変換成功
✓ v9.0.0 → v10.0.0 変換成功
✓ structureSource='floorplan_vlm' → 'floorplan_claude_vision' に自動変換
✓ すでに v10.0.0 の場合は変換なし
```

---

## タスク 1-4: テストデータファクトリー

```
設計書参照: Part AA.3（テストデータファクトリー）
CLAUDE.md 絶対ルール#7（テストを必ず書く）
優先度: 高（他のテスト全てが依存）
見積もり: 1時間
```

`packages/shared/src/testing/factories.ts`:
- `createTestProperty(overrides?)` — propertyType:'mansion' / address:'東京都渋谷区...' デフォルト
- `createTestScene(overrides?)` — version:'10.0.0' / compliance:'pass' デフォルト
- `createTestTenant()` / `createTestAgent(tenantId)`

---

## タスク 1-5: LLM プロバイダー抽象化

```
設計書参照: Part C.2（LLMプロバイダー抽象化）、CLAUDE.md AI モデル使い分け
優先度: 最高（全エージェントが依存）
見積もり: 1〜2時間
```

`lib/ai/provider.ts`:

```typescript
type AITask = 
  | 'extraction'      // claude-sonnet-4-6
  | 'copy'            // claude-sonnet-4-6
  | 'classification'  // claude-haiku-4-5
  | 'quality_score'   // claude-sonnet-4-6
  | 'video_prompt'    // claude-sonnet-4-6
  | 'floor_analysis'  // claude-sonnet-4-6（Claude Vision）
  | 'legal_check'     // claude-opus-4-6（複雑な法令チェック・限定使用）
```

**必須実装事項:**
- `AI_TIMEOUT_MS` 環境変数でタイムアウト制御
- 全呼び出しを OpenTelemetry スパンで囲む（CLAUDE.md 絶対ルール#5）
- `api_cost_logs` への自動コスト記録

---

## タスク 1-6: EditorStore（Zustand + zundo）

```
設計書参照: Part NN（NN.5.2 ViewportCanvas の前提）、Part MM v5.3
優先度: 最高（エディタの状態管理基盤）
見積もり: 1〜2時間
```

```bash
npm install zustand@5 immer@10 zundo
```

`packages/editor-engine/EditorStore.ts`:

```typescript
// 保護パス（不変フィールドへの書き込みブロック）
const PROTECTED_PATHS = [
  'property.structure',
  'property.address',
  'property.landArea',
  'property.buildingArea',
]

function guardedUpdate(path: string, value: unknown): void {
  if (PROTECTED_PATHS.some(p => path.startsWith(p))) {
    console.error(`[Editor] Immutable field blocked: ${path}`)
    return
  }
  // store更新
}
```

---

## タスク 1-7: ViewportCanvas（Three.js WebGPU + OrbitControls）

```
設計書参照: Part NN（NN.5.2 エディタビューポート実装可能版）
ADR-162.1: WebGPURenderer標準・WebGL2自動フォールバック
優先度: 最高（フェーズ1の中心実装）
見積もり: 3〜4時間
```

```bash
npm install three@0.184 @types/three
```

`apps/web/app/editor/_components/viewport/ViewportCanvas.tsx`:

**必須実装事項:**
1. WebGPU チェック → 非対応なら WebGL2 フォールバック（ADR-162.1）
2. `Scene JSON → ProceduralMeshBuilder.build()` 呼び出し
3. `userData.immutable = true` の Mesh は TransformControls で操作不可（ADR-140）
4. `ResizeObserver` でレスポンシブ対応
5. unmount 時に `renderer.dispose()` + `cancelAnimationFrame()`

```typescript
// WebGPU / WebGL2 自動選択（ADR-162.1）
let renderer: THREE.WebGPURenderer | THREE.WebGLRenderer
if ('gpu' in navigator) {
  renderer = new THREE.WebGPURenderer({ antialias: true })
} else {
  renderer = new THREE.WebGLRenderer({ antialias: true })
}
```

---

## タスク 1-8: Scene JSON CRUD API

```
設計書参照: Part NN（NN.4.2 エディタ保存 → LP即時反映）
優先度: 最高
見積もり: 2時間
```

`apps/web/app/api/scenes/[id]/route.ts`:

**GET**: scenes テーブルから取得 → SceneAdapter 経由で v10.0.0 に変換

**PATCH**: 4段階バリデーション（Zod → 不変フィールド検証 → ComplianceChecker → DB保存）:
```typescript
// 1. Zod検証
const parsed = SceneSchema.safeParse(body)
if (!parsed.success) return Response.json({ error: parsed.error }, { status: 400 })

// 2. 不変フィールド検証（property.structure が変更されていないか）
const original = await db.select().from(scenes).where(eq(scenes.id, params.id))
if (!validateImmutability(original[0].sceneJson, parsed.data)) {
  return Response.json({ error: 'Immutable field modification rejected' }, { status: 403 })
}

// 3. コンプライアンス自動チェック
const compliance = await ComplianceChecker.check(parsed.data)
parsed.data.compliance = compliance

// 4. DB保存 + ISR即時再生成
await db.update(scenes).set({ sceneJson: parsed.data, updatedAt: new Date() }).where(eq(scenes.id, params.id))
await revalidatePath(`/lp/${params.id}`)
return Response.json({ ok: true, compliance })
```

**Integration Test:**
```
tests/integration/api/scenes.test.ts
✓ GET: 正常取得・SceneAdapter経由の変換
✓ PATCH: 正常更新
✓ PATCH: property.structure 変更試行 → 403
✓ PATCH: Zod バリデーションエラー → 400
✓ PATCH: compliance 自動計算・レスポンス含有
```

---

## フェーズ1 完了チェック

```bash
npm run typecheck
npm run test:unit
npm run test:integration

# 手動確認
# ✓ ブラウザで ViewportCanvas が表示される（Three.js シーン）
# ✓ property.structure の編集が UI からブロックされる
# ✓ PATCH /api/scenes/:id で compliance が自動計算される
# ✓ ScoreEngine が動的スコアを返す
```

---

---

# フェーズ 2 — エージェント + LP体験（Week 5〜8）
## emotionDesign +15点 / aiContent +10点 / cta +10点

---

## タスク 2-1: MCPサーバー基底クラス + 骨格

```
設計書参照: Part F.3（MCPサーバー一覧）、CLAUDE.md 絶対ルール#8
優先度: 最高
見積もり: 1〜2時間
```

```bash
# MCP SDK
npm install @modelcontextprotocol/sdk
```

`apps/mcp/src/base/McpServer.ts` — 基底クラス（OTelスパン自動設定・エラーハンドリング統一）

**14サーバーの骨格作成:**
```
apps/mcp/src/servers/
  mcp_sisliR_db/index.ts
  mcp_sisliR_storage/index.ts     # ★ 最優先
  mcp_sisliR_pdf/index.ts         # ★ 最優先
  mcp_sisliR_image/index.ts       # ★ 最優先
  mcp_sisliR_lp/index.ts
  mcp_sisliR_portal/index.ts
  mcp_sisliR_doc/index.ts
  mcp_sisliR_video/index.ts
  mcp_sisliR_usd/index.ts
  mcp_sisliR_thumbnail/index.ts   # ★ 最優先
  mcp_sisliR_seo/index.ts
  mcp_sisliR_distribute/index.ts
  mcp_sisliR_analytics/index.ts
  mcp_sisliR_abtest/index.ts      # Part QQ
```

---

## タスク 2-2: mcp_sisliR_storage 実装

```
設計書参照: Part D（アセット管理 & ストレージ設計）
優先度: 最高（他のMCPが依存）
見積もり: 2時間
```

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

提供ツール:
- `upload_to_r2(localPath, r2Key)` — 公開アップロード
- `download_from_r2(r2Key, localPath)` — ダウンロード
- `check_r2_exists(r2Key)` — べき等性チェック用
- `list_r2_keys(prefix)` — 一覧取得
- `get_r2_public_url(r2Key)` — 公開 URL 生成

**R2 キー設計（Part D.3 準拠）:**
```
{tenantId}/{propertyId}/photos/original/{filename}
{tenantId}/{propertyId}/photos/webp/{filename}
{tenantId}/{propertyId}/splat/scene.spz4
{tenantId}/{propertyId}/lp/index.html
{tenantId}/{propertyId}/video/tour.mp4
{tenantId}/{propertyId}/thumbnails/{platform}_{style}.webp
{tenantId}/{propertyId}/documents/pamphlet.pdf
```

---

## タスク 2-3: mcp_sisliR_image 実装

```
設計書参照: Part B.4（sharp）、Part F.1 Step 2（写真処理）
優先度: 最高
見積もり: 2〜3時間
```

```bash
npm install sharp @types/sharp
```

提供ツール:
- `process_photos(propertyId, photoUrls)` — 補正・WebP変換・R2アップロード
- `analyze_hero_photo(propertyId, photoUrls)` — Claude Vision でベスト写真選定
- `resize_image(url, width, height, format)` — リサイズ変換

**べき等性:** R2 の `photos/webp/` キーが存在する場合はスキップ

---

## タスク 2-4: mcp_sisliR_pdf 実装（Claude Vision FloorplanAnalyzer）

```
設計書参照: Part H（ファイルインポートパイプライン）、ADR-144（FloorplanVLM廃止）
優先度: 最高（structureSource='floorplan_claude_vision' の実装主体）
見積もり: 3〜4時間
```

```bash
npm install pdfjs-dist chardet
```

`lib/agent/FloorplanAnalyzer.ts` — Claude Vision（claude-sonnet-4-6）による間取り図解析:

**入力:** 間取り図 PNG / JPEG（PDF はページ画像化して渡す）

**出力（精度 75〜85% IoU・ADR-151 ルーティング閾値）:**
```typescript
{
  rooms:    RoomSchema[],
  walls:    WallSchema[],
  openings: OpeningSchema[],
  northAngle: number,
  structureSource: 'floorplan_claude_vision',
  structureAccuracy: number,  // 0.0〜1.0
  routingDecision: 'auto_approved' | 'master_review' | 'manual_required'
  // acc≥0.85 → auto_approved
  // 0.60≤acc<0.85 → master_review
  // acc<0.60 → manual_required
}
```

提供ツール:
- `extract_floor_plan(pdfUrl)` — FloorplanAnalyzer 呼び出し → structure JSON
- `extract_sales_sheet(pdfUrl)` — 販売図面 PropertyInfo 抽出（Claude Documents API）
- `extract_spec_sheet(pdfUrl)` — 仕様書から設備・素材情報抽出

---

## タスク 2-5: mcp_sisliR_thumbnail 実装

```
設計書参照: Part V（SNSサムネイル生成設計）
優先度: 最高
見積もり: 3時間
```

```bash
npm install @napi-rs/canvas
```

`lib/thumbnail/ThumbnailGenerator.ts`:

**7プラットフォーム × THUMBNAIL_SPECS:**
```typescript
const THUMBNAIL_SPECS = {
  ogp:             { width: 1200, height: 630,  format: 'webp' },
  twitter_card:    { width: 1200, height: 628,  format: 'webp' },
  instagram_feed:  { width: 1080, height: 1080, format: 'webp' },
  instagram_story: { width: 1080, height: 1920, format: 'webp' },
  facebook_post:   { width: 1200, height: 630,  format: 'webp' },
  youtube_thumb:   { width: 1280, height: 720,  format: 'webp' },
  line_timeline:   { width: 1024, height: 512,  format: 'jpeg' },
}
```

提供ツール: `generate_sns_thumbnails(propertyId, sceneJson, baseImageUrl)`

**Unit Test:**
```
✓ ogp サイズ = 1200×630
✓ instagram_feed サイズ = 1080×1080
✓ WebP 出力（JPEG必要な line_timeline は JPEG）
```

---

## タスク 2-6: QualityChecker 実装

```
設計書参照: Part F.4（品質チェッカー）
CLAUDE.md 絶対ルール#11（宅建業法準拠チェック）
優先度: 最高
見積もり: 1時間
```

`lib/agent/QualityChecker.ts`:

**禁止語リスト（宅建業法・不動産広告規制）:**
```
最高 / 一番 / 完璧 / 絶対 / 激安 / 日本一 / 最安値 / No.1
```

**チェック項目:**
- キャッチコピー: 15文字以上 / 40文字以下 / 禁止語なし
- SEOタイトル: 30文字以下
- SEOディスクリプション: 120文字以下

**Unit Test:**
```
✓ 正常コピー → pass
✓ 「最高の物件」 → fail（禁止語）
✓ 14文字コピー → fail（短すぎ）
✓ 41文字コピー → fail（長すぎ）
```

---

## タスク 2-7: PropertyIntakeAgent 実装 ⭐ Phase 2 中核

```
設計書参照: Part F（エージェント設計・べき等性マトリクス・全 Step）
CLAUDE.md 絶対ルール#9（SkillResult<T>）、#10（HaltingPolicy）
優先度: 最高
見積もり: 5〜8時間（最重要タスク）
```

`lib/agent/PropertyIntakeAgent.ts`:

**HaltingPolicy（ADR-102 必須）:**
```typescript
private readonly MAX_ITERATIONS    = 5
private readonly MAX_DURATION_MS   = 1800000  // 30分
private readonly NO_PROGRESS_LIMIT = 2
private readonly COST_LIMIT_JPY    = 500
```

**8 Step 実装（べき等性マトリクス準拠）:**

| Step | 処理 | MCP | べき等性チェック |
|------|------|-----|----------------|
| 1 | PDF解析（販売図面・間取り図） | mcp_sisliR_pdf | gen_pdf_status='done' ならスキップ |
| 2 | 写真処理（補正・WebP変換） | mcp_sisliR_image | photos/webp/ キー存在チェック |
| 3 | SNSサムネイル生成 | mcp_sisliR_thumbnail | thumbnails/ キー存在チェック |
| 4 | テキスト生成 → QualityChecker | Claude API | gen_copy_status='done' ならスキップ |
| 5 | SEO設定 | mcp_sisliR_seo | gen_seo_status='done' ならスキップ |
| 6 | 成果物並列生成（LP/ポータルCSV/PDF/動画） | mcp_sisliR_lp / portal / doc / video | 各 genStatus チェック |
| 7 | UTM付与・配信準備 | lib/utm/UtmGenerator | べき等（上書き可） |
| 8 | ステータス更新・完了通知 | mcp_sisliR_db | — |

**⚠️ 重要（ADR-059）:** 住宅の壁・柱・窓が変形するImage-to-Videoは絶対に使わない

**⚠️ 重要（コスト管理）:** Higgsfield（課金）は genStatus='done' を厳格確認してから実行

**Integration Test（必須）:**
```
tests/integration/agent/PropertyIntakeAgent.test.ts
✓ 同一 propertyId で 2回実行 → Higgsfield は 1回のみ課金
✓ Step 3 完了後 Step 4 失敗 → 再実行で Step 1〜3 はスキップ
✓ COST_LIMIT_JPY 超過 → HaltingPolicy で停止
✓ MAX_ITERATIONS 超過 → 停止・エラーログ
```

---

## タスク 2-8: RelightEngine 実装

```
設計書参照: Part NN（NN.5.3 RelightEngine 実装可能版）、Part K
優先度: 高
見積もり: 2〜3時間
```

```bash
npm install gsap@4
```

`apps/runtime/lib/RelightEngine.ts`:

**6時間帯プリセット（TIME_PRESETS）:**
```typescript
const TIME_PRESETS = {
  dawn:        { sunAzimuth: 90,  sunElevation: 5,  temp: 3500, intensity: 0.6 },
  morning:     { sunAzimuth: 120, sunElevation: 30, temp: 5500, intensity: 1.0 },
  midday:      { sunAzimuth: 180, sunElevation: 70, temp: 6500, intensity: 1.4 },
  afternoon:   { sunAzimuth: 240, sunElevation: 45, temp: 5800, intensity: 1.1 },
  golden_hour: { sunAzimuth: 270, sunElevation: 8,  temp: 3200, intensity: 0.9 },
  dusk:        { sunAzimuth: 300, sunElevation: 2,  temp: 2800, intensity: 0.4 },
}
```

**実装メソッド:**
- `setPreset(preset: TimePreset)` — 即時切り替え
- `transitionTo(preset, duration)` — GSAP 4 スムーズ遷移
- `burst(multiplier, duration)` — 感情ピーク演出（LDK入室時等）

---

## タスク 2-9: CameraSystem 実装（ScrollTrigger連動）

```
設計書参照: Part NN（NN.5.4 CameraSystem 実装可能版）
優先度: 高
見積もり: 2〜3時間
```

`apps/runtime/lib/CameraSystem.ts`:

**CatmullRomCurve3 + ScrollTrigger:**
```typescript
gsap.registerPlugin(ScrollTrigger)
// scrub: 1.5（1.5秒のスムージング）
// 感情ピーク検出: progress 30〜40% でCTA表示
```

**注意（NN.9 フェーズ3 優先15 準拠）:**
フェーズ3で ScrollCinemaEngine（Part TT）との統合を行う。
このフェーズでは `CameraSection[]` ベースの独立実装。統合時に interface を揃えること。

---

## タスク 2-10: LP ランタイムページ実装

```
設計書参照: Part NN（NN.6.2 LP表示時の自動免責文挿入）、Part K
優先度: 高
見積もり: 2〜3時間
```

`apps/lp/[propertyId]/page.tsx`（Next.js サーバーコンポーネント）:

**自動免責文（structureSource 別）:**
```typescript
function getDisclaimerText(scene: SceneConfig): string {
  const source = scene.property.structureSource
  const acc    = scene.property.structureAccuracy
  if (source === 'procedural')
    return '※ 建物の外観・内観はイメージCGであり、実際の物件とは異なります。'
  if (source === 'floorplan_claude_vision')
    return `※ 間取り図をAI（Claude Vision）が解析し自動生成（精度 約${Math.round(acc * 100)}%）。実際の寸法・仕様は重要事項説明書をご確認ください。`
  if (source === 'bim_ifc')
    return '※ BIM設計データから生成。竣工後の実際と差異が生じる場合があります。'
  return '※ 実際の物件と表示内容が異なる場合があります。'
}
```

---

## タスク 2-11: SectionBeacon 実装

```
設計書参照: Part X（セクション別行動計測）、Part T（反響計測）
優先度: 高
見積もり: 1〜2時間
```

`apps/runtime/lib/SectionBeacon.ts`:

**デバウンス設計（重複カウント防止）:**
- 上スクロール時の再入場はカウントしない
- iOS Safari: `sendBeacon` → `fetch + keepalive` フォールバック
- エンドポイント: `POST /api/beacon`（個人情報: SHA-3ハッシュのみ保存・ADR-064）

---

## タスク 2-12: Claude Vision 間取り解析 pg-boss ジョブ

```
設計書参照: Part NN（NN.4.1 変換層 Job: extract_floor_plan）
優先度: 高
見積もり: 2時間
```

`lib/jobs/extractFloorPlan.ts` — pg-boss ジョブ定義:

```typescript
export async function registerFloorPlanJob(boss: PgBoss) {
  await boss.work('extract_floor_plan', async (job) => {
    const { propertyId, pdfUrl } = job.data
    const span = tracer.startSpan('job.extract_floor_plan')
    try {
      const result = await FloorplanAnalyzer.analyze(pdfUrl)
      // structureAccuracy に基づきルーティング判定
      // auto_approved → 直接 Scene JSON に保存
      // master_review → マスター管理画面キューへ
      // manual_required → スタッフ確認待ちフラグ
      await db.update(scenes)
        .set({ sceneJson: merged, updatedAt: new Date() })
        .where(eq(scenes.propertyId, propertyId))
      span.setStatus({ code: SpanStatusCode.OK })
    } catch (e) {
      span.recordException(e as Error)
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw e
    } finally {
      span.end()
    }
  })
}
```

---

## フェーズ2 完了チェック

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e  # LP表示・CTA動作

# 手動確認
# ✓ PropertyIntakeAgent: 30分以内に全 Step 完了
# ✓ LP ページ: Three.js シーン + 免責文 表示
# ✓ SectionBeacon: behavior_logs にデータ蓄積
# ✓ ScoreEngine: リアル物件データで70点以上
```

---

---

# フェーズ 3 — WebGPU演出 + Growth Loop（Week 9〜12）
## performance +10点 / 全項目100点達成

---

## タスク 3-1: GaussianSplatRenderer 実装（SPZ4 + LOD）

```
設計書参照: Part NN（NN.9 フェーズ3 優先14）、Part I（3Dキャプチャ）
ADR-162.1: WebGPU前提の感動演出。レンダラー切替は不要（フェーズ0から両対応済み）
優先度: 最高
見積もり: 4〜5時間
```

```bash
npm install @mkkellogg/gaussian-splats-3d
```

`apps/runtime/lib/GaussianSplatRenderer.ts`:

**SPZ4 ローダー + LOD ストリーミング:**
- 近距離: フル解像度 SPZ4
- 遠距離: 間引きレンダリング
- 読み込み中: プログレッシブ表示（骨格 → 詳細）

**Gaussian Splat × WebGPURenderer の統合:**
- `THREE.WebGPURenderer` のパスでのみ Splat 高品質描画
- WebGL2 フォールバック時は GLB に自動切替

---

## タスク 3-2: ScrollCinemaEngine 実装（Part TT 統合）

```
設計書参照: Part NN（NN.9 フェーズ3 優先15）
優先度: 高
見積もり: 3〜4時間
```

`apps/runtime/engines/ScrollCinemaEngine.ts`:

**フェーズ2 CameraSystem との統合（必須）:**
```typescript
// CameraSection型（フェーズ2）と CameraKeyframe型（Part TT）を一本化
// apps/runtime/lib/CameraSystem.ts のインターフェースを
// ScrollCinemaEngineの CameraKeyframe 型に合わせて確定させること
```

**キーフレーム型スクロール駆動（scrub=true）:**
- GSAP ScrollTrigger で `scrub: 1.5`
- セクション到達時に感情ピーク演出（RelightEngine.burst()）

---

## タスク 3-3: PostFXEngine 実装（TSL シェーダー）

```
設計書参照: Part NN（NN.9 フェーズ3 優先16）、Part MM v5.3
優先度: 高
見積もり: 3〜4時間
```

`apps/runtime/lib/PostFXEngine.ts`:

**10種プリセット × TSL（WebGPU前提）:**
```typescript
const POST_FX_PRESETS = [
  'cinematic', 'golden_hour', 'blue_hour', 'misty_morning',
  'warm_interior', 'cool_modern', 'vibrant_resort',
  'monochrome_luxury', 'natural_light', 'dramatic_dusk'
]
```

**Three.js TSL（Transpiler Shader Language）:**
- WebGPU 環境: TSL ノードベース実装
- WebGL2 フォールバック: GLSL シェーダー互換実装

---

## タスク 3-4: AIコパイロット（エディタ内）

```
設計書参照: Part NN（NN.9 フェーズ3 優先17）、Part MM v5.3 AiCopilot
ADR-163: テナントプラン別月次上限
優先度: 高
見積もり: 3〜4時間
```

```bash
npm install ai@4  # Vercel AI SDK v4
```

`apps/web/app/editor/_components/AiCopilot.tsx`:

**Claude Sonnet 4（claude-sonnet-4-6）を使用:**
- エディタ内 AIコパイロット（Scene JSON の mutable フィールドを自動提案）
- `LoopCostTracker` 統合: テナントプラン別月次上限チェック
  - Starter プラン: 月 ¥5,000 上限
  - Growth プラン: 月 ¥20,000 上限
  - Enterprise: カスタム

---

## タスク 3-5: GrowthLoopBridge + ABテスト自動昇格

```
設計書参照: Part QQ（ABテストエンジン完全設計書）、Part NN NN.9 優先18
ADR-072: p<0.05 + サンプルサイズ下限（variants別50セッション以上）
優先度: 高
見積もり: 5〜6時間
```

```bash
# mcp_sisliR_abtest 実装
# apps/mcp/src/servers/mcp_sisliR_abtest/index.ts
```

**ABSignificanceEngine（カイ二乗検定）:**
```typescript
// p<0.05 + 各バリアント 50セッション以上 → 勝者自動デプロイ
// WinnerPatternService → winning_patterns テーブルに蓄積
// 次回生成時に物件種別 × コンテンツタイプ別の勝者パターンを参照
```

**4タイプ × 物件種別 ABテスト:**
- `lp` — キャッチコピー / ヒーロー画像 / CTA文言 / セクション順序
- `sns_thumbnail` — デザインパターン / テキスト有無 / 色調
- `video` — スタイルプリセット / 冒頭3秒 / BGMタイプ
- `delivery_time` — 配信曜日 × 時間帯

**Integration Test:**
```
tests/integration/abtest/ABSignificanceEngine.test.ts
✓ p≥0.05 → 勝者未確定
✓ p<0.05 + 50セッション以上 → 自動昇格
✓ 物件種別が異なる → 別々のwinning_patterns
```

---

## タスク 3-6: OrchestrationLoop 実装

```
設計書参照: Part DD（OrchestrationLoop設計）、Part EE（ループテスト戦略）
ADR-102: HaltingPolicy / ADR-101: LoopCostTracker
優先度: 高
見積もり: 3〜4時間
```

`lib/loop/OrchestrationLoop.ts`:

**pg-boss cron 登録（5分間隔）:**
```typescript
await boss.schedule('orchestration_loop', '*/5 * * * *', {})
```

**LOOP_EMERGENCY_STOP 緊急停止:**
```typescript
if (process.env.LOOP_EMERGENCY_STOP === 'true') {
  logger.warn({ event: 'loop.emergency_stop' })
  return
}
```

**自律シグナル検知:**
- `improvement_queue` 待ち件数 > 0 → ImprovementAgent 起動
- LP P95 レイテンシ > 2500ms → 最適化ジョブ投入
- AB テスト有意差確定 → GrowthLoopBridge 経由で自動デプロイ

---

## タスク 3-7: Load Test + SLO 確認

```
設計書参照: Part AA.4（Load Test設定）、Part BB.3（SLO/SLI定義）
優先度: 高（週次 CI で実行）
見積もり: 2時間
```

```bash
npm install -g k6
```

`tests/load/lp_load.js`:

```javascript
export const options = {
  scenarios: {
    lp_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m',  target: 100 },
        { duration: '30s', target: 0 },
      ],
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // LP読み込み P95 < 2秒（SLO）
    http_req_failed:   ['rate<0.001'],  // エラー率 0.1% 以下
  },
}
```

---

## タスク 3-8: Chrome 拡張機能（Part GG）

```
設計書参照: Part GG（ポータル自動入力 Chrome拡張機能設計）
優先度: 中
見積もり: 4〜5時間
```

`apps/mcp/src/servers/mcp_sisliR_db/index.ts` に Extension API エンドポイント追加:
- `GET /api/extension/properties` — 認証済みテナントの物件一覧
- `POST /api/extension/autofill` — ポータルサイト自動入力データ返却

Chrome Extension（Manifest V3）:
- SUUMO / HOME'S / at home の入稿フォームを自動検出・入力
- `content_script` でフォームフィールド認識 → SisliR データ流し込み

---

## フェーズ3 完了チェック

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:load    # SLO確認

# 手動確認
# ✓ Gaussian Splat LP: WebGPU環境でSPZ4ロード・表示
# ✓ PostFX 10種プリセット切り替え動作
# ✓ ScrollCinemaEngine: スクロール連動カメラ移動
# ✓ ABテスト: 有意差確定で自動デプロイ
# ✓ ScoreEngine: 実装完了物件で100点達成
# ✓ LP P95: < 2000ms（SLO達成）
```

---

---

# よく使うコマンド集

```bash
# ── 開発 ────────────────────────────────────────
npm run dev           # 全アプリ起動（Turborepo）
npm run dev:web       # ダッシュボードのみ
npm run dev:runtime   # LP Runtimeのみ
npm run worker:start  # pg-boss ワーカー起動

# ── 型・Lint ─────────────────────────────────────
npm run typecheck     # tsc --noEmit（全パッケージ）
npm run lint          # ESLint

# ── テスト ──────────────────────────────────────
npm run test:unit          # Vitest Unit
npm run test:integration   # Vitest Integration
npm run test:e2e           # Playwright E2E
npm run test:coverage      # カバレッジ（目標80%以上）
k6 run tests/load/lp_load.js  # SLO確認 Load Test

# ── DB ──────────────────────────────────────────
npm run db:migrate    # Drizzle migration 実行
npm run db:push       # スキーマ直接 push（開発環境のみ）
npm run db:studio     # Drizzle Studio 起動

# ── 緊急停止 ────────────────────────────────────
# 全ループ即停止（環境変数）
LOOP_EMERGENCY_STOP=true

# Supabase SQL Editor で実行中ジョブ停止
UPDATE jobs SET state='failed'
WHERE name LIKE 'agent-%' AND state IN ('created', 'active');

# コスト発生源確認
SELECT task, provider, SUM(cost_jpy), COUNT(*)
FROM api_cost_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY task, provider ORDER BY 3 DESC;
```

---

---

# 100点達成チェックリスト

```
ScoreEngine 7項目 × 各最高評価に必要な実装完了状態:

□ structure (20点)
  □ FloorplanAnalyzer が rooms / walls / openings を生成
  □ northAngle が設定されている
  □ structureSource = 'floorplan_claude_vision' または 'bim_ifc'

□ compliance (20点)
  □ property.address 設定
  □ property.buildingArea または landArea 設定
  □ property.layoutDescription 設定（「3LDK」等）
  □ AI画像ラベル設定（aiImageLabeled）
  □ 精度免責文設定（accuracyDisclaimer）
  □ 方位設定（northAngle → northAngleSet）

□ assets (15点)
  □ structureSource='bim_ifc' → 15点
  □ structureSource='floorplan_claude_vision' + acc≥0.85 → 12点
  □ SPZ4 または GLB アセット登録済み

□ emotionDesign (15点)
  □ lpTemplate.type 設定（物件種別テンプレート）
  □ lpTemplate.startTimePreset 設定（例: 'golden_hour'）
  □ presentation.postFX.preset ≠ 'none' 設定

□ aiContent (10点)
  □ seo.title 設定
  □ seo.description 設定
  □ seo.structuredData 設定（schema.org/PropertyListing JSON-LD）
  □ ai.faqItems: 5件以上

□ performance (10点)
  □ LP P95 < 2000ms（Load Test で確認）
  □ SPZ4 ファイルサイズ最適化
  □ ISR 有効（revalidatePath 動作確認）

□ cta (10点)
  □ ctaConfig.primaryCTA.label 設定
  □ ctaConfig.secondaryCTA.label 設定
  □ ctaConfig.lineEnabled = true
```

---

## ADR 参照マップ

| ADR | 内容 | 関連タスク |
|-----|------|----------|
| ADR-013 | Supabase Auth（Clerk不採用） | タスク 0-7 |
| ADR-046 | pg-boss 10.x（Redis不採用） | タスク 0-8 |
| ADR-059 | 壁・柱変形 Image-to-Video 禁止 | タスク 2-7 |
| ADR-064 | 個人情報 SHA-3 ハッシュのみ | タスク 2-11 |
| ADR-072 | ABテスト p<0.05 + 50セッション | タスク 3-5 |
| ADR-091 | OpenTelemetry（Sentry不採用） | タスク 0-7 |
| ADR-092 | Scene JSON 後方互換ポリシー | タスク 1-3 |
| ADR-100 | テストデータファクトリー必須 | タスク 1-4 |
| ADR-101 | LoopCostTracker | タスク 3-4, 3-6 |
| ADR-102 | HaltingPolicy 全ループ必須 | タスク 2-7, 3-6 |
| ADR-136 | ImmutablePropertySchema | タスク 0-3 |
| ADR-137 | ProceduralMeshBuilder = structure のみ入力 | タスク 0-4 |
| ADR-138 | ComplianceChecker 必須ミドルウェア | タスク 0-5, 1-8 |
| ADR-139 | WebGL2 フォールバック | タスク 1-7 |
| ADR-140 | immutable Mesh の TransformControls 操作不可 | タスク 1-7 |
| ADR-141 | structure/compliance が最高配点 | タスク 0-6 |
| ADR-143 | 実装順序: Zodスキーマ→ProceduralMesh→ScoreEngine→エディタ→LP | 全体 |
| ADR-144 | FloorplanVLM 廃止 → Claude Vision | タスク 2-4 |
| ADR-151 | Claude Vision 精度閾値ルーティング | タスク 2-4, 2-12 |
| ADR-160 | structureSource='floorplan_claude_vision' | タスク 0-3 |
| ADR-162.1 | WebGPURenderer 標準・WebGL2 自動フォールバック | タスク 1-7, 3-1 |
| ADR-163 | テナントプラン別 AI コスト月次上限 | タスク 3-4 |
| ADR-168/169 | Higgsfield 月額サブスク + クレジット監視 | タスク 2-7 |
| ADR-170 | gpt-image-1（画像生成 Part SS） | タスク 2-7 |
| ADR-173〜179 | Part QQ ABテスト自動昇格 | タスク 3-5 |

---

*SisliR v10.1 — Claude Code 実装ロードマップ 100点版 v1.0*  
*生成日: 2026年6月15日*
