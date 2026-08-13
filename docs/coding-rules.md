# coding-rules — web ツールの実装規約（横断・正本）

CLAUDE.md（作業原則）と `docs/specs/`（ツール別契約）の間を埋める、**実装レベルの横断規約**。
どのエディタ・AI（Claude Code / Cursor）でも同じコードが書けるようにここへ集約する。
各項目の「なぜ」は出典（spec・verification-notes・backlog）に残し、ここは**どう書くか**だけを持つ。

## 描画・DOM

- `textContent` / `createElement` / `createElementNS` のみ。**innerHTML・HTML 文字列組み立て禁止**
  （例外: クリップボードへ書く text/html **文字列**の生成は DOM に挿さないので可 — lib/excel.js）
- SVG は `createElementNS('http://www.w3.org/2000/svg', …)`（`createElement('svg')` は動かない）
- 再描画でボタンを作り直さない（要素参照が死んでフォーカスも失う）。
  要素数が変わらないなら `textContent` だけ更新する

## 共通ライブラリ（lib/ — 使う前にヘッダコメントを読む）

| ファイル | 使うもの | 規約 |
|---|---|---|
| ui.js | `banner(el, kind, text)` / `copy(text, {selectEl})` / `feedback(btn, label)` | 引数順は **(要素, 種別, 文字列)**。ツール固有の引数差はラッパ（各ツールの `showBanner`）で吸収し、共通核は class+role+textContent+hidden だけ |
| storage.js | `save/load/mountWarning`（export/import は必要なら） | キー `tools:<英名>`。**save 失敗の可視化は共通核がやる**（呼び出し側で戻り値チェック不要） |
| excel.js | `copy(html, text)` / `cellStyle(value, {header, align})` / `MANGLE_RES` | Excel 向けコピーは**必ず二重フレーバー**（execCommand 先行 — async clipboard は mso- 系をサニタイズする）。文字列化ガードの正本はここ。**表の組み立て（th/td・rowspan）は各ツールに書く** |
| sql.js | `SqlLex.tokenize` | 字句解析のみ共有。整形・キーワードは devpad 側 |

- **共通化の条件**: 「同じ変更に N 箇所の編集が必要だった実測」または「2番目の利用者が生まれた瞬間」。
  美観・予感では抽出しない（見送り判断も tool-backlog / ux-backlog に記録する）

## UI の標準形

- 変換系: 2ペイン（入力/出力）・リアルタイム変換（デバウンス 150〜250ms）・コピーボタン・
  不正入力でも落ちず警告＋最善の出力
- `<main class="app-wide">`（2ペイン系）または `class="app"`（1カラム系）。
  `<main>` 直下に `.tool-header`（「← ツール一覧」＋保存注記）
- コピーボタンは `class="primary"`・`title="Cmd/Ctrl+Enter"`。
  **Cmd/Ctrl+Enter → copyBtn.click()** を document keydown で配線
- 入力 textarea に placeholder。サンプル投入ボタン（`.sample-btn`・入力が空のときだけ表示）
- **コピー時に確定**: デバウンス中の古い結果を渡さない —
  リアルタイム型はコピーハンドラ先頭で `clearTimeout + run()`、
  ボタン変換型（ddl2spec）は**鮮度ガード**（変換時の入力と現在の入力を比較し、違えば警告して止める）
- 完成したら index.html の TOOLS 配列に登録（`{name, alias, path, desc, category, when}`）

## 保存（localStorage）

- **正本は vault 側**（永続データ）。localStorage は UI 状態と「その場の入力」だけ
- payload の復元は**キーごとに型・値域ガード**（boolean 判定・列挙 includes）。未知値は既定へ
- 1フィールド 100KB 超は保存せず `{omitted: true}` を入れて**次回起動時に通知**（黙って捨てない）
- 入力を保存するツールはデバウンス保存＋ **pagehide / visibilitychange(hidden) でフラッシュ**
- 保存失敗（quota 等）の可視化は lib/storage.js の共通核に任せる

## 文字の扱い

- **不可視・紛らわしい文字をソースに実文字で書かない**。U+00A0（NBSP）・U+3000（全角空白）・
  ゼロ幅などは**必ずコードポイント表記**で組む（spec・テスト・実装とも。
  2026-08-13 に AI が3回実文字を混入させた実績あり — レビューで見えず、後から検出も難しい）
- 比較・照合の前に NFC 正規化（macOS のファイル名は NFD で来る）
- 修飾キーなしの Enter / Escape をトリガーにする操作は **IME ガード必須**
  （判定軸は verification-notes §8。破壊的操作のみガード、非破壊は不要）

## 性能ガード

- 入力サイズの上限は**処理の前に**弾く。**一部だけ処理しない** — 中止して理由をバナーに出す
- 出力が非線形に増える処理（結合セル展開等）は**展開ループの内側で実カウンタ**を数えて打ち切る
- 上限の定数と文言の数字は二重管理（変えるときは両方）。閾値の意味が違うので共通化しない（判断済み）

## バナー・エラー

- 種別と role は 1:1（info/success=`status`、warn/error=`alert`）。**対応表は lib/ui.js だけが持つ**
- ガード発動・失敗・競合= warn/error、結果・通知= info/success
- 1要素を種別違いで使い回すときは**戻すコードを対で書く**（class と role を戻し忘れると嘘になる）
- 「入力があるときだけ意味を持つメッセージ」（変更なし・差分なし）は空入力では出さない

## テスト（詳細は test/README.md — ここは原則だけ）

- **spec 先行 TDD**: ①spec にテストケースを書く → ②ハーネスに追加して **fail を見る** →
  ③最小実装 → ④pass を見る → ⑤`./test/run <tool>` 全 pass。期待値を変えるときは spec が先
- テスト ID は spec と同じ（`E2M-01` 等）。新ケースは連番の次を使う
- クリップボード・ダウンロードは**必ずスタブ**（実環境を壊さない）。
  二重フレーバーの捕捉は「execCommand を false に固定 → ClipboardItem の Blob を読む」
- pagehide フラッシュを持つツールの localStorage 注入/クリアは
  **reload 前に `ToolStorage.save = () => true`**（verification-notes §4）
- フィクスチャは「何を確かめるか」が式から読めるデータにする。**変換仕様の理解も実装から確かめる**
  （例: md の連続行は1段落=1セル — 推測で行数を数えると偽 fail する）
- 自動化できない層（Excel 貼り付けの解釈・外部プロトコルダイアログ・FSA ピッカー）は
  **spec の実機スモーク節**に列挙して人間に依頼する

## vault 連携（該当ツールのみ）

- 読むだけでも **`91_Private/` はコードで除外**（vault の掟①）。`.obsidian/` `.git/` `.trash/` も
- 書き込みツールは**保存前に再読して NFC 比較**（外部変更検知。taskboard が正本実装）
- ノートの削除・一括リネームに相当する操作は作らない（**提案表示まで** — 掟②）
- Obsidian で開くリンクは `obsidian://open?vault=<名>&file=<encodeURIComponent(名前)>`

## 変更の作法

- 依頼された1ツールのみ。改善案は実装せず提案（CLAUDE.md）
- **「しない」と判断済みの項目を蒸し返さない** — ux-backlog「やらないと判断したもの」「現状維持」、
  tool-backlog「却下済み」、各 spec「やらないこと」「決定事項（Q番号）」を変更前に確認する
- コミットは論理単位・日本語1行。spec・実装・テストは同じコミットに入れる
