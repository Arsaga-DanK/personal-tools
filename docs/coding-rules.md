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
| ui.js | `banner(el, kind, text)` / `copy(text, {selectEl})` / `feedback(btn, label)` / `nowStrip(box, spec)`・`flash(el)`（「いま」の欄と、飛んだ先を光らせる）/ `menu(actions, onPick)`・`menuKey(e, actions)`・`isTyping(el)`・`keyHint(a)`・`pointRect(x, y)`・`placeAt(pop, rect)`（行の操作のメニューとキー） | 引数順は **(要素, 種別, 文字列)**。ツール固有の引数差はラッパ（各ツールの `showBanner`）で吸収し、共通核は class+role+textContent+hidden だけ。**「いま」に何を入れるか・メニューにどの操作を並べるかは各ツール**。部品は見た目と操作だけ（2026-10-02・段1 — 下の「見た目と操作の決まり」） |
| storage.js | `save/load/mountWarning`（export/import は必要なら） | キー `tools:<英名>`。**save 失敗の可視化は共通核がやる**（呼び出し側で戻り値チェック不要） |
| config.js | `ToolConfig.get/set/all` ＋ `normDir/normDirList` | **環境依存の設定**（vault 名・フォルダ構成）だけを置く。キーは `tools:config` 固定で全ツール共有。**ui.js → storage.js の後に読む**。追加した設定キーは既定を「無効」側に倒す（下記） |
| excel.js | `copy(html, text)` / `cellStyle(value, {header, align})` / `MANGLE_RES` | Excel 向けコピーは**必ず二重フレーバー**（execCommand 先行 — async clipboard は mso- 系をサニタイズする）。文字列化ガードの正本はここ。**表の組み立て（th/td・rowspan）は各ツールに書く** |
| sql.js | `SqlLex.tokenize` | 字句解析のみ共有。整形・キーワードは devpad 側 |
| mmd.js | `ToolMmd.render(host, dsl)` / `toPngBlob(svg, scale)` | 同梱 mermaid のラッパ（diagram/gantt/mindmap）。**テーマ固定と `htmlLabels:false`（トップレベルと flowchart の両方）が正本** — foreignObject が残ると canvas での PNG 化が壊れる（実測） |
| tools.js | `ToolsList.TOOLS` / `CATEGORY_ORDER` / `filter(q)` / `recent()` / `recordUse(alias)` / `hrefFor(path)` / `hubHref()` / `currentAlias()` | **ツール登録簿の正本**（2026-09-24 に index.html から移設）。追加はここ1箇所。`path` は index.html 基準で書き、`web/` 配下からは `hrefFor` が剥がす。**絶対パスを書かない** |
| launcher.js | `ToolLauncher.mount()` | `.tool-header` に［☰ ツール］を置く引き出し式メニュー（Cmd/Ctrl+K）。**ハブには載せない**。`lib/tools.js` の後に読む。契約は `docs/specs/launcher.md` |
| handoff.js | `ToolHandoff.send(to, kind, text, path)` / `take(me)` / `peek(me)` | ツール間の受け渡し。**sessionStorage の一時バッファで正本ではない**。詳細は下の「ツール間の受け渡し」 |
| edit.js | `ToolEdit.tabIndent(el, opts)` / `mountTodayShortcut()` / `today()` / `addDays(ymd, n)` / **`dateChips(input)`** / `noteFileName(title, ymd)`（vault のノート名規則。Check Issue と Plan Tasks で共有）/ `fillDate(host, ymd, today)`・`dueWords(due, today)`（日付の表記 — 年＋月/日＋曜日・今年の年は薄く・N日遅れ）/ `listItem` / `renumber` | 適用範囲の線引きは下の「UI の標準形」。**構造テキストの欄だけ**に入れる。`{mdList:true}` は**md を書く欄だけ**（下記） |
| fsa.js | `ToolFsa.handles(dbName)` → `{get, set}` / `ensurePermission(handle, mode)` / `available('dir'|'file')` | FSA ハンドルの IndexedDB 保存と権限確認（issue / taskboard）。**db 名はツールごと・変えない**（file:// は全ページ同一オリジン。TB-FS1 がピン）。vaultlint は二段階権限（read → 修復時 readwrite）なので使わない |

- **共通化の条件**: 「同じ変更に N 箇所の編集が必要だった実測」または「2番目の利用者が生まれた瞬間」。
  美観・予感では抽出しない（見送り判断も tool-backlog / ux-backlog に記録する）

## ファイルの分割（2026-09-25 — 設計は docs/audits/2026-09-25-structure.md）

1. **閾値**: 1ファイル 1,000 行を超えたら同名フォルダに分ける（HTML・テスト・spec とも）。`test/run` が超過を警告する
   （落とさない）。既知の超過は `test/run` の `SIZE_KNOWN` に列挙し、分けたらそこから消す
2. **節→ファイル**: 既存の節コメント（`/* ========== 名前 ========== */`）の境目で切る。節をまたぐ再配置は
   「呼び出し元と同じ節へ戻す」だけ
3. **順序保持**: `<script src>` の並びは元の節の順序。classic script は同じグローバル字句スコープを共有するので、
   **連結した中身が元と同一なら挙動も同一**。移行時は断片を元の順に `cat` して元の `<script>` 本体と diff し、
   差がゼロであることを確かめる（手順の実例: docs/audits/2026-09-25-structure-plan.md Task 7）
4. **列 0 の実行文（`addEventListener` の配線・代入）は、後のファイルの宣言を値として参照しない**。配線で渡す関数は
   同じファイルか前のファイルのもの（ハンドラの中から後のファイルの関数を呼ぶのはよい）。配線は元の節に残してよく、
   `render()` / `initFile()` 等の**起動だけは入口ページ**に置く。切る前に列 0 の実行文を洗い、参照する名前が前か同じファイルに
   あることを見る（2026-09-25 の分割では taskboard / issue とも 0 件の前方参照）
5. **各ファイルは `'use strict';` で始め、冒頭コメントに「目的／入口ページ／前提（先に読まれるファイル）」を書く**
6. **テストフックと起動は入口ページに残す**（`window.<alias>` の形と URL は変えない）
7. **テストの節**は `module.exports = { name, ids, run(ctx) }`。入口が ctx（page / runner / fixture / 共通ヘルパ）を渡す。
   節は前の節の状態に依存しない（状態を引き継ぐ連続シナリオは1つの節にまとめる — issue の ui 節）。
   `./test/run <alias> <節名>` で単独実行できる。不明な節名は exit 2
8. **spec の話題ファイル**は冒頭に「何を決めているか・テスト ID の範囲・決定の参照」を持つ。テスト ID は不変。
   `docs/specs/<alias>.md` は目次と骨格として必ず残す（HUB-27 が存在を見る）。`test/run` の ID ゲートが
   「テストにあって spec 群に無い ID」と「同じ alias 内の ID の二重使用」を落とす

## ライブラリの同梱（2026-08-14 に利用者が緩和）

- 判断基準は**「使用時の起動レス」** — CDN 参照・実行時ネットワーク・使用時の npm/ビルドは
  禁止のまま、**ファイルを `lib/vendor/` に同梱して `<script src>` で読むのは可**
- 同梱の作法: classic script / IIFE 形式のみ（ESM は file:// で動かない）。
  ファイル冒頭コメントに**バージョン・取得 URL・ライセンス**を記録。
  更新は手動（バージョンを上げるときは spec/テストの回帰を全部回す）
- **ライセンス全文を `lib/vendor/<名>.LICENSE` として同梱する**（2026-08-17 追加）。
  MIT・BSD・Apache はいずれも「許諾条項を複製に含めること」が条件で、
  **リポジトリを公開した時点でこちらが再配布者になる**ため、URL へのリンクでは足りない。
  冒頭コメントには同梱先のパスを書く（リンク切れに強い）
- **小さな処理は依存より手書きを優先**（従来どおり）。同梱が正当化されるのは
  自作が非現実的な規模のものだけ（例: mermaid の描画エンジン）

## 体験の標準（利用者要件の集約 — 2026-08-17。新規・改修のチェックリスト）

利用者の一貫した要求を原則化したもの。**新ツール・機能追加はここを満たすかを spec 段階で確認する**:

1. **「使う瞬間に得」を最短にする** — 開いて・貼って・数秒で成果物。
   入力を作る手間が要るなら**作る手段ごと同梱**する（例: Gantt に表を貼らせるなら、
   tasks.md の直貼り認識や行エディタまでが仕事。「毎回表を作れ」は使われない）
2. **Office の筋肉記憶に寄せる** — Ctrl/Cmd+; = 今日、Shift = 制約、Cmd+D = 複製、
   Cmd+Z = 戻す、ドラッグ・複数選択・Delete。独自ショートカットを発明しない
3. **記法を知らなくても書ける** — サンプルボタン・placeholder・md 互換入力・
   Tab がフォーカスに奪われない（lib/edit.js）。「書き方を知らないと書けない」画面を出さない
4. **Obsidian を外部記憶にする** — 入力は md 互換（貼れる）、出力も md（持ち帰れる）を優先。
   vault との自動連携は「第二の正本」を作らない範囲で（正本は常に vault 側）
5. **既にあるデータから作る** — 他ツール・vault に既にある情報を再入力させない
   （taskboard の計画 → Gantt、アウトライン → Mindmap、付箋 → md）
6. **成果物は貼って終わり** — PNG は白背景・内容トリム・2倍。クリップボード直行

## 見た目と操作の決まり（Plan Tasks で利用者と決めたこと — 2026-10-02。全ツールの改修でここを満たす）

出どころは `docs/specs/taskboard/decisions.md` の TB-Q66〜Q70 と `docs/audits/2026-10-02-issue-redesign.md`。
**見た目の決まりは全ツール、振る舞いの決まりは一覧を扱うツール**（Plan Tasks・Check Issue・Check Vault）に当てる（利用者の判断）。

見た目（全ツール）:
1. **情報は削らず、見せ方で整理する**（利用者「表示されている情報自体は良い（削らない）」）— 字の強弱・余白・薄い罫線
2. **見出しは2行**（`.app-head`・`.app-controls`）。説明文は題名の title、設定（vault 名など）は ⋯ の中、操作は1段
3. **空欄に「—」を並べない**
4. **長い名前は切って、全文は title**。🎯 が作るノート名の先頭の日付は一覧では省く
5. **日付は `ToolEdit.fillDate`**（`2026/9/30(水)`・今年の年は薄く）。期限には `ToolEdit.dueWords`（N日遅れ／今日／あとN日）を添える
6. **状態の色は1か所に1つ**（行の左端の帯・`--st-*`）。背景を塗って赤だらけにしない

振る舞い（一覧を扱うツール）:
7. **一番上に「いま」**（`ToolUI.nowStrip`）— 今やるものを種類ごとに1行。札を押すとその行へ飛んで光る（`ToolUI.flash`）
8. **まとまりは表の中の見出し**にし、件数と急ぎの数を出してたためるようにする
9. **行の操作は右クリックとキーでも**（`ToolUI.menu`・`menuKey`）。ボタンは残し、title にキーを添える（`ToolUI.keyHint`）。文字を打つ欄・モーダル中はキーを奪わない（`ToolUI.isTyping`）
10. **消す・動かすの直後に［元に戻す］**（直前の1回だけ）
11. **入口が2つある編集は同じ仕組みを共有する**（Plan Tasks で、その場の編集と編集画面の内容欄が食い違った — TB-X20）

## 提案が当たるかの判定（Mask Image の分析・2026-08-18）

**AI 側から出す案**（利用者の頭に無いもの）が当たるかは、次の5条件で判定する。
根拠は自然実験: **Mask / Dates / Fill は同日・同じ提案バッチ・同じ承認で生まれた**が、
その後**利用者起点の機能追加要望を引き出したのは Mask だけ**（4日で5回。dates と fill は0回）。
さらに Mask への要望は全部「道具の中の操作」で**入力への不満は1件も無く**、
逆に Draw Gantt への要望は全部が「入力が面倒」で、2段の入力改善をしても凍結された。

1. **入力が既に手元にある**（クリップボード・vault・Excel・DDL）。Mask の入力コストは**ゼロ**
   — スクショを撮った瞬間、入力はもうクリップボードの中にある
2. **やらざるを得ない仕事の内側の一手間**（願望ではなく義務）
3. 利用者の語彙で**名前を持たない**（案は「自分が管理している名詞」から生まれる。
   名詞ではなく**別の仕事の内側にある無名の動詞**を狙う）
4. **既存の代替が静かに間違う/危険**。PowerPoint で黒い四角を置いても**下の機密は消えていない**。
   「代替が遅い」ではなく「代替が嘘をつく」ところに価値が立つ
5. **持ち物が増えない**（保存する状態なし・貼って終わり）

→ **当たり外れは機能の良さではなく「入力コスト」で決まる。**
入力を著述させる道具は、記法をどれだけ改善しても使われない（Gantt の md 化の実測）。

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
- **書きやすさの共通部品（lib/edit.js）**:
  **構造テキスト**（記法・コード・アウトライン・タブ区切りの表）を受ける入力欄に `ToolEdit.tabIndent` を適用。
  **散文・単一値・readonly の欄には入れない** — そこでは Tab は「次の欄へ」が期待どおりで、
  奪うと移動手段を失う（2026-08-18 の横展開で確定した線引き。適用: excel2md/ddl2spec/doc2xl の入力・
  devpad の JSON/XML/SQL・terms のルール欄・図系3本・gantt。非適用: terms の原稿欄・
  devpad の単一値タブ・taskboard のモーダル TB-Q59）
- **md の書き味（`ToolEdit.tabIndent(el, {mdList:true})`・2026-08-18）**:
  **Markdown を書く欄だけ**に付ける（現在: mindmap・gantt・doc2xl）。
  JSON・SQL・DDL・TSV の欄で Enter の挙動を変えると事故になるので既定は off。
  有効でも**箇条書きの行にいるときしか**変わらない:
  **Enter** = 同じ記号で次の項目（番号つきは +1・チェックは未処理で継続。**空の項目なら記号を外す**）／
  **Tab・Shift+Tab** = キャレットにタブを刺さず**行ごと1段深く/浅く**し、番号は並びに合わせて振り直す／
  素の行は従来どおり。**外部エディタは同梱しない**（欲しい実質はこの2つで、
  CodeMirror 等は数百KB とキーバインドの二重管理を持ち込む — 2026-08-18 の判断）
  （**Tab = インデント**・Shift+Tab = 戻す・**Esc 直後の Tab はフォーカス移動** = 脱出経路・IME 中は奪わない
  — ブラウザの Tab がフォーカス移動に奪われて書けない、という利用者指摘 2026-08-17 への構造対処）。
  **date input には `ToolEdit.dateChips(input)` を付け、既定値は今日にする**（2026-09-24。利用者「日付を入力しにくすぎる」。
  チップは 今日/+1/+7 の3つだけ — 明日・明後日…とボタンを増やさない。+N は欄の値からずらす）。
  日付を書くページは `ToolEdit.mountTodayShortcut`（**Ctrl/Cmd+; = 今日** — Excel の慣習。
  date input は値セット・テキスト系はキャレット挿入。input/change を発火して再計算に乗せる）
- 完成したら index.html の TOOLS 配列に登録（`{name, alias, path, desc, category, when}`）

## 新ツール追加の定型リップル（2026-08-14 に Mask/Dates/Fill ×3本で確立した手順）

1. `docs/specs/<英名>.md`（決定事項は Q 番号で記録）→ `test/<英名>.js` → **RED を見る**
2. `web/<英名>.html` を実装 → `./test/run <英名>` GREEN
3. **`lib/tools.js` の TOOLS に登録**（2026-09-24 に index.html から移設。ここに足すと
   **ハブと全ツールの引き出しメニューの両方**に載る）。新カテゴリなら CATEGORY_ORDER にも追加
3b. `web/<英名>.html` に `lib/tools.js` → `lib/launcher.js` を読み込み、末尾で `ToolLauncher.mount()`。
   `test/launcher.js` の LA-01 が**17本すべてに載っていること**を数えるので、忘れると落ちる
4. **test/hub.js の「固定ピン」を更新**（HUB-2/3前半/4/5/6/8。カテゴリ追加時は HUB-1）。
   HUB-3後半・HUB-5b・HUB-7・HUB-9・HUB-10 は TOOLS から導出するので**触らなくてよい**
5. **`test/helpers.js` の `TOOL_COUNT` を +1**（固定ピンの唯一の置き場。CLAUDE.md には本数を書かない。HUB-27 が web / spec / test の3点セットの存在を照合する）
6. **README.md のツール表と冒頭の本数**（HUB-15/16 が検出する。公開リポジトリの入口なので必須）
7. tool-backlog の該当行を「実装済み」へ移す（採択理由・非搭載の設計判断も書く）
8. 全スイート `./test/run` → spec・実装・テスト・登録を**1コミット**

- **テスト期待値は「固定」と「導出」を意図して使い分ける**（2026-08-17 に整理）:
  - **固定ピン** = ツールの増減・改名を**意識的な仕様変更にする関門**。壊れることが仕事
  - **導出** = 描画がデータどおりか・検索が効くか。固定文字列で書くと、改名した瞬間に
    クエリが何にも当たらなくなり、**空集合のまま緑になって検証意図だけが消える**
    （`f('md')` → `f('ables')` と2度踏んだ。verification-notes §「テストが緑でも意味を失う3つの型」）
  - 新しい照合を足したら**わざと壊して RED を見る**。緑のまま追加したテストは何も守っていない

- **検索語彙の交差に注意**: TOOLS の desc/when は全ツール横断の検索対象。
  新ツールの文言が既存の検索テスト（HUB-5/6/11/12 のヒット集合）を変える。
  ピン済みの語（vault・週次・設計・整理・sql・xml・正規表現・基数・Base64 等）を
  desc/when に入れるときは、**期待集合の更新が仕様変更として妥当か**を先に判断する
  （実例: Mask の when の「設計書」が HUB-12 の「設計」ヒットに加わった — 妥当として期待値を更新）

## ツール間の受け渡し（2026-08-18・第一号: Plan Tasks → Draw Gantt）

**16本のうち11本が「貼る」から始まるのに、ツール間リンクが1本も無かった**（2026-08-18 の
使用実態診断で実測）。データ形式としては繋がっているのに、**経路としては存在しない**状態だった。

- **渡す側**: `ToolHandoff.send(to, kind, text)`（`lib/handoff.js`）。
  `sessionStorage` の `tools:handoff` に `{to, kind, text, at}` を書いて相手のページへ遷移する
- **受ける側**: 起動時に `ToolHandoff.take(me)` を1回だけ呼ぶ。**取り出したら消す**（consume）
- **これは第二の正本ではない**（一時バッファ。正本は渡し元＝`tasks.md` 等のまま）。
  だから `localStorage` ではなく **`sessionStorage`**（タブを閉じたら消える）を使う
- **鮮度を必ず見せる**: 受け側は取り込み時刻をコメント等で残す（gantt の `%% 取り込み: <日付>` と同型）。
  古いスナップショットを新しいものとして配らせない
- **file:// は全ローカルページで1オリジン**なので `sessionStorage` は共有される（実測 — verification-notes §2）。
  逆に**機密を置く場所ではない**（他のローカル HTML からも読める）。渡すのは利用者が今見ている表だけ
- リンクを足すときは**渡し元の spec と受け側の spec の両方**に書く（片方だけだと導線が消える）
- **ハブの「データから探す」**（2026-08-18）: 貼ったテキストを `hub.routeText(text)` で判定し、
  **行ける道具の候補を複数出して選ばせる**（決め打ちにしない — md の見出しは階層表とも
  マインドマップとも読める）。各候補には**なぜそこへ行けるかの一言**を必ず添える。
  **候補に出すのは受け取り側を実装済みのツールだけ**（`RECEIVERS`）— 出して受け取れないのは嘘になる。
  受け側を増やしたら `RECEIVERS` に足し、`HUB-24`（貼る→押す→入る の実機通し）のケースも足す
- 受け側の現状: excel2md / devpad（中身でタブを選ぶ）/ ddl2spec / doc2xl / mindmap / diagram / gantt

## 静的データの同梱（第一号: dates の祝日テーブル）

- 外部データは**実行時に取得しない**（オフライン完結・URL 変更の事故歴）。
  ビルドが無いので、取得 → 検証 → ソースへ直書きが手順になる
- データ定義の直上コメントと spec に**正本 URL・取得日・件数・更新運用**を必ず残す
  （例: 内閣府祝日 CSV・2026-08-14 取得・143件・毎年2月頃に1年分追記）
- **件数や境界値をテストでピンする**（DT-07 が 143 件を照合 — 追記漏れ・誤削除の検出器）
- データの範囲外は**黙って間違った答えを出さない**（範囲を明示して warn）

## 保存（localStorage）

- **正本は vault 側**（永続データ）。localStorage は UI 状態・「その場の入力」・
  **環境依存の設定**（lib/config.js）の3種だけ
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

- **vault のフォルダ名・vault 名をコードに書かない**（利用者ごとに違う）。
  `lib/config.js` に置き、画面上の設定欄で編集させる
- **既定は「無効」側に倒す**。設定が無いときは、機能を推測で動かさず
  「やらない」か「開始させない」を選ぶ:
  - **非公開フォルダは「未設定（`null`）」と「除外なし（`[]`）」を型で区別する。**
    未設定のうちは走査を開始させない（読むだけでも事故になるため）
  - 検査していない項目を「問題なし ✅」と表示しない（クラスごと出さない）
  - vault 名が未設定なら `obsidian://` リンクを作らない（押しても開かないリンクを作らない）
- `.obsidian/` `.git/` `.trash/` は**設定に関係なく常に除外**（設定可能にしない）
- 書き込みツールは**保存前に再読して NFC 比較**（外部変更検知。taskboard が正本実装）
- ノートの削除・一括リネームに相当する操作は作らない（**提案表示まで** — 掟②）
- Obsidian で開くリンクは `obsidian://open?vault=<名>&file=<encodeURIComponent(名前)>`

## 変更の作法

- 依頼された1ツールのみ。改善案は実装せず提案（CLAUDE.md）
- **「しない」と判断済みの項目を蒸し返さない** — ux-backlog「やらないと判断したもの」「現状維持」、
  tool-backlog「却下済み」、各 spec「やらないこと」「決定事項（Q番号）」を変更前に確認する
- コミットは論理単位・日本語1行。spec・実装・テストは同じコミットに入れる
