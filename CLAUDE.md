
# Personal Tools

業務効率化のための個人ツール群。ブラウザHTML（web/）と CLI（bin/）の2形態。

## このリポジトリでの作業原則

- 依頼された1ツールのみ実装する。改善案は実装せず、作業終了時に箇条書きで提案する
- 不明点は実装前に質問する。仕様を勝手に補完して進めない
- 既存ツール（特に web/md2excel.html）は依頼がない限り変更しない
- コミットは論理単位。メッセージは日本語1行

## 構成

```
index.html   ハブ。web/ツール一覧（内部のTOOLS配列に1行足すと追加される）
web/         ブラウザツール。1ツール=1HTML完結
bin/         CLIツール。拡張子なし、chmod +x
lib/         共通コード（web用 classic JS / CLI用 common.zsh）
dict/        辞書・設定
docs/specs/  ツールごとの仕様書兼テストケース
```

## ブラウザツールの制約（web/）

- `file://` で開いて動作すること。これが全ての前提
- ES モジュール禁止（file:// で CORS エラーになる）。共有は `<script src>` か1枚完結
- 外部 CDN・npm・ビルド禁止。オフラインで動くこと。素の HTML/CSS/JS のみ
- クリップボード書き込みは navigator.clipboard → 失敗時 textarea 選択方式にフォールバック
- 変換系 UI の標準形: 2ペイン（入力/出力）、リアルタイム変換、コピーボタン、
  不正入力でも落ちず警告表示して最善の出力を出す
- 完成したら index.html の TOOLS 配列に登録する

## CLI の制約（bin/）

- asdf 非依存。python3/ruby/node は asdf shim のため GUI 起動時に動かない → 使用禁止
- 使ってよいもの: /usr/bin 配下（perl, awk, sed, iconv, file, tr...）と homebrew CLI
- 冒頭に `export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"`
- `#!/bin/zsh` + `set -euo pipefail`、`--help` 必須（日本語可）
- ファイルを書き換える処理はデフォルトでドライラン。`-w` 指定時のみ実行し .bak を作る
- エラーは stderr、exit 1。先頭に「目的/入力/出力/例」の4行コメント

## 検証（実装完了の定義）

- docs/specs/<tool></tool>.md 内のテストケースが全て一致すること。
  ブラウザツールも、変換ロジックを node 等で単体実行するのではなく、
  HTML から関数を切り出さずに済む範囲で、入力→期待出力の照合結果を提示する
- CLI は `env -i /bin/zsh -c '<tool> --help'` が成功すること（asdf 混入検出）
- テストの一時ファイルは削除する
- 検証結果を報告してから作業を終える。検証が通らない状態で完了報告しない

## 環境メモ

- macOS / zsh / homebrew あり / brew install は事前に何を入れるか報告して承認を取る
- ~/.zshrc は編集しない（必要なら変更案を提示のみ）
