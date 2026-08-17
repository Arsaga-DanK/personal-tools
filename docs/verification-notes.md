# 検証ノート（環境・道具・既知の罠）

このリポジトリのブラウザツールを検証するときの環境知識と、実際に踏んだ罠の記録。
**2026-08-03〜08-04 の検証で得た知見を、エディタ／アシスタント固有のメモリから移設したもの**
（Claude Code のメモリに置いていたため他エディタへ移ると失われる。以後はこのファイルが正本）。

役割分担:

- **このファイル** = 環境・道具・ブラウザ挙動の知見（どのツールの検証でも再利用する）
- **docs/specs/&lt;tool&gt;.md** = そのツールの仕様とテストケース（合否の契約。手順の要点もここ）

追記の作法: 新しく踏んだ罠は「症状 → 原因 → 対処」の形で足す。日付と根拠（実測／静的解析）を書く。

---

## 1. 検証環境の立ち上げ

> **前提の整理（2026-08-07 追記・エディタを移る人向け）**
> このファイルには **Playwright MCP 前提の記述が混ざっている**（`browser_navigate` /
> `browser_evaluate` / MCP のブラウザプロファイル等）。これは Claude Code + MCP で
> 手作業検証していた時代の知見で、**現在の合否判定は `./test/run` が正本**。
> **`test/run` は playwright-core を直接起動するので MCP には一切依存しない**
> （`test/helpers.js` の `launch()`。MCP が無い環境でも動く）。
> MCP 由来の罠は「MCP を使うときだけ効く話」として読むこと。

- **通常は http 配信で検証する**。リポジトリ直下で
  `/usr/bin/python3 -m http.server <port> --bind 127.0.0.1` を起動し
  `http://127.0.0.1:<port>/web/<tool>.html` を開く。終了時にプロセスを止める
  - この python3 は**検証用サーバー専用**。bin/ の CLI で python3 を使うのは引き続き禁止
    （asdf shim のため GUI 起動時に落ちる。CLAUDE.md の制約）
- **Playwright MCP の `browser_navigate` は `file:` スキームをブロックする**。
  一方 `browser_run_code_unsafe` 内の `page.goto('file:///...')` は通る。
  → 通常検証は http、**file:// 固有の挙動を見るときだけ** run_code_unsafe を使う
- **ヘッドレス Chrome の `--dump-dom` はファイルピッカー呼び出しで固まる**ので使わない
- **検証ハーネスは `test/` に置いてコミットする**（2026-08-05 に方針変更）。
  実行は `./test/run [ツール名]`。書き方と必要な環境は `test/README.md`。
  以前は `.playwright-mcp/` に置く方針だったが、**gitignore されていて永続しない**ため移した
  - スクリーンショット等の**生成物**は引き続き `.playwright-mcp/`（gitignore 済み）へ
  - `browser_run_code_unsafe` の `filename` はリポジトリ配下しか読めない
    （allowed roots = リポジトリと `.playwright-mcp/`。外部の一時ディレクトリは
    「File access denied … outside allowed roots」で拒否）。`test/` はリポジトリ配下なので読める
  - 使い捨ての一時ファイルはセッションのスクラッチパッドへ（`rm` は権限設定で拒否されることがある）
- リポジトリ直下の `.playwright-mcp/`（MCP のスナップショット置き場）は .gitignore 済み。放置してよい
- **前セッションの Playwright Chrome が生きているとブラウザが起動できない**
  （`Browser is already in use for …/ms-playwright-mcp/mcp-chrome-<id>`）。
  `ps -o args= -p <pid>` で `--user-data-dir=…/ms-playwright-mcp/…` を確認してから、
  その Chrome だけを kill する（利用者の通常 Chrome は別プロファイルなので巻き込まない）
- **ロックの持ち主が「別セッションの進行中の作業」なら kill してはいけない**
  （2026-08-05 実測。並列で別作業が走っていて MCP のブラウザを掴んでいた）。
  `browser_tabs new` も同じロックに当たるので回避できない。
  → **playwright-core を直接起動して自前のブラウザインスタンスを立てる**（user-data-dir が別なので競合しない）:

  ```js
  const { chromium } = require(process.env.HOME + '/.npm/_npx/<hash>/node_modules/playwright-core');
  const browser = await chromium.launch({
    // playwright-core が期待するビルド番号と ms-playwright にある実体がずれるため明示する
    executablePath: process.env.HOME + '/Library/Caches/ms-playwright/'
      + 'chromium_headless_shell-<build>/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  });
  ```

  - `playwright-core` の場所は `find ~/.npm/_npx -type d -name playwright-core` で探す（npm global には無い）
  - `executablePath` を省くと「Executable doesn't exist at …chromium_headless_shell-1232…」と出る。
    実体は `ls ~/Library/Caches/ms-playwright/` で確認（2026-08-05 時点は 1234）。
    `npx playwright install` を促されるが**ダウンロード不要**——番号を合わせるだけでよい
  - この経路は MCP のサンドボックス外なので `page.goto('file:///…')`・`page.screenshot`・
    `page.keyboard` がそのまま使える（file:// 固有挙動の検証も run_code_unsafe 抜きで完結する）
  - node は asdf shim を避けて `export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"` の下で叩く
- **MCP のブラウザプロファイルは永続**。前セッションの `tools:*`（localStorage）が残っていると
  「既定値のはず」の UI ケースが偽 fail する（既定 ON のオプションが OFF で始まる等）。
  → **各ハーネスの冒頭で `localStorage.clear()` → `reload()`**。ポート違いはオリジン違いなので分離される
- **`run_code_unsafe` のサンドボックスに Node の `Buffer` は無い**（`Buffer is not defined`）。
  - ファイル入力は **in-page で作る**: `new DataTransfer()` に `new File([text], name, {type})` を
    add → `input.files = dt.files` → `change` を dispatch（hidden な file input でも動く）
  - ダウンロードした実ファイルの中身は `await download.createReadStream()` を
    `for await (const chunk of stream)` で読む（`chunk.toString()` は使える）。
    エクスポート→インポートの往復を実ファイル経由で検証できる

### 並列で検証するとき

- ブラウザ操作を **`browser_run_code_unsafe` に限定する**。
  `browser_click` / `browser_snapshot` などは**アクティブタブ共有のため並列実行で競合する**
- 各実行の冒頭で**自分専用ページを URL で再取得**する:
  `ctx.pages().find(q => q.url().startsWith('http://127.0.0.1:<自分のポート>'))`
- **エージェントごとに http.server のポートを分ける**と、オリジンが変わるので localStorage も分離される
- **flaky の主因は前回スクリプトの残タブ**。各実行の冒頭で対象 URL のページを close してから newPage する

---

## 2. file:// で実際に使えるもの／使えないもの（実測）

`file://` で動くことが全ての前提（CLAUDE.md）なので、API ごとに実測して切り分けてある。

- **File System Access API は file:// で利用可能**（2026-08-04 実検証。証跡は docs/specs/taskboard.md 冒頭）
  - `isSecureContext === true`。`showOpenFilePicker` / `showSaveFilePicker` /
    `createWritable` / `queryPermission` すべて存在する
  - **ジェスチャ無し呼び出しで `SecurityError: Must be handling a user gesture` が出れば
    scheme/origin チェックは通過している証拠**（file:// でブロックされる API は opaque origin 系の
    エラーになる）。この切り分け方は他の API でも使える
- **IndexedDB も file:// オリジンで put/get 動作する**（ハンドル永続化の土台）
- **paste イベントの `clipboardData` は file:// でも全フレーバー取得できる**
  （2026-08-04、実 Cmd+V で実証。excel2md Phase G）。
  **ユーザージェスチャに紐づくため scheme 制約を受けない**。
  能動的に読む `navigator.clipboard.read()` とは別扱いなので、
  「クリップボード読み取りは file:// で不可」と一括りにしない
- `<script src="../lib/*.js">` / `<link href="../lib/ui.css">` は file:// でも読める（全ツールが依存）。
  ES モジュールは不可（CLAUDE.md）
- **file:// では全ローカルページが localStorage を共有する** → キー接頭辞 `tools:<tool>` が衝突防止を担う
  （lib/storage.js の設計理由）
- **SVG は `createElementNS` なら file:// でも本物として描ける**（2026-08-07 実測。taskboard Phase T4）。
  `createElement('svg')` が HTMLUnknownElement になるのは**名前空間の問題であって file:// の制約ではない**ため、
  「描画は div のみ」という制約に読み替えてはいけない（CLAUDE.md の規約を実測に合わせて更新済み）

  ```js
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');   // → SVGSVGElement
  ```

  実測できた範囲: `namespaceURI` が正しく付く / `getBBox()` が使える /
  **3次ベジェの曲線パス（`<path d="M… C…">`）と `<marker>` による矢印頭が実寸で描画される**
  （`getBoundingClientRect()` と `getBBox()` がともに 130×70 を返した）。
  `<defs>` + `marker-end="url(#id)"` の参照も file:// で解決される

### 任意のクリップボードを作る（貼り付け経路の検証用）

```sh
# text/plain と text/html の両フレーバーを持つクリップボードを作る
osascript -e "set the clipboard to {«class utf8»:«data utf8<hex>», «class HTML»:«data HTML<hex>»}"
# hex は: xxd -p <file> | tr -d '\n'
```

- **HTML フレーバーのみを設定すると text/plain は空になる**。
  「既定の貼り付けでは何も入らず、HTML 経路だけが取り込み手段になる」状況を再現できる（Excel の実挙動に近い）
- 実 Excel のクリップボード HTML は `<!--StartFragment-->`・`<colgroup>`・MSO 独自 CSS を含む重装 HTML。
  それでも `DOMParser` + `querySelector('table')` + `table.rows` 走査で正しく取れる（実測）

---

## 3. クリップボードを触る検証の作法

- **コピーボタンの検証は実クリップボードを上書きする**（headless でも `navigator.clipboard.writeText` は成功する）。
  ユーザーが直前にコピーした内容が失われる
- 対処: 検証前に退避する、または**失う旨を先に報告する**

```sh
pbpaste                                     # text/plain の退避
osascript -e 'the clipboard as «class HTML»' # HTML フレーバーの退避
```

---

## 4. ブラウザ挙動の罠（実測）

- **Chrome の `document.execCommand('insertText')` は複数行テキストで `input` を行ごとに発火する**
  （`'A\tB\nA\tC'` の挿入で3回。2026-08-04 実測）。
  → 「貼り付け由来の input を1回だけ通す」ようなイベント回数依存のフラグは2回目以降で貫通する。
  **通知・バナーは回数ではなく「それを生んだ入力値」に紐づけて失効させる**
  （excel2md の `importNotice = {warnings, text}` 方式）
- **再描画でボタン要素を作り直す UI は、同じ要素参照に連続 click しても2回目以降が委譲リスナに届かない**
  （DOM から外れるため）。
  → テストは毎回 `querySelectorAll` で取り直す。同時に**実装側もフォーカスが body に戻る欠陥**なので、
  要素数が変わらない限り作り直さず `textContent` だけ更新するのが正しい
- **未保存編集ページ（beforeunload あり）からの `browser_navigate` はダイアログ待ちでタイムアウトする**。
  → `browser_handle_dialog accept:true` で解除してから進める
- **重い DOM 操作（千行描画・数 MB 入力）直後のデバウンス発火確認は 800ms 以上待つ**。
  400〜500ms ではイベントループ渋滞で偽 fail する（diff DIFF-11 / devpad DEV-16 で実測）
- **`pagehide` で状態をフラッシュ保存するツール（devpad・ddl2spec・terms・fill・dates）への localStorage
  注入・クリアのテスト**は、reload 前に `window.ToolStorage.save = () => true` で保存を止める。
  止めないとフラッシュが注入値を上書きして偽 fail する（devpad DEV-17 で実測。
  2026-08-13 に ddl2spec へフラッシュを足した際、`localStorage.clear()` → `reload()` の
  経路でも同じ罠を踏んだ — 消した値をフラッシュが書き戻し、復元でサンプルボタンが隠れて DS-17 が偽 fail）
- **favicon 404 は解消済み**（2026-08-04 の UX 改善で全6ページに inline SVG data URI の favicon を追加）。
  「コンソールエラー0」判定に除外ルールは不要
- **ドラッグ（pointer events）の実測3点**（2026-08-07・taskboard Phase T4。実装前に測って設計を決めた）:
  - `setPointerCapture` は file:// でも動く（要素の外へ出ても `pointermove` が届く）
  - **ドラッグの後にも `click` が飛ぶ**（50px 動かしても発火）。
    → クリックに別の意味を持たせている要素では**抑止フラグが必須**。
    さらに**フラグは次の `pointerdown` で必ず捨てる** — 要素の外で指を離すと
    `click` がその要素に来ないため、残ったフラグが次のクリックを飲む
  - **`el.style.left` は CSS 由来の値を読めない**（インラインスタイルだけが見える）。
    `parseFloat('')` → `NaN` → `style.left = 'NaNpx'` が黙って無視され「動かない」ように見える。
    → ドラッグ量は**DOM の座標ではなくモデル（日付・値）から計算する**
- **`position: absolute` の装飾（今日の縦線など）は `pointer-events: none` を付ける**。
  付けないと下のバーの click / pointerdown を奪う。
  図が詰まるズーム（1日=1.6px）では必ず重なるので、広いときの手動確認では見つからない
- **headless shell の `input[type=date]` は非セグメント**（2026-08-17 実測・gantt 行エディタの設計前調査）。
  実 Chrome は年/月/日のセグメント編集だが、headless shell では自由テキスト的に化ける
  （focus して '20260818' を1キーずつ押すと value が `60818-02-02` になった）。
  → **date input のテストはキー打鍵で書かない**。`value` セット＋ input/change dispatch で書き、
  セグメント編集の実挙動（年打ち直し1打目の `0001-…`・Backspace 1回で空文字が
  input+change 同時発火）は spec の実機スモークに落とす
- **フォーカス中の要素を DOM から外すと blur は同期発火し、そのとき `isConnected` はまだ `true`**
  （2026-08-17 実測・gantt 行エディタ）。
  → 「再構築で外れた要素の blur を無視する」目的の **`isConnected` ガードは1度も発動しない**。
  実際に守るのは**書き込み側の鮮度ガード**（保存前に「構築時の値」と「現在の値」を比較して
  違えば書かない）。**ガードを入れたら必ず外して RED を見る** — このときは
  「入れても外しても緑」で死んだコードだと判明した（GN-Q16）
- **textarea への `value` プログラム代入はネイティブ undo スタックを殺す**（2026-08-17 実測）。
  代入後は `execCommand('undo')` も Cmd+Z も代入前に戻せない。
  → JS からテキストを書き換える UI（gantt 行エディタ等）で Cmd+Z を活かすには
  **自前のスナップショット履歴が必須**（mask/board/gantt が同型）

---

## 5. 偽陽性・偽陰性を避ける

- **コンソールエラーは「ロード時」と「全操作後」の2回取得する**（累計0が合格条件）
- 各ツールは `window.<tool>` のテストフックを公開している。
  spec のテストケース（JS 文字列リテラル表記）を `browser_evaluate` にそのまま渡して照合する
- **NFD 文字列は生成経路で NFC 化されうる**（テストデータ自体が正規化されて「一致した」ことになる）。
  → NFD を扱うテストでは **`NFD !== NFC` の前提アサートを必ず入れる**
- ダークモードは `page.emulateMedia({colorScheme:'dark'})`、狭幅は `page.setViewportSize({width:390,...})`
  （どちらも run_code_unsafe）。**新規 UI は `scrollWidth > clientWidth` にならないことを必ず assert する**
- **自動検証は Chromium のみ**。Safari 固有経路（クリップボードのフォールバック・JSON エラー位置なし・
  file:// の localStorage・FSA 非対応フォールバック・`clipboardData.getData('text/html')`）は
  各 spec の「Safari手動スモーク項目」で手動確認する
- **ブラウザ再起動をまたぐ挙動**（IndexedDB のファイルハンドル復元など）は自動検証不能。
  spec の「Chrome 実機スモーク項目」に落とす
- **セレクタは実装から grep して確かめる**。当てずっぽうのクラス名（`.del` / `.fold` 等）は
  0件でも例外にならず「差分が無い」ように見えて**偽 pass になる**。
  実際のクラス名は実装側に依存する（diff は `.row` / `.line-del` / `.line-add` / `.collapse-row` / `.chr`、
  taskboard は `td.cell-body` の `paddingLeft` で字下げ・`.due-over` / `.due-today` で色分け）。
  **件数は「0でないこと」まで assert する**
- **フォールト注入で例外経路を通す**: `Object.defineProperty(el, 'value', {get(){throw …}})` を仕込んで
  ボタンを click すると、try/catch でしか到達できないエラー表示（devpad の `guard`）を検証できる

---

## 5b. テストが緑でも意味を失う3つの型（2026-08-06 に3件目が出たので整理）

**「テストが通っている」は「守れている」と同じではない。** 実際に起きた3件を型として残す。
どれも fail せず、静かに検証の意味だけが抜け落ちた。

### 型1: 前提のすり替え — テストは通るが、確かめている対象が別物になる

ハブの部分一致検索を `f('md')` で検証していた。当時は `excel2md` という**表示名**に `md` が
含まれることを利用していたが、表示名を `Tables` に変えた時点で `md` は
`tasks.md`（別ツールの desc）にしか当たらなくなった。**アサートは真のまま、
「表示名の部分一致」という検証意図だけが消えた。**

**2026-08-17 に同じ型を2度目に踏んだ。** 命名規約の改定（`Tables` → `Convert Table`）で
`f('ables')` がまた当たらなくなった。固定文字列を選び直す限りこれは繰り返す。
**恒久対策として、クエリを TOOLS から導出する形に変えた**
（`t.name.slice(1, -1)` で中間文字列を作り、全15本について自分自身に当たることを照合 — HUB-5b/HUB-9）。
英名（`alias`）は「一度決めたら変更しない」規約なので、そちらを起点にすると陳腐化しない。

- **兆候**: テストデータの偶然の性質（たまたま含まれる文字列）に依存している
- **対策**: 何を確かめているかを**式から読み取れる**データにする。
  さらに、**改名で意味が消える種類の検証は期待値ごと正本から導出する**（上記）。
  「なぜこの入力なのか」がコメントなしで分からないなら、すり替えが起きる

### 型2: 0 の意味の後付け — 経路が増えた瞬間に推論が嘘になる

`diffCounts` が `変更0・追加0` になるのは「行の移動」だけだったので、
`0/0 → 「（行の移動）」` と表示していた。後にメモ削除（行数だけ減る操作）を追加したとき、
**削除なのに「行の移動」と表示された。** テストは移動のケースしか見ていないので緑のまま。

- **兆候**: 「N件が0なら◯◯である」という**逆向きの推論**をしている
- **対策**: 0 を作る経路が増えたら推論を見直す。増減や種類を**直接測る**
  （行数の差を見て「N行を削除」と出す）

### 型3: テストが実装と同じ思い込みを共有する — 経路が1つしか検証されていない

追加フォームの既定値（前回値の記憶）を TB-D1〜D3 で検証し、全て pass していたが、
実運用では機能しなかった。**テストが「追加フォームで値を入れて追加する」経路だけを
検証しており、実際に使われている経路（リストのセルのポップオーバーで期限を設定）から
記憶が書かれていなかった。** 実装の思い込みをテストがそのまま写していた。

- **兆候**: 機能の**入口が複数ある**のに、テストが1つしか通っていない
- **対策**: 「保存されるか」ではなく **「実際の操作で保存が埋まるか」** を検証する。
  入口を列挙し（この例では追加フォーム／各セルのポップオーバー／モーダル）、
  **利用者が最も使う入口**でのテストを必ず1本置く

### 共通の教訓

3件とも「実装を書いた人がテストも書いた」ことに由来する。
**テストを書くときは「この機能を初めて使う人はどの経路を通るか」を先に列挙する。**
実装の構造をなぞって書くと、実装の穴と同じ形の穴がテストに空く。

---

## 6. 性能ガードの設計知見

**入力サイズから出力サイズが非線形に増える処理は、入力側の指標では守れない。**
展開の内側で実カウンタを増やし、上限超過で即座に打ち切る。

事例（excel2md の結合セル展開・`parseHtmlTable`）:

- 1セルの `rowspan × colspan` だけで数千万セルになりうる（ブラウザのクランプ上限は
  rowspan 65534・colspan 1000）→ **text/html の文字数では守れない**
- `rowspan` の張り出しで実列数も増える → **事前見積もり（行数×列数）でも過小評価になり守れない**
- → 展開ループの内側で `filled += rowSpan * colSpan` を数え、`MAX_HTML_CELLS` 超過で
  `{grid:null, tooLarge:true}` を返して**取り込みを中止し既定の貼り付けに委ねる**
- 文字数ガード（`MAX_INPUT_CHARS`）は**別の層**として併存させる（安いので先に弾く）

ガード発動時の UI 契約（全ツール共通）: **一部だけ処理せず、中止して理由をバナーに出す**。

---

## 7. バナーの ARIA（CM-5・2026-08-05）

規約は `lib/ui.css` の `.banner` ブロックに記載。対応は**クラスと1対1**:

| クラス | role | 意味 |
|---|---|---|
| `banner-info` / `banner-success` | `status`（polite） | 結果・通知。読み上げに割り込まない |
| `banner-warn` / `banner-error` | `alert`（assertive） | 中止・失敗・競合。割り込んで伝える |

- **`hidden` の要素はアクセシビリティツリーに載らない**（`[hidden]{display:none!important}`）。
  live region として効くのは表示された瞬間以降なので、**role は className を決める箇所で必ず一緒に設定する**。
  種別が変わらないバナー（devpad のタブエラー枠・taskboard の `#fallback-note`）は HTML に静的に書く
- **1つの要素を種別違いで流用している箇所は role も戻す**必要がある
  （devpad のタブエラー枠は復元通知に `banner-info` で流用されるため、`guard` の catch で
  `banner-error` + `alert` に戻す）。流用箇所は「className を戻し忘れる」バグと同時に起きる
- 検証は種別ごとに実際の経路を通して `banner.getAttribute('role')` を照合する
  （info=ハイライト省略、warn=性能ガード、error=インポート失敗、success=保存成功 など）

---

## 8. IME ガードが必要かの判定軸（2026-08-05 の監査）

**キーイベントは修飾キー付きでも `isComposing: true` で届く**（CDP で composition を張って実測。
5ツールすべてで確認）。つまり「イベントが来ないから安全」という理屈は成り立たない。

```
[{"key":"Enter","isComposing":true,"keyCode":13,"meta":false},
 {"key":"Escape","isComposing":true,"keyCode":27,"meta":false},
 {"key":"Enter","isComposing":true,"keyCode":13,"meta":true}]
```

**安全かどうかは、そのキーで発火する操作が破壊的かで決まる。**

| 操作の性質 | 例 | ガード |
|---|---|---|
| データが増える／既存値が上書きされる／入力が失われる | taskboard の タスク追加・セル内編集の確定・popover 閉鎖 | **要ガード** |
| 非破壊でやり直せる | コピー・整形（excel2md / norm / diff / devpad の Cmd+Enter） | 不要 |

- **修飾キーなしの Enter / Escape をトリガーにする操作を新設するときは必ずガードを検討する**
  （IME が確定・取り消しに送るのはこの2つ。修飾キー付きは IME が送らないので発火しない）
- 変換中に利用者が誤って Cmd+Enter を押せば発火はする。それでも上表の右側なら実害は
  「もう一度やれば直る」で収まる（2026-08-05 に現状維持と判断）
- 共通判定は `web/taskboard.html:1080` の `isComposingKey(e)`
  （`isComposing || keyCode === 229`。229 は isComposing を立てない IME への保険）。
  現在 taskboard のみで使用。他ツールで必要になった時点で共通化を判断する
- ガードは**キーごとではなくハンドラ先頭で early return** する。変換中の Escape は
  IME の変換取り消しであり、編集中断やポップオーバー閉鎖に使われてはいけない
