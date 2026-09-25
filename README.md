# Personal Tools

業務効率化のためのブラウザツール集（17本）。
**インストールもビルドもサーバー起動も要りません。`index.html` をダブルクリックするだけです。**

## 設計方針

- **起動レス** — `file://` で直接開いて動く。`npm install` も `npm run dev` も無い
- **オフライン完結** — 外部 CDN も実行時のネットワーク通信も使わない。入力したデータが外に出ない
- **1ツール = 1 HTML** — 各ツールは `web/<英名>.html` を開くだけ。大きいツール（Plan Tasks / Check Issue）は同名フォルダの補助スクリプトを一緒に置く。要らないものは消せる、欲しいものだけ配れる
- **手元のデータは手元に** — 保存先はローカルファイルとブラウザの localStorage だけ

## 使い方

```sh
git clone https://github.com/Arsaga-DanK/personal-tools.git
cd personal-tools
open index.html          # macOS。Windows は start index.html / Linux は xdg-open index.html
```

`index.html` がハブ（ツール一覧）です。ここから各ツールへ移動します。ファイルをブラウザに
ドラッグ&ドロップしても開けます。

各ツールの左上にある［☰ ツール］（**Cmd/Ctrl+K**）で引き出しメニューが開き、**ハブに戻らずに
別のツールへ直接移動**できます。検索して Enter で先頭を開けます。

## ツール一覧

ツール名は「動詞＋名詞」で、**名前だけで何をするか分かる**ようにしています。
括弧内はファイル名（`web/<英名>.html`）です。

| ツール | できること | カテゴリ |
|---|---|---|
| **Plan Tasks**（taskboard） | `tasks.md` を表形式で閲覧・編集。完了・開始日・期限・優先度、タイムライン表示、Excel 用コピー | タスク |
| **Check Issue**（issue） | 04_Issues のイシューを一覧（カード）。1問ずつのウィザードで マイルストーン→論点→絵コンテ→サブイシュー→次の一手 を埋めて作成し、カードから閉じて振り返る | タスク |
| **Convert Table**（excel2md） | Excel のセル範囲（TSV）⇔ Markdown テーブルの双方向変換。結合セルの展開、列の揃え指定 | 変換・比較 |
| **Convert Data**（devpad） | 開発ユーティリティ集。JSON・XML・SQL 整形／エスケープ／URL／Base64／正規表現／基数変換／Unix 時刻／UUID | 変換・比較 |
| **Normalize Text**（norm） | 日本語表記の正規化（全角半角・ハイフン・波ダッシュ・空白・NFKC）。変更箇所をハイライト | 変換・比較 |
| **Compare Text**（diff） | テキスト比較。行単位差分＋文字単位ハイライト、空白無視・全半角同一視 | 変換・比較 |
| **Unify Terms**（terms） | 用語統一表を原稿へ一括適用。同時置換・長い語優先で連鎖置換の事故を防ぐ | 変換・比較 |
| **Fill Template**（fill） | 定型文テンプレの差し込み。`{{変数}}` から入力フォームを自動生成 | 変換・比較 |
| **Document Schema**（ddl2spec） | PostgreSQL の DDL ⇔ テーブル定義書（Markdown 表）の双方向変換 | 設計 |
| **Export Outline**（doc2xl） | Markdown の見出し階層 → Excel 用の階層表（大項目/中項目/小項目） | 設計 |
| **Draw Diagram**（diagram） | テキストからフローチャート・シーケンス図 → PNG コピー / SVG 保存 | 設計 |
| **Draw Mindmap**（mindmap） | 箇条書き → マインドマップ。1行目が中心テーマ、タブで階層 | 発想 |
| **Sort Ideas**（board） | 付箋ボード。付箋を置いて・並べて・色分け・結線 → md アウトライン書き出し / PNG コピー | 発想 |
| **Mask Image**（mask） | スクショのマスキングと注釈。モザイク・黒塗り・枠・矢印・テキスト・番号スタンプ・切り抜き → PNG コピー | 画像 |
| **Check Vault**（vaultlint） | Obsidian vault の健全性チェック。リンク切れ・添付消失・ファイル名の罠を検出し、承認した修復を実行 | 整理 |
| **Calc Dates**（dates） | 日付・営業日・工数の計算。N 営業日後、期限の逆算、和暦/年度、人日⇄時間⇄人月換算 | PM |
| **Draw Gantt**（gantt） | タスクと期間の表 → ガントチャート画像（PNG コピー）。管理はしない、貼り付け用 | PM |

日本のビジネス実務を前提にした機能（和暦・年度・祝日・Excel 連携）が含まれます。
UI とドキュメントは日本語です。

作図系3本（Draw Diagram / Draw Mindmap / Draw Gantt）は
[mermaid](https://mermaid.js.org/) を `lib/vendor/` に同梱して使っています（オフライン動作のため）。
mermaid は MIT ライセンスで、全文を [`lib/vendor/mermaid.LICENSE`](lib/vendor/mermaid.LICENSE) に同梱しています。

## 動作環境

モダンブラウザであれば動きますが、**Chrome / Edge を推奨**します。

| ツール | 要件 |
|---|---|
| **Check Vault** | **Chrome / Edge 限定**。フォルダを開いてファイルを書き換えるため File System Access API が必須 |
| **Plan Tasks** | Chrome / Edge ならファイルへ直接保存。他のブラウザでは「読み込み＋ダウンロード保存」に自動フォールバック |
| その他 | 任意のモダンブラウザ |

祝日データ（Calc Dates）は内閣府「国民の祝日」CSV 由来の **2020〜2027 年**を同梱しています。
範囲外の日付を渡すと警告が出ます。

## Obsidian 連携（Plan Tasks / Check Vault）

この2つは Obsidian の vault を直接読み書きします。**vault のフォルダ構成は人によって違うため、
初回に設定が必要です**（ツール内の「設定」欄で指定します。コードの書き換えは不要です）。

| ツール | 設定する値 | 用途 |
|---|---|---|
| **Plan Tasks** | Obsidian の vault 名 | 関連ノートを `obsidian://` で開くリンクを作る。未設定ならリンクを出さずに動作します |
| **Check Vault** | 非公開フォルダ | **読み込み自体を行わない**除外フォルダ。安全のため、設定するまでスキャンを開始しません |
| **Check Vault** | Inbox フォルダ | 古いデイリーノートの棚卸し対象。空にするとこの検査を行いません |
| **Check Vault** | アーカイブ先 | 棚卸しでデイリーノートを移動する先 |

`.obsidian` `.git` `.trash` は設定に関係なく常に除外されます。

### 設定はどこに保存されるか

`file://` で動くためサーバーもビルドも無く、**環境変数も `.env` も存在しません**。
そのため設定は次の形で持っています。

- 既定値は `lib/config.js` にコミットされています（**誰かの個人的なフォルダ名は入っていません**）
- あなたが入力した値はブラウザの `localStorage`（キー `tools:config`）に保存されます
- したがって**設定は git に入りません**。リポジトリを公開・共有しても、あなたの vault の
  フォルダ構成が他人に見えることはありません
- 反面、**ブラウザのプロファイルごとに設定が必要**です（別ブラウザや別 PC では入れ直し）

`lib/config.js` を直接書き換える運用は取っていません。書き換えると `git pull` のたびに
衝突するうえ、設定ファイルを gitignore して `<script src>` で読む方式は、ファイルが無い環境で
コンソールエラーになり「オフラインで静かに動く」という前提を壊すためです。

Plan Tasks が読み書きする `tasks.md` は [Obsidian Tasks プラグイン](https://publish.obsidian.md/tasks/)の
絵文字記法（`📅` 期限 / `🛫` 開始日 / `✅` 完了日 / `🔺⏫🔼🔽⏬` 優先度 / `🆔` `⛔` 依存）に準拠しています。
**編集していない行のバイトは一切変更しません**（ラウンドトリップ保全）。

> **Check Vault を使う前に vault を git コミットしてください。** ファイルのリネームと移動を実際に行います。

## 開発

| やりたいこと | 見るファイル |
|---|---|
| 実装規約（DOM・保存・文字の扱い） | `docs/coding-rules.md` |
| 各ツールの仕様とテストケース（期待値の正本） | `docs/specs/<ツール名>.md` |
| 検証環境と過去に踏んだ罠 | `docs/verification-notes.md` |
| テストの実行方法 | `test/README.md` |

```sh
./test/run              # 全ツールを検証
./test/run excel2md     # 1ツールだけ
```

検証には Node.js と playwright-core が必要です（ツールを**使う**だけなら何も要りません）。

## ライセンス

MIT License（[LICENSE](LICENSE)）。

自由に使用・改変・再配布・商用利用できます。条件は著作権表示とライセンス文を残すことだけです。
**無保証**であり、作者は損害について責任を負いません。特に Check Vault はファイルを実際に書き換えるため、
自己責任でお使いください。
