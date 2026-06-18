# Part HH — 売却査定エンジン + ハザード/立地分析 + CRM拡張設計（v10.1追加）
## Assessment Engine / Hazard & Location Analysis / CRM Extension
### v2.0 — 不動産情報ライブラリ（国交省API）連携 + 査定手動編集機能 改訂版

> **位置づけ**: PROPAI（旧Electron版・不動産統合管理システム）の機能調査により、
> SisliRに不足している「これから売却する物件の査定（入口機能）」「ハザード・立地分析」
> 「CRM・反響後の顧客管理」「物件種別ごとのSUUMO入稿フィールド網羅性」を
> SisliRの設計5原則（Asset First / Agent First / Digital Twin First /
> Growth Loop First / Observable First）に適合する形で追加する。
>
> **本Partは既存設計を変更しない。** Part E（Scene JSON）・Part M（DB設計）・
> Part F（PropertyIntakeAgent & MCP）・Part O（ポータル連動）・Part Z（反響CMS）
> に対する**追加レイヤー**として定義する。
>
> ### v2.0での変更点（v1.0からの改訂）
>
> | 変更点 | 理由 |
> |--------|------|
> | ハザード・周辺施設・取引事例の主データソースを「不動産情報ライブラリ」（国土交通省reinfolib API）に統一 | J-SHIS単体 + Google Places個別連携より、単一の無料公的APIで取引価格・成約価格・ハザード10種以上・周辺施設・地価公示を一括取得できる（HH.3改訂） |
> | `assessment_comparables`の事例ソースに国の成約価格データ（XIT001/XPT001）を追加 | 自社実績ゼロのテナントでも初回査定から公的事例で価格レンジを裏付けられる（HH.2改訂・ADR-193改訂） |
> | 査定結果（価格レンジ・比較事例・ハザード表示）を担当者が**手動編集可能**にする機能を追加 | AI算出結果をそのまま顧客提示するのではなく、現場の知見（リフォーム状況・近隣特性等）を反映した最終調整を担当者が行えるようにする（HH.2.3新設・ADR-200） |
> | `mcp_sisliR_geo` → `mcp_sisliR_market`に名称変更し、reinfolib連携を担う | 「地理空間データ」より「市場・価格・ハザード情報」の役割が主であるため命名を実態に合わせる |
> | ADR-194（J-SHIS第一候補）をADR-201として置き換え | reinfolib統合方針に変更 |

---

## 目次

- [HH.1 全体像 — 査定をGrowth Loopの入口にする](#hh1)
- [HH.2 売却査定エンジン（AssessmentAgent）](#hh2)
- [HH.3 不動産情報ライブラリ連携（mcp_sisliR_market）](#hh3)
- [HH.4 査定レポートPDF生成](#hh4)
- [HH.5 CRM拡張（leads → customers 拡張）](#hh5)
- [HH.6 物件種別別 SUUMO入稿フィールド網羅性](#hh6)
- [HH.7 DBスキーマ追加](#hh7)
- [HH.8 MCPサーバー追加](#hh8)
- [HH.9 Scene JSON拡張](#hh9)
- [HH.10 イベント駆動フロー拡張](#hh10)
- [HH.11 プライシングへの影響](#hh11)
- [HH.12 実装ロードマップ](#hh12)
- [HH.13 ADR追加分（ADR-193〜202）](#hh13)

---

## HH.1 全体像 — 査定をGrowth Loopの入口にする {#hh1}

### HH.1.1 課題

SisliRは「販売中物件のLP生成・集客・反響・改善ループ」を中心に設計されているが、
**「これから売却したい」という相談者（オーナー）が最初に接触する機能が存在しない**。

PROPAI（旧Electron版）にはAssessmentManager（査定管理）が存在し、不動産業者の
業務フローは以下の順序で発生する：

```
① オーナーから売却相談
② 査定（相場算出・査定レポート提示）
③ 媒介契約（受任）
④ 物件素材登録 → SisliRの自動マーケティングフローへ
```

SisliRは③以降のみをカバーしており、①②が欠落している。

### HH.1.2 設計方針

査定機能を**「LPの一種」**として実装することで、Asset First / Growth Loop First
の原則を維持する。

```
[査定依頼LP]（公開・SEO流入対象）
  オーナーが住所・物件種別・面積等を入力
       ↓
  AssessmentAgent（claude-sonnet-4-6）が
  ・国交省「不動産情報ライブラリ」の成約価格・取引価格事例（HH.3）
  ・property_embeddings（自社実績）のセマンティック検索
  ・ハザード・周辺施設情報（HH.3・同一API）
  を元に査定価格レンジ（ドラフト）を算出
       ↓
  【担当者レビュー画面】（HH.2.3新設）
  ・AI算出結果（価格レンジ・比較事例・ハザード表示）を確認
  ・必要に応じて価格レンジ・比較事例の採否・コメントを手動編集
  ・編集内容は assessments.manual_override_json に保存し、
    AI算出値（ai_generated_json）は変更せず保持（差分管理）
       ↓
  査定レポートPDF生成（Part Z既存Puppeteer基盤を流用・手動編集後の値を反映）
       ↓
  leads テーブルに status='assessment_requested' で登録
  （HH.5 CRM拡張）
       ↓
  担当者が査定結果を提示・フォローアップ
       ↓ 受任（媒介契約）
  properties テーブルへレコード作成
  → assessment_id を properties.source_assessment_id に紐付け
  → 通常のPropertyIntakeAgentフロー（Part F）へ移行
```

これにより、**「査定 → 受任 → 自動マーケティング → 反響 → 成約」**の
一気通貫フローが、すべて既存のleads/properties/scenesテーブルの
延長として実現される。新規テーブルは最小限
（assessments・assessment_comparables・customers拡張のみ）に留める。

> **設計原則の追加**: 査定価格は**「AIドラフト + 人間の最終承認・編集」**を
> 必須プロセスとする。Part DD ADR-105（requiresApproval=trueのSkillChainは
> 担当者承認後に実行）の思想を査定にも適用し、査定書を顧客に提示する前に
> 必ず担当者が確認・編集できる状態を経由させる（HH.2.3・ADR-200）。

---

## HH.2 売却査定エンジン（AssessmentAgent） {#hh2}

### HH.2.1 査定方式

| 方式 | 内容 | 実装難易度 | v2.0採用 |
|------|------|-----------|---------|
| 取引事例比較法（公的データ+自社実績） | 不動産情報ライブラリの成約価格・取引価格事例（同一市区町村・類似面積帯・直近数年）+ 自社property_embeddings実績から㎡単価を算出し補正 | 中 | ✅ |
| 地価公示・地価調査による補正 | 不動産情報ライブラリXPT002（地価公示・地価調査ポイント）で土地評価を補強 | 低 | ✅（土地・landSingle向け） |
| 原価法（簡易） | 再調達価格 − 経年減価（戸建て向け） | 低 | ✅ |
| 収益分析法 | 賃貸想定収益からの逆算（投資物件向け） | 中 | ⏸ Phase2以降 |
| AI回帰モデル独自構築 | 機械学習による価格予測モデル | 高 | ❌ 不採用 |

> **ADR-193（改訂）**: 査定は「取引事例比較法（不動産情報ライブラリの公的
> 成約価格・取引価格データ + 自社実績のハイブリッド）+ 地価公示補正
> （土地系）+ 原価法（簡易・戸建て系）」とし、独自AI価格予測モデルは
> 構築しない。事例ソースとして公的データ（reinfolib）を**第一優先**とする
> ことで、自社実績が少ない新規テナントでも一定の事例件数を確保できる。
> 算出結果は必ずHH.2.3の担当者レビューを経て確定する。

### HH.2.2 AssessmentAgent 処理フロー

```typescript
// lib/agent/AssessmentAgent.ts

interface AssessmentInput {
  propertyType: PropertyTypeSchema  // 既存enum流用（newBuild/land/preowned/landSingle/modelHouse）
  address: string
  landArea?: number
  buildingArea?: number
  builtYear?: number
  layout?: string
  ownerName?: string
  ownerContact: { email?: string; phone?: string; line?: string }
  requestSource: 'lp' | 'portal' | 'referral' | 'manual'
}

interface AssessmentResult {
  priceRangeLow:  number
  priceRangeMid:  number
  priceRangeHigh: number
  pricePerSqmLand?: number
  pricePerSqmBuilding?: number
  landPriceReference?: number       // 地価公示・地価調査参考値（HH.3 XPT002）
  comparables: AssessmentComparable[]   // 国交省成約事例 + 自社実績（HH.7参照）
  hazardSummary: HazardSummary          // HH.3連携
  methodologyNote: string                // Claudeが生成する査定根拠テキスト
  confidenceLevel: 'high' | 'medium' | 'low'  // 事例件数に応じた信頼度
}
```

**Step構成（PropertyIntakeAgentのべき等性設計パターンを継承・Part F参照）:**

| Step | 処理 | 冪等性 | 失敗時の挙動 |
|------|------|--------|------------|
| HH-Step1 | 入力正規化・ジオコーディング（住所→緯度経度・市区町村コード） | ✅ べき等 | リトライ3回・失敗時は緯度経度なしで継続 |
| HH-Step2 | mcp_sisliR_market呼び出し（HH.3：成約価格事例・地価公示・ハザード・周辺施設を一括取得） | ✅ べき等 | タイムアウト時は当該データ項目をnullで継続（査定自体は止めない） |
| HH-Step3 | property_embeddingsから類似物件セマンティック検索（自社実績の補強事例） | ✅ べき等 | 事例ゼロ件でも継続（reinfolib事例が優先のため） |
| HH-Step4 | Claude（claude-sonnet-4-6）が公的事例・自社実績・地価公示・ハザード情報から価格レンジ算出 + 根拠テキスト生成（ai_generated_json） | ✅ べき等（同入力→キャッシュ可） | 算出不能時はconfidenceLevel='low' |
| HH-Step5 | 【担当者レビュー】管理画面で表示・手動編集（HH.2.3） | - | 担当者操作待ち（pendingステータスのまま保持） |
| HH-Step6 | 査定レポートPDF生成（HH.4・手動編集後の値で生成） | ✅ べき等・R2上書き可 | Puppeteerリトライ2回 |
| HH-Step7 | leadsテーブルへ登録（status='assessment_requested'） | ✅ べき等（重複防止: raw_email_hash流用） | - |

> 価格算出（HH-Step4）はClaudeの**自然言語推論 + 公的データに基づく
> 「価格レンジ提示」**であり、「断定的な鑑定評価」ではないことをレポート・
> LP上に明記する（ADR-199）。HH-Step5（担当者レビュー）を経るまで、
> 査定結果は`status='draft'`のままオーナーには通知されない（ADR-200）。

### HH.2.3 担当者レビュー・手動編集機能（新設）

```
管理画面: /admin/assessments/{id}/review

┌─────────────────────────────────────────────┐
│ AI算出結果（ai_generated_json・読み取り専用表示）│
│  価格レンジ: 3,200万円 〜 3,600万円 〜 4,000万円  │
│  比較事例: 5件（reinfolib成約事例3件 + 自社2件） │
│  ハザード: 地震リスク[中] 洪水[低] 液状化[低]    │
│  根拠テキスト: 「...」                          │
└─────────────────────────────────────────────┘
            ↓ 担当者が編集
┌─────────────────────────────────────────────┐
│ 最終査定内容（manual_override_json・編集可）     │
│  価格レンジ: [3,300万円] 〜 [3,700万円] 〜 [4,100万円]│
│   └ 編集理由メモ: 「リフォーム済みのため+100万円補正」│
│  比較事例: チェックボックスで採用/除外を選択      │
│   └ 事例を手動追加（自社の未登録成約事例等）も可  │
│  ハザード表示: 表示/非表示切替（個別項目単位）    │
│  根拠テキスト: テキストエリアで自由編集（AI生成文を初期値として表示）│
└─────────────────────────────────────────────┘
            ↓ 「査定確定・レポート生成」ボタン
  status: 'draft' → 'reviewed' → レポートPDF生成（HH-Step6へ）
```

**編集ルール:**

| 項目 | 編集可否 | 保存先 |
|------|---------|--------|
| 価格レンジ（低・中央・高） | ✅ 自由編集 | `manual_override_json.priceRange*` |
| 比較事例の採否 | ✅ チェックボックスで選択 | `manual_override_json.comparableIds`（採用するIDの配列） |
| 比較事例の手動追加 | ✅ 住所概略・価格・面積等を直接入力可 | `assessment_comparables`に`source='manual'`で追加レコード作成 |
| ハザード情報の表示/非表示 | ✅ 項目単位でON/OFF | `manual_override_json.hazardDisplayFlags` |
| 査定根拠テキスト | ✅ 自由編集（AI生成文を初期値表示） | `manual_override_json.methodologyNote` |
| AI算出値（ai_generated_json） | ❌ 編集不可（履歴として保持） | 変更なし |

> **ADR-200**: AI算出結果（`ai_generated_json`）と担当者編集結果
> （`manual_override_json`）を分離して保存し、レポート生成時は
> `manual_override_json`が存在する場合はそれを優先、存在しない場合は
> `ai_generated_json`を使用する（COALESCE方式）。これにより
> 「AIが何を出力し、人間が何を変更したか」を常に追跡可能にし、
> Part BB（可観測性）でAI算出値と最終提示値の差分を継続的にモニタリング
> できる（査定精度改善のフィードバックループにも利用）。

---

## HH.3 不動産情報ライブラリ連携（mcp_sisliR_market） {#hh3}

PROPAIの`geospatial.js`（立地分析）・`jshis.js`（地震ハザード情報）に相当する
機能、および取引事例データの取得を、**国土交通省「不動産情報ライブラリ」
（reinfolib.mlit.go.jp）API**への統一連携として実装する。

### HH.3.1 採用するAPI一覧

不動産情報ライブラリは**単一のAPIキー**（無料・利用申請後5営業日程度で発行）
で以下すべてを取得できる。

| ID | 用途 | Part HH内での利用箇所 |
|----|------|---------------------|
| XIT001 / XPT001 | 不動産取引価格・成約価格情報（2021年Q1以降の成約価格を含む） | HH.2 HH-Step2: `assessment_comparables`の公的事例ソース（**最重要**） |
| XPT002 | 地価公示・地価調査のポイント | HH.2: `landPriceReference`（土地評価の補正参考値） |
| XCT001 | 鑑定評価書情報（地価公示） | 査定レポートの補足情報（任意） |
| XKT025 | 地形区分に基づく液状化の発生傾向図 | HH.3.2 `hazardSummary.liquefaction` |
| XKT026 | 洪水浸水想定区域（想定最大規模） | HH.3.2 `hazardSummary.flood` |
| XKT027 | 高潮浸水想定区域 | HH.3.2 `hazardSummary.stormSurge`（沿岸エリアのみ） |
| XKT028 | 津波浸水想定 | HH.3.2 `hazardSummary.tsunami`（沿岸エリアのみ） |
| XKT029 | 土砂災害警戒区域 | HH.3.2 `hazardSummary.landslide` |
| XKT021 / XKT022 | 地すべり防止区域・急傾斜地崩壊危険区域 | HH.3.2 `hazardSummary.landslide`の補強 |
| XKT020 | 大規模盛土造成地マップ | HH.3.2 `hazardSummary.largeScaleFill` |
| XST001 | 災害履歴（国土調査） | HH.3.2 `hazardSummary.disasterHistory` |
| XKT004〜007 / XKT010 / XKT011 / XKT017 / XKT018 | 周辺施設（小中学校区・学校・保育園・医療機関・福祉施設・図書館・役場等） | HH.3.3 `nearbyFacilities` |
| XKT015 | 駅別乗降客数 | HH.3.3 `nearbyFacilities.stations`の補強（交通利便性の参考指標） |
| XKT002 / XKT006など | 用途地域・都市計画系（HH.6の土地物件フィールドとも連携） | `landCategory`/`cityPlanning`/`useDistrict`の自動補完候補（任意・Phase2） |

地震動の確率情報（J-SHIS相当）については、不動産情報ライブラリ側の
API一覧に専用エンドポイントが含まれないため、**J-SHIS Map APIは継続して
併用**する（HH.3.2参照）。

> **ADR-201（ADR-194の置き換え）**: ハザード・周辺施設・取引/成約価格事例
> の主データソースを「不動産情報ライブラリ」に統一する。これにより、
> ・取引事例比較法に必要な公的成約価格データを直接取得できる（査定精度向上の核心）
> ・洪水/高潮/津波/土砂災害/液状化/地すべり/急傾斜地/大規模盛土/災害履歴
>   という10種類のハザード情報を単一APIキーで一括管理できる
> ・周辺施設情報（学区・医療・福祉等）も同APIで取得でき、Google Places APIへの
>   従量課金依存を減らせる
> という利点がある。地震動確率（PGV30）のみJ-SHIS Map APIを併用する
> （無料・ADR-194の該当部分は継続）。API利用申請（個人/法人・5営業日審査）
> が前提条件となるため、実装着手前にAPIキー取得を完了させること
> （タスク2-C前提条件に追加）。

### HH.3.2 mcp_sisliR_market インターフェース

```typescript
// MCPツール定義

interface MarketAnalysisInput {
  lat: number
  lng: number
  prefCode?: string      // XIT001等で必要な都道府県コード
  cityCode?: string      // XIT001等で必要な市区町村コード
  propertyType: PropertyTypeSchema
  landArea?: number
  buildingArea?: number
  radius_m?: number       // 周辺施設検索半径。デフォルト1000m
}

interface MarketComparablesResult {
  comparables: Array<{
    transactionPrice: number
    landAreaSqm?: number
    buildingAreaSqm?: number
    pricePerSqmLand?: number
    pricePerSqmBuilding?: number
    period: string          // 例: '2025Q3'
    cityAreaSummary: string // 概略地名（reinfolibの提供粒度に準拠・個人情報含まず）
    transactionType: 'transaction' | 'agreement' // 取引価格 or 成約価格
  }>
  landPriceReference?: {
    pricePerSqm: number
    pointName: string
    surveyYear: number
  }
}

interface HazardSummary {
  earthquake?: {
    probabilityRank: 'low' | 'medium' | 'high' | 'very_high'
    pgv30: number
    sourceUrl: string   // J-SHIS（継続併用）
  }
  flood?:          { riskLevel: 'none' | 'low' | 'medium' | 'high'; sourceUrl: string }
  stormSurge?:     { riskLevel: 'none' | 'low' | 'medium' | 'high'; sourceUrl: string }
  tsunami?:        { riskLevel: 'none' | 'low' | 'medium' | 'high'; sourceUrl: string }
  landslide?:      { riskZone: boolean; sourceUrl: string }
  liquefaction?:   { riskLevel: 'low' | 'medium' | 'high'; sourceUrl: string }
  largeScaleFill?: { withinZone: boolean; sourceUrl: string }
  disasterHistory?: { records: Array<{ type: string; year?: number }>; sourceUrl: string }
}

interface NearbyFacilities {
  schoolDistricts: { elementary?: string; juniorHigh?: string }
  schools:      FacilityInfo[]
  hospitals:    FacilityInfo[]
  welfare:      FacilityInfo[]
  libraries:    FacilityInfo[]
  governmentOffices: FacilityInfo[]
  stations:     Array<FacilityInfo & { annualPassengers?: number }>  // XKT015連携
}

interface FacilityInfo {
  name: string
  distanceM?: number
  category: string
}
```

**MCPツール一覧（mcp_sisliR_market）:**

```typescript
get_market_comparables(input: MarketAnalysisInput): Promise<MarketComparablesResult>
  // XIT001 / XPT001 / XPT002 を呼び出し

get_hazard_summary(lat: number, lng: number): Promise<HazardSummary>
  // XKT020/021/022/025/026/027/028/029 + XST001（reinfolib） + J-SHIS Map API（地震動）

get_nearby_facilities(lat: number, lng: number, radius_m?: number): Promise<NearbyFacilities>
  // XKT004/005/006/007/010/011/015/017/018（reinfolib）
```

### HH.3.3 LP・査定レポートへの組み込み

| 用途 | 表示内容 | 既存連携先 |
|------|---------|-----------|
| 査定レポートPDF | 価格レンジ・比較事例（reinfolib成約事例+自社実績）・ハザード10項目・周辺施設 | HH.4 |
| 物件LP（販売中） | 「周辺環境」セクションに統合（Part W: AdCreativeAxisSchemaの`access`軸と連携） | Part K（LP Runtime） |
| ImprovementAgent | `price_section_dropout`改善時、地価公示参考値・周辺相場情報・ハザード低リスクを訴求軸として追加提案 | Part U（自動改善ループ） |

> **ADR-195（継続）**: ハザード情報は「リスクを煽る」表現を避け、
> 「公的データに基づく客観情報の提示」として中立的に表現する
> （ADテキスト生成プロンプトのガードレールに明記・法令遵守チェック対象）。
> Part N（ComplianceChecker）の禁止表現リストに「ハザード関連の誇大表現」
> （例:「絶対安全」「リスクゼロ」）を追加する。HH.3.2で項目数が10種に
> 増えたため、担当者が個別項目を非表示にできる機能（HH.2.3
> `hazardDisplayFlags`）を併設し、過度な情報過多やネガティブ印象の
> 一方的な強調を避ける。

### HH.3.4 reinfolib API利用上の留意点

```
□ API利用規約に同意の上、利用申請画面（reinfolib.mlit.go.jp/api/request/）から申請
□ 審査完了まで約5営業日。APIキーはHTTPSリクエストヘッダー
  （Ocp-Apim-Subscription-Key）に設定
□ ブラウザから直接呼び出さない（CORS制限・サーバーサイドのみ）
□ 連続リクエストを避け、間隔を空けて呼び出す（明確な上限はないがレート制限あり）
□ XIT001/XIT002/XCT001はデータなしの場合HTTP 404を返す
  （他APIは200 + 空配列）→ エラーハンドリングで404を「データなし」として
  正常処理する（HH-Step2のべき等性設計に反映）
□ 成約価格情報の整備範囲は2021年Q1以降。取引価格情報は2005年Q3以降
  （取得期間の指定をAssessmentAgentのクエリ構築時に意識する）
```

---

## HH.4 査定レポートPDF生成 {#hh4}

既存`mcp_sisliR_doc`（Puppeteer・パンフレットPDF生成 ADR-049）を流用し、
査定レポート用テンプレートを追加する。

### HH.4.1 査定レポート構成

```
01. 表紙（物件名・査定日・対象オーナー名）
02. 査定価格レンジ（低・中央・高の3点表示）
    ※ manual_override_json が存在する場合はその値を表示（HH.2.3 / ADR-200）
03. 査定根拠（取引事例比較・地価公示補正・原価法の概要を平易な文章で説明。
    AI生成文 or 担当者編集文）
04. 近隣比較事例一覧（reinfolib成約価格事例 + 自社実績 + 担当者手動追加事例。
    manual_override_json.comparableIdsで採用された事例のみ表示）
05. 地価公示参考値（landPriceReference・土地系物件のみ表示）
06. ハザード・周辺環境情報（HH.3連携。hazardDisplayFlagsで非表示にした項目は除外）
07. 媒介契約のご案内（次のアクション = 受任への誘導）
08. 免責事項（本査定は概算であり鑑定評価ではない旨を明記。固定文言・編集不可）
```

### HH.4.2 PDF生成パイプライン

```
generate_assessment_report(assessmentId)
  ↓
1. assessments テーブルから ai_generated_json / manual_override_json を取得
   （COALESCE: manual_override_jsonが存在する項目はそれを優先）
2. assessment_comparables から、manual_override_json.comparableIdsに
   含まれる事例のみ取得（未編集の場合は全件）
3. mcp_sisliR_market からハザード・地価公示参考値取得（キャッシュ優先）
4. hazardDisplayFlags に従い非表示項目を除外
5. Puppeteer HTML→PDF（既存パンフレットテンプレートエンジン流用）
6. R2へ保存: assessments/{assessment_id}/report.pdf（べき等・上書き可）
7. assessments.report_url を更新
```

---

## HH.5 CRM拡張（leads → customers 拡張） {#hh5}

### HH.5.1 課題

既存`leads`テーブルは「1物件への1反響」を表す設計であり、
**「同一人物が複数物件に問い合わせる」「査定依頼者が将来の買主・売主になる」**
といった**人物単位の履歴管理**が困難。

PROPAIのCRMSystem（顧客データ管理・問い合わせ管理・フォローアップ）に相当する
機能を、新規`customers`テーブルとして追加し、`leads`から参照させる。

> **ADR-196**: 新規`customers`テーブルを追加し、`leads.customer_id`で
> 関連付ける。既存`leads`テーブルのカラム・インデックス・反響CMS（Part Z）の
> 挙動は変更しない（後方互換）。`customer_id`はnullable。

### HH.5.2 customers テーブルの位置づけ

```
customers（人物・組織の永続レコード）
  ├── leads（物件ごとの反響イベント。複数件が同一customerに紐づく）
  ├── assessments（査定依頼。customerが「将来の売主」になる起点）
  └── agents（社内担当者。customerのフォローアップ責任者）
```

### HH.5.3 フォローアップ管理

PROPAIのPropertyAgentManager（エージェント割当・パフォーマンス管理）相当の
機能は、既存`leads.assigned_agent_id` / `next_action` / `next_action_at`を
`customers`単位に拡張する形で実現する（新規テーブルは追加しない）。

| 機能 | 実装 |
|------|------|
| 顧客単位の問い合わせ履歴一覧 | `SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at` |
| エージェント別パフォーマンス | `agent_runs`同様の集計ビュー（`customer_followup_stats`マテリアライズドビュー新規） |
| フォローアップ通知 | 既存`next_action_at`をトリガーに、Part DD OrchestrationLoop（5分間隔cron）から通知Skillを呼び出す（ADR-197） |

---

## HH.6 物件種別別 SUUMO入稿フィールド網羅性 {#hh6}

### HH.6.1 課題

既存Part O.2の`SUUMO_FIELDS`は単一の汎用フィールドセットのみで、
`PropertyTypeSchema`（newBuild / land / preowned / landSingle / modelHouse）
ごとの差異に対応していない。

PROPAI（CorePages.jsx）は物件種別ごとに以下のフィールド差異を持つ：

| 物件種別 | PROPAI追加フィールド例 |
|---------|----------------------|
| 新築住宅（newBuild） | 完成時期、構造、駐車場、最寄り駅、間取り、建物面積、土地面積 |
| 中古住宅（preowned） | 築年数、リフォーム履歴、現況、構造 |
| 土地（land / landSingle） | 地目、建築条件、都市計画、用途地域、接道状況 |

### HH.6.2 SUUMO_FIELDS の物件種別別拡張

```typescript
// Part O.2 を拡張（既存フィールドは変更なし・追加のみ）

const SUUMO_FIELDS_BASE = {
  物件名:        property.name,
  所在地:        property.address,
  価格:          `${(property.price / 10000).toLocaleString()}万円`,
  キャッチコピー: property.catchCopy,
  物件説明:      property.description,
  広告主:        property.agencyName,
  免許番号:      property.realtorLicense,
  物件詳細URL:   property.lpUrl,
}

// 物件種別ごとの追加フィールド定義
const SUUMO_FIELDS_BY_TYPE: Record<PropertyType, Record<string, (p: Property) => string>> = {
  newBuild: {
    土地面積:    p => `${p.landArea}㎡`,
    建物面積:    p => `${p.buildingArea}㎡`,
    間取り:      p => p.layout ?? '',
    完成時期:    p => p.completionDate ?? '',     // 新規フィールド
    構造:        p => p.structure ?? '',          // 新規フィールド
    駐車場:      p => p.parkingInfo ?? '',         // 新規フィールド
    交通:        p => p.access,
  },
  preowned: {
    土地面積:     p => `${p.landArea}㎡`,
    建物面積:     p => `${p.buildingArea}㎡`,
    間取り:       p => p.layout ?? '',
    築年数:       p => p.builtYear ? `築${new Date().getFullYear() - p.builtYear}年` : '',
    構造:         p => p.structure ?? '',
    リフォーム履歴: p => p.renovationHistory ?? '', // 新規フィールド
    現況:         p => p.currentStatus ?? '',       // 新規フィールド
    交通:         p => p.access,
  },
  land: {
    土地面積:     p => `${p.landArea}㎡`,
    地目:         p => p.landCategory ?? '',        // 新規フィールド
    建築条件:     p => p.buildingCondition ?? '',   // 新規フィールド
    都市計画:     p => p.cityPlanning ?? '',        // 新規フィールド
    用途地域:     p => p.useDistrict ?? '',          // 新規フィールド
    接道状況:     p => p.roadAccess ?? '',          // 新規フィールド
    交通:         p => p.access,
  },
  landSingle: {
    // landと同一フィールドセット
  },
  modelHouse: {
    // newBuildと同一フィールドセット + モデルハウス公開期間
    公開期間:     p => p.modelHouseOpenPeriod ?? '', // 新規フィールド
  },
}

function buildSuumoFields(property: Property): Record<string, string> {
  const typeFields = SUUMO_FIELDS_BY_TYPE[property.propertyType] ?? {}
  return {
    ...SUUMO_FIELDS_BASE,
    ...Object.fromEntries(
      Object.entries(typeFields).map(([k, fn]) => [k, fn(property)])
    ),
  }
}
```

### HH.6.3 Chrome拡張（Part GG）field-mapsへの反映

Part GG.5の`field-maps/suumo.json`は物件種別ごとに異なるSUUMO入稿画面の
セレクタを持つため、`urlPattern`に物件種別を含むバリエーションを追加する：

```json
{
  "portal": "suumo",
  "variants": {
    "newBuild":  { "urlPattern": "https://*.suumo.jp/*/nyusho/kodate_new/*" },
    "preowned":  { "urlPattern": "https://*.suumo.jp/*/nyusho/kodate_used/*" },
    "land":      { "urlPattern": "https://*.suumo.jp/*/nyusho/tochi/*" }
  }
}
```

> Part GG.11（SUUMOのUI変更への対応方針）と同様、セレクタは設定ファイルで
> 一元管理し、物件種別ごとの差異もこの`variants`構造で吸収する。

---

## HH.7 DBスキーマ追加 {#hh7}

既存テーブル（M.1/M.2）への影響を最小化し、以下4テーブルを新規追加する。

```sql
-- 査定依頼
CREATE TABLE assessments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  customer_id         UUID REFERENCES customers(id),
  property_type       TEXT NOT NULL,
  address             TEXT NOT NULL,
  lat                 DECIMAL(9,6),
  lng                 DECIMAL(9,6),
  pref_code           TEXT,
  city_code           TEXT,
  land_area           DECIMAL(10,2),
  building_area       DECIMAL(10,2),
  built_year          INTEGER,
  layout              TEXT,
  -- AI算出結果（読み取り専用・履歴として保持。ADR-200）
  ai_generated_json   JSONB,
  -- 担当者による最終編集結果（HH.2.3。レポート生成時はこちらを優先）
  manual_override_json JSONB,
  -- レポート生成時に確定した値（COALESCE結果のスナップショット）
  price_range_low     BIGINT,
  price_range_mid     BIGINT,
  price_range_high    BIGINT,
  price_per_sqm_land     DECIMAL(12,2),
  price_per_sqm_building DECIMAL(12,2),
  land_price_reference_json JSONB,  -- HH.3 XPT002結果
  hazard_summary_json JSONB,
  methodology_note    TEXT,
  confidence_level    TEXT DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  report_url          TEXT,
  status              TEXT DEFAULT 'draft', -- 'draft' | 'reviewed' | 'completed' | 'contracted' | 'declined'
  reviewed_by_agent_id UUID REFERENCES agents(id),
  reviewed_at         TIMESTAMPTZ,
  converted_property_id UUID REFERENCES properties(id),  -- 受任時に紐付け
  request_source      TEXT NOT NULL,  -- 'lp' | 'portal' | 'referral' | 'manual'
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON assessments (tenant_id, status);
CREATE INDEX ON assessments (customer_id);

-- 査定比較事例
CREATE TABLE assessment_comparables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,  -- 'reinfolib_transaction' | 'reinfolib_agreement' | 'internal' | 'manual'
  source_property_id UUID REFERENCES properties(id),  -- internal（自社実績）の場合
  address_summary TEXT,         -- reinfolib提供粒度の概略地名（個人情報含まず）/ 外部・手動事例の概略地名
  distance_m      INTEGER,
  price           BIGINT,
  land_area       DECIMAL(10,2),
  building_area   DECIMAL(10,2),
  price_per_sqm   DECIMAL(12,2),
  transacted_at   DATE,
  period_label    TEXT,            -- reinfolib提供形式（例: '2025Q3'）
  similarity_score DECIMAL(5,4),   -- internal事例: pgvectorセマンティック検索のスコア
  is_adopted      BOOLEAN DEFAULT TRUE,  -- HH.2.3: 担当者が採用/除外を選択（manual_override_json.comparableIdsと同期）
  note            TEXT,            -- 手動追加事例のコメント等
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON assessment_comparables (assessment_id);
CREATE INDEX ON assessment_comparables (assessment_id, is_adopted);

-- 顧客（人物・組織の永続レコード）
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT,
  email_hash      TEXT,   -- SHA-3ハッシュ（ADR-098の量子耐性方針を継承）
  phone_hash      TEXT,
  line_user_id    TEXT,
  customer_type   TEXT DEFAULT 'prospect', -- 'prospect' | 'seller' | 'buyer' | 'both'
  assigned_agent_id UUID REFERENCES agents(id),
  notes           TEXT,
  last_contacted_at TIMESTAMPTZ,
  next_action     TEXT,
  next_action_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON customers (tenant_id, customer_type);
CREATE INDEX ON customers (assigned_agent_id, next_action_at) WHERE next_action_at IS NOT NULL;

-- 市場・ハザード・周辺施設情報キャッシュ（地点単位・再利用のため）
-- ※ v1.0の geo_cache を market_cache に名称変更（mcp_sisliR_market対応）
CREATE TABLE market_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat             DECIMAL(9,6) NOT NULL,
  lng             DECIMAL(9,6) NOT NULL,
  pref_code       TEXT,
  city_code       TEXT,
  comparables_json JSONB,        -- XIT001/XPT001 結果
  land_price_json  JSONB,        -- XPT002 結果
  hazard_json     JSONB,         -- XKT020/021/022/025〜029 + XST001 + J-SHIS
  facilities_json JSONB,         -- XKT004〜007/010/011/015/017/018
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);
CREATE UNIQUE INDEX ON market_cache (lat, lng);
CREATE INDEX ON market_cache (expires_at);
-- 取引価格事例（comparables_json）は更新頻度が異なるため別キャッシュ期限を設定可能
CREATE INDEX ON market_cache (city_code);
```

### HH.7.1 既存テーブルへの最小限の追加カラム

```sql
-- leads: customer_id を追加（nullable・後方互換）
ALTER TABLE leads ADD COLUMN customer_id UUID REFERENCES customers(id);
CREATE INDEX ON leads (customer_id);

-- properties: 査定経由で作成された物件の追跡
ALTER TABLE properties ADD COLUMN source_assessment_id UUID REFERENCES assessments(id);

-- properties: HH.6のSUUMOフィールド拡張用カラム
ALTER TABLE properties ADD COLUMN completion_date     TEXT;   -- newBuild: 完成時期
ALTER TABLE properties ADD COLUMN structure           TEXT;   -- newBuild/preowned: 構造
ALTER TABLE properties ADD COLUMN parking_info        TEXT;   -- newBuild: 駐車場
ALTER TABLE properties ADD COLUMN renovation_history  TEXT;   -- preowned: リフォーム履歴
ALTER TABLE properties ADD COLUMN current_status      TEXT;   -- preowned: 現況
ALTER TABLE properties ADD COLUMN land_category       TEXT;   -- land: 地目
ALTER TABLE properties ADD COLUMN building_condition  TEXT;   -- land: 建築条件
ALTER TABLE properties ADD COLUMN city_planning       TEXT;   -- land: 都市計画
ALTER TABLE properties ADD COLUMN use_district        TEXT;   -- land: 用途地域
ALTER TABLE properties ADD COLUMN road_access         TEXT;   -- land: 接道状況
ALTER TABLE properties ADD COLUMN model_house_open_period TEXT; -- modelHouse: 公開期間
```

### HH.7.2 顧客フォローアップ集計ビュー

```sql
CREATE MATERIALIZED VIEW customer_followup_stats AS
SELECT
  c.assigned_agent_id,
  COUNT(*) AS total_customers,
  COUNT(*) FILTER (WHERE c.next_action_at < NOW()) AS overdue_followups,
  COUNT(*) FILTER (WHERE c.customer_type = 'seller') AS seller_count,
  COUNT(*) FILTER (WHERE c.customer_type = 'buyer')  AS buyer_count,
  AVG(EXTRACT(EPOCH FROM (NOW() - c.last_contacted_at)) / 86400) AS avg_days_since_contact
FROM customers c
GROUP BY c.assigned_agent_id;
```

### HH.7.3 査定精度モニタリングビュー（新設・ADR-200連動）

AI算出値と担当者の最終編集値の差分を継続的に観察し、AssessmentAgentの
プロンプト・係数チューニングに活用する。

```sql
CREATE MATERIALIZED VIEW assessment_override_diff AS
SELECT
  id AS assessment_id,
  tenant_id,
  (ai_generated_json->>'priceRangeMid')::BIGINT AS ai_price_mid,
  price_range_mid AS final_price_mid,
  ROUND(
    (price_range_mid - (ai_generated_json->>'priceRangeMid')::BIGINT)::DECIMAL
    / NULLIF((ai_generated_json->>'priceRangeMid')::BIGINT, 0) * 100, 2
  ) AS override_pct,
  confidence_level,
  reviewed_at
FROM assessments
WHERE manual_override_json IS NOT NULL
  AND ai_generated_json IS NOT NULL;
```

---

## HH.8 MCPサーバー追加 {#hh8}

既存14サーバー構成（Part F.3）に2サーバーを追加する（計16サーバー）。

| サーバー名 | 役割 | Phase |
|-----------|------|-------|
| `mcp_sisliR_market` | 不動産情報ライブラリ（reinfolib）連携・成約価格事例/地価公示/ハザード10種/周辺施設取得・market_cache管理・J-SHIS地震動データ併用 | 2 |
| `mcp_sisliR_assessment` | AssessmentAgent実行・担当者レビュー状態管理・査定レポートPDF生成依頼（mcp_sisliR_docへ委譲） | 2 |

> `mcp_sisliR_assessment`は新規PDFテンプレートのみを追加し、PDF生成自体は
> 既存`mcp_sisliR_doc`（Puppeteer・ADR-049）に処理を委譲する。
> PDF生成エンジンを重複実装しない（ADR-198）。

---

## HH.9 Scene JSON拡張 {#hh9}

`PropertyInfoSchema`（Part E.1）に物件種別別フィールド（HH.6.2で定義した
新規カラムに対応するスキーマフィールド）と、ハザードサマリーを追加する。

```typescript
// shared/schemas/scene.ts への追加（既存フィールドは変更なし）

export const HazardSummarySchema = z.object({
  earthquake: z.object({
    probabilityRank: z.enum(['low', 'medium', 'high', 'very_high']),
    pgv30: z.number(),
    sourceUrl: z.string().url(),
  }).optional(),
  flood:          z.object({ riskLevel: z.enum(['none','low','medium','high']), sourceUrl: z.string().url() }).optional(),
  stormSurge:     z.object({ riskLevel: z.enum(['none','low','medium','high']), sourceUrl: z.string().url() }).optional(),
  tsunami:        z.object({ riskLevel: z.enum(['none','low','medium','high']), sourceUrl: z.string().url() }).optional(),
  landslide:      z.object({ riskZone: z.boolean(), sourceUrl: z.string().url() }).optional(),
  liquefaction:   z.object({ riskLevel: z.enum(['low','medium','high']), sourceUrl: z.string().url() }).optional(),
  largeScaleFill: z.object({ withinZone: z.boolean(), sourceUrl: z.string().url() }).optional(),
  disasterHistory: z.object({
    records: z.array(z.object({ type: z.string(), year: z.number().optional() })),
    sourceUrl: z.string().url(),
  }).optional(),
})

// PropertyInfoSchema への追加フィールド（物件種別別・全てoptional）
export const PropertyInfoSchemaExtension = z.object({
  // newBuild
  completionDate:    z.string().optional(),
  structure:         z.string().optional(),
  parkingInfo:       z.string().optional(),
  // preowned
  renovationHistory: z.string().optional(),
  currentStatus:     z.string().optional(),
  // land / landSingle
  landCategory:      z.string().optional(),
  buildingCondition: z.string().optional(),
  cityPlanning:      z.string().optional(),
  useDistrict:       z.string().optional(),
  roadAccess:        z.string().optional(),
  // modelHouse
  modelHouseOpenPeriod: z.string().optional(),
  // 共通: ハザード情報（LP「周辺環境」セクション用）
  hazardSummary: HazardSummarySchema.optional(),
  // 共通: 地価公示参考値（土地系物件のLP「価格情報」セクション用）
  landPriceReference: z.object({
    pricePerSqm: z.number(),
    pointName:   z.string(),
    surveyYear:  z.number(),
  }).optional(),
})

// PropertyInfoSchema = PropertyInfoSchema.merge(PropertyInfoSchemaExtension)
// マイグレーションはPart E既定の後方互換ポリシーに従う（既存Sceneはoptionalのため無影響）
```

---

## HH.10 イベント駆動フロー拡張 {#hh10}

Part L.2の既存フローに、査定起点のフローを追加する（既存フローは変更なし）。
v2.0では担当者レビューステップ（HH.2.3）を明示的なイベントとして追加する。

```
AssessmentRequested（査定依頼LP送信）
    ↓
AssessmentAgent実行（HH.2 Step1〜4: AIドラフト生成）
    ↓
AssessmentDraftReady（ai_generated_json確定・status='draft'）
    ↓（担当者が管理画面でレビュー・必要に応じ編集）
AssessmentReviewed（manual_override_json保存・status='reviewed'）
    ↓
AssessmentReportGenerated（HH-Step6: PDF生成・status='completed'）
    ↓（担当者が確認・フォローアップ）
AssessmentContracted（媒介契約・受任）
    ↓
PropertyCreatedFromAssessment
  - assessments.converted_property_id を更新
  - properties.source_assessment_id を設定
  - assessment_comparables（is_adopted=trueのもの）/ hazard_summary /
    land_price_reference を Scene JSON初期値として引き継ぎ
    ↓
PropertyImported（← 既存Part L.2フローへ合流）
```

---

## HH.11 プライシングへの影響 {#hh11}

### HH.11.1 プラン別機能制限

| プラン | 査定機能 | 月間査定件数上限 | 市場・ハザード分析（mcp_sisliR_market） | CRM（customers） |
|--------|---------|----------------|------------------------------------|------------------|
| Starter | ✕ 不可 | - | ✕ | ✕（leads単位のみ） |
| Growth | ◯ | 月10件 | ◯ | ◯ |
| Premium | ◯ | 月50件 | ◯ | ◯ |
| Enterprise | ◯ | 無制限 | ◯ | ◯（API連携可） |

### HH.11.2 コスト試算への追加（Growthプラン15件/月想定 + 査定10件/月）

| コスト項目 | 単価 | 月間想定 | 金額 |
|-----------|------|---------|------|
| Claude API（査定レポート生成・Sonnet 4） | 約¥300/件 | 10件 | ¥3,000 |
| 不動産情報ライブラリAPI（成約価格・ハザード・周辺施設） | 無料 | - | ¥0 |
| J-SHIS API（地震動データ・継続併用） | 無料 | - | ¥0 |
| 査定PDF生成（既存Puppeteer基盤流用） | ¥0（追加コストなし） | - | ¥0 |
| **追加原価合計** | | | **≈¥3,000** |

> v1.0時点でGoogle Places APIの従量課金（約¥10/件）を見込んでいたが、
> v2.0では周辺施設情報も不動産情報ライブラリで取得するため、
> 追加原価がさらに低下した。既存原価合計（≈¥49,000）に対し追加コストは
> 僅少であり、粗利率への影響は実質的にない。

---

## HH.12 実装ロードマップ {#hh12}

既存Part Q（実装ロードマップ）のPhase 2（Week 9〜16）に統合する。

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 9 | 不動産情報ライブラリAPI利用申請（先行着手・審査5営業日） + `customers`・`assessments`・`assessment_comparables`・`market_cache`のDrizzleスキーマ追加・マイグレーション | 最高 |
| Week 10 | `mcp_sisliR_market`実装（reinfolib連携: XIT001/XPT001/XPT002/ハザード10種/周辺施設・J-SHIS地震動併用・market_cache） | 高 |
| Week 11 | AssessmentAgent実装（HH-Step1〜4）+ 査定依頼LP | 高 |
| Week 12 | 担当者レビュー画面（HH.2.3・manual_override_json編集UI）+ `mcp_sisliR_assessment`実装 + 査定レポートPDFテンプレート | 高 |
| Week 13 | properties拡張カラム（HH.7.1）+ SUUMO_FIELDS物件種別別拡張（HH.6.2） | 中 |
| Week 14 | customer_followup_stats集計ビュー + CRM画面（顧客一覧・フォローアップ通知）+ assessment_override_diffビュー | 中 |
| Week 15 | Part GG field-maps物件種別variants対応（HH.6.3） | 中 |
| Week 16 | E2Eテスト: 査定→レビュー→受任→PropertyIntakeAgent合流フロー（HH.10） | 高 |

**Phase 2完了定義（DoD）への追加:**
- 査定依頼LPからAIドラフト生成までが10分以内に完了する
- 担当者レビュー画面で価格レンジ・比較事例・ハザード表示・査定根拠文を
  編集でき、`manual_override_json`に保存される
- 査定レポートPDFは`manual_override_json`が存在する場合その値を反映する
  （COALESCE方式・ADR-200）
- 比較事例に不動産情報ライブラリの成約価格事例が最低1件以上含まれる
  （対象エリアにデータが存在する場合）
- 受任時に`properties.source_assessment_id`が正しく紐付き、
  Scene JSON初期値にハザード情報・地価公示参考値・採用済み比較事例が
  引き継がれる
- `customer_followup_stats`・`assessment_override_diff`がGrafana Cloud
  ダッシュボードに表示される

---

## HH.13 ADR追加分（ADR-193〜202） {#hh13}

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-193（v2.0改訂） | 査定方式は「取引事例比較法（不動産情報ライブラリの公的成約価格データ + 自社実績のハイブリッド）+ 地価公示補正（土地系）+ 原価法（簡易・戸建て系）」とし、独自AI価格予測モデルは構築しない | 公的データを第一優先にすることで自社実績の少ない新規テナントでも一定の事例数を確保でき、査定書の説得力・信頼性が向上する。機械学習モデルの構築・継続学習・精度保証コストも回避できる | 独自回帰モデル構築 / 自社実績のみに依存 |
| ADR-195（継続） | ハザード関連の表現は中立的な「客観情報の提示」に限定し、ComplianceCheckerの禁止表現リストに「ハザード誇大表現」を追加する。v2.0でハザード項目が10種に増加したため、項目単位の表示/非表示切替（hazardDisplayFlags）を併設する | 不動産広告における誇大広告・誤解を招く表示の規制（景品表示法等）への抵触リスク回避。情報過多による一方的なネガティブ印象も回避する | 表現ガードレールなしでClaudeに一任 / 全項目を常時表示 |
| ADR-196（継続） | `customers`テーブルを新規追加し`leads.customer_id`で関連付け。既存leadsの構造・反響CMS挙動は変更しない | 既存Part Z反響CMSへの影響を最小化しつつ、人物単位の履歴管理を実現する後方互換設計 | 既存leadsテーブルを人物単位に再設計（破壊的変更） |
| ADR-197（継続） | 顧客フォローアップ通知はOrchestrationLoop（Part DD・5分間隔cron）から既存Skillパターンで実行する | 新規ループ機構を作らず、ADR-101〜105で確立したループ設計を再利用することで保守性とHaltingポリシーの一貫性を保つ | 独自のフォローアップ通知バッチを新設 |
| ADR-198（継続） | `mcp_sisliR_assessment`はPDF生成エンジンを自前実装せず、既存`mcp_sisliR_doc`（Puppeteer・ADR-049）に委譲する | PDF生成エンジンの重複実装を避け、テンプレート資産（フォント・デザイン）を一元管理する | 査定PDF専用の別エンジンを実装 |
| ADR-199（継続） | 査定レポート・LP上に「本査定は概算であり鑑定評価ではない」旨の免責文言を必須表示（固定文言・編集不可）とする | 不動産の鑑定評価に関する法律（不動産鑑定士の業務範囲）との抵触回避。Part N（法規制チェック）の必須チェック項目に追加 | 免責表示なし / 担当者が編集可能にする |
| ADR-200（新規） | AI算出結果（ai_generated_json）と担当者の最終編集結果（manual_override_json）を分離保存し、レポート生成時はCOALESCE方式（manual_override優先）で確定値を決定する。両者の差分は`assessment_override_diff`ビューで継続観察する | AIドラフトをそのまま顧客に提示せず、現場の知見（リフォーム状況・近隣特性等）を反映した最終調整を必須プロセスとすることで査定書の信頼性を担保する（Part DD ADR-105「人間承認」原則の査定への適用）。差分観察により将来のプロンプト・係数チューニングのフィードバックループも確保する | AI算出値を直接レポートに使用 / 編集機能なし |
| ADR-201（ADR-194の置き換え・新規） | ハザード・周辺施設・取引/成約価格事例の主データソースを「不動産情報ライブラリ」（国土交通省reinfolib API）に統一する。地震動確率（PGV30）のみJ-SHIS Map APIを継続併用する | 単一の無料公的APIキーで成約価格事例（査定精度の核心）・地価公示・ハザード10種・周辺施設を一括取得でき、ADR-060（クラウド依存排除・公的データ優先）の思想とも整合する。Google Places APIへの従量課金依存も削減できる | J-SHIS単体 + Google Places個別連携（v1.0方針） |
| ADR-202（新規） | `geo_cache`テーブルを`market_cache`に名称変更し、取引価格事例（comparables_json）・地価公示（land_price_json）・ハザード（hazard_json）・周辺施設（facilities_json）を地点単位で一括キャッシュする（90日有効） | mcp_sisliR_market（ADR-201で統合された単一MCPサーバー）の役割に合わせた命名・スキーマ統合により、キャッシュ管理ロジックを一元化する | geo_cacheの名称・スキーマを維持し別途市場データキャッシュを新設 |

---

## まとめ

本Partは、PROPAI（旧Electron版）の機能調査で識別された4つのギャップ
（査定機能・ハザード/立地分析・CRM・SUUMO入稿フィールド網羅性）を、
SisliRの既存設計（Scene JSON・leads/properties・MCPサーバー構成・
Puppeteer PDF基盤・OrchestrationLoop）への**後方互換な追加レイヤー**として
統合する設計を示した。

v2.0では特に、査定の核心となる「比較事例」と「ハザード情報」を
**国土交通省「不動産情報ライブラリ」への統一連携**とすることで、
自社実績に依存しない公的データに基づく査定が可能になり、査定書の
精度・客観性・信頼性が大きく向上した。また、AIドラフトに対する
**担当者の手動レビュー・編集を必須プロセス**として組み込むことで、
「AIが出した数字をそのまま顧客に渡す」のではなく、現場の知見を
反映した最終判断を経た査定書を提供できる設計とした。

特に「査定」は、Growth Loopの**入口**として位置づけることで、
「査定 → 受任 → 自動マーケティング → 反響 → 改善ループ → 成約」という
不動産業務の全体フローをSisliR単体でカバーする構想につながる。

---

**作成者**: Claude (Sonnet 4.6)
**最終更新**: 2026年6月15日
**バージョン**: v2.0
