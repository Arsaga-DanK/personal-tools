'use strict';
/* test/taskboard/board-search.js — 節: ボードビューとテキスト検索（メモの自動展開を含む）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js board-search）
   照合する ID: TB-B1〜B11・F1〜F18。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'board-search',
  ids: 'TB-B1〜B11・F1〜F18',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-B1〜B11: ボードビュー（Phase S） ========== */


  const b1 = await boardOf(F6, {});
  r.check('TB-B1（列がファイルのセクション順に自動生成・空セクションも列として出る）',
    eq(b1.cols.map(c => c.sec), ['PEW', 'UL', 'その他'])
    && b1.cols[2].title === 'その他 (0)' && eq(b1.tabs, ['リスト', 'ボード', 'タイムライン'])
    && b1.tableHidden === true && b1.copyLabel === 'Excel用コピー',
    JSON.stringify([b1.cols.map(c => [c.sec, c.title]), b1.tabs, b1.copyLabel]));

  r.check('TB-B2（カード＝深さ0だけ・本文/期限/優先度/タグ/メモ印・draggable と tabindex）',
    eq(b1.cols[0].cards.map(c => c.line), [5])
    && b1.cols[0].cards[0].body.includes('外部IF定義書作成')
    && b1.cols[0].cards[0].body.includes('📝1')
    && b1.cols[0].cards[0].meta.includes('📅 2026-08-15')
    && b1.cols[0].cards[0].meta.includes('⏫') && b1.cols[0].cards[0].meta.includes('#PEW')
    && b1.cols[0].cards[0].drag === true && b1.cols[0].cards[0].tabIndex === 0,
    JSON.stringify(b1.cols[0].cards));

  const b3 = await page.evaluate(() => {
    const card = document.querySelector('.board-col[data-section="PEW"] .board-card');
    const before = card.querySelectorAll('.card-kid').length;
    Array.from(card.querySelectorAll('.card-btn')).find(b => b.textContent.includes('子')).click();
    const card2 = document.querySelector('.board-col[data-section="PEW"] .board-card');
    const kids = Array.from(card2.querySelectorAll('.card-kid')).map(k => k.textContent);
    card2.querySelector('.card-kid').click();
    return {
      before, kids, modalOpen: !document.getElementById('modal').hidden,
      modalContent: document.getElementById('modal-content').value,
      toggleLabel: Array.from(card2.querySelectorAll('.card-btn')).find(b => b.textContent.includes('子')).textContent,
    };
  });
  await shutModal();
  r.check('TB-B3（子は既定で畳まれ・展開でき・子の行クリックでその子のモーダルが開く）',
    b3.before === 0 && b3.kids.length === 1 && b3.kids[0].includes('PRODUCTS')
    && b3.toggleLabel.includes('▾') && b3.modalOpen === true
    && b3.modalContent === 'PRODUCTS の項目定義',
    JSON.stringify(b3));

  const b4 = await boardOf(F6, { showDone: true });
  r.check('TB-B4（完了は OFF で出ず・ON では muted で列内の最下部）',
    eq(b1.cols[0].cards.map(c => c.line), [5])
    && eq(b4.cols[0].cards.map(c => c.line), [5, 8])
    && b4.cols[0].cards[1].done === true,
    JSON.stringify([b1.cols[0].cards.map(c => c.line), b4.cols[0].cards.map(c => [c.line, c.done])]));

  const b5 = await page.evaluate(() => {
    const card = document.querySelector('.board-col[data-section="UL"] .board-card');
    card.focus();
    card.click();
    return {
      modalOpen: !document.getElementById('modal').hidden,
      content: document.getElementById('modal-content').value,
    };
  });
  const b5back = await page.evaluate(() => {
    document.getElementById('modal-cancel').click();
    return document.activeElement.className;
  });
  r.check('TB-B5（カードクリックで編集モーダル・閉じるとカードにフォーカスが戻る）',
    b5.modalOpen === true && b5.content === '目標管理について考える'
    && b5back.includes('board-card'), JSON.stringify([b5, b5back]));

  // TB-B6: 本物のドラッグ&ドロップ（結果＝保存後のファイル内容で照合する）
  await boardOf(F6, { showDone: true });
  await page.dragAndDrop('.board-col[data-section="PEW"] .board-card',
    '.board-col[data-section="UL"]');
  const b6 = await withDialogs('accept', () => page.evaluate(() =>
    window.__sBoard.save().then(res => ({ res, text: window.__sBoard.getAdapterText() }))));
  r.check('TB-B6（ドラッグで opMoveSection・メモと子も一緒に移り他行はバイト不変）',
    b6.result.res.ok === true
    && eq(NB(b6.result.text), ['# tasks', '## PEW', '- [x] 要件ヒアリング ✅ 2026-08-01',
      '## UL', '- [ ] 目標管理について考える #UL業務 🔽',
      '- [ ] 外部IF定義書作成 #PEW [[2026-07-21]] 📅 2026-08-15 ⏫',
      '\t- 仕様書のレビュー待ち', '\t- [ ] PRODUCTS の項目定義', '## その他']),
    JSON.stringify(NB(b6.result.text)));

  await boardOf(F6, { showDone: true });
  await page.dragAndDrop('.board-col[data-section="PEW"] .board-card',
    '.board-col[data-section="PEW"]');
  const b7 = await page.evaluate(() => ({
    saveDisabled: document.getElementById('btn-save').disabled,
    text: window.__sBoard.getText(),
  }));
  r.check('TB-B7（同じ列へのドロップは何もしない＝保存ボタンが有効にならない）',
    b7.saveDisabled === true && b7.text === F6, JSON.stringify(b7.saveDisabled));

  const b8 = await page.evaluate(() => {
    // 展開状態はセッション内で持ち越されるので、トグルではなく「開いていなければ開く」
    if (!document.querySelector('.card-kid')) {
      const card = document.querySelector('.board-col[data-section="PEW"] .board-card');
      Array.from(card.querySelectorAll('.card-btn')).find(b => b.textContent.includes('子')).click();
    }
    const kid = document.querySelector('.card-kid');
    return { kidDraggable: kid.draggable, kidHasAttr: kid.hasAttribute('draggable') };
  });
  r.check('TB-B8（子タスクの行は draggable ではない＝子だけ移動できない）',
    b8.kidDraggable === false && b8.kidHasAttr === false, JSON.stringify(b8));

  const b9 = await boardOf(F6, { showDone: true }).then(() => page.evaluate(() => {
    const key = (card, k) => card.dispatchEvent(new KeyboardEvent('keydown',
      { key: k, metaKey: true, bubbles: true, cancelable: true }));
    const first = () => document.querySelector('.board-col[data-section="PEW"] .board-card');
    key(first(), 'ArrowRight');                       // PEW → UL
    const afterRight = Array.from(document.querySelectorAll('.board-col')).map(c =>
      [c.dataset.section, Array.from(c.querySelectorAll('.board-card')).length]);
    const moved = document.querySelector('.board-col[data-section="UL"] .board-card[data-line]');
    key(moved, 'ArrowLeft');                          // UL → PEW（先頭のカード）
    const afterLeft = Array.from(document.querySelectorAll('.board-col')).map(c =>
      [c.dataset.section, Array.from(c.querySelectorAll('.board-card')).length]);
    // 先頭の列で ArrowLeft は何もしない
    const head = document.querySelector('.board-col[data-section="PEW"] .board-card');
    key(head, 'ArrowLeft');
    const afterEdge = Array.from(document.querySelectorAll('.board-col')).map(c =>
      [c.dataset.section, Array.from(c.querySelectorAll('.board-card')).length]);
    return { afterRight, afterLeft, afterEdge };
  }));
  r.check('TB-B9（Cmd/Ctrl+←→ でセクション移動・端では何もしない）',
    eq(b9.afterRight, [['PEW', 1], ['UL', 2], ['その他', 0]])
    && eq(b9.afterLeft, [['PEW', 2], ['UL', 1], ['その他', 0]])
    && eq(b9.afterEdge, [['PEW', 2], ['UL', 1], ['その他', 0]]),
    JSON.stringify(b9));

  const b10 = await page.evaluate(() => {
    const card = document.querySelector('.board-col[data-section="UL"] .board-card');
    Array.from(card.querySelectorAll('.card-btn')).find(b => b.textContent === '移動').click();
    const buttons = Array.from(document.querySelectorAll('#popover button')).map(b => b.textContent);
    const hidden = document.getElementById('popover').hidden;
    return { buttons, hidden };
  });
  r.check('TB-B10（［移動］でセクションポップオーバーが開く＝マウスだけの経路）',
    b10.hidden === false && b10.buttons.includes('PEW') && b10.buttons.includes('その他'),
    JSON.stringify(b10));

  const manyCards = (n) => {
    const out = ['# tasks', '', '## PEW', ''];
    for (let i = 1; i <= n; i++) out.push('- [ ] c' + i);
    return out.join('\n') + '\n';
  };
  const b11over = await boardOf(manyCards(301), {});
  const b11ok = await boardOf(manyCards(300), {});
  r.check('TB-B11（カード上限超過で描画せず理由を表示・上限内なら描画する）',
    b11over.cols.length === 0 && b11over.note.includes('301件（上限300件）')
    && b11ok.cols[0].cards.length === 300,
    JSON.stringify([b11over.cols.length, b11over.note, b11ok.cols[0] && b11ok.cols[0].cards.length]));

  /* ========== TB-F1〜F11: テキスト検索（Phase S） ========== */


  await setView('list');
  // ハイライトは**展開したメモ**に付く仕様（TB-Q36）。Phase T5 で
  // 「メモが一致した行は自動で展開する」ようにしたので、手動で開く必要はなくなった
  // （それ以前は前のテストで開いた state.memoOpen の残りに依存して通っていた）
  const f1 = await searchIn('list', '仕様書');
  r.check('TB-F1（メモがヒット源になる・メモ行もハイライトされる）',
    eq(f1.rows, [5, 7]) && f1.count === '1 件ヒット' && f1.hits >= 1,
    JSON.stringify(f1));

  const f2 = await searchIn('list', 'PRODUCTS');
  r.check('TB-F2（子だけ一致でも親が出る・一致しない兄弟は出ない）',
    eq(f2.rows, [5, 7]) && f2.count === '1 件ヒット', JSON.stringify(f2));

  const f3 = await searchIn('list', 'UL業務');
  const f3b = await searchIn('list', '#UL業務');
  r.check('TB-F3（タグでヒットする・# 付きでも同じ）',
    eq(f3.rows, [12]) && eq(f3b.rows, [12]), JSON.stringify([f3.rows, f3b.rows]));

  const f4 = await searchIn('list', '2026-07-21');
  r.check('TB-F4（関連ノート名でヒットする）', eq(f4.rows, [5, 7]), JSON.stringify(f4));

  const f5 = await searchIn('list', 'products');
  r.check('TB-F5a（大文字小文字を区別しない）', eq(f5.rows, [5, 7]), JSON.stringify(f5.rows));

  // NFD で検索しても NFC 正規化して比較する（F2 の9行目は NFD 表記）
  await page.evaluate(([f2text, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(f2text);
  }, [F2, TODAY]);
  const f5nfd = await searchIn('list', 'ポイント'.normalize('NFD'));
  const f5nfc = await searchIn('list', 'ポイント'.normalize('NFC'));
  r.check('TB-F5b（NFD で検索しても NFC の本文にヒットする）',
    eq(f5nfd.rows, [9]) && eq(f5nfc.rows, [9]),
    JSON.stringify([f5nfd.rows, f5nfc.rows]));

  await setView('list');
  const before6 = await searchIn('list', '外部');
  const f6comp = await searchIn('list', '存在しない語', true);   // 変換中は走らない
  r.check('TB-F6（IME 変換中は検索しない＝表示が変わらない）',
    eq(f6comp.rows, before6.rows) && f6comp.count === before6.count,
    JSON.stringify([before6.rows, f6comp.rows]));

  const f7 = await page.evaluate(async () => {
    const sec = document.getElementById('f-section');
    sec.value = 'UL';
    sec.dispatchEvent(new Event('change', { bubbles: true }));
    const inp = document.getElementById('f-q');
    inp.value = '外部IF';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 350));
    const withUl = Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)'))
      .map(tr => Number(tr.dataset.line));
    sec.value = '';
    sec.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(d => setTimeout(d, 50));
    const withAll = Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)'))
      .map(tr => Number(tr.dataset.line));
    return { withUl, withAll };
  });
  r.check('TB-F7（セクション絞り込みとの併用は AND）',
    eq(f7.withUl, []) && eq(f7.withAll, [5, 7]), JSON.stringify(f7));

  await setView('board');
  const f8board = await searchIn('board', 'PRODUCTS');
  await setView('timeline');
  const f8tl = await searchIn('timeline', '存在しない語');
  r.check('TB-F8（ボードとタイムラインにも効く・タイムラインの案内に検索語が入る）',
    eq(f8board.rows, [5]) && f8tl.tlNote.includes('検索: 存在しない語'),
    JSON.stringify([f8board.rows, f8tl.tlNote]));

  await setView('list');
  const f9 = await page.evaluate(async () => {
    const inp = document.getElementById('f-q');
    inp.value = '外部IF';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 350));
    return {
      marks: Array.from(document.querySelectorAll('#task-table .hit')).map(m => m.textContent),
      text: window.__sF.getText(),
    };
  });
  r.check('TB-F9（ハイライトが span になる・本文は書き換わらない）',
    eq(f9.marks, ['外部IF']) && f9.text === F6, JSON.stringify(f9.marks));

  const f10 = await searchIn('list', '存在しない語');
  r.check('TB-F10（0件のときは検索語つきの案内を出す）',
    f10.count === '0 件ヒット' && f10.empty === '一致するタスクがありません（検索: 存在しない語）',
    JSON.stringify(f10));

  const f11page = r.watch(await context.newPage());
  await f11page.goto(fileUrl('web/taskboard.html'));
  const f11 = await f11page.evaluate(([text, today]) => {
    window.taskboard.test.setToday(today);
    window.taskboard.test.newSession(text);
    const saved = JSON.parse(localStorage.getItem('tools:taskboard') || '{}').data || {};
    return { q: document.getElementById('f-q').value, savedHasQ: 'q' in saved };
  }, [F6, TODAY]);
  await f11page.close();
  r.check('TB-F11（検索語は永続化しない）', f11.q === '' && f11.savedHasQ === false,
    JSON.stringify(f11));

  /* --- TB-F13〜F18: 検索でヒットしたメモの自動展開（Phase T5・2026-08-07） --- */
  const memoRows = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#task-table tbody tr.memo-row')).map(tr => tr.textContent.trim()));

  await setView('list');
  const f13before = await memoRows();
  const f13 = await searchIn('list', '仕様書');      // メモにだけある語
  const f13rows = await memoRows();
  r.check('TB-F13（メモだけが一致した行はメモが自動で開き、ハイライトも出る）',
    f13before.length === 0 && f13rows.length === 1
    && f13rows[0].includes('仕様書のレビュー待ち') && f13.hits >= 1,
    JSON.stringify([f13before, f13rows, f13.hits]));

  await searchIn('list', '');                        // 検索をやめる
  const f14 = await memoRows();
  r.check('TB-F14（検索をやめると自動で開いたメモは畳まれる）',
    f14.length === 0, JSON.stringify(f14));

  // 手動で開いたメモは検索の前後で畳まれない
  await page.evaluate(() => {
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(x => x.dataset.line === '5');
    tr.querySelector('.memo-mark').click();
  });
  const f15open = await memoRows();
  await searchIn('list', '仕様書');
  await searchIn('list', '');
  const f15after = await memoRows();
  r.check('TB-F15（手動で開いたメモは検索の前後で開いたまま）',
    f15open.length === 1 && f15after.length === 1
    && f15after[0].includes('仕様書のレビュー待ち'),
    JSON.stringify([f15open, f15after]));
  // 後続テストのために畳んでおく（ハーネスは状態を共有する）
  await page.evaluate(() => {
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(x => x.dataset.line === '5');
    tr.querySelector('.memo-mark').click();
  });

  /* --- ボードでのメモ自動展開（Phase T5b・TB-F16〜F18） --- */
  const cardMemos = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.board-card .card-memo')).map(x => x.textContent.trim()));

  await setView('board');
  const f16before = await cardMemos();
  const f16 = await searchIn('board', '仕様書');
  const f16after = await cardMemos();
  const f16hit = await page.evaluate(() =>
    document.querySelectorAll('.board-card .card-memo .hit').length);
  r.check('TB-F16（ボードでもメモが自動展開し、ハイライトも効く）',
    f16before.length === 0 && f16after.length === 1
    && f16after[0].includes('仕様書のレビュー待ち') && f16hit >= 1
    && eq(f16.rows, [5]),
    JSON.stringify([f16before, f16after, f16hit, f16.rows]));

  await searchIn('board', '');
  const f17 = await cardMemos();
  r.check('TB-F17（ボードでも検索をやめると自動展開分が畳まれる）',
    f17.length === 0, JSON.stringify(f17));

  // リストとボードを往復しても展開状態が壊れない（同じ memoOpen を見ている）
  await searchIn('board', '仕様書');
  const f18board = await cardMemos();
  await page.evaluate(() => window.__sF.setView('list'));
  const f18list = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#task-table tbody tr.memo-row')).map(x => x.textContent.trim()));
  await page.evaluate(() => window.__sF.setView('board'));
  const f18back = await cardMemos();
  await searchIn('board', '');
  r.check('TB-F18（リストとボードを往復しても展開状態が壊れない）',
    f18board.length === 1 && f18list.length === 1 && f18back.length === 1
    && f18list[0].includes('仕様書のレビュー待ち'),
    JSON.stringify([f18board, f18list, f18back]));
  await setView('list');   // 後続テストはリスト前提（状態を残さない）

  // TB-F12: 検索中のアーカイブ確認に「（検索で絞り込み中）」が付く（8/3 の事故と同じ型を防ぐ）
  const f12 = await withDialogs('dismiss', () => page.evaluate(async ([f1, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f1);
    s.applyOps([{ type: 'complete', line: 9 }]);
    await s.save();
    const inp = document.getElementById('f-q');
    inp.value = '資料作成';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 350));
    return s.archive();
  }, [F1, TODAY]));
  r.check('TB-F12（検索中のアーカイブ確認に「（検索で絞り込み中）」が付く）',
    f12.messages.length === 1 && f12.messages[0].includes('（検索で絞り込み中）')
    && f12.result.reason === 'cancel', JSON.stringify(f12.messages));

  await page.evaluate(() => {
    const inp = document.getElementById('f-q');
    inp.value = '';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  },
};
