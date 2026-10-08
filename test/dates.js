'use strict';
/* 目的: docs/specs/dates.md のテストケースを file:// 実機で照合する
   入力: なし
   出力: 合否一覧と終了コード（全 pass かつコンソールエラー0件で 0）
   例:   node test/dates.js  /  ./test/run dates

   照合するID: DT-01〜11（純関数）＋ DT-U1〜U6（UI 経路）＋ハブ導線
   仕様の正本は docs/specs/dates.md。期待値を変えるときは spec を先に直す。
   祝日の期待値は内閣府 CSV（2026-08-14 取得）由来 — 2026 のシルバーウィークと GW を使う。 */

const { launch, fileUrl, createRunner, eq } = require('./helpers');

(async () => {
  const r = createRunner();
  const browser = await launch();
  const page = r.watch(await browser.newPage());
  await page.goto(fileUrl('web/dates.html'));

  // フック未実装ならクラッシュではなく綺麗な RED にする
  const ready = await page.evaluate(() => !!(window.dates && window.dates.addBusinessDays));
  r.check('前提（window.dates フックがある）', ready, String(ready));

  if (ready) {
    /* ========== DT-01〜04: addBusinessDays ========== */
    const add = await page.evaluate(() => ({
      simple: window.dates.addBusinessDays('2026-08-14', 1),      // 金 → 月
      silver1: window.dates.addBusinessDays('2026-09-18', 1),     // 金 → 5連休スキップ
      silver3: window.dates.addBusinessDays('2026-09-18', 3),
      gwBack: window.dates.addBusinessDays('2026-05-07', -1),     // GW を逆向き
      zero: window.dates.addBusinessDays('2026-08-11', 0),        // 祝日でも 0 は動かさない
    }));
    r.check('DT-01（+1営業日: 土日スキップ）', add.simple === '2026-08-17', add.simple);
    r.check('DT-02（シルバーウィーク5日をスキップ: +1 と +3）',
      add.silver1 === '2026-09-24' && add.silver3 === '2026-09-28',
      JSON.stringify([add.silver1, add.silver3]));
    r.check('DT-03（-1営業日: GW を逆向きにスキップ）', add.gwBack === '2026-05-01', add.gwBack);
    r.check('DT-04（0 はそのまま）', add.zero === '2026-08-11', add.zero);

    /* ========== DT-05: businessDaysBetween（両端含む） ========== */
    const between = await page.evaluate(() => ({
      week: window.dates.businessDaysBetween('2026-08-10', '2026-08-14'),  // 山の日を除いて4
      sameBiz: window.dates.businessDaysBetween('2026-08-14', '2026-08-14'),
      sameHoliday: window.dates.businessDaysBetween('2026-08-11', '2026-08-11'),
      reversed: window.dates.businessDaysBetween('2026-08-14', '2026-08-10'),
    }));
    r.check('DT-05（営業日数: 両端含む・同日営業日=1・同日祝日=0・逆順=0）',
      between.week === 4 && between.sameBiz === 1 && between.sameHoliday === 0 && between.reversed === 0,
      JSON.stringify(between));

    /* ========== DT-06: holidayName ========== */
    const names = await page.evaluate(() => ({
      yama: window.dates.holidayName('2026-08-11'),
      kokumin: window.dates.holidayName('2026-09-22'),   // 敬老の日と秋分の日に挟まれた休日
      heijitsu: window.dates.holidayName('2026-08-12'),
      doyou: window.dates.holidayName('2026-08-15'),     // 土曜は祝日ではない
    }));
    r.check('DT-06（祝日名: 山の日・休日・平日 null・土曜 null）',
      names.yama === '山の日' && names.kokumin === '休日'
      && names.heijitsu === null && names.doyou === null,
      JSON.stringify(names));

    /* ========== DT-07: inRange ========== */
    const range = await page.evaluate(() => ({
      lo: window.dates.inRange('2020-01-01'),
      hi: window.dates.inRange('2027-12-31'),
      out: window.dates.inRange('2028-01-01'),
      count: Object.keys(window.dates.HOLIDAYS).length,
    }));
    r.check('DT-07（祝日データの範囲: 2020〜2027・143件）',
      range.lo === true && range.hi === true && range.out === false && range.count === 143,
      JSON.stringify(range));

    /* ========== DT-08: toWareki（境界） ========== */
    const wareki = await page.evaluate(() => [
      window.dates.toWareki('1989-01-07').text,
      window.dates.toWareki('1989-01-08').text,
      window.dates.toWareki('2019-04-30').text,
      window.dates.toWareki('2019-05-01').text,
      window.dates.toWareki('2026-08-14').text,
    ]);
    r.check('DT-08（和暦: 昭和64年・平成元年・平成31年・令和元年・令和8年）',
      eq(wareki, ['昭和64年', '平成元年', '平成31年', '令和元年', '令和8年']),
      JSON.stringify(wareki));

    /* ========== DT-09: toFiscal ========== */
    const fiscal = await page.evaluate(() => [
      window.dates.toFiscal('2026-03-31'),
      window.dates.toFiscal('2019-04-01'),
      window.dates.toFiscal('2020-03-31'),
      window.dates.toFiscal('1989-04-01'),
    ]);
    r.check('DT-09（年度: 3/31 は前年度・2019年度は通年「令和元年度」・平成元年度）',
      fiscal[0].fy === 2025 && fiscal[0].wareki === '令和7年度'
      && fiscal[1].fy === 2019 && fiscal[1].wareki === '令和元年度'
      && fiscal[2].fy === 2019 && fiscal[3].wareki === '平成元年度',
      JSON.stringify(fiscal));

    /* ========== DT-10/11: convertEffort ========== */
    const effort = await page.evaluate(() => ({
      d3: window.dates.convertEffort(3, '人日', { hoursPerDay: 8, daysPerMonth: 20 }),
      m05: window.dates.convertEffort(0.5, '人月', { hoursPerDay: 8, daysPerMonth: 20 }),
      h12: window.dates.convertEffort(12, '時間', { hoursPerDay: 8, daysPerMonth: 20 }),
      custom: window.dates.convertEffort(2, '人日', { hoursPerDay: 7.5, daysPerMonth: 18 }),
      customM: window.dates.convertEffort(1, '人月', { hoursPerDay: 7.5, daysPerMonth: 18 }),
    }));
    r.check('DT-10（既定係数: 3人日=24h/0.15人月・0.5人月=80h/10人日・12時間=1.5人日）',
      effort.d3.hours === 24 && effort.d3.months === 0.15
      && effort.m05.hours === 80 && effort.m05.days === 10
      && effort.h12.days === 1.5,
      JSON.stringify([effort.d3, effort.m05, effort.h12]));
    r.check('DT-11（係数変更: 7.5h/18日 → 2人日=15h・1人月=18人日=135h）',
      effort.custom.hours === 15 && effort.customM.days === 18 && effort.customM.hours === 135,
      JSON.stringify([effort.custom, effort.customM]));
  }

  /* ========== DT-U1: 営業日 UI（リアルタイム） ========== */
  const setInput = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, val]);

  await setInput('#biz-date', '2026-09-18');
  await setInput('#biz-n', '1');
  const u1 = await page.evaluate(() => document.getElementById('biz-result').textContent);
  r.check('DT-U1（UI: 2026-09-18 の1営業日後 = 2026/9/24(木) — 表示は fillDate・title が ISO）',
    u1.includes('2026/9/24(木)'), u1);

  /* ========== DT-U2: 範囲外の warn（戻すと消える） ========== */
  await setInput('#biz-date', '2028-01-05');
  const u2a = await page.evaluate(() => {
    const b = document.getElementById('banner');
    return { hidden: b.hidden, text: b.textContent, warn: b.className.includes('banner-warn') };
  });
  await setInput('#biz-date', '2026-08-14');
  const u2b = await page.evaluate(() => document.getElementById('banner').hidden);
  r.check('DT-U2（範囲外で warn（2020〜2027 を含む）・範囲内に戻すと消える）',
    u2a.hidden === false && u2a.warn && u2a.text.includes('2020') && u2a.text.includes('2027')
    && u2b === true,
    JSON.stringify([u2a, u2b]));

  /* ========== DT-U3: 和暦 UI ========== */
  await setInput('#wa-date', '2019-05-01');
  const u3 = await page.evaluate(() => document.getElementById('wa-result').textContent);
  r.check('DT-U3（UI: 2019-05-01 → 令和元年・令和元年度）',
    u3.includes('令和元年') && u3.includes('令和元年度'), u3);

  /* ========== DT-U4: 工数 UI ＋係数の保存（reload 後も残る） ========== */
  await setInput('#ef-value', '3');
  await page.selectOption('#ef-unit', '人日');
  const u4a = await page.evaluate(() => document.getElementById('ef-result').textContent);
  await setInput('#ef-h', '7');
  const u4b = await page.evaluate(() => document.getElementById('ef-result').textContent);
  await page.waitForTimeout(500);   // 保存デバウンス待ち
  await page.reload();
  const u4c = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem('tools:dates'));
    return { h: document.getElementById('ef-h').value, tool: env && env.tool, v: env && env.v };
  });
  r.check('DT-U4（工数: 3人日=24時間 → 係数7で21時間・reload 後も係数が残る）',
    u4a.includes('24時間') && u4b.includes('21時間')
    && u4c.h === '7' && u4c.tool === 'dates' && u4c.v === 1,
    JSON.stringify([u4a, u4b, u4c]));

  /* ========== DT-U6: 営業日結果のコピー ========== */
  await setInput('#biz-date', '2026-09-18');
  await setInput('#biz-n', '1');
  const u6 = await page.evaluate(async () => {
    const out = { text: null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async t => { out.text = t; } },
    });
    document.getElementById('biz-copy').click();
    await new Promise(d => setTimeout(d, 200));
    return { text: out.text, label: document.getElementById('biz-copy').textContent };
  });
  r.check('DT-U6（結果コピー: 日付が渡り ✓ 表示・実クリップボードに書かない）',
    typeof u6.text === 'string' && u6.text.includes('2026-09-24') && u6.label === '✓ コピーしました',
    JSON.stringify(u6));

  /* ========== DT-U5: 幅390px ========== */
  await page.setViewportSize({ width: 390, height: 800 });
  const u5 = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  await page.setViewportSize({ width: 1280, height: 900 });
  r.check('DT-U5（幅390pxで横スクロールなし）', u5 === true, String(u5));

  /* ========== DT-U7: 日付入力欄に Ctrl/Cmd+; で今日（lib/edit.js） ========== */
  const u7d = await page.evaluate(() => {
    if (!window.ToolEdit) return { missing: true };
    const inp = document.getElementById('biz-date');
    inp.value = '2020-01-01';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
    const ev = new KeyboardEvent('keydown', { key: ';', metaKey: true, bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    return { v: inp.value, prevented: ev.defaultPrevented,
             result: document.getElementById('biz-result').textContent };
  });
  r.check('DT-U7（Ctrl/Cmd+; で今日がセットされ再計算される）',
    !u7d.missing && /^\d{4}-\d{2}-\d{2}$/.test(u7d.v) && u7d.v !== '2020-01-01'
    && u7d.prevented === true && u7d.result.includes('→'),
    JSON.stringify(u7d));

  /* ========== DT-U8〜U10: 点検 2026-10-08（古い設定・チップ・無言で通さない） ========== */
  await page.evaluate(() => {
    ToolStorage.save('dates', { 'biz-dir': 'x', 'ef-unit': '人時', 'biz-n': '1', 'ef-h': '8', 'ef-d': '20' });
    ToolStorage.save = () => true;   // reload 前の pagehide のフラッシュで、今の正しい値に上書きされないように
  });
  await page.reload();
  await page.waitForTimeout(300);
  await setInput('#biz-date', '2026-09-18');
  await setInput('#biz-n', '1');
  const u8 = await page.evaluate(() => ({
    dir: document.getElementById('biz-dir').value, unit: document.getElementById('ef-unit').value,
    result: document.getElementById('biz-result').textContent,
  }));
  r.check('DT-U8（今の選択肢に無い保存値は捨てる: select は既定に戻り、営業日は「後」で計算）',
    u8.dir === 'after' && u8.unit === '人日' && u8.result.includes('2026/9/24(木)'), JSON.stringify(u8));

  await setInput('#range-from', '2026-09-14');
  await setInput('#range-to', '2026-09-14');
  const u9 = await page.evaluate(async () => {
    const chips = document.querySelectorAll('.date-chips').length;
    const before = document.getElementById('range-result').textContent;
    const wrap = document.getElementById('range-to').nextElementSibling;
    const plus1 = wrap && wrap.classList.contains('date-chips') ? wrap.querySelectorAll('button')[1] : null;
    if (plus1) plus1.click();
    await new Promise(d => setTimeout(d, 50));
    return { chips, before, after: document.getElementById('range-result').textContent, to: document.getElementById('range-to').value };
  });
  r.check('DT-U9（日付欄4つに 今日/+1/+7 のチップ・範囲の終了を +1 すると結果が変わる）',
    u9.chips === 4 && u9.before.includes('1営業日') && u9.after.includes('2営業日') && u9.to === '2026-09-15', JSON.stringify(u9));

  await setInput('#range-from', '2026-09-20');
  await setInput('#range-to', '2026-09-18');
  const u10a = await page.evaluate(() => document.getElementById('banner').textContent);
  await setInput('#range-from', '2026-09-14');
  await setInput('#ef-h', '0');
  const u10b = await page.evaluate(() => document.getElementById('banner').textContent);
  await setInput('#ef-h', '8');
  const u10c = await page.evaluate(() => document.getElementById('banner').textContent);
  r.check('DT-U10（範囲の逆順と係数 0 は warn・戻すと消える）',
    u10a.includes('開始が終了より後') && u10b.includes('係数') && !u10c.includes('係数') && !u10c.includes('開始が終了より後'),
    JSON.stringify([u10a, u10b, u10c]));

  /* ========== ハブ導線 ========== */
  await page.goto(fileUrl('index.html'));
  const hubCats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#chips .chip')).map(e => e.dataset.cat));
  await page.click('ul.tool-list .tool-name:text-is("Calc Dates")');
  await page.waitForLoadState('load');
  const hubTitle = await page.title();
  r.check('ハブの「PM」カテゴリ（初使用）から遷移でき title が命名規約どおり',
    hubCats.includes('PM') && hubTitle === 'Calc Dates (dates)', JSON.stringify([hubCats, hubTitle]));

  await browser.close();
  r.report('dates（docs/specs/dates.md）');
})().catch(e => {
  console.error('ハーネス自体のエラー:', e);
  process.exit(2);
});
