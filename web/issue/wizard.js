'use strict';
/* web/issue/wizard.js — 入力ウィザード（5段を1問ずつ）
   入口: web/issue.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- 入力ウィザード（IS-Q8） ----------
   **ただの md 入力欄では Obsidian と同じ**という利用者の指摘への対処。
   5段は本の順（型＋マイルストーン → イシューの選別 → 最終形 → 分解＋絵コンテ＋筋 → 最初の一手）。
   2026-09-24 に「リスク」を落として 選別・絵コンテ・分解 を入れた（本の3章分が欠けていたため）。
   ウィザードは **md を組み立てて既存の入力欄へ流すだけ** — 判定・出力・書き込みは
   parseSections → judge / toNote / createNote の既存経路をそのまま通る */
const WZ = [
  { title: 'あるべき姿は決まっている？ → いつまでに、何が達成されていればいい？',
    why: '改訂版「課題解決の2つの型」。あるべき姿が決まっていない（ビジョン設定型）のに現状分析から始めると答えが出ない。型で最初の問いが変わる（本: 最終形からたどる）' },
  { title: '答えを出すべき問いの候補を出して、1つ選ぶ',
    why: '解ける問題の中から、最もインパクトのあるものを選ぶ（本: イシュー度）。1つしか思いつかないときは、まだ選んでいない' },
  { title: '答えが出たとき、最後に何を言う・出す？',
    why: '分析を始める前に、最後の形を先に決める（本: 最終形からたどる・伝えるメッセージ）。描けないなら、まだイシューが定まっていない' },
  { title: '答えが出る大きさまで割ると？',
    why: '崩れたら全部やり直しになるものを上に。各行に「何を見れば白黒つくか」を描く（本: 絵コンテ）。並べ順が結論への筋（本: ストーリーライン）' },
  { title: '最初に潰すのはどれ？',
    why: '一つを100%にするより、60%で全体を何周も回す（本: 回転数 × スピード）' },
];

const draft = {
  kind: '',                         // 'A' ギャップフィル / 'B' ビジョン設定（IS-Q16）。既定なし
  milestone: '', milestoneDue: '',
  visions: '',                      // (B) 目指す姿の候補（1行1つ・1行目が本命）
  story: '',                        // 筋（ストーリーライン）1行1段
  project: '',                      // 案件（IS-Q21）。新しいノートを作るときだけ聞く
  candidates: [{ text: '', effect: '' }, { text: '', effect: '' }],
  chosen: 0, issueDue: '',
  pictureKind: '表', picture: '',
  subs: [], next: '', nextDue: '', title: '',
};
let wzStep = 0;
/* 書き込み先。null = 新規ノートを作る / it = **その既存ノートの先頭に5段を差し込む**
   （実測: 利用者は新規を作らず1本を育てている。新規固定だと育てているノートと分裂する） */
let wzTarget = null;

function mkText(id, val, ph) {
  const e = document.createElement('input');
  e.type = 'text'; if (id) e.id = id; e.value = val || ''; e.placeholder = ph || '';
  e.spellcheck = false; return e;
}
/* 日付欄は**今日が既定**（利用者「日付を入力しにくすぎる。まず今日をデフォルトで」）。
   チップ（今日 / +1 / +7）は要素が DOM に入った後でないと付けられないので、
   付ける側が `withChips(mkDate(...))` を親に追加した直後に呼ぶ */
function mkDate(id, val) {
  const e = document.createElement('input');
  e.type = 'date'; if (id) e.id = id; e.value = val || todayStr(); return e;
}
function chipsAfter(input) { if (window.ToolEdit && ToolEdit.dateChips) ToolEdit.dateChips(input); return input; }
function mkArea(id, val, ph, rows) {
  const e = document.createElement('textarea');
  if (id) e.id = id; e.value = val || ''; e.placeholder = ph || '';
  e.rows = rows || 3; e.spellcheck = false; return e;
}
function wzField(label, el) {
  const l = document.createElement('label');
  l.className = 'mf';
  const s2 = document.createElement('span');
  s2.textContent = label;
  l.appendChild(s2); l.appendChild(el);
  return l;
}
function wzBind(el, key) {
  const on = () => { draft[key] = el.value; wzLive(); };
  el.addEventListener('input', on);
  el.addEventListener('change', on);
}
function pickedText() {
  const c = draft.candidates[draft.chosen];
  return c ? c.text : '';
}

// Step 1 (B): 目指す姿の候補が2つ未満なら info（拒否はしない — IS-Q5）
function wzVisionHint() {
  const host = $id('wz-judge');
  host.textContent = ''; host.className = '';
  if (wzStep !== 0 || draft.kind !== 'B') return;
  const n = nfc(draft.visions).split('\n').map(x => x.trim()).filter(x => x !== '').length;
  if (n >= 2) return;
  renderVerdict([{ id: 'visions', level: 'info', msg: '候補が1つだけ',
    fix: 'もう1つ立てて並べる。ビジョン設定型は現状分析からは出ない — 目指す姿を選ぶところから' }], host);
}

// Step 2 の判定は本体と同じ純関数を通す（二重実装しない）
function wzLive() {
  if (wzStep !== 1) return;
  // Step 2 は論点を選ぶ段。絵コンテ・サブイシューは Step 3・4 で問うので、ここでは出さない（R7 のノイズ対策）
  renderVerdict(judge([pickedText()], {
    stage: 'line',
    deadline: draft.issueDue,
    candidates: draft.candidates.map(c => c.text),
  }), $id('wz-judge'));
}

// --- Step 2: 論点の候補（選別） ---
function wzCands(list) {
  list.textContent = '';
  draft.candidates.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'wz-c';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'wz-cand'; radio.className = 'wz-c-pick';
    radio.checked = draft.chosen === i;
    radio.title = 'これを論点にする';
    radio.addEventListener('change', () => { if (radio.checked) { draft.chosen = i; wzLive(); } });
    const text = mkText('', c.text, '問いの候補（一行）');
    text.className = 'wz-c-text';
    text.addEventListener('input', () => { c.text = text.value; wzLive(); });
    const effect = mkText('', c.effect, '答えが出たら、誰の何が変わる？');
    effect.className = 'wz-c-effect';
    effect.addEventListener('input', () => { c.effect = effect.value; });
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '×'; del.title = 'この候補を削除';
    del.addEventListener('click', () => {
      if (draft.candidates.length <= 1) return;
      draft.candidates.splice(i, 1);
      if (draft.chosen >= draft.candidates.length) draft.chosen = draft.candidates.length - 1;
      wzCands(list); wzLive();
    });
    row.appendChild(radio); row.appendChild(text); row.appendChild(effect); row.appendChild(del);
    list.appendChild(row);
  });
}

// --- Step 4: サブイシュー ---
function wzSubs(list) {
  list.textContent = '';
  draft.subs.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'wz-u';
    const what = mkText('', u.what, '答えが出る大きさまで割ったもの');
    what.className = 'wz-s-what';
    what.addEventListener('input', () => { u.what = what.value; });
    // 本の絵コンテ: このサブイシューは何を見れば白黒つくか（表・ログ・画面・一言）
    const pic = mkText('', u.pic, '何を見れば白黒つく（表・ログ・画面・一言）');
    pic.className = 'wz-s-pic';
    pic.addEventListener('input', () => { u.pic = pic.value; });
    const way = document.createElement('select');
    way.className = 'wz-s-way';
    [['', '（未定）'], ['聞く', '聞く'], ['調べる', '調べる'], ['試す', '試す']].forEach(pair => {
      const o = document.createElement('option');
      o.value = pair[0]; o.textContent = pair[1];
      way.appendChild(o);
    });
    way.value = u.way || '';
    way.addEventListener('change', () => { u.way = way.value; });
    const who = mkText('', u.who, '誰に・どこで');
    who.className = 'wz-s-who';
    who.addEventListener('input', () => { u.who = who.value; });
    const due = mkDate('', u.due);
    due.className = 'wz-s-due';
    const setDue = () => { u.due = due.value; };
    due.addEventListener('input', setDue);
    due.addEventListener('change', setDue);
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '×'; del.title = 'この行を削除';
    del.addEventListener('click', () => { draft.subs.splice(i, 1); wzSubs(list); });
    row.appendChild(what); row.appendChild(pic); row.appendChild(way); row.appendChild(who);
    row.appendChild(due); row.appendChild(del);
    list.appendChild(row);
  });
}

function wzRender() {
  const body = $id('wz-body');
  body.textContent = '';
  $id('wz-step').textContent = 'Step ' + (wzStep + 1) + ' / ' + WZ.length;
  $id('wz-dots').textContent = WZ.map((_, i) => (i <= wzStep ? '●' : '○')).join('');
  $id('wz-title').textContent = WZ[wzStep].title;
  $id('wz-why').textContent = '💡 ' + WZ[wzStep].why;
  $id('wz-err').textContent = '';
  $id('wz-err').hidden = true;
  $id('wz-judge').textContent = '';
  $id('wz-judge').className = '';
  $id('wz-prev').disabled = wzStep === 0;
  $id('wz-next').hidden = wzStep === WZ.length - 1;
  $id('wz-create').hidden = wzStep !== WZ.length - 1;
  $id('wz-create').textContent = !wzTarget ? '04_Issues に作成'
    : (wzTarget.kind === 'line' ? '切り出して作成' : 'このノートに書き込む');
  $id('wz-source').hidden = !wzTarget;
  if (wzTarget) $id('wz-source-text').textContent = wzTarget.text || '';

  if (wzStep === 0) {
    // 型（改訂版「課題解決の2つの型」— IS-Q16）。既定なし: 選ばないと進めない。型で下の欄が変わる
    const row = document.createElement('div');
    row.className = 'mf';
    const lab = document.createElement('span');
    lab.textContent = 'あるべき姿は';
    row.appendChild(lab);
    const kinds = document.createElement('div');
    kinds.className = 'mf-body wz-kinds';
    [['A', 'wz-kind-a', '決まっている（ギャップフィル型）— 現状とのギャップを埋める'],
     ['B', 'wz-kind-b', 'まだ（ビジョン設定型）— 目指す姿を決めるところから']].forEach(([v, id, text]) => {
      const l = document.createElement('label');
      l.className = 'toggle';
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'wz-kind'; r.id = id; r.value = v; r.checked = draft.kind === v;
      r.addEventListener('change', () => { draft.kind = v; wzRender(); });
      l.appendChild(r); l.appendChild(document.createTextNode(' ' + text));
      kinds.appendChild(l);
    });
    row.appendChild(kinds);
    body.appendChild(row);
    if (draft.kind === 'B') {
      const v = mkArea('wz-visions', draft.visions,
        '例:\n10月末に検証環境で全機能が動いている\n本番切替まで含めて10月末に終わる', 4);
      wzBind(v, 'visions');
      v.addEventListener('input', wzVisionHint);
      body.appendChild(wzField('目指す姿の候補（1行1つ・2つ以上・1行目が本命）', v));
      const d = mkDate('wz-milestone-due', draft.milestoneDue);
      wzBind(d, 'milestoneDue');
      body.appendChild(wzField('いつまでに仮決めする', d));
      chipsAfter(d);
      draft.milestoneDue = d.value;
      wzVisionHint();
    } else {
      const t = mkArea('wz-milestone', draft.milestone,
        '例: 運営チームが自分たちだけで本番を停止できる手順書が出ていて、「これで実行できます」と言われている', 3);
      wzBind(t, 'milestone');
      body.appendChild(wzField('達成されている状態', t));
      const d = mkDate('wz-milestone-due', draft.milestoneDue);
      wzBind(d, 'milestoneDue');
      body.appendChild(wzField('いつまでに', d));
      chipsAfter(d);
      draft.milestoneDue = d.value;          // 既定（今日）を下書きにも反映
    }
  } else if (wzStep === 1) {
    const list = document.createElement('div');
    list.id = 'wz-cands';
    body.appendChild(list);
    wzCands(list);
    const add = document.createElement('button');
    add.type = 'button'; add.id = 'wz-add-cand'; add.textContent = '＋ 候補を追加';
    add.addEventListener('click', () => {
      draft.candidates.push({ text: '', effect: '' });
      wzCands(list); wzLive();
    });
    body.appendChild(add);
    const d = mkDate('wz-issue-due', draft.issueDue);
    wzBind(d, 'issueDue');
    body.appendChild(wzField('決着させる期限', d));
    chipsAfter(d);
    draft.issueDue = d.value;
    wzLive();
  } else if (wzStep === 2) {
    const k = document.createElement('select');
    k.id = 'wz-pic-kind';
    ['表', 'グラフ', '一文', '画面'].forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      k.appendChild(o);
    });
    k.value = draft.pictureKind || '表';
    wzBind(k, 'pictureKind');
    body.appendChild(wzField('出す形', k));
    const t = mkArea('wz-picture', draft.picture,
      '例: 横軸＝手順書の粒度、縦軸＝運営チームが実行できたか の表。右上に集まれば仮説どおり。開発環境の実測で埋める', 3);
    wzBind(t, 'picture');
    body.appendChild(wzField('何を出す？', t));
  } else if (wzStep === 3) {
    const list = document.createElement('div');
    list.id = 'wz-subs';
    body.appendChild(list);
    if (draft.subs.length === 0) draft.subs.push({ what: '', pic: '', way: '', who: '', due: '' });
    wzSubs(list);
    const add = document.createElement('button');
    add.type = 'button'; add.id = 'wz-add-sub'; add.textContent = '＋ 行を追加';
    add.addEventListener('click', () => {
      draft.subs.push({ what: '', pic: '', way: '', who: '', due: '' });
      wzSubs(list);
    });
    body.appendChild(add);
    // 筋（ストーリーライン — 本の2章）: サブイシューをどの順で潰すと結論に着地するか。1行1段
    const st = mkArea('wz-story', draft.story,
      '例:\n粒度が決まる\n停止対象の量が決まる\n手順書の形が決まる', 3);
    wzBind(st, 'story');
    body.appendChild(wzField('筋（この順で潰すと結論に着地する・1行1段）', st));
  } else {
    const t = mkText('wz-next-what', draft.next, '例: 運営チームに求める完成度（粒度）を確認する');
    wzBind(t, 'next');
    body.appendChild(wzField('次の一手', t));
    const d = mkDate('wz-next-due', draft.nextDue);
    wzBind(d, 'nextDue');
    body.appendChild(wzField('期限', d));
    chipsAfter(d);
    draft.nextDue = d.value;
    if (!wzTarget || wzTarget.kind === 'line') {   // 新規ノートを作るときだけ名前を聞く
      const n = mkText('wz-note-title', draft.title, '例: 本番停止手順書');
      wzBind(n, 'title');
      body.appendChild(wzField('ノートの名前', n));
      // 案件（tasks.md のセクション名）。候補は読み込んだノートの project の値。空でも作れる
      const pj = mkText('wz-project', draft.project, '例: ITK（tasks.md のセクション名・空でも可）');
      pj.setAttribute('list', 'wz-project-list');
      wzBind(pj, 'project');
      const dl = document.createElement('datalist');
      dl.id = 'wz-project-list';
      Array.from(new Set(notes.map(function (x) { return x.project; }).filter(Boolean))).sort()
        .forEach(function (v) { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
      body.appendChild(wzField('案件', pj));
      body.appendChild(dl);
    }
  }
}

/* 必須は Step1（マイルストーン）・Step2（論点）・Step3（絵コンテ）。
   絵コンテを必須にしたのは、本で最も強い検算がここだから
   （描けない＝まだイシューが定まっていない）。候補が1つだけでも**進める**（info のみ） */
function wzValidate(step) {
  if (step === 0 && draft.kind === '')
    return 'まず型を選んでください — あるべき姿が決まっているかで、最初の問いが変わります（改訂版: 課題解決の2つの型）';
  if (step === 0 && draft.kind === 'B' && (nfc(draft.visions).trim() === '' || !draft.milestoneDue))
    return '目指す姿の候補を1つ以上と、仮決めの期限を埋めてください — ビジョン設定型は現状分析から始めても答えが出ません';
  if (step === 0 && draft.kind === 'A' && (nfc(draft.milestone).trim() === '' || !draft.milestoneDue))
    return 'マイルストーン（達成されている状態）と期限の両方を埋めてください — ここを飛ばすと、何を問うかが決まりません';
  if (step === 1 && (nfc(pickedText()).trim() === '' || !draft.issueDue))
    return '論点（選んだ候補）と、その問いを決着させる期限を埋めてください — いつ白黒つくか書けないものは、まだイシューではありません';
  if (step === 2 && nfc(draft.picture).trim() === '')
    return '答えが出たとき最後に何を言う・出すかを書いてください — 最終形が描けないなら、まだイシューが定まっていません';
  return '';
}
function wzError(msg) {
  $id('wz-err').textContent = msg;
  $id('wz-err').hidden = false;
}

/* 既存ノートから開く。書き殴りを横に見ながら5段を埋められるよう、
   既に書かれている分（ゴール・論点・絵コンテ・サブ・次の一手）を初期値に入れる */
function wzOpenFor(it) {
  wzTarget = it;
  if (it.kind === 'line') {                    // 切り出し: 新しいノートを作って元の行にリンクを残す
    draft.project = (it.note && it.note.project) || '';   // 元ノートの案件を引き継ぐ（IS-UL18）
    draft.kind = '';
    draft.visions = '';
    draft.story = '';
    draft.milestone = '';
    draft.milestoneDue = '';
    /* **同じノートに書いてある他の論点を候補に並べる**（R1: 選別を実質にする）。
       書き殴りの段階で見えた論点が複数あるなら、それが本物の候補。空欄を足して「もう1つ」も促す */
    const others = (it.note && it.note.cards ? it.note.cards : [])
      .filter(function (c) { return c.kind === 'line' && c.status !== 'closed' && c !== it && c.issue; })
      .slice(0, 3)
      .map(function (c) { return { text: c.issue, effect: '' }; });
    draft.candidates = [{ text: it.issue || '', effect: '' }].concat(others);
    if (draft.candidates.length < 2) draft.candidates.push({ text: '', effect: '' });
    draft.chosen = 0;
    draft.issueDue = it.deadline || '';
    draft.pictureKind = '表';
    draft.picture = '';
    draft.subs = [];
    draft.next = '';
    draft.nextDue = '';
    draft.title = '';
    wzStep = 0;
    wzOpen();
    return;
  }
  const kind = (String(it.picture).match(/^【([^】]*)】/) || [])[1] || '表';
  const gi = goalInfo(it.goalLines || (it.goal ? [it.goal] : []));
  draft.kind = gi.kind;
  // 1行目だけを持つ（2行目以降は書き込みのときに mergeFrame が残す — IS-Q27。以前は全部つないで1行にしていた）
  draft.milestone = String(gi.milestone).split('\n')[0] || '';
  draft.visions = gi.visions;
  draft.milestoneDue = gi.due;
  draft.story = String(it.story || '').split(/\s*→\s*/).filter(Boolean).join('\n');
  draft.candidates = [{ text: it.issue || '', effect: '' }, { text: '', effect: '' }];
  draft.chosen = 0;
  draft.issueDue = it.deadline || '';
  draft.pictureKind = kind;
  draft.picture = String(it.picture).replace(/^【[^】]*】/, '');
  draft.subs = (it.rows || []).map(function (x) {
    return { what: x.what, pic: x.pic || '', way: x.way, who: x.who || '', due: x.due || '' };
  });
  const nx = String(it.next || '');
  draft.next = nx.replace(/^-\s*\[[^\]]\]\s*/, '').replace(/\s*\u{1F4C5}.*$/u, '').trim();
  draft.nextDue = (nx.match(/\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/u) || [])[1] || '';
  draft.title = it.title;
  wzStep = 0;
  wzOpen();
}

/* 切り出し（IS-Q13）: 論点の行 → 新しいノート（5段の器）。元の行には [[リンク]] を残す。
   同じノートに5段を入れ子にすると、論点3つで15節になって見通しが壊れるため */
async function wzSpinOff(it) {
  if (!dirHandle) { wzError('先に［📂 04_Issues を開く］でフォルダを選んでください'); return; }
  const name = noteFileName(draft.title, todayStr());
  try {
    let exists = true;
    try { await dirHandle.getFileHandle(name); } catch (e) {
      if (e && e.name === 'NotFoundError') exists = false; else throw e;
    }
    if (exists) { wzError(name + ' は既にあります — ノートの名前を変えてください'); return; }
    const md = toNote(parseSections(buildMd(draft)), {
      deadline: draft.issueDue, today: todayStr(), title: draft.title, from: it.name, project: draft.project,
    });
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(md);
    await w.close();
  } catch (e) { wzError('作成できませんでした: ' + errText(e)); return; }
  // 元の行にリンクを足す（鮮度チェックは writeNote が持つ）
  const ok = await writeNote(it.note,
    function (cur) { return replaceLine(cur, it.lineNo, linkLineRaw(it.raw, name)); }, null);
  wzClose();
  ToolUI.banner($id('banner'), ok ? 'success' : 'warn',
    ok ? name + ' に切り出しました（元の行にリンクを残しました）'
       : name + ' は作りましたが、元の行へのリンクは付けられませんでした（［再読込］して確認してください）');
}

async function wzWriteInto(it) {
  if (!dirHandle) { wzError('先に［📂 04_Issues を開く］でフォルダを選んでください'); return; }
  try {
    const fh = await dirHandle.getFileHandle(it.file);
    const cur = await (await fh.getFile()).text();
    if (nfc(cur) !== nfc(it.text)) {
      wzError('Obsidian 側で変更されています。［再読込］してからもう一度お願いします（上書きは避けました）');
      return;
    }
    const merged = mergeFrame(cur, buildMd(draft));   // 置き換えではなく重ねる（IS-Q27）
    let next = merged.text;
    if (it.hasFrontmatter) next = setFrontmatter(next, { deadline: draft.issueDue || '' });
    const w = await fh.createWritable();
    await w.write(next);
    await w.close();
    wzClose();
    ToolUI.banner($id('banner'), 'success', it.title + ' に問いを立てました（書き殴りはそのままです'
      + (merged.kept ? '・前からあった ' + merged.kept + ' 行は残しました' : '') + '）');
    await loadIssues(false);
  } catch (e) {
    wzError('書き込めませんでした: ' + errText(e));
  }
}

function wzOpen() {
  $id('wizard').hidden = false;
  wzRender();
  const first = $id('wz-body').querySelector('textarea, input, select');
  if (first) first.focus();
}
function wzClose() { $id('wizard').hidden = true; }   // 下書きは残す（非破壊 = IME ガード不要）

$id('wizard-btn').addEventListener('click', function () { wzTarget = null; wzOpen(); });
$id('wz-close').addEventListener('click', wzClose);
$id('wz-prev').addEventListener('click', () => { if (wzStep > 0) { wzStep--; wzRender(); } });
$id('wz-next').addEventListener('click', () => {
  const err = wzValidate(wzStep);
  if (err) { wzError(err); return; }
  if (wzStep < WZ.length - 1) { wzStep++; wzRender(); }
});
$id('wz-create').addEventListener('click', async () => {
  for (const st of [0, 1, 2]) {
    const err = wzValidate(st);
    if (err) { wzStep = st; wzRender(); wzError(err); return; }
  }
  if (wzTarget && wzTarget.kind === 'line') { await wzSpinOff(wzTarget); return; }
  if (wzTarget) { await wzWriteInto(wzTarget); return; }   // 既存ノートの先頭へ差し込む
  $id('input').value = buildMd(draft);
  $id('deadline').value = draft.issueDue || '';
  $id('title').value = draft.title || '';
  updateSampleBtn();
  scheduleSave();
  wzClose();
  await createNote(draft.project);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$id('close-modal').hidden) { e.preventDefault(); closeCloseModal(); return; }
  if (!$id('wizard').hidden) { e.preventDefault(); wzClose(); }
});

