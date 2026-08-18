'use strict';
/* 目的: docs/specs/mask.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/mask.js  /  ./test/run mask

   照合するID: MK-01〜19（操作モデル・編集・色・太さ・白塗り・番号）＋ MK-U1〜U37（UI 経路・複数選択）＋ハブ導線
   仕様の正本は docs/specs/mask.md。期待値を変えるときは spec を先に直す。
   クリップボードは壊さない: navigator.clipboard.write をスタブして捕捉する。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/mask.html'));

  // fixture: 100×100 の勾配画像（rgb(x*2, y*2, 100)）をページ内で生成して取り込む
  const loadFixture = () => page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 100; c.height = 100;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(100, 100);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const i = (y * 100 + x) * 4;
        im.data[i] = x * 2; im.data[i + 1] = y * 2; im.data[i + 2] = 100; im.data[i + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    await window.mask.setImage(c.toDataURL('image/png'));
    window.mask.clearOps();
    return window.mask.size();
  });

  const size0 = await loadFixture();
  r.check('前提（fixture 100×100 を取り込める）', eq(size0, { w: 100, h: 100 }), JSON.stringify(size0));

  /* ========== MK-01: 黒塗り ========== */
  const mk01 = await page.evaluate(() => {
    window.mask.addOp({ type: 'fill', x: 10, y: 10, w: 30, h: 30 });
    return { inside: window.mask.pixelAt(20, 20), outside: window.mask.pixelAt(60, 60) };
  });
  r.check('MK-01（黒塗り: 領域内は黒・外は元のまま）',
    eq(mk01.inside, [0, 0, 0, 255]) && eq(mk01.outside, [120, 120, 100, 255]),
    JSON.stringify(mk01));

  /* ========== MK-06: Undo ========== */
  const mk06 = await page.evaluate(() => {
    window.mask.undo();
    return window.mask.pixelAt(20, 20);
  });
  r.check('MK-06（Undo で元の画素に戻る）', eq(mk06, [40, 40, 100, 255]), JSON.stringify(mk06));

  /* ========== MK-02: モザイク（セル内は同色・セル間は別色） ========== */
  const mk02 = await page.evaluate(() => {
    window.mask.clearOps();
    window.mask.addOp({ type: 'mosaic', x: 40, y: 40, w: 40, h: 40, size: 8 });
    return {
      a: window.mask.pixelAt(41, 41), b: window.mask.pixelAt(46, 46),   // 同一セル
      c: window.mask.pixelAt(47, 41), d: window.mask.pixelAt(51, 41),   // 隣接セル（x=40-47 と 48-55）
    };
  });
  r.check('MK-02（モザイク: 同一セルは同色・隣のセルは別色）',
    eq(mk02.a, mk02.b) && !eq(mk02.c, mk02.d),
    JSON.stringify(mk02));

  /* ========== MK-03: 枠（縁は赤・内部は元のまま） ========== */
  const mk03 = await page.evaluate(() => {
    window.mask.clearOps();
    window.mask.addOp({ type: 'rect', x: 5, y: 60, w: 30, h: 20 });
    return {
      edge: window.mask.countRed(4, 59, 32, 4),      // 上辺のあたり
      inside: window.mask.pixelAt(20, 70),
    };
  });
  r.check('MK-03（枠: 縁に赤画素・内部は塗らない）',
    mk03.edge > 0 && eq(mk03.inside, [40, 140, 100, 255]),
    JSON.stringify(mk03));

  /* ========== MK-04: 矢印 ========== */
  const mk04 = await page.evaluate(() => {
    window.mask.clearOps();
    window.mask.addOp({ type: 'arrow', x1: 0, y1: 0, x2: 99, y2: 99 });
    return window.mask.countRed(45, 45, 10, 10);
  });
  r.check('MK-04（矢印: 対角線の中央付近に赤画素）', mk04 > 0, String(mk04));

  /* ========== MK-05: テキスト ========== */
  const mk05 = await page.evaluate(() => {
    window.mask.clearOps();
    window.mask.addOp({ type: 'text', x: 10, y: 90, text: 'A' });
    return window.mask.countRed(5, 70, 35, 25);
  });
  r.check('MK-05（テキスト: 描画位置の周辺に赤画素）', mk05 > 0, String(mk05));

  /* ========== MK-07: hitTest（最前面優先・線分近傍・文字箱） ========== */
  const mk07 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.hitTest) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 30, h: 30 });     // index 0
    m.addOp({ type: 'rect', x: 20, y: 20, w: 30, h: 30 });     // index 1（重なりの上）
    const overlap = m.hitTest(25, 25);
    const fillOnly = m.hitTest(12, 12);
    const blank = m.hitTest(90, 90);
    m.clearOps();
    m.addOp({ type: 'arrow', x1: 0, y1: 0, x2: 99, y2: 99 });
    const nearLine = m.hitTest(53, 47);    // 対角線から約 4.2px
    const farLine = m.hitTest(80, 20);     // 遠い
    m.clearOps();
    m.addOp({ type: 'text', x: 10, y: 90, text: 'ABC' });
    const inText = m.hitTest(20, 80);
    const outText = m.hitTest(20, 50);
    m.clearOps();
    return { overlap, fillOnly, blank, nearLine, farLine, inText, outText };
  });
  r.check('MK-07（hitTest: 重なりは後に置いた方・空白 null・矢印は線分8px・テキストは箱）',
    !mk07.missing && mk07.overlap === 1 && mk07.fillOnly === 0 && mk07.blank === null
    && mk07.nearLine === 0 && mk07.farLine === null && mk07.inText === 0 && mk07.outText === null,
    JSON.stringify(mk07));

  /* ========== MK-08〜10: 移動 → 削除 → Undo 履歴 ========== */
  const mk08 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectAt) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    const sel = m.selectAt(15, 15);
    const moved = m.moveSelected(40, 0);
    return { sel, moved, old: m.pixelAt(15, 15), now: m.pixelAt(55, 15) };
  });
  r.check('MK-08（移動: 旧領域の画素が元に戻り新領域が黒）',
    !mk08.missing && mk08.sel === 0 && mk08.moved === true
    && eq(mk08.old, [30, 30, 100, 255]) && eq(mk08.now, [0, 0, 0, 255]),
    JSON.stringify(mk08));

  const mk09 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.deleteSelected) return { missing: true };
    const deleted = m.deleteSelected();
    return { deleted, count: m.opsCount(), restored: m.pixelAt(55, 15) };
  });
  r.check('MK-09（削除: 図形が消え画素復元・opsCount が減る）',
    !mk09.missing && mk09.deleted === true && mk09.count === 0
    && eq(mk09.restored, [110, 30, 100, 255]),
    JSON.stringify(mk09));

  const mk10 = await page.evaluate(() => {
    const m = window.mask;
    m.undo();   // ①削除が戻る → 移動後の位置に復活
    const afterUndoDelete = { moved: m.pixelAt(55, 15), count: m.opsCount() };
    m.undo();   // ②移動が戻る → 元の位置
    const afterUndoMove = { orig: m.pixelAt(15, 15), movedArea: m.pixelAt(55, 15) };
    m.undo();   // ③追加が戻る → 消える
    const afterUndoAdd = { orig: m.pixelAt(15, 15), count: m.opsCount() };
    return { afterUndoDelete, afterUndoMove, afterUndoAdd };
  });
  r.check('MK-10（Undo 履歴: 削除→移動→追加の順に1手ずつ戻る）',
    eq(mk10.afterUndoDelete.moved, [0, 0, 0, 255]) && mk10.afterUndoDelete.count === 1
    && eq(mk10.afterUndoMove.orig, [0, 0, 0, 255]) && eq(mk10.afterUndoMove.movedArea, [110, 30, 100, 255])
    && eq(mk10.afterUndoAdd.orig, [30, 30, 100, 255]) && mk10.afterUndoAdd.count === 0,
    JSON.stringify(mk10));

  /* ========== MK-11: 複数行テキスト（v3） ========== */
  const mk11 = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'text', x: 10, y: 30, text: 'AB\nCD' });
    return {
      line1: m.countRed(5, 12, 60, 22),
      line2: m.countRed(5, 38, 60, 22),
      hit2: m.hitTest(15, 60),
      out: m.hitTest(15, 70),
    };
  });
  r.check('MK-11（複数行テキスト: 両方の行に赤画素・2行目も hitTest・箱の外は null）',
    mk11.line1 > 0 && mk11.line2 > 0 && mk11.hit2 === 0 && mk11.out === null,
    JSON.stringify(mk11));

  /* ========== MK-12: リサイズ（拡大とクランプ） ========== */
  const mk12 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.resizeSelected) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    m.selectAt(15, 15);
    const ok = m.resizeSelected('se', 30, 10);                      // → 10..60 × 10..40
    const grown = { edge: m.pixelAt(55, 35), out: m.pixelAt(65, 15) };
    const ok2 = m.resizeSelected('nw', 100, 100);                   // 最小 2px にクランプ → (58,38) 2×2
    const clamped = { tiny: m.pixelAt(59, 39), freed: m.pixelAt(15, 15), freed2: m.pixelAt(55, 35) };
    return { ok, ok2, grown, clamped };
  });
  r.check('MK-12（リサイズ: se で拡大・過大な nw は最小 2px にクランプ）',
    !mk12.missing && mk12.ok === true && mk12.ok2 === true
    && eq(mk12.grown.edge, [0, 0, 0, 255]) && eq(mk12.grown.out, [130, 30, 100, 255])
    && eq(mk12.clamped.tiny, [0, 0, 0, 255]) && eq(mk12.clamped.freed, [30, 30, 100, 255])
    && eq(mk12.clamped.freed2, [110, 70, 100, 255]),
    JSON.stringify(mk12));

  /* ========== MK-13: 矢印の端点リサイズとゼロ長ガード ========== */
  const mk13 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.resizeSelected) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'arrow', x1: 10, y1: 50, x2: 50, y2: 50 });
    m.selectAt(30, 50);
    const ok = m.resizeSelected('p2', 30, 0);                       // p2 → (80,50)
    const head = m.countRed(70, 44, 10, 13);
    const beyond = m.countRed(82, 44, 12, 12);
    const rejected = m.resizeSelected('p1', 70, 0);                 // p1 が p2 に重なる → 拒否
    const lineStill = m.countRed(20, 46, 20, 8);
    return { ok, head, beyond, rejected, lineStill };
  });
  r.check('MK-13（矢印: 端点の移動で頭が動く・長さ2px未満は拒否）',
    !mk13.missing && mk13.ok === true && mk13.head > 0 && mk13.beyond === 0
    && mk13.rejected === false && mk13.lineStill > 0,
    JSON.stringify(mk13));

  /* ========== MK-14: handleAt（角優先・小図形は辺を間引き） ========== */
  const mk14 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.handleAt) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 30, y: 30, w: 40, h: 40 });
    const noSel = m.handleAt(70, 70);
    m.selectAt(50, 50);
    const se = m.handleAt(70, 70);
    const nw = m.handleAt(30, 30);
    const n = m.handleAt(50, 30);
    const off = m.handleAt(80, 80);
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });          // 画面20px < 24 → 辺なし
    m.selectAt(20, 20);
    const smallCorner = m.handleAt(30, 30);
    const smallEdge = m.handleAt(20, 10);
    m.clearOps();
    return { noSel, se, nw, n, off, smallCorner, smallEdge };
  });
  r.check('MK-14（handleAt: 未選択 null・se/nw/n・域外 null・小図形は辺ハンドルなし）',
    !mk14.missing && mk14.noSel === null && mk14.se === 'se' && mk14.nw === 'nw'
    && mk14.n === 'n' && mk14.off === null
    && mk14.smallCorner === 'se' && mk14.smallEdge === null,
    JSON.stringify(mk14));

  /* ========== MK-15: 色付き op と後方互換（v4） ========== */
  const BLUE = [180, 255, 0, 120, 180, 255];   // 青系（r低・g中・b高）の countColor 範囲
  const mk15 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.countColor) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'rect', x: 10, y: 10, w: 30, h: 20, color: '#2563eb' });
    m.addOp({ type: 'arrow', x1: 10, y1: 60, x2: 60, y2: 60, color: '#2563eb' });
    m.addOp({ type: 'text', x: 10, y: 95, text: 'B', color: '#2563eb' });
    const blue = {
      rect: m.countColor(8, 8, 34, 6, [0, 120, 0, 160, 180, 255]),
      arrow: m.countColor(15, 56, 40, 8, [0, 120, 0, 160, 180, 255]),
      text: m.countColor(5, 76, 30, 22, [0, 120, 0, 160, 180, 255]),
    };
    m.clearOps();
    m.addOp({ type: 'rect', x: 10, y: 10, w: 30, h: 20 });   // color なし → 赤（後方互換）
    const legacyRed = m.countRed(8, 8, 34, 6);
    m.clearOps();
    return { blue, legacyRed };
  });
  r.check('MK-15（color 指定で青く描ける・省略時は従来どおり赤）',
    !mk15.missing && mk15.blue.rect > 0 && mk15.blue.arrow > 0 && mk15.blue.text > 0
    && mk15.legacyRed > 0,
    JSON.stringify(mk15));

  /* ========== MK-16: 線の太さ（v5） ========== */
  const mk16 = await page.evaluate(() => {
    const m = window.mask;
    if (!m.opAt) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'rect', x: 10, y: 10, w: 40, h: 30, width: 2 });
    const thin = m.countRed(5, 5, 50, 12);          // 上辺の帯
    m.clearOps();
    m.addOp({ type: 'rect', x: 10, y: 10, w: 40, h: 30, width: 5 });
    const thick = m.countRed(5, 5, 50, 12);
    m.clearOps();
    m.addOp({ type: 'arrow', x1: 10, y1: 60, x2: 70, y2: 60, width: 5 });
    const bigHead = m.countRed(50, 48, 22, 24);     // 太さ5 → 頭 L=20
    m.clearOps();
    m.addOp({ type: 'arrow', x1: 10, y1: 60, x2: 70, y2: 60, width: 2 });
    const smallHead = m.countRed(50, 48, 22, 24);   // 太さ2 → 頭 L=8
    m.clearOps();
    return { thin, thick, bigHead, smallHead };
  });
  r.check('MK-16（太さ: 5 は 2 より描画画素が多い・矢印の頭も比例）',
    !mk16.missing && mk16.thick > mk16.thin && mk16.bigHead > mk16.smallHead,
    JSON.stringify(mk16));

  /* ========== MK-19: 白塗り（v5） ========== */
  const mk19 = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20, color: '#ffffff' });
    const white = m.pixelAt(15, 15);
    const blackDefault = (() => {
      m.addOp({ type: 'fill', x: 50, y: 50, w: 10, h: 10 });
      return m.pixelAt(55, 55);
    })();
    m.clearOps();
    return { white, blackDefault };
  });
  r.check('MK-19（fill: color 白で白塗り・省略は従来どおり黒）',
    eq(mk19.white, [255, 255, 255, 255]) && eq(mk19.blackDefault, [0, 0, 0, 255]),
    JSON.stringify(mk19));

  /* ========== MK-U1: 合成 paste で画像が入る ========== */
  const u1 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 60; c.height = 40;
    c.getContext('2d').fillRect(0, 0, 60, 40);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    await new Promise(d => setTimeout(d, 200));
    return { size: window.mask.size(), canvasVisible: !document.getElementById('canvas').hidden };
  });
  r.check('MK-U1（Ctrl+V 相当で画像が取り込まれる）',
    eq(u1.size, { w: 60, h: 40 }) && u1.canvasVisible, JSON.stringify(u1));

  /* ========== MK-U2: PNG コピー（ClipboardItem を捕捉） ========== */
  const u2 = await page.evaluate(async () => {
    const out = { types: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async items => { out.types = items[0].types.slice(); } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return { types: out.types, label: document.getElementById('copy-btn').textContent };
  });
  r.check('MK-U2（PNG コピー: image/png の ClipboardItem・✓ 表示・実クリップボードに書かない）',
    Array.isArray(u2.types) && u2.types.includes('image/png') && u2.label === '✓ コピーしました',
    JSON.stringify(u2));

  /* ========== MK-U3: 取り込みガード（6,000px 超） ========== */
  const u3 = await page.evaluate(async () => {
    const before = window.mask.size();
    const c = document.createElement('canvas');
    c.width = 6001; c.height = 10;
    c.getContext('2d').fillRect(0, 0, 6001, 10);
    const err = await window.mask.setImage(c.toDataURL('image/png')).then(() => null, e => String(e && e.message || e));
    const banner = document.getElementById('banner');
    return { before, after: window.mask.size(), banner: banner.textContent, warn: banner.className.includes('banner-warn') };
  });
  r.check('MK-U3（最大辺 6,000px 超は中止して理由表示・元画像は保持）',
    eq(u3.before, u3.after) && u3.warn && u3.banner.includes('上限'),
    JSON.stringify(u3));

  /* ========== MK-U4: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u4 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('MK-U4（幅390pxで横スクロールなし）', u4 === true, String(u4));

  /* ========== MK-U5: 選択ツールでドラッグ移動（UI 経路・座標スケーリング込み） ========== */
  await loadFixture();
  const u5m = await page.evaluate(async () => {
    const m = window.mask;
    if (!m.selectedIndex) return { missing: true };
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    const radio = document.querySelector('input[name="tool"][value="select"]');
    if (!radio) return { missing: true };
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const canvas = document.getElementById('canvas');
    const r = canvas.getBoundingClientRect();
    const pt = (x, y) => ({
      clientX: r.left + x * r.width / canvas.width,
      clientY: r.top + y * r.height / canvas.height,
      bubbles: true, pointerId: 1,
    });
    canvas.dispatchEvent(new PointerEvent('pointerdown', pt(15, 15)));
    canvas.dispatchEvent(new PointerEvent('pointermove', pt(45, 15)));
    canvas.dispatchEvent(new PointerEvent('pointerup', pt(45, 15)));
    return { old: m.pixelAt(12, 15), now: m.pixelAt(45, 15), sel: m.selectedIndex() };
  });
  r.check('MK-U5（選択ツールのドラッグで図形が移動・選択は維持）',
    !u5m.missing && eq(u5m.old, [24, 30, 100, 255]) && eq(u5m.now, [0, 0, 0, 255]) && u5m.sel === 0,
    JSON.stringify(u5m));

  /* ========== MK-U6: 選択枠はオーバーレイのみ（PNG に混入しない） ========== */
  const u6m = await page.evaluate(() => {
    const overlay = document.getElementById('overlay');
    if (!overlay) return { missing: true };
    const od = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
    let marks = 0;
    for (let i = 3; i < od.length; i += 4) if (od[i] > 0) marks++;
    // 破線が乗るはずの位置（図形 x=40..60 の左外 3px）— メインキャンバスは元画像のまま
    return { marks, ringPixel: window.mask.pixelAt(37, 15) };
  });
  r.check('MK-U6（選択枠はオーバーレイに描かれ、メインキャンバスの画素は不変）',
    !u6m.missing && u6m.marks > 0 && eq(u6m.ringPixel, [74, 30, 100, 255]),
    JSON.stringify(u6m));

  /* ========== MK-U8: Escape で選択解除（編集中でないとき） ========== */
  const u8m = await page.evaluate(() => {
    if (!window.mask.selectedIndex) return { missing: true };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const overlay = document.getElementById('overlay');
    const od = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
    let marks = 0;
    for (let i = 3; i < od.length; i += 4) if (od[i] > 0) marks++;
    return { sel: window.mask.selectedIndex(), marks };
  });
  r.check('MK-U8（Escape で選択解除・オーバーレイが空になる）',
    !u8m.missing && u8m.sel === null && u8m.marks === 0, JSON.stringify(u8m));

  /* ========== Delete で選択図形を削除（MK-09 の UI 経路） ========== */
  const u9m = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectAt) return { missing: true };
    m.selectAt(45, 15);   // MK-U5 で動かした図形
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    return { count: m.opsCount(), restored: m.pixelAt(45, 15) };
  });
  r.check('Delete キーで選択図形を削除（画素復元）',
    !u9m.missing && u9m.count === 0 && eq(u9m.restored, [90, 30, 100, 255]), JSON.stringify(u9m));

  /* ========== MK-U7（v3 再定義）: 入力要素フォーカス中の Backspace では消えない ========== */
  const u7t = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    m.selectAt(15, 15);
    const sel0 = m.selectedIndex();
    const ms = document.getElementById('mosaic-size');
    ms.focus();
    ms.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    const res = { sel0, count: m.opsCount(), sel: m.selectedIndex() };
    ms.blur();
    return res;
  });
  r.check('MK-U7（入力要素フォーカス中の Backspace で図形が消えない・選択も維持）',
    u7t.sel0 === 0 && u7t.count === 1 && u7t.sel === 0, JSON.stringify(u7t));

  /* ========== MK-U9: テキストのその場編集（クリック → 入力 → blur 確定） ========== */
  await loadFixture();
  const u9t = await page.evaluate(async () => {
    const m = window.mask;
    const ed = document.getElementById('text-editor');
    if (!ed) return { missing: true };
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 40)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(10, 40)));
    const opened = { hidden: ed.hidden, focused: document.activeElement === ed };
    ed.value = '機密A\nB\n';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new Event('blur'));
    await new Promise(d => setTimeout(d, 100));
    return {
      opened,
      count: m.opsCount(),
      line1: m.countRed(5, 24, 90, 22),
      line2: m.countRed(5, 50, 90, 22),
      trimmed: m.hitTest(12, 80) === null && m.hitTest(12, 68) === 0,   // 3行分の高さは無い = 末尾改行除去
      sel: m.selectedIndex(),
      tool: document.querySelector('input[name="tool"]:checked').value,
      edHidden: ed.hidden,
    };
  });
  r.check('MK-U9（その場編集: 開いてフォーカス・blur 確定・末尾改行除去・自動選択＋選択ツール復帰）',
    !u9t.missing && u9t.opened.hidden === false && u9t.opened.focused === true
    && u9t.count === 1 && u9t.line1 > 0 && u9t.line2 > 0 && u9t.trimmed === true
    && u9t.sel === 0 && u9t.tool === 'select' && u9t.edHidden === true,
    JSON.stringify(u9t));

  /* ========== MK-U10: ダブルクリック再編集（編集中は非描画・Esc 確定・2度目の Esc で解除） ========== */
  const u10t = await page.evaluate(async () => {
    const m = window.mask;
    const ed = document.getElementById('text-editor');
    if (!ed) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true });
    const before = m.countRed(5, 20, 90, 55) > 0;
    cv.dispatchEvent(new MouseEvent('dblclick', pt(12, 38)));
    const during = {
      hidden: ed.hidden, value: ed.value,
      redGone: m.countRed(5, 20, 90, 55) === 0,
      sel: m.selectedIndex(),
    };
    ed.value = '修正済';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    const after = { hidden: ed.hidden, red: m.countRed(5, 24, 90, 22) > 0, sel: m.selectedIndex() };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { before, during, after, sel2: m.selectedIndex() };
  });
  r.check('MK-U10（再編集: 既存文言・編集中は非描画/枠なし・Esc 確定＋選択・2度目の Esc で解除）',
    !u10t.missing && u10t.before === true && u10t.during.hidden === false && u10t.during.value === '機密A\nB'
    && u10t.during.redGone === true && u10t.during.sel === null
    && u10t.after.hidden === true && u10t.after.red === true && u10t.after.sel === 0
    && u10t.sel2 === null,
    JSON.stringify(u10t));

  /* ========== MK-U11: 空で確定（新規は作らない・既存は削除 → undo で復活） ========== */
  const u11t = await page.evaluate(async () => {
    const m = window.mask;
    const ed = document.getElementById('text-editor');
    if (!ed) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const count0 = m.opsCount();
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(70, 20)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(70, 20)));
    ed.dispatchEvent(new Event('blur'));
    await new Promise(d => setTimeout(d, 50));
    const afterNewEmpty = m.opsCount();
    setTool('select');
    cv.dispatchEvent(new MouseEvent('dblclick', pt(12, 38)));
    ed.value = '';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    const afterEmptied = { count: m.opsCount(), sel: m.selectedIndex() };
    m.undo();
    const afterUndo = { count: m.opsCount(), red: m.countRed(5, 24, 90, 22) > 0 };
    return { count0, afterNewEmpty, afterEmptied, afterUndo };
  });
  r.check('MK-U11（空で確定: 新規は作らない・既存は削除・undo で復活）',
    !u11t.missing && u11t.count0 === 1 && u11t.afterNewEmpty === 1
    && u11t.afterEmptied.count === 0 && u11t.afterEmptied.sel === null
    && u11t.afterUndo.count === 1 && u11t.afterUndo.red === true,
    JSON.stringify(u11t));

  /* ========== MK-U12: 描画後の自動選択＋ツール復帰（連続描画オフ/オン） ========== */
  await loadFixture();
  const u12t = await page.evaluate(() => {
    const m = window.mask;
    if (!document.getElementById('keep-tool')) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const drag = (a, b) => {
      cv.dispatchEvent(new PointerEvent('pointerdown', pt(a[0], a[1])));
      cv.dispatchEvent(new PointerEvent('pointermove', pt(b[0], b[1])));
      cv.dispatchEvent(new PointerEvent('pointerup', pt(b[0], b[1])));
    };
    setTool('fill');
    drag([60, 60], [80, 80]);
    const after1 = { tool: document.querySelector('input[name="tool"]:checked').value,
                     sel: m.selectedIndex(), count: m.opsCount() };
    document.getElementById('keep-tool').checked = true;
    setTool('fill');
    drag([10, 60], [25, 75]);
    const after2 = { tool: document.querySelector('input[name="tool"]:checked').value,
                     sel: m.selectedIndex(), count: m.opsCount() };
    document.getElementById('keep-tool').checked = false;
    return { after1, after2 };
  });
  r.check('MK-U12（描画後: 自動選択＋選択ツール復帰・連続描画オンならツール維持で選択なし）',
    !u12t.missing
    && u12t.after1.tool === 'select' && u12t.after1.sel === 0 && u12t.after1.count === 1
    && u12t.after2.tool === 'fill' && u12t.after2.sel === null && u12t.after2.count === 2,
    JSON.stringify(u12t));

  /* ========== MK-U13: 矢印キーのナッジ（連続は1手） ========== */
  const u13t = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    m.selectAt(15, 15);
    const key = (k, shift) => document.dispatchEvent(new KeyboardEvent('keydown',
      { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
    key('ArrowRight'); key('ArrowRight'); key('ArrowRight', true);   // +12px
    const afterMove = { at: m.pixelAt(25, 15), old: m.pixelAt(15, 15) };
    m.undo();
    const afterUndo = { at: m.pixelAt(15, 15), edge: m.pixelAt(35, 15), count: m.opsCount() };
    return { afterMove, afterUndo };
  });
  r.check('MK-U13（ナッジ: →→Shift+→ で +12px・undo 1回で全部戻る）',
    eq(u13t.afterMove.at, [0, 0, 0, 255]) && eq(u13t.afterMove.old, [30, 30, 100, 255])
    && eq(u13t.afterUndo.at, [0, 0, 0, 255]) && eq(u13t.afterUndo.edge, [70, 30, 100, 255])
    && u13t.afterUndo.count === 1,
    JSON.stringify(u13t));

  /* ========== MK-U14: Cmd+Z は Undo・Cmd+Shift+Z は発火しない ========== */
  const u14t = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    const afterShift = m.opsCount();
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
    const afterZ = m.opsCount();
    return { afterShift, afterZ };
  });
  r.check('MK-U14（Cmd+Shift+Z では Undo しない・Cmd+Z で Undo）',
    u14t.afterShift === 1 && u14t.afterZ === 0, JSON.stringify(u14t));

  /* ========== MK-U15: カーソル（ハンドル/本体/空白/描画ツール） ========== */
  const u15t = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'fill', x: 30, y: 30, w: 40, h: 40 });
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const move = (x, y) => cv.dispatchEvent(new PointerEvent('pointermove', pt(x, y)));
    setTool('select');
    m.selectAt(50, 50);
    move(70, 70); const seCur = cv.style.cursor;
    move(50, 50); const bodyCur = cv.style.cursor;
    move(90, 90); const emptyCur = cv.style.cursor;
    setTool('mosaic'); const drawCur = cv.style.cursor;
    return { seCur, bodyCur, emptyCur, drawCur };
  });
  r.check('MK-U15（カーソル: se=nwse-resize・本体=move・空白=default・描画=crosshair）',
    u15t.seCur === 'nwse-resize' && u15t.bodyCur === 'move'
    && u15t.emptyCur === 'default' && u15t.drawCur === 'crosshair',
    JSON.stringify(u15t));

  /* ========== MK-U17: ハンドルの pointer ドラッグでリサイズ（UI 経路） ========== */
  const u17t = await page.evaluate(() => {
    const m = window.mask;
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setTool('select');
    m.selectAt(50, 50);                                   // fill 30..70（MK-U15 の図形）
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(70, 70)));   // se ハンドル
    cv.dispatchEvent(new PointerEvent('pointermove', pt(85, 85)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(85, 85)));
    const grown = m.pixelAt(80, 80);
    const count = m.opsCount();
    m.undo();
    const back = m.pixelAt(80, 80);
    return { grown, count, back };
  });
  r.check('MK-U17（ハンドルドラッグで拡大・undo 1回で戻る）',
    eq(u17t.grown, [0, 0, 0, 255]) && u17t.count === 1 && eq(u17t.back, [160, 160, 100, 255]),
    JSON.stringify(u17t));

  /* ========== MK-U18: 連続描画オンならテキストの連続配置（確定と同じクリックで次が開く） ========== */
  const u18t = await page.evaluate(async () => {
    const m = window.mask;
    const ed = document.getElementById('text-editor');
    if (!ed) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    m.clearOps();
    document.getElementById('keep-tool').checked = true;
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 40)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(10, 40)));
    ed.value = 'A1';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(60, 20)));   // 確定＋次のボックス
    cv.dispatchEvent(new PointerEvent('pointerup', pt(60, 20)));
    const res = {
      count: m.opsCount(),
      red: m.countRed(5, 24, 60, 22) > 0,
      edVisible: !ed.hidden,
      edEmpty: ed.value === '',
      tool: document.querySelector('input[name="tool"]:checked').value,
    };
    ed.dispatchEvent(new Event('blur'));   // 空なので何も作らない
    document.getElementById('keep-tool').checked = false;
    await new Promise(d => setTimeout(d, 50));
    return res;
  });
  r.check('MK-U18（連続描画オン: 1クリックで前を確定し次の編集ボックスが開く・ツール維持）',
    !u18t.missing && u18t.count === 1 && u18t.red === true
    && u18t.edVisible === true && u18t.edEmpty === true && u18t.tool === 'text',
    JSON.stringify(u18t));

  /* ========== MK-U19: 粒度セレクトは選択中のモザイクに適用 ========== */
  const u19t = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'mosaic', x: 40, y: 40, w: 40, h: 40, size: 8 });
    m.selectAt(50, 50);
    // 実セル幅は w / ceil(w/size): size8 → 8px（41 と 55 は別セル）、size24 → 20px（同一セル）
    const before = [m.pixelAt(41, 41), m.pixelAt(55, 41)];
    const ms = document.getElementById('mosaic-size');
    ms.value = '24';
    ms.dispatchEvent(new Event('change', { bubbles: true }));
    const after = [m.pixelAt(41, 41), m.pixelAt(55, 41)];
    const count = m.opsCount();
    m.undo();
    const undone = [m.pixelAt(41, 41), m.pixelAt(55, 41)];
    ms.value = '16';
    return { before, after, undone, count };
  });
  r.check('MK-U19（粒度変更が選択中のモザイクに適用・undo で1手戻る）',
    !eq(u19t.before[0], u19t.before[1]) && eq(u19t.after[0], u19t.after[1])
    && !eq(u19t.undone[0], u19t.undone[1]) && u19t.count === 1,
    JSON.stringify(u19t));

  /* ========== MK-U20: 縮小表示のエディタ（フォント下限・見切れなし・1行の高さ） ========== */
  const u20t = await page.evaluate(async () => {
    const m = window.mask;
    const ed = document.getElementById('text-editor');
    if (!ed) return { missing: true };
    const big = document.createElement('canvas');
    big.width = 3000; big.height = 1200;
    const bctx = big.getContext('2d');
    bctx.fillStyle = '#ffffff';
    bctx.fillRect(0, 0, 3000, 1200);
    await m.setImage(big.toDataURL('image/png'));
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(100, 100)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(100, 100)));
    ed.value = 'スケール確認テキストです長め';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    const er = ed.getBoundingClientRect();
    const res = {
      scale: rect.width / cv.width,
      font: parseFloat(getComputedStyle(ed).fontSize),
      noClip: ed.scrollWidth <= ed.clientWidth + 1,
      scrollLeft: ed.scrollLeft,
      oneLineHeight: er.height < 60,
    };
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    return res;
  });
  r.check('MK-U20（縮小表示: フォント下限12px・見切れなし・1行の箱は1行の高さ）',
    !u20t.missing && u20t.scale < 0.6 && u20t.font >= 12
    && u20t.noClip === true && u20t.scrollLeft === 0 && u20t.oneLineHeight === true,
    JSON.stringify(u20t));

  /* ========== MK-U21: ツールボタンにフォーカスが残っても図形操作が優先 ========== */
  const u21t = await page.evaluate(() => {
    const m = window.mask;
    m.clearOps();
    m.addOp({ type: 'fill', x: 100, y: 100, w: 200, h: 200 });
    m.selectAt(150, 150);
    const radio = document.querySelector('input[name="tool"][value="select"]');
    radio.checked = true;   // change は発火させない（クリックでフォーカスだけ残った状態を再現）
    radio.focus();
    const before = m.pixelAt(100, 150);
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    radio.dispatchEvent(ev);
    const afterMove = { px: m.pixelAt(100, 150), prevented: ev.defaultPrevented, sel: m.selectedIndex() };
    const kt = document.getElementById('keep-tool');
    kt.focus();
    const ev2 = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    kt.dispatchEvent(ev2);
    const afterDel = { count: m.opsCount(), prevented: ev2.defaultPrevented };
    kt.blur();
    return { before, afterMove, afterDel };
  });
  r.check('MK-U21（ラジオ/チェックにフォーカスが残っても矢印=ナッジ・Delete=削除が優先）',
    eq(u21t.before, [0, 0, 0, 255])
    && eq(u21t.afterMove.px, [255, 255, 255, 255]) && u21t.afterMove.prevented === true
    && u21t.afterMove.sel === 0
    && u21t.afterDel.count === 0 && u21t.afterDel.prevented === true,
    JSON.stringify(u21t));

  /* ========== MK-U16: 編集中のコピーは強制確定・取り込み中止は編集維持・成功は破棄 ========== */
  const u16t = await page.evaluate(async () => {
    const m = window.mask;
    const ed = document.getElementById('text-editor');
    if (!ed) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    m.clearOps();
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(100, 120)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(100, 120)));
    ed.value = '確定前';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    let wrote = false;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async () => { wrote = true; } },
    });
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 150));
    const afterCopy = { count: m.opsCount(), wrote, edHidden: ed.hidden,
                        red: m.countRed(90, 100, 120, 26) > 0 };
    // 編集中に上限超過の取り込み → 中止・編集は維持
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(200, 200)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(200, 200)));
    ed.value = '編集継続中';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    const over = document.createElement('canvas');
    over.width = 6001; over.height = 10;
    over.getContext('2d').fillRect(0, 0, 6001, 10);
    const rejected = await m.setImage(over.toDataURL('image/png')).then(() => false, () => true);
    const afterReject = { rejected, edVisible: !ed.hidden, val: ed.value };
    // 成功する取り込み → 破棄
    const ok = document.createElement('canvas');
    ok.width = 60; ok.height = 40;
    ok.getContext('2d').fillRect(0, 0, 60, 40);
    await m.setImage(ok.toDataURL('image/png'));
    const afterImage = { count: m.opsCount(), edHidden: ed.hidden,
                         tool: document.querySelector('input[name="tool"]:checked').value };
    return { afterCopy, afterReject, afterImage };
  });
  r.check('MK-U16（コピー前に強制確定・中止は編集維持・成功は破棄）',
    !u16t.missing
    && u16t.afterCopy.count === 1 && u16t.afterCopy.wrote === true
    && u16t.afterCopy.edHidden === true && u16t.afterCopy.red === true
    && u16t.afterReject.rejected === true && u16t.afterReject.edVisible === true
    && u16t.afterReject.val === '編集継続中'
    && u16t.afterImage.count === 0 && u16t.afterImage.edHidden === true
    && u16t.afterImage.tool === 'select',
    JSON.stringify(u16t));

  /* ========== MK-U22〜U24: 色パレット（描画・選択への適用・テキスト） ========== */
  await loadFixture();
  const u22t = await page.evaluate(() => {
    const m = window.mask;
    const sw = document.querySelector('input[name="color"][value="#2563eb"]');
    if (!sw) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    setTool('rect');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 10)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(40, 30)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(40, 30)));
    return { blue: m.countColor(8, 8, 36, 6, [0, 120, 0, 160, 180, 255]), count: m.opsCount() };
  });
  r.check('MK-U22（青スウォッチを選んで描いた枠が青い）',
    !u22t.missing && u22t.blue > 0 && u22t.count === 1, JSON.stringify(u22t));

  const u23t = await page.evaluate(() => {
    const m = window.mask;
    if (!document.querySelector('input[name="color"]')) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'rect', x: 10, y: 10, w: 30, h: 20 });                    // 赤
    m.addOp({ type: 'mosaic', x: 60, y: 60, w: 30, h: 30, size: 8 });
    const setColor = v => {
      const sw = document.querySelector('input[name="color"][value="' + v + '"]');
      sw.checked = true;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
    };
    m.selectAt(11, 15);                                                        // 枠の左辺
    setColor('#2563eb');
    const nowBlue = m.countColor(8, 8, 34, 6, [0, 120, 0, 160, 180, 255]) > 0;
    m.undo();
    const backRed = m.countRed(8, 8, 34, 6) > 0;
    // モザイク選択中は何も起きない（履歴も積まない → undo で枠の色変更前まで戻らない）
    m.selectAt(70, 70);
    const mosaicBefore = m.pixelAt(65, 65);
    setColor('#16a34a');
    const mosaicAfter = m.pixelAt(65, 65);
    setColor('#dd2222');
    return { nowBlue, backRed, mosaicUnchanged: JSON.stringify(mosaicBefore) === JSON.stringify(mosaicAfter) };
  });
  r.check('MK-U23（色は選択中の枠に適用され undo で戻る・モザイクには無効）',
    !u23t.missing && u23t.nowBlue === true && u23t.backRed === true && u23t.mosaicUnchanged === true,
    JSON.stringify(u23t));

  const u24t = await page.evaluate(async () => {
    const m = window.mask;
    if (!document.querySelector('input[name="color"]')) return { missing: true };
    const ed = document.getElementById('text-editor');
    m.clearOps();
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const green = document.querySelector('input[name="color"][value="#16a34a"]');
    green.checked = true;
    green.dispatchEvent(new Event('change', { bubbles: true }));
    setTool('text');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 40)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(10, 40)));
    ed.value = 'G';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    const g = m.countColor(5, 24, 30, 22, [0, 120, 120, 220, 0, 140]);   // 緑系
    document.querySelector('input[name="color"][value="#dd2222"]').checked = true;
    return { g, count: m.opsCount() };
  });
  r.check('MK-U24（緑を選んで確定したテキストが緑）',
    !u24t.missing && u24t.g > 0 && u24t.count === 1, JSON.stringify(u24t));

  /* ========== MK-U25: 現在ツールの押下状態が視覚的に判別できる ========== */
  const u25t = await page.evaluate(() => {
    const face = rd => {
      const label = rd.closest('label');
      const f = label && label.querySelector('.tb-face');
      return f ? getComputedStyle(f).backgroundColor : null;
    };
    const checked = document.querySelector('input[name="tool"]:checked');
    const other = Array.from(document.querySelectorAll('input[name="tool"]')).find(rd => !rd.checked);
    return { checkedBg: face(checked), otherBg: face(other) };
  });
  r.check('MK-U25（チェック中のツールの背景が未チェックと異なる）',
    u25t.checkedBg !== null && u25t.otherBg !== null && u25t.checkedBg !== u25t.otherBg,
    JSON.stringify(u25t));

  /* ========== MK-U26: キャンバスの中央寄せ（v5） ========== */
  await loadFixture();
  const u26t = await page.evaluate(() => {
    const wrap = document.getElementById('canvas-wrap');
    const main = document.querySelector('main');
    const w = wrap.getBoundingClientRect();
    const mn = main.getBoundingClientRect();
    const leftGap = w.left - mn.left;
    const rightGap = mn.right - w.right;
    return { leftGap, rightGap, diff: Math.abs(leftGap - rightGap) };
  });
  r.check('MK-U26（キャンバスが中央寄せ — 左右の余白がほぼ等しい）',
    u26t.leftGap > 20 && u26t.rightGap > 20 && u26t.diff < 8, JSON.stringify(u26t));

  /* ========== MK-U27: 太さ UI（描画時と選択への適用） ========== */
  const u27t = await page.evaluate(() => {
    const m = window.mask;
    const lw = document.getElementById('line-width');
    if (!lw || !m.opAt) return { missing: true };
    m.clearOps();
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    lw.value = '5';
    lw.dispatchEvent(new Event('change', { bubbles: true }));
    setTool('arrow');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 60)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(70, 60)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(70, 60)));
    const drawn = m.opAt(0).width;             // 太で描いた → 5
    lw.value = '2';
    lw.dispatchEvent(new Event('change', { bubbles: true }));   // 描画確定で自動選択されている → 適用
    const applied = m.opAt(0).width;
    m.undo();
    const undone = m.opAt(0) && m.opAt(0).width;
    lw.value = '3';
    return { drawn, applied, undone };
  });
  r.check('MK-U27（太さ: 描画時に反映・選択中の変更が効き undo で戻る）',
    !u27t.missing && u27t.drawn === 5 && u27t.applied === 2 && u27t.undone === 5,
    JSON.stringify(u27t));

  /* ========== MK-U28: Cmd+D 複製 ========== */
  const u28t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.opAt) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 20, h: 20 });
    // 未選択 → 何もしない・preventDefault もしない
    const evNone = new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(evNone);
    const noneCase = { count: m.opsCount(), prevented: evNone.defaultPrevented };
    m.selectAt(15, 15);
    const ev = new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    const dup = m.opAt(1);
    const dupCase = { count: m.opsCount(), prevented: ev.defaultPrevented,
                      sel: m.selectedIndex(), x: dup && dup.x, y: dup && dup.y };
    m.undo();
    const undone = m.opsCount();
    return { noneCase, dupCase, undone };
  });
  r.check('MK-U28（Cmd+D: 選択中は +10,+10 に複製し複製側を選択・未選択は何もしない）',
    !u28t.missing && u28t.noneCase.count === 1 && u28t.noneCase.prevented === false
    && u28t.dupCase.count === 2 && u28t.dupCase.prevented === true
    && u28t.dupCase.sel === 1 && u28t.dupCase.x === 20 && u28t.dupCase.y === 20
    && u28t.undone === 1,
    JSON.stringify(u28t));

  /* ========== MK-U29: Shift 制約（正方形・45°・移動の軸ロック） ========== */
  const u29t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.opAt) return { missing: true };
    m.clearOps();
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y, shift) => ({ clientX: rect.left + x * rect.width / cv.width,
                                   clientY: rect.top + y * rect.height / cv.height,
                                   bubbles: true, pointerId: 1, shiftKey: !!shift });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setTool('fill');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 10)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(50, 30, true)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(50, 30, true)));
    const sq = m.opAt(0);
    setTool('arrow');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(10, 60)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(60, 72, true)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(60, 72, true)));
    const ar = m.opAt(1);
    // 移動の軸ロック: 正方形（10..50）を中心から Shift ドラッグ（+25,+11 → x のみ）。
    // 開始点は角ハンドルの判定域（6px）を避けて中心にする
    setTool('select');
    m.selectAt(30, 30);
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(30, 30)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(55, 41, true)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(55, 41, true)));
    const moved = m.opAt(0);
    return { sq: { w: sq.w, h: sq.h }, ar: { y1: ar.y1, y2: ar.y2 }, moved: { x: moved.x, y: moved.y } };
  });
  r.check('MK-U29（Shift: 正方形 w=h・矢印45°スナップ（水平）・移動は軸ロック）',
    !u29t.missing && u29t.sq.w === 40 && u29t.sq.h === 40
    && u29t.ar.y1 === 60 && u29t.ar.y2 === 60
    && u29t.moved.x === 35 && u29t.moved.y === 10,
    JSON.stringify(u29t));

  /* ========== MK-17: 番号スタンプ（採番・色・選択移動） ========== */
  await loadFixture();
  const mk17 = await page.evaluate(() => {
    const m = window.mask;
    if (!document.querySelector('input[name="tool"][value="badge"]')) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    document.getElementById('keep-tool').checked = true;   // 連続で置く
    setTool('badge');
    const click = (x, y) => {
      cv.dispatchEvent(new PointerEvent('pointerdown', pt(x, y)));
      cv.dispatchEvent(new PointerEvent('pointerup', pt(x, y)));
    };
    click(30, 30);
    click(70, 30);
    const n12 = [m.opAt(0).n, m.opAt(1).n];
    // 円がパレット色（既定の赤）で塗られている（中心の少し上 — 数字の白を避ける）
    const circleRed = m.countRed(22, 14, 16, 10);
    // 1番を削除 → 次に置くのは 3（振り直さない — MK-Q16）
    setTool('select');
    m.selectAt(30, 30);
    m.deleteSelected();
    document.getElementById('keep-tool').checked = true;
    setTool('badge');
    click(30, 70);
    const nextN = m.opAt(1).n;
    // 選択・移動が効く
    setTool('select');
    const sel = m.selectAt(70, 30);
    const moved = m.moveSelected(10, 0);
    document.getElementById('keep-tool').checked = false;
    return { n12, circleRed, nextN, sel, moved, x: m.opAt(0).x };
  });
  r.check('MK-17（番号: 採番1,2・削除後は3・円は赤・選択/移動できる）',
    !mk17.missing && eq(mk17.n12, [1, 2]) && mk17.circleRed > 0 && mk17.nextN === 3
    && mk17.sel === 0 && mk17.moved === true && mk17.x === 80,
    JSON.stringify(mk17));

  /* ========== MK-U30: 切り抜き（プレビュー → 確定・Undo 対象外） ========== */
  await loadFixture();
  const u30t = await page.evaluate(async () => {
    const m = window.mask;
    if (!document.querySelector('input[name="tool"][value="crop"]')) return { missing: true };
    m.addOp({ type: 'fill', x: 30, y: 30, w: 10, h: 10 });
    const cv = document.getElementById('canvas');
    const overlay = document.getElementById('overlay');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setTool('crop');
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(20, 20)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(80, 70)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(80, 70)));
    // プレビューはオーバーレイのみ（メインキャンバスは不変）＋確定ボタンが出る
    const od = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
    let marks = 0;
    for (let i = 3; i < od.length; i += 4) if (od[i] > 0) marks++;
    const btn = document.getElementById('crop-confirm');
    const preview = { marks, mainUntouched: JSON.stringify(m.pixelAt(10, 10)) === JSON.stringify([20, 20, 100, 255]),
                      hasBtn: !!btn, sizeBefore: m.size() };
    btn.click();
    await new Promise(d => setTimeout(d, 50));
    const afterCrop = {
      size: m.size(),
      opShifted: m.opAt(0).x === 10 && m.opAt(0).y === 10,   // 30,30 − 20,20
      pixel: m.pixelAt(15, 15),                               // 移動後の fill 内 → 黒
    };
    m.undo();   // 履歴リセット済み → 何も起きない
    const afterUndo = { size: m.size(), count: m.opsCount() };
    return { preview, afterCrop, afterUndo };
  });
  r.check('MK-U30（切り抜き: プレビューはオーバーレイのみ → 確定で縮み座標シフト・Undo 対象外）',
    !u30t.missing && u30t.preview.marks > 0 && u30t.preview.mainUntouched === true
    && u30t.preview.hasBtn === true && eq(u30t.preview.sizeBefore, { w: 100, h: 100 })
    && eq(u30t.afterCrop.size, { w: 60, h: 50 }) && u30t.afterCrop.opShifted === true
    && eq(u30t.afterCrop.pixel, [0, 0, 0, 255])
    && eq(u30t.afterUndo.size, { w: 60, h: 50 }) && u30t.afterUndo.count === 1,
    JSON.stringify(u30t));

  /* ========== MK-U31: 切り抜きのキャンセル（Esc） ========== */
  await loadFixture();
  const u31t = await page.evaluate(() => {
    const m = window.mask;
    if (!document.querySelector('input[name="tool"][value="crop"]')) return { missing: true };
    const cv = document.getElementById('canvas');
    const overlay = document.getElementById('overlay');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    const rd = document.querySelector('input[name="tool"][value="crop"]');
    rd.checked = true;
    rd.dispatchEvent(new Event('change', { bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(20, 20)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(80, 70)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(80, 70)));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const od = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
    let marks = 0;
    for (let i = 3; i < od.length; i += 4) if (od[i] > 0) marks++;
    return { size: m.size(), marks, bannerHidden: document.getElementById('banner').hidden };
  });
  r.check('MK-U31（切り抜き: Esc でキャンセル — プレビューとバナーが消え画像は不変）',
    !u31t.missing && eq(u31t.size, { w: 100, h: 100 }) && u31t.marks === 0
    && u31t.bannerHidden === true,
    JSON.stringify(u31t));

  /* ========== MK-U32〜U37: 複数選択（v6） ========== */
  await loadFixture();
  const u32t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndices) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 15, h: 15 });
    m.addOp({ type: 'rect', x: 40, y: 10, w: 20, h: 15 });
    m.addOp({ type: 'badge', x: 85, y: 85, n: 1 });
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y, shift) => ({ clientX: rect.left + x * rect.width / cv.width,
                                   clientY: rect.top + y * rect.height / cv.height,
                                   bubbles: true, pointerId: 1, shiftKey: !!shift });
    const setTool = v => {
      const rd = document.querySelector('input[name="tool"][value="' + v + '"]');
      rd.checked = true;
      rd.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setTool('select');
    // ラバーバンド: fill と rect を内包（badge は外）
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(4, 4)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(66, 40)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(66, 40)));
    const band = m.selectedIndices();
    const noHandle = m.handleAt(25, 25);   // 複数選択中はハンドルなし
    const single = m.selectedIndex();      // 単独でない → null
    // 空白クリックで全解除
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(90, 40)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(90, 40)));
    const cleared = m.selectedIndices();
    return { band, noHandle, single, cleared };
  });
  r.check('MK-U32（ラバーバンド: 内包した2つだけ選択・複数中は handleAt null・空白で解除）',
    !u32t.missing && eq(u32t.band, [0, 1]) && u32t.noHandle === null
    && u32t.single === null && eq(u32t.cleared, []),
    JSON.stringify(u32t));

  const u33t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndices) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y, shift) => ({ clientX: rect.left + x * rect.width / cv.width,
                                   clientY: rect.top + y * rect.height / cv.height,
                                   bubbles: true, pointerId: 1, shiftKey: !!shift });
    const click = (x, y, shift) => {
      cv.dispatchEvent(new PointerEvent('pointerdown', pt(x, y, shift)));
      cv.dispatchEvent(new PointerEvent('pointerup', pt(x, y, shift)));
    };
    click(15, 15);                 // fill 単独
    const one = m.selectedIndices();
    click(50, 12, true);           // rect の上辺 — Shift で追加
    const two = m.selectedIndices();
    click(15, 15, true);           // Shift で fill を除外
    const toggled = m.selectedIndices();
    return { one, two, toggled };
  });
  r.check('MK-U33（Shift+クリック: 追加 → 除外のトグル）',
    !u33t.missing && eq(u33t.one, [0]) && eq(u33t.two, [0, 1]) && eq(u33t.toggled, [1]),
    JSON.stringify(u33t));

  const u34t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndices) return { missing: true };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x * rect.width / cv.width,
                            clientY: rect.top + y * rect.height / cv.height, bubbles: true, pointerId: 1 });
    // fill(10,10) と rect(40,10) をラバーバンドで選択して一括ドラッグ
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(4, 4)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(66, 40)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(66, 40)));
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(17, 17)));    // fill の中から掴む
    cv.dispatchEvent(new PointerEvent('pointermove', pt(37, 17)));    // +20, 0
    cv.dispatchEvent(new PointerEvent('pointerup', pt(37, 17)));
    const afterDrag = { fill: m.opAt(0).x, rect: m.opAt(1).x, sel: m.selectedIndices() };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const afterNudge = { fillY: m.opAt(0).y, rectY: m.opAt(1).y };
    m.undo();   // ナッジが1手で戻る
    const undoNudge = { fillY: m.opAt(0).y, rectY: m.opAt(1).y };
    m.undo();   // ドラッグが1手で戻る
    const undoDrag = { fill: m.opAt(0).x, rect: m.opAt(1).x };
    return { afterDrag, afterNudge, undoNudge, undoDrag };
  });
  r.check('MK-U34（一括移動: ドラッグで両方 +20・ナッジも一括・それぞれ1手 Undo）',
    !u34t.missing && u34t.afterDrag.fill === 30 && u34t.afterDrag.rect === 60 && eq(u34t.afterDrag.sel, [0, 1])
    && u34t.afterNudge.fillY === 11 && u34t.afterNudge.rectY === 11
    && u34t.undoNudge.fillY === 10 && u34t.undoNudge.rectY === 10
    && u34t.undoDrag.fill === 10 && u34t.undoDrag.rect === 40,
    JSON.stringify(u34t));

  const u35t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndices) return { missing: true };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
    const all = m.selectedIndices();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    const afterDelete = m.opsCount();
    m.undo();
    const afterUndo = m.opsCount();
    return { all, afterDelete, afterUndo };
  });
  r.check('MK-U35（Cmd+A 全選択 → Delete 一括削除が1手・undo で全復活）',
    !u35t.missing && eq(u35t.all, [0, 1, 2]) && u35t.afterDelete === 0 && u35t.afterUndo === 3,
    JSON.stringify(u35t));

  const u36t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndices) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'fill', x: 10, y: 10, w: 15, h: 15 });
    m.addOp({ type: 'badge', x: 40, y: 40, n: 1 });
    m.addOp({ type: 'badge', x: 70, y: 40, n: 2 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true }));
    return {
      count: m.opsCount(),
      sel: m.selectedIndices(),
      cloneFill: { x: m.opAt(3).x, y: m.opAt(3).y },
      cloneNs: [m.opAt(4).n, m.opAt(5).n],   // バッジは順に次番号（3,4）
    };
  });
  r.check('MK-U36（一括複製: 全部 +10,+10・複製側を選択・バッジは順に次番号）',
    !u36t.missing && u36t.count === 6 && eq(u36t.sel, [3, 4, 5])
    && u36t.cloneFill.x === 20 && u36t.cloneFill.y === 20
    && eq(u36t.cloneNs, [3, 4]),
    JSON.stringify(u36t));

  const u37t = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndices) return { missing: true };
    m.clearOps();
    m.addOp({ type: 'rect', x: 10, y: 10, w: 20, h: 15 });
    m.addOp({ type: 'arrow', x1: 40, y1: 60, x2: 90, y2: 60 });
    m.addOp({ type: 'mosaic', x: 60, y: 10, w: 20, h: 20, size: 8 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
    const blue = document.querySelector('input[name="color"][value="#2563eb"]');
    blue.checked = true;
    blue.dispatchEvent(new Event('change', { bubbles: true }));
    const colors = [m.opAt(0).color, m.opAt(1).color, m.opAt(2).color];
    const lw = document.getElementById('line-width');
    lw.value = '5';
    lw.dispatchEvent(new Event('change', { bubbles: true }));
    const widths = [m.opAt(0).width, m.opAt(1).width, m.opAt(2).width];
    m.undo();   // 太さが1手で戻る（width 未指定で作った op なので undefined に戻る）
    const undoneW = [m.opAt(0).width, m.opAt(1).width];
    document.querySelector('input[name="color"][value="#dd2222"]').checked = true;
    lw.value = '3';
    return { colors, widths, undoneW };
  });
  r.check('MK-U37（一括書式: 色/太さは該当図形にだけ・mosaic 不変・各1手 Undo）',
    !u37t.missing && eq(u37t.colors, ['#2563eb', '#2563eb', null])
    && eq(u37t.widths, [5, 5, null])
    && eq(u37t.undoneW, [null, null]),
    JSON.stringify(u37t));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent));
  await page.click('ul.tool-list .tool-name:text-is("Mask Image")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「画像」カテゴリから遷移でき title が命名規約どおり',
    hubCats.includes('画像') && hubTitle === 'Mask Image (mask)', JSON.stringify([hubCats, hubTitle]));

  await browser.close();
  r.report('mask（docs/specs/mask.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
