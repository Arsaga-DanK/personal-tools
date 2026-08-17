# mindmap 仕様書兼テストケース

## 概要

アウトラインからマインドマップを描くツール。`web/mindmap.html`、表示名 `Mindmap`、
カテゴリ: **発想（新設）**。左にインデント付きの箇条書きを打つと右にマインドマップが
リアルタイム描画される。**思考の速度で打てる**（ドラッグ配置をしない）のが狙いで、
テキストがそのまま vault のノートに貼れる（正本問題が生じない）。
描画は同梱 mermaid の mindmap（`lib/mmd.js` — diagram/gantt と共有）。
直接操作の付箋ボード（board）は別ツール（要件定義から — tool-backlog）。

## 入力（アウトライン）

- **1行目（最初の内容行）= 中心テーマ**。以降はインデントで階層
- インデントは**タブ1個 = 1階層**（スペースは2個 = 1階層）
- `#` 始まりはコメント。空行は無視
- ノード文字列の `( ) [ ] { }` は全角 `（）［］｛｝` に置き換える
  （mermaid mindmap の形状指定記法と衝突するため — 黙って変換・spec に明記）
- **2つ目以降のルート（レベル0）行は警告して1階層下げる**（mermaid mindmap はルート1つ。
  図を壊さない最善 — MM-Q2）

## 変換（純関数 `buildMindmapDsl(text)` → `{dsl, warnings}`）

```
mindmap
  root((中心テーマ))
    課題
      価格が高い
```

- 内容行が無ければ `{dsl: null, warnings}`（描画しない）

## UI

- 2ペイン: 入力（アウトライン）／出力（マインドマップ）。デバウンス 300ms・
  エラー時は前回の図を保持（diagram と同じ標準形）
- ［PNG をコピー］（primary・Cmd/Ctrl+Enter・白背景2倍）・サンプル投入（空のときだけ）
- 入力を自動保存（`tools:mindmap`・100KB cap・pagehide フラッシュ）

## 純関数・フック（UI と同一コードパス）

`window.mindmap = { buildMindmapDsl(text) → {dsl, warnings},
render(text) → Promise<{ok, error|null}>, svgInfo() → {present, nodes} }`

## テストケース

| ID | 操作 | 期待 |
|---|---|---|
| MM-01 | タブ/スペース混在・コメント・`()` 入り・2つ目のルートを混ぜて `buildMindmapDsl` | DSL が正確に一致（全角化・2つ目のルートは1階層下げ＋行番号つき警告） |
| MM-02 | `render`（正常なアウトライン） | ok・SVG が描かれる |
| MM-03 | 空入力／コメントのみ | dsl null・描画しない（出力とバナーが消える／警告） |
| MM-U1 | 入力 → pagehide → reload | 復元（`tools:mindmap` envelope）・再描画 |
| MM-U2 | ［PNG をコピー］（`clipboard.write` スタブ） | ClipboardItem の types に `image/png`・✓ 表示 |
| MM-U3 | 幅390px | ページの横スクロールなし |

ハブ導線: カテゴリ「発想」（新設）に載り、title は `Mindmap`（表示名=英名なので表示名のみ）。

## 検証手順

> **合否の正本は `./test/run mindmap` が全 pass（コンソールエラー0件を含む）。**

実機スモーク: PNG コピー → Teams/PowerPoint に貼れること。

## やらないこと

- ノードの直接操作（ドラッグ・色分け・自由配置）— **付箋ボード（board）の領分**（別ツール）
- アウトラインの保存正本化（テキストは vault のノートへコピペ運用 — Fill と同じ整理）
- mermaid mindmap の形状・アイコン記法の露出（箇条書きだけで完結させる）

## 決定事項（2026-08-15）

- **MM-Q1**: カテゴリ「発想」を新設（ブレスト系は既存6分類のどれでもない。board もここに入る）
- **MM-Q2**: 複数ルートは**警告して1階層下げる**（エラーで止めない — ブレスト中の手を止めない）
- **MM-Q3**: `()[]{}`は全角へ黙って変換（mermaid の記法衝突。警告の洪水はブレストの邪魔）
