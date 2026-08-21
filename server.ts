import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { BotConfig, PaperAccount, PaperPosition, ExecutedTrade, KlineData, Timeframe, TelegramConfig } from './src/types';
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
    tradeAmountUsdt: 100,
    usePercentBalance: true,
    balancePercent: 10,
    positionSizingMode: 'EQUAL_WEIGHT',
    leverage: 2,
    maxOpenPositions: 10,
    stopLossPercent: 5,
    takeProfitPercent: 25,
    useTrailingStop: false,
    trailingStopPercent: 3,
    buyOnSignal: ['BLUE', 'GREEN'],
    sellOnSignal: ['RED'],
    mode: 'PAPER',
    scanMode: 'MULTI_SCAN',
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

async function fetchKlinesDirect(symbol: string, interval: string, limit = 300): Promise<KlineData[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((d: any) => ({
      time: Math.floor(d[0] / 1000),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));
  } catch (err) {
    return [];
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

  isCycleRunning = true;
  try {
    const dirMode = config.directionMode ?? 'LONG_ONLY';
    const isMultiScan = config.scanMode === 'MULTI_SCAN';
    const symbolsToEvaluate = isMultiScan ? POPULAR_PAIRS.slice(0, 15) : [config.symbol];

    for (const sym of symbolsToEvaluate) {
      if (!serverState.botConfig.isActive) break;

      const rawCandles = await fetchKlinesDirect(sym, config.timeframe, 300);
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
          const returnUsdt = Math.max(0, margin + pnlUsdt);
          serverState.paperAccount.usdtBalance += returnUsdt;
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
        const tradeUsdt = calculateOrderSize(config, serverState.paperAccount);
        const lev = Math.min(Math.max(1, config.leverage || 1), 10);
        if (tradeUsdt >= 10 && serverState.paperAccount.usdtBalance >= tradeUsdt) {
          const notionalValue = tradeUsdt * lev;
          const coinAmount = notionalValue / currentPrice;
          const liqPrice = targetSide === 'LONG'
            ? currentPrice * (1 - 0.9 / lev)
            : currentPrice * (1 + 0.9 / lev);

          serverState.paperAccount.usdtBalance -= tradeUsdt;

          const newPos: PaperPosition = {
            symbol: sym,
            side: targetSide,
            entryPrice: currentPrice,
            amount: coinAmount,
            usdtInvested: tradeUsdt,
            marginUsdt: tradeUsdt,
            leverage: lev,
            liquidationPrice: Number(liqPrice.toFixed(6)),
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
            reason: `[Cloud 24/7 Entry ${lev}x] CDC ${confirmedCandle.colorNameTh} (${targetSide}) [Confirmed Bar]`,
            timestamp: Date.now(),
            mode: config.mode,
          };

          serverState.tradeHistory.unshift(trade);
          addServerLog(`🚀 [SERVER 24/7 OPEN ${targetSide} ${lev}x] ${sym} @ $${currentPrice} | ทุน $${tradeUsdt.toFixed(2)} USDT (มูลค่าสัญญา $${notionalValue.toFixed(2)}) | สัญญาณปิดแท่ง ${confirmedCandle.colorNameTh}`);
          saveServerState();

          // Telegram Alert for Open Order
          const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
          const tgOpenMsg = `🟢 <b>[CDC Action Zone Bot] สั่งเปิดออเดอร์ใหม่!</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${sym}
📊 <b>สัญญาณปิดแท่ง:</b> CDC ${confirmedCandle.colorNameTh} (${targetSide} ${lev}x)
⏱ <b>ไทม์เฟรม:</b> ${config.timeframe} (Confirmed Close)
💰 <b>ราคาเข้า:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
⚡ <b>Leverage:</b> ${lev}x (${config.marketType || 'SPOT'})
💵 <b>เงินทุน:</b> $${tradeUsdt.toFixed(2)} USDT (มูลค่า $${notionalValue.toFixed(2)})
🎯 <b>Take Profit:</b> +${config.takeProfitPercent}%
🛡 <b>Stop Loss:</b> -${config.stopLossPercent}%
💼 <b>ยอดพอร์ตคงเหลือ:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
🕒 <b>เวลา:</b> ${timeStr}`;
          sendTelegramNotification(tgOpenMsg, 'BUY');
        }
      }
    }
  } catch (err) {
    console.error('Error in server bot cycle:', err);


  } finally {
    isCycleRunning = false;
  }
}

// Start continuous 24/7 background execution loop every 10 seconds
setInterval(runServerBotCycle, 10000);

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

// ==================== CENTRAL BOT REST ENDPOINTS ====================

// 1. Get central server state
app.get('/api/bot/state', (req, res) => {
  return res.json({
    botConfig: serverState.botConfig,
    paperAccount: serverState.paperAccount,
    tradeHistory: serverState.tradeHistory,
    botLogs: serverState.botLogs,
    telegramConfig: serverState.telegramConfig,
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
    serverState.botConfig = {
      ...serverState.botConfig,
      ...updated,
    };
    saveServerState();
    addServerLog(`⚙️ อัปเดตการตั้งค่าบอท: ${serverState.botConfig.symbol} | Leverage: ${serverState.botConfig.leverage || 1}x | TF: ${serverState.botConfig.timeframe} | สถานะ: ${serverState.botConfig.isActive ? 'เปิดทำงาน 🟢' : 'หยุด 🔴'}`);
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
  const statusMsg = `${next ? '🚀' : '⏸'} <b>[CDC Bot] ${next ? 'เปิดใช้งานระบบเทรดอัตโนมัติ 24/7' : 'หยุดการทำงานของบอทชั่วคราว'}</b>
━━━━━━━━━━━━━━━━━━━━
📊 <b>สถานะ:</b> ${next ? 'กำลังทำงาน 🟢 (ACTIVE)' : 'หยุดทำงาน 🔴 (PAUSED)'}
🪙 <b>เหรียญหลัก:</b> #${serverState.botConfig.symbol}
⏱ <b>ไทม์เฟรม:</b> ${serverState.botConfig.timeframe}
⚡ <b>Leverage:</b> ${serverState.botConfig.leverage || 1}x (${serverState.botConfig.marketType || 'SPOT'})
💼 <b>โหมด:</b> ${serverState.botConfig.mode === 'PAPER' ? 'พอร์ตจำลอง (Paper Trading)' : 'พอร์ตจริง (Binance Live)'}
🕒 <b>เวลา:</b> ${timeStr}`;
  sendTelegramNotification(statusMsg, 'STATUS');

  return res.json({ success: true, isActive: next });
});

// 4. Manual Order
app.post('/api/bot/manual-order', (req, res) => {
  try {
    const { symbol, side, amountUsdt, currentPrice } = req.body;
    if (!symbol || !side || !amountUsdt || !currentPrice) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    if (serverState.paperAccount.usdtBalance < amountUsdt) {
      return res.status(400).json({ error: 'ยอดเงินคงเหลือไม่เพียงพอ' });
    }

    const lev = Math.min(Math.max(1, serverState.botConfig.leverage || 1), 10);
    const notionalValue = amountUsdt * lev;
    const coinAmount = notionalValue / currentPrice;
    const liqPrice = side === 'LONG'
      ? currentPrice * (1 - 0.9 / lev)
      : currentPrice * (1 + 0.9 / lev);

    serverState.paperAccount.usdtBalance -= amountUsdt;

    const newPos: PaperPosition = {
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
      currentPnlPercent: 0,
    };

    serverState.paperAccount.activePositions.push(newPos);

    const trade: ExecutedTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      symbol,
      timeframe: serverState.botConfig.timeframe,
      side: side === 'LONG' ? 'BUY' : 'SELL',
      price: currentPrice,
      amount: coinAmount,
      usdtValue: notionalValue,
      leverage: lev,
      reason: `[Manual Order ${lev}x] เปิด ${side} ด้วยตนเอง`,
      timestamp: Date.now(),
      mode: serverState.botConfig.mode,
    };

    serverState.tradeHistory.unshift(trade);
    addServerLog(`✋ [MANUAL ORDER ${lev}x] เปิด ${side} ${symbol} @ $${currentPrice} | ทุน $${amountUsdt} USDT (มูลค่าสัญญา $${notionalValue.toFixed(2)})`);
    saveServerState();

    // Telegram Alert for Manual Order
    const timeStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const tgManualMsg = `✋ <b>[CDC Bot] เปิดออเดอร์ด้วยตนเอง (Manual Order)</b>
━━━━━━━━━━━━━━━━━━━━
🪙 <b>เหรียญ:</b> #${symbol}
📊 <b>คำสั่ง:</b> ${side} ${lev}x
💰 <b>ราคา:</b> $${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
💵 <b>เงินทุน:</b> $${amountUsdt.toFixed(2)} USDT (มูลค่า $${notionalValue.toFixed(2)})
💼 <b>ยอดพอร์ตคงเหลือ:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
🕒 <b>เวลา:</b> ${timeStr}`;
    sendTelegramNotification(tgManualMsg, 'BUY');

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(err) });
  }
});

// 5. Manual Close Position
app.post('/api/bot/close-position', async (req, res) => {
  try {
    let { symbol, currentPrice, reason = 'Manual Close' } = req.body;
    const idx = serverState.paperAccount.activePositions.findIndex((p) => p.symbol === symbol);
    if (idx === -1) {
      return res.status(404).json({ error: 'ไม่พบตำแหน่งที่เปิดอยู่' });
    }

    const pos = serverState.paperAccount.activePositions[idx];

    // Verification: If currentPrice is missing, zero, or has wild ratio error (>50x difference from entryPrice), fetch exact market price for this symbol
    const priceRatio = (currentPrice && pos.entryPrice) ? (currentPrice / pos.entryPrice) : 0;
    if (!currentPrice || currentPrice <= 0 || priceRatio > 50 || priceRatio < 0.02) {
      try {
        const liveKlines = await fetchKlinesDirect(pos.symbol, '1m', 1);
        if (liveKlines.length > 0 && liveKlines[0].close > 0) {
          currentPrice = liveKlines[0].close;
        }
      } catch (err) {
        console.warn(`Failed to verify close price for ${pos.symbol}:`, err);
      }
    }

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
    saveServerState();

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
💼 <b>ยอดพอร์ตคงเหลือ:</b> $${serverState.paperAccount.usdtBalance.toFixed(2)} USDT
🕒 <b>เวลา:</b> ${timeStr}`;
    sendTelegramNotification(tgManualCloseMsg, 'SELL');

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
  return res.json({ success: true });
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

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'Binance API request failed' });
    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

app.get('/api/binance/ticker24h', async (req, res) => {
  try {
    const rawSymbol = req.query.symbol as string | undefined;
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const url = symbol
      ? `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
      : `https://api.binance.com/api/v3/ticker/24hr`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'Ticker request failed' });
    const data = await response.json();
    return res.json(data);
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

    const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'Depth request failed' });
    const data = await response.json();
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

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const url = symbol ? `${baseUrl}/exchangeInfo?symbol=${symbol}` : `${baseUrl}/exchangeInfo`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'ExchangeInfo request failed' });
    const data = await response.json();
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
      return res.status(response.status).json({ error: data.msg || 'Binance Account API error' });
    }

    const balances = (data.balances || []).filter(
      (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );

    return res.json({
      success: true,
      canTrade: data.canTrade,
      accountType: data.accountType,
      balances,
    });
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
      return res.status(response.status).json({ error: data.msg || 'Binance Futures Account API error' });
    }

    return res.json({
      success: true,
      canTrade: data.canTrade,
      feeTier: data.feeTier,
      assets: data.assets || [],
      positions: data.positions || [],
    });
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
