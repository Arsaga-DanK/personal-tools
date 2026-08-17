# diagram 仕様書兼テストケース

## 概要

テキストから図を描くツール。`web/diagram.html`、表示名 `Diagram`、カテゴリ: 設計。
mermaid 記法（フローチャート・シーケンス図・状態遷移図など）を左に書くと右に図が
リアルタイムに描かれ、**PNG コピー**（資料・Teams 貼り付け用）と **SVG 保存**ができる。
「draw.io を開くほどでもない図」の担当（GUI エディタは draw.io — tool-backlog 却下済み 2026-08-15）。

## エンジン（同梱）

- **mermaid v11.16.1 を `lib/vendor/mermaid.min.js` に同梱**（IIFE・MIT・取得元と作法は
  ファイル冒頭コメントと coding-rules「ライブラリの同梱」）。実行時ネットワークなし
- 共通ラッパは `lib/mmd.js`（`ToolMmd.render` / `ToolMmd.toPngBlob`）— gantt と共有
- 初期化は ToolMmd に一元化: theme 'default'・securityLevel 'strict'・
  **htmlLabels: false（トップレベル＋flowchart の両方 — 片方だけでは foreignObject が残り
  PNG 化が壊れる。2026-08-15 実測）**

## UI（変換系の標準形）

- 2ペイン: 入力（mermaid テキスト）／出力（SVG プレビュー）。デバウンス 300ms
- **不正入力でも落ちない**: パースエラーは warn バナー（mermaid のエラーメッセージ先頭行）を出し、
  **前回の描画を保持**。空入力は出力とバナーを消す
- ［PNG をコピー］（primary・Cmd/Ctrl+Enter）: 表示中の SVG を**白背景・2倍**で PNG 化して
  `ClipboardItem`（Promise 渡し — Safari 対応。mask と同型）。コピー時に確定（デバウンス flush）
- ［SVG 保存］: `<a download>`。サンプル投入ボタン（入力が空のときだけ）
- 入力は自動保存（`tools:diagram`・100KB cap・pagehide フラッシュ — 保存規約）

## 純関数・フック（UI と同一コードパス）

`window.diagram = { render(text) → Promise<{ok, error|null}>（UI と同経路: 出力とバナーを更新）,
svgInfo() → {present, nodes}, lastSvgText() → string|null }`
（英名 `diagram` — `window.mermaid` はライブラリが占有するため、フック・ファイル名・
localStorage キーはすべて diagram。命名規約の「英名」はこちら）

## テストケース

| ID | 操作 | 期待 |
|---|---|---|
| DG-01 | `render('graph TD; A[開始]-->B{判定}; B-->|yes|C[実行];')` | ok・SVG が出力に入る（ノードあり） |
| DG-02 | シーケンス図（`sequenceDiagram` …） | ok・SVG が描かれる |
| DG-03 | DG-01 のあと不正入力（`graph TD; A--`） | ok:false・warn バナーにエラー・**前回の SVG を保持** |
| DG-04 | 空入力 | 出力が空・バナーも消える |
| DG-U1 | 入力 → pagehide → reload | 入力が復元される（`tools:diagram` envelope） |
| DG-U2 | ［PNG をコピー］（`clipboard.write` スタブ） | ClipboardItem の types に `image/png`・✓ 表示・実クリップボードに書かない |
| DG-U3 | サンプル投入 | 入力が空のときだけ表示・投入で図が描かれる |
| DG-U4 | 幅390px | ページの横スクロールなし |

ハブ導線: カテゴリ「設計」に載り、title は `Diagram`（表示名=英名なので表示名のみ）。

## 検証手順

> **合否の正本は `./test/run diagram` が全 pass（コンソールエラー0件を含む）。**

実機スモーク: PNG コピー → Teams/PowerPoint に貼れること・SVG 保存が開けること（ダウンロードは
ハーネスでスタブしない方針 — mask の PNG 保存と同じ扱い）。

## やらないこと

- 図の GUI 編集（ノードのドラッグ等）— draw.io の領分（tool-backlog 却下済み）
- mermaid 記法のシンタックスハイライト・補完（テキストエリアで足りる。要望が出たら）
- ダークテーマの図（貼り付け先は白背景が相場 — DG-Q2）
- mermaid の自動更新（同梱の作法どおり手動・回帰全回し）

## 決定事項（2026-08-15）

- **DG-Q1**: 英名は `diagram`（`window.mermaid` をライブラリが占有するため。
  表示名 `Diagram`・エンジン名は desc に書いて検索で辿れるようにする）
- **DG-Q2**: 図は**常にライトテーマ**で描く（アプリのダークモードに追従させない —
  出力 PNG の見た目が環境で変わると資料の体裁が揃わない）
- **DG-Q3**: `htmlLabels: false` 固定（foreignObject は canvas 経由の PNG 化を壊す — 実測）
- **DG-Q4**: 描画エラー時は**前回の図を保持**（変換系の標準形「最善の出力」の図版）
