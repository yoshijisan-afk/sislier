# SisliR v10.1 — Claude Code プロジェクト指示書

> **このファイルはリポジトリルートに配置してください。**  
> Claude Code はセッション開始時に自動的に読み込みます。

---

## プロジェクト概要

SisliR は **AI住宅マーケティングOS + 住宅デジタルツイン基盤** です。

```
素材を1回登録するだけで
Claudeエージェントが全マーケティング成果物を30分で自動生成し
集客・反響・改善ループを自律的に回し続ける。
```

**設計5原則（必ず意識して実装すること）**

| 原則 | 意味 |
|------|------|
| Asset First | 素材（写真・動画・図面・SPZ）が唯一の Source of Truth |
| Agent First | 人間が操作するのは「生成ボタン」1回のみ |
| Digital Twin First | 全物件は Scene JSON + OpenUSD として管理 |
| Growth Loop First | 集客→反響→学習→改善の自律ループが最上位概念 |
| Observable First | 全処理に OpenTelemetry スパンを設定。測定できないものは改善できない |

---

## 設計書の場所

```
docs/design/
  SisliR_v10_partAE.md      # Part A〜E（ビジョン・技術スタック・スキーマ）
  SisliR_v10_partFM.md      # Part F〜M（エージェント・MCP・DB設計）
  SisliR_v10_partNR.md      # Part N〜R（セキュリティ・ADR）
  SisliR_v10_partSZ.md      # Part S〜Z（集客・反響・改善ループ）
  SisliR_v10_partAA_CC.md   # Part AA〜CC（テスト・可観測性・運用）
  SisliR_v10_1_partDD_EE_FF.md  # Part DD〜FF（OrchestrationLoop・v10.1新規）
  SisliR_v10_1_partGG.md    # Part GG（Chrome拡張機能）
  SisliR_v10_1_partLL_ImmersiveLP_DesignSpec.md  # Part LL（Immersive LP 物件種別テンプレート）
  SisliR_v10_1_partMM_LPEditor_DesignSpec_v5.1.md  # Part MM（エディタ v5.1）
  SisliR_v10_1_partNN_IntegratedSpec_100point_v1.1.md  # Part NN（統合設計書・Scene JSON・ScoreEngine）
  SisliR_v10_1_partOO_MasterAdmin.md  # Part OO（マスター管理画面・受注ワークフロー・Claude Vision移行）
  SisliR_v10_1_partPP_TenantLPFlow.md  # Part PP（テナントUI・LP作成・反響管理）
  SisliR_v10_1_partQQ_ABTestEngine.md  # Part QQ（ABテスト統合基盤・mcp_sisliR_abtest）
  SisliR_v10_1_partRR_VideoCostOpsPolicy.md  # Part RR（動画生成コスト運用ポリシー）※要追加
  SisliR_v10_1_partSS_PhotoAIEditPolicy.md  # Part SS（生成AI画像編集オプション機能・v10.1新規）
```

**実装前に必ず関連 Part を読んでから着手すること。**

---

## モノレポ構成

```
sisliR/
├── apps/
│   ├── web/          # Next.js 15 ダッシュボード（App Router）
│   ├── runtime/      # LP Runtime（Three.js r184 WebGPU）
│   └── mcp/          # MCPサーバー群（14サーバー）
├── packages/
│   ├── shared/       # 共通型・スキーマ・ファクトリー
│   │   ├── schemas/  # scene.ts（Scene JSON v10.0 Zodスキーマ）
│   │   └── testing/  # factories.ts（テストデータファクトリー）
│   └── ui/           # 共通UIコンポーネント（Tailwind CSS 4.x）
├── lib/
│   ├── agent/        # PropertyIntakeAgent, ImprovementAgent
│   ├── loop/         # OrchestrationLoop, AgentLoop, SkillRouter
│   ├── skills/       # Skill Library（再利用可能スキル群）
│   ├── ai/           # provider.ts（LLM抽象化）
│   ├── video/        # VideoGeneratorRouter
│   ├── thumbnail/    # ThumbnailGenerator
│   ├── seo/          # StructuredDataGenerator, VideoSitemapGenerator
│   ├── utm/          # UtmGenerator
│   ├── analytics/    # UtmAggregator
│   ├── cost/         # CostMonitor, LoopCostTracker
│   └── observability/# tracer.ts, logger.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── load/
├── CLAUDE.md         # ← このファイル
└── drizzle/          # DB マイグレーション
```

---

## 技術スタック（確定版・変更禁止）

| カテゴリ | 技術 | バージョン |
|----------|------|-----------|
| 言語 | TypeScript | 5.x（strict mode必須） |
| フレームワーク | React | 19.x |
| ビルド | Vite | 6.x |
| APIサーバー | Next.js | 15.x（App Router） |
| 3Dエンジン | Three.js WebGPU | r184 |
| アニメーション | GSAP | 4.x |
| ORM | Drizzle ORM | 0.30.x |
| DB | Supabase PostgreSQL | 最新 |
| 認証 | Supabase Auth | 最新 |
| ジョブキュー | **pg-boss 10.x**（Redisなし） | 10.x |
| アセット | Cloudflare R2 | 最新 |
| スキーマ検証 | Zod | v4 |
| コアAI | claude-sonnet-4-20250514 | — |
| 軽量AI | claude-haiku-4-5-20251001 | — |
| 埋め込み | voyage-3（1024次元） | — |
| 可観測性 | OpenTelemetry + Grafana Cloud | 最新 |
| スタイリング | Tailwind CSS | 4.x |

**不採用技術（絶対に使わないこと）**

- ❌ Clerk → Supabase Auth を使う（ADR-013）
- ❌ BullMQ / Redis → pg-boss 10.x を使う（ADR-046）
- ❌ Sentry / LogRocket → OpenTelemetry を使う（ADR-091）
- ❌ Pinecone → Supabase pgvector を使う
- ❌ Remotion → OpenCut MCP を使う
- ❌ Theatre.js → GSAP 4.x を使う

---

## 絶対ルール（全実装で必ず守ること）

### 1. TypeScript strict mode
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}

// ❌ 禁止
const data: any = response.json()

// ✅ 許可
const data: unknown = response.json()
// 型ガードで絞り込んでから使う
```

### 2. Scene JSON は必ず Zod バリデーション
```typescript
// ✅ 正しい
import { SceneSchema, adaptSceneJson } from '@/packages/shared/schemas/scene'

const result = SceneSchema.safeParse(raw)
if (!result.success) throw new Error(result.error.message)

// 古いバージョンのJSONを扱う場合
const scene = adaptSceneJson(rawJson)  // v8→v10自動変換
```

### 3. DB操作は Drizzle ORM のみ（raw SQL 禁止）
```typescript
// ❌ 禁止
await supabase.rpc('raw_query', { sql: 'SELECT * FROM ...' })

// ✅ 正しい
const result = await db
  .select()
  .from(properties)
  .where(eq(properties.tenantId, tenantId))
```
**例外**: `supabase.rpc()` は設計書に定義された RPC 関数のみ使用可（`find_no_lead_properties` 等）

### 4. 個人情報の平文保存禁止
```typescript
// ❌ 禁止（ADR-064 / ADR-098）
await db.insert(leads).values({ email: body.email })

// ✅ 正しい（SHA-3ハッシュのみ保存）
import { sha3WithSalt } from '@/lib/security/hash'
const anonymizedHash = await sha3WithSalt(body.email ?? body.phone ?? '')
await db.insert(leads).values({ anonymized_hash: anonymizedHash })
```

### 5. 外部API呼び出しは必ず OpenTelemetry スパンで囲む
```typescript
import { tracer } from '@/lib/observability/tracer'
import { SpanStatusCode } from '@opentelemetry/api'

// ✅ 正しい
async function callExternalApi() {
  const span = tracer.startSpan('external.api.name')
  try {
    const result = await fetch(...)
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (e) {
    span.recordException(e as Error)
    span.setStatus({ code: SpanStatusCode.ERROR })
    throw e
  } finally {
    span.end()
  }
}
```

### 6. ログは logger を使う（console.log 禁止）
```typescript
// ❌ 禁止
console.log('処理開始', propertyId)
console.error('エラー', error)

// ✅ 正しい
import { logger } from '@/lib/observability/logger'
logger.info({ event: 'agent.step', step: 'photo', property_id: propertyId })
logger.error({ event: 'agent.error', err: { message: error.message } })
```

### 7. テストを必ず書く
- 新しい関数・クラスには必ず Unit Test を 1 本以上
- API エンドポイントには Integration Test
- 重要なビジネスロジックは複数ケースをカバー
- テストデータは `packages/shared/testing/factories.ts` を使う

### 8. MCPサーバーの命名規則
```
apps/mcp/src/servers/mcp_sisliR_{name}/
```
14サーバー: `db`, `storage`, `pdf`, `image`, `lp`, `portal`, `doc`, `video`, `usd`, `thumbnail`, `seo`, `distribute`, `analytics`, `abtest`

### 9. Skill は SkillResult<T> を返す（例外を外に漏らさない）
```typescript
// ADR-104: Skillは例外をスローしない
// ✅ 正しい
export async function regenerateCatchCopy(propertyId: string): Promise<SkillResult<string>> {
  try {
    const copy = await generateCopy(propertyId)
    return { ok: true, value: copy }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ❌ 禁止
export async function regenerateCatchCopy(propertyId: string): Promise<string> {
  return generateCopy(propertyId)  // 例外が外に漏れる
}
```

### 10. HaltingPolicy を全ループに設定（ADR-102）
```typescript
// ✅ AgentLoop の実装では必ずこの定数を設定
private readonly MAX_ITERATIONS   = 5
private readonly MAX_DURATION_MS  = 1800000  // 30分
private readonly NO_PROGRESS_LIMIT = 2
private readonly COST_LIMIT_JPY   = 500
```

### 11. 宅建業法準拠チェック
```typescript
// キャッチコピー生成後は必ず品質チェック
import { QualityChecker } from '@/lib/agent/QualityChecker'
const check = new QualityChecker().checkCatchCopy(copy)
if (!check.passed) {
  // 禁止語が含まれる場合は再生成 or エラー
}
```

---

## RLS（Row Level Security）必須テーブル

以下のテーブルへの操作は、必ず認証済みユーザーとして行うこと。  
サーバーサイドで `service_role` を使う場合は意図を明記すること。

```
properties, scenes, leads, utm_tracking, ab_variants,
thumbnail_logs, improvement_queue, seo_configs, agent_runs,
api_cost_logs, behavior_logs
```

`builders` テーブルは RLS 不要（公開情報、ADR-081）。

---

## 環境変数（必須）

```bash
# Supabase（新形式・2026年Q4移行済みであること）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # 旧: SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=                    # 旧: SUPABASE_SERVICE_ROLE_KEY

# AI
ANTHROPIC_API_KEY=
AI_TIMEOUT_MS=120000

# 動画生成（VideoGeneratorRouter フォールバック順）
HIGGSFIELD_API_KEY=
HIGGSFIELD_DISABLE=false
RUNWAY_API_KEY=
KLING_API_KEY=
VIDEO_PROVIDER_PRIORITY=higgsfield,runway,kling,opencut,ffmpeg

# ストレージ
CLOUDFLARE_R2_ENDPOINT=
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=sisliR-assets
LOCAL_PROJECTS_DIR=D:\SisliR_Projects

# 生成AI画像編集（オプトイン機能・Part SS参照）
OPENAI_API_KEY=
PHOTO_AI_EDIT_MONTHLY_LIMIT_GROWTH=10
PHOTO_AI_EDIT_MONTHLY_LIMIT_PREMIUM=50

# 可観測性
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=
GRAFANA_CLOUD_TOKEN=

# ループ
LOOP_EMERGENCY_STOP=false  # trueで全ループ即停止

# スキーマ検証モード
SCENE_VALIDATE_MODE=strict  # 移行中のみ lenient
```

---

## よく使うコマンド

```bash
# 開発
npm run dev           # 全アプリ起動（Turborepo）
npm run dev:web       # ダッシュボードのみ
npm run dev:runtime   # LP Runtimeのみ

# 型チェック・Lint
npm run typecheck     # tsc --noEmit（全パッケージ）
npm run lint          # ESLint

# テスト
npm run test:unit          # Vitest Unit
npm run test:integration   # Vitest Integration（Supabase接続必要）
npm run test:e2e           # Playwright E2E
npm run test:coverage      # カバレッジレポート（目標80%以上）

# DB
npm run db:migrate    # Drizzle migration 実行
npm run db:push       # スキーマ変更を直接 push（開発環境のみ）
npm run db:studio     # Drizzle Studio 起動

# pg-boss
npm run worker:start  # pg-boss ワーカー起動（エージェント実行）
```

---

## ファイル命名規則

```
# エージェント
lib/agent/{Name}Agent.ts          例: PropertyIntakeAgent.ts

# ループ
lib/loop/{Name}Loop.ts            例: OrchestrationLoop.ts
lib/loop/{Name}Router.ts          例: SkillRouter.ts

# スキル
lib/skills/{domain}Skills.ts      例: improvementSkills.ts

# MCPサーバー
apps/mcp/src/servers/mcp_sisliR_{name}/
  index.ts                        # MCPサーバーエントリポイント
  tools/                          # ツール定義

# テスト
tests/unit/{ModuleName}.test.ts
tests/integration/{feature}/{name}.test.ts
tests/e2e/{feature}.spec.ts

# DBマイグレーション
drizzle/migrations/YYYYMMDD_{description}.sql
```

---

## Scene JSON バージョンポリシー

- **現行バージョン**: `10.0.0`
- **後方互換性ポリシー（ADR-092）**: 非破壊的追加のみ許可
  - ✅ 新フィールド追加（オプショナルまたはデフォルト値あり）
  - ❌ 既存フィールドの削除・型変更・必須化

古いバージョンの JSON を扱う場合:
```typescript
import { adaptSceneJson } from '@/lib/schema/SceneAdapter'
const scene = adaptSceneJson(rawJson)  // v8→v10自動変換
```

---

## OrchestrationLoop 緊急停止手順

コスト爆発・無限ループが疑われる場合:

```bash
# 1. 緊急停止フラグを設定（Vercel/Cloudflare環境変数）
LOOP_EMERGENCY_STOP=true

# 2. 実行中ジョブを停止
# Supabase SQL Editor で実行:
UPDATE jobs SET state='failed'
WHERE name LIKE 'agent-%' AND state IN ('created', 'active');

# 3. コスト発生源を確認
SELECT task, provider, SUM(cost_jpy), COUNT(*)
FROM api_cost_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY task, provider ORDER BY 3 DESC;
```

---

## AI モデル使い分け

| タスク | モデル |
|--------|--------|
| PropertyIntakeAgent 全般 | claude-sonnet-4-20250514 |
| コピー生成・図面解析・品質判定 | claude-sonnet-4-20250514 |
| 単純分類・SEOキーワード生成 | claude-haiku-4-5-20251001 |
| RAGコンシェルジュ応答 | claude-haiku-4-5-20251001 |
| A/Bテスト精度比較 | gemini-2.5-pro / gpt-4.1 |

```typescript
// lib/ai/provider.ts の callAI() を使う
// taskパラメータで自動的に適切なモデルが選択される
const result = await callAI({
  task: 'copy',       // 'extraction'|'copy'|'classification'|'video_prompt'|'quality_score'
  system: SYSTEM_PROMPT,
  user: userPrompt,
})
```

---

## 動画生成フォールバック順序

```
Higgsfield MCP（シネマティック）
  ↓ 障害時 / クレジット残量10%未満
Runway Gen-4 API（ADR-090）
  ↓ 障害時
Kling AI API（ADR-090）
  ↓ 障害時
OpenCut MCP（スライドショーに格下げ）
  ↓ 障害時
ffmpeg（最終手段）
```

**重要（ADR-059）**: 住宅の壁・柱・窓が変形する Image-to-Video は絶対に使わない。

**運用ポリシー（ADR-168 / ADR-169・Part RR参照）**:
- Higgsfieldは月額サブスク（Pro/Ultimate）で運用。クレジット残量を日次監視し、
  30%未満でアラート、10%未満でVIDEO_PROVIDER_PRIORITYをOpenCut優先に一時切替。
- 生成動画の効果データ（視聴完了率・CVR）はWinnerPatternServiceに蓄積し、
  四半期ごとに演出パターンをレビューして自社エンジン（OpenCut+GSAP4）への
  移行候補を抽出する。詳細はPart RRを参照。

---

## テストデータファクトリー

```typescript
// 必ずこれを使う（ADR-100）
import {
  createTestProperty,
  createTestScene,
  createTestTenant,
  createTestAgent,
} from '@/packages/shared/testing/factories'

// 使用例
const scene = createTestScene({
  property: createTestProperty({ price: 45000000 }),
})
```

---

## コスト意識

| 操作 | コスト | 対策 |
|------|--------|------|
| Higgsfield 動画生成 | サブスク固定費（Pro: $29/月〜, Part RR参照） | クレジット残量を日次監視。genStatus確認で重複防止 |
| 生成AI画像編集（ChatGPT4o, Part SS参照） | ¥30〜100/枚（従量） | デフォルトOFF・オプトイン・プラン別月間上限で制御 |
| Claude Sonnet 4 | ~¥800/物件 | 生成済みはスキップ |
| R2 エグレス | 無料 | 問題なし |
| pg-boss リトライ | AI費用が重複しうる | べき等性マトリクス参照 |

**課金系処理（Higgsfield等）は genStatus が 'done' でないことを確認してから実行すること。**

---

*SisliR v10.1 — CLAUDE.md*  
*最終更新: 2026年6月 | v10.1.0*
