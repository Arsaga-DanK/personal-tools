'use strict';
/* 目的: docs/specs/ddl2spec.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/ddl2spec.js  /  ./test/run ddl2spec

   照合するID: DS-01〜19
   仕様の正本は docs/specs/ddl2spec.md。期待値を変えるときは spec を先に直す。

   クリップボードは壊さない: navigator.clipboard.writeText をスタブして出力だけ捕捉する。 */

const { launch, fileUrl, createRunner, eq, bannerIs } = require('./helpers');

// spec の fixture（実務に近い DDL: 複合PK・FK・CHECK・複合UNIQUE・DEFAULT now()・日本語コメント）
const DDL = [
  'create table if not exists public.customer (',
  '  id bigserial not null,',
  '  code varchar(20) not null,',
  '  kind numeric(10,2) default 0.00,',
  "  status text not null check (status in ('active','closed')),",
  '  dept_id bigint references public.dept (id),',
  '  created_at timestamptz not null default now(),',
  '  constraint customer_pkey primary key (id, code),',
  '  constraint uq_code unique (code, kind)',
  ');',
  "comment on table public.customer is '顧客マスタ';",
  "comment on column public.customer.id is '顧客ID';",
  "comment on column public.customer.code is '顧客コード';",
].join('\n');

const SPEC = [
  '## public.customer（顧客マスタ）',
  '',
  '| 論理名 | 物理名 | 型 | 桁 | NOT NULL | 既定値 | PK | UNIQUE | FK | CHECK |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| 顧客ID | id | bigserial |  | ○ |  | ○ |  |  |  |',
  '| 顧客コード | code | varchar | 20 | ○ |  | ○ | uq_code |  |  |',
  '|  | kind | numeric | 10,2 |  | 0.00 |  | uq_code |  |  |',
  "|  | status | text |  | ○ |  |  |  |  | status in ('active', 'closed') |",
  '|  | dept_id | bigint |  |  |  |  |  | public.dept.id |  |',
  '|  | created_at | timestamptz |  | ○ | now() |  |  |  |  |',
  '',
  '### 表制約',
  '- CONSTRAINT customer_pkey PRIMARY KEY (id, code)',
  '- CONSTRAINT uq_code UNIQUE (code, kind)',
].join('\n');

const GENERATED_DDL = [
  'CREATE TABLE public.customer (',
  '  id bigserial NOT NULL,',
  '  code varchar(20) NOT NULL,',
  '  kind numeric(10,2) DEFAULT 0.00,',
  "  status text NOT NULL CHECK (status in ('active', 'closed')),",
  '  dept_id bigint REFERENCES public.dept (id),',
  '  created_at timestamptz NOT NULL DEFAULT now(),',
  '  CONSTRAINT customer_pkey PRIMARY KEY (id, code),',
  '  CONSTRAINT uq_code UNIQUE (code, kind)',
  ');',
  "COMMENT ON TABLE public.customer IS '顧客マスタ';",
  "COMMENT ON COLUMN public.customer.id IS '顧客ID';",
  "COMMENT ON COLUMN public.customer.code IS '顧客コード';",
].join('\n');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/ddl2spec.html'));
  // 前回セッションの tools:ddl2spec が残っていると復元済み入力で偽 fail する。
  // reload 時の pagehide フラッシュが消した値を書き戻すので、保存を止めてから消す（verification-notes §4）
  await page.evaluate(() => { window.ToolStorage.save = () => true; localStorage.clear(); });
  await page.reload();

  const call = (fn, arg) => page.evaluate(([f, a]) => window.ddl2spec[f](a), [fn, arg]);

  /* ========== DS-01: DDL → 定義書 ========== */
  const s01 = await call('ddlToSpec', DDL);
  r.check('DS-01（DDL → 定義書: 論理名・型・桁・PK・UNIQUE・FK・CHECK・表制約）',
    s01.ok && s01.value === SPEC && eq(s01.warnings, []),
    JSON.stringify({ ok: s01.ok, warnings: s01.warnings, diff: s01.value === SPEC ? '' : s01.value }));

  /* ========== DS-02: 定義書 → DDL ========== */
  const s02 = await call('specToDdl', SPEC);
  r.check('DS-02（定義書 → DDL: 型と桁を復元・制約名を保つ・COMMENT を生成）',
    s02.ok && s02.value === GENERATED_DDL && eq(s02.warnings, []),
    JSON.stringify({ warnings: s02.warnings, value: s02.value === GENERATED_DDL ? '' : s02.value }));

  /* ========== DS-03: 往復 ========== */
  const s03 = await page.evaluate((ddl) => {
    const d = window.ddl2spec;
    const a = d.ddlToSpec(ddl);
    const b = d.specToDdl(a.value);
    const c = d.ddlToSpec(b.value);
    const e = d.specToDdl(c.value);
    return { spec1: a.value, spec2: c.value, ddl1: b.value, ddl2: e.value };
  }, DDL);
  r.check('DS-03（往復: 定義書と DDL が2周目で完全一致＝意味が保たれる）',
    s03.spec1 === s03.spec2 && s03.ddl1 === s03.ddl2,
    JSON.stringify({ specSame: s03.spec1 === s03.spec2, ddlSame: s03.ddl1 === s03.ddl2 }));

  /* ========== DS-04: ヘッダー列順を入れ替える ========== */
  const reordered = (() => {
    const lines = SPEC.split('\n');
    const order = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // 逆順
    const remap = line => {
      if (!line.startsWith('|')) return line;
      const cells = line.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(' | ');
      if (cells.length !== 10) return line;
      return '| ' + order.map(i => cells[i]).join(' | ') + ' |';
    };
    return lines.map(remap).join('\n');
  })();
  const s04 = await call('specToDdl', reordered);
  r.check('DS-04（ヘッダー列順を逆にしても同じ DDL が出る）',
    s04.ok && s04.value === GENERATED_DDL && eq(s04.warnings, []),
    JSON.stringify({ warnings: s04.warnings, same: s04.value === GENERATED_DDL }));

  /* ========== DS-05: 認識できないヘッダー ========== */
  const s05 = await call('specToDdl',
    '## t\n\n| 物理名 | 型 | 備考 |\n|---|---|---|\n| a | int | メモ |');
  r.check('DS-05（認識できない列は警告に出て、他の列は変換される）',
    s05.ok && s05.value === 'CREATE TABLE t (\n  a int\n);'
    && eq(s05.warnings, ['認識できない列: 備考']),
    JSON.stringify(s05));

  /* ========== DS-06: 解釈できない構文 ========== */
  const s06 = await call('ddlToSpec',
    'create table t (a int) partition by range (a);\ncreate index ix on t (a);');
  r.check('DS-06（PARTITION BY と CREATE INDEX は警告に出て列定義は変換される）',
    s06.ok && s06.value.includes('| a | int |')
    && s06.warnings.length === 2
    && s06.warnings[0].includes('partition by range')
    && s06.warnings[1].includes('create index'),
    JSON.stringify(s06.warnings));

  /* ========== DS-07: 複数テーブル ========== */
  const s07 = await call('ddlToSpec',
    "create table a (x int);\ncreate table b (y int);\ncomment on table b is 'B表';");
  r.check('DS-07（2テーブル・COMMENT が正しいテーブルに紐づく）',
    s07.ok && s07.value.includes('## a\n') && s07.value.includes('## b（B表）')
    && !s07.value.includes('## a（'),
    JSON.stringify(s07.value.split('\n').filter(l => l.startsWith('##'))));

  /* ========== DS-08: 空入力 ========== */
  const s08a = await call('ddlToSpec', '');
  const s08b = await call('specToDdl', '');
  r.check('DS-08（空入力は両方向で ok・出力空・警告0件）',
    s08a.ok && s08a.value === '' && eq(s08a.warnings, [])
    && s08b.ok && s08b.value === '' && eq(s08b.warnings, []),
    JSON.stringify([s08a, s08b]));

  /* ========== DS-09: 壊れた入力 ========== */
  const s09 = await page.evaluate(() => {
    const d = window.ddl2spec;
    const safe = (fn, src) => { try { return fn(src); } catch (e) { return { threw: String(e.message) }; } };
    return {
      unterm: safe(d.ddlToSpec, "create table t (a text default 'x"),
      paren: safe(d.ddlToSpec, 'create table t (a int'),
      typo: safe(d.ddlToSpec, 'create tabl x (a int);'),
    };
  });
  r.check('DS-09（壊れた入力で例外を投げない・未終端は ok:false・その他は警告）',
    !s09.unterm.threw && s09.unterm.ok === false && s09.unterm.line === 1
    && !s09.paren.threw && s09.paren.ok === true
    && s09.paren.warnings.some(w => w.includes('括弧が閉じていません'))
    && !s09.typo.threw && s09.typo.ok === true
    && s09.typo.warnings.some(w => w.includes('解釈しませんでした')),
    JSON.stringify(s09));

  /* ========== DS-10: 性能ガード ========== */
  const s10 = await page.evaluate(() => {
    const inp = document.getElementById('input');
    inp.value = 'a'.repeat(200001);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('to-spec').click();
    const b = document.getElementById('banner');
    return { shown: !b.hidden, text: b.textContent, out: document.getElementById('output').value };
  });
  r.check('DS-10（20万文字超は処理せず理由を表示）',
    s10.shown && s10.text.includes('上限（20万文字）') && s10.out === '', JSON.stringify(s10));

  /* ========== DS-11: CHECK 内の | ========== */
  const s11 = await page.evaluate(() => {
    const d = window.ddl2spec;
    const spec = d.ddlToSpec('create table t (a text, b text check (a || b is not null));');
    const back = d.specToDdl(spec.value);
    return { spec: spec.value, back: back.value };
  });
  r.check('DS-11（CHECK 内の | はセルで \\| にエスケープされ往復で復元される）',
    s11.spec.includes('a \\|\\| b is not null')
    && s11.back.includes('CHECK (a || b is not null)'),
    JSON.stringify(s11));

  /* ========== DS-12: 複合 UNIQUE の制約名 ========== */
  const s12 = await page.evaluate((ddl) => {
    const d = window.ddl2spec;
    const spec = d.ddlToSpec(ddl);
    const back = d.specToDdl(spec.value);
    return {
      hasName: spec.value.includes('- CONSTRAINT uq_code UNIQUE (code, kind)'),
      cellName: spec.value.includes('| uq_code |'),
      ddlOnce: (back.value.match(/uq_code/g) || []).length,
      ddlHas: back.value.includes('CONSTRAINT uq_code UNIQUE (code, kind)'),
    };
  }, DDL);
  r.check('DS-12（複合 UNIQUE の制約名が往復で保たれ、二重に出ない）',
    s12.hasName && s12.cellName && s12.ddlHas && s12.ddlOnce === 1, JSON.stringify(s12));

  /* ========== DS-13: 真偽セルの表記ゆれ ========== */
  const s13 = await page.evaluate(() => {
    const d = window.ddl2spec;
    const mk = v => '## t\n\n| 物理名 | 型 | NOT NULL |\n|---|---|---|\n| a | int | ' + v + ' |';
    const notNull = v => d.parseSpec(mk(v)).value.tables[0].columns[0].notNull;
    return {
      trues: ['○', '✓', 'Y', '1', 'yes'].map(notNull),
      falses: ['', '-', '×', 'N', '0'].map(notNull),
      unknown: d.parseSpec(mk('要')).warnings,
    };
  });
  r.check('DS-13（真偽セルの表記ゆれ・不明値は警告して false にしたことを知らせる）',
    s13.trues.every(v => v === true) && s13.falses.every(v => v === false)
    && s13.unknown.length === 1 && s13.unknown[0].includes('真偽値として解釈できません: 要'),
    JSON.stringify(s13));

  /* ========== DS-14: 反転ヘッダー ========== */
  const s14 = await call('specToDdl',
    '## t\n\n| 物理名 | 型 | NULL許可 |\n|---|---|---|\n| a | int | ○ |');
  r.check('DS-14（NULL許可 は解釈せず警告・NOT NULL を反転しない）',
    s14.ok && s14.value === 'CREATE TABLE t (\n  a int\n);'
    && s14.warnings.length === 1 && s14.warnings[0].includes('意味が反転する'),
    JSON.stringify(s14));

  /* ========== DS-15: 識別子の畳み込み警告 ========== */
  const s15 = await call('specToDdl', '## t\n\n| 物理名 | 型 |\n|---|---|\n| CustomerCode | int |');
  r.check('DS-15（大文字を含む未引用識別子に警告）',
    s15.ok && s15.warnings.some(w => w.includes('CustomerCode') && w.includes('小文字に畳まれます')),
    JSON.stringify(s15.warnings));

  /* ========== DS-16: Excel 用コピー（TSV） ========== */
  const s16 = await page.evaluate((ddl) => {
    const captured = [];
    // 実クリップボードを壊さないためスタブする
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: t => { captured.push(t); return Promise.resolve(); } },
    });
    const inp = document.getElementById('input');
    inp.value = ddl;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('to-spec').click();
    document.getElementById('copy-tsv').click();
    return new Promise(res => setTimeout(() => res({
      captured, rows: captured[0] ? captured[0].split('\n') : [],
    }), 60));
  }, DDL);
  r.check('DS-16（TSV のヘッダーと1行目・実クリップボードには書かない）',
    s16.captured.length === 1
    && s16.rows[0] === '論理名\t物理名\t型\t桁\tNOT NULL\t既定値\tPK\tUNIQUE\tFK\tCHECK'
    && s16.rows[1] === '顧客ID\tid\tbigserial\t\t○\t\t○\t\t\t'
    && s16.rows.length === 7,
    JSON.stringify(s16.rows));

  /* ========== DS-17: サンプル投入と Cmd+Enter コピー ========== */
  await page.goto(fileUrl('web/ddl2spec.html'));
  await page.evaluate(() => { window.ToolStorage.save = () => true; localStorage.clear(); });
  await page.reload();
  const s17 = await page.evaluate(async () => {
    const captured = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: t => { captured.push(t); return Promise.resolve(); } },
    });
    const before = !document.getElementById('sample').hidden;
    document.getElementById('sample').click();
    await new Promise(d => setTimeout(d, 60));
    const after = !document.getElementById('sample').hidden;
    const out = document.getElementById('output').value;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    await new Promise(d => setTimeout(d, 60));
    return { before, after, hasTable: out.includes('| 論理名 |'), copied: captured.length, sameAsOut: captured[0] === out };
  });
  r.check('DS-17（サンプルは空のときだけ表示・投入で変換される・Cmd+Enter で出力をコピー）',
    s17.before === true && s17.after === false && s17.hasTable
    && s17.copied === 1 && s17.sameAsOut === true, JSON.stringify(s17));

  /* ========== DS-18: 共有 lexer が読めている ========== */
  const s18 = await page.evaluate(() => {
    const t = window.SqlLex.tokenize("select $$ a 'b' $$ /* x /* y */ z */ 1");
    return {
      hasSqlLex: typeof window.SqlLex === 'object',
      dollar: t.tokens.filter(x => x.t === 'dollar').map(x => x.v),
      block: t.tokens.filter(x => x.t === 'blockComment').map(x => x.v),
    };
  });
  r.check('DS-18（lib/sql.js が読めていてドル引用符・入れ子コメントが各1トークン）',
    s18.hasSqlLex && eq(s18.dollar, ["$$ a 'b' $$"]) && eq(s18.block, ['/* x /* y */ z */']),
    JSON.stringify(s18));

  /* ========== DS-20: 成功バナーが success の見た目になる ==========
     .banner-success の CSS 規則が無く、成功が中立の灰色で出ていた（2026-08-07 に発見）。
     判定は helpers の bannerIs（クラス名だけでなく算出スタイルと role まで見る） */
  await page.evaluate(async () => {
    document.getElementById('input').value = 'create table t (a int);';
    document.getElementById('to-spec').click();
    navigator.clipboard.writeText = () => Promise.resolve();   // 実クリップボードに書かない
    document.getElementById('copy').click();
    await new Promise(r => setTimeout(r, 30));
  });
  const s20 = await bannerIs(page, '#banner', 'success', 'コピーしました');
  r.check('DS-20（コピー成功のバナーが success の見た目・role=status）', s20.ok, s20.detail);

  /* ========== DS-21: 変換後に入力を編集したら、古い出力をコピーさせない ========== */
  await page.evaluate(() => {
    window.__cap = [];
    navigator.clipboard.writeText = t => { window.__cap.push(t); return Promise.resolve(); };
    const inp = document.getElementById('input');
    inp.value = 'create table t (a int);';
    document.getElementById('to-spec').click();
    // 入力を編集（再変換はしない）→ 出力は編集前の内容のまま
    inp.value = 'create table t (a int, b text);';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('copy').click();
  });
  await page.waitForTimeout(30);
  const s21warn = await bannerIs(page, '#banner', 'warn',
    '入力が変更されています。再変換してからコピーしてください');
  const s21 = await page.evaluate(async () => {
    document.getElementById('copy-tsv').click();
    await new Promise(d => setTimeout(d, 30));
    const tsvBlocked = document.getElementById('banner').textContent;
    const blockedCount = window.__cap.length;              // 2経路とも書かれていない
    // 再変換すればコピーできる
    document.getElementById('to-spec').click();
    document.getElementById('copy').click();
    await new Promise(d => setTimeout(d, 30));
    const afterRerun = window.__cap.length;
    const sameAsOut = window.__cap[0] === document.getElementById('output').value;
    // 変換失敗後は Excel用TSV も無効（古いモデルを黙って渡さない）
    document.getElementById('input').value = "create table t (a text default 'x);"; // 未終端 → {ok:false}
    document.getElementById('to-spec').click();
    document.getElementById('copy-tsv').click();
    await new Promise(d => setTimeout(d, 30));
    const tsvAfterFail = document.getElementById('banner').textContent;
    return { tsvBlocked, blockedCount, afterRerun, sameAsOut,
      tsvAfterFail, finalCount: window.__cap.length };
  });
  r.check('DS-21（入力編集後はコピーせず警告・再変換でコピー可・変換失敗後は TSV も無効）',
    s21warn.ok && s21.blockedCount === 0 && s21.tsvBlocked.includes('再変換')
    && s21.afterRerun === 1 && s21.sameAsOut === true
    && s21.tsvAfterFail.includes('先に変換を実行してください') && s21.finalCount === 1,
    JSON.stringify([s21warn.detail, s21]));

  /* ========== DS-22: pagehide でフラッシュ保存（500ms のデバウンスを待たない） ========== */
  await page.goto(fileUrl('web/ddl2spec.html'));
  await page.evaluate(() => { window.ToolStorage.save = () => true; localStorage.clear(); });
  await page.reload();
  const s22 = await page.evaluate(() => {
    const inp = document.getElementById('input');
    inp.value = 'create table flush_test (a int);';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));   // デバウンス中にページを閉じる相当
    const raw = localStorage.getItem('tools:ddl2spec');
    const saved = raw ? JSON.parse(raw) : null;
    return { savedInput: saved && saved.data ? saved.data.input : null };
  });
  r.check('DS-22（pagehide で入力がフラッシュ保存される）',
    s22.savedInput === 'create table flush_test (a int);', JSON.stringify(s22));

  /* ========== DS-19: ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const s19cat = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.category-title')).map(e => e.textContent));
  await page.click('ul.tool-list a:text-is("Schema")');
  await page.waitForLoadState('load');
  const s19title = await page.title();
  r.check('DS-19（ハブに「設計」カテゴリが出て Schema から遷移できる）',
    s19cat.includes('設計') && s19title === 'Schema (ddl2spec)',
    JSON.stringify([s19cat, s19title]));

  await browser.close();
  r.report('ddl2spec（docs/specs/ddl2spec.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
