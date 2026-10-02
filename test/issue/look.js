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
      lk2.push(await page.evaluate(() => ({ act: Array.from(document.querySelectorAll('#f-status button.active')).map(b => b.dataset.v),
        pressed: Array.from(document.querySelectorAll('#f-status button[aria-pressed="true"]')).map(b => b.dataset.v),
        cards: document.querySelectorAll('.issue-card').length })).then(o => Object.assign(o, { ok })));
    }
    r.check('IS-LK2（表示の切替は横並びのボタン: 押したものだけ active・aria-pressed、カードは 2・3・1・2）',
      lk2.every((o, i) => o.ok && eq(o.act, [['open', 'all', 'closed', 'open'][i]]) && eq(o.pressed, o.act))
      && eq(lk2.map(o => o.cards), [2, 3, 1, 2]), JSON.stringify(lk2));

    /* ---------- IS-LK3: 検索 ---------- */
    const search = async (q) => {
      await page.evaluate((x) => { const f = document.getElementById('f-q'); if (!f) return; f.value = x; f.dispatchEvent(new Event('input', { bubbles: true })); }, q);
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
      const more = document.getElementById('issue-more'); if (more) more.open = true;
      const b = document.getElementById('howto-btn'); if (b) b.click();
      return { before, after: { hidden: h.hidden, open: h.open }, moreClosed: !!more && !more.open, hasBtn: !!b };
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

    /* ---------- IS-LK6〜LK9: 論点の行と案件の見出し ---------- */
    await setStatus('open');
    await search('');
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
        fix: w ? ((w.querySelector('.ic-fix') || {}).textContent || '') : '',
        proj: Array.from(document.querySelectorAll('.proj-head')).map(h => ({ name: (h.querySelector('.proj-name') || {}).textContent || '', meta: (h.querySelector('.proj-meta') || {}).textContent || '' })),
      };
    });
    r.check('IS-LK6（論点の行の状態の帯: 遅れ・今日・立て直す・なし・閉じたはなし）',
      eq(lk.st, ['s-late', 's-today', 's-rethink', '', '']) && lk.shadowLate.includes(lk.lateColor) && lk.shadowRethink.includes(lk.rethinkColor),
      JSON.stringify([lk.st, lk.shadowLate, lk.lateColor, lk.shadowRethink, lk.rethinkColor]));
    r.check('IS-LK7（締切の title は ISO・遅れは「3日遅れ」・閉じたは「閉じた 2026/9/22(火)」で赤くしない）',
      !!lk.dueKo && lk.dueKo.title === past && lk.dueKo.rel === '3日遅れ' && lk.dueKo.late
      && !!lk.dueCl && lk.dueCl.text.startsWith('閉じた ') && lk.dueCl.text.includes('9/22(火)') && lk.dueCl.title === '2026-09-22' && !lk.dueCl.over && lk.dueCl.rel === '',
      JSON.stringify([lk.dueKo, lk.dueCl]));
    r.check('IS-LK8（ノートの見出しに「やること」・開いた論点にだけ「問い」・⚠ の下に直し方）',
      lk.labDo.length === 3 && lk.labDo.every(t => t === 'やること') && eq(lk.labQ, [true, false, false])
      && lk.fix.startsWith('→ 直すなら ') && lk.fix.includes('ではないか'), JSON.stringify([lk.labDo, lk.labQ, lk.fix]));
    const fold = () => page.evaluate(() => { const h = document.querySelector('.proj-head'); const b = h && h.querySelector('.proj-fold'); if (b) b.click();
      const h2 = document.querySelector('.proj-head'); return { caret: ((h2 && h2.querySelector('.proj-fold')) || {}).textContent || '', cards: document.querySelectorAll('.note-card').length }; });
    const f1 = await fold(), f2 = await fold();
    r.check('IS-LK9（案件の見出し: 名前・開いている 2・閉じた 1・遅れ 1・今日まで 1・立て直す 1・論点なし 1・▾ でたたむ／戻す）',
      lk.proj.length === 1 && lk.proj[0].name === 'ITK' && lk.proj[0].meta.includes('開いている 2・閉じた 1')
      && lk.proj[0].meta.includes('遅れ 1') && lk.proj[0].meta.includes('今日まで 1') && lk.proj[0].meta.includes('立て直す 1') && lk.proj[0].meta.includes('論点なし 1')
      && f1.caret === '▸' && f1.cards === 0 && f2.caret === '▾' && f2.cards === 3, JSON.stringify([lk.proj, f1, f2]));

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
      && eq((n10.groups || []).map(g => g.badge), ['遅れ 2', '今日まで 1', '立て直す 1', '論点がまだ無い 1']), JSON.stringify(n10));
    const g = n10.groups || [];
    r.check('IS-LK11（札: 遅れは古い順・ノート名 › 論点（N日遅れ）・⚠ の遅れに印・その論点は立て直すに出ない・論点なしは（掘る 1行））',
      g.length === 4 && g[0].ticks[0] === '⚠ 急ぎのノート › 本番と通信できるのか。（5日遅れ）' && g[0].ticks[1] === '急ぎのノート › 甲は A ではなく B ではないか（2日遅れ）'
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
    await page.evaluate(() => { const b = document.getElementById('now-fold'); if (b) b.click(); });
    const n14a = await nowNow();
    await page.waitForTimeout(400);   // 保存は 300ms 待ってから（ui.js の scheduleSave）
    await page.reload();
    await page.waitForLoadState('load');
    await loadNotes(NOW_FILES);
    const n14b = await nowNow();
    await page.evaluate(() => { const b = document.getElementById('now-fold'); if (b) b.click(); });
    const n14c = await nowNow();
    await page.waitForTimeout(400);
    r.check('IS-LK14（たたむ: 札の行が消え数は残る・読み直してもたたんだまま・ひらくで戻る）',
      n14a.listHidden === true && eq(n14a.cnt, ['遅れ 2', '今日まで 1', '立て直す 1', '論点なし 1']) && n14b.listHidden === true && n14c.listHidden === false,
      JSON.stringify([n14a.listHidden, n14b.listHidden, n14c.listHidden]));
  },
};
