'use strict';
/* web/issue/engine.js — 純関数（判定・見出し認識・toNote / toTasks）・一覧のための解析・既存ノートへの書き込み・論点の行。DOM も I/O も触らない
   入口: web/issue.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ========== 純関数（フックと UI が同一コードパス） ========== */

/* 5ステップの見出し。表記の揺れを許容する（docs/specs/issue.md「5ステップの見出し認識」）:
   "## 1. ゴール" / "## ゴール" / "**2. 論点**" / "3. 不明点：" / "#### リスク" */
const HEAD_RE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:[1-9][.．、)]?\s*)?(ゴール|論点|イシュー|最終形|絵コンテ|サブイシュー|不明点|リスク|次の一手|分かったこと|結論|掘ったログ)\s*(?:\*\*)?\s*[:：]?\s*$/;
const KEY_OF = {
  'ゴール': 'goal', '論点': 'issue', 'イシュー': 'issue',
  // 2026-09-25 に「絵コンテ」→「最終形」へ改名（IS-Q17）。旧名も同じ枠（既存ノートを壊さない）
  '最終形': 'picture', '絵コンテ': 'picture',
  // 旧「不明点」は同じ枠へ（既存ノートを壊さない）
  'サブイシュー': 'subs', '不明点': 'subs',
  'リスク': 'risks',              // 旧枠。新規では作らないが内容は保持する
  '次の一手': 'next',
  '分かったこと': 'found', '結論': 'conclusion',
  '掘ったログ': 'rest',
};

function nfc(s) { return String(s == null ? '' : s).normalize('NFC'); }

// YAML の値として安全に書く。記号を含むなら "…"（Plan Tasks の yamlScalar と同じ規則）
function yamlScalar(v) {
  const t = nfc(v).trim();
  return /[:#\[\]{},&*!|>'"%@`]|^-/.test(t) ? JSON.stringify(t) : t;
}

// 掘るの止め時（本: 10分考えて埒が明かなければ止める）。テンプレ・Plan Tasks の骨格と同じ1行（IS-Q19）
const DIG_HINT = '> 10分で論点の行が書けなければ「悩んでいる」— 型（A/B）を確かめる／人に聞く／一次情報を見る';

// 行頭の箇条書き記号を落とす。**タスク記法（- [ ]）はそのまま残す**（次の一手で使うため）
function stripBullet(raw) {
  const s = nfc(raw).replace(/\s+$/, '');
  if (/^\s*[-*+]\s+\[[^\]]\]\s/.test(s)) return s.trim();
  return s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
}

function parseSections(text) {
  const out = { title: '', goal: [], issue: [], picture: [], subs: [], risks: [],
                next: [], found: [], conclusion: [], rest: [] };
  const lines = nfc(text).replace(/\r\n?/g, '\n').split('\n');
  let cur = null;                       // null = rest（どの見出しにも属さない部分）
  for (const raw of lines) {
    const m = raw.match(HEAD_RE);
    if (m) { cur = KEY_OF[m[1]]; continue; }
    // 未知の見出し行はセクションを閉じる（次の行から rest へ戻す）。
    // 最初の1本だけは title として拾う（ノートの H1 になる）
    const h = raw.match(/^\s*#{1,6}\s+(.+?)\s*$/);
    if (h) {
      if (out.title === '') out.title = h[1].trim();
      cur = null;
      continue;
    }
    const body = stripBullet(raw);
    if (body === '') continue;
    out[cur === null ? 'rest' : cur].push(body);
  }
  return out;
}

/* 判定（IS-Q5: 警告であって拒否ではない）。見るのは**論点の1行目**と締切・不明点の有無。
   掘削ログの「なぜ？」は対象外 — WHY を避けるのはイシュー文の書き方だけ（IssueDriven.md） */
function judge(line, opts) {
  const o = opts || {};
  const arr = Array.isArray(line) ? line : (line == null ? [] : [line]);
  // 「> 答えが出たら」「（見送った候補）」などの注記行は論点として数えない
  const lines = arr.map(x => nfc(x).trim())
    .filter(x => x !== '' && !/^[>（(]/.test(x));
  const first = lines[0] || '';
  const out = [];
  const add = (id, level, msg, fix) => out.push({ id: id, level: level, msg: msg, fix: fix });

  if (first === '') {
    add('empty', 'warn', '論点が書かれていない',
      'ゴールから「で、答えを出すべき問いは何か」を一行で書く');
  } else {
    if (/(について|の件|まとめ|整理)\s*[。．.]?$/.test(first))
      add('about', 'warn', '「〜について」で止まっている',
        '動詞を足してスタンスを取る（本: 「〜について」で止めない）');
    if (/(整理|確認|検討|調査|把握|対応|共有)(する|します|を行う|を実施|をする)/.test(first))
      add('worktheme', 'warn', '作業テーマであって論点ではない',
        '「整理する・確認する」は犬の道の症状。答えが出たら何が変わるかを問いにする');
    // 体言止めの作業（IS-26・2026-09-30）。実例「…洗い出しと現場確認」が ✓ になっていた
    else if (/(確認|検討|調査|把握|対応|共有|洗い出し|作成|準備|調整|整備)$/.test(first.replace(/[。．.！!\s]+$/, '')))
      add('worktheme', 'warn', '作業テーマであって論点ではない',
        '「〜確認」「〜洗い出し」で止まるのは作業。答えが出たら何が変わるかを問いにする');
    if (/^(なぜ|何故|どうして|why)/i.test(first))
      add('why', 'warn', 'WHY で始まっている',
        '「どこを / 何を / どう」に置き換える（本: WHY ではなく WHERE・WHAT・HOW）');
    /* はい/いいえの問いと依頼（IS-Q22）。🎯 のノートで論点欄が確認事項のチェックリストになり、
       全部 ✓ と出ていた（2026-09-25 の実測4行）。線引きはスタンス（ではないか）と疑問詞の有無 —
       疑問詞つきの問いは本の WHERE/WHAT/HOW そのものなので出さない */
    const tail = first.replace(/[。．.！!？?\s]+$/, '');
    const PLACE = '確認すること・やることは「## 掘る」に「- [ ]」で（論点の一覧に出ない）。';
    if (/(もらいたい|もらう|ください|下さい|欲しい|ほしい|いただきたい|頂きたい|お願いしたい|お願いする|お願いします|依頼する|依頼したい)$/.test(tail))
      add('request', 'warn', '依頼・やることになっている',
        PLACE + '論点は「それが分かると何が決まるか」を答えを先に置いて一行で');
    else if (/(か|だろうか|でしょうか)$/.test(tail) && !/(ではない|じゃない)(か|だろうか|でしょうか)$/.test(tail)
             && !/(何|なに|なん|どこ|どう|どれ|どの|どちら|どっち|いつ|誰|だれ|いくら|いくつ|なぜ|何故)/.test(first))
      add('closed', 'warn', 'はい／いいえで答える確認事項になっている',
        PLACE + '論点にするなら答えを先に置く:「〜は A ではなく B ではないか」');
    if (!/[はが]/.test(first))
      add('subject', 'info', '主語が見えない', '「◯◯は〜」の形にする（言語化のコツ①）');
    if (!/(ではなく|じゃなく|ではなくて|より|それとも|vs)/i.test(first))
      add('compare', 'info', '比較の形になっていない',
        '「〜ではなく〜」でスタンスを取ると仮説になる（言語化のコツ③）');
    if (lines.length > 1)
      add('multiline', 'info', '論点が複数行ある', '一行に絞る。残りはサブイシューへ');
  }
  if (!o.deadline)
    add('deadline', 'warn', 'いつ白黒がつくかが決まっていない',
      '締切を入れる（よいイシューの条件③ 答えを出せる）');
  if (o.stage !== 'line' && !(o.unknowns && o.unknowns.length))
    add('evidence', 'warn', '何を見れば白黒つくかが無い',
      'サブイシューを1つ以上書き、聞く / 調べる / 試す を振る');
  /* 行（候補）の段階では絵コンテ・サブイシューをまだ問わない。
     書き殴りから切り出したばかりの1行に「絵コンテが無い」と毎回出すのは雑音で、
     **切り出して5段を立てる段階**で初めて意味を持つ（IS-Q12） */
  // 候補の数は段階に関係なく見る（Step 2 の選別で使う）
  if (Array.isArray(o.candidates)
      && o.candidates.filter(function (c) { return nfc(c).trim() !== ''; }).length < 2)
    add('alternatives', 'info', '論点の候補が1つだけ',
      '解ける問題の中から選ぶ。もう1つ立てて並べてみる（イシュー度）');
  if (o.stage === 'line') return out;
  // 本で最も強い検算: 欲しい絵が描けないなら、まだイシューが定まっていない（第3章）
  if (nfc(o.picture || '').trim() === '')
    add('picture', 'warn', '答えが出たとき最後に何を言う・出すか（最終形）が決まっていない',
      '最終形を描く — 描けないなら、まだイシューが定まっていない');
  return out;
}

// 不明点の本文から解消手段を検出して表の2列目に入れる
function wayOf(s) {
  const t = nfc(s);
  if (/聞く|訊く|確認を取る|依頼/.test(t)) return '聞く';
  if (/調べ|洗い出|一覧|確認する/.test(t)) return '調べる';
  if (/試す|検証|流して|再現/.test(t)) return '試す';
  return '';
}

/* ---------- 一覧のための解析（04_Issues のノートを読む） ---------- */

/* frontmatter は「先頭の --- で挟まれた単純な key: value」だけを読む。
   Obsidian の配列記法（tags:\n  - issue）は値が空になるが、一覧で使うのは
   deadline / status / verdict のスカラーだけなので足りる */
function parseFrontmatter(text) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
  const data = {};
  if (!m) return { data: data, body: t, has: false };
  const ls = m[1].split('\n');
  for (let i = 0; i < ls.length; i++) {
    const kv = ls[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data: data, body: t.slice(m[0].length), has: true };
}

/* frontmatter のキーだけを差し替える（無ければ frontmatter の末尾に足す）。
   **本文は1文字も変えない。** frontmatter が無いノートには先頭に作る（IS-Q20） */
function setFrontmatter(text, patch) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
  // frontmatter が無ければ先頭に作る（IS-Q20: 閉じられないノートを残さない）
  if (!m) {
    const ks = Object.keys(patch || {});
    return '---\n' + ks.map(function (k) { return k + ': ' + patch[k]; }).join('\n') + '\n---\n' + t;
  }
  let ls = m[1].split('\n');
  const keys = Object.keys(patch || {});
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const re = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':');
    let found = false;
    ls = ls.map(function (l) {
      if (!re.test(l)) return l;
      found = true;
      return key + ': ' + patch[key];
    });
    if (!found) ls.push(key + ': ' + patch[key]);
  }
  return '---\n' + ls.join('\n') + '\n---\n' + t.slice(m[0].length);
}

// 指定の見出しの節の末尾に1行足す。節が無ければノートの末尾に作る
function appendToSection(text, heading, line) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const ls = t.split('\n');
  let idx = -1;
  for (let i = 0; i < ls.length; i++) { if (ls[i].trim() === heading) { idx = i; break; } }
  if (idx === -1) return t.replace(/\s*$/, '') + '\n\n' + heading + '\n\n' + line + '\n';
  let end = idx + 1;
  while (end < ls.length && !/^#{1,6}\s/.test(ls[end])) end++;
  let ins = end;
  while (ins > idx + 1 && ls[ins - 1].trim() === '') ins--;
  ls.splice(ins, 0, line);
  return ls.join('\n');
}

/* サブイシューの行 → { what, way }。**表の見出し行と区切り行は落とす**
   （toNote が組む表をそのまま読み返すため） */
function subRows(lines) {
  const out = [];
  for (let i = 0; i < (lines || []).length; i++) {
    const l = nfc(lines[i]).trim();
    if (l === '') continue;
    if (/^\|\s*-{2,}/.test(l)) continue;
    if (/^>/.test(l)) continue;                    // 筋などの注記は行ではない
    if (/^\|/.test(l)) {
      const cells = l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
      if (cells[0] === '' || cells[0] === '分からないこと') continue;
      // 5列（2026-09-25〜: 2列目が「何を見れば白黒つく」）と 4列の旧行の両方を読む
      if (cells.length >= 5) out.push({ what: cells[0], pic: cells[1], way: cells[2], who: cells[3], due: cells[4] });
      else out.push({ what: cells[0], pic: '', way: cells[1] || '', who: cells[2] || '', due: cells[3] || '' });
    } else {
      out.push({ what: l, pic: '', way: wayOf(l), who: '', due: '' });
    }
  }
  return out;
}

/* ゴール節の読み取り（IS-Q16）: 型・マイルストーン（A）・目指す姿の候補（B）・期限。
   buildMd が書く形（> 型: … / - 目指す姿（仮）: …（仮決め: 日付）/ > 見送った候補: a ／ b）の逆変換 */
function goalInfo(lines) {
  const r = { kind: '', milestone: '', visions: '', due: '', headline: '' };
  const ms = [], vs = [], others = [];
  for (const raw of lines || []) {
    const l = nfc(raw).trim();
    if (l === '') continue;
    let m;
    if ((m = l.match(/^>?\s*型[:：]\s*(ギャップフィル|ビジョン設定)/))) { r.kind = m[1] === 'ギャップフィル' ? 'A' : 'B'; continue; }
    if ((m = l.match(/^>?\s*見送った候補[:：]\s*(.*)$/))) {
      m[1].split(/\s*／\s*/).forEach(function (x) { if (x.trim() !== '') others.push(x.trim()); });
      continue;
    }
    if ((m = l.match(/^(?:[-*+]\s*)?目指す姿（仮）[:：]\s*(.*?)(?:（仮決め[:：]\s*(\d{4}-\d{2}-\d{2})）)?\s*$/))) {
      vs.push(m[1].trim()); if (m[2]) r.due = m[2]; continue;
    }
    if (/^>/.test(l)) continue;                    // その他の注記
    if ((m = l.match(/^(.*?)（マイルストーン[:：]\s*(\d{4}-\d{2}-\d{2})）\s*$/))) { ms.push(m[1].trim()); r.due = m[2]; continue; }
    ms.push(l);
  }
  r.milestone = ms.join('\n');
  r.visions = vs.concat(others).join('\n');
  r.headline = (r.kind === 'B' ? vs[0] : ms[0]) || ms[0] || vs[0] || '';
  return r;
}

// カード1枚分の要約。**判定（judge）も同じ純関数を通す**ので、一覧と入力で基準がずれない
function summarize(text, fileName) {
  const fm = parseFrontmatter(text);
  const p = parseSections(fm.body);
  const name = String(fileName || '').replace(/\.md$/i, '');
  const rows = subRows(p.subs);
  const ways = { '聞く': 0, '調べる': 0, '試す': 0 };
  for (let i = 0; i < rows.length; i++) {
    if (Object.prototype.hasOwnProperty.call(ways, rows[i].way)) ways[rows[i].way]++;
  }
  const pic = (p.picture || []).filter(function (x) { return nfc(x).trim() !== ''; });
  const verdicts = judge(p.issue, {
    deadline: fm.data.deadline || '',
    unknowns: rows.map(function (x) { return x.what; }),
    picture: pic.join(' '),
  });
  const issueLine = (p.issue || []).map(function (x) { return nfc(x).trim(); })
    .filter(function (x) { return x !== '' && !/^[>（(]/.test(x); })[0] || '';
  return {
    file: String(fileName || ''), name: name,
    title: (p.title || name),
    project: fm.data.project || '',
    goal: goalInfo(p.goal).headline,
    goalLines: (p.goal || []).slice(),
    kind: goalInfo(p.goal).kind,
    story: ((p.subs || []).map(function (x) { return nfc(x).trim(); })
      .filter(function (x) { return /^>\s*筋[:：]/.test(x); })[0] || '').replace(/^>\s*筋[:：]\s*/, ''),
    issue: issueLine,
    picture: pic[0] || '',
    conclusion: (p.conclusion || []).map(function (x) { return nfc(x).trim(); })
      .filter(function (x) { return x !== ''; })[0] || '',
    subs: rows.length, ways: ways, rows: rows,
    next: (p.next || [])[0] || '',
    deadline: fm.data.deadline || '',
    status: fm.data.status || 'open',
    verdict: fm.data.verdict || '',
    hasFrontmatter: fm.has,
    warn: verdicts.filter(function (v) { return v.level === 'warn'; }).length,
    verdicts: verdicts,
  };
}

/* ---------- 既存ノートへの書き込み（書き殴りを壊さない） ----------
   実測（2026-09-24）: 利用者は**新しいノートを作らず、1本を育てている**
   （04_Issues は2本のまま、9/24 のノートが同日中に 3.8KB → 7.2KB）。
   ウィザードが必ず新規作成していると**育てているノートと分裂する**ので、
   既存ノートの先頭に5段を差し込めるようにする。書き殴りは下にそのまま残す */

// 既に5段が入っている範囲 [start, end)。「## 1. ゴール」から「## 5. 次の一手」の節の終わりまで
function frameRange(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s*1[.．]?\s*ゴール\s*$/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let five = -1;
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,6}\s*5[.．]?\s*次の一手\s*$/.test(lines[i])) { five = i; break; }
  }
  if (five === -1) return null;
  let end = five + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end]) && lines[end].trim() !== '---') end++;
  return [start, end];
}

// frontmatter と H1 の直後（＝本文の先頭）を返す
function topOfBody(lines, text) {
  let at = 0;
  const fm = text.match(/^---\n[\s\S]*?\n---\n?/);
  if (fm) at = fm[0].replace(/\n$/, '').split('\n').length;
  for (let i = at; i < Math.min(at + 4, lines.length); i++) {
    if (/^#\s+/.test(lines[i])) { at = i + 1; break; }
  }
  return at;
}

/* 5段のブロックを差し込む。既にあれば**重ねる**（IS-Q27・2026-10-08）: 新しい節の行の後ろに、前からあった行のうち新しい節に無いものを残す。
   ウィザードが作る注記（型・見送った候補・答えが出たら・筋）と空の `- ` だけは作り直す。新しい md に無い節（リスク等）は5の後ろへそのまま。
   以前は範囲ごと置き換えていて、最終形の2行目・次の一手の2つ目・旧リスクが消えていた（点検 #1）。書き殴り（枠の外）には一切触らない */
const FRAME_NOTE_RE = /^>\s*(型|見送った候補|答えが出たら|筋)\s*[:：]/;
function frameSections(lines) {   // [{ head: 見出し行 or null, key: 'ゴール' 等, body: [] }]
  const out = [];
  let cur = { head: null, key: '', body: [] };
  for (const l of lines) {
    const m = /^#{1,6}\s*(?:\d+[.．]?\s*)?(.+?)\s*$/.exec(l);
    if (m) { out.push(cur); cur = { head: l, key: nfc(m[1]), body: [] }; continue; }
    cur.body.push(l);
  }
  out.push(cur);
  return out.filter(s => s.head !== null || s.body.some(x => x.trim() !== ''));
}
// 行の同一性（記号・チェック・📅 の日付・空白の違いは同じ行とみなす）
const frameKeyOf = (s) => nfc(s).replace(/[.．]/g, '').replace(/\s+/g, ' ')
  .replace(/^- (\[[ xX]\] )?/, '').replace(/\s*\u{1F4C5}\s*\d{4}-\d{2}-\d{2}/u, '').trim();
function mergeFrame(text, md) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  const block = nfc(md).replace(/\s*$/, '').split('\n');
  const r = frameRange(lines);
  if (!r) {
    const at = topOfBody(lines, t);
    lines.splice(at, 0, ...[''].concat(block, ['']));
    return { text: lines.join('\n'), kept: 0 };
  }
  const olds = frameSections(lines.slice(r[0], r[1]));
  const news = frameSections(block);
  const out = [];
  let kept = 0;
  const seen = new Set();
  for (const n of news) {
    out.push(n.head, ...n.body);
    const have = new Set(n.body.map(frameKeyOf).filter(Boolean));
    const noteKinds = new Set(n.body.map(x => (FRAME_NOTE_RE.exec(x) || [])[1]).filter(Boolean));
    const hasTable = n.body.some(x => /^\|/.test(x));
    const o = olds.find(s => s.key === n.key && !seen.has(s));
    if (!o) continue;
    seen.add(o);
    const extra = [];
    for (const l of o.body) {
      const k = frameKeyOf(l);
      if (k === '' || have.has(k)) continue;
      const note = (FRAME_NOTE_RE.exec(l) || [])[1];
      if (note && noteKinds.has(note)) continue;   // ウィザードが同じ種類の注記を作り直した（二重にしない）。作らなかったなら前のを残す
      if (hasTable && (/^\|\s*-+/.test(l) || /^\|\s*サブイシュー/.test(l))) continue;   // 表の見出し行と区切りは作り直す
      extra.push(l);
    }
    if (extra.length) {
      while (out.length && out[out.length - 1] === '') out.pop();   // 節末の空行の前に入れる
      out.push(...extra, '');
      kept += extra.length;
    }
  }
  for (const o of olds) {   // 新しい md に無い節（リスク等）はそのまま後ろへ
    if (seen.has(o) || o.head === null) continue;
    out.push(o.head, ...o.body);
    kept += o.body.filter(x => x.trim() !== '').length;
  }
  if (out[out.length - 1] !== '') out.push('');
  lines.splice(r[0], r[1] - r[0], ...out);
  return { text: lines.join('\n'), kept };
}
function upsertFrame(text, md) { return mergeFrame(text, md).text; }

/* 論点の一行だけを書く（軽い入口）。「## 2. 論点」があれば中身を差し替え、
   無ければ本文の先頭に節を作る。**注記行（> 始まり）は残す** */
function setIssueLine(text, line) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (/^#{1,6}\s*(?:2[.．]?\s*)?(論点|イシュー)\s*$/.test(lines[k])) { i = k; break; }
  }
  const body = ['', '- ' + nfc(line).trim()];
  if (i >= 0) {
    let end = i + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end]) && lines[end].trim() !== '---') end++;
    // カードに出ている行（中身のある最初の行 — summarize の issueLine と同じ条件）だけを置き換える。ほかの行は残す（IS-SF2・IS-Q27。
    // 以前は `>` 以外を全部消していた — 点検 #2）
    for (let k = i + 1; k < end; k++) {
      const s = stripBullet(lines[k]);
      if (s !== '' && !/^[>（(]/.test(s)) { lines[k] = body[1]; return lines.join('\n'); }
    }
    lines.splice(i + 1, 0, ...body);   // 中身の行が無ければ見出しの直後に
    return lines.join('\n');
  }
  const at = topOfBody(lines, t);
  lines.splice(at, 0, ...[''].concat(['## 2. 論点'], body, ['']));
  return lines.join('\n');
}

/* ---------- 論点の行（IS-Q12。tasks.md と同じ最小単位） ----------
   **1ノート = 1論点は実データで破綻している**（9/24 のノートに論点が3つ同居）。
   論点は「見える前にノートを分けられない」ので、`## 論点` の**1行**を単位にする。
   記法は tasks.md と同じ（覚えることを増やさない・Obsidian の Tasks も拾える） */
const ISSUE_ITEM_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const DUE_RE = /\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/u;
const DONE_RE = /\u{2705}\s*(\d{4}-\d{2}-\d{2})/u;
const VERDICT_RE = /(当たり|外れ|未決)/;

// 「## 論点」（「## 2. 論点」「## イシュー」も同じ）の節の範囲 [start, end)
function issueSectionRange(lines) {
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (/^#{1,6}\s*(?:2[.．]?\s*)?(論点|イシュー)\s*$/.test(lines[k])) { i = k; break; }
  }
  if (i === -1) return null;
  let end = i + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end]) && lines[end].trim() !== '---') end++;
  return [i, end];
}

/* 論点の行の子（段3 — IS-DG1）。記法は増やさない: 「待ち:」「待ち：」で始まれば待ち、「伝えた:」は伝えた（閉じるときに書く — openCloseModal）、それ以外は分かった */
function kidOf(s) {
  const m = String(s).match(/^(待ち|伝えた)\s*[:：]\s*(.*)$/);
  return m ? { kind: m[1] === '待ち' ? 'wait' : 'told', text: m[2].trim() } : { kind: 'learned', text: String(s).trim() };
}

function issueLines(text) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  const r = issueSectionRange(lines);
  if (!r) return [];
  const out = [];
  for (let k = r[0] + 1; k < r[1]; k++) {
    const m = lines[k].match(ISSUE_ITEM_RE);
    if (!m) continue;
    const rest = m[2];
    // 直後のインデントされた箇条書きは「分かったこと」（閉じるときに子行として置く）
    const notes = [];
    for (let j = k + 1; j < r[1]; j++) {
      const c = lines[j].match(/^(?=\t| {2})[\t ]+[-*+]\s+(.*)$/);   // 子の子も読む（段3 — IS-DG1）。字下げは (?:\t| {2,})+ と書かない — 入れ子の繰り返しは空白の長い行で固まる（IS-DG11）
      if (!c) break;
      notes.push(c[1].trim());
    }
    out.push({
      lineNo: k,
      raw: lines[k],
      note: notes.join(' / '),
      kids: notes.map(kidOf),
      done: m[1].toLowerCase() === 'x',
      due: (rest.match(DUE_RE) || [])[1] || '',
      doneDate: (rest.match(DONE_RE) || [])[1] || '',
      verdict: (rest.match(VERDICT_RE) || [])[1] || '',
      link: (rest.match(/\[\[([^\]]+)\]\]/) || [])[1] || '',
      text: rest.replace(/\[\[[^\]]+\]\]/g, '')
        .replace(new RegExp(DUE_RE.source, 'gu'), '')
        .replace(new RegExp(DONE_RE.source, 'gu'), '')
        .replace(/(当たり|外れ|未決)\s*$/, '')
        .replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

// `## 論点` の末尾に1行足す。節が無ければ本文の先頭に作る
function addIssueLine(text, line, due) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n');
  const body = '- [ ] ' + nfc(line).trim() + (due ? ' \u{1F4C5} ' + due : '');
  const r = issueSectionRange(lines);
  if (r) {
    let ins = r[1];
    while (ins > r[0] + 1 && lines[ins - 1].trim() === '') ins--;
    lines.splice(ins, 0, body);
    return lines.join('\n');
  }
  const at = topOfBody(lines, t);
  lines.splice(at, 0, ...['', '## 論点', '', body, '']);
  return lines.join('\n');
}

/* 論点の行の子の最後（子の子があればその後）に1行足す（段3 — IS-DG2）。字下げは最初の子に合わせる（子が無ければタブ）。
   ほかの行は変えない。行番号が範囲外ならそのまま返す */
function addKidLine(text, lineNo, sub) {
  const lines = nfc(text).replace(/\r\n?/g, '\n').split('\n');
  if (lineNo < 0 || lineNo >= lines.length) return lines.join('\n');
  let last = lineNo, indent = '\t';
  for (let j = lineNo + 1; j < lines.length; j++) {
    const c = lines[j].match(/^((?=\t| {2})[\t ]+)[-*+]\s+/);   // 字下げの照合は上の issueLines と同じ（IS-DG11）
    if (!c) break;
    if (last === lineNo) indent = c[1];
    last = j;
  }
  lines.splice(last + 1, 0, indent + '- ' + nfc(sub).trim());
  return lines.join('\n');
}

function insertAfterLine(text, lineNo, raw) {
  const lines = nfc(text).replace(/\r\n?/g, '\n').split('\n');
  lines.splice(lineNo + 1, 0, raw);
  return lines.join('\n');
}

function replaceLine(text, lineNo, raw) {
  const lines = nfc(text).replace(/\r\n?/g, '\n').split('\n');
  if (lineNo < 0 || lineNo >= lines.length) return lines.join('\n');
  lines[lineNo] = raw;
  return lines.join('\n');
}

// 行を閉じる: `- [x] … 📅 … ✅ <今日> <判定>`（既に ✅ があれば二重にしない）
function closeLineRaw(raw, verdict, today) {
  let out = nfc(raw).replace(/^(\s*[-*+]\s+)\[[ xX]\]/, '$1[x]');
  if (!DONE_RE.test(out)) out += ' \u{2705} ' + (today || todayStr());
  if (verdict && !VERDICT_RE.test(out.replace(/^[^\]]*\]/, ''))) out += ' ' + verdict;
  return out.replace(/\s+$/, '');
}

// 行に切り出し先のリンクを足す（既にあれば足さない）
function linkLineRaw(raw, noteName) {
  const out = nfc(raw);
  const name = String(noteName || '').replace(/\.md$/i, '');
  if (name === '' || out.indexOf('[[' + name + ']]') >= 0) return out;
  return out.replace(/\s+$/, '') + ' [[' + name + ']]';
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

/* ノートのファイル名（vault-rules の命名規則 `YYYY-MM-DD_トピック.md`）。
   Obsidian / ファイルシステムで使えない文字は `-` に置換する */
// 規則は lib/edit.js（Plan Tasks の［🎯 考える場所へ］が同じフォルダに作るため共有 — IS-16 / TB-N5）
function noteFileName(title, today) {
  return ToolEdit.noteFileName(title, today || todayStr());
}

/* 04_Issues 用の md。**空のセクションも見出しは残す**（後でノート側で埋めるため）。
   器は 99_Templates/issue.md と同じ5ステップ */
function toNote(parsed, opts) {
  const o = opts || {};
  const p = parsed || parseSections('');
  const L = [];
  const bullets = arr => {
    if (!arr || arr.length === 0) { L.push('- '); } else {
      // 既に記号（箇条書き・表・引用）で始まる行はそのまま通す
      for (const a of arr) L.push(/^\s*[-*+|>]/.test(a) ? a : '- ' + a);
    }
    L.push('');
  };
  const sec = (head, arr) => { L.push(head); L.push(''); bullets(arr); };
  L.push('---');
  L.push('created: ' + (o.today || todayStr()));
  L.push('deadline: ' + (o.deadline || ''));
  L.push('status: open');
  if (o.project) L.push('project: ' + yamlScalar(o.project));   // 案件（IS-Q21・Plan Tasks の TB-Q62 と同じキー）
  L.push('verdict: ');            // 閉じるとき「当たり / 外れ / 未決」を書く（振り返りの素材）
  L.push('tags: [issue]');
  L.push('---');
  L.push('# ' + ((o.title || p.title || '').trim() || '無題'));
  L.push('');
  L.push('→ [[IssueDriven]] ｜ [[イシューの書き方と記入例]]');
  if (o.from) L.push('← [[' + String(o.from).replace(/\.md$/i, '') + ']]');   // 切り出し元（IS-Q13）
  L.push('');
  sec('## 1. ゴール', p.goal);
  sec('## 2. 論点', p.issue);
  sec('## 3. 最終形', p.picture);
  L.push('## 4. サブイシュー');
  L.push('');
  // 2列目「何を見れば白黒つく」が本の絵コンテ（サブイシューごとの分析イメージ — IS-Q17）
  L.push('| 分からないこと | 何を見れば白黒つく | 聞く / 調べる / 試す | 誰に・どこで | いつまでに |');
  L.push('| --- | --- | --- | --- | --- |');
  const subsAll = (p.subs && p.subs.length) ? p.subs : [''];
  const quotes = subsAll.filter(u => /^\s*>/.test(u));          // 筋などの注記は表の後に置く（表の途中だと壊れる）
  const rows = subsAll.filter(u => !/^\s*>/.test(u));
  if (rows.length === 0) rows.push('');
  for (const u of rows) {
    if (/^\s*\|/.test(u)) {
      // 表の行は組み直さない（IS-18）。見出し・区切りは自前で出すので捨て、
      // 4セルの旧行だけ2列目に空の「白黒」セルを挿入して5列に揃える
      const cells = u.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (/^-{2,}$/.test(cells[0]) || cells[0] === '分からないこと') continue;
      L.push(cells.length === 4 ? '| ' + [cells[0], '', cells[1], cells[2], cells[3]].join(' | ') + ' |' : u);
    } else {
      L.push('| ' + u + ' |  | ' + wayOf(u) + ' |  |  |');
    }
  }
  L.push('');
  if (quotes.length) { for (const q of quotes) L.push(q); L.push(''); }
  L.push('## 5. 次の一手');
  L.push('');
  if (!p.next || p.next.length === 0) { L.push('- [ ] '); } else {
    for (const n of p.next) L.push(/^\s*[-*+]\s+\[/.test(n) ? n : '- [ ] ' + n);
  }
  L.push('');
  // 旧枠。既存ノートに書かれていた内容は落とさない（新規では空なので出ない）
  if (p.risks && p.risks.length) sec('## リスク', p.risks);
  L.push('---');
  L.push('');
  sec('## 分かったこと', p.found);
  // **ここが無いとイシューを閉じられず、振り返りの素材が残らない**（A5）
  sec('## 結論', p.conclusion);
  // 書き殴る場所。5段の器にも常設（2026-09-25）— 無いと考えをデイリーに書いてしまい、論点に育たない
  // （9/24 の実測: デイリーのログ27行・ノートの分かったこと/結論は空）。1行目は止め時（IS-Q19・本: 10分）
  L.push('## 掘る'); L.push(''); L.push(DIG_HINT); L.push(''); L.push('- '); L.push('');
  if (p.rest && p.rest.length) {
    L.push('## 掘ったログ');
    L.push('');
    for (const x of p.rest) L.push(x);
    L.push('');
  }
  return L.join('\n');
}

/* ウィザードの下書き → 5ステップの md。**ウィザードは md を作るだけ**で、
   判定・出力・書き込みは既存の経路（parseSections → judge / toNote）をそのまま通る。
   実装を二重に持たないための設計（IS-Q8） */
function buildMd(d0) {
  const d = d0 || {};
  const one = v => nfc(v).trim().replace(/\s*\n+\s*/g, ' ');
  const L = [];
  const sec = (head, lines) => {
    L.push(head); L.push('');
    if (lines.length === 0) L.push('- '); else for (const x of lines) L.push(x);
    L.push('');
  };
  // 型（改訂版「課題解決の2つの型」— IS-Q16）。(B) はゴールの代わりに目指す姿の候補から1つ選ぶ
  const goal = [];
  if (d.kind === 'A') goal.push('> 型: ギャップフィル（あるべき姿は決まっている）');
  if (d.kind === 'B') goal.push('> 型: ビジョン設定（あるべき姿を決めるところから）');
  if (d.kind === 'B') {
    const vs = nfc(d.visions || '').split('\n').map(x => x.trim()).filter(x => x !== '');
    if (vs.length) goal.push('- 目指す姿（仮）: ' + vs[0] + (d.milestoneDue ? '（仮決め: ' + d.milestoneDue + '）' : ''));
    if (vs.length > 1) goal.push('> 見送った候補: ' + vs.slice(1).join(' ／ '));
  } else {
    const ms = one(d.milestone);
    if (ms !== '') goal.push('- ' + ms + (d.milestoneDue ? '（マイルストーン: ' + d.milestoneDue + '）' : ''));
  }
  sec('## 1. ゴール', goal);

  // 論点: 選んだ1行＋注記（注記は「> 」で始めるので judge の行数に数えられない）
  const cands = (d.candidates || []).map(c => ({ text: one(c.text), effect: one(c.effect) }));
  const pick = cands[d.chosen || 0] || { text: '', effect: '' };
  const others = cands.filter((c, i) => i !== (d.chosen || 0) && c.text !== '').map(c => c.text);
  const issueLines = [];
  if (pick.text !== '') issueLines.push('- ' + pick.text);
  if (pick.effect !== '') issueLines.push('> 答えが出たら: ' + pick.effect);
  if (others.length) issueLines.push('> 見送った候補: ' + others.join(' ／ '));
  sec('## 2. 論点', issueLines);

  const pic = one(d.picture);
  sec('## 3. 最終形', pic === '' ? []
    : ['- ' + (d.pictureKind ? '【' + d.pictureKind + '】' : '') + pic]);

  const subs = (d.subs || []).filter(u => u && one(u.what) !== '');
  sec('## 4. サブイシュー', subs.map(u =>
    '| ' + one(u.what) + ' | ' + one(u.pic || '') + ' | ' + one(u.way) + ' | ' + one(u.who) + ' | ' + one(u.due) + ' |'));
  // 筋（ストーリーライン — 本の2章）: この順で潰すと結論に着地する。表の後に1行
  const story = nfc(d.story || '').split('\n').map(x => x.trim()).filter(x => x !== '');
  if (story.length) { L.push('> 筋: ' + story.join(' → ')); L.push(''); }

  const nx = one(d.next);
  L.push('## 5. 次の一手'); L.push('');
  L.push(nx === '' ? '- [ ] '
    : '- [ ] ' + nx + (d.nextDue ? ' \u{1F4C5} ' + d.nextDue : ''));
  L.push('');
  return L.join('\n');
}

// tasks.md 用の行（Obsidian Tasks 記法）。既に "- [ ]" なら二重に付けない
function toTasks(nextLines, opts) {
  const o = opts || {};
  const dl = o.deadline ? ' \u{1F4C5} ' + o.deadline : '';
  const arr = (nextLines || []).map(x => nfc(x).trim()).filter(x => x !== '');
  if (arr.length === 0) return '';
  return arr.map(x => {
    const has = /^[-*+]\s+\[[^\]]\]\s/.test(x);
    const body = has ? x : '- [ ] ' + x.replace(/^[-*+]\s+/, '');
    return /\u{1F4C5}/u.test(body) ? body : body + dl;
  }).join('\n');
}

/* 掘るの本文（段3 — IS-DG3・［掘るを読む］・量）。見出し「掘る」の次の行から、**同じか上の段の見出し**の手前まで
   （小見出し `###` は中身）。``` の中の `# …` は見出しにしない（コマンドの注釈で切れないように）。末尾の空白は落とす */
function digText(text) {
  const out = [];
  let level = 0, fence = false;   // level: 0 = 掘るの外、それ以外は掘るの見出しの # の数
  for (const l of nfc(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]*```/.test(l)) fence = !fence;
    const h = fence ? null : l.match(/^(#{1,6})[ \t]+(.*?)[ \t]*$/);   // 見出しは半角空白かタブだけ（全角空白は文字 — Obsidian と同じ・IS-DG12）
    if (level && h && h[1].length <= level) break;
    if (!level) { if (h && h[2].trim() === '掘る') level = h[1].length; continue; }
    out.push(l);
  }
  return out.join('\n').replace(/\s+$/, '');
}

/* 一覧の見出しに出す量（IS-L11・IS-Q23）: 掘るの中身の行数・画像の埋め込み数・論点の行数。
   掘るは空・「>」の注記・中身の無い「- 」を数えない（テンプレの骨だけで「掘る 3行」と出さない）。
   掘るの本文は digText と同じ（数と［掘るを読む］の中身を食い違わせない — 段3） */
function noteStats(text) {
  const t = nfc(text).replace(/\r\n?/g, '\n');
  let dig = 0;
  for (const l of digText(t).split('\n')) {
    const x = l.trim();
    if (x === '' || /^>/.test(x) || /^[-*+]\s*$/.test(x)) continue;
    dig++;
  }
  const images = (t.match(/!\[\[[^\]]+\.(?:png|jpe?g|gif|webp|svg)(?:\|[^\]]*)?\]\]/gi) || []).length
    + (t.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  return { dig: dig, images: images, lines: issueLines(t).length };
}

