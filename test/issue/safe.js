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

    /* ---------- IS-SF3・SF5: 変換中の Esc では閉じない・打っている最中の beforeunload は止める ---------- */
    await load({ 'd.md': FRAMED });
    const sf3 = await page.evaluate(async () => {
      const esc = (target, composing) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: composing }));
      const unload = () => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; };
      document.querySelector('.issue-card .ic-close').click();
      const note = document.getElementById('cm-note');
      note.value = '分かった'; note.dispatchEvent(new Event('input', { bubbles: true }));
      esc(note, true);
      const stillOpen = !document.getElementById('close-modal').hidden;
      const asked = unload();
      esc(note, false);
      const closed = document.getElementById('close-modal').hidden;
      const notAsked = !unload();
      document.querySelector('.issue-card .ic-frame').click();
      const first = document.querySelector('#wz-body textarea, #wz-body input');
      esc(first, true);
      const wzOpen = !document.getElementById('wizard').hidden;
      const wzAsked = unload();   // ウィザードは既存ノートの中身が入っているので「書いた状態」
      esc(first, false);
      return { stillOpen, asked, closed, notAsked, wzOpen, wzAsked, wzClosed: document.getElementById('wizard').hidden };
    });
    r.check('IS-SF3（変換中の Esc では閉じない・ふつうの Esc は閉じる）', sf3.stillOpen && sf3.closed && sf3.wzOpen && sf3.wzClosed, JSON.stringify(sf3));
    r.check('IS-SF5（打っている最中の beforeunload は止める・閉じたら止めない）', sf3.asked && sf3.notAsked && sf3.wzAsked, JSON.stringify(sf3));

    /* ---------- IS-SF4: モーダルの中の Cmd+Enter はそのモーダルの確定 ---------- */
    const sf4 = await page.evaluate(async () => {
      const cmdEnter = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
      const filesBefore = Object.keys(window.__fsa.files).length;
      document.querySelector('.issue-card .ic-frame').click();
      const step0 = document.getElementById('wz-step').textContent;
      cmdEnter();
      await new Promise(d => setTimeout(d, 100));
      const step1 = document.getElementById('wz-step').textContent;
      document.getElementById('wz-close').click();
      document.querySelector('.issue-card .ic-close').click();
      cmdEnter();
      await new Promise(d => setTimeout(d, 400));
      return { advanced: step0 !== step1, closed: /^status: closed$/m.test(window.__fsa.files['d.md']),
        files: Object.keys(window.__fsa.files).length - filesBefore, modalHidden: document.getElementById('close-modal').hidden };
    });
    r.check('IS-SF4（モーダルの中の Cmd+Enter はそのモーダルの確定・貼り付け欄からの作成は走らない）',
      sf4.advanced && sf4.closed && sf4.files === 0 && sf4.modalHidden, JSON.stringify(sf4));

    /* ---------- IS-SF6: ⋯ にフォルダ名・［別のフォルダを選ぶ］ ---------- */
    await load({ 'd.md': FRAMED });
    const sf6 = await page.evaluate(async () => {
      const nameEl = document.getElementById('dir-name'), btn = document.getElementById('repick-btn');
      if (!nameEl || !btn) return { missing: true };
      const before = window.__fsa.picked;
      btn.click();
      await new Promise(d => setTimeout(d, 300));
      return { name: nameEl.textContent, nameShown: !nameEl.hidden, picked: window.__fsa.picked - before, btnShown: !btn.hidden,
        cards: document.querySelectorAll('.issue-card').length };
    });
    r.check('IS-SF6（⋯ にフォルダ名・［別のフォルダを選ぶ］でピッカーが出て読み直す）',
      !sf6.missing && sf6.name.includes('Issues') && sf6.nameShown && sf6.picked === 1 && sf6.btnShown && sf6.cards === 1, JSON.stringify(sf6));

    /* ---------- IS-SF7: タブに戻ったら読み直す・打っている最中は読み直さない ---------- */
    const sf7 = await page.evaluate(async () => {
      const titleOf = () => (document.querySelector('.note-card .note-name') || {}).textContent || '';
      const focus = async () => { window.dispatchEvent(new Event('focus')); await new Promise(d => setTimeout(d, 300)); };
      window.__fsa.files['d.md'] = window.__fsa.files['d.md'].replace('# 手順書', '# 手順書（外で直した）');
      await focus();
      const updated = titleOf().includes('外で直した');
      document.querySelector('.issue-card .ic-close').click();
      window.__fsa.files['d.md'] = window.__fsa.files['d.md'].replace('外で直した', 'さらに直した');
      await new Promise(d => setTimeout(d, 2100));   // 2秒の間引きを越えてから
      await focus();
      const notWhileTyping = !titleOf().includes('さらに直した');
      document.getElementById('cm-cancel').click();
      await new Promise(d => setTimeout(d, 2100));
      await focus();
      const afterClose = titleOf().includes('さらに直した');
      return { updated, notWhileTyping, afterClose };
    });
    r.check('IS-SF7（タブに戻ったら読み直す・打っている最中は読み直さない・閉じたら読み直す）',
      sf7.updated && sf7.notWhileTyping && sf7.afterClose, JSON.stringify(sf7));

    /* ---------- IS-SF6b: ピッカーをキャンセルしたら前のフォルダのまま ---------- */
    const sf6b = await page.evaluate(async () => {
      const real = window.showDirectoryPicker;
      window.showDirectoryPicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
      document.getElementById('repick-btn').click();
      await new Promise(d => setTimeout(d, 300));
      window.showDirectoryPicker = real;
      return { keptHandle: typeof dirHandle !== 'undefined' && dirHandle !== null, name: document.getElementById('dir-name').textContent };
    });
    r.check('IS-SF6b（［別のフォルダを選ぶ］をキャンセルしても前のフォルダのまま）', sf6b.keptHandle && sf6b.name.includes('Issues'), JSON.stringify(sf6b));

    /* ---------- IS-SF8〜SF10: 最終レビュー 2026-10-08（重ね書きの同一性） ---------- */
    const wizardThrough = async (opts) => page.evaluate(async (o) => {
      document.querySelector('.issue-card .ic-frame').click();
      const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      document.getElementById('wz-next').click();   // → Step 2
      if (o && o.secondCandidate) { const c = document.querySelectorAll('.wz-c-text'); if (c[1]) set('.wz-c-text:nth-of-type(1)', c[0].value); if (c[1]) { c[1].value = o.secondCandidate; c[1].dispatchEvent(new Event('input', { bubbles: true })); } }
      document.getElementById('wz-next').click();   // → Step 3
      if (o && o.picture) set('#wz-picture', o.picture);
      document.getElementById('wz-next').click();   // → Step 4
      document.getElementById('wz-next').click();   // → Step 5
      document.getElementById('wz-create').click();
      await new Promise(d => setTimeout(d, 400));
      return window.__fsa.files['d.md'];
    }, opts || null);
    const BULLET_SUBS = ['---', 'status: open', 'deadline: 2026-09-30', '---', '# 粒度', '',
      '## 1. ゴール', '', '> 型: ギャップフィル（あるべき姿は決まっている）', '- 粒度が決まる（マイルストーン: 2026-10-02）', '',
      '## 2. 論点', '', '- 粒度はどこで決めるべきか', '',
      '## 3. 最終形', '', '- 【表】粒度の表', '',
      '## 4. サブイシュー', '', '- 粒度を決める', '- 誰が持つか', '',
      '## 5. 次の一手', '', '- [ ] 聞く', '', '## 掘る', '', '- メモ', ''].join('\n');
    const OLD_FORMAT = BULLET_SUBS.replace('## 3. 最終形', '## 3. 絵コンテ').replace('## 4. サブイシュー', '## 4. 不明点');
    const sf8 = {};
    for (const [label, note] of [['bullets', BULLET_SUBS], ['old', OLD_FORMAT]]) {
      await load({ 'd.md': note });
      await wizardThrough();
      await load({ 'd.md': await page.evaluate(() => window.__fsa.files['d.md']) });
      const after = await wizardThrough();
      const count = (s) => after.split(s).length - 1;
      sf8[label] = { rows: count('| 粒度を決める |'), bullets: count('- 粒度を決める'), goals: count('## 1. ゴール'),
        oldHeads: count('不明点') + count('絵コンテ'), picture: after.includes('粒度の表'), subCard: await page.evaluate(() => (document.querySelector('.ic-meta') || {}).textContent || '') };
    }
    r.check('IS-SF8（ウィザードを2回通しても表の行は増えない・箇条書きは表に変わる・絵コンテ・不明点は合流する）',
      ['bullets', 'old'].every(k => sf8[k].rows === 1 && sf8[k].bullets === 0 && sf8[k].goals === 1 && sf8[k].oldHeads === 0 && sf8[k].picture),
      JSON.stringify(sf8));

    const TWO_NEXT = BULLET_SUBS.replace('- [ ] 聞く', '- [x] 週次で確認する 📅 2026-09-26\n- [ ] 週次で確認する 📅 2026-10-03');
    await load({ 'd.md': TWO_NEXT });
    const sf9after = await wizardThrough();
    const sf9 = { done: sf9after.split('- [x] 週次で確認する 📅 2026-09-26').length - 1, open: sf9after.split('- [ ] 週次で確認する 📅 2026-10-03').length - 1,
      total: sf9after.split('週次で確認する').length - 1 };
    r.check('IS-SF9（済んだ一手と同じ文の開いた一手は別の行のまま・3行目はできない）', sf9.done === 1 && sf9.open === 1 && sf9.total === 2, JSON.stringify(sf9));

    const ALT = BULLET_SUBS.replace('- 粒度はどこで決めるべきか', '- 粒度はどこで決めるべきか\n> 見送った候補: 前に見送った案');
    await load({ 'd.md': ALT });
    const sf10after = await wizardThrough({ secondCandidate: '新しい別案' });
    const sf10 = { oldKept: sf10after.includes('> 見送った候補: 前に見送った案'), newThere: sf10after.includes('> 見送った候補: 新しい別案'),
      kind: sf10after.split('> 型:').length - 1 };
    r.check('IS-SF10（論点の前の「見送った候補」は残り、新しいものも入る・型は1つ）', sf10.oldKept && sf10.newThere && sf10.kind === 1, JSON.stringify(sf10));
  },
};
