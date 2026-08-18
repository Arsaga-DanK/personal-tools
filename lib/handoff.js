'use strict';
/* lib/handoff.js — ツール間の受け渡し（2026-08-18・第一号: Plan Tasks → Draw Gantt）
   目的: 「コピーして別のツールを開いて貼る」を1クリックにする
   入力: なし（呼び出し側が文字列を渡す）
   出力: window.ToolHandoff = { send(to, kind, text, path), take(me), peek(me) }
   例:   ToolHandoff.send('gantt', 'plan', tsv, '../web/gantt.html');   // 渡す側
         const h = ToolHandoff.take('gantt');                          // 受ける側（起動時に1回）

   規約（coding-rules「ツール間の受け渡し」が正本）:
   - **一時バッファであって正本ではない**。だから localStorage ではなく sessionStorage
     （タブを閉じたら消える）。正本は渡し元（tasks.md 等）のまま
   - **取り出したら消す**（consume）— 戻ってくるたびに古いデータが再挿入されるのを防ぐ
   - 受け側は**取り込んだ時刻を画面に残す**（鮮度。古いスナップショットを新品として配らせない）
   - file:// は全ローカルページで1オリジンなので sessionStorage は共有される（実測）。
     **機密を置く場所ではない** — 渡すのは利用者がその場で見ている表だけ */
(function (global) {
  const KEY = 'tools:handoff';

  function read() {
    try {
      const raw = global.sessionStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      // 型ガード（手書きの残骸・別バージョンで壊れない）
      if (!d || typeof d.to !== 'string' || typeof d.text !== 'string') return null;
      return d;
    } catch (_) {
      return null;   // sessionStorage が使えない環境では受け渡しを黙って諦める
    }
  }

  // 渡す: 書いてから遷移する（同期的に書けるので遷移と競合しない）
  function send(to, kind, text, path) {
    try {
      global.sessionStorage.setItem(KEY, JSON.stringify({
        to, kind: kind || null, text: String(text == null ? '' : text), at: Date.now(),
      }));
    } catch (_) { /* 書けなくても遷移はする（相手は空で開く） */ }
    if (path) global.location.href = path;
  }

  // 受ける: 自分宛なら取り出して**消す**
  function take(me) {
    const d = read();
    if (!d || d.to !== me) return null;
    try { global.sessionStorage.removeItem(KEY); } catch (_) { /* 消せなくても続行 */ }
    return d;
  }

  // 消さずに覗く（テスト・分岐判定用）
  function peek(me) {
    const d = read();
    return d && d.to === me ? d : null;
  }

  global.ToolHandoff = { send, take, peek, KEY };
})(window);
