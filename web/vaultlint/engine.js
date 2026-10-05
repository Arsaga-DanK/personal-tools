'use strict';
/* web/vaultlint/engine.js — 純関数（lint・frontmatter・閉じたイシューの移動先）。フックと UI が同じ道を通る
   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: なし（最初に読まれる）。読み込み時に実行する文は無い（宣言だけ）
   2026-10-05 に vaultlint.html から節ごとに分けた（段6 — 1,000 行を超えるため。coding-rules「ファイルの分割」） */
/* ========== 純関数（フックと UI が同一コードパス） ========== */

const MAX_FILES = 20000;        // 性能ガード: ファイル総数
const MAX_MD_CHARS = 2000000;   // 性能ガード: 1ファイル。超過はその場で読み飛ばして警告
// 設定に関係なく常に除外する（Obsidian と Git の内部データ。読む意味が無く、壊すと危険）
const ALWAYS_EXCLUDE = new Set(['.obsidian', '.git', '.trash']);

/* 利用者ごとの設定（lib/config.js）。vault のフォルダ構成は人によって違うのでコードに持たない。
   **privateDirs === null は「未設定」**で、空配列（＝除外なしと決めた）とは区別する —
   未設定のまま走査すると非公開ノートを読み込む事故になるため、設定が済むまで
   フォルダ選択を無効化する（旧「91_Private をコードで強制除外」の一般化）。 */
let CFG = { privateDirs: null, inboxDir: '', archiveDir: '', issueDir: '', closedDir: '' };

// 読み込み自体しないディレクトリ名の集合（常時除外 ＋ 設定した非公開フォルダ）
function excludeDirSet() {
  const s = new Set(ALWAYS_EXCLUDE);
  for (const d of (CFG.privateDirs || [])) s.add(d);
  return s;
}

const nfcLower = s => s.normalize('NFC').toLowerCase();
const basenameOf = path => path.slice(path.lastIndexOf('/') + 1);

// ファイル名の罠（badNames）。不可視文字はコードポイントで組む（実文字混入を防ぐ）
function nameReasons(seg, isFile) {
  const reasons = [];
  if (isFile && /^\.md$/i.test(seg)) { reasons.push('空ベース名'); return reasons; }
  if (seg.includes('  ')) reasons.push('連続半角スペース');
  if (seg.includes('\u3000')) reasons.push('全角スペース');
  if (seg.includes('\u00A0')) reasons.push('NBSP');
  const stem = isFile ? seg.replace(/\.[^.]+$/, '') : seg;
  if (seg.startsWith(' ') || stem.endsWith(' ')) reasons.push('先頭・末尾スペース');
  return reasons;
}

// フェンス外の行だけを列挙（インラインコードは `` に潰して渡す — VL-13）。
// リンク走査・未転記タスク検出・rename の追随が同じ規則を共有する
function forEachCodeFreeLine(text, cb) {
  const lines = String(text || '').split('\n');
  let fence = null;
  for (let li = 0; li < lines.length; li++) {
    const fm = /^(```+|~~~+)/.exec(lines[li]);
    if (fm) {
      const marker = fm[1][0] === '`' ? '```' : '~~~';
      if (fence === null) fence = marker;
      else if (lines[li].startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;
    cb(lines[li].replace(/`[^`]*`/g, '``'), li);
  }
}

// 生の `- [ ]` の行数（フェンス外）。デイリーの未転記タスク検出（VL-14）
function countPendingTasks(text) {
  let n = 0;
  forEachCodeFreeLine(text, line => { if (/^\s*- \[ \] /.test(line)) n++; });
  return n;
}

// files = [{path, text?}]（text は md のみ）・today = 'YYYY-MM-DD'（Inbox 棚卸し用。省略可）
// → { ok, issues, stats, warnings } / { ok:false, error }
function lint(files, today) {
  if (files.length > MAX_FILES) {
    return { ok: false, error: 'ファイル数が上限（20,000）を超えたため処理を中止しました' };
  }
  const warnings = [];
  const issues = { brokenLinks: [], missingAttachments: [], badNames: [], dupBasenames: [], inbox: [], closedIssues: [] };

  // インデックス（比較は NFC + 小文字化 — spec「リンク解決規則」）
  const mdByBase = new Map();
  const mdByPath = new Set();
  const otherByBase = new Set();
  let notes = 0;
  for (const f of files) {
    if (/\.md$/i.test(f.path)) {
      notes++;
      const base = nfcLower(basenameOf(f.path).replace(/\.md$/i, ''));
      if (!mdByBase.has(base)) mdByBase.set(base, []);
      mdByBase.get(base).push(f.path);
      mdByPath.add(nfcLower(f.path.replace(/\.md$/i, '')));
    } else {
      otherByBase.add(nfcLower(basenameOf(f.path)));
    }
  }

  // badNames: ファイル名とフォルダ名の両方（同じフォルダは1回だけ見る）
  const seenSeg = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    parts.forEach((seg, idx) => {
      const segPath = parts.slice(0, idx + 1).join('/');
      if (seenSeg.has(segPath)) return;
      seenSeg.add(segPath);
      for (const reason of nameReasons(seg, idx === parts.length - 1)) {
        issues.badNames.push({ path: segPath, reason });
      }
    });
  }

  const resolveNote = target => {
    const t = nfcLower(target.replace(/\.md$/i, ''));
    return target.includes('/') ? mdByPath.has(t) : mdByBase.has(t);
  };
  // 添付はベース名で解決（spec: 厳密な最短パス選択はしない）
  const resolveAttachment = target => otherByBase.has(nfcLower(basenameOf(target)));

  // リンク走査（wiki リンクと md 画像/添付リンク）
  let links = 0;
  // **パス修飾なしで指されたノート名**を集める（重複ベース名の実害判定に使う — VL-Q12）
  const linkedBare = new Set();
  const WIKI_RE = /(!?)\[\[([^\[\]]+)\]\]/g;
  const MDLINK_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const f of files) {
    if (!/\.md$/i.test(f.path) || typeof f.text !== 'string') continue;
    if (f.text.length > MAX_MD_CHARS) {
      warnings.push(f.path + ' は上限（200万文字）を超えるためリンクを走査しませんでした');
      continue;
    }
    // コードフェンス内・インラインコード内は走査しない（VL-13。Obsidian はコード内の
    // リンクを解決しない — shell の [[ -f x ]] 等の誤検出を防ぐ）。未閉フェンスは末尾まで
    forEachCodeFreeLine(f.text, (line, li) => {
      let m;
      WIKI_RE.lastIndex = 0;
      while ((m = WIKI_RE.exec(line))) {
        links++;
        const embed = m[1] === '!';
        let inner = m[2].split('|')[0];               // エイリアスを剥がす
        const hashIdx = inner.indexOf('#');           // 見出し・ブロック（#^）を剥がす
        const target = (hashIdx >= 0 ? inner.slice(0, hashIdx) : inner).trim();
        if (target === '') continue;                  // [[#見出し]] = 自ファイル参照
        const isAttachment = embed && /\.[A-Za-z0-9]{1,8}$/.test(target) && !/\.md$/i.test(target);
        if (isAttachment) {
          if (!resolveAttachment(target)) issues.missingAttachments.push({ file: f.path, line: li + 1, target });
        } else {
          if (!target.includes('/')) linkedBare.add(nfcLower(target.replace(/\.md$/i, '')));
          if (!resolveNote(target)) issues.brokenLinks.push({ file: f.path, line: li + 1, target });
        }
      }
      MDLINK_RE.lastIndex = 0;
      while ((m = MDLINK_RE.exec(line))) {
        const raw = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;   // http(s): data: obsidian: 等は対象外
        links++;
        let target;
        try { target = decodeURIComponent(raw); } catch (_) { target = raw; }
        if (!resolveAttachment(target)) issues.missingAttachments.push({ file: f.path, line: li + 1, target: raw });
      }
    });
  }

  /* dupBasenames（VL-Q12 で判定を変更・2026-09-24）:
     **同名であること自体は問題ではない。**問題は「パス修飾なしのリンクがその名前を指していて、
     どれに解決されるか決まらない」こと。旧実装は同名を全部出していたため、
     `.claude/commands` のミラーや 1on1 の人別フォルダなど**直してはいけないもの**が並び、
     実測では18件すべてが実害ゼロだった（パス無しリンク0件）。報告が読まれなくなる。
     → **実際に曖昧なリンクが存在するものだけ**を出す */
  for (const paths of mdByBase.values()) {
    if (paths.length < 2) continue;
    const base = basenameOf(paths[0]).replace(/\.md$/i, '');
    if (!linkedBare.has(nfcLower(base))) continue;
    issues.dupBasenames.push({ base: base, paths: paths.slice() });
  }

  // Inbox 棚卸し（VL-14）: 設定した Inbox フォルダ**直下**の純デイリーだけ。7日より古いものを候補に出す
  // （週次の成果物はノートとして残らないため「週次より古い」は判定できない — 日数ルール）。
  // トピックノートは件数のみ（内容判断はツールの領分外）。
  // **CFG.inboxDir が空なら検査自体をしない** — フォルダ構成は利用者ごとに違うため
  const DAILY_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
  const AGE_DAYS = 7;
  const dayOf = ymd => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000;
  let inboxOthers = 0;
  if (today && CFG.inboxDir) {
    const prefix = CFG.inboxDir + '/';
    for (const f of files) {
      if (!f.path.startsWith(prefix)) continue;
      const rest = f.path.slice(prefix.length);
      // 直下のみ対象（サブフォルダのノートは純デイリーとして扱わない）
      const m = rest.includes('/') ? null : DAILY_RE.exec(rest);
      if (!m) { if (/\.md$/i.test(f.path)) inboxOthers++; continue; }
      const age = dayOf(today) - dayOf(m[1]);
      if (age <= AGE_DAYS) continue;
      issues.inbox.push({ path: f.path, date: m[1], age, pending: countPendingTasks(f.text) });
    }
  }

  // 閉じたイシュー（VL-22・VL-Q13）: 設定した issueDir **直下**の md で frontmatter が status: closed のもの。
  // 閉じるのは Check Issue（status/closed を書く）、ここは片づけだけ。**issueDir が空なら検査自体をしない**
  let dirSet = null;   // 案件フォルダの有無（VL-Q14）。必要になったときだけ作る
  if (CFG.issueDir) {
    const prefix = CFG.issueDir + '/';
    for (const f of files) {
      if (!f.path.startsWith(prefix) || !/\.md$/i.test(f.path) || typeof f.text !== 'string') continue;
      if (f.path.slice(prefix.length).includes('/')) continue;      // 直下のみ
      const fm = frontmatterOf(f.text);
      if (!fm || fm.status !== 'closed') continue;
      const project = fm.project || '';
      issues.closedIssues.push({ path: f.path, closed: fm.closed || '', verdict: fm.verdict || '',
        project, dest: closedDest(fm.closed || '', project, dirSet || (dirSet = dirsOf(files))) });
    }
  }

  return { ok: true, issues, stats: { files: files.length, notes, links, inboxOthers }, warnings };
}

// 先頭の frontmatter を key: value のスカラーだけ読む（status / closed / verdict で足りる）
function frontmatterOf(text) {
  const m = String(text || '').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) return null;
  const out = {};
  for (const l of m[1].split('\n')) {
    const k = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (k) {
      let v = k[2].trim();
      // "a: b" / 'x' の引用を外す（Plan Tasks の yamlScalar が記号を含む値を "…" で書く）
      if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch (_) { v = v.slice(1, -1); } }
      else if (/^'.*'$/.test(v)) v = v.slice(1, -1);
      out[k[1]] = v;
    }
  }
  return out;
}

// vault に在るフォルダの集合（ファイルのパスの祖先）。中身が空のフォルダは含まれない
function dirsOf(files) {
  const out = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return out;
}
/* 閉じたイシューの移動先（VL-Q14）。closedDir はカンマ区切りの候補で、**左から試して最初に決まったもの**:
   {project} を含む候補は、project があり「{project} までの部分」（例 10_Projects/ITK）が vault に在るときだけ。
   {YYYY} は閉じた年（無ければ今年）。どれも決まらなければ ''（移動を提案しない） */
function closedDest(closed, project, dirs) {
  const y = (closed && /^\d{4}/.test(closed)) ? closed.slice(0, 4) : todayStr().slice(0, 4);
  const pj = String(project || '').trim();
  for (const raw of CFG.closedDir.split(/[,、]/)) {
    const c = ToolConfig.normDir(raw);
    if (c === '') continue;
    if (c.includes('{project}')) {
      if (pj === '' || /[\/\\]/.test(pj)) continue;
      const root = c.split('{project}')[0] + pj;
      if (!dirs.has(root)) continue;
      return c.replace(/\{project\}/g, pj).replace(/\{YYYY\}/g, y);
    }
    return c.replace(/\{YYYY\}/g, y);
  }
  return '';
}

// アダプタ層の除外（UI/テスト経路の共通入口。FSA 走査は同じ集合をディレクトリ単位で飛ばす）
function excludeFiles(files) {
  const ex = excludeDirSet();
  let excluded = 0;
  const kept = [];
  for (const f of files) {
    if (f.path.split('/').some(seg => ex.has(seg))) { excluded++; continue; }
    kept.push(f);
  }
  return { kept, excluded };
}

