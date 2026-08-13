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

  const lint = files => page.evaluate(fs => {
    const res = window.vaultlint.lint(fs);
    // 照合しやすい形に要約（issues は件数と主要フィールドだけ）
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      broken: res.issues.brokenLinks.map(i => [i.file, i.line, i.target]),
      missing: res.issues.missingAttachments.map(i => [i.file, i.line, i.target]),
      bad: res.issues.badNames.map(i => [i.path, i.reason]),
      dup: res.issues.dupBasenames.map(i => [i.base, i.paths]),
      stats: res.stats,
      warnings: res.warnings,
    };
  }, files);

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

  /* ========== VL-U1: UI 描画とコピー ========== */
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

  /* ========== VL-U2: 91_Private の除外（アダプタ層） ========== */
  const u2 = await page.evaluate(() => {
    window.vaultlint.test.run([
      { path: 'a.md', text: '[[b]]' },
      { path: 'b.md', text: '' },
      { path: '91_Private/secret.md', text: '[[存在しない]]' },
    ]);
    return {
      summary: document.getElementById('summary').textContent,
      leaked: document.getElementById('results').textContent.includes('91_Private'),
    };
  });
  r.check('VL-U2（91_Private はアダプタ層で除外・統計に計上・結果に現れない）',
    u2.summary.includes('除外 1') && u2.summary.includes('問題 0 件') && u2.leaked === false,
    JSON.stringify(u2));

  /* ========== VL-U3: 全て健全 ========== */
  const u3 = await page.evaluate(() => {
    window.vaultlint.test.run([{ path: 'a.md', text: '[[b]]' }, { path: 'b.md', text: '' }]);
    return {
      summary: document.getElementById('summary').textContent,
      okCount: document.querySelectorAll('.issue-ok').length,
    };
  });
  r.check('VL-U3（健全な vault は全クラス「問題なし」）',
    u3.summary.includes('問題 0 件') && u3.okCount === 4, JSON.stringify(u3));

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
  await page.click('ul.tool-list a:text-is("Lint")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  const hubH1 = await page.evaluate(() => document.querySelector('h1').textContent);
  r.check('ハブの「整理」カテゴリから遷移でき title と h1 が命名規約どおり',
    hubCats.includes('整理') && hubTitle === 'Lint (vaultlint)' && hubH1 === 'Lint',
    JSON.stringify([hubCats, hubTitle, hubH1]));

  await browser.close();
  r.report('vaultlint（docs/specs/vaultlint.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
