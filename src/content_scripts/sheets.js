// Google Sheets Content Script
// スプレッドシートのDOMから行データを取得・ステータス更新を行う

(function () {
  'use strict';

  // 行番号ヘッダーによる列オフセット（自動検出）
  let colOffset = 0;

  // ── メッセージハンドラ ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case MSG.GET_ROWS:
        handleGetRows(sendResponse);
        return true;

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
    console.log(`[BUYMA Sheets] 全行数: ${allRows.length}`);

    // ── 列オフセットの自動検出 ──
    // Google Sheetsでは行番号が最初の<td>に入っている場合がある
    // ヘッダー行（1行目）の最初のセルが数字のみ or 空ならオフセット1
    colOffset = detectColumnOffset(allRows);
    console.log(`[BUYMA Sheets] 列オフセット: ${colOffset}`);

    // ── デバッグ: 先頭数行の内容をログ出力 ──
    for (let i = 0; i < Math.min(3, allRows.length); i++) {
      const row = allRows[i];
      const cells = row.querySelectorAll('td');
      const preview = [];
      for (let j = 0; j < Math.min(5, cells.length); j++) {
        preview.push(`[${j}]="${getCellText(cells[j])}"`);
      }
      console.log(`[BUYMA Sheets] 行${i} (td=${cells.length}): ${preview.join(', ')}`);
    }

    const targetRows = [];

    // 1行目はヘッダーなのでスキップ（index 0）
    for (let i = 1; i < allRows.length && targetRows.length < MAX_JOBS; i++) {
      const row = allRows[i];
      const cells = row.querySelectorAll('td');

      // 列数が足りない場合はスキップ
      if (cells.length < colOffset + COL.SAVE_STATUS + 1) continue;

      // A列（MARKER）が「●」の行を対象とする
      const marker = getCellText(cells[colOffset + COL.MARKER]);

      if (marker !== MARKER_TARGET) continue;

      // 既に「下書き」や「出品済み」の行はスキップ
      const saveStatus = getCellText(cells[colOffset + COL.SAVE_STATUS]);
      if (saveStatus === SAVE_STATUS.DRAFT || saveStatus === SAVE_STATUS.LISTED) continue;

      const rowData = {
        rowIndex: i,
        brand: getCell(cells, COL.BRAND),
        refShopper: getCell(cells, COL.REF_SHOPPER),
        productName: getCell(cells, COL.PRODUCT_NAME),
        officialSite: getCell(cells, COL.OFFICIAL_SITE),
        purchaseLocation: getCell(cells, COL.PURCHASE_LOCATION),
        colorTone: getCell(cells, COL.COLOR_TONE),
        size: getCell(cells, COL.SIZE),
        euro: getCell(cells, COL.EURO),
        yen: getCell(cells, COL.YEN),
      };

      console.log(`[BUYMA Sheets] 対象行${i}: 商品名="${rowData.productName}", エン="${rowData.yen}"`);

      // 商品名が空の行はスキップ（空行対策）
      if (rowData.productName) {
        targetRows.push(rowData);
      }
    }

    return targetRows;
  }

  // 列オフセットを自動検出
  // Google Sheetsの<td>の先頭が行番号セルかどうかを判定
  function detectColumnOffset(allRows) {
    if (allRows.length < 2) return 0;

    // 2行目以降（データ行）の最初の<td>を確認
    const dataRow = allRows[1];
    const firstTd = dataRow.querySelector('td');
    if (!firstTd) return 0;

    const firstText = getCellText(firstTd);

    // 最初のtdが数字のみ → 行番号ヘッダーなのでオフセット1
    if (/^\d+$/.test(firstText)) {
      return 1;
    }

    // <th>で行番号が表示されている場合はオフセット0
    // もしくは最初のtdにクラスで判別
    if (firstTd.classList.contains('row-header') ||
        firstTd.classList.contains('row-headers-background')) {
      return 1;
    }

    return 0;
  }

  // オフセット付きでセルのテキストを取得
  function getCell(cells, colIndex) {
    return getCellText(cells[colOffset + colIndex]);
  }

  // ── ステータス更新（「下書きor出品済み」列に書き込み）──
  async function handleUpdateStatus(rowIndex, sendResponse) {
    try {
      await updateCellValue(rowIndex, colOffset + COL.SAVE_STATUS, SAVE_STATUS.LISTED);
      console.log(`[BUYMA Sheets] 行${rowIndex + 1}を「出品済み」に更新`);
      sendResponse({ success: true });
    } catch (err) {
      console.error('[BUYMA Sheets] ステータス更新エラー:', err);
      sendResponse({ success: false, error: err.message });
    }
  }

  // Google Sheetsのセルに値を書き込む
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

    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      editor.value = '';
      editor.value = value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      editor.textContent = value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await wait(200);

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
