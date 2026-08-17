'use strict';
/* lib/mmd.js — mermaid（lib/vendor/mermaid.min.js）の共通ラッパ
   目的: ①初期化設定の一元化 ②「図テキスト → SVG を DOM へ」③「SVG → PNG Blob」の共通化
   入力: window.mermaid（vendor を先に <script src> で読み込むこと）
   出力: window.ToolMmd = { render(container, text) → Promise<SVGElement>,
                            toPngBlob(svgEl, scale) → Promise<Blob> }
   例:   const svg = await ToolMmd.render(el('output'), text);
         const blob = await ToolMmd.toPngBlob(svg, 2);

   設定の要点（変えるときは diagram / gantt 両方の回帰を回す）:
   - theme 'default'（ライト固定）: 貼り付け先の資料は白背景が相場（DG-Q2）
   - htmlLabels: false は**トップレベルと flowchart の両方**に必要（2026-08-15 実測 —
     片方だけでは foreignObject が残り、canvas 経由の PNG 化が壊れる。DG-Q3）
   - securityLevel 'strict': 図テキスト由来のスクリプト実行・リンクを封じる */
(function (global) {
  let initialized = false;
  let seq = 0;

  function ensureInit() {
    if (initialized) return;
    global.mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    initialized = true;
  }

  // text を検証 → 描画して container に SVG を挿す。失敗時は reject
  //（呼び出し側がバナー表示と「前回の描画を保持」を担う — 変換系の標準形）。
  // SVG 文字列はライブラリの出力（自前の HTML 文字列組み立てではない）—
  // DOMParser で解析し、失敗を検知してから importNode で取り込む
  async function render(container, text) {
    ensureInit();
    await global.mermaid.parse(text);
    const result = await global.mermaid.render('toolmmd-' + (++seq), text);
    const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('SVG の解析に失敗しました');
    const node = document.importNode(doc.documentElement, true);
    container.textContent = '';
    container.appendChild(node);
    return node;
  }

  // 挿入済みの SVG 要素を白背景の PNG Blob にする（既定 2 倍で貼り付け先でも粗くならない）。
  // サイズは表示中の実寸から取る（mermaid の SVG は幅が % のことがあり intrinsic が当てにならない）
  function toPngBlob(svgEl, scale) {
    return new Promise((resolve, reject) => {
      const rect = svgEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const xml = new XMLSerializer().serializeToString(svgEl);
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = scale || 2;
        const canvas = document.createElement('canvas');
        canvas.width = w * k;
        canvas.height = h * k;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG 変換に失敗しました'))), 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('SVG の画像化に失敗しました'));
      };
      img.src = url;
    });
  }

  global.ToolMmd = { render, toPngBlob };
})(window);
