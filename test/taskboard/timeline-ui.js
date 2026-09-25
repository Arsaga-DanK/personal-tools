'use strict';
/* test/taskboard/timeline-ui.js — 節: タイムライン: バーのドラッグ・吹き出し・矢印・ズーム・目盛り・セクション区切りと完了率・Draw Gantt への受け渡し
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js timeline-ui）
   照合する ID: TB-P20〜P45・R10〜R12・H1。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'timeline-ui',
  ids: 'TB-P20〜P45・R10〜R12・H1',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-P20〜P32: バーのドラッグ・ズーム・セクション・完了率（Phase T4） ==========
     ドラッグは pointer events なので **実マウス（page.mouse）で動かす**。
     判定は保存後のファイル内容（イベントが飛んだかでは見ない）。 */

  // F10: 期間5日（80px）・子3件（1完了・1中止）・📅 なしの1日バー・別セクション

  // F11: ズーム検査用。**範囲を 163日以上に伸ばす**（Phase T5 で、図がラベル列より
  // 細くなるズームは選べなくなったため。F10 は範囲18日で週・月が選べない）。
  // 5日バー・1日バー・2日バーは F10 と同じなので、幅とハンドルの期待値は変わらない

  // バーを掴んで dx ピクセル動かす。where: 'center' | 'left' | 'right'
  const dragBar = async (lineNo, dx, where, opts) => {
    const bar = page.locator('.tl-bar[data-line="' + lineNo + '"]');
    const box = await bar.boundingBox();
    const y = box.y + box.height / 2;
    // 中央を掴むときは端ハンドル（左右7px）を避ける。狭いバーでは中央が右ハンドルに入る
    const x = where === 'left' ? box.x + 3
      : (where === 'right' ? box.x + box.width - 3
        : (box.width < 21 ? box.x + 3 : box.x + box.width / 2));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 6 });
    if (opts && opts.escape) await page.keyboard.press('Escape');
    await page.mouse.up();
    return page.evaluate(() => window.__sT.getText());
  };

  await tl(F10);
  const p20 = await dragBar(5, 48, 'center');          // +3日
  r.check('TB-P20（バー全体のドラッグで 🛫 と 📅 が同じ日数ずれる・他行はバイト不変）',
    lineOf(p20, 5) === '- [ ] 期間タスク 🛫 2026-08-04 📅 2026-08-08'
    && onlyChanged(p20, F10, [5]), JSON.stringify(lineOf(p20, 5)));

  await tl(F10);
  const p21 = await dragBar(5, 32, 'left');            // 左端 +2日
  r.check('TB-P21（左端のドラッグは開始日だけ変える）',
    lineOf(p21, 5) === '- [ ] 期間タスク 🛫 2026-08-03 📅 2026-08-05'
    && onlyChanged(p21, F10, [5]), JSON.stringify(lineOf(p21, 5)));

  await tl(F10);
  const p22 = await dragBar(5, 32, 'right');           // 右端 +2日
  r.check('TB-P22（右端のドラッグは期限だけ変える）',
    lineOf(p22, 5) === '- [ ] 期間タスク 🛫 2026-08-01 📅 2026-08-07'
    && onlyChanged(p22, F10, [5]), JSON.stringify(lineOf(p22, 5)));

  await tl(F10);
  const p23a = await dragBar(5, 7, 'center');           // 7px = 0.44日 → 0日（変化なし）
  await tl(F10);
  const p23b = await dragBar(5, 9, 'center');           // 9px = 0.56日 → 1日
  r.check('TB-P23（1日単位にスナップする・半日未満は動かない）',
    p23a === F10 && lineOf(p23b, 5) === '- [ ] 期間タスク 🛫 2026-08-02 📅 2026-08-06',
    JSON.stringify([p23a === F10, lineOf(p23b, 5)]));

  await tl(F10);
  const p24 = await dragBar(5, 48, 'center', { escape: true });
  const p24pop = await page.evaluate(() => document.getElementById('popover').hidden);
  r.check('TB-P24（Escape でドラッグを取り消す・op を出さない・ポップオーバーも開かない）',
    p24 === F10 && p24pop === true, JSON.stringify([p24 === F10, p24pop]));

  await tl(F10);
  const p25a = await dragBar(5, 200, 'left');          // 左端を期限より右へ
  await tl(F10);
  const p25b = await dragBar(5, -200, 'right');        // 右端を開始日より左へ
  r.check('TB-P25（逆転する方向はクランプされる＝📅 < 🛫 を作れない）',
    lineOf(p25a, 5) === '- [ ] 期間タスク 🛫 2026-08-05 📅 2026-08-05'
    && lineOf(p25b, 5) === '- [ ] 期間タスク 🛫 2026-08-01 📅 2026-08-01',
    JSON.stringify([lineOf(p25a, 5), lineOf(p25b, 5)]));

  await tl(F10);
  await dragBar(5, 48, 'center');
  const p26drag = await page.evaluate(() => document.getElementById('popover').hidden);
  await tl(F10);
  await page.locator('.tl-bar[data-line="5"]').click();
  const p26click = await page.evaluate(() => ({
    hidden: document.getElementById('popover').hidden,
    dates: Array.from(document.querySelectorAll('#popover input[type="date"]')).map(i => i.value),
  }));
  r.check('TB-P26（ドラッグ後は計画ポップオーバーが開かない・移動0のクリックでは開く）',
    p26drag === true && p26click.hidden === false
    && eq(p26click.dates, ['2026-08-01', '2026-08-05']),
    JSON.stringify([p26drag, p26click]));

  await tl(F10);
  const p27 = await page.evaluate(() => {
    const bar = document.querySelector('.tl-bar[data-line="5"]');
    bar.focus();
    const key = (k, shift) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown',
      { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
    key('ArrowRight');
    const moved = window.__sT.getText().split('\n')[4];
    key('ArrowRight', true);
    const stretched = window.__sT.getText().split('\n')[4];
    // フォーカスがバーに戻っているか（render で作り直されるため）
    return { moved, stretched, focused: document.activeElement.className,
      line: document.activeElement.dataset.line };
  });
  r.check('TB-P27（キーボード: →で平行移動・Shift+→で期限のみ伸縮・フォーカスが戻る）',
    p27.moved === '- [ ] 期間タスク 🛫 2026-08-02 📅 2026-08-06'
    && p27.stretched === '- [ ] 期間タスク 🛫 2026-08-02 📅 2026-08-07'
    && p27.focused.includes('tl-bar') && p27.line === '5',
    JSON.stringify(p27));

  await tl(F10);
  const p28move = await dragBar(9, 32, 'center');      // 📅 なしの1日バーを平行移動
  await tl(F10);
  const p28due = await dragBar(9, 48, 'right');        // 右端で 📅 を新設（TB-Q46）
  r.check('TB-P28（📅 なしのバー: 平行移動は 🛫 のみ・右端のドラッグで 📅 を新設する）',
    lineOf(p28move, 9) === '- [ ] 開始のみ 🛫 2026-08-12'
    && onlyChanged(p28move, F10, [9])
    && lineOf(p28due, 9) === '- [ ] 開始のみ 🛫 2026-08-10 📅 2026-08-13'
    && onlyChanged(p28due, F10, [9]),
    JSON.stringify([lineOf(p28move, 9), lineOf(p28due, 9)]));

  // TB-Q45 の条件: 端ハンドルは中央を掴む余地が残る幅のときだけ出す。
  // **F11（範囲195日）で見る** — F10 は範囲が短く週・月が選べない（Phase T5）
  await tl(F11);
  const p29 = await page.evaluate(() => {
    const out = {};
    for (const z of ['day', 'week', 'month']) {
      const sel = document.getElementById('f-zoom');
      sel.value = z; sel.dispatchEvent(new Event('change', { bubbles: true }));
      out[z] = Array.from(document.querySelectorAll('.tl-bar')).map(b => ({
        line: b.dataset.line, w: Math.round(parseFloat(b.style.width)),
        handles: b.querySelectorAll('.tl-handle').length,
        edges: Array.from(b.querySelectorAll('.tl-handle')).map(h => h.dataset.edge).join(','),
      }));
    }
    return out;
  });
  r.check('TB-P29（幅が足りないバーは端ハンドルを出さない: 週=20px は両端、月=8px はゼロ）',
    // 日: 5日=80px → 両端 / 1日=16px → 右だけ（📅 を新設できる）/ 2日=32px → 両端
    eq(p29.day.map(b => b.w), [80, 16, 32, 80]) && eq(p29.day.map(b => b.handles), [2, 1, 2, 2])
    && eq(p29.day.map(b => b.edges), ['start,due', 'due', 'start,due', 'start,due'])
    // 週: 5日=20px（21px 未満）→ ゼロ / 1日=4px → ゼロ。月はさらに狭いので全部ゼロ
    && eq(p29.week.map(b => b.handles), [0, 0, 0, 0])
    && eq(p29.month.map(b => b.handles), [0, 0, 0, 0]),
    JSON.stringify(p29));

  await tl(F11, { zoom: 'month' });
  const p30 = await dragBar(5, 16, 'center');   // 16px / 1.6px = 10日 → 7日スナップで7日
  r.check('TB-P30（月ズームのスナップは7日単位）',
    lineOf(p30, 5) === '- [ ] 期間タスク 🛫 2026-08-08 📅 2026-08-12',
    JSON.stringify(lineOf(p30, 5)));

  const p31 = await plan(F11, { showDone: true });
  const p31w = await plan(F11, { showDone: true, zoom: 'week' });
  const p31m = await plan(F11, { showDone: true, zoom: 'month' });
  r.check('TB-P31（ズーム3段階で幅と目盛りが変わる）',
    p31.model.dayPx === 16 && p31w.model.dayPx === 4 && p31m.model.dayPx === 1.6
    && p31.bars[0].width === '80px' && p31w.bars[0].width === '20px'
    && p31.tickTexts[0].includes('/')            // 日: M/D
    && p31m.tickTexts.every(t => t.endsWith('月'))   // 月: N月
    && p31.ticks > p31w.ticks,                   // 日は7日刻み・週は14日刻み
    JSON.stringify([p31.model.dayPx, p31.bars[0].width, p31w.bars[0].width,
      p31.ticks, p31w.ticks, p31m.tickTexts]));

  const p32 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:taskboard'));
    return env.data.tlZoom;
  });
  const p32page = r.watch(await context.newPage());
  await p32page.goto(fileUrl('web/taskboard.html'));
  const p32restored = await p32page.evaluate(f11 => {
    window.taskboard.test.newSession(f11);        // render は未読込だと select を触らない
    return document.getElementById('f-zoom').value;
  }, F11);
  await p32page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:taskboard'));
    env.data.tlZoom = 'nonsense';
    localStorage.setItem('tools:taskboard', JSON.stringify(env));
  });
  await p32page.reload();
  const p32fallback = await p32page.evaluate(f11 => {
    window.taskboard.test.newSession(f11);
    return document.getElementById('f-zoom').value;
  }, F11);
  await p32page.close();
  r.check('TB-P32（ズームが永続化され、未知の値は日にフォールバック）',
    p32 === 'month' && p32restored === 'month' && p32fallback === 'day',
    JSON.stringify([p32, p32restored, p32fallback]));

  /* --- 吹き出しの位置と差分日数（Phase T5・TB-P43〜P44） --- */
  // ドラッグ中の吹き出しを読む（pointerup せずに測る）
  const tipDuring = async (lineNo, dx, where) => {
    const bar = page.locator('.tl-bar[data-line="' + lineNo + '"]');
    const box = await bar.boundingBox();
    const y = box.y + box.height / 2;
    const x = where === 'left' ? box.x + 3
      : (where === 'right' ? box.x + box.width - 3
        : (box.width < 21 ? box.x + 3 : box.x + box.width / 2));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 6 });
    const out = await page.evaluate(() => {
      const t = document.querySelector('.tl-drag-tip');
      const bar = document.querySelector('.tl-bar.tl-dragging');
      const track = t.parentNode;
      const tr = t.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const kr = track.getBoundingClientRect();
      return {
        text: t.textContent,
        // 同じ行にあるか（縦に重なっているか）と、左右どちら側に出ているか
        sameRow: tr.top < br.bottom && tr.bottom > br.top,
        rightOf: Math.round(tr.left) >= Math.round(br.right),
        leftOf: Math.round(tr.right) <= Math.round(br.left),
        // 「図の中」ではなく**画面に見えているか**で判定する（図が狭いときは
        // 図の右外にはみ出しても、可視域に収まっていれば読める）
        insideView: (() => {
          const sc = document.getElementById('tl-scroll').getBoundingClientRect();
          return Math.round(tr.left) >= Math.round(sc.left) - 1
            && Math.round(tr.right) <= Math.round(sc.right) + 1;
        })(),
        rowLines: Array.from(document.querySelectorAll('.tl-row')).map(r => r.dataset.line || 'sec'),
      };
    });
    await page.keyboard.press('Escape');   // 変更を残さない
    await page.mouse.up();
    return out;
  };

  // 吹き出しは**同じ行の右横**（上下に出すと見出し帯や隣の行を隠す。Phase T5b で方式変更）
  await tl(F10);
  const p43top = await tipDuring(5, 48, 'center');    // セクション直下の1行目
  const p43mid = await tipDuring(9, 48, 'center');    // 同じセクションの2行目
  r.check('TB-P43（吹き出しは同じ行の右横に出る＝他の行を隠さない）',
    p43top.sameRow === true && p43top.rightOf === true && p43top.insideView === true
    && p43mid.sameRow === true && p43mid.rightOf === true && p43mid.insideView === true,
    JSON.stringify([p43top, p43mid]));

  // 右端に寄ったバーでは左へ反転する（F11 の「遠い予定」は範囲の右端にある）。
  // 図が3,120px あり画面外なので、**先に横スクロールしてから掴む**
  await tl(F11);
  await page.evaluate(() => {
    const sc = document.getElementById('tl-scroll');
    sc.scrollLeft = sc.scrollWidth;
  });
  const p43right = await tipDuring(8, -16, 'center');
  r.check('TB-P43b（右端のバーでは吹き出しが左へ反転し、図の外へ出ない）',
    p43right.sameRow === true && p43right.leftOf === true && p43right.insideView === true,
    JSON.stringify(p43right));

  await tl(F10);
  const p44move = await tipDuring(9, 48, 'center');   // 📅 なしのバーを平行移動（+3日）
  await tl(F10);
  const p44start = await tipDuring(5, -32, 'left');   // 開始日を2日戻す
  await tl(F10);
  const p44due = await tipDuring(5, 32, 'right');     // 期限を2日進める
  r.check('TB-P44（差分日数をモードごとの言葉で併記する）',
    p44move.text.includes('+3日ずらす')
    && p44start.text.includes('開始 -2日') && p44start.text.includes('🛫 2026-07-30')
    && p44due.text.includes('期限 +2日') && p44due.text.includes('📅 2026-08-07'),
    JSON.stringify([p44move.text, p44start.text, p44due.text]));

  /* ========== TB-R10〜R12: 矢印の描画（Phase T6-3） ==========
     F13: 同セクション2本＋別セクションへ1本＋図に出ない依存先（🛫 なし）1本 */

  // 矢印の端点が**実際のバーの端**と一致しているかを DOM で測る（モデル計算の検算）
  const arrows = () => page.evaluate(() => {
    const svg = document.querySelector('.tl-arrows');
    if (!svg) return { n: 0, paths: [], note: document.getElementById('tl-note').textContent };
    const rows = svg.parentNode.getBoundingClientRect();
    const paths = Array.from(svg.querySelectorAll('.tl-arrow')).map(p => {
      const d = p.getAttribute('d');
      const m = /^M([-\d.]+),([-\d.]+) C.* ([-\d.]+),([-\d.]+)$/.exec(d);
      const from = document.querySelector('.tl-bar[data-line="' + p.dataset.from + '"]');
      const to = document.querySelector('.tl-bar[data-line="' + p.dataset.to + '"]');
      const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect();
      return {
        pair: [p.dataset.from, p.dataset.to],
        blocked: p.classList.contains('tl-arrow-blocked'),
        // 始点が先行バーの右端中央・終点が後続バーの左端中央に一致するか（±1px）
        startOk: Math.abs((rows.left + Number(m[1])) - fr.right) <= 1
          && Math.abs((rows.top + Number(m[2])) - (fr.top + fr.height / 2)) <= 1,
        endOk: Math.abs((rows.left + Number(m[3])) - tr.left) <= 1
          && Math.abs((rows.top + Number(m[4])) - (tr.top + tr.height / 2)) <= 1,
      };
    });
    return {
      n: paths.length, paths,
      ns: svg.namespaceURI,
      marker: !!svg.querySelector('marker#tl-arrowhead'),
      pointerEvents: getComputedStyle(svg).pointerEvents,
      note: document.getElementById('tl-note').hidden ? '' : document.getElementById('tl-note').textContent,
    };
  });

  await plan(F13, { showDone: true });
  const r10 = await arrows();
  r.check('TB-R10（SVG が1枚・marker が解決・端点がバーの端と一致・ドラッグを奪わない）',
    r10.n === 3 && r10.ns === 'http://www.w3.org/2000/svg' && r10.marker === true
    && r10.pointerEvents === 'none'
    && r10.paths.every(p => p.startOk && p.endOk)
    && r10.paths.every(p => p.blocked === true),      // 先行が未完了なので全部 blocked
    JSON.stringify(r10));

  r.check('TB-R11（別セクションをまたぐ矢印も端点が一致する）',
    r10.paths.some(p => eq(p.pair, ['5', '12'])) &&
    r10.paths.find(p => eq(p.pair, ['5', '12'])).endOk === true,
    JSON.stringify(r10.paths.map(p => p.pair)));

  r.check('TB-R12（図に出ない依存先は矢印を描かず件数を出す）',
    r10.n === 3 && r10.note.includes('1 本の依存は表示範囲外のタスクへ繋がっています'),
    JSON.stringify([r10.n, r10.note]));

  // 折り畳み・ソート変更・ズーム変更のあとでも端点が一致すること（座標計算が最も壊れやすい）
  const afterCollapse = await page.evaluate(() => {
    document.querySelectorAll('.tl-section-btn')[0].click();   // PEW を畳む
    return true;
  }) && await arrows();
  await plan(F13, { showDone: true, sort: 'due' });
  const afterSort = await arrows();
  await plan(F13, { showDone: true, zoom: 'week' });
  const afterZoom = await arrows();
  r.check('TB-R12b（折り畳み・ソート変更・ズーム変更の後でも矢印の端点が一致する）',
    // PEW を畳むと PEW 内の関係は描けない（UL への1本だけ残るが、先行も PEW なので0本）
    afterCollapse.n === 0 && afterCollapse.note.includes('表示範囲外')
    && afterSort.n === 3 && afterSort.paths.every(p => p.startOk && p.endOk)
    && afterZoom.n === 3 && afterZoom.paths.every(p => p.startOk && p.endOk),
    JSON.stringify([afterCollapse.n, afterSort.paths.map(p => p.startOk && p.endOk),
      afterZoom.paths.map(p => p.startOk && p.endOk)]));

  // 循環・重複・上限は矢印を1本も描かない（理由は #tl-note）
  const cyc = ['# tasks', '', '## PEW', '',
    '- [ ] A 🆔 a1 ⛔ b1 🛫 2026-08-01 📅 2026-08-03',
    '- [ ] B 🆔 b1 ⛔ a1 🛫 2026-08-04 📅 2026-08-06', '', ''].join('\n');
  await plan(cyc, { showDone: true });
  const r13d = await arrows();
  r.check('TB-R13b（循環しているときは矢印を1本も描かず経路を出す）',
    r13d.n === 0 && r13d.note.includes('依存関係が循環しています')
    && r13d.note.includes('→'), JSON.stringify(r13d.note));

  await plan(F13, { showDone: true });   // 後続テストのために戻す

  /* --- ズームの可否（Phase T5・TB-P40〜P42） --- */
  const zoomOpts = (text) => page.evaluate(([t, today]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    window.__sZ = window.taskboard.test.newSession(t);
    window.__sZ.setView('timeline');
    const sel = document.getElementById('f-zoom');
    return {
      opts: Array.from(sel.options).map(o => ({ v: o.value, dis: o.disabled, title: o.title })),
      value: sel.value,
      days: window.__sZ.getTimeline().days,
      note: document.getElementById('tl-note').hidden ? '' : document.getElementById('tl-note').textContent,
    };
  }, [text, TODAY]);

  const p40short = await zoomOpts(F10);   // 範囲18日
  const p40long = await zoomOpts(F11);    // 範囲195日
  r.check('TB-P40（範囲が短いと粗いズームは選べない・日は常に選べる）',
    p40short.days < 163
    && eq(p40short.opts.map(o => o.dis), [false, true, true])
    && p40short.opts[2].title.includes('163日以上で選べます')
    && p40short.opts[1].title.includes('65日以上で選べます')
    && eq(p40long.opts.map(o => o.dis), [false, false, false]),
    JSON.stringify([p40short.days, p40short.opts, p40long.opts.map(o => o.dis)]));

  // 境界: 図の幅がラベル列（260px）ちょうど以上なら選べる。月は 163日 = 260.8px
  // model.days = (最大end - 最小🛫) + 前後の余白3日ずつ + 1 なので、k 日後に2本目を置くと
  // days = k + 8 になる（1本目 08-01〜08-02・2本目 08-01+k 〜 08-01+k+1）
  const spanFixture = (days) => {
    const k = days - 8;
    const at = (n) => new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);
    return ['# tasks', '', '## PEW', '', '- [ ] a 🛫 2026-08-01 📅 2026-08-02',
      '- [ ] b 🛫 ' + at(k) + ' 📅 ' + at(k + 1), ''].join('\n');
  };

  /* --- 目盛りの刻み（Phase T5b・TB-P45） --- */
  const ticksOf = (text, zoom) => page.evaluate(([t, z]) => {
    window.taskboard.test.setToday('2026-08-04');
    const sel = document.getElementById('f-zoom');
    sel.value = z; sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.taskboard.test.newSession(t).setView('timeline');
    const ts = Array.from(document.querySelectorAll('.tl-tick'));
    const gaps = [];
    for (let i = 1; i < ts.length; i++) {
      gaps.push(ts[i].getBoundingClientRect().left - ts[i - 1].getBoundingClientRect().right);
    }
    return { n: ts.length, texts: ts.map(x => x.textContent),
      minGap: gaps.length ? Math.round(Math.min(...gaps)) : null };
  }, [text, zoom]);

  // 65日: 1桁月なら `10/4`(26.7px) まで 28px に収まるので**7日刻み**
  const wk1 = await ticksOf(spanFixture(65), 'week');
  // 12月をまたぐと `11/16`(31.4px) が 28px に収まらないので**14日刻み**
  const decFx = ['# tasks', '', '## PEW', '', '- [ ] a 🛫 2026-11-05 📅 2026-11-25',
    '- [ ] b 🛫 2027-01-20 📅 2027-02-05', ''].join('\n');
  const wk2 = await ticksOf(decFx, 'week');
  const dayT = await ticksOf(spanFixture(30), 'day');
  const monT = await ticksOf(spanFixture(200), 'month');
  // 刻みは本数で判定する（ラベル文字列は範囲の始点で変わるため決め打ちしない）
  r.check('TB-P45（目盛りはラベルが収まる最小の刻みを選ぶ・重ならない）',
    // 週・1桁月（範囲65日）: 7日刻み = ceil(65/7) = 10本。すきま0以上（`10/4` が 28px に収まる）
    wk1.n === 10 && wk1.minGap >= 0
    // 週・2桁月をまたぐ（範囲99日）: `11/16` が収まらないので14日刻み = ceil(99/14) = 8本
    && wk2.n === 8 && wk2.minGap > 0 && wk2.texts.includes('11/16')
    // 日は常に7日刻み（範囲30日 → 5本）・月は月初のラベル（どちらも従来どおり）
    && dayT.n === Math.ceil(30 / 7) && dayT.minGap > 0
    && monT.texts.every(t => t.endsWith('月')) && monT.minGap > 0,
    JSON.stringify([wk1, wk2, dayT.n, dayT.minGap, monT.texts]));

  const p41on = await zoomOpts(spanFixture(163));
  const p41off = await zoomOpts(spanFixture(162));
  r.check('TB-P41（月ズームの境界: 163日で選べ、162日では選べない）',
    p41on.days === 163 && p41on.opts[2].dis === false
    && p41off.days === 162 && p41off.opts[2].dis === true,
    JSON.stringify([p41on.days, p41on.opts[2].dis, p41off.days, p41off.opts[2].dis]));

  // 選べないズームが永続化されていたら日へ落とし、**理由を出す**（黙って落とさない）
  const p42 = await page.evaluate(([f10, today]) => {
    window.taskboard.test.setToday(today);
    const env = JSON.parse(localStorage.getItem('tools:taskboard'));
    env.data.tlZoom = 'month';
    localStorage.setItem('tools:taskboard', JSON.stringify(env));
    return null;
  }, [F10, TODAY]);
  const p42page = r.watch(await context.newPage());
  await p42page.goto(fileUrl('web/taskboard.html'));
  const p42r = await p42page.evaluate(([f10, today]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f10);
    s.setView('timeline');
    // 再描画しても理由が残ること（選択を書き換える実装だと2回目で消える）
    s.setView('list');
    s.setView('timeline');
    return {
      value: document.getElementById('f-zoom').value,
      note: document.getElementById('tl-note').textContent,
      dayPx: s.getTimeline().dayPx,
      saved: JSON.parse(localStorage.getItem('tools:taskboard')).data.tlZoom,
    };
  }, [F10, TODAY]);
  await p42page.close();
  r.check('TB-P42（選べないズームの選択は保持したまま日で描画し、理由を出し続ける）',
    p42r.value === 'day' && p42r.dayPx === 16
    && p42r.saved === 'month'          // 利用者の選択は書き換えない
    && p42r.note.includes('「月」だと図が細くなりすぎるため「日」で表示しています'),
    JSON.stringify(p42r));

  /* --- セクション区切りと完了率（TB-P33〜P35） --- */
  const p33 = await plan(F10, { showDone: true });
  const p33closed = await page.evaluate(() => {
    document.querySelectorAll('.tl-section-btn')[0].click();
    return {
      sections: Array.from(document.querySelectorAll('.tl-section-btn')).map(x => x.textContent),
      bars: Array.from(document.querySelectorAll('.tl-bar')).map(b => b.dataset.line),
    };
  });
  r.check('TB-P33（セクション見出しで区切られ、折り畳むとその行だけ消える）',
    eq(p33.sections, ['▾ PEW（2）', '▾ UL（1）'])
    && eq(p33.bars.map(b => b.cls.includes('tl-bar')), [true, true, true])
    && eq(p33closed.sections, ['▸ PEW（2）', '▾ UL（1）'])
    && eq(p33closed.bars, ['13']),               // PEW の2本が消え UL だけ残る
    JSON.stringify([p33.sections, p33closed.sections, p33closed.bars]));

  const p34 = await plan('# tasks\n\n## PEW\n\n- [ ] 親 🛫 2026-08-01 📅 2026-08-05\n' +
    '\t- [ ] 子1\n- [ ] 子なし 🛫 2026-08-02 📅 2026-08-03\n', { showDone: true });
  r.check('TB-P34（🛫 を持つ行が無いセクションの見出しは出さない・子なしに完了率は出ない）',
    eq(p34.sections, ['▾ PEW（2）'])
    && p34.model.items[0].progress.total === 1 && p34.model.items[1].progress === null
    && p34.bars[1].fill === null,
    JSON.stringify([p34.sections, p34.model.items.map(i => i.progress)]));

  const p35 = await plan(F10, { showDone: true });
  const p35all = await plan('# tasks\n\n## PEW\n\n- [ ] 親 🛫 2026-08-01 📅 2026-08-05\n' +
    '\t- [x] 子1 ✅ 2026-08-02\n\t- [/] 子2\n', { showDone: true });
  r.check('TB-P35（完了率: 分子は done のみ・中止は分母から外れる・塗りが出る）',
    // F10 の親は 子1完了 / 子2未 / 子3中止 → 1/2（50%）
    p35.model.items[0].progress.done === 1 && p35.model.items[0].progress.total === 2
    && p35.model.items[0].progress.pct === 50
    && p35.bars[0].fill === '50%'
    // 80px のバーには日数だけ（完了率の文字は 96px 以上のときだけ。切れた文字を出さない）
    && p35.bars[0].text === '5日',
    JSON.stringify([p35.model.items[0].progress, p35.bars[0].text]));

  r.check('TB-P36（着手中は分子に入らない＝0.5 と数えない）',
    p35all.model.items[0].progress.done === 1 && p35all.model.items[0].progress.total === 2
    && p35all.model.items[0].progress.pct === 50,
    JSON.stringify(p35all.model.items[0].progress));

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

  /* ========== TB-H1: Draw Gantt への受け渡し（lib/handoff.js・coding-rules） ========== */
  const h1 = await page.evaluate(([f, today]) => {
    if (!window.ToolHandoff) return { missing: true };
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f);
    sessionStorage.removeItem('tools:handoff');
    const btn = document.getElementById('btn-to-gantt');
    s.setView('list');
    const hiddenInList = btn.hidden;
    s.setView('timeline');
    const shownInTimeline = !btn.hidden;
    // 遷移はさせない（location を差し替えず send の書き込みだけ確かめる）
    const sent = ToolHandoff.send('gantt', 'plan', s.getPlanTsv());
    const raw = sessionStorage.getItem('tools:handoff');
    const d = raw ? JSON.parse(raw) : null;
    sessionStorage.removeItem('tools:handoff');
    return {
      hiddenInList, shownInTimeline, sent: sent === undefined,
      to: d && d.to, kind: d && d.kind,
      header: d && d.text.split('\n')[0],
      rows: d && d.text.split('\n').length,
    };
  }, [F4, TODAY]);
  r.check('TB-H1（Draw Gantt で開く: タイムラインのときだけ出る・計画TSVを tools:handoff に渡す）',
    !h1.missing && h1.hiddenInList === true && h1.shownInTimeline === true
    && h1.to === 'gantt' && h1.kind === 'plan'
    && h1.header === '内容\t開始日\t期限\t日数\t状態\tセクション' && h1.rows > 1,
    JSON.stringify(h1));

  },
};
