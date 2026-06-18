---

> ⚠️ **一部DEPRECATED — FloorplanVLM関連のロードマップ・ADRはPart OO（ADR-144）で上書きされています**
>
> L177「FloorplanVLMライセンス確認」、L219「Week 13: FloorplanVLMパイプライン」、
> L271 ADR-057は、FloorplanVLMが商用ライセンス取得不可と判明したため廃止されました（ADR-144）。
> 間取り解析はClaude Vision単独パイプラインに移行済みです（Part OO.6参照）。
> ロードマップ・ADRの最新版はPart OO.13（ADRログ）を参照してください。
>
> 上記以外（セキュリティ・法規制・WAF設計）は引き続き有効です。

## Part N — セキュリティ・法規制・WAF防御 {#part-n}

### N.1 APIキーセキュリティ（ADR-019）

```
サーバーサイドのみ（絶対にクライアントに露出しない）:
  ANTHROPIC_API_KEY
  HIGGSFIELD_API_KEY
  RUNWAY_API_KEY              ← v10.0追加
  KLING_API_KEY               ← v10.0追加
  CLOUDFLARE_R2_ACCESS_KEY / SECRET_KEY
  SUPABASE_SERVICE_ROLE_KEY（旧形式）→ SUPABASE_SECRET_KEY（新形式）

クライアントサイド（公開可）:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  ← 旧anon_keyから移行（2026年Q4まで）
```

### N.2 宅建業法・景品表示法対応

```typescript
// 自動付与する法的表記
const LEGAL_COMPLIANCE = {
  aiDisclaimer:    '※本コンテンツはAIが生成しています。詳細は担当者にご確認ください。',
  priceDisclaimer: '※価格は変更になる場合があります。詳細はお問い合わせください。',
  forbidden: [
    '最高', '一番', '完璧', '絶対', '必ず', '激安', '格安', 'No.1',
    '確約', '最安値', '絶対に契約できる', '間違いない',
  ],
}

// チャットAI: 宅建業法準拠システムプロンプト
// - 取引態様・宅建業者番号の自動付与
// - 断定的表現の禁止（「必ず値上がりします」等）
// - 「担当者にお問い合わせください」へのフォールバック
// - AI生成コンテンツにはhumanReviewedフラグが必要
```

### N.3 個人情報保護法対応（2022年改正）

| 対応項目 | 実装 |
|----------|------|
| 行動ログ匿名化 | sessionIdをSHA-3（ソルト付き）でハッシュ化。生IDはDB保存しない（ADR-098） |
| リード個人情報 | anonymized_hashのみ保存。生氏名・電話番号はDB保存しない |
| 保持期間 | behavior_logs: 90日後に自動削除（expires_at + PostgreSQL cron） |
| AI生成コンテンツ | 全成果物末尾に「※AIが生成しています」を自動付与 |
| IPアドレス | behavior_logsには保存しない |
| 量子耐性暗号移行 | SHA-256 → SHA-3への移行計画（ADR-098・2027年Q2目標） |

### N.4 Cloudflare WAF設定

```
WAFルール:
  - DDoS防御
  - Bot管理
  - Rate Limiting（APIエンドポイント: 100req/min）
  - 地理的ブロック（必要に応じて）
  - R2バケット: GoogleクローラーのIPレンジを許可（VideoSitemap用・ADR-099）

CSP（Content Security Policy）:
  script-src  'self' cdn.jsdelivr.net
  img-src     'self' *.r2.cloudflarestorage.com data:
  connect-src 'self' *.supabase.co *.anthropic.com
  media-src   'self' *.r2.cloudflarestorage.com
```

### N.5 Supabase APIキー移行（必須・2026年Q4まで）

```bash
# 旧形式（廃止予定）
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 新形式（移行先）
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

---

## Part O — ポータル連動設計 {#part-o}

### O.1 現実的な連動戦略

| 手法 | Phase | 実装可否 |
|------|-------|---------|
| 入稿データCSV自動生成（担当者がコピペするだけ） | 1 | ✅ 即時実装可 |
| LP URL自動生成・SUUMO欄に貼付 | 1 | ✅ 即時実装可 |
| OGP最適化（SNSシェア時に3D LPプレビュー表示） | 1 | ✅ 即時実装可 |
| QRコード自動生成（チラシ・ポータル画像に埋め込み） | 1 | ✅ 即時実装可 |
| LIFULL Connect API連携（審査申請必要） | 2 | 🔍 審査中 |
| ONet（不動産流通標準XML）対応 | 2 | 🔍 設計済み |
| SUUMO直接API連携 | 永続不可 | ❌ API非公開 |

### O.2 SUUMOデータ自動生成フォーマット

```typescript
const SUUMO_FIELDS = {
  物件名:        property.name,
  所在地:        property.address,
  価格:          `${(property.price / 10000).toLocaleString()}万円`,
  土地面積:      `${property.landArea}㎡`,
  建物面積:      property.buildingArea ? `${property.buildingArea}㎡` : '',
  間取り:        property.layout,
  交通:          property.access,
  キャッチコピー: property.catchCopy,
  物件説明:      property.description,
  広告主:        property.agencyName,
  免許番号:      property.realtorLicense,
  物件詳細URL:   property.lpUrl,
}
```

---

## Part P — ビジネスモデル & プライシング {#part-p}

### P.1 SaaSプライシング

| プラン | 月額 | 物件数/月 | 主な機能 | ターゲット |
|--------|------|---------|---------|-----------|
| **Starter** | ¥29,800 | 3件 | 写真補正・CSV・LP・パンフ・サムネイル・SEO | 個人〜小規模 |
| **Growth** | ¥79,800 | 15件 | Starter + 動画・SNS・ホットスポット・反響計測・A/Bテスト | 中小規模 |
| **Premium** | ¥198,000 | 無制限 | Growth + シネマティック動画・自動改善ループ・IFCパイプライン | 中堅〜大手 |
| **Enterprise** | 要相談 | 無制限 | Premium + API連携・ホワイトラベル・専任CSM | 大手・チェーン |

### P.2 受注制作プライシング（トラックB）

| グレード | 価格 | 成果物 |
|---------|------|-------|
| Basic3D | ¥49,800 | Gaussian Splat LP + USDZ |
| Standard | ¥98,000 | Basic3D + シネマティック動画 + SNSサムネイルセット |
| Premium | ¥198,000 | Standard + ホットスポット + ツアー |
| Luxury | ¥398,000 | Premium + BIMデジタルツイン（IFC→OpenUSD）|

### P.3 コスト試算（月間・Growthプラン15件想定）

| コスト項目 | 単価 | 月間想定 | 金額 |
|-----------|------|---------|------|
| Claude API（Sonnet 4） | 約¥800/物件 | 15件 | ¥12,000 |
| Claude API（Haiku） | 約¥100/物件 | 15件 | ¥1,500 |
| Higgsfield クレジット | 約¥1,500/本 | 15本 | ¥22,500 |
| Cloudflare R2 ストレージ | ¥0.015/GB | 50GB | ¥750 |
| Cloudflare R2 エグレス | ¥0（無料） | — | ¥0 |
| Supabase（Pro） | — | 固定 | ¥7,500 |
| Cloudflare Workers | — | 固定 | ¥1,500 |
| Grafana Cloud | — | 固定 | ¥3,000 |
| **原価合計** | | | **≈¥49,000** |
| **Growth売上** | | | **¥79,800** |
| **粗利（1社あたり）** | | | **≈¥30,800（39%）** |

### P.4 損益分岐点

```
固定費（月額）:
  インフラ（Supabase/Cloudflare/Grafana）: 約  80,000円
  AI API費（Claude/voyage-3基本）:         約  50,000円
  Grafana Cloud可観測性:                   約  30,000円
  その他（ドメイン・メール等）:             約  20,000円
  合計:                                    約 180,000円

Phase 1目標:
  Starter×10 + Growth×5 + Premium×2 = MRR約140万円
  → 固定費回収後の利益: 約130万円/月（開発者1名・一人体制）
```

---

## Part Q — 実装ロードマップ {#part-q}

### Q.1 Phase 0（Week 0）: ブロッカー解消

| 作業 | 内容 | 期限 |
|------|------|------|
| FloorplanVLMライセンス確認 | Beike社への商用ライセンス問い合わせ。NG時はClaude Vision代替に切替 | Week 0 |
| Supabase APIキー移行 | 新形式（sb_publishable_xxx）に移行 | Week 0 |
| OpenCut MCP動作確認 | 実動作テスト・ツール一覧取得 | Week 0 |
| Higgsfield MCP動作確認 | クレジット単価・レート制限確認 | Week 0 |
| Runway Gen-4 API キー取得 | フォールバック用（ADR-090） | Week 0 |

### Q.2 Phase 1（Week 1〜4）: コア自動化

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 1 | MCPサーバー基底クラス / `mcp_sisliR_storage` / `mcp_sisliR_db` / pg-boss / Supabase Auth / OpenTelemetry初期設定 | 最高 |
| Week 2 | `mcp_sisliR_pdf` / `mcp_sisliR_image`（sharp）/ `mcp_sisliR_thumbnail` / CopyGenerator / QualityChecker | 最高 |
| Week 3 | `mcp_sisliR_portal` / `mcp_sisliR_lp` / `mcp_sisliR_seo` / `mcp_sisliR_doc`（Puppeteer） | 高 |
| Week 4 | PropertyIntakeAgent + べき等性ロジック / ダッシュボードUI / 完了通知メール / UTMパラメータ付与 | 高 |

**Phase 1完了定義（DoD）:**
- 写真→補正→SNSサムネイル→SEO→CSV→LP→パンフが30分以内に自動生成できる
- PropertyIntakeAgentが中断後に安全に再実行できる（べき等性マトリクス全Step確認）
- OpenTelemetryが全MCPサーバーのスパンを記録している
- 最初の顧客1社にデモできる状態

### Q.3 Phase 1.5（Week 5〜8）: 動画 + OpenUSD + 可観測性強化

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 5 | OpenCut MCP接続 / `mcp_sisliR_video`（スライドショー型）/ VideoGeneratorRouter（フォールバック完全実装） | 高 |
| Week 6 | CinematicPromptBuilder / VideoQualityScorer / Higgsfield MCP接続 / Runway Gen-4フォールバック確認 | 高 |
| Week 7 | `mcp_sisliR_usd` / IFC→USD変換 / USDZ書き出し / ArQuickLookButton | 高 |
| Week 8 | Grafana Cloud本格設定 / SLO/SLIダッシュボード / アラートルール設定 | 高 |

**Phase 1.5完了定義（DoD）:**
- 動画生成フォールバックが3段階で動作確認済み
- Grafana Cloudでトレース・メトリクス・ログが可視化されている
- SLO（LP生成成功率99.5%）の計測が開始されている

### Q.4 Phase 2（Week 9〜16）: Growth Loop + テスト強化

| Week | 実装内容 | 優先度 |
|------|---------|-------|
| Week 9〜10 | 反響計測基盤（UTM追跡・behavior_logs・leads）/ DynamicLP（広告軸別切替） | 高 |
| Week 11 | SectionBeacon（デバウンス付き・iOS Safari対応）/ A/Bテスト基盤 | 高 |
| Week 12 | ImprovementAgent / improvement_queue / 自動改善ループ | 中 |
| Week 13 | FloorplanVLMパイプライン / ProceduralMeshBuilder | 中 |
| Week 14 | テストスイート完成（Unit/Integration/E2E: Part AA参照） | 高 |
| Week 15〜16 | VideoSitemap / llms.txt / SOGストリーミング基盤（Phase 2用） | 中 |

### Q.5 Phase 3〜（2027〜）

```
仮想住宅展示場（出展料収益モデル）
独自不動産ポータル（掲載料）
Apple Vision Pro対応（USDZ拡張）
LIFULL Connect API連携（審査通過後）
Mapbox GL JS + PLATEAU 地域情報連携
BIM継続的デプロイ（USD差分更新）
量子耐性暗号完全移行（ADR-098）
Edge Function移行評価（Cloudflare Workers + DynamicLP）
```

---

## Part R — ADR完全ログ v10.0 {#part-r}

### R.1 既存ADR（ADR-001〜089）

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-001 | Three.js r184 WebGPUを採用 | 全ブラウザWebGPU対応確認済み | PlayCanvas Engine |
| ADR-002 | Niantic SPZ4を単体LP用フォーマットに採用 | PLYの90%削減・MIT | KSPLAT |
| ADR-003 | 内製Gaussian圧縮エンジン | 技術的モート形成 | SPZ4のみ |
| ADR-010 | @thatopen/web-ifc採用 | MIT・ブラウザ動作・BIM義務化対応 | IFC.js |
| ADR-013 | Supabase Auth採用（Clerk廃止） | 日本リージョン（ap-northeast-1）確実 | Clerk |
| ADR-019 | APIキーはサーバーサイドのみ | クライアント露出はセキュリティリスク | 直接クライアント利用 |
| ADR-025 | Genie 3不採用 | ゲーム向け・米国限定・不動産不適 | Genie 3採用 |
| ADR-035 | SuperSplatを社内QCツールとして採用 | MIT・ブラウザ完結・コストゼロ | 独自QCツール |
| ADR-036 | SOGを仮想展示場向けに追加採用（Phase 2） | Streamed LOD・10M+Gaussian対応 | SPZ4のみ |
| ADR-039 | HotspotEngine: Three.js Spriteで実装 | Raycaster + Canvas2D軽量実装 | CSS3DObject |
| ADR-040 | CameraTourEngine: GSAP 4 Timelineで実装 | 既存GSAP 4を最大活用 | Tween.js |
| ADR-041 | PostFXEngine: Three.js TSL + PostProcessing | ノードベース・プリセット切替容易 | three-stdlib |
| ADR-042 | フローター除去を3段階（自動→統計→手動） | QCスコア閾値0.75で手動介入最小化 | 全自動のみ |
| ADR-043 | プロダクトを「不動産マーケティング自動化」に再定義 | 3D特化より市場が広い | 3D特化継続 |
| ADR-044 | MCPサーバー自作（13サーバー構成） | 型安全・エラー管理一元化 | 既存MCP OSS |
| ADR-045 | PropertyIntakeAgent: claude-sonnet-4で実装 | 複雑タスク分解・品質判断が必要 | GPT-4o |
| ADR-046 | ジョブキュー: pg-boss 10.x | Redis不要・Supabase統合 | BullMQ |
| ADR-047 | 写真補正: sharp.js（サーバーサイド） | 安定・高速 | Cloudinary |
| ADR-048 | SUUMO連動: CSV自動生成 | API非公開。CSV自動生成で入稿5分に短縮 | 直接API |
| ADR-049 | パンフPDF: Puppeteer | デザイン自由度最高・日本語フォント対応 | WeasyPrint |
| ADR-050 | 3DコンテンツはオプションLayer | 全不動産会社が3Dを必要とするわけではない | 3Dを標準機能 |
| ADR-051 | 動画編集: OpenCut MCP Controller | 実装コスト1/5以下 | FFmpeg直接実装 |
| ADR-052 | 開発IDE: Cursor/Windsurf + Claude Code | AI補完 + CLIエージェント | Helmor |
| ADR-053 | 3D中間フォーマット: OpenUSD採用 | iOS AR・IFC継続デプロイを単一フォーマットで解決 | GLBのみ |
| ADR-054 | 3Dキャプチャ標準: Scaniverse/Polycam | モバイル品質がCOLMAPと区別がつかないレベル | COLMAP |
| ADR-055 | 動画生成2トラック設計 | スライドショーとシネマティックを分離 | 単一ツールのみ |
| ADR-056 | 動画制御をClaudeに集約・Higgsfieldはレンダリング専任 | プロバイダー変更時も資産引継ぎ可能 | Higgsfield直接依存 |
| ADR-057 | FloorplanVLMのBeikeライセンス確認を必須とする | 中国最大手不動産企業。商用条件確認が必要 | 確認なしで採用 |
| ADR-058 | Supabase APIキーを2026年Q4までに新形式へ移行 | 旧キーが2026年末廃止予定 | 移行延期 |
| ADR-059 | 構造が変化するImage-to-Videoは不採用 | 住宅が変形するAI動画は不動産広告として使用不可 | Image-to-Video採用 |
| ADR-060 | ローカルHDDをSource of Truthとする | クラウド依存排除。R2はキャッシュのみ | クラウドをSoT |
| ADR-061 | SNSサムネイル生成を全自動化（13サイズ） | 手動作業の最大ボトルネックを排除 | 手動作成継続 |
| ADR-062 | SEO構造化データ自動生成（schema.org/PropertyListing） | Google物件リッチリザルト取得 | 手動設定 |
| ADR-063 | UTMパラメータを全成果物に自動付与 | 集客チャネル効果を測定可能にする | 手動付与 |
| ADR-064 | リード個人情報はSHA-3ハッシュのみ保存 | 個人情報保護法・漏洩リスク最小化 | 平文保存 |
| ADR-065 | DynamicLP: utm_content軸で表示切替 | 広告文脈とLPの一致でCVR改善 | 全員同一LP |
| ADR-066 | SectionBeacon: IntersectionObserver threshold 0.5 | セクション半分以上が画面内に入った時点を「到達」と判定 | threshold 0.1 |
| ADR-067 | SectionBeaconにデバウンス300msを実装 | 上スクロール時の重複section_enterを防止（ADR-066の補完） | デバウンスなし |
| ADR-068 | sendBeacon失敗時はfetch+keepaliveにフォールバック | iOS Safariでsendなしは24%のセッション喪失 | sendBeaconのみ |
| ADR-069 | VideoSitemap: R2 URLをcontent_locに使用 | R2 URLはGoogleクローラー到達可能（WAF設定要） | CDN経由URL |
| ADR-070 | improvement_queueの自動改善は人間承認を経てから実行 | LP自動変更は誤解を生む可能性がある | 全自動 |
| ADR-071 | section_funnelをマテリアライズドビューで実装 | 毎リクエスト集計は重すぎる。1時間ごとのrefreshで十分 | 毎回集計 |
| ADR-072 | A/Bテストは統計的有意差(p<0.05)まで継続 | 早期終了でサンプルバイアス発生を防止 | 3日で判定 |
| ADR-073 | メール自動取り込みにemail_hashで重複防止 | 同一メールの二重登録でリード数が水増しされる | 重複チェックなし |
| ADR-074 | llms.txt / AI検索SEO対応 | Perplexity・Claude Search等のAI検索エンジン向け | 対応しない |
| ADR-075 | builders テーブルを tenants と完全分離 | 工務店ポータルは別事業体として設計 | テナントに統合 |
| ADR-076 | company_slugは一度公開したら変更不可 | SEO資産（被リンク等）を守るため | 変更自由 |
| ADR-080 | VideoGeneratorRouterに3段フォールバックを実装（Higgsfield→Runway→Kling） | 外部サービス障害時の動画生成停止を防止 | Higgsfield障害時はスライドショーのみ |
| ADR-081 | buildersテーブルはRLS不要 | 公開情報主体。認証不要での閲覧を想定 | RLS有効化 |
| ADR-082 | GPUBudgetManagerのVRAM eviction閾値を60%に設定 | 60%超過でLRUオブジェクトを解放してOOM防止 | 80%（遅すぎる） |

### R.2 v10.0新規ADR（ADR-090〜100）

| ADR# | 決定内容 | 採択理由 | 代替案 |
|------|---------|---------|-------|
| ADR-090 | VideoGeneratorRouterに Runway Gen-4 / Kling AI フォールバックを追加 | Higgsfield単独障害時の動画生成全停止を防止。3段フォールバックで可用性99.9%を目指す | Higgsfield障害時はOpenCut（スライドショー）にフォールバック（品質劣化） |
| ADR-091 | 可観測性スタック: OpenTelemetry + Grafana Cloud | ①Sentry/LogRocketは個人情報送信リスクあり ②自前Prometheusはメンテ負荷高 ③Grafana CloudのFreeティアで開始可能 ④MCPサーバー間の分散トレーシングが可能 | Datadog（高コスト）/ Sentry（個人情報リスク）|
| ADR-092 | Scene JSON マイグレーションは「非破壊的追加のみ」ポリシーを採用 | 既存本番データの破壊を防止。古いバージョンのJSONはSceneAdapterで変換 | メジャーバージョンアップ時に全件マイグレーション |
| ADR-093 | SceneAdapterをリクエスト時に自動適用（lenientモード） | 本番移行中に旧バージョンJSONがエラーになることを防止 | デプロイ時に全件マイグレーション（ダウンタイムリスク） |
| ADR-094 | PropertyIntakeAgentのべき等性をStep単位で設計 | pg-bossのリトライ時に課金重複（Higgsfield）や状態不整合を防止 | ジョブ全体を冪等として扱う（課金重複リスク） |
| ADR-095 | テスト戦略: Unit+Integration+E2E+Loadの4層（Part AA参照） | テストなしでのCI/CD本番デプロイはリスクが高すぎる。Claude Codeへの実装委任にも品質基準が必要 | テスト省略（速度優先） |
| ADR-096 | マルチテナントRLS侵害テストをCIに組み込む | テナント間情報漏洩はSaaSで最も深刻なセキュリティリスク。自動化で検出 | 手動テストのみ |
| ADR-097 | SectionBeaconデバウンス300msを採用（ADR-067の確定版） | AnalyticsデータのノイズがImprovementAgentの精度を下げる。300msは体感ではわからない遅延 | 500ms（長すぎ）/ なし（ノイズ大） |
| ADR-098 | リード個人情報のハッシュアルゴリズムをSHA-3に移行（ADR-064更新） | 量子コンピュータへの耐性。SHA-256からSHA-3への移行を2027年Q2を目標に計画 | SHA-256維持（当面は安全だが長期計画として危険） |
| ADR-099 | R2バケットのGoogleクローラーIPレンジをCloudflare WAFで許可 | VideoSitemapのcontent_locがR2 URLの場合、WAFブロックでIndexingが無効化される | CDN経由URLに変更（追加設定コスト） |
| ADR-100 | テストデータファクトリーを shared/testing 配下に集中管理 | 各テストファイルでのバラバラなモックデータ作成は保守性が低い。Zodスキーマに準拠したファクトリーでデータ品質を担保 | 各テストで個別にモック作成 |
