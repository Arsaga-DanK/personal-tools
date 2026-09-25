# 構成の組み替え 実装計画（2026-09-25）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** URL・テスト ID・フックを変えずに、taskboard と issue の3点セット（HTML・テスト・spec）を同名フォルダで分割し、本数・ID・行数を機械が見張る器を作る。

**Architecture:** classic script は同じグローバル字句スコープを共有するので、既存の1本の `<script>` を節コメントの境目で切り、元の順序で `<script src>` に並べれば連結等価で挙動が変わらない。テストは入口ハーネスが `ctx`（page・runner・fixture・共通ヘルパ）を作り、`test/<alias>/<節>.js` の `run(ctx)` を元の順序で回す。spec は見出し単位の移動だけで書き直さない。

**Tech Stack:** zsh（`test/run`）・perl（ゲート）・node v22 + playwright-core（ハーネス）・classic script（file://）

**Spec:** `docs/audits/2026-09-25-structure.md`

## Global Constraints

- `file://` で開いて動く。ES モジュール禁止。`<script src>` は相対パス（`taskboard/engine.js` のように入口ページからの相対）
- 描画は `textContent` / `createElement` / `createElementNS` のみ（innerHTML 禁止）。今回はコードの中身を書き換えないので新規違反は生まれない
- **URL（`web/<alias>.html`）・テスト ID・`window.<alias>` フック・localStorage キー・IndexedDB の db 名（`tools-taskboard` / `tools-issue`）・store 名（`handles`）・version 1 を変えない**。例外はテスト ID の重複 5 件の改名だけ（Task 4）
- 合否の正本は `./test/run` 全 pass（開始時 886 チェック・0 fail・コンソールエラー 0）。各 Task の最後に該当ハーネス、各段階の最後に全スイート
- ソースに不可視文字（U+00A0 / U+200B / U+FEFF 等）を実文字で書かない。`test/run` の文字ゲートが落とす
- `lib/*.js` の読み込み順: `config.js` は `ui.js` → `storage.js` の後、`mmd.js` は `vendor/mermaid.min.js` の後。`fsa.js` は依存なし（`storage.js` の直後に置く）
- 各 Task の前に `git status --short` が空であること（別セッションが同じリポジトリを編集していることがある）
- コミットは論理単位・日本語1行の subject。末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- `excel2md/`（旧リポジトリ・追跡外）には触らない
- 切り出しは必ず **コミット済みの原本（`git show HEAD:<path>`）から** 行う。作業中のファイルから行番号で切ると、前の編集で行がずれる
- 作業用の一時ファイルはセッションのスクラッチパッド（`/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/<session>/scratchpad/`）に置き、リポジトリに残さない

## Review Focus

1. `./test/run taskboard timeline-ui` に**存在しない節名**を渡したとき、0 チェックのまま緑にならない（exit 2 で節名の一覧を出す）→ Task 8 Step 7
2. ID ゲートの部分一致: spec に `TB-10` しか無いとき `TB-1` を「ある」と誤判定しない（前後が英数字・ハイフンでないことを見る）→ Task 3 Step 2
3. `lib/fsa.js` へ移しても db 名 `tools-taskboard` が変わらず、利用者のブラウザに残っているハンドルが読める → Task 6 Step 2
4. 節ファイルが途中で例外を投げたとき、ブラウザが閉じられ exit code が非 0 になる（緑のまま止まらない）→ Task 8 Step 7
5. 行数警告は**落とさず**、超過ファイルのパスを出す。1,001 行のダミーを置いて出ることを目視 → Task 2 Step 2

---

## 段階①: 器（Task 1〜7）

### Task 1: `test/run` — ゲートを再帰にし、所要時間を出す

**Files:**
- Modify: `test/run`（文字ゲートの対象リスト・バナー引数ゲートの対象リスト・ハーネス実行ループ）

**Interfaces:**
- Consumes: なし
- Produces: `./test/run <alias> [節名…]` が節名をハーネスに素通しする（既存の `shift` 後の `"$@"`）。各ハーネスの後に `（所要 N秒）` を出す

- [ ] **Step 1: 文字ゲートの対象を再帰にする**

`test/run` の文字ゲート（`perl -MEncode -ne '…'` の直後の引数行）を次に置き換える。zsh の `**/` は `env -i /bin/zsh` でも効くことを 2026-09-25 に確認済み。`(N)` は該当ゼロでもエラーにしない glob 修飾子。

```zsh
      test/**/*.js web/**/*.html web/**/*.js(N) index.html lib/*.js test/run \
      docs/**/*.md CLAUDE.md README.md test/README.md .cursor/rules/*.mdc(N); then
```

- [ ] **Step 2: バナー引数ゲートの対象を再帰にする**

同じファイルの2つ目の perl（`バナー API の引数順チェック`）の引数 `web/*.html lib/*.js test/*.js` を次にする。

```zsh
      web/**/*.html web/**/*.js(N) lib/*.js test/**/*.js; then
```

- [ ] **Step 3: 実行ループに所要時間を足す**

```zsh
failed=0
for harness in $targets; do
  print                      # -r は \n を解釈しないため空行は独立して出す
  print -r -- "### $harness"
  t0=$SECONDS
  node "$harness" "$@" || failed=1
  print -r -- "（所要 $(( SECONDS - t0 ))秒）"
done
```

- [ ] **Step 4: 動かして確かめる**

Run: `./test/run launcher`
Expected: `10 pass / 0 fail` の後に `（所要 N秒）`。文字ゲートが README.md を初めて見るので、ここで落ちたら README の該当行を直す（許可範囲外の文字なら U+XXXX 表記か置換。todo #11 は「現状混入なし」だが README はその後 5 回変わっている）

- [ ] **Step 5: Commit**

```bash
git add test/run README.md
git commit -m "test/run: 文字・バナーのゲートを再帰にし README も対象へ、ハーネスごとの所要時間を表示

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: `test/run` — 行数の警告

**Files:**
- Modify: `test/run`（バナー引数ゲートの直後・`typeset -a targets` の前）

**Interfaces:**
- Produces: 1,000 行超のファイルを「注意:」で列挙する。exit code は変えない

- [ ] **Step 1: 警告ブロックを足す**

```zsh
# 行数の警告（2026-09-25 設計 docs/audits/2026-09-25-structure.md §4-1）。
# **落とさない** — 次に膨らむものを早く知るためのもの。1,000 行を超えたら同名フォルダに分ける
# （coding-rules「ファイルの分割」）。既知の超過は SIZE_KNOWN に列挙し、分けたらここから消す。
SIZE_LIMIT=1000
typeset -a SIZE_KNOWN=(web/devpad.html web/mask.html web/gantt.html web/board.html test/mask.js test/devpad.js)
typeset -a big
for f in web/**/*.html web/**/*.js(N) test/**/*.js docs/specs/**/*.md; do
  n=$(wc -l < "$f"); n=${n// /}
  (( n > SIZE_LIMIT )) && (( ! ${SIZE_KNOWN[(Ie)$f]} )) && big+=("$n $f")
done
if (( ${#big} )); then
  print -r -- "注意: ${SIZE_LIMIT} 行を超えるファイル（同名フォルダに分ける — coding-rules「ファイルの分割」）:"
  for b in $big; do print -r -- "  $b"; done
fi
```

- [ ] **Step 2: 出ることを確かめる（Review Focus 5）**

Run: `./test/run launcher`
Expected: 注意ブロックに `web/taskboard.html` `test/taskboard.js` `web/issue.html` `docs/specs/taskboard.md` `test/issue.js` の5本が出て、その後ハーネスは普通に走り exit 0。
続けて `seq 1001 > web/zz-probe.html && ./test/run launcher; rm web/zz-probe.html` で `1001 web/zz-probe.html` が出ることを見る（見たら必ず消す）

- [ ] **Step 3: Commit**

```bash
git add test/run
git commit -m "test/run: 1,000 行超のファイルを警告（既知の6本は除外リスト）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: spec ⇔ テスト ID の整合ゲート（RED → 取りこぼし 10 行を spec に足す → GREEN）

**Files:**
- Modify: `test/run`（行数警告の直後）
- Modify: `docs/specs/issue.md`（テストケース表に 8 行）・`docs/specs/norm.md`（1 行）・`docs/specs/taskboard.md`（1 行）

**Interfaces:**
- Produces: `test/<alias>.js` と `test/<alias>/*.js` の `r.check('XX-nn…` の ID が `docs/specs/<alias>.md` か `docs/specs/<alias>/*.md` にあること、同じ alias 内で重複しないことを落とす。hub は対象外

- [ ] **Step 1: ゲートを書く**

```zsh
# spec ⇔ テスト ID の整合（2026-09-25 設計 §5）。「期待値の正本は spec」を機械に持たせる。
#   - r.check('XX-nn…' の ID が docs/specs/<alias>.md か docs/specs/<alias>/*.md に語境界つきである
#     （TB-1 が TB-10 に当たらない。末尾の小文字1字は「同 ID の別経路」= b / a を剥がして照合）
#   - 同じ alias のテストで同じ ID を2度使わない（2026-09-25 に TB-M1/M2・TB-T1〜T3 の二重使用を検出）
#   - hub は spec を持たない設計（test/hub.js 冒頭）なので対象外
if ! perl -e '
      use strict; my %spec; my %seen; my $bad = 0;
      sub slurp { local $/; open my $h, "<", $_[0] or return ""; my $t = <$h>; close $h; $t }
      for my $f (sort(glob("test/*.js"), glob("test/*/*.js"))) {
        next if $f =~ m{/helpers\.js$};
        my ($alias) = $f =~ m{^test/([a-z0-9]+)(?:/[a-z0-9-]+)?\.js$} or next;
        next if $alias eq "hub";
        $spec{$alias} //= join "\n", map { slurp($_) } (glob("docs/specs/$alias.md"), glob("docs/specs/$alias/*.md"));
        open my $h, "<", $f or die "$f: $!";
        while (<$h>) {
          next unless /r\.check\(\s*[\x27"`]([A-Z][A-Z0-9]*-[A-Za-z]*\d+[a-z]?)/;
          my $id = $1; (my $base = $id) =~ s/[a-z]$//;
          if ($seen{$alias}{$id}++) { print "  $f:$. ID が重複しています: $id\n"; $bad = 1; next; }
          next if $spec{$alias} =~ /(?<![A-Za-z0-9-])\Q$base\E(?![0-9A-Za-z])/;
          print "  $f:$. spec に無い ID: $id（docs/specs/$alias.md か docs/specs/$alias/*.md に書く）\n"; $bad = 1;
        }
        close $h;
      }
      exit($bad ? 1 : 0)'; then
  print -r -- "テストの ID と spec が食い違っています（上記の行）。期待値の正本は spec なので spec 側に足してください" >&2
  exit 1
fi
```

- [ ] **Step 2: RED を見る（Review Focus 2 を含む）**

Run: `./test/run launcher`
Expected: 次の 15 行が出て exit 1（順不同）: `test/issue.js` の IS-L5 / IS-L5b / IS-L6 / IS-UL8 / IS-UL9 / IS-UL10 / IS-UL11 / IS-UL18a、`test/norm.js` の NM-13、`test/taskboard.js` の TB-AS4、重複 TB-M1 / TB-M2 / TB-T1 / TB-T2 / TB-T3。
部分一致の確認: `docs/specs/norm.md` に一時的に `NM-130` と書いても NM-13 の行が消えないこと（確認後に戻す）

- [ ] **Step 3: spec に取りこぼし 10 行を足す**

`docs/specs/issue.md` のテストケース表: `| IS-UL18 |` の行の直後に

```
| IS-UL18a | 切り出し（Step 5 の案件欄） | 元ノートの `project`（PEW）が初期値で候補にも並び、作ったノートに `project: PEW` が入る |
```

`| IS-L4 |` の行の直後に

```
| IS-L5 | `upsertFrame`（書き殴りノート） | ノートの先頭に5段が入り、既存の TODO や自作見出しはそのまま残る |
| IS-L5b | `upsertFrame` を2回 | 2回目は5段の範囲だけ差し替える（重複して増えない） |
| IS-L6 | `setIssueLine` | 論点の一行だけを書ける。節が無ければ本文の先頭に作り、あれば中身を差し替える |
```

`| IS-UL7 |` の行の直後に

```
| IS-UL8 | `## 論点` のあるノート／無いノート | 行ごとにカード／ノートで1枚。見出しでグループ化する |
| IS-UL9 | ［＋論点を足す］ | 節が無いノートにも作れる・その場で判定が出る・書き殴りは残る |
| IS-UL10 | 行を閉じる | `[x]`＋✅＋判定が付き、分かったことは子行に入る。他の行とノートの状態は不変 |
| IS-UL11 | 切り出し | 新ノート（5段）ができ、元の行に `[[リンク]]`、新ノートに ← の逆リンクが入る |
```

`docs/specs/norm.md` の `| NORM-14 |` の行（表の末尾）の直後に

```
| NM-13 | 設定のインポートに成功 | （設定 JSON） | 「インポートしました」の success バナーが出る。`run()` がバナーを消した**後**に出す（ux-backlog NM-13 の回帰） | — |
```

`docs/specs/taskboard.md` の `| TB-AS3 |` の行の直後に

```
| TB-AS4 | 自動保存をスキップした状態で［今すぐ保存］ | 確認ダイアログのうえで保存できる（スキップは自動保存だけを止める） |
```

- [ ] **Step 4: 重複はまだ残るので Task 4 へ**（このコミットは Task 4 と一緒にする）

### Task 4: 重複テスト ID の改名（新しい側だけ）

**Files:**
- Modify: `docs/specs/taskboard.md`（モード切替の表 5 行）
- Modify: `test/taskboard.js`（`r.check` 5 行・節コメント 3 行・冒頭コメント 1 行）

**Interfaces:**
- Produces: TB-M1→TB-MS1、TB-M2→TB-MS2、TB-T3→TB-MS3（モード切替とモーダルの殻・2026-09-24）、TB-T1→TB-UI1、TB-T2→TB-UI2（ツールバー）。古い側（メモ TB-M1〜M12・タグ TB-T1〜T5）は不変

- [ ] **Step 1: spec の表を直す**

```bash
perl -pi -e '
  s/^\| TB-M1 \| モードセグメント/| TB-MS1 | モードセグメント/;
  s/^\| TB-M2 \| モーダルを開く/| TB-MS2 | モーダルを開く/;
  s/^\| TB-T1 \| 起動直後のツールバー/| TB-UI1 | 起動直後のツールバー/;
  s/^\| TB-T2 \| 編集 → 自動保存/| TB-UI2 | 編集 → 自動保存/;
  s/^\| TB-T3 \| Cmd\/Ctrl\+Shift\+E/| TB-MS3 | Cmd\/Ctrl+Shift+E/;
' docs/specs/taskboard.md
grep -n '^| TB-MS[123] \|^| TB-UI[12] ' docs/specs/taskboard.md   # 5 行出る
```

- [ ] **Step 2: テストを直す**

```bash
perl -pi -e '
  s/r\.check\(\x27TB-M1（モードセグメント/r.check(\x27TB-MS1（モードセグメント/;
  s/r\.check\(\x27TB-M2（lib\/ui\.css へ移設後/r.check(\x27TB-MS2（lib\/ui.css へ移設後/;
  s/r\.check\(\x27TB-T1（常時のボタンは最小/r.check(\x27TB-UI1（常時のボタンは最小/;
  s/r\.check\(\x27TB-T2（［今すぐ保存］は未保存のときだけ/r.check(\x27TB-UI2（［今すぐ保存］は未保存のときだけ/;
  s/r\.check\(\x27TB-T3（Cmd\/Ctrl\+Shift\+E で Check Issue へ移る/r.check(\x27TB-MS3（Cmd\/Ctrl+Shift+E で Check Issue へ移る/;
  s/TB-M1\/M2: モード切替と、lib\/ui\.css へ移設したモーダルの殻/TB-MS1\/MS2: モード切替と、lib\/ui.css へ移設したモーダルの殻/;
  s/TB-T1\/T2: ツールバーの整理と未保存インジケータ/TB-UI1\/UI2: ツールバーの整理と未保存インジケータ/;
  s/TB-T3: Cmd\/Ctrl\+Shift\+E でモード切替/TB-MS3: Cmd\/Ctrl+Shift+E でモード切替/;
  s/TB-M1〜M2（モード切替と共通モーダル）/TB-MS1〜MS3（モード切替・モーダルの殻・Cmd+Shift+E）\/ TB-UI1〜UI2（ツールバー）/;
' test/taskboard.js
grep -c "TB-MS[123]\|TB-UI[12]" test/taskboard.js   # 9 以上
```

- [ ] **Step 3: GREEN を見る**

Run: `./test/run taskboard`
Expected: ID ゲートが無言で通り、`269 pass / 0 fail`

- [ ] **Step 4: Commit（Task 3 と合わせて）**

```bash
git add test/run docs/specs/issue.md docs/specs/norm.md docs/specs/taskboard.md test/taskboard.js
git commit -m "test/run: spec とテスト ID の整合ゲート — spec に無かった 10 ID を spec に記録し、二重使用の 5 ID（モード切替・ツールバー）を TB-MS1〜MS3 / TB-UI1〜UI2 に改名

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: 本数の一元化（`TOOL_COUNT`）と HUB-27（3点セットの存在）

**Files:**
- Modify: `test/helpers.js`（末尾の `module.exports`）
- Modify: `test/hub.js`（`=== 17` の 9 箇所・ラベルの `17本` 2 箇所・HUB-16 の後に HUB-27）
- Modify: `test/launcher.js`（`=== 17` 4 箇所・ラベル 2 箇所）

**Interfaces:**
- Produces: `require('./helpers').TOOL_COUNT`（number）。ツールを足すときはここを +1 する（固定ピンの唯一の置き場）

- [ ] **Step 1: helpers.js に定数を足す**

`const eq = …` の直後に

```js
/* ツール本数の固定ピン（2026-09-25 に hub.js の 9 箇所・launcher.js の 4 箇所から一元化）。
   固定ピンは「ツールの増減を意識的な仕様変更にする関門」なので導出にはしない（coding-rules）。
   ツールを足したら +1 する。CLAUDE.md には本数を書かない（ここと README を HUB-15 / HUB-27 が照合する） */
const TOOL_COUNT = 17;
```

`module.exports` に `TOOL_COUNT` を足す。

- [ ] **Step 2: hub.js を置き換える**

`const { launch, fileUrl, createRunner, eq } = require('./helpers');` を `const { launch, fileUrl, createRunner, eq, TOOL_COUNT } = require('./helpers');` にし、次の行の `17` を `TOOL_COUNT` にする（行番号は 2026-09-25 時点。文字列で探すこと）:
`order.chips[0].n === 17`、`listed.names.length === 17 && listed.unique === 17 && listed.total === 17`、`search.partialName.length === 17`、`search.aliasProbe.length === 17`、`chipFilter.released.names.length === 17`、`navResults.length === 17`（2 箇所）、`fits.links === 17`、`recent.listLinks === 17`。
ラベル `'HUB-1（チップ: 先頭が「すべて 17」…'` と `'HUB-7（17本すべて…'` は `'HUB-1（チップ: 先頭が「すべて ' + TOOL_COUNT + '」…'` の形にする。

- [ ] **Step 3: launcher.js を置き換える**

同様に `tools.length === 17`、`open1.n === 17`、`search.back === 17`、`noStorage.n === 17` を `TOOL_COUNT` に、ラベル `'LA-01（17本すべてに…'` を `'LA-01（' + TOOL_COUNT + '本すべてに…'` にする。require に `TOOL_COUNT` を足す。

- [ ] **Step 4: HUB-27 を足す**

`test/hub.js` の HUB-16 の `r.check` の直後に

```js
  /* ---------- 3点セットがそろっている（HUB-27・2026-09-25） ----------
     TOOLS の各行に web/<alias>.html・docs/specs/<alias>.md・test/<alias>.js がある。
     CLAUDE.md から本数と英名の対応表を消した代わりに、登録簿と実ファイルの対応をここで照合する。
     spec を同名フォルダに分けても docs/specs/<alias>.md（目次）は残す規約（coding-rules「ファイルの分割」）。 */
  const missingFiles = entries.flatMap(t => [
    'web/' + t.alias + '.html', 'docs/specs/' + t.alias + '.md', 'test/' + t.alias + '.js',
  ].filter(p => !fs.existsSync(path.resolve(__dirname, '..', p))));
  r.check('HUB-27（TOOLS の各ツールに web / spec / test の3点があり、本数が TOOL_COUNT）',
    missingFiles.length === 0 && entries.length === TOOL_COUNT,
    JSON.stringify({ missingFiles, count: entries.length, pinned: TOOL_COUNT }));
```

- [ ] **Step 5: わざと壊して RED を見てから GREEN**

`TOOL_COUNT` を一時的に 16 にして `./test/run hub` → HUB-1/4/… と HUB-27 が落ちる。17 に戻して `./test/run hub` と `./test/run launcher` が全 pass。

- [ ] **Step 6: Commit**

```bash
git add test/helpers.js test/hub.js test/launcher.js
git commit -m "test: ツール本数の固定ピンを helpers.js の TOOL_COUNT に一元化し、HUB-27 で web/spec/test の3点セットを照合

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: `lib/fsa.js` — issue と taskboard の IndexedDB ハンドル保存と権限確認を共有

**Files:**
- Create: `lib/fsa.js`
- Modify: `web/issue.html`（`<script src>` 1 行追加・IDB 3 関数の削除・`ensureDir` / `fsaAvailable` / 呼び出し 3 箇所）
- Modify: `web/taskboard.html`（`<script src>` 1 行追加・IndexedDB 節の削除・`verifyPermission`・呼び出し 8 箇所）
- Modify: `docs/specs/taskboard.md`（ハンドル永続化仕様に TB-FS1）・`docs/specs/issue.md`（保存の節に 1 行）・`docs/coding-rules.md`（lib 表に 1 行）
- Test: `test/taskboard.js`（TB-FS1 を TB-AS4 の直後に追加）

**Interfaces:**
- Produces: `window.ToolFsa = { handles(dbName) → { get(key), set(key, val) }, ensurePermission(handle, mode = 'readwrite') → Promise<boolean>, available(kind: 'dir' | 'file') → boolean }`
- Consumes: なし（`lib/storage.js` の直後に読む。依存なし）

- [ ] **Step 1: spec に TB-FS1 を書く（RED の準備）**

`docs/specs/taskboard.md` の `## ハンドル永続化仕様（設計判断: ToolStorage 拡張ではなく専用実装）` の節の末尾（次の `## フォールバック仕様` の直前）に

```
実装は `lib/fsa.js`（2026-09-25 に Check Issue とバイト一致していた 30 行を共有化）。
**db 名 `tools-taskboard`・store 名 `handles`・version 1 は変えない** — 変えると利用者のブラウザに
残っているハンドルが見えなくなり、tasks.md を選び直すことになる。

| ID | 操作 | 期待 |
|---|---|---|
| TB-FS1 | `ToolFsa.handles('tools-taskboard').set('probe', 1)` | `indexedDB.databases()` に `tools-taskboard` があり、`get('probe')` が 1 を返す（共有化しても db 名が変わらない） |
```

`docs/specs/issue.md` の `## 保存` の節の末尾に

```
- フォルダのハンドルは IndexedDB `tools-issue` に持つ（実装は `lib/fsa.js`・2026-09-25 に Plan Tasks と共有化。db 名は不変）。
  権限の問い合わせが例外を投げたときは「選び直させる」に倒す（従来は例外がそのまま出ていた。ToolFsa.ensurePermission が false を返す）
```

- [ ] **Step 2: テストを書いて RED を見る**

`test/taskboard.js` の `r.check('TB-AS4（…` の `r.check` の直後に

```js
  /* ---------- TB-FS1: ハンドル保存の db 名が変わっていない（lib/fsa.js への移行の回帰・2026-09-25） ---------- */
  const fsDb = await page.evaluate(async () => {
    const h = ToolFsa.handles('tools-taskboard');
    await h.set('probe', 1);
    const dbs = await indexedDB.databases();
    return { listed: dbs.some(d => d.name === 'tools-taskboard'), back: await h.get('probe') };
  });
  r.check('TB-FS1（ToolFsa.handles が従来の db 名 tools-taskboard に書き、読み戻せる）',
    fsDb.listed && fsDb.back === 1, JSON.stringify(fsDb));
```

Run: `./test/run taskboard`
Expected: `TB-FS1` が FAIL（`ToolFsa is not defined` がコンソールエラーにも出る）

- [ ] **Step 3: `lib/fsa.js` を書く**

```js
'use strict';
/* lib/fsa.js — File System Access のハンドル永続化と権限確認（Check Issue / Plan Tasks で共有）
   目的: ①FileSystemHandle を IndexedDB に覚える（structured clone が要るので localStorage には置けない）
        ②queryPermission → requestPermission の順で権限を確保する
        ③API の有無を1箇所で判定する
   入力: なし
   出力: window.ToolFsa = { handles(dbName), ensurePermission(handle, mode), available(kind) }
   例:   const handles = ToolFsa.handles('tools-taskboard');   // db 名はツールごと（file:// は全ページ同一オリジン）
         await handles.set('tasksmd', fileHandle);  const h = await handles.get('tasksmd');
         if (await ToolFsa.ensurePermission(h)) { … }          // 既定は readwrite
         if (!ToolFsa.available('dir')) { … }                   // 'dir' = showDirectoryPicker / 'file' = showOpenFilePicker

   2026-09-25 に issue.html と taskboard.html でバイト一致していた 30 行を寄せた
   （設計: docs/audits/2026-09-25-structure.md §5）。
   **db 名・store 名（'handles'）・version 1 は元のまま** — 変えると利用者のブラウザに残っている
   ハンドルが見えなくなり、tasks.md や 04_Issues を選び直すことになる（TB-FS1 が db 名をピンする）。
   ensurePermission は query / request が例外を投げても false を返す（taskboard の verifyPermission と同じ。
   issue 側は従来 例外をそのまま投げていたが「選び直させる」に倒した — IS spec「保存」）。
   vaultlint は「検査は read・修復時だけ readwrite」の二段階権限で構造が違うので使わない。 */
(function (global) {
  'use strict';
  var STORE = 'handles';

  function open(dbName) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  // 1つの db に対する get / set。呼び出しごとに開いて閉じる（従来どおり。開きっぱなしにしない）
  function handles(dbName) {
    return {
      get: async function (key) {
        var db = await open(dbName);
        try {
          return await new Promise(function (res, rej) {
            var g = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            g.onsuccess = function () { res(g.result); };
            g.onerror = function () { rej(g.error); };
          });
        } finally { db.close(); }
      },
      set: async function (key, val) {
        var db = await open(dbName);
        try {
          await new Promise(function (res, rej) {
            var tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(val, key);
            tx.oncomplete = res;
            tx.onerror = function () { rej(tx.error); };
          });
        } finally { db.close(); }
      },
    };
  }

  async function ensurePermission(handle, mode) {
    var opt = { mode: mode || 'readwrite' };
    try {
      if (await handle.queryPermission(opt) === 'granted') return true;
      return (await handle.requestPermission(opt)) === 'granted';
    } catch (_) { return false; }
  }

  function available(kind) {
    return typeof global[kind === 'dir' ? 'showDirectoryPicker' : 'showOpenFilePicker'] === 'function';
  }

  global.ToolFsa = { handles: handles, ensurePermission: ensurePermission, available: available };
})(window);
```

- [ ] **Step 4: taskboard.html を lib/fsa.js に乗せる**

1. `<script src="../lib/storage.js"></script>` の直後に `<script src="../lib/fsa.js"></script>` を足す
2. `const IDB_STORE = 'handles';` の行を消し、`const IDB_KEY_ISSUE = …` の行の直後に
   `const handles = ToolFsa.handles(IDB_NAME);   // lib/fsa.js（db 名は従来どおり — TB-FS1）` を足す
3. `/* ========== IndexedDB（ハンドル永続化・専用実装） ==========` から `/* ========== アダプタ ========== */` の**直前まで**（idbOpen / idbGet / idbSet と末尾の空行）を削除する:
   ```bash
   perl -0pi -e 's/\/\* ========== IndexedDB（ハンドル永続化・専用実装） ==========.*?(?=\/\* ========== アダプタ ========== \*\/)//s' web/taskboard.html
   ```
4. 呼び出しを置き換える（8 箇所）: `perl -pi -e 's/\bidbGet\(/handles.get(/g; s/\bidbSet\(/handles.set(/g' web/taskboard.html`
5. `verifyPermission` の本体を差し替える。前:
   ```js
   async function verifyPermission(handle) {
     const opt = { mode: 'readwrite' };
     try {
       if (await handle.queryPermission(opt) === 'granted') return true;
       return (await handle.requestPermission(opt)) === 'granted';
     } catch (_) { return false; }
   }
   ```
   後:
   ```js
   async function verifyPermission(handle) { return ToolFsa.ensurePermission(handle); }   // lib/fsa.js（2026-09-25）
   ```
6. `grep -c 'idbGet\|idbSet\|IDB_STORE' web/taskboard.html` が 0

- [ ] **Step 5: issue.html を lib/fsa.js に乗せる**

1. `<script src="../lib/storage.js"></script>` の直後に `<script src="../lib/fsa.js"></script>` を足す
2. `const IDB_NAME = 'tools-issue';` から `let dirHandle = null;` の**直前まで**を次の 2 行に置き換える:
   ```js
   const IDB_KEY = 'issueDir';
   const handles = ToolFsa.handles('tools-issue');   // lib/fsa.js（db 名は従来どおり — 選び直させない）
   ```
   ```bash
   perl -0pi -e 's/const IDB_NAME = \x27tools-issue\x27;\n.*?(?=let dirHandle = null;)/const IDB_KEY = \x27issueDir\x27;\nconst handles = ToolFsa.handles(\x27tools-issue\x27);   \/\/ lib\/fsa.js（db 名は従来どおり — 選び直させない）\n\n/s' web/issue.html
   ```
3. `function fsaAvailable() { return typeof window.showDirectoryPicker === 'function'; }` → `function fsaAvailable() { return ToolFsa.available('dir'); }`
4. `ensureDir` の権限部分。前:
   ```js
     if (dirHandle) {
       const q = await dirHandle.queryPermission({ mode: 'readwrite' });
       if (q === 'granted') return dirHandle;
       if ((await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted') return dirHandle;
       dirHandle = null;   // 拒否された: 選び直させる
     }
   ```
   後:
   ```js
     if (dirHandle) {
       if (await ToolFsa.ensurePermission(dirHandle)) return dirHandle;
       dirHandle = null;   // 拒否された（問い合わせの失敗も含む）: 選び直させる
     }
   ```
5. `perl -pi -e 's/\bidbGet\(/handles.get(/g; s/\bidbSet\(/handles.set(/g' web/issue.html`（2 箇所: `ensureDir` の保存と起動の読み出し）
6. `grep -c 'idbGet\|idbSet\|IDB_NAME\|IDB_STORE' web/issue.html` が 0

- [ ] **Step 6: coding-rules の lib 表に行を足す**

`| edit.js | …` の行の直後に

```
| fsa.js | `ToolFsa.handles(dbName)` → `{get, set}` / `ensurePermission(handle, mode)` / `available('dir'|'file')` | FSA ハンドルの IndexedDB 保存と権限確認（issue / taskboard）。**db 名はツールごと・変えない**（file:// は全ページ同一オリジン。TB-FS1 がピン）。vaultlint は二段階権限（read → 修復時 readwrite）なので使わない |
```

- [ ] **Step 7: GREEN と全スイート**

Run: `./test/run taskboard` → `270 pass / 0 fail`。`./test/run issue` → `87 pass / 0 fail`。`./test/run vaultlint` → 変化なし。
Run: `./test/run` → 全 pass（887 チェック以上・コンソールエラー 0）。段階①の締め

- [ ] **Step 8: Commit**

```bash
git add lib/fsa.js web/issue.html web/taskboard.html docs/specs/taskboard.md docs/specs/issue.md docs/coding-rules.md test/taskboard.js
git commit -m "lib/fsa.js: issue と taskboard でバイト一致していた IndexedDB ハンドル保存と権限確認を共有（db 名は不変・TB-FS1 でピン）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 段階②: taskboard の HTML を同名フォルダに分ける（Task 7）

### Task 7: `web/taskboard.html` → 入口＋ `web/taskboard/*.js` 8 本（連結等価）

**Files:**
- Create: `web/taskboard/engine.js` `io.js` `list.js` `board.js` `timeline.js` `archive.js` `modal.js` `ui.js`
- Modify: `web/taskboard.html`（インライン `<script>` 1 本 → 定数のインライン・`<script src>` 8 行・フックと起動のインライン）

**Interfaces:**
- Consumes: Task 6 後の `web/taskboard.html`（IndexedDB 節は無く、`const handles = …` が定数節にある）
- Produces: ページの挙動は同一。`window.taskboard` フックは入口ページの末尾インラインに残る

- [ ] **Step 1: 原本を確保し、切れ目を求める**

すべて**コミット済みの原本**から切る。

```zsh
cd /Users/dan.kawazu/Personal/tools
git status --short            # 空であること
T=/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/f962d162-1ef8-485c-a6f3-636416c023bf/scratchpad/tb; mkdir -p $T
git show HEAD:web/taskboard.html > $T/orig.html
P=$T/orig.html
ln()  { grep -nF  -- "$1" "$P" | head -1 | cut -d: -f1 }   # 先頭一致（節コメントは一意）
lnx() { grep -nxF -- "$1" "$P" | head -1 | cut -d: -f1 }   # 行全体一致（<script> / </script> は lib の行にも含まれるため）
S=$(lnx '<script>'); E=$(lnx '</script>')
[[ "$(sed -n "$((S+1))p" $P)" == "'use strict';" ]] || { print "想定外: <script> の次が 'use strict' でない"; exit 1 }
A=$(ln '/* ========== エンジン（純粋・I/O なし） ==========')
B=$(ln '/* ========== アダプタ ========== */')
C=$(ln '/* ---------- 描画 ---------- */')
D=$(ln '/* ---------- ボードビュー（列＝セクション） ---------- */')
F=$(ln '/* ---------- 計画ビュー（タイムライン）の描画 ---------- */')
G=$(ln '/* ---------- 完了アーカイブ ---------- */')
H=$(ln 'function renderRow(t, today) {')
I=$(ln '/* ---------- ポップオーバー ---------- */')
J=$(ln '/* ---------- Excel 用コピー ---------- */')
K=$(ln '/* ---------- テストフック（spec 検証用） ---------- */')
print "S=$S A=$A B=$B C=$C D=$D F=$F G=$G H=$H I=$I J=$J K=$K E=$E"   # すべて数値で S<A<B<…<K<E
```

- [ ] **Step 2: 断片を切り出し、連結等価を確かめる**

```zsh
piece() { sed -n "$1,$2p" "$P" }
piece $((S+2)) $((A-1)) > $T/head       # 'use strict' の次から: TOOL / VAULT_NAME / MAX_CHARS / IDB キー / handles
piece $A $((B-1))       > $T/engine
piece $B $((C-1))       > $T/io
piece $C $((D-1))       > $T/list1
piece $D $((F-1))       > $T/board
piece $F $((G-1))       > $T/timeline
piece $G $((H-1))       > $T/archive
piece $H $((I-1))       > $T/list2      # renderRow / renderMemoRow / IME ガード（アーカイブ節に迷い込んでいた分 — todo #17）
piece $I $((J-1))       > $T/modal
piece $J $((K-1))       > $T/ui
piece $K $((E-1))       > $T/tail       # テストフックと起動
cat $T/head $T/engine $T/io $T/list1 $T/board $T/timeline $T/archive $T/list2 $T/modal $T/ui $T/tail \
  | diff - <(piece $((S+2)) $((E-1))) && print "連結等価 OK（断片を元の順に繋ぐと元のスクリプト本体と一致）"
```

Expected: `連結等価 OK`。出なければ切れ目のどれかが違う（Step 1 の値を見直す）

- [ ] **Step 3: 8 本を書く**

```zsh
mkdir -p web/taskboard
mk() {   # $1=名前 $2=説明 $3…=断片
  local name=$1 desc=$2; shift 2
  { print -r -- "'use strict';"
    print -r -- "/* web/taskboard/$name.js — $desc"
    print -r -- "   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、"
    print -r -- "   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */"
    print
    cat "$@"
  } > web/taskboard/$name.js
}
print -r -- '/* ---------- 行の描画（2026-09-25 にアーカイブ節から描画の隣へ戻した — todo #17） ---------- */' > $T/list2h
mk engine   '純関数（依存関係・ステータス・編集 op・メモ・親子の付け替え・解析・依存グラフ・タイムラインのモデル）。DOM も I/O も触らない' $T/engine
mk io       'アダプタ・アプリ状態（state / el / todayStr）・バナー・読込保存・外部変更検知・FSA フロー・イシューノート・初期化・デモ' $T/io
mk list     '一覧の描画・検索ハイライト・行の描画・インライン編集と IME ガード' $T/list1 $T/list2h $T/list2
mk board    'ボードビュー（列＝セクション・カードのドラッグ）' $T/board
mk timeline 'タイムラインの描画（目盛り・セクション・矢印）とバーのドラッグ' $T/timeline
mk archive  '完了アーカイブ（対象の判定・archive.md への追記・tasks.md からの除去）' $T/archive
mk modal    'ポップオーバーと追加・編集モーダル' $T/modal
mk ui       'Excel コピー・週報コピー・UI 状態の永続化・イベント配線' $T/ui
wc -l web/taskboard/*.js
```

- [ ] **Step 4: 入口ページを組み替える**

```zsh
{ sed -n "1,$((S-1))p" $P
  print -r -- '<script>'
  print -r -- "'use strict';"
  print -r -- '/* このページ固有の定数。以下の web/taskboard/*.js はこの順で読む（前のファイルの宣言だけを読み込み時に使う） */'
  cat $T/head
  print -r -- '</script>'
  for f in engine io list board timeline archive modal ui; do print -r -- "<script src=\"taskboard/$f.js\"></script>"; done
  print -r -- '<script>'
  print -r -- "'use strict';"
  cat $T/tail
  print -r -- '</script>'
  sed -n "$((E+1)),\$p" $P
} > $T/page && cp $T/page web/taskboard.html
grep -c '<script' web/taskboard.html      # 18 = lib 8（fsa.js 込み）+ インライン 2 + src 8
```

- [ ] **Step 5: 動かす**

Run: `./test/run taskboard` → `270 pass / 0 fail`・コンソールエラー 0。`./test/run launcher` と `./test/run hub`（ページを開く経路）も pass。
文字ゲートとバナー引数ゲートが `web/taskboard/*.js` を見ている（Task 1 の再帰化）ので、ここで落ちたら断片の中身ではなくヘッダコメントを疑う。
行数警告から `web/taskboard.html` が消え、`web/taskboard/*.js` はどれも 1,000 行未満であること（`wc -l`）

- [ ] **Step 6: 目視 1 回**

`open web/taskboard.html` で実機（file://）を開き、［デモデータを表示］→ 一覧・ボード・計画の3ビューを切り替え、追加モーダルを開閉する。コンソールにエラーが無いこと（自動テストが通っていれば通るはずだが、`file://` の実機は1回見る）

- [ ] **Step 7: Commit**

```bash
git add web/taskboard.html web/taskboard/
git commit -m "taskboard: HTML を入口＋ web/taskboard/*.js 8 本に分割（節の境目で切り元の順序で読む・連結等価を確認・行の描画関数をアーカイブ節から描画へ戻す）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 段階③: taskboard のテストを入口＋節に分ける（Task 8〜9）

設計書 §6 からの変更: **節は元の実行順のまま連続した範囲で切る**（順序保持を最優先。テーマで寄せ直すと
前の節の状態に依存していた箇所が動く）。節名は範囲の主たる内容で付ける。

| 節 | 範囲（原本の節コメント） | 照合する ID |
|---|---|---|
| engine | `TB-01〜12: 編集エンジン` 〜 `UI ヘルパー` の直前 | TB-01〜20・parse・AR1/AR2・S1〜S10・A1〜A7 |
| input | `TB-I1〜I3: 追加モーダルの内容欄` 〜 `TB-P1〜P18` の直前 | I1〜I8・U1〜U7・実キー |
| timeline-model | `TB-P1〜P18: 計画ビュー` 〜 `TB-M1〜M12: メモ` の直前 | P1〜P18 |
| edit | `TB-M1〜M12: メモ` 〜 `TB-B1〜B11` の直前 | M1〜M12・C1〜C3・T1〜T5・D1〜D3・X1〜X18 |
| board-search | `TB-B1〜B11: ボードビュー` 〜 `TB-R18・R19` の直前 | B1〜B11・F1〜F18 |
| deps | `TB-R18・R19` 〜 `TB-S20〜S36` の直前 | R18/R19・R15/R16・R1〜R8・R9/R13/R17 |
| status | `TB-S20〜S36: ステータス` 〜 `TB-P20〜P32` の直前 | S20〜S40・G1〜G7 |
| timeline-ui | `TB-P20〜P32: バーのドラッグ` 〜 `TB-MS1/MS2` の直前 | P20〜P45・R10〜R12・P33〜P35・H1 |
| flows | `TB-MS1/MS2: モード切替` 〜 `TB-K1〜K11` の直前 | MS1/MS2・UI1/UI2・AS1〜AS4・FS1・H2〜H4・D4/D5・W2/W3・N1〜N6 |
| parent | `TB-K1〜K11: 親子の付け替え` 〜 `await browser.close();` の直前 | K1〜K11・MS3（遷移するので最後） |

### Task 8: `test/taskboard/fixtures.js` と入口 `test/taskboard.js`、節 10 本

**Files:**
- Create: `test/taskboard/fixtures.js`・`test/taskboard/{engine,input,timeline-model,edit,board-search,deps,status,timeline-ui,flows,parent}.js`
- Modify: `test/taskboard.js`（入口に作り替える）

**Interfaces:**
- Produces（節が受け取る `ctx`）: `{ page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath, F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9, withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey, archive, NB, plan, boardOf, searchIn, setView, tl }`
- Produces（節の形）: `module.exports = { name: string, ids: string, async run(ctx) }`
- Produces（実行）: `node test/taskboard.js [節名…]`。不明な節名は exit 2 で一覧を出す

- [ ] **Step 1: 原本と道具を用意する**

```zsh
cd /Users/dan.kawazu/Personal/tools
git status --short            # 空
T=/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/f962d162-1ef8-485c-a6f3-636416c023bf/scratchpad/tt; mkdir -p $T
git show HEAD:test/taskboard.js > $T/orig.js
P=$T/orig.js
ln()  { grep -nF  -- "$1" "$P" | head -1 | cut -d: -f1 }   # 先頭一致（節コメントは一意）
lnx() { grep -nxF -- "$1" "$P" | head -1 | cut -d: -f1 }   # 行全体一致（(async () => { は入れ子にも出るため）
cat > $T/extent.pl <<'PL'
# 使い方: perl extent.pl <file> <開始行> → その行で開いた括弧が閉じる行番号（文字列リテラルの中の括弧は無視）
my ($file, $start) = @ARGV; open my $h, "<", $file or die; my @L = <$h>; my $d = 0;
for my $i ($start .. scalar @L) {
  my $t = $L[$i-1]; $t =~ s/\x27[^\x27]*\x27//g; $t =~ s/`[^`]*`//g;
  $d += () = $t =~ /[\(\[\{]/g; $d -= () = $t =~ /[\)\]\}]/g;
  if ($d <= 0) { print "$i\n"; exit }
}
PL
ext() { perl $T/extent.pl "$P" "$1" }          # 開始行 → 終了行
blk() { sed -n "$1,$(ext $1)p" "$P" }           # 開始行から括弧が閉じるまでを出す
```

- [ ] **Step 2: fixtures.js を作る**

原本の `// spec の fixture F1（実 tasks.md の縮約。タブは \t、末尾改行あり）` の行から `(async () => {` の直前までが F1〜F5・TODAY・NFD9・NFC9・F2・F2c。F6〜F15 は節の中で宣言されているので**出現順**（F6・F15・F14・F12・F7・F8・F9・F10・F11・F13）に取り出す。

```zsh
mkdir -p test/taskboard
a=$(ln '// spec の fixture F1（実 tasks.md の縮約'); b=$(lnx '(async () => {')
{ print -r -- "'use strict';"
  print -r -- '/* test/taskboard/fixtures.js — taskboard の spec fixture（F1〜F15・TODAY・NFD9/NFC9）'
  print -r -- '   入口: test/taskboard.js が読み ctx に載せる。fixture の意味は docs/specs/taskboard/fixtures.md */'
  print
  sed -n "$a,$((b-1))p" $P
  for n in 6 15 14 12 7 8 9 10 11 13; do s=$(ln "  const F$n = "); blk $s | sed 's/^  //'; print; done
  print -r -- 'module.exports = { F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9 };'
} > test/taskboard/fixtures.js
node --check test/taskboard/fixtures.js && node -e 'const f=require("./test/taskboard/fixtures.js"); console.log(Object.keys(f).length, "fixtures")'   # 19
```

- [ ] **Step 3: 節 10 本を切り出す**

```zsh
sec() {   # $1=節名 $2=説明 $3=ID 一覧 $4=開始マーカー $5=終了マーカー（この行の直前まで）
  local name=$1 desc=$2 ids=$3 s=$(ln "$4") e=$(ln "$5")
  [[ -n $s && -n $e && $s -lt $e ]] || { print "マーカーが見つからない: $name ($s..$e)"; return 1 }
  { print -r -- "'use strict';"
    print -r -- "/* test/taskboard/$name.js — 節: $desc"
    print -r -- "   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js $name）"
    print -r -- "   照合する ID: $ids。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */"
    print -r -- 'module.exports = {'
    print -r -- "  name: '$name',"
    print -r -- "  ids: '$ids',"
    print -r -- '  async run(ctx) {'
    print -r -- '    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,'
    print -r -- '            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,'
    print -r -- '            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,'
    print -r -- '            archive, NB, plan, boardOf, searchIn, setView, tl } = ctx;'
    sed -n "$s,$((e-1))p" $P
    print -r -- '  },'
    print -r -- '};'
  } > test/taskboard/$name.js
}
sec engine         '編集エンジン（純関数・バイト保全）・外部同時編集・アーカイブ・セクション移動・事故防止・CRLF・parse' \
  'TB-01〜20・parse・AR1/AR2・S1〜S10・A1〜A7' \
  '  /* ========== TB-01〜12: 編集エンジン' '  /* ========== UI ヘルパー ========== */'
sec input          '追加モーダルの内容欄・子タスク popover・インライン編集・IME ガード（CDP 込み）・取り消しの UI 経路・実キー' \
  'TB-I1〜I8・U1〜U7' \
  '  /* ========== TB-I1〜I3: 追加モーダルの内容欄' '  /* ========== TB-P1〜P18: 計画ビュー'
sec timeline-model '計画ビュー: 🛫 のバイト保全・タイムラインのモデルと DOM・0件案内・バー操作・TSV' \
  'TB-P1〜P18' \
  '  /* ========== TB-P1〜P18: 計画ビュー' '  /* ========== TB-M1〜M12: メモ（Phase N）'
sec edit           'メモ・完了タスクを常に最下部・タグ・既定値・追加編集モーダル' \
  'TB-M1〜M12・C1〜C3・T1〜T5・D1〜D3・X1〜X18' \
  '  /* ========== TB-M1〜M12: メモ（Phase N）' '  /* ========== TB-B1〜B11: ボードビュー'
sec board-search   'ボードビューとテキスト検索（メモの自動展開を含む）' \
  'TB-B1〜B11・F1〜F18' \
  '  /* ========== TB-B1〜B11: ボードビュー' '  /* ========== TB-R18・R19: 印と完了時の警告'
sec deps           '依存関係: 印と完了時の警告・モーダルの依存欄・記法とバイト保全・依存グラフ' \
  'TB-R18/R19・R15/R16・R1〜R8・R9/R13/R17' \
  '  /* ========== TB-R18・R19: 印と完了時の警告' '  /* ========== TB-S20〜S36: ステータス'
sec status         'ステータス（3値＋保留・中止）とボードの列切替' \
  'TB-S20〜S40・G1〜G7' \
  '  /* ========== TB-S20〜S36: ステータス' '  /* ========== TB-P20〜P32: バーのドラッグ'
sec timeline-ui    'タイムライン: バーのドラッグ・吹き出し・矢印・ズーム・目盛り・セクション区切りと完了率・Draw Gantt への受け渡し' \
  'TB-P20〜P45・R10〜R12・H1' \
  '  /* ========== TB-P20〜P32: バーのドラッグ' '  /* ---------- TB-MS1/MS2: モード切替'
sec flows          'モード切替とモーダルの殻・ツールバー・自動保存・ハンドル保存の db 名・Check Issue からの受け取り・日付の既定とチップ・長いノート名・考える場所へ' \
  'TB-MS1/MS2・UI1/UI2・AS1〜AS4・FS1・H2〜H4・D4/D5・W2/W3・N1〜N6' \
  '  /* ---------- TB-MS1/MS2: モード切替' '  /* ========== TB-K1〜K11: 親子の付け替え'
sec parent         '親子の付け替え（setParent / wrapParent）と Cmd/Ctrl+Shift+E のモード切替（遷移するので最後）' \
  'TB-K1〜K11・MS3' \
  '  /* ========== TB-K1〜K11: 親子の付け替え' '  await browser.close();'
wc -l test/taskboard/*.js
```

- [ ] **Step 4: 節をまたいで使うヘルパと fixture を節から取り除く**

入口へ移すもの（原本の開始行の文字列・すべて 2 スペース字下げ）:
`  const archive = (script) => page.evaluate(([f1, today, mode]) => {`（engine）／`  const NB = s => s.split('\n').filter(l => l !== '');`（engine・1 行）／
`  const plan = (text, o) => page.evaluate(([t, opt]) => {`（timeline-model）／`  const boardOf = `（board-search）／
`  const searchIn = (view, q, composing) => page.evaluate(async ([v, s, comp]) => {`（board-search）／
`  const setView = (v) => page.evaluate(([text, today, view]) => {`（board-search）／`  const tl = (text, o) => page.evaluate(([t, opt]) => {`（timeline-ui）。
fixtures.js へ移したもの: `  const F6 = `（board-search）・F15/F14/F12（deps）・F7/F8/F9（status）・F10/F11/F13（timeline-ui）。

```zsh
cat > $T/cutdef.pl <<'PL'
# 使い方: perl cutdef.pl <file> "<開始行の先頭文字列>" → その定義（括弧が閉じるまで）を消して上書き。消した本文を stdout に出す
my ($file, $head) = @ARGV; open my $h, "<", $file or die; my @L = <$h>; close $h;
my ($s) = grep { index($L[$_], $head) == 0 } 0 .. $#L; die "not found: $head\n" unless defined $s;
my $d = 0; my $e = $s;
for my $i ($s .. $#L) { my $t = $L[$i]; $t =~ s/\x27[^\x27]*\x27//g; $t =~ s/`[^`]*`//g;
  $d += () = $t =~ /[\(\[\{]/g; $d -= () = $t =~ /[\)\]\}]/g; if ($d <= 0) { $e = $i; last } }
print @L[$s .. $e];
splice @L, $s, $e - $s + 1;
open my $o, ">", $file or die; print $o @L; close $o;
PL
cut() { perl $T/cutdef.pl test/taskboard/$1.js "$2" }
cut engine         '  const archive = (script) => page.evaluate(([f1, today, mode]) => {' >  $T/helpers.moved
cut engine         "  const NB = s => s.split('\n').filter(l => l !== '');"                 >> $T/helpers.moved
cut timeline-model '  const plan = (text, o) => page.evaluate(([t, opt]) => {'             >> $T/helpers.moved
cut board-search   '  const boardOf = '                                                    >> $T/helpers.moved
cut board-search   '  const searchIn = (view, q, composing) => page.evaluate(async ([v, s, comp]) => {' >> $T/helpers.moved
cut board-search   '  const setView = (v) => page.evaluate(([text, today, view]) => {'    >> $T/helpers.moved
cut timeline-ui    '  const tl = (text, o) => page.evaluate(([t, opt]) => {'               >> $T/helpers.moved
for pair in board-search:F6 deps:F15 deps:F14 deps:F12 status:F7 status:F8 status:F9 timeline-ui:F10 timeline-ui:F11 timeline-ui:F13; do
  cut ${pair%%:*} "  const ${pair##*:} = " > /dev/null
done
for f in test/taskboard/*.js; do node --check $f || print "構文エラー: $f"; done
grep -c '' $T/helpers.moved      # 7 定義ぶんの行数（archive 34・NB 1・plan 48・boardOf 28・searchIn 18・setView 8・tl 14 = 151 前後）
```

- [ ] **Step 5: 入口を書く**

原本の `(async () => {` から `  /* ========== TB-01〜12` の直前まで（runner・ブラウザ・FSA スタブ・dialog・`page.goto`・前提チェック・`ops` / `opsError` / `lineOf` / `onlyChanged`）と、`  /* ========== UI ヘルパー ========== */` から `  /* ========== TB-I1〜I3` の直前まで（`session` / `addModal` / `shutModal` / `ui` / `sendKey`）は**そのまま**入口に置く。

```zsh
a=$(lnx '(async () => {'); b=$(ln '  /* ========== TB-01〜12: 編集エンジン')
u=$(ln '  /* ========== UI ヘルパー ========== */'); v=$(ln '  /* ========== TB-I1〜I3: 追加モーダルの内容欄')
{ cat <<'JS'
'use strict';
/* 目的: docs/specs/taskboard.md（目次）と docs/specs/taskboard/*.md のテストケースを file:// 実機で照合する
   入力: 節名（省略可。例: node test/taskboard.js timeline-ui flows）
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0。不明な節名は 2）
   例:   ./test/run taskboard  /  ./test/run taskboard deps

   2026-09-25 に 4,184 行の1ファイルから「入口＋節」に分けた（docs/audits/2026-09-25-structure.md §6）。
   ここは fixture・スタブ・共通ヘルパを ctx にまとめ、test/taskboard/<節>.js の run(ctx) を**元の順序で**回す。
   節は前の節の状態に依存しない（各節は session(...) から始める）。最後の parent 節はページ遷移するので順序を変えない。 */

const path = require('path');
const { launch, fileUrl, createRunner, eq, REPO, bannerIs } = require('./helpers');
const FX = require('./taskboard/fixtures');
const { F1, F2, F2c, F3, F4, F5, TODAY, NFD9, NFC9 } = FX;

const SHOTS = process.argv.includes('--shots');
const shotPath = name => path.join(REPO, '.playwright-mcp', name); // .gitignore 済み

// 節（実行順が契約。名前で部分実行できる）
const SECTIONS = ['engine', 'input', 'timeline-model', 'edit', 'board-search', 'deps', 'status', 'timeline-ui', 'flows', 'parent']
  .map(n => require('./taskboard/' + n));
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const unknown = only.filter(n => !SECTIONS.some(s => s.name === n));
if (unknown.length) {
  console.error('不明な節名: ' + unknown.join(', ') + '\n使える節: ' + SECTIONS.map(s => s.name).join(' / '));
  process.exit(2);
}

JS
  sed -n "$a,$((b-1))p" $P
  print
  sed -n "$u,$((v-1))p" $P
  print
  print -r -- '  /* ========== 節をまたいで使うヘルパ（2026-09-25 に各節から移した） ========== */'
  cat $T/helpers.moved
  cat <<'JS'

  const ctx = {
    page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
    ...FX,
    withDialogs, ops, opsError, lineOf, onlyChanged,
    session, addModal, shutModal, ui, sendKey,
    archive, NB, plan, boardOf, searchIn, setView, tl,
  };

  const chosen = only.length ? SECTIONS.filter(s => only.includes(s.name)) : SECTIONS;
  for (const s of chosen) {
    const t0 = Date.now();
    console.log('--- ' + s.name + '（' + s.ids + '）');
    await s.run(ctx);
    console.log('    ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }

  await browser.close();
  r.report('taskboard（docs/specs/taskboard.md と docs/specs/taskboard/*.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
JS
} > test/taskboard.js
node --check test/taskboard.js
```

原本の末尾（`await browser.close();` 以降）に `r.report` 以外の処理があれば、上の `await browser.close();` の前に移す（`git show HEAD:test/taskboard.js | tail -8` で見る）。

- [ ] **Step 6: 節を1本ずつ単独実行して結合を洗い出す**

```zsh
for s in engine input timeline-model edit board-search deps status timeline-ui flows parent; do
  print "===== $s"; node test/taskboard.js $s 2>&1 | grep -E 'FAIL|ReferenceError|pageerror|pass /|ハーネス自体' 
done
```

Expected: 各節 `N pass / 0 fail`。`ReferenceError: xxx is not defined` が出たら、その名前が (a) 別の節で計算した値なら、その節の先頭で同じ式を再計算する（例: `const f1 = await searchIn('list', '仕様書');`）(b) 別の節で定義したヘルパなら Step 4 の要領で入口へ移し ctx に足す。FAIL が「前の節が残した状態」に由来するなら、節の先頭に `await session(F1);` または `await shutModal();` を足す。直したら `node --check` と単独実行をもう一度。

- [ ] **Step 7: Review Focus 1・4 を確かめる**

`node test/taskboard.js nosuch; echo "exit=$?"` → `不明な節名: nosuch` と一覧、`exit=2`。
`test/taskboard/deps.js` の `async run(ctx) {` の直後に一時的に `throw new Error('probe');` を入れて `node test/taskboard.js deps; echo "exit=$?"` → `ハーネス自体のエラー` と `exit=2`、ブラウザのプロセスが残っていない（`pgrep -f chrome-headless-shell | wc -l` が実行前と同じ）。**必ず元に戻す**（`git diff test/taskboard/deps.js` が空）

- [ ] **Step 8: 全体**

Run: `./test/run taskboard` → `270 pass / 0 fail`・コンソールエラー 0・節ごとの秒数が出る。`./test/run taskboard timeline-ui` → その節だけ。
ID ゲート（`test/taskboard/*.js` も対象）が無言で通る。行数警告から `test/taskboard.js` が消える。

- [ ] **Step 9: Commit**

```bash
git add test/taskboard.js test/taskboard/
git commit -m "test/taskboard: 4,184 行のハーネスを入口＋節 10 本に分割（ctx で fixture と共通ヘルパを渡す・節名で部分実行・節ごとの所要時間）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: `test/README.md` の節単位実行（段階③の締め）

**Files:**
- Modify: `test/README.md`（「実行」節）

- [ ] **Step 1: 実行例を足す**

「実行」のコードブロックに `./test/run taskboard deps     # taskboard の deps 節だけ（節名は test/taskboard.js の SECTIONS）` を足し、直後に1段落: 「1,000 行を超えたハーネスは入口（`test/<alias>.js`）と節（`test/<alias>/<節>.js`）に分ける。入口が fixture・スタブ・共通ヘルパを `ctx` にまとめ、節の `run(ctx)` を元の順序で回す。節は前の節の状態に依存させない」

- [ ] **Step 2: Commit**

```bash
git add test/README.md
git commit -m "test/README: 節単位の実行と入口＋節の作法を追記

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 段階④: taskboard の spec を話題ごとに分ける（Task 10）

設計書 §6 からの変更: **テスト表は行単位で分けず、表ごと（前の表の直後から この表の末尾まで）を1つの話題ファイルに置く**。
混在する3表（I+H / R+WR+P / M+C+T+D+W）は主たる話題に置き、他方の話題ファイルの冒頭にその旨を書く。ID ゲートは alias 単位なので影響しない。

### Task 10: `docs/specs/taskboard.md` → 目次＋ `docs/specs/taskboard/*.md` 11 本

**Files:**
- Create: `docs/specs/taskboard/{engine,input,timeline,memo,board,modal,io,archive,issue-link,fixtures}.md`
- Move: `docs/specs/taskboard-decisions.md` → `docs/specs/taskboard/decisions.md`（`git mv`）
- Modify: `docs/specs/taskboard.md`（目次と骨格だけに）・`CLAUDE.md:32`（decisions のパス）

**Interfaces:**
- Produces: `docs/specs/taskboard.md` は残す（HUB-27 が存在を見る）。ID ゲートは `docs/specs/taskboard.md` と `docs/specs/taskboard/*.md` を連結して照合する

- [ ] **Step 1: 原本と切れ目**

```zsh
cd /Users/dan.kawazu/Personal/tools
git status --short            # 空
T=/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/f962d162-1ef8-485c-a6f3-636416c023bf/scratchpad/ts; mkdir -p $T
git show HEAD:docs/specs/taskboard.md > $T/orig.md; P=$T/orig.md
ln()  { grep -nF  -- "$1" "$P" | head -1 | cut -d: -f1 }   # 先頭一致（節コメントは一意）
lnx() { grep -nxF -- "$1" "$P" | head -1 | cut -d: -f1 }   # 行全体一致（(async () => { は入れ子にも出るため）
h2end() { awk -v s=$1 'NR>s && /^## /{print NR-1; exit} END{}' $P }          # 見出し行 → その H2 節の最終行
sect() { local s=$(ln "$1"); local e=$(h2end $s); [[ -n $e ]] || e=$(wc -l < $P); sed -n "$s,${e}p" $P }   # H2 節を丸ごと
# 記録（後で照合する）
grep -c '^| TB-' $P > $T/rows.before; grep -c '^| ID |' $P > $T/tables.before; grep '^##' $P | sort > $T/heads.before
# テストケース章の表の範囲（各表の最初の行-最後の行）
TS=$(ln '## テストケース'); TE=$(ln '## 日付の入力（TB-D4/D5')
awk -v s=$TS -v e=$TE 'NR>=s && NR<e { if ($0 ~ /^\|/) { if (!t) t=NR; last=NR } else if (t && $0=="") { print t"-"last; t=0 } }' $P > $T/tables
cat -n $T/tables      # 15 行（表 1〜15）。1 = TB-01〜14 / 2 = 15〜19 / 3 = S1〜S10 / 4 = A / 5 = I+H / 6 = U / 7・8 = P / 9 = R+WR+P / 10 = M+C+T+D+W / 11 = B+F / 12 = X / 13 = S20〜36 / 14 = G / 15 = S37〜40
unit() {   # $1=表番号 → 前の表の直後（1 なら fixture の直後）からこの表の末尾までを出す
  local n=$1; local from to
  if (( n == 1 )); then from=$(( $(ln '照合フック（Phase T 追加）:') )); else from=$(( $(sed -n "$((n-1))p" $T/tables | cut -d- -f2) + 1 )); fi
  to=$(sed -n "${n}p" $T/tables | cut -d- -f2)
  sed -n "$from,${to}p" $P
}
```

「照合フック」以降の 2 段落（`window.taskboard.test` の API の説明）は表 1 の前書きなので表 1 と一緒に engine.md へ行く。fixture のコードブロックは fixtures.md へ。

- [ ] **Step 2: 話題ファイルを組み立てる**

```zsh
mkdir -p docs/specs/taskboard
head3() {   # $1=話題 $2=何を決めているか $3=テスト ID
  print -r -- "# taskboard — $1"; print
  print -r -- "> **何を決めているか**: $2  **テスト ID**: $3  **決定の記録**: decisions.md"
  print -r -- '> 2026-09-25 に docs/specs/taskboard.md（目次）から移動。内容は書き換えていない（docs/audits/2026-09-25-structure.md §6）。'; print
}
{ head3 'fixture とテストフック' 'テストが使う tasks.md の縮約（F1〜F15）と window.taskboard.test の API。' '（ID なし）'
  sed -n "$((TS+1)),$(( $(ln '照合フック（Phase T 追加）:') - 1 ))p" $P
} > docs/specs/taskboard/fixtures.md
{ head3 '編集エンジン' '行の書き換え規則（バイト保全・Tasks 標準順）・ステータス・親子の付け替え。純関数 applyOps の契約。' 'TB-01〜20・S1〜S10・A1〜A7（表 4 は archive.md）・S20〜S40・K1〜K11。依存の記法 R1〜R8 の表は timeline.md、タグ T1〜T5 の表は memo.md'
  sect '## 編集仕様（行の書き換え規則）'; print; sect '## ステータス仕様（Phase T2'; print; sect '## 親子の付け替え（TB-K1〜K11'; print
  print '## テストケース'; print; unit 1; print; unit 3; print; unit 13; print; unit 15
} > docs/specs/taskboard/engine.md
{ head3 '入力（キーボード・IME・取り消し・日付）' 'Enter / Escape の IME ガード・追加の取り消し・日付欄の既定とチップ。' 'TB-I1〜I8・U1〜U7・D4/D5・W2/W3（表 5 は H を含む）'
  sect '## キーボードと IME 仕様'; print; sect '## 追加の取り消し仕様'; print; sect '## 日付の入力（TB-D4/D5'; print
  print '## テストケース'; print; unit 5; print; unit 6
} > docs/specs/taskboard/input.md
{ head3 '計画ビュー（タイムライン）' 'タイムラインのモデル・描画・ドラッグ・依存の矢印・ズーム・完了率・週報。' 'TB-P1〜P45・R1〜R19・WR1/WR2（表 9 は R1〜R9 の記法も含む）'
  sect '## 計画ビュー仕様（Phase T'; print; sect '## タイムライン強化仕様（Phase T4'; print
  print '## テストケース'; print; unit 7; print; unit 8; print; unit 9
} > docs/specs/taskboard/timeline.md
{ head3 'メモ' 'タスクに付随するメモ行の記法・部分木の境界・編集。' 'TB-M1〜M12・C1〜C3（表 10 は T1〜T5・D1〜D3・W も含む）'
  sect '## メモ仕様（Phase N'; print; print '## テストケース'; print; unit 10
} > docs/specs/taskboard/memo.md
{ head3 'ボードビューとテキスト検索' '列＝セクションのボード・列の基準の切替・テキスト検索とハイライト。' 'TB-B1〜B11・F1〜F18・G1〜G7'
  sect '## ボードビュー仕様（Phase S'; print; sect '## テキスト検索仕様（Phase S'; print
  print '## テストケース'; print; unit 11; print; unit 14
} > docs/specs/taskboard/board.md
{ head3 '追加・編集モーダルとポップオーバー' 'モーダルの開き方・フィールドと既定値・関連ノート・ポップオーバーのクランプ。' 'TB-X1〜X18・D1〜D3（表は memo.md の表 10）'
  sect '## 追加・編集モーダル仕様（Phase E'; print; sect '## ポップオーバーのビューポート内クランプ'; print
  print '## テストケース'; print; unit 12
} > docs/specs/taskboard/modal.md
{ head3 '保存・ハンドル・フォールバック・モード切替' '外部同時編集への防御・自動保存・ツールバー・ハンドル永続化（lib/fsa.js）・FSA 非対応時のフォールバック・Check Issue とのモード切替。' 'TB-13/14（表は engine.md の表 1）・AS1〜AS4・FS1・UI1/UI2・MS1〜MS3'
  sect '## 保存仕様（外部同時編集への防御）'; print; sect '## ハンドル永続化仕様'; print; sect '## フォールバック仕様'; print; sect '## モード切替（`Check Issue` と対）'
} > docs/specs/taskboard/io.md
{ head3 '完了アーカイブ' 'グループ単位のアーカイブ・archive.md の案件見出しの下へ・取り違えと一括操作の事故防止。' 'TB-15〜19・AR1/AR2・A1〜A7'
  sect '## 完了アーカイブ仕様（UX監査 TB-4）'; print; print '## テストケース'; print; unit 2; print; unit 4
} > docs/specs/taskboard/archive.md
{ head3 'Check Issue との往復' '論点からのタスク受け取りと、タスクから考える場所（イシューノート）へ。' 'TB-H2〜H4・N1〜N6'
  sect '## Check Issue からの受け取り（TB-H2/H3'; print; sect '## タスクを考える場所へ（TB-N1〜N6'
} > docs/specs/taskboard/issue-link.md
git mv docs/specs/taskboard-decisions.md docs/specs/taskboard/decisions.md
```

- [ ] **Step 3: 目次（骨格）を組み立てる**

残す H2（原本の順）: 前提と実検証結果 / 概要 / 要件対応表 / 画面構成 / データ仕様（解析） / 表示仕様 / Excel 用コピー仕様 / エラー・警告仕様 / 検証手順 / Chrome 実機スモーク項目 / Obsidian 手動スモーク項目 ×2 / Safari 手動スモーク項目 / index.html への変更 / やらないこと / 決定事項。`## 概要` の直後に目次を、`## テストケース` の位置に案内を置く。

```zsh
{ sed -n "1,$(( $(ln '## 要件対応表') - 1 ))p" $P
  cat <<'MD'
## 目次（話題ごとの契約とテストケース — 2026-09-25 に分割）

契約とテストケースは話題ごとに `docs/specs/taskboard/` にある。**テスト ID は分割前と同じ**で、
`test/run` の ID ゲートが「テストにあって spec に無い ID」を検出する。fixture は fixtures.md。

| ファイル | 話題 | テスト ID |
|---|---|---|
| [engine.md](taskboard/engine.md) | 編集エンジン・ステータス・親子の付け替え | TB-01〜20・S1〜S10・S20〜S40・K1〜K11 |
| [input.md](taskboard/input.md) | キーボードと IME・取り消し・日付の入力 | I・U・D4/D5・W |
| [timeline.md](taskboard/timeline.md) | 計画ビュー（モデル・描画・ドラッグ・矢印・ズーム・週報） | P・R・WR |
| [memo.md](taskboard/memo.md) | メモ | M・C（表にタグ T・既定値 D も） |
| [board.md](taskboard/board.md) | ボードビュー・列切替・テキスト検索 | B・F・G |
| [modal.md](taskboard/modal.md) | 追加・編集モーダル・ポップオーバー | X・D1〜D3 |
| [io.md](taskboard/io.md) | 保存・自動保存・ツールバー・ハンドル永続化・フォールバック・モード切替 | 13/14・AS・FS1・UI・MS |
| [archive.md](taskboard/archive.md) | 完了アーカイブ | 15〜19・AR・A |
| [issue-link.md](taskboard/issue-link.md) | Check Issue との往復 | H・N |
| [fixtures.md](taskboard/fixtures.md) | fixture F1〜F15 とテストフック | — |
| [decisions.md](taskboard/decisions.md) | 決定事項（TB-Q 番号・採否と理由） | — |

MD
  sect '## 要件対応表'; print; sect '## 画面構成'; print; sect '## データ仕様（解析）'; print
  sect '## 表示仕様（ソート・絞り込み・色分け）'; print; sect '## Excel 用コピー仕様'; print; sect '## エラー・警告仕様'; print
  print '## テストケース'; print
  print '話題ごとのファイル（上の目次）にある。fixture と `window.taskboard.test` のフックは [fixtures.md](taskboard/fixtures.md)。'; print
  sect '## 検証手順'; print; sect '## Chrome 実機スモーク項目'; print
  sect '## Obsidian 手動スモーク項目（Phase N'; print; sect '## Obsidian 手動スモーク項目（Phase T2'; print; sect '## Safari 手動スモーク項目'; print
  sect '## index.html への変更'; print; sect '## やらないこと'; print
  sect '## 決定事項（Phase ごとの採否と理由）' | sed 's#`docs/specs/taskboard-decisions.md`#`docs/specs/taskboard/decisions.md`#'
} > docs/specs/taskboard.md
```

- [ ] **Step 4: 何も落ちていないことを機械で確かめる**

```zsh
# 見出し（H2/H3）の多重集合が一致する（足したのは「目次」と各話題ファイルの「テストケース」だけ）
{ grep -h '^##' docs/specs/taskboard.md docs/specs/taskboard/*.md | grep -v '^## 目次' ; } | sort > $T/heads.after
diff <(grep -v '^## テストケース$' $T/heads.before) <(grep -v '^## テストケース$' $T/heads.after) && print "見出し OK"; grep -c '^## テストケース$' $T/heads.after   # diff は空・テストケースは 10（目次 1 + 話題 9）
# テスト行と表の数が一致する
print "rows: $(cat $T/rows.before) -> $(cat docs/specs/taskboard.md docs/specs/taskboard/*.md | grep -c '^| TB-')"
print "tables: $(cat $T/tables.before) -> $(cat docs/specs/taskboard.md docs/specs/taskboard/*.md | grep -c '^| ID |')"
wc -l docs/specs/taskboard.md docs/specs/taskboard/*.md    # どれも 1,000 行未満
```

Expected: diff 空・rows と tables が前後で一致。行数警告から `docs/specs/taskboard.md` が消える。

- [ ] **Step 5: 参照を直し、ゲートと HUB を回す**

`CLAUDE.md` の `docs/specs/  ツールごとの仕様書兼テストケース（17本＋ launcher.md（共通コンポーネント）＋ taskboard-decisions.md の計19ファイル）` は Task 15 で書き換えるので、ここでは `taskboard-decisions.md` → `taskboard/decisions.md` だけ直す。`grep -rn 'taskboard-decisions' --include='*.md' --include='*.js' --include='*.mdc' .` が `excel2md/` 以外で 0 件。

Run: `./test/run taskboard`（ID ゲートが `docs/specs/taskboard/*.md` を連結して照合）→ 全 pass。`./test/run hub` → HUB-27 pass。

- [ ] **Step 6: Commit**

```bash
git add docs/specs/taskboard.md docs/specs/taskboard/ CLAUDE.md
git commit -m "specs/taskboard: 2,138 行の spec を目次＋話題ファイル 10 本＋decisions に分割（見出し・テスト行・表の数を前後で照合・ID 不変）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 段階⑤: issue の HTML とテストを分ける（Task 11〜12）

### Task 11: `web/issue.html` → 入口＋ `web/issue/*.js` 4 本（連結等価）

**Files:**
- Create: `web/issue/engine.js` `ui.js` `list.js` `wizard.js`
- Modify: `web/issue.html`

**Interfaces:**
- Consumes: Task 6 後の `web/issue.html`（`const handles = ToolFsa.handles('tools-issue')` が FSA 節にある）
- Produces: 挙動同一。`window.issue` フックと起動は入口の末尾インラインに残る。`$id` は ui.js が宣言し、後のファイルの読み込み時の配線（`$id('cfg-vault').addEventListener` 等）から使う

- [ ] **Step 1: 原本と切れ目**

```zsh
cd /Users/dan.kawazu/Personal/tools
git status --short            # 空
T=/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/f962d162-1ef8-485c-a6f3-636416c023bf/scratchpad/is; mkdir -p $T
git show HEAD:web/issue.html > $T/orig.html; P=$T/orig.html
ln()  { grep -nF  -- "$1" "$P" | head -1 | cut -d: -f1 }
lnx() { grep -nxF -- "$1" "$P" | head -1 | cut -d: -f1 }
S=$(lnx '<script>'); E=$(lnx '</script>')
[[ "$(sed -n "$((S+1))p" $P)" == "'use strict';" ]] || { print "想定外: <script> の次が 'use strict' でない"; exit 1 }
A=$(ln '/* ========== 純関数（フックと UI が同一コードパス） ========== */')
B=$(ln '/* ========== UI 配線 ========== */')
C=$(ln '/* ---------- 一覧（IS-Q10。ここが画面の主） ----------')
D=$(ln '/* ---------- 入力ウィザード（IS-Q8） ----------')
F=$(ln '/* ---------- 起動（**すべての定義の後**に置く')
print "S=$S A=$A B=$B C=$C D=$D F=$F E=$E"     # S<A<B<C<D<F<E
piece() { sed -n "$1,$2p" "$P" }
piece $((S+2)) $((A-1)) > $T/head     # 空行だけのはず
piece $A $((B-1)) > $T/engine
piece $B $((C-1)) > $T/ui             # UI 配線 + 04_Issues への書き込み（FSA）
piece $C $((D-1)) > $T/list           # 一覧 + 閉じる
piece $D $((F-1)) > $T/wizard
piece $F $((E-1)) > $T/tail           # 起動 + window.issue + ToolLauncher.mount
cat $T/head $T/engine $T/ui $T/list $T/wizard $T/tail | diff - <(piece $((S+2)) $((E-1))) && print "連結等価 OK"
grep -q '[^[:space:]]' $T/head && print "注意: 純関数節の前に定数がある — 入口の先頭インラインに残す" || print "head は空（先頭インラインは作らない）"
```

- [ ] **Step 2: 4 本を書き、入口を組み替える**

```zsh
mkdir -p web/issue
mk() { local name=$1 desc=$2; shift 2
  { print -r -- "'use strict';"
    print -r -- "/* web/issue/$name.js — $desc"
    print -r -- "   入口: web/issue.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、"
    print -r -- "   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */"
    print; cat "$@"; } > web/issue/$name.js }
mk engine '純関数（判定・見出し認識・toNote / toTasks）・一覧のための解析・既存ノートへの書き込み・論点の行。DOM も I/O も触らない' $T/engine
mk ui     'UI 配線（$id・実行・保存と復元・サンプル）と 04_Issues への書き込み（File System Access。ハンドルは lib/fsa.js）' $T/ui
mk list   '一覧（カード・論点の行・切り出し・タスクにする）と、閉じる＝振り返り' $T/list
mk wizard '入力ウィザード（5段を1問ずつ）' $T/wizard
{ sed -n "1,$((S-1))p" $P
  if grep -q '[^[:space:]]' $T/head; then print -r -- '<script>'; print -r -- "'use strict';"; cat $T/head; print -r -- '</script>'; fi
  for f in engine ui list wizard; do print -r -- "<script src=\"issue/$f.js\"></script>"; done
  print -r -- '<script>'; print -r -- "'use strict';"; cat $T/tail; print -r -- '</script>'
  sed -n "$((E+1)),\$p" $P
} > $T/page && cp $T/page web/issue.html
wc -l web/issue.html web/issue/*.js     # どれも 1,000 行未満
```

- [ ] **Step 3: 動かす・目視・Commit**

Run: `./test/run issue` → `87 pass / 0 fail`・コンソールエラー 0。`./test/run taskboard flows`（Check Issue との往復）と `./test/run launcher` も pass。
`open web/issue.html` で実機を1回: 一覧・ウィザード・モード切替（Cmd+Shift+E）にエラーが無い。

```bash
git add web/issue.html web/issue/
git commit -m "issue: HTML を入口＋ web/issue/*.js 4 本に分割（節の境目で切り元の順序で読む・連結等価を確認）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 12: `test/issue.js` → 入口＋ `test/issue/*.js` 4 節

**Files:**
- Create: `test/issue/{pure,ui-list,lines,close}.js`
- Modify: `test/issue.js`

**Interfaces:**
- Produces（ctx）: `{ page, browser, r, eq, fileUrl, SAMPLE_MD, ready, setValue }`。`pure` 節は `ready` が false なら何もしない（原本の `if (ready) { … }` と同じ）
- Produces: `node test/issue.js [節名…]`。不明な節名は exit 2

- [ ] **Step 1: 切れ目**

```zsh
cd /Users/dan.kawazu/Personal/tools
git status --short            # 空
T=/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/f962d162-1ef8-485c-a6f3-636416c023bf/scratchpad/it; mkdir -p $T
git show HEAD:test/issue.js > $T/orig.js; P=$T/orig.js
ln()  { grep -nF  -- "$1" "$P" | head -1 | cut -d: -f1 }   # 先頭一致（節コメントは一意）
lnx() { grep -nxF -- "$1" "$P" | head -1 | cut -d: -f1 }   # 行全体一致（(async () => { は入れ子にも出るため）
a=$(lnx '(async () => {'); i=$(ln '  if (ready) {')
p=$(ln '    /* ========== IS-01〜04: parseSections ========== */')
u=$(ln '  /* ========== UI 経路 ========== */')
c=$(awk -v u=$u 'NR<u && $0=="  }"{c=NR} END{print c}' $P)      # if (ready) { … } の閉じ
l=$(ln '  /* ========== IS-UL8〜UL11'); k=$(ln '  /* ========== IS-UL16/UL17'); h=$(ln '  /* ========== ハブ導線 ========== */'); z=$(ln '  await browser.close();')
print "a=$a i=$i p=$p c=$c u=$u l=$l k=$k h=$h z=$z"    # a<i<p<c<u<l<k<h<z
```

- [ ] **Step 2: 節 4 本**

```zsh
mkdir -p test/issue
sec() { local name=$1 desc=$2 ids=$3 s=$4 e=$5
  { print -r -- "'use strict';"
    print -r -- "/* test/issue/$name.js — 節: $desc"
    print -r -- "   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js $name）"
    print -r -- "   照合する ID: $ids。期待値の正本は docs/specs/issue.md */"
    print -r -- 'module.exports = {'
    print -r -- "  name: '$name',"
    print -r -- "  ids: '$ids',"
    print -r -- '  async run(ctx) {'
    print -r -- '    const { page, browser, r, eq, fileUrl, SAMPLE_MD, ready, setValue } = ctx;'
    [[ $name == pure ]] && print -r -- '    if (!ready) return;   // window.issue のフックが無ければ純関数の照合はできない（原本の if (ready) と同じ）'
    sed -n "$s,$((e-1))p" $P
    print -r -- '  },'; print -r -- '};'
  } > test/issue/$name.js }
sec pure    '純関数（parseSections / judge / toNote / toTasks / 一覧の解析 / 書き込み / 論点の行 / ウィザードの下書き）' 'IS-01〜23・L1〜L10' $p $c
sec ui-list 'UI 経路（貼る→判定→コピー・保存）と一覧（画面の主）・書き殴りノートに問いを立てる' 'IS-U1〜U23・UL1〜UL7' $u $l
sec lines   '論点＝行（1ノート : N論点）と監査で足したもの' 'IS-UL8〜UL14・U24/U25' $l $k
sec close   'ノートを閉じる（IS-Q20）' 'IS-UL16/UL17' $k $h
# setValue は ui-list の先頭で定義され close 節でも使う → 入口へ
cat > $T/cutdef.pl <<'PL'
my ($file, $head) = @ARGV; open my $h, "<", $file or die; my @L = <$h>; close $h;
my ($s) = grep { index($L[$_], $head) == 0 } 0 .. $#L; die "not found: $head\n" unless defined $s;
my $d = 0; my $e = $s;
for my $i ($s .. $#L) { my $t = $L[$i]; $t =~ s/\x27[^\x27]*\x27//g; $t =~ s/`[^`]*`//g;
  $d += () = $t =~ /[\(\[\{]/g; $d -= () = $t =~ /[\)\]\}]/g; if ($d <= 0) { $e = $i; last } }
print @L[$s .. $e]; splice @L, $s, $e - $s + 1;
open my $o, ">", $file or die; print $o @L; close $o;
PL
perl $T/cutdef.pl test/issue/ui-list.js '  const setValue = (sel, val) => page.evaluate(([s, v]) => {' > $T/setValue.js
for f in test/issue/*.js; do node --check $f || print "構文エラー: $f"; done
```

- [ ] **Step 3: 入口**

```zsh
{ cat <<'JS'
'use strict';
/* 目的: docs/specs/issue.md のテストケースを file:// 実機で照合する
   入力: 節名（省略可。例: node test/issue.js lines）
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0。不明な節名は 2）
   例:   ./test/run issue  /  ./test/run issue close

   2026-09-25 に 1,502 行の1ファイルから「入口＋節」に分けた（docs/audits/2026-09-25-structure.md §7）。
   ここは SAMPLE_MD・FSA のダミー・共通ヘルパを ctx にまとめ、test/issue/<節>.js の run(ctx) を元の順序で回す。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

const SECTIONS = ['pure', 'ui-list', 'lines', 'close'].map(n => require('./issue/' + n));
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const unknown = only.filter(n => !SECTIONS.some(s => s.name === n));
if (unknown.length) {
  console.error('不明な節名: ' + unknown.join(', ') + '\n使える節: ' + SECTIONS.map(s => s.name).join(' / '));
  process.exit(2);
}

JS
  sed -n "$(ln 'const SAMPLE_MD = [')"',/^\]\.join/p' $P      # SAMPLE_MD（`].join('\n');` まで）
  print
  sed -n "$a,$((i-1))p" $P                                    # runner・ブラウザ・FSA ダミー・goto・ready
  print
  cat $T/setValue.js
  cat <<'JS'

  const ctx = { page, browser, r, eq, fileUrl, SAMPLE_MD, ready, setValue };
  const chosen = only.length ? SECTIONS.filter(s => only.includes(s.name)) : SECTIONS;
  for (const s of chosen) {
    const t0 = Date.now();
    console.log('--- ' + s.name + '（' + s.ids + '）');
    await s.run(ctx);
    console.log('    ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }

JS
  sed -n "$h,$((z-1))p" $P                                    # ハブ導線（そのまま）
  cat <<'JS'
  await browser.close();
  r.report('issue（docs/specs/issue.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
JS
} > test/issue.js
node --check test/issue.js
```

`sed -n '<開始>,/^\]\.join/p'` は SAMPLE_MD の配列を `].join('\n');` の行まで出す。原本で SAMPLE_MD の直後に別の定数があれば（`git show HEAD:test/issue.js | sed -n '12,35p'` で確認）それも入口に写す。

- [ ] **Step 4: 単独実行・全体・Commit**

```zsh
for s in pure ui-list lines close; do print "===== $s"; node test/issue.js $s 2>&1 | grep -E 'FAIL|ReferenceError|pageerror|pass /|ハーネス自体'; done
node test/issue.js nosuch; echo "exit=$?"     # 2
./test/run issue                              # 87 pass / 0 fail
```

`ReferenceError` は Task 8 Step 6 と同じ要領で直す（値なら再計算・ヘルパなら入口へ）。

```bash
git add test/issue.js test/issue/
git commit -m "test/issue: 1,502 行のハーネスを入口＋節 4 本に分割（ctx・節名で部分実行）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 段階⑥: docs・規約・後片付け（Task 13〜15）

### Task 13: `docs/audits/` に監査ログを移し、`ux-backlog.md` を判断表と索引にする

**Files:**
- Create: `docs/audits/2026-09-24-textbox-todo.md` `2026-08-18-usage-diagnosis.md` `2026-08-18-hub-redesign.md` `2026-08-17-obsidian-audit.md` `2026-08-15-mask-v3-v4.md` `2026-08-14-refactor-audit.md` `2026-08-13-followup-audit.md` `2026-08-04-ux-audit.md`
- Modify: `docs/ux-backlog.md`・`.cursor/rules/tools.mdc`・`docs/specs/excel2md.md:193`・`docs/specs/taskboard/decisions.md:45`

**Interfaces:**
- Produces: `docs/ux-backlog.md` に残るのは「読み方」・「リファクタ①〜④の総括（やらないと判断したもの・条件付き再評価）」・「検討して現状維持と判断した事項」・監査の索引。移した章の見出し（H2/H3）は文字どおり保つ

- [ ] **Step 1: 原本と道具**

```zsh
cd /Users/dan.kawazu/Personal/tools
git status --short            # 空
T=/private/tmp/claude-502/-Users-dan-kawazu-Personal-tools/f962d162-1ef8-485c-a6f3-636416c023bf/scratchpad/ux; mkdir -p $T
git show HEAD:docs/ux-backlog.md > $T/orig.md; P=$T/orig.md
ln()  { grep -nF  -- "$1" "$P" | head -1 | cut -d: -f1 }   # 先頭一致（節コメントは一意）
lnx() { grep -nxF -- "$1" "$P" | head -1 | cut -d: -f1 }   # 行全体一致（(async () => { は入れ子にも出るため）
h2end() { awk -v s=$1 'NR>s && /^## /{print NR-1; exit}' $P }
sect() { local s=$(ln "$1"); local e=$(h2end $s); [[ -n $e ]] || e=$(wc -l < $P | tr -d ' '); sed -n "$s,${e}p" $P }
grep '^##' $P | sort > $T/heads.before
mkdir -p docs/audits
head2() { print -r -- "# $1"; print; print -r -- '> `docs/ux-backlog.md` から 2026-09-25 に移した監査ログ（内容は書き換えていない）。判断の現行版は `docs/ux-backlog.md` の「やらないと判断したもの」「検討して現状維持と判断した事項」を見る。'; print }
```

- [ ] **Step 2: 8 本に移す（章の見出しは H2 のまま）**

```zsh
{ head2 '「ただのテキストボックス入力」の棚卸し TODO（2026-09-24・未着手）'; sect '## 2026-09-24 TODO:'; } > docs/audits/2026-09-24-textbox-todo.md
{ head2 '使用実態の診断と Draw Gantt の凍結（2026-08-18）'; sect '## 2026-08-18 使用実態の診断'; } > docs/audits/2026-08-18-usage-diagnosis.md
{ head2 'ハブを「カード＋一言・1画面」に変更（2026-08-18）'; sect '## 2026-08-18 ハブを「カード＋一言・1画面」に変更'; } > docs/audits/2026-08-18-hub-redesign.md
{ head2 'Obsidian 連携の監査（2026-08-17）'; sect '## 2026-08-17 Obsidian 連携の監査'; } > docs/audits/2026-08-17-obsidian-audit.md
{ head2 'Mask v3 / v4 の実装後検証（2026-08-15）'; sect '## 2026-08-15 Mask v4'; print; sect '## 2026-08-15 Mask v3'; } > docs/audits/2026-08-15-mask-v3-v4.md
{ head2 '全体リファクタ監査 T4（2026-08-14）'; sect '## 2026-08-14 全体リファクタ監査'; } > docs/audits/2026-08-14-refactor-audit.md
{ head2 '追補監査（実装コードの横断調査）と対応（2026-08-13）'; sect '## 2026-08-13 追補監査'; } > docs/audits/2026-08-13-followup-audit.md
{ head2 '全ツール UX 監査報告書と Phase P の採否（2026-08-04 / 08-05）'
  sed -n "3,6p" $P; print                                  # 原本冒頭の監査方法（4 行）
  sect '## Phase P 採否（2026-08-04 承認）'; print; sect '## Phase P 検証中に発見した追加事項'; print; sect '## XL-2 の訂正'; print
  sect '## Phase G 統合の後始末'; print
  sed -n "$(ln '## 総括'),\$p" $P                            # 総括〜末尾（共通指摘・各ツール・世間の定番・確定3項目・Phase P 対象候補）
} > docs/audits/2026-08-04-ux-audit.md
```

- [ ] **Step 3: ux-backlog.md を組み直す**

```zsh
{ cat <<'MD'
# UX バックログ（改善判断の記録）

**何の正本か**: 既存ツールの改善について「やらない」「現状維持」と判断したことと、その理由。
変更前に必ず見る（coding-rules「変更の作法」）。過去の監査ログは本文から `docs/audits/` へ移した（2026-09-25）。

MD
  sed -n "8,13p" $P; print                                   # 読み方（2026-08-18 追記）
  cat <<'MD'
## 監査ログの索引（docs/audits/）

| 日付 | ファイル | 内容 |
|---|---|---|
| 2026-09-25 | [2026-09-25-structure.md](audits/2026-09-25-structure.md) | 構成の組み替え設計（同名フォルダで分割・ゲート） |
| 2026-09-24 | [2026-09-24-textbox-todo.md](audits/2026-09-24-textbox-todo.md) | 「ただのテキストボックス入力」の棚卸し（未着手） |
| 2026-08-18 | [2026-08-18-usage-diagnosis.md](audits/2026-08-18-usage-diagnosis.md) | 使用実態の診断と Draw Gantt の凍結 |
| 2026-08-18 | [2026-08-18-hub-redesign.md](audits/2026-08-18-hub-redesign.md) | ハブをカード＋一言・1画面に |
| 2026-08-17 | [2026-08-17-obsidian-audit.md](audits/2026-08-17-obsidian-audit.md) | Obsidian 連携の監査（FSA 不採用・クリップボード往復） |
| 2026-08-15 | [2026-08-15-mask-v3-v4.md](audits/2026-08-15-mask-v3-v4.md) | Mask v3 / v4 の実装後検証 |
| 2026-08-14 | [2026-08-14-refactor-audit.md](audits/2026-08-14-refactor-audit.md) | 全体リファクタ監査 T4（重複の実測） |
| 2026-08-13 | [2026-08-13-followup-audit.md](audits/2026-08-13-followup-audit.md) | 追補監査（実装コードの横断調査） |
| 2026-08-04 | [2026-08-04-ux-audit.md](audits/2026-08-04-ux-audit.md) | 全ツール UX 監査報告書・Phase P の採否と訂正・XL-2 |

MD
  sect '## リファクタ①〜④の総括' | sed 's#^| \*\*`web/\*\.html` の分割\*\*（taskboard 3,332行） | \(.*\) |$#| **`web/*.html` の分割**（taskboard 3,332行） | \1 **→ 2026-09-25 に実施**（issue.html で 2番目の利用者が発火。`docs/audits/2026-09-25-structure.md`） |#'
  print
  sect '## 検討して現状維持と判断した事項'
} > docs/ux-backlog.md
grep -c '2026-09-25 に実施' docs/ux-backlog.md     # 1（sed が当たったこと）
```

- [ ] **Step 4: 何も落ちていないことを機械で確かめる**

```zsh
{ grep -h '^##' docs/ux-backlog.md docs/audits/2026-09-24-textbox-todo.md docs/audits/2026-08-*.md | grep -v '^## 監査ログの索引'; } | sort > $T/heads.after
diff $T/heads.before $T/heads.after && print "見出し OK"
print "lines: $(wc -l < $P) -> $(cat docs/ux-backlog.md docs/audits/2026-09-24-textbox-todo.md docs/audits/2026-08-*.md | wc -l)（見出し・注記・索引の追加ぶんだけ増える）"
```

- [ ] **Step 5: 参照を直す**

- `.cursor/rules/tools.mdc`: `- 既存ツールの改善判断 → `docs/ux-backlog.md`（採否とその理由の記録。**採否リストは 2026-08-04 時点の判定なので「採否の訂正」節も一緒に読む**）` → `- 既存ツールの改善判断 → `docs/ux-backlog.md`（やらない／現状維持の判断表）。過去の監査ログは `docs/audits/`（2026-08-04 の採否と「採否の訂正」は `docs/audits/2026-08-04-ux-audit.md`）`
- `docs/specs/excel2md.md` の `ux-backlog の **XL-1**` → `ux-backlog（現 `docs/audits/2026-08-04-ux-audit.md`）の **XL-1**`
- `docs/specs/taskboard/decisions.md` の `ux-backlog CM-3` → `ux-backlog（現 `docs/audits/2026-08-04-ux-audit.md`）CM-3`

- [ ] **Step 6: ゲートと Commit**

Run: `./test/run launcher`（文字ゲートが `docs/**/*.md` を見る）→ pass。

```bash
git add docs/ux-backlog.md docs/audits/ .cursor/rules/tools.mdc docs/specs/excel2md.md docs/specs/taskboard/decisions.md
git commit -m "docs: ux-backlog の監査ログ 9 章を docs/audits/ に移し、ux-backlog は判断表と索引だけに

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: 規約と入口の文書を新しい構成に合わせる

**Files:**
- Modify: `CLAUDE.md`・`README.md`・`docs/coding-rules.md`・`test/README.md`・`docs/verification-notes.md`・`docs/todo.md`・`docs/audits/2026-09-25-structure.md`

- [ ] **Step 1: CLAUDE.md**

1. 4 行目 `**現在あるのはブラウザHTML（`web/` 17本）だけ**。` → `**現在あるのはブラウザ HTML（`web/`）だけ**（本数と一覧の正本は `lib/tools.js` の TOOLS）。`
2. `## 構成（2026-08-17 時点の実態）` からコードブロックの終わりまでを次に置き換える:

````
## 構成（2026-09-25 時点の実態）

```
README.md    公開リポジトリの入口。ツール表と本数は test/hub.js（HUB-15/27）が TOOLS と照合する
LICENSE      MIT
index.html   ハブ。ツール一覧の正本は lib/tools.js の TOOLS（1行足すとハブにも引き出しメニューにも載る）
web/         ブラウザツール。web/<alias>.html が入口（URL は変えない）。
             1,000 行を超えたツールは同名フォルダ web/<alias>/<節>.js に節ごとのスクリプトを持つ
             （現在 taskboard / issue。規約は coding-rules「ファイルの分割」）
lib/         web ツールの共通コード。ui.css / ui.js / storage.js / fsa.js / config.js / sql.js / excel.js / mmd.js /
             edit.js / handoff.js / tools.js（ツール登録簿の正本）/ launcher.js（引き出し式のツールメニュー）
             同梱ライブラリは lib/vendor/（現在 mermaid のみ。作法は coding-rules.md）
docs/        coding-rules.md（実装規約の正本）/ verification-notes.md（検証の罠）/ todo.md（作業キュー）/
             ux-backlog.md（改善判断の記録）/ tool-backlog.md（ツール候補）
docs/specs/  ツールごとの仕様書兼テストケース docs/specs/<alias>.md ＋ launcher.md（共通コンポーネント）。
             大きい spec は docs/specs/<alias>/<話題>.md に分け、<alias>.md は目次と骨格（現在 taskboard）
docs/audits/ 日付つきの監査・設計の記録（YYYY-MM-DD-<題>.md）。ux-backlog.md に索引
test/        検証ハーネス（`./test/run [ツール名] [節名]`。書き方は test/README.md）。
             大きいハーネスは test/<alias>.js（入口）＋ test/<alias>/<節>.js（現在 taskboard / issue）
```
````

3. `- 現在の対応: Plan Tasks=taskboard / …` の箇条書き（4 行）→ `- 表示名と英名の対応は `lib/tools.js` の TOOLS（`name` / `alias`）が正本。README の表と test/hub.js（HUB-15 / HUB-27）が照合するので、ここには書かない`
4. `17ツール＋ハブ＋launcher の19ハーネスがある。手順は `test/README.md`` → `ツールごと＋ハブ＋launcher のハーネスがある（`./test/run <tool> <節名>` で節だけ実行できる）。手順は `test/README.md``
5. 「ブラウザツールの制約」の箇条書きの末尾に `- **1ファイル 1,000 行を超えたら同名フォルダに分ける**（`test/run` が警告する。切り方は coding-rules「ファイルの分割」— URL・テスト ID・フックは変えない）`

- [ ] **Step 2: README.md**

`- **1ツール = 1 HTML** — 各ツールは1ファイルで完結。要らないものは消せる、欲しいものだけ配れる` →
`- **1ツール = 1 HTML** — 各ツールは `web/<英名>.html` を開くだけ。大きいツール（Plan Tasks / Check Issue）は同名フォルダの補助スクリプトを一緒に置く。要らないものは消せる、欲しいものだけ配れる`
（英字の太字はツール名だけ、という HUB-16 の約束を守る — 上の変更は太字を足していない）

- [ ] **Step 3: coding-rules.md に「ファイルの分割」を足し、定型リップルを直す**

`## ライブラリの同梱（2026-08-14 に利用者が緩和）` の直前に

```
## ファイルの分割（2026-09-25 — 設計は docs/audits/2026-09-25-structure.md）

1. **閾値**: 1ファイル 1,000 行を超えたら同名フォルダに分ける（HTML・テスト・spec とも）。`test/run` が超過を警告する
   （落とさない）。既知の超過は `test/run` の `SIZE_KNOWN` に列挙し、分けたらそこから消す
2. **節→ファイル**: 既存の節コメント（`/* ========== 名前 ========== */`）の境目で切る。節をまたぐ再配置は
   「呼び出し元と同じ節へ戻す」だけ
3. **順序保持**: `<script src>` の並びは元の節の順序。classic script は同じグローバル字句スコープを共有するので、
   **連結した中身が元と同一なら挙動も同一**。移行時は断片を元の順に `cat` して元の `<script>` 本体と diff し、
   差がゼロであることを確かめる（手順の実例: docs/audits/2026-09-25-structure-plan.md Task 7）
4. **読み込み時に実行する文は起動節にだけ書く**（`addEventListener` の配線・`render()` 等）。途中のファイルの列 0 に
   実行文を置かない（後のファイルの宣言に依存すると落ちる。ハンドラの中から後のファイルの関数を呼ぶのはよい）
5. **各ファイルは `'use strict';` で始め、冒頭コメントに「目的／入口ページ／前提（先に読まれるファイル）」を書く**
6. **テストフックと起動は入口ページに残す**（`window.<alias>` の形と URL は変えない）
7. **テストの節**は `module.exports = { name, ids, run(ctx) }`。入口が ctx（page / runner / fixture / 共通ヘルパ）を渡す。
   節は自分で `session(...)` から始め、前の節の状態に依存しない。`./test/run <alias> <節名>` で単独実行できる。
   不明な節名は exit 2
8. **spec の話題ファイル**は冒頭に「何を決めているか・テスト ID の範囲・決定の参照」を持つ。テスト ID は不変。
   `docs/specs/<alias>.md` は目次と骨格として必ず残す（HUB-27 が存在を見る）。`test/run` の ID ゲートが
   「テストにあって spec 群に無い ID」と「同じ alias 内の ID の二重使用」を落とす
```

「新ツール追加の定型リップル」の 5 を `5. **`test/helpers.js` の `TOOL_COUNT` を +1**（固定ピンの唯一の置き場。CLAUDE.md には本数を書かない。HUB-27 が web / spec / test の3点セットの存在を照合する）` に置き換える。

- [ ] **Step 4: test/README.md**

「構成」の表を次に置き換える（7 本しか載っていなかった — todo #33）:

```
| ファイル | 役割 |
|---|---|
| `run` | ランナー。PATH を固定し、4 つのゲート（文字・バナー引数・行数・spec ⇔ ID）を通してから各ハーネスを実行。所要時間を出す |
| `helpers.js` | playwright-core / Chromium 実体の探索、合否集計、`file://` URL 組み立て、`TOOL_COUNT`（本数の固定ピン） |
| `hub.js` / `launcher.js` | index.html（HUB-1〜27: 表示順・検索・README 照合・3点セット）/ 引き出しメニュー（LA-01〜10） |
| `<alias>.js`（17 本） | 各ツール。`docs/specs/<alias>.md` のテストケースを照合する |
| `taskboard.js` + `taskboard/*.js` | 入口＋節 10 本（fixtures.js・engine・input・timeline-model・edit・board-search・deps・status・timeline-ui・flows・parent） |
| `issue.js` + `issue/*.js` | 入口＋節 4 本（pure・ui-list・lines・close） |
```

「構成」の後に節を足す:

```
## ゲート（ハーネスの前に `run` が通す静的検査）

| ゲート | 落とすもの | 直し方 |
|---|---|---|
| 文字 | 許可範囲外の文字（ホモグリフ・双方向制御・不可視文字・CR）。対象は `web/**` `lib/*.js` `test/**` `docs/**` `CLAUDE.md` `README.md` | 意図した文字なら `run` の `@ALLOW` に範囲を足す |
| バナー引数 | `showBanner` / `ToolUI.banner` の種別の位置に種別以外のリテラル | 引数順を統一形に直す |
| 行数（警告のみ） | 1,000 行超のファイル（`SIZE_KNOWN` 以外） | 同名フォルダに分ける（coding-rules「ファイルの分割」） |
| spec ⇔ ID | テストにあって spec に無い ID・同じ alias 内の ID の二重使用（hub は対象外） | spec に行を足す／ID を分ける |
```

「ハーネスを足すとき」に 8 を足す: `8. **1,000 行を超えたら入口＋節に分ける**（`test/taskboard.js` が手本。節は `{ name, ids, run(ctx) }`・前の節の状態に依存しない）`

- [ ] **Step 5: verification-notes.md に §12**

末尾に

```
## 12. classic script の分割は「連結等価」で確かめる（2026-09-25 実測）

- 症状: 4,000 行超の1本の `<script>` を複数ファイルに分けたい。ES モジュールは file:// で使えない
- 事実: classic script の top-level `const` / `let` / `function` はページ全体で1つのグローバル字句スコープを共有する。
  したがって**節の境目で切って元の順序で `<script src>` に並べれば、連結した中身が同一である限り挙動は同一**
  （taskboard 8 本・issue 4 本で実測。270 / 87 チェックが変更なしで pass）
- 罠: 読み込み時に実行される文（列 0 の `addEventListener` や代入）が後のファイルの宣言を使うと落ちる。
  切る前に `awk '/^[^ \t\/\*}]/ && !/^(function|async function|const|let)/'` で列 0 の実行文を洗い、起動節以外に無いことを見る
- 対処: 断片を元の順に `cat` して元の `<script>` 本体と `diff`（空であること）。手順は docs/audits/2026-09-25-structure-plan.md Task 7
```

- [ ] **Step 6: todo.md と設計書**

`docs/todo.md`: 済んだ行を消す — #9（b 接尾の規約化）・#11（README を文字ゲートへ）・#17（節コメントのずれ）・#34（ゲートの説明）・#35（ux-backlog の表題と役割宣言）・#36（taskboard.md の冒頭ポインタ — 分割で目次になった）。#33 から `test/README.md:72-82` の構成表の部分を消す。
「監査側が「今のままで正しい」と判定したもの」の先頭 2 項目（1ツール=1HTML／`web/*.html` の分割はやらない・`lib/fsa.js` は見送り継続）を
`- 1ツール=1HTML完結と `web/*.html` の不分割・`lib/fsa.js` の見送りは **2026-09-25 に条件が発火して転換**（issue.html が2番目の利用者に。`docs/audits/2026-09-25-structure.md`）` の1行に置き換える。

`docs/audits/2026-09-25-structure.md` の末尾に

```
## 10. 実装時の差分（実装日を書く）

- テストの節は**元の実行順のまま連続した範囲**で切った（engine / input / timeline-model / edit / board-search / deps / status / timeline-ui / flows / parent）。
  テーマで寄せ直すと前の節の状態に依存していた箇所が動くため。§6 の節名は変更
- spec のテスト表は**表ごと**に話題ファイルへ置き、行単位では分けなかった（混在する3表は主たる話題に置き、他方の冒頭で案内）
```

- [ ] **Step 7: ゲートと Commit**

Run: `./test/run hub` と `./test/run launcher`（README・CLAUDE.md・docs を文字ゲートが見る。HUB-15/16 が README を照合する）→ pass。

```bash
git add CLAUDE.md README.md docs/coding-rules.md test/README.md docs/verification-notes.md docs/todo.md docs/audits/2026-09-25-structure.md
git commit -m "docs: CLAUDE.md の構成を新しい形に（本数と対応表を消す）、coding-rules に「ファイルの分割」、test/README にゲートと節、verification-notes §12、todo を消化

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 15: 締め — 全スイートと報告

**Files:** なし（実行と報告だけ）

- [ ] **Step 1: 全スイート**

Run: `./test/run`
Expected: 19 ハーネスすべて pass・チェック数 887 以上（開始時 886 + TB-FS1）・コンソールエラー 0・行数警告は `SIZE_KNOWN` 以外に出ない・ID ゲート無言

- [ ] **Step 2: 実機 file:// を2ページ**

`open index.html` → ハブから Plan Tasks と Check Issue を開き、引き出しメニュー（Cmd+K）で往復する。コンソールにエラーが無い

- [ ] **Step 3: 報告**

利用者への報告に入れるもの: 分割後の行数一覧（`wc -l web/taskboard.html web/taskboard/*.js web/issue.html web/issue/*.js test/taskboard.js test/taskboard/*.js test/issue.js test/issue/*.js docs/specs/taskboard.md docs/specs/taskboard/*.md`）、全スイートの数字、`git log --oneline` の段階ごとのコミット、Review Focus 5 項目の確認結果、今回やらなかったこと（devpad / mask / gantt / board の分割・todayStr・保存ブロック・spec 本文の書き直し・コミット subject の短縮）
