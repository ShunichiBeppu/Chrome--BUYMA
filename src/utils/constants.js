// スプレッドシート列インデックス（0始まり）
// A:空白(●), B:ブランド, C:参考ショッパー, D:商品名(60文字以内), E:公式サイト,
// F:買付地, G:TOP画像, H:その他画像, I:色の系統, J:サイズ,
// K:出品画像, L:ユーロ, M:エン, N:181.8435, O:下書きor出品済み,
// P:出品完了日, Q:作業者完了日
const COL = {
  MARKER: 0,             // A: 空白（●で処理対象）
  BRAND: 1,              // B: ブランド
  REF_SHOPPER: 2,        // C: 参考ショッパー
  PRODUCT_NAME: 3,       // D: 商品名(60文字以内)
  OFFICIAL_SITE: 4,      // E: 公式サイト
  PURCHASE_LOCATION: 5,  // F: 買付地
  TOP_IMAGE: 6,          // G: TOP画像
  OTHER_IMAGES: 7,       // H: その他画像
  COLOR_TONE: 8,         // I: 色の系統
  SIZE: 9,               // J: サイズ
  LISTING_IMAGE: 10,     // K: 出品画像
  EURO: 11,              // L: ユーロ
  YEN: 12,               // M: エン
  RATE: 13,              // N: 181.8435（未使用）
  SAVE_STATUS: 14,       // O: 下書きor出品済み
  COMPLETION_DATE: 15,   // P: 出品完了日
  WORKER_DATE: 16,       // Q: 作業者完了日
};

const MARKER_TARGET = '●';

const MAX_JOBS = 20;
const DOM_WAIT_MS = 2000;
const SHORT_WAIT_MS = 500;

// メッセージタイプ
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

const SAVE_STATUS = {
  DRAFT: '下書き',
  LISTED: '出品済み',
};
