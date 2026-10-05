'use strict';
/* lib/tasklinks.js — タスクとイシューノートのつながり（表示用の写し — 2026-10-05・段4）
   目的: Check Issue がノートごとに「タスク N・済み M」と閉じどきを出す。数えるのは Plan Tasks（tasks.md を読んだ・保存したとき）
   入力: タスクの配列 [{ links: ['名前', …], finished: bool, doneDate: 'YYYY-MM-DD'|null }]（Plan Tasks の parseDoc の形）
   出力: window.ToolTaskLinks = { NAME, MAX_AGE_MS, nameOf(link), count(tasks), merge(a, b), write(tasks, file, arch), read(now) }
   例:   ToolTaskLinks.write(parseDoc(state.lines).tasks, 'tasks.md');                      // Plan Tasks
         const c = ToolTaskLinks.read(Date.now()); if (c && c.fresh) c.notes['2026-09-25_名前'];   // Check Issue

   規約（coding-rules「保存」が正本）:
   - **正本は tasks.md のまま**。これは数え直せる表示用の写し（localStorage `tools:tasklinks`・lib/storage.js の封筒）。
     file:// は全ローカルページで1オリジンなので、別のタブの Check Issue から読める（tools:config と同じ）
   - 必ず「いつ数えた時点か」（at）を持ち、読む側はそれを出す。MAX_AGE_MS より古ければ数を使わない（fresh: false）
   - 済み = 完了と中止（finished）。最後に済んだ日 = ✅ の日付の最大（中止には日付が無い） */
(function (global) {
  const NAME = 'tasklinks';
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;

  // [[名前|別名]]・[[名前#見出し]]・[[フォルダ/名前.md]] → 名前（Check Issue のノート名 = ファイル名から .md を除いたもの）
  function nameOf(link) {
    let s = String(link == null ? '' : link).normalize('NFC');
    s = s.split('|')[0].split('#')[0];
    s = s.slice(s.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    return s.trim();
  }

  function count(tasks) {
    const notes = Object.create(null);   // ノート名が __proto__ でも Object.prototype を汚さない
    for (const t of tasks || []) {
      const seen = new Set();
      for (const l of (t && t.links) || []) {
        const n = nameOf(l);
        if (!n || seen.has(n)) continue;   // 1つのタスクに同じノートが2つあっても1つ
        seen.add(n);
        const c = notes[n] || (notes[n] = { total: 0, done: 0, last: '' });
        c.total++;
        if (t.finished) {
          c.done++;
          if (t.doneDate && t.doneDate > c.last) c.last = t.doneDate;
        }
      }
    }
    return notes;
  }

  // 2つの数を足す（tasks.md と archive.md — 済んだタスクをアーカイブしても閉じどきが消えないように。2026-10-05 の点検・TB-LN6）
  function merge(a, b) {
    const out = Object.create(null);
    for (const src of [a, b]) {
      if (!src || typeof src !== 'object') continue;
      for (const n of Object.keys(src)) {
        const c = src[n];
        if (!c || typeof c.total !== 'number' || typeof c.done !== 'number') continue;
        const o = out[n] || (out[n] = { total: 0, done: 0, last: '' });
        o.total += c.total;
        o.done += c.done;
        if (typeof c.last === 'string' && c.last > o.last) o.last = c.last;
      }
    }
    return out;
  }

  // arch: archive.md の数（count の結果。無ければ null）。notes は tasks.md と足したもの、arch はそのまま持つ（次の数え直しが引き継ぐ）
  function write(tasks, file, arch) {
    if (!global.ToolStorage) return false;
    return global.ToolStorage.save(NAME, { at: Date.now(), file: String(file || ''), notes: merge(count(tasks), arch), arch: arch || null });
  }

  // 型ガード（手書きの残骸・別バージョンで壊れない）。無ければ null。fresh は MAX_AGE_MS 以内（時計のずれで未来でも新しい扱い）
  function read(now) {
    const d = global.ToolStorage ? global.ToolStorage.load(NAME) : null;
    if (!d || typeof d.at !== 'number' || !d.notes || typeof d.notes !== 'object') return null;
    const t = typeof now === 'number' ? now : Date.now();
    return { at: d.at, file: typeof d.file === 'string' ? d.file : '', notes: d.notes,
      arch: d.arch && typeof d.arch === 'object' ? d.arch : null, fresh: t - d.at <= MAX_AGE_MS };
  }

  global.ToolTaskLinks = { NAME, MAX_AGE_MS, nameOf, count, merge, write, read };
})(window);
