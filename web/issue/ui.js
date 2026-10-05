'use strict';
/* web/issue/ui.js — UI 配線（$id・実行・保存と復元・サンプル）と 04_Issues への書き込み（File System Access。ハンドルは lib/fsa.js）
   入口: web/issue.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ========== UI 配線 ========== */

const $id = id => document.getElementById(id);
const TOOL = 'issue';

const SAMPLE = [
  '# 本番停止手順書',
  '',
  '## 1. ゴール',
  '- 運営チームが自分たちだけで本番を停止できる手順書を出し、「これで実行できます」と言ってもらう',
  '',
  '## 2. 論点',
  '- 手順書が書けないのは情報が足りないからではなく、どこまで書けば運営チームが実行できるかの合意が無いからではないか',
  '',
  '## 3. 不明点',
  '- 運営チームはどの粒度なら実行できるかを聞く',
  '- 本番で動いているサービス・バッチを調べる',
  '- その手順で実際に静止するか開発環境で試す',
  '',
  '## 4. リスク',
  '- 本番環境へのアクセス日程が動くと全部ずれる → 先に開発環境で当たりを付ける',
  '',
  '## 5. 次の一手',
  '- 運営チームに求める完成度（粒度）を確認する',
].join('\n');

let lastParsed = parseSections('');

function renderVerdict(list, into, base) {
  const el = into || $id('verdict');
  const baseClass = base !== undefined ? base : (el.id === 'verdict' ? 'verdict' : '');
  el.textContent = '';
  const warns = list.filter(v => v.level === 'warn');
  el.className = baseClass + (warns.length === 0 ? ' verdict-ok' : '');
  if (warns.length === 0) {
    const li = document.createElement('li');
    li.className = 'v-ok';
    li.dataset.id = 'ok';
    li.textContent = '✓ 引っかかりなし — まず外していない';
    el.appendChild(li);
  }
  for (const v of list) {
    const li = document.createElement('li');
    li.className = 'v-' + v.level;
    li.dataset.id = v.id;
    const b = document.createElement('strong');
    b.textContent = (v.level === 'warn' ? '⚠ ' : '· ') + v.msg;
    li.appendChild(b);
    const s = document.createElement('span');
    s.textContent = ' — ' + v.fix;
    li.appendChild(s);
    el.appendChild(li);
  }
}

// 貼った内容から作るノートの md。**プレビューは持たない**（必要なときに組む — IS-Q10）
// project はウィザードの「案件」から来たときだけ（貼る欄には案件の入力が無い）
function noteMd(project) {
  return toNote(lastParsed, {
    deadline: $id('deadline').value, today: todayStr(), title: $id('title').value, project: project || '',
  });
}

function run() {
  const parsed = parseSections($id('input').value);
  lastParsed = parsed;
  renderVerdict(judge(parsed.issue, {
    deadline: $id('deadline').value, unknowns: parsed.subs,
    picture: (parsed.picture || []).join(' '),
  }));
}

let runTimer = null;
function scheduleRun() {
  clearTimeout(runTimer);
  runTimer = setTimeout(() => { runTimer = null; run(); }, 200);
}
// コピー時に確定 — デバウンス中の古い結果を渡さない（coding-rules「UI の標準形」）
function settle() { clearTimeout(runTimer); runTimer = null; run(); }

/* 保存規約（coding-rules）: デバウンス＋pagehide/visibilitychange フラッシュ、
   1フィールド 100KB 超は {omitted:true}（黙って捨てず次回起動時に通知） */
const FIELD_LIMIT = 100000;
let saveTimer = null;
function savePayload() {
  const v = $id('input').value;
  return {
    input: v.length > FIELD_LIMIT ? { omitted: true } : v,
    title: $id('title').value,
    deadline: $id('deadline').value,
    nowFolded: nowFolded,   // 「いま」をたたんだか（段2 — IS-LK14。宣言は now.js）
  };
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; ToolStorage.save(TOOL, savePayload()); }, 300);
}
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  ToolStorage.save(TOOL, savePayload());
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

function restore() {
  const data = ToolStorage.load(TOOL);
  if (!data) return;
  if (typeof data.input === 'string') $id('input').value = data.input;
  else if (data.input && data.input.omitted) {
    ToolUI.banner($id('banner'), 'info',
      '前回の内容は大きすぎたため復元されませんでした（保存上限 100KB/欄）');
  }
  if (typeof data.title === 'string') $id('title').value = data.title;
  if (typeof data.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) {
    $id('deadline').value = data.deadline;
  }
  if (typeof data.nowFolded === 'boolean') nowFolded = data.nowFolded;
}

// サンプル投入ボタンは入力が空のときだけ表示（coding-rules「UI の標準形」）
function updateSampleBtn() { $id('sample-btn').hidden = $id('input').value !== ''; }

$id('input').addEventListener('input', () => { scheduleRun(); updateSampleBtn(); scheduleSave(); });
$id('title').addEventListener('input', () => { scheduleRun(); scheduleSave(); });
$id('deadline').addEventListener('input', () => { scheduleRun(); scheduleSave(); });
$id('deadline').addEventListener('change', () => { scheduleRun(); scheduleSave(); });

$id('copy-btn').addEventListener('click', () => {
  settle();
  ToolUI.copy(noteMd()).then(ok =>
    ToolUI.feedback($id('copy-btn'), ok ? '✓ コピーしました' : 'コピーできませんでした'));
});
$id('copy-tasks-btn').addEventListener('click', () => {
  settle();
  const text = toTasks(lastParsed.next, { deadline: $id('deadline').value });
  if (text === '') {
    ToolUI.banner($id('banner'), 'warn', '「## 5. 次の一手」が空です — 最初に潰すものを1つ書いてください');
    return;
  }
  ToolUI.copy(text).then(ok =>
    ToolUI.feedback($id('copy-tasks-btn'), ok ? '✓ コピーしました' : 'コピーできませんでした'));
});
document.addEventListener('keydown', e => {
  // 一覧の中の欄（論点・分かったこと）で打った Enter は欄のもの。ここで作成まで走ると vault に「無題」のノートができる（IS-DG10）
  if (e.defaultPrevented || (e.target.closest && e.target.closest('#cards .ic-edit'))) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    // 直接保存できるなら作成、できないならコピー（＝そのときの唯一の経路）
    $id(fsaAvailable() ? 'create-btn' : 'copy-btn').click();
  }
});

/* ---------- 04_Issues への書き込み（File System Access・Chrome 系） ----------
   **フォルダ名をコードに書かない**（coding-rules「vault 連携」）— 利用者にピッカーで選ばせ、
   ハンドルを IndexedDB に覚える。既存ノートは書き換えない（同名なら止める — IS-Q2 改訂） */
const IDB_KEY = 'issueDir';
const handles = ToolFsa.handles('tools-issue');   // lib/fsa.js（db 名は従来どおり — 選び直させない）

let dirHandle = null;

function fsaAvailable() { return ToolFsa.available('dir'); }

// FSA 非対応（Safari / Firefox）では作成を無効にして理由を出す（Check Vault と同型）
function updateEnvNote() {
  const no = !fsaAvailable();
  $id('create-btn').disabled = no;
  $id('pick-btn').disabled = no;
  // **直接保存できるならコピーは要らない**（利用者「コピー用は必要ない。そのまま保存できるんだよね？」）。
  // 保存できない Safari / Firefox のときだけ、唯一の経路として出す
  $id('copy-btn').hidden = !no;
  const msg = no
    ? 'このブラウザでは直接作成できません（showDirectoryPicker が必要 — Chrome 系で開いてください）。下の［md をコピー］でノートに貼ってください'
    : '';
  $id('env-note').textContent = msg;
  $id('env-note').hidden = msg === '';
}

const errText = e => (e && e.message ? e.message : String(e));

async function ensureDir() {
  if (dirHandle) {
    if (await ToolFsa.ensurePermission(dirHandle)) return dirHandle;
    dirHandle = null;   // 拒否された（問い合わせの失敗も含む）: 選び直させる
  }
  dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  // ハンドルの保存は **best-effort**（できなくても毎回選べば動く — IS-Q7）
  try { await handles.set(IDB_KEY, dirHandle); } catch (_) { /* 構造化複製できない環境 */ }
  return dirHandle;
}

async function createNote(project) {
  if (typeof project !== 'string') project = '';   // 文字列以外（イベント等）は案件なし
  settle();                                   // デバウンス中の古い md を書かない
  const name = noteFileName($id('title').value, todayStr());
  let dir;
  try {
    dir = await ensureDir();
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // キャンセルは無言
    ToolUI.banner($id('banner'), 'error', 'フォルダを開けませんでした: ' + errText(e));
    return;
  }
  try {
    // **同名があれば上書きしない**（既存ノートは書き換えない — vault-rules の掟②）
    let exists = true;
    try {
      await dir.getFileHandle(name);
    } catch (e) {
      if (e && e.name === 'NotFoundError') exists = false;
      else throw e;
    }
    if (exists) {
      ToolUI.banner($id('banner'), 'warn',
        name + ' は既にあります — タイトルを変えてください（上書きはしません）');
      return;
    }
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(noteMd(project));
    await w.close();
    ToolUI.banner($id('banner'), 'success', name + ' を作成しました');
    await loadIssues(false);          // 作った直後に一覧へ出す
  } catch (e) {
    ToolUI.banner($id('banner'), 'error', '作成できませんでした: ' + errText(e));
  }
}
// 引数を渡さない（直接渡すとクリックイベントが project に入る — IS-U10b）
$id('create-btn').addEventListener('click', function () { createNote(); });

$id('sample-btn').addEventListener('click', () => {
  $id('input').value = SAMPLE;
  $id('title').value = '本番停止手順書';
  settle();
  updateSampleBtn();
  scheduleSave();
});



