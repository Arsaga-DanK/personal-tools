'use strict';
/* web/issue/now.js — 「いま」（段2 — IS-LK10〜LK14・docs/audits/2026-10-02-issue-redesign.md）
   入口: web/issue.html（このファイルは単独では動かない）。前提: tasks.js（isRipe・tasksOf・shortDate・taskLinks — 段4）・engine.js（noteStats）・list.js（notes・matchesSearch・statusFilter・
   setStatusFilter・cardState・projFolded・renderCards・dayDiff）・lib/ui.js（ToolUI.nowStrip / flash — 描くのと光らせるのは共通部品）。
   読み込み時に実行する文は無い（宣言だけ）。何を入れるかはここで決める（部品は見た目だけ） */

// [id, 行の札のラベル, 見出しの数のラベル]（論点なしだけ見出しでは短く）
const ISSUE_NOW_KINDS = [['late', '遅れ', '遅れ'], ['today', '今日まで', '今日まで'], ['rethink', '立て直す', '立て直す'], ['noissue', '論点がまだ無い', '論点なし'], ['ripe', '閉じどき', '閉じどき']];
let nowFolded = false;   // 保存は ui.js の savePayload / restore

function renderIssueNow() {
  const box = $id('now');
  box.hidden = notes.length === 0;
  if (box.hidden) return;
  const by = { late: [], today: [], rethink: [], noissue: [], ripe: [] };
  notes.forEach(function (n) {
    if (!matchesSearch(n) || (n.base && n.base.status === 'closed')) return;   // 検索に従う・閉じたノートは出さない
    if (isRipe(n)) { by.ripe.push({ n: n }); return; }   // 1つのノートは1か所 — 閉じどきが先（段4 — IS-TK3）
    if (!n.cards.some(function (c) { return c.issue; })) { by.noissue.push({ n: n }); return; }
    n.cards.forEach(function (c) { const s = cardState(c); if (s) by[s].push({ n: n, c: c }); });
  });
  by.late.sort(function (a, b) { return a.c.deadline < b.c.deadline ? -1 : a.c.deadline > b.c.deadline ? 1 : 0; });   // 古い順（安定）
  ToolUI.nowStrip(box, {
    kinds: ISSUE_NOW_KINDS.map(function (p) { return { id: p[0], label: p[1], head: p[2], count: p[0] !== 'ripe' || !!(taskLinks && taskLinks.fresh) }; }),   // 閉じどきの数は写しが新しいときだけ
    groups: Object.fromEntries(ISSUE_NOW_KINDS.map(function (p) { return [p[0], by[p[0]].map(function (x) { return issueTick(x, p[0]); })]; })),
    folded: nowFolded,
    onFold: function () { nowFolded = !nowFolded; scheduleSave(); renderIssueNow(); },
    empty: '急ぎのものはありません',
  });
}

// 札: 「⚠ 」（遅れ・今日までの ⚠ の論点）＋「⏳ 待ち 」＋「ノート名（12字）› 」＋論点＋「（N日遅れ）」。論点がまだ無いノートは「ノート名（掘る N行）」
// 札は幅で切れる（… で省く）ので、印は前に置く（待ちを最後に置くと長い論点で見えなかった — IS-DG6）
function issueTick(x, kind) {
  const cs = Array.from(x.n.title);
  const short = cs.length > 12 ? cs.slice(0, 12).join('') + '…' : cs.join('');
  if (kind === 'ripe') {   // 閉じどき: 「ノート名（全部済み 9/29）」— 押すとノートのカードへ（段4 — IS-TK3）
    const t = tasksOf(x.n);
    return { parts: [{ text: x.n.title }, { text: '（全部済み' + (t && t.last ? ' ' + shortDate(t.last) : '') + '）', cls: 'tick-par' }],
      title: x.n.title + ' — つながるタスクは全部済み。論点を閉じますか？', onClick: function () { jumpToIssue(x.n, null); } };
  }
  if (!x.c) {
    return { parts: [{ text: x.n.title }, { text: '（掘る ' + noteStats(x.n.text).dig + '行）', cls: 'tick-par' }],
      title: x.n.title + ' — 論点を一行で書く', onClick: function () { jumpToIssue(x.n, null); } };
  }
  const waits = (x.c.kids || []).filter(function (s) { return s.kind === 'wait'; }).map(function (s) { return s.text; });
  const parts = [];
  if (x.c.warn > 0 && kind !== 'rethink') parts.push({ text: '⚠ ', cls: 'tick-warn' });
  if (waits.length) parts.push({ text: '⏳ 待ち ', cls: 'tick-wait' });   // 段3 — IS-DG6
  parts.push({ text: short + ' › ', cls: 'tick-par' });
  parts.push({ text: x.c.issue });
  if (kind === 'late') parts.push({ text: '（' + (-dayDiff(x.c.deadline)) + '日遅れ）', cls: 'tick-rel' });
  return { parts: parts, title: x.n.title + ' › ' + x.c.issue + (waits.length ? '（⏳ 待ち: ' + waits.join('・') + '）' : ''),
    onClick: function () { jumpToIssue(x.n, x.c); } };
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
