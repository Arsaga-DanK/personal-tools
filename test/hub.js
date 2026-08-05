'use strict';
/* 目的: index.html（ハブ）の表示順・検索・カテゴリ表示・リンク遷移を照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/hub.js  /  ./test/run hub

   ハブには spec ファイルが無いため、契約はこのハーネスと index.html の
   TOOLS / CATEGORY_ORDER のコメントが持つ。 */

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
  r.check('HUB-2（taskboard が最初のリンク）', order.firstLink === 'taskboard', order.firstLink);
  r.check('HUB-3（TOOLS 配列順が同カテゴリ内の表示順）',
    eq(order.toolsArray, ['taskboard', 'excel2md', 'devpad', 'norm', 'diff'])
    && eq(order.groups, [['taskboard'], ['excel2md', 'devpad', 'norm', 'diff']]),
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
      byName: f('taskboard').map(t => t.name),
      byDesc: f('vault').map(t => t.name),
      byWhen: f('週次').map(t => t.name),
      caseInsensitive: f('TASKBOARD').map(t => t.name),
      partial: f('md').map(t => t.name),
      none: f('存在しない文字列').map(t => t.name),
    };
  });
  r.check('HUB-5（検索: 空・名前・説明・用途・大文字小文字）',
    eq(search.empty, ['taskboard', 'excel2md', 'devpad', 'norm', 'diff'])
    && eq(search.byName, ['taskboard']) && eq(search.byDesc, ['taskboard'])
    && eq(search.byWhen, ['taskboard']) && eq(search.caseInsensitive, ['taskboard'])
    && search.partial.includes('excel2md') && eq(search.none, []),
    JSON.stringify(search));

  const typeSearch = async q => {
    await page.fill('#search', q);
    await page.waitForTimeout(80);
    return page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('ul.tool-list a')).map(a => a.textContent),
      categories: Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent),
      empty: document.getElementById('empty-msg').hidden ? '' : document.getElementById('empty-msg').textContent,
    }));
  };
  const s1 = await typeSearch('norm');
  const s2 = await typeSearch('存在しない文字列');
  const s3 = await typeSearch('');
  r.check('HUB-6（UI 検索: 絞り込み・該当なし・クリアで復帰）',
    eq(s1.names, ['norm']) && eq(s1.categories, ['変換'])       // 空のカテゴリ見出しは出ない
    && eq(s2.names, []) && s2.empty === '該当なし'
    && eq(s3.names, ['taskboard', 'excel2md', 'devpad', 'norm', 'diff']) && s3.categories[0] === 'タスク',
    JSON.stringify([s1, s2, s3]));

  /* ---------- リンク遷移（全ツール） ---------- */
  const expected = {
    taskboard: 'taskboard', excel2md: 'excel2md', devpad: 'devpad', norm: 'norm', diff: 'diff',
  };
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('ul.tool-list a')).map(a => ({ name: a.textContent, href: a.getAttribute('href') })));
  const navResults = [];
  for (const { name, href } of hrefs) {
    await page.goto(fileUrl('index.html'));
    await page.click('ul.tool-list a:text-is("' + name + '")');
    await page.waitForLoadState('load');
    const title = await page.title();
    navResults.push({ name, href, title, ok: title.includes(expected[name]) });
  }
  r.check('HUB-7（5本すべてリンクで遷移でき title が一致）',
    navResults.length === 5 && navResults.every(n => n.ok),
    JSON.stringify(navResults));

  /* ---------- 狭幅で横スクロールしない ---------- */
  await page.goto(fileUrl('index.html'));
  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => ({
    noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    firstLink: document.querySelector('ul.tool-list a').textContent,
  }));
  r.check('HUB-8（幅390pxで横スクロールなし・順序は不変）',
    narrow.noHScroll && narrow.firstLink === 'taskboard', JSON.stringify(narrow));

  await browser.close();
  r.report('ハブ（index.html）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
