import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { BotConfig, PaperAccount, PaperPosition, ExecutedTrade, KlineData, Timeframe, TelegramConfig, AuthUser } from './src/types';
import { calculateCDCActionZone, getCrossoverInfo } from './src/lib/cdcIndicator';
import { POPULAR_PAIRS } from './src/lib/binanceApi';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// ==================== SECURITY MIDDLEWARE ====================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const orderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Order rate limit exceeded.' },
});

app.use('/api/', generalLimiter);
app.use(express.json({ limit: '200kb' }));

// ==================== STATE PERSISTENCE ON SERVER ====================

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'bot_state.json');

interface ServerState {
  botConfig: BotConfig;
  paperAccount: PaperAccount;
  tradeHistory: ExecutedTrade[];
  botLogs: string[];
  telegramConfig: TelegramConfig;
  liveApiKeys?: {
    apiKey: string;
    apiSecret: string;
    isTestnet: boolean;
    marketType?: 'SPOT' | 'FUTURES';
    marginType?: 'ISOLATED' | 'CROSSED';
  };
}

const DEFAULT_SERVER_STATE: ServerState = {
  botConfig: {
    id: 'default_bot',
    symbol: 'BTCUSDT',
    timeframe: '1d',
    fastEmaPeriod: 12,
    slowEmaPeriod: 26,
    tradeAmountUsdt: 15,
    usePercentBalance: true,
    balancePercent: 33,
    positionSizingMode: 'EQUAL_WEIGHT',
    leverage: 3,
    longLeverage: 2,
    shortLeverage: 3,
    isSeparateLeverage: false,
    maxOpenPositions: 3,
    stopLossPercent: 5,
    takeProfitPercent: 25,
    useTrailingStop: false,
    trailingStopPercent: 7,
    buyOnSignal: ['BLUE', 'GREEN'],
    sellOnSignal: ['RED'],
    mode: 'BINANCE_LIVE',
    scanMode: 'MULTI_SCAN',
    watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'XRPUSDT', 'SUIUSDT'],
    directionMode: 'BOTH',
    isActive: false,
  },
  paperAccount: {
    usdtBalance: 10000,
    initialUsdtBalance: 10000,
    activePositions: [],
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalProfitUsdt: 0,
  },
  tradeHistory: [],
  botLogs: [
    `[${new Date().toLocaleTimeString('th-TH')}] 🚀 CDC Action Zone 24/7 Cloud Server initialized and ready.`,
  ],
  telegramConfig: {
    botToken: '',
    chatId: '',
    enabled: false,
    notifyOnBuy: true,
    notifyOnSell: true,
    notifyOnSignal: true,
    notifyOnBotStatus: true,
  },
};

let serverState: ServerState = { ...DEFAULT_SERVER_STATE };

function loadServerState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const parsedPaper = parsed.paperAccount || {};
      // Auto-upgrade legacy default $1,000 to $10,000 if untouched
      if (parsedPaper.initialUsdtBalance === 1000 && parsedPaper.usdtBalance === 1000 && (!parsedPaper.activePositions || parsedPaper.activePositions.length === 0) && (!parsed.tradeHistory || parsed.tradeHistory.length === 0)) {
        parsedPaper.usdtBalance = 10000;
        parsedPaper.initialUsdtBalance = 10000;
      }
      serverState = {
        ...DEFAULT_SERVER_STATE,
        ...parsed,
        botConfig: { ...DEFAULT_SERVER_STATE.botConfig, ...(parsed.botConfig || {}) },
        paperAccount: { ...DEFAULT_SERVER_STATE.paperAccount, ...parsedPaper },
        tradeHistory: Array.isArray(parsed.tradeHistory) ? parsed.tradeHistory : [],
        botLogs: Array.isArray(parsed.botLogs) ? parsed.botLogs : [],
        telegramConfig: { ...DEFAULT_SERVER_STATE.telegramConfig, ...(parsed.telegramConfig || {}) },
      };
      console.log('✅ Loaded persistent bot state from disk.');
    }

    // 🔑 Auto-load Binance API Credentials from .env if present
    const envApiKey = (process.env.BINANCE_API_KEY || '').trim();
    const envApiSecret = (process.env.BINANCE_API_SECRET || '').trim();
    if (envApiKey && envApiSecret) {
      serverState.liveApiKeys = {
        apiKey: envApiKey,
        apiSecret: envApiSecret,
        isTestnet: process.env.BINANCE_IS_TESTNET === 'true',
        marketType: (process.env.BINANCE_MARKET_TYPE as any) || 'FUTURES',
        marginType: (process.env.BINANCE_MARGIN_TYPE as any) || 'ISOLATED',
      };
      console.log(`🔑 [ENV] Loaded Binance API credentials from .env (${serverState.liveApiKeys.marketType} | ${serverState.liveApiKeys.isTestnet ? 'Testnet' : 'Live'})`);
    }

    // 📱 Auto-load Telegram Credentials from .env if present
    const envTelegramToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const envTelegramChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
    if (envTelegramToken && envTelegramChatId) {
      serverState.telegramConfig = {
        ...serverState.telegramConfig,
        botToken: envTelegramToken,
        chatId: envTelegramChatId,
        enabled: process.env.TELEGRAM_ENABLED !== 'false',
      };
      console.log(`📱 [ENV] Loaded Telegram Bot credentials from .env (ChatId: ${envTelegramChatId})`);
    }
  } catch (err) {
    console.error('Error reading bot_state.json:', err);
    serverState = { ...DEFAULT_SERVER_STATE };
  }
}


function saveServerState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(serverState, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing bot_state.json:', err);
  }
}

function addServerLog(msg: string) {
  const timestamp = new Date().toLocaleTimeString('th-TH', { hour12: false });
  const entry = `[${timestamp}] ${msg}`;
  serverState.botLogs.unshift(entry);
  if (serverState.botLogs.length > 200) {
    serverState.botLogs = serverState.botLogs.slice(0, 200);
  }
  saveServerState();
}

// Load state immediately on startup
loadServerState();

// ==================== INPUT VALIDATION HELPERS ====================

const VALID_SYMBOL_REGEX = /^[A-Z0-9]{2,20}$/;
const VALID_SIDE_VALUES = ['BUY', 'SELL'];
const VALID_ORDER_TYPES = ['MARKET', 'LIMIT'];
const VALID_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

function sanitizeSymbol(symbol: string | undefined): string | null {
  if (!symbol) return null;
  const cleaned = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return VALID_SYMBOL_REGEX.test(cleaned) ? cleaned : null;
}

function sanitizeErrorMessage(error: any): string {
  if (process.env.NODE_ENV === 'production') {
    return 'An internal error occurred. Please try again.';
  }
  const msg = error?.message || 'Unknown error';
  return msg.replace(/\b[A-Z]:\\[^\s]+/gi, '[path]').substring(0, 200);
}

function buildBinanceSignedQuery(queryString: string, secretKey: string): string {
  const signature = crypto.createHmac('sha256', secretKey).update(queryString).digest('hex');
  return `${queryString}&signature=${signature}`;
}

// ==================== SERVER-SIDE BOT SIZING & TRADING ENGINE ====================

function calculateOrderSize(config: BotConfig, account: PaperAccount): number {
  const maxPositions = config.maxOpenPositions || 5;
  if (account.activePositions.length >= maxPositions) return 0;

  const totalPositionsValue = account.activePositions.reduce((sum, p) => sum + (p.usdtInvested || 0), 0);
  const totalEquity = account.usdtBalance + totalPositionsValue;

  const mode = config.positionSizingMode || 'EQUAL_WEIGHT';
  let targetUsdt = 0;

  if (mode === 'EQUAL_WEIGHT') {
    targetUsdt = totalEquity / maxPositions;
  } else if (mode === 'PERCENT_EQUITY') {
    targetUsdt = (totalEquity * (config.balancePercent || 20)) / 100;
  } else {
    targetUsdt = config.tradeAmountUsdt || 100;
  }

  return Math.min(targetUsdt, account.usdtBalance);
}

// ==================== BINANCE RATE LIMIT CIRCUIT BREAKER & CACHING ====================
let binanceSpotBannedUntil = 0;
let binanceFuturesBannedUntil = 0;
let lastBanWarningTime = 0;

interface ServerCacheItem<T> {
  data: T;
  expiry: number;
}

const serverKlineCache = new Map<string, ServerCacheItem<KlineData[]>>();
let serverTickerCache: ServerCacheItem<any[]> | null = null;
const serverDepthCache = new Map<string, ServerCacheItem<any>>();
const serverExchangeInfoCache = new Map<string, ServerCacheItem<any>>();
const serverAccountCache = new Map<string, ServerCacheItem<any>>();
const serverFuturesAccountCache = new Map<string, ServerCacheItem<any>>();

function getServerTimeframeCacheTtl(interval: string): number {
  switch (interval) {
    case '1d':
    case '1w':
      return 180000; // 3 min for 1d/1w
    case '4h':
      return 120000; // 2 min for 4h
    case '1h':
      return 60000;  // 1 min for 1h
    default:
      return 30000;  // 30s
  }
}

function handleBinanceRateLimitError(status: number, data: any, endpointName = 'API', isFutures = false) {
  if (status === 418 || status === 429) {
    let banUntil = Date.now() + 60000; // default 1 min
    const msg = typeof data === 'string' ? data : (data?.msg || JSON.stringify(data || ''));

    // Extract timestamp from "banned until <timestamp>"
    const match = msg.match(/banned until (\d+)/i);
    if (match && match[1]) {
      banUntil = parseInt(match[1], 10);
    }

    const isFut = isFutures || endpointName.toLowerCase().includes('futures') || endpointName.toLowerCase().includes('fapi');
    if (isFut) {
      binanceFuturesBannedUntil = Math.max(binanceFuturesBannedUntil, banUntil);
    } else {
      binanceSpotBannedUntil = Math.max(binanceSpotBannedUntil, banUntil);
    }

    const targetBannedUntil = isFut ? binanceFuturesBannedUntil : binanceSpotBannedUntil;
    const now = Date.now();
    if (now - lastBanWarningTime > 15000) {
      lastBanWarningTime = now;
      const waitSeconds = Math.max(0, Math.ceil((targetBannedUntil - now) / 1000));
      const banDateStr = new Date(targetBannedUntil).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });
      addServerLog(`⚠️ [BINANCE RATE LIMIT / IP BAN] ตรวจพบการจำกัดคำขอ (HTTP ${status}) จาก Binance ${isFut ? 'Futures' : 'Spot'} (${endpointName}): พักการส่งคำขอชั่วคราว ${waitSeconds} วินาที (จนถึง ${banDateStr})`);
      console.warn(`[Binance Rate Limit ${isFut ? 'Futures' : 'Spot'}] IP Banned until ${targetBannedUntil} (${waitSeconds}s remaining)`);
    }
  }
}

async function fetchKlinesDirect(symbol: string, interval: string, limit = 300, isFutures = false): Promise<KlineData[]> {
  const cacheKey = `${symbol}_${interval}_${limit}_${isFutures ? 'fut' : 'spot'}`;
  const now = Date.now();
  const ttl = getServerTimeframeCacheTtl(interval);
  const cached = serverKlineCache.get(cacheKey);
  if (cached && now < cached.expiry) {
    return cached.data;
  }

  const isBanned = isFutures ? (now < binanceFuturesBannedUntil) : (now < binanceSpotBannedUntil);
  if (isBanned) {
    if (cached) return cached.data;
    return [];
  }

  const candidateUrls = isFutures
    ? [`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`]
    : [
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        handleBinanceRateLimitError(res.status, errText, `klines ${symbol}`, isFutures);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      const result: KlineData[] = data.map((d: any) => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      serverKlineCache.set(cacheKey, { data: result, expiry: now + ttl });
      return result;
    } catch (err) {
      continue;
    }
  }

  if (cached) return cached.data;
  return [];
}

// Symbol Filter & Precision Cache for Binance (Futures & Spot)
interface SymbolFilterInfo {
  quantityPrecision: number;
  pricePrecision: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
}

const futuresSymbolInfoCache = new Map<string, SymbolFilterInfo>();
const spotSymbolInfoCache = new Map<string, SymbolFilterInfo>();

async function getSymbolFilterInfo(
  symbol: string,
  marketType: 'SPOT' | 'FUTURES',
  isTestnet: boolean
): Promise<SymbolFilterInfo> {
  const cache = marketType === 'FUTURES' ? futuresSymbolInfoCache : spotSymbolInfoCache;
  if (cache.has(symbol)) {
    return cache.get(symbol)!;
  }

  try {
    const url = marketType === 'FUTURES'
      ? (isTestnet ? 'https://testnet.binancefuture.com/fapi/v1/exchangeInfo' : 'https://fapi.binance.com/fapi/v1/exchangeInfo')
      : (isTestnet ? 'https://testnet.binance.vision/api/v3/exchangeInfo' : 'https://api.binance.com/api/v3/exchangeInfo');

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const symbols = data.symbols || [];
      for (const s of symbols) {
        let stepSize = 0.001;
        let minQty = 0.001;
        let minNotional = 5;
        let quantityPrecision = s.quantityPrecision ?? 3;
        let pricePrecision = s.pricePrecision ?? 2;

        const lotSizeFilter = (s.filters || []).find((f: any) => f.filterType === 'LOT_SIZE' || f.filterType === 'MARKET_LOT_SIZE');
        if (lotSizeFilter) {
          stepSize = parseFloat(lotSizeFilter.stepSize || '0.001');
          minQty = parseFloat(lotSizeFilter.minQty || '0.001');
          if (stepSize > 0) {
            const stepStr = String(lotSizeFilter.stepSize);
            if (stepStr.includes('.')) {
              quantityPrecision = stepStr.split('.')[1].replace(/0+$/, '').length;
            } else {
              quantityPrecision = 0;
            }
          }
        }

        const notionalFilter = (s.filters || []).find((f: any) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
        if (notionalFilter) {
          minNotional = parseFloat(notionalFilter.notional || notionalFilter.minNotional || '5');
        }

        cache.set(s.symbol, {
          quantityPrecision,
          pricePrecision,
          stepSize,
          minQty,
          minNotional,
        });
      }
    }
  } catch (err) {
    console.warn('Failed to fetch Binance exchangeInfo:', err);
  }

  if (cache.has(symbol)) {
    return cache.get(symbol)!;
  }

  // Common fallbacks for popular meme / alt coins if exchangeInfo request failed
  let defaultPrecision = 3;
  if (['DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'TRXUSDT', 'MATICUSDT', 'GALAUSDT', 'VETUSDT', 'PEPEUSDT', 'SHIBUSDT', 'BONKUSDT', 'FLOKIUSDT', '1000PEPEUSDT', '1000SHIBUSDT', '1000BONKUSDT', '1000FLOKIUSDT', '1000LUNCUSDT', '1000RATSUSDT', '1000SATSUSDT'].includes(symbol)) {
    defaultPrecision = 0;
  } else if (['SOLUSDT', 'BNBUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'NEARUSDT', 'APTUSDT', 'SUIUSDT', 'ARBUSDT', 'OPUSDT'].includes(symbol)) {
    defaultPrecision = 2;
  }

  return {
    quantityPrecision: defaultPrecision,
    pricePrecision: 4,
    stepSize: defaultPrecision === 0 ? 1 : Math.pow(10, -defaultPrecision),
    minQty: defaultPrecision === 0 ? 1 : Math.pow(10, -defaultPrecision),
    minNotional: 5,
  };
}

function formatQuantityByStepSize(qty: number, filterInfo: SymbolFilterInfo): number {
  const { stepSize, quantityPrecision } = filterInfo;
  if (stepSize > 0) {
    const precisionMultiplier = Math.pow(10, quantityPrecision);
    // Floor to nearest stepSize to prevent precision error
    const stepped = Math.floor(qty / stepSize) * stepSize;
    if (quantityPrecision === 0) {
      return Math.floor(stepped);
    }
    return parseFloat((Math.round(stepped * precisionMultiplier) / precisionMultiplier).toFixed(quantityPrecision));
  }
  if (quantityPrecision === 0) return Math.floor(qty);
  return parseFloat(qty.toFixed(quantityPrecision));
}

async function executeLiveServerOrder(params: {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  reduceOnly?: boolean;
  leverage?: number;
}): Promise<{ success: boolean; orderId?: string | number; error?: string }> {
  const keys = serverState.liveApiKeys;
  if (!keys || !keys.apiKey || !keys.apiSecret) {
    return { success: false, error: 'Live API keys not configured on server' };
  }

  const marketType = keys.marketType || serverState.botConfig.marketType || 'FUTURES';
  const isTestnet = !!keys.isTestnet;

  try {
    const filterInfo = await getSymbolFilterInfo(params.symbol, marketType, isTestnet);
    const qty = formatQuantityByStepSize(params.quantity, filterInfo);

    if (qty <= 0) {
      return {
        success: false,
        error: `จำนวนเหรียญที่คำนวณได้ (${params.quantity.toFixed(4)}) น้อยกว่าขนาดขั้นต่ำของเหรียญนี้ (${filterInfo.minQty})`,
      };
    }

    if (marketType === 'FUTURES') {
      const baseUrl = isTestnet
        ? 'https://testnet.binancefuture.com/fapi/v1'
        : 'https://fapi.binance.com/fapi/v1';

      // 1. Set leverage if specified
      if (params.leverage && params.leverage >= 1) {
        try {
          const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
          const levQuery = buildBinanceSignedQuery(
            `symbol=${params.symbol}&leverage=${params.leverage}&recvWindow=${recvWindow}&timestamp=${timestamp}`,
            keys.apiSecret
          );
          await fetch(`${baseUrl}/leverage?${levQuery}`, {
            method: 'POST',
            headers: { 'X-MBX-APIKEY': keys.apiKey },
          });
        } catch (levErr) {
          console.warn('Failed to set leverage on Binance:', levErr);
        }
      }

      // 2. Format query and send market order
      const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
      let queryParts = [
        `symbol=${params.symbol}`,
        `side=${params.side}`,
        `type=MARKET`,
        `quantity=${qty}`,
        `recvWindow=${recvWindow}`,
        `timestamp=${timestamp}`,
      ];

      if (params.reduceOnly) {
        queryParts.push('reduceOnly=true');
      }

      const signedQuery = buildBinanceSignedQuery(queryParts.join('&'), keys.apiSecret);
      const res = await fetch(`${baseUrl}/order?${signedQuery}`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': keys.apiKey },
      });

      const data = await res.json();
      if (!res.ok || data.code) {
        return { success: false, error: data.msg || 'Binance Futures order error' };
      }

      return { success: true, orderId: data.orderId };
    } else {
      // Spot Order
      const baseUrl = isTestnet
        ? 'https://testnet.binance.vision/api/v3'
        : 'https://api.binance.com/api/v3';

      const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
      const queryParts = [
        `symbol=${params.symbol}`,
        `side=${params.side}`,
        `type=MARKET`,
        `quantity=${qty}`,
        `recvWindow=${recvWindow}`,
        `timestamp=${timestamp}`,
      ];

      const signedQuery = buildBinanceSignedQuery(queryParts.join('&'), keys.apiSecret);
      const res = await fetch(`${baseUrl}/order?${signedQuery}`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': keys.apiKey },
      });

      const data = await res.json();
      if (!res.ok || data.code) {
        return { success: false, error: data.msg || 'Binance Spot order error' };
      }

      return { success: true, orderId: data.orderId };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Live order execution failed' };
  }
}


// ==================== TELEGRAM NOTIFICATION ENGINE ====================

async function sendTelegramNotification(
  text: string,
  eventType?: 'BUY' | 'SELL' | 'SIGNAL' | 'STATUS'
): Promise<boolean> {
  const config = serverState.telegramConfig;
  if (!config || !config.enabled || !config.botToken || !config.chatId) {
    return false;
  }

  if (eventType === 'BUY' && !config.notifyOnBuy) return false;
  if (eventType === 'SELL' && !config.notifyOnSell) return false;
  if (eventType === 'SIGNAL' && !config.notifyOnSignal) return false;
  if (eventType === 'STATUS' && !config.notifyOnBotStatus) return false;

  try {
    const url = `https://api.telegram.org/bot${config.botToken.trim()}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId.trim(),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn('⚠️ Telegram API send warning:', data.description);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('❌ Error sending Telegram notification:', err.message);
    return false;
  }
}

// Memory cache for signal alerts to avoid spamming the same candle
const alertedSignals = new Map<string, number>();

// Map to track symbols that got stopped out to protect against whipsaws in the current cycle
const stoppedOutCycles = new Map<string, { stopTime: number; side: 'LONG' | 'SHORT' }>();

// ==================== SERVER-SIDE 24/7 AUTOMATED CYCLE ====================

// Map to track the last bar time an order was executed per symbol & timeframe
const lastTradedBarTimes = new Map<string, number>();

let isCycleRunning = false;

async function runServerBotCycle() {
  if (isCycleRunning) return;
  const config = serverState.botConfig;
  if (!config.isActive) return;

  const now = Date.now();
  const isFutures = (config.marketType || 'FUTURES') === 'FUTURES';
  const isBanned = isFutures ? (now < binanceFuturesBannedUntil) : (now < binanceSpotBannedUntil);
  if (isBanned) {
    const banUntil = isFutures ? binanceFuturesBannedUntil : binanceSpotBannedUntil;
    const waitSec = Math.ceil((banUntil - now) / 1000);
    if (now - lastBanWarningTime > 20000) {
      lastBanWarningTime = now;
      addServerLog(`⏳ [CIRCUIT BREAKER] พักรอบการทำงานของบอทชั่วคราวเนื่องจากติด Rate Limit จาก Binance ${isFutures ? 'Futures' : 'Spot'} (เหลืออีก ${waitSec} วินาที)...`);
    }
    return;
  }

  isCycleRunning = true;
  try {
    const dirMode = config.directionMode ?? 'LONG_ONLY';
    let symbolsToEvaluate: string[] = [config.symbol];
    if (config.scanMode === 'WATCHLIST') {
      symbolsToEvaluate = config.watchlist && config.watchlist.length > 0
        ? config.watchlist
        : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'XRPUSDT', 'SUIUSDT'];
    } else if (config.scanMode === 'MULTI_SCAN') {
      symbolsToEvaluate = POPULAR_PAIRS.slice(0, 15);
    } else {
      symbolsToEvaluate = [config.symbol];
    }
    const isMultiScan = config.scanMode === 'MULTI_SCAN' || config.scanMode === 'WATCHLIST';

    for (const sym of symbolsToEvaluate) {
      if (!serverState.botConfig.isActive) break;
      const bannedCheck = isFutures ? (Date.now() < binanceFuturesBannedUntil) : (Date.now() < binanceSpotBannedUntil);
      if (bannedCheck) break;

      const rawCandles = await fetchKlinesDirect(sym, config.timeframe, 300, isFutures);
      if (rawCandles.length < 30) continue;

      const cdcCandles = calculateCDCActionZone(rawCandles, config.fastEmaPeriod, config.slowEmaPeriod);
      if (cdcCandles.length < 3) continue;

      // 🎯 Uncle Chaloke Rule: Separate Confirmed Closed Candles from Live Real-Time Candle
      // rawCandles[length - 1] is the unclosed/forming candle (Live Price)
      // rawCandles[length - 2] is the last fully CLOSED confirmed candle (Barstate Confirmed)
      const liveCandle = cdcCandles[cdcCandles.length - 1];
      const closedCandles = cdcCandles.slice(0, -1);
      const confirmedCandle = closedCandles[closedCandles.length - 1];
      const currentPrice = liveCandle.close;

      const barKey = `${sym}_${config.timeframe}`;

      // 1. Check Exits on Active Positions for this symbol
      const existingPosIndex = serverState.paperAccount.activePositions.findIndex((p) => p.symbol === sym);
      if (existingPosIndex !== -1) {
        const pos = serverState.paperAccount.activePositions[existingPosIndex];
        const posLev = pos.leverage || 1;
        const margin = pos.marginUsdt || pos.usdtInvested;

        // Dynamic High/Low Tracking for Trailing Stop Engine
        if (pos.side === 'LONG') {
          pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
        } else {
          pos.lowestPrice = Math.min(pos.lowestPrice || pos.entryPrice, currentPrice);
        }

        const pnlPercent = pos.side === 'SHORT'
          ? ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 * posLev
          : ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * posLev;
        const pnlUsdt = (margin * pnlPercent) / 100;

        let exitReason = '';
        if (pnlPercent <= -90 || (pos.liquidationPrice && (pos.side === 'LONG' ? currentPrice <= pos.liquidationPrice : currentPrice >= pos.liquidationPrice))) {
          exitReason = '⚡ Auto Liquidation (Margin Call -90%)';
        } else if (config.stopLossPercent > 0 && pnlPercent <= -config.stopLossPercent) {
          exitReason = `Stop Loss (-${config.stopLossPercent}%)`;
          // Whipsaw Protection: Record stop-out to lock until new cycle
          stoppedOutCycles.set(barKey, { stopTime: confirmedCandle.time, side: pos.side });
        } else if (config.useTrailingStop && (config.trailingStopPercent || 0) > 0) {
          // 🚀 Trailing Stop Engine Trigger
          const trailPct = config.trailingStopPercent || 7;
          if (pos.side === 'LONG' && pos.highestPrice && pos.highestPrice > pos.entryPrice) {
            const trailCutPrice = pos.highestPrice * (1 - trailPct / 100);
            pos.trailingStopPrice = trailCutPrice;
            if (currentPrice <= trailCutPrice) {
              exitReason = `🚀 Trailing Stop Lock Profit (-${trailPct}% จาก High $${pos.highestPrice.toFixed(2)})`;
            }
          } else if (pos.side === 'SHORT' && pos.lowestPrice && pos.lowestPrice < pos.entryPrice) {
            const trailCutPrice = pos.lowestPrice * (1 + trailPct / 100);
            pos.trailingStopPrice = trailCutPrice;
            if (currentPrice >= trailCutPrice) {
              exitReason = `🚀 Trailing Stop Lock Profit (+${trailPct}% จาก Low $${pos.lowestPrice.toFixed(2)})`;
            }
          }
        }

        // Target Take Profit
        if (!exitReason && config.takeProfitPercent > 0 && pnlPercent >= config.takeProfitPercent) {
          exitReason = `Take Profit (+${config.takeProfitPercent}%)`;
        }

        // CDC Indicator Signal Exit (Confirmed Bar)
        if (!exitReason) {
          const isExitSignal = pos.side === 'SHORT'
            ? (config.buyOnSignal.includes(confirmedCandle.zone as any) || confirmedCandle.zone === 'BLUE' || confirmedCandle.zone === 'GREEN')
            : (config.sellOnSignal.includes(confirmedCandle.zone as any) || confirmedCandle.zone === 'RED' || confirmedCandle.zone === 'YELLOW');
          if (isExitSignal) {
            exitReason = `CDC Exit Signal ${confirmedCandle.colorNameTh} (แท่งปิดคอนเฟิร์ม)`;
          }
        }

        if (exitReason) {
          // If Live Mode and API keys are present, execute live exit on Binance
          if (config.mode === 'BINANCE_LIVE' && serverState.liveApiKeys) {
            try {
              const liveExitRes = await executeLiveServerOrder({
                symbol: pos.symbol,
                side: pos.side === 'LONG' ? 'SELL' : 'BUY',
                quantity: pos.amount,
                reduceOnly: true,
              });
              if (liveExitRes.success) {
                addServerLog(`⚡ [LIVE BINANCE] ปิดสัญญาจริง ${pos.symbol} สำเร็จ (OrderId: ${liveExitRes.orderId})`);
              } else {
                addServerLog(`⚠️ [LIVE BINANCE] ปิดสัญญาจริง ${pos.symbol} ไม่สำเร็จ: ${liveExitRes.error}`);
              }
            } catch (err: any) {
              console.error('Live exit order error:', err);
            }
          }

          const returnUsdt = Math.max(0, margin + pnlUsdt);
          if (config.mode === 'PAPER') {
            serverState.paperAccount.usdtBalance += returnUsdt;
          }
          serverState.paperAccount.activePositions.splice(existingPosIndex, 1);
          serverState.paperAccount.totalTrades += 1;
          if (pnlUsdt > 0) {
            serverState.paperAccount.winningTrades += 1;
          } else {
            serverState.paperAccount.losingTrades += 1;
          }
          serverState.paperAccount.totalProfitUsdt += pnlUsdt;

          const trade: ExecutedTrade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            symbol: pos.symbol,
            timeframe: config.timeframe,
            side: pos.side === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT',
            price: currentPrice,
            amount: pos.amount,
            usdtValue: returnUsdt,
            leverage: posLev,
            pnlUsdt: Number(pnlUsdt.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2)),
            reason: `[Cloud 24/7] ${exitReason}`,
            timestamp: Date.now(),
            mode: config.mode,
          };

          serverState.tradeHistory.unshift(trade);
          if (serverState.tradeHistory.length > 500) {
            serverState.tradeHistory = serverState.tradeHistory.slice(0, 500);
          }

          addServerLog(`🛑 [SERVER 24/7 ${exitReason.includes('Liquidation') ? 'LIQUIDATE' : 'AUTO CLOSE'} ${pos.side} ${posLev}x] ${pos.symbol} @ $${currentPrice} | PnL: ${pnlUsdt >= 0 ? '+' : ''}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%) | เหตุผล: ${exitReason}`);
          saveServerState();

          // Telegram Alert for Exit
          const isWin = pnlUsdt >= 0;
          const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
          const tgExitMsg = `${isWin ? '🎉' : '🛑'} <b>[CDC Action Zone] ${isWin ? 'ปิดทำกำไรสำเร็จ (Take Profit)' : 'ปิดสัญญา / ตัดขาดทุน (Exit)'}</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${pos.symbol}
📊 <b>สถานะ:</b> ${pos.side} ${posLev}x (${config.timeframe})
💰 <b>ราคาปิด:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
${isWin ? '📈' : '📉'} <b>ผลตอบแทน (PnL):</b> ${isWin ? '+' : ''}$${pnlUsdt.toFixed(2)} USDT (${isWin ? '+' : ''}${pnlPercent.toFixed(2)}%)
💵 <b>เงินทุนที่ได้รับคืน:</b> $${returnUsdt.toFixed(2)} USDT
💼 <b>ยอดพอร์ตคงเหลือ:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
📝 <b>เหตุผล:</b> ${exitReason}
🕒 <b>เวลา:</b> ${timeStr}`;
          sendTelegramNotification(tgExitMsg, 'SELL');
        } else {
          pos.currentPnlUsdt = Number(pnlUsdt.toFixed(2));
          pos.currentPnlPercent = Number(pnlPercent.toFixed(2));
        }
        continue;
      }

      // 2. Check Entries for this symbol (Evaluated strictly on Confirmed Closed Bars)
      const maxPositions = config.maxOpenPositions || 5;
      if (serverState.paperAccount.activePositions.length >= maxPositions) {
        break; // Max concurrent slots reached
      }

      // 🎯 Calculate crossovers on confirmed closed candles only
      const crossInfo = getCrossoverInfo(closedCandles);

      // Whipsaw Protection Reset: If an opposite crossover happened, unlock the symbol
      if (stoppedOutCycles.has(barKey)) {
        const lockInfo = stoppedOutCycles.get(barKey)!;
        if (
          (lockInfo.side === 'LONG' && crossInfo.isFreshDeadCross) ||
          (lockInfo.side === 'SHORT' && crossInfo.isFreshGoldenCross)
        ) {
          stoppedOutCycles.delete(barKey);
        }
      }

      // Whipsaw Protection Check: If locked, prevent re-entry in the same cycle
      const isWhipsawLocked = (config.useWhipsawProtection !== false) && stoppedOutCycles.has(barKey);

      const isBuySignal = !isWhipsawLocked && crossInfo.isFreshGoldenCross && (
        (config.buyOnSignal.includes('BLUE') && confirmedCandle.zone === 'BLUE') ||
        (config.buyOnSignal.includes('GREEN') && confirmedCandle.zone === 'GREEN') ||
        (confirmedCandle.zone === 'BLUE' || confirmedCandle.zone === 'GREEN')
      );

      const isSellSignal = !isWhipsawLocked && crossInfo.isFreshDeadCross && (
        (config.sellOnSignal.includes('RED') && confirmedCandle.zone === 'RED') ||
        (config.sellOnSignal.includes('YELLOW') && confirmedCandle.zone === 'YELLOW') ||
        (confirmedCandle.zone === 'RED')
      );

      // Notify Fresh CDC Signal if not already alerted for this confirmed candle
      const signalKey = `${sym}_${config.timeframe}_${confirmedCandle.time}`;
      if ((crossInfo.isFreshGoldenCross || crossInfo.isFreshDeadCross) && !alertedSignals.has(signalKey)) {
        alertedSignals.set(signalKey, Date.now());
        // Clean up cache
        if (alertedSignals.size > 200) {
          const firstKey = alertedSignals.keys().next().value;
          if (firstKey) alertedSignals.delete(firstKey);
        }

        const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const signalMsg = `📡 <b>[CDC Action Zone] ตรวจพบสัญญาณคอนเฟิร์มใหม่!</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${sym} (${config.timeframe})
💡 <b>สัญญาณปิดแท่ง:</b> ${confirmedCandle.colorNameTh} (${confirmedCandle.zone})
🎯 <b>จุดตัด:</b> ${crossInfo.isFreshGoldenCross ? '✨ Golden Cross (EMA 12 ตัดขึ้น EMA 26)' : '⚡ Dead Cross (EMA 12 ตัดลง EMA 26)'}
🏷 <b>ราคาปัจจุบัน:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
⏱ <b>สถานะแท่งเทียน:</b> ปิดแท่งสมบูรณ์แล้ว (Confirmed Close)
🕒 <b>เวลา:</b> ${timeStr}`;
        sendTelegramNotification(signalMsg, 'SIGNAL');
      }

      let targetSide: 'LONG' | 'SHORT' | null = null;
      if ((dirMode === 'LONG_ONLY' || dirMode === 'BOTH') && isBuySignal) {
        targetSide = 'LONG';
      } else if ((dirMode === 'SHORT_ONLY' || dirMode === 'BOTH') && isSellSignal) {
        targetSide = 'SHORT';
      }

      // Check if we have already opened a trade on this exact confirmed candle bar
      if (targetSide && lastTradedBarTimes.get(barKey) !== confirmedCandle.time) {
        const tradeUsdt = config.mode === 'BINANCE_LIVE'
          ? (config.tradeAmountUsdt && config.tradeAmountUsdt >= 5 ? config.tradeAmountUsdt : 20)
          : calculateOrderSize(config, serverState.paperAccount);

        const lev = targetSide === 'LONG'
          ? Math.min(Math.max(1, (config.isSeparateLeverage ? config.longLeverage : null) || config.leverage || 1), 10)
          : Math.min(Math.max(1, (config.isSeparateLeverage ? config.shortLeverage : null) || config.leverage || 1), 10);
        const canExecute = config.mode === 'PAPER'
          ? (tradeUsdt >= 5 && serverState.paperAccount.usdtBalance >= tradeUsdt)
          : (tradeUsdt >= 5);

        if (canExecute) {
          const notionalValue = tradeUsdt * lev;
          const coinAmount = notionalValue / currentPrice;
          const liqPrice = targetSide === 'LONG'
            ? currentPrice * (1 - 0.9 / lev)
            : currentPrice * (1 + 0.9 / lev);

          let liveOrderId: string | number | undefined;

          // If Live Mode, execute real order on Binance first
          if (config.mode === 'BINANCE_LIVE') {
            if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey || !serverState.liveApiKeys.apiSecret) {
              addServerLog(`⚠️ [LIVE AUTO 24/7] ไม่สามารถเปิดสัญญาจริง ${sym} ได้เนื่องจากยังไม่ได้ตั้งค่า Binance API Key`);
              continue;
            }

            try {
              const liveEntryRes = await executeLiveServerOrder({
                symbol: sym,
                side: targetSide === 'LONG' ? 'BUY' : 'SELL',
                quantity: coinAmount,
                leverage: lev,
              });

              if (liveEntryRes.success) {
                liveOrderId = liveEntryRes.orderId;
                addServerLog(`⚡ [LIVE AUTO 24/7] เปิดสัญญาจริง ${targetSide} ${sym} สำเร็จ (OrderId: ${liveOrderId})`);
              } else {
                addServerLog(`⚠️ [LIVE AUTO 24/7 FAILED] เปิดสัญญาจริง ${sym} ไม่สำเร็จ: ${liveEntryRes.error}`);
                continue; // Do not record position if Binance rejected the order
              }
            } catch (err: any) {
              console.error('Live entry order error:', err);
              addServerLog(`⚠️ [LIVE AUTO 24/7 ERROR] เกิดข้อผิดพลาดในการส่งคำสั่ง ${sym}: ${err.message}`);
              continue;
            }
          } else {
            // Paper Mode: deduct virtual USDT balance
            serverState.paperAccount.usdtBalance -= tradeUsdt;
          }

          const newPos: PaperPosition = {
            symbol: sym,
            side: targetSide,
            entryPrice: currentPrice,
            amount: coinAmount,
            usdtInvested: tradeUsdt,
            marginUsdt: tradeUsdt,
            leverage: lev,
            liquidationPrice: Number(liqPrice.toFixed(6)),
            highestPrice: currentPrice,
            lowestPrice: currentPrice,
            entryTime: Date.now(),
            currentPnlUsdt: 0,
            currentPnlPercent: 0,
          };

          serverState.paperAccount.activePositions.push(newPos);
          lastTradedBarTimes.set(barKey, confirmedCandle.time);

          const trade: ExecutedTrade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            symbol: sym,
            timeframe: config.timeframe,
            side: targetSide === 'LONG' ? 'BUY' : 'SELL',
            price: currentPrice,
            amount: coinAmount,
            usdtValue: notionalValue,
            leverage: lev,
            reason: config.mode === 'BINANCE_LIVE'
              ? `[Live Auto 24/7 ${lev}x] สัญญาณ CDC ${confirmedCandle.colorNameTh} (${targetSide}) ${liveOrderId ? `[OrderId: ${liveOrderId}]` : ''}`
              : `[Cloud 24/7 Entry ${lev}x] CDC ${confirmedCandle.colorNameTh} (${targetSide}) [Confirmed Bar]`,
            timestamp: Date.now(),
            mode: config.mode,
          };

          serverState.tradeHistory.unshift(trade);
          if (serverState.tradeHistory.length > 500) {
            serverState.tradeHistory = serverState.tradeHistory.slice(0, 500);
          }

          addServerLog(`🚀 [SERVER 24/7 OPEN ${targetSide} ${lev}x] ${sym} @ $${currentPrice} | ทุน $${tradeUsdt.toFixed(2)} USDT (มูลค่าสัญญา $${notionalValue.toFixed(2)}) | สัญญาณปิดแท่ง ${confirmedCandle.colorNameTh}`);
          saveServerState();

          // Telegram Alert for Open Order
          const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
          const tgOpenMsg = `🟢 <b>[CDC Action Zone Bot] สั่งเปิดออเดอร์อัตโนมัติ (${config.mode === 'BINANCE_LIVE' ? 'พอร์ตจริง Binance 🟢' : 'พอร์ตจำลอง 🗂️'})</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${sym}
📊 <b>สัญญาณปิดแท่ง:</b> CDC ${confirmedCandle.colorNameTh} (${targetSide} ${lev}x)
⏱ <b>ไทม์เฟรม:</b> ${config.timeframe} (Confirmed Close)
💰 <b>ราคาเข้า:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
⚡ <b>Leverage:</b> ${lev}x (${config.marketType || 'SPOT'})
💵 <b>เงินทุน:</b> $${tradeUsdt.toFixed(2)} USDT (มูลค่า $${notionalValue.toFixed(2)})
🎯 <b>Take Profit:</b> +${config.takeProfitPercent}%
🛡 <b>Stop Loss:</b> -${config.stopLossPercent}%
${liveOrderId ? `🆔 <b>Order ID:</b> <code>${liveOrderId}</code>\n` : ''}💼 <b>ยอดพอร์ตคงเหลือ:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
🕒 <b>เวลา:</b> ${timeStr}`;
          sendTelegramNotification(tgOpenMsg, 'BUY');
        }
      }

      // Small pacing delay between symbols to avoid burst
      if (isMultiScan) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } catch (err) {
    console.error('Error in server bot cycle:', err);
  } finally {
    isCycleRunning = false;
  }
}

// Start continuous 24/7 background execution loop every 30 seconds
setInterval(runServerBotCycle, 30000);

// Self-ping heartbeat every 10 minutes to prevent Render Free Tier from sleeping
const RENDER_APP_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_APP_URL) {
  setInterval(async () => {
    try {
      await fetch(`${RENDER_APP_URL}/api/health`);
      console.log('💓 Anti-sleep heartbeat self-ping successful.');
    } catch (e) {
      console.warn('Heartbeat ping failed:', e);
    }
  }, 10 * 60 * 1000);
}

// ==================== AUTHENTICATION REST ENDPOINTS ====================

// Verify credentials against .env (or default)
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const expectedUser = (process.env.AUTH_USERNAME || 'amazon1986').trim();
    const expectedPass = (process.env.AUTH_PASSWORD || 'amazon1986').trim();

    const inputUser = String(username || '').trim();
    const inputPass = String(password || '').trim();

    if (!inputUser || !inputPass) {
      return res.status(400).json({ success: false, error: 'กรุณากรอก Username และ Password ให้ครบถ้วน' });
    }

    if (inputUser !== expectedUser || inputPass !== expectedPass) {
      return res.status(401).json({
        success: false,
        error: 'ชื่อผู้ใช้งาน (Username) หรือรหัสผ่าน (Password) ไม่ถูกต้อง',
      });
    }

    const authUser: AuthUser = {
      username: inputUser,
      name: inputUser === 'amazon1986' ? 'Amazon Quantitative Trader' : inputUser,
      role: 'admin',
      loginTime: Date.now(),
    };

    addServerLog(`👤 [AUTH] ผู้ใช้ ${inputUser} เข้าสู่ระบบสำเร็จ`);
    return res.json({ success: true, user: authUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: sanitizeErrorMessage(err) });
  }
});

// Get public auth info (configured username for auto-fill convenience)
app.get('/api/auth/info', (req, res) => {
  const configuredUser = (process.env.AUTH_USERNAME || 'amazon1986').trim();
  const hasCustomPassword = Boolean(process.env.AUTH_PASSWORD && process.env.AUTH_PASSWORD !== 'your_password_here');
  return res.json({
    username: configuredUser,
    hasCustomPassword,
  });
});

// ==================== CENTRAL BOT REST ENDPOINTS ====================

// 1. Get central server state
app.get('/api/bot/state', (req, res) => {
  return res.json({
    botConfig: serverState.botConfig,
    paperAccount: serverState.paperAccount,
    tradeHistory: serverState.tradeHistory,
    botLogs: serverState.botLogs,
    telegramConfig: serverState.telegramConfig,
    bannedUntil: binanceBannedUntil,
    serverTime: Date.now(),
    isServerRunning: true,
  });
});

// 2. Update bot config
app.post('/api/bot/config', (req, res) => {
  try {
    const updated = req.body as Partial<BotConfig>;
    if (updated.leverage !== undefined) {
      updated.leverage = Math.min(Math.max(1, parseInt(String(updated.leverage), 10) || 1), 10);
    }
    if (updated.longLeverage !== undefined) {
      updated.longLeverage = Math.min(Math.max(1, parseInt(String(updated.longLeverage), 10) || 1), 10);
    }
    if (updated.shortLeverage !== undefined) {
      updated.shortLeverage = Math.min(Math.max(1, parseInt(String(updated.shortLeverage), 10) || 1), 10);
    }
    serverState.botConfig = {
      ...serverState.botConfig,
      ...updated,
    };
    saveServerState();
    const levDesc = serverState.botConfig.isSeparateLeverage
      ? `Long: ${serverState.botConfig.longLeverage || 2}x / Short: ${serverState.botConfig.shortLeverage || 3}x`
      : `${serverState.botConfig.leverage || 1}x`;
    addServerLog(`⚙️ อัปเดตการตั้งค่าบอท: ${serverState.botConfig.symbol} | Leverage: ${levDesc} | TF: ${serverState.botConfig.timeframe} | สถานะ: ${serverState.botConfig.isActive ? 'เปิดทำงาน 🟢' : 'หยุด 🔴'}`);
    return res.json({ success: true, botConfig: serverState.botConfig });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// 3. Toggle bot active status
app.post('/api/bot/toggle', (req, res) => {
  const { isActive } = req.body;
  const next = typeof isActive === 'boolean' ? isActive : !serverState.botConfig.isActive;
  serverState.botConfig.isActive = next;
  saveServerState();
  addServerLog(next ? '🟢 [CLOUD 24/7 BOT ACTIVATED] เริ่มระบบเทรดอัตโนมัติบนคลาวด์' : '🔴 [CLOUD BOT STOPPED] หยุดระบบเทรดอัตโนมัติ');

  // Telegram Alert for Bot Toggle
  const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const levStatusStr = serverState.botConfig.isSeparateLeverage
    ? `Long ${serverState.botConfig.longLeverage || 2}x / Short ${serverState.botConfig.shortLeverage || 3}x`
    : `${serverState.botConfig.leverage || 1}x`;
  const statusMsg = `${next ? '🚀' : '⏸'} <b>[CDC Bot] ${next ? 'เปิดใช้งานระบบเทรดอัตโนมัติ 24/7' : 'หยุดการทำงานของบอทชั่วคราว'}</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>สถานะ:</b> ${next ? 'กำลังทำงาน 🟢 (ACTIVE)' : 'หยุดทำงาน 🔴 (PAUSED)'}
🪙 <b>เหรียญหลัก:</b> #${serverState.botConfig.symbol}
⏱ <b>ไทม์เฟรม:</b> ${serverState.botConfig.timeframe}
⚡ <b>Leverage:</b> ${levStatusStr} (${serverState.botConfig.marketType || 'SPOT'})
💼 <b>โหมด:</b> ${serverState.botConfig.mode === 'PAPER' ? 'พอร์ตจำลอง (Paper Trading)' : 'พอร์ตจริง (Binance Live)'}
🕒 <b>เวลา:</b> ${timeStr}`;
  sendTelegramNotification(statusMsg, 'STATUS');

  return res.json({ success: true, isActive: next });
});

// 4. Manual Order
app.post('/api/bot/manual-order', async (req, res) => {
  try {
    const { symbol: rawSymbol, side: rawSide, amountUsdt, currentPrice } = req.body;
    const symbol = sanitizeSymbol(rawSymbol);
    const side = String(rawSide).toUpperCase();

    if (!symbol || (side !== 'LONG' && side !== 'SHORT') || !amountUsdt || !currentPrice) {
      return res.status(400).json({ error: 'Missing parameters or invalid symbol/side' });
    }

    const config = serverState.botConfig;
    const lev = side === 'LONG'
      ? Math.min(Math.max(1, (config.isSeparateLeverage ? config.longLeverage : null) || config.leverage || 1), 10)
      : Math.min(Math.max(1, (config.isSeparateLeverage ? config.shortLeverage : null) || config.leverage || 1), 10);
    const notionalValue = amountUsdt * lev;
    const coinAmount = notionalValue / currentPrice;
    const liqPrice = side === 'LONG'
      ? currentPrice * (1 - 0.9 / lev)
      : currentPrice * (1 + 0.9 / lev);

    let liveOrderId: string | number | undefined;

    if (serverState.botConfig.mode === 'BINANCE_LIVE') {
      if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey || !serverState.liveApiKeys.apiSecret) {
        return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า Binance API Key กรุณากดปุ่มตั้งค่า (⚙️) เพื่อใส่ API Key ก่อนส่งคำสั่ง' });
      }

      const liveRes = await executeLiveServerOrder({
        symbol,
        side: side === 'LONG' ? 'BUY' : 'SELL',
        quantity: coinAmount,
        leverage: lev,
      });

      if (!liveRes.success) {
        addServerLog(`❌ [LIVE MANUAL FAILED] ส่งคำสั่งจริง ${side} ${symbol} ล้มเหลว: ${liveRes.error}`);
        return res.status(400).json({ error: `Binance ปฏิเสธคำสั่ง: ${liveRes.error}` });
      }

      liveOrderId = liveRes.orderId;
      addServerLog(`⚡ [LIVE MANUAL SUCCESS] ส่งคำสั่งจริง ${side} ${symbol} สำเร็จ (OrderId: ${liveOrderId})`);
    } else {
      if (serverState.paperAccount.usdtBalance < amountUsdt) {
        return res.status(400).json({ error: 'ยอดเงินคงเหลือในพอร์ตจำลองไม่เพียงพอ' });
      }
      serverState.paperAccount.usdtBalance -= amountUsdt;
      serverState.paperAccount.activePositions.push({
        symbol,
        side: side as 'LONG' | 'SHORT',
        entryPrice: currentPrice,
        amount: coinAmount,
        usdtInvested: amountUsdt,
        marginUsdt: amountUsdt,
        leverage: lev,
        liquidationPrice: Number(liqPrice.toFixed(6)),
        entryTime: Date.now(),
        currentPnlUsdt: 0,
        currentPnlPercent: 0,
      });
    }

    const trade: ExecutedTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      symbol,
      timeframe: serverState.botConfig.timeframe,
      side: side === 'LONG' ? 'BUY' : 'SELL',
      price: currentPrice,
      amount: coinAmount,
      usdtValue: notionalValue,
      leverage: lev,
      reason: serverState.botConfig.mode === 'BINANCE_LIVE'
        ? `[Live Manual ${lev}x] สั่งซื้อกระเป๋าจริง (OrderId: ${liveOrderId})`
        : `[Manual Order ${lev}x] เปิด ${side} ด้วยตนเอง`,
      timestamp: Date.now(),
      mode: serverState.botConfig.mode,
    };

    serverState.tradeHistory.unshift(trade);
    saveServerState();

    // Telegram Alert for Manual Order
    const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const tgManualMsg = `✋ <b>[CDC Bot] เปิดออเดอร์ด้วยตนเอง (${serverState.botConfig.mode === 'BINANCE_LIVE' ? 'พอร์ตจริง Binance 🟢' : 'พอร์ตจำลอง 🗂️'})</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${symbol}
📊 <b>คำสั่ง:</b> ${side} ${lev}x
💰 <b>ราคา:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
💵 <b>เงินทุน:</b> $${amountUsdt.toFixed(2)} USDT (มูลค่า $${notionalValue.toFixed(2)})
${liveOrderId ? `🆔 <b>Order ID:</b> <code>${liveOrderId}</code>\n` : ''}🕒 <b>เวลา:</b> ${timeStr}`;
    sendTelegramNotification(tgManualMsg, 'BUY');

    return res.json({ success: true, liveOrderId });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// 5. Manual Close Position
app.post('/api/bot/close-position', async (req, res) => {
  try {
    let { symbol: rawSymbol, currentPrice, reason = 'Manual Close' } = req.body;
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    if (serverState.botConfig.mode === 'BINANCE_LIVE') {
      if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey || !serverState.liveApiKeys.apiSecret) {
        return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า Binance API Key' });
      }

      try {
        const baseUrl = serverState.liveApiKeys.isTestnet
          ? 'https://testnet.binancefuture.com/fapi/v2'
          : 'https://fapi.binance.com/fapi/v2';
        const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
        const signedAccountQuery = buildBinanceSignedQuery(`recvWindow=${recvWindow}&timestamp=${timestamp}`, serverState.liveApiKeys.apiSecret);
        const accountRes = await fetch(`${baseUrl}/account?${signedAccountQuery}`, {
          headers: { 'X-MBX-APIKEY': serverState.liveApiKeys.apiKey },
        });
        const accountData = await accountRes.json();
        const livePositions = Array.isArray(accountData?.positions) ? accountData.positions : [];
        const livePos = livePositions.find((p: any) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);

        if (livePos) {
          const amt = parseFloat(livePos.positionAmt);
          const isLong = amt > 0;
          const closeSide = isLong ? 'SELL' : 'BUY';
          const liveCloseRes = await executeLiveServerOrder({
            symbol,
            side: closeSide,
            quantity: Math.abs(amt),
            reduceOnly: true,
          });

          if (!liveCloseRes.success) {
            addServerLog(`❌ [LIVE MANUAL CLOSE FAILED] ปิดสัญญาจริง ${symbol} ไม่สำเร็จ: ${liveCloseRes.error}`);
            return res.status(400).json({ error: `Binance ปฏิเสธการปิดสัญญา: ${liveCloseRes.error}` });
          }

          addServerLog(`⚡ [LIVE MANUAL CLOSE] ปิดสัญญาจริง ${symbol} สำเร็จ (OrderId: ${liveCloseRes.orderId})`);
        }
      } catch (liveCloseErr: any) {
        console.error('Error closing live position:', liveCloseErr);
      }
    }

    // Also close paper position if present
    const idx = serverState.paperAccount.activePositions.findIndex((p) => p.symbol === symbol);
    if (idx !== -1) {
      const pos = serverState.paperAccount.activePositions[idx];
      const posLev = pos.leverage || 1;
      const margin = pos.marginUsdt || pos.usdtInvested;
      const pnlPercent = pos.side === 'SHORT'
        ? ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 * posLev
        : ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * posLev;
      const pnlUsdt = (margin * pnlPercent) / 100;
      const returnUsdt = Math.max(0, margin + pnlUsdt);

      serverState.paperAccount.usdtBalance += returnUsdt;
      serverState.paperAccount.activePositions.splice(idx, 1);
      serverState.paperAccount.totalTrades += 1;
      if (pnlUsdt > 0) serverState.paperAccount.winningTrades += 1;
      else serverState.paperAccount.losingTrades += 1;
      serverState.paperAccount.totalProfitUsdt += pnlUsdt;

      const trade: ExecutedTrade = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        symbol: pos.symbol,
        timeframe: serverState.botConfig.timeframe,
        side: pos.side === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT',
        price: currentPrice,
        amount: pos.amount,
        usdtValue: returnUsdt,
        leverage: posLev,
        pnlUsdt: Number(pnlUsdt.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        reason: `[Manual Close] ${reason}`,
        timestamp: Date.now(),
        mode: serverState.botConfig.mode,
      };

      serverState.tradeHistory.unshift(trade);
      addServerLog(`✋ [MANUAL CLOSE ${posLev}x] ปิดสัญญา ${pos.symbol} @ $${currentPrice} | PnL: ${pnlUsdt >= 0 ? '+' : ''}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

      // Telegram Alert for Manual Close
      const isWin = pnlUsdt >= 0;
      const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      const tgManualCloseMsg = `${isWin ? '🎉' : '🛑'} <b>[CDC Bot] ปิดสัญญาด้วยตนเอง (Manual Close)</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${pos.symbol}
📊 <b>สถานะ:</b> ${pos.side} ${posLev}x
💰 <b>ราคาปิด:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
${isWin ? '📈' : '📉'} <b>PnL:</b> ${isWin ? '+' : ''}$${pnlUsdt.toFixed(2)} USDT (${isWin ? '+' : ''}${pnlPercent.toFixed(2)}%)
💵 <b>เงินทุนที่ได้รับคืน:</b> $${returnUsdt.toFixed(2)} USDT
🕒 <b>เวลา:</b> ${timeStr}`;
      sendTelegramNotification(tgManualCloseMsg, 'SELL');
    }

    saveServerState();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// 6. Clear Logs
app.post('/api/bot/clear-logs', (req, res) => {
  serverState.botLogs = [];
  saveServerState();
  return res.json({ success: true });
});

// 6.1 Clear Trade History on Server
app.post('/api/bot/clear-history', (req, res) => {
  try {
    const { mode } = req.body || {};
    if (mode === 'BINANCE_LIVE') {
      serverState.tradeHistory = serverState.tradeHistory.filter((t) => t.mode !== 'BINANCE_LIVE');
      addServerLog('🗑️ ลบประวัติคำสั่งซื้อขายจริง (Binance Live Trade Log) บนเซิร์ฟเวอร์เรียบร้อยแล้ว');
    } else if (mode === 'PAPER') {
      serverState.tradeHistory = serverState.tradeHistory.filter((t) => t.mode === 'BINANCE_LIVE');
      addServerLog('🗑️ ลบประวัติการเทรดพอร์ตจำลอง (Paper Trade Log) บนเซิร์ฟเวอร์เรียบร้อยแล้ว');
    } else {
      serverState.tradeHistory = [];
      addServerLog('🗑️ ลบประวัติการส่งคำสั่งซื้อขายทั้งหมดบนเซิร์ฟเวอร์เรียบร้อยแล้ว');
    }
    saveServerState();
    return res.json({ success: true, tradeHistory: serverState.tradeHistory });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// 7. Reset Paper Account
app.post('/api/bot/reset-paper', (req, res) => {
  serverState.paperAccount = {
    usdtBalance: 10000,
    initialUsdtBalance: 10000,
    activePositions: [],
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalProfitUsdt: 0,
  };
  serverState.tradeHistory = [];
  addServerLog('🔄 รีเซ็ตพอร์ตจำลอง (Paper Account) เป็น $10,000 USDT เรียบร้อยแล้ว');
  saveServerState();
  return res.json({ success: true, paperAccount: serverState.paperAccount });
});

// 8. Binance API Keys Storage
app.post('/api/binance/keys', (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, marketType = 'FUTURES', marginType = 'ISOLATED' } = req.body;
    serverState.liveApiKeys = {
      apiKey: String(apiKey || '').trim(),
      apiSecret: String(apiSecret || '').trim(),
      isTestnet: !!isTestnet,
      marketType,
      marginType,
    };
    saveServerState();
    addServerLog(`🔑 [BINANCE KEYS] อัปเดต API Key บนคลาวด์เรียบร้อย (${isTestnet ? 'Testnet' : 'Live'} | ${marketType})`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

app.get('/api/binance/keys', (req, res) => {
  if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey) {
    return res.json({ configured: false });
  }
  const keyStr = serverState.liveApiKeys.apiKey;
  const maskedKey = keyStr.length > 10
    ? `${keyStr.substring(0, 6)}...${keyStr.slice(-4)}`
    : '••••••••';

  return res.json({
    configured: true,
    maskedApiKey: maskedKey,
    isTestnet: serverState.liveApiKeys.isTestnet,
    marketType: serverState.liveApiKeys.marketType,
    marginType: serverState.liveApiKeys.marginType,
  });
});

// ==================== TELEGRAM CONFIG & TEST ENDPOINTS ====================

// Get Telegram configuration
app.get('/api/telegram/config', (req, res) => {
  return res.json(serverState.telegramConfig);
});

// Update Telegram configuration
app.post('/api/telegram/config', (req, res) => {
  try {
    const updated = req.body as Partial<TelegramConfig>;
    serverState.telegramConfig = {
      ...serverState.telegramConfig,
      ...updated,
    };
    saveServerState();
    addServerLog(`📱 อัปเดตการตั้งค่า Telegram Bot Notification (${serverState.telegramConfig.enabled ? 'เปิดใช้งาน 🟢' : 'ปิดใช้งาน 🔴'})`);
    return res.json({ success: true, telegramConfig: serverState.telegramConfig });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// Test Telegram notification message
app.post('/api/telegram/test', async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    const token = (botToken || serverState.telegramConfig.botToken || '').trim();
    const chat = (chatId || serverState.telegramConfig.chatId || '').trim();

    if (!token || !chat) {
      return res.status(400).json({ error: 'กรุณาระบุ Telegram Bot Token และ Chat ID' });
    }

    const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const testMsg = `🚀 <b>[CDC Action Zone Bot] ทดสอบการเชื่อมต่อ Telegram สำเร็จ!</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>สถานะ:</b> ระบบเชื่อมต่อกับ Telegram เรียบร้อยแล้ว
🤖 <b>บอทเทรด:</b> CDC Action Zone V2 (Binance)
📈 <b>กลยุทธ์:</b> สูตรลุงโฉลก (EMA 12/26 Action Zone)
⏱ <b>เซิร์ฟเวอร์:</b> Cloud Bot 24/7 พร้อมส่งการแจ้งเตือนทันที
🕒 <b>เวลาทดสอบ:</b> ${timeStr}

<i>ขอให้คุณประสบความสำเร็จและมีกำไรจากการลงทุนอย่างมีวินัยครับ! 🎯</i>`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: testMsg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return res.status(400).json({
        error: data.description || 'ไม่สามารถส่งข้อความไปยัง Telegram ได้ กรุณาตรวจสอบ Bot Token และ Chat ID (และกด Start กับบอทใน Telegram ก่อน)',
      });
    }

    addServerLog(`📱 ทดสอบส่งข้อความแจ้งเตือน Telegram ไปยัง Chat ID: ${chat} สำเร็จ 🟢`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// 8. Health check & uptime
app.get('/api/health', (req, res) => {
  return res.json({
    status: 'ok',
    uptime: process.uptime(),
    isBotActive: serverState.botConfig.isActive,
    time: new Date().toISOString(),
  });
});


// ==================== BINANCE PROXY ENDPOINTS ====================

app.get('/api/binance/klines', async (req, res) => {
  try {
    const rawSymbol = (req.query.symbol as string) || 'BTCUSDT';
    const interval = String(req.query.interval || '1h');
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '300'), 10) || 300), 1000);

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });
    if (!VALID_INTERVALS.includes(interval)) return res.status(400).json({ error: 'Invalid interval' });

    const cacheKey = `${symbol}_${interval}_${limit}`;
    const now = Date.now();
    const ttl = getServerTimeframeCacheTtl(interval);
    const cached = serverKlineCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }

    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json(cached.data);
      return res.status(429).json({ error: 'Binance API is in rate limit cooldown', bannedUntil: binanceSpotBannedUntil });
    }

    const candidateUrls = [
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    ];

    let lastErrText = '';
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastErrText = await response.text().catch(() => '');
          handleBinanceRateLimitError(response.status, lastErrText, `klines ${symbol}`);
          continue;
        }
        const data = await response.json();
        serverKlineCache.set(cacheKey, { data, expiry: now + ttl });
        return res.json(data);
      } catch (e) {
        continue;
      }
    }

    if (cached) return res.json(cached.data);
    return res.status(502).json({ error: 'Binance API request failed', details: lastErrText });
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

app.get('/api/binance/ticker24h', async (req, res) => {
  try {
    const rawSymbol = req.query.symbol as string | undefined;
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const now = Date.now();
    if (!symbol && serverTickerCache && now < serverTickerCache.expiry) {
      return res.json(serverTickerCache.data);
    }

    if (now < binanceSpotBannedUntil) {
      if (serverTickerCache) return res.json(serverTickerCache.data);
      return res.status(429).json({ error: 'Binance API is in rate limit cooldown', bannedUntil: binanceSpotBannedUntil });
    }

    const candidateUrls = symbol
      ? [
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
          `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
          `https://api2.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
        ]
      : [
          `https://api.binance.com/api/v3/ticker/24hr`,
          `https://api1.binance.com/api/v3/ticker/24hr`,
          `https://api2.binance.com/api/v3/ticker/24hr`,
        ];

    let lastErr = '';
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastErr = await response.text().catch(() => '');
          handleBinanceRateLimitError(response.status, lastErr, 'ticker24h');
          continue;
        }
        const data = await response.json();
        if (!symbol) {
          serverTickerCache = { data, expiry: now + 60000 }; // 60s TTL
        }
        return res.json(data);
      } catch (e) {
        continue;
      }
    }

    if (serverTickerCache) return res.json(serverTickerCache.data);
    return res.status(502).json({ error: 'Ticker request failed', details: lastErr });
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

app.get('/api/binance/depth', async (req, res) => {
  try {
    const rawSymbol = (req.query.symbol as string) || 'BTCUSDT';
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20), 5000);
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const cacheKey = `${symbol}_${limit}`;
    const now = Date.now();
    const cached = serverDepthCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }

    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json(cached.data);
      return res.status(429).json({ error: 'Binance API is in rate limit cooldown' });
    }

    const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      handleBinanceRateLimitError(response.status, errText, 'depth');
      if (cached) return res.json(cached.data);
      return res.status(response.status).json({ error: 'Depth request failed' });
    }
    const data = await response.json();
    serverDepthCache.set(cacheKey, { data, expiry: now + 15000 }); // 15s TTL
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

app.get('/api/binance/exchangeInfo', async (req, res) => {
  try {
    const rawSymbol = req.query.symbol as string | undefined;
    const isTestnet = req.query.isTestnet === 'true';
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const cacheKey = `${symbol || 'ALL'}_${isTestnet}`;
    const now = Date.now();
    const cached = serverExchangeInfoCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }

    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json(cached.data);
      return res.status(429).json({ error: 'Binance API is in rate limit cooldown' });
    }

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const url = symbol ? `${baseUrl}/exchangeInfo?symbol=${symbol}` : `${baseUrl}/exchangeInfo`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      handleBinanceRateLimitError(response.status, errText, 'exchangeInfo');
      if (cached) return res.json(cached.data);
      return res.status(response.status).json({ error: 'ExchangeInfo request failed' });
    }
    const data = await response.json();
    serverExchangeInfoCache.set(cacheKey, { data, expiry: now + 300000 }); // 5 min TTL
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Time sync helper with Binance server
const binanceTimeOffsets: Record<string, number> = {};
const lastTimeSync: Record<string, number> = {};

async function getBinanceTimestamp(baseUrl: string): Promise<{ timestamp: number; recvWindow: number }> {
  const now = Date.now();
  const lastSync = lastTimeSync[baseUrl] || 0;

  if (now - lastSync > 60 * 1000) {
    try {
      const start = Date.now();
      const res = await fetch(`${baseUrl}/time`);
      if (res.ok) {
        const data = (await res.json()) as { serverTime: number };
        const end = Date.now();
        const latency = Math.floor((end - start) / 2);
        binanceTimeOffsets[baseUrl] = data.serverTime + latency - end;
        lastTimeSync[baseUrl] = end;
      }
    } catch (e) {
      console.warn('Failed to sync time with Binance:', e);
    }
  }

  const offset = binanceTimeOffsets[baseUrl] || 0;
  const timestamp = now + offset - 1000;
  return { timestamp, recvWindow: 10000 };
}

app.post('/api/binance/account', async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const keyHash = `${apiKey.slice(0, 8)}_${isTestnet ? 'test' : 'live'}`;
    const now = Date.now();
    const cached = serverAccountCache.get(keyHash);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }

    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(429).json({ error: 'Binance Spot API is in cooldown due to IP rate limit', bannedUntil: binanceSpotBannedUntil });
    }

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/account?${signedQuery}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();
    if (!response.ok) {
      handleBinanceRateLimitError(response.status, data, 'spot account', false);
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(response.status).json({ error: data.msg || 'Binance Account API error' });
    }

    const balances = (data.balances || []).filter(
      (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );

    const result = {
      success: true,
      canTrade: data.canTrade,
      accountType: data.accountType,
      balances,
    };

    serverAccountCache.set(keyHash, { data: result, expiry: now + 20000 }); // 20s TTL
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

app.post('/api/binance/order', orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity, price, orderType: rawOrderType = 'MARKET' } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const side = String(rawSide).toUpperCase();
    if (!VALID_SIDE_VALUES.includes(side)) return res.status(400).json({ error: 'Invalid side' });

    const orderType = String(rawOrderType).toUpperCase();
    if (!VALID_ORDER_TYPES.includes(orderType)) return res.status(400).json({ error: 'Invalid order type' });

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    let queryParts = [
      `symbol=${symbol}`,
      `side=${side}`,
      `type=${orderType}`,
      `quantity=${qty}`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`,
    ];

    if (orderType === 'LIMIT' && price) {
      queryParts.push(`price=${parseFloat(price)}`, `timeInForce=GTC`);
    }

    const queryString = queryParts.join('&');
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || 'Binance order rejected' });
    }

    return res.json({ success: true, order: data });
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Save Encrypted API Keys to Server for 24/7 Live Automation
app.post('/api/binance/keys', (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, marketType = 'SPOT', marginType = 'ISOLATED' } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Missing API Key credentials' });
    }
    serverState.liveApiKeys = { apiKey, apiSecret, isTestnet: !!isTestnet, marketType, marginType };
    saveServerState();
    addServerLog(`🔑 ซิงก์ Binance API Key ขึ้นเซิร์ฟเวอร์เรียบร้อย (${isTestnet ? 'Testnet' : 'Live'} | ${marketType})`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// Binance Futures Account Balance Proxy Endpoint
app.post('/api/binance/futures/account', async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const keyHash = `${apiKey.slice(0, 8)}_${isTestnet ? 'test' : 'live'}`;
    const now = Date.now();
    const cached = serverFuturesAccountCache.get(keyHash);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }

    if (now < binanceFuturesBannedUntil) {
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(429).json({ error: 'Binance Futures API is in cooldown due to IP rate limit', bannedUntil: binanceFuturesBannedUntil });
    }

    const baseUrl = isTestnet
      ? 'https://testnet.binancefuture.com/fapi/v2'
      : 'https://fapi.binance.com/fapi/v2';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/account?${signedQuery}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();
    if (!response.ok) {
      handleBinanceRateLimitError(response.status, data, 'futures account', true);
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(response.status).json({ error: data.msg || 'Binance Futures Account API error' });
    }

    const result = {
      success: true,
      canTrade: data.canTrade,
      feeTier: data.feeTier,
      assets: data.assets || [],
      positions: data.positions || [],
    };

    serverFuturesAccountCache.set(keyHash, { data: result, expiry: now + 20000 }); // 20s TTL
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Binance Futures Set Leverage Proxy Endpoint
app.post('/api/binance/futures/leverage', async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, leverage } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const lev = Math.min(Math.max(1, parseInt(String(leverage || 1), 10)), 10);
    const baseUrl = isTestnet
      ? 'https://testnet.binancefuture.com/fapi/v1'
      : 'https://fapi.binance.com/fapi/v1';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `symbol=${symbol}&leverage=${lev}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/leverage?${signedQuery}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || 'Failed to set Futures leverage' });
    }

    return res.json({ success: true, leverage: data.leverage, symbol: data.symbol });
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Binance Futures Order Proxy Endpoint
app.post('/api/binance/futures/order', orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity, price, orderType: rawOrderType = 'MARKET', reduceOnly } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const side = String(rawSide).toUpperCase();
    if (!VALID_SIDE_VALUES.includes(side)) return res.status(400).json({ error: 'Invalid side' });

    const orderType = String(rawOrderType).toUpperCase();
    if (!VALID_ORDER_TYPES.includes(orderType)) return res.status(400).json({ error: 'Invalid order type' });

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    const baseUrl = isTestnet
      ? 'https://testnet.binancefuture.com/fapi/v1'
      : 'https://fapi.binance.com/fapi/v1';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    let queryParts = [
      `symbol=${symbol}`,
      `side=${side}`,
      `type=${orderType}`,
      `quantity=${qty}`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`,
    ];

    if (reduceOnly) {
      queryParts.push(`reduceOnly=true`);
    }

    if (orderType === 'LIMIT' && price) {
      queryParts.push(`price=${parseFloat(price)}`, `timeInForce=GTC`);
    }

    const queryString = queryParts.join('&');
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || 'Binance Futures order rejected' });
    }

    return res.json({ success: true, order: data });
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Binance Futures Close Position Proxy Endpoint (Market ReduceOnly)
app.post('/api/binance/futures/close-position', orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });

    // If currently LONG, we must SELL to close. If currently SHORT, we must BUY to close.
    const posSide = String(rawSide).toUpperCase();
    const orderSide = posSide === 'LONG' || posSide === 'BUY' ? 'SELL' : 'BUY';

    const baseUrl = isTestnet
      ? 'https://testnet.binancefuture.com/fapi/v1'
      : 'https://fapi.binance.com/fapi/v1';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryParts = [
      `symbol=${symbol}`,
      `side=${orderSide}`,
      `type=MARKET`,
      `quantity=${qty}`,
      `reduceOnly=true`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`,
    ];

    const queryString = queryParts.join('&');
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || 'Failed to close Futures position' });
    }

    addServerLog(`⚡ ปิดสัญญาจริง Binance Futures: ${symbol} (${orderSide} ${qty}) สำเร็จ`);
    return res.json({ success: true, order: data });
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Binance Live Trade History & Income Proxy Endpoint
app.post('/api/binance/history', async (req, res) => {
  try {
    const {
      apiKey,
      apiSecret,
      isTestnet,
      symbol: rawSymbol,
      marketType = 'FUTURES',
      limit = 100,
    } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Invalid API credentials' });
    }

    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    const historyLimit = Math.min(Math.max(10, parseInt(String(limit || 100), 10)), 500);

    if (marketType === 'FUTURES') {
      const fapiBaseV1 = isTestnet
        ? 'https://testnet.binancefuture.com/fapi/v1'
        : 'https://fapi.binance.com/fapi/v1';
      const fapiBaseV2 = isTestnet
        ? 'https://testnet.binancefuture.com/fapi/v2'
        : 'https://fapi.binance.com/fapi/v2';

      const { timestamp, recvWindow } = await getBinanceTimestamp(fapiBaseV1);

      // 1. Fetch Realized PnL & Income history from /fapi/v1/income
      let incomeQueryParts = [
        `recvWindow=${recvWindow}`,
        `timestamp=${timestamp}`,
        `limit=${historyLimit}`,
      ];
      if (symbol) {
        incomeQueryParts.unshift(`symbol=${symbol}`);
      }

      const signedIncomeQuery = buildBinanceSignedQuery(incomeQueryParts.join('&'), apiSecret);
      const incomePromise = fetch(`${fapiBaseV1}/income?${signedIncomeQuery}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      }).then(async (r) => (r.ok ? r.json() : []));

      // 2. Fetch Active Positions from /fapi/v2/account
      const signedAccountQuery = buildBinanceSignedQuery(`recvWindow=${recvWindow}&timestamp=${timestamp}`, apiSecret);
      const accountPromise = fetch(`${fapiBaseV2}/account?${signedAccountQuery}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      }).then(async (r) => (r.ok ? r.json() : { positions: [] }));

      // 3. Fetch Specific Symbol User Trades if symbol is provided
      let userTradesPromise: Promise<any[]> = Promise.resolve([]);
      if (symbol) {
        const userTradesQuery = buildBinanceSignedQuery(
          `symbol=${symbol}&limit=${historyLimit}&recvWindow=${recvWindow}&timestamp=${timestamp}`,
          apiSecret
        );
        userTradesPromise = fetch(`${fapiBaseV1}/userTrades?${userTradesQuery}`, {
          headers: { 'X-MBX-APIKEY': apiKey },
        }).then(async (r) => (r.ok ? r.json() : []));
      }

      const [incomeData, accountData, userTradesData] = await Promise.all([
        incomePromise,
        accountPromise,
        userTradesPromise,
      ]);

      // Extract Active Live Positions (positionAmt != 0)
      const rawPositions = Array.isArray(accountData?.positions) ? accountData.positions : [];
      const livePositions = rawPositions
        .filter((p: any) => parseFloat(p.positionAmt) !== 0)
        .map((p: any) => {
          const amt = parseFloat(p.positionAmt);
          const entryPrice = parseFloat(p.entryPrice);
          const unPnl = parseFloat(p.unrealizedProfit);
          const initMargin = parseFloat(p.initialMargin || p.positionInitialMargin || '0');
          const pnlPercent = initMargin > 0 ? (unPnl / initMargin) * 100 : 0;
          return {
            symbol: p.symbol,
            positionSide: p.positionSide || (amt > 0 ? 'LONG' : 'SHORT'),
            positionAmt: amt,
            entryPrice,
            markPrice: entryPrice > 0 ? entryPrice * (1 + unPnl / (Math.abs(amt) * entryPrice || 1)) : 0,
            unrealizedProfit: unPnl,
            initialMargin: initMargin,
            leverage: parseInt(p.leverage || '1', 10),
            isolated: p.isolated ?? true,
            pnlPercent,
          };
        });

      // Build unified trade items
      const trades: any[] = [];
      const tradeIdSet = new Set<string>();

      // If userTrades available, add them
      if (Array.isArray(userTradesData)) {
        for (const t of userTradesData) {
          const id = `trade_${t.id || t.orderId}_${t.time}`;
          if (tradeIdSet.has(id)) continue;
          tradeIdSet.add(id);

          const realizedPnl = parseFloat(t.realizedPnl || '0');
          const isBuyer = t.buyer === true || t.side === 'BUY';
          const pnlPos = realizedPnl !== 0;

          let displaySide = t.side;
          if (pnlPos) {
            displaySide = isBuyer ? 'CLOSE_SHORT' : 'CLOSE_LONG';
          } else {
            displaySide = isBuyer ? 'LONG' : 'SHORT';
          }

          trades.push({
            id: String(t.id || t.orderId),
            orderId: t.orderId,
            symbol: t.symbol,
            side: displaySide,
            price: parseFloat(t.price),
            qty: parseFloat(t.qty),
            quoteQty: parseFloat(t.quoteQty || (parseFloat(t.price) * parseFloat(t.qty)).toFixed(4)),
            realizedPnl: realizedPnl,
            commission: parseFloat(t.commission || '0'),
            commissionAsset: t.commissionAsset || 'USDT',
            time: Number(t.time),
            marketType: 'FUTURES',
            positionSide: t.positionSide,
            reason: pnlPos ? (realizedPnl >= 0 ? 'ทำกำไร (Take Profit)' : 'ตัดขาดทุน (Stop Loss)') : 'ส่งคำสั่งเปิดโพซิชัน',
          });
        }
      }

      // Process Income Data (Realized PnL & Funding)
      if (Array.isArray(incomeData)) {
        for (const inc of incomeData) {
          const tranId = `income_${inc.tranId || inc.tradeId || inc.time}`;
          if (tradeIdSet.has(tranId)) continue;
          tradeIdSet.add(tranId);

          const incomeVal = parseFloat(inc.income || '0');
          const isPnl = inc.incomeType === 'REALIZED_PNL';
          const isFunding = inc.incomeType === 'FUNDING_FEE';
          const isCommission = inc.incomeType === 'COMMISSION';
          const isTransfer = inc.incomeType === 'TRANSFER';

          let reason = inc.incomeType;
          let side: string = 'INFO';

          if (isPnl) {
            reason = incomeVal >= 0 ? 'กำไรปิดสัญญา (Realized PnL)' : 'ขาดทุนปิดสัญญา (Realized Loss)';
            side = incomeVal >= 0 ? 'CLOSE_LONG' : 'CLOSE_SHORT';
          } else if (isFunding) {
            reason = `ค่าธรรมเนียม Funding Rate (${incomeVal >= 0 ? '+' : ''}${incomeVal.toFixed(4)} ${inc.asset || 'USDT'})`;
            side = 'FUNDING';
          } else if (isCommission) {
            reason = `ค่าธรรมเนียม Commission (${Math.abs(incomeVal).toFixed(4)} ${inc.asset || 'USDT'})`;
            side = 'FEE';
          } else if (isTransfer) {
            reason = incomeVal >= 0
              ? `โอนเงินเข้ากระเป๋า Futures (+${incomeVal.toFixed(2)} ${inc.asset || 'USDT'})`
              : `โอนเงินออกจากกระเป๋า Futures (${incomeVal.toFixed(2)} ${inc.asset || 'USDT'})`;
            side = incomeVal >= 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT';
          } else {
            reason = `รายการ ${inc.incomeType} (${incomeVal.toFixed(4)} ${inc.asset || 'USDT'})`;
            side = 'OTHER';
          }

          trades.push({
            id: String(inc.tranId || inc.tradeId || inc.time),
            orderId: inc.tradeId,
            symbol: inc.symbol || 'USDT',
            side,
            price: 0,
            qty: 0,
            quoteQty: Math.abs(incomeVal),
            realizedPnl: isPnl ? incomeVal : undefined,
            commission: isCommission ? Math.abs(incomeVal) : undefined,
            commissionAsset: inc.asset || 'USDT',
            time: Number(inc.time),
            marketType: 'FUTURES',
            reason,
          });
        }
      }

      // Sort by time descending
      trades.sort((a, b) => b.time - a.time);

      // Compute statistics
      let totalRealizedPnl = 0;
      let winCount = 0;
      let lossCount = 0;

      for (const tr of trades) {
        if (tr.realizedPnl !== undefined && tr.realizedPnl !== 0) {
          totalRealizedPnl += tr.realizedPnl;
          if (tr.realizedPnl > 0) winCount++;
          else if (tr.realizedPnl < 0) lossCount++;
        }
      }

      return res.json({
        success: true,
        trades,
        livePositions,
        totalRealizedPnl,
        winCount,
        lossCount,
      });
    } else {
      // SPOT Trade History
      const spotBase = isTestnet
        ? 'https://testnet.binance.vision/api/v3'
        : 'https://api.binance.com/api/v3';

      const { timestamp, recvWindow } = await getBinanceTimestamp(spotBase);
      const querySymbol = symbol || 'BTCUSDT';
      const queryString = `symbol=${querySymbol}&limit=${historyLimit}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
      const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

      const spotRes = await fetch(`${spotBase}/myTrades?${signedQuery}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });

      const spotData = await spotRes.json();
      if (!spotRes.ok) {
        return res.status(spotRes.status).json({ error: spotData.msg || 'Binance Spot myTrades failed' });
      }

      const trades = (Array.isArray(spotData) ? spotData : []).map((t: any) => ({
        id: String(t.id || t.orderId),
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.isBuyer ? 'BUY' : 'SELL',
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        quoteQty: parseFloat(t.quoteQty || (parseFloat(t.price) * parseFloat(t.qty)).toFixed(4)),
        commission: parseFloat(t.commission || '0'),
        commissionAsset: t.commissionAsset || 'BNB',
        time: Number(t.time),
        marketType: 'SPOT',
        reason: t.isBuyer ? 'ซื้อ Spot (Buy)' : 'ขาย Spot (Sell)',
      }));

      trades.sort((a: any, b: any) => b.time - a.time);

      return res.json({
        success: true,
        trades,
        livePositions: [],
        totalRealizedPnl: 0,
        winCount: 0,
        lossCount: 0,
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});


// ==================== AI ANALYST (GEMINI) ====================

app.post('/api/ai/analyze', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'GEMINI_API_KEY is not configured on server. Please set GEMINI_API_KEY in environment variables.',
      });
    }

    const { symbol, timeframe, currentPrice, zone, emaFast, emaSlow, recentCandles } = req.body;
    const ai = new GoogleGenAI({ apiKey });

    const recentCandlesSummary = Array.isArray(recentCandles)
      ? recentCandles.slice(-10).map((c: any) => `Time: ${new Date(c.time * 1000).toISOString().slice(0, 16)} | Close: ${c.close} | Zone: ${c.zone} | Color: ${c.colorNameTh}`).join('\n')
      : 'ไม่มีข้อมูลแท่งเทียนย้อนหลัง';

    const prompt = `คุณคือผู้เชี่ยวชาญด้าน Technical Analysis คริปโตเคอร์เรนซี และเป็นศิษย์เอกของระบบ CDC Action Zone V2/V3 (สูตรลุงโฉลก - Chaloke.org)
วิเคราะห์เหรียญ ${symbol} บนไทม์เฟรม ${timeframe}:
- ราคาปัจจุบัน: $${currentPrice}
- สถานะ CDC Zone: ${zone}
- EMA 12: $${emaFast} | EMA 26: $${emaSlow}
ข้อมูลแท่งเทียน:
${recentCandlesSummary}

ตอบเป็นรูปแบบ JSON:
{
  "summary": "สรุปการวิเคราะห์เชิงเทคนิค 2-3 ประโยค",
  "marketTrend": "BULLISH" หรือ "BEARISH" หรือ "SIDEWAYS",
  "keyLevels": { "support": [แนวรับ1, แนวรับ2], "resistance": [แนวต้าน1, แนวต้าน2] },
  "botRecommendation": "คำแนะนำสั้นๆ สำหรับตั้งค่า Bot CDC Action Zone",
  "riskAssessment": "ประเมินความเสี่ยงและคำแนะนำสัดส่วนพอร์ต"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text || '';
    let parsedData;
    try {
      parsedData = JSON.parse(text);
    } catch {
      parsedData = {
        summary: text,
        marketTrend: 'SIDEWAYS',
        keyLevels: { support: [currentPrice * 0.95], resistance: [currentPrice * 1.05] },
        botRecommendation: 'ทำตามวินัย CDC Action Zone V2',
        riskAssessment: 'ตั้ง Stop loss ทุกครั้งเพื่อป้องกันความเสี่ยง',
      };
    }

    return res.json(parsedData);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// ==================== VITE & SERVER LAUNCH ====================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CDC Action Zone 24/7 Cloud Bot Server running on port ${PORT}`);
  });
}

startServer();
