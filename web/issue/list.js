'use strict';
/* web/issue/list.js — 一覧（カード・論点の行・切り出し・タスクにする）と、閉じる＝振り返り
   入口: web/issue.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- 一覧（IS-Q10。ここが画面の主） ----------
   `Plan Tasks` は開いた瞬間にタスクが並ぶので毎日開かれる。`Check Issue` は作るときにしか
   用が無く、それ以外の日は開く理由がゼロだった（利用者「今のままだと使わない」）。
   **04_Issues を読んでカードで並べる**ことで「見るために開く」道具にする */
const MAX_ISSUES = 200;
let notes = [];

/* 1ノート → カードの配列。**ノートの中身で単位が決まる**（IS-Q12。移行不要）:
   `## 論点` に `- [ ]` 行があれば**行ごと**、無ければ**ノートで1枚**（従来どおり5段のメタを出す） */
function noteOf(text, fileName) {
  const base = summarize(text, fileName);
  base.text = text;
  const items = issueLines(text);
  const note = {
    file: base.file, name: base.name, title: base.title, project: base.project,
    text: text, hasFrontmatter: base.hasFrontmatter, base: base, cards: [],
  };
  if (items.length === 0) {
    base.kind = 'note';
    base.note = note;
    note.cards = [base];
    return note;
  }
  note.cards = items.map(function (L) {
    const vs = judge([L.text], { stage: 'line', deadline: L.due });
    return {
      kind: 'line', note: note,
      file: base.file, name: base.name, title: base.title,
      lineNo: L.lineNo, raw: L.raw, link: L.link,
      issue: L.text, deadline: L.due, doneDate: L.doneDate, conclusion: L.note || '',
      // ノートが閉じていれば行も「閉じたもの」扱い（IS-Q20）
      status: (base.status === 'closed' || L.done) ? 'closed' : 'open', verdict: L.verdict,
      picture: '', subs: 0, ways: { '聞く': 0, '調べる': 0, '試す': 0 }, rows: [],
      next: '', goal: '', hasFrontmatter: base.hasFrontmatter, text: text,
      warn: vs.filter(function (v) { return v.level === 'warn'; }).length, verdicts: vs,
    };
  });
  return note;
}

function earliestDue(n) {
  const ds = n.cards.filter(function (c) { return c.status !== 'closed' && c.deadline; })
    .map(function (c) { return c.deadline; }).sort();
  return ds[0] || '';
}

function dayDiff(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return null;
  const a = new Date(todayStr() + 'T00:00:00');
  const b = new Date(ymd + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function obsidianHref(name) {
  const v = (window.ToolConfig ? ToolConfig.get('vaultName') : '') || '';
  // vault 名が未設定なら**リンクを作らない**（押しても開かないリンクを作らない — coding-rules）
  if (!v) return '';
  return 'obsidian://open?vault=' + encodeURIComponent(v) + '&file=' + encodeURIComponent(name);
}

async function readDirIssues(dir) {
  const list = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !/\.md$/i.test(entry.name)) continue;
    if (list.length >= MAX_ISSUES) return { over: true, list: list };
    const f = await entry.getFile();
    list.push({ name: entry.name, text: await f.text() });
  }
  return { over: false, list: list };
}

async function loadIssues(interactive) {
  if (!fsaAvailable()) return;
  let dir = dirHandle;
  if (interactive || !dir) {
    try { dir = await ensureDir(); } catch (e) {
      if (e && e.name === 'AbortError') return;
      ToolUI.banner($id('banner'), 'error', 'フォルダを開けませんでした: ' + errText(e));
      return;
    }
  }
  if (!dir) return;
  try {
    const res = await readDirIssues(dir);
    if (res.over) {
      ToolUI.banner($id('banner'), 'warn',
        'ノートが ' + MAX_ISSUES + ' 件を超えています。04_Issues 以外のフォルダを選んでいないか確認してください');
      return;
    }
    notes = res.list.map(function (f) { return noteOf(f.text, f.name); });
    // ノートの並びは「いちばん早い締切」順。締切なしは最後
    notes.sort(function (a, b) {
      const x = earliestDue(a), y = earliestDue(b);
      if (!x && !y) return a.name < b.name ? -1 : 1;
      if (!x) return 1;
      if (!y) return -1;
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    $id('reload-btn').hidden = false;
    renderCards();
  } catch (e) {
    ToolUI.banner($id('banner'), 'error', '読み込みに失敗しました: ' + errText(e));
  }
}

function meta(parent, text) {
  if (!text) return;
  const li = document.createElement('li');
  li.textContent = text;
  parent.appendChild(li);
}

/* 論点の一行だけをその場で書く。**判定はその場で出る**（本体と同じ純関数） */
function openIssueEdit(art, btn, it) {
  if (art.querySelector('.ic-edit')) return;
  btn.hidden = true;
  // 読み込み時の件数とライブ判定が並ぶと数が食い違って見える。編集中は古い方を隠す
  const stale = art.querySelector('.ic-warn');
  if (stale) stale.hidden = true;
  const staleList = art.querySelector('.ic-verdicts');
  if (staleList) staleList.hidden = true;
  const box = document.createElement('div');
  box.className = 'ic-edit';
  const line = mkText('', it.issue, '論点を一行で（例: 〜は A ではなく B ではないか）');
  line.className = 'ic-edit-line';
  const due = mkDate('', it.deadline);
  due.className = 'ic-edit-due';
  due.title = 'いつまでに白黒つけるか';
  const vl = document.createElement('ul');
  vl.className = 'ic-verdicts';
  const live = function () {
    renderVerdict(judge([line.value], {
      deadline: due.value,
      unknowns: it.rows.map(function (x) { return x.what; }),
      picture: it.picture,
    }), vl, 'ic-verdicts');
  };
  line.addEventListener('input', live);
  due.addEventListener('input', live);
  due.addEventListener('change', live);
  const row = document.createElement('div');
  row.className = 'ic-edit-row';
  const ok = document.createElement('button');
  ok.type = 'button'; ok.className = 'primary ic-edit-save'; ok.textContent = '保存';
  ok.addEventListener('click', function () { saveIssueLine(it, line.value, due.value); });
  const no = document.createElement('button');
  no.type = 'button'; no.textContent = 'やめる';
  no.addEventListener('click', renderCards);
  row.appendChild(line); row.appendChild(due); row.appendChild(ok); row.appendChild(no);
  box.appendChild(row);
  box.appendChild(vl);
  // 論点は行（.ic-line）の中にあるので、箱は行の直後へ（IS-Q23）
  const lineRow = btn.closest('.ic-line') || btn;
  lineRow.parentNode.insertBefore(box, lineRow.nextSibling);
  chipsAfter(due);
  live();
  line.focus();
}

async function saveIssueLine(it, line, due) {
  const text = nfc(line).trim();
  if (text === '') { ToolUI.banner($id('banner'), 'warn', '論点が空です'); return; }
  if (it.kind === 'line') {
    // 行の書式（インデント・記号・チェック）は保ったまま、本文と締切だけ組み直す
    const lead = (it.raw.match(/^\s*[-*+]\s+\[[ xX]\]\s+/) || ['- [ ] '])[0];
    let body = text;
    if (due) body += ' \u{1F4C5} ' + due;
    if (it.link) body += ' [[' + it.link + ']]';
    await writeNote(it.note, function (cur) { return replaceLine(cur, it.lineNo, lead + body); },
      '論点を書き換えました');
    return;
  }
  await writeNote(it.note, function (cur) {
    let next = setIssueLine(cur, text);
    if (it.hasFrontmatter) next = setFrontmatter(next, { deadline: due || '' });
    return next;
  }, it.title + ' に論点を書きました');
  if (!it.hasFrontmatter && due) {
    ToolUI.banner($id('banner'), 'info',
      '論点は書きました。frontmatter が無いノートなので締切は保存していません');
  }
}

/* Plan Tasks へ渡す（lib/handoff.js）。正本は tasks.md のまま。
   内容は「次の一手」があればそれ、無ければ空（その場で書く）。**論点はメモに、ノートは関連ノートに**入る */
function sendToTasks(it) {
  if (!window.ToolHandoff) return;
  const nx = String(it.next || '').replace(/^-\s*\[[^\]]\]\s*/, '');
  const nextDue = (nx.match(/\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/u) || [])[1] || '';
  const payload = {
    content: nx.replace(/\s*\u{1F4C5}.*$/u, '').trim(),
    issue: it.issue || '',
    memo: it.issue ? '論点: ' + it.issue : '',
    due: nextDue || it.deadline || '',
    link: it.name || '',
    project: (it.note && it.note.project) || it.project || '',   // Plan Tasks が同じ名前のセクションを選ぶ（TB-H4）
  };
  ToolHandoff.send('taskboard', 'task', JSON.stringify(payload), 'taskboard.html');
}

function card(it) {
  const art = document.createElement('article');
  art.className = 'issue-card' + (it.status === 'closed' ? ' is-closed' : '');
  art.dataset.file = it.file;

  // ノート名は行に出さない — ノートのカードの見出しにある（IS-Q23）
  const due = document.createElement('span');
  const d = dayDiff(it.deadline);
  const closed = it.status === 'closed';
  due.className = 'ic-due' + (!closed && d !== null && d < 0 ? ' is-over' : '');
  if (closed) {
    // 閉じたものに「超過」を出さない（もう追う締切ではない）。閉じた日を出す
    due.textContent = it.doneDate ? '✅ ' + it.doneDate + ' に閉じた' : '✅ 閉じた';
  } else {
    due.textContent = it.deadline
      ? '📅 ' + it.deadline + (d === null ? '' : (d < 0 ? '（' + (-d) + '日超過）' : d === 0 ? '（今日）' : '（あと' + d + '日）'))
      : '📅 締切なし';
  }

  /* **論点の一行はその場で書ける**（軽い入口 — IS-Q11）。
     書き殴りノートに1行足すだけでカードが意味を持つ。5段フルはウィザードに任せる */
  const q = document.createElement('button');
  q.type = 'button';
  q.className = 'ic-issue' + (it.issue ? '' : ' is-empty');
  q.textContent = it.issue || '＋ 論点を一行で書く';
  q.title = 'クリックして論点を書く／直す';
  q.addEventListener('click', function () { openIssueEdit(art, q, it); });

  const ul = document.createElement('ul');
  ul.className = 'ic-meta';
  if (it.picture) meta(ul, '🎬 ' + it.picture);
  if (it.next) meta(ul, '▶ 次の一手  ' + it.next.replace(/^-\s*\[[^\]]\]\s*/, ''));
  if (it.subs) {
    const w = it.ways;
    const inner = ['聞く', '調べる', '試す'].filter(function (k) { return w[k]; })
      .map(function (k) { return k + w[k]; }).join('・');
    meta(ul, '🧩 サブイシュー ' + it.subs + '件' + (inner ? '（' + inner + '）' : ''));
  }
  if (it.status === 'closed') {
    // **振り返りの中身**（R6）。判定だけでなく「何が分かったか」を見せないと、見返す価値が無い
    meta(ul, (it.verdict ? '判定: ' + it.verdict : '判定: 未記入')
      + (it.conclusion ? '　—　' + it.conclusion : '　—　（分かったことが書かれていない）'));
  }

  // 1行: ✓／⚠・論点・（切り出し先）・締切・⋯（IS-Q23）
  const row = document.createElement('div');
  row.className = 'ic-line';
  const vlist = document.createElement('ul');
  vlist.className = 'ic-verdicts';
  vlist.hidden = true;
  if (it.warn > 0) {
    const wb = document.createElement('button');
    wb.type = 'button';
    wb.className = 'ic-warn';
    wb.textContent = '⚠ ' + it.warn;
    wb.title = '引っかかり ' + it.warn + '件（押すと直し方を出す）';
    wb.addEventListener('click', function () {
      vlist.hidden = !vlist.hidden;
      wb.setAttribute('aria-expanded', String(!vlist.hidden));
    });
    row.appendChild(wb);
    for (let i = 0; i < it.verdicts.length; i++) {
      const v = it.verdicts[i];
      const li = document.createElement('li');
      li.className = 'v-' + v.level;
      li.dataset.id = v.id;
      li.textContent = (v.level === 'warn' ? '⚠ ' : '· ') + v.msg + ' — ' + v.fix;
      vlist.appendChild(li);
    }
  } else {
    // 何も出ないと「判定されたのか」が分からない。通ったことも言う（IS-Q5 の2段表示と同じ考え）
    const ok = document.createElement('span');
    ok.className = 'ic-ok';
    ok.textContent = '✓';
    ok.title = '引っかかりなし';
    row.appendChild(ok);
  }
  row.appendChild(q);
  if (it.kind === 'line' && it.link) {
    const lh = obsidianHref(it.link);
    const la = document.createElement(lh ? 'a' : 'span');
    la.className = 'ic-spun';
    la.textContent = '↗ ' + it.link;
    la.title = 'この論点から切り出したノート';
    if (lh) la.href = lh;
    row.appendChild(la);
  }
  row.appendChild(due);
  // 行の操作は ⋯ にしまう（ボタンが中身より多かった — IS-Q23）
  const more = document.createElement('details');
  more.className = 'ic-more';
  const sm = document.createElement('summary');
  sm.textContent = '⋯';
  sm.title = 'この論点の操作（タスクにする・ちゃんと立てる・閉じる）';
  more.appendChild(sm);
  const menu = document.createElement('div');
  menu.className = 'ic-menu';
  if (it.status !== 'closed') {
    /* **タスクは論点の下に生まれる**（R8）。Plan Tasks の追加モーダルを
       論点・関連ノート・期限を入れた状態で開く。「この一手はどの論点のため？」を
       タスクを作る瞬間に問うための経路 */
    const tb = document.createElement('button');
    tb.type = 'button';
    tb.className = 'ic-task';
    tb.textContent = 'タスクにする…';
    tb.title = 'Plan Tasks の追加画面を、この論点を添えて開く';
    tb.addEventListener('click', function () { more.open = false; sendToTasks(it); });
    menu.appendChild(tb);
  }
  if (it.status !== 'closed' && !(it.kind === 'line' && it.link)) {
    const fb = document.createElement('button');
    fb.type = 'button';
    fb.className = 'ic-frame';
    fb.textContent = it.kind === 'line' ? 'ちゃんと立てる…' : 'このノートに問いを立てる…';
    fb.addEventListener('click', function () { more.open = false; wzOpenFor(it); });
    menu.appendChild(fb);
    const cb = document.createElement('button');
    cb.type = 'button';
    cb.className = 'ic-close';
    cb.textContent = '閉じる…';
    cb.addEventListener('click', function () { more.open = false; openCloseModal(it); });
    menu.appendChild(cb);
  }
  if (menu.childNodes.length) { more.appendChild(menu); row.appendChild(more); }
  art.appendChild(row);
  // ⚠ の1つ目の理由は押さなくても読めるように行のすぐ下へ（訓練）
  const firstWarn = (it.verdicts || []).filter(function (v) { return v.level === 'warn'; })[0];
  if (it.warn > 0 && firstWarn) {
    const why = document.createElement('p');
    why.className = 'ic-why';
    why.textContent = '└ ' + firstWarn.msg;
    art.appendChild(why);
  }
  if (ul.childNodes.length) art.appendChild(ul);   // 空の一覧で余白を作らない
  art.appendChild(vlist);
  return art;
}

function visibleCards(note) {
  const f = $id('f-status').value;
  return note.cards.filter(function (c) {
    if (f === 'all') return true;
    if (f === 'closed') return c.status === 'closed';
    return c.status !== 'closed';
  });
}

/* ノート見出し。**ここが「論点を足す」の置き場**（行カードはノート名を持たないため）。
   `## 論点` を持たないノートでも押せる = 行モデルへの移行がここから始まる（強制しない） */
function noteHeader(n) {
  const row = document.createElement('div');
  row.className = 'note-head';
  // 主役はノート名（何の話か — IS-Q23）。絵文字は付けない
  const t = document.createElement('h3');
  t.className = 'note-name';
  t.textContent = n.title;
  row.appendChild(t);
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'note-add';
  add.textContent = '＋ 論点を足す';
  add.addEventListener('click', function () { openAddIssue(row, n); });
  row.appendChild(add);
  // Obsidian で開く はノートに1つ（行ごとには出さない）。vault 名が未設定なら作らない
  const href = obsidianHref(n.name);
  if (href) {
    const a = document.createElement('a');
    a.className = 'note-open ic-obsidian';
    a.href = href;
    a.textContent = 'Obsidian で開く';
    row.appendChild(a);
  }
  // ノート単位の閉じる（IS-Q20）は ⋯ にしまう。閉じたノートには出さない
  if (n.base && n.base.status !== 'closed') {
    const more = document.createElement('details');
    more.className = 'note-more';
    const sm = document.createElement('summary');
    sm.textContent = '⋯';
    sm.title = 'このノートの操作';
    more.appendChild(sm);
    const menu = document.createElement('div');
    menu.className = 'ic-menu';
    const cl = document.createElement('button');
    cl.type = 'button';
    cl.className = 'note-close';
    cl.textContent = 'ノートを閉じる…';
    cl.title = 'このノート全体を閉じる（frontmatter に status: closed と閉じた日を書く。片づけは Check Vault）';
    cl.addEventListener('click', function () { more.open = false; openCloseModal(noteCardOf(n)); });
    menu.appendChild(cl);
    more.appendChild(menu);
    row.appendChild(more);
  }
  return row;
}

// ノート単位で閉じるためのカード相当（applyClose の非 line 経路が読む項目だけ）
function noteCardOf(n) {
  return { kind: 'note', note: n, file: n.file, name: n.name, title: n.title, issue: '',
    hasFrontmatter: n.hasFrontmatter };
}

function openAddIssue(row, n) {
  if (row.nextSibling && row.nextSibling.classList
      && row.nextSibling.classList.contains('ic-edit')) return;
  const box = document.createElement('div');
  box.className = 'ic-edit';
  const line = mkText('', '', '論点を一行で（例: 〜は A ではなく B ではないか）');
  line.className = 'ic-edit-line';
  const due = mkDate('', '');
  due.className = 'ic-edit-due';
  const vl = document.createElement('ul');
  vl.className = 'ic-verdicts';
  const live = function () {
    renderVerdict(judge([line.value], { stage: 'line', deadline: due.value }), vl, 'ic-verdicts');
  };
  line.addEventListener('input', live);
  due.addEventListener('input', live);
  due.addEventListener('change', live);
  const r2 = document.createElement('div');
  r2.className = 'ic-edit-row';
  const ok = document.createElement('button');
  ok.type = 'button'; ok.className = 'primary ic-edit-save'; ok.textContent = '足す';
  ok.addEventListener('click', function () { saveAddIssue(n, line.value, due.value); });
  const no = document.createElement('button');
  no.type = 'button'; no.textContent = 'やめる';
  no.addEventListener('click', renderCards);
  r2.appendChild(line); r2.appendChild(due); r2.appendChild(ok); r2.appendChild(no);
  box.appendChild(r2);
  box.appendChild(vl);
  row.parentNode.insertBefore(box, row.nextSibling);
  chipsAfter(due);
  live();
  line.focus();
}

async function saveAddIssue(n, line, due) {
  const text = nfc(line).trim();
  if (text === '') { ToolUI.banner($id('banner'), 'warn', '論点が空です'); return; }
  await writeNote(n, function (cur) { return addIssueLine(cur, text, due); },
    n.title + ' に論点を足しました');
}

function renderCards() {
  const host = $id('cards');
  host.textContent = '';
  const label = { open: '開いているもの', all: 'すべて', closed: '閉じたもの' }[$id('f-status').value];
  const groups = notes.map(function (n) { return { n: n, cards: visibleCards(n) }; })
    .filter(function (g) { return g.cards.length > 0; });
  let total = 0;
  for (let i = 0; i < groups.length; i++) total += groups[i].cards.length;
  let tally = '';
  if ($id('f-status').value !== 'open') {
    // 訓練の成績表（R6）: 立てた問いがどれだけ当たったか
    const closed = [];
    notes.forEach(function (n) { n.cards.forEach(function (c) { if (c.status === 'closed') closed.push(c); }); });
    const cnt = function (v) { return closed.filter(function (c) { return c.verdict === v; }).length; };
    if (closed.length) tally = '　閉じた ' + closed.length + '：当たり ' + cnt('当たり') + '・外れ ' + cnt('外れ') + '・未決 ' + cnt('未決');
  }
  $id('summary').textContent = notes.length === 0 ? '' : total + '件（' + label + '）' + tally;
  if (notes.length === 0) $id('howto').open = true;   // 初見は使い方を開いておく（R10）
  if (groups.length === 0) {
    const p = document.createElement('p');
    p.className = 'ic-empty';
    p.textContent = notes.length === 0
      ? (fsaAvailable() ? '［📂 04_Issues を開く］でフォルダを選ぶと、イシューがここに並びます'
                        : 'このブラウザでは一覧を読み込めません（Chrome 系で開いてください）')
      : '該当なし';
    host.appendChild(p);
    return;
  }
  // 案件ごとにまとめる（IS-Q23）。並びはノートの並び（締切順）で最初に出た順・案件なしは最後
  const order = [], byProj = {};
  for (let i = 0; i < groups.length; i++) {
    const k = groups[i].n.project || '';
    if (!byProj[k]) { byProj[k] = []; if (k !== '') order.push(k); }
    byProj[k].push(groups[i]);
  }
  if (byProj['']) order.push('');
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    const ph = document.createElement('h2');
    ph.className = 'proj-head';
    ph.textContent = (k || '案件なし') + '（' + byProj[k].length + '）';
    host.appendChild(ph);
    for (let j = 0; j < byProj[k].length; j++) host.appendChild(noteCard(byProj[k][j]));
  }
}

// ノート＝1枚（IS-Q23）: 見出し（ノート名・＋論点・Obsidian・⋯）→ 量（掘る・論点・画像）→ 論点の行
function noteCard(g) {
  const sec = document.createElement('section');
  sec.className = 'note-card' + (g.n.base && g.n.base.status === 'closed' ? ' is-closed' : '');
  sec.appendChild(noteHeader(g.n));
  const st = noteStats(g.n.text);
  const parts = [];
  if (st.dig) parts.push('掘る ' + st.dig + '行');
  if (st.lines) parts.push('論点 ' + st.lines);
  if (st.images) parts.push('画像 ' + st.images);
  if (parts.length) {
    const p = document.createElement('div');
    p.className = 'note-stats';
    p.textContent = parts.join('・');
    sec.appendChild(p);
  }
  for (let k = 0; k < g.cards.length; k++) sec.appendChild(card(g.cards[k]));
  return sec;
}

/* ノートへの書き込みの共通経路。**書き込む直前に再読して NFC 比較**（鮮度チェック） */
async function writeNote(n, transform, okMsg) {
  if (!dirHandle) { ToolUI.banner($id('banner'), 'warn', '先に［📂 04_Issues を開く］でフォルダを選んでください'); return false; }
  try {
    const fh = await dirHandle.getFileHandle(n.file);
    const cur = await (await fh.getFile()).text();
    if (nfc(cur) !== nfc(n.text)) {
      ToolUI.banner($id('banner'), 'warn',
        'Obsidian 側で変更されています。［再読込］してからもう一度お願いします（上書きは避けました）');
      return false;
    }
    const w = await fh.createWritable();
    await w.write(transform(cur));
    await w.close();
    if (okMsg) ToolUI.banner($id('banner'), 'success', okMsg);
    await loadIssues(false);
    return true;
  } catch (e) {
    ToolUI.banner($id('banner'), 'error', '書き込めませんでした: ' + errText(e));
    return false;
  }
}

/* ---------- 閉じる = 振り返り（IS-Q2 再改訂） ---------- */
let closing = null;

function openCloseModal(it) {
  closing = it;
  $id('cm-target').textContent = it.title + (it.issue ? ' — ' + it.issue : '');
  $id('cm-note').value = '';
  $id('cm-told').value = '';
  $id('cm-err').hidden = true;
  $id('cm-err').textContent = '';
  const first = document.querySelector('input[name="cm-v"]');
  if (first) first.checked = true;
  $id('close-modal').hidden = false;
  $id('cm-note').focus();
}
function closeCloseModal() { $id('close-modal').hidden = true; closing = null; }

async function applyClose() {
  if (!closing || !dirHandle) return;
  const it = closing;
  const picked = document.querySelector('input[name="cm-v"]:checked');
  const verdict = picked ? picked.value : '未決';
  const note = nfc($id('cm-note').value).trim();
  // 伝えた先（IS-Q18）: 本の終点は「受け手が判断できる完成形」。判断が動いたかを残す（任意）
  const told = nfc($id('cm-told').value).trim();

  if (it.kind === 'line') {
    // 行を閉じ、分かったことは**その論点の子行**に置く（ノートに複数の論点があるため）
    const ok = await writeNote(it.note, function (cur) {
      let next = replaceLine(cur, it.lineNo, closeLineRaw(it.raw, verdict, todayStr()));
      // 先に「伝えた」を差してから「分かったこと」を差す → 並びは 分かったこと / 伝えた
      if (told !== '') next = insertAfterLine(next, it.lineNo, '\t- 伝えた: ' + told);
      if (note !== '') next = insertAfterLine(next, it.lineNo, '\t- ' + note);
      return next;
    }, null);
    if (!ok) { $id('cm-err').textContent = '書き込めませんでした。Obsidian 側で変更されているかもしれません（［再読込］してからもう一度）'; $id('cm-err').hidden = false; return; }
    closeCloseModal();
    // 最後の開いている行だったら「ノートも閉じる？」を添える（強制しない — IS-Q20）
    const stillOpen = (it.note.cards || []).some(function (c) {
      return c.kind === 'line' && c.lineNo !== it.lineNo && c.status !== 'closed';
    });
    const b = ToolUI.banner($id('banner'), 'success', '論点を閉じました（' + verdict + '）'
      + (stillOpen ? '' : ' — このノートの論点は全部閉じました'));
    if (!stillOpen) {
      const name = it.note.name;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'ノートも閉じる…';
      btn.style.marginLeft = '10px';
      // 再読込後のノートで開く（古いオブジェクトだと鮮度チェックに掛かる）
      btn.addEventListener('click', function () {
        const fresh = notes.find(function (n) { return n.name === name; });
        if (fresh) openCloseModal(noteCardOf(fresh));
      });
      b.appendChild(btn);
    }
    return;
  }

  // ノート単位（5段ノート・見出しの［ノートを閉じる…］）。frontmatter が無ければ setFrontmatter が作る
  const ok2 = await writeNote(it.note, function (cur) {
    let next = setFrontmatter(cur, { status: 'closed', verdict: verdict, closed: todayStr() });
    if (note !== '') next = appendToSection(next, '## 結論', '- ' + note);
    if (told !== '') next = appendToSection(next, '## 結論', '- 伝えた: ' + told);
    return next;
  }, null);
  if (!ok2) { $id('cm-err').textContent = '書き込めませんでした。Obsidian 側で変更されているかもしれません（［再読込］してからもう一度）'; $id('cm-err').hidden = false; return; }
  closeCloseModal();
  ToolUI.banner($id('banner'), 'success', it.title + ' を閉じました（' + verdict + '）');
}

/* vault 名（lib/config.js）。効くのは Obsidian リンクだけで、読み書きには一切関係しない */
function applyVaultCfg() {
  if (!window.ToolConfig) return;
  $id('cfg-vault').value = ToolConfig.get('vaultName') || '';
}
$id('cfg-vault').addEventListener('change', function () {
  if (window.ToolConfig) ToolConfig.set({ vaultName: $id('cfg-vault').value });
  renderCards();
});

$id('pick-btn').addEventListener('click', function () { loadIssues(true); });
$id('reload-btn').addEventListener('click', function () { loadIssues(false); });
$id('f-status').addEventListener('change', renderCards);
$id('cm-cancel').addEventListener('click', closeCloseModal);
$id('cm-ok').addEventListener('click', applyClose);

