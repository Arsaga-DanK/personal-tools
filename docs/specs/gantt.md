# gantt 仕様書兼テストケース

## 概要

タスクと期間の表からガントチャート画像を作るツール。`web/gantt.html`、表示名 `Gantt`、カテゴリ: PM。
1行1タスクの簡易表を書くと横棒チャートが描かれ、**PNG コピー**で資料・Teams に貼る。
**管理はしない**（進捗・依存・保存データの正本を持たない — tool-backlog の採択条件）。
描画は同梱 mermaid（`lib/mmd.js` — diagram と共有。テーマ・PNG 化の規約はそちらが正本）。

## 入力（1行1タスク。区切りはタブ または カンマ）

```
セクション名          ← 区切りのない行はセクション見出し
タスク名<TAB>開始<TAB>終了または日数
```

- 開始: `YYYY-MM-DD` / `YYYY/M/D`（正規化して YYYY-MM-DD）
- 終了: 日付（同上）または日数（`5d` / `5日`）
- `#` 始まりはコメント。空行は無視
- タスク名の `:` は `：`（全角）に置き換える（mermaid gantt の区切り文字と衝突するため）
- 解釈できない行は**その行番号つきで warn**（他の行は描く — 落ちない）

## 変換（純関数 `buildDsl(text, {excludeWeekends})` → `{dsl, warnings}`）

生成する mermaid gantt DSL:

```
gantt
dateFormat YYYY-MM-DD
axisFormat %m/%d
excludes weekends        ← オプション（既定オン — PM 用途は営業日感覚が普通）
section セクション名
タスク名 :t1, 2026-08-18, 2026-08-22
```

- タスク ID は出現順に t1, t2, …（利用者には見せない）
- タスクが1つも無ければ `{dsl: null, warnings}`（描画しない）

## UI

- 2ペイン: 入力（表テキスト）／出力（チャート）。デバウンス 300ms・
  エラー時は前回の図を保持（diagram と同じ標準形）
- オプション: ［土日を除外］チェック（既定オン）
- ［PNG をコピー］（primary・Cmd/Ctrl+Enter・白背景2倍 — lib/mmd.js）・サンプル投入
- 入力とオプションを自動保存（`tools:gantt`・100KB cap・pagehide フラッシュ）

## 純関数・フック（UI と同一コードパス）

`window.gantt = { buildDsl(text, opts) → {dsl, warnings}, render(text) → Promise<{ok, error|null}>,
svgInfo() → {present, nodes} }`

## テストケース

| ID | 操作 | 期待 |
|---|---|---|
| GN-01 | セクション・日付・日数・`/`区切り日付・`:`入り名・コメント・不正行を混ぜて `buildDsl` | DSL が正確に一致（正規化・全角化・t 連番）・不正行だけ行番号つき warning |
| GN-02 | ［土日を除外］オフ | DSL に `excludes weekends` が入らない |
| GN-03 | タスク0件（コメントと不正行のみ） | `dsl: null`・警告あり・描画しない |
| GN-04 | `render`（正常な表） | ok・SVG が描かれる |
| GN-U1 | 入力とチェック変更 → pagehide → reload | 両方復元（`tools:gantt` envelope）・再描画 |
| GN-U2 | ［PNG をコピー］（`clipboard.write` スタブ） | ClipboardItem の types に `image/png`・✓ 表示 |
| GN-U3 | 幅390px | ページの横スクロールなし |

ハブ導線: カテゴリ「PM」に載り、title は `Gantt`（表示名=英名なので表示名のみ）。

## 検証手順

> **合否の正本は `./test/run gantt` が全 pass（コンソールエラー0件を含む）。**

実機スモーク: PNG コピー → PowerPoint/Teams に貼れること。

## やらないこと

- 進捗率・依存関係・マイルストーン・担当者（**管理はしない** — 原則2。書きたくなったら
  Excel か本物の PM ツールの領分）
- 祝日の除外（dates の祝日テーブルとの共有は「2番目の利用者」だが、mermaid の
  `excludes` は日付列挙が必要で表が肥大する。土日除外で足りるのを見てから）
- 保存データの正本化（入力は作業状態の自動保存のみ — テンプレは vault のノートへ）

## 決定事項（2026-08-15）

- **GN-Q1**: 描画は mermaid gantt に委譲（自前 canvas 描画はしない — 同梱済みエンジンの2番目の利用者）
- **GN-Q2**: 土日除外は**既定オン**（PM 用途は営業日感覚が普通。チェックで切れる）
- **GN-Q3**: 祝日除外は見送り（上記）。トリガー: 利用者が祝日ずれを指摘したら dates のテーブルを共有
