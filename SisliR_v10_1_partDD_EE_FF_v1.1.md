---

## Part DD — OrchestrationLoop設計（v10.1新規） {#part-dd}

> **本ファイル更新（v1.1・2026-06-13）**: 完全設計書v10.2との整合確認済み。
> Part DD/EE/FF内にAIモデル文字列の直接記述はなく、モデル選択は完全設計書B.3の
> `claude-sonnet-4-6` / `claude-haiku-4-5` に準拠する（コード内でハードコードしない）。

### DD.1 設計思想：ループが主役になる

```
v10.0までの設計:
  人間 → ダッシュボード「生成」ボタン → PropertyIntakeAgent → 終了

v10.1以降の設計:
  人間 → ループを書く → ループが自律的にAgentを起動し続ける

「あなたはAgentにプロンプトを送るのをやめるべきです。
 Agentにプロンプトを送るループを設計すべきです。」
  — Peter Steinberger, June 7, 2026

SisliR における具体的な意味:
  ✗ 担当者が毎朝ダッシュボードを開いて「改善実行」を押す
  ✓ OrchestrationLoopが24時間、反響データを監視し
    必要なAgentを自律的に起動・検証・完了させる
```

### DD.2 ループ階層設計（3層）

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: OrchestrationLoop（最上位・5分ごとにcron）      │
│  役割: 全物件の状態を監視し、起動すべきAgentを決定する     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Layer 2: AgentLoop（タスク単位・pg-boss管理）     │   │
│  │  役割: 1つのAgentタスクをべき等に完走させる        │   │
│  │                                                   │   │
│  │  ┌───────────────────────────────────────────┐   │   │
│  │  │  Layer 3: ToolLoop（Claude内部・MCP呼び出し）│   │   │
│  │  │  役割: 1ステップをツール呼び出しで解決する    │   │   │
│  │  └───────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### DD.3 OrchestrationLoop 実装

```typescript
// lib/loop/OrchestrationLoop.ts
// pg-bossで5分ごとに実行（ADR-101）

export class OrchestrationLoop {
  private readonly MAX_AGENTS_PER_TICK = 10   // 1ティックあたりの最大起動Agent数
  private readonly LOOP_BUDGET_JPY     = 5000 // 1ティックあたりのAPIコスト上限

  async tick(): Promise<LoopTickResult> {
    const span = tracer.startSpan('loop.orchestration.tick')
    const tickStart = Date.now()

    try {
      // ── 1. コスト上限チェック（Haltingポリシー優先） ────────
      const monthlyCost = await this.getMonthlyApiCost()
      if (monthlyCost.total_jpy >= monthlyCost.budget_jpy * 0.95) {
        span.addEvent('loop.halted.cost_limit')
        logger.warn({ event: 'loop.halted', reason: 'monthly_cost_limit', cost: monthlyCost })
        return { halted: true, reason: 'monthly_cost_limit', agentsStarted: 0 }
      }

      // ── 2. 全物件の状態スキャン ──────────────────────────────
      const signals = await this.scanAllProperties()

      // ── 3. 起動すべきAgentタスクを決定 ──────────────────────
      const tasks = this.decideTasks(signals).slice(0, this.MAX_AGENTS_PER_TICK)

      // ── 4. pg-bossにジョブ投入（重複防止付き） ───────────────
      let agentsStarted = 0
      for (const task of tasks) {
        const enqueued = await this.enqueueIfNotRunning(task)
        if (enqueued) agentsStarted++
      }

      span.setAttributes({ 'loop.agents_started': agentsStarted })
      span.setStatus({ code: SpanStatusCode.OK })

      return { halted: false, agentsStarted, tickDurationMs: Date.now() - tickStart }
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  }

  // ── 物件状態スキャン ────────────────────────────────────────
  private async scanAllProperties(): Promise<PropertySignal[]> {
    const signals: PropertySignal[] = []

    // シグナル1: 公開後72時間でリードゼロ
    const noLeadProperties = await supabase.rpc('find_no_lead_properties', {
      hours_since_publish: 72
    })
    for (const p of noLeadProperties.data ?? []) {
      signals.push({ propertyId: p.id, trigger: 'no_lead_72h', priority: 10 })
    }

    // シグナル2: 高直帰率（> 80%・48時間）
    const highBounceProperties = await supabase.rpc('find_high_bounce_properties', {
      bounce_threshold: 0.8, hours: 48
    })
    for (const p of highBounceProperties.data ?? []) {
      signals.push({ propertyId: p.id, trigger: 'high_bounce', priority: 8 })
    }

    // シグナル3: 価格セクション離脱率高い
    const priceDropoutProperties = await supabase.rpc('find_price_dropout_properties', {
      dropout_threshold: 0.7, hours: 48
    })
    for (const p of priceDropoutProperties.data ?? []) {
      signals.push({ propertyId: p.id, trigger: 'price_section_dropout', priority: 7 })
    }

    // シグナル4: A/Bテストの統計的有意差確認
    const abReadyVariants = await supabase.rpc('find_ab_significant_variants')
    for (const v of abReadyVariants.data ?? []) {
      signals.push({ propertyId: v.property_id, trigger: 'ab_test_winner', priority: 9 })
    }

    // シグナル5: improvement_queueの承認済みアイテム
    const approvedImprovements = await supabase
      .from('improvement_queue')
      .select('property_id')
      .eq('status', 'waiting_approval')  // 担当者が承認済み → runningに変更
      .eq('human_approved', true)
    for (const item of approvedImprovements.data ?? []) {
      signals.push({ propertyId: item.property_id, trigger: 'manual', priority: 10 })
    }

    // 優先度順にソート
    return signals.sort((a, b) => b.priority - a.priority)
  }

  // ── タスク決定ロジック ──────────────────────────────────────
  private decideTasks(signals: PropertySignal[]): AgentTask[] {
    return signals.map(s => ({
      jobName:    `agent-${s.trigger}`,
      propertyId: s.propertyId,
      trigger:    s.trigger,
      priority:   s.priority,
    }))
  }

  // ── 重複起動防止付きエンキュー ──────────────────────────────
  private async enqueueIfNotRunning(task: AgentTask): Promise<boolean> {
    const boss = await getBoss()

    // 同一propertyId + jobNameが既に実行中または待機中なら投入しない
    const existing = await boss.getJobById(
      task.jobName,
      `${task.propertyId}_${task.trigger}`
    )
    if (existing && ['created', 'active'].includes(existing.state)) {
      return false
    }

    await boss.send({
      name:    task.jobName,
      data:    { propertyId: task.propertyId, trigger: task.trigger },
      options: {
        id:          `${task.propertyId}_${task.trigger}`,  // 冪等キー
        priority:    task.priority,
        retryLimit:  3,
        retryDelay:  60,
        expireInSeconds: 3600,  // 1時間でタイムアウト（Halting保証）
      },
    })
    return true
  }
}
```

### DD.4 AgentLoop（Layer 2）

```typescript
// lib/loop/AgentLoop.ts
// pg-bossワーカーとして動作。1タスクを完走させる責任を持つ

export class AgentLoop {
  // Haltingポリシー定数（ADR-102）
  private readonly MAX_ITERATIONS   = 5    // 最大反復回数
  private readonly MAX_DURATION_MS  = 1800000  // 最大30分
  private readonly NO_PROGRESS_LIMIT = 2   // 無進捗を2回検知したら停止
  private readonly COST_LIMIT_JPY   = 500  // 1タスクあたりのAPIコスト上限

  async run(task: AgentTask): Promise<AgentLoopResult> {
    const span = tracer.startSpan('loop.agent', {
      attributes: { 'task.trigger': task.trigger, 'property.id': task.propertyId }
    })
    const startTime = Date.now()

    let iteration      = 0
    let noProgressCount = 0
    let lastStateHash  = ''
    let totalCostJpy   = 0

    try {
      while (true) {
        iteration++

        // ── Haltingポリシーチェック（毎イテレーション） ──────────
        const halt = await this.checkHaltConditions({
          iteration, startTime, noProgressCount, totalCostJpy
        })
        if (halt) {
          span.addEvent('loop.halted', { reason: halt.reason, iteration })
          logger.warn({ event: 'agent_loop.halted', ...halt, task })
          await this.recordHalt(task, halt)
          return { status: 'halted', reason: halt.reason, iterations: iteration }
        }

        // ── エージェント実行 ──────────────────────────────────────
        const result = await this.runAgentStep(task, iteration)
        totalCostJpy += result.costJpy

        // ── 進捗チェック（無限ループ検知） ───────────────────────
        const newHash = this.hashState(result.state)
        if (newHash === lastStateHash) {
          noProgressCount++
          span.addEvent('loop.no_progress', { iteration, noProgressCount })
        } else {
          noProgressCount = 0
          lastStateHash   = newHash
        }

        // ── 完了判定 ──────────────────────────────────────────────
        if (result.done) {
          span.setStatus({ code: SpanStatusCode.OK })
          return { status: 'completed', iterations: iteration, costJpy: totalCostJpy }
        }
      }
    } catch (e) {
      span.recordException(e as Error)
      throw e
    } finally {
      span.end()
    }
  }

  private async checkHaltConditions(state: {
    iteration:      number
    startTime:      number
    noProgressCount: number
    totalCostJpy:   number
  }): Promise<{ reason: string } | null> {
    // 条件1: 最大イテレーション超過
    if (state.iteration > this.MAX_ITERATIONS) {
      return { reason: 'max_iterations_exceeded' }
    }
    // 条件2: タイムアウト
    if (Date.now() - state.startTime > this.MAX_DURATION_MS) {
      return { reason: 'timeout' }
    }
    // 条件3: 無進捗検知
    if (state.noProgressCount >= this.NO_PROGRESS_LIMIT) {
      return { reason: 'no_progress_detected' }
    }
    // 条件4: タスクコスト上限
    if (state.totalCostJpy >= this.COST_LIMIT_JPY) {
      return { reason: 'task_cost_limit_exceeded' }
    }
    return null
  }

  // エージェントステップ実行（ImprovementAgentに委譲）
  private async runAgentStep(task: AgentTask, iteration: number): Promise<AgentStepResult> {
    const agent = new ImprovementAgent()
    return agent.runStep(task, iteration)
  }

  // 状態ハッシュ（無進捗検知用）
  private hashState(state: unknown): string {
    return cyrb53(JSON.stringify(state)).toString()
  }
}
```

### DD.5 Skill Library（再利用可能スキル設計）

```
設計原則（ADR-103）:
  「ループから何度も呼ばれる処理はSkillとして定義する。
   Skillは入力→出力が明確で、副作用が宣言されており、
   単独でテスト可能でなければならない。」

Skill ≠ MCPサーバーの直接呼び出し
Skill = 「何をするか」を名前で表現した再利用可能な関数
```

```typescript
// lib/skills/index.ts
// SkillはOrchestrationLoopからもAgentLoopからも呼べる再利用単位

// ──────────────────────────────────────────────────────────
// 反響改善スキル群
// ──────────────────────────────────────────────────────────

export const Skills = {

  // キャッチコピーを再生成して品質チェックまで行う
  regenerateCatchCopy: async (propertyId: string): Promise<SkillResult<string>> => {
    const scene = await getScene(propertyId)
    const copy  = await CopyGenerator.generate(scene.property)
    const check = new QualityChecker().checkCatchCopy(copy)
    if (!check.passed) return { ok: false, error: `品質チェック失敗: ${check.violations}` }
    await updateSceneCatchCopy(propertyId, copy)
    return { ok: true, value: copy }
  },

  // ヒーロー画像をギャラリーの中からClaude Visionで最適選択して差し替え
  swapHeroImage: async (propertyId: string): Promise<SkillResult<string>> => {
    const scene    = await getScene(propertyId)
    const bestUrl  = await PhotoSelector.selectBest(scene.assets.galleryUrls)
    await updateSceneHeroImage(propertyId, bestUrl)
    await regenerateThumbnails(propertyId)  // サムネイルも連動更新
    return { ok: true, value: bestUrl }
  },

  // OGPサムネイルを再生成してR2に再アップロード
  regenerateOgpThumbnail: async (propertyId: string): Promise<SkillResult<string>> => {
    const scene = await getScene(propertyId)
    const buf   = await new ThumbnailGenerator().generate({
      propertyId, sceneJson: scene, baseImageUrl: scene.assets.heroImageUrl!, platform: 'ogp'
    })
    const url = await uploadToR2(propertyId, 'thumbnail/ogp.webp', buf)
    return { ok: true, value: url }
  },

  // 価格セクションに周辺相場情報を追加
  enrichPriceSection: async (propertyId: string): Promise<SkillResult<void>> => {
    const scene   = await getScene(propertyId)
    const comps   = await ComparableSearch.find(scene.property)
    const enriched = await CopyGenerator.enrichPriceSection(scene.property, comps)
    await updateScenePriceSection(propertyId, enriched)
    return { ok: true, value: undefined }
  },

  // A/Bテスト勝者をデフォルトに昇格
  promoteAbWinner: async (propertyId: string): Promise<SkillResult<void>> => {
    const winner = await AbTestManager.getWinner(propertyId)
    if (!winner) return { ok: false, error: '統計的有意差なし' }
    await updateSceneFromVariant(propertyId, winner)
    await supabase.from('ab_variants').update({ is_winner: true }).eq('id', winner.id)
    return { ok: true, value: undefined }
  },

  // LPを再生成・デプロイ（Skill呼び出し後の最終ステップとして使う）
  redeployLp: async (propertyId: string): Promise<SkillResult<string>> => {
    const url = await LpGenerator.generate(propertyId)
    await updateGenStatus(propertyId, { lp: 'done' })
    return { ok: true, value: url }
  },

} satisfies Record<string, (...args: any[]) => Promise<SkillResult<unknown>>>
```

### DD.6 trigger → Skill マッピング

```typescript
// lib/loop/SkillRouter.ts
// OrchestrationLoopがシグナルを受け取ったとき
// どのSkillを何の順序で実行するかを決定するルーター

export const TRIGGER_SKILL_MAP: Record<TriggerType, SkillChain> = {
  no_lead_72h: {
    skills: [
      Skills.regenerateCatchCopy,
      Skills.swapHeroImage,
      Skills.regenerateOgpThumbnail,
      Skills.redeployLp,
    ],
    requiresApproval: true,   // ADR-070: 人間承認を経てから実行
    description:      'リード0のため、コピー・ヒーロー画像を刷新してLP再デプロイ',
  },

  high_bounce: {
    skills: [
      Skills.regenerateCatchCopy,
      Skills.regenerateOgpThumbnail,
      Skills.redeployLp,
    ],
    requiresApproval: true,
    description:      '直帰率高のため、ファーストビューを改善',
  },

  price_section_dropout: {
    skills: [
      Skills.enrichPriceSection,
      Skills.redeployLp,
    ],
    requiresApproval: true,
    description:      '価格セクション離脱率高のため、周辺相場情報を追加',
  },

  ab_test_winner: {
    skills: [
      Skills.promoteAbWinner,
      Skills.redeployLp,
    ],
    requiresApproval: false,  // 統計的有意差確認済みなので自動実行可
    description:      'A/Bテスト勝者を自動昇格',
  },

  hero_dropout: {
    skills: [
      Skills.swapHeroImage,
      Skills.regenerateOgpThumbnail,
      Skills.redeployLp,
    ],
    requiresApproval: true,
    description:      'ヒーロー画像での離脱率高のため、画像を差し替え',
  },

  manual: {
    skills: [],  // improvement_queueのresult_jsonからスキルを動的解決
    requiresApproval: false,  // 担当者が既に承認済み
    description:      '手動承認済みの改善を実行',
  },
}
```

### DD.7 ループの停止保証（Halting Policy）

```
ADR-102 確定: 全ループに以下の3ハードストップを義務付ける

┌───────────────────────────────────────────────────────────┐
│  Halting Policy（SisliR全ループ共通）                       │
├──────────────────┬────────────────┬───────────────────────┤
│  ストップ条件     │  OrchestrationLoop │  AgentLoop          │
├──────────────────┼────────────────┼───────────────────────┤
│  最大イテレーション│  設計上無限        │  5回まで              │
│  タイムアウト      │  月予算95%到達で停止│  30分でタイムアウト   │
│  無進捗検知        │  n/a（1ティックのみ）│  2回連続で停止        │
│  コスト上限        │  月額APIコスト監視 │  1タスク¥500上限      │
│  緊急停止         │  LOOP_EMERGENCY_STOP=true 環境変数    │
└──────────────────┴────────────────┴───────────────────────┘

緊急停止手順（ランブック CC.2参照）:
  1. 環境変数 LOOP_EMERGENCY_STOP=true を設定
  2. OrchestrationLoopは次のティックで全ジョブ投入を停止
  3. 実行中のAgentLoopは現在のステップ完了後に停止
  4. pg-boss: UPDATE jobs SET state='failed' WHERE state='created'
```

### DD.8 ループコスト設計

```typescript
// lib/loop/LoopCostTracker.ts

export class LoopCostTracker {
  // APIコストをDBに記録（全ループが呼ぶ共通処理）
  async record(params: {
    tenantId:   string
    task:       string
    provider:   string
    tokens?:    number
    costJpy:    number
  }): Promise<void> {
    await supabase.from('api_cost_logs').insert({
      tenant_id:  params.tenantId,
      task:       params.task,
      provider:   params.provider,
      tokens:     params.tokens,
      cost_jpy:   params.costJpy,
      created_at: new Date().toISOString(),
    })

    // 月次コスト上限チェック（メトリクス記録）
    const monthly = await this.getMonthlyTotal(params.tenantId)
    meter.createObservableGauge('loop.monthly_cost_jpy').addCallback(obs => {
      obs.observe(monthly, { tenant_id: params.tenantId })
    })
  }

  // 1ティックあたりの予算チェック
  async checkTickBudget(tenantId: string, limitJpy: number): Promise<boolean> {
    const lastTickCost = await this.getLastTickCost(tenantId)
    return lastTickCost < limitJpy
  }
}
```

### DD.9 ループ設計のcron設定

```typescript
// apps/api/cron/orchestration.ts
// Cloudflare Workers Cron Triggers / Vercel Cron

// 本番: 5分ごとに OrchestrationLoop を実行
export const config = {
  schedule: '*/5 * * * *',  // 5分ごと
}

export default async function handler() {
  // 緊急停止チェック
  if (process.env.LOOP_EMERGENCY_STOP === 'true') {
    logger.warn({ event: 'loop.emergency_stopped' })
    return
  }

  const loop = new OrchestrationLoop()
  const result = await loop.tick()

  logger.info({
    event:          'loop.tick_completed',
    agents_started: result.agentsStarted,
    halted:         result.halted,
    reason:         result.reason,
    duration_ms:    result.tickDurationMs,
  })
}
```

### DD.10 ループ設計のSQL補足

```sql
-- OrchestrationLoopが使うRPC関数群

-- 公開後72時間リードゼロの物件を返す
CREATE OR REPLACE FUNCTION find_no_lead_properties(hours_since_publish INTEGER)
RETURNS TABLE(id UUID, name TEXT) AS $$
  SELECT p.id, p.name
  FROM properties p
  LEFT JOIN leads l ON l.property_id = p.id
  WHERE p.status = 'published'
    AND p.updated_at < NOW() - (hours_since_publish || ' hours')::INTERVAL
    AND p.gen_lp_status = 'done'
    AND l.id IS NULL
    -- 既にimprovement_queueに入っているものは除外
    AND NOT EXISTS (
      SELECT 1 FROM improvement_queue iq
      WHERE iq.property_id = p.id
        AND iq.trigger_type = 'no_lead_72h'
        AND iq.status NOT IN ('done', 'skipped')
    )
  LIMIT 50;
$$ LANGUAGE sql SECURITY DEFINER;

-- 直帰率が閾値を超える物件を返す
CREATE OR REPLACE FUNCTION find_high_bounce_properties(
  bounce_threshold FLOAT, hours INTEGER
)
RETURNS TABLE(id UUID, bounce_rate FLOAT) AS $$
  SELECT
    b.scene_id AS id,
    COUNT(DISTINCT b.anonymized_session_id) FILTER (
      WHERE b.event_type = 'section_enter' AND b.section_id = 'hero'
        AND NOT EXISTS (
          SELECT 1 FROM behavior_logs b2
          WHERE b2.anonymized_session_id = b.anonymized_session_id
            AND b2.scene_id = b.scene_id
            AND b2.section_id != 'hero'
        )
    )::FLOAT
    / NULLIF(COUNT(DISTINCT b.anonymized_session_id), 0) AS bounce_rate
  FROM behavior_logs b
  WHERE b.created_at > NOW() - (hours || ' hours')::INTERVAL
  GROUP BY b.scene_id
  HAVING COUNT(DISTINCT b.anonymized_session_id) >= 20  -- 最低20セッション以上
     AND (
       COUNT(DISTINCT b.anonymized_session_id) FILTER (
         WHERE b.event_type = 'section_enter' AND b.section_id = 'hero'
           AND NOT EXISTS (
             SELECT 1 FROM behavior_logs b2
             WHERE b2.anonymized_session_id = b.anonymized_session_id
               AND b2.scene_id = b.scene_id AND b2.section_id != 'hero'
           )
       )::FLOAT
       / NULLIF(COUNT(DISTINCT b.anonymized_session_id), 0)
     ) > bounce_threshold;
$$ LANGUAGE sql SECURITY DEFINER;

-- api_cost_logsテーブル（LoopCostTracker用）
CREATE TABLE api_cost_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  task        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  tokens      INTEGER,
  cost_jpy    DECIMAL(10, 2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON api_cost_logs (tenant_id, created_at DESC);
CREATE INDEX ON api_cost_logs (tenant_id, created_at DESC)
  WHERE created_at > date_trunc('month', NOW());  -- 月次集計用パーシャルインデックス
```

---

## Part EE — ループテスト戦略（v10.1新規） {#part-ee}

### EE.1 ループ固有のテスト要件

```
通常のAgentテストと異なる点:
  1. 無限ループしないことを証明しなければならない
  2. Haltingポリシーが全条件で発火することを確認する
  3. 同一ジョブが重複起動されないことを確認する
  4. コスト追跡が正確であることを確認する
  5. 緊急停止フラグが即座に機能することを確認する
```

### EE.2 HaltingポリシーUnit Tests

```typescript
// tests/unit/AgentLoop.test.ts

describe('AgentLoop — Haltingポリシー', () => {

  it('MAX_ITERATIONS超過で停止する', async () => {
    const loop = new AgentLoop()
    // 常にdone=falseを返すモック
    vi.spyOn(loop as any, 'runAgentStep').mockResolvedValue({
      done: false, costJpy: 1, state: { iteration: 1 }
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('max_iterations_exceeded')
    expect(result.iterations).toBe(6)  // MAX_ITERATIONS(5) + 1回チェック
  })

  it('タイムアウトで停止する', async () => {
    const loop = new AgentLoop()
    vi.useFakeTimers()
    vi.spyOn(loop as any, 'runAgentStep').mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(1900000)  // 31分経過をシミュレート
      return { done: false, costJpy: 1, state: { ts: Date.now() } }
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('timeout')
    vi.useRealTimers()
  })

  it('無進捗を2回検知で停止する', async () => {
    const loop = new AgentLoop()
    const FIXED_STATE = { unchanged: true }
    vi.spyOn(loop as any, 'runAgentStep').mockResolvedValue({
      done: false, costJpy: 1, state: FIXED_STATE  // 毎回同じstate
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('no_progress_detected')
    expect(result.iterations).toBeLessThanOrEqual(4)  // NO_PROGRESS_LIMIT(2) + バッファ
  })

  it('タスクコスト上限で停止する', async () => {
    const loop = new AgentLoop()
    vi.spyOn(loop as any, 'runAgentStep').mockResolvedValue({
      done: false, costJpy: 300, state: { step: Math.random() }  // 毎回異なるstate
    })
    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('halted')
    expect(result.reason).toBe('task_cost_limit_exceeded')
    // ¥300 × 2回 = ¥600 > COST_LIMIT_JPY(¥500)
    expect(result.iterations).toBe(2)
  })

  it('正常完了時はcompletedを返す', async () => {
    const loop = new AgentLoop()
    vi.spyOn(loop as any, 'runAgentStep')
      .mockResolvedValueOnce({ done: false, costJpy: 50, state: { step: 1 } })
      .mockResolvedValueOnce({ done: true,  costJpy: 50, state: { step: 2 } })

    const result = await loop.run({ propertyId: TEST_ID, trigger: 'no_lead_72h' })
    expect(result.status).toBe('completed')
    expect(result.iterations).toBe(2)
    expect(result.costJpy).toBe(100)
  })
})

describe('OrchestrationLoop — 重複起動防止', () => {

  it('同一propertyId + triggerのジョブが実行中なら投入しない', async () => {
    const loop = new OrchestrationLoop()
    const boss = await getBoss()

    // 既存ジョブを作成
    await boss.send({
      name: 'agent-no_lead_72h',
      data: { propertyId: TEST_ID, trigger: 'no_lead_72h' },
      options: { id: `${TEST_ID}_no_lead_72h` }
    })

    // 同一タスクの投入を試みる
    const enqueued = await (loop as any).enqueueIfNotRunning({
      jobName:    'agent-no_lead_72h',
      propertyId: TEST_ID,
      trigger:    'no_lead_72h',
      priority:   10,
    })

    expect(enqueued).toBe(false)
  })

  it('緊急停止フラグが設定されている場合はtickが即座にhaltedを返す', async () => {
    process.env.LOOP_EMERGENCY_STOP = 'true'
    const loop = new OrchestrationLoop()
    const scanSpy = vi.spyOn(loop as any, 'scanAllProperties')

    const result = await loop.tick()

    expect(result.halted).toBe(true)
    expect(result.reason).toBe('emergency_stop')
    expect(scanSpy).not.toHaveBeenCalled()  // スキャンすら行わない

    delete process.env.LOOP_EMERGENCY_STOP
  })
})

describe('SkillRouter — trigger → Skill マッピング', () => {

  it('no_lead_72hトリガーは4つのSkillを順に実行する', async () => {
    const copySpy    = vi.spyOn(Skills, 'regenerateCatchCopy').mockResolvedValue({ ok: true, value: 'new copy' })
    const heroSpy    = vi.spyOn(Skills, 'swapHeroImage').mockResolvedValue({ ok: true, value: 'url' })
    const ogpSpy     = vi.spyOn(Skills, 'regenerateOgpThumbnail').mockResolvedValue({ ok: true, value: 'url' })
    const deploySpy  = vi.spyOn(Skills, 'redeployLp').mockResolvedValue({ ok: true, value: 'url' })

    const router = new SkillRouter()
    await router.execute('no_lead_72h', TEST_PROPERTY_ID, { skipApproval: true })

    expect(copySpy).toHaveBeenCalledOnce()
    expect(heroSpy).toHaveBeenCalledOnce()
    expect(ogpSpy).toHaveBeenCalledOnce()
    expect(deploySpy).toHaveBeenCalledOnce()
    // 順序確認（copySpy → heroSpy → ogpSpy → deploySpy）
    expect(copySpy.mock.invocationCallOrder[0]).toBeLessThan(heroSpy.mock.invocationCallOrder[0])
  })

  it('Skillが失敗した場合は後続Skillを実行しない', async () => {
    vi.spyOn(Skills, 'regenerateCatchCopy').mockResolvedValue({ ok: false, error: 'QC失敗' })
    const heroSpy = vi.spyOn(Skills, 'swapHeroImage')

    const router = new SkillRouter()
    const result = await router.execute('no_lead_72h', TEST_PROPERTY_ID, { skipApproval: true })

    expect(result.ok).toBe(false)
    expect(heroSpy).not.toHaveBeenCalled()
  })
})
```

### EE.3 ループ統合テスト

```typescript
// tests/integration/loop/orchestration.test.ts

describe('OrchestrationLoop — E2E統合', () => {

  it('公開後72時間リードゼロの物件にimprovement_queueが生成される', async () => {
    // 72時間前に公開・リードゼロの物件をセットアップ
    const property = await createPublishedProperty({ hoursAgo: 73 })

    const loop = new OrchestrationLoop()
    await loop.tick()

    // improvement_queueに登録されていることを確認
    const { data: queue } = await supabase
      .from('improvement_queue')
      .select('*')
      .eq('property_id', property.id)
      .eq('trigger_type', 'no_lead_72h')
      .single()

    expect(queue).not.toBeNull()
    expect(queue?.status).toBe('waiting_approval')
  })

  it('月次コスト上限に達した場合はAgentを起動しない', async () => {
    // 月次コストを上限の95%にセット
    await setMonthlyCost(TEST_TENANT_ID, MONTHLY_BUDGET_JPY * 0.96)

    const noLeadProperty = await createPublishedProperty({ hoursAgo: 73 })
    const enqueueSpy = vi.spyOn(OrchestrationLoop.prototype as any, 'enqueueIfNotRunning')

    const loop = new OrchestrationLoop()
    const result = await loop.tick()

    expect(result.halted).toBe(true)
    expect(result.reason).toBe('monthly_cost_limit')
    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})
```

### EE.4 ループ監視（Grafanaダッシュボード追加）

```
ダッシュボード 4: OrchestrationLoop状況

パネル構成:
  1. 今日のループティック回数（Counter）
  2. ループ停止回数・理由別（Bar: cost_limit / timeout / no_progress）
  3. 自動起動Agent数推移（Time Series: 24時間）
  4. Skill実行成功率（Gauge: 目標>90%）
  5. 月次ループAPIコスト累積（Stat: 予算対比）
  6. 現在実行中のAgentLoop一覧（Table: propertyId / trigger / iteration）
  7. 緊急停止フラグ状態（Red/Green インジケーター）
```

### EE.5 ループ追加ランブック（Part CCへの追記）

```
ランブック 5: OrchestrationLoopが止まらない / コスト爆発

症状: api_cost_logsが急増・月次予算を大幅超過

即時対処:
  1. 緊急停止フラグを設定
     Vercel Dashboard → Environment Variables → LOOP_EMERGENCY_STOP=true
     （Cloudflare Workers の場合: wrangler secret put LOOP_EMERGENCY_STOP）

  2. 実行中のpg-bossジョブを停止
     UPDATE jobs SET state='failed'
     WHERE name LIKE 'agent-%' AND state IN ('created', 'active');

  3. Grafana → api_cost_logsで異常コストの発生源を特定
     SELECT task, provider, SUM(cost_jpy), COUNT(*)
     FROM api_cost_logs
     WHERE created_at > NOW() - INTERVAL '1 hour'
     GROUP BY task, provider ORDER BY 3 DESC;

原因別対処:
  A. Skillが常にok=falseを返す → AgentLoopが無進捗ループ
     → 該当Skillのバグを修正 → LOOP_EMERGENCY_STOPを解除

  B. OrchestrationLoopのシグナルスキャンが同じ物件を毎回返す
     → improvement_queueへの登録漏れを確認
     → find_no_lead_properties のWHERE句を確認

  C. pg-bossのリトライが暴走している
     → UPDATE jobs SET retry_limit=0 WHERE state='failed' AND name LIKE 'agent-%'

回復後:
  1. LOOP_EMERGENCY_STOPを削除
  2. 停止中だった正常タスクを手動で再投入
  3. コスト超過分をテナントに通知（必要に応じて）
```

---

## v10.1 追加ADR

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-101 | OrchestrationLoopをpg-boss + cron（5分間隔）で実装 | Redisなし・既存インフラ活用・pg-bossの冪等キーで重複防止 | 専用メッセージキュー（Kafka等） |
| ADR-102 | 全AgentLoopにHaltingポリシー（MAX_ITERATIONS/タイムアウト/無進捗/コスト上限）を義務付け | APIコスト爆発とAgentの無限ループを設計レベルで防止。Uberの4ヶ月で年間予算消費の事故を教訓とする | 実行時監視のみで対応（遅すぎる） |
| ADR-103 | ループから呼ばれる処理はSkillとして命名・定義する | 「何をするか」が名前で明確になり、テスト・再利用・ループからの差し替えが容易になる。プロンプト直書きと比較して品質が安定する | MCPサーバーを直接呼ぶ |
| ADR-104 | SkillはSkillResult<T>を返す（例外を外に漏らさない） | ループがSkill失敗を検知して後続処理を止めるために必要。例外が外に漏れるとAgentLoopのHaltingポリシーが正しく動作しない | 例外スロー方式 |
| ADR-105 | requiresApproval=trueのSkillChainは担当者承認後に実行 | v10.0のADR-070を引き継ぎ。ループ化しても「自動改善は人間承認を経る」原則は維持する。A/Bテスト勝者昇格のみ自動実行を許可 | 全自動実行 |

---

## Part FF — v10.1 設計書全体アップデートサマリー {#part-ff}

### FF.1 v10.0 → v10.1 変更差分

| 対象 | v10.0 | v10.1 |
|------|-------|-------|
| 集客改善の起点 | 担当者がダッシュボードで手動トリガー | OrchestrationLoopが5分ごとに自律的に検知・起動 |
| improvement_queue | 手動登録のみ | ループが自動登録（重複防止付き） |
| ImprovementAgent | 単発実行 | AgentLoop（Haltingポリシー付き）で管理 |
| コスト管理 | 月次確認のみ | LoopCostTrackerがリアルタイム追跡・自動停止 |
| MCPスキル呼び出し | AgentがMCPを直接呼ぶ | Skill Libraryを経由して呼ぶ |
| 停止保証 | なし | HaltingPolicy（3ハードストップ）を全ループに義務化 |
| 緊急停止 | なし | LOOP_EMERGENCY_STOP環境変数で即停止 |
| テスト | Agentレベルのみ | ループ固有テスト（無限ループ・重複起動・コスト爆発）追加 |
| Grafanaダッシュボード | 3枚 | 4枚（ループ監視ダッシュ追加） |
| ADR | 001〜100 | 001〜105（ADR-101〜105追加） |

### FF.2 v10.1 完成後の自律度レベル

```
Level 0（手動）:
  人間 → ボタン → Agent → 終了

Level 1（v10.0まで）:
  人間 → ボタン → Agent（べき等・フォールバック付き）→ 終了
  ↑ ここまでが「Agentにプロンプトを送る」段階

Level 2（v10.1）:
  OrchestrationLoop（5分cron）
    → シグナルを検知
    → Skill Chainを決定
    → AgentLoop（Halting付き）を起動
    → 結果を検証
    → 次のティックへ
  ↑ ここから「ループがAgentにプロンプトを送る」段階

Level 3（将来・v11.0〜）:
  LoopがSkill Libraryを自律的に拡張する
  LoopがLoopを生成する（Gas Town的アーキテクチャ）
  ↑ Steinberger / Boris が描く最終形
```

### FF.3 v10.1の優先実装順序

| 優先度 | 実装内容 | 依存 |
|--------|---------|------|
| 1 | `api_cost_logs`テーブル + LoopCostTracker | Part BB（コスト監視）が先に必要 |
| 2 | `find_no_lead_properties` RPC関数 | improvement_queueテーブルが必要 |
| 3 | AgentLoop（Haltingポリシーのみ）+ テスト | pg-bossが先に必要 |
| 4 | Skill Library（4スキル）+ テスト | MCPサーバーが先に必要 |
| 5 | SkillRouter（trigger→Skillマッピング）| Skill Libraryが先に必要 |
| 6 | OrchestrationLoop本体 + テスト | AgentLoop・SkillRouterが先に必要 |
| 7 | cron設定（5分間隔） | OrchestrationLoopが先に必要 |
| 8 | Grafanaダッシュボード 4追加 | OpenTelemetryが先に必要 |
| 9 | ランブック 5をPart CCに追記 | — |
