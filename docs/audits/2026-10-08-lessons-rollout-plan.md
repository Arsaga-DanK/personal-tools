# 実装計画: Plan Tasks の教訓を他の7本に当てはめる（点検 2026-10-08 の全20件）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点検 `docs/audits/2026-10-08-lessons-rollout.md` の A（消える・壊れる 8件）・B（使い勝手 11件）・C（テスト 1件）を全部直す。利用者「じゃ全部お願い」。

**Architecture:** ツールごとに1タスク（Check Issue は3つに分ける）。各タスクは spec の行 → 落ちるテスト → 最小の実装 → そのツールのハーネス → 1コミット。既存の ID・URL・フックは変えない。共通部品（`lib/`）は足さない — 2本目が要る部品はまだ無い（coding-rules）。

**Tech Stack:** 素の JS（classic script・`file://`）、Playwright のハーネス（`./test/run <tool>`）

**Spec:** 点検の記録 `docs/audits/2026-10-08-lessons-rollout.md`（番号 #1〜#20 はそこ）。各ツールの契約は `docs/specs/<alias>.md` に足す行が正本。

## Global Constraints

- `file://` で動く。ES モジュール禁止。描画は `textContent` / `createElement` のみ。1ファイル 1,000 行以内（list.js 870・engine.js 680・mask.html 1,167＝分割済みでない → mask は +20 行まで。超えそうなら同名フォルダに分ける）
- **消えるより重複**: 失敗しても元のファイルの行は消さない。確認を挟むのは「戻せない置き換え」だけ
- **IME**: 文字を打つ欄に効く Enter／Esc は `isComposing || keyCode === 229` を除ける
- 日付の表示は `ToolEdit.fillDate`（年＋月/日＋曜日）、入力は `ToolEdit.dateChips`（今日/+1/+7）。コピーの中身は変えない（ISO のまま）
- コミットは1タスク1つ。日本語1行＋ `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- **vault には触れない**（テストは全部メモリかスタブのフォルダ）

## Review Focus

1. Check Issue の5段の組み直し（#1）: 前の行を**消さずに残す**が、同じ意味の行が2つに見えないか（型・見送った候補のような「ウィザードが作る注記」は作り直し、利用者が書いた行は残す）— IS-SF1
2. Check Vault のリネーム（#5）: 「移動だけ通ってリンクが切れる」「リンクだけ付け替わって無い名前を指す」の**両方**が起きない順序か — VL-F1
3. Check Issue のタブに戻ったときの読み直し（#10）: 打っている最中（モーダル・ウィザード・その場編集）には読み直さない・権限が切れていたら黙って何もしない — IS-SF7
4. Mask Image の画像差し替えの確認（#8）: 注釈が無いときは聞かない（今までどおり貼れる）— MK-U38
5. Convert Data の戻せるデコード（#14）: `execCommand('insertText')` が効かない環境では今までどおり値を入れる（壊れない）— DEV-55

---

### Task 1: Check Issue — 5段の組み直しと論点の書き換えで、前の行を消さない（#1・#2）

**Files:**
- Modify: `web/issue/engine.js`（`upsertFrame` → 中身を `mergeFrame` に・`setIssueLine`）
- Modify: `web/issue/wizard.js`（`wzWriteInto` のバナーに残した行数）
- Modify: `docs/specs/issue.md`（IS-SF1・SF2・IS-Q27）
- Create: `test/issue/safe.js`（節 `safe`・IS-SF1〜SF7 を順に足す）・Modify: `test/issue.js`（`SECTIONS` の末尾に `'safe'`）

**Interfaces:**
- Produces: `mergeFrame(text, md) → { text, kept: number }`（`upsertFrame(text, md)` は `mergeFrame(text, md).text` を返す薄い皮に）
- Produces: `setIssueLine(text, line)` の新しい契約 — `## 論点` の**中身のある最初の行**（`>`・`（` で始まらない行＝カードに出ている行）だけを置き換え、ほかの行は不変。無ければ見出しの直後に足す

- [ ] **Step 1: spec** — `docs/specs/issue.md` の「## テストケース」の表の末尾に:

```markdown
| IS-SF1 | 5段が既にあるノート（ゴールに2行目・最終形に2行・次の一手に2つ・`## 4. リスク` 1行）に［このノートに問いを立てる…］で最終形の文を変えて書き込む | **前の行は1行も消えない**: 最終形の2行目・次の一手の2つ目・リスクの節（5の後ろ）・ゴールの2行目が残り、変えた最終形が1行目。`> 型:`・`> 見送った候補:` は1つずつ（二重にならない）。バナーに「前からあった 5 行は残しました」 |
| IS-SF2 | `## 論点` に `- a`・`- b`・`> 注記` があるノートのカードで論点を `c` に直す | `- c`・`- b`・`> 注記` の順で残る（最初の中身の行だけ置き換え） |
```

  「## 決定事項」の末尾に:

```markdown
- **IS-Q27**（2026-10-08）: 既存ノートへの5段の書き込みは**置き換えではなく重ねる**（`mergeFrame`）。ウィザードは各節の1行目しか持てないので、置き換えると最終形の2行目・次の一手の2つ目・旧「リスク」が消えていた（点検 2026-10-08 #1 — 確認も戻しも無く「書き殴りはそのままです」と出ていた）。
  新しい節の行の後ろに、前からあった行のうち新しい節に無いものを残す。ウィザードが作る注記（`> 型:`・`> 見送った候補:`・`> 答えが出たら:`・`> 筋:`）と空の `- ` だけは作り直す。新しい md に無い節（リスク等）は5の後ろにそのまま。
  カードの論点の書き換え（`setIssueLine`）も同じ考えで、**カードに出ている1行だけ**を置き換える（#2 — 以前は節の `>` 以外を全部消していた）
```

- [ ] **Step 2: テスト** — `test/issue/safe.js`（ctx = `{ page, r, eq, fileUrl, SAMPLE_MD, ready, setValue }`。スタブのフォルダは `window.__fsa.files`。ノートを置く→［📂］→カード、の流れは `test/issue/ui.js` の IS-UL7 と同じ）:

```js
'use strict';
/* test/issue/safe.js — 節: 消えない・壊れない（Plan Tasks の教訓の横展開 — 点検 2026-10-08）
   入口: test/issue.js。照合する ID: IS-SF1〜SF7。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'safe',
  ids: 'IS-SF1〜SF7',
  async run(ctx) {
    const { page, r, eq, fileUrl } = ctx;
    await page.goto(fileUrl('web/issue.html'));
    const FRAMED = ['---', 'created: 2026-09-24', 'status: open', 'deadline: 2026-09-30', 'tags: [issue]', '---', '# 手順書', '',
      '## 1. ゴール', '', '> 型: ギャップフィル（あるべき姿は決まっている）', '- 運営が止められる（マイルストーン: 2026-10-02）', '- 補足のゴール行', '',
      '## 2. 論点', '', '- 手順書が書けないのは情報不足ではなく合意が無いからではないか', '> 見送った候補: 別案', '',
      '## 3. 最終形', '', '- 【表】粒度ごとの表', '- 先方の回答メモ', '',
      '## 4. サブイシュー', '', '| 粒度 | 表 | 聞く | PM | 2026-09-29 |', '',
      '## 5. 次の一手', '', '- [ ] 粒度を確認する 📅 2026-09-26', '- [ ] 2つ目のタスク', '',
      '## 4. リスク', '', '- 先方の返事が遅い', '',
      '## 掘る', '', '- TODO 書き殴り', ''].join('\n');
    const load = (files) => page.evaluate((fs) => {
      for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
      Object.assign(window.__fsa.files, fs);
      document.getElementById('pick-btn').click();
      return new Promise(res => setTimeout(res, 300));
    }, files);
    /* ---------- IS-SF1 ---------- */
    await load({ 'd.md': FRAMED });
    const sf1 = await page.evaluate(async () => {
      document.querySelector('.issue-card .ic-frame').click();
      const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      document.getElementById('wz-next').click();   // Step 2（ゴールは初期値のまま）
      document.getElementById('wz-next').click();   // Step 3
      set('#wz-picture', '粒度ごとに実行できたかの表');   // 最終形を変える
      document.getElementById('wz-next').click(); document.getElementById('wz-next').click();
      document.getElementById('wz-create').click();
      await new Promise(d => setTimeout(d, 400));
      const after = window.__fsa.files['d.md'];
      const count = (s) => after.split(s).length - 1;
      return { after, banner: document.getElementById('banner').textContent,
        kept: ['- 補足のゴール行', '- 先方の回答メモ', '- [ ] 2つ目のタスク', '- 先方の返事が遅い', '- TODO 書き殴り'].every(s => after.includes(s)),
        pictureFirst: after.indexOf('粒度ごとに実行できたかの表') < after.indexOf('- 先方の回答メモ'),
        riskAfterFive: after.indexOf('## 4. リスク') > after.indexOf('## 5. 次の一手'),
        kind: count('> 型:'), alt: count('> 見送った候補:') };
    });
    r.check('IS-SF1（5段の組み直しで前の行を消さない — 残す・変えた最終形が1行目・リスクは5の後ろ・注記は二重にならない・バナー）',
      sf1.kept && sf1.pictureFirst && sf1.riskAfterFive && sf1.kind === 1 && sf1.alt === 1 && sf1.banner.includes('前からあった 5 行は残しました'), JSON.stringify(sf1));
    /* ---------- IS-SF2 ---------- */
    const sf2 = await page.evaluate(() => (typeof setIssueLine === 'function')
      ? setIssueLine('# t\n\n## 論点\n\n- a\n- b\n> 注記\n\n## 掘る\n\n- x\n', 'c') : null);
    r.check('IS-SF2（setIssueLine: カードに出ている最初の行だけ置き換え、ほかの行は残る）',
      sf2 === '# t\n\n## 論点\n\n- c\n- b\n> 注記\n\n## 掘る\n\n- x\n', JSON.stringify(sf2));
  },
};
```

  `test/issue.js` の `SECTIONS` を `['pure', 'ui', 'cards', 'look', 'dig', 'tasks', 'safe']` に。

- [ ] **Step 3: RED** — Run: `./test/run issue safe` → IS-SF1・SF2 が FAIL（行が消える／`- b` が消える）

- [ ] **Step 4: 実装** — `web/issue/engine.js` の `upsertFrame` を次に置き換える:

```js
/* 5段のブロックを差し込む。既にあれば**重ねる**（IS-Q27・2026-10-08）: 新しい節の行の後ろに、前からあった行のうち新しい節に無いものを残す。
   ウィザードが作る注記（型・見送った候補・答えが出たら・筋）と空の `- ` だけは作り直す。新しい md に無い節（リスク等）は5の後ろへそのまま。
   以前は範囲ごと置き換えていて、最終形の2行目・次の一手の2つ目・旧リスクが消えていた（点検 #1）。書き殴り（枠の外）には一切触らない */
const FRAME_NOTE_RE = /^>\s*(型|見送った候補|答えが出たら|筋)\s*[:：]/;
function frameSections(lines) {   // [{ head: 見出し行 or null, key: 'ゴール' 等, body: [] }]
  const out = [];
  let cur = { head: null, key: '', body: [] };
  for (const l of lines) {
    const m = /^#{1,6}\s*(?:\d+[.．]?\s*)?(.+?)\s*$/.exec(l);
    if (m) { out.push(cur); cur = { head: l, key: nfc(m[1]), body: [] }; continue; }
    cur.body.push(l);
  }
  out.push(cur);
  return out.filter(s => s.head !== null || s.body.some(x => x.trim() !== ''));
}
const frameKeyOf = (s) => nfc(s).replace(/[.．]/g, '').replace(/\s+/g, ' ').replace(/^- (\[[ xX]\] )?/, '').replace(/\s*\u{1F4C5}\s*\d{4}-\d{2}-\d{2}/u, '').trim();
function mergeFrame(text, md) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  const block = nfc(md).replace(/\s*$/, '').split('\n');
  const r = frameRange(lines);
  if (!r) {
    const at = topOfBody(lines, t);
    lines.splice(at, 0, ...[''].concat(block, ['']));
    return { text: lines.join('\n'), kept: 0 };
  }
  const olds = frameSections(lines.slice(r[0], r[1]));
  const news = frameSections(block);
  const out = [];
  let kept = 0;
  const seen = new Set();
  for (const n of news) {
    out.push(n.head, ...n.body);
    const have = new Set(n.body.map(frameKeyOf).filter(Boolean));
    const hasTable = n.body.some(x => /^\|/.test(x));
    const o = olds.find(s => s.key === n.key && !seen.has(s));
    if (!o) continue;
    seen.add(o);
    const extra = [];
    for (const l of o.body) {
      const k = frameKeyOf(l);
      if (k === '' || FRAME_NOTE_RE.test(l) || have.has(k)) continue;
      if (hasTable && (/^\|\s*-+/.test(l) || /^\|\s*サブイシュー/.test(l))) continue;   // 表の見出し行と区切りは作り直す
      extra.push(l);
    }
    if (extra.length) {
      while (out.length && out[out.length - 1] === '') out.pop();   // 節末の空行の前に入れる
      out.push(...extra, '');
      kept += extra.length;
    }
  }
  for (const o of olds) {   // 新しい md に無い節（リスク等）はそのまま後ろへ
    if (seen.has(o) || o.head === null) continue;
    out.push(o.head, ...o.body);
    kept += o.body.filter(x => x.trim() !== '').length;
  }
  if (out[out.length - 1] !== '') out.push('');
  lines.splice(r[0], r[1] - r[0], ...out);
  return { text: lines.join('\n'), kept };
}
function upsertFrame(text, md) { return mergeFrame(text, md).text; }
```

  `setIssueLine` の `if (i >= 0) { … }` を次に:

```js
  if (i >= 0) {
    let end = i + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end]) && lines[end].trim() !== '---') end++;
    // カードに出ている行（中身のある最初の行 — summarize の issueLine と同じ条件）だけを置き換える。ほかの行は残す（IS-SF2）
    for (let k = i + 1; k < end; k++) {
      const s = stripBullet(lines[k]);
      if (s !== '' && !/^[>（(]/.test(s)) { lines[k] = '- ' + nfc(line).trim(); return lines.join('\n'); }
    }
    lines.splice(i + 1, 0, '', '- ' + nfc(line).trim());   // 中身の行が無ければ見出しの直後に
    return lines.join('\n');
  }
```

  `web/issue/wizard.js` の `wzWriteInto`: `let next = upsertFrame(cur, buildMd(draft));` → `const merged = mergeFrame(cur, buildMd(draft)); let next = merged.text;`、バナーを `it.title + ' に問いを立てました（書き殴りはそのままです' + (merged.kept ? '・前からあった ' + merged.kept + ' 行は残しました' : '') + '）'` に

- [ ] **Step 5: GREEN** — Run: `./test/run issue safe` → PASS。Run: `./test/run issue` → すべて pass（IS-UL6・UL7・IS-01 も — `stripBullet` の `- ` を落とす挙動は変えない）
- [ ] **Step 6: コミット** — `git commit -m "issue: 5段の組み直しと論点の書き換えで前の行を消さない（重ねる — 点検 #1・#2・IS-SF1・SF2・IS-Q27）"`

---

### Task 2: Check Issue — 変換中の Esc・モーダルの中の Cmd+Enter・打ったまま離れる（#3・#4・#16）

**Files:** `web/issue/wizard.js`（Esc）・`web/issue/ui.js`（Cmd+Enter・beforeunload）・`docs/specs/issue.md`（IS-SF3〜SF5）・`test/issue/safe.js`

- [ ] **Step 1: spec** — 表に:

```markdown
| IS-SF3 | 閉じるモーダルの「分かったこと」を変換中（`isComposing`）に Esc／ウィザードの欄で変換中に Esc | **閉じない**（変換の取り消しに使われる）。変換していない Esc は今どおり閉じる |
| IS-SF4 | 閉じるモーダルを開いて Cmd+Enter／ウィザードを開いて Cmd+Enter | 閉じるモーダルは［閉じる］が押される（`status: closed`）・ウィザードは［次へ］（最後の段は［作成］）。**貼り付け欄からの作成は走らない**（`無題.md` ができない） |
| IS-SF5 | 閉じるモーダルに文を打った状態／ウィザードに書いた状態で `beforeunload` | `preventDefault` される（離れる前に聞く）。閉じた後・空のときは何もしない |
```

  決定事項に `- **IS-Q28**（2026-10-08）: Esc は変換中を除ける（TB-Q9 と同型）。モーダルが開いている間の Cmd+Enter はそのモーダルの確定（Plan Tasks の編集画面と同じ）。打っている最中に離れるときは聞く（beforeunload — TB-Q61）`

- [ ] **Step 2: テスト** — `safe.js` に:

```js
    /* ---------- IS-SF3〜SF5 ---------- */
    await load({ 'd.md': FRAMED });
    const sf3 = await page.evaluate(async () => {
      const esc = (target, composing) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: composing }));
      document.querySelector('.issue-card .ic-close').click();   // 閉じる…（ボタンの class は実装時に list.js で確かめる）
      const note = document.getElementById('cm-note'); note.value = '分かった'; note.dispatchEvent(new Event('input', { bubbles: true }));
      esc(note, true); const stillOpen = !document.getElementById('close-modal').hidden;
      const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); const asked = ev.defaultPrevented;
      esc(note, false); const closed = document.getElementById('close-modal').hidden;
      const ev2 = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev2);
      document.querySelector('.issue-card .ic-frame').click();
      const first = document.querySelector('#wz-body textarea, #wz-body input');
      esc(first, true); const wzOpen = !document.getElementById('wizard').hidden;
      esc(first, false);
      return { stillOpen, asked, closed, notAsked: !ev2.defaultPrevented, wzOpen, wzClosed: document.getElementById('wizard').hidden };
    });
    r.check('IS-SF3（変換中の Esc では閉じない・ふつうの Esc は閉じる）', sf3.stillOpen && sf3.closed && sf3.wzOpen && sf3.wzClosed, JSON.stringify(sf3));
    r.check('IS-SF5（打っている最中の beforeunload は止める・閉じたら止めない）', sf3.asked && sf3.notAsked, JSON.stringify(sf3));
    const sf4 = await page.evaluate(async () => {
      const cmdEnter = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
      const filesBefore = Object.keys(window.__fsa.files).length;
      document.querySelector('.issue-card .ic-frame').click();
      const step0 = document.getElementById('wz-step').textContent;
      cmdEnter(); await new Promise(d => setTimeout(d, 100));
      const step1 = document.getElementById('wz-step').textContent;
      document.getElementById('wz-close').click();
      document.querySelector('.issue-card .ic-close').click();
      cmdEnter(); await new Promise(d => setTimeout(d, 400));
      return { advanced: step0 !== step1, closed: /status: closed/.test(window.__fsa.files['d.md']), files: Object.keys(window.__fsa.files).length - filesBefore };
    });
    r.check('IS-SF4（モーダルの中の Cmd+Enter はそのモーダルの確定・貼り付け欄からの作成は走らない）', sf4.advanced && sf4.closed && sf4.files === 0, JSON.stringify(sf4));
```

- [ ] **Step 3: RED** — `./test/run issue safe` → SF3・SF4・SF5 FAIL
- [ ] **Step 4: 実装**
  - `wizard.js` の Esc: `if (e.key !== 'Escape') return;` の次に `if (e.isComposing || e.keyCode === 229) return;   // 変換の取り消しに使われる Esc（TB-Q9 と同型 — IS-SF3）`
  - `ui.js` の Cmd+Enter: `if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {` の中を:

```js
    e.preventDefault();
    // モーダルが開いている間はそのモーダルの確定（Plan Tasks の編集画面と同じ）。以前は貼り付け欄からの作成が走り「無題」のノートができた（IS-SF4）
    if (!$id('close-modal').hidden) { $id('cm-ok').click(); return; }
    if (!$id('wizard').hidden) { ($id('wz-create').hidden ? $id('wz-next') : $id('wz-create')).click(); return; }
    $id(fsaAvailable() ? 'create-btn' : 'copy-btn').click();
```

  - `ui.js` の末尾付近に:

```js
// 打っている最中に離れるときは聞く（TB-Q61 と同じ — IS-SF5）。下書きはメモリにしかない
function hasUnsavedTyping() {
  if (!$id('close-modal').hidden && ($id('cm-note').value.trim() !== '' || $id('cm-told').value.trim() !== '')) return true;
  if (!$id('wizard').hidden && Array.from(document.querySelectorAll('#wz-body textarea, #wz-body input[type="text"]')).some(x => x.value.trim() !== '')) return true;
  return Array.from(document.querySelectorAll('#cards .ic-edit')).some(x => (x.value || '').trim() !== '');
}
window.addEventListener('beforeunload', e => { if (hasUnsavedTyping()) e.preventDefault(); });
```

- [ ] **Step 5: GREEN** — `./test/run issue` → すべて pass（IS-U6「Cmd+Enter で作成」はモーダルが閉じているので今どおり・IS-U17 はふつうの Esc）
- [ ] **Step 6: コミット** — `issue: 変換中の Esc で閉じない・モーダルの中の Cmd+Enter はそのモーダルの確定・打ったまま離れるときは聞く（点検 #3・#4・#16・IS-SF3〜SF5・IS-Q28）`

---

### Task 3: Check Issue — フォルダを選び直せる・タブに戻ったら読み直す（#9・#10）

**Files:** `web/issue.html`（⋯ にフォルダ名と［別のフォルダを選ぶ］）・`web/issue/list.js`（表示・選び直し・focus で読み直し）・`docs/specs/issue.md`（IS-SF6・SF7）・`test/issue/safe.js`

- [ ] **Step 1: spec**

```markdown
| IS-SF6 | フォルダを読んだあと ⋯ を開く／［別のフォルダを選ぶ］ | ⋯ に「フォルダ: <名前>」が出る。押すとピッカーが出て、選んだフォルダで読み直す（権限があっても選び直せる） |
| IS-SF7 | ノートを外（スタブ）で書き換えてタブに戻る（`focus`）／閉じるモーダルを開いたまま戻る | カードが新しい中身になる／打っている最中は読み直さない。2秒以内の連続は1回 |
```

  決定事項に `- **IS-Q29**（2026-10-08）: 覚えたフォルダは名前を出し、⋯ から選び直せる（間違えて vault のルートを選ぶと権限を拒否する以外に抜け出せなかった — 点検 #9）。タブに戻ったら読み直す（Plan Tasks の checkExternal と同じ。モーダル・ウィザード・その場編集の間は読み直さない・権限が無ければ黙って何もしない — #10）`

- [ ] **Step 2: テスト**

```js
    /* ---------- IS-SF6・SF7 ---------- */
    await load({ 'd.md': FRAMED });
    const sf6 = await page.evaluate(async () => {
      const name = document.getElementById('dir-name').textContent;
      const before = window.__fsa.picked;
      document.getElementById('repick-btn').click();
      await new Promise(d => setTimeout(d, 300));
      return { name, picked: window.__fsa.picked - before, hidden: document.getElementById('repick-btn').hidden };
    });
    r.check('IS-SF6（⋯ にフォルダ名・［別のフォルダを選ぶ］でピッカー）', sf6.name.includes('Issues') && sf6.picked === 1 && !sf6.hidden, JSON.stringify(sf6));
    const sf7 = await page.evaluate(async () => {
      const titleOf = () => (document.querySelector('.issue-card .note-name') || {}).textContent || '';
      window.__fsa.files['d.md'] = window.__fsa.files['d.md'].replace('# 手順書', '# 手順書（外で直した）');
      window.dispatchEvent(new Event('focus')); await new Promise(d => setTimeout(d, 300));
      const updated = titleOf().includes('外で直した');
      document.querySelector('.issue-card .ic-close').click();
      window.__fsa.files['d.md'] = window.__fsa.files['d.md'].replace('外で直した', 'さらに直した');
      await new Promise(d => setTimeout(d, 2100));
      window.dispatchEvent(new Event('focus')); await new Promise(d => setTimeout(d, 300));
      const notWhileTyping = !titleOf().includes('さらに直した');
      document.getElementById('cm-cancel').click();
      return { updated, notWhileTyping };
    });
    r.check('IS-SF7（タブに戻ったら読み直す・打っている最中は読み直さない）', sf7.updated && sf7.notWhileTyping, JSON.stringify(sf7));
```

- [ ] **Step 3: RED** → SF6・SF7 FAIL
- [ ] **Step 4: 実装**
  - `issue.html` の `#issue-more .more-panel` の `vault 名` の行の次に `<span class="more-row" id="dir-name" hidden></span>` と `<button id="repick-btn" type="button" hidden title="04_Issues を選び直します（間違ったフォルダを覚えていたとき）">別のフォルダを選ぶ</button>`
  - `list.js` の `loadIssues`: 読めたら `$id('dir-name').textContent = 'フォルダ: ' + dir.name; $id('dir-name').hidden = false; $id('repick-btn').hidden = false;`（`res.over` の warn にも `'（' + dir.name + '）'` を足し、同じく出す）
  - `list.js` の末尾: `$id('repick-btn').addEventListener('click', function () { dirHandle = null; loadIssues(true); });`
  - `list.js` に:

```js
// タブに戻ったら読み直す（Plan Tasks の checkExternal と同じ — IS-SF7）。打っている最中は読み直さない・権限が無ければ黙って何もしない
let lastExternalCheck = 0;
async function checkExternal() {
  if (!dirHandle || Date.now() - lastExternalCheck < 2000) return;
  lastExternalCheck = Date.now();
  if (!$id('close-modal').hidden || !$id('wizard').hidden || document.querySelector('#cards .ic-edit')) return;
  try { if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') return; } catch (_) { return; }
  await loadIssues(false);
}
window.addEventListener('focus', checkExternal);
document.addEventListener('visibilitychange', function () { if (!document.hidden) checkExternal(); });
```

- [ ] **Step 5: GREEN** — `./test/run issue` → すべて pass
- [ ] **Step 6: コミット** — `issue: ⋯ にフォルダ名と［別のフォルダを選ぶ］・タブに戻ったら読み直す（点検 #9・#10・IS-SF6・SF7・IS-Q29）`

---

### Task 4: Check Vault — リネームは組で・失敗しても止まらない・上書きしない・古いスキャンが勝たない・コミット確認を戻す（#5・#6・#7・#17・#18）

**Files:** `web/vaultlint/fix.js`（`planRename`・`applyFixes`）・`web/vaultlint/fsa.js`（`fsaAdapter.move`・`runScan`・`executeFixes`）・`web/vaultlint.html`（テスト用フックに `runScan`・`fsaAdapter`）・`docs/specs/vaultlint.md`（VL-F1〜F5・VL-Q16）・`test/vaultlint.js`

**Interfaces:**
- Produces: `plan.moves[i].linked`（リネームでリンクを付け替えるファイルのパス一覧。`archiveDaily`／`archiveIssue` には無い）
- Produces: `applyFixes` の順序 — ①全書き込み対象を読み直して外部変更を記録 ②移動（リンク元が変わっていたリネームは行わない。失敗したらそのリンク元の書き込みも行わない）③書き込み（直前にもう一度読み直す・失敗は1件ずつスキップ）
- Produces: `runScan(handle)`・`window.vaultlint.test.runScan`・`window.vaultlint.fsaAdapter`

- [ ] **Step 1: spec** — 表に:

```markdown
| VL-F1 | rename の計画で、リンク元2つのうち1つがスキャン後に外部で変わった（メモリ） | **移動しない**（スキップ理由に「リンク元」）・もう1つのリンク元も書かない（名前が変わらないので）。両方そのままなら移動して2つとも書く。移動が失敗したときもリンク元は書かない |
| VL-F2 | 書き込みの2件目が例外を投げる | その1件だけスキップ（理由「書き込みに失敗」）・残りは実行される・ログが出る |
| VL-F3 | `fsaAdapter.move` で移動先に同名がある（スタブのハンドル） | 例外「移動先に同名があります」・コピーも削除もしない。無ければ今どおり |
| VL-F4 | スキャンが遅い A を選び、終わる前に B を選ぶ | 画面も書き込み先も B（A の結果は捨てる） |
| VL-F5 | 修復を実行した後 | 「コミット済み」のチェックが外れる（次も確認が要る） |
```

  決定事項に `- **VL-Q16**（2026-10-08）: 修復の実行は「消えるより重複」に倒す（Plan Tasks の TB-Q75 と同じ）。リネームはリンク元の書き込みと組にし、片方だけ通さない（以前は書き込みを全部してから移動していて、リンク元が1つ外部で変わっただけでリンクが切れ、次の修復の既定「テキスト化」で文字になった — 点検 #5）。書き込みの例外は1件ずつスキップ（#6）。移動先に同名があれば上書きしない（#7 — memoryAdapter だけが止めていて、FSA は上書きして元を消していた）。新しいスキャンが前のスキャンに勝つ（#17）。実行したらコミット済みのチェックを外す（#18）`

- [ ] **Step 2: テスト** — `test/vaultlint.js` の VL-19 の後に:

```js
  /* ========== VL-F1〜F5（点検 2026-10-08 — 消えるより重複） ========== */
  const f1 = await page.evaluate(async () => {
    const files = [{ path: 'React  Vite.md', text: '# a' }, { path: 'x.md', text: '[[React  Vite]]' }, { path: 'y.md', text: '[[React  Vite|別名]]' }];
    const sel = [{ type: 'rename', from: 'React  Vite.md', to: 'React Vite.md' }];
    const run = async (disk, moveFails) => {
      const plan = window.vaultlint.planFixes(files, sel);
      const written = [], moved = [];
      const res = await window.vaultlint.applyFixes(files, plan, {
        read: async p => (disk.has(p) ? disk.get(p) : null), write: async (p, t) => { written.push(p); disk.set(p, t); },
        move: async (f, t) => { if (moveFails) throw new Error('だめ'); moved.push([f, t]); } });
      return { linked: (plan.moves[0] || {}).linked, written, moved, skipped: res.skipped.map(s => s.path + ':' + s.reason.slice(0, 6)) };
    };
    return { stale: await run(new Map([['React  Vite.md', '# a'], ['x.md', '[[React  Vite]]'], ['y.md', '外で変わった']])),
      fresh: await run(new Map(files.map(f => [f.path, f.text]))),
      moveFail: await run(new Map(files.map(f => [f.path, f.text])), true) };
  });
  r.check('VL-F1（リネームは組で: リンク元が変わっていたら移動しない・両方そのままなら移動して書く・移動が失敗したらリンク元も書かない）',
    eq(f1.stale.linked, ['x.md', 'y.md']) && f1.stale.moved.length === 0 && f1.stale.written.length === 0 && f1.stale.skipped.length === 3
    && f1.fresh.moved.length === 1 && eq(f1.fresh.written, ['x.md', 'y.md'])
    && f1.moveFail.moved.length === 0 && f1.moveFail.written.length === 0 && f1.moveFail.skipped.length === 3, JSON.stringify(f1));
  const f2 = await page.evaluate(async () => {
    const files = [{ path: 'a.md', text: '[[c]]' }, { path: 'b.md', text: '[[c]]' }, { path: 'd.md', text: '[[c]]' }];
    const plan = window.vaultlint.planFixes(files, files.map(f => ({ type: 'textify', file: f.path, line: 1, target: 'c' })));
    const disk = new Map(files.map(f => [f.path, f.text])); const written = [];
    const res = await window.vaultlint.applyFixes(files, plan, { read: async p => disk.get(p), write: async (p) => { if (p === 'b.md') { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; } written.push(p); }, move: async () => {} });
    return { written, skipped: res.skipped.map(s => s.path + ':' + s.reason.slice(0, 7)) };
  });
  r.check('VL-F2（書き込みの例外は1件だけスキップして残りを続ける）', eq(f2.written, ['a.md', 'd.md']) && eq(f2.skipped, ['b.md:書き込みに失敗']), JSON.stringify(f2));
  const f3 = await page.evaluate(async () => {
    if (!window.vaultlint.fsaAdapter) return null;
    const nf = () => { const e = new Error('nf'); e.name = 'NotFoundError'; return e; };
    const mk = (files) => { const dir = { files, removed: [], getDirectoryHandle: async () => dir,
      getFileHandle: async (n, o) => { if (!(n in files)) { if (o && o.create) files[n] = ''; else throw nf(); }
        return { getFile: async () => ({ text: async () => files[n], size: files[n].length }), createWritable: async () => ({ write: async t => { files[n] = typeof t === 'string' ? t : 'copy'; }, close: async () => {} }) }; },
      removeEntry: async n => { dir.removed.push(n); delete files[n]; } }; return dir; };
    const a = mk({ 'a.md': 'A', 'b.md': 'B' }); let err = null;
    try { await window.vaultlint.fsaAdapter(a).move('a.md', 'b.md'); } catch (e) { err = e.message; }
    const b = mk({ 'a.md': 'A' }); await window.vaultlint.fsaAdapter(b).move('a.md', 'c.md');
    return { err, kept: a.files['a.md'] === 'A' && a.files['b.md'] === 'B' && a.removed.length === 0, moved: !('a.md' in b.files) && 'c.md' in b.files };
  });
  r.check('VL-F3（FSA の移動は移動先に同名があれば上書きしない）', !!f3 && /同名/.test(f3.err) && f3.kept && f3.moved, JSON.stringify(f3));
  const f4 = await page.evaluate(async () => {
    if (!window.vaultlint.test.runScan) return null;
    const dir = (name, text, delay) => ({ name, requestPermission: async () => 'granted', values: async function* () {
      await new Promise(d => setTimeout(d, delay)); yield { kind: 'file', name: name + '.md', getFile: async () => ({ text: async () => text }) }; } });
    window.vaultlint.test.setConfig({ privateDirs: ['91_Private'] });
    const pA = window.vaultlint.test.runScan(dir('A', '[[zzz]]', 300)), pB = window.vaultlint.test.runScan(dir('B', '# ok', 50));
    await Promise.all([pA, pB]); await new Promise(d => setTimeout(d, 50));
    return { summary: document.getElementById('summary').textContent, adapterIsB: window.vaultlint.test.adapterRoot() === 'B' };
  });
  r.check('VL-F4（遅いスキャン A のあとに B を選んだら、画面も書き込み先も B）', !!f4 && f4.summary.includes('問題 0 件') && f4.adapterIsB, JSON.stringify(f4));
  const f5 = await page.evaluate(async () => {
    window.confirm = () => true;
    window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }, { path: 'b.md', text: '' }], '2026-08-14');
    document.querySelector('select.fix-select').value = 'deleteLine';
    document.getElementById('commit-confirm').checked = true;
    document.getElementById('fix-btn').click(); await new Promise(d => setTimeout(d, 150));
    return document.getElementById('commit-confirm').checked;
  });
  r.check('VL-F5（実行したらコミット済みのチェックが外れる）', f5 === false, JSON.stringify(f5));
```

- [ ] **Step 3: RED** — `./test/run vaultlint` → F1〜F5 FAIL（F3/F4 は `null`）
- [ ] **Step 4: 実装**
  - `fix.js` `planRename`: `moves.push({ from: sel.from, to: sel.to });` → `const mv = { from: sel.from, to: sel.to, linked: [] }; moves.push(mv);` とし、リンク元を書き換えた箇所（`changed` が true で `texts.set` するところ）で `mv.linked.push(f.path)`
  - `fix.js` `applyFixes` を次に:

```js
async function applyFixes(files, plan, adapter) {
  const orig = new Map(files.map(f => [f.path, typeof f.text === 'string' ? f.text : null]));
  const results = { written: [], moved: [], skipped: plan.skipped.slice() };
  const msg = e => (e && e.message ? e.message : String(e));
  // ① 書き込み対象を全部読み直して、スキャン後に外部で変わったものを先に知る（リネームと組にするため — VL-F1）
  const stale = new Set();
  for (const w of plan.writes) {
    const now = await adapter.read(w.path);
    const was = orig.get(w.path);
    if (now === null || was === null || now.normalize('NFC') !== was.normalize('NFC')) {
      stale.add(w.path);
      results.skipped.push({ path: w.path, reason: 'スキャン後に外部で変更されています（再スキャンしてください）' });
    }
  }
  // ② 移動。リネームはリンク元の書き込みと組（片方だけ通すとリンクが切れる／無い名前を指す — VL-Q16）
  const dropped = new Set();
  for (const mv of plan.moves) {
    const linked = mv.linked || [];
    const bad = linked.filter(p => stale.has(p));
    if (bad.length) {
      results.skipped.push({ path: mv.from, reason: 'リンク元（' + bad.join('・') + '）がスキャン後に変わったので、名前の変更は行いません（再スキャンしてください）' });
      for (const p of linked) dropped.add(p);
      continue;
    }
    try { await adapter.move(mv.from, mv.to); results.moved.push(mv); }
    catch (e) {
      results.skipped.push({ path: mv.from, reason: '移動に失敗しました: ' + msg(e) });
      for (const p of linked) dropped.add(p);
    }
  }
  // ③ 書き込み。直前にもう一度読み直す（VL-19）。失敗は1件ずつスキップして残りを続ける（VL-F2）
  for (const w of plan.writes) {
    if (stale.has(w.path)) continue;
    if (dropped.has(w.path)) { results.skipped.push({ path: w.path, reason: '名前の変更を行わなかったので、このファイルの書き換え（リンクの付け替えを含む）も行いません' }); continue; }
    const now = await adapter.read(w.path);
    if (now === null || now.normalize('NFC') !== orig.get(w.path).normalize('NFC')) { results.skipped.push({ path: w.path, reason: 'スキャン後に外部で変更されています（再スキャンしてください）' }); continue; }
    try { await adapter.write(w.path, w.after); results.written.push(w.path); }
    catch (e) { results.skipped.push({ path: w.path, reason: '書き込みに失敗しました: ' + msg(e) }); }
  }
  return results;
}
```

  - `fsa.js` `fsaAdapter.move`: `const dst = await getDirByPath(root, to, { create: true });` の次に:

```js
      // 移動先に同名があれば上書きしない（memoryAdapter と同じ — VL-F3。APFS は大文字小文字を区別しないので、元と同じファイルもここで止まる）
      let exists = true;
      try { await dst.dir.getFileHandle(dst.name); } catch (e) { if (e && e.name === 'NotFoundError') exists = false; else throw e; }
      if (exists) throw new Error('移動先に同名があります: ' + to);
```

  - `fsa.js` `runScan` を `runScan(handle)` に（新しいスキャンが勝つ — VL-F4）:

```js
let scanSeq = 0;
async function runScan(handle) {
  const h = handle || dirHandle;
  const seq = ++scanSeq;
  showBanner('info', 'スキャン中…');
  try {
    const { files, excluded } = await scanVault(h);
    if (seq !== scanSeq) return;   // そのあとに別のフォルダを選んだ — 古い結果は捨てる
    showBanner('info', '');
    render(lint(files, todayStr()), excluded, files);
    currentAdapter = fsaAdapter(h);
    requestWrite = async () => (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
    rescanFn = () => runScan(h);
    el('rescan').hidden = false;
  } catch (e) {
    if (seq === scanSeq) showBanner('error', 'スキャンに失敗しました: ' + (e && e.message ? e.message : String(e)));
  }
}
```

    `pick` の `await runScan();` → `await runScan(dirHandle);`、`rescan` → `runScan(dirHandle)`。`fsaAdapter` に `root` を覚える `_root: root` を足す（テストが書き込み先を見る）
  - `fsa.js` `executeFixes`: `renderRunLog(plan, results);` の次に `el('commit-confirm').checked = false;   // 次の実行も確認が要る（VL-F5）`
  - `vaultlint.html` の `window.vaultlint` に `fsaAdapter,` と `test` に `runScan,`・`adapterRoot: () => currentAdapter && currentAdapter._root && currentAdapter._root.name,`

- [ ] **Step 5: GREEN** — `./test/run vaultlint` → すべて pass（VL-18・VL-19・VL-U5 も）
- [ ] **Step 6: コミット** — `vaultlint: 修復は消えるより重複に — リネームはリンク元と組・書き込みの失敗は1件ずつ・移動先に同名があれば上書きしない・新しいスキャンが勝つ・実行したらコミット確認を戻す（点検 #5〜#7・#17・#18・VL-F1〜F5・VL-Q16）`

---

### Task 5: Mask Image・Sort Ideas — 画像の差し替えに確認・変換中の Esc・本物のマウスでドラッグを検証（#8・#19・#20）

**Files:** `web/mask.html`・`web/board.html`・`docs/specs/mask.md`（MK-U38〜U40・MK-Q23）・`docs/specs/board.md`（BD-U14・U15・決定事項に日付つきの1行）・`test/mask.js`・`test/board.js`

- [ ] **Step 1: spec** — mask の表に:

```markdown
| MK-U38 | 注釈が2件ある状態で画像を貼る（`confirm` を false／true にスタブ） | false: 画像も注釈もそのまま。true: 差し替わり注釈は消える。**注釈が無いときは聞かない** |
| MK-U39 | 文字の編集中に変換中（`isComposing`）の Esc／選択中に変換中の Esc | 編集は閉じず、選択も外れない（変換の取り消しに使われる） |
| MK-U40 | 本物のマウス（`page.mouse`）で矩形ツールをドラッグ | 注釈が1件できる（合成イベントでは「つかめない」を見逃す — TB-K23 と同じ） |
```

  board の表に:

```markdown
| BD-U14 | 付箋を選んで変換中（`isComposing`）の Esc | 選択が外れない |
| BD-U15 | 本物のマウス（`page.mouse`）で付箋をドラッグ | 付箋の位置が動く（合成イベントでは「つかめない」を見逃す） |
```

  決定事項: mask に `- **MK-Q23**（2026-10-08）: 画像の差し替え（貼る・開く・落とす）は、注釈があるときだけ確認する（注釈と戻す記録が全部消え、戻せなかった — 点検 #8。切り抜きの確認と同じ作法）。文書の Esc は変換中を除ける（#19）`、board に `- 2026-10-08: 文書の Esc は変換中を除ける（点検 #19）。ドラッグは本物のマウスでも検証する（#20）`

- [ ] **Step 2: テスト** — mask: `test/mask.js` の MK-U37 の後に（fixture の作り方は MK-U1 と同じ `window.mask.setImage(...)`）:

```js
  const u38 = await page.evaluate(async () => {
    window.mask.clearOps(); window.mask.addOp({ type: 'fill', x: 10, y: 10, w: 30, h: 30 }); window.mask.addOp({ type: 'fill', x: 50, y: 50, w: 10, h: 10 });
    const paste = () => { const dt = new DataTransfer(); const c = document.createElement('canvas'); c.width = 40; c.height = 40;
      return new Promise(res => c.toBlob(b => { dt.items.add(new File([b], 'p.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); setTimeout(res, 300); })); };
    let asked = 0; window.confirm = () => { asked++; return false; };
    await paste(); const keptOps = window.mask.opsCount(), keptSize = window.mask.size();
    window.confirm = () => { asked++; return true; };
    await paste(); const replaced = window.mask.size();
    window.mask.clearOps(); asked = 0; await paste();
    return { keptOps, keptW: keptSize.w, replacedW: replaced.w, askedNoOps: asked };
  });
  r.check('MK-U38（注釈があるときだけ差し替えを確認: いいえ→そのまま・はい→差し替え・注釈なしは聞かない）',
    u38.keptOps === 2 && u38.keptW === 100 && u38.replacedW === 40 && u38.askedNoOps === 0, JSON.stringify(u38));
```

    MK-U39（文字ツールで編集を開き `editor` に `isComposing: true` の Escape → `editor.hidden === false`。選択してから document に composing Esc → `window.mask.selectedCount()` 不変 — フック `selectedCount: () => selected.size` を足す）、MK-U40（`page.mouse.move/down/move(steps)/up` を canvas の座標で → `opsCount() === 1`。座標は `canvas.getBoundingClientRect()` を evaluate で取る。`test/taskboard/arrange.js:137` と同じ形）
  - board: BD-U14（付箋を1つ選んで document に composing Esc → 選択数不変。フック `window.board.test.selectedCount` が無ければ足す）、BD-U15（付箋の中心から `page.mouse` で +140,+100 動かす → その付箋の x/y が増える。フックは `window.board.test` の既存の付箋一覧を使う — 実装時に `grep -n "window.board" web/board.html` で確かめる）

- [ ] **Step 3: RED** — `./test/run mask`・`./test/run board` → U38・U39・BD-U14 FAIL（U40・BD-U15 は今も通るはず＝回帰の網。通ることを確かめて残す）
- [ ] **Step 4: 実装**
  - `mask.html` `loadBlob`: 先頭に `if (hasImage && ops.length > 0 && !confirm('注釈が ' + ops.length + ' 件あります。画像を差し替えると注釈は消えます（戻せません）。差し替えますか？')) return;`
  - `mask.html` document の keydown: `if (e.key === 'Escape' && (cropPending || cropDrag))` の前に `if (e.key === 'Escape' && (e.isComposing || e.keyCode === 229)) return;   // 変換の取り消しに使われる Esc（点検 #19）`
  - `board.html` document の keydown の `if (e.key === 'Escape') {` の中の先頭に同じ1行
  - フック: `window.mask.selectedCount = () => selected.size`、board も同様

- [ ] **Step 5: GREEN** — `./test/run mask`・`./test/run board` → すべて pass。mask.html の行数が 1,000 を超えたら `test/run` の警告どおり分割する（超えない見込み: +6 行）
- [ ] **Step 6: コミット** — `mask/board: 画像の差し替えは注釈があるときだけ確認・変換中の Esc で選択を外さない・ドラッグを本物のマウスで検証（点検 #8・#19・#20・MK-U38〜U40・BD-U14・U15・MK-Q23）`

---

### Task 6: Calc Dates — 古い設定で壊れない・日付のチップと表示・黙って計算しない（#11・#12・#15）

**Files:** `web/dates.html`・`docs/specs/dates.md`（DT-U8〜U10・DT-U1 の期待・DT-Q4）・`test/dates.js`

- [ ] **Step 1: spec**

```markdown
| DT-U8 | `tools:dates` に `biz-dir: 'x'`・`ef-unit: '人時'`（今の選択肢に無い）を入れて開く | select は既定（後／人日）に戻り、営業日は「後」で計算される（空の select で黙って逆向きに計算しない） |
| DT-U9 | 日付欄4つ | それぞれに 今日/+1/+7 のチップが付き、+1 で結果が変わる |
| DT-U10 | 範囲の開始 > 終了／係数を 0 や空に | warn「範囲の開始が終了より後です」／warn「係数が空か 0 なので既定（8時間・20日）で計算しています」 |
```

  DT-U1 の期待を「結果に `2026/9/24(木)` を含む（表示は `ToolEdit.fillDate`・title が `2026-09-24`）。コピーは `2026-09-24（木）` のまま」に。決定事項 `- **DT-Q4**（2026-10-08）: 保存した設定は今の選択肢にある値だけ戻す（TB-Q17）。日付欄に今日/+1/+7、結果の日付は他のツールと同じ年＋月/日＋曜日（TB-Q68。コピーは ISO のまま）。範囲の逆順と係数 0 は warn（無言で通さない）`

- [ ] **Step 2: テスト** — DT-U1 の `u1.includes('2026-09-24（木）')` → `u1.includes('2026/9/24(木)')`。U8: `localStorage.setItem('tools:dates', JSON.stringify({ v: 1, data: { 'biz-dir': 'x', 'ef-unit': '人時', 'biz-n': '1' } }))`（envelope の形は `lib/storage.js` を実装時に確かめる）→ reload → `#biz-dir` の value が `after`・`#ef-unit` が先頭の選択肢・`#biz-date` 2026-09-18 で結果が `2026/9/24(木)`。U9: `document.querySelectorAll('.date-chips').length === 4`、`#range-to` の隣の `+1` を click → `#range-result` が変わる。U10: `#range-from` 2026-09-20・`#range-to` 2026-09-18 → バナーに「開始が終了より後」。`#ef-h` を `0` → バナーに「係数」
- [ ] **Step 3: RED**
- [ ] **Step 4: 実装**
  - `restore`: `for (const id of SETTING_IDS) { const v = data[id]; if (typeof v !== 'string' || v === '') continue; const el = $id(id); if (el.tagName === 'SELECT') { if (Array.from(el.options).some(o => o.value === v)) el.value = v; } else el.value = v; }`（既知の値だけ — TB-Q17）
  - 日付欄: `for (const id of ['biz-date', 'range-from', 'range-to', 'wa-date']) ToolEdit.dateChips($id(id));`（`dateChips` が `input` イベントを出すか実装時に確かめ、出さなければ `{ onPick: recalcAll }` 相当の既存の引数を使う）
  - `recalcBiz`: `el.textContent = '→ ' + line + …` を `el.textContent = '→ '; const d = document.createElement('span'); ToolEdit.fillDate(d, res, todayStr()); el.appendChild(d); if (hn) el.appendChild(document.createTextNode('（基準日は' + hn + '）'));`（`dataset.copy` は `line` のまま）
  - `recalcRange`: `if (from > to) warnings.push('範囲の開始が終了より後です（0営業日）');`
  - `recalcEf`（係数の読み取り箇所）: 係数が `!isFinite(x) || x <= 0` で既定を使ったら `warnings.push('係数が空か 0 なので既定（8時間・20日）で計算しています')`
- [ ] **Step 5: GREEN** — `./test/run dates` → すべて pass
- [ ] **Step 6: コミット** — `dates: 古い設定で select が空にならない・日付欄に今日/+1/+7・結果の日付を他と同じ形に・範囲の逆順と係数 0 を知らせる（点検 #11・#12・#15・DT-U8〜U10・DT-Q4）`

---

### Task 7: Draw Gantt — 最初のタスクの開始は今日・受け渡しで前の内容を黙って消さない（#13）／Convert Data — デコードを戻せる（#14）

**Files:** `web/gantt.html`・`docs/specs/gantt.md`（GN-U21・U22・GN-Q21）・`test/gantt.js`／`web/devpad.html`・`docs/specs/devpad.md`（DEV-55・DEV-Q14）・`test/devpad.js`

- [ ] **Step 1: spec** — gantt:

```markdown
| GN-U21 | 空の行エディタで最初の行に名前だけ入れる | 開始が**今日**で埋まり図が描ける（2行目以降の空欄は今どおり「前の続き」） |
| GN-U22 | 保存済みの入力がある状態で Plan Tasks から受け渡し | 受け取った内容に置き換わり、info「前の内容を置き換えました（行エディタの Cmd+Z で戻せます）」が出て、Cmd+Z で前の内容に戻る |
```

  決定事項 `- **GN-Q21**（2026-10-08）: 最初のタスクの開始が空なら今日（名前を入れた時点で埋める。以前は「先頭のタスクは開始必須」のまま何も描けなかった — 点検 #13）。受け渡しで置き換えた前の内容は edUndo に積んで知らせる（黙って消さない — 同 #13）`
  devpad: `| DEV-55 | エスケープ／URL／Base64 | 元の欄に文を打ってから ←デコード | 欄が置き換わるが、`execCommand('undo')`（Cmd+Z）で**打った文に戻る**（`insertText` で入れる。効かない環境は今どおり値を入れる） |` と `- **DEV-Q14**（2026-10-08）: 打った欄を上書きするデコードは、ブラウザの取り消しが効く形で入れる（点検 #14 — GN-Q13 と同じ型）`

- [ ] **Step 2: テスト** — GN-U21: `localStorage.removeItem('tools:gantt')` → reload → エディタの1行目の `.ed-name` に `A` を入れて `input`+`blur` → `.ed-start` の value が今日・`#input` に今日の日付・バナーに「開始必須」が無い。GN-U22: `ToolStorage.save('gantt', { input: 'A\t2026-08-01\t3d' })` 相当を localStorage に入れ、GN-U20 と同じ handoff を置いて reload → `#input` が受け渡しの内容・バナーに「置き換えました」・`document.getElementById('input')` にフォーカスして Cmd+Z（`page.keyboard.press('Meta+z')`。エディタ表示中なら `#editor` のキー経路 — 実装時に `edUndo` を戻す関数名を `grep -n "edUndo.pop" web/gantt.html` で確かめ、その経路で）→ `#input` が `A\t2026-08-01\t3d` に戻る。DEV-55: エスケープのタブで `#esc-raw` に `元の文`、`#esc-lit` に `"B"` → `#esc-decode` click → raw が `B` → `document.execCommand('undo')` → raw が `元の文`
- [ ] **Step 3: RED**
- [ ] **Step 4: 実装**
  - gantt: `wireText` の name の確定（`commit`）で、`field === 'name'` かつ値が空でない・この行より前にタスク行が無い・`row.tokens[1]` が空なら `row.tokens[1] = todayStr()` にして `els.start.value` も更新（既存の `todayStr` が無ければ dates と同じものを足す）。関数の場所は実装時に `grep -n "function wireText" web/gantt.html`
  - gantt `takeHandoff`: `el('input').value = r.text;` の前に `const old = el('input').value; if (old.replace(/\t/g, '').trim() !== '' && old !== r.text) { edUndo.push(old); if (edUndo.length > 50) edUndo.shift(); r.warnings = (r.warnings || []).concat(['前の内容を置き換えました（行エディタの Cmd+Z で戻せます）']); }`（warn ではなく info にしたいので `return { warnings: r.warnings, replaced }` にして呼び元で `replaced` なら `showBanner('info', …)`）
  - devpad: ヘルパ `function setUndoable(ta, text) { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('insertText', false, text); } catch (_) {} if (!ok || ta.value !== text) ta.value = text; }` を `guard` の近くに置き、`$('esc-raw').value = unescapeJsonStr(…)`・`$('url-raw').value = urlDecode(…)`・`$('b64-raw').value = r` の3か所を `setUndoable($('esc-raw'), …)` に
- [ ] **Step 5: GREEN** — `./test/run gantt`・`./test/run devpad` → すべて pass
- [ ] **Step 6: コミット** — 2つ: `gantt: 最初のタスクの開始は今日・受け渡しで前の内容を置き換えたら知らせて Cmd+Z で戻せる（点検 #13・GN-U21・U22・GN-Q21）` と `devpad: ←デコードで打った文を上書きしても Cmd+Z で戻る（点検 #14・DEV-55・DEV-Q14）`

---

### Task 8: 仕上げ

- [ ] `./test/run` → すべて pass。`CLAUDE.md` の「**1060チェック**」を実数に（見込み 1060＋23＝1083）
- [ ] `docs/ux-backlog.md` の索引の 2026-10-08 の行の末尾に「→ 同日に全20件を実施（この計画: 2026-10-08-lessons-rollout-plan.md）」。`docs/audits/2026-10-08-lessons-rollout.md` の冒頭に「**2026-10-08 に全20件を実施**（計画と結果: 2026-10-08-lessons-rollout-plan.md）」を1行
- [ ] コミット: `docs: 点検の全20件を実施した記録と検証数（1083チェック）`
- [ ] 最終レビュー（別のエージェント・最新のモデル）→ Important 以上は TDD で直す → `./test/run` → コミット

---

## セルフ監査（CLAUDE.md の4点）

### ① 一次情報で確かめたこと
- 20件それぞれの場所と再現は、点検のエージェント2本が Playwright の実機プローブで確認（点検の記録に「確認済み／未確認」を明記）。計画を書く前に、#1・#2・#5・#6・#11 の該当コードをこのセッションで読み直した（`upsertFrame`・`setIssueLine`・`applyFixes`・`restore`）
- ハーネスの入口・フック・スタブ（`window.__fsa`・`window.vaultlint.test.run`・`window.mask`・`ToolStorage` の envelope）は test/ と各 html を読んで確かめた

### ② 観点ごとの懸念（各2件以上）
- **Check Issue の重ね書き（Task 1）**: 利用者が最終形の文言を変えると、古い文が2行目に残る（消えるより良いが、見れば分かる）／`frameKeyOf` の正規化が粗くて「同じ行」を見逃し二重になる — テストで `> 型:` と `> 見送った候補:` が1つずつであることを固定
- **Check Vault の順序（Task 4）**: 移動のあと書き込みの間にページが落ちるとリンクが切れる（以前と逆向きの同じ窓。再スキャンで見つかる）／`dropped` に入ったファイルの「ほかの修復」（テキスト化など）も一緒に飛ぶ — 理由に書いて再実行させる
- **Check Issue の読み直し（Task 3）**: `loadIssues` が毎回全ノートを読む（200件まで。focus のたびに最大 200 ファイル）— 2秒の間引き／`renderCards` で画面がスクロールの先頭に戻るかもしれない — 実装時に確かめ、戻るなら scrollY を保つ
- **Mask の確認（Task 5）**: `paste` の中の `confirm` が貼り付けの既定の動作と干渉しないか（`preventDefault` 済みなので問題ない見込み）／ドロップでも聞く（同じ `loadBlob`）
- **Dates の表示変更（Task 6）**: 既存の DT-U1 の期待を変える（利用者「全部」の範囲内。コピーは変えない）／`fillDate` は要素に書くので `biz-result` の `textContent` 代入をやめる必要がある
- **Devpad の `execCommand`（Task 7）**: Chrome では動くが非推奨 API。効かなければ値代入に落ちる（壊れない）／`select()` で既存の選択範囲を失う（デコード直後なので実害なし）
- **Gantt の今日（Task 7）**: 「前の続き」の空欄の意味を最初の行だけ変える。チェーン入力の仕様の文に追記が要る

### ③ 確信を持てていない点
- `document.execCommand('undo')` が Playwright の Chromium で `insertText` を戻すか（RED/GREEN で分かる。だめなら「前に戻す」ボタンに切り替えて spec を直す）
- Check Issue で「閉じる…」「問いを立てる…」ボタンの class 名（`.ic-close`・`.ic-frame`）— `.ic-frame` は IS-UL7 で使われているが `.ic-close` は実装時に確かめる
- board の付箋の座標を読むフックの有無（無ければ `window.board.test` に1つ足す）
- `ToolEdit.dateChips` が選んだあとに `input` イベントを出すか（dates の再計算は `input` で動く）

### ④ この監査の間は実装・ファイル作成をしていない（この文書だけ）
