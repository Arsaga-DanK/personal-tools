'use strict';
/* test/taskboard/arrange.js — 節: 並べ替え（moveTask・ドラッグ）・削除（deleteTask）・親子の見た目（たたむ・縦線）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js arrange）
   照合する ID: TB-K12〜K25・TB-DEL1〜DEL7・TB-V1〜V6・TB-SH1〜SH7。期待値の正本は docs/specs/taskboard/engine.md */
module.exports = {
  name: 'arrange',
  ids: 'TB-K12〜K25・DEL1〜DEL7・V1〜V6・SH1〜SH6',
  async run(ctx) {
    const { page, r, eq, F1, F5, TODAY, withDialogs, session } = ctx;
    const F1L = F1.split('\n'), F5L = F5.split('\n');
    const tab = l => '\t' + l;
    // 未実装・例外でもハーネスを止めず fail として数える（RED を見るため）
    const opsX = (text, list) => page.evaluate(([t, l, today]) => {
      try { return window.taskboard.test.applyOps(t, l, today); } catch (e) { return 'ERR: ' + e.message; }
    }, [text, list, TODAY]);
    const lines = (t, a, b) => (typeof t === 'string' ? t.split('\n').slice(a, b) : t);

    /* ========== TB-K12〜K18: moveTask（純関数） ========== */
    const k12 = await opsX(F1, [{ type: 'moveTask', line: 13, target: 9, position: 'before' }]);
    const K12 = [...F1L.slice(0, 8), F1L[12], ...F1L.slice(8, 12), ...F1L.slice(13)].join('\n');
    r.check('TB-K12（資料Rv を資料作成の前へ: 最上位のまま9行目に）', k12 === K12, JSON.stringify(lines(k12, 7, 14)));
    const k13 = await opsX(F1, [{ type: 'moveTask', line: 9, target: 13, position: 'after' }]);
    r.check('TB-K13（資料作成を資料Rv の後へ）',
      k13 === [...F1L.slice(0, 8), ...F1L.slice(9, 13), F1L[8], ...F1L.slice(13)].join('\n'), JSON.stringify(lines(k13, 7, 14)));
    const k14 = await opsX(F1, [{ type: 'moveTask', line: 12, target: 11, position: 'before' }]);
    r.check('TB-K14（子の PRODUCTS_DETAIL を PRODUCTS の前へ: 同じ親の中で入れ替わる・深さ1のまま）',
      k14 === [...F1L.slice(0, 10), F1L[11], F1L[10], ...F1L.slice(12)].join('\n'), JSON.stringify(lines(k14, 8, 13)));
    const k15 = await opsX(F1, [{ type: 'moveTask', line: 13, target: 11, position: 'after' }]);
    r.check('TB-K15（最上位の資料Rv を子の PRODUCTS の後へ: 外部IF の子（深さ1）になる）',
      k15 === [...F1L.slice(0, 11), tab(F1L[12]), F1L[11], ...F1L.slice(13)].join('\n'), JSON.stringify(lines(k15, 8, 14)));
    const k16 = await opsX(F1, [{ type: 'moveTask', line: 10, target: 17, position: 'after' }]);
    r.check('TB-K16（子2つの外部IF を UL の目標管理の後へ: 部分木ごと UL へ・深さ0のまま）',
      k16 === [...F1L.slice(0, 9), ...F1L.slice(12, 17), ...F1L.slice(9, 12), ...F1L.slice(17)].join('\n'), JSON.stringify(lines(k16, 7, 19)));
    const k17a = await opsX(F1, [{ type: 'moveTask', line: 13, target: 9, position: 'child' }]);
    const k17b = await opsX(F1, [{ type: 'setParent', line: 13, parent: 9 }]);
    r.check('TB-K17（position: child は setParent と同じ結果）', k17a === k17b && !String(k17a).startsWith('ERR'), JSON.stringify([lines(k17a, 7, 12)]));
    const k18 = [await opsX(F1, [{ type: 'moveTask', line: 10, target: 11, position: 'before' }]),
      await opsX(F1, [{ type: 'moveTask', line: 13, target: 7, position: 'before' }])];
    r.check('TB-K18（自分の子の前へ／見出し行へは動かせない＝理由つきの例外）',
      String(k18[0]).startsWith('ERR') && k18[0].includes('自分') && String(k18[1]).startsWith('ERR') && k18[1].includes('タスク行'),
      JSON.stringify(k18.map(x => String(x).slice(0, 60))));

    /* ========== TB-DEL1〜DEL3: deleteTask（純関数） ========== */
    const DEL1 = [...F1L.slice(0, 9), ...F1L.slice(12)].join('\n');
    const d1 = await opsX(F1, [{ type: 'deleteTask', line: 10 }]);
    r.check('TB-DEL1（子2つの外部IF を削除: 10〜12行目が消え、他の行は不変）', d1 === DEL1, JSON.stringify(lines(d1, 7, 12)));
    const d2 = await opsX(F5, [{ type: 'deleteTask', line: 5 }]);
    r.check('TB-DEL2（F5 の親A を削除: メモ2・子1・子のメモごと5〜9行目が消える）',
      d2 === [...F5L.slice(0, 4), ...F5L.slice(9)].join('\n'), JSON.stringify(lines(d2, 2, 8)));
    const G7 = ['# tasks', '', '## A', '', '- [ ] X', '\t補足', '- [ ] Y', ''].join('\n');
    const d3 = await opsX(G7, [{ type: 'deleteTask', line: 5 }]);
    r.check('TB-DEL3（直後に字下げ行が続くタスクは削除しない＝理由つきの例外）',
      String(d3).startsWith('ERR') && d3.includes('字下げ'), String(d3).slice(0, 80));

    /* ========== UI ========== */
    const showDone = (on) => page.evaluate((v) => {
      const cb = document.getElementById('f-done');
      if (cb.checked !== v) { cb.checked = v; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    }, on);
    const bannerNow = () => page.evaluate(() => {
      const b = document.getElementById('banner');
      return { text: b.hidden ? '' : b.textContent, cls: b.className,
        undo: !b.hidden && !!Array.from(b.querySelectorAll('button')).find(x => x.textContent === '元に戻す') };
    });
    const clickUndo = () => page.evaluate(() => {
      const b = document.getElementById('banner');
      const u = Array.from(b.querySelectorAll('button')).find(x => x.textContent === '元に戻す');
      if (u) u.click();
      return window.__s.getText();
    });
    // src の ⋮⋮ を dst の行の zone（before / child / after）へドラッグ（実際の DragEvent を送る）
    const dragTo = (srcTxt, dstTxt, zone) => page.evaluate(async ([s, d, z]) => {
      const rowOf = t => Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent.includes(t); });
      const src = rowOf(s), dst = rowOf(d);
      const h = src && src.querySelector('.drag-handle');
      if (!h || !h.draggable) return { noHandle: true };
      const dt = new DataTransfer();
      h.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rc = dst.getBoundingClientRect();
      const y = z === 'before' ? rc.top + 2 : z === 'after' ? rc.bottom - 2 : rc.top + rc.height / 2;
      const x = rc.left + 60;
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      h.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      await new Promise(res => setTimeout(res, 50));
      return { text: window.__s.getText() };
    }, [srcTxt, dstTxt, zone]);

    /* ---------- TB-K19〜K21: ドラッグ ---------- */
    await session(F1);
    const k19 = await dragTo('資料Rv', '資料作成', 'child');
    const k19b = await bannerNow();
    const k19u = k19.noHandle ? null : await clickUndo();
    r.check('TB-K19（UI: 資料Rv を資料作成の真ん中へドラッグ → 子になる・バナーの［元に戻す］で F1 に戻る）',
      !k19.noHandle && k19.text === k17b && k19b.undo && k19u === F1, JSON.stringify({ noHandle: k19.noHandle, banner: k19b }));

    await session(F1);
    const k20 = await dragTo('資料Rv', '資料作成', 'before');
    r.check('TB-K20（UI: 資料作成の上端へドラッグ → その前へ（TB-K12 と同じ））', !k20.noHandle && k20.text === K12, JSON.stringify(k20.noHandle ? k20 : lines(k20.text, 7, 14)));

    await session(F1);
    await showDone(true);
    const k21a = await dragTo('外部IF', 'PRODUCTS', 'child');
    const k21b = await page.evaluate(() => {
      const s = document.getElementById('f-sort');
      s.value = 'due'; s.dispatchEvent(new Event('change', { bubbles: true }));
      const hs = Array.from(document.querySelectorAll('#task-table .drag-handle')).filter(h => h.draggable);
      s.value = 'file'; s.dispatchEvent(new Event('change', { bubbles: true }));
      return { draggableInDue: hs.length, backInFile: Array.from(document.querySelectorAll('#task-table .drag-handle')).filter(h => h.draggable).length };
    });
    await showDone(false);
    r.check('TB-K21（UI: 自分の子の上に落としても何も変わらない／期限順でも ⋮⋮ でつかめる）',
      !k21a.noHandle && k21a.text === F1 && k21b.draggableInDue > 0 && k21b.backInFile > 0, JSON.stringify([k21a.noHandle, k21a.text === F1, k21b]));

    // 並び順を優先度順にしても動かせる（TB-K22 — 利用者のふだんの並び順で動かなかった）
    const setSort = (v) => page.evaluate((x) => { const e = document.getElementById('f-sort'); e.value = x; e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    await session(F1);
    await setSort('priority');
    const k22a = await dragTo('資料Rv', '資料作成', 'child');
    await session(F1);
    await setSort('priority');
    const k22b = await dragTo('資料Rv', '資料作成', 'before');
    const k22bn = await bannerNow();
    await setSort('file');
    r.check('TB-K22（UI: 優先度順でも真ん中＝子になる／最上位の前後はファイル上は前に入り、バナーに「表示の位置は並び順どおり」）',
      !k22a.noHandle && k22a.text === k17b && !k22b.noHandle && k22b.text === K12 && k22bn.text.includes('並び順どおり'),
      JSON.stringify({ a: k22a.noHandle || k22a.text === k17b, b: k22b.noHandle || k22b.text === K12, banner: k22bn.text }));

    // 本物のマウス操作（押す→動かす→離す）。DragEvent を直接送るだけでは「つかめない」状態を見逃した（TB-K23）
    await session(F1);
    const k23 = await (async () => {
      const src = page.locator('#task-table tbody tr', { hasText: '資料Rv' }).first().locator('.drag-handle');
      const dst = page.locator('#task-table tbody tr', { hasText: '資料作成' }).first();
      const sb = await src.boundingBox(), db = await dst.boundingBox();
      if (!sb || !db) return { noBox: true };
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
      await page.mouse.down();
      await page.mouse.move(db.x + 300, db.y + db.height / 2, { steps: 8 });
      await page.mouse.move(db.x + 305, db.y + db.height / 2, { steps: 2 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      return { text: await page.evaluate(() => window.__s.getText()) };
    })();
    r.check('TB-K23（UI: 本物のマウス操作で資料Rv を資料作成の真ん中へ → 子になる）', !k23.noBox && k23.text === k17b, JSON.stringify(k23.noBox ? k23 : lines(k23.text, 7, 12)));

    // 行のどこでもつかめる（TB-K24）。ボタンから始めた操作と、本文の編集中はドラッグにしない（TB-K25）
    const realDrag = async (srcLoc, dstTxt) => {
      const dst = page.locator('#task-table tbody tr', { hasText: dstTxt }).first();
      const sb = await srcLoc.boundingBox(), db = await dst.boundingBox();
      if (!sb || !db) return { noBox: true };
      await page.mouse.move(sb.x + Math.min(12, sb.width / 2), sb.y + sb.height / 2);
      await page.mouse.down();
      await page.mouse.move(db.x + 300, db.y + db.height / 2, { steps: 8 });
      await page.mouse.move(db.x + 305, db.y + db.height / 2, { steps: 2 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      return { text: await page.evaluate(() => window.__s.getText()) };
    };
    await session(F1);
    const k24 = await realDrag(page.locator('#task-table tbody tr', { hasText: '資料Rv' }).first().locator('.body-text'), '資料作成');
    r.check('TB-K24（UI: 本物のマウス操作で本文をつかんで資料作成の真ん中へ → 子になる）', !k24.noBox && k24.text === k17b,
      JSON.stringify(k24.noBox ? k24 : lines(k24.text, 7, 12)));
    await session(F1);
    await page.hover('#task-table tbody tr:has-text("資料Rv")');
    const k25a = await realDrag(page.locator('#task-table tbody tr', { hasText: '資料Rv' }).first().locator('.btn-child', { hasText: '編集' }), '資料作成');
    await page.evaluate(() => { const m = document.getElementById('modal'); if (!m.hidden) { document.getElementById('modal-cancel').click(); } });
    const k25b = await page.evaluate(async () => {
      const tr = Array.from(document.querySelectorAll('#task-table tbody tr')).find(x => x.textContent.includes('資料Rv'));
      tr.querySelector('td.cell-body').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await new Promise(res => setTimeout(res, 50));
      const tr2 = document.querySelector('td.cell-body input').closest('tr');
      const res = { editing: !!tr2, draggable: tr2 ? tr2.draggable : null };
      document.querySelector('td.cell-body input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return res;
    });
    r.check('TB-K25（UI: ［編集］ボタンから押して動かしても何も動かない／本文の編集中の行はつかめない）',
      !k25a.noBox && k25a.text === F1 && k25b.editing && k25b.draggable === false, JSON.stringify({ a: k25a.noBox || k25a.text === F1, b: k25b }));

    /* ---------- TB-DEL4〜DEL7: 削除の UI ---------- */
    const clickTrash = (txt) => page.evaluate(async (t) => {
      const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent.includes(t); });
      const btn = tr && Array.from(tr.querySelectorAll('button')).find(b => b.textContent === '🗑');
      if (!btn) return { noBtn: true };
      btn.click();
      await new Promise(res => setTimeout(res, 50));
      return { text: window.__s.getText() };
    }, txt);
    await session(F1);
    await showDone(true);
    const d4 = await withDialogs('accept', () => clickTrash('外部IF'));
    const d4b = await bannerNow();
    const d4u = d4.result.noBtn ? null : await clickUndo();
    r.check('TB-DEL4（UI: 行の 🗑 → 確認に「子タスク 2 件」→ 承認で消える → ［元に戻す］で F1）',
      !d4.result.noBtn && (d4.messages[0] || '').includes('子タスク 2 件') && d4.result.text === DEL1 && d4b.undo && d4u === F1,
      JSON.stringify({ r: d4.result.noBtn, msg: d4.messages, banner: d4b }));

    await session(F1);
    await showDone(true);
    const d5 = await withDialogs('dismiss', () => clickTrash('外部IF'));
    r.check('TB-DEL5（UI: 確認でキャンセルすると何も変わらない）', !d5.result.noBtn && d5.result.text === F1, JSON.stringify(d5.result.noBtn));
    await showDone(false);

    await session(F1);
    const d6 = await withDialogs('accept', () => page.evaluate(async () => {
      document.getElementById('btn-add-form').click();
      const del = document.getElementById('modal-delete');
      const inNew = !!del && !del.hidden;
      document.getElementById('modal-content').value = '';
      document.getElementById('modal-cancel').click();
      const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent.includes('資料作成'); });
      Array.from(tr.querySelectorAll('.btn-child')).find(b => b.textContent === '編集').click();
      await new Promise(res => setTimeout(res, 50));
      const del2 = document.getElementById('modal-delete');
      const inEdit = !!del2 && !del2.hidden;
      if (del2) del2.click();
      await new Promise(res => setTimeout(res, 50));
      return { inNew, inEdit, open: !document.getElementById('modal').hidden, text: window.__s.getText() };
    }));
    r.check('TB-DEL6（UI: 編集モーダルにだけ［削除］・承認で消えてモーダルが閉じる）',
      !d6.result.inNew && d6.result.inEdit && !d6.result.open && d6.result.text === [...F1L.slice(0, 8), ...F1L.slice(9)].join('\n'),
      JSON.stringify({ inNew: d6.result.inNew, inEdit: d6.result.inEdit, open: d6.result.open }));

    await session(F1);
    const d7 = await withDialogs('accept', async () => {
      await clickTrash('資料作成');
      return page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
          .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent.includes('資料Rv'); });
        const cb = tr.querySelector('input[type="checkbox"]');
        cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
        const after = window.__s.getText();
        const undo = window.taskboard.test.undoLast ? window.taskboard.test.undoLast() : 'none';
        const b = document.getElementById('banner');
        return { undo, same: window.__s.getText() === after, doneKept: /- \[x\] 資料Rv/.test(window.__s.getText()), banner: b.className };
      });
    });
    r.check('TB-DEL7（UI: 削除のあとに別の変更をしたら［元に戻す］は戻さず warn・完了は残る）',
      d7.result.undo === false && d7.result.same && d7.result.doneKept && d7.result.banner.includes('warn'), JSON.stringify(d7.result));

    /* ---------- TB-V1〜V3: 親子の見た目 ---------- */
    await session(F1);
    await showDone(true);
    await page.mouse.move(1, 1);   // ホバーの色を拾わない（前のドラッグのテストでマウスが行の上に残る）
    const v1 = await page.evaluate(() => {
      const rowOf = t => Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent.includes(t); });
      const p = rowOf('外部IF'), leaf = rowOf('資料作成'), child = rowOf('PRODUCTS_DETAIL');
      const pb = p.querySelector('.body-text'), cb = child.querySelector('.body-text');
      const ctd = child.querySelector('td.cell-body');
      return {
        parent: p.classList.contains('row-parent'), leaf: leaf.classList.contains('row-parent'),
        count: (p.querySelector('.child-count') || {}).textContent || '',
        caret: (p.querySelector('.fold-btn') || {}).textContent || '',
        bold: parseInt(getComputedStyle(pb).fontWeight, 10) >= 600,
        noElbow: !cb.textContent.includes('└'),
        rails: (ctd.style.backgroundImage.match(/linear-gradient/g) || []).length,
        bgP: getComputedStyle(p).backgroundColor, bgL: getComputedStyle(leaf).backgroundColor,
      };
    });
    r.check('TB-V1（外部IF は row-parent・太字・子の数 2・▾／資料作成は違う／子の行に「└」が無く縦線が深さの数）',
      v1.parent && !v1.leaf && v1.count.includes('2') && v1.caret === '▾' && v1.bold && v1.noElbow && v1.rails === 1, JSON.stringify(v1));
    const v2 = await page.evaluate(async () => {
      const rows = () => Array.from(document.querySelectorAll('#task-table tbody tr .body-text')).map(b => b.textContent);
      const fold = () => Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => x.querySelector('.body-text') && x.querySelector('.body-text').textContent.includes('外部IF')).querySelector('.fold-btn');
      if (!fold()) return { noFold: true };
      fold().click();
      const folded = rows();
      const caret = fold().textContent;
      const q = document.getElementById('f-q');
      q.value = 'PRODUCTS'; q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(res => setTimeout(res, 350));   // 検索は 250ms 待ってから反映される（runSearch）
      const searching = rows();
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(res => setTimeout(res, 350));
      fold().click();
      return { folded: folded.some(t => t.includes('PRODUCTS')), caret, searching: searching.some(t => t.includes('PRODUCTS_DETAIL')),
        reopened: rows().some(t => t.includes('PRODUCTS_DETAIL')) };
    });
    r.check('TB-V2（▾ で子がたたまれ ▸ に → 戻せる／たたんだままでも検索中は一致が出る）',
      !v2.folded && v2.caret === '▸' && v2.searching && v2.reopened, JSON.stringify(v2));
    await page.mouse.move(1, 1);
    const v3 = await page.evaluate(() => {
      const rowOf = t => Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent.includes(t); });
      const bg = r => getComputedStyle(r).backgroundColor;
      return { p: bg(rowOf('外部IF')), leaf: bg(rowOf('資料作成')), child: bg(rowOf('PRODUCTS_DETAIL')) };
    });
    r.check('TB-V3（最上位の行は子の有無に関係なく同じ背景色・子の行とは違う）', v3.p === v3.leaf && v3.p !== v3.child, JSON.stringify(v3));
    await showDone(false);

    /* ---------- TB-V4〜V6: 見た目の第1段（状態の帯・期限の言葉・年を薄く・見出し2行） ---------- */
    const SV = ['# tasks', '', '## A', '',
      '- [ ] 遅れ 📅 2026-08-01', '- [ ] 今日 📅 2026-08-04', '- [/] 着手 📅 2026-08-20',
      '- [ ] 始まった 🛫 2026-08-01 📅 2026-08-20', '- [ ] 先の 🛫 2026-08-10 📅 2026-08-20', '- [ ] 来年 📅 2027-01-05', ''].join('\n');
    await session(SV);
    const v4 = await page.evaluate(() => {
      const rowOf = t => Array.from(document.querySelectorAll('#task-table tbody tr'))
        .find(x => { const b = x.querySelector('.body-text'); return b && b.textContent === t; });
      const st = r => ['s-late', 's-today', 's-doing', 's-should'].filter(c => r.classList.contains(c)).join(',');
      const due = r => { const td = r.children[3]; const sp = td.querySelector('span');
        return { cls: sp.className, bg: getComputedStyle(sp).backgroundColor, text: sp.textContent, title: sp.title,
          rel: (td.querySelector('.due-rel') || {}).textContent || '' }; };
      const names = ['遅れ', '今日', '着手', '始まった', '先の'];
      return { st: names.map(n => st(rowOf(n))), due: names.map(n => due(rowOf(n))),
        start: rowOf('始まった').children[2].textContent, nextYear: rowOf('来年').children[3].querySelector('span').textContent };
    });
    r.check('TB-V4（行の左端の色の帯: 遅れ・今日・着手中・開始日を過ぎた・なし）',
      eq(v4.st, ['s-late', 's-today', 's-doing', 's-should', '']), JSON.stringify(v4.st));
    r.check('TB-V5（期限は背景なし・クラス名は不変・今年は「8/1」で title に全体・「3日遅れ／今日／あと16日」・開始日も「8/1」・来年は「2027/1/5」）',
      v4.due[0].cls === 'due-over' && v4.due[0].bg === 'rgba(0, 0, 0, 0)' && v4.due[0].text === '8/1' && v4.due[0].title === '2026-08-01'
      && v4.due[0].rel === '3日遅れ' && v4.due[1].rel === '今日' && v4.due[4].rel === 'あと16日'
      && v4.start === '8/1' && v4.nextYear === '2027/1/5',
      JSON.stringify([v4.due, v4.start, v4.nextYear]));
    const v6 = await page.evaluate(() => {
      const top = sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top) : null; };
      const h1 = document.querySelector('main h1');
      const tops = ['#view-tabs', '#btn-add-form', '#f-q', '#btn-copy', '#more-menu'].map(top);   // ⋯ まで同じ段（実データで ⋯ だけ落ちたことがある）
      return { noSubtitle: !document.querySelector('main .subtitle'), h1Title: h1 ? h1.title : '',
        vaultInMore: !!document.querySelector('#file-more #cfg-vault'), inHead: !!document.querySelector('.tb-head h1'),
        tops, oneBand: tops.every(t => t !== null) && Math.max(...tops) - Math.min(...tops) <= 14,
        tableTop: Math.round(document.getElementById('task-table').getBoundingClientRect().top + window.scrollY) };
    });
    r.check('TB-V6（見出し2行: 説明文は題名の title・vault 名は ⋯ の中・表示の切替から Excel用コピーまで同じ段・表の上端が 300px より上）',
      v6.noSubtitle && v6.h1Title.includes('tasks.md') && v6.vaultInMore && v6.inHead && v6.oneBand && v6.tableTop < 300,
      JSON.stringify(v6));

    /* ---------- TB-SH1〜SH7: セクションを表の中の見出しに ---------- */
    const secHeads = () => page.evaluate(() => Array.from(document.querySelectorAll('#task-table tbody tr.sec-row')).map(h => ({
      name: (h.querySelector('.sec-name') || {}).textContent || '', count: (h.querySelector('.sec-count') || {}).textContent || '',
      meta: h.textContent, hasLine: h.hasAttribute('data-line') })));
    const rowsUnder = () => page.evaluate(() => {
      const out = []; let cur = null;
      for (const tr of document.querySelectorAll('#task-table tbody tr')) {
        if (tr.classList.contains('sec-row')) { cur = { n: 0 }; out.push(cur); } else if (tr.dataset.line && cur) cur.n++;
      }
      return out.map(x => x.n);
    });
    const plain = n => n.replace(/^[▾▸]\s*/, '');
    await session(F1);
    await showDone(true);
    const sh1 = { heads: await secHeads(), under: await rowsUnder() };
    r.check('TB-SH1（見出しが PEW・UL・その他 の順・「N件」がその下のタスクの行の数・見出しの行は data-line を持たない）',
      eq(sh1.heads.map(h => plain(h.name)), ['PEW', 'UL', 'その他'])
      && sh1.heads.every((h, i) => h.count === sh1.under[i] + '件') && sh1.heads.every(h => !h.hasLine),
      JSON.stringify(sh1));
    const sh2 = await page.evaluate(() => ({ th: Array.from(document.querySelectorAll('#task-table thead th')).map(th => th.textContent),
      secCells: document.querySelectorAll('#task-table td.cell-sec').length }));
    r.check('TB-SH2（セクションの列が無い・td.cell-sec も無い）', !sh2.th.includes('セクション') && sh2.secCells === 0, JSON.stringify(sh2));
    await showDone(false);

    const SH3 = ['# tasks', '', '## A', '', '- [ ] A中1 🔼', '- [ ] A中2 🔼', '', '## B', '', '- [ ] B高 ⏫', ''].join('\n');
    await session(SH3);
    const sh3 = await page.evaluate(() => {
      const s = document.getElementById('f-sort'); s.value = 'priority'; s.dispatchEvent(new Event('change', { bubbles: true }));
      const seq = Array.from(document.querySelectorAll('#task-table tbody tr')).map(tr => tr.classList.contains('sec-row')
        ? '#' + ((tr.querySelector('.sec-name') || {}).textContent || '').replace(/^[▾▸]\s*/, '') : (tr.querySelector('.body-text') || {}).textContent);
      s.value = 'file'; s.dispatchEvent(new Event('change', { bubbles: true }));
      return seq;
    });
    r.check('TB-SH3（優先度順でも並べ替えはセクションの中で — B の ⏫ は B の見出しの下のまま）',
      eq(sh3, ['#A', 'A中1', 'A中2', '#B', 'B高']), JSON.stringify(sh3));

    await session(F1);
    const sh4 = await page.evaluate(() => {
      const names = () => Array.from(document.querySelectorAll('#task-table tbody tr[data-line] .body-text')).map(b => b.textContent);
      const head = () => Array.from(document.querySelectorAll('#task-table tbody tr.sec-row'))
        .find(h => ((h.querySelector('.sec-name') || {}).textContent || '').includes('PEW'));
      const btn = () => head() && head().querySelector('.sec-fold');
      if (!btn()) return { noBtn: true };
      btn().click();
      const folded = names(); const caret = btn().textContent;
      btn().click();
      return { folded, caret, back: names() };
    });
    r.check('TB-SH4（PEW の ▾ で PEW の行だけ消えて ▸ に → 戻る・UL は出たまま）',
      !sh4.noBtn && !sh4.folded.some(t => t.includes('資料')) && sh4.folded.some(t => t.includes('目標管理'))
      && sh4.caret === '▸' && sh4.back.some(t => t.includes('資料Rv')), JSON.stringify(sh4));

    const dragToHead = (srcTxt, secName) => page.evaluate(async ([s, n]) => {
      const src = Array.from(document.querySelectorAll('#task-table tbody tr[data-line]'))
        .find(x => ((x.querySelector('.body-text') || {}).textContent || '').startsWith(s));
      const head = Array.from(document.querySelectorAll('#task-table tbody tr.sec-row'))
        .find(h => ((h.querySelector('.sec-name') || {}).textContent || '').replace(/^[▾▸]\s*/, '') === n);
      if (!src || !head) return { missing: true };
      const h = src.querySelector('.drag-handle');
      const dt = new DataTransfer();
      h.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const rc = head.getBoundingClientRect();
      const opt = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rc.left + 80, clientY: rc.top + rc.height / 2 };
      head.dispatchEvent(new DragEvent('dragover', opt));
      head.dispatchEvent(new DragEvent('drop', opt));
      h.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      await new Promise(res => setTimeout(res, 50));
      const b = document.getElementById('banner');
      return { text: window.__s.getText(), banner: b.hidden ? '' : b.textContent };
    }, [srcTxt, secName]);
    await session(F1);
    const sh5a = await dragToHead('資料Rv', 'UL');
    const sh5u = sh5a.missing ? null : await clickUndo();
    const SH5 = await opsX(F1, [{ type: 'moveSection', line: 13, section: 'UL' }]);
    await session(F1);
    await showDone(true);
    const sh5b = await dragToHead('PRODUCTS', 'UL');
    await showDone(false);
    r.check('TB-SH5（最上位の資料Rv を UL の見出しへ → UL の末尾へ移り［元に戻す］で F1／子の PRODUCTS は見出しへ落とせない）',
      !sh5a.missing && sh5a.text === SH5 && sh5a.banner.includes('「UL」へ移しました') && sh5u === F1
      && !sh5b.missing && sh5b.text === F1, JSON.stringify({ a: sh5a.missing || [sh5a.text === SH5, sh5a.banner], u: sh5u === F1, b: sh5b.missing || sh5b.text === F1 }));

    await session(SV);
    const sh6 = await page.evaluate(() => (document.querySelector('#task-table tbody tr.sec-row') || {}).textContent || '');
    r.check('TB-SH6（見出しに「遅れ 1」「今日まで 1」「進めている 1」— 行の状態と同じ分け方）',
      sh6.includes('遅れ 1') && sh6.includes('今日まで 1') && sh6.includes('進めている 1'), sh6);

    const sh7 = await page.evaluate(() => {
      const td = document.querySelector('#task-table tbody tr.sec-row td.sec-cell');
      const name = td && td.querySelector('.sec-name');
      const act = document.querySelector('#task-table tbody tr[data-line] td:last-child');
      if (!name || !act) return { missing: true };
      return { gap: Math.round(name.getBoundingClientRect().left - td.getBoundingClientRect().left),
        align: getComputedStyle(td).textAlign, actAlign: getComputedStyle(act).textAlign };
    });
    r.check('TB-SH7（見出しは左寄せ — セクション名がセルの左端から 60px 以内・タスクの行の最後のセルは右寄せのまま）',
      !sh7.missing && sh7.gap >= 0 && sh7.gap <= 60 && sh7.actAlign === 'right', JSON.stringify(sh7));
  },
};
