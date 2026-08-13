# vaultlint 仕様書兼テストケース

## 概要

Obsidian vault の健全性を検査するツール。`web/vaultlint.html`、表示名 `Lint`、カテゴリ: 整理。
**読み取り専用・報告のみ**（修復はしない — vault の掟「ノートの削除・一括リネームは提案まで」に整合）。
`showDirectoryPicker` で vault を選び、`.md` を走査してクラス別に問題を報告する。

根拠: vault の `_rules/backlog.md`（2026-08-03 の整理フェーズ）が、この検査を手動で行って
計測バグを踏み（32件→実は40件）、クラス分類を人力で行い「着手時に再調査すること」と
書き残している。実務ペインの記録が着手根拠（tool-backlog 2026-08-13 承認）。

## 検査クラス（この列挙が正本）

| クラス | 内容 |
|---|---|
| brokenLinks | `[[ターゲット]]`（`![[...]]` 含む）が解決できない。エイリアス `\|`・見出し `#`・ブロック `#^` は剥がして本体で判定。`[[#見出し]]`（自ファイル参照）は対象外 |
| missingAttachments | `![[名前.拡張子]]` および md リンク `![alt](相対パス)` の実体が無い（`http(s):`・`data:`・`obsidian:` は対象外。`%20` 等はデコードして照合） |
| badNames | ファイル名の罠: 連続半角スペース／全角スペース(U+3000)／NBSP(U+00A0)／先頭・末尾スペース／空ベース名（`.md`）。**フォルダ名も対象** |
| dupBasenames | 同じベース名の `.md` が複数（パス修飾なしリンクが曖昧になる）。パス一覧を出す |

## リンク解決規則

- ターゲットに `/` を**含む**: vault ルート相対パスとして照合（`.md` 省略可）
- 含まない: ベース名照合
- 比較は **NFC 正規化＋小文字化**（macOS の実態に合わせ大文字小文字は同一視）
- 添付（非 md ファイル）はベース名で解決（Obsidian の「最短一致」相当。厳密な最短パス選択はしない — 存在すれば OK）

## 除外（読み込み自体しない）

- **`91_Private/`（vault の掟①。コードで強制）**・`.obsidian/`・`.git/`・`.trash/`
- 除外したディレクトリ数を統計に出す（黙って飛ばさない）

## 画面構成

- `<main class="app">` 直下: `.tool-header`（「← ツール一覧」＋「このツールは何も保存・変更しません」）
- `<h1>Lint</h1>`・subtitle
- ［vault フォルダを選択］ボタン（`showDirectoryPicker`。**Chrome 系限定** —
  API が無いブラウザではボタンを無効化して理由を表示）／［再スキャン］（選択済みのとき）
- 結果: サマリ行（`ファイル N・ノート M・リンク L ／ 問題 K 件`）＋クラス別の表
  （ファイル・行番号・対象・補足）。0件のクラスは「問題なし ✅」
- ［報告をコピー］: Markdown（見出し＋クラス別リスト）。vault の `_rules/backlog.md` に
  そのまま貼れる形式
- ハンドルの永続化はしない（整理は低頻度。毎回選ぶ。要望が出たら taskboard の
  IndexedDB 方式を lib 化して共有 — tool-backlog に判断記録）

## 性能ガード（超過時は処理せず理由を表示。一部のみ処理はしない）

- ファイル総数 20,000 超で中止
- 1ファイル 2,000,000 文字超の md は**その場で読み飛ばして警告**（リンク抽出をしない）

## 純関数（フックと UI が同一コードパス）

`window.vaultlint.lint(files)` — `files = [{ path, text }]`（text は md のみ。添付は path だけ）
→ `{ issues: {brokenLinks, missingAttachments, badNames, dupBasenames}, stats, warnings }`

- issue の形: `{ file, line, target, note? }`（badNames は `{ path, reason }`、
  dupBasenames は `{ base, paths }`）
- `window.vaultlint.test.run(files)` — FSA を通さず結果画面まで描画（ハーネス用）

## テストケース

| ID | 入力（files） | 期待 |
|---|---|---|
| VL-01 | `a.md`:`[[b]]` と `b.md` | brokenLinks 0件 |
| VL-02 | `a.md`:`[[c]]` のみ | brokenLinks 1件（file=a.md・line=1・target=c） |
| VL-03 | `a.md`:`[[B]]`・`b.md`（大文字小文字違い）／`a.md`:`[[ｂ]]` は NFC+小文字化の対象外なので**別名** | 前者0件・後者1件 |
| VL-04 | `a.md`:`[[dir/b]]` と `dir/b.md`／`dir2/b.md` しか無い場合 | 前者0件・後者1件（パス修飾は厳密） |
| VL-05 | `a.md`:`[[b\|別名]]`・`[[b#見出し]]`・`[[b#^blk]]`・`[[#自分]]` と `b.md` | すべて0件（剥がして解決・自ファイル参照は対象外） |
| VL-06 | `a.md`:`![[img.png]]`・`![x](files/doc.pdf)`・`![y](https://ex.com/i.png)` と `98_Assets/img.png` のみ | missingAttachments 1件（doc.pdf。http は対象外・img.png はベース名解決） |
| VL-07 | `a.md`:`![z](My%20File.pdf)` と `My File.pdf` | 0件（デコードして照合） |
| VL-08 | `React  Vite.md`（2連スペース）・`AWS　基礎.md`（全角）・`x y.md`（NBSP）・` 2.md`（先頭）・`dir /a.md`（フォルダ名末尾スペース）・`.md`（空） | badNames 6件・reason がそれぞれ区別される |
| VL-09 | `x/メモ.md` と `y/メモ.md` | dupBasenames 1件（base=メモ・paths 2件） |
| VL-10 | `91_Private/s.md` を含む files | **lint に渡る前に除外される想定のため、lint 自体は走査する**。UI 経路（test.run）では 91_Private を渡さないことをアダプタが保証（VL-U2 で照合） |
| VL-11 | 20,001 ファイル | `{ok:false}` 相当のエラー（処理せず理由） |
| VL-12 | 行番号: `a.md` の3行目に `[[c]]` | brokenLinks の line=3 |

UI 手順ケース:
- **VL-U1**: `test.run(VL-02 の files)` → サマリに `問題 1 件`・brokenLinks の表に a.md／c。
  ［報告をコピー］（writeText スタブ）→ Markdown に `## リンク切れ` と `a.md:1 → c`
- **VL-U2**: `test.run` に `91_Private/x.md` を含む files を渡すと**アダプタ層で除外**され、
  結果に 91_Private が一切現れない（統計の除外数に計上）
- **VL-U3**: 全て健全な files → 全クラス「問題なし」・問題 0 件
- **VL-U4**: 幅390px でページの横スクロールなし

## 検証手順

> **合否の正本は `./test/run vaultlint` が全 pass（コンソールエラー0件を含む）。**

FSA（`showDirectoryPicker`）はヘッドレスで自動化できないため、実フォルダの走査は
Chrome 実機スモークで確認する:

- 実 vault を選択 → スキャン完了・91_Private が統計の除外に出る・結果が backlog.md の
  既知の問題（ダブルスペース等）と整合する

## やらないこと

- **修復（リネーム・削除・リンク書き換え）** — 提案表示まで（vault の掟②）
- ハンドルの永続化（低頻度。毎回選ぶ）
- Safari / Firefox 対応（showDirectoryPicker が無い。理由を表示して終わり）
- 孤立ノート（どこからもリンクされていない）の検出 — 「リンクしない運用のノート」が
  多数あり誤検知になる。要望が出たら再検討
- Obsidian 設定（attachmentFolderPath 等）の読取り — `.obsidian/` は除外対象。解決は上記規則のみ

## 決定事項（2026-08-13）

- **VL-Q1**: 表示名 → `Lint`（短い英語1語）。英名 `vaultlint`・カテゴリ「整理」（新設）
- **VL-Q2**: lib/vault.js の抽出 → **v1 ではしない**（taskboard と共有できるのは
  ハンドル永続化の小部分のみで、v1 はそれ自体を持たない。「同じ変更に N 箇所」の実測が
  出た時点で抽出）
- **VL-Q3**: 修復機能 → **付けない**（読み取り専用。書き込みを持った瞬間に
  掟②と NFC 比較等の安全装置一式が必要になる）
