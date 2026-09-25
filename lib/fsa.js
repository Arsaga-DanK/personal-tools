'use strict';
/* lib/fsa.js — File System Access のハンドル永続化と権限確認（Check Issue / Plan Tasks で共有）
   目的: ①FileSystemHandle を IndexedDB に覚える（structured clone が要るので localStorage には置けない）
        ②queryPermission → requestPermission の順で権限を確保する
        ③API の有無を1箇所で判定する
   入力: なし
   出力: window.ToolFsa = { handles(dbName), ensurePermission(handle, mode), available(kind) }
   例:   const handles = ToolFsa.handles('tools-taskboard');   // db 名はツールごと（file:// は全ページ同一オリジン）
         await handles.set('tasksmd', fileHandle);  const h = await handles.get('tasksmd');
         if (await ToolFsa.ensurePermission(h)) { … }          // 既定は readwrite
         if (!ToolFsa.available('dir')) { … }                   // 'dir' = showDirectoryPicker / 'file' = showOpenFilePicker

   2026-09-25 に issue.html と taskboard.html でバイト一致していた 30 行を寄せた
   （設計: docs/audits/2026-09-25-structure.md §5）。
   **db 名・store 名（'handles'）・version 1 は元のまま** — 変えると利用者のブラウザに残っている
   ハンドルが見えなくなり、tasks.md や 04_Issues を選び直すことになる（TB-FS1 が db 名をピンする）。
   ensurePermission は query / request が例外を投げても false を返す（taskboard の verifyPermission と同じ。
   issue 側は従来 例外をそのまま投げていたが「選び直させる」に倒した — IS spec「保存」）。
   vaultlint は「検査は read・修復時だけ readwrite」の二段階権限で構造が違うので使わない。 */
(function (global) {
  'use strict';
  var STORE = 'handles';

  function open(dbName) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  // 1つの db に対する get / set。呼び出しごとに開いて閉じる（従来どおり。開きっぱなしにしない）
  function handles(dbName) {
    return {
      get: async function (key) {
        var db = await open(dbName);
        try {
          return await new Promise(function (res, rej) {
            var g = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            g.onsuccess = function () { res(g.result); };
            g.onerror = function () { rej(g.error); };
          });
        } finally { db.close(); }
      },
      set: async function (key, val) {
        var db = await open(dbName);
        try {
          await new Promise(function (res, rej) {
            var tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(val, key);
            tx.oncomplete = res;
            tx.onerror = function () { rej(tx.error); };
          });
        } finally { db.close(); }
      },
    };
  }

  async function ensurePermission(handle, mode) {
    var opt = { mode: mode || 'readwrite' };
    try {
      if (await handle.queryPermission(opt) === 'granted') return true;
      return (await handle.requestPermission(opt)) === 'granted';
    } catch (_) { return false; }
  }

  function available(kind) {
    return typeof global[kind === 'dir' ? 'showDirectoryPicker' : 'showOpenFilePicker'] === 'function';
  }

  global.ToolFsa = { handles: handles, ensurePermission: ensurePermission, available: available };
})(window);
