
# Personal Tools

業務効率化のための個人ツール群。**現在あるのはブラウザHTML（`web/` 11本）だけ**。
CLI（`bin/`）は形態として認めているが、まだ1本も無い（→「構成」）。

## このリポジトリでの作業原則

- 依頼された1ツールのみ実装する。改善案は実装せず、作業終了時に箇条書きで提案する
- 不明点は実装前に質問する。仕様を勝手に補完して進めない
- 新しいツールを作る前に `docs/tool-backlog.md` の着手ルールを確認する
- 大きめの計画は実装前に `~/Personal/vault/_prompts/plan-review.md` でセルフ監査する。
  **このファイルはリポジトリ外にあり、エディタから読めない場合がある。核心は次の4点**:
  ①記憶ではなく一次情報（公式ドキュメント・実際の出力・実行結果）で検証する
  ②各観点で最低2件の問題または懸念を挙げる（0件なら「なぜ0件か」を根拠付きで説明する）
  ③確信を持てていない箇所を正直に全部列挙する
  ④**監査中は実装・ファイル作成をしない**（報告のみ）
- 既存ツール（特に excel2md/excel2md.html＝旧 excel2md、独立リポジトリ）は依頼がない限り変更しない
- コミットは論理単位。メッセージは日本語1行

## 構成（2026-08-13 時点の実態）

```
index.html   ハブ。web/ツール一覧（内部のTOOLS配列に1行足すと追加される）
web/         ブラウザツール11本。1ツール=1HTML完結
lib/         web ツールの共通コード。ui.css / ui.js / storage.js / sql.js / excel.js
docs/        coding-rules.md（実装規約の正本）/ verification-notes.md（検証の罠）/
             ux-backlog.md / tool-backlog.md
docs/specs/  ツールごとの仕様書兼テストケース（11本）
test/        検証ハーネス（`./test/run [ツール名]`。書き方は test/README.md）
```

- **`bin/` と `dict/` は空**（CLI ツールと辞書はまだ1つも無い）。
  作るときは下の「CLI の制約」に従い `bin/` を使う。**空のまま構成表に並べない**
  （「CLI もある」と誤解して探す時間が生まれる）
- `excel2md/` は旧ツールの独立リポジトリ。**.gitignore 済みで追跡外**。
  `~/Personal/archive/` への移動は 2026-09 上旬の予定（→ `docs/ux-backlog.md`）
- `lib/` に CLI 用の共通コード（`common.zsh` 等）は**まだ無い**。CLI を作るときに置く

## 命名規約

- ツールの**表示名**は**短い英語1語**（領域を指すラベル。`Tasks` `Tables` `Convert`）。
  index.html の TOOLS の `name`、各ツールの `<h1>`、`<title>` の先頭に使う。
  **名前で説明しようとしない** — 説明は `desc` と `when`（ハブ）と `.subtitle`（ツール内）が担う
- **ファイル名・spec 名・localStorage キー（`tools:<name>`）・`window.<name>` フック・
  spec のテスト ID** は英小文字で、一度決めたら変更しない
  （テストと spec の参照が連動するため）
- `<title>` は「表示名 (英名)」（例: `Tables (excel2md)`）。
  表示名だけではファイル名が分からないため、識別子を括弧で添える。
  **表示名と英名が同じなら表示名のみ**（`Diff`。`Diff (diff)` は冗長）
- 英名は TOOLS の `alias` にも書く（画面には出さず検索にだけ効く。
  過去のメモやファイル名が英名で書かれているため）
- 現在の対応: Tasks=taskboard / Tables=excel2md / Convert=devpad / Text=norm / Diff=diff / Terms=terms /
  Schema=ddl2spec / Outline=doc2xl /
  Lint=vaultlint / Mask=mask / Dates=dates
- カテゴリ名は日本語のまま（英語にすると Convert ツールと同名になる。
  日本語=分類 / 英語=ツール名 の対比で階層が読みやすくなる）

## ブラウザツールの制約（web/）

**実装の横断規約（DOM・lib の使い分け・保存・文字・テスト作法）は `docs/coding-rules.md` が正本。**
ここには最重要の制約だけを残す:

- `file://` で開いて動作すること。これが全ての前提
- ES モジュール禁止（file:// で CORS エラーになる）。共有は `<script src>` か1枚完結
- **使用時にサーバー起動・ビルド・インストールが不要であること**（ダブルクリックで開くだけ）。
  外部 CDN・実行時のネットワーク禁止（オフライン完結）。
  **ライブラリの同梱（`lib/vendor/`）は可**（2026-08-14 に利用者が緩和 —
  「素の JS」は目的ではなく起動レスが目的。同梱の作法は coding-rules.md）
- 描画は `textContent` / `createElement` / `createElementNS` のみ。
  HTML 文字列の組み立て（`innerHTML` 等）は禁止。
  **SVG は `createElementNS` が必要**（`createElement('svg')` は HTMLUnknownElement になる）
- クリップボード書き込みは navigator.clipboard → 失敗時 textarea 選択方式にフォールバック。
  **`lib/ui.js` の `ToolUI.copy` / `ToolUI.banner` を使う**（バナーの class と role の規約、
  コピーのフォールバックと復帰表示はここが正本。ツール固有の引数はラッパで吸収する）
- 変換系 UI の標準形: 2ペイン（入力/出力）、リアルタイム変換、コピーボタン、
  不正入力でも落ちず警告表示して最善の出力を出す
- 完成したら index.html の TOOLS 配列に登録する
- 各ツールは `<main>` 直下に `.tool-header`（「← ツール一覧」リンク＋自動保存の注記）を置く
- ブラウザツールの永続データの正本は `~/Personal/vault` に置く（第一号: `03_Tasks/tasks.md`）。localStorage は UI 状態（オプション・タブ等）のみ

## CLI の制約（bin/ — 最初の1本を作るときの規約。現在 bin/ は空）

- asdf 非依存。python3/ruby/node は asdf shim のため GUI 起動時に動かない → 使用禁止
- 使ってよいもの: /usr/bin 配下（perl, awk, sed, iconv, file, tr...）と homebrew CLI
- 冒頭に `export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"`
- `#!/bin/zsh` + `set -euo pipefail`、`--help` 必須（日本語可）
- ファイルを書き換える処理はデフォルトでドライラン。`-w` 指定時のみ実行し .bak を作る
- エラーは stderr、exit 1。先頭に「目的/入力/出力/例」の4行コメント

## 検証（実装完了の定義）

- 検証時は `docs/verification-notes.md`（環境・道具・既知の罠）を必ず参照する
- **合否の正本は `./test/run <tool>` が全 pass（コンソールエラー0件を含む）**。
  11ツールすべてにハーネスがある。手順は `test/README.md`
- `docs/specs/<tool>.md` のテストケースが全て一致すること（ハーネスがそれを照合している）。
  ブラウザツールも、変換ロジックを node 等で単体実行するのではなく、
  HTML から関数を切り出さずに済む範囲で、入力→期待出力の照合結果を提示する
- 新しく書いた検証は使い捨てにせず `test/<tool>.js` に残す（`.playwright-mcp/` は gitignore で消える）
- CLI は `env -i /bin/zsh -c '<tool> --help'` が成功すること（asdf 混入検出）
- ハーネスに残さない一時ファイルは削除する
- 検証結果を報告してから作業を終える。検証が通らない状態で完了報告しない

## 環境メモ

- macOS / zsh / homebrew あり / brew install は事前に何を入れるか報告して承認を取る
- ~/.zshrc は編集しない（必要なら変更案を提示のみ）
