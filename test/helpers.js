'use strict';
/* 検証ハーネス共通部品。
   目的: playwright-core と Chromium 実体の場所を実行時に解決し、合否を集計する
   入力: なし（環境を走査する）
   出力: launch() / createRunner() / fileUrl()
   例:   const { launch, createRunner } = require('./helpers');

   パスを固定しない理由: npx のインストール先ハッシュと ms-playwright のビルド番号は
   更新で変わる。ハードコードすると次の更新でハーネスが壊れる（docs/verification-notes.md §1）。 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

// npx のキャッシュから playwright-core を探す（npm global には入っていない）
function findPlaywrightCore() {
  const root = path.join(os.homedir(), '.npm/_npx');
  if (fs.existsSync(root)) {
    for (const dir of fs.readdirSync(root)) {
      const p = path.join(root, dir, 'node_modules/playwright-core');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error(
    'playwright-core が見つかりません。\n' +
    '  確認: find ~/.npm/_npx -type d -name playwright-core\n' +
    '  無い場合は Playwright MCP を一度使うとキャッシュに入ります'
  );
}

// ms-playwright に実在する chrome-headless-shell を探す。
// playwright-core が期待するビルド番号と実体はずれることがあり、
// executablePath を渡さないと「Executable doesn't exist at …」で起動できない。
function findHeadlessShell() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (!fs.existsSync(cache)) return null;
  const builds = fs.readdirSync(cache)
    .filter(d => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])); // 新しいビルド優先
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  for (const build of builds) {
    for (const arch of ['mac-arm64', 'mac-x64', 'linux64', 'win64']) {
      const p = path.join(cache, build, 'chrome-headless-shell-' + arch, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

// MCP のブラウザとは別インスタンス（user-data-dir が別）なので、
// 並列セッションが MCP のブラウザを掴んでいてもロックで衝突しない
async function launch(opts) {
  const { chromium } = require(findPlaywrightCore());
  const executablePath = findHeadlessShell();
  return chromium.launch(Object.assign({}, executablePath ? { executablePath } : null, opts));
}

// file:// が全ての前提（CLAUDE.md）なので、検証も file:// で開く
function fileUrl(relative) {
  return 'file://' + path.join(REPO, relative);
}

function createRunner() {
  const results = [];
  const consoleErrors = [];

  return {
    consoleErrors,

    // ページのコンソールエラーと未捕捉例外を累積する（合格条件は累計0件）
    watch(page) {
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
      return page;
    },

    check(id, ok, detail) {
      results.push({ id, ok: !!ok, detail: ok ? '' : String(detail) });
    },

    // 合否を出力し、終了コードを決める（失敗 or コンソールエラーがあれば 1）
    report(label) {
      const fail = results.filter(r => !r.ok);
      console.log('\n===== ' + label + ' =====');
      for (const r of results) {
        console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.id + (r.ok ? '' : '  → ' + r.detail));
      }
      console.log('\n' + (results.length - fail.length) + ' pass / ' + fail.length + ' fail');
      console.log('コンソールエラー: ' + (consoleErrors.length === 0 ? '0件' : JSON.stringify(consoleErrors)));
      process.exitCode = (fail.length === 0 && consoleErrors.length === 0) ? 0 : 1;
    },
  };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* バナーの検査（2026-08-07 に共通化）。
   **クラス名ではなく算出スタイルと role を見る。**
   `.banner-success` はクラスが付いていて CSS 規則だけが無く、成功バナーが中立の灰色で
   出ていた期間があった（落ちも警告も出ないので気づけない）。クラス名だけを照合すると
   その状態が緑になるので、「素の .banner と算出背景色が違う」ことまで確かめる。 */

// kind → 期待する role（lib/ui.css のバナー節・CM-5 の規約）
const BANNER_ROLE = { info: 'status', success: 'status', warn: 'alert', error: 'alert' };

// バナーの実効状態を取る。base は素の .banner の算出背景色（比較の基準）
async function bannerState(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const probe = document.createElement('div');
    probe.className = 'banner';
    probe.hidden = false;
    document.body.appendChild(probe);
    const base = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const cs = getComputedStyle(el);
    return {
      cls: el.className, role: el.getAttribute('role'), text: el.textContent,
      hidden: el.hidden, bg: cs.backgroundColor, base,
      styled: cs.backgroundColor !== base,   // その種別の CSS 規則が実際に効いているか
    };
  }, selector);
}

/* 期待どおりのバナーかを1回で確かめる。戻り値は r.check にそのまま渡せる形。
   expectText を渡すと文言の部分一致も見る。
   使い方: const b = await bannerIs(page, '#banner', 'success', 'コピーしました');
           r.check('DS-20（…）', b.ok, b.detail); */
async function bannerIs(page, selector, kind, expectText) {
  const st = await bannerState(page, selector);
  const ng = [];
  if (!st) {
    ng.push('要素が無い: ' + selector);
  } else {
    if (!st.cls.includes('banner-' + kind)) ng.push('クラスが banner-' + kind + ' でない');
    if (st.role !== BANNER_ROLE[kind]) ng.push('role が ' + BANNER_ROLE[kind] + ' でない');
    if (!st.styled) ng.push('算出背景色が素の .banner と同じ（その種別の CSS 規則が効いていない）');
    if (st.hidden) ng.push('hidden のまま');
    if (expectText !== undefined && !st.text.includes(expectText)) ng.push('文言に「' + expectText + '」を含まない');
  }
  return { ok: ng.length === 0, detail: JSON.stringify({ ng, state: st }) };
}

module.exports = { launch, fileUrl, createRunner, eq, REPO, bannerState, bannerIs, BANNER_ROLE };
