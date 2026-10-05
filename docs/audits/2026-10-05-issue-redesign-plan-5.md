# 段5 実装計画: 見出し2行を全ツールへ（ハブ含む）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan Tasks・Check Issue と同じ「見出し2行」（1行目 `header.app-head` = ☰ ツール／← ツール一覧・保存の注記／題名（説明は title）／⋯、2行目 `.app-controls` = 操作）を、残り15ツールとハブに当てる。説明の段落（`.subtitle`）は題名の title へ移し、中身を約100px 上へ上げる。

**Architecture:** 各ツールの HTML の頭の3行（`.tool-header`・`h1`・`.subtitle`）を `header.app-head` に包み、`.subtitle` の文を `h1` の `title` へ移す（機械的 — 下の変換スクリプト）。ツールバー `div.toolbar` は `div.app-controls` にする（**id はそのまま** — `#tools`・`#opts` の change の配線が祖先を見ている）。ツール固有の調整は Normalize Text（2つのツールバーを1つに・設定の書き出し／読み込みは ⋯ へ）とハブ（h1 だけの1行目）だけ。全ページの照合は `test/hub.js`（ハブには spec ファイルが無く、契約はハーネス）に HUB-28・HUB-29 として置く。

**Tech Stack:** HTML・CSS（lib/ui.css）、Playwright のハーネス（`./test/run hub`・各ツール）

**Spec:** [docs/audits/2026-10-02-issue-redesign.md](2026-10-02-issue-redesign.md)（3 画面の 1「見出し2行」・5 段5・6 ②「範囲」③）と `docs/coding-rules.md`「見た目と操作の決まり」2（見出しは2行。説明文は題名の title、設定は ⋯ の中、操作は1段）

## Global Constraints

- `file://` で動く。`innerHTML` 禁止（今回は HTML を書き換えるだけで、JS は Normalize Text の id 以外触らない）
- **h1 の文字は変えない**（HUB-10・DX-18・terms・vaultlint のテストが `h1.textContent === 表示名` を見る）。説明は `title` 属性だけ
- **説明の文は削らない**（「情報は削らず、見せ方で整理する」— coding-rules 1）: `.subtitle` の文はそのまま h1 の title へ。ツールバーの中の短い案内（muted の span）は2行目に残す
- **id を変えない**。ツールバーの id（`#tools`・`#opts`）は2行目の要素に残す（board・mask の `#tools` の change、norm の `#opts` の change と NORM-22 が祖先を見る）
- **Playwright でクリック・チェックしている操作は ⋯ に入れない**（doc2xl の `#fmt-tsv`・`#fmt-md`・`#opt-fill`＝DX-U1、ハブの `#router-toggle`＝HUB-24）
- 段6で決めることには触らない: **Check Vault の設定（`#settings`）はそのまま**。Convert Data の**タブの帯（`#tabbar`）もそのまま**（タブがこのツールの操作 — 2行目に入れると 390px で折り返せない DEV-47）。Calc Dates は操作のツールバーが無いので2行目を置かない
- 幅 390px で横にはみ出さない（今は全ページ OK — 2026-10-05 に実測。HUB-29 で守る）
- コミットは1タスク1コミット。日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **祖先の id を見る change の配線**（board・mask の `#tools`、norm の `#opts`）: 2行目の要素が同じ id を持ち、radio・select・checkbox がその中に残る — 各ツールの既存テスト（BD・MK・NORM-22）
2. **Playwright の可視性**（DX-U1 の `page.check`、HUB-24 の `page.click`）: ⋯ に入れていない — 既存テスト
3. **狭い幅**: 1行目・2行目とも折り返し、390px で横にはみ出さない — HUB-29 と各ツールの U 系
4. **［☰ ツール］の置き場所**: `.tool-header` が `header.app-head` の中でも ToolLauncher が最初の `.tool-header` に入れる — LA-01
5. **norm の読み込みの file input**: `#import-file` の change が `#opts` の配線（保存して変換し直す）に届かない（⋯ の中＝`#opts` の外）— NORM-12・NM-13
6. **長い保存の注記**（mask「画像は保存されません（この画面の中だけ・機密画像を残さない）」・vaultlint「検査は読み取りのみ。…」）: 1行目が 1280px で1段に収まる — HUB-28（`.app-head` の高さ 48px 以下）

---

## ファイルの地図

| ファイル | 役目 | タスク |
|---|---|---|
| `test/hub.js` | HUB-28（ページごと: 見出し2行）・HUB-29（全ページ: 390px で横にはみ出さない） | 1 |
| `lib/ui.css` | `.app-controls .spacer`（`.toolbar .spacer` の代わり） | 1 |
| `web/{board,ddl2spec,diagram,diff,doc2xl,excel2md,fill,gantt,mindmap,terms}.html` | 変換スクリプトで見出し2行 | 1 |
| `test/ddl2spec.js` | DS-24 の `closest('.toolbar')` → `closest('.app-controls')` | 1 |
| `web/{mask,dates,devpad,vaultlint}.html` | 変換スクリプト（dates・devpad はツールバーが無いので見出しだけ） | 2 |
| `web/norm.html` | 手で: 2つのツールバー → 2行目1つ（コピーを最後に）・書き出し／読み込みは ⋯ | 2 |
| `index.html` | 手で: 1行目は h1 だけ（説明は title・検索欄の title にも） | 2 |
| `docs/specs/{ddl2spec,doc2xl,excel2md,vaultlint,devpad,diff,norm,terms}.md` | 画面の節の `.tool-header`・subtitle・`.toolbar` の行 | 1・2 |
| `docs/coding-rules.md`・`CLAUDE.md` | 「UI の標準形」と「ブラウザツールの制約」の `.tool-header` の行・チェック数 | 3 |

## 変換スクリプト（Task 1・2 で使う。リポジトリには置かず、作業用フォルダに保存する）

`hdr2.pl` — 頭の3行を `header.app-head` に包み、説明を h1 の title へ、**最初の** `div.toolbar` を `div.app-controls` に（id はそのまま）。
見つからなければ止まる（die）。説明に `"` `&` `<` `>` が無いことは 2026-10-05 に全ページで確かめた。

```perl
# 使い方: perl -CSD hdr2.pl [--no-toolbar] < web/x.html > out && cp -f out web/x.html
use utf8;
my $noToolbar = grep { $_ eq '--no-toolbar' } @ARGV;
local $/; my $s = <STDIN>;
$s =~ s{\n  (<p class="tool-header">[^\n]*</p>)\n  <h1>([^<\n]*)</h1>\n  <p class="subtitle">([^<\n]*)</p>\n}{\n  <!-- 見出し2行（段5 — lib/ui.css の .app-head・.app-controls。coding-rules「見た目と操作の決まり」2）。説明は h1 の title -->\n  <header class="app-head">\n    $1\n    <h1 title="$3">$2</h1>\n  </header>\n} or die "見出しの3行が見つからない\n";
unless ($noToolbar) {
  $s =~ s{<div class="toolbar"( id="[a-z]+")?>}{<div class="app-controls"$1>} or die "ツールバーが見つからない\n";
}
print $s;
```

---

### Task 1: 照合を書き、10ツールを見出し2行に

**Files:**
- Modify: `test/hub.js`（`await browser.close();` の直前に HUB-28・29）・`lib/ui.css`・`web/{board,ddl2spec,diagram,diff,doc2xl,excel2md,fill,gantt,mindmap,terms}.html`・`test/ddl2spec.js`（DS-24）
- Modify: `docs/specs/{ddl2spec,doc2xl,excel2md,diff,terms}.md`

**Interfaces:**
- Produces（DOM・全ツール）: `main > header.app-head` の中に `.tool-header` と `h1[title]`、`.subtitle` は無い、2行目は `main > .app-controls`（あれば）

- [ ] **Step 1: テストを書く** — `test/hub.js` の `await browser.close();` の直前に:

```js
  /* ---------- HUB-28・29: 見出し2行（段5 — 2026-10-05・docs/audits/2026-10-05-issue-redesign-plan-5.md） ----------
     coding-rules「見た目と操作の決まり」2: 見出しは2行（1行目 header.app-head＝☰ ツール・← ツール一覧・保存の注記・題名・⋯、2行目 .app-controls＝操作）、
     説明は題名の title（.subtitle を置かない）。ページごとに1件（どのツールが外れたかが見えるように）。ハブは .tool-header を持たない（h1 だけ） */
  await page.setViewportSize({ width: 1280, height: 900 });
  const pages28 = [{ alias: 'index', href: 'index.html' }].concat(entries.map(e => ({ alias: e.alias, href: e.href })));
  for (const p of pages28) {
    await page.goto(fileUrl(p.href));
    await page.waitForLoadState('load');
    const h = await page.evaluate(() => {
      const head = document.querySelector('main > header.app-head');
      const h1 = head && head.querySelector('h1');
      const ctl = document.querySelector('main > .app-controls');
      const rb = (e) => e.getBoundingClientRect();
      return {
        head: !!head, toolHeader: !!(head && head.querySelector('.tool-header')),
        h1Title: h1 ? h1.title.length : 0, subtitle: !!document.querySelector('.subtitle'),
        headH: head ? Math.round(rb(head).height) : null,               // 1行目は1段（折り返さない）
        gap: head && ctl ? Math.round(rb(ctl).top - rb(head).bottom) : null,   // 2行目は1行目のすぐ下
      };
    });
    r.check('HUB-28（' + p.alias + ' — 見出し2行: header.app-head に' + (p.alias === 'index' ? '' : ' .tool-header と') + ' h1・説明は h1 の title・.subtitle 無し・1行目は1段・2行目はすぐ下）',
      h.head && (p.alias === 'index' || h.toolHeader) && h.h1Title > 0 && !h.subtitle && h.headH !== null && h.headH <= 48
      && (h.gap === null || h.gap <= 16), JSON.stringify(h));
  }
  // 狭い幅で横にはみ出さない（全ページ。見出しの2行が折り返すこと — 今は全ページ OK なので、壊さないための見張り）
  await page.setViewportSize({ width: 390, height: 800 });
  const over29 = [];
  for (const p of pages28) {
    await page.goto(fileUrl(p.href));
    await page.waitForLoadState('load');
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (w[0] > w[1]) over29.push(p.alias + ' ' + w.join('/'));
  }
  r.check('HUB-29（幅 390px で全ページ横にはみ出さない — 見出しの2行が折り返す）', over29.length === 0, JSON.stringify(over29));
  await page.setViewportSize({ width: 1280, height: 900 });
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `./test/run hub`
Expected: HUB-28 が taskboard・issue だけ PASS、ほかの15ツールとハブが FAIL（`head: false`・`subtitle: true`）。HUB-29 は PASS（見張り）

- [ ] **Step 3: `lib/ui.css`** — `.app-controls .opts select { … }` の行の次に:

```css
.app-controls .spacer { flex: 1 1 auto; }   /* .toolbar .spacer の代わり（段5 — ツールバーを2行目にした） */
```

- [ ] **Step 4: 10ツールを変換する** — 作業用フォルダに `hdr2.pl` を保存し、各ツールで:

```bash
SP=<作業用フォルダ>
for t in board ddl2spec diagram diff doc2xl excel2md fill gantt mindmap terms; do
  perl -CSD $SP/hdr2.pl < web/$t.html > $SP/$t.html && /bin/cp -f $SP/$t.html web/$t.html || echo "NG $t"
done
git diff --stat
```

  Expected: 10ファイルが変わり、`NG` は出ない（それぞれ +6 −4 前後）

- [ ] **Step 5: DS-24 を直す** — `test/ddl2spec.js` の `copy.closest('.toolbar')` を `copy.closest('.app-controls')` に（照合の意図「コピーのある操作の行がペインの上」は同じ。行を `.toolbar` から2行目 `.app-controls` に移したため）。check の文に「ツールバー」とあれば「操作の行（見出しの2行目）」に

- [ ] **Step 6: spec** — 画面の節の行を直す:
  - `docs/specs/ddl2spec.md`: `- `<main class="app-wide">` 直下: `.tool-header`（…）` の行末に ` — 見出し2行（`header.app-head` の中。説明は h1 の title・操作は2行目 `.app-controls` — 2026-10-05 段5・HUB-28）`、
    `- ツールバー（**ペインの上**・`.toolbar` — 2026-08-13 に他ツールと体裁統一）:` を `- 操作の行（**ペインの上**・見出しの2行目 `.app-controls` — 2026-08-13 に他ツールと体裁統一・2026-10-05 に見出し2行へ）:` に
  - `docs/specs/doc2xl.md`: `.tool-header` の行末に同じ文、`- `<h1>Export Outline</h1>`・subtitle（正本は Markdown 側、Excel は納品時の生成物）` を `- `<h1>Export Outline</h1>`（説明は h1 の title — 正本は Markdown 側、Excel は納品時の生成物）` に
  - `docs/specs/excel2md.md`: `.tool-header` の行末に同じ文、`**1行説明（subtitle）と index.html の` を `**1行説明（h1 の title — 段5）と index.html の` に
  - `docs/specs/diff.md`・`docs/specs/terms.md`: `.tool-header` の行末に同じ文

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run hub` → HUB-28 が10ツールぶん PASS に変わる（残りは mask・dates・devpad・vaultlint・norm・ハブの6件が FAIL のまま — Task 2）。HUB-29 は PASS
Run: `./test/run` → hub 以外はすべて pass（hub は HUB-28 の6件だけ FAIL）

- [ ] **Step 8: 目で確かめる**（1回だけ）— 作業用フォルダで diagram・excel2md・board の見出しを撮って見る（1280px・ライト）。中身の上端が約 110px になっていること

- [ ] **Step 9: コミット**

```bash
git add test/hub.js lib/ui.css web/board.html web/ddl2spec.html web/diagram.html web/diff.html web/doc2xl.html web/excel2md.html web/fill.html web/gantt.html web/mindmap.html web/terms.html test/ddl2spec.js docs/specs/ddl2spec.md docs/specs/doc2xl.md docs/specs/excel2md.md docs/specs/diff.md docs/specs/terms.md
git commit -m "全ツール: 見出し2行（段5）— 10ツールの頭の3行を header.app-head に・説明は題名の title・ツールバーを2行目 .app-controls に（id はそのまま）・全ページの照合 HUB-28・29（残り6件は次）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 残りの5ツールとハブ

**Files:**
- Modify: `web/{mask,dates,devpad,vaultlint}.html`（変換スクリプト）・`web/norm.html`・`index.html`（手で）
- Modify: `docs/specs/{vaultlint,devpad,norm}.md`

**Interfaces:**
- Consumes: HUB-28・29（Task 1）・`.app-controls .spacer`（Task 1）

- [ ] **Step 1: 4ツールを変換する**

```bash
perl -CSD $SP/hdr2.pl < web/mask.html > $SP/mask.html && /bin/cp -f $SP/mask.html web/mask.html
perl -CSD $SP/hdr2.pl < web/vaultlint.html > $SP/vaultlint.html && /bin/cp -f $SP/vaultlint.html web/vaultlint.html
perl -CSD $SP/hdr2.pl --no-toolbar < web/dates.html > $SP/dates.html && /bin/cp -f $SP/dates.html web/dates.html
perl -CSD $SP/hdr2.pl --no-toolbar < web/devpad.html > $SP/devpad.html && /bin/cp -f $SP/devpad.html web/devpad.html
```

  （mask の2行目は今と同じく2段に折り返す — 道具が9つ・色・粒度・太さ・ボタン5つで約 1,700px。vaultlint の `#settings` は段6で決めるのでそのまま。dates は操作の行が無い。devpad の `#tabbar` はタブの帯としてそのまま）

- [ ] **Step 2: Normalize Text** — `web/norm.html` の頭（`<p class="tool-header">` から2つ目のツールバーの `</div>` まで）を次に置き換える。
  オプションの `<label>`・`<select>` の行（今の `#opts` の中身）は**1行も変えずにそのまま**移す（下の `…` の部分）:

```html
  <!-- 見出し2行（段5 — lib/ui.css の .app-head・.app-controls。coding-rules「見た目と操作の決まり」2）。説明は h1 の title。
       設定の書き出し・読み込みは ⋯ の中（#opts の外 — 読み込みの file input の change が #opts の「保存して変換し直す」に届かないように） -->
  <header class="app-head">
    <p class="tool-header"><a href="../index.html">← ツール一覧</a><span class="autosave-note">設定は自動保存されます</span></p>
    <h1 title="日本語テキストの表記ゆれを正規化 — 変更文字はハイライト（hoverで変更前を表示）">Normalize Text</h1>
    <span class="spacer"></span>
    <details class="more-menu" id="norm-more">
      <summary title="設定の書き出し・読み込み">⋯</summary>
      <div class="more-panel">
        <button id="export-btn">設定をエクスポート</button>
        <button id="import-btn">設定をインポート</button>
        <input type="file" id="import-file" accept="application/json" hidden>
      </div>
    </details>
  </header>

  <!-- 2行目: 変換のオプション（id="opts" — change で保存して変換し直す）と、最後に［結果をコピー］。オプションが多いので2段に折り返す -->
  <div class="app-controls opts" id="opts">
    …（今の #opts の中身を、最後の［変更前を注記表示］の label までそのまま）
    <button class="primary" id="copy-btn" title="Cmd/Ctrl+Enter">結果をコピー</button>
  </div>
```

- [ ] **Step 3: ハブ** — `index.html` の `<h1>Personal Tools</h1>` と `<p class="subtitle">…</p>` の2行を次に置き換え、`input#search` に `title="打ち始めると絞り込み・Enter で先頭を開く（詳しい説明はマウスを乗せると出ます）"` を足す:

```html
  <!-- 見出し（段5 — lib/ui.css の .app-head）。ハブは ☰ ツールを持たない（LA-01）ので1行目は題名だけ。説明は h1 の title と検索欄の title -->
  <header class="app-head">
    <h1 title="打ち始めると絞り込み・Enter で先頭を開く（詳しい説明はマウスを乗せると出ます）">Personal Tools</h1>
  </header>
```

  （2行目は今の `div.search-row`（検索・データから探す・リンク集）のまま — `#router-toggle` は HUB-24 が `page.click` するので ⋯ に入れない）

- [ ] **Step 4: spec**
  - `docs/specs/vaultlint.md`: `.tool-header` の行末に ` — 見出し2行（`header.app-head` の中。説明は h1 の title — 2026-10-05 段5・HUB-28。設定 `#settings` は段6で決めるので今の場所のまま）`、`- `<h1>Check Vault</h1>`・subtitle` を `- `<h1>Check Vault</h1>`（説明は title）` に
  - `docs/specs/devpad.md`: `.tool-header` の行末に ` — 見出し2行（`header.app-head` の中。説明は h1 の title — 2026-10-05 段5・HUB-28。タブバーは操作の帯としてそのまま）`
  - `docs/specs/norm.md`: `.tool-header` の行末に Task 1 と同じ文、`- 設定エクスポート/インポートボタン（ToolStorage）` を `- 設定エクスポート/インポートボタン（ToolStorage）— 見出しの ⋯（`#norm-more`）の中。［結果をコピー］はオプションの行の最後（2026-10-05 段5）` に

- [ ] **Step 5: 通ることを確かめる**

Run: `./test/run hub` → HUB-28 が18件すべて PASS・HUB-29 PASS
Run: `./test/run` → すべて pass

- [ ] **Step 6: 目で確かめる**（1回だけ）— mask・norm・devpad・vaultlint・ハブの見出しを撮って見る（1280px・ライトとダーク）。norm の ⋯ を開いた画面も

- [ ] **Step 7: コミット**

```bash
git add web/mask.html web/dates.html web/devpad.html web/vaultlint.html web/norm.html index.html docs/specs/vaultlint.md docs/specs/devpad.md docs/specs/norm.md
git commit -m "全ツール: 見出し2行（段5）— 残りの5ツールとハブ（Normalize Text は2つのツールバーを1行に・設定の書き出し／読み込みは ⋯・Convert Data のタブと Check Vault の設定はそのまま — HUB-28 全18件）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 規約とチェック数

**Files:**
- Modify: `docs/coding-rules.md`・`CLAUDE.md`

- [ ] **Step 1: `docs/coding-rules.md`**
  - 「UI の標準形」の `  `<main>` 直下に `.tool-header`（「← ツール一覧」＋保存注記）` を
    `  `<main>` 直下に**見出し2行**: 1行目 `header.app-head`（`.tool-header`＝「← ツール一覧」＋保存注記・`h1`（説明は `title`）・設定は ⋯）、2行目 `.app-controls`（操作。ツールバーの id はそのまま）。**`.subtitle` は置かない**（2026-10-05 段5・HUB-28 が全ページを照合）` に
  - 「見た目と操作の決まり」の 2 の行末に ` — 2026-10-05 に全ツールとハブへ（段5）`

- [ ] **Step 2: `CLAUDE.md`** — 「ブラウザツールの制約」の `- 各ツールは `<main>` 直下に `.tool-header`（「← ツール一覧」リンク＋自動保存の注記）を置く` を
  `- 各ツールは `<main>` 直下に見出し2行（`header.app-head` に `.tool-header`（「← ツール一覧」リンク＋自動保存の注記）と題名・2行目 `.app-controls` に操作。説明は題名の title）を置く` に

- [ ] **Step 3: 全体を回して数を数える**

Run: `./test/run`
Expected: すべて pass。合計は 1014 ＋ 19（HUB-28 の18件・HUB-29）＝ 1033 になるはず（違えば実数）

- [ ] **Step 4: `CLAUDE.md` の数を直す** — 「**1014チェックの検証機構が**」を Step 3 の実数に

- [ ] **Step 5: コミット**

```bash
git add docs/coding-rules.md CLAUDE.md
git commit -m "docs: 見出し2行を全ツールの標準形に（coding-rules「UI の標準形」・CLAUDE.md の .tool-header の行 — 段5・1033チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
