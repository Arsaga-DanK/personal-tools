# 段2 実装計画: Check Issue の見た目（見出し2行・表示の切替・検索・論点の行・案件の見出し・いま・右クリックとキー）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check Issue の一覧を、合意した画面イメージ（第2案）の形にする — 見出し2行・表示の切替のボタン・検索・論点の行の色の帯と日付と印と ⚠ の直し方・案件の見出し（数とたたむ）・「いま」・論点の行の右クリックとキー。

**Architecture:** 段1で `lib/` に移した部品（`ToolEdit.fillDate` / `dueWords`・`ToolUI.nowStrip` / `flash` / `menu` / `menuKey` / `isTyping` / `keyHint` / `pointRect` / `placeAt`・`.app-head` / `.app-controls`・`.now` 一式・`--st-*`）を Check Issue が使う。何を「いま」に入れるか・メニューに何を並べるかは Check Issue に書く。2本目の利用者になる ⋯ メニューの見た目と表示の切替の外枠は、ここで `lib/ui.css` へ移す。

**Tech Stack:** 素の JS（classic script・`file://`）、CSS、Playwright のハーネス（`./test/run issue`・`./test/run taskboard`）

**Spec:** [docs/audits/2026-10-02-issue-redesign.md](2026-10-02-issue-redesign.md)（段2・3 の画面・1 の決めたこと）と画面イメージ https://claude.ai/artifact/UbD3WDN4zYWBymqmmepSTo（第2案）。契約とテストケースは `docs/specs/issue.md` に新しく作る節（IS-LK1〜LK18）

**範囲の外（後の段）:** 分かったこと・待ち・［掘るを読む］（段3）／タスクとのつながり・閉じどき（段4）。この段では `.note-stats`（掘る N行・論点 M・画像 K）は今のまま残す

## Global Constraints

- `file://` で動く。ES モジュール禁止（共有は `<script src>`）。外部 CDN・実行時のネットワーク禁止
- 描画は `textContent` / `createElement` のみ（`innerHTML` 禁止）
- **見た目を意図して変える段**。変わる見た目を前提にした既存のテスト（IS-UL1・UL2・UL14・UL16・UL20・UL21・U25 と、表示の切替を `select` として操作している箇所）は、spec の行と一緒に直す。それ以外の既存のチェックは変えずに通す
- **Plan Tasks の見た目と動きは変えない**（⋯ メニューと表示の切替の外枠を `lib/` に移すときに触る）。`./test/run taskboard` が全部通り、実データの画面（作業用フォルダの `head.js`）が変更前とバイト単位で同じ
- 新しいチェックの ID は IS-LK1〜LK18（`docs/specs/issue.md`）。テストは新しい節 `test/issue/look.js`（`test/issue/ui.js` は 975 行で 1,000 行の手前のため）
- 文字は `test/run` の許可範囲の中だけ
- 1ファイル 1,000 行を超えない（今: `web/issue/list.js` 623 行・`web/issue.html` 302 行）。「いま」は新しいファイル `web/issue/now.js`
- 既存の決定を守る: **［＋ 新しく立てる］は主役の色にしない**（IS-U25・R10「主役はカード」— 画面イメージは主役の色だったが、既存の決定を優先）
- コミットは1タスク1コミット。日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- 作業の前に `git status`（別のセッションが同じリポジトリを触っていることがある）

## Review Focus

1. **表示が「閉じた」のときに「いま」の札を押す**: 飛び先のカードが表示されていない → 表示を「開いている」に切り替えてから飛ぶ（IS-LK12）
2. **検索中の「いま」**: 検索で絞った外のノートが札に出ると、押しても飛べない → 「いま」も検索に従う（IS-LK13）
3. **論点を書いている最中のキー**: 論点の欄（`.ic-edit`）で T・R・X を打つと操作が走る → 文字を打つ欄にいるときと、書いている最中はキーを奪わない（IS-LK17）
4. **閉じたノートの論点**: ノートが閉じていれば論点も閉じた扱い（IS-Q20）→ 色の帯・「いま」・メニュー（Obsidian で開く以外）に出さない（IS-LK6・LK10・LK15）
5. **Plan Tasks への副作用**: ⋯ メニューと表示の切替の外枠を `lib/` に移すと、Plan Tasks の見た目が変わりうる（詳細度の逆転 — 段1の点検の教訓）→ `./test/run taskboard` と実データの画面のバイト比較（Task 1）

---

## ファイルの地図

| ファイル | 役目 | タスク |
|---|---|---|
| `web/issue.html` | 見出し2行・表示の切替のボタン・検索・⋯・`#now`・`#row-pop`・行の色の帯と印の CSS | 1・2・3・4 |
| `web/issue/list.js` | 表示の切替・検索・使い方・論点の行（帯・日付・印・直し方）・案件の見出し・右クリックとキー | 1・2・4 |
| `web/issue/now.js`（新規） | 「いま」（分け方・札・飛ぶ） | 3 |
| `web/issue/ui.js` | 「いま」をたたんだかの保存（`savePayload` / `restore`） | 3 |
| `lib/ui.css` | ⋯ メニュー（`.more-menu` `.more-panel` `.more-row`）・表示の切替の外枠（`.app-controls .tabs`）・`--st-rethink` `--st-noissue`・`.now` の種類の色 | 1・2・3 |
| `web/taskboard.html` | 移した ⋯ メニューの CSS を消す・`#view-tabs` を flex だけに | 1 |
| `docs/specs/issue.md` | 段2の節（IS-LK1〜LK18）・直した既存の行・決定事項 IS-Q24 | 1〜5 |
| `test/issue/look.js`（新規） | 節 `look` | 1〜4 |
| `test/issue.js` | `SECTIONS` に `'look'` | 1 |
| `test/issue/ui.js`・`test/issue/cards.js` | 表示の切替をボタンで押す・変わった見た目の期待 | 1・2 |

---

### Task 1: 見出し2行・表示の切替のボタン・検索・使い方は ⋯ から

**Files:**
- Modify: `web/issue.html`（`<main>` の先頭から `<div id="cards">` の手前まで・CSS）
- Modify: `web/issue/list.js`（`$id('f-status').value` の3か所・`change` の受け口・`renderCards` の絞り込みと使い方）
- Modify: `lib/ui.css`（⋯ メニュー・`.app-controls .tabs` の外枠）
- Modify: `web/taskboard.html`（⋯ メニューの CSS を消す・`.tb-controls #view-tabs` を flex だけに）
- Modify: `docs/specs/issue.md`・Create: `test/issue/look.js`・Modify: `test/issue.js`・`test/issue/ui.js`・`test/issue/cards.js`

**Interfaces:**
- Produces: `statusFilter(): 'open'|'all'|'closed'`・`setStatusFilter(v): void`（押されたボタンを移して `renderCards()`）・`matchesSearch(n): boolean`（list.js のグローバル関数 — Task 3 の now.js が使う）
- Produces（HTML）: `#f-status`＝`div.tabs[role=group]` に `button[data-v=open|all|closed]`（押されているものは `.active` と `aria-pressed="true"`）・`#f-q`（検索）・`#issue-more`（⋯。中に `#cfg-vault`・`#reload-btn`・`#howto-btn`）
- Produces（CSS・lib）: `.more-menu` `.more-panel` `.more-row`・`.app-controls .tabs`（外枠）

- [ ] **Step 1: spec を書く** — `docs/specs/issue.md` の `## UI` の節の直前に、次の節を足す（以後のタスクもこの節に行を足す）

```markdown
## 見た目の作り直し（段2 — IS-LK1〜LK18・2026-10-02・IS-Q24）

設計: `docs/audits/2026-10-02-issue-redesign.md`（画面イメージ第2案）。計画: `docs/audits/2026-10-02-issue-redesign-plan-2.md`。
Plan Tasks で決めたこと（docs/coding-rules.md「見た目と操作の決まり」）を Check Issue に当てる。部品は段1で `lib/` に移したもの。

- **見出し2行**: 1行目 `.app-head`＝← ツール一覧・Check Issue（説明は h1 の title）・タスク／イシュー・［📂 04_Issues を開く］・件数（`#summary`）・⋯（`#issue-more`: vault 名・再読込・使い方）。
  2行目 `.app-controls`＝［＋ 新しく立てる］（主役の色にしない — IS-U25）・表示の切替（開いている／すべて／閉じた の横並びのボタン `#f-status`）・検索 `#f-q`
- **検索**: ノート名・本文（論点・掘るを含む）に含む語でノートを絞る（NFC・大文字小文字を区別しない・250ms 待ってから・変換中は走らせない）
- **使い方**（`#howto`）はノートが0のときだけ開いて見せる（IS-U25 のまま）。ノートがあれば隠し、⋯ の［使い方（3つだけ）］で開く

| ID | 操作 | 期待 |
|---|---|---|
| IS-LK1 | 1280px でノート3つを読み込む | `.subtitle` が無く h1 の title に説明。`#cfg-vault`・`#reload-btn` は `#issue-more` の中。1行目の［04_Issues を開く］・件数・⋯ が同じ段、2行目の［＋ 新しく立てる］・表示の切替・検索が同じ段。見出しの下の最初の中身（「いま」`#now`、無ければ最初のカード）の上端が 300px より上（Plan Tasks の TB-V6 と同じ測り方） |
| IS-LK2 | 表示の切替のボタンを 開いている→すべて→閉じた→開いている と押す | 押したものだけ `.active`・`aria-pressed="true"`、カードの数が 2・3・1・2 |
| IS-LK3 | 検索に「Y」→ 掘るの中の語 → 空に戻す（それぞれ 300ms 待つ） | 「急ぐ方」だけ → その語を掘るに持つノートだけ → 3つとも |
| IS-LK4 | ノートがあるとき／⋯ の［使い方（3つだけ）］を押す | `#howto` は隠れている／見えて開く |
| IS-LK5 | 表示の切替の見た目・Plan Tasks の CSS | `#f-status` の枠線が 1px・角丸 8px（lib の `.app-controls .tabs`）。lib/ui.css に `.more-menu` `.more-panel` がある。web/taskboard.html に `.more-panel {` が無く、`.tb-controls #view-tabs` は flex だけを書く |
```

- [ ] **Step 2: 既存の spec の行を直す** — `docs/specs/issue.md` の `## UI` の節の「ツールバー」の行を、次に置き換える

```markdown
- 見出しと操作は「見た目の作り直し（段2）」の節（IS-LK1〜LK5）。表示の切替は select ではなく横並びのボタン（`#f-status [data-v]`）
```

- [ ] **Step 3: テストを書く** — `test/issue/look.js` を作る

```js
'use strict';
/* test/issue/look.js — 節: 見た目の作り直し（段2 — 見出し2行・表示の切替・検索・論点の行・案件の見出し・いま・右クリックとキー）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js look）
   前の節はページを移したまま終わることがあるので、Check Issue を開き直してから始める（FSA のダミーは addInitScript なので残る）。
   日付は今日から何日前・何日後で作る（Check Issue には今日を固定するフックが無い）。
   照合する ID: IS-LK1〜LK18。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'look',
  ids: 'IS-LK1〜LK18',
  async run(ctx) {
    const { page, r, eq, fileUrl } = ctx;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fileUrl('web/issue.html'));
    await page.waitForLoadState('load');
    // ノートを入れ替えて読み込む（files は { 名前: 本文 }）
    const loadNotes = (files) => page.evaluate(async (fs) => {
      for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
      for (const k of Object.keys(fs)) window.__fsa.files[k] = fs[k];
      await window.issue.load();
    }, files);
    const note = (o) => ['---', 'status: ' + (o.status || 'open'), o.project ? 'project: ' + o.project : '', 'tags: [issue]', '---',
      '# ' + o.title, '', '## 論点', '', ...(o.lines || []), '', '## 掘る', '', ...(o.dig || []), ''].filter((x, i) => i !== 2 || x).join('\n');
    const setStatus = (v) => page.evaluate((x) => { const b = document.querySelector('#f-status [data-v="' + x + '"]'); if (b) b.click(); return !!b; }, v);
    const three = {
      'a.md': note({ title: '遅い方', lines: ['- [ ] Xは A ではなく B ではないか \u{1F4C5} 2026-12-31'] }),
      'b.md': note({ title: '急ぐ方', lines: ['- [ ] Yは C ではなく D ではないか \u{1F4C5} 2026-09-25'], dig: ['- 調べた語はペンギン'] }),
      'c.md': note({ title: '閉じた方', status: 'closed', lines: ['- [x] Zは E ではなく F ではないか \u{1F4C5} 2026-10-10 ✅ 2026-10-01 当たり'] }),
    };

    /* ---------- IS-LK1: 見出し2行 ---------- */
    await loadNotes(three);
    const lk1 = await page.evaluate(() => {
      const top = sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top) : null; };
      const band = sels => { const ts = sels.map(top); return ts.every(t => t !== null) && Math.max(...ts) - Math.min(...ts) <= 14; };
      const h1 = document.querySelector('main h1');
      return { noSub: !document.querySelector('main .subtitle'), h1Title: h1 ? h1.title : '',
        inMore: !!document.querySelector('#issue-more #cfg-vault') && !!document.querySelector('#issue-more #reload-btn'),
        row1: band(['#pick-btn', '#summary', '#issue-more > summary']), row2: band(['#wizard-btn', '#f-status', '#f-q']),
        // 見出しの下の最初の中身（「いま」があればそれ、無ければ最初のカード — Task 3 で「いま」が上に入る）
        cardTop: (() => { const n = document.getElementById('now'); return n && !n.hidden ? top('#now') : top('.note-card'); })() };
    });
    r.check('IS-LK1（見出し2行: 説明は h1 の title・vault 名と再読込は ⋯ の中・1行目と2行目がそれぞれ同じ段・見出しの下の最初の中身が 300px より上）',
      lk1.noSub && lk1.h1Title.includes('論点') && lk1.inMore && lk1.row1 && lk1.row2 && lk1.cardTop !== null && lk1.cardTop < 300,
      JSON.stringify(lk1));

    /* ---------- IS-LK2: 表示の切替のボタン ---------- */
    const lk2 = [];
    for (const v of ['open', 'all', 'closed', 'open']) {
      const ok = await setStatus(v);
      lk2.push(await page.evaluate((x) => ({ ok: true, act: Array.from(document.querySelectorAll('#f-status button.active')).map(b => b.dataset.v),
        pressed: Array.from(document.querySelectorAll('#f-status button[aria-pressed="true"]')).map(b => b.dataset.v),
        cards: document.querySelectorAll('.issue-card').length }), v).then(o => Object.assign(o, { ok })));
    }
    r.check('IS-LK2（表示の切替は横並びのボタン: 押したものだけ active・aria-pressed、カードは 2・3・1・2）',
      lk2.every((o, i) => o.ok && eq(o.act, [['open', 'all', 'closed', 'open'][i]]) && eq(o.pressed, o.act))
      && eq(lk2.map(o => o.cards), [2, 3, 1, 2]), JSON.stringify(lk2));

    /* ---------- IS-LK3: 検索 ---------- */
    const search = async (q) => {
      await page.evaluate((x) => { const f = document.getElementById('f-q'); f.value = x; f.dispatchEvent(new Event('input', { bubbles: true })); }, q);
      await page.waitForTimeout(300);
      return page.evaluate(() => Array.from(document.querySelectorAll('.note-card .note-name')).map(e => e.textContent));
    };
    const lk3 = { y: await search('Y'), dig: await search('ペンギン'), none: await search('') };
    r.check('IS-LK3（検索: ノート名・論点・掘るの語で絞る・空に戻すと全部）',
      eq(lk3.y, ['急ぐ方']) && eq(lk3.dig, ['急ぐ方']) && lk3.none.length === 2, JSON.stringify(lk3));

    /* ---------- IS-LK4: 使い方 ---------- */
    const lk4 = await page.evaluate(() => {
      const h = document.getElementById('howto');
      const before = { hidden: h.hidden };
      const more = document.getElementById('issue-more'); more.open = true;
      const b = document.getElementById('howto-btn'); if (b) b.click();
      return { before, after: { hidden: h.hidden, open: h.open }, moreClosed: !more.open, hasBtn: !!b };
    });
    r.check('IS-LK4（ノートがあれば使い方は隠れる・⋯ の［使い方］で見えて開く）',
      lk4.hasBtn && lk4.before.hidden === true && lk4.after.hidden === false && lk4.after.open === true && lk4.moreClosed, JSON.stringify(lk4));

    /* ---------- IS-LK5: 表示の切替の見た目と CSS の置き場所 ---------- */
    const fs = require('fs'), path = require('path');
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'lib/ui.css'), 'utf8');
    const tb = fs.readFileSync(path.join(__dirname, '..', '..', 'web/taskboard.html'), 'utf8');
    const lk5 = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('f-status'));
      return { bw: s.borderTopWidth, br: s.borderTopLeftRadius }; });
    const viewTabsRule = (tb.match(/\.tb-controls #view-tabs \{([^}]*)\}/) || [])[1] || '';
    r.check('IS-LK5（表示の切替の外枠は lib の .app-controls .tabs・⋯ メニューの見た目は lib・Plan Tasks の #view-tabs は flex だけ）',
      lk5.bw === '1px' && lk5.br === '8px' && css.includes('.more-menu') && css.includes('.more-panel') && !tb.includes('.more-panel {')
      && viewTabsRule.trim() === 'flex: 0 0 auto;', JSON.stringify([lk5, viewTabsRule.trim()]));
  },
};
```

- [ ] **Step 4: 節を登録し、表示の切替を使う既存のテストを直す**
  - `test/issue.js` の `const SECTIONS = ['pure', 'ui', 'cards']` を `['pure', 'ui', 'cards', 'look']` に
  - `test/issue/ui.js` と `test/issue/cards.js` の表示の切替の操作（`grep -n "f-status" test/issue/ui.js test/issue/cards.js` の10か所）を、次の形に置き換える。`f.value = v; f.dispatchEvent(...)` の組と、`document.getElementById('f-status').value = 'x';`（＋直後の `dispatchEvent`）が対象:

```js
document.querySelector('#f-status [data-v="' + v + '"]').click();   // v は 'open' / 'all' / 'closed'
```

  （`const f = document.getElementById('f-status');` の行は消す。ui.js の 111〜115 行目の `set` は `const set = v => { document.querySelector('#f-status [data-v="' + v + '"]').click(); return document.querySelectorAll('.issue-card').length; };` にする）

- [ ] **Step 5: 落ちることを確かめる**

Run: `./test/run issue look`
Expected: IS-LK1〜LK5 が FAIL（`#issue-more` が無い・`#f-status` がボタンでない・`#f-q` が無い・`#howto-btn` が無い・lib に `.more-menu` が無い）。ハーネスは止まらない

Run: `./test/run issue ui`
Expected: 表示の切替を押す箇所で FAIL（`#f-status [data-v]` が無い）

- [ ] **Step 6: `web/issue.html` を書き換える** — `<main class="app-wide">` の直後から `<p class="summary" id="env-note" hidden></p>` の手前まで（今の 151〜173 行目: `.tool-header`・`nav.modes`・`h1`・`p.subtitle`・`div.toolbar`）を次に置き換える

```html
  <!-- 見出し2行（段2・IS-LK1）。型は lib/ui.css の .app-head・.app-controls -->
  <header class="app-head">
    <p class="tool-header"><a href="../index.html">← ツール一覧</a><span class="autosave-note">入力は自動保存されます</span></p>
    <h1 title="論点（イシュー）を一覧して育てる — 書き殴りは Obsidian、1行足す・切り出す・閉じるはここ">Check Issue</h1>
    <nav class="modes" aria-label="モード">
      <a href="taskboard.html">✅ タスク</a>
      <a href="issue.html" aria-current="page">🎯 イシュー</a>
    </nav>
    <span class="spacer"></span>
    <button id="pick-btn">📂 04_Issues を開く</button>
    <span class="summary" id="summary"></span>
    <details class="more-menu" id="issue-more">
      <summary title="vault 名・再読込・使い方">⋯</summary>
      <div class="more-panel">
        <label class="more-row" title="Obsidian の vault 名。カードの［Obsidian で開く］に使います（空ならリンクを作りません）">
          vault 名 <input type="text" id="cfg-vault" size="10" placeholder="未設定">
        </label>
        <button id="reload-btn" hidden>再読込</button>
        <button id="howto-btn" type="button">使い方（3つだけ）</button>
      </div>
    </details>
  </header>
  <div class="app-controls">
    <button id="wizard-btn" title="論点が最初から見えているときだけ。ふだんは Obsidian で書き殴って、カードから足す">＋ 新しく立てる（5段）</button>
    <div class="tabs" id="f-status" role="group" aria-label="表示">
      <button type="button" data-v="open" class="active" aria-pressed="true">開いている</button>
      <button type="button" data-v="all" aria-pressed="false">すべて</button>
      <button type="button" data-v="closed" aria-pressed="false">閉じた</button>
    </div>
    <span class="spacer"></span>
    <input type="search" id="f-q" placeholder="🔍 検索（ノート名・論点・掘る）" aria-label="検索">
  </div>
```

  CSS（`</style>` の直前）に足す:

```css
  /* 見出し2行（段2）— Check Issue 固有の部分だけ（型は lib/ui.css） */
  .app-head .autosave-note { color: var(--muted); font-size: 12px; }
  .app-head .summary { margin: 0; font-size: 13px; }
  .app-controls #f-q { width: 14em; }
```

- [ ] **Step 7: `lib/ui.css` に移す・Plan Tasks を差し替える**
  - `web/taskboard.html` の `/* ⋯ メニュー: 低頻度の操作を畳む …` のコメントから `.more-panel .more-row {…}` の終わりまで（今の 250〜267 行目）を消し、同じ中身を `lib/ui.css` の末尾へ（値はそのまま・2スペースの字下げは外す）:

```css
/* ---------- ⋯ メニュー（2026-10-02 に Plan Tasks から移設 — 段2で Check Issue が2本目）----------
   低頻度の操作を畳む（常時11個は多すぎた — 2026-09-24 の利用者指摘） */
.more-menu { position: relative; }
.more-menu > summary {
  list-style: none; cursor: pointer; user-select: none;
  border: 1px solid var(--border); border-radius: 8px; background: var(--panel);
  padding: 4px 12px; font-size: 14px; line-height: 1.4; color: var(--muted);
}
.more-menu > summary::-webkit-details-marker { display: none; }
.more-menu > summary:hover { color: var(--accent); }
.more-menu[open] > summary { color: var(--accent); border-color: var(--accent); }
.more-panel {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 150;
  display: flex; flex-direction: column; align-items: stretch; gap: 6px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.24); padding: 10px; min-width: 200px;
}
.more-panel .more-row { display: flex; align-items: center; justify-content: space-between;
  gap: 8px; font-size: 13px; color: var(--muted); }
```

  - `lib/ui.css` の `.app-controls { … }` の行の直後に、表示の切替の外枠を足す（段1の点検の Minor 3）:

```css
/* 表示の切替（横並びのボタン）の外枠。ツール側で後ろから .xxx .tabs の flex を上書きするときは id で強める（Plan Tasks の #view-tabs） */
.app-controls .tabs { margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; gap: 0; flex: 0 0 auto; background: var(--panel); }
```

  - `web/taskboard.html` の `.tb-controls #view-tabs { margin: 0; border: … background: var(--panel); }` を `.tb-controls #view-tabs { flex: 0 0 auto; }` にする（上の2行のコメントは残す）

- [ ] **Step 8: `web/issue/list.js` を書き換える**
  - `function visibleCards(note) {` の直前に足す:

```js
/* ---------- 表示の切替・検索（段2 — IS-LK2・LK3） ----------
   表示の切替は select から横並びのボタンに（画面イメージ第2案）。検索はノート名・本文（論点・掘る）に含む語で絞る */
function statusFilter() {
  const b = document.querySelector('#f-status button.active');
  return b ? b.dataset.v : 'open';
}
function setStatusFilter(v) {
  for (const b of document.querySelectorAll('#f-status button[data-v]')) {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  }
  renderCards();
}
function searchQuery() { return nfc($id('f-q').value || '').trim().toLowerCase(); }
function matchesSearch(n) {
  const q = searchQuery();
  return !q || nfc(n.title + '\n' + n.text).toLowerCase().includes(q);
}
let howtoShown = false;   // ⋯ の［使い方］で開いたか（ノートがあるときは既定で隠す — IS-LK4）
```

  - `visibleCards` の `const f = $id('f-status').value;` を `const f = statusFilter();` に
  - `renderCards` の `const label = { … }[$id('f-status').value];` を `[statusFilter()]` に、`if ($id('f-status').value !== 'open') {` を `if (statusFilter() !== 'open') {` に
  - `renderCards` の `const groups = notes.map(…)` を `const groups = notes.filter(matchesSearch).map(…)` に
  - `if (notes.length === 0) $id('howto').open = true;   // 初見は使い方を開いておく（R10）` を次の2行に:

```js
  if (notes.length === 0) $id('howto').open = true;   // 初見は使い方を開いておく（R10）
  $id('howto').hidden = notes.length > 0 && !howtoShown;   // ノートがあれば ⋯ から開く（IS-LK4）
```

  - ファイル末尾の `$id('f-status').addEventListener('change', renderCards);` を次に置き換える:

```js
$id('f-status').addEventListener('click', function (e) {
  const b = e.target.closest('button[data-v]');
  if (b) setStatusFilter(b.dataset.v);
});
let qTimer = null;
const runSearch = function () { clearTimeout(qTimer); qTimer = setTimeout(renderCards, 250); };
$id('f-q').addEventListener('input', function (e) { if (e.isComposing) return; runSearch(); });   // 変換中は絞らない
$id('f-q').addEventListener('compositionend', runSearch);
$id('howto-btn').addEventListener('click', function () {
  howtoShown = true;
  $id('howto').hidden = false;
  $id('howto').open = true;
  $id('issue-more').open = false;
});
```

- [ ] **Step 9: 通ることを確かめる**

Run: `./test/run issue look` → IS-LK1〜LK5 が PASS
Run: `./test/run issue` → すべて pass（IS-U25「ノート0なら使い方が開く・新しく立てるは主役ではない」を含む）
Run: `./test/run taskboard` → すべて pass
Run: 作業用フォルダの `head.js`（実データの Plan Tasks を 1280px で撮る）→ 変更前の画像とバイト単位で同じ
Run: `./test/run` → すべて pass

- [ ] **Step 10: コミット**

```bash
git add web/issue.html web/issue/list.js lib/ui.css web/taskboard.html docs/specs/issue.md test/issue/look.js test/issue.js test/issue/ui.js test/issue/cards.js
git commit -m "issue: 見出し2行・表示の切替を横並びのボタンに・検索・使い方は ⋯ から（⋯ メニューと表示の切替の外枠を lib へ・Plan Tasks の見た目は変えない・IS-LK1〜LK5）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 論点の行の見た目（帯・日付・印・⚠ の直し方）と案件の見出し（数・たたむ）

**Files:**
- Modify: `web/issue/list.js`（`card`・`noteHeader`・`renderCards` の案件の見出し）
- Modify: `web/issue.html`（CSS）・`lib/ui.css`（`--st-rethink` `--st-noissue`）
- Modify: `docs/specs/issue.md`（IS-LK6〜LK9・IS-UL1・UL14・UL21 の行）・`test/issue/look.js`・`test/issue/ui.js`・`test/issue/cards.js`

**Interfaces:**
- Produces: `cardState(it): 'late'|'today'|'rethink'|''`（list.js のグローバル関数 — Task 3 が使う）。閉じた・論点が空 → ''。締切が今日より前 → late、今日 → today、それ以外で ⚠ がある → rethink
- Produces（DOM）: `article.issue-card` に `s-<state>` と `data-key`（`<ファイル名>` か `<ファイル名>:<行番号>`）、`section.note-card` に `data-file`（Task 3 の飛ぶ先）。`cardOf`（`WeakMap<article, it>` — Task 4 が使う）
- Produces（CSS・lib）: `--st-rethink`（ライト `#a8862a`・ダーク `#ebcb8b`）・`--st-noissue`（ライト `#8a93a6`・ダーク `#9aa5bc`）

- [ ] **Step 1: spec に足す**（段2の節の表に）

```markdown
| IS-LK6 | 締切が過ぎた／今日／⚠ だけ／どれでもない／閉じた の論点の行 | `.issue-card` に `s-late`／`s-today`／`s-rethink`／なし／なし。左端の帯の色は `--st-late`／`--st-today`／`--st-rethink` |
| IS-LK7 | 締切 2026-09-25 の開いた論点・締切なし・2026-09-22 に閉じた論点 | `.ic-due` が `2026/9/25(金)` で始まり（その span の title は `2026-09-25`）、`.due-rel.late` に「N日遅れ」／「締切なし」／「閉じた 2026/9/22(火)」で `is-over` も `.due-rel` も付かない |
| IS-LK8 | ノートの見出し・開いた論点・空の論点・閉じた論点・⚠ の論点 | 見出しに `.lab-do`「やること」。開いた論点にだけ `.lab-q`「問い」（空・閉じたには付けない）。⚠ の行の下の `.ic-why` の次に `.ic-fix`「→ 直すなら 」＋判定の直し方 |
| IS-LK9 | 案件 ITK（開いたノート2・閉じたノート1。開いた論点に 遅れ1・今日1・⚠1、論点の無いノート1）を読み込む → ▾ を押す → もう一度 | 見出しは `.proj-name`「ITK」・`.proj-meta` に「開いている 2・閉じた 1」と「遅れ 1」「今日まで 1」「立て直す 1」「論点なし 1」（数はノートの数・急ぎの数は開いたノートの論点で数える）。▾ で ITK のカードが消えて ▸、もう一度で戻る |
```

  そして既存の行を直す:
  - IS-UL1 の期待の「締切（`2026-09-25`）」の部分を「締切の span の title が `2026-09-25`（表示は `2026/9/25(金)` — 段2）」に
  - IS-UL14 の「超過を赤で出さない（`2026-09-22`）」を「閉じた日は `閉じた 2026/9/22(…)`（span の title が `2026-09-22`）で赤くしない」に
  - IS-UL21 の「見出しが UL（1）→ITK（1）→案件なし（1）」を「案件の見出しの `.proj-name` が UL→ITK→案件なし、`.proj-meta` がそれぞれ『開いている 1』で始まる（段2）」に

- [ ] **Step 2: テストを足す**（look.js の IS-LK5 の後に）

```js
    /* ---------- IS-LK6〜LK9: 論点の行と案件の見出し ---------- */
    await setStatus('open');
    await page.evaluate(() => { const f = document.getElementById('f-q'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(300);
    const day = (n) => page.evaluate((x) => ToolEdit.addDays(todayStr(), x), n);
    const [past, today, future] = [await day(-3), await day(0), await day(7)];
    await loadNotes({
      'p.md': note({ title: '急ぎのノート', project: 'ITK', lines: [
        '- [ ] 甲は A ではなく B ではないか \u{1F4C5} ' + past,
        '- [ ] 乙は C ではなく D ではないか \u{1F4C5} ' + today,
        '- [ ] 本番と通信できるのか。 \u{1F4C5} ' + future,
        '- [ ] 丙は E ではなく F ではないか \u{1F4C5} ' + future,
        '- [x] 丁は G ではなく H ではないか \u{1F4C5} 2026-09-20 ✅ 2026-09-22 当たり'] }),
      'q.md': note({ title: '論点のないノート', project: 'ITK', lines: [], dig: ['- 書き殴り'] }),
      'r.md': note({ title: '閉じたノート', project: 'ITK', status: 'closed', lines: ['- [ ] 戊は I ではなく J ではないか \u{1F4C5} ' + past] }),
    });
    await setStatus('all');
    const lk = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.issue-card'));
      const byText = t => cards.find(c => (c.querySelector('.ic-issue') || {}).textContent === t);
      const st = c => ['s-late', 's-today', 's-rethink'].filter(k => c.classList.contains(k)).join(',');
      const shadow = c => getComputedStyle(c).boxShadow;
      const probe = v => { const d = document.createElement('div'); d.style.color = 'var(' + v + ')'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const due = c => { const d = c.querySelector('.ic-due'); const sp = d && d.querySelector('span[title]');
        return { text: d ? d.textContent : '', title: sp ? sp.title : '', rel: (d && d.querySelector('.due-rel') || {}).textContent || '',
          late: !!(d && d.querySelector('.due-rel.late')), over: !!(d && d.classList.contains('is-over')) }; };
      const ko = byText('甲は A ではなく B ではないか'), ot = byText('乙は C ではなく D ではないか'), w = byText('本番と通信できるのか。'),
        pl = byText('丙は E ではなく F ではないか'), cl = byText('丁は G ではなく H ではないか'), empty = cards.find(c => c.querySelector('.ic-issue.is-empty'));
      return {
        st: [ko, ot, w, pl, cl].map(c => c ? st(c) : 'none'),
        shadowLate: ko ? shadow(ko) : '', lateColor: probe('--st-late'), rethinkColor: probe('--st-rethink'), shadowRethink: w ? shadow(w) : '',
        dueKo: ko ? due(ko) : null, dueCl: cl ? due(cl) : null,
        labDo: Array.from(document.querySelectorAll('.note-head .lab-do')).map(e => e.textContent),
        labQ: [ko, empty, cl].map(c => !!(c && c.querySelector('.lab-q'))),
        fix: w ? ((w.nextElementSibling && w.querySelector('.ic-fix')) || w.querySelector('.ic-fix') || {}).textContent || '' : '',
        proj: Array.from(document.querySelectorAll('.proj-head')).map(h => ({ name: (h.querySelector('.proj-name') || {}).textContent || '', meta: (h.querySelector('.proj-meta') || {}).textContent || '' })),
      };
    });
    r.check('IS-LK6（論点の行の状態の帯: 遅れ・今日・立て直す・なし・閉じたはなし）',
      eq(lk.st, ['s-late', 's-today', 's-rethink', '', '']) && lk.shadowLate.includes(lk.lateColor) && lk.shadowRethink.includes(lk.rethinkColor),
      JSON.stringify([lk.st, lk.shadowLate, lk.lateColor, lk.shadowRethink, lk.rethinkColor]));
    r.check('IS-LK7（締切は 2026/9/25(金) の形・title は ISO・遅れは「N日遅れ」・閉じたは「閉じた 2026/9/22(火)」で赤くしない）',
      !!lk.dueKo && lk.dueKo.title === past && /^\d+日遅れ$/.test(lk.dueKo.rel) && lk.dueKo.late
      && !!lk.dueCl && lk.dueCl.text.startsWith('閉じた ') && lk.dueCl.text.includes('9/22(火)') && lk.dueCl.title === '2026-09-22' && !lk.dueCl.over && lk.dueCl.rel === '',
      JSON.stringify([lk.dueKo, lk.dueCl]));
    r.check('IS-LK8（ノートの見出しに「やること」・開いた論点にだけ「問い」・⚠ の下に直し方）',
      lk.labDo.length === 3 && lk.labDo.every(t => t === 'やること') && eq(lk.labQ, [true, false, false])
      && lk.fix.startsWith('→ 直すなら ') && lk.fix.includes('ではないか'), JSON.stringify([lk.labDo, lk.labQ, lk.fix]));
    const fold = () => page.evaluate(() => { const h = document.querySelector('.proj-head'); const b = h && h.querySelector('.proj-fold'); if (b) b.click();
      const h2 = document.querySelector('.proj-head'); return { caret: ((h2 && h2.querySelector('.proj-fold')) || {}).textContent || '', cards: document.querySelectorAll('.note-card').length }; });
    const f1 = await fold(), f2 = await fold();
    r.check('IS-LK9（案件の見出し: 名前・開いている 3・閉じた 1・遅れ 1・立て直す 1・論点なし 1・▾ でたたむ／戻す）',
      lk.proj.length === 1 && lk.proj[0].name === 'ITK' && lk.proj[0].meta.includes('開いている 2・閉じた 1')
      && lk.proj[0].meta.includes('遅れ 1') && lk.proj[0].meta.includes('今日まで 1') && lk.proj[0].meta.includes('立て直す 1') && lk.proj[0].meta.includes('論点なし 1')
      && f1.caret === '▸' && f1.cards === 0 && f2.caret === '▾' && f2.cards === 3, JSON.stringify([lk.proj, f1, f2]));
```

  既存のテストを直す:
  - `test/issue/ui.js` の IS-UL1: `due0: cards[0].querySelector('.ic-due').textContent,` を `due0: ((cards[0].querySelector('.ic-due span[title]')) || {}).title || '',` に、期待の `ul1.due0.includes('2026-09-25')` を `ul1.due0 === '2026-09-25'` に
  - IS-UL14: `dueOS: os.querySelector('.ic-due').textContent,` を `dueOS: ((os.querySelector('.ic-due span[title]')) || {}).title || '',` に、期待の `ul14.dueOS.includes('2026-09-22')` を `ul14.dueOS === '2026-09-22'` に
  - `test/issue/cards.js` の IS-UL21: `const heads = Array.from(document.querySelectorAll('.proj-head')).map(e => e.textContent);` を `const heads = Array.from(document.querySelectorAll('.proj-head')).map(e => (e.querySelector('.proj-name') || {}).textContent + '|' + ((e.querySelector('.proj-meta') || {}).textContent || '').split(' ')[0]);` に、期待の `eq(ul21.heads, ['UL（1）', 'ITK（1）', '案件なし（1）'])` を `eq(ul21.heads, ['UL|開いている', 'ITK|開いている', '案件なし|開いている'])` に

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run issue look` → IS-LK6〜LK9 が FAIL（`s-*`・`.lab-*`・`.ic-fix`・`.proj-name` が無い）
Run: `./test/run issue ui` → IS-UL1・UL14 が FAIL（締切の span に title が無い）。`./test/run issue cards` → IS-UL21 が FAIL

- [ ] **Step 4: `lib/ui.css` に色を足す** — 先頭のライトの `:root { … }` の `--shadow-hover` の行の後に `  --st-rethink: #a8862a; --st-noissue: #8a93a6;   /* 段2: 立て直す・論点なし */`、ダークの `:root { … }` の `--shadow-hover` の行の後に `    --st-rethink: #ebcb8b; --st-noissue: #9aa5bc;` を足す。`.now-dot.k-doing {…}` の後に:

```css
.now-dot.k-rethink { background: var(--st-rethink); }
.now-dot.k-noissue { background: var(--st-noissue); }
```

  `.now-badge.k-should {…}` の後に:

```css
.now-badge.k-rethink { color: var(--st-rethink); background: color-mix(in srgb, var(--st-rethink) 16%, transparent); }
.now-badge.k-noissue { color: var(--st-noissue); border: 1px dashed var(--st-noissue); }
```

- [ ] **Step 5: `web/issue/list.js` を書き換える**
  - `function dayDiff(ymd) {` の直前に足す:

```js
// 論点の行の状態（段2 — IS-LK6）。行の色の帯と「いま」の分け方の正本。1つの行に1つだけ: 遅れ → 今日 → 立て直す（⚠）
function cardState(it) {
  if (it.status === 'closed' || !it.issue) return '';
  const d = dayDiff(it.deadline);
  if (d !== null && d < 0) return 'late';
  if (d === 0) return 'today';
  return it.warn > 0 ? 'rethink' : '';
}
const cardOf = new WeakMap();   // 論点の行の要素 → カード（右クリックとキー — Task 4）
let projFolded = new Set();     // たたんだ案件（画面を閉じるまで — IS-LK9）
```

  - `card(it)` の先頭3行（`const art = …` から `art.dataset.file = it.file;`）を次に:

```js
  const art = document.createElement('article');
  const st = cardState(it);
  art.className = 'issue-card' + (it.status === 'closed' ? ' is-closed' : '') + (st ? ' s-' + st : '');
  art.dataset.file = it.file;
  art.dataset.key = it.file + (it.kind === 'line' ? ':' + it.lineNo : '');
  cardOf.set(art, it);
```

  - 締切（`const due = document.createElement('span');` から `due.textContent = it.deadline ? … : '📅 締切なし'; }` まで）を次に置き換える:

```js
  const due = document.createElement('span');
  const d = dayDiff(it.deadline);
  const closed = it.status === 'closed';
  due.className = 'ic-due' + (!closed && d !== null && d < 0 ? ' is-over' : '');
  const dateSpan = (ymd) => { const s = document.createElement('span'); ToolEdit.fillDate(s, ymd, todayStr()); return s; };
  if (closed) {
    // 閉じたものに「遅れ」を出さない（もう追う締切ではない）。閉じた日を出す
    due.appendChild(document.createTextNode('閉じた' + (it.doneDate ? ' ' : '')));
    if (it.doneDate) due.appendChild(dateSpan(it.doneDate));
  } else if (it.deadline) {
    due.appendChild(dateSpan(it.deadline));
    const w = ToolEdit.dueWords(it.deadline, todayStr());
    if (w) {
      const rel = document.createElement('span');
      rel.className = 'due-rel' + (d < 0 ? ' late' : d === 0 ? ' today' : '');
      rel.textContent = w;
      due.appendChild(rel);
    }
  } else {
    due.textContent = '締切なし';
  }
```

  - `row.appendChild(q);` の直前に「問い」の印を足す:

```js
  if (it.issue && !closed) {
    const lab = document.createElement('span');
    lab.className = 'lab-q';
    lab.textContent = '問い';
    row.appendChild(lab);
  }
```

  - `why.textContent = '└ ' + firstWarn.msg;` と `art.appendChild(why);` の後に直し方を足す:

```js
    const fix = document.createElement('p');
    fix.className = 'ic-fix';
    fix.textContent = '→ 直すなら ' + firstWarn.fix;
    art.appendChild(fix);
```

  - `noteHeader` の `const t = document.createElement('h3');` の直前に:

```js
  const lab = document.createElement('span');
  lab.className = 'lab-do';
  lab.textContent = 'やること';   // ノート名は「やること」、論点は「問い」（IS-LK8）
  row.appendChild(lab);
```

  - `noteCard` の `sec.className = …;` の後に `sec.dataset.file = g.n.file;` を足す
  - `renderCards` の案件の見出し（`const ph = document.createElement('h2');` から `for (let j …) host.appendChild(noteCard(byProj[k][j]));` まで）を次に置き換える:

```js
    host.appendChild(projHead(k, byProj[k]));
    if (projFolded.has(k)) continue;
    for (let j = 0; j < byProj[k].length; j++) host.appendChild(noteCard(byProj[k][j]));
```

  そして `renderCards` の後に `projHead` を足す:

```js
// 案件の見出し（段2 — IS-LK9）: ▾ 名前・開いている N・閉じた M・急ぎの数（「いま」と同じ分け方）。たためる
function projHead(k, groupsInProj) {
  const all = notes.filter(function (n) { return (n.project || '') === k && matchesSearch(n); });
  const open = all.filter(function (n) { return !(n.base && n.base.status === 'closed'); });
  const cnt = { late: 0, today: 0, rethink: 0, noissue: 0 };
  open.forEach(function (n) {
    if (!n.cards.some(function (c) { return c.issue; })) { cnt.noissue++; return; }
    n.cards.forEach(function (c) { const s = cardState(c); if (s) cnt[s]++; });
  });
  const ph = document.createElement('h2');
  ph.className = 'proj-head';
  const fb = document.createElement('button');
  fb.type = 'button';
  fb.className = 'proj-fold';
  fb.textContent = projFolded.has(k) ? '▸' : '▾';
  fb.title = projFolded.has(k) ? 'この案件を開く' : 'この案件をたたむ';
  fb.addEventListener('click', function () { if (projFolded.has(k)) projFolded.delete(k); else projFolded.add(k); renderCards(); });
  const nm = document.createElement('span');
  nm.className = 'proj-name';
  nm.textContent = k || '案件なし';
  const meta = document.createElement('span');
  meta.className = 'proj-meta';
  meta.appendChild(document.createTextNode('開いている ' + open.length + '・閉じた ' + (all.length - open.length)));
  [['late', '遅れ'], ['today', '今日まで'], ['rethink', '立て直す'], ['noissue', '論点なし']].forEach(function (p) {
    if (!cnt[p[0]]) return;
    const s = document.createElement('span');
    s.className = 'ps-' + p[0];
    s.textContent = ' ' + p[1] + ' ' + cnt[p[0]];
    meta.appendChild(s);
  });
  ph.append(fb, nm, meta);
  return ph;
}
```

- [ ] **Step 6: CSS を足す**（`web/issue.html` の `</style>` の直前）

```css
  /* 論点の行（段2 — IS-LK6〜LK8）。状態は左端の帯1つだけ（赤だらけにしない） */
  .issue-card.s-late { box-shadow: inset 4px 0 0 var(--st-late); }
  .issue-card.s-today { box-shadow: inset 4px 0 0 var(--st-today); }
  .issue-card.s-rethink { box-shadow: inset 4px 0 0 var(--st-rethink); }
  .lab-do, .lab-q { font-size: 11px; font-weight: 700; letter-spacing: .04em; padding: 0 6px; border-radius: 5px; white-space: nowrap; }
  .lab-do { color: var(--muted); border: 1px solid var(--border); }
  .lab-q { color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); align-self: center; }
  .ic-fix { margin: 0 0 4px 2.2em; font-size: 12px; color: var(--muted); }
  .ic-due .due-rel { display: inline; margin-left: 6px; }
  /* 案件の見出し（IS-LK9） */
  .proj-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .proj-fold { border: 0; background: none; padding: 0 2px; color: var(--muted); cursor: pointer; font-size: 12px; box-shadow: none; }
  .proj-meta { font-size: 12.5px; font-weight: 400; color: var(--muted); }
  .proj-meta .ps-late { color: var(--st-late); font-weight: 600; }
  .proj-meta .ps-today { color: var(--st-today); font-weight: 600; }
  .proj-meta .ps-rethink { color: var(--st-rethink); font-weight: 600; }
  .proj-meta .ps-noissue { color: var(--st-noissue); font-weight: 600; }
```

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run issue look` → IS-LK1〜LK9 が PASS
Run: `./test/run issue` → すべて pass
Run: `./test/run` → すべて pass

- [ ] **Step 8: 実データで目で確かめる**（1回だけ）— 作業用フォルダの `issue-now.js`（実データの 04_Issues を 1280px で撮る一時スクリプト）を流し、帯・日付・印・直し方・案件の見出しが画面イメージ第2案の形になっていることを見る

- [ ] **Step 9: コミット**

```bash
git add web/issue/list.js web/issue.html lib/ui.css docs/specs/issue.md test/issue/look.js test/issue/ui.js test/issue/cards.js
git commit -m "issue: 論点の行に状態の帯（遅れ・今日・立て直す）・日付は 2026/9/25(金)＋N日遅れ・「やること」「問い」の印・⚠ の直し方、案件の見出しに数と急ぎの数・たたむ（IS-LK6〜LK9・UL1/UL14/UL21 改訂）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 「いま」（web/issue/now.js）

**Files:**
- Create: `web/issue/now.js`
- Modify: `web/issue.html`（`#now` と `<script src="issue/now.js">`）・`web/issue/list.js`（`renderCards` の最後で `renderIssueNow()`）・`web/issue/ui.js`（`savePayload` / `restore` に `nowFolded`）・`lib/ui.css`（`.tick-warn`）
- Modify: `lib/ui.js`（`ToolUI.nowStrip` の種類に、見出しの数に使う短いラベル `head` を足す — 無ければ `label`。TB-LP7 はそのまま通る）
- Modify: `docs/specs/issue.md`（IS-LK10〜LK14）・`test/issue/look.js`

**Interfaces:**
- Consumes: `notes`・`matchesSearch(n)`・`statusFilter()`・`setStatusFilter(v)`・`cardState(it)`・`projFolded`（list.js）・`noteStats(text)`（engine.js）・`ToolUI.nowStrip` / `flash`
- Produces: `renderIssueNow(): void`・`let nowFolded: boolean`（ui.js の `savePayload` / `restore` が読み書き）
- Changes（lib）: `ToolUI.nowStrip` の `kinds` の要素が `{ id, label, head?, count }` になる（`head` は見出しの数に使うラベル。無ければ `label`）

- [ ] **Step 1: spec に足す**

```markdown
- **いま**（`#now`・IS-LK10〜LK14）: 一覧の上に、開いているノートの **遅れ・今日まで・立て直す（⚠）・論点がまだ無い** を種類ごとに1行。見出しに4つの数。
  1つの論点は1か所だけ（遅れ・今日までの論点に ⚠ があれば札に ⚠ の印 — 立て直すには出さない）。遅れは期限の古い順、ほかはノートの並び。
  札は「ノート名（12字）› 論点（N日遅れ）」、論点がまだ無いノートは「ノート名（掘る N行）」。検索に従う。閉じたノートは出さない。
  札を押すと、表示が「閉じた」なら「開いている」に切り替え、たたんだ案件を開いて、そのカードへ飛んで光らせる。たたんだかどうかは覚える

| ID | 操作 | 期待 |
|---|---|---|
| IS-LK10 | 遅れ2（1つは ⚠）・今日1・⚠ だけ1・論点なし1・閉じたノート1・締切が先1 を読み込む | 見出しの数が「遅れ 2」「今日まで 1」「立て直す 1」「論点なし 1」。行は 遅れ→今日まで→立て直す→論点がまだ無い の順 |
| IS-LK11 | 同じ表示の札 | 遅れは古い順で「急ぎのノート › 甲は…（N日遅れ）」・⚠ の遅れの札の先頭に `.tick-warn`「⚠ 」・その論点は立て直すに出ない・論点なしは「論点のないノート（掘る 1行）」 |
| IS-LK12 | 表示を「閉じた」にして案件をたたみ、遅れの札を押す | 表示が「開いている」に戻り、案件が開き、その論点の行が画面に入って `.flash` |
| IS-LK13 | 検索で「論点のない」／空に戻す／急ぎの無いノートだけ／ノート0 | 札は論点なしの1つだけ／戻る／「急ぎのものはありません」／`#now` が隠れる |
| IS-LK14 | ［たたむ］→ ページを読み直す → ［ひらく］ | 札の行が消え数は残る → 読み直してもたたんだまま → 戻る |
```

- [ ] **Step 2: テストを足す**（look.js の IS-LK9 の後に）

```js
    /* ---------- IS-LK10〜LK14: いま ---------- */
    const [p5, p2] = [await day(-5), await day(-2)];
    const NOW_FILES = {
      'u.md': note({ title: '急ぎのノート', project: 'ITK', lines: [
        '- [ ] 甲は A ではなく B ではないか \u{1F4C5} ' + p2,
        '- [ ] 本番と通信できるのか。 \u{1F4C5} ' + p5,
        '- [ ] 乙は C ではなく D ではないか \u{1F4C5} ' + today,
        '- [ ] 確認できるのか。 \u{1F4C5} ' + future,
        '- [ ] 丙は E ではなく F ではないか \u{1F4C5} ' + future] }),
      'v.md': note({ title: '論点のないノート', project: 'ITK', lines: [], dig: ['- 書き殴り'] }),
      'w.md': note({ title: '閉じたノート', project: 'ITK', status: 'closed', lines: ['- [ ] 戊は I ではなく J ではないか \u{1F4C5} ' + p5] }),
    };
    await setStatus('open');
    await loadNotes(NOW_FILES);
    const nowNow = () => page.evaluate(() => {
      const box = document.getElementById('now');
      if (!box) return { missing: true };
      return { hidden: box.hidden, cnt: Array.from(box.querySelectorAll('.now-cnt')).map(c => c.textContent.trim()),
        groups: Array.from(box.querySelectorAll('.now-group')).map(g => ({ badge: (g.querySelector('.now-badge') || {}).textContent || '',
          ticks: Array.from(g.querySelectorAll('.tick')).map(t => t.textContent), warn: Array.from(g.querySelectorAll('.tick')).map(t => !!t.querySelector('.tick-warn')) })),
        empty: (box.querySelector('.now-empty') || {}).textContent || '', listHidden: (box.querySelector('.now-list') || {}).hidden };
    });
    const n10 = await nowNow();
    r.check('IS-LK10（いま: 遅れ 2・今日まで 1・立て直す 1・論点なし 1・行は 遅れ→今日まで→立て直す→論点がまだ無い）',
      !n10.missing && !n10.hidden && eq(n10.cnt, ['遅れ 2', '今日まで 1', '立て直す 1', '論点なし 1'])
      && eq(n10.groups.map(g => g.badge), ['遅れ 2', '今日まで 1', '立て直す 1', '論点がまだ無い 1']), JSON.stringify(n10));
    const g = n10.groups || [];
    r.check('IS-LK11（札: 遅れは古い順・ノート名 › 論点（N日遅れ）・⚠ の遅れに印・その論点は立て直すに出ない・論点なしは（掘る 1行））',
      g.length === 4 && /^⚠ 急ぎのノート › 本番と通信できるのか。（5日遅れ）$/.test(g[0].ticks[0]) && /^急ぎのノート › 甲は A ではなく B ではないか（2日遅れ）$/.test(g[0].ticks[1])
      && eq(g[0].warn, [true, false]) && eq(g[2].ticks, ['急ぎのノート › 確認できるのか。']) && eq(g[3].ticks, ['論点のないノート（掘る 1行）']),
      JSON.stringify(g));
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setStatus('closed');
    await page.evaluate(() => { const b = document.querySelector('.proj-head .proj-fold'); if (b) b.click(); });
    const n12 = await page.evaluate(async () => {
      const t = Array.from(document.querySelectorAll('#now .tick')).find(x => x.textContent.includes('甲は'));
      if (!t) return { noTick: true };
      t.click();
      await new Promise(res => setTimeout(res, 80));
      const row = Array.from(document.querySelectorAll('.issue-card')).find(c => (c.querySelector('.ic-issue') || {}).textContent === '甲は A ではなく B ではないか');
      const rc = row ? row.getBoundingClientRect() : null;
      return { status: (document.querySelector('#f-status button.active') || {}).dataset.v, folded: (document.querySelector('.proj-head .proj-fold') || {}).textContent,
        inView: !!rc && rc.top >= 0 && rc.bottom <= window.innerHeight, flash: !!row && row.classList.contains('flash') };
    });
    await page.emulateMedia({ reducedMotion: null });
    await page.setViewportSize({ width: 1280, height: 900 });
    r.check('IS-LK12（札を押す: 表示を開いているに戻し・案件を開き・その論点の行へ飛んで光る）',
      !n12.noTick && n12.status === 'open' && n12.folded === '▾' && n12.inView && n12.flash, JSON.stringify(n12));
    const n13a = await search('論点のない');
    const n13s = await nowNow();
    await search('');
    await loadNotes({ 'x.md': note({ title: '先のノート', lines: ['- [ ] 己は K ではなく L ではないか \u{1F4C5} ' + future] }) });
    const n13e = await nowNow();
    await loadNotes({});
    const n13z = await nowNow();
    r.check('IS-LK13（いまは検索に従う・急ぎが無ければ「急ぎのものはありません」・ノート0なら隠れる）',
      eq(n13a, ['論点のないノート']) && eq((n13s.groups || []).map(x => x.ticks), [['論点のないノート（掘る 1行）']])
      && n13e.empty === '急ぎのものはありません' && n13z.hidden === true, JSON.stringify([n13a, n13s.groups, n13e.empty, n13z.hidden]));
    await loadNotes(NOW_FILES);
    await page.evaluate(() => document.getElementById('now-fold').click());
    const n14a = await nowNow();
    await page.waitForTimeout(400);   // 保存は 300ms 待ってから（ui.js の scheduleSave）
    await page.reload();
    await page.waitForLoadState('load');
    await loadNotes(NOW_FILES);
    const n14b = await nowNow();
    await page.evaluate(() => document.getElementById('now-fold').click());
    const n14c = await nowNow();
    r.check('IS-LK14（たたむ: 札の行が消え数は残る・読み直してもたたんだまま・ひらくで戻る）',
      n14a.listHidden === true && eq(n14a.cnt, ['遅れ 2', '今日まで 1', '立て直す 1', '論点なし 1']) && n14b.listHidden === true && n14c.listHidden === false,
      JSON.stringify([n14a.listHidden, n14b.listHidden, n14c.listHidden]));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run issue look` → IS-LK10〜LK14 が FAIL（`#now` が無い）

- [ ] **Step 4: `web/issue/now.js` を作る**

```js
'use strict';
/* web/issue/now.js — 「いま」（段2 — IS-LK10〜LK14・docs/audits/2026-10-02-issue-redesign.md）
   入口: web/issue.html（このファイルは単独では動かない）。前提: engine.js（noteStats）・list.js（notes・matchesSearch・statusFilter・
   setStatusFilter・cardState・projFolded・renderCards）・lib/ui.js（ToolUI.nowStrip / flash — 描くのと光らせるのは共通部品）。
   読み込み時に実行する文は無い（宣言だけ）。何を入れるかはここで決める（部品は見た目だけ） */

// [id, 行の札のラベル, 見出しの数のラベル]（論点なしだけ見出しでは短く）
const ISSUE_NOW_KINDS = [['late', '遅れ', '遅れ'], ['today', '今日まで', '今日まで'], ['rethink', '立て直す', '立て直す'], ['noissue', '論点がまだ無い', '論点なし']];
let nowFolded = false;   // 保存は ui.js の savePayload / restore

function renderIssueNow() {
  const box = $id('now');
  box.hidden = notes.length === 0;
  if (box.hidden) return;
  const by = { late: [], today: [], rethink: [], noissue: [] };
  notes.forEach(function (n) {
    if (!matchesSearch(n) || (n.base && n.base.status === 'closed')) return;   // 検索に従う・閉じたノートは出さない
    if (!n.cards.some(function (c) { return c.issue; })) { by.noissue.push({ n: n }); return; }
    n.cards.forEach(function (c) { const s = cardState(c); if (s) by[s].push({ n: n, c: c }); });
  });
  by.late.sort(function (a, b) { return a.c.deadline < b.c.deadline ? -1 : a.c.deadline > b.c.deadline ? 1 : 0; });   // 古い順（安定）
  ToolUI.nowStrip(box, {
    kinds: ISSUE_NOW_KINDS.map(function (p) { return { id: p[0], label: p[1], head: p[2], count: true }; }),
    groups: Object.fromEntries(ISSUE_NOW_KINDS.map(function (p) { return [p[0], by[p[0]].map(function (x) { return issueTick(x, p[0]); })]; })),
    folded: nowFolded,
    onFold: function () { nowFolded = !nowFolded; scheduleSave(); renderIssueNow(); },
    empty: '急ぎのものはありません',
  });
}

// 札: 「⚠ 」（遅れ・今日までの ⚠ の論点）＋「ノート名（12字）› 」＋論点＋「（N日遅れ）」。論点がまだ無いノートは「ノート名（掘る N行）」
function issueTick(x, kind) {
  const cs = Array.from(x.n.title);
  const short = cs.length > 12 ? cs.slice(0, 12).join('') + '…' : cs.join('');
  if (!x.c) {
    return { parts: [{ text: x.n.title }, { text: '（掘る ' + noteStats(x.n.text).dig + '行）', cls: 'tick-par' }],
      title: x.n.title + ' — 論点を一行で書く', onClick: function () { jumpToIssue(x.n, null); } };
  }
  const parts = [];
  if (x.c.warn > 0 && kind !== 'rethink') parts.push({ text: '⚠ ', cls: 'tick-warn' });
  parts.push({ text: short + ' › ', cls: 'tick-par' });
  parts.push({ text: x.c.issue });
  if (kind === 'late') parts.push({ text: '（' + (-dayDiff(x.c.deadline)) + '日遅れ）', cls: 'tick-rel' });
  return { parts: parts, title: x.n.title + ' › ' + x.c.issue, onClick: function () { jumpToIssue(x.n, x.c); } };
}

// 札から一覧へ: 表示が「閉じた」なら「開いている」に、たたんだ案件を開いて描き直し、その行（論点なしはノート）へ飛んで光らせる
function jumpToIssue(n, c) {
  projFolded.delete(n.project || '');
  if (statusFilter() === 'closed') setStatusFilter('open'); else renderCards();
  const key = c ? c.file + (c.kind === 'line' ? ':' + c.lineNo : '') : null;
  const el = key
    ? Array.from(document.querySelectorAll('#cards .issue-card')).find(function (a) { return a.dataset.key === key; })
    : Array.from(document.querySelectorAll('#cards .note-card')).find(function (s) { return s.dataset.file === n.file; });
  if (el) ToolUI.flash(el);
}
```

- [ ] **Step 4b: `lib/ui.js` の `nowStrip` に `head` を足す** — `c.append(mk('span', 'now-dot k-' + k.id), k.label + ' ', …)` の `k.label` を `(k.head || k.label)` に、
  冒頭コメントの `spec = { kinds: [{ id, label, count }], …` を `spec = { kinds: [{ id, label, head, count }], …`（head は見出しの数のラベル。無ければ label）に。
  Plan Tasks は head を渡さないので見た目は変わらない（`./test/run taskboard parts` の TB-LP7 と `./test/run taskboard` の TB-NW1 で確かめる）

- [ ] **Step 5: つなぐ**
  - `web/issue.html`: `<div id="cards"></div>` の直前に `<section id="now" class="now" aria-label="いま" hidden></section>`、`<script src="issue/list.js"></script>` の直後に `<script src="issue/now.js"></script>`
  - `web/issue/list.js` の `renderCards` の最後（関数の閉じかっこの直前・`groups.length === 0` で `return` する前にも）に `renderIssueNow();` — `return;` の手前と関数の末尾の2か所
  - `web/issue/ui.js` の `savePayload` の返す値に `nowFolded: nowFolded,`、`restore` の最後に `if (typeof data.nowFolded === 'boolean') nowFolded = data.nowFolded;`
    （`restore()` と最初の `renderCards()` は入口ページの最後のインラインの起動処理から呼ぶ — 2026-10-02 に確かめた。now.js は `<script src>` で list.js の直後に読むので、どちらより前に宣言される）
  - `lib/ui.css` の `:where(.now) .tick-rel {…}` の後に `:where(.now) .tick-warn { color: var(--st-rethink); font-weight: 700; }`

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run issue look` → IS-LK1〜LK14 が PASS
Run: `./test/run issue` → すべて pass
Run: `./test/run` → すべて pass

- [ ] **Step 7: コミット**

```bash
git add web/issue/now.js web/issue.html web/issue/list.js web/issue/ui.js lib/ui.css lib/ui.js docs/specs/issue.md test/issue/look.js
git commit -m "issue: 一覧の上に「いま」— 遅れ・今日まで・立て直す（⚠）・論点がまだ無い を種類ごとに1行（1つの論点は1か所・⚠ の遅れに印・検索に従う・押すと表示と案件を開いて飛んで光る・たたむを覚える・IS-LK10〜LK14）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 論点の行の右クリックとキー

**Files:**
- Modify: `web/issue/list.js`（行の操作の節を足す・⋯ のボタンの title にキー）
- Modify: `web/issue.html`（`#row-pop` と CSS）
- Modify: `docs/specs/issue.md`（IS-LK15〜LK18）・`test/issue/look.js`

**Interfaces:**
- Consumes: `cardOf`（Task 2）・`sendToTasks(it)`・`wzOpenFor(it)`（wizard.js）・`openCloseModal(it)`・`obsidianHref(name)`・`ToolUI.menu` / `menuKey` / `isTyping` / `keyHint` / `pointRect` / `placeAt`
- Produces: `openObsidian(href): void`（`location.href = href` — テストで差し替えられるように関数にする）・`ISSUE_ACTIONS`

- [ ] **Step 1: spec に足す**

```markdown
- **論点の行の右クリックとキー**（IS-LK15〜LK18・Plan Tasks の TB-RM と同じ作り）: 論点の行（`.issue-card`）を右クリックすると、ポインタの位置に
  **タスクにする… `T`／ちゃんと立てる… `R`（ノートのカードは「このノートに問いを立てる…」）／閉じる… `X`／Obsidian で開く `O`**（`#row-pop` の中の `.row-menu`）。
  出す項目は ⋯ と同じ条件（閉じた論点・切り出し済みの論点には タスクにする・立てる・閉じる を出さない。Obsidian で開く は vault 名があるときだけ）。
  行にポインタを乗せてキーだけでも。リンク・入力欄の上の右クリックはブラウザのメニューのまま。キーが効かないとき: 文字を打つ欄・ウィザードと閉じる画面・論点を書いている最中・Cmd/Ctrl/Alt つき

| ID | 操作 | 期待 |
|---|---|---|
| IS-LK15 | 開いた論点の行を右クリック（本物のマウス・vault 名あり）／閉じた論点の行／切り出し済みのリンクの上 | 「タスクにする… T」「ちゃんと立てる… R」「閉じる… X」「Obsidian で開く O」・ポインタから 8px 以内／「Obsidian で開く O」だけ／既定のメニュー（`defaultPrevented` が false） |
| IS-LK16 | メニューの［ちゃんと立てる…］／メニューを開いて別の行に乗せて X／Esc | ウィザードが開く／メニューの行の閉じる画面が開く／メニューが閉じる |
| IS-LK17 | 行に乗せて T・R・X・O（vault 名あり）／検索欄に入力中の T・ウィザード中の X・Cmd+T・論点を書いている最中の T・行に乗っていない T | その行で タスクにする（`sendToTasks`）・ウィザード・閉じる画面・`openObsidian`（`obsidian://…`）／どれも何もしない |
| IS-LK18 | ⋯ の中のボタン | title の末尾が「（キー T・右クリックでも）」「（キー R・…）」「（キー X・…）」 |
```

- [ ] **Step 2: テストを足す**（look.js の IS-LK14 の後に）

```js
    /* ---------- IS-LK15〜LK18: 右クリックとキー ---------- */
    await page.evaluate(() => { const e = document.getElementById('cfg-vault'); e.value = 'V'; e.dispatchEvent(new Event('change')); });
    await setStatus('all');
    await loadNotes({
      'm.md': note({ title: '操作のノート', lines: [
        '- [ ] 甲は A ではなく B ではないか \u{1F4C5} ' + future,
        '- [ ] 乙は C ではなく D ではないか \u{1F4C5} ' + future + ' [[切り出し先]]',
        '- [x] 丙は E ではなく F ではないか \u{1F4C5} 2026-09-20 ✅ 2026-09-22 当たり'] }),
    });
    const rowAt = (t) => page.evaluate((x) => {
      const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === x);
      if (!c) return null; const rc = c.querySelector('.ic-issue').getBoundingClientRect();
      return { x: Math.round(rc.left + 20), y: Math.round(rc.top + rc.height / 2) };
    }, t);
    const menuItems = () => page.evaluate(() => { const p = document.getElementById('row-pop');
      if (!p || p.hidden) return null; const rc = p.getBoundingClientRect();
      return { items: Array.from(p.querySelectorAll('[role=menuitem]')).map(b => b.querySelector('.rm-label').textContent + ' ' + b.querySelector('kbd').textContent),
        left: Math.round(rc.left), top: Math.round(rc.top) }; });
    const rightClick = async (pt) => {
      await page.evaluate(() => { window.__ctx = null; document.addEventListener('contextmenu', e => { window.__ctx = e.defaultPrevented; }, { once: true }); });
      await page.mouse.click(pt.x, pt.y, { button: 'right' }); await page.waitForTimeout(40);
      return page.evaluate(() => window.__ctx);
    };
    const pk = await rowAt('甲は A ではなく B ではないか');
    const lk15a = { prevented: await rightClick(pk), menu: await menuItems() };
    await page.keyboard.press('Escape');
    const pc = await rowAt('丙は E ではなく F ではないか');
    await rightClick(pc);
    const lk15b = await menuItems();
    await page.keyboard.press('Escape');
    const link = await page.evaluate(() => { const a = document.querySelector('.ic-spun'); if (!a) return null; const rc = a.getBoundingClientRect(); return { x: Math.round(rc.left + 6), y: Math.round(rc.top + rc.height / 2) }; });
    const lk15c = link ? { prevented: await rightClick(link), menu: await menuItems() } : null;
    r.check('IS-LK15（右クリックのメニュー: 開いた論点は4つ・ポインタの位置／閉じた論点は Obsidian で開く だけ／リンクの上は既定のメニュー）',
      lk15a.prevented === true && !!lk15a.menu && eq(lk15a.menu.items, ['タスクにする… T', 'ちゃんと立てる… R', '閉じる… X', 'Obsidian で開く O'])
      && Math.abs(lk15a.menu.left - pk.x) <= 8 && Math.abs(lk15a.menu.top - pk.y) <= 8
      && !!lk15b && eq(lk15b.items, ['Obsidian で開く O']) && !!lk15c && lk15c.prevented === false && lk15c.menu === null,
      JSON.stringify({ lk15a, lk15b, lk15c }));
    await rightClick(pk);
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#row-pop [role=menuitem]')).find(x => x.querySelector('.rm-label').textContent === 'ちゃんと立てる…'); if (b) b.click(); });
    const lk16a = await page.evaluate(() => !document.getElementById('wizard').hidden);
    await page.keyboard.press('Escape');
    await rightClick(pk);
    const pc2 = await rowAt('乙は C ではなく D ではないか');
    await page.mouse.move(pc2.x, pc2.y);
    await page.keyboard.press('x');
    const lk16b = await page.evaluate(() => ({ open: !document.getElementById('close-modal').hidden, target: document.getElementById('cm-target').textContent }));
    await page.keyboard.press('Escape');
    await rightClick(pk);
    await page.keyboard.press('Escape');
    const lk16c = await menuItems();
    r.check('IS-LK16（メニューの［ちゃんと立てる…］でウィザード／メニューを開いて別の行に乗せて X はメニューの行／Esc で閉じる）',
      lk16a && lk16b.open && lk16b.target.includes('甲は') && lk16c === null, JSON.stringify({ lk16a, lk16b, lk16c }));
    const lk17 = {};
    await page.evaluate(() => {
      window.__orig = { s: window.sendToTasks, o: window.openObsidian }; window.__calls = [];
      window.sendToTasks = (it) => window.__calls.push('task:' + it.issue);
      window.openObsidian = (h) => window.__calls.push('open:' + (h.startsWith('obsidian://open?vault=V&file=') ? 'ok' : h));
    });
    const hoverKey = async (t, key) => { const p = await rowAt(t); await page.mouse.move(p.x + 1, p.y); await page.mouse.move(p.x, p.y); await page.keyboard.press(key); await page.waitForTimeout(40); };
    await hoverKey('甲は A ではなく B ではないか', 't');
    await hoverKey('甲は A ではなく B ではないか', 'o');
    await hoverKey('甲は A ではなく B ではないか', 'r');
    lk17.wizard = await page.evaluate(() => !document.getElementById('wizard').hidden);
    await page.keyboard.press('Escape');
    await page.click('#f-q'); await hoverKey('甲は A ではなく B ではないか', 't');
    lk17.typed = await page.evaluate(() => document.getElementById('f-q').value);
    await page.evaluate(() => { const f = document.getElementById('f-q'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); document.activeElement.blur(); });
    await page.waitForTimeout(300);
    await hoverKey('甲は A ではなく B ではないか', 'Meta+t');
    await page.mouse.move(5, 5); await page.keyboard.press('t');
    lk17.calls = await page.evaluate(() => { const c = window.__calls.slice(); window.sendToTasks = window.__orig.s; window.openObsidian = window.__orig.o; return c; });
    r.check('IS-LK17（乗せて T＝タスクにする・O＝Obsidian で開く・R＝ウィザード／検索欄・Cmd・乗っていないときは何もしない）',
      eq(lk17.calls, ['task:甲は A ではなく B ではないか', 'open:ok']) && lk17.wizard && lk17.typed === 't', JSON.stringify(lk17));
    const lk18 = await page.evaluate(() => Array.from(document.querySelectorAll('.ic-menu .ic-task, .ic-menu .ic-frame, .ic-menu .ic-close')).slice(0, 3).map(b => b.title));
    r.check('IS-LK18（⋯ の中のボタンの title にキー）',
      lk18.length === 3 && lk18[0].endsWith('（キー T・右クリックでも）') && lk18[1].endsWith('（キー R・右クリックでも）') && lk18[2].endsWith('（キー X・右クリックでも）'),
      JSON.stringify(lk18));
    await page.evaluate(() => { const e = document.getElementById('cfg-vault'); e.value = ''; e.dispatchEvent(new Event('change')); });
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run issue look` → IS-LK15〜LK18 が FAIL（`#row-pop` が無い・title にキーが無い）

- [ ] **Step 4: `web/issue/list.js` に足す** — ファイル末尾（`$id('f-status').addEventListener('click', …)` の前）に:

```js
/* ---------- 論点の行の右クリックとキー（段2 — IS-LK15〜LK18・Plan Tasks の TB-RM と同じ作り） ----------
   メニューの見た目・キーの読み方・文字を打っている最中の判定・置き場所は lib/ui.js の ToolUI。何をするか・どの行に効くかはここ。
   出す項目は ⋯ と同じ条件 */
const ISSUE_ACTIONS = [
  { id: 'task',  key: 't', keyLabel: 'T', icon: '＋', label: 'タスクにする…',
    can: function (it) { return it.status !== 'closed'; }, run: function (it) { sendToTasks(it); } },
  { id: 'frame', key: 'r', keyLabel: 'R', icon: '✎', label: 'ちゃんと立てる…',
    can: function (it) { return it.status !== 'closed' && !(it.kind === 'line' && it.link); }, run: function (it) { wzOpenFor(it); } },
  { id: 'close', key: 'x', keyLabel: 'X', icon: '✓', label: '閉じる…',
    can: function (it) { return it.status !== 'closed' && !(it.kind === 'line' && it.link); }, run: function (it) { openCloseModal(it); } },
  { id: 'open',  key: 'o', keyLabel: 'O', icon: '↗', label: 'Obsidian で開く',
    can: function (it) { return !!obsidianHref(it.name); }, run: function (it) { openObsidian(obsidianHref(it.name)); } },
];
function openObsidian(href) { location.href = href; }   // 外部スキーム。テストで差し替える（IS-LK17）
function actionsFor(it) {
  return ISSUE_ACTIONS.filter(function (a) { return a.can(it); }).map(function (a) {
    return a.id === 'frame' && it.kind !== 'line' ? Object.assign({}, a, { label: 'このノートに問いを立てる…' }) : a;
  });
}
function keyHintFor(id) { return ToolUI.keyHint(ISSUE_ACTIONS.find(function (a) { return a.id === id; })); }
let menuFor = null;   // メニューを開いている論点（キーで選んだときに効く先）
function closeRowPop() { $id('row-pop').hidden = true; menuFor = null; }
function openRowPop(it, x, y) {
  const acts = actionsFor(it);
  if (!acts.length) return false;
  const pop = $id('row-pop');
  pop.textContent = '';
  pop.appendChild(ToolUI.menu(acts, function (a) { closeRowPop(); a.run(it); }));
  pop.hidden = false;
  menuFor = it;
  ToolUI.placeAt(pop, ToolUI.pointRect(x, y));
  return true;
}
// 右クリック: リンク・入力欄の上ではブラウザのメニューを奪わない
$id('cards').addEventListener('contextmenu', function (e) {
  const art = e.target.closest && e.target.closest('.issue-card');
  if (!art || e.target.closest('a, input, textarea, select')) return;
  const it = cardOf.get(art);
  if (it && openRowPop(it, e.clientX, e.clientY)) e.preventDefault();
});
document.addEventListener('mousedown', function (e) {
  const p = $id('row-pop');
  if (!p.hidden && !p.contains(e.target)) closeRowPop();
});
// キーが効く論点: メニューが開いていればその論点、無ければポインタを乗せている行
function issueKeyTarget() {
  if (!$id('wizard').hidden || !$id('close-modal').hidden) return null;
  if (menuFor) return menuFor;
  if (ToolUI.isTyping(document.activeElement)) return null;
  if (document.querySelector('#cards .ic-edit')) return null;   // 論点を書いている最中
  const art = document.querySelector('#cards .issue-card:hover');
  return art ? (cardOf.get(art) || null) : null;
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !$id('row-pop').hidden) { closeRowPop(); return; }
  const it = issueKeyTarget();
  if (!it) return;
  const a = ToolUI.menuKey(e, actionsFor(it));
  if (!a) return;
  e.preventDefault();
  closeRowPop();
  a.run(it);
});
```

  そして `card` の ⋯ のボタンに title のキーを添える:
  - `tb.title = 'Plan Tasks の追加画面を、この論点を添えて開く';` を `tb.title = 'Plan Tasks の追加画面を、この論点を添えて開く' + keyHintFor('task');` に
  - `fb.textContent = …;` の後に `fb.title = (it.kind === 'line' ? '5段に切り出す' : 'このノートの先頭に5段を差し込む') + keyHintFor('frame');`
  - `cb.textContent = '閉じる…';` の後に `cb.title = '当たり／外れ／未決 を残して閉じる' + keyHintFor('close');`

- [ ] **Step 5: `web/issue.html` に足す** — `<div id="cards"></div>` の直後に `<div id="row-pop" class="row-pop" hidden></div>`、CSS（`</style>` の直前）:

```css
  /* 論点の行の右クリックのメニューを置く小窓（IS-LK15）。メニューの見た目は lib/ui.css の .row-menu */
  .row-pop { position: absolute; z-index: 160; background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,.18); padding: 4px; }
```

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run issue look` → IS-LK1〜LK18 が PASS
Run: `./test/run issue` → すべて pass
Run: `./test/run` → すべて pass

- [ ] **Step 7: 実データで目で確かめる**（1回だけ）— `issue-now.js` の画面に加え、論点の行を右クリックした画面を撮って見る

- [ ] **Step 8: コミット**

```bash
git add web/issue/list.js web/issue.html docs/specs/issue.md test/issue/look.js
git commit -m "issue: 論点の行を右クリックとキーでも（タスクにする T・ちゃんと立てる R・閉じる X・Obsidian で開く O — ⋯ と同じ条件・文字を打つ欄とモーダル中と書いている最中は奪わない・⋯ の title にキー・IS-LK15〜LK18）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 決定事項と仕上げ

**Files:**
- Modify: `docs/specs/issue.md`（決定事項に IS-Q24）・`CLAUDE.md`（チェック数）

- [ ] **Step 1: 決定事項を書く** — `docs/specs/issue.md` の `## 決定事項` の節の末尾に:

```markdown
- **IS-Q24**（2026-10-02）: 見た目の作り直し（段2）。Plan Tasks で決めたこと（docs/coding-rules.md「見た目と操作の決まり」）を Check Issue に当てた — 見出し2行・表示の切替を横並びのボタンに・検索・
  論点の行の状態の帯（遅れ・今日・立て直す）と日付（2026/9/25(金)＋N日遅れ）・「やること」「問い」の印・⚠ の直し方・案件の見出し（数とたたむ）・「いま」（遅れ・今日まで・立て直す・論点がまだ無い —
  1つの論点は1か所）・論点の行の右クリックとキー。利用者が画面イメージ第2案で合意（docs/audits/2026-10-02-issue-redesign.md）。
  ［＋ 新しく立てる］は主役の色にしない（IS-U25・R10 を優先 — 画面イメージは主役の色だった）。「いま」は表示の切替に関係なく開いているノートを見て、
  札を押すと表示を「開いている」に戻す（飛び先が見えないままにしない）
```

- [ ] **Step 2: 全体を回して数を数える**

Run: `./test/run`
Expected: すべて pass。各ツールの「N pass / 0 fail」を足した数（段2の前は 959。IS-LK1〜LK18 の18が増えて 977 になるはず。違えば数え直して実数を使う）

- [ ] **Step 3: `CLAUDE.md` の数を直す** — 「**959チェックの検証機構が**」を Step 2 の実数に

- [ ] **Step 4: コミット**

```bash
git add docs/specs/issue.md CLAUDE.md
git commit -m "docs: Check Issue の見た目の作り直し（段2）の決定事項 IS-Q24（977チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
