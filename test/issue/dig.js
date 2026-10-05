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
