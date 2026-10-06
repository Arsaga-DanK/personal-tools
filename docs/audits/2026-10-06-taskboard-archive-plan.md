# 実装計画: Plan Tasks のアーカイブを「消えない・どこにあるか分かる」形に（月ごとのファイル・アーカイブの表示）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アーカイブ先を「tasks.md と同じフォルダ（03_Tasks）の中の `archive/YYYY-MM.md`（アーカイブした月）」に替え、書いたら読み直して確かめてから tasks.md の行を消す。あわせて Plan Tasks に「アーカイブ」の表示を足す。案件ごと・済んだ日・メモつきで読み返せて、検索も効く。

**Architecture:** アーカイブ先の扱いを「1つのファイルのハンドル」から「フォルダ」に替える（`web/taskboard/archive.js` の `getArchiveFolder`・`makeFsaFolder`・`makeMemoryFolder`）。フォルダは初回だけ選んでもらい、**開いている tasks.md と同じファイルが入っているか**（`isSameEntry`。無い環境は中身の比較）を確かめてから覚える。これは spec（AR-1）に「案4・TB-Q10・未実装」として残っていた案そのもの。表示は新しい `web/taskboard/archive-view.js`（読むだけ）。

**Tech Stack:** 素の JS（classic script・`file://`）、File System Access（ディレクトリ）、Playwright のハーネス（`./test/run taskboard`）

**Spec:** 利用者の要望（2026-10-06）:
- 「今後消さないようにできる？？ archive においておくか、archive もどんどん大きくなっていくので、ある程度の容量超えたら daily みたいに日付込みで保存しておく」→ 選択は「**月ごとに分ける**」
- 「表示にアーカイブを足してタスクの邪魔にならないようにアーカイブされたタスクを確認できるのはいい」

調査（2026-10-06）:
- 9/24 16:52〜17:43 のアーカイブで、済んだ16件（メモ・子17行）が tasks.md から外れた。なのに vault の archive.md には入っておらず、Mac のどこにも見つからなかった（git の記録から archive.md へ戻した — vault 06cc0d0）
- 原因は「最初に選んだファイルのハンドル」を覚える作りで、書き込み先が見えないこと（spec AR-1 が 8/5 に同じ型の事故を記録している）

契約とテストケースは `docs/specs/taskboard/archive.md` の新しい節（TB-AF1〜AF5・TB-AV1〜AV4）。

## Global Constraints

- `file://` で動く。ES モジュール禁止。描画は `textContent` / `createElement` のみ
- **tasks.md の行を消すのは、アーカイブのファイルを書いて読み直し、書いたとおりだと確かめたあとだけ**（以前から「書けたら消す」だったが、読み直しは無かった）
- **読めなければ止める**（TB-A8 — 2026-10-06 に入れた。`NotFoundError` だけは新しく作る）。**書くのは追記だけ**（既存の行は1バイトも変えない — `archiveMerge` のまま）
- **既存の `archive.md` には書かない**（読むだけ — 表示で一緒に出す）。PEW_archive.md など別の場所のものは扱わない
- アーカイブ先のフォルダは**開いている tasks.md と同じフォルダでなければ使わない**
- 月は「アーカイブした日」の月（`todayStr()` — テストは setToday で固定できる）。✅ の日付の月ではない（1回の移動を2つのファイルに分けない）
- 1ファイル 1,000 行を超えない（`web/taskboard/engine.js` 922 行は触らない。list.js 878 行は +6 行まで）
- 表示に使う記号 ☑（U+2611）・－（U+FF0D）は `test/run` の文字の許可範囲内（確認済み）
- コミットは1タスク1コミット。日本語1行＋ `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **違うフォルダを選んだとき**（tasks.md が無い・同名の別ファイル）: 覚えずに止める — 判定は TB-AF4。ピッカーからの流れ（バナー）は実機の FSA でしか通らない
2. **書いたあとに中身が違う**（同期・別のアプリの書き戻し・書き込みが途中で切れる）: tasks.md を消さない — TB-AF3
3. **月をまたぐ**: 9月に移したものは 9月のファイル、10月は 10月のファイル（前の月のファイルは変えない）— TB-AF2
4. **アーカイブの表示の検索**: 本文だけでなくメモ（先方の回答）も探す — TB-AV2
5. **権限が切れている**（ブラウザを再起動した直後に［アーカイブ］を開く）: 勝手にピッカーを出さず、ボタンで開き直せる — 実機の FSA でしか通らない

---

### Task 1: アーカイブ先をフォルダに・月ごとのファイル・書いたら読み直す

**Files:**
- Modify: `web/taskboard/archive.js`
  - `getArchiveAdapter` を `getArchiveFolder` に置き換える
  - `doArchive`・`archiveTargetName`・アーカイブボタンの title を改める
  - 新しく `isArchiveFileName`・`readAllArchives` を足す
- Modify: `web/taskboard/io.js`
  - state の `archiveAdapter: null, archiveHandle: null` を `archiveFolder: null, archiveDirHandle: null, archiveCache: null` に
  - `publishTaskLinks` の判定を `isArchiveFileName` に
- Modify: `web/taskboard.html`
  - `IDB_KEY_ARCH` を `IDB_KEY_ARCH_DIR = 'archivedir'` に
  - テスト用フックを改める
- Modify (spec): `docs/specs/taskboard/archive.md`（新しい節・ハンドルの箇条・AR-1 の案4・TB-A1 の文・テストケースの前置き）・`docs/specs/taskboard/engine.md`（TB-S30 の確認の文・134 行目の例）
- Modify (test): `test/taskboard/engine.js`（TB-A1 の文・TB-A8/A9 のすり替え先）・`test/taskboard/edit.js`（TB-M10 の文）・`test/taskboard/status.js`（TB-S30 の文）
- Create: `test/taskboard/archive.js`（節 `archive`）
- Modify: `test/taskboard.js`（`SECTIONS` の `'links'` の前に `'archive'`）

**Interfaces:**
- Produces:
  - `archiveMonthPath(today) → 'archive/YYYY-MM.md'`
  - `makeMemoryFolder(name)`・`makeFsaFolder(dirHandle)` — どちらも `{ name, readFile(path), writeFile(path, text), listFiles() }`（`readFile` は無ければ `NotFoundError` を投げる）
- Produces:
  - `isTasksFolder(dir, tasksHandle, tasksName, snapshot) → Promise<boolean>`
  - `getArchiveFolder(interactive, repick) → Promise<folder|null>`
  - `readAllArchives(folder) → Promise<[{path, text}]>`（月のファイルは新しい順、最後に archive.md）
- Produces:
  - `archiveTargetName()` → メモリのセッションは `'archive/2026-08.md'`、FSA は `'03_Tasks/archive/2026-10.md'`
  - `isArchiveFileName(name)` → `archive.md` か `YYYY-MM.md` なら true
- 返り値の `reason` に `'archverify'`（読み直した中身が書いたものと違う）を足す

- [ ] **Step 1: spec** — `docs/specs/taskboard/archive.md` の末尾に次を足す:

```markdown
## アーカイブ先は 03_Tasks/archive/YYYY-MM.md（TB-AF1〜AF5 — 2026-10-06・TB-Q75）

利用者「アーカイブを重ねたら消える。メモ書きで先方からの回答なども記述しているので消えてほしくない」「今後消さないようにできる？？ archive もどんどん大きくなっていくので、
ある程度の容量超えたら daily みたいに日付込みで保存しておく」→ **月ごとに分ける**。
調査: 2026-09-24 のアーカイブで済んだ16件（メモつき）が tasks.md から外れたのに vault の archive.md に入らず、どこにも見つからなかった（git から戻した）。
「最初に選んだファイルのハンドル」を覚える作りで、書き込み先が見えなかった（上の AR-1 と同じ型）。**AR-1 の案4（TB-Q10）をここで実装した**。

- **アーカイブ先はフォルダ**: 初回だけ **tasks.md のあるフォルダ（03_Tasks）** を選んでもらう。そのフォルダに**開いている tasks.md と同じファイル**があるか
  （`isSameEntry`。無い環境は中身の比較）を確かめ、違えば覚えずに止める。覚えたフォルダは IndexedDB（`archivedir`。以前の `archivemd` はもう読まない）
- **書く先は `archive/YYYY-MM.md`**（アーカイブした日の月。`archive/` は無ければ作る）。中身の形は今の archive.md と同じ（`# archive`・案件の見出しの下へ — `archiveMerge`）。
  **既存の `archive.md` には書かない**（読むだけ）
- **書いたら読み直して、書いたとおりか確かめてから** tasks.md の行を消す。違えば消さずに止める（`archverify`）。読めなければ止める（TB-A8）
- 確認の文と成功のバナーは書く先を出す（「1件を 03_Tasks/archive/2026-10.md へ移動します。よろしいですか？」— メモリのセッションでは `archive/2026-08.md`）
- 関連ノートの写し（TB-LN6）のアーカイブ分は archive.md と archive/*.md の全部から数える

| ID | 操作 | 期待 |
|---|---|---|
| TB-AF1 | archive.md に `X` を置き、2026-08-04 に1件をアーカイブ | `archive/2026-08.md` が `# archive` で始まりその1件を含む・archive.md は `X` のまま・確認の文が `'1件を archive/2026-08.md へ移動します。よろしいですか？'` |
| TB-AF2 | 続けて 2026-09-02 にもう1件をアーカイブ | `archive/2026-09.md` が新しくでき、`archive/2026-08.md` は変わらない |
| TB-AF3 | 書いた中身と読み直した中身が違う（書き込みの途中で切れた形） | `{ok:false, reason:'archverify'}`・「tasks.md からは消していません」の error バナー・tasks の行は残る |
| TB-AF4 | `isTasksFolder` に 同じ tasks.md／同名の別ファイル／tasks.md が無いフォルダ／`isSameEntry` が無く中身が同じ | true／false／false／true |
| TB-AF5 | archive.md に `[[2026-07-07]]` の済み1件があり、F1 の `[[2026-07-07]]` の1件（9行目）を新しくアーカイブ | 写しの `2026-07-07` が total 3・done 2（tasks.md に残る未完了1 ＋ archive.md の1 ＋ 月のファイルの1） |
```

  あわせて同じファイルで次を直す:
  - 先頭の「**テスト ID**: TB-15〜19・AR1/AR2・A1〜A9」→「**テスト ID**: TB-15〜19・AR1/AR2・A1〜A9・AF1〜AF5・AV1〜AV4」
  - 箇条「**archive.md のハンドル**は IndexedDB（key `archivemd`）に永続化。…（キャンセルは静黙中止）」→「**アーカイブ先**は tasks.md と同じフォルダの `archive/YYYY-MM.md`（2026-10-06 から — 下の「アーカイブ先は 03_Tasks/archive/YYYY-MM.md」。以前はファイル1つのハンドルを key `archivemd` に覚えていた）」
  - AR-1 の「4. **確実な検出（→要確認 TB-Q10・未実装）**」の項の末尾に「→ **2026-10-06 に実装**（下の「アーカイブ先は 03_Tasks/archive/YYYY-MM.md」・TB-Q75）」
  - 成功バナーの箇条「アーカイブしました（N行を archive.md へ移動）」→「アーカイブしました（N行を <書く先> へ移動）」
  - 「アーカイブ（`newSession` の `archive()` / `getArchiveText()` / `setArchiveText(t)` で照合。」の段落の後に「`getArchiveText()` / `setArchiveText(t)` は**今月のファイル**（`archive/YYYY-MM.md`）を読み書きする（2026-10-06〜）。」を足す
  - TB-A1 の行の `'1件を archive.md へ移動します。よろしいですか？'` → `'1件を archive/2026-08.md へ移動します。よろしいですか？'`

  `docs/specs/taskboard/engine.md` の TB-S30 の行と 134 行目の `を archive.md へ移動します` を `を archive/2026-08.md へ移動します` に

- [ ] **Step 2: テストを書く** — `test/taskboard/archive.js`:

```js
'use strict';
/* test/taskboard/archive.js — 節: アーカイブ先は 03_Tasks/archive/YYYY-MM.md・書いたら読み直す・アーカイブの表示（2026-10-06・TB-Q75）
   入口: test/taskboard.js（ctx を受け取る。単独実行は ./test/run taskboard archive）
   照合する ID: TB-AF1〜AF5・TB-AV1〜AV4。期待値の正本は docs/specs/taskboard/archive.md */
module.exports = {
  name: 'archive',
  ids: 'TB-AF1〜AF5・TB-AV1〜AV4',
  async run(ctx) {
    const { page, r, eq, fileUrl, F1, TODAY, withDialogs } = ctx;
    await page.goto(fileUrl('web/taskboard.html'));
    const DONE9 = '- [x] 資料作成 #102 [[2026-07-07]] ✅ 2026-08-04';
    // F1 の9行目を完了にして保存し、「終了を含む」を ON にしてアーカイブする（engine 節の archive ヘルパと同じ流れ）。
    // pre = [[パス, 本文], …] を先にアーカイブのフォルダへ置く
    const archiveOnce = (today, pre) => withDialogs('accept', () => page.evaluate(async ([f1, td, files]) => {
      window.taskboard.test.setToday(td);
      const s = window.taskboard.test.newSession(f1);
      window.__s = s;
      if (files) for (const [p, t] of files) s.setArchiveFile(p, t);
      s.applyOps([{ type: 'complete', line: 9 }]);
      await s.save();
      const cb = document.getElementById('f-done'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      const res = await s.archive();
      return { res, files: s.listArchiveFiles(), tasks: s.getAdapterText(), banner: document.getElementById('banner').textContent };
    }, [F1, today, pre || null]));

    /* ---------- TB-AF1: 月のファイルへ・archive.md には書かない ---------- */
    const af1 = await archiveOnce(TODAY, [['archive.md', 'X\n']]);
    const aug = af1.result.files['archive/2026-08.md'] || '';
    r.check('TB-AF1（archive/2026-08.md へ・archive.md は変えない・確認の文に書く先）',
      af1.result.res.ok === true && af1.result.files['archive.md'] === 'X\n' && aug.startsWith('# archive\n') && aug.includes(DONE9)
      && eq(af1.messages, ['1件を archive/2026-08.md へ移動します。よろしいですか？']), JSON.stringify(af1));

    /* ---------- TB-AF2: 月をまたぐ（TB-AF1 のセッションの続き） ---------- */
    const af2 = await withDialogs('accept', () => page.evaluate(async () => {
      const s = window.__s;
      const before = s.listArchiveFiles()['archive/2026-08.md'];
      window.taskboard.test.setToday('2026-09-02');
      const i = s.getText().split('\n').findIndex(l => l.startsWith('- [ ] ')) + 1;   // 残っている最初の未完了（資料Rv）を完了にして移す
      s.applyOps([{ type: 'complete', line: i }]);
      await s.save();
      const res = await s.archive();
      return { res, before, files: s.listArchiveFiles() };
    }));
    r.check('TB-AF2（9月は archive/2026-09.md へ・8月のファイルは変えない）',
      af2.result.res.ok === true && af2.result.files['archive/2026-08.md'] === af2.result.before
      && (af2.result.files['archive/2026-09.md'] || '').includes('資料Rv'), JSON.stringify(af2.result));

    /* ---------- TB-AF3: 書いたあとの読み直しが違う ---------- */
    const af3 = await withDialogs('accept', () => page.evaluate(async ([f1, td]) => {
      window.taskboard.test.setToday(td);
      const s = window.taskboard.test.newSession(f1);
      const folder = state.archiveFolder;
      const real = folder.writeFile;
      folder.writeFile = (p, text) => real.call(folder, p, text.slice(0, Math.floor(text.length / 2)));   // 途中で切れた
      s.applyOps([{ type: 'complete', line: 9 }]);
      await s.save();
      const cb = document.getElementById('f-done'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      const res = await s.archive();
      folder.writeFile = real;
      return { res, tasks: s.getAdapterText(), banner: document.getElementById('banner').textContent };
    }, [F1, TODAY]));
    r.check('TB-AF3（読み直しが書いたものと違えば tasks.md から消さない）',
      af3.result.res.ok === false && af3.result.res.reason === 'archverify' && af3.result.tasks.includes(DONE9)
      && af3.result.banner.includes('消していません'), JSON.stringify(af3.result));

    /* ---------- TB-AF4: tasks.md のあるフォルダか ---------- */
    const af4 = await page.evaluate(async () => {
      const tasks = { name: 'tasks.md' };
      const nf = () => { const e = new Error('nf'); e.name = 'NotFoundError'; return e; };
      const dir = (fh) => ({ name: 'x', getFileHandle: async (n) => { if (n !== 'tasks.md' || !fh) throw nf(); return fh; } });
      const same = { isSameEntry: async (o) => o === tasks };
      const other = { isSameEntry: async () => false };
      const noApi = { getFile: async () => ({ text: async () => '# tasks\n' }) };
      return [await isTasksFolder(dir(same), tasks, 'tasks.md', ''), await isTasksFolder(dir(other), tasks, 'tasks.md', ''),
        await isTasksFolder(dir(null), tasks, 'tasks.md', ''), await isTasksFolder(dir(noApi), tasks, 'tasks.md', '# tasks\n')];
    });
    r.check('TB-AF4（isTasksFolder: 同じ tasks.md なら true・同名の別ファイルと tasks.md の無いフォルダは false・isSameEntry が無ければ中身で）',
      eq(af4, [true, false, false, true]), JSON.stringify(af4));

    /* ---------- TB-AF5: 写しは archive.md と月のファイルの両方から数える ---------- */
    const af5 = await archiveOnce(TODAY, [['archive.md', '# archive\n\n## PEW\n\n- [x] 前に移した [[2026-07-07]] ✅ 2026-07-30\n']]);
    const af5copy = await page.evaluate(() => { const d = ToolStorage.load('tasklinks'); return d && d.notes ? d.notes['2026-07-07'] : null; });
    r.check('TB-AF5（関連ノートの写しのアーカイブ分は archive.md と archive/*.md の全部から数える — total 3・done 2）',
      af5.result.res.ok === true && !!af5copy && af5copy.total === 3 && af5copy.done === 2, JSON.stringify(af5copy));
  },
};
```

  （TB-AV1〜AV4 は Task 2 でこの節に足す）

- [ ] **Step 3: 節を登録して落ちることを確かめる** — `test/taskboard.js` の `SECTIONS` の `'links'` の前に `'archive'` を入れる。

Run: `./test/run taskboard archive`
Expected: TB-AF1〜AF5 が FAIL（`setArchiveFile` / `listArchiveFiles` / `isTasksFolder` が無い）

- [ ] **Step 4: `web/taskboard/archive.js` — アーカイブ先** — `// archive.md のアダプタを用意…` の行から `archiveTargetName` の関数の閉じ括弧までを、次に置き換える:

```js
/* ---------- アーカイブ先（2026-10-06・TB-AF・TB-Q75） ----------
   tasks.md と同じフォルダ（03_Tasks）を一度だけ選んでもらい、その中の archive/YYYY-MM.md（アーカイブした月）へ追記する。
   以前は「最初に選んだファイル」のハンドルを覚えていたが、場所が見えず、2026-09-24 の分は vault の外のどこかへ書かれて見つからなかった
   （AR-1 の案4・TB-Q10 をここで実装した） */
const ARCHIVE_DIR = 'archive';
function archiveMonthPath(today) { return ARCHIVE_DIR + '/' + String(today).slice(0, 7) + '.md'; }
// archive.md か 月のファイル（YYYY-MM.md）か — Plan Tasks で開いても関連ノートの写しを書かない（TB-LN7）
function isArchiveFileName(name) {
  const b = String(name || '').split('/').pop();
  return /^archive\.md$/i.test(b) || /^\d{4}-\d{2}\.md$/.test(b);
}
function archiveNotFound() { const e = new Error('not found'); e.name = 'NotFoundError'; return e; }
const isArchivePath = (p) => p === 'archive.md' || (p.startsWith(ARCHIVE_DIR + '/') && /\.md$/i.test(p));

// メモリのフォルダ（テストとメモリのセッション）。パス → 本文
function makeMemoryFolder(name) {
  const files = new Map();
  return {
    name: name || '',
    async readFile(path) { if (!files.has(path)) throw archiveNotFound(); return files.get(path); },
    async writeFile(path, text) { files.set(path, text); },
    async listFiles() { return [...files.keys()].filter(isArchivePath); },
    _files: files,
  };
}
// FSA のフォルダ（03_Tasks）。archive/ は書くときに無ければ作る
function makeFsaFolder(dir) {
  const fileOf = async (path, create) => {
    const parts = path.split('/');
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
    return d.getFileHandle(parts[parts.length - 1], { create });
  };
  return {
    name: dir.name,
    async readFile(path) { return (await (await fileOf(path, false)).getFile()).text(); },
    async writeFile(path, text) { const w = await (await fileOf(path, true)).createWritable(); await w.write(text); await w.close(); },
    async listFiles() {
      const out = [];
      try { await dir.getFileHandle('archive.md'); out.push('archive.md'); } catch (_) { /* 無ければ出さない */ }
      try {
        const sub = await dir.getDirectoryHandle(ARCHIVE_DIR);
        for await (const [n, h] of sub.entries()) if (h.kind === 'file' && /\.md$/i.test(n)) out.push(ARCHIVE_DIR + '/' + n);
      } catch (_) { /* まだ archive/ が無い */ }
      return out;
    },
  };
}
// 選んだフォルダが「開いている tasks.md のあるフォルダ」か（同じファイルか — isSameEntry。無い環境は中身を比べる — TB-AF4）
async function isTasksFolder(dir, tasksHandle, tasksName, snapshot) {
  let fh;
  try { fh = await dir.getFileHandle(tasksName); } catch (_) { return false; }
  if (tasksHandle && typeof fh.isSameEntry === 'function') {
    try { return await fh.isSameEntry(tasksHandle); } catch (_) { /* 比べられなければ中身で */ }
  }
  try { return nfc(await (await fh.getFile()).text()) === nfc(snapshot); } catch (_) { return false; }
}
// アーカイブ先のフォルダ。interactive のときだけ権限を求め・初回はフォルダを選ばせる（repick で選び直す）
async function getArchiveFolder(interactive, repick) {
  if (state.adapter && state.adapter.mode === 'memory') {
    if (!state.archiveFolder) state.archiveFolder = makeMemoryFolder('');
    return state.archiveFolder;
  }
  if (!state.adapter || state.adapter.mode !== 'fsa') return null;
  let dir = repick ? null : state.archiveDirHandle;
  if (!dir && !repick) { try { dir = await handles.get(IDB_KEY_ARCH_DIR); } catch (_) {} }
  if (dir && dir.kind === 'directory') {
    let ok = false;
    try { ok = interactive ? await verifyPermission(dir) : (await dir.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (_) {}
    if (ok) { state.archiveDirHandle = dir; return (state.archiveFolder = makeFsaFolder(dir)); }
  }
  if (!interactive) return null;
  showBanner('info', 'アーカイブを置くフォルダとして、' + state.adapter.name + ' のあるフォルダ（03_Tasks など）を選んでください。'
    + 'アーカイブはその中の archive/年-月.md に入ります');
  try {
    // startIn に tasks.md のハンドルを渡すと、そのファイルのあるフォルダでピッカーが開く
    dir = await window.showDirectoryPicker({ mode: 'readwrite', startIn: state.adapter.handle || undefined });
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
    throw e;
  }
  if (!(await isTasksFolder(dir, state.adapter.handle, state.adapter.name, state.snapshot))) {
    showBanner('error', '選んだフォルダ（' + dir.name + '）に、開いている ' + state.adapter.name + ' がありません。'
      + state.adapter.name + ' と同じフォルダを選んでください');
    return null;
  }
  state.archiveDirHandle = dir;
  handles.set(IDB_KEY_ARCH_DIR, dir).catch(() => {});
  return (state.archiveFolder = makeFsaFolder(dir));
}
// 書く先の表示名: 'archive/2026-08.md'（FSA はフォルダ名を付けて '03_Tasks/archive/2026-10.md'）
function archiveTargetName() {
  const n = state.archiveFolder && state.archiveFolder.name;
  return (n ? n + '/' : '') + archiveMonthPath(todayStr());
}
// アーカイブのファイルを全部読む（月のファイルは新しい順・最後に archive.md）— 表示と関連ノートの写し
async function readAllArchives(folder) {
  const paths = (await folder.listFiles())
    .sort((a, b) => (a === 'archive.md') - (b === 'archive.md') || (a < b ? 1 : a > b ? -1 : 0));
  const out = [];
  for (const p of paths) { try { out.push({ path: p, text: await folder.readFile(p) }); } catch (_) { /* 読めないものは飛ばす */ } }
  return out;
}
```

  アーカイブボタンの title の `'表示中の完了グループを archive.md へ移動して tasks.md から除去'` を `'表示中の完了グループを archive/年-月.md（tasks.md と同じフォルダ）へ移動して tasks.md から除去'` に

- [ ] **Step 5: `doArchive`** — `let arch;` の行から関数の終わり（`return { ok: true, moved: lineNos.length };` と閉じ括弧）までを、次に置き換える:

```js
  let folder;
  try {
    folder = await getArchiveFolder(true, false);
  } catch (e) {
    showBanner('error', 'アーカイブのフォルダを開けませんでした: ' + (e && e.name));
    return { ok: false, reason: 'archopen' };
  }
  if (!folder) return { ok: false, reason: 'archcancel' };
  const path = archiveMonthPath(todayStr());
  // ファイルをまたぐ不可逆な移動なので件数によらず必ず確認する。どのファイルへ入るかを示す（AR-1 / AR-3）
  // 対象は「画面に出ているもの」なので、検索で絞り込み中はそれを隠さない
  // （8/3 のアーカイブ事故と同じ型を防ぐ）
  const filterNote = String(state.ui.q || '').trim() !== '' ? '（検索で絞り込み中）' : '';
  const cancelled = archivableCancelledCount();
  const breakdown = cancelled ? '（うち中止 ' + cancelled + '件）' : '';
  if (!confirm(archivableTaskCount() + '件' + breakdown + 'を ' + archiveTargetName() + ' へ移動します。' +
      filterNote + 'よろしいですか？')) {
    showBanner('info', 'アーカイブを中止しました');
    return { ok: false, reason: 'cancel' };
  }
  // 書き込み直前に読み直して追記（外部編集を消さない）。無ければヘッダを付与して新規作成
  let archText = '';
  try { archText = await folder.readFile(path); }
  catch (e) {
    // 読めないのに空とみなして書くと、それまでの分が全部消える（2026-10-06・TB-A8 — 以前はここで '' にしていた）。
    // まだ無いファイル（NotFoundError）だけは新しく作る（TB-A9）。それ以外は何も書かずに止める（tasks の行も消さない）
    if (!(e && e.name === 'NotFoundError')) {
      showBanner('error', archiveTargetName() + ' を読めなかったので、アーカイブを中止しました（前の分を上書きして消さないため）。'
        + 'Obsidian で ' + archiveTargetName() + ' が開けるか確かめてから、もう一度押してください: ' + (e && e.name));
      return { ok: false, reason: 'archread' };
    }
  }
  // 案件（セクション）ごとにまとめて、その見出しの下へ（TB-Q63）
  const groups = [];
  for (const t of roots.slice().sort((a, b) => a.line - b.line)) {
    const sec = t.section || '';
    let g = groups.find(x => x.section === sec);
    if (!g) { g = { section: sec, lines: [] }; groups.push(g); }
    for (const n of subtreeLines(t, []).sort((a, b) => a - b)) g.lines.push(state.lines[n - 1].raw);
  }
  const out = archiveMerge(archText, groups);
  try {
    await folder.writeFile(path, out);
  } catch (e) {
    showBanner('error', archiveTargetName() + ' への書き込みに失敗しました（tasks.md からは消していません）: ' + (e && e.name));
    return { ok: false, reason: 'archwrite' };
  }
  // 書いたら読み直して、書いたとおりか確かめてから tasks.md の行を消す（TB-AF3 — 同期や別のアプリの書き戻しで消えないように）
  let back = null;
  try { back = await folder.readFile(path); } catch (_) { /* 下で止める */ }
  if (back === null || nfc(back) !== nfc(out)) {
    showBanner('error', archiveTargetName() + ' に書いた内容を確かめられなかったので、tasks.md からは消していません。'
      + 'Obsidian で ' + archiveTargetName() + ' を開いて中身を確かめてください');
    return { ok: false, reason: 'archverify' };
  }
  for (let i = lineNos.length - 1; i >= 0; i--) state.lines.splice(lineNos[i] - 1, 1);
  state.lastUndo = null;   // アーカイブは別のファイルにも書くので Cmd+Z では戻さない（TB-Q71）
  const text = joinLines(state.lines);
  try {
    await state.adapter.write(text);
  } catch (e) {
    state.lines = toLines(state.snapshot); // 除去を取り消して読込時状態へ戻す
    render();
    showBanner('error', archiveTargetName() + ' へは追記済みですが tasks.md の保存に失敗しました（行は残っています。再実行すると '
      + archiveTargetName() + ' 側が重複します）: ' + (e && e.name));
    return { ok: false, reason: 'writefail' };
  }
  state.snapshot = text;
  for (const l of state.lines) l.orig = l.raw;
  state.archiveCache = null;   // アーカイブの表示は読み直す（TB-AV3）
  render();
  // アーカイブの全部（archive.md と archive/*.md）を数えて写しを書き直す（済んだタスクを移した途端に閉じどきが消えないように — TB-LN6・TB-AF5）
  if (window.ToolTaskLinks) {
    const all = await readAllArchives(folder);
    state.archLinks = ToolTaskLinks.count(all.flatMap(f => parseDoc(toLines(f.text)).tasks));
    publishTaskLinks();
  }
  showBanner('success', 'アーカイブしました（' + lineNos.length + '行を ' + archiveTargetName() + ' へ移動）');
  return { ok: true, moved: lineNos.length };
}
```

- [ ] **Step 6: つなぐ**
  - `web/taskboard.html`:
    - `const IDB_KEY_ARCH = 'archivemd'; // …` を `const IDB_KEY_ARCH_DIR = 'archivedir'; // 完了アーカイブ先のフォルダ（tasks.md と同じ 03_Tasks — TB-Q75。以前の 'archivemd' はファイル1つのハンドルで、場所が見えなかった）` に
    - テスト用フックの `state.archiveAdapter = makeMemoryAdapter(''); // アーカイブ検証用（メモリ）` を `state.archiveFolder = makeMemoryFolder('');   // アーカイブ検証用（メモリのフォルダ — TB-AF）` に
    - `getArchiveText: () => state.archiveAdapter._get(),` を `getArchiveText: () => state.archiveFolder._files.get(archiveMonthPath(todayStr())) || '',   // 今月のファイル` に
    - `setArchiveText: (t) => state.archiveAdapter._external(t),` を `setArchiveText: (t) => state.archiveFolder._files.set(archiveMonthPath(todayStr()), t),` に
    - その次に `getArchiveFile: (p) => state.archiveFolder._files.get(p),`・`setArchiveFile: (p, t) => state.archiveFolder._files.set(p, t),`・`listArchiveFiles: () => Object.fromEntries(state.archiveFolder._files),` を足す
  - `web/taskboard/io.js`:
    - state の `archiveAdapter: null, archiveHandle: null,` を `archiveFolder: null, archiveDirHandle: null, archiveCache: null,   // アーカイブ先のフォルダ（TB-AF）・表示用に読んだアーカイブ（TB-AV）` に
    - `publishTaskLinks` の `if (file === archiveTargetName()) return;` を `if (isArchiveFileName(file)) return;   // archive.md・月のファイルを開いて眺めているときは書かない（TB-LN7）` に
  - `test/taskboard/engine.js`:
    - TB-A1 の期待 `'1件を archive.md へ移動します。よろしいですか？'` を `'1件を archive/2026-08.md へ移動します。よろしいですか？'` に
    - `archReadFails` のすり替えを次にする（**1回目の読み込みだけ**失敗させる — 2回目は書いたあとの読み直しで、TB-A9 ではそれが通らないと移せない）:

```js
    const folder = state.archiveFolder;
    const realRead = folder.readFile;
    let n = 0;
    folder.readFile = async (p) => { if (n++ === 0) { const e = new Error('読めない'); e.name = name; throw e; } return realRead.call(folder, p); };
```

    戻しは `folder.readFile = realRead;`
  - `test/taskboard/edit.js` の TB-M10 と `test/taskboard/status.js` の TB-S30 の `を archive.md へ移動します` を `を archive/2026-08.md へ移動します` に（`grep -rn "archive.md へ移動" test/` で他に無いことを確かめる）

- [ ] **Step 7: 通ることを確かめる**

Run: `./test/run taskboard archive`
Expected: TB-AF1〜AF5 が PASS

Run: `./test/run taskboard`
Expected: すべて pass（TB-15〜19・AR1/AR2・A1〜A9・M10・S30・LN6・LN7 も）

- [ ] **Step 8: コミット**

```bash
git add web/taskboard/archive.js web/taskboard/io.js web/taskboard.html docs/specs/taskboard/archive.md docs/specs/taskboard/engine.md test/taskboard/engine.js test/taskboard/edit.js test/taskboard/status.js test/taskboard/archive.js test/taskboard.js
git commit -m "taskboard: アーカイブ先を tasks.md と同じフォルダの archive/YYYY-MM.md（月ごと）に・違うフォルダは使わない・書いたら読み直して確かめてから tasks.md を消す（2026-09-24 の分が書き込み先不明で消えた — TB-AF1〜AF5・TB-Q75）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 「アーカイブ」の表示

**Files:**
- Create: `web/taskboard/archive-view.js`
- Modify: `web/taskboard.html`（タブ・`#archive-view`・`<script src>`・CSS）
- Modify: `web/taskboard/io.js`（`UI_VIEWS` に `'archive'`・`loadText` で表示の覚えを捨てる）
- Modify: `web/taskboard/list.js`（`render` の表示の切り替え）
- Modify: `web/taskboard/timeline.js`（`updateCopyButton` — アーカイブの表示ではコピーを隠す）
- Modify: `docs/specs/taskboard/archive.md`（TB-AV1〜AV4）・`test/taskboard/archive.js`

**Interfaces:**
- Consumes:
  - Task 1 の `getArchiveFolder(interactive, repick)`・`readAllArchives(folder)`
  - engine.js の `parseDoc`・`toLines`・`nfc`・`ST_CANCELLED`
  - `ToolEdit.fillDate(host, ymd, today)`
- Produces:
  - `renderArchiveView()`・`loadArchiveView(interactive, repick)`
  - `state.archiveCache = { folder: string|null, files: [{path, text}] } | null`
- Produces（DOM）:
  - タブ `#view-tabs [data-view="archive"]` と、中身を入れる `#archive-view`
  - `#archive-view` の頭: `.av-head`（`.av-where` と `#av-repick`）
  - ファイルごと: `section.av-file[data-path]`（`h3` に パスと件数）
  - 案件ごと: `h4.av-sec`
  - タスクの行 `.av-task`（`.av-mark` ☑／－・`.av-body`・`.av-date`）。子は `.av-task.av-child`
  - メモ `.av-memo`。何も無いとき `.av-empty`

- [ ] **Step 1: spec** — Task 1 の節の表の後に:

```markdown
### アーカイブの表示（TB-AV1〜AV4）

表示の切り替え（リスト／ボード／タイムライン）に**［アーカイブ］**。タスクの邪魔にならないよう、別の表示として読むだけ。
- 見出しに**どこを読んでいるか**（「03_Tasks — archive/2026-10.md・archive.md」）と［フォルダを選び直す］
- **月のファイルは新しい順、最後に archive.md**。ファイルの中は**案件（見出し）ごと**に並べる。済んだタスク（☑・中止は －）と済んだ日（`2026/10/1(木)`）を出し、**メモは開いた状態**で、子タスクは字下げして出す
- **検索欄が効く**（本文とメモ — 「先方」で先方の回答が出る）。件数は「N 件ヒット」。絞り込み（案件・タグ）・並び順・「終了を含む」はこの表示には効かない
- Excel用コピーは出さない（コピーするものが無い）
- まだ何も無ければ「まだアーカイブはありません」。フォルダを開いていない・権限が切れているときは［アーカイブのフォルダを開く］（押すまでピッカーも権限の確認も出さない）

| ID | 操作 | 期待 |
|---|---|---|
| TB-AV1 | archive.md（PEW に1件）と archive/2026-07.md（ITK に「先方に確認」✅ 2026-07-20・メモ「先方の回答: ネットワークで制御」・子「子の確認」）を置いて［アーカイブ］ | ファイルの順が archive/2026-07.md → archive.md・案件 ITK・「先方に確認」の日付が 2026/7/20(月)・メモと子が出る・リスト（`#table-wrap`）と Excel用コピーは隠れる |
| TB-AV2 | 検索欄に「ネットワーク」 | 「先方に確認」だけが出て「1 件ヒット」 |
| TB-AV3 | リストで1件をアーカイブしてから［アーカイブ］ | archive/2026-08.md にその1件が出る（読み直す） |
| TB-AV4 | 何も無いフォルダで［アーカイブ］ | 「まだアーカイブはありません」 |
```

- [ ] **Step 2: テストを足す** — `test/taskboard/archive.js` の TB-AF5 の check の後に:

```js
    /* ---------- TB-AV1〜AV4: アーカイブの表示 ---------- */
    const view = () => page.evaluate(() => {
      const v = document.getElementById('archive-view');
      if (!v) return { missing: true };
      return {
        hidden: v.hidden, listHidden: document.getElementById('table-wrap').hidden, copyHidden: document.getElementById('btn-copy').hidden,
        files: Array.from(v.querySelectorAll('section.av-file')).map(s => s.dataset.path),
        secs: Array.from(v.querySelectorAll('.av-sec')).map(h => h.textContent),
        tasks: Array.from(v.querySelectorAll('.av-task')).map(t => ({
          body: (t.querySelector('.av-body') || {}).textContent, date: (t.querySelector('.av-date') || {}).textContent || '', child: t.classList.contains('av-child') })),
        memos: Array.from(v.querySelectorAll('.av-memo')).map(m => m.textContent),
        empty: (v.querySelector('.av-empty') || {}).textContent || '', count: document.getElementById('q-count').textContent,
      };
    });
    const openArchive = () => page.evaluate(async () => {
      const b = document.querySelector('#view-tabs [data-view="archive"]');
      if (b) b.click();
      await new Promise(res => setTimeout(res, 150));
    });
    const toList = () => page.evaluate(() => { const b = document.querySelector('#view-tabs [data-view="list"]'); if (b) b.click(); });
    await page.evaluate(([f1, td]) => {
      window.taskboard.test.setToday(td);
      const s = window.taskboard.test.newSession(f1);
      s.setArchiveFile('archive.md', '# archive\n\n## PEW\n\n- [x] 前に移した ✅ 2026-07-30\n');
      s.setArchiveFile('archive/2026-07.md', '# archive\n\n## ITK\n\n- [x] 先方に確認 ✅ 2026-07-20\n\t- 先方の回答: ネットワークで制御\n\t- [x] 子の確認 ✅ 2026-07-19\n');
    }, [F1, TODAY]);
    await openArchive();
    const av1 = await view();
    r.check('TB-AV1（アーカイブ: 月のファイルが新しい順で最後に archive.md・案件ごと・済んだ日・メモと子・リストとコピーは隠れる）',
      !av1.missing && !av1.hidden && av1.listHidden && av1.copyHidden && eq(av1.files, ['archive/2026-07.md', 'archive.md']) && av1.secs.includes('ITK')
      && av1.tasks.some(t => t.body === '先方に確認' && t.date === '2026/7/20(月)') && av1.memos.includes('先方の回答: ネットワークで制御')
      && av1.tasks.some(t => t.body === '子の確認' && t.child), JSON.stringify(av1));
    await page.fill('#f-q', 'ネットワーク');
    await page.waitForTimeout(400);
    const av2 = await view();
    r.check('TB-AV2（検索はメモも探す: 「ネットワーク」で「先方に確認」だけ・1 件ヒット）',
      eq(av2.tasks.filter(t => !t.child).map(t => t.body), ['先方に確認']) && av2.count === '1 件ヒット', JSON.stringify(av2));
    await page.fill('#f-q', '');
    await page.waitForTimeout(400);
    await toList();
    await archiveOnce(TODAY);
    await openArchive();
    const av3 = await view();
    r.check('TB-AV3（リストでアーカイブしたあと［アーカイブ］を開くと、その月のファイルに出る）',
      av3.files.includes('archive/2026-08.md') && av3.tasks.some(t => (t.body || '').includes('資料作成')), JSON.stringify(av3));
    await page.evaluate(([f1, td]) => { window.taskboard.test.setToday(td); window.taskboard.test.newSession(f1); }, [F1, TODAY]);
    await openArchive();
    const av4 = await view();
    r.check('TB-AV4（何も無ければ「まだアーカイブはありません」）', av4.empty === 'まだアーカイブはありません', JSON.stringify(av4));
    await toList();   // 表示の選択は localStorage に残るので、次の節のためにリストへ戻す
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `./test/run taskboard archive`
Expected: TB-AV1〜AV4 が FAIL（`#archive-view` が無い）

- [ ] **Step 4: `web/taskboard/archive-view.js` を作る**

```js
'use strict';
/* web/taskboard/archive-view.js — 「アーカイブ」の表示（2026-10-06・TB-AV1〜AV4・TB-Q75）
   入口: web/taskboard.html（このファイルは単独では動かない）。前提: archive.js（getArchiveFolder・readAllArchives）・engine.js（parseDoc・toLines・nfc）・
   lib/edit.js（ToolEdit.fillDate）・list.js（render）。読み込み時に実行する文は無い（宣言だけ）。
   読むだけ。案件ごと・済んだ日・メモを開いた状態で並べ、検索欄が効く（本文とメモ） */

let archiveLoading = false;

// フォルダを読んで覚える（描き直しは render から — 検索のたびに読み直さない）。
// interactive = ボタンを押したとき（権限の確認・ピッカーを出してよい）。repick = 選び直す
async function loadArchiveView(interactive, repick) {
  if (archiveLoading) return;
  archiveLoading = true;
  try {
    let folder = null;
    try { folder = await getArchiveFolder(interactive, repick); } catch (_) { /* 開けなければ下の案内 */ }
    if (!folder && repick) { try { folder = await getArchiveFolder(false, false); } catch (_) {} }   // 選び直しをやめたら前のフォルダのまま
    state.archiveCache = folder ? { folder: folder.name, files: await readAllArchives(folder) } : { folder: null, files: [] };
  } finally { archiveLoading = false; }
  if (state.ui.view === 'archive') render();
}

function renderArchiveView() {
  const host = el('archive-view');
  host.textContent = '';
  if (!state.archiveCache) {
    const p = document.createElement('p');
    p.className = 'av-empty';
    p.textContent = '読み込み中…';
    host.appendChild(p);
    loadArchiveView(false, false);
    return;
  }
  const c = state.archiveCache;
  const head = document.createElement('div');
  head.className = 'av-head';
  const where = document.createElement('span');
  where.className = 'av-where';
  where.textContent = c.folder === null ? 'アーカイブのフォルダを開いていません'
    : (c.folder ? c.folder + ' — ' : '') + (c.files.length ? c.files.map(f => f.path).join('・') : 'archive/（まだありません）');
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.id = 'av-repick';
  pick.textContent = c.folder === null ? 'アーカイブのフォルダを開く' : 'フォルダを選び直す';
  pick.title = 'tasks.md のあるフォルダ（03_Tasks など）を選びます。アーカイブはその中の archive/年-月.md に入ります';
  pick.addEventListener('click', () => { const re = c.folder !== null; state.archiveCache = null; render(); loadArchiveView(true, re); });
  head.append(where, pick);
  host.appendChild(head);
  const q = nfc(String(state.ui.q || '')).trim().toLowerCase();
  const hit = (t) => nfc([t.displayBody].concat(t.memo).join('\n')).toLowerCase().includes(q) || t.children.some(hit);
  let hits = 0;
  for (const f of c.files) {
    const roots = parseDoc(toLines(f.text)).tasks.filter(t => t.parentLine === null && (q === '' || hit(t)));
    if (!roots.length) continue;
    hits += roots.length;
    const sec = document.createElement('section');
    sec.className = 'av-file';
    sec.dataset.path = f.path;
    const h3 = document.createElement('h3');
    h3.textContent = f.path + '（' + roots.length + '件）';
    sec.appendChild(h3);
    let cur = null;
    for (const t of roots) {
      if (t.section !== cur) {
        cur = t.section;
        const h4 = document.createElement('h4');
        h4.className = 'av-sec';
        h4.textContent = cur || '（案件なし）';
        sec.appendChild(h4);
      }
      archiveTaskRow(sec, t, 0);
    }
    host.appendChild(sec);
  }
  el('q-count').textContent = q === '' ? '' : hits + ' 件ヒット';
  if (!hits) {
    const p = document.createElement('p');
    p.className = 'av-empty';
    p.textContent = q === '' ? 'まだアーカイブはありません' : '一致するアーカイブはありません（検索: ' + state.ui.q.trim() + '）';
    host.appendChild(p);
  }
}

// 1件（メモは開いた状態・子は字下げ）
function archiveTaskRow(host, t, depth) {
  const row = document.createElement('div');
  row.className = 'av-task' + (depth ? ' av-child' : '');
  row.style.paddingLeft = (depth * 1.4) + 'em';
  const mark = document.createElement('span');
  mark.className = 'av-mark';
  mark.textContent = t.status === ST_CANCELLED ? '－' : '☑';
  const body = document.createElement('span');
  body.className = 'av-body';
  body.textContent = t.displayBody;
  row.append(mark, body);
  if (t.doneDate) {
    const d = document.createElement('span');
    d.className = 'av-date';
    ToolEdit.fillDate(d, t.doneDate, todayStr());
    row.appendChild(d);
  }
  host.appendChild(row);
  for (const m of t.memo) {
    const p = document.createElement('div');
    p.className = 'av-memo';
    p.style.paddingLeft = (depth * 1.4 + 1.6) + 'em';
    p.textContent = m;
    host.appendChild(p);
  }
  for (const k of t.children) archiveTaskRow(host, k, depth + 1);
}
```

- [ ] **Step 5: つなぐ**
  - `web/taskboard.html`:
    - `<button data-view="timeline">タイムライン</button>` の次に `<button data-view="archive" title="アーカイブしたタスクを読む（読むだけ・メモつき・検索が効く）">アーカイブ</button>`
    - `#timeline-view` の `</div>` の次に `<div id="archive-view" hidden></div>`
    - `<script src="taskboard/archive.js"></script>` の次に `<script src="taskboard/archive-view.js"></script>`
    - `<style>` に次を足す:

```css
  /* アーカイブの表示（TB-AV — 読むだけ） */
  #archive-view { max-width: 980px; }
  .av-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 4px 0 10px; font-size: 13px; color: var(--muted); }
  .av-file { margin: 0 0 18px; }
  .av-file h3 { font-size: 14px; margin: 0 0 6px; color: var(--muted); font-weight: 600; }
  .av-sec { font-size: 13px; margin: 10px 0 4px; }
  .av-task { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; font-size: 13.5px; }
  .av-mark { color: var(--success); flex: none; }
  .av-body { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .av-date { flex: none; font-size: 12px; color: var(--muted); }
  .av-memo { font-size: 12.5px; color: var(--muted); padding: 1px 0; overflow-wrap: anywhere; }
  .av-empty { color: var(--muted); }
```

  - `web/taskboard/io.js`:
    - `const UI_VIEWS = ['list', 'board', 'timeline'];` を `const UI_VIEWS = ['list', 'board', 'timeline', 'archive'];` に
    - `loadText` の `state.lastUndo = null;` の行の次に `state.archiveCache = null;   // 別のファイルかもしれない（アーカイブの表示は読み直す — TB-AV）` を足す
  - `web/taskboard/list.js` の `render`:
    - 未読み込みの分岐の `el('board-view').hidden = true;` の次に `el('archive-view').hidden = true;`
    - `el('timeline-view').hidden = state.ui.view !== 'timeline';` と次の `if (state.ui.view === 'timeline') {` を次にする:

```js
  el('timeline-view').hidden = state.ui.view !== 'timeline';
  el('archive-view').hidden = state.ui.view !== 'archive';   // アーカイブ（読むだけ — TB-AV。archive-view.js）
  if (state.ui.view === 'archive') {
    state.timeline = null;
    el('empty-msg').hidden = true;
    renderArchiveView();
  } else if (state.ui.view === 'timeline') {
```

    - `el('q-count').textContent = q === '' ? '' : hitCount + ' 件ヒット';` を `if (state.ui.view !== 'archive') el('q-count').textContent = q === '' ? '' : hitCount + ' 件ヒット';   // アーカイブはその件数（archive-view.js）` に
  - `web/taskboard/timeline.js` の `updateCopyButton` の `el('btn-to-gantt').hidden = …` の次に `el('btn-copy').hidden = state.ui.view === 'archive';   // アーカイブの表示にはコピーするものが無い（TB-AV1）`

- [ ] **Step 6: 通ることを確かめる**

Run: `./test/run taskboard archive`
Expected: TB-AF1〜AF5・TB-AV1〜AV4 が PASS

Run: `./test/run`
Expected: すべて pass（コンソールエラー0件）

- [ ] **Step 7: 目で確かめる**（1回だけ）— vault の `03_Tasks/archive.md`（19件）の写しを `setArchiveFile('archive.md', …)` で渡したメモリのセッションで［アーカイブ］を撮る（ライト／ダーク・1280px）。vault のファイルには書かない

- [ ] **Step 8: コミット**

```bash
git add web/taskboard/archive-view.js web/taskboard.html web/taskboard/io.js web/taskboard/list.js web/taskboard/timeline.js docs/specs/taskboard/archive.md test/taskboard/archive.js
git commit -m "taskboard: 表示に［アーカイブ］— アーカイブしたタスクを月のファイルごと・案件ごと・済んだ日とメモつきで読む（読むだけ・検索はメモも探す・どこを読んでいるかを出す — TB-AV1〜AV4）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 決定事項と仕上げ

- [ ] **Step 1** — `docs/specs/taskboard/decisions.md` の末尾に:

```markdown
- **TB-Q75**（2026-10-06）: アーカイブ先を **tasks.md と同じフォルダ（03_Tasks）の `archive/YYYY-MM.md`（アーカイブした月）** にし、**書いたら読み直して確かめてから** tasks.md の行を消す。
  あわせて表示に［アーカイブ］（読むだけ・案件ごと・済んだ日・メモつき・検索）。利用者「今後消さないようにできる？？ archive もどんどん大きくなっていくので、
  ある程度の容量超えたら daily みたいに日付込みで保存しておく」→「月ごとに分ける」。
  理由: 2026-09-24 のアーカイブで済んだ16件（メモつき）が tasks.md から外れたのに vault の archive.md に入らず、Mac のどこにも見つからなかった（git の記録から戻した）。
  以前は「最初に選んだファイル」のハンドルを覚える作りで、書き込み先が見えず、確かめる手段も無かった（AR-1 の案4・**TB-Q10 はこれで解決**）。
  **フォルダは開いている tasks.md と同じファイルが入っていなければ使わない**。既存の archive.md には書かない（読むだけ — 表示で一緒に出す）。
  月は ✅ の日付ではなくアーカイブした日（1回の移動を2つのファイルに分けない）
```

  同じファイルの冒頭の「TB-Q10 = アーカイブ先の確実な検出（`showDirectoryPicker` 案・**未実装の要確認**）」を「TB-Q10 = アーカイブ先の確実な検出（`showDirectoryPicker` 案 — **2026-10-06 に TB-Q75 で実装**）」に

- [ ] **Step 2** — `./test/run` → すべて pass。`CLAUDE.md` の「**1046チェックの検証機構が**」を実数（1046 ＋ 9 ＝ 1055 のはず。違えば実数）に
- [ ] **Step 3: コミット**

```bash
git add docs/specs/taskboard/decisions.md CLAUDE.md
git commit -m "docs: アーカイブを月ごとのファイルにして書いたら確かめる・表示に［アーカイブ］の決定事項 TB-Q75（1055チェック）

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4（vault — 利用者の確認のあと）** — vault の `03_Tasks/archive.md` の冒頭の注記に「2026-10-06 から新しいアーカイブは `03_Tasks/archive/YYYY-MM.md`（月ごと）に入る。このファイルは読むだけ」を1行足す。**archive.md だけ**を vault の git にコミットする（tasks.md など作業中の変更は含めない）

---

## 確信を持てていない箇所

- `showDirectoryPicker({ startIn: <ファイルのハンドル> })` が、そのファイルのあるフォルダで開くこと（仕様の記述どおりのはず。違っても選ぶ場所が変わるだけで、TB-AF4 の判定が違うフォルダを止める）
- `FileSystemHandle.isSameEntry` が、別々のピッカーで得た同じファイルのハンドルで true を返すこと（仕様上そのための API。だめなら中身の比較に落ちる）
- 実機の FSA の流れ（初回のフォルダ選び・権限が切れたあとの［アーカイブのフォルダを開く］）はハーネスで通せない — 実装後に利用者の Chrome で1回確かめてもらう
