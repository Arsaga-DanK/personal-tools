'use strict';
/* test/issue/cards.js — 節: 一覧の見せ方（ノート＝1枚・案件ごと・論点の行・⋯・⚠ の理由）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js cards）
   ui 節の最後は Plan Tasks へ遷移するので、ここは Check Issue を開き直してから始める（FSA のダミーは addInitScript なので残る）。
   2026-09-30 に ui 節から切り出した（ui.js が 1,000 行を超えたため。このテストは自分でファイルを入れ直すので状態を引き継がない）
   照合する ID: IS-UL21〜UL22。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'cards',
  ids: 'IS-UL21〜UL22',
  async run(ctx) {
    const { page, r, eq, fileUrl } = ctx;
    await page.goto(fileUrl('web/issue.html'));
    await page.waitForLoadState('load');
    /* ========== IS-UL21 / UL22: ノート＝1枚・案件ごと（IS-Q23） ========== */
    const ul21 = await page.evaluate(async () => {
      for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
      window.__fsa.files['itk.md'] = ['---', 'status: open', 'project: ITK', 'tags: [issue]', '---', '# ITKのノート', '', '## 論点', '',
        '- [ ] 甲は A ではなく B ではないか \u{1F4C5} 2026-10-01', '- [ ] JP1でFTP通信をしているものがあるか。 \u{1F4C5} 2026-10-02', '',
        '## 掘る', '', '- 調べたこと', '![[shot.png]]', ''].join('\n');
      window.__fsa.files['ul.md'] = ['---', 'status: open', 'project: UL', 'tags: [issue]', '---', '# ULのノート', '', '## 論点', '',
        '- [ ] 目標は数ではなく質で立てるべきではないか \u{1F4C5} 2026-09-28', ''].join('\n');
      window.__fsa.files['none.md'] = ['---', 'status: open', 'tags: [issue]', '---', '# 案件なしのノート', '', '## 掘る', '- メモ', ''].join('\n');
      document.getElementById('f-status').value = 'open';
      await window.issue.load();
      const heads = Array.from(document.querySelectorAll('.proj-head')).map(e => e.textContent);
      const itk = Array.from(document.querySelectorAll('.note-card')).find(c => (c.querySelector('.note-name') || {}).textContent === 'ITKのノート');
      if (!itk) return { heads, noCard: true };
      const rows = Array.from(itk.querySelectorAll('.issue-card'));
      const more = rows[0] && rows[0].querySelector('.ic-more');
      return {
        heads, stats: (itk.querySelector('.note-stats') || {}).textContent || '',
        rows: rows.length, noTitle: rows.every(x => !x.querySelector('.ic-title')),
        moreHas: more ? ['.ic-task', '.ic-frame', '.ic-close'].every(sel => !!more.querySelector(sel)) : false,
        why: rows.map(x => (x.querySelector('.ic-why') || {}).textContent || ''),
      };
    });
    r.check('IS-UL21（案件ごとの見出し UL→ITK→案件なし・ITK のカードにノート名と「掘る 2行・論点 2・画像 1」・行2つ・行にノート名なし・⋯ に3つの操作）',
      !ul21.noCard && eq(ul21.heads, ['UL（1）', 'ITK（1）', '案件なし（1）'])
      && ul21.stats.includes('掘る 2行') && ul21.stats.includes('論点 2') && ul21.stats.includes('画像 1')
      && ul21.rows === 2 && ul21.noTitle && ul21.moreHas,
      JSON.stringify(ul21));
    r.check('IS-UL22（⚠ の行だけ、1つ目の理由が行のすぐ下に出る）',
      !ul21.noCard && ul21.why[0] === '' && ul21.why[1].includes('はい／いいえ'), JSON.stringify(ul21.why));
  },
};
