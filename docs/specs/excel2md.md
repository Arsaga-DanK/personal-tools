# excel2md 仕様書兼テストケース

## 概要

Excel のセル範囲（TSV）⇔ Markdown テーブルを**双方向**に変換するツール（方向切替式）。`web/excel2md.html`、カテゴリ: 変換（→要確認 E2M-Q1）。MD→TSV 方向は旧双方向ツール `excel2md/excel2md.html` の挙動を正として移植（Phase F）。

**Phase G（2026-08-04）で旧版固有の2機能（列の寄せ指定・結合セルの展開）を移植し、excel2md を本ツール1本に集約した。** 旧 `excel2md/` は読み取りのみ（変更しない）。index.html からは削除済みで、数週間の併用後にリポジトリ外のアーカイブ領域へ git 履歴ごと移動予定（docs/ux-backlog.md に記録。移動自体は未実施）。

**Phase P（2026-08-05）で変換結果の表プレビューを追加し、列の揃え指定を「プレビュー最上段の揃え操作行」に移した。** Phase G のチップ行（`.align-bar`）はどの列を操作しているか分かりにくく、実機で UI が後退したと判断したため撤去する。旧 `excel2md/excel2md.html` のプレビュー UI の直感性を回復する変更で、**変換ロジック（純関数）は変更しない**（表示層の追加＋戻り値へのフィールド追加のみ。P7）。ux-backlog.md の「表示系の薄さ: excel2md のプレビュー・列揃えなし」の後半に対応する。

> フェーズ名を H ではなく P としたのは、テスト ID の `E2M-H##`（HTML・結合セル展開）と衝突させないため。プレビューのテスト ID は `E2M-P##`。

## 要件対応表

| ユーザー要件 | spec 節 |
|---|---|
| 2ペイン、リアルタイム変換、コピーボタン | 画面構成 |
| 1行目ヘッダ扱い（チェックボックスでOFF可） | オプション仕様 |
| 前後空白除去（デフォルトON） | オプション仕様 |
| セル内 `\|` はエスケープ | 変換仕様 3 |
| "囲みセル内改行（Alt+Enter由来）は `<br>` に | 変換仕様 1, 3 |
| 列数不一致は空セル埋め＋警告 | エラー・警告仕様 |
| 全角前提、文字化け厳禁 | テストケース E2M-01, 02 |
| **列の寄せ指定（`:---` / `:---:` / `---:`）の出力と解釈**（Phase G） | 変換仕様 3・変換仕様（MD→TSV）7 |
| **結合セル（colspan/rowspan）を全セル繰り返しで展開**（Phase G） | Excel貼り付けの取り込み |
| **変換結果を実際の表として描画（プレビュー）**（Phase P） | プレビュー仕様 |
| **プレビュー上で列の揃えを指定し、揃えを表の見た目に反映**（Phase P） | プレビュー仕様・揃え操作行 |

## 画面構成

- `<main class="app-wide">`（Phase P で `app`→`app-wide` に変更。他4ツール（norm/diff/devpad/taskboard）が
  全て `app-wide` で excel2md だけ 900px だった。表プレビューを載せるため 1200px に揃える。P6）
- `<main>` 直下: `.tool-header`（「← ツール一覧」リンク＋「設定は自動保存されます」注記）
- 上部: タイトル＋1行説明。**1行説明（subtitle）と index.html の `desc` に「表プレビュー」を追記する**
  （現在はどちらも「結合セルの展開・列の揃え指定」までしか触れていない）
- ツールバー: **方向切替ラジオ［TSV→MD｜MD→TSV］** / 「1行目をヘッダーにする」チェック /
  「セル前後の空白を除去」チェック（TSV→MD のみ有効） / **「プレビュー（揃え指定）」チェック**（既定ON・永続化） /
  コピーボタン（方向により「Markdownをコピー」/「Excel用にコピー」）
  - **ラベル自体に「（揃え指定）」を含める**: OFF にすると揃えの操作手段も消えるという依存関係を、
    title を読まなくてもチェックボックスの文字だけで分かるようにする（P1）。
    title には補足として「変換結果の表プレビュー。列の揃え指定もここで行います」を置く
- 2ペイン（`.panes`）: 左=入力 textarea、右=出力 textarea（readonly）。ペインタイトルは方向に追従
- **プレビュー（`#preview-section`）: 2ペインの下に全幅**（P1）。詳細は「プレビュー仕様」節
- 入力ペインタイトル横: 「サンプルを入れる」ボタン（**入力が空のときのみ表示**。方向に応じたサンプル
  — TSV→MD はセル内改行入り TSV、MD→TSV は `<br>` 入り Markdown表 — を投入し即変換）
- コピーは **Cmd/Ctrl+Enter でも実行**（コピーボタンの title に表記）
- 警告バナー領域（`.banner`）: ツールバー直下（Phase P で揃えバーを撤去したため1段上がる）
- 入力は 200ms デバウンスでリアルタイム変換
- **方向は自動で反転しない**。入力が逆方向の形式に見えるとき（TSV→MD なのに Markdown 区切り行を検出等）は情報バナーで切替を提案する

## 変換仕様

1. **TSV解析**（既存ツールの `parseTsv`/`tryQuotedCell` を流用）: 改行正規化（CRLF/CR→LF）後、タブ・改行で分割。`"` で始まり、閉じ `"` の直後がタブ/改行/終端のセルのみ引用セルとして解釈（内部の `""` は `"` のエスケープ、セル内改行を保持）。単に `"` で始まるだけのセルはリテラル扱い。引用符を含まない入力は高速パス
2. **矩形化**: 最大列数に合わせ不足セルを `''` で補完（`padGrid` 流用、ループで最大値算出）
3. **Markdown生成**: 各行 `| a | b |` 形式。セル内 `|` → `\|`、セル内改行 → `<br>`。**区切り行は列ごとの揃えに従い `---`（none）/ `:---`（left）/ `:---:`（center）/ `---:`（right）**。揃えは `convert(text, {alignments})` で渡し、**省略時・列不足分は none**（＝従来どおり全列 `---`）
4. **ヘッダー**: ON=1行目をヘッダー行に。OFF=空セルのヘッダー行を挿入し全行をボディに（→要確認 E2M-Q2）
5. **trim**: ON のとき各セルの前後空白（半角/全角スペース・タブ）を除去。セル内改行と中間の空白は保持
6. **タブなし入力**: 1列の表として変換し情報バナー表示（CLAUDE.md の best-effort 原則により決定済み）

## 変換仕様（MD→TSV 方向。旧版の挙動を正として移植）

1. **Markdown表パース**（旧版 `parseMarkdownTable`/`splitMarkdownRow`/`parseMarkdownSeparator` を流用）: 「`|` を含む行」の直後に区切り行（各セルが `:?-+:?`）が現れる位置をヘッダー行とみなす。縁の `|` は任意。`\|` は `|` のエスケープ。区切り行から列ごとの揃え（left/center/right/none）を取得
8. **表の終端は空行**（XL-2 対応・2026-08-05）: ボディは **空行** または「`|` を含まない行」が
   現れるまで。GFM と同じ規則にする。
   - **空行を走査前に捨ててはいけない**。従来は `filter(l => l !== '')` で空行を除去していたため、
     空行で区切られた2つ目の表を1つ目に吸収し、**その区切り行が `---` というデータ行として
     混入していた**（`| A | B |`＋`| C | D |` の2表 → `A\tB / 1\t2 / C\tD / ---\t--- / 3\t4`）。
     Excel に貼って気づかず提出する事故につながるため、欠落より危険な誤変換だった
   - **逆に、空行なしで区切り行が現れる場合は GFM どおり単なるデータ行**として扱う
     （表を切るには空行が必要）。`| 1 | 2 |` を「次の表のヘッダー」と誤認して落としてはいけない
   - 副作用: 空行の後に続く「`|` を含むが区切り行を伴わない行」（例 `| C | D |` 単独）も
     ボディに取り込まなくなる。GFM では段落であり表データではないため、これが正しい
9. **2つ目以降の表の通知**（XL-2）: 1つ目の表の終端以降に**別の表**
   （「`|` を含む行」＋区切り行の並び）があれば info バナー
   「**最初の表のみ変換しました（2つ目以降の表は無視されます）**」を出す。
   `parseMarkdownTable` の戻り値に `moreTables: bool` を追加して判定する
   - **表でない後続テキストでは出さない**。表の後に説明文が続くのは通常の文書であり、
     それを TSV に含めないのは期待どおりの動作のため（バナーを出すとノイズになる）
2. **セル内 `<br>`**: セル内改行として復元（`<br>` `<br/>` `<br />` 大文字小文字問わず）
3. **TSV生成**（旧版 `gridToTsv`）: タブ・改行・`"` を含むセルのみ `"` 囲み（内部の `"` は `""`）
4. **Excel貼り付け用HTML**（旧版 `gridToHtmlTable`）: ヘッダーON時は1行目を `<th>`。揃えは `align` 属性＋`style`。セル内改行は `<br style="mso-data-placement:same-cell">`（Excel が同一セル内改行として解釈）
4b. **書式付き貼り付け（2026-08-13）**: 全セルに罫線 `border:.5pt solid #a6a6a6`、
   `<th>` に `background:#d9d9d9`（貼り付け時に Excel の罫線・ヘッダー色になる）。
   さらに **Excel が貼り付け時に値を変えてしまうパターンのセルだけ**
   `mso-number-format:'\@'`（文字列書式）で守る — E2M-F02:
   - 日付化: `^\d{1,4}[-/]\d{1,2}([-/]\d{1,4})?$`（`1-2` → 2月1日 の事故）
   - 時刻化: `^\d{1,2}:\d{2}(:\d{2})?$`（`1:30` → 0.0625）
   - 先頭ゼロ落ち: `^0\d+$`（`0123` → 123）
   - 指数表記・精度落ち: `^\d{12,}$`（12桁以上。15桁超は値も失われる）
   - 数式解釈: `^[=+@]`（`=SUM(A1)` 等。**`-1` などの負数は数値のまま**にする）
   - 末尾ゼロの小数: `^-?\d+\.\d*0$`（`0.00` → 0、`1.50` → 1.5 と表示が変わる。
     ddl2spec の既定値セル `0.00` が実例）
   該当しない数値セルは数値のまま貼られる（Excel 側で集計可能なことを優先し、
   全セル文字列化はしない）。**Excel 実機での見た目は自動検証できない**ため、
   下の「Excel 実機スモーク項目」で手動確認する
5. **Excel用コピー**（`lib/excel.js` の `ToolExcel.copy` — 2026-08-13 に共通核へ抽出）:
   **execCommand 先行**で text/html＋text/plain を書く（Chrome の async clipboard は HTML を
   サニタイズし mso-data-placement / mso-number-format が落ちるため）。失敗時 ClipboardItem、
   それも不可なら出力 textarea 選択フォールバック（TSVのみ）。
   **文字列化ガード（4b）のパターンと罫線・背景の style も `lib/excel.js`（`cellStyle`）が正本**
6. **方向を MD→TSV に切り替えたとき**はヘッダートグルを自動 ON（Markdown 表は構文上ヘッダー確定 — 旧版挙動）。トグル OFF は Excel コピーの `<th>`/`<td>` にのみ影響（TSV 出力は不変）
7. **揃え情報の喪失を明示**（Phase G）: 区切り行に none 以外の揃えが1列でもあれば情報バナー
   「揃え指定（:--- 等）はTSVでは失われます（「Excel用にコピー」のHTMLには反映されます）」を出す。
   TSV は列揃えを表現できないため喪失は仕様。**HTML 経路（Excel用にコピー）では `align` 属性で保持される**

## Excel貼り付けの取り込み（text/html・結合セル展開。Phase G）

Excel は結合セルを text/plain では「先頭セルに値・残りは空」として出すため、TSV 経路では結合が失われる。
クリップボードの text/html を解析して**結合範囲の全セルに同じ値を繰り返す**ことで、この欠落を補う。

1. **適用範囲**: **TSV→MD 方向**の入力 textarea への paste のみ（G2）。MD→TSV 方向では介入しない
   （レンダリング済み Markdown 表を貼ったときに TSV が混入し誤変換になるため）
2. **経路の選択**（G4）: `clipboardData.getData('text/html')` に `<table>` があれば**常に** HTML 経路。
   旧版 `parseHtmlTable` を移植し、最初の `<table>` を対象に **rowspan/colspan を占有マトリクスで展開**
   （結合範囲の全セルに同値を繰り返す）→ `gridToTsv` で TSV 化 → **選択位置へ挿入**（G3。通常の貼り付けと
   同じ textarea 意味論。全置換はしない）→ デバウンスを待たず即変換
3. **セルテキスト抽出**（旧版 `htmlCellText`）: `<br>` を NUL センチネルに置換 → ソース上の生の空白・改行を
   1スペースに圧縮（ブラウザの描画と同じ）→ NBSP をスペース化 → センチネルのみ改行に復元 → trim。
   不可視文字は `String.fromCharCode` で生成しソースに実文字を混入させない
4. **フォールバック**: text/html が無い / `<table>` が無い / 展開結果が空 / 上限超過 / MD→TSV 方向 のときは
   `preventDefault` せず**既定の貼り付け**（text/plain）に委ねる
5. **取り込み通知**（info バナー）: 結合セルがあった場合「HTMLの表を取り込み、結合セルを展開しました」/
   無い場合「HTMLの表として取り込みました」。**変換警告と併記**し、**次の手入力まで保持**する
   （norm の NM-13 と同型の「バナー即消え」を避ける）。実装は通知を
   **「その通知を生んだ入力値」に紐づけ**、入力値が変わったら失効させる方式。
   **Chrome の `execCommand('insertText')` は複数行テキストで行ごとに `input` イベントを発火する**
   （`'A\tB\nA\tC'` の挿入で3回。2026-08-04 実測）ため、イベント回数に依存する方式
   （「貼り付け由来の1回だけ通すフラグ」等）は2回目以降で通知が消えて成立しない
6. **file:// 動作**: paste イベントの `clipboardData` はユーザージェスチャに紐づくためプロトコル制約を受けない。
   **2026-08-04 に file:// で実測済み**（Chromium・実 Cmd+V）:
   - HTML フレーバーのみのクリップボード → `types=['text/html']`、rowspan 入り HTML を完全取得
     （**このとき text/plain は空**＝既定の貼り付けでは何も入らず、HTML 経路が唯一の取り込み手段になる）
   - text/plain のみ → `types=['text/plain']`、html は空文字（フォールバック成立）
   - 実 Excel からのコピー（両フレーバー・`Generator: Microsoft Excel 15`）→ 両方取得。
     `<!--StartFragment-->`・`<colgroup>`・MSO 独自 CSS を含む重装 HTML でも
     `DOMParser` + `querySelector('table')` + `table.rows` 走査で正しくセルを取れる

## プレビュー仕様（Phase P）

変換結果を**実際の表として描画**し、**プレビュー最上段の「揃え操作行」で列の揃えを指定する**
（旧 `excel2md/excel2md.html` の `tr.align-row` 相当）。Phase G のチップ行 `.align-bar` は撤去する。

### DOM 構造

```
<section id="preview-section" hidden>
  <h2>プレビュー <span class="muted" id="preview-hint"></span></h2>
  <div id="preview-wrap">
    <table class="preview" id="preview">
      <thead>
        <tr class="align-row"><th>…列ごとの揃え操作…</th>…</tr>  ← 常に1行・sticky
        <tr><th>…grid[0]…</th>…</tr>                            ← ヘッダーON のときだけ
      </thead>
      <tbody><tr><td>…</td>…</tr>…</tbody>
    </table>
  </div>
  <p class="muted" id="preview-note" hidden></p>
</section>
```

- 生成は `createElement` + `textContent` のみ。**HTML 文字列の組み立てはしない**
  （貼り付け内容による注入を防ぐ。旧版と同じ方針）
- `#preview-hint`（h2 内・muted・12px）は方向で切替:
  - TSV→MD: 「（最上段のボタンで列の揃えを切替）」
  - MD→TSV: 「（区切り行から読んだ揃えを表示。変更は入力の Markdown 側で）」
- `#preview-wrap`: `max-height: 60vh; overflow: auto`。**揃え操作行は `position: sticky; top: 0`**
  （長い表をスクロールしても揃えを操作できる）
  - `border-collapse: collapse` では sticky セルの境界線がスクロールで消える（境界線が
    セルではなくテーブルに属するため）。揃え操作行には `box-shadow: inset 0 -1px 0 var(--border)`
    で下辺を描き、`z-index: 1` で本文セルより前面に置く
- 表の寸法とセルの `white-space: pre-wrap`（セル内改行を実際の改行として見せる）、
  `vertical-align: top`、`border: 1px solid var(--border)` は旧版 CSS を踏襲する
- プレビュー用 CSS はツール側 `<style>` に置く（ui.css はツール共通部品のみ。lib/ui.css 冒頭の方針）

### 揃え操作行（TSV→MD 方向）

- 列ごとに `<th>` 1個、中に `<button class="align-btn">`。ラベルは `−` / `左` / `中央` / `右`
- クリック（キーボードは Enter / Space）で **− → 左 → 中央 → 右** と循環。押した瞬間に
  出力の区切り行と**表の見た目**（その列の全セルの `text-align`）の両方に反映される
- `title` と `aria-label` は「列N の揃え: 左（クリックで なし→左→中央→右）」
- ボタンは `min-width: 44px`（最長ラベル「中央」でも押すたびに幅が動かないようにする）
- 列数が変わっても**列位置で揃えを保持**（増えた列は −）。**grid が空になったらリセット**
  （空入力・入力上限超過。Phase G から不変）

### 揃えの表示（MD→TSV 方向）

- プレビューは**読み取り専用**。揃え操作行は `<button>` を置かず**静的テキスト**（muted）で
  区切り行から読んだ揃え（`−`/`左`/`中央`/`右`）を表示する（P5）
- 理由: この方向の揃えの正本は入力 Markdown の区切り行。プレビューから編集させると入力テキストの
  書き換えが必要になり、「変換ロジックは変更しない」という本フェーズの制約を超える
- 揃えが TSV で失われることは既存の info バナー（「変換仕様（MD→TSV）」7）で通知済み。
  プレビューは**何が失われるのかを目で確認する手段**になる
- 副作用として ux-backlog の **XL-1**（「MD→TSV 時に『1行目をヘッダーにする』が画面上無反応に見える」）が
  緩和される: トグル OFF で grid[0] が `<thead>` から `<tbody>` に移り、`<th>`/`<td>` の切替（＝Excel 用
  HTML に効いている変化）がプレビュー上で見えるようになる。TSV 出力が変わらないことは従来どおり

### 描画上限（P4）

プレビューは入力の 200ms デバウンスで**打鍵ごとに再描画**される（旧版は paste 1回につき1回だった）。
また `rowspan`/`colspan` 展開や横長の Excel 範囲で列数は数百〜千になりうる。
このため旧版の行数上限だけでは足りず、**セル数の予算**を追加する。

| 定数 | 値 | 意味 |
|---|---|---|
| `PREVIEW_MAX_COLS` | 60 | 描画する列数の上限（Phase G の `ALIGN_MAX_COLS` を引き継ぐ） |
| `PREVIEW_MAX_ROWS` | 200 | 描画する grid 行数の上限（旧版と同値） |
| `PREVIEW_MAX_CELLS` | 5000 | 描画セル数の予算（**Phase P で新設**。打鍵ごと再描画のため） |

```js
function previewShape(rows, cols) {
  const shownCols = Math.min(cols, PREVIEW_MAX_COLS);
  const budget = shownCols > 0 ? Math.floor(PREVIEW_MAX_CELLS / shownCols) : 0;
  const shownRows = Math.min(rows, PREVIEW_MAX_ROWS, budget);
  return { shownRows, shownCols, omittedRows: rows - shownRows, omittedCols: cols - shownCols };
}
```

- **超過分のみ省略**し、プレビュー自体は残す（P4。CLAUDE.md の「不正入力でも落ちず最善の出力を出す」
  best-effort 原則。大きな表でも先頭は確認でき、先頭60列は揃えを操作できる）
- 注記は `#preview-note`（muted・12px・プレビュー直下）に出す。**警告バナーは使わない**
  （変換警告を潰さないため。既存の copy-hint と同じ方針）
  - 行超過: 「残りN行は省略されています（出力にはすべて含まれます）」（旧版の文言）
  - 列超過: 「61列目以降は省略されています（出力にはすべて含まれます）」
  - 両方超過: ` / ` で連結
- `shownRows` は **grid 行数**（ヘッダー行を含む）。ヘッダーON のとき `<tbody>` の行数は `shownRows - 1`
- 揃え操作行の `<th>` 数とデータ行のセル数はどちらも `shownCols` で一致させる。
  **61列目以降は揃えを指定できず区切り行は `---`**（Phase G と同じ。出力自体は全列そのまま出る）
- **プレビューが丸ごと消えるのは3つの場合だけ**: grid が空（空入力・入力上限超過）/
  「プレビュー」トグルOFF / MD→TSV で Markdown 表として認識できなかったとき
- `previewShape` は `window.excel2md` に公開し、上限ロジックを DOM 抜きで照合できるようにする

### 再描画（P8）

`{shownRows, shownCols, hasHeader, direction}` を「形」として保持し、**形が前回と同じなら DOM を
作り直さず**、各セルの `textContent` と `style.textAlign`、ボタンのラベル/`aria-label` だけ更新する。

- 理由1（フォーカス保持）: 作り直すとクリックした揃えボタンが DOM から外れてフォーカスが body に戻り、
  Enter 連打での連続切替ができない（Phase G のチップ行と同じ制約。`web/excel2md.html` の
  「列数が同じならチップ要素を作り直さない」コメントと同趣旨）
- 理由2（コスト）: 打鍵ごとの再描画で最大5000セルを毎回捨てて作り直すのを避ける
- 揃えクリック時は形が変わらないため必ず再利用パスを通る

### 純関数の戻り値の変更（P7・変換ロジックは不変）

プレビューは grid そのものを必要とするため、変換入口の戻り値に `grid` を**追加**する。
セル値の算出・出力生成のロジックは一切変更しない。

| 関数 | 変更前 | 変更後 |
|---|---|---|
| `convert(text, opts)` | `{markdown, warnings, cols, firstRow}` | `{markdown, warnings, grid}` |
| `convertFromMd(text, opts)` | `{tsv, html, alignments, warnings}` | `{tsv, html, alignments, warnings, grid}` |

- `cols` / `firstRow` は撤去するチップ行のラベル描画専用だったため削除する
  （必要なら `grid[0].length` / `grid[0]` で代替できる）
- `convert` の `grid` は **trim 適用後**のもの（プレビューが出力と一致するため）。
  `convertFromMd` の `grid` は `parseMarkdownTable` の結果そのもの
- `grid` は**参照を返すだけでコピーしない**（大きな表での複製コストを避ける）。呼び出し側は読み取り専用で扱う
- 認識失敗・上限超過時の `grid` は `[]`（プレビュー非表示の判定に使う）
- 既存テスト（E2M-01〜10 / R01〜R08 / H01〜H09）は `markdown` / `tsv` / `html` / `alignments` /
  `warnings` のみを照合するため影響を受けない

## オプション仕様

| オプション | 既定値 | 永続化 |
|---|---|---|
| 方向（tsv2md / md2tsv） | tsv2md | する（`tools:excel2md`） |
| 1行目をヘッダーにする | ON | する（E2M-Q3 で決定。`tools:excel2md`） |
| セル前後の空白を除去 | ON | 同上（TSV→MD のみ有効） |
| **プレビュー（Phase P）** | ON | する（`tools:excel2md`。UI 状態のため localStorage が正本） |
| **列の揃え（alignments）** | 全列 none | **しない**（表の内容に従属する状態のため。grid が空でリセット） |

## エラー・警告仕様

- 列数不一致: 変換は続行（空セル補完）し警告バナー「行によって列数が異なるため空セルで補完しました（最大N列）」
- タブなし入力: 変換は続行（1列表）し情報バナー「タブ区切りが見つからないため1列の表として変換しました」
- 空入力: 出力空・バナー非表示
- **性能ガード①（入力文字数）**: 入力が 2,000,000 文字を超えたら処理せず警告「入力が上限（200万文字）を超えたため処理を中止しました」（出力は空。一部のみ処理はしない）
- **性能ガード②（HTML展開後セル数。Phase G）**: HTML 取り込みは①に加えて次の2段で守る。
  超過時はいずれも**展開せず**警告を出し、**既定の貼り付けにフォールバック**する
  （CLAUDE.md の best-effort 原則。text/plain があればそれが入り、無ければ何も入らないが理由は表示される）
  - text/html 自体が 2,000,000 文字超 → 「HTMLの表が上限（200万文字）を超えたため取り込みを中止しました。通常の貼り付けとして処理します」
  - 展開後セル数が **200,000 セル**超 → 「HTMLの表が上限（20万セル）を超えたため取り込みを中止しました。通常の貼り付けとして処理します」
  - セル数は**展開ループの内側で累積し上限で即打ち切る**。`rowspan`/`colspan` は少数のセルでも
    巨大なグリッドに展開されうる（ブラウザのクランプ上限は rowspan 65534・colspan 1000 で、
    1セルでも最大約6500万セル）ため文字数では守れない。また rowspan の張り出しにより実際の列数は
    「各行の colspan 合計」を上回りうるため、事前見積もりでは過小評価になり守り切れない
- コピー: 出力が空のときはコピーせず「出力がありません」を表示。コピー時はデバウンス中の変換を同期確定してから書く。フォールバック案内は警告バナーではなく専用表示（変換警告を潰さない）
- どの入力でも例外で落ちない

## 保存仕様

キー `tools:excel2md`、payload `{header: bool, trim: bool, direction: 'tsv2md'|'md2tsv', preview: bool}`
（E2M-Q3 で決定＋双方向化で direction 追加＋Phase P で preview 追加）。
入力テキスト自体・列の揃えは保存しない。`preview` が未保存（旧 payload）のときは既定 ON として扱う。

## テストケース

`window.excel2md.convert(input, {header, trim, alignments})` → `{markdown, warnings, grid}` で照合
（`grid` はプレビュー描画用。省略時オプションは既定値 header:true, trim:true, alignments:[]）。

| ID | 前提 | 入力 | 期待出力（markdown） |
|---|---|---|---|
| E2M-01 | 既定 | `'名前\t年齢\n田中\t30\n佐藤\t25'` | `'| 名前 | 年齢 |\n| --- | --- |\n| 田中 | 30 |\n| 佐藤 | 25 |'` |
| E2M-02 | 既定 | `'項目\tメモ\nA\t"1行目\n2行目"'` | `'| 項目 | メモ |\n| --- | --- |\n| A | 1行目<br>2行目 |'` |
| E2M-03 | 既定 | `'記号\t説明\na \| b\t縦棒'` | `'| 記号 | 説明 |\n| --- | --- |\n| a \\| b | 縦棒 |'` |
| E2M-04 | 既定 | `'A\tB\tC\nx\ty'` | `'| A | B | C |\n| --- | --- | --- |\n| x | y |  |'`、warnings に列数不一致1件 |
| E2M-05 | trim:false | `' a \tb'` | `'|  a  | b |\n| --- | --- |'` |
| E2M-06 | 既定 | `'こんにちは'` | `'| こんにちは |\n| --- |'`、warnings にタブなし情報1件 |
| E2M-07 | header:false | `'x\ty'` | `'|  |  |\n| --- | --- |\n| x | y |'`（E2M-Q2 の推奨案採用時） |
| E2M-08 | 既定 | `'x'.repeat(2000001)` | `''`（markdown空）、warnings に「上限」warn 1件 |
| E2M-09 | alignments:`['left','right']` | `'A\tB\n1\t2'` | `'| A | B |\n| :--- | ---: |\n| 1 | 2 |'` |
| E2M-10 | alignments:`['center']` | `'A\tB'` | `'| A | B |\n| :---: | --- |'`（不足列は `---`） |

MD→TSV 方向（`window.excel2md.convertFromMd(input, {header})` → `{tsv, html, alignments, warnings}` で照合）:

| ID | 前提 | 入力 | 期待 |
|---|---|---|---|
| E2M-R01 | 既定 | `'| A | B |\n| --- | --- |\n| 1 | 2 |'` | tsv=`'A\tB\n1\t2'` |
| E2M-R02 | 既定 | `'| a | x<br>y |\n| --- | --- |'` | tsv=`'a\t"x\ny"'`（セル内改行は"囲み）、html に `mso-data-placement:same-cell` を含む |
| E2M-R03 | 既定 | `'| a \\| b |\n| --- |'` | tsv=`'a | b'`（エスケープ解除） |
| E2M-R04 | 既定 | `'A | B\n--- | ---\n1 | 2'`（縁パイプなし） | tsv=`'A\tB\n1\t2'` |
| E2M-R05 | 既定 | `'| A | B |\n| :--- | ---: |\n| 1 | 2 |'` | tsv=`'A\tB\n1\t2'`、alignments=`['left','right']`、html の1列目に `align="left"`、**warnings に揃え喪失 info 1件**（Phase G で追加） |
| E2M-R06 | 既定 | `'ただのテキスト'` | tsv=`''`、warnings に「認識できません」warn 1件 |
| E2M-R07 | 往復 | E2M-09 の出力 | `convertFromMd` の tsv=`'A\tB\n1\t2'`・alignments=`['left','right']`。その2値を `convert(tsv, {alignments})` に戻すと **E2M-09 の出力に一致**（揃えの往復保証） |
| E2M-R08 | 既定 | `'| A |\n| :--- |\n| 1 |'` | warnings に揃え喪失 info 1件（`'| A |\n| --- |\n| 1 |'` では 0件） |
| E2M-R09 | 既定（XL-2） | `'| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |'`（空行区切りの2表） | tsv=`'A\tB\n1\t2'`（**1つ目だけ。`---` が混入しない**）、warnings に「最初の表のみ変換しました（2つ目以降の表は無視されます）」info 1件 |
| E2M-C1 | コピー結果表示（✓）中に変換方向を切り替える | 1.5秒後の復帰ラベルが**切替後の方向のもの**になる（`Markdownをコピー`）。復帰ラベルは `dataset.label` を**復帰時点で読む**（呼び出し時に控えると古い方向のラベルに戻る。2026-08-07 の lib/ui.js 共通化で実測した回帰） |
| E2M-R10 | 既定（XL-2） | 表→空行→`'説明'`→空行→表 / 空行区切りの3表 / 列数の違う2表 | いずれも tsv=`'A\tB\n1\t2'`＋同じ info 1件（テキストを挟んでも、3つ以上でも、列数が違っても1つ目だけ） |
| E2M-R11 | 既定（XL-2） | `'| A | B |\n| --- | --- |\n| 1 | 2 |\n| --- | --- |\n| 9 | 9 |'`（**空行なし**で区切り行が現れる） | tsv=`'A\tB\n1\t2\n---\t---\n9\t9'`（GFM どおり `---` はデータ行）、**warnings 0件**（次の表と誤認しない） |
| E2M-R12 | 既定（XL-2） | 1表のみ / 前置テキスト＋表 / 表→後続テキストのみ / 表→空行→`'| C | D |'`（区切りなし） | すべて tsv=`'A\tB\n1\t2'`・**warnings 0件**（誤検出しない。最後のケースは `| C | D |` を取り込まない） |
| E2M-F01 | 書式 | `gridToHtmlTable([['H','K'],['a','b']], true, [])` | 4セル全ての style に `border:.5pt solid #a6a6a6`。`background:#d9d9d9` は `<th>` の2つだけ（`<td>` には無い） |
| E2M-F02 | 書式 | `[['1-2','2026/8/13','1:30','0123','123456789012','=SUM(A1)','0.00']]`・ヘッダー無し | 7セル全てに `mso-number-format:'\@'`（日付化・時刻化・ゼロ落ち・指数表記・数式解釈・末尾ゼロ小数から守る） |
| E2M-F03 | 書式 | `[['abc','123','-1','1.5','2026年8月']]`・ヘッダー無し | `mso-number-format` が**1つも付かない**（通常テキスト・整数・負数・小数は素のまま＝Excel で集計できる） |

結合セル展開（`window.excel2md.parseHtmlTable(html, maxCells)` → `{grid, merged, tooLarge}`、
`window.excel2md.convertFromHtml(html)` → `{tsv, merged, warnings}` で照合。
`grid=null, tooLarge=false` は「表なし」、`tsv=null` は「取り込まず既定の貼り付けに委ねる」を意味する）:

| ID | 入力 | 期待 |
|---|---|---|
| E2M-H01 | `'<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>'` | grid=`[['A','B'],['A','C']]`、merged=true。`convertFromHtml` の tsv=`'A\tB\nA\tC'`、warnings に「結合セルを展開」info 1件 |
| E2M-H02 | `'<table><tr><td colspan="2">X</td></tr><tr><td>a</td><td>b</td></tr></table>'` | grid=`[['X','X'],['a','b']]`、merged=true |
| E2M-H03 | `'<table><tr><td>a<br>b</td><td>c\n  d</td></tr></table>'` | grid=`[['a\nb','c d']]`（`<br>` のみ改行、ソースの生改行と連続空白は1スペースに圧縮）、merged=false。`convertFromHtml` の warnings は「HTMLの表として取り込みました」info 1件 |
| E2M-H04 | `'<div>ただのテキスト</div>'` | grid=null、tooLarge=false。`convertFromHtml` の tsv=null、warnings 0件（無言でフォールバック） |
| E2M-H05 | UI: 空入力・TSV→MD で `text/html`=H01 の合成 paste | `defaultPrevented=true`、入力=`'A\tB\nA\tC'`、出力=`'| A | B |\n| --- | --- |\n| A | C |'`、バナーに「結合セルを展開」 |
| E2M-H06 | UI: `text/plain` のみ（`'a\tb'`）の合成 paste | `defaultPrevented=false`（既定の貼り付けに委ねる）、入力値は変化せず、取り込み通知は出ない |
| E2M-H07 | UI: MD→TSV 方向で H01 の `text/html` を合成 paste | `defaultPrevented=false`、入力値は変化せず、取り込み通知は出ない |
| E2M-H08 | `'<table><tr><td rowspan="1000" colspan="1000">A</td></tr></table>'`（展開後100万セル）、maxCells=200000 | grid=null、tooLarge=true。`convertFromHtml` の tsv=null、warnings に「上限（20万セル）」warn 1件（**性能ガード②**） |
| E2M-H09 | `'<table><tr><td rowspan="200" colspan="1000">A</td></tr></table>'`（展開後20万セル＝上限ちょうど）、maxCells=200000 | tooLarge=false、grid は 200行×1000列（正当な大きい表を誤って弾かない） |

### プレビュー（Phase P）

描画上限は純関数 `window.excel2md.previewShape(rows, cols)` → `{shownRows, shownCols, omittedRows, omittedCols}` で照合:

| ID | 入力 | 期待 |
|---|---|---|
| E2M-P01 | `previewShape(3, 2)` | `{shownRows:3, shownCols:2, omittedRows:0, omittedCols:0}`（上限内はそのまま） |
| E2M-P02 | `previewShape(1000, 3)` | `{shownRows:200, shownCols:3, omittedRows:800, omittedCols:0}`（行上限が効く） |
| E2M-P03 | `previewShape(500, 60)` | `{shownRows:83, shownCols:60, omittedRows:417, omittedCols:0}`（セル予算 5000/60 が効く） |
| E2M-P04 | `previewShape(10, 100)` | `{shownRows:10, shownCols:60, omittedRows:0, omittedCols:40}`（列上限のみ効く） |
| E2M-P05 | `previewShape(0, 0)` | `{shownRows:0, shownCols:0, omittedRows:0, omittedCols:0}`（0除算しない） |
| E2M-P06 | `previewShape(200, 25)` | `{shownRows:200, shownCols:25, omittedRows:0, omittedCols:0}`（5000セル＝予算ちょうど。正当な表を弾かない） |

UI（`file://` で開き、入力 textarea に値を設定して `input` イベント発火 → デバウンス後に DOM を照合）:

| ID | 前提・操作 | 期待 |
|---|---|---|
| E2M-P07 | E2M-01 の入力（3行2列）・ヘッダーON | `#preview-section` 表示。`thead tr`=2（揃え操作行＋ヘッダー行）、`tbody tr`=2、`thead tr:nth-child(2) th` の textContent=`['名前','年齢']`、揃えボタン=2個で両方ラベル `−`。**列数・行数が変換結果と一致** |
| E2M-P08 | P07 で1列目の揃えボタンを click | ボタンラベル=`左`、1列目の `th`/`td` すべてが `text-align: left`、**出力の区切り行が `| :--- | --- |`**。続けて2回 click で `右`／`| ---: | --- |`、もう1回で `−`／`| --- | --- |` に戻る（− → 左 → 中央 → 右 の循環） |
| E2M-P09 | P07 でヘッダーOFF | `thead tr`=1（揃え操作行のみ）、`tbody tr`=3（全行データ）、`tbody th` が0個、揃えボタンは2個のまま |
| E2M-P10 | 入力を空にする | `#preview-section` が hidden、コンソールエラー0。再投入すると揃えが `−` に戻る（grid 空でリセット） |
| E2M-P11 | E2M-04 の入力 `'A\tB\tC\nx\ty'`（列数不一致） | プレビューは3列。`tbody tr`=1・そのセル数=3で3番目の textContent=`''`（空セル補完が見える）。例外なし |
| E2M-P12 | E2M-02 の入力（セル内改行） | 該当セルの textContent=`'1行目\n2行目'`（`'<br>'` という文字列を含まない）、算出スタイルの `white-space`=`pre-wrap` |
| E2M-P13 | `'a\tb\n<b>x</b>\ty'` | セルの textContent=`'<b>x</b>'`、`#preview b` が存在しない（HTML 注入されない） |
| E2M-P14 | 205行×3列 | `tbody tr`=199（=`shownRows` 200 − ヘッダー1行）、`#preview-note` が表示され「残り5行」を含む |
| E2M-P15 | 2行×70列 | 揃えボタン=60個、`tbody tr`=1 のセル数=60、`#preview-note` が「61列目以降」を含む |
| E2M-P16 | 500行×60列 | `tbody tr`=82（=`shownRows` 83 − ヘッダー1行）、`#preview-note` が「残り417行」を含む（セル予算） |
| E2M-P17 | MD→TSV 方向で E2M-R05 の入力 | プレビュー表示。揃え操作行に `<button>` が0個（静的テキスト `左`/`右`）、1列目セルが `text-align: left`・2列目が `right`、`#preview-hint` が「変更は入力の Markdown 側で」を含む |
| E2M-P18 | MD→TSV 方向で E2M-R06 の入力（表として認識できない） | `#preview-section` が hidden、認識失敗の warn バナーは従来どおり表示、例外なし |
| E2M-P19 | 「プレビュー（揃え指定）」トグル OFF | `#preview-section` が hidden。リロード後も OFF が復元。ON に戻すと即座に描画される。ラベルの textContent が「（揃え指定）」を含む |
| E2M-P20 | 揃えボタンに Tab でフォーカス → Enter を続けて2回 | 2段進む（`−`→`左`→`中央`）。フォーカスが body に戻らない（形が同じなら DOM を作り直さない検証） |
| E2M-P21 | E2M-01〜10 / R01〜R08 / H01〜H09 を再実行 | **全 pass**（プレビュー追加で変換出力が変わらないこと） |
| E2M-P22 | 境界ケース6種を順に投入 | いずれも例外・コンソールエラーなし。**1行だけの表は `<tbody>` が空**（ヘッダー行が `<thead>` に入るため）: `'A\tB'`→thead2・tbody0・ボタン2 / `'あ\nい\nう'`→thead2・tbody2・ボタン1 / `'   '`（空白のみ）→tbody0 / `'\t'`（タブのみ）→ボタン2 / `'A\tB\n'`（末尾改行）→tbody0 / 入力上限超過→プレビュー hidden・出力空 |
| E2M-P23 | 30行の表で `#preview-wrap` を `scrollTop=400` までスクロール | 揃え操作行がラッパ上端に固定（`sticky`）、データヘッダ行は上へ流れて消える、`box-shadow` に `inset` が残る（collapse で枠線が消える対策が効いている） |
| E2M-25 | 入力欄で Tab ／ Esc の直後に Tab | **タブ文字が入る**（列区切りをキーボードで足せる — `lib/edit.js`）／ フォーカス移動に素通し（脱出経路） |
| E2M-P24 | ダークモード（`prefers-color-scheme: dark`） | `body` 背景と揃え操作行の背景が**どちらも暗色**（輝度 < 0.3）かつ**互いに異なる**（ui.css のトークン経由 — 2026-08-14 に色値のピン留めを止めた: パレット刷新のたびに偽 fail する「前提のすり替え」型のため）。右寄せ指定が `text-align: right` として効き、**横スクロールが発生しない** |

## 検証手順

> **合否の正本は `./test/run excel2md` が全 pass（コンソールエラー0件を含む）。**

```sh
./test/run excel2md     # このツールだけ
./test/run            # 全ツール（共通コードを触ったときの波及を見る）
```

実行の前提・出力の読み方は `test/README.md`。照合しているコードは `test/excel2md.js`。
**期待値の正本はこのファイル**（テストケース表）で、変えるときは spec を先に直す。

### ハーネスが照合している内容（意図の記録）

以下は手作業で検証していた当時の手順。**`browser_evaluate` は Playwright MCP の道具名**で、
現在のハーネスは playwright-core を直接起動するため **MCP には依存しない**
（→ `docs/verification-notes.md` §1）。テストが落ちたときに「何を確かめたかったのか」を
辿れるように残している。

**`./test/run excel2md` で下記1〜12を自動実行する**（ハーネスは `test/excel2md.js`。
`--shots` を付けると `.playwright-mcp/` にスクリーンショットを書く）。
以下は手順の意図の記録で、ハーネスが落ちたときの調査順にもなる。

1. `web/excel2md.html` を `file://` で開く → ロード時コンソールエラー0
2. 全テストケースを `browser_evaluate` で `window.excel2md.convert` に投入し文字列一致を確認
3. UI経路: 入力 textarea に E2M-01 を設定し `input` イベント発火 → 出力一致。E2M-04 で警告バナー表示を確認
4. コピーボタン click → フィードバック表示（`.copied`）または選択フォールバック案内（クリップボード実内容は検証対象外）
5. 全操作後にコンソール再取得 → 累計エラー0
6. （E2M-Q3 採用時）オプション変更→リロード→復元
7. index.html を開き直し「Convert Table」のリンクを click で辿り `<title>`（`Convert Table (excel2md)`）確認。**旧 md2excel エントリが無いこと**も確認
8. サンプルボタン: 空状態で表示 → click → 入力・出力とも非空になりボタンが消える。入力を空に戻すと再表示
9. 入力フォーカス中に Cmd/Ctrl+Enter → コピー実行（`.copied` フィードバックまたは選択フォールバック案内）
10. **プレビューと揃え（Phase P）**: E2M-P01〜P06 を `browser_evaluate` で `previewShape` に投入し
    オブジェクト一致を確認 → E2M-P07〜P21 を UI で照合。表の列数・行数、揃えボタンの click 循環と
    出力区切り行の連動、ヘッダーON/OFF、空入力、列数不一致、行/列/セル予算の各上限注記、
    MD→TSV の読み取り専用表示、トグル OFF とその復元、Tab→Enter 2回でのフォーカス保持を確認する
    （Phase P でチップ行を撤去するため `.align-bar` が存在しないことも確認）
11. **結合セル展開（Phase G）**: E2M-H05〜H07 を合成 `ClipboardEvent`（`new DataTransfer()` に
    setData した clipboardData）で dispatch し、`defaultPrevented`・入力値・出力・バナーを照合。
    実 Cmd+V での file:// 取得可否は 2026-08-04 に実測済み（「Excel貼り付けの取り込み」6 参照）
12. **取り込み通知の保持**: H05 の後 800ms 待ってバナーが残っていること（デバウンス後の再変換で
    消えないこと）→ その後入力を1文字編集して変換完了後にバナーから取り込み通知が消えること
13. **境界と見た目（Phase P）**: E2M-P22（境界6種）・P23（sticky）・P24（ダークモード・横スクロールなし）
    - 合成 paste の前には**空入力のデバウンスを待って揃えをリセットする**。待たないと直前のケースで
      設定した揃えが区切り行に残り H05 が偽 fail する（2026-08-05 に実際に踏んだ）

## Safari手動スモーク項目

- コピーボタンで「✓コピーしました」または「選択済みです。Cmd+C でコピーしてください」が出ること
- E2M-01 の貼り付け→変換→Excel の表が Markdown になること（表示崩れ・文字化けなし）
- MD→TSV: 「Excel用にコピー」→ Excel/Numbers のセルに貼り付けて表として展開され、セル内改行（E2M-R02）が同一セル内に収まること
- **結合セル（Phase G）**: Excel で結合セルを含む範囲をコピー → 貼り付けで結合が全セルに展開されること
  （Safari の `clipboardData.getData('text/html')` 可否を含む。非対応なら既定の貼り付けにフォールバックし
  警告なしで従来どおり動くこと）
- **プレビューと揃え指定（Phase P）**: プレビュー最上段の揃えボタン click で区切り行と表の見た目が同時に
  変わり、Markdown ビューア（Obsidian 等）に貼って寄せが効くこと。長い表でスクロールしても
  揃え操作行が上端に残ること（sticky）。ダークモードでプレビューの境界線・ヘッダー背景が判別できること

## Excel 実機スモーク項目（書式付きコピー・2026-08-13）

貼り付け先の Excel の解釈は自動検証できないため、実機で確認する:

- MD→TSV: 「Excel用にコピー」→ Excel に貼り付けて**罫線とヘッダー背景（灰色）が付く**こと
- `1-2`・`0123`・`1:30`・`=SUM(A1)` を含む表が、貼り付け後も**文字どおりのまま**であること
  （日付・時刻・数式・ゼロ落ちにならない）。`123` は数値として貼られ右寄せになること

## 決定事項（要確認の承認結果・2026-08-03）

- **E2M-Q1**: カテゴリ割当 → **決定: 4本とも「変換」**
- **E2M-Q2**: ヘッダーOFF時の挙動 → **決定: 空ヘッダー行挿入＋全行ボディ**（既存双方向ツールと同挙動）
- **E2M-Q3**: オプション（header/trim）の永続化 → **決定: する**（`tools:excel2md`）
- **E2M-Q4**（ハブ共通）: index.html への旧ツール `excel2md/excel2md.html` 掲載 → **決定: 掲載する**（file:// 相対リンク）
  → **Phase G（2026-08-04）で撤回。1本に集約したため index.html から削除**

## 決定事項（Phase G 統合・2026-08-04 承認）

- **G1**: 揃え指定 UI の形 → **決定: チップ行**（クリック循環。旧版プレビュー最上段クリックの操作感を継承）。
  代替案の列ごと `<select>`・テキスト指定欄（`l,c,r`）は不採用
  → **Phase P（2026-08-05）で撤回。プレビュー表を追加し、揃え指定をその最上段の揃え操作行に移した**
    （チップ行はどの列を操作しているか分かりにくく、実機で UI が後退したと判断。P2/P3）
- **G2**: HTML 取り込みの適用方向 → **決定: TSV→MD のみ**（MD→TSV でレンダリング済み Markdown 表を
  貼ると TSV が混入し誤変換になるため）
- **G3**: 取り込み時の挿入位置 → **決定: 選択位置に挿入**（通常の貼り付けと同じ textarea 意味論。
  旧版相当の全置換は不採用）
- **G4**: HTML 経路の使用条件 → **決定: text/html に `<table>` があれば常に**（経路が一本で予測可能。
  「結合セルがある時だけ」は不採用）
- **G5**（追加要件）: HTML 経路も性能ガードの対象 → **決定: 文字数（①）＋展開後セル数 20万（②）の2段。
  超過時は展開せず警告し既定の貼り付けにフォールバック**

## 決定事項（Phase P プレビュー・2026-08-05 承認）

- **P1**: プレビューの配置 → **決定: 2ペインの下に全幅**＋ツールバーに
  **「プレビュー（揃え指定）」**トグル（既定ON・永続化。OFF で揃えの操作手段も消える依存関係を
  title ではなく**ラベル自体**に出す — 2026-08-05 の追加指示）。
  - 不採用①「出力ペインをタブ切替（出力MD / プレビュー）」: 揃えを触りながら区切り行の変化を確認できない。
    Markdown 本文は最終成果物であり常時見えている方が良い
  - 不採用②「3ペイン（入力/出力/プレビュー）」: 1200px でも1列400px弱で表プレビューには狭すぎ、
    800px 以下では1列に折り返るため縦積みと同じになる
- **P2**: 揃えの操作方法 → **決定: プレビュー最上段の専用「揃え操作行」**（`tr.align-row` の `<th>` 内に
  `<button>`。ラベル `−`/`左`/`中央`/`右` をクリックで循環）。旧版 `excel2md/excel2md.html:592-601` と同じ構造。
  - 不採用「ヘッダーセル（`<th>`）自体をボタン化して兼用」: (a) ヘッダー行の全文が
    ボタン内に押し込まれて省略表示になり、プレビューの「変換結果をそのまま見せる」目的が損なわれる。
    (b) ヘッダーOFF のとき押す対象が無くなる（旧版の専用行はヘッダーON/OFF に依存しない）
- **P3**: Phase G のチップ行（`.align-bar`）→ **決定: 撤去**。理由:
  (a) 揃え操作行は列位置が表と視覚的に一致し、押した結果が表の見た目に出るため上位互換。
  (b) 上限超過時もプレビュー本体は残る（P4）ので「プレビューが出ないときのフォールバック」として
  残す必要がない。(c) 同じ状態を2箇所で操作できると不整合の疑いを生む
- **P4**: 描画上限超過時のふるまい → **決定: 超過分のみ省略し、プレビューは残す**（先頭 最大200行/60列、
  セル予算5000）。依頼時の案「超過時はプレビュー全体を省略＋バナー」は不採用 — CLAUDE.md の
  best-effort 原則に反し、かつ Phase G では先頭60列の揃えを操作できていたので機能後退になる
- **P5**: MD→TSV 方向のプレビュー → **決定: 表示する（読み取り専用）**。揃え操作行は静的テキスト。
  揃えの正本は入力 Markdown の区切り行であり、プレビューから編集させると入力テキストの書き換えが
  必要になって本フェーズの制約（変換ロジックを変更しない）を超える。
  - 不採用「MD→TSV では隠す」: 区切り行の揃えが TSV で失われることを目で確認できる価値を捨てるため
- **P6**: ページ幅 → **決定: `main.app`（900px）→ `main.app-wide`（1200px）**。
  他4ツールは既に `app-wide` で excel2md だけ 900px だったため、表を載せる本フェーズで揃える
- **P7**: 純関数の扱い → **決定: 戻り値に `grid` を追加**（`convert` / `convertFromMd`）。
  セル値の算出・出力生成のロジックは変更しない。チップ行専用だった `cols`/`firstRow` は削除
- **P8**: 再描画 → **決定: 形（表示行数×表示列数×ヘッダー有無×方向）が同じなら DOM を作り直さない**。
  Phase G のチップ行と同じフォーカス喪失の制約＋打鍵ごと再描画のコスト対策
