'use strict';
/* web/issue/now.js — 「いま」（段2 — IS-LK10〜LK14・docs/audits/2026-10-02-issue-redesign.md）
   入口: web/issue.html（このファイルは単独では動かない）。前提: engine.js（noteStats）・list.js（notes・matchesSearch・statusFilter・
   setStatusFilter・cardState・projFolded・renderCards・dayDiff）・lib/ui.js（ToolUI.nowStrip / flash — 描くのと光らせるのは共通部品）。
   読み込み時に実行する文は無い（宣言だけ）。何を入れるかはここで決める（部品は見た目だけ） */

// [id, 行の札のラベル, 見出しの数のラベル]（論点なしだけ見出しでは短く）
const ISSUE_NOW_KINDS = [['late', '遅れ', '遅れ'], ['today', '今日まで', '今日まで'], ['rethink', '立て直す', '立て直す'], ['noissue', '論点がまだ無い', '論点なし']];
let nowFolded = false;   // 保存は ui.js の savePayload / restore

function renderIssueNow() {
  const box = $id('now');
  box.hidden = notes.length === 0;
  if (box.hidden) return;
  const by = { late: [], today: [], rethink: [], noissue: [] };
  notes.forEach(function (n) {
    if (!matchesSearch(n) || (n.base && n.base.status === 'closed')) return;   // 検索に従う・閉じたノートは出さない
    if (!n.cards.some(function (c) { return c.issue; })) { by.noissue.push({ n: n }); return; }
    n.cards.forEach(function (c) { const s = cardState(c); if (s) by[s].push({ n: n, c: c }); });
  });
  by.late.sort(function (a, b) { return a.c.deadline < b.c.deadline ? -1 : a.c.deadline > b.c.deadline ? 1 : 0; });   // 古い順（安定）
  ToolUI.nowStrip(box, {
    kinds: ISSUE_NOW_KINDS.map(function (p) { return { id: p[0], label: p[1], head: p[2], count: true }; }),
    groups: Object.fromEntries(ISSUE_NOW_KINDS.map(function (p) { return [p[0], by[p[0]].map(function (x) { return issueTick(x, p[0]); })]; })),
    folded: nowFolded,
    onFold: function () { nowFolded = !nowFolded; scheduleSave(); renderIssueNow(); },
    empty: '急ぎのものはありません',
  });
}

// 札: 「⚠ 」（遅れ・今日までの ⚠ の論点）＋「ノート名（12字）› 」＋論点＋「（N日遅れ）」。論点がまだ無いノートは「ノート名（掘る N行）」
function issueTick(x, kind) {
  const cs = Array.from(x.n.title);
  const short = cs.length > 12 ? cs.slice(0, 12).join('') + '…' : cs.join('');
  if (!x.c) {
    return { parts: [{ text: x.n.title }, { text: '（掘る ' + noteStats(x.n.text).dig + '行）', cls: 'tick-par' }],
      title: x.n.title + ' — 論点を一行で書く', onClick: function () { jumpToIssue(x.n, null); } };
  }
  const parts = [];
  if (x.c.warn > 0 && kind !== 'rethink') parts.push({ text: '⚠ ', cls: 'tick-warn' });
  parts.push({ text: short + ' › ', cls: 'tick-par' });
  parts.push({ text: x.c.issue });
  if (kind === 'late') parts.push({ text: '（' + (-dayDiff(x.c.deadline)) + '日遅れ）', cls: 'tick-rel' });
  return { parts: parts, title: x.n.title + ' › ' + x.c.issue, onClick: function () { jumpToIssue(x.n, x.c); } };
}

// 札から一覧へ: 表示が「閉じた」なら「開いている」に、たたんだ案件を開いて描き直し、その行（論点なしはノート）へ飛んで光らせる
function jumpToIssue(n, c) {
  projFolded.delete(n.project || '');
  if (statusFilter() === 'closed') setStatusFilter('open'); else renderCards();
  const key = c ? c.file + (c.kind === 'line' ? ':' + c.lineNo : '') : null;
  const el = key
    ? Array.from(document.querySelectorAll('#cards .issue-card')).find(function (a) { return a.dataset.key === key; })
    : Array.from(document.querySelectorAll('#cards .note-card')).find(function (s) { return s.dataset.file === n.file; });
  if (el) ToolUI.flash(el);
}
