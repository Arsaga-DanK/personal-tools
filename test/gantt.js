'use strict';
/* 目的: docs/specs/gantt.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/gantt.js  /  ./test/run gantt

   照合するID: GN-01〜11（純関数・描画）＋ GN-U1〜U14（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/gantt.md。期待値を変えるときは spec を先に直す。
   注意: date input へのキー打鍵テストは書かない（headless shell の date input は
   非セグメントで実 Chrome と乖離 — verification-notes。value セット＋input/change 発火で代替） */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/gantt.html'));

  const ready = await page.evaluate(() => !!(window.gantt && window.gantt.buildDsl));
  r.check('前提（window.gantt フックがある）', ready, String(ready));

  if (ready) {
    /* ========== GN-01: DSL 生成（正規化・全角化・警告） ========== */
    const gn01 = await page.evaluate(() => {
      const input = [
        '%% コメント行',
        '設計フェーズ',
        '基本設計\t2026-08-18\t2026-08-22',
        '詳細設計\t2026-08-25\t5d',
        'レビュー, 2026/9/1, 3日',
        'DB:定義\t2026/09/04\t1d',
        '不正な行\tabc\tdef',
      ].join('\n');
      return window.gantt.buildDsl(input, { excludeWeekends: true });
    });
    const wantDsl = [
      'gantt',
      'dateFormat YYYY-MM-DD',
      'axisFormat %m/%d',
      'excludes weekends',
      'section 設計フェーズ',
      '基本設計 :t1, 2026-08-18, 2026-08-23',   // 終了日は含む — mermaid の排他仕様を +1 日で吸収（GN-Q4）
      '詳細設計 :t2, 2026-08-25, 5d',
      'レビュー :t3, 2026-09-01, 3d',
      'DB：定義 :t4, 2026-09-04, 1d',
    ].join('\n');
    r.check('GN-01（DSL: 終了日+1で排他吸収・正規化・日数・全角コロン・不正行は警告）',
      gn01.dsl === wantDsl && gn01.warnings.length === 1 && gn01.warnings[0].includes('7行目'),
      JSON.stringify(gn01));

    /* ========== GN-02: 土日除外オフ ========== */
    const gn02 = await page.evaluate(() =>
      window.gantt.buildDsl('作業\t2026-08-18\t2d', { excludeWeekends: false }));
    r.check('GN-02（土日除外オフ: excludes 行が入らない）',
      !gn02.dsl.includes('excludes') && gn02.dsl.includes('作業 :t1, 2026-08-18, 2d'),
      JSON.stringify(gn02));

    /* ========== GN-03: タスク0件は描画しない ========== */
    const gn03 = await page.evaluate(async () => {
      const built = window.gantt.buildDsl('%% コメントだけ\n不正\txx\tyy', { excludeWeekends: true });
      const res = await window.gantt.render('%% コメントだけ\n不正\txx\tyy');
      return { built, res, info: window.gantt.svgInfo() };
    });
    r.check('GN-03（タスク0件: dsl null・警告あり・描画しない）',
      gn03.built.dsl === null && gn03.built.warnings.length > 0
      && gn03.res.ok === false && gn03.info.present === false,
      JSON.stringify(gn03));

    /* ========== GN-04: 描画スモーク ========== */
    const gn04 = await page.evaluate(async () => {
      const res = await window.gantt.render('設計\n基本設計\t2026-08-18\t2026-08-22\n実装\t2026-08-25\t5d');
      return { res, info: window.gantt.svgInfo() };
    });
    r.check('GN-04（正常な表が SVG になる）',
      gn04.res.ok === true && gn04.info.present === true && gn04.info.nodes > 0,
      JSON.stringify(gn04));
  }

  if (ready) {
    /* ========== GN-05: 終了 < 開始 は警告して1日バー ========== */
    const gn05 = await page.evaluate(() =>
      window.gantt.buildDsl('逆転\t2026-08-21\t2026-08-17', { excludeWeekends: false }));
    r.check('GN-05（終了<開始: 警告・1日バーに丸め）',
      gn05.dsl.includes('逆転 :t1, 2026-08-21, 2026-08-22')
      && gn05.warnings.length === 1 && gn05.warnings[0].includes('1行目')
      && gn05.warnings[0].includes('終了が開始より前'),
      JSON.stringify(gn05));
  }

  if (ready) {
    /* ========== GN-06: tasks.md 記法の取り込み ========== */
    const gn06 = await page.evaluate(() => {
      if (!window.gantt.importText) return { missing: true };
      const raw = [
        '## 設計',
        '- [ ] 基本設計 🛫 2026-08-18 📅 2026-08-22 ⏫',
        '\t- [ ] 子タスク 📅 2026-08-25',
        '- [x] 済んだやつ 🛫 2026-08-01 📅 2026-08-02',
        '- [ ] 日付なしタスク',
        '- [ ] 開始のみ [[設計メモ]] 🛫 2026-08-26',
      ].join('\n');
      return window.gantt.importText(raw);
    });
    const want06 = [
      '設計',
      '基本設計\t2026-08-18\t2026-08-22',
      '\u3000子タスク\t2026-08-25\t1d',
      '開始のみ 設計メモ\t2026-08-26\t1d',
    ].join('\n');
    r.check('GN-06（tasks.md 直貼り: 変換表どおり・件数集約の警告・取り込みコメント）',
      !gn06.missing && gn06.kind === 'tasks'
      && /^%% 取り込み: \d{4}-\d{2}-\d{2}\n/.test(gn06.text)
      && gn06.text.split('\n').slice(1).join('\n') === want06
      && gn06.warnings.length === 2
      && gn06.warnings.some(w => w.includes('終わったタスク1件'))
      && gn06.warnings.some(w => w.includes('日付のない1行')),
      JSON.stringify(gn06));

    /* ========== GN-07: 「計画をコピー」出力の取り込み ========== */
    const gn07 = await page.evaluate(() => {
      if (!window.gantt.importText) return { missing: true };
      const raw = [
        '内容\t開始日\t期限\t日数\t状態\tセクション',
        '基本設計\t2026-08-18\t2026-08-22\t5\t未着手\t設計',
        '実装\t2026-08-25\t\t3\t着手中\t実装',
        '古いやつ\t2026-08-01\t2026-08-05\t5\t済\t実装',
      ].join('\n');
      return window.gantt.importText(raw);
    });
    const want07 = [
      '設計',
      '基本設計\t2026-08-18\t2026-08-22',
      '実装',
      '実装\t2026-08-25\t1d',
    ].join('\n');
    r.check('GN-07（計画をコピー: ヘッダー判別・セクション生成・済スキップ・期限空欄は1日）',
      !gn07.missing && gn07.kind === 'plan'
      && gn07.text.split('\n').slice(1).join('\n') === want07
      && gn07.warnings.length === 1 && gn07.warnings[0].includes('1件'),
      JSON.stringify(gn07));

    /* ========== GN-08: Excel用コピー形式は変換せず案内 ========== */
    const gn08 = await page.evaluate(() =>
      window.gantt.importText ? window.gantt.importText('状態\t内容\t開始日\t期限\t優先度\tタグ\tセクション\n未着手\tX\t2026-08-18\t2026-08-22\t\t\t設計') : { missing: true });
    r.check('GN-08（Excel用コピー形式: kind excel・変換しない）',
      !gn08.missing && gn08.kind === 'excel' && gn08.text === null,
      JSON.stringify(gn08));

    /* ========== GN-09: チェーン入力（開始空欄 = 前行の翌営業日） ========== */
    const gn09 = await page.evaluate(() => ({
      chain: window.gantt.buildDsl(
        'A\t2026-08-20\t2026-08-21\nB\t\t2d\nC\t\t2026-08-26',
        { excludeWeekends: true }),
      headEmpty: window.gantt.buildDsl('X\t\t2d', { excludeWeekends: true }),
    }));
    r.check('GN-09（チェーン: 金曜終了→月曜開始・日数行の後も営業日ウォークで繋がる・先頭空欄は警告）',
      gn09.chain.dsl.includes('A :t1, 2026-08-20, 2026-08-22')
      && gn09.chain.dsl.includes('B :t2, 2026-08-24, 2d')
      && gn09.chain.dsl.includes('C :t3, 2026-08-26, 2026-08-27')
      && gn09.chain.warnings.length === 0
      && gn09.headEmpty.dsl === null && gn09.headEmpty.warnings.length === 1
      && gn09.headEmpty.warnings[0].includes('開始'),
      JSON.stringify(gn09));
  }

  if (ready) {
    /* ========== GN-12: Markdown で書いた表（GN-Q19） ========== */
    const gn12 = await page.evaluate(() => window.gantt.buildDsl([
      '---',
      'tags: [plan]',
      '---',
      '## 設計フェーズ',
      '%% ここはコメント',
      '- 基本設計\t2026-08-18\t2026-08-22',
      '- [ ] [[詳細設計メモ|詳細設計]]\t2026-08-25\t5d',
      '## 実装フェーズ',
      '| 名前 | 開始 | 終了 |',
      '|---|---|---|',
      '| **実装** | 2026-09-01 | 10日 |',
    ].join('\n'), { excludeWeekends: true }));
    const want12 = [
      'gantt',
      'dateFormat YYYY-MM-DD',
      'axisFormat %m/%d',
      'excludes weekends',
      'section 設計フェーズ',
      '基本設計 :t1, 2026-08-18, 2026-08-23',
      '詳細設計 :t2, 2026-08-25, 5d',
      'section 実装フェーズ',
      '実装 :t3, 2026-09-01, 10d',
    ].join('\n');
    r.check('GN-12（md: 見出し=セクション・箇条書き/チェックボックス/リンク記法は外れる・テーブル行も読む・front matter と %% は出ない）',
      gn12.dsl === want12 && gn12.warnings.length === 1
      && gn12.warnings[0].includes('9行目'),   // 表のヘッダー行（2列目が日付でない）は解釈できない行
      JSON.stringify(gn12));

    /* ========== GN-13: 行エディタも同じ規則で読む ========== */
    const gn13 = await page.evaluate(() => {
      const rows = window.gantt.parseRows([
        '## 設計フェーズ',
        '%% コメント',
        '- 基本設計\t2026-08-18\t2026-08-22',
        '| 実装 | 2026-09-01 | 10日 |',
      ].join('\n'));
      return rows.map(x => ({ type: x.type, line: x.line, tokens: x.tokens || null }));
    });
    r.check('GN-13（parseRows: 見出し=section・%%=comment・箇条書きとテーブル行=task）',
      gn13.length === 4
      && gn13[0].type === 'section' && gn13[1].type === 'comment'
      && gn13[2].type === 'task' && eq(gn13[2].tokens, ['基本設計', '2026-08-18', '2026-08-22'])
      && gn13[3].type === 'task' && eq(gn13[3].tokens, ['実装', '2026-09-01', '10日']),
      JSON.stringify(gn13));
  }

  /* ========== GN-U1: 自動保存（入力＋チェック） ========== */
  await page.evaluate(() => {
    const input = document.getElementById('input');
    input.value = '保存確認\t2026-08-18\t2d';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const ex = document.getElementById('exclude-weekends');
    ex.checked = false;
    ex.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const u1 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:gantt'));
    return {
      input: document.getElementById('input').value,
      excluded: document.getElementById('exclude-weekends').checked,
      tool: env && env.tool, v: env && env.v,
      rendered: window.gantt.svgInfo().present,
    };
  });
  r.check('GN-U1（pagehide フラッシュ → reload で入力とチェックが復元・再描画）',
    u1.input === '保存確認\t2026-08-18\t2d' && u1.excluded === false
    && u1.tool === 'gantt' && u1.v === 1 && u1.rendered === true,
    JSON.stringify(u1));

  /* ========== GN-U2: PNG コピー ========== */
  const u2 = await page.evaluate(async () => {
    const out = { types: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async items => { out.types = items[0].types.slice(); } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 800));
    return { types: out.types, label: document.getElementById('copy-btn').textContent };
  });
  r.check('GN-U2（PNG コピー: image/png の ClipboardItem・✓ 表示・実クリップボードに書かない）',
    Array.isArray(u2.types) && u2.types.includes('image/png') && u2.label === '✓ コピーしました',
    JSON.stringify(u2));

  /* ========== GN-U3: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u3 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('GN-U3（幅390pxで横スクロールなし）', u3 === true, String(u3));

  /* ========== GN-U4: Ctrl/Cmd+; で今日の日付（lib/edit.js） ========== */
  const u4g = await page.evaluate(() => {
    if (!window.ToolEdit) return { missing: true };
    document.getElementById('view-text').click();   // 既定は行エディタ（GN-Q20）— textarea を出す
    const ta = document.getElementById('input');
    ta.value = '作業\t';
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    const ev = new KeyboardEvent('keydown', { key: ';', metaKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(ev);
    return { v: ta.value, prevented: ev.defaultPrevented };
  });
  r.check('GN-U4（Ctrl/Cmd+; でキャレット位置に今日の日付）',
    !u4g.missing && /^作業\t\d{4}-\d{2}-\d{2}$/.test(u4g.v) && u4g.prevented === true,
    JSON.stringify(u4g));

  /* ========== GN-U5: paste で自動変換（tasks.md）／Excel形式は案内 ========== */
  const u5g = await page.evaluate(async () => {
    if (!window.gantt.importText) return { missing: true };
    const ta = document.getElementById('input');
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    const paste = text => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    };
    paste('- [ ] 貼り付けタスク 🛫 2026-08-18 📅 2026-08-20');
    await new Promise(d => setTimeout(d, 100));
    const converted = { v: ta.value, banner: document.getElementById('banner').textContent };
    paste('状態\t内容\t開始日\n未着手\tX\t2026-08-18');
    await new Promise(d => setTimeout(d, 100));
    const excel = { v: ta.value, banner: document.getElementById('banner').textContent };
    return { converted, excel };
  });
  r.check('GN-U5（paste: tasks.md は変換挿入＋コメント・Excel形式は変換せず案内）',
    !u5g.missing
    && /%% 取り込み: \d{4}-\d{2}-\d{2}/.test(u5g.converted.v)
    && u5g.converted.v.includes('貼り付けタスク\t2026-08-18\t2026-08-20')
    && u5g.excel.v === u5g.converted.v
    && u5g.excel.banner.includes('計画をコピー'),
    JSON.stringify(u5g));

  /* ==================== 行エディタ（GN-10/11・GN-U6〜U14） ====================
     共通手順: テキストビューに戻す → textarea に注入 → 行エディタへ切替（UI ボタン経由）。
     書き戻しは 400ms デバウンス — 650ms 待って照合する。 */

  const COMMIT_WAIT = 650;

  // テキストビューへ戻し、値を注入してから行エディタへ切り替える。
  // 実装前でもハーネスが落ちないよう false を返す（clean RED）
  async function setupEditor(text) {
    return page.evaluate(t => {
      const vt = document.getElementById('view-text');
      const ve = document.getElementById('view-editor');
      if (!vt || !ve) return false;
      vt.click();
      const ta = document.getElementById('input');
      ta.value = t;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const ex = document.getElementById('exclude-weekends');
      if (!ex.checked) { ex.checked = true; ex.dispatchEvent(new Event('change', { bubbles: true })); }
      ve.click();
      return true;
    }, text);
  }

  /* ========== GN-10: parseRows の分類とトークン保持 ========== */
  const gn10 = await page.evaluate(() => {
    if (!window.gantt.parseRows) return { missing: true };
    const text = [
      '%% 取り込み: 2026-08-17',
      '設計フェーズ',
      '基本設計\t2026-08-18\t2026-08-22',
      '',
      'レビュー, 2026/9/1, 3日',
      '　子タスク\t2026-08-25\t1d',
      '実装\tあした\t5d',
      '名前だけ',
      'A\tB',
      '\t\t',
      'X\t2026-08-18\t2026-08-19\tメモ',
    ].join('\n');
    return { rows: window.gantt.parseRows(text) };
  });
  {
    const shape = gn10.missing ? '' : gn10.rows.map(r => r.type + ':' + r.line).join(' ');
    const rows = gn10.rows || [];
    const byLine = n => rows.find(r => r.line === n);
    r.check('GN-10（parseRows: 分類・空行非表示・トークン生値保持・全空タブ行は task・4列目保持）',
      !gn10.missing
      && shape === 'comment:0 section:1 task:2 task:4 task:5 invalid:6 section:7 invalid:8 task:9 task:10'
      && eq(byLine(4).tokens, ['レビュー', ' 2026/9/1', ' 3日'])
      && byLine(5).tokens[0] === '　子タスク'
      && eq(byLine(9).tokens, ['', '', ''])
      && byLine(10).tokens.length === 4 && byLine(10).tokens[3] === 'メモ',
      JSON.stringify(gn10));
  }

  /* ========== GN-11: buildDsl が chained（実効開始日の対応）を返す ========== */
  const gn11 = await page.evaluate(() =>
    window.gantt.buildDsl('A\t2026-08-20\t2026-08-21\nB\t\t2d\n# c\nC\t\t2026-08-26',
      { excludeWeekends: true }));
  r.check('GN-11（chained: 開始空欄の行番号 → 実効開始日。明示行は入らない）',
    gn11.chained && eq(gn11.chained, { 1: '2026-08-24', 3: '2026-08-26' }),
    JSON.stringify(gn11));

  /* ========== GN-U6: 最小スプライス（他行バイト不変・フォーカス維持） ========== */
  const FIXTURE_U6 = '# メモ\n基本設計\t2026-08-18\t2026-08-22\nレビュー, 2026/9/1, 3日\n実装\tあした\t5d\n';
  const editorReady = await setupEditor(FIXTURE_U6);
  const u6 = !editorReady ? { missing: true } : await page.evaluate(async (wait) => {
    const ed = document.getElementById('editor');
    if (!ed) return { missing: true };
    const row = ed.querySelector('.ed-row[data-line="1"]');
    const name = row && row.querySelector('.ed-name');
    if (!name) return { missing: true };
    name.focus();
    name.value = '基本設計v2';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    return {
      text: document.getElementById('input').value,
      taHidden: document.getElementById('input').hidden,
      focusKept: document.activeElement === name,
      rowCount: ed.querySelectorAll('.ed-row').length,
    };
  }, COMMIT_WAIT);
  r.check('GN-U6（行エディタ: 編集した行だけ変化・カンマ行/コメント/invalid/末尾改行はバイト不変・フォーカス維持）',
    !u6.missing
    && u6.text === '# メモ\n基本設計v2\t2026-08-18\t2026-08-22\nレビュー, 2026/9/1, 3日\n実装\tあした\t5d\n'
    && u6.taHidden === true && u6.focusKept === true && u6.rowCount === 4,
    JSON.stringify(u6));

  /* ========== GN-U7: 終了⇔日数の相互排他・日数の正規化・不正日数は非コミット ========== */
  await setupEditor('A\t2026-08-18\t2026-08-20');
  const u7 = await page.evaluate(async (wait) => {
    const row = document.querySelector('#editor .ed-row[data-line="0"]');
    if (!row) return { missing: true };
    const dur = row.querySelector('.ed-dur'), end = row.querySelector('.ed-end');
    const ta = document.getElementById('input');
    dur.value = '5';
    dur.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const afterDur = { text: ta.value, endCleared: end.value === '' };
    end.value = '2026-08-25';
    end.dispatchEvent(new Event('input', { bubbles: true }));
    end.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const afterEnd = { text: ta.value, durCleared: dur.value === '' };
    dur.value = 'abc';
    dur.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const afterBad = { text: ta.value };
    return { afterDur, afterEnd, afterBad };
  }, COMMIT_WAIT);
  r.check('GN-U7（日数 5 は 5d に正規化し終了をクリア・終了確定で日数をクリア・不正日数はコミットしない）',
    !u7.missing
    && u7.afterDur.text === 'A\t2026-08-18\t5d' && u7.afterDur.endCleared === true
    && u7.afterEnd.text === 'A\t2026-08-18\t2026-08-25' && u7.afterEnd.durCleared === true
    && u7.afterBad.text === 'A\t2026-08-18\t2026-08-25',
    JSON.stringify(u7));

  /* ========== GN-U8: 行追加（末尾・Enter 挿入）・削除・上下移動・フォーカス規則 ========== */
  await setupEditor('A\t2026-08-18\t1d\nB\t2026-08-19\t1d\n');
  const u8 = !editorReady ? { missing: true } : await page.evaluate(async (wait) => {
    const ta = document.getElementById('input');
    const ed = document.getElementById('editor');
    if (!ed || !document.getElementById('add-task')) return { missing: true };
    const nameOf = line => ed.querySelector('.ed-row[data-line="' + line + '"] .ed-name');
    // 末尾追加: 末尾改行の前に挿入され空行が増殖しない・フォーカスは新行の名前
    document.getElementById('add-task').click();
    const afterAdd = {
      text: ta.value,
      focusNewName: document.activeElement === nameOf(2) && nameOf(2) !== null,
    };
    // Enter: A の行の下に挿入
    const nameA = nameOf(0);
    nameA.focus();
    nameA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const afterEnter = { text: ta.value, focusNewName: document.activeElement === nameOf(1) };
    // 削除: 挿入した行を消すと次行（B）の先頭フィールドへ
    ed.querySelector('.ed-row[data-line="1"] .ed-del').click();
    const afterDel = { text: ta.value, focusNext: document.activeElement === nameOf(1) };
    // 下へ: A と B を交換（バイト交換）
    ed.querySelector('.ed-row[data-line="0"] .ed-down').click();
    const afterMove = { text: ta.value };
    return { afterAdd, afterEnter, afterDel, afterMove };
  }, COMMIT_WAIT);
  r.check('GN-U8（末尾追加は空行を増殖させない・Enter は下に挿入・削除は1行だけ・上下は交換・フォーカス規則）',
    !u8.missing
    && u8.afterAdd.text === 'A\t2026-08-18\t1d\nB\t2026-08-19\t1d\n\t\t\n' && u8.afterAdd.focusNewName === true
    && u8.afterEnter.text === 'A\t2026-08-18\t1d\n\t\t\nB\t2026-08-19\t1d\n\t\t\n' && u8.afterEnter.focusNewName === true
    && u8.afterDel.text === 'A\t2026-08-18\t1d\nB\t2026-08-19\t1d\n\t\t\n' && u8.afterDel.focusNext === true
    && u8.afterMove.text === 'B\t2026-08-19\t1d\nA\t2026-08-18\t1d\n\t\t\n',
    JSON.stringify(u8));

  /* ========== GN-U9: date input への値セット＋change（Ctrl+; 相当）で書き戻る ========== */
  await setupEditor('A\t2026-08-18\t1d');
  const u9 = await page.evaluate(async (wait) => {
    const start = document.querySelector('#editor .ed-row[data-line="0"] .ed-start');
    if (!start) return { missing: true };
    start.value = '2026-08-20';
    start.dispatchEvent(new Event('input', { bubbles: true }));
    start.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    return { text: document.getElementById('input').value };
  }, COMMIT_WAIT);
  r.check('GN-U9（date input: 有効値の change で 400ms 後に書き戻る — Ctrl+; と同一経路）',
    !u9.missing && u9.text === 'A\t2026-08-20\t1d',
    JSON.stringify(u9));

  /* ========== GN-U10: 空値は blur でのみ書き戻る・IME 中の Enter は挿入しない ========== */
  await setupEditor('A\t2026-08-18\t1d\nB\t2026-08-20\t1d');
  const u10 = await page.evaluate(async (wait) => {
    const ta = document.getElementById('input');
    const rowB = document.querySelector('#editor .ed-row[data-line="1"]');
    if (!rowB) return { missing: true };
    const start = rowB.querySelector('.ed-start');
    start.focus();
    start.value = '';
    start.dispatchEvent(new Event('input', { bubbles: true }));
    start.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const afterChange = { text: ta.value };
    start.dispatchEvent(new Event('blur', { bubbles: false }));
    await new Promise(d => setTimeout(d, 50));
    const chain = rowB.querySelector('.ed-chain');
    const afterBlur = { text: ta.value, caption: chain ? chain.textContent : null };
    // IME 中の Enter は行を挿入しない
    const nameA = document.querySelector('#editor .ed-row[data-line="0"] .ed-name');
    nameA.focus();
    const before = document.querySelectorAll('#editor .ed-row').length;
    nameA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    const afterIme = { rows: document.querySelectorAll('#editor .ed-row').length, before };
    return { afterChange, afterBlur, afterIme };
  }, COMMIT_WAIT);
  r.check('GN-U10（空値: change では書き戻らず blur で確定・チェーンのキャプション表示・IME 中の Enter 無効）',
    !u10.missing
    && u10.afterChange.text === 'A\t2026-08-18\t1d\nB\t2026-08-20\t1d'
    && u10.afterBlur.text === 'A\t2026-08-18\t1d\nB\t\t1d'
    && u10.afterBlur.caption !== null && u10.afterBlur.caption.includes('08/19')
    && u10.afterIme.rows === u10.afterIme.before,
    JSON.stringify(u10));

  /* ========== GN-U11: エディタ表示中の paste（変換挿入＋再構築 ／ Excel は案内） ========== */
  await setupEditor('A\t2026-08-18\t1d');
  const u11 = !editorReady ? { missing: true } : await page.evaluate(async () => {
    const ed = document.getElementById('editor');
    const ta = document.getElementById('input');
    if (!ed) return { missing: true };
    const paste = text => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    };
    paste('- [ ] 貼り付けタスク 🛫 2026-08-18 📅 2026-08-20');
    await new Promise(d => setTimeout(d, 400));
    const converted = {
      text: ta.value,
      rows: ed.querySelectorAll('.ed-row').length,
    };
    paste('状態\t内容\t開始日\n未着手\tX\t2026-08-18');
    await new Promise(d => setTimeout(d, 400));
    const excel = { text: ta.value, banner: document.getElementById('banner').textContent };
    return { converted, excel };
  });
  r.check('GN-U11（エディタ表示中の paste: tasks.md は変換して末尾挿入＋再構築・Excel 形式は案内）',
    !u11.missing
    && u11.converted.text.includes('A\t2026-08-18\t1d')
    && /%% 取り込み: \d{4}-\d{2}-\d{2}/.test(u11.converted.text)
    && u11.converted.text.includes('貼り付けタスク\t2026-08-18\t2026-08-20')
    && u11.converted.rows >= 3
    && u11.excel.text === u11.converted.text
    && u11.excel.banner.includes('計画をコピー'),
    JSON.stringify(u11));

  /* ========== GN-U12: 幅390pxで全コントロールが可視域内（折返しレイアウト） ========== */
  await setupEditor('基本設計\t2026-08-18\t2026-08-22');
  await page.setViewportSize({ width: 390, height: 800 });
  const u12 = await page.evaluate(() => {
    const noHScroll = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    const row = document.querySelector('#editor .ed-row[data-line="0"]');
    if (!row) return { missing: true };
    const parts = ['.ed-name', '.ed-start', '.ed-end', '.ed-dur', '.ed-del'].map(sel => {
      const el = row.querySelector(sel);
      if (!el) return { sel, missing: true };
      const rc = el.getBoundingClientRect();
      return { sel, left: rc.left, right: rc.right, visible: rc.left >= 0 && rc.right <= window.innerWidth };
    });
    return { noHScroll, parts };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('GN-U12（390px: ページ横スクロールなし・行内の全コントロールが可視域内）',
    !u12.missing && u12.noHScroll === true && u12.parts.every(p => p.visible === true),
    JSON.stringify(u12));

  /* ========== GN-U13: ビューの保存・復元（enum ガード）・500行の上限 ========== */
  await setupEditor('A\t2026-08-18\t1d');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.waitForTimeout(600);
  const u13a = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    if (!ed) return { missing: true };
    return {
      editorVisible: !ed.hidden,
      taHidden: document.getElementById('input').hidden,
      rows: document.querySelectorAll('#editor .ed-row').length,
    };
  });
  // enum ガード: 不正な view 値は**既定（行エディタ）**へ（reload 前に save を止める — verification-notes §4）
  await page.evaluate(() => {
    ToolStorage.save = () => true;
    const env = JSON.parse(localStorage.getItem('tools:gantt'));
    env.data.view = 'bogus';
    localStorage.setItem('tools:gantt', JSON.stringify(env));
  });
  await page.reload();
  await page.waitForTimeout(300);
  const u13b = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    if (!ed) return { missing: true };
    return { editorVisible: !ed.hidden, taHidden: document.getElementById('input').hidden };
  });
  // 500行の上限: 501行では行エディタを開かない
  const u13c = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const ve = document.getElementById('view-editor');
    if (!ed || !ve) return { missing: true };
    const ta = document.getElementById('input');
    ta.value = Array.from({ length: 501 }, (_, i) => 'T' + i + '\t2026-08-18\t1d').join('\n');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ve.click();
    return {
      editorHidden: ed.hidden,
      taVisible: !ta.hidden,
      banner: document.getElementById('banner').textContent,
    };
  });
  r.check('GN-U13（ビュー復元・不正値は既定の行エディタへ・501行はバナーを出してテキストへ落ちる）',
    !u13a.missing && u13a.editorVisible === true && u13a.taHidden === true && u13a.rows === 1
    && !u13b.missing && u13b.editorVisible === true && u13b.taHidden === true
    && !u13c.missing && u13c.editorHidden === true && u13c.taVisible === true && u13c.banner.includes('500'),
    JSON.stringify({ u13a, u13b, u13c }));

  /* ========== GN-U14: スナップショット Undo・鮮度ガード ========== */
  await setupEditor('A\t2026-08-18\t1d\nB\t2026-08-19\t1d');
  const u14 = !editorReady ? { missing: true } : await page.evaluate(async (wait) => {
    const ta = document.getElementById('input');
    const ed = document.getElementById('editor');
    if (!ed || !ed.querySelector('.ed-row[data-line="1"] .ed-del')) return { missing: true };
    // 削除 → Cmd+Z で戻る
    ed.querySelector('.ed-row[data-line="1"] .ed-del').click();
    const afterDel = { text: ta.value };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
    const afterUndo = { text: ta.value, rows: ed.querySelectorAll('.ed-row').length };
    // 鮮度ガード: 外部で textarea を書き換えた直後の古いフィールド編集はスプライスしない
    const staleName = ed.querySelector('.ed-row[data-line="0"] .ed-name');
    ta.value = 'X\t2026-08-18\t1d';
    staleName.value = '壊すつもりの編集';
    staleName.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const afterStale = {
      text: ta.value,
      rebuiltName: (() => {
        const n = ed.querySelector('.ed-row[data-line="0"] .ed-name');
        return n ? n.value : null;
      })(),
    };
    return { afterDel, afterUndo, afterStale };
  }, COMMIT_WAIT);
  r.check('GN-U14（Cmd+Z で削除が戻る・外部書き換え後の編集はスプライスせず再構築 — テキストを壊さない）',
    !u14.missing
    && u14.afterDel.text === 'A\t2026-08-18\t1d'
    && u14.afterUndo.text === 'A\t2026-08-18\t1d\nB\t2026-08-19\t1d' && u14.afterUndo.rows === 2
    && u14.afterStale.text === 'X\t2026-08-18\t1d' && u14.afterStale.rebuiltName === 'X',
    JSON.stringify(u14));

  /* ========== GN-U15: Undo の汚染回帰（GN-Q16）と Undo の粒度 ========== */
  await setupEditor('A\t2026-08-18\t1d\nB\t2026-08-19\t1d');
  const u15 = !editorReady ? { missing: true } : await page.evaluate(async () => {
    const ta = document.getElementById('input');
    const ed = document.getElementById('editor');
    if (!ed || !ed.querySelector('.ed-row[data-line="1"] .ed-del')) return { missing: true };
    const undoZ = async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
      await new Promise(d => setTimeout(d, 100));
    };
    // ① B を削除 → A の開始日をクリア（blur していない = 未コミット）
    ed.querySelector('.ed-row[data-line="1"] .ed-del').click();
    const start = ed.querySelector('.ed-row[data-line="0"] .ed-start');
    start.focus();
    start.value = '';
    start.dispatchEvent(new Event('input', { bubbles: true }));
    start.dispatchEvent(new Event('change', { bubbles: true }));
    // Cmd+Z ①: クリアが戻る（フィールドにも日付が戻る）— 旧実装はここで日付を不可逆に失っていた
    await undoZ();
    const undo1 = {
      text: ta.value,
      field: ed.querySelector('.ed-row[data-line="0"] .ed-start').value,
    };
    // Cmd+Z ②: さらに1手戻ると削除が戻る（旧実装ではここが無効だった）
    await undoZ();
    const undo2 = { text: ta.value, rows: ed.querySelectorAll('.ed-row').length };
    // ③ タイプ直後（デバウンス中）の Cmd+Z は、その入力だけを戻す（それ以前の操作は戻さない）
    const nameA = ed.querySelector('.ed-row[data-line="0"] .ed-name');
    nameA.focus();
    nameA.value = 'A改';
    nameA.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 100));
    await undoZ();
    const undo3 = { text: ta.value };
    return { undo1, undo2, undo3 };
  });
  r.check('GN-U15（1手ずつ戻り何も失われない: クリア→削除の順に復元・タイプ直後の Cmd+Z はその入力だけ）',
    !u15.missing
    && u15.undo1.text === 'A\t2026-08-18\t1d' && u15.undo1.field === '2026-08-18'
    && u15.undo2.text === 'A\t2026-08-18\t1d\nB\t2026-08-19\t1d' && u15.undo2.rows === 2
    && u15.undo3.text === 'A\t2026-08-18\t1d\nB\t2026-08-19\t1d',
    JSON.stringify(u15));

  /* ========== GN-U16: 構造操作の鮮度ガード・日数上限・赤枠の解除・500行ちょうど ========== */
  await setupEditor('A\t2026-08-18\t1d\n大事な行2\t2026-08-19\t1d\nC\t2026-08-20\t1d');
  const u16 = !editorReady ? { missing: true } : await page.evaluate(async (wait) => {
    const ta = document.getElementById('input');
    const ed = document.getElementById('editor');
    if (!ed) return { missing: true };
    // ① 外部書き換え後に古い DOM の × を押しても、別の行を消さない
    ta.value = 'X\t2026-08-18\t1d\nY\t2026-08-19\t1d\nZ\t2026-08-20\t1d';
    ed.querySelector('.ed-row[data-line="1"] .ed-del').click();
    const stale = { text: ta.value, rows: ed.querySelectorAll('.ed-row').length };
    // ② 日数に日付を打つ誤入力は非コミット＋赤枠 → 終了日を確定すると赤枠が消える
    const row = ed.querySelector('.ed-row[data-line="0"]');
    const dur = row.querySelector('.ed-dur'), end = row.querySelector('.ed-end');
    dur.value = '20260818';
    dur.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const capped = { text: ta.value, bad: dur.classList.contains('ed-bad') };
    end.value = '2026-08-25';
    end.dispatchEvent(new Event('input', { bubbles: true }));
    end.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    const cleared = { badAfter: dur.classList.contains('ed-bad'), durValue: dur.value };
    // ③ テキスト経路も上限で warn（営業日ウォークを回さない）
    const built = window.gantt.buildDsl('A\t2026-08-18\t20260818d', { excludeWeekends: true });
    // ④ 500行ちょうど（末尾改行つき）は行エディタが開く
    document.getElementById('view-text').click();
    ta.value = Array.from({ length: 500 }, (_, i) => 'T' + i + '\t2026-08-18\t1d').join('\n') + '\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('view-editor').click();
    const at500 = { editorVisible: !ed.hidden, rows: ed.querySelectorAll('.ed-row').length };
    return { stale, capped, cleared, built, at500 };
  }, COMMIT_WAIT);
  r.check('GN-U16（構造操作の鮮度ガード・日数上限は非コミット/warn・排他で赤枠解除・500行ちょうどは開く）',
    !u16.missing
    && u16.stale.text === 'X\t2026-08-18\t1d\nY\t2026-08-19\t1d\nZ\t2026-08-20\t1d'
    && u16.capped.text === u16.stale.text && u16.capped.bad === true
    && u16.cleared.badAfter === false && u16.cleared.durValue === ''
    && u16.built.dsl === null && u16.built.warnings.length === 1
    && u16.built.warnings[0].includes('3650')
    && u16.at500.editorVisible === true && u16.at500.rows === 500,
    JSON.stringify(u16));

  /* ========== GN-U17: 型変更の再構築でクリックが飲まれない（実マウス — GN-Q17） ========== */
  await setupEditor('こわれた行\tx\nB\t2026-08-19\t1d');
  const u17ok = await page.evaluate(async (wait) => {
    const raw = document.querySelector('#editor .ed-row[data-line="0"] .ed-raw');
    if (!raw) return false;
    raw.focus();
    raw.value = '直した\t2026-08-18\t1d';
    raw.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, wait));
    return true;
  }, COMMIT_WAIT);
  if (u17ok) await page.click('#editor .ed-row[data-line="1"] .ed-del');   // 実マウス（mousedown→blur→mouseup）
  await page.waitForTimeout(200);
  const u17 = !u17ok ? { missing: true } : await page.evaluate(() => ({
    text: document.getElementById('input').value,
    rows: document.querySelectorAll('#editor .ed-row').length,
  }));
  r.check('GN-U17（invalid を直した直後の実マウスクリックが1回で効く — 再構築を遅延）',
    !u17.missing && u17.text === '直した\t2026-08-18\t1d' && u17.rows === 1,
    JSON.stringify(u17));

  /* ========== GN-U18: 再構築起因の blur がテキストを汚染しない（GN-Q16 — 鮮度ガードの検出器） ========== */
  await setupEditor('A\t2026-08-18\t1d\nB\t2026-08-19\t1d');
  const u18 = !editorReady ? { missing: true } : await page.evaluate(async () => {
    const ed = document.getElementById('editor');
    const start = ed && ed.querySelector('.ed-row[data-line="0"] .ed-start');
    if (!start) return { missing: true };
    // 空にした date にフォーカスを残したまま、外部書き換え経路（サンプル投入）で再構築させる
    start.focus();
    start.value = '';
    start.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('sample-btn').click();
    await new Promise(d => setTimeout(d, 300));
    return {
      domRows: ed.querySelectorAll('.ed-row').length,
      lines: document.getElementById('input').value.split('\n').length,
      text0: document.getElementById('input').value.split('\n')[0],
    };
  });
  r.check('GN-U18（再構築中の blur がテキストを汚染しない: 鮮度ガードが古い行の書き込みを弾く）',
    !u18.missing && u18.domRows === 6 && u18.lines === 6 && u18.text0 === '## 設計フェーズ',
    JSON.stringify(u18));

  // 後続テストのためテキストビューへ戻す
  await page.evaluate(() => {
    const vt = document.getElementById('view-text');
    if (vt) vt.click();
  });


  /* ========== GN-U19: md リストの書き味（lib/edit.js の {mdList:true}） ========== */
  const u19g = await page.evaluate(() => {
    if (!window.ToolEdit || !window.ToolEdit.listItem) return { missing: true };
    const ta = document.getElementById('input');
    const key = k => {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      ta.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    ta.value = '- 基本設計';
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    const prevented = key('Enter');
    const cont = ta.value;
    ta.value = '- ';
    ta.selectionStart = ta.selectionEnd = 2;
    key('Enter');
    return { prevented, cont, exit: ta.value };
  });
  r.check('GN-U19（箇条書きの行末 Enter で記号が続く・空項目では外れる）',
    !u19g.missing && u19g.prevented === true
    && u19g.cont === '- 基本設計\n- ' && u19g.exit === '',
    JSON.stringify(u19g));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  await page.click('ul.tool-list .tool-name:text-is("Draw Gantt")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「PM」から遷移でき title が命名規約どおり',
    hubTitle === 'Draw Gantt (gantt)', hubTitle);

  await browser.close();
  r.report('gantt（docs/specs/gantt.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
