/* lib/storage.js — 全ブラウザツール共通の保存層。classic script、window.ToolStorage を公開。
   保存キーは tools:<toolName> で統一。保存値は {v:1, tool, savedAt, data} エンベロープ。
   file:// では全ローカルページが localStorage を共有するため、キー接頭辞が衝突防止を担う。 */
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

  function save(toolName, data) {
    if (!storage) return false;
    try {
      storage.setItem(key(toolName), JSON.stringify(makeEnvelope(toolName, data)));
      return true;
    } catch (_) {
      return false; // quota 超過・シリアライズ不能など。呼び出し側は戻り値で判断
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
    div.className = 'banner banner-warn';
    div.textContent = 'この環境では設定を保存できません（ブラウザの制限）。エクスポート／インポートで代替できます。';
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
