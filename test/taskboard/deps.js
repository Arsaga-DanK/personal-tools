'use strict';
/* test/taskboard/deps.js — 節: 依存関係: 印と完了時の警告・モーダルの依存欄・記法とバイト保全・依存グラフ
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js deps）
   照合する ID: TB-R18/R19・R15/R16・R1〜R8・R9/R13/R17。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'deps',
  ids: 'TB-R18/R19・R15/R16・R1〜R8・R9/R13/R17',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-R18・R19: 印と完了時の警告（Phase T6-5） ========== */

  const r18 = await page.evaluate(([f15, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f15);
    s.setView('list');
    const markOf = (body) => {
      const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => x.children[1] && x.children[1].textContent.includes(body));
      const m = tr.querySelector('.dep-mark');
      return m ? { text: m.textContent, blocked: m.classList.contains('dep-blocked'), title: m.title } : null;
    };
    const list = { blocked: markOf('基本設計'), free: markOf('済みに依存'), none: markOf('要件定義') };
    s.setView('board');
    const cardMark = (body) => {
      const c = Array.from(document.querySelectorAll('.board-card'))
        .find(x => x.textContent.includes(body));
      const m = c.querySelector('.dep-mark');
      return m ? { text: m.textContent, blocked: m.classList.contains('dep-blocked') } : null;
    };
    const board = { blocked: cardMark('基本設計'), free: cardMark('済みに依存') };
    s.setView('list');
    return { list, board };
  }, [F15, TODAY]);
  r.check('TB-R18（リストとボードに ⛔N の印。blocked だけ警告色）',
    r18.list.blocked.text === '⛔1' && r18.list.blocked.blocked === true
    && r18.list.blocked.title.includes('先行タスクが終わっていません')
    && r18.list.free.text === '⛔1' && r18.list.free.blocked === false
    && r18.list.none === null
    && r18.board.blocked.blocked === true && r18.board.free.blocked === false,
    JSON.stringify(r18));

  const r19 = await page.evaluate(([f15, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f15);
    s.setView('list');
    const rowOf = (body) => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(x => x.children[1] && x.children[1].textContent.includes(body));
    rowOf('基本設計').querySelector('input[type="checkbox"]').click();
    const b = document.getElementById('banner');
    const warned = { text: b.textContent, cls: b.className, line: s.getText().split('\n')[5] };
    // 効いていない依存（先行が完了）なら警告しない
    rowOf('済みに依存').querySelector('input[type="checkbox"]').click();
    const b2 = document.getElementById('banner');
    // hideBanner は hidden を立てるだけで textContent は残るので、**表示状態で見る**
    return { warned, free: { hidden: b2.hidden, text: b2.hidden ? '' : b2.textContent } };
  }, [F15, TODAY]);
  r.check('TB-R19（先行が未完了のまま完了にしたら警告するが止めない・効いていない依存では警告しない）',
    r19.warned.text.includes('先行タスク1件が終わっていないまま完了にしました')
    && r19.warned.text.includes('要件定義')
    && r19.warned.cls.includes('banner-warn')
    && /^- \[x\] 基本設計 ⛔ aa1 ✅ /.test(r19.warned.line)   // 止めない（完了になっている）
    && r19.free.hidden === true && r19.free.text === '',
    JSON.stringify(r19));

  /* ========== TB-R15・R16: モーダルの依存欄（Phase T6-4） ==========
     F14: 親子＋相互依存の候補がある fixture */

  const r15 = await page.evaluate(([f14, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f14);
    s.setView('list');
    window.__h.openEdit('基本設計');
    const opts6 = Array.from(document.getElementById('modal-dep-select').options)
      .map(o => o.textContent);
    document.getElementById('modal-cancel').click();
    window.__h.openEdit('要件定義');
    const opts5 = Array.from(document.getElementById('modal-dep-select').options)
      .map(o => o.textContent);
    document.getElementById('modal-cancel').click();
    window.__h.openEdit('詳細設計');
    const chips8 = window.__h.chips('modal-dep-list');
    document.getElementById('modal-cancel').click();
    return { opts6, opts5, chips8 };
  }, [F14, TODAY]);
  r.check('TB-R15（自分・子孫・自分に依存しているタスクは選べない・既存の依存はチップに出る）',
    // 「基本設計」からは自分と子（子の設計）が消える
    !r15.opts6.some(o => o.includes('基本設計')) && !r15.opts6.some(o => o.includes('子の設計'))
    && r15.opts6.some(o => o.includes('要件定義')) && r15.opts6.some(o => o.includes('詳細設計'))
    // 「要件定義」からは、自分に依存している「詳細設計」が消える（直接循環の予防）
    && !r15.opts5.some(o => o.includes('詳細設計')) && !r15.opts5.some(o => o.includes('要件定義'))
    // 既存の依存はチップで出る
    && eq(r15.chips8, ['要件定義']),
    JSON.stringify(r15));

  const r16 = await page.evaluate(([f14, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f14);
    s.setView('list');
    window.__h.openEdit('詳細設計');
    // 「基本設計」（id なし）を先行に足す → id が発行される
    const sel = document.getElementById('modal-dep-select');
    const opt = Array.from(sel.options).find(o => o.textContent.includes('基本設計'));
    sel.value = opt.value;
    document.getElementById('modal-dep-add').click();
    const chips = window.__h.chips('modal-dep-list');
    document.getElementById('modal-save').click();
    return { chips, text: s.getText() };
  }, [F14, TODAY]);
  const r16lines = r16.text.split('\n');
  r.check('TB-R16（依存を足すと先行に id が発行され、⛔ に両方の id が入る）',
    eq(r16.chips, ['要件定義', '基本設計'])
    && /^- \[ \] 基本設計 🆔 [a-z0-9]{6}$/.test(r16lines[5])
    && /^- \[ \] 詳細設計 ⛔ aa1,[a-z0-9]{6}$/.test(r16lines[7]),
    JSON.stringify([r16.chips, r16lines[5], r16lines[7]]));

  // 解除して保存すると ⛔ が消える（バイト同一に戻る）
  const r16b = await page.evaluate(([f14, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f14);
    s.setView('list');
    window.__h.openEdit('詳細設計');
    document.querySelector('#modal-dep-list .chip-del').click();
    document.getElementById('modal-save').click();
    return s.getText();
  }, [F14, TODAY]);
  r.check('TB-R16b（依存を解除すると ⛔ が消える）',
    r16b.split('\n')[7] === '- [ ] 詳細設計'
    && onlyChanged(r16b, F14, [8]), JSON.stringify(r16b.split('\n')[7]));

  // TB-R20: 依存欄は新規モーダルに出さない（新規保存は deps を op に載せない仕様のため、
  // 出したままだと「入力できるのに保存で黙って捨てられる」口になる）
  const r20 = await page.evaluate(([f14, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f14);
    s.setView('list');
    const field = () => document.getElementById('modal-dep-field');
    document.getElementById('btn-add-form').click();
    const newHidden = field() ? field().hidden : 'no-field';
    document.getElementById('modal-cancel').click();
    window.__h.openEdit('詳細設計');   // ⛔ aa1 を持ち、他の詳細項目は空
    const editHidden = field() ? field().hidden : 'no-field';
    const moreOpen = document.getElementById('modal-more').open;
    document.getElementById('modal-cancel').click();
    return { newHidden, editHidden, moreOpen };
  }, [F14, TODAY]);
  r.check('TB-R20（依存欄は新規で非表示・編集で表示・依存ありの編集は詳細が自動で開く）',
    r20.newHidden === true && r20.editHidden === false && r20.moreOpen === true,
    JSON.stringify(r20));

  // TB-R21: 関連ノートの obsidian:// リンク（リスト列は TB-Q1 既存挙動の回帰固定・モーダルは 2026-08-13 拡張）
  // vault 名は設定値（lib/config.js）。**未設定ならリンクを作らない**ので両方の状態を見る
  const r21 = await page.evaluate((today) => {
    window.taskboard.test.setToday(today);
    const f = ['# tasks', '', '## PEW', '', '- [ ] 設計する #design [[設計 メモ]]', '', ''].join('\n');
    const setVault = v => {
      document.getElementById('cfg-vault').value = v;
      document.getElementById('cfg-vault').dispatchEvent(new Event('change'));
    };
    // タグのチップ（#design）と区別するため、関連ノート名でチップを引く
    const chipOf = name => Array.from(document.querySelectorAll('td .chip'))
      .find(e => e.textContent === name) || null;

    // ① vault 名が未設定 → 押しても開かないリンクを作らず、名前だけ出す
    localStorage.removeItem('tools:config');
    setVault('');
    window.taskboard.test.newSession(f).setView('list');
    const unsetChip = chipOf('設計 メモ');
    const unset = { tag: unsetChip ? unsetChip.tagName : null, hasHref: !!(unsetChip && unsetChip.getAttribute('href')) };

    // ② vault 名を設定 → obsidian:// リンクになる
    setVault('vault');
    window.taskboard.test.newSession(f).setView('list');
    const listA = document.querySelector('td a.chip');
    const listHref = listA ? listA.getAttribute('href') : null;
    window.__h.openEdit('設計する');
    const modalA = document.querySelector('#modal-link-list a');
    const modalHref = modalA ? modalA.getAttribute('href') : null;
    const tagHasA = !!document.querySelector('#modal-tag-list a');
    const depHasA = !!document.querySelector('#modal-dep-field a');
    document.getElementById('modal-cancel').click();
    localStorage.removeItem('tools:config');   // 後続のケースに設定を持ち越さない
    return { unset, listHref, modalHref, tagHasA, depHasA };
  }, TODAY);
  const wantHref = 'obsidian://open?vault=vault&file=' + encodeURIComponent('設計 メモ');
  r.check('TB-R21（関連ノートのチップが obsidian:// リンク・タグ/依存はリンクにしない）',
    r21.listHref === wantHref && r21.modalHref === wantHref
    && r21.tagHasA === false && r21.depHasA === false,
    JSON.stringify([r21, wantHref]));
  r.check('TB-R25（vault 名が未設定なら関連ノートをリンクにせず名前だけ表示する）',
    r21.unset.tag === 'SPAN' && r21.unset.hasHref === false, JSON.stringify(r21.unset));

  // TB-R22: 🏁（On Completion）付きタスクの完了は警告するが止めない（TB-Q55 と同じ扱い）
  const r22 = await page.evaluate((today) => {
    window.taskboard.test.setToday(today);
    const f = ['# tasks', '', '## PEW', '',
      '- [ ] 完了で消える 🏁 delete', '- [ ] ふつうのタスク', '', ''].join('\n');
    const s = window.taskboard.test.newSession(f);
    s.setView('list');
    const rowOf = name => Array.from(document.querySelectorAll('tbody tr'))
      .find(tr => tr.textContent.includes(name));
    rowOf('完了で消える').querySelector('input[type="checkbox"]').click();
    const b = document.getElementById('banner');
    const withFlag = { warn: !b.hidden && b.className.includes('banner-warn'), text: b.textContent };
    rowOf('ふつうのタスク').querySelector('input[type="checkbox"]').click();
    const without = { warn: !b.hidden && b.className.includes('banner-warn') };
    return { withFlag, without, completed: s.getText().includes('- [x] 完了で消える 🏁 delete') };
  }, TODAY);
  r.check('TB-R22（🏁 付き完了で警告・完了はされる・🏁 なしでは出ない）',
    r22.withFlag.warn && r22.withFlag.text.includes('🏁')
    && r22.withFlag.text.includes('実行されません')
    && r22.completed && !r22.without.warn,
    JSON.stringify(r22));

  // TB-R23/R24: タイムラインの dblclick 編集と、初回表示の「今日へスクロール」
  const r2324 = await page.evaluate((today) => {
    window.taskboard.test.setToday(today);
    const f = ['# tasks', '', '## PEW', '',
      '- [ ] 昔から続く仕事 🛫 2026-05-06 📅 ' + today,   // 90日前開始 → 今日が右の方に来る
      '- [ ] 設計する 🛫 2026-08-01 📅 ' + today, '', ''].join('\n');
    const s = window.taskboard.test.newSession(f);
    s.setView('timeline');
    const sc = document.getElementById('tl-scroll');
    const todayEl = document.querySelector('.tl-today');
    const todayX = todayEl ? parseFloat(todayEl.style.left) : null;
    // 範囲の右端に今日があるときはブラウザが最大値へクランプする — 期待値も同じ式にする
    const maxScroll = sc.scrollWidth - sc.clientWidth;
    const want = todayX === null ? null
      : Math.min(maxScroll, Math.max(0, todayX - sc.clientWidth / 3));
    const initial = sc.scrollLeft;
    // ビュー切替を挟まない再描画（setToday → render）ではスクロール位置を動かさない
    sc.scrollLeft = 5;
    window.taskboard.test.setToday(today);
    const afterRerender = document.getElementById('tl-scroll').scrollLeft;
    const bar = document.querySelector('.tl-bar');
    bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const modalOpen = !document.getElementById('modal').hidden;
    const content = document.getElementById('modal-content').value;
    const popoverHidden = document.getElementById('popover').hidden;
    // 後始末: 開いた UI を残すと後続テスト（TB-P19 等）の実測を汚す
    document.getElementById('popover').hidden = true;
    if (!document.getElementById('modal').hidden) document.getElementById('modal-cancel').click();
    return { todayX, want, initial, afterRerender, modalOpen, content, popoverHidden };
  }, TODAY);
  r.check('TB-R24（初回表示で今日が見える位置へスクロール・再描画では動かさない）',
    r2324.todayX !== null && Math.abs(r2324.initial - r2324.want) <= 2
    && Math.abs(r2324.afterRerender - 5) <= 2,
    JSON.stringify([r2324.todayX, r2324.want, r2324.initial, r2324.afterRerender]));
  r.check('TB-R23（バーの dblclick で編集モーダル・ポップオーバーは残らない）',
    r2324.modalOpen
    && (r2324.content === '昔から続く仕事' || r2324.content === '設計する')
    && r2324.popoverHidden,
    JSON.stringify([r2324.modalOpen, r2324.content, r2324.popoverHidden]));

  // TB-W1: 週報の期間計算（月曜始まり）
  const w1 = await page.evaluate(() => {
    if (!window.taskboard.weekRange) return { missing: true };
    return {
      thisW: window.taskboard.weekRange('2026-08-14', 'this'),
      lastW: window.taskboard.weekRange('2026-08-14', 'last'),
      monday: window.taskboard.weekRange('2026-08-10', 'this'),
    };
  });
  r.check('TB-WR1（週報の期間: 月曜始まり・今週/先週・月曜当日は1日）',
    !w1.missing
    && eq(w1.thisW, { from: '2026-08-10', to: '2026-08-14' })
    && eq(w1.lastW, { from: '2026-08-03', to: '2026-08-09' })
    && eq(w1.monday, { from: '2026-08-10', to: '2026-08-10' }),
    JSON.stringify(w1));

  // TB-W2: 週報コピーの内容（UI 経路。完了＋✅ が期間内のものだけ・セクション別・0件は該当なし）
  const w2 = await page.evaluate((today) => {
    if (!document.getElementById('btn-weekly')) return { missing: true };
    window.taskboard.test.setToday(today);
    const f = ['# tasks', '', '## PEW', '',
      '- [x] 今週やった ✅ 2026-08-12',
      '- [x] 先週やった ✅ 2026-08-05',
      '- [x] 日付なし完了',
      '- [-] 中止した',
      '- [ ] 未完了',
      '', '## UL', '',
      '- [x] レビュー ✅ 2026-08-11',
      '', ''].join('\n');
    window.taskboard.test.newSession(f);
    const caps = [];
    navigator.clipboard.writeText = t => { caps.push(t); return Promise.resolve(); };
    document.getElementById('wr-period').value = 'this';
    document.getElementById('btn-weekly').click();
    document.getElementById('wr-period').value = 'last';
    document.getElementById('btn-weekly').click();
    // 0件の期間（完了なしのセッション）
    window.taskboard.test.newSession(['# tasks', '', '## PEW', '', '- [ ] 未着手', '', ''].join('\n'));
    document.getElementById('wr-period').value = 'this';
    document.getElementById('btn-weekly').click();
    return { caps };
  }, '2026-08-14');
  r.check('TB-WR2（週報: 期間内の完了だけ・セクション別・先週切替・0件は該当なし）',
    !w2.missing
    && w2.caps[0] === '【完了タスク】2026-08-10〜2026-08-14（2件）\n\n■PEW\n・今週やった（08/12）\n\n■UL\n・レビュー（08/11）'
    && w2.caps[1] === '【完了タスク】2026-08-03〜2026-08-09（1件）\n\n■PEW\n・先週やった（08/05）'
    && w2.caps[2] === '【完了タスク】2026-08-10〜2026-08-14（0件）\n・該当なし',
    JSON.stringify(w2.caps));

  /* ========== TB-R1〜R8: 依存関係の記法とバイト保全（Phase T6・2026-08-12） ==========
     記法は Obsidian Tasks の標準。トークン順は 本文 → 🆔 → ⛔ → 優先度 → 🛫 → 📅 → ✅ */

  const r1 = await page.evaluate(f => window.taskboard.test.parse(f).tasks
    .map(t => [t.line, t.id, t.dependsOn, t.body]), F12);
  r.check('TB-R1（🆔 と ⛔ を読む・空白ありの複数依存・本文から除去される）',
    eq(r1, [[5, 'aaa111', [], '要件定義'], [6, null, ['aaa111'], '基本設計'],
      [7, null, ['aaa111', 'bbb222'], '詳細設計'], [8, null, [], '資料Rv #144']]),
    JSON.stringify(r1));

  const r2 = await ops(F12, [{ type: 'setId', line: 6, id: 'ccc333' }]);
  r.check('TB-R2（🆔 は ⛔・優先度・🛫・📅 のうち最も前の直前に入る）',
    lineOf(r2, 6) === '- [ ] 基本設計 🆔 ccc333 ⛔ aaa111 ⏫ 🛫 2026-08-05 📅 2026-08-10'
    && onlyChanged(r2, F12, [6]), JSON.stringify(lineOf(r2, 6)));

  const r3 = await ops(F12, [{ type: 'setDependsOn', line: 5, ids: ['zzz999'] }]);
  r.check('TB-R3（⛔ は 🆔 の後・優先度の前に入る）',
    lineOf(r3, 5) === '- [ ] 要件定義 🆔 aaa111 ⛔ zzz999' && onlyChanged(r3, F12, [5]),
    JSON.stringify(lineOf(r3, 5)));

  const r4 = await ops(F12, [
    { type: 'setId', line: 8, id: 'ddd444' },
    { type: 'setDependsOn', line: 8, ids: ['aaa111'] },
  ]);
  r.check('TB-R4（非標準順の行でも ⏫ の位置は動かない＝バイト保全優先）',
    lineOf(r4, 8) === '- [ ] 資料Rv #144 🆔 ddd444 ⛔ aaa111 📅 2026-08-05 ⏫'
    && onlyChanged(r4, F12, [8]), JSON.stringify(lineOf(r4, 8)));

  const r5a = await ops(F12, [
    { type: 'setId', line: 8, id: 'ddd444' },
    { type: 'setDependsOn', line: 8, ids: ['aaa111'] },
  ]);
  const r5 = await ops(r5a, [
    { type: 'setDependsOn', line: 8, ids: [] },
    { type: 'setId', line: 8, id: null },
  ]);
  r.check('TB-R5（追加 → 削除の往復でバイト同一）', r5 === F12,
    JSON.stringify(r5 === F12 ? '' : lineOf(r5, 8)));

  const r6a = await ops(F12, [{ type: 'setDependsOn', line: 7, ids: ['aaa111'] }]);
  const r6b = await ops(F12, [{ type: 'setDependsOn', line: 7, ids: [] }]);
  const r6c = await ops(F12, [{ type: 'setDependsOn', line: 6, ids: ['aaa111', 'bbb222', 'ccc333'] }]);
  r.check('TB-R6（複数依存: 1件へ減らす・全解除・3件へ増やす。位置は不変）',
    lineOf(r6a, 7) === '- [ ] 詳細設計 ⛔ aaa111'
    && lineOf(r6b, 7) === '- [ ] 詳細設計'
    && lineOf(r6c, 6) === '- [ ] 基本設計 ⛔ aaa111,bbb222,ccc333 ⏫ 🛫 2026-08-05 📅 2026-08-10',
    JSON.stringify([lineOf(r6a, 7), lineOf(r6b, 7), lineOf(r6c, 6)]));

  const r7 = await ops(F12, [{ type: 'editContent', line: 6, text: '基本設計 改' }]);
  r.check('TB-R7（本文編集で再構成した行が Tasks 標準順になる: 本文 → 🆔 → ⛔ → 優先度 → 🛫 → 📅）',
    lineOf(r7, 6) === '- [ ] 基本設計 改 ⛔ aaa111 ⏫ 🛫 2026-08-05 📅 2026-08-10',
    JSON.stringify(lineOf(r7, 6)));

  const r8 = await page.evaluate(f => {
    const ids = [];
    for (let i = 0; i < 30; i++) ids.push(window.taskboard.test.newId(f));
    return { ids, ok: ids.every(x => /^[a-z0-9]{6}$/.test(x)), collide: ids.includes('aaa111') };
  }, F12);
  r.check('TB-R8（id は [a-z0-9]{6} で、ファイル内の既存 id と衝突しない）',
    r8.ok === true && r8.collide === false && new Set(r8.ids).size >= 29,
    JSON.stringify([r8.ids.slice(0, 3), r8.ok, r8.collide]));

  /* ========== TB-R9・R13・R17: 依存グラフ（純関数・Phase T6-2） ========== */
  const graph = (text) => page.evaluate(f => window.taskboard.test.depGraph(f), text);

  // 重複 id: Tasks は「その id を持つ全部に依存」だが、図にすると意味が読めないので描かない
  const r9 = await graph(['# tasks', '', '## PEW', '',
    '- [ ] A 🆔 dup001', '- [ ] B 🆔 dup001', '- [ ] C ⛔ dup001', ''].join('\n'));
  r.check('TB-R9（重複 id は辺にせず duplicateIds に出す）',
    eq(r9.duplicateIds, ['dup001']) && r9.edges.length === 0 && r9.unresolved === 1,
    JSON.stringify(r9));

  // 未解決: 存在しない id への依存（他ファイルのタスクを参照している可能性があるので原文は消さない）
  const r9b = await graph(['# tasks', '', '## PEW', '',
    '- [ ] A 🆔 aaa111', '- [ ] B ⛔ aaa111,nope99', ''].join('\n'));
  r.check('TB-R9b（存在しない id は unresolved に数え、解決できる分だけ辺にする）',
    r9b.unresolved === 1 && eq(r9b.edges, [[5, 6]]) && r9b.cycle === null,
    JSON.stringify(r9b));

  const r13a = await graph(['# tasks', '', '## PEW', '',
    '- [ ] A 🆔 a1 ⛔ b1', '- [ ] B 🆔 b1 ⛔ a1', ''].join('\n'));
  const r13b = await graph(['# tasks', '', '## PEW', '',
    '- [ ] A 🆔 a1 ⛔ c1', '- [ ] B 🆔 b1 ⛔ a1', '- [ ] C 🆔 c1 ⛔ b1', ''].join('\n'));
  const r13c = await graph(['# tasks', '', '## PEW', '',
    '- [ ] A 🆔 a1 ⛔ a1', ''].join('\n'));
  r.check('TB-R13（循環を検出する: 直接 A↔B・間接 A→B→C→A・自己参照）',
    !!r13a.cycle && !!r13b.cycle && !!r13c.cycle
    && r13c.cycle.length >= 2 && r13c.cycle[0] === 'A',
    JSON.stringify([r13a.cycle, r13b.cycle, r13c.cycle]));

  // 5値化との整合: どちらかが finished（完了・中止）なら関係は効かない。保留は効く
  const r17 = await graph(['# tasks', '', '## PEW', '',
    '- [x] 済 🆔 s1 ✅ 2026-08-01',   //  5
    '- [-] 中止 🆔 s2',               //  6
    '- [h] 保留 🆔 s3',               //  7
    '- [ ] 後続1 ⛔ s1',              //  8（先行が完了 → 効かない）
    '- [ ] 後続2 ⛔ s2',              //  9（先行が中止 → 効かない）
    '- [ ] 後続3 ⛔ s3',              // 10（先行が保留 → 効く）
    '- [x] 済の後続 ⛔ s3 ✅ 2026-08-02', // 11（自分が完了 → 効かない）
    '', ''].join('\n'));
  r.check('TB-R17（完了・中止が絡む関係は効かない・保留は効く＝finished と一致）',
    eq(r17.edges, [[5, 8], [6, 9], [7, 10], [7, 11]])
    && eq(r17.live, [[7, 10]]) && eq(r17.blocked, [10]),
    JSON.stringify(r17));

  const many = ['# tasks', '', '## PEW', '', '- [ ] 親 🆔 root1'];
  for (let i = 0; i < 61; i++) many.push('- [ ] 子' + i + ' ⛔ root1');
  const r14 = await graph(many.join('\n') + '\n');
  r.check('TB-R14（矢印が上限 60 を超えるとガードに出る）',
    r14.live.length === 61 && r14.guard && r14.guard.reason === 'arrows'
    && r14.guard.limit === 60, JSON.stringify(r14.guard));

  },
};
