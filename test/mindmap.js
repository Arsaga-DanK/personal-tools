'use strict';
/* 目的: docs/specs/mindmap.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/mindmap.js  /  ./test/run mindmap

   照合するID: MM-01〜03（DSL 純関数・描画）＋ MM-U1〜U3（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/mindmap.md。期待値を変えるときは spec を先に直す。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/mindmap.html'));

  const ready = await page.evaluate(() => !!(window.mindmap && window.mindmap.buildMindmapDsl));
  r.check('前提（window.mindmap フックがある）', ready, String(ready));

  if (ready) {
    /* ========== MM-01: DSL 生成（タブ/スペース・全角化・複数ルート） ========== */
    const mm01 = await page.evaluate(() => {
      const input = [
        '# ブレストのメモ',
        '新サービス案',
        '\t課題',
        '\t\t価格が高い(要検討)',
        '  打ち手',
        '\t\t無料プラン',
        '二つ目のルート',
      ].join('\n');
      return window.mindmap.buildMindmapDsl(input);
    });
    const wantDsl = [
      'mindmap',
      '  root((新サービス案))',
      '    課題',
      '      価格が高い（要検討）',
      '    打ち手',
      '      無料プラン',
      '    二つ目のルート',
    ].join('\n');
    r.check('MM-01（DSL: タブ/スペース混在・()の全角化・2つ目のルートは下げて警告）',
      mm01.dsl === wantDsl && mm01.warnings.length === 1 && mm01.warnings[0].includes('7行目'),
      JSON.stringify(mm01));

    /* ========== MM-02: 描画スモーク ========== */
    const mm02 = await page.evaluate(async () => {
      const res = await window.mindmap.render('中心\n\t枝A\n\t枝B\n\t\t葉');
      return { res, info: window.mindmap.svgInfo() };
    });
    r.check('MM-02（アウトラインが SVG になる）',
      mm02.res.ok === true && mm02.info.present === true && mm02.info.nodes > 0,
      JSON.stringify(mm02));

    /* ========== MM-03: 空・コメントのみは描画しない ========== */
    const mm03 = await page.evaluate(async () => {
      const built = window.mindmap.buildMindmapDsl('# コメントだけ');
      const resEmpty = await window.mindmap.render('');
      return { built, resEmpty, info: window.mindmap.svgInfo(),
               bannerHidden: document.getElementById('banner').hidden };
    });
    r.check('MM-03（空/コメントのみ: dsl null・出力が消える）',
      mm03.built.dsl === null && mm03.resEmpty.ok === true
      && mm03.info.present === false && mm03.bannerHidden === true,
      JSON.stringify(mm03));
  }

  if (ready) {
    /* ========== MM-04: md リスト（記号で階層+1・字下げ幅の自動検出） ========== */
    const mm04 = await page.evaluate(() => {
      const input = ['テーマ', '- 枝A', '    - 葉A1', '- 枝B'].join('\n');
      return window.mindmap.buildMindmapDsl(input);
    });
    const want04 = ['mindmap', '  root((テーマ))', '    枝A', '      葉A1', '    枝B'].join('\n');
    r.check('MM-04（md リスト: 記号が外れ階層+1・4スペース字下げを自動検出・警告なし）',
      mm04.dsl === want04 && mm04.warnings.length === 0,
      JSON.stringify(mm04));
  }

  /* ========== MM-U1: 自動保存（pagehide フラッシュ → reload） ========== */
  await page.evaluate(() => {
    const input = document.getElementById('input');
    input.value = '保存確認\n\t枝';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const u1 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:mindmap'));
    return {
      input: document.getElementById('input').value,
      tool: env && env.tool, v: env && env.v,
      rendered: window.mindmap.svgInfo().present,
    };
  });
  r.check('MM-U1（pagehide フラッシュ → reload で入力が復元・再描画）',
    u1.input === '保存確認\n\t枝' && u1.tool === 'mindmap' && u1.v === 1 && u1.rendered === true,
    JSON.stringify(u1));

  /* ========== MM-U2: PNG コピー ========== */
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
  r.check('MM-U2（PNG コピー: image/png の ClipboardItem・✓ 表示・実クリップボードに書かない）',
    Array.isArray(u2.types) && u2.types.includes('image/png') && u2.label === '✓ コピーしました',
    JSON.stringify(u2));

  /* ========== MM-U3: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u3 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('MM-U3（幅390pxで横スクロールなし）', u3 === true, String(u3));

  /* ========== MM-U4: Tab=インデント（lib/edit.js） ========== */
  const u4m = await page.evaluate(() => {
    const ta = document.getElementById('input');
    if (!window.ToolEdit) return { missing: true };
    ta.value = 'A';
    ta.focus();
    ta.selectionStart = ta.selectionEnd = 1;
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    const afterTab = { v: ta.value, prevented: ev.defaultPrevented };
    ta.value = '\tB';
    ta.selectionStart = ta.selectionEnd = 2;
    const ev2 = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev2);
    const afterShift = ta.value;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const ev3 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev3);
    return { afterTab, afterShift, escPass: !ev3.defaultPrevented };
  });
  r.check('MM-U4（Tab=インデント・Shift+Tab=戻す・Esc→Tab は素通し）',
    !u4m.missing && u4m.afterTab.v === 'A\t' && u4m.afterTab.prevented === true
    && u4m.afterShift === 'B' && u4m.escPass === true,
    JSON.stringify(u4m));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent));
  await page.click('ul.tool-list .tool-name:text-is("Draw Mindmap")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「発想」カテゴリ（新設）から遷移でき title が命名規約どおり',
    hubCats.includes('発想') && hubTitle === 'Draw Mindmap (mindmap)', JSON.stringify([hubCats, hubTitle]));

  await browser.close();
  r.report('mindmap（docs/specs/mindmap.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
