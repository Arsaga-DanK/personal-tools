'use strict';
/* 目的: docs/specs/board.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/board.js  /  ./test/run board

   照合するID: BD-01〜09（モデル・結線・md・保存）＋ BD-U1〜U8（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/board.md。期待値を変えるときは spec を先に直す。
   pagehide フラッシュを持つため、localStorage 注入は保存を止めてから（verification-notes §4）。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/board.html'));

  const ready = await page.evaluate(() => !!(window.board && window.board.addNote));
  r.check('前提（window.board フックがある）', ready, String(ready));

  if (ready) {
    /* ========== BD-01: 追加・採番・クランプ ========== */
    const bd01 = await page.evaluate(() => {
      const b = window.board;
      b.clearAll();
      const id1 = b.addNote(100, 100, 'A');
      const id2 = b.addNote(300, 100, 'B', '#bfdbfe');
      const id3 = b.addNote(5000, -50, 'C');   // キャンバス外 → クランプ
      const notes = b.notes();
      return { id1, id2, id3, colors: [notes[0].color, notes[1].color],
               clamped: { x: notes[2].x, y: notes[2].y } };
    });
    r.check('BD-01（採番は最大値+1・色が入る・キャンバス外はクランプ）',
      bd01.id1 === 1 && bd01.id2 === 2 && bd01.id3 === 3
      && bd01.colors[0] === '#fef08a' && bd01.colors[1] === '#bfdbfe'
      && bd01.clamped.x <= 1600 - 168 && bd01.clamped.y === 0,
      JSON.stringify(bd01));

    /* ========== BD-02: 折返しと自動高さ（絵文字も落ちない） ========== */
    const bd02 = await page.evaluate(() => {
      const b = window.board;
      b.clearAll();
      const short = b.addNote(100, 100, '短い');
      const long = b.addNote(400, 100, '長い日本語のテキストで折り返しが必要になるはずの付箋🎉絵文字も混ぜて安全性を確かめる');
      // 高さの差は hitTest で観測: 1行の付箋は y+90 に届かない・折返した付箋は届く
      return {
        shortTall: b.hitTest(150, 190),
        longTall: b.hitTest(450, 190),
        longIsNote: b.hitTest(450, 120),
      };
    });
    r.check('BD-02（折返しで自動高さ・絵文字入りでも落ちない）',
      bd02.shortTall === null
      && bd02.longTall !== null && bd02.longTall.type === 'note'
      && bd02.longIsNote !== null && bd02.longIsNote.id === 2,
      JSON.stringify(bd02));

    /* ========== BD-03: 結線（自己ループ・重複は無視） ========== */
    const bd03 = await page.evaluate(() => {
      const b = window.board;
      b.clearAll();
      b.addNote(100, 100, 'A');
      b.addNote(400, 100, 'B');
      return {
        ok: b.connect(1, 2),
        self: b.connect(1, 1),
        dup: b.connect(2, 1),   // 無向なので逆順も重複
        count: b.connectors().length,
      };
    });
    r.check('BD-03（結線: 1本だけ・自己ループ/重複は false）',
      bd03.ok === true && bd03.self === false && bd03.dup === false && bd03.count === 1,
      JSON.stringify(bd03));

    /* ========== BD-04: 削除は線を道連れ・undo 1手で両方戻る ========== */
    const bd04 = await page.evaluate(() => {
      const b = window.board;
      b.selectAt(150, 110);   // note1 の中
      b.deleteSelected();
      const afterDelete = { notes: b.notes().length, conns: b.connectors().length };
      b.undo();
      const afterUndo = { notes: b.notes().length, conns: b.connectors().length };
      return { afterDelete, afterUndo };
    });
    r.check('BD-04（削除は線を道連れ・undo 1手で付箋も線も戻る）',
      bd04.afterDelete.notes === 1 && bd04.afterDelete.conns === 0
      && bd04.afterUndo.notes === 2 && bd04.afterUndo.conns === 1,
      JSON.stringify(bd04));

    /* ========== BD-05: 複製は線を引き継がない・id は最大値+1 ========== */
    const bd05 = await page.evaluate(() => {
      const b = window.board;
      b.selectAt(150, 110);   // note1（線つき）
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true, cancelable: true }));
      const notes = b.notes();
      const clone = notes[notes.length - 1];
      return { count: notes.length, conns: b.connectors().length,
               clone: { id: clone.id, x: clone.x, y: clone.y }, sel: b.selectedIds() };
    });
    r.check('BD-05（Cmd+D: +16,+16 に複製・線は引き継がない・新 id は最大値+1）',
      bd05.count === 3 && bd05.conns === 1
      && bd05.clone.id === 3 && bd05.clone.x === 116 && bd05.clone.y === 116
      && eq(bd05.sel, ['n3']),
      JSON.stringify(bd05));

    /* ========== BD-06: md 書き出し（読み順・継続行・つながり） ========== */
    const bd06 = await page.evaluate(() => {
      const b = window.board;
      b.clearAll();
      b.addNote(100, 100, '一行目\n二行目');
      b.addNote(400, 110, '右');
      b.addNote(100, 300, '下段');
      b.connect(1, 3);
      return b.buildMd({});
    });
    const want06 = ['- 一行目', '  二行目', '- 右', '- 下段', '', '## つながり', '- 一行目 ⇔ 下段'].join('\n');
    r.check('BD-06（md: 行バンドの読み順・継続行インデント・つながり節）',
      bd06 === want06, JSON.stringify({ got: bd06, want: want06 }));

    /* ========== BD-07: 色ごとに見出し（パレット順） ========== */
    const bd07 = await page.evaluate(() => {
      const b = window.board;
      b.clearAll();
      b.addNote(100, 100, '黄の付箋');
      b.addNote(400, 100, '青の付箋', '#bfdbfe');
      b.addNote(100, 300, '黄の下', '#fef08a');
      return b.buildMd({ byColor: true });
    });
    const want07 = ['## 黄', '- 黄の付箋', '- 黄の下', '', '## 青', '- 青の付箋'].join('\n');
    r.check('BD-07（md: 色ごとにパレット順の見出し・色内は読み順）',
      bd07 === want07, JSON.stringify({ got: bd07, want: want07 }));

    /* ========== BD-08: 保存 → reload で復元（履歴は保存しない） ========== */
    await page.evaluate(() => {
      const b = window.board;
      b.clearAll();
      b.addNote(120, 140, '保存確認');
      b.addNote(420, 140, '相方');
      b.connect(1, 2);
      window.dispatchEvent(new Event('pagehide'));   // フラッシュ
    });
    await page.reload();
    const bd08 = await page.evaluate(() => {
      const env = JSON.parse(localStorage.getItem('tools:board'));
      const b = window.board;
      const before = { notes: b.notes().length, conns: b.connectors().length };
      b.undo();   // 履歴は復元されない → 何も起きない
      return {
        before, tool: env && env.tool, v: env && env.v,
        hasHistory: !!(env && env.data && env.data.history),
        afterUndo: { notes: b.notes().length, conns: b.connectors().length },
        text: b.notes()[0] && b.notes()[0].text,
      };
    });
    r.check('BD-08（reload で notes/connectors 復元・履歴は保存されない）',
      bd08.before.notes === 2 && bd08.before.conns === 1
      && bd08.tool === 'board' && bd08.v === 1 && bd08.hasHistory === false
      && eq(bd08.afterUndo, { notes: 2, conns: 1 }) && bd08.text === '保存確認',
      JSON.stringify(bd08));

    /* ========== BD-09: 壊れた保存データは件数 warn で落とし残りは復元 ========== */
    await page.evaluate(() => {
      window.ToolStorage.save = () => true;   // フラッシュが注入値を上書きしないように（§4）
      localStorage.setItem('tools:board', JSON.stringify({
        v: 1, tool: 'board', savedAt: 'x',
        data: {
          notes: [
            { id: 1, x: 100, y: 100, text: '生きてる', color: '#fef08a' },
            { id: 2, x: NaN, y: 100, text: '座標が壊れてる', color: '#fef08a' },
            { id: 3, x: 100, y: 300, text: 42, color: '#fef08a' },
          ],
          connectors: [
            { id: 1, a: 1, b: 2 },   // b が壊れた付箋 → 落ちる
          ],
        },
      }));
    });
    await page.reload();
    const bd09 = await page.evaluate(() => {
      const banner = document.getElementById('banner');
      return {
        notes: window.board.notes().length,
        conns: window.board.connectors().length,
        warn: !banner.hidden && banner.className.includes('banner-warn'),
        msg: banner.textContent,
      };
    });
    r.check('BD-09（壊れた分だけ落として件数 warn・残りは復元）',
      bd09.notes === 1 && bd09.conns === 0 && bd09.warn === true && /2件/.test(bd09.msg),
      JSON.stringify(bd09));
  }

  if (ready) {
    /* ========== BD-10: ズームのモデル空間不変（PNG/md/hitTest — v2） ========== */
    const bd10 = await page.evaluate(async () => {
      const b = window.board;
      if (!b.setScale) return { missing: true };
      b.clearAll();
      b.addNote(100, 100, 'ズーム不変');
      b.addNote(400, 300, '相方');
      b.connect(1, 2);
      const pngSize = async () => {
        let item = null;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { write: async items => { item = items[0]; } },
        });
        document.getElementById('copy-btn').click();
        await new Promise(d => setTimeout(d, 400));
        const bmp = await createImageBitmap(await item.getType('image/png'));
        return { w: bmp.width, h: bmp.height };
      };
      b.setScale(1);
      const at1 = { png: await pngSize(), md: b.buildMd({}), hit: b.hitTest(150, 120) };
      b.setScale(0.5);
      const atHalf = { png: await pngSize(), md: b.buildMd({}), hit: b.hitTest(150, 120),
                       scale: b.getScale() };
      b.setScale(1);
      return { at1, atHalf };
    });
    r.check('BD-10（scale 0.5 でも PNG・md・hitTest はモデル空間で不変）',
      !bd10.missing
      && eq(bd10.at1.png, bd10.atHalf.png) && bd10.at1.md === bd10.atHalf.md
      && bd10.at1.hit && bd10.atHalf.hit && bd10.at1.hit.id === bd10.atHalf.hit.id
      && bd10.atHalf.scale === 0.5,
      JSON.stringify(bd10));
  }

  /* ========== BD-U1: 空白ダブルクリック → 入力 → 外側クリックで確定 ========== */
  const cvHelpers = `
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y, extra) => Object.assign({
      clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 }, extra || {});
  `;
  const u1b = await page.evaluate(async () => {
    const b = window.board;
    b.clearAll();
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 });
    cv.dispatchEvent(new MouseEvent('dblclick', pt(200, 200)));
    const ed = document.getElementById('note-editor');
    const opened = { visible: !ed.hidden, focused: document.activeElement === ed };
    ed.value = 'アイデア1';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(600, 600)));   // 外側クリック = 確定
    cv.dispatchEvent(new PointerEvent('pointerup', pt(600, 600)));
    await new Promise(d => setTimeout(d, 50));
    // 空のまま確定 → 作らない
    cv.dispatchEvent(new MouseEvent('dblclick', pt(500, 400)));
    ed.dispatchEvent(new Event('blur'));
    await new Promise(d => setTimeout(d, 50));
    return { opened, count: b.notes().length, text: b.notes()[0] && b.notes()[0].text };
  });
  r.check('BD-U1（空白ダブルクリックで作成・空なら作らない）',
    u1b.opened.visible === true && u1b.opened.focused === true
    && u1b.count === 1 && u1b.text === 'アイデア1',
    JSON.stringify(u1b));

  /* ========== BD-U2: 付箋ダブルクリック → 全消し → Esc で削除（1手 Undo） ========== */
  const u2b = await page.evaluate(async () => {
    const b = window.board;
    const n = b.notes()[0];
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 });
    cv.dispatchEvent(new MouseEvent('dblclick', pt(n.x + 20, n.y + 20)));
    const ed = document.getElementById('note-editor');
    const prefilled = ed.value;
    ed.value = '';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    const afterEmpty = b.notes().length;
    b.undo();
    return { prefilled, afterEmpty, afterUndo: b.notes().length };
  });
  r.check('BD-U2（再編集で空にして確定 = 削除・undo で復活）',
    u2b.prefilled === 'アイデア1' && u2b.afterEmpty === 0 && u2b.afterUndo === 1,
    JSON.stringify(u2b));

  /* ========== BD-U3: ドラッグ移動・ラバーバンド・Cmd+A・一括削除 ========== */
  const u3b = await page.evaluate(async () => {
    const b = window.board;
    b.clearAll();
    b.addNote(100, 100, 'A');
    b.addNote(400, 100, 'B');
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y, extra) => Object.assign(
      { clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 }, extra || {});
    // ドラッグ移動（+50, 0）
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(150, 120)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(200, 120)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(200, 120)));
    const moved = b.notes()[0].x;
    // ラバーバンドで2枚
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(80, 60)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(700, 320)));
    cv.dispatchEvent(new PointerEvent('pointerup', pt(700, 320)));
    const band = b.selectedIds();
    // Cmd+A → Delete 一括（1手）
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    const deleted = b.notes().length;
    b.undo();
    return { moved, band, deleted, restored: b.notes().length };
  });
  r.check('BD-U3（ドラッグ+50・ラバーバンド2枚・Cmd+A→Delete が1手）',
    u3b.moved === 150 && eq(u3b.band, ['n1', 'n2'])
    && u3b.deleted === 0 && u3b.restored === 2,
    JSON.stringify(u3b));

  /* ========== BD-U4: 結線モード（A→B で線・Esc でキャンセル） ========== */
  const u4b = await page.evaluate(async () => {
    const b = window.board;
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 });
    const n = b.notes();
    document.getElementById('connect-mode').click();   // 結線モードへ
    const click = (x, y) => {
      cv.dispatchEvent(new PointerEvent('pointerdown', pt(x, y)));
      cv.dispatchEvent(new PointerEvent('pointerup', pt(x, y)));
    };
    click(n[0].x + 20, n[0].y + 20);
    click(n[1].x + 20, n[1].y + 20);
    const connected = b.connectors().length;
    // 片端確定 → Esc でキャンセル
    click(n[0].x + 20, n[0].y + 20);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    click(n[1].x + 20, n[1].y + 20);   // キャンセル後の最初のクリックは片端確定になるだけ
    const afterCancel = b.connectors().length;
    document.getElementById('connect-mode').click();   // 選択モードへ戻す
    return { connected, afterCancel };
  });
  r.check('BD-U4（結線モード: A→B で1本・Esc で片端キャンセル）',
    u4b.connected === 1 && u4b.afterCancel === 1,
    JSON.stringify(u4b));

  /* ========== BD-U5: 線をクリック選択 → Delete で線だけ消える ========== */
  const u5b = await page.evaluate(() => {
    const b = window.board;
    const n = b.notes();
    const mid = { x: (n[0].x + 84 + n[1].x + 84) / 2, y: (n[0].y + n[1].y) / 2 + 20 };
    const cv = document.getElementById('canvas');
    const rect = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + mid.x, clientY: rect.top + mid.y, bubbles: true, pointerId: 1 }));
    cv.dispatchEvent(new PointerEvent('pointerup', { clientX: rect.left + mid.x, clientY: rect.top + mid.y, bubbles: true, pointerId: 1 }));
    const sel = b.selectedIds();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
    return { sel, conns: b.connectors().length, notes: b.notes().length };
  });
  r.check('BD-U5（線をクリック選択 → Delete で線だけ消える）',
    eq(u5b.sel, ['c1']) && u5b.conns === 0 && u5b.notes === 2,
    JSON.stringify(u5b));

  /* ========== BD-U6: PNG コピー（外接トリム・空は案内） ========== */
  const u6b = await page.evaluate(async () => {
    const b = window.board;
    b.clearAll();
    b.addNote(100, 100, 'PNG確認');
    let captured = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async items => { captured = items[0]; } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 500));
    let size = null;
    if (captured) {
      const blob = await captured.getType('image/png');
      const bmp = await createImageBitmap(blob);
      size = { w: bmp.width, h: bmp.height };
    }
    const label = document.getElementById('copy-btn').textContent;
    // 空ボード → 案内で書かない
    b.clearAll();
    let wrote2 = false;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async () => { wrote2 = true; } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 300));
    const banner = document.getElementById('banner').textContent;
    return { size, label, wrote2, banner };
  });
  r.check('BD-U6（PNG: 外接トリム（全面 3200px にならない）・✓ 表示・空は案内）',
    u6b.size && u6b.size.w > 100 && u6b.size.w < 1200
    && u6b.label === '✓ コピーしました' && u6b.wrote2 === false
    && u6b.banner.includes('付箋'),
    JSON.stringify(u6b));

  /* ========== BD-U7: md をコピー ========== */
  const u7b = await page.evaluate(async () => {
    const b = window.board;
    b.clearAll();
    b.addNote(100, 100, '書き出し');
    let text = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { text = t; } },
    });
    document.getElementById('md-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return { text, label: document.getElementById('md-btn').textContent };
  });
  r.check('BD-U7（md コピー: buildMd の結果が渡り ✓ 表示）',
    u7b.text === '- 書き出し' && u7b.label === '✓ コピーしました',
    JSON.stringify(u7b));

  /* ========== BD-U8: 幅390px（ページは横スクロールしない） ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u8b = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('BD-U8（幅390pxでページの横スクロールなし — ボードはラッパ内スクロール）',
    u8b === true, String(u8b));

  /* ========== BD-U9〜U13: ズームとパン（v2） ========== */
  const u9v = await page.evaluate(async () => {
    const b = window.board;
    if (!b.setScale) return { missing: true };
    b.clearAll();
    b.addNote(300, 200, 'アンカー');
    b.setScale(1);
    const wrap = document.getElementById('board-wrap');
    const cv = document.getElementById('canvas');
    const r0 = cv.getBoundingClientRect();
    const client = { x: r0.left + 320, y: r0.top + 220 };   // 付箋の上のある点（scale=1）
    const modelBefore = { x: 320, y: 220 };
    wrap.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -240, ctrlKey: true, clientX: client.x, clientY: client.y,
      bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    const scaleAfter = b.getScale();
    // 同じ client 点が指すモデル座標が維持されているか
    const r1 = cv.getBoundingClientRect();
    const modelAfter = {
      x: (client.x - r1.left) * 1600 / r1.width,
      y: (client.y - r1.top) * 1000 / r1.height,
    };
    b.setScale(1);
    return { scaleAfter, dx: Math.abs(modelAfter.x - modelBefore.x), dy: Math.abs(modelAfter.y - modelBefore.y) };
  });
  r.check('BD-U9（Ctrl+ホイールで拡大・カーソル直下のモデル座標が維持 ±1px）',
    !u9v.missing && u9v.scaleAfter > 1 && u9v.dx <= 1 && u9v.dy <= 1,
    JSON.stringify(u9v));

  const u10v = await page.evaluate(async () => {
    const b = window.board;
    if (!b.setScale) return { missing: true };
    document.getElementById('zoom-in').click();
    const up = b.getScale();
    document.getElementById('zoom-label').click();   // 100% 復帰
    const back = b.getScale();
    document.getElementById('zoom-fit').click();
    const fit = b.getScale();
    const label = document.getElementById('zoom-label').textContent;
    b.setScale(0.5);
    window.dispatchEvent(new Event('pagehide'));   // scale を保存
    return { up, back, fit, label };
  });
  await page.reload();
  const u10r = await page.evaluate(() => ({
    restored: window.board.getScale ? window.board.getScale() : null,
  }));
  await page.evaluate(() => {
    // scale 欠損の保存データ → 警告なしで 100%
    window.ToolStorage.save = () => true;
    const env = JSON.parse(localStorage.getItem('tools:board') || 'null');
    if (env && env.data) {
      delete env.data.scale;
      localStorage.setItem('tools:board', JSON.stringify(env));
    }
  });
  await page.reload();
  const u10m = await page.evaluate(() => ({
    scale: window.board.getScale ? window.board.getScale() : null,
    bannerHidden: document.getElementById('banner').hidden,
  }));
  r.check('BD-U10（ズームボタン・100%復帰・fit がクランプ内・scale 復元・欠損は警告なしで 1）',
    !u10v.missing && u10v.up > 1 && u10v.back === 1
    && u10v.fit >= 0.25 && u10v.fit <= 2 && /%$/.test(u10v.label)
    && u10r.restored === 0.5 && u10m.scale === 1 && u10m.bannerHidden === true,
    JSON.stringify({ u10v, u10r, u10m }));

  const u11v = await page.evaluate(async () => {
    const b = window.board;
    if (!b.setScale) return { missing: true };
    b.clearAll();
    b.setScale(2);
    const wrap = document.getElementById('board-wrap');
    wrap.scrollLeft = 1400;
    wrap.scrollTop = 900;
    document.getElementById('add-note').click();
    const ed = document.getElementById('note-editor');
    ed.value = '視界内';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    const n = b.notes()[0];
    const visX1 = wrap.scrollLeft / 2, visX2 = (wrap.scrollLeft + wrap.clientWidth) / 2;
    const visY1 = wrap.scrollTop / 2, visY2 = (wrap.scrollTop + wrap.clientHeight) / 2;
    b.setScale(1);
    return { n: { x: n.x, y: n.y }, vis: { visX1, visX2, visY1, visY2 },
             inside: n.x >= visX1 && n.x <= visX2 && n.y >= visY1 && n.y <= visY2 };
  });
  r.check('BD-U11（ズーム＋スクロール後の［＋付箋を追加］は可視領域内に生まれる）',
    !u11v.missing && u11v.inside === true, JSON.stringify(u11v));

  const u12v = await page.evaluate(async () => {
    const b = window.board;
    if (!b.setScale) return { missing: true };
    b.clearAll();
    b.addNote(100, 100, 'パン確認');
    b.setScale(2);
    const wrap = document.getElementById('board-wrap');
    wrap.scrollLeft = 0; wrap.scrollTop = 0;
    const cv = document.getElementById('canvas');
    const r0 = cv.getBoundingClientRect();
    const pt = (x, y) => ({ clientX: r0.left + x, clientY: r0.top + y, bubbles: true, pointerId: 1 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    cv.dispatchEvent(new PointerEvent('pointerdown', pt(400, 300)));
    cv.dispatchEvent(new PointerEvent('pointermove', pt(300, 250)));   // 左上へ100,50 ドラッグ
    cv.dispatchEvent(new PointerEvent('pointerup', pt(300, 250)));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    const scrolled = { l: wrap.scrollLeft, t: wrap.scrollTop };
    const notesMoved = b.notes()[0].x !== 100;
    // 編集中の Space はパンしない（文字が入る）
    const ed = document.getElementById('note-editor');
    cv.dispatchEvent(new MouseEvent('dblclick', pt(800, 700)));
    const spaceEv = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    ed.dispatchEvent(spaceEv);
    const editorGuard = !spaceEv.defaultPrevented;
    ed.dispatchEvent(new Event('blur'));
    await new Promise(d => setTimeout(d, 50));
    b.setScale(1);
    return { scrolled, notesMoved, editorGuard };
  });
  r.check('BD-U12（Space+ドラッグでラッパがスクロール・付箋は動かない・編集中はパンしない）',
    !u12v.missing && u12v.scrolled.l === 100 && u12v.scrolled.t === 50
    && u12v.notesMoved === false && u12v.editorGuard === true,
    JSON.stringify(u12v));

  const u13v = await page.evaluate(async () => {
    const b = window.board;
    if (!b.setScale) return { missing: true };
    b.clearAll();
    b.addNote(200, 200, 'オートズーム');
    b.setScale(0.5);
    const cv = document.getElementById('canvas');
    const r0 = cv.getBoundingClientRect();
    // scale 0.5 のクライアント座標（モデル 220,220 → 画面 110,110）
    cv.dispatchEvent(new MouseEvent('dblclick', {
      clientX: r0.left + 110, clientY: r0.top + 110, bubbles: true }));
    const res = {
      scale: b.getScale(),
      editorOpen: !document.getElementById('note-editor').hidden,
      value: document.getElementById('note-editor').value,
    };
    document.getElementById('note-editor').dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 50));
    return res;
  });
  r.check('BD-U13（50% で付箋をダブルクリック → 100% にオートズームして編集）',
    !u13v.missing && u13v.scale === 1 && u13v.editorOpen === true && u13v.value === 'オートズーム',
    JSON.stringify(u13v));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("Sort Ideas")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「発想」から遷移できる（title = Sort Ideas (board)）',
    hubTitle === 'Sort Ideas (board)', hubTitle);

  await browser.close();
  r.report('board（docs/specs/board.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
