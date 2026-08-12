"use strict";
/* 目的: docs/specs/doc2xl.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/doc2xl.js  /  ./test/run doc2xl

   照合するID: DX-01〜18・DX-U1〜U5
   仕様の正本は docs/specs/doc2xl.md。期待値を変えるときは spec を先に直す。

   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。 */

const { launch, fileUrl, createRunner, eq, bannerIs } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/doc2xl.html'));
  // 前回セッションの tools:doc2xl が残っていると復元済み入力で偽 fail する
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const conv = (text, opts) => page.evaluate(
    ([t, o]) => window.doc2xl.convert(t, o), [text, opts || {}]);

  /* ========== DX-01: 基本の変換（H1〜H3＋箇条書き） ========== */
  const DOC1 = [
    '# 機能一覧',
    '## 商品管理',
    '### 商品検索',
    '- 検索条件を入力できる',
    '- 結果を一覧表示する',
    '',
  ].join('\n');
  const MD1 = [
    '| 大項目 | 中項目 | 小項目 | 内容 |',
    '|---|---|---|---|',
    '| 機能一覧 | 商品管理 | 商品検索 | 検索条件を入力できる |',
    '|  |  |  | 結果を一覧表示する |',
  ].join('\n');
  const TSV1 = [
    '大項目\t中項目\t小項目\t内容',
    '機能一覧\t商品管理\t商品検索\t検索条件を入力できる',
    '\t\t\t結果を一覧表示する',
  ].join('\n');
  const s01 = await conv(DOC1);
  r.check('DX-01（H1〜H3＋箇条書き → 3階層。繰り返しは空セル。TSV はヘッダー付き）',
    s01.ok && s01.md === MD1 && s01.tsv === TSV1 && eq(s01.warnings, []),
    JSON.stringify({ md: s01.md === MD1 ? '' : s01.md, tsv: s01.tsv === TSV1 ? '' : s01.tsv }));

  /* ========== DX-02: 空セル埋め ON ========== */
  const s02 = await conv(DOC1, { fill: true });
  r.check('DX-02（fill: true で階層列が上の値で埋まる）',
    s02.ok && s02.md.split('\n')[3] === '| 機能一覧 | 商品管理 | 商品検索 | 結果を一覧表示する |',
    JSON.stringify(s02.md.split('\n')[3]));

  /* ========== DX-03: H1 のみ＋複数行の段落（セル内改行） ========== */
  const s03 = await conv('# 概要\nこれは概要です。\n2行目も続く。\n');
  r.check('DX-03（H1 のみ → 階層列1つ。連続行の段落はセル内改行で1セル）',
    s03.ok && s03.md === [
      '| 大項目 | 内容 |', '|---|---|',
      '| 概要 | これは概要です。<br>2行目も続く。 |'].join('\n')
    // 引用されたセル内の改行を split('\n') が分割するので TSV は全文で比較する
    && s03.tsv === '大項目\t内容\n概要\t"これは概要です。\n2行目も続く。"',
    JSON.stringify(s03.md));

  /* ========== DX-04: 階層飛び（H1 → H3） ========== */
  const s04 = await conv('# A\n### C\n- x\n');
  r.check('DX-04（H2 を飛ばすと中項目が空のまま H3 が小項目に入る）',
    s04.ok && s04.md.split('\n')[2] === '| A |  | C | x |'
    && s04.value.depth === 3,
    JSON.stringify(s04.md));

  /* ========== DX-04b: 内容の無い見出しも行として残る ========== */
  const s04b = await conv('# A\n## B1\n## B2\n- x\n');
  r.check('DX-04b（内容の無い見出し B1 の行が消えない）',
    s04b.ok && eq(s04b.md.split('\n').slice(2), ['| A | B1 |  |', '|  | B2 | x |']),
    JSON.stringify(s04b.md));

  /* ========== DX-05: 見出しなし ========== */
  const s05 = await conv('- a\n- b\n');
  r.check('DX-05（見出しなし → 階層列0・内容列だけ）',
    s05.ok && s05.md === '| 内容 |\n|---|\n| a |\n| b |' && s05.value.depth === 0,
    JSON.stringify(s05.md));

  /* ========== DX-06: 見出しより前の導入文 ========== */
  const s06 = await conv('はじめに書く導入文です。\n\n# A\n- x\n');
  r.check('DX-06（導入文は階層列すべて空＋内容に入る）',
    s06.ok && eq(s06.md.split('\n').slice(2), ['|  | はじめに書く導入文です。 |', '| A | x |']),
    JSON.stringify(s06.md));

  /* ========== DX-07: ネストした箇条書き ========== */
  const s07 = await conv('# A\n- 親\n  - 子\n    - 孫\n');
  r.check('DX-07（ネストは全角スペース×深さで字下げ）',
    s07.ok && eq(s07.md.split('\n').slice(2),
      ['| A | 親 |', '|  | 　子 |', '|  | 　　孫 |']),
    JSON.stringify(s07.md));

  /* ========== DX-08: 番号付きリスト ========== */
  const s08 = await conv('# A\n1. 一つ目\n2. 二つ目\n3) 括弧の番号\n');
  r.check('DX-08（番号は 1. 形式に揃って残る）',
    s08.ok && eq(s08.md.split('\n').slice(2),
      ['| A | 1. 一つ目 |', '|  | 2. 二つ目 |', '|  | 3. 括弧の番号 |']),
    JSON.stringify(s08.md));

  /* ========== DX-13: YAML front matter ========== */
  const s13 = await conv('---\ntitle: 設計書\ntags: [a]\n---\n# A\n- x\n');
  r.check('DX-13（front matter を落として警告する）',
    s13.ok && s13.md.split('\n')[2] === '| A | x |'
    && s13.warnings.length === 1 && s13.warnings[0].includes('front matter'),
    JSON.stringify([s13.md, s13.warnings]));

  /* ========== DX-16: 空入力 ========== */
  const s16a = await conv('');
  const s16b = await conv('  \n\n  ');
  r.check('DX-16（空入力・空白のみ → ok・出力空・警告なし）',
    s16a.ok && s16a.md === '' && s16a.tsv === '' && eq(s16a.warnings, [])
    && s16b.ok && s16b.md === '' && s16b.tsv === '',
    JSON.stringify([s16a, s16b]));

  await browser.close();
  r.report('doc2xl（docs/specs/doc2xl.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
