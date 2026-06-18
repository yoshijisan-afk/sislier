# SisliR v10 × TikTok型不動産ポータル
# 完全SEO戦略書 v1.0

> **対象システム**: SisliR v10.1（自動動画生成 + LP自動生成 + AI推薦エンジン）
> **ターゲット**: 神奈川県版住宅TikTok → 全国展開
> **作成日**: 2026-06-16

---

## 目次

1. [戦略の全体像](#1-戦略の全体像)
2. [通常SEO（テクニカル + コンテンツ）](#2-通常seo)
3. [動画SEO](#3-動画seo)
4. [SNS SEO（TikTok / Instagram / YouTube Shorts）](#4-sns-seo)
5. [AI SEO（ChatGPT / Gemini / Perplexity 対策）](#5-ai-seo)
6. [SisliR自動生成システムへの実装仕様](#6-実装仕様)
7. [KPI・計測設計](#7-kpi計測設計)
8. [フェーズ別ロードマップ](#8-ロードマップ)

---

## 1. 戦略の全体像

### 1.1 「発見エンジン」はSEOと相性が最高

TikTok型ポータルは、SEOにとって極めて有利な構造を持ちます。

```
【なぜSisliRはSEOで勝てるか】

従来ポータル（SUUMO等）:
  物件ページ = 写真 + テキスト情報のみ
  → コンテンツの深さが浅い
  → ユーザーが短時間で離脱 → Googleが低評価

SisliR:
  物件ページ = 縦型動画 + LP + 3DLP + AI生成コピー + FAQ
  → 1物件あたりのコンテンツ深度が圧倒的に高い
  → 動画により滞在時間が長い → Googleが高評価
  → 動画がYouTube / TikTok / Reelsで拡散 → 外部リンク獲得
  → AIが好みを学習 → ユーザーが毎日戻る → リピート率向上
```

### 1.2 4つのSEO戦場

| 戦場 | 内容 | SisliRの武器 |
|------|------|-------------|
| 通常SEO | Google検索での上位表示 | 自動LP + 構造化データ + AI生成コンテンツ |
| 動画SEO | YouTube・TikTok内検索 | 自動生成縦型動画 + AIタイトル/説明文 |
| SNS SEO | Instagram/TikTok/Xでの発見 | Scene JSON → SNSサムネイル自動生成 |
| AI SEO | ChatGPT/Gemini/Perplexityでの言及 | E-E-A-T強化 + 構造化FAQ + ブランドメンション |

---

## 2. 通常SEO

### 2.1 テクニカルSEO（Next.js実装）

#### 2.1.1 メタデータ自動生成（Scene JSON → SEOタグ）

SisliRのPropertyIntakeAgentが生成するSEOタグ仕様：

```typescript
// apps/web/app/lp/[propertyId]/page.tsx

import { Metadata } from 'next'
import { getProperty } from '@/lib/db'

export async function generateMetadata(
  { params }: { params: { propertyId: string } }
): Promise<Metadata> {
  const property = await getProperty(params.propertyId)

  // AI生成タイトルパターン
  // 「{市区町村} {間取り} {物件種別} | {価格帯} | {ブランド名}」
  const title = `${property.city} ${property.layout}${getTypeLabel(property.propertyType)} | ${formatPrice(property.price)} | SisliR`

  // AI生成ディスクリプション（120〜160文字）
  const description = property.seoDescription
    // 例: 「横浜市港南区の新築4LDK。3,480万円。南向きLDK18帖・駐車2台・徒歩5分のバス停。
    //      白い外観と平坦地が特徴。AI動画で内覧体験→物件詳細はSisliRで。」

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://sislir.com/lp/${params.propertyId}`,
      images: [
        {
          url: property.thumbnailUrl,    // Cloudflare R2のOGP画像（1200×630）
          width: 1200,
          height: 630,
          alt: `${property.name} - ${property.city}の${getTypeLabel(property.propertyType)}`,
        },
        {
          url: property.verticalThumbnailUrl,  // 縦型サムネイル（9:16）
          width: 1080,
          height: 1920,
          alt: `${property.name}の動画サムネイル`,
        }
      ],
      locale: 'ja_JP',
      siteName: 'SisliR - 住宅発見エンジン',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [property.thumbnailUrl],
      creator: '@sislir_jp',
    },
    alternates: {
      canonical: `https://sislir.com/lp/${params.propertyId}`,
    },
    robots: {
      index: true,
      follow: true,
      'max-video-preview': -1,    // ← 動画プレビュー無制限（重要！）
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  }
}
```

#### 2.1.2 構造化データ（JSON-LD）

Google検索で物件情報をリッチリザルト表示するための構造化データ：

```typescript
// components/PropertyStructuredData.tsx

export function PropertyStructuredData({ property, videoUrl }: Props) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.name,
    description: property.description,
    url: `https://sislir.com/lp/${property.id}`,

    // 価格情報
    offers: {
      '@type': 'Offer',
      price: property.price,
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
    },

    // 住所
    address: {
      '@type': 'PostalAddress',
      streetAddress: property.address,
      addressLocality: property.city,
      addressRegion: property.pref,
      addressCountry: 'JP',
    },

    // 間取り・面積
    floorSize: {
      '@type': 'QuantitativeValue',
      value: property.buildingArea,
      unitCode: 'MTK',
    },

    // 動画（VideoObject）→ Google動画検索に表示される
    video: {
      '@type': 'VideoObject',
      name: `${property.name}の物件動画`,
      description: property.description,
      thumbnailUrl: property.thumbnailUrl,
      uploadDate: property.createdAt,
      duration: `PT${property.videoDurationSec}S`,
      contentUrl: videoUrl,
      embedUrl: `https://sislir.com/embed/${property.id}`,
      // Google動画検索に出るために重要
      publisher: {
        '@type': 'Organization',
        name: 'SisliR',
        logo: {
          '@type': 'ImageObject',
          url: 'https://sislir.com/logo.png',
        },
      },
    },

    // 不動産会社情報
    broker: {
      '@type': 'RealEstateAgent',
      name: property.agencyName,
      license: property.realtorLicense,
    },

    // FAQ（AIが生成したFAQをそのまま構造化データに）
    mainEntity: property.faqItems.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

#### 2.1.3 サイトマップ自動生成

```typescript
// app/sitemap.ts

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const properties = await getAllPublishedProperties()
  const areas = await getAreaPages()

  return [
    // トップページ
    {
      url: 'https://sislir.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },

    // エリアページ（SEOの核心）
    ...areas.map(area => ({
      url: `https://sislir.com/area/${area.slug}`,
      lastModified: area.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),

    // 物件LPページ（大量）
    ...properties.map(p => ({
      url: `https://sislir.com/lp/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      // 動画サイトマップ（Google動画検索用）
      // video: { ... }  ← 後述の動画サイトマップで管理
    })),
  ]
}
```

#### 2.1.4 動画サイトマップ（Video Sitemap）

Google動画検索に露出するための動画サイトマップ：

```xml
<!-- /public/video-sitemap.xml (毎日自動生成) -->

<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">

  <url>
    <loc>https://sislir.com/lp/{propertyId}</loc>
    <video:video>
      <video:thumbnail_loc>{thumbnailUrl}</video:thumbnail_loc>
      <video:title>{property.city} {property.layout}の{propertyType} | {formattedPrice}</video:title>
      <video:description>{property.description}</video:description>
      <video:content_loc>{videoUrl}</video:content_loc>
      <video:duration>{videoDurationSec}</video:duration>
      <video:publication_date>{createdAt}</video:publication_date>
      <video:tag>{property.layout}</video:tag>
      <video:tag>{property.city}</video:tag>
      <video:tag>{propertyType}</video:tag>
      <video:tag>新築</video:tag>
      <video:category>不動産</video:category>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>

</urlset>
```

### 2.2 コンテンツSEO

#### 2.2.1 エリアページ戦略（SEOの核心）

物件LPページだけでなく、エリアページが大量のロングテールキーワードを獲得します。

```
【エリアページのURL構造】

https://sislir.com/area/kanagawa/yokohama/港南区/新築戸建て/4LDK

カバーするキーワード例:
  横浜市港南区 新築戸建て 4LDK
  港南区 注文住宅 価格
  横浜 新築 駐車2台 4LDK 動画
  神奈川 平屋 2000万円台
  川崎市 土地 100坪
```

エリアページのAI自動生成コンテンツ：

```typescript
// lib/area-page-generator.ts

interface AreaPageContent {
  // H1: エリア×物件種別タイトル
  h1: string
  // 例: 「横浜市港南区の新築戸建て一覧 | 動画で発見」

  // エリア紹介（300文字以上のオリジナルコンテンツ）
  areaDescription: string
  // 例: 「港南区は横浜市南部に位置し、京急線・市営地下鉄が通る
  //      利便性の高いエリアです。区内には港南台バーズや野庭団地などの
  //      大型商業施設があり、子育て世帯に人気です...」

  // 価格帯データ（当月の実績から自動計算）
  priceStats: {
    min: number
    max: number
    median: number
    sampleCount: number
  }

  // FAQセクション（AIが地域特性から生成）
  faqs: { question: string; answer: string }[]
  // Q: 港南区の新築戸建ての相場は？
  // A: 2026年6月時点、SisliRに掲載中の港南区新築戸建ては...
  // Q: 港南区で駐車2台確保できる物件は？
  // A: ...

  // 近隣エリアリンク（内部リンク強化）
  nearbyAreas: { name: string; slug: string }[]
}
```

#### 2.2.2 キーワードマトリクス

```
【優先キーワード戦略】

Tier 1（競合激化・長期戦）:
  横浜 新築戸建て
  神奈川 注文住宅
  → 上位表示まで6〜12ヶ月

Tier 2（中競合・3〜6ヶ月）:
  横浜市港南区 新築戸建て 4LDK
  川崎市宮前区 土地 100坪以上
  藤沢市 平屋 2000万円台
  → エリアページで狙う

Tier 3（ロングテール・即効性あり）:
  横浜 新築戸建て 動画 内覧
  神奈川 平屋 駐車3台 南向き
  横浜市 新築 犬OK 庭あり 4LDK
  → 物件LPの自動タグで対応

Tier 4（AI SEO・2026年以降重要）:
  新築戸建てを動画で探せるサイト
  AIが好みを学習してくれる不動産サイト
  横浜で自分好みの家を見つけるには
  → コンテンツ・FAQ・ブランドで対応
```

#### 2.2.3 内部リンク設計

```
【内部リンクのハブ構造】

トップ
  ↓
エリアHUBページ（都道府県）
  ↓
エリアページ（市区町村 × 物件種別）
  ↓
物件LPページ
  ↓
関連物件（AIレコメンド）

加えて:
  物件LP → 「このエリアの他の物件」
  物件LP → 「似た条件の物件」（AIマッチ）
  物件LP → 「この工務店の他の物件」
```

---

## 3. 動画SEO

### 3.1 YouTube SEO

SisliRが自動生成した縦型動画をYouTubeにも投稿することで、動画SEOを獲得します。

#### 3.1.1 YouTube動画タイトル生成ルール

```typescript
// lib/youtube-title-generator.ts

// AI生成タイトルパターン（60文字以内）
const patterns = [
  // パターンA: エリア × 条件 × CTA
  `【${city}】${layout}新築 ${formatPrice(price)} | 動画で内覧 #SisliR`,
  // 例: 「【横浜市港南区】4LDK新築 3,480万円 | 動画で内覧 #SisliR」

  // パターンB: 特徴訴求
  `${catchCopy}｜${city}の新築${layout} ${formatPrice(price)}`,
  // 例: 「南向きLDK18帖・駐車2台｜横浜市の新築4LDK 3,480万円」

  // パターンC: ストーリー型（エンゲージメント重視）
  `「${city}で家を建てる」${layout} ${formatPrice(price)}の選択`,
]
```

#### 3.1.2 YouTube概要欄テンプレート（自動生成）

```
【物件情報】
📍 所在地: {address}
💰 価格: {formattedPrice}
🏠 間取り: {layout} / 建物面積: {buildingArea}㎡
🌱 土地面積: {landArea}㎡
🚃 アクセス: {access}

【この物件の特徴】
{features[0]}
{features[1]}
{features[2]}

【AIマッチ率について】
SisliRでは、あなたが動画を見た行動から好みを自動学習。
次に「あなたが好きそうな物件」を自動でお届けします。

━━━━━━━━━━━━━━━━━━━━━━
🔗 物件詳細・お問い合わせ
https://sislir.com/lp/{propertyId}

📱 SisliRアプリ（iOS / Android）
https://sislir.com/app

📌 他の{city}の物件動画
https://sislir.com/area/{areaSlug}
━━━━━━━━━━━━━━━━━━━━━━

#新築戸建て #{city} #{layout} #不動産 #マイホーム
#新築 #住宅 #TikTok不動産 #{pref}
```

#### 3.1.3 YouTubeタグ自動生成

```typescript
// lib/youtube-tags.ts

function generateYoutubeTags(property: PropertyInfo): string[] {
  return [
    // 必須タグ（全物件共通）
    '新築戸建て', '不動産', 'マイホーム', '住宅購入', 'SisliR',

    // エリアタグ
    property.pref,                          // 神奈川県
    property.city,                          // 横浜市港南区
    `${property.city}不動産`,               // 横浜市港南区不動産
    `${property.city}新築`,                 // 横浜市港南区新築

    // 物件種別タグ
    getTypeLabel(property.propertyType),    // 新築戸建て
    property.layout,                        // 4LDK

    // 特徴タグ（AI抽出）
    ...property.features.map(f => f.replace(/[・。]/g, '')),

    // 価格帯タグ
    getPriceRangeTag(property.price),       // 3000万円台

    // トレンドタグ
    'AI不動産', '動画内覧', 'TikTok不動産',
  ]
}
```

### 3.2 TikTok動画SEO

#### 3.2.1 TikTokキャプション生成（AI自動）

```typescript
// TikTokはキャプション150文字以内が理想
// ハッシュタグは最後にまとめる

function generateTikTokCaption(property: PropertyInfo): string {
  const features = property.features.slice(0, 2).join('・')

  return `
${property.catchCopy}

📍 ${property.city}
💰 ${formatPrice(property.price)}
🏠 ${property.layout} / ${property.buildingArea}㎡
✨ ${features}

詳細はプロフのリンクから🔗

#新築戸建て #${property.city.replace('市', '').replace('区', '')} #マイホーム #不動産 #${property.layout} #住宅購入 #SisliR #TikTok不動産 #神奈川
`.trim()
}
```

#### 3.2.2 TikTok SEOの鉄則

```
【TikTok検索アルゴリズム対策】

1. 最初の3秒でキーワードを発話
   → 動画の冒頭ナレーション: 「横浜市港南区、4LDKの新築戸建てをご紹介します」

2. テキストオーバーレイにキーワード含める
   → 字幕: 「横浜市港南区 / 4LDK / 3,480万円」

3. ハッシュタグは5〜10個（多すぎない）
   → #新築戸建て #横浜 #4LDK #マイホーム #不動産

4. 動画説明文にキーワード含める
   → SisliR自動生成キャプションで対応

5. TikTok検索で上位に出るには「完視聴率」が最重要
   → 30〜60秒の動画フォーマットで設計
   → 最後に「気になる方はプロフのリンクへ」でCTA
```

### 3.3 Instagram Reels SEO

#### 3.3.1 Reels最適化

```typescript
// Instagram Reelsの最適化パラメータ

const reelsStrategy = {
  // 動画フォーマット
  aspectRatio: '9:16',      // 縦型必須
  duration: '30-60秒',      // エンゲージメント最適
  resolution: '1080x1920',  // 最低解像度

  // キャプション戦略（Instagram検索はキャプション重視）
  captionStructure: `
    【1行目: フック（最重要）】
    「${price}万円台で${city}に${layout}...これが理想の家でした」

    【2〜4行目: 物件情報】
    📍 ${city}
    💰 ${formattedPrice}
    🏠 ${layout} ${buildingArea}㎡

    【5行目以降: 特徴・ストーリー】
    ${description}

    【ハッシュタグ: 20〜30個】
    #新築戸建て #マイホーム計画 #注文住宅 #住宅購入
    #${pref} #${city} #${layout}
    #マイホーム記録 #家づくり #不動産 #戸建て
    #SisliR #動画内覧 #AI不動産
    （エリア特化タグを追加）
  `,

  // ALTテキスト（アクセシビリティ + SEO）
  altText: `${city}の${getTypeLabel(propertyType)} ${layout} ${formattedPrice}の物件動画`,
}
```

### 3.4 YouTube Shorts SEO

```typescript
// YouTube Shortsは通常動画と違うアルゴリズム

const shortsOptimization = {
  // タイトルに #Shorts を入れない（自動判定させる）
  // 60秒以内を厳守
  // 縦型（9:16）必須

  // チャプター機能（Shortsでは使えないが、関連動画への導線として）
  // 通常動画版（横型・5分程度）を作り、Shortsと相互リンク

  // エンドスクリーン代替
  // 最後の5秒にURL表示: 「sislir.com で詳細を見る」

  // ハッシュタグ（タイトルに3つ）
  titleTags: ['#新築戸建て', `#${city}`, '#マイホーム'],
}
```

---

## 4. SNS SEO

### 4.1 SNS戦略の全体設計

```
【投稿サイクル（SisliR自動スケジューラー）】

新物件登録
  ↓
PropertyIntakeAgent（自動生成）
  ↓
┌─────────────────────────────────────────────┐
│  各プラットフォームへの最適化版を自動生成      │
│                                             │
│  TikTok動画     → TikTok自動投稿             │
│  Reels動画      → Instagram自動投稿          │
│  Shorts動画     → YouTube自動投稿            │
│  OGP画像        → X（Twitter）投稿           │
│  縦型サムネイル → LINE公式アカウント          │
└─────────────────────────────────────────────┘
  ↓
各プラットフォームのアルゴリズムで拡散
  ↓
プロフィールのリンク → SisliR物件LP
  ↓
AIマッチ学習 → リピーター獲得
```

### 4.2 プラットフォーム別投稿戦略

#### TikTok

```
アカウント設計:
  @sislir_kanagawa（神奈川版）
  @sislir_yokohama（横浜特化）
  ※ エリアごとにアカウントを分ける戦略が有効

投稿頻度: 毎日1〜3本（新物件）
最適投稿時間:
  平日: 12:00〜13:00、20:00〜22:00
  週末: 10:00〜12:00、19:00〜21:00

コンテンツMIX:
  60%: 物件紹介動画（自動生成）
  20%: エリア紹介動画（「港南区の住みやすさ」等）
  20%: お役立ち動画（「頭金なしで家を買う方法」等）
```

#### Instagram

```
フィード: 物件の最高の1枚（横型）→ 「詳細はReelsへ」
Reels: 物件縦型動画（自動生成）
ストーリーズ: 新着物件のお知らせ → リンクステッカー
ハイライト: エリア別に整理

重要: Instagramのリール「プロフィールリンク」は
      必ずlinktree等を使い、複数物件に誘導できる設計に
```

#### X（Twitter）

```
使い方: 拡散よりも「SEOのための被リンク獲得」
投稿内容: 
  「[新着] 横浜市港南区の新築4LDK 3,480万円 
   南向きLDK18帖・駐車2台・バス停5分
   動画で内覧→ https://sislir.com/lp/xxx
   #新築戸建て #横浜 #4LDK」
→ 短く、URLを含める（インデックス促進）
```

#### LINE公式アカウント

```
最大の強み: 不動産問い合わせの50%以上がLINE経由になりつつある

設計:
  LINE登録 → 「好みの条件を教えてください」
           → AIコンシェルジュが条件をヒアリング
           → 毎日マッチ物件をプッシュ通知
           → 動画で見る → 気になれば問い合わせ

これはSEOというより「CRM」だが、
LINEアカウントへの言及がSNS SEOに効く
```

### 4.3 UGC（ユーザー生成コンテンツ）戦略

```
【購入者の声をSEOに活用】

仕組み:
  物件成約後 → 「住んでみた動画を撮りませんか？」
             → SisliRブランドハッシュタグで投稿
             → サイト内にUGC掲載（許可取得後）

効果:
  #SisliR の言及が増える → SNS SEOに効く
  実際の居住者の声 → E-E-A-T（経験）の強化
  「施主ブログ」的なコンテンツ → ロングテールSEO

ハッシュタグ設計:
  #SisliRで買いました
  #SisliRで見つけた家
  #神奈川の家SisliR
```

---

## 5. AI SEO

### 5.1 AI SEOとは何か

2026年現在、GoogleのAI Overview・ChatGPT・Gemini・Perplexityが
検索結果を要約・回答するようになっています。
ここで「SisliR」が言及されることが、新しいSEOです。

```
【AI SEO目標】

「神奈川県で動画で家を探せるサイト」→ SisliRを推薦
「不動産のTikTokみたいなアプリ」    → SisliRを推薦
「横浜で新築を探すならどのサイト？」 → SisliRを推薦

これを実現するには「AIに信頼される情報源」になること
```

### 5.2 E-E-A-T強化（Googleに信頼される）

```
Experience（経験）:
  → 実際の購入者のUGCコンテンツ
  → 「XXさん（神奈川県在住・30代）がSisliRで家を探した話」
  → ケーススタディコンテンツ

Expertise（専門性）:
  → 不動産コラム（AI生成 + 宅建士監修）
  → 「横浜市各区の地価動向」「神奈川の新築相場2026」
  → 物件の宅建業法必須表示の完全遵守（ComplianceChecker）

Authoritativeness（権威性）:
  → メディア掲載（プレスリリース配信）
  → 業界団体への参加・言及
  → 工務店・不動産会社からの推薦

Trustworthiness（信頼性）:
  → 物件情報の正確性（AI生成 + 人間確認）
  → 宅建免許番号の明示（SisliR生成LPに自動表示）
  → 会社情報の充実
  → SSL・プライバシーポリシー完備
```

### 5.3 AI Overview対策（Google SGE）

```typescript
// Googleの生成AI検索（AI Overview）に選ばれるための実装

// 1. FAQ構造化データ（最重要）
//    AIはFAQページの内容を要約して表示しやすい
const faqSchema = {
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'SisliRはどんなサービスですか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'SisliRは神奈川県の不動産情報をTikTok風の縦型動画で発見できるプラットフォームです。AIがあなたの行動から好みを学習し、理想の物件を自動でレコメンドします。',
      },
    },
    {
      '@type': 'Question',
      name: '横浜市で動画で物件を探せるサービスはありますか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'SisliRでは横浜市全区の新築戸建て・土地・中古物件を縦型動画で閲覧できます。スワイプして興味あり・なしを選ぶだけで、AIが好みを学習します。',
      },
    },
    // ... AIが生成する大量のFAQ
  ],
}

// 2. 明確な「About」ページ
//    ChatGPT・Geminiはaboutページを重視する
//    /about に会社情報・サービス説明を充実させる

// 3. 構造化されたナレッジベース
//    /guide/ 以下に不動産購入ガイドを作成
//    → AIが参照しやすい情報源になる
```

### 5.4 ChatGPT / Perplexity対策

```
【AIチャットボットに推薦される戦略】

1. Wikipedia的な「信頼できる情報源」になる
   → 「横浜市の新築戸建て相場」などの信頼できるデータページ
   → 毎月更新（鮮度が重要）

2. 「引用されやすいコンテンツ」を作る
   → 「神奈川県の新築住宅価格推移データ 2026」
   → 「横浜市各区の住みやすさランキング（SisliR調べ）」
   → ユニークなデータ = 引用されやすい

3. プレスリリース配信
   → 「SisliR、神奈川県の新築戸建て価格が前年比○%上昇と発表」
   → PR TIMESやValuePressに配信
   → ニュース記事として引用される

4. ブランド名の刷り込み
   → SNS・PR・インフルエンサーで「SisliR」という名前を増やす
   → AIは言及回数の多いブランドを信頼する
```

### 5.5 Perplexity Deep Research対策

```
Perplexityは「信頼できるソースを横断してまとめる」AIです。

対策:
  ① 公式サイトに「引用しやすい」データページを作る
     → https://sislir.com/data/kanagawa-price-2026
     → 「2026年6月、神奈川県の新築戸建て中央値は○○万円（SisliR調べ、サンプル数:○件）」

  ② 不動産ニュースサイトへの掲載
     → 住宅新報・不動産経済研究所へのプレスリリース

  ③ 宅建士・FPなど専門家のコメントを掲載
     → AIが「専門家が言っている」と判断する

  ④ 発信頻度を上げる（週1回以上のブログ・コラム）
     → Perplexityは「最近更新されているサイト」を好む
```

---

## 6. 実装仕様

### 6.1 Scene JSON → SEO自動生成パイプライン

SisliRのPropertyIntakeAgentが生成するSEO関連データの仕様：

```typescript
// packages/shared/schemas/scene.ts に追加するSEOスキーマ

export const SeoMetaSchema = z.object({
  // 基本メタ
  title:       z.string().min(30).max(60),
  description: z.string().min(120).max(160),
  canonical:   z.string().url(),

  // OGP
  ogTitle:       z.string().max(60),
  ogDescription: z.string().max(200),
  ogImage:       z.string().url(),  // 1200×630
  ogImageVertical: z.string().url().optional(), // 1080×1920

  // 動画SEO
  videoTitle:       z.string().max(100),
  videoDescription: z.string().max(5000),
  videoDuration:    z.number(),
  videoTags:        z.array(z.string()).max(30),

  // SNS投稿文（各プラットフォーム別）
  tiktokCaption:    z.string().max(150),
  instagramCaption: z.string().max(2200),
  twitterText:      z.string().max(140),
  youtubeTitle:     z.string().max(100),
  youtubeDescription: z.string().max(5000),
  youtubeTags:      z.array(z.string()).max(30),

  // AI SEO
  faqItems:    z.array(z.object({
    question: z.string(),
    answer:   z.string().min(50),
  })).min(3).max(10),

  // キーワード
  primaryKeyword:   z.string(),
  secondaryKeywords: z.array(z.string()).max(10),

  // 生成メタデータ
  generatedAt: z.string().datetime(),
  model:       z.string(),  // 使用したAIモデル
})

// SceneSchema v10.1に追加
export const SceneSchema = z.object({
  // ... 既存フィールド ...
  seo: SeoMetaSchema.optional(),
})
```

### 6.2 SEO生成プロンプト（AI設計）

```typescript
// lib/agent/SeoGeneratorAgent.ts

const SEO_GENERATION_PROMPT = `
あなたは不動産SEOの専門家です。
以下の物件情報から、SEOに最適化されたメタデータを生成してください。

## 物件情報
{{propertyJson}}

## 生成ルール

### titleタグ（30〜60文字）
- パターン: 「{市区町村} {間取り}{物件種別} | {価格帯} | SisliR」
- 例: 「横浜市港南区 4LDK新築戸建て | 3,480万円 | SisliR」
- 必ず市区町村・間取り・価格を含める

### descriptionメタ（120〜160文字）
- 冒頭に地名・間取り・価格を含める
- 特徴を2〜3個含める
- 末尾に「動画で内覧→SisliRで確認」的なCTAを入れる

### YouTube動画タイトル（〜100文字）
- 検索されそうなキーワードを自然に含める
- 【地名】を冒頭に入れる
- 価格・間取りを含める

### TikTokキャプション（〜150文字）
- 感情的なフックで始める
- 絵文字を活用する
- ハッシュタグは末尾に5〜10個

### FAQ（5問以上）
- 「{地域}の{物件種別}の相場は？」
- 「{この物件の特徴}について詳しく教えて」
- 「{駅名}エリアの住みやすさは？」
- ユーザーが実際に検索しそうな質問を生成

## 出力形式
JSON形式で出力してください。
`
```

### 6.3 自動投稿スケジューラー

```typescript
// lib/sns-scheduler.ts

interface SnsScheduleConfig {
  propertyId: string
  publishAt:  Date

  platforms: {
    tiktok: {
      enabled: boolean
      accountId: string
      caption: string
      videoPath: string
    }
    instagram: {
      enabled: boolean
      accountId: string
      caption: string
      videoPath: string
    }
    youtube: {
      enabled: boolean
      channelId: string
      title: string
      description: string
      tags: string[]
      videoPath: string
      visibility: 'public' | 'unlisted' | 'private'
    }
    twitter: {
      enabled: boolean
      text: string
      imageUrl: string
    }
  }
}

// Supabaseのpg_cronで毎時実行
// scheduled_sns_posts テーブルから投稿予定を取得してAPI投稿
```

### 6.4 Core Web Vitals最適化

```typescript
// SisliRの動画フィードはLCP・FIDが課題になりやすい

// 1. 動画の遅延読み込み
// → フィード内の次の動画はpreload="none"
// → スワイプ時にpreload="auto"に切り替え

// 2. 動画サムネイルの最適化
// → LCP要素（最初に表示される画像）はCloudflare画像変換で最適化
// → sizes属性で適切なサイズを指定

// 3. 動画ファイルサイズ最適化
// → Cloudflare Stream: HLS形式で配信（帯域適応）
// → サムネイルはWebP + AVIF

// next.config.jsの設定例
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    domains: ['r2.sislir.com', 'stream.cloudflare.com'],
    deviceSizes: [390, 768, 1200],
  },
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
}
```

---

## 7. KPI・計測設計

### 7.1 SEO KPI

| 指標 | 目標（6ヶ月後） | 計測ツール |
|------|---------------|----------|
| Google検索順位（Tier2キーワード） | Top10 | Search Console |
| オーガニック流入 | 月10,000セッション | GA4 |
| 物件LPのクリック率 | 5%以上 | Search Console |
| Core Web Vitals | LCP<2.5s, FID<100ms | PageSpeed Insights |
| 動画サイトマップ登録数 | 全物件100% | Search Console |
| リッチリザルト表示数 | 全物件の50%以上 | Search Console |

### 7.2 動画SEO KPI

| 指標 | 目標（6ヶ月後） | 計測ツール |
|------|---------------|----------|
| YouTube総再生回数 | 月100,000回 | YouTube Studio |
| TikTok総再生回数 | 月500,000回 | TikTok Analytics |
| YouTube → SisliR誘導数 | 月1,000クリック | GA4 |
| TikTok → SisliR誘導数 | 月3,000クリック | GA4 |

### 7.3 SNS SEO KPI

| 指標 | 目標（6ヶ月後） | 計測ツール |
|------|---------------|----------|
| TikTokフォロワー数 | 10,000人 | TikTok Analytics |
| Instagram フォロワー数 | 5,000人 | Meta Insights |
| #SisliR UGC投稿数 | 月100投稿 | 手動計測 |
| SNS経由の問い合わせ数 | 月50件 | CRM |

### 7.4 AI SEO KPI（2026年新指標）

| 指標 | 目標 | 計測方法 |
|------|------|---------|
| ChatGPTでの言及回数 | 月10回以上 | 手動確認 |
| Perplexityでの引用 | 月5回以上 | 手動確認 |
| Google AI Overviewへの表示 | 主要クエリの30% | 手動確認 |
| ブランド検索数（Google） | 月1,000回 | Search Console |

---

## 8. ロードマップ

### Phase 1（1〜3ヶ月）: 基盤整備

```
✅ テクニカルSEO実装
   - メタデータ自動生成（Scene JSON → SEOタグ）
   - 構造化データ（JSON-LD: VideoObject + FAQPage + RealEstateListing）
   - サイトマップ + 動画サイトマップ自動生成
   - robots.txt設定

✅ 動画SEOの初期設定
   - YouTube公式チャネル開設
   - TikTok / Instagram公式アカウント開設
   - 自動投稿スケジューラー実装（PropertyIntakeAgent拡張）

✅ コンテンツSEO基盤
   - エリアページ（神奈川県内主要エリア20箇所）
   - 不動産購入ガイド（AI生成 + 専門家監修）
   - FAQページ
```

### Phase 2（4〜6ヶ月）: 拡大

```
📈 コンテンツ拡充
   - エリアページを神奈川全市区町村に展開
   - 毎月の相場レポート配信（AI自動生成）
   - UGCキャンペーン開始

📈 動画SEO拡大
   - YouTube: 登録者1,000人突破
   - TikTok: フォロワー5,000人突破
   - Shorts → 通常動画へのクロスプロモーション

📈 AI SEO強化
   - プレスリリース月1回配信
   - 宅建士監修コンテンツの充実
   - Perplexity引用を狙ったデータレポート
```

### Phase 3（7〜12ヶ月）: スケール

```
🚀 全国展開準備
   - 都道府県別サブドメインor ディレクトリ設計
   - 全国版エリアページ展開

🚀 AI SEO確立
   - SisliRが不動産AIの「権威ある情報源」に
   - Google AI Overview で定期的に言及される

🚀 プラットフォーム化
   - 工務店・不動産会社向け「動画広告プラットフォーム」
   - 広告主の動画がSEO・SNSで自然に拡散する仕組み
```

---

## 付録A: SEOチェックリスト（物件LP公開前）

```
□ titleタグ: 30〜60文字・地名+間取り+価格含む
□ descriptionメタ: 120〜160文字
□ OGP画像: 1200×630px（Cloudflare R2で自動生成）
□ 縦型OGP: 1080×1920px（Reels・Shorts用）
□ canonical URL: 正規URLが設定されている
□ 構造化データ: VideoObject + FAQPage + RealEstateListing
□ 動画サイトマップ: 登録済み
□ ALTテキスト: 全画像に設定済み
□ 宅建業法必須表示: ComplianceCheckerでPASS
□ ページ速度: LCP < 2.5秒
□ モバイル表示: 縦型フィードが正常に動作
□ SNS投稿文: 全プラットフォーム分生成済み
□ YouTube: タイトル・説明文・タグ設定済み
□ TikTokキャプション: 設定済み
□ FAQページ: 5問以上
```

## 付録B: NG例と正解例

```
【タイトルタグ】
NG: 「物件詳細 | SisliR」
NG: 「横浜市港南区の物件 | SisliR」
OK: 「横浜市港南区 4LDK新築戸建て | 3,480万円 | SisliR」

【ディスクリプション】
NG: 「SisliRの物件詳細ページです」
NG: 「横浜市港南区の物件情報をご覧いただけます」
OK: 「横浜市港南区の新築4LDK、3,480万円。南向きLDK18帖・駐車2台・バス停5分。
     白い外観と平坦地が特徴。動画で内覧体験ができます。詳細はSisliRで。」

【TikTokキャプション】
NG: 「横浜市港南区の物件です。お問い合わせください」
OK: 「この価格でこんな家が建てられるの！？😮
     📍 横浜市港南区
     💰 3,480万円
     🏠 4LDK・南向きLDK18帖
     ✨ 駐車2台・平坦地
     詳細はプロフのリンクから🔗
     #新築戸建て #横浜 #マイホーム #4LDK #SisliR」
```
