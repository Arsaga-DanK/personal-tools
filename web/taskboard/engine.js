'use strict';
/* web/taskboard/engine.js — 純関数（依存関係・ステータス・編集 op・メモ・親子の付け替え・解析・依存グラフ・タイムラインのモデル）。DOM も I/O も触らない
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ========== エンジン（純粋・I/O なし） ==========
   方針: 行を原文文字列のまま保持し、編集はトークン単位の最小スプライス。
   編集していない行のバイトは一切変えない（ラウンドトリップのバイト保全）。 */

// 末尾の \r は許容してマッチ（CR 改行ファイルも表示はできる）。編集は taskAt の CR ガードで拒否。
// **括弧内は任意の1文字**を受ける（Phase T2）。Obsidian Tasks は未設定の文字を
// 「Unknown（型 TODO）」として扱うので、こちらも未知の文字をタスク行として認識し保全する
const TASK_RE = /^(\t*)- \[(.)\] (.*?)\r?$/;
const HEAD_RE = /^## (.*?)\r?$/;
// 絵文字は異体字セレクタ(U+FE0F)付きも許容してマッチし、置換時は $1 で原表記を保存する
const DONE_FIND = /✅\uFE0F? (\d{4}-\d{2}-\d{2})/;
const DONE_CUT  = / ?✅\uFE0F? \d{4}-\d{2}-\d{2}/;
const DUE_FIND  = /📅\uFE0F? (\d{4}-\d{2}-\d{2})/;
const DUE_CUT   = / ?📅\uFE0F? \d{4}-\d{2}-\d{2}/;
const PRI_RE    = /(?:🔺|⏫|🔼|🔽|⏬)\uFE0F?/;
const PRI_CUT   = / ?(?:🔺|⏫|🔼|🔽|⏬)\uFE0F?/;
const PRI_EMOJI = { highest: '🔺', high: '⏫', medium: '🔼', low: '🔽', lowest: '⏬' };
const EMOJI_PRI = { '🔺': 'highest', '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'lowest' };
const PRI_RANK  = { highest: 0, high: 0, medium: 1, low: 3, lowest: 3 }; // なし=2
// 開始日 🛫（Phase T）。既存の 📅 と同じ扱い（異体字セレクタ付きも許容）
const START_FIND = /🛫\uFE0F? (\d{4}-\d{2}-\d{2})/;
const START_CUT  = / ?🛫\uFE0F? \d{4}-\d{2}-\d{2}/;
const START_SET  = /(🛫\uFE0F? )\d{4}-\d{2}-\d{2}/;   // 日付部分のみ置換（位置不変）
// ⏳（scheduled）は解析・表示・編集の対象外。**トークン挿入位置の目印としてのみ**参照する
// （Obsidian 側で付いた ⏳ の前に 🛫 を入れないと Tasks 標準順が壊れる）
const SCHED_CUT  = / ?⏳\uFE0F? \d{4}-\d{2}-\d{2}/;

/* ---------- 依存関係（Phase T6・2026-08-12） ----------
   記法は Obsidian Tasks の標準（公式ドキュメントとプラグインのソースで確認）:
     🆔 <id>            … このタスクの id
     ⛔ <id>,<id>       … 依存する（先行する）タスクの id。**カンマ区切り・空白は任意で可**
   id の文字は [A-Za-z0-9_-]+。**vault 全体で一意が意図されるが Tasks は検査しない**
   （重複するとその id を持つ全タスクに依存する）。
   トークン順は `src/Layout/TaskLayoutOptions.ts` の TaskLayoutComponent enum で確認:
     Description → **Id → DependsOn** → Priority → 🔁 → 🏁 → ➕ → 🛫 → ⏳ → 📅 → ❌ → ✅
   （公式ドキュメントには id が「行末に置かれる」という記述もあるが、**行を書き出している
     ソースの enum を採用する** — enum のコメントが「書き出し順を決める」と明言している） */
const ID_FIND  = /🆔\uFE0F? ([A-Za-z0-9_-]+)/;
const ID_CUT   = / ?🆔\uFE0F? [A-Za-z0-9_-]+/;
const DEP_FIND = /⛔\uFE0F? ([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)/;
const DEP_CUT  = / ?⛔\uFE0F? [A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*/;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LEN = 6;          // 観測例（4ijuhy / dcf64c）に合わせる。公式は生成規則を明記していない
const ID_TRIES = 20;       // 衝突したら引き直す回数（実運用では1回目で決まる）

// `⛔ a, b` → ['a','b']（空白は任意なので落とす）
function parseDeps(text) {
  const m = DEP_FIND.exec(text);
  if (!m) return [];
  return m[1].split(',').map(x => x.trim()).filter(Boolean);
}

/* ---------- ステータス（Phase T2・2026-08-06 / Phase T3 で保留・中止を追加） ----------
   記法は Obsidian Tasks の Status Types（公式）に従う。独自記法は作らない:
     [ ]=TODO / [/]=IN_PROGRESS / [h]=ON_HOLD / [x]=DONE / [-]=CANCELLED / [~]=NON_TASK
   Tasks の判定は2軸あり、**混ぜると事故になる**:
     "not done" = TODO / IN_PROGRESS / ON_HOLD
     "done"     = DONE / CANCELLED / NON_TASK   ← **中止も「done」側**
   そこで本ツールも2つに分ける:
     done     = ✅ が付く完了だけ（チェックボックスの ON/OFF はこれ）
     finished = 終わっている（done か cancelled）。表示・件数・並び・アーカイブはこちらを見る
   **状態を増やすときは STATUS_CHAR / STATUS_LABEL / statusOf / ST_COLUMNS に1行ずつ**
   （NON_TASK `[~]` を足す場合は FINISHED にも1行）。 */
const ST_TODO = 'todo', ST_DOING = 'doing', ST_HOLD = 'hold';
const ST_DONE = 'done', ST_CANCELLED = 'cancelled', ST_OTHER = 'other';
const STATUS_CHAR = { todo: ' ', doing: '/', hold: 'h', done: 'x', cancelled: '-' };
const STATUS_LABEL = {
  todo: '未着手', doing: '着手中', hold: '保留', done: '完了', cancelled: '中止', other: '不明',
};
// 常時表示する印（未着手・完了はチェックボックスで分かるので印を持たない）
const STATUS_MARK = { doing: '▶', hold: '⏸', cancelled: '✕' };
// 「終わっている」状態。ここに足した状態はアーカイブ対象にもなる
const FINISHED = { done: true, cancelled: true };
// ステータスは**この関数1箇所**で決め、done / finished はそこから派生させる。
// done を独立に判定すると「スペース以外は全部完了」のような取り違えが混入する
function statusOf(ch) {
  if (ch === 'x' || ch === 'X') return ST_DONE;
  if (ch === '/') return ST_DOING;
  if (ch === 'h') return ST_HOLD;
  if (ch === '-') return ST_CANCELLED;
  if (ch === ' ') return ST_TODO;
  return ST_OTHER;   // 設定に無い文字 = Tasks の Unknown（型 TODO）。未完了として扱う
}
function isFinished(status) { return FINISHED[status] === true; }
const TASK_CH_RE = /^\t*- \[(.)\] /;
function statusOfLine(raw) {
  const m = TASK_CH_RE.exec(String(raw));
  return m ? statusOf(m[1]) : null;
}

function nfc(s) { return s.normalize('NFC'); }

// 行配列: {raw: 現在の文字列, orig: 読込時の文字列（追加行は null）}
function toLines(text) { return text.split('\n').map(r => ({ raw: r, orig: r })); }
function joinLines(lines) { return lines.map(l => l.raw).join('\n'); }

function taskAt(lines, lineNo) {
  const L = lines[lineNo - 1];
  const m = L && TASK_RE.exec(L.raw);
  if (!m) throw new Error(lineNo + '行目はタスク行ではありません');
  // setRest が \r を落として保存する事故を防ぐ（CR 行は表示のみ）
  if (L.raw.includes('\r')) throw new Error(lineNo + '行目は CR 改行のため編集できません');
  return { L, indent: m[1], ch: m[2], rest: m[3] };
}
function setRest(t, rest, ch) {
  t.L.raw = t.indent + '- [' + (ch !== undefined ? ch : t.ch) + '] ' + rest;
}

// ステータス変更（Phase T2）。括弧内の**1文字だけをインプレース置換**し他のバイトは動かさない。
// ✅ は「完了にしたときだけ付与・完了から離れるとき除去」。
// **中止（[-]）に ❌（キャンセル日）は付けない** — 本ツールは ❌ を解析しないので、
// 書けるが消せないトークンを作らない（Tasks 側の設定で付いた ❌ は本文として保全される）
function opSetStatus(lines, lineNo, status, today) {
  const t = taskAt(lines, lineNo);
  const cur = statusOf(t.ch);
  if (cur === status) return;          // 同じなら何もしない（[X] は [X] のまま保つ）
  const ch = STATUS_CHAR[status];
  if (!ch) throw new Error('不明なステータス: ' + status);
  let rest = t.rest;
  if (status === ST_DONE) {
    if (!DONE_FIND.test(rest)) rest += ' ✅ ' + today;   // Tasks と同じく行末に付与
  } else {
    rest = rest.replace(new RegExp(DONE_CUT.source, 'g'), '');
  }
  setRest(t, rest, ch);
}
// 既存の呼び出し・テストをそのまま動かすための別名。
// **着手中（[/]）からも完了にできる**ことが要件（以前は ch !== ' ' で早期 return していた）
function opComplete(lines, lineNo, today) { opSetStatus(lines, lineNo, ST_DONE, today); }
function opUncomplete(lines, lineNo) { opSetStatus(lines, lineNo, ST_TODO, null); }
function opSetDue(lines, lineNo, date) {
  const t = taskAt(lines, lineNo);
  let rest = t.rest;
  if (date === null) {
    rest = rest.replace(DUE_CUT, '');
  } else if (DUE_FIND.test(rest)) {
    rest = rest.replace(/(📅\uFE0F? )\d{4}-\d{2}-\d{2}/, '$1' + date); // インプレース置換
  } else {
    const anchor = DONE_CUT.exec(rest); // ✅ の手前、無ければ行末
    rest = anchor ? rest.slice(0, anchor.index) + ' 📅 ' + date + rest.slice(anchor.index)
                  : rest + ' 📅 ' + date;
  }
  setRest(t, rest);
}
// 開始日 🛫（Phase T）。既存の 📅 と同じインプレース方式で、他トークンの位置を動かさない
function opSetStart(lines, lineNo, date) {
  const t = taskAt(lines, lineNo);
  let rest = t.rest;
  if (date === null) {
    rest = rest.replace(START_CUT, '');
  } else if (START_FIND.test(rest)) {
    rest = rest.replace(START_SET, '$1' + date); // インプレース置換
  } else {
    // Tasks 標準順（… 優先度 → 🛫 → ⏳ → 📅 → ✅）で自分の位置に入れる。
    // 「最初に見つかったものの手前」なので、周囲が非標準順でも自分だけは正しい位置に入る
    const anchor = SCHED_CUT.exec(rest) || DUE_CUT.exec(rest) || DONE_CUT.exec(rest);
    rest = anchor ? rest.slice(0, anchor.index) + ' 🛫 ' + date + rest.slice(anchor.index)
                  : rest + ' 🛫 ' + date;
  }
  setRest(t, rest);
}
function opSetPriority(lines, lineNo, value) {
  const t = taskAt(lines, lineNo);
  let rest = t.rest;
  if (value === null) {
    rest = rest.replace(PRI_CUT, '');
  } else {
    const e = PRI_EMOJI[value];
    if (!e) throw new Error('不明な優先度: ' + value);
    if (PRI_RE.test(rest)) {
      rest = rest.replace(PRI_RE, e);
    } else {
      // 🛫 → ⏳ → 📅 → ✅ → 行末 の順で手前に（標準順では Priority が 🛫 より前）
      const anchor = START_CUT.exec(rest) || SCHED_CUT.exec(rest) ||
                     DUE_CUT.exec(rest) || DONE_CUT.exec(rest);
      rest = anchor ? rest.slice(0, anchor.index) + ' ' + e + rest.slice(anchor.index)
                    : rest + ' ' + e;
    }
  }
  setRest(t, rest);
}
// 本文編集のみ行を再構成（メタトークンは Tasks 標準の行末順: 優先度→🛫→📅→✅）。
// 🛫 を抽出しないと本文側に残り、再構成後に非標準順（本文 🛫 x ⏫ 📅 y）になる
function opEditContent(lines, lineNo, text) {
  const t = taskAt(lines, lineNo);
  const start = (START_FIND.exec(t.rest) || [])[1] || null;
  const due  = (DUE_FIND.exec(t.rest)  || [])[1] || null;
  const done = (DONE_FIND.exec(t.rest) || [])[1] || null;
  const pri  = (PRI_RE.exec(t.rest)    || [])[0] || null;
  const id   = (ID_FIND.exec(t.rest)   || [])[1] || null;
  const deps = parseDeps(t.rest);
  let rest = nfc(text).trim();
  // Tasks 標準順（ソースの enum）: 本文 → 🆔 → ⛔ → 優先度 → 🛫 → 📅 → ✅
  if (id)         rest += ' 🆔 ' + id;
  if (deps.length) rest += ' ⛔ ' + deps.join(',');
  if (pri)   rest += ' ' + pri;
  if (start) rest += ' 🛫 ' + start;
  if (due)   rest += ' 📅 ' + due;
  if (done)  rest += ' ✅ ' + done;
  setRest(t, rest);
}
/* 🆔 と ⛔ の設定（Phase T6）。挿入位置は**標準順の位置にある「最も前のメタトークン」の直前**。
   「最初にマッチした正規表現の前」で決めてはいけない（既存行のトークン順が非標準でも
   矯正しないのがこのツールの方針で、F1 の13行目のような `📅 … ⏫` で位置を誤る。
   タグ挿入（opSetTags）で同じ罠を踏んで直した実績があるので、同じ書き方に揃える）。
   既存があれば**その位置のまま値だけ差し替える**（バイト保全）。 */
function insertBefore(rest, token, cuts) {
  let at = rest.length;
  for (const re of cuts) {
    const m = re.exec(rest);
    if (m) at = Math.min(at, m.index);
  }
  return rest.slice(0, at) + ' ' + token + rest.slice(at);
}
function opSetId(lines, lineNo, id) {
  const t = taskAt(lines, lineNo);
  let rest = t.rest;
  if (id === null || id === '') {
    rest = rest.replace(ID_CUT, '');
  } else if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('id に使えない文字があります（英数字・_・- のみ）: ' + id);
  } else if (ID_FIND.test(rest)) {
    rest = rest.replace(/(🆔\uFE0F? )[A-Za-z0-9_-]+/, '$1' + id);   // 位置不変
  } else {
    rest = insertBefore(rest.trimEnd(), '🆔 ' + id,
      [DEP_CUT, PRI_CUT, START_CUT, SCHED_CUT, DUE_CUT, DONE_CUT]);
  }
  setRest(t, rest.trimEnd());
}
function opSetDependsOn(lines, lineNo, ids) {
  const t = taskAt(lines, lineNo);
  const want = (ids || []).map(x => String(x).trim()).filter(Boolean);
  for (const id of want) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('id に使えない文字があります: ' + id);
  }
  let rest = t.rest;
  if (want.length === 0) {
    rest = rest.replace(DEP_CUT, '');
  } else if (DEP_FIND.test(rest)) {
    rest = rest.replace(DEP_CUT, ' ⛔ ' + want.join(','));   // 位置不変（トークンごと差し替え）
  } else {
    rest = insertBefore(rest.trimEnd(), '⛔ ' + want.join(','),
      [PRI_CUT, START_CUT, SCHED_CUT, DUE_CUT, DONE_CUT]);
  }
  setRest(t, rest.trimEnd());
}

// ファイル内で衝突しない id を作る（vault 全体は見られないので**開いているファイル内**だけ）
function newId(lines) {
  const used = new Set();
  for (const l of lines) {
    const m = ID_FIND.exec(l.raw);
    if (m) used.add(m[1]);
  }
  for (let i = 0; i < ID_TRIES; i++) {
    let id = '';
    for (let k = 0; k < ID_LEN; k++) {
      id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
    if (!used.has(id)) return id;
  }
  throw new Error('id を発行できませんでした（衝突が続きました）');
}

// 指定セクションの末尾（最終タスク行の直後。子孫を含む）へ block を挿入する。
// タスクが無いセクションは見出しの直後に空行1つを挟む（既存の体裁に合わせる）。
// 新規追加（opAddTask）とセクション移動（opMoveSection）で**同じ規則**を使う
// タグの付与・削除（Phase N）。本文の末尾（最初のメタトークンの直前）に挿入し、
// 削除は該当トークンと直前の空白1個のみ除去する。#102 のような数字のみは触らない
function opSetTags(lines, op) {
  const t = taskAt(lines, op.line);
  const want = (op.tags || []).map(s => String(s).replace(/^#/, '').trim()).filter(Boolean);
  let rest = t.rest;
  const current = tagsOf(rest);
  for (const tag of current) {
    if (want.includes(tag)) continue;
    // 直前の空白1個ごと除去（同名の別トークンを壊さないよう境界を見る）
    const re = new RegExp(' ?#' + escapeRe(tag) + '(?![^\\s#,、。()（）\\[\\]:：;；!！?？"\'`])');
    rest = rest.replace(re, '');
  }
  const after = tagsOf(rest);
  const add = want.filter(tag => !after.includes(tag));
  if (add.length) {
    // 本文の末尾＝メタトークンのうち**最も前にあるもの**の直前。
    // 「最初にマッチした正規表現」で決めると、F1 の13行目（📅 … ⏫ の非標準順）で
    // ⏫ の直前＝📅 の後ろに入ってしまう
    let at = rest.length;
    for (const re of [PRI_CUT, START_CUT, SCHED_CUT, DUE_CUT, DONE_CUT]) {
      const m = re.exec(rest);
      if (m && m.index < at) at = m.index;
    }
    const ins = add.map(tag => ' #' + tag).join('');
    rest = rest.slice(0, at) + ins + rest.slice(at);
  }
  setRest(t, rest);
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ---------- メモ行と部分木の境界（Phase N・2026-08-06） ----------
   メモ = タスク行の直後に連続する「インデントした箇条書きで `- [` では始まらない行」。
   Obsidian Tasks は複数行タスクを扱わず、この行を**無視するがファイル上は変更しない**
   （公式ドキュメントで確認）。プレーンなインデント行はメモとして読まない
   （両形式を読むと編集時の再整形で触っていない行のバイトが変わる。TB-Q19）。
   空行・HTML コメント・見出しは `^\t+- ` に一致しないので構造的に巻き込まない。 */

const MEMO_PREFIX_RE = /^(\t+)- /;
function isMemoLine(raw, parentIndent) {
  const m = MEMO_PREFIX_RE.exec(raw);
  return !!m && !TASK_RE.test(raw) && m[1].length > parentIndent;
}
// タスク行 i の部分木の最終行インデックス（より深いタスク行とメモ行が続く限り）。
// **部分木の境界計算はこの1関数に集約する**（以前は5箇所に散っていて、
// メモ行に当たると打ち切られるためメモが移動・アーカイブから取り残された）
function subtreeEnd(lines, i) {
  const m = TASK_RE.exec(lines[i].raw);
  if (!m) return i;
  const d = m[1].length;
  let end = i;
  for (let k = i + 1; k < lines.length; k++) {
    const t = TASK_RE.exec(lines[k].raw);
    if (t) { if (t[1].length > d) { end = k; continue; } break; }
    if (isMemoLine(lines[k].raw, d)) { end = k; continue; }
    break;
  }
  return end;
}
// タスク行 i の直後に連続するメモ行の範囲と本文
function memoBlock(lines, i) {
  const m = TASK_RE.exec(lines[i].raw);
  if (!m) return { from: i + 1, to: i, texts: [] };
  const d = m[1].length;
  let to = i;
  const texts = [];
  for (let k = i + 1; k < lines.length; k++) {
    if (!isMemoLine(lines[k].raw, d)) break;
    texts.push(lines[k].raw.replace(MEMO_PREFIX_RE, ''));
    to = k;
  }
  return { from: i + 1, to, texts };
}

// メモの設定（text が空なら削除）。**位置ごとに比較して一致する行は据え置く**ので
// 変更していないメモ行のバイトと orig は変わらない
function opSetMemo(lines, op) {
  const i = op.line - 1;
  const L = lines[i];
  const m = L && TASK_RE.exec(L.raw);
  if (!m) throw new Error(op.line + '行目はタスク行ではありません');
  if (L.raw.includes('\r')) throw new Error(op.line + '行目は CR 改行のため編集できません');
  const indent = '\t'.repeat(m[1].length + 1);
  const texts = String(op.text === undefined || op.text === null ? '' : op.text)
    .split('\n').map(s => nfc(s).replace(/\s+$/, '')).filter(s => s !== '');
  for (const t of texts) {
    // メモ行がタスク行になってしまう本文は書かない（タスクを暗黙に作らない）
    if (TASK_RE.test(indent + '- ' + t)) {
      throw new Error('メモにチェックボックス（「- [ ] 」「- [/] 」など）で始まる行は書けません（タスク行になってしまいます）');
    }
  }
  const block = memoBlock(lines, i);
  const oldCount = block.to - block.from + 1;
  const n = Math.min(oldCount, texts.length);
  for (let k = 0; k < n; k++) {
    const raw = indent + '- ' + texts[k];
    if (lines[block.from + k].raw !== raw) lines[block.from + k].raw = raw; // orig は保つ
  }
  if (texts.length > oldCount) {
    const add = texts.slice(oldCount).map(t => ({ raw: indent + '- ' + t, orig: null }));
    lines.splice(block.from + oldCount, 0, ...add);
  } else if (texts.length < oldCount) {
    lines.splice(block.from + texts.length, oldCount - texts.length);
  }
}

// （同じ「セクションへ入れる」操作で挿入位置の規則を分けない）
function insertIntoSection(lines, section, block) {
  let hIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const hm = HEAD_RE.exec(lines[i].raw);
    if (hm && hm[1] === section) { hIdx = i; break; }
  }
  if (hIdx < 0) throw new Error('セクションが見つかりません: ' + section);
  let end = lines.length;
  for (let i = hIdx + 1; i < lines.length; i++) {
    if (HEAD_RE.test(lines[i].raw)) { end = i; break; }
  }
  let last = -1;
  for (let i = hIdx + 1; i < end; i++) if (TASK_RE.test(lines[i].raw)) last = i;
  // 最終タスクのメモ行より後に入れる（メモを挿入行で分断しない）
  if (last >= 0) lines.splice(subtreeEnd(lines, last) + 1, 0, ...block);
  else lines.splice(hIdx + 1, 0, { raw: '', orig: null }, ...block);
}

// 新規追加行は Tasks 標準順で書く（本文 → 優先度 → 🛫 → 📅）。
// メモも同時に受け取り1ブロックで挿入する（後から行番号を探さずに済む）
function opAddTask(lines, op) {
  let raw = '- [ ] ' + nfc(op.content).trim();
  if (op.priority) raw += ' ' + PRI_EMOJI[op.priority];
  if (op.start) raw += ' 🛫 ' + op.start;
  if (op.due) raw += ' 📅 ' + op.due;
  const block = [{ raw, orig: null }];
  const memos = String(op.memo || '').split('\n').map(s => nfc(s).replace(/\s+$/, '')).filter(Boolean);
  for (const m of memos) {
    if (TASK_RE.test('\t- ' + m)) {
      throw new Error('メモにチェックボックス（「- [ ] 」「- [/] 」など）で始まる行は書けません（タスク行になってしまいます）');
    }
    block.push({ raw: '\t- ' + m, orig: null });
  }
  insertIntoSection(lines, op.section, block);
}

// 行 i が属するセクション名（直上の ## 見出し）。見出しが無ければ null
function sectionOfLine(lines, i) {
  for (let k = i; k >= 0; k--) {
    const hm = HEAD_RE.exec(lines[k].raw);
    if (hm) return hm[1];
  }
  return null;
}

// 既存タスクを別セクションの末尾へ移す（子孫も一緒に、順序を保って移動）。
// **元の位置には戻らない**（順序は保存されない）。行オブジェクトはそのまま移すので
// 移動した行のバイトも、触っていない行のバイトも変わらない
function opMoveSection(lines, op) {
  const i = op.line - 1;
  const L = lines[i];
  const m = L && TASK_RE.exec(L.raw);
  if (!m) throw new Error(op.line + '行目はタスク行ではありません');
  if (L.raw.includes('\r')) throw new Error(op.line + '行目は CR 改行のため編集できません');
  if (m[1].length > 0) {
    throw new Error('子タスクのセクションは変更できません（親を移動すると一緒に移ります）');
  }
  if (sectionOfLine(lines, i) === op.section) return; // 同じセクションなら何もしない

  // 部分木（自分＋より深いタスク行＋メモ行）を切り出す
  const block = lines.splice(i, subtreeEnd(lines, i) - i + 1);
  insertIntoSection(lines, op.section, block);
}
/* ---------- 親子の付け替え（TB-K・TB-Q64）。書き換えるのは移る行の先頭のタブだけ ---------- */
// 部分木 [i..end] を動かしてよいか。CR 行と、直後に「タスクでもメモでもない字下げ行」が続く場合は断る
// （移すとその行が別のタスクの下に付いてしまう）
function assertMovable(lines, i, end) {
  for (let k = i; k <= end; k++) {
    if (lines[k].raw.includes('\r')) throw new Error((k + 1) + '行目は CR 改行のため編集できません');
  }
  const next = lines[end + 1];
  if (next && /^[ \t]+\S/.test(next.raw) && !TASK_RE.test(next.raw)) {
    throw new Error((end + 2) + '行目に字下げされた行（タスクでもメモでもない）が続くため動かせません。Obsidian で直してから');
  }
}
function reindent(block, delta) {
  if (delta === 0) return;
  for (const l of block) l.raw = l.raw.replace(/^\t*/, t => '\t'.repeat(t.length + delta));
}
// 直近の浅いタスク行（＝今の親）。見出しをまたがない。無ければ -1
function parentIndexOf(lines, i, d) {
  for (let k = i - 1; k >= 0; k--) {
    if (HEAD_RE.test(lines[k].raw)) return -1;
    const t = TASK_RE.exec(lines[k].raw);
    if (t && t[1].length < d) return k;
  }
  return -1;
}
// 部分木ごと別の親の下へ（parent: 行番号）／最上位へ（parent: null）。セクションは移った先に従う
function opSetParent(lines, op) {
  const i = op.line - 1;
  const m = lines[i] && TASK_RE.exec(lines[i].raw);
  if (!m) throw new Error(op.line + '行目はタスク行ではありません');
  const d = m[1].length;
  const end = subtreeEnd(lines, i);
  assertMovable(lines, i, end);
  if (op.parent === null) {
    if (d === 0) return;                               // 既に最上位
    let root = -1;                                     // 元の最上位の祖先（その部分木の直後に置く）
    for (let k = i - 1; k >= 0; k--) {
      if (HEAD_RE.test(lines[k].raw)) break;
      const t = TASK_RE.exec(lines[k].raw);
      if (t && t[1].length === 0) { root = k; break; }
    }
    const block = lines.splice(i, end - i + 1);
    reindent(block, -d);
    const at = root >= 0 ? subtreeEnd(lines, root) + 1 : i;
    lines.splice(at, 0, ...block);
    return;
  }
  const p = op.parent - 1;
  if (p >= i && p <= end) throw new Error('自分や自分の子は親にできません');
  const pm = lines[p] && TASK_RE.exec(lines[p].raw);
  if (!pm) throw new Error(op.parent + '行目はタスク行ではありません');
  if (lines[p].raw.includes('\r')) throw new Error(op.parent + '行目は CR 改行のため編集できません');
  if (parentIndexOf(lines, i, d) === p) return;       // 既にその親の子
  // 入れる先（親の部分木の末尾）の直後に字下げ行が続くなら、そこへは入れない
  const qOrig = subtreeEnd(lines, p);
  const after = lines[qOrig + 1];
  if (after && after !== lines[i] && /^[ \t]+\S/.test(after.raw) && !TASK_RE.test(after.raw)) {
    throw new Error((qOrig + 2) + '行目に字下げされた行（タスクでもメモでもない）があるため、その親の下へは入れられません');
  }
  const block = lines.splice(i, end - i + 1);
  const p2 = p > end ? p - block.length : p;
  reindent(block, pm[1].length + 1 - d);
  lines.splice(subtreeEnd(lines, p2) + 1, 0, ...block);
}
// この位置に同じ深さの親を作り、自分の部分木を1段下げてその下に入れる
function opWrapParent(lines, op) {
  const i = op.line - 1;
  const m = lines[i] && TASK_RE.exec(lines[i].raw);
  if (!m) throw new Error(op.line + '行目はタスク行ではありません');
  const content = nfc(String(op.content || '')).trim();
  if (content === '') throw new Error('新しい親の名前が空です');
  const end = subtreeEnd(lines, i);
  assertMovable(lines, i, end);
  reindent(lines.slice(i, end + 1), 1);
  lines.splice(i, 0, { raw: m[1] + '- [ ] ' + content, orig: null });
}

function opAddChild(lines, op) {
  const p = op.parentLine - 1;
  const pm = lines[p] && TASK_RE.exec(lines[p].raw);
  if (!pm) throw new Error(op.parentLine + '行目はタスク行ではありません');
  if (lines[p].raw.includes('\r')) throw new Error(op.parentLine + '行目は CR 改行のため編集できません');
  const d = pm[1].length;
  const q = subtreeEnd(lines, p); // 親の最終子孫（メモ行も含む）
  lines.splice(q + 1, 0, { raw: '\t'.repeat(d + 1) + '- [ ] ' + nfc(op.content).trim(), orig: null });
}

// 未保存の追加行の取り消し（Phase I）。既存タスク行の削除ではないので orig === null に限る。
// opAddTask はタスクの無いセクションに追加するとき空行も一緒に挿入するため、
// 「直前が orig===null の空行で、その前が ## 見出し」ならその空行も一緒に取り下げる
// （この規則は取り消しの順序に依存せず元のバイト列に収束する。spec の図と TB-U3 参照）。
function opUndoAdd(lines, op) {
  const i = op.line - 1;
  const L = lines[i];
  if (!L) throw new Error(op.line + '行目は存在しません');
  if (L.orig !== null) throw new Error(op.line + '行目は既存の行のため取り消せません（削除は Obsidian 側で行います）');
  if (!TASK_RE.test(L.raw)) throw new Error(op.line + '行目はタスク行ではありません');
  if (hasAddedDescendant(lines, i)) throw new Error(op.line + '行目には子タスクがあるため取り消せません');

  // このセッションで追加されたメモ行は一緒に取り下げる（孤児メモを残さない）
  const block = memoBlock(lines, i);
  let memoCount = 0;
  for (let k = block.from; k <= block.to; k++) {
    if (lines[k].orig !== null) break;
    memoCount++;
  }
  if (memoCount) lines.splice(block.from, memoCount);

  const prev = lines[i - 1];
  const beforePrev = lines[i - 2];
  const withBlank = prev && prev.orig === null && prev.raw === ''
    && beforePrev && HEAD_RE.test(beforePrev.raw);
  lines.splice(withBlank ? i - 1 : i, withBlank ? 2 : 1);
}

// 取り消し対象に、より深いタスク行（子孫）が続いているか。
// メモ行は子孫ではないので飛ばして見る（メモは一緒に取り消される）
function hasAddedDescendant(lines, i) {
  const m = TASK_RE.exec(lines[i].raw);
  const d = m[1].length;
  for (let k = i + 1; k < lines.length; k++) {
    const t = TASK_RE.exec(lines[k].raw);
    if (t) return t[1].length > d;
    if (!isMemoLine(lines[k].raw, d)) return false;
  }
  return false;
}

function runOp(lines, op, today) {
  switch (op.type) {
    case 'complete':    opComplete(lines, op.line, today); break;
    case 'uncomplete':  opUncomplete(lines, op.line); break;
    case 'setStatus':   opSetStatus(lines, op.line, op.status, today); break;
    case 'setDue':      opSetDue(lines, op.line, op.date === undefined ? null : op.date); break;
    case 'setStart':    opSetStart(lines, op.line, op.date === undefined ? null : op.date); break;
    case 'setId':       opSetId(lines, op.line, op.id === undefined ? null : op.id); break;
    case 'setDependsOn': opSetDependsOn(lines, op.line, op.ids); break;
    case 'setPriority': opSetPriority(lines, op.line, op.value === undefined ? null : op.value); break;
    case 'editContent': opEditContent(lines, op.line, op.text); break;
    case 'addTask':     opAddTask(lines, op); break;
    case 'addChild':    opAddChild(lines, op); break;
    case 'undoAdd':     opUndoAdd(lines, op); break;
    case 'moveSection': opMoveSection(lines, op); break;
    case 'setParent':   opSetParent(lines, op); break;
    case 'wrapParent':  opWrapParent(lines, op); break;
    case 'setMemo':     opSetMemo(lines, op); break;
    case 'setTags':     opSetTags(lines, op); break;
    default: throw new Error('不明な操作: ' + op.type);
  }
}

// テスト照合用の純関数: text に ops を逐次適用した「保存されるテキスト」を返す
function applyOpsPure(text, ops, today) {
  const lines = toLines(text);
  for (const op of ops) runOp(lines, op, today);
  return joinLines(lines);
}

function diffCounts(lines) {
  let changed = 0, added = 0;
  for (const l of lines) {
    if (l.orig === null) added++;
    else if (l.raw !== l.orig) changed++;
  }
  return { changed, added };
}

/* ---------- 解析（表示用） ---------- */

// タグ: 行頭/空白/括弧の直後の # に続く文字列。数字のみは Obsidian 同様タグ扱いしない。
// parseDoc（表示）と opSetTags（編集）で同じ実装を使う（判定を2箇所に持たない）
const TAG_RE = /(^|[\s(（])#([^\s#,、。()（）[\]:：;；!！?？"'`]+)/g;
function tagsOf(text) {
  const tags = [];
  const re = new RegExp(TAG_RE.source, 'g');
  let m;
  while ((m = re.exec(String(text)))) {
    if (!/^\d+$/.test(m[2]) && !tags.includes(m[2])) tags.push(m[2]);
  }
  return tags;
}

function parseDoc(lines) {
  const tasks = [], sections = [];
  let section = null;
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].raw;
    const hm = HEAD_RE.exec(raw);
    if (hm) { section = hm[1]; sections.push(section); stack.length = 0; continue; }
    const m = TASK_RE.exec(raw);
    if (!m) continue; // タスク以外はパススルー行（解釈も破壊もしない）
    const indent = m[1].length, rest = m[3];
    const priEmoji = (PRI_RE.exec(rest) || [])[0] || null;
    // 本文からメタトークンを落とす。**🆔 と ⛔ も生の絵文字を画面に出さない**（Phase T6）
    let body = rest
      .replace(new RegExp(DONE_CUT.source, 'g'), '')
      .replace(new RegExp(DUE_CUT.source, 'g'), '')
      .replace(new RegExp(START_CUT.source, 'g'), '')
      .replace(new RegExp(PRI_CUT.source, 'g'), '')
      .replace(new RegExp(DEP_CUT.source, 'g'), '')
      .replace(new RegExp(ID_CUT.source, 'g'), '')
      .trim();
    const tags = tagsOf(body);
    const links = [];
    const lre = /\[\[([^\]]+)\]\]/g;
    let lm;
    while ((lm = lre.exec(rest))) links.push(lm[1]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : null;
    const t = {
      idx: i, line: i + 1, indent,
      statusChar: m[2],
      status: statusOf(m[2]),
      // **どちらも status から派生させる**（独立に判定しない）。
      // done = ✅ が付く完了だけ / finished = 終わっている（完了・中止）
      done: statusOf(m[2]) === ST_DONE,
      finished: isFinished(statusOf(m[2])),
      body,
      displayBody: body.replace(/ ?\[\[[^\]]+\]\]/g, '').replace(/\s+/g, ' ').trim(),
      id: (ID_FIND.exec(rest) || [])[1] || null,
      dependsOn: parseDeps(rest),
      start: (START_FIND.exec(rest) || [])[1] || null,
      due: (DUE_FIND.exec(rest) || [])[1] || null,
      doneDate: (DONE_FIND.exec(rest) || [])[1] || null,
      priority: priEmoji ? EMOJI_PRI[priEmoji.replace(/\uFE0F/g, '')] : null,
      priEmoji, tags, links,
      parentLine: parent ? parent.line : null,
      section, children: [],
      hasCR: raw.includes('\r'),
      memo: memoBlock(lines, i).texts,   // 直後に連続するメモ行（配列。空ならメモなし）
    };
    if (parent) parent.children.push(t);
    tasks.push(t);
    stack.push(t);
  }
  return { tasks, sections };
}

/* ---------- 依存グラフ: 純関数（Phase T6・DOM も I/O も触らない） ----------
   Tasks の意味（公式で確認）:
     blocked  = 自分が TODO/IN_PROGRESS/ON_HOLD かつ、依存先のいずれかも同じ
     blocking = 自分が TODO/IN_PROGRESS/ON_HOLD かつ、自分に依存するタスクのいずれかも同じ
     「リンクのどちらかの端が DONE / CANCELLED / NON_TASK なら blocking は起きない」
   **これは本ツールの finished（done か cancelled）とちょうど一致する**ので、
   Phase T3 の派生フラグをそのまま使う（新しい判定を足さない）。 */
const MAX_TL_ARROWS = 60;   // 矢印の本数の上限（超過時は矢印だけ描かない）

function depGraph(rows) {
  const byId = new Map();          // id → タスク（重複は配列で持つ）
  for (const t of rows) {
    if (!t.id) continue;
    if (!byId.has(t.id)) byId.set(t.id, []);
    byId.get(t.id).push(t);
  }
  const duplicateIds = [];
  for (const [id, list] of byId) if (list.length > 1) duplicateIds.push(id);

  // 辺（先行 → 後続）。**依存先が見つからないものは unresolved に回す**
  const edges = [];
  let unresolved = 0;
  for (const t of rows) {
    for (const id of t.dependsOn) {
      const from = byId.get(id);
      if (!from || from.length !== 1) { unresolved++; continue; }
      edges.push({ from: from[0], to: t, id: id });
    }
  }

  // 循環検出（white/gray/black の DFS）。**再帰ではなく明示スタック**で深さを気にしない。
  // 自己参照（⛔ に自分の id）もここで循環として拾える
  const state = new Map();         // line → 0:white 1:gray 2:black
  const next = new Map();          // line → 後続タスクの配列
  for (const e of edges) {
    if (!next.has(e.from.line)) next.set(e.from.line, []);
    next.get(e.from.line).push(e.to);
  }
  let cycle = null;
  for (const t of rows) {
    if (state.get(t.line) === 2 || cycle) continue;
    const stack = [{ t: t, i: 0, path: [t] }];
    state.set(t.line, 1);
    while (stack.length && !cycle) {
      const top = stack[stack.length - 1];
      const kids = next.get(top.t.line) || [];
      if (top.i >= kids.length) {
        state.set(top.t.line, 2);
        stack.pop();
        continue;
      }
      const k = kids[top.i++];
      const st = state.get(k.line) || 0;
      if (st === 1) {                                   // gray に戻った = 循環
        const at = top.path.findIndex(x => x.line === k.line);
        const loop = (at >= 0 ? top.path.slice(at) : [k]).concat([k]);
        cycle = loop.map(x => x.displayBody || x.body || ('行' + x.line));
        break;
      }
      if (st === 0) {
        state.set(k.line, 1);
        stack.push({ t: k, i: 0, path: top.path.concat([k]) });
      }
    }
  }

  // 表示する辺は「効いている関係」だけ（どちらかが finished なら Tasks でも blocking しない）
  const live = edges.filter(e => !e.from.finished && !e.to.finished);
  // blocked = 自分が未終了で、未終了の先行を持つ
  const blocked = new Set(live.map(e => e.to.line));
  return {
    edges, live, blocked, duplicateIds, unresolved, cycle,
    guard: live.length > MAX_TL_ARROWS
      ? { reason: 'arrows', count: live.length, limit: MAX_TL_ARROWS } : null,
  };
}

/* ---------- 計画ビュー（タイムライン）のモデル: 純関数 ---------- */

const MAX_TIMELINE_ROWS = 200;   // 対象タスク数の上限（超過時は描画しない）
// 上限は**描画するピクセル幅**で判定する（Phase T4・TB-Q50）。
// 日数で判定すると、週/月ズームでは 400日でも 1,600px / 640px しかないのに拒否してしまう。
// 日ズームの 400日 = 6,400px は従来どおり通る（上限に達するのは約1,250日）
const MAX_TIMELINE_PX = 20000;
const DAY_PX = 16;               // 1日あたりの幅（日ズーム。1ヶ月≒480px）
const TL_TODAY_NEAR = 31;        // today をこの日数以内なら表示範囲に含める
const TL_PAD_DAYS = 3;           // 表示範囲の余白
const TL_LABEL_W = 260;          // 行ラベル列の幅（sticky で固定する）
const TL_ROW_H = 24;             // 1行の高さ（CSS と一致させる。矢印の Y を累算で出すため）

/* ズーム（Phase T4・TB-Q49）。**スナップ単位をズームに合わせる** —
   月ズームは 1日 = 1.6px なので1日スナップでは掴めない（日単位の微調整は
   バークリック → 計画ポップオーバーで行う）。
   tick: 目盛りの刻み方。every は**最小の候補**で、ラベルが収まらなければ
   tlTicks が 14日・28日へ広げる（週ズームは1桁月なら7日刻みで収まり、
   2桁月を含む範囲では14日刻みになる。Phase T5b で範囲ごとに切り替えるようにした） */
const TL_ZOOMS = {
  day:   { px: DAY_PX, snap: 1, every: 7,  tick: 'date',  label: '日' },
  week:  { px: 4,      snap: 1, every: 7,  tick: 'date',  label: '週' },
  month: { px: 1.6,    snap: 7, every: 1,  tick: 'month', label: '月' },
};
const TL_ZOOM_KEYS = ['day', 'week', 'month'];
function tlZoom() { return TL_ZOOMS[state.ui.tlZoom] || TL_ZOOMS.day; }

/* 粗いズームを選べる条件（Phase T5・2026-08-07）:
   **図の幅がラベル列（260px）以上になること**。これより狭いと図が自分のラベル列より
   細くなり、バーも目盛りも読めない（38日を月ズームで見ると 61px になるのが発端の指摘）。
   実測（2026-08-07・スクリーンショットで確認）:
     月ズーム 163日=277px は月目盛りが6つ並んで読める / 100日=176px は苦しい / 38日=61px は判読不能
   この条件を満たすのは **月=163日以上・週=65日以上**。
   **日ズームは常に選べる**（既定・最も精密で、範囲が短いほど読みやすい）。
   なお範囲（from〜to）はズームに依存しないので、どのズームでも同じ日数で判定できる。 */
const TL_MIN_FIGURE_PX = TL_LABEL_W;
function zoomUsable(key, days) {
  return key === 'day' || days * TL_ZOOMS[key].px >= TL_MIN_FIGURE_PX;
}

// 日数の差は UTC 通日で取る。ローカル Date の減算は DST 境界で1日狂うため
// （JST に DST は無いが回避コストがゼロなので固定する）。
// 日付をずらす addDays はローカルのままで正しい（カレンダー演算は Date が処理する）
function dayNum(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
}
function diffDays(a, b) { return dayNum(b) - dayNum(a); }

/* 子タスクの完了率（Phase T4）。**分子は done だけ**（着手中を 0.5 と数えない＝推測を混ぜない）。
   **中止（[-]）はその部分木ごと分母から外す**（やらないと決めた作業を未達に数えない）。
   子を持たないタスクは null（推測値を書かない）。
   rows がテストの射影（children を持たない）でも落ちないよう `|| []` で守る */
function progressOf(t) {
  let done = 0, total = 0;
  const walk = (x) => {
    for (const c of (x.children || [])) {
      if (c.status === ST_CANCELLED) continue;   // 中止は子孫ごと数えない
      total++;
      if (c.done) done++;
      walk(c);
    }
  };
  walk(t);
  if (total === 0) return null;
  return { done, total, pct: Math.round((done / total) * 100) };
}

// rows（表示対象・絞り込みとソート反映後）から図の材料を作る。DOM も I/O も触らない。
// dayPx はガードの判定に使う（描画幅で判定するため。既定は日ズーム）
function timelineModel(rows, today, dayPx) {
  const px = dayPx || DAY_PX;
  const items = [];
  let invalidCount = 0;
  for (const t of rows) {
    if (!t.start) continue;                        // 🛫 を持つ行だけが対象
    const inverted = !!(t.due && t.due < t.start); // 逆転は無言で丸めず件数を出す
    if (inverted) invalidCount++;
    const hasDue = !!t.due && !inverted;
    const end = hasDue ? t.due : t.start;          // 📅 なし・逆転は1日分のバー
    let kind;
    // 中止は「終わっているが完了ではない」ので専用の状態にする（完了と同じ灰色に見せない）
    if (t.status === ST_CANCELLED) kind = 'cancelled';
    else if (t.done) kind = 'done';
    else if (t.due && t.due < today) kind = 'late';
    else if (t.start <= today && today <= end) kind = 'active';
    else kind = 'planned';
    items.push({
      line: t.line, indent: t.indent, body: t.displayBody || t.body || '(内容なし)',
      done: t.done, finished: t.finished, status: t.status,
      id: t.id, dependsOn: t.dependsOn,          // 依存の矢印が使う（Phase T6）
      section: t.section || '', start: t.start, due: t.due,
      end, hasDue, inverted, state: kind, hasCR: !!t.hasCR,   // CR 行はドラッグさせない
      days: hasDue ? diffDays(t.start, t.due) + 1 : null, // 両端含む。📅 なしは null
      progress: progressOf(t),                            // 子なしは null
    });
  }
  if (!items.length) {
    return { items, from: null, to: null, days: 0, todayIn: false, invalidCount, guard: null };
  }
  let minStart = items[0].start, maxEnd = items[0].end;
  for (const it of items) {
    if (it.start < minStart) minStart = it.start;
    if (it.end > maxEnd) maxEnd = it.end;
  }
  let from = addDays(minStart, -TL_PAD_DAYS);
  let to = addDays(maxEnd, TL_PAD_DAYS);
  // today が近ければ縦線を引けるよう範囲に含める。遠いときは含めない
  // （古い日付のタスクだけが残っているとき図が無意味に横へ広がる。TB-Q12）
  if (diffDays(minStart, today) >= -TL_TODAY_NEAR && diffDays(maxEnd, today) <= TL_TODAY_NEAR) {
    if (today < from) from = addDays(today, -TL_PAD_DAYS);
    if (today > to) to = addDays(today, TL_PAD_DAYS);
  }
  const days = diffDays(from, to) + 1;
  let guard = null;
  if (items.length > MAX_TIMELINE_ROWS) {
    guard = { reason: 'rows', count: items.length, limit: MAX_TIMELINE_ROWS };
  } else if (days * px > MAX_TIMELINE_PX) {
    // 日数ではなく**描画幅**で判定する（ズームで縮めれば表示できるため）
    guard = { reason: 'px', count: days, px: Math.round(days * px), limit: MAX_TIMELINE_PX };
  }
  return { items, from, to, days, dayPx: px,
    todayIn: today >= from && today <= to, invalidCount, guard };
}

