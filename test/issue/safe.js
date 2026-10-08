'use strict';
/* test/issue/safe.js — 節: 消えない・壊れない（Plan Tasks の教訓の横展開 — 点検 docs/audits/2026-10-08-lessons-rollout.md）
   入口: test/issue.js（ctx を受け取る。単独実行は ./test/run issue safe）
   照合する ID: IS-SF1〜SF7。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'safe',
  ids: 'IS-SF1〜SF7',
  async run(ctx) {
    const { page, r, fileUrl } = ctx;
    await page.goto(fileUrl('web/issue.html'));
    // 5段が既にあり、ウィザードが持てない「2行目」をあちこちに持つノート（IS-SF1）
    const FRAMED = ['---', 'created: 2026-09-24', 'status: open', 'deadline: 2026-09-30', 'tags: [issue]', '---', '# 手順書', '',
      '## 1. ゴール', '', '> 型: ギャップフィル（あるべき姿は決まっている）', '- 運営が止められる（マイルストーン: 2026-10-02）', '- 補足のゴール行', '',
      '## 2. 論点', '', '- 手順書が書けないのは情報不足ではなく合意が無いからではないか', '> 見送った候補: 別案', '',
      '## 3. 最終形', '', '- 【表】粒度ごとの表', '- 先方の回答メモ', '',
      '## 4. サブイシュー', '', '| 粒度 | 表 | 聞く | PM | 2026-09-29 |', '',
      '## 5. 次の一手', '', '- [ ] 粒度を確認する 📅 2026-09-26', '- [ ] 2つ目のタスク', '',
      '## 4. リスク', '', '- 先方の返事が遅い', '',
      '## 掘る', '', '- TODO 書き殴り', ''].join('\n');
    // スタブのフォルダに置いて読む（参照は差し替えない — ダミーは閉包で files を握っている）
    const load = (files) => page.evaluate(async (fs) => {
      for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
      Object.assign(window.__fsa.files, fs);
      await window.issue.load();
    }, files);

    /* ---------- IS-SF1: 5段の組み直しで前の行を消さない ---------- */
    await load({ 'd.md': FRAMED });
    const sf1 = await page.evaluate(async () => {
      document.querySelector('.issue-card .ic-frame').click();
      const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      document.getElementById('wz-next').click();   // → Step 2（ゴールは初期値のまま）
      document.getElementById('wz-next').click();   // → Step 3
      set('#wz-picture', '粒度ごとに実行できたかの表');   // 最終形の文を変える
      document.getElementById('wz-next').click();   // → Step 4
      document.getElementById('wz-next').click();   // → Step 5
      document.getElementById('wz-create').click();
      await new Promise(d => setTimeout(d, 400));
      const after = window.__fsa.files['d.md'];
      const count = (s) => after.split(s).length - 1;
      return { banner: document.getElementById('banner').textContent, closed: document.getElementById('wizard').hidden,
        kept: ['- 補足のゴール行', '- 先方の回答メモ', '- [ ] 2つ目のタスク', '- 先方の返事が遅い', '- TODO 書き殴り'].every(s => after.includes(s)),
        pictureFirst: after.indexOf('粒度ごとに実行できたかの表') > 0 && after.indexOf('粒度ごとに実行できたかの表') < after.indexOf('- 先方の回答メモ'),
        riskAfterFive: after.indexOf('## 4. リスク') > after.indexOf('## 5. 次の一手'),
        kind: count('> 型:'), alt: count('> 見送った候補:'), after };
    });
    r.check('IS-SF1（5段の組み直しで前の行を消さない — 残す・変えた最終形が1行目・リスクは5の後ろ・注記は二重にならない・バナー）',
      sf1.closed && sf1.kept && sf1.pictureFirst && sf1.riskAfterFive && sf1.kind === 1 && sf1.alt === 1
      && sf1.banner.includes('前からあった 5 行は残しました'), JSON.stringify(sf1));

    /* ---------- IS-SF2: カードに出ている1行だけを置き換える ---------- */
    const sf2 = await page.evaluate(() => (typeof setIssueLine === 'function')
      ? setIssueLine('# t\n\n## 論点\n\n- a\n- b\n> 注記\n\n## 掘る\n\n- x\n', 'c') : null);
    r.check('IS-SF2（setIssueLine: カードに出ている最初の行だけ置き換え、ほかの行は残る）',
      sf2 === '# t\n\n## 論点\n\n- c\n- b\n> 注記\n\n## 掘る\n\n- x\n', JSON.stringify(sf2));
  },
};
