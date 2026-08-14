'use strict';
/* 目的: docs/specs/mask.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/mask.js  /  ./test/run mask

   照合するID: MK-01〜10（操作モデル・選択編集）＋ MK-U1〜U8（UI 経路）＋ハブ導線
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

  /* ========== MK-U7: 入力欄フォーカス中の Backspace では消えない ========== */
  const u7m = await page.evaluate(() => {
    const m = window.mask;
    if (!m.selectedIndex) return { missing: true };
    const before = m.opsCount();
    const ti = document.getElementById('text-input');
    ti.focus();
    ti.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    return { before, after: m.opsCount(), sel: m.selectedIndex() };
  });
  r.check('MK-U7（テキスト入力中の Backspace で図形が消えない・選択も維持）',
    !u7m.missing && u7m.before === 1 && u7m.after === 1 && u7m.sel === 0, JSON.stringify(u7m));

  /* ========== MK-U8: Escape で選択解除 ========== */
  const u8m = await page.evaluate(() => {
    if (!window.mask.selectedIndex) return { missing: true };
    document.getElementById('text-input').blur();
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

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent));
  await page.click('ul.tool-list a:text-is("Mask")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「画像」カテゴリから遷移できる（title は表示名のみ — 英名と同じ）',
    hubCats.includes('画像') && hubTitle === 'Mask', JSON.stringify([hubCats, hubTitle]));

  await browser.close();
  r.report('mask（docs/specs/mask.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
