const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const statusLabel = document.getElementById('status-label');
const progressArea = document.getElementById('progress-area');
const progressCurrent = document.getElementById('progress-current');
const progressTotal = document.getElementById('progress-total');
const progressFill = document.getElementById('progress-fill');
const errorArea = document.getElementById('error-area');
const errorMessage = document.getElementById('error-message');

const STATUS_TEXT = {
  idle: '待機中',
  running: '実行中',
  paused: 'プレビュー待ち',
  stopped: '停止',
  error: 'エラー',
};

function updateUI(state) {
  // ステータスラベル
  statusLabel.textContent = STATUS_TEXT[state.status] || state.status;
  statusLabel.className = 'status ' + state.status;

  // 進捗表示
  if (state.total > 0) {
    progressArea.classList.remove('hidden');
    progressCurrent.textContent = state.currentIndex;
    progressTotal.textContent = state.total;
    const pct = state.total > 0 ? (state.currentIndex / state.total) * 100 : 0;
    progressFill.style.width = pct + '%';
  } else {
    progressArea.classList.add('hidden');
  }

  // エラー表示
  if (state.error) {
    errorArea.classList.remove('hidden');
    errorMessage.textContent = state.error;
  } else {
    errorArea.classList.add('hidden');
  }

  // ボタン表示切替
  const isRunning = state.status === 'running' || state.status === 'paused';
  btnStart.classList.toggle('hidden', isRunning);
  btnStop.classList.toggle('hidden', !isRunning);
  btnStart.disabled = isRunning;
}

// 開始ボタン
btnStart.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: MSG.START });
  btnStart.disabled = true;
});

// 停止ボタン
btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: MSG.STOP });
});

// Service Workerからの状態更新を受信
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.STATE_UPDATE) {
    updateUI(message.state);
  }
});

// ポップアップ起動時に現在の状態を取得
chrome.runtime.sendMessage({ type: MSG.GET_STATE }, (response) => {
  if (response && response.state) {
    updateUI(response.state);
  }
});
