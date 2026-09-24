/* lib/launcher.js — 引き出し式のツールメニュー。classic script、window.ToolLauncher を公開。
   **lib/ui.js → lib/storage.js → lib/tools.js の後**に読む（ToolsList を使う。ToolStorage は任意）。

   なぜ作ったか（2026-09-24）: 2026-08-18 の使用実態診断で「16本のうち11本が貼るから始まるのに
   ツール間リンクが0本」と分かり、ハブ側（データから探す／リンク集）で手を打ったが、
   **どれもハブを経由する前提**だった。利用者の指摘「毎回 TOP に戻ってツールを選び直すのめんどくさい」
   はそこを突いている。**ツールからツールへ直接行ける経路**をこれが担う。

   既定は閉じているので 2ペイン系の横幅を奪わない（常時表示の列にしなかった理由）。
   出力: window.ToolLauncher = { mount, open, close, isOpen, render } */
(function (global) {
  'use strict';

  var doc = global.document;
  var overlay = null, panel = null, listEl = null, qEl = null, btn = null;

  function mk(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function items() {
    return Array.prototype.slice.call(listEl.querySelectorAll('a.launcher-item'));
  }

  // 1件分のリンク。**押したら「最近使った」に記録してから遷移**（ハブ経由と同じ履歴を育てる）
  function itemLink(t, current) {
    var a = mk('a', 'launcher-item');
    a.href = global.ToolsList.hrefFor(t.path);
    a.dataset.alias = t.alias;
    a.title = t.desc + (t.when ? ' — ' + t.when : '');
    if (t.alias === current) a.setAttribute('aria-current', 'page');
    a.appendChild(mk('span', 'launcher-icon', t.icon || '•'));
    var body = mk('span', 'launcher-text');
    body.appendChild(mk('span', 'launcher-name', t.name));
    body.appendChild(mk('span', 'launcher-short', t.short || ''));
    a.appendChild(body);
    a.addEventListener('click', function () { global.ToolsList.recordUse(t.alias); });
    return a;
  }

  function group(title) {
    var h = mk('p', 'launcher-group', title);
    listEl.appendChild(h);
  }

  function render(q) {
    var L = global.ToolsList;
    listEl.textContent = '';
    var current = L.currentAlias();
    var hits = L.filter(q || '');

    if (hits.length === 0) {
      listEl.appendChild(mk('p', 'launcher-empty', '該当なし'));
      return;
    }
    // 検索中はカテゴリで割らずヒット順に出す（絞り込んだのに見出しで分断されると読みにくい）
    if (q) {
      for (var i = 0; i < hits.length; i++) listEl.appendChild(itemLink(hits[i], current));
      return;
    }
    var rec = L.recent().filter(function (a) { return a !== current; });
    if (rec.length) {
      group('最近使った');
      for (var r = 0; r < rec.length; r++) {
        var t = L.TOOLS.filter(function (x) { return x.alias === rec[r]; })[0];
        if (t) listEl.appendChild(itemLink(t, current));
      }
    }
    var cats = L.CATEGORY_ORDER.concat(
      L.TOOLS.map(function (t) { return t.category; })
        .filter(function (c) { return L.CATEGORY_ORDER.indexOf(c) === -1; }));
    var seen = {};
    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c];
      if (seen[cat]) continue;
      seen[cat] = true;
      var inCat = L.TOOLS.filter(function (t) { return t.category === cat; });
      if (!inCat.length) continue;
      group(cat);
      for (var k = 0; k < inCat.length; k++) listEl.appendChild(itemLink(inCat[k], current));
    }
  }

  function isOpen() { return !!overlay && !overlay.hidden; }

  function open() {
    if (!overlay) return;
    overlay.hidden = false;
    qEl.value = '';
    render('');
    qEl.focus();
  }
  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (btn) btn.focus();     // 開いた場所へ戻す
  }

  function build() {
    overlay = mk('div', 'launcher-overlay');
    overlay.id = 'tool-launcher';
    overlay.hidden = true;
    panel = mk('nav', 'launcher');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'ツール一覧');

    qEl = doc.createElement('input');
    qEl.type = 'search';
    qEl.id = 'launcher-q';
    qEl.className = 'launcher-q';
    qEl.placeholder = 'ツールを検索（Enter で先頭を開く）';
    qEl.autocomplete = 'off';
    panel.appendChild(qEl);

    listEl = mk('div', 'launcher-list');
    listEl.id = 'launcher-list';
    panel.appendChild(listEl);

    var hub = mk('a', 'launcher-hub', 'ハブを開く（データから探す・最近使った）');
    hub.href = global.ToolsList.hubHref();
    panel.appendChild(hub);

    overlay.appendChild(panel);
    doc.body.appendChild(overlay);

    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    qEl.addEventListener('input', function () { render(qEl.value); });
    qEl.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;    // IME 中は奪わない（coding-rules）
      if (e.key === 'Enter') {
        var first = items()[0];
        if (first) { e.preventDefault(); first.click(); global.location.href = first.href; }
      } else if (e.key === 'ArrowDown') {
        var f = items()[0];
        if (f) { e.preventDefault(); f.focus(); }
      }
    });
    listEl.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var all = items();
      var i = all.indexOf(doc.activeElement);
      e.preventDefault();
      if (e.key === 'ArrowUp' && i <= 0) { qEl.focus(); return; }
      var next = all[e.key === 'ArrowDown' ? i + 1 : i - 1];
      if (next) next.focus();
    });
  }

  /* `.tool-header` の先頭にボタンを足す。ハブ（index.html）には置かない
     （そこが一覧そのものなので、開く先が自分自身になる） */
  function mount() {
    if (!global.ToolsList) return false;
    var header = doc.querySelector('.tool-header');
    if (!header || overlay) return false;
    build();
    btn = mk('button', 'launcher-btn', '☰ ツール');
    btn.type = 'button';
    btn.id = 'launcher-btn';
    btn.title = 'ツールを切り替える (Cmd/Ctrl+K)';
    btn.addEventListener('click', function () { (isOpen() ? close : open)(); });
    header.insertBefore(btn, header.firstChild);

    doc.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        (isOpen() ? close : open)();
        return;
      }
      // Esc は開いているときだけ奪う（各ツールの Esc を壊さない）
      if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close(); }
    });
    return true;
  }

  global.ToolLauncher = { mount: mount, open: open, close: close, isOpen: isOpen, render: render };
})(window);
