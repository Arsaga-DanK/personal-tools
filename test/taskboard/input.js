'use strict';
/* test/taskboard/input.js — 節: 追加モーダルの内容欄・子タスク popover・インライン編集・IME ガード（CDP 込み）・取り消しの UI 経路・実キー
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js input）
   照合する ID: TB-I1〜I8・U1〜U7。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'input',
  ids: 'TB-I1〜I8・U1〜U7',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-I1〜I3: 追加モーダルの内容欄（1行フォーム廃止に伴い移設） ========== */
  await session(F1);
  await addModal();
  await page.fill('#modal-content', '誤追加');
  const before1 = await ui();
  await sendKey('#modal-content', 'Enter', 'composing');
  const i1 = await ui();
  r.check('TB-I1（isComposing Enter で追加されない・入力値が残る）',
    i1.rows === before1.rows && i1.input === '誤追加' && i1.text === F1,
    JSON.stringify([before1.rows, i1.rows, i1.input]));

  await sendKey('#modal-content', 'Enter', 'keycode229');
  const i3 = await ui();
  r.check('TB-I3（keyCode 229 のみでも追加されない）',
    i3.rows === before1.rows && i3.input === '誤追加' && i3.text === F1,
    JSON.stringify([i3.rows, i3.input]));

  await sendKey('#modal-content', 'Enter', 'plain');
  const i2 = await ui();
  r.check('TB-I2（通常 Enter では追加される・入力欄クリア・フォーカス復帰）',
    i2.rows === before1.rows + 1 && i2.bodies.includes('誤追加')
    && i2.input === '' && i2.activeId === 'modal-content',
    JSON.stringify([i2.rows, i2.input, i2.activeId]));

  /* ========== TB-I4: 子タスク popover ========== */
  await session(F1);
  const beforeChild = await ui();
  await page.evaluate(() => document.querySelector('#task-table tbody tr .btn-child').click());
  await page.evaluate(() => { document.querySelector('#popover input[type="text"]').value = '子IME'; });
  await sendKey('#popover input[type="text"]', 'Enter', 'composing');
  const i4a = await ui();
  await sendKey('#popover input[type="text"]', 'Enter', 'plain');
  const i4b = await ui();
  r.check('TB-I4（子タスク: isComposing では追加も閉鎖もしない／通常 Enter では追加して閉じる）',
    i4a.rows === beforeChild.rows && i4a.popoverHidden === false && i4a.popoverInput === '子IME'
    && i4b.rows === beforeChild.rows + 1 && i4b.bodies.some(b => b.includes('子IME')) && i4b.popoverHidden === true,
    JSON.stringify([i4a.rows, i4a.popoverHidden, i4b.rows, i4b.popoverHidden]));

  /* ========== TB-I5: インライン編集 ========== */
  await session(F1);
  await page.dblclick('#task-table tbody tr:first-child td.cell-body');
  await page.evaluate(() => { document.querySelector('td.cell-body input').value = '編集IME'; });
  await sendKey('td.cell-body input', 'Enter', 'composing');
  const i5a = await ui();
  await page.evaluate(() => { document.querySelector('td.cell-body input').value = '編集確定'; });
  await sendKey('td.cell-body input', 'Enter', 'plain');
  const i5b = await ui();
  r.check('TB-I5（編集: isComposing では既存行を上書きしない／通常 Enter では確定）',
    i5a.text === F1 && i5a.editing === true
    && i5b.text !== F1 && i5b.bodies.some(b => b.includes('編集確定')) && i5b.editing === false,
    JSON.stringify([i5a.text === F1, i5a.editing, i5b.editing, i5b.bodies[0]]));

  /* ========== TB-I7: Escape の IME ガード ========== */
  await session(F1);
  await page.evaluate(() => document.querySelector('#task-table tbody tr .btn-child').click());
  await page.evaluate(() => { document.querySelector('#popover input[type="text"]').value = 'Escape確認'; });
  await sendKey('#popover input[type="text"]', 'Escape', 'composing');
  const i7a = await ui();
  await sendKey('#popover input[type="text"]', 'Escape', 'plain');
  const i7b = await ui();
  r.check('TB-I7（Escape: isComposing では閉じず入力が残る／通常 Escape では閉じる）',
    i7a.popoverHidden === false && i7a.popoverInput === 'Escape確認' && i7b.popoverHidden === true,
    JSON.stringify([i7a.popoverHidden, i7a.popoverInput, i7b.popoverHidden]));

  /* ========== TB-I8: Cmd/Ctrl+; = 今日（lib/edit.js — 利用者の明示要望） ==========
     注: 挿入されるのは**実際の今日**（setToday の注入値ではない）。共通部品を使うため */
  await session(F1);
  await addModal();
  const i8 = await page.evaluate(() => {
    if (!window.ToolEdit) return { missing: true };
    const semi = (el, composing) => {
      el.focus();
      const ev = new KeyboardEvent('keydown', {
        key: ';', metaKey: true, bubbles: true, cancelable: true, isComposing: !!composing,
      });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
    const start = document.getElementById('modal-start');
    const due = document.getElementById('modal-due');
    const content = document.getElementById('modal-content');
    start.value = '';
    let changed = 0;
    start.addEventListener('change', () => changed++, { once: true });
    const startPrevented = semi(start);
    // 変換中は奪わない（期限欄で確認）
    due.value = '';
    const duePrevented = semi(due, true);
    // テキスト系はキャレット位置に挿入
    content.value = '打合せ ';
    content.selectionStart = content.selectionEnd = content.value.length;
    const contentPrevented = semi(content);
    return {
      today, start: start.value, changed, startPrevented,
      due: due.value, duePrevented,
      content: content.value, contentPrevented,
    };
  });
  await shutModal();
  r.check('TB-I8（Cmd/Ctrl+;: 日付欄に今日＋change・テキスト欄はキャレット挿入・変換中は何もしない）',
    !i8.missing
    && i8.start === i8.today && i8.changed === 1 && i8.startPrevented === true
    && i8.due === '' && i8.duePrevented === false
    && i8.content === '打合せ ' + i8.today && i8.contentPrevented === true,
    JSON.stringify(i8));

  /* ========== TB-I6: CDP による実 composition ========== */
  const cdp = await context.newCDPSession(page);
  await session(F1);
  await addModal();
  await page.click('#modal-content');
  await page.fill('#modal-content', '');
  await cdp.send('Input.imeSetComposition', { text: 'かいぎ', selectionStart: 3, selectionEnd: 3 });
  await page.waitForTimeout(60);
  await cdp.send('Input.imeSetComposition', { text: '会議', selectionStart: 2, selectionEnd: 2 });
  await page.waitForTimeout(60);
  const composing = await page.inputValue('#modal-content');
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
  await page.waitForTimeout(200);
  const i6 = await ui();
  r.check('TB-I6（実 composition の確定 Enter で追加されない — 本件の再現経路）',
    composing === '会議' && i6.text === F1 && !i6.bodies.some(b => b.includes('会議')),
    JSON.stringify([composing, i6.text === F1, i6.bodies.filter(b => b.includes('会議'))]));

  /* ========== TB-U1〜U5: 取り消し（純関数・バイト同一） ========== */
  const u1 = await ops(F1, [
    { type: 'addTask', section: 'UL', content: '誤追加' },
    { type: 'undoAdd', line: 18 },
  ]);
  r.check('TB-U1（通常セクションの追加→取り消しで F1 と同一バイト）', u1 === F1, JSON.stringify(u1.slice(-40)));

  const u2 = await ops(F1, [
    { type: 'addTask', section: 'その他', content: '誤追加' },
    { type: 'undoAdd', line: 21 },
  ]);
  r.check('TB-U2（空セクション: 挿入された空行も一緒に取り消す）', u2 === F1, JSON.stringify(u2.slice(-40)));

  const u3rev = await ops(F1, [
    { type: 'addTask', section: 'その他', content: 'A' },
    { type: 'addTask', section: 'その他', content: 'B' },
    { type: 'undoAdd', line: 22 }, // 後から追加した B を先に
    { type: 'undoAdd', line: 21 },
  ]);
  const u3fwd = await ops(F1, [
    { type: 'addTask', section: 'その他', content: 'A' },
    { type: 'addTask', section: 'その他', content: 'B' },
    { type: 'undoAdd', line: 21 }, // 先に追加した A を先に（空行も一緒に消える）
    { type: 'undoAdd', line: 20 }, // 残った B は1行上がっている
  ]);
  r.check('TB-U3（2件追加を順不同で取り消しても F1 に収束）', u3rev === F1 && u3fwd === F1,
    JSON.stringify([u3rev === F1, u3fwd === F1, JSON.stringify(u3fwd.slice(-30))]));

  const u4err = await opsError(F1, [
    { type: 'addTask', section: 'UL', content: '親' },
    { type: 'addChild', parentLine: 18, content: '子' },
    { type: 'undoAdd', line: 18 },
  ]);
  const u4ok = await ops(F1, [
    { type: 'addTask', section: 'UL', content: '親' },
    { type: 'addChild', parentLine: 18, content: '子' },
    { type: 'undoAdd', line: 19 },
    { type: 'undoAdd', line: 18 },
  ]);
  r.check('TB-U4（子孫を持つ追加行は例外・子から順なら F1 に戻る）',
    !!u4err && u4err.includes('子タスク') && u4ok === F1, JSON.stringify([u4err, u4ok === F1]));

  const u5err = await opsError(F1, [{ type: 'undoAdd', line: 9 }]);
  r.check('TB-U5（既存行の取り消しは例外）',
    !!u5err && u5err.includes('既存'), JSON.stringify(u5err));

  /* ========== TB-U6: UI 経路（追加→取り消し→保存でバイト同一） ========== */
  await session(F1);
  await addModal();
  await page.fill('#modal-content', '間違えた追加');
  await sendKey('#modal-content', 'Enter', 'plain');
  const u6mid = await ui();
  await shutModal();   // 表の［↩︎］を実キーで押すのでオーバーレイを閉じる
  await page.click('.btn-undo');
  const u6after = await ui();
  const u6save = await page.evaluate(() => window.__s.save().then(res => ({ res, text: window.__s.getAdapterText() })));
  const u6final = await ui();
  r.check('TB-U6（追加→取り消し→保存で F1 と同一バイト・保存後は取り消しボタン0個）',
    u6mid.undoBtns === 1 && u6after.text === F1 && u6after.banner.includes('追加を取り消しました')
    && u6save.text === F1 && u6final.undoBtns === 0 && u6final.addedRows === 0,
    JSON.stringify([u6mid.undoBtns, u6after.text === F1, u6save.text === F1, u6final.undoBtns]));

  /* ========== TB-U7: 追加行のマークとボタンの出方 ========== */
  await session(F1);
  await addModal();
  const u7base = await ui();
  await page.fill('#modal-content', '親タスク');
  await sendKey('#modal-content', 'Enter', 'plain');
  const u7added = await ui();
  await shutModal();   // 以降は表の［＋子］とポップオーバーを操作する
  const parentLine = await page.evaluate(() =>
    Number(Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(tr => tr.children[1].textContent.includes('親タスク')).dataset.line));
  await page.evaluate((line) => {
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr')).find(x => Number(x.dataset.line) === line);
    tr.querySelector('.btn-child').click();
    document.querySelector('#popover input[type="text"]').value = '子タスク';
  }, parentLine);
  await sendKey('#popover input[type="text"]', 'Enter', 'plain');
  const u7child = await ui();
  r.check('TB-U7（.row-added と ↩︎ は追加行だけ・子を持つと disabled＋title）',
    u7base.addedRows === 0 && u7base.undoBtns === 0
    && u7added.addedRows === 1 && u7added.undoBtns === 1 && u7added.undoDisabled[0] === false
    && u7child.addedRows === 2 && u7child.undoBtns === 2
    && u7child.undoDisabled.filter(Boolean).length === 1
    && u7child.undoTitles.some(t => t.includes('先に子タスクを取り消してください')),
    JSON.stringify([u7base.addedRows, u7added.addedRows, u7added.undoDisabled, u7child.undoDisabled, u7child.undoTitles]));

  /* ========== 実キー押下での回帰（合成イベントではなく本物の Enter） ========== */
  await session(F1);
  await addModal();
  const realBase = await ui();
  await page.click('#modal-content');
  await page.type('#modal-content', '実キーで追加');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const real = await ui();
  r.check('実キー Enter での追加（合成イベント以外でも回帰しない）',
    real.rows === realBase.rows + 1 && real.bodies.some(b => b.includes('実キーで追加'))
    && real.input === '' && real.activeId === 'modal-content' && real.undoBtns === 1,
    JSON.stringify([real.rows, real.input, real.activeId, real.undoBtns]));

  },
};
