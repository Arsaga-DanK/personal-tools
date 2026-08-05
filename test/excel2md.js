'use strict';
/* 目的: docs/specs/excel2md.md のテストケースを file:// 実機で照合する
   入力: なし（--shots を付けると .playwright-mcp/ にスクリーンショットを書く）
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/excel2md.js  /  node test/excel2md.js --shots

   照合するID: E2M-01〜10 / R01〜R08 / H01〜H09 / P01〜P24
   仕様の正本は docs/specs/excel2md.md。期待値を変えるときは spec を先に直す。 */

const path = require('path');
const { launch, fileUrl, createRunner, eq, REPO } = require('./helpers');

const SHOTS = process.argv.includes('--shots');
const shotPath = name => path.join(REPO, '.playwright-mcp', name); // .gitignore 済み

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/excel2md.html'));

  /* ========== 純関数: E2M-01〜10（TSV→MD） ========== */
  const conv = await page.evaluate(() => {
    const c = window.excel2md.convert;
    const w = res => res.warnings.map(x => x.type + ':' + x.message);
    return {
      t01: c('名前\t年齢\n田中\t30\n佐藤\t25', {}).markdown,
      t02: c('項目\tメモ\nA\t"1行目\n2行目"', {}).markdown,
      t03: c('記号\t説明\na | b\t縦棒', {}).markdown,
      t04: c('A\tB\tC\nx\ty', {}).markdown, t04w: w(c('A\tB\tC\nx\ty', {})),
      t05: c(' a \tb', { trim: false }).markdown,
      t06: c('こんにちは', {}).markdown, t06w: w(c('こんにちは', {})),
      t07: c('x\ty', { header: false }).markdown,
      t08: c('x'.repeat(2000001), {}).markdown, t08w: w(c('x'.repeat(2000001), {})),
      t09: c('A\tB\n1\t2', { alignments: ['left', 'right'] }).markdown,
      t10: c('A\tB', { alignments: ['center'] }).markdown,
      // P7: grid が返り、チップ行専用だった cols/firstRow が消えていること
      p7: (() => {
        const res = c('名前\t年齢\n田中\t30', {});
        return { grid: res.grid, hasCols: 'cols' in res, hasFirstRow: 'firstRow' in res };
      })(),
      p7empty: c('', {}).grid,
      p7trim: c(' a \tb', { trim: true }).grid,
    };
  });
  r.check('E2M-01', conv.t01 === '| 名前 | 年齢 |\n| --- | --- |\n| 田中 | 30 |\n| 佐藤 | 25 |', conv.t01);
  r.check('E2M-02', conv.t02 === '| 項目 | メモ |\n| --- | --- |\n| A | 1行目<br>2行目 |', conv.t02);
  r.check('E2M-03', conv.t03 === '| 記号 | 説明 |\n| --- | --- |\n| a \\| b | 縦棒 |', conv.t03);
  r.check('E2M-04', conv.t04 === '| A | B | C |\n| --- | --- | --- |\n| x | y |  |'
    && conv.t04w.length === 1 && conv.t04w[0].startsWith('warn:行によって列数'), JSON.stringify([conv.t04, conv.t04w]));
  r.check('E2M-05', conv.t05 === '|  a  | b |\n| --- | --- |', conv.t05);
  r.check('E2M-06', conv.t06 === '| こんにちは |\n| --- |'
    && conv.t06w.length === 1 && conv.t06w[0].startsWith('info:タブ区切り'), JSON.stringify([conv.t06, conv.t06w]));
  r.check('E2M-07', conv.t07 === '|  |  |\n| --- | --- |\n| x | y |', conv.t07);
  r.check('E2M-08', conv.t08 === '' && conv.t08w.length === 1 && conv.t08w[0].includes('上限'), JSON.stringify([conv.t08, conv.t08w]));
  r.check('E2M-09', conv.t09 === '| A | B |\n| :--- | ---: |\n| 1 | 2 |', conv.t09);
  r.check('E2M-10', conv.t10 === '| A | B |\n| :---: | --- |', conv.t10);
  r.check('P7（convert 戻り値）', eq(conv.p7.grid, [['名前', '年齢'], ['田中', '30']])
    && !conv.p7.hasCols && !conv.p7.hasFirstRow && eq(conv.p7empty, []) && eq(conv.p7trim, [['a', 'b']]),
    JSON.stringify(conv.p7));

  /* ========== 純関数: E2M-R01〜R08（MD→TSV） ========== */
  const rev = await page.evaluate(() => {
    const f = window.excel2md.convertFromMd;
    const w = res => res.warnings.map(x => x.type + ':' + x.message);
    const r05 = f('| A | B |\n| :--- | ---: |\n| 1 | 2 |', {});
    const r07md = window.excel2md.convert('A\tB\n1\t2', { alignments: ['left', 'right'] }).markdown;
    const r07 = f(r07md, {});
    const r06 = f('ただのテキスト', {});
    return {
      r01: f('| A | B |\n| --- | --- |\n| 1 | 2 |', {}).tsv,
      r02: f('| a | x<br>y |\n| --- | --- |', {}),
      r03: f('| a \\| b |\n| --- |', {}).tsv,
      r04: f('A | B\n--- | ---\n1 | 2', {}).tsv,
      r05, r05w: w(r05),
      r06w: w(r06), r06tsv: r06.tsv,
      r07tsv: r07.tsv, r07al: r07.alignments, r07md,
      r07back: window.excel2md.convert(r07.tsv, { alignments: r07.alignments }).markdown,
      r08a: w(f('| A |\n| :--- |\n| 1 |', {})).length,
      r08b: w(f('| A |\n| --- |\n| 1 |', {})).length,
      // P7: grid の追加（認識失敗時は []）
      p7grid: f('| A | B |\n| --- | --- |\n| 1 | 2 |', {}).grid,
      p7fail: r06.grid,
    };
  });
  r.check('E2M-R01', rev.r01 === 'A\tB\n1\t2', rev.r01);
  r.check('E2M-R02', rev.r02.tsv === 'a\t"x\ny"' && rev.r02.html.includes('mso-data-placement:same-cell'), rev.r02.tsv);
  r.check('E2M-R03', rev.r03 === 'a | b', rev.r03);
  r.check('E2M-R04', rev.r04 === 'A\tB\n1\t2', rev.r04);
  r.check('E2M-R05', rev.r05.tsv === 'A\tB\n1\t2' && eq(rev.r05.alignments, ['left', 'right'])
    && rev.r05.html.includes('align="left"')
    && rev.r05w.length === 1 && rev.r05w[0].startsWith('info:揃え指定'),
    JSON.stringify([rev.r05.tsv, rev.r05.alignments, rev.r05w]));
  r.check('E2M-R06', rev.r06tsv === '' && rev.r06w.length === 1 && rev.r06w[0].includes('認識できません'), JSON.stringify(rev.r06w));
  r.check('E2M-R07', rev.r07tsv === 'A\tB\n1\t2' && eq(rev.r07al, ['left', 'right']) && rev.r07back === rev.r07md,
    JSON.stringify([rev.r07tsv, rev.r07al, rev.r07back]));
  r.check('E2M-R08', rev.r08a === 1 && rev.r08b === 0, JSON.stringify([rev.r08a, rev.r08b]));

  /* ===== E2M-R09〜R12: 2つ目以降の表（XL-2） ===== */
  const multi = await page.evaluate(() => {
    const f = window.excel2md.convertFromMd;
    const T1 = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const T2 = '| C | D |\n| --- | --- |\n| 3 | 4 |';
    const probe = text => {
      const res = f(text, {});
      return { tsv: res.tsv, warn: res.warnings.map(w => w.type + ':' + w.message) };
    };
    return {
      r09: probe(T1 + '\n\n' + T2),
      r10a: probe(T1 + '\n\n説明\n\n' + T2),
      r10b: probe(T1 + '\n\n' + T2 + '\n\n| E | F |\n| --- | --- |\n| 5 | 6 |'),
      r10c: probe(T1 + '\n\n| C | D | E |\n| --- | --- | --- |\n| 3 | 4 | 5 |'),
      r11: probe(T1 + '\n| --- | --- |\n| 9 | 9 |'),
      r12a: probe(T1),
      r12b: probe('説明文\n\n' + T1),
      r12c: probe(T1 + '\n\nこれは説明文です。'),
      r12d: probe(T1 + '\n\n| C | D |'),
      r12e: probe(T1 + '\n'),
      // 区切り行の直後に区切り行（ヘッダーが無いので次の表ではない）
      sep2: probe('| A | B |\n| --- | --- |\n| --- | --- |\n| 1 | 2 |'),
    };
  });
  const FIRST = 'A\tB\n1\t2';
  const MORE = 'info:最初の表のみ変換しました（2つ目以降の表は無視されます）';
  r.check('E2M-R09（空行区切りの2表: 1つ目だけ変換し --- が混入しない＋info）',
    multi.r09.tsv === FIRST && eq(multi.r09.warn, [MORE]), JSON.stringify(multi.r09));
  r.check('E2M-R10（テキストを挟む/3表/列数違いでも1つ目だけ＋info）',
    [multi.r10a, multi.r10b, multi.r10c].every(x => x.tsv === FIRST && eq(x.warn, [MORE])),
    JSON.stringify([multi.r10a, multi.r10b, multi.r10c]));
  r.check('E2M-R11（空行なしの区切り行は GFM どおりデータ行・誤検出しない）',
    multi.r11.tsv === 'A\tB\n1\t2\n---\t---\n9\t9' && eq(multi.r11.warn, []),
    JSON.stringify(multi.r11));
  r.check('E2M-R12（1表のみ/前後にテキスト/区切りなしの | 行では info を出さない）',
    [multi.r12a, multi.r12b, multi.r12c, multi.r12d, multi.r12e]
      .every(x => x.tsv === FIRST && eq(x.warn, []))
    && multi.sep2.tsv === 'A\tB\n---\t---\n1\t2' && eq(multi.sep2.warn, []),
    JSON.stringify([multi.r12a, multi.r12b, multi.r12c, multi.r12d, multi.r12e, multi.sep2]));
  r.check('P7（convertFromMd 戻り値）', eq(rev.p7grid, [['A', 'B'], ['1', '2']]) && eq(rev.p7fail, []), JSON.stringify(rev.p7fail));

  /* ========== 純関数: E2M-H01〜H09（結合セル展開） ========== */
  const html = await page.evaluate(() => {
    const p = window.excel2md.parseHtmlTable, fh = window.excel2md.convertFromHtml;
    const w = res => res.warnings.map(x => x.type + ':' + x.message);
    const h1 = '<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>';
    const h3 = '<table><tr><td>a<br>b</td><td>c\n  d</td></tr></table>';
    const h4 = '<div>ただのテキスト</div>';
    const h8 = '<table><tr><td rowspan="1000" colspan="1000">A</td></tr></table>';
    const p9 = p('<table><tr><td rowspan="200" colspan="1000">A</td></tr></table>', 200000);
    return {
      h1: p(h1), h1c: fh(h1), h1w: w(fh(h1)),
      h2: p('<table><tr><td colspan="2">X</td></tr><tr><td>a</td><td>b</td></tr></table>'),
      h3: p(h3), h3w: w(fh(h3)),
      h4: p(h4), h4c: fh(h4), h4w: w(fh(h4)),
      h8: p(h8, 200000), h8c: fh(h8), h8w: w(fh(h8)),
      h9: { tooLarge: p9.tooLarge, rows: p9.grid && p9.grid.length, cols: p9.grid && p9.grid[0].length },
    };
  });
  r.check('E2M-H01', eq(html.h1.grid, [['A', 'B'], ['A', 'C']]) && html.h1.merged === true
    && html.h1c.tsv === 'A\tB\nA\tC' && html.h1w.length === 1 && html.h1w[0].includes('結合セルを展開'), JSON.stringify(html.h1));
  r.check('E2M-H02', eq(html.h2.grid, [['X', 'X'], ['a', 'b']]) && html.h2.merged === true, JSON.stringify(html.h2));
  r.check('E2M-H03', eq(html.h3.grid, [['a\nb', 'c d']]) && html.h3.merged === false
    && html.h3w.length === 1 && html.h3w[0].includes('HTMLの表として取り込みました'), JSON.stringify([html.h3, html.h3w]));
  r.check('E2M-H04', html.h4.grid === null && html.h4.tooLarge === false
    && html.h4c.tsv === null && html.h4w.length === 0, JSON.stringify(html.h4));
  r.check('E2M-H08', html.h8.grid === null && html.h8.tooLarge === true && html.h8c.tsv === null
    && html.h8w.length === 1 && html.h8w[0].includes('20万セル'), JSON.stringify([html.h8, html.h8w]));
  r.check('E2M-H09', html.h9.tooLarge === false && html.h9.rows === 200 && html.h9.cols === 1000, JSON.stringify(html.h9));

  /* ========== 純関数: E2M-P01〜P06（previewShape の描画上限） ========== */
  const ps = await page.evaluate(() => {
    const s = window.excel2md.previewShape;
    return { p1: s(3, 2), p2: s(1000, 3), p3: s(500, 60), p4: s(10, 100), p5: s(0, 0), p6: s(200, 25) };
  });
  r.check('E2M-P01', eq(ps.p1, { shownRows: 3, shownCols: 2, omittedRows: 0, omittedCols: 0 }), JSON.stringify(ps.p1));
  r.check('E2M-P02', eq(ps.p2, { shownRows: 200, shownCols: 3, omittedRows: 800, omittedCols: 0 }), JSON.stringify(ps.p2));
  r.check('E2M-P03', eq(ps.p3, { shownRows: 83, shownCols: 60, omittedRows: 417, omittedCols: 0 }), JSON.stringify(ps.p3));
  r.check('E2M-P04', eq(ps.p4, { shownRows: 10, shownCols: 60, omittedRows: 0, omittedCols: 40 }), JSON.stringify(ps.p4));
  r.check('E2M-P05', eq(ps.p5, { shownRows: 0, shownCols: 0, omittedRows: 0, omittedCols: 0 }), JSON.stringify(ps.p5));
  r.check('E2M-P06', eq(ps.p6, { shownRows: 200, shownCols: 25, omittedRows: 0, omittedCols: 0 }), JSON.stringify(ps.p6));

  /* ========== UI ヘルパー ========== */
  const setDirection = d => page.evaluate(v => {
    const radio = document.querySelector('input[name="direction"][value="' + v + '"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }, d);

  const setOpt = (id, v) => page.evaluate(([i, val]) => {
    const c = document.getElementById(i);
    if (c.checked !== val) { c.checked = val; c.dispatchEvent(new Event('change', { bubbles: true })); }
  }, [id, v]);

  // 入力は 200ms デバウンス。重い入力ではイベントループが渋滞するため余裕をとる
  // （docs/verification-notes.md §4「800ms 以上待つ」）
  const setInput = async (v, wait) => {
    await page.evaluate(val => {
      const ta = document.getElementById('input');
      ta.value = val;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    await page.waitForTimeout(wait || 350);
  };

  const dom = () => page.evaluate(() => {
    const t = document.getElementById('preview');
    const texts = sel => Array.from(t.querySelectorAll(sel)).map(e => e.textContent);
    const firstBody = t.querySelector('tbody tr');
    const dataRows = Array.from(t.querySelectorAll('tr')).slice(1); // 揃え操作行を除く
    const colAlign = i => dataRows.map(tr => tr.children[i] && tr.children[i].style.textAlign);
    const note = document.getElementById('preview-note');
    return {
      hidden: document.getElementById('preview-section').hidden,
      theadTr: t.querySelectorAll('thead tr').length,
      tbodyTr: t.querySelectorAll('tbody tr').length,
      headerCells: texts('thead tr:nth-child(2) th'),
      alignLabels: texts('tr.align-row th'),
      alignBtns: t.querySelectorAll('.align-btn').length,
      alignStatics: t.querySelectorAll('.align-static').length,
      firstBodyCells: firstBody ? Array.from(firstBody.children).map(e => e.textContent) : null,
      bodyThCount: t.querySelectorAll('tbody th').length,
      col0Align: colAlign(0),
      col1Align: colAlign(1),
      note: note.hidden ? '' : note.textContent,
      hint: document.getElementById('preview-hint').textContent,
      output: document.getElementById('output').value,
      sepLine: document.getElementById('output').value.split('\n')[1],
      hasB: !!t.querySelector('b'),
      whiteSpace: firstBody ? getComputedStyle(firstBody.children[0]).whiteSpace : '',
      alignBarExists: !!document.querySelector('.align-bar'), // Phase P で撤去済み
      noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });

  // 前セッションの localStorage が残っていると既定値ケースが偽 fail する（verification-notes §1）
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  /* ========== E2M-P07: 列数・行数が変換結果と一致 ========== */
  await setInput('名前\t年齢\n田中\t30\n佐藤\t25');
  let d = await dom();
  r.check('E2M-P07', !d.hidden && d.theadTr === 2 && d.tbodyTr === 2
    && eq(d.headerCells, ['名前', '年齢']) && eq(d.alignLabels, ['−', '−']) && d.alignBtns === 2
    && eq(d.firstBodyCells, ['田中', '30']) && !d.alignBarExists && d.noHScroll, JSON.stringify(d));

  /* ========== E2M-P08: 揃えクリックの循環と区切り行の連動 ========== */
  await page.click('.align-btn[data-col="0"]');
  const c1 = await dom();
  await page.click('.align-btn[data-col="0"]');
  await page.click('.align-btn[data-col="0"]');
  const c3 = await dom();
  await page.click('.align-btn[data-col="0"]');
  const c4 = await dom();
  r.check('E2M-P08',
    c1.alignLabels[0] === '左' && c1.sepLine === '| :--- | --- |' && c1.col0Align.every(a => a === 'left')
    && c3.alignLabels[0] === '右' && c3.sepLine === '| ---: | --- |' && c3.col0Align.every(a => a === 'right')
    && c4.alignLabels[0] === '−' && c4.sepLine === '| --- | --- |' && c4.col0Align.every(a => a === ''),
    JSON.stringify([c1.alignLabels[0], c1.sepLine, c1.col0Align, c3.alignLabels[0], c3.sepLine, c4.alignLabels[0], c4.col0Align]));

  /* ========== E2M-P09: ヘッダーOFF ========== */
  await setOpt('opt-header', false);
  d = await dom();
  r.check('E2M-P09', d.theadTr === 1 && d.tbodyTr === 3 && d.bodyThCount === 0
    && d.alignBtns === 2 && eq(d.firstBodyCells, ['名前', '年齢']), JSON.stringify(d));
  await setOpt('opt-header', true);

  /* ========== E2M-P10: 空入力で非表示・揃えリセット ========== */
  await page.click('.align-btn[data-col="1"]');
  await setInput('');
  const dEmpty = await dom();
  await setInput('名前\t年齢\n田中\t30');
  const dBack = await dom();
  r.check('E2M-P10', dEmpty.hidden && eq(dBack.alignLabels, ['−', '−']), JSON.stringify([dEmpty.hidden, dBack.alignLabels]));

  /* ========== E2M-P11: 列数不一致（空セル補完が見える） ========== */
  await setInput('A\tB\tC\nx\ty');
  d = await dom();
  r.check('E2M-P11', d.theadTr === 2 && d.tbodyTr === 1
    && eq(d.headerCells, ['A', 'B', 'C']) && eq(d.firstBodyCells, ['x', 'y', '']), JSON.stringify(d));

  /* ========== E2M-P12: セル内改行は実際の改行として見える ========== */
  await setInput('項目\tメモ\nA\t"1行目\n2行目"');
  d = await dom();
  const ws = await page.evaluate(() => getComputedStyle(document.querySelector('#preview tbody tr').children[1]).whiteSpace);
  r.check('E2M-P12', eq(d.firstBodyCells, ['A', '1行目\n2行目']) && ws === 'pre-wrap', JSON.stringify([d.firstBodyCells, ws]));

  /* ========== E2M-P13: HTML が注入されない ========== */
  await setInput('a\tb\n<b>x</b>\ty');
  d = await dom();
  r.check('E2M-P13', eq(d.firstBodyCells, ['<b>x</b>', 'y']) && !d.hasB, JSON.stringify([d.firstBodyCells, d.hasB]));

  /* ========== E2M-P14: 205行 → 200行描画＋残り5行 ========== */
  await setInput(Array.from({ length: 205 }, (_, i) => 'a' + i + '\tb\tc').join('\n'), 800);
  d = await dom();
  r.check('E2M-P14', d.tbodyTr === 199 && d.note.includes('残り5行'), JSON.stringify([d.tbodyTr, d.note]));

  /* ========== E2M-P15: 70列 → 60列描画＋61列目以降 ========== */
  const wide = n => Array.from({ length: 70 }, (_, i) => n + i).join('\t');
  await setInput(wide('h') + '\n' + wide('v'), 800);
  d = await dom();
  r.check('E2M-P15', d.alignBtns === 60 && d.tbodyTr === 1 && d.firstBodyCells.length === 60
    && d.headerCells.length === 60 && d.note.includes('61列目以降'),
    JSON.stringify([d.alignBtns, d.tbodyTr, d.firstBodyCells.length, d.note]));

  /* ========== E2M-P16: 500行×60列 → セル予算で83行 ========== */
  const row60 = Array.from({ length: 60 }, (_, i) => 'c' + i).join('\t');
  await setInput(Array.from({ length: 500 }, () => row60).join('\n'), 800);
  d = await dom();
  r.check('E2M-P16', d.tbodyTr === 82 && d.note.includes('残り417行'), JSON.stringify([d.tbodyTr, d.note]));

  /* ========== E2M-P17: MD→TSV は読み取り専用 ========== */
  await setDirection('md2tsv');
  await setInput('| A | B |\n| :--- | ---: |\n| 1 | 2 |');
  d = await dom();
  r.check('E2M-P17', !d.hidden && d.alignBtns === 0 && d.alignStatics === 2
    && eq(d.alignLabels, ['左', '右']) && d.col0Align[0] === 'left' && d.col1Align[0] === 'right'
    && d.hint.includes('変更は入力の Markdown 側で'), JSON.stringify(d));

  /* ========== E2M-R09 の UI 面: バナー文言とプレビューが1つ目の表だけになる ========== */
  await setInput('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |');
  const multiUi = await page.evaluate(() => {
    const b = document.getElementById('banner');
    return {
      banner: b.hidden ? '' : b.textContent,
      cls: b.hidden ? '' : b.className,
      output: document.getElementById('output').value,
      previewRows: document.querySelectorAll('#preview tbody tr').length,
      previewHeader: Array.from(document.querySelectorAll('#preview thead tr:nth-child(2) th')).map(t => t.textContent),
    };
  });
  r.check('E2M-R09-UI（バナー文言・出力とプレビューが1つ目の表だけ）',
    multiUi.banner === '最初の表のみ変換しました（2つ目以降の表は無視されます）'
    && multiUi.cls.includes('banner-info')
    && multiUi.output === 'A\tB\n1\t2'
    && multiUi.previewRows === 1 && eq(multiUi.previewHeader, ['A', 'B']),
    JSON.stringify(multiUi));

  /* ========== E2M-P18: MD として認識できない入力 ========== */
  await setInput('ただのテキスト');
  d = await dom();
  const banner18 = await page.evaluate(() => {
    const b = document.getElementById('banner');
    return b.hidden ? '' : b.textContent;
  });
  r.check('E2M-P18', d.hidden && banner18.includes('認識できませんでした'), JSON.stringify([d.hidden, banner18]));

  /* ========== E2M-P19: トグル OFF・永続化・ラベル ========== */
  await setDirection('tsv2md');
  await setInput('名前\t年齢\n田中\t30');
  const label = await page.evaluate(() => document.getElementById('opt-preview').parentElement.textContent.trim());
  await setOpt('opt-preview', false);
  const offHidden = (await dom()).hidden;
  await page.reload();
  await page.waitForTimeout(150);
  const restored = await page.evaluate(() => document.getElementById('opt-preview').checked);
  await setInput('名前\t年齢\n田中\t30');
  const stillHidden = (await dom()).hidden;
  await setOpt('opt-preview', true);
  const backOn = await dom();
  r.check('E2M-P19', label.includes('（揃え指定）') && offHidden && restored === false && stillHidden
    && !backOn.hidden && backOn.tbodyTr === 1,
    JSON.stringify([label, offHidden, restored, stillHidden, backOn.hidden, backOn.tbodyTr]));

  /* ========== E2M-P20: フォーカス保持（Enter 連打で連続切替） ========== */
  await page.focus('.align-btn[data-col="0"]');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const focus = await page.evaluate(() => ({
    label: document.querySelector('.align-btn[data-col="0"]').textContent,
    cls: document.activeElement && document.activeElement.className,
    col: document.activeElement && document.activeElement.dataset && document.activeElement.dataset.col,
    sep: document.getElementById('output').value.split('\n')[1],
  }));
  r.check('E2M-P20', focus.label === '中央' && focus.cls === 'align-btn' && focus.col === '0'
    && focus.sep === '| :---: | --- |', JSON.stringify(focus));

  /* ========== E2M-H05〜H07: 合成 paste（プレビュー追加後の回帰確認） ========== */
  const paste = await page.evaluate(async () => {
    const ta = document.getElementById('input');
    const snap = () => ({
      input: ta.value,
      output: document.getElementById('output').value,
      banner: document.getElementById('banner').hidden ? '' : document.getElementById('banner').textContent,
    });
    const fire = async (dir, htmlFlavor, textFlavor) => {
      const radio = document.querySelector('input[name="direction"][value="' + dir + '"]');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      ta.value = '';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      // 空入力での揃えリセットはデバウンス後に走る。貼り付け前に確定させないと
      // 直前のケースで設定した揃えが区切り行に残り、偽 fail になる
      await new Promise(done => setTimeout(done, 300));
      const dt = new DataTransfer();
      if (htmlFlavor) dt.setData('text/html', htmlFlavor);
      if (textFlavor) dt.setData('text/plain', textFlavor);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      ta.dispatchEvent(ev);
      return Object.assign({ prevented: ev.defaultPrevented }, snap());
    };
    const h1 = '<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>';
    const h05 = await fire('tsv2md', h1, '');
    await new Promise(done => setTimeout(done, 500)); // デバウンス後も通知が残ること
    const kept = Object.assign(snap(), {
      previewRows: document.querySelectorAll('#preview tbody tr').length,
      previewHidden: document.getElementById('preview-section').hidden,
    });
    return { h05, kept, h06: await fire('tsv2md', '', 'a\tb'), h07: await fire('md2tsv', h1, '') };
  });
  r.check('E2M-H05', paste.h05.prevented === true && paste.h05.input === 'A\tB\nA\tC'
    && paste.h05.output === '| A | B |\n| --- | --- |\n| A | C |'
    && paste.h05.banner.includes('結合セルを展開'), JSON.stringify(paste.h05));
  r.check('E2M-H06', paste.h06.prevented === false && paste.h06.input === '', JSON.stringify(paste.h06));
  r.check('E2M-H07', paste.h07.prevented === false && paste.h07.input === '', JSON.stringify(paste.h07));
  r.check('検証手順12（取り込み通知の保持）', paste.kept.banner.includes('結合セルを展開')
    && !paste.kept.previewHidden && paste.kept.previewRows === 1, JSON.stringify(paste.kept));

  /* ========== E2M-P22: 境界ケース（例外で落ちないこと） ========== */
  await setDirection('tsv2md');
  const edges = {};
  for (const [name, input] of [
    ['1行2列', 'A\tB'], ['1列3行', 'あ\nい\nう'], ['空白のみ', '   '],
    ['タブのみ', '\t'], ['末尾改行', 'A\tB\n'], ['入力上限超過', 'x'.repeat(2000001)],
  ]) {
    await setInput(input, 800);
    const e = await dom();
    edges[name] = { hidden: e.hidden, thead: e.theadTr, tbody: e.tbodyTr, btns: e.alignBtns, out: e.output };
  }
  r.check('E2M-P22',
    // 1行のみの表は <tbody> が空になる（ヘッダー行が thead に入るため）
    edges['1行2列'].thead === 2 && edges['1行2列'].tbody === 0 && edges['1行2列'].btns === 2
    && edges['1列3行'].thead === 2 && edges['1列3行'].tbody === 2 && edges['1列3行'].btns === 1
    && edges['空白のみ'].tbody === 0 && edges['タブのみ'].btns === 2 && edges['末尾改行'].tbody === 0
    && edges['入力上限超過'].hidden === true && edges['入力上限超過'].out === '',
    JSON.stringify(edges));

  /* ========== E2M-P21: 既存ケースの回帰は上の3群で確認済み ========== */
  r.check('E2M-P21', true, '');

  if (SHOTS) {
    await setInput('工程\t担当\tメモ\n設計\t田中\t完了\n実装\t佐藤\t"画面A\n画面B"\nレビュー\t鈴木\t7/31 予定');
    await page.click('.align-btn[data-col="0"]');
    await page.click('.align-btn[data-col="2"]');
    await page.click('.align-btn[data-col="2"]');
    await page.screenshot({ path: shotPath('excel2md-preview.png'), fullPage: true });
  }

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hub = await page.evaluate(() => ({
    link: !!Array.from(document.querySelectorAll('a')).find(a => a.href.includes('web/excel2md.html')),
    desc: document.body.textContent.includes('表プレビュー'),
    oldEntry: document.body.textContent.includes('md2excel'),
  }));
  r.check('検証手順7（ハブ導線）', hub.link && hub.desc && !hub.oldEntry, JSON.stringify(hub));

  /* ========== 揃え操作行の sticky とダークモード ========== */
  const dark = r.watch(await browser.newPage({ colorScheme: 'dark', viewport: { width: 1280, height: 700 } }));
  await dark.goto(fileUrl('web/excel2md.html'));
  await dark.evaluate(() => localStorage.clear());
  await dark.reload();
  const rows30 = ['工程\t担当\tメモ'];
  for (let i = 1; i <= 30; i++) rows30.push('工程' + i + '\t担当' + i + '\tメモ' + i);
  await dark.evaluate(v => {
    const ta = document.getElementById('input');
    ta.value = v;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, rows30.join('\n'));
  await dark.waitForTimeout(400);
  await dark.click('.align-btn[data-col="2"]');
  await dark.click('.align-btn[data-col="2"]');
  await dark.click('.align-btn[data-col="2"]'); // 右寄せ
  await dark.evaluate(() => { document.getElementById('preview-wrap').scrollTop = 400; });
  await dark.waitForTimeout(120);
  const sticky = await dark.evaluate(() => {
    const wrap = document.getElementById('preview-wrap');
    const alignTh = document.querySelector('tr.align-row th');
    const headerTh = document.querySelector('#preview thead tr:nth-child(2) th');
    const wrapTop = wrap.getBoundingClientRect().top;
    return {
      scrolled: wrap.scrollTop > 0,
      stuck: Math.abs(alignTh.getBoundingClientRect().top - wrapTop) < 2,
      headerScrolledAway: headerTh.getBoundingClientRect().top < wrapTop,
      // collapse では sticky セルの枠線が消えるため box-shadow で下辺を描いている
      shadow: getComputedStyle(alignTh).boxShadow,
      thBg: getComputedStyle(alignTh).backgroundColor,
      pageBg: getComputedStyle(document.body).backgroundColor,
      rightAligned: getComputedStyle(document.querySelector('#preview tbody tr').children[2]).textAlign,
      noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  if (SHOTS) await dark.locator('#preview-section').screenshot({ path: shotPath('excel2md-sticky-dark.png') });
  r.check('E2M-P23（sticky）', sticky.scrolled && sticky.stuck && sticky.headerScrolledAway
    && sticky.shadow.includes('inset'), JSON.stringify(sticky));
  r.check('E2M-P24（ダークモード）', sticky.pageBg === 'rgb(13, 17, 23)' && sticky.thBg === 'rgb(33, 38, 45)'
    && sticky.rightAligned === 'right' && sticky.noHScroll, JSON.stringify(sticky));

  await browser.close();
  r.report('excel2md（docs/specs/excel2md.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
