
# Personal Tools

業務効率化のための個人ツール群。**現在あるのはブラウザ HTML（`web/`）だけ**（本数と一覧の正本は `lib/tools.js` の TOOLS）。
CLI（`bin/`）は形態として認めているが、まだ1本も無い（→「構成」）。

## このリポジトリでの作業原則

- 依頼された1ツールのみ実装する。改善案は実装せず、作業終了時に箇条書きで提案する
- 不明点は実装前に質問する。仕様を勝手に補完して進めない
- 新しいツールを作る前に `docs/tool-backlog.md` の着手ルールを確認する
- 大きめの計画は実装前にセルフ監査する。**核心は次の4点**:
  ①記憶ではなく一次情報（公式ドキュメント・実際の出力・実行結果）で検証する
  ②各観点で最低2件の問題または懸念を挙げる（0件なら「なぜ0件か」を根拠付きで説明する）
  ③確信を持てていない箇所を正直に全部列挙する
  ④**監査中は実装・ファイル作成をしない**（報告のみ）
- 既存ツール（特に excel2md/excel2md.html＝旧 excel2md、独立リポジトリ）は依頼がない限り変更しない
- コミットは論理単位。メッセージは日本語1行

## 構成（2026-09-25 時点の実態）

```
README.md    公開リポジトリの入口。ツール表と本数は test/hub.js（HUB-15/27）が TOOLS と照合する
LICENSE      MIT
index.html   ハブ。ツール一覧の正本は lib/tools.js の TOOLS（1行足すとハブにも引き出しメニューにも載る）
web/         ブラウザツール。web/<alias>.html が入口（URL は変えない）。
             1,000 行を超えたツールは同名フォルダ web/<alias>/<節>.js に節ごとのスクリプトを持つ
             （現在 taskboard / issue。規約は coding-rules「ファイルの分割」）
lib/         web ツールの共通コード。ui.css / ui.js / storage.js / fsa.js / config.js / sql.js / excel.js / mmd.js /
             edit.js / handoff.js / tools.js（ツール登録簿の正本）/ launcher.js（引き出し式のツールメニュー）
             同梱ライブラリは lib/vendor/（現在 mermaid のみ。作法は coding-rules.md）
docs/        coding-rules.md（実装規約の正本）/ verification-notes.md（検証の罠）/ todo.md（作業キュー）/
             ux-backlog.md（改善判断の記録）/ tool-backlog.md（ツール候補）
docs/specs/  ツールごとの仕様書兼テストケース docs/specs/<alias>.md ＋ launcher.md（共通コンポーネント）。
             大きい spec は docs/specs/<alias>/<話題>.md に分け、<alias>.md は目次と骨格（現在 taskboard）
docs/audits/ 日付つきの監査・設計の記録（YYYY-MM-DD-<題>.md）。ux-backlog.md に索引
test/        検証ハーネス（`./test/run [ツール名] [節名]`。書き方は test/README.md）。
             大きいハーネスは test/<alias>.js（入口）＋ test/<alias>/<節>.js（現在 taskboard / issue）
```

- **`bin/` と `dict/` は空**（CLI ツールと辞書はまだ1つも無い）。
  作るときは下の「CLI の制約」に従い `bin/` を使う。**空のまま構成表に並べない**
  （「CLI もある」と誤解して探す時間が生まれる）
- `excel2md/` は旧ツールの独立リポジトリ。**.gitignore 済みで追跡外**。
  リポジトリ外のアーカイブ領域への移動は 2026-09 上旬の予定（→ `docs/ux-backlog.md`）
- `lib/` に CLI 用の共通コード（`common.zsh` 等）は**まだ無い**。CLI を作るときに置く

## 命名規約

- ツールの**表示名**は**「動詞＋名詞」の英語2語**（`Normalize Text` `Check Vault` `Draw Diagram`）。
  index.html の TOOLS の `name`、各ツールの `<h1>`、`<title>` の先頭に使う
- **2026-08-17 に1語ラベル（`Text` `Lint` `Convert`）から改定した。**
  旧規約は「名前で説明しようとしない — 説明は `desc` と `when` が担う」だったが、
  これはハブ経由で開くときにしか成立しない。**ブックマーク・タブの見出し・履歴・
  共有リンクでは `desc` が消えて名前だけが残る**ため、1語では何のツールか判別できなかった
  （利用者の指摘: 「`Text` ってパッと見てなんのツールか分からない」）
- 動詞は行為を、名詞は対象を表す。**同じ動詞の重複は歓迎する**
  （`Draw Diagram` / `Draw Gantt` / `Draw Mindmap` は同種の道具だと一目で分かる）。
  **同じ動詞＋同じ名詞は作らない** — 対象で区別する（`Convert Table` と `Convert Data`）
- 3語以上にしない。収まらないなら名詞を上位概念に上げる（説明は `desc` と `when` が担う）
- **ファイル名・spec 名・localStorage キー（`tools:<name>`）・`window.<name>` フック・
  spec のテスト ID** は英小文字で、一度決めたら変更しない
  （テストと spec の参照が連動するため）
- `<title>` は「表示名 (英名)」（例: `Convert Table (excel2md)`）。
  表示名だけではファイル名が分からないため、識別子を括弧で添える。
  表示名と英名が同じなら表示名のみ（規約としては残すが、
  **表示名が2語になった現在は全ツールが併記形**になる）
- 英名は TOOLS の `alias` にも書く（画面には出さず検索にだけ効く。
  過去のメモやファイル名が英名で書かれているため）
- 表示名と英名の対応は `lib/tools.js` の TOOLS（`name` / `alias`）が正本。README の表と test/hub.js（HUB-15 / HUB-27）が
  照合するので、ここには書かない
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
- ブラウザツールの永続データの正本は Obsidian vault 側のファイルに置く（第一号: `tasks.md`）。localStorage は UI 状態（オプション・タブ等）と環境依存の設定（`lib/config.js`）のみ
- **vault のフォルダ名・vault 名をコードに書かない**（利用者ごとに違う）。`lib/config.js` に置き、画面の設定欄で編集させる（作法は `docs/coding-rules.md`「vault 連携」）
- **1ファイル 1,000 行を超えたら同名フォルダに分ける**（`test/run` が警告する。切り方は coding-rules「ファイルの分割」— URL・テスト ID・フックは変えない）

## アプリ化しない（2026-08-18 の判断・利用者確認済み）

「最小構成のままでいいのか、アプリにした方がいいのか」を検討した結果、**現状の
`file://` の静的ファイル構成を維持する**。利用者の判断は「**mac でしか使わない**」。

- **ビルド前提（Vite/React 等）にしない**: 「使用時にビルド・インストール不要」の土台が消える。
  さらにこの環境は **asdf shim のため GUI 起動時に node が動かない**ことを実測済み（下の CLI の制約）で、
  その不安定さを日々の開発に持ち込むことになる。**914チェックの検証機構が
  `file://` 実機＋`window.<英名>` フックの上に建っている**ことも重い
  （実機通しでしか出ない欠陥を実際に2件検出している）
- **Electron / Tauri にしない**: 100〜200MB のバイナリ・macOS の署名・更新機構・
  ツールチェーン維持。原則2「使う瞬間に得＝運用・維持を要求しない」に正面から反する。
  「1ツール=1HTML なので要らないものは消せる」性質も失う
- **アプリ化で得るはずのものは既にある**: ツール間の状態共有（`lib/handoff.js`）・
  ファイル読み書き（FSA は file:// で動く）・タブ管理（ブラウザ）・1クリック起動（ブックマーク）
- **https 配信（GitHub Pages）＋PWA も今はしない**: 実装に `file://` の絶対パスは無く
  （出てくるのは全部コメント）配信元に依存しないので**コード変更ゼロで可能**だが、
  得られるのは「URL が固定される・他端末で使える・インストールできる」の3つで、
  **他端末で使わないなら価値が出ない**。加えて localStorage がオリジンごとに分かれ、
  検証が file:// と https の二重管理になる
- **再評価のトリガー**: ①別の端末（スマホ・別 PC）で使いたくなったとき
  → まず GitHub Pages（コード変更ゼロ）から。Electron はその次
  ②Obsidian のリンク集がパス移動で壊れて実際に困ったとき → 同じく Pages が答え

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
  ツールごと＋ハブ＋launcher のハーネスがある（`./test/run <tool> <節名>` で節だけ実行できる）。手順は `test/README.md`
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
