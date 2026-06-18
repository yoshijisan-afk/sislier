# Part MM — SisliR LP Editor 完全設計書
## 世界トップレベル 次世代エディタ v5.3 実装仕様

> **バージョン**: v1.3 (2026-06-13)
> **適用設計書**: SisliR v10.2 完全設計書 + Part KK + Part LL + Part NN v1.2 + Part OO v1.1 + Part PP
> **対象ファイル**: `apps/web/app/editor/` (Next.js 15 App Router)
> **ベースライン**: `sislir_lp_editor_v4_100point.html` (v4.0 単体HTML)
> **目標**: v4.0の完成度を維持しつつ、世界最高水準のプロエディタへ昇華
> **v5.1差分**: ① gradeLevelをPart OOのOrder.grade（'basic3d'|'standard'|'premium'|'luxury'）に統一（ADR-161）。
> ② PostFXプリセットを10種で確定し、Part NN.8.1のenumと一致させた。
> ③ ViewportCanvasの実装例をWebGL2先行（フェーズ0〜2）・WebGPUはフェーズ3移行に変更（ADR-162、v5.2で撤回）。
> ④ AiCopilotにテナントプラン別のコスト管理（LoopCostTracker連携）を追加。
> ⑤ Yjs Presenceにマスタースタッフの扱いを追加し、Part OOの監査ログと接続。
> ⑥ シンプルLPエディタ（Part PP）との共有コンポーネント範囲を明記。
>
> **v5.2差分（2026-06-13）**: ADR-162を撤回し、ADR-162.1で上書き。
> 2026年6月時点でChrome/Edge/Safari/Firefoxの主要ブラウザがWebGPUを既定で出荷し、
> Three.js r184のWebGPURendererも安定運用段階にあるため、「フェーズ0〜2はWebGL2、
> フェーズ3でWebGPU移行」という前提は実情と一致しなくなった。本書のViewportCanvas
> 実装例をWebGPURenderer標準・WebGL2自動フォールバックの構成に変更し、MM.0.3・
> MM.1.1・MM.1.3・MM.3.1の「WebGL2、フェーズ3でWebGPU移行」表記をすべて修正した。
> Part NN.9のフェーズ3「WebGPU移行」も「WebGPU前提の感動演出追加実装（フォールバック
> 整備を含む）」へ意味を改めた（Part NN v1.2参照）。
> なお、Part RR/QQに存在する別件のADR-162（動画コスト運用・A/B知識蓄積に関するもの）
> とは番号が重複しているが無関係であり、本書内のADR-162.1のみが本件の対象である。
> ADR番号の重複は別途棚卸し済み（ADR棚卸しレポート v1.0参照）。
>
> **v5.3差分（2026-06-13）**: 完全設計書v10.2との整合。
> AIモデル文字列を最新版に更新（`claude-sonnet-4-6` / `claude-haiku-4-5`）。
> voyage-3 → voyage-3-large に更新（完全設計書B.3と整合）。
> 依存設計書の参照バージョンをv10.2・Part OO v1.1に更新。

---

## 目次

- [MM.0 v4.0 Gap分析と v5.0 進化方針](#mm0)
- [MM.1 アーキテクチャ設計](#mm1)
- [MM.2 UIレイアウト仕様（拡張版）](#mm2)
- [MM.3 ビューポート・3D エンジン統合](#mm3)
- [MM.4 左パネル — アセット・シーン管理](#mm4)
- [MM.5 右パネル — インスペクター（全タブ）](#mm5)
- [MM.6 タイムライン — 感情曲線エディタ](#mm6)
- [MM.7 AI統合仕様（エディタ内 Claude）](#mm7)
- [MM.8 物件種別テンプレート切替](#mm8)
- [MM.9 リアルタイム品質スコアリング](#mm9)
- [MM.10 エクスポートパイプライン](#mm10)
- [MM.11 コラボレーション・履歴](#mm11)
- [MM.12 パフォーマンス・アクセシビリティ](#mm12)
- [MM.13 コンポーネント実装仕様](#mm13)
- [MM.14 ADRログ](#mm14)

---

## MM.0 v4.0 Gap分析と v5.0 進化方針 {#mm0}

### MM.0.1 v4.0 の達成事項（維持する強み）

```
✅ ビジュアルデザイン: ダークテーマ・カラーシステム（--accent系4色）完成
✅ レイアウト骨格: タイトルバー / 左パネル / ビューポート / タイムライン / 右パネル
✅ 技術スタックバッジ: WebGPU / SPZ4 / GSAP4 の存在感
✅ アセットタイル UIL: グリッド表示・選択状態管理
✅ シーン階層ツリー: インデントレベル・状態ドット
✅ タイムライン: セグメント・キーフレーム表示
✅ 右パネル5タブ: 変換/素材/AI/スコア/出力
✅ AIチャット: フロート表示・チップ提案
✅ スコアリングUI: リングゲージ + スコアバー
✅ Canvasアニメーション: パーティクル + グリッド + カメラパス表示
✅ sendPrompt統合: 全ボタンからClaudeへの橋渡し
```

### MM.0.2 v4.0 の課題（v5.0 で解決するGap）

| # | Gap | 影響 | v5.0 解決策 |
|---|-----|------|------------|
| G1 | 物件種別切替UI が存在しない | 6種別に対応できない | 物件種別セレクターをタイトルバーに追加（Part LL連携） |
| G2 | タイムラインが静的表示のみ | 感情曲線の編集不可 | 感情曲線レイヤー追加・ドラッグ可能KF |
| G3 | Before/Afterスライダー未実装 | 中古戸建て対応不可 | ビューポート内 WebGLScissorTest統合 |
| G4 | ライフタイムシーンUI なし | モデルハウス対応不可 | タイムライン上部に4シーンスイッチャー追加 |
| G5 | PostFXプリセット選択 なし | 種別別の感情色設定不可 | 素材タブにPostFXプリセット選択追加 |
| G6 | PLATEAU設定UI なし | Luxuryグレード設定不可 | 地形タブ（新設）にPLATEAU設定 |
| G7 | 品質スコアが静的100点固定 | リアルタイム評価不能 | ScoreEngine（動的計算）に置換 |
| G8 | CTAタイミング設定 なし | 感情ピーク=CTA未連携 | タイムラインにCTAレイヤー追加 |
| G9 | コラボ機能 なし | チーム編集不可 | Yjs CRDT + 右上アバター表示 |
| G10 | undo/redo 未実装 | 誤操作復元不可 | Command Patternで全操作履歴化 |
| G11 | モバイル編集UI なし | スマホ確認不可 | ビューポートにモバイルプレビューモード追加 |
| G12 | グレード設定UI なし | Basic/Premium等の出し分け不可 | エクスポートタブにグレードセレクター追加 |

### MM.0.3 v5.0 設計哲学

```
「Figmaが動画編集ソフトと合体し、不動産AIが内蔵された」エディタ

3つの核:
  核1: 3D体験エディタ（Three.js r184（WebGPURenderer標準・WebGL2自動フォールバック）のフル制御）
  核2: 感情曲線エディタ（GSAP 4のタイムラインをビジュアル編集）
  核3: AIコパイロット（Claude Sonnet がシーンを理解し提案する）

UXの原則:
  - 「触れるものは全て動く」: 静的なUI要素は存在しない
  - 「AIが先回りする」: 操作の前に提案が出る
  - 「スコアは常に見える」: 100点への距離が常に可視化される
```

---

## MM.1 アーキテクチャ設計 {#mm1}

### MM.1.1 ファイル構造

```
apps/web/
└── app/
    └── editor/
        ├── page.tsx                        # エディタ本体（RSC）
        ├── layout.tsx                      # エディタ専用レイアウト（full height）
        │
        └── _components/                    # エディタ専用コンポーネント
            ├── EditorShell.tsx             # 全体レイアウト（Client Component）
            │
            ├── titlebar/
            │   ├── TitleBar.tsx            # タイトルバー
            │   ├── PropertyTypeSelector.tsx # 種別セレクター（NEW v5.0）
            │   ├── GradeSelector.tsx        # グレードセレクター（NEW v5.0）
            │   ├── CollaboratorAvatars.tsx  # コラボアバター（NEW v5.0）
            │   └── ScoreBadge.tsx           # 品質スコアバッジ
            │
            ├── left-panel/
            │   ├── LeftPanel.tsx
            │   ├── AssetTab.tsx            # アセット管理（拡張）
            │   ├── SceneTab.tsx            # シーン階層ツリー（拡張）
            │   ├── ImportTab.tsx           # インポート（拡張）
            │   └── TemplateTab.tsx         # テンプレート（NEW v5.0）
            │
            ├── viewport/
            │   ├── Viewport.tsx            # ビューポートコンテナ
            │   ├── ViewportCanvas.tsx      # Three.js Canvas（WebGPURenderer標準・WebGL2自動フォールバック）
            │   ├── ViewportToolbar.tsx     # ツールバー（拡張）
            │   ├── LightingPresets.tsx     # 照明プリセット
            │   ├── BeforeAfterSlider.tsx   # Before/After（NEW v5.0）
            │   ├── LifetimeSceneSwitch.tsx # ライフタイム切替（NEW v5.0）
            │   ├── MobilePreviewFrame.tsx  # モバイルプレビュー（NEW v5.0）
            │   └── OverlayHUD.tsx          # HUDオーバーレイ
            │
            ├── timeline/
            │   ├── Timeline.tsx            # タイムラインコンテナ
            │   ├── TimelineTrack.tsx       # トラック（汎用）
            │   ├── EmotionCurveTrack.tsx   # 感情曲線レイヤー（NEW v5.0）
            │   ├── CTAMarkers.tsx          # CTAタイミングマーカー（NEW v5.0）
            │   ├── Keyframe.tsx            # ドラッグ可能KF（拡張）
            │   └── PlayheadController.tsx  # プレイヘッド
            │
            ├── right-panel/
            │   ├── RightPanel.tsx
            │   ├── TransformTab.tsx        # 変換タブ（拡張）
            │   ├── MaterialTab.tsx         # 素材タブ（拡張 + PostFX）
            │   ├── AiTab.tsx               # AIタブ（拡張）
            │   ├── TerrainTab.tsx          # 地形タブ（NEW v5.0 PLATEAU）
            │   ├── ScoreTab.tsx            # スコアタブ（動的計算に換装）
            │   └── ExportTab.tsx           # 出力タブ（拡張）
            │
            └── ai-panel/
                ├── AiFloatChat.tsx         # フロートAIチャット（拡張）
                ├── AiSuggestionBar.tsx     # AI提案バー（NEW v5.0）
                └── AiVoiceButton.tsx       # 音声入力（NEW v5.0）

packages/editor-engine/                     # エディタ専用ロジック
├── src/
│   ├── ScoreEngine.ts                      # 動的品質スコア計算
│   ├── CommandHistory.ts                   # undo/redo（Command Pattern）
│   ├── EditorStore.ts                      # Zustand ストア（エディタ状態）
│   ├── SceneSerializer.ts                  # Scene JSON ↔ エディタ状態の相互変換
│   ├── TemplateRegistry.ts                 # 物件種別テンプレート管理
│   └── AiCopilot.ts                        # Claude Sonnet 統合コパイロット
```

### MM.1.2 状態管理（Zustand ストア設計）

```typescript
// packages/editor-engine/src/EditorStore.ts

import { create } from 'zustand'
import { temporal } from 'zundo'   // undo/redo middleware
// GradeLevelはpackages/shared/types/order.tsのOrder.gradeと共有定義（ADR-161）
// 'basic3d' | 'standard' | 'premium' | 'luxury'
import type { GradeLevel } from '@shared/types/order'

export interface EditorState {
  // ── シーン ──
  sceneJson:       SceneConfig                    // Scene JSON SSOT
  selectedNodeId:  string | null                  // 選択中ノード
  hoveredNodeId:   string | null

  // ── 物件設定 ──
  propertyType:    PropertyType                   // 6種別
  // grade命名はPart OO（マスター管理画面）のOrder.gradeと統一。
  // 'basic' ではなく 'basic3d' を正とする（ADR-161）
  gradeLevel:      GradeLevel                     // = 'basic3d' | 'standard' | 'premium' | 'luxury'
  sceneMode:       'splat' | 'hybrid' | 'procedural'

  // ── ビューポート ──
  activeTool:      'move' | 'rotate' | 'scale' | 'fps' | 'ar'
  lightPreset:     TimePreset
  viewMode:        'desktop' | 'mobile' | 'vr'   // NEW v5.0
  showBeforeAfter: boolean                        // 中古戸建て専用
  lifetimeScene:   LifetimeScene | null           // モデルハウス専用
  showMobileFrame: boolean                        // NEW v5.0

  // ── タイムライン ──
  playTime:        number
  isPlaying:       boolean
  totalDuration:   number                         // デフォルト8s → 種別で変動

  // ── パネル ──
  leftTab:         'assets' | 'scene' | 'import' | 'templates'
  rightTab:        'transform' | 'material' | 'ai' | 'terrain' | 'score' | 'export'
  aiChatVisible:   boolean

  // ── スコア ──
  score:           QualityScore                   // 動的スコア
  scoreBreakdown:  ScoreBreakdown

  // ── コラボ ──
  collaborators:   CollaboratorInfo[]
  myColor:         string                         // アバター色

  // ── Actions ──
  setPropertyType: (type: PropertyType) => void
  setGradeLevel:   (level: GradeLevel) => void
  updateSceneJson: (patch: Partial<SceneConfig>) => void
  selectNode:      (id: string | null) => void
  setActiveTool:   (tool: string) => void
  setLightPreset:  (preset: TimePreset) => void
  setLifetimeScene:(scene: LifetimeScene | null) => void
  recalcScore:     () => void
}

// temporal() で自動的にundo/redo履歴が生成される
export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      // ... 初期値と実装
    }),
    { limit: 100 }  // 最大100ステップの履歴
  )
)
```

### MM.1.3 技術スタック

```
フレームワーク:   Next.js 15 (App Router)
状態管理:        Zustand 5 + zundo (undo/redo)
3Dエンジン:      Three.js r184（WebGPURenderer標準・WebGL2自動フォールバック、ADR-162.1）
アニメーション:   GSAP 4
コラボ:          Yjs + y-websocket (Supabase Realtimeブリッジ)
AIコパイロット:   Claude Sonnet (claude-sonnet-4-6)
スキーマ検証:    Zod v4
スタイリング:     CSS Variables（v4.0のデザインシステム継承） + Tailwind
フォント:        DM Sans + DM Mono（v4.0継承）
アイコン:        Tabler Icons v3.19（v4.0継承）
```

---

## MM.2 UIレイアウト仕様（拡張版） {#mm2}

### MM.2.1 レイアウト寸法定義

```css
/* v4.0 継承 + v5.0 拡張 */
:root {
  /* ── v4.0 継承 ── */
  --bg:      #07080b;
  --panel:   #0d0f13;
  --border:  rgba(255,255,255,0.055);
  --accent:  #5b9fff;
  --accent2: #9d7bff;
  --accent3: #3ddba6;
  --warn:    #f0b429;
  --ok:      #3ddba6;
  --err:     #ff5e57;
  --t1:      #ecedf2;
  --t2:      #8990a5;
  --t3:      #464c62;
  --t4:      #252836;

  /* ── v5.0 新規追加 ── */
  --accent4:    #ff8c5a;   /* 感情曲線カラー（オレンジ） */
  --accent5:    #ff5e9e;   /* CTAマーカーカラー（ピンク） */
  --glow-warm:  rgba(255,140,90,0.10);
  --glow-cta:   rgba(255,94,158,0.12);

  /* ── 寸法 ── */
  --toolbar:  42px;       /* v4.0: 40px → v5.0: 42px */
  --type-bar: 32px;       /* NEW v5.0: 物件種別バー */
  --lw:       260px;      /* v4.0: 252px → v5.0: 260px */
  --rw:       296px;      /* v4.0: 286px → v5.0: 296px */
  --tl:       164px;      /* v4.0: 148px → v5.0: 164px（感情曲線分） */
  --status:   20px;

  /* ── フォント ── */
  --f:  'DM Sans',  system-ui, sans-serif;
  --fm: 'DM Mono',  monospace;
}
```

### MM.2.2 レイアウト構造（v5.0 確定版）

```
┌──────────────────────────────────────────────────────────┐
│ TITLEBAR (42px)                                          │
│  Logo | メニュー | [物件種別] [グレード] | バッジ群 | ⓘScore | 公開 │
├──────────────────────────────────────────────────────────┤
│ PROPERTY TYPE BAR (32px) ← NEW v5.0                     │
│  🏢 マンション | 🏠 新築戸建 | 🌱 土地 | 🔨 中古 | 🏗️ モデルハウス | 📐 単独地 │
├──────────┬─────────────────────────────────┬────────────┤
│          │                                 │            │
│  LEFT    │         VIEWPORT                │   RIGHT    │
│  PANEL   │   (Canvas + OverlayHUD)         │   PANEL    │
│  (260px) │                                 │  (296px)   │
│          │                                 │            │
│  ├ Assets│  [ツールバー: 中央上部]          │  ├ 変換    │
│  ├ Scene │  [照明プリセット: 右上]          │  ├ 素材    │
│  ├ Import│  [B/A スライダー: 中古時]        │  ├ AI      │
│  └ Tmpl  │  [LifetimeSwitch: モデルハウス時]│  ├ 地形    │
│          │  [AIチャット: 下部フロート]      │  ├ スコア  │
│          │  [モバイルフレーム: ON時]        │  └ 出力    │
│          │                                 │            │
│          ├─────────────────────────────────┤            │
│          │ TIMELINE (164px)                │            │
│          │  [感情曲線レイヤー] ← NEW       │            │
│          │  カメラパス / GS / 照明 / CTA  │            │
│          │  字幕 / [CTAマーカー] ← NEW    │            │
├──────────┴─────────────────────────────────┴────────────┤
│ STATUS BAR (20px)                                        │
└──────────────────────────────────────────────────────────┘
```

### MM.2.3 物件種別バー（NEW v5.0）

```typescript
// left-panel/PropertyTypeBar.tsx

const PROPERTY_TYPES: Array<{
  type: PropertyType
  emoji: string
  label: string
  color: string      // アクセントカラー（種別ごとに異なる）
  timePreset: TimePreset
}> = [
  { type: 'mansion',    emoji: '🏢', label: 'マンション', color: '#5b9fff', timePreset: 'night'     },
  { type: 'newBuild',   emoji: '🏠', label: '新築戸建て', color: '#3ddba6', timePreset: 'morning'   },
  { type: 'land',       emoji: '🌱', label: '土地・分譲', color: '#6bff9e', timePreset: 'noon'      },
  { type: 'preowned',   emoji: '🔨', label: '中古戸建て', color: '#f0b429', timePreset: 'afternoon' },
  { type: 'modelHouse', emoji: '🏗️', label: 'モデルハウス', color: '#9d7bff', timePreset: 'golden'  },
  { type: 'landSingle', emoji: '📐', label: '土地（単独）', color: '#8990a5', timePreset: 'noon'    },
]

// 種別切替時:
// 1. EditorStore.setPropertyType()
// 2. TemplateRegistry.load(type) → Scene JSONを種別デフォルトに切替
// 3. RelightEngine.transitionTo(timePreset)
// 4. PostFXEngine.setPreset(postfxPreset)
// 5. Timeline.setDuration(TEMPLATE_DURATION[type])
// 6. ScoreEngine.recalc() → スコア再計算
```

---

## MM.3 ビューポート・3Dエンジン統合 {#mm3}

### MM.3.1 ViewportCanvas 実装仕様

```typescript
// viewport/ViewportCanvas.tsx

'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useEditorStore } from '@/packages/editor-engine/EditorStore'

// ADR-162.1（v5.2でADR-162を撤回・上書き）:
// 2026年6月時点でChrome/Edge/Safari/FirefoxがWebGPUを既定で出荷し、
// Three.js r184のWebGPURendererも安定運用段階にある。
// フェーズ0からWebGPURendererを標準とし、navigator.gpu非対応環境では
// WebGLRenderer（WebGL2）へ自動フォールバックする。
// Part NN.9のフェーズ3「WebGPU移行」は、本ADRにより
// 「WebGPU前提の感動演出（Gaussian Splat等）の追加実装」に意味を改める
// （レンダラー自体はフェーズ0から両対応のため、移行作業は不要）。

export function ViewportCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<THREE.WebGPURenderer | THREE.WebGLRenderer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGPURenderer | THREE.WebGLRenderer
    let disposed = false

    const init = async () => {
      // WebGPU対応判定（navigator.gpu の有無 + adapter取得成否で判定）
      const hasWebGPU = 'gpu' in navigator && await (async () => {
        try {
          const adapter = await (navigator as any).gpu.requestAdapter()
          return adapter !== null
        } catch {
          return false
        }
      })()

      if (hasWebGPU) {
        // WebGPURenderer 初期化（標準パス）
        renderer = new THREE.WebGPURenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        })
        // WebGPURendererは初期化が非同期
        await (renderer as THREE.WebGPURenderer).init()
      } else {
        // WebGLRenderer（WebGL2）への自動フォールバック
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        })
      }

      if (disposed) {
        renderer.dispose()
        return
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(canvas.clientWidth, canvas.clientHeight)
      rendererRef.current = renderer

      // PostFX パイプライン（WebGPU/WebGL両対応のTSLベース実装、PostFXEngine側で分岐）
      const postfx = new PostFXEngine(renderer)
      postfx.setPreset(useEditorStore.getState().sceneJson.postFX?.preset ?? 'none')

      // アニメーションループ
      const clock = new THREE.Clock()
      const animate = () => {
        if (disposed) return
        const dt = clock.getDelta()
        // GPUBudgetManager が自動でLOD調整（WebGPU/WebGLそれぞれの予算指標で判定）
        GPUBudgetManager.tick(dt, renderer)
        postfx.render(scene, camera)
        requestAnimationFrame(animate)
      }
      animate()
    }

    init()

    return () => {
      disposed = true
      rendererRef.current?.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ background: 'var(--bg)' }}
    />
  )
}
```

### MM.3.2 ビューポートツールバー（拡張）

```
[移動] [回転] [スケール] | [FPS内覧] [AR] | [AI] | [📱モバイル] [⊞全画面]
                                                       ↑ NEW v5.0
```

**モバイルプレビューモード（NEW v5.0）**:

```typescript
// viewport/MobilePreviewFrame.tsx

// ビューポート中央に 390×844px (iPhone 15サイズ) のフレームを表示
// 内部は通常の3Dレンダリングだが:
// - FOV 自動調整（縦持ち 75° → 90°）
// - タッチ操作エミュレーション（マウスドラッグ → スワイプ）
// - Safari UI バー分の高さ調整（dvh）
// - SectionBeaconの動作確認モード

export function MobilePreviewFrame({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      {/* 背景暗転 */}
      <div className="absolute inset-0 bg-black/60" />
      {/* デバイスフレーム */}
      <div
        className="relative pointer-events-auto"
        style={{
          width: 390 * 0.65,     // 65%スケールで表示
          height: 844 * 0.65,
          border: '2px solid rgba(255,255,255,0.15)',
          borderRadius: 40 * 0.65,
          overflow: 'hidden',
          boxShadow: '0 0 60px rgba(91,159,255,0.2)',
        }}
      >
        {/* 実際のビューポートをiframe的に縮小表示 */}
        <div
          style={{
            transform: `scale(${1/0.65})`,
            transformOrigin: 'top left',
            width: 390,
            height: 844,
          }}
        >
          {/* ViewportCanvas を内包 */}
        </div>
        {/* ノッチ装飾 */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-3 bg-black rounded-full" />
      </div>
    </div>
  )
}
```

### MM.3.3 Before/After スライダー（中古戸建て専用）

ビューポート内に常駐するが、`propertyType === 'preowned'` かつ `showBeforeAfter === true` の時のみ活性化。

```typescript
// viewport/BeforeAfterSlider.tsx

// setScissorTest方式（ADR-118準拠、ADR-162.1によりWebGPURenderer/WebGLRenderer両対応）
// - 左ドラッグでBefore比率調整
// - divider lineはアニメーション付き（pulse効果）
// - リノベスタイル選択UI（Nordic/Natural/Modern/Japanese）がビューポート下部に出現

export function BeforeAfterSliderOverlay() {
  const { showBeforeAfter, propertyType } = useEditorStore()
  if (!showBeforeAfter || propertyType !== 'preowned') return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* スライダーハンドル */}
      <div
        className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize"
        style={{ left: `${sliderX * 100}%`, width: 2 }}
      >
        <div className="absolute inset-0 bg-white/70" />
        {/* ハンドル */}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2
                        w-8 h-8 rounded-full bg-white shadow-lg
                        flex items-center justify-center">
          <span className="text-gray-700 text-xs font-bold">⟺</span>
        </div>
      </div>

      {/* Before / After ラベル */}
      <div className="absolute top-3 left-3 text-xs font-mono text-white/70">BEFORE</div>
      <div className="absolute top-3 right-3 text-xs font-mono text-white/70">AFTER</div>

      {/* リノベスタイル選択（下部） */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2
                      flex gap-2 pointer-events-auto">
        {(['nordic','natural','modern','japanese'] as const).map(style => (
          <button
            key={style}
            className={`px-3 py-1.5 rounded-full text-xs font-medium
                        border transition-all duration-200
                        ${activeStyle === style
                          ? 'bg-[var(--accent)] text-white border-transparent'
                          : 'bg-black/60 text-[var(--t2)] border-[var(--border)] hover:border-[var(--accent)]'
                        }`}
            onClick={() => applyRenovationStyle(style)}
          >
            {RENO_LABELS[style]}
          </button>
        ))}
      </div>
    </div>
  )
}

const RENO_LABELS = {
  nordic:   'Nordic',
  natural:  'Natural',
  modern:   'Modern',
  japanese: '和モダン',
}
```

### MM.3.4 LifetimeScene スイッチャー（モデルハウス専用）

```typescript
// viewport/LifetimeSceneSwitch.tsx

const SCENES: Array<{ id: LifetimeScene; icon: string; label: string; time: string }> = [
  { id: 'morning', icon: '🌅', label: '朝',  time: '7:00 am' },
  { id: 'noon',    icon: '☀️', label: '昼',  time: '12:00'   },
  { id: 'evening', icon: '🌆', label: '夕',  time: '17:00'   },
  { id: 'night',   icon: '🌙', label: '夜',  time: '21:00'   },
]

// ビューポート上部（タイトルバー直下）に横並びタブとして表示
// 選択時: RelightEngine.transitionTo(timePreset, 0.8)
//        + AnimatedSilhouettes の入れ替え
//        + タイムラインのプレイヘッドをリセット
```

---

## MM.4 左パネル — アセット・シーン管理 {#mm4}

### MM.4.1 タブ構成（v5.0 拡張）

```
[アセット] [シーン] [インポート] [テンプレート]
                               ↑ NEW v5.0
```

### MM.4.2 テンプレートタブ（NEW v5.0）

```
┌─────────────────────────────┐
│ TEMPLATES                   │
│                             │
│ [現在: 新築戸建て Standard] │
│                             │
│ ── 物件種別                  │
│ 🏢 マンション               │
│   ● Premium 夜景タワー      │
│   ○ Standard 中層          │
│                             │
│ 🏠 新築戸建て               │
│   ● Standard 朝の家族 ✓    │ ← 現在選択中
│   ○ Premium 庭付きラグジュア│
│                             │
│ 🌱 土地・分譲地              │
│   ● Standard 日照強調       │
│                             │
│ [+ カスタムテンプレートを保存]│
└─────────────────────────────┘
```

### MM.4.3 シーン階層ツリー（拡張）

v4.0の静的ツリーを**インタラクティブ**に置換:

```typescript
// left-panel/SceneTab.tsx

interface SceneNode {
  id:       string
  type:     'root' | 'terrain' | 'splat' | 'camera' | 'ai' | 'ar' | 'map' | 'analytics' | 'lights'
  name:     string
  depth:    number       // 0=root, 1=child, 2=grandchild
  status:   'ok' | 'warn' | 'error' | 'loading'
  visible:  boolean
  locked:   boolean
  children: SceneNode[]
}

// 各ノードの機能:
// - クリック: 選択 (右パネルに情報表示)
// - 目のアイコン: 表示/非表示トグル
// - 鍵アイコン: ロック/アンロック
// - ドラッグ: 親子関係の変更
// - 右クリック: コンテキストメニュー (複製/削除/名前変更)
// - 状態ドット: ok=green, warn=yellow, error=red, loading=pulse
```

---

## MM.5 右パネル — インスペクター（全タブ） {#mm5}

### MM.5.1 タブ構成（v5.0 拡張）

```
[変換] [素材] [AI] [地形] [スコア] [出力]
              ↑     ↑
           拡張    NEW v5.0
```

### MM.5.2 素材タブ（拡張 — PostFX追加）

```
┌────────────────────────────────┐
│ MATERIAL                       │
│                                │
│ レンダリングモード               │
│ [Gaussian Splat v] ▼           │
│                                │
│ ── PostFX プリセット           │
│ [warm_morning] ▼               │
│   none / fresh / cinematic /   │
│   vintage / luxury /           │
│   warm_morning / land_bright / │
│   renovation / golden_hour /   │
│   urban_night                  │
│   ※ 全10種。PostFXConfigSchema  │
│     のenumとしてここを正とする  │
│     (Part NN.8.1から参照)       │
│                                │
│ ── 詳細パラメータ               │
│ Bloom    [━━━━━━●──] 0.30       │
│ Vignette [━━━━●────] 0.25       │
│ Saturation[━━━━━●──] 1.10       │
│ Temperature[━●──────] +200K    │
│ Contrast  [━━━●────] 1.05       │
│                                │
│ ── HDRI 照明                    │
│ 強度 [━━━━━●──] 1.2            │
│                                │
│ ── 4DGS 季節                    │
│ 季節変化 [ON ●───OFF]          │
│ [春] [夏●] [秋] [冬]           │
│                                │
│ ── ポストプロセス               │
│ Bloom [ON] SSAO [ON]           │
│ Tonemapping [ON]               │
│                                │
│ ── LangSplat セマンティック     │
│ セマンティックタグ [ON]         │
│ SegFormer-B0 WASM [ON]         │
└────────────────────────────────┘
```

### MM.5.3 地形タブ（NEW v5.0 — PLATEAU設定）

```
┌────────────────────────────────┐
│ TERRAIN  [Luxuryグレードのみ]  │
│                                │
│ PLATEAU 周辺環境                │
│ 有効化 [OFF ●───ON]            │
│                                │
│ 物件座標                        │
│ 緯度  [35.6762    ]            │
│ 経度  [139.6503   ]            │
│ 取得半径 [500m ▼]              │
│                                │
│ LOD設定                        │
│ [LOD1: 外形のみ●] [LOD2: 屋根形]│
│                                │
│ ── 周辺施設 オーバーレイ         │
│ 駅・鉄道 [ON]                  │
│ 学校・教育 [ON]                │
│ 医療・病院 [ON]                │
│ 商業施設 [ON]                  │
│ 公園・緑地 [ON]                │
│                                │
│ ── 夜景設定                    │
│ 窓発光率 [━━━━━●──] 0.70       │
│ 発光カラー [□ #fff8e7]         │
│                                │
│ [PLATEAUデータを更新]          │
│                                │
│ ╔══════════════════════╗      │
│ ║⚠️ Luxury グレードの   ║      │
│ ║   オプションです       ║      │
│ ║   (+¥50,000)         ║      │
│ ╚══════════════════════╝      │
└────────────────────────────────┘
```

### MM.5.4 スコアタブ（動的計算版）

v4.0の静的100点表示を**ScoreEngine**による動的計算に換装。

```typescript
// right-panel/ScoreTab.tsx

// ScoreEngine が以下の項目を動的評価:

interface ScoreBreakdown {
  quality3d:     ScoreItem   // 3D品質（素材有無・SPZ4解像度・LOD設定）
  aiAccuracy:    ScoreItem   // AI応答精度（FAQ生成済み・RAG設定）
  seo:           ScoreItem   // SEO（title・description・構造化データ）
  legal:         ScoreItem   // 法規制（宅建業法免責文・AI画像ラベル）
  mobile:        ScoreItem   // モバイル（LCP・CLS・INP 推定値）
  cvOptimization: ScoreItem  // CV率（CTAタイミング・CTA3種・exit intent）
  // NEW v5.0 追加項目:
  emotionCurve:  ScoreItem   // 感情曲線設計（クライマックス設定・ピークタイミング）
  assetCompleteness: ScoreItem  // 素材充足（SPZ4/GLB/間取り/ドローン）
}

interface ScoreItem {
  score:    number      // 0〜満点
  maxScore: number      // 満点
  label:    string
  issues:   string[]    // 改善提案
}

// スコア計算は以下のタイミングで自動実行:
// - 物件種別切替時
// - グレード変更時
// - アセット追加/削除時
// - PostFX設定変更時
// - CTAマーカー追加時
// - FAQ生成完了時

// 改善提案はAIチップとしてスコアタブ下部に表示
```

### MM.5.5 出力タブ（拡張 — グレード選択追加）

```
┌────────────────────────────────┐
│ EXPORT                         │
│                                │
│ グレード ← NEW v5.0            │
│ [Basic3D] [Standard●] [Premium] [Luxury]│
│                                │
│ エクスポート形式                 │
│ [LP (Next.js 15 + WebGPU) ▼]  │
│                                │
│ [プレビュー サムネイル]         │
│                                │
│ [🚀 LP を公開 ↗] ← Primary    │
│ [↓ Scene JSON 保存]            │
│ [🔮 visionOS USDZ]             │
│ [📹 シネマティック動画生成]     │
│ [📊 SNSサムネイルセット]        │
│                                │
│ ── セキュリティ                 │
│ ✓ Terser 難読化: ON            │
│ ✓ sourcemap: OFF               │
│ ✓ R2 署名付き URL              │
│ ✓ 宅建業法免責文: 付与済み      │
│ ✓ AI画像ラベル: ON             │
└────────────────────────────────┘
```

---

## MM.6 タイムライン — 感情曲線エディタ {#mm6}

### MM.6.1 トラック構成（v5.0 拡張）

```
TIMELINE (164px)
┌───────────────────────────────────────────────────────┐
│ ▶ ⏮ ⏭ ◉  [0.00 / 8.00s]  [8秒] [GSAP 4]           │
├────────────┬──────────────────────────────────────────┤
│            │ 0s    1s    2s    3s    4s    5s    6s   │
│ 感情曲線   │  ～～～～⬆️⬆️━━━⬇️～～⬆️⬆️⬆️━━★      │ ← NEW v5.0
│ カメラパス │ ●─────────◆──────────◆──────────●       │
│ Gaussian  │    ╔══════════════════════════╗          │
│ HDRI 照明  │ ══════════════════════════════════      │
│ AI CTA    │                    ╔═════════╗★          │ ← CTAマーカー
│ 字幕/SEO  │ ══╗     ══╗    ══╗                      │
└────────────┴──────────────────────────────────────────┘

★ = CTAマーカー（ピンク） ← ドラッグで感情ピークタイミングに配置
```

### MM.6.2 感情曲線レイヤー（NEW v5.0）

```typescript
// timeline/EmotionCurveTrack.tsx

// 感情強度（0.0〜1.0）をSVGパスとして可視化
// 各セクションの「感情スコア」を縦軸、時間を横軸

// Part LL で定義した感情曲線テンプレートを初期値として使用:
// [0%]  世界観提示    → 感情0.3
// [15%] 緊張フェーズ  → 感情0.5（上昇中）
// [35%] クライマックス → 感情1.0（★ピーク = CTAポイント1）
// [60%] 探索フェーズ  → 感情0.7
// [85%] 共感フェーズ  → 感情0.9（★CTAポイント2）
// [100%] 完結       → 感情0.8（★CTAポイント3）

// SVGパスは Control Pointをドラッグで調整可能
// 調整するとScoreEngine.emotionCurveScore が再計算される

// カラーコーディング:
// 感情高(0.8-1.0): var(--accent)    ← ブルー
// 感情中(0.5-0.8): var(--accent3)   ← グリーン
// 感情低(0.0-0.5): var(--t3)        ← グレー
```

### MM.6.3 CTAマーカー（NEW v5.0）

```typescript
// timeline/CTAMarkers.tsx

// ピンクのダイヤ形マーカー（★）をタイムライン上に配置
// - ドラッグでタイミング調整
// - クリックでCTAタイプ選択（primary/secondary/tertiary）
// - CameraSystem.onPeak() のタイミングと自動同期

// マーカーをドロップした位置の感情曲線スコアが 0.8以上でないと
// ScoreEngine.cvOptimizationScore が減点される（GapG8の解決）
```

### MM.6.4 種別ごとのデフォルトタイムライン長

```typescript
const TEMPLATE_DURATION: Record<PropertyType, number> = {
  mansion:    10,    // 上昇シーン含む（Sec3スキップ可）
  newBuild:    8,    // テンプレート標準
  land:       12,    // 建築立ち上がりアニメ含む
  preowned:    9,    // Before/After切替時間含む
  modelHouse: 14,    // ライフタイム4シーン分
  landSingle:  7,    // コンパクト版
}
```

---

## MM.7 AI統合仕様（エディタ内 Claude） {#mm7}

### MM.7.1 AIコパイロット（AiCopilot.ts）

```typescript
// packages/editor-engine/AiCopilot.ts

export class AiCopilot {
  private model = 'claude-sonnet-4-6'

  // ── モード1: シーン解釈（Scene JSONを理解して文章化）
  async interpretScene(sceneJson: SceneConfig): Promise<string> {
    const prompt = `
あなたはSisliRの世界トップレベル不動産LPエキスパートです。
以下のScene JSONを解析し、このLPの感情的な体験を3文で説明してください。
物件種別: ${sceneJson.lpTemplate?.type}
照明: ${sceneJson.lpTemplate?.startTimePreset}
PostFX: ${sceneJson.lpTemplate?.postfxPreset}
Scene JSON（抜粋）: ${JSON.stringify(sceneJson.property)}
    `
    return await this.call(prompt)
  }

  // ── モード2: 改善提案（スコアを上げる具体的提案）
  async suggestImprovement(
    scoreBreakdown: ScoreBreakdown,
    propertyType: PropertyType
  ): Promise<AiSuggestion[]> {
    // ...
  }

  // ── モード3: コピー生成（セクション別コピーテキスト生成）
  async generateCopy(
    section: string,
    propertyType: PropertyType,
    propertyName: string
  ): Promise<string> {
    // ...
  }

  // ── モード4: FAQ生成（物件情報からFAQ自動生成）
  async generateFAQ(sceneJson: SceneConfig): Promise<FAQItem[]> {
    // ...
  }

  // ── モード5: SEO最適化（title・description・構造化データ生成）
  async optimizeSEO(sceneJson: SceneConfig): Promise<SEOConfig> {
    // ...
  }

  private async call(prompt: string): Promise<string> {
    const res = await fetch('/api/ai/copilot', {
      method: 'POST',
      body: JSON.stringify({ prompt, model: this.model }),
    })
    const data = await res.json()
    return data.content[0].text
  }
}
```

### MM.7.2 AI提案バー（NEW v5.0）

```
ビューポート下部（AIチャットの上）に常設:

╔══════════════════════════════════════════════════════╗
║ ✨ AI提案: 「感情ピーク（Sec2）のFOV演出がありません。  ║
║   LDK入室時に 60°→90°のFOV変化を追加すると CV率+12%  ║
║   が見込まれます。」  [今すぐ適用] [無視]             ║
╚══════════════════════════════════════════════════════╝
```

```typescript
// ai-panel/AiSuggestionBar.tsx

// ScoreEngineが低スコア項目を検出するたびに
// AiCopilot.suggestImprovement() を呼び出して提案を生成

// 「今すぐ適用」クリック時:
// CommandHistory.execute(new ApplyAiSuggestionCommand(suggestion))
// → undo可能な形でシーンに変更を適用
```

### MM.7.3 フロートAIチャット（拡張）

v4.0のチャットを以下に拡張:

```typescript
// ai-panel/AiFloatChat.tsx

// 拡張1: Scene JSONを「システムコンテキスト」として全ターンに自動付与
// → Claudeが常に現在のシーン状態を把握した上で回答

// 拡張2: ツール呼び出し形式の応答パース
// → 「天井高を強調して」→ JSON diff が返される → 自動適用

// 拡張3: チップ提案の動的生成
// → 物件種別・スコアブレイクダウンに応じたチップを動的生成

// 拡張4: 音声入力（AiVoiceButton）
// → Web Speech API → テキスト変換 → 送信

const SYSTEM_PROMPT = (sceneJson: SceneConfig) => `
あなたはSisliR LP Studioのエキスパートエディタアシスタントです。
現在のシーン状態:
  物件種別: ${sceneJson.lpTemplate?.type}
  グレード: ${sceneJson.lpTemplate?.gradeLevel}
  PostFX: ${sceneJson.lpTemplate?.postfxPreset}
  物件名: ${sceneJson.property?.name ?? '未設定'}

ユーザーの自然言語指示をScene JSON操作に変換してください。
変更がある場合は以下の形式でJSONを返してください:
{"action": "patch_scene", "patch": {...変更内容...}, "explanation": "...説明..."}

変更がなく説明のみの場合は通常テキストで返してください。
日本語で返答してください。
`
```

### MM.7.4 AIコパイロットのコスト管理（NEW v5.1）

> ADR-129（Scene JSON全体を毎ターン送信）はUX上正しい判断だが、
> トークンコストがPart OO.8（コスト管理画面）と接続されていなかったため、
> v5.1で以下のガードレールを追加する。

```typescript
// packages/editor-engine/AiCopilot.ts に追加

export class AiCopilot {
  // ── コスト制御（NEW v5.1）──
  // テナントプラン別の月次AI呼び出し上限（Part OO.8 LoopCostTrackerと連携）
  private static readonly MONTHLY_CALL_LIMITS: Record<TenantPlan, number> = {
    starter:    200,
    growth:     800,
    premium:    3000,
    enterprise: Infinity,
  }

  // 受注制作（トラックB）のAI呼び出しはorder.idに紐付けて individually 計測
  // → Part OO.8.1「受注ごとのAPI使用料・粗利計算」に反映
  async call(prompt: string, context: { tenantId: string; orderId?: string }): Promise<string> {
    const allowed = await LoopCostTracker.checkAndIncrement(context.tenantId, 'ai_copilot')
    if (!allowed) {
      // 上限到達時はグレースフルデグレード（MM.13.3 EditorErrorBoundaryと連携）
      throw new AiCopilotLimitExceededError(context.tenantId)
    }

    const res = await fetch('/api/ai/copilot', {
      method: 'POST',
      body: JSON.stringify({ prompt, model: this.model, ...context }),
    })
    const data = await res.json()

    // トークン使用量をPart OO.8のコスト管理データに記録
    await LoopCostTracker.recordUsage(context.tenantId, {
      feature: 'ai_copilot',
      orderId: context.orderId ?? null,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    })

    return data.content[0].text
  }
}

// UI側の挙動:
// - 上限に近づくと(残り10件)AiFloatChatにバナー表示
// - 上限到達時はAIチャット・AI提案バーを無効化し、
//   「今月のAI利用上限に達しました。プランをアップグレードすると継続利用できます」を表示
// - 受注制作中（master.sislir.comから開いた場合）は上限を適用しない（super_admin/staffはInfinity扱い）
```

---

## MM.8 物件種別テンプレート切替 {#mm8}

### MM.8.1 TemplateRegistry

```typescript
// packages/editor-engine/TemplateRegistry.ts

export class TemplateRegistry {
  private static templates: Map<PropertyType, TemplateConfig[]> = new Map([
    ['mansion',    [TEMPLATE_MANSION_STANDARD, TEMPLATE_MANSION_PREMIUM]],
    ['newBuild',   [TEMPLATE_HOUSE_NEW_STANDARD, TEMPLATE_HOUSE_NEW_PREMIUM]],
    ['land',       [TEMPLATE_LAND_STANDARD]],
    ['preowned',   [TEMPLATE_HOUSE_PREOWNED_STANDARD]],
    ['modelHouse', [TEMPLATE_MODELHOUSE_PREMIUM]],
    ['landSingle', [TEMPLATE_LAND_SINGLE_BASIC]],
  ])

  // 種別切替時の完全なシーン初期化
  static async load(
    type: PropertyType,
    gradeLevel: GradeLevel,
    existingPropertyData?: Partial<PropertyConfig>
  ): Promise<SceneConfig> {
    const templates = this.templates.get(type) ?? []
    const template = templates.find(t => t.gradeLevel === gradeLevel)
                  ?? templates[0]

    return {
      ...template.defaultScene,
      // 既存の物件情報は保持
      property: {
        ...template.defaultScene.property,
        ...existingPropertyData,
        propertyType: type,
      },
      lpTemplate: {
        type,
        gradeLevel,
        cameraPreset:    template.cameraPreset,
        startTimePreset: template.startTimePreset,
        postfxPreset:    template.postfxPreset,
      },
    }
  }
}
```

### MM.8.2 切替時のUI同期フロー

```
ユーザーが物件種別バーをクリック
  ↓
PropertyTypeBar.onChange(type)
  ↓
EditorStore.setPropertyType(type)
  ├─ TemplateRegistry.load(type, gradeLevel) → Scene JSON更新
  ├─ RelightEngine.transitionTo(TIME_PRESETS[type], 1.0s)
  ├─ PostFXEngine.setPreset(POSTFX_PRESETS[type])
  ├─ Timeline.setDuration(TEMPLATE_DURATION[type])
  ├─ 左パネル: Before/After, LifetimeSwitch の表示/非表示切替
  ├─ 右パネル: 地形タブのグレード警告表示
  ├─ AIチップの動的更新（種別に応じた提案）
  └─ ScoreEngine.recalc() → スコアリング再実行
```

---

## MM.9 リアルタイム品質スコアリング {#mm9}

### MM.9.1 ScoreEngine 実装

```typescript
// packages/editor-engine/ScoreEngine.ts

export class ScoreEngine {
  static compute(state: EditorState): ScoreBreakdown {
    return {
      quality3d:          this.score3D(state),          // 20点
      aiAccuracy:         this.scoreAI(state),           // 15点
      seo:                this.scoreSEO(state),           // 15点
      legal:              this.scoreLegal(state),         // 15点
      mobile:             this.scoreMobile(state),        // 10点
      cvOptimization:     this.scoreCV(state),            // 10点
      emotionCurve:       this.scoreEmotionCurve(state),  // 10点 ← NEW
      assetCompleteness:  this.scoreAssets(state),        // 5点  ← NEW
      // 合計: 100点
    }
  }

  private static score3D(state: EditorState): ScoreItem {
    let score = 0
    const issues: string[] = []

    if (state.sceneMode === 'splat')       score += 10
    else if (state.sceneMode === 'hybrid') score += 7
    else { score += 4; issues.push('SPZ4素材を追加すると+6点') }

    const spzQ = state.sceneJson.assets?.spzQuality
    if (spzQ === 'ultra')    score += 5
    else if (spzQ === 'premium') score += 4
    else if (spzQ === 'standard') { score += 2; issues.push('SPZ4をUltra品質にすると+3点') }

    if (state.sceneJson.lpTemplate?.enablePlateau) score += 5
    else if (state.gradeLevel === 'luxury') issues.push('PLATEAU設定が未有効 -5点リスク')

    return { score: Math.min(score, 20), maxScore: 20, label: '3D品質', issues }
  }

  private static scoreEmotionCurve(state: EditorState): ScoreItem {
    let score = 0
    const issues: string[] = []
    const tl = state.timelineState

    // CTAマーカーが感情ピーク(≥0.8)に配置されているか
    const ctaMarkers = tl.ctaMarkers ?? []
    if (ctaMarkers.length >= 1) score += 4
    else issues.push('感情ピークにCTAマーカーを配置してください')

    // クライマックスが全体の30〜40%に存在するか
    const peak = tl.emotionCurve.findIndex(v => v >= 0.95)
    const peakRatio = peak / tl.emotionCurve.length
    if (peakRatio >= 0.25 && peakRatio <= 0.45) score += 3
    else issues.push('クライマックス（感情最大値）を全体の30〜40%付近に配置してください')

    // 感情曲線がモノトーンでないか（変化量が0.3以上）
    const range = Math.max(...tl.emotionCurve) - Math.min(...tl.emotionCurve)
    if (range >= 0.5) score += 3
    else issues.push('感情の起伏を大きくしてください（差分0.5以上推奨）')

    return { score, maxScore: 10, label: '感情曲線', issues }
  }

  // ... 他の評価メソッド
}
```

---

## MM.10 エクスポートパイプライン {#mm10}

### MM.10.1 エクスポートフロー

```
[LP を公開 ↗] クリック
  ↓
ExportValidator.preCheck(state)
  ├─ Zod v4: Scene JSON スキーマ検証
  ├─ 法規制: 宅建業法免責文・AI画像ラベル確認
  ├─ アセット: 全R2 URLの到達性確認
  └─ スコア: 最低スコア（80点未満は警告）
  ↓
SceneSerializer.toDeployBundle(state)
  ├─ Scene JSON → Cloudflare R2 にアップロード
  ├─ Next.js 15 のISR revalidatePath
  └─ Terser難読化 + sourcemap OFF
  ↓
DeploymentAgent.deploy(bundle)
  ├─ Vercel / Cloudflare Pages へ Push
  └─ LP URL を生成して返却
  ↓
成功時: タイトルバーに「公開済み ✓ | URL: [コピー]」バナー
失敗時: 具体的なエラーメッセージ + AIによる修正提案
```

### MM.10.2 エクスポート形式別仕様

| 形式 | ファイル構成 | 対象グレード |
|------|------------|------------|
| LP (Next.js 15 WebGPU) | `apps/lp/[propertyId]/` | Standard〜Luxury |
| Static HTML | `index.html` + `assets/` | Basic3D |
| Scene JSON v10.0 | `scene.json` | 全グレード |
| visionOS 26 USDZ | `property.usdz` | Premium〜Luxury |
| シネマティック動画 | VideoGeneratorRouter連携 | Premium〜Luxury |
| SNSサムネイルセット | 7種PNG（Part K仕様） | Standard〜Luxury |

---

## MM.11 コラボレーション・履歴 {#mm11}

### MM.11.1 リアルタイムコラボ（Yjs CRDT）

```typescript
// Yjs Document は EditorStore と双方向同期
// Supabase Realtime を y-websocket ブリッジとして使用

// 競合解決:
// - 同一ノード同時編集 → Yjs CRDT が自動マージ
// - カメラパス同時編集 → 後勝ち（Last-Write-Wins）

// コラボレーターの存在表示:
// - タイトルバー右に最大4名のアバター
// - 編集中ノードに色付きオーバーレイ
// - カーソル位置をビューポートに表示
```

### MM.11.1.1 マスタースタッフのPresence表示（NEW v5.1・Part OOとの整合）

> Part OO.5.1のMasterEditorExtensionsは「全テナントのSceneを編集可能」と定義されているが、
> MM v5.0のYjs Presenceはテナント内ユーザー同士の協調を前提としており、
> マスタースタッフが同じSceneを開いた場合の挙動が未定義だった。v5.1で以下のルールを追加する。

```typescript
// packages/editor-engine/EditorStore.ts のCollaboratorInfoを拡張

interface CollaboratorInfo {
  id:       string
  name:     string
  color:    string
  cursor:   { x: number; y: number } | null
  // NEW v5.1
  source:   'tenant' | 'master_staff'
  // master_staffの場合、テナント側UIでの表示方法を制御
  visibleToTenant: boolean
}

// ルール:
// 1. マスタースタッフ（apps/master経由）がSceneを開いた場合、
//    source: 'master_staff' としてYjs Awarenessに登録する
// 2. visibleToTenant のデフォルトは true。
//    アバター表示名は「SisliR スタッフ」（個人名は出さない）
// 3. テナント側がそのSceneを同時に開いている場合のみアバターが表示される。
//    3DLP編集中（受注制作トラックB）はテナント側に編集権限がないため
//    （Part PP ADR-152）、通常は同時編集の競合は発生しない
// 4. マスタースタッフの編集操作も master_audit_logs に記録される（Part OO ADR-150）
//    → CommandHistoryのdescribe()文字列をそのままaudit logのmetadataに転記
```

### MM.11.1.2 シンプルLPエディタとの関係（NEW v5.1・Part PPとの整合）

> Part PP.3.2のシンプルLPエディタは「Part MMのサブセット」と記載されているが、
> MobilePreviewFrame（MM.3.2）の再利用可否が未定義だった。v5.1で明確化する。

```typescript
// シンプルLPエディタ（テナント向け）は以下のMM v5.0コンポーネントを共有利用する:
//   - MobilePreviewFrame.tsx（スマホ/PC切替プレビュー、MM.3.2）
//   - AiFloatChat.tsx（コピー生成・FAQ生成、MM.7.3。AIコスト管理はMM.7.4適用）
//
// 共有しないコンポーネント（Part PP.8.2 TENANT_EDITOR_CONFIGでhide指定）:
//   - ViewportCanvas.tsx（3Dビューポート）
//   - Timeline.tsx / EmotionCurveTrack.tsx / CTAMarkers.tsx
//   - TerrainTab.tsx（PLATEAU）
//   - LightingPresets.tsx / BeforeAfterSlider.tsx / LifetimeSceneSwitch.tsx
//
// MobilePreviewFrameは3Dビューポートに依存しない設計（MM.3.2参照）のため、
// シンプルLPエディタではレスポンシブHTMLプレビューをこのフレーム内に表示する形で再利用する
```

### MM.11.2 Undo/Redo（Command Pattern）

```typescript
// packages/editor-engine/CommandHistory.ts

export abstract class EditorCommand {
  abstract execute(store: EditorStore): void
  abstract undo(store: EditorStore): void
  abstract describe(): string
}

export class MoveNodeCommand extends EditorCommand {
  constructor(
    private nodeId: string,
    private from: THREE.Vector3,
    private to: THREE.Vector3
  ) { super() }

  execute(store: EditorStore) {
    store.updateNodePosition(this.nodeId, this.to)
  }
  undo(store: EditorStore) {
    store.updateNodePosition(this.nodeId, this.from)
  }
  describe() { return `ノード "${this.nodeId}" を移動` }
}

// ショートカット:
// Cmd+Z / Ctrl+Z: undo
// Cmd+Shift+Z / Ctrl+Y: redo
// 履歴は最大100ステップ（zundoのlimit設定）
```

---

## MM.12 パフォーマンス・アクセシビリティ {#mm12}

### MM.12.1 エディタ起動パフォーマンス目標

| 指標 | 目標値 |
|-----|-------|
| エディタ初期表示 (LCP) | < 1.5s |
| 3D Canvas 初回描画 | < 2.0s |
| 物件種別切替（照明遷移完了） | < 1.2s |
| AI提案生成（TTI） | < 3.0s |
| Scene JSON エクスポート | < 0.5s |

### MM.12.2 アクセシビリティ

```
必須対応:
  □ 全インタラクティブ要素に aria-label
  □ キーボードナビゲーション（Tab順序設計）
  □ スクリーンリーダー対応（3DビューポートにはSR-only説明文）
  □ フォーカス表示（--accent色のoutline）
  □ カラーコントラスト比 WCAG AA準拠（テキスト全般）

3D ビューポート専用:
  □ 「モーション低減」設定でアニメーション停止（prefers-reduced-motion）
  □ 3D操作のキーボード代替（矢印キーでカメラ移動）
```

### MM.12.3 エディタ内メモリ管理

```typescript
// GPUリソースの適切な解放

// ノード削除時:
// - THREE.Geometry.dispose()
// - THREE.Material.dispose()
// - THREE.Texture.dispose()

// シーン切替時:
// - 全アセットのDispose
// - GaussianSplatRenderer.clear()

// エディタ終了時（beforeunload）:
// - renderer.dispose()
// - Yjs document destroy
```

---

## MM.13 コンポーネント実装仕様 {#mm13}

### MM.13.1 デザインシステム継承ルール

```
v4.0 HTML から継承する CSS 変数を全コンポーネントで使用:

カラー:
  --bg / --panel / --border
  --accent / --accent2 / --accent3
  --t1 / --t2 / --t3 / --t4
  --warn / --ok / --err

コンポーネントパターン:
  .tile     → Tailwind: bg-[var(--panel)] border border-[var(--border)] rounded-lg
  .badge    → font-size:9px padding:2px 6px rounded
  .toggle   → 30×17px カスタムチェックボックス
  .finput   → bg-[rgba(255,255,255,0.04)] border-[var(--border)] rounded font-mono
  .section-label → font-size:9px font-weight:500 tracking-[0.1em] uppercase
```

### MM.13.2 WebGPU/WebGL2 フォールバック制御（ADR-162.1）

```typescript
// ViewportCanvas.tsx
// MM.3.1の通り、フェーズ0からWebGPURendererを標準とし、
// navigator.gpu非対応・adapter取得失敗時はWebGLRenderer（WebGL2）へ
// 自動フォールバックする（フェーズによる出し分けは行わない）。

const webGPUSupported = await checkWebGPU()

if (webGPUSupported) {
  // WebGPURenderer を使用（標準パス）
  // PostFXはTSLシェーダー版（PostFXEngine v2）を使用
} else {
  // WebGLRenderer（WebGL2）へ自動フォールバック
  // PostFXはTHREE.EffectComposer版を使用
  // フォールバック発生はテレメトリに記録するが、利用者への警告表示は行わない
}
```

### MM.13.3 エラーバウンダリ

```typescript
// EditorErrorBoundary.tsx

// 3Dエンジンクラッシュ時: キャンバスをリセットして再初期化
// Scene JSON破損時: 前回の有効状態に自動ロールバック
// AI API失敗時: グレースフルデグレード（チャット無効化 + 警告表示）
```

---

## MM.14 ADRログ {#mm14}

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-124 | v4.0のCSS変数体系をv5.0でも完全継承 | v4.0の完成したビジュアルデザインが世界トップ水準。リデザインはリスクのみ | 全面リデザイン |
| ADR-125 | Zustand + zundo でUndo/Redo実装 | Command Patternの手動実装より軽量かつ確実。temporal middlewareが1行で履歴管理を提供 | Redux + 手動Command |
| ADR-126 | 物件種別切替バーをタイトルバー直下に独立配置 | 種別は全ての編集操作の前提条件。左パネルに埋めると認識性が低下 | 左パネル内セレクター |
| ADR-127 | 感情曲線レイヤーをタイムラインの最上段に配置 | 感情曲線がLP品質の核心。カメラパスより上位概念として視覚的に表現 | 右パネルのグラフ |
| ADR-128 | CTAマーカーはドラッグ配置方式（感情曲線連動） | 「感情ピーク=CTAタイミング」という設計原則をエディタUIで強制 | 時間入力フォーム |
| ADR-129 | AiCopilotはScene JSON全体を毎ターンのコンテキストとして送信 | Claudeがシーン状態を把握しないと的外れな提案になる。トークンコストよりUX優先 | 最小限コンテキスト |
| ADR-130 | ScoreEngineはクライアントサイドで同期計算 | リアルタイムフィードバックに必要。API呼び出しでは遅延が生じる | サーバーサイド計算 |
| ADR-131 | Yjs CRDT + Supabase Realtimeブリッジ（専用WSサーバー不要） | Supabase Realtimeを既に使用しているため追加インフラ不要 | 専用 y-websocket サーバー |
| ADR-132 | モバイルプレビューフレームはビューポート内 overlay | 別タブ/別ウィンドウより実際のシーン状態との同期が容易 | 別ウィンドウ |
| ADR-133 | エクスポート前のZod v4スキーマ検証を必須化 | 破損したScene JSONで公開されることを構造的に防止 | 任意チェック |
| ADR-134 | AI提案バーの「今すぐ適用」はCommandHistoryを経由 | AI適用操作もundo可能にする。誤適用からの即座の回復を保証 | 直接Store更新 |
| ADR-135 | 地形タブはLuxuryグレード以外では警告表示のみ（機能は有効） | 設定できるが課金なしでは本番に反映されない旨を明示。UX摩擦を最小化 | Luxury以外でタブ非表示 |
| ADR-161 | EditorState.gradeLevelをPart OOのOrder.gradeと共通の`GradeLevel`型（'basic3d'|'standard'|'premium'|'luxury'）に統一 | MM v5.0は`'basic'`を使用しており、Part OOの受注テーブルとの間でgrade変換層が必要になっていた。共通型をpackages/sharedに置くことで変換層を不要にする | テナント側・マスター側でそれぞれ独自に変換マッピングを持つ |
| ADR-162 | ~~ViewportCanvasの実装例をWebGL2(WebGLRenderer)先行に変更し、WebGPURendererへの移行はフェーズ3で行う~~（v5.2でADR-162.1により撤回） | Part NN.9の実装優先順位（フェーズ0〜2はWebGL前提）とMM v5.0のコード例（WebGPU前提）が矛盾しており、Claude Codeがフェーズ0で動かない実装を書くリスクがあった | WebGPU実装を先に書き、フェーズ0〜2では未使用のまま放置する |
| ADR-162.1 | ViewportCanvasをWebGPURenderer標準・WebGL2自動フォールバック構成とし、フェーズ0から両対応で実装する（ADR-162を撤回） | 2026年6月時点でChrome/Edge/Safari/Firefoxの主要ブラウザがWebGPUを既定で出荷し、Three.js r184のWebGPURendererも安定運用段階にある。「WebL2先行・WebGPUは後回し」という前提は実情に合わなくなった。フォールバック判定はnavigator.gpu + adapter取得成否で行う | WebGL2のみで実装し続け、WebGPU移行を別途プロジェクト化する |
| ADR-163 | AiCopilotの呼び出しにLoopCostTracker連携のコストガードを追加し、テナントプラン別の月次上限を設定 | ADR-129で「Scene JSON全体を毎ターン送信」と決めたが、トークンコストがPart OO.8のコスト管理と接続されておらず、受注制作の粗利を圧迫するリスクがあった | コストガードなしで運用し、月次決算で事後対応する |

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|----------|------|--------|
| v1.0 | 2026-06-12 | 初版作成。sislir_lp_editor_v4_100point.html の Gap分析を行い、v5.0エディタの完全仕様を定義。Part KK・Part LLとの整合性を確保 |
| v1.1 | 2026-06-12 | ADR-161〜163追加。gradeLevelをPart OOのOrder.gradeと統一（'basic'→'basic3d'）。PostFXプリセットを10種で確定しPart NN v1.1と整合。ViewportCanvasをWebGL2先行の実装例に変更（WebGPUはフェーズ3）。AiCopilotにコスト管理(MM.7.4)を追加。Yjs PresenceにマスタースタッフのPresence表示ルール(MM.11.1.1)を追加。シンプルLPエディタとの共有コンポーネント範囲(MM.11.1.2)を明記 |
| v1.2 (v5.2) | 2026-06-13 | ADR-162を撤回しADR-162.1で上書き。主要4ブラウザのWebGPU既定出荷とThree.js r184 WebGPURendererの安定化を踏まえ、ViewportCanvasをWebGPURenderer標準・WebGL2自動フォールバック構成に変更（MM.3.1）。MM.0.3・MM.1.1・MM.1.3の「WebGL2、フェーズ3でWebGPU移行」表記を修正。Part NN v1.2との整合を取った |
| v1.3 (v5.3) | 2026-06-13 | AIモデル文字列を最新版に更新（claude-sonnet-4-6 / claude-haiku-4-5）。voyage-3 → voyage-3-large に更新。依存設計書の参照を完全設計書v10.2・Part OO v1.1に更新 |
