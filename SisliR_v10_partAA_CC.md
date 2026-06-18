---

## Part AA — テスト戦略（v10.0新規） {#part-aa}

### AA.1 設計思想

```
原則:
  「テストは設計の一部である」
  実装と同時にテストを書く。Claude Codeへの指示にも
  テスト仕様を含めることで、生成コードの品質を担保する。

4層テストピラミッド:
  Layer 1: Unit Tests      (カバレッジ目標: 80%+)
  Layer 2: Integration Tests (主要フロー: 100%)
  Layer 3: E2E Tests        (Critical Path: 5本)
  Layer 4: Load Tests       (SLO達成確認)

CI実行順序:
  Push → Lint/TypeCheck → Unit → Integration → (PR only) E2E
  Merge to main → 全テスト → Load Test（週次）
```

### AA.2 テストフレームワーク

| 層 | ツール | 用途 |
|----|--------|------|
| Unit | Vitest | 純関数・クラス・Zodスキーマ |
| Integration | Vitest + Supabase Test Client | DB・APIエンドポイント |
| E2E | Playwright | ブラウザ操作・Critical Path |
| Load | k6 | API負荷・SLO達成確認 |
| Visual Regression | Playwright + pixelmatch | LP描画確認 |
| RLS侵害テスト | Vitest + Supabase Test Client | テナント分離確認 |

### AA.3 テストデータファクトリー

```typescript
// shared/testing/factories.ts
// ADR-100: テストデータファクトリーは共通管理

import { SceneSchema, PropertyInfoSchema } from '../schemas/scene'

export const createTestProperty = (overrides?: Partial<PropertyInfo>): PropertyInfo => ({
  propertyType: 'newBuild',
  name:         'テスト新築物件',
  address:      '神奈川県秦野市テスト1-2-3',
  pref:         '神奈川県',
  city:         '秦野市',
  price:        35000000,
  landArea:     125.5,
  buildingArea: 98.3,
  layout:       '4LDK',
  access:       '小田急小田原線「秦野」駅 徒歩12分',
  catchCopy:    '秦野の自然の中で育む、家族の笑顔',
  description:  'テスト物件説明文。AI生成の品質チェック用。',
  features:     ['南向きリビング', '床暖房完備', '収納充実'],
  agencyName:   'テスト不動産株式会社',
  realtorLicense: '神奈川県知事（1）第99999号',
  ...overrides,
})

export const createTestScene = (overrides?: Partial<SceneConfig>): SceneConfig => {
  const now = new Date().toISOString()
  return SceneSchema.parse({
    version:    '10.0.0',
    sceneId:    '00000000-0000-0000-0000-000000000001',
    propertyId: '00000000-0000-0000-0000-000000000002',
    agencyId:   '00000000-0000-0000-0000-000000000003',
    property:   createTestProperty(),
    createdAt:  now,
    updatedAt:  now,
    ...overrides,
  })
}

export const createTestTenant = () => ({
  id:   '00000000-0000-0000-0000-000000000010',
  name: 'テストテナント',
  plan: 'growth',
})

export const createTestAgent = (tenantId: string) => ({
  id:        '00000000-0000-0000-0000-000000000011',
  tenant_id: tenantId,
  user_id:   '00000000-0000-0000-0000-000000000012',
  role:      'admin',
})
```

### AA.4 Unit Tests

```typescript
// tests/unit/QualityChecker.test.ts
import { describe, it, expect } from 'vitest'
import { QualityChecker } from '../../lib/agent/QualityChecker'

describe('QualityChecker', () => {
  const checker = new QualityChecker()

  describe('checkCatchCopy', () => {
    it('正常なキャッチコピーはパスする', () => {
      const result = checker.checkCatchCopy('秦野の自然の中で育む、家族の笑顔')
      expect(result.passed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('禁止語「最高」を含む場合は失敗する', () => {
      const result = checker.checkCatchCopy('最高の住まいがここにあります')
      expect(result.passed).toBe(false)
      expect(result.violations).toContain('最高')
    })

    it('15文字未満は失敗する', () => {
      const result = checker.checkCatchCopy('短すぎる')
      expect(result.passed).toBe(false)
    })

    it('40文字超は失敗する', () => {
      const result = checker.checkCatchCopy('a'.repeat(41))
      expect(result.passed).toBe(false)
    })
  })

  describe('checkSeoMeta', () => {
    it('正常なメタタグはパスする', () => {
      const result = checker.checkSeoMeta({
        title:       '秦野市 新築4LDK | テスト不動産',
        description: '神奈川県秦野市の新築4LDK物件。3500万円台。秦野駅徒歩12分。南向きリビング・床暖房完備の人気物件です。',
      })
      expect(result.passed).toBe(true)
    })
  })
})

// tests/unit/SceneSchema.test.ts
describe('SceneSchema', () => {
  it('v10.0.0のSceneJSONを正しくパースする', () => {
    const scene = createTestScene()
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(true)
  })

  it('バージョンが異なる場合はsafeParseがfalseを返す', () => {
    const scene = { ...createTestScene(), version: '9.0.0' }
    const result = SceneSchema.safeParse(scene)
    expect(result.success).toBe(false)
  })
})

// tests/unit/SceneAdapter.test.ts
describe('SceneAdapter', () => {
  it('v8.0.0のJSONをv10.0.0に変換できる', () => {
    const v8Scene = {
      version:    '8.0.0',
      sceneId:    '00000000-0000-0000-0000-000000000001',
      propertyId: '00000000-0000-0000-0000-000000000002',
      agencyId:   '00000000-0000-0000-0000-000000000003',
      property:   createTestProperty(),
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    }
    const adapted = adaptSceneJson(v8Scene)
    expect(adapted.version).toBe('10.0.0')
    expect(adapted.thumbnailConfig).toBeDefined()
    expect(adapted.dynamicLp).toBeDefined()
  })

  it('v9.1.0のJSONをv10.0.0に変換できる', () => {
    const v91Scene = { ...createTestScene(), version: '9.1.0' as any }
    const adapted = adaptSceneJson(v91Scene as any)
    expect(adapted.version).toBe('10.0.0')
    expect(adapted.property.prefCode).toBeUndefined()  // デフォルトundefined
  })
})

// tests/unit/VideoGeneratorRouter.test.ts
describe('VideoGeneratorRouter', () => {
  it('Higgsfield正常時はHiggsfieldを使用する', async () => {
    const router = new VideoGeneratorRouter()
    vi.spyOn(HiggsfieldProvider.prototype, 'healthCheck').mockResolvedValue(true)
    vi.spyOn(HiggsfieldProvider.prototype, 'generate').mockResolvedValue({
      url: 'https://r2.example.com/video.mp4',
      provider: 'higgsfield',
      durationSec: 60,
      cost: 10,
    })
    const result = await router.generate({ ...createVideoRequest(), track: 'cinematic' })
    expect(result.provider).toBe('higgsfield')
  })

  it('Higgsfield障害時はRunway Gen-4にフォールバックする', async () => {
    const router = new VideoGeneratorRouter()
    vi.spyOn(HiggsfieldProvider.prototype, 'healthCheck').mockRejectedValue(new Error('timeout'))
    vi.spyOn(RunwayGen4Provider.prototype, 'healthCheck').mockResolvedValue(true)
    vi.spyOn(RunwayGen4Provider.prototype, 'generate').mockResolvedValue({
      url: 'https://r2.example.com/video.mp4',
      provider: 'runway_gen4',
      durationSec: 60,
      cost: 8,
    })
    const result = await router.generate({ ...createVideoRequest(), track: 'cinematic' })
    expect(result.provider).toBe('runway_gen4')
  })

  it('全プロバイダー障害時はエラーをスローする', async () => {
    const router = new VideoGeneratorRouter()
    vi.spyOn(HiggsfieldProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(RunwayGen4Provider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(KlingAIProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(OpenCutProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    vi.spyOn(FfmpegProvider.prototype, 'healthCheck').mockRejectedValue(new Error())
    await expect(router.generate(createVideoRequest())).rejects.toThrow('全プロバイダーで動画生成に失敗しました')
  })
})

// tests/unit/SectionBeacon.test.ts
describe('SectionBeacon', () => {
  it('300ms以内の連続enterイベントはデバウンスされる', async () => {
    const beacon = new SectionBeacon({ sceneId: 'test', sessionId: 'sess' })
    const sendSpy = vi.spyOn(beacon as any, 'beacon')

    // 100ms間隔で2回enterをトリガー（デバウンス内）
    beacon['handleEntry']('price', true)
    await sleep(100)
    beacon['handleEntry']('price', true)

    await sleep(400)  // デバウンス完了を待つ
    expect(sendSpy).toHaveBeenCalledTimes(1)  // 1回のみ
  })

  it('300ms超の間隔では両方のイベントが記録される', async () => {
    const beacon = new SectionBeacon({ sceneId: 'test', sessionId: 'sess' })
    const sendSpy = vi.spyOn(beacon as any, 'beacon')

    beacon['handleEntry']('gallery', true)
    await sleep(400)  // デバウンス超過
    beacon['handleEntry']('features', true)

    await sleep(400)
    expect(sendSpy).toHaveBeenCalledTimes(2)
  })
})
```

### AA.5 Integration Tests

```typescript
// tests/integration/api/lead.test.ts
describe('POST /api/lead', () => {
  beforeEach(async () => {
    await cleanupTestLeads()
  })

  it('正常なリードを登録できる', async () => {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId:   TEST_PROPERTY_ID,
        sceneId:      TEST_SCENE_ID,
        contactType:  'inquiry',
        utmParams:    { utm_source: 'suumo', utm_medium: 'portal' },
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('created')

    // DBに登録されているか確認
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('property_id', TEST_PROPERTY_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(lead?.source).toBe('lp')
    expect(lead?.utm_source).toBe('suumo')
  })

  it('24時間以内の重複リードはduplicateを返す', async () => {
    // 1回目
    await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: TEST_PROPERTY_ID, contactType: 'inquiry' }),
    })
    // 2回目（同じセッション）
    const res2 = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: TEST_PROPERTY_ID, contactType: 'inquiry' }),
    })
    const data2 = await res2.json()
    expect(data2.status).toBe('duplicate')
  })
})

// tests/integration/rls/tenant-isolation.test.ts
// ADR-096: マルチテナントRLS侵害テスト（CIに必須組み込み）
describe('RLS テナント分離テスト', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeAll(async () => {
    tenantA = await createTestTenantWithUser()
    tenantB = await createTestTenantWithUser()
  })

  afterAll(async () => {
    await cleanupTestTenants([tenantA.id, tenantB.id])
  })

  it('テナントAはテナントBの物件を参照できない', async () => {
    // テナントBに物件を作成
    const propB = await createPropertyForTenant(tenantB)

    // テナントAのセッションでテナントBの物件を取得しようとする
    const { data, error } = await supabase
      .auth.setSession(tenantA.session)  // テナントAとして認証
      .then(() => supabase.from('properties').select('*').eq('id', propB.id).single())

    // RLSによりデータが返らないこと
    expect(data).toBeNull()
  })

  it('テナントAはテナントBのleadsを参照できない', async () => {
    const leadB = await createLeadForTenant(tenantB)

    await supabase.auth.setSession(tenantA.session)
    const { data } = await supabase.from('leads').select('*').eq('id', leadB.id).single()

    expect(data).toBeNull()
  })

  it('テナントAはテナントBのbehavior_logsを参照できない', async () => {
    const sceneB = await createSceneForTenant(tenantB)
    await createBehaviorLog(sceneB.id)

    await supabase.auth.setSession(tenantA.session)
    const { data } = await supabase
      .from('behavior_logs')
      .select('*')
      .eq('scene_id', sceneB.id)

    expect(data).toHaveLength(0)
  })
})

// tests/integration/agent/PropertyIntakeAgent.test.ts
describe('PropertyIntakeAgent べき等性テスト', () => {
  it('同じpropertyIdで2回実行しても課金系Stepは1回のみ実行される', async () => {
    const agent = new PropertyIntakeAgent()
    const higgsfieldSpy = vi.spyOn(HiggsfieldProvider.prototype, 'generate')

    await agent.run({ propertyId: TEST_PROPERTY_ID, uploadedFiles: TEST_FILES })
    await agent.run({ propertyId: TEST_PROPERTY_ID, uploadedFiles: TEST_FILES })

    // Higgsfield（課金）は1回のみ呼ばれる
    expect(higgsfieldSpy).toHaveBeenCalledTimes(1)
  })

  it('Step 3完了後にStep 4で失敗した場合、再実行でStep 1〜3はスキップされる', async () => {
    const agent = new PropertyIntakeAgent()
    const step1Spy = vi.spyOn(agent as any, 'runStep1_parse')
    const step2Spy = vi.spyOn(agent as any, 'runStep2_photos')
    const step3Spy = vi.spyOn(agent as any, 'runStep3_thumbnails')

    // Step 4でエラーをシミュレート（Step 3まで完了状態を事前設定）
    await setGenStatus(TEST_PROPERTY_ID, { photo: 'done', thumbnail: 'done' })

    await agent.run({ propertyId: TEST_PROPERTY_ID, uploadedFiles: TEST_FILES })

    expect(step1Spy).toHaveBeenCalledTimes(1)  // 常にStep 1は実行
    expect(step2Spy).not.toHaveBeenCalled()     // Skip
    expect(step3Spy).not.toHaveBeenCalled()     // Skip
  })
})
```

### AA.6 E2E Tests（Playwright）

```typescript
// tests/e2e/critical-paths.spec.ts

test.describe('Critical Path 1: 物件アップロード → LP公開', () => {
  test('CSV + 写真アップロードから30分以内にLPが公開される', async ({ page }) => {
    await page.goto('/dashboard/upload')

    // ファイルアップロード
    await page.setInputFiles('#photo-upload', TEST_PHOTO_PATH)
    await page.setInputFiles('#pdf-upload', TEST_PDF_PATH)
    await page.click('#start-generation')

    // 生成完了を待つ（最大5分）
    await expect(page.locator('#lp-url')).toBeVisible({ timeout: 300000 })

    const lpUrl = await page.locator('#lp-url').inputValue()
    expect(lpUrl).toMatch(/^https:\/\/sisliR\.com\/lp\//)

    // 公開LPに遷移してキャッチコピーが表示されていることを確認
    await page.goto(lpUrl)
    await expect(page.locator('#catch-copy')).toBeVisible()
    await expect(page.locator('#catch-copy')).not.toBeEmpty()
  })
})

test.describe('Critical Path 2: DynamicLP 広告軸切替', () => {
  test('utm_content=axis_living でリビング訴求LPが表示される', async ({ page }) => {
    await page.goto(`/lp/${TEST_SCENE_ID}?utm_content=axis_living&utm_source=meta&utm_medium=cpc`)
    await page.waitForLoadState('networkidle')

    const heroSrc = await page.locator('#hero-image').getAttribute('src')
    // リビング用ヒーロー画像が設定されていること
    expect(heroSrc).toContain('living')

    const catchCopy = await page.locator('#catch-copy').textContent()
    expect(catchCopy).not.toBe('')
  })
})

test.describe('Critical Path 3: リード計測 → UTM記録', () => {
  test('UTMパラメータ付きでCTAクリックするとleadsにUTMが記録される', async ({ page }) => {
    await page.goto(`/lp/${TEST_SCENE_ID}?utm_source=suumo&utm_medium=portal&utm_campaign=test`)
    await page.click('#cta-button')

    // フォーム送信
    await page.fill('#inquiry-form textarea', 'テストお問い合わせ')
    await page.click('#inquiry-form button[type=submit]')

    // DBにUTMが記録されているか確認
    await page.waitForTimeout(2000)
    const lead = await getLatestLead(TEST_SCENE_ID)
    expect(lead?.utm_source).toBe('suumo')
    expect(lead?.utm_medium).toBe('portal')
  })
})

test.describe('Critical Path 4: A/Bテスト バリアント表示', () => {
  test('セッションIDが同じなら毎回同じバリアントが表示される', async ({ browser }) => {
    // 同じsessionStorageを使用する2ページを開く
    const context = await browser.newContext()
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    await page1.goto(`/lp/${TEST_SCENE_ID}`)
    const variant1 = await page1.locator('#ab-variant-id').getAttribute('data-variant')

    await page2.goto(`/lp/${TEST_SCENE_ID}`)
    const variant2 = await page2.locator('#ab-variant-id').getAttribute('data-variant')

    expect(variant1).toBe(variant2)
    await context.close()
  })
})

test.describe('Critical Path 5: テナント分離 UI確認', () => {
  test('テナントAでログインするとテナントBの物件は表示されない', async ({ page }) => {
    await loginAsTenantA(page)
    await page.goto('/dashboard/properties')

    const propertyIds = await page.locator('[data-property-id]').allTextContents()
    expect(propertyIds).not.toContain(TENANT_B_PROPERTY_ID)
  })
})
```

### AA.7 Load Tests（k6）

```javascript
// tests/load/lp-runtime.js
import http from 'k6/http'
import { sleep, check } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 50  },   // ランプアップ
    { duration: '3m', target: 100 },   // 定常負荷
    { duration: '1m', target: 0   },   // ランプダウン
  ],
  thresholds: {
    // SLO: LP読み込み 95%ile が 2秒以内（Part BB参照）
    'http_req_duration': ['p(95)<2000'],
    // エラー率 0.1% 以下
    'http_req_failed':   ['rate<0.001'],
  },
}

export default function () {
  const res = http.get(`https://sisliR.com/lp/${LOAD_TEST_SCENE_ID}`)
  check(res, {
    'status is 200':       (r) => r.status === 200,
    'response time < 2s':  (r) => r.timings.duration < 2000,
    'catch copy exists':   (r) => r.body.includes('catch-copy'),
  })
  sleep(1)
}
```

### AA.8 CIパイプライン設定

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck:
    name: Lint & TypeCheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    name: Unit Tests
    needs: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v4
        with:
          fail_ci_if_error: true
          threshold: 80  # カバレッジ80%未満でCI失敗

  integration-tests:
    name: Integration Tests (incl. RLS)
    needs: unit-tests
    runs-on: ubuntu-latest
    env:
      SUPABASE_URL:    ${{ secrets.TEST_SUPABASE_URL }}
      SUPABASE_SECRET_KEY: ${{ secrets.TEST_SUPABASE_SECRET_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:integration  # RLS侵害テスト含む（ADR-096）

  e2e-tests:
    name: E2E Tests (Critical Paths)
    needs: integration-tests
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  load-tests:
    name: Load Tests (SLO Check)
    needs: integration-tests
    if: github.ref == 'refs/heads/main'  # mainマージ時のみ
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - run: k6 run tests/load/lp-runtime.js
```

### AA.9 テストカバレッジ目標

| カテゴリ | 目標カバレッジ | 優先度 |
|---------|-------------|-------|
| Zodスキーマ（Scene JSON・全バリアント） | 100% | 最高 |
| QualityChecker（全禁止語パターン） | 100% | 最高 |
| SceneAdapter（全バージョン変換） | 100% | 最高 |
| VideoGeneratorRouter（全フォールバック） | 100% | 最高 |
| SectionBeacon（デバウンス・iOS Safari） | 100% | 最高 |
| PropertyIntakeAgent（べき等性・全Step） | 90%+ | 高 |
| ThumbnailGenerator | 80%+ | 高 |
| UTMGenerator | 100% | 高 |
| API エンドポイント | 80%+ | 高 |
| UI コンポーネント | 60%+ | 中 |
| **全体目標** | **80%+** | — |

---

## Part BB — 可観測性・監視設計（v10.0新規） {#part-bb}

### BB.1 設計思想

```
原則: 「測定できないものは改善できない」（ADR-091）

3本柱:
  Traces  → OpenTelemetry → Grafana Tempo
  Metrics → OpenTelemetry → Grafana Cloud（Prometheus互換）
  Logs    → 構造化ログ → Grafana Loki

全MCPサーバー・全エージェントステップ・全外部API呼び出しに
スパンを設定し、エンドツーエンドの処理時間と失敗率を可視化する。
```

### BB.2 OpenTelemetry初期設定

```typescript
// lib/observability/tracer.ts

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { trace, metrics } from '@opentelemetry/api'

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:    'sisliR-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: '10.0.0',
    environment: process.env.NODE_ENV,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: { Authorization: `Bearer ${process.env.GRAFANA_CLOUD_TOKEN}` },
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
      headers: { Authorization: `Bearer ${process.env.GRAFANA_CLOUD_TOKEN}` },
    }),
    exportIntervalMillis: 60000,  // 1分ごとにメトリクスをエクスポート
  }),
})

sdk.start()

export const tracer = trace.getTracer('sisliR', '10.0.0')
export const meter  = metrics.getMeter('sisliR', '10.0.0')

// カスタムメトリクス
export const agentDuration       = meter.createHistogram('agent.duration_ms',       { description: 'エージェント実行時間' })
export const apiCallCounter      = meter.createCounter('api.calls_total',           { description: 'API呼び出し回数' })
export const leadCreatedCounter  = meter.createCounter('leads.created_total',       { description: 'リード生成数' })
export const videoGenSuccessRate = meter.createObservableGauge('video.success_rate',{ description: '動画生成成功率' })
export const lpLoadDuration      = meter.createHistogram('lp.load_duration_ms',     { description: 'LP読み込み時間' })
```

### BB.3 SLO / SLI 定義

| サービス | SLI指標 | SLO目標 | アラート閾値 |
|---------|---------|---------|-----------|
| LP読み込み | P95レイテンシ | < 2,000ms | > 2,500ms（5分間） |
| LP読み込み | エラー率 | < 0.1% | > 0.5%（5分間） |
| PropertyIntakeAgent | 成功率 | ≥ 99.5% | < 99%（30分間） |
| 動画生成 | 成功率 | ≥ 95% | < 90%（1時間） |
| APIエンドポイント全体 | P99レイテンシ | < 5,000ms | > 7,000ms（5分間） |
| Supabase接続 | エラー率 | < 0.1% | > 0.5%（5分間） |
| Higgsfield API | 成功率 | ≥ 90% | < 80%（30分間）|
| R2アップロード | 成功率 | ≥ 99.9% | < 99%（5分間） |
| リード登録 | エラー率 | < 0.01% | > 0.1%（5分間） |

### BB.4 構造化ログ設計

```typescript
// lib/observability/logger.ts

import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'sisliR-api',
    version: '10.0.0',
    env:     process.env.NODE_ENV,
  },
  // Grafana Loki向けのフォーマット
  transport: process.env.NODE_ENV === 'production'
    ? { target: '@logtail/pino' }
    : { target: 'pino-pretty' },
})

// 標準ログフィールド定義
export function logAgentStep(params: {
  propertyId: string
  step:       string
  status:     'start' | 'success' | 'error' | 'skip'
  durationMs?: number
  error?:      Error
}): void {
  const level = params.status === 'error' ? 'error' : 'info'
  logger[level]({
    event:       'agent.step',
    property_id: params.propertyId,
    step:        params.step,
    status:      params.status,
    duration_ms: params.durationMs,
    err:         params.error ? { message: params.error.message, stack: params.error.stack } : undefined,
  })
}

export function logApiCall(params: {
  api:        string
  method:     string
  statusCode: number
  durationMs: number
  tenantId?:  string
}): void {
  logger.info({
    event:       'api.call',
    api:         params.api,
    method:      params.method,
    status_code: params.statusCode,
    duration_ms: params.durationMs,
    tenant_id:   params.tenantId,
  })
}
```

### BB.5 Grafana Cloudダッシュボード設計

#### ダッシュボード 1: エージェント実行状況

```
パネル構成:
  1. 今日の物件生成数（Counter）
  2. エージェント成功率（Gauge: 目標99.5%）
  3. エージェント平均実行時間（Stat: 目標< 30分）
  4. Step別実行時間分布（Histogram）
  5. 直近24時間のエラー一覧（Logs: level=error）
  6. プロバイダー別動画生成数（Bar Chart: Higgsfield/Runway/Kling/OpenCut）
```

#### ダッシュボード 2: LP パフォーマンス

```
パネル構成:
  1. LP P95読み込み時間（Gauge: SLO < 2,000ms）
  2. LP エラー率（Gauge: SLO < 0.1%）
  3. 時間帯別アクセス数（Time Series）
  4. UTMチャネル別セッション数（Pie Chart）
  5. A/Bテスト現在の状況（Table）
  6. 改善キュー待ち件数（Stat）
```

#### ダッシュボード 3: Growth Loop

```
パネル構成:
  1. 今日のリード数（Counter）
  2. チャネル別リード数（Bar Chart）
  3. セクション別平均滞在時間（Heatmap）
  4. CVR推移（Time Series: 目標> 2%）
  5. 改善後CVR変化（Before/After比較）
  6. A/Bテスト勝者（Table）
```

### BB.6 アラート設定

```yaml
# Grafana Alert Rules（Grafana Cloud管理画面で設定）

groups:
  - name: sisliR-critical
    rules:
      - alert: LpHighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5..",path=~"/lp/.*"}[5m]))
          / sum(rate(http_requests_total{path=~"/lp/.*"}[5m])) > 0.005
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "LP エラー率が0.5%を超えています"
          runbook: "https://sisliR.com/runbooks/lp-high-error-rate"

      - alert: AgentSuccessRateLow
        expr: |
          sum(rate(agent_completions_total{status="success"}[30m]))
          / sum(rate(agent_completions_total[30m])) < 0.99
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "PropertyIntakeAgent成功率が99%を下回っています"
          runbook: "https://sisliR.com/runbooks/agent-low-success-rate"

      - alert: VideoGenAllProvidersFailing
        expr: |
          sum(rate(video_generation_total{status="success"}[1h])) == 0
          and sum(rate(video_generation_total[1h])) > 0
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "全動画生成プロバイダーが失敗しています"
          runbook: "https://sisliR.com/runbooks/video-all-providers-failing"

  - name: sisliR-warning
    rules:
      - alert: LpP95LatencyHigh
        expr: |
          histogram_quantile(0.95, rate(lp_load_duration_ms_bucket[5m])) > 2500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "LP P95レイテンシが2.5秒を超えています"

      - alert: HiggsfieldApiErrorHigh
        expr: |
          sum(rate(external_api_calls_total{api="higgsfield",status="error"}[30m]))
          / sum(rate(external_api_calls_total{api="higgsfield"}[30m])) > 0.2
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Higgsfield APIエラー率が20%を超えています（フォールバック動作中の可能性）"

      - alert: MonthlyAICostThreshold
        expr: |
          sum(ai_api_cost_total) > 80000  # 月額8万円超
        labels:
          severity: warning
        annotations:
          summary: "AI APIコストが月間予算の80%に達しました"
```

---

## Part CC — 運用・障害対応設計（v10.0新規） {#part-cc}

### CC.1 通常運用フロー

```
毎日:
  □ Grafana Cloudで昨日のエラー率・成功率を確認（5分）
  □ improvement_queueの承認待ちアイテムを処理（10〜30分）
  □ 新着リードの担当者アサイン確認（5分）

毎週:
  □ k6ロードテスト実行（SLO達成確認）
  □ コスト集計（Claude API / Higgsfield / R2）
  □ A/Bテスト統計的有意差チェック

毎月:
  □ Supabase バックアップ確認
  □ 依存ライブラリのセキュリティアップデート（npm audit）
  □ ADR確認・更新（新しい設計決定があれば追加）
  □ 月次コスト vs 売上 の損益確認
```

### CC.2 障害対応ランブック

#### ランブック 1: PropertyIntakeAgent 失敗

```
症状: エージェントジョブが繰り返し失敗する / タイムアウトが多発

確認手順:
  1. Grafana Cloud → ダッシュボード「エージェント実行状況」確認
  2. Grafana Loki → event=agent.step status=error で直近ログを確認
  3. Supabase → agent_runs テーブルで error_msg を確認
  4. pg-boss → failed_jobs テーブルで失敗ジョブを確認

原因別対処:
  A. Claude API タイムアウト
     → timeout を 120秒に延長（env: AI_TIMEOUT_MS）
     → 対象ジョブを pg-boss で再投入

  B. Claude Vision 間取り解析エラー（旧: FloorplanVLM推論エラー。ADR-144でClaude Visionが正式パイプラインに）
     → Part OO.6.3の信頼度ルーティングに従い 'manual_required' へフォールバック
     → 該当物件はマスター管理画面（/master/floorplan/{jobId}）で手動修正・再解析

  C. Higgsfield API 障害
     → VideoGeneratorRouter の自動フォールバックを確認
     → HIGGSFIELD_DISABLE=true で Higgsfield を一時無効化
     → Runway Gen-4 がフォールバックとして動作することを確認

  D. R2 アップロード失敗
     → Cloudflare Status Page を確認
     → 障害の場合は待機。回復後に再実行
```

#### ランブック 2: LP 高エラー率

```
症状: LpHighErrorRate アラートが発火 / LP が 5xx を返す

確認手順:
  1. Grafana Cloud → LP エラー率の時刻を特定
  2. Grafana Loki → level=error で該当時刻のログを確認
  3. Cloudflare Dashboard → Workers/Pages のエラーを確認
  4. Supabase Dashboard → DB接続数・クエリエラーを確認

原因別対処:
  A. Supabase 接続数上限
     → SUPABASE_CONNECTION_POOL_SIZE を削減
     → Supabase Pro → Enterprise へのアップグレードを検討

  B. Scene JSON パースエラー（バージョン不整合）
     → validateScene を lenient モードに切替（env: SCENE_VALIDATE_MODE=lenient）
     → SceneAdapter の変換処理を確認

  C. R2 CDN 障害
     → Cloudflare Status Page を確認
     → 回復まで静的フォールバックページを表示

  D. Three.js WebGPU レンダリングエラー（クライアント）
     → エラーバウンダリーが WebGL フォールバックを表示しているか確認
     → 特定デバイスでの再現性を確認
```

#### ランブック 3: 全動画生成プロバイダー障害

```
症状: VideoGenAllProvidersFailing アラートが発火

確認手順:
  1. Higgsfield ステータスページを確認
  2. Runway ステータスページを確認
  3. Kling AI ステータスページを確認
  4. VideoGeneratorRouter のログを確認（どのプロバイダーでエラーが出ているか）

対処:
  1. 全プロバイダー本当に障害の場合 → 動画生成ジョブを一時停止
     pg-boss: UPDATE jobs SET state='failed' WHERE name='video-generate' AND state='created'

  2. 1プロバイダーのみ回復した場合 → 該当プロバイダーのみ使用するよう設定変更
     env: VIDEO_PROVIDER_PRIORITY=runway,kling,ffmpeg

  3. 全回復後 → 停止中だったジョブを再投入
     pg-boss: CALL reschedule_failed_video_jobs()
```

#### ランブック 4: テナントデータ漏洩が疑われる場合

```
症状: あるテナントが他テナントのデータを参照できたと報告

初動（30分以内）:
  1. 報告を受けたテナントの access_log を確認
  2. 疑いのある SQL クエリを特定
  3. 必要であれば該当テナントのセッションを強制ログアウト
     supabase.auth.admin.signOut(userId)
  4. Supabase Dashboard → Auth → Logs でアクセス履歴を確認

調査:
  1. RLS ポリシーが正しく適用されているか確認
     SELECT * FROM pg_policies WHERE tablename = 'properties';
  2. 問題のあるクエリを再現してテスト
  3. RLS 侵害テスト（Part AA参照）を手動実行

報告:
  1. インシデントレポートを作成（発生時刻・影響範囲・対処内容）
  2. 個人情報保護法の観点から法的対応を検討
  3. 影響を受けたテナントへの通知を検討
```

### CC.3 エスカレーションマトリクス

| 重大度 | 条件 | 初動時間 | 対応者 |
|--------|------|---------|-------|
| P0（致命的） | LP全停止 / データ漏洩疑い / 全エージェント停止 | 15分以内 | 開発者（24h対応） |
| P1（重大） | エラー率 > 1% / SLO違反継続30分以上 / 全動画プロバイダー障害 | 1時間以内 | 開発者（業務時間内） |
| P2（軽微） | 特定機能の不具合 / 単一プロバイダー障害 | 翌業務日 | 開発者 |
| P3（情報） | コスト超過警告 / SLO緩やかな悪化 | 週次確認 | 開発者 |

### CC.4 コスト監視・キャパシティプランニング

#### コストアラート設定

```typescript
// lib/cost/CostMonitor.ts

export class CostMonitor {
  // 月次AIコストを追跡（pg-bossで日次実行）
  async checkMonthlyCost(tenantId: string): Promise<void> {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const usage = await supabase
      .from('api_cost_logs')
      .select('cost_jpy')
      .eq('tenant_id', tenantId)
      .gte('created_at', `${currentMonth}-01`)
      .then(({ data }) => data?.reduce((sum, r) => sum + r.cost_jpy, 0) ?? 0)

    const MONTHLY_BUDGET_ALERT_THRESHOLD_JPY = 80000  // 8万円

    if (usage > MONTHLY_BUDGET_ALERT_THRESHOLD_JPY) {
      // Grafana アラートも発火（BB.6参照）
      logger.warn({
        event:     'cost.monthly_threshold_exceeded',
        tenant_id: tenantId,
        usage_jpy: usage,
        budget_jpy: MONTHLY_BUDGET_ALERT_THRESHOLD_JPY,
      })
      await this.notifyAdmin(tenantId, usage)
    }
  }

  // Higgsfield クレジット残量確認（動画生成前に必須）
  async checkHiggsfieldCredit(tenantId: string): Promise<{ sufficient: boolean; remaining: number }> {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const { data } = await supabase
      .from('higgsfield_credit_usage')
      .select('credits_used')
      .eq('tenant_id', tenantId)
      .eq('year_month', currentMonth)
      .single()

    const limit = await this.getTenantCreditLimit(tenantId)
    const used = data?.credits_used ?? 0
    return { sufficient: used < limit, remaining: limit - used }
  }
}
```

#### キャパシティプランニング指標

| 指標 | 現在（1社）| 目標（50社）| スケーリング方法 |
|------|----------|-----------|--------------|
| Supabase接続数 | ~20 | ~500 | Pro → Enterprise |
| pg-boss ワーカー | 2 | 20 | 水平スケール |
| R2ストレージ | ~50GB | ~2.5TB | 従量課金（対応不要） |
| Claude API | ~5万円/月 | ~250万円/月 | Anthropic Volume Discount |
| Cloudflare Pages | 無制限 | 無制限 | 対応不要 |
| Grafana Cloud | Free | Pro（$29/月）| 50社時点でアップグレード |

### CC.5 バックアップ・リカバリー設計

```
バックアップ戦略:
  Supabase DB:
    - Supabase Pro の自動バックアップ（7日間・日次）
    - 週次 pg_dump を Cloudflare R2 に手動保存
    - RPO（目標復旧時点）: 24時間以内
    - RTO（目標復旧時間）: 4時間以内

  Cloudflare R2（アセット）:
    - R2 は地理的冗長化済み（Cloudflare標準）
    - 重要アセット（USDZ / SPZ4）はローカルHDDがSource of Truth
    - R2 障害時はローカルHDDから再アップロード可能

  Scene JSON:
    - DB（Supabase）+ ローカルファイル（08_SceneJSON/）の2重保持
    - ローカルが正しい場合はDBに再投入可能

リカバリー手順:
  1. Supabase バックアップから復元
     supabase db restore --backup-id <id>

  2. R2 アセット欠損時
     node scripts/restore-r2-from-local.ts --project-dir D:\SisliR_Projects\

  3. Scene JSON 欠損時
     node scripts/restore-scenes-from-json.ts --dir D:\SisliR_Projects\
```

---

## 付録: 環境変数一覧（v10.0確定版）

```bash
# ── Supabase ─────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx   # 旧anon_key（2026年Q4移行）
SUPABASE_SECRET_KEY=sb_secret_xxx                          # 旧service_role_key（2026年Q4移行）

# ── AI ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxx
AI_TIMEOUT_MS=120000

# ── 動画生成（VideoGeneratorRouter）─────────────────────────
HIGGSFIELD_API_KEY=xxx
HIGGSFIELD_DISABLE=false                     # 緊急無効化フラグ
RUNWAY_API_KEY=xxx                           # v10.0追加（ADR-090）
KLING_API_KEY=xxx                            # v10.0追加（ADR-090）
VIDEO_PROVIDER_PRIORITY=higgsfield,runway,kling,opencut,ffmpeg  # v10.0追加

# ── ストレージ ────────────────────────────────────────────────
CLOUDFLARE_R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=xxx
CLOUDFLARE_R2_SECRET_KEY=xxx
CLOUDFLARE_R2_BUCKET=sisliR-assets
LOCAL_PROJECTS_DIR=D:\SisliR_Projects

# ── 可観測性（v10.0追加）─────────────────────────────────────
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/metrics
GRAFANA_CLOUD_TOKEN=glc_xxx
LOG_LEVEL=info

# ── テスト設定 ───────────────────────────────────────────────
SCENE_VALIDATE_MODE=strict    # 通常: strict / 移行中: lenient
FLOORPLAN_VLM_FALLBACK=auto   # auto（ライセンスNG時にClaude Visionへ自動切替）

# ── Stripe（課金）────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ── LINE（リード）────────────────────────────────────────────
LINE_CHANNEL_ACCESS_TOKEN=xxx
LINE_CHANNEL_SECRET=xxx
```

---

## 付録: CLAUDE.md（Claude Code向けプロジェクト指示）

```markdown
# SisliR v10.0 — Claude Code プロジェクト指示

## このプロジェクトについて
SisliRはAI住宅マーケティングOS+デジタルツイン基盤です。
Turborepo モノレポ。packages/配下が共通パッケージ、apps/配下がアプリケーション。

## 必読設計書
- /docs/design/SisliR_v10_partAE.md (ビジョン・技術スタック・スキーマ)
- /docs/design/SisliR_v10_partFM.md (エージェント・DB設計)
- /docs/design/SisliR_v10_partNR.md (セキュリティ・ADR)
- /docs/design/SisliR_v10_partAA_CC.md (テスト・可観測性・運用)

## 実装ルール（必ず守ること）
1. TypeScript strict mode。any禁止（型が難しければunknown + 型ガード）
2. Scene JSONはSceneSchemaでZodバリデーション必須
3. Supabase操作は必ずRLSが有効なテーブルを使用
4. 外部API呼び出しは必ずOpenTelemetryスパンで囲む
5. MCPサーバーはmcp_sisliR_*の命名規則に従う
6. DBへの書き込みはDrizzle ORMのみ（rawSQL禁止）
7. 個人情報（メール・電話番号）は平文でDBに保存しない（SHA-3ハッシュのみ）
8. テストを必ず書く（Unitテスト最低1本・カバレッジ80%目標）
9. ログはlogger.info/error（console.log禁止）

## ファイル命名規則
- MCPサーバー: apps/mcp/src/servers/mcp_sisliR_{name}/
- エージェント: lib/agent/{Name}Agent.ts
- テスト: tests/unit/{module}.test.ts / tests/integration/{module}.test.ts

## よく使うコマンド
npm run dev      # 開発サーバー起動
npm run test:unit        # Unitテスト
npm run test:integration # Integrationテスト（Supabase接続必要）
npm run typecheck        # 型チェック
npm run lint             # ESLint
```

---

*SisliR v10.0 完全設計書 — 全Part（A〜CC）統合版*
*最終更新: 2026年6月 | 設計責任者: サポート*
*次回更新予定: Phase 1完了時（v10.1）*
