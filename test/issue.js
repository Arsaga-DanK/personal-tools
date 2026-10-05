'use strict';
/* 目的: docs/specs/issue.md のテストケースを file:// 実機で照合する
   入力: 節名（省略可。例: node test/issue.js lines）
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0。不明な節名は 2）
   例:   ./test/run issue  /  ./test/run issue close

   2026-09-25 に 1,502 行の1ファイルから「入口＋節」に分けた（docs/audits/2026-09-25-structure.md §7）。
   ここは SAMPLE_MD・FSA のダミー・共通ヘルパを ctx にまとめ、test/issue/<節>.js の run(ctx) を元の順序で回す。
   節は pure（純関数）と ui（UI の連続シナリオ。入力→一覧→論点の行→閉じる→ウィザードと状態を引き継ぐので分けない）の2本。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

const SECTIONS = ['pure', 'ui', 'cards', 'look', 'dig', 'tasks'].map(n => require('./issue/' + n));
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const unknown = only.filter(n => !SECTIONS.some(s => s.name === n));
if (unknown.length) {
  console.error('不明な節名: ' + unknown.join(', ') + '\n使える節: ' + SECTIONS.map(s => s.name).join(' / '));
  process.exit(2);
}

const SAMPLE_MD = [
  '# 本番停止手順書',
  '',
  '## 1. ゴール',
  '- 運営チームが自分たちだけで本番を停止できる手順書を出す',
  '',
  '## 2. 論点',
  '- 手順書が書けないのは情報不足ではなく、完成度の合意が無いからではないか',
  '',
  '## 3. 絵コンテ',
  '- 【表】粒度ごとに実行できたかの表。右上に集まれば仮説どおり',
  '',
  '## 4. サブイシュー',
  '- どの粒度なら実行できるかを聞く',
  '- サービス一覧を調べる',
  '',
  '## 5. 次の一手',
  '- 粒度を確認する',
].join('\n');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  // FSA はヘッドレスに存在しないので**書き込み先のダミー**を仕込む（IS-U10/U11 の経路を実際に通す）。
  // ハンドルは関数を持つので structuredClone できない = IndexedDB 保存は必ず失敗する。
  // 「保存に失敗しても機能は動く」（IS-Q7）ことをこのダミーがそのまま検証している
  await page.addInitScript(() => {
    const files = {};
    window.__fsa = { files: files, picked: 0 };
    window.showDirectoryPicker = async () => {
      window.__fsa.picked++;
      return {
        name: '04_Issues', kind: 'directory',
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        values: async function* () {
          for (const n of Object.keys(files)) {
            yield {
              kind: 'file', name: n,
              getFile: async () => ({ text: async () => files[n] }),
            };
          }
        },
        getFileHandle: async (name, opts) => {
          const exists = Object.prototype.hasOwnProperty.call(files, name);
          if (!(opts && opts.create) && !exists) {
            const e = new Error('not found'); e.name = 'NotFoundError'; throw e;
          }
          return {
            name: name,
            getFile: async () => ({ text: async () => files[name] }),
            createWritable: async () => ({
              write: async t => { files[name] = t; },
              close: async () => {},
            }),
          };
        },
      };
    };
  });
  await page.goto(fileUrl('web/issue.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const ready = await page.evaluate(() =>
    !!(window.issue && window.issue.parseSections && window.issue.judge
       && window.issue.toNote && window.issue.toTasks));
  r.check('前提（window.issue フックが4関数ある）', ready, String(ready));


  const setValue = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);

  const ctx = { page, browser, r, eq, fileUrl, SAMPLE_MD, ready, setValue };
  const chosen = only.length ? SECTIONS.filter(s => only.includes(s.name)) : SECTIONS;
  for (const s of chosen) {
    const t0 = Date.now();
    console.log('--- ' + s.name + '（' + s.ids + '）');
    await s.run(ctx);
    console.log('    ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list .tool-name:text-is("Check Issue")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「タスク」から遷移でき title が命名規約どおり',
    hubTitle === 'Check Issue (issue)', hubTitle);

  await browser.close();
  r.report('issue（docs/specs/issue.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
