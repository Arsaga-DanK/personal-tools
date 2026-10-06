'use strict';
/* test/taskboard/engine.js — 節: 編集エンジン（純関数・バイト保全）・外部同時編集・アーカイブ・セクション移動・事故防止・CRLF・parse
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js engine）
   照合する ID: TB-01〜20・parse・AR1/AR2・S1〜S10・A1〜A7。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'engine',
  ids: 'TB-01〜20・parse・AR1/AR2・S1〜S10・A1〜A7',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
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

  /* ========== TB-15〜19・TB-AR1〜AR2: アーカイブ ========== */

  // TB-16〜19 はアーカイブ確認ダイアログ（AR-3）を通す必要がある
  const a15 = await archive('TB-15');
  r.check('TB-15（グループ単位: 未完了の子を持つ完了親は対象外）',
    a15.res.ok === false && a15.res.reason === 'empty' && a15.archive === '' && a15.tasks === F1,
    JSON.stringify(a15.res));

  const a16 = await archive('TB-16');
  const doneLine = '- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04';
  r.check('TB-16（1件移動・archive 新規作成で ## PEW の下に入る・tasks はラウンドトリップ）',
    a16.res.ok === true && a16.res.moved === 1
    && a16.archive === '# archive\n\n## PEW\n\n' + doneLine + '\n'
    && a16.tasks === F1.split('\n').filter((_, i) => i !== 8).join('\n'),
    JSON.stringify([a16.res, a16.archive]));

  const a17 = await archive('TB-17');
  r.check('TB-17（既存 archive に追記・ヘッダ重複なし・末尾改行を補修・見出しが無ければ末尾に ## PEW を作る）',
    a17.archive === '# archive\n- [x] 旧行\n\n## PEW\n\n' + doneLine + '\n', JSON.stringify(a17.archive));

  /* ---------- TB-AR1/AR2: 案件（セクション）の見出しの下へ ---------- */
  const ar1 = await page.evaluate(() => {
    const f = window.taskboard.test.archiveMerge;
    if (!f) return null;
    return [
      f('# archive\n\n## UL\n\n- [x] a\n\n## ITK\n\n- [x] x\n', [{ section: 'UL', lines: ['- [x] b'] }, { section: '面接', lines: ['- [x] c', '\t- [x] d'] }]),
      f('', [{ section: 'UL', lines: ['- [x] b'] }]),
    ];
  });
  r.check('TB-AR1（archiveMerge: 既存の節の末尾・次の見出しの前へ／無ければ末尾に見出しを作る／空なら # archive から）',
    eq(ar1, ['# archive\n\n## UL\n\n- [x] a\n- [x] b\n\n## ITK\n\n- [x] x\n\n## 面接\n\n- [x] c\n\t- [x] d\n',
      '# archive\n\n## UL\n\n- [x] b\n']), JSON.stringify(ar1));
  const AR2 = ['# tasks', '', '## A', '', '- [x] a1 ✅ 2026-08-01', '', '## B', '', '- [x] b1 ✅ 2026-08-01', '\t- [x] b1c ✅ 2026-08-01', ''].join('\n');
  const ar2 = await withDialogs('accept', () => page.evaluate(async ([t, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(t);
    s.setArchiveText('# archive\n\n## B\n\n- [x] old\n');
    const cb = document.getElementById('f-done'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    const res = await s.archive();
    return { res, archive: s.getArchiveText() };
  }, [AR2, TODAY]));
  r.check('TB-AR2（2つのセクションを一度にアーカイブ: B は既存の ## B の末尾へ・A は末尾に ## A を作る・既存の行は不変）',
    ar2.result.res.ok === true
    && ar2.result.archive === '# archive\n\n## B\n\n- [x] old\n- [x] b1 ✅ 2026-08-01\n\t- [x] b1c ✅ 2026-08-01\n\n## A\n\n- [x] a1 ✅ 2026-08-01\n',
    JSON.stringify(ar2.result));

  const a18 = await archive('TB-18');
  r.check('TB-18（未保存変更があれば中止）',
    a18.res.ok === false && a18.res.reason === 'dirty' && a18.archive === '' && a18.tasks === F1,
    JSON.stringify(a18.res));

  const a19 = await archive('TB-19');
  r.check('TB-19（tasks 側の外部変更を検知して中止・archive も不変）',
    a19.res.ok === false && a19.res.reason === 'conflict' && a19.archive === '', JSON.stringify(a19.res));

  /* ========== TB-S1〜S10: セクション移動（SM-1） ========== */
  // 「移動した行以外が1バイトも変わらない」を、行の多重集合を比べて確かめる。
  // 並びは変わるので行単位の集合として比較し、移動した行だけが位置を変えたことを見る
  // 検証方法: **非空行の並びを完全一致で照合する**（各行のバイトと相対順序が保たれ、
  // 移動した行だけが位置を変えたことが分かる）。空行は空セクションへの挿入で増えるため別途件数で見る
  const BLANKS = s => s.split('\n').filter(l => l === '').length;
  const F1NB = NB(F1);
  // F1 の非空行: 0 <!-- / 1 ヘッダ / 2 --> / 3 # tasks / 4 ## PEW / 5 資料作成 / 6 外部IF /
  //              7 PRODUCTS / 8 PRODUCTS_DETAIL / 9 資料Rv / 10 ## UL / 11 目標管理 / 12 ## その他
  const perm = idxs => idxs.map(i => F1NB[i]);
  const lineAt = (text, n) => text.split('\n')[n - 1];

  const s1 = await ops(F1, [{ type: 'moveSection', line: 17, section: 'その他' }]);
  r.check('TB-S1（空セクションへ移動: 見出し直後に空行を挟む・他行はバイト不変）',
    // 目標管理(11) が ## その他(12) の後へ。他の非空行は順序もバイトも不変
    eq(NB(s1), perm([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 11]))
    // 末尾改行を保つため元の空行が最後に残り、挿入した空行が1つ増える（opAddTask と同じ規則）
    && BLANKS(s1) === BLANKS(F1) + 1
    && s1.split('\n').slice(17, 21).join('|') === '## その他||' + F1NB[11] + '|',
    JSON.stringify(s1.split('\n').slice(15)));

  // TB-S2: 元々セクション末尾だった13行目 → UL → PEW でバイト同一に戻る
  const s2mid = await ops(F1, [{ type: 'moveSection', line: 13, section: 'UL' }]);
  const s2back = await ops(F1, [
    { type: 'moveSection', line: 13, section: 'UL' },
    { type: 'moveSection', line: 17, section: 'PEW' }, // UL 末尾に来た13行目は17行目
  ]);
  r.check('TB-S2（セクション末尾のタスクは往復でバイト同一）',
    s2back === F1 && s2mid !== F1
    && eq(NB(s2mid), perm([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 9, 12]))
    && lineAt(s2mid, 17) === F1NB[9],
    JSON.stringify([s2back === F1, lineAt(s2mid, 17)]));

  const s3 = await ops(F1, [{ type: 'moveSection', line: 10, section: 'UL' }]);
  r.check('TB-S3（子タスクも順序を保って一緒に移動・他行はバイト不変）',
    // 外部IF(6) とその子 7・8 が UL の目標管理(11) の後へ、順序を保って並ぶ
    eq(NB(s3), perm([0, 1, 2, 3, 4, 5, 9, 10, 11, 6, 7, 8, 12]))
    && BLANKS(s3) === BLANKS(F1) && s3 !== F1,
    JSON.stringify(NB(s3).slice(7, 12)));

  const s4 = await ops(F1, [
    { type: 'moveSection', line: 9, section: 'UL' },
    { type: 'moveSection', line: 17, section: 'PEW' }, // UL 末尾（目標管理の直後）に来た9行目
  ]);
  r.check('TB-S4（先頭だったタスクは往復でバイト同一にならないが全行のバイトは保存）',
    s4 !== F1
    // 資料作成(5) は PEW の末尾（資料Rv=9 の後）に着地する。順序以外は不変
    && eq(NB(s4), perm([0, 1, 2, 3, 4, 6, 7, 8, 9, 5, 10, 11, 12]))
    && BLANKS(s4) === BLANKS(F1),
    JSON.stringify([s4 !== F1, NB(s4).slice(4, 10)]));

  const s5 = await opsError(F1, [{ type: 'moveSection', line: 11, section: 'UL' }]);
  r.check('TB-S5（子タスクのセクションは変更できない）',
    !!s5 && s5.includes('子タスク'), JSON.stringify(s5));

  const s6 = await ops(F1, [{ type: 'moveSection', line: 9, section: 'PEW' }]);
  r.check('TB-S6（同じセクションなら何もしない）', s6 === F1, JSON.stringify(s6 === F1));

  const s7 = await opsError(F1, [{ type: 'moveSection', line: 9, section: '存在しない' }]);
  r.check('TB-S7（存在しないセクションは例外）',
    !!s7 && s7.includes('セクションが見つかりません'), JSON.stringify(s7));

  const s8 = await ops(F1, [
    { type: 'moveSection', line: 17, section: 'その他' },
    { type: 'moveSection', line: 20, section: 'UL' }, // その他へ移った行（19が空行・20がタスク）
  ]);
  r.check('TB-S8（空セクションへ入れて出しても全行のバイトが保存される・空行だけ増える）',
    // 非空行の並びは F1 に完全復帰する（各行のバイトも順序も保存されている）
    eq(NB(s8), F1NB)
    // 空セクションへの挿入ごとに空行が1つ増える（末尾改行を保つ規則の帰結）。2回で +2
    && BLANKS(s8) === BLANKS(F1) + 2 && s8 !== F1,
    JSON.stringify([eq(NB(s8), F1NB), BLANKS(s8), BLANKS(F1)]));

  // TB-S9: UI 経路（見出しへドラッグ → 保存 → 永続）。2026-10-01 にセクションの列を消して見出しへ落とす形に（TB-SH5）
  const s9 = await withDialogs('accept', () => page.evaluate(async ([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__s = s;
    const src = Array.from(document.querySelectorAll('#task-table tbody tr[data-line]'))
      .find(tr => tr.children[1].textContent.includes('目標管理'));
    const head = Array.from(document.querySelectorAll('#task-table tbody tr.sec-row'))
      .find(h => ((h.querySelector('.sec-name') || {}).textContent || '').replace(/^[▾▸]\s*/, '') === 'その他');
    if (!src || !head) return { missing: true };
    const dt = new DataTransfer();
    const h = src.querySelector('.drag-handle');
    h.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const rc = head.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rc.left + 80, clientY: rc.top + rc.height / 2 };
    head.dispatchEvent(new DragEvent('dragover', o));
    head.dispatchEvent(new DragEvent('drop', o));
    h.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    const banner = document.getElementById('banner').textContent;
    const res = await s.save();
    return { banner, res, adapter: s.getAdapterText(), successBanner: document.getElementById('banner').textContent };
  }, [F1, TODAY]));
  r.check('TB-S9（UI: 「その他」の見出しへドラッグで移動・保存で永続・空セクションへの挿入は「追加1行」）',
    !s9.result.missing && s9.result.banner.includes('「その他」へ移しました') && s9.result.res.ok === true
    && s9.result.adapter === s1 && s9.result.successBanner === '保存しました（変更0行・追加1行）',
    JSON.stringify(s9.result.missing ? s9.result : [s9.result.banner, s9.result.adapter === s1, s9.result.successBanner]));

  // TB-S11: タスクがあるセクションへの移動は行が増えないため「（行の移動）」と表示される
  const s11 = await withDialogs('accept', () => page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    s.applyOps([{ type: 'moveSection', line: 13, section: 'UL' }]); // UL には既にタスクがある
    const saveEnabled = !document.getElementById('btn-save').disabled;
    return s.save().then(res => ({
      res, saveEnabled, adapter: s.getAdapterText(),
      successBanner: document.getElementById('banner').textContent,
    }));
  }, [F1, TODAY]));
  r.check('TB-S11（行が増えない移動は「（行の移動）」と表示・isDirty が拾う）',
    s11.result.saveEnabled === true && s11.result.res.ok === true
    && s11.result.adapter === s2mid
    && s11.result.successBanner === '保存しました（行の移動）',
    JSON.stringify([s11.result.saveEnabled, s11.result.adapter === s2mid, s11.result.successBanner]));

  // TB-S10: 子タスクは見出しへ落とせない（TB-SH5 で照合）／セクションが1つだけのファイルでも見出しは1つ出る（2026-10-01 改訂）
  const s10 = await page.evaluate(() => {
    window.taskboard.test.newSession('# tasks\n\n## PEW\n\n- [ ] only\n');
    return { heads: document.querySelectorAll('#task-table tbody tr.sec-row').length,
      name: ((document.querySelector('#task-table tbody tr.sec-row .sec-name') || {}).textContent || '').replace(/^[▾▸]\s*/, '') };
  });
  r.check('TB-S10（セクションが1つだけのファイルでも見出しは1つ — 子が見出しへ落とせないことは TB-SH5）',
    s10.heads === 1 && s10.name === 'PEW', JSON.stringify(s10));

  /* ========== TB-A1〜A7: アーカイブ先と一括操作の事故防止（AR-1 / AR-3） ========== */
  // 完了させたい行を ops で指定し、save() / archive() を確認ダイアログ込みで走らせる
  const bulkSession = (fixture, completeLines, mode) => page.evaluate(([text, today, lines, m]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(text);
    window.__s = s;
    s.applyOps(lines.map(n => ({ type: 'complete', line: n })));
    if (m === 'uncomplete10') s.applyOps([{ type: 'uncomplete', line: 10 }]);
    return s.save().then(res => ({ res, adapter: s.getAdapterText() }));
  }, [fixture, TODAY, completeLines, mode || '']);

  const archiveSession = () => page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__s = s;
    s.applyOps([{ type: 'complete', line: 9 }]);
    return s.save().then(async () => {
      const cb = document.getElementById('f-done');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      const res = await s.archive();
      return { res, archive: s.getArchiveText(), tasks: s.getAdapterText() };
    });
  }, [F1, TODAY]);

  const a1 = await withDialogs('accept', archiveSession);
  r.check('TB-A1（アーカイブ確認: 件数と対象ファイル名を出して実行）',
    a1.result.res.ok === true && a1.result.res.moved === 1
    && eq(a1.messages, ['1件を archive.md へ移動します。よろしいですか？']),
    JSON.stringify([a1.result.res, a1.messages]));

  // キャンセル時は「行が消えない」ことを見る（除去は archive 書込成功後にのみ起こる）。
  // アーカイブ前の保存は済んでいるので9行目は完了済みで残る
  const DONE9 = '- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04';
  const a2 = await withDialogs('dismiss', archiveSession);
  r.check('TB-A2（アーカイブ確認をキャンセル: archive は空・tasks の行は消えない）',
    a2.result.res.ok === false && a2.result.res.reason === 'cancel'
    && a2.result.archive === ''
    && a2.result.tasks === F1.split('\n').map((l, i) => (i === 8 ? DONE9 : l)).join('\n'),
    JSON.stringify([a2.result.res, a2.result.archive === '', a2.result.tasks.split('\n')[8]]));

  const FIVE = [5, 6, 7, 8, 9]; // F3 のタスク行
  const a3 = await withDialogs('accept', () => bulkSession(F3, FIVE));
  r.check('TB-A3（5件の完了は保存時に確認して実行）',
    a3.result.res.ok === true && eq(a3.messages, ['5件を完了にします。よろしいですか？']),
    JSON.stringify([a3.result.res, a3.messages]));

  const a4 = await withDialogs('dismiss', () => bulkSession(F3, FIVE));
  const a4kept = await page.evaluate(() => window.__s.getText() !== window.__s.getAdapterText());
  r.check('TB-A4（確認をキャンセルすると保存されない・編集状態は保持）',
    a4.result.res.ok === false && a4.result.res.reason === 'cancel'
    && a4.result.adapter === F3 && a4kept === true,
    JSON.stringify([a4.result.res, a4.result.adapter === F3, a4kept]));

  const a5 = await withDialogs('accept', () => bulkSession(F3, [5, 6, 7, 8]));
  r.check('TB-A5（4件では確認を出さない＝通常操作を重くしない）',
    a5.result.res.ok === true && eq(a5.messages, []), JSON.stringify([a5.result.res, a5.messages]));

  const a6 = await withDialogs('accept', () => bulkSession(F1, [9], 'uncomplete10'));
  r.check('TB-A6（完了解除は数えない）',
    a6.result.res.ok === true && eq(a6.messages, []), JSON.stringify([a6.result.res, a6.messages]));

  const a7 = await withDialogs('accept', () => page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    // 既存の完了行（10・11行目）には触らず、期限だけ変える
    s.applyOps([{ type: 'setDue', line: 9, date: '2026-08-05' }]);
    return s.save().then(res => ({ res, adapter: s.getAdapterText() }));
  }, [F1, TODAY]));
  r.check('TB-A7（既に完了だった行は数えない）',
    a7.result.res.ok === true && eq(a7.messages, []), JSON.stringify([a7.result.res, a7.messages]));

  // TB-A8・A9: archive.md の読み込みに失敗したとき（2026-10-06 — 読めないのに空とみなして上書きし、前の分を全部消す作りだった）
  const archReadFails = (errName) => page.evaluate(([f1, today, name]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    s.setArchiveText('# archive\n- [x] 旧行\n');
    const realRead = state.archiveAdapter.read;
    state.archiveAdapter.read = async () => { const e = new Error('読めない'); e.name = name; throw e; };
    s.applyOps([{ type: 'complete', line: 9 }]);
    return s.save().then(async () => {
      const cb = document.getElementById('f-done');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      const res = await s.archive();
      state.archiveAdapter.read = realRead;
      return { res, archive: s.getArchiveText(), tasks: s.getAdapterText(), banner: document.getElementById('banner').textContent };
    });
  }, [F1, TODAY, errName]);
  const a8 = await withDialogs('accept', () => archReadFails('NotReadableError'));
  r.check('TB-A8（archive.md を読めなければ中止 — 上書きして前の分を消さない・tasks の行も消えない）',
    a8.result.res.ok === false && a8.result.res.reason === 'archread' && a8.result.archive === '# archive\n- [x] 旧行\n'
    && a8.result.tasks.includes('- [x] 資料作成') && a8.result.banner.includes('中止'), JSON.stringify(a8.result));
  const a9 = await withDialogs('accept', () => archReadFails('NotFoundError'));
  r.check('TB-A9（archive.md がまだ無い（NotFoundError）ときは今どおり新しく作って移す）',
    a9.result.res.ok === true && a9.result.archive.startsWith('# archive\n') && a9.result.archive.includes('資料作成'), JSON.stringify(a9.result));

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

  },
};
