'use strict';
/* 目的: docs/specs/taskboard.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/taskboard.js  /  ./test/run taskboard

   照合するID: TB-01〜20・parse チェック / TB-I1〜I7（IME ガード）/ TB-U1〜U7（追加の取り消し）
   仕様の正本は docs/specs/taskboard.md。期待値を変えるときは spec を先に直す。 */

const path = require('path');
const { launch, fileUrl, createRunner, eq, REPO } = require('./helpers');

const SHOTS = process.argv.includes('--shots');
const shotPath = name => path.join(REPO, '.playwright-mcp', name); // .gitignore 済み

// spec の fixture F1（実 tasks.md の縮約。タブは \t、末尾改行あり）
const F1 = [
  '<!--',                                                            // 1
  '正本テスト用ヘッダ（実ファイルの先頭コメントに相当）',            // 2
  '-->',                                                             // 3
  '',                                                                // 4
  '# tasks',                                                         // 5
  '',                                                                // 6
  '## PEW',                                                          // 7
  '',                                                                // 8
  '- [ ] 資料作成 #102 [[2026-07-07]]',                              // 9
  '- [x] 外部IF定義書作成 [[2026-06-02]] ✅ 2026-08-03',             // 10
  '\t- [x] PRODUCTS ✅ 2026-08-03',                                  // 11
  '\t- [ ] PRODUCTS_DETAIL',                                         // 12
  '- [ ] 資料Rv #144 [[2026-07-14_TODO]] [[2026-07-21]] 📅 2026-08-05 ⏫', // 13
  '',                                                                // 14
  '## UL',                                                           // 15
  '',                                                                // 16
  '- [ ] 目標管理について考える [[2026-07-07]] #UL業務 🔽',          // 17
  '',                                                                // 18
  '## その他',                                                       // 19
  '',                                                                // 20
].join('\n');

const TODAY = '2026-08-04';
// NFD（ホ+結合半濁点）と NFC（ポ）で同じ行を作る。生成経路で正規化されないよう文字コードで組む
const NFD9 = '- [ ] ' + 'ポイント整理'.normalize('NFD') + ' [[2026-07-07]]';
const NFC9 = '- [ ] ' + 'ポイント整理'.normalize('NFC') + ' [[2026-07-07]]';
const F2 = F1.split('\n').map((l, i) => (i === 8 ? NFD9 : l)).join('\n');
const F2c = F1.split('\n').map((l, i) => (i === 8 ? NFC9 : l)).join('\n');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const context = await browser.newContext();
  const page = r.watch(await context.newPage());
  await page.goto(fileUrl('web/taskboard.html'));

  // テストデータ自体が正規化されて「一致した」ことにならないよう前提を先に確認する
  r.check('前提（NFD !== NFC）', NFD9 !== NFC9 && NFD9.normalize('NFC') === NFC9,
    JSON.stringify([NFD9.length, NFC9.length]));

  const ops = (text, list) => page.evaluate(([t, l, today]) =>
    window.taskboard.test.applyOps(t, l, today), [text, list, TODAY]);
  const opsError = (text, list) => page.evaluate(([t, l, today]) => {
    try { window.taskboard.test.applyOps(t, l, today); return null; }
    catch (e) { return e.message; }
  }, [text, list, TODAY]);
  const lineOf = (text, n) => text.split('\n')[n - 1];
  // 指定行以外が F1 と同一バイトであることまで確かめる（バイト保全が最優先要件）
  const onlyChanged = (out, base, changedLines) => {
    const a = out.split('\n'), b = base.split('\n');
    if (a.length !== b.length) return false;
    return a.every((l, i) => changedLines.includes(i + 1) || l === b[i]);
  };

  /* ========== TB-01〜12: 編集エンジン（純関数・バイト保全） ========== */
  const t01a = await ops(F1, []);
  const t01b = await ops(F2, []);
  r.check('TB-01（無編集でバイト同一・NFD 保全）', t01a === F1 && t01b === F2,
    JSON.stringify([t01a === F1, t01b === F2]));

  const t02 = await ops(F1, [{ type: 'complete', line: 9 }]);
  r.check('TB-02（完了で ✅ 付与）',
    lineOf(t02, 9) === '- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04' && onlyChanged(t02, F1, [9]),
    lineOf(t02, 9));

  const t03 = await ops(F1, [{ type: 'uncomplete', line: 10 }]);
  r.check('TB-03（完了解除で ✅ 除去・子は不変）',
    lineOf(t03, 10) === '- [ ] 外部IF定義書作成 [[2026-06-02]]' && onlyChanged(t03, F1, [10]),
    lineOf(t03, 10));

  const t04 = await ops(F1, [{ type: 'setDue', line: 9, date: '2026-08-05' }]);
  r.check('TB-04（📅 を新規挿入）',
    lineOf(t04, 9) === '- [ ] 資料作成 #102 [[2026-07-07]] 📅 2026-08-05' && onlyChanged(t04, F1, [9]),
    lineOf(t04, 9));

  const t05 = await ops(F1, [{ type: 'setDue', line: 13, date: '2026-08-06' }]);
  r.check('TB-05（📅 インプレース置換・⏫位置不変）',
    lineOf(t05, 13) === '- [ ] 資料Rv #144 [[2026-07-14_TODO]] [[2026-07-21]] 📅 2026-08-06 ⏫'
    && onlyChanged(t05, F1, [13]), lineOf(t05, 13));

  const t06 = await ops(F1, [{ type: 'setDue', line: 13, date: null }]);
  r.check('TB-06（📅 削除）',
    lineOf(t06, 13) === '- [ ] 資料Rv #144 [[2026-07-14_TODO]] [[2026-07-21]] ⏫'
    && onlyChanged(t06, F1, [13]), lineOf(t06, 13));

  const t07 = await ops(F1, [{ type: 'complete', line: 12 }]);
  r.check('TB-07（子行の完了でタブ保持）',
    lineOf(t07, 12) === '\t- [x] PRODUCTS_DETAIL ✅ 2026-08-04' && onlyChanged(t07, F1, [12]),
    JSON.stringify(lineOf(t07, 12)));

  const t08 = await ops(F1, [{ type: 'addChild', parentLine: 10, content: '初期値の記載' }]);
  r.check('TB-08（子タスクを最終子孫の直後に挿入）',
    lineOf(t08, 13) === '\t- [ ] 初期値の記載' && t08.split('\n').length === F1.split('\n').length + 1,
    JSON.stringify(lineOf(t08, 13)));

  const t09a = await ops(F1, [{ type: 'setPriority', line: 9, value: 'high' }]);
  const t09b = await ops(F1, [{ type: 'setPriority', line: 17, value: null }]);
  r.check('TB-09（優先度の挿入・除去）',
    lineOf(t09a, 9) === '- [ ] 資料作成 #102 [[2026-07-07]] ⏫'
    && lineOf(t09b, 17) === '- [ ] 目標管理について考える [[2026-07-07]] #UL業務'
    && onlyChanged(t09a, F1, [9]) && onlyChanged(t09b, F1, [17]),
    JSON.stringify([lineOf(t09a, 9), lineOf(t09b, 17)]));

  const t10 = await ops(F1, [{ type: 'addTask', section: 'その他', content: '新規タスク', due: '2026-08-05' }]);
  r.check('TB-10（空セクション＝ファイル末尾への追加）',
    t10.endsWith('## その他\n\n- [ ] 新規タスク 📅 2026-08-05\n'), JSON.stringify(t10.slice(-60)));

  const t11 = await ops(F1, [{ type: 'addTask', section: 'UL', content: '新規' }]);
  r.check('TB-11（セクション末尾・空行の前に挿入）',
    lineOf(t11, 18) === '- [ ] 新規' && lineOf(t11, 19) === '' && lineOf(t11, 20) === '## その他',
    JSON.stringify([lineOf(t11, 18), lineOf(t11, 19)]));

  const t12 = await ops(F1, [{ type: 'editContent', line: 13, text: '資料Rv #144,146' }]);
  r.check('TB-12（本文編集した行のみトークンを標準順に再配置）',
    lineOf(t12, 13) === '- [ ] 資料Rv #144,146 ⏫ 📅 2026-08-05' && onlyChanged(t12, F1, [13]),
    lineOf(t12, 13));

  /* ========== TB-13/14: 外部同時編集（セッション） ========== */
  const t13 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    s.externalWrite(f1 + '- [ ] 外部追加\n');
    s.applyOps([{ type: 'complete', line: 9 }]);
    return s.save().then(res => ({ res, adapter: s.getAdapterText() }));
  }, [F1, TODAY]);
  r.check('TB-13（外部変更を検知して上書きしない）',
    t13.res.ok === false && t13.res.reason === 'conflict' && t13.adapter === F1 + '- [ ] 外部追加\n',
    JSON.stringify(t13.res));

  const t14 = await page.evaluate(([f2, f2c, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f2);
    s.externalWrite(f2c);
    s.applyOps([{ type: 'complete', line: 12 }]);
    return s.save().then(res => ({ res, line9: s.getAdapterText().split('\n')[8] }));
  }, [F2, F2c, TODAY]);
  r.check('TB-14（NFC/NFD 差では偽検知せず・保存後も NFD バイト保全）',
    t14.res.ok === true && t14.line9 === NFD9, JSON.stringify([t14.res, t14.line9 === NFD9]));

  /* ========== TB-15〜19: アーカイブ ========== */
  const archive = (script) => page.evaluate(([f1, today, mode]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    const showDone = () => {
      const cb = document.getElementById('f-done');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const run = async () => {
      if (mode === 'TB-15') { showDone(); return { res: await s.archive(), archive: s.getArchiveText(), tasks: s.getAdapterText() }; }
      if (mode === 'TB-16') {
        s.applyOps([{ type: 'complete', line: 9 }]);
        await s.save(); showDone();
        return { res: await s.archive(), archive: s.getArchiveText(), tasks: s.getAdapterText() };
      }
      if (mode === 'TB-17') {
        s.setArchiveText('# archive\n- [x] 旧行');
        s.applyOps([{ type: 'complete', line: 9 }]);
        await s.save(); showDone();
        return { res: await s.archive(), archive: s.getArchiveText() };
      }
      if (mode === 'TB-18') {
        s.applyOps([{ type: 'complete', line: 9 }]); showDone();
        return { res: await s.archive(), archive: s.getArchiveText(), tasks: s.getAdapterText() };
      }
      if (mode === 'TB-19') {
        s.applyOps([{ type: 'complete', line: 9 }]);
        await s.save(); showDone();
        s.externalWrite('# tasks\n別内容\n');
        return { res: await s.archive(), archive: s.getArchiveText() };
      }
    };
    return run();
  }, [F1, TODAY, script]);

  const a15 = await archive('TB-15');
  r.check('TB-15（グループ単位: 未完了の子を持つ完了親は対象外）',
    a15.res.ok === false && a15.res.reason === 'empty' && a15.archive === '' && a15.tasks === F1,
    JSON.stringify(a15.res));

  const a16 = await archive('TB-16');
  const doneLine = '- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04';
  r.check('TB-16（1件移動・archive 新規作成・tasks はラウンドトリップ）',
    a16.res.ok === true && a16.res.moved === 1
    && a16.archive === '# archive\n' + doneLine + '\n'
    && a16.tasks === F1.split('\n').filter((_, i) => i !== 8).join('\n'),
    JSON.stringify([a16.res, a16.archive]));

  const a17 = await archive('TB-17');
  r.check('TB-17（既存 archive に追記・ヘッダ重複なし・末尾改行を補修）',
    a17.archive === '# archive\n- [x] 旧行\n' + doneLine + '\n', JSON.stringify(a17.archive));

  const a18 = await archive('TB-18');
  r.check('TB-18（未保存変更があれば中止）',
    a18.res.ok === false && a18.res.reason === 'dirty' && a18.archive === '' && a18.tasks === F1,
    JSON.stringify(a18.res));

  const a19 = await archive('TB-19');
  r.check('TB-19（tasks 側の外部変更を検知して中止・archive も不変）',
    a19.res.ok === false && a19.res.reason === 'conflict' && a19.archive === '', JSON.stringify(a19.res));

  /* ========== TB-20: CRLF ========== */
  const t20 = await page.evaluate(([f1, today]) => {
    const crlf = f1.split('\n').join('\r\n');
    const parsed = window.taskboard.test.parse(crlf);
    let err = null;
    try { window.taskboard.test.applyOps(crlf, [{ type: 'complete', line: 9 }], today); }
    catch (e) { err = e.message; }
    return { taskCount: parsed.tasks.length, err };
  }, [F1, TODAY]);
  r.check('TB-20（CRLF は表示可・編集は拒否）',
    t20.taskCount === 6 && !!t20.err && t20.err.includes('CR'), JSON.stringify(t20));

  /* ========== parse 表示チェック ========== */
  const p = await page.evaluate((f1) => {
    const d = window.taskboard.test.parse(f1);
    const byLine = n => d.tasks.find(t => t.line === n);
    return {
      t9: byLine(9), t13: byLine(13), t17: byLine(17), t12: byLine(12),
      sections: d.sections,
    };
  }, F1);
  r.check('parse（#102/#144 非タグ・links・due・priority・親子・セクション）',
    eq(p.t9.tags, []) && eq(p.t9.links, ['2026-07-07'])
    && eq(p.t13.tags, []) && eq(p.t13.links, ['2026-07-14_TODO', '2026-07-21'])
    && p.t13.due === '2026-08-05' && p.t13.priority === 'high'
    && eq(p.t17.tags, ['UL業務']) && p.t17.priority === 'low'
    && p.t12.parentLine === 10 && eq(p.sections, ['PEW', 'UL', 'その他']),
    JSON.stringify(p));

  /* ========== UI ヘルパー ========== */
  const session = (text) => page.evaluate(([t, today]) => {
    window.taskboard.test.setToday(today);
    window.__s = window.taskboard.test.newSession(t);
    const form = document.getElementById('add-form');
    if (form.hidden) document.getElementById('btn-add-form').click();
  }, [text, TODAY]);

  const ui = () => page.evaluate(() => ({
    rows: document.querySelectorAll('#task-table tbody tr').length,
    bodies: Array.from(document.querySelectorAll('#task-table tbody tr')).map(tr => tr.children[1].textContent),
    addedRows: document.querySelectorAll('#task-table tbody tr.row-added').length,
    undoBtns: document.querySelectorAll('.btn-undo').length,
    undoDisabled: Array.from(document.querySelectorAll('.btn-undo')).map(b => b.disabled),
    undoTitles: Array.from(document.querySelectorAll('.btn-undo')).map(b => b.title),
    input: document.getElementById('add-content').value,
    activeId: document.activeElement ? document.activeElement.id : '',
    banner: document.getElementById('banner').hidden ? '' : document.getElementById('banner').textContent,
    popoverHidden: document.getElementById('popover').hidden,
    popoverInput: (document.querySelector('#popover input[type="text"]') || {}).value,
    editing: !!document.querySelector('td.cell-body input'),
    text: window.__s.getText(),
  }));

  // 変換中のキー（isComposing / keyCode 229）を合成する。
  // keyCode は KeyboardEventInit に無いため defineProperty で被せる
  const sendKey = (selector, key, mode) => page.evaluate(([sel, k, m]) => {
    const target = document.querySelector(sel);
    target.focus();
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, isComposing: m === 'composing' });
    if (m === 'keycode229') Object.defineProperty(ev, 'keyCode', { get: () => 229 });
    target.dispatchEvent(ev);
  }, [selector, key, mode || 'plain']);

  /* ========== TB-I1〜I3: 追加フォームの内容欄 ========== */
  await session(F1);
  await page.fill('#add-content', '誤追加');
  const before1 = await ui();
  await sendKey('#add-content', 'Enter', 'composing');
  const i1 = await ui();
  r.check('TB-I1（isComposing Enter で追加されない・入力値が残る）',
    i1.rows === before1.rows && i1.input === '誤追加' && i1.text === F1,
    JSON.stringify([before1.rows, i1.rows, i1.input]));

  await sendKey('#add-content', 'Enter', 'keycode229');
  const i3 = await ui();
  r.check('TB-I3（keyCode 229 のみでも追加されない）',
    i3.rows === before1.rows && i3.input === '誤追加' && i3.text === F1,
    JSON.stringify([i3.rows, i3.input]));

  await sendKey('#add-content', 'Enter', 'plain');
  const i2 = await ui();
  r.check('TB-I2（通常 Enter では追加される・入力欄クリア・フォーカス復帰）',
    i2.rows === before1.rows + 1 && i2.bodies.includes('誤追加')
    && i2.input === '' && i2.activeId === 'add-content',
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

  /* ========== TB-I6: CDP による実 composition ========== */
  const cdp = await context.newCDPSession(page);
  await session(F1);
  await page.click('#add-content');
  await page.fill('#add-content', '');
  await cdp.send('Input.imeSetComposition', { text: 'かいぎ', selectionStart: 3, selectionEnd: 3 });
  await page.waitForTimeout(60);
  await cdp.send('Input.imeSetComposition', { text: '会議', selectionStart: 2, selectionEnd: 2 });
  await page.waitForTimeout(60);
  const composing = await page.inputValue('#add-content');
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
  await page.fill('#add-content', '間違えた追加');
  await sendKey('#add-content', 'Enter', 'plain');
  const u6mid = await ui();
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
  const u7base = await ui();
  await page.fill('#add-content', '親タスク');
  await sendKey('#add-content', 'Enter', 'plain');
  const u7added = await ui();
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
  const realBase = await ui();
  await page.click('#add-content');
  await page.type('#add-content', '実キーで追加');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const real = await ui();
  r.check('実キー Enter での追加（合成イベント以外でも回帰しない）',
    real.rows === realBase.rows + 1 && real.bodies.some(b => b.includes('実キーで追加'))
    && real.input === '' && real.activeId === 'add-content' && real.undoBtns === 1,
    JSON.stringify([real.rows, real.input, real.activeId, real.undoBtns]));

  if (SHOTS) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: shotPath('taskboard-added-row.png'), fullPage: true });
  }

  await browser.close();
  r.report('taskboard（docs/specs/taskboard.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
