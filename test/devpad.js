'use strict';
/* 目的: docs/specs/devpad.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/devpad.js  /  ./test/run devpad

   照合するID: DEV-01〜17（12/13/16/17 は UI 経路）＋7タブの独立性
   仕様の正本は docs/specs/devpad.md。期待値を変えるときは spec を先に直す。

   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

const TAB_IDS = ['json', 'escape', 'url', 'base64', 'time', 'uuid', 'count'];

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/devpad.html'));

  // 前回セッションの tools:devpad が残っていると復元済み入力で偽 fail する
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  /* ========== DEV-01・02: JSON ========== */
  const d01 = await page.evaluate(() => window.devpad.formatJson('{"a":1,"b":[2,3]}'));
  r.check('DEV-01（JSON 整形は2スペース）',
    d01 === '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}', JSON.stringify(d01));

  const d02 = await page.evaluate(() => {
    const res = window.devpad.parseJsonWithPos('{\n"a": 1,\n}');
    return { ok: res.ok, line: res.line, col: res.col, hasMessage: typeof res.message === 'string' && res.message.length > 0 };
  });
  r.check('DEV-02（パース失敗で位置情報が取れる・Chromium は line=3）',
    d02.ok === false && d02.line === 3 && typeof d02.col === 'number' && d02.hasMessage,
    JSON.stringify(d02));

  const dMinify = await page.evaluate(() => window.devpad.minifyJson('{\n  "a": 1\n}'));
  r.check('JSON 圧縮', dMinify === '{"a":1}', JSON.stringify(dMinify));

  /* ========== DEV-03・04・11: Base64 ========== */
  const d03 = await page.evaluate(() => {
    const src = 'こんにちは🍣';
    return { round: window.devpad.b64decode(window.devpad.b64encode(src)), src };
  });
  r.check('DEV-03（Base64 往復で絵文字を含めて完全一致）',
    d03.round === d03.src, JSON.stringify(d03));

  const d04 = await page.evaluate(() => window.devpad.b64encode('ABC'));
  r.check('DEV-04（b64encode("ABC") === "QUJD"）', d04 === 'QUJD', JSON.stringify(d04));

  const d11 = await page.evaluate(() => {
    try {
      const res = window.devpad.b64decode('!!!');
      return { threw: false, isError: !!(res && res.error), message: res && res.error };
    } catch (e) { return { threw: true, message: String(e.message) }; }
  });
  r.check('DEV-11（不正 Base64 は例外を投げずエラーを返す）',
    d11.threw === false && d11.isError === true
    && d11.message === 'Base64として解釈できませんでした', JSON.stringify(d11));

  // UTF-8 として不正なバイト列は別メッセージ（spec タブ仕様 4）
  const dB64Utf8 = await page.evaluate(() => {
    const res = window.devpad.b64decode('/w==' /* 0xFF 単独 */);
    return res && res.error;
  });
  r.check('Base64（UTF-8 として不正なら専用メッセージ）',
    dB64Utf8 === 'UTF-8として解釈できませんでした（バイナリの可能性）', JSON.stringify(dB64Utf8));

  /* ========== DEV-05〜07・14・15: 時刻 ========== */
  const t = await page.evaluate(() => ({
    d05: window.devpad.epochToJst(0),
    d06: window.devpad.epochToJst(1700000000000),
    d07: window.devpad.jstToEpoch('2024/01/01 00:00:00'),
    d14: window.devpad.jstToEpoch('2024/13/99 00:00:00'),
    d15: window.devpad.jstToEpoch('2024/02/30 12:00:00'),
    iso: window.devpad.jstToEpoch('2024-01-01 00:00:00'),
    bad: window.devpad.epochToJst('abc'),
  }));
  r.check('DEV-05（epochToJst(0) は JST=UTC+9 固定）', t.d05 === '1970/01/01 09:00:00', JSON.stringify(t.d05));
  r.check('DEV-06（ミリ秒を自動判定）', t.d06 === '2023/11/15 07:13:20', JSON.stringify(t.d06));
  r.check('DEV-07（jstToEpoch は秒を返す）', t.d07 === 1704034800, JSON.stringify(t.d07));
  r.check('DEV-14（存在しない月日はロールオーバーを受理しない）',
    !!(t.d14 && t.d14.error), JSON.stringify(t.d14));
  r.check('DEV-15（2024/02/30 は受理しない）', !!(t.d15 && t.d15.error), JSON.stringify(t.d15));
  r.check('時刻（ハイフン区切りも受容・数値以外はエラー）',
    t.iso === 1704034800 && !!(t.bad && t.bad.error), JSON.stringify([t.iso, t.bad]));

  /* ========== DEV-08: URL ==========
     urlDecode は b64decode と規約が異なり、不正入力では**例外を投げる**（UI 側が try/catch して
     バナーを出す）。spec が要求しているのは「デコード失敗はエラーバナー」なので、
     関数は throw することを、UI はバナー文言を、それぞれ照合する。 */
  const d08 = await page.evaluate(() => {
    let threw = false;
    try { window.devpad.urlDecode('%E0%A4%A'); } catch (_) { threw = true; }
    return {
      enc: window.devpad.urlEncode('日本 語'),
      dec: window.devpad.urlDecode('%E6%97%A5%E6%9C%AC%20%E8%AA%9E'),
      badThrows: threw,
      plus: window.devpad.urlDecode('a+b'), // + は空白として扱わない（spec タブ仕様 3）
    };
  });
  r.check('DEV-08（urlEncode の期待値・往復・不正 % は throw・+ は空白にしない）',
    d08.enc === '%E6%97%A5%E6%9C%AC%20%E8%AA%9E' && d08.dec === '日本 語'
    && d08.badThrows === true && d08.plus === 'a+b', JSON.stringify(d08));

  // UI 側で不正 % のバナー文言が出ること（spec タブ仕様 3 が要求しているのはこちら）
  const urlBad = await page.evaluate(async () => {
    window.devpad.switchTab('url');
    document.getElementById('url-enc').value = '%E0%A4%A';
    document.getElementById('url-raw').value = '';
    document.getElementById('url-decode').click();
    await new Promise(d => setTimeout(d, 100));
    const b = document.getElementById('url-result');
    return { hidden: b.hidden, text: b.textContent, cls: b.className,
      raw: document.getElementById('url-raw').value };
  });
  r.check('URL デコード失敗（専用のエラーバナー文言・出力は変えない）',
    urlBad.hidden === false && urlBad.raw === ''
    && urlBad.text === 'デコード失敗: 不正なパーセントエンコーディングです'
    && urlBad.cls.includes('banner-error'), JSON.stringify(urlBad));

  /* ========== DEV-09: カウント ========== */
  const d09 = await page.evaluate(() => window.devpad.countText('abcあいう\n123'));
  r.check('DEV-09（文字数10 / 全角3 / 半角7 / 行数2 / UTF-8 16B / CP932概算 13B）',
    d09.chars === 10 && d09.full === 3 && d09.half === 7 && d09.lines === 2
    && d09.utf8 === 16 && d09.cp932approx === 13, JSON.stringify(d09));

  const dCountEdge = await page.evaluate(() => ({
    empty: window.devpad.countText(''),
    trailing: window.devpad.countText('a\n'),   // 末尾改行は行に数えない
    onlyNl: window.devpad.countText('\n'),
    kana: window.devpad.countText('ｱｲｳ'),       // 半角カナは半角側
  }));
  r.check('カウント境界（空・末尾改行・半角カナ）',
    dCountEdge.empty.chars === 0 && dCountEdge.empty.lines === 0
    && dCountEdge.trailing.lines === 1 && dCountEdge.onlyNl.lines === 1
    && dCountEdge.kana.half === 3 && dCountEdge.kana.full === 0,
    JSON.stringify(dCountEdge));

  /* ========== DEV-10: UUID ========== */
  const d10 = await page.evaluate(() => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const list = [];
    for (let i = 0; i < 100; i++) list.push(window.devpad.uuidv4());
    return { allMatch: list.every(u => re.test(u)), unique: new Set(list).size, count: list.length };
  });
  r.check('DEV-10（UUID v4 の形式100件・重複なし）',
    d10.allMatch && d10.unique === 100 && d10.count === 100, JSON.stringify(d10));

  /* ========== エスケープ（DEV-Q1 / DEV-Q2） ==========
     unescapeJsonStr も urlDecode と同様に**例外を投げる**（UI 側が try/catch してバナーを出す）。 */
  const esc = await page.evaluate(() => {
    let threw = false;
    try { window.devpad.unescapeJsonStr('"a'); } catch (_) { threw = true; }
    return {
      enc: window.devpad.escapeJsonStr('あ"b\nc'),
      decQuoted: window.devpad.unescapeJsonStr('"a\\nb"'),
      decBare: window.devpad.unescapeJsonStr('a\\nb'), // 引用符なしは自動ラップ（DEV-Q2）
      badThrows: threw,
    };
  });
  r.check('DEV-Q1/Q2（エスケープは外側の " を含む・引用符なしは自動ラップ・失敗は throw）',
    esc.enc === '"あ\\"b\\nc"' && esc.decQuoted === 'a\nb' && esc.decBare === 'a\nb'
    && esc.badThrows === true, JSON.stringify(esc));

  // UI 側でアンエスケープ失敗のバナーが出ること（spec タブ仕様 2 が要求しているのはこちら）
  const escBad = await page.evaluate(async () => {
    window.devpad.switchTab('escape');
    document.getElementById('esc-lit').value = '"a';
    document.getElementById('esc-raw').value = '';
    document.getElementById('esc-decode').click();
    await new Promise(d => setTimeout(d, 100));
    const b = document.getElementById('esc-result');
    return { hidden: b.hidden, text: b.textContent, cls: b.className,
      raw: document.getElementById('esc-raw').value };
  });
  r.check('アンエスケープ失敗（エラーバナーに理由が出る・出力は変えない）',
    escBad.hidden === false && escBad.raw === ''
    && escBad.text.startsWith('アンエスケープ失敗: ')
    && escBad.cls.includes('banner-error'), JSON.stringify(escBad));

  /* ========== UI ヘルパー ========== */
  const toTab = async (id) => {
    await page.evaluate(i => window.devpad.switchTab(i), id);
    await page.waitForTimeout(60);
  };
  const setVal = async (id, v, wait) => {
    await page.evaluate(([i, val]) => {
      const t = document.getElementById(i);
      t.value = val;
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);
    await page.waitForTimeout(wait || 80);
  };
  const banner = (id) => page.evaluate(i => {
    const b = document.getElementById(i);
    return { hidden: b.hidden, text: b.textContent, cls: b.className, role: b.getAttribute('role') };
  }, id);
  const visibleTabs = () => page.evaluate(ids => ids.filter(i => !document.getElementById('tab-' + i).hidden),
    TAB_IDS);

  /* ========== タブ切替: 1つだけ表示され DOM は破棄されない ========== */
  const switching = await page.evaluate(async (ids) => {
    const out = [];
    for (const id of ids) {
      window.devpad.switchTab(id);
      out.push({
        id,
        visible: ids.filter(x => !document.getElementById('tab-' + x).hidden),
        activeBtn: document.querySelector('#tabbar button.active').dataset.tab,
        panelsInDom: ids.every(x => !!document.getElementById('tab-' + x)),
      });
    }
    return out;
  }, TAB_IDS);
  r.check('タブ切替（常に1枚だけ表示・タブボタンの active が一致・DOM は破棄しない）',
    switching.length === 7
    && switching.every(s => eq(s.visible, [s.id]) && s.activeBtn === s.id && s.panelsInDom),
    JSON.stringify(switching.map(s => [s.id, s.visible, s.activeBtn])));

  /* ========== DEV-12: タブ独立性 ========== */
  await toTab('json');
  await setVal('json-in', '{');
  await page.click('#json-format');
  const jsonErr = await banner('json-result');
  await toTab('url');
  await setVal('url-raw', 'あ');
  await page.click('#url-encode');
  const urlOut = await page.inputValue('#url-enc');
  const urlBanner = await banner('url-result');
  await toTab('json');
  const jsonKept = await page.inputValue('#json-in');
  const jsonErrStill = await banner('json-result');
  r.check('DEV-12（JSON のエラーが URL タブに波及しない・入力は残る）',
    jsonErr.hidden === false && jsonErr.cls.includes('banner-error')
    && urlOut === '%E3%81%82' && urlBanner.hidden === true
    && jsonKept === '{' && jsonErrStill.hidden === false,
    JSON.stringify([jsonErr.text.slice(0, 30), urlOut, urlBanner.hidden, jsonKept]));

  // JSON エラー表示の内容（位置＋該当行＋キャレット。存在ではなく文字列を照合）
  await setVal('json-in', '{\n"a": 1,\n}');
  await page.click('#json-format');
  const posErr = await banner('json-result');
  r.check('DEV-02-UI（位置注釈: 「N行目 M文字目」＋該当行＋^ キャレット）',
    posErr.hidden === false && /^3行目 \d+文字目: /.test(posErr.text)
    && posErr.text.split('\n').length === 3 && posErr.text.split('\n')[1] === '}'
    && posErr.text.split('\n')[2].trim() === '^'
    && posErr.cls.includes('json-error-pos') && posErr.role === 'alert',
    JSON.stringify(posErr.text));

  // 整形・圧縮・検証の3操作すべてが同じ位置注釈を出す（UX監査 DP-2）
  const threeOps = await page.evaluate(async () => {
    const out = {};
    for (const id of ['json-format', 'json-minify', 'json-validate']) {
      document.getElementById('json-result').hidden = true;
      document.getElementById(id).click();
      const b = document.getElementById('json-result');
      out[id] = { hidden: b.hidden, startsWith3: b.textContent.startsWith('3行目') };
    }
    return out;
  });
  r.check('DP-2（整形・圧縮・検証の3操作が同じ位置注釈を出す）',
    Object.values(threeOps).every(v => v.hidden === false && v.startsWith3),
    JSON.stringify(threeOps));

  /* ========== DP-1: 入力再開でそのタブのバナーが消える ========== */
  const dp1 = await page.evaluate(async () => {
    const before = document.getElementById('json-result').hidden;
    const ta = document.getElementById('json-in');
    ta.value = '{"a":1}';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 60));
    return { before, after: document.getElementById('json-result').hidden };
  });
  r.check('DP-1（入力再開で当該タブのバナーが隠れる）',
    dp1.before === false && dp1.after === true, JSON.stringify(dp1));

  /* ========== 7タブの独立性（各タブでエラーを起こして他が動くか） ========== */
  const isolation = await page.evaluate(async () => {
    const errorCases = [
      { tab: 'json', input: 'json-in', value: '{', click: 'json-format', bannerId: 'json-result' },
      { tab: 'escape', input: 'esc-lit', value: '"a', click: 'esc-decode', bannerId: 'esc-result' },
      { tab: 'url', input: 'url-enc', value: '%E0%A4%A', click: 'url-decode', bannerId: 'url-result' },
      { tab: 'base64', input: 'b64-enc', value: '!!!', click: 'b64-decode', bannerId: 'b64-result' },
      { tab: 'time', input: 'time-dt', value: '2024/02/30 12:00:00', click: 'time-to-epoch', bannerId: 'time-result' },
    ];
    // 全タブでエラー状態を作る
    for (const c of errorCases) {
      window.devpad.switchTab(c.tab);
      const t = document.getElementById(c.input);
      t.value = c.value;
      document.getElementById(c.click).click();
    }
    const banners = {};
    for (const c of errorCases) {
      const b = document.getElementById(c.bannerId);
      banners[c.tab] = { shown: !b.hidden, isError: b.className.includes('banner-error') };
    }
    // エラーが5タブに出ている状態でも、残る2タブ（uuid・count）は正常動作する
    window.devpad.switchTab('uuid');
    document.getElementById('uuid-count').value = '3';
    document.getElementById('uuid-gen').click();
    const uuidLines = document.getElementById('uuid-out').value.split('\n').filter(Boolean).length;
    window.devpad.switchTab('count');
    const ci = document.getElementById('count-in');
    ci.value = 'abc';
    ci.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 250));
    const countText = document.getElementById('count-result').textContent;
    // タブボタンにエラー印が付いていないこと（init 失敗時だけ付く .tab-error）
    const tabErrorMarks = document.querySelectorAll('#tabbar button.tab-error').length;
    return { banners, uuidLines, countText, tabErrorMarks };
  });
  r.check('7タブ独立性（5タブが同時にエラーでも uuid/count は正常・init 失敗印は付かない）',
    Object.values(isolation.banners).every(b => b.shown && b.isError)
    && isolation.uuidLines === 3
    && isolation.countText.includes('文字数') && isolation.countText.includes('3')
    && isolation.tabErrorMarks === 0,
    JSON.stringify(isolation));

  /* ========== 時刻タブ: クリックコピーと現在時刻 ========== */
  await toTab('time');
  const timeUi = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('time-epoch').value = '0';
    document.getElementById('time-to-jst').click();
    const jst = document.getElementById('time-jst-out').textContent;
    document.getElementById('time-jst-out').click();
    await new Promise(d => setTimeout(d, 150));
    const afterCopy = document.getElementById('time-result').textContent;
    document.getElementById('time-now').click();
    await new Promise(d => setTimeout(d, 100));
    const nowRows = Array.from(document.querySelectorAll('#time-now-result p'))
      .map(p => p.textContent);
    return { jst, copied: window.__copied, afterCopy, nowRows };
  });
  r.check('DP-4（変換結果のクリックコピー・現在時刻は4形式）',
    timeUi.jst === '1970/01/01 09:00:00' && timeUi.copied === '1970/01/01 09:00:00'
    && timeUi.afterCopy === 'コピーしました: 1970/01/01 09:00:00'
    && timeUi.nowRows.length === 4,
    JSON.stringify(timeUi));

  /* ========== 出力コピー（実クリップボードを壊さない） ========== */
  await toTab('json');
  const copyUi = await page.evaluate(async () => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('json-in').value = '{"a":1}';
    document.getElementById('json-format').click();
    document.getElementById('json-copy').click();
    await new Promise(d => setTimeout(d, 150));
    const withText = { copied: window.__copied, label: document.getElementById('json-copy').textContent };
    // 空出力のときはコピーせず案内を出す
    document.getElementById('json-out').value = '';
    window.__copied = null;
    document.getElementById('json-copy').click();
    await new Promise(d => setTimeout(d, 100));
    return { withText, emptyCopied: window.__copied,
      emptyMsg: document.getElementById('json-result').textContent };
  });
  r.check('出力コピー（内容一致・フィードバック・空出力は案内のみ）',
    copyUi.withText.copied === '{\n  "a": 1\n}' && copyUi.withText.label.includes('コピー')
    && copyUi.emptyCopied === null && copyUi.emptyMsg === 'コピーする内容がありません',
    JSON.stringify(copyUi));

  /* ========== Cmd/Ctrl+Enter でアクティブタブの primary を実行 ========== */
  const byKey = await page.evaluate(async () => {
    const out = {};
    window.devpad.switchTab('url');
    document.getElementById('url-raw').value = 'あ';
    document.getElementById('url-enc').value = '';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 100));
    out.url = document.getElementById('url-enc').value;
    // アクティブタブが違えばそのタブの primary が動く
    window.devpad.switchTab('base64');
    document.getElementById('b64-raw').value = 'ABC';
    document.getElementById('b64-enc').value = '';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 100));
    out.b64 = document.getElementById('b64-enc').value;
    out.title = document.querySelector('#tab-base64 button.primary').title;
    return out;
  });
  r.check('CM-3（Cmd/Ctrl+Enter でアクティブタブの primary が実行される）',
    byKey.url === '%E3%81%82' && byKey.b64 === 'QUJD' && byKey.title === 'Cmd/Ctrl+Enter',
    JSON.stringify(byKey));

  /* ========== JSON サンプル投入 ========== */
  await toTab('json');
  const sample = await page.evaluate(async () => {
    const ta = document.getElementById('json-in');
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 80));
    const btn = document.getElementById('json-sample');
    const hiddenWhenEmpty = btn.hidden;
    btn.click();
    await new Promise(d => setTimeout(d, 120));
    return { hiddenWhenEmpty, hiddenAfter: btn.hidden,
      inFilled: ta.value !== '', outFormatted: document.getElementById('json-out').value };
  });
  r.check('サンプル投入（空のとき表示・投入と同時に整形まで見せる）',
    sample.hiddenWhenEmpty === false && sample.hiddenAfter === true && sample.inFilled
    && sample.outFormatted.startsWith('{\n  "name": "devpad"'),
    JSON.stringify([sample.hiddenWhenEmpty, sample.hiddenAfter, sample.outFormatted.slice(0, 30)]));

  /* ========== DEV-16: カウントタブの性能ガード ========== */
  await toTab('count');
  await setVal('count-in', 'x'.repeat(2000001), 900);
  const g16 = await page.evaluate(() => document.getElementById('count-result').textContent);
  r.check('DEV-16（200万文字超で集計中止のメッセージ）',
    g16 === '入力が上限（200万文字）を超えたため集計を中止しました', JSON.stringify(g16));
  await setVal('count-in', '', 300);

  /* ========== ボタン駆動タブの性能ガード（500万文字） ========== */
  await toTab('url');
  const gBtn = await page.evaluate(async () => {
    // 出力欄に目印を入れておき、ガード発動で「触られない」ことを確かめる
    document.getElementById('url-enc').value = 'SENTINEL';
    document.getElementById('url-raw').value = 'x'.repeat(5000001);
    document.getElementById('url-encode').click();
    await new Promise(d => setTimeout(d, 200));
    const b = document.getElementById('url-result');
    return { text: b.textContent, hidden: b.hidden, out: document.getElementById('url-enc').value };
  });
  r.check('性能ガード（ボタン駆動は500万文字超で処理中止・出力を書き換えない）',
    gBtn.hidden === false && gBtn.out === 'SENTINEL'
    && gBtn.text === '入力が上限（500万文字）を超えたため処理を中止しました', JSON.stringify(gBtn));
  await page.evaluate(() => {
    const t = document.getElementById('url-raw');
    t.value = '';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ========== DEV-13: 永続化（タブ往復＋リロード復元） ========== */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(200);
  const inputs = {
    'json-in': '{"persist":1}', 'esc-raw': 'raw値', 'url-raw': 'URL値',
    'b64-raw': 'B64値', 'time-epoch': '123', 'time-dt': '2024/01/02 03:04:05',
    'count-in': 'カウント値',
  };
  for (const [id, v] of Object.entries(inputs)) {
    const tab = id.startsWith('json') ? 'json' : id.startsWith('esc') ? 'escape'
      : id.startsWith('url') ? 'url' : id.startsWith('b64') ? 'base64'
        : id.startsWith('time') ? 'time' : 'count';
    await toTab(tab);
    await setVal(id, v);
  }
  await toTab('uuid');
  await toTab('json'); // タブ往復
  const afterRoundTrip = await page.evaluate(ids => {
    const out = {};
    for (const id of ids) out[id] = document.getElementById(id).value;
    return out;
  }, Object.keys(inputs));
  await page.waitForTimeout(700); // 500ms デバウンスの保存を待つ
  await page.reload();
  await page.waitForTimeout(300);
  const afterReload = await page.evaluate(ids => {
    const out = {};
    for (const id of ids) out[id] = document.getElementById(id).value;
    return { values: out, activeTab: document.querySelector('#tabbar button.active').dataset.tab };
  }, Object.keys(inputs));
  r.check('DEV-13（タブ往復で保持・リロードで全タブ復元・activeTab も復元）',
    eq(afterRoundTrip, inputs) && eq(afterReload.values, inputs) && afterReload.activeTab === 'json',
    JSON.stringify([afterRoundTrip, afterReload]));

  /* ========== DEV-Q3: 100KB 超フィールドは復元されず注記が出る ========== */
  const bigRestore = await page.evaluate(async () => {
    // pagehide フラッシュが注入値を上書きしないよう保存を止める（verification-notes §4）
    window.ToolStorage.save = () => true;
    const payload = { v: 1, tool: 'devpad', savedAt: new Date().toISOString(),
      data: { activeTab: 'json', tabs: { json: { in: { omitted: true } } } } };
    localStorage.setItem('tools:devpad', JSON.stringify(payload));
    return true;
  });
  await page.reload();
  await page.waitForTimeout(300);
  // 復元通知は guard/init と共用の [data-tab-error] 枠に出る（#json-result は結果用で別物）
  const restored = await page.evaluate(() => {
    const b = document.querySelector('#tab-json [data-tab-error]');
    return {
      jsonIn: document.getElementById('json-in').value,
      banner: b.textContent, bannerHidden: b.hidden,
      cls: b.className, role: b.getAttribute('role'),
      resultHidden: document.getElementById('json-result').hidden,
    };
  });
  r.check('DEV-Q3（omitted マーカーは空欄復元＋注記。古いデータを黙って復活させない）',
    bigRestore && restored.jsonIn === '' && restored.bannerHidden === false
    && restored.banner === '前回の入力は大きすぎたため復元されませんでした（保存上限 100KB/フィールド）'
    // エラー枠の流用なので info 表示・role=status に戻っていること（ui.css の ARIA 規約）
    && restored.cls.includes('banner-info') && restored.role === 'status',
    JSON.stringify(restored));

  /* ========== DEV-17: activeTab が不正値なら json にフォールバック ========== */
  await page.evaluate(() => {
    window.ToolStorage.save = () => true;
    const payload = { v: 1, tool: 'devpad', savedAt: new Date().toISOString(),
      data: { activeTab: 'nonexistent-tab', tabs: {} } };
    localStorage.setItem('tools:devpad', JSON.stringify(payload));
  });
  await page.reload();
  await page.waitForTimeout(250);
  const fb = await page.evaluate(() => ({
    active: document.querySelector('#tabbar button.active').dataset.tab,
    visible: ['json', 'escape', 'url', 'base64', 'time', 'uuid', 'count']
      .filter(i => !document.getElementById('tab-' + i).hidden),
  }));
  r.check('DEV-17（不正な activeTab は json にフォールバック・空画面にならない）',
    fb.active === 'json' && eq(fb.visible, ['json']), JSON.stringify(fb));

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
  await page.click('ul.tool-list a:text-is("devpad")');
  await page.waitForLoadState('load');
  const title = await page.title();
  r.check('ハブから devpad へ遷移できる', title.includes('devpad'), title);

  await browser.close();
  r.report('devpad（docs/specs/devpad.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
