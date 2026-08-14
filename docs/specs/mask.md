# mask 仕様書兼テストケース

## 概要

スクリーンショットのマスキングと注釈のツール。`web/mask.html`、表示名 `Mask`、カテゴリ: 画像（新設）。
画像を貼り付け（Ctrl+V）→ 機密部分をピクセル化/黒塗り → 矢印・枠・テキストで説明 → PNG で
コピー/保存。Teams・設計書に貼る前の1画面完結を狙う。

**ぼかし（ガウス）は提供しない** — 復元リスクが議論されており、機密用途の相場は
ピクセル化か黒塗り（2026-08-14 の外部調査。image-scrubber 等の OSS 実例に整合）。

## 入力

- **Ctrl+V 貼り付け**（`paste` の `clipboardData.items` から image blob — file:// で動く）
- ファイル選択・ドラッグ＆ドロップ
- 取り込みガード: 最大辺 6,000px 超は中止して理由表示（一部処理はしない）
- **保存しない**: 画像・操作履歴とも localStorage に入れない（機密画像を残さない。注記に明記）

## 操作モデル（元画像＋操作リスト。再描画は「元画像 → ops を順に適用」＝非破壊）

| op | 形 | 描画 |
|---|---|---|
| mosaic | `{type:'mosaic', x,y,w,h, size}` | 領域をピクセル化（縮小 → `imageSmoothingEnabled:false` で拡大。size=セル px・既定16） |
| fill | `{type:'fill', x,y,w,h}` | 黒塗り |
| rect | `{type:'rect', x,y,w,h}` | 赤枠（線幅3・塗りなし） |
| arrow | `{type:'arrow', x1,y1,x2,y2}` | 赤矢印（線幅3＋三角の頭） |
| text | `{type:'text', x,y, text}` | 赤テキスト（20px・太字） |

- **Undo** = ops を1つ戻して再描画。クリア = ops を空に（画像は残す）
- マウス: ドラッグで矩形系（mosaic/fill/rect）と arrow、クリックで text（文言は入力欄から）

## 出力

- **PNG コピー**: `canvas.toBlob` → `ClipboardItem({'image/png': Promise<Blob>})`
  （Safari はジェスチャ内で同期的に write するため **Promise を渡す形**が必須 — 調査済み）。
  失敗時は「PNG 保存を使ってください」の案内
- **PNG 保存**: `<a download>` ＋ dataURL

## 純関数・フック（UI と同一コードパス）

`window.mask = { setImage(dataUrl) → Promise, addOp(op), undo(), clearOps(), opsCount(),
size() → {w,h}, pixelAt(x,y) → [r,g,b,a], countRed(x,y,w,h) → n }`
（countRed は領域内の「赤系（r≥180, g≤90, b≤90）」画素数 — 枠・矢印・テキストの描画検証用）

## テストケース（fixture: 100×100 の勾配画像 `rgb(x*2, y*2, 100)` をページ内で生成）

| ID | 操作 | 期待 |
|---|---|---|
| MK-01 | `fill 10,10,30,30` | `pixelAt(20,20)` が黒・`pixelAt(60,60)` は元のまま |
| MK-02 | `mosaic 40,40,40,40, size:8` | 同一セル内の2点（41,41)(46,46）が**同色**・隣のセル（49,41 と 51,41）は別色 |
| MK-03 | `rect 5,60,30,20` | 枠線上（領域の縁）に赤画素あり・内部（20,70）は元のまま |
| MK-04 | `arrow 0,0,99,99` | 対角線の中央付近（45,45〜55,55）に赤画素あり |
| MK-05 | `text 10,90,'A'` | その周辺（5,70〜40,95）に赤画素あり |
| MK-06 | MK-01 のあと `undo()` | `pixelAt(20,20)` が元の色に戻る |
| MK-U1 | 合成 paste イベント（DataTransfer に PNG File） | 画像が取り込まれ `size()` が一致・キャンバス表示 |
| MK-U2 | ［PNG をコピー］（`clipboard.write` をスタブ） | ClipboardItem の types に `image/png`・ボタン ✓ 表示。**実クリップボードに書かない** |
| MK-U3 | 6,001px 幅の画像を取り込み | 中止して warn（「上限」を含む）・キャンバス非表示のまま |
| MK-U4 | 幅390px | ページの横スクロールなし |

## 検証手順

> **合否の正本は `./test/run mask` が全 pass（コンソールエラー0件を含む）。**

実機スモーク: 実スクショを Ctrl+V → モザイク → PNG コピー → Teams/Excel に貼れること
（画像の clipboard.write は file:// で理論上可だが実機未検証 — 調査時の注記）。

## やらないこと

- ガウスぼかし（復元リスク。上記）／ 自動 PII 検出（OCR が必要 — LLM/別ツールの領分）
- 画像・履歴の保存（機密を localStorage に残さない）
- Redo・レイヤー・自由曲線（v1 は5操作＋Undo で十分。要望が出たら）

## 決定事項（2026-08-14）

- **MK-Q1**: カテゴリ → 「画像」を新設（既存4分類のどれでもない）
- **MK-Q2**: マスク方式 → ピクセル化＋黒塗りのみ（ぼかし非搭載は設計判断であり手抜きではない）
- **MK-Q3**: 既定ツール → mosaic（開いて貼って即マスクが最頻動線）
