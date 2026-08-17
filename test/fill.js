'use strict';
/* 目的: docs/specs/fill.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/fill.js  /  ./test/run fill

   照合するID: FL-01〜05（純関数・組み込み変数）＋ FL-U1〜U5（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/fill.md。期待値を変えるときは spec を先に直す。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/fill.html'));

  const ready = await page.evaluate(() => !!(window.fill && window.fill.parseVars));
  r.check('前提（window.fill フックがある）', ready, String(ready));

  if (ready) {
    /* ========== FL-01〜04: 純関数 ========== */
    const fn = await page.evaluate(() => ({
      order: window.fill.parseVars('{{a}}と{{b}}と{{a}}'),
      trim: window.fill.parseVars('{{ 名前 }}'),
      all: window.fill.render('x{{a}}y{{a}}', { a: 'Z' }),
      missing: window.fill.render('x{{a}}y', {}),
      empty: window.fill.render('x{{a}}y', { a: '' }),
      unclosed: window.fill.parseVars('{{a'),
      none: window.fill.parseVars('変数なし'),
    }));
    r.check('FL-01（初出順・重複なし・前後空白は無視）',
      eq(fn.order, ['a', 'b']) && eq(fn.trim, ['名前']),
      JSON.stringify([fn.order, fn.trim]));
    r.check('FL-02（同名の全出現箇所に同じ値が入る）',
      fn.all.output === 'xZyZ' && eq(fn.all.missing, []),
      JSON.stringify(fn.all));
    r.check('FL-03（未入力・空文字は {{名前}} のまま残して missing に載る）',
      fn.missing.output === 'x{{a}}y' && eq(fn.missing.missing, ['a'])
      && fn.empty.output === 'x{{a}}y' && eq(fn.empty.missing, ['a']),
      JSON.stringify([fn.missing, fn.empty]));
    r.check('FL-04（閉じ忘れ・変数なしは変数にならない）',
      eq(fn.unclosed, []) && eq(fn.none, []),
      JSON.stringify([fn.unclosed, fn.none]));
  }

  /* ========== FL-U1: フォーム生成とリアルタイム出力 ========== */
  const setValue = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);

  await setValue('#template', 'お疲れさまです。{{名前}}です。\n{{件名}}の件、{{名前}}までご連絡ください。');
  const u1a = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#vars label')).map(l => l.textContent));
  await setValue('#vars textarea[data-var="名前"]', '川津');
  await setValue('#vars textarea[data-var="件名"]', '見積');
  const u1b = await page.evaluate(() => document.getElementById('output').value);
  r.check('FL-U1（フォームが初出順に生成され、出力がリアルタイム更新）',
    eq(u1a, ['名前', '件名'])
    && u1b === 'お疲れさまです。川津です。\n見積の件、川津までご連絡ください。',
    JSON.stringify([u1a, u1b]));

  /* ========== FL-U2: 未入力の warn（全部埋めると消える） ========== */
  await setValue('#vars textarea[data-var="件名"]', '');
  const u2a = await page.evaluate(() => {
    const s = document.getElementById('summary');
    return { text: s.textContent, warn: s.className.includes('warn') };
  });
  await setValue('#vars textarea[data-var="件名"]', '見積');
  const u2b = await page.evaluate(() => document.getElementById('summary').textContent);
  r.check('FL-U2（未入力で warn（件数と名前）・全部埋めると消える）',
    u2a.text.includes('未入力') && u2a.text.includes('1') && u2a.text.includes('件名') && u2a.warn
    && !u2b.includes('未入力'),
    JSON.stringify([u2a, u2b]));

  /* ========== FL-05: 組み込み変数 {{今日}} ========== */
  await setValue('#template', '【日報】{{今日}} {{名前}}');
  const f5 = await page.evaluate(() =>
    document.querySelector('#vars textarea[data-var="今日"]').value);
  r.check('FL-05（{{今日}} の欄に YYYY-MM-DD の初期値が入る）',
    /^\d{4}-\d{2}-\d{2}$/.test(f5), f5);

  /* ========== FL-U3: 結果コピー ========== */
  await setValue('#vars textarea[data-var="名前"]', '川津');
  const u3 = await page.evaluate(async () => {
    const out = { text: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { out.text = t; } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return { text: out.text, label: document.getElementById('copy-btn').textContent };
  });
  r.check('FL-U3（コピー: 完成文が渡り ✓ 表示・実クリップボードに書かない）',
    typeof u3.text === 'string' && u3.text.includes('【日報】') && u3.text.includes('川津')
    && u3.label === '✓ コピーしました',
    JSON.stringify(u3));

  /* ========== FL-U4: pagehide フラッシュ → reload で本文と値が復元 ========== */
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));   // デバウンス中でもフラッシュ保存
  await page.reload();
  const u4 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:fill'));
    return {
      template: document.getElementById('template').value,
      name: (document.querySelector('#vars textarea[data-var="名前"]') || {}).value,
      tool: env && env.tool, v: env && env.v,
    };
  });
  r.check('FL-U4（pagehide フラッシュ → reload でテンプレと値が復元・tools:fill envelope）',
    u4.template === '【日報】{{今日}} {{名前}}' && u4.name === '川津'
    && u4.tool === 'fill' && u4.v === 1,
    JSON.stringify(u4));

  /* ========== FL-U6: Cmd/Ctrl+Enter でコピー ========== */
  const u6 = await page.evaluate(async () => {
    const out = { text: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { out.text = t; } },
    });
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 200));
    return { text: out.text, label: document.getElementById('copy-btn').textContent };
  });
  r.check('FL-U6（Cmd/Ctrl+Enter でコピーが発火し ✓ 表示）',
    typeof u6.text === 'string' && u6.text.includes('【日報】') && u6.label === '✓ コピーしました',
    JSON.stringify(u6));

  /* ========== FL-U7: サンプルはテンプレが空のときだけ ========== */
  const u7 = await page.evaluate(async () => {
    window.ToolStorage.save = () => true;   // サンプルを保存状態に残さない
    const hiddenWhenFilled = document.getElementById('sample-btn').hidden;
    const t = document.getElementById('template');
    t.value = '';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    const visibleWhenEmpty = !document.getElementById('sample-btn').hidden;
    document.getElementById('sample-btn').click();
    await new Promise(d => setTimeout(d, 100));
    return {
      hiddenWhenFilled, visibleWhenEmpty,
      hiddenAfter: document.getElementById('sample-btn').hidden,
      hasOutput: document.getElementById('output').value !== '',
      hasForm: !!document.querySelector('#vars textarea[data-var="名前"]'),
    };
  });
  r.check('FL-U7（サンプルは空のときだけ表示・投入で出力とフォームまで埋まる）',
    u7.hiddenWhenFilled && u7.visibleWhenEmpty && u7.hiddenAfter && u7.hasOutput && u7.hasForm,
    JSON.stringify(u7));

  /* ========== FL-U5: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u5 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('FL-U5（幅390pxで横スクロールなし）', u5 === true, String(u5));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("Fill Template")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「変換・比較」から遷移でき title が命名規約どおり',
    hubTitle === 'Fill Template (fill)', hubTitle);

  await browser.close();
  r.report('fill（docs/specs/fill.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
