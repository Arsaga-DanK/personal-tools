'use strict';
/* lib/ui.js — 全ブラウザツール共通の UI 部品
   目的: 「バナーの見た目と ARIA」「クリップボードへ書く」の2つだけを共通化する
   入力: なし（DOM 要素を引数で受け取る）
   出力: window.ToolUI = { banner, copy, feedback, setLabel, initBanners, mountModeSwitch, COPY_FEEDBACK_MS,
                           nowStrip(box, spec), flash(el) }
   例:   ToolUI.banner(el('banner'), 'warn', '保存できませんでした');
         ToolUI.copy(text).then(ok => ToolUI.feedback(btn, ok ? '✓ コピーしました' : '…'));

   classic script（ES モジュールは file:// で CORS エラーになる。CLAUDE.md の制約）。
   ツール側の inline <script> より前に読み込むこと。

   **範囲をこの2つに限定している理由**（2026-08-07 のリファクタ監査 R2-1 / R2-2）:
   showBanner は5ツールに5版あり、シグネチャが全部違う（(kind,text) / (warnings[]) /
   (msg,kind) / (kind,text,actions)）。全部を1つの関数に畳むと呼び出し側の大規模な
   書き換えになり、挙動の差（excel2md の配列受け取り、norm の banner-error、
   taskboard の actions ボタン）も潰れる。
   そこで**共通核は「class + role + textContent + hidden」だけ**を持ち、
   引数の吸収は各ツールのラッパ（従来の showBanner）に残す。 */

(function (global) {
  // ARIA 規約（lib/ui.css のバナー節・CM-5）:
  //   banner-info / banner-success → role="status"（polite）
  //   banner-warn / banner-error   → role="alert"（assertive）
  // **この対応表を持つのはここ1箇所だけ**にする（6ファイルに散らすと規約変更が6箇所になる）
  const ALERT_KINDS = { warn: true, error: true };

  /* バナーの共通核。引数順は (要素, 種別, 文字列) に統一する。
     従来 (msg, kind) 順だったツール（diff・norm）は、ラッパ側で入れ替えて呼ぶ
     — 同名で引数順が違う関数が同居すると、流用したときに型エラーも出ずに
     `banner-undefined` になる（監査 R6-2）。
     text が空なら隠す。**要素を返す**ので、呼び出し側は続けてボタンを足せる（taskboard）。 */
  function banner(el, kind, text) {
    el.className = 'banner banner-' + kind;
    el.setAttribute('role', ALERT_KINDS[kind] ? 'alert' : 'status');
    el.textContent = text;
    el.hidden = !text;
    return el;
  }

  const COPY_FEEDBACK_MS = 1500;   // ボタンのラベルを戻すまで（1500/1600 が混在していたので統一）

  /* ボタンのラベルを一時的に差し替えて戻す。
     **元ラベルは dataset.label に保存する**（ハードコードで戻す方式だと、
     ラベルがビューで変わるツール（excel2md・taskboard）で戻し先を間違える）。
     連打しても最後の1回で戻るよう、タイマーは要素ごとに持つ。 */
  const timers = new WeakMap();
  function feedback(btn, label, ms) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = label;
    btn.classList.add('copied');
    clearTimeout(timers.get(btn));
    timers.set(btn, setTimeout(() => {
      // **復帰時点の dataset.label を読む**（呼び出し時に控えると、表示中にラベルが
      // 変わるツール（excel2md の方向切替・taskboard のビュー切替）で古い値に戻る。
      // 2026-08-07 に excel2md の移行で実測して修正）
      btn.textContent = btn.dataset.label;
      btn.classList.remove('copied');
    }, ms === undefined ? COPY_FEEDBACK_MS : ms));
  }

  /* HTML に静的に書かれたバナーへ規約を適用する。`data-kind="error"` から
     class と role を導出するので、**markup 側に role を書かない**（書かなければ間違えない）。
     CM-5（ARIA 規約）の対応で9箇所の編集が必要だった実績への構造的対処。
     初期テキストは保つ（空なら hidden のまま）。 */
  function initBanners(root) {
    const scope = root || document;
    for (const el of scope.querySelectorAll('[data-kind]')) {
      banner(el, el.dataset.kind, el.textContent);
    }
  }

  /* ボタンの表示ラベルを変える。**コピー結果表示（.copied）中は表示を奪わない**。
     ガードを feedback 側ではなく「ラベルを設定する側」に置くのは、奪い合いが起きるのが
     **表示中に新しいラベルが来たとき**だから（excel2md の方向切替・taskboard のビュー切替）。
     dataset.label は必ず更新するので、1.5 秒後の復帰先は**新しいラベル**になる
     （2026-08-07 に excel2md で実測した回帰の構造的対処。それまでは2ツールが各自で守っていた）。 */
  function setLabel(btn, label) {
    btn.dataset.label = label;
    if (!btn.classList.contains('copied')) btn.textContent = label;
  }

  /* クリップボードへ書く。navigator.clipboard → 失敗時 textarea 選択方式
     （CLAUDE.md の規約）。**戻り値は Promise<boolean>**（true = 書けた）。
     opts.selectEl を渡すと、その要素を選択してコピーする（devpad・excel2md は
     出力欄そのものを選択して「Cmd+C してください」と案内する作りなので、
     一時 textarea を作ると選択が外れて案内が嘘になる）。 */
  function copy(text, opts) {
    const selectEl = opts && opts.selectEl;
    const fallback = () => {
      let target = selectEl, temp = null;
      if (!target) {
        temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'fixed';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        target = temp;
      }
      target.focus();
      target.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      if (temp) temp.remove();
      return ok;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
    return Promise.resolve(fallback());
  }


  /* モード切替（nav.modes）。**Cmd/Ctrl+Shift+E で相手のモードへ移る。**
     現在地は aria-current="page" で示してあるので、それ以外の最初のリンクへ飛ぶ。
     モードが3つ以上になっても「次のモードへ」として素直に拡張できる。
     Chrome が奪うキーは避けた（Cmd+Shift+M=プロフィール / Cmd+Shift+I,J=DevTools / Cmd+J=ダウンロード）。 */
  function mountModeSwitch(doc) {
    const d = doc || document;
    const nav = d.querySelector('nav.modes');
    if (!nav) return false;
    const links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    if (links.length < 2) return false;
    // 押せることを画面からも分かるようにする（覚えていなくても title で気づける）
    for (const a of links) {
      if (a.getAttribute('aria-current') !== 'page') {
        a.title = (a.textContent || '').trim() + ' へ切り替え (Cmd/Ctrl+Shift+E)';
      }
    }
    d.addEventListener('keydown', function (e) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (String(e.key).toLowerCase() !== 'e') return;
      const next = links.filter(a => a.getAttribute('aria-current') !== 'page')[0];
      if (!next) return;
      e.preventDefault();
      global.location.href = next.getAttribute('href');
    });
    return true;
  }

  /* 「いま」の欄（2026-10-02 に Plan Tasks から移設 — TB-NW・TB-LP7）。何を入れるかは各ツールが決め、ここは描くだけ。
     spec = { kinds: [{ id, label, count }], groups: { [id]: [{ parts: [{ text, cls }], title, onClick }] }, folded, onFold, empty }
     count:true の種類だけ見出しに数を出す。中身の無い種類の行は出さない。見た目は lib/ui.css の .now 一式 */
  function nowStrip(box, spec) {
    const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    box.textContent = '';
    const head = mk('div', 'now-head');
    head.appendChild(mk('span', 'now-title', 'いま'));
    for (const k of spec.kinds) {
      if (!k.count) continue;
      const c = mk('span', 'now-cnt');
      c.append(mk('span', 'now-dot k-' + k.id), k.label + ' ', mk('b', '', String((spec.groups[k.id] || []).length)));
      head.appendChild(c);
    }
    const fold = mk('button', 'now-fold', spec.folded ? 'ひらく ▾' : 'たたむ ▴');
    fold.type = 'button';
    fold.id = 'now-fold';
    fold.setAttribute('aria-expanded', String(!spec.folded));
    fold.addEventListener('click', () => spec.onFold());
    head.appendChild(fold);
    const ul = mk('ul', 'now-list');
    ul.hidden = !!spec.folded;
    for (const k of spec.kinds) {
      const list = spec.groups[k.id] || [];
      if (!list.length) continue;
      const li = mk('li', 'now-group');
      const ticks = mk('div', 'ticks');
      for (const t of list) {
        const b = mk('button', 'tick');
        b.type = 'button';
        for (const p of t.parts) b.appendChild(p.cls ? mk('span', p.cls, p.text) : document.createTextNode(p.text));
        b.title = t.title || '';
        if (t.onClick) b.addEventListener('click', t.onClick);
        ticks.appendChild(b);
      }
      li.append(mk('span', 'now-badge k-' + k.id, k.label + ' ' + list.length), ticks);
      ul.appendChild(li);
    }
    if (!ul.childNodes.length) ul.appendChild(mk('li', 'now-empty', spec.empty || '急ぎのものはありません'));
    box.append(head, ul);
  }
  // 飛んだ先の行・カードを画面の中ほどへ寄せて少し光らせる（TB-NW4・TB-LP8）。動きを減らす設定ならスクロールは瞬時
  function flash(el) {
    const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1300);
  }

  global.ToolUI = { banner, copy, feedback, setLabel, initBanners, mountModeSwitch, COPY_FEEDBACK_MS, nowStrip, flash };
})(window);
