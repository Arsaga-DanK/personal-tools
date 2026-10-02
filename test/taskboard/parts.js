'use strict';
/* test/taskboard/parts.js — 節: 共通部品へ移したもの（lib/edit.js の日付・lib/ui.js のメニュー・キー・「いま」・光らせる・lib/ui.css）
   入口: test/taskboard.js（ctx を受け取る。単独実行は node test/taskboard.js parts）
   照合する ID: TB-LP1〜LP13。期待値の正本は docs/specs/taskboard/parts.md */
const fs = require('fs');
module.exports = {
  name: 'parts',
  ids: 'TB-LP1〜LP13',
  async run(ctx) {
    const { page, context, r, eq, fileUrl, REPO, path, session, F1 } = ctx;
    // 前の節（parent の TB-MS3）がモード切替で Check Issue へ移ったまま終わるので、Plan Tasks を開き直してから始める
    await page.goto(fileUrl('web/taskboard.html'));
    await session(F1);
    // 未実装でもハーネスを止めず fail として数える（RED を見るため）。非同期の関数の中で投げても止めない
    const safe = (fn, arg) => page.evaluate(([src, a]) => {
      try { return Promise.resolve((0, eval)('(' + src + ')')(a)).catch(e => 'ERR: ' + e.message); }
      catch (e) { return 'ERR: ' + e.message; }
    }, [fn.toString(), arg]);

    /* ---------- TB-LP1・LP2: 日付の表記 ---------- */
    const lp1 = await safe(() => {
      const f = (ymd, today) => { const s = document.createElement('span'); ToolEdit.fillDate(s, ymd, today);
        return { text: s.textContent, yr: (s.querySelector('.yr') || {}).textContent || '', title: s.title }; };
      return [f('2026-08-01', '2026-08-04'), f('2027-01-05', '2026-08-04'), f('', '2026-08-04'), f('2026/8/1', '2026-08-04')];
    });
    r.check('TB-LP1（ToolEdit.fillDate: 2026/8/1(土) で今年の年は .yr・来年は 2027/1/5(火)・空は書かない・形の違う文字はそのまま）',
      eq(lp1, [{ text: '2026/8/1(土)', yr: '2026/', title: '2026-08-01' }, { text: '2027/1/5(火)', yr: '', title: '2027-01-05' },
        { text: '', yr: '', title: '' }, { text: '2026/8/1', yr: '', title: '2026/8/1' }]), JSON.stringify(lp1));
    const lp2 = await safe(() => ['2026-08-01', '2026-08-04', '2026-08-05', '2026-08-20'].map(d => ToolEdit.dueWords(d, '2026-08-04')));
    r.check('TB-LP2（ToolEdit.dueWords: 3日遅れ／今日／明日／あと16日）', eq(lp2, ['3日遅れ', '今日', '明日', 'あと16日']), JSON.stringify(lp2));

    /* ---------- TB-LP9: 移したものが Plan Tasks に残っていない ---------- */
    const lp9 = await page.evaluate((names) => names.filter(n => { try { return (0, eval)('typeof ' + n) !== 'undefined'; } catch (e) { return false; } }),
      ['fillDate', 'dueWords', 'WEEKDAYS', 'rowActionForKey', 'TYPING_SEL']);
    r.check('TB-LP9（移した関数・定数が Plan Tasks 側に残っていない）', eq(lp9, []), JSON.stringify(lp9));

    /* ---------- TB-LP10: CSS の置き場所 ---------- */
    const css = fs.readFileSync(path.join(REPO, 'lib/ui.css'), 'utf8');
    const html = fs.readFileSync(path.join(REPO, 'web/taskboard.html'), 'utf8');
    const lp10 = {
      libMissing: ['--st-late:', '--st-today:', '--st-doing:', '--st-should:', '.due-rel', '.now-badge', '@keyframes tool-flash'].filter(s => !css.includes(s)),
      tbLeft: ['--st-late:', '.now-badge', 'row-flash', '.due-rel {'].filter(s => html.includes(s)),
    };
    const stVar = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--st-late').trim());
    lp10.light = await stVar();
    await page.emulateMedia({ colorScheme: 'dark' });
    lp10.dark = await stVar();
    await page.emulateMedia({ colorScheme: null });
    r.check('TB-LP10（状態の色・日付・いま・光らせるの CSS は lib/ui.css に1つだけ・ライトでもダークでも --st-late がある）',
      eq(lp10.libMissing, []) && eq(lp10.tbLeft, []) && lp10.light !== '' && lp10.dark !== '', JSON.stringify(lp10));

    /* ---------- TB-LP3〜LP6: メニューとキー ---------- */
    const ACTS = [{ id: 'child', key: 'c', keyLabel: 'C', icon: '＋', label: '子タスクを追加' },
      { id: 'edit', key: 'e', keyLabel: 'E', icon: '✎', label: '編集' }, { id: 'delete', key: 'delete', keyLabel: 'Delete', icon: '🗑', label: '削除' }];
    const lp3 = await safe((acts) => {
      const k = (o) => { const a = ToolUI.menuKey(new KeyboardEvent('keydown', o), acts); return a ? a.id : null; };
      return [k({ key: 'e', code: 'KeyE' }), k({ key: 'い', code: 'KeyE' }), k({ key: 'E', code: 'KeyE', shiftKey: true }),
        k({ key: 'e', code: 'KeyE', metaKey: true }), k({ key: 'e', code: 'KeyE', ctrlKey: true }), k({ key: 'e', code: 'KeyE', altKey: true }),
        k({ key: 'e', code: 'KeyE', isComposing: true }), k({ key: 'Delete', code: 'Delete' }), k({ key: 'Backspace', code: 'Backspace' }), k({ key: 'x', code: 'KeyX' })];
    }, ACTS);
    r.check('TB-LP3（ToolUI.menuKey: キーの位置で見る・日本語入力・大文字は効く／修飾キー・変換中は効かない／Delete と Backspace は削除）',
      eq(lp3, ['edit', 'edit', 'edit', null, null, null, null, 'delete', 'delete', null]), JSON.stringify(lp3));
    const lp4 = await safe(() => {
      const mk = (tag, type) => { const e = document.createElement(tag); if (type) e.type = type; return e; };
      const ce = document.createElement('div'); ce.contentEditable = 'true';
      return [mk('input', 'text'), mk('input', 'search'), mk('input', 'checkbox'), mk('input', 'radio'), mk('input', 'button'),
        mk('textarea'), mk('select'), mk('button'), ce, document.body, null].map(e => ToolUI.isTyping(e));
    });
    r.check('TB-LP4（ToolUI.isTyping: 文字を打つ部品だけ true）',
      eq(lp4, [true, true, false, false, false, true, true, false, true, false, false]), JSON.stringify(lp4));
    const lp5 = await safe(async (acts) => {
      const picked = [];
      const m = ToolUI.menu(acts, a => picked.push(a.id));
      document.body.appendChild(m);
      await new Promise(res => setTimeout(res, 20));
      const items = Array.from(m.querySelectorAll('[role=menuitem]'));
      const at = () => items.indexOf(document.activeElement);
      const key = k => m.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      const out = { role: m.getAttribute('role'), cls: m.className, itemCls: items.map(b => b.className),
        labels: items.map(b => b.querySelector('.rm-icon').textContent + '|' + b.querySelector('.rm-label').textContent + '|' + b.querySelector('kbd').textContent),
        first: at() };
      key('ArrowUp'); out.up = at();
      key('ArrowDown'); out.down = at();
      items[1].click(); out.picked = picked;
      m.remove();
      return out;
    }, ACTS);
    r.check('TB-LP5（ToolUI.menu: 役割と項目・開いた直後は1つ目・↑で最後へ回る・↓で1つ目・押すと onPick）',
      lp5.role === 'menu' && lp5.cls === 'row-menu' && eq(lp5.itemCls, ['row-menu-item', 'row-menu-item', 'row-menu-item'])
      && eq(lp5.labels, ['＋|子タスクを追加|C', '✎|編集|E', '🗑|削除|Delete']) && lp5.first === 0 && lp5.up === 2 && lp5.down === 0
      && eq(lp5.picked, ['edit']), JSON.stringify(lp5));
    const lp6 = await safe(() => {
      window.scrollTo(0, 0);
      const pop = document.createElement('div'); pop.style.position = 'absolute'; pop.style.width = '200px'; pop.style.height = '150px';
      document.body.appendChild(pop);
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const at = (x, y) => { ToolUI.placeAt(pop, ToolUI.pointRect(x, y)); const rc = pop.getBoundingClientRect(); return [Math.round(rc.left), Math.round(rc.top)]; };
      const out = { mid: at(100, 100), right: at(vw - 10, 100), bottom: at(100, vh - 10), vw, vh };
      pop.remove();
      return out;
    });
    r.check('TB-LP6（ToolUI.placeAt: ポインタの下・右端は内側へ押し戻す・下端はポインタの上側へ）',
      eq(lp6.mid, [100, 104]) && lp6.right[0] === lp6.vw - 208 && lp6.bottom[1] === lp6.vh - 10 - 154, JSON.stringify(lp6));
    /* ---------- TB-LP11: メニューの CSS の置き場所 ---------- */
    const css2 = fs.readFileSync(path.join(REPO, 'lib/ui.css'), 'utf8');
    const html2 = fs.readFileSync(path.join(REPO, 'web/taskboard.html'), 'utf8');
    r.check('TB-LP11（メニューの見た目は lib/ui.css に・Plan Tasks には小窓の余白の指定だけ）',
      css2.includes('.row-menu-item') && !html2.includes('.row-menu-item') && html2.includes('.popover:has(.row-menu)'),
      JSON.stringify([css2.includes('.row-menu-item'), html2.includes('.row-menu-item')]));

    /* ---------- TB-LP7: 「いま」を描く ---------- */
    const lp7 = await safe(() => {
      const box = document.createElement('section'); document.body.appendChild(box);
      let folds = 0; window.__lp7 = '';
      const spec = (folded, groups) => ({
        kinds: [{ id: 'late', label: '遅れ', count: true }, { id: 'today', label: '今日まで', count: true }, { id: 'should', label: '開始日を過ぎた', count: false }],
        groups: groups || { late: [{ parts: [{ text: '親 › ', cls: 'tick-par' }, { text: '子' }, { text: '（2日遅れ）', cls: 'tick-rel' }], title: '親 › 子', onClick: () => { window.__lp7 = 'clicked'; } }],
          today: [], should: [{ parts: [{ text: 'X' }], title: 'X' }] },
        folded, onFold: () => { folds++; }, empty: '急ぎのものはありません' });
      ToolUI.nowStrip(box, spec(false));
      const q = s => box.querySelector(s), qa = s => Array.from(box.querySelectorAll(s));
      const a = { title: q('.now-title').textContent, cnt: qa('.now-cnt').map(c => c.textContent.trim()), dots: qa('.now-dot').map(d => d.className),
        badges: qa('.now-badge').map(b => b.className + '|' + b.textContent), ticks: qa('.tick').map(t => t.textContent + '|' + t.title),
        par: qa('.tick .tick-par').length, fold: q('#now-fold').textContent, exp: q('#now-fold').getAttribute('aria-expanded'), hidden: q('.now-list').hidden };
      q('.tick').click(); a.clicked = window.__lp7;
      q('#now-fold').click(); a.folds = folds;
      ToolUI.nowStrip(box, spec(true));
      a.fold2 = q('#now-fold').textContent; a.hidden2 = q('.now-list').hidden;
      ToolUI.nowStrip(box, spec(false, { late: [], today: [], should: [] }));
      a.empty = (q('.now-empty') || {}).textContent; a.cnt0 = qa('.now-cnt').map(c => c.textContent.trim());
      box.remove();
      return a;
    });
    r.check('TB-LP7（ToolUI.nowStrip: 数は count の種類だけ・中身のある種類だけ行・札の文字と title・押す・たたむ・空）',
      lp7.title === 'いま' && eq(lp7.cnt, ['遅れ 1', '今日まで 0']) && eq(lp7.dots, ['now-dot k-late', 'now-dot k-today'])
      && eq(lp7.badges, ['now-badge k-late|遅れ 1', 'now-badge k-should|開始日を過ぎた 1'])
      && eq(lp7.ticks, ['親 › 子（2日遅れ）|親 › 子', 'X|X']) && lp7.par === 1 && lp7.fold === 'たたむ ▴' && lp7.exp === 'true' && lp7.hidden === false
      && lp7.clicked === 'clicked' && lp7.folds === 1 && lp7.fold2 === 'ひらく ▾' && lp7.hidden2 === true
      && lp7.empty === '急ぎのものはありません' && eq(lp7.cnt0, ['遅れ 0', '今日まで 0']), JSON.stringify(lp7));

    /* ---------- TB-LP8: 光らせる ---------- */
    const lp8 = await safe(async () => {
      const d = document.createElement('div'); d.textContent = 'x'; document.body.appendChild(d);
      ToolUI.flash(d);
      const on = d.classList.contains('flash');
      const anim = getComputedStyle(d).animationName;
      await new Promise(res => setTimeout(res, 1400));
      const off = !d.classList.contains('flash');
      d.remove();
      return { on, off, anim };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const lp8r = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'flash'; document.body.appendChild(d);
      const a = getComputedStyle(d).animationName; d.remove(); return a; });
    await page.emulateMedia({ reducedMotion: null });
    r.check('TB-LP8（ToolUI.flash: すぐ .flash・1.4秒後に外れる・動きは tool-flash・動きを減らす設定では none）',
      lp8.on === true && lp8.off === true && lp8.anim === 'tool-flash' && lp8r === 'none', JSON.stringify([lp8, lp8r]));
  },
};
