'use strict';
/* test/taskboard/links.js — 節: タスクとのつながりの写し（段4 — lib/tasklinks.js と、Plan Tasks が書くところ）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js links）
   照合する ID: TB-LN1〜LN5。期待値の正本は docs/specs/taskboard/issue-link.md */
module.exports = {
  name: 'links',
  ids: 'TB-LN1〜LN5',
  async run(ctx) {
    const { page, r, eq, fileUrl, session, TODAY } = ctx;
    await page.goto(fileUrl('web/taskboard.html'));
    // 未実装でもハーネスを止めず fail として数える（RED を見るため）
    const safe = (fn, arg) => page.evaluate(([src, a]) => {
      try { return Promise.resolve((0, eval)('(' + src + ')')(a)).catch(e => 'ERR: ' + e.message); }
      catch (e) { return 'ERR: ' + e.message; }
    }, [fn.toString(), arg]);

    /* ---------- TB-LN1: 名前 ---------- */
    const ln1 = await safe(() => ['名前|別名', '04_Issues/名前.md#見出し', 'が', ''].map(ToolTaskLinks.nameOf));
    r.check('TB-LN1（nameOf: 別名・見出し・フォルダ・.md を落とす・NFC・空は空）', eq(ln1, ['名前', '名前', 'が', '']), JSON.stringify(ln1));

    /* ---------- TB-LN2: 数える ---------- */
    const ln2 = await safe(() => {
      const c = ToolTaskLinks.count([
        { links: ['a', 'a|別名'], finished: true, doneDate: '2026-09-29' },
        { links: ['a'], finished: false, doneDate: null },
        { links: ['b'], finished: true, doneDate: null },
        { links: [], finished: true, doneDate: '2026-09-30' },
        { links: ['a'], finished: true, doneDate: '2026-09-20' },
        { links: ['__proto__'], finished: false, doneDate: null },
      ]);
      return { json: JSON.stringify(c), polluted: ({}).total !== undefined };
    });
    r.check('TB-LN2（count: 同じ名前は1つ・済みは完了と中止・最後に済んだ日は最大・リンクの無いタスクは数えない・__proto__ でも汚さない）',
      typeof ln2 === 'object' && ln2.json === '{"a":{"total":3,"done":2,"last":"2026-09-29"},"b":{"total":1,"done":1,"last":""},"__proto__":{"total":1,"done":0,"last":""}}'
      && ln2.polluted === false, JSON.stringify(ln2));

    /* ---------- TB-LN3・LN4: 読み込んだとき・保存したときに書く ---------- */
    const TASKS = ['## 作業', '- [ ] 先方に確認する [[2026-09-25_先方に確認]] \u{1F4C5} 2026-09-30', '- [x] 手順を聞く [[2026-09-25_先方に確認]] ✅ 2026-08-01',
      '- [-] やめた [[2026-09-25_先方に確認]]', '- [ ] 関係ない', ''].join('\n');
    await session(TASKS);
    const copy = () => safe(() => { const d = ToolStorage.load('tasklinks'); return d ? { age: Date.now() - d.at, file: d.file, notes: d.notes } : null; });
    const ln3 = await copy();
    r.check('TB-LN3（読み込むと写しを書く: total 3・done 2・last 2026-08-01・file・5秒以内）',
      !!ln3 && typeof ln3 === 'object' && eq(ln3.notes, { '2026-09-25_先方に確認': { total: 3, done: 2, last: '2026-08-01' } })
      && ln3.file === '(メモリ)' && ln3.age >= 0 && ln3.age < 5000, JSON.stringify(ln3));
    await page.evaluate(async () => { window.__s.applyOps([{ type: 'complete', line: 2 }]); await window.__s.save(); });
    const ln4 = await copy();
    r.check('TB-LN4（完了にして保存すると写しが変わる: done 3・last 今日）',
      !!ln4 && typeof ln4 === 'object' && eq(ln4.notes, { '2026-09-25_先方に確認': { total: 3, done: 3, last: TODAY } }), JSON.stringify(ln4));

    /* ---------- TB-LN5: デモは書かない ---------- */
    const ln5 = await safe(() => {
      ToolStorage.save('tasklinks', { at: 1, file: 'sentinel', notes: {} });
      loadDemo();
      const d = ToolStorage.load('tasklinks');
      return d ? d.file : null;
    });
    r.check('TB-LN5（［デモデータを表示］は写しを書かない）', ln5 === 'sentinel', JSON.stringify(ln5));
  },
};
