'use strict';
/* lib/edit.js — テキスト入力の「書きやすさ」共通部品
   目的: ①textarea の Tab をインデントに使う（ブラウザのフォーカス移動に奪わせない）
        ②Ctrl/Cmd+; で今日の日付を入れる（Excel の慣習）
        ③md の箇条書きを書きやすくする（`{mdList:true}` のときだけ — 2026-08-18）
   入力: なし（DOM 要素を引数で受け取る）
   出力: window.ToolEdit = { tabIndent(textarea, opts), mountTodayShortcut(), today(), addDays(ymd, n), dateChips(input),
                             listItem(line), renumber(lines, idx) }
   例:   ToolEdit.tabIndent(el('input'));                    // 素の Tab インデント
         ToolEdit.tabIndent(el('input'), { mdList: true });  // ＋ md リストの補助
         ToolEdit.mountTodayShortcut();   // ページに1回

   規約（coding-rules「UI の標準形」）:
   - Tab = インデント・Shift+Tab = 戻す・**Esc 直後の Tab はフォーカス移動**（脱出経路 —
     キーボード操作を閉じ込めない。CodeMirror 等の作法）
   - IME 変換中（isComposing / keyCode 229）のキーは奪わない
   - 値を変えたら input イベントを発火する（各ツールの再描画・自動保存に乗せる）

   **md リスト補助を有効にするのは md を書く欄だけ**（mindmap / gantt / doc2xl）。
   JSON・SQL・DDL・TSV の欄で Enter の挙動を変えると事故になるため、既定は off。
   有効でも**箇条書きの行にいるときしか**振る舞いは変わらない（他の行は従来どおり）: */
(function (global) {
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------- md の箇条書き（純関数） ---------- */

  // 1行が箇条書きなら { indent, marker, num, ordered, box, body }、違えば null
  const LIST_RE = /^([\t ]*)(?:([-*+])|(\d+)([.)]))[ \t]+(\[[ xX\-/]\][ \t]+)?(.*)$/;
  function listItem(line) {
    const m = LIST_RE.exec(String(line == null ? '' : line));
    if (!m) return null;
    return {
      indent: m[1],
      marker: m[2] || '',
      num: m[3] ? parseInt(m[3], 10) : null,
      delim: m[4] || '',
      box: m[5] || '',
      body: m[6],
    };
  }

  // 番号つきリストの番号を、同じ字下げの直前の項目から決める（1つ上が無ければ 1）
  function renumber(lines, idx) {
    const it = listItem(lines[idx]);
    if (!it || it.num === null) return lines[idx];
    let n = 1;
    for (let i = idx - 1; i >= 0; i--) {
      const prev = listItem(lines[i]);
      if (!prev) {
        if (String(lines[i]).trim() === '') continue;   // 空行はまたぐ
        break;
      }
      if (prev.indent.length > it.indent.length) continue;      // 子は飛ばす
      if (prev.indent.length < it.indent.length) break;         // 親に出たら先頭
      if (prev.num === null) break;                             // 記号リストに変わったら先頭
      n = prev.num + 1;
      break;
    }
    return it.indent + n + it.delim + ' ' + it.box + it.body;
  }

  // 行頭から1段戻す（タブ1個、無ければスペース最大2個）
  function outdentOnce(indent) {
    return indent.startsWith('\t') ? indent.slice(1) : indent.replace(/^ {1,2}/, '');
  }

  function tabIndent(ta, opts) {
    const mdList = !!(opts && opts.mdList);
    let escapeNext = false;   // Esc の直後の Tab はブラウザに返す

    // キャレットのある行の範囲
    const lineRange = () => {
      const v = ta.value, s = ta.selectionStart;
      const start = v.lastIndexOf('\n', s - 1) + 1;
      const nl = v.indexOf('\n', s);
      return { start, end: nl === -1 ? v.length : nl };
    };

    // 行を書き換えてキャレットを保つ（差分ぶんだけ動かす）
    const replaceLine = (range, next) => {
      const v = ta.value, caret = ta.selectionStart;
      const delta = next.length - (range.end - range.start);
      ta.value = v.slice(0, range.start) + next + v.slice(range.end);
      const c = Math.max(range.start, caret + delta);
      ta.selectionStart = ta.selectionEnd = c;
      fireInput(ta);
    };

    ta.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;

      /* md リスト: Enter で次の項目を続ける（空の項目なら記号を外す） */
      if (mdList && e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
          && ta.selectionStart === ta.selectionEnd) {
        const range = lineRange();
        const line = ta.value.slice(range.start, range.end);
        const it = listItem(line);
        // キャレットが行末（＝続きを書く場面）のときだけ介入する
        if (it && ta.selectionStart === range.end) {
          e.preventDefault();
          if (it.body === '') {   // 空の項目 = リストを抜ける
            replaceLine(range, '');
            return;
          }
          const head = it.num === null
            ? it.indent + it.marker + ' '
            : it.indent + (it.num + 1) + it.delim + ' ';
          const box = it.box ? '[ ] ' : '';   // チェックは引き継がない（未処理で続ける）
          const ins = '\n' + head + box;
          const v = ta.value, s = ta.selectionStart;
          ta.value = v.slice(0, s) + ins + v.slice(s);
          ta.selectionStart = ta.selectionEnd = s + ins.length;
          fireInput(ta);
          return;
        }
      }

      if (e.key === 'Escape') { escapeNext = true; return; }
      if (e.key !== 'Tab') { escapeNext = false; return; }
      if (escapeNext) { escapeNext = false; return; }
      e.preventDefault();
      const v = ta.value;
      const s = ta.selectionStart, en = ta.selectionEnd;

      /* md リスト: 箇条書きの行では**行ごと**1段動かす（キャレット位置にタブを刺さない）。
         番号つきなら移動先の並びに合わせて振り直す */
      if (mdList && s === en) {
        const range = lineRange();
        const line = v.slice(range.start, range.end);
        const it = listItem(line);
        if (it) {
          const rest = line.slice(it.indent.length);
          const indent = e.shiftKey ? outdentOnce(it.indent) : it.indent + '\t';
          if (indent === it.indent) return;   // これ以上戻せない
          const lines = v.split('\n');
          const idx = v.slice(0, range.start).split('\n').length - 1;
          lines[idx] = indent + rest;
          lines[idx] = renumber(lines, idx);
          const next = lines[idx];
          replaceLine(range, next);
          return;
        }
      }

      if (!e.shiftKey && s === en) {
        // キャレット位置にタブ1文字
        ta.value = v.slice(0, s) + '\t' + v.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 1;
      } else {
        // 行単位のインデント/アウトデント（複数行選択 or Shift+Tab）
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const tail = en > s && v[en - 1] === '\n' ? en - 1 : en;
        const nl = v.indexOf('\n', tail);
        const blockEnd = nl === -1 ? v.length : nl;
        const lines = v.slice(lineStart, blockEnd).split('\n');
        const changed = e.shiftKey
          ? lines.map(l => (l.startsWith('\t') ? l.slice(1) : l.replace(/^ {1,2}/, '')))
          : lines.map(l => '\t' + l);
        const nb = changed.join('\n');
        ta.value = v.slice(0, lineStart) + nb + v.slice(blockEnd);
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + nb.length;
      }
      fireInput(ta);
    });
  }

  // Ctrl/Cmd+; — date input は今日をセット、textarea/テキスト系 input はキャレット挿入
  function mountTodayShortcut() {
    document.addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== ';') return;
      if (e.isComposing || e.keyCode === 229) return;
      const t = document.activeElement;
      if (!t || !t.tagName) return;
      if (t.tagName === 'INPUT' && t.type === 'date') {
        e.preventDefault();
        t.value = today();
        fireInput(t);
        t.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const isText = t.tagName === 'TEXTAREA'
        || (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search'));
      if (!isText) return;
      e.preventDefault();
      const v = t.value, s = t.selectionStart, en = t.selectionEnd;
      const ins = today();
      t.value = v.slice(0, s) + ins + v.slice(en);
      t.selectionStart = t.selectionEnd = s + ins.length;
      fireInput(t);
    });
  }

  /* 日付チップ（2026-09-24。利用者「TODO も ISSUES も日付を入力しにくすぎる」）。
     Chrome の date input は mm/dd/yyyy を段ごとに打つ必要があり、カレンダーの▼も小さい。
     **ボタンを増やさず**に済ませるため、チップは3つだけ: 今日 / +1 / +7。
     +N は**欄の今の値**からずらす（空なら今日から）。値を変えたら input と change を発火して
     再計算・記憶に乗せる（mountTodayShortcut と同じ流儀） */
  function addDays(ymd, n) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateChips(input, opts) {
    if (!input || input.dataset.chips === '1') return null;
    const o = opts || {};
    input.dataset.chips = '1';
    const wrap = document.createElement('span');
    wrap.className = 'date-chips';
    const defs = o.chips || [['今日', 0], ['+1', 1], ['+7', 7]];
    defs.forEach(([label, n]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'date-chip';
      b.textContent = label;
      b.title = n === 0 ? '今日にする' : n + '日後にずらす（欄が空なら今日から）';
      b.addEventListener('click', () => {
        input.value = n === 0 ? today() : addDays(input.value, n);
        fireInput(input);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      wrap.appendChild(b);
    });
    input.insertAdjacentElement('afterend', wrap);
    return wrap;
  }

  global.ToolEdit = { tabIndent, mountTodayShortcut, today, addDays, dateChips, listItem, renumber };
})(window);
