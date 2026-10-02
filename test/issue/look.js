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
  },
};
