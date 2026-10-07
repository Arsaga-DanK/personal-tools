'use strict';
/* web/taskboard/timeline.js — タイムラインの描画（目盛り・セクション・矢印）とバーのドラッグ
   入口: web/taskboard.html（このファイルは単独では動かない）。読み込み順は入口の <script src> の並びが正本で、
   前のファイルの宣言だけを読み込み時に使ってよい（分割の規約: docs/coding-rules.md「ファイルの分割」）。 */

/* ---------- 計画ビュー（タイムライン）の描画 ---------- */

// 案内・警告は #tl-note（ビュー内）に出す。共通バナー（#banner）に書くと、
// ズームの選択肢を範囲に合わせて出し入れする。**選べない理由を title に書く**
// （disabled なだけだと「なぜ選べないのか」が分からない）
function updateZoomOptions(days, effective) {
  const sel = el('f-zoom');
  for (const opt of sel.options) {
    const need = Math.ceil(TL_MIN_FIGURE_PX / TL_ZOOMS[opt.value].px);
    const ok = zoomUsable(opt.value, days);
    opt.disabled = !ok;
    opt.title = ok ? '' : 'この期間（' + days + '日）では図が細くなりすぎます（' +
      need + '日以上で選べます）';
  }
  sel.value = effective;   // 実効ズームを映す（選択そのものは state 側に残す）
}

// 直後に呼び出し側が出す「完了にしました」等の情報バナーと奪い合うため
function renderTimeline() {
  const note = el('tl-note');
  const scroll = el('tl-scroll');
  scroll.textContent = '';
  const today = todayStr();
  // 範囲はズームに依存しないので、まず日ズームで測って「選べるズーム」を決める。
  // **利用者の選択（state.ui.tlZoom）は書き換えない** — 絞り込みで範囲が縮んだ間だけ
  // 日で描き、範囲が戻れば選択も戻る。書き換えてしまうと選択が黙って失われ、
  // 「日で表示している」理由も次の再描画で消える（2026-08-07 に実測）
  const span = timelineModel(state.visibleRows, today, DAY_PX);
  const effective = zoomUsable(state.ui.tlZoom, span.days) ? state.ui.tlZoom : 'day';
  updateZoomOptions(span.days, effective);
  const z = TL_ZOOMS[effective];
  const model = timelineModel(state.visibleRows, today, z.px);
  state.timeline = model;

  const msgs = [];
  if (effective !== state.ui.tlZoom) {
    msgs.push('この期間（' + span.days + '日）では「' + TL_ZOOMS[state.ui.tlZoom].label +
      '」だと図が細くなりすぎるため「日」で表示しています');
  }
  if (model.invalidCount > 0) {
    msgs.push(model.invalidCount + '件のタスクで期限が開始日より前です（1日分のバーで表示しています）');
  }
  if (model.guard) {
    msgs.push(model.guard.reason === 'rows'
      ? '対象が' + model.guard.count + '件（上限' + model.guard.limit +
        '件）のためタイムラインを表示しません。セクションやタグで絞り込んでください'
      // 日数ではなく描画幅で判定するので、**ズームを変えれば表示できる**ことを案内する
      : '表示期間が長すぎてタイムラインを表示できません（' + model.guard.count +
        '日・ズーム: ' + z.label + '）。ズームを「月」にするか、セクション・タグで絞り込んでください');
  } else if (!model.items.length) {
    if (!state.visibleRows.length) {
      msgs.push(String(state.ui.q || '').trim() !== ''
        ? '一致するタスクがありません（検索: ' + state.ui.q.trim() + '）'
        : '表示できるタスクがありません（絞り込みを確認してください）');
    } else {
      msgs.push('開始日（🛫）を設定したタスクがここに並びます — リストビューの開始日セルを' +
        'クリックして設定できます' +
        (state.ui.section || state.ui.tag ? '（絞り込みで隠れている行があるかもしれません）' : ''));
    }
  } else if (!model.todayIn) {
    msgs.push('今日（' + today + '）は表示範囲外です');
  }
  const warn = !!model.guard || model.invalidCount > 0;
  ToolUI.banner(note, warn ? 'warn' : 'info', msgs.join(' / '));   // 空なら hidden になる
  if (model.guard || !model.items.length) return; // 一部のみ表示はしない（理由だけ出す）

  const px = z.px;
  const width = model.days * px;
  const head = document.createElement('div');
  head.className = 'tl-head';
  const headLabel = document.createElement('div');
  headLabel.className = 'tl-label muted';
  headLabel.textContent = model.from + ' 〜 ' + model.to;
  headLabel.style.cursor = 'default';
  head.appendChild(headLabel);
  const ticks = document.createElement('div');
  ticks.className = 'tl-ticks';
  ticks.style.width = width + 'px';
  for (const tk of tlTicks(model, z)) {
    const tick = document.createElement('div');
    tick.className = 'tl-tick';
    tick.style.left = (tk.day * px) + 'px';
    tick.textContent = tk.text;
    ticks.appendChild(tick);
  }
  head.appendChild(ticks);
  scroll.appendChild(head);

  const rowsEl = document.createElement('div');
  rowsEl.className = 'tl-rows';
  rowsEl.style.width = (TL_LABEL_W + width) + 'px';
  if (model.todayIn) {
    const line = document.createElement('div');
    line.className = 'tl-today';
    line.style.left = (TL_LABEL_W + diffDays(model.from, today) * px) + 'px';
    line.title = '今日（' + today + '）';
    rowsEl.appendChild(line);
  }
  // セクションごとにまとめ、見出し行を挟む（Phase T4）。
  // **items に現れないセクションは見出しも出さない**（空の帯が並ぶのを防ぐ）。
  // 行の Y は**描いた順の累算**で決める（DOM を測らない。CSS 側で全行 24px に固定してある）
  const rowY = new Map();
  let y = 0;
  for (const g of tlSections(model.items)) {
    rowsEl.appendChild(renderTlSectionHead(g));
    y += TL_ROW_H;
    if (state.tlClosed.has(g.name)) continue;
    for (const it of g.items) {
      rowsEl.appendChild(renderTlRow(it, model, z, today));
      rowY.set(it.line, y + TL_ROW_H / 2);
      y += TL_ROW_H;
    }
  }
  const arrowNote = renderArrows(rowsEl, model, z, rowY, y);
  if (arrowNote) {
    msgs.push(arrowNote);
    note.className = 'banner banner-warn';
    note.setAttribute('role', 'alert');
    note.textContent = msgs.join(' / ');
    note.hidden = false;
  }
  scroll.appendChild(rowsEl);
  // キーボードで日付を変えると render でバーが作り直されるのでフォーカスを戻す
  if (tlFocusLine !== null) {
    const b = scroll.querySelector('.tl-bar[data-line="' + tlFocusLine + '"]');
    tlFocusLine = null;
    if (b) b.focus();
  }
  // 初回表示だけ「今日」が見える位置（左から1/3）までスクロールする（TB-R24）。
  // 以後の再描画（ドラッグ・編集）では利用者のスクロール位置を動かさない
  if (!tlAutoScrolled) {
    tlAutoScrolled = true;
    if (model.todayIn) {
      const todayX = TL_LABEL_W + diffDays(model.from, today) * px;
      scroll.scrollLeft = Math.max(0, todayX - scroll.clientWidth / 3);
    }
  }
}

// 目盛り。day/week は日付、month は月初に「N月」
function tlTicks(model, z) {
  const out = [];
  if (z.tick === 'month') {
    for (let d = 0; d < model.days; d++) {
      const ymd = addDays(model.from, d);
      if (ymd.slice(8, 10) !== '01') continue;
      out.push({ day: d, text: Number(ymd.slice(5, 7)) + '月' });
    }
    return out;
  }
  // 日付の目盛りは**ラベルが重ならない最小の刻み**を選ぶ。
  // 刻みは px/日だけで決まる（範囲の長さには依存しない）ので、
  // 決め手は**その範囲に出るラベルの最大幅**になる。
  // 実測（11px フォント・padding 3px 込み・2026-08-07）:
  //   `8/3`=21.5px / `8/10`=26.7px / `11/24`=31.4px / `12/29`=33.1px
  // → 週ズーム（7日=28px）は1桁月なら収まり、2桁月では重なる（実際に重なる図を確認）
  for (const every of [z.every, 14, 28]) {
    const cand = [];
    let widest = 0;
    for (let d = 0; d < model.days; d += every) {
      const ymd = addDays(model.from, d);
      const text = Number(ymd.slice(5, 7)) + '/' + Number(ymd.slice(8, 10));
      widest = Math.max(widest, tickWidth(text));
      cand.push({ day: d, text: text });
    }
    if (every * z.px >= widest + TICK_GAP_PX || every === 28) return cand;
  }
  return out;
}

/* ラベル幅の見積り。実測（11px フォント・padding 3px 込み・2026-08-07）:
     `8/3`=21.5px `8/10`=26.7px `10/4`=26.7px `11/24`=31.4px `12/29`=33.1px
   → 3 + 文字数 × 6.0 でほぼ一致する。
   **必要なのは「間隔に収まること」だけ**（すきま0以上）。図で確認した境目:
     `10/4`（26.7px）は 28px に収まり読める / `11/16`（31.4px）は重なって読めない
   すきまに余裕（+2px）を要求すると、読める `10/4` まで弾いてしまう（実測して修正） */
const TICK_PAD_PX = 3, TICK_CHAR_PX = 6.0, TICK_GAP_PX = 0;
function tickWidth(text) { return TICK_PAD_PX + text.length * TICK_CHAR_PX; }

// 出現順にセクションでまとめる（並び順は visibleRows のまま = ソート指定に従う）
function tlSections(items) {
  const groups = [];
  const byName = new Map();
  for (const it of items) {
    const name = it.section || '(セクションなし)';
    if (!byName.has(name)) {
      const g = { name, items: [] };
      byName.set(name, g);
      groups.push(g);
    }
    byName.get(name).items.push(it);
  }
  return groups;
}

function renderTlSectionHead(g) {
  const row = document.createElement('div');
  row.className = 'tl-row tl-section';
  row.dataset.section = g.name;
  const label = document.createElement('div');
  label.className = 'tl-label tl-section-label';
  const btn = document.createElement('button');
  const closed = state.tlClosed.has(g.name);
  btn.className = 'tl-section-btn';
  btn.textContent = (closed ? '▸ ' : '▾ ') + g.name + '（' + g.items.length + '）';
  btn.title = closed ? 'クリックで開く' : 'クリックで折り畳む';
  btn.setAttribute('aria-expanded', closed ? 'false' : 'true');
  btn.addEventListener('click', () => {
    if (closed) state.tlClosed.delete(g.name); else state.tlClosed.add(g.name);
    render();
  });
  label.appendChild(btn);
  row.appendChild(label);
  return row;
}

/* 依存の印（Phase T6）。タイムラインに 🛫 の無いタスクは図に出ないので、
   **依存があること自体がタイムラインだけでは分からない**（TB-Q54）。
   数字は**関係の総数**（効いていない＝先行が終わっている関係も含む。記法として
   書かれている事実は隠さない）。色を変えるのは blocked のときだけ。 */
// まだ終わっていない先行タスクの名前（警告の文言に出す）
function unfinishedPredecessors(t) {
  const g = state.depGraph;
  if (!g) return [];
  return g.live.filter(e => e.to.line === t.line)
    .map(e => e.from.displayBody || e.from.body || ('行' + e.from.line));
}

function depMark(t) {
  if (!t.dependsOn.length) return null;
  const g = state.depGraph;
  const blocked = !!(g && g.blocked.has(t.line));
  const span = document.createElement('span');
  span.className = 'dep-mark' + (blocked ? ' dep-blocked' : '');
  span.textContent = '⛔' + t.dependsOn.length;
  span.title = blocked
    ? '先行タスクが終わっていません（' + t.dependsOn.length + '件の依存）'
    : '依存 ' + t.dependsOn.length + '件（先行はすべて終わっています）';
  return span;
}

/* 依存関係の矢印（Phase T6）。**SVG を createElementNS で作る**
   （`createElement('svg')` は HTMLUnknownElement になる。file:// でも描けることは
   2026-08-07 に実測済み → docs/verification-notes.md §2）。
   座標はモデルから計算する（x は日オフセット × dayPx、y は行の累算）。
   戻り値は #tl-note に足す文言（無ければ null）。 */
const SVG_NS = 'http://www.w3.org/2000/svg';
function renderArrows(rowsEl, model, z, rowY, totalH) {
  const g = state.depGraph;
  const itemByLine = new Map(model.items.map(it => [it.line, it]));
  if (g.cycle) {
    return '依存関係が循環しています（' + g.cycle.join(' → ') + '）。矢印を表示しません';
  }
  if (g.duplicateIds.length) {
    return '同じ 🆔 が複数のタスクにあります（' + g.duplicateIds.join(', ') +
      '）。どれに依存しているか決められないため矢印を表示しません';
  }
  if (g.guard) {
    return '依存関係が' + g.guard.count + '件（上限' + g.guard.limit +
      '件）のため矢印を表示しません。セクションやタグで絞り込んでください';
  }
  // 端が図に出ていない関係は描かない（TB-Q52）。折り畳み・絞り込み・🛫 なしで起きる
  const drawable = g.live.filter(e => rowY.has(e.from.line) && rowY.has(e.to.line));
  const hidden = g.live.length - drawable.length;
  if (drawable.length) {
    const px = z.px;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tl-arrows');
    svg.setAttribute('width', String(TL_LABEL_W + model.days * px));
    svg.setAttribute('height', String(totalH));
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'tl-arrowhead');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const tip = document.createElementNS(SVG_NS, 'path');
    tip.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
    tip.setAttribute('fill', 'currentColor');
    marker.appendChild(tip);
    defs.appendChild(marker);
    svg.appendChild(defs);
    for (const e of drawable) {
      const fi = itemByLine.get(e.from.line), ti = itemByLine.get(e.to.line);
      const x1 = TL_LABEL_W + (diffDays(model.from, fi.end) + 1) * px;  // 先行の右端
      const x2 = TL_LABEL_W + diffDays(model.from, ti.start) * px;      // 後続の左端
      const y1 = rowY.get(e.from.line), y2 = rowY.get(e.to.line);
      const c = Math.min(40, Math.max(12, Math.abs(x2 - x1) / 2));
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + (x1 + c) + ',' + y1 +
        ' ' + (x2 - c) + ',' + y2 + ' ' + x2 + ',' + y2);
      path.setAttribute('class', 'tl-arrow' + (g.blocked.has(e.to.line) ? ' tl-arrow-blocked' : ''));
      path.setAttribute('marker-end', 'url(#tl-arrowhead)');
      path.dataset.from = String(e.from.line);
      path.dataset.to = String(e.to.line);
      svg.appendChild(path);
    }
    rowsEl.insertBefore(svg, rowsEl.firstChild);
  }
  const notes = [];
  if (hidden) notes.push(hidden + ' 本の依存は表示範囲外のタスクへ繋がっています');
  if (g.unresolved) notes.push('解決できない依存が' + g.unresolved + ' 件あります（🆔 が見つかりません）');
  return notes.length ? notes.join(' / ') : null;
}

/* ---------- バーのドラッグで日付変更（Phase T4・pointer events） ----------
   HTML5 DnD は離散的なドロップ先向けの API なので使わない（連続位置＋日スナップが要件）。
   2026-08-07 の実測で確定した3点:
     1) setPointerCapture は file:// でも動く（バー外へ出ても pointermove が届く）
     2) **ドラッグの後にも click が飛ぶ** → 抑止しないと毎回計画ポップオーバーが開く
     3) bar.style.left は CSS 由来の値を読めない → **日付（モデル）から計算する**
   端ハンドルの出し方（TB-Q45 条件付き承認）: 中央を掴む余地（7px）を必ず残す。
     両端 = 幅 21px 以上（7+7+7）／📅 なしのバーは右だけ = 幅 14px 以上（7+7）。
   これ未満は端ドラッグを出さない（「できるように見えて不定」より「できないと分かる」）。 */
// ハンドルの幅は**この1箇所だけ**が持つ（CSS には書かない）。閾値もここから導く:
// 両端を出すには「左7 + 中央7 + 右7」、右だけなら「中央7 + 右7」が必要
const TL_EDGE_PX = 7;
const TL_MIN_BOTH_EDGES = TL_EDGE_PX * 3;   // 21px
const TL_MIN_ONE_EDGE = TL_EDGE_PX * 2;     // 14px
let tlDrag = null;         // ドラッグ中の状態
let tlJustDragged = false; // 直後の click を捨てるための印
let tlFocusLine = null;    // キーボード操作後にフォーカスを戻す行
let tlAutoScrolled = true; // 初回表示の「今日へスクロール」を1回に制限（ビュー切替・読込でリセット）

function attachBarDrag(bar, it, model, z, barW) {
  const edges = [];
  if (it.hasDue && barW >= TL_MIN_BOTH_EDGES) edges.push('start', 'due');
  else if (!it.hasDue && barW >= TL_MIN_ONE_EDGE) edges.push('due');  // 右へ伸ばすと 📅 を新設
  for (const edge of edges) {
    const h = document.createElement('div');
    h.className = 'tl-handle tl-handle-' + (edge === 'start' ? 'l' : 'r');
    h.style.width = TL_EDGE_PX + 'px';   // 幅の正本は TL_EDGE_PX（CSS と二重に持たない）
    h.dataset.edge = edge;
    h.title = edge === 'start' ? '左右にドラッグして開始日を変更' : '左右にドラッグして期限を変更';
    bar.appendChild(h);
  }
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || tlDrag) return;
    tlJustDragged = false;   // 前のドラッグの残りが次の click を飲まないように必ず捨てる
    const mode = (e.target.dataset && e.target.dataset.edge) || 'move';
    e.preventDefault();   // 画像ドラッグ・テキスト選択を止める
    const track = bar.parentNode;
    const tip = document.createElement('div');
    tip.className = 'tl-drag-tip';
    track.appendChild(tip);
    tlDrag = {
      mode, line: it.line, start: it.start, due: it.hasDue ? it.due : null, hasDue: it.hasDue,
      startX: e.clientX, px: z.px, snap: z.snap, from: model.from,
      bar, tip, pointerId: e.pointerId, step: 0, raf: 0,
      newStart: it.start, newDue: it.hasDue ? it.due : null,
      origLeft: bar.style.left, origWidth: bar.style.width,
    };
    try { bar.setPointerCapture(e.pointerId); } catch (_) {}
    bar.classList.add('tl-dragging');
    paintDrag(tlDrag);
  });
  bar.addEventListener('pointermove', (e) => {
    const d = tlDrag;
    if (!d || d.bar !== bar) return;
    const step = Math.round(((e.clientX - d.startX) / d.px) / d.snap) * d.snap;
    if (step === d.step) return;
    d.step = step;
    computeDragDates(d);
    // 1フレーム1回だけ描く（pointermove は毎ピクセル飛んでくる）
    if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; paintDrag(d); });
  });
  bar.addEventListener('pointerup', () => finishDrag());
  bar.addEventListener('pointercancel', () => cancelDrag());
  bar.addEventListener('keydown', (e) => onBarKey(e, it));
}

// 逆転（📅 < 🛫）は作らせない。**クランプして止める**（拒否して何もしないより操作が分かる）
function computeDragDates(d) {
  if (d.mode === 'move') {
    d.newStart = addDays(d.start, d.step);
    d.newDue = d.hasDue ? addDays(d.due, d.step) : null;
    return;
  }
  if (d.mode === 'start') {
    let s = addDays(d.start, d.step);
    if (d.hasDue && s > d.due) s = d.due;
    d.newStart = s;
    d.newDue = d.due;
    return;
  }
  // due: 📅 が無いバーは開始日から右へ伸ばして 📅 を新設する（左へは何もしない）
  if (!d.hasDue && d.step <= 0) { d.newStart = d.start; d.newDue = null; return; }
  let u = addDays(d.hasDue ? d.due : d.start, d.step);
  if (u < d.start) u = d.start;
  d.newStart = d.start;
  d.newDue = u;
}

// 何日動かしたかを添える。**モードごとに何の差分かが変わる**ので言葉も変える
// （クランプされた場合も「実際に動いた分」が出る。要求値ではなく結果を書く）
function dragDelta(d) {
  if (d.mode === 'due') {
    if (!d.newDue) return 0;
    return diffDays(d.due || d.start, d.newDue);
  }
  return diffDays(d.start, d.newStart);
}
const DELTA_LABEL = { move: 'ずらす', start: '開始', due: '期限' };
function paintDrag(d) {
  const end = d.newDue || d.newStart;
  const left = diffDays(d.from, d.newStart) * d.px;
  d.bar.style.left = left + 'px';
  d.bar.style.width = Math.max(d.px, (diffDays(d.newStart, end) + 1) * d.px) + 'px';
  const n = dragDelta(d);
  const delta = n === 0 ? '' : (d.mode === 'move'
    ? '・' + (n > 0 ? '+' : '') + n + '日' + DELTA_LABEL.move
    : '・' + DELTA_LABEL[d.mode] + ' ' + (n > 0 ? '+' : '') + n + '日');
  d.tip.textContent = '🛫 ' + d.newStart +
    (d.newDue ? ' → 📅 ' + d.newDue + '（' + (diffDays(d.newStart, d.newDue) + 1) + '日）' : '（期限なし）') +
    delta;
  placeTip(d, left);
}

/* 吹き出しの横位置。**バーの右横 → 入らなければ左横 → それも無理なら可視域に抑える**。
   最後の抑え込みではバーに重なるが、吹き出しは不透明な背景と枠を持つので読める。
   判定は**図の幅ではなく画面に見えている範囲**で行う（図が狭いときに「右に入らない」と
   誤判定して左へ回り込むのを防ぐ。2026-08-07 に F10（図288px）で実測して修正）。
   ラベル列は sticky で図の左側に重なるので、可視域から差し引く。
   文字が変わると幅も変わるので毎回測り直す */
const TL_TIP_GAP = 6;
function placeTip(d, barLeft) {
  const barW = parseFloat(d.bar.style.width);
  const tipW = d.tip.offsetWidth;
  const sc = el('tl-scroll');
  const viewL = sc.scrollLeft;                                  // トラック座標での可視左端
  const viewR = sc.scrollLeft + sc.clientWidth - TL_LABEL_W;    // 同・可視右端
  let x = barLeft + barW + TL_TIP_GAP;                          // 右横
  if (x + tipW > viewR) x = barLeft - tipW - TL_TIP_GAP;        // 入らなければ左横へ反転
  if (x < viewL) x = Math.max(viewL, Math.min(barLeft, viewR - tipW));  // それも無理なら可視域へ
  d.tip.style.left = x + 'px';
}

function closeDrag(d) {
  if (d.raf) cancelAnimationFrame(d.raf);
  d.bar.classList.remove('tl-dragging');
  if (d.tip.parentNode) d.tip.parentNode.removeChild(d.tip);
  try { d.bar.releasePointerCapture(d.pointerId); } catch (_) {}
}

function finishDrag() {
  const d = tlDrag;
  if (!d) return;
  tlDrag = null;
  closeDrag(d);
  const ops = [];
  if (d.newStart !== d.start) ops.push({ type: 'setStart', line: d.line, date: d.newStart });
  if ((d.newDue || null) !== (d.due || null)) ops.push({ type: 'setDue', line: d.line, date: d.newDue });
  // 変化0日はクリック扱い（プレビューは元位置に戻っているので描き直さない）
  if (!ops.length) return;
  tlJustDragged = true;
  if (applyUiOps(ops)) {
    showBanner('info', (d.mode === 'start' ? '開始日' : (d.mode === 'due' ? '期限' : '日程')) +
      'を変更しました: 🛫 ' + d.newStart + (d.newDue ? ' / 📅 ' + d.newDue : '') +
      '（ファイルへは保存時に反映）');
  }
}

function cancelDrag() {
  const d = tlDrag;
  if (!d) return;
  tlDrag = null;
  d.bar.style.left = d.origLeft;      // 元の日付の位置へ戻す（op は出さない）
  d.bar.style.width = d.origWidth;
  closeDrag(d);
  tlJustDragged = true;               // Escape 直後の click で popover を開かせない
}

function onBarKey(e, it) {
  if (isComposingKey(e)) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const t = state.doc.tasks.find(x => x.line === it.line);
    if (t) openPlanPopover(e.currentTarget, t);
    return;
  }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;   // ボードの Cmd/Ctrl+←→ と衝突させない
  e.preventDefault();
  const delta = e.key === 'ArrowRight' ? 1 : -1;
  tlFocusLine = it.line;              // render でバーが作り直されるのでフォーカスを戻す
  if (e.shiftKey) {                   // 期限だけ伸縮（📅 が無ければ右で新設）
    if (!it.hasDue && delta < 0) return;
    let u = addDays(it.hasDue ? it.due : it.start, delta);
    if (u < it.start) u = it.start;
    if (it.hasDue && u === it.due) return;
    applyUiOps([{ type: 'setDue', line: it.line, date: u }]);
    return;
  }
  const ops = [{ type: 'setStart', line: it.line, date: addDays(it.start, delta) }];
  if (it.hasDue) ops.push({ type: 'setDue', line: it.line, date: addDays(it.due, delta) });
  applyUiOps(ops);
}

function renderTlRow(it, model, z, today) {
  const px = z.px;
  const row = document.createElement('div');
  row.className = 'tl-row';
  row.dataset.line = it.line;
  const label = document.createElement('div');
  label.className = 'tl-label';
  label.textContent = '　'.repeat(it.indent) + (it.indent > 0 ? '└ ' : '') + it.body;
  const track = document.createElement('div');
  track.className = 'tl-track';
  track.style.width = (model.days * px) + 'px';
  const bar = document.createElement('div');
  bar.className = 'tl-bar tl-bar-' + it.state;
  const barW = Math.max(px, (diffDays(it.start, it.end) + 1) * px);
  bar.style.left = (diffDays(model.from, it.start) * px) + 'px';
  bar.style.width = barW + 'px';
  bar.dataset.line = it.line;
  bar.tabIndex = 0;   // ドラッグを唯一の手段にしない（←→ で日付を変えられる）
  // 完了率（子を持つタスクだけ）。塗り＋数値。16px のバーでは数値が読めないので塗りも出す
  if (it.progress) {
    const fill = document.createElement('div');
    fill.className = 'tl-bar-fill';
    fill.style.width = it.progress.pct + '%';
    bar.appendChild(fill);
  }
  // 幅に収まらない文字は書かない（`19日 · 1/2（50` のような切れた文字はノイズになる）。
  // 情報は title と、完了率の塗りが担う。閾値は 11px フォントでの実測
  const text = document.createElement('span');
  text.className = 'tl-bar-text';
  const parts = [];
  if (barW >= 34 && it.days) parts.push(it.days + '日');
  if (barW >= 96 && it.progress) {
    parts.push(it.progress.done + '/' + it.progress.total + '（' + it.progress.pct + '%）');
  }
  text.textContent = parts.join(' · ');
  bar.appendChild(text);
  const tip = '開始 ' + it.start +
    (it.hasDue ? ' 〜 期限 ' + it.due + '（' + it.days + '日）' : ' 〜 期限なし') +
    (it.section ? '・' + it.section : '') +
    (it.progress ? '・子タスク ' + it.progress.done + '/' + it.progress.total + ' 完了' : '') +
    (it.inverted ? '・期限（' + it.due + '）が開始日より前です' : '');
  bar.title = tip + '（ドラッグで日付変更・←→ でも移動・ダブルクリックで編集）';
  label.title = it.body + ' — ' + tip + '（ダブルクリックで編集）';
  // バーは 📅 が無いと1日分で小さいので、行ラベルからも同じ操作を開ける
  const openPlan = () => {
    const t = state.doc.tasks.find(x => x.line === it.line);
    if (t) openPlanPopover(bar, t);
  };
  bar.addEventListener('click', () => {
    if (tlJustDragged) { tlJustDragged = false; return; }  // ドラッグ後の click は捨てる（実測）
    openPlan();
  });
  label.addEventListener('click', openPlan);
  // ダブルクリック → 編集モーダル（リストの内容セルと同じイディオム — TB-R23）。
  // 直前の click 2回で開いた計画ポップオーバーは閉じてから
  const openEdit = () => {
    const t = state.doc.tasks.find(x => x.line === it.line);
    if (!t) return;
    closePopover();
    openTaskModal('edit', t);
  };
  bar.addEventListener('dblclick', openEdit);
  label.addEventListener('dblclick', openEdit);
  if (!it.hasCR) attachBarDrag(bar, it, model, z, barW);
  track.appendChild(bar);
  row.appendChild(label);
  row.appendChild(track);
  return row;
}

// 列構成がビューで変わるので、気づけるようにラベルも変える。
// ラベルは短く保ち（長くするとツールバーが折り返して保存ボタンの位置が動く）、
// 列の内訳は title で示す。copyFeedback が復元に使う dataset.label も同時に更新する
const COPY_LABELS = {
  list: { text: 'Excel用コピー', title: '表示中の行を TSV でコピー（状態・内容・開始日・期限・優先度・タグ・セクション）' },
  // ボードはリストと同じ行集合の別表示なので列も同じ
  board: { text: 'Excel用コピー', title: '表示中の行を TSV でコピー（状態・内容・開始日・期限・優先度・タグ・セクション）' },
  timeline: { text: '計画をコピー', title: '図の行を TSV でコピー（内容・開始日・期限・日数・状態・セクション）' },
};
function updateCopyButton() {
  const b = el('btn-copy');
  const cfg = COPY_LABELS[state.ui.view] || COPY_LABELS.list;
  ToolUI.setLabel(b, cfg.text);   // .copied 中は表示を奪わない（共通核が守る）
  b.title = cfg.title;
  // 受け渡しはタイムライン（計画）のときだけ意味がある（coding-rules「ツール間の受け渡し」）
  el('btn-to-gantt').hidden = state.ui.view !== 'timeline';
  el('btn-copy').hidden = state.ui.view === 'archive';   // アーカイブの表示にはコピーするものが無い（TB-AV1）
}

function updateSaveButton() {
  const btn = el('btn-save');
  if (state.demo) {
    btn.hidden = false; btn.textContent = '保存（デモ中は無効）'; btn.disabled = true; return;
  }
  const c = state.loaded ? diffCounts(state.lines) : { changed: 0, added: 0 };
  const n = c.changed + c.added;
  const base = (!fsaAvailable() && state.adapter && state.adapter.mode === 'fallback')
    ? '保存（ダウンロード）' : '今すぐ保存';
  // バッジは行単位の差分件数。有効・無効は isDirty() で判定する
  // （セクション移動は行内容が変わらず件数0になるため、件数で判定すると保存できなくなる）
  btn.textContent = n > 0 ? base + '（' + n + '）' : base;
  btn.disabled = !isDirty();
  // **自動保存が効いているので、未保存が残っているときだけ見せる**（＝未保存インジケータ）。
  // 自動保存をスキップしたとき（一括完了・fallback）はここが出たままになり、逃げ道が見える
  btn.hidden = !isDirty();
}

