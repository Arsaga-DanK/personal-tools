'use strict';
/* web/taskboard/archive-view.js — 「アーカイブ」の表示（2026-10-06・TB-AV1〜AV4・TB-Q75）
   入口: web/taskboard.html（このファイルは単独では動かない）。前提: archive.js（getArchiveFolder・readAllArchives）・engine.js（parseDoc・toLines・nfc）・
   lib/edit.js（ToolEdit.fillDate）・list.js（render）。読み込み時に実行する文は無い（宣言だけ）。
   読むだけ。案件ごと・済んだ日・メモを開いた状態で並べ、検索欄が効く（本文とメモ） */

// フォルダを読んで覚える（描き直しは render から — 検索のたびに読み直さない）。
// interactive = ボタンを押したとき（権限の確認・ピッカーを出してよい）。repick = 選び直す。
// 新しい読み込みが前のものに勝つ（state.archiveLoad）。以前は「読み込み中なら何もしない」で、ボタンを押すと
// 先に render が始めた裏の読み込みに負けて何も起きなかった（TB-AV5・最終レビュー #2）。アーカイブ・別のファイルの読み込みも
// state.archiveLoad を null にするので、途中の古い結果は捨てる
async function loadArchiveView(interactive, repick) {
  const token = {};
  state.archiveLoad = token;
  let cache = { folder: null, files: [] };
  try {
    let folder = null;
    try { folder = await getArchiveFolder(interactive, repick); } catch (_) { /* 開けなければ下の案内 */ }
    if (!folder && repick) { try { folder = await getArchiveFolder(false, false); } catch (_) {} }   // 選び直しをやめたら前のフォルダのまま
    if (folder) cache = { folder: folder.name, files: await readAllArchives(folder) };
  } catch (_) { /* 読めなければ空の案内 */ }
  if (state.archiveLoad !== token) return;
  state.archiveLoad = null;
  state.archiveCache = cache;
  if (state.ui.view === 'archive') render();
}

function renderArchiveView() {
  const host = el('archive-view');
  host.textContent = '';
  if (!state.archiveCache) {
    const p = document.createElement('p');
    p.className = 'av-empty';
    p.textContent = '読み込み中…';
    host.appendChild(p);
    if (!state.archiveLoad) loadArchiveView(false, false);   // 読み込み中なら待つ（検索のたびに読み直さない）
    return;
  }
  const c = state.archiveCache;
  const head = document.createElement('div');
  head.className = 'av-head';
  const where = document.createElement('span');
  where.className = 'av-where';
  where.textContent = c.folder === null ? 'アーカイブのフォルダを開いていません'
    : (c.folder ? c.folder + ' — ' : '') + (c.files.length ? c.files.map(f => f.path).join('・') : 'archive/（まだありません）');
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.id = 'av-repick';
  pick.textContent = c.folder === null ? 'アーカイブのフォルダを開く' : 'フォルダを選び直す';
  pick.title = 'tasks.md のあるフォルダ（03_Tasks など）を選びます。アーカイブはその中の archive/年-月.md に入ります';
  // 押したときの読み込みを先に始めてから描く（render が裏の読み込みを始めないように — TB-AV5）
  pick.addEventListener('click', () => { const re = c.folder !== null; state.archiveCache = null; loadArchiveView(true, re); render(); });
  head.append(where, pick);
  host.appendChild(head);
  const q = nfc(String(state.ui.q || '')).trim().toLowerCase();
  const hit = (t) => nfc([t.displayBody].concat(t.memo).join('\n')).toLowerCase().includes(q) || t.children.some(hit);
  let hits = 0;
  for (const f of c.files) {
    const roots = parseDoc(toLines(f.text)).tasks.filter(t => t.parentLine === null && (q === '' || hit(t)));
    if (!roots.length) continue;
    hits += roots.length;
    const sec = document.createElement('section');
    sec.className = 'av-file';
    sec.dataset.path = f.path;
    const h3 = document.createElement('h3');
    h3.textContent = f.path + '（' + roots.length + '件）';
    sec.appendChild(h3);
    let cur = null;
    for (const t of roots) {
      if (t.section !== cur) {
        cur = t.section;
        const h4 = document.createElement('h4');
        h4.className = 'av-sec';
        h4.textContent = cur || '（案件なし）';
        sec.appendChild(h4);
      }
      archiveTaskRow(sec, t, 0);
    }
    host.appendChild(sec);
  }
  el('q-count').textContent = q === '' ? '' : hits + ' 件ヒット';
  if (!hits) {
    const p = document.createElement('p');
    p.className = 'av-empty';
    p.textContent = q === '' ? 'まだアーカイブはありません' : '一致するアーカイブはありません（検索: ' + state.ui.q.trim() + '）';
    host.appendChild(p);
  }
}

// 1件（メモは開いた状態・子は字下げ）
function archiveTaskRow(host, t, depth) {
  const row = document.createElement('div');
  row.className = 'av-task' + (depth ? ' av-child' : '');
  row.style.paddingLeft = (depth * 1.4) + 'em';
  const mark = document.createElement('span');
  mark.className = 'av-mark';
  mark.textContent = t.status === ST_CANCELLED ? '－' : '☑';
  const body = document.createElement('span');
  body.className = 'av-body';
  body.textContent = t.displayBody;
  row.append(mark, body);
  if (t.doneDate) {
    const d = document.createElement('span');
    d.className = 'av-date';
    ToolEdit.fillDate(d, t.doneDate, todayStr());
    row.appendChild(d);
  }
  host.appendChild(row);
  for (const m of t.memo) {
    const p = document.createElement('div');
    p.className = 'av-memo';
    p.style.paddingLeft = (depth * 1.4 + 1.6) + 'em';
    p.textContent = m;
    host.appendChild(p);
  }
  for (const k of t.children) archiveTaskRow(host, k, depth + 1);
}
