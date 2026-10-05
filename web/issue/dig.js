'use strict';
/* web/issue/dig.js — ［掘るを読む］の最小の表示（段3 — IS-DG8・DG9）
   入口: web/issue.html（このファイルは単独では動かない）。読み込み時に実行する文は無い（宣言だけ）。
   **HTML 文字列を組み立てない**（createElement と textContent だけ）。崩れた書式は素の文字で出す（落とさない） */

// 1行の中の書式: **太字**・`コード`・[[リンク|別名]]・[文字](URL)。それ以外は文字のまま
function digInline(host, text) {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;
  let at = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > at) host.appendChild(document.createTextNode(text.slice(at, m.index)));
    const t = m[0];
    let el;
    if (t.startsWith('**')) { el = document.createElement('b'); el.textContent = t.slice(2, -2); }
    else if (t.startsWith('`')) { el = document.createElement('code'); el.textContent = t.slice(1, -1); }
    else if (t.startsWith('[[')) { const inner = t.slice(2, -2); el = document.createTextNode(inner.includes('|') ? inner.split('|').pop() : inner); }
    else { el = document.createTextNode(t.slice(1, t.indexOf(']'))); }
    host.appendChild(el);
    at = m.index + t.length;
  }
  if (at < text.length) host.appendChild(document.createTextNode(text.slice(at)));
}

// 前後の半角空白とタブだけを落とす（trim は全角空白も落とすので、全角空白で始まる行が見出しに化ける — IS-DG12）
function digStrip(s) { return s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''); }

function renderDig(text) {
  const box = document.createElement('div');
  box.className = 'md';
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], l = digStrip(raw);
    if (!raw.trim() || l.startsWith('>')) continue;              // 空行・注記（止め時の案内）は出さない
    if (l.startsWith('```')) {                                   // ブロックは中身をそのまま（閉じていなければ最後まで）
      const body = [];
      for (i++; i < lines.length && !digStrip(lines[i]).startsWith('```'); i++) body.push(lines[i]);
      const pre = document.createElement('pre');
      pre.textContent = body.join('\n');
      box.appendChild(pre);
      continue;
    }
    const h = l.match(/^#{1,6}[ \t]+(.*)$/);                    // 見出しは半角空白かタブだけ（Obsidian と同じ）
    if (h) {                                                     // 小見出し（掘るの中の ### …）
      const p = document.createElement('p');
      p.className = 'md-h';
      digInline(p, h[1]);
      box.appendChild(p);
      continue;
    }
    if (l.startsWith('|')) {                                     // 表（続く | の行をまとめる。区切りの行は出さない）
      const rows = [];
      while (i < lines.length && digStrip(lines[i]).startsWith('|')) { rows.push(digStrip(lines[i])); i++; }
      i--;
      const wrap = document.createElement('div');
      wrap.className = 'md-tw';
      const table = document.createElement('table');
      rows.filter(r => !/^\|[\s:|-]+\|?$/.test(r)).forEach((r, ri) => {
        const tr = document.createElement('tr');
        for (const c of r.replace(/^\||\|$/g, '').split('|')) {
          const cell = document.createElement(ri === 0 ? 'th' : 'td');
          digInline(cell, c.trim());
          tr.appendChild(cell);
        }
        table.appendChild(tr);
      });
      wrap.appendChild(table);
      box.appendChild(wrap);
      continue;
    }
    if (/^-{3,}$/.test(l)) { box.appendChild(document.createElement('hr')); continue; }
    const img = l.match(/^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/) || l.match(/^!\[([^\]]*)\]\([^)]+\)$/);
    if (img) {
      const d = document.createElement('div');
      d.className = 'md-img';
      d.textContent = '🖼 ' + (img[1] || '画像') + '（画像は Obsidian で）';
      box.appendChild(d);
      continue;
    }
    // 字下げを (?:\t| {2,})* と書かない — 入れ子の繰り返しは空白の長い行で固まる（IS-DG11）。深さは下で数える
    const li = raw.match(/^([\t ]*)(?:([-*+])(?:[ \t]+\[([ xX])\])?|(\d+)\.)[ \t]+(.*)$/);
    if (li) {
      const depth = (li[1].match(/\t| {2,4}/g) || []).length;
      const row = document.createElement('div');
      row.className = 'md-li';
      row.style.paddingLeft = (depth * 1.2) + 'em';
      const mark = li[4] ? li[4] + '. ' : (li[3] !== undefined ? (li[3] === ' ' ? '☐ ' : '☑ ') : '・');
      row.appendChild(document.createTextNode(mark));
      digInline(row, li[5]);
      box.appendChild(row);
      continue;
    }
    const p = document.createElement('p');
    digInline(p, l);
    box.appendChild(p);
  }
  return box;
}

const digOpen = new Set();   // ［掘るを読む］を開いたノート（ファイル名。画面を閉じるまで — IS-DG9）

// ［掘るを読む（掘る N行・論点 M・画像 K）］。中身は開いたときに作る（閉じたままのノートは描かない）
function digBox(file, dig, stats) {
  const d = document.createElement('details');
  d.className = 'dig';
  const sm = document.createElement('summary');
  const st = document.createElement('span');
  st.className = 'note-stats';
  st.textContent = stats;
  sm.append('掘るを読む（', st, '）');
  d.appendChild(sm);
  const fill = function () { if (!d.querySelector('.md')) d.appendChild(renderDig(dig)); };
  if (digOpen.has(file)) { d.open = true; fill(); }
  d.addEventListener('toggle', function () { if (d.open) { digOpen.add(file); fill(); } else digOpen.delete(file); });
  return d;
}
