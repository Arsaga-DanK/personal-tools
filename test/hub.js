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

  /* ---------- 表示順（2026-08-18: カテゴリごとに分けず1枚のグリッドに流す） ---------- */
  const order = await page.evaluate(() => {
    // 描画がデータどおりかの期待値は TOOLS × CATEGORY_ORDER から**導出**する
    // （表を二重に持つと片方だけ古くなる。ツールが増えてもこの照合は意味を保つ）
    const rank = t => {
      const i = window.hub.CATEGORY_ORDER.indexOf(t.category);
      return i === -1 ? window.hub.CATEGORY_ORDER.length : i;
    };
    const expected = window.hub.TOOLS.slice()
      .sort((a, b) => rank(a) - rank(b)
        || window.hub.TOOLS.indexOf(a) - window.hub.TOOLS.indexOf(b))
      .map(t => t.name);
    return {
      // チップ（絞り込み）のラベルと件数。「すべて」が先頭
      chips: Array.from(document.querySelectorAll('#chips .chip')).map(b => ({
        cat: b.dataset.cat,
        label: b.firstChild.textContent,
        n: Number((b.querySelector('.n') || {}).textContent),
        pressed: b.getAttribute('aria-pressed'),
      })),
      expectedChips: window.hub.CATEGORY_ORDER.map(c => ({
        cat: c, n: window.hub.TOOLS.filter(t => t.category === c).length,
      })),
      grids: document.querySelectorAll('ul.tool-list').length,
      rendered: Array.from(document.querySelectorAll('ul.tool-list .tool-name')).map(e => e.textContent),
      expected,
      firstLink: document.querySelector('ul.tool-list .tool-name').textContent,
      toolsArray: window.hub.TOOLS.map(t => t.name),
    };
  });
  r.check('HUB-1（チップ: 先頭が「すべて 16」・以降は CATEGORY_ORDER 順で件数つき）',
    order.chips.length === order.expectedChips.length + 1
    && order.chips[0].cat === '' && order.chips[0].n === 16 && order.chips[0].pressed === 'true'
    && eq(order.chips.slice(1).map(c => ({ cat: c.cat, n: c.n })), order.expectedChips),
    JSON.stringify(order.chips));
  r.check('HUB-2（Plan Tasks が最初のリンク）', order.firstLink === 'Plan Tasks', order.firstLink);
  // 前半は**意図的な固定ピン**（ツール追加・改名を意識的な仕様変更にする関門）。
  // 後半は導出値との照合（描画順が TOOLS × CATEGORY_ORDER に従っているか）
  r.check('HUB-3（グリッドは1枚・並びは CATEGORY_ORDER → TOOLS 配列順）',
    eq(order.toolsArray, ['Plan Tasks', 'Convert Table', 'Convert Data', 'Normalize Text', 'Compare Text', 'Unify Terms', 'Fill Template', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Draw Mindmap', 'Sort Ideas', 'Mask Image', 'Check Vault', 'Calc Dates', 'Draw Gantt'])
    && order.grids === 1 && eq(order.rendered, order.expected),
    JSON.stringify([order.grids, order.rendered, order.expected]));

  /* ---------- 全ツールが1回だけ載る ---------- */
  const listed = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('ul.tool-list .tool-name')).map(e => e.textContent);
    // 未知のカテゴリはチップに出す（無言で落とさない）。今は0件
    const known = window.hub.CATEGORY_ORDER;
    const unknownChips = Array.from(document.querySelectorAll('#chips .chip'))
      .map(b => b.dataset.cat).filter(c => c !== '' && !known.includes(c));
    return { names, unique: new Set(names).size, total: window.hub.TOOLS.length, unknownChips };
  });
  r.check('HUB-4（登録した16本が重複なく全て載る・未知カテゴリのチップが出ない）',
    listed.names.length === 16 && listed.unique === 16 && listed.total === 16
    && listed.unknownChips.length === 0,
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
    eq(search.empty, ['Plan Tasks', 'Convert Table', 'Convert Data', 'Normalize Text', 'Compare Text', 'Unify Terms', 'Fill Template', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Draw Mindmap', 'Sort Ideas', 'Mask Image', 'Check Vault', 'Calc Dates', 'Draw Gantt'])
    && eq(search.byName, ['Plan Tasks']) && eq(search.byDesc, ['Plan Tasks', 'Check Vault'])   // 'vault' は両ツールの desc にある
    && eq(search.byWhen, ['Plan Tasks']) && eq(search.caseInsensitive, ['Convert Data'])
    && eq(search.none, []),
    JSON.stringify(search));
  // 部分一致・英名検索は**全16本**を照合する（1本ずつ導出したクエリで自分自身に当たること）
  r.check('HUB-5b（表示名の部分一致が全ツールで効く）',
    search.partialName.length === 16 && search.partialName.every(p => p.q.length >= 3 && p.ok),
    JSON.stringify(search.partialName.filter(p => !p.ok)));
  r.check('HUB-9（英名で辿れる（完全一致・大文字小文字無視・部分一致）・英名は画面に出さない）',
    search.aliasProbe.length === 16
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

  /* ---------- チップ全体がクリック可能（HUB-14。2026-08-18 に「名前だけ」化して余白まで当たり判定） ---------- */
  const chipFills = await page.evaluate(() => {
    // リンクが li いっぱいに広がっていること（＝チップの余白を押しても開く）
    const li = document.querySelector('ul.tool-list li');
    const a = li.querySelector('a');
    const lr = li.getBoundingClientRect(), ar = a.getBoundingClientRect();
    return {
      fills: Math.abs(lr.width - ar.width) < 1 && Math.abs(lr.height - ar.height) < 1,
      padded: ar.height >= 24,   // 指・カーソルで押せる高さがある
    };
  });
  await page.click('ul.tool-list li');   // li を押す（実体はチップの余白部分）
  await page.waitForLoadState('load');
  const cardNav = await page.title();
  await page.goto(fileUrl('index.html'));
  r.check('HUB-14（チップの余白を押しても開く: リンクが li いっぱいに広がっている）',
    chipFills.fills === true && chipFills.padded === true && cardNav === 'Plan Tasks (taskboard)',
    JSON.stringify([chipFills, cardNav]));

  const typeSearch = async q => {
    await page.fill('#search', q);
    await page.waitForTimeout(80);
    return page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('ul.tool-list .tool-name')).map(e => e.textContent),
      empty: document.getElementById('empty-msg').hidden ? '' : document.getElementById('empty-msg').textContent,
    }));
  };
  const s1 = await typeSearch('Normalize');
  const s2 = await typeSearch('存在しない文字列');
  const s3 = await typeSearch('');
  r.check('HUB-6（UI 検索: 絞り込み・該当なし・クリアで復帰）',
    eq(s1.names, ['Normalize Text'])
    && eq(s2.names, []) && s2.empty === '該当なし'
    && eq(s3.names, ['Plan Tasks', 'Convert Table', 'Convert Data', 'Normalize Text', 'Compare Text', 'Unify Terms', 'Fill Template', 'Document Schema', 'Export Outline', 'Draw Diagram', 'Draw Mindmap', 'Sort Ideas', 'Mask Image', 'Check Vault', 'Calc Dates', 'Draw Gantt']),
    JSON.stringify([s1, s2, s3]));

  /* ---------- HUB-21: チップの絞り込み（検索と合成・もう一度押すと解除） ---------- */
  const chipFilter = await page.evaluate(async () => {
    const chip = cat => Array.from(document.querySelectorAll('#chips .chip'))
      .find(b => b.dataset.cat === cat);
    const names = () => Array.from(document.querySelectorAll('ul.tool-list .tool-name')).map(e => e.textContent);
    const s = document.getElementById('search');
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    chip('発想').click();
    const only = { names: names(), pressed: chip('発想').getAttribute('aria-pressed'), all: chip('').getAttribute('aria-pressed') };
    // 検索と合成する（チップで絞ったうえに文字で絞る）
    s.value = 'Mindmap';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    const combined = names();
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    // 押されているチップをもう一度押すと解除
    chip('発想').click();
    const released = { names: names(), pressed: chip('発想').getAttribute('aria-pressed') };
    return { only, combined, released };
  });
  r.check('HUB-21（チップで絞る・検索と合成・再押下で解除・aria-pressed が追随）',
    eq(chipFilter.only.names, ['Draw Mindmap', 'Sort Ideas'])
    && chipFilter.only.pressed === 'true' && chipFilter.only.all === 'false'
    && eq(chipFilter.combined, ['Draw Mindmap'])
    && chipFilter.released.names.length === 16 && chipFilter.released.pressed === 'false',
    JSON.stringify(chipFilter));

  /* ---------- リンク遷移（全ツール） ---------- */
  // 期待値は TOOLS から導出する（表を二重に持つと片方だけ古くなる）
  const entries = await page.evaluate(() => window.hub.TOOLS.map(t => ({
    name: t.name, alias: t.alias, href: t.path,
    basename: t.path.replace(/^.*\//, '').replace(/\.html$/, ''),
  })));
  const navResults = [];
  for (const { name, alias, href, basename } of entries) {
    await page.goto(fileUrl('index.html'));
    await page.click('ul.tool-list .tool-name:text-is("' + name + '")');
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
  r.check('HUB-7（16本すべてリンクで遷移でき title が一致）',
    navResults.length === 16 && navResults.every(n => n.ok),
    JSON.stringify(navResults));
  r.check('HUB-10（h1 = 表示名・title = 「表示名 (英名)」・英名 = ファイル名）',
    navResults.length === 16 && navResults.every(n => n.naming),
    JSON.stringify(navResults.map(n => [n.name, n.h1, n.title, n.href])));

  /* ---------- 狭幅で横スクロールしない ---------- */
  await page.goto(fileUrl('index.html'));
  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => ({
    noHScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    firstLink: document.querySelector('ul.tool-list .tool-name').textContent,
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

  /* ---------- HUB-17: カードは「アイコン＋名前＋一言」。長い説明は title に ---------- */
  // 直前の HUB-8 が 390px のままなので広い画面に戻す（横並びを見るテストなので必須）
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fileUrl('index.html'));
  const titles = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('ul.tool-list a'));
    const byName = new Map(window.hub.TOOLS.map(t => [t.name, t]));
    const toolOf = a => byName.get((a.querySelector('.tool-name') || {}).textContent);
    return {
      // 全リンクに長い説明が title として付いているか（導出 — 固定文字列で書かない）
      missingTitle: links.filter(a => {
        const t = toolOf(a);
        return !t || !(a.title || '').includes(t.desc);
      }).map(a => a.textContent),
      // カードにアイコンと一言が出ているか（全16本を導出で照合）
      missingCard: window.hub.TOOLS.filter(t => {
        const a = links.find(x => (x.querySelector('.tool-name') || {}).textContent === t.name);
        if (!a) return true;
        const icon = a.querySelector('.icon'), short = a.querySelector('.short');
        return !icon || icon.textContent === '' || !short || short.textContent !== t.short;
      }).map(t => t.name),
      // アイコンは重複させない（目印にならない）
      dupIcons: (() => {
        const seen = new Map();
        for (const t of window.hub.TOOLS) seen.set(t.icon, (seen.get(t.icon) || 0) + 1);
        return Array.from(seen).filter(([, n]) => n > 1).map(([i]) => i);
      })(),
      // 画面のテキストには説明・用途を出さない（1画面に収める目的）。
      // **body 全体ではなく main を見る** — body.textContent はインラインスクリプトの
      // ソース（TOOLS の定義）まで含むので、必ず「説明が画面にある」と判定されてしまう
      descOnScreen: window.hub.TOOLS.filter(t => document.querySelector('main').textContent.includes(t.desc)).map(t => t.name),
      whenOnScreen: window.hub.TOOLS.filter(t => t.when && document.querySelector('main').textContent.includes(t.when)).map(t => t.name),
      // 縦に積まない（カテゴリごとに横並び）ことを、同じ行に2つ以上並ぶことで見る
      sameRow: (() => {
        const ul = Array.from(document.querySelectorAll('ul.tool-list'))
          .find(u => u.querySelectorAll('a').length >= 3);
        if (!ul) return false;
        const tops = Array.from(ul.querySelectorAll('a')).map(a => Math.round(a.getBoundingClientRect().top));
        return new Set(tops).size < tops.length;
      })(),
    };
  });
  r.check('HUB-17（カード＝アイコン＋名前＋一言・長い説明と用途は title だけ・カテゴリ内は横並び）',
    titles.missingTitle.length === 0 && titles.missingCard.length === 0
    && titles.dupIcons.length === 0
    && titles.descOnScreen.length === 0 && titles.whenOnScreen.length === 0
    && titles.sameRow === true,
    JSON.stringify(titles));

  /* ---------- HUB-18: 1画面に収まる（16本 + 見出し + 検索欄） ---------- */
  await page.setViewportSize({ width: 1280, height: 900 });
  const fits = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
    links: document.querySelectorAll('ul.tool-list a').length,
  }));
  r.check('HUB-18（1280x900 で縦スクロールなしに16本すべて見える）',
    fits.links === 16 && fits.scrollH <= fits.clientH,
    JSON.stringify(fits));

  /* ---------- HUB-19: 最近使った（クリックで記録・先頭・重複なし・上限5） ----------
     直前の HUB-7 が全16本をクリックで巡回して履歴を作っているので、
     「履歴なしの表示」を見るには**消してから読み込み直す**（消すだけでは再描画されない） */
  await page.evaluate(() => localStorage.removeItem('tools:hub'));
  await page.reload();
  const recentEmpty = await page.evaluate(() => document.getElementById('recent').hidden);
  const recent = await page.evaluate(async () => {
    const out = {};
    const hub = window.hub;
    if (!hub.recordUse) return { missing: true };
    out.emptyHidden = true;
    ['gantt', 'mask', 'gantt', 'board', 'dates', 'fill', 'norm'].forEach(a => hub.recordUse(a));
    hub.recordUse('存在しない英名');                                // 未知は無視する
    const stored = JSON.parse(localStorage.getItem('tools:hub'));
    out.envelope = { tool: stored.tool, v: stored.v };
    out.list = stored.data.recent;
    // 最近使ったカードは「アイコン＋名前」なので、アイコンぶんを除いて名前を取る
    out.shown = Array.from(document.querySelectorAll('#recent .recent-list a'))
      .map(a => a.textContent.replace((a.querySelector('.icon') || {}).textContent || '', ''));
    out.recentHidden = document.getElementById('recent').hidden;
    // ハブの一覧（tool-list）の本数は最近使った行の影響を受けない
    out.listLinks = document.querySelectorAll('ul.tool-list a').length;
    return out;
  });
  r.check('HUB-19（最近使った: 新しい順・重複なし・上限5・未知の英名は無視・履歴なしでは出さない）',
    !recent.missing && recentEmpty === true && recent.recentHidden === false
    && eq(recent.list, ['norm', 'fill', 'dates', 'board', 'gantt'])
    && eq(recent.shown, ['Normalize Text', 'Fill Template', 'Calc Dates', 'Sort Ideas', 'Draw Gantt'])
    && recent.envelope.tool === 'hub' && recent.envelope.v === 1
    && recent.listLinks === 16,
    JSON.stringify(recent));

  /* ---------- HUB-20: 検索の自動フォーカスと Enter で先頭を開く（IME ガード） ---------- */
  await page.goto(fileUrl('index.html'));
  const enterNav = await page.evaluate(() => {
    const s = document.getElementById('search');
    const autofocused = document.activeElement === s;
    s.value = 'ガント';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    const first = document.querySelector('ul.tool-list a');
    const nameOf = a => (a.querySelector('.tool-name') || {}).textContent;
    let navigated = null;
    const stub = e => { e.preventDefault(); navigated = nameOf(e.currentTarget); };
    first.addEventListener('click', stub);
    // 変換確定の Enter では開かない
    const ime = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    s.dispatchEvent(ime);
    const afterIme = navigated;
    const plain = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    s.dispatchEvent(plain);
    return { autofocused, filtered: nameOf(first), afterIme, navigated };
  });
  r.check('HUB-20（起動時に検索へフォーカス・Enter で先頭を開く・IME 中の Enter は開かない）',
    enterNav.autofocused === true && enterNav.filtered === 'Draw Gantt'
    && enterNav.afterIme === null && enterNav.navigated === 'Draw Gantt',
    JSON.stringify(enterNav));

  /* ---------- HUB-22: データから探す（判定は純関数・候補は受け取れるツールだけ） ---------- */
  await page.goto(fileUrl('index.html'));
  const route = await page.evaluate(() => {
    const f = window.hub.routeText;
    const aliases = t => f(t).map(x => x.alias);
    return {
      json: aliases('{"a":1,"b":[2,3]}'),
      ddl: aliases('CREATE TABLE t (id int);\nCOMMENT ON TABLE t IS \'x\';'),
      plan: aliases('内容\t開始日\t期限\t日数\t状態\tセクション\nA\t2026-08-18\t2026-08-22\t5\t未着手\t設計'),
      tasks: aliases('- [ ] 基本設計 \u{1F6EB} 2026-08-18 \u{1F4C5} 2026-08-22'),
      mdHead: aliases('# 機能一覧\n## 商品管理\n- 検索できる'),
      bullets: aliases('- 枝A\n- 枝B\n  - 葉'),
      tsv: aliases('見出し1\t見出し2\nA\tB\nC\tD'),
      mdTable: aliases('| a | b |\n|---|---|\n| 1 | 2 |'),
      mermaid: aliases('graph TD; A-->B;'),
      empty: aliases('   '),
      prose: aliases('ただの文章です。行き先は決められません。'),
      // 候補は必ず「受け取れる実装がある」ツールだけ（出して受け取れないのは嘘）
      allReceivable: ['{"a":1}', '# 見出し\n- x', 'a\tb\nc\td', 'CREATE TABLE t (id int);']
        .flatMap(t => f(t)).every(h => window.hub.RECEIVERS.includes(h.alias)),
      // 「なぜそこに行けるか」が必ず付く
      hasWhy: f('# 見出し\n- x').every(h => typeof h.why === 'string' && h.why.length > 0),
    };
  });
  r.check('HUB-22（routeText: JSON/DDL/計画表/tasks.md/md見出し/箇条書き/TSV/md表/mermaid を判定・不明は空・候補は受け取れるツールだけ）',
    eq(route.json, ['devpad']) && eq(route.ddl, ['ddl2spec'])
    && eq(route.plan, ['gantt', 'excel2md'])   // 計画表はタブ区切りでもあるので表としても行ける
    && eq(route.tasks, ['gantt'])
    && eq(route.mdHead, ['doc2xl', 'mindmap'])   // どちらもあり得るので両方出す
    && eq(route.bullets, ['mindmap'])
    && eq(route.tsv, ['excel2md']) && eq(route.mdTable, ['excel2md'])
    && eq(route.mermaid, ['diagram'])
    && eq(route.empty, []) && eq(route.prose, [])
    && route.allReceivable === true && route.hasWhy === true,
    JSON.stringify(route));

  /* ---------- HUB-23: 貼って押すとデータを持って遷移する ---------- */
  const routeUi = await page.evaluate(() => {
    const toggle = document.getElementById('router-toggle');
    const before = { hidden: document.getElementById('router').hidden, expanded: toggle.getAttribute('aria-expanded') };
    toggle.click();
    const after = { hidden: document.getElementById('router').hidden, expanded: toggle.getAttribute('aria-expanded') };
    const ta = document.getElementById('router-in');
    ta.value = 'CREATE TABLE t (id int);';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const names = Array.from(document.querySelectorAll('#router-out .tool-name')).map(e => e.textContent);
    const whys = Array.from(document.querySelectorAll('#router-out .short')).map(e => e.textContent);
    // 押しても遷移させない（handoff の書き込みだけ見る）
    sessionStorage.removeItem('tools:handoff');
    const a = document.querySelector('#router-out a');
    a.addEventListener('click', e => e.preventDefault(), { once: true });
    a.click();
    const raw = sessionStorage.getItem('tools:handoff');
    const d = raw ? JSON.parse(raw) : null;
    sessionStorage.removeItem('tools:handoff');
    return { before, after, names, whys, to: d && d.to, text: d && d.text, recent: JSON.parse(localStorage.getItem('tools:hub') || '{}') };
  });
  r.check('HUB-23（データから探す: 開閉・候補カードに理由・押すと handoff にデータが入り最近使ったにも記録）',
    routeUi.before.hidden === true && routeUi.before.expanded === 'false'
    && routeUi.after.hidden === false && routeUi.after.expanded === 'true'
    && eq(routeUi.names, ['Document Schema'])
    && routeUi.whys.length === 1 && routeUi.whys[0].includes('定義書')
    && routeUi.to === 'ddl2spec' && routeUi.text === 'CREATE TABLE t (id int);',
    JSON.stringify(routeUi));

  /* ---------- HUB-24: 貼る → 候補を押す → 受け側にデータが入る（実機通し・6ツール） ----------
     「候補に出るのに受け取れない」は嘘になるので、**受け側の実装まで通して**確かめる。
     使い捨ての手動確認にせずここへ残す（CLAUDE.md 検証の作法） */
  const HANDOFF_CASES = [
    ['{"a":1,"b":[2,3]}', 'Convert Data', 'devpad', 'json-in'],
    ['CREATE TABLE t (id int);', 'Document Schema', 'ddl2spec', 'input'],
    ['# 見出し\n- 項目', 'Export Outline', 'doc2xl', 'input'],
    ['- 枝A\n- 枝B\n  - 葉', 'Draw Mindmap', 'mindmap', 'input'],
    ['graph TD; A-->B;', 'Draw Diagram', 'diagram', 'input'],
    ['a\tb\nc\td', 'Convert Table', 'excel2md', 'input'],
  ];
  const handoffResults = [];
  for (const [text, name, alias, inputId] of HANDOFF_CASES) {
    await page.goto(fileUrl('index.html'));
    await page.evaluate(() => { sessionStorage.clear(); });
    await page.click('#router-toggle');
    await page.evaluate(t => {
      const ta = document.getElementById('router-in');
      ta.value = t;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    const clicked = await page.evaluate(n => {
      const a = Array.from(document.querySelectorAll('#router-out a'))
        .find(x => (x.querySelector('.tool-name') || {}).textContent === n);
      if (!a) return false;
      a.click();
      return true;
    }, name);
    if (!clicked) { handoffResults.push({ alias, ok: false, why: '候補に出ない' }); continue; }
    await page.waitForLoadState('load');
    await page.waitForTimeout(600);
    const got = await page.evaluate(id => {
      const e = document.getElementById(id);
      return { value: e ? e.value : null, leftover: sessionStorage.getItem('tools:handoff') };
    }, inputId);
    handoffResults.push({
      alias,
      // 受け側の入力欄に渡した文字列が入り、handoff は消えている（戻っても再挿入されない）
      ok: got.value === text && got.leftover === null,
      got: got.value === text ? '' : got,
    });
  }
  r.check('HUB-24（貼る→候補を押す→6ツールすべてで受け側の入力に入り handoff は消える）',
    handoffResults.length === 6 && handoffResults.every(x => x.ok),
    JSON.stringify(handoffResults.filter(x => !x.ok)));

  await browser.close();
  r.report('ハブ（index.html）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
