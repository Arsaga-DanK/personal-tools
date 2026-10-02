# taskboard: 共通部品へ移したもの（TB-LP1〜LP13 — 2026-10-02）

設計: `docs/audits/2026-10-02-issue-redesign.md` 段1。計画: `docs/audits/2026-10-02-issue-redesign-plan-1.md`。
Plan Tasks で作った見た目と操作を `lib/` に移し、Plan Tasks をそれに差し替えた。**見た目と動きは変えない**（既存のチェックは1つも変えずに通す）。
部品は見た目と操作だけ。何を「いま」に入れるか・メニューの項目と動きは各ツールに残す。

| ID | 操作 | 期待 |
|---|---|---|
| TB-LP1 | `ToolEdit.fillDate`（今日 2026-08-04）に `2026-08-01`／`2027-01-05`／空／`2026/8/1` | `2026/8/1(土)`（`2026/` は `.yr`・title `2026-08-01`）／`2027/1/5(火)`（`.yr` なし）／何も書かない（title も空）／`2026/8/1` のまま（title も同じ） |
| TB-LP2 | `ToolEdit.dueWords`（今日 2026-08-04）に 08-01／08-04／08-05／08-20 | `3日遅れ`／`今日`／`明日`／`あと16日` |
| TB-LP10 | `lib/ui.css` と `web/taskboard.html` の中身・計算された `--st-late`（ライト・ダーク） | ui.css に `--st-late:`〜`--st-should:`・`.due-rel`・`.now-badge`・`@keyframes tool-flash` がある。taskboard.html に `--st-late:`・`.now-badge`・`row-flash`・`.due-rel {` が無い。`--st-late` はライトでもダークでも空でない |
| TB-LP7 | `ToolUI.nowStrip` に 遅れ（数を出す・札1）・今日まで（数を出す・札0）・開始日を過ぎた（数を出さない・札1）→ 札を押す・たたむを押す → たたんだ状態で → 札0 | 見出しは「いま」「遅れ 1」「今日まで 0」（点は `now-dot k-late`・`k-today`）。行は「遅れ 1」「開始日を過ぎた 1」だけ（今日までの行は出さない）。札の文字と title・押すと onClick・たたむで onFold が1回・「たたむ ▴」→「ひらく ▾」と一覧が隠れる。札0なら「急ぎのものはありません」で数は 0 |
| TB-LP8 | `ToolUI.flash` | すぐ `.flash` が付き、1.4秒後には外れている。`.flash` の動きは `tool-flash`、動きを減らす設定では `none` |
| TB-LP9 | Plan Tasks のページ | 移した関数・定数が Plan Tasks 側に残っていない（`fillDate`・`dueWords`・`WEEKDAYS`、Task 4 で `rowActionForKey`・`TYPING_SEL` も） |
