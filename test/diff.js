'use strict';
/* 目的: docs/specs/diff.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/diff.js  /  ./test/run diff

   照合するID: DIFF-01〜11（07 は性能計測・09〜11 は UI 経路）
   仕様の正本は docs/specs/diff.md。期待値を変えるときは spec を先に直す。

   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/diff.html'));

  // 前回セッションの tools:diff が残っていると既定値ケースが偽 fail する
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const diff = (a, b, opts) => page.evaluate(([x, y, o]) => {
    const res = window.diff.diffLines(x, y, o);
    return {
      summary: res.summary, fallback: res.fallback, lineOnly: res.lineOnly,
      hunkTypes: res.hunks.map(h => h.type),
      // 置換ハンクのペアから文字レンジを取り出す（DIFF-05 用）
      pairs: res.hunks.filter(h => h.type === 'replace').flatMap(h => h.pairs.map(p => ({
        whole: !!p.whole, aRanges: p.aRanges || null, bRanges: p.bRanges || null,
        aText: res.aLines[p.aIdx], bText: res.bLines[p.bIdx],
      }))),
    };
  }, [a, b, opts || null]);

  const zero = { added: 0, deleted: 0, changed: 0 };

  /* ========== DIFF-01〜06: 行差分と文字差分（純関数） ========== */
  const d01 = await diff('a\nb\nc', 'a\nx\nc');
  r.check('DIFF-01（1行の変更）',
    eq(d01.summary, { added: 0, deleted: 0, changed: 1 }) && d01.fallback === false,
    JSON.stringify([d01.summary, d01.fallback]));

  const d02 = await diff('a\nb', 'a\nb\nc');
  r.check('DIFF-02（純追加1行）',
    eq(d02.summary, { added: 1, deleted: 0, changed: 0 }), JSON.stringify(d02.summary));

  const d03 = await diff('a \n  b', 'a\nb', { ignoreWs: true });
  const d03off = await diff('a \n  b', 'a\nb');
  r.check('DIFF-03（前後空白を無視すると差分なし・OFF では差分あり）',
    eq(d03.summary, zero) && !eq(d03off.summary, zero),
    JSON.stringify([d03.summary, d03off.summary]));

  const d04 = await diff('ＡＢＣ', 'ABC', { unifyWidth: true });
  const d04off = await diff('ＡＢＣ', 'ABC');
  r.check('DIFF-04（全角半角を同一視すると差分なし・OFF では差分あり）',
    eq(d04.summary, zero) && !eq(d04off.summary, zero),
    JSON.stringify([d04.summary, d04off.summary]));

  const d05 = await diff('こんにちは世界', 'こんばんは世界');
  r.check('DIFF-05（文字単位差分のレンジ: 旧 にち[2,4) → 新 ばん[2,4)）',
    d05.summary.changed === 1 && d05.pairs.length === 1 && d05.pairs[0].whole === false
    && eq(d05.pairs[0].aRanges, [[2, 4]]) && eq(d05.pairs[0].bRanges, [[2, 4]]),
    JSON.stringify([d05.summary, d05.pairs]));

  const d06 = await diff('', 'a\nb');
  r.check('DIFF-06（空→2行は全追加）',
    eq(d06.summary, { added: 2, deleted: 0, changed: 0 }), JSON.stringify(d06.summary));

  // 空入力の対称ケース（spec エラー・警告仕様: 片側/両側の空でも落ちない）
  const dEmptyBoth = await diff('', '');
  const dDelAll = await diff('a\nb', '');
  r.check('空入力（両側空は差分なし・片側空は全削除）',
    eq(dEmptyBoth.summary, zero) && eq(dDelAll.summary, { added: 0, deleted: 2, changed: 0 }),
    JSON.stringify([dEmptyBoth.summary, dDelAll.summary]));

  /* ========== DIFF-07: 3,000行×約30箇所編集の性能 ========== */
  const measure = () => page.evaluate(() => {
    const a = [], b = [];
    for (let i = 0; i < 3000; i++) { a.push('line ' + i + ' content'); b.push('line ' + i + ' content'); }
    for (let k = 0; k < 30; k++) b[Math.floor(k * 100 + 7)] = 'edited line ' + k;
    const times = [];
    let fallback = null;
    for (let n = 0; n < 5; n++) {
      const t0 = performance.now();
      const res = window.diff.diffLines(a.join('\n'), b.join('\n'), {});
      times.push(performance.now() - t0);
      fallback = res.fallback;
    }
    times.sort((x, y) => x - y);
    return { min: times[0], median: times[2], max: times[4], fallback };
  });
  let m = await measure();
  // spec: 不合格時は1回だけ再計測してから失敗カウント
  if (m.median >= 500) m = await measure();
  r.check('DIFF-07（3,000行×30編集: 中央値 <500ms・fallback なし）',
    m.fallback === false && m.median < 500,
    'min=' + m.min.toFixed(1) + 'ms median=' + m.median.toFixed(1) + 'ms max=' + m.max.toFixed(1) + 'ms fallback=' + m.fallback);
  console.log('  （DIFF-07 実測: min=' + m.min.toFixed(1) + 'ms / median=' + m.median.toFixed(1) +
    'ms / max=' + m.max.toFixed(1) + 'ms）');

  /* ========== DIFF-08: 全行相違の5,000行でフォールバック ========== */
  const d08 = await page.evaluate(() => {
    const a = [], b = [];
    for (let i = 0; i < 5000; i++) { a.push('old ' + i); b.push('new ' + i); }
    const t0 = performance.now();
    const res = window.diff.diffLines(a.join('\n'), b.join('\n'), {});
    return { fallback: res.fallback, ms: performance.now() - t0, hunkTypes: res.hunks.map(h => h.type) };
  });
  r.check('DIFF-08（全行相違5,000行で fallback:true・応答を維持）',
    d08.fallback === true && d08.ms < 5000, JSON.stringify([d08.fallback, d08.ms.toFixed(1) + 'ms']));

  /* ========== UI ヘルパー ========== */
  const setInputs = async (a, b, wait) => {
    await page.evaluate(([x, y]) => {
      const ta = document.getElementById('input-a'), tb = document.getElementById('input-b');
      ta.value = x; tb.value = y;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      tb.dispatchEvent(new Event('input', { bubbles: true }));
    }, [a, b]);
    await page.waitForTimeout(wait || 400); // 200ms デバウンス＋描画の余裕
  };

  const ui = () => page.evaluate(() => {
    const view = document.getElementById('diff-view');
    const banner = document.getElementById('banner');
    return {
      rows: view.querySelectorAll('.row').length,
      delRows: view.querySelectorAll('.row.line-del').length,
      addRows: view.querySelectorAll('.row.line-add').length,
      chrSpans: view.querySelectorAll('.chr').length,
      chrTexts: Array.from(view.querySelectorAll('.chr')).map(s => s.textContent),
      collapseRows: view.querySelectorAll('.collapse-row').length,
      collapseText: (view.querySelector('.collapse-row') || {}).textContent || '',
      viewEmpty: view.textContent === '',
      summary: document.getElementById('summary').textContent,
      banner: banner.hidden ? '' : banner.textContent,
      bannerClass: banner.hidden ? '' : banner.className,
      copyHint: document.getElementById('copy-hint').textContent,
    };
  });

  /* ========== DIFF-09: UI 経路 ========== */
  await setInputs('a\nb\nc', 'a\nx\nc');
  const u09 = await ui();
  r.check('DIFF-09（UI で変更行が表示されサマリが一致）',
    u09.delRows === 1 && u09.addRows === 1 && u09.rows === 4 // 一致2行＋del1＋add1
    && u09.summary === '追加 0行 / 削除 0行 / 変更 1行' && u09.banner === '',
    JSON.stringify([u09.rows, u09.delRows, u09.addRows, u09.summary]));

  // 文字ハイライトが画面に出ること（DIFF-05 の UI 面）
  await setInputs('こんにちは世界', 'こんばんは世界');
  const uChr = await ui();
  r.check('文字ハイライト（.chr に変更部分だけが入る）',
    uChr.chrSpans === 2 && eq(uChr.chrTexts, ['にち', 'ばん']), JSON.stringify(uChr.chrTexts));

  // 差分ゼロかつ入力ありのときだけ「差分なし — 」を前置（spec 画面構成）
  await setInputs('same', 'same');
  const uNoDiff = await ui();
  await setInputs('', '');
  const uBothEmpty = await ui();
  r.check('サマリの零状態（入力ありは「差分なし — 」を前置・両側空では前置しない）',
    uNoDiff.summary === '差分なし — 追加 0行 / 削除 0行 / 変更 0行'
    && uBothEmpty.summary === '追加 0行 / 削除 0行 / 変更 0行',
    JSON.stringify([uNoDiff.summary, uBothEmpty.summary]));

  /* ========== DIFF-10: 1,000行ペアの描画と折り畳み ========== */
  const bigA = [], bigB = [];
  for (let i = 0; i < 1000; i++) { bigA.push('line ' + i); bigB.push('line ' + i); }
  bigB[500] = 'changed line';
  await setInputs(bigA.join('\n'), bigB.join('\n'), 900);
  const u10 = await ui();
  // 折り畳みをクリックして展開できること
  const expanded = await page.evaluate(async () => {
    const before = document.querySelectorAll('#diff-view .row').length;
    document.querySelector('#diff-view .collapse-row').click();
    await new Promise(done => setTimeout(done, 100));
    return { before, after: document.querySelectorAll('#diff-view .row').length,
      collapseLeft: document.querySelectorAll('#diff-view .collapse-row').length };
  });
  r.check('DIFF-10（1,000行の描画・20行超の一致は折り畳み・クリックで展開）',
    u10.collapseRows === 2 && u10.collapseText.includes('行 一致（クリックで展開）')
    && u10.summary === '追加 0行 / 削除 0行 / 変更 1行'
    && expanded.after > expanded.before && expanded.collapseLeft === 1,
    JSON.stringify([u10.collapseRows, u10.collapseText, expanded]));

  // 再計算で折り畳み状態がリセットされること（spec 性能仕様）
  await setInputs(bigA.join('\n'), bigB.join('\n') + '\ntail', 900);
  const uReset = await ui();
  r.check('再計算で折り畳み状態がリセットされる',
    uReset.collapseRows === 2, JSON.stringify(uReset.collapseRows));

  /* ========== DIFF-11: 性能ガード ========== */
  await page.evaluate(() => {
    const ta = document.getElementById('input-a');
    ta.value = 'x\n'.repeat(50001);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1200); // 大きな入力はデバウンス後の描画まで余裕をとる
  const u11 = await ui();
  r.check('DIFF-11（片側50,001行で比較中止・差分ペイン空・warn バナー）',
    u11.viewEmpty && u11.summary === ''
    && u11.banner === '入力が上限（合計500万文字・片側5万行）を超えたため比較を中止しました'
    && u11.bannerClass.includes('banner-warn'),
    JSON.stringify([u11.viewEmpty, u11.summary, u11.banner]));
  await setInputs('', '');

  /* ========== DIFF-08 の UI 面: フォールバック時の警告バナー ========== */
  const fbA = [], fbB = [];
  for (let i = 0; i < 5000; i++) { fbA.push('old ' + i); fbB.push('new ' + i); }
  await setInputs(fbA.join('\n'), fbB.join('\n'), 2500);
  const uFb = await ui();
  r.check('DIFF-08-UI（フォールバック時に警告バナー・黙って劣化しない）',
    uFb.banner === '差分が大きすぎるため中間部を一括の変更として表示しています'
    && uFb.bannerClass.includes('banner-warn'), JSON.stringify([uFb.banner, uFb.bannerClass]));
  await setInputs('', '');

  /* ========== DIFF-Q2: オプションの永続化と復元 ========== */
  await page.evaluate(() => {
    for (const id of ['opt-ws', 'opt-width']) {
      const c = document.getElementById(id);
      c.checked = true;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  const stored = await page.evaluate(() => localStorage.getItem('tools:diff'));
  await page.reload();
  await page.waitForTimeout(200);
  const restored = await page.evaluate(() => ({
    ws: document.getElementById('opt-ws').checked,
    width: document.getElementById('opt-width').checked,
  }));
  r.check('DIFF-Q2（オプションが tools:diff に保存されリロードで復元）',
    !!stored && JSON.parse(stored).data.ignoreWs === true
    && restored.ws === true && restored.width === true,
    JSON.stringify([stored && JSON.parse(stored).data, restored]));
  // 既定値に戻してから後続へ（他ケースが既定前提のため）
  await page.evaluate(() => {
    for (const id of ['opt-ws', 'opt-width']) {
      const c = document.getElementById(id);
      c.checked = false;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  /* ========== diffをコピー（実クリップボードを壊さない） ========== */
  await setInputs('a\nb\nc', 'a\nx\nc');
  const copied = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('copy-btn').click();
    await new Promise(done => setTimeout(done, 200));
    return { text: window.__copied, label: document.getElementById('copy-btn').textContent };
  });
  r.check('diffをコピー（画面と同じ順序のマーカー付きテキスト）',
    copied.text === '  a\n- b\n+ x\n  c' && copied.label.includes('コピーしました'),
    JSON.stringify(copied));

  // 折り畳みは展開して全行コピーする（spec 画面構成）
  await setInputs(bigA.join('\n'), bigB.join('\n'), 900);
  const copiedBig = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('copy-btn').click();
    await new Promise(done => setTimeout(done, 300));
    const lines = window.__copied.split('\n');
    return { total: lines.length, hasEllipsis: lines.some(l => l.includes('…')),
      markers: { common: lines.filter(l => l.startsWith('  ')).length,
        del: lines.filter(l => l.startsWith('- ')).length,
        add: lines.filter(l => l.startsWith('+ ')).length } };
  });
  r.check('コピー（折り畳みを展開して全行・省略記号は入らない）',
    copiedBig.total === 1001 && !copiedBig.hasEllipsis
    && copiedBig.markers.common === 999 && copiedBig.markers.del === 1 && copiedBig.markers.add === 1,
    JSON.stringify(copiedBig));

  // Cmd/Ctrl+Enter でも実行される
  await setInputs('a', 'b');
  const byKey = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(done => setTimeout(done, 200));
    return window.__copied;
  });
  r.check('Cmd/Ctrl+Enter で diff をコピー', byKey === '- a\n+ b', JSON.stringify(byKey));

  // 空のときは「コピーする内容がありません」
  await setInputs('', '');
  const emptyCopy = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('copy-btn').click();
    await new Promise(done => setTimeout(done, 200));
    return { copied: window.__copied, hint: document.getElementById('copy-hint').textContent };
  });
  r.check('コピー（空のときは書き込まず案内を出す）',
    emptyCopy.copied === null && emptyCopy.hint === 'コピーする内容がありません',
    JSON.stringify(emptyCopy));

  /* ========== サンプル投入 ========== */
  await setInputs('', '');
  const sample = await page.evaluate(async () => {
    const btn = document.getElementById('sample-btn');
    const hiddenWhenEmpty = btn.hidden;
    btn.click();
    await new Promise(done => setTimeout(done, 400));
    return {
      hiddenWhenEmpty,
      hiddenAfter: btn.hidden,
      aFilled: document.getElementById('input-a').value !== '',
      bFilled: document.getElementById('input-b').value !== '',
      summary: document.getElementById('summary').textContent,
      chrSpans: document.querySelectorAll('#diff-view .chr').length,
    };
  });
  r.check('サンプル投入（両ペイン空のとき表示・投入後に消える・差分が出る）',
    sample.hiddenWhenEmpty === false && sample.hiddenAfter === true
    && sample.aFilled && sample.bFilled && !sample.summary.startsWith('差分なし')
    && sample.chrSpans > 0,
    JSON.stringify(sample));

  /* ========== ハブからの導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("diff")');
  await page.waitForLoadState('load');
  const title = await page.title();
  r.check('ハブから diff へ遷移できる', title.includes('diff'), title);

  await browser.close();
  r.report('diff（docs/specs/diff.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
