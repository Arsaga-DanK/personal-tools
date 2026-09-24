/* lib/tools.js — 全ツールの登録簿（TOOLS / CATEGORY_ORDER）。classic script、window.ToolsList を公開。

   **2026-09-24 に index.html から移設した。** 理由: ハブだけでなく各ツールの
   引き出しメニュー（lib/launcher.js）からも同じ一覧が要るようになったため
   （利用者「毎回 TOP に戻ってツールを選び直すのめんどくさいからサイドメニュー作れない？」）。
   **この配列が一覧の唯一の正本**で、index.html も launcher もここを読む。

   path は **index.html からの相対**で書く（従来どおり）。web/ 配下のページから使うときは
   lib/launcher.js が `web/` を剥がして解決するので、ここでは書き分けない。 */
(function (global) {
  'use strict';

  // ツール登録: 1行追加するだけで一覧に載る。
  // スキーマ: { name: 表示名（動詞＋名詞の英語2語）, alias: 英名, path: index.html からの相対パス,
  //            desc: 1行説明, category: タスク|変換・比較|設計|発想|画像|整理|PM,
  //            when: いつ使うかの一言（省略可） }
  // 配列の順序が同一カテゴリ内の表示順になる。最も使うものを先頭に置く
  // name だけで何をするツールか分かるようにする（ブックマーク・タブ・履歴では desc が消えて
  // 名前しか残らない）。規約の正本は CLAUDE.md「命名規約」
  //
  // **画面に出るのは icon / name / short の3つだけ**（2026-08-18）。
  // 経緯: 16本で縦2.3画面になり探すのが面倒 → 名前だけのチップにしたら「使いにくい・説明が無いと
  // 分かりにくい」（利用者）→ **カード＋一言**に落ち着いた。
  // - short: カードに出す一言（全角12〜18字が目安。長いと2行で崩れる）
  // - desc / when: **画面には出さない**が title（マウスオーバー）と検索に効く。
  //   したがって desc は**短くしない** — 機能名・別名を盛り込むほど検索で辿り着ける（HUB-11 参照）
  // - icon: カードの目印。**各ツールの favicon と同じ絵文字**を基本にするが、
  //   U+FE0F（異体字セレクタ）が要るもの（board / doc2xl / devpad の favicon）は
  //   文字ゲートに掛かるので、単独で絵文字として出る字に置換する。
  //   重複する絵文字も避ける（favicon では excel2md と gantt が同じで目印にならない）。
  //   **このコメントに実物の絵文字を貼らないこと** — 貼った瞬間に自分がゲートの検出対象になる
  // alias はファイル名・spec 名・localStorage キー・window フックと同じ英小文字名で、
  // 画面には出さず検索にだけ効かせる（過去のメモは英名で書かれている）
  const TOOLS = [
    { name: 'Plan Tasks', alias: 'taskboard', path: 'web/taskboard.html', icon: '✅', short: 'tasks.md を表で編集', desc: 'vault の tasks.md（正本）を表形式で閲覧・編集 — 完了・開始日・期限・優先度、計画ビュー（タイムライン）、Excel用コピー', category: 'タスク', when: '朝の計画と期限付け・週次の棚卸し・大きなタスクの期間管理・Excel報告への転記' },
    { name: 'Check Issue', alias: 'issue', path: 'web/issue.html', icon: '🎯', short: '論点を立ててノートにする', desc: '論点（イシュー）を立ててノートにする — 1問ずつ答えるウィザードで マイルストーン→論点→不明点→リスク→次の一手 を埋め、作業テーマ・WHY始まり・締切なし・比較の形を判定して 04_Issues にノートを作成（貼った文章の点検にも使える）', category: 'タスク', when: '定例や依頼の直後に「で、答えを出すべき問いは何か」を一行にするとき／手が止まって悩みはじめたとき' },
    { name: 'Convert Table', alias: 'excel2md', path: 'web/excel2md.html', icon: '📊', short: 'Excel の表 ⇔ Markdown', desc: 'Excelのセル範囲（TSV）⇔ Markdownテーブル 双方向変換 — 結合セルの展開・表プレビュー上で列の揃え指定', category: '変換・比較', when: 'Excel の表を設計書や議事録の Markdown に貼るとき／その逆' },
    { name: 'Convert Data', alias: 'devpad', path: 'web/devpad.html', icon: '🔧', short: 'JSON・SQL 整形ほか11種', desc: '開発ユーティリティ集 — JSON・XML・SQL の整形・エスケープ・URL・Base64・正規表現・基数変換・Unix時刻・UUID・文字数カウント', category: '変換・比較', when: 'API レスポンスの整形・エンコード・時刻変換・正規表現の動作確認をその場で済ませたいとき' },
    { name: 'Normalize Text', alias: 'norm', path: 'web/norm.html', icon: '🔤', short: '表記ゆれを正規化', desc: '日本語表記の正規化（全角半角・ハイフン・波ダッシュ・空白・NFKC）変更箇所ハイライト付き', category: '変換・比較', when: '顧客提供テキストや仕様書の表記ゆれを揃えるとき' },
    { name: 'Compare Text', alias: 'diff', path: 'web/diff.html', icon: '🔍', short: '2つの文章の差分', desc: 'テキスト比較 — 行単位差分＋文字単位ハイライト、空白無視・全半角同一視オプション', category: '変換・比較', when: '文言修正の前後比較や設計記述の突き合わせ' },
    { name: 'Unify Terms', alias: 'terms', path: 'web/terms.html', icon: '📖', short: '用語統一表を一括適用', desc: '用語統一表（変換前→変換後）を原稿へ一括適用 — 同時置換・長い語優先、ルール別件数と未適用の表示', category: '変換・比較', when: '顧客の用語集・表記ルールに原稿を合わせるとき' },
    { name: 'Fill Template', alias: 'fill', path: 'web/fill.html', icon: '📝', short: '定型文の穴埋め', desc: '定型文テンプレの差し込み — 本文の {{変数}} から入力フォームを自動生成、埋めて完成文をコピー（{{今日}} は日付を自動セット）', category: '変換・比較', when: '日報・週報・議事録の送付文・依頼文など、毎回少しだけ変わる定型連絡を作るとき' },
    { name: 'Document Schema', alias: 'ddl2spec', path: 'web/ddl2spec.html', icon: '📋', short: 'DDL ⇔ テーブル定義書', desc: 'PostgreSQL の DDL（CREATE TABLE ＋ COMMENT ON）⇔ テーブル定義書（Markdown表）双方向変換 — 論理名・複合キー・FK・CHECK・Excel用コピー', category: '設計', when: '既存 DDL から定義書を起こすとき／定義書から DDL を作るとき（正本は DDL 側）' },
    { name: 'Export Outline', alias: 'doc2xl', path: 'web/doc2xl.html', icon: '📤', short: '見出し → Excel 階層表', desc: 'Markdown 文書の見出し階層 → Excel 用の階層表（大項目/中項目/小項目＋内容）— Markdown表・TSV 出力', category: '設計', when: '設計書を Markdown で下書きして、納品時に Excel の階層表へ移すとき' },
    { name: 'Draw Diagram', alias: 'diagram', path: 'web/diagram.html', icon: '📈', short: 'テキスト → フロー図', desc: 'テキストから図を描く（mermaid 同梱・オフライン）— フローチャート・シーケンス図・状態遷移図を書いて PNG コピー/SVG 保存', category: '設計', when: 'draw.io を開くほどでもない図を資料や Teams に貼るとき' },
    { name: 'Draw Mindmap', alias: 'mindmap', path: 'web/mindmap.html', icon: '🧠', short: '箇条書き → マインドマップ', desc: '箇条書き → マインドマップ描画（mermaid 同梱）— 1行目が中心テーマ・タブで階層。PNG コピー/テキストはそのままノートへ', category: '発想', when: 'ブレインストーミングや打ち合わせ前の論点洗い出しに' },
    { name: 'Sort Ideas', alias: 'board', path: 'web/board.html', icon: '🧩', short: '付箋を並べて発想をまとめる', desc: '付箋ボード — ダブルクリックで付箋を置いて直接入力・ドラッグで並べ・色で分け・線で結ぶ → md アウトライン書き出し/PNG コピー', category: '発想', when: 'ブレインストーミングで出した発想を、並べて・まとめて・ノートに持ち帰るとき' },
    { name: 'Mask Image', alias: 'mask', path: 'web/mask.html', icon: '🫥', short: 'スクショの目隠しと注釈', desc: 'スクショのマスキングと注釈 — 貼り付け → モザイク/黒塗り/白塗り・枠・矢印・テキスト・番号スタンプ・切り抜き → PNG コピー（画像は保存しない）', category: '画像', when: 'スクショを Teams・設計書に貼る前の機密隠しと説明入れ' },
    { name: 'Check Vault', alias: 'vaultlint', path: 'web/vaultlint.html', icon: '🧹', short: 'vault のリンク切れ点検', desc: 'Obsidian vault の健全性チェック — リンク切れ・添付消失・ファイル名の罠・Inbox のデイリーを検出し、承認した修復（テキスト化・リネーム追随・アーカイブ移動）まで実行（Chrome 限定）', category: '整理', when: 'vault の棚卸しと掃除に。設定した非公開フォルダは読み込まない・実行前に git コミット' },
    { name: 'Calc Dates', alias: 'dates', path: 'web/dates.html', icon: '📅', short: '営業日・和暦・工数の計算', desc: '日付・営業日・工数の計算 — N営業日後・期限の逆算・期間の営業日数・和暦/年度・人日⇄時間⇄人月換算（祝日2020〜2027年を同梱）', category: 'PM', when: '納期やレビュー期限の逆算と、見積の工数換算に' },
    { name: 'Draw Gantt', alias: 'gantt', path: 'web/gantt.html', icon: '⏳', short: '表 → ガントチャート画像', desc: 'タスクと期間の表 → ガントチャート画像（PNG コピー・mermaid 同梱）— 管理はしない・資料貼り付け用', category: 'PM', when: 'スケジュール感を資料や Teams でさっと共有したいとき' },
  ];

  // カテゴリの表示順。最も使う「タスク」を先頭に置く。
  // 「変換・比較」は Diff が変換ではなく比較のため（英語にすると Convert ツールと衝突する）
  const CATEGORY_ORDER = ['タスク', '変換・比較', '設計', '発想', '画像', '整理', 'PM'];

  // 検索: 表示名＋英名（alias）＋一言＋説明＋用途（when）＋カテゴリの部分一致（大文字小文字無視）。
  // **ハブと引き出しメニューが同じ関数を通る**（片方だけ賢い、を作らない）
  function filter(query) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    if (q === '') return TOOLS.slice();
    return TOOLS.filter(function (t) {
      return t.name.toLowerCase().indexOf(q) >= 0
        || (t.alias || '').toLowerCase().indexOf(q) >= 0
        || (t.short || '').toLowerCase().indexOf(q) >= 0
        || t.desc.toLowerCase().indexOf(q) >= 0
        || (t.when || '').toLowerCase().indexOf(q) >= 0
        || (t.category || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  /* 「最近使った」（ハブの `tools:hub`）。**ハブからも引き出しメニューからも同じ形で書く** —
     片方からしか記録されないと、導線を変えた瞬間に履歴が死ぬ。
     ToolStorage が無いページ（mask.html）でも落ちないよう毎回ガードする */
  var RECENT_MAX = 5;
  function recent() {
    var d = global.ToolStorage ? global.ToolStorage.load('hub') : null;
    var list = (d && Array.isArray(d.recent)) ? d.recent : [];
    return list.filter(function (a) {
      return typeof a === 'string' && TOOLS.some(function (t) { return t.alias === a; });
    }).slice(0, RECENT_MAX);
  }
  function recordUse(alias) {
    if (!TOOLS.some(function (t) { return t.alias === alias; })) return recent();
    var next = [alias].concat(recent().filter(function (a) { return a !== alias; })).slice(0, RECENT_MAX);
    if (global.ToolStorage) global.ToolStorage.save('hub', { recent: next });
    return next;
  }

  /* パス解決: TOOLS の path は index.html 基準。web/ 配下のページからは `web/` を剥がす。
     **file:// でも https でも同じ結果になるよう location.pathname だけで判定する**
     （絶対パスをコードに書かない — CLAUDE.md） */
  function inWeb() { return /\/web\/[^/]*$/.test(global.location.pathname); }
  function hrefFor(path) { return inWeb() ? String(path).replace(/^web\//, '') : String(path); }
  function hubHref() { return inWeb() ? '../index.html' : 'index.html'; }
  function currentAlias() {
    var file = String(global.location.pathname).split('/').pop();
    var hit = TOOLS.filter(function (t) { return t.path.split('/').pop() === file; })[0];
    return hit ? hit.alias : '';
  }

  global.ToolsList = {
    TOOLS: TOOLS, CATEGORY_ORDER: CATEGORY_ORDER, RECENT_MAX: RECENT_MAX,
    filter: filter, recent: recent, recordUse: recordUse,
    inWeb: inWeb, hrefFor: hrefFor, hubHref: hubHref, currentAlias: currentAlias,
  };
})(window);
