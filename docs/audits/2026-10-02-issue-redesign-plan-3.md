# 段3 実装計画: Check Issue の 分かったこと・待ち・掘るを読む

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 論点の行の下に「分かった／⏳ 待ち／伝えた」を出し、［＋ 分かったこと］で1行足せるようにし、「いま」の札に「⏳ 待ち」を添え、ノートのカードの［掘るを読む］で掘るの中身をその場で読めるようにする。

**Architecture:** 記法は増やさない — 論点の行の直後の字下げの箇条書き（今も `issueLines` が `note` として読み、閉じるときに `\t- …` を書いている場所）を、種類つきの `kids` として読む。書き込みは今の `writeNote`（直前に再読して NFC 比較）を通す。掘るの表示は新しい `web/issue/dig.js`（`createElement` だけの最小の表示）。

**Tech Stack:** 素の JS（classic script・`file://`）、CSS、Playwright のハーネス（`./test/run issue`）

**Spec:** [docs/audits/2026-10-02-issue-redesign.md](2026-10-02-issue-redesign.md)（4 データ・3 の4「中身」・段3）と画面イメージ第2案。契約とテストケースは `docs/specs/issue.md` に新しく作る節（IS-DG1〜DG9）

## Global Constraints

- `file://` で動く。ES モジュール禁止。外部 CDN 禁止。描画は `textContent` / `createElement` のみ（`innerHTML` 禁止 — 掘るの表示も）
- **記法を増やさない**: 子の行は `<タブ か 空白2つ以上>- …`。`待ち:`（全角の `待ち：` も）で始まれば待ち、`伝えた:` で始まれば伝えた、それ以外は分かった
- 書き込みは今の `writeNote`（書く直前に再読して NFC 比較。外で変わっていたら書かずに警告）を通す。ノートのほかの行はバイト単位で変えない
- 既存のチェックは変えずに通す（段3は足すだけ。`.note-stats` の文字は IS-UL21 が見ているので、掘るを読むの見出しの中に同じクラスで残す）
- 新しいチェックの ID は IS-DG1〜DG9。テストは新しい節 `test/issue/dig.js`
- 1ファイル 1,000 行を超えない（今: `web/issue/list.js` 801 行・`web/issue/engine.js` 644 行）。掘るの表示は `web/issue/dig.js`
- 文字は `test/run` の許可範囲の中だけ（☐ U+2610・☑ U+2611・🖼 U+1F5BC・⏳ U+23F3 は範囲の中）
- コミットは1タスク1コミット。日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **子の行の字下げが空白のノート**（Obsidian の設定で空白4つ）: 読むときも書くときも、既にある子の字下げに合わせる（タブに決め打ちしない）— IS-DG2
2. **子の子（さらに深い字下げ）**: 一番深い行の後に足し、深い行も `kids` に読む（文字は前後の空白を落として出す）— IS-DG1・DG2
3. **書いている最中に別の操作**: ［＋ 分かったこと］の欄は `.ic-edit` なので、Check Issue の行のキー（T・R・X・O）は効かない（段2の IS-LK17 の除外に乗る）— IS-DG7
4. **掘るの中の崩れた書式**（閉じていない `**`、`|` だけの行、全角空白で始まる見出しもどき）: 落ちずに素の文字で出す — IS-DG8
5. **開いた［掘るを読む］が描き直しで閉じる**: 表示の切替・検索・書き込みのあとも開いたまま（ノートのファイル名で覚える）— IS-DG9
6. **掘るの中の小見出しと ``` の中の `# コメント`**: そこで掘るが切れない（同じか上の段の見出しでだけ終わる）。量（掘る N行）も同じ本文から数える — IS-DG3・DG8

---

## ファイルの地図

| ファイル | 役目 | タスク |
|---|---|---|
| `web/issue/engine.js` | `issueLines` に `kids`・`kidOf(s)`・`addKidLine(text, lineNo, sub)`・`digText(text)` | 1 |
| `web/issue.html` | `window.issue` のフックに `addKidLine`・`digText`・`kidOf`・CSS・`<script src="issue/dig.js">` | 1・2・3 |
| `web/issue/list.js` | `noteOf` が `kids` を持つ・論点の行の下に `.ic-kids`・［＋ 分かったこと］・ノートのカードの［掘るを読む］ | 2・3 |
| `web/issue/now.js` | 札に「⏳ 待ち」 | 2 |
| `web/issue/dig.js`（新規） | `renderDig(text)`（掘るの最小の表示）・`digBox(file, dig, stats)`・`digOpen` | 3 |
| `lib/ui.css` | `:where(.now) .tick-wait` | 2 |
| `docs/specs/issue.md` | 段3の節（IS-DG1〜DG9）・決定事項 IS-Q25 | 1〜4 |
| `test/issue/dig.js`（新規）・`test/issue.js` | 節 `dig` | 1〜3 |

---

### Task 1: 子の行を種類つきで読む・1行足す・掘るの本文を切り出す（純関数）

**Files:**
- Modify: `web/issue/engine.js`（`issueLines` の子の照合を深さ自由に・`out.push` に `kids`・新しい関数3つ・`noteStats` の掘るの数え方を `digText` に）
- Modify: `web/issue.html`（`window.issue = { … }` に `kidOf: kidOf, addKidLine: addKidLine, digText: digText` を足す）
- Modify: `docs/specs/issue.md`・Create: `test/issue/dig.js`・Modify: `test/issue.js`（`SECTIONS` に `'dig'`）

**Interfaces:**
- Produces: `kidOf(s: string): { kind: 'learned'|'wait'|'told', text: string }`
- Produces: `issueLines(text)` の各要素に `kids: Array<{kind, text}>`（`note` は今のまま ` / ` でつないだ文字）
- Produces: `addKidLine(text: string, lineNo: number, sub: string): string` — `lineNo` の論点の行の子の最後（子の子があればその後）に、最初の子と同じ字下げ（子が無ければタブ）で `- <sub>` を1行足す。`lineNo` が範囲外ならそのまま
- Produces: `digText(text: string): string` — `## 掘る` の見出しの次の行から、次の見出し（`#` ＋空白）の手前までの本文（末尾の空白を落とす）。無ければ ''

- [ ] **Step 1: spec を書く** — `docs/specs/issue.md` の「見た目の作り直し（段2 …）」の節の直後（`## UI` の直前）に:

```markdown
## 分かったこと・待ち・掘るを読む（段3 — IS-DG1〜DG9・2026-10-02・IS-Q25）

設計: `docs/audits/2026-10-02-issue-redesign.md`（4 データ・画面イメージ第2案）。計画: `docs/audits/2026-10-02-issue-redesign-plan-3.md`。
利用者「内容がわかりにくいのかな？それぞれのイシューの」— カードが量（掘る N行）だけを出し、何が分かって何を待っているかを出していなかった。

- **子の行**: 論点の行（`## 論点` の `- [ ]`）の直後の字下げの箇条書き（タブか空白2つ以上）。今も閉じるときに「分かったこと」を書いている場所なので記法は増やさない。
  `待ち:`／`待ち：` で始まれば **⏳ 待ち**、`伝えた:` で始まれば **伝えた**、それ以外は **分かった**。子の子も読む
- **論点の行の下に出す**（開いている論点の行だけ。閉じた論点は今どおり「判定 — 分かったこと」）。行の下に［＋ 分かったこと］— 欄に1行打って［足す］（Enter でも）で、
  その論点の子の最後に同じ字下げで1行足す（待ちなら「待ち: 」で始めて打つ）。空なら足さない
- 「いま」の札: 待ちの子がある論点の札の最後に「 ⏳ 待ち」
- **［掘るを読む］**: ノートのカードの下に `details.dig`（既定は閉じる）。見出しは「掘るを読む」＋今の量（`.note-stats`「掘る N行・論点 M・画像 K」）。開くと掘るの本文を
  最小の表示で出す — 箇条書き（字下げの深さ）・番号・チェック（☐／☑）・表・区切り・画像は名前だけ（「🖼 名前（画像は Obsidian で）」）・太字・コード・[[リンク|別名]]・[文字](URL)。
  `>` の注記は出さない。崩れた書式は素の文字で出す。開いたかどうかはノートのファイル名で覚え、描き直しても開いたまま（画面を閉じるまで）。掘るが無いノートは今どおり `.note-stats` だけ

| ID | 操作 | 期待 |
|---|---|---|
| IS-DG1 | `issueLines` に、子が「分かった」「待ち: 先方」「待ち：社内」「伝えた: 課長」と子の子1つの論点 | `kids` が learned・wait（先方）・wait（社内）・told（課長）・learned（子の子）の順。`note` は今どおり ` / ` でつないだ文字 |
| IS-DG2 | `addKidLine` に 子あり（タブ）／子の子あり／子なし／空白4つの子／範囲外の行番号 | 最後の子（子の子）の後に最初の子と同じ字下げで足す／子なしは論点の直後にタブで／空白4つなら空白4つで／範囲外は変えない。ほかの行は1バイトも変えない |
| IS-DG3 | `digText` に 掘るの中に小見出し `###` と ``` の中の `# 確認` があり、あとに `## 結論` があるノート／掘るの無いノート | 掘るの見出しの次から `## 結論` の手前まで（小見出しと ``` の中は中身・末尾の空白を落とす）／''。`noteStats` の掘るの数も同じ本文から（空・注記・中身の無い `- ` を除いて 8） |
```

- [ ] **Step 2: テストを書く** — `test/issue/dig.js` を作る

```js
'use strict';
/* test/issue/dig.js — 節: 分かったこと・待ち・掘るを読む（段3）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js dig）
   前の節はページを移したまま終わることがあるので、Check Issue を開き直してから始める（FSA のダミーは addInitScript なので残る）。
   照合する ID: IS-DG1〜DG9。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'dig',
  ids: 'IS-DG1〜DG9',
  async run(ctx) {
    const { page, r, eq, fileUrl } = ctx;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(fileUrl('web/issue.html'));
    await page.waitForLoadState('load');
    // 未実装でもハーネスを止めず fail として数える（RED を見るため）
    const safe = (fn, arg) => page.evaluate(([src, a]) => {
      try { return Promise.resolve((0, eval)('(' + src + ')')(a)).catch(e => 'ERR: ' + e.message); }
      catch (e) { return 'ERR: ' + e.message; }
    }, [fn.toString(), arg]);

    /* ---------- IS-DG1: 子の行を種類つきで読む ---------- */
    const NOTE1 = ['---', 'status: open', '---', '# 子の行', '', '## 論点', '',
      '- [ ] 甲は A ではなく B ではないか \u{1F4C5} 2026-12-01',
      '\t- 分かった', '\t- 待ち: 先方', '\t- 待ち：社内', '\t- 伝えた: 課長', '\t\t- 子の子', '- [ ] 乙は C ではなく D ではないか', '', '## 掘る', '', '- 書き殴り', ''].join('\n');
    const dg1 = await safe((t) => { const L = window.issue.issueLines(t)[0]; return { kids: L.kids, note: L.note }; }, NOTE1);
    r.check('IS-DG1（issueLines の kids: 分かった・待ち（: と ：）・伝えた・子の子／note は今どおり）',
      !!dg1 && eq(dg1.kids, [{ kind: 'learned', text: '分かった' }, { kind: 'wait', text: '先方' }, { kind: 'wait', text: '社内' },
        { kind: 'told', text: '課長' }, { kind: 'learned', text: '子の子' }]) && dg1.note === '分かった / 待ち: 先方 / 待ち：社内 / 伝えた: 課長 / 子の子',
      JSON.stringify(dg1));

    /* ---------- IS-DG2: 1行足す ---------- */
    const L1 = NOTE1.split('\n');
    const at = L1.indexOf('- [ ] 甲は A ではなく B ではないか \u{1F4C5} 2026-12-01');
    const SPACE = ['## 論点', '- [ ] 丙は E ではなく F ではないか', '    - 空白4つの子', '- [ ] 丁', ''].join('\n');
    const dg2 = await safe(([t, i, sp]) => ({
      kids: window.issue.addKidLine(t, i, ' 足す '),
      none: window.issue.addKidLine(t, i + 6, '乙の子'),
      space: window.issue.addKidLine(sp, 1, '足す'),
      out: window.issue.addKidLine(t, 999, '足す') === t,
    }), [NOTE1, at, SPACE]);
    r.check('IS-DG2（addKidLine: 子の子の後に最初の子と同じ字下げで・子なしは直後にタブ・空白4つは空白4つ・範囲外は変えない・ほかの行は不変）',
      typeof dg2 === 'object' && dg2.kids === [...L1.slice(0, at + 6), '\t- 足す', ...L1.slice(at + 6)].join('\n')
      && dg2.none === [...L1.slice(0, at + 7), '\t- 乙の子', ...L1.slice(at + 7)].join('\n')
      && dg2.space === ['## 論点', '- [ ] 丙は E ではなく F ではないか', '    - 空白4つの子', '    - 足す', '- [ ] 丁', ''].join('\n') && dg2.out === true,
      JSON.stringify(dg2).slice(0, 400));

    /* ---------- IS-DG3: 掘るの本文を切り出す ---------- */
    const DIG3 = ['# ノート', '', '## 掘る', '', '> 注記', '- 一つ', '\t- 二つ', '### 小見出し', '- 三つ', '```', '# 確認', 'ping x', '```', '', '', '## 結論', '- 残す', ''].join('\n');
    const dg3 = await safe((t) => ({ a: window.issue.digText(t), none: window.issue.digText('# x\n\n## 論点\n- [ ] y\n'), n: window.issue.noteStats(t).dig }), DIG3);
    r.check('IS-DG3（digText: 掘るの次から同じか上の段の見出しの手前まで・小見出しと ``` の中の # は中身・末尾の空白は落とす・無ければ空／noteStats の数も同じ本文から）',
      typeof dg3 === 'object' && dg3.a === ['', '> 注記', '- 一つ', '\t- 二つ', '### 小見出し', '- 三つ', '```', '# 確認', 'ping x', '```'].join('\n')
      && dg3.none === '' && dg3.n === 8, JSON.stringify(dg3));
  },
};
```

- [ ] **Step 3: 節を登録する** — `test/issue.js` の `const SECTIONS = ['pure', 'ui', 'cards', 'look']` を `['pure', 'ui', 'cards', 'look', 'dig']` に

- [ ] **Step 4: 落ちることを確かめる**

Run: `./test/run issue dig`
Expected: IS-DG1〜DG3 が FAIL（`kids` が無い・`addKidLine` / `digText` が関数でない）。ハーネスは止まらない

- [ ] **Step 5: `web/issue/engine.js` に足す**
  - `issueLines` の子の行の照合 `lines[j].match(/^(?:\t| {2,})[-*+]\s+(.*)$/)` を `/^(?:\t| {2,})+[-*+]\s+(.*)$/` に（**今は1段しか読まず、`\t\t- 子の子` で読むのが止まる** — 子の子も読む。閉じた論点の「判定 — 分かったこと」にも子の子が載るようになる）
  - `issueLines` の `out.push({` の中、`note: notes.join(' / '),` の次の行に `kids: notes.map(kidOf),` を足す
  - **名前は `kids`**（`subs` にしない — 行のカードには既に `subs: 0`（サブイシューの数）があり、`card` の `if (it.subs)` が空の配列を「ある」と読んで「🧩 サブイシュー 件」を出してしまう）
  - `function issueLines(text) {` の直前に:

```js
/* 論点の行の子（段3 — IS-DG1）。記法は増やさない: 「待ち:」「待ち：」で始まれば待ち、「伝えた:」は伝えた（閉じるときに書く — openCloseModal）、それ以外は分かった */
function kidOf(s) {
  const m = String(s).match(/^(待ち|伝えた)\s*[:：]\s*(.*)$/);
  return m ? { kind: m[1] === '待ち' ? 'wait' : 'told', text: m[2].trim() } : { kind: 'learned', text: String(s).trim() };
}
```

  - `function insertAfterLine(text, lineNo, raw) {` の直前に:

```js
/* 論点の行の子の最後（子の子があればその後）に1行足す（段3 — IS-DG2）。字下げは最初の子に合わせる（子が無ければタブ）。
   ほかの行は変えない。行番号が範囲外ならそのまま返す */
function addKidLine(text, lineNo, sub) {
  const lines = nfc(text).replace(/\r\n?/g, '\n').split('\n');
  if (lineNo < 0 || lineNo >= lines.length) return lines.join('\n');
  let last = lineNo, indent = '\t';
  for (let j = lineNo + 1; j < lines.length; j++) {
    const c = lines[j].match(/^((?:\t| {2,})+)[-*+]\s+/);
    if (!c) break;
    if (last === lineNo) indent = c[1];
    last = j;
  }
  lines.splice(last + 1, 0, indent + '- ' + nfc(sub).trim());
  return lines.join('\n');
}
```

  - `function noteStats(text) {` の直前に:

```js
/* 掘るの本文（段3 — IS-DG3・［掘るを読む］・量）。見出し「掘る」の次の行から、**同じか上の段の見出し**の手前まで
   （小見出し `###` は中身）。``` の中の `# …` は見出しにしない（コマンドの注釈で切れないように）。末尾の空白は落とす */
function digText(text) {
  const out = [];
  let level = 0, fence = false;   // level: 0 = 掘るの外、それ以外は掘るの見出しの # の数
  for (const l of nfc(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(l)) fence = !fence;
    const h = fence ? null : l.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (level && h && h[1].length <= level) break;
    if (!level) { if (h && h[2].trim() === '掘る') level = h[1].length; continue; }
    out.push(l);
  }
  return out.join('\n').replace(/\s+$/, '');
}
```

  - `noteStats` の掘るの数え方を `digText` に揃える（数と［掘るを読む］の中身が食い違わないように。小見出しがなければ今と同じ数）— `let dig = 0, inDig = false;` から `dig++;\n  }` までの for を次に置き換える:

```js
  let dig = 0;
  for (const l of digText(t).split('\n')) {
    const x = l.trim();
    if (x === '' || /^>/.test(x) || /^[-*+]\s*$/.test(x)) continue;
    dig++;
  }
```

  （`noteStats` は `digText` より後ろにあるが、関数の宣言なので呼べる。`function noteStats` の直前に `digText` を置けば読む順も揃う）

  - `web/issue.html` の `window.issue = { … }` の `issueLines: issueLines,` の後に `kidOf: kidOf, addKidLine: addKidLine, digText: digText,` を足す

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run issue dig` → IS-DG1〜DG3 が PASS
Run: `./test/run issue` → すべて pass（子の子を読む・`noteStats` を `digText` に揃えても、既存のノートは小見出しが無いので数は変わらない）

- [ ] **Step 7: コミット**

```bash
git add web/issue/engine.js web/issue.html docs/specs/issue.md test/issue/dig.js test/issue.js
git commit -m "issue: 論点の子の行を種類つき（分かった・待ち・伝えた）で読む・子の最後に同じ字下げで1行足す・掘るの本文を切り出す（純関数・IS-DG1〜DG3）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 論点の行の下に 分かった・待ち・伝えた、［＋ 分かったこと］、「いま」に ⏳ 待ち

**Files:**
- Modify: `web/issue/list.js`（`noteOf` の行のカードに `kids`・`card` に `.ic-kids` と［＋ 分かったこと］・`openAddKid` / `saveKid`）
- Modify: `web/issue/now.js`（`issueTick` に「 ⏳ 待ち」）・`lib/ui.css`（`.tick-wait`）・`web/issue.html`（CSS）
- Modify: `docs/specs/issue.md`（IS-DG4〜DG7）・`test/issue/dig.js`

**Interfaces:**
- Consumes: `kidOf`・`addKidLine`（Task 1）・`writeNote(n, transform, okMsg)`・`mkText(label, value, placeholder)`（list.js / ui.js の既存）
- Produces（DOM）: 開いた論点の行の `article.issue-card` の中に `.ic-kids > .ic-kid.k-<kind>`（`.ic-kid-k` にラベル「分かった」「⏳ 待ち」「伝えた」・`.ic-kid-t` に文字）と `button.ic-add-kid`。欄は `.ic-edit` の中の `input.ic-kid-input`・`button.ic-kid-save`
- Produces: 札の最後の部品 `{ text: ' ⏳ 待ち', cls: 'tick-wait' }`

- [ ] **Step 1: spec に足す**（段3の節の表に）

```markdown
| IS-DG4 | 子のある開いた論点・子のある閉じた論点を表示 | 開いた論点の行の下に `.ic-kid` が「分かった｜分かった」「⏳ 待ち｜先方」「⏳ 待ち｜社内」「伝えた｜課長」「分かった｜子の子」の順。閉じた論点には `.ic-kid` が無い（今どおり「判定 — 分かったこと」） |
| IS-DG5 | ［＋ 分かったこと］→「Xが分かった」→［足す］／「待ち: 先方の回答」で Enter／空で［足す］／［やめる］ | ノートの子の最後に `\t- Xが分かった` が入り行の下に出る／`\t- 待ち: 先方の回答` が入り「⏳ 待ち」で出る／書かずに「空です」の warn／書かずに欄が閉じる |
| IS-DG6 | 遅れの論点に待ちの子がある／無い | 「いま」の札の最後に「 ⏳ 待ち」（`.tick-wait`）がある／無い |
| IS-DG7 | ［＋ 分かったこと］の欄を開いたまま、欄からフォーカスを外して別の論点の行で T | 何もしない（`.ic-edit` の最中 — IS-LK17 の除外） |
```

- [ ] **Step 2: テストを足す**（dig.js の IS-DG3 の後に）

```js
    /* ---------- IS-DG4〜DG7: 論点の行の下・［＋ 分かったこと］・いまの ⏳ 待ち ---------- */
    const loadNotes = (files) => page.evaluate(async (fs) => {
      for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
      for (const k of Object.keys(fs)) window.__fsa.files[k] = fs[k];
      await window.issue.load();
    }, files);
    const setStatus = (v) => page.evaluate((x) => { const b = document.querySelector('#f-status [data-v="' + x + '"]'); if (b) b.click(); }, v);
    const past = await page.evaluate(() => ToolEdit.addDays(todayStr(), -3));
    const CLOSED = ['---', 'status: open', '---', '# 閉じた論点のノート', '', '## 論点', '',
      '- [x] 戊は I ではなく J ではないか \u{1F4C5} 2026-09-20 ✅ 2026-09-22 当たり', '\t- 分かったことの記録', ''].join('\n');
    const WAITLATE = ['---', 'status: open', '---', '# 遅れのノート', '', '## 論点', '',
      '- [ ] 己は K ではなく L ではないか \u{1F4C5} ' + past, '\t- 待ち: 先方', '- [ ] 庚は M ではなく N ではないか \u{1F4C5} ' + past, ''].join('\n');
    await setStatus('all');
    await loadNotes({ 'one.md': NOTE1, 'closed.md': CLOSED, 'late.md': WAITLATE });
    const kidsOf = (t) => page.evaluate((x) => {
      const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === x);
      return c ? Array.from(c.querySelectorAll('.ic-kid')).map(s => (s.querySelector('.ic-kid-k') || {}).textContent + '｜' + (s.querySelector('.ic-kid-t') || {}).textContent) : null;
    }, t);
    const dg4 = { open: await kidsOf('甲は A ではなく B ではないか'), closed: await kidsOf('戊は I ではなく J ではないか') };
    r.check('IS-DG4（開いた論点の行の下に 分かった・⏳ 待ち・伝えた・子の子／閉じた論点には出さない）',
      eq(dg4.open, ['分かった｜分かった', '⏳ 待ち｜先方', '⏳ 待ち｜社内', '伝えた｜課長', '分かった｜子の子']) && eq(dg4.closed, []), JSON.stringify(dg4));

    const openAdd = (t) => page.evaluate((x) => {
      const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === x);
      const b = c && c.querySelector('.ic-add-kid'); if (b) b.click();
      return !!(c && c.querySelector('.ic-edit .ic-kid-input'));
    }, t);
    const typeKid = (v) => page.evaluate((x) => { const i = document.querySelector('.ic-edit .ic-kid-input'); if (i) { i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); } return !!i; }, v);
    const dg5 = {};
    dg5.opened = await openAdd('乙は C ではなく D ではないか');
    await typeKid('Xが分かった');
    await page.evaluate(() => { const b = document.querySelector('.ic-edit .ic-kid-save'); if (b) b.click(); });
    await page.waitForTimeout(400);
    dg5.file1 = await page.evaluate(() => window.__fsa.files['one.md']);
    dg5.shown1 = await kidsOf('乙は C ではなく D ではないか');
    await openAdd('乙は C ではなく D ではないか');
    await page.focus('.ic-edit .ic-kid-input');
    await page.keyboard.type('待ち: 先方の回答');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    dg5.shown2 = await kidsOf('乙は C ではなく D ではないか');
    dg5.file2 = await page.evaluate(() => window.__fsa.files['one.md']);
    await openAdd('乙は C ではなく D ではないか');
    await page.evaluate(() => { const b = document.querySelector('.ic-edit .ic-kid-save'); if (b) b.click(); });
    await page.waitForTimeout(200);
    dg5.empty = await page.evaluate(() => ({ banner: document.getElementById('banner').textContent, file: window.__fsa.files['one.md'] }));
    await page.evaluate(() => { const no = Array.from(document.querySelectorAll('.ic-edit button')).find(b => b.textContent === 'やめる'); if (no) no.click(); });
    dg5.closed = await page.evaluate(() => !document.querySelector('#cards .ic-edit'));
    const L2 = NOTE1.split('\n');
    const otsu = L2.indexOf('- [ ] 乙は C ではなく D ではないか');
    const expect1 = [...L2.slice(0, otsu + 1), '\t- Xが分かった', ...L2.slice(otsu + 1)].join('\n');
    const expect2 = [...L2.slice(0, otsu + 1), '\t- Xが分かった', '\t- 待ち: 先方の回答', ...L2.slice(otsu + 1)].join('\n');
    r.check('IS-DG5（［＋ 分かったこと］: 足すと子の最後に同じ字下げで入り行の下に出る・待ちは ⏳ 待ち・空は書かずに warn・やめるで閉じる）',
      dg5.opened && dg5.file1 === expect1 && eq(dg5.shown1, ['分かった｜Xが分かった'])
      && dg5.file2 === expect2 && eq(dg5.shown2, ['分かった｜Xが分かった', '⏳ 待ち｜先方の回答'])
      && dg5.empty.banner.includes('空です') && dg5.empty.file === expect2 && dg5.closed,
      JSON.stringify({ opened: dg5.opened, f1: dg5.file1 === expect1, s1: dg5.shown1, f2: dg5.file2 === expect2, s2: dg5.shown2, empty: dg5.empty.banner, closed: dg5.closed }));

    const dg6 = await page.evaluate(() => Array.from(document.querySelectorAll('#now .tick')).map(t => ({ text: t.textContent, wait: !!t.querySelector('.tick-wait') }))
      .filter(t => t.text.includes('己は') || t.text.includes('庚は')));
    r.check('IS-DG6（いまの札: 待ちの子がある遅れの論点にだけ「 ⏳ 待ち」）',
      dg6.length === 2 && dg6.find(t => t.text.includes('己は')).wait === true && dg6.find(t => t.text.includes('己は')).text.endsWith(' ⏳ 待ち')
      && dg6.find(t => t.text.includes('庚は')).wait === false, JSON.stringify(dg6));

    await openAdd('甲は A ではなく B ではないか');
    await page.evaluate(() => { window.__calls = []; window.__orig = window.sendToTasks; window.sendToTasks = (it) => window.__calls.push(it.issue); if (document.activeElement) document.activeElement.blur(); });
    const pk = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === '庚は M ではなく N ではないか');
      const rc = c.querySelector('.ic-issue').getBoundingClientRect(); return { x: Math.round(rc.left + 20), y: Math.round(rc.top + rc.height / 2) }; });
    await page.mouse.move(pk.x + 1, pk.y); await page.mouse.move(pk.x, pk.y); await page.keyboard.press('t'); await page.waitForTimeout(40);
    const dg7 = await page.evaluate(() => { const c = window.__calls.slice(); window.sendToTasks = window.__orig;
      const no = Array.from(document.querySelectorAll('.ic-edit button')).find(b => b.textContent === 'やめる'); if (no) no.click(); return c; });
    r.check('IS-DG7（［＋ 分かったこと］の欄を開いている最中は、別の行で T が効かない）', eq(dg7, []), JSON.stringify(dg7));
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run issue dig` → IS-DG4〜DG6 が FAIL（`.ic-kid`・`.ic-add-kid`・`.tick-wait` が無い）。IS-DG7 は欄が無いので `openAdd` が何もせず、T が効いて FAIL になる

- [ ] **Step 4: `web/issue/list.js` を書き換える**
  - `noteOf` の行のカードの `issue: L.text, deadline: L.due, doneDate: L.doneDate, conclusion: L.note || '',` の行の後に `kids: L.kids || [],` を足す
  - `card` の `if (ul.childNodes.length) art.appendChild(ul);   // 空の一覧で余白を作らない` の直前に足す:

```js
  // 分かった・⏳ 待ち・伝えた（段3 — IS-DG4）と［＋ 分かったこと］（IS-DG5）。開いている論点の行だけ（閉じたものは「判定 — 分かったこと」）
  if (it.kind === 'line' && !closed) {
    if (it.kids && it.kids.length) {
      const box = document.createElement('div');
      box.className = 'ic-kids';
      const label = { learned: '分かった', wait: '⏳ 待ち', told: '伝えた' };
      it.kids.forEach(function (s) {
        const r = document.createElement('div');
        r.className = 'ic-kid k-' + s.kind;
        const k = document.createElement('span');
        k.className = 'ic-kid-k';
        k.textContent = label[s.kind];
        const t = document.createElement('span');
        t.className = 'ic-kid-t';
        t.textContent = s.text;
        r.append(k, t);
        box.appendChild(r);
      });
      art.appendChild(box);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ic-add-kid';
    add.textContent = '＋ 分かったこと';
    add.title = '分かったこと・今の見立てを1行（待ちなら「待ち: 」で始める）';
    add.addEventListener('click', function () { openAddKid(art, add, it); });
    art.appendChild(add);
  }
```

  - `function openAddIssue(row, n) {` の直前に足す:

```js
/* 論点の子に1行足す（段3 — IS-DG5）。欄は .ic-edit なので、書いている最中は行のキーが効かない（IS-DG7） */
function openAddKid(art, btn, it) {
  if (art.querySelector('.ic-edit')) return;
  btn.hidden = true;
  const box = document.createElement('div');
  box.className = 'ic-edit';
  const row = document.createElement('div');
  row.className = 'ic-edit-row';
  const input = mkText('', '', '分かったこと・今の見立て（待ちなら「待ち: 」で始める）');
  input.className = 'ic-kid-input';
  const ok = document.createElement('button');
  ok.type = 'button'; ok.className = 'primary ic-kid-save'; ok.textContent = '足す';
  ok.addEventListener('click', function () { saveKid(it, input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.isComposing || e.keyCode === 229) return;   // 変換の確定の Enter で足さない
    if (e.key === 'Enter') { e.preventDefault(); saveKid(it, input.value); }
  });
  const no = document.createElement('button');
  no.type = 'button'; no.textContent = 'やめる';
  no.addEventListener('click', renderCards);
  row.append(input, ok, no);
  box.appendChild(row);
  art.insertBefore(box, btn);
  input.focus();
}
async function saveKid(it, value) {
  const text = nfc(value).trim();
  if (text === '') { ToolUI.banner($id('banner'), 'warn', '空です（分かったことを1行で）'); return; }
  await writeNote(it.note, function (cur) { return addKidLine(cur, it.lineNo, text); }, '「' + text + '」を足しました');
}
```

  （`mkText(id, val, ph)` は wizard.js にあり、`openIssueEdit` も同じ形で使っている。`writeNote` は書いたあと `loadIssues(false)` で読み直して描き直す — 2026-10-02 に確かめた。
  書いている最中の行のキーは `issueKeyTarget` の `if (document.querySelector('#cards .ic-edit')) return null;` が止める — 欄の箱を `.ic-edit` にするのはそのため）

- [ ] **Step 5: 札と CSS**
  - `web/issue/now.js` の `issueTick` の `if (kind === 'late') parts.push(…);` の後に:

```js
  if ((x.c.kids || []).some(function (s) { return s.kind === 'wait'; })) parts.push({ text: ' ⏳ 待ち', cls: 'tick-wait' });   // 段3 — IS-DG6
```

  - `lib/ui.css` の `:where(.now) .tick-warn {…}` の後に `:where(.now) .tick-wait { color: var(--st-today); font-size: 12px; }`
  - `web/issue.html` の `</style>` の直前に:

```css
  /* 論点の子（段3 — IS-DG4・DG5） */
  .ic-kids { margin: 2px 0 2px 2.2em; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .ic-kid { display: flex; gap: 8px; align-items: baseline; }
  .ic-kid-k { font-size: 11px; font-weight: 700; min-width: 4.5em; color: var(--muted); }
  .ic-kid.k-wait .ic-kid-k { color: var(--st-today); }
  .ic-add-kid { margin: 2px 0 4px 2.2em; border: 0; background: none; padding: 0; color: var(--accent); font-size: 12.5px; cursor: pointer; box-shadow: none; }
  .ic-add-kid:hover { text-decoration: underline; box-shadow: none; transform: none; }
```

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run issue dig` → IS-DG1〜DG7 が PASS
Run: `./test/run issue` → すべて pass
Run: `./test/run` → すべて pass

- [ ] **Step 7: コミット**

```bash
git add web/issue/list.js web/issue/now.js lib/ui.css web/issue.html docs/specs/issue.md test/issue/dig.js
git commit -m "issue: 論点の行の下に 分かった・⏳ 待ち・伝えた を出し、［＋ 分かったこと］で子の最後に1行足す（待ちは「待ち: 」で始める）・「いま」の札に ⏳ 待ち（IS-DG4〜DG7）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ［掘るを読む］（web/issue/dig.js）

**Files:**
- Create: `web/issue/dig.js`
- Modify: `web/issue/list.js`（`noteCard` の `.note-stats` のところ）・`web/issue.html`（`<script src="issue/dig.js">`・CSS）
- Modify: `docs/specs/issue.md`（IS-DG8・DG9・UI の節の `.note-stats` の行）・`test/issue/dig.js`

**Interfaces:**
- Consumes: `digText(text)`（Task 1）・`noteStats(text)`
- Produces（dig.js）: `renderDig(text: string): HTMLElement`（`div.md`）・`digBox(file: string, dig: string, stats: string): HTMLDetailsElement`（`details.dig`）・`digOpen: Set<ファイル名>`（描き直しても開いたまま）

- [ ] **Step 1: spec に足す**（段3の節の表に2行。あわせて `## UI` の「その下に `.note-stats`「掘る N行・論点 M・画像 K」…」の行の末尾に「。**掘るに中身があるノートは、カードの下の［掘るを読む（…）］の見出しの中**に出す（段3 — IS-DG8）」を足す）

```markdown
| IS-DG8 | 掘るに 注記・箇条書き（深さ2）・番号・表・区切り・画像・チェック・[[リンク\|別名]]・[文字](URL)・`コード`・**太字**・閉じていない `**`・小見出し `###`・``` のブロック のあるノートの［掘るを読む］を開く | 見出しは「掘るを読む（」で始まり `.note-stats` を含む。論点の行より下。既定は閉じている。開くと `.md` に 注記は無く、箇条書きは深さ順に字下げ（2つ目が深い）・番号は「1. 」・表は th「a」「b」と td「1」「2」（2 は太字）・区切り `hr`・「🖼 shot.png（画像は Obsidian で）」・「☐ やること」「☑ 済んだ」・「別名 と code」（code は `code` 要素）・「文字」・閉じていない `**` は素の文字のまま・小見出しは `.md-h`「小見出し」・ブロックは `pre`「# 確認 ⏎ ping x」 |
| IS-DG9 | ［掘るを読む］を開いて 表示の切替を押す／掘るの無いノート | 開いたまま／`details.dig` が無く、見出しのすぐ下に `.note-stats` だけ（今どおり） |
```

- [ ] **Step 2: テストを足す**（dig.js の IS-DG7 の後に）

```js
    /* ---------- IS-DG8・DG9: 掘るを読む ---------- */
    const DIGNOTE = ['---', 'status: open', '---', '# 掘るのノート', '', '## 論点', '', '- [ ] 辛は O ではなく P ではないか', '', '## 掘る', '',
      '> 10分で論点の行が書けなければ', '- 調べたこと', '\t- 深いこと', '1. 番号の行', '| a | b |', '|---|---|', '| 1 | **2** |', '---',
      '![[shot.png]]', '- [ ] やること', '- [x] 済んだ', '[[ノート|別名]] と `code`', '[文字](https://example.com)', '閉じていない **太字',
      '### 小見出し', '```', '# 確認', 'ping x', '```', ''].join('\n');
    const NODIG = ['---', 'status: open', '---', '# 掘るの無いノート', '', '## 論点', '', '- [ ] 壬は Q ではなく R ではないか', ''].join('\n');
    await setStatus('open');
    await loadNotes({ 'dig.md': DIGNOTE, 'nodig.md': NODIG });
    const digOf = (name) => page.evaluate((nm) => {
      const sec = Array.from(document.querySelectorAll('.note-card')).find(s => (s.querySelector('.note-name') || {}).textContent === nm);
      if (!sec) return { missing: true };
      const d = sec.querySelector('details.dig');
      const kids = Array.from(sec.children);
      return { has: !!d, open: !!d && d.open, summary: d ? d.querySelector('summary').textContent : '', stats: !!(d && d.querySelector('summary .note-stats')),
        // 論点の行より下（最後のカードより後ろ）・量だけのときは見出しのすぐ下（2つ目の子）
        below: !!d && kids.indexOf(d) > kids.indexOf(Array.from(sec.querySelectorAll(':scope > .issue-card')).pop()),
        plainStats: !!sec.querySelector(':scope > .note-stats') && kids[1] === sec.querySelector(':scope > .note-stats') };
    }, name);
    const dg8a = await digOf('掘るのノート');
    const dg8 = await page.evaluate(() => {
      const sec = Array.from(document.querySelectorAll('.note-card')).find(s => (s.querySelector('.note-name') || {}).textContent === '掘るのノート');
      const d = sec && sec.querySelector('details.dig'); if (!d) return { missing: true };
      d.open = true; d.dispatchEvent(new Event('toggle'));
      const md = d.querySelector('.md'); if (!md) return { noMd: true };
      const lis = Array.from(md.querySelectorAll('.md-li'));
      return {
        text: md.textContent, note: md.textContent.includes('10分で論点'),
        li: lis.map(l => l.textContent), pad: lis.slice(0, 2).map(l => parseFloat(l.style.paddingLeft || '0')),
        th: Array.from(md.querySelectorAll('th')).map(x => x.textContent), td: Array.from(md.querySelectorAll('td')).map(x => x.textContent),
        bold: Array.from(md.querySelectorAll('td b')).map(x => x.textContent), hr: !!md.querySelector('hr'),
        img: (md.querySelector('.md-img') || {}).textContent || '', code: (md.querySelector('code') || {}).textContent || '',
        p: Array.from(md.querySelectorAll('p')).map(x => x.textContent),
        h: Array.from(md.querySelectorAll('.md-h')).map(x => x.textContent), pre: Array.from(md.querySelectorAll('pre')).map(x => x.textContent),
      };
    });
    r.check('IS-DG8（掘るを読む: 見出しに量・論点の行より下・既定は閉じる・開くと 注記なし・箇条書きの深さ・番号・表・区切り・画像の名前・チェック・リンクは文字・コード・崩れた太字は素の文字・小見出し・ブロック）',
      !dg8a.missing && dg8a.has && !dg8a.open && dg8a.summary.startsWith('掘るを読む（') && dg8a.stats && dg8a.below
      && !dg8.missing && !dg8.noMd && !dg8.note && eq(dg8.li.slice(0, 3), ['・調べたこと', '・深いこと', '1. 番号の行']) && dg8.pad[1] > dg8.pad[0]
      && eq(dg8.th, ['a', 'b']) && eq(dg8.td, ['1', '2']) && eq(dg8.bold, ['2']) && dg8.hr && dg8.img === '🖼 shot.png（画像は Obsidian で）'
      && dg8.li.includes('☐ やること') && dg8.li.includes('☑ 済んだ') && dg8.code === 'code'
      && dg8.p.includes('別名 と code') && dg8.p.includes('文字') && dg8.p.includes('閉じていない **太字')
      && eq(dg8.h, ['小見出し']) && eq(dg8.pre, ['# 確認\nping x']),
      JSON.stringify({ dg8a, dg8 }).slice(0, 900));
    await setStatus('all');
    const dg9 = { kept: (await digOf('掘るのノート')).open, nodig: await digOf('掘るの無いノート') };
    r.check('IS-DG9（掘るを読むは描き直しても開いたまま・掘るの無いノートは details が無く .note-stats だけ）',
      dg9.kept === true && !dg9.nodig.missing && !dg9.nodig.has && dg9.nodig.plainStats, JSON.stringify(dg9));
```

  （`.md-li` のマーカーは箇条書きが「・」、番号が「1. 」、チェックが「☐ 」「☑ 」— 下の実装と揃える。`d.open = true` でも toggle は後から非同期で来るので、テストは自分で toggle を送ってその場で中身を見る）

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run issue dig` → IS-DG8・DG9 が FAIL（`details.dig` が無い）

- [ ] **Step 4: `web/issue/dig.js` を作る**

```js
'use strict';
/* web/issue/dig.js — ［掘るを読む］の最小の表示（段3 — IS-DG8・DG9）
   入口: web/issue.html（このファイルは単独では動かない）。読み込み時に実行する文は無い（宣言だけ）。
   **HTML 文字列を組み立てない**（createElement と textContent だけ）。崩れた書式は素の文字で出す（落とさない） */

// 1行の中の書式: **太字**・`コード`・[[リンク|別名]]・[文字](URL)。それ以外は文字のまま
function digInline(host, text) {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;
  let at = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > at) host.appendChild(document.createTextNode(text.slice(at, m.index)));
    const t = m[0];
    let el;
    if (t.startsWith('**')) { el = document.createElement('b'); el.textContent = t.slice(2, -2); }
    else if (t.startsWith('`')) { el = document.createElement('code'); el.textContent = t.slice(1, -1); }
    else if (t.startsWith('[[')) { const inner = t.slice(2, -2); el = document.createTextNode(inner.includes('|') ? inner.split('|').pop() : inner); }
    else { el = document.createTextNode(t.slice(1, t.indexOf(']'))); }
    host.appendChild(el);
    at = m.index + t.length;
  }
  if (at < text.length) host.appendChild(document.createTextNode(text.slice(at)));
}

function renderDig(text) {
  const box = document.createElement('div');
  box.className = 'md';
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], l = raw.trim();
    if (!l || l.startsWith('>')) continue;                       // 空行・注記（止め時の案内）は出さない
    if (l.startsWith('```')) {                                   // ブロックは中身をそのまま（閉じていなければ最後まで）
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) body.push(lines[i]);
      const pre = document.createElement('pre');
      pre.textContent = body.join('\n');
      box.appendChild(pre);
      continue;
    }
    const h = l.match(/^#{1,6}\s+(.*)$/);
    if (h) {                                                     // 小見出し（掘るの中の ### …）
      const p = document.createElement('p');
      p.className = 'md-h';
      digInline(p, h[1]);
      box.appendChild(p);
      continue;
    }
    if (l.startsWith('|')) {                                     // 表（続く | の行をまとめる。区切りの行は出さない）
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
      i--;
      const wrap = document.createElement('div');
      wrap.className = 'md-tw';
      const table = document.createElement('table');
      rows.filter(r => !/^\|[\s:|-]+\|?$/.test(r)).forEach((r, ri) => {
        const tr = document.createElement('tr');
        for (const c of r.replace(/^\||\|$/g, '').split('|')) {
          const cell = document.createElement(ri === 0 ? 'th' : 'td');
          digInline(cell, c.trim());
          tr.appendChild(cell);
        }
        table.appendChild(tr);
      });
      wrap.appendChild(table);
      box.appendChild(wrap);
      continue;
    }
    if (/^-{3,}$/.test(l)) { box.appendChild(document.createElement('hr')); continue; }
    const img = l.match(/^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/) || l.match(/^!\[([^\]]*)\]\([^)]+\)$/);
    if (img) {
      const d = document.createElement('div');
      d.className = 'md-img';
      d.textContent = '🖼 ' + (img[1] || '画像') + '（画像は Obsidian で）';
      box.appendChild(d);
      continue;
    }
    const li = raw.match(/^((?:\t| {2,})*)(?:([-*+])(?:\s+\[([ xX])\])?|(\d+)\.)\s+(.*)$/);
    if (li) {
      const depth = (li[1].match(/\t| {2,4}/g) || []).length;
      const row = document.createElement('div');
      row.className = 'md-li';
      row.style.paddingLeft = (depth * 1.2) + 'em';
      const mark = li[4] ? li[4] + '. ' : (li[3] !== undefined ? (li[3] === ' ' ? '☐ ' : '☑ ') : '・');
      row.appendChild(document.createTextNode(mark));
      digInline(row, li[5]);
      box.appendChild(row);
      continue;
    }
    const p = document.createElement('p');
    digInline(p, l);
    box.appendChild(p);
  }
  return box;
}

const digOpen = new Set();   // ［掘るを読む］を開いたノート（ファイル名。画面を閉じるまで — IS-DG9）

// ［掘るを読む（掘る N行・論点 M・画像 K）］。中身は開いたときに作る（閉じたままのノートは描かない）
function digBox(file, dig, stats) {
  const d = document.createElement('details');
  d.className = 'dig';
  const sm = document.createElement('summary');
  const st = document.createElement('span');
  st.className = 'note-stats';
  st.textContent = stats;
  sm.append('掘るを読む（', st, '）');
  d.appendChild(sm);
  const fill = function () { if (!d.querySelector('.md')) d.appendChild(renderDig(dig)); };
  if (digOpen.has(file)) { d.open = true; fill(); }
  d.addEventListener('toggle', function () { if (d.open) { digOpen.add(file); fill(); } else digOpen.delete(file); });
  return d;
}
```

- [ ] **Step 5: ノートのカードにつなぐ**
  - `web/issue.html` の `<script src="issue/now.js"></script>` の直後に `<script src="issue/dig.js"></script>`
  - `web/issue/list.js` の `noteCard` を次に置き換える（量の作り方は今のまま。掘るに中身があれば量は［掘るを読む（…）］の見出しへ移し、論点の行の下に置く）:

```js
function noteCard(g) {
  const sec = document.createElement('section');
  sec.className = 'note-card' + (g.n.base && g.n.base.status === 'closed' ? ' is-closed' : '');
  sec.dataset.file = g.n.file;
  sec.appendChild(noteHeader(g.n));
  const st = noteStats(g.n.text);
  const parts = [];
  if (st.dig) parts.push('掘る ' + st.dig + '行');
  if (st.lines) parts.push('論点 ' + st.lines);
  if (st.images) parts.push('画像 ' + st.images);
  // 掘るに中身があれば、量はカードの下の［掘るを読む（…）］の見出しに（段3 — IS-DG8）。無ければ今どおり見出しのすぐ下に量だけ（IS-DG9）
  if (parts.length && !st.dig) {
    const p = document.createElement('div');
    p.className = 'note-stats';
    p.textContent = parts.join('・');
    sec.appendChild(p);
  }
  for (let k = 0; k < g.cards.length; k++) sec.appendChild(card(g.cards[k]));
  if (st.dig) sec.appendChild(digBox(g.n.file, digText(g.n.text), parts.join('・')));
  return sec;
}
```

  - `web/issue.html` の `</style>` の直前に:

```css
  /* ［掘るを読む］（段3 — IS-DG8） */
  details.dig { border-top: 1px solid var(--border); margin-top: 6px; }
  details.dig > summary { cursor: pointer; padding: 6px 2px; font-size: 12.5px; color: var(--muted); }
  details.dig > summary .note-stats { display: inline; margin: 0; }
  .md { padding: 2px 4px 10px 1.4em; font-size: 13px; max-height: 360px; overflow: auto; overflow-wrap: anywhere; }
  .md p { margin: 2px 0; }
  .md .md-li { margin: 1px 0; }
  .md hr { border: 0; border-top: 1px dashed var(--border); margin: 8px 0; }
  .md .md-img { color: var(--muted); font-size: 12px; }
  .md .md-tw { overflow-x: auto; margin: 6px 0; }
  .md table { border-collapse: collapse; font-size: 12.5px; }
  .md td, .md th { border: 1px solid var(--border); padding: 3px 7px; text-align: left; vertical-align: top; white-space: nowrap; }
  .md th { color: var(--muted); font-weight: 600; }
  .md code { font: 12px ui-monospace, Menlo, monospace; background: var(--bg); padding: 0 3px; border-radius: 3px; }
  .md pre { font: 12px ui-monospace, Menlo, monospace; background: var(--bg); padding: 6px 8px; border-radius: 6px; margin: 4px 0; overflow-x: auto; white-space: pre; }
  .md .md-h { font-weight: 700; margin: 8px 0 2px; }
```

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run issue dig` → IS-DG1〜DG9 が PASS
Run: `./test/run issue` → すべて pass（IS-UL21 の `.note-stats` は掘るを読むの見出しの中で読める）
Run: `./test/run` → すべて pass

- [ ] **Step 7: 実データで目で確かめる**（1回だけ）— 作業用フォルダの `issue-now.js` で、「先方に確認」のカードの［掘るを読む］を開いた画面を撮って見る

- [ ] **Step 8: コミット**

```bash
git add web/issue/dig.js web/issue/list.js web/issue.html docs/specs/issue.md test/issue/dig.js
git commit -m "issue: ノートのカードに［掘るを読む］— 掘るの中身（箇条書き・番号・チェック・表・区切り・画像の名前・太字・コード・リンク）をその場で読む・注記は出さない・開いたまま覚える（IS-DG8・DG9）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 決定事項と仕上げ

**Files:**
- Modify: `docs/specs/issue.md`（決定事項に IS-Q25）・`CLAUDE.md`（チェック数）

- [ ] **Step 1: 決定事項を書く** — `docs/specs/issue.md` の末尾に:

```markdown
- **IS-Q25**（2026-10-02）: 段3。論点の行の下に **分かった・⏳ 待ち・伝えた**、［＋ 分かったこと］、「いま」の札に ⏳ 待ち、ノートのカードの［掘るを読む］。
  記法は増やさない — 論点の直後の字下げの箇条書き（閉じるときに「分かったこと」「伝えた: …」を書いている場所）を種類つきで読む。待ちは「待ち: 」で始める
  （利用者が画面イメージ第2案の書き方で合意）。書き足しは子の最後に、最初の子と同じ字下げで（タブに決め打ちしない）。
  ［掘るを読む］は md のプレビューを戻すのではなく（IS-Q 2026-09-24「今のプレビューは必要ない」）、カードの中で必要なときだけ開く最小の表示
```

- [ ] **Step 2: 全体を回して数を数える**

Run: `./test/run`
Expected: すべて pass。合計は 983 ＋ 9（IS-DG1〜DG9）＝ 992 になるはず（違えば実数）

- [ ] **Step 3: `CLAUDE.md` の数を直す** — 「**983チェックの検証機構が**」を Step 2 の実数に

- [ ] **Step 4: コミット**

```bash
git add docs/specs/issue.md CLAUDE.md
git commit -m "docs: Check Issue の段3（分かったこと・待ち・掘るを読む）の決定事項 IS-Q25（992チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
