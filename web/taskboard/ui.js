'use strict';
/* web/taskboard/ui.js — Excel コピー・週報コピー・UI 状態の永続化・イベント配線
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- Excel 用コピー ---------- */

const tsvClean = (v) => String(v == null ? '' : v).replace(/[\t\n\r]/g, ' ');

// TSV の状態列。画面の印と1対1に対応させる（不明は「未」に寄せる＝未完了だから）
const TSV_STATE = { done: '済', cancelled: '中止', hold: '保留', doing: '着手' };
const tsvState = (status) => TSV_STATE[status] || '未';

// リストビュー用。表に開始日列があるので TSV にも入れる（画面と出力を食い違わせない。TB-Q14）
/* ---------- 週報コピー（TB-WR1/WR2）。要約は AI の領分 — ここは機械的な抽出だけ ---------- */

// 週の範囲（月曜始まり）。which = 'this'（直近の月曜〜今日）| 'last'（その前の月〜日）
function weekRange(today, which) {
  const d = dayNum(today);
  const monday = d - ((d + 3) % 7);   // 1970-01-01（day 0）は木曜 → +3 で月曜=0
  const from = which === 'last' ? monday - 7 : monday;
  const to = which === 'last' ? monday - 1 : d;
  return { from: addDays(today, from - d), to: addDays(today, to - d) };
}

// 完了（DONE）かつ ✅ が期間内のタスクをセクション別（ファイル出現順）に列挙。
// 中止・✅ の無い完了は含めない（どの週の成果か言えないため）
function buildWeeklyReport(tasks, from, to) {
  const done = tasks.filter(t =>
    t.status === ST_DONE && t.doneDate && t.doneDate >= from && t.doneDate <= to);
  const head = '【完了タスク】' + from + '〜' + to + '（' + done.length + '件）';
  if (!done.length) return head + '\n・該当なし';
  const secs = [];
  const bySec = new Map();
  for (const t of done) {
    const s = t.section || 'その他';
    if (!bySec.has(s)) { bySec.set(s, []); secs.push(s); }
    bySec.get(s).push(t);
  }
  const out = [head];
  for (const s of secs) {
    out.push('', '■' + s);
    for (const t of bySec.get(s)) {
      out.push('・' + (t.displayBody || t.body) + '（' + t.doneDate.slice(5).replace('-', '/') + '）');
    }
  }
  return out.join('\n');
}

function buildTsv(rows) {
  const out = ['状態\t内容\t開始日\t期限\t優先度\tタグ\tセクション']; // ヘッダー行（TB-Q4 決定）
  for (const t of rows) {
    out.push([
      tsvState(t.status),
      '　'.repeat(t.indent) + (t.displayBody || t.body),
      t.start || '',
      t.due || '',
      t.priority ? PRI_LABEL[t.priority] : '',
      t.tags.map(x => '#' + x).join(' '),
      t.section || '',
    ].map(tsvClean).join('\t'));
  }
  return out.join('\n');
}

// タイムラインビュー用（WBS・報告資料への転記）。状態は図の色分けと一致させる
function buildPlanTsv(items) {
  const out = ['内容\t開始日\t期限\t日数\t状態\tセクション'];
  for (const it of items) {
    out.push([
      '　'.repeat(it.indent) + it.body,
      it.start,
      it.due || '',
      it.days === null ? '' : it.days,   // 📅 が無ければ空欄（推測値を書かない）
      it.state === 'late' ? '遅延' : tsvState(it.status),   // 遅延は「着手」より重い情報なので優先する
      it.section,
    ].map(tsvClean).join('\t'));
  }
  return out.join('\n');
}

function copyFeedback(btn, ok, fallbackMsg) {
  ToolUI.feedback(btn, ok ? '✓ コピーしました' : fallbackMsg);
}

async function copyText(text, btn) {
  // フォールバックしたときに「選択済み」が嘘にならないよう、画面外ヘルパに先に入れて渡す
  const ta = el('copy-helper');
  ta.value = text;
  const ok = await ToolUI.copy(text, { selectEl: ta });
  copyFeedback(btn, ok, '選択済み: Cmd+C でコピー');
}

/* ---------- UI 状態の永続化（タスクデータは保存しない） ---------- */

function persistUi() {
  ToolStorage.save(TOOL, {
    view: state.ui.view, sort: state.ui.sort, section: state.ui.section,
    tag: state.ui.tag, showDone: state.ui.showDone, add: state.ui.add,
    board: state.ui.board, tlZoom: state.ui.tlZoom, nowFolded: state.ui.nowFolded,
  });
}
function restoreUi() {
  const s = ToolStorage.load(TOOL);
  if (!s || typeof s !== 'object') return;
  // view / sort は既知値のみ採用する（未知値だと <select> が空になり並び順が壊れる）
  if (UI_VIEWS.includes(s.view)) state.ui.view = s.view;
  if (UI_SORTS.includes(s.sort)) state.ui.sort = s.sort;
  if (typeof s.section === 'string') state.ui.section = s.section;
  if (typeof s.tag === 'string') state.ui.tag = s.tag;
  if (typeof s.showDone === 'boolean') state.ui.showDone = s.showDone;
  // 列の基準も既知値のみ（未知なら section にフォールバック）
  if (s.board && typeof s.board === 'object' && BOARD_GROUPS.includes(s.board.groupBy)) {
    state.ui.board.groupBy = s.board.groupBy;
  }
  // ズームも既知値のみ（未知なら day）
  if (TL_ZOOM_KEYS.includes(s.tlZoom)) state.ui.tlZoom = s.tlZoom;
  if (typeof s.nowFolded === 'boolean') state.ui.nowFolded = s.nowFolded;
  if (s.add && typeof s.add === 'object') {
    for (const k of ['section', 'priority']) {   // 開始日・期限は読まない（TB-Q73 — 前の保存に残っていても引き継がない）
      if (typeof s.add[k] === 'string') state.ui.add[k] = s.add[k];
    }
    if (Array.isArray(s.add.tags)) {
      state.ui.add.tags = s.add.tags.filter(x => typeof x === 'string');
    }
  }
}

/* ---------- イベント ---------- */

el('f-section').addEventListener('change', () => { state.ui.section = el('f-section').value; persistUi(); render(); });
el('f-tag').addEventListener('change', () => { state.ui.tag = el('f-tag').value; persistUi(); render(); });
el('f-done').addEventListener('change', () => { state.ui.showDone = el('f-done').checked; persistUi(); render(); });
el('f-sort').addEventListener('change', () => { state.ui.sort = el('f-sort').value; persistUi(); render(); });
// 検索は 250ms デバウンス。**IME 変換中は走らせない**（未確定文字で絞ると結果が飛ぶ）。
// InputEvent.isComposing が使えることを 2026-08-06 に実測して確認済み
let qTimer = null;
const runSearch = () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.ui.q = el('f-q').value; render(); }, 250);
};
el('f-q').addEventListener('input', (e) => { if (e.isComposing) return; runSearch(); });
el('f-q').addEventListener('compositionend', runSearch);
el('f-q').addEventListener('keydown', (e) => {
  if (isComposingKey(e)) return;               // 変換取り消しの Escape を奪わない
  if (e.key === 'Escape' && el('f-q').value !== '') {
    e.preventDefault();
    el('f-q').value = '';
    runSearch();
  }
});
el('f-zoom').addEventListener('change', () => {
  state.ui.tlZoom = el('f-zoom').value;
  persistUi();
  render();
});
el('f-groupby').addEventListener('change', () => {
  state.ui.board.groupBy = el('f-groupby').value;
  persistUi();
  render();
});

/* vault 名の設定（lib/config.js）。効くのは obsidian:// リンクだけで、tasks.md の読み書きには
   関係しない。保存は change（blur / Enter）で行う — 1文字ごとに保存すると、入力途中の
   半端な vault 名でリンクが作られる */
el('cfg-vault').value = VAULT_NAME;
el('cfg-vault').addEventListener('change', () => {
  ToolConfig.set({ vaultName: el('cfg-vault').value });
  VAULT_NAME = ToolConfig.get('vaultName');
  el('cfg-vault').value = VAULT_NAME;   // 正規化（前後の空白除去）の結果を画面へ戻す
  if (state.doc) render();              // 既に表示中のチップをリンク有無に追随させる
});
el('view-tabs').addEventListener('click', (e) => {
  const v = e.target.dataset && e.target.dataset.view;
  if (!v || v === state.ui.view) return;
  if (v === 'timeline') tlAutoScrolled = false;   // 開き直したら今日へスクロール（TB-R24）
  state.ui.view = v;
  persistUi();
  render();
});

// ［＋タスク追加］はモーダルを開く（1行フォームは廃止。既定値の投入箇所を1つにする）
el('btn-add-form').addEventListener('click', () => openTaskModal('new'));

el('btn-save').addEventListener('click', doSave);
el('btn-archive').addEventListener('click', doArchive);
el('btn-reload').addEventListener('click', () => reloadFromAdapter(false));
// Cmd/Ctrl+S で保存（ブラウザの「ページを保存」は常に抑止）
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    if (!el('btn-save').disabled) el('btn-save').click();
  }
});
// Draw Gantt へ渡す（sessionStorage の一時バッファ。正本は tasks.md のまま — coding-rules）
el('btn-to-gantt').addEventListener('click', () => {
  const m = state.timeline;
  if (m && m.guard) { copyFeedback(el('btn-to-gantt'), false, '表示していないため渡せません'); return; }
  if (!m || !m.items.length) { copyFeedback(el('btn-to-gantt'), false, '渡す行がありません'); return; }
  ToolHandoff.send('gantt', 'plan', buildPlanTsv(m.items), 'gantt.html');
});

el('btn-copy').addEventListener('click', () => {
  const btn = el('btn-copy');
  if (state.ui.view === 'timeline') {
    const m = state.timeline;
    // 画面に無いものはコピーさせない（ガード発動中は描画していない）
    if (m && m.guard) { copyFeedback(btn, false, '表示していないためコピーできません'); return; }
    if (!m || !m.items.length) { copyFeedback(btn, false, '出力がありません'); return; }
    copyText(buildPlanTsv(m.items), btn);
    return;
  }
  if (!state.visibleRows.length) { copyFeedback(btn, false, '出力がありません'); return; }
  copyText(buildTsv(state.visibleRows), btn);
});
// 週報コピー（TB-WR2）。対象は全タスク — 絞り込み・「終了を含む」OFF の影響を受けない
el('btn-weekly').addEventListener('click', () => {
  const r = weekRange(todayStr(), el('wr-period').value);
  copyText(buildWeeklyReport(state.doc.tasks, r.from, r.to), el('btn-weekly'));
});
el('btn-copy-all').addEventListener('click', () => {
  if (!state.loaded) return;
  copyText(joinLines(state.lines), el('btn-copy-all'));
});

