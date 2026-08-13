# ddl2spec 仕様書兼テストケース

## 概要

PostgreSQL の DDL（`CREATE TABLE` ＋ `COMMENT ON`）と Markdown のテーブル定義書を
双方向に変換するツール。`web/ddl2spec.html`、表示名 `Schema`、カテゴリ: 設計。

**正本の方針（DS-Q6）**: **DDL を正本、定義書を生成物**とする。
定義書を正本にする運用に切り替える場合は DDL を生成物と決め、
**どちらの方向で運用するかを固定して両方を手で直さない**
（`~/Personal/vault/_rules/vault-rules.md` の「管理範囲の原則」— 正本の分裂を避ける）。

### 着手判定（`docs/tool-backlog.md` の着手ルール・2026-08-06）

| 判定 | 結果 |
|---|---|
| 原則1: チームで共有すべき情報か | **No**（定義書は自分が作る成果物。共有の正本は SharePoint 側の設計書） |
| 原則2: 使う瞬間に得をするか | **Yes**（変換の瞬間だけ使い、保持・更新を要求しない） |
| 既存ツールで代替できるか | **No**（入出力が構造的で Convert のタブ1枚に収まらない） |

## 要件対応表

| ユーザー要件 | spec 節 |
|---|---|
| DDL → 定義書（論理名・型・桁・NOT NULL・DEFAULT・PK・FK・UNIQUE・CHECK） | DDL → 定義書 |
| `COMMENT ON TABLE` / `COMMENT ON COLUMN` を論理名に反映 | DDL → 定義書 |
| 複数テーブルの一括変換 | DDL → 定義書 / DS-07 |
| 解釈できない構文は落とさず警告に出す | 警告仕様 / DS-05, DS-06 |
| 定義書 → DDL（`CREATE TABLE` ＋ `COMMENT ON`） | 定義書 → DDL |
| 列の対応はヘッダー名で判定（列順に依存しない） | ヘッダー名の対応表 / DS-04 |
| SQL トークナイザの流用 | 共有の方針 / DS-18 |
| Excel 用コピー（TSV） | 画面構成 / DS-16 |

## 共有の方針（DS-Q1）

字句解析は **`lib/sql.js`（`window.SqlLex`）に切り出して Convert（devpad）と共有する**。

- 公開するのは **`tokenize` と `PUNCT2` のみ**。キーワード集合・括弧分類・整形器は devpad に残す
- 根拠: ① CLAUDE.md が「共有は `<script src>` か1枚完結」と明示的に許可
  ② `lib/storage.js` が同方式で `file://` 動作済み
  ③ **PostgreSQL の字句規則（ドル引用符・入れ子ブロックコメント・`E''`）は
  公式ドキュメントで確認して実装した繊細なコードで、2版持つと片方だけ直る事故が起きる**
- **`docs/tool-backlog.md` の保留（`lib/ui.js` への共通化）とは別物**。
  あちらは「動いている `showBanner`・コピー処理を美観で作り直さない」保留で範囲が2つに限定されている。
  こちらは**2番目の利用者が生まれる瞬間**の判断で、その2つには触らない

## 画面構成

- `<main class="app-wide">` 直下: `.tool-header`（「← ツール一覧」＋「入力は自動保存されます」注記）
- 2ペイン: 左=入力、右=出力（どちらも textarea）。
  左ペインタイトル横に **［サンプルを入れる］**（**入力が空のときだけ表示**。投入と同時に変換）
- ツールバー: ［DDL → 定義書］（primary）［定義書 → DDL］［出力をコピー］
  ［Excel用コピー（TSV）］。**Cmd/Ctrl+Enter で出力をコピー**（excel2md・diff と同じ作法）
- **警告リスト領域**（`#warnings`）: 解釈できなかった構文・認識できない列などを箇条書きで出す。
  0件のときは非表示
- バナー領域（`.banner`）: エラーと結果表示

## エラー規約

純関数は例外を投げず **`{ok:true, value, warnings}` / `{ok:false, error, line?}`** を返す
（Convert の新規4タブと同じ規約）。

## 性能ガード

**200,000 文字**超は処理せず「入力が上限（20万文字）を超えたため処理を中止しました」を表示
（一部だけ処理はしない）。Convert の SQL タブと同じ根拠（文字単位トークナイズ）。

## データ模型（中間表現）

```js
{ tables: [ {
    name: 'public.customer',        // 物理名（スキーマ付きならそのまま）
    logical: '顧客マスタ',           // COMMENT ON TABLE
    columns: [ { name, type, size, notNull, default, pk, unique, fk, check, logical } ],
    constraints: [ { kind, name, body } ],   // 表制約（名前つき・複合）
  } ],
  warnings: [] }
```

## DDL → 定義書

`CREATE TABLE [IF NOT EXISTS] <名前> ( … )` と `COMMENT ON TABLE|COLUMN … IS '…'` **のみ**解釈する。
文は最上位の `;` で区切る。

- 列定義: `<名前> <型>[(引数)] [制約...]`
  - 認識する列制約: `NOT NULL` / `NULL` / `DEFAULT <式>` / `PRIMARY KEY` / `UNIQUE` /
    `REFERENCES <表> (<列>)` / `CHECK (<式>)` / `GENERATED … AS IDENTITY` / `COLLATE <名前>`
  - **型と桁を分離する**: `varchar(20)` → 型 `varchar` / 桁 `20`、
    `numeric(10,2)` → 型 `numeric` / 桁 `10,2`（往復で復元できるようにこの規則を固定する）
- 表制約: `[CONSTRAINT <名前>] PRIMARY KEY (…) | UNIQUE (…) | FOREIGN KEY (…) REFERENCES … | CHECK (…)`
- 上記以外（`PARTITION BY` / `WITH (…)` / `TABLESPACE` / `INHERITS` / `ALTER` / `CREATE INDEX` 等）は
  **落とさず警告に出し、解釈できた部分だけ変換する**

出力形式:

```markdown
## public.customer（顧客マスタ）

| 論理名 | 物理名 | 型 | 桁 | NOT NULL | 既定値 | PK | UNIQUE | FK | CHECK |
|---|---|---|---|---|---|---|---|---|---|
| 顧客ID | id | bigserial |  | ○ |  | ○ |  |  |  |
| 顧客コード | code | varchar | 20 | ○ |  |  | uq_code |  |  |

### 表制約
- CONSTRAINT uq_code UNIQUE (code, kind)
```

- **UNIQUE セルに制約名を書くと同名の列がまとまって複合 UNIQUE になる**（`○` は単独列）
- **複合 PK は該当列すべてに `○`**（列の並び順で組む）
- **表制約セクション**は「名前を持つ制約・複数列にまたがる CHECK」を保持するために出す
- CHECK 式のセル内 `|` は **`\|` にエスケープ**する（GFM の表を壊さないため）
- 同一列に複数の CHECK があるときはセル内で **`;` 区切り**

## 定義書 → DDL

**ヘッダー行の名前で列を対応付ける**（列順に依存しない）。

### ヘッダー名の対応表

**後から追加できる形にする**（`HEADER_ALIASES` の配列に文字列を足すだけ。実装の他の場所を触らない）。

| 役割 | 受け入れるヘッダー名 |
|---|---|
| 物理名（必須） | `物理名` `カラム名` `列名` `フィールド名` `name` `column` `column_name` |
| 論理名 | `論理名` `項目名` `和名` `名称` `comment` |
| 型（必須） | `型` `データ型` `type` `data_type` |
| 桁 | `桁` `桁数` `長さ` `精度` `サイズ` `length` `size` |
| NOT NULL | `NOT NULL` `NOTNULL` `NOT_NULL` `必須` |
| 既定値 | `既定値` `デフォルト` `初期値` `default` |
| PK | `PK` `主キー` `primary key` |
| UNIQUE | `UNIQUE` `ユニーク` `一意` |
| FK | `FK` `外部キー` `foreign key` `参照` |
| CHECK | `CHECK` `チェック` `制約` |

- 比較は**前後空白除去＋小文字化＋全角空白と `_` の除去**後に行う（表記ゆれを吸収）
- **必須は「物理名」と「型」**。無ければそのテーブルはエラー（他のテーブルは変換する）
- **認識できないヘッダーは警告に出して無視する**（列を黙って捨てない）
- **`NULL許可` `NULL可` `NULLABLE` のような反転ヘッダーは解釈せず警告（DS-Q2）**。
  意味を反転して読むと**黙って NOT NULL が逆になる**ため推測しない
- 真偽セル: `○ ● ◯ ✓ ✔ Y y YES yes TRUE true 1` → true /
  空 `-` `‐` `×` `x` `N` `n` `NO` `no` `FALSE` `false` `0` → false /
  **それ以外の文字列は警告**（黙って false にしない）
- FK セルは `<表>.<列>` 形式 → `REFERENCES <表> (<列>)`
- 生成順: `CREATE TABLE` → `COMMENT ON TABLE` → `COMMENT ON COLUMN`
- **表制約セクションがあればそれを優先**し、無ければ列のマークから組み立てる

### 識別子の警告（DS-15）

**PostgreSQL は引用しない識別子を小文字に畳む。** 定義書に `CustomerCode` と書いて
DDL を生成しても DB 上は `customercode` になる。往復では文字列として保たれるため
**気づけない類の食い違い**になるので、大文字を含む未引用識別子には警告を出す。

## 往復で失われるもの（DS-03・バイト同一は保証しない）

| 項目 | 往復後 |
|---|---|
| 空白・改行・インデント | 生成側の書式に正規化される |
| キーワードの大文字小文字 | 生成側の書式（キーワード大文字・型小文字）になる |
| CHECK 式の書式 | トークン列から再構成するため空白が正規化される（**意味は保つ**） |
| 列の順序 | **保たれる** |
| 制約名 | 表制約セクション／UNIQUE セルに名前があれば**保たれる**。`○` だけなら失われる |
| `PARTITION BY` / `WITH (…)` / `TABLESPACE` / `INHERITS` | **失われる**（警告に出る） |
| 未引用識別子の大文字 | 文字列としては保たれるが **DB 上は小文字**（警告に出る） |
| 同一列の複数 CHECK | セル内 `;` 区切りで保たれる |
| `GENERATED … AS IDENTITY` | 既定値セルに文字列として保持する |

## 警告仕様

警告は**捨てずに必ず一覧表示する**。文言は「何が」「どこで」起きたかを含める:

- `解釈しませんでした: PARTITION BY RANGE (created_at)`（先頭40文字まで）
- `認識できない列: 備考`
- `真偽値として解釈できません: 要（<列名>）`
- `ヘッダー「NULL許可」は意味が反転するため解釈しません。NOT NULL 列に書き換えてください`
- `大文字を含む識別子: CustomerCode（PostgreSQL では小文字に畳まれます。引用符が必要です）`

## コピーの鮮度ガード

変換はボタン実行（リアルタイムではない）ため、変換後に入力を編集すると出力・Excel用TSV は
編集前の入力の内容のまま残る。**その状態でコピーを実行したら、コピーせず警告する**
（黙って古い出力を渡さない — DS-21）:

- 対象: ［出力をコピー］／［Excel用コピー］。Cmd/Ctrl+Enter は［出力をコピー］と同経路
- 文言: `入力が変更されています。再変換してからコピーしてください`（warn）
- 再変換すれば通常どおりコピーできる。入力を変換時の内容に戻した場合も（一致すれば）コピーできる
- 変換に**失敗**したときは出力欄と同様に Excel用TSV も無効にする
  （古いモデルを黙って渡さない。『先に変換を実行してください』になる）

## 状態保持

キー `tools:ddl2spec`、payload `{ input }`（出力は再計算できるため保存しない）。
500ms デバウンス＋`pagehide` / `visibilitychange(hidden)` でフラッシュ
（デバウンス中に閉じても最後の入力が消えない — DS-22。devpad と同じ規約）。
1フィールド 100KB 超は保存せず `{omitted:true}`（devpad と同じ規約）。

## テストケース

fixture（実務に近い DDL。複合PK・FK・CHECK・複合UNIQUE・`DEFAULT now()`・日本語コメント）:

```sql
create table if not exists public.customer (
  id bigserial not null,
  code varchar(20) not null,
  kind numeric(10,2) default 0.00,
  status text not null check (status in ('active','closed')),
  dept_id bigint references public.dept (id),
  created_at timestamptz not null default now(),
  constraint customer_pkey primary key (id, code),
  constraint uq_code unique (code, kind)
);
comment on table public.customer is '顧客マスタ';
comment on column public.customer.id is '顧客ID';
comment on column public.customer.code is '顧客コード';
```

| ID | 内容 | 期待 |
|---|---|---|
| DS-01 | 上記 DDL → 定義書 | 見出しが `## public.customer（顧客マスタ）`。`id` 行が 論理名`顧客ID`/型`bigserial`/NOT NULL`○`/PK`○`。`code` 行が 型`varchar`/桁`20`/UNIQUE`uq_code`。`status` 行の CHECK が `status in ('active', 'closed')`。`dept_id` の FK が `public.dept.id`。`created_at` の既定値が `now()`。表制約に `CONSTRAINT customer_pkey PRIMARY KEY (id, code)` と `CONSTRAINT uq_code UNIQUE (code, kind)`。警告0件 |
| DS-02 | DS-01 の定義書 → DDL | `CREATE TABLE public.customer` に6列が同順で出る。`varchar(20)` `numeric(10,2)` に復元。`CONSTRAINT customer_pkey PRIMARY KEY (id, code)` と `CONSTRAINT uq_code UNIQUE (code, kind)`。`COMMENT ON TABLE` 1本と `COMMENT ON COLUMN` 3本 |
| DS-03 | **往復** DDL → 定義書 → DDL → 定義書 | **2回目の定義書が1回目と完全一致**（意味が保たれることを、正規化なしで比較できる形で照合する） |
| DS-04 | DS-01 の定義書のヘッダー列順を逆にする | **DS-02 と同じ DDL**が出る |
| DS-05 | 定義書に `備考` 列を追加 | 警告 `認識できない列: 備考`。他の列は正しく変換される |
| DS-06 | DDL に `partition by range (created_at)` と `create index …` を含める | 警告に両方が出て、列定義は変換される |
| DS-07 | 2テーブル＋それぞれの COMMENT | 表が2つ出て、COMMENT が正しいテーブルに紐づく |
| DS-08 | 空入力（両方向） | `{ok:true}` で出力が空・警告0件（落ちない） |
| DS-09 | 壊れた入力（`select 'unterminated` / 括弧不一致 / `create tabl x (a int)`） | 例外を投げない。未終端は `{ok:false}`、その他は警告 |
| DS-10 | 200,001 文字 | 処理せず理由表示 |
| DS-11 | CHECK に `name \|\| code is not null` を含む | 定義書のセルで `\|` にエスケープされ、**往復で復元される** |
| DS-12 | 複合 UNIQUE（制約名つき） | 名前が往復で保たれる（UNIQUE セル＋表制約セクション） |
| DS-13 | 真偽セル `○ ✓ Y 1` / 空 `-` `×` / 不明値 `要` | 前者 true・中者 false・**`要` は警告**（黙って false にしない） |
| DS-14 | ヘッダーに `NULL許可` | **解釈せず警告**（反転して読まない） |
| DS-15 | 定義書の物理名が `CustomerCode` | 警告「小文字に畳まれます」 |
| DS-16 | Excel 用コピー（`writeText` をスタブ） | TSV のヘッダーが `論理名\t物理名\t型\t桁\tNOT NULL\t既定値\tPK\tUNIQUE\tFK\tCHECK`。**実クリップボードに書かない** |
| DS-17 | UI: サンプル投入 → 変換 → Cmd/Ctrl+Enter | サンプルは空のときだけ表示・投入で消える・Cmd+Enter でコピーが走る |
| DS-18 | `window.SqlLex.tokenize` がこのページで動く | ドル引用符と入れ子コメントが各1トークンになる（共有 lexer が読めている証拠） |
| DS-19 | ハブ導線 | 「Schema」リンクで遷移し `<title>` が `Schema (ddl2spec)`。カテゴリ「設計」が出る |
| DS-20 | 変換 → ［出力をコピー］ | バナーが `banner-success`・`role="status"`・「コピーしました」。**算出背景色が `.banner` の既定と異なる**（`.banner-success` の規則が実際に効いていること。クラス名の一致だけでは 2026-08-07 に見つけた「規則が無い」状態を検出できない） |
| DS-21 | 変換 → 入力を編集 → ［出力をコピー］／［Excel用コピー］ | **コピーせず warn**「入力が変更されています。再変換してからコピーしてください」・クリップボード不変。**再変換すればコピーできる**。変換失敗後の［Excel用コピー］は「先に変換を実行してください」 |
| DS-22 | 入力 → 500ms のデバウンスを待たずに `pagehide` | 最後の入力が保存されている（フラッシュ） |

照合フック: `window.ddl2spec = { ddlToSpec, specToDdl, parseDdl, parseSpec, buildTsv }`。

## 検証手順

> **合否の正本は `./test/run ddl2spec` が全 pass（コンソールエラー0件を含む）。**

```sh
./test/run ddl2spec     # このツールだけ
./test/run            # 全ツール（共通コードを触ったときの波及を見る）
```

実行の前提・出力の読み方は `test/README.md`。照合しているコードは `test/ddl2spec.js`。
**期待値の正本はこのファイル**（テストケース表）で、変えるときは spec を先に直す。

### ハーネスが照合している内容（意図の記録）

以下は手作業で検証していた当時の手順。**`browser_evaluate` は Playwright MCP の道具名**で、
現在のハーネスは playwright-core を直接起動するため **MCP には依存しない**
（→ `docs/verification-notes.md` §1）。テストが落ちたときに「何を確かめたかったのか」を
辿れるように残している。

1. file:// で開く → ロード時コンソールエラー0（`lib/sql.js` の読み込み失敗を検出できる）
2. DS-01〜16・18 を `browser_evaluate` で照合
3. DS-17 は UI 操作（サンプル → 変換 → Cmd+Enter）
4. DS-19 はハブから遷移
5. 全操作後にコンソール再取得 → 累計エラー0
6. **`./test/run devpad` が全 pass のまま**（`lib/sql.js` 抽出の回帰）

## やらないこと

- `ALTER TABLE` / `CREATE VIEW` / `CREATE INDEX` / `CREATE TRIGGER` の解析（警告に出すだけ）
- 他方言（MySQL / Oracle）
- Excel ファイルの直接読み書き（TSV コピーまで）
- ER 図の生成 / DDL の実行 / DB への接続

## 決定事項（2026-08-06 承認）

- **DS-Q1**: 字句解析の流用 → **決定: `lib/sql.js` に切り出して共有**（`tokenize` のみ公開）
- **DS-Q2**: 反転ヘッダー → **決定: 解釈せず警告**
- **DS-Q3**: ヘッダー名 → **決定: 候補表で進める**。実物のヘッダー行は後から渡される予定。
  **`HEADER_ALIASES` に文字列を足すだけで対応できる形にする**（他の場所を触らない）
- **DS-Q4**: 論理名と説明 → **決定: 論理名1列のみ**（COMMENT 全文）。
  説明列は設けない（分割規則を発明すると往復が壊れる）
- **DS-Q5**: 表示名 → **決定: `Schema`** / カテゴリ **設計**
- **DS-Q6**: 正本 → **決定: DDL を正本、定義書を生成物**として運用する
