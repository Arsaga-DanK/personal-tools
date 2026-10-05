'use strict';
/* web/issue/tasks.js — タスクとのつながり・閉じどき（段4 — IS-TK1〜TK7・docs/audits/2026-10-02-issue-redesign.md）
   入口: web/issue.html（このファイルは単独では動かない）。読み込み時に実行する文は、写しが書き換わったときの描き直しの登録だけ。
   前提: lib/tasklinks.js（写しを読む — 数えるのは Plan Tasks・TB-LN）・lib/edit.js（fillDate）・list.js（notes・renderCards・openCloseModal・$id）・engine.js（todayStr）。
   正本は tasks.md。写しは「いつの時点か」を必ず出し、古ければ（24時間）数も閉じどきも出さない */

let taskLinks = null;   // 一覧を描くたびに読み直す（renderCards の頭）

function refreshTaskLinks() { taskLinks = window.ToolTaskLinks ? ToolTaskLinks.read(Date.now()) : null; }

// ノートにつながるタスクの数。写しが無い・古いときは null（数を出さない）。つながりが無ければ total 0
function tasksOf(n) {
  if (!taskLinks || !taskLinks.fresh || !n) return null;
  const c = Object.prototype.hasOwnProperty.call(taskLinks.notes, n.name) ? taskLinks.notes[n.name] : null;
  if (!c || typeof c.total !== 'number' || typeof c.done !== 'number') return { total: 0, done: 0, last: '' };
  return { total: c.total, done: c.done, last: typeof c.last === 'string' ? c.last : '' };
}

function shortDate(ymd) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? (+m[1]) + '/' + (+m[2]) : '';
}

// 見出しの右: 「タスク 3・済み 2」／全部済みなら「全部済み ✓」。写しが無い・古い・つながりが無いときは出さない
function noteTasksChip(n) {
  const t = tasksOf(n);
  if (!t || t.total === 0) return null;
  const s = document.createElement('span');
  const all = t.done === t.total;
  s.className = 'note-tasks' + (all ? ' all-done' : '');
  s.textContent = all ? '全部済み ✓' : 'タスク ' + t.total + '・済み ' + t.done;
  s.title = 'Plan Tasks のタスクのうち、このノートを関連ノートに持つもの（済み = 完了と中止）';
  return s;
}

// 見出しの1行目の「タスク 10/5 14:30 時点」／「タスクは未読込」／「タスクは古い（10/3）」。
// 1行目の空きは約 180px（1280px）なので短く — 説明は title に（長い文は ⋯ を次の行へ落とした。2026-10-05 に実測 — IS-LK1・TK1・TK5）
function renderLinksAt() {
  const el = $id('links-at');
  if (!el) return;
  el.hidden = notes.length === 0;
  if (!taskLinks) {
    el.textContent = 'タスクは未読込';
    el.title = 'Plan Tasks で tasks.md を開く（保存する）と、ノートごとのタスクの数と閉じどきが出ます';
    return;
  }
  const d = new Date(taskLinks.at);
  const md = (d.getMonth() + 1) + '/' + d.getDate();
  const at = md + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const file = taskLinks.file || 'tasks.md';
  el.textContent = taskLinks.fresh ? 'タスク ' + at + ' 時点' : 'タスクは古い（' + md + '）';
  el.title = taskLinks.fresh
    ? 'タスクの数は Plan Tasks が ' + file + ' を読んだ・保存した時点（' + at + '）のもの'
    : 'Plan Tasks が最後に数えたのは ' + at + '（' + file + '）。24時間より古いので数と閉じどきを出していません。Plan Tasks を開くと新しくなります';
}

// Plan Tasks が別のタブで写しを書き換えたら描き直す（file:// は1オリジン — storage イベントが届く）。
// 一覧の中で書いている最中（.ic-edit）は描き直さない — 打った文字を消さない。次に描くときに読み直す（IS-TK7）
window.addEventListener('storage', function (e) {
  if (!window.ToolTaskLinks || e.key !== 'tools:' + ToolTaskLinks.NAME) return;
  if (document.querySelector('#cards .ic-edit')) return;
  renderCards();
});
