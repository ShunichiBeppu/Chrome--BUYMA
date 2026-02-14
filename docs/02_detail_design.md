# BUYMA 出品自動化 Chrome 拡張 詳細設計

## 1. 構成概要

### 1.1 拡張構成（MV3）
- `manifest.json`
- `service_worker.js`（オーケストレーション、タブ管理、ジョブ管理）
- `content_script_sheets.js`（Googleスプレッドシート操作）
- `content_script_buyma.js`（BUYMA出品画面の入力）
- `popup.html / popup.js`（ワンクリック開始・状態表示）
- `options.html / options.js`（必要なら将来拡張用）

### 1.2 役割
- Service Worker
  - ジョブ生成（未着手行の抽出）
  - BUYMAタブ作成・遷移
  - 各タブへの指示送信
  - 状態管理（進捗・失敗・停止）
- Content Script (Sheets)
  - シート行データ取得
  - ステータス更新（未着手→完了）
- Content Script (BUYMA)
  - 出品フォームに値入力
  - プレビューで停止

## 2. 画面仕様（Popup）

### 2.1 UI要素
- 「開始」ボタン
- 実行件数表示（最大20件）
- 進捗表示（例: 3/20）
- エラー表示（1件まで簡易）
- 「停止」ボタン

### 2.2 操作
- 「開始」クリックで一括処理開始
- 「停止」クリックで以降の処理を停止

## 3. データ取得・更新仕様

### 3.1 Googleスプレッドシート操作
- 事前にシートが開かれている前提
- Content ScriptがDOMから値を取得
- 「出品ステータス=未着手」の行を上から最大20件抽出
- 処理完了後、該当行のステータスセルを「完了」に更新

### 3.2 BUYMA入力項目
- 商品URL → 商品URLフィールド
- 商品名 → 商品名フィールド
- 公式サイト → 公式サイトフィールド
- 買付地 → 買付地フィールド
- 色の系統 → カラーフィールド
- サイズ → サイズフィールド
- 出品金額/ユーロ/エン → 価格関連フィールド
- 保存方法 → 下書き or 保存

※ 画像入力は行わない

## 4. フロー詳細

1. Popupで「開始」
2. Service WorkerがSheetsタブを検出
3. Sheets Content Scriptが未着手行を取得
4. Service WorkerがBUYMA出品ページを新規タブで開く
5. BUYMA Content Scriptがフォーム入力
6. プレビュー画面で停止（ユーザー確認待ち）
7. ユーザーが手動送信または保存
8. Service WorkerがSheetsへ「完了」更新を指示
9. 次の行へ

## 5. 状態管理

### 5.1 ステータス
- `idle` 初期待機
- `running` 実行中
- `paused` プレビュー待ち
- `stopped` 停止
- `error` 失敗

### 5.2 状態遷移
- `idle` → `running`（開始）
- `running` → `paused`（プレビュー到達）
- `paused` → `running`（ユーザー送信後）
- `running` → `stopped`（停止押下）
- いずれ → `error`（失敗）

## 6. エラーハンドリング
- DOM取得失敗時はその行をスキップしエラー記録
- BUYMA画面が見つからない場合は停止
- Sheetsが閉じられていた場合は停止

## 7. ログ設計
- Service Worker内で進捗ログを保持
- Popupに最新ログを表示（最大1件）
- エラーはコンソールに詳細

## 8. パフォーマンス・安全対策
- 1行処理ごとに2-3秒の待機（BUYMA DOM安定化）
- 最大20件制限
- ユーザー操作で停止可能

## 9. 権限（manifest）
- `tabs`
- `scripting`
- `activeTab`
- `storage`
- `https://*.google.com/*`（Sheets）
- `https://www.buyma.com/*`

## 10. 未確定（今後要検討）
- BUYMA入力欄の正確なセレクタ
- BUYMA画面構成の例外対応
- スプレッドシートの列順やヘッダ名の固定方法

## 11. BUYMA画面セレクタ設計（HTML貼付け版に基づく）

### 11.1 前提
- BUYMAの出品画面はReactで描画され、`id`が固定されない要素が多い
- セレクタは「項目タイトル文字列」から対象パネルを特定し、そのパネル配下の入力欄を取得する

### 11.2 共通ユーティリティ（設計方針）
- `findPanel(titleText)`  
  - `.bmm-c-panel__item` を列挙し、`.bmm-c-summary__ttl` のテキストが `titleText` と一致するものを返す
- `findInputInPanel(panel, selector)`  
  - `panel.querySelector(selector)` で対象入力欄を取得
- React Select は `.Select-control` をクリックしてメニューを開き、`document.querySelectorAll('.Select-menu-outer .Select-option')` のテキスト一致で選択

### 11.3 項目マッピング（一次案）
- 商品名  
  - パネル: `商品名`  
  - 入力: `input.bmm-c-text-field`
- 商品コメント（説明）  
  - パネル: `商品コメント`  
  - 入力: `textarea.bmm-c-textarea`
- 色の系統  
  - パネル: `色・サイズ`  
  - 手順: 「色」タブを選択 → `.sell-color-table .Select-control` を開く → テキスト一致で選択
- 色名  
  - パネル: `色・サイズ`  
  - 手順: 色の系統を選択後に有効化される `input.bmm-c-text-field` に入力
- サイズ  
  - パネル: `色・サイズ`  
  - 手順: 「サイズ」タブを選択 → サイズ表に追加・入力  
  - 補足: HTML内にサイズ入力の実体が未出現のため、実画面で要確認
- 商品価格（出品金額）  
  - パネル: `商品価格`  
  - 入力: `input.bmm-c-text-field--half-size-char`
- 買付地  
  - パネル: `買付地`  
  - 入力: `input.bmm-c-radio__input[value=\"domestic|overseas\"]`
- 買付先ショップ名  
  - パネル: `買付先ショップ名`  
  - 入力: `input.bmm-c-text-field`
- 買付先メモ（商品URL / 公式サイトの仮マッピング）  
  - パネル: `買付先メモ`  
  - 行1の入力:  
    - 買付先名: `table.sell-shop-url-table input.bmm-c-text-field` (1つ目)  
    - URL: `table.sell-shop-url-table input.bmm-c-text-field` (2つ目)  
    - 説明: `table.sell-shop-url-table input.bmm-c-text-field` (3つ目)  
  - 仮マッピング案:  
    - 買付先名 ← 公式サイト（サイト名）  
    - URL ← 商品URL  
    - 説明 ← 公式サイトURL  
  - 注記: 公式サイト/商品URLの使い分けは要確認

### 11.4 ボタン操作
- 下書き保存: `.sell-btnbar button` のテキストが `下書き保存する`
- プレビュー遷移: `.sell-btnbar button` のテキストが `入力内容を確認する`
- 要件により、プレビュー到達後は停止しユーザー操作待ち

### 11.5 未確定・要確認
- サイズタブ内の入力DOM構造
- 色名入力欄が有効化される条件
- 公式サイト/商品URLのBUYMA画面への正しい割当
- 出品金額が円以外（ユーロ/エン）を扱う場合の仕様
