# 段4 実装計画: タスクとのつながり・閉じどき

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan Tasks が tasks.md を読んだ・保存したときに「関連ノートごとのタスクの数・済みの数・最後に済んだ日」を写しとして書き、Check Issue がそれを読んでノートの見出しに「タスク N・済み M」、つながるタスクが全部済んだ開いているノートを **閉じどき** として「いま」・案件の見出し・論点の行に出す（自動では閉じない）。

**Architecture:** 数えるのと写しの読み書きは新しい `lib/tasklinks.js`（`window.ToolTaskLinks`。保存は `lib/storage.js` の封筒・キー `tools:tasklinks`）。Plan Tasks は `web/taskboard/io.js` の `loadText`（読み込み・外の変更の読み直し）と `doSave`（保存）の後で `publishTaskLinks()` を呼ぶ。Check Issue は新しい `web/issue/tasks.js` が写しを読み（描くたびに読み直す・別のタブで書き換わったら `storage` イベントで描き直す）、`list.js`・`now.js` は数か所でそれを呼ぶだけ。

**Tech Stack:** 素の JS（classic script・`file://`）、CSS、Playwright のハーネス（`./test/run taskboard links`・`./test/run issue tasks`）

**Spec:** [docs/audits/2026-10-02-issue-redesign.md](2026-10-02-issue-redesign.md)（3 画面の 2〜4・4 データ「タスクとのつながり」・6 ②「表示用の写し」「閉じどき」）。契約とテストケースは `docs/specs/taskboard/issue-link.md` に新しい節（TB-LN1〜LN5）、`docs/specs/issue.md` に新しい節（IS-TK1〜TK7）

## Global Constraints

- `file://` で動く。ES モジュール禁止。外部 CDN 禁止。描画は `textContent` / `createElement` のみ（`innerHTML` 禁止）
- **正本は tasks.md のまま**。写しは数え直せる表示用（localStorage `tools:tasklinks`）。必ず時刻（`at`）を持ち、Check Issue はそれを出す。**24時間より古い写しは使わない**（数も閉じどきも出さない）
- 済み = 完了 `[x]` と中止 `[-]`（Plan Tasks の `finished`）。最後に済んだ日 = つながるタスクの ✅ の日付の最大
- ノートとタスクの対応は、関連ノート `[[…]]` の名前（`|別名`・`#見出し`・フォルダ・`.md` を落とし NFC）＝ ノートのファイル名から `.md` を除いたもの（`it.name` — Check Issue の［タスクにする］が渡す名前と同じ）
- **閉じどき** = 開いているノート（frontmatter が closed でない）で、写しが新しく、つながるタスクが1つ以上あり全部済み、かつ開いているカードがある。**自動では閉じない**（「閉じますか？」と聞くだけ）
- **1つのノートは「いま」の1か所だけ**: 閉じどきのノートは 遅れ・今日まで・立て直す・論点がまだ無い に出さない（閉じどきが先）。閉じどきの論点の行は赤くしない（帯は閉じどきの色・締切の「N日遅れ」は灰色）
- デモ（［デモデータを表示］）は写しを書かない（実データの写しを上書きしない）
- 既存のチェックは変えずに通す（「いま」の見出しの数は、写しが新しいときだけ「閉じどき N」を足す — 写しの無い既存のテストの数は変わらない）
- 1ファイル 1,000 行を超えない（今: `web/taskboard/engine.js` 922 行 — **触らない**・`web/taskboard/io.js` 597・`web/issue/list.js` 863）
- 文字は `test/run` の許可範囲の中だけ（✓ U+2713 は範囲の中）
- コミットは1タスク1コミット。日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **関連ノートの書き方の揺れ**（`[[名前|別名]]`・`[[04_Issues/名前.md#見出し]]`・濁点が分かれた名前）: どれもノートのファイル名に当たる — TB-LN1・IS-TK6
2. **デモが実データの写しを上書きする**: ［デモデータを表示］のあとも写しは前のまま — TB-LN5
3. **写しが無い・古い**: 数も閉じどきも出さず、「Plan Tasks を開くと出ます」と言う（古い数で「閉じますか？」と聞かない）— IS-TK1・TK5
4. **別のタブで写しが書き換わったとき、一覧の中で書いている最中**: 描き直さない（打った文字を消さない）— IS-TK7
5. **閉じたノート・つながりの無いノート・中止だけで日付の無いタスク・論点の無いノート**: 閉じたノートとつながりの無いノートは閉じどきにならない／日付が無ければ日付を出さない／論点の無いノートは「ノートを閉じますか？」— IS-TK2〜TK4
6. **ノート名が `__proto__`**: 数える箱を `Object.create(null)` にして、`Object.prototype` を汚さない — TB-LN2

---

## ファイルの地図

| ファイル | 役目 | タスク |
|---|---|---|
| `lib/tasklinks.js`（新規） | `ToolTaskLinks = { NAME, MAX_AGE_MS, nameOf, count, write, read }` | 1 |
| `web/taskboard/io.js` | `loadText(text, adapter, opts)`（`opts.demo`）・`publishTaskLinks()`・`doSave` の後・`loadDemo` | 1 |
| `web/taskboard.html` | `<script src="../lib/tasklinks.js">` | 1 |
| `docs/specs/taskboard/issue-link.md`・`decisions.md` | TB-LN1〜LN5・TB-Q72 | 1 |
| `test/taskboard/links.js`（新規）・`test/taskboard.js` | 節 `links` | 1 |
| `web/issue/tasks.js`（新規） | `refreshTaskLinks`・`tasksOf`・`isRipe`・`noteTasksChip`・`renderLinksAt`・`ripeNotice`・`storage` で描き直す | 2・3 |
| `web/issue/list.js` | `renderCards` の頭で読み直す・見出しの数・`cardState` の閉じどき・案件の見出し・論点の行の下の「閉じますか？」・締切を赤くしない | 2・3 |
| `web/issue/now.js` | 「いま」に 閉じどき | 3 |
| `web/issue.html` | `#links-at`・`<script src>`・CSS | 2・3 |
| `lib/ui.css` | `--st-ripe`・`.now-dot.k-ripe`・`.now-badge.k-ripe` | 3 |
| `docs/specs/issue.md` | IS-TK1〜TK7・IS-Q26 | 2〜4 |
| `test/issue/tasks.js`（新規）・`test/issue.js` | 節 `tasks` | 2・3 |
| `docs/coding-rules.md`・`CLAUDE.md` | lib の表・保存の節・localStorage の行・チェック数 | 4 |

---

### Task 1: Plan Tasks が写しを書く（lib/tasklinks.js）

**Files:**
- Create: `lib/tasklinks.js`・`test/taskboard/links.js`
- Modify: `web/taskboard/io.js`・`web/taskboard.html`・`test/taskboard.js`（`SECTIONS` の最後に `'links'`）・`docs/specs/taskboard/issue-link.md`・`docs/specs/taskboard/decisions.md`

**Interfaces:**
- Produces: `ToolTaskLinks.nameOf(link: string): string`
- Produces: `ToolTaskLinks.count(tasks: Array<{links: string[], finished: boolean, doneDate: string|null}>): { [name]: { total: number, done: number, last: 'YYYY-MM-DD'|'' } }`（`Object.create(null)`）
- Produces: `ToolTaskLinks.write(tasks, file: string): boolean` — `ToolStorage.save('tasklinks', { at: Date.now(), file, notes: count(tasks) })`
- Produces: `ToolTaskLinks.read(now?: number): { at: number, file: string, notes: object, fresh: boolean } | null`
- Produces: `ToolTaskLinks.NAME === 'tasklinks'`・`ToolTaskLinks.MAX_AGE_MS === 86400000`

- [ ] **Step 1: spec を書く** — `docs/specs/taskboard/issue-link.md` の末尾に:

```markdown
## タスクとのつながりの写し（TB-LN1〜LN5 — 2026-10-05・段4・TB-Q72）

設計: `docs/audits/2026-10-02-issue-redesign.md`（4 データ「タスクとのつながり」）。計画: `docs/audits/2026-10-05-issue-redesign-plan-4.md`。
Check Issue だけでは閉じどきが分からなかった（先方に確認のタスクは 9/29 に済んでいるのに、論点は開いたまま「6日遅れ」）。

- tasks.md を**読み込んだとき**（開く・外の変更の読み直し）と**保存したとき**に、関連ノート `[[…]]` ごとに **タスクの数・済みの数・最後に済んだ日**を数え、
  `lib/tasklinks.js` の `ToolTaskLinks.write` で localStorage `tools:tasklinks`（lib/storage.js の封筒）に `{ at, file, notes }` を書く
- **正本は tasks.md のまま**。これは数え直せる表示用の写し。読む側（Check Issue）は時刻を出し、24時間より古ければ使わない
- 名前は `[[名前|別名]]`・`[[フォルダ/名前.md#見出し]]` → `名前`（NFC）。1つのタスクに同じ名前が2つあっても1つ。済み = 完了と中止。最後に済んだ日 = ✅ の日付の最大
- **デモは書かない**（実データの写しを上書きしない）

| ID | 操作 | 期待 |
|---|---|---|
| TB-LN1 | `nameOf` に `名前\|別名`・`04_Issues/名前.md#見出し`・濁点が分かれた「か＋U+3099」・空 | `名前`・`名前`・「が」・'' |
| TB-LN2 | `count` に 同じ名前が2つのタスク・未完・日付の無い中止・リンクの無いタスク・別の日の完了・`__proto__` | `{"a":{"total":3,"done":2,"last":"2026-09-29"},"b":{"total":1,"done":1,"last":""},"__proto__":{"total":1,"done":0,"last":""}}`。`({}).total` は undefined のまま |
| TB-LN3 | `[[2026-09-25_先方に確認]]` のタスク3つ（未完・完了 ✅ 2026-08-01・中止）を読み込む | 写しの `notes` が `{ total: 3, done: 2, last: '2026-08-01' }`・`file` は読み込んだファイルの名前・`at` は5秒以内 |
| TB-LN4 | 未完の1つを完了にして保存 | 写しが `{ total: 3, done: 3, last: <今日> }` に変わる |
| TB-LN5 | 写しを置いてから［デモデータを表示］ | 写しは前のまま |
```

  あわせて `docs/specs/taskboard/issue-link.md` の先頭の「**テスト ID**: TB-H2〜H4・N1〜N6」を「**テスト ID**: TB-H2〜H4・N1〜N8・LN1〜LN5」に

- [ ] **Step 2: テストを書く** — `test/taskboard/links.js` を作る

```js
'use strict';
/* test/taskboard/links.js — 節: タスクとのつながりの写し（段4 — lib/tasklinks.js と、Plan Tasks が書くところ）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js links）
   照合する ID: TB-LN1〜LN5。期待値の正本は docs/specs/taskboard/issue-link.md */
module.exports = {
  name: 'links',
  ids: 'TB-LN1〜LN5',
  async run(ctx) {
    const { page, r, eq, fileUrl, session, TODAY } = ctx;
    await page.goto(fileUrl('web/taskboard.html'));
    // 未実装でもハーネスを止めず fail として数える（RED を見るため）
    const safe = (fn, arg) => page.evaluate(([src, a]) => {
      try { return Promise.resolve((0, eval)('(' + src + ')')(a)).catch(e => 'ERR: ' + e.message); }
      catch (e) { return 'ERR: ' + e.message; }
    }, [fn.toString(), arg]);

    /* ---------- TB-LN1: 名前 ---------- */
    const ln1 = await safe(() => ['名前|別名', '04_Issues/名前.md#見出し', 'が', ''].map(ToolTaskLinks.nameOf));
    r.check('TB-LN1（nameOf: 別名・見出し・フォルダ・.md を落とす・NFC・空は空）', eq(ln1, ['名前', '名前', 'が', '']), JSON.stringify(ln1));

    /* ---------- TB-LN2: 数える ---------- */
    const ln2 = await safe(() => {
      const c = ToolTaskLinks.count([
        { links: ['a', 'a|別名'], finished: true, doneDate: '2026-09-29' },
        { links: ['a'], finished: false, doneDate: null },
        { links: ['b'], finished: true, doneDate: null },
        { links: [], finished: true, doneDate: '2026-09-30' },
        { links: ['a'], finished: true, doneDate: '2026-09-20' },
        { links: ['__proto__'], finished: false, doneDate: null },
      ]);
      return { json: JSON.stringify(c), polluted: ({}).total !== undefined };
    });
    r.check('TB-LN2（count: 同じ名前は1つ・済みは完了と中止・最後に済んだ日は最大・リンクの無いタスクは数えない・__proto__ でも汚さない）',
      typeof ln2 === 'object' && ln2.json === '{"a":{"total":3,"done":2,"last":"2026-09-29"},"b":{"total":1,"done":1,"last":""},"__proto__":{"total":1,"done":0,"last":""}}'
      && ln2.polluted === false, JSON.stringify(ln2));

    /* ---------- TB-LN3・LN4: 読み込んだとき・保存したときに書く ---------- */
    const TASKS = ['## 作業', '- [ ] 先方に確認する [[2026-09-25_先方に確認]] \u{1F4C5} 2026-09-30', '- [x] 手順を聞く [[2026-09-25_先方に確認]] ✅ 2026-08-01',
      '- [-] やめた [[2026-09-25_先方に確認]]', '- [ ] 関係ない', ''].join('\n');
    await session(TASKS);
    const copy = () => safe(() => { const d = ToolStorage.load('tasklinks'); return d ? { age: Date.now() - d.at, file: d.file, notes: d.notes } : null; });
    const ln3 = await copy();
    r.check('TB-LN3（読み込むと写しを書く: total 3・done 2・last 2026-08-01・file・5秒以内）',
      !!ln3 && typeof ln3 === 'object' && eq(ln3.notes, { '2026-09-25_先方に確認': { total: 3, done: 2, last: '2026-08-01' } })
      && ln3.file === '(メモリ)' && ln3.age >= 0 && ln3.age < 5000, JSON.stringify(ln3));
    await page.evaluate(async () => { window.__s.applyOps([{ type: 'complete', line: 2 }]); await window.__s.save(); });
    const ln4 = await copy();
    r.check('TB-LN4（完了にして保存すると写しが変わる: done 3・last 今日）',
      !!ln4 && typeof ln4 === 'object' && eq(ln4.notes, { '2026-09-25_先方に確認': { total: 3, done: 3, last: TODAY } }), JSON.stringify(ln4));

    /* ---------- TB-LN5: デモは書かない ---------- */
    const ln5 = await safe(() => {
      ToolStorage.save('tasklinks', { at: 1, file: 'sentinel', notes: {} });
      loadDemo();
      const d = ToolStorage.load('tasklinks');
      return d ? d.file : null;
    });
    r.check('TB-LN5（［デモデータを表示］は写しを書かない）', ln5 === 'sentinel', JSON.stringify(ln5));
  },
};
```

  （`ctx.TODAY` は fixtures の `'2026-08-04'`（`...FX` で ctx に入っている — 2026-10-05 に確かめた）。`session` は今日をそれに固定してから読み込む）

- [ ] **Step 3: 節を登録する** — `test/taskboard.js` の `const SECTIONS = [… 'parts']` を `[… 'parts', 'links']` に（最後 — LN5 がデモにして終わるので、後ろに節を置かない）

- [ ] **Step 4: 落ちることを確かめる**

Run: `./test/run taskboard links`
Expected: TB-LN1〜LN5 が FAIL（`ToolTaskLinks is not defined`・写しが null）。ハーネスは止まらない

- [ ] **Step 5: `lib/tasklinks.js` を作る**

```js
'use strict';
/* lib/tasklinks.js — タスクとイシューノートのつながり（表示用の写し — 2026-10-05・段4）
   目的: Check Issue がノートごとに「タスク N・済み M」と閉じどきを出す。数えるのは Plan Tasks（tasks.md を読んだ・保存したとき）
   入力: タスクの配列 [{ links: ['名前', …], finished: bool, doneDate: 'YYYY-MM-DD'|null }]（Plan Tasks の parseDoc の形）
   出力: window.ToolTaskLinks = { NAME, MAX_AGE_MS, nameOf(link), count(tasks), write(tasks, file), read(now) }
   例:   ToolTaskLinks.write(parseDoc(state.lines).tasks, 'tasks.md');                      // Plan Tasks
         const c = ToolTaskLinks.read(Date.now()); if (c && c.fresh) c.notes['2026-09-25_名前'];   // Check Issue

   規約（coding-rules「保存」が正本）:
   - **正本は tasks.md のまま**。これは数え直せる表示用の写し（localStorage `tools:tasklinks`・lib/storage.js の封筒）。
     file:// は全ローカルページで1オリジンなので、別のタブの Check Issue から読める（tools:config と同じ）
   - 必ず「いつ数えた時点か」（at）を持ち、読む側はそれを出す。MAX_AGE_MS より古ければ数を使わない（fresh: false）
   - 済み = 完了と中止（finished）。最後に済んだ日 = ✅ の日付の最大（中止には日付が無い） */
(function (global) {
  const NAME = 'tasklinks';
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;

  // [[名前|別名]]・[[名前#見出し]]・[[フォルダ/名前.md]] → 名前（Check Issue のノート名 = ファイル名から .md を除いたもの）
  function nameOf(link) {
    let s = String(link == null ? '' : link).normalize('NFC');
    s = s.split('|')[0].split('#')[0];
    s = s.slice(s.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    return s.trim();
  }

  function count(tasks) {
    const notes = Object.create(null);   // ノート名が __proto__ でも Object.prototype を汚さない
    for (const t of tasks || []) {
      const seen = new Set();
      for (const l of (t && t.links) || []) {
        const n = nameOf(l);
        if (!n || seen.has(n)) continue;   // 1つのタスクに同じノートが2つあっても1つ
        seen.add(n);
        const c = notes[n] || (notes[n] = { total: 0, done: 0, last: '' });
        c.total++;
        if (t.finished) {
          c.done++;
          if (t.doneDate && t.doneDate > c.last) c.last = t.doneDate;
        }
      }
    }
    return notes;
  }

  function write(tasks, file) {
    if (!global.ToolStorage) return false;
    return global.ToolStorage.save(NAME, { at: Date.now(), file: String(file || ''), notes: count(tasks) });
  }

  // 型ガード（手書きの残骸・別バージョンで壊れない）。無ければ null。fresh は MAX_AGE_MS 以内（時計のずれで未来でも新しい扱い）
  function read(now) {
    const d = global.ToolStorage ? global.ToolStorage.load(NAME) : null;
    if (!d || typeof d.at !== 'number' || !d.notes || typeof d.notes !== 'object') return null;
    const t = typeof now === 'number' ? now : Date.now();
    return { at: d.at, file: typeof d.file === 'string' ? d.file : '', notes: d.notes, fresh: t - d.at <= MAX_AGE_MS };
  }

  global.ToolTaskLinks = { NAME, MAX_AGE_MS, nameOf, count, write, read };
})(window);
```

- [ ] **Step 6: Plan Tasks から書く**
  - `web/taskboard.html` の `<script src="../lib/handoff.js"></script>` の次の行に `<script src="../lib/tasklinks.js"></script>`
  - `web/taskboard/io.js`:
    - `function loadText(text, adapter) {` を `function loadText(text, adapter, opts) {` に、その中の `state.demo = false;` を `state.demo = !!(opts && opts.demo);   // デモは写しを書かない（TB-LN5）` に
    - `loadText` の `updateFileBar();` の次の行（`applyPendingTask();` の前）に `publishTaskLinks();   // 読み込んだら数え直す（TB-LN3）`
    - `doSave` の成功の経路の `for (const l of state.lines) l.orig = l.raw;\n  render();` の次の行に `publishTaskLinks();   // 保存したら数え直す（TB-LN4）`
    - `loadDemo` の `loadText(text, makeMemoryAdapter(text));` を `loadText(text, makeMemoryAdapter(text), { demo: true });` に
    - `async function saveNow() {` の直前に:

```js
/* タスクとイシューノートのつながりの写し（lib/tasklinks.js・段4 — TB-LN3〜LN5）。正本は tasks.md のまま。
   読み込んだとき・保存したときに数え直す。デモは書かない（実データの写しを上書きしない） */
function publishTaskLinks() {
  if (!state.loaded || state.demo || !window.ToolTaskLinks) return;
  ToolTaskLinks.write(parseDoc(state.lines).tasks, state.adapter && state.adapter.name);
}
```

- [ ] **Step 7: 判断の記録** — `docs/specs/taskboard/decisions.md` の末尾に:

```markdown
- **TB-Q72**（2026-10-05）: tasks.md を読んだ・保存したときに、関連ノートごとの タスクの数・済みの数・最後に済んだ日 を localStorage `tools:tasklinks` に写す（`lib/tasklinks.js`）。
  Check Issue がノートの見出しの数と閉じどきに使う（docs/audits/2026-10-02-issue-redesign.md 段4）。
  **CLAUDE.md の「localStorage は UI 状態と設定のみ」との関係**: 正本は tasks.md のまま。これは数え直せる表示用の写しで、時刻を持ち、
  読む側は時刻を出し 24時間より古ければ使わない。sessionStorage（lib/handoff.js）にしないのは、Check Issue が別のタブで開いているのがふつうだから
  （sessionStorage はタブごと）。デモは書かない。済み = 完了と中止（中止は「もうやらない」と決めたので、論点を閉じるのを止めない）
```

- [ ] **Step 8: 通ることを確かめる**

Run: `./test/run taskboard links` → TB-LN1〜LN5 が PASS
Run: `./test/run taskboard` → すべて pass

- [ ] **Step 9: コミット**

```bash
git add lib/tasklinks.js web/taskboard/io.js web/taskboard.html test/taskboard/links.js test/taskboard.js docs/specs/taskboard/issue-link.md docs/specs/taskboard/decisions.md
git commit -m "taskboard: tasks.md を読んだ・保存したときに、関連ノートごとのタスクの数・済みの数・最後に済んだ日を写す（lib/tasklinks.js・正本は tasks.md・デモは書かない・TB-LN1〜LN5・TB-Q72）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Check Issue が写しを読む（見出しの時刻・ノートの「タスク N・済み M」・別のタブの書き換えで描き直す）

**Files:**
- Create: `web/issue/tasks.js`・`test/issue/tasks.js`
- Modify: `web/issue/list.js`（`renderCards` の頭と summary の後・`noteHeader`）・`web/issue.html`（`#links-at`・`<script src>` 2本・CSS）・`test/issue.js`（`SECTIONS` に `'tasks'`）・`docs/specs/issue.md`

**Interfaces:**
- Consumes: `ToolTaskLinks.read(now)`・`ToolTaskLinks.NAME`（Task 1）
- Produces（tasks.js）: `let taskLinks`・`refreshTaskLinks()`・`tasksOf(n): {total, done, last} | null`（写しが無い・古いと null・つながりが無いと total 0）・`noteTasksChip(n): HTMLElement|null`・`renderLinksAt()`・`shortDate(ymd): string`（`2026-09-29` → `9/29`）
- Produces（DOM）: `#links-at`（見出しの1行目・summary の後）・ノートの見出しの `.note-tasks`（`.all-done`）

- [ ] **Step 1: spec を書く** — `docs/specs/issue.md` の段3の節の表の最後の行（IS-DG12）の後、`## UI` の前に:

```markdown

## タスクとのつながり・閉じどき（段4 — IS-TK1〜TK7・2026-10-05・IS-Q26）

設計: `docs/audits/2026-10-02-issue-redesign.md`（3 画面の 2〜4・4 データ）。計画: `docs/audits/2026-10-05-issue-redesign-plan-4.md`。数えるのは Plan Tasks（TB-LN・TB-Q72）。

- **写し**（`lib/tasklinks.js` の `ToolTaskLinks.read`）を一覧を描くたびに読み直す。Plan Tasks が別のタブで書き換えたら（`storage` イベント）描き直す —
  ただし一覧の中で書いている最中（`#cards .ic-edit`）は描き直さない（打った文字を消さない。次に描くときに読み直す）
- 見出しの1行目（件数の後）に `#links-at`: 写しが新しければ「タスク 10/5 14:30 時点」、無ければ「タスクの数は Plan Tasks を開くと出ます」、
  24時間より古ければ「タスクの数は Plan Tasks を開くと出ます（前回 10/3 9:12）」。ノートが無いときは出さない
- ノートの見出しの右に `.note-tasks`「タスク 3・済み 2」、全部済みなら「全部済み ✓」（`.all-done`）。写しが無い・古い・つながりが無いノートには出さない
- **閉じどき** = 開いているノートで、写しが新しく、つながるタスクが1つ以上あり全部済み、かつ開いているカードがある。**自動では閉じない**
  - 「いま」の最後の行「閉じどき」に、札「ノート名（全部済み 9/29）」（日付が無ければ「（全部済み）」）。押すとノートのカードへ飛んで光る。見出しの数「閉じどき N」は写しが新しいときだけ
  - **1つのノートは1か所**: 閉じどきのノートは 遅れ・今日まで・立て直す・論点がまだ無い に出さない（閉じどきが先）。案件の見出しも同じ数え方で「閉じどき N」
  - 論点の行: 帯は閉じどきの色（`.s-ripe`）・締切を赤くしない（`.is-over` も `.due-rel.late` も付けない）。行の下に
    「✓ つながるタスクは全部済み（2026/9/29(火)）— 論点を閉じますか？［閉じる…］」（`.ic-ripe`）。論点の無いノートのカードは「ノートを閉じますか？」。［閉じる…］はいつもの閉じる画面

| ID | 操作 | 期待 |
|---|---|---|
| IS-TK1 | 写しが無い | `#links-at`「タスクの数は Plan Tasks を開くと出ます」・`.note-tasks` も `.ic-ripe` も無い・「いま」の見出しの数は 遅れ・今日まで・立て直す・論点なし の4つ・遅れの論点は遅れに出る |
| IS-TK2 | 新しい写し（a: 3/2・b: 2/2・c: 1/1・d（閉じたノート）: 1/1・e: 無し） | `#links-at`「タスク M/D HH:MM 時点」で件数と同じ帯（縦 14px 以内）・a の見出しに「タスク 3・済み 2」・b に「全部済み ✓」（`.all-done`）・e には無い |
| IS-TK3 | 同じ写しで「いま」と案件の見出し | 見出しの数に「閉じどき 2」・最後の行のバッジ「閉じどき 2」・札「済んだ方（全部済み 9/29）」「書き殴りだけ（全部済み）」・b の遅れの論点は遅れに出ない（e の遅れは出る）・c は論点がまだ無いに出ない・案件 ITK の見出しに「閉じどき 1」があり「遅れ」が無い |
| IS-TK4 | 同じ写しで b の論点の行と c のカード | b の行は `.s-ripe`・`.ic-due` に `.is-over` 無し・`.due-rel` に `.late` 無し・`.ic-ripe` が「✓ つながるタスクは全部済み（2026/9/29(火)）— 論点を閉じますか？閉じる…」・［閉じる…］で閉じる画面が乙の論点で開く／c のカードの `.ic-ripe` は「ノートを閉じますか？」・d（閉じたノート）は閉じどきにならない |
| IS-TK5 | 25時間前の写し | `#links-at` が「タスクの数は Plan Tasks を開くと出ます（前回 」で始まる・`.note-tasks` も `.ic-ripe` も無い・b の遅れの論点は遅れに出る |
| IS-TK6 | 写しを消して描いたあと、同じブラウザの別のタブで Plan Tasks が tasks.md（`[[b]]` の完了2つ — 1つは `[[b\|別名]]`・`[[a]]` の未完1つ）を読み込む | 再読込なしで b の見出しが「全部済み ✓」・a が「タスク 1・済み 0」・b の行に `.ic-ripe` |
| IS-TK7 | ［＋ 分かったこと］の欄に「書きかけ」と打った最中に、別のタブで Plan Tasks がもう一度読み込む | 欄は残り「書きかけ」のまま（描き直さない） |
```

- [ ] **Step 2: テストを書く** — `test/issue/tasks.js` を作る（IS-TK1・TK2・TK5・TK6・TK7。TK3・TK4 は Task 3 で足す）

```js
'use strict';
/* test/issue/tasks.js — 節: タスクとのつながり・閉じどき（段4）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js tasks）
   写しは lib/storage.js の封筒で localStorage に置く（ToolStorage.save('tasklinks', …)）。IS-TK6・TK7 は同じブラウザの別のタブで Plan Tasks を開いて書かせる。
   照合する ID: IS-TK1〜TK7。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'tasks',
  ids: 'IS-TK1〜TK7',
  async run(ctx) {
    const { page, r, eq, fileUrl } = ctx;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fileUrl('web/issue.html'));
    await page.waitForLoadState('load');
    const loadNotes = (files) => page.evaluate(async (fs) => {
      for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
      for (const k of Object.keys(fs)) window.__fsa.files[k] = fs[k];
      await window.issue.load();
    }, files);
    const setStatus = (v) => page.evaluate((x) => { const b = document.querySelector('#f-status [data-v="' + x + '"]'); if (b) b.click(); }, v);
    // 写しを置く（age はミリ秒前）・消す。置いたあとは描き直す（renderCards は描くたびに写しを読み直す）
    const setCopy = (notes, age) => page.evaluate(([n, a]) => { ToolStorage.save('tasklinks', { at: Date.now() - a, file: 'tasks.md', notes: n }); renderCards(); }, [notes, age || 0]);
    const clearCopy = () => page.evaluate(() => { localStorage.removeItem('tools:tasklinks'); renderCards(); });
    const past = await page.evaluate(() => ToolEdit.addDays(todayStr(), -3));
    const future = await page.evaluate(() => ToolEdit.addDays(todayStr(), 7));
    const note = (o) => ['---', 'status: ' + (o.status || 'open'), o.project ? 'project: ' + o.project : '', 'tags: [issue]', '---', '# ' + o.title, '',
      ...(o.lines ? ['## 論点', '', ...o.lines, ''] : []), '## 掘る', '', ...(o.dig || []), ''].filter((x, i) => i !== 2 || x).join('\n');
    const FILES = {
      'a.md': note({ title: '進んでいる方', lines: ['- [ ] 甲は A ではなく B ではないか \u{1F4C5} ' + future] }),
      'b.md': note({ title: '済んだ方', project: 'ITK', lines: ['- [ ] 乙は C ではなく D ではないか \u{1F4C5} ' + past] }),
      'c.md': note({ title: '書き殴りだけ', dig: ['- 調べたこと'] }),
      'd.md': note({ title: '閉じた方', status: 'closed', lines: ['- [ ] 丙は E ではなく F ではないか \u{1F4C5} ' + past] }),
      'e.md': note({ title: 'つながり無し', lines: ['- [ ] 丁は G ではなく H ではないか \u{1F4C5} ' + past] }),
    };
    const COPY = { a: { total: 3, done: 2, last: '2026-09-20' }, b: { total: 2, done: 2, last: '2026-09-29' }, c: { total: 1, done: 1, last: '' }, d: { total: 1, done: 1, last: '2026-09-29' } };
    // 見えているものをまとめて読む
    const look = () => page.evaluate(() => {
      const top = (e) => e ? Math.round(e.getBoundingClientRect().top) : null;
      const card = (t) => Array.from(document.querySelectorAll('.note-card')).find(s => (s.querySelector('.note-name') || {}).textContent === t);
      const chip = (t) => { const c = card(t); const e = c && c.querySelector('.note-tasks'); return e ? { text: e.textContent, all: e.classList.contains('all-done') } : null; };
      const now = document.getElementById('now');
      const la = document.getElementById('links-at');
      return {
        linksAt: la ? { text: la.textContent, hidden: la.hidden, band: Math.abs(top(la) - top(document.getElementById('summary'))) <= 14 } : null,
        chips: { a: chip('進んでいる方'), b: chip('済んだ方'), c: chip('書き殴りだけ'), e: chip('つながり無し') },
        ripe: document.querySelectorAll('#cards .ic-ripe').length,
        cnt: Array.from(now.querySelectorAll('.now-cnt')).map(c => c.textContent.trim()),
        groups: Array.from(now.querySelectorAll('.now-group')).map(g => ({ badge: (g.querySelector('.now-badge') || {}).textContent || '',
          ticks: Array.from(g.querySelectorAll('.tick')).map(t => t.textContent) })),
      };
    });
    const ticksOf = (lk, badgeStart) => ((lk.groups || []).find(g => g.badge.startsWith(badgeStart)) || { ticks: [] }).ticks;

    await setStatus('open');
    await page.evaluate(() => localStorage.removeItem('tools:tasklinks'));
    await loadNotes(FILES);

    /* ---------- IS-TK1: 写しが無い ---------- */
    const tk1 = await look();
    r.check('IS-TK1（写しが無い: 「Plan Tasks を開くと出ます」・数も閉じどきも出ない・いまの数は4つ・遅れはそのまま）',
      !!tk1.linksAt && tk1.linksAt.text === 'タスクの数は Plan Tasks を開くと出ます' && !tk1.chips.a && !tk1.chips.b && tk1.ripe === 0
      && eq(tk1.cnt.map(c => c.replace(/ \d+$/, '')), ['遅れ', '今日まで', '立て直す', '論点なし'])
      && ticksOf(tk1, '遅れ').some(t => t.includes('乙は')), JSON.stringify(tk1));

    /* ---------- IS-TK2: 新しい写し — 時刻とノートの数 ---------- */
    await setCopy(COPY, 0);
    const tk2 = await look();
    r.check('IS-TK2（新しい写し: 「タスク M/D HH:MM 時点」が件数と同じ帯・a は タスク 3・済み 2・b は 全部済み ✓・つながりの無い e には出ない）',
      !!tk2.linksAt && /^タスク \d{1,2}\/\d{1,2} \d{2}:\d{2} 時点$/.test(tk2.linksAt.text) && tk2.linksAt.band
      && eq(tk2.chips.a, { text: 'タスク 3・済み 2', all: false }) && eq(tk2.chips.b, { text: '全部済み ✓', all: true }) && tk2.chips.e === null,
      JSON.stringify({ linksAt: tk2.linksAt, chips: tk2.chips }));

    /* ---------- IS-TK5: 古い写し ---------- */
    await setCopy(COPY, 25 * 3600 * 1000);
    const tk5 = await look();
    r.check('IS-TK5（25時間前の写し: 「Plan Tasks を開くと出ます（前回 …）」・数も閉じどきも出ない・b の遅れは遅れに出る）',
      !!tk5.linksAt && tk5.linksAt.text.startsWith('タスクの数は Plan Tasks を開くと出ます（前回 ') && !tk5.chips.a && !tk5.chips.b && tk5.ripe === 0
      && ticksOf(tk5, '遅れ').some(t => t.includes('乙は')), JSON.stringify({ linksAt: tk5.linksAt, chips: tk5.chips, ripe: tk5.ripe }));

    /* ---------- IS-TK6: 別のタブで Plan Tasks が読み込むと、再読込なしで描き直す ---------- */
    await clearCopy();
    const TASKS = ['## 作業', '- [x] 乙を聞く [[b]] ✅ 2026-09-29', '- [x] 乙を確かめる [[b|別名]] ✅ 2026-09-28', '- [ ] 甲を調べる [[a]]', ''].join('\n');
    const tb = await page.context().newPage();
    await tb.goto(fileUrl('web/taskboard.html'));
    await tb.evaluate((t) => { window.taskboard.test.newSession(t); }, TASKS);
    await page.waitForTimeout(300);
    const tk6 = await look();
    r.check('IS-TK6（別のタブで Plan Tasks が読み込む → 再読込なしで b は 全部済み ✓・a は タスク 1・済み 0・b の行に「閉じますか？」）',
      eq(tk6.chips.b, { text: '全部済み ✓', all: true }) && eq(tk6.chips.a, { text: 'タスク 1・済み 0', all: false }) && tk6.ripe >= 1,
      JSON.stringify({ chips: tk6.chips, ripe: tk6.ripe }));

    /* ---------- IS-TK7: 書いている最中は描き直さない ---------- */
    await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === '甲は A ではなく B ではないか');
      const b = c && c.querySelector('.ic-add-kid'); if (b) b.click();
      const i = document.querySelector('.ic-edit .ic-kid-input'); if (i) i.value = '書きかけ';
    });
    await tb.evaluate((t) => { window.taskboard.test.newSession(t + '- [ ] 甲をもう1つ [[a]]\n'); }, TASKS);
    await page.waitForTimeout(300);
    const tk7 = await page.evaluate(() => { const i = document.querySelector('#cards .ic-edit .ic-kid-input'); return i ? i.value : null; });
    r.check('IS-TK7（書いている最中に別のタブで写しが変わっても描き直さない — 打った文字が残る）', tk7 === '書きかけ', JSON.stringify(tk7));
    await page.evaluate(() => { const no = Array.from(document.querySelectorAll('.ic-edit button')).find(b => b.textContent === 'やめる'); if (no) no.click(); });
    await tb.close();
  },
};
```

- [ ] **Step 3: 節を登録する** — `test/issue.js` の `const SECTIONS = ['pure', 'ui', 'cards', 'look', 'dig']` を `['pure', 'ui', 'cards', 'look', 'dig', 'tasks']` に

- [ ] **Step 4: 落ちることを確かめる**

Run: `./test/run issue tasks`
Expected: IS-TK1・TK2・TK5・TK6・TK7 が FAIL（`#links-at` が無い・`.note-tasks` が無い。TK7 は欄が描き直しで消えずに残るので PASS になりうる — 描き直す仕組みがまだ無いため。Task 2 の後に「写しが変わると描き直す」が入ってから、除外が効いていることを TK7 が守る）

- [ ] **Step 5: `web/issue/tasks.js` を作る**

```js
'use strict';
/* web/issue/tasks.js — タスクとのつながり・閉じどき（段4 — IS-TK1〜TK7・docs/audits/2026-10-02-issue-redesign.md）
   入口: web/issue.html（このファイルは単独では動かない）。読み込み時に実行する文は、写しが書き換わったときの描き直しの登録だけ。
   前提: lib/tasklinks.js（写しを読む — 数えるのは Plan Tasks・TB-LN）・lib/edit.js（fillDate）・list.js（notes・renderCards・openCloseModal・$id）・engine.js（todayStr）。
   正本は tasks.md。写しは「いつの時点か」を必ず出し、古ければ（24時間）数も閉じどきも出さない */

let taskLinks = null;   // 一覧を描くたびに読み直す（renderCards の頭）

function refreshTaskLinks() { taskLinks = window.ToolTaskLinks ? ToolTaskLinks.read(Date.now()) : null; }

// ノートにつながるタスクの数。写しが無い・古いときは null（数を出さない）。つながりが無ければ total 0
function tasksOf(n) {
  if (!taskLinks || !taskLinks.fresh || !n) return null;
  const c = Object.prototype.hasOwnProperty.call(taskLinks.notes, n.name) ? taskLinks.notes[n.name] : null;
  if (!c || typeof c.total !== 'number' || typeof c.done !== 'number') return { total: 0, done: 0, last: '' };
  return { total: c.total, done: c.done, last: typeof c.last === 'string' ? c.last : '' };
}

function shortDate(ymd) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? (+m[1]) + '/' + (+m[2]) : '';
}

// 見出しの右: 「タスク 3・済み 2」／全部済みなら「全部済み ✓」。写しが無い・古い・つながりが無いときは出さない
function noteTasksChip(n) {
  const t = tasksOf(n);
  if (!t || t.total === 0) return null;
  const s = document.createElement('span');
  const all = t.done === t.total;
  s.className = 'note-tasks' + (all ? ' all-done' : '');
  s.textContent = all ? '全部済み ✓' : 'タスク ' + t.total + '・済み ' + t.done;
  s.title = 'Plan Tasks のタスクのうち、このノートを関連ノートに持つもの（済み = 完了と中止）';
  return s;
}

// 見出しの1行目の「タスク 10/5 14:30 時点」。無い・古いときは Plan Tasks で開くと出ること
function renderLinksAt() {
  const el = $id('links-at');
  if (!el) return;
  el.hidden = notes.length === 0;
  if (!taskLinks) { el.textContent = 'タスクの数は Plan Tasks を開くと出ます'; el.title = ''; return; }
  const d = new Date(taskLinks.at);
  const at = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  el.textContent = taskLinks.fresh ? 'タスク ' + at + ' 時点' : 'タスクの数は Plan Tasks を開くと出ます（前回 ' + at + '）';
  el.title = 'タスクの数は Plan Tasks が ' + (taskLinks.file || 'tasks.md') + ' を読んだ・保存した時点（' + at + '）のもの。24時間より古いと出しません';
}

// Plan Tasks が別のタブで写しを書き換えたら描き直す（file:// は1オリジン — storage イベントが届く）。
// 一覧の中で書いている最中（.ic-edit）は描き直さない — 打った文字を消さない。次に描くときに読み直す（IS-TK7）
window.addEventListener('storage', function (e) {
  if (!window.ToolTaskLinks || e.key !== 'tools:' + ToolTaskLinks.NAME) return;
  if (document.querySelector('#cards .ic-edit')) return;
  renderCards();
});
```

- [ ] **Step 6: 一覧につなぐ**
  - `web/issue.html`: `<script src="../lib/handoff.js"></script>` の次に `<script src="../lib/tasklinks.js"></script>`、`<script src="issue/dig.js"></script>` の次に `<script src="issue/tasks.js"></script>`。
    `<span class="summary" id="summary"></span>` の次の行に `<span class="links-at" id="links-at" hidden></span>`
  - `web/issue/list.js` の `renderCards`: `host.textContent = '';` の次の行に `refreshTaskLinks();   // 写しは描くたびに読み直す（段4 — web/issue/tasks.js）`、`$id('summary').textContent = …;` の次の行に `renderLinksAt();`
  - `noteHeader`: `row.appendChild(t);`（ノート名の h3）の次の行に `const tk = noteTasksChip(n);   // タスク N・済み M（段4 — IS-TK2）\n  if (tk) row.appendChild(tk);`
  - `web/issue.html` の `</style>` の直前に:

```css
  /* タスクとのつながり（段4 — IS-TK2）。数はノート名の右・＋論点の左 */
  .app-head .links-at { font-size: 12px; color: var(--muted); }
  .note-card .note-tasks { margin-left: auto; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .note-card .note-tasks.all-done { color: var(--success); font-weight: 600; }
  .note-card .note-tasks + .note-add { margin-left: 0; }
```

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run issue tasks` → IS-TK1・TK2・TK5・TK6・TK7 が PASS
Run: `./test/run issue` → すべて pass（IS-LK1 の見出しの帯も）

- [ ] **Step 8: コミット**

```bash
git add web/issue/tasks.js web/issue/list.js web/issue.html test/issue/tasks.js test/issue.js docs/specs/issue.md
git commit -m "issue: Plan Tasks の写しを読み、ノートの見出しに「タスク N・済み M」（全部済みなら ✓）・見出しに何時の時点か・古い／無いときは出さない・別のタブで書き換わると描き直す（書いている最中は除く — IS-TK1・TK2・TK5〜TK7）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 閉じどき（いま・案件の見出し・論点の行）

**Files:**
- Modify: `web/issue/tasks.js`（`isRipe`・`ripeNotice`）・`web/issue/list.js`（`cardState`・`card`・`projHead`）・`web/issue/now.js`・`lib/ui.css`・`web/issue.html`（CSS）・`test/issue/tasks.js`

**Interfaces:**
- Consumes: `tasksOf(n)`・`shortDate(ymd)`（Task 2）・`openCloseModal(it)`（list.js）・`ToolEdit.fillDate`
- Produces: `isRipe(n): boolean`・`ripeNotice(it): HTMLElement`（`.ic-ripe` と `button.ic-ripe-close`）・`cardState(it)` が `'ripe'` を返す・`ISSUE_NOW_KINDS` の最後に `['ripe', '閉じどき', '閉じどき']`

- [ ] **Step 1: テストを足す** — `test/issue/tasks.js` の IS-TK5 の後（IS-TK6 の前）に:

```js
    /* ---------- IS-TK3: 閉じどき — いまと案件の見出し ---------- */
    await setCopy(COPY, 0);
    const tk3 = await look();
    const projMeta = await page.evaluate(() => Array.from(document.querySelectorAll('.proj-head')).map(h => ({ name: (h.querySelector('.proj-name') || {}).textContent, meta: (h.querySelector('.proj-meta') || {}).textContent })));
    const itk = projMeta.find(p => p.name === 'ITK') || { meta: '' };
    const ripeG = (tk3.groups || [])[(tk3.groups || []).length - 1] || { badge: '', ticks: [] };
    r.check('IS-TK3（いま: 閉じどき 2 が最後の行・札「済んだ方（全部済み 9/29）」「書き殴りだけ（全部済み）」・b は遅れに出ず e は出る・c は論点なしに出ない／案件 ITK は 閉じどき 1 で 遅れ 無し）',
      tk3.cnt.includes('閉じどき 2') && ripeG.badge === '閉じどき 2' && eq(ripeG.ticks.slice().sort(), ['書き殴りだけ（全部済み）', '済んだ方（全部済み 9/29）'].sort())
      && !ticksOf(tk3, '遅れ').some(t => t.includes('乙は')) && ticksOf(tk3, '遅れ').some(t => t.includes('丁は'))
      && !ticksOf(tk3, '論点がまだ無い').some(t => t.includes('書き殴りだけ'))
      && itk.meta.includes('閉じどき 1') && !itk.meta.includes('遅れ'), JSON.stringify({ cnt: tk3.cnt, groups: tk3.groups, itk }));

    /* ---------- IS-TK4: 閉じどき — 論点の行とカード ---------- */
    const tk4 = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === '乙は C ではなく D ではないか');
      const cardOfTitle = (t) => Array.from(document.querySelectorAll('.note-card')).find(s => (s.querySelector('.note-name') || {}).textContent === t);
      const c = cardOfTitle('書き殴りだけ'), d = cardOfTitle('閉じた方');
      return {
        ripeClass: !!row && row.classList.contains('s-ripe'), over: !!row && !!row.querySelector('.ic-due.is-over'), late: !!row && !!row.querySelector('.due-rel.late'),
        notice: row && row.querySelector('.ic-ripe') ? row.querySelector('.ic-ripe').textContent : '',
        cNotice: c && c.querySelector('.ic-ripe') ? c.querySelector('.ic-ripe').textContent : '',
        dRipe: !!(d && d.querySelector('.ic-ripe')),
      };
    });
    await page.evaluate(() => { const row = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === '乙は C ではなく D ではないか');
      const b = row && row.querySelector('.ic-ripe-close'); if (b) b.click(); });
    tk4.modal = await page.evaluate(() => ({ open: !document.getElementById('close-modal').hidden, target: document.getElementById('cm-target').textContent }));
    await page.evaluate(() => { if (!document.getElementById('close-modal').hidden) closeCloseModal(); });
    r.check('IS-TK4（閉じどきの行: 帯 s-ripe・締切を赤くしない・「✓ つながるタスクは全部済み（2026/9/29(火)）— 論点を閉じますか？閉じる…」・押すと閉じる画面／論点の無い c は「ノートを閉じますか？」・閉じたノートはならない）',
      tk4.ripeClass && !tk4.over && !tk4.late && tk4.notice === '✓ つながるタスクは全部済み（2026/9/29(火)）— 論点を閉じますか？閉じる…'
      && tk4.modal.open && tk4.modal.target.includes('乙は') && tk4.cNotice.includes('ノートを閉じますか？') && !tk4.dRipe, JSON.stringify(tk4));
```

  あわせて IS-TK1 の照合に「閉じどき が無い」を足さなくてよい（TK1 は数を4つと照合している）

- [ ] **Step 2: 落ちることを確かめる**

Run: `./test/run issue tasks` → IS-TK3・TK4 が FAIL（「閉じどき」の行が無い・`.s-ripe`・`.ic-ripe` が無い）

- [ ] **Step 3: `web/issue/tasks.js` に足す**（`renderLinksAt` の後）

```js
// 閉じどき = 開いているノートで、写しが新しく、つながるタスクが1つ以上あり全部済み、かつ開いているカードがある（段4 — IS-TK3）。自動では閉じない
function isRipe(n) {
  if (!n || (n.base && n.base.status === 'closed')) return false;
  const t = tasksOf(n);
  if (!t || t.total === 0 || t.done < t.total) return false;
  return n.cards.some(function (c) { return c.status !== 'closed'; });
}

// 閉じどきのカードの下: 「✓ つながるタスクは全部済み（2026/9/29(火)）— 論点を閉じますか？［閉じる…］」（IS-TK4）
function ripeNotice(it) {
  const t = tasksOf(it.note);
  const p = document.createElement('div');
  p.className = 'ic-ripe';
  p.appendChild(document.createTextNode('✓ つながるタスクは全部済み'));
  if (t && t.last) {
    const s = document.createElement('span');
    ToolEdit.fillDate(s, t.last, todayStr());
    p.append('（', s, '）');
  } else {
    p.appendChild(document.createTextNode(' '));   // 日付が無ければ「全部済み — ノートを…」（中止だけのとき）
  }
  p.appendChild(document.createTextNode('— ' + (it.kind === 'line' ? '論点' : 'ノート') + 'を閉じますか？'));
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ic-ripe-close';
  b.textContent = '閉じる…';
  b.title = '当たり／外れ／未決 を残して閉じる（自動では閉じません）';
  b.addEventListener('click', function () { openCloseModal(it); });
  p.appendChild(b);
  return p;
}
```

  （テストの期待「…全部済み（2026/9/29(火)）— 論点を閉じますか？閉じる…」は日付ありの形。c は日付が無いので「✓ つながるタスクは全部済み — ノートを閉じますか？閉じる…」）

- [ ] **Step 4: `web/issue/list.js` を書き換える**
  - `cardState`: `if (it.status === 'closed' || !it.issue) return '';` の次の行に `if (isRipe(it.note)) return 'ripe';   // 閉じどきが先（段4 — 遅れでも赤くしない・IS-TK4）`
  - `card`: `due.className = 'ic-due' + (!closed && d !== null && d < 0 ? ' is-over' : '');` を `due.className = 'ic-due' + (!closed && d !== null && d < 0 && st !== 'ripe' ? ' is-over' : '');` に、
    `rel.className = 'due-rel' + (d < 0 ? ' late' : d === 0 ? ' today' : '');` を `rel.className = 'due-rel' + (st === 'ripe' ? '' : d < 0 ? ' late' : d === 0 ? ' today' : '');` に
  - `card`: 分かったこと（`if (it.kind === 'line' && !closed) { … }`）の閉じかっこの次の行に `if (!closed && isRipe(it.note)) art.appendChild(ripeNotice(it));   // 閉じますか？（段4 — IS-TK4）`
  - `projHead`: `const cnt = { late: 0, today: 0, rethink: 0, noissue: 0 };` を `const cnt = { late: 0, today: 0, rethink: 0, noissue: 0, ripe: 0 };` に、
    `open.forEach(function (n) {` の次の行に `if (isRipe(n)) { cnt.ripe++; return; }   // 1つのノートは1か所 — 閉じどきが先（段4）`、
    `[['late', '遅れ'], ['today', '今日まで'], ['rethink', '立て直す'], ['noissue', '論点なし']]` を `[['late', '遅れ'], ['today', '今日まで'], ['rethink', '立て直す'], ['noissue', '論点なし'], ['ripe', '閉じどき']]` に
- [ ] **Step 5: `web/issue/now.js` を書き換える**
  - `ISSUE_NOW_KINDS` の最後に `, ['ripe', '閉じどき', '閉じどき']`
  - `renderIssueNow`: `const by = { late: [], today: [], rethink: [], noissue: [] };` を `const by = { late: [], today: [], rethink: [], noissue: [], ripe: [] };` に、
    `if (!matchesSearch(n) || …) return;` の次の行に `if (isRipe(n)) { by.ripe.push({ n: n }); return; }   // 1つのノートは1か所 — 閉じどきが先（段4 — IS-TK3）`、
    `kinds:` の `count: true` を `count: p[0] !== 'ripe' || !!(taskLinks && taskLinks.fresh)`（閉じどきの数は写しが新しいときだけ — 写しの無い既存の数は変わらない）に
  - `issueTick` の `if (!x.c) {` の直前に:

```js
  if (kind === 'ripe') {   // 閉じどき: 「ノート名（全部済み 9/29）」— 押すとノートのカードへ（段4 — IS-TK3）
    const t = tasksOf(x.n);
    return { parts: [{ text: x.n.title }, { text: '（全部済み' + (t && t.last ? ' ' + shortDate(t.last) : '') + '）', cls: 'tick-par' }],
      title: x.n.title + ' — つながるタスクは全部済み。論点を閉じますか？', onClick: function () { jumpToIssue(x.n, null); } };
  }
```

- [ ] **Step 6: CSS**
  - `lib/ui.css` の `:root { --st-late: …` の行の次に `:root { --st-ripe: var(--success); }   /* 閉じどき（段4 — Check Issue）。済んだ＝落ち着いた緑 */`、
    `.now-dot.k-noissue { … }` の次に `.now-dot.k-ripe { background: var(--st-ripe); }`、`.now-badge.k-noissue { … }` の次に `.now-badge.k-ripe { color: var(--st-ripe); background: color-mix(in srgb, var(--st-ripe) 16%, transparent); }`
  - `web/issue.html` の `</style>` の直前に:

```css
  /* 閉じどき（段4 — IS-TK3・TK4）。帯は落ち着いた緑・締切は赤くしない */
  .issue-card.s-ripe { box-shadow: inset 4px 0 0 var(--st-ripe); }
  .proj-meta .ps-ripe { color: var(--st-ripe); font-weight: 600; }
  .ic-ripe { margin: 2px 0 4px 2.2em; font-size: 12.5px; color: var(--success); display: flex; align-items: baseline; gap: 2px; flex-wrap: wrap; }
  .ic-ripe-close { margin-left: 8px; font-size: 12px; padding: 1px 8px; }
```

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run issue tasks` → IS-TK1〜TK7 が PASS
Run: `./test/run issue` → すべて pass
Run: `./test/run` → すべて pass

- [ ] **Step 8: 実データで目で確かめる**（1回だけ）— 作業用フォルダで、04_Issues の4ノートと tasks.md（**読むだけ・書かない**）を Plan Tasks のタブで読み込ませてから Check Issue を撮る。「先方に確認」が閉じどきに出るか（タスクが 9/29 に済んでいれば）を見る

- [ ] **Step 9: コミット**

```bash
git add web/issue/tasks.js web/issue/list.js web/issue/now.js lib/ui.css web/issue.html test/issue/tasks.js
git commit -m "issue: 閉じどき — つながるタスクが全部済んだ開いているノートを「いま」の最後の行・案件の見出しに出し、論点の行の下で「閉じますか？［閉じる…］」と聞く（自動では閉じない・閉じどきが先で遅れに出さない・赤くしない — IS-TK3・TK4）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 決定事項と規約

**Files:**
- Modify: `docs/specs/issue.md`（IS-Q26）・`docs/coding-rules.md`（lib の表・保存の節）・`CLAUDE.md`（lib の一覧・localStorage の行・チェック数）

- [ ] **Step 1: 決定事項** — `docs/specs/issue.md` の末尾に:

```markdown
- **IS-Q26**（2026-10-05）: 段4。Plan Tasks の写し（TB-Q72）を読み、ノートの見出しに「タスク N・済み M」、つながるタスクが全部済んだ開いているノートを**閉じどき**として
  「いま」の最後の行・案件の見出し・論点の行の下（「閉じますか？［閉じる…］」）に出す。**自動では閉じない**（タスクが済んでも答えが出たとは限らない）。
  1つのノートは「いま」の1か所 — 閉じどきが先で、遅れ・論点なしには出さない。閉じどきの論点は赤くしない。
  写しは時刻を出し、24時間より古ければ数も閉じどきも出さない（古い数で「閉じますか？」と聞かない）。別のタブで書き換わると描き直す（書いている最中は除く）
```

- [ ] **Step 2: 規約** — `docs/coding-rules.md`:
  - 「共通ライブラリ」の表の `handoff.js` の行の次に:

```markdown
| tasklinks.js | `ToolTaskLinks.nameOf(link)` / `count(tasks)` / `write(tasks, file)` / `read(now)` | タスクとイシューノートのつながりの**表示用の写し**（localStorage `tools:tasklinks`）。書くのは Plan Tasks（読み込み・保存のとき）、読むのは Check Issue。**正本は tasks.md**。時刻を持ち、読む側は時刻を出して 24時間より古ければ使わない（2026-10-05・段4 — TB-Q72） |
```

  - 「保存（localStorage）」の節の1つ目の箇条を次に置き換える:

```markdown
- **正本は vault 側**（永続データ）。localStorage は UI 状態・「その場の入力」・
  **環境依存の設定**（lib/config.js）の3種と、**数え直せる表示用の写し**（lib/tasklinks.js — 正本から数え直せて、時刻を持ち、古ければ使わないものだけ。2026-10-05）
```

- [ ] **Step 3: CLAUDE.md**
  - 「構成」の lib の行の `edit.js / handoff.js / tools.js（ツール登録簿の正本）/ launcher.js（引き出し式のツールメニュー）` を `edit.js / handoff.js / tasklinks.js（タスクとイシューのつながりの写し）/ tools.js（ツール登録簿の正本）/ launcher.js（引き出し式のツールメニュー）` に
  - 「ブラウザツールの制約」の `localStorage は UI 状態（オプション・タブ等）と環境依存の設定（`lib/config.js`）のみ` を `localStorage は UI 状態（オプション・タブ等）と環境依存の設定（`lib/config.js`）、それに数え直せる表示用の写し（`lib/tasklinks.js` — 時刻つき・古ければ使わない）のみ` に

- [ ] **Step 4: 全体を回して数を数える**

Run: `./test/run`
Expected: すべて pass。合計は 995 ＋ 12（TB-LN1〜LN5・IS-TK1〜TK7）＝ 1007 になるはず（違えば実数）

- [ ] **Step 5: `CLAUDE.md` の数を直す** — 「**995チェックの検証機構が**」を Step 4 の実数に

- [ ] **Step 6: コミット**

```bash
git add docs/specs/issue.md docs/coding-rules.md CLAUDE.md
git commit -m "docs: 段4（タスクとのつながり・閉じどき）の決定事項 IS-Q26・lib/tasklinks.js を規約の表と保存の節に・CLAUDE.md の localStorage の行（1007チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
