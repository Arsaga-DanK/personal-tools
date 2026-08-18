'use strict';
/* 目的: docs/specs/vaultlint.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/vaultlint.js  /  ./test/run vaultlint

   照合するID: VL-01〜12（純関数）＋ VL-U1〜U4（UI 経路）
   仕様の正本は docs/specs/vaultlint.md。期待値を変えるときは spec を先に直す。
   FSA（showDirectoryPicker）はヘッドレスで自動化不能のため Chrome 実機スモーク（spec 参照）。
   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

// 不可視・紛らわしい文字はコードポイントで組む（ソースへの実文字混入と誤読を防ぐ）
const NBSP = '\u00A0';
const IDEO_SPACE = '\u3000';

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/vaultlint.html'));

  // cfg = vault のフォルダ構成（lib/config.js）。省略時は「未設定」— 各ケースが前提を明示する
  const lint = (files, today, cfg) => page.evaluate(([fs, td, cf]) => {
    window.vaultlint.test.setConfig(cf);
    const res = window.vaultlint.lint(fs, td);
    // 照合しやすい形に要約（issues は件数と主要フィールドだけ）
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      broken: res.issues.brokenLinks.map(i => [i.file, i.line, i.target]),
      missing: res.issues.missingAttachments.map(i => [i.file, i.line, i.target]),
      bad: res.issues.badNames.map(i => [i.path, i.reason]),
      dup: res.issues.dupBasenames.map(i => [i.base, i.paths]),
      inbox: (res.issues.inbox || []).map(i => [i.path, i.date, i.age, i.pending]),
      stats: res.stats,
      warnings: res.warnings,
    };
  }, [files, today || null, cfg || null]);

  /* ========== VL-01〜05: リンク解決 ========== */
  const v01 = await lint([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }]);
  r.check('VL-01（解決できるリンクは報告しない）',
    v01.broken.length === 0 && v01.stats.links === 1, JSON.stringify(v01));

  const v02 = await lint([{ path: 'a.md', text: '[[c]]' }]);
  r.check('VL-02（リンク切れを file・line・target 付きで報告）',
    eq(v02.broken, [['a.md', 1, 'c']]), JSON.stringify(v02.broken));

  const v03a = await lint([{ path: 'a.md', text: '[[B]]' }, { path: 'b.md', text: '' }]);
  const v03b = await lint([{ path: 'a.md', text: '[[ｂ]]' }, { path: 'b.md', text: '' }]);
  r.check('VL-03（大文字小文字は同一視・全角半角は別名）',
    v03a.broken.length === 0 && v03b.broken.length === 1,
    JSON.stringify([v03a.broken, v03b.broken]));

  const v04a = await lint([{ path: 'a.md', text: '[[dir/b]]' }, { path: 'dir/b.md', text: '' }]);
  const v04b = await lint([{ path: 'a.md', text: '[[dir/b]]' }, { path: 'dir2/b.md', text: '' }]);
  r.check('VL-04（/ を含むターゲットはパス修飾として厳密照合）',
    v04a.broken.length === 0 && v04b.broken.length === 1,
    JSON.stringify([v04a.broken, v04b.broken]));

  const v05 = await lint([
    { path: 'a.md', text: '[[b|別名]] [[b#見出し]] [[b#^blk]] [[#自分]]' },
    { path: 'b.md', text: '' },
  ]);
  r.check('VL-05（エイリアス・見出し・ブロックを剥がして解決・自ファイル参照は対象外）',
    v05.broken.length === 0, JSON.stringify(v05.broken));

  /* ========== VL-06〜07: 添付 ========== */
  const v06 = await lint([
    { path: 'a.md', text: '![[img.png]]\n![x](files/doc.pdf)\n![y](https://ex.com/i.png)' },
    { path: '98_Assets/img.png' },
  ]);
  r.check('VL-06（添付はベース名解決・http 等スキーム付きは対象外）',
    eq(v06.missing, [['a.md', 2, 'files/doc.pdf']]), JSON.stringify(v06.missing));

  const v07 = await lint([
    { path: 'a.md', text: '![z](My%20File.pdf)' },
    { path: 'My File.pdf' },
  ]);
  r.check('VL-07（%エンコードをデコードして照合）',
    v07.missing.length === 0, JSON.stringify(v07.missing));

  /* ========== VL-08: ファイル名の罠 ========== */
  const v08 = await lint([
    { path: 'React  Vite.md', text: '' },
    { path: 'AWS' + IDEO_SPACE + '基礎.md', text: '' },
    { path: 'x' + NBSP + 'y.md', text: '' },
    { path: ' 2.md', text: '' },
    { path: 'dir /a.md', text: '' },
    { path: '.md', text: '' },
  ]);
  const reasons = v08.bad.map(b => b[1]).sort();
  r.check('VL-08（ファイル名の罠 6件・理由が区別される）',
    v08.bad.length === 6
    && eq(reasons, ['NBSP', '先頭・末尾スペース', '先頭・末尾スペース', '全角スペース', '空ベース名', '連続半角スペース']),
    JSON.stringify(v08.bad));

  /* ========== VL-09: 重複ベース名 ========== */
  const v09 = await lint([
    { path: 'x/メモ.md', text: '' },
    { path: 'y/メモ.md', text: '' },
  ]);
  r.check('VL-09（同名 md の重複をパス一覧つきで報告）',
    eq(v09.dup, [['メモ', ['x/メモ.md', 'y/メモ.md']]]), JSON.stringify(v09.dup));

  /* ========== VL-11: 性能ガード ========== */
  const v11 = await page.evaluate(() => {
    const files = [];
    for (let i = 0; i <= 20000; i++) files.push({ path: 'n' + i + '.md', text: '' });
    const res = window.vaultlint.lint(files);
    return { ok: res.ok, error: res.error };
  });
  r.check('VL-11（20,001 ファイルで処理せず理由）',
    v11.ok === false && v11.error.includes('上限'), JSON.stringify(v11));

  /* ========== VL-12: 行番号 ========== */
  const v12 = await lint([{ path: 'a.md', text: '1行目\n2行目\n[[c]]' }]);
  r.check('VL-12（行番号が正しい）', eq(v12.broken, [['a.md', 3, 'c']]), JSON.stringify(v12.broken));

  /* ========== VL-13: コードフェンス・インラインコードは走査しない ========== */
  const v13 = await lint([{
    path: 'a.md',
    text: [
      '```sh',
      'if [[ -f x ]]; then echo ok; fi',   // shell 構文 — リンクではない
      '```',
      '本文の `[[y]]` はインラインコード。',
      '[[c]] は本物のリンク切れ。',
    ].join('\n'),
  }]);
  r.check('VL-13（フェンス内・インラインコードは検出せず、フェンス後の本物だけ拾う）',
    eq(v13.broken, [['a.md', 5, 'c']]), JSON.stringify(v13.broken));

  /* ========== VL-14: Inbox 棚卸し（7日より古い純デイリー・未転記タスク） ========== */
  const v14 = await lint([
    { path: '00_Inbox/2026-08-04.md', text: '## ログ\n作業した。' },                    // 10日前・生タスクなし
    { path: '00_Inbox/2026-08-12.md', text: '## ログ\n直近。' },                        // 2日前 → 出ない
    { path: '00_Inbox/2026-08-03.md', text: '- [ ] 未転記1\n本文\n- [ ] 未転記2' },     // 11日前・生タスク2
    { path: '00_Inbox/2026-08-01_打合せ.md', text: 'トピックノート' },                  // 純デイリーではない
  ], '2026-08-14', { inboxDir: '00_Inbox' });
  r.check('VL-14（7日超の純デイリーのみ・pending 計上・トピックは件数のみ）',
    eq(v14.inbox, [['00_Inbox/2026-08-04.md', '2026-08-04', 10, 0],
      ['00_Inbox/2026-08-03.md', '2026-08-03', 11, 2]])
    && v14.stats.inboxOthers === 1,
    JSON.stringify([v14.inbox, v14.stats]));

  /* ========== VL-20: Inbox フォルダが未設定なら棚卸し自体をしない ========== */
  const v20 = await lint([
    { path: '00_Inbox/2026-08-04.md', text: '## ログ\n作業した。' },
  ], '2026-08-14');   // cfg 省略 = inboxDir 未設定
  r.check('VL-20（Inbox フォルダ未設定なら棚卸しをせず inboxOthers も数えない）',
    v20.inbox.length === 0 && v20.stats.inboxOthers === 0, JSON.stringify([v20.inbox, v20.stats]));

  /* ========== VL-21: Inbox フォルダは設定した名前で照合する（00_Inbox 固定ではない） ========== */
  const v21 = await lint([
    { path: 'Journal/2026-08-04.md', text: '## ログ' },       // 設定した Inbox 直下 → 対象
    { path: '00_Inbox/2026-08-04.md', text: '## ログ' },      // 別フォルダ → 対象外
    { path: 'Journal/sub/2026-08-04.md', text: '## ログ' },   // サブフォルダ → 純デイリー扱いしない
  ], '2026-08-14', { inboxDir: 'Journal' });
  r.check('VL-21（Inbox は設定した名前で照合・直下のみ・他フォルダは対象外）',
    eq(v21.inbox, [['Journal/2026-08-04.md', '2026-08-04', 10, 0]]) && v21.stats.inboxOthers === 1,
    JSON.stringify([v21.inbox, v21.stats]));

  /* ========== VL-15〜18: planFixes（計画の純関数） ========== */
  const v15 = await page.evaluate(() => {
    if (!window.vaultlint.planFixes) return { missing: true, writes: [], moves: [], skipped: [] };
    const files = [{ path: 'a.md', text: '一行目\n[[c]] を参照\nまた [[c|別名]] も。' }];
    const p = window.vaultlint.planFixes(files, [
      { type: 'textify', file: 'a.md', line: 2, target: 'c' },
      { type: 'textify', file: 'a.md', line: 3, target: 'c' },
    ]);
    return { writes: p.writes, moves: p.moves, skipped: p.skipped };
  });
  r.check('VL-15（テキスト化: [[c]]→c・[[c|別名]]→別名）',
    v15.writes.length === 1
    && v15.writes[0].after === '一行目\nc を参照\nまた 別名 も。'
    && v15.moves.length === 0 && v15.skipped.length === 0,
    JSON.stringify(v15));

  const v16 = await page.evaluate(() => {
    if (!window.vaultlint.canDeleteLine) return { missing: true };
    const files = [{ path: 'a.md', text: '[[c]]\n前置き [[c]]' }];
    return {
      only: window.vaultlint.canDeleteLine(files, 'a.md', 1),
      mixed: window.vaultlint.canDeleteLine(files, 'a.md', 2),
      plan: window.vaultlint.planFixes(files, [
        { type: 'deleteLine', file: 'a.md', line: 1 },
        { type: 'deleteLine', file: 'a.md', line: 2 },
      ]),
    };
  });
  r.check('VL-16（行削除はリンクだけの行のみ・混在行はスキップ理由つき）',
    v16.only === true && v16.mixed === false
    && v16.plan.writes.length === 1 && v16.plan.writes[0].after === '前置き [[c]]'
    && v16.plan.skipped.length === 1 && v16.plan.skipped[0].reason.includes('リンク以外'),
    JSON.stringify(v16));

  const v17 = await page.evaluate(() => {
    if (!window.vaultlint.planFixes) return [];
    const files = [{ path: 'a.md', text: '説明 ![[img.png]] 続き\n![x](files/doc.pdf)' }];
    const p = window.vaultlint.planFixes(files, [
      { type: 'removeAttachment', file: 'a.md', line: 1, target: 'img.png' },
      { type: 'removeAttachment', file: 'a.md', line: 2, target: 'files/doc.pdf' },
    ]);
    return p.writes;
  });
  r.check('VL-17（参照トークンのみ除去・行は残す）',
    v17.length === 1 && v17[0].after === '説明 続き\n',
    JSON.stringify(v17));

  const v18 = await page.evaluate(() => {
    if (!window.vaultlint.planFixes) return { missing: true, moves: [], writes: [], conflictSkipped: [] };
    const files = [
      { path: 'React  Vite.md', text: '本体' },
      { path: 'note.md', text: '[[React  Vite]] と [[React  Vite|R]] と [[React  Vite#手順]]\n```\n[[React  Vite]]\n```' },
    ];
    const p = window.vaultlint.planFixes(files, [
      { type: 'rename', from: 'React  Vite.md', to: 'React Vite.md' },
    ]);
    const conflict = window.vaultlint.planFixes(
      files.concat([{ path: 'React Vite.md', text: '既存' }]),
      [{ type: 'rename', from: 'React  Vite.md', to: 'React Vite.md' }]);
    return { moves: p.moves, writes: p.writes, conflictSkipped: conflict.skipped };
  });
  r.check('VL-18（rename＋リンク元3種の追随・フェンス内は不変・衝突はスキップ）',
    eq(v18.moves, [{ from: 'React  Vite.md', to: 'React Vite.md' }])
    && v18.writes.length === 1
    && v18.writes[0].after === '[[React Vite]] と [[React Vite|R]] と [[React Vite#手順]]\n```\n[[React  Vite]]\n```'
    && v18.conflictSkipped.length === 1 && v18.conflictSkipped[0].reason.includes('既に存在'),
    JSON.stringify(v18));

  /* ========== VL-19: applyFixes のメモリ適用と外部変更スキップ（NFC 比較） ========== */
  const v19 = await page.evaluate(async () => {
    if (!window.vaultlint.applyFixes) return { missing: true, written: [], skipped: [] };
    const files = [
      { path: 'a.md', text: '[[c]]' },
      { path: 'b.md', text: '[[c]]' },
    ];
    const plan = window.vaultlint.planFixes(files, [
      { type: 'textify', file: 'a.md', line: 1, target: 'c' },
      { type: 'textify', file: 'b.md', line: 1, target: 'c' },
    ]);
    const disk = new Map([['a.md', '[[c]]'], ['b.md', '外部で書き換わった']]);
    const written = [];
    const res = await window.vaultlint.applyFixes(files, plan, {
      read: async p => (disk.has(p) ? disk.get(p) : null),
      write: async (p, t) => { written.push([p, t]); },
      move: async () => {},
    });
    return { written, skipped: res.skipped.map(s => [s.path, s.reason.slice(0, 8)]) };
  });
  r.check('VL-19（適用前の再読で外部変更を検知 — 変更されたファイルだけスキップ）',
    v19.written.length === 1 && v19.written[0][0] === 'a.md' && v19.written[0][1] === 'c'
    && v19.skipped.length === 1 && v19.skipped[0][0] === 'b.md',
    JSON.stringify(v19));

  const u1 = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); };
    window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }]);
    const summary = document.getElementById('summary').textContent;
    const cells = Array.from(document.querySelectorAll('.issue-block td')).map(e => e.textContent);
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 60));
    return { summary, cells, copied: window.__copied, copyHidden: document.getElementById('copy-btn').hidden };
  });
  r.check('VL-U1（サマリ・表・報告コピー）',
    u1.summary.includes('問題 1 件') && u1.cells.includes('a.md') && u1.cells.includes('c')
    && u1.copyHidden === false
    && u1.copied.includes('## リンク切れ（1件）') && u1.copied.includes('a.md:1 → c'),
    JSON.stringify(u1));

  /* ========== VL-U2: 設定した非公開フォルダの除外（アダプタ層） ========== */
  const u2 = await page.evaluate(() => {
    window.vaultlint.test.run([
      { path: 'a.md', text: '[[b]]' },
      { path: 'b.md', text: '' },
      { path: '91_Private/secret.md', text: '[[存在しない]]' },
    ], null, { privateDirs: ['91_Private'] });
    return {
      summary: document.getElementById('summary').textContent,
      leaked: document.getElementById('results').textContent.includes('91_Private'),
    };
  });
  r.check('VL-U2（設定した非公開フォルダはアダプタ層で除外・統計に計上・結果に現れない）',
    u2.summary.includes('除外 1') && u2.summary.includes('問題 0 件') && u2.leaked === false,
    JSON.stringify(u2));

  /* ========== VL-U3: 全て健全 ========== */
  const u3 = await page.evaluate(() => {
    window.vaultlint.test.run([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }],
      null, { privateDirs: [], inboxDir: '00_Inbox' });
    return {
      summary: document.getElementById('summary').textContent,
      okCount: document.querySelectorAll('.issue-ok').length,
    };
  });
  r.check('VL-U3（健全な vault は全クラス「問題なし」）',
    u3.summary.includes('問題 0 件') && u3.okCount === 5, JSON.stringify(u3));   // Inbox 棚卸しで5クラス

  /* ========== VL-U6: Inbox 未設定なら「問題なし」ではなくクラス自体を出さない ========== */
  const u6 = await page.evaluate(() => {
    window.vaultlint.test.run([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }],
      null, { privateDirs: [] });   // inboxDir 未設定
    return {
      okCount: document.querySelectorAll('.issue-ok').length,
      hasInboxHeading: document.getElementById('results').textContent.includes('Inbox 棚卸し'),
    };
  });
  r.check('VL-U6（Inbox 未設定時は棚卸しクラスを表示しない — 未検査を「問題なし」と偽らない）',
    u6.okCount === 4 && u6.hasInboxHeading === false, JSON.stringify(u6));

  /* ========== VL-U5: 修復の UI フロー（選択 → コミット確認 → 実行 → ログ → 再スキャン） ========== */
  const u5 = await page.evaluate(async () => {
    if (!document.getElementById('fix-btn')) return { missing: true };
    window.confirm = () => true;
    window.vaultlint.test.run([
      { path: 'a.md', text: '[[c]]' },
      { path: 'b.md', text: '' },
    ], '2026-08-14');
    const sel = document.querySelector('select.fix-select');
    const before = {
      hasSelect: !!sel,
      fixBtnHidden: document.getElementById('fix-btn').hidden,
      options: sel ? Array.from(sel.options).map(o => o.value) : [],
    };
    // コミット確認なしの実行は warn で止まる
    document.getElementById('commit-confirm').checked = false;
    document.getElementById('fix-btn').click();
    await new Promise(d => setTimeout(d, 60));
    const guardMsg = document.getElementById('banner').textContent;
    // 行削除を選んで実行
    sel.value = 'deleteLine';
    document.getElementById('commit-confirm').checked = true;
    document.getElementById('fix-btn').click();
    await new Promise(d => setTimeout(d, 150));
    return {
      before, guardMsg,
      log: document.getElementById('runlog').textContent,
      summary: document.getElementById('summary').textContent,
    };
  });
  r.check('VL-U5（選択式修復: ガード → 実行 → ログ → 再スキャンで問題0件）',
    !u5.missing && u5.before.hasSelect && u5.before.fixBtnHidden === false
    && u5.before.options.includes('textify') && u5.before.options.includes('deleteLine')
    && u5.guardMsg.includes('コミット')
    && u5.log.includes('書き換え 1') && u5.summary.includes('問題 0 件'),
    JSON.stringify(u5));

  /* ========== VL-U7: 非公開フォルダが未設定のうちはスキャンを始めない ========== */
  // showDirectoryPicker の有無は実行環境で変わるが、ここで見たいのは**設定ゲート**の方なので固定する
  await page.addInitScript(() => { window.showDirectoryPicker = () => Promise.reject(new Error('stub')); });
  await page.evaluate(() => localStorage.removeItem('tools:config'));
  await page.reload();
  const u7a = await page.evaluate(() => ({
    disabled: document.getElementById('pick').disabled,
    note: document.getElementById('env-note').textContent,
    noteHidden: document.getElementById('env-note').hidden,
  }));
  const u7b = await page.evaluate(() => {
    document.getElementById('cfg-private').value = '91_Private, Personal';
    document.getElementById('cfg-inbox').value = '00_Inbox';
    document.getElementById('cfg-archive').value = '/90_Archive/daily/';   // 前後の / は正規化される
    document.getElementById('cfg-save').click();
    return {
      disabled: document.getElementById('pick').disabled,
      saved: JSON.parse(localStorage.getItem('tools:config')).data,
    };
  });
  r.check('VL-U7（非公開フォルダ未設定ならフォルダ選択が無効・理由を表示・保存で有効化）',
    u7a.disabled === true && u7a.noteHidden === false && u7a.note.includes('非公開フォルダ')
    && u7b.disabled === false
    && eq(u7b.saved.privateDirs, ['91_Private', 'Personal'])
    && u7b.saved.archiveDir === '90_Archive/daily',
    JSON.stringify([u7a, u7b]));

  /* ========== VL-U8: 「除外なし」は空欄のまま保存で明示的に決められる ========== */
  await page.evaluate(() => localStorage.removeItem('tools:config'));
  await page.reload();
  const u8 = await page.evaluate(() => {
    const before = document.getElementById('pick').disabled;
    document.getElementById('cfg-save').click();   // 空欄のまま保存 = 「除外なし」と決めた
    return {
      before,
      after: document.getElementById('pick').disabled,
      saved: JSON.parse(localStorage.getItem('tools:config')).data.privateDirs,
    };
  });
  r.check('VL-U8（空欄のまま保存すれば「除外なし」として決定され、スキャンが有効になる）',
    u8.before === true && u8.after === false && eq(u8.saved, []), JSON.stringify(u8));

  /* ========== VL-U4: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u4 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('VL-U4（幅390pxで横スクロールなし）', u4 === true, String(u4));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent));
  await page.click('ul.tool-list .tool-name:text-is("Check Vault")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  const hubH1 = await page.evaluate(() => document.querySelector('h1').textContent);
  r.check('ハブの「整理」カテゴリから遷移でき title と h1 が命名規約どおり',
    hubCats.includes('整理') && hubTitle === 'Check Vault (vaultlint)' && hubH1 === 'Check Vault',
    JSON.stringify([hubCats, hubTitle, hubH1]));

  await browser.close();
  r.report('vaultlint（docs/specs/vaultlint.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
