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
  },
};
