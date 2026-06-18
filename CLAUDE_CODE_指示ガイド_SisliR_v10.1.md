# SisliR v10.1 — Claude Code 指示ガイド
## kimch.dev 向け実装指示書テンプレート集

> **用途**: Claude Code セッションで貼り付けて使う「指示文のひな形」  
> **前提**: リポジトリルートに `CLAUDE.md`（v1.1）配置済み  
> **原則**: 設計書 Part を必ず指定し、タスクを1つに絞る  

---

## ▍0. セッション開始時の定型文（毎回コピペ）

```
CLAUDE.md を読んだうえで、以下のタスクに取り掛かってください。
実装前に必ず指定の設計書 Part を `docs/design/` から開いて確認してください。
完了したら `npm run typecheck && npm run test:unit` を実行し、エラーがないことを確認してください。
```

---

## ▍フェーズ 0 — プロジェクト基盤

### タスク 0-1: モノレポ初期化

```
CLAUDE.md と docs/design/SisliR_v10_partAE.md（Part B）を読んでください。

以下を実行してモノレポを初期化してください:

1. `npx create-turbo@latest sisliR --package-manager npm` でTurborepoを作成
2. CLAUDE.md「モノレポ構成」のディレクトリ構造を再現する
3. CLAUDE.md「よく使うコマンド」の全コマンドが動作するように package.json を設定する
4. turbo.json の pipeline を設計書の通りに設定する
5. 完了確認: `npm run typecheck` と `npm run lint` がエラーなしで通ること
```

### タスク 0-2: TypeScript strict mode 設定

```
CLAUDE.md の「絶対ルール #1」を読んでください。

ルートの tsconfig.json を以下の設定で作成してください:
- strict: true
- noImplicitAny: true
- exactOptionalPropertyTypes: true
- noUncheckedIndexedAccess: true
- paths エイリアス: @/lib/* / @/packages/* / @/apps/*

完了確認: `npm run typecheck` がエラーなしで通ること。
`any` 型を1箇所でも使っていたら修正すること。
```

### タスク 0-3: Scene JSON Zod スキーマ実装【最重要】

```
docs/design/SisliR_v10_1_partNN_IntegratedSpec_100point_v1.3.md の
NN.2.1（完全版 scene.ts）を読んでください。

`packages/shared/src/schemas/scene.ts` を作成してください。

必須スキーマ（全て含めること）:
- ImmutablePropertySchema（address/landArea/buildingArea/totalFloors/builtYear/layoutDescription/structure）
- structureSource: 'floorplan_claude_vision' | 'bim_ifc' | 'manual_input' | 'procedural'
  ※ 'floorplan_vlm' は ADR-144 で廃止済み。絶対に使わないこと。
- RoomSchema / WallSchema / OpeningSchema
- MutablePresentationSchema
- PostFXConfigSchema（10種プリセット全て）
- PropertyTypeSchema: 'mansion' | 'kodate' | 'tochi' | 'chintai' | 'jimusho' | 'model_house'
- SceneSchema（version: z.literal('10.0.0')）
- ComplianceTextSchema（宅建業法準拠免責文）

Unit Test を `tests/unit/SceneSchema.test.ts` に作成:
✓ v10.0.0 の正常パース
✓ バージョン不一致でエラー
✓ structureSource に 'floorplan_vlm' を渡したときにエラーになること（ADR-144）
✓ PropertyType に 'model_house' が含まれること
✓ 必須フィールド欠落でエラー
✓ PostFXConfigSchema の 10プリセット全てが valid

完了確認: `npm run test:unit` がエラーなしで通ること。
```

### タスク 0-4: ComplianceChecker 実装

```
docs/design/SisliR_v10_1_partNN_IntegratedSpec_100point_v1.3.md の
NN.3（ComplianceChecker）を読んでください。

`packages/shared/src/lib/ComplianceChecker.ts` を作成してください。

チェック項目（全て実装）:
- 禁止語リスト（最高・No.1・完璧・絶対 など 宅建業法禁止表現）
- catchCopy の文字数上限（40文字）
- AI生成コンテンツへの免責文表示チェック
- ComplianceCheckResult 型: { passed: boolean; violations: string[]; warnings: string[] }

Unit Test を `tests/unit/ComplianceChecker.test.ts` に作成:
✓ 禁止語を含むコピーで passed: false
✓ クリーンなコピーで passed: true
✓ 40文字超で violation
✓ AI生成フラグあり・免責文なしで warning

完了確認: `npm run test:unit` がエラーなしで通ること。
```

### タスク 0-5: SceneAdapter（バージョン変換）実装

```
docs/design/SisliR_v10_partAE.md（Part E.2.3）を読んでください。

`packages/shared/src/lib/SceneAdapter.ts` を作成してください。

- v8.0.0 → v10.0.0 変換
- v9.0.0 → v10.0.0 変換
- v9.1.0 → v10.0.0 変換
- structureSource 'floorplan_vlm' → 'floorplan_claude_vision' への自動変換（ADR-144）
- すでに v10.0.0 の場合は変換なし

Unit Test を `tests/unit/SceneAdapter.test.ts` に作成（上記4ケース全て）。
```

### タスク 0-6: OpenTelemetry 可観測性基盤

```
docs/design/SisliR_v10_partAA_CC.md（Part BB.2 / BB.4）を読んでください。

以下2ファイルを実装してください:

1. `lib/observability/tracer.ts`
   - OpenTelemetry SDK 初期化
   - カスタムメトリクス5種: agentDuration / apiCallCounter / leadCreatedCounter /
     videoGenSuccessRate / lpLoadDuration
   - CLAUDE.md「絶対ルール #5」の外部API呼び出しラッパーパターンを実装

2. `lib/observability/logger.ts`
   - pino ベース構造化ログ
   - console.log / console.error は一切使わない（CLAUDE.md 絶対ルール #6）

Next.js の `apps/web/instrumentation.ts` でトレーサーを初期化する。

完了確認: `npm run typecheck` がエラーなしで通ること。
```

---

## ▍フェーズ 1 — DB・認証・基盤インフラ

### タスク 1-1: Drizzle ORM スキーマ定義

```
docs/design/SisliR_v10_partFM.md（Part M 全体）を読んでください。

`packages/shared/src/db/schema.ts` を作成してください。

コアテーブル（この順番で）:
1. tenants
2. agents
3. properties（gen_*_status カラム全て含む）
4. scenes（scene_json は jsonb 型）
5. property_embeddings（vector(1024) 型）
6. video_quality_logs（vector(1024) 型）
7. higgsfield_credit_usage
8. behavior_logs
9. agent_runs

Growth Loopテーブル:
10. thumbnail_logs
11. leads（status / assigned_agent_id / next_action を含む）
12. utm_tracking
13. ab_variants
14. improvement_queue
15. seo_configs
16. tenant_sitemaps
17. email_intake_logs
18. api_cost_logs（LoopCostTracker用・v10.1新規）

ポータルテーブル:
19. builders（RLS不要・ADR-081）

注意:
- vector 型は drizzle-orm/pg-core の customType で定義
- 全テーブルに created_at TIMESTAMPTZ DEFAULT NOW()
- raw SQL 禁止（CLAUDE.md 絶対ルール #3）

完了確認: `npm run typecheck` がエラーなしで通ること。
```

### タスク 1-2: DB マイグレーション + RLS設定

```
docs/design/SisliR_v10_partFM.md（Part M.4 RLS設定）と
docs/design/SisliR_v10_partAE.md（Part E マイグレーション戦略）を読んでください。

1. `drizzle.config.ts` を作成
2. `npm run db:generate` で SQL を生成
3. Supabase SQL Editor 用スクリプトを `drizzle/migrations/rls_setup.sql` に作成:
   - 全対象テーブルの RLS 有効化
   - テナント分離ポリシー（tenant_id = agents.tenant_id where user_id = auth.uid()）
   - pgvector 拡張: CREATE EXTENSION IF NOT EXISTS vector;
   - HNSW インデックス（property_embeddings）

RLS 対象テーブル（CLAUDE.md に記載）:
properties, scenes, leads, utm_tracking, ab_variants,
thumbnail_logs, improvement_queue, seo_configs, agent_runs,
api_cost_logs, behavior_logs

完了確認: Supabase Studio でRLSが有効になっていること。
```

### タスク 1-3: テストデータファクトリー

```
docs/design/SisliR_v10_partAA_CC.md（Part AA.3）を読んでください。

`packages/shared/src/testing/factories.ts` を作成してください:
- createTestProperty(overrides?)
- createTestScene(overrides?)
- createTestTenant()
- createTestAgent(tenantId)

全テストで import { createTestScene } from '@/packages/shared/testing/factories' を使うこと。
直接オブジェクトリテラルでテストデータを書くことを禁止（ADR-100）。

完了確認: `npm run test:unit` がエラーなしで通ること。
```

---

## ▍フェーズ 2 — エージェント・MCPサーバー

### タスク 2-1: LLM プロバイダー抽象化

```
CLAUDE.md「AIモデル使い分け」表を読んでください。

`lib/ai/provider.ts` を実装してください:

callAI({ task, system, user }) 関数:
- task='copy' | 'extraction' | 'classification' | 'video_prompt' | 'quality_score'
- copy/extraction → claude-sonnet-4-20250514
- classification → claude-haiku-4-5-20251001
- 全呼び出しを OpenTelemetry スパンで囲む（CLAUDE.md 絶対ルール #5）
- タイムアウト: AI_TIMEOUT_MS 環境変数（デフォルト120000）
- anthropic-ai/sdk を使う（Gemini / OpenAI は直接 provider.ts から呼ばない）

Unit Test:
✓ task='copy' で sonnet が選ばれる
✓ task='classification' で haiku が選ばれる
✓ タイムアウト時に SkillResult { ok: false, error: 'timeout' } が返る
```

### タスク 2-2: PropertyIntakeAgent 実装

```
docs/design/SisliR_v10_partFM.md（Part F PropertyIntakeAgent）を読んでください。

`lib/agent/PropertyIntakeAgent.ts` を実装してください。

必須:
- HaltingPolicy（CLAUDE.md 絶対ルール #10）:
  MAX_ITERATIONS=5 / MAX_DURATION_MS=1800000 / COST_LIMIT_JPY=500
- 個人情報の平文保存禁止（CLAUDE.md 絶対ルール #4）:
  リード情報は sha3WithSalt() でハッシュ化してから leads テーブルに insert
- 全ステップを OpenTelemetry スパンで計測
- SceneSchema.safeParse() で Scene JSON を必ずバリデーション
- Skill は SkillResult<T> を返す（CLAUDE.md 絶対ルール #9）

Unit Test:
✓ 正常系: Scene JSON が生成されて返る
✓ HaltingPolicy: MAX_ITERATIONS を超えたら停止
✓ コスト上限: 500円を超えたら停止
```

### タスク 2-3: MCP サーバー群 初期実装（mcp_sisliR_db / mcp_sisliR_storage）

```
CLAUDE.md「MCPサーバーの命名規則」（絶対ルール #8）と
docs/design/SisliR_v10_partFM.md（Part G MCPサーバー仕様）を読んでください。

以下2サーバーを実装してください:

1. apps/mcp/src/servers/mcp_sisliR_db/
   - tools/: getProperty / updateScene / createLead / queryLeads
   - 全ツールで Drizzle ORM を使う（raw SQL 禁止）
   - 全ツールで RLS を考慮（service_role 使用時はコメントで理由を明記）

2. apps/mcp/src/servers/mcp_sisliR_storage/
   - tools/: uploadAsset / getAssetUrl / deleteAsset / listAssets
   - Cloudflare R2 SDK を使う

Unit Test（各サーバーに1本以上）。

完了確認: `npm run typecheck` がエラーなしで通ること。
```

---

## ▍フェーズ 3 — UI・エディタ・LPランタイム

### タスク 3-1: LP エディタ（ScoreEngine 連携）

```
docs/design/SisliR_v10_1_partMM_LPEditor_DesignSpec_v5.3.md と
docs/design/SisliR_v10_1_partNN_IntegratedSpec_100point_v1.3.md（NN.7 ScoreEngine）を
読んでください。

`packages/editor-engine/src/ScoreEngine.ts` を実装してください。

スコア配分（合計100点）:
- structure:      20点（建物構造の完全性）
- compliance:     20点（宅建業法準拠）
- assets:         15点（写真・動画品質）
- emotionDesign:  15点（感情設計）
- aiContent:      10点（AI生成コンテンツ品質）
- performance:    10点（表示速度）
- cta:            10点（CTA配置・文言）

入力: Scene JSON（SceneSchemaで事前バリデーション済みであること）
出力: { total: number; breakdown: ScoreBreakdown; passed: boolean }

Unit Test を `packages/editor-engine/src/__tests__/ScoreEngine.test.ts` に作成:
✓ 全フィールド揃ったシーンで100点近辺のスコア
✓ 禁止語があるシーンで compliance が 0点
✓ 写真なしで assets が 0点
✓ passed は total >= 60 のとき true

完了確認: `npm run test:unit` がエラーなしで通ること。
```

### タスク 3-2: LP Runtime（Three.js WebGPU）

```
docs/design/SisliR_v10_1_partLL_ImmersiveLP_DesignSpec_v1.1.md と
docs/design/SisliR_v10_1_partNN_IntegratedSpec_100point_v1.3.md（NN.4 LPランタイム）を
読んでください。

`apps/runtime/` に LP Runtime を実装してください。

必須:
- Three.js r184（WebGPURenderer 標準・WebGL2 自動フォールバック）（ADR-162.1）
- GSAP 4.x（Theatre.js は禁止・CLAUDE.md 不採用技術）
- 建物構造フィールド（rooms/walls/openings）は Scene JSON から読み取るのみ（編集不可）
- PostFX 10プリセットを全て実装
- Before/After スライダー: setScissorTest を使う（ADR-118）
- コンプライアンス免責文をオーバーレイで常時表示

住宅の壁・柱・窓が変形する Image-to-Video は絶対に使わない（ADR-059）。

パフォーマンス目標:
- LCP < 2.5秒
- 初期ロード後の FPS > 30

完了確認: `npm run dev:runtime` でローカル起動できること。
```

### タスク 3-3: マスター管理画面（Part OO）

```
docs/design/SisliR_v10_1_partOO_MasterAdmin_v1.2_complete.md を読んでください。

`apps/web/app/(dashboard)/master/` に管理画面を実装してください。

必須ページ:
- /master/tenants        テナント一覧・新規登録
- /master/properties     全テナント物件一覧
- /master/orders         受注ワークフロー管理
- /master/agents         エージェント実行ログ
- /master/costs          コスト監視ダッシュボード

認証: Supabase Auth（Clerk は禁止・ADR-013）
監査ログ: 全操作を audit_logs テーブルに記録（ADR-150）
RLS: 全ページで service_role を使う場合はコメントで理由を明記

完了確認: Supabase Auth でログイン後、全ページが 200 で返ること。
```

---

## ▍フェーズ 4 — Growth Loop・SNS・ポータル連携

### タスク 4-1: Chrome 拡張機能（ポータル自動入力）

```
docs/design/SisliR_v10_1_partGG.md（Part GG 全体）を読んでください。

`apps/portal-extension/` に Chrome 拡張機能（Manifest V3）を実装してください。

必須:
- manifest.json（MV3）
- popup/: 物件選択・ポータル選択 UI
- background/: Service Worker・タブ管理
- content/: SUUMO / HOME'S / アットホーム の DOM 自動入力
- field-maps/: suumo.json / homes.json / athome.json（セレクタ設定ファイル）

重要制約（GG.1 設計思想より）:
- 最終送信は必ず人間が行う（ADR-070）。自動送信は絶対に実装しない。
- 自動入力したフィールドは黄色ハイライトで視覚的に明示する
- スクレイピングは行わない（読み取り専用・入力補助のみ）

完了確認: Chrome デベロッパーモードで拡張機能を読み込み、SUUMO入稿画面で
フィールドが黄色ハイライトで入力されること。
```

### タスク 4-2: 動画生成ルーター（VideoGeneratorRouter）

```
docs/design/SisliR_v10_1_partRR_VideoCostOpsPolicy_v1.1.md（Part RR 全体）と
CLAUDE.md「動画生成フォールバック順序」を読んでください。

`lib/video/VideoGeneratorRouter.ts` を実装してください。

フォールバック順序（CLAUDE.md に記載）:
Higgsfield → Runway Gen-4 → Kling AI → OpenCut MCP → ffmpeg

必須:
- 課金前に genStatus が 'done' でないことを確認（CLAUDE.md コスト意識）
- Higgsfield クレジット残量 10% 未満で VIDEO_PROVIDER_PRIORITY を OpenCut 優先に切替
- 住宅の壁・柱・窓が変形する Image-to-Video は絶対に使わない（ADR-059）
- 全プロバイダー呼び出しを OpenTelemetry スパンで計測

Unit Test:
✓ Higgsfield が成功したら他プロバイダーは呼ばれない
✓ Higgsfield 障害時に Runway にフォールバックする
✓ genStatus='done' の場合は呼び出しをスキップする
```

### タスク 4-3: AB テストエンジン（mcp_sisliR_abtest）

```
docs/design/SisliR_v10_1_partQQ_ABTestEngine_v1.1.md（Part QQ 全体）を読んでください。

`apps/mcp/src/servers/mcp_sisliR_abtest/` を実装してください。

tools/:
- createVariant    AB バリアントを ab_variants テーブルに作成
- recordImpression インプレッション記録
- recordConversion コンバージョン記録
- getWinner        統計的有意差を判定してウィナーを返す
- archiveLoser     敗者バリアントをアーカイブ

重要:
- 変更停止の人間承認ゲート（ADR-165）: 自動停止前に承認フローを挟む
- 物件種別ごとに独立した ab_winning_patterns を蓄積（ADR-164）

Unit Test（getWinner の統計計算を含む）。
```

### タスク 4-4: 生成AI画像編集（PhotoAIEditService）

```
docs/design/SisliR_v10_1_partSS_PhotoAIEditPolicy_v1.1.md（Part SS 全体）を読んでください。

`lib/photo/PhotoAIEditService.ts` を実装してください。

必須:
- gpt-image-1 を使う（OPENAI_API_KEY 環境変数）
- デフォルト OFF・テナントが明示的にオプトインした場合のみ実行（ADR-171）
- プラン別月間上限:
  Growth プラン: PHOTO_AI_EDIT_MONTHLY_LIMIT_GROWTH 枚（デフォルト10）
  Premium プラン: PHOTO_AI_EDIT_MONTHLY_LIMIT_PREMIUM 枚（デフォルト50）
- コスト記録: api_cost_logs テーブルに INSERT（ADR-172）
- sharp.js との統合: AI編集 → sharp で JPEG/PNG 変換（WebP は出力しない）

Unit Test:
✓ 月間上限超過時に SkillResult { ok: false, error: 'monthly_limit_exceeded' }
✓ オプトインしていないテナントで SkillResult { ok: false, error: 'not_opted_in' }
```

---

## ▍フェーズ 5 — Part HH（査定・ハザード・CRM）

### タスク 5-1: DB スキーマ拡張（HH）

```
docs/design/SisliR_v10_1_partHH_AssessmentHazardCRM_DesignSpec_v2.0.md（HH.7）と
docs/design/SisliR_v10_1_ClaudeCode_実装指示書追補_PartHH_v1.0.md（タスク2-A）を読んでください。

`packages/shared/src/db/schema.ts` に以下を追記（既存テーブルは変更しない）:
- assessments テーブル
- assessment_comparables テーブル
- customers テーブル
- geo_cache テーブル

既存テーブルへのカラム追加は `drizzle/migrations/YYYYMMDD_hh_schema.sql` で ALTER TABLE。

Unit Test:
✓ 既存の createTestProperty テストが引き続き通る（後方互換確認）
✓ assessments を Zodファクトリーから insert できる
```

---

## ▍共通: よくあるトラブルシューティング指示

### 型エラーが出た場合

```
以下の型エラーを修正してください:
[エラーメッセージをここに貼る]

修正方針:
- any 型は使わない（unknown + 型ガードで絞る）
- as キャストは最小限に（Zodのsafeparseを優先）
- exactOptionalPropertyTypes に注意（undefinedと省略は別物）

修正後: `npm run typecheck` がエラーなしで通ること。
```

### テストが落ちた場合

```
以下のテストが落ちています:
[テスト名とエラーを貼る]

修正前に:
1. テストデータは factories.ts を使っているか確認
2. Scene JSON のバリデーションが通っているか確認
3. structureSource に 'floorplan_vlm' が混入していないか確認（ADR-144）

修正後: `npm run test:unit` が全件グリーンで通ること。
```

### コスト爆発の緊急停止

```
OrchestrationLoop のコスト爆発が疑われます。以下を順番に実行してください:

1. LOOP_EMERGENCY_STOP=true を Vercel/Cloudflare の環境変数に設定
2. Supabase SQL Editor で実行:
   UPDATE jobs SET state='failed'
   WHERE name LIKE 'agent-%' AND state IN ('created', 'active');
3. コスト発生源の確認クエリ（CLAUDE.md「緊急停止手順」参照）を実行して原因を特定
4. 原因が特定できたら LOOP_EMERGENCY_STOP=false に戻す
```

---

## ▍ADR 衝突解消メモ（2026-06-13 棚卸し済み）

実装時に参照する ADR 番号の正引き表:

| 旧番号 | 新番号 | 内容 | 定義元 |
|--------|--------|------|--------|
| ADR-161（Higgsfieldサブスク） | **ADR-168** | Higgsfieldサブスク移行・クレジット日次監視 | CLAUDE.md更新 |
| ADR-162（動画効果データ） | **ADR-169** | 動画効果データWinnerPatternService蓄積 | partQQ/RR |
| ADR-163（画像AI編集レイヤー） | **ADR-170** | 生成AI画像編集を別レイヤーで実装 | partSS |
| ADR-164（画像AI OPT-IN） | **ADR-171** | 生成AI画像編集デフォルトOFF・個別オプトイン | partSS |
| ADR-165（プラン別上限） | **ADR-172** | 生成AI画像編集プラン別月間上限・コスト記録 | partSS |
| ADR-162（WebGL→WebGPU移行） | **ADR-162.1** | WebGPURenderer標準・WebGL2自動フォールバック（フェーズ0から両対応） | partMM v5.2 |

> **注意**: コード内に ADR-161〜165 を書く場合は上記の新番号を使うこと。

---

## ▍環境変数チェックリスト

実装開始前に `.env.local` に全て揃っているか確認:

```bash
# 新形式 Supabase キー（2026 Q4移行済み）
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # 旧: SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY=                     # 旧: SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL=

# AI
ANTHROPIC_API_KEY=
AI_TIMEOUT_MS=120000

# 動画生成
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

# 生成AI画像編集（Part SS）
OPENAI_API_KEY=
PHOTO_AI_EDIT_MONTHLY_LIMIT_GROWTH=10
PHOTO_AI_EDIT_MONTHLY_LIMIT_PREMIUM=50

# 可観測性
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=
GRAFANA_CLOUD_TOKEN=

# ループ制御
LOOP_EMERGENCY_STOP=false
SCENE_VALIDATE_MODE=strict
```

---

*SisliR v10.1 — Claude Code 指示ガイド*  
*作成: 2026-06-15 | 対応設計書: v10.1 (CLAUDE.md v1.1 / ADR棚卸し v1.0)*
