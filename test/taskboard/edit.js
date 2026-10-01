'use strict';
/* test/taskboard/edit.js — 節: メモ・完了タスクを常に最下部・タグ・既定値・追加編集モーダル
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js edit）
   照合する ID: TB-M1〜M12・C1〜C3・T1〜T5・D1〜D3・X1〜X18。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'edit',
  ids: 'TB-M1〜M12・C1〜C3・T1〜T5・D1〜D3・X1〜X18',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-M1〜M12: メモ（Phase N） ========== */
  const m1 = await ops(F5, [{ type: 'setMemo', line: 5, text: 'メモ1行目\nメモ2行目' }]);
  r.check('TB-M1（同じ本文の setMemo はバイト同一・1行も書き換えない）', m1 === F5,
    JSON.stringify(m1 === F5 ? '' : m1));

  const m2 = await ops(F5, [{ type: 'setMemo', line: 10, text: '新規メモ' }]);
  r.check('TB-M2（メモなしのタスクに1行追加・他行はバイト不変）',
    lineOf(m2, 11) === '\t- 新規メモ'
    && eq(NB(m2).filter(l => l !== '\t- 新規メモ'), NB(F5)),
    JSON.stringify([lineOf(m2, 11), m2.split('\n').length, F5.split('\n').length]));

  const m3 = await ops(F5, [{ type: 'setMemo', line: 5, text: 'メモ1行目\n変更2\n追加3' }]);
  r.check('TB-M3（2行→3行: 変えない1行目は不変・2行目を変更・3行目を挿入）',
    lineOf(m3, 6) === '\t- メモ1行目' && lineOf(m3, 7) === '\t- 変更2'
    && lineOf(m3, 8) === '\t- 追加3' && lineOf(m3, 9) === '\t- [ ] 子A1'
    && m3.split('\n').length === F5.split('\n').length + 1,
    JSON.stringify(m3.split('\n').slice(4, 10)));

  const m4 = await ops(F5, [{ type: 'setMemo', line: 5, text: 'メモ1行目' }]);
  r.check('TB-M4（2行→1行: 2行目が除去され他はバイト不変）',
    lineOf(m4, 6) === '\t- メモ1行目' && lineOf(m4, 7) === '\t- [ ] 子A1'
    && m4.split('\n').length === F5.split('\n').length - 1,
    JSON.stringify(m4.split('\n').slice(4, 9)));

  const m5 = await ops(F5, [{ type: 'setMemo', line: 5, text: '' }]);
  r.check('TB-M5（メモ削除で子タスクとその メモは残る）',
    lineOf(m5, 6) === '\t- [ ] 子A1' && lineOf(m5, 7) === '\t\t- 子のメモ'
    && m5.split('\n').length === F5.split('\n').length - 2,
    JSON.stringify(m5.split('\n').slice(4, 8)));

  // 危険なのは本文が `[ ] ` で始まる場合（`\t- [ ] …` = タスク行になる）。
  // `- [ ] …` は `\t- - [ ] …` になり箇条書きの本文なので許してよい
  const m6 = await opsError(F5, [{ type: 'setMemo', line: 5, text: '[ ] やること' }]);
  const m6ok = await ops(F5, [{ type: 'setMemo', line: 10, text: '- [ ] 見た目だけ' }]);
  r.check('TB-M6（メモがタスク行になる本文は拒否・箇条書きの本文としては許す）',
    !!m6 && m6.includes('タスク行になってしまいます')
    && lineOf(m6ok, 11) === '\t- - [ ] 見た目だけ',
    JSON.stringify([m6, lineOf(m6ok, 11)]));

  const m7 = await ops(F1, [{ type: 'complete', line: 9 }, { type: 'setDue', line: 13, date: null }]);
  const m7parse = await page.evaluate(f1 => window.taskboard.test.parse(f1).tasks.map(t => t.memo), F1);
  r.check('TB-M7（F1 は空行・HTML コメントをメモと誤認しない）',
    eq(m7parse, [[], [], [], [], [], []]) && onlyChanged(m7, F1, [9, 13]),
    JSON.stringify(m7parse));

  const m8 = await ops(F5, [{ type: 'moveSection', line: 5, section: 'UL' }]);
  r.check('TB-M8（セクション移動でメモ2行・子タスク・子のメモの5行がまとめて移る）',
    eq(NB(m8).slice(0, 4), ['# tasks', '## PEW', '- [ ] 親B', '- [x] 親C'])
    && eq(NB(m8).slice(4), ['\t- Cのメモ', '## UL', '- [ ] 親A', '\t- メモ1行目',
      '\t- メモ2行目', '\t- [ ] 子A1', '\t\t- 子のメモ']),
    JSON.stringify(NB(m8)));

  const m9 = await ops(F5, [{ type: 'addChild', parentLine: 5, content: '子A2' }]);
  r.check('TB-M9（子タスクはメモ2行と既存の子（とそのメモ）より後に入る）',
    lineOf(m9, 10) === '\t- [ ] 子A2' && lineOf(m9, 9) === '\t\t- 子のメモ',
    JSON.stringify(m9.split('\n').slice(4, 11)));

  // TB-M10: 完了＋メモのアーカイブ（メモも一緒に移る）
  const m10 = await withDialogs('accept', () => page.evaluate(([f5, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f5);
    return s.archive().then(res => ({
      res, archive: s.getArchiveText(), tasks: s.getAdapterText(),
      badge: document.getElementById('btn-archive').textContent,
    }));
  }, [F5, TODAY]));
  r.check('TB-M10（アーカイブでメモ行も archive.md へ移り tasks.md から消える）',
    m10.result.res.ok === true && m10.result.res.moved === 2
    && m10.result.archive.includes('- [x] 親C\n\t- Cのメモ\n')
    && !m10.result.tasks.includes('親C') && !m10.result.tasks.includes('Cのメモ')
    // 件数はタスク数で数える（メモ行で膨らませない）
    && m10.messages[0] === '1件を archive.md へ移動します。よろしいですか？',
    JSON.stringify([m10.result.res, m10.messages, m10.result.archive]));

  // TB-M11: UI（マーカー → 展開 → 編集 → 保存で永続）
  const m11 = await withDialogs('accept', () => page.evaluate(([f5, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f5);
    const rowOf = body => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1] && tr.children[1].textContent.includes(body));
    const mark = rowOf('親A').querySelector('.memo-mark');
    const markText = mark.textContent;
    mark.click();                                   // 展開
    const memoRow = document.querySelector('tr.memo-row .memo-text');
    const expanded = memoRow ? memoRow.textContent : null;
    // メモの編集はモーダルに統合された（Phase E）。展開したメモ行のダブルクリックで開く
    document.querySelector('tr.memo-row td')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const ta = document.getElementById('modal-memo');
    const before = ta.value;
    ta.value = 'メモ1行目\n差し替え2';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    return s.save().then(res => ({
      markText, expanded, before, res, adapter: s.getAdapterText(),
      modalHidden: document.getElementById('modal').hidden,
    }));
  }, [F5, TODAY]));
  r.check('TB-M11（📝2 マーカー・展開・メモ行の dblclick でモーダル・Cmd+Enter で確定・保存で永続）',
    m11.result.markText === '📝2' && m11.result.expanded === 'メモ1行目\nメモ2行目'
    && m11.result.before === 'メモ1行目\nメモ2行目'
    && m11.result.res.ok === true && m11.result.modalHidden === true
    && m11.result.adapter.split('\n')[6] === '\t- 差し替え2'
    && m11.result.adapter.split('\n')[5] === '\t- メモ1行目',
    JSON.stringify([m11.result.markText, m11.result.expanded, m11.result.adapter.split('\n').slice(4, 9)]));

  // TB-M13: 保存バナーで差分の実測（位置ごと比較が最小差分になっているかの確認）と
  // メモ削除の文言（行数が減るだけなので「行の移動」と出ると誤解を招く）
  const m13 = await withDialogs('accept', () => page.evaluate(([f5, today]) => {
    window.taskboard.test.setToday(today);
    const run = (text) => {
      const s = window.taskboard.test.newSession(f5);
      s.applyOps([{ type: 'setMemo', line: 5, text }]);
      const badge = document.getElementById('btn-save').textContent;
      return s.save().then(() => ({
        badge, banner: document.getElementById('banner').textContent,
      }));
    };
    return run('メモ1行目\n変更2\n追加3')
      .then(grow => run('メモ1行目').then(shrink => ({ grow, shrink })));
  }, [F5, TODAY]));
  r.check('TB-M13（2行→3行は「変更1行・追加1行」/ 2行→1行は「1行を削除」）',
    m13.result.grow.banner === '保存しました（変更1行・追加1行）'
    && m13.result.grow.badge === '今すぐ保存（2）'
    && m13.result.shrink.banner === '保存しました（1行を削除）',
    JSON.stringify(m13.result));

  const m12 = await ops(F1, [
    { type: 'addTask', section: 'UL', content: '誤追加' },
    { type: 'setMemo', line: 18, text: 'メモも追加' },
    { type: 'undoAdd', line: 18 },
  ]);
  r.check('TB-M12（追加行の取り消しで追加されたメモ行も一緒に消えて F1 に戻る）',
    m12 === F1, JSON.stringify(m12 === F1 ? '' : m12));

  /* ========== TB-C1〜C3: 完了タスクを常に最下部 ========== */
  // F1 の9行目を完了させた状態で並びを見る（10行目は完了だが子12が未完了なので上に残る）
  const c1done = await ops(F1, [{ type: 'complete', line: 9 }]);
  const listOrder = (text, sort) => page.evaluate(([t, today, s]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const sel = document.getElementById('f-sort');
    sel.value = s;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const sess = window.taskboard.test.newSession(t);
    sess.setView('list');   // 直前のテストで timeline のままだと並べ替えが効かない
    return Array.from(document.querySelectorAll('#task-table tbody tr'))
      .filter(tr => !tr.classList.contains('memo-row') && !tr.classList.contains('sec-row'))
      .map(tr => Number(tr.dataset.line));
  }, [text, TODAY, sort]);
  const c1b = await listOrder(c1done, 'file');
  r.check('TB-C1（完了グループはセクションの中で最下部・未完了の子孫を持つ完了親は上に残る）',
    eq(c1b, [10, 11, 12, 13, 9, 17]), JSON.stringify(c1b));

  const c2 = {};
  for (const s of ['due', 'priority', 'start']) c2[s] = await listOrder(c1done, s);
  r.check('TB-C2（どのソートでも完了はセクションの中で最下部＝第1キー）',
    ['due', 'priority', 'start'].every(s => c2[s][c2[s].length - 2] === 9 && c2[s][c2[s].length - 1] === 17)
    && Object.keys(c2).length === 3, JSON.stringify(c2));

  const c3 = await plan(F4, { showDone: true });
  r.check('TB-C3（タイムラインの行順は従来どおり＝完了を下に動かさない）',
    eq(c3.model.items.map(i => i.line), [5, 6, 7, 8, 9]),
    JSON.stringify(c3.model.items.map(i => i.line)));

  /* ========== TB-T1〜T5: タグの付与・削除 ========== */
  const t1 = await ops(F1, [{ type: 'setTags', line: 17, tags: ['UL業務', '重要'] }]);
  r.check('TB-T1（タグ追加は本文末尾＝優先度の直前・他行は不変）',
    lineOf(t1, 17) === '- [ ] 目標管理について考える [[2026-07-07]] #UL業務 #重要 🔽'
    && onlyChanged(t1, F1, [17]), JSON.stringify(lineOf(t1, 17)));

  const t2 = await ops(F1, [{ type: 'setTags', line: 17, tags: [] }]);
  r.check('TB-T2（タグ削除はトークンと直前の空白1個のみ除去）',
    lineOf(t2, 17) === '- [ ] 目標管理について考える [[2026-07-07]] 🔽'
    && onlyChanged(t2, F1, [17]), JSON.stringify(lineOf(t2, 17)));

  const t3 = await ops(F1, [{ type: 'setTags', line: 13, tags: ['新タグ'] }]);
  r.check('TB-T3（#144 は数字のみなのでタグ扱いせず触らない・📅 の直前に挿入）',
    lineOf(t3, 13) === '- [ ] 資料Rv #144 [[2026-07-14_TODO]] [[2026-07-21]] #新タグ 📅 2026-08-05 ⏫'
    && onlyChanged(t3, F1, [13]), JSON.stringify(lineOf(t3, 13)));

  const t4 = await ops(F1, [
    { type: 'setTags', line: 17, tags: ['UL業務', '一時'] },
    { type: 'setTags', line: 17, tags: ['UL業務'] },
  ]);
  r.check('TB-T4（追加→削除の往復でバイト同一）', t4 === F1, JSON.stringify(lineOf(t4, 17)));

  const t5 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    const rowOf = body => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1] && tr.children[1].textContent.includes(body));
    rowOf('目標管理').querySelector('.cell-tags').click();
    const existing = Array.from(document.querySelectorAll('#popover button'))
      .filter(b => b.textContent.startsWith('#')).map(b => ({ t: b.textContent, on: b.classList.contains('active') }));
    const input = document.getElementById('tag-input');
    input.value = 'IME中';
    const ev = (composing) => {
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      if (composing) Object.defineProperty(e, 'isComposing', { get: () => true });
      return e;
    };
    input.dispatchEvent(ev(true));
    const afterComposing = { tags: s.getText().split('\n')[16], popoverOpen: !document.getElementById('popover').hidden };
    input.dispatchEvent(ev(false));
    return { existing, afterComposing, afterPlain: s.getText().split('\n')[16] };
  }, [F1, TODAY]);
  r.check('TB-T5（既存タグのトグル表示・IME 変換中の Enter では追加されない）',
    t5.existing.length === 1 && t5.existing[0].t === '#UL業務' && t5.existing[0].on === true
    && t5.afterComposing.tags === '- [ ] 目標管理について考える [[2026-07-07]] #UL業務 🔽'
    && t5.afterComposing.popoverOpen === true
    && t5.afterPlain === '- [ ] 目標管理について考える [[2026-07-07]] #UL業務 #IME中 🔽',
    JSON.stringify(t5));

  /* ========== TB-D1〜D3: 既定値（モーダルへ移設）==========
     Step 6 の不具合は「記憶の入口が追加フォーム1箇所だけ」で、実運用で使われる
     セルのポップオーバーから書かれていなかったこと。**利用者が実際に通る経路**で照合する
     （docs/verification-notes.md §5b 型3） */
  const openModal = (pg) => pg.evaluate(() => {
    if (document.getElementById('modal').hidden) document.getElementById('btn-add-form').click();
    return {
      section: document.getElementById('modal-section').value,
      start: document.getElementById('modal-start').value,
      due: document.getElementById('modal-due').value,
      pri: document.getElementById('modal-pri').value,
      tags: Array.from(document.querySelectorAll('#modal-tag-list .chip')).map(c => c.textContent.replace('✕', '')),
      moreOpen: document.getElementById('modal-more').open,
      contentWidth: document.getElementById('modal-content').getBoundingClientRect().width,
      modalInView: (() => {
        const m = document.querySelector('.modal').getBoundingClientRect();
        return m.top >= 0 && m.bottom <= document.documentElement.clientHeight
          && m.left >= 0 && m.right <= document.documentElement.clientWidth;
      })(),
    };
  });

  // TB-D1: **セルのポップオーバー**で期限・開始日・優先度・タグ・セクションを設定 → 次の追加に出る
  const d1 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    const rowOf = body => Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1] && tr.children[1].textContent.includes(body));
    const pop = (cls, pick) => {
      rowOf('資料作成').querySelector(cls).click();
      pick();
    };
    // 期限セル → ［今日］
    pop('.cell-due', () => Array.from(document.querySelectorAll('#popover button'))
      .find(b => b.textContent === '今日').click());
    // 開始日セル → ［明日］
    pop('.cell-start', () => Array.from(document.querySelectorAll('#popover button'))
      .find(b => b.textContent === '明日').click());
    // 優先度セル → ⏫ 高
    pop('.cell-pri', () => Array.from(document.querySelectorAll('#popover button'))
      .find(b => b.textContent === '⏫ 高').click());
    // タグセル → 新規タグ
    rowOf('資料作成').querySelector('.cell-tags').click();
    document.getElementById('tag-input').value = 'ポップオーバー由来';
    Array.from(document.querySelectorAll('#popover button')).find(b => b.textContent === '追加').click();
    // セクション → UL（2026-10-01 に列を消したので、見出しへのドラッグで変える — TB-SH5）
    {
      const src = rowOf('資料作成');
      const head = Array.from(document.querySelectorAll('#task-table tbody tr.sec-row'))
        .find(h => ((h.querySelector('.sec-name') || {}).textContent || '').replace(/^[▾▸]\s*/, '') === 'UL');
      if (src && head) {
        const dt = new DataTransfer();
        src.querySelector('.drag-handle').dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        const rc = head.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rc.left + 80, clientY: rc.top + rc.height / 2 };
        head.dispatchEvent(new DragEvent('dragover', o));
        head.dispatchEvent(new DragEvent('drop', o));
      }
    }
    return JSON.parse(localStorage.getItem('tools:taskboard')).data.add;
  }, [F1, TODAY]);
  const d1modal = await openModal(page);
  r.check('TB-D1（セルのポップオーバーで設定した値が次の追加の既定値になる＝実運用の経路）',
    d1.due === TODAY && d1.start === '2026-08-05' && d1.priority === 'high'
    && eq(d1.tags, ['ポップオーバー由来']) && d1.section === 'UL'
    && d1modal.due === TODAY && d1modal.start === '2026-08-05' && d1modal.pri === 'high'
    && eq(d1modal.tags, ['#ポップオーバー由来']) && d1modal.section === 'UL'
    && d1modal.moreOpen === true,   // 値が入っているので詳細が開く
    JSON.stringify([d1, d1modal]));
  r.check('TB-W1（モーダルの内容欄が 320px 以上・モーダルが画面内に収まる）',
    d1modal.contentWidth >= 320 && d1modal.modalInView === true,
    JSON.stringify([d1modal.contentWidth, d1modal.modalInView]));

  // TB-D2: クリアも記憶する（期限の［クリア］→ 次の追加は空）
  const d2 = await page.evaluate(([f1, today]) => {
    document.getElementById('modal-cancel').click();
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(x => x.children[1] && x.children[1].textContent.includes('資料Rv'));
    tr.querySelector('.cell-due').click();
    Array.from(document.querySelectorAll('#popover button')).find(b => b.textContent === 'クリア').click();
    return JSON.parse(localStorage.getItem('tools:taskboard')).data.add;
  }, [F1, TODAY]);
  const d2modal = await openModal(page);
  r.check('TB-D2（クリアしたことも記憶する）', d2.due === '' && d2modal.due === '',
    JSON.stringify([d2, d2modal]));

  const d3page = r.watch(await context.newPage());
  await d3page.goto(fileUrl('web/taskboard.html'));
  const d3 = await d3page.evaluate(() => {
    // 記憶したセクション（UL）が無いファイル
    window.taskboard.test.newSession('# tasks\n\n## PEW\n\n- [ ] only\n');
    document.getElementById('btn-add-form').click();
    return document.getElementById('modal-section').value;
  });
  await d3page.close();
  r.check('TB-D3（記憶したセクションが無ければ先頭セクションへフォールバック）',
    d3 === 'PEW', JSON.stringify(d3));

  /* ========== TB-X1〜X18: 追加・編集モーダル ==========
     ページ側のヘルパは window.__h に1度だけ入れる（evaluate ごとに書き写さない）。
     page.reload() で消えるので、リロードを挟んだら入れ直す */
  await installHelpers(page);
  const x1 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    document.getElementById('btn-add-form').click();
    window.__h.resetModalFields();
    window.__h.set('modal-content', '新規タスク');
    window.__h.set('modal-memo', 'メモ1\nメモ2');
    window.__h.set('modal-tag-input', '重要');
    document.getElementById('modal-tag-add').click();
    window.__h.set('modal-section', 'UL');
    window.__h.set('modal-start', '2026-08-10');
    window.__h.set('modal-due', '2026-08-20');
    window.__h.set('modal-pri', 'high');
    document.getElementById('modal-link-today').click();
    document.getElementById('modal-save').click();
    return {
      text: s.getText(),
      stillOpen: !document.getElementById('modal').hidden,
      content: document.getElementById('modal-content').value,
      activeId: document.activeElement.id,
    };
  }, [F1, TODAY]);
  const x1lines = x1.text.split('\n');
  r.check('TB-X1（全フィールド: Tasks 標準順の1行＋メモ2行・連続追加のため開いたまま）',
    x1lines[17] === '- [ ] 新規タスク #重要 [[2026-08-04]] ⏫ 🛫 2026-08-10 📅 2026-08-20'
    && x1lines[18] === '\t- メモ1' && x1lines[19] === '\t- メモ2'
    && x1.stillOpen === true && x1.content === '' && x1.activeId === 'modal-content',
    JSON.stringify([x1lines.slice(16, 21), x1.stillOpen, x1.content, x1.activeId]));

  const x2 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    document.getElementById('btn-add-form').click();
    window.__h.resetModalFields();
    window.__h.set('modal-content', '内容のみ');
    window.__h.set('modal-memo', '');
    window.__h.set('modal-start', ''); window.__h.set('modal-due', ''); window.__h.set('modal-pri', '');
    for (const b of document.querySelectorAll('#modal-tag-list .chip-del')) b.click();
    document.getElementById('modal-save').click();
    document.getElementById('modal-cancel').click();
    return s.getText();
  }, [F1, TODAY]);
  r.check('TB-X2（内容のみ: 他のトークンもメモ行も付かない）',
    x2.split('\n')[17] === '- [ ] 内容のみ' && x2.split('\n').length === F1.split('\n').length + 1,
    JSON.stringify(x2.split('\n').slice(16, 19)));

  const x3 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料Rv');
    window.__h.set('modal-due', '2026-08-09');
    document.getElementById('modal-save').click();
    return { text: s.getText(), hidden: document.getElementById('modal').hidden };
  }, [F1, TODAY]);
  r.check('TB-X3（期限だけ変更: 他のバイトが1つも変わらない・編集モードは閉じる）',
    lineOf(x3.text, 13) === '- [ ] 資料Rv #144 [[2026-07-14_TODO]] [[2026-07-21]] 📅 2026-08-09 ⏫'
    && onlyChanged(x3.text, F1, [13]) && x3.hidden === true,
    JSON.stringify(lineOf(x3.text, 13)));

  const x4 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料Rv');
    document.getElementById('modal-save').click();
    return s.getText();
  }, [F1, TODAY]);
  r.check('TB-X4（何も変えずに保存すると op 0件＝バイト同一）', x4 === F1,
    JSON.stringify(x4 === F1 ? '' : x4));

  const x5 = await page.evaluate(([f5, today]) => {
    window.taskboard.test.setToday(today);
    const out = {};
    let s = window.taskboard.test.newSession(f5);
    window.__h.openEdit('親A');
    window.__h.set('modal-memo', 'メモ1行目\n変更2\n追加3');
    document.getElementById('modal-save').click();
    out.grow = s.getText().split('\n').slice(4, 10);
    s = window.taskboard.test.newSession(f5);
    window.__h.openEdit('親A');
    window.__h.set('modal-memo', 'メモ1行目');
    document.getElementById('modal-save').click();
    out.shrink = s.getText().split('\n').slice(4, 9);
    return out;
  }, [F5, TODAY]);
  r.check('TB-X5（メモの増減が最小差分: 据え置いた1行目は不変）',
    eq(x5.grow, ['- [ ] 親A', '\t- メモ1行目', '\t- 変更2', '\t- 追加3', '\t- [ ] 子A1', '\t\t- 子のメモ'])
    && eq(x5.shrink, ['- [ ] 親A', '\t- メモ1行目', '\t- [ ] 子A1', '\t\t- 子のメモ', '- [ ] 親B']),
    JSON.stringify(x5));

  const x6 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料Rv');
    window.__h.set('modal-content', '資料Rv 改');
    document.getElementById('modal-save').click();
    return s.getText();
  }, [F1, TODAY]);
  r.check('TB-X6（内容変更で editContent が走りメタトークンが標準順に並ぶ）',
    lineOf(x6, 13) === '- [ ] 資料Rv 改 [[2026-07-14_TODO]] [[2026-07-21]] ⏫ 📅 2026-08-05'
    && onlyChanged(x6, F1, [13]), JSON.stringify(lineOf(x6, 13)));

  const x7 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const out = {};
    let s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料作成');
    window.__h.set('modal-link-input', '2026-08-06');
    document.getElementById('modal-link-add').click();
    document.getElementById('modal-save').click();
    out.added = lineOfJs(s.getText(), 9);
    // 削除
    s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料作成');
    document.querySelector('#modal-link-list .chip-del').click();
    document.getElementById('modal-save').click();
    out.removed = lineOfJs(s.getText(), 9);
    // 未変更なら editContent を出さない
    s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料作成');
    window.__h.set('modal-due', '2026-08-30');
    document.getElementById('modal-save').click();
    out.untouched = lineOfJs(s.getText(), 9);
    return out;
    function lineOfJs(t, n) { return t.split('\n')[n - 1]; }
  }, [F1, TODAY]);
  r.check('TB-X7（関連ノートの追加・削除・未変更なら editContent を出さない）',
    x7.added === '- [ ] 資料作成 #102 [[2026-07-07]] [[2026-08-06]]'
    && x7.removed === '- [ ] 資料作成 #102'
    // リンク未変更なので本文は再構成されず、📅 が末尾に足されるだけ
    && x7.untouched === '- [ ] 資料作成 #102 [[2026-07-07]] 📅 2026-08-30',
    JSON.stringify(x7));

  const x8 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    document.getElementById('btn-add-form').click();
    document.getElementById('modal-link-today').click();
    const chips = Array.from(document.querySelectorAll('#modal-link-list .chip')).map(c => c.textContent.replace('✕', ''));
    document.getElementById('modal-link-today').click();   // 2回押しても増えない
    const after = Array.from(document.querySelectorAll('#modal-link-list .chip')).length;
    document.getElementById('modal-cancel').click();
    return { chips, after };
  }, [F1, TODAY]);
  r.check('TB-X8（今日のデイリーで [[今日]] が1クリックで入る・重複しない）',
    eq(x8.chips, ['[[2026-08-04]]']) && x8.after === 1, JSON.stringify(x8));

  const x12 = await withDialogs('dismiss', () => page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料作成');
    const esc = (composing) => {
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      if (composing) Object.defineProperty(e, 'isComposing', { get: () => true });
      document.getElementById('modal-content').dispatchEvent(e);
    };
    esc(true);
    const afterComposing = document.getElementById('modal').hidden;
    esc(false);
    return { afterComposing, afterPlain: document.getElementById('modal').hidden };
  }, [F1, TODAY]));
  r.check('TB-X12（Escape で閉じる・IME 変換中の Escape では閉じない）',
    x12.result.afterComposing === false && x12.result.afterPlain === true
    && x12.messages.length === 0,   // 何も変えていないので確認は出ない
    JSON.stringify([x12.result, x12.messages]));

  const x13 = await withDialogs('dismiss', () => page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    window.__h.openEdit('資料作成');
    document.getElementById('modal-content').value = '書きかけ';
    document.getElementById('modal-cancel').click();
    return { hidden: document.getElementById('modal').hidden, value: document.getElementById('modal-content').value };
  }, [F1, TODAY]));
  const x13b = await withDialogs('accept', () => page.evaluate(() => {
    document.getElementById('modal-cancel').click();
    return document.getElementById('modal').hidden;
  }));
  r.check('TB-X13（未保存で閉じると確認・dismiss で閉じず入力が残る・accept で閉じる）',
    x13.messages[0] === '入力を破棄しますか？' && x13.result.hidden === false
    && x13.result.value === '書きかけ' && x13b.result === true,
    JSON.stringify([x13.messages, x13.result, x13b.result]));

  const x14 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    const trigger = document.getElementById('btn-add-form');
    trigger.focus();
    trigger.click();
    const sel = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), summary';
    const f = Array.from(document.getElementById('modal').querySelectorAll(sel))
      .filter(x => x.getClientRects().length > 0);
    const first = f[0], last = f[f.length - 1];
    // 末尾で Tab → 先頭へ
    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const afterTab = document.activeElement.id;
    // 先頭で Shift+Tab → 末尾へ
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    const afterShiftTab = document.activeElement.id;
    document.getElementById('modal-cancel').click();
    return { firstId: first.id, lastId: last.id, afterTab, afterShiftTab,
      returned: document.activeElement.id, count: f.length };
  }, [F1, TODAY]);
  r.check('TB-X14（Tab がモーダル内で循環し、閉じたら元の要素にフォーカスが戻る）',
    x14.firstId === 'modal-content' && x14.lastId === 'modal-save'
    && x14.afterTab === 'modal-content' && x14.afterShiftTab === 'modal-save'
    && x14.returned === 'btn-add-form', JSON.stringify(x14));

  // TB-X15: 狭幅・下端スクロールでモーダルが画面内に収まる
  await page.setViewportSize({ width: 390, height: 640 });
  const x15 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    window.scrollTo(0, document.documentElement.scrollHeight);
    document.getElementById('btn-add-form').click();
    const m = document.querySelector('.modal').getBoundingClientRect();
    const out = {
      inView: m.top >= 0 && m.bottom <= document.documentElement.clientHeight
        && m.left >= 0 && m.right <= document.documentElement.clientWidth,
      noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      rect: [Math.round(m.top), Math.round(m.bottom), Math.round(m.left), Math.round(m.right)],
    };
    document.getElementById('modal-cancel').click();
    return out;
  }, [F1, TODAY]);
  r.check('TB-X15（幅390px・下端スクロールでもモーダルが画面内・横スクロールなし）',
    x15.inView && x15.noHScroll, JSON.stringify(x15));

  // TB-X16: ポップオーバーのビューポート内クランプ（右端・下端）
  const x16 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f1);
    const rows = Array.from(document.querySelectorAll('#task-table tbody tr'));
    const last = rows.filter(r => r.dataset.line).pop();   // 見出しの行（sec-row）は data-line を持たない
    window.scrollTo(0, document.documentElement.scrollHeight);
    last.querySelector('.cell-due').click();            // 最下行 → 下端
    const pop = document.getElementById('popover');
    const a = pop.getBoundingClientRect();
    const bottomOk = a.bottom <= document.documentElement.clientHeight && a.top >= 0;
    // 右端（操作の列の［＋子］）を基準に開く。2026-10-01 にセクションの列を消したので起点を変えた
    last.querySelector('.btn-child').click();
    const b = pop.getBoundingClientRect();
    return {
      bottomOk, rightOk: b.right <= document.documentElement.clientWidth && b.left >= 0,
      noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      a: [Math.round(a.top), Math.round(a.bottom)], b: [Math.round(b.left), Math.round(b.right)],
    };
  }, [F1, TODAY]);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('TB-X16（ポップオーバーが下端・右端でビューポート内に収まる）',
    x16.bottomOk && x16.rightOk && x16.noHScroll, JSON.stringify(x16));

  const x17 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#task-table thead th')).map(th => th.textContent));
  r.check('TB-X17（列見出し: セクションの列は無い・「関連ノート」）',
    eq(x17, ['', '内容', '開始日', '期限', '優先度', 'タグ', '関連ノート', '']),
    JSON.stringify(x17));

  const x18 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    document.getElementById('btn-add-form').click();
    window.__h.resetModalFields();
    window.__h.set('modal-content', 'Cmd+Enter で保存');
    window.__h.set('modal-memo', 'メモにフォーカスがあっても保存される');
    const ta = document.getElementById('modal-memo');
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    const text = s.getText();
    document.getElementById('modal-cancel').click();
    return text;
  }, [F1, TODAY]);
  // TB-X19: タグを持つ行の内容だけ変更 → タグが二重にならない（内容欄はタグを含まない）
  const x19 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__h.openEdit('目標管理');
    const contentField = document.getElementById('modal-content').value;
    const tagChips = window.__h.chips('modal-tag-list');
    window.__h.set('modal-content', '目標管理を見直す');
    document.getElementById('modal-save').click();
    return { contentField, tagChips, line: s.getText().split('\n')[16] };
  }, [F1, TODAY]);
  r.check('TB-X19（内容欄はタグを含まない・内容だけ変えてもタグが二重にならない）',
    x19.contentField === '目標管理について考える' && eq(x19.tagChips, ['#UL業務'])
    && x19.line === '- [ ] 目標管理を見直す #UL業務 [[2026-07-07]] 🔽',
    JSON.stringify(x19));

  r.check('TB-X18（メモ textarea にフォーカスがあっても Cmd/Ctrl+Enter で保存できる）',
    x18.split('\n')[17] === '- [ ] Cmd+Enter で保存'
    && x18.split('\n')[18] === '\t- メモにフォーカスがあっても保存される',
    JSON.stringify(x18.split('\n').slice(16, 20)));

  },
};
