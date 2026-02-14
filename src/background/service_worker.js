// ── 定数（Service Workerではcontent_scriptのconstantsが読めないため再定義） ──
const MSG = {
  START: 'START',
  STOP: 'STOP',
  GET_STATE: 'GET_STATE',
  STATE_UPDATE: 'STATE_UPDATE',
  GET_ROWS: 'GET_ROWS',
  ROWS_DATA: 'ROWS_DATA',
  UPDATE_STATUS: 'UPDATE_STATUS',
  STATUS_UPDATED: 'STATUS_UPDATED',
  FILL_FORM: 'FILL_FORM',
  FILL_COMPLETE: 'FILL_COMPLETE',
  FILL_ERROR: 'FILL_ERROR',
};

const BUYMA_SELL_URL = 'https://www.buyma.com/my/sell/new?tab=b';
const BUYMA_SELL_PATTERN = 'https://www.buyma.com/my/sell/';

// ── 状態管理 ──
let state = {
  status: 'idle',
  jobs: [],
  currentIndex: 0,
  total: 0,
  error: null,
  sheetsTabId: null,
  buymaTabId: null,
};

function resetState() {
  state = {
    status: 'idle',
    jobs: [],
    currentIndex: 0,
    total: 0,
    error: null,
    sheetsTabId: null,
    buymaTabId: null,
  };
}

function setState(updates) {
  Object.assign(state, updates);
  broadcastState();
}

function broadcastState() {
  const payload = {
    type: MSG.STATE_UPDATE,
    state: {
      status: state.status,
      currentIndex: state.currentIndex,
      total: state.total,
      error: state.error,
    },
  };
  chrome.runtime.sendMessage(payload).catch(() => {});
}

// ── Content Script注入 ──
// タブにContent Scriptが読み込まれていない場合に備え、明示的に注入する
async function injectContentScript(tabId, scriptFiles) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scriptFiles,
    });
  } catch (err) {
    // 既に注入済みの場合もエラーになることがあるので無視
    console.log(`[BUYMA] スクリプト注入（既存の場合はスキップ）: ${err.message}`);
  }
}

// メッセージ送信（リトライ付き）
async function sendMessageToTab(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (err) {
      if (i < maxRetries - 1) {
        console.log(`[BUYMA] メッセージ送信リトライ (${i + 1}/${maxRetries}): ${err.message}`);
        await wait(1000);
      } else {
        throw err;
      }
    }
  }
}

// ── メッセージハンドラ ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case MSG.GET_STATE:
      sendResponse({
        state: {
          status: state.status,
          currentIndex: state.currentIndex,
          total: state.total,
          error: state.error,
        },
      });
      return true;

    case MSG.START:
      handleStart();
      return false;

    case MSG.STOP:
      handleStop();
      return false;

    case MSG.FILL_COMPLETE:
      handleFillComplete();
      return false;

    case MSG.FILL_ERROR:
      handleFillError(message.error);
      return false;
  }
});

// ── 開始処理 ──
async function handleStart() {
  try {
    resetState();
    setState({ status: 'running' });

    // Sheetsタブを検索
    const sheetsTabs = await chrome.tabs.query({
      url: 'https://docs.google.com/spreadsheets/*',
    });

    if (sheetsTabs.length === 0) {
      setState({ status: 'error', error: 'Googleスプレッドシートが開かれていません' });
      return;
    }

    state.sheetsTabId = sheetsTabs[0].id;

    // Sheetsタブに Content Script を注入
    await injectContentScript(state.sheetsTabId, [
      'utils/constants.js',
      'content_scripts/sheets.js',
    ]);
    await wait(500);

    // Sheetsから対象行を取得
    const response = await sendMessageToTab(state.sheetsTabId, {
      type: MSG.GET_ROWS,
    });

    if (!response || !response.rows || response.rows.length === 0) {
      setState({ status: 'error', error: '対象行（●）が見つかりません' });
      return;
    }

    setState({
      jobs: response.rows,
      total: response.rows.length,
      currentIndex: 0,
    });

    console.log(`[BUYMA] ${response.rows.length}件のジョブを取得`);

    processNextJob();
  } catch (err) {
    console.error('[BUYMA] 開始エラー:', err);
    setState({ status: 'error', error: err.message });
  }
}

// ── 停止処理 ──
function handleStop() {
  console.log('[BUYMA] 停止');
  setState({ status: 'stopped' });
}

// ── 次のジョブを処理 ──
async function processNextJob() {
  if (state.status === 'stopped') return;

  if (state.currentIndex >= state.total) {
    console.log('[BUYMA] 全件完了');
    setState({ status: 'idle' });
    return;
  }

  setState({ status: 'running' });

  const job = state.jobs[state.currentIndex];
  console.log(`[BUYMA] ジョブ ${state.currentIndex + 1}/${state.total} 開始:`, job.productName);

  try {
    // BUYMAタブを開く
    const tab = await chrome.tabs.create({ url: BUYMA_SELL_URL });
    state.buymaTabId = tab.id;

    // タブの読み込み完了を待つ
    await waitForTabLoad(tab.id);

    // BUYMAタブに Content Script を注入
    await injectContentScript(tab.id, [
      'utils/constants.js',
      'content_scripts/buyma.js',
    ]);
    await wait(2000);

    // フォーム入力を指示（リトライ付き）
    await sendMessageToTab(tab.id, {
      type: MSG.FILL_FORM,
      data: job,
    });
  } catch (err) {
    console.error(`[BUYMA] ジョブ処理エラー:`, err);
    setState({ error: `行${job.rowIndex + 1}: ${err.message}` });
    state.currentIndex++;
    setTimeout(() => processNextJob(), 1000);
  }
}

// ── フォーム入力完了 ──
function handleFillComplete() {
  console.log('[BUYMA] フォーム入力完了 → プレビュー待ち');
  setState({ status: 'paused' });
}

// ── フォーム入力エラー ──
function handleFillError(error) {
  console.error('[BUYMA] フォーム入力エラー:', error);
  setState({ error: `行${state.jobs[state.currentIndex]?.rowIndex + 1}: ${error}` });
  state.currentIndex++;
  setTimeout(() => processNextJob(), 1000);
}

// ── BUYMAタブのページ遷移を監視 ──
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== state.buymaTabId) return;
  if (state.status !== 'paused') return;
  if (changeInfo.url === undefined) return;

  if (!changeInfo.url.startsWith(BUYMA_SELL_PATTERN)) {
    console.log('[BUYMA] ページ遷移検知 → 完了処理');
    handleItemCompleted();
  }
});

// ── BUYMAタブが閉じられた場合 ──
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== state.buymaTabId) return;
  if (state.status !== 'paused' && state.status !== 'running') return;

  console.log('[BUYMA] BUYMAタブが閉じられた → 完了処理');
  state.buymaTabId = null;
  handleItemCompleted();
});

// ── 1件完了処理 ──
async function handleItemCompleted() {
  const job = state.jobs[state.currentIndex];

  try {
    // Sheetsタブに Content Script を再注入（タブが裏にいた間に失われた場合の対策）
    await injectContentScript(state.sheetsTabId, [
      'utils/constants.js',
      'content_scripts/sheets.js',
    ]);
    await wait(500);

    // Sheetsのステータスを「出品済み」に更新
    await sendMessageToTab(state.sheetsTabId, {
      type: MSG.UPDATE_STATUS,
      rowIndex: job.rowIndex,
    });
    console.log(`[BUYMA] 行${job.rowIndex + 1}のステータスを出品済みに更新`);
  } catch (err) {
    console.error('[BUYMA] ステータス更新エラー:', err);
  }

  state.currentIndex++;
  state.buymaTabId = null;

  setTimeout(() => processNextJob(), 1000);
}

// ── ユーティリティ ──
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
