'use strict';
/* web/taskboard/board.js — ボードビュー（列＝セクション・カードのドラッグ）
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- ボードビュー（列＝セクション） ---------- */

const MAX_BOARD_CARDS = 300;   // 深さ0のカード数の上限（超過時は描画しない）

/* 列の基準（TB-Q43）。ドロップ時の op は基準ごとに分岐する:
   セクション → moveSection / ステータス → setStatus / 優先度 → setPriority */
const BOARD_GROUPS = ['section', 'status', 'priority'];
const GROUPBY_LABEL = { section: 'セクション', status: 'ステータス', priority: '優先度' };
// ステータス列。always=true の3列は0件でも出す（列が消えると壊れて見える）。
// **保留・中止は該当が1件以上あるときだけ列に出す** — 5列常設は横に長すぎるため。
// 列が無い状態への変更は状態バッジのポップオーバーから行える（ST_CHOICES）
const ST_COLUMNS = [
  { key: ST_TODO, label: '未着手', always: true },
  { key: ST_DOING, label: '着手中', always: true },
  { key: ST_HOLD, label: '⏸ 保留' },
  { key: ST_DONE, label: '完了', always: true },
  { key: ST_CANCELLED, label: '✕ 中止' },
];
// バッジのポップオーバーで選べる状態（列の有無と無関係に全部選べる）
const ST_CHOICES = ST_COLUMNS.map(c => c.key);
const PRI_COLUMNS = [
  { key: 'high', label: '⏫ 高' }, { key: 'medium', label: '🔼 中' },
  { key: 'low', label: '🔽 低' }, { key: '', label: 'なし' },
];
// 🔺/⏬ は 高/低 の列に寄せる（PRI_RANK と同じ考え方）
const PRI_COL = { highest: 'high', high: 'high', medium: 'medium', low: 'low', lowest: 'low' };

// 描画する列。cards を渡すと「該当があるときだけ出す」列を判定できる
// （渡さないときは always の列だけ = キーボード移動が描画と同じ集合を見るための既定）
function boardColumns(cards) {
  const g = state.ui.board.groupBy;
  if (g === 'status') {
    const keys = new Set((cards || []).map(cardKeyOf));
    return ST_COLUMNS.filter(c => c.always || keys.has(c.key)).map(c => ({ key: c.key, label: c.label }));
  }
  if (g === 'priority') return PRI_COLUMNS.slice();
  return state.doc.sections.map(s => ({ key: s, label: s }));
}
// カードがどの列に入るか
function cardKeyOf(t) {
  const g = state.ui.board.groupBy;
  if (g === 'status') return t.status === ST_OTHER ? ST_TODO : t.status;  // 不明は未着手列
  if (g === 'priority') return PRI_COL[t.priority] || '';
  return t.section;
}
// 列へ落とす／キーボードで移動する。基準ごとに op を分ける
function moveCardTo(line, key) {
  const g = state.ui.board.groupBy;
  const t = state.doc.tasks.find(x => x.line === line);
  if (!t || cardKeyOf(t) === key) return;      // 同じ列なら何もしない
  if (g === 'status') {
    if (applyUiOp({ type: 'setStatus', line, status: key })) {
      showBanner('info', '「' + STATUS_LABEL[key] + '」にしました（ファイルへは保存時に反映）');
    }
    return;
  }
  if (g === 'priority') {
    if (applyUiOp({ type: 'setPriority', line, value: key || null })) {
      showBanner('info', '優先度を変更しました（ファイルへは保存時に反映）');
    }
    return;
  }
  moveCardToSection(line, key);
}

function renderBoard(groups, today, q) {
  const host = el('board');
  const note = el('board-note');
  host.textContent = '';
  const cards = groups.filter(g => g._vis);
  if (cards.length > MAX_BOARD_CARDS) {
    ToolUI.banner(note, 'warn', 'カードが' + cards.length + '件（上限' + MAX_BOARD_CARDS +
      '件）のためボードを表示しません。セクション・タグ・検索で絞り込んでください');
    return;
  }
  const msgs = [];
  if (cards.length === 0) {
    msgs.push(q === '' ? '表示できるタスクがありません'
      : '一致するタスクがありません（検索: ' + state.ui.q.trim() + '）');
  }
  ToolUI.banner(note, 'info', msgs.join(' / '));   // 空なら hidden になる

  // 描画した列をキーボード移動と共有する（両者が違う集合を見ると端の判定がずれる）
  const columns = boardColumns(cards);
  state.boardCols = columns;
  // 5列（保留・中止が出るとき）は列幅を詰める。横スクロールに逃がすと完了列が画面外に出る
  host.classList.toggle('cols-many', columns.length > 4);
  const byKey = new Map(columns.map(c => [c.key, []]));
  for (const c of cards) {
    const k = cardKeyOf(c);
    if (byKey.has(k)) byKey.get(k).push(c);
  }
  // ステータス列では完了は「完了」列にいるので、列内の最下部ソートは不要（TB-Q43）
  const sortDoneLast = state.ui.board.groupBy !== 'status';
  for (const c of columns) {
    const col = document.createElement('div');
    col.className = 'board-col';
    col.dataset.section = c.key;   // 列のキー（セクション名 / ステータス / 優先度）
    const title = document.createElement('p');
    title.className = 'board-col-title';
    title.textContent = c.label + ' ';
    const cnt = document.createElement('span');
    cnt.className = 'muted';
    cnt.textContent = '(' + byKey.get(c.key).length + ')';
    title.appendChild(cnt);
    col.appendChild(title);
    const list = byKey.get(c.key).slice();
    if (sortDoneLast) list.sort((a, b) => (subtreeFinished(a) ? 1 : 0) - (subtreeFinished(b) ? 1 : 0));
    for (const t of list) col.appendChild(renderCard(t, today, q));
    // dragover で preventDefault しないと drop が発火しない（HTML DnD 仕様）
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop-target'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const line = Number(e.dataTransfer.getData('text/plain'));
      if (!line) return;
      moveCardTo(line, c.key);
    });
    host.appendChild(col);
  }
}

// ボードのカード移動は既存の opMoveSection を通す（バイト保全・部分木ごと移動）
function moveCardToSection(line, section) {
  const t = state.doc.tasks.find(x => x.line === line);
  if (!t || t.section === section) return;   // 同じ列なら何もしない
  if (applyUiOp({ type: 'moveSection', line, section })) {
    showBanner('info', '「' + section + '」の末尾へ移動しました（ファイルへは保存時に反映）');
  }
}

function renderCard(t, today, q) {
  const card = document.createElement('div');
  card.className = 'board-card' + (t.finished ? ' card-done' : '');
  card.dataset.line = t.line;
  card.tabIndex = 0;   // ドラッグを唯一の手段にしない（キーボードで移動・編集できる）
  if (!t.hasCR) card.draggable = true;   // 深さ0のカードだけ（子は親と一緒に動く）
  const body = document.createElement('div');
  body.className = 'card-body';
  // 状態の印（列＝ステータスのときは列で分かるが、他の基準では印が唯一の手がかりになる）
  if (STATUS_MARK[t.status]) body.appendChild(document.createTextNode(STATUS_MARK[t.status] + ' '));
  else if (t.status === ST_OTHER) body.appendChild(document.createTextNode('[' + t.statusChar + '] '));
  appendHighlighted(body, t.displayBody || t.body || '(内容なし)', q);
  const dmc = depMark(t);
  if (dmc) body.appendChild(dmc);
  if (t.memo.length) {
    const m = document.createElement('span');
    m.className = 'muted';
    m.textContent = '  📝' + t.memo.length;
    body.appendChild(m);
  }
  card.appendChild(body);

  /* 展開されているメモはカードにも出す（Phase T5b）。
     検索でメモが一致した行は memoOpen に入る（自動展開）ので、ボードでも
     **なぜヒットしたのかが読める**。リスト側で手動展開したメモもここに出る
     （同じ memoOpen を見るので、リストとボードを往復しても状態がずれない）。
     ハイライトはリストと同じ appendHighlighted を通す */
  if (t.memo.length && state.memoOpen.has(t.line)) {
    const box = document.createElement('div');
    box.className = 'card-memo';
    for (const line of t.memo) {
      const p = document.createElement('div');
      appendHighlighted(p, line, q);
      box.appendChild(p);
    }
    card.appendChild(box);
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  if (t.due) {
    const d = document.createElement('span');
    d.textContent = '📅 ' + t.due;
    if (!t.finished && t.due < today) d.className = 'due-over';
    else if (!t.finished && t.due === today) d.className = 'due-today';
    meta.appendChild(d);
  }
  if (t.priEmoji) {
    const p = document.createElement('span');
    p.textContent = t.priEmoji + ' ' + (PRI_LABEL[t.priority] || '');
    meta.appendChild(p);
  }
  for (const tag of t.tags) {
    const s = document.createElement('span');
    s.className = 'chip';
    appendHighlighted(s, '#' + tag, q);
    meta.appendChild(s);
  }
  if (meta.childNodes.length) card.appendChild(meta);

  const kids = t.children.filter(c => c._vis);
  const foot = document.createElement('div');
  foot.className = 'card-meta';
  if (kids.length) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'card-btn';
    const open = state.boardKidsOpen.has(t.line);
    toggle.textContent = (open ? '▾' : '▸') + ' 子 ' + kids.length;
    toggle.title = 'クリックで子タスクを展開／折り畳み';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open) state.boardKidsOpen.delete(t.line); else state.boardKidsOpen.add(t.line);
      render();
    });
    foot.appendChild(toggle);
  }
  if (!t.hasCR && state.doc.sections.length > 1) {
    const mv = document.createElement('button');
    mv.type = 'button';
    mv.className = 'card-btn';
    mv.textContent = '移動';
    mv.title = 'セクションを変更（ドラッグ以外の経路）';
    mv.addEventListener('click', (e) => { e.stopPropagation(); openSectionPopover(mv, t); });
    foot.appendChild(mv);
  }
  if (foot.childNodes.length) card.appendChild(foot);

  if (kids.length && state.boardKidsOpen.has(t.line)) {
    const box = document.createElement('div');
    box.className = 'card-kids';
    for (const c of kids) {
      const row = document.createElement('div');
      row.className = 'card-kid';
      row.textContent = c.done ? '☑ ' : ((STATUS_MARK[c.status] || '☐') + ' ');
      appendHighlighted(row, c.displayBody || c.body || '(内容なし)', q);
      row.title = 'クリックでこの子タスクを編集';
      row.addEventListener('click', (e) => { e.stopPropagation(); openTaskModal('edit', c); });
      box.appendChild(row);
    }
    card.appendChild(box);
  }

  card.addEventListener('click', () => openTaskModal('edit', t));
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(t.line));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    for (const c of document.querySelectorAll('.board-col.drop-target')) c.classList.remove('drop-target');
  });
  card.addEventListener('keydown', (e) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTaskModal('edit', t); return; }
    if (!(e.metaKey || e.ctrlKey) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    // キーボード移動も列の基準に追随する
    const cols = state.boardCols || boardColumns();
    const i = cols.findIndex(c => c.key === cardKeyOf(t)) + (e.key === 'ArrowRight' ? 1 : -1);
    if (i < 0 || i >= cols.length) return;   // 端では何もしない
    moveCardTo(t.line, cols[i].key);
  });
  return card;
}

