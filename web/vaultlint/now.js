'use strict';
/* web/vaultlint/now.js — 「いま」（段6 — VL-N1〜N3・docs/audits/2026-10-05-issue-redesign-plan-6.md）
   入口: web/vaultlint.html（このファイルは単独では動かない）。前提: ui.js（el・activeClasses・vlFolded・setClassFolded）・lib/ui.js（ToolUI.nowStrip / flash）。
   読み込み時に実行する文は無い（宣言だけ）。何を入れるかはここで決める（部品は見た目だけ） */

// [id, ラベル]。直す＝壊れているもの／片づけ＝移すだけのもの／確認＝人が見て決めるもの
const VL_NOW_KINDS = [['fix', '直す'], ['tidy', '片づけ'], ['check', '確認']];
// 札: [行, 種類の key, 札の名前, 件数]。札は種類ごと（1件ずつ並べない）
const VL_NOW_TICKS = [
  ['fix', 'brokenLinks', 'リンク切れ', l => l.length],
  ['fix', 'missingAttachments', '添付消失', l => l.length],
  ['fix', 'badNames', 'ファイル名の罠', l => l.length],
  ['tidy', 'inbox', '古いデイリー', l => l.filter(i => !i.pending).length],
  ['tidy', 'closedIssues', '閉じたイシュー', l => l.length],
  ['check', 'inbox', '未転記タスクのあるデイリー', l => l.filter(i => i.pending).length],
  ['check', 'dupBasenames', '重複ベース名', l => l.length],
];
let vlNowFolded = false;   // 「いま」をたたんだか（画面を閉じるまで）

function renderVaultNow(res) {
  const box = el('now');
  box.hidden = !res || !res.ok;
  if (box.hidden) return;
  const active = new Set(activeClasses().map(d => d.key));   // 検査した種類だけ
  const groups = { fix: [], tidy: [], check: [] };
  const total = { fix: 0, tidy: 0, check: 0 };
  for (const [kind, key, name, countOf] of VL_NOW_TICKS) {
    if (!active.has(key)) continue;
    const n = countOf(res.issues[key] || []);
    if (!n) continue;
    total[kind] += n;
    groups[kind].push({ parts: [{ text: name + ' ' + n }], title: name + ' ' + n + '件 — 押すとその表へ', onClick: () => jumpToClass(key) });
  }
  ToolUI.nowStrip(box, {
    kinds: VL_NOW_KINDS.map(([id, label]) => ({ id: id, label: label, count: true, total: total[id] })),
    groups: groups,
    folded: vlNowFolded,
    onFold: () => { vlNowFolded = !vlNowFolded; renderVaultNow(res); },
    empty: '直すもの・片づけるものはありません ✅',
  });
}

// 札から表へ: たたんでいれば開き、その種類の表まで動かして光らせる（VL-N2）
function jumpToClass(key) {
  const sec = document.querySelector('#results section[data-key="' + key + '"]');
  if (!sec) return;
  if (vlFolded.has(key)) setClassFolded(sec, false);
  sec.scrollIntoView({ block: 'start' });
  ToolUI.flash(sec);
}
