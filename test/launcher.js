'use strict';
/* 目的: docs/specs/launcher.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/launcher.js  /  ./test/run launcher

   照合するID: LA-01〜10（全ツールへの搭載・開閉・検索・パス解決・履歴・遷移）
   仕様の正本は docs/specs/launcher.md。期待値を変えるときは spec を先に直す。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());

  /* ---------- LA-01: 17本すべてに載っていて、ハブには無い ---------- */
  await page.goto(fileUrl('index.html'));
  const tools = await page.evaluate(() => window.hub.TOOLS.map(t => ({ alias: t.alias, path: t.path })));
  const hubHasBtn = await page.evaluate(() => !!document.getElementById('launcher-btn'));

  const missing = [];
  for (const t of tools) {
    await page.goto(fileUrl(t.path));
    const ok = await page.evaluate(() => !!document.getElementById('launcher-btn'));
    if (!ok) missing.push(t.alias);
  }
  r.check('LA-01（17本すべてに ☰ ツールがあり、ハブには出ない）',
    tools.length === 17 && missing.length === 0 && hubHasBtn === false,
    JSON.stringify({ n: tools.length, missing, hubHasBtn }));

  /* ---------- LA-02/03/05: 開く・中身・検索・パス解決 ---------- */
  await page.goto(fileUrl('web/issue.html'));
  const open1 = await page.evaluate(() => {
    document.getElementById('launcher-btn').click();
    const links = Array.from(document.querySelectorAll('#launcher-list a.launcher-item'));
    return {
      open: !document.getElementById('tool-launcher').hidden,
      n: new Set(links.map(a => a.dataset.alias)).size,
      groups: Array.from(document.querySelectorAll('#launcher-list .launcher-group'))
        .map(p => p.textContent),
      current: links.filter(a => a.getAttribute('aria-current') === 'page').map(a => a.dataset.alias),
      ganttHref: (links.find(a => a.dataset.alias === 'gantt') || {}).getAttribute
        ? links.find(a => a.dataset.alias === 'gantt').getAttribute('href') : null,
      hubHref: document.querySelector('.launcher-hub').getAttribute('href'),
    };
  });
  r.check('LA-02（開くと全17本とカテゴリ見出しが出て、現在のツールが aria-current）',
    open1.open && open1.n === 17 && open1.groups.includes('タスク')
    && eq(open1.current, ['issue']),
    JSON.stringify({ n: open1.n, groups: open1.groups, current: open1.current }));
  r.check('LA-05（web/ 配下からは web/ を剥がした相対パス・ハブは ../index.html）',
    open1.ganttHref === 'gantt.html' && open1.hubHref === '../index.html',
    JSON.stringify([open1.ganttHref, open1.hubHref]));

  const search = await page.evaluate(() => {
    const q = document.getElementById('launcher-q');
    const set = v => { q.value = v; q.dispatchEvent(new Event('input', { bubbles: true })); };
    set('gan');
    const hit = {
      names: Array.from(document.querySelectorAll('#launcher-list a.launcher-item'))
        .map(a => a.dataset.alias),
      groups: document.querySelectorAll('#launcher-list .launcher-group').length,
    };
    set('存在しない文字列');
    const none = {
      n: document.querySelectorAll('#launcher-list a.launcher-item').length,
      empty: (document.querySelector('.launcher-empty') || {}).textContent,
    };
    set('');
    const back = document.querySelectorAll('#launcher-list a.launcher-item').length;
    return { hit, none, back };
  });
  r.check('LA-03（検索で絞れて見出しが消える・該当なし・クリアで復帰）',
    eq(search.hit.names, ['gantt']) && search.hit.groups === 0
    && search.none.n === 0 && search.none.empty === '該当なし'
    && search.back === 17,
    JSON.stringify(search));

  /* ---------- LA-04: Cmd/Ctrl+K と Esc ---------- */
  const keys = await page.evaluate(() => {
    const el = () => document.getElementById('tool-launcher');
    const fire = (key, mods) => document.dispatchEvent(new KeyboardEvent('keydown',
      Object.assign({ key, bubbles: true, cancelable: true }, mods || {})));
    fire('Escape');                               // まず閉じる
    const closed0 = el().hidden;
    fire('k', { metaKey: true });
    const opened = !el().hidden;
    fire('k', { metaKey: true });
    const toggled = el().hidden;
    fire('k', { ctrlKey: true });
    const openedCtrl = !el().hidden;
    fire('Escape');
    return { closed0, opened, toggled, openedCtrl, closedByEsc: el().hidden };
  });
  r.check('LA-04（Cmd/Ctrl+K で開閉・Esc で閉じる）',
    keys.closed0 && keys.opened && keys.toggled && keys.openedCtrl && keys.closedByEsc,
    JSON.stringify(keys));

  /* ---------- LA-09: IME 変換中の Enter は遷移させない ---------- */
  const ime = await page.evaluate(async () => {
    localStorage.removeItem('tools:hub');
    document.getElementById('launcher-btn').click();
    const q = document.getElementById('launcher-q');
    q.value = 'gan';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    const before = location.pathname;
    const ev = new KeyboardEvent('keydown',
      { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    q.dispatchEvent(ev);
    await new Promise(d => setTimeout(d, 150));
    return { prevented: ev.defaultPrevented, moved: location.pathname !== before };
  });
  r.check('LA-09（IME 変換中の Enter で遷移しない）',
    ime.prevented === false && ime.moved === false, JSON.stringify(ime));

  /* ---------- LA-06: クリックで「最近使った」に記録される ---------- */
  const rec = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('#launcher-list a.launcher-item'))
      .find(x => x.dataset.alias === 'gantt');
    // 遷移だけ止めて記録の副作用は通す（capture で既定動作を潰し、ランチャーの bubble 側は走らせる）
    a.addEventListener('click', e => e.preventDefault(), { once: true, capture: true });
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const env = JSON.parse(localStorage.getItem('tools:hub'));
    return { tool: env && env.tool, recent: env && env.data && env.data.recent };
  });
  r.check('LA-06（押すと tools:hub の recent 先頭に英名が入る＝ハブと同じ履歴を育てる）',
    rec.tool === 'hub' && Array.isArray(rec.recent) && rec.recent[0] === 'gantt',
    JSON.stringify(rec));

  /* ---------- LA-08: 幅390px で開いても横スクロールしない ---------- */
  await page.setViewportSize({ width: 390, height: 800 });
  const narrow = await page.evaluate(() => {
    if (document.getElementById('tool-launcher').hidden) document.getElementById('launcher-btn').click();
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('LA-08（幅390pxで開いても横スクロールなし）', narrow === true, String(narrow));

  /* ---------- LA-10: ToolStorage の無い mask.html でも開ける ---------- */
  await page.goto(fileUrl('web/mask.html'));
  const noStorage = await page.evaluate(() => {
    const hasStorage = !!window.ToolStorage;
    document.getElementById('launcher-btn').click();
    return {
      hasStorage,
      open: !document.getElementById('tool-launcher').hidden,
      n: document.querySelectorAll('#launcher-list a.launcher-item').length,
    };
  });
  r.check('LA-10（ToolStorage が無いページでも例外にならず開ける）',
    noStorage.hasStorage === false && noStorage.open && noStorage.n === 17,
    JSON.stringify(noStorage));

  /* ---------- LA-07: 実際に別ツールへ遷移できる（最後にやる） ---------- */
  await page.goto(fileUrl('web/norm.html'));
  await page.evaluate(() => {
    document.getElementById('launcher-btn').click();
    const a = Array.from(document.querySelectorAll('#launcher-list a.launcher-item'))
      .find(x => x.dataset.alias === 'diff');
    a.click();
  });
  await page.waitForURL(/diff\.html/, { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('load');
  const moved = await page.title();
  r.check('LA-07（引き出しから別のツールへ直接移動できる）',
    moved === 'Compare Text (diff)', moved);

  await browser.close();
  r.report('launcher（docs/specs/launcher.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
