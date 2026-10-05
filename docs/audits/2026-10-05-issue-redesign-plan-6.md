# 段6 実装計画: Check Vault に一覧の振る舞い（設定は ⋯・表を読みやすく・いま）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check Vault（`web/vaultlint.html`）に、利用者が選んだ3つを入れる — ①設定欄を見出しの ⋯ へ（まだ設定していない初回だけ開いて出す）②表を読みやすく（ファイル名を主に・フォルダは薄く・日付は `2026/10/1(木)`・「—」を消す・0件の種類は1行にまとめる・種類ごとにたためる）③一番上に「いま」（直す・片づけ・確認を種類ごとに1行・押すとその表へ）。

**Architecture:** 先に `web/vaultlint.html`（990 行 — 足すと 1,000 行を超える）を節ごとに `web/vaultlint/{engine,fix,ui,fsa}.js` へ分ける（中身は1文字も変えない — 連結して元と diff ゼロ）。そのうえで ui.js に表の描き方、新しい `web/vaultlint/now.js` に「いま」を足す。「いま」は共通部品 `ToolUI.nowStrip` を使い、数は札の数ではなく問題の件数で出したいので、部品に `kinds[].total`（数の上書き）を1つ足す（Plan Tasks・Check Issue は渡さないので変わらない）。

**Tech Stack:** 素の JS（classic script・`file://`）、CSS、Playwright のハーネス（`./test/run vaultlint`）

**Spec:** [docs/audits/2026-10-02-issue-redesign.md](2026-10-02-issue-redesign.md)（段6「Check Vault に一覧の振る舞い（何を入れるかは段6の前に利用者と決める）」）・`docs/coding-rules.md`「見た目と操作の決まり」1〜8・利用者の選択（2026-10-05）: **設定欄を ⋯ へ／一番上に「いま」／表を読みやすく**（「行から Obsidian で開く」は選ばれなかった — 入れない）

## Global Constraints

- `file://` で動く。ES モジュール禁止。描画は `textContent` / `createElement` のみ
- **分ける Task 1 は中身を1文字も変えない**（各ファイルの頭に4行の見出しを足すだけ。見出しを除いて連結すると元の `<script>` 本体と diff ゼロ）。起動とテスト用フック（`window.vaultlint`）は入口ページに残す
- **id を変えない**（`#settings`・`#cfg-*`・`#cfg-save`・`#pick`・`#env-note` などはテストが evaluate で使う）
- **報告のコピー（`buildReport`）は変えない**（vault の `_rules/backlog.md` に貼る形 — 全パスのまま）
- **検査していない種類を「問題なし」と言わない**（`activeClasses()` の規則 — VL-U6）。0件の種類をまとめる行も `activeClasses()` の中だけ
- たたんでも修復の選択は残る（見えないだけ）。［選択した修復を実行］の件数は今と同じ
- 「いま」の札は**種類ごと**（1件ずつ並べない — リンク切れが40件あっても札は1つ）。数は件数
- 文字は `test/run` の許可範囲の中だけ
- 1ファイル 1,000 行を超えない
- コミットは1タスク1コミット。日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **分けたあとの読み込み順**: 列 0 の実行文（配線・`applyConfig` の起動）が後のファイルの宣言を値として使っていない — Task 1 の diff ゼロと全テスト
2. **未設定の初回**: ⋯ が開いて設定が見え、［vault フォルダを選択］が無効な理由が「⋯ の中」を指す。保存したら ⋯ が閉じる。設定済みで開いたら閉じている — VL-L1・VL-U7
3. **ファイル名の罠の名前を勝手に整えない**（連続空白・全角空白・NBSP がそのまま見える。`.md` も落とさない）— VL-T1
4. **たたんだ表と「いま」の札**: 札を押すとたたんだ表が開いて光る。描き直してもたたみは残る — VL-T4・VL-N2
5. **数は件数**（札の数ではない）: 直す 6（リンク切れ 3・添付消失 2・ファイル名の罠 1）— VL-N1。Plan Tasks・Check Issue の「いま」は変わらない — 既存の TB-NW・IS-LK10

---

## ファイルの地図

| ファイル | 役目 | タスク |
|---|---|---|
| `web/vaultlint/engine.js`（新規） | 元の「純関数」の節（80〜343 行） | 1 |
| `web/vaultlint/fix.js`（新規） | 元の「修復エンジン」の節（344〜520 行） | 1 |
| `web/vaultlint/ui.js`（新規） | 元の「UI」の節（521〜701 行）＋ Task 3 の表の描き方 | 1・3 |
| `web/vaultlint/fsa.js`（新規） | 元の「FSA 走査」の節と設定の配線（702〜940 行）＋ Task 2 の ⋯ の開け閉め | 1・2 |
| `web/vaultlint/now.js`（新規） | 「いま」 | 4 |
| `web/vaultlint.html` | `<script src>`・起動・テスト用フック・⋯ の HTML・CSS・`#now` | 1〜4 |
| `lib/ui.js` | `nowStrip` の `kinds[].total` | 4 |
| `docs/specs/vaultlint.md` | 画面構成・VL-L1・VL-T1〜T4・VL-N1〜N3・VL-U1/U3/U6 の改訂・VL-Q15 | 2〜5 |
| `test/vaultlint.js` | 上のテスト | 2〜4 |
| `docs/coding-rules.md`・`CLAUDE.md` | lib の表（`nowStrip` の total）・構成の「分けたツール」・チェック数 | 5 |

---

### Task 1: vaultlint.html を節ごとに分ける（中身は変えない）

**Files:**
- Create: `web/vaultlint/{engine,fix,ui,fsa}.js`
- Modify: `web/vaultlint.html`

- [ ] **Step 1: 元を取っておく** — `ORIG=<作業用フォルダ>/vaultlint.orig.html; /bin/cp -f web/vaultlint.html $ORIG`。
  行の境目を確かめる: `sed -n '77,80p;940,945p;986,988p' $ORIG` で 77 `<script>`・78 `'use strict';`・80 `/* ========== 純関数 …`・940 `});`（設定の保存の配線の終わり）・942 `ToolStorage.mountWarning();`・943 `applyConfig(ToolConfig.all());`・945 `/* ========== テスト用フック`・987 `ToolLauncher.mount();`・988 `</script>`。
  節の頭: 344 `/* ========== 修復エンジン`・521 `/* ========== UI`・702 `/* ========== FSA 走査`（`grep -n "/\* ==========" $ORIG` で確かめる。ずれていたらその行に合わせる）

- [ ] **Step 2: 4つのファイルを作る** — それぞれ「4行の見出し」＋元の行（そのまま）:

```bash
mkdir -p web/vaultlint
hdr() {  # $1=ファイル名 $2=役目 $3=前提 $4=読み込み時に実行する文
  printf "'use strict';\n/* web/vaultlint/%s — %s\n   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: %s。%s\n   2026-10-05 に vaultlint.html から節ごとに分けた（段6 — 1,000 行を超えるため。coding-rules「ファイルの分割」） */\n" "$1" "$2" "$3" "$4"
}
{ hdr engine.js '純関数（lint・frontmatter・閉じたイシューの移動先）。フックと UI が同じ道を通る' 'なし（最初に読まれる）' '読み込み時に実行する文は無い（宣言だけ）'; sed -n '80,343p' $ORIG; } > web/vaultlint/engine.js
{ hdr fix.js '修復エンジン（提案 → 承認 → 実行。VL-15〜19）' 'engine.js（CFG・basenameOf・forEachCodeFreeLine）' '読み込み時に実行する文は無い（宣言だけ）'; sed -n '344,520p' $ORIG; } > web/vaultlint/fix.js
{ hdr ui.js '結果の表・報告・修復の選択（CLASS_DEFS・render）' 'engine.js・fix.js（canDeleteLine）・lib/ui.js' '読み込み時に実行する文は無い（宣言だけ）'; sed -n '521,701p' $ORIG; } > web/vaultlint/ui.js
{ hdr fsa.js 'vault の走査（FSA・読み取り専用）・修復の実行・設定（lib/config.js）' 'engine.js・fix.js・ui.js・lib/config.js・lib/storage.js' '読み込み時に実行する文はボタンの配線だけ（同じファイルと前のファイルの関数を渡す）'; sed -n '702,940p' $ORIG; } > web/vaultlint/fsa.js
```

- [ ] **Step 3: 入口ページを書き換える** — `web/vaultlint.html` の `<script>`（77 行）から `</script>`（988 行）までを次に置き換える（`<script src="../lib/config.js"></script>` までの lib の行はそのまま）:

```html
<script src="vaultlint/engine.js"></script>
<script src="vaultlint/fix.js"></script>
<script src="vaultlint/ui.js"></script>
<script src="vaultlint/fsa.js"></script>
<script>
'use strict';
/* ---------- 起動（**すべての定義の後**に置く。2026-10-05 に節ごとのファイルへ分けた — web/vaultlint/*.js） ---------- */
（元の 942〜943 行）

（元の 945〜987 行 — テスト用フックと ToolLauncher.mount）
</script>
```

  （実際には `{ sed -n '1,76p' $ORIG; printf '%s\n' '<script src="vaultlint/engine.js"></script>' … ; sed -n '942,943p' $ORIG; echo; sed -n '945,987p' $ORIG; sed -n '988,$p' $ORIG; } > web/vaultlint.html` で組む）

- [ ] **Step 4: 中身が同じことを確かめる**

```bash
diff <(sed -n '80,940p' $ORIG) <(for f in engine fix ui fsa; do tail -n +5 web/vaultlint/$f.js; done) && echo "節: 差なし"
diff <(sed -n '942,943p;945,987p' $ORIG) <(awk '/^ToolStorage.mountWarning/{f=1} f' web/vaultlint.html | grep -v '^$' | sed '/^<\/script>/,$d') && echo "起動とフック: 差なし"
wc -l web/vaultlint.html web/vaultlint/*.js
```

  Expected: 「差なし」が2つ（2つ目の diff は空行の扱いが合わなければ目で確かめる）。どのファイルも 1,000 行未満（vaultlint.html は約 130 行）

- [ ] **Step 5: 通ることを確かめる**

Run: `./test/run vaultlint` → すべて pass（分けただけ）
Run: `./test/run hub` → すべて pass（HUB-28 の vaultlint・HUB-29）

- [ ] **Step 6: コミット**

```bash
git add web/vaultlint.html web/vaultlint/engine.js web/vaultlint/fix.js web/vaultlint/ui.js web/vaultlint/fsa.js
git commit -m "vaultlint: 節ごとのファイルに分ける（純関数・修復エンジン・UI・走査 — 中身は1文字も変えない。段6で足すと 1,000 行を超えるため）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 設定欄を見出しの ⋯ へ

**Files:**
- Modify: `web/vaultlint.html`（見出しに ⋯・`#settings` を中へ・CSS・起動で初回だけ開ける）・`web/vaultlint/fsa.js`（`updatePickState` と保存の配線）・`docs/specs/vaultlint.md`・`test/vaultlint.js`

**Interfaces:**
- Produces（DOM）: `header.app-head > details.more-menu#vl-more > .more-panel > #settings`（中身はそのまま）

- [ ] **Step 1: spec** — `docs/specs/vaultlint.md` の「画面構成」の `- ［vault フォルダを選択］ボタン（…` の前に1行:

```markdown
- **設定欄（`#settings`）は見出しの ⋯（`#vl-more`）の中**（2026-10-05 段6・VL-Q15 — いつも出ていて結果が下に押されていた）。
  **非公開フォルダがまだ決まっていない（初回）は ⋯ を開いて出す**。［設定を保存］で ⋯ を閉じる。［vault フォルダを選択］が無効な理由は「⋯ の中の「非公開フォルダ」」を指す
```

  「テストケース」の表（VL-U11 の行の後）に:

```markdown
| VL-L1 | 設定なしで開く → 非公開フォルダを空のまま［設定を保存］→ 開き直す | 初めは `#vl-more` が開いていて `#settings` がその中・理由の文に「⋯」／保存で閉じて［vault フォルダを選択］が有効／開き直すと閉じている |
```

- [ ] **Step 2: テストを書く** — `test/vaultlint.js` の VL-U8 の check の後に（`page.addInitScript` で showDirectoryPicker を固定した状態が続いている前提 — VL-U7 の頭）:

```js
  /* ========== VL-L1: 設定欄は見出しの ⋯ の中（段6 — 初回だけ開いて出す・保存で閉じる） ========== */
  await page.evaluate(() => localStorage.removeItem('tools:config'));
  await page.reload();
  const l1a = await page.evaluate(() => {
    const more = document.getElementById('vl-more');
    return { open: !!more && more.open, inside: !!more && more.contains(document.getElementById('settings')),
      note: document.getElementById('env-note').textContent };
  });
  const l1b = await page.evaluate(() => {
    document.getElementById('cfg-private').value = '';
    document.getElementById('cfg-save').click();
    const more = document.getElementById('vl-more');
    return { open: !!more && more.open, disabled: document.getElementById('pick').disabled };
  });
  await page.reload();
  const l1c = await page.evaluate(() => { const more = document.getElementById('vl-more'); return { open: !!more && more.open }; });
  r.check('VL-L1（設定欄は ⋯ の中: 初回は開いて出し理由は ⋯ を指す・保存で閉じて選択が有効・設定済みで開くと閉じている）',
    l1a.open && l1a.inside && l1a.note.includes('⋯') && !l1b.open && l1b.disabled === false && !l1c.open,
    JSON.stringify({ l1a, l1b, l1c }));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run vaultlint` → VL-L1 が FAIL（`#vl-more` が無い）

- [ ] **Step 4: HTML と CSS** — `web/vaultlint.html`:
  - `<h1 title="…">Check Vault</h1>` の次の行に（`</header>` の前）:

```html
    <span class="spacer"></span>
    <details class="more-menu" id="vl-more">
      <summary title="vault のフォルダ構成（非公開・Inbox・アーカイブ先・イシュー）">⋯</summary>
      <div class="more-panel">
        （今の <div id="settings"> … </div> をそのままここへ移す）
      </div>
    </details>
```

  - 元の場所（`.app-controls` の後）の `<div id="settings">…</div>` は消す（移しただけ）
  - `<style>` の `#settings` の4行の後に:

```css
  /* ⋯ の中の設定（段6）。縦に並べて欄は幅いっぱい */
  .more-panel #settings { flex-direction: column; align-items: stretch; margin: 0; width: min(440px, 80vw); }
  .more-panel #settings input { min-width: 0; width: 100%; box-sizing: border-box; }
```

- [ ] **Step 5: 開け閉め** — `web/vaultlint/fsa.js`:
  - `updatePickState` の `(unset ? '先に「非公開フォルダ」を決めて［設定を保存］を押してください（除外なしでよければ空欄のまま保存）' : '')` を
    `(unset ? '先に ⋯ の中の「非公開フォルダ」を決めて［設定を保存］を押してください（除外なしでよければ空欄のまま保存）' : '')` に
  - 保存の配線の `showBanner('success', '設定を保存しました');` の前に `el('vl-more').open = false;   // 保存したら閉じる（結果を隠さない）`
  - **開けるのは起動のときだけ**（`updatePickState` では開けない — `test.run` は設定を差し込むたびに `applyConfig` を通るので、そこで開けると
    設定を省いたテストのたびに ⋯ が開いたままになる）: `web/vaultlint.html` の起動の `applyConfig(ToolConfig.all());` の次の行に
    `if (CFG.privateDirs === null) el('vl-more').open = true;   // 初回（非公開フォルダが未設定）は ⋯ を開いて設定を見せる（段6 — VL-L1）`

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run vaultlint` → すべて pass（VL-L1・VL-U7〜U9 も）
Run: `./test/run hub` → HUB-28 の vaultlint が PASS のまま（1行目は1段）

- [ ] **Step 7: コミット**

```bash
git add web/vaultlint.html web/vaultlint/fsa.js docs/specs/vaultlint.md test/vaultlint.js
git commit -m "vaultlint: 設定欄を見出しの ⋯ へ（初回だけ開いて出す・保存で閉じる・選べない理由は ⋯ を指す — VL-L1）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 表を読みやすく

**Files:**
- Modify: `web/vaultlint/ui.js`（`CLASS_DEFS` の row・`render`・`fileCell`・`vlFolded`）・`web/vaultlint.html`（`<script src="../lib/edit.js">`・CSS）・`docs/specs/vaultlint.md`・`test/vaultlint.js`

**Interfaces:**
- Consumes: `ToolEdit.fillDate(host, ymd, today)`（lib/edit.js）・`todayStr()`（fsa.js — 呼ぶのは描くとき）
- Produces（DOM）: 種類の表 `section.issue-block[data-key=<key>]`（`h2` の中に `button.vl-fold`（▾／▸）と題名）・表の包み `.table-wrap`（たたむと hidden）・ファイルの欄 `td.vl-file`（`span.vl-name`・`span.vl-dir`・title は全パス。ファイル名の罠は `td.vl-file.raw`）・日付の欄 `td.vl-date`・0件の種類は最後に `p.issue-ok`（1つ・`data-kinds` に数）
- Produces: `const vlFolded = new Set()`（たたんだ種類の key — 描き直しても残る）・`setClassFolded(sec, folded)`

- [ ] **Step 1: spec** — `docs/specs/vaultlint.md` の「画面構成」の `- 結果: サマリ行（…）＋クラス別の表` の箇条を次に置き換える:

```markdown
- 結果: サマリ行（`ファイル N・ノート M・リンク L ／ 問題 K 件`）＋**種類ごとの表**（ファイル・行番号・対象・補足）。
  2026-10-05 段6・VL-Q15（coding-rules「見た目と操作の決まり」1〜5・8）:
  - **ファイルの欄は名前が主**（`.md` を落とす・イシューは先頭の日付 `YYYY-MM-DD_` も落とす・デイリーは日付の表記 `2026/9/20(日)`）、**フォルダは薄く**後ろに。全パスは title。
    **ファイル名の罠は名前そのものが問題なので整えない**（連続空白・全角空白・NBSP・`.md` もそのまま・等幅）
  - 日付（閉じた日）は `2026/10/1(木)`（`ToolEdit.fillDate`）。**空欄に「—」を置かない**
  - **0件の種類は表を作らず、最後に1行「問題なし ✅ 添付消失・重複ベース名・…」**（検査した種類だけ — 未検査を問題なしと言わない）
  - 種類の見出しの ▾ で**表をたためる**（描き直しても残る・画面を閉じるまで）。たたんでも修復の選択は残る
```

  「テストケース」の表の VL-U1・VL-U3・VL-U6 の行を次に改め、VL-L1 の行の後に VL-T1〜T4 を足す:

```markdown
| VL-U1 | `a.md` に `[[c]]` | サマリに「問題 1 件」・表のファイルの欄は「a」（title は a.md）・ターゲット「c」・［報告をコピー］に「## リンク切れ（1件）」「a.md:1 → c」 |
| VL-U3 | 健全な vault（Inbox あり） | 「問題 0 件」・表は無く `.issue-ok` が1つで5種類（`data-kinds` 5） |
| VL-U6 | Inbox 未設定 | `.issue-ok` の種類は4つで「Inbox 棚卸し」を含まない |
| VL-T1 | リンク切れ（10_Projects/ITK/計画.md）・古いデイリー（00_Inbox/2026-09-20.md）・閉じたイシュー（04_Issues/2026-09-20_ゴールの仮決め.md）・ファイル名の罠（30_Resources/用語＋空白2つ＋集.md） | 名前とフォルダが「計画｜10_Projects/ITK」「2026/9/20(日)｜00_Inbox」「ゴールの仮決め｜04_Issues」「用語＋空白2つ＋集.md｜30_Resources」・どれも title は全パス・罠は `.raw` |
| VL-T2 | 同じ vault | 閉じた日の欄が「2026/10/1(木)」・`#results` のどこにも「—」が無い |
| VL-T3 | リンク切れだけ（Inbox あり） | 表は リンク切れ だけ・`.issue-ok` が1つで「問題なし ✅ 添付消失・ファイル名の罠・重複ベース名・Inbox 棚卸し」 |
| VL-T4 | リンク切れの ▾ を押す → 描き直す → もう一度押す | 表が隠れて ▸／描き直しても隠れたまま／また出て ▾ |
```

- [ ] **Step 2: テストを書く** — `test/vaultlint.js` の VL-U1・U3・U6 の照合を改める:
  - VL-U1: `u1.cells.includes('a.md')` を `u1.cells.includes('a')` に。evaluate の戻りに `fileTitle: (document.querySelector('.issue-block td.vl-file') || {}).title` を足し、照合に `&& u1.fileTitle === 'a.md'`
  - VL-U3: evaluate の `okCount: document.querySelectorAll('.issue-ok').length,` の次に `okKinds: (document.querySelector('.issue-ok') || { dataset: {} }).dataset.kinds,`、照合の `u3.okCount === 5` を `u3.okCount === 1 && u3.okKinds === '5'` に
  - VL-U6: 同じく `okKinds` を足し、`u6.okCount === 4` を `u6.okCount === 1 && u6.okKinds === '4'` に

  VL-L1 の check の後に:

```js
  /* ========== VL-T1〜T4: 表を読みやすく（段6） ========== */
  const SP2 = String.fromCharCode(0x20, 0x20);   // 連続半角スペース（ファイル名の罠）
  const T_FILES = [
    { path: '10_Projects/ITK/計画.md', text: '[[ネットワーク構成]]' },
    { path: '00_Inbox/2026-09-20.md', text: '- メモ' },
    { path: '04_Issues/2026-09-20_ゴールの仮決め.md', text: '---\nstatus: closed\nclosed: 2026-10-01\n---\n# ゴールの仮決め' },
    { path: '30_Resources/用語' + SP2 + '集.md', text: '' },
  ];
  const T_CFG = { privateDirs: [], inboxDir: '00_Inbox', archiveDir: '90_Archive/daily', issueDir: '04_Issues', closedDir: '90_Archive/{YYYY}' };
  const t1 = await page.evaluate(([files, cfg]) => {
    window.vaultlint.test.run(files, '2026-10-05', cfg);
    const cell = (key) => { const td = document.querySelector('#results section[data-key="' + key + '"] td.vl-file'); if (!td) return null;
      return { name: (td.querySelector('.vl-name') || {}).textContent, dir: (td.querySelector('.vl-dir') || {}).textContent || '', title: td.title, raw: td.classList.contains('raw') }; };
    return { broken: cell('brokenLinks'), inbox: cell('inbox'), closed: cell('closedIssues'), bad: cell('badNames'),
      date: (document.querySelector('#results section[data-key="closedIssues"] td.vl-date') || {}).textContent || '',
      dash: document.getElementById('results').textContent.includes('—') };
  }, [T_FILES, T_CFG]);
  r.check('VL-T1（ファイルの欄: 名前が主でフォルダは薄く・.md と先頭の日付を落とす・デイリーは日付の表記・title は全パス・ファイル名の罠はそのまま）',
    eq(t1.broken, { name: '計画', dir: '10_Projects/ITK', title: '10_Projects/ITK/計画.md', raw: false })
    && eq(t1.inbox, { name: '2026/9/20(日)', dir: '00_Inbox', title: '00_Inbox/2026-09-20.md', raw: false })
    && eq(t1.closed, { name: 'ゴールの仮決め', dir: '04_Issues', title: '04_Issues/2026-09-20_ゴールの仮決め.md', raw: false })
    && eq(t1.bad, { name: '用語' + SP2 + '集.md', dir: '30_Resources', title: '30_Resources/用語' + SP2 + '集.md', raw: true }), JSON.stringify(t1));
  r.check('VL-T2（閉じた日は 2026/10/1(木)・「—」がどこにも無い）', t1.date === '2026/10/1(木)' && t1.dash === false, JSON.stringify({ date: t1.date, dash: t1.dash }));
  const t3 = await page.evaluate(() => {
    window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }], '2026-10-05', { privateDirs: [], inboxDir: '00_Inbox' });
    return { keys: Array.from(document.querySelectorAll('#results section[data-key]')).map(s => s.dataset.key),
      ok: Array.from(document.querySelectorAll('.issue-ok')).map(p => p.textContent) };
  });
  r.check('VL-T3（0件の種類は表を作らず最後に1行 — 検査した種類だけ）',
    eq(t3.keys, ['brokenLinks']) && eq(t3.ok, ['問題なし ✅ 添付消失・ファイル名の罠・重複ベース名・Inbox 棚卸し']), JSON.stringify(t3));
  const t4 = await page.evaluate(() => {
    const run = () => window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }], '2026-10-05', { privateDirs: [] });
    const state = () => { const s = document.querySelector('#results section[data-key="brokenLinks"]');
      return { hidden: s.querySelector('.table-wrap').hidden, btn: s.querySelector('.vl-fold').textContent }; };
    run();
    document.querySelector('#results section[data-key="brokenLinks"] .vl-fold').click();
    const a = state();
    run();
    const b = state();
    document.querySelector('#results section[data-key="brokenLinks"] .vl-fold').click();
    return { a, b, c: state() };
  });
  r.check('VL-T4（種類の ▾ で表をたたむ・描き直しても残る・もう一度で戻る）',
    eq(t4, { a: { hidden: true, btn: '▸' }, b: { hidden: true, btn: '▸' }, c: { hidden: false, btn: '▾' } }), JSON.stringify(t4));
```

  （2026-09-20 は日曜・2026-10-01 は木曜 — 2026-10-05 が月曜から数えて確かめた）

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run vaultlint` → VL-U1・U3・U6・VL-T1〜T4 が FAIL

- [ ] **Step 4: `web/vaultlint.html`** — `<script src="../lib/config.js"></script>` の次の行に `<script src="../lib/edit.js"></script>`（日付の表記 `ToolEdit.fillDate`）。`<style>` の `.issue-block th { … }` の次に:

```css
  /* 表を読みやすく（段6 — coding-rules「見た目と操作の決まり」1〜5）。名前が主・フォルダは薄く・ファイル名の罠だけ等幅 */
  .issue-block td.vl-file, .issue-block td.vl-date { font-family: inherit; }
  .issue-block td.vl-file.raw { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .vl-name { font-weight: 600; white-space: pre; }
  .vl-dir { color: var(--muted); font-size: 11.5px; margin-left: 8px; }
  .issue-block h2 { display: flex; align-items: baseline; gap: 6px; }
  .vl-fold { border: 0; background: none; padding: 0 2px; color: var(--muted); cursor: pointer; font-size: 12px; box-shadow: none; }
  .vl-fold:hover { transform: none; box-shadow: none; }
```

- [ ] **Step 5: `web/vaultlint/ui.js`**
  - `CLASS_DEFS` の row を次に（ファイルの欄は `{ file, as }`、日付の欄は `{ date }`。「—」をやめる）:
    - brokenLinks・missingAttachments: `row: i => [{ file: i.file }, String(i.line), i.target],`
    - badNames: `row: i => [{ file: i.path, as: 'raw' }, i.reason],`
    - inbox: `row: i => [{ file: i.path, as: 'daily' }, i.age + '日', i.pending ? i.pending + '件' : ''],`
    - closedIssues: `row: i => [{ file: i.path, as: 'issue' }, i.project || '', { date: i.closed }, i.verdict || ''],`
  - `let lastReport = '';` の前に:

```js
const vlFolded = new Set();   // たたんだ種類の key（描き直しても残る・画面を閉じるまで — 段6・VL-T4）

// ファイルの欄: 名前を主に、フォルダは薄く後ろに（全パスは title）。名前は .md を落とし、イシューは先頭の日付も落とす（🎯 が付ける —
// coding-rules「見た目と操作の決まり」4）。デイリーは日付の表記。ファイル名の罠は名前そのものが問題なので整えない（as: 'raw'）
function fileCell(td, path, as) {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  let name = path.slice(slash + 1);
  td.classList.add('vl-file');
  if (as === 'raw') td.classList.add('raw');
  td.title = path;
  const n = document.createElement('span');
  n.className = 'vl-name';
  const daily = as === 'daily' && /^(\d{4}-\d{2}-\d{2})\.md$/i.exec(name);
  if (daily) {
    ToolEdit.fillDate(n, daily[1], todayStr());
    n.title = path;
  } else {
    if (as !== 'raw') name = name.replace(/\.md$/i, '');
    if (as === 'issue') name = name.replace(/^\d{4}-\d{2}-\d{2}_/, '');
    n.textContent = name;
  }
  td.appendChild(n);
  if (dir) {
    const d = document.createElement('span');
    d.className = 'vl-dir';
    d.textContent = dir;
    td.appendChild(d);
  }
}

// 種類の表をたたむ／開く（▾ と「いま」の札が同じここを通る — VL-T4・VL-N2）
function setClassFolded(sec, folded) {
  if (folded) vlFolded.add(sec.dataset.key); else vlFolded.delete(sec.dataset.key);
  const wrap = sec.querySelector('.table-wrap');
  if (wrap) wrap.hidden = folded;
  const b = sec.querySelector('.vl-fold');
  if (b) { b.textContent = folded ? '▸' : '▾'; b.title = folded ? 'この表を開く' : 'この表をたたむ（修復の選択は残ります）'; }
}
```

  - `render` の種類のループを次に置き換える（`for (const def of activeClasses()) {` から、`host.appendChild(block);\n  }` まで）:

```js
  const okTitles = [];   // 0件の種類（最後に1行 — 検査した種類だけ）
  for (const def of activeClasses()) {
    const list = res.issues[def.key];
    if (!list.length) { okTitles.push(def.title.replace(/（.*$/, '')); continue; }
    const block = document.createElement('section');
    block.className = 'issue-block';
    block.dataset.key = def.key;
    const h = document.createElement('h2');
    const fb = document.createElement('button');
    fb.type = 'button';
    fb.className = 'vl-fold';
    fb.addEventListener('click', () => setClassFolded(block, !vlFolded.has(def.key)));
    h.append(fb, def.title + '（' + list.length + '件）');
    block.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('tr');
    for (const c of def.cols.concat(def.fix ? ['修復'] : [])) {
      const th = document.createElement('th');
      th.textContent = c;
      thead.appendChild(th);
    }
    table.appendChild(thead);
    for (const item of list) {
      const tr = document.createElement('tr');
      for (const v of def.row(item)) {
        const td = document.createElement('td');
        if (v && typeof v === 'object' && 'file' in v) fileCell(td, v.file, v.as);
        else if (v && typeof v === 'object' && 'date' in v) { td.className = 'vl-date'; if (v.date) ToolEdit.fillDate(td, v.date, todayStr()); }
        else td.textContent = v;
        tr.appendChild(td);
      }
      if (def.fix) {
        const td = document.createElement('td');
        const conf = def.fix(item, ctx);
        if (conf) {
          const s = document.createElement('select');
          s.className = 'fix-select';
          for (const o of conf.options) {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            s.appendChild(opt);
          }
          s.value = conf.value;
          td.appendChild(s);
          fixControls.push({ get: () => def.selectionOf(item, s.value, conf) });
        }   // 修復の無い行は空欄（「—」を置かない — coding-rules 3）
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    block.appendChild(wrap);
    host.appendChild(block);
    setClassFolded(block, vlFolded.has(def.key));
  }
  if (okTitles.length) {
    const ok = document.createElement('p');
    ok.className = 'issue-ok';
    ok.dataset.kinds = String(okTitles.length);
    ok.textContent = '問題なし ✅ ' + okTitles.join('・');
    host.appendChild(ok);
  }
```

  （ui.js の頭の「前提」に `lib/edit.js（ToolEdit.fillDate）・fsa.js の todayStr（描くときに呼ぶ）` を足す）

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run vaultlint` → すべて pass
Run: `./test/run` → すべて pass

- [ ] **Step 7: 目で確かめる**（1回だけ）— 作業用フォルダで、架空の vault（リンク切れ3・添付消失2・罠1・古いデイリー4（未転記あり2）・閉じたイシュー2）を `window.vaultlint.test.run` で描いて撮る（1280px・ライト／ダーク）

- [ ] **Step 8: コミット**

```bash
git add web/vaultlint.html web/vaultlint/ui.js docs/specs/vaultlint.md test/vaultlint.js
git commit -m "vaultlint: 表を読みやすく — ファイル名を主にフォルダは薄く（.md と先頭の日付を落とす・デイリーは日付の表記・罠の名前はそのまま）・閉じた日は 2026/10/1(木)・「—」を消す・0件の種類は1行にまとめる・種類ごとにたためる（VL-T1〜T4・VL-U1/U3/U6 改訂）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 一番上に「いま」

**Files:**
- Create: `web/vaultlint/now.js`
- Modify: `lib/ui.js`（`nowStrip` の `kinds[].total`）・`web/vaultlint.html`（`#now`・`<script src>`・CSS）・`web/vaultlint/ui.js`（`render` の最後と失敗の経路で `renderVaultNow`）・`docs/specs/vaultlint.md`・`test/vaultlint.js`

**Interfaces:**
- Consumes: `setClassFolded`・`vlFolded`・`activeClasses`・`el`（Task 3・ui.js）・`ToolUI.nowStrip`・`ToolUI.flash`
- Produces: `ToolUI.nowStrip(box, { kinds: [{ id, label, head?, count, total? }], … })` — `total`（数）があれば見出しの数とバッジの数はそれ（無ければ今どおり札の数）
- Produces: `renderVaultNow(res)`・`jumpToClass(key)`・`#now`

- [ ] **Step 1: spec** — `docs/specs/vaultlint.md` の「画面構成」の設定欄の行の前に:

```markdown
- **一番上に「いま」**（`#now`・`ToolUI.nowStrip` — 2026-10-05 段6・VL-Q15）: **直す**（リンク切れ・添付消失・ファイル名の罠）／**片づけ**（古いデイリー — 未転記タスクの無いもの・閉じたイシュー）／
  **確認**（未転記タスクのあるデイリー — 手で転記してから片づける・重複ベース名）を1行ずつ。札は**種類ごと**に「リンク切れ 3」、数は**件数**（見出し「直す 6」）。
  押すとその種類の表へ動いて光る（たたんでいれば開く）。検査した種類だけ。走査する前は出さない。何も無ければ「直すもの・片づけるものはありません ✅」
```

  「テストケース」の表（VL-T4 の後）に:

```markdown
| VL-N1 | リンク切れ3・添付消失2・罠1・古いデイリー4（未転記あり2）・閉じたイシュー2 | 見出しの数「直す 6」「片づけ 4」「確認 2」・バッジ同じ・札は 直す「リンク切れ 3」「添付消失 2」「ファイル名の罠 1」／片づけ「古いデイリー 2」「閉じたイシュー 2」／確認「未転記タスクのあるデイリー 2」 |
| VL-N2 | リンク切れの表をたたんでから札「リンク切れ 3」を押す | 表が開き（▾）、その種類の表が光る（`.flash`） |
| VL-N3 | 走査する前／健全な vault | `#now` は隠れている／「直すもの・片づけるものはありません ✅」 |
```

- [ ] **Step 2: テストを書く** — `test/vaultlint.js` の VL-T4 の check の後に:

```js
  /* ========== VL-N1〜N3: 一番上に「いま」（段6） ========== */
  const N_FILES = [
    { path: '10_Projects/ITK/計画.md', text: '[[ネットワーク構成]]\n![[構成図.png]]\n[[会議メモ]]' },   // リンク切れ2・添付消失1
    { path: '20_Areas/読書メモ.md', text: '[[イシューからはじめよ]]\n![アーキ](img/arch.png)' },
    { path: '30_Resources/用語' + SP2 + '集.md', text: '' },
    { path: '00_Inbox/2026-09-20.md', text: '- [ ] 先方に連絡' },
    { path: '00_Inbox/2026-09-21.md', text: '- メモ' },
    { path: '00_Inbox/2026-09-22.md', text: '- メモ' },
    { path: '00_Inbox/2026-09-23.md', text: '- [ ] 見積\n- [ ] 返信' },
    { path: '04_Issues/2026-09-20_ゴールの仮決め.md', text: '---\nstatus: closed\nclosed: 2026-10-01\n---\n# a' },
    { path: '04_Issues/2026-09-25_先方に確認.md', text: '---\nstatus: closed\nclosed: 2026-10-03\n---\n# b' },
  ];
  const nowOf = () => page.evaluate(() => {
    const box = document.getElementById('now');
    if (!box) return { missing: true };
    return { hidden: box.hidden, cnt: Array.from(box.querySelectorAll('.now-cnt')).map(c => c.textContent.trim()),
      groups: Array.from(box.querySelectorAll('.now-group')).map(g => ({ badge: g.querySelector('.now-badge').textContent, ticks: Array.from(g.querySelectorAll('.tick')).map(t => t.textContent) })),
      empty: (box.querySelector('.now-empty') || {}).textContent || '' };
  });
  await page.evaluate(([files, cfg]) => window.vaultlint.test.run(files, '2026-10-05', cfg), [N_FILES, T_CFG]);
  const n1 = await nowOf();
  r.check('VL-N1（いま: 直す 6・片づけ 4・確認 2 — 数は件数・札は種類ごと）',
    !n1.missing && !n1.hidden && eq(n1.cnt, ['直す 6', '片づけ 4', '確認 2'])
    && eq(n1.groups, [{ badge: '直す 6', ticks: ['リンク切れ 3', '添付消失 2', 'ファイル名の罠 1'] }, { badge: '片づけ 4', ticks: ['古いデイリー 2', '閉じたイシュー 2'] },
      { badge: '確認 2', ticks: ['未転記タスクのあるデイリー 2'] }]), JSON.stringify(n1));
  const n2 = await page.evaluate(() => {
    const sec = () => document.querySelector('#results section[data-key="brokenLinks"]');
    if (!sec()) return { missing: true };
    sec().querySelector('.vl-fold').click();
    const tick = Array.from(document.querySelectorAll('#now .tick')).find(t => t.textContent === 'リンク切れ 3');
    if (tick) tick.click();
    return { hidden: sec().querySelector('.table-wrap').hidden, btn: sec().querySelector('.vl-fold').textContent, flash: sec().classList.contains('flash') };
  });
  r.check('VL-N2（札を押すとたたんだ表が開いて光る）', eq(n2, { hidden: false, btn: '▾', flash: true }), JSON.stringify(n2));
  await page.reload();
  const n3a = await nowOf();
  await page.evaluate(() => window.vaultlint.test.run([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }], '2026-10-05', { privateDirs: [] }));
  const n3b = await nowOf();
  r.check('VL-N3（走査する前は「いま」を出さない・健全なら「直すもの・片づけるものはありません ✅」）',
    !n3a.missing && n3a.hidden && !n3b.hidden && n3b.empty === '直すもの・片づけるものはありません ✅', JSON.stringify({ n3a, n3b }));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run vaultlint` → VL-N1〜N3 が FAIL（`#now` が無い）

- [ ] **Step 4: `lib/ui.js` の `nowStrip`** — 見出しの数の `String((spec.groups[k.id] || []).length)` を `String(typeof k.total === 'number' ? k.total : (spec.groups[k.id] || []).length)` に、
  バッジの `k.label + ' ' + list.length` を `k.label + ' ' + (typeof k.total === 'number' ? k.total : list.length)` に。
  lib/ui.js の頭の `nowStrip(box, spec)` の説明に「`kinds[].total` があれば数はそれ（無ければ札の数 — Check Vault は件数を出す・段6）」を足す

- [ ] **Step 5: `web/vaultlint/now.js` を作る**

```js
'use strict';
/* web/vaultlint/now.js — 「いま」（段6 — VL-N1〜N3・docs/audits/2026-10-05-issue-redesign-plan-6.md）
   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: ui.js（el・activeClasses・vlFolded・setClassFolded）・lib/ui.js（ToolUI.nowStrip / flash）。
   読み込み時に実行する文は無い（宣言だけ）。何を入れるかはここで決める（部品は見た目だけ） */

// [id, ラベル]。直す＝壊れているもの／片づけ＝移すだけのもの／確認＝人が見て決めるもの
const VL_NOW_KINDS = [['fix', '直す'], ['tidy', '片づけ'], ['check', '確認']];
// 札: [行, 種類の key, 札の名前, 件数]。札は種類ごと（1件ずつ並べない）
const VL_NOW_TICKS = [
  ['fix', 'brokenLinks', 'リンク切れ', l => l.length],
  ['fix', 'missingAttachments', '添付消失', l => l.length],
  ['fix', 'badNames', 'ファイル名の罠', l => l.length],
  ['tidy', 'inbox', '古いデイリー', l => l.filter(i => !i.pending).length],
  ['tidy', 'closedIssues', '閉じたイシュー', l => l.length],
  ['check', 'inbox', '未転記タスクのあるデイリー', l => l.filter(i => i.pending).length],
  ['check', 'dupBasenames', '重複ベース名', l => l.length],
];
let vlNowFolded = false;   // 「いま」をたたんだか（画面を閉じるまで）

function renderVaultNow(res) {
  const box = el('now');
  box.hidden = !res || !res.ok;
  if (box.hidden) return;
  const active = new Set(activeClasses().map(d => d.key));   // 検査した種類だけ
  const groups = { fix: [], tidy: [], check: [] };
  const total = { fix: 0, tidy: 0, check: 0 };
  for (const [kind, key, name, countOf] of VL_NOW_TICKS) {
    if (!active.has(key)) continue;
    const n = countOf(res.issues[key] || []);
    if (!n) continue;
    total[kind] += n;
    groups[kind].push({ parts: [{ text: name + ' ' + n }], title: name + ' ' + n + '件 — 押すとその表へ', onClick: () => jumpToClass(key) });
  }
  ToolUI.nowStrip(box, {
    kinds: VL_NOW_KINDS.map(([id, label]) => ({ id: id, label: label, count: true, total: total[id] })),
    groups: groups,
    folded: vlNowFolded,
    onFold: () => { vlNowFolded = !vlNowFolded; renderVaultNow(res); },
    empty: '直すもの・片づけるものはありません ✅',
  });
}

// 札から表へ: たたんでいれば開き、その種類の表まで動かして光らせる（VL-N2）
function jumpToClass(key) {
  const sec = document.querySelector('#results section[data-key="' + key + '"]');
  if (!sec) return;
  if (vlFolded.has(key)) setClassFolded(sec, false);
  sec.scrollIntoView({ block: 'start' });
  ToolUI.flash(sec);
}
```

- [ ] **Step 6: つなぐ**
  - `web/vaultlint.html`: `<script src="vaultlint/ui.js"></script>` の次に `<script src="vaultlint/now.js"></script>`。`<div class="banner" id="banner" hidden></div>` の次の行に `<section class="now" id="now" hidden aria-label="いま"></section>`。
    `<style>` の最後に:

```css
  /* 「いま」の行の色（段6）。直す＝遅れと同じ赤・片づけ＝閉じどきと同じ緑・確認＝今日と同じ橙 */
  .now-dot.k-fix { background: var(--st-late); }
  .now-dot.k-tidy { background: var(--st-ripe); }
  .now-dot.k-check { background: var(--st-today); }
  .now-badge.k-fix { color: var(--st-late); background: color-mix(in srgb, var(--st-late) 16%, transparent); }
  .now-badge.k-tidy { color: var(--st-ripe); background: color-mix(in srgb, var(--st-ripe) 16%, transparent); }
  .now-badge.k-check { color: var(--st-today); background: color-mix(in srgb, var(--st-today) 16%, transparent); }
```

  - `web/vaultlint/ui.js` の `render`: 失敗の経路（`if (!res.ok) {` の中の `return;` の前）と、最後（`el('commit-label').hidden = !fixable;` の次）に `renderVaultNow(res);`。ui.js の頭の「前提」に `now.js の renderVaultNow（描くときに呼ぶ）` を足す

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run vaultlint` → すべて pass
Run: `./test/run` → すべて pass（Plan Tasks の TB-NW・Check Issue の IS-LK10 などは `total` を渡さないので変わらない）

- [ ] **Step 8: 目で確かめる**（1回だけ）— Task 3 の Step 7 と同じ架空の vault で「いま」を撮る（ライト／ダーク）

- [ ] **Step 9: コミット**

```bash
git add web/vaultlint/now.js lib/ui.js web/vaultlint.html web/vaultlint/ui.js docs/specs/vaultlint.md test/vaultlint.js
git commit -m "vaultlint: 一番上に「いま」— 直す（リンク切れ・添付・名前）・片づけ（古いデイリー・閉じたイシュー）・確認（未転記のあるデイリー・重複名）を種類ごとに1行・数は件数・押すとその表へ（lib の nowStrip に total — VL-N1〜N3）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 決定事項と規約

**Files:**
- Modify: `docs/specs/vaultlint.md`（決定事項に VL-Q15）・`docs/coding-rules.md`（lib の表の ui.js の行）・`CLAUDE.md`（構成の「分けたツール」・チェック数）

- [ ] **Step 1: 決定事項** — `docs/specs/vaultlint.md` の「決定事項」の最後に:

```markdown
- **VL-Q15**（2026-10-05）: 段6（docs/audits/2026-10-02-issue-redesign.md）。利用者が選んだ3つ — **設定欄を見出しの ⋯ へ**（初回だけ開いて出す・保存で閉じる）・
  **表を読みやすく**（名前が主・フォルダは薄く・日付の表記・「—」を消す・0件の種類は1行・種類ごとにたためる。ファイル名の罠は整えない）・
  **一番上に「いま」**（直す・片づけ・確認。札は種類ごと・数は件数）。「行から Obsidian で開く」は選ばれなかった（入れない）。
  足すと 1,000 行を超えるので先に節ごとのファイル（web/vaultlint/*.js）へ分けた。報告のコピーは変えない（backlog に貼る形）
```

- [ ] **Step 2: 規約** — `docs/coding-rules.md` の「共通ライブラリ」の表の ui.js の行の `nowStrip(box, spec)` を `nowStrip(box, spec)`（`kinds[].total` で数を件数にできる — Check Vault）に

- [ ] **Step 3: CLAUDE.md** — 「構成」の `（現在 taskboard / issue。規約は coding-rules「ファイルの分割」）` を `（現在 taskboard / issue / vaultlint。規約は coding-rules「ファイルの分割」）` に

- [ ] **Step 4: 全体を回して数を数える**

Run: `./test/run`
Expected: すべて pass。合計は 1034 ＋ 8（VL-L1・VL-T1〜T4・VL-N1〜N3）＝ 1042 になるはず（違えば実数）

- [ ] **Step 5: `CLAUDE.md` の数を直す** — 「**1034チェックの検証機構が**」を Step 4 の実数に

- [ ] **Step 6: コミット**

```bash
git add docs/specs/vaultlint.md docs/coding-rules.md CLAUDE.md
git commit -m "docs: 段6（Check Vault — 設定は ⋯・表を読みやすく・いま）の決定事項 VL-Q15・nowStrip の total・分けたツールに vaultlint（1042チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
