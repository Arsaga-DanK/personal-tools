'use strict';
/* 目的: docs/specs/norm.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/norm.js  /  ./test/run norm

   照合するID: NORM-01〜15（09 は raw NFKC 一致、10〜12・15 は UI 経路）
   仕様の正本は docs/specs/norm.md。期待値を変えるときは spec を先に直す。

   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。
   エクスポートも実ダウンロードさせず、URL.createObjectURL に渡る Blob を捕捉する。 */

const { launch, fileUrl, createRunner, eq, bannerIs } = require('./helpers');

// 不可視文字・紛らわしい文字はコードポイントで組む（ソースへの実文字混入と誤読を防ぐ）
const KUMIMOJI = '㌔㈱';          // ㌔㈱
const WAVE_DASH = '〜';               // 〜 U+301C
const FULL_TILDE = '～';              // ～ U+FF5E
const MINUS = '−';                   // − U+2212
const EN_DASH = '–';                 // – U+2013
const VOICED_MARK = '゛';             // ゛ U+309B（単独の濁点）
const ALL_OFF = {
  nfkc: false, alnum: false, kana: false, hyphen: false, wave: false, space: false,
};

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/norm.html'));

  // 前回セッションの tools:norm が残っていると「既定値のはず」のケースが偽 fail する
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const norm = (text, opts) => page.evaluate(([t, o]) => {
    const res = window.norm.normalize(t, o);
    return {
      text: res.text,
      counts: res.counts,
      attention: res.attention,
      // 全ケース共通の不変条件（spec）: tokens の cur 連結が出力と一致する
      joined: res.tokens.map(x => x.cur).join(''),
      tokenCount: res.tokens.length,
    };
  }, [text, opts || null]);

  // counts のうち 0 でないものだけ取り出して照合しやすくする
  const nonZero = counts => Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0));
  const allZero = counts => Object.values(counts).every(v => v === 0);

  /* ========== NORM-01〜08: 各変換（純関数） ========== */
  const n01 = await norm('ＡＢＣ１２３');
  r.check('NORM-01（全角英数→半角）',
    n01.text === 'ABC123' && n01.joined === 'ABC123' && eq(nonZero(n01.counts), { alnum: 6 }),
    JSON.stringify([n01.text, nonZero(n01.counts)]));

  const n02 = await norm('ｶﾞｷﾞｸﾞ');
  r.check('NORM-02（半角カナ→全角・濁点は前処理マージで1トークン）',
    n02.text === 'ガギグ' && n02.joined === 'ガギグ'
    && eq(nonZero(n02.counts), { kana: 3 }) && n02.tokenCount === 3,
    JSON.stringify([n02.text, nonZero(n02.counts), n02.tokenCount]));

  /* ========== NORM-17/18: 逆方向（統一先の切替） ========== */
  const n17 = await norm('ABC123', { alnumTarget: 'full' });
  r.check('NORM-17（英数字統一・統一先=全角）',
    n17.text === 'ＡＢＣ１２３' && n17.joined === 'ＡＢＣ１２３' && eq(nonZero(n17.counts), { alnum: 6 }),
    JSON.stringify([n17.text, nonZero(n17.counts)]));

  const n18 = await norm('ガギグ。', { kanaTarget: 'half' });
  r.check('NORM-18（カナ統一・統一先=半角。濁点は2文字へ展開・句読点も対象）',
    n18.text === 'ｶﾞｷﾞｸﾞ｡' && n18.joined === 'ｶﾞｷﾞｸﾞ｡' && eq(nonZero(n18.counts), { kana: 4 }),
    JSON.stringify([n18.text, nonZero(n18.counts)]));

  // ラベルの方向追随（spec T2）: UI で統一先を全角にすると summary の文言が反転する
  const n17b = await page.evaluate(async () => {
    const t = document.getElementById('opt-alnum-target');
    if (!t) return { missing: true };
    t.value = 'full';
    t.dispatchEvent(new Event('change', { bubbles: true }));
    const ta = document.getElementById('input');
    ta.value = 'abc';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 300));
    const summary = document.getElementById('summary').textContent;
    // 後続テストへ方向・入力を持ち込まない
    t.value = 'half';
    t.dispatchEvent(new Event('change', { bubbles: true }));
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 250));
    return { summary };
  });
  r.check('NORM-17b（サマリのラベルが方向に追随: 半角英数→全角）',
    !n17b.missing && n17b.summary === '適用: 半角英数→全角: 3件',
    JSON.stringify(n17b));

  /* ========== NORM-19〜21: 要注意文字の検出 ========== */
  const OFF = { nfkc: false, alnum: false, kana: false, hyphen: false, wave: false, space: false };
  const n19 = await norm('①テスト﨑😀\u00A0', OFF);
  r.check('NORM-19（要注意4クラスを検出・テキストは不変）',
    n19.text === '①テスト﨑😀\u00A0' && allZero(n19.counts)
    && n19.attention && n19.attention.total === 4
    && n19.attention.byClass['囲み・組文字（機種依存）'] === 1
    && n19.attention.byClass['異体字（機種依存）'] === 1
    && n19.attention.byClass['BMP外（絵文字等 — CP932に無い）'] === 1
    && n19.attention.byClass['不可視文字'] === 1,
    JSON.stringify([n19.text === '①テスト﨑😀\u00A0', n19.attention]));

  const n20 = await norm('①', Object.assign({}, OFF, { nfkc: true }));
  r.check('NORM-20（判定は変換後の出力に対して — NFKC が ① を変換すると要注意0件）',
    n20.text === '1' && n20.attention && n20.attention.total === 0 && eq(nonZero(n20.counts), { nfkc: 1 }),
    JSON.stringify([n20.text, n20.attention]));

  const n21 = await norm('①', Object.assign({ attention: false }, OFF));
  r.check('NORM-21（attention OFF で検出しない）',
    n21.text === '①' && n21.attention && n21.attention.total === 0,
    JSON.stringify([n21.text, n21.attention]));

  // NORM-22: .ng ハイライトと title・サマリ（UI 経由）
  const n22 = await page.evaluate(async () => {
    const ids = ['opt-nfkc', 'opt-alnum', 'opt-kana', 'opt-hyphen', 'opt-wave', 'opt-space'];
    const before = {};
    for (const id of ids) { const e = document.getElementById(id); before[id] = e.checked; e.checked = false; }
    document.getElementById('opts').dispatchEvent(new Event('change', { bubbles: true }));
    const ta = document.getElementById('input');
    ta.value = '①';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 300));
    const ng = document.querySelectorAll('#output .ng');
    const out = {
      count: ng.length,
      title: ng.length ? ng[0].title : '',
      summary: document.getElementById('summary').textContent,
    };
    for (const id of ids) document.getElementById(id).checked = before[id];
    document.getElementById('opts').dispatchEvent(new Event('change', { bubbles: true }));
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 250));
    return out;
  });
  r.check('NORM-22（.ng ハイライトと title・サマリに要注意件数）',
    n22.count === 1 && n22.title === '要注意: 囲み・組文字（機種依存）'
    && n22.summary.includes('要注意文字: 1件'),
    JSON.stringify(n22));

  const n03 = await norm('a  b   c');
  r.check('NORM-03（連続空白の圧縮）',
    n03.text === 'a b c' && n03.joined === 'a b c' && eq(nonZero(n03.counts), { space: 2 }),
    JSON.stringify([n03.text, nonZero(n03.counts)]));

  const n04 = await norm(KUMIMOJI, { nfkc: true, alnum: false, kana: false, hyphen: false, wave: false, space: false });
  r.check('NORM-04（NFKC 一括）',
    n04.text === 'キロ(株)' && n04.joined === 'キロ(株)' && eq(nonZero(n04.counts), { nfkc: 2 }),
    JSON.stringify([n04.text, nonZero(n04.counts)]));

  const n05 = await norm('A' + MINUS + 'B' + EN_DASH + 'C');
  r.check('NORM-05（ハイフン統一・既定の統一先 -）',
    n05.text === 'A-B-C' && n05.joined === 'A-B-C' && eq(nonZero(n05.counts), { hyphen: 2 }),
    JSON.stringify([n05.text, nonZero(n05.counts)]));

  const n06 = await norm('10' + WAVE_DASH + '20', { waveTarget: FULL_TILDE });
  r.check('NORM-06（波ダッシュ統一・方向 ～）',
    n06.text === '10' + FULL_TILDE + '20' && n06.joined === n06.text && eq(nonZero(n06.counts), { wave: 1 }),
    JSON.stringify([n06.text, nonZero(n06.counts)]));

  const n07 = await norm(FULL_TILDE, { nfkc: true, waveTarget: WAVE_DASH });
  r.check('NORM-07（NFKC の除外集合により wave が変換・nfkc は触れない）',
    n07.text === WAVE_DASH && n07.joined === WAVE_DASH
    && n07.counts.wave === 1 && n07.counts.nfkc === 0,
    JSON.stringify([n07.text === WAVE_DASH, n07.counts]));

  const n08src = 'ＡＢＣ　ーａ'; // ＡＢＣ＋全角スペース＋長音ー＋ａ
  const n08 = await norm(n08src, ALL_OFF);
  r.check('NORM-08（全OFF で無変換）',
    n08.text === n08src && n08.joined === n08src && allZero(n08.counts),
    JSON.stringify([n08.text === n08src, nonZero(n08.counts)]));

  /* ========== NORM-09: nfkc のみ ON なら raw NFKC と完全一致 ========== */
  const n09 = await page.evaluate(([wave, tilde]) => {
    const inputs = [
      '㌔㈱①ＡＢ：（）' + tilde + '－', // ㌔㈱①ＡＢ：（）～－
      'ｶﾞｲﾄﾞ 10' + wave + '20',                     // ｶﾞｲﾄﾞ 10〜20
    ];
    const opts = { nfkc: true, alnum: false, kana: false, hyphen: false, wave: false, space: false };
    return inputs.map(s => {
      const res = window.norm.normalize(s, opts);
      return { ok: res.text === s.normalize('NFKC'), got: res.text, want: s.normalize('NFKC'),
        joined: res.tokens.map(t => t.cur).join('') };
    });
  }, [WAVE_DASH, FULL_TILDE]);
  r.check('NORM-09（除外集合が空なら raw NFKC と完全一致）',
    n09.every(x => x.ok && x.joined === x.got), JSON.stringify(n09));

  /* ========== NORM-13/14: 単独濁点の前処理 ========== */
  const n13 = await norm('ウ' + VOICED_MARK, ALL_OFF); // ウ + U+309B
  r.check('NORM-13（前処理の NFC 合成 ウ゛→ヴ・counts は全0）',
    n13.text === 'ヴ' && n13.joined === 'ヴ' && allZero(n13.counts),
    JSON.stringify([n13.text, n13.text.codePointAt(0).toString(16), nonZero(n13.counts)]));

  const n14 = await norm(VOICED_MARK, { nfkc: true, alnum: false, kana: false, hyphen: false, wave: false, space: false });
  r.check('NORM-14（先頭単独の U+309B はスペース展開しない・常時除外）',
    n14.text === VOICED_MARK && n14.joined === VOICED_MARK && n14.counts.nfkc === 0,
    JSON.stringify([n14.text === VOICED_MARK, n14.counts]));

  /* ========== UI ヘルパー ========== */
  const setInput = async (v, wait) => {
    await page.evaluate(val => {
      const ta = document.getElementById('input');
      ta.value = val;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    await page.waitForTimeout(wait || 300); // 150ms デバウンス＋描画の余裕
  };

  const ui = () => page.evaluate(() => {
    const out = document.getElementById('output');
    const chg = Array.from(out.querySelectorAll('.chg'));
    const banner = document.getElementById('banner');
    return {
      outputText: out.textContent,
      chgCount: chg.length,
      chgTitles: chg.map(s => s.title),
      chgTexts: chg.map(s => s.textContent),
      rubyCount: out.querySelectorAll('ruby rt').length,
      summary: document.getElementById('summary').textContent,
      banner: banner.hidden ? '' : banner.textContent,
      bannerClass: banner.hidden ? '' : banner.className,
    };
  });

  const opts = () => page.evaluate(() => ({
    nfkc: document.getElementById('opt-nfkc').checked,
    alnum: document.getElementById('opt-alnum').checked,
    kana: document.getElementById('opt-kana').checked,
    hyphen: document.getElementById('opt-hyphen').checked,
    hyphenTarget: document.getElementById('opt-hyphen-target').value,
    hyphenIncludeChoon: document.getElementById('opt-hyphen-choon').checked,
    wave: document.getElementById('opt-wave').checked,
    waveTarget: document.getElementById('opt-wave-target').value,
    space: document.getElementById('opt-space').checked,
    ruby: document.getElementById('opt-ruby').checked,
  }));

  const toggle = (id, v) => page.evaluate(([i, val]) => {
    const c = document.getElementById(i);
    if (c.checked !== val) { c.checked = val; c.dispatchEvent(new Event('change', { bubbles: true })); }
  }, [id, v]);

  /* ========== NORM-10: ハイライトの隣接結合 ========== */
  await setInput('ＡＢＣ１２３');
  const u10 = await ui();
  r.check('NORM-10（連続6文字の変更が1 span に結合・出力とサマリ）',
    u10.chgCount === 1 && u10.chgTexts[0] === 'ABC123' && u10.outputText === 'ABC123'
    && u10.chgTitles[0] === '変更前: ＡＢＣ１２３ [全角英数→半角]'
    && u10.summary === '適用: 全角英数→半角: 6件',
    JSON.stringify([u10.chgCount, u10.chgTexts, u10.chgTitles, u10.summary]));

  // 前処理由来のハイライトは tooltip が「前処理（濁点合成）」になる（NORM-13 の UI 面）
  await setInput('ウ' + VOICED_MARK);
  const u13 = await ui();
  r.check('NORM-13-UI（前処理の変更もハイライトされ tooltip が専用文言）',
    u13.chgCount === 1 && u13.outputText === 'ヴ'
    && u13.chgTitles[0] === '変更前: ウ' + VOICED_MARK + ' [前処理（濁点合成）]'
    && u13.summary === '変更はありません',
    JSON.stringify([u13.chgCount, u13.chgTitles, u13.summary]));

  // ルビ表示トグル（NORM-Q5 の決定事項）
  await toggle('opt-ruby', true);
  await setInput('ＡＢＣ');
  const uRuby = await ui();
  await toggle('opt-ruby', false);
  r.check('NORM-Q5（「変更前を注記表示」で ruby/rt が出る）',
    uRuby.rubyCount === 1 && uRuby.outputText.includes('ABC'), JSON.stringify(uRuby));

  /* ========== NORM-15: 性能ガード ========== */
  await setInput('x'.repeat(1000001), 900);
  const u15 = await ui();
  const b15 = await bannerIs(page, '#banner', 'warn');   // class だけでなく role と算出背景色も
  r.check('NORM-15（100万文字超で処理中止・出力空・warn バナー）',
    u15.outputText === '' && u15.summary === ''
    && u15.banner === '入力が上限（100万文字）を超えたため処理を中止しました'
    && b15.ok,
    JSON.stringify([u15.outputText.length, u15.summary, u15.banner, b15.detail]));
  await setInput('');

  /* ========== ハイライト省略（64KB 超） ========== */
  await setInput('ＡＢ'.repeat(20000), 900); // 40000 文字 → 64KB 未満なのでハイライトあり
  const uUnder = await ui();
  await setInput('ＡＢ'.repeat(40000), 1200); // 80000 文字 → 64KB 超
  const uOver = await ui();
  r.check('ハイライト上限（64KB 超で省略＋info バナー・サマリは残る）',
    uUnder.chgCount > 0
    && uOver.chgCount === 0 && uOver.outputText.length === 80000
    && uOver.banner === '入力が大きいためハイライトを省略しました'
    && uOver.summary.includes('全角英数→半角'),
    JSON.stringify([uUnder.chgCount, uOver.chgCount, uOver.banner, uOver.summary]));
  await setInput('');

  /* ========== NORM-11: オプションの永続化と復元 ========== */
  await toggle('opt-nfkc', true);
  await toggle('opt-space', false);
  await page.evaluate(() => {
    const s = document.getElementById('opt-hyphen-target');
    s.value = '−';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const stored = await page.evaluate(() => localStorage.getItem('tools:norm'));
  await page.reload();
  await page.waitForTimeout(200);
  const restored = await opts();
  r.check('NORM-11（変更が tools:norm に保存されリロードで復元）',
    !!stored && JSON.parse(stored).data.options.nfkc === true
    && restored.nfkc === true && restored.space === false && restored.hyphenTarget === '−',
    JSON.stringify([stored && JSON.parse(stored).data.options, restored]));

  /* ========== NORM-12: エクスポート → インポートで設定一致 ========== */
  // 実ダウンロードさせず、createObjectURL に渡る Blob を捕捉して中身を読む
  const exported = await page.evaluate(() => {
    window.__blob = null;
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = function (b) { window.__blob = b; return origCreate.call(URL, b); };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return origClick.call(this); };
    document.getElementById('export-btn').click();
    URL.createObjectURL = origCreate;
    HTMLAnchorElement.prototype.click = origClick;
    return window.__blob ? window.__blob.text() : null;
  });
  const exportedOk = exported && JSON.parse(exported).tool === 'norm'
    && JSON.parse(exported).data.options.hyphenTarget === '−';

  // 設定を変えてからインポートし、エクスポート時点に戻ることを確認する
  await toggle('opt-nfkc', false);
  await toggle('opt-space', true);
  const beforeImport = await opts();
  const importMsg = await page.evaluate(async (text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'tools-norm.json', { type: 'application/json' }));
    const input = document.getElementById('import-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(done => setTimeout(done, 300));
    const b = document.getElementById('banner');
    return b.hidden ? '' : b.textContent;
  }, exported);
  const afterImport = await opts();
  // spec NORM-12 の要件は「設定一致」。バナーは spec の要件ではないため下の NM-13 で別に見る
  r.check('NORM-12（エクスポート→インポートで設定が一致・全置換）',
    exportedOk && beforeImport.nfkc === false && beforeImport.space === true
    && afterImport.nfkc === true && afterImport.space === false
    && afterImport.hyphenTarget === '−',
    JSON.stringify([exportedOk, beforeImport.nfkc, afterImport]));

  // NM-13 の回帰テスト（2026-08-05 対応済み）。run() は先頭でバナーを消すため、
  // インポートハンドラは run() → showBanner の順でなければ成功通知が即消える。
  r.check('NM-13（インポート成功バナーが表示される）',
    importMsg.includes('インポートしました'), JSON.stringify(importMsg));

  /* ========== コピー（実クリップボードを壊さない） ========== */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(150);
  await setInput('ＡＢＣ');
  const copied = await page.evaluate(async () => {
    window.__copied = null;
    // 実クリップボードに書かないようスタブする（元に戻す必要はない: この後リロードしない）
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('copy-btn').click();
    await new Promise(done => setTimeout(done, 200));
    return { text: window.__copied, label: document.getElementById('copy-btn').textContent };
  });
  r.check('コピー（出力テキストのみをコピー・ルビの rt は混入しない）',
    copied.text === 'ABC' && copied.label.includes('コピーしました'), JSON.stringify(copied));

  // NORM-16: デバウンス確定前のコピーでも最新入力の結果が渡る（コピー時に確定）
  const raced = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    const ta = document.getElementById('input');
    ta.value = 'ＸＹＺ';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('copy-btn').click();   // 150ms のデバウンスを待たずに押す
    await new Promise(done => setTimeout(done, 200));
    return window.__copied;
  });
  r.check('NORM-16（デバウンス確定前のコピーで最新入力の結果が渡る）',
    raced === 'XYZ', JSON.stringify(raced));

  // ルビ表示 ON でも rt がコピーに混入しないこと（spec の一時 textarea 方式の理由）
  await toggle('opt-ruby', true);
  await setInput('ＡＢＣ');
  const copiedRuby = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('copy-btn').click();
    await new Promise(done => setTimeout(done, 200));
    return window.__copied;
  });
  r.check('コピー（ルビ表示 ON でも変更前テキストが混入しない）',
    copiedRuby === 'ABC', JSON.stringify(copiedRuby));
  await toggle('opt-ruby', false);

  /* ========== Cmd/Ctrl+Enter でのコピー ========== */
  await setInput('ＡＢＣ');
  const byKey = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(done => setTimeout(done, 200));
    return window.__copied;
  });
  r.check('Cmd/Ctrl+Enter でコピーが実行される', byKey === 'ABC', JSON.stringify(byKey));

  /* ========== サンプル投入ボタン ========== */
  await setInput('');
  const sample = await page.evaluate(async () => {
    const btn = document.getElementById('sample-btn');
    const hiddenWhenEmpty = btn.hidden;
    btn.click();
    await new Promise(done => setTimeout(done, 300));
    return {
      hiddenWhenEmpty,
      hiddenAfter: btn.hidden,
      inputFilled: document.getElementById('input').value !== '',
      summary: document.getElementById('summary').textContent,
    };
  });
  r.check('サンプル投入（空のとき表示・投入後に消える・既定ONの変換が発火）',
    sample.hiddenWhenEmpty === false && sample.hiddenAfter === true && sample.inputFilled
    && ['全角英数→半角', '半角カナ→全角', 'ハイフン統一', '波ダッシュ統一', '連続空白の圧縮']
      .every(l => sample.summary.includes(l)),
    JSON.stringify(sample));

  /* ========== 空入力 / 非空で変更0件 ==========
     spec「エラー・警告仕様」: 空入力は出力空・サマリなし（summary は空文字）。
     「変更はありません」は入力があるときだけ出す — この区別が要件（2026-08-05 に実装を修正）。 */
  await setInput('');
  const empty = await ui();
  await setInput('abc'); // 非空だがどの変換も発火しない入力
  const noChange = await ui();
  r.check('空入力（出力空・サマリなし・バナーなし）',
    empty.outputText === '' && empty.summary === '' && empty.banner === '', JSON.stringify(empty));
  r.check('非空で変更0件のときだけ「変更はありません」を出す',
    noChange.outputText === 'abc' && noChange.summary === '変更はありません' && noChange.chgCount === 0,
    JSON.stringify(noChange));

  /* ========== ToolStorage 不可時の警告バナー ========== */
  const warn = await page.evaluate(() => {
    window.ToolStorage.available = false;
    window.ToolStorage.mountWarning();
    const w = document.getElementById('toolstorage-warning');
    return { exists: !!w, text: w ? w.textContent : '', role: w ? w.getAttribute('role') : '' };
  });
  r.check('ToolStorage 不可時に mountWarning のバナーが出る',
    warn.exists && warn.text.includes('保存できません') && warn.role === 'alert', JSON.stringify(warn));

  /* ========== ハブからの導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list a:text-is("Text")');
  await page.waitForLoadState('load');
  const title = await page.title();
  r.check('ハブから「Text」→ norm へ遷移できる', title.includes('norm'), title);

  await browser.close();
  r.report('norm（docs/specs/norm.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
