/* lib/sql.js — PostgreSQL の字句解析。classic script、window.SqlLex を公開。
   Convert（devpad）の SQL タブと Schema（ddl2spec）が共有する。
   共有する理由: ドル引用符・入れ子ブロックコメント・E'' は公式ドキュメントで確認して
   実装した繊細な規則で、2版持つと片方だけ直る事故が起きる（tool-backlog の
   lib/ui.js 保留とは別物 — あちらは showBanner とコピー処理の2つに範囲を限定した保留）。

   公開するのは tokenize と PUNCT2 のみ。キーワード集合・括弧分類・整形は
   利用側（devpad）に残す。 */
(function () {
  'use strict';

  const PUNCT2 = ['->>', '::', '<=', '>=', '<>', '!=', '||', '->'];

  // 成功: {ok:true, tokens} / 失敗: {ok:false, error, line}
  function tokenize(src) {
    const s = String(src), n = s.length, tokens = [];
    const lineAt = idx => s.slice(0, idx).split('\n').length;
    let i = 0;
    while (i < n) {
      const c = s[i], start = i;
      if (/[ \t\r\n]/.test(c)) {
        while (i < n && /[ \t\r\n]/.test(s[i])) i++;
        tokens.push({ t: 'ws', v: s.slice(start, i) });
        continue;
      }
      if (c === '-' && s[i + 1] === '-') {
        const e = s.indexOf('\n', i);
        i = e < 0 ? n : e;
        tokens.push({ t: 'lineComment', v: s.slice(start, i) });
        continue;
      }
      if (c === '/' && s[i + 1] === '*') {
        let depth = 0;
        while (i < n) {
          if (s[i] === '/' && s[i + 1] === '*') { depth++; i += 2; }
          else if (s[i] === '*' && s[i + 1] === '/') { depth--; i += 2; if (depth === 0) break; }
          else i++;
        }
        if (depth !== 0) return { ok: false, error: 'ブロックコメントが閉じていません', line: lineAt(start) };
        tokens.push({ t: 'blockComment', v: s.slice(start, i) });
        continue;
      }
      // '…'（'' で ' を表す） / E'…'（\' も可）
      if (c === "'" || ((c === 'E' || c === 'e') && s[i + 1] === "'")) {
        const esc = c !== "'";
        i += esc ? 2 : 1;
        let closed = false;
        while (i < n) {
          if (esc && s[i] === '\\') { i += 2; continue; }
          if (s[i] === "'") {
            if (s[i + 1] === "'") { i += 2; continue; }
            i++; closed = true; break;
          }
          i++;
        }
        if (!closed) return { ok: false, error: '文字列リテラルが閉じていません', line: lineAt(start) };
        tokens.push({ t: 'str', v: s.slice(start, i) });
        continue;
      }
      if (c === '"') {
        i++;
        let closed = false;
        while (i < n) {
          if (s[i] === '"') {
            if (s[i + 1] === '"') { i += 2; continue; }
            i++; closed = true; break;
          }
          i++;
        }
        if (!closed) return { ok: false, error: '引用識別子が閉じていません', line: lineAt(start) };
        tokens.push({ t: 'dq', v: s.slice(start, i) });
        continue;
      }
      // $tag$ … $tag$（タグ完全一致。異なるタグで入れ子可能）
      if (c === '$') {
        const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i));
        if (m) {
          const tag = m[0];
          const e = s.indexOf(tag, i + tag.length);
          if (e < 0) return { ok: false, error: 'ドル引用符が閉じていません', line: lineAt(start) };
          i = e + tag.length;
          tokens.push({ t: 'dollar', v: s.slice(start, i) });
          continue;
        }
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(s.slice(i));
        i += m[0].length;
        tokens.push({ t: 'num', v: m[0] });
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(s.slice(i));
        i += m[0].length;
        tokens.push({ t: 'word', v: m[0] });
        continue;
      }
      const two = PUNCT2.find(p => s.startsWith(p, i));
      if (two) { i += two.length; tokens.push({ t: 'punct', v: two }); continue; }
      i++;
      tokens.push({ t: 'punct', v: c });
    }
    return { ok: true, tokens };
  }


  window.SqlLex = { tokenize: tokenize, PUNCT2: PUNCT2 };
})();
