# taskboard: 共通部品へ移したもの（TB-LP1〜LP13 — 2026-10-02）

設計: `docs/audits/2026-10-02-issue-redesign.md` 段1。計画: `docs/audits/2026-10-02-issue-redesign-plan-1.md`。
Plan Tasks で作った見た目と操作を `lib/` に移し、Plan Tasks をそれに差し替えた。**見た目と動きは変えない**（既存のチェックは1つも変えずに通す）。
部品は見た目と操作だけ。何を「いま」に入れるか・メニューの項目と動きは各ツールに残す。

| ID | 操作 | 期待 |
|---|---|---|
| TB-LP1 | `ToolEdit.fillDate`（今日 2026-08-04）に `2026-08-01`／`2027-01-05`／空／`2026/8/1` | `2026/8/1(土)`（`2026/` は `.yr`・title `2026-08-01`）／`2027/1/5(火)`（`.yr` なし）／何も書かない（title も空）／`2026/8/1` のまま（title も同じ） |
| TB-LP2 | `ToolEdit.dueWords`（今日 2026-08-04）に 08-01／08-04／08-05／08-20／`2026/8/1`／空／今日の側が `2026/8/4` | `3日遅れ`／`今日`／`明日`／`あと16日`／空／空／空（形の違う日付では言葉を付けない — 段2の Check Issue は締切を書式の自由なフロントマターから取るため。2026-10-02 の点検で追加） |
| TB-LP10 | `lib/ui.css` と `web/taskboard.html` の中身・計算された `--st-late`（ライト・ダーク） | ui.css に `--st-late:`〜`--st-should:`・`.due-rel`・`.now-badge`・`@keyframes tool-flash` がある。taskboard.html に `--st-late:`・`.now-badge`・`row-flash`・`.due-rel {` が無い。`--st-late` はライトでもダークでも空でない |
| TB-LP3 | `ToolUI.menuKey` に e／「い」（code KeyE）／Shift+E／Cmd+E／Ctrl+E／Alt+E／変換中の e／Delete／Backspace／x | edit／edit／edit／なし／なし／なし／なし／delete／delete／なし |
| TB-LP4 | `ToolUI.isTyping` に text・search・checkbox・radio・button の input／textarea／select／button／contenteditable／body／null | true・true・false・false・false／true／true／false／true／false／false |
| TB-LP5 | `ToolUI.menu`（＋子・編集・削除）→ ↑ → ↓ → 2つ目を押す | `div.row-menu[role=menu]`・項目は `row-menu-item` で「＋\|子タスクを追加\|C」「✎\|編集\|E」「🗑\|削除\|Delete」。開いた直後のフォーカスは1つ目・↑で最後へ回る・↓で1つ目へ・押すと onPick(編集) |
| TB-LP6 | `ToolUI.placeAt` で 200×150 の箱を (100,100)／右端の手前／下端の手前に | (100,104)／右端から 8px 内側に収まる／ポインタの上側へ（下端から 164px 上） |
| TB-LP7 | `ToolUI.nowStrip` に 遅れ（数を出す・札1）・今日まで（数を出す・札0）・開始日を過ぎた（数を出さない・札1）→ 札を押す・たたむを押す → たたんだ状態で → 札0 | 見出しは「いま」「遅れ 1」「今日まで 0」（点は `now-dot k-late`・`k-today`）。行は「遅れ 1」「開始日を過ぎた 1」だけ（今日までの行は出さない）。札の文字と title・押すと onClick・たたむで onFold が1回・「たたむ ▴」→「ひらく ▾」と一覧が隠れる。札0なら「急ぎのものはありません」で数は 0 |
| TB-LP8 | `ToolUI.flash` | すぐ `.flash` が付き、1.4秒後には外れている。`.flash` の動きは `tool-flash`、動きを減らす設定では `none` |
| TB-LP11 | `lib/ui.css` と `web/taskboard.html` の中身 | ui.css に `.row-menu-item` がある。taskboard.html に `.row-menu-item` が無い（`.popover:has(.row-menu)` は残る） |
| TB-LP12 | Plan Tasks の見出し・`lib/ui.css` の中身 | `.tb-head` に `app-head`、`.tb-controls` に `app-controls` が付き、算出の display は flex・1行目の列の間は 14px。ui.css に `.app-head {` と `.app-controls {` がある（表示の切替の `.tb-controls #view-tabs` は taskboard.html に残る — 後ろの `.viewbar .tabs` に負けないため） |
| TB-LP13 | Check Issue のページ（issue.html）で部品を呼ぶ | `ToolEdit.fillDate`（今日 2026-10-01 に 2026-10-02）が `2026/10/2(金)`・`ToolUI.menuKey` が T を受ける・`--st-late` が空でない（読み込み順 ui.js → … → edit.js でも、読み込み時に互いを参照しない） |
| TB-LP14 | 「いま」の札にポインタを乗せる（本物のマウス） | 札の枠がアクセント色になる（`button:hover` の枠の色が効く — 変更前と同じ）。共通の CSS で `.now` の中に絞っても、札の指定の強さは元の `.tick` と同じ（`:where(.now)`）。2026-10-02 の点検で見つかった後退の再発防止 |
| TB-LP9 | Plan Tasks のページ | 移した関数・定数が Plan Tasks 側に残っていない（`fillDate`・`dueWords`・`WEEKDAYS`、Task 4 で `rowActionForKey`・`TYPING_SEL` も） |
