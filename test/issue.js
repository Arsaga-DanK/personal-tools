'use strict';
/* 目的: docs/specs/issue.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/issue.js  /  ./test/run issue

   照合するID: IS-01〜21・IS-L1〜L6（純関数）＋ IS-U1〜U23・IS-UL1〜UL7（UI 経路・FSA 読み書き・ウィザード・一覧・振り返り・書き殴りへの追記）＋ハブ導線
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

  if (ready) {
    /* ========== IS-01〜04: parseSections ========== */
    const p = await page.evaluate(s => ({
      basic: window.issue.parseSections(s),
      loose: window.issue.parseSections(
        '## ゴール\nG\n**2. 論点**\nR\n3. 絵コンテ：\nE\n#### サブイシュー\nF\n## 5. 次の一手\nN'),
      legacy: window.issue.parseSections(
        '## 3. 不明点\n旧ノートの行\n## 4. リスク\n旧リスク\n## 分かったこと\nW\n## 結論\nC'),
      alias: window.issue.parseSections('## 2. イシュー\n- これが論点'),
      none: window.issue.parseSections('なぜ？\n  └ なぜ？\n     └ だから'),
      titled: window.issue.parseSections('# タイトル行\n本文\n## 2. 論点\n- X'),
    }), SAMPLE_MD);

    r.check('IS-01（5セクションに分解され行頭の "- " が落ちる）',
      eq(p.basic.goal, ['運営チームが自分たちだけで本番を停止できる手順書を出す'])
      && eq(p.basic.issue, ['手順書が書けないのは情報不足ではなく、完成度の合意が無いからではないか'])
      && eq(p.basic.picture, ['【表】粒度ごとに実行できたかの表。右上に集まれば仮説どおり'])
      && p.basic.subs.length === 2
      && eq(p.basic.next, ['粒度を確認する']),
      JSON.stringify(p.basic));

    r.check('IS-02（見出しの揺れと別名「イシュー」を認識する）',
      eq(p.loose.goal, ['G']) && eq(p.loose.issue, ['R']) && eq(p.loose.picture, ['E'])
      && eq(p.loose.subs, ['F']) && eq(p.loose.next, ['N'])
      && eq(p.alias.issue, ['これが論点']),
      JSON.stringify([p.loose, p.alias]));

    /* ========== IS-20: 新しい見出しと旧ノートの互換 ========== */
    r.check('IS-20（絵コンテ/サブイシュー/分かったこと/結論を認識・旧「不明点」も subs へ）',
      eq(p.legacy.subs, ['旧ノートの行']) && eq(p.legacy.risks, ['旧リスク'])
      && eq(p.legacy.found, ['W']) && eq(p.legacy.conclusion, ['C']),
      JSON.stringify(p.legacy));

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
        { deadline: '2026-09-30', unknowns: ['粒度を聞く'], picture: '粒度ごとの表' });
      const empty = window.issue.judge('', {});
      const noDl = window.issue.judge('Aは B ではなく C ではないか', {});
      const multi = window.issue.judge(['一行目はこう', '二行目もある'],
        { deadline: '2026-09-30', unknowns: ['x'], picture: 'p' });
      const taigen = window.issue.judge('本番環境の調査',
        { deadline: '2026-09-30', unknowns: ['x'], picture: 'p' });
      const noPic = window.issue.judge('Aは B ではなく C ではないか',
        { deadline: '2026-09-30', unknowns: ['x'] });
      const oneCand = window.issue.judge('Aは B ではなく C ではないか',
        { deadline: '2026-09-30', unknowns: ['x'], picture: 'p', candidates: ['A', ''] });
      const twoCand = window.issue.judge('Aは B ではなく C ではないか',
        { deadline: '2026-09-30', unknowns: ['x'], picture: 'p', candidates: ['A', 'B'] });
      const annot = window.issue.judge(
        ['Aは B ではなく C ではないか', '> 答えが出たら: X', '（見送った候補）Y'],
        { deadline: '2026-09-30', unknowns: ['x'], picture: 'p' });
      return {
        bad: ids(bad), why: ids(why), good: ids(good), goodWarn: good.filter(x => x.level === 'warn').length,
        empty: ids(empty), emptyLv: lv(empty, 'empty'),
        noDl: ids(noDl),
        multiLv: lv(multi, 'multiline'), subjLv: lv(taigen, 'subject'),
        taigen: ids(taigen),
        noPic: ids(noPic), oneCand: ids(oneCand), twoCand: ids(twoCand),
        oneCandLv: lv(oneCand, 'alternatives'), annot: ids(annot),
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
    r.check('IS-19（絵コンテ空で picture の warn・候補1件で alternatives の info・候補なしでは出ない）',
      j.noPic.includes('picture') && !j.twoCand.includes('picture')
      && j.oneCand.includes('alternatives') && j.oneCandLv === 'info'
      && !j.twoCand.includes('alternatives') && !j.noPic.includes('alternatives'),
      JSON.stringify({ noPic: j.noPic, oneCand: j.oneCand, twoCand: j.twoCand }));
    r.check('IS-19b（「> 」「（」で始まる注記行は論点として数えない = multiline が出ない）',
      !j.annot.includes('multiline'), JSON.stringify(j.annot));

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
      && ['## 1. ゴール', '## 2. 論点', '## 3. 絵コンテ', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => n.note.includes(h))
      && ['## 1. ゴール', '## 3. 絵コンテ', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => n.bare.includes(h)),
      n.note.slice(0, 200));

    /* ========== IS-21: 閉じるための欄と、旧ノートのリスク保持 ========== */
    const cl = await page.evaluate(() => ({
      fresh: window.issue.toNote(window.issue.parseSections('## 2. 論点\n- X'),
        { deadline: '', today: '2026-09-24', title: 't' }),
      legacy: window.issue.toNote(
        window.issue.parseSections('## 4. リスク\n- 旧リスク\n## 結論\n- けつろん'),
        { deadline: '', today: '2026-09-24', title: 't' }),
    }));
    r.check('IS-21（分かったこと・結論・verdict を必ず出す＝閉じられる／旧ノートのリスクは保持）',
      cl.fresh.includes('## 分かったこと') && cl.fresh.includes('## 結論')
      && cl.fresh.includes('verdict: ')
      && cl.legacy.includes('## リスク') && cl.legacy.includes('旧リスク')
      && cl.legacy.includes('けつろん'),
      cl.fresh.slice(0, 160));

    r.check('IS-12（rest があれば末尾に「## 掘ったログ」として残す）',
      n.dug.includes('## 掘ったログ') && n.dug.includes('掘った内容だけ'),
      n.dug);

    r.check('IS-13（不明点は表の行になり「聞く/調べる」を2列目に検出）',
      /\|\s*どの粒度なら実行できるかを聞く\s*\|\s*聞く\s*\|/.test(n.note)
      && /\|\s*サービス一覧を調べる\s*\|\s*調べる\s*\|/.test(n.note),
      (n.note.split('## 4. サブイシュー')[1] || '').slice(0, 300));

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

    /* ========== IS-L1〜L4: 一覧のための純関数 ========== */
    const NOTE = [
      '---', 'created: 2026-09-24', 'deadline: 2026-09-30', 'status: open',
      'verdict: ', 'tags: [issue]', '---',
      '# 本番停止手順書', '',
      '## 2. 論点', '',
      '- 手順書が書けないのは情報不足ではなく合意が無いからではないか',
      '> 答えが出たら: 依頼内容が変わる', '',
      '## 3. 絵コンテ', '', '- 【表】粒度ごとの表', '',
      '## 4. サブイシュー', '',
      '| 分からないこと | 聞く / 調べる / 試す | 誰に・どこで | いつまでに |',
      '| --- | --- | --- | --- |',
      '| 粒度 | 聞く | 柳葉さん | 2026-09-30 |',
      '| 一覧 | 調べる |  |  |', '',
      '## 5. 次の一手', '', '- [ ] 粒度を確認する \u{1F4C5} 2026-10-02', '',
      '---', '', '## 分かったこと', '', '- ', '', '## 結論', '', '- ', '',
    ].join('\n');

    const L = await page.evaluate((note) => {
      const I = window.issue;
      const fm = I.parseFrontmatter(note);
      const patched = I.setFrontmatter(note, { status: 'closed', verdict: '当たり' });
      const noFm = I.setFrontmatter('見出しだけ\n## 結論\n- x', { status: 'closed' });
      return {
        data: fm.data,
        bodyKeepsTitle: fm.body.indexOf('# 本番停止手順書') === 0,
        patched: patched,
        bodyUnchanged: patched.split('---\n')[2] === note.split('---\n')[2],
        noFm: noFm,
        rows: I.subRows(I.parseSections(note).subs),
        appended: I.appendToSection(note, '## 結論', '- 粒度未合意が原因だった'),
        madeSection: I.appendToSection('# t\n\n## 2. 論点\n\n- x\n', '## 結論', '- けつろん'),
        sum: I.summarize(note, '2026-09-24_本番停止手順書.md'),
      };
    }, NOTE);

    r.check('IS-L1（frontmatter を読み、キーを差し替えても本文が1文字も変わらない・無い場合は素通し）',
      L.data.status === 'open' && L.data.deadline === '2026-09-30' && L.bodyKeepsTitle
      && L.patched.includes('status: closed') && L.patched.includes('verdict: 当たり')
      && !L.patched.includes('status: open')
      && L.bodyUnchanged
      && L.noFm === '見出しだけ\n## 結論\n- x',
      JSON.stringify({ data: L.data, bodyUnchanged: L.bodyUnchanged, noFm: L.noFm }));

    r.check('IS-L2（subRows: 表の見出し行と区切り行を除き、手段を2列目から取る）',
      L.rows.length === 2 && L.rows[0].what === '粒度' && L.rows[0].way === '聞く'
      && L.rows[1].what === '一覧' && L.rows[1].way === '調べる',
      JSON.stringify(L.rows));

    r.check('IS-L3（appendToSection: 結論の末尾に足す・節が無ければ作る）',
      /## 結論\n\n- \n- 粒度未合意が原因だった/.test(L.appended.replace(/\s+$/, ''))
      && L.madeSection.includes('## 結論') && L.madeSection.includes('- けつろん')
      && L.madeSection.includes('## 2. 論点'),
      JSON.stringify([L.appended.slice(L.appended.indexOf('## 結論')), L.madeSection]));

    r.check('IS-L4（summarize: 論点1行・締切・状態・サブ件数・引っかかり件数）',
      L.sum.issue === '手順書が書けないのは情報不足ではなく合意が無いからではないか'
      && L.sum.deadline === '2026-09-30' && L.sum.status === 'open'
      && L.sum.subs === 2 && L.sum.ways['聞く'] === 1 && L.sum.ways['調べる'] === 1
      && L.sum.next.includes('粒度を確認する')
      && L.sum.picture.includes('粒度ごとの表')
      && L.sum.warn === 0
      && L.sum.title === '本番停止手順書',
      JSON.stringify(L.sum));

    /* ========== IS-L5/L6: 既存ノート（書き殴り）への書き込み ========== */
    const SCRIBBLE = [
      '---', 'created: 2026-09-24', 'status: open', 'tags:', '  - issue', '---',
      '# 20260924_現状整理', '',
      '## 1. イシューを見極める', '',
      '- 現状を整理し、何をやるべきか、今後の進め方の確認をする。',
      '\t- V13利用期限のカウントダウンはもう始まっている',
      '', 'TODO', '- 富士通にV13の再受領の確認(ITK)', '',
      '## 12月本番運用開始(2019 )', '- お客さんの受け入れ', '',
    ].join('\n');

    const W2 = await page.evaluate((scr) => {
      const I = window.issue;
      const md = I.buildMd({
        milestone: 'M', milestoneDue: '2026-10-02',
        candidates: [{ text: 'Xは A ではなく B ではないか', effect: 'E' }], chosen: 0,
        issueDue: '2026-09-30', pictureKind: '表', picture: 'P',
        subs: [{ what: 'S', way: '聞く', who: '', due: '' }], next: 'N', nextDue: '',
      });
      const first = I.upsertFrame(scr, md);
      const again = I.upsertFrame(first, md.replace('- M（マイルストーン: 2026-10-02）', '- M2（マイルストーン: 2026-10-02）'));
      return {
        first: first, again: again,
        line1: I.setIssueLine(scr, '手順書が書けないのは情報不足ではなく合意が無いからではないか'),
        line2: I.setIssueLine(first, '差し替えた論点'),
      };
    }, SCRIBBLE);

    r.check('IS-L5（書き殴りノートの先頭に5段が入り、TODO も自作見出しもそのまま残る）',
      W2.first.indexOf('## 1. ゴール') > W2.first.indexOf('# 20260924_現状整理')
      && W2.first.indexOf('## 1. ゴール') < W2.first.indexOf('## 1. イシューを見極める')
      && W2.first.includes('TODO') && W2.first.includes('- 富士通にV13の再受領の確認(ITK)')
      && W2.first.includes('## 12月本番運用開始(2019 )')
      && W2.first.includes('\t- V13利用期限のカウントダウンはもう始まっている'),
      W2.first.slice(0, 300));

    r.check('IS-L5b（2回目は5段の範囲だけ差し替える — 重複して増えない）',
      (W2.again.match(/## 1\. ゴール/g) || []).length === 1
      && W2.again.includes('- M2（マイルストーン: 2026-10-02）')
      && !W2.again.includes('- M（マイルストーン: 2026-10-02）')
      && W2.again.includes('TODO') && W2.again.includes('## 12月本番運用開始(2019 )'),
      (W2.again.match(/## 1\. ゴール/g) || []).length + ' 個');

    r.check('IS-L6（論点の一行だけを書ける: 節が無ければ本文の先頭に作り、あれば中身を差し替える）',
      W2.line1.includes('## 2. 論点')
      && W2.line1.indexOf('## 2. 論点') < W2.line1.indexOf('## 1. イシューを見極める')
      && W2.line1.includes('- 手順書が書けないのは情報不足ではなく合意が無いからではないか')
      && W2.line1.includes('TODO')
      && (W2.line2.match(/## 2\. 論点/g) || []).length === 1
      && W2.line2.includes('- 差し替えた論点')
      && !W2.line2.includes('- Xは A ではなく B ではないか')
      && W2.line2.includes('> 答えが出たら: E'),        // 注記は残す
      JSON.stringify({ l1: W2.line1.slice(0, 160), l2n: (W2.line2.match(/## 2\. 論点/g) || []).length }));

    /* ========== IS-17/18: ウィザードの下書き → md ========== */
    const w = await page.evaluate(() => {
      const md = window.issue.buildMd({
        milestone: '運営チームが本番を止められる状態', milestoneDue: '2026-10-02',
        candidates: [{ text: '情報不足ではなく合意が無いからではないか', effect: '依頼内容が変わる' },
                     { text: '見送った方の問い', effect: '' }],
        chosen: 0, issueDue: '2026-09-30',
        pictureKind: '表', picture: '粒度ごとに実行できたかの表',
        subs: [{ what: '粒度', way: '聞く', who: '柳葉さん', due: '2026-09-30' }],
        next: '粒度を確認する', nextDue: '2026-10-02',
      });
      const through = window.issue.toNote(
        window.issue.parseSections('## 4. サブイシュー\n| a | 聞く | b | c |'),
        { deadline: '', today: '2026-09-24', title: 'x' });
      return { md: md, through: through };
    });
    r.check('IS-17（buildMd: 5見出し・マイルストーンの期限・不明点は表の行・次の一手はタスク記法）',
      ['## 1. ゴール', '## 2. 論点', '## 3. 絵コンテ', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => w.md.includes(h))
      && w.md.includes('- 運営チームが本番を止められる状態（マイルストーン: 2026-10-02）')
      && w.md.includes('- 情報不足ではなく合意が無いからではないか')
      && w.md.includes('> 答えが出たら: 依頼内容が変わる')
      && w.md.includes('> 見送った候補: 見送った方の問い')
      && w.md.includes('- 【表】粒度ごとに実行できたかの表')
      && w.md.includes('| 粒度 | 聞く | 柳葉さん | 2026-09-30 |')
      && w.md.includes('- [ ] 粒度を確認する \u{1F4C5} 2026-10-02'),
      w.md);
    r.check('IS-18（toNote は「|」始まりの不明点をそのまま通す — ウィザードの行を壊さない）',
      w.through.includes('| a | 聞く | b | c |')
      && (w.through.match(/\| a \|/g) || []).length === 1,
      (w.through.split('## 4. サブイシュー')[1] || '').slice(0, 220));
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
    ids: Array.from(document.querySelectorAll('#verdict li')).map(li => li.dataset.id),
    noPreview: !document.getElementById('output'),      // プレビューは廃止（IS-Q10）
  }));
  r.check('IS-U1（貼ると判定が更新される・md プレビューは存在しない）',
    u1.ids.length > 0 && u1.noPreview, JSON.stringify(u1));

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

  /* ========== IS-UL1〜UL5: 一覧（画面の主） ========== */
  const mkNote = (o) => [
    '---', 'created: 2026-09-01', 'deadline: ' + (o.due || ''), 'status: ' + (o.status || 'open'),
    'verdict: ' + (o.verdict || ''), 'tags: [issue]', '---',
    '# ' + o.title, '',
    '## 2. 論点', '', '- ' + o.issue, '',
    '## 3. 絵コンテ', '', '- 【表】' + o.title + 'の表', '',
    '## 4. サブイシュー', '',
    '| 分からないこと | 聞く / 調べる / 試す | 誰に・どこで | いつまでに |',
    '| --- | --- | --- | --- |',
    '| 粒度 | 聞く | 柳葉さん | 2026-09-30 |', '',
    '## 5. 次の一手', '', '- [ ] ' + o.title + 'の一手', '',
    '---', '', '## 分かったこと', '', '- ', '', '## 結論', '', '- ', '',
  ].join('\n');

  const ul1 = await page.evaluate(async (notes) => {
    // **参照を差し替えないこと** — ダミーは閉包で files を握っているので、中身だけ入れ替える
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    for (const k of Object.keys(notes)) window.__fsa.files[k] = notes[k];
    window.__fsa.files['README.txt'] = 'md ではないので無視される';
    await window.issue.load();
    const cards = Array.from(document.querySelectorAll('.issue-card'));
    return {
      order: cards.map(c => c.querySelector('.ic-title').textContent),
      issue0: cards[0].querySelector('.ic-issue').textContent,
      meta0: Array.from(cards[0].querySelectorAll('.ic-meta li')).map(li => li.textContent),
      due0: cards[0].querySelector('.ic-due').textContent,
      summary: document.getElementById('summary').textContent,
      warnBtn: !!cards.find(c => c.querySelector('.ic-warn')),
      okMarks: cards.filter(c => c.querySelector('.ic-ok')).length,
    };
  }, {
    'a.md': mkNote({ title: '遅い方', issue: 'Xは A ではなく B ではないか', due: '2026-12-31' }),
    'b.md': mkNote({ title: '急ぐ方', issue: 'Yは C ではなく D ではないか', due: '2026-09-25' }),
    'c.md': mkNote({ title: '閉じた方', issue: 'Zは E ではなく F ではないか', due: '2026-10-10', status: 'closed', verdict: '当たり' }),
  });
  r.check('IS-UL1（締切の早い順にカードが並び、論点・次の一手・サブ件数が出る・md 以外は無視）',
    eq(ul1.order, ['急ぐ方', '遅い方'])          // closed は既定フィルタで出ない
    && ul1.issue0 === 'Yは C ではなく D ではないか'
    && ul1.meta0.some(m => m.includes('次の一手')) && ul1.meta0.some(m => m.includes('サブイシュー 1件'))
    && ul1.due0.includes('2026-09-25')
    && ul1.summary.includes('2件')
    && ul1.okMarks === 2,          // どちらも締切・絵コンテ・サブがあるので引っかかりなし
    JSON.stringify(ul1));

  const ul2 = await page.evaluate(() => {
    const set = v => {
      const f = document.getElementById('f-status');
      f.value = v; f.dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelectorAll('.issue-card').length;
    };
    return { open: set('open'), all: set('all'), closed: set('closed'), back: set('open') };
  });
  r.check('IS-UL2（フィルタ: 開いているもの2 / すべて3 / 閉じたもの1）',
    ul2.open === 2 && ul2.all === 3 && ul2.closed === 1 && ul2.back === 2,
    JSON.stringify(ul2));

  /* IS-UL5: vault 名が無ければ Obsidian リンクを作らない */
  const ul5 = await page.evaluate(() => {
    const before = document.querySelectorAll('.ic-obsidian').length;
    window.ToolConfig.set({ vaultName: 'MyVault' });
    document.getElementById('cfg-vault').value = 'MyVault';
    document.getElementById('cfg-vault').dispatchEvent(new Event('change', { bubbles: true }));
    const a = document.querySelector('.ic-obsidian');
    const href = a ? a.getAttribute('href') : '';
    document.getElementById('cfg-vault').value = '';   // 欄を空にしてから change（実際の操作と同じ）
    document.getElementById('cfg-vault').dispatchEvent(new Event('change', { bubbles: true }));
    return { before, href, after: document.querySelectorAll('.ic-obsidian').length };
  });
  r.check('IS-UL5（vault 名が未設定ならリンクを作らない・設定すると obsidian:// が出る）',
    ul5.before === 0 && ul5.href.indexOf('obsidian://open?vault=MyVault&file=') === 0
    && ul5.after === 0,
    JSON.stringify(ul5));

  /* IS-UL4: 外部で変わっていたら閉じない（鮮度チェック） */
  const ul4 = await page.evaluate(async () => {
    const card = document.querySelector('.issue-card');
    card.querySelector('.ic-close').click();
    window.__fsa.files['b.md'] = window.__fsa.files['b.md'] + '\n外部で追記された\n';
    const before = window.__fsa.files['b.md'];
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 300));
    return {
      err: document.getElementById('cm-err').textContent,
      errHidden: document.getElementById('cm-err').hidden,
      stillOpen: !document.getElementById('close-modal').hidden,
      unchanged: window.__fsa.files['b.md'] === before,
    };
  });
  r.check('IS-UL4（外部で変わっていたら書き込まず警告・ファイルは不変）',
    !ul4.errHidden && ul4.err.includes('Obsidian') && ul4.stillOpen && ul4.unchanged,
    JSON.stringify(ul4));

  /* IS-UL3: 閉じる → frontmatter が変わり結論に1行入る。本文の他は不変 */
  const ul3 = await page.evaluate(async () => {
    document.getElementById('cm-cancel').click();
    await window.issue.load();                       // 外部変更を取り込み直す
    const card = Array.from(document.querySelectorAll('.issue-card'))
      .find(c => c.querySelector('.ic-title').textContent === '急ぐ方');
    const before = window.__fsa.files['b.md'];
    card.querySelector('.ic-close').click();
    document.querySelector('input[name="cm-v"][value="外れ"]').checked = true;
    const n = document.getElementById('cm-note');
    n.value = '粒度ではなく体制が原因だった';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('cm-ok').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['b.md'];
    // frontmatter を除いた本文が、追記した1行以外は同一か
    const bodyOf = t => t.split('\n---\n').slice(1).join('\n---\n');
    const strip = t => bodyOf(t).split('\n').filter(l => l !== '- 粒度ではなく体制が原因だった').join('\n');
    return {
      closedModal: document.getElementById('close-modal').hidden,
      status: /^status: closed$/m.test(after),
      verdict: /^verdict: 外れ$/m.test(after),
      conclusion: after.indexOf('## 結論') >= 0
        && after.slice(after.indexOf('## 結論')).includes('- 粒度ではなく体制が原因だった'),
      bodyOtherwiseSame: strip(after) === bodyOf(before),
      nowClosedInList: Array.from(document.querySelectorAll('.issue-card'))
        .every(c => c.querySelector('.ic-title').textContent !== '急ぐ方'),
    };
  });
  r.check('IS-UL3（閉じると status/verdict が変わり結論に1行入る・本文の他は不変・一覧から外れる）',
    ul3.closedModal && ul3.status && ul3.verdict && ul3.conclusion
    && ul3.bodyOtherwiseSame && ul3.nowClosedInList,
    JSON.stringify(ul3));

  /* ========== IS-UL6/UL7: 書き殴りノートに問いを立てる（実測に合わせた経路） ========== */
  const SCRIB = [
    '---', 'created: 2026-09-24', 'status: open', 'tags:', '  - issue', '---',
    '# 20260924_現状整理', '',
    '## 1. イシューを見極める', '',
    '- 現状を整理し、今後の進め方の確認をする。',
    '\t- V13利用期限のカウントダウンはもう始まっている', '',
    'TODO', '- 富士通にV13の再受領の確認(ITK)', '',
    '## 12月本番運用開始(2019 )', '- お客さんの受け入れ', '',
  ].join('\n');

  const ul6 = await page.evaluate(async (scr) => {
    for (const k of Object.keys(window.__fsa.files)) delete window.__fsa.files[k];
    window.__fsa.files['d.md'] = scr;
    await window.issue.load();
    const art = document.querySelector('.issue-card');
    const btn = art.querySelector('.ic-issue');
    const emptyLabel = btn.textContent;
    btn.click();                                        // その場編集を開く
    const line = art.querySelector('.ic-edit-line');
    line.value = '手順書が書けないのは情報不足ではなく合意が無いからではないか';
    line.dispatchEvent(new Event('input', { bubbles: true }));
    const due = art.querySelector('.ic-edit-due');
    due.value = '2026-09-30';
    due.dispatchEvent(new Event('input', { bubbles: true }));
    const liveIds = Array.from(art.querySelectorAll('.ic-edit .ic-verdicts li')).map(li => li.dataset.id);
    const staleHidden = !art.querySelector('.ic-warn') || art.querySelector('.ic-warn').hidden;
    art.querySelector('.ic-edit-save').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['d.md'];
    return {
      emptyLabel, liveIds, after, staleHidden,
      shownIssue: (document.querySelector('.ic-issue') || {}).textContent,
      keptScribble: after.includes('TODO') && after.includes('- 富士通にV13の再受領の確認(ITK)')
        && after.includes('## 12月本番運用開始(2019 )')
        && after.includes('\t- V13利用期限のカウントダウンはもう始まっている'),
    };
  }, SCRIB);
  r.check('IS-UL6（カードで論点を一行だけ書ける: その場判定 → 本文の先頭に節ができ、書き殴りは残る）',
    ul6.emptyLabel.includes('論点を一行で')
    && ul6.liveIds.length > 0 && ul6.staleHidden   // 古い件数と並べない
    && ul6.after.includes('## 2. 論点')
    && ul6.after.indexOf('## 2. 論点') < ul6.after.indexOf('## 1. イシューを見極める')
    && /^deadline: 2026-09-30$/m.test(ul6.after)
    && ul6.keptScribble
    && ul6.shownIssue.includes('情報不足ではなく'),
    JSON.stringify({ liveIds: ul6.liveIds, kept: ul6.keptScribble, shown: ul6.shownIssue }));

  const ul7 = await page.evaluate(async () => {
    const art = document.querySelector('.issue-card');
    art.querySelector('.ic-frame').click();             // このノートに問いを立てる
    const opened = {
      label: document.getElementById('wz-create').textContent,
      sourceShown: !document.getElementById('wz-source').hidden,
      sourceHasScribble: document.getElementById('wz-source-text').textContent.includes('TODO'),
    };
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('#wz-milestone', '運営チームが本番を止められる状態');
    set('#wz-milestone-due', '2026-10-02');
    const prefilled = document.getElementById('wz-milestone').value;
    document.getElementById('wz-next').click();          // → Step 2
    const cand = document.querySelector('.wz-c-text').value;   // 既存の論点が初期値
    set('#wz-issue-due', '2026-09-30');
    document.getElementById('wz-next').click();          // → Step 3
    set('#wz-picture', '粒度ごとに実行できたかの表');
    document.getElementById('wz-next').click();          // → Step 4
    document.getElementById('wz-next').click();          // → Step 5
    const hasTitleField = !!document.getElementById('wz-note-title');
    set('#wz-next-what', '粒度を確認する');
    document.getElementById('wz-create').click();
    await new Promise(d => setTimeout(d, 400));
    const after = window.__fsa.files['d.md'];
    return {
      ...opened, prefilled, cand, hasTitleField,
      files: Object.keys(window.__fsa.files).length,
      frameFirst: after.indexOf('## 1. ゴール') < after.indexOf('## 1. イシューを見極める'),
      hasFive: ['## 1. ゴール', '## 2. 論点', '## 3. 絵コンテ', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => after.includes(h)),
      kept: after.includes('TODO') && after.includes('## 12月本番運用開始(2019 )'),
      deadline: /^deadline: 2026-09-30$/m.test(after),
      closed: document.getElementById('wizard').hidden,
    };
  });
  r.check('IS-UL7（既存ノートに問いを立てる: 元の中身を見ながら書け、5段が先頭に入り、新規ノートは増えず、書き殴りも残る）',
    ul7.label === 'このノートに書き込む' && ul7.sourceShown && ul7.sourceHasScribble
    && ul7.cand.includes('情報不足ではなく')          // 既存の論点が初期値に入る
    && ul7.hasTitleField === false                    // 既存なのでノート名は聞かない
    && ul7.files === 1 && ul7.frameFirst && ul7.hasFive && ul7.kept && ul7.deadline && ul7.closed,
    JSON.stringify(ul7));

  /* IS-U4: tasks.md 用の行をコピー（md のコピーは FSA 非対応時のみなので IS-U12 で見る） */
  const u4 = await page.evaluate(async () => {
    let got = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async t => { got = t; } },
    });
    document.getElementById('copy-tasks-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return { text: got, label: document.getElementById('copy-tasks-btn').textContent };
  });
  r.check('IS-U4（tasks.md 用の行をコピー: Tasks 記法が渡る）',
    typeof u4.text === 'string' && u4.text.includes('- [ ] 粒度を確認する')
    && u4.text.includes('📅 2026-09-30'),
    JSON.stringify(u4.text));

  /* IS-U6: Cmd/Ctrl+Enter は「そのとき有効な方」= FSA があるので作成 */
  const u6 = await page.evaluate(async () => {
    const before = Object.keys(window.__fsa.files).length;
    document.getElementById('title').value = 'ショートカット検証';
    document.getElementById('title').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 300));
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }));
    await new Promise(d => setTimeout(d, 400));
    const names = Object.keys(window.__fsa.files);
    return { before: before, after: names.length,
      made: names.some(n => n.includes('ショートカット検証')) };
  });
  r.check('IS-U6（Cmd/Ctrl+Enter で［04_Issues にノートを作成］が発火）',
    u6.after === u6.before + 1 && u6.made, JSON.stringify(u6));

  /* IS-U22: コピーボタンは FSA が無いときだけ出る（プレビューは常に出る） */
  const u22 = await page.evaluate(() => ({
    copyHidden: document.getElementById('copy-btn').hidden,
    listVisible: !!document.getElementById('cards'),
    pasteFolded: document.getElementById('paste-box').open === false,
    tasksCopyVisible: !document.getElementById('copy-tasks-btn').hidden,
  }));
  r.check('IS-U22（FSA あり: ［md をコピー］は隠れ、一覧が主・貼る欄は畳まれている）',
    u22.copyHidden === true && u22.listVisible && u22.tasksCopyVisible && u22.pasteFolded,
    JSON.stringify(u22));

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
      hasInput: document.getElementById('input').value.includes('## 2. 論点'),
      hasVerdict: document.querySelectorAll('#verdict li').length >= 0,
    };
  });
  r.check('IS-U7（サンプルは空のときだけ表示・投入で md まで埋まる）',
    u7.hiddenWhenFilled && u7.visibleWhenEmpty && u7.hiddenAfter && u7.hasInput,
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

  /* IS-U15: Step 2（論点の候補）でその場判定 */
  const setV = (sel, val) => page.evaluate(([s2, v]) => {
    const el = document.querySelector(s2);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, val]);

  await setV('#wz-milestone', '運営チームが本番を止められる状態');
  await setV('#wz-milestone-due', '2026-10-02');
  await page.click('#wz-next');                       // → Step 2
  await setV('.wz-c-text', '現状を整理する');
  await page.waitForTimeout(200);
  const u15 = await page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id),
  }));
  r.check('IS-U15（Step 2 の候補に「現状を整理する」でその場で worktheme の warn）',
    u15.ids.includes('worktheme') && u15.ids.includes('alternatives'),
    JSON.stringify(u15.ids));

  /* IS-U17: Esc で閉じても下書きは残る（非破壊） */
  const u17 = await page.evaluate(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Escape', bubbles: true, cancelable: true }));
    const closed = document.getElementById('wizard').hidden;
    document.getElementById('wizard-btn').click();
    return { closed: closed, reopened: !document.getElementById('wizard').hidden,
      kept: (document.querySelector('.wz-c-text') || {}).value };
  });
  r.check('IS-U17（Esc で閉じても下書きが残り、開き直すと同じ位置・同じ内容）',
    u17.closed && u17.reopened && u17.kept === '現状を整理する', JSON.stringify(u17));

  /* IS-U21: 候補を2つ書いて2つ目を選ぶと、それが論点になり alternatives が消える */
  await setV('.wz-c-text', '手順書が書けないのは情報不足ではなく合意が無いからではないか');
  await page.evaluate(() => {
    const t = document.querySelectorAll('.wz-c-text')[1];
    t.value = 'レビュー体制を増やすべきか';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    const e = document.querySelectorAll('.wz-c-effect')[0];
    e.value = '運営チームへの依頼内容が変わる';
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setV('#wz-issue-due', '2026-09-30');
  await page.waitForTimeout(200);
  const u21a = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id));
  const u21b = await page.evaluate(() => {
    const radios = document.querySelectorAll('.wz-c-pick');
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    return Array.from(document.querySelectorAll('#wz-judge li')).map(li => li.dataset.id);
  });
  // 2つ目（「レビュー体制を増やすべきか」）は比較の形でないので compare の info が付く
  r.check('IS-U21（候補が2つで alternatives が消える・選び直すと判定対象が変わる）',
    !u21a.includes('alternatives') && !u21b.includes('alternatives')
    && !u21a.includes('compare') && u21b.includes('compare'),
    JSON.stringify([u21a, u21b]));
  await page.evaluate(() => {
    const radios = document.querySelectorAll('.wz-c-pick');
    radios[0].checked = true;
    radios[0].dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* IS-U20: Step 3（絵コンテ）は空だと進めない */
  await page.click('#wz-next');                       // → Step 3
  const u20 = await page.evaluate(() => {
    document.getElementById('wz-next').click();
    return {
      stillStep3: !!document.getElementById('wz-picture'),
      err: document.getElementById('wz-err').textContent,
      errHidden: document.getElementById('wz-err').hidden,
    };
  });
  r.check('IS-U20（絵コンテが空だと進めず、理由が出る＝描けない間はイシューが定まっていない）',
    u20.stillStep3 && !u20.errHidden && u20.err.includes('絵'),
    JSON.stringify(u20));

  /* IS-U16: 最後まで進んで作成 */
  await setV('#wz-picture', '粒度ごとに実行できたかの表。右上に集まれば仮説どおり');
  await page.click('#wz-next');                       // → Step 4
  await page.click('#wz-add-sub');
  await setV('.wz-s-what', 'どの粒度なら実行できるか');
  await page.selectOption('.wz-s-way', '聞く');
  await setV('.wz-s-who', '柳葉さん経由');
  await setV('.wz-s-due', '2026-09-30');
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
  r.check('IS-U16（最後まで進んで作成: 5段の md が入り、閉じられる器のノートが作られる）',
    u16.closed
    && ['## 1. ゴール', '## 2. 論点', '## 3. 絵コンテ', '## 4. サブイシュー', '## 5. 次の一手']
      .every(h => u16.input.includes(h))
    && u16.input.includes('（マイルストーン: 2026-10-02）')
    && u16.input.includes('> 見送った候補: レビュー体制を増やすべきか')
    && u16.deadline === '2026-09-30'
    && u16.names.some(n => n.includes('ウィザード検証'))
    && u16.body.includes('| どの粒度なら実行できるか | 聞く | 柳葉さん経由 | 2026-09-30 |')
    && u16.body.includes('## 結論'),
    JSON.stringify({ closed: u16.closed, deadline: u16.deadline, names: u16.names,
      head: u16.input.slice(0, 140) }));

  /* IS-U12: FSA 非対応では作成ボタンを無効にして理由を出す（Check Vault と同型） */
  const page2 = r.watch(await browser.newPage());
  await page2.addInitScript(() => { delete window.showDirectoryPicker; });
  await page2.goto(fileUrl('web/issue.html'));
  const u12 = await page2.evaluate(async () => {
    let got = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async t => { got = t; } },
    });
    const i = document.getElementById('input');
    i.value = '## 2. 論点\n- Aは B ではなく C ではないか';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(d => setTimeout(d, 300));
    document.getElementById('copy-btn').click();
    await new Promise(d => setTimeout(d, 200));
    return {
      disabled: document.getElementById('create-btn').disabled,
      pickDisabled: document.getElementById('pick-btn').disabled,
      note: document.getElementById('env-note').textContent,
      noteHidden: document.getElementById('env-note').hidden,
      copyVisible: !document.getElementById('copy-btn').hidden,
      copied: got,
    };
  });
  await page2.close();
  r.check('IS-U12（FSA 非対応: 作成とフォルダ選択が無効＋理由を表示・md コピーだけは使える）',
    u12.disabled === true && u12.pickDisabled === true
    && !u12.noteHidden && u12.note.includes('Chrome') && u12.copyVisible
    && typeof u12.copied === 'string' && u12.copied.includes('## 2. 論点'),
    JSON.stringify({ ...u12, copied: (u12.copied || '').slice(0, 40) }));

  /* IS-U8: 幅390px */
  await page.setViewportSize({ width: 390, height: 800 });
  const u8 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('IS-U8（幅390pxで横スクロールなし）', u8 === true, String(u8));

  /* IS-U23: Cmd/Ctrl+Shift+E で Plan Tasks へ（遷移するので最後） */
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'E', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })));
  await page.waitForURL(/taskboard\.html/, { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('load');
  const u23 = await page.title();
  r.check('IS-U23（Cmd/Ctrl+Shift+E で Plan Tasks へ移る）',
    u23 === 'Plan Tasks (taskboard)', u23);

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
