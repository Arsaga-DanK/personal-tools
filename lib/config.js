/* lib/config.js — 「利用者ごとに違う値」の保存層。classic script、window.ToolConfig を公開。
   保存は ToolStorage 経由（キー tools:config）なので、**lib/ui.js → lib/storage.js の後**に読む。

   なぜ localStorage なのか（file:// の制約）:
     このリポジトリはサーバーもビルドも持たないため、環境変数も .env も存在しない。
     gitignore した設定 js を <script src> で読む方式は、ファイル未配置のときに
     net::ERR_FILE_NOT_FOUND がコンソールに出て「コンソールエラー0件」の合否条件を壊す。
     結果、置き場は「コミット済みのデフォルト＋localStorage の上書き」しか残らない。
     localStorage の用途は従来「UI 状態とその場の入力」だけだったが、設定が第3の用途になる
     （docs/coding-rules.md「保存」節に規約として記載）。

   値の意味と既定:
     vaultName   ''   Obsidian の vault 名。空 = obsidian:// リンクを作らない
     privateDirs null 読み込まない非公開フォルダ名の配列。
                      **null（未設定）と [] （除外なしと決めた）は別物** —
                      未設定のまま vault を走査すると非公開ノートを読み込む事故になるため、
                      利用側は null のとき走査を開始してはならない（vaultlint が実装）
     inboxDir    ''   Inbox 棚卸しの対象フォルダ。空 = 棚卸ししない
     archiveDir  ''   棚卸しでデイリーを移す先。空 = 移動を提案しない */
(function () {
  'use strict';

  var TOOL = 'config';

  // 既定値。**利用者個人のフォルダ名を既定に置かない**（公開リポジトリのため。
  // 「私専用の仕様」が初期値として残ると、他人の環境では意味の無い値になる）
  var DEFAULTS = {
    vaultName: '',
    privateDirs: null,
    inboxDir: '',
    archiveDir: '',
  };

  var KEYS = Object.keys(DEFAULTS);

  // フォルダ名の正規化: 前後の空白と / を落とす（'/00_Inbox/' も '00_Inbox' も同じ意味にする）
  function normDir(v) {
    if (typeof v !== 'string') return '';
    return v.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  }

  // 「91_Private, Personal」→ ['91_Private','Personal']。空要素と重複は落とす。
  // 配列で渡された場合も同じ正規化を通す（テストからの直接投入用）
  function normDirList(v) {
    if (v === null || v === undefined) return null;
    var raw = Array.isArray(v) ? v : String(v).split(',');
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var d = normDir(String(raw[i]));
      if (d !== '' && out.indexOf(d) === -1) out.push(d);
    }
    return out;   // 空配列 = 「除外なし」と決めた状態。null（未設定）とは区別する
  }

  // キーごとの型・値域ガード（docs/coding-rules.md「保存」節）。未知値は既定へ倒す
  function coerce(key, v) {
    if (key === 'privateDirs') return normDirList(v);
    if (key === 'vaultName') return typeof v === 'string' ? v.trim() : DEFAULTS.vaultName;
    return normDir(v);   // inboxDir / archiveDir
  }

  function all() {
    var saved = window.ToolStorage ? window.ToolStorage.load(TOOL) : null;
    var out = {};
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      out[k] = (saved && Object.prototype.hasOwnProperty.call(saved, k))
        ? coerce(k, saved[k])
        : DEFAULTS[k];
    }
    return out;
  }

  function get(key) {
    return all()[key];
  }

  // 部分更新（渡したキーだけ差し替える）。戻り値は保存の成否
  function set(patch) {
    if (!patch || typeof patch !== 'object') return false;
    var next = all();
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = coerce(k, patch[k]);
    }
    return window.ToolStorage ? window.ToolStorage.save(TOOL, next) : false;
  }

  window.ToolConfig = {
    KEYS: KEYS,
    DEFAULTS: DEFAULTS,
    all: all,
    get: get,
    set: set,
    normDir: normDir,
    normDirList: normDirList,
  };
})();
