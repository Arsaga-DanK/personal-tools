'use strict';
/* web/taskboard/now.js — 「いま」（今やるものを種類ごとに1行で並べる札・札から表の行へ飛ぶ）
   入口: web/taskboard.html（このファイルは単独では動かない）。前提: engine.js（diffDays・ST_DOING）・io.js（state・el）・
   list.js（rowState・render）が先に読まれる。描くのと光らせるのは lib/ui.js の ToolUI.nowStrip / flash（2026-10-02 に移設 — 分け方はここ）。
   読み込み時に実行する文は無い（宣言だけ）。
   2026-10-01 に list.js が 1,000 行を超えたので分けた（分割の規約: docs/coding-rules.md「ファイルの分割」） */

/* ---------- 「いま」（TB-NW1〜NW8・TB-Q66・TB-Q70） ----------
   表の上に、今やるもの（遅れ・今日まで・進めている・開始日を過ぎた）を種類ごとに1行で並べる。種類の分け方は行の色の帯（rowState）と同じ。
   対象は表と同じ（絞り込みに従う）。たたんだ親・セクションの中も出す — 札を押せば開いてその行へ飛ぶ */
const NOW_KINDS = [['late', '遅れ'], ['today', '今日まで'], ['doing', '進めている'], ['should', '開始日を過ぎた']];
function nowName(t) { return t.displayBody || t.body || '(内容なし)'; }
function renderNow(groups, today) {
  const box = el('now');
  box.hidden = state.ui.view !== 'list';
  if (box.hidden) return;
  const byLine = new Map(state.doc.tasks.map(x => [x.line, x]));
  // 表の順（並び順・セクションの順）で、表に出るタスクを集める
  const by = { late: [], today: [], doing: [], should: [] };
  const walk = (t) => {
    const k = t._vis ? rowState(t, today) : '';
    if (k) by[k].push(t);
    for (const c of t.children) walk(c);
  };
  for (const g of groups) walk(g);
  by.late.sort((a, b) => a.due.localeCompare(b.due));   // 期限の古い順（同じなら表の順 — sort は安定）
  // 子孫が 遅れ・今日まで・進めている に出ている親は「開始日を過ぎた」に出さない（子の札に親の名前が付くので文脈は伝わる）
  const shown = new Set(by.late.concat(by.today, by.doing).map(t => t.line));
  const hasShownDesc = t => t.children.some(c => shown.has(c.line) || hasShownDesc(c));
  by.should = by.should.filter(t => !hasShownDesc(t));

  ToolUI.nowStrip(box, {
    kinds: NOW_KINDS.map(([id, label]) => ({ id, label, count: id !== 'should' })),   // 開始日を過ぎた は見出しに数を出さない（TB-NW1）
    groups: Object.fromEntries(NOW_KINDS.map(([id]) => [id, by[id].map(t => nowTick(t, id, today, byLine))])),
    folded: state.ui.nowFolded,
    onFold: () => { state.ui.nowFolded = !state.ui.nowFolded; persistUi(); render(); },
    empty: '急ぎのものはありません',
  });
}
// 札の中身: 「▶ 」（遅れ・今日までに入った着手中）＋「親の内容（10字まで）› 」＋内容＋「（N日遅れ）」。title は祖先から全文
function nowTick(t, kind, today, byLine) {
  const parts = [];
  if (t.status === ST_DOING && kind !== 'doing') parts.push({ text: '▶ ', cls: 'tick-par' });
  const parent = t.parentLine !== null ? byLine.get(t.parentLine) : null;
  if (parent) {
    const cs = Array.from(nowName(parent));   // 文字（コードポイント）で数える — 絵文字を途中で切らない
    parts.push({ text: (cs.length > 10 ? cs.slice(0, 10).join('') + '…' : cs.join('')) + ' › ', cls: 'tick-par' });
  }
  parts.push({ text: nowName(t) });
  if (kind === 'late') parts.push({ text: '（' + (-diffDays(today, t.due)) + '日遅れ）', cls: 'tick-rel' });
  const path = [];
  for (let p = t; p; p = p.parentLine !== null ? byLine.get(p.parentLine) : null) path.unshift(nowName(p));
  return { parts, title: path.join(' › '), onClick: () => jumpToRow(t) };
}
// 札から表の行へ: たたんだ祖先とセクションを開いて描き直し、行を画面の中ほどへ寄せて少し光らせる（TB-NW4）
function jumpToRow(t) {
  const byLine = new Map(state.doc.tasks.map(x => [x.line, x]));
  for (let p = t.parentLine; p !== null && p !== undefined; p = (byLine.get(p) || {}).parentLine) state.collapsed.delete(p);
  state.secFolded.delete(t.section || '');
  render();
  const tr = document.querySelector('#task-table tbody tr[data-line="' + t.line + '"]');
  if (!tr) return;
  ToolUI.flash(tr);
}
