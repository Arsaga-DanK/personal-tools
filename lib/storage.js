/* lib/storage.js — 全ブラウザツール共通の保存層。classic script、window.ToolStorage を公開。
   保存キーは tools:<toolName> で統一。保存値は {v:1, tool, savedAt, data} エンベロープ。
   file:// では全ローカルページが localStorage を共有するため、キー接頭辞が衝突防止を担う。
   save() の失敗（quota 超過など）は共通核が error バナーで可視化する（DEV-50）。 */
(function () {
  'use strict';

  var KEY_PREFIX = 'tools:';

  // 可用性 = localStorage プロパティアクセスの成否のみ。
  // （アクセス自体が SecurityError を投げる環境がある。quota 超過は「不可用」ではなく
  //   save() が都度 false を返す — 満杯でも既存データの読み取りは有効なため）
  var storage = null;
  var accessOk = false;
  try {
    storage = window.localStorage;
    accessOk = !!storage;
  } catch (_) {
    storage = null;
    accessOk = false;
  }

  function key(toolName) { return KEY_PREFIX + toolName; }

  function makeEnvelope(toolName, data) {
    return { v: 1, tool: toolName, savedAt: new Date().toISOString(), data: data };
  }

  // 保存失敗の可視化（DEV-50）。どのツールも save() の戻り値を見ていないため、
  // quota 超過などの失敗はここで error バナーにする。保存が成功したら自動で消す。
  // storage 不可用（アクセス自体が不可）の環境は mountWarning が初期化時に伝えるので対象外
  var SAVE_ERROR_ID = 'toolstorage-save-error';

  function showSaveError() {
    var div = document.getElementById(SAVE_ERROR_ID);
    if (!div) {
      var host = document.querySelector('main') || document.body;
      if (!host) return;
      div = document.createElement('div');
      div.id = SAVE_ERROR_ID;
      host.insertBefore(div, host.firstChild);
    }
    // class と role は lib/ui.js が持つ規約に従う（このファイルは ui.js の後に読む）
    window.ToolUI.banner(div, 'error',
      '自動保存に失敗しました（ストレージの容量超過など）。次の変更時に再試行します。');
  }

  function hideSaveError() {
    var div = document.getElementById(SAVE_ERROR_ID);
    if (div) div.hidden = true;
  }

  function save(toolName, data) {
    if (!storage) return false;
    try {
      storage.setItem(key(toolName), JSON.stringify(makeEnvelope(toolName, data)));
      hideSaveError(); // 復旧したら消す（次の save が成功した時点で嘘のバナーにしない）
      return true;
    } catch (_) {
      showSaveError();
      return false; // quota 超過・シリアライズ不能など。戻り値でも判断できる
    }
  }

  function load(toolName) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(key(toolName));
      if (raw === null) return null;
      var env = JSON.parse(raw);
      if (!env || typeof env !== 'object' || env.v !== 1 || env.tool !== toolName) {
        console.warn('ToolStorage: ' + key(toolName) + ' の保存形式が不正なため無視します');
        return null;
      }
      return env.data === undefined ? null : env.data;
    } catch (e) {
      console.warn('ToolStorage: ' + key(toolName) + ' の読み込みに失敗しました', e);
      return null;
    }
  }

  // data 省略時は保存済みデータをエクスポート。storage 不可環境でもツールが
  // メモリ上の状態を data 引数で渡せばエクスポート可能。
  function exportJson(toolName, data) {
    try {
      var payload = data !== undefined ? data : load(toolName);
      if (payload === null || payload === undefined) return false;
      var env = makeEnvelope(toolName, payload);
      var blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      var ymd = String(d.getFullYear()) +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');
      a.href = url;
      a.download = 'tools-' + toolName + '-' + ymd + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 即時 revoke は WebKit/Gecko でダウンロード開始と競合するため遅延させる
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (_) {
      return false;
    }
  }

  // 復元は全置換（マージしない）。done(errMessage|null, data)。
  // storage 不可環境でも done に data を返すので、ツール側はそこから再描画できる。
  function importJson(toolName, file, done) {
    if (typeof done !== 'function') done = function () {};
    if (!file) { done('ファイルが選択されていません', null); return; }
    var reader = new FileReader();
    reader.onerror = function () { done('ファイルを読み込めませんでした', null); };
    reader.onload = function () {
      var env;
      try {
        env = JSON.parse(String(reader.result));
      } catch (_) {
        done('JSONとして読み込めませんでした', null);
        return;
      }
      if (!env || typeof env !== 'object' || env.v !== 1) {
        done('保存形式の版が不明なファイルです', null);
        return;
      }
      if (env.tool !== toolName) {
        done('別ツールのエクスポートファイルです（' + String(env.tool) + '）', null);
        return;
      }
      save(toolName, env.data); // 保存は best-effort（不可環境では false になるだけ）
      done(null, env.data);
    };
    try {
      reader.readAsText(file);
    } catch (_) {
      done('ファイルを読み込めませんでした', null);
    }
  }

  var WARNING_ID = 'toolstorage-warning';

  // 不可用時のみ警告バナーを挿入する。冪等・ロード後いつでも呼べる。
  // available は呼び出し時点の ToolStorage.available を見る（テストで強制可能にするため）。
  function mountWarning(container) {
    if (window.ToolStorage.available) return;
    if (document.getElementById(WARNING_ID)) return;
    var host = container || document.querySelector('main') || document.body;
    if (!host) return;
    var div = document.createElement('div');
    div.id = WARNING_ID;
    // class と role は lib/ui.js が持つ規約に従う（**このファイルは ui.js の後に読む**）
    window.ToolUI.banner(div, 'warn',
      'この環境では設定を保存できません（ブラウザの制限）。エクスポート／インポートで代替できます。');
    host.insertBefore(div, host.firstChild);
  }

  window.ToolStorage = {
    available: accessOk,
    save: save,
    load: load,
    exportJson: exportJson,
    importJson: importJson,
    mountWarning: mountWarning,
  };
})();
