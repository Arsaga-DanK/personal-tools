# 構成の組み替え設計（2026-09-25）

利用者の依頼: 「ファイル数と1ファイルの記述量が膨大になった。今後も運用を続けるために、
適切なディレクトリ構成（ハーネス）にしておきたい。リファクタも含めて合わせたい」。
困っている場面は5つすべて（1変更で読む量・探しにくさ・追加のたびの手作業・テストの重さと診断・
人間が読める状態にない）。

この文書は**設計の記録**。実装後は CLAUDE.md（構成）と coding-rules.md（分割規約）が正本になり、
ここは「なぜそうしたか」を残す。

## 1. 実測（2026-09-25・全 216 コミット）

| ファイル | 行数 | 変更回数（全期間） | 変更回数（9月） |
|---|---|---|---|
| web/taskboard.html | 4,463 | 50 | 13 |
| test/taskboard.js | 4,184 | 43 | 12 |
| docs/specs/taskboard.md（＋decisions） | 2,138（＋242） | 48 | 12 |
| web/issue.html | 2,192 | 17 | 17 |
| test/issue.js | 1,502 | 15 | 15 |
| CLAUDE.md | 146 | 56 | 20 |

- 膨大さは「ファイル数」ではなく **taskboard・issue の3点セット（HTML・テスト・spec）に集中**している。
  web 17・test 19・spec 19 は alias で規則的に対応しており、ファイル数そのものは問題ではない
- CLAUDE.md の変更回数が最多なのは、本数（17本）と命名対応表をツール追加のたびに手で直しているため
  （機械照合なし）
- 巨大ファイルの内側には既に継ぎ目がある。taskboard.html は「エンジン（純粋・I/O なし）」約 880 行・
  IndexedDB・アダプタ・描画・ボード・タイムライン・アーカイブ・モーダル・テストフック・起動と節で
  区切られ、**読み込み時に後ろの節を参照する文は 0 件**（const/let の初期化式・列 0 の文を全走査）
- 2026-08-07 / 08-18 の監査は「web/*.html の分割はしない（2番目の利用者なし）」「lib/fsa.js は見送り」と
  判定したが、9/24 の issue.html で IndexedDB のハンドル保存 30 行が taskboard と**バイト一致で複製**され、
  見送りの条件（2番目の利用者）は発火した
- 基準: `./test/run` 全 19 ハーネス **886 pass / 0 fail / コンソールエラー 0**

## 2. 選んだ案と退けた案

**案1「場所は動かさず、大きいものを中で分ける」を採る。**

- URL（`web/<alias>.html`）・テスト ID・`window.<alias>` フック・localStorage キーを変えない。
  ブックマーク・Obsidian のリンク集・履歴が壊れない。CLAUDE.md「一度決めたら変更しない」を守る
- 大きいツールだけが**同名フォルダ**（`web/<alias>/` `test/<alias>/` `docs/specs/<alias>/`）を持つ。
  3つのディレクトリに同じ alias・同じ節名で並ぶ（鏡像）ので、探すときは alias で辿ればよい
- 後から「1ツール=1フォルダ」（案2）へ進むことはできる（同名フォルダごと移すだけ）

退けた案:
- **案2 1ツール=1フォルダ（`tools/<alias>/`）**: 探しやすさは最高だが、全ツールの URL が変わり
  ブックマークと Obsidian のリンクが壊れる。docs 内のパス参照 約 150 箇所・テスト 18 箇所・
  hub/launcher の経路解決・README の約束「1ツール=1HTML」も書き換えになる
- **案3 機械化だけ**: 読む量と探しやすさが改善しない

## 3. 目標構成

```
index.html / README.md / LICENSE / CLAUDE.md（本数と対応表を持たない）
lib/            共通コード（既存 + fsa.js）
web/<alias>.html                    入口。小さいツールはこれ1枚（従来どおり）
web/<alias>/<節>.js                 1,000 行を超えるツールだけ。元の節の境目で切る
test/run                            ランナー。ゲートは再帰・行数警告・節単位実行・所要時間
test/helpers.js                     共通部品 + TOOL_COUNT（固定ピンの唯一の置き場）
test/<alias>.js                     入口ハーネス（fixture・スタブ・節の順次実行・集計）
test/<alias>/<節>.js                節（{ name, ids, run(ctx) } を export）
docs/coding-rules.md                実装規約（分割規約を追加）
docs/verification-notes.md          知見
docs/specs/<alias>.md               spec（小さいツールは1枚。大きいツールは目次と骨格）
docs/specs/<alias>/<話題>.md        話題ごとの契約 + そのテストケース + fixtures.md + decisions.md
docs/audits/YYYY-MM-DD-<題>.md      監査・設計の記録（この文書と、ux-backlog から移す監査ログ）
docs/ux-backlog.md                  役割宣言 + 「やらない／現状維持」の判断表 + 監査の索引
docs/tool-backlog.md / docs/todo.md 変更なし
```

## 4. 分割規約（coding-rules.md へ転記する内容）

1. **閾値**: 1ファイル 1,000 行を超えたら同名フォルダに分ける（HTML・テスト・spec とも）。
   `test/run` が超過を警告する（落とさない）。既知の超過（devpad.html / mask.html / gantt.html /
   board.html / test/mask.js / test/devpad.js）は明示リストで除外し、**新たに超えたものだけ**が出る
2. **節→ファイル**: 既存の節コメント（`/* ========== 名前 ========== */`）の境目で切る。
   節をまたぐ再配置は「呼び出し元と同じ節へ戻す」だけ（例: アーカイブ節に迷い込んだ行の描画関数）
3. **順序保持**: `<script src>` の並びは元の節の順序。classic script は同じグローバル字句スコープを
   共有するので、**連結した中身が元と同一なら挙動も同一**。移行時に連結 diff がゼロであることを確認する
4. **読み込み時に実行する文は起動節にだけ書く**（`addEventListener` の配線と `render()` 等）。
   途中のファイルの列 0 に実行文を置かない（後のファイルの宣言に依存すると落ちる）
5. **各ファイルは `'use strict';` で始め、冒頭コメントに「目的／入口ページ／依存する前のファイル」を書く**
6. **テストフックと起動は入口ページに残す**（`window.<alias>` の形は変えない）
7. **テストの節**は `module.exports = { name, ids, run(ctx) }`。入口が ctx（page / runner / fixture /
   共通ヘルパ）を渡す。節は自分で `session(...)` から始め、前の節の状態に依存しない
8. **spec の話題ファイル**は冒頭3行（何を決めているか・テスト ID の範囲・決定の参照）を持つ。
   テスト ID は不変。ID 整合ゲートが取りこぼしを検出する

## 5. 節1: 器（共通の仕掛け）

| 何を | どう | 検証済みの前提 |
|---|---|---|
| ゲートを再帰に | 文字ゲート・バナー引数ゲートの対象を `web/**/*.html` `web/**/*.js` `lib/*.js` `test/**/*.js` `docs/**/*.md` へ | `env -i /bin/zsh` で `**/` が効く（17 / 24 / 20 件） |
| 行数の警告 | 1,000 行超を一覧表示（除外リスト6本） | 現在 1,000 行超は 11 本。分割後の残りが除外6本 |
| 節単位の実行と所要時間 | `./test/run taskboard timeline` → `node test/taskboard.js timeline`。ハーネスごと・節ごとの秒数 | `test/run` は既に余分な引数をハーネスへ渡している（`shift` 後の `"$@"`） |
| spec ⇔ ID 整合ゲート | `test/<alias>*.js` の `r.check('XX-nn` の ID が `docs/specs/<alias>*.md` に語境界つきで存在すること。末尾の小文字1字（`b` / `a`）は「同 ID の別経路」として剥がす。hub は spec を持たない設計なので対象外。**同一ハーネス内の ID 重複も落とす** | 文字列リテラルの ID が 95% 超。**今ある取りこぼし 10 件**: issue 8（IS-L5 / L5b / L6 / UL8〜UL11 / UL18a）・norm 1（NM-13）・taskboard 1（TB-AS4）。**ゲートを入れる前に spec へ行を足す**。**重複 5 件**: TB-M1/M2・TB-T1〜T3 が「メモ・タグ（2026-08）」と「モード切替・ツールバー（2026-09-24）」で二重に使われている → 新しい側を TB-MS1〜MS3（モード切替・モーダルの殻・Cmd+Shift+E）と TB-UI1/UI2（ツールバー・未保存インジケータ）に改名（spec 5 行・テスト 5 行） |
| 本数の一元化 | `test/helpers.js` に `TOOL_COUNT = 17`。hub.js の 16 箇所・launcher.js の 6 箇所がそれを読む。CLAUDE.md の本数 4 行と「現在の対応」表を消し `lib/tools.js` を正本に。hub.js に「TOOLS の各行に web / spec / test の3点がある」導出チェック（HUB-27） | 固定ピンの意図（本数の増減を意識的な変更にする）は定数の更新で保たれる |
| `lib/fsa.js` | `ToolFsa.handles(dbName)` → `{ get(key), set(key, val) }`（IndexedDB）／`ToolFsa.ensurePermission(handle, mode)`／`ToolFsa.available(kind)`。利用者は **issue と taskboard の2本**。vaultlint は「検査は read・修復時に readwrite」の二段階権限で構造が違うため対象外 | 2本の IDB 3関数は 30 行バイト一致。テストのスタブは queryPermission / requestPermission を既に持つ。indexedDB を直接触るテストは無い |

ツール追加の手順は「spec → test → html → tools.js → README → TOOL_COUNT +1 → tool-backlog」になり、
CLAUDE.md を触らない。

## 6. 節2: taskboard の分割

**HTML**（元の節の順序で切る。行数は目安）

| ファイル | 中身 | 行数 |
|---|---|---|
| web/taskboard.html | CSS・マークアップ・定数（TOOL / VAULT_NAME / MAX_CHARS / IDB キー）・テストフック・起動 | 約 500 |
| web/taskboard/engine.js | 純関数: 依存関係・ステータス・編集 op・メモ・親子の付け替え・解析・依存グラフ・タイムラインのモデル | 約 880 |
| web/taskboard/io.js | アダプタ・アプリ状態（state / el / todayStr）・バナー・読込保存・外部変更検知・FSA フロー・イシューノート・初期化・デモ | 約 600 |
| web/taskboard/list.js | 一覧の描画・ハイライト・行の描画（renderRow / renderMemoRow をアーカイブ節から戻す）・IME ガードとインライン編集 | 約 480 |
| web/taskboard/board.js | ボードビュー | 約 260 |
| web/taskboard/timeline.js | タイムライン描画・バーのドラッグ | 約 600 |
| web/taskboard/archive.js | 完了アーカイブ | 約 230 |
| web/taskboard/modal.js | ポップオーバー・追加編集モーダル | 約 650 |
| web/taskboard/ui.js | Excel コピー・週報・UI 状態の永続化・イベント配線 | 約 220 |

検証済み: `el` / `state` / `showBanner` / `todayStr` はアプリ状態節（io.js）にあり、全ビューより前。
`renderRow` / `renderMemoRow` の呼び出し元は描画節だけ。`isComposingKey` は6節から呼ばれるが
すべてハンドラ内（呼び出し時に解決）。IndexedDB 3関数は lib/fsa.js へ移り、ページの 3 箇所の
呼び出しが `ToolFsa.handles('tools-taskboard')` を通る。

**テスト**: `test/taskboard.js` を入口（約 200 行）にし、節を `test/taskboard/` に置く。

- ctx に載せるもの（節をまたいで使われているもの・実測）: 共通ヘルパ 12（`withDialogs` `ops` `opsError`
  `lineOf` `onlyChanged` `session` `addModal` `shutModal` `ui` `sendKey` `setView` `tl` `plan` `searchIn` `archive` `NB`）と
  fixture F1〜F15（F6〜F15 は現在ファイル中ほどで宣言されているので `test/taskboard/fixtures.js` へ集める）。
  短い名前（f1 / t1 / p1 …）は節ごとの再宣言で、共有ではない
- 節（10 本・順序保持。最後の flows が遷移するので最後）: engine / archive / sections / input / timeline /
  memo-tags / modal / board-search / deps / flows
- 移行時に**各節を単独で実行**し、前の節の状態に依存していた箇所を `session(...)` の追加で直す

**spec**: `docs/specs/taskboard.md` を目次と骨格（概要・前提・要件対応表・画面構成・表示・エラー・
検証手順・スモーク・やらないこと）に絞る。話題ファイル（内容は移動のみ・書き直さない）:

| ファイル | 契約 | テスト ID |
|---|---|---|
| engine.md | 編集仕様・Tasks 標準順・ステータス・依存の記法・親子の付け替え | TB-01〜20・S20〜S40・R1〜R9・K・T1〜T5（タグ） |
| input.md | キーボードと IME・追加の取り消し・日付の入力 | I・U・D4/D5・W |
| timeline.md | 計画ビュー・T4 強化・ズーム・ドラッグ・矢印・完了率・週報 | P・R10〜R19・WR |
| memo.md | メモ仕様 | M・C |
| board.md | ボードビュー・列切替・テキスト検索 | B・G・F |
| modal.md | 追加編集モーダル・ポップオーバー・クランプ | X・D1〜D3 |
| io.md | 保存・ハンドル永続化・フォールバック・外部同時編集・自動保存・ツールバー・モード切替 | 13/14・AS・UI1/UI2・MS1〜MS3 |
| archive.md | 完了アーカイブ・AR-1・AR-3 | 15〜19・AR・A |
| issue-link.md | Check Issue からの受け取り・考える場所へ | H・N |
| fixtures.md | F1〜F15 | — |
| decisions.md | 現 taskboard-decisions.md を移動（参照は CLAUDE.md と spec 本体の 2 箇所） | — |

検証済み: spec 内の `](#…)` アンカーは 0 件（移動でリンクは壊れない）。テスト表は ID 系列ごとに
分かれている（混在は3表: I+H・R+WR+P・M+C+T+D+W → 主たる話題に置き、他は行ごとに移す）。

## 7. 節3: issue の分割（同じ型）

| ファイル | 中身 | 行数 |
|---|---|---|
| web/issue.html | CSS・マークアップ・起動 | 約 300 |
| web/issue/engine.js | 純関数・一覧の解析・既存ノートへの書き込み・論点の行 | 約 620 |
| web/issue/ui.js | UI 配線（`$id` はここで宣言）・保存・04_Issues への書き込み（IDB は lib/fsa.js） | 約 240 |
| web/issue/list.js | 一覧・閉じる | 約 570 |
| web/issue/wizard.js | 入力ウィザード | 約 465 |

テスト: `test/issue.js` を入口に `test/issue/` へ pure / list / lines / close の4節（ハブ導線は入口）。
spec（527 行）は閾値未満なので分けない。ただし取りこぼし 8 ID の行を足す（節1）。

## 8. 節4: docs・規約・進め方

- `docs/audits/` を新設。`ux-backlog.md` の日付つき監査ログ 9 章を `YYYY-MM-DD-<題>.md` へ移す。
  残すのは役割宣言・「やらないと判断したもの」「現状維持」の判断表・監査の索引。
  参照は 10 箇所すべてファイル名だけ（章名での参照なし）。文中の相対参照（「上の表」等）3 件は移動時に確認。
  `.cursor/rules/tools.mdc` の「採否リストと採否の訂正を一緒に読む」は移動先へ向ける
- CLAUDE.md: 「構成」を目標構成に書き換え、本数と対応表を消す。coding-rules.md に §4 の分割規約。
  test/README.md の構成表とゲートの説明を実態に合わせる（todo #33 / #34）
- **進め方**（段階ごとに全 pass → コミット。合否は「886 チェック以上・0 fail・コンソールエラー 0」）:
  ① 器（ゲート・runner・TOOL_COUNT・HUB-27・lib/fsa.js・spec の取りこぼし 10 行・重複 ID 5 件の改名）
  ② taskboard HTML（連結 diff ゼロを確認）
  ③ taskboard テスト（各節の単独実行）
  ④ taskboard spec（ID ゲートで取りこぼしゼロ・テスト表の行数 225 が保たれる）
  ⑤ issue の HTML・テスト
  ⑥ docs（audits・CLAUDE.md・coding-rules・test/README）
- **今回やらないこと**（提案として残す）: devpad / mask / gantt / board の分割、`todayStr` → `ToolEdit.today()`
  （todo #16）、保存ブロックの共通化（#22）、spec 本文の書き直し、コミット subject の短縮規約（#41）

## 9. 監査で見つかった懸念と、確信の持てない点

懸念（設計に反映済み）:
- ID ゲートの接尾は `b` だけでなく `a` もある（IS-UL18a）→ 末尾の小文字1字を剥がす規則にした
- ID の部分一致（TB-1 が TB-10 に当たる）→ 語境界で照合する
- vaultlint は lib/fsa.js の利用者に数えない（二段階権限の構造が違う）
- 行数警告の除外リストは分割のたびに手で直す（6本・小さい運用コスト）
- テスト節の分割では、短い名前の再宣言と本当の共有を実装時に区別する必要がある（上の 12＋15 は実測だが、
  単独実行で追加の結合が出る可能性がある）
- テスト ID の重複が 5 件あった（TB-M1/M2・TB-T1〜T3）。ID ゲートは spec との整合だけでなく重複も検出する

確信の持てない点:
1. テスト節を単独実行したとき、前の節に依存している箇所が何件出るか（0〜数件と見込む）
2. 分割後の各ファイルの行数は ±10% の目安
3. ux-backlog の相対参照 3 件が移動先で意味を保つか（移動時に目視）
4. docs 内の行番号つき参照（`taskboard:2613` 等）は古くなる。元々古くなりやすいものなので直さない
5. 章単位の移動は `git blame` の連続性を失う（ファイル単位の移動ではないため）。監査ログなので許容

## 10. 実装時の差分（2026-09-25）

- テストの節は**元の実行順のまま連続した範囲**で切った（taskboard: engine / input / timeline-model / edit / board-search /
  deps / status / timeline-ui / flows / parent の 10 本。issue: pure / ui の 2 本）。テーマで寄せ直すと前の節の状態に依存していた
  箇所が動くため。issue の UI は入力→一覧→論点の行→閉じる→ウィザードが1つの連続シナリオで、状態を作り直すにはテストの
  書き換えが要るので1節にした（970 行・閾値未満）。§6・§7 の節名と本数は変更
- spec のテスト表は**表ごと**に話題ファイルへ置き、行単位では分けなかった（混在する3表は主たる話題に置き、他方の冒頭で案内）。
  表は 16（R の表と P43〜 の表が空行なしの文で区切られていた）
- ID ゲートは `-UI` 接尾（5 ハーネスが使う「同じケースの UI 経路」）を剥がして照合し、完全な ID か base のどちらかがあれば可とした。
  導入時に spec の取りこぼし 10 ID・二重使用 5 ID・表記 1 件（`TB-F5a/b`）を直した
- テストの分割で見つかった隠れた結合: taskboard の `window.__h`（ページ側ヘルパ）を入口へ移し節ごとに入れ直す。fixture F6〜F15 は fixtures.js へ
