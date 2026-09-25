'use strict';
/* test/taskboard/timeline-model.js — 節: 計画ビュー: 🛫 のバイト保全・タイムラインのモデルと DOM・0件案内・バー操作・TSV
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js timeline-model）
   照合する ID: TB-P1〜P18。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'timeline-model',
  ids: 'TB-P1〜P18',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
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
  // 種別の検査は helpers の bannerIs（class だけでなく role と算出背景色まで見る）
  const b13 = await bannerIs(page, '#tl-note', 'warn');
  r.check('TB-P13（📅 < 🛫 は1日バーに丸めて件数を警告する）',
    p13.model.invalidCount === 1 && p13.model.items[0].hasDue === false
    && p13.model.items[0].end === '2026-08-10' && p13.bars.length === 1
    && p13.bars[0].width === '16px' && b13.ok
    && p13.note.includes('1件のタスクで期限が開始日より前です'),
    JSON.stringify([p13.model.invalidCount, p13.bars[0].width, p13.note, b13.detail]));

  // 性能ガード: 超過時は「一部のみ表示」ではなく理由を出し、コピーも拒否する
  const manyRows = ['# tasks', '', '## PEW', ''];
  for (let i = 1; i <= 201; i++) manyRows.push('- [ ] r' + i + ' 🛫 2026-08-01 📅 2026-08-05');
  const p14rows = await plan(manyRows.join('\n') + '\n', { showDone: true });
  const b14 = await bannerIs(page, '#tl-note', 'warn');   // 次の plan が上書きする前に測る
  // ガードは**描画ピクセル幅**で判定する（Phase T4・TB-Q50）。
  // 日ズームで上限 20,000px に届くのは約1,250日なので、1,308日離れた2行で発動させる
  const FAR = '# tasks\n\n## PEW\n\n- [ ] 古 🛫 2026-01-01 📅 2026-01-02\n' +
    '- [ ] 新 🛫 2029-08-01 📅 2029-08-02\n';
  const p14days = await plan(FAR, { showDone: true });
  const p14copy = await page.evaluate(() => {
    const captured = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (t) => { captured.push(t); return Promise.resolve(); } },
    });
    document.getElementById('btn-copy').click();   // ガード中（p14days のまま）
    return { captured, label: document.getElementById('btn-copy').textContent };
  });
  r.check('TB-P14（行数/描画幅の上限超過で描画せず理由を出す・コピーも拒否）',
    p14rows.model.guard && p14rows.model.guard.reason === 'rows' && p14rows.bars.length === 0
    && p14rows.note.includes('対象が201件（上限200件）') && b14.ok
    && p14days.model.guard && p14days.model.guard.reason === 'px' && p14days.bars.length === 0
    && p14days.note.includes('表示期間が長すぎて') && p14days.note.includes('ズーム: 日')
    && p14days.note.includes('ズームを「月」に')     // 対処を案内する
    && p14copy.captured.length === 0 && p14copy.label === '表示していないためコピーできません',
    JSON.stringify([p14rows.model.guard, p14days.model.guard, p14rows.bars.length,
      p14days.note, p14copy.captured.length, p14copy.label]));

  // Phase T4 の意図した挙動変更: 日数上限（400日）を捨てたので、524日は描画される。
  // 1,308日でもズームを月にすれば描画できる（＝ズームがガードの回避手段になる）
  const p14mid = await plan('# tasks\n\n## PEW\n\n- [ ] 古 🛫 2026-01-01 📅 2026-01-02\n' +
    '- [ ] 新 🛫 2027-06-01 📅 2027-06-02\n', { showDone: true });
  const p14month = await plan(FAR, { showDone: true, zoom: 'month' });
  r.check('TB-P14b（524日は日ズームでも描画される・1308日は月ズームなら描画される）',
    p14mid.model.guard === null && p14mid.bars.length === 2 && p14mid.model.days === 524
    && p14month.model.guard === null && p14month.bars.length === 2
    && p14month.model.dayPx === 1.6,
    JSON.stringify([p14mid.model.days, p14mid.model.guard, p14month.model.guard,
      p14month.bars.length]));

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

  },
};
