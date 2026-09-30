'use strict';
/* web/taskboard/io.js — アダプタ・アプリ状態（state / el / todayStr）・バナー・読込保存・外部変更検知・FSA フロー・イシューノート・初期化・デモ
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ========== アダプタ ========== */

function makeFsaAdapter(handle) {
  return {
    // handle は archive.md のピッカーを同じディレクトリで開くため（startIn）に公開する（AR-1）
    mode: 'fsa', name: handle.name, canCheck: true, handle,
    read: async () => (await handle.getFile()).text(),
    write: async (text) => {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
    },
  };
}
function makeMemoryAdapter(text) {
  let mem = text;
  return {
    mode: 'memory', name: '(メモリ)', canCheck: true,
    read: async () => mem,
    write: async (t) => { mem = t; },
    _external: (t) => { mem = t; },
    _get: () => mem,
  };
}
function makeFallbackAdapter(name) {
  return {
    mode: 'fallback', name, canCheck: false, // 外部変更検知は不可（spec フォールバック仕様）
    read: null,
    write: async (text) => { downloadText(text, name || 'tasks.md'); },
  };
}

function downloadText(text, name) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ========== アプリ状態 ========== */

const state = {
  adapter: null, handle: null,
  lines: null, snapshot: null,
  loaded: false,
  doc: null, visibleRows: [],
  todayOverride: null,
  fsaOff: false, // テスト用: フォールバック UI 強制
  demo: false,       // デモデータ表示中（保存・アーカイブ無効）
  hasCRFile: false,  // CR 改行ファイル（表示のみ・追加/アーカイブ無効）
  archiveAdapter: null, archiveHandle: null,
  timeline: null,    // 直近の timelineModel（Excel 用コピーが参照する。リスト時は null）
  boardCols: null,   // 直近に描画したボードの列（キーボード移動が同じ集合を見るため）
  depGraph: null,    // 直近の依存グラフ（リスト・ボードの印と完了時の警告が参照する）
  // メモ・ボードの子タスクの展開状態。**永続化しない**
  // （行番号は編集で動くため、保存すると別の行が開く）
  memoOpen: new Set(),
  // リストでたたんだ親の行（TB-V2）。**永続化しない**（メモの展開と同じ理由）
  collapsed: new Set(),
  drag: null,        // ドラッグ中の { line, banned }（TB-K19）
  lastUndo: null,    // 直前の削除・移動（TB-Q65 — 1回だけ戻せる）
  // 検索で自動的に開いたメモの行（手動で開いたものと区別して、検索をやめたら畳む）
  memoAutoOpen: new Set(),
  boardKidsOpen: new Set(),
  // タイムラインで折り畳んだセクション。**永続化しない**（TB-Q48。tasks.md 側で
  // セクション名が変わると迷子になる。メモ・ボードの子と同じ方針）
  tlClosed: new Set(),
  ui: {
    view: 'list', sort: 'file', section: '', tag: '', showDone: false,
    q: '',   // 検索語。**永続化しない**（persistUi に入れない）
    board: { groupBy: 'section' },   // ボードの列の基準（永続化する）
    tlZoom: 'day',                   // タイムラインのズーム（永続化する）
    // 追加モーダルの前回値（クリアも '' として記憶する。固定デフォルトは実態に合わない）。
    // 書き込みは rememberFromOp（全編集経路）、投入は openTaskModal の1箇所だけ
    // start/due の **null は「未設定」＝新規で今日を入れる**。'' は「クリアした」＝空のまま（TB-D2）。
    // restoreUi は文字列しか復元しないので、保存が無ければ null のまま
    add: { section: '', start: null, due: null, priority: '', tags: [] },
  },
};

// restoreUi で受け入れる値の列挙（未知値が入ると <select> の値が空になり並び順が壊れる。TB-Q17）
const UI_VIEWS = ['list', 'board', 'timeline'];
const UI_SORTS = ['file', 'start', 'due', 'priority'];

function fsaAvailable() { return !state.fsaOff && 'showOpenFilePicker' in window; }

function todayStr() {
  if (state.todayOverride) return state.todayOverride;
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function addDays(ymd, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const d = new Date(+m[1], +m[2] - 1, +m[3] + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

const el = (id) => document.getElementById(id);

/* ---------- バナー ---------- */

// このツールだけ**バナー内にボタン**を置ける（「再読込」等の次アクション）。
// class と role の決定は共通核が持ち、ボタンの追加だけがラッパの仕事
function showBanner(kind, text, actions) {
  const b = ToolUI.banner(el('banner'), kind, text);
  if (actions) {
    for (const a of actions) {
      // href があればリンク（obsidian:// など — TB-N6）、無ければボタン
      const btn = document.createElement(a.href ? 'a' : 'button');
      btn.textContent = a.label;
      btn.style.marginLeft = '10px';
      if (a.href) btn.href = a.href; else btn.addEventListener('click', a.onClick);
      b.appendChild(btn);
    }
  }
  b.hidden = false;
}
function hideBanner() { el('banner').hidden = true; }

/* ---------- 読込・保存 ---------- */

function loadText(text, adapter) {
  if (text.length > MAX_CHARS) {
    showBanner('error', '入力が上限（200万文字）を超えたため読み込みを中止しました');
    return false;
  }
  state.adapter = adapter;
  state.snapshot = text;
  state.lines = toLines(text);
  state.loaded = true;
  state.demo = false;
  state.hasCRFile = text.includes('\r');
  // 展開・折り畳みは読み込んだファイルに紐づくので捨てる
  // （行番号もセクション名も別のファイルでは通じない。ボードの子で踏んだのと同じ型）
  state.memoOpen.clear();
  state.memoAutoOpen.clear();
  state.boardKidsOpen.clear();
  state.tlClosed.clear();
  tlAutoScrolled = false;   // 読み込み直後の初回描画は今日へスクロール（TB-R24）
  hideBanner();
  if (state.hasCRFile) {
    showBanner('warn', 'CR 改行（Windows形式）のファイルです。表示のみ可能で、該当行の編集・タスク追加・アーカイブはできません（Obsidian 標準は LF）');
  }
  render();
  updateFileBar();
  applyPendingTask();       // Check Issue から来ていれば、読み込めた今この場で追加画面を開く
  return true;
}

/* Check Issue からの受け取り（lib/handoff.js・kind='task'・text は JSON）。
   tasks.md が読めていないうちはモーダルにセクションが無いので、**読み込み完了時**に開く。
   取り出しは起動時に1回（consume）。読まれずに終わったら banner で伝える */
let pendingTask = (function () {
  if (!window.ToolHandoff) return null;
  const h = ToolHandoff.take('taskboard');
  if (!h || h.kind !== 'task') return null;
  try { return JSON.parse(h.text); } catch (_) { return null; }
})();
function applyPendingTask() {
  if (!pendingTask || !state.loaded || state.demo) return;
  const pf = pendingTask;
  pendingTask = null;
  openTaskModal('new', null, { prefill: pf });
}

function isDirty() {
  if (!state.loaded) return false;
  const c = diffCounts(state.lines);
  if (c.changed + c.added > 0) return true;
  // セクション移動は行の中身を変えず並び替えるだけなので行単位の差分に出ない。
  // 全文をスナップショットと比べて拾う（比較のみ。保存内容は正規化しない）
  return joinLines(state.lines) !== state.snapshot;
}

// 未保存の「未完了 → 終了（完了・中止）」の件数。カウンタを持たず行配列から導出するので
// 同期ずれが起きない。保存時に1回だけ呼ぶ（通常操作を重くしない）。解除は数えない（AR-3）。
// **着手中（[/]）→ 完了 も、→ 中止 も数える**（数えないと5件以上の一括操作で確認が出ず、
// 8/3 のアーカイブ事故の再発経路になる。中止もアーカイブ対象なので同じ重さ）
function countNewlyFinished(lines) {
  let done = 0, cancelled = 0;
  for (const l of lines) {
    if (l.orig === null) continue;
    const before = statusOfLine(l.orig), after = statusOfLine(l.raw);
    if (!before || !after || isFinished(before) || !isFinished(after)) continue;
    if (after === ST_CANCELLED) cancelled++; else done++;
  }
  return { total: done + cancelled, done, cancelled };
}
const BULK_COMPLETE_THRESHOLD = 5; // これ以上の一括完了は保存時に確認する（AR-3）

async function doSave(opts) {
  const auto = !!(opts && opts.auto);
  if (!state.loaded || !state.adapter) return { ok: false, reason: 'notloaded' };
  if (state.demo) {
    if (!auto) showBanner('info', 'デモ中は保存できません');
    return { ok: false, reason: 'demo' };
  }
  // 一括完了チェックの事故防止: 5件以上の完了・中止を含む保存は確認する。
  // 全部が完了なら文言は従来どおり（中止が混ざったときだけ「完了/中止」にする）
  const fin = countNewlyFinished(state.lines);
  const completing = fin.total;
  if (completing >= BULK_COMPLETE_THRESHOLD) {
    // **自動保存は確認ダイアログを出さない**（勝手にモーダルが出るのは筋が悪い）。
    // 明示保存に委ね、その旨をバナーで伝える（spec「自動保存しない条件」）
    if (auto) {
      showBanner('info', completing + '件の完了を含むため自動保存しません。［今すぐ保存］を押してください');
      return { ok: false, reason: 'bulk-auto' };
    }
    if (!confirm(completing + '件を' + (fin.cancelled ? '完了/中止' : '完了') + 'にします。よろしいですか？')) {
      showBanner('info', '保存を中止しました');
      return { ok: false, reason: 'cancel' };
    }
  }
  const text = joinLines(state.lines);
  const counts = diffCounts(state.lines);
  const prevLineCount = state.snapshot.split('\n').length; // 削除を言葉で区別するため
  if (state.adapter.canCheck) {
    let disk;
    try {
      disk = await state.adapter.read();
    } catch (e) {
      showBanner('error', '保存前の再読込に失敗しました: ' + (e && e.name));
      return { ok: false, reason: 'readfail' };
    }
    // 比較は必ず NFC 正規化後（偽検知防止）。保存内容には正規化を適用しない
    if (nfc(disk) !== nfc(state.snapshot)) {
      showBanner('warn', 'Obsidian側で変更されています。上書きを避けるため保存を中止しました。再読込してから編集し直してください。',
        [{ label: '変更を破棄して再読込', onClick: () => reloadFromAdapter(true) }]);
      return { ok: false, reason: 'conflict' };
    }
  }
  try {
    await state.adapter.write(text);
  } catch (e) {
    showBanner('error', '保存に失敗しました: ' + (e && e.name));
    return { ok: false, reason: 'writefail' };
  }
  // 行の移動・行の削除は行内容を変えないので変更0行・追加0行になる。
  // そのまま出すと誤解を招くため、行数の増減で区別して言葉を変える
  const removed = prevLineCount - text.split('\n').length;
  state.snapshot = text;
  for (const l of state.lines) l.orig = l.raw;
  render();
  const msg = (counts.changed + counts.added > 0)
    ? '（変更' + counts.changed + '行・追加' + counts.added + '行）'
    : (removed > 0 ? '（' + removed + '行を削除）' : '（行の移動）');
  if (auto) {
    // 1.2秒ごとに success バナーが出るとうるさいので、静かな表示に留める（spec）
    const d = new Date();
    el('save-state').textContent = '自動保存しました '
      + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } else {
    showBanner('success', state.adapter.mode === 'fallback'
      ? 'ダウンロードしました' + msg + '。vault の tasks.md と差し替えてください'
      : '保存しました' + msg);
  }
  return { ok: true, changed: counts.changed, added: counts.added };
}

/* 自動保存（spec「保存仕様」）。**明示保存と同じ doSave を通す**ので鮮度チェックは落ちない。
   fallback（ダウンロード）とデモは対象外 */
const AUTOSAVE_MS = 1200;
let autoSaveTimer = null;
function scheduleAutoSave() {
  if (!state.loaded || !state.adapter || state.demo) return;
  if (state.adapter.mode === 'fallback') return;   // 毎回ファイルが降ってしまう
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    if (isDirty()) doSave({ auto: true });
  }, AUTOSAVE_MS);
}
function flushAutoSave() {
  if (autoSaveTimer === null) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  if (isDirty()) doSave({ auto: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAutoSave();
});

async function reloadFromAdapter(skipConfirm) {
  if (!state.adapter || !state.adapter.canCheck) return;
  if (isDirty() && !skipConfirm && !confirm('未保存の変更を破棄して再読込しますか？')) return;
  try {
    const text = await state.adapter.read();
    loadText(text, state.adapter);
    showBanner('info', '再読込しました');
  } catch (e) {
    showBanner('error', '再読込に失敗しました: ' + (e && e.name));
  }
}

// フォーカス復帰時の外部変更チェック（FSA のみ）: 未編集なら自動再読込、編集中は警告
let lastCheck = 0;
async function checkExternal() {
  if (!state.loaded || !state.adapter || state.adapter.mode !== 'fsa') return;
  const now = Date.now();
  if (now - lastCheck < 2000) return;
  lastCheck = now;
  let disk;
  try { disk = await state.adapter.read(); } catch (_) { return; }
  if (nfc(disk) === nfc(state.snapshot)) return;
  if (isDirty()) {
    showBanner('warn', 'Obsidian側で変更されています。このまま保存すると中止されます。',
      [{ label: '変更を破棄して再読込', onClick: () => reloadFromAdapter(true) }]);
  } else {
    loadText(disk, state.adapter);
    showBanner('info', 'Obsidian側の変更を再読込しました');
  }
}
window.addEventListener('focus', checkExternal);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkExternal(); });
window.addEventListener('beforeunload', (e) => { if (isDirty() && !state.demo) e.preventDefault(); });

/* ---------- FSA フロー ---------- */

async function verifyPermission(handle) { return ToolFsa.ensurePermission(handle); }   // lib/fsa.js（2026-09-25）

/* ---------- タスクを考える場所へ（TB-N・TB-Q61 — イシューノートを開く／無ければ作る） ---------- */

/* イシューノートのフォルダ。初回だけ選ぶ（Check Issue と同じフォルダを選ぶ）。ハンドルは IDB に持つが
   ツール間では共有しない（各ツールが自分のハンドルを持つ作法）。null = 選ばなかった（キャンセル） */
async function issueDirHandle() {
  let h = null;
  try { h = await handles.get(IDB_KEY_ISSUE); } catch (_) {}
  if (h && await verifyPermission(h)) return h;
  try {
    h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'tools-issue-dir' });
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
    throw e;
  }
  handles.set(IDB_KEY_ISSUE, h).catch(() => {});
  return h;
}
async function dirHasFile(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch (_) { return false; }
}
// YAML の値として安全に書く。記号を含むなら "…"（JSON の文字列は YAML の二重引用として有効）
function yamlScalar(v) {
  const t = String(v);
  return /[:#\[\]{},&*!|>'"%@`]|^\s|\s$|^-/.test(t) ? JSON.stringify(t) : t;
}
/* 既存ノートに案件を足す（TB-N7/N8）。**値があれば上書きしない**・空なら埋める。
   位置は status: の直後、無ければ frontmatter の末尾。frontmatter が無ければ作る。本文は1文字も変えない */
function fillProject(text, project) {
  const t = String(text);
  const line = 'project: ' + yamlScalar(project);
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) return '---\n' + line + '\n---\n' + t;
  const ls = m[1].split(/\r?\n/);
  const at = ls.findIndex(l => /^project:/.test(l));
  if (at >= 0) {
    if (ls[at].replace(/^project:\s*/, '').trim() !== '') return t;   // 既にある → 触らない
    ls[at] = line;
  } else {
    const st = ls.findIndex(l => /^status:/.test(l));
    if (st >= 0) ls.splice(st + 1, 0, line); else ls.push(line);
  }
  return '---\n' + ls.join('\n') + '\n---' + m[2] + t.slice(m[0].length);
}
// 骨は 99_Templates/issue.md の見出しだけ。**論点は空のまま** — 書き殴って見つける（利用者の前提）
function issueNoteMd(title, tasksName, today, project) {
  return ['---', 'created: ' + today, 'status: open']
    .concat(project ? ['project: ' + yamlScalar(project)] : [])   // 案件＝タスクのセクション（TB-Q62）
    .concat(['tags: [issue]', '---',
    '# ' + title, '', '← タスク: [[' + tasksName + ']]', '',
    // 論点の置き場所の注記。Check Issue の判定（closed / request）とテンプレと同じ文言（IS-Q22）
    '## 論点', '', '> 論点は答えを先に置いた1行（〜ではなく〜ではないか）。確認すること・やることは `## 掘る` に `- [ ]`（論点の一覧に出ない）', '', '- [ ] ', '',
    // 掘るの止め時。Check Issue の toNote・vault のテンプレと同じ1行（IS-Q19）
    '## 掘る', '', '> 10分で論点の行が書けなければ「悩んでいる」— 型（A/B）を確かめる／人に聞く／一次情報を見る', '', '- ', '']).join('\n');
}
// tasks ファイルの名前（拡張子なし）。メモリ／フォールバックなど .md でなければ tasks
function tasksBaseName() {
  const n = state.adapter && state.adapter.name;
  return (n && /\.md$/i.test(n)) ? n.replace(/\.md$/i, '') : 'tasks';
}
// 自動保存を待たずに今保存する。外部スキームへ遷移する前に使う —
// 未保存のままだと beforeunload が離脱確認を出す（obsidian:// でも発火する。実測・verification-notes §11）
async function saveNow() {
  if (autoSaveTimer !== null) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  if (isDirty()) await doSave({ auto: true });
}
function openIssueNote(name, what) {
  const href = obsidianHref(name);
  showBanner('info', what + ': ' + name, href ? [{ label: 'Obsidian で開く', href }] : null);
  if (href) location.href = href;   // 外部スキームなのでページは離れない
}
/* 1ボタン＝「このタスクを考える場所へ」。関連ノートのうちイシューフォルダに実在するものがあれば開くだけ。
   無ければ <今日>_<内容>.md を作り、[[…]] を足して保存し、開く（TB-N1/N2）。
   fromModal: モーダルの値で動き、保存の流儀のまま（編集は閉じる・新規は続けて足せるよう開いたまま）。
   それ以外は行 t を editContent で更新して自動保存を待つ */
async function thinkAbout(t, fromModal) {
  if (!state.loaded || state.demo) { showBanner('warn', 'tasks.md を開いてから使えます'); return; }
  if (!('showDirectoryPicker' in window)) {
    showBanner('warn', 'このブラウザではノートを作れません（Chrome / Edge で開いてください）');
    return;
  }
  const content = fromModal ? el('modal-content').value.trim() : modalContentOf(t);
  if (content === '') {
    showBanner('warn', 'タスクの内容を入力してください');
    if (fromModal) el('modal-content').focus();
    return;
  }
  const links = (fromModal ? modalState.links : t.links).slice();
  // 案件＝そのタスクのセクション（TB-Q62）
  const project = fromModal ? el('modal-section').value : (t.section || '');
  let dir;
  try { dir = await issueDirHandle(); }
  catch (_) { showBanner('error', 'イシューのフォルダを開けませんでした'); return; }
  if (!dir) return;
  for (const l of links) {
    if (await dirHasFile(dir, l + '.md')) {
      // 開くだけ。ただし案件が無ければ足す（上書きはしない — TB-N7）
      if (project) {
        try {
          const fh = await dir.getFileHandle(l + '.md');
          const cur = await (await fh.getFile()).text();
          const next = fillProject(cur, project);
          if (next !== cur) { const w = await fh.createWritable(); await w.write(next); await w.close(); }
        } catch (_) { /* 足せなくても開くのは止めない */ }
      }
      openIssueNote(l, '📝 このタスクのノート');
      return;
    }
  }
  const file = ToolEdit.noteFileName(content, todayStr());
  const name = file.replace(/\.md$/, '');
  if (!(await dirHasFile(dir, file))) {       // 同名があれば作らない（上書きしない）
    try {
      const fh = await dir.getFileHandle(file, { create: true });
      const w = await fh.createWritable();
      await w.write(issueNoteMd(content, tasksBaseName(), todayStr(), project));
      await w.close();
    } catch (_) { showBanner('error', 'ノートを作れませんでした: ' + file); return; }
  }
  if (fromModal) {
    if (!modalState) return;                  // 待っている間に閉じられた
    addModalLink(name);
    saveModal();
  } else if (!links.includes(name)) {
    const body = bodyTextOf({ content, tags: t.tags, links: links.concat([name]) });
    if (!applyUiOp({ type: 'editContent', line: t.line, text: body })) return;
  }
  await saveNow();
  openIssueNote(name, '📝 ノートを作りました');
}

async function openViaPicker() {
  let handle;
  try {
    [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }],
      multiple: false,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') return; // キャンセル
    showBanner('error', 'ファイルを開けませんでした: ' + (e && e.name));
    return;
  }
  await openFromHandle(handle, true);
}

async function openFromHandle(handle, store) {
  try {
    if (!(await verifyPermission(handle))) {
      showBanner('warn', 'ファイルへのアクセスが許可されませんでした');
      return;
    }
    const text = await (await handle.getFile()).text();
    if (loadText(text, makeFsaAdapter(handle))) {
      state.handle = handle;
      if (store) handles.set(IDB_KEY, handle).catch(() => {});
    }
  } catch (e) {
    showBanner('error', '読み込みに失敗しました: ' + (e && e.name));
  }
}

async function initFile() {
  if (!fsaAvailable()) { enterFallbackUi(); return; }
  updateFileBar();
  let handle = null;
  try { handle = await handles.get(IDB_KEY); } catch (_) {}
  if (handle && handle.kind === 'file') {
    let p = 'prompt';
    try { p = await handle.queryPermission({ mode: 'readwrite' }); } catch (_) {}
    if (p === 'granted') { await openFromHandle(handle, false); return; }
    state.resumeHandle = handle; // 再許可ワンクリックで開く
    updateFileBar();
  }
}

function enterFallbackUi() {
  const note = el('fallback-note');
  note.textContent = 'このブラウザではファイルへ直接保存できません（File System Access API 非対応）。読み込みはファイル選択、保存はダウンロード／全文コピーで vault に手動反映してください。';
  note.hidden = false;
  el('btn-copy-all').hidden = false;
  el('btn-reload').hidden = true;
  el('btn-save').textContent = '保存（ダウンロード）';
  updateFileBar();
}

// デモデータ（メモリ上のみ。期限は今日基準で生成し、超過・当日・先日付の色分けが見える）
function demoText() {
  const T = todayStr();
  return ['<!--', 'デモデータ（メモリ上のみ・ファイルには書き込みません）', '-->', '',
    '# tasks', '', '## 今週', '',
    '- [ ] 設計書のレビュー依頼 #レビュー [[2026-07-30]] 📅 ' + T + ' ⏫',
    '- [ ] 議事録の清書 📅 ' + addDays(T, -1),
    '\t- [ ] 決定事項の抜き出し',
    '- [x] キックオフ資料の準備 ✅ ' + addDays(T, -2),
    // 計画ビューを試せるように 🛫 付きも入れる（遅延・進行中・予定・完了が1つずつ出る）
    '- [ ] 外部IF定義書作成 🛫 ' + addDays(T, -7) + ' 📅 ' + addDays(T, -3),
    '- [ ] 基本設計レビュー ⏫ 🛫 ' + addDays(T, -3) + ' 📅 ' + addDays(T, 6),
    '', '## 来週', '',
    '- [ ] 見積の見直し #見積 📅 ' + addDays(T, 3) + ' 🔽',
    '- [ ] 結合テスト計画 🛫 ' + addDays(T, 16) + ' 📅 ' + addDays(T, 27),
    '- [x] 要件ヒアリング 🛫 ' + addDays(T, -15) + ' 📅 ' + addDays(T, -11) + ' ✅ ' + addDays(T, -11),
    '', '## その他', ''].join('\n');
}
function loadDemo() {
  const text = demoText();
  loadText(text, makeMemoryAdapter(text));
  state.demo = true;
  render();
  updateFileBar();
  showBanner('info', 'デモデータを表示中（メモリ上のみ・保存とアーカイブは無効）。実データは「tasks.md を開く」から開いてください');
}

function updateFileBar() {
  const box = el('file-actions');
  box.textContent = '';
  const nameEl = el('file-name');
  if (state.loaded && state.adapter) {
    nameEl.textContent = '📄 ' + state.adapter.name + (state.demo ? '（デモ）' : '');
  } else {
    nameEl.textContent = '';
  }
  const appendDemoBtn = () => {
    if (state.loaded) return;
    const btn = document.createElement('button');
    btn.textContent = 'デモデータを表示';
    btn.title = 'ファイルなしで画面を試す（メモリ上のみ）';
    btn.addEventListener('click', loadDemo);
    box.appendChild(btn);
  };
  if (!fsaAvailable()) {
    // フォールバックでは常にファイル選択を出す（別ファイルへの切替もこれで行う）
    const label = document.createElement('label');
    label.className = 'toggle';
    label.textContent = 'tasks.md を選択: ';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      loadText(await f.text(), makeFallbackAdapter(f.name));
    });
    label.appendChild(input);
    box.appendChild(label);
    appendDemoBtn();
    return;
  }
  if (!state.loaded && state.resumeHandle) {
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = '前回のファイルを開く: ' + state.resumeHandle.name;
    btn.addEventListener('click', () => openFromHandle(state.resumeHandle, false));
    box.appendChild(btn);
  }
  const openBtn = document.createElement('button');
  if (!state.loaded && !state.resumeHandle) openBtn.className = 'primary';
  openBtn.textContent = state.loaded || state.resumeHandle ? '別のファイルを開く' : 'tasks.md を開く';
  openBtn.addEventListener('click', openViaPicker);
  box.appendChild(openBtn);
  appendDemoBtn();
}

