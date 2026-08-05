# test/ — 検証ハーネス

`docs/specs/<tool>.md` のテストケースを `file://` の実機ブラウザで照合する。
**合否の契約は spec 側が正本**で、ここはそれを実行するだけ。期待値を変えるときは spec を先に直す。

## 実行

```sh
./test/run                      # 全ハーネス
./test/run excel2md             # excel2md だけ
./test/run excel2md --shots     # スクリーンショットも書く（.playwright-mcp/・gitignore 済み）
./test/run --help
```

`node test/excel2md.js` でも動くが、`./test/run` は **PATH を固定してから node を呼ぶ**。
asdf の shim を経由すると環境によって node が解決できないため（CLAUDE.md の制約と同根）、
こちらを使うのが安全。

出力は `PASS` / `FAIL` の一覧と件数。**全 pass かつコンソールエラー0件のときだけ exit 0**。

```
  PASS  E2M-01
  FAIL  E2M-P08  → ["中央","| :---: | --- |",…]     ← 実際の値が出るのでそのまま調査できる

55 pass / 0 fail
コンソールエラー: 0件
```

## 必要なもの

- **node**（homebrew）— 検証専用。`bin/` の CLI で node/python3 を使うのは引き続き禁止
  （`docs/verification-notes.md` の python3 と同じ扱い）
- **playwright-core と Chromium** — Playwright MCP を一度使えばキャッシュに入る。
  `test/helpers.js` が実行時に探すので**インストールもパス設定も不要**:
  - `~/.npm/_npx/*/node_modules/playwright-core`
  - `~/Library/Caches/ms-playwright/chromium_headless_shell-*/…/chrome-headless-shell`（最新ビルドを選ぶ）

見つからないときは何を探したかを添えて落ちる。npx のハッシュもビルド番号も更新で変わるため、
**パスをハードコードしない**のが helpers.js の役割。

## MCP のブラウザとの関係

このハーネスは **playwright-core を直接起動する**ので、MCP のブラウザとは別インスタンス
（`--user-data-dir` が別）になる。並列セッションが MCP のブラウザを掴んでいても
`Browser is already in use for …` で衝突しないし、相手の Chrome を kill する必要もない。

MCP 側の制約（`browser_navigate` が `file:` を拒否する等）も受けないので、
`page.goto('file:///…')` / `page.keyboard` / `page.screenshot` をそのまま使える。

## 構成

| ファイル | 役割 |
|---|---|
| `run` | ランナー。PATH を固定して各ハーネスを実行 |
| `helpers.js` | playwright-core / Chromium 実体の探索、合否集計、`file://` URL 組み立て |
| `excel2md.js` | excel2md（E2M-01〜10 / R01〜R08 / H01〜H09 / P01〜P24） |
| `hub.js` | index.html（HUB-1〜10: 表示順・検索・カテゴリ・リンク遷移・狭幅・表示名と h1/title の整合） |
| `norm.js` | norm（NORM-01〜15・Q5 / NM-13: インポートバナーの回帰 / コピー・エクスポート） |
| `diff.js` | diff（DIFF-01〜11・Q2 / 折り畳み・フォールバック・コピー。**DIFF-07 は性能計測**） |
| `devpad.js` | devpad（DEV-01〜17・Q1〜Q3 / 7タブの独立性・タブ切替・永続化・性能ガード2種） |
| `taskboard.js` | taskboard（TB-01〜20・parse / TB-I1〜I7: IME ガード / TB-U1〜U7: 追加の取り消し） |

`taskboard.js` の TB-I6 は **CDP で実際の IME composition を張る**（`Input.imeSetComposition` →
`Input.dispatchKeyEvent`）。MCP 経由ではなく playwright-core を直接起動しているので
`context.newCDPSession(page)` がそのまま使える。

## 性能を測るケース（DIFF-07）

`diff.js` の DIFF-07 だけは**時間を測って閾値と比べる**（3,000行×30編集の中央値 <500ms）。
マシン負荷で揺れるため spec どおり **5回計測して中央値**を採り、**不合格なら1回だけ再計測**してから
失敗と数える。実測値（min/median/max）は常にログに出すので、閾値に近づいたら気づける。

## クリップボードを触るケース

**実クリップボードには書かない。** `navigator.clipboard.writeText` をページ内でスタブして
渡された文字列を捕捉する（`norm.js` / `diff.js` がこの方式）。
ユーザーが直前にコピーした内容を壊さないため、この方針は必須。
エクスポート（ダウンロード）も同様に `URL.createObjectURL` に渡る Blob を捕捉して
実ファイルを作らずに中身を読む（`norm.js` の NORM-12）。

## ハーネスを足すとき

1. `test/<tool>.js` を作る（`./test/run <tool>` で拾われる）
2. `helpers.js` の `launch` / `createRunner` / `fileUrl` / `eq` を使う
3. 冒頭で **`localStorage.clear()` → `reload()`**。`file://` は全ローカルページで localStorage を
   共有するため、前回の `tools:*` が残ると「既定値のはず」のケースが偽 pass / 偽 fail する
4. 入力は 200ms デバウンス。**重い入力の後は 800ms 待つ**（400〜500ms だと偽 fail する）
5. セレクタは実装から grep して確かめる。当てずっぽうのクラス名は0件でも例外にならず**偽 pass** になるので、
   件数を「0でないこと」まで assert する
   - 同じツール内に**似た役割の要素が複数ある**ことがある。devpad は各タブに
     `[data-tab-error]`（guard・init 失敗・復元通知）と `#<tab>-result`（操作結果）の
     2つのバナーがあり、取り違えると偽 fail になる（実際に踏んだ）
6. **存在チェック（`textContent !== ''`）ではなく内容そのものを assert する。**
   「機能は正しいが表示が意図と違う」層のバグは文字列を照合しないと通り抜ける
   （norm の NM-13／NM-14 はどちらもこれで発見した）
7. 「触られないこと」を確かめるときは**目印を入れてから**操作する。
   `=== ''` は前の操作で偶然空だっただけかもしれない（`'SENTINEL'` を置いて不変を見る）

既知の罠と環境の詳細は `docs/verification-notes.md`。
