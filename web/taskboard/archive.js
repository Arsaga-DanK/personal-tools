'use strict';
/* web/taskboard/archive.js — 完了アーカイブ（対象の判定・archive.md への追記・tasks.md からの除去）
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- 完了アーカイブ ---------- */

// 対象は親子グループ単位: 深さ0の部分木がすべて完了し、かつ現在の表示に出ているもの
// （ソート・絞り込みと同じグループ単位の考え方。未完了の子を持つ親は文脈ごと残す）
function subtreeFinished(t) { return t.finished && t.children.every(subtreeFinished); }
function collectArchivable() {
  if (!state.loaded || !state.doc) return [];
  const inView = new Set(state.visibleRows.map(t => t.line));
  return state.doc.tasks.filter(t =>
    t.parentLine === null && subtreeFinished(t) && inView.has(t.line));
}
// アーカイブ対象の行番号。**メモ行も含める**（含めないと tasks.md にメモが孤児として残る）
function subtreeLines(t, out) {
  out.push(t.line);
  for (let k = 0; k < t.memo.length; k++) out.push(t.line + 1 + k);
  for (const c of t.children) subtreeLines(c, out);
  return out;
}

// 件数は「タスク数」で数える（メモ行を数えると利用者の感覚と合わない。移動する行数は
// 成功バナーの「N行を移動」で示す）
function subtreeTaskCount(t) {
  return 1 + t.children.reduce((n, c) => n + subtreeTaskCount(c), 0);
}
function archivableTaskCount() {
  return collectArchivable().reduce((n, t) => n + subtreeTaskCount(t), 0);
}
// 中止（[-]）もアーカイブ対象なので、**確認に内訳を出す**。
// 「完了したものを片付けたつもりが中止も一緒に動いた」を防ぐ（AR-1/AR-3 と同じ考え方）
function subtreeCancelledCount(t) {
  return (t.status === ST_CANCELLED ? 1 : 0) +
    t.children.reduce((n, c) => n + subtreeCancelledCount(c), 0);
}
function archivableCancelledCount() {
  return collectArchivable().reduce((n, t) => n + subtreeCancelledCount(t), 0);
}

function updateArchiveButton() {
  const btn = el('btn-archive');
  const usable = state.loaded && !state.demo && !state.hasCRFile &&
    state.adapter && state.adapter.mode !== 'fallback';
  const n = usable ? archivableTaskCount() : 0;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? '完了をアーカイブ（' + n + '）' : '完了をアーカイブ';
  btn.title = n > 0
    ? '表示中の完了グループを archive.md へ移動して tasks.md から除去'
    : '対象なし — 完了・中止の行は「終了を含む」を ON にすると表示されます（子がすべて終わったグループが対象）';
}

// archive.md のアダプタを用意（メモリセッションはメモリ、FSA はハンドル永続化＋初回ピッカー）
async function getArchiveAdapter() {
  if (state.adapter && state.adapter.mode === 'memory') {
    if (!state.archiveAdapter) state.archiveAdapter = makeMemoryAdapter('');
    return state.archiveAdapter;
  }
  if (!state.adapter || state.adapter.mode !== 'fsa') return null;
  let handle = state.archiveHandle;
  if (!handle) { try { handle = await handles.get(IDB_KEY_ARCH); } catch (_) {} }
  if (handle && handle.kind === 'file' && await verifyPermission(handle)) {
    state.archiveHandle = handle;
    return makeFsaAdapter(handle);
  }
  try {
    // startIn に tasks.md のハンドルを渡すと Chrome は同じディレクトリでピッカーを開く。
    // FileSystemFileHandle から親ディレクトリは取得できない（getParent が無い）ため、
    // 「別の場所に保存された」ことは検出できない。ここで取り違えを予防するのが唯一の手段（AR-1）
    handle = await window.showSaveFilePicker({
      suggestedName: 'archive.md',
      startIn: state.adapter.handle || undefined,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
    });
  } catch (e) {
    if (e && e.name === 'AbortError') return null; // キャンセル
    throw e;
  }
  if (!(await verifyPermission(handle))) return null;
  state.archiveHandle = handle;
  handles.set(IDB_KEY_ARCH, handle).catch(() => {});
  // 保存場所は表示できないので、せめて選ばれたファイル名を知らせる（AR-1）
  showBanner('info', 'アーカイブ先: ' + handle.name +
    '（保存場所はブラウザの制約により表示できません。tasks.md と同じフォルダか確認してください）');
  return makeFsaAdapter(handle);
}

// アーカイブ先の表示名。メモリセッション（テスト）では 'archive.md' を名乗る
function archiveTargetName() {
  return (state.archiveHandle && state.archiveHandle.name) || 'archive.md';
}

// 順序は archive 追記 → tasks 除去保存（失敗しても行が消えない方向に倒す）
/* archive.md へ**案件（セクション）の見出しの下**に入れる（TB-Q63）。既存の行は1バイトも変えず挿入だけ。
   groups = [{ section, lines }]（tasks.md の出現順）。見出しがあればその節の末尾（次の # / ## の前・節末の空行の前）、
   無ければ末尾に「## セクション」を作る。セクションの無いタスクは従来どおり末尾へ */
function archiveMerge(text, groups) {
  let out = text === '' ? '# archive\n' : text;
  if (!out.endsWith('\n')) out += '\n';
  const lines = out.split('\n');
  lines.pop();                                         // 末尾の改行ぶん（最後に戻す）
  for (const g of groups) {
    if (!g.lines.length) continue;
    if (!g.section) { lines.push(...g.lines); continue; }
    const at = lines.findIndex(l => l.replace(/\s+$/, '') === '## ' + g.section);
    if (at >= 0) {
      let end = lines.length;
      for (let k = at + 1; k < lines.length; k++) if (/^#{1,2}\s/.test(lines[k])) { end = k; break; }
      let ins = end;
      while (ins > at + 1 && lines[ins - 1].trim() === '') ins--;
      // 見出しの直後に入るときは空行を1つ挟む（見出しと本文の間の空行を保つ）
      lines.splice(ins, 0, ...(ins === at + 1 ? [''].concat(g.lines) : g.lines));
    } else {
      if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
      lines.push('## ' + g.section, '', ...g.lines);
    }
  }
  return lines.join('\n') + '\n';
}

async function doArchive() {
  if (!state.loaded || !state.adapter) return { ok: false, reason: 'notloaded' };
  if (state.demo) { showBanner('info', 'デモ中はアーカイブできません'); return { ok: false, reason: 'demo' }; }
  if (state.adapter.mode === 'fallback') {
    showBanner('warn', 'このブラウザではアーカイブできません（ファイルへの直接保存が必要です）');
    return { ok: false, reason: 'fallback' };
  }
  if (isDirty()) {
    showBanner('warn', '未保存の変更があります。先に保存してからアーカイブしてください');
    return { ok: false, reason: 'dirty' };
  }
  const roots = collectArchivable();
  if (roots.length === 0) {
    showBanner('info', 'アーカイブ対象の行が表示されていません（「終了を含む」を ON にして確認してください）');
    return { ok: false, reason: 'empty' };
  }
  const lineNos = roots.flatMap(t => subtreeLines(t, [])).sort((a, b) => a - b);
  // tasks.md 側は保存と同じ外部変更チェック（NFC 比較・黙って上書きしない）
  let disk;
  try {
    disk = await state.adapter.read();
  } catch (e) {
    showBanner('error', 'アーカイブ前の再読込に失敗しました: ' + (e && e.name));
    return { ok: false, reason: 'readfail' };
  }
  if (nfc(disk) !== nfc(state.snapshot)) {
    showBanner('warn', 'Obsidian側で変更されています。上書きを避けるためアーカイブを中止しました。再読込してから実行してください。',
      [{ label: '再読込', onClick: () => reloadFromAdapter(true) }]);
    return { ok: false, reason: 'conflict' };
  }
  let arch;
  try {
    arch = await getArchiveAdapter();
  } catch (e) {
    showBanner('error', 'archive.md を開けませんでした: ' + (e && e.name));
    return { ok: false, reason: 'archopen' };
  }
  if (!arch) return { ok: false, reason: 'archcancel' };
  // ファイルをまたぐ不可逆な移動なので件数によらず必ず確認する。保存場所は表示できないため
  // 少なくとも「どのファイルへ」を示す（AR-1 / AR-3）
  // 対象は「画面に出ているもの」なので、検索で絞り込み中はそれを隠さない
  // （8/3 のアーカイブ事故と同じ型を防ぐ）
  const filterNote = String(state.ui.q || '').trim() !== '' ? '（検索で絞り込み中）' : '';
  const cancelled = archivableCancelledCount();
  const breakdown = cancelled ? '（うち中止 ' + cancelled + '件）' : '';
  if (!confirm(archivableTaskCount() + '件' + breakdown + 'を ' + archiveTargetName() + ' へ移動します。' +
      filterNote + 'よろしいですか？')) {
    showBanner('info', 'アーカイブを中止しました');
    return { ok: false, reason: 'cancel' };
  }
  // 書き込み直前に読み直して末尾へ追記（外部編集を消さない）。無ければヘッダを付与して新規作成
  let archText = '';
  try { archText = await arch.read(); } catch (_) { archText = ''; }
  // 案件（セクション）ごとにまとめて、その見出しの下へ（TB-Q63）
  const groups = [];
  for (const t of roots.slice().sort((a, b) => a.line - b.line)) {
    const sec = t.section || '';
    let g = groups.find(x => x.section === sec);
    if (!g) { g = { section: sec, lines: [] }; groups.push(g); }
    for (const n of subtreeLines(t, []).sort((a, b) => a - b)) g.lines.push(state.lines[n - 1].raw);
  }
  const out = archiveMerge(archText, groups);
  try {
    await arch.write(out);
  } catch (e) {
    showBanner('error', 'archive.md への書き込みに失敗しました: ' + (e && e.name));
    return { ok: false, reason: 'archwrite' };
  }
  for (let i = lineNos.length - 1; i >= 0; i--) state.lines.splice(lineNos[i] - 1, 1);
  state.lastUndo = null;   // アーカイブは archive.md にも書くので Cmd+Z では戻さない（TB-Q71）
  const text = joinLines(state.lines);
  try {
    await state.adapter.write(text);
  } catch (e) {
    state.lines = toLines(state.snapshot); // 除去を取り消して読込時状態へ戻す
    render();
    showBanner('error', 'archive.md へは追記済みですが tasks.md の保存に失敗しました（行は残っています。再実行すると archive.md 側が重複します）: ' + (e && e.name));
    return { ok: false, reason: 'writefail' };
  }
  state.snapshot = text;
  for (const l of state.lines) l.orig = l.raw;
  render();
  showBanner('success', 'アーカイブしました（' + lineNos.length + '行を ' + arch.name + ' へ移動）');
  return { ok: true, moved: lineNos.length };
}

const PRI_LABEL = { highest: '高', high: '高', medium: '中', low: '低', lowest: '低' };

