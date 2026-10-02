'use strict';
/* web/taskboard/modal.js — ポップオーバーと追加・編集モーダル
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- ポップオーバー ---------- */

// ビューポート内にクランプする（右端で押し戻し・下端で上側へ反転）。
// openPopover は全ポップオーバーの共通入口なので、ここ1箇所で「画面はじで途切れる」を防ぐ
function openPopover(anchor, build) {
  const pop = el('popover');
  pop.textContent = '';
  build(pop);
  // 実寸は表示してからでないと測れない。置き場所の計算（右端で押し戻し・下端で上側へ）は lib/ui.js の ToolUI.placeAt（2026-10-02 に移設）
  pop.hidden = false;
  ToolUI.placeAt(pop, anchor.getBoundingClientRect());
}
function closePopover() { el('popover').hidden = true; }
document.addEventListener('mousedown', (e) => {
  const pop = el('popover');
  if (!pop.hidden && !pop.contains(e.target)) closePopover();
});
// 変換候補を戻すための Escape で popover を閉じない（閉じると入力中の値が失われる。TB-Q9）。
// **バーのドラッグ中の Escape はドラッグの取り消しに使う**（ポップオーバーへは渡さない）
document.addEventListener('keydown', (e) => {
  if (isComposingKey(e)) return;
  if (e.key !== 'Escape') return;
  if (tlDrag) { e.stopPropagation(); cancelDrag(); return; }
  closePopover();
});

// 開始日（🛫）と期限（📅）は同じ「日付を決める」操作なので部品を共用する
const DATE_FIELDS = {
  start: { label: '開始日', op: 'setStart', get: t => t.start },
  due:   { label: '期限',   op: 'setDue',   get: t => t.due },
};

function dateRow(t, field) {
  const cfg = DATE_FIELDS[field];
  const cur = cfg.get(t);
  const box = document.createElement('div');
  box.className = 'row-btns';
  const name = document.createElement('span');
  name.textContent = cfg.label;
  box.appendChild(name);
  const input = document.createElement('input');
  input.type = 'date';
  input.dataset.field = field;
  input.value = cur || todayStr();
  const set = (date) => applyUiOp({ type: cfg.op, line: t.line, date });
  input.addEventListener('change', () => {
    if (input.value) { set(input.value); closePopover(); }
  });
  box.appendChild(input);
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => { fn(); closePopover(); });
    box.appendChild(b);
  };
  mk('今日', () => set(todayStr()));
  mk('明日', () => set(addDays(todayStr(), 1)));
  mk('+1週', () => set(addDays(cur || todayStr(), 7)));
  if (cur) mk('クリア', () => set(null));
  return box;
}

function openDatePopover(anchor, t, field) {
  openPopover(anchor, (pop) => { pop.appendChild(dateRow(t, field)); });
}

// タイムラインのバー／行ラベルから開く。開始日と期限を1つのポップオーバーで扱う（TB-Q16）
function openPlanPopover(anchor, t) {
  openPopover(anchor, (pop) => {
    const label = document.createElement('span');
    label.textContent = '計画（開始日と期限）';
    pop.appendChild(label);
    pop.appendChild(dateRow(t, 'start'));
    pop.appendChild(dateRow(t, 'due'));
  });
}

// 状態の選択（期限・優先度と同じ作法）。**ボードに列が無い状態への変更もここから行える**
function openStatusPopover(anchor, t) {
  openPopover(anchor, (pop) => {
    const label = document.createElement('span');
    label.textContent = '状態を変更';
    pop.appendChild(label);
    const btns = document.createElement('div');
    btns.className = 'row-btns';
    for (const st of ST_CHOICES) {
      const b = document.createElement('button');
      b.textContent = (STATUS_MARK[st] || (st === ST_DONE ? '☑' : '☐')) + ' ' + STATUS_LABEL[st];
      if (st === t.status) { b.disabled = true; b.title = '現在の状態'; }
      else {
        b.addEventListener('click', () => {
          applyUiOp({ type: 'setStatus', line: t.line, status: st });
          closePopover();
        });
      }
      btns.appendChild(b);
    }
    pop.appendChild(btns);
  });
}

function openPriPopover(anchor, t) {
  openPopover(anchor, (pop) => {
    const btns = document.createElement('div');
    btns.className = 'row-btns';
    const mk = (label, value) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { applyUiOp({ type: 'setPriority', line: t.line, value }); closePopover(); });
      btns.appendChild(b);
    };
    mk('⏫ 高', 'high');
    mk('🔼 中', 'medium');
    mk('🔽 低', 'low');
    mk('なし', null);
    pop.appendChild(btns);
  });
}

// セクション変更（期限・優先度と同じポップオーバーの作法）。移動先の末尾に移る
function openSectionPopover(anchor, t) {
  openPopover(anchor, (pop) => {
    const label = document.createElement('span');
    label.textContent = 'セクションを変更（移動先の末尾へ）';
    pop.appendChild(label);
    const btns = document.createElement('div');
    btns.className = 'row-btns';
    for (const sec of state.doc.sections) {
      const b = document.createElement('button');
      b.textContent = sec;
      if (sec === t.section) {
        b.disabled = true;
        b.title = '現在のセクション';
      } else {
        b.addEventListener('click', () => {
          if (applyUiOp({ type: 'moveSection', line: t.line, section: sec })) {
            // 行が別の場所へ動くことを「消えた」と誤解させない（UX監査 TB-1 と同じ配慮）
            showBanner('info', '「' + sec + '」の末尾へ移動しました（ファイルへは保存時に反映）');
          }
          closePopover();
        });
      }
      btns.appendChild(b);
    }
    pop.appendChild(btns);
  });
}

/* ---------- 追加・編集モーダル（Phase E・2026-08-06） ----------
   既定値の投入は**この1箇所だけ**にする（Step 6 の不具合は投入箇所が2つあったことが温床）。 */

let modalState = null;   // { mode, line, initial, returnFocus, tags, links }

const FOCUSABLE_SEL = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
// 表示されている要素だけを対象にする（閉じた <details> の中は getClientRects が空になる）
function modalFocusables() {
  return Array.from(el('modal').querySelectorAll(FOCUSABLE_SEL))
    .filter(x => x.getClientRects().length > 0);
}

// hrefOf を渡すとチップ本体が <a>（Obsidian で開く — TB-R21。関連ノートのみ。タグ・依存はリンクにしない）
function renderModalChips(hostId, values, onDelete, hrefOf) {
  const host = el(hostId);
  host.textContent = '';
  if (!values.length) {
    const s = document.createElement('span');
    s.className = 'muted';
    s.textContent = 'なし';
    host.appendChild(s);
    return;
  }
  values.forEach((v, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'chip';
    if (hrefOf) {
      const a = document.createElement('a');
      a.textContent = v;
      a.href = hrefOf(v, i);
      a.title = 'Obsidian で開く';
      wrap.appendChild(a);
    } else {
      wrap.textContent = v;
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chip-del';
    del.textContent = '✕';
    del.title = v + ' を外す';
    del.addEventListener('click', () => onDelete(i));
    wrap.appendChild(del);
    host.appendChild(wrap);
  });
}
function refreshModalTags() {
  renderModalChips('modal-tag-list', modalState.tags.map(t => '#' + t), (i) => {
    modalState.tags.splice(i, 1);
    refreshModalTags();
  });
}
/* 依存欄（Phase T6）。**id ではなく行番号で持つ**ので、id 未設定の先行タスクも選べる。
   選択肢から外すのは「自分・自分の子孫・自分に依存しているタスク」（直接循環の予防）。
   祖先は外さない（親子関係は依存関係ではないので、親を先行にするのは循環にならない）。 */
function depLinesOf(t) {
  const out = [];
  for (const id of t.dependsOn) {
    const hit = state.doc.tasks.filter(x => x.id === id);
    if (hit.length === 1) out.push(hit[0].line);   // 重複・未解決はチップにしない（原文は保つ）
  }
  return out;
}
function descendantLines(t, out) {
  for (const c of t.children) { out.push(c.line); descendantLines(c, out); }
  return out;
}
function refreshModalParent(t) {
  const sel = el('modal-parent');
  sel.textContent = '';
  const add = (value, label, title) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    if (title) o.title = title;
    sel.appendChild(o);
  };
  add('', '（なし — 最上位）');
  add('__new__', '＋ 新しい親でまとめる…');
  // 自分と自分の子孫は親にできない（循環）。CR 行は編集できない
  const banned = new Set([t.line].concat(descendantLines(t, [])));
  for (const x of state.doc.tasks) {
    if (banned.has(x.line) || x.hasCR) continue;
    const full = (x.displayBody || x.body || ('行' + x.line)) + (x.section ? '（' + x.section + '）' : '');
    add(String(x.line), '　'.repeat(x.indent) + (full.length > 40 ? full.slice(0, 39) + '…' : full), full);
  }
  sel.value = (t.parentLine === null || t.parentLine === undefined) ? '' : String(t.parentLine);
  el('modal-parent-new').value = '';
  syncModalParent();
}
// 親を変えたら: 名前欄の出し分け・セクション欄を無効（セクションは親に従う）・一言の説明
function syncModalParent() {
  const v = el('modal-parent').value;
  const changed = !!(modalState && modalState.initial) && v !== modalState.initial.parent;
  el('modal-parent-new-row').hidden = v !== '__new__';
  el('modal-section').disabled = changed;
  el('modal-parent-note').textContent = !changed ? ''
    : v === '__new__' ? 'このタスクの位置に親を作り、その下に入れます'
    : v === '' ? '最上位に戻します（元の親の近くに置きます）'
    : '子・メモごとその親の下へ移ります。セクションも親に合わせます';
}
el('modal-parent').addEventListener('change', syncModalParent);
el('modal-delete').addEventListener('click', () => {
  if (!modalState || modalState.mode !== 'edit') return;
  const t = state.doc.tasks.find(x => x.line === modalState.line);
  if (t && confirmDeleteTask(t)) closeModal();
});

function refreshModalDeps() {
  const lineOfName = (line) => {
    const x = state.doc.tasks.find(y => y.line === line);
    return x ? (x.displayBody || x.body || ('行' + line)) : ('行' + line);
  };
  renderModalChips('modal-dep-list', modalState.deps.map(lineOfName), (i) => {
    modalState.deps.splice(i, 1);
    refreshModalDeps();
  });
  // 選択肢
  const sel = el('modal-dep-select');
  const me = modalState.line;
  const self = me === null ? null : state.doc.tasks.find(x => x.line === me);
  const banned = new Set(modalState.deps);
  if (me !== null) banned.add(me);
  if (self) for (const l of descendantLines(self, [])) banned.add(l);
  // 自分に依存しているタスク（＝自分が先行）を選ぶと直接循環になる
  if (self && self.id) {
    for (const x of state.doc.tasks) if (x.dependsOn.includes(self.id)) banned.add(x.line);
  }
  const opts = state.doc.tasks.filter(x => !banned.has(x.line) && !x.hasCR);
  sel.textContent = '';
  for (const x of opts) {
    const o = document.createElement('option');
    o.value = String(x.line);
    const full = (x.displayBody || x.body || ('行' + x.line)) +
      (x.section ? '（' + x.section + '）' : '');
    // 長い本文で <select> の固有幅がモーダルを押し広げないよう表示は短く、全文は title へ（TB-W2）
    o.textContent = full.length > 40 ? full.slice(0, 39) + '…' : full;
    o.title = full;
    sel.appendChild(o);
  }
  el('modal-dep-add').disabled = opts.length === 0;
  el('modal-dep-note').textContent = opts.length === 0
    ? '選べる先行タスクがありません（自分・子孫・自分に依存しているタスクは選べません）' : '';
}
function refreshModalLinks() {
  renderModalChips('modal-link-list', modalState.links.map(l => '[[' + l + ']]'), (i) => {
    modalState.links.splice(i, 1);
    refreshModalLinks();
    // 第4引数 = href の作り方。表示は [[名前]] だが href は素の名前から作る。
    // vault 名が未設定なら null を渡してリンクにしない（renderModalChips が span で出す）
  }, VAULT_NAME ? (v, i) => obsidianHref(modalState.links[i]) : null);
}

function readModal() {
  return {
    content: el('modal-content').value.trim(),
    memo: el('modal-memo').value.replace(/\s+$/, ''),
    tags: modalState.tags.slice(),
    links: modalState.links.slice(),
    deps: modalState.deps.slice(),
    section: el('modal-section').value,
    start: el('modal-start').value,
    due: el('modal-due').value,
    priority: el('modal-pri').value,
    parent: el('modal-parent').value,              // '' = 最上位 / '__new__' = 新しい親 / 行番号
    parentNew: el('modal-parent-new').value.trim(),
  };
}

// 本文（内容＋タグ＋関連ノート）。editContent はこの文字列で行を作り直す
function bodyTextOf(v) {
  return [v.content].concat(v.tags.map(t => '#' + t), v.links.map(l => '[[' + l + ']]'))
    .filter(s => s !== '').join(' ');
}
// 内容欄に出す文字列。タグと関連ノートは専用の欄で編集するので本文からは外す
// （外さないと内容欄にタグが残り、内容を編集したときに bodyTextOf でタグが二重になる）。
// #102 のような数字のみはタグではないので内容側に残る
function modalContentOf(t) {
  let s = t.displayBody || t.body || '';
  for (const tag of t.tags) {
    s = s.replace(new RegExp(' ?#' + escapeRe(tag) +
      '(?![^\\s#,、。()（）\\[\\]:：;；!！?？"\'`])'), '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function openTaskModal(mode, t, opts) {
  const o = opts || {};
  const sections = (state.doc && state.doc.sections) || [];
  const a = state.ui.add;
  modalState = {
    mode, line: t ? t.line : null,
    returnFocus: document.activeElement,
    // 新規は前回値（記憶したセクションが無ければ先頭へフォールバック）。編集は既存値
    tags: mode === 'edit' ? t.tags.slice() : (a.tags || []).slice(),
    links: mode === 'edit' ? t.links.slice() : [],
    // 依存は id ではなく**行番号**で持つ（id が無い先行タスクも選べるようにするため。
    // 保存時に id が無ければその場で発行する）
    deps: mode === 'edit' ? depLinesOf(t) : [],
  };
  el('modal-title').textContent = mode === 'edit' ? 'タスクを編集' : 'タスクを追加';
  el('modal-content').value = mode === 'edit' ? modalContentOf(t) : '';
  el('modal-memo').value = mode === 'edit' ? t.memo.join('\n') : '';
  fillSelect(el('modal-section'), sections,
    mode === 'edit' ? t.section : (sections.includes(a.section) ? a.section : (sections[0] || '')));
  // **日付の既定は今日**（利用者「まず今日をデフォルトで」）。前回値があればそれ（TB-D1）、
  // クリアした記憶（''）ならそのまま空（TB-D2）。null＝まだ一度も触っていない、だけ今日にする
  const dflt = v => (v === null || v === undefined ? ToolEdit.today() : v);
  el('modal-start').value = mode === 'edit' ? (t.start || '') : dflt(a.start);
  el('modal-due').value = mode === 'edit' ? (t.due || '') : dflt(a.due);
  el('modal-pri').value = mode === 'edit' ? (t.priority || '') : a.priority;
  refreshModalTags();
  // 依存欄は編集モーダル限定。新規は addTask に deps を載せない仕様（spec「設定UI」）のため、
  // 欄を出すと「入力できるのに保存で黙って捨てられる」口になる（TB-R20）
  el('modal-dep-field').hidden = mode !== 'edit';
  if (mode === 'edit') refreshModalDeps();
  // 親タスク欄も編集モーダル限定（TB-K）。セクション欄の無効化は毎回解く
  el('modal-section').disabled = false;
  el('modal-parent-field').hidden = mode !== 'edit';
  // 削除も編集モーダル限定（TB-DEL6）
  el('modal-delete').hidden = mode !== 'edit' || !!(t && t.hasCR);
  if (mode === 'edit') refreshModalParent(t);
  else { el('modal-parent').textContent = ''; el('modal-parent-new').value = ''; syncModalParent(); }
  refreshModalLinks();
  el('modal-tag-input').value = '';
  el('modal-link-input').value = '';
  /* Check Issue から来た場合は論点・関連ノート・期限を入れて開く（R8: タスクは論点の下に生まれる）。
     来ていない場合も「この一手はどの論点のため？」を一言だけ置く — 答えなくてよいが、問いは毎回見える */
  const pf = mode === 'new' ? (o.prefill || null) : null;
  const why = el('modal-why');
  if (pf) {
    if (pf.content) el('modal-content').value = pf.content;
    if (pf.memo) el('modal-memo').value = pf.memo;
    if (pf.due) el('modal-due').value = pf.due;
    // 案件と同じ名前のセクションがあれば選んでおく（TB-H4）。無い名前なら既定のまま
    if (pf.project && sections.includes(pf.project)) el('modal-section').value = pf.project;
    if (pf.link && !modalState.links.includes(pf.link)) modalState.links.push(pf.link);
    refreshModalLinks();
    why.textContent = pf.issue ? '🎯 論点: ' + pf.issue : '🎯 Check Issue から';
    why.className = 'muted modal-why is-issue';
  } else {
    why.textContent = mode === 'new'
      ? '💡 この一手はどの論点のため？ 論点から作るなら 🎯 Check Issue（Cmd/Ctrl+Shift+E）'
      : '';
    why.className = 'muted modal-why';
  }
  why.hidden = why.textContent === '';
  // 値が入っている項目が1つでもあれば詳細を開く（隠れた値に気づかないのを防ぐ）
  const v = readModal();
  el('modal-more').open = !!(v.tags.length || v.deps.length || v.links.length || v.start || v.due || v.priority);
  modalState.initial = v;
  el('modal').hidden = false;
  const focusTarget = o.focus === 'memo' ? el('modal-memo') : el('modal-content');
  setTimeout(() => { focusTarget.focus(); }, 0);
}

function isModalDirty() {
  if (!modalState) return false;
  const a = modalState.initial, b = readModal();
  return JSON.stringify(a) !== JSON.stringify(b);
}

function closeModal() {
  const back = modalState && modalState.returnFocus;
  el('modal').hidden = true;
  modalState = null;
  if (back && back.isConnected) back.focus();
}
function tryCloseModal() {
  // 入力を無言で捨てない
  if (isModalDirty() && !confirm('入力を破棄しますか？')) return;
  closeModal();
}

function saveModal() {
  if (!modalState) return;
  const v = readModal();
  if (v.content === '') { showBanner('warn', 'タスクの内容を入力してください'); el('modal-content').focus(); return; }
  const body = bodyTextOf(v);
  if (modalState.mode === 'new') {
    const op = { type: 'addTask', section: v.section, content: body, tags: v.tags };
    if (v.start) op.start = v.start;
    if (v.due) op.due = v.due;
    if (v.priority) op.priority = v.priority;
    if (v.memo !== '') op.memo = v.memo;
    if (!applyUiOp(op)) return;
    showBanner('info', 'タスクを追加しました（ファイルへは保存時に反映）');
    // 連続追加を自然にする（Phase I の TB-Q7 と同じ意図）。内容とメモだけ空にして開いたまま保つ。
    // 他の欄は前回値として残るので、同じ期限のタスクを続けて足せる
    el('modal-content').value = '';
    el('modal-memo').value = '';
    modalState.initial = readModal();
    el('modal-content').focus();
    return;
  }
  // 編集: **変更したフィールドの op だけ**発行する（触っていない値のバイトを変えない）。
  // 行番号が動く moveSection は最後（先に出すと後続の op が別の行を編集してしまう）
  const a = modalState.initial;
  const line = modalState.line;
  const ops = [];
  const bodyChanged = v.content !== a.content ||
    JSON.stringify(v.links) !== JSON.stringify(a.links) ||
    JSON.stringify(v.tags) !== JSON.stringify(a.tags);
  const onlyTagsChanged = v.content === a.content &&
    JSON.stringify(v.links) === JSON.stringify(a.links) &&
    JSON.stringify(v.tags) !== JSON.stringify(a.tags);
  if (onlyTagsChanged) ops.push({ type: 'setTags', line, tags: v.tags });
  else if (bodyChanged) ops.push({ type: 'editContent', line, text: body });
  if (v.start !== a.start) ops.push({ type: 'setStart', line, date: v.start || null });
  if (v.due !== a.due) ops.push({ type: 'setDue', line, date: v.due || null });
  if (v.priority !== a.priority) ops.push({ type: 'setPriority', line, value: v.priority || null });
  if (v.memo !== a.memo) ops.push({ type: 'setMemo', line, text: v.memo });
  /* 依存（Phase T6）。行番号で持っているので、**id が無い先行タスクにはその場で発行する**。
     id 発行は先行タスク側の行を書き換えるので setDependsOn より前に出す
     （行番号は変わらないので順序の危険はない。行を動かすのは moveSection だけ） */
  if (JSON.stringify(v.deps) !== JSON.stringify(a.deps)) {
    const ids = [];
    for (const dl of v.deps) {
      const from = state.doc.tasks.find(x => x.line === dl);
      if (!from) continue;
      let id = from.id;
      if (!id) {
        id = newId(state.lines);
        ops.push({ type: 'setId', line: dl, id: id });
      }
      ids.push(id);
    }
    ops.push({ type: 'setDependsOn', line, ids: ids });
  }
  // 親子の付け替え（TB-K）。セクションは親に従うので、親を変えたときは moveSection を出さない
  const parentChanged = v.parent !== a.parent;
  if (parentChanged && v.parent === '__new__' && v.parentNew === '') {
    showBanner('warn', '新しい親の名前を入れてください');
    el('modal-parent-new').focus();
    return;
  }
  if (!parentChanged && v.section !== a.section) ops.push({ type: 'moveSection', line, section: v.section });
  if (!ops.length && !parentChanged) { closeModal(); return; }
  const before = state.lines.length;
  for (const op of ops) if (!applyUiOp(op)) return;
  if (parentChanged) {
    // 付け替えは行を動かすので最後に1つ。先の op（メモ）で増減した行数だけ、下にある親の行番号を補正する
    // （増減するのは自分のメモ範囲だけ＝自分より下の行が同じだけずれる）
    let pop;
    if (v.parent === '__new__') pop = { type: 'wrapParent', line, content: v.parentNew };
    else {
      let p = v.parent === '' ? null : Number(v.parent);
      if (p !== null && p > line) p += state.lines.length - before;
      pop = { type: 'setParent', line, parent: p };
    }
    if (!applyUiOp(pop)) return;
  }
  showBanner('info', (ops.length + (parentChanged ? 1 : 0)) + '項目を変更しました（ファイルへは保存時に反映）');
  closeModal();
}

el('modal-save').addEventListener('click', saveModal);
el('modal-cancel').addEventListener('click', tryCloseModal);
el('modal').addEventListener('mousedown', (e) => { if (e.target === el('modal')) tryCloseModal(); });
el('modal-content').addEventListener('keydown', (e) => {
  // Enter=追加 は Phase I の決定どおり維持する。変換確定の Enter で保存しない
  if (isComposingKey(e)) return;
  if (e.key === 'Enter') { e.preventDefault(); saveModal(); }
});
el('modal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isComposingKey(e)) return;   // 変換候補を戻す Escape で閉じない
    e.preventDefault();
    tryCloseModal();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveModal(); return; }
  if (e.key !== 'Tab') return;
  const f = modalFocusables();
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
const addModalTag = () => {
  const v = el('modal-tag-input').value.replace(/^#/, '').trim();
  if (!v || modalState.tags.includes(v)) { el('modal-tag-input').value = ''; return; }
  modalState.tags.push(v);
  el('modal-tag-input').value = '';
  refreshModalTags();
};
el('modal-tag-add').addEventListener('click', addModalTag);
el('modal-tag-input').addEventListener('keydown', (e) => {
  if (isComposingKey(e)) return;                 // 修飾キーなしの Enter なので IME ガードが必要
  if (e.key === 'Enter') { e.preventDefault(); addModalTag(); }
});
const addModalLink = (name) => {
  const v = String(name === undefined ? el('modal-link-input').value : name).replace(/^\[\[|\]\]$/g, '').trim();
  if (!v || modalState.links.includes(v)) { el('modal-link-input').value = ''; return; }
  modalState.links.push(v);
  el('modal-link-input').value = '';
  refreshModalLinks();
};
el('modal-dep-add').addEventListener('click', () => {
  const v = Number(el('modal-dep-select').value);
  if (!v || modalState.deps.includes(v)) return;
  modalState.deps.push(v);
  refreshModalDeps();
});
el('modal-link-add').addEventListener('click', () => addModalLink());
el('modal-link-today').addEventListener('click', () => addModalLink(todayStr()));
el('modal-think').addEventListener('click', () => thinkAbout(null, true));
el('modal-link-input').addEventListener('keydown', (e) => {
  if (isComposingKey(e)) return;
  if (e.key === 'Enter') { e.preventDefault(); addModalLink(); }
});


// タグの付与・削除。既存タグをトグルし、新規はテキスト入力（Enter で追加）
function openTagPopover(anchor, t) {
  openPopover(anchor, (pop) => {
    const label = document.createElement('span');
    label.textContent = 'タグ（クリックで付与・解除）';
    pop.appendChild(label);
    const all = [];
    for (const x of state.doc.tasks) for (const tag of x.tags) if (!all.includes(tag)) all.push(tag);
    const apply = (tags) => {
      if (applyUiOp({ type: 'setTags', line: t.line, tags })) {
        showBanner('info', 'タグを変更しました（ファイルへは保存時に反映）');
      }
    };
    if (all.length) {
      const btns = document.createElement('div');
      btns.className = 'row-btns';
      for (const tag of all) {
        const b = document.createElement('button');
        b.textContent = '#' + tag;
        if (t.tags.includes(tag)) b.classList.add('active');
        b.addEventListener('click', () => {
          const next = t.tags.includes(tag) ? t.tags.filter(x => x !== tag) : t.tags.concat([tag]);
          apply(next);
          closePopover();
        });
        btns.appendChild(b);
      }
      pop.appendChild(btns);
    }
    const row = document.createElement('div');
    row.className = 'row-btns';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'tag-input';
    input.placeholder = '新しいタグ';
    input.style.width = '160px';
    const add = () => {
      const v = input.value.replace(/^#/, '').trim();
      if (!v) return;
      apply(t.tags.concat([v]));
      closePopover();
    };
    // 修飾キーなしの Enter を使うので IME ガードが必要（Phase I と同じ理由。5箇所目）
    input.addEventListener('keydown', (e) => {
      if (isComposingKey(e)) return;
      if (e.key === 'Enter') add();
    });
    row.appendChild(input);
    const b = document.createElement('button');
    b.className = 'primary';
    b.textContent = '追加';
    b.addEventListener('click', add);
    row.appendChild(b);
    pop.appendChild(row);
    setTimeout(() => input.focus(), 0);
  });
}

function openChildPopover(anchor, t) {
  openPopover(anchor, (pop) => {
    const label = document.createElement('span');
    label.textContent = '子タスクを追加';
    pop.appendChild(label);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '内容';
    input.style.width = '240px';
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      applyUiOp({ type: 'addChild', parentLine: t.line, content: v });
      closePopover();
    };
    input.addEventListener('keydown', (e) => {
      if (isComposingKey(e)) return;
      if (e.key === 'Enter') add();
    });
    pop.appendChild(input);
    const b = document.createElement('button');
    b.className = 'primary';
    b.textContent = '追加';
    b.addEventListener('click', add);
    pop.appendChild(b);
    setTimeout(() => input.focus(), 0);
  });
}

