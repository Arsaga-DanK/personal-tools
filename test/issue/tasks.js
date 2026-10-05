'use strict';
/* test/issue/tasks.js — 節: タスクとのつながり・閉じどき（段4）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js tasks）
   写しは lib/storage.js の封筒で localStorage に置く（ToolStorage.save('tasklinks', …)）。IS-TK6・TK7 は同じページに iframe で Plan Tasks を開いて書かせる（別のタブの代わり — storage イベントは同じ保存領域のほかの文書に届く）。
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
        linksAt: la ? { text: la.textContent, title: la.title, hidden: la.hidden, band: Math.abs(top(la) - top(document.getElementById('summary'))) <= 14 } : null,
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
    // 見出しの1行目は空きが約 180px（1280px）。長い文は ⋯ を次の行へ落とす（2026-10-05 に実測）ので、説明は title に
    r.check('IS-TK1（写しが無い: 「タスクは未読込」が件数と同じ帯で title に Plan Tasks・数も閉じどきも出ない・いまの数は4つ・遅れはそのまま）',
      !!tk1.linksAt && tk1.linksAt.text === 'タスクは未読込' && tk1.linksAt.title.includes('Plan Tasks で') && tk1.linksAt.band && !tk1.chips.a && !tk1.chips.b && tk1.ripe === 0
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
    r.check('IS-TK5（25時間前の写し: 「タスクは古い（…）」が件数と同じ帯で title に 24時間・数も閉じどきも出ない・b の遅れは遅れに出る）',
      !!tk5.linksAt && tk5.linksAt.text.startsWith('タスクは古い（') && tk5.linksAt.band && tk5.linksAt.title.includes('24時間') && !tk5.chips.a && !tk5.chips.b && tk5.ripe === 0
      && ticksOf(tk5, '遅れ').some(t => t.includes('乙は')), JSON.stringify({ linksAt: tk5.linksAt, chips: tk5.chips, ripe: tk5.ripe }));

    /* ---------- IS-TK6: 別のタブで Plan Tasks が読み込むと、再読込なしで描き直す ---------- */
    await clearCopy();
    const TASKS = ['## 作業', '- [x] 乙を聞く [[b]] ✅ 2026-09-29', '- [x] 乙を確かめる [[b|別名]] ✅ 2026-09-28', '- [ ] 甲を調べる [[a]]', ''].join('\n');
    // 別のタブの代わりに、同じページに Plan Tasks を iframe で開く（file:// は1オリジン — 保存領域を共有し、storage イベントは親の文書に届く）。
    // このハーネスのページは browser.newPage() で作っているので、同じ文脈に2つ目のページを開けない（「Please use browser.newContext()」）
    await page.evaluate((src) => new Promise((ok) => {
      const f = document.createElement('iframe');
      f.id = 'tb-frame'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:10px;height:10px;opacity:0;border:0';
      f.onload = () => ok(); f.src = src; document.body.appendChild(f);
    }), fileUrl('web/taskboard.html'));
    const tb = page.frames().find(f => f.url().includes('taskboard.html'));
    await tb.evaluate((t) => { window.taskboard.test.newSession(t); }, TASKS);
    await page.waitForTimeout(300);
    const tk6 = await look();
    r.check('IS-TK6（別のタブで Plan Tasks が読み込む → 再読込なしで b は 全部済み ✓・a は タスク 1・済み 0）',
      eq(tk6.chips.b, { text: '全部済み ✓', all: true }) && eq(tk6.chips.a, { text: 'タスク 1・済み 0', all: false }),
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
    await page.evaluate(() => { const f = document.getElementById('tb-frame'); if (f) f.remove(); });
  },
};
