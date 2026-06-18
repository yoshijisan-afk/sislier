---

## Part GG — ポータル自動入力 Chrome拡張機能設計（v10.1追加） {#part-gg}

### GG.1 設計思想

```
目標:
  CSV手作業コピペ（15〜30分）を
  「ボタン1クリック + 担当者目視確認 + 送信」（30秒）に短縮する

原則:
  ① 最終送信は必ず人間が行う（ADR-070準拠）
  ② Scene JSON v10.0 が唯一のデータソース（Asset First原則）
  ③ SUUMOのUI変更に強い設計（セレクタを設定ファイルで管理）
  ④ 自動入力したフィールドは視覚的に明示する（誤入力防止）

法的位置づけ:
  本拡張機能は「フォームへの自動入力補助ツール」であり
  SUUMOへの自動送信・スクレイピングは行わない。
  最終的な送信操作は必ず担当者が手動で行う。
  実装前に媒介契約の約款・利用規約を法務確認すること（ADR-106）。
```

### GG.2 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  SisliR ダッシュボード（Next.js）                         │
│  「SUUMOに入力」ボタン → chrome.runtime.sendMessage()    │
└────────────────────────┬────────────────────────────────┘
                         │ postMessage / chrome.storage
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Chrome拡張機能                                          │
│                                                         │
│  popup.html          ── 物件選択・ポータル選択UI          │
│  background.js       ── タブ管理・メッセージルーティング  │
│  content/suumo.js    ── SUUMO入稿画面へのDOM操作         │
│  content/homes.js    ── HOME'S入稿画面へのDOM操作        │
│  content/athome.js   ── アットホーム入稿画面へのDOM操作  │
│  field-map.json      ── ポータル別フィールドセレクタ定義  │
└────────────────────────┬────────────────────────────────┘
                         │ DOM操作（入力のみ・送信しない）
                         ▼
┌─────────────────────────────────────────────────────────┐
│  ポータル入稿画面（SUUMO / HOME'S / アットホーム）        │
│  → フィールドが黄色ハイライトで自動入力される             │
│  → 担当者が目視確認                                      │
│  → 担当者が手動で「登録」ボタンを押す                     │
└─────────────────────────────────────────────────────────┘
```

### GG.3 ファイル構成

```
sisliR-portal-extension/
├── manifest.json               Chrome拡張マニフェスト（MV3）
├── popup/
│   ├── popup.html              拡張アイコンクリック時のUI
│   └── popup.js                物件選択・実行ロジック
├── background/
│   └── background.js           Service Worker・タブ管理
├── content/
│   ├── content.js              全ポータル共通の入力ロジック
│   └── content.css             自動入力フィールドのハイライトCSS
├── field-maps/
│   ├── suumo.json              SUUMOフィールドセレクタ定義
│   ├── homes.json              HOME'Sフィールドセレクタ定義
│   └── athome.json             アットホームフィールドセレクタ定義
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### GG.4 manifest.json

```json
{
  "manifest_version": 3,
  "name": "SisliR ポータル自動入力",
  "version": "1.0.0",
  "description": "SisliRの物件データをSUUMO・HOME'S・アットホームの入稿画面に自動入力します",
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon":  "icons/icon48.png"
  },
  "background": {
    "service_worker": "background/background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.suumo.jp/*",
        "https://*.homes.co.jp/*",
        "https://*.athome.co.jp/*"
      ],
      "js":     ["content/content.js"],
      "css":    ["content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "permissions":      ["activeTab", "storage", "tabs"],
  "host_permissions": [
    "https://*.suumo.jp/*",
    "https://*.homes.co.jp/*",
    "https://*.athome.co.jp/*"
  ]
}
```

### GG.5 フィールドマップ設計（field-maps/suumo.json）

```json
{
  "portal": "suumo",
  "version": "2026-06",
  "comment": "SUUMOのUI変更時はここのセレクタのみ更新する",
  "urlPattern": "https://*.suumo.jp/*/nyusho/*",
  "fields": {
    "name":          { "selector": "#bukken_name",       "type": "input" },
    "price":         { "selector": "#kakaku",            "type": "input",  "transform": "manToYen" },
    "address":       { "selector": "#shozaichi",         "type": "input" },
    "layout":        { "selector": "#madori",            "type": "select" },
    "landArea":      { "selector": "#tochi_menseki",     "type": "input" },
    "buildingArea":  { "selector": "#tatemo_menseki",    "type": "input" },
    "access":        { "selector": "#kotsu",             "type": "input" },
    "catchCopy":     { "selector": "#catch_copy",        "type": "input",  "maxLength": 40 },
    "description":   { "selector": "#setsumei_bun",      "type": "textarea","maxLength": 500 },
    "agencyName":    { "selector": "#kaisha_name",       "type": "input" },
    "realtorLicense":{ "selector": "#menkyobangou",      "type": "input" }
  },
  "transforms": {
    "manToYen": "value => Math.floor(value / 10000)"
  }
}
```

### GG.6 content.js（全ポータル共通の入力ロジック）

```javascript
// content/content.js
// chrome.runtime.onMessage で物件データを受け取り、
// field-mapに従ってフォームに入力する

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'SISLIР_FILL') return

  const { property, fieldMap } = msg

  const results = { filled: [], skipped: [], errors: [] }

  for (const [fieldKey, fieldDef] of Object.entries(fieldMap.fields)) {
    const el    = document.querySelector(fieldDef.selector)
    const value = resolveValue(property, fieldKey, fieldDef)

    if (!el) {
      results.skipped.push({ field: fieldKey, reason: 'selector_not_found' })
      continue
    }
    if (value === null || value === undefined) {
      results.skipped.push({ field: fieldKey, reason: 'no_value' })
      continue
    }

    try {
      fillField(el, fieldDef.type, String(value), fieldDef.maxLength)
      highlightField(el)
      results.filled.push(fieldKey)
    } catch (e) {
      results.errors.push({ field: fieldKey, error: e.message })
    }
  }

  // 結果サマリーをページ上部にトースト表示
  showToast(results)
  sendResponse(results)
})

// ── フィールド値の解決 ────────────────────────────────────────
function resolveValue(property, fieldKey, fieldDef) {
  const raw = property[fieldKey]
  if (raw === null || raw === undefined) return null

  // transform適用（例: 万→円変換）
  if (fieldDef.transform === 'manToYen') {
    return Math.floor(raw / 10000)
  }
  return raw
}

// ── フィールドへの入力（React管理フォーム対応）────────────────
// SUUMOはReact管理のフォームの場合があり
// element.value = x だけでは onChange が発火しない。
// NativeInputValueSetter を使って強制的に発火させる。
function fillField(el, type, value, maxLength) {
  const trimmed = maxLength ? value.slice(0, maxLength) : value

  if (type === 'select') {
    // <select> の場合: option の text or value が一致するものを選択
    const options = Array.from(el.options)
    const match   = options.find(o => o.text === trimmed || o.value === trimmed)
    if (match) {
      el.value = match.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return
  }

  // input / textarea: React対応
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, trimmed)
  } else {
    el.value = trimmed
  }

  el.dispatchEvent(new Event('input',  { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// ── 入力済みフィールドをハイライト ───────────────────────────
function highlightField(el) {
  el.setAttribute('data-sisliR-filled', 'true')
  // CSSクラスでスタイリング（content.css参照）
  el.classList.add('sisliR-filled')
}

// ── 結果トースト ──────────────────────────────────────────────
function showToast({ filled, skipped, errors }) {
  const existing = document.getElementById('sisliR-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'sisliR-toast'
  toast.innerHTML = `
    <div class="sisliR-toast-header">
      <img src="${chrome.runtime.getURL('icons/icon16.png')}" />
      <strong>SisliR 自動入力完了</strong>
    </div>
    <div class="sisliR-toast-body">
      ✅ 入力済み: ${filled.length}項目<br>
      ⚠️ スキップ: ${skipped.length}項目<br>
      ${errors.length > 0 ? `❌ エラー: ${errors.length}項目<br>` : ''}
      <hr>
      内容を確認して「登録」ボタンを押してください。
    </div>
    <button class="sisliR-toast-close" onclick="this.parentElement.remove()">×</button>
  `
  document.body.appendChild(toast)

  // 30秒後に自動消去
  setTimeout(() => toast.remove(), 30000)
}
```

### GG.7 content.css（ハイライトスタイル）

```css
/* content/content.css */

/* 自動入力されたフィールド */
.sisliR-filled {
  background-color: #fffde7 !important;
  border: 2px solid #f9a825 !important;
  transition: background-color 0.3s ease;
}

/* トースト通知 */
#sisliR-toast {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 999999;
  width: 280px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-left: 4px solid #1976d2;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  padding: 12px 16px;
  font-family: 'Noto Sans JP', sans-serif;
  font-size: 13px;
  line-height: 1.6;
}

.sisliR-toast-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #1976d2;
}

.sisliR-toast-body {
  color: #333;
}

.sisliR-toast-body hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 8px 0;
}

.sisliR-toast-close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: #999;
}
```

### GG.8 background.js（Service Worker）

```javascript
// background/background.js
// ポップアップ → コンテンツスクリプトへのメッセージ中継

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'POPUP_FILL_REQUEST') return

  // 現在アクティブなタブにfillメッセージを送信
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    // ポータルを判定してfield-mapを選択
    const portal   = detectPortal(tab.url)
    const fieldMap = await loadFieldMap(portal)

    if (!fieldMap) {
      sendResponse({ error: `未対応のURL: ${tab.url}` })
      return
    }

    const result = await chrome.tabs.sendMessage(tab.id, {
      type:     'SISLIР_FILL',
      property: msg.property,
      fieldMap,
    })
    sendResponse(result)
  })

  return true  // 非同期レスポンスのためtrueを返す
})

function detectPortal(url) {
  if (url.includes('suumo.jp'))   return 'suumo'
  if (url.includes('homes.co.jp'))return 'homes'
  if (url.includes('athome.co.jp'))return 'athome'
  return null
}

async function loadFieldMap(portal) {
  if (!portal) return null
  const url  = chrome.runtime.getURL(`field-maps/${portal}.json`)
  const resp = await fetch(url)
  return resp.json()
}
```

### GG.9 popup.html / popup.js（拡張アイコンクリック時のUI）

```html
<!-- popup/popup.html -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 320px; font-family: 'Noto Sans JP', sans-serif;
           font-size: 13px; padding: 16px; color: #333; }
    h1   { font-size: 15px; color: #1976d2; margin: 0 0 12px; }
    select, input { width: 100%; padding: 6px 8px; margin-bottom: 8px;
                    border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button.primary { width: 100%; padding: 10px; background: #1976d2;
                     color: #fff; border: none; border-radius: 4px;
                     font-size: 14px; cursor: pointer; }
    button.primary:hover { background: #1565c0; }
    .status { margin-top: 10px; font-size: 12px; color: #666; text-align: center; }
    .warning { background: #fff8e1; border: 1px solid #f9a825;
               border-radius: 4px; padding: 8px; font-size: 12px;
               margin-top: 10px; color: #795548; }
  </style>
</head>
<body>
  <h1>🏠 SisliR 自動入力</h1>

  <label>SisliR URL（ダッシュボードのAPI）</label>
  <input type="text" id="apiUrl" placeholder="https://your-sisliR.vercel.app" />

  <label>物件を選択</label>
  <select id="propertySelect">
    <option value="">── 物件を読み込み中 ──</option>
  </select>

  <button class="primary" id="fillBtn">このページに自動入力する</button>

  <div class="warning">
    ⚠️ 自動入力後は必ず内容を確認し、<br>
    「登録」ボタンは手動で押してください。
  </div>

  <div class="status" id="status"></div>

  <script src="popup.js"></script>
</body>
</html>
```

```javascript
// popup/popup.js

const apiUrlInput     = document.getElementById('apiUrl')
const propertySelect  = document.getElementById('propertySelect')
const fillBtn         = document.getElementById('fillBtn')
const statusEl        = document.getElementById('status')

// ── 保存済みAPIのURLを復元 ────────────────────────────────────
chrome.storage.local.get(['sisliRApiUrl'], ({ sisliRApiUrl }) => {
  if (sisliRApiUrl) {
    apiUrlInput.value = sisliRApiUrl
    loadProperties(sisliRApiUrl)
  }
})

apiUrlInput.addEventListener('change', () => {
  const url = apiUrlInput.value.trim()
  chrome.storage.local.set({ sisliRApiUrl: url })
  loadProperties(url)
})

// ── SisliR APIから物件一覧を取得 ──────────────────────────────
async function loadProperties(baseUrl) {
  if (!baseUrl) return
  statusEl.textContent = '物件を読み込み中...'
  try {
    const resp = await fetch(`${baseUrl}/api/extension/properties`, {
      headers: { 'X-Extension-Token': await getToken() }
    })
    const { properties } = await resp.json()

    propertySelect.innerHTML = '<option value="">── 物件を選択 ──</option>'
    for (const p of properties) {
      const opt = document.createElement('option')
      opt.value       = p.id
      opt.textContent = `${p.name}（${p.address}）`
      propertySelect.appendChild(opt)
    }
    statusEl.textContent = `${properties.length}件の物件を取得しました`
  } catch (e) {
    statusEl.textContent = `❌ 取得失敗: ${e.message}`
  }
}

// ── 自動入力実行 ──────────────────────────────────────────────
fillBtn.addEventListener('click', async () => {
  const propertyId = propertySelect.value
  if (!propertyId) { statusEl.textContent = '物件を選択してください'; return }

  statusEl.textContent = '物件データを取得中...'

  try {
    const baseUrl = apiUrlInput.value.trim()
    const resp    = await fetch(`${baseUrl}/api/extension/property/${propertyId}`, {
      headers: { 'X-Extension-Token': await getToken() }
    })
    const { property } = await resp.json()

    // background.js 経由でcontent.jsにメッセージ送信
    const result = await chrome.runtime.sendMessage({
      type: 'POPUP_FILL_REQUEST',
      property,
    })

    if (result?.error) {
      statusEl.textContent = `❌ ${result.error}`
    } else {
      statusEl.textContent =
        `✅ ${result?.filled?.length ?? 0}項目を入力しました`
    }
  } catch (e) {
    statusEl.textContent = `❌ エラー: ${e.message}`
  }
})

async function getToken() {
  const { extensionToken } = await chrome.storage.local.get(['extensionToken'])
  return extensionToken ?? ''
}
```

### GG.10 SisliR側APIエンドポイント（Next.js）

```typescript
// app/api/extension/properties/route.ts
// Chrome拡張機能専用の物件一覧取得API

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // 拡張機能トークン認証（Supabase Auth JWTとは別に設ける）
  const token = req.headers.get('X-Extension-Token')
  const tenantId = await verifyExtensionToken(token)
  if (!tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ properties })
}
```

```typescript
// app/api/extension/property/[id]/route.ts
// 拡張機能用: Scene JSONから入力用プロパティデータを返す

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token    = req.headers.get('X-Extension-Token')
  const tenantId = await verifyExtensionToken(token)
  if (!tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: scene } = await supabase
    .from('scenes')
    .select('scene_json')
    .eq('property_id', params.id)
    .single()

  // 拡張機能に必要なフィールドのみ返す（Scene JSON全体は不要）
  const p = scene.scene_json.property
  return NextResponse.json({
    property: {
      name:           p.name,
      price:          p.price,
      address:        p.address,
      layout:         p.layout,
      landArea:       p.landArea,
      buildingArea:   p.buildingArea,
      access:         p.access,
      catchCopy:      p.catchCopy,
      description:    p.description,
      agencyName:     p.agencyName,
      realtorLicense: p.realtorLicense,
      builtYear:      p.builtYear,
      structure:      p.structure,
    }
  })
}
```

### GG.11 SUUMOのUI変更への対応方針

```
課題:
  ポータルのUIは予告なく変更される。
  セレクタが変わると拡張機能が動かなくなる。

対策（3層）:

Layer 1: field-mapの外部化
  セレクタをJSONファイルに集約し、
  コード変更なしにセレクタのみ更新できる設計。
  → UI変更時の修正コスト: 5分以内

Layer 2: セレクタの多段フォールバック
  {
    "selector": "#bukken_name",          // 第1候補
    "fallbacks": [
      "[name='bukken_name']",            // 第2候補（name属性）
      "[data-field='property-name']",    // 第3候補（data属性）
      "input[placeholder='物件名']"      // 第4候補（placeholder）
    ]
  }

Layer 3: 未入力フィールドの可視化
  入力できなかったフィールドはポップアップに一覧表示。
  担当者が手動で補完できる状態にする。
  → 「完璧な自動化」より「確実な補助ツール」を優先。
```

### GG.12 対応ポータル拡張ロードマップ

| フェーズ | ポータル | 優先度 | 備考 |
|---------|---------|-------|------|
| v1.0 | SUUMO（売買・戸建て） | 最高 | 最大流通量 |
| v1.1 | HOME'S | 高 | SUUMO次点 |
| v1.2 | アットホーム | 高 | 中古物件に強い |
| v2.0 | SUUMO（土地・マンション） | 中 | 物件種別ごとにfield-map追加 |
| v2.1 | LIFULL Connect（API申請通過後） | 中 | Part Oを参照 |
| v3.0 | 独自ポータル（SisliR内製・Part Z参照）| 低 | 拡張機能不要（内製APIで直接入力） |

### GG.13 ADR-106（法的確認）

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-106 | ポータル自動入力は「フォーム補助」に限定し最終送信は人間が行う | SUUMOの利用規約では自動送信・スクレイピングが禁止されている可能性がある。「補助ツール」として設計することで利用規約リスクを最小化。実装前に各ポータルの媒介契約約款・利用規約を法務確認すること | 全自動送信（規約リスク大）|
