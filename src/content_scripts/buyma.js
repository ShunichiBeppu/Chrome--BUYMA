// BUYMA Content Script
// 出品フォームへの自動入力を行う

(function () {
  'use strict';

  // ── メッセージハンドラ ──
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MSG.FILL_FORM) {
      fillForm(message.data)
        .then(() => {
          chrome.runtime.sendMessage({ type: MSG.FILL_COMPLETE });
        })
        .catch((err) => {
          console.error('[BUYMA] フォーム入力エラー:', err);
          chrome.runtime.sendMessage({
            type: MSG.FILL_ERROR,
            error: err.message,
          });
        });
      return false;
    }
  });

  // ── メインの入力処理 ──
  async function fillForm(data) {
    console.log('[BUYMA] フォーム入力開始:', data.productName);

    // DOM安定化待ち
    await wait(DOM_WAIT_MS);

    // 1. 商品名
    if (data.productName) {
      await fillProductName(data.productName);
      await wait(SHORT_WAIT_MS);
    }

    // 2. 商品コメント（公式サイト情報を記載）
    const comment = buildComment(data);
    if (comment) {
      await fillComment(comment);
      await wait(SHORT_WAIT_MS);
    }

    // 3. 色の系統
    if (data.colorTone) {
      await fillColorTone(data.colorTone);
      await wait(SHORT_WAIT_MS);
    }

    // 4. サイズ
    if (data.size) {
      await fillSize(data.size);
      await wait(SHORT_WAIT_MS);
    }

    // 5. 買付地
    if (data.purchaseLocation) {
      await fillPurchaseLocation(data.purchaseLocation);
      await wait(SHORT_WAIT_MS);
    }

    // 6. 買付先ショップ名（公式サイト名）
    if (data.officialSite) {
      await fillShopName(data.officialSite);
      await wait(SHORT_WAIT_MS);
    }

    // 7. 商品価格（エン列の値を使用）
    if (data.yen) {
      await fillPrice(data.yen);
      await wait(SHORT_WAIT_MS);
    }

    // 8. プレビューボタンをクリック（常にプレビューへ遷移）
    await wait(1000);
    await clickPreviewButton();

    console.log('[BUYMA] フォーム入力完了');
  }

  // ── 個別フィールド入力 ──

  // 商品名
  async function fillProductName(name) {
    const panel = findPanel('商品名');
    if (!panel) throw new Error('商品名パネルが見つかりません');

    const input = findInputInPanel(panel, 'input.bmm-c-text-field');
    if (!input) throw new Error('商品名の入力欄が見つかりません');

    setInputValue(input, name);
    console.log('[BUYMA] 商品名:', name);
  }

  // 商品コメント
  async function fillComment(text) {
    const panel = findPanel('商品コメント');
    if (!panel) {
      console.warn('[BUYMA] 商品コメントパネルが見つかりません（スキップ）');
      return;
    }

    const textarea = findInputInPanel(panel, 'textarea.bmm-c-textarea');
    if (!textarea) {
      console.warn('[BUYMA] 商品コメントの入力欄が見つかりません（スキップ）');
      return;
    }

    setInputValue(textarea, text);
    console.log('[BUYMA] 商品コメント入力完了');
  }

  // 色の系統
  async function fillColorTone(tone) {
    const panel = findPanel('色・サイズ');
    if (!panel) {
      console.warn('[BUYMA] 色・サイズパネルが見つかりません（スキップ）');
      return;
    }

    // 色タブを選択
    const tabs = panel.querySelectorAll('.sell-variation__tab-item, [role="tab"]');
    for (const tab of tabs) {
      if (tab.textContent.includes('色')) {
        tab.click();
        await wait(SHORT_WAIT_MS);
        break;
      }
    }

    // React Selectで色を選択
    const selectControl = panel.querySelector('.sell-color-table .Select-control') ||
                          panel.querySelector('.Select-control');
    if (selectControl) {
      await selectReactOption(selectControl, tone);
      console.log('[BUYMA] 色の系統:', tone);
    } else {
      console.warn('[BUYMA] 色の系統セレクタが見つかりません（スキップ）');
    }
  }

  // サイズ
  async function fillSize(size) {
    const panel = findPanel('色・サイズ');
    if (!panel) {
      console.warn('[BUYMA] 色・サイズパネルが見つかりません（スキップ）');
      return;
    }

    // サイズタブを選択
    const tabs = panel.querySelectorAll('.sell-variation__tab-item, [role="tab"]');
    for (const tab of tabs) {
      if (tab.textContent.includes('サイズ')) {
        tab.click();
        await wait(SHORT_WAIT_MS);
        break;
      }
    }

    // サイズ入力欄を探す
    const selectControl = panel.querySelector('.sell-size-table .Select-control') ||
                          panel.querySelector('[class*="size"] .Select-control');
    if (selectControl) {
      await selectReactOption(selectControl, size);
      console.log('[BUYMA] サイズ:', size);
    } else {
      // テキスト入力フォールバック
      const sizeInput = panel.querySelector('.sell-size-table input.bmm-c-text-field') ||
                        panel.querySelector('[class*="size"] input');
      if (sizeInput) {
        setInputValue(sizeInput, size);
        console.log('[BUYMA] サイズ（テキスト入力）:', size);
      } else {
        console.warn('[BUYMA] サイズ入力欄が見つかりません（スキップ）- 実画面で要確認');
      }
    }
  }

  // 買付地
  async function fillPurchaseLocation(location) {
    const panel = findPanel('買付地');
    if (!panel) {
      console.warn('[BUYMA] 買付地パネルが見つかりません（スキップ）');
      return;
    }

    let radioValue;
    if (location.includes('国内') || location.toLowerCase().includes('domestic')) {
      radioValue = 'domestic';
    } else if (location.includes('海外') || location.toLowerCase().includes('overseas')) {
      radioValue = 'overseas';
    } else {
      radioValue = 'overseas';
    }

    const radio = panel.querySelector(`input.bmm-c-radio__input[value="${radioValue}"]`);
    if (radio) {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[BUYMA] 買付地:', radioValue);
    } else {
      console.warn('[BUYMA] 買付地ラジオボタンが見つかりません（スキップ）');
    }
  }

  // 買付先ショップ名
  async function fillShopName(siteName) {
    const panel = findPanel('買付先ショップ名');
    if (!panel) {
      console.warn('[BUYMA] 買付先ショップ名パネルが見つかりません（スキップ）');
      return;
    }

    const input = findInputInPanel(panel, 'input.bmm-c-text-field');
    if (input) {
      setInputValue(input, siteName);
      console.log('[BUYMA] 買付先ショップ名:', siteName);
    } else {
      console.warn('[BUYMA] 買付先ショップ名の入力欄が見つかりません（スキップ）');
    }
  }

  // 商品価格（エン列の値を使用）
  async function fillPrice(price) {
    const panel = findPanel('商品価格');
    if (!panel) {
      console.warn('[BUYMA] 商品価格パネルが見つかりません（スキップ）');
      return;
    }

    const input = findInputInPanel(panel, 'input.bmm-c-text-field--half-size-char') ||
                  findInputInPanel(panel, 'input.bmm-c-text-field');
    if (input) {
      // 数字のみにフォーマット（カンマ・円記号等を除去）
      const numericPrice = price.replace(/[^0-9]/g, '');
      setInputValue(input, numericPrice);
      console.log('[BUYMA] 商品価格:', numericPrice);
    } else {
      console.warn('[BUYMA] 商品価格の入力欄が見つかりません（スキップ）');
    }
  }

  // ── ボタン操作 ──
  async function clickPreviewButton() {
    const btnBar = document.querySelector('.sell-btnbar');
    if (!btnBar) {
      console.warn('[BUYMA] ボタンバーが見つかりません');
      return;
    }

    const buttons = btnBar.querySelectorAll('button');
    const targetText = '入力内容を確認する';

    for (const btn of buttons) {
      if (btn.textContent.trim().includes(targetText)) {
        btn.click();
        console.log('[BUYMA] プレビューボタンクリック');
        return;
      }
    }

    console.warn('[BUYMA] 「入力内容を確認する」ボタンが見つかりません');
  }

  // ── 共通ユーティリティ ──

  function findPanel(titleText) {
    const panels = document.querySelectorAll('.bmm-c-panel__item');
    for (const panel of panels) {
      const title = panel.querySelector('.bmm-c-summary__ttl');
      if (title && title.textContent.trim().includes(titleText)) {
        return panel;
      }
    }
    return null;
  }

  function findInputInPanel(panel, selector) {
    return panel.querySelector(selector);
  }

  function setInputValue(element, value) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'input' || tagName === 'textarea') {
      const prototype = tagName === 'input'
        ? window.HTMLInputElement.prototype
        : window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(element, value);
      } else {
        element.value = value;
      }
    } else {
      element.textContent = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function selectReactOption(selectControl, optionText) {
    selectControl.click();
    await wait(SHORT_WAIT_MS);

    const options = document.querySelectorAll(
      '.Select-menu-outer .Select-option'
    );

    for (const option of options) {
      if (option.textContent.trim().includes(optionText)) {
        option.click();
        console.log(`[BUYMA] React Select 選択: ${optionText}`);
        return;
      }
    }

    console.warn(`[BUYMA] React Select オプションが見つかりません: ${optionText}`);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
      })
    );
  }

  function buildComment(data) {
    const lines = [];
    if (data.productName) {
      lines.push(data.productName);
    }
    if (data.officialSite) {
      lines.push(`公式サイト: ${data.officialSite}`);
    }
    return lines.join('\n');
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
