'use strict';
/* 目的: docs/specs/taskboard.md（目次）と docs/specs/taskboard/*.md のテストケースを file:// 実機で照合する
   入力: 節名（省略可。例: node test/taskboard.js timeline-ui flows）
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0。不明な節名は 2）
   例:   ./test/run taskboard  /  ./test/run taskboard deps

   2026-09-25 に 4,184 行の1ファイルから「入口＋節」に分けた（docs/audits/2026-09-25-structure.md §6）。
   ここは fixture・スタブ・共通ヘルパを ctx にまとめ、test/taskboard/<節>.js の run(ctx) を**元の順序で**回す。
   節は前の節の状態に依存しない（各節は session(...) から始める）。最後の parent 節はページ遷移するので順序を変えない。 */

const path = require('path');
const { launch, fileUrl, createRunner, eq, REPO, bannerIs } = require('./helpers');
const FX = require('./taskboard/fixtures');
const { F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9 } = FX;

const SHOTS = process.argv.includes('--shots');
const shotPath = name => path.join(REPO, '.playwright-mcp', name); // .gitignore 済み

// 節（実行順が契約。名前で部分実行できる）
const SECTIONS = ['engine', 'input', 'timeline-model', 'edit', 'board-search', 'deps', 'status', 'timeline-ui', 'flows', 'parent']
  .map(n => require('./taskboard/' + n));
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const unknown = only.filter(n => !SECTIONS.some(s => s.name === n));
if (unknown.length) {
  console.error('不明な節名: ' + unknown.join(', ') + '\n使える節: ' + SECTIONS.map(s => s.name).join(' / '));
  process.exit(2);
}

(async () => {
  const r = createRunner();
  const browser = await launch();
  const context = await browser.newContext();
  const page = r.watch(await context.newPage());

  // TB-N 用: イシューフォルダのスタブ（test/issue.js と同じ形）。ハンドルは関数を持つので
  // IndexedDB には保存できない＝毎回ピッカーが呼ばれる（picked で回数を見る）。
  // window.__fsa.files は差し替えず中身を書き換える（クロージャが同じオブジェクトを見ている）
  await page.addInitScript(() => {
    const files = {};
    window.__fsa = { files: files, picked: 0 };
    window.showDirectoryPicker = async () => {
      window.__fsa.picked++;
      return {
        name: 'Issues', kind: 'directory',
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        getFileHandle: async (name, opts) => {
          const exists = Object.prototype.hasOwnProperty.call(files, name);
          if (!(opts && opts.create) && !exists) {
            const e = new Error('not found'); e.name = 'NotFoundError'; throw e;
          }
          return {
            name: name,
            getFile: async () => ({ text: async () => files[name] }),
            createWritable: async () => ({
              write: async t => { files[name] = t; },
              close: async () => {},
            }),
          };
        },
      };
    };
  });

  // confirm() の応答を制御する。Playwright の既定は dismiss なので、明示しないと
  // AR-3 の確認ダイアログで全アーカイブ・一括保存がキャンセル扱いになる
  let dialogAction = 'accept';
  let dialogLog = [];
  page.on('dialog', async d => {
    dialogLog.push(d.message());
    if (dialogAction === 'accept') await d.accept(); else await d.dismiss();
  });
  const withDialogs = async (action, fn) => {
    const prev = dialogAction;
    dialogAction = action;
    dialogLog = [];
    try { return { result: await fn(), messages: dialogLog.slice() }; }
    finally { dialogAction = prev; }
  };

  await page.goto(fileUrl('web/taskboard.html'));

  // テストデータ自体が正規化されて「一致した」ことにならないよう前提を先に確認する
  r.check('前提（NFD !== NFC）', NFD9 !== NFC9 && NFD9.normalize('NFC') === NFC9,
    JSON.stringify([NFD9.length, NFC9.length]));

  const ops = (text, list) => page.evaluate(([t, l, today]) =>
    window.taskboard.test.applyOps(t, l, today), [text, list, TODAY]);
  const opsError = (text, list) => page.evaluate(([t, l, today]) => {
    try { window.taskboard.test.applyOps(t, l, today); return null; }
    catch (e) { return e.message; }
  }, [text, list, TODAY]);
  const lineOf = (text, n) => text.split('\n')[n - 1];
  // 指定行以外が F1 と同一バイトであることまで確かめる（バイト保全が最優先要件）
  const onlyChanged = (out, base, changedLines) => {
    const a = out.split('\n'), b = base.split('\n');
    if (a.length !== b.length) return false;
    return a.every((l, i) => changedLines.includes(i + 1) || l === b[i]);
  };


  /* ========== UI ヘルパー ========== */
  const session = (text) => page.evaluate(([t, today]) => {
    window.taskboard.test.setToday(today);
    window.__s = window.taskboard.test.newSession(t);
    // モーダルは開かない: オーバーレイ（inset:0）が表のクリックを遮るため、
    // 必要なテストだけが addModal()/closeModal() で開閉する（TB-Q26 で1行フォームを廃止）
    if (!document.getElementById('modal').hidden) {
      document.getElementById('modal-content').value = '';   // 破棄確認を出さずに閉じる
      document.getElementById('modal-memo').value = '';
      document.getElementById('modal-cancel').click();
    }
  }, [text, TODAY]);
  const addModal = () => page.evaluate(() => {
    if (document.getElementById('modal').hidden) document.getElementById('btn-add-form').click();
  });
  const shutModal = () => page.evaluate(() => {
    const m = document.getElementById('modal');
    if (!m.hidden) { document.getElementById('modal-content').value = ''; document.getElementById('modal-memo').value = ''; document.getElementById('modal-cancel').click(); }
  });

  const ui = () => page.evaluate(() => ({
    rows: document.querySelectorAll('#task-table tbody tr').length,
    bodies: Array.from(document.querySelectorAll('#task-table tbody tr')).map(tr => tr.children[1].textContent),
    addedRows: document.querySelectorAll('#task-table tbody tr.row-added').length,
    undoBtns: document.querySelectorAll('.btn-undo').length,
    undoDisabled: Array.from(document.querySelectorAll('.btn-undo')).map(b => b.disabled),
    undoTitles: Array.from(document.querySelectorAll('.btn-undo')).map(b => b.title),
    input: document.getElementById('modal-content').value,
    activeId: document.activeElement ? document.activeElement.id : '',
    banner: document.getElementById('banner').hidden ? '' : document.getElementById('banner').textContent,
    popoverHidden: document.getElementById('popover').hidden,
    popoverInput: (document.querySelector('#popover input[type="text"]') || {}).value,
    editing: !!document.querySelector('td.cell-body input'),
    text: window.__s.getText(),
  }));

  // 変換中のキー（isComposing / keyCode 229）を合成する。
  // keyCode は KeyboardEventInit に無いため defineProperty で被せる
  const sendKey = (selector, key, mode) => page.evaluate(([sel, k, m]) => {
    const target = document.querySelector(sel);
    target.focus();
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, isComposing: m === 'composing' });
    if (m === 'keycode229') Object.defineProperty(ev, 'keyCode', { get: () => 229 });
    target.dispatchEvent(ev);
  }, [selector, key, mode || 'plain']);


  /* ========== 節をまたいで使うヘルパ（2026-09-25 に各節から移した） ========== */
  const archive = (script) => page.evaluate(([f1, today, mode]) => {
    window.taskboard.test.setToday(today);
    const s = window.taskboard.test.newSession(f1);
    const showDone = () => {
      const cb = document.getElementById('f-done');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const run = async () => {
      if (mode === 'TB-15') { showDone(); return { res: await s.archive(), archive: s.getArchiveText(), tasks: s.getAdapterText() }; }
      if (mode === 'TB-16') {
        s.applyOps([{ type: 'complete', line: 9 }]);
        await s.save(); showDone();
        return { res: await s.archive(), archive: s.getArchiveText(), tasks: s.getAdapterText() };
      }
      if (mode === 'TB-17') {
        s.setArchiveText('# archive\n- [x] 旧行');
        s.applyOps([{ type: 'complete', line: 9 }]);
        await s.save(); showDone();
        return { res: await s.archive(), archive: s.getArchiveText() };
      }
      if (mode === 'TB-18') {
        s.applyOps([{ type: 'complete', line: 9 }]); showDone();
        return { res: await s.archive(), archive: s.getArchiveText(), tasks: s.getAdapterText() };
      }
      if (mode === 'TB-19') {
        s.applyOps([{ type: 'complete', line: 9 }]);
        await s.save(); showDone();
        s.externalWrite('# tasks\n別内容\n');
        return { res: await s.archive(), archive: s.getArchiveText() };
      }
    };
    return run();
  }, [F1, TODAY, script]);
  const NB = s => s.split('\n').filter(l => l !== '');
  const plan = (text, o) => page.evaluate(([t, opt]) => {
    window.taskboard.test.setToday(opt.today);
    const sortSel = document.getElementById('f-sort');
    sortSel.value = opt.sort || 'file';
    sortSel.dispatchEvent(new Event('change', { bubbles: true }));
    const cb = document.getElementById('f-done');
    cb.checked = !!opt.showDone;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const zoomSel = document.getElementById('f-zoom');
    zoomSel.value = opt.zoom || 'day';
    zoomSel.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.taskboard.test.newSession(t);
    s.setView(opt.view || 'timeline');
    const m = s.getTimeline();
    const note = document.getElementById('tl-note');
    return {
      model: m && {
        items: m.items.map(i => ({
          line: i.line, body: i.body, state: i.state, days: i.days,
          start: i.start, end: i.end, hasDue: i.hasDue, inverted: i.inverted,
          section: i.section, progress: i.progress,
        })),
        from: m.from, to: m.to, days: m.days, dayPx: m.dayPx, todayIn: m.todayIn,
        invalidCount: m.invalidCount, guard: m.guard,
      },
      note: note.hidden ? '' : note.textContent,
      noteWarn: note.className.includes('banner-warn'),
      bars: Array.from(document.querySelectorAll('.tl-bar')).map(b => ({
        cls: b.className, left: b.style.left, width: b.style.width, text: b.textContent,
        handles: Array.from(b.querySelectorAll('.tl-handle')).map(h => h.dataset.edge),
        fill: (b.querySelector('.tl-bar-fill') || {}).style
          ? b.querySelector('.tl-bar-fill').style.width : null,
      })),
      sections: Array.from(document.querySelectorAll('.tl-section-btn')).map(x => x.textContent),
      tickTexts: Array.from(document.querySelectorAll('.tl-tick')).map(x => x.textContent),
      labels: Array.from(document.querySelectorAll('.tl-rows .tl-label')).map(x => x.textContent),
      ticks: document.querySelectorAll('.tl-tick').length,
      todayLine: document.querySelectorAll('.tl-today').length,
      todayLeft: (document.querySelector('.tl-today') || {}).style
        ? document.querySelector('.tl-today').style.left : null,
      tableHidden: document.getElementById('table-wrap').hidden,
      tlHidden: document.getElementById('timeline-view').hidden,
      tabActive: (document.querySelector('#view-tabs button.active') || {}).textContent,
      tabsHidden: document.getElementById('view-tabs').hidden,
      copyLabel: document.getElementById('btn-copy').textContent,
      planTsv: s.getPlanTsv(), listTsv: s.getListTsv(),
    };
  }, [text, Object.assign({ today: TODAY }, o)]);
  const boardOf = (text, opts) => page.evaluate(([t, today, o]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = !!o.showDone;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const s = window.__sBoard = window.taskboard.test.newSession(t);
    s.setView('board');
    return {
      cols: Array.from(document.querySelectorAll('.board-col')).map(c => ({
        sec: c.dataset.section,
        title: c.querySelector('.board-col-title').textContent,
        cards: Array.from(c.querySelectorAll('.board-card')).map(x => ({
          line: Number(x.dataset.line),
          body: x.querySelector('.card-body').textContent,
          drag: x.draggable === true,
          done: x.classList.contains('card-done'),
          tabIndex: x.tabIndex,
          meta: (x.querySelector('.card-meta') || {}).textContent || '',
        })),
      })),
      note: document.getElementById('board-note').hidden ? '' : document.getElementById('board-note').textContent,
      tabs: Array.from(document.querySelectorAll('#view-tabs button')).map(b => b.textContent),
      // textContent は直前のコピー結果表示（.copied）が残ることがあるので、
      // updateCopyButton が常に更新する dataset.label を見る
      copyLabel: document.getElementById('btn-copy').dataset.label,
      tableHidden: document.getElementById('table-wrap').hidden,
    };
  }, [text, TODAY, Object.assign({ showDone: false }, opts)]);
  const searchIn = (view, q, composing) => page.evaluate(async ([v, s, comp]) => {
    const inp = document.getElementById('f-q');
    inp.value = s;
    const e = new InputEvent('input', { bubbles: true });
    if (comp) Object.defineProperty(e, 'isComposing', { get: () => true });
    inp.dispatchEvent(e);
    await new Promise(d => setTimeout(d, 350));
    const rows = v === 'board'
      ? Array.from(document.querySelectorAll('.board-card')).map(x => Number(x.dataset.line))
      : Array.from(document.querySelectorAll('#task-table tbody tr:not(.memo-row)')).map(tr => Number(tr.dataset.line));
    return {
      rows, count: document.getElementById('q-count').textContent,
      hits: document.querySelectorAll('.hit').length,
      empty: document.getElementById('empty-msg').hidden ? '' : document.getElementById('empty-msg').textContent,
      tlNote: document.getElementById('tl-note').hidden ? '' : document.getElementById('tl-note').textContent,
      boardNote: document.getElementById('board-note').hidden ? '' : document.getElementById('board-note').textContent,
    };
  }, [view, q, !!composing]);
  const setView = (v) => page.evaluate(([text, today, view]) => {
    window.taskboard.test.setToday(today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    window.__sF = window.taskboard.test.newSession(text);
    window.__sF.setView(view);
  }, [F6, TODAY, v]);
  const tl = (text, o) => page.evaluate(([t, opt]) => {
    window.taskboard.test.setToday(opt.today);
    const cb = document.getElementById('f-done');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    const z = document.getElementById('f-zoom');
    z.value = opt.zoom || 'day';
    z.dispatchEvent(new Event('change', { bubbles: true }));
    window.__sT = window.taskboard.test.newSession(t);
    window.__sT.setView('timeline');
    // 前のテストで開いたままのポップオーバーを閉じる（バーに重なるとドラッグを奪う）。
    // 閉じる引き金は **mousedown**（body.click() では閉じない）
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }, [text, Object.assign({ today: TODAY }, o)]);

  /* ページ側のヘルパ window.__h（openEdit / set / chips / resetModalFields）。edit・deps・flows が使う。
     page.reload() で消えるので、節ごとに入れ直す（2026-09-25 に edit 節から入口へ移した） */
  const installHelpers = (pg) => pg.evaluate(() => {
    window.__h = {
      openEdit: (body, memoRow) => {
        const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
          .find(x => x.children[1] && x.children[1].textContent.includes(body));
        if (memoRow) tr.nextSibling.querySelector('td').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        else Array.from(tr.querySelectorAll('.btn-child')).find(x => x.textContent === '編集').click();
      },
      set: (id, v) => { document.getElementById(id).value = v; },
      chips: (hostId) => Array.from(document.querySelectorAll('#' + hostId + ' .chip'))
        .map(c => c.textContent.replace('✕', '')),
      // 前回値（タグ・日付・優先度）は仕様どおり新規モーダルに引き継がれるので、
      // 生成行を厳密に照合するテストでは先に全欄を空にする
      resetModalFields: () => {
        for (const id of ['modal-content', 'modal-memo', 'modal-start', 'modal-due', 'modal-pri']) {
          document.getElementById(id).value = '';
        }
        for (const b of document.querySelectorAll('#modal-tag-list .chip-del')) b.click();
        for (const b of document.querySelectorAll('#modal-link-list .chip-del')) b.click();
        for (const b of document.querySelectorAll('#modal-dep-list .chip-del')) b.click();
      },
    };
  });

  const ctx = {
    page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
    ...FX,
    withDialogs, ops, opsError, lineOf, onlyChanged,
    session, addModal, shutModal, ui, sendKey,
    archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers,
  };

  const chosen = only.length ? SECTIONS.filter(s => only.includes(s.name)) : SECTIONS;
  for (const s of chosen) {
    const t0 = Date.now();
    console.log('--- ' + s.name + '（' + s.ids + '）');
    await installHelpers(page);   // window.__h を毎回入れ直す（前の節の reload で消えていてもよい）
    await s.run(ctx);
    console.log('    ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }

  await browser.close();
  r.report('taskboard（docs/specs/taskboard.md と docs/specs/taskboard/*.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
