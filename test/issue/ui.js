'use strict';
/* test/issue/ui.js — 節: UI 経路（貼る→判定→コピー・保存）・一覧（画面の主）・書き殴りノートに問いを立てる・論点＝行・ノートを閉じる・ウィザードと作成の実機経路（1つの連続したシナリオ。状態を引き継ぐので分けない）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js ui）
   照合する ID: IS-U1〜U28・UL1〜UL20（UL21〜 は cards 節）。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'ui',
  ids: 'IS-U1〜U28・UL1〜UL20',
  async run(ctx) {
    const { page, browser, r, eq, fileUrl, SAMPLE_MD, ready, setValue } = ctx;
  /* ========== UI 経路 ========== */

  /* IS-U26: 日付欄は今日が既定・チップ 今日/+1/+7 */
  const u26 = await page.evaluate(() => {
    const today = window.ToolEdit.today(), add = window.ToolEdit.addDays;
    const dl = document.getElementById('deadline');
    const dlChips = dl.nextElementSibling;
    document.getElementById('wizard-btn').click();
    const ms = document.getElementById('wz-milestone-due');
    const msChips = ms.nextElementSibling;
    const plus1 = Array.from(msChips.querySelectorAll('.date-chip')).find(c => c.textContent === '+1');
    plus1.click();
    const out = {
      today, deadlineDefault: dl.value,
      dlChips: dlChips && dlChips.classList.contains('date-chips'),
      msDefault: null, msAfter: ms.value, exp1: add(today, 1),
      msChipLabels: Array.from(msChips.querySelectorAll('.date-chip')).map(c => c.textContent),
    };
    document.getElementById('wz-close').click();
    return out;
  });
  r.check('IS-U26（締切もウィザードの日付も今日が既定・チップ 今日/+1/+7 で +1 が翌日になる）',
    u26.deadlineDefault === u26.today && u26.dlChips
    && JSON.stringify(u26.msChipLabels) === JSON.stringify(['今日', '+1', '+7'])
    && u26.msAfter === u26.exp1,
    JSON.stringify(u26));

  /* IS-U1: 貼る → 判定と md が出る */
  await setValue('#input', SAMPLE_MD);
  await page.waitForTimeout(400);
  const u1 = await page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll('#verdict li')).map(li => li.dataset.id),
    noPreview: !document.getElementById('output'),      // プレビューは廃止（IS-Q10）
  }));
  r.check('IS-U1（貼ると判定が更新される・md プレビューは存在しない）',
    u1.ids.length > 0 && u1.noPreview, JSON.stringify(u1));

  /* IS-U9: 掘削ログの「なぜ？」は判定対象外 */
  await setValue('#input', SAMPLE_MD + '\n\n## 掘ったログ\nなぜ？\nなぜ？\nなぜ？');
  await setValue('#deadline', '2026-09-30');
  await page.waitForTimeout(400);
  const u9 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#verdict li')).map(li => li.dataset.id));
  r.check('IS-U9（掘削ログに「なぜ？」があっても why は出ない — 判定は論点の1行目だけ）',
    !u9.includes('why'), JSON.stringify(u9));

  /* IS-U2: warn 0件で「まず外していない」 */
  const u2 = await page.evaluate(() => {
    const v = document.getElementById('verdict');
    return { text: v.textContent, ok: v.className.includes('verdict-ok') };
  });
  r.check('IS-U2（warn 0件のとき「まず外していない」が ok の見た目で出る）',
    u2.text.includes('外していない') && u2.ok, JSON.stringify(u2));

  /* ========== IS-UL1〜UL5: 一覧（画面の主） ========== */
  const mkNote = (o) => [
    '---', 'created: 2026-09-01', 'deadline: ' + (o.due || ''), 'status: ' + (o.status || 'open'),
    'verdict: ' + (o.verdict || ''), 'tags: [issue]', '---',
    '# ' + o.title, '',
    '## 2. 論点', '', '- ' + o.issue, '',
    '## 3. 絵コンテ', '', '- 【表】' + o.title + 'の表', '',
    '## 4. サブイシュー', '',
    '| 分からないこと | 聞く / 調べる / 試す | 誰に・どこで | いつまでに |',
    '| --- | --- | --- | --- |',
    '| 粒度 | 聞く | 柳葉さん | 2026-09-30 |', '',
    '## 5. 次の一手', '', '- [ ] ' + o.title + 'の一手', '',
    '---', '', '## 分かったこと', '', '- ', '', '## 結論', '', '- ', '',
  ].join('\n');

  const ul1 = await page.evaluate(async (notes) => {
    // **参照を差し替えないこと** — ダミーは閉包で files を握っているので、中身だけ入れ替える
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    for (const k of Object.keys(notes)) window.__fsa.files[k] = notes[k];
    window.__fsa.files['README.txt'] = 'md ではないので無視される';
    await window.issue.load();
    const cards = Array.from(document.querySelectorAll('.issue-card'));
    return {
      // ノート名は見出しにある（IS-Q23）。並びはノートのカードの順
      order: Array.from(document.querySelectorAll('.note-card .note-name')).map(e => e.textContent),
      issue0: cards[0].querySelector('.ic-issue').textContent,
      meta0: Array.from(cards[0].querySelectorAll('.ic-meta li')).map(li => li.textContent),
      due0: cards[0].querySelector('.ic-due').textContent,
      summary: document.getElementById('summary').textContent,
      warnBtn: !!cards.find(c => c.querySelector('.ic-warn')),
      okMarks: cards.filter(c => c.querySelector('.ic-ok')).length,
    };
  }, {
    'a.md': mkNote({ title: '遅い方', issue: 'Xは A ではなく B ではないか', due: '2026-12-31' }),
    'b.md': mkNote({ title: '急ぐ方', issue: 'Yは C ではなく D ではないか', due: '2026-09-25' }),
    'c.md': mkNote({ title: '閉じた方', issue: 'Zは E ではなく F ではないか', due: '2026-10-10', status: 'closed', verdict: '当たり' }),
  });
  r.check('IS-UL1（締切の早い順にカードが並び、論点・次の一手・サブ件数が出る・md 以外は無視）',
    eq(ul1.order, ['急ぐ方', '遅い方'])          // closed は既定フィルタで出ない
    && ul1.issue0 === 'Yは C ではなく D ではないか'
    && ul1.meta0.some(m => m.includes('次の一手')) && ul1.meta0.some(m => m.includes('サブイシュー 1件'))
    && ul1.due0.includes('2026-09-25')
    && ul1.summary.includes('2件')
    && ul1.okMarks === 2,          // どちらも締切・絵コンテ・サブがあるので引っかかりなし
    JSON.stringify(ul1));

  const ul2 = await page.evaluate(() => {
    const set = v => {
      document.querySelector('#f-status [data-v="' + v + '"]').click();
      return document.querySelectorAll('.issue-card').length;
    };
    return { open: set('open'), all: set('all'), closed: set('closed'), back: set('open') };
  });
  r.check('IS-UL2（フィルタ: 開いているもの2 / すべて3 / 閉じたもの1）',
    ul2.open === 2 && ul2.all === 3 && ul2.closed === 1 && ul2.back === 2,
    JSON.stringify(ul2));

  /* IS-UL5: vault 名が無ければ Obsidian リンクを作らない */
  const ul5 = await page.evaluate(() => {
    const before = document.querySelectorAll('.ic-obsidian').length;
    window.ToolConfig.set({ vaultName: 'MyVault' });
    document.getElementById('cfg-vault').value = 'MyVault';
    document.getElementById('cfg-vault').dispatchEvent(new Event('change', { bubbles: true }));
    const a = document.querySelector('.ic-obsidian');
    const href = a ? a.getAttribute('href') : '';
    document.getElementById('cfg-vault').value = '';   // 欄を空にしてから change（実際の操作と同じ）
    document.getElementById('cfg-vault').dispatchEvent(new Event('change', { bubbles: true }));
    return { before, href, after: document.querySelectorAll('.ic-obsidian').length };
  });
  r.check('IS-UL5（vault 名が未設定ならリンクを作らない・設定すると obsidian:// が出る）',
    ul5.before === 0 && ul5.href.indexOf('obsidian://open?vault=MyVault&file=') === 0
    && ul5.after === 0,
    JSON.stringify(ul5));

  /* IS-UL4: 外部で変わっていたら閉じない（鮮度チェック） */
  const ul4 = await page.evaluate(async () => {
    const card = document.querySelector('.issue-card');
    card.querySelector('.ic-close').click();
    window.__fsa.files['b.md'] = window.__fsa.files['b.md'] + '\n外部で追記された\n';
    const before = window.__fsa.files['b.md'];
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 300));
    return {
      err: document.getElementById('cm-err').textContent,
      errHidden: document.getElementById('cm-err').hidden,
      stillOpen: !document.getElementById('close-modal').hidden,
      unchanged: window.__fsa.files['b.md'] === before,
    };
  });
  r.check('IS-UL4（外部で変わっていたら書き込まず警告・ファイルは不変）',
    !ul4.errHidden && ul4.err.includes('Obsidian') && ul4.stillOpen && ul4.unchanged,
    JSON.stringify(ul4));

  /* IS-UL3: 閉じる → frontmatter が変わり結論に1行入る。本文の他は不変 */
  const ul3 = await page.evaluate(async () => {
    document.getElementById('cm-cancel').click();
    await window.issue.load();                       // 外部変更を取り込み直す
    const card = Array.from(document.querySelectorAll('.note-card'))
      .find(c => c.querySelector('.note-name').textContent === '急ぐ方');
    if (!card) return { noCard: true };
    const before = window.__fsa.files['b.md'];
    card.querySelector('.ic-close').click();
    document.querySelector('input[name="cm-v"][value="外れ"]').checked = true;
    const n = document.getElementById('cm-note');
    n.value = '粒度ではなく体制が原因だった';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    { const t = document.getElementById('cm-told'); if (t) t.value = 'PM に共有 → 体制の相談になった'; }
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['b.md'];
    // frontmatter を除いた本文が、追記した1行以外は同一か
    const bodyOf = t => t.split('\n---\n').slice(1).join('\n---\n');
    const strip = t => bodyOf(t).split('\n').filter(l => l !== '- 粒度ではなく体制が原因だった' && l !== '- 伝えた: PM に共有 → 体制の相談になった').join('\n');
    return {
      closedModal: document.getElementById('close-modal').hidden,
      status: /^status: closed$/m.test(after),
      verdict: /^verdict: 外れ$/m.test(after),
      conclusion: after.indexOf('## 結論') >= 0
        && after.slice(after.indexOf('## 結論')).includes('- 粒度ではなく体制が原因だった'),
      bodyOtherwiseSame: strip(after) === bodyOf(before),
      told: after.slice(after.indexOf('## 結論')).includes('- 伝えた: PM に共有 → 体制の相談になった'),
      nowClosedInList: Array.from(document.querySelectorAll('.note-card .note-name'))
        .every(e => e.textContent !== '急ぐ方'),
    };
  });
  r.check('IS-UL3（閉じると status/verdict が変わり結論に1行入る・本文の他は不変・一覧から外れる）',
    ul3.closedModal && ul3.status && ul3.verdict && ul3.conclusion
    && ul3.bodyOtherwiseSame && ul3.nowClosedInList,
    JSON.stringify(ul3));

  /* ========== IS-UL6/UL7: 書き殴りノートに問いを立てる（実測に合わせた経路） ========== */
  const SCRIB = [
    '---', 'created: 2026-09-24', 'status: open', 'tags:', '  - issue', '---',
    '# 20260924_現状整理', '',
    '## 1. イシューを見極める', '',
    '- 現状を整理し、今後の進め方の確認をする。',
    '\t- V13利用期限のカウントダウンはもう始まっている', '',
    'TODO', '- 富士通にV13の再受領の確認(ITK)', '',
    '## 12月本番運用開始(2019 )', '- お客さんの受け入れ', '',
  ].join('\n');

  const ul6 = await page.evaluate(async (scr) => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.files['d.md'] = scr;
    await window.issue.load();
    const art = document.querySelector('.issue-card');
    const btn = art.querySelector('.ic-issue');
    const emptyLabel = btn.textContent;
    btn.click();                                        // その場編集を開く
    const line = art.querySelector('.ic-edit-line');
    line.value = '手順書が書けないのは情報不足ではなく合意が無いからではないか';
    line.dispatchEvent(new Event('input', { bubbles: true }));
    const due = art.querySelector('.ic-edit-due');
    due.value = '2026-09-30';
    due.dispatchEvent(new Event('input', { bubbles: true }));
    const liveIds = Array.from(art.querySelectorAll('.ic-edit .ic-verdicts li')).map(li => li.dataset.id);
    const staleHidden = !art.querySelector('.ic-warn') || art.querySelector('.ic-warn').hidden;
    art.querySelector('.ic-edit-save').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['d.md'];
    return {
      emptyLabel, liveIds, after, staleHidden,
      shownIssue: (document.querySelector('.ic-issue') || {}).textContent,
      keptScribble: after.includes('TODO') && after.includes('- 富士通にV13の再受領の確認(ITK)')
        && after.includes('## 12月本番運用開始(2019 )')
        && after.includes('\t- V13利用期限のカウントダウンはもう始まっている'),
    };
  }, SCRIB);
  r.check('IS-UL6（カードで論点を一行だけ書ける: その場判定 → 本文の先頭に節ができ、書き殴りは残る）',
    ul6.emptyLabel.includes('論点を一行で')
    && ul6.liveIds.length > 0 && ul6.staleHidden   // 古い件数と並べない
    && ul6.after.includes('## 2. 論点')
    && ul6.after.indexOf('## 2. 論点') < ul6.after.indexOf('## 1. イシューを見極める')
    && /^deadline: 2026-09-30$/m.test(ul6.after)
    && ul6.keptScribble
    && ul6.shownIssue.includes('情報不足ではなく'),
    JSON.stringify({ liveIds: ul6.liveIds, kept: ul6.keptScribble, shown: ul6.shownIssue }));

  const ul7 = await page.evaluate(async () => {
    const art = document.querySelector('.issue-card');
    art.querySelector('.ic-frame').click();             // このノートに問いを立てる
    const opened = {
      label: document.getElementById('wz-create').textContent,
      sourceShown: !document.getElementById('wz-source').hidden,
      sourceHasScribble: document.getElementById('wz-source-text').textContent.includes('TODO'),
    };
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    { const k = document.getElementById('wz-kind-a'); if (k) k.click(); }
    set('#wz-milestone', '運営チームが本番を止められる状態');
    set('#wz-milestone-due', '2026-10-02');
    const prefilled = document.getElementById('wz-milestone').value;
    document.getElementById('wz-next').click();          // → Step 2
    const cand = document.querySelector('.wz-c-text').value;   // 既存の論点が初期値
    set('#wz-issue-due', '2026-09-30');
    document.getElementById('wz-next').click();          // → Step 3
    set('#wz-picture', '粒度ごとに実行できたかの表');
    document.getElementById('wz-next').click();          // → Step 4
    document.getElementById('wz-next').click();          // → Step 5
    const hasTitleField = !!document.getElementById('wz-note-title');
    set('#wz-next-what', '粒度を確認する');
    document.getElementById('wz-create').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['d.md'];
    return {
      ...opened, prefilled, cand, hasTitleField,
      files: Object.keys(window.__fsa.files).length,
      frameFirst: after.indexOf('## 1. ゴール') < after.indexOf('## 1. イシューを見極める'),
      hasFive: ['## 1. ゴール', '## 2. 論点', '## 3. 最終形', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => after.includes(h)),
      kept: after.includes('TODO') && after.includes('## 12月本番運用開始(2019 )'),
      deadline: /^deadline: 2026-09-30$/m.test(after),
      closed: document.getElementById('wizard').hidden,
    };
  });
  r.check('IS-UL7（既存ノートに問いを立てる: 元の中身を見ながら書け、5段が先頭に入り、新規ノートは増えず、書き殴りも残る）',
    ul7.label === 'このノートに書き込む' && ul7.sourceShown && ul7.sourceHasScribble
    && ul7.cand.includes('情報不足ではなく')          // 既存の論点が初期値に入る
    && ul7.hasTitleField === false                    // 既存なのでノート名は聞かない
    && ul7.files === 1 && ul7.frameFirst && ul7.hasFive && ul7.kept && ul7.deadline && ul7.closed,
    JSON.stringify(ul7));

  /* ========== IS-UL8〜UL11: 論点＝行（1ノート : N論点） ========== */
  const LINES_MD = [
    '---', 'created: 2026-09-24', 'status: open', 'project: PEW', 'tags: [issue]', '---',
    '# 20260924_現状整理', '',
    '## 論点', '',
    '- [ ] 手順書が書けないのは粒度の合意が無いからではないか \u{1F4C5} 2026-09-30',
    '- [ ] V13 は再受領の可否が未確認だからではないか \u{1F4C5} 2026-10-02',
    '- [x] 検証は OS のみでよいのではないか \u{2705} 2026-09-20 外れ', '',
    'TODO', '- 富士通に確認', '',
  ].join('\n');
  const PLAIN_MD = ['---', 'created: 2026-09-20', 'status: open', 'tags: [issue]', '---',
    '# 書き殴りだけ', '', '- なんとなく気になること', ''].join('\n');

  const ul8 = await page.evaluate(async (seed) => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.files['lines.md'] = seed.lines;
    window.__fsa.files['plain.md'] = seed.plain;
    await window.issue.load();
    const count = () => document.querySelectorAll('.issue-card').length;
    const heads = () => Array.from(document.querySelectorAll('.note-name')).map(e => e.textContent);
    const open = { cards: count(), heads: heads() };
    document.querySelector('#f-status [data-v="all"]').click();
    const all = count();
    document.querySelector('#f-status [data-v="open"]').click();
    return {
      open, all,
      firstIssue: document.querySelector('.issue-card .ic-issue').textContent,
      // **1枚目（行カード）だけ**を見る。plain.md のノートカードには正しく .ic-title がある
      noTitleOnLine: !document.querySelector('.issue-card').querySelector('.ic-title'),
      // ノート名は見出し（.note-name）にだけある。plain.md のノートカードの行にも .ic-title は無い（IS-Q23）
      titleOnNoteCard: !document.querySelectorAll('.issue-card')[2].querySelector('.ic-title')
        && document.querySelectorAll('.note-card').length === 2,
      addBtns: document.querySelectorAll('.note-add').length,
    };
  }, { lines: LINES_MD, plain: PLAIN_MD });
  r.check('IS-UL8（`## 論点` があれば行ごとにカード・無ければノートで1枚・見出しでグループ化）',
    ul8.open.cards === 3            // 行2枚（開）＋ plain.md のノートカード1枚
    && ul8.all === 4                // 閉じた行を含めて4枚
    && ul8.open.heads.length === 2  // ノート見出しが2つ
    && ul8.firstIssue.includes('粒度の合意')
    && ul8.noTitleOnLine && ul8.titleOnNoteCard   // 行は名前を持たず、ノートのカードの見出しが持つ
    && ul8.addBtns === 2,
    JSON.stringify(ul8));

  const ul9 = await page.evaluate(async () => {
    // 「書き殴りだけ」= `## 論点` が無いノートにも足せる（行モデルへの移行がここから始まる）
    const heads = Array.from(document.querySelectorAll('.note-head'));
    const target = heads.find(h => h.querySelector('.note-name').textContent.includes('書き殴りだけ'));
    target.querySelector('.note-add').click();
    const box = target.nextSibling;
    const line = box.querySelector('.ic-edit-line');
    line.value = '気になることは A ではなく B ではないか';
    line.dispatchEvent(new Event('input', { bubbles: true }));
    const liveIds = Array.from(box.querySelectorAll('.ic-verdicts li')).map(li => li.dataset.id);
    box.querySelector('.ic-edit-save').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['plain.md'];
    return {
      liveIds, after,
      hasSection: after.includes('## 論点'),
      hasLine: after.includes('- [ ] 気になることは A ではなく B ではないか'),
      keptScribble: after.includes('- なんとなく気になること'),
      cards: document.querySelectorAll('.issue-card').length,
    };
  });
  r.check('IS-UL9（＋論点を足す: 節が無いノートにも作れる・その場判定・書き殴りは残る）',
    ul9.hasSection && ul9.hasLine && ul9.keptScribble
    && ul9.liveIds.indexOf('picture') === -1 && ul9.liveIds.indexOf('evidence') === -1  // 行段階では問わない
    && ul9.cards === 3,
    JSON.stringify({ liveIds: ul9.liveIds, cards: ul9.cards }));

  const ul10 = await page.evaluate(async () => {
    const card = Array.from(document.querySelectorAll('.issue-card'))
      .find(c => c.querySelector('.ic-issue').textContent.includes('粒度の合意'));
    const before = window.__fsa.files['lines.md'];
    card.querySelector('.ic-close').click();
    document.querySelector('input[name="cm-v"][value="当たり"]').checked = true;
    const n = document.getElementById('cm-note');
    n.value = '粒度未合意が原因だった';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    { const t = document.getElementById('cm-told'); if (t) t.value = '柳葉さんに共有 → 粒度が決まった'; }
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['lines.md'];
    return {
      closedLine: /- \[x\] 手順書が書けないのは粒度の合意が無いからではないか .*当たり/.test(after),
      hasDone: /\u{2705}\s*\d{4}-\d{2}-\d{2}/u.test(after.split('\n').find(l => l.includes('粒度の合意')) || ''),
      child: after.includes('\t- 粒度未合意が原因だった'),
      toldOrder: after.indexOf('\t- 伝えた: 柳葉さんに共有 → 粒度が決まった') === after.indexOf('\t- 粒度未合意が原因だった') + '\t- 粒度未合意が原因だった\n'.length,
      otherLineIntact: after.includes('- [ ] V13 は再受領の可否が未確認だからではないか \u{1F4C5} 2026-10-02'),
      scribble: after.includes('TODO') && after.includes('- 富士通に確認'),
      frontmatterIntact: /^status: open$/m.test(after),   // ノートの状態は触らない
      gone: !Array.from(document.querySelectorAll('.ic-issue')).some(e => e.textContent.includes('粒度の合意')),
    };
  });
  r.check('IS-UL10（行を閉じる: [x]＋✅＋判定・分かったことは子行・他の行とノートの状態は不変）',
    ul10.closedLine && ul10.hasDone && ul10.child && ul10.otherLineIntact
    && ul10.scribble && ul10.frontmatterIntact && ul10.gone,
    JSON.stringify(ul10));
  r.check('IS-UL15（閉じるの「伝えた先」: 行は分かったことの子行の直後に `\\t- 伝えた: …`・ノートは `## 結論` に `- 伝えた: …`）',
    ul10.toldOrder && ul3.told, JSON.stringify({ toldOrder: ul10.toldOrder, told: ul3.told }));

  const ul11 = await page.evaluate(async () => {
    const card = Array.from(document.querySelectorAll('.issue-card'))
      .find(c => c.querySelector('.ic-issue').textContent.includes('V13'));
    card.querySelector('.ic-frame').click();
    const label = document.getElementById('wz-create').textContent;
    const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    { const k = document.getElementById('wz-kind-a'); if (k) k.click(); }
    set('#wz-milestone', 'V13 を期限内に再受領できている');
    set('#wz-milestone-due', '2026-10-02');
    document.getElementById('wz-next').click();
    const cand = document.querySelector('.wz-c-text').value;
    set('#wz-issue-due', '2026-10-02');
    document.getElementById('wz-next').click();
    set('#wz-picture', '再受領の可否と期限の対応表');
    document.getElementById('wz-next').click();
    document.getElementById('wz-next').click();
    set('#wz-next-what', 'ITK 経由で富士通に聞く');
    set('#wz-note-title', 'V13再受領');
    const pj = document.getElementById('wz-project');
    const projInit = pj ? pj.value : null;
    const projList = Array.from(document.querySelectorAll('#wz-project-list option')).map(o => o.value);
    document.getElementById('wz-create').click();
    await new Promise(d => setTimeout(d, 500));
    const names = Object.keys(window.__fsa.files);
    const made = names.find(n => n.includes('V13再受領'));
    const src = window.__fsa.files['lines.md'];
    return {
      label, cand, made,
      linked: src.includes('[[' + String(made).replace(/\.md$/, '') + ']]'),
      backLink: made ? window.__fsa.files[made].includes('← [[lines]]') : false,
      hasFive: made ? ['## 1. ゴール', '## 3. 最終形', '## 5. 次の一手'].every(h => window.__fsa.files[made].includes(h)) : false,
      spunBtn: !!Array.from(document.querySelectorAll('.ic-spun')).find(e => e.textContent.includes('V13再受領')),
      projInit, projList,
      madeProject: made ? /^project: PEW$/m.test(window.__fsa.files[made]) : false,
    };
  });
  r.check('IS-UL11（切り出し: 新ノート（5段）ができ、元の行に [[リンク]]、新ノートに ← 逆リンク）',
    ul11.label === '切り出して作成' && ul11.cand.includes('V13')
    && !!ul11.made && ul11.linked && ul11.backLink && ul11.hasFive && ul11.spunBtn,
    JSON.stringify(ul11));
  r.check('IS-UL18a（切り出し: Step 5 の案件欄は元ノートの project（PEW）が初期値・候補に PEW・作ったノートに project: PEW）',
    ul11.projInit === 'PEW' && (ul11.projList || []).includes('PEW') && ul11.madeProject,
    JSON.stringify({ projInit: ul11.projInit, projList: ul11.projList, madeProject: ul11.madeProject }));

  /* ========== IS-UL12〜UL14 / IS-U24〜U25: 監査（R1/R6/R7/R8/R10）で足したもの ========== */
  const AUD = [
    '---', 'created: 2026-09-24', 'status: open', 'project: ITK', 'tags: [issue]', '---',
    '# 20260924_現状整理', '',
    '## 論点', '',
    '- [ ] 手順書が書けないのは粒度の合意が無いからではないか \u{1F4C5} 2026-09-30',
    '- [ ] V13 は再受領の可否が未確認だからではないか \u{1F4C5} 2026-10-02',
    '- [x] 検証は OS のみでよいのではないか \u{1F4C5} 2026-09-20 \u{2705} 2026-09-22 外れ',
    '\t- Interstage も一緒に上げないと比較できなかった',
    '- [x] 本番停止は運営チームに任せられるのではないか \u{2705} 2026-09-19 当たり', '',
    '## 掘る', '- TODO', '',
  ].join('\n');

  // IS-UL12: ［タスクにする…］→ Plan Tasks へ論点つきで渡す（遷移は send をスタブして止める）
  const ul12 = await page.evaluate(async (seed) => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.files['aud.md'] = seed;
    await window.issue.load();
    const sent = [];
    const orig = window.ToolHandoff.send;
    window.ToolHandoff.send = (to, kind, text, path) => { sent.push({ to, kind, text: JSON.parse(text), path }); };
    const card = Array.from(document.querySelectorAll('.issue-card'))
      .find(c => c.querySelector('.ic-issue').textContent.includes('粒度の合意'));
    card.querySelector('.ic-task').click();
    window.ToolHandoff.send = orig;
    return sent[0] || null;
  }, AUD);
  r.check('IS-UL12（タスクにする: Plan Tasks へ 論点・関連ノート・期限 を添えて渡す）',
    !!ul12 && ul12.to === 'taskboard' && ul12.kind === 'task' && ul12.path === 'taskboard.html'
    && ul12.text.issue.includes('粒度の合意') && ul12.text.memo.startsWith('論点: ')
    && ul12.text.link === 'aud' && ul12.text.due === '2026-09-30' && ul12.text.content === '',
    JSON.stringify(ul12));
  r.check('IS-UL19（タスクにする: ノートの project（ITK）も Plan Tasks へ渡す）',
    !!ul12 && ul12.text.project === 'ITK', JSON.stringify(ul12 && ul12.text));

  // IS-UL13: 切り出しのウィザードに、同じノートの他の開いている論点が候補として入る
  const ul13 = await page.evaluate(() => {
    const card = Array.from(document.querSelectorAll ? [] : document.querySelectorAll('.issue-card'))
      .find(c => c.querySelector('.ic-issue').textContent.includes('粒度の合意'));
    card.querySelector('.ic-frame').click();
    const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    { const k = document.getElementById('wz-kind-a'); if (k) k.click(); }
    set('#wz-milestone', 'M'); set('#wz-milestone-due', '2026-10-02');
    document.getElementById('wz-next').click();
    const cands = Array.from(document.querySelectorAll('.wz-c-text')).map(i => i.value);
    const ids = Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id);
    document.getElementById('wz-close').click();
    return { cands, ids };
  });
  r.check('IS-UL13（切り出し時、同じノートの他の開いている論点が候補に並ぶ・閉じた行は入らない）',
    ul13.cands.length === 2 && ul13.cands[0].includes('粒度の合意') && ul13.cands[1].includes('V13')
    && !ul13.cands.some(c => c.includes('OS のみ')) && !ul13.ids.includes('alternatives'),
    JSON.stringify(ul13));
  r.check('IS-U24（Step 2 の判定は論点の段階だけ — 絵コンテ・サブイシューの警告を出さない）',
    !ul13.ids.includes('picture') && !ul13.ids.includes('evidence'),
    JSON.stringify(ul13.ids));

  // IS-UL14: 閉じたカードに 判定＋分かったこと・集計・超過を出さない
  const ul14 = await page.evaluate(() => {
    document.querySelector('#f-status [data-v="closed"]').click();
    const cards = Array.from(document.querySelectorAll('.issue-card'));
    const os = cards.find(c => c.querySelector('.ic-issue').textContent.includes('OS のみ'));
    const out = {
      summary: document.getElementById('summary').textContent,
      metaOS: Array.from(os.querySelectorAll('.ic-meta li')).map(li => li.textContent).join(' | '),
      dueOS: os.querySelector('.ic-due').textContent,
      overClass: os.querySelector('.ic-due').className,
      closeBtn: !!os.querySelector('.ic-close'),
    };
    document.querySelector('#f-status [data-v="open"]').click();
    return out;
  });
  r.check('IS-UL14（閉じたカード: 判定と分かったことが出る・集計「当たり1・外れ1」・超過を赤で出さない）',
    ul14.metaOS.includes('判定: 外れ') && ul14.metaOS.includes('Interstage も一緒に上げないと比較できなかった')
    && ul14.summary.includes('当たり 1') && ul14.summary.includes('外れ 1')
    && ul14.dueOS.includes('2026-09-22') && !ul14.overClass.includes('is-over')
    && ul14.closeBtn === false,
    JSON.stringify(ul14));

  /* ========== IS-UL16/UL17: ノートを閉じる（IS-Q20） ========== */
  const N1 = ['---', 'created: 2026-09-20', 'status: open', 'tags: [issue]', '---', '# ノート1', '',
    '## 論点', '', '- [ ] 甲は A ではなく B ではないか \u{1F4C5} 2026-10-01', '- [ ] 乙は C ではなく D ではないか \u{1F4C5} 2026-10-02', '',
    '## 掘る', '- メモ1', ''].join('\n');
  const N2 = ['---', 'created: 2026-09-20', 'status: open', 'tags: [issue]', '---', '# ノート2', '',
    '## 論点', '', '- [ ] 丙は E ではなく F ではないか \u{1F4C5} 2026-10-03', '', '## 掘る', '- メモ2', ''].join('\n');
  const ul16 = await page.evaluate(async ([n1, n2]) => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.files['n1.md'] = n1; window.__fsa.files['n2.md'] = n2;
    document.querySelector('#f-status [data-v="open"]').click();
    await window.issue.load();
    const head = Array.from(document.querySelectorAll('.note-head')).find(h => h.textContent.includes('ノート1'));
    const btn = head && head.querySelector('.note-close');
    if (!btn) return { noBtn: true };
    btn.click();
    const target = document.getElementById('cm-target').textContent;
    document.querySelector('input[name="cm-v"][value="外れ"]').checked = true;
    document.getElementById('cm-note').value = '分かった1';
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['n1.md'];
    const openIssues = Array.from(document.querySelectorAll('.ic-issue')).map(e => e.textContent);
    document.querySelector('#f-status [data-v="closed"]').click();
    const closedIssues = Array.from(document.querySelectorAll('.ic-issue')).map(e => e.textContent);
    const headAfter = Array.from(document.querySelectorAll('.note-head')).find(h => h.textContent.includes('ノート1'));
    const btnGone = !headAfter || !headAfter.querySelector('.note-close');
    document.querySelector('#f-status [data-v="open"]').click();
    return {
      target, btnGone,
      status: /^status: closed$/m.test(after), verdict: /^verdict: 外れ$/m.test(after),
      closed: /^closed: \d{4}-\d{2}-\d{2}$/m.test(after),
      conclusion: after.slice(after.indexOf('## 結論')).includes('- 分かった1'),
      scribble: after.includes('- メモ1'),
      openHasN1: openIssues.some(t => t.includes('甲は')), openHasN2: openIssues.some(t => t.includes('丙は')),
      closedHasN1: closedIssues.some(t => t.includes('甲は')),
    };
  }, [N1, N2]);
  r.check('IS-UL16（見出しの［ノートを閉じる…］: frontmatter に status/verdict/closed・結論に1行・書き殴りは不変・行は「閉じたもの」へ・ボタンは消える）',
    !ul16.noBtn && ul16.target.includes('ノート1') && ul16.status && ul16.verdict && ul16.closed && ul16.conclusion
    && ul16.scribble && !ul16.openHasN1 && ul16.openHasN2 && ul16.closedHasN1 && ul16.btnGone,
    JSON.stringify(ul16));

  const ul17 = await page.evaluate(async () => {
    const card = Array.from(document.querySelectorAll('.issue-card'))
      .find(c => c.querySelector('.ic-issue') && c.querySelector('.ic-issue').textContent.includes('丙は'));
    if (!card) return { noCard: true };
    card.querySelector('.ic-close').click();
    document.querySelector('input[name="cm-v"][value="当たり"]').checked = true;
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 400));
    const b = document.getElementById('banner');
    const offer = b && Array.from(b.querySelectorAll('button')).find(x => x.textContent.includes('ノートも閉じる'));
    if (!offer) return { noOffer: true, banner: b ? b.textContent : '' };
    offer.click();
    await new Promise(d => setTimeout(d, 50));
    const opened = !document.getElementById('close-modal').hidden;
    const target = document.getElementById('cm-target').textContent;
    document.getElementById('cm-cancel').click();
    return { opened, target, lineClosed: /- \[x\] 丙は .*当たり/.test(window.__fsa.files['n2.md']) };
  });
  r.check('IS-UL17（最後の開いている行を閉じると、バナーに［ノートも閉じる…］が出て、押すとそのノートでモーダルが開く）',
    !ul17.noCard && !ul17.noOffer && ul17.opened && ul17.target.includes('ノート2') && ul17.lineClosed,
    JSON.stringify(ul17));

  const ul20 = await page.evaluate(async () => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.files['q.md'] = ['---', 'status: open', 'tags: [issue]', '---', '# 確認', '', '## 論点', '',
      '- [ ] JP1でFTP通信をしているものがあるか。 \u{1F4C5} 2026-09-30', ''].join('\n');
    document.querySelector('#f-status [data-v="open"]').click();
    await window.issue.load();
    const card = document.querySelector('.issue-card');
    return { warn: !!(card && card.querySelector('.ic-warn')), ok: !!(card && card.querySelector('.ic-ok')) };
  });
  r.check('IS-UL20（論点の行が「〜があるか。」のカードは ✓ ではなく ⚠）', ul20.warn && !ul20.ok, JSON.stringify(ul20));


  // IS-U25: 初見（ノート0）は使い方が開いている・ノートがあれば強制しない
  const u25 = await page.evaluate(async () => {
    const withNotes = document.getElementById('howto').open;
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    document.getElementById('howto').open = false;
    await window.issue.load();
    const empty = document.getElementById('howto').open;
    const steps = document.querySelectorAll('#howto ol li').length;
    return { withNotes, empty, steps, label: document.getElementById('wizard-btn').textContent,
      notPrimary: !document.getElementById('wizard-btn').classList.contains('primary') };
  });
  r.check('IS-U25（初見: ノート0なら使い方が開く・3手順・「新しく立てる」は主役ではない）',
    u25.empty === true && u25.steps === 3 && u25.label.includes('新しく立てる') && u25.notPrimary,
    JSON.stringify(u25));

  /* IS-U4: tasks.md 用の行をコピー（md のコピーは FSA 非対応時のみなので IS-U12 で見る） */
  const u4 = await page.evaluate(async () => {
    let got = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async t => { got = t; } },
    });
    document.getElementById('copy-tasks-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return { text: got, label: document.getElementById('copy-tasks-btn').textContent };
  });
  r.check('IS-U4（tasks.md 用の行をコピー: Tasks 記法が渡る）',
    typeof u4.text === 'string' && u4.text.includes('- [ ] 粒度を確認する')
    && u4.text.includes('📅 2026-09-30'),
    JSON.stringify(u4.text));

  /* IS-U6: Cmd/Ctrl+Enter は「そのとき有効な方」= FSA があるので作成 */
  const u6 = await page.evaluate(async () => {
    const before = Object.keys(window.__fsa.files).length;
    document.getElementById('title').value = 'ショートカット検証';
    document.getElementById('title').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 300));
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 400));
    const names = Object.keys(window.__fsa.files);
    return { before: before, after: names.length,
      made: names.some(n => n.includes('ショートカット検証')) };
  });
  r.check('IS-U6（Cmd/Ctrl+Enter で［04_Issues にノートを作成］が発火）',
    u6.after === u6.before + 1 && u6.made, JSON.stringify(u6));

  /* IS-U22: コピーボタンは FSA が無いときだけ出る（プレビューは常に出る） */
  const u22 = await page.evaluate(() => ({
    copyHidden: document.getElementById('copy-btn').hidden,
    listVisible: !!document.getElementById('cards'),
    pasteFolded: document.getElementById('paste-box').open === false,
    tasksCopyVisible: !document.getElementById('copy-tasks-btn').hidden,
  }));
  r.check('IS-U22（FSA あり: ［md をコピー］は隠れ、一覧が主・貼る欄は畳まれている）',
    u22.copyHidden === true && u22.listVisible && u22.tasksCopyVisible && u22.pasteFolded,
    JSON.stringify(u22));

  /* IS-U5: pagehide フラッシュ → reload で復元 */
  await setValue('#title', '停止手順書');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  const u5 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:issue'));
    return {
      input: document.getElementById('input').value.slice(0, 20),
      title: document.getElementById('title').value,
      deadline: document.getElementById('deadline').value,
      tool: env && env.tool, v: env && env.v,
    };
  });
  r.check('IS-U5（pagehide → reload で入力・タイトル・締切が復元・tools:issue envelope）',
    u5.input.includes('本番停止手順書') && u5.title === '停止手順書'
    && u5.deadline === '2026-09-30' && u5.tool === 'issue' && u5.v === 1,
    JSON.stringify(u5));

  /* IS-U7: サンプルは入力が空のときだけ */
  const u7 = await page.evaluate(async () => {
    window.ToolStorage.save = () => true;   // サンプルを保存状態に残さない
    const hiddenWhenFilled = document.getElementById('sample-btn').hidden;
    const i = document.getElementById('input');
    i.value = '';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    const visibleWhenEmpty = !document.getElementById('sample-btn').hidden;
    document.getElementById('sample-btn').click();
    await new Promise(d => setTimeout(d, 400));
    return {
      hiddenWhenFilled, visibleWhenEmpty,
      hiddenAfter: document.getElementById('sample-btn').hidden,
      hasInput: document.getElementById('input').value.includes('## 2. 論点'),
      hasVerdict: document.querySelectorAll('#verdict li').length >= 0,
    };
  });
  r.check('IS-U7（サンプルは空のときだけ表示・投入で md まで埋まる）',
    u7.hiddenWhenFilled && u7.visibleWhenEmpty && u7.hiddenAfter && u7.hasInput,
    JSON.stringify(u7));

  /* IS-U10: ノートを直接作る */
  const u10 = await page.evaluate(async () => {
    document.getElementById('create-btn').click();
    await new Promise(d => setTimeout(d, 300));
    const names = Object.keys(window.__fsa.files);
    const b = document.getElementById('banner');
    return {
      picked: window.__fsa.picked, names: names,
      body: names.length ? window.__fsa.files[names[0]] : '',
      banner: b.textContent, kind: b.className, hidden: b.hidden,
      expected: window.issue.noteFileName(document.getElementById('title').value,
        new Date().toISOString().slice(0, 10)),
    };
  });
  r.check('IS-U10（04_Issues にノートを作成: ピッカー→規約どおりのファイル名→右ペインと同じ md→success）',
    u10.picked >= 1 && u10.names.length === 1 && u10.names[0] === u10.expected
    && u10.body.includes('status: open') && u10.body.includes('## 2. 論点')
    && !u10.hidden && u10.kind.includes('banner-success') && u10.banner.includes(u10.expected),
    JSON.stringify({ picked: u10.picked, names: u10.names, banner: u10.banner, kind: u10.kind }));
  r.check('IS-U10b（ボタンから作ったノートに project 行が入らない — クリックイベントを案件として書かない）',
    u10.body !== '' && !/^project:/m.test(u10.body), (u10.body.split('---')[1] || '').trim());

  /* IS-U11: 同名は上書きしない */
  const u11 = await page.evaluate(async () => {
    const name = Object.keys(window.__fsa.files)[0];
    window.__fsa.files[name] = 'SENTINEL';      // 触られないことを目印で見る
    document.getElementById('create-btn').click();
    await new Promise(d => setTimeout(d, 300));
    const b = document.getElementById('banner');
    return {
      body: window.__fsa.files[name], count: Object.keys(window.__fsa.files).length,
      banner: b.textContent, kind: b.className,
    };
  });
  r.check('IS-U11（同名のノートがあれば上書きせず warn で止まる）',
    u11.body === 'SENTINEL' && u11.count === 1
    && u11.kind.includes('banner-warn') && u11.banner.includes('既に'),
    JSON.stringify(u11));

  /* IS-U19: モードセグメント */
  const u19 = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('nav.modes a'));
    return {
      hrefs: links.map(a => a.getAttribute('href')),
      labels: links.map(a => a.textContent.trim()),
      current: links.filter(a => a.getAttribute('aria-current') === 'page')
        .map(a => a.textContent.trim()),
    };
  });
  r.check('IS-U19（モードセグメント: Plan Tasks へ行けて、自分側が aria-current="page"）',
    u19.hrefs.includes('taskboard.html') && u19.labels.some(l => l.includes('タスク'))
    && u19.current.length === 1 && u19.current[0].includes('イシュー'),
    JSON.stringify(u19));

  /* IS-U13: ウィザードが開く */
  const u13 = await page.evaluate(() => {
    document.getElementById('wizard-btn').click();
    return {
      open: !document.getElementById('wizard').hidden,
      step: document.getElementById('wz-step').textContent,
      dots: document.getElementById('wz-dots').textContent,
      hasField: !!document.getElementById('wz-milestone'),
      hasKind: !!document.getElementById('wz-kind-a') && !!document.getElementById('wz-kind-b')
        && !document.getElementById('wz-kind-a').checked && !document.getElementById('wz-kind-b').checked,
      why: document.getElementById('wz-why').textContent,
    };
  });
  r.check('IS-U13（［イシューを書く］で Step 1/5 が開く・進捗と「なぜ聞くか」・型のラジオ（既定なし）が出る）',
    u13.open && u13.step.includes('1') && u13.step.includes('5')
    && u13.dots.startsWith('●') && u13.hasField && u13.hasKind && u13.why.length > 0,
    JSON.stringify(u13));

  /* IS-U27: 型（改訂版）。選ばないと進めない・(B) で欄が変わる・(A) に戻せる */
  const u27 = await page.evaluate(() => {
    const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('#wz-milestone', 'M'); set('#wz-milestone-due', '2026-10-02');
    document.getElementById('wz-next').click();
    const blocked = !!document.getElementById('wz-milestone') && !document.getElementById('wz-err').hidden;
    const err = document.getElementById('wz-err').textContent;
    { const k = document.getElementById('wz-kind-b'); if (k) k.click(); }
    const bField = !!document.getElementById('wz-visions') && !document.getElementById('wz-milestone');
    const bLabel = document.getElementById('wz-body').textContent;
    { const k = document.getElementById('wz-kind-a'); if (k) k.click(); }
    const aField = !!document.getElementById('wz-milestone') && !document.getElementById('wz-visions');
    // 未実装で Step 2 へ進んでしまった場合は戻す（RED をハーネス落ちにしない）。U14（空で止まる）のために空へ
    if (!document.getElementById('wz-milestone')) document.getElementById('wz-prev').click();
    if (document.getElementById('wz-milestone')) set('#wz-milestone', '');
    return { blocked, err, bField, bLabel: bLabel.includes('目指す姿'), aField };
  });
  r.check('IS-U27（型を選ばないと Step 1 から進めず理由に「型」・(B) で欄が「目指す姿の候補」に変わる・(A) で戻る）',
    u27.blocked && u27.err.includes('型') && u27.bField && u27.bLabel && u27.aField, JSON.stringify(u27));

  /* IS-U14: Step 1 は必須（マイルストーンを飛ばせない） */
  const u14 = await page.evaluate(() => {
    document.getElementById('wz-next').click();
    return {
      step: document.getElementById('wz-step').textContent,
      err: document.getElementById('wz-err').textContent,
      errHidden: document.getElementById('wz-err').hidden,
      stillStep1: !!document.getElementById('wz-milestone'),
    };
  });
  r.check('IS-U14（Step 1 が空だと進まず、理由がその場に出る）',
    u14.stillStep1 && !u14.errHidden && u14.err.length > 0 && u14.step.includes('1'),
    JSON.stringify(u14));

  /* IS-U15: Step 2（論点の候補）でその場判定 */
  const setV = (sel, val) => page.evaluate(([s2, v]) => {
    const el = document.querySelector(s2);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);
  // 要素が無ければ何もしない（未実装のときにハーネスごと落とさず fail として数える）
  const setIf = (sel, val) => page.evaluate(([s2, v]) => {
    const el = document.querySelector(s2);
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);

  await setV('#wz-milestone', '運営チームが本番を止められる状態');
  await setV('#wz-milestone-due', '2026-10-02');
  await page.click('#wz-next');                       // → Step 2
  await setV('.wz-c-text', '現状を整理する');
  await page.waitForTimeout(200);
  const u15 = await page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id),
  }));
  r.check('IS-U15（Step 2 の候補に「現状を整理する」でその場で worktheme の warn）',
    u15.ids.includes('worktheme') && u15.ids.includes('alternatives'),
    JSON.stringify(u15.ids));

  /* IS-U17: Esc で閉じても下書きは残る（非破壊） */
  const u17 = await page.evaluate(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Escape', bubbles: true, cancelable: true }));
    const closed = document.getElementById('wizard').hidden;
    document.getElementById('wizard-btn').click();
    return { closed: closed, reopened: !document.getElementById('wizard').hidden,
      kept: (document.querySelector('.wz-c-text') || {}).value };
  });
  r.check('IS-U17（Esc で閉じても下書きが残り、開き直すと同じ位置・同じ内容）',
    u17.closed && u17.reopened && u17.kept === '現状を整理する', JSON.stringify(u17));

  /* IS-U21: 候補を2つ書いて2つ目を選ぶと、それが論点になり alternatives が消える */
  await setV('.wz-c-text', '手順書が書けないのは情報不足ではなく合意が無いからではないか');
  await page.evaluate(() => {
    const t = document.querySelectorAll('.wz-c-text')[1];
    t.value = 'レビュー体制を増やすべきか';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    const e = document.querySelectorAll('.wz-c-effect')[0];
    e.value = '運営チームへの依頼内容が変わる';
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setV('#wz-issue-due', '2026-09-30');
  await page.waitForTimeout(200);
  const u21a = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id));
  const u21b = await page.evaluate(() => {
    const radios = document.querySelectorAll('.wz-c-pick');
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    return Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id);
  });
  // 2つ目（「レビュー体制を増やすべきか」）は比較の形でないので compare の info が付く
  r.check('IS-U21（候補が2つで alternatives が消える・選び直すと判定対象が変わる）',
    !u21a.includes('alternatives') && !u21b.includes('alternatives')
    && !u21a.includes('compare') && u21b.includes('compare'),
    JSON.stringify([u21a, u21b]));
  await page.evaluate(() => {
    const radios = document.querySelectorAll('.wz-c-pick');
    radios[0].checked = true;
    radios[0].dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* IS-U20: Step 3（絵コンテ）は空だと進めない */
  await page.click('#wz-next');                       // → Step 3
  const u20 = await page.evaluate(() => {
    document.getElementById('wz-next').click();
    return {
      stillStep3: !!document.getElementById('wz-picture'),
      err: document.getElementById('wz-err').textContent,
      errHidden: document.getElementById('wz-err').hidden,
    };
  });
  r.check('IS-U20（絵コンテが空だと進めず、理由が出る＝描けない間はイシューが定まっていない）',
    u20.stillStep3 && !u20.errHidden && u20.err.includes('最終形'),
    JSON.stringify(u20));

  /* IS-U16: 最後まで進んで作成 */
  await setV('#wz-picture', '粒度ごとに実行できたかの表。右上に集まれば仮説どおり');
  await page.click('#wz-next');                       // → Step 4
  await page.click('#wz-add-sub');
  await setV('.wz-s-what', 'どの粒度なら実行できるか');
  await setIf('.wz-s-pic', '粒度別の○×表');
  await page.selectOption('.wz-s-way', '聞く');
  await setV('.wz-s-who', '柳葉さん経由');
  await setV('.wz-s-due', '2026-09-30');
  await setIf('#wz-story', '粒度が決まる\n量が決まる');
  await page.click('#wz-next');                       // → Step 5
  await setV('#wz-next-what', '粒度を確認する');
  await setV('#wz-next-due', '2026-10-02');
  await setV('#wz-note-title', 'ウィザード検証');
  await setIf('#wz-project', 'ITK');
  const u16 = await page.evaluate(async () => {
    document.getElementById('wz-create').click();
    await new Promise(d => setTimeout(d, 400));
    const names = Object.keys(window.__fsa.files);
    return {
      closed: document.getElementById('wizard').hidden,
      input: document.getElementById('input').value,
      deadline: document.getElementById('deadline').value,
      names: names,
      body: names.map(n => window.__fsa.files[n]).join('\n'),
    };
  });
  r.check('IS-U16（最後まで進んで作成: 5段の md が入り、閉じられる器のノートが作られる）',
    u16.closed
    && ['## 1. ゴール', '## 2. 論点', '## 3. 最終形', '## 4. サブイシュー', '## 5. 次の一手']
      .every(h => u16.input.includes(h))
    && u16.input.includes('> 型: ギャップフィル')
    && u16.input.includes('（マイルストーン: 2026-10-02）')
    && u16.input.includes('> 見送った候補: レビュー体制を増やすべきか')
    && u16.deadline === '2026-09-30'
    && u16.names.some(n => n.includes('ウィザード検証'))
    && u16.body.includes('| どの粒度なら実行できるか | 粒度別の○×表 | 聞く | 柳葉さん経由 | 2026-09-30 |')
    && u16.body.includes('## 結論'),
    JSON.stringify({ closed: u16.closed, deadline: u16.deadline, names: u16.names,
      head: u16.input.slice(0, 140) }));
  r.check('IS-U28（Step 4 の「何を見れば白黒つく」が表の2列目に、筋が表の後に `> 筋: a → b` で入る）',
    u16.body.includes('| どの粒度なら実行できるか | 粒度別の○×表 |')
    && u16.body.includes('> 筋: 粒度が決まる → 量が決まる')
    && u16.body.indexOf('> 筋:') > u16.body.indexOf('| どの粒度なら'),
    (u16.body.split('## 4. サブイシュー')[1] || '').slice(0, 300));
  r.check('IS-UL18b（［新しく立てる］で案件に ITK → 作ったノートに project: ITK）',
    /^project: ITK$/m.test(u16.body), (u16.body.split('---')[1] || '').slice(0, 200));

  /* IS-U12: FSA 非対応では作成ボタンを無効にして理由を出す（Check Vault と同型） */
  const page2 = r.watch(await browser.newPage());
  await page2.addInitScript(() => { delete window.showDirectoryPicker; });
  await page2.goto(fileUrl('web/issue.html'));
  const u12 = await page2.evaluate(async () => {
    let got = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async t => { got = t; } },
    });
    const i = document.getElementById('input');
    i.value = '## 2. 論点\n- Aは B ではなく C ではないか';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 300));
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return {
      disabled: document.getElementById('create-btn').disabled,
      pickDisabled: document.getElementById('pick-btn').disabled,
      note: document.getElementById('env-note').textContent,
      noteHidden: document.getElementById('env-note').hidden,
      copyVisible: !document.getElementById('copy-btn').hidden,
      copied: got,
    };
  });
  await page2.close();
  r.check('IS-U12（FSA 非対応: 作成とフォルダ選択が無効＋理由を表示・md コピーだけは使える）',
    u12.disabled === true && u12.pickDisabled === true
    && !u12.noteHidden && u12.note.includes('Chrome') && u12.copyVisible
    && typeof u12.copied === 'string' && u12.copied.includes('## 2. 論点'),
    JSON.stringify({ ...u12, copied: (u12.copied || '').slice(0, 40) }));

  /* IS-U8: 幅390px */
  await page.setViewportSize({ width: 390, height: 800 });
  const u8 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('IS-U8（幅390pxで横スクロールなし）', u8 === true, String(u8));

  /* IS-U23: Cmd/Ctrl+Shift+E で Plan Tasks へ（遷移するので最後） */
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'E', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })));
  await page.waitForURL(/taskboard\.html/, { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('load');
  const u23 = await page.title();
  r.check('IS-U23（Cmd/Ctrl+Shift+E で Plan Tasks へ移る）',
    u23 === 'Plan Tasks (taskboard)', u23);

  },
};
