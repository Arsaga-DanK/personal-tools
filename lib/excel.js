'use strict';
/* lib/excel.js — Excel 貼り付け（text/html）の共通核。classic script、window.ToolExcel を公開。
   目的: 「2版持つと片方だけ直る事故が起きる」ものだけを持つ（lib/sql.js と同じ基準）:

   ① copy(html, text): text/html + text/plain の二重フレーバー書き込み。
      **execCommand 方式を必ず先行させる** — Chrome の navigator.clipboard.write は
      HTML をサニタイズし、mso-data-placement（セル内改行の維持）や mso-number-format
      （文字列化ガード）が落ちる。execCommand が失敗したときだけ ClipboardItem を試し、
      どちらも不可なら reject（呼び出し側が平文コピーへのフォールバックを持つ）。
   ② cellStyle(value, opts): 罫線・ヘッダー背景・揃え・文字列化ガードを1つの style 文字列に。
      opts = { header?: boolean, align?: 'left'|'center'|'right'|'none' }
   ③ MANGLE_RES: Excel が貼り付け時に値を変えてしまうパターン（**正本はここ1箇所**。
      仕様の記述は docs/specs/excel2md.md の 4b）。

   表の組み立て（th/td・rowspan・エスケープ）は各ツールに残す — モデルがツールごとに
   違い、共通化すると引数が肥大するため（ui.js の「引数の吸収はラッパに残す」と同じ判断）。 */
(function (global) {
  // Excel が貼り付け時に値を変えてしまうパターン。該当セルだけ mso-number-format:'\@'
  // （文字列書式）で守る。該当しない数値は数値のまま貼る — 全セル文字列化は
  // Excel 側の集計を壊すためしない（E2M-F02 / F03）
  const MANGLE_RES = [
    /^\d{1,4}[-/]\d{1,2}([-/]\d{1,4})?$/,  // 日付化（1-2 → 2月1日）
    /^\d{1,2}:\d{2}(:\d{2})?$/,            // 時刻化（1:30 → 0.0625）
    /^0\d+$/,                              // 先頭ゼロ落ち（0123 → 123）
    /^\d{12,}$/,                           // 指数表記（12桁〜。15桁超は精度も落ちる）
    /^[=+@]/,                              // 数式として解釈（=SUM(A1) 等。負数 -1 は対象外）
    /^-?\d+\.\d*0$/,                       // 末尾ゼロの小数（0.00 → 0。ddl2spec の既定値が実例）
  ];

  function cellStyle(value, opts) {
    const o = opts || {};
    let style = 'border:.5pt solid #a6a6a6';           // 貼り付けで罫線になる
    if (o.header) style += ';background:#d9d9d9';
    if (o.align && o.align !== 'none') style += ';text-align:' + o.align;
    if (MANGLE_RES.some(re => re.test(value))) style += ";mso-number-format:'\\@'";
    return style;
  }

  // copy イベントを横取りして任意 MIME を書き込む execCommand 方式
  function execCopy(fill) {
    const handler = e => { e.preventDefault(); fill(e.clipboardData); };
    document.addEventListener('copy', handler, { capture: true });
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    document.removeEventListener('copy', handler, { capture: true });
    return ok;
  }

  function copy(html, text) {
    const ok = execCopy(dt => {
      dt.setData('text/html', html);
      dt.setData('text/plain', text);
    });
    if (ok) return Promise.resolve();
    if (navigator.clipboard && global.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
    }
    return Promise.reject(new Error('clipboard unavailable'));
  }

  global.ToolExcel = { copy, cellStyle, MANGLE_RES };
})(window);
