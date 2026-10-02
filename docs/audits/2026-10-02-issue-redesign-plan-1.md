# 段1 実装計画: Plan Tasks の部品を lib/ へ移す

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan Tasks の中にある「日付の表記・状態の色・『いま』・光らせる・右クリックのメニューとキー・見出し2行」を `lib/` の共通部品に移し、Plan Tasks をそれに差し替える。見た目と動きは1つも変えない。

**Architecture:** classic script の共通部品（`window.ToolEdit` / `window.ToolUI`）と `lib/ui.css` に、見た目と操作だけを置く。何を「いま」に入れるか・どの操作を並べるかといったツール固有の判断は各ツールに残す（設計書 6②）。段2で Check Issue が2本目の利用者になる。

**Tech Stack:** 素の JS（classic script・`file://`）、CSS、Playwright のハーネス（`./test/run taskboard`）

**Spec:** [docs/audits/2026-10-02-issue-redesign.md](2026-10-02-issue-redesign.md)（段1）。部品の契約とテストケースは、この計画で新しく作る `docs/specs/taskboard/parts.md`

## Global Constraints

- `file://` で動く。ES モジュール禁止（共有は `<script src>`）。外部 CDN・実行時のネットワーク禁止
- 描画は `textContent` / `createElement` のみ。`innerHTML` など HTML 文字列の組み立ては禁止
- **段1の合否: 既存のチェックを1つも変えずに全部通す**（`./test/run` 全体が pass・コンソールエラー0件）。変えてよいテストのファイルは、新しい節 `test/taskboard/parts.js` と、その登録（`test/taskboard.js` の `SECTIONS`）だけ
- 新しいチェックの ID（TB-LP1〜LP13）は `docs/specs/taskboard/parts.md` に書く（`test/run` の ID ゲート）
- 文字は `test/run` の許可範囲の中だけ（範囲外は文字ゲートで落ちる）
- 1ファイル 1,000 行を超えない（今: `web/taskboard/list.js` 896 行・`lib/ui.js` 141 行・`lib/edit.js` 246 行）
- 共通部品は**見た目と操作だけ**。ツール固有の判断（「いま」に何を入れるか・メニューの項目と動き）は各ツールに残す
- `lib/` の各ファイル冒頭の「出力:」の行を更新する（coding-rules「共通ライブラリ — 使う前にヘッダコメントを読む」）
- `lib/ui.css` 冒頭の約束「ツール側 `<style>` はここで定義したクラスを再定義しない」を守る（移したら Plan Tasks 側から消す）
- コミットは論理単位で1タスク1コミット。メッセージは日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- 作業の前に `git status` を見る（別のセッションが同じリポジトリを触っていることがある）

## Review Focus

1. **読み込み順**: `lib/ui.js` は `lib/edit.js` より先に読まれる（taskboard.html も issue.html も）。`ToolUI` の部品が読み込み時に `ToolEdit` を参照すると、issue.html で落ちる → TB-LP13 で issue.html を開いて部品を呼ぶ（Task 6）
2. **ダーク・ライトの両方**: 状態の色の変数（`--st-late` など）が、どちらの配色でも定義されている → TB-LP10 でダークの配色も見る（Task 2）
3. **形の違う日付の文字**: `ToolEdit.fillDate` に `2026/8/1` のような形の違う文字が来ても落ちず、そのまま出す（今の Plan Tasks の `fillDate` は落ちうる）→ TB-LP1 に入れる（Task 1）
4. **詳細度の逆転**: 共通の CSS は先に読まれ、ツール側の同じ強さの指定に負ける。`.viewbar .tabs { flex: 1 1 auto; }` が `.app-controls .tabs` を上書きして表示の切替が横に伸びる → `.tb-controls #view-tabs` の行は Plan Tasks に残し、TB-V6（同じ段に並ぶ）と TB-LP12 で見る（Task 5）
5. **他のツールへの副作用**: `lib/ui.css` に足すクラス（`.yr` `.tick` `.now-*` `.flash` `.row-menu*` `.app-head` `.app-controls`）が他のツールの要素に当たる → 2026-10-02 に全ツールを検索して使われていないことを確認済み。`.tick` 系は `.now` の中に限る。全体のハーネス（全ツール）を各タスクの最後に回す

---

## ファイルの地図

| ファイル | 役目 | このタスクで |
|---|---|---|
| `lib/edit.js` | `ToolEdit.fillDate` / `ToolEdit.dueWords`（日付の表記） | Task 1 |
| `lib/ui.css` | 状態の色の変数・`.yr` `.due-rel`・「いま」・`.flash`・`.row-menu*`・`.app-head` `.app-controls` | Task 2・4・5 |
| `lib/ui.js` | `ToolUI.nowStrip` / `flash`（Task 3）、`menu` / `menuKey` / `isTyping` / `keyHint` / `pointRect` / `placeAt`（Task 4） | Task 3・4 |
| `web/taskboard/list.js` | 日付の関数を消して `ToolEdit` を呼ぶ・メニューとキーを `ToolUI` に差し替える | Task 1・4 |
| `web/taskboard/now.js` | 分け方は残し、描くのを `ToolUI.nowStrip` に任せる | Task 3 |
| `web/taskboard/modal.js` | `openPopover` の位置の計算を `ToolUI.placeAt` に | Task 4 |
| `web/taskboard.html` | 移した CSS を消す・見出しに `app-head` / `app-controls` を足す | Task 2・4・5 |
| `docs/specs/taskboard/parts.md`（新規） | 部品の契約とテストケース TB-LP1〜LP13 | Task 1 で作り、各タスクで足す |
| `docs/specs/taskboard.md` | 目次に parts.md を足す | Task 1 |
| `test/taskboard/parts.js`（新規） | 節 `parts` | Task 1 で作り、各タスクで足す |
| `test/taskboard.js` | `SECTIONS` に `'parts'` を足す | Task 1 |
| `docs/coding-rules.md` | 共通ライブラリの表に新しい部品・「見た目と操作の決まり」の節 | Task 6 |
| `CLAUDE.md` | 検証機構のチェック数 | Task 6 |

---

### Task 1: 日付の表記を `ToolEdit` へ（fillDate・dueWords）

**Files:**
- Modify: `lib/edit.js`（`global.ToolEdit = {…}` の直前に関数を足し、出力に追加。冒頭コメントの「出力:」も）
- Modify: `web/taskboard/list.js`（`const WEEKDAYS`・`function fillDate`・`function dueWords` を消し、呼び出しを `ToolEdit.fillDate` / `ToolEdit.dueWords` に）
- Create: `docs/specs/taskboard/parts.md`
- Modify: `docs/specs/taskboard.md`（目次の表に1行）
- Create: `test/taskboard/parts.js`
- Modify: `test/taskboard.js:19`（`SECTIONS` の配列の末尾に `'parts'`）

**Interfaces:**
- Produces: `ToolEdit.fillDate(host: Element, ymd: string, today: string): void` — `ymd` が空なら何もしない。`YYYY-MM-DD` なら `2026/8/1(土)`（今年の年は `<span class="yr">2026/</span>`）、それ以外の形はそのまま。`host.title = ymd`
- Produces: `ToolEdit.dueWords(due: string, today: string): string` — `3日遅れ`／`今日`／`明日`／`あと16日`

- [ ] **Step 1: spec を書く** — `docs/specs/taskboard/parts.md` を作る

```markdown
# taskboard: 共通部品へ移したもの（TB-LP1〜LP13 — 2026-10-02）

設計: `docs/audits/2026-10-02-issue-redesign.md` 段1。計画: `docs/audits/2026-10-02-issue-redesign-plan-1.md`。
Plan Tasks で作った見た目と操作を `lib/` に移し、Plan Tasks をそれに差し替えた。**見た目と動きは変えない**（既存のチェックは1つも変えずに通す）。
部品は見た目と操作だけ。何を「いま」に入れるか・メニューの項目と動きは各ツールに残す。

| ID | 操作 | 期待 |
|---|---|---|
| TB-LP1 | `ToolEdit.fillDate`（今日 2026-08-04）に `2026-08-01`／`2027-01-05`／空／`2026/8/1` | `2026/8/1(土)`（`2026/` は `.yr`・title `2026-08-01`）／`2027/1/5(火)`（`.yr` なし）／何も書かない（title も空）／`2026/8/1` のまま（title も同じ） |
| TB-LP2 | `ToolEdit.dueWords`（今日 2026-08-04）に 08-01／08-04／08-05／08-20 | `3日遅れ`／`今日`／`明日`／`あと16日` |
| TB-LP9 | Plan Tasks のページ | 移した関数・定数が Plan Tasks 側に残っていない（`fillDate`・`dueWords`・`WEEKDAYS`、Task 4 で `rowActionForKey`・`TYPING_SEL` も） |
```

- [ ] **Step 2: 目次に足す** — `docs/specs/taskboard.md` の目次の表の `decisions.md` の行の前に:

```markdown
| [parts.md](taskboard/parts.md) | 共通部品へ移したもの（日付・状態の色・いま・光らせる・メニューとキー・見出し2行） | LP |
```

- [ ] **Step 3: テストを書く** — `test/taskboard/parts.js` を作る

```js
'use strict';
/* test/taskboard/parts.js — 節: 共通部品へ移したもの（lib/edit.js の日付・lib/ui.js のメニュー・キー・「いま」・光らせる・lib/ui.css）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js parts）
   照合する ID: TB-LP1〜LP13。期待値の正本は docs/specs/taskboard/parts.md */
const fs = require('fs');
module.exports = {
  name: 'parts',
  ids: 'TB-LP1〜LP13',
  async run(ctx) {
    const { page, context, r, eq, fileUrl, REPO, path, session, F1 } = ctx;
    await session(F1);
    // 未実装でもハーネスを止めず fail として数える（RED を見るため）。非同期の関数の中で投げても止めない
    const safe = (fn, arg) => page.evaluate(([src, a]) => {
      try { return Promise.resolve((0, eval)('(' + src + ')')(a)).catch(e => 'ERR: ' + e.message); }
      catch (e) { return 'ERR: ' + e.message; }
    }, [fn.toString(), arg]);

    /* ---------- TB-LP1・LP2: 日付の表記 ---------- */
    const lp1 = await safe(() => {
      const f = (ymd, today) => { const s = document.createElement('span'); ToolEdit.fillDate(s, ymd, today);
        return { text: s.textContent, yr: (s.querySelector('.yr') || {}).textContent || '', title: s.title }; };
      return [f('2026-08-01', '2026-08-04'), f('2027-01-05', '2026-08-04'), f('', '2026-08-04'), f('2026/8/1', '2026-08-04')];
    });
    r.check('TB-LP1（ToolEdit.fillDate: 2026/8/1(土) で今年の年は .yr・来年は 2027/1/5(火)・空は書かない・形の違う文字はそのまま）',
      eq(lp1, [{ text: '2026/8/1(土)', yr: '2026/', title: '2026-08-01' }, { text: '2027/1/5(火)', yr: '', title: '2027-01-05' },
        { text: '', yr: '', title: '' }, { text: '2026/8/1', yr: '', title: '2026/8/1' }]), JSON.stringify(lp1));
    const lp2 = await safe(() => ['2026-08-01', '2026-08-04', '2026-08-05', '2026-08-20'].map(d => ToolEdit.dueWords(d, '2026-08-04')));
    r.check('TB-LP2（ToolEdit.dueWords: 3日遅れ／今日／明日／あと16日）', eq(lp2, ['3日遅れ', '今日', '明日', 'あと16日']), JSON.stringify(lp2));

    /* ---------- TB-LP9: 移したものが Plan Tasks に残っていない ---------- */
    const lp9 = await page.evaluate((names) => names.filter(n => { try { return (0, eval)('typeof ' + n) !== 'undefined'; } catch (e) { return false; } }),
      ['fillDate', 'dueWords', 'WEEKDAYS']);
    r.check('TB-LP9（移した関数・定数が Plan Tasks 側に残っていない）', eq(lp9, []), JSON.stringify(lp9));
  },
};
```

- [ ] **Step 4: 節を登録する** — `test/taskboard.js` の `SECTIONS` を次にする

```js
const SECTIONS = ['engine', 'input', 'timeline-model', 'edit', 'board-search', 'deps', 'status', 'timeline-ui', 'flows', 'arrange', 'parent', 'parts']
```

- [ ] **Step 5: 落ちることを確かめる**

Run: `./test/run taskboard parts`
Expected: TB-LP1・LP2 が FAIL（`ERR: ToolEdit.fillDate is not a function`）、TB-LP9 が FAIL（`["fillDate","dueWords","WEEKDAYS"]`）。ハーネス自体は止まらない

- [ ] **Step 6: `lib/edit.js` に足す** — `global.ToolEdit = { … };` の行の直前に:

```js
  /* 日付の表示（2026-10-02 に Plan Tasks から移設 — TB-V5・TB-Q68・TB-LP1）: 「2026/10/5(月)」。
     今年の年は薄く（.yr — 見た目は lib/ui.css）、今年でない年はふつうの濃さ。正確な日付は title。
     YYYY-MM-DD でない文字はそのまま出す（落とさない） */
  const WEEKDAYS = '日月火水木金土';
  function dayNumOf(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
  }
  function fillDate(host, ymd, today) {
    if (!ymd) return;
    host.title = ymd;
    const n = dayNumOf(ymd);
    if (n === null) { host.textContent = ymd; return; }
    const p = ymd.split('-');
    const rest = (+p[1]) + '/' + (+p[2]) + '(' + WEEKDAYS[(n + 4) % 7] + ')';   // 1970-01-01 は木曜
    if (p[0] === String(today).slice(0, 4)) {
      const y = document.createElement('span');
      y.className = 'yr';
      y.textContent = p[0] + '/';
      host.appendChild(y);
      host.appendChild(document.createTextNode(rest));
    } else host.textContent = p[0] + '/' + rest;
  }
  // 期限までの言葉（TB-V5・TB-LP2）
  function dueWords(due, today) {
    const d = dayNumOf(due) - dayNumOf(today);
    return d < 0 ? (-d) + '日遅れ' : d === 0 ? '今日' : d === 1 ? '明日' : 'あと' + d + '日';
  }
```

そして公開の行を:

```js
  global.ToolEdit = { tabIndent, mountTodayShortcut, today, addDays, noteFileName, dateChips, listItem, renumber, fillDate, dueWords };
```

冒頭コメントの「出力:」の行の `dateChips(input),` の後に ` fillDate(host, ymd, today), dueWords(due, today),` を足す。

- [ ] **Step 7: Plan Tasks を差し替える** — `web/taskboard/list.js` で
  - `// 日付の表示（TB-V5・TB-Q68）…` のコメントから `function fillDate(...) {...}` の終わりまで（`const WEEKDAYS = '日月火水木金土';` を含む）を消す
  - `function dueWords(due, today) {...}` を消す
  - `fillDate(` を呼んでいる2か所を `ToolEdit.fillDate(` に、`dueWords(` を呼んでいる1か所を `ToolEdit.dueWords(` に（`grep -n "fillDate(\|dueWords(" web/taskboard/*.js` で全部を確かめる。now.js などほかのファイルに呼び出しがあればそれも）

- [ ] **Step 8: 通ることを確かめる**

Run: `./test/run taskboard parts` → TB-LP1・LP2・LP9 が PASS
Run: `./test/run taskboard` → すべて pass（既存の TB-V5 を含む）・コンソールエラー0件
Run: `./test/run` → すべて pass

- [ ] **Step 9: コミット**

```bash
git add lib/edit.js web/taskboard/list.js docs/specs/taskboard/parts.md docs/specs/taskboard.md test/taskboard/parts.js test/taskboard.js
git commit -m "lib: 日付の表記（年＋月/日＋曜日・N日遅れ）を Plan Tasks から ToolEdit.fillDate / dueWords へ移す（形の違う日付でも落ちない・TB-LP1・LP2・LP9）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 状態の色・日付・「いま」・光らせるの CSS を `lib/ui.css` へ

**Files:**
- Modify: `lib/ui.css`（末尾に節を足す）
- Modify: `web/taskboard.html`（移した規則を消す）
- Modify: `docs/specs/taskboard/parts.md`（TB-LP10）
- Modify: `test/taskboard/parts.js`（TB-LP10）

**Interfaces:**
- Produces（CSS）: `:root` の `--st-late` `--st-today` `--st-doing` `--st-should`／`.yr`／`.due-rel`（`.late` `.today`）／`.now` 一式（`.now-head` `.now-title` `.now-cnt` `.now-dot.k-*` `.now-fold` `.now-list` `.now-group` `.now-badge.k-*` `.now .ticks` `.now .tick` `.now .tick-par` `.now .tick-rel` `.now-empty`）／`.flash`（`@keyframes tool-flash`）

- [ ] **Step 1: spec に足す**（parts.md の表に）

```markdown
| TB-LP10 | `lib/ui.css` と `web/taskboard.html` の中身・計算された `--st-late`（ライト・ダーク） | ui.css に `--st-late:`〜`--st-should:`・`.due-rel`・`.now-badge`・`@keyframes tool-flash` がある。taskboard.html に `--st-late:`・`.now-badge`・`row-flash`・`.due-rel {` が無い。`--st-late` はライトでもダークでも空でない |
```

- [ ] **Step 2: テストを足す**（parts.js の TB-LP9 の後に）

```js
    /* ---------- TB-LP10: CSS の置き場所 ---------- */
    const css = fs.readFileSync(path.join(REPO, 'lib/ui.css'), 'utf8');
    const html = fs.readFileSync(path.join(REPO, 'web/taskboard.html'), 'utf8');
    const lp10 = {
      libMissing: ['--st-late:', '--st-today:', '--st-doing:', '--st-should:', '.due-rel', '.now-badge', '@keyframes tool-flash'].filter(s => !css.includes(s)),
      tbLeft: ['--st-late:', '.now-badge', 'row-flash', '.due-rel {'].filter(s => html.includes(s)),
    };
    const stVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--st-late').trim());
    lp10.light = await stVar();
    await page.emulateMedia({ colorScheme: 'dark' });
    lp10.dark = await stVar();
    await page.emulateMedia({ colorScheme: null });
    r.check('TB-LP10（状態の色・日付・いま・光らせるの CSS は lib/ui.css に1つだけ・ライトでもダークでも --st-late がある）',
      eq(lp10.libMissing, []) && eq(lp10.tbLeft, []) && lp10.light !== '' && lp10.dark !== '', JSON.stringify(lp10));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run taskboard parts`
Expected: TB-LP10 が FAIL（`libMissing` に7つ、`tbLeft` に4つ）

- [ ] **Step 4: `lib/ui.css` の末尾に足す**（中身は `web/taskboard.html` の今の規則と同じ値。セレクタだけ次のとおり変える: `#task-table, #now {…}` → `:root {…}`、`#task-table .yr` → `.yr`、`.ticks` `.tick` `.tick-par` `.tick-rel` → `.now .ticks` など `.now` の中に限る、`#task-table tbody tr.flash` → `.flash`、`row-flash` → `tool-flash`）

```css
/* ---------- 状態の色・日付・「いま」・光らせる（2026-10-02 に Plan Tasks から移設 — docs/audits/2026-10-02-issue-redesign.md 段1）----------
   状態の色は1つの行に1つだけ（行の左端の帯）。期限の背景は塗らない（赤だらけにしない — TB-Q66） */
:root { --st-late: var(--error); --st-today: #d08770; --st-doing: #81a1c1; --st-should: color-mix(in srgb, #d08770 50%, transparent); }
/* 今年の年は薄く（TB-V5・TB-Q68）。今年でない年は .yr を付けないのでふつうの濃さ */
.yr { font-size: 11px; color: var(--muted); opacity: .85; }
.due-rel { display: block; font-size: 11.5px; color: var(--muted); line-height: 1.3; }
.due-rel.late { color: var(--st-late); font-weight: 600; }
.due-rel.today { color: var(--st-today); font-weight: 600; }
/* 「いま」（TB-NW）。.now と .now-list には display を書かない（hidden 属性で隠すため） */
.now { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);
  padding: 8px 14px 6px; margin: 0 0 12px; }
.now-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.now-title { font-weight: 700; font-size: 14px; letter-spacing: .06em; }
.now-cnt { font-size: 12.5px; color: var(--muted); display: inline-flex; align-items: center; gap: 5px; }
.now-cnt b { color: var(--text); font-variant-numeric: tabular-nums; }
.now-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.now-dot.k-late { background: var(--st-late); }
.now-dot.k-today { background: var(--st-today); }
.now-dot.k-doing { background: var(--st-doing); }
.now-fold { margin-left: auto; font-size: 12px; padding: 2px 8px; border: 0; background: transparent; color: var(--muted); }
.now-list { list-style: none; margin: 6px 0 0; padding: 0; }
.now-group { display: grid; grid-template-columns: 9.5em 1fr; gap: 10px; align-items: start; padding: 6px 0;
  border-top: 1px solid var(--border); }
.now-group:first-child { border-top: 0; }
.now-badge { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; justify-self: start; white-space: nowrap; margin-top: 3px; }
.now-badge.k-late { color: var(--st-late); background: color-mix(in srgb, var(--st-late) 16%, transparent); }
.now-badge.k-today { color: var(--st-today); background: color-mix(in srgb, var(--st-today) 16%, transparent); }
.now-badge.k-doing { color: var(--st-doing); background: color-mix(in srgb, var(--st-doing) 16%, transparent); }
.now-badge.k-should { color: var(--st-today); border: 1px dashed var(--st-should); }
.now .ticks { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.now .tick { border: 1px solid var(--border); background: var(--bg); border-radius: 8px; padding: 2px 9px; font-size: 13px;
  max-width: min(30em, 100%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.now .tick-par { color: var(--muted); font-size: 12px; }
.now .tick-rel { color: var(--st-late); font-size: 12px; }
.now-empty { font-size: 12.5px; color: var(--muted); padding: 4px 0 2px; }
@media (max-width: 760px) { .now-group { grid-template-columns: 1fr; gap: 4px; } }
/* 札から飛んだ行・カードを少しのあいだ光らせる（TB-NW4・ToolUI.flash） */
.flash { animation: tool-flash 1.3s ease-out; }
@keyframes tool-flash { from { background: color-mix(in srgb, var(--accent) 35%, transparent); } to { background: transparent; } }
@media (prefers-reduced-motion: reduce) { .flash { animation: none; outline: 2px solid var(--accent); } }
```

- [ ] **Step 5: `web/taskboard.html` から消す**
  - 23行目 `#task-table, #now { --st-late: … }` の1行
  - 46〜50行目（`/* 今年の年は薄く …` から `.due-rel.today {…}` まで）
  - `/* 「いま」（TB-NW1〜NW8）…` から `@media (prefers-reduced-motion: reduce) { #task-table tbody tr.flash {…} }` まで（今の 210〜241 行目あたり。`.popover:has(.row-menu)` から後は Task 4 で扱うので残す）
  - 消したあと `grep -n "st-late\|\.now\|\.tick\|flash\|\.yr\|due-rel" web/taskboard.html` で、`#task-table tr.s-late td.cell-st { box-shadow: … var(--st-late) }` のような**変数を使う側**だけが残っていることを確かめる

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run taskboard parts` → TB-LP10 が PASS
Run: `./test/run taskboard` → すべて pass（TB-V3〜V6・TB-SH・TB-NW1〜NW8 が見た目の回帰を見る）
Run: `./test/run` → すべて pass

- [ ] **Step 7: コミット**

```bash
git add lib/ui.css web/taskboard.html docs/specs/taskboard/parts.md test/taskboard/parts.js
git commit -m "lib: 状態の色・日付・「いま」・光らせるの CSS を Plan Tasks から lib/ui.css へ移す（見た目は変えない・TB-LP10）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 「いま」の描画と光らせるを `ToolUI` へ（nowStrip・flash）

**Files:**
- Modify: `lib/ui.js`（`global.ToolUI = {…}` の直前に足し、出力に追加。冒頭の「出力:」も）
- Modify: `web/taskboard/now.js`（分け方は残し、描くのを `ToolUI.nowStrip` に。`jumpToRow` のスクロールと光らせるを `ToolUI.flash` に）
- Modify: `docs/specs/taskboard/parts.md`（TB-LP7・LP8）
- Modify: `test/taskboard/parts.js`（TB-LP7・LP8）

**Interfaces:**
- Produces: `ToolUI.nowStrip(box: Element, spec): void` —
  `spec = { kinds: [{ id: string, label: string, count: boolean }], groups: { [id]: [{ parts: [{ text: string, cls?: string }], title?: string, onClick?: () => void }] }, folded: boolean, onFold: () => void, empty?: string }`。
  `box` の中身を作り直す。見出し `.now-head`（`.now-title`「いま」・`count:true` の種類だけ `.now-cnt`（`.now-dot.k-<id>`＋ラベル＋`<b>件数</b>`）・`button#now-fold.now-fold`「たたむ ▴」／「ひらく ▾」と `aria-expanded`）、
  `ul.now-list`（`folded` なら hidden）に中身のある種類だけ `li.now-group`（`.now-badge.k-<id>`「ラベル 件数」・`.ticks` に `button.tick`）。1つも無ければ `li.now-empty`。
  `parts` の `cls` があれば `<span class=cls>`、無ければ文字のまま
- Produces: `ToolUI.flash(el: Element): void` — 画面の中ほどへスクロール（動きを減らす設定なら瞬時）し、`.flash` を 1,300ms 付ける
- Consumes: Task 2 の CSS（`.now*`・`.flash`）

- [ ] **Step 1: spec に足す**

```markdown
| TB-LP7 | `ToolUI.nowStrip` に 遅れ（数を出す・札1）・今日まで（数を出す・札0）・開始日を過ぎた（数を出さない・札1）→ 札を押す・たたむを押す → たたんだ状態で → 札0 | 見出しは「いま」「遅れ 1」「今日まで 0」（点は `now-dot k-late`・`k-today`）。行は「遅れ 1」「開始日を過ぎた 1」だけ（今日までの行は出さない）。札の文字と title・押すと onClick・たたむで onFold が1回・「たたむ ▴」→「ひらく ▾」と一覧が隠れる。札0なら「急ぎのものはありません」で数は 0 |
| TB-LP8 | `ToolUI.flash` | すぐ `.flash` が付き、1.4秒後には外れている。`.flash` の動きは `tool-flash`、動きを減らす設定では `none` |
```

- [ ] **Step 2: テストを足す**（parts.js に）

```js
    /* ---------- TB-LP7: 「いま」を描く ---------- */
    const lp7 = await safe(() => {
      const box = document.createElement('section'); document.body.appendChild(box);
      let folds = 0; window.__lp7 = '';
      const spec = (folded, groups) => ({
        kinds: [{ id: 'late', label: '遅れ', count: true }, { id: 'today', label: '今日まで', count: true }, { id: 'should', label: '開始日を過ぎた', count: false }],
        groups: groups || { late: [{ parts: [{ text: '親 › ', cls: 'tick-par' }, { text: '子' }, { text: '（2日遅れ）', cls: 'tick-rel' }], title: '親 › 子', onClick: () => { window.__lp7 = 'clicked'; } }],
          today: [], should: [{ parts: [{ text: 'X' }], title: 'X' }] },
        folded, onFold: () => { folds++; }, empty: '急ぎのものはありません' });
      ToolUI.nowStrip(box, spec(false));
      const q = s => box.querySelector(s), qa = s => Array.from(box.querySelectorAll(s));
      const a = { title: q('.now-title').textContent, cnt: qa('.now-cnt').map(c => c.textContent.trim()), dots: qa('.now-dot').map(d => d.className),
        badges: qa('.now-badge').map(b => b.className + '|' + b.textContent), ticks: qa('.tick').map(t => t.textContent + '|' + t.title),
        par: qa('.tick .tick-par').length, fold: q('#now-fold').textContent, exp: q('#now-fold').getAttribute('aria-expanded'), hidden: q('.now-list').hidden };
      q('.tick').click(); a.clicked = window.__lp7;
      q('#now-fold').click(); a.folds = folds;
      ToolUI.nowStrip(box, spec(true));
      a.fold2 = q('#now-fold').textContent; a.hidden2 = q('.now-list').hidden;
      ToolUI.nowStrip(box, spec(false, { late: [], today: [], should: [] }));
      a.empty = (q('.now-empty') || {}).textContent; a.cnt0 = qa('.now-cnt').map(c => c.textContent.trim());
      box.remove();
      return a;
    });
    r.check('TB-LP7（ToolUI.nowStrip: 数は count の種類だけ・中身のある種類だけ行・札の文字と title・押す・たたむ・空）',
      lp7.title === 'いま' && eq(lp7.cnt, ['遅れ 1', '今日まで 0']) && eq(lp7.dots, ['now-dot k-late', 'now-dot k-today'])
      && eq(lp7.badges, ['now-badge k-late|遅れ 1', 'now-badge k-should|開始日を過ぎた 1'])
      && eq(lp7.ticks, ['親 › 子（2日遅れ）|親 › 子', 'X|X']) && lp7.par === 1 && lp7.fold === 'たたむ ▴' && lp7.exp === 'true' && lp7.hidden === false
      && lp7.clicked === 'clicked' && lp7.folds === 1 && lp7.fold2 === 'ひらく ▾' && lp7.hidden2 === true
      && lp7.empty === '急ぎのものはありません' && eq(lp7.cnt0, ['遅れ 0', '今日まで 0']), JSON.stringify(lp7));

    /* ---------- TB-LP8: 光らせる ---------- */
    const lp8 = await safe(async () => {
      const d = document.createElement('div'); d.textContent = 'x'; document.body.appendChild(d);
      ToolUI.flash(d);
      const on = d.classList.contains('flash');
      const anim = getComputedStyle(d).animationName;
      await new Promise(res => setTimeout(res, 1400));
      const off = !d.classList.contains('flash');
      d.remove();
      return { on, off, anim };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const lp8r = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'flash'; document.body.appendChild(d);
      const a = getComputedStyle(d).animationName; d.remove(); return a; });
    await page.emulateMedia({ reducedMotion: null });
    r.check('TB-LP8（ToolUI.flash: すぐ .flash・1.4秒後に外れる・動きは tool-flash・動きを減らす設定では none）',
      lp8.on === true && lp8.off === true && lp8.anim === 'tool-flash' && lp8r === 'none', JSON.stringify([lp8, lp8r]));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run taskboard parts`
Expected: TB-LP7・LP8 が FAIL（`ERR: ToolUI.nowStrip is not a function` など）

- [ ] **Step 4: `lib/ui.js` に足す** — `global.ToolUI = { … };` の直前に:

```js
  /* 「いま」の欄（2026-10-02 に Plan Tasks から移設 — TB-NW・TB-LP7）。何を入れるかは各ツールが決め、ここは描くだけ。
     spec = { kinds: [{ id, label, count }], groups: { [id]: [{ parts: [{ text, cls }], title, onClick }] }, folded, onFold, empty }
     count:true の種類だけ見出しに数を出す。中身の無い種類の行は出さない。見た目は lib/ui.css の .now 一式 */
  function nowStrip(box, spec) {
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    box.textContent = '';
    const head = mk('div', 'now-head');
    head.appendChild(mk('span', 'now-title', 'いま'));
    for (const k of spec.kinds) {
      if (!k.count) continue;
      const c = mk('span', 'now-cnt');
      c.append(mk('span', 'now-dot k-' + k.id), k.label + ' ', mk('b', '', String((spec.groups[k.id] || []).length)));
      head.appendChild(c);
    }
    const fold = mk('button', 'now-fold', spec.folded ? 'ひらく ▾' : 'たたむ ▴');
    fold.type = 'button';
    fold.id = 'now-fold';
    fold.setAttribute('aria-expanded', String(!spec.folded));
    fold.addEventListener('click', () => spec.onFold());
    head.appendChild(fold);
    const ul = mk('ul', 'now-list');
    ul.hidden = !!spec.folded;
    for (const k of spec.kinds) {
      const list = spec.groups[k.id] || [];
      if (!list.length) continue;
      const li = mk('li', 'now-group');
      const ticks = mk('div', 'ticks');
      for (const t of list) {
        const b = mk('button', 'tick');
        b.type = 'button';
        for (const p of t.parts) b.appendChild(p.cls ? mk('span', p.cls, p.text) : document.createTextNode(p.text));
        b.title = t.title || '';
        if (t.onClick) b.addEventListener('click', t.onClick);
        ticks.appendChild(b);
      }
      li.append(mk('span', 'now-badge k-' + k.id, k.label + ' ' + list.length), ticks);
      ul.appendChild(li);
    }
    if (!ul.childNodes.length) ul.appendChild(mk('li', 'now-empty', spec.empty || '急ぎのものはありません'));
    box.append(head, ul);
  }
  // 飛んだ先の行・カードを画面の中ほどへ寄せて少し光らせる（TB-NW4・TB-LP8）。動きを減らす設定ならスクロールは瞬時
  function flash(el) {
    const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1300);
  }
```

公開の行に `nowStrip, flash` を足し、冒頭の「出力:」にも ` nowStrip(box, spec), flash(el)` を足す。

- [ ] **Step 5: `web/taskboard/now.js` を差し替える**
  - `renderNow` の後半（`const head = document.createElement('div');` から `box.append(head, ul);` まで）を次に置き換える:

```js
  ToolUI.nowStrip(box, {
    kinds: NOW_KINDS.map(([id, label]) => ({ id, label, count: id !== 'should' })),   // 開始日を過ぎた は見出しに数を出さない（TB-NW1）
    groups: Object.fromEntries(NOW_KINDS.map(([id]) => [id, by[id].map(t => nowTick(t, id, today, byLine))])),
    folded: state.ui.nowFolded,
    onFold: () => { state.ui.nowFolded = !state.ui.nowFolded; persistUi(); render(); },
    empty: '急ぎのものはありません',
  });
```

  - 冒頭の `box.textContent = '';` は消す（`nowStrip` が作り直す）
  - `nowTick` を「ボタンを作る」から「札の中身を返す」に変える:

```js
// 札の中身: 「▶ 」（遅れ・今日までに入った着手中）＋「親の内容（10字まで）› 」＋内容＋「（N日遅れ）」。title は祖先から全文
function nowTick(t, kind, today, byLine) {
  const parts = [];
  if (t.status === ST_DOING && kind !== 'doing') parts.push({ text: '▶ ', cls: 'tick-par' });
  const parent = t.parentLine !== null ? byLine.get(t.parentLine) : null;
  if (parent) {
    const cs = Array.from(nowName(parent));   // 文字（コードポイント）で数える — 絵文字を途中で切らない
    parts.push({ text: (cs.length > 10 ? cs.slice(0, 10).join('') + '…' : cs.join('')) + ' › ', cls: 'tick-par' });
  }
  parts.push({ text: nowName(t) });
  if (kind === 'late') parts.push({ text: '（' + (-diffDays(today, t.due)) + '日遅れ）', cls: 'tick-rel' });
  const path = [];
  for (let p = t; p; p = p.parentLine !== null ? byLine.get(p.parentLine) : null) path.unshift(nowName(p));
  return { parts, title: path.join(' › '), onClick: () => jumpToRow(t) };
}
```

  - `jumpToRow` の最後の5行（`const reduce = …` から `setTimeout(…)` まで）を次の1行に:

```js
  ToolUI.flash(tr);
```

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run taskboard parts` → TB-LP7・LP8 が PASS
Run: `./test/run taskboard` → すべて pass（TB-NW1〜NW8 が「いま」の DOM と動きの回帰を見る）
Run: `./test/run` → すべて pass

- [ ] **Step 7: コミット**

```bash
git add lib/ui.js web/taskboard/now.js docs/specs/taskboard/parts.md test/taskboard/parts.js
git commit -m "lib: 「いま」の描画と光らせるを Plan Tasks から ToolUI.nowStrip / flash へ移す（何を入れるかは Plan Tasks に残す・TB-LP7・LP8）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 右クリックのメニューとキーを `ToolUI` へ（menu・menuKey・isTyping・keyHint・pointRect・placeAt）

**Files:**
- Modify: `lib/ui.js`
- Modify: `lib/ui.css`（`.row-menu*` を移す）
- Modify: `web/taskboard.html`（`.row-menu*` の規則を消す。`.popover:has(.row-menu)` は Plan Tasks の小窓の指定なので残す）
- Modify: `web/taskboard/list.js`（`openRowMenu`・`rowActionForKey`・`TYPING_SEL`・`rowKeyHint`・`pointAnchor`）
- Modify: `web/taskboard/modal.js`（`openPopover`）
- Modify: `docs/specs/taskboard/parts.md`（TB-LP3〜LP6・LP11、LP9 の対象を増やす）
- Modify: `test/taskboard/parts.js`

**Interfaces:**
- Produces: `ToolUI.menuKey(e: KeyboardEvent, actions: Action[]): Action | null` — Cmd・Ctrl・Alt つき・変換中は null。`Delete`／`Backspace` は `key: 'delete'`、英字は `e.code`（`KeyE` → `'e'`）で見る
- Produces: `ToolUI.isTyping(el: Element | null): boolean` — 文字を打つ部品（テキスト系の input・textarea・select・contenteditable）なら true。チェックボックス・ラジオ・ボタンは false
- Produces: `ToolUI.keyHint(action: Action): string` — `（キー C・右クリックでも）`
- Produces: `ToolUI.menu(actions: Action[], onPick: (a: Action) => void): HTMLElement` — `div.row-menu[role=menu]` に `button.row-menu-item[role=menuitem]`（`.rm-icon`・`.rm-label`・`kbd`）。↑↓ で項目を移り（端で回る）、開いた直後に最初の項目へフォーカス。押すと `onPick(a)`
- Produces: `ToolUI.pointRect(x, y)` → `{ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }`
- Produces: `ToolUI.placeAt(pop: HTMLElement, rect): void` — 表示中の `pop` を `rect` の下に置き、画面の右端では押し戻し、下端では上側へ（Plan Tasks の `openPopover` と同じ規則）
- `Action = { id, key, keyLabel, icon, label, ...ツールの持ち物（run など） }`

- [ ] **Step 1: spec に足す**（TB-LP9 の行の「Task 4 で…」を本文に含めたまま、次の行を足す）

```markdown
| TB-LP3 | `ToolUI.menuKey` に e／「い」（code KeyE）／Shift+E／Cmd+E／Ctrl+E／Alt+E／変換中の e／Delete／Backspace／x | edit／edit／edit／なし／なし／なし／なし／delete／delete／なし |
| TB-LP4 | `ToolUI.isTyping` に text・search・checkbox・radio・button の input／textarea／select／button／contenteditable／body／null | true・true・false・false・false／true／true／false／true／false／false |
| TB-LP5 | `ToolUI.menu`（＋子・編集・削除）→ ↑ → ↓ → 2つ目を押す | `div.row-menu[role=menu]`・項目は `row-menu-item` で「＋\|子タスクを追加\|C」「✎\|編集\|E」「🗑\|削除\|Delete」。開いた直後のフォーカスは1つ目・↑で最後へ回る・↓で1つ目へ・押すと onPick(編集) |
| TB-LP6 | `ToolUI.placeAt` で 200×150 の箱を (100,100)／右端の手前／下端の手前に | (100,104)／右端から 8px 内側に収まる／ポインタの上側へ（下端から 164px 上） |
| TB-LP11 | `lib/ui.css` と `web/taskboard.html` の中身 | ui.css に `.row-menu-item` がある。taskboard.html に `.row-menu-item` が無い（`.popover:has(.row-menu)` は残る） |
```

- [ ] **Step 2: テストを足す**（parts.js に）

```js
    /* ---------- TB-LP3〜LP6: メニューとキー ---------- */
    const ACTS = [{ id: 'child', key: 'c', keyLabel: 'C', icon: '＋', label: '子タスクを追加' },
      { id: 'edit', key: 'e', keyLabel: 'E', icon: '✎', label: '編集' }, { id: 'delete', key: 'delete', keyLabel: 'Delete', icon: '🗑', label: '削除' }];
    const lp3 = await safe((acts) => {
      const k = (o) => { const a = ToolUI.menuKey(new KeyboardEvent('keydown', o), acts); return a ? a.id : null; };
      return [k({ key: 'e', code: 'KeyE' }), k({ key: 'い', code: 'KeyE' }), k({ key: 'E', code: 'KeyE', shiftKey: true }),
        k({ key: 'e', code: 'KeyE', metaKey: true }), k({ key: 'e', code: 'KeyE', ctrlKey: true }), k({ key: 'e', code: 'KeyE', altKey: true }),
        k({ key: 'e', code: 'KeyE', isComposing: true }), k({ key: 'Delete', code: 'Delete' }), k({ key: 'Backspace', code: 'Backspace' }), k({ key: 'x', code: 'KeyX' })];
    }, ACTS);
    r.check('TB-LP3（ToolUI.menuKey: キーの位置で見る・日本語入力・大文字は効く／修飾キー・変換中は効かない／Delete と Backspace は削除）',
      eq(lp3, ['edit', 'edit', 'edit', null, null, null, null, 'delete', 'delete', null]), JSON.stringify(lp3));
    const lp4 = await safe(() => {
      const mk = (tag, type) => { const e = document.createElement(tag); if (type) e.type = type; return e; };
      const ce = document.createElement('div'); ce.contentEditable = 'true';
      return [mk('input', 'text'), mk('input', 'search'), mk('input', 'checkbox'), mk('input', 'radio'), mk('input', 'button'),
        mk('textarea'), mk('select'), mk('button'), ce, document.body, null].map(e => ToolUI.isTyping(e));
    });
    r.check('TB-LP4（ToolUI.isTyping: 文字を打つ部品だけ true）',
      eq(lp4, [true, true, false, false, false, true, true, false, true, false, false]), JSON.stringify(lp4));
    const lp5 = await safe(async (acts) => {
      const picked = [];
      const m = ToolUI.menu(acts, a => picked.push(a.id));
      document.body.appendChild(m);
      await new Promise(res => setTimeout(res, 20));
      const items = Array.from(m.querySelectorAll('[role=menuitem]'));
      const at = () => items.indexOf(document.activeElement);
      const key = k => m.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      const out = { role: m.getAttribute('role'), cls: m.className, itemCls: items.map(b => b.className),
        labels: items.map(b => b.querySelector('.rm-icon').textContent + '|' + b.querySelector('.rm-label').textContent + '|' + b.querySelector('kbd').textContent),
        first: at() };
      key('ArrowUp'); out.up = at();
      key('ArrowDown'); out.down = at();
      items[1].click(); out.picked = picked;
      m.remove();
      return out;
    }, ACTS);
    r.check('TB-LP5（ToolUI.menu: 役割と項目・開いた直後は1つ目・↑で最後へ回る・↓で1つ目・押すと onPick）',
      lp5.role === 'menu' && lp5.cls === 'row-menu' && eq(lp5.itemCls, ['row-menu-item', 'row-menu-item', 'row-menu-item'])
      && eq(lp5.labels, ['＋|子タスクを追加|C', '✎|編集|E', '🗑|削除|Delete']) && lp5.first === 0 && lp5.up === 2 && lp5.down === 0
      && eq(lp5.picked, ['edit']), JSON.stringify(lp5));
    const lp6 = await safe(() => {
      window.scrollTo(0, 0);
      const pop = document.createElement('div'); pop.style.position = 'absolute'; pop.style.width = '200px'; pop.style.height = '150px';
      document.body.appendChild(pop);
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const at = (x, y) => { ToolUI.placeAt(pop, ToolUI.pointRect(x, y)); const rc = pop.getBoundingClientRect(); return [Math.round(rc.left), Math.round(rc.top)]; };
      const out = { mid: at(100, 100), right: at(vw - 10, 100), bottom: at(100, vh - 10), vw, vh };
      pop.remove();
      return out;
    });
    r.check('TB-LP6（ToolUI.placeAt: ポインタの下・右端は内側へ押し戻す・下端はポインタの上側へ）',
      eq(lp6.mid, [100, 104]) && lp6.right[0] === lp6.vw - 208 && lp6.bottom[1] === lp6.vh - 10 - 154, JSON.stringify(lp6));
    /* ---------- TB-LP11: メニューの CSS の置き場所 ---------- */
    const css2 = fs.readFileSync(path.join(REPO, 'lib/ui.css'), 'utf8');
    const html2 = fs.readFileSync(path.join(REPO, 'web/taskboard.html'), 'utf8');
    r.check('TB-LP11（メニューの見た目は lib/ui.css に・Plan Tasks には小窓の余白の指定だけ）',
      css2.includes('.row-menu-item') && !html2.includes('.row-menu-item') && html2.includes('.popover:has(.row-menu)'),
      JSON.stringify([css2.includes('.row-menu-item'), html2.includes('.row-menu-item')]));
```

  TB-LP9 の名前の一覧に `'rowActionForKey', 'TYPING_SEL'` を足す:

```js
      ['fillDate', 'dueWords', 'WEEKDAYS', 'rowActionForKey', 'TYPING_SEL']);
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run taskboard parts`
Expected: TB-LP3〜LP6・LP11 が FAIL、TB-LP9 が FAIL（`["rowActionForKey","TYPING_SEL"]`）

- [ ] **Step 4: `lib/ui.js` に足す** — `global.ToolUI = { … };` の直前に:

```js
  /* 行の操作のメニューとキー（2026-10-02 に Plan Tasks から移設 — TB-RM・TB-LP3〜LP6）。
     actions = [{ id, key, keyLabel, icon, label, …ツールの持ち物 }]。key は KeyboardEvent.code の英字（a〜z — 日本語入力のままでも効く）か
     'delete'（Delete と mac の delete＝Backspace）。何をするか・どこに出すか（小窓）・どの行に効くかは各ツールが決める */
  const TYPING_SEL = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=""], [contenteditable="true"]';
  function isTyping(el) { return !!el && el.nodeType === 1 && el.matches(TYPING_SEL); }
  function menuKey(e, actions) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.keyCode === 229) return null;
    const k = (e.key === 'Delete' || e.key === 'Backspace') ? 'delete'
      : /^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : '';
    return actions.find(a => a.key === k) || null;
  }
  function keyHint(action) { return '（キー ' + action.keyLabel + '・右クリックでも）'; }
  function menu(actions, onPick) {
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const m = mk('div', 'row-menu');
    m.setAttribute('role', 'menu');
    for (const a of actions) {
      const b = mk('button', 'row-menu-item');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.append(mk('span', 'rm-icon', a.icon), mk('span', 'rm-label', a.label), mk('kbd', '', a.keyLabel));
      b.addEventListener('click', () => onPick(a));
      m.appendChild(b);
    }
    // ↑↓ で項目を移る（端で回る）。Enter はボタンの既定で押せる。Esc で閉じるのは小窓を持つ側の仕事
    m.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = Array.from(m.children), n = items.length, down = e.key === 'ArrowDown';
      const i = items.indexOf(document.activeElement);
      items[i < 0 ? (down ? 0 : n - 1) : (i + (down ? 1 : n - 1)) % n].focus();
    });
    setTimeout(() => { if (m.firstChild) m.firstChild.focus(); }, 0);
    return m;
  }
  function pointRect(x, y) { return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 }; }
  // 表示中の小窓を rect の下に置く。右端では押し戻し、下端では上側へ反転（呼ぶ側が先に hidden を外す）
  function placeAt(pop, r) {
    pop.style.left = '0px';   // 測る前に左上へ寄せてページを広げない
    pop.style.top = '0px';
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const sx = global.scrollX, sy = global.scrollY;
    let left = r.left + sx;
    if (left + pw > sx + vw - 8) left = sx + vw - pw - 8;
    if (left < sx + 8) left = sx + 8;
    let top = r.bottom + sy + 4;
    if (top + ph > sy + vh - 8) {
      const above = r.top + sy - ph - 4;
      top = above >= sy + 8 ? above : Math.max(sy + 8, sy + vh - ph - 8);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
```

公開の行に `isTyping, menuKey, keyHint, menu, pointRect, placeAt` を足し、冒頭の「出力:」にも足す。

- [ ] **Step 5: CSS を移す** — `web/taskboard.html` の 244〜252 行目（`.row-menu {…}` から `.row-menu-item kbd {…}` まで）を消し、`lib/ui.css` の末尾に足す。
  242 行目のコメントと 243 行目 `.popover:has(.row-menu) { padding: 4px; }` は taskboard.html に残す（Plan Tasks の小窓の余白の指定）

```css
/* ---------- 行の操作のメニュー（2026-10-02 に Plan Tasks から移設 — TB-RM・ToolUI.menu）----------
   項目は行の高さで狙いやすく、右にキーを出して使ううちに覚えられるように。置く小窓は各ツールが持つ */
.row-menu { display: flex; flex-direction: column; min-width: 13em; }
.row-menu-item { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; border-radius: 6px;
  background: transparent; padding: 7px 10px; }
.row-menu-item:hover, .row-menu-item:focus-visible { background: color-mix(in srgb, var(--accent) 16%, transparent); outline: none; }
.row-menu-item:focus { outline: none; background: color-mix(in srgb, var(--accent) 10%, transparent); }
.row-menu-item .rm-icon { width: 1.4em; text-align: center; }
.row-menu-item .rm-label { flex: 1; }
.row-menu-item kbd { font: 11px/1.5 ui-monospace, Menlo, monospace; color: var(--muted);
  border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; }
```

- [ ] **Step 6: Plan Tasks を差し替える**
  - `web/taskboard/list.js`:
    - `function rowKeyHint(id) {…}` を `function rowKeyHint(id) { return ToolUI.keyHint(ROW_ACTIONS.find(a => a.id === id)); }` に
    - `function pointAnchor(x, y) {…}` を `function pointAnchor(x, y) { return { getBoundingClientRect: () => ToolUI.pointRect(x, y) }; }` に
    - `openRowMenu` の `openPopover(at, (pop) => { … })` の中身を次に:

```js
  openPopover(at, (pop) => {
    const menu = ToolUI.menu(ROW_ACTIONS, (a) => runRowAction(a, t, at));
    // キーで選んだときにどの行のどこへ出すかを覚えておく（rowKeyTarget）
    menu.dataset.line = t.line;
    menu.dataset.x = x;
    menu.dataset.y = y;
    pop.appendChild(menu);
  });
```

    - `const TYPING_SEL = …;` と `function rowActionForKey(e) {…}` を消す
    - `rowKeyTarget` の `document.activeElement.matches(TYPING_SEL)` を `ToolUI.isTyping(document.activeElement)` に
    - キーの受け口 `const a = rowActionForKey(e);` を `const a = ToolUI.menuKey(e, ROW_ACTIONS);` に
  - `web/taskboard/modal.js` の `openPopover` を次に（コメントは残す）:

```js
function openPopover(anchor, build) {
  const pop = el('popover');
  pop.textContent = '';
  build(pop);
  pop.hidden = false;
  ToolUI.placeAt(pop, anchor.getBoundingClientRect());
}
```

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run taskboard parts` → TB-LP3〜LP6・LP9・LP11 が PASS
Run: `./test/run taskboard` → すべて pass（TB-RM1〜RM9 が本物のマウスとキーでメニューの回帰を見る。ポップオーバーを使う TB-D・X・W も）
Run: `./test/run` → すべて pass

- [ ] **Step 8: コミット**

```bash
git add lib/ui.js lib/ui.css web/taskboard.html web/taskboard/list.js web/taskboard/modal.js docs/specs/taskboard/parts.md test/taskboard/parts.js
git commit -m "lib: 右クリックのメニュー・キーの対応・文字を打っている最中の判定・小窓の置き場所の計算を Plan Tasks から ToolUI へ移す（項目と動きは Plan Tasks に残す・TB-LP3〜LP6・LP11）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 見出し2行の型を `lib/ui.css` へ（.app-head・.app-controls）

**Files:**
- Modify: `lib/ui.css`
- Modify: `web/taskboard.html`（`<header class="tb-head">` → `class="tb-head app-head"`、`<div class="tb-controls">` → `class="tb-controls app-controls"`。移した規則を消す）
- Modify: `docs/specs/taskboard/parts.md`（TB-LP12）
- Modify: `test/taskboard/parts.js`

**Interfaces:**
- Produces（CSS）: `.app-head`（1行目: ツール・題名・モード・状態・⋯）／`.app-controls`（2行目: 操作）と、その中の `.tool-header` `h1` `nav.modes` `.spacer` `.tabs` `.opts` の型。段2の Check Issue・段5の全ツールが使う

- [ ] **Step 1: spec に足す**

```markdown
| TB-LP12 | Plan Tasks の見出し・`lib/ui.css` の中身 | `.tb-head` に `app-head`、`.tb-controls` に `app-controls` が付き、算出の display は flex・1行目の列の間は 14px。ui.css に `.app-head {` と `.app-controls {` がある（表示の切替の `.tb-controls #view-tabs` は taskboard.html に残る — 後ろの `.viewbar .tabs` に負けないため） |
```

- [ ] **Step 2: テストを足す**

```js
    /* ---------- TB-LP12: 見出し2行の型 ---------- */
    const css3 = fs.readFileSync(path.join(REPO, 'lib/ui.css'), 'utf8');
    const html3 = fs.readFileSync(path.join(REPO, 'web/taskboard.html'), 'utf8');
    const lp12 = await page.evaluate(() => {
      const h = document.querySelector('.tb-head'), c = document.querySelector('.tb-controls');
      return { head: !!h && h.classList.contains('app-head'), ctl: !!c && c.classList.contains('app-controls'),
        disp: h ? getComputedStyle(h).display : '', gap: h ? getComputedStyle(h).columnGap : '', cdisp: c ? getComputedStyle(c).display : '' };
    });
    r.check('TB-LP12（見出し2行は lib/ui.css の .app-head・.app-controls・表示の切替の id の指定は Plan Tasks に残る）',
      lp12.head && lp12.ctl && lp12.disp === 'flex' && lp12.gap === '14px' && lp12.cdisp === 'flex'
      && css3.includes('.app-head {') && css3.includes('.app-controls {') && html3.includes('.tb-controls #view-tabs'), JSON.stringify(lp12));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run taskboard parts` → TB-LP12 が FAIL（`head: false`）

- [ ] **Step 4: `lib/ui.css` の末尾に足す**

```css
/* ---------- 見出し2行（2026-10-02 に Plan Tasks から移設 — TB-V6。段2で Check Issue・段5で全ツールへ）----------
   1行目 .app-head＝ツール・題名（説明は title）・モード・状態・⋯、2行目 .app-controls＝操作。中身が上に来る */
.app-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 0 0 8px; }
.app-head .tool-header { margin: 0; }
.app-head h1 { margin: 0; font-size: 20px; cursor: help; }
.app-head nav.modes { margin: 0; }
.app-head .spacer { flex: 1 1 auto; }
.app-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 4px 0 12px; }
.app-controls .tabs button { border: 0; border-radius: 0; padding: 4px 10px; font-size: 13px; }
.app-controls .tabs button + button { border-left: 1px solid var(--border); }
.app-controls .tabs button.active { background: var(--accent); color: var(--accent-text); box-shadow: none; }
.app-controls .opts { gap: 6px 10px; }
.app-controls .opts select { padding-left: 6px; padding-right: 4px; }
```

- [ ] **Step 5: Plan Tasks を差し替える** — `web/taskboard.html` で
  - `<header class="tb-head">` を `<header class="tb-head app-head">`、`<div class="tb-controls">` を `<div class="tb-controls app-controls">` にする
  - 次の規則を消す（lib に移したもの）: `.tb-head { display: flex …}`・`.tb-head .tool-header {…}`・`.tb-head h1 {…}`・`.tb-head nav.modes {…}`・`.tb-head .spacer {…}`・`.tb-controls { display: flex …}`・`.tb-controls .tabs button {…}`・`.tb-controls .tabs button + button {…}`・`.tb-controls .tabs button.active {…}`・`.tb-controls .opts {…}`・`.tb-controls .opts select {…}`
  - **残す**（Plan Tasks 固有）: `.tb-file .autosave-note`・`.tb-head .toolbar.tb-file {…}`・`.tb-controls > #viewbar, .tb-controls > #main-toolbar { display: contents; }`・その上のコメント2行と `.tb-controls #view-tabs {…}`（後ろの `.viewbar .tabs` に負けないための id の指定）・`#btn-add-form` `#btn-copy` `#f-q` の幅と `order` の指定

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run taskboard parts` → TB-LP12 が PASS
Run: `./test/run taskboard` → すべて pass（TB-V6 が「表示の切替から Excel用コピー・⋯ まで同じ段」「最初の中身の上端が 300px より上」を見る）
Run: `./test/run` → すべて pass

- [ ] **Step 7: 実データで目で確かめる**（1回だけ）— 作業用フォルダの `head.js`（実データの tasks.md で 1280px・暗い配色を撮る一時スクリプト）を流し、見出し2行の見た目が Task 1 の前と変わっていないことを画像で見比べる

- [ ] **Step 8: コミット**

```bash
git add lib/ui.css web/taskboard.html docs/specs/taskboard/parts.md test/taskboard/parts.js
git commit -m "lib: 見出し2行の型（.app-head・.app-controls）を Plan Tasks から lib/ui.css へ移す（表示の切替の id の指定は Plan Tasks に残す・TB-LP12）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 2本目のツールで読み込めることの確認と、決まりの文書

**Files:**
- Modify: `docs/specs/taskboard/parts.md`（TB-LP13）
- Modify: `test/taskboard/parts.js`（TB-LP13）
- Modify: `docs/coding-rules.md`（共通ライブラリの表・「見た目と操作の決まり」の節）
- Modify: `CLAUDE.md`（「**N チェックの検証機構が**」の数）

**Interfaces:**
- Consumes: Task 1〜5 のすべての部品

- [ ] **Step 1: spec に足す**

```markdown
| TB-LP13 | Check Issue のページ（issue.html）で部品を呼ぶ | `ToolEdit.fillDate`（今日 2026-10-01 に 2026-10-02）が `2026/10/2(金)`・`ToolUI.menuKey` が T を受ける・`--st-late` が空でない（読み込み順 ui.js → … → edit.js でも、読み込み時に互いを参照しない） |
```

- [ ] **Step 2: テストを足す**

```js
    /* ---------- TB-LP13: 2本目のツール（issue.html）でも部品が使える ---------- */
    const p2 = await context.newPage();
    await p2.goto(fileUrl('web/issue.html'));
    const lp13 = await p2.evaluate(() => {
      try {
        const s = document.createElement('span'); ToolEdit.fillDate(s, '2026-10-02', '2026-10-01');
        const a = ToolUI.menuKey(new KeyboardEvent('keydown', { key: 't', code: 'KeyT' }), [{ id: 'task', key: 't' }]);
        return { date: s.textContent, key: a ? a.id : null, st: getComputedStyle(document.documentElement).getPropertyValue('--st-late').trim() !== '' };
      } catch (e) { return { err: e.message }; }
    });
    await p2.close();
    r.check('TB-LP13（Check Issue のページでも日付・キー・状態の色の部品が使える）',
      lp13.date === '2026/10/2(金)' && lp13.key === 'task' && lp13.st === true, JSON.stringify(lp13));
```

- [ ] **Step 3: 通ることを確かめる**（Task 1〜5 が済んでいれば最初から通る。通らなければ読み込み順の問題）

Run: `./test/run taskboard parts` → TB-LP1〜LP13 がすべて PASS

- [ ] **Step 4: `docs/coding-rules.md` を直す**
  - 「共通ライブラリ」の表の `ui.js` の行の「使うもの」に `` / `nowStrip(box, spec)`・`flash(el)`（「いま」の欄と、飛んだ先を光らせる）/ `menu(actions, onPick)`・`menuKey(e, actions)`・`isTyping(el)`・`keyHint(a)`・`pointRect(x, y)`・`placeAt(pop, rect)`（行の操作のメニューとキー） `` を足し、「規約」に「**何を入れるか・どの操作を並べるかは各ツール**。部品は見た目と操作だけ（2026-10-02・段1）」を足す
  - `edit.js` の行の「使うもの」に `` / `fillDate(host, ymd, today)`・`dueWords(due, today)`（日付の表記 — 年＋月/日＋曜日・今年の年は薄く・N日遅れ） `` を足す
  - 「体験の標準」の節の後に、次の節を足す:

```markdown
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
```

- [ ] **Step 5: 全体を回して数を数える**

Run: `./test/run`
Expected: すべて pass。各ツールの「N pass / 0 fail」を足した数（段1の前は 945。段1で TB-LP1〜LP13 の13が増え、958 になるはず。違えば数え直して実数を使う）

- [ ] **Step 6: `CLAUDE.md` の数を直す** — 「**945チェックの検証機構が**」を Step 5 の実数にする

- [ ] **Step 7: コミット**

```bash
git add docs/specs/taskboard/parts.md test/taskboard/parts.js docs/coding-rules.md CLAUDE.md
git commit -m "docs: 共通部品の使い分けと「見た目と操作の決まり」（Plan Tasks で決めたこと・全ツールの改修でここを満たす）を coding-rules へ。Check Issue のページでも部品が使えることを確かめる（TB-LP13・958チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## 段2〜6

段1が済んだら、段ごとにこの形の計画を作る（設計書の 5 の表）。段2の計画は、段1でできた部品の名前と形（このファイルの各 Task の Interfaces）を前提に書く。
