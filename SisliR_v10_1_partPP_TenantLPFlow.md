# Part PP — テナント側 LP作成・管理 UIフロー 完全設計書
## マルチユーザー操作範囲の明文化 · シンプルLP作成 · 3DLP受発注フロー

> **バージョン**: v1.0 (2026-06-12)
> **位置づけ**: テナント（不動産会社）ユーザーが自分でできることと、SisliR社に依頼することの境界線を定義する
> **依存**: SisliR v10.1 完全設計書 + Part MM（LP Editor v5.0）+ Part OO（マスター管理画面）
> **前提**: FloorplanVLM廃止（ADR-144）。間取り解析はClaude Visionによりマスター管理画面で処理

---

## 目次

- [PP.0 設計方針：「境界線の明文化」](#pp0)
- [PP.1 テナントユーザーの操作権限マトリクス](#pp1)
- [PP.2 物件登録〜コンテンツ生成フロー（全自動）](#pp2)
- [PP.3 シンプルLP作成・編集フロー（テナント自操作）](#pp3)
- [PP.4 3DLP受発注フロー（マスターへの依頼）](#pp4)
- [PP.5 テナントダッシュボードのUI設計](#pp5)
- [PP.6 物件詳細・LP管理画面](#pp6)
- [PP.7 反響管理画面とエージェント統合](#pp7)
- [PP.8 権限別UI出し分けの実装](#pp8)
- [PP.9 テナント向けヘルプ・ガイダンス設計](#pp9)
- [PP.10 ADRログ](#pp10)

---

## PP.0 設計方針：「境界線の明文化」 {#pp0}

```
テナント（不動産会社）ができること / できないこと:

  ✅ できること（テナントが自分で操作）
     - 物件素材のアップロード（写真・PDF図面・スペック）
     - PropertyIntakeAgentによる全自動コンテンツ生成の確認
     - シンプルLPのテキスト・写真・CTAを自分で編集・公開
     - ポータル入稿CSV の確認・ダウンロード
     - SNSサムネイルの確認・投稿スケジュール設定
     - LP公開・非公開の切り替え
     - 反響（リード）の管理・ステータス更新
     - 各種分析ダッシュボードの閲覧

  ❌ できないこと（SisliR社内=マスターが担当）
     - 3DLP（Gaussian Splat / ProceduralMesh）の新規作成
     - 3DLP Editorでの演出・照明・PostFX・カメラパス編集
     - 間取り図のClaude Vision解析結果の確認・修正
     - 他テナントのデータへのアクセス
     - 動画生成パラメータの詳細設定
     - 課金プランの変更（SisliR営業担当に連絡）

境界線の設計原則:
  「テナントが操作できるのはコンテンツの確認・微調整まで」
  「3D体験の演出は専門性が高いため、SisliR社内で品質を担保して納品する」
  「この制約が受注制作（トラックB）の価値を保護する」
```

---

## PP.1 テナントユーザーの操作権限マトリクス {#pp1}

### PP.1.1 role別権限（テナント内）

| 機能 | tenant admin | tenant member | 備考 |
|------|:----------:|:------------:|------|
| 物件登録・アップロード | ✅ | ✅ | 全担当者が操作可 |
| コンテンツ生成（自動） | ✅ | ✅ | ボタンを押すだけ |
| シンプルLP テキスト編集 | ✅ | ✅ | 自分で操作可能な範囲 |
| シンプルLP 写真差替 | ✅ | ✅ | 自分で操作可能な範囲 |
| シンプルLP 公開・非公開 | ✅ | ✅ | |
| 3DLP 閲覧（プレビュー） | ✅ | ✅ | 閲覧のみ |
| 3DLP 編集 | ❌ | ❌ | **マスター管理画面のみ** |
| 3DLP 受発注フォーム送信 | ✅ | ❌ | adminのみ受発注可 |
| ポータルCSV ダウンロード | ✅ | ✅ | |
| SNS 投稿スケジュール設定 | ✅ | ✅ | |
| 反響（リード）管理 | ✅ | ✅（担当物件のみ） | アサイン機能あり |
| 担当者追加・権限管理 | ✅ | ❌ | adminのみ |
| 課金確認 | ✅ | ❌ | adminのみ |

### PP.1.2 LP種別ごとの編集可能範囲

| LP種別 | 作成主体 | テナントの編集範囲 |
|-------|---------|----------------|
| **シンプルLP**（写真+テキスト型） | PropertyIntakeAgent（自動）| テキスト全文・写真・CTA・公開設定 |
| **3DLP Basic3D**（Splat型） | マスター制作・納品 | テキスト・CTAのみ（演出不可） |
| **3DLP Standard〜Luxury** | マスター制作・納品 | テキスト・CTAのみ（演出不可） |

---

## PP.2 物件登録〜コンテンツ生成フロー（全自動） {#pp2}

### PP.2.1 物件アップロードウィザード

```
Step 1: 物件基本情報入力
  - 物件種別選択（6種別: 新築戸建て・土地・中古戸建て・分譲地・モデルハウス・マンション）
  - 住所（郵便番号 → 自動補完）
  - 価格・面積・間取り
  - 物件名（任意）

Step 2: 素材アップロード
  ┌─────────────────────────────────────────────┐
  │  📁 ドラッグ&ドロップ または クリックして選択 │
  │                                             │
  │  対応形式: JPEG/PNG/HEIC (写真)             │
  │           PDF/PNG (間取り図・販売図面)       │
  │           PDF (仕様書)                      │
  │           IFC (BIMデータ・任意)             │
  └─────────────────────────────────────────────┘
  ※ 写真は最低3枚以上推奨・外観写真は必須
  ※ 間取り図のアップロードで3DLP受発注が可能になります

Step 3: 確認 & 生成開始
  - アップロード素材一覧の確認
  - 「コンテンツを自動生成する」ボタン
  → PropertyIntakeAgent が起動
```

### PP.2.2 生成進捗表示

```typescript
// テナントダッシュボードのリアルタイム進捗表示
// Supabase Realtimeで生成ステータスをリアルタイム購読

interface GenerationProgress {
  propertyId: string
  steps: {
    photos:      'pending' | 'processing' | 'done' | 'error'
    thumbnails:  'pending' | 'processing' | 'done' | 'error'
    copy:        'pending' | 'processing' | 'done' | 'error'
    portal_csv:  'pending' | 'processing' | 'done' | 'error'
    lp:          'pending' | 'processing' | 'done' | 'error'
    pamphlet:    'pending' | 'processing' | 'done' | 'error'
    video:       'pending' | 'processing' | 'done' | 'error'
    sns:         'pending' | 'processing' | 'done' | 'error'
  }
  estimatedMinutes: number  // 残り時間（推定）
  startedAt: string
}

// UIでの表示:
// ✅ 写真補正・最適化 完了
// ✅ SNSサムネイル生成 完了
// ⏳ コピー生成中... (約30秒)
// ⏳ LP生成中...
// ⏳ パンフレット生成中...
// ○ 動画生成 (最大8分)
```

---

## PP.3 シンプルLP作成・編集フロー（テナント自操作） {#pp3}

### PP.3.1 シンプルLPとは

```
PropertyIntakeAgentが自動生成するLPには2種類ある:

  1. シンプルLP（テナントが自分で編集・公開できる）
     - レスポンシブHTML（写真ギャラリー + テキスト + CTA）
     - Three.js不使用（Gaussian Splatなし）
     - 全テナントが標準で生成できる
     - 自動生成後にテナントが微調整して公開

  2. 3DLP（SisliR社内で制作・納品するプレミアム品）
     - Gaussian Splat / ProceduralMesh による没入型3D体験
     - 受注制作（別途費用）
     - トラックBの成果物
```

### PP.3.2 シンプルLPエディタ（テナント向け簡易版）

Part MM（LP Editor v5.0）の**サブセット**として実装。
3Dビューポートとタイムラインはなくなるがそれ以外の右パネル機能は使用可能。

```
┌──────────────────────────────────────────────┐
│ シンプルLPエディタ                            │
├──────────────┬───────────────────────────────┤
│  LEFT PANEL  │  PREVIEW                      │
│              │  （レスポンシブHTMLプレビュー） │
│  📝 テキスト │                               │
│  🖼 写真管理 │  スマホ / PC 切替ボタン        │
│  🎯 CTA設定 │                               │
│  📊 スコア  │                               │
│              │                               │
├──────────────┴───────────────────────────────┤
│  [下書き保存]  [プレビュー確認]  [公開する]   │
│                                              │
│  🔒 3D体験に変更したい場合は                  │
│     「3DLP受発注」ボタンから申し込みできます  │
└──────────────────────────────────────────────┘
```

### PP.3.3 テキスト編集UI

```typescript
// apps/web/app/properties/[id]/lp/edit/page.tsx

// 編集可能なセクション（自動生成コンテンツの確認・修正）
interface SimpleLPEditableSections {
  // ヘッダー
  headline:    string   // キャッチコピー（最大35文字）
  subheadline: string   // サブキャッチ

  // 物件概要（宅建業法必須表示項目は変更不可 = グレーアウト）
  price:       number   // 価格（不変フィールド）
  address:     string   // 住所（不変フィールド）
  layout:      string   // 間取り（不変フィールド）
  area:        number   // 面積（不変フィールド）

  // 編集可能なテキスト
  description:     string  // 物件説明文（300〜500文字）
  features:        string[] // 特徴3点
  neighborhood:    string  // 周辺環境

  // CTA
  ctaPrimary:   { label: string; type: 'contact' | 'line' | 'tel' }
  ctaSecondary: { label: string; type: 'portal_link' | 'pamphlet' }

  // FAQ（AI生成・編集可能）
  faqItems: { question: string; answer: string }[]
}

// 不変フィールドはUIでグレーアウト + ロックアイコン表示
// 「この情報は宅建業法上変更できません」ツールチップ
```

### PP.3.4 写真管理UI

```
写真管理パネル:

  ヒーロー写真（メイン）
  ┌─────────────────┐
  │  [現在のヒーロー] │  [変更する] ボタン
  └─────────────────┘
  AI推奨: ◉ 外観 ○ リビング ○ キッチン
  ※ PropertyIntakeAgentがClaude Visionで最適選定済み

  ギャラリー写真（最大30枚）
  ┌──┐┌──┐┌──┐┌──┐
  │  ││  ││  ││  │  [並び替え可]
  └──┘└──┘└──┘└──┘
  [写真を追加] [写真を削除]

  写真ラベル（ALTテキスト）
  各写真に自動付与済み → 手動修正可
```

### PP.3.5 公開フロー

```typescript
// 公開前のチェック（フロントエンド）
const PRE_PUBLISH_CHECKS = [
  { key: 'headline',    label: 'キャッチコピー',     required: true },
  { key: 'price',       label: '価格',              required: true },
  { key: 'address',     label: '所在地',            required: true },
  { key: 'heroPhoto',   label: 'メイン写真',         required: true },
  { key: 'ctaPrimary',  label: 'CTAボタン設定',      required: true },
]

// 公開後の動作:
// 1. LP URLを発行（https://lp.sislir.com/{tenantSlug}/{propertyId}）
// 2. UTMパラメータ付きURLを各チャネル向けに生成
// 3. テナントダッシュボードの「公開中」ステータスに変更
// 4. SNS投稿スケジュールが有効な場合は自動投稿キューに登録
```

---

## PP.4 3DLP受発注フロー（マスターへの依頼） {#pp4}

### PP.4.1 受発注フォーム

```
アクセス起点:
  - 物件詳細ページの「3DLP制作を依頼する」ボタン
  - テナントダッシュボードのアップセルバナー

受発注フォーム（/dashboard/properties/{id}/order-3dlp）:

  STEP 1: グレード選択
  ┌─────────────────────────────────────────────────────┐
  │  ◯ Basic3D    ¥49,800  Gaussian Splat LP + USDZ     │
  │  ◯ Standard   ¥98,000  + シネマティック動画           │
  │  ◯ Premium   ¥198,000  + ホットスポット + ツアー      │
  │  ◯ Luxury    ¥398,000  + BIMデジタルツイン           │
  └─────────────────────────────────────────────────────┘

  STEP 2: 素材確認
  - 既にアップロード済みの素材が表示される
  - 追加素材のアップロード（間取り図・追加写真）
  ⚠ 間取り図のアップロードを推奨します（3D精度が向上します）

  STEP 3: 希望・要望入力
  - 納品希望日
  - 照明イメージ（昼/夕/夜）プルダウン
  - 特記事項（自由記入）

  STEP 4: 確認・送信
  - 受発注内容のサマリー確認
  - 「申し込む」クリック → Supabase DB に orders レコード作成
  - テナントへ「受付完了メール」自動送信
  - マスター管理画面の受注一覧にリアルタイム表示
```

### PP.4.2 受発注後のテナント側ステータス表示

```
物件詳細ページの「3DLP」セクション:

  ┌─────────────────────────────────────────────────────┐
  │ 3DLP制作ステータス                                    │
  │                                                     │
  │  [素材確認中] → [制作中] → [品質確認中] → [納品済み]  │
  │       ●──────────────────────────────○             │
  │                                                     │
  │  現在: 制作中（担当: SisliRスタッフ）                 │
  │  納品予定: 2026年6月20日                             │
  │                                                     │
  │  ✉ 完了時にメールでお知らせします                     │
  └─────────────────────────────────────────────────────┘

  ※ 納品後は「3DLPをプレビュー」ボタンが表示される
  ※ テキスト・CTA は納品後もテナントが編集可能
```

---

## PP.5 テナントダッシュボードのUI設計 {#pp5}

### PP.5.1 ダッシュボード構成

```
URL: https://dashboard.sislir.com/

タブ構成:
  [物件一覧]  [反響管理]  [分析]  [設定]
```

### PP.5.2 物件一覧ページ

```
表示モード: カード表示 / テーブル表示 切替可能

物件カード（カード表示時）:
  ┌────────────────────────────────┐
  │ [ヒーロー写真]                  │
  │                                │
  │ 神奈川県秦野市 新築戸建て         │
  │ 3,500万円 / 3LDK / 125.5㎡     │
  │                                │
  │ ● シンプルLP 公開中             │
  │ ◯ 3DLP 制作中                  │
  │                                │
  │ [編集]  [成果物]  [反響: 12件]  │
  └────────────────────────────────┘

成果物パネル（「成果物」クリックで展開）:
  ✅ LP公開中         [URLコピー] [QRコード]
  ✅ SNSサムネイル    [ダウンロード]
  ✅ ポータルCSV      [ダウンロード]
  ✅ パンフレットPDF   [ダウンロード]
  ⏳ 動画 生成中...
  🔒 3DLP 受注制作中  [状況確認]
```

### PP.5.3 フィルタ・検索

```typescript
interface PropertyListFilter {
  status:       'all' | 'draft' | 'published' | 'unpublished'
  lpType:       'all' | 'simple' | '3dlp'
  propertyType: PropertyType | 'all'
  hasLeads:     boolean
  dateRange:    { from: string; to: string } | null
}
```

---

## PP.6 物件詳細・LP管理画面 {#pp6}

### PP.6.1 物件詳細ページ構成

```
URL: /dashboard/properties/{id}

タブ:
  [概要]  [LP管理]  [成果物]  [反響]  [分析]

---
[LP管理] タブ:

  ■ シンプルLP
    ステータス: 公開中 [非公開にする]
    URL: https://lp.sislir.com/agency-xxx/prop-yyy  [コピー] [開く]
    最終編集: 2026-06-10 14:32

    [テキスト・写真を編集する] → シンプルLPエディタへ

  ■ 3DLP
    ステータス: 未依頼

    3DLPにすると訪問者の滞在時間が平均3倍になります
    [3DLP制作を依頼する（¥49,800〜）]

    ※ 3DLPの演出編集はSisliRスタッフが担当します。
      ご要望はお申し込みフォームの「特記事項」欄にご記入ください。
```

### PP.6.2 成果物ページ

```
[成果物] タブ:

  ┌─────────────────────────────────────────────────────┐
  │ 🖼 写真・画像                                         │
  │   補正済み写真 (23枚)    [一括ダウンロード]           │
  │   SNSサムネイル (12種)   [一括ダウンロード]           │
  │   OGP画像                [ダウンロード]              │
  ├─────────────────────────────────────────────────────┤
  │ 📄 テキスト・データ                                   │
  │   ポータル入稿CSV (SUUMO) [ダウンロード]              │
  │   ポータル入稿CSV (アットホーム) [ダウンロード]        │
  │   物件説明文              [コピー]                   │
  │   SEOメタタイトル/ディスクリプション [コピー]         │
  ├─────────────────────────────────────────────────────┤
  │ 🎬 動画                                              │
  │   スライドショー動画 (1:30)  [ダウンロード] [URL]     │
  │   シネマティック動画  [制作依頼済み / ¥98,000〜]      │
  ├─────────────────────────────────────────────────────┤
  │ 📋 パンフレット                                       │
  │   A4両面 PDF             [ダウンロード]              │
  └─────────────────────────────────────────────────────┘
```

---

## PP.7 反響管理画面とエージェント統合 {#pp7}

### PP.7.1 反響一覧

```
URL: /dashboard/leads

カラム:
  氏名 | 連絡先 | 問い合わせ物件 | チャネル | ステータス | 最終アクション日 | 担当者

ステータス:
  🆕 新着 → 🤝 連絡済み → 👀 内覧調整 → 💬 交渉中 → 📝 申込済み → ✅ 成約 | ❌ 失注
```

### PP.7.2 LeadFollowUpAgent（エージェント機能・追加設計）

反響受信時に自動で追客メール案を生成するエージェント。テナントが「送信」クリックで実際に送れる。

```typescript
// packages/shared/lib/LeadFollowUpAgent.ts

export class LeadFollowUpAgent {

  // トリガー: leads テーブルへの新規 INSERT
  async onNewLead(lead: Lead): Promise<FollowUpDraft> {
    const property = await this.getProperty(lead.propertyId)
    const channel  = lead.utmSource   // 'suumo' | 'athome' | 'direct' | etc.

    const prompt = `
あなたは不動産営業の専門家です。
以下の問い合わせ情報をもとに、最初のフォローアップメール案を作成してください。

【物件情報】
物件名: ${property.name}
種別: ${property.propertyType}
価格: ${property.price.toLocaleString()}万円
所在地: ${property.address}

【問い合わせ情報】
氏名: ${lead.name}
問い合わせ内容: ${lead.message}
チャネル: ${channel}
受信日時: ${lead.createdAt}

要件:
- 200〜300文字で簡潔に
- 物件の特徴を1点だけ触れる
- 内覧のご提案を含める
- 宅建業法の誇大広告規制に準拠
- 形式: {件名}\n\n{本文}
    `

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const [subjectLine, ...bodyLines] = text.split('\n\n')

    return {
      leadId:  lead.id,
      subject: subjectLine.replace(/^件名[:：]\s*/, ''),
      body:    bodyLines.join('\n\n'),
      status:  'draft',
    }
  }
}
```

### PP.7.3 反響詳細画面のエージェントUI

```
反響詳細ページ: /dashboard/leads/{id}

  ┌─────────────────────────────────────────────────────┐
  │ ✨ AIが追客メール案を作成しました                     │
  │                                                     │
  │ 件名: [田中様、○○新築戸建てのご見学のご案内]         │
  │                                                     │
  │ 本文:                                               │
  │ 田中様                                              │
  │ このたびは○○新築戸建てにご興味を...                  │
  │                                                     │
  │ [編集する] [このまま送信] [破棄]                     │
  └─────────────────────────────────────────────────────┘

  ※ 送信内容は担当者が必ずご確認ください
  ※ 送信履歴はリードの詳細に記録されます
```

---

## PP.8 権限別UI出し分けの実装 {#pp8}

### PP.8.1 「3DLP編集ロック」の実装

```typescript
// テナント側からはLP Editorの3Dビューポートに
// アクセスできないことをUIで明示する

// apps/web/app/properties/[id]/lp/3d/page.tsx

export default async function TenantThreeDLPPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="rounded-lg border border-border p-8 max-w-md text-center">
        <LockIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-medium mb-2">3DLP編集はSisliRスタッフが担当します</h2>
        <p className="text-sm text-muted-foreground mb-6">
          3D体験の演出・照明・カメラワークは専門的な調整が必要なため、
          SisliRの制作スタッフが高品質に仕上げてお届けします。
        </p>
        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href={`/dashboard/properties/${propertyId}/order-3dlp`}>
              3DLP制作を依頼する（¥49,800〜）
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            テキスト・CTA・公開設定は受け取り後もご自身で編集いただけます
          </p>
        </div>
      </div>
    </div>
  )
}
```

### PP.8.2 シンプルLPエディタの制限設定

```typescript
// テナント向けエディタ設定（Part MMのLP Editor v5.0のサブセット）

export const TENANT_EDITOR_CONFIG = {
  // 表示するタブ（3D関連を除外）
  rightPanelTabs: ['material_simple', 'ai', 'score', 'export'] as const,
  //                                   ^テキスト・写真のみ

  // 非表示にするUI
  hideViewport3D:     true,  // 3DビューポートなしでHTML prewviewのみ
  hideTimeline:       true,  // タイムライン非表示
  hidePropertyType3D: true,  // 3D種別設定非表示
  hideLightingPanel:  true,  // 照明設定非表示
  hidePostFXPanel:    true,  // PostFX設定非表示
  hidePLATEAUPanel:   true,  // PLATEAUパネル非表示

  // 不変フィールドのロック
  immutableFields: ['price', 'address', 'area', 'layout', 'propertyType'],

  // AI機能（テナントも利用可）
  enableAiCopyGeneration: true,
  enableAiFaqGeneration:  true,
  enableAiSeoOptimization: true,
}
```

---

## PP.9 テナント向けヘルプ・ガイダンス設計 {#pp9}

### PP.9.1 オンボーディングフロー

```
初回ログイン後のチュートリアル（4ステップ）:

  Step 1: 物件を1件アップロードしてみよう
    → アップロードウィザードへ誘導
    → PropertyIntakeAgentの自動生成を体験

  Step 2: 生成されたLPを確認・微調整
    → テキスト編集UIの説明
    → 「公開する」ボタンの場所を案内

  Step 3: 反響が来たら対応する
    → 反響管理画面の説明
    → LeadFollowUpAgentのメール案機能を紹介

  Step 4: より高品質な3DLPを依頼する
    → トラックBの受発注フォームへ誘導
    → 費用対効果の事例を表示
```

### PP.9.2 「なぜ3DLPは自分で編集できないのか」FAQ

```
Q: 3DLPの演出を自分で変えたいのですが、できますか？

A: 3DLP（Gaussian Splat + 没入型体験）の演出は、
   物件の魅力を最大化するために照明・カメラワーク・
   PostFX効果を専門的に調整する必要があります。

   SisliRのスタッフが高品質に仕上げてお届けするため、
   演出編集はスタッフが担当しています。

   テキスト内容・CTA設定・公開のタイミングは
   受け取り後もご自身で自由に変更いただけます。

   演出の変更ご希望がある場合は、
   お申し込みフォームの「特記事項」にご記入いただくか、
   担当スタッフまでご連絡ください。
```

---

## PP.10 ADRログ {#pp10}

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-152 | テナントユーザーは3DLP Editorにアクセス不可とする | 3DLPの品質担保と受注制作（トラックB）の価値保護。演出の素人操作で品質が下がるリスクを排除 | テナントも3DLP編集可能にする（品質ばらつきが発生） |
| ADR-153 | シンプルLPエディタはLP Editor v5.0のサブセットとして実装 | 共通コンポーネント基盤を流用することで開発コストを削減。テナントに必要な機能に絞ったUIを提供 | 別エディタを新規開発 |
| ADR-154 | 3DLP受発注フォームはテナントadminのみ送信可能 | 受注には費用が発生するため、権限のある管理者のみが確定できる | 全メンバーが送信可能 |
| ADR-155 | LeadFollowUpAgentはメール案を生成するのみ（自動送信はしない） | 不動産業では顧客とのコミュニケーションに担当者の判断が必要。誤送信リスクを避けるため、必ず人間が確認してから送信 | 自動送信 |
| ADR-156 | 不変フィールド（価格・住所・面積・間取り）はテナントUI上でグレーアウト表示 | 宅建業法の重要事項説明との整合性を保つ。基本情報の誤変更を防止 | フィールドを非表示にする（修正不要の理由がわからなくなる） |
| ADR-157 | テナント向けダッシュボードのURLは dashboard.sislir.com に固定 | マスター管理画面（master.sislir.com）と明確に分離し、誤アクセスを防止 | 同一ドメインで /master パスを使用 |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|----------|------|--------|
| v1.0 | 2026-06-12 | 初版。テナントユーザーの操作権限の明文化、シンプルLP編集フロー、3DLP受発注フロー、LeadFollowUpAgent、不変フィールドのUI設計を定義 |
