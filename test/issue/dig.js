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
    if (await page.$('.ic-edit .ic-kid-input')) {
      await page.focus('.ic-edit .ic-kid-input');
      await page.keyboard.type('待ち: 先方の回答');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
    }
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

    // 欄を開いたまま（フォーカスは外す）別の行に乗せて T。sendToTasks は呼ばれたかだけを記録する
    await openAdd('甲は A ではなく B ではないか');
    await page.evaluate(() => { window.__calls = []; window.__orig = window.sendToTasks; window.sendToTasks = (it) => window.__calls.push(it.issue); if (document.activeElement) document.activeElement.blur(); });
    const pk = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === '庚は M ではなく N ではないか');
      const rc = c.querySelector('.ic-issue').getBoundingClientRect(); return { x: Math.round(rc.left + 20), y: Math.round(rc.top + rc.height / 2) }; });
    await page.mouse.move(pk.x + 1, pk.y); await page.mouse.move(pk.x, pk.y); await page.keyboard.press('t'); await page.waitForTimeout(40);
    const dg7 = await page.evaluate(() => { const c = window.__calls.slice(); window.sendToTasks = window.__orig;
      const no = Array.from(document.querySelectorAll('.ic-edit button')).find(b => b.textContent === 'やめる'); if (no) no.click(); return c; });
    r.check('IS-DG7（［＋ 分かったこと］の欄を開いている最中は、別の行で T が効かない）', eq(dg7, []), JSON.stringify(dg7));
  },
};
