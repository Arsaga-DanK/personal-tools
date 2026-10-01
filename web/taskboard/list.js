'use strict';
/* web/taskboard/list.js — 一覧の描画・検索ハイライト・行の描画・インライン編集と IME ガード
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- 描画 ---------- */

// 戻り値: 成功したか（呼び出し側が成功時だけ案内バナーを出せるようにする）
// 複数 op を1回の render でまとめて適用する（バーの平行移動は setStart + setDue の2つ）。
// 途中で失敗したら、そこまでの変更を画面に反映してから理由を出す（画面とモデルを食い違わせない）
function applyUiOps(ops) {
  try {
    for (const op of ops) {
      runOp(state.lines, op, todayStr());
      rememberFromOp(op);
    }
    hideBanner();
    render();
    scheduleAutoSave();        // 変更の中心はここ1箇所（spec「自動保存」）
    return true;
  } catch (e) {
    showBanner('error', '操作に失敗しました: ' + (e && e.message));
    if (ops.length > 1) render();
    return false;
  }
}
function applyUiOp(op) { return applyUiOps([op]); }

/* 削除・移動は直前の1回だけ戻せる（TB-Q65。汎用 undo ではない — TB-Q8 の例外）。
   戻すのは操作の直前の行そのもの。そのあとに別の変更があれば戻さない */
function applyUndoable(op, msg) {
  const snap = state.lines.map(l => ({ raw: l.raw, orig: l.orig }));
  const savedAt = state.snapshot;
  if (!applyUiOp(op)) return false;
  state.collapsed.clear();          // 行番号がずれるので、たたみは解く
  state.lastUndo = { snap, savedAt, after: joinLines(state.lines) };
  showBanner('info', msg + '（直前の1回だけ戻せます）', [{ label: '元に戻す', onClick: undoLast }]);
  return true;
}
function undoLast() {
  const u = state.lastUndo;
  if (!u) { showBanner('warn', '戻せる操作がありません'); return false; }
  if (joinLines(state.lines) !== u.after) {
    state.lastUndo = null;
    showBanner('warn', 'そのあとに別の変更があるため戻せません');
    return false;
  }
  // 操作のあとに自動保存されていたら、戻した行はすべて保存済みの扱い（追加行の印を復活させない）
  const saved = state.snapshot !== u.savedAt;
  state.lines = u.snap.map(l => ({ raw: l.raw, orig: saved ? l.raw : l.orig }));
  state.lastUndo = null;
  state.collapsed.clear();
  render();
  scheduleAutoSave();
  showBanner('info', '元に戻しました');
  return true;
}

// 削除の確認文（TB-DEL4）。子・メモの数と、このタスクを先行にしているタスクの数を出す
function deleteMessage(t) {
  const sub = [];
  (function walk(x) { sub.push(x); for (const c of x.children) walk(c); })(t);
  const kids = sub.length - 1;
  const i = t.line - 1;
  const memos = (subtreeEnd(state.lines, i) - i + 1) - sub.length;
  const inSub = new Set(sub.map(x => x.line));
  const ids = sub.map(x => x.id).filter(Boolean);
  const dependents = state.doc.tasks.filter(x => !inSub.has(x.line) && x.dependsOn.some(id => ids.includes(id))).length;
  const parts = [];
  if (kids) parts.push('子タスク ' + kids + ' 件');
  if (memos) parts.push('メモ ' + memos + ' 行');
  return '「' + (t.displayBody || t.body || '(内容なし)') + '」を削除します' +
    (parts.length ? '（' + parts.join('・') + 'も一緒に）' : '') + '。' +
    (dependents ? 'このタスクを先行にしているタスクが ' + dependents + ' 件あります（⛔ の印は残ります）。' : '') +
    'よろしいですか？';
}
function confirmDeleteTask(t) {
  if (!confirm(deleteMessage(t))) return false;
  return applyUndoable({ type: 'deleteTask', line: t.line }, '削除しました');
}

// ドラッグの落とし先: 行の上 1/4＝前・下 1/4＝後・真ん中＝子（TB-K19・K20）
function dropZone(tr, y) {
  const rc = tr.getBoundingClientRect();
  const k = (y - rc.top) / (rc.height || 1);
  return k < 0.25 ? 'before' : (k > 0.75 ? 'after' : 'child');
}
function clearDropMarks() {
  for (const x of document.querySelectorAll('#task-table tr.drop-before, #task-table tr.drop-child, #task-table tr.drop-after, #task-table tr.drop-sec')) {
    x.classList.remove('drop-before', 'drop-child', 'drop-after', 'drop-sec');
  }
}

// 追加フォームの既定値を**すべての編集経路から**記憶する。
// Step 6 の不具合は「記憶の入口が追加フォーム1箇所だけ」で、実運用で使われる
// セルのポップオーバーから書かれていなかったことが原因（docs/verification-notes.md §5b 型3）
function rememberFromOp(op) {
  const a = state.ui.add;
  switch (op.type) {
    case 'setStart':    a.start = op.date || ''; break;
    case 'setDue':      a.due = op.date || ''; break;
    case 'setPriority': a.priority = op.value || ''; break;
    case 'setTags':     a.tags = (op.tags || []).slice(); break;
    case 'moveSection': a.section = op.section; break;
    case 'addTask':
      a.section = op.section || a.section;
      a.start = op.start || '';
      a.due = op.due || '';
      a.priority = op.priority || '';
      // タグは本文に埋め込まれるので op.tags は addTask 自身は使わない。
      // 記憶の書き込み口を1つに保つため、記憶用にだけ運ぶ
      if (Array.isArray(op.tags)) a.tags = op.tags.slice();
      break;
    default: return;
  }
  persistUi();
}

function fillSelect(sel, values, current, allLabel) {
  sel.textContent = '';
  if (allLabel !== undefined) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = allLabel;
    sel.appendChild(o);
  }
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
  // 「すべて」オプションが無い select（追加フォーム）は先頭値に既定化する
  sel.value = values.includes(current) ? current
    : (allLabel !== undefined ? '' : (values[0] || ''));
}

function render() {
  if (!state.loaded) {
    el('main-toolbar').hidden = true;
    el('view-tabs').hidden = true;
    el('viewbar').hidden = true;
    el('table-wrap').hidden = true;
    el('timeline-view').hidden = true;
    el('board-view').hidden = true;
    el('empty-msg').hidden = false;
    el('empty-msg').textContent = 'ファイルを開くとタスクが表示されます — ブラウザから直接 tasks.md を読み書きします（初回のみ Chrome の許可ダイアログが出ます）';
    return;
  }
  el('main-toolbar').hidden = false;
  el('view-tabs').hidden = false;   // ビュー切替は常時表示（timeline のまま復帰しても戻れる）
  el('viewbar').hidden = false;
  const doc = parseDoc(state.lines);
  state.doc = doc;

  const allTags = [];
  for (const t of doc.tasks) for (const tag of t.tags) if (!allTags.includes(tag)) allTags.push(tag);
  fillSelect(el('f-section'), doc.sections, state.ui.section, 'すべて');
  fillSelect(el('f-tag'), allTags, state.ui.tag, 'すべて');
  state.ui.section = el('f-section').value;
  state.ui.tag = el('f-tag').value;
  el('f-done').checked = state.ui.showDone;
  el('f-sort').value = state.ui.sort;
  el('f-groupby').value = state.ui.board.groupBy;
  el('f-zoom').value = state.ui.tlZoom;
  // 既定値の投入は openTaskModal（モーダルを開く瞬間）の1箇所だけ。
  // render では触らない（再描画で利用者がクリアした欄を復活させてしまうため）

  // テキスト検索（Phase S）。一致したタスク＋その祖先＋その子孫を残す。
  // タグ絞り込みがグループ全体を出すのと**意図的に違う**（→ 表示仕様に理由を記載）
  const q = nfc(state.ui.q || '').trim().toLowerCase();
  const haystack = (t) => nfc([t.body, t.memo.join(' '), t.tags.join(' '), t.links.join(' ')]
    .join(' ')).toLowerCase();
  let hitCount = 0;
  const markHit = (t) => {                       // 自分または子孫が一致したか
    let desc = false;
    for (const c of t.children) desc = markHit(c) || desc;
    t._hit = q !== '' && haystack(t).includes(q);
    if (t._hit) hitCount++;
    // メモが一致した行は**メモを自動で展開する**。畳んだままだと 📝 マーカーしか出ず
    // 「なぜヒットしたのか」が読めない（ハイライトは展開したメモに付く仕様のため）。
    // 自動で開いたものだけ memoAutoOpen で覚え、検索をやめたら畳む（手動の展開は残す）
    if (t._hit && t.memo.length && nfc(t.memo.join(' ')).toLowerCase().includes(q)
        && !state.memoOpen.has(t.line)) {
      state.memoOpen.add(t.line);
      state.memoAutoOpen.add(t.line);
    }
    t._sub = t._hit || desc;
    return t._sub;
  };
  const spreadHit = (t, ancestorHit) => {        // 祖先が一致していれば子孫も残す
    t._inQ = q === '' || t._sub || ancestorHit;
    for (const c of t.children) spreadHit(c, ancestorHit || t._hit);
  };

  // 表示判定は親子グループ単位（spec 決定事項）
  const roots = doc.tasks.filter(t => t.parentLine === null);
  // 前回の自動展開を先に取り消してから測り直す（検索語を変えたときに開きっぱなしにしない）
  for (const line of state.memoAutoOpen) state.memoOpen.delete(line);
  state.memoAutoOpen.clear();
  for (const r of roots) { markHit(r); spreadHit(r, false); }
  const markVisible = (t) => {
    let childVis = false;
    for (const c of t.children) childVis = markVisible(c) || childVis;
    // 未完了の子孫を持つ完了行は文脈表示。検索中は一致の圏内だけ
    t._vis = ((state.ui.showDone || !t.finished) || childVis) && t._inQ;
    return t._vis;
  };
  const groupHasTag = (t, tag) => t.tags.includes(tag) || t.children.some(c => groupHasTag(c, tag));
  let groups = roots.filter(r => {
    if (state.ui.section && r.section !== state.ui.section) return false;
    if (state.ui.tag && !groupHasTag(r, state.ui.tag)) return false;
    return markVisible(r);
  });
  const rank = t => t.priority === null ? 2 : PRI_RANK[t.priority];
  if (state.ui.sort === 'start') {
    // 開始日昇順（開始日なしは最後、同値は期限→ファイル順）
    groups = groups.slice().sort((a, b) =>
      (a.start === null) - (b.start === null) || (a.start || '').localeCompare(b.start || '') ||
      (a.due || '9999').localeCompare(b.due || '9999') || a.line - b.line);
  } else if (state.ui.sort === 'due') {
    groups = groups.slice().sort((a, b) =>
      (a.due === null) - (b.due === null) || (a.due || '').localeCompare(b.due || '') || a.line - b.line);
  } else if (state.ui.sort === 'priority') {
    groups = groups.slice().sort((a, b) => rank(a) - rank(b) || a.line - b.line);
  }
  // 終了したグループ（完了・中止）は常に最下部（ソート指定より優先）。判定は subtreeFinished
  // なので未完了の子孫を持つ完了親は上に残る（進行中の作業が下に埋もれない）。
  // **リストとボードだけに適用する** — visibleRows はタイムラインの行順にも使われる
  if (state.ui.view === 'list' || state.ui.view === 'board') {
    const doneKey = t => (subtreeFinished(t) ? 1 : 0);
    groups = groups.slice().sort((a, b) => doneKey(a) - doneKey(b)); // 安定ソート（既存順を保つ）
  }

  // リストはセクションの見出しでまとめる（TB-SH1〜SH3）。並べ替えはセクションの中で — 上の並べ替えのあとに
  // 安定に振り分けるので、セクションの中の順は並び順どおり。表示・ファイル・Excel用コピーの順を揃えるため groups も入れ替える
  let secBlocks = null;
  if (state.ui.view === 'list') {
    const filtering = q !== '' || !!state.ui.tag;
    const names = state.ui.section ? [state.ui.section] : doc.sections.slice();
    if (groups.some(g => !g.section)) names.unshift('');            // 最初の ## より前のタスク
    secBlocks = names.map(n => ({ name: n, groups: groups.filter(g => (g.section || '') === n) }))
      // 空のセクションも出す（落として移せるように）。絞り込み中は行の無いセクションを出さない
      .filter(b => b.groups.length || (!filtering && b.name !== ''));
    groups = secBlocks.reduce((a, b) => a.concat(b.groups), []);
  }

  const rows = [];
  // たたんだ親の子はリストでだけ隠す（タイムラインの行順は変えない）。検索中はたたみを無視して一致を出す（TB-V2）
  const folded = t => state.ui.view === 'list' && q === '' && state.collapsed.has(t.line);
  const collect = (t) => { if (t._vis) rows.push(t); if (folded(t)) return; for (const c of t.children) collect(c); };
  const secFolded = n => state.ui.view === 'list' && state.secFolded.has(n);
  for (const g of groups) if (!secFolded(g.section || '')) collect(g);
  state.visibleRows = rows;
  // 依存グラフは**表示中の行全体**から作る（🛫 が無くて図に出ない行も含める。
  // リスト・ボードの印と完了時の警告も同じグラフを見る）
  state.depGraph = depGraph(rows);

  const tbody = el('task-body');
  tbody.textContent = '';
  const today = todayStr();
  const putRow = (t) => {
    tbody.appendChild(renderRow(t, today));
    if (t.memo.length && state.memoOpen.has(t.line)) tbody.appendChild(renderMemoRow(t));
  };
  if (secBlocks) {
    const inRows = new Set(rows.map(t => t.line));
    for (const b of secBlocks) {
      // 見出しの数はたたんでいても数える（そのセクションの表示中のタスク）
      const all = [];
      const walk = (t) => { if (t._vis) all.push(t); for (const c of t.children) walk(c); };
      for (const g of b.groups) walk(g);
      tbody.appendChild(renderSecHead(b.name, all, today));
      for (const t of rows) if ((t.section || '') === b.name && inRows.has(t.line)) putRow(t);
    }
  } else {
    for (const t of rows) putRow(t);
  }

  for (const b of el('view-tabs').querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.view === state.ui.view);
    // 現在の列の基準は、ボードへ入る前でも title で読める（タブの幅は変えない）
    if (b.dataset.view === 'board') {
      b.title = 'カードを列に並べる（列: ' + (GROUPBY_LABEL[state.ui.board.groupBy] || '') + '）';
    }
  }
  el('groupby-wrap').hidden = state.ui.view !== 'board';   // 基準はボード表示中だけ出す
  el('zoom-wrap').hidden = state.ui.view !== 'timeline';   // ズームはタイムライン表示中だけ出す
  el('table-wrap').hidden = state.ui.view !== 'list';
  el('board-view').hidden = state.ui.view !== 'board';
  el('timeline-view').hidden = state.ui.view !== 'timeline';
  if (state.ui.view === 'timeline') {
    el('empty-msg').hidden = true;
    renderTimeline();
  } else if (state.ui.view === 'board') {
    state.timeline = null;
    el('empty-msg').hidden = true;
    renderBoard(groups, today, q);
  } else {
    state.timeline = null;
    el('empty-msg').hidden = rows.length > 0;
    el('empty-msg').textContent = q === ''
      ? '表示できるタスクがありません'
      : '一致するタスクがありません（検索: ' + state.ui.q.trim() + '）';
  }
  updateCopyButton();
  // 検索で行が消えたことを無言にしない
  el('q-count').textContent = q === '' ? '' : hitCount + ' 件ヒット';

  const open = doc.tasks.filter(t => !t.finished).length;
  el('summary').textContent = '未完了 ' + open + ' / 全 ' + doc.tasks.length + ' 件 · 表示 ' + rows.length + ' 行';
  el('btn-add-form').disabled = state.hasCRFile;
  updateSaveButton();
  updateArchiveButton();
}

/* ---------- 検索の一致箇所のハイライト（Phase S） ----------
   判定は NFC 正規化後に行うが、装飾は**表示文字列に対する素の大文字小文字無視検索**。
   NFC で長さが変わる文字（NFD の「ポ」など）では位置が対応しないため、
   表示文字列に見つからなければ装飾なしで全文を出す（行の表示自体は正しい）。 */
function appendHighlighted(host, text, q) {
  const s = String(text);
  if (!q) { host.appendChild(document.createTextNode(s)); return; }
  const lower = s.toLowerCase();
  let i = 0, at;
  while ((at = lower.indexOf(q, i)) >= 0) {
    if (at > i) host.appendChild(document.createTextNode(s.slice(i, at)));
    const mark = document.createElement('span');
    mark.className = 'hit';
    mark.textContent = s.slice(at, at + q.length);
    host.appendChild(mark);
    i = at + q.length;
  }
  if (i < s.length) host.appendChild(document.createTextNode(s.slice(i)));
}

/* ---------- 行の描画（2026-09-25 にアーカイブ節から描画の隣へ戻した — todo #17） ---------- */
// 行の状態（TB-V4）。行の左端の色の帯は1つだけ: 遅れ → 今日 → 着手中 → 開始日を過ぎたのに未着手。終了した行は無し
function rowState(t, today) {
  if (t.finished) return '';
  if (t.due && t.due < today) return 'late';
  if (t.due && t.due === today) return 'today';
  if (t.status === ST_DOING) return 'doing';
  if (t.start && t.start <= today && t.status === ST_TODO) return 'should';
  return '';
}
// 日付の表示（TB-V5・TB-Q68）: 「2026/10/5(月)」。今年の年は薄く（.yr）、今年でない年はふつうの濃さで目に留まるように。
// 正確な日付は title。曜日は dayNum（1970-01-01＝木曜が 0）から
const WEEKDAYS = '日月火水木金土';
function fillDate(host, ymd, today) {
  if (!ymd) return;
  const p = ymd.split('-');
  const rest = (+p[1]) + '/' + (+p[2]) + '(' + WEEKDAYS[(dayNum(ymd) + 4) % 7] + ')';
  if (p[0] === String(today).slice(0, 4)) {
    const y = document.createElement('span');
    y.className = 'yr';
    y.textContent = p[0] + '/';
    host.appendChild(y);
    host.appendChild(document.createTextNode(rest));
  } else host.textContent = p[0] + '/' + rest;
  host.title = ymd;
}
// 一覧の関連ノートのチップの文字（TB-W4）: 🎯 が作る「<日付>_<内容>」の先頭の日付を省いて中身を見せる。
// 日付しか無い名前（デイリーノート）は省かない。title とリンク先は全文のまま
function noteChipLabel(name) { return name.replace(/^\d{4}-\d{2}-\d{2}[_ ](?=\S)/, ''); }

// セクションの見出しの行（TB-SH1〜SH6）。data-line を持たない。セルは2つ（状態の列の空き＋残り全部）
function renderSecHead(name, list, today) {
  const tr = document.createElement('tr');
  tr.className = 'sec-row';
  const pad = document.createElement('td');
  pad.className = 'sec-pad';
  tr.appendChild(pad);
  const td = document.createElement('td');
  td.className = 'sec-cell';
  td.colSpan = 7;
  const closed = state.secFolded.has(name);
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'sec-fold';
  fold.textContent = closed ? '▸' : '▾';
  fold.title = closed ? 'このセクションを開く' : 'このセクションをたたむ';
  fold.addEventListener('click', () => {
    if (state.secFolded.has(name)) state.secFolded.delete(name); else state.secFolded.add(name);
    render();
  });
  td.appendChild(fold);
  const nm = document.createElement('span');
  nm.className = 'sec-name';
  nm.textContent = name || '（セクションなし）';
  td.appendChild(nm);
  const cnt = document.createElement('span');
  cnt.className = 'sec-count';
  cnt.textContent = list.length + '件';
  td.appendChild(cnt);
  // 急ぎの数は行の状態（TB-V4）と同じ分け方。0 のものは出さない
  const n = { late: 0, today: 0, doing: 0 };
  for (const t of list) { const k = rowState(t, today); if (k in n) n[k]++; }
  for (const [k, label] of [['late', '遅れ'], ['today', '今日まで'], ['doing', '進めている']]) {
    if (!n[k]) continue;
    const x = document.createElement('span');
    x.className = 'sec-st ' + k;
    x.textContent = label + ' ' + n[k];
    td.appendChild(x);
  }
  tr.appendChild(td);
  // 見出しへ落とすとそのセクションの末尾へ（TB-SH5）。落とせるのは最上位のタスクだけ・別のセクションだけ
  const canTake = () => state.drag && state.drag.top && name !== '' && state.drag.section !== name;
  tr.addEventListener('dragover', (e) => {
    if (!canTake()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    tr.classList.add('drop-sec');
  });
  tr.addEventListener('dragleave', (e) => { if (!tr.contains(e.relatedTarget)) tr.classList.remove('drop-sec'); });
  tr.addEventListener('drop', (e) => {
    if (!canTake()) return;
    e.preventDefault();
    const from = state.drag.line;
    state.drag = null;
    clearDropMarks();
    applyUndoable({ type: 'moveSection', line: from, section: name }, '「' + name + '」へ移しました');
  });
  return tr;
}
// 期限の隣の言葉（TB-V5）: N日遅れ／今日／明日／あとN日
function dueWords(due, today) {
  const d = diffDays(today, due);
  return d < 0 ? (-d) + '日遅れ' : d === 0 ? '今日' : d === 1 ? '明日' : 'あと' + d + '日';
}

function renderRow(t, today) {
  const tr = document.createElement('tr');
  if (t.finished) tr.className = 'row-done';
  tr.dataset.line = t.line;
  // 未保存の追加行を見分けられるようにする（保存すると orig が実値になり自然に消える）
  const isAdded = state.lines[t.line - 1] && state.lines[t.line - 1].orig === null;
  if (isAdded) tr.classList.add('row-added');
  // 最上位の行は子の有無に関係なく同じ色・太字（TB-V3）。子を持つ行は子の数と ▾（TB-V1）
  if (t.indent === 0) tr.classList.add('row-top');
  if (t.children.length) tr.classList.add('row-parent');
  const rs = rowState(t, today);
  if (rs) tr.classList.add('s-' + rs);
  // ドラッグで落とされる側（TB-K19〜K21）。自分と自分の子孫の上には落とせない
  if (!t.hasCR) {
    tr.addEventListener('dragover', (e) => {
      if (!state.drag || state.drag.banned.has(t.line)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const z = dropZone(tr, e.clientY);
      tr.classList.toggle('drop-before', z === 'before');
      tr.classList.toggle('drop-child', z === 'child');
      tr.classList.toggle('drop-after', z === 'after');
    });
    tr.addEventListener('dragleave', (e) => {
      if (!tr.contains(e.relatedTarget)) tr.classList.remove('drop-before', 'drop-child', 'drop-after');
    });
    tr.addEventListener('drop', (e) => {
      if (!state.drag || state.drag.banned.has(t.line)) return;
      e.preventDefault();
      const from = state.drag.line;
      const z = dropZone(tr, e.clientY);
      state.drag = null;
      clearDropMarks();
      // 最上位の前後だけは、並び順がファイル順でないと画面の位置が並び順に従う — そう伝える（TB-K22）
      const sorted = state.ui.sort !== 'file' && z !== 'child' && t.indent === 0;
      const sortName = (el('f-sort').selectedOptions[0] || {}).textContent || '';
      applyUndoable({ type: 'moveTask', line: from, target: t.line, position: z },
        z === 'child' ? '子にしました'
          : (sorted ? '移動しました。並び順が「' + sortName + '」なので、表示の位置は並び順どおりです' : '移動しました'));
    });
  }

  const tdSt = document.createElement('td');
  tdSt.className = 'cell-st';
  // つかむところ（TB-K19）。**どの並び順でも動かせる**（TB-K22 — ファイル順に限ったら、ふだん優先度順の利用者が一度も使えなかった）
  const canDrag = !t.hasCR && state.ui.view === 'list';
  const grip = document.createElement('span');
  grip.className = 'drag-handle' + (canDrag ? '' : ' is-off');
  grip.textContent = '⋮⋮';
  grip.draggable = canDrag;
  grip.title = canDrag ? 'ドラッグで移動（行の上端＝前・真ん中＝子・下端＝後）'
    : '並び順を「ファイル順」にするとドラッグで動かせます';
  // **行のどこでもつかめる**（TB-K24。⋮⋮ だけでは小さすぎた）。ボタン・チェックボックス・入力・リンクから
  // 始めた操作はドラッグにしない（クリックとして生かす — TB-K25）。押した場所は mousedown で覚える
  // （dragstart の target は一番近い draggable＝行になり、押した部品が分からないため）
  if (canDrag) {
    tr.draggable = true;
    let downOn = null;
    tr.addEventListener('mousedown', (e) => { downOn = e.target; });
    tr.addEventListener('dragstart', (e) => {
      const from = downOn || e.target;
      if (from.closest && from.closest('input, textarea, select, button, a') && !from.closest('.drag-handle')) {
        e.preventDefault();
        return;
      }
      state.drag = { line: t.line, banned: new Set([t.line].concat(descendantLines(t, []))), top: t.indent === 0, section: t.section || '' };
      if (e.dataTransfer) { e.dataTransfer.setData('text/plain', String(t.line)); e.dataTransfer.effectAllowed = 'move'; }
      tr.classList.add('dragging');
    });
    tr.addEventListener('dragend', () => { state.drag = null; downOn = null; clearDropMarks(); tr.classList.remove('dragging'); });
  }
  tdSt.appendChild(grip);
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = t.done;
  cb.disabled = t.hasCR;
  cb.addEventListener('change', () => {
    const completing = cb.checked;
    // blocked（先行が終わっていない）まま完了にしたら**警告するが止めない**（TB-Q55）。
    // Obsidian Tasks 自身も止めも警告もしないので**記法の意味を変えない**。
    // 8/3 のアーカイブ事故の教訓は「無言で通さない」であって「禁止する」ではない。
    // 判定は op を出す前に取る（適用後は状態が変わって blocked ではなくなる）
    const blockedNow = completing && !!(state.depGraph && state.depGraph.blocked.has(t.line));
    const pending = blockedNow ? unfinishedPredecessors(t) : [];
    // 🏁（Obsidian Tasks の On Completion。delete 等の完了時動作）はこのツールでは実行できない。
    // blocked と同じく**警告するが止めない**（TB-R22。記法は TB-Q40 どおり書き換えない）
    const onCompletion = completing && /🏁/u.test(t.body || '');   // 未知トークンは body に残る（TB-Q40）
    applyUiOp({ type: completing ? 'complete' : 'uncomplete', line: t.line });
    if (pending.length) {
      showBanner('warn', '先行タスク' + pending.length + '件が終わっていないまま完了にしました（' +
        pending.slice(0, 2).join('・') + (pending.length > 2 ? ' ほか' : '') + '）');
      return;
    }
    if (onCompletion) {
      showBanner('warn', '🏁（完了時動作）が付いています — Obsidian Tasks 側の動作（削除・移動など）は' +
        'このツールでは実行されません。必要なら Obsidian 側で完了にしてください');
      return;
    }
    // 「終了を含む」OFF では行が即座に消えるため、削除と誤解されない案内を出す
    if (completing && !state.ui.showDone) {
      showBanner('info', '完了にしました。完了行は「終了を含む」を ON にすると表示されます（ファイルへは保存時に反映）');
    }
  });
  tdSt.appendChild(cb);
  // 状態バッジ（着手中 ▶ / 保留 ⏸ / 中止 ✕ / 不明はその文字）。クリックで状態を選ぶ
  const badge = document.createElement('button');
  badge.className = 'st-badge';
  // 情報を持つ印（▶ ⏸ ✕・不明の文字）は常時表示、
  // 未着手・完了はチェックボックスで分かるのでホバー時だけ操作口を見せる（＋子 と同じ作法）
  if (STATUS_MARK[t.status]) badge.textContent = STATUS_MARK[t.status];
  else if (t.status === ST_OTHER) badge.textContent = t.statusChar;
  // 未着手・完了の操作口は「◌」（2026-09-30 に ▾ から変更 — 親の行のたたむ ▾ と同じ行に並んで紛らわしかった）
  else { badge.textContent = '◌'; badge.classList.add('st-quiet'); }
  badge.title = '状態: ' + (STATUS_LABEL[t.status] || t.statusChar) +
    '（クリックで ' + ST_CHOICES.map(s => STATUS_LABEL[s]).join(' / ') + ' を選ぶ）';
  badge.disabled = t.hasCR;
  badge.addEventListener('click', (e) => openStatusPopover(e.currentTarget, t));
  tdSt.appendChild(badge);
  tr.appendChild(tdSt);

  const tdBody = document.createElement('td');
  tdBody.className = 'cell-body';
  tdBody.style.paddingLeft = (10 + t.indent * 22) + 'px';
  // 子の行は「└」ではなく深さごとの縦線でつなぐ（TB-V1）。線は字下げの余白に描く
  if (t.indent > 0) {
    const xs = [];
    for (let k = 0; k < t.indent; k++) xs.push((10 + k * 22 + 6) + 'px 0');
    tdBody.style.backgroundImage = new Array(t.indent).fill('linear-gradient(var(--rail), var(--rail))').join(', ');
    tdBody.style.backgroundSize = '2px 100%';
    tdBody.style.backgroundPosition = xs.join(', ');
    tdBody.style.backgroundRepeat = 'no-repeat';
  }
  // ▾／▸（子を持つ行だけ。押すとたたむ）。子を持たない行は同じ幅だけ空けて字の位置をそろえる
  const fold = document.createElement(t.children.length ? 'button' : 'span');
  fold.className = t.children.length ? 'fold-btn' : 'fold-space';
  if (t.children.length) {
    const closed = state.collapsed.has(t.line);
    fold.type = 'button';
    fold.textContent = closed ? '▸' : '▾';
    fold.title = closed ? '子を開く' : '子をたたむ';
    fold.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.collapsed.has(t.line)) state.collapsed.delete(t.line); else state.collapsed.add(t.line);
      render();
    });
  }
  tdBody.appendChild(fold);
  const span = document.createElement('span');
  span.className = 'body-text';
  appendHighlighted(span, t.displayBody || t.body || '(内容なし)',
    nfc(state.ui.q || '').trim().toLowerCase());
  tdBody.appendChild(span);
  if (t.children.length) {
    const cc = document.createElement('span');
    cc.className = 'child-count';
    cc.textContent = String(t.children.length);
    cc.title = '子タスク ' + t.children.length + ' 件';
    tdBody.appendChild(cc);
  }
  const dm = depMark(t);
  if (dm) tdBody.appendChild(dm);
  // メモを持つ行の印。クリックで直下に展開／折り畳み（展開状態は永続化しない）
  if (t.memo.length) {
    const mk = document.createElement('button');
    mk.className = 'memo-mark';
    mk.textContent = '📝' + t.memo.length;
    mk.title = 'クリックでメモを展開／折り畳み';
    mk.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.memoOpen.has(t.line)) state.memoOpen.delete(t.line);
      else state.memoOpen.add(t.line);
      render();
    });
    tdBody.appendChild(mk);
  }
  if (!t.hasCR) {
    tdBody.title = canDrag ? 'ドラッグで移動・ダブルクリックで本文を編集' : 'ダブルクリックで本文を編集';
    tdBody.addEventListener('dblclick', () => startBodyEdit(tdBody, t));
  }
  tr.appendChild(tdBody);

  // 開始日は色分けしない（期限の遅延警告を埋もれさせない）
  const tdStart = document.createElement('td');
  tdStart.className = 'cell-start';
  const startSpan = document.createElement('span');
  fillDate(startSpan, t.start, today);   // 空欄は空白（「—」を並べない）
  tdStart.appendChild(startSpan);
  if (!t.hasCR) {
    tdStart.title = 'クリックで開始日を設定';
    tdStart.addEventListener('click', (e) => openDatePopover(e.currentTarget, t, 'start'));
  }
  tr.appendChild(tdStart);

  const tdDue = document.createElement('td');
  tdDue.className = 'cell-due';
  const dueSpan = document.createElement('span');
  fillDate(dueSpan, t.due, today);
  // 遅れ・今日は文字の色だけ（背景は塗らない — 状態は行の左端の帯が示す。TB-V5）。クラス名は従来どおり
  if (!t.finished && t.due) {
    if (t.due < today) dueSpan.className = 'due-over';
    else if (t.due === today) dueSpan.className = 'due-today';
  }
  tdDue.appendChild(dueSpan);
  if (!t.finished && t.due) {
    const w = document.createElement('span');
    w.className = 'due-rel' + (t.due < today ? ' late' : t.due === today ? ' today' : '');
    w.textContent = dueWords(t.due, today);
    tdDue.appendChild(w);
  }
  if (!t.hasCR) tdDue.addEventListener('click', (e) => openDatePopover(e.currentTarget, t, 'due'));
  tr.appendChild(tdDue);

  const tdPri = document.createElement('td');
  tdPri.className = 'cell-pri';
  tdPri.textContent = t.priEmoji ? t.priEmoji + ' ' + (PRI_LABEL[t.priority] || '') : '';
  if (!t.hasCR) tdPri.addEventListener('click', (e) => openPriPopover(e.currentTarget, t));
  tr.appendChild(tdPri);

  const tdTags = document.createElement('td');
  tdTags.className = 'cell-tags';
  for (const tag of t.tags) {
    const s = document.createElement('span');
    s.className = 'chip';
    s.textContent = '#' + tag;
    tdTags.appendChild(s);
  }
  if (!t.hasCR) {
    tdTags.title = 'クリックでタグを付与・削除';
    tdTags.addEventListener('click', (e) => openTagPopover(e.currentTarget, t));
  }
  tr.appendChild(tdTags);

  // セクションの列は無い（表の中の見出しにした — TB-SH2）。移すのは見出しへのドラッグか編集画面

  const tdLinks = document.createElement('td');
  for (const name of t.links) {
    // vault 名が未設定のときはリンクにせず名前だけ出す（押しても開かないリンクを作らない）
    const href = obsidianHref(name);
    const chip = document.createElement(href ? 'a' : 'span');
    chip.className = 'chip';
    chip.textContent = noteChipLabel(name);
    // 一覧では先頭の日付を省き9emで切るので、title の先頭に全文（TB-W3・W4）
    if (href) { chip.href = href; chip.title = name + ' — Obsidian で開く'; }
    else chip.title = name + ' — Obsidian で開くにはツールバーの「vault 名」を設定してください';
    tdLinks.appendChild(chip);
  }
  tr.appendChild(tdLinks);

  const tdAct = document.createElement('td');
  if (!t.hasCR) {
    const btn = document.createElement('button');
    btn.className = 'btn-child';
    btn.textContent = '＋子';
    btn.title = '子タスクを追加';
    btn.addEventListener('click', (e) => openChildPopover(e.currentTarget, t));
    tdAct.appendChild(btn);
    // 内容・メモ・タグ・分類・日付・関連ノートはモーダルで1画面で編集する
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-child';
    editBtn.textContent = '編集';
    editBtn.title = 'このタスクを編集（内容・メモ・タグ・日付・関連ノート）';
    editBtn.addEventListener('click', () => openTaskModal('edit', t));
    tdAct.appendChild(editBtn);
    // このタスクを考える場所へ（イシューノートを開く／無ければ作る — TB-N1/N2）
    const thinkBtn = document.createElement('button');
    thinkBtn.className = 'btn-child';
    thinkBtn.textContent = '🎯';
    thinkBtn.title = '考える場所へ — 関連ノートにイシューノートがあれば開く。無ければ作ってリンクする';
    thinkBtn.addEventListener('click', () => thinkAbout(t, false));
    tdAct.appendChild(thinkBtn);
    // 削除（TB-DEL4。子・メモごと・必ず確認・直後に［元に戻す］）
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-child';
    delBtn.textContent = '🗑';
    delBtn.title = '削除（子・メモごと。直後なら元に戻せます）';
    delBtn.addEventListener('click', () => confirmDeleteTask(t));
    tdAct.appendChild(delBtn);
  }
  // 未保存の追加行の取り消し（既存行の削除は 🗑 — TB-DEL）
  if (isAdded && !t.hasCR) {
    const undo = document.createElement('button');
    undo.className = 'btn-undo';
    undo.textContent = '↩︎';
    if (hasAddedDescendant(state.lines, t.line - 1)) {
      undo.disabled = true;
      // 子が既存の行（＝新しい親でまとめた直後など）なら、親だけ消すと子が別のタスクの下に付く（TB-K11）
      const kidsExisting = descendantLines(t, []).some(l => state.lines[l - 1] && state.lines[l - 1].orig !== null);
      undo.title = kidsExisting ? '子タスクがあるため取り消せません（子の「親タスク」を変えてから）' : '先に子タスクを取り消してください';
    } else {
      undo.title = 'この追加を取り消す（未保存）';
      undo.addEventListener('click', () => {
        // 行が消えることを削除と誤解させない（UX監査 TB-1 と同じ配慮）。失敗時は
        // applyUiOp のエラーバナーを潰さないよう成功時だけ出す
        if (applyUiOp({ type: 'undoAdd', line: t.line })) showBanner('info', '追加を取り消しました');
      });
    }
    tdAct.appendChild(undo);
  }
  tr.appendChild(tdAct);
  return tr;
}

// 展開したメモ（表の行として出す。ダブルクリックで編集）
function renderMemoRow(t) {
  const tr = document.createElement('tr');
  tr.className = 'memo-row';
  tr.dataset.memoFor = t.line;
  const td = document.createElement('td');
  td.colSpan = 9;
  const pre = document.createElement('div');
  pre.className = 'memo-text';
  pre.style.paddingLeft = (28 + t.indent * 22) + 'px';
  // メモは検索対象なので、ヒット箇所はここでもハイライトする
  appendHighlighted(pre, t.memo.join('\n'), nfc(state.ui.q || '').trim().toLowerCase());
  td.appendChild(pre);
  if (!t.hasCR) {
    td.title = 'ダブルクリックでメモを編集';
    td.addEventListener('dblclick', () => openTaskModal('edit', t, { focus: 'memo' }));
  }
  tr.appendChild(td);
  return tr;
}

/* ---------- IME ガード（Phase I） ---------- */

// 日本語などの変換確定・変換取り消しで押される Enter / Escape は、変換中であっても
// keydown{key:'Enter'|'Escape'} としてページに届く（2026-08-05 に CDP で実測）。
// ガードしないと「変換確定の Enter」がそのまま追加・編集確定を発火し、
// 未変換の文字列でタスクが増えたり既存行が上書きされる。
// keyCode 229 は isComposing を立てない IME への保険（deprecated だが現存する）。
function isComposingKey(e) {
  return e.isComposing || e.keyCode === 229;
}

function startBodyEdit(td, t) {
  if (td.querySelector('input')) return;
  // 編集中はその行をつかめなくする（文字を選ぶ操作がドラッグになるため — TB-K25）。描き直しで元に戻る
  const rowEl = td.closest('tr');
  if (rowEl) rowEl.draggable = false;
  td.textContent = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-edit-input';
  input.value = t.body;
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (v && v !== t.body) applyUiOp({ type: 'editContent', line: t.line, text: v });
    else render();
  };
  input.addEventListener('keydown', (e) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { done = true; render(); }
  });
  input.addEventListener('blur', commit);
  td.appendChild(input);
  input.focus();
  input.select();
}

