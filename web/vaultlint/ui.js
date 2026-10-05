'use strict';
/* web/vaultlint/ui.js — 結果の表・報告・修復の選択（CLASS_DEFS・render）
   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: engine.js・fix.js（canDeleteLine）・lib/ui.js。読み込み時に実行する文は無い（宣言だけ）
   2026-10-05 に vaultlint.html から節ごとに分けた（段6 — 1,000 行を超えるため。coding-rules「ファイルの分割」） */
/* ========== UI ========== */

const el = id => document.getElementById(id);
function showBanner(kind, text) { ToolUI.banner(el('banner'), kind, text); }

// リネームの提案名（罠の文字を除去。空ベース名・変化なしは提案できない → null）
function renameSuggestion(path, byPath) {
  if (!byPath.has(path)) return null;   // フォルダは対象外（影響が大きすぎる — spec）
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;            // 空ベース名（.md）等は自動提案しない
  const ext = name.slice(dot);
  const stem = name.slice(0, dot)
    .replace(/\u00A0/g, ' ').replace(/\u3000/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (stem === '' || stem + ext === name) return null;
  const to = dir + stem + ext;
  return byPath.has(to) ? null : to;    // 既存と衝突する提案は出さない
}

const CLASS_DEFS = [
  { key: 'brokenLinks', title: 'リンク切れ', cols: ['ファイル', '行', 'ターゲット'],
    row: i => [i.file, String(i.line), i.target],
    md: i => i.file + ':' + i.line + ' → ' + i.target,
    fix: (i, ctx) => ({
      options: [{ value: 'textify', label: 'テキスト化（[[ ]] を外す）' }]
        .concat(canDeleteLine(ctx.files, i.file, i.line) ? [{ value: 'deleteLine', label: '行ごと削除' }] : [])
        .concat([{ value: 'none', label: 'しない' }]),
      value: 'textify',
    }),
    selectionOf: (i, v) => (v === 'textify' ? { type: 'textify', file: i.file, line: i.line, target: i.target }
      : v === 'deleteLine' ? { type: 'deleteLine', file: i.file, line: i.line } : null) },
  { key: 'missingAttachments', title: '添付消失', cols: ['ファイル', '行', 'ターゲット'],
    row: i => [i.file, String(i.line), i.target],
    md: i => i.file + ':' + i.line + ' → ' + i.target,
    fix: () => ({
      options: [{ value: 'none', label: 'しない' }, { value: 'remove', label: '参照を除去（行は残す）' }],
      value: 'none',   // 内容が消えるため既定は選択しない（spec: 個別選択）
    }),
    selectionOf: (i, v) => (v === 'remove' ? { type: 'removeAttachment', file: i.file, line: i.line, target: i.target } : null) },
  { key: 'badNames', title: 'ファイル名の罠', cols: ['パス', '理由'],
    row: i => [i.path, i.reason],
    md: i => i.path + ' — ' + i.reason,
    fix: (i, ctx) => {
      const to = renameSuggestion(i.path, ctx.byPath);
      return to ? {
        options: [{ value: 'rename', label: 'リネーム → ' + basenameOf(to) }, { value: 'none', label: 'しない' }],
        value: 'rename', to,
      } : null;
    },
    selectionOf: (i, v, conf) => (v === 'rename' ? { type: 'rename', from: i.path, to: conf.to } : null) },
  { key: 'dupBasenames', title: '重複ベース名', cols: ['ベース名', 'パス'],
    row: i => [i.base, i.paths.join(' , ')],
    md: i => i.base + ': ' + i.paths.join(', ') },
  { key: 'inbox', title: 'Inbox 棚卸し（7日より古いデイリー）', cols: ['ファイル', '経過', '未転記タスク'],
    row: i => [i.path, i.age + '日', i.pending ? i.pending + '件' : '—'],
    md: i => i.path + '（' + i.age + '日' + (i.pending ? '・未転記 ' + i.pending + '件' : '') + '）',
    // アーカイブ先が未設定なら移動を提案しない（移動先が決まらないため）
    fix: i => (CFG.archiveDir ? {
      options: [{ value: 'archive', label: CFG.archiveDir + '/ へ移動' }, { value: 'none', label: 'しない' }],
      value: i.pending ? 'none' : 'archive',   // 未転記タスクが残るものは既定で動かさない
    } : null),
    selectionOf: (i, v) => (v === 'archive' ? { type: 'archiveDaily', from: i.path } : null) },
  { key: 'closedIssues', title: '閉じたイシュー（status: closed）', cols: ['ファイル', '案件', '閉じた日', '判定'],
    row: i => [i.path, i.project || '—', i.closed || '—', i.verdict || '—'],
    md: i => i.path + '（' + (i.project ? i.project + '・' : '') + (i.closed || '日付なし') + (i.verdict ? '・' + i.verdict : '') + '）',
    // 移動先が未設定なら移動を提案しない（Inbox 棚卸しと同じ流儀）。待ち日数は置かない（閉じる操作が承認）
    // 移動先は lint が候補から決めた dest（決まらなければ提案しない — VL-Q14）
    fix: i => (CFG.closedDir && i.dest ? {
      options: [{ value: 'archive', label: i.dest + '/ へ移動' }, { value: 'none', label: 'しない' }],
      value: 'archive',
    } : null),
    selectionOf: (i, v) => (v === 'archive' ? { type: 'archiveIssue', from: i.path, closed: i.closed, project: i.project } : null) },
];

/* 実際に検査したクラスだけを出す。Inbox 棚卸しは対象フォルダが未設定なら**検査していない**ので
   一覧から外す — 検査していないものを「問題なし ✅」と表示すると嘘になる。 */
const activeClasses = () => CLASS_DEFS.filter(d =>
  (d.key !== 'inbox' || CFG.inboxDir !== '') && (d.key !== 'closedIssues' || CFG.issueDir !== ''));

let lastReport = '';

function buildReport(res) {
  const out = ['# vault-lint 報告', ''];
  for (const def of activeClasses()) {
    const list = res.issues[def.key];
    out.push('## ' + def.title + '（' + list.length + '件）', '');
    for (const i of list) out.push('- ' + def.md(i));
    out.push('');
  }
  return out.join('\n');
}

let lastScan = null;      // { files, excluded } — 修復の計画づくりが参照する
let fixControls = [];     // 各行の修復セレクト（get() が selection か null を返す）

function render(res, excluded, files) {
  const host = el('results');
  host.textContent = '';
  fixControls = [];
  if (!res.ok) {
    showBanner('error', res.error);
    el('summary').textContent = '';
    el('copy-btn').hidden = true;
    el('fix-btn').hidden = true;
    el('commit-label').hidden = true;
    return;
  }
  lastScan = { files: files || [], excluded };
  const ctx = { files: lastScan.files, byPath: new Map(lastScan.files.map(f => [f.path, f])) };
  const total = activeClasses().reduce((n, d) => n + res.issues[d.key].length, 0);
  el('summary').textContent = 'ファイル ' + res.stats.files + '・ノート ' + res.stats.notes +
    '・リンク ' + res.stats.links + '・除外 ' + excluded +
    (res.stats.inboxOthers ? '・Inbox の非デイリー ' + res.stats.inboxOthers + '件（/inbox-clean へ）' : '') +
    ' ／ 問題 ' + total + ' 件';
  showBanner('warn', res.warnings.join(' / '));   // 空なら hidden
  for (const def of activeClasses()) {
    const list = res.issues[def.key];
    const block = document.createElement('section');
    block.className = 'issue-block';
    const h = document.createElement('h2');
    h.textContent = def.title + '（' + list.length + '件）';
    block.appendChild(h);
    if (!list.length) {
      const ok = document.createElement('p');
      ok.className = 'issue-ok';
      ok.textContent = '問題なし ✅';
      block.appendChild(ok);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      const table = document.createElement('table');
      const thead = document.createElement('tr');
      for (const c of def.cols.concat(def.fix ? ['修復'] : [])) {
        const th = document.createElement('th');
        th.textContent = c;
        thead.appendChild(th);
      }
      table.appendChild(thead);
      for (const item of list) {
        const tr = document.createElement('tr');
        for (const v of def.row(item)) {
          const td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
        }
        if (def.fix) {
          const td = document.createElement('td');
          const conf = def.fix(item, ctx);
          if (conf) {
            const s = document.createElement('select');
            s.className = 'fix-select';
            for (const o of conf.options) {
              const opt = document.createElement('option');
              opt.value = o.value;
              opt.textContent = o.label;
              s.appendChild(opt);
            }
            s.value = conf.value;
            td.appendChild(s);
            fixControls.push({ get: () => def.selectionOf(item, s.value, conf) });
          } else {
            td.textContent = '—';
          }
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      wrap.appendChild(table);
      block.appendChild(wrap);
    }
    host.appendChild(block);
  }
  lastReport = buildReport(res);
  el('copy-btn').hidden = false;
  const fixable = fixControls.length > 0;
  el('fix-btn').hidden = !fixable;
  el('commit-label').hidden = !fixable;
}

