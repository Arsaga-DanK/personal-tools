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
    // 前の節（parent の TB-MS3）がモード切替で Check Issue へ移ったまま終わるので、Plan Tasks を開き直してから始める
    await page.goto(fileUrl('web/taskboard.html'));
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
  },
};
