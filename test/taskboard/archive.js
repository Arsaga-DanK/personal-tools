'use strict';
/* test/taskboard/archive.js — 節: アーカイブ先は 03_Tasks/archive/YYYY-MM.md・書いたら読み直す・アーカイブの表示（2026-10-06・TB-Q75）
   入口: test/taskboard.js（ctx を受け取る。単独実行は ./test/run taskboard archive）
   照合する ID: TB-AF1〜AF5・TB-AV1〜AV4。期待値の正本は docs/specs/taskboard/archive.md */
module.exports = {
  name: 'archive',
  ids: 'TB-AF1〜AF5・TB-AV1〜AV4',
  async run(ctx) {
    const { page, r, eq, fileUrl, F1, TODAY, withDialogs } = ctx;
    await page.goto(fileUrl('web/taskboard.html'));
    const DONE9 = '- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04';
    // F1 の9行目を完了にして保存し、「終了を含む」を ON にしてアーカイブする（engine 節の archive ヘルパと同じ流れ）。
    // pre = [[パス, 本文], …] を先にアーカイブのフォルダへ置く
    const archiveOnce = (today, pre) => withDialogs('accept', () => page.evaluate(async ([f1, td, files]) => {
      window.taskboard.test.setToday(td);
      const s = window.taskboard.test.newSession(f1);
      window.__s = s;
      if (files) for (const [p, t] of files) s.setArchiveFile(p, t);
      s.applyOps([{ type: 'complete', line: 9 }]);
      await s.save();
      const cb = document.getElementById('f-done'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      const res = await s.archive();
      return { res, files: s.listArchiveFiles(), tasks: s.getAdapterText(), banner: document.getElementById('banner').textContent };
    }, [F1, today, pre || null]));

    /* ---------- TB-AF1: 月のファイルへ・archive.md には書かない ---------- */
    const af1 = await archiveOnce(TODAY, [['archive.md', 'X\n']]);
    const aug = af1.result.files['archive/2026-08.md'] || '';
    r.check('TB-AF1（archive/2026-08.md へ・archive.md は変えない・確認の文に書く先）',
      af1.result.res.ok === true && af1.result.files['archive.md'] === 'X\n' && aug.startsWith('# archive\n') && aug.includes(DONE9)
      && eq(af1.messages, ['1件を archive/2026-08.md へ移動します。よろしいですか？']), JSON.stringify(af1));

    /* ---------- TB-AF2: 月をまたぐ（TB-AF1 のセッションの続き） ---------- */
    const af2 = await withDialogs('accept', () => page.evaluate(async () => {
      const s = window.__s;
      const before = s.listArchiveFiles()['archive/2026-08.md'];
      window.taskboard.test.setToday('2026-09-02');
      const i = s.getText().split('\n').findIndex(l => l.startsWith('- [ ] ')) + 1;   // 残っている最初の未完了（資料Rv）を完了にして移す
      s.applyOps([{ type: 'complete', line: i }]);
      await s.save();
      const res = await s.archive();
      return { res, before, files: s.listArchiveFiles() };
    }));
    r.check('TB-AF2（9月は archive/2026-09.md へ・8月のファイルは変えない）',
      af2.result.res.ok === true && af2.result.files['archive/2026-08.md'] === af2.result.before
      && (af2.result.files['archive/2026-09.md'] || '').includes('資料Rv'), JSON.stringify(af2.result));

    /* ---------- TB-AF3: 書いたあとの読み直しが違う ---------- */
    const af3 = await withDialogs('accept', () => page.evaluate(async ([f1, td]) => {
      window.taskboard.test.setToday(td);
      const s = window.taskboard.test.newSession(f1);
      const folder = state.archiveFolder;
      const real = folder.writeFile;
      folder.writeFile = (p, text) => real.call(folder, p, text.slice(0, Math.floor(text.length / 2)));   // 途中で切れた
      s.applyOps([{ type: 'complete', line: 9 }]);
      await s.save();
      const cb = document.getElementById('f-done'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      const res = await s.archive();
      folder.writeFile = real;
      return { res, tasks: s.getAdapterText(), banner: document.getElementById('banner').textContent };
    }, [F1, TODAY]));
    r.check('TB-AF3（読み直しが書いたものと違えば tasks.md から消さない）',
      af3.result.res.ok === false && af3.result.res.reason === 'archverify' && af3.result.tasks.includes(DONE9)
      && af3.result.banner.includes('消していません'), JSON.stringify(af3.result));

    /* ---------- TB-AF4: tasks.md のあるフォルダか ---------- */
    const af4 = await page.evaluate(async () => {
      if (typeof isTasksFolder !== 'function') return null;
      const tasks = { name: 'tasks.md' };
      const nf = () => { const e = new Error('nf'); e.name = 'NotFoundError'; return e; };
      const dir = (fh) => ({ name: 'x', getFileHandle: async (n) => { if (n !== 'tasks.md' || !fh) throw nf(); return fh; } });
      const same = { isSameEntry: async (o) => o === tasks };
      const other = { isSameEntry: async () => false };
      const noApi = { getFile: async () => ({ text: async () => '# tasks\n' }) };
      return [await isTasksFolder(dir(same), tasks, 'tasks.md', ''), await isTasksFolder(dir(other), tasks, 'tasks.md', ''),
        await isTasksFolder(dir(null), tasks, 'tasks.md', ''), await isTasksFolder(dir(noApi), tasks, 'tasks.md', '# tasks\n')];
    });
    r.check('TB-AF4（isTasksFolder: 同じ tasks.md なら true・同名の別ファイルと tasks.md の無いフォルダは false・isSameEntry が無ければ中身で）',
      eq(af4, [true, false, false, true]), JSON.stringify(af4));

    /* ---------- TB-AF5: 写しは archive.md と月のファイルの両方から数える ---------- */
    const af5 = await archiveOnce(TODAY, [['archive.md', '# archive\n\n## PEW\n\n- [x] 前に移した [[2026-07-07]] ✅ 2026-07-30\n']]);
    const af5copy = await page.evaluate(() => { const d = ToolStorage.load('tasklinks'); return d && d.notes ? d.notes['2026-07-07'] : null; });
    r.check('TB-AF5（関連ノートの写しのアーカイブ分は archive.md と archive/*.md の全部から数える — total 3・done 2）',
      af5.result.res.ok === true && !!af5copy && af5copy.total === 3 && af5copy.done === 2, JSON.stringify(af5copy));

    /* ---------- TB-AV1〜AV4: アーカイブの表示 ---------- */
    const view = () => page.evaluate(() => {
      const v = document.getElementById('archive-view');
      if (!v) return { missing: true };
      const tab = document.querySelector('#view-tabs [data-view="archive"]');
      return {
        hidden: v.hidden, listHidden: document.getElementById('table-wrap').hidden, copyHidden: document.getElementById('btn-copy').hidden,
        files: Array.from(v.querySelectorAll('section.av-file')).map(s => s.dataset.path),
        secs: Array.from(v.querySelectorAll('.av-sec')).map(h => h.textContent),
        tasks: Array.from(v.querySelectorAll('.av-task')).map(t => ({
          body: (t.querySelector('.av-body') || {}).textContent, date: (t.querySelector('.av-date') || {}).textContent || '', child: t.classList.contains('av-child') })),
        memos: Array.from(v.querySelectorAll('.av-memo')).map(m => m.textContent),
        empty: (v.querySelector('.av-empty') || {}).textContent || '', count: document.getElementById('q-count').textContent,
        tabShown: !!tab && !tab.hidden, tabActive: !!tab && tab.classList.contains('active'), optsHidden: document.querySelector('#main-toolbar .opts').hidden,
        band: (() => { const t = ['#view-tabs', '#f-q', '#more-menu'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top)); return Math.max(...t) - Math.min(...t) <= 14; })(),
      };
    });
    const openArchive = () => page.evaluate(async () => {
      const b = document.getElementById('btn-archive-view');   // ⋯ の［アーカイブを見る］（ふだんのタブは3つのまま — 1280px で見出しを2段にしない・TB-V6）
      if (b) b.click();
      await new Promise(res => setTimeout(res, 150));
    });
    const toList = () => page.evaluate(() => { const b = document.querySelector('#view-tabs [data-view="list"]'); if (b) b.click(); });
    await page.evaluate(([f1, td]) => {
      window.taskboard.test.setToday(td);
      const s = window.taskboard.test.newSession(f1);
      s.setArchiveFile('archive.md', '# archive\n\n## PEW\n\n- [x] 前に移した ✅ 2026-07-30\n');
      s.setArchiveFile('archive/2026-07.md', '# archive\n\n## ITK\n\n- [x] 先方に確認 ✅ 2026-07-20\n\t- 先方の回答: ネットワークで制御\n\t- [x] 子の確認 ✅ 2026-07-19\n');
    }, [F1, TODAY]);
    await openArchive();
    const av1 = await view();
    r.check('TB-AV1（⋯ から開く: タブ［アーカイブ］が出て選ばれる・月のファイルが新しい順で最後に archive.md・案件ごと・済んだ日・メモと子・リスト・絞り込み・コピーは隠れる・見出しは1段）',
      !av1.missing && !av1.hidden && av1.listHidden && av1.copyHidden && av1.tabShown && av1.tabActive && av1.optsHidden && av1.band && eq(av1.files, ['archive/2026-07.md', 'archive.md']) && av1.secs.includes('ITK')
      && av1.tasks.some(t => t.body === '先方に確認' && t.date === '2026/7/20(月)') && av1.memos.includes('先方の回答: ネットワークで制御')
      && av1.tasks.some(t => t.body === '子の確認' && t.child), JSON.stringify(av1));
    await page.fill('#f-q', 'ネットワーク');
    await page.waitForTimeout(400);
    const av2 = await view();
    r.check('TB-AV2（検索はメモも探す: 「ネットワーク」で「先方に確認」だけ・1 件ヒット）',
      !av2.missing && eq(av2.tasks.filter(t => !t.child).map(t => t.body), ['先方に確認']) && av2.count === '1 件ヒット', JSON.stringify(av2));
    await page.fill('#f-q', '');
    await page.waitForTimeout(400);
    await toList();
    const inList = await page.evaluate(() => ({ tabHidden: document.querySelector('#view-tabs [data-view="archive"]').hidden, optsShown: !document.querySelector('#main-toolbar .opts').hidden }));
    await archiveOnce(TODAY);
    await openArchive();
    const av3 = await view();
    r.check('TB-AV3（リストに戻るとタブ［アーカイブ］は消えて絞り込みが戻る・リストでアーカイブしたあと開くと、その月のファイルに出る）',
      inList.tabHidden && inList.optsShown && !av3.missing && av3.files.includes('archive/2026-08.md') && av3.tasks.some(t => (t.body || '').includes('資料作成')), JSON.stringify([inList, av3]));
    await page.evaluate(([f1, td]) => { window.taskboard.test.setToday(td); window.taskboard.test.newSession(f1); }, [F1, TODAY]);
    await openArchive();
    const av4 = await view();
    r.check('TB-AV4（何も無ければ「まだアーカイブはありません」）', av4.empty === 'まだアーカイブはありません', JSON.stringify(av4));
    await toList();   // 表示の選択は localStorage に残るので、次の節のためにリストへ戻す

    // この節のアーカイブが関連ノートの写しに残した数を消す。メモリのセッションは全部「(メモリ)」という同じ名前なので、
    // 次の節の読み込みがその数を引き継いでしまう（TB-LN6 の作り — 同じファイルの前の写しから引き継ぐ）
    await page.evaluate(() => { try { localStorage.removeItem('tools:tasklinks'); } catch (_) { /* 消せなくても次の節が落ちて分かる */ } });
  },
};
