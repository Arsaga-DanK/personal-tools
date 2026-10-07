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
  const self = !!(state.adapter && isArchiveFileName(state.adapter.name));   // アーカイブのファイルを開いている（TB-AF8）
  const usable = state.loaded && !state.demo && !state.hasCRFile &&
    state.adapter && state.adapter.mode !== 'fallback' && !self;
  const n = usable ? archivableTaskCount() : 0;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? '完了をアーカイブ（' + n + '）' : '完了をアーカイブ';
  btn.title = self ? 'アーカイブのファイル（' + state.adapter.name + '）を開いているのでアーカイブできません（同じファイルへ書いて消してしまうため）'
    : n > 0
    ? '表示中の完了グループを archive/年-月.md（tasks.md と同じフォルダ）へ移動して tasks.md から除去'
    : '対象なし — 完了・中止の行は「終了を含む」を ON にすると表示されます（子がすべて終わったグループが対象）';
}

/* ---------- アーカイブ先（2026-10-06・TB-AF・TB-Q75） ----------
   tasks.md と同じフォルダ（03_Tasks）を一度だけ選んでもらい、その中の archive/YYYY-MM.md（アーカイブした月）へ追記する。
   以前は「最初に選んだファイル」のハンドルを覚えていたが、場所が見えず、2026-09-24 の分は vault の外のどこかへ書かれて見つからなかった
   （AR-1 の案4・TB-Q10 をここで実装した） */
const ARCHIVE_DIR = 'archive';
function archiveMonthPath(today) { return ARCHIVE_DIR + '/' + String(today).slice(0, 7) + '.md'; }
// archive.md か 月のファイル（YYYY-MM.md）か — Plan Tasks で開いても関連ノートの写しを書かない（TB-LN7）
function isArchiveFileName(name) {
  const b = String(name || '').split('/').pop();
  return /^archive\.md$/i.test(b) || /^\d{4}-\d{2}\.md$/.test(b);
}
function archiveNotFound() { const e = new Error('not found'); e.name = 'NotFoundError'; return e; }
const isArchivePath = (p) => p === 'archive.md' || (p.startsWith(ARCHIVE_DIR + '/') && /\.md$/i.test(p));

// メモリのフォルダ（テストとメモリのセッション）。パス → 本文
function makeMemoryFolder(name) {
  const files = new Map();
  return {
    name: name || '',
    async readFile(path) { if (!files.has(path)) throw archiveNotFound(); return files.get(path); },
    async writeFile(path, text) { files.set(path, text); },
    async listFiles() { return [...files.keys()].filter(isArchivePath); },
    _files: files,
  };
}
// FSA のフォルダ（03_Tasks）。archive/ は書くときに無ければ作る
function makeFsaFolder(dir) {
  const fileOf = async (path, create) => {
    const parts = path.split('/');
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
    return d.getFileHandle(parts[parts.length - 1], { create });
  };
  return {
    name: dir.name,
    async readFile(path) { return (await (await fileOf(path, false)).getFile()).text(); },
    async writeFile(path, text) { const w = await (await fileOf(path, true)).createWritable(); await w.write(text); await w.close(); },
    async listFiles() {
      const out = [];
      try { await dir.getFileHandle('archive.md'); out.push('archive.md'); } catch (_) { /* 無ければ出さない */ }
      try {
        const sub = await dir.getDirectoryHandle(ARCHIVE_DIR);
        for await (const [n, h] of sub.entries()) if (h.kind === 'file' && /\.md$/i.test(n)) out.push(ARCHIVE_DIR + '/' + n);
      } catch (_) { /* まだ archive/ が無い */ }
      return out;
    },
  };
}
// 選んだフォルダが「開いている tasks.md のあるフォルダ」か（同じファイルか — isSameEntry。無い環境は中身を比べる — TB-AF4）
async function isTasksFolder(dir, tasksHandle, tasksName, snapshot) {
  let fh;
  try { fh = await dir.getFileHandle(tasksName); } catch (_) { return false; }
  if (tasksHandle && typeof fh.isSameEntry === 'function') {
    try { return await fh.isSameEntry(tasksHandle); } catch (_) { /* 比べられなければ中身で */ }
  }
  try { return nfc(await (await fh.getFile()).text()) === nfc(snapshot); } catch (_) { return false; }
}
// アーカイブ先のフォルダ。interactive のときだけ権限を求め・初回はフォルダを選ばせる（repick で選び直す）
async function getArchiveFolder(interactive, repick) {
  if (state.adapter && state.adapter.mode === 'memory') {
    if (!state.archiveFolder) state.archiveFolder = makeMemoryFolder('');
    return state.archiveFolder;
  }
  if (!state.adapter || state.adapter.mode !== 'fsa') return null;
  let dir = repick ? null : state.archiveDirHandle;
  if (!dir && !repick) { try { dir = await handles.get(IDB_KEY_ARCH_DIR); } catch (_) {} }
  if (dir && dir.kind === 'directory') {
    let ok = false;
    try { ok = interactive ? await verifyPermission(dir) : (await dir.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (_) {}
    // 覚えていたフォルダも、いま開いている tasks.md のフォルダかを毎回確かめる（別のファイルを開いた・再起動後に IndexedDB から戻った — TB-AF9）
    if (ok && await isTasksFolder(dir, state.adapter.handle, state.adapter.name, state.snapshot)) {
      state.archiveDirHandle = dir;
      return (state.archiveFolder = makeFsaFolder(dir));
    }
    if (ok) { state.archiveDirHandle = null; state.archiveFolder = null; }   // 違うフォルダ — 使わない（IndexedDB には残す。元の tasks.md を開けばまた使える）
  }
  if (!interactive) return null;
  showBanner('info', 'アーカイブを置くフォルダとして、' + state.adapter.name + ' のあるフォルダ（03_Tasks など）を選んでください。'
    + 'アーカイブはその中の archive/年-月.md に入ります');
  try {
    // startIn に tasks.md のハンドルを渡すと、そのファイルのあるフォルダでピッカーが開く
    dir = await window.showDirectoryPicker({ mode: 'readwrite', startIn: state.adapter.handle || undefined });
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
    throw e;
  }
  if (!(await isTasksFolder(dir, state.adapter.handle, state.adapter.name, state.snapshot))) {
    showBanner('error', '選んだフォルダ（' + dir.name + '）に、開いている ' + state.adapter.name + ' がありません。'
      + state.adapter.name + ' と同じフォルダを選んでください');
    return null;
  }
  state.archiveDirHandle = dir;
  handles.set(IDB_KEY_ARCH_DIR, dir).catch(() => {});
  return (state.archiveFolder = makeFsaFolder(dir));
}
// 書く先の表示名: 'archive/2026-08.md'（FSA はフォルダ名を付けて '03_Tasks/archive/2026-10.md'）
function archiveTargetName() {
  const n = state.archiveFolder && state.archiveFolder.name;
  return (n ? n + '/' : '') + archiveMonthPath(todayStr());
}
// アーカイブのファイルを全部読む（月のファイルは新しい順・最後に archive.md）— 表示と関連ノートの写し
async function readAllArchives(folder) {
  const paths = (await folder.listFiles())
    .sort((a, b) => (a === 'archive.md') - (b === 'archive.md') || (a < b ? 1 : a > b ? -1 : 0));
  const out = [];
  for (const p of paths) { try { out.push({ path: p, text: await folder.readFile(p) }); } catch (_) { /* 読めないものは飛ばす */ } }
  return out;
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

// アーカイブの間は外の変更の再読込（focus の checkExternal・再読込ボタン）を止める。
// 途中で読み直されると、最初に数えた行番号で新しい行を消してしまう（関係ない行が消えた — TB-AF7・最終レビュー #4）
async function doArchive() {
  if (state.archiving) return { ok: false, reason: 'busy' };
  state.archiving = true;
  try { return await archiveRun(); } finally { state.archiving = false; }
}

async function archiveRun() {
  if (!state.loaded || !state.adapter) return { ok: false, reason: 'notloaded' };
  if (state.demo) { showBanner('info', 'デモ中はアーカイブできません'); return { ok: false, reason: 'demo' }; }
  if (state.adapter.mode === 'fallback') {
    showBanner('warn', 'このブラウザではアーカイブできません（ファイルへの直接保存が必要です）');
    return { ok: false, reason: 'fallback' };
  }
  // アーカイブのファイルを開いているときはしない — 同じファイルへ書いて、そのあと tasks の行として全部消していた（TB-AF8・最終レビュー #1）
  if (isArchiveFileName(state.adapter.name)) {
    showBanner('warn', 'アーカイブのファイル（' + state.adapter.name + '）を開いているので、アーカイブしません（同じファイルへ書いて、そのあと消してしまうため）');
    return { ok: false, reason: 'archself' };
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
  const startText = joinLines(state.lines);   // 行番号はこの中身で数えた（消す直前にまだ同じかを見る — TB-AF7）
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
  let folder;
  try {
    folder = await getArchiveFolder(true, false);
  } catch (e) {
    showBanner('error', 'アーカイブのフォルダを開けませんでした: ' + (e && e.name));
    return { ok: false, reason: 'archopen' };
  }
  if (!folder) return { ok: false, reason: 'archcancel' };
  const path = archiveMonthPath(todayStr());
  // ファイルをまたぐ不可逆な移動なので件数によらず必ず確認する。どのファイルへ入るかを示す（AR-1 / AR-3）
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
  // 書き込み直前に読み直して追記（外部編集を消さない）。無ければヘッダを付与して新規作成
  let archText = '';
  try { archText = await folder.readFile(path); }
  catch (e) {
    // 読めないのに空とみなして書くと、それまでの分が全部消える（2026-10-06・TB-A8 — 以前はここで '' にしていた）。
    // まだ無いファイル（NotFoundError）だけは新しく作る（TB-A9）。それ以外は何も書かずに止める（tasks の行も消さない）
    if (!(e && e.name === 'NotFoundError')) {
      showBanner('error', archiveTargetName() + ' を読めなかったので、アーカイブを中止しました（前の分を上書きして消さないため）。'
        + 'Obsidian で ' + archiveTargetName() + ' が開けるか確かめてから、もう一度押してください: ' + (e && e.name));
      return { ok: false, reason: 'archread' };
    }
  }
  // 確認ダイアログ・フォルダ選びの間に Obsidian で tasks.md を直していたら、何も書かずに止める（TB-AF6）
  let disk2;
  try { disk2 = await state.adapter.read(); }
  catch (e) {
    showBanner('error', 'アーカイブ前の再読込に失敗しました（何も書いていません）: ' + (e && e.name));
    return { ok: false, reason: 'readfail' };
  }
  if (nfc(disk2) !== nfc(startText)) {
    showBanner('warn', 'Obsidian側で変更されています。上書きを避けるためアーカイブを中止しました（何も書いていません）。再読込してから実行してください。',
      [{ label: '再読込', onClick: () => reloadFromAdapter(true) }]);
    return { ok: false, reason: 'conflict' };
  }
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
    await folder.writeFile(path, out);
  } catch (e) {
    showBanner('error', archiveTargetName() + ' への書き込みに失敗しました（tasks.md からは消していません）: ' + (e && e.name));
    return { ok: false, reason: 'archwrite' };
  }
  // 書いたら読み直して、書いたとおりか確かめてから tasks.md の行を消す（TB-AF3 — 同期や別のアプリの書き戻しで消えないように）
  let back = null;
  try { back = await folder.readFile(path); } catch (_) { /* 下で止める */ }
  if (back === null || nfc(back) !== nfc(out)) {
    showBanner('error', archiveTargetName() + ' に書いた内容を確かめられなかったので、tasks.md からは消していません。'
      + 'Obsidian で ' + archiveTargetName() + ' を開いて中身を確かめてください');
    return { ok: false, reason: 'archverify' };
  }
  // 書いている間に tasks.md が変わっていたら（再読込・外の変更・自動保存）、tasks.md は変えない。
  // 最初に数えた行番号で消すと関係ない行を消す。同じタスクが両方に残る（重複）ほうが消えるより安全（TB-AF7）
  let disk3 = null;
  try { disk3 = await state.adapter.read(); } catch (_) { /* 下で止める */ }
  if (joinLines(state.lines) !== startText || disk3 === null || nfc(disk3) !== nfc(startText)) {
    state.archiveCache = null;
    showBanner('warn', archiveTargetName() + ' には書きましたが、そのあいだに tasks.md が変わったので tasks.md は変えていません。'
      + '同じタスクが両方にあります — tasks.md の済んだ行は、確かめてから消してください（もう一度アーカイブするとアーカイブ側が重複します）');
    return { ok: false, reason: 'conflictafter' };
  }
  for (let i = lineNos.length - 1; i >= 0; i--) state.lines.splice(lineNos[i] - 1, 1);
  state.lastUndo = null;   // アーカイブは別のファイルにも書くので Cmd+Z では戻さない（TB-Q71）
  const text = joinLines(state.lines);
  try {
    await state.adapter.write(text);
  } catch (e) {
    state.lines = toLines(state.snapshot); // 除去を取り消して読込時状態へ戻す
    render();
    showBanner('error', archiveTargetName() + ' へは追記済みですが tasks.md の保存に失敗しました（行は残っています。再実行すると '
      + archiveTargetName() + ' 側が重複します）: ' + (e && e.name));
    return { ok: false, reason: 'writefail' };
  }
  state.snapshot = text;
  for (const l of state.lines) l.orig = l.raw;
  state.archiveCache = null;   // アーカイブの表示は読み直す（TB-AV3）。読み込み中のものは古いので捨てる（archive-view.js）
  state.archiveLoad = null;
  render();
  // アーカイブの全部（archive.md と archive/*.md）を数えて写しを書き直す（済んだタスクを移した途端に閉じどきが消えないように — TB-LN6・TB-AF5）
  if (window.ToolTaskLinks) {
    const all = await readAllArchives(folder);
    state.archLinks = ToolTaskLinks.count(all.flatMap(f => parseDoc(toLines(f.text)).tasks));
    publishTaskLinks();
  }
  showBanner('success', 'アーカイブしました（' + lineNos.length + '行を ' + archiveTargetName() + ' へ移動）');
  return { ok: true, moved: lineNos.length };
}

const PRI_LABEL = { highest: '高', high: '高', medium: '中', low: '低', lowest: '低' };

