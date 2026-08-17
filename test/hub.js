'use strict';
/* 目的: index.html（ハブ）の表示順・検索・カテゴリ表示・リンク遷移を照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/hub.js  /  ./test/run hub

   ハブには spec ファイルが無いため、契約はこのハーネスと index.html の
   TOOLS / CATEGORY_ORDER のコメントが持つ。
   表示名（動詞＋名詞の2語）と英名（ファイル名・spec・localStorage キー）の使い分けは
   CLAUDE.md「命名規約」が正本。HUB-9/HUB-10 がその規約を照合する。

   期待値の書き方（2026-08-17 に整理）:
   - **固定値でピンするもの**: 「今この15本がこの順で載っている」（HUB-3 前半・HUB-4）。
     ツール追加を**意識的な仕様変更**にするための関門で、壊れることが仕事
     （coding-rules「新ツール追加の定型リップル」がこの更新を手順に含めている）
   - **導出するもの**: 描画がデータどおりか（HUB-3 後半）・検索が効くか（HUB-5/9）。
     固定文字列で書くと**改名のたびにクエリが当たらなくなり、空集合のまま緑になって
     検証意図だけが消える**（verification-notes「テストが緑でも意味を失う3つの型」。
     `f('md')` → `f('ables')` と2度踏んでいる） */

const fs = require('fs');
const path = require('path');
const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('index.html'));

  /* ---------- 表示順 ---------- */
  const order = await page.evaluate(() => {
    // 描画がデータどおりかの期待値は TOOLS × CATEGORY_ORDER から**導出**する
    // （表を二重に持つと片方だけ古くなる。ツールが増えてもこの照合は意味を保つ）
    const byCat = new Map();
    for (const t of window.hub.TOOLS) {
      if (!byCat.has(t.category)) byCat.set(t.category, []);
      byCat.get(t.category).push(t.name);
    }
    return {
      // 描画されたカテゴリ見出しと、その下のツール名を出現順に取る
      categories: Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent),
      groups: Array.from(document.querySelectorAll('ul.tool-list'))
        .map(ul => Array.from(ul.querySelectorAll('a')).map(a => a.textContent)),
      // 空のカテゴリは見出しごと出ない仕様なので filter で落とす
      expectedGroups: window.hub.CATEGORY_ORDER.filter(c => byCat.has(c)).map(c => byCat.get(c)),
      expectedCategories: window.hub.CATEGORY_ORDER.filter(c => byCat.has(c)),
      firstLink: document.querySelector('ul.tool-list a').textContent,
      toolsArray: window.hub.TOOLS.map(t => t.name),
    };
  });
  r.check('HUB-1（カテゴリ順: タスクが先頭）', order.categories[0] === 'タスク'
    && eq(order.categories, ['タスク', '変換・比較', '設計', '発想', '画像', '整理', 'PM']), JSON.stringify(order.categories));
  r.check('HUB-2（Plan Tasks が最初のリンク）', order.firstLink === 'Plan Tasks', order.firstLink);
  // 前半は**意図的な固定ピン**（ツール追加・改名を意識的な仕様変更にする関門）。
  // 後半は導出値との照合（描画ロジックが TOOLS × CATEGORY_ORDER に従っているか）
  r.check('HUB-3（TOOLS 配列順が同カテゴリ内の表示順）',
    eq(order.toolsArray, ['Plan Tasks', 'Convert Table', 'Convert Data', 'Normalize Text', 'Compare Text', 'Unify Terms', 'Fill Template', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Draw Mindmap', 'Mask Image', 'Check Vault', 'Calc Dates', 'Draw Gantt'])
    && eq(order.groups, order.expectedGroups) && eq(order.categories, order.expectedCategories),
    JSON.stringify([order.toolsArray, order.groups, order.expectedGroups]));

  /* ---------- 全ツールが1回だけ載る ---------- */
  const listed = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('ul.tool-list a')).map(a => a.textContent);
    return { names, unique: new Set(names).size, total: window.hub.TOOLS.length, other: !!Array.from(document.querySelectorAll('.category-title')).find(e => e.textContent === 'その他') };
  });
  r.check('HUB-4（登録した15本が重複なく全て載る・「その他」が出ない）',
    listed.names.length === 15 && listed.unique === 15 && listed.total === 15 && !listed.other,
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
      none: f('存在しない文字列').map(t => t.name),
      /* 部分一致は**全ツール分をクエリごと導出**する。固定文字列（かつて 'md'・'ables'）だと
         改名した瞬間に何にも当たらなくなり、空集合のまま緑になって検証意図だけが消える。
         表示名は前後1文字を落とした中間文字列、英名は末尾2文字を落とした前方部分で引く */
      partialName: window.hub.TOOLS.map(t => {
        const q = t.name.slice(1, -1);
        return { name: t.name, q, ok: f(q).some(x => x.name === t.name) };
      }),
      /* 英名（alias）の3経路: 完全一致・大文字小文字無視・部分一致。
         alias は「一度決めたら変更しない」（CLAUDE.md 命名規約）ので、
         ここを起点にすると改名でクエリが陳腐化しない */
      aliasProbe: window.hub.TOOLS.map(t => {
        const q = t.alias.slice(0, Math.max(3, t.alias.length - 2));
        return {
          alias: t.alias,
          exact: f(t.alias).some(x => x.alias === t.alias),
          upper: f(t.alias.toUpperCase()).some(x => x.alias === t.alias),
          partial: f(q).some(x => x.alias === t.alias),
        };
      }),
      // 英名は画面に出さない（検索にだけ効かせる）。**全 alias** を対象に照合する
      aliasLeaked: window.hub.TOOLS
        .filter(t => Array.from(document.querySelectorAll('ul.tool-list'))
          .some(ul => ul.textContent.includes(t.alias)))
        .map(t => t.alias),
    };
  });
  r.check('HUB-5（検索: 空・表示名・説明・用途・大文字小文字・部分一致）',
    eq(search.empty, ['Plan Tasks', 'Convert Table', 'Convert Data', 'Normalize Text', 'Compare Text', 'Unify Terms', 'Fill Template', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Draw Mindmap', 'Mask Image', 'Check Vault', 'Calc Dates', 'Draw Gantt'])
    && eq(search.byName, ['Plan Tasks']) && eq(search.byDesc, ['Plan Tasks', 'Check Vault'])   // 'vault' は両ツールの desc にある
    && eq(search.byWhen, ['Plan Tasks']) && eq(search.caseInsensitive, ['Convert Data'])
    && eq(search.none, []),
    JSON.stringify(search));
  // 部分一致・英名検索は**全15本**を照合する（1本ずつ導出したクエリで自分自身に当たること）
  r.check('HUB-5b（表示名の部分一致が全ツールで効く）',
    search.partialName.length === 15 && search.partialName.every(p => p.q.length >= 3 && p.ok),
    JSON.stringify(search.partialName.filter(p => !p.ok)));
  r.check('HUB-9（英名で辿れる（完全一致・大文字小文字無視・部分一致）・英名は画面に出さない）',
    search.aliasProbe.length === 15
    && search.aliasProbe.every(p => p.exact && p.upper && p.partial)
    && search.aliasLeaked.length === 0,
    JSON.stringify([search.aliasProbe.filter(p => !(p.exact && p.upper && p.partial)), search.aliasLeaked]));

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
    eq(tabSearch.regex, ['Convert Data']) && eq(tabSearch.xml, ['Convert Data'])
    && eq(tabSearch.sql, ['Convert Data', 'Document Schema']) && eq(tabSearch.radix, ['Convert Data']),
    JSON.stringify(tabSearch));

  /* ---------- 検索: カテゴリ名でも絞れる（HUB-12） ---------- */
  const catSearch = await page.evaluate(() => ({
    seiri: window.hub.filter('整理').map(t => t.name),
    // 「設計」はカテゴリ（Schema・Outline）に加え、Tables・Diff・Mask の用途文（設計書）にも含まれる。
    // カテゴリ検索が無いと Schema（desc/when に「設計」の語が無い）だけが漏れる
    sekkei: window.hub.filter('設計').map(t => t.name),
  }));
  r.check('HUB-12（カテゴリ名で絞れる）',
    eq(catSearch.seiri, ['Check Vault']) && eq(catSearch.sekkei, ['Convert Table', 'Compare Text', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Mask Image']),
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
    cardNav === 'Plan Tasks (taskboard)' && cardSelectGuard === false,
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
  const s1 = await typeSearch('Normalize');
  const s2 = await typeSearch('存在しない文字列');
  const s3 = await typeSearch('');
  r.check('HUB-6（UI 検索: 絞り込み・該当なし・クリアで復帰）',
    eq(s1.names, ['Normalize Text']) && eq(s1.categories, ['変換・比較'])       // 空のカテゴリ見出しは出ない
    && eq(s2.names, []) && s2.empty === '該当なし'
    && eq(s3.names, ['Plan Tasks', 'Convert Table', 'Convert Data', 'Normalize Text', 'Compare Text', 'Unify Terms', 'Fill Template', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Draw Mindmap', 'Mask Image', 'Check Vault', 'Calc Dates', 'Draw Gantt']) && s3.categories[0] === 'タスク',
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
  r.check('HUB-7（15本すべてリンクで遷移でき title が一致）',
    navResults.length === 15 && navResults.every(n => n.ok),
    JSON.stringify(navResults));
  r.check('HUB-10（h1 = 表示名・title = 「表示名 (英名)」・英名 = ファイル名）',
    navResults.length === 15 && navResults.every(n => n.naming),
    JSON.stringify(navResults.map(n => [n.name, n.h1, n.title, n.href])));

  /* ---------- 狭幅で横スクロールしない ---------- */
  await page.goto(fileUrl('index.html'));
  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => ({
    noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    firstLink: document.querySelector('ul.tool-list a').textContent,
  }));
  r.check('HUB-8（幅390pxで横スクロールなし・順序は不変）',
    narrow.noHScroll && narrow.firstLink === 'Plan Tasks', JSON.stringify(narrow));

  /* ---------- README がハブと食い違っていない（HUB-15） ----------
     README は公開リポジトリの入口で、ツールを増減・改名するたびに手で直す必要がある。
     人間の記憶に頼ると必ずズレるので、TOOLS を正本として機械的に照合する。
     照合するのは「本数」「表の行（表示名・英名・カテゴリ）」の3点だけで、
     説明文は README 側の言い回しを縛らない（README は読み物であって仕様書ではない）。 */
  const readme = fs.readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8');
  const declared = /ブラウザツール集（(\d+)本）/.exec(readme);
  // 表の行: `| **表示名**（英名） | できること | カテゴリ |`
  const rows = Array.from(readme.matchAll(/^\|\s*\*\*(.+?)\*\*（(.+?)）\s*\|[^|]*\|\s*(\S+?)\s*\|\s*$/gm))
    .map(m => ({ name: m[1], alias: m[2], category: m[3] }));
  const rowByAlias = new Map(rows.map(x => [x.alias, x]));
  const mismatched = entries
    .map(t => {
      const row = rowByAlias.get(t.alias);
      if (!row) return { alias: t.alias, reason: 'README の表に行が無い' };
      if (row.name !== t.name) return { alias: t.alias, reason: '表示名が違う: README=' + row.name + ' / TOOLS=' + t.name };
      return null;
    })
    .filter(Boolean);
  const extra = rows.filter(x => !entries.some(t => t.alias === x.alias)).map(x => x.alias);
  r.check('HUB-15（README の本数と表が TOOLS と一致する）',
    !!declared && Number(declared[1]) === entries.length
    && rows.length === entries.length && mismatched.length === 0 && extra.length === 0,
    JSON.stringify({
      readmeCount: declared && declared[1], toolsCount: entries.length,
      rows: rows.length, mismatched, extra,
    }));

  /* ---------- README 本文に旧ツール名が残っていない（HUB-16） ----------
     HUB-15 はツール一覧の表しか見ないため、「動作環境」「Obsidian 連携」の節に
     旧名が残っても素通りした（2026-08-17 の改名で実際に取りこぼした）。
     そこで **英字だけの太字はツール表示名を指す** という約束をこのテストで強制する。
     日本語混じりの太字（`**無保証**` など）は対象外なので、通常の強調と衝突しない。
     ツール名でない英字の固有名詞を太字にしたくなったら ALLOW_BOLD に足す
     — 手間をかけさせることで「それは本当にツール名ではないか」を1度考えさせる。 */
  const ALLOW_BOLD = new Set([]);
  const boldTokens = Array.from(new Set(
    Array.from(readme.matchAll(/\*\*([A-Za-z][A-Za-z ]*?)\*\*/g)).map(m => m[1].trim())));
  const unknownBold = boldTokens.filter(x => !ALLOW_BOLD.has(x) && !entries.some(t => t.name === x));
  r.check('HUB-16（README の英字太字はすべて現行のツール表示名 — 旧名の残りを検出）',
    unknownBold.length === 0,
    JSON.stringify({ unknownBold, checked: boldTokens.length }));

  await browser.close();
  r.report('ハブ（index.html）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
