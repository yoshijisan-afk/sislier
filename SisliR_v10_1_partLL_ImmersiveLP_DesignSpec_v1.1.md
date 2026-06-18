# Part LL — 没入型LPページ 完全設計書
## 物件種別対応・感動→反響直結型 世界トップレベル実装仕様

> **バージョン**: v1.1 (2026-06-13)
> **適用設計書**: SisliR v10.1 完全設計書（Part A〜GG）+ Part KK
> **策定方針**: Part KKの体験設計を受け継ぎ、実装レベルまで落とし込んだ統合LP設計書
> **対象トラック**: トラックA（SaaS）・トラックB（受注制作）両対応
> **整合バージョン**: Scene JSON v10.0 / Three.js r184（WebGPURenderer標準・WebGL2自動フォールバック、ADR-162.1） / GSAP 4 / Zod v4
>
> ✅ **v10.1.1 修正済み** — ADR-144対応（FloorplanVLM廃止・Claude Vision移行）をこのファイル本文に反映しました。
> - `hasFloorplan` フィールド: 「Claude Vision解析済み」の意味に更新
> - 間取り解析の精度値: FloorplanVLM（92.52%）→ Claude Vision FloorplanAnalyzer（75〜85% IoU・Part OO.6）に更新
>
> - L73 `gradeLevel: z.enum(['basic','standard','premium','luxury'])`:
>   → `'basic'`は`'basic3d'`に修正されました（Part MM v5.1 ADR-161、Part OOのOrder.gradeと統一）。
>
> ✅ **v1.1 修正済み（2026-06-13）** — Part MM v5.2のADR-162.1（WebGPURenderer標準・
> WebGL2自動フォールバック、フェーズ0から両対応）に合わせ、本書の「Three.js r184
> （WebGL2、フェーズ3でWebGPU移行）」という整合バージョン表記、およびLL.0.1の
> 「ブラウザで体験できる最高品質の3D（Gaussian Splat + WebGPU）」の前提を、
> フェーズ0からWebGPU標準という前提に統一しました。BeforeAfterSliderの
> `WebGLScissorTest`という記述は、WebGPURendererにも`setScissorTest`相当のAPIが
> あるため、レンダラー抽象を通じて両対応する旨を明記しました。
>   このSceneSchema定義をZodファイルとして実装する際は`'basic3d'`を使用してください。
>
> なお、本ファイルのPostFXプリセット定義（10種、L66〜69）はPart NN v1.1・Part MM v5.1と
> 既に整合しており、修正不要です。上記以外の没入型LP設計（感情曲線テンプレート・カメラパス等）は引き続き有効です。

---

## ⚠️ 整合性修正（v10.1設計書との差分）

Part KKに含まれる以下の不整合を本書で**公式修正**する。

### 修正1: PropertyTypeSchema に `mansion` を追加

```typescript
// packages/shared/schemas/scene.ts — 修正版
export const PropertyTypeSchema = z.enum([
  'newBuild',     // 新築戸建て
  'land',         // 分譲地
  'preowned',     // 中古戸建て
  'landSingle',   // 土地（単独）
  'modelHouse',   // 注文住宅モデルハウス
  'mansion',      // ★ 新規追加: 新築マンション（Part KK対応）
])
```

**ADR-114**: `mansion` を PropertyTypeSchema に追加。マンションは戸建てと根本的に異なる購買動機（格式・眺望・資産価値）を持ち、専用テンプレートが必須なため。

### 修正2: PostFXConfigSchema のプリセット拡張

```typescript
// packages/shared/schemas/scene.ts — 修正版
export const PostFXConfigSchema = z.object({
  preset: z.enum([
    'none',
    'fresh',
    'cinematic',
    'vintage',
    'luxury',
    'warm_morning',   // ★ 新規追加: 新築戸建て用（KK.2.4）
    'land_bright',    // ★ 新規追加: 土地用（日当たり強調）
    'renovation',     // ★ 新規追加: 中古戸建てリノベ用
    'golden_hour',    // ★ 新規追加: モデルハウス用
    'urban_night',    // ★ 新規追加: マンション夜景用
  ]).default('none'),
  bloom:    z.number().min(0).max(1).default(0),
  vignette: z.number().min(0).max(1).default(0),
  grade:    z.enum(['neutral', 'warm', 'cool', 'gold']).default('neutral'),
  saturation: z.number().min(0.5).max(1.5).default(1.0), // ★ 新規追加
  temperature: z.number().min(-500).max(500).default(0),  // ★ 新規追加（Kelvin offset）
  contrast:    z.number().min(0.8).max(1.3).default(1.0), // ★ 新規追加
})
```

### 修正3: Scene JSON に lpTemplate フィールドを正式追加

```typescript
// packages/shared/schemas/scene.ts — SceneSchema への追加
export const LpTemplateConfigSchema = z.object({
  type:            PropertyTypeSchema,
  cameraPreset:    z.string(),
  startTimePreset: z.enum(['dawn','morning','noon','afternoon','sunset','golden','dusk','night']),
  postfxPreset:    z.enum([
    'none','fresh','cinematic','vintage','luxury',
    'warm_morning','land_bright','renovation','golden_hour','urban_night'
  ]),
  enablePlateau:   z.boolean().default(false),
  renovationStyle: z.enum(['nordic','natural','modern','japanese']).optional(),
  lifetimeScenes:  z.array(z.string()).optional(),
  gradeLevel:      z.enum(['basic','standard','premium','luxury']).default('standard'),
}).optional()

// SceneSchema に追加
export const SceneSchema = z.object({
  // ... 既存フィールド（v10.0完全設計書 Part E参照）...
  lpTemplate: LpTemplateConfigSchema,  // ★ 正式追加
})
```

---

## 目次

- [LL.0 設計方針・感動の構造](#ll0)
- [LL.1 物件種別マトリクス](#ll1)
- [LL.2 新築マンション LP](#ll2)
- [LL.3 新築戸建て LP](#ll3)
- [LL.4 土地・分譲地 LP](#ll4)
- [LL.5 中古戸建て LP](#ll5)
- [LL.6 注文住宅モデルハウス LP](#ll6)
- [LL.7 土地（単独）LP](#ll7)
- [LL.8 共通コンポーネント仕様](#ll8)
- [LL.9 素材分岐ロジック（全種別）](#ll9)
- [LL.10 グレード別機能マトリクス](#ll10)
- [LL.11 CTA設計（全種別共通）](#ll11)
- [LL.12 パフォーマンス・品質基準](#ll12)
- [LL.13 Scene JSON テンプレート集](#ll13)
- [LL.14 ADRログ](#ll14)

---

## LL.0 設計方針・感動の構造 {#ll0}

### LL.0.1 世界トップLPの定義

```
「世界トップ」とは以下の3軸を同時に満たすことを指す:

  軸1: 技術的没入感
    → ブラウザで体験できる最高品質の3D（Gaussian Splat + WebGPU）
    → 映画的カメラワーク（CatmullRomCurve3 + GSAP 4）
    → リアルタイム照明変化（RelightEngine）

  軸2: 感情的共鳴
    → 物件種別ごとに「その人が住む未来」を脳内で先取りさせる
    → 感情曲線設計（緊張→解放→憧憬→決断）
    → テキストは「詩」——仕様ではなく物語を語る

  軸3: 反響への直結
    → カメラが最も美しいフレームで止まる瞬間 = CTAタイミング
    → SectionBeacon による行動データ全収集
    → A/Bテスト・ダイナミックLP・utm整合の完全統合
```

### LL.0.2 感動の神経回路（物件種別別）

| 物件種別 | 感動の核 | 刺激する感情 | 設計の核心 |
|---------|--------|------------|-----------|
| 新築マンション | 都市の高みに立つ自分 | 格式・成功・眺望への憧憬 | 夜景+上昇体験 |
| 新築戸建て | 家族の未来の朝 | 生活の具体的想像・温もり | 朝光+一人称視点 |
| 土地・分譲地 | ここに家が建つ | 所有の想像力・可能性 | 建築立ち上がりアニメ |
| 中古戸建て | 自分色に染め替える | 改変の自由感・発見の喜び | Before/After体験 |
| モデルハウス | こんな家に住む自分 | 理想への同一化 | ライフタイムシーン |
| 土地（単独） | 白紙の自由 | 創造の想像力 | 日照シミュレーション |

### LL.0.3 感情曲線の普遍構造

```
全物件種別に共通する感情曲線テンプレート:

  [0%] イントロダクション（世界観の提示）
    → 「ここはどんな場所か」を1秒で伝える

  [15%] 緊張フェーズ（期待の高まり）
    → カメラが遠くから接近、または暗から明へ

  [35%] クライマックス（感動のピーク ★CTAポイント1）
    → 最も美しいフレームで0.8秒停止
    → RelightEngine.burst() または FOV演出

  [60%] 探索フェーズ（詳細の発見）
    → ホットスポット・仕様確認・空間体験

  [85%] 共感フェーズ（生活の想像 ★CTAポイント2）
    → 「ここで暮らす自分」を想起させるシーン

  [100%] 完結・行動（ツアー完走 ★CTAポイント3）
    → 「この物件にする」判断のサポート
    → フルCTA（3択）提示
```

---

## LL.1 物件種別マトリクス {#ll1}

### LL.1.1 6種別と対応テンプレート

| PropertyType | テンプレートID | 感動の核 | 開始時刻 | PostFXプリセット | グレード |
|-------------|--------------|--------|---------|---------------|---------|
| `mansion` | `template_mansion` | 都市の高みに立つ自分 | `night` | `urban_night` | Premium〜Luxury |
| `newBuild` | `template_house_new` | 家族の未来の朝 | `morning` | `warm_morning` | Standard〜Luxury |
| `land` | `template_land` | ここに家が建つ | `noon` | `land_bright` | Standard〜Premium |
| `preowned` | `template_house_preowned` | 自分色に染め替える | `afternoon` | `renovation` | Standard〜Luxury |
| `modelHouse` | `template_modelhouse` | こんな家に住む自分 | `golden` | `golden_hour` | Premium〜Luxury |
| `landSingle` | `template_land_single` | 白紙の自由 | `noon` | `land_bright` | Basic〜Standard |

### LL.1.2 素材有無による分岐

```typescript
// apps/runtime/lib/SceneFactory.ts（拡張版）

export type SceneMode = 'splat' | 'procedural' | 'hybrid'

export interface SceneAssetStatus {
  hasSplat:   boolean   // SPZ4ファイルがR2に存在
  hasGlb:     boolean   // GLBモデルが存在
  photoCount: number    // 写真枚数
  hasFloorplan: boolean // 間取り図（Claude Vision解析済み・ADR-144）
  hasDrone:   boolean   // ドローン空撮素材
}

export function detectSceneMode(assets: SceneAssetStatus): SceneMode {
  if (assets.hasSplat)  return 'splat'      // 最優先: 実写Gaussian Splat
  if (assets.hasGlb)    return 'hybrid'     // GLB + プロシージャル背景
  return 'procedural'                        // 完全プロシージャル生成
}

// 品質スコア計算（グレード自動判定に使用）
export function calcAssetScore(assets: SceneAssetStatus): number {
  let score = 0
  if (assets.hasSplat)    score += 50
  if (assets.hasGlb)      score += 20
  if (assets.photoCount >= 10) score += 15
  if (assets.hasFloorplan) score += 10
  if (assets.hasDrone)    score += 5
  return score  // 0-100
}
```

---

## LL.2 新築マンション LP {#ll2}
### `template_mansion` — 都市の高みに立つ自分

> **感動の核**: 格式・上昇・夜景  
> **PostFX**: `urban_night`  
> **開始時刻**: `night`  
> **参照実装**: grand_residence_v3.html（既存）からの正式昇格版

### LL.2.1 体験コンセプト

マンションLPの「感動」は、**物件への到達過程**で生まれる。  
エレベーターが上昇するにつれて都市が広がり、  
最上階で夜景を見た瞬間に「ここに住む自分」が確定する。

```
設計3原則:
  1. 都市の高さ感 — Y軸の移動を感情的な上昇と同期させる
  2. 夜景の質感 — 窓外の光の粒一つひとつがブランド価値を語る  
  3. 静寂の格式 — BGMなし、SE最小限、空間が語る
```

### LL.2.2 セクション構成（確定版）

```
Sec 0: 都市アプローチ
  カメラ: Y=200m（高空）→ 物件屋上へドローン降下（10秒）
  光: RelightEngine 'night'（都市の夜景）
  演出: 降下中に「都市名・最寄り駅・徒歩◯分」がフェードイン
  Splat: 外観夜景SPZ4 / Procedural: PLATEAU都市ビル群 + 物件外観
  テキスト: 「—— [物件名]。高さ、という名の選択。」

Sec 1: エントランスロビー
  カメラ: 外→内へ（自動ドア開放演出）、地上視点(H=1.7m)
  光: 暖色内照 (RelightEngine: indoor_lobby) + 大理石反射
  演出: 足元のマーブル床に自分の影が映る
  ホットスポット: 「コンシェルジュサービス」「24h有人管理」
  テキスト: 「静かに、けれど確かに、格が違う空間がある。」

Sec 2: エレベーターホール
  カメラ: 廊下端から扉へ前進（期待の高まり）
  演出: エレベーター扉が開く → 内部に乗り込む
  テキスト: 「F ↑ を押す。その1秒が、視界を変える。」

Sec 3: 上昇シーン（スキップ可）
  カメラ: シャフト内、Yが増加するにつれて窓外の夜景が広がる
  演出: 階数カウンターが飛ぶ、都市の灯りが遠くなっていく
  スキップ: 「最上階へ」ボタンで直接Sec4へ

Sec 4: プライベートホール（★感情ピーク予備）
  カメラ: エレベーター降車 → 廊下端まで前進
  光: 廊下は間接照明のみ（静寂・格式）
  テキスト: 「ここから先は、あなただけの世界。」

Sec 5: リビングダイニング（★★クライマックス ★CTAポイント1）
  カメラ:
    - 扉を開けると狭角（45°FOV）→ 広角（85°FOV）へ0.8秒
    - カメラがH=1.2m → H=1.7mへ上昇（視界が広がる演出）
    - 窓に向かって前進し、夜景がフレームいっぱいに広がる
  光: RelightEngine.setTime(22.0) → 窓外の夜景全開
  演出: 窓のガラスに映り込む自分の輪郭（シルエット生成）
  Splat: リビング全体SPZ4 / Procedural: LD空間 + 夜景窓
  PostFX: urban_night（vignette:0.45, bloom:0.18）
  CTA①: 「この夜景と共に暮らす。資料を請求する。」
  テキスト: 「—— 夜が、あなたの部屋になる。」

Sec 6: キッチン
  カメラ: アイランドキッチン周回（180°）
  ホットスポット: 設備仕様（食洗機・ビルトイン・カップボード）
  テキスト: 「料理が、もっと楽しくなる理由がある。」

Sec 7: プライマリスイート
  カメラ: ベッド視点から窓夜景へ
  演出: 日の出タイムラプス（22時→翌朝7時を5秒で）
  テキスト: 「朝が来るたびに、正しい選択だったと思う。」

Sec 8: バルコニー・眺望（★CTAポイント2）
  カメラ: 室内→バルコニーへ（引き戸演出）、270°パノラマ旋回
  光: RelightEngine 'golden'（夕景への切替）
  演出: 遠くに富士山シルエット（物件緯度に応じて動的配置）
  CTA②: 「実際にこの眺望を体感する。見学を予約する。」

Sec 9: 完結（ツアー完走）
  演出: 全セクションのハイライトを3秒で逆再生
  CTA③: フルCTA（3択: 資料請求・見学予約・AIチャット相談）
```

### LL.2.3 PostFX設定

```typescript
export const POSTFX_URBAN_NIGHT: PostFXConfig = {
  preset: 'urban_night',
  bloom:    0.18,   // 高級感のある控えめなブルーム
  vignette: 0.42,   // 映画的ビネット
  saturation: 1.08, // 素材の質感を際立たせる
  temperature: 0,   // 夜は中性〜やや寒色
  contrast: 1.12,
  grade: 'cool',
}
```

### LL.2.4 プロシージャルシーン仕様

```typescript
// apps/runtime/scenes/MansionScene.ts

export function buildMansionProcedural(
  scene: THREE.Scene,
  prop: PropertyConfig
): void {
  // 外観（タワーマンション）
  buildTowerBlock({
    floors:      prop.totalFloors ?? 25,
    floorHeight: 3.1,
    footprint:   { w: prop.buildingWidth ?? 40, d: prop.buildingDepth ?? 20 },
    unitFloor:   prop.floor ?? 18,
    facade:      prop.facadeMaterial ?? 'glass_dark',  // glass_dark / tile_white / concrete
  })

  // 都市環境（PLATEAUなしの場合はプロシージャルビル群）
  if (!prop.plateau?.tilesetUrl) {
    buildProceduralCityscape({
      radius: 800,
      density: 'urban_high',
      centerLat: prop.lat,
      centerLng: prop.lng,
    })
  }

  // 夜景: 窓発光テクスチャ
  applyNightGlowTexture(scene, {
    windowLitRatio: 0.7,   // 70%の窓が点灯
    glowColor: 0xfff8e7,
    glowIntensity: 0.4,
  })
}
```

---

## LL.3 新築戸建て LP {#ll3}
### `template_house_new` — 家族の未来の朝

> **感動の核**: 生活の具体的想像・一人称視点  
> **PostFX**: `warm_morning`  
> **開始時刻**: `morning`

### LL.3.1 体験コンセプト

マンションの「格式」とは真逆。  
カメラは常に**生活者の目線（H=1.65m）**で動く。大きすぎず、温かい。  
「ここで朝を迎える自分」を脳内再生させることが全ての設計原則。

```
感情曲線:
外観（期待）→ アプローチ（高まり）→ 玄関（ドキドキ）
→ LDK（解放・ため息 ★クライマックス）→ キッチン（生活想像）
→ 2F廊下（安心）→ 主寝室（就寝イメージ）
→ 子供部屋（家族の未来）→ テラス（帰結 ★締め）
```

### LL.3.2 セクション構成

```
Sec 0: 外観アプローチ（朝）
  カメラ: 道路から玄関へ歩行速度で前進（15秒）
  光: RelightEngine 'morning'（朝7時・ソフトサイドライト）
  演出: アプローチの植栽が風に揺れる（InstancedMesh + 頂点シェーダー）
  Splat: 外観朝景SPZ4 / Procedural: 外壁+庭木+アプローチ
  テキスト: 「—— ある朝のこと。あなたがここから出かける日を、想像してほしい。」

Sec 1: 玄関・シューズクローク
  カメラ: 外→内（扉をくぐる演出・Z+方向前進）
  演出: 扉が開くと屋内の暖色光が漏れ出す（コントラスト演出）
  ホットスポット: 「天井高◯cm」「床材: ◯」「シューズクローク◯帖」
  テキスト: 「ただいま、と言いたくなる場所。」

Sec 2: LDK（★★クライマックス ★CTAポイント1）
  カメラ:
    - 玄関→LDKへ「入った瞬間」
    - 狭角(60°FOV)→広角(90°FOV)へ0.8秒でFOV変化
    - H=1.2m → H=1.65mへ0.3m上昇（広がり演出）
  光: RelightEngine.burst() — 0.5秒だけ1.4倍明るく（感情のフラッシュ）
  Splat: リビングSPZ4 / Procedural: LD空間+窓+床材
  PostFX: warm_morning（bloom:0.3, vignette:0.25, saturation:1.1, temperature:+200）
  CTA①: 「この広さを、体感してください。資料を請求する。」
  テキスト: 「—— 思わず、深呼吸したくなる。」

Sec 3: キッチン
  カメラ: アイランドキッチン周回（Y軸中心に180°）
  ホットスポット: 食洗機・IH・カップボード・パントリー
  テキスト: 「料理が、会話になる。」

Sec 4: 2F廊下・階段
  カメラ: 1F→2F（階段を実際に昇る体験・Y+移動）
  演出: 昇るにつれて天窓から光が差し込む
  テキスト: 「この家には、上るたびに発見がある。」

Sec 5: 主寝室（朝光演出）
  カメラ: ベッド側から窓へゆっくりパン
  演出: RelightEngine sunrise — カーテン越しに朝光が差し込む（タイムラプス3秒）
  テキスト: 「6:30 am。カーテンを開けると、この景色。」

Sec 6: 子供部屋（★CTAポイント2）
  カメラ: 大人視点(H=1.65m)→ 子供視点(H=1.1m)へ降下
  演出: 視点が下がることで天井が高く見える心理効果を演出
  テキスト: 「子どもには、この天井の高さが宇宙に見える。」
  CTA②: 「家族で、現地を確かめてみませんか。見学を予約する。」

Sec 7: テラス・庭（完結）
  カメラ: 室内→テラスへ（引き戸演出）
  光: RelightEngine 'sunset' — 夕方16時の感情的な締め
  演出: 芝生の上に子供の影が走る（AnimatedSilhouette）
  CTA③: フルCTA（3択）
  テキスト: 「—— この家の続きは、あなたが書く。」
```

### LL.3.3 PostFX設定

```typescript
export const POSTFX_WARM_MORNING: PostFXConfig = {
  preset: 'warm_morning',
  bloom:      0.30,
  vignette:   0.25,
  saturation: 1.10,
  temperature: +200,  // ウォームトーン
  contrast:   1.05,
  grade: 'warm',
}
```

### LL.3.4 プロシージャルシーン仕様

```typescript
// apps/runtime/scenes/HouseNewScene.ts

export function buildHouseNewProcedural(
  scene: THREE.Scene,
  prop: PropertyConfig
): void {
  buildExterior({
    width:      prop.buildingWidth ?? 8.5,
    depth:      prop.buildingDepth ?? 7.0,
    floors:     prop.floors ?? 2,
    roofStyle:  prop.roofType ?? 'gable',      // gable / hip / shed
    wallColor:  prop.exteriorColor ?? 0xf5f0e8,
    gardenArea: prop.landArea - (prop.buildingArea ?? 0),
  })

  buildLDK({
    area:        prop.ldkArea ?? 20.0,
    ceilingH:    prop.ceilingHeight ?? 2.5,
    floorMat:    prop.floorMaterial ?? 'oak',   // oak / walnut / tile / carpet
    windowW:     prop.mainWindowWidth ?? 3.2,
    hasIsland:   prop.kitchenType === 'island',
  })

  buildGarden({
    area:   prop.gardenArea ?? 30,
    season: getCurrentSeason(),
    hasTerrasse: prop.hasTerrasse ?? false,
  })
}
```

---

## LL.4 土地・分譲地 LP {#ll4}
### `template_land` — ここに家が建つ

> **感動の核**: 所有の想像力・建築の可能性  
> **PostFX**: `land_bright`  
> **開始時刻**: `noon`

### LL.4.1 体験コンセプト

土地LPの最大の難題は「何もない」こと。  
解決策は「建てた後の姿を脳に先取りさせる」3フェーズ構造。

```
Phase 1: 今の土地（現実）     → 区画を歩かせ、広さを体感させる
Phase 2: 建築後の想像         → プロシージャル住宅が立ち上がる
Phase 3: 周辺環境の価値       → 駅・学校・公園との距離を3Dで体感
```

### LL.4.2 セクション構成

```
Sec 0: 空撮・全体把握
  カメラ: Y=80m（高空）→ 区画へ降下（ドローンショット再現）
  演出: 降下中に「土地面積◯㎡」「建ぺい率◯%」「容積率◯%」がフェードイン
  Splat: ドローン空撮SPZ4 / Procedural: 区画+道路+周辺地形
  テキスト: 「—— ◯◯㎡。あなたの未来の大きさ。」

Sec 1: 区画内ウォーク（地上視点）
  カメラ: 区画端から端へ歩行速度で移動（距離感の体感・15m/15秒）
  演出: 境界線が金色のラインで地面に投影されてゆく
  ホットスポット: 「前面道路幅 ◯m」「北側斜線あり/なし」
  テキスト: 「この距離が、あなたの庭になります。」

Sec 2: 日照シミュレーション
  カメラ: 固定（区画中心を見下ろす俯瞰、Y=15m）
  演出: RelightEngine.timelapseDay() — 6時→18時を10秒で
    周辺建物の影が動き、区画への日当たりを可視化
  データオーバーレイ: 「南面◯時間日照確保」「隣地影響 最大◯m」
  テキスト: 「光が、土地の価値を語る。」

Sec 3: 建築シミュレーション（★★クライマックス ★CTAポイント1）
  カメラ: 区画前の道路視点（H=1.65m）
  演出:
    → ボタン「家を建ててみる」クリックで起動
    → 地面から柱→壁→屋根が3秒で立ち上がるアニメ
    → 間取りタイプを3パターンから選択（3LDK/4LDK/5LDK）
    → 建てた家の中に「入る」ボタン → Sec 4へ
  CTA①: 「この土地で、理想の間取りを相談する。」
  テキスト: 「あなたの答えを、形にしよう。」

Sec 4: 建築後内覧（プロシージャルLDK）
  カメラ: Sec3で選んだ間取りのLDKを生成してウォーク
  テキスト: 「—— あなたが選んだ間取りで内覧しています。」
  Splat: なし（常にプロシージャル）

Sec 5: 周辺環境マップ（★CTAポイント2）
  カメラ: Y=20m、物件を中心に0.3rpm でゆっくり旋回
  演出: 同心円が広がり、施設アイコンが浮かぶ
    800m圏内: 駅・スーパー・コンビニ
    2km圏内: 小中学校・病院・公園
  データ: 各施設まで徒歩◯分を動的計算（Haversine）
  CTA②: 「現地見学を予約する。」
  テキスト: 「暮らしやすさは、地図が証明する。」

Sec 6: 完結
  CTA③: フルCTA（3択）
  テキスト: 「—— 白紙だから、何でも描ける。」
```

### LL.4.3 建築立ち上がりアニメーション実装

```typescript
// apps/runtime/scenes/LandScene.ts

export async function animateBuildingRise(
  scene: THREE.Scene,
  layoutType: '3LDK' | '4LDK' | '5LDK',
  landConfig: LandConfig
): Promise<void> {
  const building = buildHouseModel(layoutType, landConfig)
  building.scale.set(1, 0, 1)  // Y=0（地面に平らな状態）から開始

  // Phase 1: 基礎・柱（0〜0.8s）
  await gsap.to(building.scale, {
    y: 0.35, duration: 0.8, ease: 'power2.out'
  })

  // Phase 2: 壁（0.8〜2.0s）
  await gsap.to(building.scale, {
    y: 0.85, duration: 1.2, ease: 'power1.inOut'
  })

  // Phase 3: 屋根（2.0〜3.0s）— 少し跳ねるように
  await gsap.to(building.scale, {
    y: 1.0, duration: 1.0, ease: 'back.out(1.3)'
  })

  // Phase 4: 植栽・外構が生える（3.0〜4.5s）
  await growGarden(scene, landConfig.gardenArea)

  // Phase 5: 表札・ポストが設置される（4.5〜5.0s）
  await placeDetails(scene)
}
```

### LL.4.4 PostFX設定

```typescript
export const POSTFX_LAND_BRIGHT: PostFXConfig = {
  preset: 'land_bright',
  bloom:      0.20,
  vignette:   0.18,
  saturation: 1.15,   // 緑・土・空を生き生きと
  temperature: +100,
  contrast:   1.08,
  grade: 'warm',
}
```

---

## LL.5 中古戸建て LP {#ll5}
### `template_house_preowned` — 自分色に染め替える

> **感動の核**: 改変の自由感・発見の喜び  
> **PostFX**: `renovation`  
> **開始時刻**: `afternoon`

### LL.5.1 体験コンセプト

中古戸建ての「感動」は、**可能性の発見**にある。  
「傷がある古い家」ではなく「自分で育てられる器」として見せる。  
Before/After体験が最大の差別化兵器。

```
感情曲線:
現状確認（リアル）→ リノベ提案（ワクワク）→ 改装後体験（感動）
→ ライフスタイル想像（購買動機の確立）→ CTA
```

### LL.5.2 セクション構成

```
Sec 0: 外観（現状）
  カメラ: 道路から接近（ゆっくり・生活感ある速度）
  光: RelightEngine 'afternoon'（既存建物の温もり）
  Splat: 外観現状SPZ4 / Procedural: 既存外壁（経年感あるテクスチャ）
  テキスト: 「—— 誰かの物語が、ここで終わる。あなたの物語が、ここから始まる。」

Sec 1: 玄関（現状+改装提案）
  カメラ: 玄関前で停止
  演出: スライダーUIが出現
    LEFT: 現状（既存玄関）
    RIGHT: リノベ後（タイル・木製扉・照明変更）
  実装: setScissorTest（ADR-111準拠、ADR-162.1によりWebGPURenderer/WebGLRenderer両対応）
  ホットスポット: 「このリノベ費用の目安: ◯万円」
  テキスト: 「印象は、変えられる。」

Sec 2: LDK（★★クライマックス Before/After ★CTAポイント1）
  カメラ: LD空間に入る
  演出:
    → Before: 現状LDK（フローリング傷・古い設備）
    → スライダードラッグでリアルタイム切替
    → After: リノベ後LDK（無垢材・アイランドキッチン・間接照明）
    → スタイル選択UI（4種: Nordic / Natural / Modern / Japanese）
  PostFX: renovation（saturation:1.12, vignette:0.30, bloom:0.20）
  CTA①: 「このリノベプランで資料を請求する。」
  テキスト: 「—— 同じ空間が、全く別の物語を語り始める。」

Sec 3: キッチン（現状確認）
  カメラ: キッチン正面
  ホットスポット: 「設備年数◯年」「リノベ推奨箇所」（赤マーキング）
  テキスト: 「正直に、見せます。」

Sec 4: 2F・各室
  カメラ: ウォーク形式
  演出: 各部屋でBefore/Afterスライダーが自動展開

Sec 5: 庭・外構（★CTAポイント2）
  カメラ: 裏庭全体俯瞰 → 地上視点
  演出: 庭のリノベビジョン（芝生/デッキ/ガーデニング）を選択式で表示
  テキスト: 「庭は、大人の遊び場になる。」
  CTA②: 「リノベプランの相談をする。」

Sec 6: 完結
  演出: After状態の全室ダイジェスト3秒ハイライト
  CTA③: フルCTA（3択）
  テキスト: 「—— あなたが手を入れるほど、この家は応えてくれる。」
```

### LL.5.3 Before/Afterスライダー実装

```typescript
// apps/runtime/components/BeforeAfterSlider.ts

export class BeforeAfterSlider {
  private sliderX: number = 0.5   // 0.0=全Before, 1.0=全After
  private readonly renderer: THREE.WebGPURenderer | THREE.WebGLRenderer

  // setScissorTestによる正確な分割レンダリング（WebGPURenderer/WebGLRenderer両対応、ADR-162.1）
  render(
    beforeScene: THREE.Scene,
    afterScene:  THREE.Scene,
    camera:      THREE.Camera
  ): void {
    const w = this.renderer.domElement.width
    const h = this.renderer.domElement.height
    const splitX = Math.floor(w * this.sliderX)

    // Before（左側）
    this.renderer.setScissorTest(true)
    this.renderer.setScissor(0, 0, splitX, h)
    this.renderer.setViewport(0, 0, w, h)
    this.renderer.render(beforeScene, camera)

    // After（右側）
    this.renderer.setScissor(splitX, 0, w - splitX, h)
    this.renderer.setViewport(0, 0, w, h)
    this.renderer.render(afterScene, camera)

    this.renderer.setScissorTest(false)

    // 分割線（ドラッグハンドル）
    this.renderDivider(splitX)
  }

  // ドラッグ / タッチ対応
  setupInteraction(canvas: HTMLCanvasElement): void {
    const updateSlider = (clientX: number) => {
      const rect = canvas.getBoundingClientRect()
      this.sliderX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    }
    canvas.addEventListener('mousemove', e => { if (e.buttons) updateSlider(e.clientX) })
    canvas.addEventListener('touchmove', e => updateSlider(e.touches[0].clientX))
  }

  // リノベスタイル切替
  applyRenovationStyle(
    afterScene: THREE.Scene,
    style: 'nordic' | 'natural' | 'modern' | 'japanese'
  ): void {
    const materials = RENOVATION_MATERIAL_SETS[style]
    applyMaterialSet(afterScene, materials)
  }
}

// リノベスタイルごとのマテリアル定義
const RENOVATION_MATERIAL_SETS = {
  nordic:   { floor: 'light_ash', wall: 'white_plaster', accent: 0x808B96 },
  natural:  { floor: 'oak',       wall: 'warm_beige',    accent: 0x8D6E63 },
  modern:   { floor: 'dark_oak',  wall: 'concrete_grey', accent: 0x424242 },
  japanese: { floor: 'bamboo',    wall: 'shoji_white',   accent: 0x5D4037 },
}
```

### LL.5.4 PostFX設定

```typescript
export const POSTFX_RENOVATION: PostFXConfig = {
  preset: 'renovation',
  bloom:      0.20,
  vignette:   0.30,
  saturation: 1.12,
  temperature: +150,  // 既存の温もりを残す
  contrast:   1.08,
  grade: 'warm',
}
```

---

## LL.6 注文住宅モデルハウス LP {#ll6}
### `template_modelhouse` — こんな家に住む自分

> **感動の核**: 理想への同一化  
> **PostFX**: `golden_hour`  
> **開始時刻**: `golden`

### LL.6.1 体験コンセプト

モデルハウスLPの目標は「同一化（Identification）」——  
見ている人が「これは自分の家だ」と感じる瞬間を作ること。  
ライフタイムシーン（朝・昼・夕・夜の生活場面）が最強の手段。

### LL.6.2 セクション構成

```
Sec 0: 外観（ゴールデンアワー）
  カメラ: 斜め前方45°、ゆっくり前進
  光: RelightEngine 'golden'（17:45 の黄金光）
  演出: 窓から暖色の室内光が漏れる（内外のコントラスト）
  Splat: 外観SPZ4 / Procedural: 外観+庭+夕空
  テキスト: 「—— 夕方16時。誰かの家から光が漏れている。あなたの家から。」

Sec 1: エントランス
  カメラ: 玄関扉前 → 内部へ
  演出: ウェルカムボード・間接照明・シューズクローク
  テキスト: 「帰ってきた、という感覚。」

Sec 2: LDK（★★クライマックス）
  カメラ: 入室 → FOV演出（KK.3.2同様）
  Splat: LDK全体SPZ4 / Procedural: 空間全体

Sec 3: ライフタイムシーン切替（★最大の差別化）
  UI: タイムライン選択（4場面）
    🌅 朝7時 — 朝食準備の家族
    ☀️ 昼12時 — テレワーク・在宅時間
    🌆 夕方17時 — 子供が帰ってくる時間
    🌙 夜21時 — 家族の団欒
  各場面で:
    → RelightEngine の時刻変更
    → アニメーション人物シルエット配置
    → 環境音（optional / ユーザー許可制）
    → テキスト（各場面のコピー）
  CTA①: 「（選択中の場面）この時間帯に見学する。」

Sec 4: 各室詳細（ウォーク）
  主寝室 / 子供部屋 / 書斎 / バスルーム
  各室でホットスポット展開

Sec 5: 設計者ストーリー（★CTAポイント2）
  演出: 建築家/設計者の声（テキストのみ・AIが生成）
  テキスト: 「この家を設計した時、◯◯◯を大切にしました。」
  CTA②: 「設計の意図を聞きに、見学に来てください。」

Sec 6: 完結
  演出: 4つのライフタイムシーンを1シーンずつ0.5秒でダイジェスト
  CTA③: フルCTA（3択）
  テキスト: 「—— あなたの一日が、ここで始まる。」
```

### LL.6.3 ライフタイムシーン実装

```typescript
// apps/runtime/scenes/ModelHouseScene.ts

export type LifetimeScene = 'morning' | 'noon' | 'evening' | 'night'

interface SceneFrame {
  timePreset:   keyof typeof TIME_PRESETS
  silhouettes:  SilhouetteConfig[]
  copyText:     string
  ctaLabel:     string
}

export const LIFETIME_FRAMES: Record<LifetimeScene, SceneFrame> = {
  morning: {
    timePreset: 'morning',
    silhouettes: [
      { type: 'adult_female', position: { x: 0, z: 1 }, action: 'cooking' },
      { type: 'child',        position: { x: 2, z: 0 }, action: 'sitting' },
    ],
    copyText: '7:00 am — 珈琲の香りで、家族が目を覚ます。',
    ctaLabel: '朝の時間帯に見学する',
  },
  noon: {
    timePreset: 'noon',
    silhouettes: [
      { type: 'adult_male', position: { x: 3, z: 2 }, action: 'working' },
    ],
    copyText: '12:00 — 好きな場所で、仕事ができる。',
    ctaLabel: '昼間の光を体感する',
  },
  evening: {
    timePreset: 'golden',
    silhouettes: [
      { type: 'child', position: { x: -1, z: 1 }, action: 'running' },
      { type: 'adult_female', position: { x: 1, z: 0 }, action: 'welcoming' },
    ],
    copyText: '17:00 — 「おかえり」の声が、この家を完成させる。',
    ctaLabel: '夕方の雰囲気を見に来る',
  },
  night: {
    timePreset: 'night',
    silhouettes: [
      { type: 'family_group', position: { x: 0, z: 1 }, action: 'gathering' },
    ],
    copyText: '21:00 — 一日の終わり。この場所が、いちばん好きだと気づく。',
    ctaLabel: 'ナイト内覧に申し込む',
  },
}

export async function transitionLifetimeScene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  from: LifetimeScene,
  to: LifetimeScene
): Promise<void> {
  // カメラをその場で止めたまま照明のみ切替（0.8秒）
  const toFrame = LIFETIME_FRAMES[to]
  await RelightEngine.transitionTo(toFrame.timePreset, 0.8)

  // シルエット入れ替え
  removeSilhouettes(scene)
  placeSilhouettes(scene, toFrame.silhouettes)

  // テキスト・CTA更新
  updateCopyText(toFrame.copyText)
  updateCTALabel(toFrame.ctaLabel)
}
```

### LL.6.4 PostFX設定

```typescript
export const POSTFX_GOLDEN_HOUR: PostFXConfig = {
  preset: 'golden_hour',
  bloom:      0.22,
  vignette:   0.32,
  saturation: 1.08,
  temperature: +350,  // ゴールデンアワーの暖色
  contrast:   1.10,
  grade: 'gold',
}
```

---

## LL.7 土地（単独）LP {#ll7}
### `template_land_single` — 白紙の自由

> **PropertyType**: `landSingle`  
> **感動の核**: 創造の想像力・可能性の広大さ  
> **PostFX**: `land_bright`  
> **開始時刻**: `noon`  
> **グレード**: Basic〜Standard（コスト最小化）

### LL.7.1 体験コンセプト

分譲地（`land`）の簡略版。建築立ち上がりアニメなしで  
日照・環境・立地の価値を端的に伝えることに集中する。

### LL.7.2 セクション構成（コンパクト版）

```
Sec 0: 空撮（ドローン降下）
  Splat: ドローンSPZ4 / Procedural: 区画+道路

Sec 1: 地上ウォーク（広さ体感）

Sec 2: 日照シミュレーション（6h→18h タイムラプス）

Sec 3: 周辺環境（同心円マップ） ★CTAポイント1

Sec 4: 完結 ★CTAポイント2
```

---

## LL.8 共通コンポーネント仕様 {#ll8}

### LL.8.1 CameraSystem（全種別共通）

```typescript
// apps/runtime/lib/CameraSystem.ts

export interface CameraSection {
  id:        string
  position:  THREE.Vector3
  lookAt:    THREE.Vector3
  fov:       number         // 視野角（感情演出に使用）
  duration:  number         // 遷移時間（秒）
  ease:      string         // GSAPイージング
  onEnter?:  () => void     // セクション突入時コールバック
  onPeak?:   () => void     // 最美フレーム到達時 → CTA表示タイミング
}

export class CameraSystem {
  private camera: THREE.PerspectiveCamera
  private sections: CameraSection[]
  private curve: THREE.CatmullRomCurve3
  private currentSection = 0

  constructor(
    camera: THREE.PerspectiveCamera,
    sections: CameraSection[]
  ) {
    this.camera = camera
    this.sections = sections
    // 全セクションのposition配列からスプライン生成
    this.curve = new THREE.CatmullRomCurve3(
      sections.map(s => s.position),
      false,    // closed = false
      'catmullrom',
      0.5       // tension
    )
  }

  // スクロール量(0〜1) → カメラ位置をスプライン補間
  updateFromScroll(progress: number): void {
    const point = this.curve.getPoint(progress)
    gsap.to(this.camera.position, {
      x: point.x, y: point.y, z: point.z,
      duration: 0.6,
      ease: 'power2.out',
    })
  }

  // セクション間スナップ（PC: ホイール1回 / モバイル: スワイプ1回）
  snapToSection(index: number): void {
    const sec = this.sections[index]
    const tl = gsap.timeline()
    tl.to(this.camera, {
      fov: sec.fov,
      duration: sec.duration * 0.3,
      onUpdate: () => this.camera.updateProjectionMatrix(),
    })
    tl.to(this.camera.position, {
      ...sec.position,
      duration: sec.duration,
      ease: sec.ease,
      onStart:    () => sec.onEnter?.(),
      onComplete: () => sec.onPeak?.(),
    }, '<')
    tl.to(this.camera, {
      // lookAt はGSAPで直接補間できないためターゲットを補間
      duration: sec.duration,
      ease: sec.ease,
      onUpdate: () => {
        this.camera.lookAt(sec.lookAt)
      },
    }, '<')
    this.currentSection = index
  }
}
```

### LL.8.2 RelightEngine（全種別共通）

```typescript
// apps/runtime/lib/RelightEngine.ts

export const TIME_PRESETS = {
  dawn:      { hour: 5.5,  sunAzimuth:  80, sunElevation:  2, temp: 3200, intensity: 0.4 },
  morning:   { hour: 7.5,  sunAzimuth:  95, sunElevation: 18, temp: 5500, intensity: 1.1 },
  noon:      { hour: 12.0, sunAzimuth: 180, sunElevation: 72, temp: 6500, intensity: 1.4 },
  afternoon: { hour: 15.0, sunAzimuth: 230, sunElevation: 42, temp: 5800, intensity: 1.2 },
  sunset:    { hour: 17.5, sunAzimuth: 268, sunElevation:  8, temp: 3800, intensity: 0.9 },
  golden:    { hour: 17.8, sunAzimuth: 275, sunElevation:  4, temp: 3200, intensity: 0.7 },
  dusk:      { hour: 18.5, sunAzimuth: 285, sunElevation: -2, temp: 2800, intensity: 0.3 },
  night:     { hour: 22.0, sunAzimuth:   0, sunElevation:-30, temp: 2200, intensity: 0.05 },
} as const

export type TimePreset = keyof typeof TIME_PRESETS

export class RelightEngine {
  private sunLight:     THREE.DirectionalLight
  private ambientLight: THREE.AmbientLight
  private skyMesh:      THREE.Mesh

  // 一瞬明るくする「感情のフラッシュ」（新築戸建てLDK入室時）
  burst(multiplier = 1.4, duration = 0.5): void {
    const original = this.sunLight.intensity
    gsap.to(this.sunLight, {
      intensity: original * multiplier,
      duration: duration * 0.2,
      ease: 'power2.in',
      yoyo: true,
      repeat: 1,
    })
  }

  // タイムラプス（土地の日照シミュレーション）
  async timelapseDay(durationSec = 10): Promise<void> {
    // 朝6時から夜18時まで
    for (let h = 6; h <= 18; h += 0.1) {
      this.setHour(h)
      await new Promise(r => setTimeout(r, durationSec * 100 / 120))
    }
  }

  // 他LPへの遷移時（種別切替）
  async transitionTo(preset: TimePreset, duration: number): Promise<void> {
    const target = TIME_PRESETS[preset]
    gsap.to(this.sunLight, {
      intensity: target.intensity, duration, ease: 'power1.inOut'
    })
    // ... 方向・色温度も補間 ...
  }
}
```

### LL.8.3 SectionBeacon（全種別共通）

Part K K.3 の実装を全LPテンプレートで共通使用。  
計測イベント一覧:

| イベント | トリガー | 送信データ |
|--------|---------|-----------|
| `section_enter` | セクションが50%以上可視 | sectionId, timestamp |
| `section_exit` | セクションが50%未満に | sectionId, dwell_ms |
| `cta_view` | CTAボタンが可視 | ctaId, sectionId |
| `cta_click` | CTAボタンクリック | ctaId, sectionId, dwell_ms |
| `tour_complete` | 最終セクション到達 | total_dwell_ms |
| `before_after_interact` | スライダー操作（中古戸建てのみ） | sliderX, duration_ms |
| `building_rise_complete` | 建築アニメ完了（土地のみ） | layoutType |
| `lifetime_scene_switch` | シーン切替（モデルハウスのみ） | from, to |

### LL.8.4 HotspotEngine（全種別共通）

```typescript
// apps/runtime/lib/HotspotEngine.ts

export interface Hotspot {
  id:       string
  position: THREE.Vector3
  label:    string           // 短いラベル（例: 「天井高2.6m」）
  detail:   string           // クリック後の詳細テキスト
  icon:     'measure' | 'info' | 'star' | 'warning'
  visible:  boolean          // セクションに応じて制御
}

export class HotspotEngine {
  private sprites: Map<string, THREE.Sprite> = new Map()
  private raycaster = new THREE.Raycaster()

  addHotspot(hotspot: Hotspot): void {
    const sprite = createHotspotSprite(hotspot.icon)
    sprite.position.copy(hotspot.position)
    sprite.userData = { hotspotId: hotspot.id }
    this.sprites.set(hotspot.id, sprite)
  }

  // ホットスポットクリックで詳細パネルをフライイン表示
  onHotspotClick(hotspot: Hotspot): void {
    gsap.fromTo('#hotspot-detail-panel',
      { x: 50, opacity: 0 },
      { x: 0,  opacity: 1, duration: 0.3, ease: 'power2.out' }
    )
    document.getElementById('hotspot-label')!.textContent  = hotspot.label
    document.getElementById('hotspot-detail')!.textContent = hotspot.detail
  }

  // カメラを対象ホットスポットに向けてフライ
  flyToHotspot(
    hotspot: Hotspot,
    camera: THREE.PerspectiveCamera
  ): void {
    const targetPos = hotspot.position.clone().addScalar(3)  // 3m手前
    gsap.to(camera.position, {
      ...targetPos,
      duration: 1.2,
      ease: 'power2.inOut',
    })
  }
}
```

---

## LL.9 素材分岐ロジック（全種別） {#ll9}

### LL.9.1 分岐フロー

```
PropertyIntakeAgent が素材を解析
  ↓
SceneFactory.detectSceneMode()
  ↓
  ┌──────────────────────────────────────────────┐
  │  hasSplat = true                             │
  │  → SceneMode: 'splat'                        │
  │  → GaussianEngine でSPZ4ロード               │
  │  → ハイクオリティ実写体験                    │
  └──────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────┐
  │  hasSplat = false / hasGlb = true            │
  │  → SceneMode: 'hybrid'                       │
  │  → GLBモデル + プロシージャル背景            │
  │  → 中品質・素材転用体験                      │
  └──────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────┐
  │  hasSplat = false / hasGlb = false           │
  │  → SceneMode: 'procedural'                   │
  │  → 物件スペックからフル自動生成              │
  │  → 完全自動・即日公開                        │
  └──────────────────────────────────────────────┘
```

### LL.9.2 素材不足時の自動補完

| 不足素材 | 自動補完手段 | 精度 |
|---------|------------|-----|
| 外観写真 | 住所→ Mapbox Satellite + プロシージャル外壁 | ★★★☆☆ |
| 間取り図 | Claude Vision FloorplanAnalyzer（PDF/画像から自動生成・75〜85% IoU） | ★★★★☆ |
| 内観写真 | PropertyConfig + プロシージャル内装 | ★★★☆☆ |
| ドローン映像 | PLATEAU + プロシージャル空撮 | ★★★★☆ |
| 設備情報 | Claude Sonnet による物件概要文からの抽出 | ★★★★☆ |

---

## LL.10 グレード別機能マトリクス {#ll10}

| 機能 | Basic3D | Standard | Premium | Luxury |
|-----|---------|---------|---------|--------|
| プロシージャルシーン | ✅ | ✅ | ✅ | ✅ |
| Gaussian Splat（SPZ4） | ✅ | ✅ | ✅ | ✅ |
| RelightEngine（時間帯変化） | ❌ | ✅ | ✅ | ✅ |
| ホットスポット（3Dピン） | ❌ | ✅（最大5） | ✅（最大15） | ✅（無制限） |
| Before/Afterスライダー | ❌ | ✅ | ✅ | ✅ |
| ライフタイムシーン | ❌ | ❌ | ✅ | ✅ |
| 建築立ち上がりアニメ | ❌ | ✅ | ✅ | ✅ |
| AIチャット（pgvector RAG） | ❌ | ❌ | ✅ | ✅ |
| PLATEAU周辺環境 | ❌ | ❌ | ❌ | ✅ |
| カスタムPostFX | ❌ | 固定preset | カスタム可 | 完全カスタム |
| SectionBeacon（行動計測） | ✅ | ✅ | ✅ | ✅ |
| A/Bテスト | ❌ | ✅ | ✅ | ✅ |
| DynamicLP（utm連動） | ❌ | ✅ | ✅ | ✅ |
| USDZ（AR Quick Look） | ❌ | ❌ | ✅ | ✅ |
| VideoGeneratorRouter連携 | ❌ | ❌ | ✅ | ✅ |
| 受注制作価格（参考） | ¥49,800 | ¥98,000 | ¥198,000 | ¥398,000 |

---

## LL.11 CTA設計（全種別共通） {#ll11}

### LL.11.1 CTAタイミング設計

| タイミング | 条件 | CTA形式 | 優先度 |
|-----------|------|--------|-------|
| 感情ピーク | `onPeak()` コールバック（最美フレーム到達） | スライドインパネル | ★★★ |
| 滞在60秒 | SectionBeaconの `dwell_ms ≥ 60,000` | ソフトバブル（AIチャット誘導） | ★★ |
| 離脱検知 | マウスが画面上端15px以内 | ボトムシート（LINE登録） | ★★ |
| ツアー完走 | 最終セクション到達 | フルCTAパネル（3択） | ★★★ |
| 長時間滞在 | `dwell_ms ≥ 300,000`（5分） | AIチャット自動起動 | ★ |

### LL.11.2 CTAコピー設計（物件種別別）

```typescript
// apps/runtime/lib/CTAEngine.ts

export const CTA_COPY: Record<PropertyType, CTACopyConfig> = {
  mansion: {
    primary:    { label: '資料を請求する',          sub: 'この夜景と共に暮らすために' },
    secondary:  { label: '見学を予約する',          sub: '実際の眺望を確かめてください' },
    tertiary:   { label: 'AIに相談する',            sub: '24時間、どんな質問にもお答えします' },
    exit:       { label: 'このページを保存する',    sub: 'LINEで後から確認できます' },
  },
  newBuild: {
    primary:    { label: '資料を請求する',          sub: 'この広さを、ぜひ手元で確認してください' },
    secondary:  { label: '家族で見学する',          sub: 'お子様連れ大歓迎・週末随時受付' },
    tertiary:   { label: 'AIに相談する',            sub: 'ローンの試算もできます' },
    exit:       { label: 'このページを保存する',    sub: 'あとで家族に見せてください' },
  },
  land: {
    primary:    { label: '間取りプランを相談する',  sub: 'この土地で理想の家を実現する' },
    secondary:  { label: '現地見学を予約する',      sub: '実際の広さと日照を体感してください' },
    tertiary:   { label: 'AIに相談する',            sub: '建築費・ローンの試算もお任せください' },
    exit:       { label: 'このページを保存する',    sub: 'パートナーとも相談してみてください' },
  },
  preowned: {
    primary:    { label: 'リノベプランを相談する',  sub: 'あなたの理想の暮らしを実現しよう' },
    secondary:  { label: '現地を内覧する',          sub: '実物の状態と可能性を確かめる' },
    tertiary:   { label: 'AIに相談する',            sub: 'リノベ費用の目安を今すぐ計算' },
    exit:       { label: 'このページを保存する',    sub: 'リノベ後の姿を保存しておけます' },
  },
  modelHouse: {
    primary:    { label: '見学を予約する',          sub: 'あなたが選んだ時間帯に来てください' },
    secondary:  { label: '資料を請求する',          sub: '設計図面・仕様書をお届けします' },
    tertiary:   { label: 'AIに相談する',            sub: '注文建築の流れを詳しく解説します' },
    exit:       { label: 'このページを保存する',    sub: '家族と一緒にもう一度見てください' },
  },
  landSingle: {
    primary:    { label: '現地見学を予約する',      sub: 'この土地の可能性を一緒に考えます' },
    secondary:  { label: '資料を請求する',          sub: '周辺環境・法規制レポートを無料進呈' },
    tertiary:   { label: 'AIに相談する',            sub: '建てられる家のプランを提案します' },
    exit:       { label: 'このページを保存する',    sub: 'あとでゆっくり検討してください' },
  },
}
```

### LL.11.3 LeadConfig連携

```typescript
// CTAクリック時のLeadConfig統合
export function handleCTAClick(
  ctaType: 'primary' | 'secondary' | 'tertiary',
  scene: SceneConfig,
  sectionId: string
): void {
  const lead: LeadInput = {
    propertyId:  scene.propertyId,
    agencyId:    scene.agencyId,
    ctaType,
    sectionId,
    utmSource:   UtmTracker.get('utm_source'),
    utmMedium:   UtmTracker.get('utm_medium'),
    utmCampaign: UtmTracker.get('utm_campaign'),
    dwellMs:     SectionBeacon.getTotalDwell(),
    abVariant:   scene.abVariant?.variantId,
  }

  // LINE / 電話 / フォーム の分岐
  const config = scene.leadConfig
  switch (ctaType) {
    case 'primary':
      if (config.lineEnabled) openLineCTA(config.lineId, lead)
      else                    openFormCTA(config.formUrl, lead)
      break
    case 'secondary':
      openCalendarBooking(config.calendarUrl, lead)
      break
    case 'tertiary':
      openAIChat(scene, lead)
      break
  }
}
```

---

## LL.12 パフォーマンス・品質基準 {#ll12}

### LL.12.1 Core Web Vitals 目標値

| 指標 | 目標値 | 計測方法 |
|-----|-------|--------|
| LCP (Largest Contentful Paint) | < 2.5s | Web Vitals API |
| FID / INP | < 100ms | Web Vitals API |
| CLS | < 0.1 | Web Vitals API |
| 初回3D描画 | < 3.0s | performance.mark() |
| SPZ4ロード完了 | < 5.0s（Fast 4G相当） | PerformanceObserver |
| フレームレート | ≥ 30fps（モバイル） / ≥ 60fps（デスクトップ） | Stats.js |

### LL.12.2 VRAM バジェット（GPUBudgetManager連携）

| デバイス想定 | 推定VRAM | 戦略 |
|------------|---------|-----|
| ハイエンドPC（RTX 3080+） | 10GB+ | フルSPZ4 + PLATEAU + 全PostFX |
| ミドルPC（GTX 1660+） | 6GB | SPZ4 + 基本PostFX |
| ノートPC | 2〜4GB | SPZ4 + PostFX低設定 / 自動LOD |
| iPhone 15 Pro | 〜6GB共有 | SPZ4軽量版 + PostFX最小 |
| 低スペックモバイル | 〜1GB共有 | プロシージャル + PostFXなし |

```typescript
// 自動品質調整
export function autoDetectQualityLevel(): QualityLevel {
  const gpu = getGPUTier()  // @pmndrs/detect-gpu
  if (gpu.tier >= 3) return 'ultra'
  if (gpu.tier >= 2) return 'high'
  if (gpu.tier >= 1) return 'medium'
  return 'low'
}
```

### LL.12.3 モバイル対応要件

```
必須:
  □ タッチスワイプでセクション移動（iOS / Android）
  □ iOS Safari sendBeacon フォールバック（fetch + keepalive）
  □ viewport高さ 100dvh 対応（ブラウザUI考慮）
  □ 縦持ち / 横持ち 両対応（FOV自動調整）
  □ ピンチズームでホットスポット拡大

推奨:
  □ データ節約モード検知（prefers-reduced-data）で低解像度切替
  □ バッテリー残量 < 20% で自動品質下げ
  □ gyroscope連携（対応端末でパララックス効果）
```

---

## LL.13 Scene JSON テンプレート集 {#ll13}

### LL.13.1 新築マンション

```json
{
  "version": "10.0.0",
  "sceneId": "{{uuid}}",
  "propertyId": "{{uuid}}",
  "agencyId": "{{uuid}}",
  "property": {
    "propertyType": "mansion",
    "name": "{{物件名}}",
    "price": 0,
    "address": "{{住所}}",
    "floor": 18,
    "totalFloors": 25,
    "area": 75.0,
    "nearestStation": "{{最寄り駅}}",
    "walkMinutes": 5
  },
  "lpTemplate": {
    "type": "mansion",
    "cameraPreset": "mansion_standard",
    "startTimePreset": "night",
    "postfxPreset": "urban_night",
    "enablePlateau": false,
    "gradeLevel": "premium"
  },
  "postFX": {
    "preset": "urban_night",
    "bloom": 0.18,
    "vignette": 0.42,
    "saturation": 1.08,
    "temperature": 0,
    "contrast": 1.12,
    "grade": "cool"
  },
  "ai": {
    "chatEnabled": true,
    "chatPersonality": "高級マンションの専門コンシェルジュ。丁寧かつ的確に回答する。"
  }
}
```

### LL.13.2 新築戸建て

```json
{
  "version": "10.0.0",
  "property": {
    "propertyType": "newBuild",
    "ldkArea": 22.0,
    "floors": 2,
    "ceilingHeight": 2.5,
    "floorMaterial": "oak",
    "kitchenType": "island"
  },
  "lpTemplate": {
    "type": "newBuild",
    "cameraPreset": "house_new_standard",
    "startTimePreset": "morning",
    "postfxPreset": "warm_morning",
    "gradeLevel": "standard"
  }
}
```

### LL.13.3 土地・分譲地

```json
{
  "version": "10.0.0",
  "property": {
    "propertyType": "land",
    "landArea": 120.0,
    "buildingCoverageRatio": 0.6,
    "floorAreaRatio": 2.0,
    "frontRoadWidth": 6.0
  },
  "lpTemplate": {
    "type": "land",
    "cameraPreset": "land_standard",
    "startTimePreset": "noon",
    "postfxPreset": "land_bright",
    "gradeLevel": "standard"
  }
}
```

### LL.13.4 中古戸建て

```json
{
  "version": "10.0.0",
  "property": {
    "propertyType": "preowned",
    "buildYear": 2005,
    "renovationPossible": true
  },
  "lpTemplate": {
    "type": "preowned",
    "cameraPreset": "house_preowned_standard",
    "startTimePreset": "afternoon",
    "postfxPreset": "renovation",
    "renovationStyle": "natural",
    "gradeLevel": "standard"
  }
}
```

### LL.13.5 注文住宅モデルハウス

```json
{
  "version": "10.0.0",
  "property": {
    "propertyType": "modelHouse"
  },
  "lpTemplate": {
    "type": "modelHouse",
    "cameraPreset": "modelhouse_premium",
    "startTimePreset": "golden",
    "postfxPreset": "golden_hour",
    "lifetimeScenes": ["morning", "noon", "evening", "night"],
    "gradeLevel": "premium"
  }
}
```

---

## LL.14 ADRログ {#ll14}

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-114 | `mansion` を PropertyTypeSchema に追加 | マンション固有の購買動機（夜景・格式・上昇感）は戸建てと根本的に異なる | `newBuild` に統合 |
| ADR-115 | PostFXプリセットを9種に拡張 | 物件種別ごとの「感情温度」が異なる。`warm_morning` と `urban_night` は別物件では使えない | 汎用プリセットのみ |
| ADR-116 | LpTemplateConfigSchema を SceneSchema に正式追加 | Scene JSONをSSoTとする設計5原則を徹底。テンプレート設定をJSONの外に持つと同期ずれが発生する | 設定ファイル分離 |
| ADR-117 | グレード（Basic/Standard/Premium/Luxury）をlpTemplateに持つ | 同一物件でもグレードによってレンダリングパスを切り替える必要があるため | 別APIパラメータ |
| ADR-118 | Before/Afterスライダーは setScissorTest（Part KK ADR-111継承、ADR-162.1によりWebGPURenderer/WebGLRenderer両対応） | CSS分割より正確なレンダリング境界線 | CSS clip-path |
| ADR-119 | CTAコピーを物件種別×CTAタイプのマトリクスで管理 | 「見学予約」と「資料請求」では訴求軸が異なる。汎用コピーでは感情曲線が途切れる | 汎用テキスト |
| ADR-120 | LifetimeSceneは RelightEngine.transitionTo() でカメラ位置を変えず照明のみ切替 | カメラ移動との同時実行はGPUスパイク・酔いの原因になる | カメラ+照明同時変更 |
| ADR-121 | AutoQualityDetect（@pmndrs/detect-gpu）を全テンプレートに統合 | 低スペックモバイルでのFPS 1桁は商品価値を著しく損なう | 手動品質設定のみ |
| ADR-122 | 各物件種別のプロシージャルシーンを独立した Scene クラスに分割 | モノリシックな ProceduralScene では種別特有のジオメトリ生成ロジックが膨れ上がる | 単一クラス |
| ADR-123 | SectionBeaconのカスタムイベント（before_after_interact等）を種別拡張として定義 | コアBeaconを変更せず種別ロジックをプラグイン形式で追加 | コア改変 |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|----------|------|--------|
| v1.0 | 2026-06-11 | 初版作成。Part KKを統合・昇華し、6物件種別の完全仕様を定義。整合性修正3件（ADR-114〜116）を含む |
| v1.1 | 2026-06-13 | Part MM v5.2のADR-162.1に合わせ、整合バージョン表記をThree.js r184（WebGPURenderer標準・WebGL2自動フォールバック）に修正。LL.0.1のWebGPU記述を「フェーズ0から標準」に統一。BeforeAfterSlider（LL.5.3）のrenderer型を`THREE.WebGPURenderer | THREE.WebGLRenderer`に修正し、`WebGLScissorTest`表記を`setScissorTest`（両対応）に修正。ADR-118・LL.5.2の同表記も修正 |
