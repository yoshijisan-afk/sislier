# Part OO — マスター管理画面 完全設計書 v1.2
## SisliR社内専用 · 受注制作 · 全テナント管理 · 3DLP納品ワークフロー

> **バージョン**: v1.2 (2026-06-15)
> **位置づけ**: SisliR社内（藤岡さん・スタッフ）が使う唯一の「神視点」管理画面
> **依存**: SisliR v10.2 完全設計書（Part A〜NN）+ Part PP（テナントUI設計）
> **重要変更**: FloorplanVLM 廃止 → Claude Vision 単独パイプラインへ完全移行（ADR-144）
>
> **v1.2更新（2026-06-15）**:
> - OO.9 システム設定に **AIプロバイダー設定（OO.9.AI）** を追加
> - 新規: `ai_provider_settings` テーブル、`benchmark_results` テーブル
> - 新規: LLMRouter 設計（DB参照 + フォールバック + コスト記録）
> - ADR-180〜185 追加
>
> **v1.1更新（2026-06-13）**:
> - AIモデル文字列を最新版に更新: `claude-sonnet-4-20250514` → `claude-sonnet-4-6`
> - OO.5.3 ビューポート記述を「Three.js（WebGPURenderer標準・WebGL2自動フォールバック、ADR-162.1）」に修正
> - 完全設計書 v10.2との整合を取った

---

## 目次

- [OO.0 設計方針](#oo0)
- [OO.1 認証・権限設計（super_admin ロール）](#oo1)
- [OO.2 マスター管理画面の全体構成](#oo2)
- [OO.3 全テナント管理ダッシュボード](#oo3)
- [OO.4 受注制作ワークフロー（トラックB）](#oo4)
- [OO.5 3DLP編集・納品フロー](#oo5)
- [OO.6 間取り解析パイプライン（Claude Vision 完全移行版）](#oo6)
- [OO.7 品質保証・QualityCheckAgent](#oo7)
- [OO.8 課金・コスト管理](#oo8)
- [OO.9 システム設定・マスターデータ管理](#oo9)
- [OO.9.AI AIプロバイダー設定（v1.2新規）](#oo9ai)
- [OO.10 DBスキーマ追加](#oo10)
- [OO.11 APIエンドポイント](#oo11)
- [OO.12 セキュリティ設計](#oo12)
- [OO.13 ADRログ](#oo13)

---

## OO.0 設計方針 {#oo0}

```
マスター管理画面の3原則:

  原則1: テナント管理画面とは完全に分離された別アプリケーション
    → URL: https://master.sislir.com（テナントは dashboard.sislir.com）
    → JWTのroleクレームが 'super_admin' のみアクセス可
    → テナント側URLからはリンクも案内も一切しない

  原則2: 「全テナントを神視点で見られる」唯一の場所
    → RLSの tenant_id フィルタを service_role_key でバイパス
    → 全物件・全Scene・全反響・全コストを横断的に閲覧・操作できる
    → ただし操作ログは全件記録（ADR-150）

  原則3: 受注制作（トラックB）の完全なワークフロー基盤
    → 受注登録 → 生成依頼 → 品質確認 → 承認 → 納品URL発行
    → 各ステップに担当者割当・期限・ステータス追跡
    → 3DLP Editorへのダイレクトアクセス（全テナントのSceneを編集可能）
```

---

## OO.1 認証・権限設計（super_admin ロール） {#oo1}

### OO.1.1 roles テーブル拡張

```sql
-- 既存 agents.role = 'admin' | 'member' はテナント内権限
-- 新規: sislir_staff テーブルでマスター権限を完全分離

CREATE TABLE sislir_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'staff',
  -- 'super_admin'  : 全機能（藤岡さんのみ）
  -- 'staff'        : 受注制作・3DLP編集・品質確認（スタッフ）
  -- 'readonly'     : 閲覧のみ（監査・外部協力者）
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- マスター操作ログ（全操作を記録）
CREATE TABLE master_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES sislir_staff(id),
  action       TEXT NOT NULL,
  -- 'view_tenant', 'edit_scene', 'deliver_lp', 'delete_property',
  -- 'create_order', 'approve_order', 'override_rls' など
  target_type  TEXT,              -- 'tenant' | 'property' | 'scene' | 'order'
  target_id    UUID,
  metadata     JSONB DEFAULT '{}',
  ip_address   INET,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON master_audit_logs (staff_id, created_at DESC);
CREATE INDEX ON master_audit_logs (action, created_at DESC);
```

### OO.1.2 JWT認証フロー

```typescript
// middleware: apps/master/middleware.ts

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role_key でRLSバイパス
    { cookies: { ... } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/login', request.url))

  // sislir_staff テーブルで権限確認
  const { data: staff } = await supabase
    .from('sislir_staff')
    .select('role, is_active')
    .eq('user_id', session.user.id)
    .single()

  if (!staff || !staff.is_active) {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  // roleをヘッダーに付与（各ページでの権限チェックに使用）
  const response = NextResponse.next()
  response.headers.set('x-staff-role', staff.role)
  return response
}

export const config = {
  matcher: [
    '/((?!login|unauthorized|_next|favicon).*)',
  ]
}
```

### OO.1.3 権限マトリクス

| 機能 | super_admin | staff | readonly |
|------|:-----------:|:-----:|:--------:|
| 全テナント閲覧 | ✅ | ✅ | ✅ |
| テナント設定変更 | ✅ | ✗ | ✗ |
| 受注制作 管理 | ✅ | ✅ | 閲覧のみ |
| 3DLP編集（全テナント） | ✅ | ✅ | ✗ |
| FloorplanVLM → Claude Vision 解析 | ✅ | ✅ | ✗ |
| 納品承認 · URL発行 | ✅ | ✗ | ✗ |
| 課金プラン変更 | ✅ | ✗ | ✗ |
| スタッフアカウント管理 | ✅ | ✗ | ✗ |
| システム設定 | ✅ | ✗ | ✗ |
| 監査ログ閲覧 | ✅ | ✅ | ✗ |

---

## OO.2 マスター管理画面の全体構成 {#oo2}

### OO.2.1 ファイル構造

```
apps/master/                        # Next.js 15 App Router（独立アプリ）
├── app/
│   ├── layout.tsx                  # マスター専用レイアウト
│   ├── login/page.tsx              # ログイン（Magic Link）
│   ├── dashboard/page.tsx          # トップ: 全体サマリー
│   │
│   ├── tenants/                    # 全テナント管理
│   │   ├── page.tsx                # テナント一覧
│   │   └── [id]/
│   │       ├── page.tsx            # テナント詳細
│   │       ├── properties/page.tsx # テナントの全物件
│   │       └── billing/page.tsx    # 課金・使用量
│   │
│   ├── orders/                     # 受注制作（トラックB）
│   │   ├── page.tsx                # 受注一覧
│   │   ├── new/page.tsx            # 新規受注登録
│   │   └── [id]/
│   │       ├── page.tsx            # 受注詳細・進捗
│   │       ├── generate/page.tsx   # 生成実行
│   │       ├── review/page.tsx     # 品質確認
│   │       └── deliver/page.tsx    # 納品
│   │
│   ├── scenes/                     # 全Scene JSON管理
│   │   ├── page.tsx                # Scene一覧（全テナント）
│   │   └── [id]/
│   │       ├── page.tsx            # Scene詳細
│   │       └── editor/page.tsx    # 3DLP Editor（マスター権限）
│   │
│   ├── floorplan/                  # 間取り解析管理（Claude Vision）
│   │   ├── page.tsx                # 解析ジョブ一覧
│   │   └── [jobId]/page.tsx        # 解析結果確認・修正
│   │
│   ├── costs/page.tsx              # コスト管理（全テナント）
│   ├── settings/page.tsx           # システム設定
│   └── audit/page.tsx              # 操作ログ
│
├── components/
│   ├── MasterSidebar.tsx
│   ├── TenantCard.tsx
│   ├── OrderStatusBadge.tsx
│   ├── FloorplanReviewPanel.tsx    # 間取り解析結果確認UI
│   └── DeliveryModal.tsx
│
└── middleware.ts                   # super_admin 認証
```

### OO.2.2 画面レイアウト

```
┌──────────────────────────────────────────────────────────────┐
│ MASTER HEADER: SisliR Master  [スタッフ名] [ロール]  [ログアウト]│
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│  SIDEBAR   │  MAIN CONTENT                                    │
│  (220px)   │                                                  │
│            │                                                  │
│  📊 全体概況 │                                                  │
│  🏢 テナント │                                                  │
│  📋 受注制作 │                                                  │
│  🎬 Scene  │                                                  │
│  🏠 間取り  │                                                  │
│  💰 コスト  │                                                  │
│  ⚙️ 設定   │                                                  │
│  📜 監査ログ│                                                  │
│            │                                                  │
└────────────┴─────────────────────────────────────────────────┘
```

---

## OO.3 全テナント管理ダッシュボード {#oo3}

### OO.3.1 トップダッシュボード（KPIサマリー）

```typescript
// app/dashboard/page.tsx

// 表示KPI（全テナント横断）
interface MasterDashboardMetrics {
  totalTenants:       number   // 契約テナント総数
  activeTenants30d:   number   // 30日以内にログインしたテナント
  totalProperties:    number   // 管理物件総数
  propertiesThisMonth: number  // 今月新規物件数

  // 受注制作
  ordersInProgress:   number   // 進行中の受注
  ordersPendingReview: number  // 品質確認待ち（緊急表示）
  ordersOverdue:      number   // 期限超過（赤バッジ）

  // コスト
  totalApiCostMtd:    number   // 今月のClaude API費用（円）
  totalHighsfieldMtd: number   // 今月のHiggsfield費用（円）
  estimatedMrr:       number   // 推定MRR（サブスク収益）

  // システム健全性
  agentSuccessRate7d: number   // PropertyIntakeAgent成功率（7日）
  floorplanJobQueue:  number   // 間取り解析待ちジョブ数
}
```

### OO.3.2 テナント一覧画面

```typescript
// テナントを課金プラン・最終ログイン・物件数でフィルタ・ソート

interface TenantListItem {
  id:           string
  name:         string
  plan:         'starter' | 'growth' | 'premium' | 'enterprise'
  propertyCount: number
  lastActivityAt: string    // 最終操作日時
  mtdApiCost:   number      // 今月のAPI費用（円）
  adminEmail:   string      // テナントのadmin担当者メール

  // 異常フラグ
  hasOverdueOrders:  boolean
  hasCostAlert:      boolean
  hasFailedJobs:     boolean
}

// テナント詳細ページのアクション
type TenantAction =
  | 'view_properties'     // 物件一覧を開く
  | 'view_billing'        // 課金状況を確認
  | 'impersonate'         // テナントとして操作（ADR-150: 監査ログ必須）
  | 'change_plan'         // プラン変更（super_adminのみ）
  | 'send_notification'   // 管理者にメール送信
  | 'suspend'             // テナント一時停止（super_adminのみ）
```

---

## OO.4 受注制作ワークフロー（トラックB） {#oo4}

### OO.4.1 受注ステータス定義

```typescript
// packages/shared/types/order.ts

export type OrderStatus =
  | 'intake'          // 受注登録済み（素材待ち）
  | 'materials_ready' // 素材一式受領済み
  | 'generating'      // PropertyIntakeAgent実行中
  | 'gen_complete'    // 自動生成完了（レビュー前）
  | 'editing_3dlp'    // 3DLP Editor で編集中（スタッフ作業）
  | 'qa_review'       // 品質確認中（QualityCheckAgent実行）
  | 'qa_passed'       // QA合格（納品承認待ち）
  | 'qa_failed'       // QA不合格（差し戻し）
  | 'pending_approval'// 承認待ち（super_adminのみ）
  | 'approved'        // 承認済み（納品URL発行可能）
  | 'delivered'       // 納品完了
  | 'cancelled'       // キャンセル

export interface Order {
  id:           string
  tenantId:     string
  propertyId:   string     // 紐付き物件（新規作成 or 既存）
  sceneId:      string | null  // 3DLP Scene JSON ID

  grade:        'basic3d' | 'standard' | 'premium' | 'luxury'
  status:       OrderStatus
  dueDate:      string     // 納品期限

  // 担当
  assignedStaffId: string | null  // 編集担当スタッフ

  // 生成物
  deliverables: {
    lpUrl:         string | null  // 公開LP URL
    splatUrl:      string | null  // SPZ4ファイル
    videoUrl:      string | null  // 動画
    usdzUrl:       string | null  // USDZ
    bimUrl:        string | null  // OpenUSD（Luxuryのみ）
  }

  // QA結果
  qaResult: {
    score:         number | null
    complianceStatus: 'pass' | 'warning' | 'fail' | null
    issues:        string[]
    checkedAt:     string | null
  }

  // 履歴
  statusHistory: { status: OrderStatus; changedAt: string; staffId: string }[]

  price:        number      // 受注金額（円）
  notes:        string      // 内部メモ
  createdAt:    string
  updatedAt:    string
}
```

### OO.4.2 受注ワークフロー フロー図

```
【受注登録】 (super_admin / staff)
  受注フォーム入力:
    - テナントID / テナント名
    - グレード選択（Basic3D / Standard / Premium / Luxury）
    - 納品期限
    - 担当スタッフ割当
    - 物件情報（既存テナント物件 or 新規入力）
        ↓
【素材受領確認】
  チェックリスト:
    ☐ 間取り図（PDF/PNG）
    ☐ 物件写真（最低10枚・4K推奨）
    ☐ 物件スペックシート
    ☐ BIM/IFCデータ（Luxuryグレード必須）
    ☐ 特記事項（希望演出・照明プリセット等）
        ↓
【自動生成実行】 → PropertyIntakeAgent起動
  Step 1: 間取り図解析（Claude Vision パイプライン ← FloorplanVLM廃止後）
  Step 2: 写真処理・SPZ4生成
  Step 3: テキスト生成（コピー・FAQ・SEO）
  Step 4: 3DLP Scene JSON生成
  Step 5: 動画生成（グレード別）
        ↓ 90%自動完了
【3DLP Editorで人間編集】 (staff)
  - エディタURL: /master/scenes/{sceneId}/editor
  - 対象: 演出調整・コピー確認・照明・PostFX・CTA設定
  - 目標: 10〜30分の仕上げ作業
        ↓
【QualityCheckAgent自動実行】
  - 宅建業法コンプライアンス検証
  - ScoreEngine（目標: 85点以上）
  - 画像品質チェック（解像度・AI生成ラベル）
  - 間取り構造不変性検証
        ↓
  QA合格 → 【承認待ち】(super_admin)
  QA不合格 → 差し戻し・Slack通知
        ↓
【納品承認・URL発行】 (super_admin)
  - DeliveryModal で成果物一式を確認
  - 「納品承認」クリック → 公開URLを発行
  - テナントに自動メール通知
  - 請求書発行フラグを立てる
```

### OO.4.3 受注一覧画面の実装

```typescript
// app/orders/page.tsx

// ステータス別カンバンビュー（横スクロール）
const ORDER_COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: 'materials_ready', label: '素材待ち',    color: 'gray' },
  { status: 'generating',      label: '生成中',      color: 'blue' },
  { status: 'editing_3dlp',    label: 'LP編集中',    color: 'purple' },
  { status: 'qa_review',       label: 'QA確認',      color: 'amber' },
  { status: 'pending_approval',label: '承認待ち',    color: 'teal' },
  { status: 'delivered',       label: '納品済み',    color: 'green' },
]

// 期限超過の受注にはアラートバッジを表示
// 「承認待ち」カラムのカードは太ボーダーでハイライト（super_adminのみ操作可）
```

---

## OO.5 3DLP編集・納品フロー {#oo5}

### OO.5.1 マスター権限での Scene 編集

マスター管理画面から起動するLP Editorは、Part MM（LP Editor v5.0）と同一コンポーネントを使用します。ただし以下のマスター専用拡張があります。

```typescript
// apps/master/app/scenes/[id]/editor/page.tsx

// マスター専用EditorWrapper
// 通常のエディタと違い:
//   1. 全テナントのSceneにアクセス可能（RLSバイパス）
//   2. 「納品として保存」ボタンが追加される
//   3. テナントへのプレビュー共有URLを発行できる
//   4. 全操作がmaster_audit_logsに記録される

interface MasterEditorExtensions {
  // 通常Sceneに加えて表示される情報
  tenantName:     string
  orderGrade:     string | null   // 受注制作の場合のグレード
  orderId:        string | null

  // マスター専用アクション
  saveAsMasterDraft:   () => Promise<void>  // 下書き保存（テナント未公開）
  publishToTenant:     () => Promise<string> // テナントへ公開 → URL返却
  sendPreviewToTenant: () => Promise<void>   // プレビューリンクをメール送信
}
```

### OO.5.2 納品モーダル（DeliveryModal）

```typescript
// components/DeliveryModal.tsx

interface DeliveryModalProps {
  order:     Order
  onConfirm: (deliveryNote: string) => Promise<void>
}

// 表示内容:
// ① 成果物チェックリスト（グレード別の必須成果物）
//    - LP URL（全グレード）
//    - SPZ4ファイル（Basic3D以上）
//    - シネマティック動画（Standard以上）
//    - SNSサムネイルセット（Standard以上）
//    - USDZ（Premium以上）
//    - OpenUSD BIM（Luxuryのみ）
//
// ② QAスコア確認
//    - ScoreEngine合計スコア（85点以上で緑）
//    - 宅建業法コンプライアンス（pass必須）
//
// ③ 納品メモ入力欄（テナントへの引き渡しコメント）
//
// ④ 「納品承認・メール送信」ボタン（super_adminのみ有効）
//    → クリック後:
//       1. order.status = 'delivered'
//       2. order.deliverables に最終URLを記録
//       3. テナントadminにメール通知（成果物URL一覧付き）
//       4. 請求書発行フラグ: orders.billing_triggered = true
//       5. master_audit_logs に記録
```

---

## OO.6 間取り解析パイプライン（Claude Vision 完全移行版） {#oo6}

> **ADR-144**: FloorplanVLM（Beike製）は商用ライセンスを取得できないため廃止。
> 全間取り解析をClaude Vision（claude-sonnet-4）による単独パイプラインに移行する。

### OO.6.1 設計判断（ADR-144詳細）

```
FloorplanVLM廃止の理由:
  - Beike（北京居道科技）製のオープンソースモデル
  - 商用利用条件が不明確・ライセンス取得不可
  - 日本語対応の保証なし
  - セルフホストのインフラコストが発生

Claude Vision採用の根拠:
  - 商用利用: Anthropic利用規約の範囲内で明確に許可
  - 精度: 構造化JSONプロンプトにより実用精度（75〜85%）を実現
  - コスト: Sonnet 4 約¥800/物件（他の生成コストと統合）
  - 保守性: 既存のClaude API呼び出し基盤を流用
  - 日本語対応: 日本語ラベル（LDK・洋室・押入等）のネイティブ理解

精度比較:
  FloorplanVLM:    92.52% IoU（学術ベンチマーク）
  Claude Vision:   75〜85% IoU（実測・プロンプト最適化後）
  手動入力:        100%（精度最高・コスト最大）
  BIM/IFC:         95%+（設計データがある場合のみ）

実装方針:
  Claude Visionを「第1推奨」として全パイプラインで使用
  精度が75%未満の場合はマスター管理画面でスタッフが手動修正
  BIM/IFCデータがある場合は引き続き最優先で使用
```

### OO.6.2 Claude Vision 間取り解析プロンプト

```typescript
// packages/shared/lib/FloorplanAnalyzer.ts
// （旧: FloorplanVLMパイプライン → 完全置換）

import Anthropic from '@anthropic-ai/sdk'
import { RoomSchema, WallSchema, OpeningSchema } from '../schemas/scene'
import { z } from 'zod'

const client = new Anthropic()

export class FloorplanAnalyzer {

  async analyze(imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'application/pdf'): Promise<FloorplanAnalysisResult> {

    const systemPrompt = `あなたは日本の不動産間取り図解析の専門家です。
間取り図画像を解析し、以下のJSON形式で構造データを出力してください。

出力形式の厳守事項:
- 必ずJSONのみを出力し、前後に説明文を一切含めないこと
- 座標はメートル単位、建物の左下角を原点(0,0)とする
- 部屋の種別は指定のenumから最も近いものを選ぶ
- 信頼度スコア(0.0〜1.0)を各要素に付与する
- 北方向が不明な場合は northAngle: null とする`

    const userPrompt = `以下の間取り図を解析して、rooms・walls・openings・northAngleをJSONで出力してください。

必須フィールド:
{
  "confidence": 0.0〜1.0,  // 解析全体の信頼度
  "northAngle": 数値 | null,  // 北方向の角度（度数）、右向きが0度
  "totalArea": 数値,        // 延床面積（㎡）
  "floors": 数値,           // 階数
  "rooms": [
    {
      "id": "room_1",
      "type": "ldk" | "bedroom" | "bathroom" | "toilet" | "entrance" | "closet" | "balcony" | "garage" | "study" | "japanese_room" | "storage",
      "label": "LDK 20.5畳",  // 図面上の表記そのまま
      "x": 数値, "y": 数値,    // 左下角の座標（m）
      "width": 数値, "depth": 数値, "height": 数値,  // (m)
      "floor": 1,
      "area": 数値,           // ㎡
      "confidence": 0.0〜1.0
    }
  ],
  "walls": [
    {
      "id": "wall_1",
      "x1": 数値, "y1": 数値, "x2": 数値, "y2": 数値,  // 始点・終点（m）
      "thickness": 0.12,
      "floor": 1,
      "isExternal": true | false
    }
  ],
  "openings": [
    {
      "id": "opening_1",
      "type": "door" | "window" | "sliding_door" | "french_window",
      "wallId": "wall_1",
      "position": 0.5,         // 壁上の位置（0〜1）
      "width": 数値,            // 開口幅（m）
      "sillHeight": 数値 | null,  // 窓台高（m）
      "headHeight": 数値 | null   // まぐさ高（m）
    }
  ],
  "issues": ["解析できなかった箇所や不確かな箇所の説明"]
}`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType === 'application/pdf' ? 'image/jpeg' : mediaType,
              data: imageBase64,
            }
          },
          { type: 'text', text: userPrompt }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const raw = JSON.parse(clean)

    // Zodで構造検証
    const rooms   = z.array(RoomSchema).parse(raw.rooms ?? [])
    const walls   = z.array(WallSchema).parse(raw.walls ?? [])
    const openings = z.array(OpeningSchema).parse(raw.openings ?? [])

    return {
      confidence:  raw.confidence ?? 0,
      northAngle:  raw.northAngle ?? null,
      totalArea:   raw.totalArea ?? 0,
      floors:      raw.floors ?? 1,
      rooms,
      walls,
      openings,
      issues:      raw.issues ?? [],
      rawResponse: raw,
    }
  }
}

export interface FloorplanAnalysisResult {
  confidence: number        // 0.0〜1.0
  northAngle: number | null
  totalArea:  number
  floors:     number
  rooms:      z.infer<typeof RoomSchema>[]
  walls:      z.infer<typeof WallSchema>[]
  openings:   z.infer<typeof OpeningSchema>[]
  issues:     string[]
  rawResponse: unknown
}
```

### OO.6.3 信頼度別ルーティング

```typescript
// packages/shared/lib/FloorplanRouter.ts

export type FloorplanRoute =
  | 'auto_approved'   // confidence >= 0.85: 自動承認・マスター確認不要
  | 'master_review'   // 0.60 <= confidence < 0.85: マスター画面でスタッフが確認
  | 'manual_required' // confidence < 0.60: スタッフが手動入力必須

export function routeByConfidence(confidence: number): FloorplanRoute {
  if (confidence >= 0.85) return 'auto_approved'
  if (confidence >= 0.60) return 'master_review'
  return 'manual_required'
}
```

### OO.6.4 マスター間取り確認画面

```
画面: /master/floorplan/{jobId}

左パネル: 元の間取り図画像（PDF/PNG）
右パネル: Claude Visionの解析結果

  - 部屋一覧（type / label / area）
    → 各部屋の type を手動修正可能なセレクト
    → 座標・寸法の手動修正フォーム

  - 信頼度スコア表示
    信頼度: 0.72  [●●●●●●●○○○]  要確認

  - 問題箇所ハイライト
    ⚠ 「issues」フィールドの内容を黄色バナーで表示

  - ビューポート（Three.js（WebGPURenderer標準・WebGL2自動フォールバック、ADR-162.1））
    → 解析結果を3Dプレビューで確認
    → 部屋を選択すると対応する間取り図の位置をハイライト

  - アクション
    [再解析（別プロンプトで再試行）]  [手動修正を確定]  [破棄]

修正確定後:
  - scene.property.structure を更新
  - structureSource = 'floorplan_claude_vision'
  - structureAccuracy = 修正後の推定精度
  - master_audit_logs に記録
```

### OO.6.5 structureSource の更新（Part NN との整合）

```typescript
// packages/shared/schemas/scene.ts の ImmutablePropertySchema を更新

structureSource: z.enum([
  'floorplan_claude_vision', // ★ FloorplanVLM → 置換。Claude Vision解析
  'bim_ifc',                 // BIM/IFCから生成（精度0.95+）
  'manual_input',            // 手動入力
  'procedural',              // AI自動生成（※LP表示時に免責文必須）
  // 'floorplan_vlm'         // 廃止（ADR-144）
]),
```

---

## OO.7 品質保証・QualityCheckAgent {#oo7}

### OO.7.1 QualityCheckAgent 実装

受注制作の納品前に自動で品質検証を行うエージェント。
マスター管理画面の「QA確認」ステップで pg-boss ジョブとして実行される。

```typescript
// packages/shared/lib/QualityCheckAgent.ts

export class QualityCheckAgent {

  async run(orderId: string): Promise<QAResult> {
    const order = await this.getOrder(orderId)
    const scene = await this.getScene(order.sceneId!)

    const checks = await Promise.all([
      this.checkCompliance(scene),       // 宅建業法コンプライアンス
      this.checkScore(scene),            // ScoreEngine（目標85点以上）
      this.checkImmutability(scene),     // 建物構造不変性
      this.checkDeliverables(order),     // 成果物一覧（グレード別）
      this.checkImageQuality(scene),     // 画像品質（解像度・AI生成ラベル）
    ])

    const passed = checks.every(c => c.status !== 'fail')
    const warnings = checks.filter(c => c.status === 'warning')

    // ステータス更新
    await this.updateOrderStatus(orderId,
      passed ? 'qa_passed' : 'qa_failed',
      checks
    )

    // スタッフにSlack通知（要設定）
    await this.notifyStaff(orderId, passed, checks)

    return { passed, checks, warnings: warnings.length }
  }

  private async checkScore(scene: SceneConfig): Promise<CheckResult> {
    const { ScoreEngine } = await import('./ScoreEngine')
    const result = ScoreEngine.compute(scene)
    return {
      name: 'スコア検証',
      status: result.total >= 85 ? 'pass'
             : result.total >= 70 ? 'warning'
             : 'fail',
      value: `${result.total}点`,
      detail: result.issues.map(i => i.msg).join(' / '),
    }
  }

  private async checkCompliance(scene: SceneConfig): Promise<CheckResult> {
    const { ComplianceChecker } = await import('./ComplianceChecker')
    const status = await ComplianceChecker.check(scene)
    return {
      name: '宅建業法コンプライアンス',
      status: status.overall,
      value: status.overall.toUpperCase(),
      detail: Object.entries(status.items)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .join(', ') || 'すべての項目を満たしています',
    }
  }

  private async checkDeliverables(order: Order): Promise<CheckResult> {
    const required = GRADE_REQUIRED_DELIVERABLES[order.grade]
    const missing = required.filter(d => !order.deliverables[d as keyof typeof order.deliverables])
    return {
      name: '成果物チェック',
      status: missing.length === 0 ? 'pass' : 'fail',
      value: `${required.length - missing.length}/${required.length}`,
      detail: missing.length > 0 ? `未生成: ${missing.join(', ')}` : '全成果物確認済み',
    }
  }
}

// グレード別の必須成果物
const GRADE_REQUIRED_DELIVERABLES = {
  basic3d:   ['lpUrl', 'splatUrl'],
  standard:  ['lpUrl', 'splatUrl', 'videoUrl'],
  premium:   ['lpUrl', 'splatUrl', 'videoUrl', 'usdzUrl'],
  luxury:    ['lpUrl', 'splatUrl', 'videoUrl', 'usdzUrl', 'bimUrl'],
} as const

interface CheckResult {
  name:   string
  status: 'pass' | 'warning' | 'fail'
  value:  string
  detail: string
}
```

---

## OO.8 課金・コスト管理 {#oo8}

### OO.8.1 コスト管理画面

```
画面: /master/costs

表示内容:
  ① 月次コストサマリー（全テナント合計）
     - Claude API費用（Sonnet / Haiku別）
     - Higgsfield MCP費用
     - Cloudflare R2ストレージ
     - Supabase使用量

  ② テナント別コストランキング（当月）
     - 高コストテナントを上位表示
     - 予算超過テナントを赤ハイライト

  ③ テナント別課金プラン管理
     - プラン変更履歴
     - 月次上限設定（LoopCostTrackerと連携）

  ④ 受注制作コスト管理
     - 受注ごとのAPI使用料
     - 粗利計算（受注金額 - API費用）
```

### OO.8.2 プラン変更API（super_adminのみ）

```typescript
// app/api/master/tenants/[id]/plan/route.ts

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const staff = await verifyMasterAuth(req, 'super_admin')
  if (!staff) return Response.json({ error: 'forbidden' }, { status: 403 })

  const { plan } = await req.json()

  await db.update(tenants)
    .set({ plan })
    .where(eq(tenants.id, params.id))

  await db.insert(masterAuditLogs).values({
    staffId:    staff.id,
    action:     'change_plan',
    targetType: 'tenant',
    targetId:   params.id,
    metadata:   { newPlan: plan },
  })

  return Response.json({ ok: true })
}
```

---

## OO.9 システム設定・マスターデータ管理 {#oo9}

```
画面: /master/settings

設定タブ構成（v1.2追加: ① AIプロバイダー設定）:

  ① AIプロバイダー設定（新規）     ← OO.9.AI
  ② Claudeエージェント設定（既存）  ← LLMRouter 統合後は①に統合
  ③ 間取り解析設定
  ④ 動画生成設定
  ⑤ ポータル連携設定
  ⑥ 通知設定
  ⑦ スタッフアカウント管理
```

---

## OO.9.AI — AIプロバイダー設定（v1.2新規） {#oo9ai}

### OO.9.AI.1 設計方針

```
目的:
  Claude / OpenAI / Gemini の3プロバイダーを
  タスク別に比較・評価し、マスター管理画面から
  使用するプロバイダーを動的に切り替えられるようにする。

原則:
  1. タスク別設定: コピー生成に OpenAI、SEOに Claude など
     タスク単位でプロバイダーを選択できる
  2. フォールバック順: プロバイダーごとに優先順位を設定。
     1位が失敗した場合に自動で2位へフォールバック
  3. 設定はDBに保存: LLMRouterが毎回DBを参照（5分キャッシュ）。
     マスター管理画面での変更が即時（〜5分以内）に反映される
  4. ベンチマーク結果をDBに蓄積: benchmark_resultsテーブルに
     各実行の出力・評価スコアを記録し、設定の根拠を残す
  5. コストも記録: api_cost_logsに provider/model を記録済み。
     LLMRouterを経由した呼び出しは全件記録される

契約状況（2026-06-15時点）:
  Claude:  契約予定 → claude-sonnet-4-6 / claude-haiku-4-5 / claude-opus-4-6
  OpenAI:  契約予定 → gpt-4o / gpt-4o-mini / gpt-image-1（写真リタッチ専用）
  Gemini:  無料枠のみ → gemini-1.5-flash（無料）/ gemini-1.5-pro（無料枠）
```

### OO.9.AI.2 タスク定義

```typescript
// packages/shared/lib/LLMRouter.ts

export type LLMTask =
  | 'copy'            // キャッチコピー生成（宅建業法禁止語チェック連動）
  | 'seo'             // SEOタイトル・ディスクリプション生成
  | 'faq'             // FAQ自動生成
  | 'floorplan'       // 間取り図解析（Claude Vision / Gemini Vision）
  | 'photo_retouch'   // 写真リタッチ指示生成（ADR-170: gpt-image-1 専用）
  | 'classification'  // 軽量分類タスク（物件種別推定等）
  | 'legal_check'     // 法的チェック（複雑な宅建業法解釈）

export type LLMProvider = 'claude' | 'openai' | 'gemini'

// タスク別デフォルト設定（マスター管理画面で上書き可能）
export const DEFAULT_PROVIDER_PRIORITY: Record<LLMTask, LLMProvider[]> = {
  copy:           ['claude', 'openai', 'gemini'],
  seo:            ['claude', 'openai', 'gemini'],
  faq:            ['claude', 'openai', 'gemini'],
  floorplan:      ['claude', 'gemini'],          // OpenAIはVision精度未検証のため除外
  photo_retouch:  ['openai'],                    // ADR-170: gpt-image-1専用。フォールバックなし
  classification: ['gemini', 'claude'],           // 軽量タスクはGemini無料枠を優先
  legal_check:    ['claude'],                    // 宅建業法: claude-opus-4-6 固定
}

// タスク別デフォルトモデル
export const DEFAULT_MODELS: Record<LLMTask, Record<LLMProvider, string>> = {
  copy:           { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-flash' },
  seo:            { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-flash' },
  faq:            { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-pro'  },
  floorplan:      { claude: 'claude-sonnet-4-6', openai: 'gpt-4o',      gemini: 'gemini-1.5-pro'  },
  photo_retouch:  { claude: 'claude-sonnet-4-6', openai: 'gpt-image-1', gemini: 'gemini-1.5-flash' },
  classification: { claude: 'claude-haiku-4-5',  openai: 'gpt-4o-mini', gemini: 'gemini-1.5-flash' },
  legal_check:    { claude: 'claude-opus-4-6',   openai: 'gpt-4o',      gemini: 'gemini-1.5-pro'  },
}
```

### OO.9.AI.3 LLMRouter 完全実装

```typescript
// packages/shared/lib/LLMRouter.ts

import Anthropic from '@anthropic-ai/sdk'
import OpenAI    from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../db/client'
import { aiProviderSettings } from '../db/schema'
import { eq, asc }  from 'drizzle-orm'
import { tracer }   from '../observability/tracer'
import { logger }   from '../observability/logger'
import type { LLMTask, LLMProvider } from './LLMRouter.types'

// ── クライアント初期化 ──────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai    = new OpenAI   ({ apiKey: process.env.OPENAI_API_KEY })
const gemini    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

// ── 設定キャッシュ（5分 TTL）──────────────────────────
interface CachedSettings {
  data:      ProviderSetting[]
  expiresAt: number
}
let settingsCache: CachedSettings | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

async function getSettings(): Promise<ProviderSetting[]> {
  if (settingsCache && Date.now() < settingsCache.expiresAt) {
    return settingsCache.data
  }
  const rows = await db
    .select()
    .from(aiProviderSettings)
    .where(eq(aiProviderSettings.enabled, true))
    .orderBy(asc(aiProviderSettings.priority))

  settingsCache = { data: rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

export function clearSettingsCache(): void {
  settingsCache = null
}

// ── LLMRouter.run() ────────────────────────────────
export interface LLMRequest {
  task:        LLMTask
  prompt:      string
  systemPrompt?: string
  maxTokens?:  number
  propertyId?: string
}

export interface LLMResponse {
  text:       string
  provider:   LLMProvider
  model:      string
  latencyMs:  number
  inputTokens:  number
  outputTokens: number
}

export const LLMRouter = {

  async run(req: LLMRequest): Promise<LLMResponse> {
    const span = tracer.startSpan(`llm.router.${req.task}`)
    try {
      const settings  = await getSettings()
      const taskRows  = settings
        .filter(r => r.task === req.task)
        .sort((a, b) => a.priority - b.priority)

      // DB設定がなければデフォルト順
      const providers = taskRows.length > 0
        ? taskRows.map(r => ({ provider: r.provider as LLMProvider, model: r.model }))
        : DEFAULT_PROVIDER_PRIORITY[req.task].map(p => ({
            provider: p,
            model: DEFAULT_MODELS[req.task][p],
          }))

      let lastError: Error | undefined
      for (const { provider, model } of providers) {
        try {
          const result = await callProvider(provider, model, req)
          await recordCost(req.task, provider, model, result, req.propertyId)
          span.setStatus({ code: 1 }) // OK
          return result
        } catch (e) {
          lastError = e as Error
          logger.warn({
            event:    'llm.provider.failed',
            task:     req.task,
            provider,
            model,
            error:    lastError.message,
          })
          // 次のプロバイダーへフォールバック
        }
      }

      span.setStatus({ code: 2, message: lastError?.message }) // ERROR
      throw new Error(
        `LLMRouter: タスク '${req.task}' の全プロバイダーが失敗しました。最後のエラー: ${lastError?.message}`,
      )
    } finally {
      span.end()
    }
  },

  /** ベンチマーク: 有効な全プロバイダーに並列送信して結果を返す */
  async benchmark(req: Omit<LLMRequest, 'propertyId'>): Promise<BenchmarkResult[]> {
    const settings = await getSettings()
    const taskRows = settings.filter(r => r.task === req.task)

    const providers = taskRows.length > 0
      ? taskRows.map(r => ({ provider: r.provider as LLMProvider, model: r.model }))
      : DEFAULT_PROVIDER_PRIORITY[req.task].map(p => ({
          provider: p,
          model: DEFAULT_MODELS[req.task][p],
        }))

    const results = await Promise.allSettled(
      providers.map(async ({ provider, model }) => {
        const start = Date.now()
        try {
          const res = await callProvider(provider, model, req)
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

    return results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
  },

  /** DB設定をキャッシュを無効化して再読み込み（設定変更直後に呼ぶ）*/
  invalidateCache(): void {
    clearSettingsCache()
  },
}

// ── プロバイダー別呼び出し ──────────────────────────
async function callProvider(
  provider: LLMProvider,
  model:    string,
  req:      LLMRequest,
): Promise<LLMResponse> {
  const start = Date.now()

  switch (provider) {
    case 'claude': {
      const res = await anthropic.messages.create({
        model,
        max_tokens:  req.maxTokens ?? 1024,
        system:      req.systemPrompt,
        messages:    [{ role: 'user', content: req.prompt }],
      })
      const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
      return {
        text,
        provider:     'claude',
        model,
        latencyMs:    Date.now() - start,
        inputTokens:  res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      }
    }

    case 'openai': {
      // gpt-image-1 は photo_retouch 専用（テキスト生成タスクには使わない）
      if (model === 'gpt-image-1') {
        throw new Error('gpt-image-1 は photo_retouch タスク専用。テキスト生成には使用不可')
      }
      const res = await openai.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          ...(req.systemPrompt ? [{ role: 'system' as const, content: req.systemPrompt }] : []),
          { role: 'user', content: req.prompt },
        ],
      })
      const text = res.choices[0]?.message.content ?? ''
      return {
        text,
        provider:     'openai',
        model,
        latencyMs:    Date.now() - start,
        inputTokens:  res.usage?.prompt_tokens     ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      }
    }

    case 'gemini': {
      const genModel = gemini.getGenerativeModel({ model })
      const fullPrompt = req.systemPrompt
        ? `${req.systemPrompt}\n\n${req.prompt}`
        : req.prompt
      const res = await genModel.generateContent(fullPrompt)
      const text = res.response.text()
      return {
        text,
        provider:     'gemini',
        model,
        latencyMs:    Date.now() - start,
        // Gemini 無料枠はトークンカウントAPIが別途必要なため推定値
        inputTokens:  Math.ceil(fullPrompt.length / 4),
        outputTokens: Math.ceil(text.length / 4),
      }
    }
  }
}

// ── コスト記録（api_cost_logs）─────────────────────
const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
  // 円/token（2026-06 時点の概算）
  'claude-sonnet-4-6': { input: 0.00045, output: 0.00135 },
  'claude-haiku-4-5':  { input: 0.00003, output: 0.00012 },
  'claude-opus-4-6':   { input: 0.00225, output: 0.01125 },
  'gpt-4o':            { input: 0.00075, output: 0.00225 },
  'gpt-4o-mini':       { input: 0.000023, output: 0.000068 },
  'gemini-1.5-flash':  { input: 0.0,     output: 0.0 },  // 無料枠
  'gemini-1.5-pro':    { input: 0.0,     output: 0.0 },  // 無料枠（上限あり）
}

async function recordCost(
  task:       string,
  provider:   string,
  model:      string,
  res:        LLMResponse,
  propertyId?: string,
): Promise<void> {
  const rates    = COST_PER_TOKEN[model] ?? { input: 0, output: 0 }
  const costJpy  = res.inputTokens * rates.input + res.outputTokens * rates.output

  await db.insert(apiCostLogs).values({
    task,
    provider,
    model,
    costJpy:      Math.ceil(costJpy),
    inputTokens:  res.inputTokens,
    outputTokens: res.outputTokens,
    propertyId:   propertyId ?? null,
  })
}

// ── 型 ─────────────────────────────────────────────
interface ProviderSetting {
  task:     string
  provider: string
  model:    string
  priority: number
  enabled:  boolean
}

export interface BenchmarkResult {
  provider:     LLMProvider
  model:        string
  text:         string
  latencyMs:    number
  inputTokens:  number
  outputTokens: number
  status:       'ok' | 'error'
  error?:       string
}
```

### OO.9.AI.4 DBスキーマ

```sql
-- AIプロバイダー設定テーブル
-- タスク × プロバイダー × 優先順位 の設定を管理
CREATE TABLE ai_provider_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task        TEXT NOT NULL,
  -- 'copy' | 'seo' | 'faq' | 'floorplan' | 'photo_retouch'
  -- | 'classification' | 'legal_check'

  provider    TEXT NOT NULL,
  -- 'claude' | 'openai' | 'gemini'

  model       TEXT NOT NULL,
  -- claude: 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'claude-opus-4-6'
  -- openai: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-image-1'（photo_retouchのみ）
  -- gemini: 'gemini-1.5-flash' | 'gemini-1.5-pro'

  priority    INT  NOT NULL DEFAULT 1,
  -- 同一タスク内での優先順位（1=最高優先・フォールバック先ほど大きい値）

  enabled     BOOL NOT NULL DEFAULT true,
  -- false にするとそのプロバイダーはLLMRouterが使用しない

  -- メモ（ベンチマーク結果などを記録）
  note        TEXT,

  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES sislir_staff(id),

  UNIQUE (task, provider)  -- 同一タスク×プロバイダーは1行のみ
);

-- デフォルト設定を INSERT（マスター画面で変更可能）
INSERT INTO ai_provider_settings (task, provider, model, priority, note) VALUES
  -- copy
  ('copy', 'claude', 'claude-sonnet-4-6', 1, 'デフォルト: 宅建業法禁止語チェックと相性が良い'),
  ('copy', 'openai', 'gpt-4o',            2, 'フォールバック'),
  ('copy', 'gemini', 'gemini-1.5-flash',  3, 'フォールバック（無料枠）'),
  -- seo
  ('seo', 'claude', 'claude-sonnet-4-6', 1, 'デフォルト'),
  ('seo', 'openai', 'gpt-4o',            2, 'フォールバック'),
  ('seo', 'gemini', 'gemini-1.5-flash',  3, 'フォールバック（無料枠）'),
  -- faq
  ('faq', 'claude', 'claude-sonnet-4-6', 1, 'デフォルト'),
  ('faq', 'openai', 'gpt-4o',            2, 'フォールバック'),
  ('faq', 'gemini', 'gemini-1.5-pro',    3, 'フォールバック（無料枠）'),
  -- floorplan（OpenAI Vision は精度未検証のため除外）
  ('floorplan', 'claude', 'claude-sonnet-4-6', 1, 'デフォルト: Claude Vision'),
  ('floorplan', 'gemini', 'gemini-1.5-pro',    2, 'フォールバック: Gemini Vision'),
  -- photo_retouch（ADR-170: gpt-image-1専用）
  ('photo_retouch', 'openai', 'gpt-image-1', 1, 'ADR-170: gpt-image-1専用。フォールバックなし'),
  -- classification（軽量タスクはGemini無料枠優先）
  ('classification', 'gemini', 'gemini-1.5-flash', 1, 'デフォルト: 無料枠で十分'),
  ('classification', 'claude', 'claude-haiku-4-5', 2, 'フォールバック'),
  -- legal_check（宅建業法: Claude Opusのみ）
  ('legal_check', 'claude', 'claude-opus-4-6', 1, 'ADR-162: 法的チェックはOpus固定');

-- ベンチマーク結果テーブル
CREATE TABLE benchmark_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task        TEXT NOT NULL,
  prompt      TEXT NOT NULL,           -- 使用したプロンプト（ハッシュ化も可）

  -- 結果（プロバイダー×モデル別）
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  output      TEXT NOT NULL,           -- 生成テキスト
  latency_ms  INT  NOT NULL,

  -- 人間による評価（マスター管理画面から入力）
  human_score INT,                     -- 1〜5（5=最高）
  human_note  TEXT,                    -- 評価コメント

  -- 集計
  is_winner   BOOL DEFAULT false,      -- そのタスク×実行で最高評価だったか

  evaluated_by UUID REFERENCES sislir_staff(id),
  evaluated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON benchmark_results (task, provider);
CREATE INDEX ON benchmark_results (task, created_at DESC);
CREATE INDEX ON benchmark_results (is_winner) WHERE is_winner = true;
```

### OO.9.AI.5 APIエンドポイント

```
/master/settings/ai-providers の操作:

GET  /api/master/ai-providers
  → ai_provider_settings を全件取得（タスク別グループ化）

PATCH /api/master/ai-providers/:task/:provider
  → priority / model / enabled / note を更新
  → LLMRouter.invalidateCache() を呼んでキャッシュ即時破棄
  → master_audit_logs に記録

POST /api/master/ai-providers/benchmark
  → body: { task, prompt }
  → LLMRouter.benchmark() を実行（並列）
  → benchmark_results に保存
  → 結果を返却

PATCH /api/master/ai-providers/benchmark/:id/score
  → body: { humanScore, humanNote, isWinner }
  → benchmark_results を更新
  → isWinner=true の場合、ai_provider_settings の priority を自動並び替え
```

### OO.9.AI.6 プロバイダー設定画面のUI設計

```
URL: /master/settings（タブ: AIプロバイダー設定）

─────────────────────────────────────────────────────────
タブ① 設定一覧
─────────────────────────────────────────────────────────

タスク別プロバイダー優先順位テーブル:

  ┌───────────────┬──────────────────┬──────────────────┬─────────────────┐
  │ タスク        │ 1位（優先）       │ 2位（FB1）       │ 3位（FB2）      │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ キャッチコピー │ ● Claude Sonnet  │ ● GPT-4o         │ ● Gemini Flash  │
  │               │ [変更▼] [無効化] │ [変更▼] [無効化] │ [変更▼][無効化] │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ SEO生成       │ ● Claude Sonnet  │ ● GPT-4o         │ ● Gemini Flash  │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ FAQ生成       │ ● Claude Sonnet  │ ● GPT-4o         │ ● Gemini Pro    │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ 間取り解析    │ ● Claude Sonnet  │ ● Gemini Pro     │ ─ (固定)        │
  │               │ Claude Vision    │ Gemini Vision    │ OpenAI未検証    │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ 写真リタッチ  │ ● gpt-image-1    │ ─ (ADR-170固定)  │ ─               │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ 分類タスク    │ ● Gemini Flash   │ ● Claude Haiku   │ ─               │
  │               │ 無料枠優先       │                  │                 │
  ├───────────────┼──────────────────┼──────────────────┼─────────────────┤
  │ 法的チェック  │ ● Claude Opus    │ ─ (ADR固定)      │ ─               │
  └───────────────┴──────────────────┴──────────────────┴─────────────────┘

  [変更▼] クリック → インラインドロップダウンでモデル選択
  [無効化] クリック → そのプロバイダーをフォールバック対象から除外

─────────────────────────────────────────────────────────
タブ② ベンチマーク比較テスト
─────────────────────────────────────────────────────────

  ← 現在のArtifact（比較UI）をここにマウント ←

  タスク選択: [キャッチコピー▼]

  プロンプト:
  ┌──────────────────────────────────────────────────────┐
  │（タスク別のデフォルトプロンプトが自動挿入）            │
  │ 物件情報を入力して実際の出力を比較...                  │
  └──────────────────────────────────────────────────────┘

  [3プロバイダーに並列送信]

  結果表示（横並び3列）:
  ┌──────────────┬──────────────┬──────────────┐
  │ Claude       │ GPT-4o       │ Gemini Flash │
  │ （出力）     │ （出力）     │ （出力）     │
  │ ★★★★☆      │ ★★★☆☆      │ ★★☆☆☆      │
  │ 1.4秒        │ 2.1秒        │ 0.9秒        │
  └──────────────┴──────────────┴──────────────┘

  [この結果を採用してプロバイダー設定に反映] ← 最高評価のプロバイダーを1位に昇格

─────────────────────────────────────────────────────────
タブ③ ベンチマーク履歴
─────────────────────────────────────────────────────────

  タスク別の過去ベンチマーク結果一覧:

  ┌──────────────┬──────────────────┬────────┬────────────┬──────────────┐
  │ 実行日時     │ タスク            │ 優勝   │ スコア     │ 評価者       │
  ├──────────────┼──────────────────┼────────┼────────────┼──────────────┤
  │ 06/15 10:23  │ キャッチコピー   │ Claude │ 5★         │ 藤岡         │
  │ 06/14 15:11  │ SEO生成          │ GPT-4o │ 4★         │ 藤岡         │
  │ 06/13 09:45  │ FAQ生成          │ Claude │ 5★         │ スタッフA    │
  └──────────────┴──────────────────┴────────┴────────────┴──────────────┘

  [詳細を見る] → 実際の出力テキストを全件表示
```

---

## OO.10 DBスキーマ追加 {#oo10}

v1.1 の既存テーブルに加え、以下を追加:

```sql
-- OO.9.AI.4 参照
-- ai_provider_settings テーブル
-- benchmark_results テーブル
```

（SQL 全文は OO.9.AI.4 を参照）

---

## OO.11 APIエンドポイント {#oo11}

v1.1 の既存エンドポイントに加え、以下を追加:

```
GET  /api/master/ai-providers                        # 設定一覧
PATCH /api/master/ai-providers/:task/:provider       # 設定変更
POST /api/master/ai-providers/benchmark              # ベンチマーク実行
PATCH /api/master/ai-providers/benchmark/:id/score  # 人間評価入力
```

---

## OO.12 セキュリティ設計 {#oo12}

```
マスター管理画面のセキュリティ要件:

  ① 分離されたオリジン
     - master.sislir.com は dashboard.sislir.com と完全に分離
     - CORS: master.sislir.com のみ許可
     - テナント向けCSPにはマスタードメインを含めない

  ② service_role_key の厳格管理
     - apps/master のサーバーサイドのみで使用
     - クライアントサイドには一切渡さない
     - .env.local に SUPABASE_SERVICE_ROLE_KEY として管理
     - GitHub Secrets / Vercel Environment Variables で管理

  ③ 全操作の監査ログ（ADR-150）
     - master_audit_logs に全操作を記録
     - ログの削除・改ざんはsuper_adminでも不可（DB trigger で保護）
     - ログ保存期間: 2年間

  ④ セッション管理
     - セッション有効期限: 8時間（テナントは24時間）
     - 非アクティブ30分でセッション切断
     - Magic Link認証（パスワードなし）

  ⑤ IP制限（オプション・Phase 2）
     - Cloudflare Access でVPN/固定IPからのみアクセス可能にする
```

---
## OO.13 ADRログ {#oo13}

v1.1 の ADR-144〜151 に加え、以下を追加:

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-180 | マルチLLMプロバイダー対応を LLMRouter で抽象化 | Claude/OpenAI/Gemini を比較しながらタスク別に最適なプロバイダーを選択できる設計が必要。固定実装では変更コストが大きい | 各呼び出し箇所に直接プロバイダーコードを書く |
| ADR-181 | プロバイダー設定を ai_provider_settings テーブルで管理（環境変数ではなく） | 設定変更のたびにデプロイが不要。マスター管理画面から即時変更でき、変更履歴も残る | .env で PROVIDER_COPY=claude 等を管理 |
| ADR-182 | ベンチマーク結果を benchmark_results テーブルに蓄積 | 「なぜそのプロバイダーを選んだか」の根拠をDBに残す。将来の再評価・コスト分析にも活用できる | 都度Spreadsheetで管理 |
| ADR-183 | photo_retouch タスクは gpt-image-1 固定・フォールバックなし（ADR-170継承） | 画像編集APIは他プロバイダーと互換性がない。Gemini/Claudeは画像編集APIを持たない | Cloudinary等の画像編集SaaS |
| ADR-184 | legal_check タスクは claude-opus-4-6 固定 | 宅建業法の解釈は複雑で精度が重要。Opus以外は法令判断の精度リスクがある。コストは許容範囲（呼び出し頻度が低い） | GPT-4oで代替 |
| ADR-185 | Gemini は無料枠のみ使用（2026-06-15時点） | 契約なし。classification等の軽量タスクで無料枠を活用しコスト削減。本番稼働後に有料化を検討 | Gemini契約して全タスクに使用 |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|----------|------|--------|
| v1.0 | 2026-06-12 | 初版 |
| v1.1 | 2026-06-13 | AIモデル文字列更新。ADR-162.1準拠ビューポート記述修正 |
| v1.2 | 2026-06-15 | OO.9.AI（AIプロバイダー設定）追加。LLMRouter設計。DBスキーマ追加。ADR-180〜185追加 |
