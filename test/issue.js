'use strict';
/* 目的: docs/specs/issue.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/issue.js  /  ./test/run issue

   照合するID: IS-01〜18（純関数）＋ IS-U1〜U19（UI 経路・FSA 書き込み・入力ウィザード）＋ハブ導線
   仕様の正本は docs/specs/issue.md。期待値を変えるときは spec を先に直す。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

const SAMPLE_MD = [
  '# 本番停止手順書',
  '',
  '## 1. ゴール',
  '- 運営チームが自分たちだけで本番を停止できる手順書を出す',
  '',
  '## 2. 論点',
  '- 手順書が書けないのは情報不足ではなく、完成度の合意が無いからではないか',
  '',
  '## 3. 不明点',
  '- どの粒度なら実行できるかを聞く',
  '- サービス一覧を調べる',
  '',
  '## 4. リスク',
  '- アクセス日程が動くと全部ずれる',
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

  if (ready) {
    /* ========== IS-01〜04: parseSections ========== */
    const p = await page.evaluate(s => ({
      basic: window.issue.parseSections(s),
      loose: window.issue.parseSections(
        '## ゴール\nG\n**2. 論点**\nR\n3. 不明点：\nF\n#### リスク\nK\n## 5. 次の一手\nN'),
      alias: window.issue.parseSections('## 2. イシュー\n- これが論点'),
      none: window.issue.parseSections('なぜ？\n  └ なぜ？\n     └ だから'),
      titled: window.issue.parseSections('# タイトル行\n本文\n## 2. 論点\n- X'),
    }), SAMPLE_MD);

    r.check('IS-01（5セクションに分解され行頭の "- " が落ちる）',
      eq(p.basic.goal, ['運営チームが自分たちだけで本番を停止できる手順書を出す'])
      && eq(p.basic.issue, ['手順書が書けないのは情報不足ではなく、完成度の合意が無いからではないか'])
      && p.basic.unknowns.length === 2
      && eq(p.basic.risks, ['アクセス日程が動くと全部ずれる'])
      && eq(p.basic.next, ['粒度を確認する']),
      JSON.stringify(p.basic));

    r.check('IS-02（見出しの揺れと別名「イシュー」を認識する）',
      eq(p.loose.goal, ['G']) && eq(p.loose.issue, ['R']) && eq(p.loose.unknowns, ['F'])
      && eq(p.loose.risks, ['K']) && eq(p.loose.next, ['N'])
      && eq(p.alias.issue, ['これが論点']),
      JSON.stringify([p.loose, p.alias]));

    r.check('IS-03（見出しが無ければ全行が rest・他は空）',
      p.none.rest.length === 3 && p.none.goal.length === 0 && p.none.issue.length === 0,
      JSON.stringify(p.none));

    r.check('IS-04（先頭の "# " は title に入り rest には入らない）',
      p.titled.title === 'タイトル行' && !p.titled.rest.includes('# タイトル行')
      && p.titled.rest.includes('本文'),
      JSON.stringify(p.titled));

    /* ========== IS-05〜10: judge ========== */
    const j = await page.evaluate(() => {
      const ids = res => res.map(x => x.id);
      const lv = (res, id) => (res.find(x => x.id === id) || {}).level;
      const bad = window.issue.judge('現状を整理し、今後の進め方の確認をする。', {});
      const why = window.issue.judge('なぜ手順書が書けないのか', {});
      const good = window.issue.judge(
        '手順書が書けないのは情報不足ではなく、完成度の合意が無いからではないか',
        { deadline: '2026-09-30', unknowns: ['粒度を聞く'] });
      const empty = window.issue.judge('', {});
      const noDl = window.issue.judge('Aは B ではなく C ではないか', {});
      const multi = window.issue.judge(['一行目はこう', '二行目もある'],
        { deadline: '2026-09-30', unknowns: ['x'] });
      const taigen = window.issue.judge('本番環境の調査', { deadline: '2026-09-30', unknowns: ['x'] });
      return {
        bad: ids(bad), why: ids(why), good: ids(good), goodWarn: good.filter(x => x.level === 'warn').length,
        empty: ids(empty), emptyLv: lv(empty, 'empty'),
        noDl: ids(noDl),
        multiLv: lv(multi, 'multiline'), subjLv: lv(taigen, 'subject'),
        taigen: ids(taigen),
      };
    });

    r.check('IS-05（9/24 の実例「現状を整理し…確認をする」が worktheme で warn）',
      j.bad.includes('worktheme'), JSON.stringify(j.bad));
    r.check('IS-06（「なぜ」で始まると why が warn）',
      j.why.includes('why'), JSON.stringify(j.why));
    r.check('IS-07（よい論点＋締切＋不明点ありなら warn 0件・compare/subject も出ない）',
      j.goodWarn === 0 && !j.good.includes('compare') && !j.good.includes('subject'),
      JSON.stringify(j.good));
    r.check('IS-08（空の論点は empty が warn）',
      j.empty.includes('empty') && j.emptyLv === 'warn', JSON.stringify(j.empty));
    r.check('IS-09（締切なし・不明点0件でそれぞれ warn）',
      j.noDl.includes('deadline') && j.noDl.includes('evidence'), JSON.stringify(j.noDl));
    r.check('IS-10（multiline と subject は info であって warn にしない）',
      j.multiLv === 'info' && j.subjLv === 'info', JSON.stringify([j.multiLv, j.subjLv, j.taigen]));

    /* ========== IS-11〜13: toNote ========== */
    const n = await page.evaluate(s => {
      const parsed = window.issue.parseSections(s);
      const note = window.issue.toNote(parsed,
        { deadline: '2026-09-30', today: '2026-09-24', title: parsed.title });
      const dug = window.issue.toNote(window.issue.parseSections('掘った内容だけ'),
        { deadline: '', today: '2026-09-24', title: '' });
      const bare = window.issue.toNote(window.issue.parseSections('## 2. 論点\n- X'),
        { deadline: '', today: '2026-09-24', title: '' });
      return { note, dug, bare };
    }, SAMPLE_MD);

    r.check('IS-11（frontmatter＋H1＋5見出し。空セクションも見出しは残る）',
      n.note.startsWith('---\n') && n.note.includes('created: 2026-09-24')
      && n.note.includes('deadline: 2026-09-30') && n.note.includes('status: open')
      && n.note.includes('tags: [issue]') && n.note.includes('# 本番停止手順書')
      && ['## 1. ゴール', '## 2. 論点', '## 3. 不明点', '## 4. リスク', '## 5. 次の一手']
        .every(h => n.note.includes(h))
      && ['## 1. ゴール', '## 3. 不明点', '## 4. リスク', '## 5. 次の一手']
        .every(h => n.bare.includes(h)),
      n.note.slice(0, 200));

    r.check('IS-12（rest があれば末尾に「## 掘ったログ」として残す）',
      n.dug.includes('## 掘ったログ') && n.dug.includes('掘った内容だけ'),
      n.dug);

    r.check('IS-13（不明点は表の行になり「聞く/調べる」を2列目に検出）',
      /\|\s*どの粒度なら実行できるかを聞く\s*\|\s*聞く\s*\|/.test(n.note)
      && /\|\s*サービス一覧を調べる\s*\|\s*調べる\s*\|/.test(n.note),
      (n.note.split('## 3. 不明点')[1] || '').slice(0, 300));

    /* ========== IS-14〜15: toTasks ========== */
    const t = await page.evaluate(() => ({
      plain: window.issue.toTasks(['粒度を確認する'], { deadline: '2026-09-30' }),
      already: window.issue.toTasks(['- [ ] 既にタスク記法'], {}),
      noDl: window.issue.toTasks(['素の行'], {}),
    }));
    r.check('IS-14（Tasks 記法＋締切の絵文字が付く）',
      t.plain.trim() === '- [ ] 粒度を確認する 📅 2026-09-30', JSON.stringify(t.plain));
    r.check('IS-15（既に "- [ ]" なら二重に付けない）',
      t.already.trim() === '- [ ] 既にタスク記法' && t.noDl.trim() === '- [ ] 素の行',
      JSON.stringify([t.already, t.noDl]));

    /* ========== IS-16: ファイル名（vault-rules の命名規則 YYYY-MM-DD_トピック.md） ========== */
    const fn2 = await page.evaluate(() => ({
      normal: window.issue.noteFileName('本番停止手順書', '2026-09-24'),
      empty: window.issue.noteFileName('', '2026-09-24'),
      dirty: window.issue.noteFileName('A/B:C*D?E"F<G>H|I', '2026-09-24'),
    }));
    r.check('IS-16（YYYY-MM-DD_<タイトル>.md・空は無題・禁止文字は - に置換）',
      fn2.normal === '2026-09-24_本番停止手順書.md'
      && fn2.empty === '2026-09-24_無題.md'
      && fn2.dirty === '2026-09-24_A-B-C-D-E-F-G-H-I.md',
      JSON.stringify(fn2));

    /* ========== IS-17/18: ウィザードの下書き → md ========== */
    const w = await page.evaluate(() => {
      const md = window.issue.buildMd({
        milestone: '運営チームが本番を止められる状態', milestoneDue: '2026-10-02',
        issue: '情報不足ではなく合意が無いからではないか', issueDue: '2026-09-30',
        unknowns: [{ what: '粒度', way: '聞く', who: '柳葉さん', due: '2026-09-30' }],
        risks: '日程が動く',
        next: '粒度を確認する', nextDue: '2026-10-02',
      });
      const through = window.issue.toNote(
        window.issue.parseSections('## 3. 不明点\n| a | 聞く | b | c |'),
        { deadline: '', today: '2026-09-24', title: 'x' });
      return { md: md, through: through };
    });
    r.check('IS-17（buildMd: 5見出し・マイルストーンの期限・不明点は表の行・次の一手はタスク記法）',
      ['## 1. ゴール', '## 2. 論点', '## 3. 不明点', '## 4. リスク', '## 5. 次の一手']
        .every(h => w.md.includes(h))
      && w.md.includes('- 運営チームが本番を止められる状態（マイルストーン: 2026-10-02）')
      && w.md.includes('| 粒度 | 聞く | 柳葉さん | 2026-09-30 |')
      && w.md.includes('- [ ] 粒度を確認する \u{1F4C5} 2026-10-02'),
      w.md);
    r.check('IS-18（toNote は「|」始まりの不明点をそのまま通す — ウィザードの行を壊さない）',
      w.through.includes('| a | 聞く | b | c |')
      && (w.through.match(/\| a \|/g) || []).length === 1,
      (w.through.split('## 3. 不明点')[1] || '').slice(0, 220));
  }

  /* ========== UI 経路 ========== */
  const setValue = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);

  /* IS-U1: 貼る → 判定と md が出る */
  await setValue('#input', SAMPLE_MD);
  await page.waitForTimeout(400);
  const u1 = await page.evaluate(() => ({
    items: document.querySelectorAll('#verdict li').length,
    out: document.getElementById('output').value,
  }));
  r.check('IS-U1（貼ると判定一覧と右ペインの md が更新される）',
    u1.out.includes('## 2. 論点') && u1.out.includes('情報不足ではなく'),
    JSON.stringify({ items: u1.items, head: u1.out.slice(0, 80) }));

  /* IS-U9: 掘削ログの「なぜ？」は判定対象外 */
  await setValue('#input', SAMPLE_MD + '\n\n## 掘ったログ\nなぜ？\nなぜ？\nなぜ？');
  await setValue('#deadline', '2026-09-30');
  await page.waitForTimeout(400);
  const u9 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#verdict li')).map(li => li.dataset.id));
  r.check('IS-U9（掘削ログに「なぜ？」があっても why は出ない — 判定は論点の1行目だけ）',
    !u9.includes('why'), JSON.stringify(u9));

  /* IS-U2: warn 0件で「まず外していない」 */
  const u2 = await page.evaluate(() => {
    const v = document.getElementById('verdict');
    return { text: v.textContent, ok: v.className.includes('verdict-ok') };
  });
  r.check('IS-U2（warn 0件のとき「まず外していない」が ok の見た目で出る）',
    u2.text.includes('外していない') && u2.ok, JSON.stringify(u2));

  /* IS-U3 / IS-U4: コピー2種 */
  const u34 = await page.evaluate(async () => {
    const out = { note: null, tasks: null };
    let target = 'note';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { out[target] = t; } },
    });
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 200));
    const noteLabel = document.getElementById('copy-btn').textContent;
    target = 'tasks';
    document.getElementById('copy-tasks-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return { ...out, noteLabel, tasksLabel: document.getElementById('copy-tasks-btn').textContent };
  });
  r.check('IS-U3（ノートをコピー: md が渡り ✓ 表示・実クリップボードに書かない）',
    typeof u34.note === 'string' && u34.note.includes('status: open')
    && u34.note.includes('## 2. 論点') && u34.noteLabel === '✓ コピーしました',
    JSON.stringify({ head: (u34.note || '').slice(0, 60), label: u34.noteLabel }));
  r.check('IS-U4（tasks.md 用の行をコピー: Tasks 記法が渡る）',
    typeof u34.tasks === 'string' && u34.tasks.includes('- [ ] 粒度を確認する')
    && u34.tasks.includes('📅 2026-09-30'),
    JSON.stringify(u34.tasks));

  /* IS-U6: Cmd/Ctrl+Enter */
  const u6 = await page.evaluate(async () => {
    const out = { text: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { out.text = t; } },
    });
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 200));
    return { text: out.text, label: document.getElementById('copy-btn').textContent };
  });
  r.check('IS-U6（Cmd/Ctrl+Enter で［ノートをコピー］が発火）',
    typeof u6.text === 'string' && u6.text.includes('status: open')
    && u6.label === '✓ コピーしました', JSON.stringify(u6.label));

  /* IS-U5: pagehide フラッシュ → reload で復元 */
  await setValue('#title', '停止手順書');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  const u5 = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:issue'));
    return {
      input: document.getElementById('input').value.slice(0, 20),
      title: document.getElementById('title').value,
      deadline: document.getElementById('deadline').value,
      tool: env && env.tool, v: env && env.v,
    };
  });
  r.check('IS-U5（pagehide → reload で入力・タイトル・締切が復元・tools:issue envelope）',
    u5.input.includes('本番停止手順書') && u5.title === '停止手順書'
    && u5.deadline === '2026-09-30' && u5.tool === 'issue' && u5.v === 1,
    JSON.stringify(u5));

  /* IS-U7: サンプルは入力が空のときだけ */
  const u7 = await page.evaluate(async () => {
    window.ToolStorage.save = () => true;   // サンプルを保存状態に残さない
    const hiddenWhenFilled = document.getElementById('sample-btn').hidden;
    const i = document.getElementById('input');
    i.value = '';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    const visibleWhenEmpty = !document.getElementById('sample-btn').hidden;
    document.getElementById('sample-btn').click();
    await new Promise(d => setTimeout(d, 400));
    return {
      hiddenWhenFilled, visibleWhenEmpty,
      hiddenAfter: document.getElementById('sample-btn').hidden,
      hasOutput: document.getElementById('output').value.includes('## 2. 論点'),
      hasVerdict: document.querySelectorAll('#verdict li').length >= 0,
    };
  });
  r.check('IS-U7（サンプルは空のときだけ表示・投入で md まで埋まる）',
    u7.hiddenWhenFilled && u7.visibleWhenEmpty && u7.hiddenAfter && u7.hasOutput,
    JSON.stringify(u7));

  /* IS-U10: ノートを直接作る */
  const u10 = await page.evaluate(async () => {
    document.getElementById('create-btn').click();
    await new Promise(d => setTimeout(d, 300));
    const names = Object.keys(window.__fsa.files);
    const b = document.getElementById('banner');
    return {
      picked: window.__fsa.picked, names: names,
      body: names.length ? window.__fsa.files[names[0]] : '',
      banner: b.textContent, kind: b.className, hidden: b.hidden,
      expected: window.issue.noteFileName(document.getElementById('title').value,
        new Date().toISOString().slice(0, 10)),
    };
  });
  r.check('IS-U10（04_Issues にノートを作成: ピッカー→規約どおりのファイル名→右ペインと同じ md→success）',
    u10.picked >= 1 && u10.names.length === 1 && u10.names[0] === u10.expected
    && u10.body.includes('status: open') && u10.body.includes('## 2. 論点')
    && !u10.hidden && u10.kind.includes('banner-success') && u10.banner.includes(u10.expected),
    JSON.stringify({ picked: u10.picked, names: u10.names, banner: u10.banner, kind: u10.kind }));

  /* IS-U11: 同名は上書きしない */
  const u11 = await page.evaluate(async () => {
    const name = Object.keys(window.__fsa.files)[0];
    window.__fsa.files[name] = 'SENTINEL';      // 触られないことを目印で見る
    document.getElementById('create-btn').click();
    await new Promise(d => setTimeout(d, 300));
    const b = document.getElementById('banner');
    return {
      body: window.__fsa.files[name], count: Object.keys(window.__fsa.files).length,
      banner: b.textContent, kind: b.className,
    };
  });
  r.check('IS-U11（同名のノートがあれば上書きせず warn で止まる）',
    u11.body === 'SENTINEL' && u11.count === 1
    && u11.kind.includes('banner-warn') && u11.banner.includes('既に'),
    JSON.stringify(u11));

  /* IS-U19: モードセグメント */
  const u19 = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('nav.modes a'));
    return {
      hrefs: links.map(a => a.getAttribute('href')),
      labels: links.map(a => a.textContent.trim()),
      current: links.filter(a => a.getAttribute('aria-current') === 'page')
        .map(a => a.textContent.trim()),
    };
  });
  r.check('IS-U19（モードセグメント: Plan Tasks へ行けて、自分側が aria-current="page"）',
    u19.hrefs.includes('taskboard.html') && u19.labels.some(l => l.includes('タスク'))
    && u19.current.length === 1 && u19.current[0].includes('イシュー'),
    JSON.stringify(u19));

  /* IS-U13: ウィザードが開く */
  const u13 = await page.evaluate(() => {
    document.getElementById('wizard-btn').click();
    return {
      open: !document.getElementById('wizard').hidden,
      step: document.getElementById('wz-step').textContent,
      dots: document.getElementById('wz-dots').textContent,
      hasField: !!document.getElementById('wz-milestone'),
      why: document.getElementById('wz-why').textContent,
    };
  });
  r.check('IS-U13（［イシューを書く］で Step 1/5 が開く・進捗と「なぜ聞くか」が出る）',
    u13.open && u13.step.includes('1') && u13.step.includes('5')
    && u13.dots.startsWith('●') && u13.hasField && u13.why.length > 0,
    JSON.stringify(u13));

  /* IS-U14: Step 1 は必須（マイルストーンを飛ばせない） */
  const u14 = await page.evaluate(() => {
    document.getElementById('wz-next').click();
    return {
      step: document.getElementById('wz-step').textContent,
      err: document.getElementById('wz-err').textContent,
      errHidden: document.getElementById('wz-err').hidden,
      stillStep1: !!document.getElementById('wz-milestone'),
    };
  });
  r.check('IS-U14（Step 1 が空だと進まず、理由がその場に出る）',
    u14.stillStep1 && !u14.errHidden && u14.err.length > 0 && u14.step.includes('1'),
    JSON.stringify(u14));

  /* IS-U15: Step 2 でその場判定 */
  const setV = (sel, val) => page.evaluate(([s2, v]) => {
    const el = document.querySelector(s2);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);

  await setV('#wz-milestone', '運営チームが本番を止められる状態');
  await setV('#wz-milestone-due', '2026-10-02');
  await page.click('#wz-next');
  await setV('#wz-issue', '現状を整理する');
  await page.waitForTimeout(300);
  const u15 = await page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id),
    text: document.getElementById('wz-judge').textContent,
  }));
  r.check('IS-U15（Step 2 で「現状を整理する」がその場で warn になる）',
    u15.ids.includes('worktheme'), JSON.stringify(u15.ids));

  /* IS-U17: Esc で閉じても下書きは残る（非破壊） */
  const u17 = await page.evaluate(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Escape', bubbles: true, cancelable: true }));
    const closed = document.getElementById('wizard').hidden;
    document.getElementById('wizard-btn').click();
    return { closed: closed, reopened: !document.getElementById('wizard').hidden,
      kept: (document.getElementById('wz-issue') || {}).value };
  });
  r.check('IS-U17（Esc で閉じても下書きが残り、開き直すと同じ位置・同じ内容）',
    u17.closed && u17.reopened && u17.kept === '現状を整理する', JSON.stringify(u17));

  /* IS-U16: 最後まで進んで作成 */
  await setV('#wz-issue', '手順書が書けないのは情報不足ではなく合意が無いからではないか');
  await setV('#wz-issue-due', '2026-09-30');
  await page.click('#wz-next');                       // → Step 3
  await page.click('#wz-add-unknown');
  await setV('.wz-u-what', 'どの粒度なら実行できるか');
  await page.selectOption('.wz-u-way', '聞く');
  await setV('.wz-u-who', '柳葉さん経由');
  await setV('.wz-u-due', '2026-09-30');
  await page.click('#wz-next');                       // → Step 4
  await setV('#wz-risks', 'アクセス日程が動くと全部ずれる');
  await page.click('#wz-next');                       // → Step 5
  await setV('#wz-next-what', '粒度を確認する');
  await setV('#wz-next-due', '2026-10-02');
  await setV('#wz-note-title', 'ウィザード検証');
  const u16 = await page.evaluate(async () => {
    document.getElementById('wz-create').click();
    await new Promise(d => setTimeout(d, 400));
    const names = Object.keys(window.__fsa.files);
    return {
      closed: document.getElementById('wizard').hidden,
      input: document.getElementById('input').value,
      deadline: document.getElementById('deadline').value,
      names: names,
      body: names.map(n => window.__fsa.files[n]).join('\n'),
    };
  });
  r.check('IS-U16（最後まで進んで作成: 入力欄に5ステップの md が入り、ノートが作られる）',
    u16.closed
    && ['## 1. ゴール', '## 2. 論点', '## 3. 不明点', '## 4. リスク', '## 5. 次の一手']
      .every(h => u16.input.includes(h))
    && u16.input.includes('（マイルストーン: 2026-10-02）')
    && u16.deadline === '2026-09-30'
    && u16.names.some(n => n.includes('ウィザード検証'))
    && u16.body.includes('| どの粒度なら実行できるか | 聞く | 柳葉さん経由 | 2026-09-30 |'),
    JSON.stringify({ closed: u16.closed, deadline: u16.deadline, names: u16.names,
      head: u16.input.slice(0, 120) }));

  /* IS-U12: FSA 非対応では作成ボタンを無効にして理由を出す（Check Vault と同型） */
  const page2 = r.watch(await browser.newPage());
  await page2.addInitScript(() => { delete window.showDirectoryPicker; });
  await page2.goto(fileUrl('web/issue.html'));
  const u12 = await page2.evaluate(() => ({
    disabled: document.getElementById('create-btn').disabled,
    note: document.getElementById('env-note').textContent,
    noteHidden: document.getElementById('env-note').hidden,
    copyEnabled: !document.getElementById('copy-btn').disabled,
  }));
  await page2.close();
  r.check('IS-U12（FSA 非対応: 作成ボタンが無効＋理由を表示・コピーは使える）',
    u12.disabled === true && !u12.noteHidden && u12.note.includes('Chrome') && u12.copyEnabled,
    JSON.stringify(u12));

  /* IS-U8: 幅390px */
  await page.setViewportSize({ width: 390, height: 800 });
  const u8 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('IS-U8（幅390pxで横スクロールなし）', u8 === true, String(u8));

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
