'use strict';
/* lib/edit.js — テキスト入力の「書きやすさ」共通部品
   目的: ①textarea の Tab をインデントに使う（ブラウザのフォーカス移動に奪わせない）
        ②Ctrl/Cmd+; で今日の日付を入れる（Excel の慣習）
   入力: なし（DOM 要素を引数で受け取る）
   出力: window.ToolEdit = { tabIndent(textarea), mountTodayShortcut(), today() }
   例:   ToolEdit.tabIndent(el('input'));
         ToolEdit.mountTodayShortcut();   // ページに1回

   規約（coding-rules「UI の標準形」）:
   - Tab = インデント・Shift+Tab = 戻す・**Esc 直後の Tab はフォーカス移動**（脱出経路 —
     キーボード操作を閉じ込めない。CodeMirror 等の作法）
   - IME 変換中（isComposing / keyCode 229）のキーは奪わない
   - 値を変えたら input イベントを発火する（各ツールの再描画・自動保存に乗せる） */
(function (global) {
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function tabIndent(ta) {
    let escapeNext = false;   // Esc の直後の Tab はブラウザに返す
    ta.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { escapeNext = true; return; }
      if (e.key !== 'Tab') { escapeNext = false; return; }
      if (escapeNext) { escapeNext = false; return; }
      e.preventDefault();
      const v = ta.value;
      const s = ta.selectionStart, en = ta.selectionEnd;
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

  global.ToolEdit = { tabIndent, mountTodayShortcut, today };
})(window);
