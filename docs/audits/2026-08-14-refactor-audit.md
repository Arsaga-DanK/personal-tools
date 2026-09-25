# 全体リファクタ監査 T4（2026-08-14）

> `docs/ux-backlog.md` から 2026-09-25 に移した監査ログ（内容は書き換えていない）。判断の現行版は `docs/ux-backlog.md` の「やらないと判断したもの」「検討して現状維持と判断した事項」を見る。

## 2026-08-14 全体リファクタ監査（T4・実測の重複調査）

新ツール3本（Mask・Dates・Fill）追加直後の横断調査。方法は grep による重複計測と
規約（coding-rules.md）との突き合わせ。**挙動を変える抽出はせず、規約違反の是正のみ実施**。

### 対応済み（同日）

| 発見 | 対応 |
|---|---|
| Fill: pagehide/visibilitychange フラッシュ欠落（保存規約違反 — 閉じる直前 300ms の編集が消える） | terms と同型の flushSave を追加（FL-U4 で照合） |
| Fill: 100KB cap（`{omitted:true}`＋次回通知）欠落 | terms と同型を追加（banner 要素も追加） |
| Fill: コピーボタンの `title="Cmd/Ctrl+Enter"`＋keydown 配線欠落 | 追加（FL-U6） |
| Fill: サンプルボタン「入力が空のときだけ表示」未適用 | 追加（FL-U7） |
| Dates: フラッシュ欠落（設定のみだが同型で統一） | flushSave を追加 |
| index.html: TOOLS スキーマコメントの category 列挙が古い（画像・整理が無い） | 実態に更新 |
| verification-notes §4: pagehide フラッシュ持ちの一覧が古い | terms・fill・dates を追記 |

### 見送り（トリガー付き — 蒸し返さないための記録）

| 候補 | 実測 | 見送り理由とトリガー |
|---|---|---|
| `todayStr()` の共通化 | dates・fill・vaultlint に同一実装×3、taskboard は todayOverride 付き変種 | 5行の安定関数で置き場が無い（ToolUI は UI 部品、ToolStorage は保存）。**同じ修正を2箇所以上に入れる実測が出たら lib へ** |
| デバウンス保存の共通化 | 5ツール。300ms×3・500ms×2（大きいペイロードは意図して長い） | 2026-08-07 監査 R2 の結論どおりラッパはツール側。ms の差は意図的 |
| コピー完了表示の共通化 | 11ツール。成功ラベルは統一済み（devpad の行ボタンのみ「✓ コピー」— 幅の都合で意図的）。失敗パスは3方式（selectEl 選択案内 / banner / ボタンラベル）でツールの作りに合わせ意図的 | 共通核（copy＋feedback）は既に lib。**失敗パスまで同じツールが3本を超えたら** copyWithFeedback を検討 |

