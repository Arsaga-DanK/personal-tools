'use strict';
/* 目的: docs/specs/terms.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/terms.js  /  ./test/run terms

   照合するID: TM-01〜07（純関数）＋ TM-U1〜U5（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/terms.md。期待値を変えるときは spec を先に直す。
   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/terms.html'));
  // pagehide フラッシュが消した値を書き戻すので、保存を止めてから消す（verification-notes §4）
  await page.evaluate(() => { window.ToolStorage.save = () => true; localStorage.clear(); });
  await page.reload();

  const apply = (rulesText, text) => page.evaluate(([rt, t]) => {
    const p = window.terms.parseRules(rt);
    const a = window.terms.applyTerms(t, p.rules);
    return { text: a.text, counts: a.counts, warnings: p.warnings };
  }, [rulesText, text]);

  /* ========== TM-01〜03: 置換の本体 ========== */
  const t01 = await apply('サーバー\tサーバ', 'サーバーのサーバー');
  r.check('TM-01（基本置換と件数）',
    t01.text === 'サーバのサーバ' && eq(t01.counts, [{ from: 'サーバー', to: 'サーバ', n: 2 }]),
    JSON.stringify(t01));

  const t02 = await apply('サーバ→クライアント\nクライアント→サーバ', 'サーバとクライアント');
  r.check('TM-02（同時置換 — 交換が二重置換にならない）',
    t02.text === 'クライアントとサーバ', JSON.stringify(t02));

  const t03 = await apply('データベースサーバ→DBサーバ\nサーバ→サーバー', 'データベースサーバとサーバ');
  r.check('TM-03（長い語優先）',
    t03.text === 'DBサーバとサーバー', JSON.stringify(t03));

  /* ========== TM-04〜06: 記法・警告・未適用 ========== */
  const t04 = await apply('# 用語集\n\nサーバー→サーバ\n', 'サーバー');
  r.check('TM-04（→ 区切り・コメント・空行）',
    t04.text === 'サーバ' && t04.warnings.length === 0, JSON.stringify(t04));

  const t05 = await apply('区切りがない行\n→変換前が空\nA\tB\nA\tC', 'A');
  r.check('TM-05（不正行・重複の警告と行番号・重複は最初の定義）',
    t05.text === 'B'
    && t05.warnings.length === 3
    && t05.warnings[0].includes('1行目') && t05.warnings[0].includes('区切り')
    && t05.warnings[1].includes('2行目') && t05.warnings[1].includes('変換前が空')
    && t05.warnings[2].includes('4行目') && t05.warnings[2].includes('重複'),
    JSON.stringify(t05));

  const t06 = await apply('A\tB\nX\tY', 'AAA');
  r.check('TM-06（0件のルールも counts に残る）',
    eq(t06.counts, [{ from: 'A', to: 'B', n: 3 }, { from: 'X', to: 'Y', n: 0 }]),
    JSON.stringify(t06));

  /* ========== TM-07: 性能ガード ========== */
  const t07 = await page.evaluate(() => {
    const manyRules = Array.from({ length: 1001 }, (_, i) => 'a' + i + '\tb' + i).join('\n');
    const p = window.terms.parseRules(manyRules);
    const big = window.terms.applyTerms('x'.repeat(1000001), [{ from: 'x', to: 'y', line: 1 }]);
    return { rulesOk: p.ok !== false, rulesErr: p.error || null, bigErr: big.error || null };
  });
  r.check('TM-07（ルール1,001本・入力100万+1文字で処理せず理由）',
    t07.rulesErr !== null && t07.rulesErr.includes('上限')
    && t07.bigErr !== null && t07.bigErr.includes('上限'),
    JSON.stringify(t07));

  /* ========== TM-U1: リアルタイム＋コピー時に確定 ========== */
  const u1 = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); };
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('rules', 'サーバー\tサーバ');
    set('input', 'サーバー構成');
    await new Promise(d => setTimeout(d, 350));
    const output = document.getElementById('output').value;
    const summary = document.getElementById('summary').textContent;
    // デバウンス確定前のコピーでも最新（コピー時に確定）
    set('input', 'サーバーとサーバー');
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 60));
    return { output, summary, copied: window.__copied };
  });
  r.check('TM-U1（リアルタイム変換・サマリ・コピー時に確定）',
    u1.output === 'サーバ構成' && u1.summary.includes('適用 1 箇所')
    && u1.copied === 'サーバとサーバ',
    JSON.stringify(u1));

  /* ========== TM-U5: 未適用ルールの表示 ========== */
  const u5 = await page.evaluate(async () => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('rules', 'サーバー\tサーバ\n使わない語\t置換後');
    set('input', 'サーバー');
    await new Promise(d => setTimeout(d, 350));
    return document.getElementById('summary').textContent;
  });
  r.check('TM-U5（未適用ルールがサマリに出る）',
    u5.includes('未適用') && u5.includes('使わない語'), JSON.stringify(u5));

  /* ========== TM-U2: 保存と復元（フラッシュ込み） ========== */
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('rules', 'A\tB');
    set('input', '保存テストA');
    window.dispatchEvent(new Event('pagehide'));   // デバウンス中でもフラッシュ保存
  });
  await page.reload();
  await page.waitForTimeout(300);
  const u2 = await page.evaluate(() => ({
    rules: document.getElementById('rules').value,
    input: document.getElementById('input').value,
    output: document.getElementById('output').value,
  }));
  r.check('TM-U2（リロードでルール・入力が復元され出力も再計算）',
    u2.rules === 'A\tB' && u2.input === '保存テストA' && u2.output === '保存テストB',
    JSON.stringify(u2));

  /* ========== TM-U3: サンプル投入 ========== */
  const u3 = await page.evaluate(async () => {
    window.ToolStorage.save = () => true;
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('input', '');
    await new Promise(d => setTimeout(d, 300));
    const visibleWhenEmpty = !document.getElementById('sample-btn').hidden;
    document.getElementById('sample-btn').click();
    await new Promise(d => setTimeout(d, 300));
    return {
      visibleWhenEmpty,
      hiddenAfter: document.getElementById('sample-btn').hidden,
      hasOutput: document.getElementById('output').value !== '',
    };
  });
  r.check('TM-U3（サンプルは入力が空のときだけ・投入で変換まで見える）',
    u3.visibleWhenEmpty && u3.hiddenAfter && u3.hasOutput, JSON.stringify(u3));

  /* ========== TM-U4: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u4 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('TM-U4（幅390pxで横スクロールなし）', u4 === true, String(u4));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("Unify Terms")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  const hubH1 = await page.evaluate(() => document.querySelector('h1').textContent);
  // 表示名と英名が同じ（terms）なので title は表示名のみ（Diff と同じ規約）
  r.check('ハブから「Unify Terms」で遷移でき title と h1 が命名規約どおり',
    hubTitle === 'Unify Terms (terms)' && hubH1 === 'Unify Terms', JSON.stringify([hubTitle, hubH1]));

  await browser.close();
  r.report('terms（docs/specs/terms.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
