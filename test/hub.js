'use strict';
/* 目的: index.html（ハブ）の表示順・検索・カテゴリ表示・リンク遷移を照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/hub.js  /  ./test/run hub

   ハブには spec ファイルが無いため、契約はこのハーネスと index.html の
   TOOLS / CATEGORY_ORDER のコメントが持つ。
   表示名（短い英語1語）と英名（ファイル名・spec・localStorage キー）の使い分けは
   CLAUDE.md「命名規約」が正本。HUB-9/HUB-10 がその規約を照合する。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('index.html'));

  /* ---------- 表示順 ---------- */
  const order = await page.evaluate(() => ({
    // 描画されたカテゴリ見出しと、その下のツール名を出現順に取る
    categories: Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent),
    groups: Array.from(document.querySelectorAll('ul.tool-list'))
      .map(ul => Array.from(ul.querySelectorAll('a')).map(a => a.textContent)),
    firstLink: document.querySelector('ul.tool-list a').textContent,
    toolsArray: window.hub.TOOLS.map(t => t.name),
  }));
  r.check('HUB-1（カテゴリ順: タスクが先頭）', order.categories[0] === 'タスク'
    && eq(order.categories, ['タスク', '変換・比較', '設計', '画像', '整理', 'PM']), JSON.stringify(order.categories));
  r.check('HUB-2（Tasks が最初のリンク）', order.firstLink === 'Tasks', order.firstLink);
  r.check('HUB-3（TOOLS 配列順が同カテゴリ内の表示順）',
    eq(order.toolsArray, ['Tasks', 'Tables', 'Convert', 'Text', 'Diff', 'Terms', 'Fill', 'Schema', 'Outline', 'Diagram', 'Mask', 'Lint', 'Dates'])
    && eq(order.groups, [['Tasks'], ['Tables', 'Convert', 'Text', 'Diff', 'Terms', 'Fill'], ['Schema', 'Outline', 'Diagram'], ['Mask'], ['Lint'], ['Dates']]),
    JSON.stringify([order.toolsArray, order.groups]));

  /* ---------- 全ツールが1回だけ載る ---------- */
  const listed = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('ul.tool-list a')).map(a => a.textContent);
    return { names, unique: new Set(names).size, total: window.hub.TOOLS.length, other: !!Array.from(document.querySelectorAll('.category-title')).find(e => e.textContent === 'その他') };
  });
  r.check('HUB-4（登録した13本が重複なく全て載る・「その他」が出ない）',
    listed.names.length === 13 && listed.unique === 13 && listed.total === 13 && !listed.other,
    JSON.stringify(listed));

  /* ---------- 検索（純関数＋UI） ---------- */
  const search = await page.evaluate(() => {
    const f = window.hub.filter;
    return {
      empty: f('').map(t => t.name),
      byName: f('Tasks').map(t => t.name),
      byDesc: f('vault').map(t => t.name),
      byWhen: f('週次').map(t => t.name),
      caseInsensitive: f('BASE64').map(t => t.name),   // devpad の desc の Base64
      partial: f('ables').map(t => t.name),            // 表示名 Tables の部分一致
                                                       // （'able' は Schema の desc の CREATE TABLE にも当たる）
      none: f('存在しない文字列').map(t => t.name),
      alias: f('norm').map(t => t.name),               // 英名（alias）でも辿れる
      aliasUpper: f('DEVPAD').map(t => t.name),        // alias も大文字小文字無視
      aliasPartial: f('excel2').map(t => t.name),      // alias の部分一致
      aliasHidden: Array.from(document.querySelectorAll('ul.tool-list')).some(
        ul => /taskboard|excel2md|devpad|norm/.test(ul.textContent)),  // 画面には出さない
    };
  });
  r.check('HUB-5（検索: 空・表示名・説明・用途・大文字小文字・部分一致）',
    eq(search.empty, ['Tasks', 'Tables', 'Convert', 'Text', 'Diff', 'Terms', 'Fill', 'Schema', 'Outline', 'Diagram', 'Mask', 'Lint', 'Dates'])
    && eq(search.byName, ['Tasks']) && eq(search.byDesc, ['Tasks', 'Lint'])   // 'vault' は両ツールの desc にある
    && eq(search.byWhen, ['Tasks']) && eq(search.caseInsensitive, ['Convert'])
    && eq(search.partial, ['Tables']) && eq(search.none, []),
    JSON.stringify(search));
  r.check('HUB-9（英名でもヒットする・英名は画面に出さない）',
    eq(search.alias, ['Text']) && eq(search.aliasUpper, ['Convert'])
    && eq(search.aliasPartial, ['Tables']) && search.aliasHidden === false,
    JSON.stringify([search.alias, search.aliasUpper, search.aliasPartial, search.aliasHidden]));

  /* ---------- 検索: Convert の説明が全11タブを網羅する ---------- */
  // Phase C で足した4タブ（XML/SQL/正規表現/基数）が desc に無いと、
  // タブ名で検索したとき Convert が「該当なし」になる（機能はあるのに辿れない）
  const tabSearch = await page.evaluate(() => {
    const f = window.hub.filter;
    return {
      regex: f('正規表現').map(t => t.name),
      xml: f('xml').map(t => t.name),
      sql: f('sql').map(t => t.name),      // 'sql' は Schema（PostgreSQL）にも当たる
      radix: f('基数').map(t => t.name),
    };
  });
  r.check('HUB-11（devpad の新4タブ（XML/SQL/正規表現/基数）が検索で辿れる）',
    eq(tabSearch.regex, ['Convert']) && eq(tabSearch.xml, ['Convert'])
    && eq(tabSearch.sql, ['Convert', 'Schema']) && eq(tabSearch.radix, ['Convert']),
    JSON.stringify(tabSearch));

  /* ---------- 検索: カテゴリ名でも絞れる（HUB-12） ---------- */
  const catSearch = await page.evaluate(() => ({
    seiri: window.hub.filter('整理').map(t => t.name),
    // 「設計」はカテゴリ（Schema・Outline）に加え、Tables・Diff・Mask の用途文（設計書）にも含まれる。
    // カテゴリ検索が無いと Schema（desc/when に「設計」の語が無い）だけが漏れる
    sekkei: window.hub.filter('設計').map(t => t.name),
  }));
  r.check('HUB-12（カテゴリ名で絞れる）',
    eq(catSearch.seiri, ['Lint']) && eq(catSearch.sekkei, ['Tables', 'Diff', 'Schema', 'Outline', 'Diagram', 'Mask']),
    JSON.stringify(catSearch));

  /* ---------- `/` で検索へフォーカス（HUB-13） ---------- */
  const slash = await page.evaluate(() => {
    const search = document.getElementById('search');
    search.blur();
    document.body.focus();
    const ev = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    const focused = document.activeElement === search;
    const prevented = ev.defaultPrevented;
    // 入力欄の中で押した `/` は奪わない（文字として打てる）
    const evIn = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    search.dispatchEvent(evIn);
    return { focused, prevented, inFieldPrevented: evIn.defaultPrevented };
  });
  r.check('HUB-13（`/` で検索にフォーカス・入力欄の中では奪わない）',
    slash.focused && slash.prevented && slash.inFieldPrevented === false,
    JSON.stringify(slash));

  /* ---------- カード全体がクリック可能（HUB-14） ---------- */
  await page.click('ul.tool-list li .desc');   // ツール名リンクの外（説明文）をクリック
  await page.waitForLoadState('load');
  const cardNav = await page.title();
  await page.goto(fileUrl('index.html'));
  const cardSelectGuard = await page.evaluate(() => {
    // テキスト選択中のクリック（選択して離した瞬間）では遷移しない
    const li = document.querySelector('ul.tool-list li');
    const desc = li.querySelector('.desc');
    const range = document.createRange();
    range.selectNodeContents(desc);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let navigated = false;
    li.querySelector('a').addEventListener('click', () => { navigated = true; }, { once: true });
    desc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    sel.removeAllRanges();
    return navigated;
  });
  r.check('HUB-14（カードのどこを押しても開く・テキスト選択中は遷移しない）',
    cardNav === 'Tasks (taskboard)' && cardSelectGuard === false,
    JSON.stringify([cardNav, cardSelectGuard]));

  const typeSearch = async q => {
    await page.fill('#search', q);
    await page.waitForTimeout(80);
    return page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('ul.tool-list a')).map(a => a.textContent),
      categories: Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent),
      empty: document.getElementById('empty-msg').hidden ? '' : document.getElementById('empty-msg').textContent,
    }));
  };
  const s1 = await typeSearch('Text');
  const s2 = await typeSearch('存在しない文字列');
  const s3 = await typeSearch('');
  r.check('HUB-6（UI 検索: 絞り込み・該当なし・クリアで復帰）',
    eq(s1.names, ['Text']) && eq(s1.categories, ['変換・比較'])       // 空のカテゴリ見出しは出ない
    && eq(s2.names, []) && s2.empty === '該当なし'
    && eq(s3.names, ['Tasks', 'Tables', 'Convert', 'Text', 'Diff', 'Terms', 'Fill', 'Schema', 'Outline', 'Diagram', 'Mask', 'Lint', 'Dates']) && s3.categories[0] === 'タスク',
    JSON.stringify([s1, s2, s3]));

  /* ---------- リンク遷移（全ツール） ---------- */
  // 期待値は TOOLS から導出する（表を二重に持つと片方だけ古くなる）
  const entries = await page.evaluate(() => window.hub.TOOLS.map(t => ({
    name: t.name, alias: t.alias, href: t.path,
    basename: t.path.replace(/^.*\//, '').replace(/\.html$/, ''),
  })));
  const navResults = [];
  for (const { name, alias, href, basename } of entries) {
    await page.goto(fileUrl('index.html'));
    await page.click('ul.tool-list a:text-is("' + name + '")');
    await page.waitForLoadState('load');
    const title = await page.title();
    const h1 = await page.evaluate(() => document.querySelector('h1').textContent);
    // 命名規約（CLAUDE.md）: h1 = 表示名 / title = 「表示名 (英名)」
    // ただし表示名と英名が同じなら表示名のみ（Diff (diff) は冗長）
    const wantTitle = name.toLowerCase() === alias ? name : name + ' (' + alias + ')';
    navResults.push({
      name, alias, href, title, h1,
      ok: title.toLowerCase().includes(alias),   // 表示名が英語なので大文字小文字を無視する
      naming: h1 === name && title === wantTitle && alias === basename,
    });
  }
  r.check('HUB-7（13本すべてリンクで遷移でき title が一致）',
    navResults.length === 13 && navResults.every(n => n.ok),
    JSON.stringify(navResults));
  r.check('HUB-10（h1 = 表示名・title = 「表示名 (英名)」・英名 = ファイル名）',
    navResults.length === 13 && navResults.every(n => n.naming),
    JSON.stringify(navResults.map(n => [n.name, n.h1, n.title, n.href])));

  /* ---------- 狭幅で横スクロールしない ---------- */
  await page.goto(fileUrl('index.html'));
  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => ({
    noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    firstLink: document.querySelector('ul.tool-list a').textContent,
  }));
  r.check('HUB-8（幅390pxで横スクロールなし・順序は不変）',
    narrow.noHScroll && narrow.firstLink === 'Tasks', JSON.stringify(narrow));

  await browser.close();
  r.report('ハブ（index.html）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
