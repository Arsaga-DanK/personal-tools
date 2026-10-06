'use strict';
/* test/taskboard/flows.js — 節: モード切替とモーダルの殻・ツールバー・自動保存・ハンドル保存の db 名・Check Issue からの受け取り・日付の既定とチップ・長いノート名・考える場所へ
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js flows）
   照合する ID: TB-MS1/MS2・UI1/UI2・AS1〜AS4・FS1・H2〜H4・D4/D5・W2/W3・N1〜N6。期待値の正本は docs/specs/taskboard.md と docs/specs/taskboard/*.md */
module.exports = {
  name: 'flows',
  ids: 'TB-MS1/MS2・UI1/UI2・AS1〜AS4・FS1・H2〜H4・D4/D5・W2/W3・N1〜N6',
  async run(ctx) {
    const { page, context, browser, r, eq, bannerIs, fileUrl, REPO, path, SHOTS, shotPath,
            F1, F2, F2c, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, TODAY, NFD9, NFC9,
            withDialogs, ops, opsError, lineOf, onlyChanged, session, addModal, shutModal, ui, sendKey,
            archive, NB, plan, boardOf, searchIn, setView, tl, installHelpers } = ctx;
  /* ---------- TB-MS1/MS2: モード切替と、lib/ui.css へ移設したモーダルの殻 ---------- */
  await page.goto(fileUrl('web/taskboard.html'));
  const modes = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('nav.modes a'));
    return {
      hrefs: links.map(a => a.getAttribute('href')),
      labels: links.map(a => a.textContent.trim()),
      current: links.filter(a => a.getAttribute('aria-current') === 'page')
        .map(a => a.textContent.trim()),
    };
  });
  r.check('TB-MS1（モードセグメント: Check Issue へ行けて、自分側が aria-current="page"）',
    modes.hrefs.includes('issue.html') && modes.labels.some(l => l.includes('イシュー'))
    && modes.current.length === 1 && modes.current[0].includes('タスク'),
    JSON.stringify(modes));

  // 殻を lib/ui.css へ移した後も、中央固定・背景あり・パネル幅が効いていること（算出スタイルで見る）
  const shell = await page.evaluate(() => {
    const ov = document.getElementById('modal');
    ov.hidden = false;
    const cs = getComputedStyle(ov);
    const panel = ov.querySelector('.modal');
    const ps = getComputedStyle(panel);
    const out = {
      position: cs.position, display: cs.display,
      align: cs.alignItems, justify: cs.justifyContent,
      bg: cs.backgroundColor, zIndex: cs.zIndex,
      panelWidth: parseFloat(ps.width), radius: ps.borderTopLeftRadius,
    };
    ov.hidden = true;
    return out;
  });
  r.check('TB-MS2（lib/ui.css へ移設後もモーダルの殻が効いている: 中央固定・背景・パネル幅）',
    shell.position === 'fixed' && shell.display === 'flex'
    && shell.align === 'center' && shell.justify === 'center'
    && shell.bg !== 'rgba(0, 0, 0, 0)' && shell.zIndex === '200'
    && shell.panelWidth > 0 && shell.radius !== '0px',
    JSON.stringify(shell));

  /* ---------- TB-UI1/UI2: ツールバーの整理と未保存インジケータ ---------- */
  await page.goto(fileUrl('web/taskboard.html'));
  const tbT1 = await page.evaluate((f1) => {
    window.taskboard.test.newSession(f1);
    const bar = document.getElementById('main-toolbar');
    const more = document.getElementById('more-menu');
    const always = Array.from(bar.querySelectorAll(':scope > button'))
      .filter(b => !b.hidden).map(b => b.id);
    const folded = Array.from(more.querySelectorAll('button')).map(b => b.id);
    return { always: always, folded: folded, moreOpen: more.open };
  }, F1);
  r.check('TB-UI1（常時のボタンは最小・低頻度は ⋯ の中・⋯ は既定で閉じている）',
    tbT1.always.includes('btn-add-form') && tbT1.always.includes('btn-copy')
    && !tbT1.always.includes('btn-save')            // 未保存が無いので出ていない
    && ['btn-weekly', 'btn-archive', 'btn-reload', 'btn-copy-all', 'btn-to-gantt']
      .every(id => tbT1.folded.includes(id))
    && tbT1.moreOpen === false,
    JSON.stringify(tbT1));

  const tbT2 = await page.evaluate(async (f1) => {
    const s = window.taskboard.test.newSession(f1);
    const before = document.getElementById('btn-save').hidden;
    s.applyOps([{ type: 'complete', line: 9 }]);
    const dirty = document.getElementById('btn-save').hidden;
    await new Promise(d => setTimeout(d, 1500));   // 自動保存を待つ
    return { before: before, dirtyHidden: dirty,
      afterHidden: document.getElementById('btn-save').hidden };
  }, F1);
  r.check('TB-UI2（［今すぐ保存］は未保存のときだけ出て、自動保存後に消える）',
    tbT2.before === true && tbT2.dirtyHidden === false && tbT2.afterHidden === true,
    JSON.stringify(tbT2));

  /* ---------- TB-AS1〜AS3: 自動保存（明示保存と同じ doSave を通す） ---------- */
  await page.goto(fileUrl('web/taskboard.html'));

  // AS1: ボタンを押さずに、デバウンス後に実際に保存される（時間で確かめる）
  const as1 = await page.evaluate(async (f1) => {
    const s = window.taskboard.test.newSession(f1);
    s.applyOps([{ type: 'complete', line: 9 }]);
    const before = s.getAdapterText();
    await new Promise(d => setTimeout(d, 1500));          // AUTOSAVE_MS = 1200
    const b = document.getElementById('banner');
    return {
      changed: s.getAdapterText() !== before,
      saved: /- \[x\]/.test(s.getAdapterText().split('\n')[8]),
      state: document.getElementById('save-state').textContent,
      bannerKind: b.hidden ? '(hidden)' : b.className,
    };
  }, F1);
  r.check('TB-AS1（ボタンを押さずに自動保存され、静かな表示だけが出る）',
    as1.changed && as1.saved && as1.state.includes('自動保存しました')
    && !as1.bannerKind.includes('banner-success'),
    JSON.stringify(as1));

  // AS2: 外部が触っていたら、自動保存でも**書かない**（目印で不変を見る）
  const as2 = await page.evaluate(async (f1) => {
    const s = window.taskboard.test.newSession(f1);
    s.externalWrite('SENTINEL-EXTERNAL');                 // ディスク側が別内容になった
    s.applyOps([{ type: 'complete', line: 9 }]);
    s.autoSave();                                         // デバウンスを前倒しで発火
    await new Promise(d => setTimeout(d, 200));
    const b = document.getElementById('banner');
    return { disk: s.getAdapterText(), kind: b.className, hidden: b.hidden, text: b.textContent };
  }, F1);
  r.check('TB-AS2（競合時は自動保存でも書き込まず warn — ディスクの内容が不変）',
    as2.disk === 'SENTINEL-EXTERNAL' && !as2.hidden
    && as2.kind.includes('banner-warn') && as2.text.includes('Obsidian'),
    JSON.stringify(as2));

  // AS3: 一括完了の確認が要るときは自動保存しない（確認ダイアログを出さない）
  // 閾値は5件なので、未完了6件の専用フィクスチャを使う（F1 には3件しかない）
  const BULK6 = ['# tasks', '', '## ITK',
    '- [ ] a', '- [ ] b', '- [ ] c', '- [ ] d', '- [ ] e', '- [ ] f', ''].join('\n');
  const as3 = await page.evaluate(async (txt) => {
    let confirmed = 0;
    const orig = window.confirm;
    window.confirm = () => { confirmed++; return true; };
    const s = window.taskboard.test.newSession(txt);
    const ops = [4, 5, 6, 7, 8, 9].map(line => ({ type: 'complete', line: line }));
    s.applyOps(ops);
    const before = s.getAdapterText();
    s.autoSave();
    await new Promise(d => setTimeout(d, 200));
    const b = document.getElementById('banner');
    window.confirm = orig;
    return {
      confirmed: confirmed, unchanged: s.getAdapterText() === before,
      hidden: b.hidden, kind: b.className, text: b.textContent,
    };
  }, BULK6);
  r.check('TB-AS3（閾値以上の一括完了は自動保存せず、確認ダイアログも出さずに info で促す）',
    as3.confirmed === 0 && as3.unchanged && !as3.hidden
    && as3.kind.includes('banner-info') && as3.text.includes('今すぐ保存'),
    JSON.stringify(as3));

  // AS4: そのまま［今すぐ保存］を押せば（確認に OK すれば）保存できる — 逃げ道が生きている
  const as4 = await page.evaluate(async () => {
    const orig = window.confirm;
    let asked = 0;
    window.confirm = () => { asked++; return true; };
    const res = await window.taskboard.test.lastSession.save();
    window.confirm = orig;
    return { asked: asked, ok: res && res.ok,
      saved: /- \[x\] a/.test(window.taskboard.test.lastSession.getAdapterText()) };
  });
  r.check('TB-AS4（自動保存をスキップしても［今すぐ保存］なら確認のうえ保存できる）',
    as4.asked === 1 && as4.ok === true && as4.saved === true, JSON.stringify(as4));

  /* ---------- TB-FS1: ハンドル保存の db 名が変わっていない（lib/fsa.js への移行の回帰・2026-09-25） ---------- */
  const fsDb = await page.evaluate(async () => {
    try {
      const h = ToolFsa.handles('tools-taskboard');
      await h.set('probe', 1);
      const dbs = await indexedDB.databases();
      return { listed: dbs.some(d => d.name === 'tools-taskboard'), back: await h.get('probe') };
    } catch (e) { return { error: String(e) }; }   // ToolFsa が無ければ FAIL として出す（ハーネスを止めない）
  });
  r.check('TB-FS1（ToolFsa.handles が従来の db 名 tools-taskboard に書き、読み戻せる）',
    fsDb.listed && fsDb.back === 1, JSON.stringify(fsDb));

  /* ---------- TB-H2/H3: Check Issue からの受け取り（R8: タスクは論点の下に生まれる） ---------- */
  await page.goto(fileUrl('web/taskboard.html'));
  const h3 = await page.evaluate((f1) => {
    window.taskboard.test.newSession(f1);
    document.getElementById('btn-add-form').click();
    const why = document.getElementById('modal-why');
    const out = { text: why.textContent, hidden: why.hidden, isIssue: why.className.includes('is-issue') };
    document.getElementById('modal').hidden = true;
    return out;
  }, F1);
  r.check('TB-H3（ふつうの追加でも「この一手はどの論点のため？」が一言出る・答えは強制しない）',
    !h3.hidden && h3.text.includes('どの論点のため') && h3.text.includes('Check Issue') && !h3.isIssue,
    JSON.stringify(h3));

  // Check Issue が置いた handoff を持って開く → tasks.md 読込後に追加画面が論点つきで開く
  await page.evaluate(() => sessionStorage.setItem('tools:handoff', JSON.stringify({
    to: 'taskboard', kind: 'task', at: Date.now(),
    text: JSON.stringify({ content: '粒度を確認する', issue: '手順書が書けないのは粒度の合意が無いからではないか',
      memo: '論点: 手順書が書けないのは粒度の合意が無いからではないか', due: '2026-09-30', link: '20260924_現状整理' }),
  })));
  await page.goto(fileUrl('web/taskboard.html'));
  const h2 = await page.evaluate((f1) => {
    const consumed = sessionStorage.getItem('tools:handoff') === null;   // 起動時に取り出して消している
    const beforeLoad = document.getElementById('modal').hidden;            // 未読込のうちは開かない
    window.taskboard.test.newSession(f1);                                  // 読み込めた瞬間に開く
    return {
      consumed, beforeLoad,
      open: !document.getElementById('modal').hidden,
      content: document.getElementById('modal-content').value,
      memo: document.getElementById('modal-memo').value,
      due: document.getElementById('modal-due').value,
      why: document.getElementById('modal-why').textContent,
      isIssue: document.getElementById('modal-why').className.includes('is-issue'),
      link: Array.from(document.querySelectorAll('#modal-link-list *')).map(e => e.textContent).join(' '),
      moreOpen: document.getElementById('modal-more').open,
    };
  }, F1);
  r.check('TB-H2（Check Issue からの受け取り: 読込後に追加画面が 内容・論点メモ・期限・関連ノート つきで開く）',
    h2.consumed && h2.beforeLoad && h2.open
    && h2.content === '粒度を確認する' && h2.memo.startsWith('論点: ')
    && h2.due === '2026-09-30' && h2.why.includes('論点:') && h2.isIssue
    && h2.link.includes('20260924_現状整理') && h2.moreOpen,
    JSON.stringify(h2));
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });

  /* ---------- TB-H4: 受け取りの project で追加モーダルのセクションを選んでおく ---------- */
  const h4 = [];
  for (const proj of ['UL', 'その他', '存在しない案件']) {
    await page.evaluate(() => localStorage.clear());
    await page.evaluate((pj) => sessionStorage.setItem('tools:handoff', JSON.stringify({
      to: 'taskboard', kind: 'task', at: Date.now(),
      text: JSON.stringify({ content: 'H4', issue: '論点', memo: '論点: 論点', due: '', link: 'n', project: pj }),
    })), proj);
    await page.goto(fileUrl('web/taskboard.html'));
    h4.push(await page.evaluate((f1) => {
      window.taskboard.test.newSession(f1);
      const v = document.getElementById('modal-section').value;
      document.getElementById('modal').hidden = true;
      return v;
    }, F1));
  }
  r.check('TB-H4（受け取りに project があれば同じ名前のセクションを選ぶ・無い名前なら既定のまま）',
    eq(h4, ['UL', 'その他', 'PEW']), JSON.stringify(h4));

  /* ---------- TB-D4/D5/W2: 日付は今日が既定・チップ・モーダルが横にはみ出さない ---------- */
  await page.goto(fileUrl('web/taskboard.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const d4 = await page.evaluate(async (f1) => {
    const s = window.taskboard.test.newSession(f1);
    const today = window.ToolEdit.today();
    document.getElementById('btn-add-form').click();
    const first = { start: document.getElementById('modal-start').value, due: document.getElementById('modal-due').value };
    // 期限を空にして追加 → 画面は開いたまま（続けて足す）なので欄は空のまま。開き直すと今日（前の値を引き継がない — TB-Q73）
    document.getElementById('modal-content').value = 'D4 テスト';
    document.getElementById('modal-due').value = '';
    document.getElementById('modal-due').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#modal .modal-actions .primary').click();
    await new Promise(r => setTimeout(r, 200));
    const cont = { open: !document.getElementById('modal').hidden, start: document.getElementById('modal-start').value, due: document.getElementById('modal-due').value };
    document.getElementById('btn-add-form').click();
    const second = { start: document.getElementById('modal-start').value, due: document.getElementById('modal-due').value };
    document.getElementById('modal').hidden = true;
    return { today, first, cont, second };
  }, F1);
  r.check('TB-D4（開くたびに開始日・期限は今日／開いたまま続けて足すときは直前の値のまま／開き直すと今日）',
    d4.first.start === d4.today && d4.first.due === d4.today
    && d4.cont.open && d4.cont.start === d4.today && d4.cont.due === ''
    && d4.second.start === d4.today && d4.second.due === d4.today,
    JSON.stringify(d4));

  const d5 = await page.evaluate(() => {
    const today = window.ToolEdit.today(), add = window.ToolEdit.addDays;
    document.getElementById('btn-add-form').click();
    const due = document.getElementById('modal-due');
    let changes = 0; due.addEventListener('change', () => changes++);
    const chips = Array.from(due.parentElement.querelectorAll ? [] : due.nextElementSibling.querySelectorAll('.date-chip'));
    const byLabel = l => chips.find(c => c.textContent === l);
    due.value = today; byLabel('+1').click(); const p1 = due.value;
    byLabel('+7').click(); const p8 = due.value;             // 欄の値からずらす（今日+1 → +8）
    byLabel('今日').click(); const t = due.value;
    const startChips = document.getElementById('modal-start').nextElementSibling;
    document.getElementById('modal').hidden = true;
    return { labels: chips.map(c => c.textContent), p1, p8, t, changes,
      exp1: add(today, 1), exp8: add(today, 8), today,
      startHasChips: !!startChips && startChips.classList.contains('date-chips') };
  });
  r.check('TB-D5（日付チップは 今日/+1/+7 の3つ・欄の値からずらす・change が発火する）',
    JSON.stringify(d5.labels) === JSON.stringify(['今日', '+1', '+7'])
    && d5.p1 === d5.exp1 && d5.p8 === d5.exp8 && d5.t === d5.today && d5.changes === 3
    && d5.startHasChips,
    JSON.stringify(d5));

  // W2: 本文が長いタスクがあると依存セレクトがモーダルを押し広げていた（利用者のスクショ）
  await page.setViewportSize({ width: 700, height: 760 });
  const LONG = ['# tasks', '', '## ITK',
    '- [ ] 先方に確認：検証環境構築の認識合わせ(ITKインフラ担当者)（IPアドレス・ホスト名・ファイアウォールの穴あけ依頼・切替日程の合意を含む） 🛫 2026-09-16 📅 2026-10-02',
    '- [ ] ゴールの仮決め 🛫 2026-09-24 📅 2026-09-25', '', '## その他', ''].join('\n');
  const w2m = await page.evaluate(async (txt) => {
    window.taskboard.test.newSession(txt);
    // 行の［編集］ボタンで編集モーダルを開く（__h.openEdit と同じ経路。ここではヘルパ未導入なので直接）
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr'))
      .find(x => x.children[1] && x.children[1].textContent.includes('ゴールの仮決め'));
    Array.from(tr.querySelectorAll('.btn-child')).find(x => x.textContent === '編集').click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('modal-more').open = true;
    await new Promise(r => setTimeout(r, 50));
    const m = document.querySelector('#modal .modal');
    const opts = Array.from(document.querySelectorAll('#modal-dep-select option'));
    const longOpt = opts.find(o => (o.title || '').includes('ファイアウォール'));
    const out = {
      open: !document.getElementById('modal').hidden,
      docNoScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      modalNoScroll: m.scrollWidth <= m.clientWidth,
      selectFits: document.getElementById('modal-dep-select').getBoundingClientRect().right <= m.getBoundingClientRect().right + 1,
      shortLabel: !!longOpt && longOpt.textContent.length <= 40 && longOpt.textContent.endsWith('…'),
      fullTitle: !!longOpt && longOpt.title.includes('切替日程の合意'),
    };
    document.getElementById('modal').hidden = true;
    return out;
  }, LONG);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('TB-W2（長い本文の依存セレクトがあっても 700px でモーダルが横にはみ出さない・選択肢は40字＋title に全文）',
    w2m.open && w2m.docNoScroll && w2m.modalNoScroll && w2m.selectFits && w2m.shortLabel && w2m.fullTitle,
    JSON.stringify(w2m));

  /* ---------- TB-W3: 長い関連ノート名で内容の列が潰れない（利用者のスクリーンショット・2026-09-25） ---------- */
  const W3NOTE = '2026-09-25_先方に確認：検証環境構築の認識合わせ(ITKインフラ担当者)';
  const W3 = ['# tasks', '', '## ITK', '',
    '- [ ] 先方に確認：検証環境構築の認識合わせ(ITKインフラ担当者) [[' + W3NOTE + ']] 🛫 2026-09-16 📅 2026-10-02 ⏫',
    '- [ ] 本番環境停止手順書の作成 🛫 2026-09-16 📅 2026-10-02 ⏫',
    '\t- [ ] 大谷さんが叩き台を作成してくれるのでそれをベースに運営チームに展開できるまで具体化した資料を作成する(スクショ)',
    ''].join('\n');
  const w3 = await page.evaluate(async ([txt, note]) => {
    window.taskboard.test.newSession(txt);
    const tr = document.querySelector('#task-table tbody tr:not(.sec-row)');   // 見出しの行を避ける（TB-SH）
    const body = tr.querySelector('td.cell-body');
    const chip = tr.querySelector('.chip');
    const linksTd = chip.closest('td');
    const table = document.getElementById('task-table');
    const fs = parseFloat(getComputedStyle(chip).fontSize);
    const out = {
      bodyW: Math.round(body.getBoundingClientRect().width),
      linksW: Math.round(linksTd.getBoundingClientRect().width),
      tableW: Math.round(table.getBoundingClientRect().width),
      chipEm: +(chip.getBoundingClientRect().width / fs).toFixed(1),
      fullTitle: (chip.title || '').includes(note),
      docNoScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
    // 編集モーダルのチップも同じ長さでモーダルをはみ出さず、✕ が見える
    Array.from(tr.querySelectorAll('.btn-child')).find(x => x.textContent === '編集').click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('modal-more').open = true;
    await new Promise(r => setTimeout(r, 50));
    const m = document.querySelector('#modal .modal');
    const mc = document.querySelector('#modal-link-list .chip');
    const del = mc && mc.querySelector('.chip-del');
    const mr = m.getBoundingClientRect(), cr = mc ? mc.getBoundingClientRect() : null, dr = del ? del.getBoundingClientRect() : null;
    out.modalNoScroll = m.scrollWidth <= m.clientWidth;
    out.modalChipFits = !!cr && cr.right <= mr.right + 1;
    out.delVisible = !!dr && dr.width > 0 && dr.right <= cr.right + 1 && dr.bottom <= cr.bottom + 1;
    document.getElementById('modal-content').value = document.getElementById('modal-content').value; // 変更なし
    document.getElementById('modal-cancel').click();
    return out;
  }, [W3, W3NOTE]);
  r.check('TB-W3（長い関連ノート名: 内容の列が関連ノートの列より広く表の3割以上・チップは9em以内で全文は title・横スクロールなし・モーダルのチップもはみ出さず ✕ が見える）',
    w3.bodyW > w3.linksW && w3.bodyW >= w3.tableW * 0.3 && w3.chipEm <= 9.5 && w3.fullTitle && w3.docNoScroll
    && w3.modalNoScroll && w3.modalChipFits && w3.delVisible,
    JSON.stringify(w3));

  /* ---------- TB-W4: 一覧のチップは先頭の日付を省く（2026-10-01・利用者「関連ノート列はもうちょっと狭めて大丈夫」） ---------- */
  const W4N = ['2026-09-25_JP1でFTP確認', '2026-09-25', '議事録 2026-09-25'];
  const w4 = await page.evaluate(async (names) => {
    window.taskboard.test.newSession(['# tasks', '', '## A', '', '- [ ] 三つ ' + names.map(n => '[[' + n + ']]').join(' '), ''].join('\n'));
    const e = document.getElementById('cfg-vault'); e.value = 'V'; e.dispatchEvent(new Event('change'));
    const tr = document.querySelector('#task-table tbody tr[data-line]');
    const chips = Array.from(tr.querySelectorAll('.chip')).filter(c => c.closest('td') === tr.children[6]);
    const out = { text: chips.map(c => c.textContent), title: chips.map(c => c.title), href: chips.map(c => c.getAttribute('href') || '') };
    Array.from(tr.querySelectorAll('.btn-child')).find(x => x.textContent === '編集').click();
    await new Promise(r => setTimeout(r, 150));
    out.modal = Array.from(document.querySelectorAll('#modal-link-list .chip')).map(c => c.textContent.replace('✕', ''));
    document.getElementById('modal-cancel').click();
    e.value = ''; e.dispatchEvent(new Event('change'));
    return out;
  }, W4N);
  r.check('TB-W4（一覧のチップは先頭の「YYYY-MM-DD_」だけ省く・日付だけ／途中の日付はそのまま・title とリンク先は全文・モーダルは全文）',
    eq(w4.text, ['JP1でFTP確認', '2026-09-25', '議事録 2026-09-25'])
    && w4.title.every((t, i) => t.startsWith(W4N[i]))
    && eq(w4.href, W4N.map(n => 'obsidian://open?vault=V&file=' + encodeURIComponent(n)))
    && eq(w4.modal, W4N.map(n => '[[' + n + ']]')), JSON.stringify(w4));

  /* ========== TB-N1〜N6: タスクを考える場所へ（イシューノートを開く／作る） ========== */
  const fsaReset = () => page.evaluate(() => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.picked = 0;
  });
  // 本文で行を探して［🎯］を押し、少し待って結果を返す
  const think = (bodyText, waitMs) => page.evaluate(async ([txt, ms]) => {
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr')).find(x => x.textContent.includes(txt));
    const btn = tr && Array.from(tr.querySelectorAll('.btn-child')).find(b => b.textContent === '🎯');
    if (!btn) return { noBtn: true };
    btn.click();
    await new Promise(d => setTimeout(d, ms));
    const b = document.getElementById('banner');
    return {
      files: Object.keys(window.__fsa.files).sort(), md: window.__fsa.files, picked: window.__fsa.picked,
      text: window.__s.getAdapterText(),
      banner: b.hidden ? '' : b.textContent,
      bannerLink: (b.querySelector('a[href^="obsidian:"]') || {}).href || '',
    };
  }, [bodyText, waitMs]);
  // #102 は数字だけなのでタグではなく内容の一部（modalContentOf）。ノート名では # が - になる（Obsidian の禁止文字）
  const N_NOTE = TODAY + '_資料作成 -102';
  const N_MD = ['---', 'created: ' + TODAY, 'status: open', 'project: PEW', 'tags: [issue]', '---', '# 資料作成 #102', '',
    '← タスク: [[tasks]]', '', '## 論点', '',
    '> 論点は答えを先に置いた1行（〜ではなく〜ではないか）。確認すること・やることは `## 掘る` に `- [ ]`（論点の一覧に出ない）', '', '- [ ] ', '', '## 掘る', '',
    '> 10分で論点の行が書けなければ「悩んでいる」— 型（A/B）を確かめる／人に聞く／一次情報を見る', '', '- ', ''].join('\n');
  const N_LINE9 = '- [ ] 資料作成 #102 [[2026-07-07]] [[' + N_NOTE + ']]';

  await session(F1); await fsaReset();
  const n1 = await think('資料作成', 600);
  r.check('TB-N1（イシューノートの無い行の［🎯］: フォルダを1回選び、骨格どおりのノートが作られ、行末に [[…]] が足されて保存される）',
    !n1.noBtn && n1.picked === 1 && eq(n1.files, [N_NOTE + '.md']) && n1.md[N_NOTE + '.md'] === N_MD
    && lineOf(n1.text, 9) === N_LINE9 && onlyChanged(n1.text, F1, [9])
    && n1.banner.includes(N_NOTE) && n1.bannerLink === '',
    JSON.stringify([n1.noBtn, n1.picked, n1.files, n1.md && n1.md[N_NOTE + '.md'], lineOf(n1.text || '', 9), n1.banner]));

  await session(F1); await fsaReset();
  await page.evaluate(() => { window.__fsa.files['2026-07-14_TODO.md'] = '# 既存'; });
  const n2 = await think('資料Rv', 600);
  r.check('TB-N2（関連ノートがイシューフォルダに実在する行の［🎯］: 作らず・tasks は不変・開くだけ）',
    !n2.noBtn && eq(n2.files, ['2026-07-14_TODO.md']) && n2.text === F1 && n2.banner.includes('2026-07-14_TODO'),
    JSON.stringify([n2.noBtn, n2.files, n2.text === F1, n2.banner]));
  r.check('TB-N7（開くだけのときも project が無ければ足す: frontmatter なしのノートに project: <セクション>・tasks は不変）',
    !n2.noBtn && n2.md['2026-07-14_TODO.md'] === '---\nproject: PEW\n---\n# 既存' && n2.text === F1,
    JSON.stringify(n2.md && n2.md['2026-07-14_TODO.md']));
  const n8 = await page.evaluate(() => {
    const f = window.taskboard.test.fillProject;
    if (!f) return null;
    return [
      f('# 本文', 'PEW'),
      f('---\ncreated: 2026-09-14\nstatus: closed\ntags:\n  - issue\n---\n# 本文', 'PEW'),
      f('---\nstatus: open\nproject: ITK\n---\n# 本文', 'PEW'),
      f('---\nstatus: open\nproject: \ntags: [issue]\n---\n# 本文', 'PEW'),
      f('# 本文', 'a: b'),
    ];
  });
  r.check('TB-N8（fillProject: 無ければ作る・status の直後に挿入・既存の値は上書きしない・空は埋める・YAML の記号は引用）',
    eq(n8, ['---\nproject: PEW\n---\n# 本文',
      '---\ncreated: 2026-09-14\nstatus: closed\nproject: PEW\ntags:\n  - issue\n---\n# 本文',
      '---\nstatus: open\nproject: ITK\n---\n# 本文',
      '---\nstatus: open\nproject: PEW\ntags: [issue]\n---\n# 本文',
      '---\nproject: "a: b"\n---\n# 本文']),
    JSON.stringify(n8));

  await session(F1); await fsaReset();
  const n3 = await page.evaluate(async () => {
    document.getElementById('btn-add-form').click();
    document.getElementById('modal-content').value = '';
    const tb3 = document.getElementById('modal-think'); if (tb3) tb3.click();
    await new Promise(d => setTimeout(d, 300));
    const b = document.getElementById('banner');
    return { open: !document.getElementById('modal').hidden, picked: window.__fsa.picked,
      files: Object.keys(window.__fsa.files), banner: b.hidden ? '' : b.className + '|' + b.textContent };
  });
  r.check('TB-N3（新規モーダルで内容が空のまま［🎯 考える場所へ］: warn で止まり、ピッカーもファイルも出ない）',
    n3.open && n3.picked === 0 && n3.files.length === 0 && n3.banner.includes('warn') && n3.banner.includes('内容'),
    JSON.stringify(n3));
  await shutModal();

  await session(F1); await fsaReset();
  const n4 = await page.evaluate(async () => {
    const tr = Array.from(document.querySelectorAll('#task-table tbody tr')).find(x => x.textContent.includes('資料作成'));
    Array.from(tr.querySelectorAll('.btn-child')).find(b => b.textContent === '編集').click();
    const open1 = !document.getElementById('modal').hidden;
    const tb4 = document.getElementById('modal-think'); if (tb4) tb4.click();
    await new Promise(d => setTimeout(d, 600));
    return { open1, open2: !document.getElementById('modal').hidden, files: Object.keys(window.__fsa.files),
      text: window.__s.getAdapterText() };
  });
  r.check('TB-N4（編集モーダルの［🎯 考える場所へ］: ノートが作られ、関連ノートに足されて保存され、モーダルが閉じる）',
    n4.open1 && !n4.open2 && eq(n4.files, [N_NOTE + '.md']) && lineOf(n4.text, 9) === N_LINE9 && onlyChanged(n4.text, F1, [9]),
    JSON.stringify([n4.open1, n4.open2, n4.files, lineOf(n4.text || '', 9)]));

  const n5 = await page.evaluate(() => (window.ToolEdit && ToolEdit.noteFileName)
    ? [ToolEdit.noteFileName('a/b: c', '2026-08-04'), ToolEdit.noteFileName('', '2026-08-04'),
       ToolEdit.noteFileName('資料 #102 [x]', '2026-08-04')] : null);
  r.check('TB-N5（ToolEdit.noteFileName — Check Issue の IS-16 と同じ規則: OS と Obsidian の禁止文字は -、空は 無題）',
    eq(n5, ['2026-08-04_a-b- c.md', '2026-08-04_無題.md', '2026-08-04_資料 -102 -x-.md']), JSON.stringify(n5));

  await session(F1); await fsaReset();
  await page.evaluate(() => {
    window.__fsa.files['2026-07-14_TODO.md'] = '# 既存';
    const e = document.getElementById('cfg-vault'); e.value = 'V'; e.dispatchEvent(new Event('change'));
  });
  const n6 = await think('資料Rv', 600);
  await page.evaluate(() => { const e = document.getElementById('cfg-vault'); e.value = ''; e.dispatchEvent(new Event('change')); });
  r.check('TB-N6（vault 名あり: バナーに Obsidian のリンク。外部スキームなのでページは離れない）',
    !n6.noBtn && n6.bannerLink === 'obsidian://open?vault=V&file=2026-07-14_TODO' && n6.text === F1,
    JSON.stringify([n6.noBtn, n6.bannerLink, n6.banner]));

  },
};
