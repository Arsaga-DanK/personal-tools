'use strict';
/* test/issue/dig.js — 節: 分かったこと・待ち・掘るを読む（段3）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js dig）
   前の節はページを移したまま終わることがあるので、Check Issue を開き直してから始める（FSA のダミーは addInitScript なので残る）。
   照合する ID: IS-DG1〜DG12。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'dig',
  ids: 'IS-DG1〜DG12',
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
      '- [ ] 己は 手順書が書けないのは運用チームの承認を待っているからではなく、手順そのものがまだ決まっていないからではないか \u{1F4C5} ' + past, '\t- 待ち: 先方', '- [ ] 庚は M ではなく N ではないか \u{1F4C5} ' + past, ''].join('\n');
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

    // 札は幅で切れる（… で省く）。論点が長くても ⏳ 待ち が札の幅の中に見えていること（2026-10-05 の点検 — 最後に置くと切れていた）
    const dg6 = await page.evaluate(() => Array.from(document.querySelectorAll('#now .tick')).filter(t => t.textContent.includes('己は') || t.textContent.includes('庚は')).map(t => {
      const w = t.querySelector('.tick-wait'), tr = t.getBoundingClientRect(), wr = w ? w.getBoundingClientRect() : null;
      return { ki: t.textContent.includes('己は'), wait: !!w, visible: !!wr && wr.left >= tr.left && wr.right <= tr.right + 1, title: t.title };
    }));
    const ki = dg6.find(t => t.ki), kou = dg6.find(t => !t.ki);
    r.check('IS-DG6（いまの札: 待ちの子がある遅れの論点にだけ ⏳ 待ち — 論点が長くても札の幅の中に見える・title に「⏳ 待ち: 先方」）',
      dg6.length === 2 && ki.wait && ki.visible && ki.title.includes('⏳ 待ち: 先方') && !kou.wait && !kou.title.includes('⏳'), JSON.stringify(dg6));

    // 欄を開いたまま（フォーカスは外す）別の行に乗せて T。sendToTasks は呼ばれたかだけを記録する
    await openAdd('甲は A ではなく B ではないか');
    await page.evaluate(() => { window.__calls = []; window.__orig = window.sendToTasks; window.sendToTasks = (it) => window.__calls.push(it.issue); if (document.activeElement) document.activeElement.blur(); });
    const pk = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.issue-card')).find(a => (a.querySelector('.ic-issue') || {}).textContent === '庚は M ではなく N ではないか');
      const rc = c.querySelector('.ic-issue').getBoundingClientRect(); return { x: Math.round(rc.left + 20), y: Math.round(rc.top + rc.height / 2) }; });
    await page.mouse.move(pk.x + 1, pk.y); await page.mouse.move(pk.x, pk.y); await page.keyboard.press('t'); await page.waitForTimeout(40);
    const dg7 = await page.evaluate(() => { const c = window.__calls.slice(); window.sendToTasks = window.__orig;
      const no = Array.from(document.querySelectorAll('.ic-edit button')).find(b => b.textContent === 'やめる'); if (no) no.click(); return c; });
    r.check('IS-DG7（［＋ 分かったこと］の欄を開いている最中は、別の行で T が効かない）', eq(dg7, []), JSON.stringify(dg7));

    /* ---------- IS-DG10: 欄の Cmd+Enter は1行足すだけ（貼り付けからの作成 IS-U6 を発火させない） ---------- */
    const before10 = await page.evaluate(() => Object.keys(window.__fsa.files).sort());
    await openAdd('乙は C ではなく D ではないか');
    if (await page.$('.ic-edit .ic-kid-input')) {
      await page.focus('.ic-edit .ic-kid-input');
      await page.keyboard.type('Cmd で足す');
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(400);
    }
    const dg10 = await page.evaluate(() => ({ files: Object.keys(window.__fsa.files).sort(), one: window.__fsa.files['one.md'] }));
    r.check('IS-DG10（欄で Cmd+Enter: その論点に1行足すだけ・新しいノートを作らない）',
      eq(dg10.files, before10) && dg10.one.includes('\t- Cmd で足す'), JSON.stringify({ before10, files: dg10.files }));

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
      // d.open = true でも toggle は後から非同期で来るので、自分で toggle を送ってその場で中身を見る
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

    /* ---------- IS-DG11: 字下げの深い行で固まらない（入れ子の量指定の総当たりを避ける） ---------- */
    const dg11 = await safe(() => {
      const sp = ' '.repeat(40), t = ['## 論点', '- [ ] 癸は S ではなく T ではないか', sp + '"key": 1,', '', '## 掘る', sp + '"key": 1,', ''].join('\n');
      const ms = (f) => { const t0 = performance.now(); f(); return Math.round(performance.now() - t0); };
      return { lines: ms(() => window.issue.issueLines(t)), add: ms(() => window.issue.addKidLine(t, 1, 'x')),
        stats: ms(() => window.issue.noteStats(t)), dig: ms(() => renderDig(window.issue.digText(t))) };
    });
    r.check('IS-DG11（空白 40 個で始まる行: 読む・足す・数える・掘るを読む がそれぞれ 100ms 以内）',
      typeof dg11 === 'object' && Object.values(dg11).every(v => v < 100), JSON.stringify(dg11));

    /* ---------- IS-DG12: 全角空白は見出しにも字下げにもしない（Obsidian と同じ） ---------- */
    const dg12 = await safe(() => {
      const t = ['## 掘る', '- a', '#　メモ', '- b', '- c', '## 結論', '- z', ''].join('\n');
      const md = renderDig(['　## x', '###　y', '### z'].join('\n'));
      return { dig: window.issue.digText(t), n: window.issue.noteStats(t).dig,
        h: Array.from(md.querySelectorAll('.md-h')).map(x => x.textContent), p: Array.from(md.querySelectorAll('p:not(.md-h)')).map(x => x.textContent) };
    });
    r.check('IS-DG12（# と全角空白で掘るが切れない・量にも数える／［掘るを読む］の見出しは ### z だけ・ほかは素の文字）',
      typeof dg12 === 'object' && dg12.dig === ['- a', '#　メモ', '- b', '- c'].join('\n') && dg12.n === 4
      && eq(dg12.h, ['z']) && eq(dg12.p, ['　## x', '###　y']), JSON.stringify(dg12));
  },
};
