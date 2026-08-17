'use strict';
/* 目的: docs/specs/gantt.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/gantt.js  /  ./test/run gantt

   照合するID: GN-01〜04（DSL 純関数・描画）＋ GN-U1〜U3（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/gantt.md。期待値を変えるときは spec を先に直す。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/gantt.html'));

  const ready = await page.evaluate(() => !!(window.gantt && window.gantt.buildDsl));
  r.check('前提（window.gantt フックがある）', ready, String(ready));

  if (ready) {
    /* ========== GN-01: DSL 生成（正規化・全角化・警告） ========== */
    const gn01 = await page.evaluate(() => {
      const input = [
        '# コメント行',
        '設計フェーズ',
        '基本設計\t2026-08-18\t2026-08-22',
        '詳細設計\t2026-08-25\t5d',
        'レビュー, 2026/9/1, 3日',
        'DB:定義\t2026/09/04\t1d',
        '不正な行\tabc\tdef',
      ].join('\n');
      return window.gantt.buildDsl(input, { excludeWeekends: true });
    });
    const wantDsl = [
      'gantt',
      'dateFormat YYYY-MM-DD',
      'axisFormat %m/%d',
      'excludes weekends',
      'section 設計フェーズ',
      '基本設計 :t1, 2026-08-18, 2026-08-23',   // 終了日は含む — mermaid の排他仕様を +1 日で吸収（GN-Q4）
      '詳細設計 :t2, 2026-08-25, 5d',
      'レビュー :t3, 2026-09-01, 3d',
      'DB：定義 :t4, 2026-09-04, 1d',
    ].join('\n');
    r.check('GN-01（DSL: 終了日+1で排他吸収・正規化・日数・全角コロン・不正行は警告）',
      gn01.dsl === wantDsl && gn01.warnings.length === 1 && gn01.warnings[0].includes('7行目'),
      JSON.stringify(gn01));

    /* ========== GN-02: 土日除外オフ ========== */
    const gn02 = await page.evaluate(() =>
      window.gantt.buildDsl('作業\t2026-08-18\t2d', { excludeWeekends: false }));
    r.check('GN-02（土日除外オフ: excludes 行が入らない）',
      !gn02.dsl.includes('excludes') && gn02.dsl.includes('作業 :t1, 2026-08-18, 2d'),
      JSON.stringify(gn02));

    /* ========== GN-03: タスク0件は描画しない ========== */
    const gn03 = await page.evaluate(async () => {
      const built = window.gantt.buildDsl('# コメントだけ\n不正\txx\tyy', { excludeWeekends: true });
      const res = await window.gantt.render('# コメントだけ\n不正\txx\tyy');
      return { built, res, info: window.gantt.svgInfo() };
    });
    r.check('GN-03（タスク0件: dsl null・警告あり・描画しない）',
      gn03.built.dsl === null && gn03.built.warnings.length > 0
      && gn03.res.ok === false && gn03.info.present === false,
      JSON.stringify(gn03));

    /* ========== GN-04: 描画スモーク ========== */
    const gn04 = await page.evaluate(async () => {
      const res = await window.gantt.render('設計\n基本設計\t2026-08-18\t2026-08-22\n実装\t2026-08-25\t5d');
      return { res, info: window.gantt.svgInfo() };
    });
    r.check('GN-04（正常な表が SVG になる）',
      gn04.res.ok === true && gn04.info.present === true && gn04.info.nodes > 0,
      JSON.stringify(gn04));
  }

  if (ready) {
    /* ========== GN-05: 終了 < 開始 は警告して1日バー ========== */
    const gn05 = await page.evaluate(() =>
      window.gantt.buildDsl('逆転\t2026-08-21\t2026-08-17', { excludeWeekends: false }));
    r.check('GN-05（終了<開始: 警告・1日バーに丸め）',
      gn05.dsl.includes('逆転 :t1, 2026-08-21, 2026-08-22')
      && gn05.warnings.length === 1 && gn05.warnings[0].includes('1行目')
      && gn05.warnings[0].includes('終了が開始より前'),
      JSON.stringify(gn05));
  }

  /* ========== GN-U1: 自動保存（入力＋チェック） ========== */
  await page.evaluate(() => {
    const input = document.getElementById('input');
    input.value = '保存確認\t2026-08-18\t2d';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const ex = document.getElementById('exclude-weekends');
    ex.checked = false;
    ex.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const u1 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:gantt'));
    return {
      input: document.getElementById('input').value,
      excluded: document.getElementById('exclude-weekends').checked,
      tool: env && env.tool, v: env && env.v,
      rendered: window.gantt.svgInfo().present,
    };
  });
  r.check('GN-U1（pagehide フラッシュ → reload で入力とチェックが復元・再描画）',
    u1.input === '保存確認\t2026-08-18\t2d' && u1.excluded === false
    && u1.tool === 'gantt' && u1.v === 1 && u1.rendered === true,
    JSON.stringify(u1));

  /* ========== GN-U2: PNG コピー ========== */
  const u2 = await page.evaluate(async () => {
    const out = { types: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async items => { out.types = items[0].types.slice(); } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 800));
    return { types: out.types, label: document.getElementById('copy-btn').textContent };
  });
  r.check('GN-U2（PNG コピー: image/png の ClipboardItem・✓ 表示・実クリップボードに書かない）',
    Array.isArray(u2.types) && u2.types.includes('image/png') && u2.label === '✓ コピーしました',
    JSON.stringify(u2));

  /* ========== GN-U3: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u3 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('GN-U3（幅390pxで横スクロールなし）', u3 === true, String(u3));

  /* ========== GN-U4: Ctrl/Cmd+; で今日の日付（lib/edit.js） ========== */
  const u4g = await page.evaluate(() => {
    if (!window.ToolEdit) return { missing: true };
    const ta = document.getElementById('input');
    ta.value = '作業\t';
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    const ev = new KeyboardEvent('keydown', { key: ';', metaKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    return { v: ta.value, prevented: ev.defaultPrevented };
  });
  r.check('GN-U4（Ctrl/Cmd+; でキャレット位置に今日の日付）',
    !u4g.missing && /^作業\t\d{4}-\d{2}-\d{2}$/.test(u4g.v) && u4g.prevented === true,
    JSON.stringify(u4g));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("Draw Gantt")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「PM」から遷移でき title が命名規約どおり',
    hubTitle === 'Draw Gantt (gantt)', hubTitle);

  await browser.close();
  r.report('gantt（docs/specs/gantt.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
