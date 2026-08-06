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
    // モーダルは開かない: オーバーレイ（inset:0）が表のクリックを遮るため、
    // 必要なテストだけが addModal()/closeModal() で開閉する（TB-Q26 で1行フォームを廃止）
    if (!document.getElementById('modal').hidden) {
      document.getElementById('modal-content').value = '';   // 破棄確認を出さずに閉じる
      document.getElementById('modal-memo').value = '';
      document.getElementById('modal-cancel').click();
    }
  }, [text, TODAY]);
  const addModal = () => page.evaluate(() => {
    if (document.getElementById('modal').hidden) document.getElementById('btn-add-form').click();
  });
  const shutModal = () => page.evaluate(() => {
    const m = document.getElementById('modal');
    if (!m.hidden) { document.getElementById('modal-content').value = ''; document.getElementById('modal-memo').value = ''; document.getElementById('modal-cancel').click(); }
  });

  const ui = () => page.evaluate(() => ({
    rows: document.querySelectorAll('#task-table tbody tr').length,
    bodies: Array.from(document.querySelectorAll('#task-table tbody tr')).map(tr => tr.children[1].textContent),
    addedRows: document.querySelectorAll('#task-table tbody tr.row-added').length,
    undoBtns: document.querySelectorAll('.btn-undo').length,
    undoDisabled: Array.from(document.querySelectorAll('.btn-undo')).map(b => b.disabled),
    undoTitles: Array.from(document.querySelectorAll('.btn-undo')).map(b => b.title),
    input: document.getElementById('modal-content').value,
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

  await shutModal();   // 以降は表を操作するのでオーバーレイを閉じておく

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
    // セクションセル → UL
    rowOf('資料作成').querySelector('.cell-sec').click();
    Array.from(document.querySelectorAll('#popover button')).find(b => b.textContent === 'UL').click();
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
  const installHelpers = (pg) => pg.evaluate(() => {
    window.__h = {
      openEdit: (body, memoRow) => {
        const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
          .find(x => x.children[1] && x.children[1].textContent.includes(body));
        if (memoRow) tr.nextSibling.querySelector('td').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        else Array.from(tr.querySelectorAll('.btn-child')).find(x => x.textContent === '編集').click();
      },
      set: (id, v) => { document.getElementById(id).value = v; },
      chips: (hostId) => Array.from(document.querySelectorAll('#' + hostId + ' .chip'))
        .map(c => c.textContent.replace('✕', '')),
      // 前回値（タグ・日付・優先度）は仕様どおり新規モーダルに引き継がれるので、
      // 生成行を厳密に照合するテストでは先に全欄を空にする
      resetModalFields: () => {
        for (const id of ['modal-content', 'modal-memo', 'modal-start', 'modal-due', 'modal-pri']) {
          document.getElementById(id).value = '';
        }
        for (const b of document.querySelectorAll('#modal-tag-list .chip-del')) b.click();
        for (const b of document.querySelectorAll('#modal-link-list .chip-del')) b.click();
      },
    };
  });
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
    const last = rows[rows.length - 1];
    window.scrollTo(0, document.documentElement.scrollHeight);
    last.querySelector('.cell-due').click();            // 最下行 → 下端
    const pop = document.getElementById('popover');
    const a = pop.getBoundingClientRect();
    const bottomOk = a.bottom <= document.documentElement.clientHeight && a.top >= 0;
    // 右端のセル（関連ノート列の隣の操作列）を基準に開く
    last.querySelector('.cell-sec').click();
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
  r.check('TB-X17（列見出しが「関連ノート」・列順は不変）',
    eq(x17, ['', '内容', '開始日', '期限', '優先度', 'タグ', 'セクション', '関連ノート', '']),
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

  /* ========== TB-B1〜B11: ボードビュー（Phase S） ========== */
  const F6 = [
    '# tasks', '', '## PEW', '',
    '- [ ] 外部IF定義書作成 #PEW [[2026-07-21]] 📅 2026-08-15 ⏫',   //  5
    '\t- 仕様書のレビュー待ち',                                        //  6 メモ
    '\t- [ ] PRODUCTS の項目定義',                                     //  7 子
    '- [x] 要件ヒアリング ✅ 2026-08-01',                              //  8 完了
    '', '## UL', '',
    '- [ ] 目標管理について考える #UL業務 🔽',                         // 12
    '', '## その他', '', '',
  ].join('\n');

  const boardOf = (text, opts) => page.evaluate(([t, today, o]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = !!o.showDone;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.__sBoard = window.taskboard.test.newSession(t);
    s.setView('board');
    return {
      cols: Array.from(document.querySelectorAll('.board-col')).map(c => ({
        sec: c.dataset.section,
        title: c.querySelector('.board-col-title').textContent,
        cards: Array.from(c.querySelectorAll('.board-card')).map(x => ({
          line: Number(x.dataset.line),
          body: x.querySelector('.card-body').textContent,
          drag: x.draggable === true,
          done: x.classList.contains('card-done'),
          tabIndex: x.tabIndex,
          meta: (x.querySelector('.card-meta') || {}).textContent || '',
        })),
      })),
      note: document.getElementById('board-note').hidden ? '' : document.getElementById('board-note').textContent,
      tabs: Array.from(document.querySelectorAll('#view-tabs button')).map(b => b.textContent),
      // textContent は直前のコピー結果表示（.copied）が残ることがあるので、
      // updateCopyButton が常に更新する dataset.label を見る
      copyLabel: document.getElementById('btn-copy').dataset.label,
      tableHidden: document.getElementById('table-wrap').hidden,
    };
  }, [text, TODAY, Object.assign({ showDone: false }, opts)]);

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
  const searchIn = (view, q, composing) => page.evaluate(async ([v, s, comp]) => {
    const inp = document.getElementById('f-q');
    inp.value = s;
    const e = new InputEvent('input', { bubbles: true });
    if (comp) Object.defineProperty(e, 'isComposing', { get: () => true });
    inp.dispatchEvent(e);
    await new Promise(d => setTimeout(d, 350));
    const rows = v === 'board'
      ? Array.from(document.querySelectorAll('.board-card')).map(x => Number(x.dataset.line))
      : Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)')).map(tr => Number(tr.dataset.line));
    return {
      rows, count: document.getElementById('q-count').textContent,
      hits: document.querySelectorAll('.hit').length,
      empty: document.getElementById('empty-msg').hidden ? '' : document.getElementById('empty-msg').textContent,
      tlNote: document.getElementById('tl-note').hidden ? '' : document.getElementById('tl-note').textContent,
      boardNote: document.getElementById('board-note').hidden ? '' : document.getElementById('board-note').textContent,
    };
  }, [view, q, !!composing]);

  const setView = (v) => page.evaluate(([text, today, view]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    window.__sF = window.taskboard.test.newSession(text);
    window.__sF.setView(view);
  }, [F6, TODAY, v]);

  await setView('list');
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

  /* ========== TB-S20〜S36: ステータス（Phase T2 の3値 ＋ Phase T3 の保留・中止） ========== */
  // F7 の9行目は Phase T3 から「中止（CANCELLED）」。真の不明・保留は F9 で見る
  const F7 = [
    '# tasks', '', '## PEW', '',
    '- [ ] 未着手のタスク',                 //  5
    '- [/] 着手中のタスク 📅 2026-08-05 ⏫', //  6
    '- [x] 完了のタスク ✅ 2026-08-01',      //  7
    '- [X] 大文字の完了',                    //  8
    '- [-] 中止のタスク',                    //  9
    '', '## UL', '',
    '- [ ] UL のタスク 🔽',                  // 13
    '', '',
  ].join('\n');

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

  const s31 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    s.setView('list');
    return Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)'))
      .map(tr => Number(tr.dataset.line));
  }, [F7, TODAY]);
  r.check('TB-S31（終了下部ソート: 着手中は下がらない・完了と中止が最下部）',
    eq(s31, [5, 6, 13, 7, 8, 9]), JSON.stringify(s31));

  const s32 = await page.evaluate(([f7, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(f7);
    s.setView('list');
    return Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)'))
      .map(tr => Number(tr.dataset.line));
  }, [F7, TODAY]);
  r.check('TB-S32（「完了・中止を含む」OFF: 着手中は残り、完了と中止が消える）',
    eq(s32, [5, 6, 13]), JSON.stringify(s32));

  // TB-S33: 一括完了の確認に着手中→完了も数える（5件で確認が出る）
  const F8 = ['# tasks', '', '## PEW', '',
    '- [ ] a', '- [/] b', '- [ ] c', '- [/] d', '- [ ] e', ''].join('\n');
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
  const F9 = [
    '# tasks', '', '## PEW', '',
    '- [h] 保留のタスク 📅 2026-08-01',   //  5（期限切れ＝保留でも色は付く）
    '- [!] 本当に未知の記号',              //  6
    '- [ ] 未着手のタスク',                //  7
    '', '',
  ].join('\n');

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
      lines: Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)'))
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
