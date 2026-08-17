'use strict';
/* 目的: docs/specs/diagram.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/diagram.js  /  ./test/run diagram

   照合するID: DG-01〜04（描画・エラー保持）＋ DG-U1〜U4（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/diagram.md。期待値を変えるときは spec を先に直す。
   mermaid（3.4MB 同梱）の初回描画は重いので、描画系の待ちは長めに取る。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/diagram.html'));

  const ready = await page.evaluate(() => !!(window.diagram && window.diagram.render));
  r.check('前提（window.diagram フックがある）', ready, String(ready));

  if (ready) {
    /* ========== DG-01: フローチャート ========== */
    const dg01 = await page.evaluate(async () => {
      const res = await window.diagram.render('graph TD; A[開始]-->B{判定}; B-->|yes|C[実行];');
      return { res, info: window.diagram.svgInfo() };
    });
    r.check('DG-01（フローチャートが SVG になる）',
      dg01.res.ok === true && dg01.info.present === true && dg01.info.nodes > 0,
      JSON.stringify(dg01));

    /* ========== DG-02: シーケンス図 ========== */
    const dg02 = await page.evaluate(async () => {
      const res = await window.diagram.render('sequenceDiagram\n  利用者->>API: リクエスト\n  API-->>利用者: 200 OK');
      return { res, info: window.diagram.svgInfo() };
    });
    r.check('DG-02（シーケンス図が描ける）',
      dg02.res.ok === true && dg02.info.present === true && dg02.info.nodes > 0,
      JSON.stringify(dg02));

    /* ========== DG-03: エラーで前回の図を保持 ========== */
    const dg03 = await page.evaluate(async () => {
      await window.diagram.render('graph TD; A-->B;');
      const before = window.diagram.svgInfo();
      const res = await window.diagram.render('graph TD; A--');
      const banner = document.getElementById('banner');
      return {
        before, res,
        after: window.diagram.svgInfo(),
        warn: !banner.hidden && banner.className.includes('banner-warn'),
        msg: banner.textContent.slice(0, 40),
      };
    });
    r.check('DG-03（不正入力: ok:false・warn バナー・前回の SVG を保持）',
      dg03.before.present && dg03.res.ok === false && dg03.res.error
      && dg03.after.present === true && dg03.warn === true && dg03.msg.length > 0,
      JSON.stringify(dg03));

    /* ========== DG-04: 空入力で出力とバナーが消える ========== */
    const dg04 = await page.evaluate(async () => {
      const res = await window.diagram.render('');
      return { res, info: window.diagram.svgInfo(), bannerHidden: document.getElementById('banner').hidden };
    });
    r.check('DG-04（空入力: 出力が空・バナーも消える）',
      dg04.res.ok === true && dg04.info.present === false && dg04.bannerHidden === true,
      JSON.stringify(dg04));
  }

  /* ========== DG-U1: 自動保存（pagehide フラッシュ → reload） ========== */
  await page.evaluate(() => {
    const input = document.getElementById('input');
    input.value = 'graph LR; 保存-->復元;';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.reload();
  await page.waitForTimeout(800);   // 復元 → 再描画（mermaid 初期化込み）
  const u1 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:diagram'));
    return {
      input: document.getElementById('input').value,
      tool: env && env.tool, v: env && env.v,
      rendered: window.diagram.svgInfo().present,
    };
  });
  r.check('DG-U1（pagehide フラッシュ → reload で入力が復元され再描画）',
    u1.input === 'graph LR; 保存-->復元;' && u1.tool === 'diagram' && u1.v === 1
    && u1.rendered === true,
    JSON.stringify(u1));

  /* ========== DG-U2: PNG コピー（ClipboardItem を捕捉） ========== */
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
  r.check('DG-U2（PNG コピー: image/png の ClipboardItem・✓ 表示・実クリップボードに書かない）',
    Array.isArray(u2.types) && u2.types.includes('image/png') && u2.label === '✓ コピーしました',
    JSON.stringify(u2));

  /* ========== DG-U3: サンプル投入（空のときだけ） ========== */
  const u3 = await page.evaluate(async () => {
    window.ToolStorage.save = () => true;   // サンプルを保存状態に残さない
    const input = document.getElementById('input');
    const hiddenWhenFilled = document.getElementById('sample-btn').hidden;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 500));
    const visibleWhenEmpty = !document.getElementById('sample-btn').hidden;
    document.getElementById('sample-btn').click();
    await new Promise(d => setTimeout(d, 800));
    return {
      hiddenWhenFilled, visibleWhenEmpty,
      hiddenAfter: document.getElementById('sample-btn').hidden,
      rendered: window.diagram.svgInfo().present,
    };
  });
  r.check('DG-U3（サンプルは空のときだけ表示・投入で図が描かれる）',
    u3.hiddenWhenFilled === true && u3.visibleWhenEmpty === true
    && u3.hiddenAfter === true && u3.rendered === true,
    JSON.stringify(u3));

  /* ========== DG-U4: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u4 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('DG-U4（幅390pxで横スクロールなし）', u4 === true, String(u4));

  /* ========== DG-U5: Tab=インデント（lib/edit.js） ========== */
  const u5d = await page.evaluate(() => {
    if (!window.ToolEdit) return { missing: true };
    const ta = document.getElementById('input');
    ta.value = 'graph TD;';
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    const afterTab = { v: ta.value, prevented: ev.defaultPrevented };
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const ev2 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev2);
    return { afterTab, escPass: !ev2.defaultPrevented };
  });
  r.check('DG-U5（Tab=インデント・Esc→Tab は素通し）',
    !u5d.missing && u5d.afterTab.v === 'graph TD;\t' && u5d.afterTab.prevented === true
    && u5d.escPass === true,
    JSON.stringify(u5d));

  /* ========== DG-05: extractMermaid（Obsidian のノートから取り出す — 純関数） ========== */
  const dg05 = await page.evaluate(() => {
    if (!window.diagram.extractMermaid) return { missing: true };
    const f = window.diagram.extractMermaid;
    const body = 'flowchart TD\n  A[開始] --> B[終了]';
    return {
      fenced: f('```mermaid\n' + body + '\n```'),
      prose: f('# 設計メモ\n\n本文です。\n\n```mermaid\n' + body + '\n```\n\nあとがき。'),
      twoBlocks: f('```mermaid\n' + body + '\n```\n\n```mermaid\nflowchart LR\n  X --> Y\n```'),
      bare: f('```\n' + body + '\n```'),
      plain: f(body),
      unclosed: f('```mermaid\n' + body),
    };
  });
  {
    const body = 'flowchart TD\n  A[開始] --> B[終了]';
    const d = dg05;
    r.check('DG-05（extractMermaid: フェンス/地の文/2ブロック+warn/素の```/フェンスなし/閉じ忘れ）',
      !d.missing
      && d.fenced.dsl === body && d.fenced.warnings.length === 0
      && d.prose.dsl === body
      && d.twoBlocks.dsl === body && d.twoBlocks.warnings.length === 1
      && d.twoBlocks.warnings[0].includes('最初')
      && d.bare.dsl === body
      && d.plain.dsl === body && d.plain.warnings.length === 0
      && d.unclosed.dsl === body,
      JSON.stringify(dg05));
  }

  /* ========== DG-06: ノートの ```mermaid ブロックがそのまま描ける ========== */
  const dg06 = await page.evaluate(async () => {
    const res = await window.diagram.render('```mermaid\nflowchart TD\n  A[開始] --> B[終了]\n```');
    return { res, info: window.diagram.svgInfo() };
  });
  r.check('DG-06（Obsidian のノートから貼った ```mermaid ブロックが描ける）',
    dg06.res.ok === true && dg06.info.present === true && dg06.info.nodes > 0,
    JSON.stringify(dg06));

  /* ========== DG-U6: ［Obsidian 用にコピー］ ========== */
  const u6d = await page.evaluate(async () => {
    const btn = document.getElementById('copy-md');
    if (!btn) return { missing: true };
    const ta = document.getElementById('input');
    ta.value = '```mermaid\nflowchart TD\n  A[開始] --> B[終了]\n```';   // フェンス付きを貼った状態
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    let written = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { written = t; } },
    });
    btn.click();
    await new Promise(d => setTimeout(d, 400));
    return { written, label: btn.textContent, input: ta.value };
  });
  r.check('DG-U6（Obsidian 用にコピー: ```mermaid で1重に包んだテキスト・入力欄は不変・✓ 表示）',
    !u6d.missing
    && u6d.written === '```mermaid\nflowchart TD\n  A[開始] --> B[終了]\n```'
    && u6d.input === '```mermaid\nflowchart TD\n  A[開始] --> B[終了]\n```'
    && u6d.label === '✓ コピーしました',
    JSON.stringify(u6d));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("Draw Diagram")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「設計」から遷移でき title が命名規約どおり',
    hubTitle === 'Draw Diagram (diagram)', hubTitle);

  await browser.close();
  r.report('diagram（docs/specs/diagram.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
