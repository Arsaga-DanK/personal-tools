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

  /* ========== DX-09: 文書中の md 表 ========== */
  const s09 = await conv([
    '# 機能一覧', '## 商品管理', '### 商品検索', '',
    '| 項目 | 型 |', '|---|---|', '| コード | varchar |', '| a\\|b | x |', '',
  ].join('\n'));
  r.check('DX-09（表は内容列の右に展開・区切り行は消え・\\| エスケープは戻して再エスケープ）',
    s09.ok && s09.md === [
      '| 大項目 | 中項目 | 小項目 | 内容 |  |  |',
      '|---|---|---|---|---|---|',
      '| 機能一覧 | 商品管理 | 商品検索 |  | 項目 | 型 |',
      '|  |  |  |  | コード | varchar |',
      '|  |  |  |  | a\\|b | x |'].join('\n')
    && s09.tsv.split('\n')[2] === '\t\t\t\tコード\tvarchar'
    && s09.value.tableCols === 2,
    JSON.stringify(s09.md));

  /* ========== DX-10: コードブロック ========== */
  const s10 = await conv('# A\n```sql\nSELECT *\nFROM t\n```\n');
  r.check('DX-10（コードは1セルに改行込み・言語名は落ちる・TSV は " で囲む）',
    s10.ok && s10.md.split('\n')[2] === '| A | SELECT *<br>FROM t |'
    && s10.tsv === '大項目\t内容\nA\t"SELECT *\nFROM t"',
    JSON.stringify([s10.md, s10.tsv]));

  /* ========== DX-14: 見出し配下をまとめて1セル ========== */
  const s14 = await conv([
    '# 機能一覧', '## 商品管理', '### 商品検索',
    '- 検索条件を入力できる', '- 結果を一覧表示する', '',
    '| 項目 | 型 |', '|---|---|', '| コード | varchar |', '',
    '検索後の説明文。', '',
  ].join('\n'), { split: 'block' });
  r.check('DX-14（block: 内容が1セルに。表は独立した行のまま・表の後の内容は別セル）',
    s14.ok && eq(s14.md.split('\n').slice(2), [
      '| 機能一覧 | 商品管理 | 商品検索 | 検索条件を入力できる<br>結果を一覧表示する |  |  |',
      '|  |  |  |  | 項目 | 型 |',
      '|  |  |  |  | コード | varchar |',
      '|  |  |  | 検索後の説明文。 |  |  |']),
    JSON.stringify(s14.md));

  /* ========== DX-17b: 30列を超える表 ========== */
  const wideHeader = '| ' + Array.from({ length: 31 }, (_, k) => 'c' + (k + 1)).join(' | ') + ' |';
  const wideDelim = '|' + Array.from({ length: 31 }, () => '---').join('|') + '|';
  const s17b = await conv('# A\n' + wideHeader + '\n' + wideDelim + '\n- 普通の内容\n');
  r.check('DX-17b（31列の表はその表だけ内容列へ連結＋警告。他は普通に変換）',
    s17b.ok && s17b.value.tableCols === 0
    && s17b.md.split('\n')[2] === '| A | ' + Array.from({ length: 31 }, (_, k) => 'c' + (k + 1)).join(' \\| ') + ' |'
    && s17b.md.split('\n')[3] === '|  | 普通の内容 |'
    && s17b.warnings.some(w => w.includes('30列を超える表を1件')),
    JSON.stringify([s17b.warnings, s17b.md.split('\n')[3]]));

  /* ========== DX-13: YAML front matter ========== */
  const s13 = await conv('---\ntitle: 設計書\ntags: [a]\n---\n# A\n- x\n');
  r.check('DX-13（front matter を落として警告する）',
    s13.ok && s13.md.split('\n')[2] === '| A | x |'
    && s13.warnings.length === 1 && s13.warnings[0].includes('front matter'),
    JSON.stringify([s13.md, s13.warnings]));

  /* ========== DX-11: インライン記法の落としと警告 ========== */
  const s11 = await conv([
    '# A',
    '[仕様書](https://example.com) と ![構成図](img.png) と **強調** と `code` と user_id を含む。',
    '- [[ノート|別名]] を参照', '',
  ].join('\n'));
  r.check('DX-11（リンク・画像は件数を警告・強調とコードは記法だけ落ちる・user_id の _ は残る）',
    s11.ok && eq(s11.md.split('\n').slice(2), [
      '| A | 仕様書 と 構成図 と 強調 と code と user_id を含む。 |',
      '|  | 別名 を参照 |'])
    && s11.warnings.some(w => w.includes('リンクの URL を1件'))
    && s11.warnings.some(w => w.includes('画像を1件')),
    JSON.stringify([s11.md, s11.warnings]));

  /* ========== DX-12: 水平線・HTML ブロック・脚注定義 ========== */
  const s12 = await conv([
    '# A', '---', '<div>', '生HTML', '</div>', '', '[^1]: 脚注です', '',
  ].join('\n'));
  r.check('DX-12（水平線は落として警告・HTML と脚注は原文のまま1セル＋警告）',
    s12.ok && eq(s12.md.split('\n').slice(2), [
      '| A | <div><br>生HTML<br></div> |',
      '|  | [^1]: 脚注です |'])
    && s12.warnings.some(w => w.includes('水平線を1件'))
    && s12.warnings.some(w => w.includes('HTML ブロックを1件'))
    && s12.warnings.some(w => w.includes('脚注定義を1件')),
    JSON.stringify([s12.md, s12.warnings]));

  /* ========== DX-16: 空入力 ========== */
  const s16a = await conv('');
  const s16b = await conv('  \n\n  ');
  r.check('DX-16（空入力・空白のみ → ok・出力空・警告なし）',
    s16a.ok && s16a.md === '' && s16a.tsv === '' && eq(s16a.warnings, [])
    && s16b.ok && s16b.md === '' && s16b.tsv === '',
    JSON.stringify([s16a, s16b]));

  /* ========== DX-15: 階層列の見出し名 ========== */
  const s15a = await conv('# A\n## B\n### C\n- x\n', { names: 'level' });
  const s15b = await conv('# A\n## B\n### C\n- x\n', { names: 'custom', custom: 'カテゴリ, 機能' });
  r.check('DX-15（見出し名: レベル1〜3／カスタムの不足分はレベルNで補う）',
    s15a.ok && eq(s15a.value.header, ['レベル1', 'レベル2', 'レベル3', '内容'])
    && s15b.ok && eq(s15b.value.header, ['カテゴリ', '機能', 'レベル3', '内容']),
    JSON.stringify([s15a.value.header, s15b.value.header]));

  /* ========== DX-17: 性能ガード ========== */
  const s17in = await page.evaluate(() => window.doc2xl.convert('a'.repeat(500001), {}));
  const s17rows = await page.evaluate(() =>
    window.doc2xl.convert(Array.from({ length: 5001 }, (_, k) => '- r' + k).join('\n'), {}));
  r.check('DX-17（50万文字超・出力5,001行はどちらも処理せず理由を返す）',
    s17in.ok === false && s17in.error.includes('50万文字')
    && s17rows.ok === false && s17rows.error.includes('5,000行'),
    JSON.stringify([s17in.error, s17rows.error]));

  /* ========== DX-U1: リアルタイム変換とオプションの即反映 ========== */
  const setInput = async (text) => {
    await page.evaluate((t) => {
      const inp = document.getElementById('input');
      inp.value = t;
      inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, text);
    await page.waitForTimeout(400);
  };
  await setInput(DOC1);
  const u1md = await page.inputValue('#output');
  await page.check('#fmt-tsv');
  const u1tsv = await page.inputValue('#output');
  const u1title = await page.textContent('#out-title');
  await page.check('#fmt-md');
  await page.check('#opt-fill');
  const u1fill = await page.inputValue('#output');
  await page.uncheck('#opt-fill');
  r.check('DX-U1（リアルタイム変換・TSV 切替とタイトル・fill が即反映）',
    u1md === MD1 && u1tsv === TSV1 && u1title.includes('TSV')
    && u1fill.split('\n')[3] === '| 機能一覧 | 商品管理 | 商品検索 | 結果を一覧表示する |',
    JSON.stringify([u1md === MD1, u1tsv === TSV1, u1title]));

  /* ========== DX-U2: コピー（実クリップボードに書かない） ========== */
  const u2 = await page.evaluate(async () => {
    const captured = [];
    navigator.clipboard.writeText = (t) => { captured.push(t); return Promise.resolve(); };
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 30));
    const label = document.getElementById('copy-btn').textContent;
    return { captured, label };
  });
  await setInput('');
  const u2empty = await page.evaluate(async () => {
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 30));
    const b = document.getElementById('banner');
    return b.hidden ? '' : b.textContent;
  });
  r.check('DX-U2（コピーは現在の出力を渡す・空出力は案内だけ）',
    u2.captured.length === 1 && u2.captured[0] === MD1 && u2.label === '✓ コピーしました'
    && u2empty === 'コピーする内容がありません',
    JSON.stringify([u2.captured.length, u2.label, u2empty]));

  /* ========== DX-U6: デバウンス確定前のコピーでも最新の出力が渡る ========== */
  await setInput('# 新しい見出し');
  const u6 = await page.evaluate(async () => {
    const captured = [];
    navigator.clipboard.writeText = (t) => { captured.push(t); return Promise.resolve(); };
    const inp = document.getElementById('input');
    inp.value = '# 差し替え後';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
    document.getElementById('copy-btn').click();   // 250ms のデバウンスを待たずに押す
    await new Promise(d => setTimeout(d, 50));
    return captured;
  });
  r.check('DX-U6（デバウンス確定前のコピーで最新入力の出力が渡る）',
    u6.length === 1 && u6[0].includes('差し替え後') && !u6[0].includes('新しい見出し'),
    JSON.stringify(u6));
  await setInput('');   // DX-U3 はサンプルボタン（入力が空のとき表示）を前提にする

  /* ========== DX-U3: サンプル投入 ========== */
  const u3 = await page.evaluate(async () => {
    const btn = document.getElementById('sample-btn');
    const visibleWhenEmpty = !btn.hidden;
    btn.click();
    await new Promise(d => setTimeout(d, 30));
    const b = document.getElementById('banner');
    return {
      visibleWhenEmpty,
      hiddenAfter: btn.hidden,
      banner: b.hidden ? '' : b.textContent,
      out: document.getElementById('output').value.split('\n')[0],
    };
  });
  r.check('DX-U3（サンプルは空のときだけ見え、投入でリンク警告と表が出る）',
    u3.visibleWhenEmpty === true && u3.hiddenAfter === true
    && u3.banner.includes('リンクの URL を1件')
    && u3.out === '| 大項目 | 中項目 | 小項目 | 内容 |  |  |  |',   // サンプルの表は3列
    JSON.stringify(u3));

  /* ========== DX-17（UI）: ガード発動時は warn バナー＋出力空 ========== */
  await setInput(Array.from({ length: 5001 }, (_, k) => '- r' + k).join('\n'));
  const u17 = await bannerIs(page, '#banner', 'warn', '5,000行');
  const u17out = await page.inputValue('#output');
  r.check('DX-17-UI（ガード発動時は warn バナーが出て出力は空）',
    u17.ok && u17out === '', JSON.stringify([u17.detail, u17out.length]));

  /* ========== DX-U4: 保存と復元（10万文字超は復元されない） ========== */
  await setInput('# 保存テスト\n- x\n');
  await page.evaluate(() => {
    document.getElementById('opt-names').value = 'custom';
    document.getElementById('opt-names').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('opt-names-custom').value = '工程,作業';
    document.getElementById('opt-names-custom').dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.reload();
  const u4 = await page.evaluate(() => ({
    input: document.getElementById('input').value,
    names: document.getElementById('opt-names').value,
    custom: document.getElementById('opt-names-custom').value,
    customVisible: !document.getElementById('opt-names-custom').hidden,
    out: document.getElementById('output').value.split('\n')[0],
  }));
  await setInput('a'.repeat(100001));
  await page.reload();
  const u4big = await page.evaluate(() => document.getElementById('input').value);
  r.check('DX-U4（入力とオプションが復元される・10万文字超の入力は復元されない）',
    u4.input === '# 保存テスト\n- x\n' && u4.names === 'custom' && u4.custom === '工程,作業'
    && u4.customVisible === true && u4.out === '| 工程 | 内容 |'
    && u4big === '',
    JSON.stringify(u4));

  /* ========== DX-19/20: 見出しなし・未閉フェンスの案内（ミニUX監査 DX-A1/A2） ========== */
  const d1920 = await page.evaluate(() => {
    const c = window.doc2xl.convert;
    return {
      noHeading: c('ただの文章です。\n\n見出しはありません。', {}).warnings,
      empty: c('', {}).warnings,
      unclosed: c('# A\n\n```js\nconst x = 1;', {}).warnings,
    };
  });
  r.check('DX-19（見出し0件の入力に案内・空入力では出さない）',
    d1920.noHeading.some(w => w.includes('# 見出しが見つかりませんでした'))
    && d1920.empty.length === 0,
    JSON.stringify([d1920.noHeading, d1920.empty]));
  r.check('DX-20（閉じフェンスの無いコードブロックに警告）',
    d1920.unclosed.some(w => w.includes('閉じフェンス')),
    JSON.stringify(d1920.unclosed));

  /* ========== DX-U8: 体裁（app-wide・primary） ========== */
  const u8 = await page.evaluate(() => ({
    appWide: document.querySelector('main').classList.contains('app-wide'),
    primary: document.getElementById('copy-btn').classList.contains('primary'),
  }));
  r.check('DX-U8（main が app-wide・コピーが primary）',
    u8.appWide && u8.primary, JSON.stringify(u8));

  /* ========== DX-U5: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u5 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  r.check('DX-U5（幅390pxで横スクロールなし）', u5 === true, String(u5));
  await page.setViewportSize({ width: 1280, height: 900 });

  /* ========== DX-U7: Excel 用コピー（結合セル付き text/html。DS-16 と同じ捕捉技法） ========== */
  await page.evaluate(() => {
    // 前段のテスト（DX-U4 のカスタム見出し等）の状態を持ち込まない — 既定へ明示的に戻す
    const set = (id, prop, v) => {
      const e = document.getElementById(id);
      e[prop] = v;
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('opt-names', 'value', 'default');
    set('opt-split', 'value', 'line');
    set('opt-fill', 'checked', false);
    set('fmt-tsv', 'checked', true);
  });
  // 段落は空行区切り（連続行は1つの段落=1セルに畳まれるのが変換仕様）
  await setInput('# A\n\n本文1\n\n本文2\n\n## B\n\n本文3');
  const u7 = await page.evaluate(async () => {
    document.execCommand = () => false;   // ClipboardItem 経路に落として両フレーバーを読む
    const out = { html: null, plain: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: {
        writeText: () => Promise.resolve(),
        write: async items => {
          out.plain = await (await items[0].getType('text/plain')).text();
          out.html = await (await items[0].getType('text/html')).text();
        },
      },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 60));
    return out;
  });
  const u7fill = await page.evaluate(async () => {
    const f = document.getElementById('opt-fill');
    f.checked = true;
    f.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(d => setTimeout(d, 50));
    const out = { html: null };
    navigator.clipboard.write = async items => {
      out.html = await (await items[0].getType('text/html')).text();
    };
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 60));
    return out;
  });
  r.check('DX-U7（TSV コピーに結合セル付き text/html を併記・fill ON では結合しない）',
    !!u7.html && !!u7.plain && u7.plain.split('\n').length === 4   // ヘッダー＋3行
    && /<td rowspan="3"[^>]*>A</.test(u7.html)
    && /<td rowspan="2"[^>]*><\/td>/.test(u7.html)
    && (u7.html.match(/<th /g) || []).length === 3
    && (u7.html.match(/border:\.5pt solid #a6a6a6/g) || []).length > 0
    && !!u7fill.html && !/rowspan/.test(u7fill.html),
    JSON.stringify([u7.plain, (u7.html || '').slice(0, 300), (u7fill.html || '').slice(0, 120)]));

  /* ========== DX-21: Tab=インデント（箇条書きの入れ子 — lib/edit.js） ========== */
  const dx21 = await page.evaluate(() => {
    if (!window.ToolEdit) return { missing: true };
    const ta = document.getElementById('input');
    ta.value = '- 項目';
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    const afterTab = { v: ta.value, prevented: ev.defaultPrevented };
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const ev2 = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ta.dispatchEvent(ev2);
    return { afterTab, escPass: !ev2.defaultPrevented };
  });
  r.check('DX-21（Tab=インデント・Esc→Tab は素通し）',
    !dx21.missing && dx21.afterTab.v === '- 項目\t' && dx21.afterTab.prevented === true
    && dx21.escPass === true,
    JSON.stringify(dx21));

  /* ========== DX-18: ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent));
  await page.click('ul.tool-list a:text-is("Export Outline")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  const hubH1 = await page.evaluate(() => document.querySelector('h1').textContent);
  r.check('DX-18（ハブの設計カテゴリから遷移でき title と h1 が命名規約どおり）',
    hubCats.includes('設計') && hubTitle === 'Export Outline (doc2xl)' && hubH1 === 'Export Outline',
    JSON.stringify([hubCats, hubTitle, hubH1]));

  await browser.close();
  r.report('doc2xl（docs/specs/doc2xl.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
