'use strict';
/* 目的: docs/specs/taskboard.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/taskboard.js  /  ./test/run taskboard

   照合するID: TB-01〜20・parse チェック / TB-S1〜S11（セクション移動）/
   TB-A1〜A7（事故防止）/ TB-I1〜I7（IME ガード）/ TB-U1〜U7（追加の取り消し）/
   TB-P1〜P19（計画ビュー: 🛫 とタイムライン）
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

// F3: 一括完了の閾値（5件）用。F1 の未完了は 9・12・13・17 の4件だけで閾値に届かない
const F3 = [
  '# tasks', '', '## PEW', '',
  '- [ ] t1', '- [ ] t2', '- [ ] t3', '- [ ] t4', '- [ ] t5', '',
].join('\n'); // タスク行は5〜9行目

// F4: 計画ビュー（Phase T）用。TODAY='2026-08-04' で遅延・進行中・予定・完了が1つずつ、
// 加えて「🛫 のみ（📅 なし）」と「🛫 なし（対象外）」を各1件。
// 表示範囲は min🛫 2026-07-20 −3日 = 07-17 〜 max(end) 2026-08-31 +3日 = 09-03（49日）
const F4 = [
  '# tasks', '', '## PEW', '',
  '- [ ] 外部IF定義書作成 🛫 2026-07-28 📅 2026-08-01',                //  5 遅延
  '- [ ] 基本設計レビュー 🛫 2026-08-01 📅 2026-08-10 ⏫',              //  6 進行中
  '- [ ] 結合テスト計画 🛫 2026-08-20 📅 2026-08-31',                   //  7 予定
  '- [x] 要件ヒアリング 🛫 2026-07-20 📅 2026-07-24 ✅ 2026-07-24',     //  8 完了
  '- [ ] 開始日のみ設定 🛫 2026-08-06',                                 //  9 📅なし=1日バー
  '- [ ] 期限のみ設定 📅 2026-08-15',                                   // 10 🛫なし=対象外
  '',
].join('\n');

// F5: メモ（Phase N）用。メモ・複数行メモ・メモと子タスクの混在・メモだけを持つ完了タスク
const F5 = [
  '# tasks', '', '## PEW', '',
  '- [ ] 親A',            //  5
  '\t- メモ1行目',        //  6 メモ
  '\t- メモ2行目',        //  7 メモ
  '\t- [ ] 子A1',         //  8 子タスク
  '\t\t- 子のメモ',       //  9 子A1 のメモ
  '- [ ] 親B',            // 10 メモなし
  '- [x] 親C',            // 11
  '\t- Cのメモ',          // 12
  '', '## UL', '',        // 13-15
  '',                     // 16（join で末尾改行）
].join('\n');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const context = await browser.newContext();
  const page = r.watch(await context.newPage());

  // confirm() の応答を制御する。Playwright の既定は dismiss なので、明示しないと
  // AR-3 の確認ダイアログで全アーカイブ・一括保存がキャンセル扱いになる
  let dialogAction = 'accept';
  let dialogLog = [];
  page.on('dialog', async d => {
    dialogLog.push(d.message());
    if (dialogAction === 'accept') await d.accept(); else await d.dismiss();
  });
  const withDialogs = async (action, fn) => {
    const prev = dialogAction;
    dialogAction = action;
    dialogLog = [];
    try { return { result: await fn(), messages: dialogLog.slice() }; }
    finally { dialogAction = prev; }
  };

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

  // TB-16〜19 はアーカイブ確認ダイアログ（AR-3）を通す必要がある
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

  /* ========== TB-S1〜S10: セクション移動（SM-1） ========== */
  // 「移動した行以外が1バイトも変わらない」を、行の多重集合を比べて確かめる。
  // 並びは変わるので行単位の集合として比較し、移動した行だけが位置を変えたことを見る
  // 検証方法: **非空行の並びを完全一致で照合する**（各行のバイトと相対順序が保たれ、
  // 移動した行だけが位置を変えたことが分かる）。空行は空セクションへの挿入で増えるため別途件数で見る
  const NB = s => s.split('\n').filter(l => l !== '');
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

  // TB-S9: UI 経路（クリック → 保存 → 永続）
  const s9 = await withDialogs('accept', () => page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    window.__s = s;
    const rows = Array.from(document.querySelectorAll('#task-table tbody tr'));
    const target = rows.find(tr => tr.children[1].textContent.includes('目標管理'));
    const secCell = target.children[6];
    const clickable = secCell.classList.contains('cell-sec');
    secCell.click();
    const btn = Array.from(document.querySelectorAll('#popover button'))
      .find(b => b.textContent === 'その他');
    const disabledCurrent = Array.from(document.querySelectorAll('#popover button'))
      .some(b => b.textContent === 'UL' && b.disabled);
    btn.click();
    const banner = document.getElementById('banner').textContent;
    const saveEnabled = !document.getElementById('btn-save').disabled;
    return s.save().then(res => ({
      clickable, disabledCurrent, banner, saveEnabled, res,
      adapter: s.getAdapterText(),
      successBanner: document.getElementById('banner').textContent,
    }));
  }, [F1, TODAY]));
  r.check('TB-S9（UI: クリックで移動・保存ボタン有効・保存で永続）',
    s9.result.clickable === true && s9.result.disabledCurrent === true
    && s9.result.banner === '「その他」の末尾へ移動しました（ファイルへは保存時に反映）'
    && s9.result.saveEnabled === true && s9.result.res.ok === true
    && s9.result.adapter === s1
    // 空セクションへの移動は空行が1行増えるので「追加1行」が正しい
    && s9.result.successBanner === '保存しました（変更0行・追加1行）',
    JSON.stringify([s9.result.clickable, s9.result.disabledCurrent, s9.result.banner,
      s9.result.saveEnabled, s9.result.adapter === s1, s9.result.successBanner]));

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

  // TB-S10: 子タスクの行と、セクションが1つだけのファイルではクリックできない
  const s10 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    window.taskboard.test.newSession(f1);
    const rows = Array.from(document.querySelectorAll('#task-table tbody tr'));
    const child = rows.find(tr => tr.children[1].textContent.includes('PRODUCTS_DETAIL'));
    const childClickable = child ? child.children[6].classList.contains('cell-sec') : null;
    // セクションが1つだけのファイル
    window.taskboard.test.newSession('# tasks\n\n## PEW\n\n- [ ] only\n');
    const single = Array.from(document.querySelectorAll('#task-table tbody tr'))[0];
    return { childClickable, singleClickable: single.children[6].classList.contains('cell-sec') };
  }, [F1, TODAY]);
  r.check('TB-S10（子タスクとセクション1つだけのファイルではクリック不可）',
    s10.childClickable === false && s10.singleClickable === false, JSON.stringify(s10));

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

  /* ========== TB-P1〜P18: 計画ビュー（🛫 とタイムライン・Phase T） ========== */

  /* --- エンジン: 🛫 のバイト保全とトークン順（TB-P1〜P8） --- */
  const p1 = await ops(F1, [{ type: 'setStart', line: 9, date: '2026-08-10' }]);
  r.check('TB-P1（🛫 追加: 行末へ挿入・他行はバイト不変）',
    lineOf(p1, 9) === '- [ ] 資料作成 #102 [[2026-07-07]] 🛫 2026-08-10' && onlyChanged(p1, F1, [9]),
    JSON.stringify(lineOf(p1, 9)));

  const p2 = await ops(F1, [{ type: 'setStart', line: 13, date: '2026-08-01' }]);
  r.check('TB-P2（📅 の直前へ挿入・⏫ は動かさない＝既存行の非標準順を矯正しない）',
    lineOf(p2, 13) === '- [ ] 資料Rv #144 [[2026-07-14_TODO]] [[2026-07-21]] 🛫 2026-08-01 📅 2026-08-05 ⏫'
    && onlyChanged(p2, F1, [13]), JSON.stringify(lineOf(p2, 13)));

  const p3 = await ops(F1, [
    { type: 'setStart', line: 9, date: '2026-08-10' },
    { type: 'setStart', line: 9, date: '2026-08-11' },
  ]);
  r.check('TB-P3（変更はインプレース置換・位置不変）',
    lineOf(p3, 9) === '- [ ] 資料作成 #102 [[2026-07-07]] 🛫 2026-08-11' && onlyChanged(p3, F1, [9]),
    JSON.stringify(lineOf(p3, 9)));

  const p4 = await ops(F1, [
    { type: 'setStart', line: 13, date: '2026-08-01' },
    { type: 'setStart', line: 13, date: null },
  ]);
  r.check('TB-P4（削除で F1 とバイト同一）', p4 === F1, JSON.stringify(lineOf(p4, 13)));

  const p5 = await ops(F1, [
    { type: 'setStart', line: 13, date: '2026-08-01' },
    { type: 'editContent', line: 13, text: '資料Rv 改' },
  ]);
  r.check('TB-P5（本文編集の再構成順が Tasks 標準: 本文→優先度→🛫→📅）',
    lineOf(p5, 13) === '- [ ] 資料Rv 改 ⏫ 🛫 2026-08-01 📅 2026-08-05' && onlyChanged(p5, F1, [13]),
    JSON.stringify(lineOf(p5, 13)));

  const p6 = await ops(F1, [
    { type: 'setStart', line: 9, date: '2026-08-10' },
    { type: 'setPriority', line: 9, value: 'high' },
  ]);
  r.check('TB-P6（優先度は 🛫 の前に入る）',
    lineOf(p6, 9) === '- [ ] 資料作成 #102 [[2026-07-07]] ⏫ 🛫 2026-08-10' && onlyChanged(p6, F1, [9]),
    JSON.stringify(lineOf(p6, 9)));

  // ⏳ は解析・表示しないが、挿入位置の目印としては尊重する
  const SCHED = '# tasks\n\n## PEW\n\n- [ ] 予定あり ⏳ 2026-08-09 📅 2026-08-20\n';
  const p7 = await ops(SCHED, [{ type: 'setStart', line: 5, date: '2026-08-01' }]);
  r.check('TB-P7（⏳ を持つ行では ⏳ の前へ挿入）',
    lineOf(p7, 5) === '- [ ] 予定あり 🛫 2026-08-01 ⏳ 2026-08-09 📅 2026-08-20',
    JSON.stringify(lineOf(p7, 5)));

  const PAT = '# tasks\n\n## PEW\n\n' +
    '- [ ] 開始のみ 🛫 2026-08-01\n- [ ] 期限のみ 📅 2026-08-02\n' +
    '- [ ] 両方 🛫 2026-08-03 📅 2026-08-09\n- [ ] なし\n';
  const p8 = await page.evaluate((t) => window.taskboard.test.parse(t).tasks
    .map(x => ({ body: x.body, start: x.start, due: x.due })), PAT);
  r.check('TB-P8（🛫のみ/📅のみ/両方/なし・body に絵文字が残らない）',
    eq(p8, [
      { body: '開始のみ', start: '2026-08-01', due: null },
      { body: '期限のみ', start: null, due: '2026-08-02' },
      { body: '両方', start: '2026-08-03', due: '2026-08-09' },
      { body: 'なし', start: null, due: null },
    ]), JSON.stringify(p8));

  /* --- タイムライン: モデルと DOM（TB-P9〜P14） --- */
  // 実経路で確かめる（絞り込み → visibleRows → timelineModel → 描画）
  const plan = (text, o) => page.evaluate(([t, opt]) => {
    window.taskboard.test.setToday(opt.today);
    const sortSel = document.getElementById('f-sort');
    sortSel.value = opt.sort || 'file';
    sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    const cb = document.getElementById('f-done');
    cb.checked = !!opt.showDone;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(t);
    s.setView(opt.view || 'timeline');
    const m = s.getTimeline();
    const note = document.getElementById('tl-note');
    return {
      model: m && {
        items: m.items.map(i => ({
          line: i.line, body: i.body, state: i.state, days: i.days,
          start: i.start, end: i.end, hasDue: i.hasDue, inverted: i.inverted,
        })),
        from: m.from, to: m.to, days: m.days, todayIn: m.todayIn,
        invalidCount: m.invalidCount, guard: m.guard,
      },
      note: note.hidden ? '' : note.textContent,
      noteWarn: note.className.includes('banner-warn'),
      bars: Array.from(document.querySelectorAll('.tl-bar')).map(b => ({
        cls: b.className, left: b.style.left, width: b.style.width, text: b.textContent,
      })),
      labels: Array.from(document.querySelectorAll('.tl-rows .tl-label')).map(x => x.textContent),
      ticks: document.querySelectorAll('.tl-tick').length,
      todayLine: document.querySelectorAll('.tl-today').length,
      todayLeft: (document.querySelector('.tl-today') || {}).style
        ? document.querySelector('.tl-today').style.left : null,
      tableHidden: document.getElementById('table-wrap').hidden,
      tlHidden: document.getElementById('timeline-view').hidden,
      tabActive: (document.querySelector('#view-tabs button.active') || {}).textContent,
      tabsHidden: document.getElementById('view-tabs').hidden,
      copyLabel: document.getElementById('btn-copy').textContent,
      planTsv: s.getPlanTsv(), listTsv: s.getListTsv(),
    };
  }, [text, Object.assign({ today: TODAY }, o)]);

  const p9on = await plan(F4, { showDone: true });
  const p9off = await plan(F4, { showDone: false });
  r.check('TB-P9（対象は 🛫 を持つ行だけ・絞り込みを反映）',
    eq(p9on.model.items.map(i => i.line), [5, 6, 7, 8, 9])     // 10行目（🛫 なし）は入らない
    && eq(p9off.model.items.map(i => i.line), [5, 6, 7, 9])    // 完了（8行目）が消える
    && p9on.tableHidden === true && p9on.tlHidden === false && p9on.tabActive === 'タイムライン',
    JSON.stringify([p9on.model.items.map(i => i.line), p9off.model.items.map(i => i.line)]));

  // 9行目（🛫 2026-08-06・📅 なし）は today=08-04 より後に始まるので planned が正しい
  r.check('TB-P10（遅延・進行中・予定・完了の4状態とバーのクラス）',
    eq(p9on.model.items.map(i => i.state), ['late', 'active', 'planned', 'done', 'planned'])
    && eq(p9on.bars.map(b => b.cls), [
      'tl-bar tl-bar-late', 'tl-bar tl-bar-active', 'tl-bar tl-bar-planned',
      'tl-bar tl-bar-done', 'tl-bar tl-bar-planned']),
    JSON.stringify([p9on.model.items.map(i => i.state), p9on.bars.map(b => b.cls)]));

  const p11far = await plan(F4, { showDone: true, today: '2027-01-01' });
  r.check('TB-P11（表示範囲は min🛫−3〜max(end)+3・遠い today は含めない）',
    p9on.model.from === '2026-07-17' && p9on.model.to === '2026-09-03'
    && p9on.model.days === 49 && p9on.model.todayIn === true && p9on.todayLine === 1
    && p11far.model.from === '2026-07-17' && p11far.model.to === '2026-09-03'
    && p11far.model.todayIn === false && p11far.todayLine === 0
    && p11far.note === '今日（2027-01-01）は表示範囲外です',
    JSON.stringify([p9on.model.from, p9on.model.to, p9on.model.days, p11far.model.todayIn, p11far.note]));

  const p12late = p9on.model.items[0];      // 07-28 〜 08-01
  const p12only = p9on.model.items[4];      // 🛫 のみ（📅 なし）
  r.check('TB-P12（日数は両端含む・📅 なしは days=null の1日バー）',
    p12late.days === 5 && p9on.bars[0].width === (5 * 16) + 'px' && p9on.bars[0].text === '5日'
    && p12only.days === null && p12only.end === p12only.start
    && p9on.bars[4].width === '16px' && p9on.bars[4].text === '',
    JSON.stringify([p12late.days, p9on.bars[0].width, p12only.days, p9on.bars[4].width]));

  const INV = '# tasks\n\n## PEW\n\n- [ ] 逆転 🛫 2026-08-10 📅 2026-08-01\n';
  const p13 = await plan(INV, { showDone: true });
  r.check('TB-P13（📅 < 🛫 は1日バーに丸めて件数を警告する）',
    p13.model.invalidCount === 1 && p13.model.items[0].hasDue === false
    && p13.model.items[0].end === '2026-08-10' && p13.bars.length === 1
    && p13.bars[0].width === '16px' && p13.noteWarn === true
    && p13.note.includes('1件のタスクで期限が開始日より前です'),
    JSON.stringify([p13.model.invalidCount, p13.bars[0].width, p13.note]));

  // 性能ガード: 超過時は「一部のみ表示」ではなく理由を出し、コピーも拒否する
  const manyRows = ['# tasks', '', '## PEW', ''];
  for (let i = 1; i <= 201; i++) manyRows.push('- [ ] r' + i + ' 🛫 2026-08-01 📅 2026-08-05');
  const p14rows = await plan(manyRows.join('\n') + '\n', { showDone: true });
  const p14days = await plan('# tasks\n\n## PEW\n\n- [ ] 古 🛫 2026-01-01 📅 2026-01-02\n' +
    '- [ ] 新 🛫 2027-06-01 📅 2027-06-02\n', { showDone: true });
  const p14copy = await page.evaluate(() => {
    const captured = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (t) => { captured.push(t); return Promise.resolve(); } },
    });
    document.getElementById('btn-copy').click();   // ガード中（p14days のまま）
    return { captured, label: document.getElementById('btn-copy').textContent };
  });
  r.check('TB-P14（行数/日数の上限超過で描画せず理由を出す・コピーも拒否）',
    p14rows.model.guard && p14rows.model.guard.reason === 'rows' && p14rows.bars.length === 0
    && p14rows.note.includes('対象が201件（上限200件）') && p14rows.noteWarn === true
    && p14days.model.guard && p14days.model.guard.reason === 'days' && p14days.bars.length === 0
    && p14days.note.includes('表示期間が524日（上限400日）')
    && p14copy.captured.length === 0 && p14copy.label === '表示していないためコピーできません',
    JSON.stringify([p14rows.model.guard, p14days.model.guard, p14rows.bars.length,
      p14days.note, p14copy.captured.length, p14copy.label]));

  /* --- 0件案内・バー操作・TSV（TB-P16〜P18） --- */
  const p16 = await plan(F1, { showDone: true });
  const p16filtered = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const sec = document.getElementById('f-section');
    sec.value = 'UL';
    sec.dispatchEvent(new Event('change', { bubbles: true }));
    const note = document.getElementById('tl-note');
    const out = { note: note.textContent, tabs: !document.getElementById('view-tabs').hidden };
    sec.value = '';
    sec.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  }, [F1, TODAY]);
  r.check('TB-P16（🛫 が0件のときの案内と設定導線・リストへ戻れる）',
    p16.model.items.length === 0 && p16.bars.length === 0
    && p16.note === '開始日（🛫）を設定したタスクがここに並びます — リストビューの開始日セルをクリックして設定できます'
    && p16.tabsHidden === false
    && p16filtered.note.includes('絞り込みで隠れている行があるかもしれません')
    && p16filtered.tabs === true,
    JSON.stringify([p16.model.items.length, p16.note, p16filtered.note]));

  const p17 = await page.evaluate(([f4, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f4);
    s.setView('timeline');
    // 変更ごとに再描画されるので、バーと入力は都度取り直す
    const setField = (field, value) => {
      document.querySelector('.tl-row[data-line="6"] .tl-bar').click();
      const inputs = Array.from(document.querySelectorAll('#popover input[type="date"]'));
      const target = inputs.find(i => i.dataset.field === field);
      target.value = value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return inputs.length;
    };
    const inputs = setField('start', '2026-08-02');
    setField('due', '2026-08-12');
    return s.save().then(res => ({ inputs, ok: res.ok, adapter: s.getAdapterText() }));
  }, [F4, TODAY]);
  r.check('TB-P17（バー click → 計画ポップオーバーで 🛫/📅 を変更 → 保存で永続）',
    p17.inputs === 2 && p17.ok === true
    && lineOf(p17.adapter, 6) === '- [ ] 基本設計レビュー 🛫 2026-08-02 📅 2026-08-12 ⏫'
    && onlyChanged(p17.adapter, F4, [6]),
    JSON.stringify([p17.inputs, lineOf(p17.adapter, 6)]));

  const p18 = await page.evaluate(([f4, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const captured = [];
    // 実クリップボードを壊さないためスタブする
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (t) => { captured.push(t); return Promise.resolve(); } },
    });
    const s = window.taskboard.test.newSession(f4);
    const btn = document.getElementById('btn-copy');
    // 直前のテストのコピー結果表示（.copied）が残っている間はラベルを上書きしない仕様なので、
    // 復帰を待ってからラベルを読む
    const waitClear = () => new Promise(res => {
      const t = setInterval(() => {
        if (!btn.classList.contains('copied')) { clearInterval(t); res(); }
      }, 40);
    });
    return waitClear().then(() => {
      s.setView('list');
      const listLabel = btn.textContent;
      const listTitle = btn.title;
      s.setView('timeline');
      const planLabel = btn.textContent;
      const planTitle = btn.title;
      s.setView('list');
      btn.click();
      return new Promise(res => setTimeout(() => {
        s.setView('timeline');
        btn.click();
        setTimeout(() => res({ captured, listLabel, planLabel, listTitle, planTitle }), 30);
      }, 30));
    });
  }, [F4, TODAY]);
  const listHead = p18.captured[0].split('\n')[0];
  const planLines = p18.captured[1].split('\n');
  r.check('TB-P18（Excel 用コピー: ビューごとの列・状態・空欄の日数・ラベルと title）',
    p18.listLabel === 'Excel用コピー' && p18.planLabel === '計画をコピー'
    && p18.listTitle.includes('状態・内容・開始日・期限・優先度・タグ・セクション')
    && p18.planTitle.includes('内容・開始日・期限・日数・状態・セクション')
    && listHead === '状態\t内容\t開始日\t期限\t優先度\tタグ\tセクション'
    && p18.captured[0].split('\n')[1] === '未\t外部IF定義書作成\t2026-07-28\t2026-08-01\t\t\tPEW'
    && planLines[0] === '内容\t開始日\t期限\t日数\t状態\tセクション'
    && planLines[1] === '外部IF定義書作成\t2026-07-28\t2026-08-01\t5\t遅延\tPEW'
    && planLines[4] === '要件ヒアリング\t2026-07-20\t2026-07-24\t5\t済\tPEW'
    && planLines[5] === '開始日のみ設定\t2026-08-06\t\t\t未\tPEW'   // 📅 なしは日数も空欄
    && planLines.length === 6,
    JSON.stringify([p18.listLabel, p18.planLabel, listHead, planLines]));

  // TB-P15: ビューの永続化。別タブで開くと localStorage 経由で復元される（同一オリジン）
  const p15page = r.watch(await context.newPage());
  await p15page.goto(fileUrl('web/taskboard.html'));
  const p15restored = await p15page.evaluate((f4) => {
    window.taskboard.test.newSession(f4);
    return {
      tlHidden: document.getElementById('timeline-view').hidden,
      tabActive: (document.querySelector('#view-tabs button.active') || {}).textContent,
    };
  }, F4);
  await p15page.evaluate(() => {
    // ToolStorage は {v:1, tool, savedAt, data} エンベロープ。中身は data の下にある
    const env = JSON.parse(localStorage.getItem('tools:taskboard'));
    env.data.view = 'gantt';       // 未知値（TB-Q17）
    env.data.sort = 'nonsense';
    localStorage.setItem('tools:taskboard', JSON.stringify(env));
  });
  await p15page.reload();
  const p15unknown = await p15page.evaluate((f4) => {
    window.taskboard.test.newSession(f4);
    return {
      tlHidden: document.getElementById('timeline-view').hidden,
      tabActive: (document.querySelector('#view-tabs button.active') || {}).textContent,
      sortValue: document.getElementById('f-sort').value,
    };
  }, F4);
  await p15page.close();
  r.check('TB-P15（ビューの永続化・未知値はリスト/ファイル順に落とす）',
    p15restored.tlHidden === false && p15restored.tabActive === 'タイムライン'
    && p15unknown.tlHidden === true && p15unknown.tabActive === 'リスト'
    && p15unknown.sortValue === 'file',
    JSON.stringify([p15restored, p15unknown]));

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
    // メモを編集して Cmd+Enter で確定
    rowOf('親A').querySelectorAll('.btn-child')[1].click();
    const ta = document.getElementById('memo-input');
    const before = ta.value;
    ta.value = 'メモ1行目\n差し替え2';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    return s.save().then(res => ({
      markText, expanded, before, res, adapter: s.getAdapterText(),
      collapsedAfter: document.querySelectorAll('tr.memo-row').length,
    }));
  }, [F5, TODAY]));
  r.check('TB-M11（📝2 マーカー・展開・Cmd+Enter で編集確定・保存で永続）',
    m11.result.markText === '📝2' && m11.result.expanded === 'メモ1行目\nメモ2行目'
    && m11.result.before === 'メモ1行目\nメモ2行目'
    && m11.result.res.ok === true
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
    && m13.result.grow.badge === '保存（2）'
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
      .filter(tr => !tr.classList.contains('memo-row'))
      .map(tr => Number(tr.dataset.line));
  }, [text, TODAY, sort]);
  const c1b = await listOrder(c1done, 'file');
  r.check('TB-C1（完了グループは最下部・未完了の子孫を持つ完了親は上に残る）',
    eq(c1b, [10, 11, 12, 13, 17, 9]), JSON.stringify(c1b));

  const c2 = {};
  for (const s of ['due', 'priority', 'start']) c2[s] = await listOrder(c1done, s);
  r.check('TB-C2（どのソートでも完了は最下部＝第1キー）',
    ['due', 'priority', 'start'].every(s => c2[s][c2[s].length - 1] === 9)
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

  /* ========== TB-D1〜D3・TB-W1: 追加フォームの既定値と幅 ========== */
  const d1 = await page.evaluate(([f1, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    document.getElementById('add-content').value = '既定値テスト';
    document.getElementById('add-section').value = 'UL';
    document.getElementById('add-start').value = '2026-08-10';
    document.getElementById('add-due').value = '2026-08-20';
    document.getElementById('add-pri').value = 'high';
    document.getElementById('btn-add').click();
    return { saved: JSON.parse(localStorage.getItem('tools:taskboard')).data.add, text: s.getText() };
  }, [F1, TODAY]);
  const d1page = r.watch(await context.newPage());
  await d1page.goto(fileUrl('web/taskboard.html'));
  const d1restored = await d1page.evaluate(f1 => {
    window.taskboard.test.newSession(f1);
    document.getElementById('btn-add-form').click();   // 幅を測るためフォームを開く
    return {
      section: document.getElementById('add-section').value,
      start: document.getElementById('add-start').value,
      due: document.getElementById('add-due').value,
      pri: document.getElementById('add-pri').value,
      width: document.getElementById('add-content').getBoundingClientRect().width,
    };
  }, F1);
  r.check('TB-D1（開始日・期限・優先度・セクションが前回値で復元される）',
    eq(d1.saved, { section: 'UL', start: '2026-08-10', due: '2026-08-20', priority: 'high' })
    && d1restored.section === 'UL' && d1restored.start === '2026-08-10'
    && d1restored.due === '2026-08-20' && d1restored.pri === 'high',
    JSON.stringify([d1.saved, d1restored]));
  r.check('TB-W1（内容欄の幅が 320px 以上）', d1restored.width >= 320, String(d1restored.width));

  const d2 = await d1page.evaluate(f1 => {
    const s = window.taskboard.test.newSession(f1);
    document.getElementById('add-content').value = 'クリア記憶';
    document.getElementById('add-due').value = '';       // 期限をクリアして追加
    document.getElementById('btn-add').click();
    return JSON.parse(localStorage.getItem('tools:taskboard')).data.add;
  }, F1);
  await d1page.reload();
  const d2restored = await d1page.evaluate(f1 => {
    window.taskboard.test.newSession(f1);
    return document.getElementById('add-due').value;
  }, F1);
  r.check('TB-D2（クリアしたことも記憶する）', d2.due === '' && d2restored === '',
    JSON.stringify([d2, d2restored]));

  const d3 = await d1page.evaluate(() => {
    // 記憶したセクション（UL）が無いファイル
    window.taskboard.test.newSession('# tasks\n\n## PEW\n\n- [ ] only\n');
    return document.getElementById('add-section').value;
  });
  await d1page.close();
  r.check('TB-D3（記憶したセクションが無ければ先頭セクションへフォールバック）',
    d3 === 'PEW', JSON.stringify(d3));

  // TB-P19: sticky ラベルが横スクロールで実際に固定されるかを実測する
  // （excel2md で border-collapse が sticky セルの枠線を落とした前例があるので CSS を信用しない）
  await page.setViewportSize({ width: 900, height: 700 });   // 図が確実にはみ出す幅
  await plan(F4, { showDone: true });
  const p19 = await page.evaluate(() => {
    const scroll = document.getElementById('tl-scroll');
    const label = document.querySelector('.tl-rows .tl-label');
    const bar = document.querySelector('.tl-rows .tl-bar');
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

  if (SHOTS) {
    await page.waitForTimeout(1700);   // 直前のコピー結果表示（✓）が消えるのを待つ
    await plan(F4, { showDone: true, view: 'list' });
    await page.screenshot({ path: shotPath('taskboard-list.png'), fullPage: true });
    // 計画ビュー: 遅延・進行中・予定・完了と今日の縦線が見える
    await plan(F4, { showDone: true });
    await page.screenshot({ path: shotPath('taskboard-timeline.png'), fullPage: true });
    // ダークモードでバーの色分けが読めるか（CSS 変数だけで組んでいることの確認）
    const dark = r.watch(await browser.newPage({ colorScheme: 'dark', viewport: { width: 1280, height: 900 } }));
    await dark.goto(fileUrl('web/taskboard.html'));
    await dark.evaluate(([f4, today]) => {
      window.taskboard.test.setToday(today);
      const cb = document.getElementById('f-done');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      window.taskboard.test.newSession(f4).setView('timeline');
    }, [F4, TODAY]);
    await dark.screenshot({ path: shotPath('taskboard-timeline-dark.png'), fullPage: true });
    await dark.close();
  }

  await browser.close();
  r.report('taskboard（docs/specs/taskboard.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
