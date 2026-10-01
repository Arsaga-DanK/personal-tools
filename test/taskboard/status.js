'use strict';
/* test/taskboard/status.js — 節: ステータス（3値＋保留・中止）とボードの列切替
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js status）
   照合する ID: TB-S20〜S40・G1〜G7。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'status',
  ids: 'TB-S20〜S40・G1〜G7',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-S20〜S36: ステータス（Phase T2 の3値 ＋ Phase T3 の保留・中止） ========== */
  // F7 の9行目は Phase T3 から「中止（CANCELLED）」。真の不明・保留は F9 で見る

  const s20 = await page.evaluate(f7 => window.taskboard.test.parse(f7).tasks
    .map(t => [t.line, t.status, t.done, t.finished, t.statusChar]), F7);
  r.check('TB-S20（5状態を認識・done と finished を status から派生・5行すべてタスク）',
    eq(s20, [[5, 'todo', false, false, ' '], [6, 'doing', false, false, '/'],
      [7, 'done', true, true, 'x'], [8, 'done', true, true, 'X'],
      [9, 'cancelled', false, true, '-'], [13, 'todo', false, false, ' ']]),
    JSON.stringify(s20));

  const s21 = await ops(F7, [{ type: 'setStatus', line: 5, status: 'doing' }]);
  r.check('TB-S21（未着手→着手中は1文字だけ変わり他はバイト不変）',
    lineOf(s21, 5) === '- [/] 未着手のタスク' && onlyChanged(s21, F7, [5]),
    JSON.stringify(lineOf(s21, 5)));

  const s22 = await ops(F7, [{ type: 'setStatus', line: 6, status: 'done' }]);
  r.check('TB-S22（着手中→完了で ✅ 付与・📅 の位置は不変）',
    lineOf(s22, 6) === '- [x] 着手中のタスク 📅 2026-08-05 ⏫ ✅ 2026-08-04'
    && onlyChanged(s22, F7, [6]), JSON.stringify(lineOf(s22, 6)));

  const s23a = await ops(F7, [{ type: 'setStatus', line: 7, status: 'doing' }]);
  const s23b = await ops(F7, [{ type: 'setStatus', line: 7, status: 'todo' }]);
  r.check('TB-S23（完了から離れると ✅ が除去される）',
    lineOf(s23a, 7) === '- [/] 完了のタスク' && lineOf(s23b, 7) === '- [ ] 完了のタスク'
    && onlyChanged(s23a, F7, [7]) && onlyChanged(s23b, F7, [7]),
    JSON.stringify([lineOf(s23a, 7), lineOf(s23b, 7)]));

  const s24 = await ops(F7, [
    { type: 'setStatus', line: 5, status: 'doing' },
    { type: 'setStatus', line: 5, status: 'todo' },
  ]);
  r.check('TB-S24（未着手→着手中→未着手でバイト同一）', s24 === F7,
    JSON.stringify(s24 === F7 ? '' : lineOf(s24, 5)));

  const s25 = await ops(F7, [{ type: 'setStatus', line: 8, status: 'done' }]);
  r.check('TB-S25（既に完了の [X] は何もしない＝X のまま）', s25 === F7,
    JSON.stringify(lineOf(s25, 8)));

  const s26 = await ops(F7, [
    { type: 'setStatus', line: 5, status: 'done' },
    { type: 'setDue', line: 6, date: '2026-08-09' },
    { type: 'setTags', line: 13, tags: ['x'] },
  ]);
  r.check('TB-S26（中止の行は他の op で1バイトも変わらない）',
    lineOf(s26, 9) === '- [-] 中止のタスク' && onlyChanged(s26, F7, [5, 6, 13]),
    JSON.stringify(lineOf(s26, 9)));

  const s27 = await ops(F7, [{ type: 'setStatus', line: 9, status: 'done' }]);
  r.check('TB-S27（中止から明示的に完了にすると x に置き換わり ✅ が付く）',
    lineOf(s27, 9) === '- [x] 中止のタスク ✅ 2026-08-04' && onlyChanged(s27, F7, [9]),
    JSON.stringify(lineOf(s27, 9)));

  // TASK_RE を広げた副作用: メモが `[/] …` でもタスク行になる。ガードは TASK_RE を
  // 使っているので自動的に広がる（文言も合わせた）
  const s27b = await opsError(F7, [{ type: 'setMemo', line: 5, text: '[/] 着手中に見える行' }]);
  const s27c = await opsError(F7, [{ type: 'setMemo', line: 5, text: '[-] 中止に見える行' }]);
  r.check('TB-S36（メモの本文が `[/]`・`[-]` でもタスク行になるので拒否する）',
    !!s27b && s27b.includes('タスク行になってしまいます')
    && !!s27c && s27c.includes('タスク行になってしまいます'),
    JSON.stringify([s27b, s27c]));

  const s28 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    s.setView('list');
    const rowOf = body => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1] && tr.children[1].textContent.includes(body));
    rowOf('着手中のタスク').querySelector('input[type="checkbox"]').click();
    const afterDone = s.getText().split('\n')[5];
    rowOf('着手中のタスク').querySelector('input[type="checkbox"]').click();
    return { afterDone, afterTodo: s.getText().split('\n')[5] };
  }, [F7, TODAY]);
  r.check('TB-S28（着手中のチェックボックスをクリックで完了になり、もう一度で未着手）',
    s28.afterDone === '- [x] 着手中のタスク 📅 2026-08-05 ⏫ ✅ 2026-08-04'
    && s28.afterTodo === '- [ ] 着手中のタスク 📅 2026-08-05 ⏫',
    JSON.stringify(s28));

  const s29 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f7);
    const rowOf = body => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1] && tr.children[1].textContent.includes(body));
    const badge = rowOf('未着手のタスク').querySelector('.st-badge');
    const badgeText = rowOf('着手中のタスク').querySelector('.st-badge').textContent;
    const cancelBadge = rowOf('中止のタスク').querySelector('.st-badge').textContent;
    badge.click();
    const btns = Array.from(document.querySelectorAll('#popover button'))
      .map(b => ({ t: b.textContent, dis: b.disabled }));
    Array.from(document.querySelectorAll('#popover button')).find(b => b.textContent.includes('着手中')).click();
    return { badgeText, cancelBadge, btns, line5: s.getText().split('\n')[4] };
  }, [F7, TODAY]);
  r.check('TB-S29（状態バッジ: 着手中は ▶・中止は ✕・5択で現在値が disabled）',
    s29.badgeText === '▶' && s29.cancelBadge === '✕'
    // 列が無い状態（保留・中止）もここから選べる（ボードの列は該当があるときだけ出るため）
    && s29.btns.length === 5 && s29.btns[0].dis === true   // 未着手の行なので未着手が disabled
    && s29.btns.map(b => b.t).join('/') === '☐ 未着手/▶ 着手中/⏸ 保留/☑ 完了/✕ 中止'
    && s29.line5 === '- [/] 未着手のタスク',
    JSON.stringify(s29));

  const s30 = await withDialogs('accept', () => page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    return s.archive().then(res => ({ res, archive: s.getArchiveText(), tasks: s.getText() }));
  }, [F7, TODAY]));
  r.check('TB-S30（着手中はアーカイブされない・完了と中止が移る・確認に中止の内訳が出る）',
    s30.result.res.ok === true && s30.result.res.moved === 3
    && s30.result.archive.includes('- [x] 完了のタスク')
    && s30.result.archive.includes('- [X] 大文字の完了')
    && s30.result.archive.includes('- [-] 中止のタスク')   // 記号は原文のまま（完了と区別できる）
    && !s30.result.archive.includes('着手中')
    && s30.result.tasks.includes('- [/] 着手中のタスク')
    && s30.messages.length === 1
    && s30.messages[0] === '3件（うち中止 1件）を archive.md へ移動します。よろしいですか？',
    JSON.stringify([s30.result.res, s30.messages, s30.result.archive]));

  // 成功バナーの検査は helpers の bannerIs（クラス名だけでなく算出スタイルと role まで見る）
  const s31a = await bannerIs(page, '#banner', 'success', 'アーカイブしました');
  r.check('TB-S31a（アーカイブ成功のバナーが success の見た目・role=status）', s31a.ok, s31a.detail);

  const s31 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    s.setView('list');
    return Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row):not(.sec-row)'))
      .map(tr => Number(tr.dataset.line));
  }, [F7, TODAY]);
  r.check('TB-S31（終了下部ソート: 着手中は下がらない・完了と中止がセクションの中で最下部）',
    eq(s31, [5, 6, 7, 8, 9, 13]), JSON.stringify(s31));

  const s32 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    s.setView('list');
    return Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row):not(.sec-row)'))
      .map(tr => Number(tr.dataset.line));
  }, [F7, TODAY]);
  r.check('TB-S32（「完了・中止を含む」OFF: 着手中は残り、完了と中止が消える）',
    eq(s32, [5, 6, 13]), JSON.stringify(s32));

  // TB-S33: 一括完了の確認に着手中→完了も数える（5件で確認が出る）
  const s33 = await withDialogs('accept', () => page.evaluate(([f8, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f8);
    s.applyOps([5, 6, 7, 8, 9].map(line => ({ type: 'setStatus', line, status: 'done' })));
    return s.save();
  }, [F8, TODAY]));
  r.check('TB-S33（一括完了の確認は [/]→[x] も数える）',
    s33.messages.length === 1 && s33.messages[0] === '5件を完了にします。よろしいですか？',
    JSON.stringify(s33.messages));

  const s34 = await page.evaluate(([today]) => {
    const rows = window.taskboard.test.parse(
      '# tasks\n\n## PEW\n\n- [/] 着手 🛫 2026-07-28 📅 2026-08-01\n' +
      '- [/] 予定 🛫 2026-08-20 📅 2026-08-31\n- [x] 済 🛫 2026-07-20 📅 2026-07-24 ✅ 2026-07-24\n' +
      '- [-] 中止 🛫 2026-07-28 📅 2026-08-01\n- [h] 保留 🛫 2026-07-28 📅 2026-08-01\n'
    ).tasks;
    const m = window.taskboard.test.timelineModel(rows.map(t => Object.assign({}, t, { memo: [] })), today);
    return m.items.map(i => [i.line, i.state, i.status]);
  }, [TODAY]);
  r.check('TB-S34（着手中・保留は期間で分類・中止は専用の state・完了は done）',
    eq(s34, [[5, 'late', 'doing'], [6, 'planned', 'doing'], [7, 'done', 'done'],
      [8, 'cancelled', 'cancelled'], [9, 'late', 'hold']]),   // 保留は期限切れなら遅延
    JSON.stringify(s34));

  const s35 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    s.setView('list');
    const list = s.getListTsv().split('\n').map(l => l.split('\t')[0]);
    s.setView('timeline');
    return { list, plan: s.getPlanTsv() };
  }, [F7, TODAY]);
  r.check('TB-S35（Excel 用コピーの状態列に「着手」「中止」が出る）',
    s35.list[0] === '状態' && s35.list.includes('着手') && s35.list.includes('済')
    && s35.list.includes('中止') && s35.list.includes('未'),
    JSON.stringify(s35.list));

  /* ---------- TB-S37〜S40: 保留（[h]）と、本当に未知の記号（Phase T3） ---------- */

  const s37 = await page.evaluate(f9 => window.taskboard.test.parse(f9).tasks
    .map(t => [t.line, t.status, t.done, t.finished]), F9);
  r.check('TB-S37（[h]=保留・[!]=不明。どちらも未完了で終了扱いにもしない）',
    eq(s37, [[5, 'hold', false, false], [6, 'other', false, false], [7, 'todo', false, false]]),
    JSON.stringify(s37));

  const s38 = await ops(F9, [{ type: 'setStatus', line: 7, status: 'hold' }]);
  const s38b = await ops(s38, [{ type: 'setStatus', line: 7, status: 'todo' }]);
  r.check('TB-S38（保留への変更は1文字だけ・往復でバイト同一）',
    lineOf(s38, 7) === '- [h] 未着手のタスク' && onlyChanged(s38, F9, [7]) && s38b === F9,
    JSON.stringify([lineOf(s38, 7), s38b === F9]));

  const s39 = await page.evaluate(([f9, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f9);
    s.setView('list');
    const rowOf = body => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1] && tr.children[1].textContent.includes(body));
    const hold = rowOf('保留のタスク');
    return {
      lines: Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row):not(.sec-row)'))
        .map(tr => Number(tr.dataset.line)),
      badge: hold.querySelector('.st-badge').textContent,
      otherBadge: rowOf('本当に未知の記号').querySelector('.st-badge').textContent,
      dueClass: hold.children[3].querySelector('span').className,  // 期限（保留でも遅延の色が付く）
      summary: document.getElementById('summary').textContent,
      tsv: s.getListTsv().split('\n').map(l => l.split('\t')[0]),
    };
  }, [F9, TODAY]);
  r.check('TB-S39（保留は未完了として残り期限の色も付く・バッジは ⏸・TSV は「保留」）',
    eq(s39.lines, [5, 6, 7]) && s39.badge === '⏸' && s39.otherBadge === '!'
    && s39.dueClass === 'due-over' && s39.summary.indexOf('未完了 3 / 全 3 件') === 0
    && s39.tsv.includes('保留'),
    JSON.stringify(s39));

  const s40 = await withDialogs('accept', () => page.evaluate(([f9, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f9);
    return s.archive().then(res => ({ res, tasks: s.getText() }));
  }, [F9, TODAY]));
  r.check('TB-S40（保留も不明もアーカイブ対象にならない）',
    s40.result.res.ok === false && s40.result.res.reason === 'empty' && s40.result.tasks === F9,
    JSON.stringify(s40.result.res));

  /* ========== TB-G1〜G7: ボードの列切替（Phase T2） ========== */
  const boardCols = (groupBy) => page.evaluate(([f7, today, g]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    window.__sG = window.taskboard.test.newSession(f7);
    window.__sG.setView('board');
    const sel = document.getElementById('f-groupby');
    sel.value = g;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return Array.from(document.querySelectorAll('.board-col')).map(c => ({
      key: c.dataset.section,
      title: c.querySelector('.board-col-title').textContent,
      lines: Array.from(c.querySelectorAll('.board-card')).map(x => Number(x.dataset.line)),
    }));
  }, [F7, TODAY, groupBy]);

  const g1 = await boardCols('status');
  r.check('TB-G1（ステータス列: 常設3列＋該当のある中止列。保留は0件なので列が出ない）',
    eq(g1.map(c => c.key), ['todo', 'doing', 'done', 'cancelled'])
    && eq(g1[0].lines, [5, 13]) && eq(g1[1].lines, [6]) && eq(g1[2].lines, [7, 8])
    && eq(g1[3].lines, [9]) && g1[0].title === '未着手 (2)', JSON.stringify(g1));

  await page.dragAndDrop('.board-col[data-section="todo"] .board-card',
    '.board-col[data-section="doing"]');
  const g2 = await withDialogs('accept', () => page.evaluate(() =>
    window.__sG.save().then(res => ({ res, text: window.__sG.getAdapterText() }))));
  r.check('TB-G2（ステータス列のドラッグで setStatus・保存後のファイルが [/] になる）',
    g2.result.res.ok === true
    && g2.result.text.split('\n')[4] === '- [/] 未着手のタスク'
    && onlyChanged(g2.result.text, F7, [5]),
    JSON.stringify(g2.result.text.split('\n')[4]));

  const g3 = await boardCols('priority');
  r.check('TB-G3（優先度列: 高/中/低/なし・🔺⏬ は高/低に寄る・列内は終了分が最下部）',
    eq(g3.map(c => c.key), ['high', 'medium', 'low', ''])
    // なし列は 5（未着手）→ 7,8（完了）→ 9（中止）。中止も「終了」なので下がる
    && eq(g3[0].lines, [6]) && eq(g3[2].lines, [13]) && eq(g3[3].lines, [5, 7, 8, 9]),
    JSON.stringify(g3));

  await page.dragAndDrop('.board-col[data-section=""] .board-card',
    '.board-col[data-section="medium"]');
  const g4 = await page.evaluate(() => window.__sG.getText().split('\n')[4]);
  await page.dragAndDrop('.board-col[data-section="medium"] .board-card',
    '.board-col[data-section=""]');
  const g4b = await page.evaluate(() => window.__sG.getText());
  r.check('TB-G4（優先度列のドラッグで setPriority・なし へ戻すと除去されバイト同一）',
    g4 === '- [ ] 未着手のタスク 🔼' && g4b === F7,
    JSON.stringify([g4, g4b === F7]));

  const g5 = await boardCols('status').then(() => page.evaluate(() => {
    const key = (card, k) => card.dispatchEvent(new KeyboardEvent('keydown',
      { key: k, metaKey: true, bubbles: true, cancelable: true }));
    key(document.querySelector('.board-col[data-section="todo"] .board-card'), 'ArrowRight');
    const after = window.__sG.getText().split('\n')[4];
    // 最右列（中止）では何もしない。**描画された列の集合で端を判定する**
    key(document.querySelector('.board-col[data-section="cancelled"] .board-card'), 'ArrowRight');
    return { after, edge: window.__sG.getText().split('\n')[8] };
  }));
  r.check('TB-G5（キーボード移動が列の基準に追随・端では何もしない）',
    g5.after === '- [/] 未着手のタスク' && g5.edge === '- [-] 中止のタスク',
    JSON.stringify(g5));

  const g6page = r.watch(await context.newPage());
  await g6page.goto(fileUrl('web/taskboard.html'));
  const g6 = await g6page.evaluate(f7 => {
    window.taskboard.test.newSession(f7);
    const restored = document.getElementById('f-groupby').value;
    // 未知の値はフォールバックする
    const env = JSON.parse(localStorage.getItem('tools:taskboard'));
    env.data.board = { groupBy: 'nonsense' };
    localStorage.setItem('tools:taskboard', JSON.stringify(env));
    return restored;
  }, F7);
  await g6page.reload();
  const g6b = await g6page.evaluate(f7 => {
    window.taskboard.test.newSession(f7);
    return document.getElementById('f-groupby').value;
  }, F7);
  await g6page.close();
  r.check('TB-G6（列の基準が永続化され、未知の値は section にフォールバック）',
    g6 === 'status' && g6b === 'section', JSON.stringify([g6, g6b]));

  const g7 = await boardCols('status');
  r.check('TB-G7（ステータス列では完了の最下部ソートを適用しない＝完了列はファイル順）',
    eq(g7[2].lines, [7, 8]), JSON.stringify(g7[2].lines));

  // TB-P19: sticky ラベルが横スクロールで実際に固定されるかを実測する
  // （excel2md で border-collapse が sticky セルの枠線を落とした前例があるので CSS を信用しない）
  await page.setViewportSize({ width: 900, height: 700 });   // 図が確実にはみ出す幅
  await plan(F4, { showDone: true });
  const p19 = await page.evaluate(() => {
    const scroll = document.getElementById('tl-scroll');
    const label = document.querySelector('.tl-rows .tl-label');
    const bar = document.querySelector('.tl-rows .tl-bar');
    scroll.scrollLeft = 0;   // 初回表示の「今日へスクロール」（TB-R24）を打ち消して 0 起点で測る
    const before = { label: label.getBoundingClientRect().left, bar: bar.getBoundingClientRect().left };
    scroll.scrollLeft = 200;
    const after = { label: label.getBoundingClientRect().left, bar: bar.getBoundingClientRect().left };
    return {
      before, after, scrollLeft: scroll.scrollLeft,
      scrollable: scroll.scrollWidth > scroll.clientWidth,
      pageNoHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  // scrollLeft は要求値ではなくスクロール可能量で決まる（900px 幅では 178px が上限）
  r.check('TB-P19（sticky ラベルは横スクロールでも左端に固定・ページ自体は横スクロールしない）',
    p19.scrollable === true && p19.scrollLeft > 100
    && Math.abs(p19.after.label - p19.before.label) < 1                  // ラベルは動かない
    && Math.abs((p19.before.bar - p19.after.bar) - p19.scrollLeft) < 1   // バーはスクロール分だけ動く
    && p19.pageNoHScroll === true,
    JSON.stringify(p19));
  await page.setViewportSize({ width: 1280, height: 900 });

  },
};
