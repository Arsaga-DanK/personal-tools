# excel2md 仕様書兼テストケース

## 概要

Excel のセル範囲（TSV）⇔ Markdown テーブルを**双方向**に変換するツール（方向切替式）。`web/excel2md.html`、カテゴリ: 変換（→要確認 E2M-Q1）。MD→TSV 方向は旧双方向ツール `excel2md/excel2md.html` の挙動を正として移植（Phase F）。

**Phase G（2026-08-04）で旧版固有の2機能（列の寄せ指定・結合セルの展開）を移植し、excel2md を本ツール1本に集約した。** 旧 `excel2md/` は読み取りのみ（変更しない）。index.html からは削除済みで、数週間の併用後に `~/Personal/archive/` へ git 履歴ごと移動予定（docs/ux-backlog.md に記録。移動自体は未実施）。

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
| **列の寄せ指定（`:---` / `:---:` / `---:`）の出力と解釈**（Phase G） | 変換仕様 3・揃え指定 UI・変換仕様（MD→TSV）7 |
| **結合セル（colspan/rowspan）を全セル繰り返しで展開**（Phase G） | Excel貼り付けの取り込み |

## 画面構成

- `<main>` 直下: `.tool-header`（「← ツール一覧」リンク＋「設定は自動保存されます」注記）
- 上部: タイトル＋1行説明
- ツールバー: **方向切替ラジオ［TSV→MD｜MD→TSV］** / 「1行目をヘッダーにする」チェック / 「セル前後の空白を除去」チェック（TSV→MD のみ有効） / コピーボタン（方向により「Markdownをコピー」/「Excel用にコピー」）
- **揃えバー（`.align-bar`。ツールバーとバナーの間）**: **TSV→MD 方向かつ列が1以上のときのみ表示**。
  列ごとに1チップ「`<ラベル>: −|左|中央|右`」を並べ、クリックで − → 左 → 中央 → 右 と循環
  （旧版のプレビュー最上段クリックの翻案。本ツールにはプレビューが無いためチップ行に置く）。
  - ラベル: ヘッダーON時は1行目のセル内容（改行・連続空白は1スペースに畳み、9文字以上は8文字＋`…`）、
    ヘッダーOFF時および空セル時は「列N」（1始まり）
  - 列数が変わっても**列位置で揃えを保持**（増えた列は −）。**列が0になったら（空入力・上限超過）リセット**
  - **列数が変わらない限りチップ要素を作り直さない**（キーボードでフォーカスしたまま Enter 連打で
    連続切替できるようにするため。作り直すとフォーカスが body に戻る）
  - **表示は先頭60列まで**。超過時は「※ 61列目以降は揃え指定を省略しています」を muted で併記
    （区切り行は `---`。大きな表でチップ再構築が重くなるのを防ぐ）
- 2ペイン（`.panes`）: 左=入力 textarea、右=出力 textarea（readonly）。ペインタイトルは方向に追従
- 入力ペインタイトル横: 「サンプルを入れる」ボタン（**入力が空のときのみ表示**。方向に応じたサンプル
  — TSV→MD はセル内改行入り TSV、MD→TSV は `<br>` 入り Markdown表 — を投入し即変換）
- コピーは **Cmd/Ctrl+Enter でも実行**（コピーボタンの title に表記）
- 警告バナー領域（`.banner`）: 揃えバー直下
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

1. **Markdown表パース**（旧版 `parseMarkdownTable`/`splitMarkdownRow`/`parseMarkdownSeparator` を流用）: 「`|` を含む行」の直後に区切り行（各セルが `:?-+:?`）が現れる位置をヘッダー行とみなす。縁の `|` は任意。`\|` は `|` のエスケープ。区切り行から列ごとの揃え（left/center/right/none）を取得。表の後続は `|` を含む行が続く限りボディ
2. **セル内 `<br>`**: セル内改行として復元（`<br>` `<br/>` `<br />` 大文字小文字問わず）
3. **TSV生成**（旧版 `gridToTsv`）: タブ・改行・`"` を含むセルのみ `"` 囲み（内部の `"` は `""`）
4. **Excel貼り付け用HTML**（旧版 `gridToHtmlTable`）: ヘッダーON時は1行目を `<th>`。揃えは `align` 属性＋`style`。セル内改行は `<br style="mso-data-placement:same-cell">`（Excel が同一セル内改行として解釈）
5. **Excel用コピー**（旧版 `copyForExcel`）: **execCommand 先行**で text/html＋text/plain を書く（Chrome の async clipboard は HTML をサニタイズし mso-data-placement が落ちるため）。失敗時 ClipboardItem、それも不可なら出力 textarea 選択フォールバック（TSVのみ）
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

## オプション仕様

| オプション | 既定値 | 永続化 |
|---|---|---|
| 方向（tsv2md / md2tsv） | tsv2md | する（`tools:excel2md`） |
| 1行目をヘッダーにする | ON | する（E2M-Q3 で決定。`tools:excel2md`） |
| セル前後の空白を除去 | ON | 同上（TSV→MD のみ有効） |
| **列の揃え（alignments）** | 全列 none | **しない**（表の内容に従属する状態のため。列0でリセット） |

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

キー `tools:excel2md`、payload `{header: bool, trim: bool, direction: 'tsv2md'|'md2tsv'}`（E2M-Q3 で決定＋双方向化で direction 追加）。入力テキスト自体・列の揃えは保存しない。

## テストケース

`window.excel2md.convert(input, {header, trim, alignments})` → `{markdown, warnings, cols, firstRow}` で照合
（`cols`/`firstRow` は揃えバー描画用。省略時オプションは既定値 header:true, trim:true, alignments:[]）。

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

## 検証手順（Playwright）

1. `file:///Users/dan.kawazu/Personal/tools/web/excel2md.html` を開く → ロード時コンソールエラー0
2. 全テストケースを `browser_evaluate` で `window.excel2md.convert` に投入し文字列一致を確認
3. UI経路: 入力 textarea に E2M-01 を設定し `input` イベント発火 → 出力一致。E2M-04 で警告バナー表示を確認
4. コピーボタン click → フィードバック表示（`.copied`）または選択フォールバック案内（クリップボード実内容は検証対象外）
5. 全操作後にコンソール再取得 → 累計エラー0
6. （E2M-Q3 採用時）オプション変更→リロード→復元
7. index.html を開き直し excel2md のリンクを click で辿り `<title>` 確認。**旧 md2excel エントリが無いこと**も確認
8. サンプルボタン: 空状態で表示 → click → 入力・出力とも非空になりボタンが消える。入力を空に戻すと再表示
9. 入力フォーカス中に Cmd/Ctrl+Enter → コピー実行（`.copied` フィードバックまたは選択フォールバック案内）
10. **揃えバー（Phase G）**: E2M-01 投入 → バーが表示されチップラベルが「名前」「年齢」（ヘッダーON）。
    1列目チップを1回 click → 出力の区切り行が `| :--- | --- |`、3回で `---:`、4回で `---` に戻る。
    ヘッダーOFF → ラベルが「列1」「列2」。入力を空に → バーが消え、再投入時は揃えが − に戻る。
    MD→TSV に切替 → バー非表示。61列以上の入力で省略注記が出ること。
    チップに Tab でフォーカス → Enter を続けて2回押して2段進むこと（フォーカスが外れない）
11. **結合セル展開（Phase G）**: E2M-H05〜H07 を合成 `ClipboardEvent`（`new DataTransfer()` に
    setData した clipboardData）で dispatch し、`defaultPrevented`・入力値・出力・バナーを照合。
    実 Cmd+V での file:// 取得可否は 2026-08-04 に実測済み（「Excel貼り付けの取り込み」6 参照）
12. **取り込み通知の保持**: H05 の後 800ms 待ってバナーが残っていること（デバウンス後の再変換で
    消えないこと）→ その後入力を1文字編集して変換完了後にバナーから取り込み通知が消えること

## Safari手動スモーク項目

- コピーボタンで「✓コピーしました」または「選択済みです。Cmd+C でコピーしてください」が出ること
- E2M-01 の貼り付け→変換→Excel の表が Markdown になること（表示崩れ・文字化けなし）
- MD→TSV: 「Excel用にコピー」→ Excel/Numbers のセルに貼り付けて表として展開され、セル内改行（E2M-R02）が同一セル内に収まること
- **結合セル（Phase G）**: Excel で結合セルを含む範囲をコピー → 貼り付けで結合が全セルに展開されること
  （Safari の `clipboardData.getData('text/html')` 可否を含む。非対応なら既定の貼り付けにフォールバックし
  警告なしで従来どおり動くこと）
- **揃え指定（Phase G）**: チップ click で区切り行が変わり、Markdown ビューア（Obsidian 等）で寄せが効くこと

## 決定事項（要確認の承認結果・2026-08-03）

- **E2M-Q1**: カテゴリ割当 → **決定: 4本とも「変換」**
- **E2M-Q2**: ヘッダーOFF時の挙動 → **決定: 空ヘッダー行挿入＋全行ボディ**（既存双方向ツールと同挙動）
- **E2M-Q3**: オプション（header/trim）の永続化 → **決定: する**（`tools:excel2md`）
- **E2M-Q4**（ハブ共通）: index.html への旧ツール `excel2md/excel2md.html` 掲載 → **決定: 掲載する**（file:// 相対リンク）
  → **Phase G（2026-08-04）で撤回。1本に集約したため index.html から削除**

## 決定事項（Phase G 統合・2026-08-04 承認）

- **G1**: 揃え指定 UI の形 → **決定: チップ行**（クリック循環。旧版プレビュー最上段クリックの操作感を継承）。
  代替案の列ごと `<select>`・テキスト指定欄（`l,c,r`）は不採用
- **G2**: HTML 取り込みの適用方向 → **決定: TSV→MD のみ**（MD→TSV でレンダリング済み Markdown 表を
  貼ると TSV が混入し誤変換になるため）
- **G3**: 取り込み時の挿入位置 → **決定: 選択位置に挿入**（通常の貼り付けと同じ textarea 意味論。
  旧版相当の全置換は不採用）
- **G4**: HTML 経路の使用条件 → **決定: text/html に `<table>` があれば常に**（経路が一本で予測可能。
  「結合セルがある時だけ」は不採用）
- **G5**（追加要件）: HTML 経路も性能ガードの対象 → **決定: 文字数（①）＋展開後セル数 20万（②）の2段。
  超過時は展開せず警告し既定の貼り付けにフォールバック**
