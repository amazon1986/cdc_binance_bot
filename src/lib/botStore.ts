import { BotConfig, PaperAccount, ExecutedTrade, BinanceApiKeys, PaperPosition, Timeframe, TelegramConfig } from '../types';
import { encryptText, decryptText } from './crypto';
import { POPULAR_PAIRS } from './binanceApi';

const STORAGE_KEYS = {
  BOT_CONFIG: 'cdc_bot_config_v2',
  PAPER_ACCOUNT: 'cdc_paper_account_v2',
  TRADE_HISTORY: 'cdc_trade_history_v2',
  BINANCE_KEYS: 'cdc_binance_keys_v2',
  BOT_LOGS: 'cdc_bot_logs_v2',
  CUSTOM_SYMBOLS: 'cdc_custom_symbols_v2',
  TELEGRAM_CONFIG: 'cdc_telegram_config_v2',
};

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: '',
  chatId: '',
  enabled: false,
  notifyOnBuy: true,
  notifyOnSell: true,
  notifyOnSignal: true,
  notifyOnBotStatus: true,
};


export const DEFAULT_BOT_CONFIG: BotConfig = {
  id: 'default_bot',
  symbol: 'BTCUSDT',
  timeframe: '1d', // 🚀 Default to 1D (Daily)
  fastEmaPeriod: 12,
  slowEmaPeriod: 26,
  tradeAmountUsdt: 15, // 🎯 เหมาะสำหรับพอร์ตทุนน้อย $50 USDT (ไม้ละ $15)
  usePercentBalance: true,
  balancePercent: 33, // 🎯 ไม้ละ ~33% สำหรับพอร์ต $50 (3 ไม้)
  positionSizingMode: 'EQUAL_WEIGHT', // 🎯 ถัวเฉลี่ยเท่ากันทุกเหรียญ (Equal Weight Sizing)
  leverage: 3, // ⚡ Default 3x (ปลอดภัยและผ่านเกณฑ์ขั้นต่ำ $5 ของ Binance เสมอ)
  longLeverage: 2, // 🟢 Default 2x สำหรับ Long
  shortLeverage: 3, // 🔴 Default 3x สำหรับ Short
  isSeparateLeverage: false, // ⚡ โหมดแยก Leverage ตามฝั่ง
  maxOpenPositions: 3, // 🎯 ถือครองสูงสุด 3 ไม้ (แบ่งไม้ละ ~$16 บนทุน $50)
  stopLossPercent: 5,
  takeProfitPercent: 25, // 🎯 Target Take Profit 25%
  useTrailingStop: false,
  trailingStopPercent: 7, // 🎯 Default 7% Trailing Stop
  useWhipsawProtection: true, // 🛡️ เปิดใช้ Stop Loss Lock (Whipsaw Protection)
  buyOnSignal: ['BLUE', 'GREEN'], // 🎯 สัญญาณฟ้าแรก หรือ เขียวแรกคอนเฟิร์มตามลุงโฉลก (Safe Confirmed Entry)
  sellOnSignal: ['RED'], // 🎯 ขายออก/Short เฉพาะสัญญาณแดงแรกคอนเฟิร์ม (Bearish Cash Out)
  mode: 'BINANCE_LIVE', // ⚡ Default เป็นกระเป๋าจริง Binance Live
  scanMode: 'MULTI_SCAN', // 🎯 สแกนเปิดออเดอร์ทุกเหรียญอัตโนมัติ
  watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'XRPUSDT', 'SUIUSDT'],
  directionMode: 'BOTH', // 🎯 เล่นทั้งฝั่ง Long & Short
  isActive: false,
};

export const DEFAULT_PAPER_ACCOUNT: PaperAccount = {
  usdtBalance: 10000,
  initialUsdtBalance: 10000,
  activePositions: [],
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  totalProfitUsdt: 0,
};

// Store Helper Functions

export function getStoredBotConfig(): BotConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOT_CONFIG);
    if (!raw) return DEFAULT_BOT_CONFIG;
    const parsed = JSON.parse(raw);
    const lev = Math.min(Math.max(1, parseInt(parsed.leverage || 2, 10)), 10);
    const longLev = Math.min(Math.max(1, parseInt(parsed.longLeverage || 2, 10)), 10);
    const shortLev = Math.min(Math.max(1, parseInt(parsed.shortLeverage || 3, 10)), 10);
    return {
      ...DEFAULT_BOT_CONFIG,
      ...parsed,
      leverage: isNaN(lev) ? 2 : lev,
      longLeverage: isNaN(longLev) ? 2 : longLev,
      shortLeverage: isNaN(shortLev) ? 3 : shortLev,
      isSeparateLeverage: parsed.isSeparateLeverage ?? false,
      timeframe: parsed.timeframe || '1d',
      maxOpenPositions: parsed.maxOpenPositions && parsed.maxOpenPositions > 0 ? parsed.maxOpenPositions : 10,
      positionSizingMode: parsed.positionSizingMode || 'EQUAL_WEIGHT',
      trailingStopPercent: parsed.trailingStopPercent !== undefined ? parsed.trailingStopPercent : 7,
      useTrailingStop: parsed.useTrailingStop ?? false,
      useWhipsawProtection: parsed.useWhipsawProtection ?? true,
      scanMode: parsed.scanMode || 'MULTI_SCAN',
      watchlist: Array.isArray(parsed.watchlist) && parsed.watchlist.length > 0 ? parsed.watchlist : DEFAULT_BOT_CONFIG.watchlist,
      directionMode: parsed.directionMode || 'BOTH',
      buyOnSignal: parsed.buyOnSignal && parsed.buyOnSignal.length > 0 ? parsed.buyOnSignal : ['BLUE', 'GREEN'],
      sellOnSignal: parsed.sellOnSignal && parsed.sellOnSignal.length > 0 ? parsed.sellOnSignal : ['RED'],
    };
  } catch {
    return DEFAULT_BOT_CONFIG;
  }
}

export function saveBotConfig(config: BotConfig): void {
  localStorage.setItem(STORAGE_KEYS.BOT_CONFIG, JSON.stringify(config));
}

export function getStoredPaperAccount(): PaperAccount {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAPER_ACCOUNT);
    if (!raw) return DEFAULT_PAPER_ACCOUNT;
    const parsed: PaperAccount = JSON.parse(raw);
    // Auto-upgrade legacy default $1,000 account to $10,000 if no active positions & 0 trades
    if (parsed.initialUsdtBalance === 1000 && parsed.usdtBalance === 1000 && (!parsed.activePositions || parsed.activePositions.length === 0) && parsed.totalTrades === 0) {
      return DEFAULT_PAPER_ACCOUNT;
    }
    return parsed;
  } catch {
    return DEFAULT_PAPER_ACCOUNT;
  }
}

export function savePaperAccount(account: PaperAccount): void {
  localStorage.setItem(STORAGE_KEYS.PAPER_ACCOUNT, JSON.stringify(account));
}

export function getStoredTradeHistory(): ExecutedTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRADE_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTradeHistory(trades: ExecutedTrade[]): void {
  localStorage.setItem(STORAGE_KEYS.TRADE_HISTORY, JSON.stringify(trades));
}

export function addTradeToHistory(trade: ExecutedTrade): void {
  const history = getStoredTradeHistory();
  const updated = [trade, ...history];
  saveTradeHistory(updated);
}

export function getStoredBinanceKeys(): BinanceApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BINANCE_KEYS);
    if (!raw) return { apiKey: '', apiSecret: '', isTestnet: true };
    const parsed = JSON.parse(raw);
    return {
      apiKey: decryptText(parsed.apiKey),
      apiSecret: decryptText(parsed.apiSecret),
      isTestnet: parsed.isTestnet !== false, // Default to true
    };
  } catch {
    return { apiKey: '', apiSecret: '', isTestnet: true };
  }
}

export function saveBinanceKeys(keys: BinanceApiKeys): void {
  const encryptedKeys = {
    apiKey: encryptText(keys.apiKey),
    apiSecret: encryptText(keys.apiSecret),
    isTestnet: keys.isTestnet,
  };
  localStorage.setItem(STORAGE_KEYS.BINANCE_KEYS, JSON.stringify(encryptedKeys));
}

export function getStoredLogs(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOT_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addBotLog(logMessage: string): string[] {
  const time = new Date().toLocaleTimeString('th-TH');
  const formattedMsg = `[${time}] ${logMessage}`;
  const logs = getStoredLogs();
  const newLogs = [formattedMsg, ...logs].slice(0, 100);
  localStorage.setItem(STORAGE_KEYS.BOT_LOGS, JSON.stringify(newLogs));
  return newLogs;
}

export function getStoredSymbols(): string[] {
  try {
    // 1. Check if botConfig has a watchlist first to keep them synchronized
    const configRaw = localStorage.getItem(STORAGE_KEYS.BOT_CONFIG);
    if (configRaw) {
      const parsedConfig = JSON.parse(configRaw);
      if (Array.isArray(parsedConfig.watchlist) && parsedConfig.watchlist.length > 0) {
        return parsedConfig.watchlist.map((s: string) => s.replace('_THB', 'USDT'));
      }
    }

    // 2. Check custom symbols key
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_SYMBOLS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: string) => s.replace('_THB', 'USDT'));
      }
    }
    return DEFAULT_BOT_CONFIG.watchlist || POPULAR_PAIRS;
  } catch {
    return DEFAULT_BOT_CONFIG.watchlist || POPULAR_PAIRS;
  }
}

export function saveStoredSymbols(symbols: string[]): void {
  const cleanList = symbols.map((s) => s.replace('_THB', 'USDT'));
  localStorage.setItem(STORAGE_KEYS.CUSTOM_SYMBOLS, JSON.stringify(cleanList));

  // Sync to botConfig in localStorage so BotControlPanel and MarketScanner stay identical
  try {
    const configRaw = localStorage.getItem(STORAGE_KEYS.BOT_CONFIG);
    if (configRaw) {
      const parsedConfig = JSON.parse(configRaw);
      parsedConfig.watchlist = cleanList;
      localStorage.setItem(STORAGE_KEYS.BOT_CONFIG, JSON.stringify(parsedConfig));
    }
  } catch {}
}

export function getStoredTelegramConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TELEGRAM_CONFIG);
    if (!raw) return DEFAULT_TELEGRAM_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_TELEGRAM_CONFIG,
      ...parsed,
      botToken: parsed.botToken ? decryptText(parsed.botToken) : '',
      chatId: parsed.chatId ? decryptText(parsed.chatId) : '',
    };
  } catch {
    return DEFAULT_TELEGRAM_CONFIG;
  }
}

export function saveTelegramConfig(config: TelegramConfig): void {
  const encryptedConfig = {
    ...config,
    botToken: config.botToken ? encryptText(config.botToken) : '',
    chatId: config.chatId ? encryptText(config.chatId) : '',
  };
  localStorage.setItem(STORAGE_KEYS.TELEGRAM_CONFIG, JSON.stringify(encryptedConfig));
}

