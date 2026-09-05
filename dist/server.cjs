var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_helmet = __toESM(require("helmet"), 1);
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");

// src/lib/cdcIndicator.ts
function calculateEMA(prices, period) {
  const ema = new Array(prices.length).fill(0);
  if (prices.length < period) return ema;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }
  let cumulative = 0;
  for (let i = 0; i < period - 1; i++) {
    cumulative += prices[i];
    ema[i] = cumulative / (i + 1);
  }
  return ema;
}
function calculateCDCActionZone(rawCandles, fastPeriod = 12, slowPeriod = 26) {
  if (!rawCandles || rawCandles.length === 0) return [];
  const closePrices = rawCandles.map((c) => c.close);
  const emaFastList = calculateEMA(closePrices, fastPeriod);
  const emaSlowList = calculateEMA(closePrices, slowPeriod);
  const result = [];
  for (let i = 0; i < rawCandles.length; i++) {
    const candle = rawCandles[i];
    const close = candle.close;
    const fast = emaFastList[i];
    const slow = emaSlowList[i];
    const prevCandle = i > 0 ? result[i - 1] : null;
    const prevFast = prevCandle?.emaFast ?? fast;
    const prevSlow = prevCandle?.emaSlow ?? slow;
    const prevClose = prevCandle?.close ?? close;
    let zone = "CYAN";
    let signal = "NEUTRAL";
    let colorNameTh = "\u0E42\u0E0B\u0E19\u0E2A\u0E16\u0E34\u0E15\u0E22\u0E4C";
    let actionRecommendation = "\u0E23\u0E2D\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13";
    const isBullishCross = prevFast <= prevSlow && fast > slow;
    const isBearishCross = prevFast >= prevSlow && fast < slow;
    if (fast > slow) {
      if (close >= fast) {
        if (isBullishCross || prevCandle && (prevCandle.zone === "YELLOW" || prevCandle.zone === "RED" || prevCandle.zone === "ORANGE")) {
          zone = "BLUE";
          signal = "BUY";
          colorNameTh = "\u0E42\u0E0B\u0E19\u0E1F\u0E49\u0E32 (\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E0B\u0E37\u0E49\u0E2D)";
          actionRecommendation = "\u0E40\u0E02\u0E49\u0E32\u0E0B\u0E37\u0E49\u0E2D / Buy Trigger";
        } else {
          zone = "GREEN";
          signal = "HOLD_BULL";
          colorNameTh = "\u0E42\u0E0B\u0E19\u0E40\u0E02\u0E35\u0E22\u0E27 (\u0E02\u0E32\u0E02\u0E36\u0E49\u0E19\u0E23\u0E38\u0E19\u0E41\u0E23\u0E07)";
          actionRecommendation = "\u0E16\u0E37\u0E2D\u0E04\u0E23\u0E2D\u0E07 / Hold Long";
        }
      } else {
        zone = "YELLOW";
        signal = "WARNING";
        colorNameTh = "\u0E42\u0E0B\u0E19\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E07 (\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E23\u0E30\u0E27\u0E31\u0E07)";
        actionRecommendation = "\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E02\u0E32\u0E22 / Take Profit Warning";
      }
    } else if (fast < slow) {
      if (close <= fast) {
        if (isBearishCross) {
          signal = "SELL";
        } else {
          signal = "HOLD_BEAR";
        }
        zone = "RED";
        colorNameTh = "\u0E42\u0E0B\u0E19\u0E41\u0E14\u0E07 (\u0E02\u0E32\u0E25\u0E07 / \u0E16\u0E37\u0E2D\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14)";
        actionRecommendation = "\u0E02\u0E32\u0E22\u0E2D\u0E2D\u0E01 / Hold Cash / Short";
      } else {
        zone = "ORANGE";
        signal = "NEUTRAL";
        colorNameTh = "\u0E42\u0E0B\u0E19\u0E2A\u0E49\u0E21 (\u0E23\u0E35\u0E1A\u0E32\u0E27\u0E14\u0E4C\u0E2B\u0E25\u0E2D\u0E01)";
        actionRecommendation = "\u0E2D\u0E22\u0E48\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E07\u0E0B\u0E37\u0E49\u0E2D / Bearish Bounce";
      }
    } else {
      zone = "CYAN";
      signal = "NEUTRAL";
      colorNameTh = "\u0E42\u0E0B\u0E19\u0E44\u0E0B\u0E41\u0E2D\u0E19 (\u0E44\u0E0B\u0E14\u0E4C\u0E40\u0E27\u0E22\u0E4C)";
      actionRecommendation = "\u0E40\u0E1D\u0E49\u0E32\u0E23\u0E30\u0E27\u0E31\u0E07";
    }
    result.push({
      ...candle,
      emaFast: fast,
      emaSlow: slow,
      zone,
      signal,
      colorNameTh,
      actionRecommendation
    });
  }
  return result;
}
function getCrossoverInfo(candles) {
  let lastGoldenCross = -1;
  let lastDeadCross = -1;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    if (prev.emaFast !== void 0 && prev.emaSlow !== void 0 && curr.emaFast !== void 0 && curr.emaSlow !== void 0) {
      if (prev.emaFast <= prev.emaSlow && curr.emaFast > curr.emaSlow) {
        lastGoldenCross = i;
      } else if (prev.emaFast >= prev.emaSlow && curr.emaFast < curr.emaSlow) {
        lastDeadCross = i;
      }
    }
  }
  const n = candles.length;
  const barsSinceGoldenCross = lastGoldenCross >= 0 ? n - 1 - lastGoldenCross : 999;
  const barsSinceDeadCross = lastDeadCross >= 0 ? n - 1 - lastDeadCross : 999;
  return {
    lastGoldenCrossBarIndex: lastGoldenCross,
    lastDeadCrossBarIndex: lastDeadCross,
    barsSinceGoldenCross,
    barsSinceDeadCross,
    // 🎯 Only within 0 (crossover bar) or 1 (next confirmation bar) according to Uncle Chaloke's rule:
    isFreshGoldenCross: barsSinceGoldenCross <= 1,
    isFreshDeadCross: barsSinceDeadCross <= 1
  };
}

// src/lib/binanceApi.ts
var POPULAR_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "SUIUSDT",
  "LINKUSDT",
  "NEARUSDT",
  "DOTUSDT",
  "PEPEUSDT",
  "SHIBUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "LTCUSDT",
  "UNIUSDT",
  "RENDERUSDT",
  "FETUSDT",
  "INJUSDT",
  "TIAUSDT",
  "BONKUSDT",
  "FLOKIUSDT"
];
var WALLET_CACHE_KEY = "cdc_binance_cached_wallet_v2";
var inMemoryWalletCache = (() => {
  try {
    const saved = localStorage.getItem(WALLET_CACHE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
})();

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.use((0, import_helmet.default)({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use((0, import_cors.default)({
  origin: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));
var generalLimiter = (0, import_express_rate_limit.default)({
  windowMs: 1 * 60 * 1e3,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});
var orderLimiter = (0, import_express_rate_limit.default)({
  windowMs: 1 * 60 * 1e3,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Order rate limit exceeded." }
});
app.use("/api/", generalLimiter);
app.use(import_express.default.json({ limit: "200kb" }));
var DATA_DIR = import_path.default.join(process.cwd(), "data");
var STATE_FILE = import_path.default.join(DATA_DIR, "bot_state.json");
var DEFAULT_SERVER_STATE = {
  botConfig: {
    id: "default_bot",
    symbol: "BTCUSDT",
    timeframe: "1d",
    fastEmaPeriod: 12,
    slowEmaPeriod: 26,
    tradeAmountUsdt: 15,
    usePercentBalance: true,
    balancePercent: 33,
    positionSizingMode: "EQUAL_WEIGHT",
    leverage: 3,
    longLeverage: 2,
    shortLeverage: 3,
    isSeparateLeverage: false,
    maxOpenPositions: 3,
    stopLossPercent: 5,
    takeProfitPercent: 25,
    useTrailingStop: false,
    trailingStopPercent: 7,
    buyOnSignal: ["BLUE", "GREEN"],
    sellOnSignal: ["RED"],
    mode: "BINANCE_LIVE",
    scanMode: "WATCHLIST",
    watchlist: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "XRPUSDT", "SUIUSDT"],
    directionMode: "BOTH",
    isActive: false
  },
  paperAccount: {
    usdtBalance: 1e4,
    initialUsdtBalance: 1e4,
    activePositions: [],
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalProfitUsdt: 0
  },
  tradeHistory: [],
  botLogs: [
    `[${(/* @__PURE__ */ new Date()).toLocaleTimeString("th-TH")}] \u{1F680} CDC Action Zone 24/7 Cloud Server initialized and ready.`
  ],
  telegramConfig: {
    botToken: "",
    chatId: "",
    enabled: false,
    notifyOnBuy: true,
    notifyOnSell: true,
    notifyOnSignal: true,
    notifyOnBotStatus: true
  }
};
var serverState = { ...DEFAULT_SERVER_STATE };
function loadServerState() {
  try {
    if (!import_fs.default.existsSync(DATA_DIR)) {
      import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (import_fs.default.existsSync(STATE_FILE)) {
      const raw = import_fs.default.readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const parsedPaper = parsed.paperAccount || {};
      if (parsedPaper.initialUsdtBalance === 1e3 && parsedPaper.usdtBalance === 1e3 && (!parsedPaper.activePositions || parsedPaper.activePositions.length === 0) && (!parsed.tradeHistory || parsed.tradeHistory.length === 0)) {
        parsedPaper.usdtBalance = 1e4;
        parsedPaper.initialUsdtBalance = 1e4;
      }
      serverState = {
        ...DEFAULT_SERVER_STATE,
        ...parsed,
        botConfig: { ...DEFAULT_SERVER_STATE.botConfig, ...parsed.botConfig || {} },
        paperAccount: { ...DEFAULT_SERVER_STATE.paperAccount, ...parsedPaper },
        tradeHistory: Array.isArray(parsed.tradeHistory) ? parsed.tradeHistory : [],
        botLogs: Array.isArray(parsed.botLogs) ? parsed.botLogs : [],
        telegramConfig: { ...DEFAULT_SERVER_STATE.telegramConfig, ...parsed.telegramConfig || {} }
      };
      console.log("\u2705 Loaded persistent bot state from disk.");
    }
    const envApiKey = (process.env.BINANCE_API_KEY || "").trim();
    const envApiSecret = (process.env.BINANCE_API_SECRET || "").trim();
    if (envApiKey && envApiSecret) {
      serverState.liveApiKeys = {
        apiKey: envApiKey,
        apiSecret: envApiSecret,
        isTestnet: process.env.BINANCE_IS_TESTNET === "true",
        marketType: process.env.BINANCE_MARKET_TYPE || "FUTURES",
        marginType: process.env.BINANCE_MARGIN_TYPE || "ISOLATED"
      };
      console.log(`\u{1F511} [ENV] Loaded Binance API credentials from .env (${serverState.liveApiKeys.marketType} | ${serverState.liveApiKeys.isTestnet ? "Testnet" : "Live"})`);
    }
    const envTelegramToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const envTelegramChatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
    if (envTelegramToken && envTelegramChatId) {
      serverState.telegramConfig = {
        ...serverState.telegramConfig,
        botToken: envTelegramToken,
        chatId: envTelegramChatId,
        enabled: process.env.TELEGRAM_ENABLED !== "false"
      };
      console.log(`\u{1F4F1} [ENV] Loaded Telegram Bot credentials from .env (ChatId: ${envTelegramChatId})`);
    }
  } catch (err) {
    console.error("Error reading bot_state.json:", err);
    serverState = { ...DEFAULT_SERVER_STATE };
  }
}
function saveServerState() {
  try {
    if (!import_fs.default.existsSync(DATA_DIR)) {
      import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    }
    import_fs.default.writeFileSync(STATE_FILE, JSON.stringify(serverState, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing bot_state.json:", err);
  }
}
function addServerLog(msg) {
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("th-TH", { hour12: false });
  const entry = `[${timestamp}] ${msg}`;
  serverState.botLogs.unshift(entry);
  if (serverState.botLogs.length > 200) {
    serverState.botLogs = serverState.botLogs.slice(0, 200);
  }
  saveServerState();
}
loadServerState();
var VALID_SYMBOL_REGEX = /^[A-Z0-9]{2,20}$/;
var VALID_SIDE_VALUES = ["BUY", "SELL"];
var VALID_ORDER_TYPES = ["MARKET", "LIMIT"];
var VALID_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"];
function sanitizeSymbol(symbol) {
  if (!symbol) return null;
  const cleaned = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return VALID_SYMBOL_REGEX.test(cleaned) ? cleaned : null;
}
function sanitizeErrorMessage(error) {
  if (process.env.NODE_ENV === "production") {
    return "An internal error occurred. Please try again.";
  }
  const msg = error?.message || "Unknown error";
  return msg.replace(/\b[A-Z]:\\[^\s]+/gi, "[path]").substring(0, 200);
}
function buildBinanceSignedQuery(queryString, secretKey) {
  const signature = import_crypto.default.createHmac("sha256", secretKey).update(queryString).digest("hex");
  return `${queryString}&signature=${signature}`;
}
function calculateOrderSize(config, account) {
  const maxPositions = config.maxOpenPositions || 5;
  if (account.activePositions.length >= maxPositions) return 0;
  const totalPositionsValue = account.activePositions.reduce((sum, p) => sum + (p.usdtInvested || 0), 0);
  const totalEquity = account.usdtBalance + totalPositionsValue;
  const mode = config.positionSizingMode || "EQUAL_WEIGHT";
  let targetUsdt = 0;
  if (mode === "EQUAL_WEIGHT") {
    targetUsdt = totalEquity / maxPositions;
  } else if (mode === "PERCENT_EQUITY") {
    targetUsdt = totalEquity * (config.balancePercent || 20) / 100;
  } else {
    targetUsdt = config.tradeAmountUsdt || 100;
  }
  return Math.min(targetUsdt, account.usdtBalance);
}
var binanceSpotBannedUntil = 0;
var binanceFuturesBannedUntil = 0;
var lastBanWarningTime = 0;
var serverKlineCache = /* @__PURE__ */ new Map();
var serverTickerCache = null;
var serverDepthCache = /* @__PURE__ */ new Map();
var serverExchangeInfoCache = /* @__PURE__ */ new Map();
var serverAccountCache = /* @__PURE__ */ new Map();
var serverFuturesAccountCache = /* @__PURE__ */ new Map();
function getServerTimeframeCacheTtl(interval) {
  switch (interval) {
    case "1d":
    case "1w":
      return 18e4;
    // 3 min for 1d/1w
    case "4h":
      return 12e4;
    // 2 min for 4h
    case "1h":
      return 6e4;
    // 1 min for 1h
    default:
      return 3e4;
  }
}
function handleBinanceRateLimitError(status, data, endpointName = "API", isFutures = false) {
  if (status === 418 || status === 429) {
    let banUntil = Date.now() + 6e4;
    const msg = typeof data === "string" ? data : data?.msg || JSON.stringify(data || "");
    const match = msg.match(/banned until (\d+)/i);
    if (match && match[1]) {
      banUntil = parseInt(match[1], 10);
    }
    const isFut = isFutures || endpointName.toLowerCase().includes("futures") || endpointName.toLowerCase().includes("fapi");
    if (isFut) {
      binanceFuturesBannedUntil = Math.max(binanceFuturesBannedUntil, banUntil);
    } else {
      binanceSpotBannedUntil = Math.max(binanceSpotBannedUntil, banUntil);
    }
    const targetBannedUntil = isFut ? binanceFuturesBannedUntil : binanceSpotBannedUntil;
    const now = Date.now();
    if (now - lastBanWarningTime > 15e3) {
      lastBanWarningTime = now;
      const waitSeconds = Math.max(0, Math.ceil((targetBannedUntil - now) / 1e3));
      const banDateStr = new Date(targetBannedUntil).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" });
      addServerLog(`\u26A0\uFE0F [BINANCE RATE LIMIT / IP BAN] \u0E15\u0E23\u0E27\u0E08\u0E1E\u0E1A\u0E01\u0E32\u0E23\u0E08\u0E33\u0E01\u0E31\u0E14\u0E04\u0E33\u0E02\u0E2D (HTTP ${status}) \u0E08\u0E32\u0E01 Binance ${isFut ? "Futures" : "Spot"} (${endpointName}): \u0E1E\u0E31\u0E01\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 ${waitSeconds} \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35 (\u0E08\u0E19\u0E16\u0E36\u0E07 ${banDateStr})`);
      console.warn(`[Binance Rate Limit ${isFut ? "Futures" : "Spot"}] IP Banned until ${targetBannedUntil} (${waitSeconds}s remaining)`);
    }
  }
}
async function fetchKlinesDirect(symbol, interval, limit = 300, isFutures = false) {
  const cacheKey = `${symbol}_${interval}_${limit}_${isFutures ? "fut" : "spot"}`;
  const now = Date.now();
  const ttl = getServerTimeframeCacheTtl(interval);
  const cached = serverKlineCache.get(cacheKey);
  if (cached && now < cached.expiry) {
    return cached.data;
  }
  const isBanned = isFutures ? now < binanceFuturesBannedUntil : now < binanceSpotBannedUntil;
  if (isBanned) {
    if (cached) return cached.data;
    return [];
  }
  const candidateUrls = isFutures ? [`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`] : [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  ];
  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        handleBinanceRateLimitError(res.status, errText, `klines ${symbol}`, isFutures);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      const result = data.map((d) => ({
        time: Math.floor(d[0] / 1e3),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
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
var futuresSymbolInfoCache = /* @__PURE__ */ new Map();
var spotSymbolInfoCache = /* @__PURE__ */ new Map();
async function getSymbolFilterInfo(symbol, marketType, isTestnet) {
  const cache = marketType === "FUTURES" ? futuresSymbolInfoCache : spotSymbolInfoCache;
  if (cache.has(symbol)) {
    return cache.get(symbol);
  }
  try {
    const url = marketType === "FUTURES" ? isTestnet ? "https://testnet.binancefuture.com/fapi/v1/exchangeInfo" : "https://fapi.binance.com/fapi/v1/exchangeInfo" : isTestnet ? "https://testnet.binance.vision/api/v3/exchangeInfo" : "https://api.binance.com/api/v3/exchangeInfo";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const symbols = data.symbols || [];
      for (const s of symbols) {
        let stepSize = 1e-3;
        let minQty = 1e-3;
        let minNotional = 5;
        let quantityPrecision = s.quantityPrecision ?? 3;
        let pricePrecision = s.pricePrecision ?? 2;
        const lotSizeFilter = (s.filters || []).find((f) => f.filterType === "LOT_SIZE" || f.filterType === "MARKET_LOT_SIZE");
        if (lotSizeFilter) {
          stepSize = parseFloat(lotSizeFilter.stepSize || "0.001");
          minQty = parseFloat(lotSizeFilter.minQty || "0.001");
          if (stepSize > 0) {
            const stepStr = String(lotSizeFilter.stepSize);
            if (stepStr.includes(".")) {
              quantityPrecision = stepStr.split(".")[1].replace(/0+$/, "").length;
            } else {
              quantityPrecision = 0;
            }
          }
        }
        const notionalFilter = (s.filters || []).find((f) => f.filterType === "MIN_NOTIONAL" || f.filterType === "NOTIONAL");
        if (notionalFilter) {
          minNotional = parseFloat(notionalFilter.notional || notionalFilter.minNotional || "5");
        }
        cache.set(s.symbol, {
          quantityPrecision,
          pricePrecision,
          stepSize,
          minQty,
          minNotional
        });
      }
    }
  } catch (err) {
    console.warn("Failed to fetch Binance exchangeInfo:", err);
  }
  if (cache.has(symbol)) {
    return cache.get(symbol);
  }
  let defaultPrecision = 3;
  if (["DOGEUSDT", "XRPUSDT", "ADAUSDT", "TRXUSDT", "MATICUSDT", "GALAUSDT", "VETUSDT", "PEPEUSDT", "SHIBUSDT", "BONKUSDT", "FLOKIUSDT", "1000PEPEUSDT", "1000SHIBUSDT", "1000BONKUSDT", "1000FLOKIUSDT", "1000LUNCUSDT", "1000RATSUSDT", "1000SATSUSDT"].includes(symbol)) {
    defaultPrecision = 0;
  } else if (["SOLUSDT", "BNBUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "NEARUSDT", "APTUSDT", "SUIUSDT", "ARBUSDT", "OPUSDT"].includes(symbol)) {
    defaultPrecision = 2;
  }
  return {
    quantityPrecision: defaultPrecision,
    pricePrecision: 4,
    stepSize: defaultPrecision === 0 ? 1 : Math.pow(10, -defaultPrecision),
    minQty: defaultPrecision === 0 ? 1 : Math.pow(10, -defaultPrecision),
    minNotional: 5
  };
}
function formatQuantityByStepSize(qty, filterInfo) {
  const { stepSize, quantityPrecision } = filterInfo;
  if (stepSize > 0) {
    const precisionMultiplier = Math.pow(10, quantityPrecision);
    const stepped = Math.floor(qty / stepSize) * stepSize;
    if (quantityPrecision === 0) {
      return Math.floor(stepped);
    }
    return parseFloat((Math.round(stepped * precisionMultiplier) / precisionMultiplier).toFixed(quantityPrecision));
  }
  if (quantityPrecision === 0) return Math.floor(qty);
  return parseFloat(qty.toFixed(quantityPrecision));
}
async function executeLiveServerOrder(params) {
  const keys = serverState.liveApiKeys;
  if (!keys || !keys.apiKey || !keys.apiSecret) {
    return { success: false, error: "Live API keys not configured on server" };
  }
  const marketType = keys.marketType || serverState.botConfig.marketType || "FUTURES";
  const isTestnet = !!keys.isTestnet;
  try {
    const filterInfo = await getSymbolFilterInfo(params.symbol, marketType, isTestnet);
    const qty = formatQuantityByStepSize(params.quantity, filterInfo);
    if (qty <= 0) {
      return {
        success: false,
        error: `\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D\u0E17\u0E35\u0E48\u0E04\u0E33\u0E19\u0E27\u0E13\u0E44\u0E14\u0E49 (${params.quantity.toFixed(4)}) \u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32\u0E02\u0E19\u0E32\u0E14\u0E02\u0E31\u0E49\u0E19\u0E15\u0E48\u0E33\u0E02\u0E2D\u0E07\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D\u0E19\u0E35\u0E49 (${filterInfo.minQty})`
      };
    }
    if (marketType === "FUTURES") {
      const baseUrl = isTestnet ? "https://testnet.binancefuture.com/fapi/v1" : "https://fapi.binance.com/fapi/v1";
      if (params.leverage && params.leverage >= 1) {
        try {
          const { timestamp: timestamp2, recvWindow: recvWindow2 } = await getBinanceTimestamp(baseUrl);
          const levQuery = buildBinanceSignedQuery(
            `symbol=${params.symbol}&leverage=${params.leverage}&recvWindow=${recvWindow2}&timestamp=${timestamp2}`,
            keys.apiSecret
          );
          await fetch(`${baseUrl}/leverage?${levQuery}`, {
            method: "POST",
            headers: { "X-MBX-APIKEY": keys.apiKey }
          });
        } catch (levErr) {
          console.warn("Failed to set leverage on Binance:", levErr);
        }
      }
      const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
      let queryParts = [
        `symbol=${params.symbol}`,
        `side=${params.side}`,
        `type=MARKET`,
        `quantity=${qty}`,
        `recvWindow=${recvWindow}`,
        `timestamp=${timestamp}`
      ];
      if (params.reduceOnly) {
        queryParts.push("reduceOnly=true");
      }
      const signedQuery = buildBinanceSignedQuery(queryParts.join("&"), keys.apiSecret);
      const res = await fetch(`${baseUrl}/order?${signedQuery}`, {
        method: "POST",
        headers: { "X-MBX-APIKEY": keys.apiKey }
      });
      const data = await res.json();
      if (!res.ok || data.code) {
        return { success: false, error: data.msg || "Binance Futures order error" };
      }
      return { success: true, orderId: data.orderId };
    } else {
      const baseUrl = isTestnet ? "https://testnet.binance.vision/api/v3" : "https://api.binance.com/api/v3";
      const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
      const queryParts = [
        `symbol=${params.symbol}`,
        `side=${params.side}`,
        `type=MARKET`,
        `quantity=${qty}`,
        `recvWindow=${recvWindow}`,
        `timestamp=${timestamp}`
      ];
      const signedQuery = buildBinanceSignedQuery(queryParts.join("&"), keys.apiSecret);
      const res = await fetch(`${baseUrl}/order?${signedQuery}`, {
        method: "POST",
        headers: { "X-MBX-APIKEY": keys.apiKey }
      });
      const data = await res.json();
      if (!res.ok || data.code) {
        return { success: false, error: data.msg || "Binance Spot order error" };
      }
      return { success: true, orderId: data.orderId };
    }
  } catch (err) {
    return { success: false, error: err.message || "Live order execution failed" };
  }
}
async function sendTelegramNotification(text, eventType) {
  const config = serverState.telegramConfig;
  if (!config || !config.enabled || !config.botToken || !config.chatId) {
    return false;
  }
  if (eventType === "BUY" && !config.notifyOnBuy) return false;
  if (eventType === "SELL" && !config.notifyOnSell) return false;
  if (eventType === "SIGNAL" && !config.notifyOnSignal) return false;
  if (eventType === "STATUS" && !config.notifyOnBotStatus) return false;
  try {
    const url = `https://api.telegram.org/bot${config.botToken.trim()}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId.trim(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("\u26A0\uFE0F Telegram API send warning:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("\u274C Error sending Telegram notification:", err.message);
    return false;
  }
}
var alertedSignals = /* @__PURE__ */ new Map();
var stoppedOutCycles = /* @__PURE__ */ new Map();
var lastTradedBarTimes = /* @__PURE__ */ new Map();
var isCycleRunning = false;
async function runServerBotCycle() {
  if (isCycleRunning) return;
  const config = serverState.botConfig;
  if (!config.isActive) return;
  const now = Date.now();
  const isFutures = (config.marketType || "FUTURES") === "FUTURES";
  const isBanned = isFutures ? now < binanceFuturesBannedUntil : now < binanceSpotBannedUntil;
  if (isBanned) {
    const banUntil = isFutures ? binanceFuturesBannedUntil : binanceSpotBannedUntil;
    const waitSec = Math.ceil((banUntil - now) / 1e3);
    if (now - lastBanWarningTime > 2e4) {
      lastBanWarningTime = now;
      addServerLog(`\u23F3 [CIRCUIT BREAKER] \u0E1E\u0E31\u0E01\u0E23\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19\u0E02\u0E2D\u0E07\u0E1A\u0E2D\u0E17\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E32\u0E01\u0E15\u0E34\u0E14 Rate Limit \u0E08\u0E32\u0E01 Binance ${isFutures ? "Futures" : "Spot"} (\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E2D\u0E35\u0E01 ${waitSec} \u0E27\u0E34\u0E19\u0E32\u0E17\u0E35)...`);
    }
    return;
  }
  isCycleRunning = true;
  try {
    const dirMode = config.directionMode ?? "LONG_ONLY";
    const effectiveScanMode = config.scanMode || "WATCHLIST";
    let symbolsToEvaluate = [config.symbol];
    if (effectiveScanMode === "WATCHLIST") {
      symbolsToEvaluate = config.watchlist && config.watchlist.length > 0 ? config.watchlist : ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "XRPUSDT", "SUIUSDT"];
    } else if (effectiveScanMode === "MULTI_SCAN") {
      if (serverTickerCache && Array.isArray(serverTickerCache.data) && serverTickerCache.data.length > 0) {
        const sorted = serverTickerCache.data.filter((t) => typeof t.symbol === "string" && t.symbol.endsWith("USDT") && !t.symbol.includes("UP") && !t.symbol.includes("DOWN")).sort((a, b) => parseFloat(b.quoteVolume || 0) - parseFloat(a.quoteVolume || 0)).slice(0, 40).map((t) => t.symbol);
        symbolsToEvaluate = sorted.length >= 10 ? sorted : POPULAR_PAIRS;
      } else {
        symbolsToEvaluate = POPULAR_PAIRS;
      }
    } else {
      symbolsToEvaluate = [config.symbol];
    }
    const isMultiScan = effectiveScanMode === "MULTI_SCAN" || effectiveScanMode === "WATCHLIST";
    for (const sym of symbolsToEvaluate) {
      if (!serverState.botConfig.isActive) break;
      const bannedCheck = isFutures ? Date.now() < binanceFuturesBannedUntil : Date.now() < binanceSpotBannedUntil;
      if (bannedCheck) break;
      const rawCandles = await fetchKlinesDirect(sym, config.timeframe, 300, isFutures);
      if (rawCandles.length < 30) continue;
      const cdcCandles = calculateCDCActionZone(rawCandles, config.fastEmaPeriod, config.slowEmaPeriod);
      if (cdcCandles.length < 3) continue;
      const liveCandle = cdcCandles[cdcCandles.length - 1];
      const closedCandles = cdcCandles.slice(0, -1);
      const confirmedCandle = closedCandles[closedCandles.length - 1];
      const currentPrice = liveCandle.close;
      const barKey = `${sym}_${config.timeframe}`;
      const existingPosIndex = serverState.paperAccount.activePositions.findIndex((p) => p.symbol === sym);
      if (existingPosIndex !== -1) {
        const pos = serverState.paperAccount.activePositions[existingPosIndex];
        const posLev = pos.leverage || 1;
        const margin = pos.marginUsdt || pos.usdtInvested;
        if (pos.side === "LONG") {
          pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
        } else {
          pos.lowestPrice = Math.min(pos.lowestPrice || pos.entryPrice, currentPrice);
        }
        const pnlPercent = pos.side === "SHORT" ? (pos.entryPrice - currentPrice) / pos.entryPrice * 100 * posLev : (currentPrice - pos.entryPrice) / pos.entryPrice * 100 * posLev;
        const pnlUsdt = margin * pnlPercent / 100;
        let exitReason = "";
        if (pnlPercent <= -90 || pos.liquidationPrice && (pos.side === "LONG" ? currentPrice <= pos.liquidationPrice : currentPrice >= pos.liquidationPrice)) {
          exitReason = "\u26A1 Auto Liquidation (Margin Call -90%)";
        } else if (config.stopLossPercent > 0 && pnlPercent <= -config.stopLossPercent) {
          exitReason = `Stop Loss (-${config.stopLossPercent}%)`;
          stoppedOutCycles.set(barKey, { stopTime: confirmedCandle.time, side: pos.side });
        } else if (config.useTrailingStop && (config.trailingStopPercent || 0) > 0) {
          const trailPct = config.trailingStopPercent || 7;
          if (pos.side === "LONG" && pos.highestPrice && pos.highestPrice > pos.entryPrice) {
            const trailCutPrice = pos.highestPrice * (1 - trailPct / 100);
            pos.trailingStopPrice = trailCutPrice;
            if (currentPrice <= trailCutPrice) {
              exitReason = `\u{1F680} Trailing Stop Lock Profit (-${trailPct}% \u0E08\u0E32\u0E01 High $${pos.highestPrice.toFixed(2)})`;
            }
          } else if (pos.side === "SHORT" && pos.lowestPrice && pos.lowestPrice < pos.entryPrice) {
            const trailCutPrice = pos.lowestPrice * (1 + trailPct / 100);
            pos.trailingStopPrice = trailCutPrice;
            if (currentPrice >= trailCutPrice) {
              exitReason = `\u{1F680} Trailing Stop Lock Profit (+${trailPct}% \u0E08\u0E32\u0E01 Low $${pos.lowestPrice.toFixed(2)})`;
            }
          }
        }
        if (!exitReason && config.takeProfitPercent > 0 && pnlPercent >= config.takeProfitPercent) {
          exitReason = `Take Profit (+${config.takeProfitPercent}%)`;
        }
        if (!exitReason) {
          const isExitSignal = pos.side === "SHORT" ? config.buyOnSignal.includes(confirmedCandle.zone) || confirmedCandle.zone === "BLUE" || confirmedCandle.zone === "GREEN" : config.sellOnSignal.includes(confirmedCandle.zone) || confirmedCandle.zone === "RED" || confirmedCandle.zone === "YELLOW";
          if (isExitSignal) {
            exitReason = `CDC Exit Signal ${confirmedCandle.colorNameTh} (\u0E41\u0E17\u0E48\u0E07\u0E1B\u0E34\u0E14\u0E04\u0E2D\u0E19\u0E40\u0E1F\u0E34\u0E23\u0E4C\u0E21)`;
          }
        }
        if (exitReason) {
          if (config.mode === "BINANCE_LIVE" && serverState.liveApiKeys) {
            try {
              const liveExitRes = await executeLiveServerOrder({
                symbol: pos.symbol,
                side: pos.side === "LONG" ? "SELL" : "BUY",
                quantity: pos.amount,
                reduceOnly: true
              });
              if (liveExitRes.success) {
                addServerLog(`\u26A1 [LIVE BINANCE] \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${pos.symbol} \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 (OrderId: ${liveExitRes.orderId})`);
              } else {
                addServerLog(`\u26A0\uFE0F [LIVE BINANCE] \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${pos.symbol} \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ${liveExitRes.error}`);
              }
            } catch (err) {
              console.error("Live exit order error:", err);
            }
          }
          const returnUsdt = Math.max(0, margin + pnlUsdt);
          if (config.mode === "PAPER") {
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
          const trade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            symbol: pos.symbol,
            timeframe: config.timeframe,
            side: pos.side === "LONG" ? "CLOSE_LONG" : "CLOSE_SHORT",
            price: currentPrice,
            amount: pos.amount,
            usdtValue: returnUsdt,
            leverage: posLev,
            pnlUsdt: Number(pnlUsdt.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2)),
            reason: `[Cloud 24/7] ${exitReason}`,
            timestamp: Date.now(),
            mode: config.mode
          };
          serverState.tradeHistory.unshift(trade);
          if (serverState.tradeHistory.length > 500) {
            serverState.tradeHistory = serverState.tradeHistory.slice(0, 500);
          }
          addServerLog(`\u{1F6D1} [SERVER 24/7 ${exitReason.includes("Liquidation") ? "LIQUIDATE" : "AUTO CLOSE"} ${pos.side} ${posLev}x] ${pos.symbol} @ $${currentPrice} | PnL: ${pnlUsdt >= 0 ? "+" : ""}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%) | \u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25: ${exitReason}`);
          saveServerState();
          const isWin = pnlUsdt >= 0;
          const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
          const tgExitMsg = `${isWin ? "\u{1F389}" : "\u{1F6D1}"} <b>[CDC Action Zone] ${isWin ? "\u0E1B\u0E34\u0E14\u0E17\u0E33\u0E01\u0E33\u0E44\u0E23\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 (Take Profit)" : "\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32 / \u0E15\u0E31\u0E14\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19 (Exit)"}</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1FA99} <b>\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D:</b> #${pos.symbol}
\u{1F4CA} <b>\u0E2A\u0E16\u0E32\u0E19\u0E30:</b> ${pos.side} ${posLev}x (${config.timeframe})
\u{1F4B0} <b>\u0E23\u0E32\u0E04\u0E32\u0E1B\u0E34\u0E14:</b> $${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
${isWin ? "\u{1F4C8}" : "\u{1F4C9}"} <b>\u0E1C\u0E25\u0E15\u0E2D\u0E1A\u0E41\u0E17\u0E19 (PnL):</b> ${isWin ? "+" : ""}$${pnlUsdt.toFixed(2)} USDT (${isWin ? "+" : ""}${pnlPercent.toFixed(2)}%)
\u{1F4B5} <b>\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E04\u0E37\u0E19:</b> $${returnUsdt.toFixed(2)} USDT
\u{1F4BC} <b>\u0E22\u0E2D\u0E14\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
\u{1F4DD} <b>\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25:</b> ${exitReason}
\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32:</b> ${timeStr}`;
          sendTelegramNotification(tgExitMsg, "SELL");
        } else {
          pos.currentPnlUsdt = Number(pnlUsdt.toFixed(2));
          pos.currentPnlPercent = Number(pnlPercent.toFixed(2));
        }
        continue;
      }
      const maxPositions = config.maxOpenPositions || 5;
      if (serverState.paperAccount.activePositions.length >= maxPositions) {
        break;
      }
      const crossInfo = getCrossoverInfo(closedCandles);
      if (stoppedOutCycles.has(barKey)) {
        const lockInfo = stoppedOutCycles.get(barKey);
        if (lockInfo.side === "LONG" && crossInfo.isFreshDeadCross || lockInfo.side === "SHORT" && crossInfo.isFreshGoldenCross) {
          stoppedOutCycles.delete(barKey);
        }
      }
      const isWhipsawLocked = config.useWhipsawProtection !== false && stoppedOutCycles.has(barKey);
      const isBuySignal = !isWhipsawLocked && crossInfo.isFreshGoldenCross && (config.buyOnSignal.includes("BLUE") && confirmedCandle.zone === "BLUE" || config.buyOnSignal.includes("GREEN") && confirmedCandle.zone === "GREEN" || (confirmedCandle.zone === "BLUE" || confirmedCandle.zone === "GREEN"));
      const isSellSignal = !isWhipsawLocked && crossInfo.isFreshDeadCross && (config.sellOnSignal.includes("RED") && confirmedCandle.zone === "RED" || config.sellOnSignal.includes("YELLOW") && confirmedCandle.zone === "YELLOW" || confirmedCandle.zone === "RED");
      const signalKey = `${sym}_${config.timeframe}_${confirmedCandle.time}`;
      if ((crossInfo.isFreshGoldenCross || crossInfo.isFreshDeadCross) && !alertedSignals.has(signalKey)) {
        alertedSignals.set(signalKey, Date.now());
        if (alertedSignals.size > 200) {
          const firstKey = alertedSignals.keys().next().value;
          if (firstKey) alertedSignals.delete(firstKey);
        }
        const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
        const signalMsg = `\u{1F4E1} <b>[CDC Action Zone] \u0E15\u0E23\u0E27\u0E08\u0E1E\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E04\u0E2D\u0E19\u0E40\u0E1F\u0E34\u0E23\u0E4C\u0E21\u0E43\u0E2B\u0E21\u0E48!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1FA99} <b>\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D:</b> #${sym} (${config.timeframe})
\u{1F4A1} <b>\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E48\u0E07:</b> ${confirmedCandle.colorNameTh} (${confirmedCandle.zone})
\u{1F3AF} <b>\u0E08\u0E38\u0E14\u0E15\u0E31\u0E14:</b> ${crossInfo.isFreshGoldenCross ? "\u2728 Golden Cross (EMA 12 \u0E15\u0E31\u0E14\u0E02\u0E36\u0E49\u0E19 EMA 26)" : "\u26A1 Dead Cross (EMA 12 \u0E15\u0E31\u0E14\u0E25\u0E07 EMA 26)"}
\u{1F3F7} <b>\u0E23\u0E32\u0E04\u0E32\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19:</b> $${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
\u23F1 <b>\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E41\u0E17\u0E48\u0E07\u0E40\u0E17\u0E35\u0E22\u0E19:</b> \u0E1B\u0E34\u0E14\u0E41\u0E17\u0E48\u0E07\u0E2A\u0E21\u0E1A\u0E39\u0E23\u0E13\u0E4C\u0E41\u0E25\u0E49\u0E27 (Confirmed Close)
\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32:</b> ${timeStr}`;
        sendTelegramNotification(signalMsg, "SIGNAL");
      }
      let targetSide = null;
      if ((dirMode === "LONG_ONLY" || dirMode === "BOTH") && isBuySignal) {
        targetSide = "LONG";
      } else if ((dirMode === "SHORT_ONLY" || dirMode === "BOTH") && isSellSignal) {
        targetSide = "SHORT";
      }
      if (targetSide && lastTradedBarTimes.get(barKey) !== confirmedCandle.time) {
        const tradeUsdt = config.mode === "BINANCE_LIVE" ? config.tradeAmountUsdt && config.tradeAmountUsdt >= 5 ? config.tradeAmountUsdt : 20 : calculateOrderSize(config, serverState.paperAccount);
        const lev = targetSide === "LONG" ? Math.min(Math.max(1, (config.isSeparateLeverage ? config.longLeverage : null) || config.leverage || 1), 10) : Math.min(Math.max(1, (config.isSeparateLeverage ? config.shortLeverage : null) || config.leverage || 1), 10);
        const canExecute = config.mode === "PAPER" ? tradeUsdt >= 5 && serverState.paperAccount.usdtBalance >= tradeUsdt : tradeUsdt >= 5;
        if (canExecute) {
          const notionalValue = tradeUsdt * lev;
          const coinAmount = notionalValue / currentPrice;
          const liqPrice = targetSide === "LONG" ? currentPrice * (1 - 0.9 / lev) : currentPrice * (1 + 0.9 / lev);
          let liveOrderId;
          if (config.mode === "BINANCE_LIVE") {
            if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey || !serverState.liveApiKeys.apiSecret) {
              addServerLog(`\u26A0\uFE0F [LIVE AUTO 24/7] \u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${sym} \u0E44\u0E14\u0E49\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E32\u0E01\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 Binance API Key`);
              continue;
            }
            try {
              const liveEntryRes = await executeLiveServerOrder({
                symbol: sym,
                side: targetSide === "LONG" ? "BUY" : "SELL",
                quantity: coinAmount,
                leverage: lev
              });
              if (liveEntryRes.success) {
                liveOrderId = liveEntryRes.orderId;
                addServerLog(`\u26A1 [LIVE AUTO 24/7] \u0E40\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${targetSide} ${sym} \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 (OrderId: ${liveOrderId})`);
              } else {
                addServerLog(`\u26A0\uFE0F [LIVE AUTO 24/7 FAILED] \u0E40\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${sym} \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ${liveEntryRes.error}`);
                continue;
              }
            } catch (err) {
              console.error("Live entry order error:", err);
              addServerLog(`\u26A0\uFE0F [LIVE AUTO 24/7 ERROR] \u0E40\u0E01\u0E34\u0E14\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14\u0E43\u0E19\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07 ${sym}: ${err.message}`);
              continue;
            }
          } else {
            serverState.paperAccount.usdtBalance -= tradeUsdt;
          }
          const newPos = {
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
            currentPnlPercent: 0
          };
          serverState.paperAccount.activePositions.push(newPos);
          lastTradedBarTimes.set(barKey, confirmedCandle.time);
          const trade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            symbol: sym,
            timeframe: config.timeframe,
            side: targetSide === "LONG" ? "BUY" : "SELL",
            price: currentPrice,
            amount: coinAmount,
            usdtValue: notionalValue,
            leverage: lev,
            reason: config.mode === "BINANCE_LIVE" ? `[Live Auto 24/7 ${lev}x] \u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13 CDC ${confirmedCandle.colorNameTh} (${targetSide}) ${liveOrderId ? `[OrderId: ${liveOrderId}]` : ""}` : `[Cloud 24/7 Entry ${lev}x] CDC ${confirmedCandle.colorNameTh} (${targetSide}) [Confirmed Bar]`,
            timestamp: Date.now(),
            mode: config.mode
          };
          serverState.tradeHistory.unshift(trade);
          if (serverState.tradeHistory.length > 500) {
            serverState.tradeHistory = serverState.tradeHistory.slice(0, 500);
          }
          addServerLog(`\u{1F680} [SERVER 24/7 OPEN ${targetSide} ${lev}x] ${sym} @ $${currentPrice} | \u0E17\u0E38\u0E19 $${tradeUsdt.toFixed(2)} USDT (\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32\u0E2A\u0E31\u0E0D\u0E0D\u0E32 $${notionalValue.toFixed(2)}) | \u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E48\u0E07 ${confirmedCandle.colorNameTh}`);
          saveServerState();
          const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
          const tgOpenMsg = `\u{1F7E2} <b>[CDC Action Zone Bot] \u0E2A\u0E31\u0E48\u0E07\u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 (${config.mode === "BINANCE_LIVE" ? "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E23\u0E34\u0E07 Binance \u{1F7E2}" : "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E33\u0E25\u0E2D\u0E07 \u{1F5C2}\uFE0F"})</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1FA99} <b>\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D:</b> #${sym}
\u{1F4CA} <b>\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E13\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E48\u0E07:</b> CDC ${confirmedCandle.colorNameTh} (${targetSide} ${lev}x)
\u23F1 <b>\u0E44\u0E17\u0E21\u0E4C\u0E40\u0E1F\u0E23\u0E21:</b> ${config.timeframe} (Confirmed Close)
\u{1F4B0} <b>\u0E23\u0E32\u0E04\u0E32\u0E40\u0E02\u0E49\u0E32:</b> $${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
\u26A1 <b>Leverage:</b> ${lev}x (${config.marketType || "SPOT"})
\u{1F4B5} <b>\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19:</b> $${tradeUsdt.toFixed(2)} USDT (\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32 $${notionalValue.toFixed(2)})
\u{1F3AF} <b>Take Profit:</b> +${config.takeProfitPercent}%
\u{1F6E1} <b>Stop Loss:</b> -${config.stopLossPercent}%
${liveOrderId ? `\u{1F194} <b>Order ID:</b> <code>${liveOrderId}</code>
` : ""}\u{1F4BC} <b>\u0E22\u0E2D\u0E14\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32:</b> ${timeStr}`;
          sendTelegramNotification(tgOpenMsg, "BUY");
        }
      }
      if (isMultiScan) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } catch (err) {
    console.error("Error in server bot cycle:", err);
  } finally {
    isCycleRunning = false;
  }
}
setInterval(runServerBotCycle, 3e4);
var RENDER_APP_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_APP_URL) {
  setInterval(async () => {
    try {
      await fetch(`${RENDER_APP_URL}/api/health`);
      console.log("\u{1F493} Anti-sleep heartbeat self-ping successful.");
    } catch (e) {
      console.warn("Heartbeat ping failed:", e);
    }
  }, 10 * 60 * 1e3);
}
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body || {};
    const expectedUser = (process.env.AUTH_USERNAME || "amazon1986").trim();
    const expectedPass = (process.env.AUTH_PASSWORD || "amazon1986").trim();
    const inputUser = String(username || "").trim();
    const inputPass = String(password || "").trim();
    if (!inputUser || !inputPass) {
      return res.status(400).json({ success: false, error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01 Username \u0E41\u0E25\u0E30 Password \u0E43\u0E2B\u0E49\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19" });
    }
    if (inputUser !== expectedUser || inputPass !== expectedPass) {
      return res.status(401).json({
        success: false,
        error: "\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 (Username) \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19 (Password) \u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07"
      });
    }
    const authUser = {
      username: inputUser,
      name: inputUser === "amazon1986" ? "Amazon Quantitative Trader" : inputUser,
      role: "admin",
      loginTime: Date.now()
    };
    addServerLog(`\u{1F464} [AUTH] \u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49 ${inputUser} \u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08`);
    return res.json({ success: true, user: authUser });
  } catch (err) {
    return res.status(500).json({ success: false, error: sanitizeErrorMessage(err) });
  }
});
app.get("/api/auth/info", (req, res) => {
  const configuredUser = (process.env.AUTH_USERNAME || "amazon1986").trim();
  const hasCustomPassword = Boolean(process.env.AUTH_PASSWORD && process.env.AUTH_PASSWORD !== "your_password_here");
  return res.json({
    username: configuredUser,
    hasCustomPassword
  });
});
app.get("/api/bot/state", (req, res) => {
  return res.json({
    botConfig: serverState.botConfig,
    paperAccount: serverState.paperAccount,
    tradeHistory: serverState.tradeHistory,
    botLogs: serverState.botLogs,
    telegramConfig: serverState.telegramConfig,
    bannedUntil: Math.max(binanceFuturesBannedUntil, binanceSpotBannedUntil),
    serverTime: Date.now(),
    isServerRunning: true
  });
});
app.post("/api/bot/config", (req, res) => {
  try {
    const updated = req.body;
    if (updated.leverage !== void 0) {
      updated.leverage = Math.min(Math.max(1, parseInt(String(updated.leverage), 10) || 1), 10);
    }
    if (updated.longLeverage !== void 0) {
      updated.longLeverage = Math.min(Math.max(1, parseInt(String(updated.longLeverage), 10) || 1), 10);
    }
    if (updated.shortLeverage !== void 0) {
      updated.shortLeverage = Math.min(Math.max(1, parseInt(String(updated.shortLeverage), 10) || 1), 10);
    }
    serverState.botConfig = {
      ...serverState.botConfig,
      ...updated
    };
    saveServerState();
    const levDesc = serverState.botConfig.isSeparateLeverage ? `Long: ${serverState.botConfig.longLeverage || 2}x / Short: ${serverState.botConfig.shortLeverage || 3}x` : `${serverState.botConfig.leverage || 1}x`;
    addServerLog(`\u2699\uFE0F \u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E1A\u0E2D\u0E17: ${serverState.botConfig.symbol} | Leverage: ${levDesc} | TF: ${serverState.botConfig.timeframe} | \u0E2A\u0E16\u0E32\u0E19\u0E30: ${serverState.botConfig.isActive ? "\u0E40\u0E1B\u0E34\u0E14\u0E17\u0E33\u0E07\u0E32\u0E19 \u{1F7E2}" : "\u0E2B\u0E22\u0E38\u0E14 \u{1F534}"}`);
    return res.json({ success: true, botConfig: serverState.botConfig });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.post("/api/bot/toggle", (req, res) => {
  const { isActive } = req.body;
  const next = typeof isActive === "boolean" ? isActive : !serverState.botConfig.isActive;
  serverState.botConfig.isActive = next;
  saveServerState();
  addServerLog(next ? "\u{1F7E2} [CLOUD 24/7 BOT ACTIVATED] \u0E40\u0E23\u0E34\u0E48\u0E21\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E23\u0E14\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E1A\u0E19\u0E04\u0E25\u0E32\u0E27\u0E14\u0E4C" : "\u{1F534} [CLOUD BOT STOPPED] \u0E2B\u0E22\u0E38\u0E14\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E23\u0E14\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34");
  const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  const levStatusStr = serverState.botConfig.isSeparateLeverage ? `Long ${serverState.botConfig.longLeverage || 2}x / Short ${serverState.botConfig.shortLeverage || 3}x` : `${serverState.botConfig.leverage || 1}x`;
  const statusMsg = `${next ? "\u{1F680}" : "\u23F8"} <b>[CDC Bot] ${next ? "\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E23\u0E14\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 24/7" : "\u0E2B\u0E22\u0E38\u0E14\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19\u0E02\u0E2D\u0E07\u0E1A\u0E2D\u0E17\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27"}</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4CA} <b>\u0E2A\u0E16\u0E32\u0E19\u0E30:</b> ${next ? "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E17\u0E33\u0E07\u0E32\u0E19 \u{1F7E2} (ACTIVE)" : "\u0E2B\u0E22\u0E38\u0E14\u0E17\u0E33\u0E07\u0E32\u0E19 \u{1F534} (PAUSED)"}
\u{1FA99} <b>\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D\u0E2B\u0E25\u0E31\u0E01:</b> #${serverState.botConfig.symbol}
\u23F1 <b>\u0E44\u0E17\u0E21\u0E4C\u0E40\u0E1F\u0E23\u0E21:</b> ${serverState.botConfig.timeframe}
\u26A1 <b>Leverage:</b> ${levStatusStr} (${serverState.botConfig.marketType || "SPOT"})
\u{1F4BC} <b>\u0E42\u0E2B\u0E21\u0E14:</b> ${serverState.botConfig.mode === "PAPER" ? "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E33\u0E25\u0E2D\u0E07 (Paper Trading)" : "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E23\u0E34\u0E07 (Binance Live)"}
\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32:</b> ${timeStr}`;
  sendTelegramNotification(statusMsg, "STATUS");
  return res.json({ success: true, isActive: next });
});
app.post("/api/bot/manual-order", async (req, res) => {
  try {
    const { symbol: rawSymbol, side: rawSide, amountUsdt, currentPrice } = req.body;
    const symbol = sanitizeSymbol(rawSymbol);
    const side = String(rawSide).toUpperCase();
    if (!symbol || side !== "LONG" && side !== "SHORT" || !amountUsdt || !currentPrice) {
      return res.status(400).json({ error: "Missing parameters or invalid symbol/side" });
    }
    const config = serverState.botConfig;
    const lev = side === "LONG" ? Math.min(Math.max(1, (config.isSeparateLeverage ? config.longLeverage : null) || config.leverage || 1), 10) : Math.min(Math.max(1, (config.isSeparateLeverage ? config.shortLeverage : null) || config.leverage || 1), 10);
    const notionalValue = amountUsdt * lev;
    const coinAmount = notionalValue / currentPrice;
    const liqPrice = side === "LONG" ? currentPrice * (1 - 0.9 / lev) : currentPrice * (1 + 0.9 / lev);
    let liveOrderId;
    if (serverState.botConfig.mode === "BINANCE_LIVE") {
      if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey || !serverState.liveApiKeys.apiSecret) {
        return res.status(400).json({ error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 Binance API Key \u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E14\u0E1B\u0E38\u0E48\u0E21\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 (\u2699\uFE0F) \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E43\u0E2A\u0E48 API Key \u0E01\u0E48\u0E2D\u0E19\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07" });
      }
      const liveRes = await executeLiveServerOrder({
        symbol,
        side: side === "LONG" ? "BUY" : "SELL",
        quantity: coinAmount,
        leverage: lev
      });
      if (!liveRes.success) {
        addServerLog(`\u274C [LIVE MANUAL FAILED] \u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E08\u0E23\u0E34\u0E07 ${side} ${symbol} \u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27: ${liveRes.error}`);
        return res.status(400).json({ error: `Binance \u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07: ${liveRes.error}` });
      }
      liveOrderId = liveRes.orderId;
      addServerLog(`\u26A1 [LIVE MANUAL SUCCESS] \u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E08\u0E23\u0E34\u0E07 ${side} ${symbol} \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 (OrderId: ${liveOrderId})`);
    } else {
      if (serverState.paperAccount.usdtBalance < amountUsdt) {
        return res.status(400).json({ error: "\u0E22\u0E2D\u0E14\u0E40\u0E07\u0E34\u0E19\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E43\u0E19\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E33\u0E25\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E40\u0E1E\u0E35\u0E22\u0E07\u0E1E\u0E2D" });
      }
      serverState.paperAccount.usdtBalance -= amountUsdt;
      serverState.paperAccount.activePositions.push({
        symbol,
        side,
        entryPrice: currentPrice,
        amount: coinAmount,
        usdtInvested: amountUsdt,
        marginUsdt: amountUsdt,
        leverage: lev,
        liquidationPrice: Number(liqPrice.toFixed(6)),
        entryTime: Date.now(),
        currentPnlUsdt: 0,
        currentPnlPercent: 0
      });
    }
    const trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      symbol,
      timeframe: serverState.botConfig.timeframe,
      side: side === "LONG" ? "BUY" : "SELL",
      price: currentPrice,
      amount: coinAmount,
      usdtValue: notionalValue,
      leverage: lev,
      reason: serverState.botConfig.mode === "BINANCE_LIVE" ? `[Live Manual ${lev}x] \u0E2A\u0E31\u0E48\u0E07\u0E0B\u0E37\u0E49\u0E2D\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32\u0E08\u0E23\u0E34\u0E07 (OrderId: ${liveOrderId})` : `[Manual Order ${lev}x] \u0E40\u0E1B\u0E34\u0E14 ${side} \u0E14\u0E49\u0E27\u0E22\u0E15\u0E19\u0E40\u0E2D\u0E07`,
      timestamp: Date.now(),
      mode: serverState.botConfig.mode
    };
    serverState.tradeHistory.unshift(trade);
    saveServerState();
    const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const tgManualMsg = `\u270B <b>[CDC Bot] \u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E2D\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E14\u0E49\u0E27\u0E22\u0E15\u0E19\u0E40\u0E2D\u0E07 (${serverState.botConfig.mode === "BINANCE_LIVE" ? "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E23\u0E34\u0E07 Binance \u{1F7E2}" : "\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E33\u0E25\u0E2D\u0E07 \u{1F5C2}\uFE0F"})</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1FA99} <b>\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D:</b> #${symbol}
\u{1F4CA} <b>\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07:</b> ${side} ${lev}x
\u{1F4B0} <b>\u0E23\u0E32\u0E04\u0E32:</b> $${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
\u{1F4B5} <b>\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19:</b> $${amountUsdt.toFixed(2)} USDT (\u0E21\u0E39\u0E25\u0E04\u0E48\u0E32 $${notionalValue.toFixed(2)})
${liveOrderId ? `\u{1F194} <b>Order ID:</b> <code>${liveOrderId}</code>
` : ""}\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32:</b> ${timeStr}`;
    sendTelegramNotification(tgManualMsg, "BUY");
    return res.json({ success: true, liveOrderId });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.post("/api/bot/close-position", async (req, res) => {
  try {
    let { symbol: rawSymbol, currentPrice, reason = "Manual Close" } = req.body;
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    if (serverState.botConfig.mode === "BINANCE_LIVE") {
      if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey || !serverState.liveApiKeys.apiSecret) {
        return res.status(400).json({ error: "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 Binance API Key" });
      }
      try {
        const baseUrl = serverState.liveApiKeys.isTestnet ? "https://testnet.binancefuture.com/fapi/v2" : "https://fapi.binance.com/fapi/v2";
        const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
        const signedAccountQuery = buildBinanceSignedQuery(`recvWindow=${recvWindow}&timestamp=${timestamp}`, serverState.liveApiKeys.apiSecret);
        const accountRes = await fetch(`${baseUrl}/account?${signedAccountQuery}`, {
          headers: { "X-MBX-APIKEY": serverState.liveApiKeys.apiKey }
        });
        const accountData = await accountRes.json();
        const livePositions = Array.isArray(accountData?.positions) ? accountData.positions : [];
        const livePos = livePositions.find((p) => p.symbol === symbol && parseFloat(p.positionAmt) !== 0);
        if (livePos) {
          const amt = parseFloat(livePos.positionAmt);
          const isLong = amt > 0;
          const closeSide = isLong ? "SELL" : "BUY";
          const liveCloseRes = await executeLiveServerOrder({
            symbol,
            side: closeSide,
            quantity: Math.abs(amt),
            reduceOnly: true
          });
          if (!liveCloseRes.success) {
            addServerLog(`\u274C [LIVE MANUAL CLOSE FAILED] \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${symbol} \u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08: ${liveCloseRes.error}`);
            return res.status(400).json({ error: `Binance \u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E01\u0E32\u0E23\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32: ${liveCloseRes.error}` });
          }
          addServerLog(`\u26A1 [LIVE MANUAL CLOSE] \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 ${symbol} \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 (OrderId: ${liveCloseRes.orderId})`);
        }
      } catch (liveCloseErr) {
        console.error("Error closing live position:", liveCloseErr);
      }
    }
    const idx = serverState.paperAccount.activePositions.findIndex((p) => p.symbol === symbol);
    if (idx !== -1) {
      const pos = serverState.paperAccount.activePositions[idx];
      const posLev = pos.leverage || 1;
      const margin = pos.marginUsdt || pos.usdtInvested;
      const pnlPercent = pos.side === "SHORT" ? (pos.entryPrice - currentPrice) / pos.entryPrice * 100 * posLev : (currentPrice - pos.entryPrice) / pos.entryPrice * 100 * posLev;
      const pnlUsdt = margin * pnlPercent / 100;
      const returnUsdt = Math.max(0, margin + pnlUsdt);
      serverState.paperAccount.usdtBalance += returnUsdt;
      serverState.paperAccount.activePositions.splice(idx, 1);
      serverState.paperAccount.totalTrades += 1;
      if (pnlUsdt > 0) serverState.paperAccount.winningTrades += 1;
      else serverState.paperAccount.losingTrades += 1;
      serverState.paperAccount.totalProfitUsdt += pnlUsdt;
      const trade = {
        id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        symbol: pos.symbol,
        timeframe: serverState.botConfig.timeframe,
        side: pos.side === "LONG" ? "CLOSE_LONG" : "CLOSE_SHORT",
        price: currentPrice,
        amount: pos.amount,
        usdtValue: returnUsdt,
        leverage: posLev,
        pnlUsdt: Number(pnlUsdt.toFixed(2)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        reason: `[Manual Close] ${reason}`,
        timestamp: Date.now(),
        mode: serverState.botConfig.mode
      };
      serverState.tradeHistory.unshift(trade);
      addServerLog(`\u270B [MANUAL CLOSE ${posLev}x] \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32 ${pos.symbol} @ $${currentPrice} | PnL: ${pnlUsdt >= 0 ? "+" : ""}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
      const isWin = pnlUsdt >= 0;
      const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      const tgManualCloseMsg = `${isWin ? "\u{1F389}" : "\u{1F6D1}"} <b>[CDC Bot] \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E14\u0E49\u0E27\u0E22\u0E15\u0E19\u0E40\u0E2D\u0E07 (Manual Close)</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1FA99} <b>\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D:</b> #${pos.symbol}
\u{1F4CA} <b>\u0E2A\u0E16\u0E32\u0E19\u0E30:</b> ${pos.side} ${posLev}x
\u{1F4B0} <b>\u0E23\u0E32\u0E04\u0E32\u0E1B\u0E34\u0E14:</b> $${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
${isWin ? "\u{1F4C8}" : "\u{1F4C9}"} <b>PnL:</b> ${isWin ? "+" : ""}$${pnlUsdt.toFixed(2)} USDT (${isWin ? "+" : ""}${pnlPercent.toFixed(2)}%)
\u{1F4B5} <b>\u0E40\u0E07\u0E34\u0E19\u0E17\u0E38\u0E19\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E04\u0E37\u0E19:</b> $${returnUsdt.toFixed(2)} USDT
\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32:</b> ${timeStr}`;
      sendTelegramNotification(tgManualCloseMsg, "SELL");
    }
    saveServerState();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.post("/api/bot/clear-logs", (req, res) => {
  serverState.botLogs = [];
  saveServerState();
  return res.json({ success: true });
});
app.post("/api/bot/clear-history", (req, res) => {
  try {
    const { mode } = req.body || {};
    if (mode === "BINANCE_LIVE") {
      serverState.tradeHistory = serverState.tradeHistory.filter((t) => t.mode !== "BINANCE_LIVE");
      addServerLog("\u{1F5D1}\uFE0F \u0E25\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E0B\u0E37\u0E49\u0E2D\u0E02\u0E32\u0E22\u0E08\u0E23\u0E34\u0E07 (Binance Live Trade Log) \u0E1A\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27");
    } else if (mode === "PAPER") {
      serverState.tradeHistory = serverState.tradeHistory.filter((t) => t.mode === "BINANCE_LIVE");
      addServerLog("\u{1F5D1}\uFE0F \u0E25\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E40\u0E17\u0E23\u0E14\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E33\u0E25\u0E2D\u0E07 (Paper Trade Log) \u0E1A\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27");
    } else {
      serverState.tradeHistory = [];
      addServerLog("\u{1F5D1}\uFE0F \u0E25\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E0B\u0E37\u0E49\u0E2D\u0E02\u0E32\u0E22\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E1A\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27");
    }
    saveServerState();
    return res.json({ success: true, tradeHistory: serverState.tradeHistory });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.post("/api/bot/reset-paper", (req, res) => {
  serverState.paperAccount = {
    usdtBalance: 1e4,
    initialUsdtBalance: 1e4,
    activePositions: [],
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalProfitUsdt: 0
  };
  serverState.tradeHistory = [];
  addServerLog("\u{1F504} \u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E1E\u0E2D\u0E23\u0E4C\u0E15\u0E08\u0E33\u0E25\u0E2D\u0E07 (Paper Account) \u0E40\u0E1B\u0E47\u0E19 $10,000 USDT \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27");
  saveServerState();
  return res.json({ success: true, paperAccount: serverState.paperAccount });
});
app.post("/api/binance/keys", (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, marketType = "FUTURES", marginType = "ISOLATED" } = req.body;
    serverState.liveApiKeys = {
      apiKey: String(apiKey || "").trim(),
      apiSecret: String(apiSecret || "").trim(),
      isTestnet: !!isTestnet,
      marketType,
      marginType
    };
    saveServerState();
    addServerLog(`\u{1F511} [BINANCE KEYS] \u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15 API Key \u0E1A\u0E19\u0E04\u0E25\u0E32\u0E27\u0E14\u0E4C\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22 (${isTestnet ? "Testnet" : "Live"} | ${marketType})`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.get("/api/binance/keys", (req, res) => {
  if (!serverState.liveApiKeys || !serverState.liveApiKeys.apiKey) {
    return res.json({ configured: false });
  }
  const keyStr = serverState.liveApiKeys.apiKey;
  const maskedKey = keyStr.length > 10 ? `${keyStr.substring(0, 6)}...${keyStr.slice(-4)}` : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return res.json({
    configured: true,
    maskedApiKey: maskedKey,
    isTestnet: serverState.liveApiKeys.isTestnet,
    marketType: serverState.liveApiKeys.marketType,
    marginType: serverState.liveApiKeys.marginType
  });
});
app.get("/api/telegram/config", (req, res) => {
  return res.json(serverState.telegramConfig);
});
app.post("/api/telegram/config", (req, res) => {
  try {
    const updated = req.body;
    serverState.telegramConfig = {
      ...serverState.telegramConfig,
      ...updated
    };
    saveServerState();
    addServerLog(`\u{1F4F1} \u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 Telegram Bot Notification (${serverState.telegramConfig.enabled ? "\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u{1F7E2}" : "\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 \u{1F534}"})`);
    return res.json({ success: true, telegramConfig: serverState.telegramConfig });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.post("/api/telegram/test", async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    const token = (botToken || serverState.telegramConfig.botToken || "").trim();
    const chat = (chatId || serverState.telegramConfig.chatId || "").trim();
    if (!token || !chat) {
      return res.status(400).json({ error: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38 Telegram Bot Token \u0E41\u0E25\u0E30 Chat ID" });
    }
    const timeStr = (/* @__PURE__ */ new Date()).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const testMsg = `\u{1F680} <b>[CDC Action Zone Bot] \u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Telegram \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08!</b>
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u2705 <b>\u0E2A\u0E16\u0E32\u0E19\u0E30:</b> \u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E01\u0E31\u0E1A Telegram \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27
\u{1F916} <b>\u0E1A\u0E2D\u0E17\u0E40\u0E17\u0E23\u0E14:</b> CDC Action Zone V2 (Binance)
\u{1F4C8} <b>\u0E01\u0E25\u0E22\u0E38\u0E17\u0E18\u0E4C:</b> \u0E2A\u0E39\u0E15\u0E23\u0E25\u0E38\u0E07\u0E42\u0E09\u0E25\u0E01 (EMA 12/26 Action Zone)
\u23F1 <b>\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C:</b> Cloud Bot 24/7 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E17\u0E31\u0E19\u0E17\u0E35
\u{1F552} <b>\u0E40\u0E27\u0E25\u0E32\u0E17\u0E14\u0E2A\u0E2D\u0E1A:</b> ${timeStr}

<i>\u0E02\u0E2D\u0E43\u0E2B\u0E49\u0E04\u0E38\u0E13\u0E1B\u0E23\u0E30\u0E2A\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E30\u0E21\u0E35\u0E01\u0E33\u0E44\u0E23\u0E08\u0E32\u0E01\u0E01\u0E32\u0E23\u0E25\u0E07\u0E17\u0E38\u0E19\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E21\u0E35\u0E27\u0E34\u0E19\u0E31\u0E22\u0E04\u0E23\u0E31\u0E1A! \u{1F3AF}</i>`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: testMsg,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      return res.status(400).json({
        error: data.description || "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E44\u0E1B\u0E22\u0E31\u0E07 Telegram \u0E44\u0E14\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A Bot Token \u0E41\u0E25\u0E30 Chat ID (\u0E41\u0E25\u0E30\u0E01\u0E14 Start \u0E01\u0E31\u0E1A\u0E1A\u0E2D\u0E17\u0E43\u0E19 Telegram \u0E01\u0E48\u0E2D\u0E19)"
      });
    }
    addServerLog(`\u{1F4F1} \u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E2A\u0E48\u0E07\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19 Telegram \u0E44\u0E1B\u0E22\u0E31\u0E07 Chat ID: ${chat} \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 \u{1F7E2}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.get("/api/health", (req, res) => {
  return res.json({
    status: "ok",
    uptime: process.uptime(),
    isBotActive: serverState.botConfig.isActive,
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/binance/klines", async (req, res) => {
  try {
    const rawSymbol = req.query.symbol || "BTCUSDT";
    const interval = String(req.query.interval || "1h");
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || "300"), 10) || 300), 1e3);
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    if (!VALID_INTERVALS.includes(interval)) return res.status(400).json({ error: "Invalid interval" });
    const cacheKey = `${symbol}_${interval}_${limit}`;
    const now = Date.now();
    const ttl = getServerTimeframeCacheTtl(interval);
    const cached = serverKlineCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }
    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json(cached.data);
      return res.status(429).json({ error: "Binance API is in rate limit cooldown", bannedUntil: binanceSpotBannedUntil });
    }
    const candidateUrls = [
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ];
    let lastErrText = "";
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastErrText = await response.text().catch(() => "");
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
    return res.status(502).json({ error: "Binance API request failed", details: lastErrText });
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.get("/api/binance/ticker24h", async (req, res) => {
  try {
    const rawSymbol = req.query.symbol;
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const now = Date.now();
    if (!symbol && serverTickerCache && now < serverTickerCache.expiry) {
      return res.json(serverTickerCache.data);
    }
    if (now < binanceSpotBannedUntil) {
      if (serverTickerCache) return res.json(serverTickerCache.data);
      return res.status(429).json({ error: "Binance API is in rate limit cooldown", bannedUntil: binanceSpotBannedUntil });
    }
    const candidateUrls = symbol ? [
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
      `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
      `https://api2.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
    ] : [
      `https://api.binance.com/api/v3/ticker/24hr`,
      `https://api1.binance.com/api/v3/ticker/24hr`,
      `https://api2.binance.com/api/v3/ticker/24hr`
    ];
    let lastErr = "";
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          lastErr = await response.text().catch(() => "");
          handleBinanceRateLimitError(response.status, lastErr, "ticker24h");
          continue;
        }
        const data = await response.json();
        if (!symbol) {
          serverTickerCache = { data, expiry: now + 6e4 };
        }
        return res.json(data);
      } catch (e) {
        continue;
      }
    }
    if (serverTickerCache) return res.json(serverTickerCache.data);
    return res.status(502).json({ error: "Ticker request failed", details: lastErr });
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.get("/api/binance/depth", async (req, res) => {
  try {
    const rawSymbol = req.query.symbol || "BTCUSDT";
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20), 5e3);
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const cacheKey = `${symbol}_${limit}`;
    const now = Date.now();
    const cached = serverDepthCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }
    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json(cached.data);
      return res.status(429).json({ error: "Binance API is in rate limit cooldown" });
    }
    const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      handleBinanceRateLimitError(response.status, errText, "depth");
      if (cached) return res.json(cached.data);
      return res.status(response.status).json({ error: "Depth request failed" });
    }
    const data = await response.json();
    serverDepthCache.set(cacheKey, { data, expiry: now + 15e3 });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.get("/api/binance/exchangeInfo", async (req, res) => {
  try {
    const rawSymbol = req.query.symbol;
    const isTestnet = req.query.isTestnet === "true";
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const cacheKey = `${symbol || "ALL"}_${isTestnet}`;
    const now = Date.now();
    const cached = serverExchangeInfoCache.get(cacheKey);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }
    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json(cached.data);
      return res.status(429).json({ error: "Binance API is in rate limit cooldown" });
    }
    const baseUrl = isTestnet ? "https://testnet.binance.vision/api/v3" : "https://api.binance.com/api/v3";
    const url = symbol ? `${baseUrl}/exchangeInfo?symbol=${symbol}` : `${baseUrl}/exchangeInfo`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      handleBinanceRateLimitError(response.status, errText, "exchangeInfo");
      if (cached) return res.json(cached.data);
      return res.status(response.status).json({ error: "ExchangeInfo request failed" });
    }
    const data = await response.json();
    serverExchangeInfoCache.set(cacheKey, { data, expiry: now + 3e5 });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
var binanceTimeOffsets = {};
var lastTimeSync = {};
async function getBinanceTimestamp(baseUrl) {
  const now = Date.now();
  const lastSync = lastTimeSync[baseUrl] || 0;
  if (now - lastSync > 60 * 1e3) {
    try {
      const start = Date.now();
      const res = await fetch(`${baseUrl}/time`);
      if (res.ok) {
        const data = await res.json();
        const end = Date.now();
        const latency = Math.floor((end - start) / 2);
        binanceTimeOffsets[baseUrl] = data.serverTime + latency - end;
        lastTimeSync[baseUrl] = end;
      }
    } catch (e) {
      console.warn("Failed to sync time with Binance:", e);
    }
  }
  const offset = binanceTimeOffsets[baseUrl] || 0;
  const timestamp = now + offset - 1e3;
  return { timestamp, recvWindow: 1e4 };
}
app.post("/api/binance/account", async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const keyHash = `${apiKey.slice(0, 8)}_${isTestnet ? "test" : "live"}`;
    const now = Date.now();
    const cached = serverAccountCache.get(keyHash);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }
    if (now < binanceSpotBannedUntil) {
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(429).json({ error: "Binance Spot API is in cooldown due to IP rate limit", bannedUntil: binanceSpotBannedUntil });
    }
    const baseUrl = isTestnet ? "https://testnet.binance.vision/api/v3" : "https://api.binance.com/api/v3";
    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
    const response = await fetch(`${baseUrl}/account?${signedQuery}`, {
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
      handleBinanceRateLimitError(response.status, data, "spot account", false);
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(response.status).json({ error: data.msg || "Binance Account API error" });
    }
    const balances = (data.balances || []).filter(
      (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
    const result = {
      success: true,
      canTrade: data.canTrade,
      accountType: data.accountType,
      balances
    };
    serverAccountCache.set(keyHash, { data: result, expiry: now + 2e4 });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/binance/order", orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity, price, orderType: rawOrderType = "MARKET" } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const side = String(rawSide).toUpperCase();
    if (!VALID_SIDE_VALUES.includes(side)) return res.status(400).json({ error: "Invalid side" });
    const orderType = String(rawOrderType).toUpperCase();
    if (!VALID_ORDER_TYPES.includes(orderType)) return res.status(400).json({ error: "Invalid order type" });
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });
    const baseUrl = isTestnet ? "https://testnet.binance.vision/api/v3" : "https://api.binance.com/api/v3";
    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    let queryParts = [
      `symbol=${symbol}`,
      `side=${side}`,
      `type=${orderType}`,
      `quantity=${qty}`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`
    ];
    if (orderType === "LIMIT" && price) {
      queryParts.push(`price=${parseFloat(price)}`, `timeInForce=GTC`);
    }
    const queryString = queryParts.join("&");
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || "Binance order rejected" });
    }
    return res.json({ success: true, order: data });
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/binance/keys", (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, marketType = "SPOT", marginType = "ISOLATED" } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Missing API Key credentials" });
    }
    serverState.liveApiKeys = { apiKey, apiSecret, isTestnet: !!isTestnet, marketType, marginType };
    saveServerState();
    addServerLog(`\u{1F511} \u0E0B\u0E34\u0E07\u0E01\u0E4C Binance API Key \u0E02\u0E36\u0E49\u0E19\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22 (${isTestnet ? "Testnet" : "Live"} | ${marketType})`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});
app.post("/api/binance/futures/account", async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const keyHash = `${apiKey.slice(0, 8)}_${isTestnet ? "test" : "live"}`;
    const now = Date.now();
    const cached = serverFuturesAccountCache.get(keyHash);
    if (cached && now < cached.expiry) {
      return res.json(cached.data);
    }
    if (now < binanceFuturesBannedUntil) {
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(429).json({ error: "Binance Futures API is in cooldown due to IP rate limit", bannedUntil: binanceFuturesBannedUntil });
    }
    const baseUrl = isTestnet ? "https://testnet.binancefuture.com/fapi/v2" : "https://fapi.binance.com/fapi/v2";
    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
    const response = await fetch(`${baseUrl}/account?${signedQuery}`, {
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
      handleBinanceRateLimitError(response.status, data, "futures account", true);
      if (cached) return res.json({ ...cached.data, isCached: true });
      return res.status(response.status).json({ error: data.msg || "Binance Futures Account API error" });
    }
    const result = {
      success: true,
      canTrade: data.canTrade,
      feeTier: data.feeTier,
      assets: data.assets || [],
      positions: data.positions || []
    };
    serverFuturesAccountCache.set(keyHash, { data: result, expiry: now + 2e4 });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/binance/futures/leverage", async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, leverage } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const lev = Math.min(Math.max(1, parseInt(String(leverage || 1), 10)), 10);
    const baseUrl = isTestnet ? "https://testnet.binancefuture.com/fapi/v1" : "https://fapi.binance.com/fapi/v1";
    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `symbol=${symbol}&leverage=${lev}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
    const response = await fetch(`${baseUrl}/leverage?${signedQuery}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || "Failed to set Futures leverage" });
    }
    return res.json({ success: true, leverage: data.leverage, symbol: data.symbol });
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/binance/futures/order", orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity, price, orderType: rawOrderType = "MARKET", reduceOnly } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const side = String(rawSide).toUpperCase();
    if (!VALID_SIDE_VALUES.includes(side)) return res.status(400).json({ error: "Invalid side" });
    const orderType = String(rawOrderType).toUpperCase();
    if (!VALID_ORDER_TYPES.includes(orderType)) return res.status(400).json({ error: "Invalid order type" });
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });
    const baseUrl = isTestnet ? "https://testnet.binancefuture.com/fapi/v1" : "https://fapi.binance.com/fapi/v1";
    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    let queryParts = [
      `symbol=${symbol}`,
      `side=${side}`,
      `type=${orderType}`,
      `quantity=${qty}`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`
    ];
    if (reduceOnly) {
      queryParts.push(`reduceOnly=true`);
    }
    if (orderType === "LIMIT" && price) {
      queryParts.push(`price=${parseFloat(price)}`, `timeInForce=GTC`);
    }
    const queryString = queryParts.join("&");
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || "Binance Futures order rejected" });
    }
    return res.json({ success: true, order: data });
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/binance/futures/close-position", orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: "Invalid symbol format" });
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity" });
    const posSide = String(rawSide).toUpperCase();
    const orderSide = posSide === "LONG" || posSide === "BUY" ? "SELL" : "BUY";
    const baseUrl = isTestnet ? "https://testnet.binancefuture.com/fapi/v1" : "https://fapi.binance.com/fapi/v1";
    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryParts = [
      `symbol=${symbol}`,
      `side=${orderSide}`,
      `type=MARKET`,
      `quantity=${qty}`,
      `reduceOnly=true`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`
    ];
    const queryString = queryParts.join("&");
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || "Failed to close Futures position" });
    }
    addServerLog(`\u26A1 \u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E08\u0E23\u0E34\u0E07 Binance Futures: ${symbol} (${orderSide} ${qty}) \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08`);
    return res.json({ success: true, order: data });
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/binance/history", async (req, res) => {
  try {
    const {
      apiKey,
      apiSecret,
      isTestnet,
      symbol: rawSymbol,
      marketType = "FUTURES",
      limit = 100
    } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Invalid API credentials" });
    }
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    const historyLimit = Math.min(Math.max(10, parseInt(String(limit || 100), 10)), 500);
    if (marketType === "FUTURES") {
      const fapiBaseV1 = isTestnet ? "https://testnet.binancefuture.com/fapi/v1" : "https://fapi.binance.com/fapi/v1";
      const fapiBaseV2 = isTestnet ? "https://testnet.binancefuture.com/fapi/v2" : "https://fapi.binance.com/fapi/v2";
      const { timestamp, recvWindow } = await getBinanceTimestamp(fapiBaseV1);
      let incomeQueryParts = [
        `recvWindow=${recvWindow}`,
        `timestamp=${timestamp}`,
        `limit=${historyLimit}`
      ];
      if (symbol) {
        incomeQueryParts.unshift(`symbol=${symbol}`);
      }
      const signedIncomeQuery = buildBinanceSignedQuery(incomeQueryParts.join("&"), apiSecret);
      const incomePromise = fetch(`${fapiBaseV1}/income?${signedIncomeQuery}`, {
        headers: { "X-MBX-APIKEY": apiKey }
      }).then(async (r) => r.ok ? r.json() : []);
      const signedAccountQuery = buildBinanceSignedQuery(`recvWindow=${recvWindow}&timestamp=${timestamp}`, apiSecret);
      const accountPromise = fetch(`${fapiBaseV2}/account?${signedAccountQuery}`, {
        headers: { "X-MBX-APIKEY": apiKey }
      }).then(async (r) => r.ok ? r.json() : { positions: [] });
      let userTradesPromise = Promise.resolve([]);
      if (symbol) {
        const userTradesQuery = buildBinanceSignedQuery(
          `symbol=${symbol}&limit=${historyLimit}&recvWindow=${recvWindow}&timestamp=${timestamp}`,
          apiSecret
        );
        userTradesPromise = fetch(`${fapiBaseV1}/userTrades?${userTradesQuery}`, {
          headers: { "X-MBX-APIKEY": apiKey }
        }).then(async (r) => r.ok ? r.json() : []);
      }
      const [incomeData, accountData, userTradesData] = await Promise.all([
        incomePromise,
        accountPromise,
        userTradesPromise
      ]);
      const rawPositions = Array.isArray(accountData?.positions) ? accountData.positions : [];
      const livePositions = rawPositions.filter((p) => parseFloat(p.positionAmt) !== 0).map((p) => {
        const amt = parseFloat(p.positionAmt);
        const entryPrice = parseFloat(p.entryPrice);
        const unPnl = parseFloat(p.unrealizedProfit);
        const initMargin = parseFloat(p.initialMargin || p.positionInitialMargin || "0");
        const pnlPercent = initMargin > 0 ? unPnl / initMargin * 100 : 0;
        return {
          symbol: p.symbol,
          positionSide: p.positionSide || (amt > 0 ? "LONG" : "SHORT"),
          positionAmt: amt,
          entryPrice,
          markPrice: entryPrice > 0 ? entryPrice * (1 + unPnl / (Math.abs(amt) * entryPrice || 1)) : 0,
          unrealizedProfit: unPnl,
          initialMargin: initMargin,
          leverage: parseInt(p.leverage || "1", 10),
          isolated: p.isolated ?? true,
          pnlPercent
        };
      });
      const trades = [];
      const tradeIdSet = /* @__PURE__ */ new Set();
      if (Array.isArray(userTradesData)) {
        for (const t of userTradesData) {
          const id = `trade_${t.id || t.orderId}_${t.time}`;
          if (tradeIdSet.has(id)) continue;
          tradeIdSet.add(id);
          const realizedPnl = parseFloat(t.realizedPnl || "0");
          const isBuyer = t.buyer === true || t.side === "BUY";
          const pnlPos = realizedPnl !== 0;
          let displaySide = t.side;
          if (pnlPos) {
            displaySide = isBuyer ? "CLOSE_SHORT" : "CLOSE_LONG";
          } else {
            displaySide = isBuyer ? "LONG" : "SHORT";
          }
          trades.push({
            id: String(t.id || t.orderId),
            orderId: t.orderId,
            symbol: t.symbol,
            side: displaySide,
            price: parseFloat(t.price),
            qty: parseFloat(t.qty),
            quoteQty: parseFloat(t.quoteQty || (parseFloat(t.price) * parseFloat(t.qty)).toFixed(4)),
            realizedPnl,
            commission: parseFloat(t.commission || "0"),
            commissionAsset: t.commissionAsset || "USDT",
            time: Number(t.time),
            marketType: "FUTURES",
            positionSide: t.positionSide,
            reason: pnlPos ? realizedPnl >= 0 ? "\u0E17\u0E33\u0E01\u0E33\u0E44\u0E23 (Take Profit)" : "\u0E15\u0E31\u0E14\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19 (Stop Loss)" : "\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E2A\u0E31\u0E48\u0E07\u0E40\u0E1B\u0E34\u0E14\u0E42\u0E1E\u0E0B\u0E34\u0E0A\u0E31\u0E19"
          });
        }
      }
      if (Array.isArray(incomeData)) {
        for (const inc of incomeData) {
          const tranId = `income_${inc.tranId || inc.tradeId || inc.time}`;
          if (tradeIdSet.has(tranId)) continue;
          tradeIdSet.add(tranId);
          const incomeVal = parseFloat(inc.income || "0");
          const isPnl = inc.incomeType === "REALIZED_PNL";
          const isFunding = inc.incomeType === "FUNDING_FEE";
          const isCommission = inc.incomeType === "COMMISSION";
          const isTransfer = inc.incomeType === "TRANSFER";
          let reason = inc.incomeType;
          let side = "INFO";
          if (isPnl) {
            reason = incomeVal >= 0 ? "\u0E01\u0E33\u0E44\u0E23\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32 (Realized PnL)" : "\u0E02\u0E32\u0E14\u0E17\u0E38\u0E19\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32 (Realized Loss)";
            side = incomeVal >= 0 ? "CLOSE_LONG" : "CLOSE_SHORT";
          } else if (isFunding) {
            reason = `\u0E04\u0E48\u0E32\u0E18\u0E23\u0E23\u0E21\u0E40\u0E19\u0E35\u0E22\u0E21 Funding Rate (${incomeVal >= 0 ? "+" : ""}${incomeVal.toFixed(4)} ${inc.asset || "USDT"})`;
            side = "FUNDING";
          } else if (isCommission) {
            reason = `\u0E04\u0E48\u0E32\u0E18\u0E23\u0E23\u0E21\u0E40\u0E19\u0E35\u0E22\u0E21 Commission (${Math.abs(incomeVal).toFixed(4)} ${inc.asset || "USDT"})`;
            side = "FEE";
          } else if (isTransfer) {
            reason = incomeVal >= 0 ? `\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32 Futures (+${incomeVal.toFixed(2)} ${inc.asset || "USDT"})` : `\u0E42\u0E2D\u0E19\u0E40\u0E07\u0E34\u0E19\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E01\u0E23\u0E30\u0E40\u0E1B\u0E4B\u0E32 Futures (${incomeVal.toFixed(2)} ${inc.asset || "USDT"})`;
            side = incomeVal >= 0 ? "TRANSFER_IN" : "TRANSFER_OUT";
          } else {
            reason = `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 ${inc.incomeType} (${incomeVal.toFixed(4)} ${inc.asset || "USDT"})`;
            side = "OTHER";
          }
          trades.push({
            id: String(inc.tranId || inc.tradeId || inc.time),
            orderId: inc.tradeId,
            symbol: inc.symbol || "USDT",
            side,
            price: 0,
            qty: 0,
            quoteQty: Math.abs(incomeVal),
            realizedPnl: isPnl ? incomeVal : void 0,
            commission: isCommission ? Math.abs(incomeVal) : void 0,
            commissionAsset: inc.asset || "USDT",
            time: Number(inc.time),
            marketType: "FUTURES",
            reason
          });
        }
      }
      trades.sort((a, b) => b.time - a.time);
      let totalRealizedPnl = 0;
      let winCount = 0;
      let lossCount = 0;
      for (const tr of trades) {
        if (tr.realizedPnl !== void 0 && tr.realizedPnl !== 0) {
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
        lossCount
      });
    } else {
      const spotBase = isTestnet ? "https://testnet.binance.vision/api/v3" : "https://api.binance.com/api/v3";
      const { timestamp, recvWindow } = await getBinanceTimestamp(spotBase);
      const querySymbol = symbol || "BTCUSDT";
      const queryString = `symbol=${querySymbol}&limit=${historyLimit}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
      const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);
      const spotRes = await fetch(`${spotBase}/myTrades?${signedQuery}`, {
        headers: { "X-MBX-APIKEY": apiKey }
      });
      const spotData = await spotRes.json();
      if (!spotRes.ok) {
        return res.status(spotRes.status).json({ error: spotData.msg || "Binance Spot myTrades failed" });
      }
      const trades = (Array.isArray(spotData) ? spotData : []).map((t) => ({
        id: String(t.id || t.orderId),
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.isBuyer ? "BUY" : "SELL",
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        quoteQty: parseFloat(t.quoteQty || (parseFloat(t.price) * parseFloat(t.qty)).toFixed(4)),
        commission: parseFloat(t.commission || "0"),
        commissionAsset: t.commissionAsset || "BNB",
        time: Number(t.time),
        marketType: "SPOT",
        reason: t.isBuyer ? "\u0E0B\u0E37\u0E49\u0E2D Spot (Buy)" : "\u0E02\u0E32\u0E22 Spot (Sell)"
      }));
      trades.sort((a, b) => b.time - a.time);
      return res.json({
        success: true,
        trades,
        livePositions: [],
        totalRealizedPnl: 0,
        winCount: 0,
        lossCount: 0
      });
    }
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
app.post("/api/ai/analyze", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: "GEMINI_API_KEY is not configured on server. Please set GEMINI_API_KEY in environment variables."
      });
    }
    const { symbol, timeframe, currentPrice, zone, emaFast, emaSlow, recentCandles } = req.body;
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const recentCandlesSummary = Array.isArray(recentCandles) ? recentCandles.slice(-10).map((c) => `Time: ${new Date(c.time * 1e3).toISOString().slice(0, 16)} | Close: ${c.close} | Zone: ${c.zone} | Color: ${c.colorNameTh}`).join("\n") : "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E41\u0E17\u0E48\u0E07\u0E40\u0E17\u0E35\u0E22\u0E19\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07";
    const prompt = `\u0E04\u0E38\u0E13\u0E04\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E40\u0E0A\u0E35\u0E48\u0E22\u0E27\u0E0A\u0E32\u0E0D\u0E14\u0E49\u0E32\u0E19 Technical Analysis \u0E04\u0E23\u0E34\u0E1B\u0E42\u0E15\u0E40\u0E04\u0E2D\u0E23\u0E4C\u0E40\u0E23\u0E19\u0E0B\u0E35 \u0E41\u0E25\u0E30\u0E40\u0E1B\u0E47\u0E19\u0E28\u0E34\u0E29\u0E22\u0E4C\u0E40\u0E2D\u0E01\u0E02\u0E2D\u0E07\u0E23\u0E30\u0E1A\u0E1A CDC Action Zone V2/V3 (\u0E2A\u0E39\u0E15\u0E23\u0E25\u0E38\u0E07\u0E42\u0E09\u0E25\u0E01 - Chaloke.org)
\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E40\u0E2B\u0E23\u0E35\u0E22\u0E0D ${symbol} \u0E1A\u0E19\u0E44\u0E17\u0E21\u0E4C\u0E40\u0E1F\u0E23\u0E21 ${timeframe}:
- \u0E23\u0E32\u0E04\u0E32\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: $${currentPrice}
- \u0E2A\u0E16\u0E32\u0E19\u0E30 CDC Zone: ${zone}
- EMA 12: $${emaFast} | EMA 26: $${emaSlow}
\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E41\u0E17\u0E48\u0E07\u0E40\u0E17\u0E35\u0E22\u0E19:
${recentCandlesSummary}

\u0E15\u0E2D\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A JSON:
{
  "summary": "\u0E2A\u0E23\u0E38\u0E1B\u0E01\u0E32\u0E23\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E40\u0E0A\u0E34\u0E07\u0E40\u0E17\u0E04\u0E19\u0E34\u0E04 2-3 \u0E1B\u0E23\u0E30\u0E42\u0E22\u0E04",
  "marketTrend": "BULLISH" \u0E2B\u0E23\u0E37\u0E2D "BEARISH" \u0E2B\u0E23\u0E37\u0E2D "SIDEWAYS",
  "keyLevels": { "support": [\u0E41\u0E19\u0E27\u0E23\u0E31\u0E1A1, \u0E41\u0E19\u0E27\u0E23\u0E31\u0E1A2], "resistance": [\u0E41\u0E19\u0E27\u0E15\u0E49\u0E32\u0E191, \u0E41\u0E19\u0E27\u0E15\u0E49\u0E32\u0E192] },
  "botRecommendation": "\u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33\u0E2A\u0E31\u0E49\u0E19\u0E46 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32 Bot CDC Action Zone",
  "riskAssessment": "\u0E1B\u0E23\u0E30\u0E40\u0E21\u0E34\u0E19\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07\u0E41\u0E25\u0E30\u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33\u0E2A\u0E31\u0E14\u0E2A\u0E48\u0E27\u0E19\u0E1E\u0E2D\u0E23\u0E4C\u0E15"
}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    const text = response.text || "";
    let parsedData;
    try {
      parsedData = JSON.parse(text);
    } catch {
      parsedData = {
        summary: text,
        marketTrend: "SIDEWAYS",
        keyLevels: { support: [currentPrice * 0.95], resistance: [currentPrice * 1.05] },
        botRecommendation: "\u0E17\u0E33\u0E15\u0E32\u0E21\u0E27\u0E34\u0E19\u0E31\u0E22 CDC Action Zone V2",
        riskAssessment: "\u0E15\u0E31\u0E49\u0E07 Stop loss \u0E17\u0E38\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E1B\u0E49\u0E2D\u0E07\u0E01\u0E31\u0E19\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07"
      };
    }
    return res.json(parsedData);
  } catch (error) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} CDC Action Zone 24/7 Cloud Bot Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
