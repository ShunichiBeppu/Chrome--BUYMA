// Google Sheets Content Script
// スプレッドシートのDOMから行データを取得・ステータス更新を行う

(function () {
  'use strict';

  // ── メッセージハンドラ ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case MSG.GET_ROWS:
        handleGetRows(sendResponse);
        return true; // 非同期レスポンス

      case MSG.UPDATE_STATUS:
        handleUpdateStatus(message.rowIndex, sendResponse);
        return true;
    }
  });

  // ── 対象行の取得（A列が「●」の行）──
  function handleGetRows(sendResponse) {
    try {
      const rows = extractTargetRows();
      console.log(`[BUYMA Sheets] ${rows.length}件の対象行を取得`);
      sendResponse({ rows });
    } catch (err) {
      console.error('[BUYMA Sheets] 行取得エラー:', err);
      sendResponse({ rows: [], error: err.message });
    }
  }

  function extractTargetRows() {
    const table = document.querySelector('.waffle');
    if (!table) {
      throw new Error('スプレッドシートのテーブルが見つかりません');
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
      throw new Error('テーブル本体が見つかりません');
    }

    const allRows = tbody.querySelectorAll('tr');
    const targetRows = [];

    // 1行目はヘッダーなのでスキップ（index 0）
    for (let i = 1; i < allRows.length && targetRows.length < MAX_JOBS; i++) {
      const row = allRows[i];
      const cells = row.querySelectorAll('td');

      // 列数が足りない場合はスキップ
      if (cells.length <= COL.SAVE_STATUS) continue;

      // A列（MARKER）が「●」の行を対象とする
      const marker = getCellText(cells[COL.MARKER]);
      if (marker !== MARKER_TARGET) continue;

      // 既に「下書き」や「出品済み」の行はスキップ
      const saveStatus = getCellText(cells[COL.SAVE_STATUS]);
      if (saveStatus === SAVE_STATUS.DRAFT || saveStatus === SAVE_STATUS.LISTED) continue;

      const rowData = {
        rowIndex: i,
        brand: getCellText(cells[COL.BRAND]),
        refShopper: getCellText(cells[COL.REF_SHOPPER]),
        productName: getCellText(cells[COL.PRODUCT_NAME]),
        officialSite: getCellText(cells[COL.OFFICIAL_SITE]),
        purchaseLocation: getCellText(cells[COL.PURCHASE_LOCATION]),
        colorTone: getCellText(cells[COL.COLOR_TONE]),
        size: getCellText(cells[COL.SIZE]),
        euro: getCellText(cells[COL.EURO]),
        yen: getCellText(cells[COL.YEN]),
      };

      // 商品名が空の行はスキップ（空行対策）
      if (rowData.productName) {
        targetRows.push(rowData);
      }
    }

    return targetRows;
  }

  // ── ステータス更新（「下書きor出品済み」列に書き込み）──
  async function handleUpdateStatus(rowIndex, sendResponse) {
    try {
      await updateCellValue(rowIndex, COL.SAVE_STATUS, SAVE_STATUS.LISTED);
      console.log(`[BUYMA Sheets] 行${rowIndex + 1}を「出品済み」に更新`);
      sendResponse({ success: true });
    } catch (err) {
      console.error('[BUYMA Sheets] ステータス更新エラー:', err);
      sendResponse({ success: false, error: err.message });
    }
  }

  // Google Sheetsのセルに値を書き込む
  // ダブルクリックで編集モードに入り、値を入力してEnterで確定
  async function updateCellValue(rowIndex, colIndex, value) {
    const table = document.querySelector('.waffle');
    if (!table) throw new Error('テーブルが見つかりません');

    const tbody = table.querySelector('tbody');
    const row = tbody.querySelectorAll('tr')[rowIndex];
    if (!row) throw new Error(`行${rowIndex}が見つかりません`);

    const cells = row.querySelectorAll('td');
    const cell = cells[colIndex];
    if (!cell) throw new Error(`列${colIndex}が見つかりません`);

    // セルをダブルクリックして編集モードに入る
    const dblClickEvent = new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
    });
    cell.dispatchEvent(dblClickEvent);

    // 編集モードが有効になるのを待つ
    await wait(500);

    // 編集中のセルの入力欄を取得
    const editor = document.querySelector('.cell-input') ||
                   document.getElementById('t-formula-bar-input') ||
                   document.querySelector('.input-box textarea') ||
                   document.querySelector('#waffle-rich-text-editor');

    if (!editor) {
      const overlay = document.querySelector('.cell_overlay_editor_input') ||
                      document.querySelector('[contenteditable="true"]');
      if (overlay) {
        overlay.textContent = value;
        overlay.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(200);
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true,
        }));
        await wait(300);
        return;
      }
      throw new Error('セルの編集欄が見つかりません');
    }

    // エディタの内容をクリアして新しい値を入力
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      editor.value = '';
      editor.value = value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      editor.textContent = value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await wait(200);

    // Enterキーで確定
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
    });
    editor.dispatchEvent(enterEvent);
    document.dispatchEvent(enterEvent);

    await wait(300);
  }

  // ── ユーティリティ ──
  function getCellText(cell) {
    if (!cell) return '';
    return (cell.textContent || '').trim();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
