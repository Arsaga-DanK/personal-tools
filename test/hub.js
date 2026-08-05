'use strict';
/* 目的: index.html（ハブ）の表示順・検索・カテゴリ表示・リンク遷移を照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/hub.js  /  ./test/run hub

   ハブには spec ファイルが無いため、契約はこのハーネスと index.html の
   TOOLS / CATEGORY_ORDER のコメントが持つ。
   表示名（日本語）と英名（ファイル名・spec・localStorage キー）の使い分けは
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
    && eq(order.categories, ['タスク', '変換']), JSON.stringify(order.categories));
  r.check('HUB-2（タスク管理 が最初のリンク）', order.firstLink === 'タスク管理', order.firstLink);
  r.check('HUB-3（TOOLS 配列順が同カテゴリ内の表示順）',
    eq(order.toolsArray, ['タスク管理', '表変換', '開発ツール箱', '表記そろえ', '差分比較'])
    && eq(order.groups, [['タスク管理'], ['表変換', '開発ツール箱', '表記そろえ', '差分比較']]),
    JSON.stringify([order.toolsArray, order.groups]));

  /* ---------- 全ツールが1回だけ載る ---------- */
  const listed = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('ul.tool-list a')).map(a => a.textContent);
    return { names, unique: new Set(names).size, total: window.hub.TOOLS.length, other: !!Array.from(document.querySelectorAll('.category-title')).find(e => e.textContent === 'その他') };
  });
  r.check('HUB-4（登録した5本が重複なく全て載る・「その他」が出ない）',
    listed.names.length === 5 && listed.unique === 5 && listed.total === 5 && !listed.other,
    JSON.stringify(listed));

  /* ---------- 検索（純関数＋UI） ---------- */
  const search = await page.evaluate(() => {
    const f = window.hub.filter;
    return {
      empty: f('').map(t => t.name),
      byName: f('タスク管理').map(t => t.name),
      byDesc: f('vault').map(t => t.name),
      byWhen: f('週次').map(t => t.name),
      caseInsensitive: f('BASE64').map(t => t.name),   // devpad の desc の Base64
      partial: f('そろえ').map(t => t.name),           // 表示名の部分一致
      none: f('存在しない文字列').map(t => t.name),
      alias: f('norm').map(t => t.name),               // 英名（alias）でも辿れる
      aliasUpper: f('DEVPAD').map(t => t.name),        // alias も大文字小文字無視
      aliasPartial: f('excel2').map(t => t.name),      // alias の部分一致
      aliasHidden: Array.from(document.querySelectorAll('ul.tool-list')).some(
        ul => /taskboard|excel2md|devpad/.test(ul.textContent)),  // 画面には出さない
    };
  });
  r.check('HUB-5（検索: 空・表示名・説明・用途・大文字小文字・部分一致）',
    eq(search.empty, ['タスク管理', '表変換', '開発ツール箱', '表記そろえ', '差分比較'])
    && eq(search.byName, ['タスク管理']) && eq(search.byDesc, ['タスク管理'])
    && eq(search.byWhen, ['タスク管理']) && eq(search.caseInsensitive, ['開発ツール箱'])
    && eq(search.partial, ['表記そろえ']) && eq(search.none, []),
    JSON.stringify(search));
  r.check('HUB-9（英名でもヒットする・英名は画面に出さない）',
    eq(search.alias, ['表記そろえ']) && eq(search.aliasUpper, ['開発ツール箱'])
    && eq(search.aliasPartial, ['表変換']) && search.aliasHidden === false,
    JSON.stringify([search.alias, search.aliasUpper, search.aliasPartial, search.aliasHidden]));

  const typeSearch = async q => {
    await page.fill('#search', q);
    await page.waitForTimeout(80);
    return page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('ul.tool-list a')).map(a => a.textContent),
      categories: Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent),
      empty: document.getElementById('empty-msg').hidden ? '' : document.getElementById('empty-msg').textContent,
    }));
  };
  const s1 = await typeSearch('表記そろえ');
  const s2 = await typeSearch('存在しない文字列');
  const s3 = await typeSearch('');
  r.check('HUB-6（UI 検索: 絞り込み・該当なし・クリアで復帰）',
    eq(s1.names, ['表記そろえ']) && eq(s1.categories, ['変換'])       // 空のカテゴリ見出しは出ない
    && eq(s2.names, []) && s2.empty === '該当なし'
    && eq(s3.names, ['タスク管理', '表変換', '開発ツール箱', '表記そろえ', '差分比較']) && s3.categories[0] === 'タスク',
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
    navResults.push({
      name, alias, href, title, h1,
      ok: title.includes(alias),
      // 命名規約（CLAUDE.md）: h1 = 表示名 / title = 「表示名 — 英名」/ 英名 = ファイル名
      naming: h1 === name && title === name + ' — ' + alias && alias === basename,
    });
  }
  r.check('HUB-7（5本すべてリンクで遷移でき title が一致）',
    navResults.length === 5 && navResults.every(n => n.ok),
    JSON.stringify(navResults));
  r.check('HUB-10（h1 = 表示名・title = 「表示名 — 英名」・英名 = ファイル名）',
    navResults.length === 5 && navResults.every(n => n.naming),
    JSON.stringify(navResults.map(n => [n.name, n.h1, n.title, n.href])));

  /* ---------- 狭幅で横スクロールしない ---------- */
  await page.goto(fileUrl('index.html'));
  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => ({
    noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    firstLink: document.querySelector('ul.tool-list a').textContent,
  }));
  r.check('HUB-8（幅390pxで横スクロールなし・順序は不変）',
    narrow.noHScroll && narrow.firstLink === 'タスク管理', JSON.stringify(narrow));

  await browser.close();
  r.report('ハブ（index.html）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
