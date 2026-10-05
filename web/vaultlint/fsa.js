'use strict';
/* web/vaultlint/fsa.js — vault の走査（FSA・読み取り専用）・修復の実行・設定（lib/config.js）
   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: engine.js・fix.js・ui.js・lib/config.js・lib/storage.js。読み込み時に実行する文はボタンの配線だけ（同じファイルと前のファイルの関数を渡す）
   2026-10-05 に vaultlint.html から節ごとに分けた（段6 — 1,000 行を超えるため。coding-rules「ファイルの分割」） */
/* ========== FSA 走査（Chrome 系限定・読み取り専用） ========== */

let dirHandle = null;

async function scanVault(handle) {
  const files = [];
  let excluded = 0;
  const ex = excludeDirSet();   // 走査開始時に固定（途中で設定が変わっても1回の走査は一貫させる）
  async function walk(h, prefix) {
    for await (const entry of h.values()) {
      if (entry.kind === 'directory') {
        if (ex.has(entry.name)) { excluded++; continue; }   // 読み込み自体しない
        await walk(entry, prefix + entry.name + '/');
      } else {
        const path = prefix + entry.name;
        if (/\.md$/i.test(entry.name)) {
          const file = await entry.getFile();
          files.push({ path, text: await file.text() });
        } else {
          files.push({ path });
        }
        if (files.length > MAX_FILES) return;   // lint 側のガードで理由を表示する
      }
    }
  }
  await walk(handle, '');
  return { files, excluded };
}

async function runScan() {
  showBanner('info', 'スキャン中…');
  try {
    const { files, excluded } = await scanVault(dirHandle);
    showBanner('info', '');
    render(lint(files, todayStr()), excluded, files);
    currentAdapter = fsaAdapter(dirHandle);
    // 二段階権限（最小権限）: 検査は read のまま、修復の実行時に初めて readwrite を要求する
    requestWrite = async () =>
      (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted';
    rescanFn = runScan;
    el('rescan').hidden = false;
  } catch (e) {
    showBanner('error', 'スキャンに失敗しました: ' + (e && e.message ? e.message : String(e)));
  }
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- 修復の実行（掟②: 提案 → 承認 → 実行） ---------- */

let currentAdapter = null;   // FSA / テスト用メモリ
let requestWrite = null;     // 実行直前の権限昇格（FSA のみ）
let rescanFn = null;

async function getDirByPath(root, path, opts) {
  const parts = path.split('/');
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], opts);
  return { dir, name: parts[parts.length - 1] };
}

function fsaAdapter(root) {
  return {
    read: async p => {
      try {
        const { dir, name } = await getDirByPath(root, p);
        const fh = await dir.getFileHandle(name);
        return await (await fh.getFile()).text();
      } catch (_) { return null; }
    },
    write: async (p, text) => {
      const { dir, name } = await getDirByPath(root, p, { create: true });
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    },
    // 移動は「コピー → サイズ検証 → 元を削除」の順（バイナリ安全・失敗時に元が残る）
    move: async (from, to) => {
      const src = await getDirByPath(root, from);
      const srcFh = await src.dir.getFileHandle(src.name);
      const file = await srcFh.getFile();
      const dst = await getDirByPath(root, to, { create: true });
      const dstFh = await dst.dir.getFileHandle(dst.name, { create: true });
      const w = await dstFh.createWritable();
      await w.write(file);
      await w.close();
      const back = await dstFh.getFile();
      if (back.size !== file.size) throw new Error('コピー検証に失敗しました');
      await src.dir.removeEntry(src.name);
    },
  };
}

function memoryAdapter(disk) {
  return {
    read: async p => (disk.has(p) ? disk.get(p) : null),
    write: async (p, t) => { disk.set(p, t); },
    move: async (from, to) => {
      if (!disk.has(from)) throw new Error('見つかりません: ' + from);
      if (disk.has(to)) throw new Error('移動先に同名があります: ' + to);
      disk.set(to, disk.get(from));
      disk.delete(from);
    },
  };
}

function buildRunLogMd(plan, results) {
  const out = ['# vault-lint 実行ログ', '',
    '書き換え ' + results.written.length + '・移動 ' + results.moved.length +
    '・スキップ ' + results.skipped.length, ''];
  for (const mv of results.moved) out.push('- 移動: ' + mv.from + ' → ' + mv.to);
  for (const s of results.skipped) out.push('- スキップ: ' + (s.path || '') + ' — ' + s.reason);
  out.push('');
  // 変更前の内容を残す（git コミットが唯一の undo — 手元の復元素材として）
  for (const w of plan.writes) {
    if (!results.written.includes(w.path)) continue;
    out.push('## 変更前: ' + w.path, '', '```', w.before, '```', '');
  }
  return out.join('\n');
}

function renderRunLog(plan, results) {
  const host = el('runlog');
  host.textContent = '';
  host.hidden = false;
  const h = document.createElement('h2');
  h.textContent = '実行結果 — 書き換え ' + results.written.length + '・移動 ' +
    results.moved.length + '・スキップ ' + results.skipped.length;
  host.appendChild(h);
  const ul = document.createElement('ul');
  const li = t => {
    const e = document.createElement('li');
    e.textContent = t;
    ul.appendChild(e);
  };
  for (const p of results.written) li('書き換え: ' + p);
  for (const mv of results.moved) li('移動: ' + mv.from + ' → ' + mv.to);
  for (const s of results.skipped) li('スキップ: ' + (s.path || '') + ' — ' + s.reason);
  host.appendChild(ul);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'ログをコピー（変更前の内容つき）';
  const md = buildRunLogMd(plan, results);
  copy.addEventListener('click', () => {
    ToolUI.copy(md).then(ok => { if (ok) ToolUI.feedback(copy, '✓ コピーしました'); });
  });
  host.appendChild(copy);
}

async function executeFixes() {
  if (!lastScan || !currentAdapter) return;
  if (!el('commit-confirm').checked) {
    showBanner('warn', '実行前に obsidian-git でコミットし、「コミット済み」にチェックを入れてください（取り消し手段は git だけです）');
    return;
  }
  const selections = fixControls.map(c => c.get()).filter(Boolean);
  if (!selections.length) { showBanner('info', '修復が選択されていません（各行の「修復」列で選べます）'); return; }
  const plan = planFixes(lastScan.files, selections);
  const targets = plan.writes.map(w => '書き換え: ' + w.path)
    .concat(plan.moves.map(mv => '移動: ' + mv.from + ' → ' + mv.to));
  const ok = window.confirm('次の変更を実行します（書き換え ' + plan.writes.length + '・移動 ' +
    plan.moves.length + '・スキップ予定 ' + plan.skipped.length + '）:\n\n' +
    targets.slice(0, 20).join('\n') + (targets.length > 20 ? '\n…ほか ' + (targets.length - 20) + '件' : '') +
    '\n\n取り消しは git のみです。実行しますか？');
  if (!ok) return;
  if (requestWrite && !(await requestWrite())) {
    showBanner('error', '書き込み権限が得られませんでした');
    return;
  }
  showBanner('info', '実行中…');
  const results = await applyFixes(lastScan.files, plan, currentAdapter);
  renderRunLog(plan, results);
  showBanner('info', '');
  if (rescanFn) await rescanFn();
}

el('pick').addEventListener('click', async () => {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (_) {
    return;   // キャンセル（AbortError）は無言でよい
  }
  await runScan();
});
el('rescan').addEventListener('click', () => { if (dirHandle) runScan(); });

el('copy-btn').addEventListener('click', () => {
  if (lastReport === '') { showBanner('info', 'コピーする内容がありません'); return; }
  ToolUI.copy(lastReport).then(ok => {
    if (ok) ToolUI.feedback(el('copy-btn'), '✓ コピーしました');
    else showBanner('info', 'コピーできませんでした');
  });
});
el('fix-btn').addEventListener('click', executeFixes);

/* ---------- 設定（lib/config.js。vault のフォルダ構成は利用者ごとに違う） ---------- */

// 設定を反映する唯一の経路（UI・起動時・テストが同じここを通る）
function applyConfig(cfg) {
  CFG = { privateDirs: cfg.privateDirs, inboxDir: cfg.inboxDir, archiveDir: cfg.archiveDir,
    issueDir: cfg.issueDir || '', closedDir: cfg.closedDir || '' };
  el('cfg-private').value = (CFG.privateDirs || []).join(', ');
  el('cfg-inbox').value = CFG.inboxDir;
  el('cfg-archive').value = CFG.archiveDir;
  el('cfg-issue').value = CFG.issueDir;
  el('cfg-closed').value = CFG.closedDir;
  updatePickState();
}

/* 非公開フォルダが**未設定**のうちはフォルダ選択をさせない（旧「91_Private をコードで強制除外」
   の一般化）。「除外なし」でよければ空欄のまま［設定を保存］を押せば決定済みになる —
   未設定（null）と除外なし（[]）を区別しているのはこの分岐のため。 */
function updatePickState() {
  const noApi = !window.showDirectoryPicker;   // Safari / Firefox
  const unset = CFG.privateDirs === null;
  el('pick').disabled = noApi || unset;
  const msg = noApi
    ? 'このブラウザは対応していません（showDirectoryPicker が必要 — Chrome 系で開いてください）'
    : (unset ? '先に ⋯ の中の「非公開フォルダ」を決めて［設定を保存］を押してください（除外なしでよければ空欄のまま保存）' : '');
  el('env-note').textContent = msg;
  el('env-note').hidden = msg === '';
}

el('cfg-save').addEventListener('click', () => {
  ToolConfig.set({
    privateDirs: el('cfg-private').value,   // 空欄 → [] （＝「除外なし」と決めた状態）
    inboxDir: el('cfg-inbox').value,
    archiveDir: el('cfg-archive').value,
    issueDir: el('cfg-issue').value,
    closedDir: el('cfg-closed').value,
  });
  applyConfig(ToolConfig.all());
  el('vl-more').open = false;   // 保存したら閉じる（結果を隠さない — 段6・VL-L1）
  showBanner('success', '設定を保存しました');
});
