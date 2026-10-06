# taskboard — 完了アーカイブ

> **何を決めているか**: グループ単位のアーカイブ・archive.md の案件見出しの下へ・取り違えと一括操作の事故防止。  **テスト ID**: TB-15〜19・AR1/AR2・A1〜A9  **決定の記録**: decisions.md
> 2026-09-25 に docs/specs/taskboard.md（目次）から移動。内容は書き換えていない（docs/audits/2026-09-25-structure.md §6）。

## 完了アーカイブ仕様（UX監査 TB-4）

表示中の完了タスクを vault の `archive.md` へ追記し、tasks.md から除去する。

- **案件（セクション）の見出しの下に入れる**（TB-Q63・2026-09-25。利用者「後でどの案件のタスクだったのかを振り返りたい」—
  実物の archive.md は54件が見出しなしで並び、案件が残っていなかった）。archive.md に `## <セクション>` があれば
  **その節の末尾**（次の `#`/`##` 見出しの前・節末の空行の前）へ、無ければ**ファイル末尾に `## <セクション>` を作って**足す。
  見出しより前にあったタスク（セクションなし）は従来どおり末尾へ。**既存の行は1バイトも変えない**（挿入だけ）。
  純関数 `archiveMerge(text, groups)`（groups = `[{ section, lines }]`・tasks.md の出現順）

- **対象は親子グループ単位**: 深さ0の部分木が**すべて完了**しており、かつ現在の表示
  （絞り込み・「完了を含む」反映後）に出ているもの。部分木ごと移動する。未完了の子孫を持つ
  完了親は文脈ごと残す（ソート・絞り込みと同じグループ単位の設計）
- **前提: 未保存の変更がないこと**（あれば警告して中止 — アーカイブ＝純粋な移動に保つ）
- **tasks.md 側**は保存と同じ外部変更検知（NFC 比較。不一致なら中止＋警告＋再読込ボタン）
- **archive.md のハンドル**は IndexedDB（key `archivemd`）に永続化。無ければ
  `showSaveFilePicker({suggestedName:'archive.md'})` で取得・作成（キャンセルは静黙中止）

### アーカイブ先の取り違え防止（AR-1・2026-08-05。実際に事故った）

**事故**: アーカイブ先を tasks.md と別のディレクトリに保存でき、`~/Documents/archive.md` に
書かれた。保存先が視認できないまま実行できてしまうのが原因。

**API 調査の結論（2026-08-05 実測）**: **`FileSystemFileHandle` から親ディレクトリは取得できない。**

| API | 有無 | 意味 |
|---|---|---|
| `FileSystemFileHandle.getParent()` | **なし**（proto は `createWritable`/`getFile`/`move` のみ） | ファイルハンドル単体では場所が分からない |
| `FileSystemHandle.name` | あり | **ファイル名だけ**は取れる |
| `FileSystemDirectoryHandle.resolve(handle)` | あり | **ディレクトリハンドルがあれば**配下判定＋相対パスが取れる（非配下は `null`） |
| `showDirectoryPicker()` | あり | ディレクトリハンドルの取得手段（追加の許可プロンプトが必要） |
| `File.webkitRelativePath` | 空文字 | `<input webkitdirectory>` 由来のときだけ埋まる（FSA では使えない。API 仕様） |

したがって**「同じディレクトリか」の判定はディレクトリハンドルを持たない限り不可能**。
ご要望の「アーカイブ先が tasks.md と別の場所です: `<パス>`」は**パスを表示できない**ため、
次の代替で実装する:

1. **予防（採用）**: 保存ピッカーを **`startIn: <tasks.md のハンドル>`** で開く。
   Chrome は tasks.md と同じディレクトリでピッカーを開くため、
   別の場所に保存するには利用者が意図的に移動する必要がある（事故の主因を潰す）
2. **可視化（採用）**: アーカイブ実行前の確認に**保存先ファイル名を必ず出す**
   （AR-3 の件数確認と統合。「N件を `<name>` へ移動します。よろしいですか？」）。
   名前だけでも `~/Documents/archive.md` を選んでいれば `archive.md` と表示されるので
   場所は分からないが、**確認ダイアログが必ず挟まる**こと自体が事故の再発を防ぐ
3. **注記（採用）**: 初めてハンドルを取得したときの成功バナーに
   「アーカイブ先: `<name>`（保存場所はブラウザの制約により表示できません）」を併記
4. **確実な検出（→要確認 TB-Q10・未実装）**: `showDirectoryPicker()` で
   `03_Tasks` を1回だけ指定して IDB に保存し、`dirHandle.resolve(archiveHandle)` が
   `null` なら警告を出す。**追加プロンプト1回のコストで確実な検出**ができる。
   さらに進めれば `dirHandle.getFileHandle('archive.md', {create:true})` で
   **ピッカー自体を廃止**でき、取り違えは原理的に起こらなくなる（ハンドル永続化仕様の
   ファイルハンドル前提を変える設計変更のため、本バッチでは実装せず提案に留める）

### 一括操作の事故防止（AR-3・2026-08-05。実際に事故った）

**事故**: 8/3〜8/4 に49件を一括で完了チェックし、実際には未完了のタスクまでアーカイブされた。

- **保存時**: **未保存の「未完了→完了」が5件以上**なら `confirm('N件を完了にします。よろしいですか？')`。
  キャンセルなら保存しない（`{ok:false, reason:'cancel'}`）
  - **閾値5件・時間窓は使わない**（決定 TB-Q11）。保存は明示操作なので「未保存分の件数」が
    自然な単位で、時間窓のような壊れやすい状態を持たずに済む。
    件数は**保存時に行配列から導出**する（`orig` が未完了・`raw` が完了の行を数える）ので
    カウンタの同期ずれが起きない
  - **1〜2件の通常操作では何も出ない**（既存の操作を重くしない）。
    導出は保存時の1回だけで O(行数)
- **アーカイブ実行時**: **件数によらず必ず** `confirm('N件を <アーカイブ先ファイル名> へ移動します。よろしいですか？')`。
  キャンセルなら `{ok:false, reason:'cancel'}`（archive・tasks とも不変）
  - アーカイブは「ファイルをまたぐ不可逆な移動」なので、1件でも確認する
- 完了解除（`uncomplete`）は数えない。**チェックを入れた件数**だけを対象にする
- **追記手順**: 書き込み直前に archive.md を読み直し（外部編集を消さない。read→write 間の
  TOCTOU は保存仕様と同様に許容）、空なら先頭に `# archive\n` を付与、末尾改行が無ければ補い、
  対象行を**原文のまま**（インデント・メタトークン不変）1行ずつ追記
- **順序: archive 追記 → tasks.md から除去して保存**（archive 書込失敗なら行は消えない。
  tasks 保存失敗時は行配列を読込時状態へ戻し、「再実行すると archive.md 側が重複する」旨を警告）
- 成功バナー「アーカイブしました（N行を archive.md へ移動）」
- フォールバック（FSA 非対応）・デモ中・CR ファイルでは無効


## テストケース


アーカイブ（`newSession` の `archive()` / `getArchiveText()` / `setArchiveText(t)` で照合。
「完了を含む」は UI で ON にしてから実行）:

| ID | 操作 | 期待 |
|---|---|---|
| TB-15 | `newSession(F1)` → 完了を含む ON → `archive()` | `{ok:false, reason:'empty'}`（10行目グループは12行目が未完了のため**グループ単位では対象外**。archive・tasks とも不変） |
| TB-16 | `newSession(F1)` → complete line:9 → `save()` → 完了を含む ON → `archive()` | `{ok:true, moved:1}`。archive.md（無→新規）が `# archive\n- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04\n`。tasks 側は9行目が消え他行は F1 とバイト同一（ラウンドトリップ） |
| TB-17 | TB-16 の前に `setArchiveText('# archive\n- [x] 旧行')`（末尾改行なし） | 追記後 `# archive\n- [x] 旧行\n- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04\n`（ヘッダ重複なし・末尾改行を補修・既存内容保全） |
| TB-18 | `newSession(F1)` → complete line:9（保存しない）→ 完了を含む ON → `archive()` | `{ok:false, reason:'dirty'}`（未保存変更あり。両ファイル不変） |
| TB-19 | TB-16 の save 後に `externalWrite(別内容)` → `archive()` | `{ok:false, reason:'conflict'}`（tasks.md の外部変更検知。archive 側も不変） |
| TB-20 | `parse(F1 を CRLF 化したもの)` / `applyOps(CRLF 文字列, [{type:'complete', line:9}])` | parse は6タスクを返す（**表示は可能**）/ applyOps は例外（CR 行は編集拒否） |


アーカイブ先と一括操作の事故防止（AR-1 / AR-3・2026-08-05。`confirm` は Playwright の
dialog ハンドラで accept / dismiss を切り替えて照合する。**既定は dismiss なので明示が必要**）:

| ID | 操作 | 期待 |
|---|---|---|
| TB-A1 | `newSession(F1)` → complete line:9 → save → 完了を含む ON → `archive()`（dialog を accept） | `{ok:true, moved:1}`。**確認メッセージが `'1件を archive.md へ移動します。よろしいですか？'`**（件数と対象ファイル名を含む） |
| TB-A2 | 同じ操作で dialog を **dismiss** | `{ok:false, reason:'cancel'}`。archive は空のまま。**tasks 側は9行目が「完了済み」で残る**（アーカイブ前の保存は済んでいるため。行が消えないこと＝除去は archive 書込成功後にのみ起こることの確認） |
| TB-A3 | **F3**（未完了タスク5件の fixture）で全5件を complete → `save()`（accept） | `{ok:true}`。確認メッセージが `'5件を完了にします。よろしいですか？'` |
| TB-A4 | 同じ操作で dialog を **dismiss** | `{ok:false, reason:'cancel'}`。**アダプタ内容は不変**（保存されない）。行配列の編集状態は保持される（再挑戦できる） |
| TB-A5 | **F3** で 4件を complete → `save()` | **確認は出ない**（`dialogLog` が空）。`{ok:true}`。閾値未満の通常操作を重くしない |
| TB-A6 | `newSession(F1)` → complete line:9 → `uncomplete` line:10 → `save()` | 確認は出ない（完了1件・解除は数えない） |
| TB-A7 | `countNewlyCompleted` 相当の確認: 既存の完了行（F1 の10・11行目）を触らず保存 | 確認は出ない（`orig` が既に完了の行は数えない） |
| TB-A8 | archive.md に `# archive\n- [x] 旧行\n` があり、**読み込みに失敗する**（`NotReadableError`）状態で完了1件をアーカイブ | `{ok:false, reason:'archread'}`・「中止」の error バナー。**archive.md は前のまま（旧行が残る）・tasks の行も消えない**（2026-10-06 — 読めないのに空とみなして上書きし、前の分を全部消す作りだった） |
| TB-A9 | 同じだが読み込みが `NotFoundError`（archive.md がまだ無い・消された） | 今どおり新しく作って移す（`{ok:true}`） |
