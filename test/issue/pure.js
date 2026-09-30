'use strict';
/* test/issue/pure.js — 節: 純関数（parseSections / judge / toNote / toTasks / 一覧の解析 / 書き込み / 論点の行 / ウィザードの下書き）
   入口: test/issue.js（ctx を受け取る。単独実行は node test/issue.js pure）
   照合する ID: IS-01〜23・L1〜L10。期待値の正本は docs/specs/issue.md */
module.exports = {
  name: 'pure',
  ids: 'IS-01〜23・L1〜L10',
  async run(ctx) {
    const { page, browser, r, eq, fileUrl, SAMPLE_MD, ready, setValue } = ctx;
    if (!ready) return;   // window.issue のフックが無ければ純関数の照合はできない（原本の if (ready) と同じ）
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

    r.check('IS-11（frontmatter＋H1＋5見出し＋分かったこと/結論/掘る。空セクションも見出しは残る）',
      n.note.startsWith('---\n') && n.note.includes('created: 2026-09-24')
      && n.note.indexOf('## 掘る') > n.note.indexOf('## 結論') && n.note.indexOf('## 結論') > 0
      && n.note.includes('deadline: 2026-09-30') && n.note.includes('status: open')
      && n.note.includes('tags: [issue]') && n.note.includes('# 本番停止手順書')
      && ['## 1. ゴール', '## 2. 論点', '## 3. 最終形', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => n.note.includes(h))
      && ['## 1. ゴール', '## 3. 最終形', '## 4. サブイシュー', '## 5. 次の一手']
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
      /\|\s*どの粒度なら実行できるかを聞く\s*\|\s*\|\s*聞く\s*\|/.test(n.note)
      && /\|\s*サービス一覧を調べる\s*\|\s*\|\s*調べる\s*\|/.test(n.note),
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

    r.check('IS-L1（frontmatter を読み、キーを差し替えても本文が1文字も変わらない・無ければ先頭に作る）',
      L.data.status === 'open' && L.data.deadline === '2026-09-30' && L.bodyKeepsTitle
      && L.patched.includes('status: closed') && L.patched.includes('verdict: 当たり')
      && !L.patched.includes('status: open')
      && L.bodyUnchanged
      && L.noFm === '---\nstatus: closed\n---\n見出しだけ\n## 結論\n- x',
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

    /* ========== IS-L7〜L9: 論点の行（tasks.md と同じ最小単位） ========== */
    const LINES_NOTE = [
      '---', 'created: 2026-09-24', 'status: open', 'tags: [issue]', '---',
      '# 20260924_現状整理', '',
      '## 論点', '',
      '- [ ] 手順書が書けないのは粒度の合意が無いからではないか \u{1F4C5} 2026-09-30',
      '- [ ] V13 は再受領の可否が未確認だからではないか \u{1F4C5} 2026-10-02 [[2026-09-24_V13再受領]]',
      '- [x] 検証は OS のみでよいのではないか \u{1F4C5} 2026-09-20 \u{2705} 2026-09-24 外れ',
      '- ただの箇条書き（チェックボックス無し）は論点に数えない', '',
      'TODO', '- 富士通に確認', '',
    ].join('\n');

    const LN = await page.evaluate((note) => {
      const I = window.issue;
      const items = I.issueLines(note);
      const added = I.addIssueLine(note, '新しい論点は A ではなく B ではないか', '2026-10-05');
      const made = I.addIssueLine('---\nstatus: open\n---\n# t\n\n書き殴り\n', '初めての論点', '');
      const closed = I.closeLineRaw(items[0].raw, '当たり', '2026-09-24');
      const twice = I.closeLineRaw(closed, '当たり', '2026-09-25');
      const linked = I.linkLineRaw(items[0].raw, '2026-09-24_停止手順書.md');
      const linkTwice = I.linkLineRaw(linked, '2026-09-24_停止手順書');
      const replaced = I.replaceLine(note, items[0].lineNo, closed);
      return { items, added, made, closed, twice, linked, linkTwice, replaced };
    }, LINES_NOTE);

    r.check('IS-L7（- [ ] 行だけを拾い、📅 ✅ 判定 リンクを外した本文を返す）',
      LN.items.length === 3
      && LN.items[0].text === '手順書が書けないのは粒度の合意が無いからではないか'
      && LN.items[0].due === '2026-09-30' && LN.items[0].done === false
      && LN.items[1].link === '2026-09-24_V13再受領'
      && LN.items[1].text === 'V13 は再受領の可否が未確認だからではないか'
      && LN.items[2].done === true && LN.items[2].doneDate === '2026-09-24'
      && LN.items[2].verdict === '外れ'
      && LN.items[2].text === '検証は OS のみでよいのではないか',
      JSON.stringify(LN.items));

    r.check('IS-L8（節の末尾に足す・節が無ければ本文の先頭に作る・指定行だけ差し替える）',
      LN.added.indexOf('- [ ] 新しい論点は A ではなく B ではないか \u{1F4C5} 2026-10-05')
        > LN.added.indexOf('- [x] 検証は OS のみでよいのではないか')
      && LN.added.includes('TODO')
      && LN.made.includes('## 論点') && LN.made.includes('- [ ] 初めての論点')
      && LN.made.indexOf('## 論点') < LN.made.indexOf('書き殴り')
      && LN.replaced.includes('- [x] 手順書が書けないのは')
      && (LN.replaced.match(/- \[x\] 手順書/g) || []).length === 1,
      JSON.stringify({ added: LN.added.slice(LN.added.indexOf('## 論点'), LN.added.indexOf('TODO')), made: LN.made }));

    r.check('IS-L9（閉じると [x]＋✅日付＋判定・二重に付かない／リンクも二重に付かない）',
      /^- \[x\] /.test(LN.closed) && LN.closed.includes('\u{2705} 2026-09-24')
      && LN.closed.endsWith('当たり')
      && (LN.twice.match(/\u{2705}/gu) || []).length === 1
      && (LN.twice.match(/当たり/g) || []).length === 1
      && LN.linked.endsWith('[[2026-09-24_停止手順書]]')
      && (LN.linkTwice.match(/\[\[/g) || []).length === 1,
      JSON.stringify([LN.closed, LN.twice, LN.linkTwice]));

    /* ========== IS-17/18: ウィザードの下書き → md ========== */
    const w = await page.evaluate(() => {
      const md = window.issue.buildMd({
        milestone: '運営チームが本番を止められる状態', milestoneDue: '2026-10-02',
        candidates: [{ text: '情報不足ではなく合意が無いからではないか', effect: '依頼内容が変わる' },
                     { text: '見送った方の問い', effect: '' }],
        chosen: 0, issueDue: '2026-09-30',
        pictureKind: '表', picture: '粒度ごとに実行できたかの表',
        subs: [{ what: '粒度', pic: '', way: '聞く', who: '柳葉さん', due: '2026-09-30' }],
        next: '粒度を確認する', nextDue: '2026-10-02',
      });
      const through = window.issue.toNote(
        window.issue.parseSections('## 4. サブイシュー\n| a | 聞く | b | c |'),
        { deadline: '', today: '2026-09-24', title: 'x' });
      return { md: md, through: through };
    });
    r.check('IS-17（buildMd: 5見出し・マイルストーンの期限・不明点は表の行・次の一手はタスク記法）',
      ['## 1. ゴール', '## 2. 論点', '## 3. 最終形', '## 4. サブイシュー', '## 5. 次の一手']
        .every(h => w.md.includes(h))
      && w.md.includes('- 運営チームが本番を止められる状態（マイルストーン: 2026-10-02）')
      && w.md.includes('- 情報不足ではなく合意が無いからではないか')
      && w.md.includes('> 答えが出たら: 依頼内容が変わる')
      && w.md.includes('> 見送った候補: 見送った方の問い')
      && w.md.includes('- 【表】粒度ごとに実行できたかの表')
      && w.md.includes('| 粒度 |  | 聞く | 柳葉さん | 2026-09-30 |')
      && w.md.includes('- [ ] 粒度を確認する \u{1F4C5} 2026-10-02'),
      w.md);
    r.check('IS-18（toNote は「|」始まりの不明点を表に組み直さない — 4セルの旧行は空の白黒セルを挿入して5列に揃える）',
      w.through.includes('| a |  | 聞く | b | c |')
      && (w.through.match(/\| a \|/g) || []).length === 1,
      (w.through.split('## 4. サブイシュー')[1] || '').slice(0, 220));

    /* ========== IS-22/23/L10（2026-09-25 監査: 型・最終形・白黒列・筋・掘るの止め時） ========== */
    const a25 = await page.evaluate(() => {
      const I = window.issue;
      const alias = I.parseSections('## 3. 最終形\n- 【表】最終形の表\n## 4. サブイシュー\n| a | ログ | 調べる | b | c |\n> 筋: a → b');
      const note = I.toNote(alias, { deadline: '', today: '2026-09-25', title: 'x' });
      const legacy = I.toNote(I.parseSections('## 4. サブイシュー\n| a | 聞く | b | c |'), { today: '2026-09-25', title: 'x' });
      const mdA = I.buildMd({ kind: 'A', milestone: 'M', milestoneDue: '2026-10-02',
        candidates: [{ text: 'X ではなく Y ではないか', effect: '' }], chosen: 0, pictureKind: '表', picture: 'P',
        subs: [{ what: '粒度', pic: '粒度別の○×表', way: '聞く', who: '柳葉さん', due: '2026-09-30' }],
        story: '粒度が決まる\n量が決まる\n', next: 'N', nextDue: '' });
      const mdB = I.buildMd({ kind: 'B', visions: '10月末に検証環境で全機能が動く\n本番切替まで含めて終わる\n', milestoneDue: '2026-09-30',
        candidates: [{ text: 'X', effect: '' }], chosen: 0, pictureKind: '一文', picture: 'P', subs: [], story: '', next: '', nextDue: '' });
      return { alias: alias.picture, note, legacy, mdA, mdB,
        rows5: I.subRows(['| 分からないこと | 何を見れば白黒つく | 聞く / 調べる / 試す | 誰に・どこで | いつまでに |',
          '| --- | --- | --- | --- | --- |', '| 粒度 | ○×表 | 聞く | 柳葉さん | 2026-09-30 |', '> 筋: a → b']),
        rows4: I.subRows(['| 一覧 | 調べる |  |  |']) };
    });
    r.check('IS-22（「最終形」は picture・toNote は「## 3. 最終形」・5列の表・4セルの旧行に空セル・「> 筋」は表の後・掘るの1行目に止め時）',
      eq(a25.alias, ['【表】最終形の表'])
      && a25.note.includes('## 3. 最終形') && !a25.note.includes('## 3. 絵コンテ')
      && a25.note.includes('| 分からないこと | 何を見れば白黒つく | 聞く / 調べる / 試す | 誰に・どこで | いつまでに |')
      && a25.note.includes('| a | ログ | 調べる | b | c |')
      && a25.note.indexOf('> 筋: a → b') > a25.note.indexOf('| a | ログ |')
      && a25.legacy.includes('| a |  | 聞く | b | c |')
      && /## 掘る\n\n> 10分/.test(a25.note),
      (a25.note.split('## 3.')[1] || '').slice(0, 400));
    r.check('IS-23（buildMd: ゴールに「> 型:」・ビジョン設定型は目指す姿と見送った候補・表に白黒列・「> 筋: a → b」）',
      a25.mdA.includes('> 型: ギャップフィル') && a25.mdA.includes('- M（マイルストーン: 2026-10-02）')
      && a25.mdA.includes('| 粒度 | 粒度別の○×表 | 聞く | 柳葉さん | 2026-09-30 |')
      && a25.mdA.includes('> 筋: 粒度が決まる → 量が決まる')
      && a25.mdB.includes('> 型: ビジョン設定')
      && a25.mdB.includes('- 目指す姿（仮）: 10月末に検証環境で全機能が動く（仮決め: 2026-09-30）')
      && a25.mdB.includes('> 見送った候補: 本番切替まで含めて終わる') && !a25.mdB.includes('> 筋:'),
      a25.mdA.split('## 2. 論点')[0] + '\n…\n' + a25.mdB.split('## 2. 論点')[0]);
    r.check('IS-L10（subRows: 5列は what/pic/way/who/due・4列の旧行は pic 空・「>」行は拾わない）',
      a25.rows5.length === 1 && a25.rows5[0].pic === '○×表' && a25.rows5[0].way === '聞く' && a25.rows5[0].due === '2026-09-30'
      && a25.rows4.length === 1 && a25.rows4[0].pic === '' && a25.rows4[0].way === '調べる',
      JSON.stringify([a25.rows5, a25.rows4]));
    const a24 = await page.evaluate(() => ({
      with: window.issue.toNote(window.issue.parseSections('## 2. 論点\n- x'), { today: '2026-09-25', title: 'x', project: 'ITK' }),
      without: window.issue.toNote(window.issue.parseSections('## 2. 論点\n- x'), { today: '2026-09-25', title: 'x' }),
    }));
    r.check('IS-24（toNote: project を渡すと status の直後に project: ITK・渡さなければ project 行は無い）',
      a24.with.includes('\nstatus: open\nproject: ITK\n') && !/^project:/m.test(a24.without),
      a24.with.split('---')[1]);
    const a25j = await page.evaluate(() => {
      const ids = (l, lv) => window.issue.judge([l], { stage: 'line', deadline: '2026-09-30' })
        .filter(v => v.level === lv).map(v => v.id);
      const L = {
        ex1: 'JP1でFTP通信をしているものがあるか。', ex2: 'JP1を本番環境停止時に止める必要があるか。',
        ex3: '検証環境構築時に、本番環境との通信は遮断されるのか。', ex4: 'JP1で、再起動しているタスクがあれば内容をもらいたい。',
        hy1: 'この案件が難しいと感じるのは決まっていないことも、ゴールも見えていないからではないか',
        hy2: '検証は OS のみでよいのではないか', hy3: '通信は遮断されるのではないでしょうか',
        wh1: 'どの粒度なら運営チームが実行できるか', wh2: '停止手順はどこから潰すか', why: 'なぜ手順書が書けないのか',
      };
      const out = {};
      for (const k of Object.keys(L)) out[k] = ids(L[k], 'warn');
      return out;
    });
    const hasOnly = (arr, id) => arr.includes(id);
    r.check('IS-25（はい/いいえの問いは closed・依頼は request が warn／仮説・疑問詞つきは出ない／なぜ〜のか は why だけ）',
      hasOnly(a25j.ex1, 'closed') && hasOnly(a25j.ex2, 'closed') && hasOnly(a25j.ex3, 'closed')
      && hasOnly(a25j.ex4, 'request') && !a25j.ex4.includes('closed')
      && ['hy1', 'hy2', 'hy3', 'wh1', 'wh2'].every(k => !a25j[k].includes('closed') && !a25j[k].includes('request'))
      && a25j.why.includes('why') && !a25j.why.includes('closed'),
      JSON.stringify(a25j));

    /* ========== IS-L11 / IS-26（2026-09-30: 一覧の見せ方・判定の体言止め） ========== */
    const l11 = await page.evaluate(() => (window.issue.noteStats ? window.issue.noteStats([
      '---', 'status: open', '---', '# t', '', '## 論点', '', '- [ ] 甲は A ではなく B ではないか', '- [x] 乙は C ではないか', '',
      '## 掘る', '', '> 10分で論点の行が書けなければ「悩んでいる」', '', '- ', '- 中身1', '\t- 中身2', '![[shot.png]]', '',
      '## 分かったこと', '- 別の節', '![](a/b.jpg)', ''].join('\n')) : null));
    r.check('IS-L11（noteStats: 掘るは注記・空の「- 」を除いた行数（画像の行も数える）・画像は全体・論点は行数）',
      eq(l11, { dig: 3, images: 2, lines: 2 }), JSON.stringify(l11));
    const i26 = await page.evaluate(() => {
      const ids = l => window.issue.judge([l], { stage: 'line', deadline: '2026-10-01' }).filter(v => v.level === 'warn').map(v => v.id);
      return [ids('検証環境作成をゴールにして再度タスクの洗い出しと現場確認'), ids('手順書の粒度の確認。'),
        ids('手順書が書けないのは情報不足ではなく合意が無いからではないか'), ids('何を話す必要があるか')];
    });
    r.check('IS-26（体言止めの作業（〜確認・〜洗い出し）は worktheme／仮説・WHAT の問いは出ない）',
      i26[0].includes('worktheme') && i26[1].includes('worktheme') && !i26[2].includes('worktheme') && !i26[3].includes('worktheme'),
      JSON.stringify(i26));
  },
};
