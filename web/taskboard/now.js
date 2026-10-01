'use strict';
/* web/taskboard/now.js — 「いま」（今やるものを種類ごとに1行で並べる札・札から表の行へ飛ぶ）
   入口: web/taskboard.html（このファイルは単独では動かない）。前提: engine.js（diffDays・ST_DOING）・io.js（state・el）・
   list.js（rowState・render）が先に読まれる。読み込み時に実行する文は無い（宣言だけ）。
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
  box.textContent = '';
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

  const head = document.createElement('div');
  head.className = 'now-head';
  const title = document.createElement('span');
  title.className = 'now-title';
  title.textContent = 'いま';
  head.appendChild(title);
  for (const [k, label] of NOW_KINDS.slice(0, 3)) {
    const c = document.createElement('span');
    c.className = 'now-cnt';
    const dot = document.createElement('span');
    dot.className = 'now-dot k-' + k;
    const n = document.createElement('b');
    n.textContent = String(by[k].length);
    c.append(dot, label + ' ', n);
    head.appendChild(c);
  }
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.id = 'now-fold';
  fold.className = 'now-fold';
  fold.textContent = state.ui.nowFolded ? 'ひらく ▾' : 'たたむ ▴';
  fold.setAttribute('aria-expanded', String(!state.ui.nowFolded));
  fold.addEventListener('click', () => { state.ui.nowFolded = !state.ui.nowFolded; persistUi(); render(); });
  head.appendChild(fold);

  const ul = document.createElement('ul');
  ul.className = 'now-list';
  ul.hidden = state.ui.nowFolded;
  for (const [k, label] of NOW_KINDS) {
    if (!by[k].length) continue;
    const li = document.createElement('li');
    li.className = 'now-group';
    const badge = document.createElement('span');
    badge.className = 'now-badge k-' + k;
    badge.textContent = label + ' ' + by[k].length;
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    for (const t of by[k]) ticks.appendChild(nowTick(t, k, today, byLine));
    li.append(badge, ticks);
    ul.appendChild(li);
  }
  if (!ul.childNodes.length) {
    const li = document.createElement('li');
    li.className = 'now-empty';
    li.textContent = '急ぎのものはありません';
    ul.appendChild(li);
  }
  box.append(head, ul);
}
// 札: 「▶ 」（遅れ・今日までに入った着手中）＋「親の内容（10字まで）› 」＋内容＋「（N日遅れ）」。title は祖先から全文
function nowTick(t, kind, today, byLine) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tick';
  const part = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  if (t.status === ST_DOING && kind !== 'doing') b.appendChild(part('tick-par', '▶ '));
  const parent = t.parentLine !== null ? byLine.get(t.parentLine) : null;
  if (parent) {
    const cs = Array.from(nowName(parent));   // 文字（コードポイント）で数える — 絵文字を途中で切らない
    b.appendChild(part('tick-par', (cs.length > 10 ? cs.slice(0, 10).join('') + '…' : cs.join('')) + ' › '));
  }
  b.appendChild(document.createTextNode(nowName(t)));
  if (kind === 'late') b.appendChild(part('tick-rel', '（' + (-diffDays(today, t.due)) + '日遅れ）'));
  const path = [];
  for (let p = t; p; p = p.parentLine !== null ? byLine.get(p.parentLine) : null) path.unshift(nowName(p));
  b.title = path.join(' › ');
  b.addEventListener('click', () => jumpToRow(t));
  return b;
}
// 札から表の行へ: たたんだ祖先とセクションを開いて描き直し、行を画面の中ほどへ寄せて少し光らせる（TB-NW4）
function jumpToRow(t) {
  const byLine = new Map(state.doc.tasks.map(x => [x.line, x]));
  for (let p = t.parentLine; p !== null && p !== undefined; p = (byLine.get(p) || {}).parentLine) state.collapsed.delete(p);
  state.secFolded.delete(t.section || '');
  render();
  const tr = document.querySelector('#task-table tbody tr[data-line="' + t.line + '"]');
  if (!tr) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  tr.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  tr.classList.add('flash');
  setTimeout(() => tr.classList.remove('flash'), 1300);
}
