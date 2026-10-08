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
      closed: (res.issues.closedIssues || []).map(i => [i.path, i.closed, i.verdict]),
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

  /* ========== VL-09: 重複ベース名は「実害があるときだけ」報告する（VL-Q12） ========== */
  // パス修飾なしの [[メモ]] があるので、どちらに解決されるか決まらない = 実害あり
  const v09 = await lint([
    { path: 'x/メモ.md', text: '' },
    { path: 'y/メモ.md', text: '' },
    { path: 'z/参照元.md', text: '[[メモ]] を見る' },
  ]);
  r.check('VL-09（曖昧なリンクがある重複をパス一覧つきで報告）',
    eq(v09.dup, [['メモ', ['x/メモ.md', 'y/メモ.md']]]), JSON.stringify(v09.dup));

  // 同名でも**パス修飾なしリンクが無ければ報告しない**（.claude/commands のミラーや
  // 1on1 の人別フォルダを毎回出さない — 実測で18件すべてが実害ゼロだった）
  const v09b = await lint([
    { path: 'x/メモ.md', text: '' },
    { path: 'y/メモ.md', text: '' },
    { path: 'z/参照元.md', text: '[[x/メモ]] を見る' },   // パス修飾済み = 曖昧でない
  ]);
  // 曖昧なリンクが1つでもあれば、その名前は報告される（別名の重複は巻き込まない）
  const v09c = await lint([
    { path: 'x/メモ.md', text: '' },
    { path: 'y/メモ.md', text: '' },
    { path: 'x/他.md', text: '' },
    { path: 'y/他.md', text: '' },
    { path: 'z/参照元.md', text: '[[他]] だけ曖昧' },
  ]);
  r.check('VL-09b（パス修飾なしリンクが無い重複は報告しない・曖昧な名前だけ出す）',
    eq(v09b.dup, []) && eq(v09c.dup, [['他', ['x/他.md', 'y/他.md']]]),
    JSON.stringify([v09b.dup, v09c.dup]));

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

  /* ========== VL-22〜24: 閉じたイシュー（VL-Q13・2026-09-25） ========== */
  const FM = (st, extra) => ['---', 'created: 2026-09-01', 'status: ' + st].concat(extra || []).concat(['tags: [issue]', '---', '# t', '', '## 論点', '', '- [x] x', '']).join('\n');
  const CI = [
    { path: '04_Issues/a.md', text: FM('closed', ['closed: 2026-09-20', 'verdict: 当たり']) },
    { path: '04_Issues/b.md', text: FM('open') },
    { path: '04_Issues/c.md', text: FM('closed') },                              // 閉じた日・判定なし
    { path: '04_Issues/sub/d.md', text: FM('closed', ['closed: 2026-09-21']) },  // サブフォルダは対象外
    { path: 'x/e.md', text: FM('closed', ['closed: 2026-09-22']) },              // フォルダ外
    { path: '04_Issues/f.md', text: '# frontmatter なし\n- [x] 済' },
  ];
  const v22 = await lint(CI, '2026-09-25', { issueDir: '04_Issues' });
  r.check('VL-22（閉じたイシュー: issueDir 直下の status: closed だけ。closed / verdict を拾う・無ければ空）',
    eq(v22.closed, [['04_Issues/a.md', '2026-09-20', '当たり'], ['04_Issues/c.md', '', '']]),
    JSON.stringify(v22.closed));
  const v23 = await lint(CI, '2026-09-25', {});
  r.check('VL-23（issueDir 未設定なら閉じたイシューの検査自体をしない）', eq(v23.closed, []), JSON.stringify(v23.closed));
  const v24 = await page.evaluate((files) => {
    if (!window.vaultlint.planFixes) return { missing: true };
    const sel = [{ type: 'archiveIssue', from: '04_Issues/a.md', closed: '2026-09-20' }];
    window.vaultlint.test.setConfig({ issueDir: '04_Issues', closedDir: '90_Archive/{YYYY}' });
    const p = window.vaultlint.planFixes(files, sel);
    const conflict = window.vaultlint.planFixes(files.concat([{ path: '90_Archive/2026/a.md', text: '' }]), sel);
    window.vaultlint.test.setConfig({ issueDir: '04_Issues' });
    const unset = window.vaultlint.planFixes(files, sel);
    return { moves: p.moves, skipped: p.skipped, conflict: conflict.skipped, unset: unset.skipped, unsetMoves: unset.moves };
  }, CI);
  r.check('VL-24（planFixes archiveIssue: {YYYY} は閉じた年・移動先に同名があればスキップ・closedDir 未設定なら理由つきでスキップ）',
    !v24.missing && eq(v24.moves, [{ from: '04_Issues/a.md', to: '90_Archive/2026/a.md' }]) && v24.skipped.length === 0
    && v24.conflict.length === 1 && v24.conflict[0].reason.includes('同名')
    && v24.unsetMoves.length === 0 && v24.unset.length === 1 && v24.unset[0].reason.includes('未設定'),
    JSON.stringify(v24));

  /* ========== VL-25/26: 閉じたイシューを案件フォルダの Archive/ へ（VL-Q14） ========== */
  const FMP = (proj) => ['---', 'status: closed', 'closed: 2026-09-20'].concat(proj ? ['project: ' + proj] : []).concat(['---', '# t', '']).join('\n');
  const CP = [
    { path: '04_Issues/itk.md', text: FMP('ITK') }, { path: '04_Issues/ul.md', text: FMP('UL') },
    { path: '04_Issues/men.md', text: FMP('面接') }, { path: '04_Issues/none.md', text: FMP('') },
    { path: '10_Projects/ITK/Memo/x.md', text: '' }, { path: '20_Areas/UL/y.md', text: '' },
  ];
  const CAND = '10_Projects/{project}/Archive, 20_Areas/{project}/Archive, 90_Archive/{YYYY}';
  const v25 = await page.evaluate(([files, cand]) => {
    window.vaultlint.test.setConfig({ issueDir: '04_Issues', closedDir: cand });
    const res = window.vaultlint.lint(files, '2026-09-25');
    return res.issues.closedIssues.map(i => [i.path, i.project, i.dest]);
  }, [CP, CAND]);
  r.check('VL-25（候補を左から: 案件フォルダがあれば 10_Projects/ITK/Archive・20_Areas/UL/Archive、無ければ 90_Archive/2026）',
    eq(v25, [['04_Issues/itk.md', 'ITK', '10_Projects/ITK/Archive'], ['04_Issues/ul.md', 'UL', '20_Areas/UL/Archive'],
      ['04_Issues/men.md', '面接', '90_Archive/2026'], ['04_Issues/none.md', '', '90_Archive/2026']]),
    JSON.stringify(v25));
  const v26 = await page.evaluate(([files, cand]) => {
    window.vaultlint.test.setConfig({ issueDir: '04_Issues', closedDir: cand });
    const ok = window.vaultlint.planFixes(files, [{ type: 'archiveIssue', from: '04_Issues/itk.md', closed: '2026-09-20', project: 'ITK' }]);
    window.vaultlint.test.setConfig({ issueDir: '04_Issues', closedDir: '10_Projects/{project}/Archive' });
    const none = window.vaultlint.planFixes(files, [{ type: 'archiveIssue', from: '04_Issues/none.md', closed: '2026-09-20', project: '' }]);
    return { moves: ok.moves, noneMoves: none.moves, noneSkipped: none.skipped };
  }, [CP, CAND]);
  r.check('VL-26（planFixes: 案件フォルダの Archive へ moves／どの候補も決まらなければ「移動先が決まりません」でスキップ）',
    eq(v26.moves, [{ from: '04_Issues/itk.md', to: '10_Projects/ITK/Archive/itk.md' }])
    && v26.noneMoves.length === 0 && v26.noneSkipped.length === 1 && v26.noneSkipped[0].reason.includes('移動先が決まりません'),
    JSON.stringify(v26));

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
    eq(v18.moves, [{ from: 'React  Vite.md', to: 'React Vite.md', linked: ['note.md'] }])   // linked = 組にするリンク元（VL-F1）
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

  /* ========== VL-F1〜F5: 消えるより重複（点検 2026-10-08 — VL-Q16） ========== */
  const f1 = await page.evaluate(async () => {
    const files = [{ path: 'React  Vite.md', text: '# a' }, { path: 'x.md', text: '[[React  Vite]]' }, { path: 'y.md', text: '[[React  Vite|別名]]' }];
    const sel = [{ type: 'rename', from: 'React  Vite.md', to: 'React Vite.md' }];
    const run = async (disk, moveFails) => {
      const plan = window.vaultlint.planFixes(files, sel);
      const written = [], moved = [];
      const res = await window.vaultlint.applyFixes(files, plan, {
        read: async p => (disk.has(p) ? disk.get(p) : null),
        write: async (p, t) => { written.push(p); disk.set(p, t); },
        move: async (f, t) => { if (moveFails) throw new Error('だめ'); moved.push([f, t]); },
      });
      return { linked: (plan.moves[0] || {}).linked, written, moved, skipped: res.skipped.map(s => s.path + ':' + s.reason.slice(0, 6)) };
    };
    return {
      stale: await run(new Map([['React  Vite.md', '# a'], ['x.md', '[[React  Vite]]'], ['y.md', '外で変わった']])),
      fresh: await run(new Map(files.map(f => [f.path, f.text]))),
      moveFail: await run(new Map(files.map(f => [f.path, f.text])), true),
    };
  });
  r.check('VL-F1（リネームは組で: リンク元が変わっていたら移動しない・両方そのままなら移動して書く・移動が失敗したらリンク元も書かない）',
    eq(f1.stale.linked, ['x.md', 'y.md']) && f1.stale.moved.length === 0 && f1.stale.written.length === 0 && f1.stale.skipped.length === 3
    && f1.fresh.moved.length === 1 && eq(f1.fresh.written, ['x.md', 'y.md']) && f1.fresh.skipped.length === 0
    && f1.moveFail.moved.length === 0 && f1.moveFail.written.length === 0 && f1.moveFail.skipped.length === 3,
    JSON.stringify(f1));

  const f2 = await page.evaluate(async () => {
    const files = [{ path: 'a.md', text: '[[c]]' }, { path: 'b.md', text: '[[c]]' }, { path: 'd.md', text: '[[c]]' }];
    const plan = window.vaultlint.planFixes(files, files.map(f => ({ type: 'textify', file: f.path, line: 1, target: 'c' })));
    const disk = new Map(files.map(f => [f.path, f.text]));
    const written = [];
    try {
      const res = await window.vaultlint.applyFixes(files, plan, {
        read: async p => disk.get(p),
        write: async (p) => { if (p === 'b.md') { const e = new Error('x'); e.name = 'NotAllowedError'; throw e; } written.push(p); },
        move: async () => {},
      });
      return { written, skipped: res.skipped.map(s => s.path + ':' + s.reason.slice(0, 7)) };
    } catch (e) { return { threw: e.name, written }; }   // 全体が止まる作り（RED）でもハーネスを止めない
  });
  r.check('VL-F2（書き込みの例外は1件だけスキップして残りを続ける）',
    !f2.threw && eq(f2.written, ['a.md', 'd.md']) && eq(f2.skipped, ['b.md:書き込みに失敗']), JSON.stringify(f2));

  const f3 = await page.evaluate(async () => {
    if (!window.vaultlint.fsaAdapter) return null;
    const nf = () => { const e = new Error('nf'); e.name = 'NotFoundError'; return e; };
    const mk = (files) => {
      const dir = {
        files, removed: [],
        getDirectoryHandle: async () => dir,
        getFileHandle: async (n, o) => {
          if (!(n in files)) { if (o && o.create) files[n] = ''; else throw nf(); }
          return {
            getFile: async () => ({ text: async () => files[n], size: files[n].length }),
            createWritable: async () => ({ write: async t => { files[n] = typeof t === 'string' ? t : 'copy'; }, close: async () => {} }),
          };
        },
        removeEntry: async n => { dir.removed.push(n); delete files[n]; },
      };
      return dir;
    };
    const a = mk({ 'a.md': 'A', 'b.md': 'B' });
    let err = null;
    try { await window.vaultlint.fsaAdapter(a).move('a.md', 'b.md'); } catch (e) { err = e.message; }
    const b = mk({ 'a.md': 'copy' });
    await window.vaultlint.fsaAdapter(b).move('a.md', 'c.md');
    return { err, kept: a.files['a.md'] === 'A' && a.files['b.md'] === 'B' && a.removed.length === 0, moved: !('a.md' in b.files) && b.files['c.md'] === 'copy' };
  });
  r.check('VL-F3（FSA の移動は移動先に同名があれば上書きしない・無ければ移る）',
    !!f3 && /同名/.test(f3.err) && f3.kept && f3.moved, JSON.stringify(f3));

  const f4 = await page.evaluate(async () => {
    if (!window.vaultlint.test.runScan) return null;
    const dir = (name, text, delay) => ({
      name, kind: 'directory', requestPermission: async () => 'granted',
      values: async function* () {
        await new Promise(d => setTimeout(d, delay));
        yield { kind: 'file', name: name + '.md', getFile: async () => ({ text: async () => text }) };
      },
    });
    window.vaultlint.test.setConfig({ privateDirs: ['91_Private'] });
    const pA = window.vaultlint.test.runScan(dir('A', '[[zzz]]', 300));
    const pB = window.vaultlint.test.runScan(dir('B', '# ok', 50));
    await Promise.all([pA, pB]);
    await new Promise(d => setTimeout(d, 50));
    return { summary: document.getElementById('summary').textContent, adapterRoot: window.vaultlint.test.adapterRoot() };
  });
  r.check('VL-F4（遅いスキャン A のあとに B を選んだら、画面も書き込み先も B）',
    !!f4 && f4.summary.includes('問題 0 件') && f4.adapterRoot === 'B', JSON.stringify(f4));

  const f5 = await page.evaluate(async () => {
    window.confirm = () => true;
    window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }, { path: 'b.md', text: '' }], '2026-08-14');
    document.querySelector('select.fix-select').value = 'deleteLine';
    document.getElementById('commit-confirm').checked = true;
    document.getElementById('fix-btn').click();
    await new Promise(d => setTimeout(d, 150));
    return { unchecked: document.getElementById('commit-confirm').checked === false, log: document.getElementById('runlog').textContent.includes('書き換え 1') };
  });
  r.check('VL-F5（実行したらコミット済みのチェックが外れる）', f5.unchecked && f5.log, JSON.stringify(f5));

  /* ========== VL-F6・F7: 最終レビュー 2026-10-08（移動したファイルへの書き込み・共有するリンク元） ========== */
  const mkDisk = (files) => {   // メモリの disk（move は実際に名前を変える）
    const disk = new Map(files.map(f => [f.path, f.text]));
    const adapter = {
      read: async p => (disk.has(p) ? disk.get(p) : null),
      write: async (p, t) => { disk.set(p, t); },
      move: async (f, t) => { if (!disk.has(f)) throw new Error('見つかりません'); if (disk.has(t)) throw new Error('移動先に同名があります: ' + t); disk.set(t, disk.get(f)); disk.delete(f); },
    };
    return { disk, adapter };
  };
  const f6 = await page.evaluate(async (mkSrc) => {
    const mk = (0, eval)('(' + mkSrc + ')');
    const selfFiles = [{ path: 'React  Vite.md', text: '# a\n[[React  Vite#Setup]]' }];
    const a = mk(selfFiles);
    const resA = await window.vaultlint.applyFixes(selfFiles, window.vaultlint.planFixes(selfFiles, [{ type: 'rename', from: 'React  Vite.md', to: 'React Vite.md' }]), a.adapter);
    window.vaultlint.test.setConfig({ archiveDir: '90_Archive' });
    const dailyFiles = [{ path: '00_Inbox/2026-08-01.md', text: '[[c]]' }];
    const b = mk(dailyFiles);
    const resB = await window.vaultlint.applyFixes(dailyFiles, window.vaultlint.planFixes(dailyFiles, [
      { type: 'archiveDaily', from: '00_Inbox/2026-08-01.md' }, { type: 'textify', file: '00_Inbox/2026-08-01.md', line: 1, target: 'c' }]), b.adapter);
    window.vaultlint.test.setConfig({});
    return { self: a.disk.get('React Vite.md'), selfSkipped: resA.skipped.length, moved: resB.moved.length, archived: b.disk.get('90_Archive/2026-08-01.md'), dailySkipped: resB.skipped.length };
  }, mkDisk.toString());
  r.check('VL-F6（移動したファイル自身への書き込みは移動先へ: 自分へのリンクが新しい名前・archive と textify の両方が通る）',
    f6.self === '# a\n[[React Vite#Setup]]' && f6.selfSkipped === 0 && f6.moved === 1 && f6.archived === 'c' && f6.dailySkipped === 0, JSON.stringify(f6));

  const f7 = await page.evaluate(async (mkSrc) => {
    const mk = (0, eval)('(' + mkSrc + ')');
    const files = [{ path: 'A  a.md', text: 'A' }, { path: 'B  b.md', text: 'B' }, { path: 'x.md', text: '[[A  a]] [[B  b]]' }];
    const sel = [{ type: 'rename', from: 'A  a.md', to: 'A a.md' }, { type: 'rename', from: 'B  b.md', to: 'B b.md' }];
    const plan = () => window.vaultlint.planFixes(files, sel);
    const c1 = mk(files); c1.disk.set('A a.md', '既にある');   // A の移動先が既にある
    const r1 = await window.vaultlint.applyFixes(files, plan(), c1.adapter);
    const c2 = mk(files);
    const realMove = c2.adapter.move;
    c2.adapter.move = async (f, t) => { if (f === 'B  b.md') throw new Error('だめ'); return realMove(f, t); };   // A は成功・B は失敗
    const r2 = await window.vaultlint.applyFixes(files, plan(), c2.adapter);
    return { case1: { moved: r1.moved.length, x: c1.disk.get('x.md'), bStill: c1.disk.has('B  b.md') },
      case2: { moved: r2.moved.map(m => m.from), x: c2.disk.get('x.md'), reason: (r2.skipped.find(s => s.path === 'x.md') || {}).reason || '' } };
  }, mkDisk.toString());
  r.check('VL-F7（リンク元を共有する rename: 片方が行えなければもう片方も行わない／途中で失敗したら切れているリンクを理由に出す）',
    f7.case1.moved === 0 && f7.case1.x === '[[A  a]] [[B  b]]' && f7.case1.bStill
    && eq(f7.case2.moved, ['A  a.md']) && f7.case2.x === '[[A  a]] [[B  b]]' && f7.case2.reason.includes('切れて') && f7.case2.reason.includes('A  a'),
    JSON.stringify(f7));

  const u1 = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); };
    window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }]);
    const summary = document.getElementById('summary').textContent;
    const cells = Array.from(document.querySelectorAll('.issue-block td')).map(e => e.textContent);
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 60));
    return { summary, cells, copied: window.__copied, copyHidden: document.getElementById('copy-btn').hidden,
      fileTitle: (document.querySelector('.issue-block td.vl-file') || {}).title };
  });
  r.check('VL-U1（サマリ・表・報告コピー）',
    u1.summary.includes('問題 1 件') && u1.cells.includes('a') && u1.fileTitle === 'a.md' && u1.cells.includes('c')
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
      okKinds: (document.querySelector('.issue-ok') || { dataset: {} }).dataset.kinds,
    };
  });
  r.check('VL-U3（健全な vault は全クラス「問題なし」）',
    u3.summary.includes('問題 0 件') && u3.okCount === 1 && u3.okKinds === '5', JSON.stringify(u3));   // Inbox 棚卸しで5種類を1行に（段6）

  /* ========== VL-U6: Inbox 未設定なら「問題なし」ではなくクラス自体を出さない ========== */
  const u6 = await page.evaluate(() => {
    window.vaultlint.test.run([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }],
      null, { privateDirs: [] });   // inboxDir 未設定
    return {
      okCount: document.querySelectorAll('.issue-ok').length,
      okKinds: (document.querySelector('.issue-ok') || { dataset: {} }).dataset.kinds,
      hasInboxHeading: document.getElementById('results').textContent.includes('Inbox 棚卸し'),
    };
  });
  r.check('VL-U6（Inbox 未設定時は棚卸しクラスを表示しない — 未検査を「問題なし」と偽らない）',
    u6.okCount === 1 && u6.okKinds === '4' && u6.hasInboxHeading === false, JSON.stringify(u6));

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

  /* ========== VL-L1: 設定欄は見出しの ⋯ の中（段6 — 初回だけ開いて出す・保存で閉じる） ========== */
  await page.evaluate(() => localStorage.removeItem('tools:config'));
  await page.reload();
  const l1a = await page.evaluate(() => {
    const more = document.getElementById('vl-more');
    return { open: !!more && more.open, inside: !!more && more.contains(document.getElementById('settings')),
      note: document.getElementById('env-note').textContent };
  });
  const l1b = await page.evaluate(() => {
    document.getElementById('cfg-private').value = '';
    document.getElementById('cfg-save').click();
    const more = document.getElementById('vl-more');
    return { open: !!more && more.open, disabled: document.getElementById('pick').disabled };
  });
  await page.reload();
  const l1c = await page.evaluate(() => { const more = document.getElementById('vl-more'); return { open: !!more && more.open }; });
  r.check('VL-L1（設定欄は ⋯ の中: 初回は開いて出し理由は ⋯ を指す・保存で閉じて選択が有効・設定済みで開くと閉じている）',
    l1a.open && l1a.inside && l1a.note.includes('⋯') && !l1b.open && l1b.disabled === false && !l1c.open,
    JSON.stringify({ l1a, l1b, l1c }));

  /* ========== VL-T1〜T4: 表を読みやすく（段6） ========== */
  const SP2 = String.fromCharCode(0x20, 0x20);   // 連続半角スペース（ファイル名の罠）
  const T_FILES = [
    { path: '10_Projects/ITK/計画.md', text: '[[ネットワーク構成]]' },
    { path: '00_Inbox/2026-09-20.md', text: '- メモ' },
    { path: '04_Issues/2026-09-20_ゴールの仮決め.md', text: '---\nstatus: closed\nclosed: 2026-10-01\n---\n# ゴールの仮決め' },
    { path: '30_Resources/用語' + SP2 + '集.md', text: '' },
  ];
  const T_CFG = { privateDirs: [], inboxDir: '00_Inbox', archiveDir: '90_Archive/daily', issueDir: '04_Issues', closedDir: '90_Archive/{YYYY}' };
  const t1 = await page.evaluate(([files, cfg]) => {
    window.vaultlint.test.run(files, '2026-10-05', cfg);
    const cell = (key) => { const td = document.querySelector('#results section[data-key="' + key + '"] td.vl-file'); if (!td) return null;
      return { name: (td.querySelector('.vl-name') || {}).textContent, dir: (td.querySelector('.vl-dir') || {}).textContent || '', title: td.title, raw: td.classList.contains('raw') }; };
    return { broken: cell('brokenLinks'), inbox: cell('inbox'), closed: cell('closedIssues'), bad: cell('badNames'),
      date: (document.querySelector('#results section[data-key="closedIssues"] td.vl-date') || {}).textContent || '',
      dash: document.getElementById('results').textContent.includes('—') };
  }, [T_FILES, T_CFG]);
  r.check('VL-T1（ファイルの欄: 名前が主でフォルダは薄く・.md と先頭の日付を落とす・デイリーは日付の表記・title は全パス・ファイル名の罠はそのまま）',
    eq(t1.broken, { name: '計画', dir: '10_Projects/ITK', title: '10_Projects/ITK/計画.md', raw: false })
    && eq(t1.inbox, { name: '2026/9/20(日)', dir: '00_Inbox', title: '00_Inbox/2026-09-20.md', raw: false })
    && eq(t1.closed, { name: 'ゴールの仮決め', dir: '04_Issues', title: '04_Issues/2026-09-20_ゴールの仮決め.md', raw: false })
    && eq(t1.bad, { name: '用語' + SP2 + '集.md', dir: '30_Resources', title: '30_Resources/用語' + SP2 + '集.md', raw: true }), JSON.stringify(t1));
  r.check('VL-T2（閉じた日は 2026/10/1(木)・「—」がどこにも無い）', t1.date === '2026/10/1(木)' && t1.dash === false, JSON.stringify({ date: t1.date, dash: t1.dash }));
  const t3 = await page.evaluate(() => {
    window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }], '2026-10-05', { privateDirs: [], inboxDir: '00_Inbox' });
    return { keys: Array.from(document.querySelectorAll('#results section[data-key]')).map(s => s.dataset.key),
      ok: Array.from(document.querySelectorAll('.issue-ok')).map(p => p.textContent) };
  });
  r.check('VL-T3（0件の種類は表を作らず最後に1行 — 検査した種類だけ）',
    eq(t3.keys, ['brokenLinks']) && eq(t3.ok, ['問題なし ✅ 添付消失・ファイル名の罠・重複ベース名・Inbox 棚卸し']), JSON.stringify(t3));
  const t4 = await page.evaluate(() => {
    const run = () => window.vaultlint.test.run([{ path: 'a.md', text: '[[c]]' }], '2026-10-05', { privateDirs: [] });
    // 未実装でも落ちずに fail として数える（ボタンや節が無ければ null）
    const sec = () => document.querySelector('#results section[data-key="brokenLinks"]');
    const fold = () => { const b = sec() && sec().querySelector('.vl-fold'); if (b) b.click(); };
    const state = () => { const s = sec(); const w = s && s.querySelector('.table-wrap'), b = s && s.querySelector('.vl-fold');
      return w && b ? { hidden: w.hidden, btn: b.textContent } : null; };
    run();
    fold();
    const a = state();
    run();
    const b = state();
    fold();
    return { a, b, c: state() };
  });
  r.check('VL-T4（種類の ▾ で表をたたむ・描き直しても残る・もう一度で戻る）',
    eq(t4, { a: { hidden: true, btn: '▸' }, b: { hidden: true, btn: '▸' }, c: { hidden: false, btn: '▾' } }), JSON.stringify(t4));

  /* ========== VL-N1〜N3: 一番上に「いま」（段6） ========== */
  const N_FILES = [
    { path: '10_Projects/ITK/計画.md', text: '[[ネットワーク構成]]\n![[構成図.png]]\n[[会議メモ]]' },   // リンク切れ2・添付消失1
    { path: '20_Areas/読書メモ.md', text: '[[イシューからはじめよ]]\n![アーキ](img/arch.png)' },
    { path: '30_Resources/用語' + SP2 + '集.md', text: '' },
    { path: '00_Inbox/2026-09-20.md', text: '- [ ] 先方に連絡' },
    { path: '00_Inbox/2026-09-21.md', text: '- メモ' },
    { path: '00_Inbox/2026-09-22.md', text: '- メモ' },
    { path: '00_Inbox/2026-09-23.md', text: '- [ ] 見積\n- [ ] 返信' },
    { path: '04_Issues/2026-09-20_ゴールの仮決め.md', text: '---\nstatus: closed\nclosed: 2026-10-01\n---\n# a' },
    { path: '04_Issues/2026-09-25_先方に確認.md', text: '---\nstatus: closed\nclosed: 2026-10-03\n---\n# b' },
  ];
  const nowOf = () => page.evaluate(() => {
    const box = document.getElementById('now');
    if (!box) return { missing: true };
    return { hidden: box.hidden, cnt: Array.from(box.querySelectorAll('.now-cnt')).map(c => c.textContent.trim()),
      groups: Array.from(box.querySelectorAll('.now-group')).map(g => ({ badge: g.querySelector('.now-badge').textContent, ticks: Array.from(g.querySelectorAll('.tick')).map(t => t.textContent) })),
      empty: (box.querySelector('.now-empty') || {}).textContent || '' };
  });
  await page.evaluate(([files, cfg]) => window.vaultlint.test.run(files, '2026-10-05', cfg), [N_FILES, T_CFG]);
  const n1 = await nowOf();
  r.check('VL-N1（いま: 直す 6・片づけ 4・確認 2 — 数は件数・札は種類ごと）',
    !n1.missing && !n1.hidden && eq(n1.cnt, ['直す 6', '片づけ 4', '確認 2'])
    && eq(n1.groups, [{ badge: '直す 6', ticks: ['リンク切れ 3', '添付消失 2', 'ファイル名の罠 1'] }, { badge: '片づけ 4', ticks: ['古いデイリー 2', '閉じたイシュー 2'] },
      { badge: '確認 2', ticks: ['未転記タスクのあるデイリー 2'] }]), JSON.stringify(n1));
  const n2 = await page.evaluate(() => {
    const sec = () => document.querySelector('#results section[data-key="brokenLinks"]');
    if (!sec()) return { missing: true };
    sec().querySelector('.vl-fold').click();
    const tick = Array.from(document.querySelectorAll('#now .tick')).find(t => t.textContent === 'リンク切れ 3');
    if (tick) tick.click();
    return { hidden: sec().querySelector('.table-wrap').hidden, btn: sec().querySelector('.vl-fold').textContent, flash: sec().classList.contains('flash') };
  });
  r.check('VL-N2（札を押すとたたんだ表が開いて光る）', eq(n2, { hidden: false, btn: '▾', flash: true }), JSON.stringify(n2));
  await page.reload();
  const n3a = await nowOf();
  await page.evaluate(() => window.vaultlint.test.run([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }], '2026-10-05', { privateDirs: [] }));
  const n3b = await nowOf();
  r.check('VL-N3（走査する前は「いま」を出さない・健全なら「直すもの・片づけるものはありません ✅」）',
    !n3a.missing && n3a.hidden && !n3b.hidden && n3b.empty === '直すもの・片づけるものはありません ✅', JSON.stringify({ n3a, n3b }));

  /* ========== VL-N4: 長い表への札でも見出しが見える（2026-10-05 の点検 — 真ん中に着いて見出しが画面の外へ出ていた） ========== */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    const text = Array.from({ length: 60 }, (_, k) => '[[無い' + k + ']]').join('\n');
    window.vaultlint.test.run([{ path: 'a.md', text: text }, { path: 'b.md', text: '' }], '2026-10-05', { privateDirs: [] });
    window.scrollTo(0, 0);
    const tick = Array.from(document.querySelectorAll('#now .tick')).find(t => t.textContent === 'リンク切れ 60');
    if (tick) tick.click();
  });
  await page.waitForTimeout(1200);   // なめらかなスクロールが止まるまで
  const n4 = await page.evaluate(() => { const h = document.querySelector('#results section[data-key="brokenLinks"] h2'); return h ? Math.round(h.getBoundingClientRect().top) : null; });
  r.check('VL-N4（表が画面より長くても、札を押すと種類の見出しが画面の上の方に見える）', n4 !== null && n4 >= 0 && n4 <= 200, JSON.stringify(n4));

  /* ========== VL-T5: ふつうの名前は折り返す・ファイル名の罠は空白を詰めない（2026-10-05 の点検） ========== */
  const t5 = await page.evaluate((sp2) => {
    const long = '04_Issues/2026-09-20_' + 'とても長い題名のイシュー'.repeat(10) + '.md';
    window.vaultlint.test.run([
      { path: long, text: '---\nstatus: closed\nclosed: 2026-10-01\n---\n# a' },
      { path: '30_Resources/foo' + sp2 + 'bar/y' + sp2 + 'z.md', text: '' },
    ], '2026-10-05', { privateDirs: [], issueDir: '04_Issues', closedDir: '90_Archive/{YYYY}' });
    const wrap = document.querySelector('#results section[data-key="closedIssues"] .table-wrap');
    const raw = document.querySelector('#results section[data-key="badNames"] td.vl-file.raw');
    const ws = (e) => (e ? getComputedStyle(e).whiteSpace : null);
    return { overflow: wrap ? wrap.scrollWidth - wrap.clientWidth : null,
      rawName: ws(raw && raw.querySelector('.vl-name')), rawDir: ws(raw && raw.querySelector('.vl-dir')) };
  }, SP2);
  r.check('VL-T5（長い名前は折り返して表が横にはみ出さない・ファイル名の罠の名前とフォルダは空白を詰めない）',
    t5.overflow === 0 && t5.rawName === 'pre-wrap' && t5.rawDir === 'pre-wrap', JSON.stringify(t5));

  /* ========== VL-U4: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u4 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('VL-U4（幅390pxで横スクロールなし）', u4 === true, String(u4));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#chips .chip')).map(e => e.dataset.cat));
  await page.click('ul.tool-list .tool-name:text-is("Check Vault")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  const hubH1 = await page.evaluate(() => document.querySelector('h1').textContent);
  r.check('ハブの「整理」カテゴリから遷移でき title と h1 が命名規約どおり',
    hubCats.includes('整理') && hubTitle === 'Check Vault (vaultlint)' && hubH1 === 'Check Vault',
    JSON.stringify([hubCats, hubTitle, hubH1]));

  /* ========== VL-U9/U10: 閉じたイシューの設定と一覧（VL-Q13） ========== */
  const u9 = await page.evaluate(() => {
    const ci = document.getElementById('cfg-issue'), cc = document.getElementById('cfg-closed');
    if (!ci || !cc) return { missing: true };
    ci.value = '/04_Issues/'; cc.value = '90_Archive/{YYYY}';
    document.getElementById('cfg-save').click();
    const saved = JSON.parse(localStorage.getItem('tools:config')).data;
    return { issueDir: saved.issueDir, closedDir: saved.closedDir };
  });
  r.check('VL-U9（設定欄: イシューのフォルダと閉じたイシューの移動先が保存され、{YYYY} は正規化で残る）',
    u9.issueDir === '04_Issues' && u9.closedDir === '90_Archive/{YYYY}', JSON.stringify(u9));
  const u10 = await page.evaluate((files) => {
    if (!window.vaultlint.test.run) return { missing: true };
    window.vaultlint.test.run(files, '2026-09-25', { issueDir: '04_Issues', closedDir: '90_Archive/{YYYY}' });
    const h2 = Array.from(document.querySelectorAll('#results h2')).map(h => h.textContent);
    const block = Array.from(document.querySelectorAll('#results section')).find(sec => sec.querySelector('h2').textContent.includes('閉じたイシュー'));
    const sel = block && block.querySelector('select.fix-select');
    const withCfg = {
      title: h2.find(t => t.includes('閉じたイシュー')) || '',
      options: sel ? Array.from(sel.options).map(o => o.value) : [],
      label: sel ? Array.from(sel.options).map(o => o.textContent).join(' | ') : '',
      value: sel ? sel.value : '',
    };
    window.vaultlint.test.run(files, '2026-09-25', {});
    const without = Array.from(document.querySelectorAll('#results h2')).map(h => h.textContent).some(t => t.includes('閉じたイシュー'));
    return { withCfg, without };
  }, CI);
  r.check('VL-U10（一覧: issueDir ありで「閉じたイシュー（2件）」が出て既定が移動・ラベルに年つきの移動先／未設定なら検査クラスごと出ない）',
    !u10.missing && u10.withCfg.title.includes('2件') && u10.withCfg.options.includes('archive')
    && u10.withCfg.label.includes('90_Archive/2026') && u10.withCfg.value === 'archive' && u10.without === false,
    JSON.stringify(u10));
  const u11 = await page.evaluate(([files, cand]) => {
    window.vaultlint.test.run(files, '2026-09-25', { issueDir: '04_Issues', closedDir: cand });
    const block = Array.from(document.querySelectorAll('#results section')).find(sec => sec.querySelector('h2').textContent.includes('閉じたイシュー'));
    if (!block) return { missing: true };
    const heads = Array.from(block.querySelectorAll('th')).map(th => th.textContent);
    const labels = Array.from(block.querySelectorAll('select.fix-select')).map(sel => Array.from(sel.options).map(o => o.textContent).join(' | '));
    return { heads, labels };
  }, [CP, CAND]);
  r.check('VL-U11（案件フォルダのある閉じたイシューは「10_Projects/ITK/Archive/ へ移動」・表に案件の列）',
    !u11.missing && u11.heads.includes('案件') && u11.labels.some(l => l.includes('10_Projects/ITK/Archive/ へ移動')),
    JSON.stringify(u11));

  await browser.close();
  r.report('vaultlint（docs/specs/vaultlint.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
