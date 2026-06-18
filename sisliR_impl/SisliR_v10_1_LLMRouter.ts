/**
 * SisliR v10.1 — LLMRouter
 * packages/shared/src/lib/LLMRouter.ts
 *
 * 設計根拠: Part OO v1.2（OO.9.AI.3）
 * ADR-180: マルチLLMプロバイダー抽象化
 * ADR-181: 設定は ai_provider_settings テーブルで管理
 * ADR-184: legal_check は claude-opus-4-6 固定
 * ADR-185: Gemini は無料枠のみ
 */

// ── 型定義 ──────────────────────────────────────────

export type LLMTask =
  | 'copy'
  | 'seo'
  | 'faq'
  | 'floorplan'
  | 'photo_retouch'
  | 'classification'
  | 'legal_check'

export type LLMProvider = 'claude' | 'openai' | 'gemini'

export interface LLMRequest {
  task:         LLMTask
  prompt:       string
  systemPrompt?: string
  maxTokens?:   number
  propertyId?:  string
}

export interface LLMResponse {
  text:         string
  provider:     LLMProvider
  model:        string
  latencyMs:    number
  inputTokens:  number
  outputTokens: number
}

export interface BenchmarkResult extends LLMResponse {
  status: 'ok' | 'error'
  error?: string
}

// ── デフォルト設定（DBに設定がない場合のフォールバック）──

export const DEFAULT_PROVIDER_PRIORITY: Record<LLMTask, LLMProvider[]> = {
  copy:           ['claude', 'openai', 'gemini'],
  seo:            ['claude', 'openai', 'gemini'],
  faq:            ['claude', 'openai', 'gemini'],
  floorplan:      ['claude', 'gemini'],
  photo_retouch:  ['openai'],
  classification: ['gemini', 'claude'],
  legal_check:    ['claude'],
}

export const DEFAULT_MODELS: Record<LLMTask, Record<LLMProvider, string>> = {
  copy:           { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-flash' },
  seo:            { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-flash' },
  faq:            { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-pro'   },
  floorplan:      { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-pro'   },
  photo_retouch:  { claude: 'claude-sonnet-4-6', openai: 'gpt-image-1', gemini: 'gemini-1.5-flash' },
  classification: { claude: 'claude-haiku-4-5',  openai: 'gpt-4o-mini', gemini: 'gemini-1.5-flash' },
  legal_check:    { claude: 'claude-opus-4-6',   openai: 'gpt-4o',      gemini: 'gemini-1.5-pro'   },
}

// ── コスト単価（円/token・2026-06概算）──────────────

const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.00045, output: 0.00135 },
  'claude-haiku-4-5':  { input: 0.00003, output: 0.00012 },
  'claude-opus-4-6':   { input: 0.00225, output: 0.01125 },
  'gpt-4o':            { input: 0.00075, output: 0.00225 },
  'gpt-4o-mini':       { input: 0.000023, output: 0.000068 },
  'gpt-image-1':       { input: 0.0,     output: 0.0 },  // 画像生成は別途 per-image
  'gemini-1.5-flash':  { input: 0.0,     output: 0.0 },  // 無料枠
  'gemini-1.5-pro':    { input: 0.0,     output: 0.0 },  // 無料枠（上限あり）
}

// ── 設定キャッシュ（5分 TTL）──────────────────────────

interface ProviderSetting {
  task:     string
  provider: string
  model:    string
  priority: number
  enabled:  boolean
}

interface CachedSettings {
  data:      ProviderSetting[]
  expiresAt: number
}

let _cache: CachedSettings | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

// ── LLMRouter ─────────────────────────────────────────

export const LLMRouter = {

  /**
   * タスクを実行する。
   * DB設定のプロバイダー優先順にフォールバックしながら呼び出す。
   */
  async run(
    req: LLMRequest,
    deps: RouterDeps,
  ): Promise<LLMResponse> {
    const span = deps.tracer.startSpan(`llm.router.${req.task}`)
    try {
      const providers = await resolveProviders(req.task, deps)

      let lastError: Error | undefined
      for (const { provider, model } of providers) {
        try {
          const result = await callProvider(provider, model, req, deps)
          await recordCost(req.task, provider, model, result, req.propertyId, deps)
          span.setStatus({ code: 1 })
          return result
        } catch (e) {
          lastError = e as Error
          deps.logger.warn({
            event: 'llm.provider.failed',
            task:  req.task,
            provider,
            model,
            error: lastError.message,
          })
        }
      }

      span.setStatus({ code: 2, message: lastError?.message })
      throw new Error(
        `LLMRouter: '${req.task}' の全プロバイダーが失敗。最後のエラー: ${lastError?.message}`,
      )
    } finally {
      span.end()
    }
  },

  /**
   * ベンチマーク: 有効な全プロバイダーに並列送信して結果を返す。
   * マスター管理画面の比較テストから呼ばれる。
   */
  async benchmark(
    req: Omit<LLMRequest, 'propertyId'>,
    deps: RouterDeps,
  ): Promise<BenchmarkResult[]> {
    const providers = await resolveProviders(req.task, deps)

    const results = await Promise.allSettled(
      providers.map(async ({ provider, model }) => {
        const start = Date.now()
        try {
          const res = await callProvider(provider, model, req, deps)
          return { ...res, status: 'ok' as const }
        } catch (e) {
          return {
            provider,
            model,
            text:         '',
            latencyMs:    Date.now() - start,
            inputTokens:  0,
            outputTokens: 0,
            status:       'error' as const,
            error:        (e as Error).message,
          }
        }
      }),
    )

    return results.map(r =>
      r.status === 'fulfilled' ? r.value : (r.reason as BenchmarkResult),
    )
  },

  /** キャッシュ即時破棄（設定変更後に API エンドポイントから呼ぶ）*/
  invalidateCache(): void {
    _cache = null
  },
}

// ── プロバイダー解決 ──────────────────────────────────

async function resolveProviders(
  task: LLMTask,
  deps: RouterDeps,
): Promise<{ provider: LLMProvider; model: string }[]> {
  if (_cache && Date.now() < _cache.expiresAt) {
    return filterByTask(task, _cache.data)
  }

  const rows = await deps.db.getAIProviderSettings()
  _cache = { data: rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return filterByTask(task, rows)
}

function filterByTask(
  task: LLMTask,
  rows: ProviderSetting[],
): { provider: LLMProvider; model: string }[] {
  const taskRows = rows
    .filter(r => r.task === task && r.enabled)
    .sort((a, b) => a.priority - b.priority)

  if (taskRows.length > 0) {
    return taskRows.map(r => ({
      provider: r.provider as LLMProvider,
      model:    r.model,
    }))
  }

  // DBに設定がなければデフォルト
  return DEFAULT_PROVIDER_PRIORITY[task].map(p => ({
    provider: p,
    model:    DEFAULT_MODELS[task][p],
  }))
}

// ── プロバイダー別呼び出し ────────────────────────────

async function callProvider(
  provider: LLMProvider,
  model:    string,
  req:      Omit<LLMRequest, 'propertyId'>,
  deps:     RouterDeps,
): Promise<LLMResponse> {
  const start = Date.now()

  switch (provider) {
    case 'claude': {
      const res = await deps.clients.anthropic.messages.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        system:     req.systemPrompt,
        messages:   [{ role: 'user', content: req.prompt }],
      })
      const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
      return {
        text, provider: 'claude', model,
        latencyMs:    Date.now() - start,
        inputTokens:  res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      }
    }

    case 'openai': {
      if (model === 'gpt-image-1') {
        throw new Error('gpt-image-1 は photo_retouch 専用。callProvider 経由では使用不可')
      }
      const res = await deps.clients.openai.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          ...(req.systemPrompt
            ? [{ role: 'system' as const, content: req.systemPrompt }]
            : []),
          { role: 'user', content: req.prompt },
        ],
      })
      const text = res.choices[0]?.message.content ?? ''
      return {
        text, provider: 'openai', model,
        latencyMs:    Date.now() - start,
        inputTokens:  res.usage?.prompt_tokens     ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      }
    }

    case 'gemini': {
      const genModel = deps.clients.gemini.getGenerativeModel({ model })
      const fullPrompt = req.systemPrompt
        ? `${req.systemPrompt}\n\n${req.prompt}`
        : req.prompt
      const res  = await genModel.generateContent(fullPrompt)
      const text = res.response.text()
      return {
        text, provider: 'gemini', model,
        latencyMs:    Date.now() - start,
        inputTokens:  Math.ceil(fullPrompt.length / 4),
        outputTokens: Math.ceil(text.length / 4),
      }
    }
  }
}

// ── コスト記録 ──────────────────────────────────────

async function recordCost(
  task:       string,
  provider:   string,
  model:      string,
  res:        LLMResponse,
  propertyId: string | undefined,
  deps:       RouterDeps,
): Promise<void> {
  const rates   = COST_PER_TOKEN[model] ?? { input: 0, output: 0 }
  const costJpy = res.inputTokens * rates.input + res.outputTokens * rates.output
  await deps.db.insertApiCostLog({
    task, provider, model,
    costJpy:      Math.ceil(costJpy),
    inputTokens:  res.inputTokens,
    outputTokens: res.outputTokens,
    propertyId:   propertyId ?? null,
  })
}

// ── 依存性注入インターフェース（テスト時にモック可能）──

export interface RouterDeps {
  clients: {
    anthropic: {
      messages: {
        create(params: Record<string, unknown>): Promise<{
          content: Array<{ type: string; text?: string }>
          usage: { input_tokens: number; output_tokens: number }
        }>
      }
    }
    openai: {
      chat: {
        completions: {
          create(params: Record<string, unknown>): Promise<{
            choices: Array<{ message: { content: string | null } }>
            usage?: { prompt_tokens: number; completion_tokens: number }
          }>
        }
      }
    }
    gemini: {
      getGenerativeModel(params: { model: string }): {
        generateContent(prompt: string): Promise<{
          response: { text(): string }
        }>
      }
    }
  }
  db: {
    getAIProviderSettings(): Promise<ProviderSetting[]>
    insertApiCostLog(log: {
      task: string; provider: string; model: string
      costJpy: number; inputTokens: number; outputTokens: number
      propertyId: string | null
    }): Promise<void>
  }
  tracer: {
    startSpan(name: string): {
      setStatus(s: { code: number; message?: string }): void
      end(): void
    }
  }
  logger: {
    warn(obj: Record<string, unknown>): void
  }
}
