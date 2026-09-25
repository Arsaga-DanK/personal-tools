'use strict';
/* test/taskboard/parent.js — 節: 親子の付け替え（setParent / wrapParent）と Cmd/Ctrl+Shift+E のモード切替（遷移するので最後）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js parent）
   照合する ID: TB-K1〜K11・MS3。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'parent',
  ids: 'TB-K1〜K11・MS3',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ========== TB-K1〜K11: 親子の付け替え（setParent / wrapParent・TB-Q64） ========== */
  const F1L = F1.split('\n'), F5L = F5.split('\n');
  // 未実装・例外でもハーネスを止めず fail として数える（RED を見るため）
  const opsK = (text, list) => page.evaluate(([t, l, today]) => {
    try { return window.taskboard.test.applyOps(t, l, today); } catch (e) { return 'ERR: ' + e.message; }
  }, [text, list, TODAY]);
  const tab = l => '\t' + l;
  const k1 = await opsK(F1, [{ type: 'setParent', line: 13, parent: 9 }]);
  r.check('TB-K1（資料Rv を資料作成の子に: 直後に 1段深く入り、他の行は不変）',
    k1 === [...F1L.slice(0, 9), tab(F1L[12]), ...F1L.slice(9, 12), ...F1L.slice(13)].join('\n'), JSON.stringify(k1 && k1.split('\n').slice(7, 14)));
  const k2 = await opsK(F1, [{ type: 'setParent', line: 10, parent: 17 }]);
  r.check('TB-K2（子2つを持つ外部IF を UL の目標管理の子に: 部分木ごと1段深くなって UL へ）',
    k2 === [...F1L.slice(0, 9), ...F1L.slice(12, 17), ...F1L.slice(9, 12).map(tab), ...F1L.slice(17)].join('\n'), JSON.stringify(k2 && k2.split('\n').slice(7, 19)));
  const k3 = await opsK(F1, [{ type: 'setParent', line: 11, parent: null }]);
  r.check('TB-K3（子の PRODUCTS を「なし」に: 最上位になり、元の親の部分木の直後に入る）',
    k3 === [...F1L.slice(0, 10), F1L[11], F1L[10].replace(/^\t/, ''), ...F1L.slice(12)].join('\n'), JSON.stringify(k3 && k3.split('\n').slice(8, 14)));
  const k4 = [await opsError(F1, [{ type: 'setParent', line: 10, parent: 11 }]),
    await opsError(F1, [{ type: 'setParent', line: 10, parent: 10 }]),
    await opsError(F1, [{ type: 'setParent', line: 10, parent: 7 }])];
  r.check('TB-K4（自分の子・自分・見出し行は親にできない＝理由つきの例外）',
    typeof k4[0] === 'string' && k4[0].includes('自分') && typeof k4[1] === 'string' && k4[1].includes('自分')
    && typeof k4[2] === 'string' && k4[2].includes('タスク行'), JSON.stringify(k4));
  const k5 = await opsK(F1, [{ type: 'wrapParent', line: 13, content: 'まとめ' }]);
  r.check('TB-K5（資料Rv を「まとめ」で包む: 同じ位置に親ができ、資料Rv が1段下がる）',
    k5 === [...F1L.slice(0, 12), '- [ ] まとめ', tab(F1L[12]), ...F1L.slice(13)].join('\n'), JSON.stringify(k5 && k5.split('\n').slice(11, 15)));
  const k6a = await opsK(F5, [{ type: 'wrapParent', line: 5, content: 'P' }]);
  const k6b = await opsK(F5, [{ type: 'setParent', line: 11, parent: 10 }]);
  r.check('TB-K6（メモも子も一緒に動く: 親A を包むとメモ・子・子のメモが1段下がる／親C を親B の子にするとメモも1段）',
    k6a === [...F5L.slice(0, 4), '- [ ] P', ...F5L.slice(4, 9).map(tab), ...F5L.slice(9)].join('\n')
    && k6b === [...F5L.slice(0, 10), tab(F5L[10]), tab(F5L[11]), ...F5L.slice(12)].join('\n'),
    JSON.stringify([k6a && k6a.split('\n').slice(4, 11), k6b && k6b.split('\n').slice(9, 12)]));
  const G7 = ['# tasks', '', '## A', '', '- [ ] X', '\t補足', '- [ ] Y', ''].join('\n');
  const k7 = [await opsError(G7, [{ type: 'setParent', line: 5, parent: 7 }]), await opsError(G7, [{ type: 'wrapParent', line: 5, content: 'P' }])];
  r.check('TB-K7（直後にタスクでもメモでもない字下げ行が続くと、付け替えも包むのも断る）',
    k7.every(e => typeof e === 'string' && e.includes('字下げ')), JSON.stringify(k7));

  // UI: 行の［編集］→ 詳細の「親タスク」
  const openEditOf = (txt) => page.evaluate(async (t) => {
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr')).find(x => x.textContent.includes(t));
    Array.from(tr.querySelectorAll('.btn-child')).find(b => b.textContent === '編集').click();
    await new Promise(d => setTimeout(d, 100));
    document.getElementById('modal-more').open = true;
    return !!document.getElementById('modal-parent');
  }, txt);
  const saveModalUI = () => page.evaluate(async () => {
    document.querySelector('#modal .modal-actions .primary').click();
    await new Promise(d => setTimeout(d, 100));
    const b = document.getElementById('banner');
    return { open: !document.getElementById('modal').hidden, text: window.__s.getText(), banner: b.hidden ? '' : b.className + '|' + b.textContent };
  });
  const setParentUI = (v, name) => page.evaluate(([val, nm]) => {
    const sel = document.getElementById('modal-parent');
    sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const nw = document.getElementById('modal-parent-new');
    if (nw && nm !== undefined) { nw.value = nm; nw.dispatchEvent(new Event('input', { bubbles: true })); }
    return { secDisabled: document.getElementById('modal-section').disabled,
      newShown: !document.getElementById('modal-parent-new-row').hidden };
  }, [v, name]);

  await session(F1);
  let k8 = { missing: !(await openEditOf('資料Rv')) };
  if (!k8.missing) {
    k8.opts = await page.evaluate(() => Array.from(document.getElementById('modal-parent').options).map(o => o.value));
    k8.init = await page.evaluate(() => document.getElementById('modal-parent').value);
    Object.assign(k8, await setParentUI('9'));
    Object.assign(k8, await saveModalUI());
  }
  await shutModal();
  r.check('TB-K8（UI: 親タスク欄 — 自分は出ず資料作成は出る・初期値なし・選ぶとセクション欄が無効・保存で K1 と同じ）',
    !k8.missing && k8.opts.includes('') && k8.opts.includes('__new__') && k8.opts.includes('9') && !k8.opts.includes('13')
    && k8.init === '' && k8.secDisabled && !k8.open && k8.text === k1,
    JSON.stringify({ missing: k8.missing, opts: k8.opts, init: k8.init, secDisabled: k8.secDisabled, open: k8.open }));

  await session(F1);
  let k9 = { missing: !(await openEditOf('資料Rv')) };
  if (!k9.missing) {
    k9.a = await setParentUI('__new__', '');
    k9.empty = await saveModalUI();
    k9.b = await setParentUI('__new__', 'まとめ');
    k9.done = await saveModalUI();
  }
  await shutModal();
  r.check('TB-K9（UI: 新しい親でまとめる — 名前欄が出る・空なら warn で止まり何も変わらない・入れれば K5 と同じ）',
    !k9.missing && k9.a.newShown && k9.empty.open && k9.empty.banner.includes('warn') && k9.empty.text === F1
    && !k9.done.open && k9.done.text === k5,
    JSON.stringify({ missing: k9.missing, a: k9.a, empty: k9.empty && [k9.empty.open, k9.empty.banner], done: k9.done && k9.done.open }));

  await session(F1);
  let k10 = { missing: !(await openEditOf('資料作成')) };
  if (!k10.missing) {
    await page.evaluate(() => { const m = document.getElementById('modal-memo'); m.value = 'm1\nm2'; m.dispatchEvent(new Event('input', { bubbles: true })); });
    await setParentUI('17');
    k10 = await saveModalUI();
  }
  await shutModal();
  r.check('TB-K10（UI: メモを2行足しつつ下の目標管理を親に — 親の行番号がずれず、資料作成とメモ2行が目標管理の下へ）',
    !k10.missing && k10.text === [...F1L.slice(0, 8), ...F1L.slice(9, 17), tab(F1L[8]), '\t\t- m1', '\t\t- m2', ...F1L.slice(17)].join('\n'),
    JSON.stringify(k10.text && k10.text.split('\n').slice(6, 20)));

  await session(F1);
  let k11 = { missing: !(await openEditOf('資料Rv')) };
  if (!k11.missing) {
    await setParentUI('__new__', 'まとめ');
    await saveModalUI();
    k11 = await page.evaluate(() => {
      const tr = Array.from(document.querySelectorAll('#task-table tbody tr')).find(x => x.textContent.includes('まとめ'));
      const u = tr && tr.querySelector('.btn-undo');
      return { hasUndo: !!u, disabled: !!(u && u.disabled), title: u ? u.title : '' };
    });
  }
  r.check('TB-K11（UI: 新しい親の行の ↩︎ は無効で、理由に「親タスク」— 親だけ消して子が別のタスクの下に付く事故を防ぐ）',
    !k11.missing && k11.hasUndo && k11.disabled && k11.title.includes('親タスク'), JSON.stringify(k11));

  /* ---------- TB-MS3: Cmd/Ctrl+Shift+E でモード切替（最後にやる — 遷移するため） ---------- */
  await page.goto(fileUrl('web/taskboard.html'));
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'E', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })));
  await page.waitForURL(/issue\.html/, { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('load');
  const tbT3 = await page.title();
  r.check('TB-MS3（Cmd/Ctrl+Shift+E で Check Issue へ移る）',
    tbT3 === 'Check Issue (issue)', tbT3);

  },
};
