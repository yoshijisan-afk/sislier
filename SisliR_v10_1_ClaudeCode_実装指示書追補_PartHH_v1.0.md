# SisliR v10.1 — Claude Code 実装指示書 追補
## Part HH（売却査定エンジン + ハザード/立地分析 + CRM拡張）実装タスク

> **位置づけ**: 本書は `SisliR_v10_1_partHH_AssessmentHazardCRM_DesignSpec_v1.0.md`
> （以下「Part HH設計書」）に基づく実装タスクの追補である。
> 既存の `実装指示書_v10.1.md` のフェーズ2（Growth Loop構築フェーズ）に
> タスク 2-X として挿入する想定で記述する。
>
> **重要**: 各タスクの冒頭に「Part HH設計書の該当セクションを確認してから
> 着手してください」と記す。既存テーブル・既存MCPサーバーへの**破壊的変更は
> 行わない**（ADR-196・ADR-198参照）。

---

## 前提確認チェックリスト（Part HH着手前）

```
□ 既存フェーズ1（mcp_sisliR_db / mcp_sisliR_doc / properties / leads）が動作確認済み
□ Part E（Scene JSON）の PropertyTypeSchema が実装済み
□ Part F（PropertyIntakeAgent）のべき等性パターンを理解済み
□ J-SHIS Map API の利用規約・APIエンドポイントを確認済み
   （https://www.j-shis.bosai.go.jp/map/ 公開API仕様参照）
□ Google Places API キー取得済み（周辺施設検索用・既存の places_search 連携と共通キーで可）
```

---

# タスク 2-A: DBスキーマ拡張（assessments / customers / geo_cache）

```
設計書参照: Part HH.7（DBスキーマ追加）
優先度: 最高（後続タスクすべての前提）
見積もり: 1〜2時間
```

`packages/shared/src/db/schema.ts` に以下を**追記**（既存テーブル定義は変更しない）:

1. `assessments` テーブル（pgTable）
2. `assessment_comparables` テーブル
3. `customers` テーブル
4. `geo_cache` テーブル

既存テーブルへのカラム追加（マイグレーションファイルで`ALTER TABLE`）:

```sql
-- leads
ALTER TABLE leads ADD COLUMN customer_id UUID REFERENCES customers(id);
CREATE INDEX ON leads (customer_id);

-- properties
ALTER TABLE properties ADD COLUMN source_assessment_id UUID REFERENCES assessments(id);
ALTER TABLE properties ADD COLUMN completion_date     TEXT;
ALTER TABLE properties ADD COLUMN structure           TEXT;
ALTER TABLE properties ADD COLUMN parking_info        TEXT;
ALTER TABLE properties ADD COLUMN renovation_history  TEXT;
ALTER TABLE properties ADD COLUMN current_status      TEXT;
ALTER TABLE properties ADD COLUMN land_category       TEXT;
ALTER TABLE properties ADD COLUMN building_condition  TEXT;
ALTER TABLE properties ADD COLUMN city_planning       TEXT;
ALTER TABLE properties ADD COLUMN use_district        TEXT;
ALTER TABLE properties ADD COLUMN road_access         TEXT;
ALTER TABLE properties ADD COLUMN model_house_open_period TEXT;
```

`customer_followup_stats` マテリアライズドビュー（HH.7.2）を作成。

**Unit Test 作成（必須）:**
```
tests/unit/schema-hh.test.ts
✓ assessments を Zodファクトリーから insert できる
✓ leads.customer_id が null のまま既存のlead作成テストが通る（後方互換確認）
✓ properties の新規optionalカラムがすべて未設定でも既存テストが通る
```

---

# タスク 2-B: Scene JSON スキーマ拡張（PropertyInfoSchemaExtension）

```
設計書参照: Part HH.9（Scene JSON拡張）
優先度: 高
見積もり: 1時間
```

`packages/shared/src/schemas/scene.ts` に以下を追加:

1. `HazardSummarySchema`（earthquake / flood / landslide）
2. `PropertyInfoSchemaExtension`（newBuild/preowned/land/modelHouse別フィールド）
3. 既存`PropertyInfoSchema`への`.merge(PropertyInfoSchemaExtension)`適用

**注意**: 全フィールドを`.optional()`にすること。既存のScene JSONレコードに
新規フィールドが存在しなくてもZodパースが失敗しないことを確認する。

**Unit Test 作成（必須）:**
```
tests/unit/scene-schema-hh.test.ts
✓ 既存（v10.0時点）のテストフィクスチャScene JSONがパースできる（後方互換）
✓ newBuild物件で completionDate/structure/parkingInfo を含むデータがパースできる
✓ land物件で landCategory/cityPlanning/useDistrict/roadAccess を含むデータがパースできる
✓ hazardSummary を含む/含まない両方のデータがパースできる
```

---

# タスク 2-C: mcp_sisliR_geo 実装

```
設計書参照: Part HH.3（ハザード・立地分析）
優先度: 高
見積もり: 3〜4時間
```

`packages/mcp-servers/src/sisliR-geo/` を新規作成。

**実装する関数:**

```typescript
// lib/agent/GeoAnalyzer.ts

async function getHazardSummary(lat: number, lng: number): Promise<HazardSummary> {
  // 1. geo_cache をチェック（lat/lng一致・expires_at未到達）
  // 2. キャッシュなし → J-SHIS Map API を呼び出し
  //    - 地震: PGV30値取得 → probabilityRank算出（low/medium/high/very_high）
  //    - 洪水・土砂災害: 国交省ハザードマップポータルWMS/タイル参照
  // 3. geo_cache へ保存（expires_at = NOW() + 90日）
  // 4. HazardSummary を返す
}

async function getNearbyFacilities(lat: number, lng: number, radiusM = 1000): Promise<NearbyFacilities> {
  // Google Places API で学校・病院・スーパー・駅を検索
  // geo_cache.facilities_json にも保存（同90日キャッシュ）
}
```

**MCPツール定義:**

```typescript
{
  name: 'analyze_location',
  description: 'Part HH.3: 緯度経度からハザード情報と周辺施設を取得',
  inputSchema: { lat: number, lng: number, radius_m?: number },
}
```

**エラーハンドリング方針（Part HH.2.2 HH-Step3準拠）:**
- J-SHIS APIタイムアウト時は`hazardSummary: null`を返し、呼び出し元（AssessmentAgent）
  の処理は継続させる（査定全体を失敗させない）。
- Google Places APIエラー時は`facilities: { schools: [], hospitals: [], supermarkets: [], stations: [] }`
  （空配列）を返す。

**Integration Test 作成（必須）:**
```
tests/integration/mcp-sisliR-geo.test.ts
✓ 既知の地点（テスト用緯度経度）でhazardSummaryが取得できる
✓ geo_cacheが90日以内なら2回目の呼び出しでAPI呼び出しがスキップされる（モック検証）
✓ J-SHIS APIタイムアウト時にhazardSummary: nullで正常終了する
```

---

# タスク 2-D: AssessmentAgent 実装

```
設計書参照: Part HH.2（売却査定エンジン）
優先度: 高
見積もり: 4〜6時間
```

`apps/web/lib/agent/AssessmentAgent.ts` を新規作成。

**Step構成（Part HH.2.2の表に従い、PropertyIntakeAgentのべき等性パターン
（Part F既存実装）を継承して実装）:**

| Step | 関数名 | 備考 |
|------|--------|------|
| HH-Step1 | `normalizeAndGeocode(input)` | 住所→緯度経度。失敗時も継続 |
| HH-Step2 | `findComparables(input, lat, lng)` | property_embeddingsのpgvectorセマンティック検索（既存`search_properties_semantic`関数を再利用） |
| HH-Step3 | `analyzeLocation(lat, lng)` | タスク2-Cの`mcp_sisliR_geo`呼び出し |
| HH-Step4 | `calculatePriceRange(input, comparables, hazard)` | claude-sonnet-4-6呼び出し。価格レンジ + methodologyNote生成 |
| HH-Step5 | `generateReport(assessmentId)` | タスク2-E（PDF生成）呼び出し |
| HH-Step6 | `registerLead(assessmentId, input)` | leadsテーブルへ`status='assessment_requested'`で登録（重複防止: raw_email_hash流用） |

**HH-Step4 プロンプト設計上の必須要件（ADR-193・ADR-199準拠）:**
- 出力に**必ず**「本査定は概算であり鑑定評価ではない」旨の免責文を含めること
  （`methodologyNote`の末尾に固定文言として付加。Claudeの生成テキストとは
  別に、システム側で固定文言を結合する実装にすること＝法令遵守の確実性のため）。
- 比較事例（comparables）が0件の場合は`confidenceLevel: 'low'`を返し、
  `methodologyNote`に「事例データが不足しているため参考値です」と明記。

**Unit Test 作成（必須）:**
```
tests/unit/AssessmentAgent.test.ts
✓ 各Stepが単独で冪等に実行できる
✓ HH-Step3が失敗（hazardSummary: null）でもHH-Step4以降が継続する
✓ comparables 0件時にconfidenceLevel: 'low'になる
✓ methodologyNoteに免責文言が必ず含まれる
✓ 同一inputでHH-Step1〜2を再実行した場合、結果が一致する（べき等性）
```

---

# タスク 2-E: 査定レポートPDFテンプレート + mcp_sisliR_assessment

```
設計書参照: Part HH.4（査定レポートPDF生成）、ADR-198
優先度: 中
見積もり: 2〜3時間
```

**重要（ADR-198）**: PDF生成エンジンは新規実装しない。既存`mcp_sisliR_doc`
（Puppeteer・パンフレットPDFと同じレンダリングパイプライン）に
新規テンプレートのみを追加する。

`apps/web/templates/assessment-report.html`（Puppeteerでレンダリング）:

Part HH.4.1の7セクション構成（表紙・査定価格レンジ・査定根拠・
近隣比較事例一覧・ハザード/周辺環境情報・媒介契約のご案内・免責事項）を実装。

`packages/mcp-servers/src/sisliR-assessment/` を新規作成し、
`generate_assessment_report(assessmentId)` ツールを実装。
内部で`mcp_sisliR_doc`の既存PDF生成関数を呼び出す。

**E2E Test 作成（必須）:**
```
tests/e2e/assessment-report.spec.ts
✓ assessmentレコードからPDFが生成され、R2に保存される
✓ 生成されたPDFに「本査定は概算であり鑑定評価ではない」の免責文が含まれる
✓ comparables 0件のケースでもPDF生成が失敗しない
```

---

# タスク 2-F: 査定依頼LP + 受任フロー（assessments → properties 合流）

```
設計書参照: Part HH.1.2（全体像）、Part HH.10（イベント駆動フロー拡張）
優先度: 高
見積もり: 3〜4時間
```

1. `apps/web/app/assessment/page.tsx` — 査定依頼フォーム（公開LP）
   - 入力: propertyType / address / landArea / buildingArea / builtYear / layout / ownerContact
   - 送信時: AssessmentAgent（タスク2-D）を非同期実行（pg-boss既存キュー利用）

2. `apps/web/app/admin/assessments/[id]/page.tsx` — 査定結果確認・受任操作画面
   - 「受任（媒介契約）」ボタン押下時の処理:
     ```typescript
     async function convertAssessmentToProperty(assessmentId: string) {
       const assessment = await getAssessment(assessmentId)
       const property = await createProperty({
         tenantId: assessment.tenantId,
         propertyType: assessment.propertyType,
         address: assessment.address,
         landArea: assessment.landArea,
         buildingArea: assessment.buildingArea,
         builtYear: assessment.builtYear,
         layout: assessment.layout,
         sourceAssessmentId: assessment.id,
         status: 'draft',
       })
       await updateAssessment(assessmentId, {
         status: 'contracted',
         convertedPropertyId: property.id,
       })
       // Scene JSON初期値にハザード情報・比較事例サマリーを引き継ぐ
       await initializeSceneFromAssessment(property.id, assessment)
       // 既存PropertyIntakeAgentフロー（Part F）へ合流
       return property.id
     }
     ```

**Integration Test 作成（必須）:**
```
tests/integration/assessment-to-property.test.ts
✓ 査定依頼→AssessmentAgent実行→レポート生成までが完了する
✓ 受任操作によりpropertiesレコードが作成され、source_assessment_idが設定される
✓ Scene JSON初期値にhazardSummaryとcomparablesサマリーが反映される
✓ 受任後、既存PropertyIntakeAgentフロー（gen_photo_status等）が正常に開始される
```

---

# タスク 2-G: customers テーブル運用 + フォローアップ通知

```
設計書参照: Part HH.5（CRM拡張）、ADR-196・ADR-197
優先度: 中
見積もり: 2〜3時間
```

1. `apps/web/app/admin/customers/page.tsx` — 顧客一覧・問い合わせ履歴表示
   - `customers` + `leads`（customer_id経由）+ `assessments`（customer_id経由）を統合表示

2. フォローアップ通知Skill（Part DD OrchestrationLoopから呼び出し）:
   ```typescript
   // packages/agent-loop/src/skills/CustomerFollowupSkill.ts
   // 既存Skill実装パターン（SkillResult<T>を返す・例外を外に漏らさない）に準拠
   export async function checkOverdueFollowups(): Promise<SkillResult<{ notified: number }>> {
     // customers.next_action_at < NOW() のレコードを抽出
     // 担当エージェントへ通知（既存通知チャネル: 完了通知メール基盤を再利用）
   }
   ```
   既存`turbo.json`のcron設定（5分間隔）にこのSkillを追加登録。
   MAX_ITERATIONS・タイムアウト等のHaltingポリシー（ADR-102）を適用すること。

**Unit Test 作成（必須）:**
```
tests/unit/CustomerFollowupSkill.test.ts
✓ next_action_atが過去のcustomersが正しく抽出される
✓ Skillが例外をスローせずSkillResult<T>を返す（失敗時もresult.success: false）
✓ Haltingポリシー（MAX_ITERATIONS）が機能する
```

---

# タスク 2-H: SUUMO_FIELDS 物件種別別拡張 + Part GG field-maps variants

```
設計書参照: Part HH.6（物件種別別 SUUMO入稿フィールド網羅性）
優先度: 中
見積もり: 2時間
```

1. `packages/mcp-servers/src/sisliR-portal/lib/suumoFields.ts` を更新:
   - `SUUMO_FIELDS_BASE` + `SUUMO_FIELDS_BY_TYPE`（Part HH.6.2のコードをそのまま実装）
   - `buildSuumoFields(property)` 関数を既存CSV生成処理から呼び出すよう変更
   - **既存呼び出し元のインターフェース（戻り値の型）は変更しない**こと

2. Chrome拡張（Part GG）`field-maps/suumo.json`:
   - `variants`構造（newBuild/preowned/land別urlPattern）を追加（Part HH.6.3）
   - 既存`urlPattern`（汎用）はフォールバックとして残す

**Unit Test 作成（必須）:**
```
tests/unit/suumoFields.test.ts
✓ newBuild物件で completionDate/structure/parkingInfo がCSVに含まれる
✓ preowned物件で renovationHistory/currentStatus がCSVに含まれる
✓ land物件で landCategory/cityPlanning/useDistrict/roadAccess がCSVに含まれる
✓ 物件種別未対応フィールドがundefinedの場合、空文字列として出力される（CSVカラム数が崩れない）
✓ 既存（v10.0時点）のCSV生成テストが変更なく通る（後方互換）
```

---

# Phase 2完了定義（DoD）への追加（Part HH分）

既存Part Q.4のDoDに以下を追加する:

```
□ 査定依頼LPから査定レポートPDF生成までが10分以内に完了する
□ hazardSummaryがJ-SHIS API障害時もnullで査定処理全体を止めない（HH-Step3）
□ 受任操作でproperties.source_assessment_idが正しく設定され、
  Scene JSONにハザード/比較事例情報が初期値として引き継がれる
□ customer_followup_stats マテリアライズドビューがGrafana Cloudで可視化されている
□ SUUMO_FIELDS が物件種別（newBuild/preowned/land/landSingle/modelHouse）
  ごとに正しいフィールドセットを出力する（既存テストは変更なく通過）
□ 全ての新規テーブル・カラムがnullable/optionalであり、
  既存（v10.0/v10.1）テストスイートに回帰がないことを確認済み
```

---

**作成者**: Claude (Sonnet 4.6)
**最終更新**: 2026年6月15日
**バージョン**: v1.0
