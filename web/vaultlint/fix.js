'use strict';
/* web/vaultlint/fix.js — 修復エンジン（提案 → 承認 → 実行。VL-15〜19）
   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: engine.js（CFG・basenameOf・forEachCodeFreeLine）。読み込み時に実行する文は無い（宣言だけ）
   2026-10-05 に vaultlint.html から節ごとに分けた（段6 — 1,000 行を超えるため。coding-rules「ファイルの分割」） */
/* ========== 修復エンジン（掟②「提案 → 承認 → 実行」の実装。VL-15〜19） ========== */

const REMOVE_LINE = Symbol('remove');
const LINK_ONLY_RE = /^\s*!?\[\[[^\[\]]+\]\]\s*$/;

// 行がそのリンクだけか（行削除を許すか — VL-16）
function canDeleteLine(files, path, lineNo) {
  const f = files.find(x => x.path === path);
  if (!f || typeof f.text !== 'string') return false;
  const line = f.text.split('\n')[lineNo - 1];
  return typeof line === 'string' && LINK_ONLY_RE.test(line);
}

// 選択された修復から変更計画を作る（**副作用なし** — 何をどう変えるかだけを返す）
function planFixes(files, selections) {
  const byPath = new Map(files.map(f => [f.path, f]));
  const texts = new Map();   // path -> 作業中テキスト（複数修復を同じファイルに重ねる）
  const getText = p => (texts.has(p) ? texts.get(p)
    : (byPath.has(p) && typeof byPath.get(p).text === 'string' ? byPath.get(p).text : null));
  const moves = [];
  const skipped = [];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const editLine = (path, lineNo, fn) => {
    const cur = getText(path);
    if (cur === null) { skipped.push({ path, reason: 'ファイルが見つかりません' }); return; }
    const lines = cur.split('\n');
    if (lineNo < 1 || lineNo > lines.length) {
      skipped.push({ path, reason: lineNo + '行目が見つかりません' });
      return;
    }
    const next = fn(lines[lineNo - 1]);
    if (next === null) return;   // fn 側で skipped 済み
    if (next === REMOVE_LINE) lines.splice(lineNo - 1, 1);
    else lines[lineNo - 1] = next;
    texts.set(path, lines.join('\n'));
  };

  // 行削除は行番号がずれるので最後に・大きい行番号から適用する
  const dels = selections.filter(s => s.type === 'deleteLine')
    .sort((a, b) => (a.file === b.file ? b.line - a.line : (a.file < b.file ? -1 : 1)));
  const rest = selections.filter(s => s.type !== 'deleteLine');

  for (const sel of rest) {
    if (sel.type === 'textify') {
      // [[x]]→x・[[x|別名]]→別名（内容は失わない — 既定の修復）
      editLine(sel.file, sel.line, line => line.replace(/(!?)\[\[([^\[\]]+)\]\]/g, (all, bang, inner) => {
        const pipe = inner.indexOf('|');
        const head = pipe >= 0 ? inner.slice(0, pipe) : inner;
        const t = head.split('#')[0].trim();
        if (t !== sel.target) return all;
        return pipe >= 0 ? inner.slice(pipe + 1).trim() : t;
      }));
    } else if (sel.type === 'removeAttachment') {
      // 参照トークンだけ除去（行は残す。隣接する片側の空白も1つ除去 — VL-17）
      editLine(sel.file, sel.line, line => {
        const core = '(?:!\\[\\[' + escRe(sel.target) + '\\]\\]|!\\[[^\\]]*\\]\\(' + escRe(sel.target) + '\\))';
        const next = line.replace(new RegExp(' ' + core + '|' + core + ' |' + core), '');
        return /\S/.test(next) ? next : '';
      });
    } else if (sel.type === 'rename') {
      planRename(sel, byPath, moves, skipped, getText, texts, files);
    } else if (sel.type === 'archiveDaily') {
      if (!CFG.archiveDir) {
        skipped.push({ path: sel.from, reason: 'アーカイブ先フォルダが未設定です' });
        continue;
      }
      const to = CFG.archiveDir + '/' + basenameOf(sel.from);
      if (byPath.has(to) || moves.some(mv => mv.to === to)) {
        skipped.push({ path: sel.from, reason: '移動先に同名があります: ' + to });
      } else {
        moves.push({ from: sel.from, to });
      }
    } else if (sel.type === 'archiveIssue') {
      // 閉じたイシュー（VL-Q13）: closedDir の {YYYY} を閉じた年に。フォルダは適用側が階層ごとに作る
      if (!CFG.closedDir) {
        skipped.push({ path: sel.from, reason: '閉じたイシューの移動先が未設定です' });
        continue;
      }
      const dir = closedDest(sel.closed, sel.project, dirsOf(files));
      if (!dir) {
        skipped.push({ path: sel.from, reason: '移動先が決まりません（案件フォルダが無く、ほかの候補もありません）' });
        continue;
      }
      const to = dir + '/' + basenameOf(sel.from);
      if (byPath.has(to) || moves.some(mv => mv.to === to)) {
        skipped.push({ path: sel.from, reason: '移動先に同名があります: ' + to });
      } else {
        moves.push({ from: sel.from, to });
      }
    }
  }
  for (const sel of dels) {
    editLine(sel.file, sel.line, line => {
      if (LINK_ONLY_RE.test(line)) return REMOVE_LINE;
      skipped.push({ path: sel.file, reason: sel.line + '行目にリンク以外の内容があるため削除しません' });
      return null;
    });
  }

  const writes = [];
  for (const [path, after] of texts) {
    const before = byPath.get(path).text;
    if (after !== before) writes.push({ path, before, after });
  }
  return { writes, moves, skipped,
    summary: { writes: writes.length, moves: moves.length, skipped: skipped.length } };
}

// リネーム＋リンク元の追随（フェンス内は触らない — VL-18）
function planRename(sel, byPath, moves, skipped, getText, texts, files) {
  if (byPath.has(sel.to) || moves.some(mv => mv.to === sel.to)) {
    skipped.push({ path: sel.from, reason: 'リネーム先が既に存在します: ' + sel.to });
    return;
  }
  moves.push({ from: sel.from, to: sel.to });
  const oldKey = nfcLower(basenameOf(sel.from).replace(/\.md$/i, ''));
  const newBase = basenameOf(sel.to).replace(/\.md$/i, '');
  for (const f of files) {
    if (!/\.md$/i.test(f.path) || typeof f.text !== 'string') continue;
    const lines = getText(f.path).split('\n');
    let fence = null;
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const fm = /^(```+|~~~+)/.exec(lines[i]);
      if (fm) {
        const marker = fm[1][0] === '`' ? '```' : '~~~';
        if (fence === null) fence = marker;
        else if (lines[i].startsWith(fence)) fence = null;
        continue;
      }
      if (fence !== null) continue;
      const next = lines[i].replace(/(!?)\[\[([^\[\]]+)\]\]/g, (all, bang, inner) => {
        const pipe = inner.indexOf('|');
        const head = pipe >= 0 ? inner.slice(0, pipe) : inner;
        const tail = pipe >= 0 ? inner.slice(pipe) : '';
        const hash = head.indexOf('#');
        const pathPart = (hash >= 0 ? head.slice(0, hash) : head).trim();
        const hashPart = hash >= 0 ? head.slice(hash) : '';
        const slash = pathPart.lastIndexOf('/');
        const base = slash >= 0 ? pathPart.slice(slash + 1) : pathPart;
        if (nfcLower(base.replace(/\.md$/i, '')) !== oldKey) return all;
        const prefix = slash >= 0 ? pathPart.slice(0, slash + 1) : '';
        return bang + '[[' + prefix + newBase + hashPart + tail + ']]';
      });
      if (next !== lines[i]) { lines[i] = next; changed = true; }
    }
    if (changed) texts.set(f.path, lines.join('\n'));
  }
}

// 計画をアダプタ経由で適用。**書き込み直前に再読して読み込み時点と NFC 比較**（VL-19。
// taskboard の外部変更検知と同じ考え方 — 外部で変わっていたらそのファイルはスキップして報告）
async function applyFixes(files, plan, adapter) {
  const orig = new Map(files.map(f => [f.path, typeof f.text === 'string' ? f.text : null]));
  const results = { written: [], moved: [], skipped: plan.skipped.slice() };
  for (const w of plan.writes) {
    const now = await adapter.read(w.path);
    const was = orig.get(w.path);
    if (now === null || was === null || now.normalize('NFC') !== was.normalize('NFC')) {
      results.skipped.push({ path: w.path, reason: 'スキャン後に外部で変更されています（再スキャンしてください）' });
      continue;
    }
    await adapter.write(w.path, w.after);
    results.written.push(w.path);
  }
  for (const mv of plan.moves) {
    try {
      await adapter.move(mv.from, mv.to);
      results.moved.push(mv);
    } catch (e) {
      results.skipped.push({ path: mv.from, reason: '移動に失敗しました: ' + (e && e.message ? e.message : String(e)) });
    }
  }
  return results;
}

