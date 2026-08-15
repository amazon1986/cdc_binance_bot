import React, { useState, useEffect, useCallback } from 'react';
import {
  KlineData,
  Timeframe,
  BotConfig,
  PaperAccount,
  ExecutedTrade,
  BinanceApiKeys,
  PaperPosition,
  BinanceTicker24h,
} from './types';
import {
  getStoredBotConfig,
  saveBotConfig,
  getStoredPaperAccount,
  savePaperAccount,
  getStoredTradeHistory,
  saveTradeHistory,
  addTradeToHistory,
  getStoredBinanceKeys,
  saveBinanceKeys,
  getStoredLogs,
  addBotLog,
  getStoredSymbols,
  DEFAULT_PAPER_ACCOUNT,
} from './lib/botStore';
import {
  fetchBinanceKlines,
  fetchBinanceTicker24h,
  POPULAR_PAIRS,
  fetchSymbolExchangeInfo,
  formatQuantityByStepSize,
  executeLiveBinanceOrder,
  fetchLiveBinanceUsdtBalance,
  formatCryptoPrice,
} from './lib/binanceApi';
import { calculateCDCActionZone, getCrossoverInfo } from './lib/cdcIndicator';
import { Header } from './components/Header';
import { CDCChart } from './components/CDCChart';
import { BotControlPanel } from './components/BotControlPanel';
import { BacktestingView } from './components/BacktestingView';
import { MarketScanner } from './components/MarketScanner';
import { AiAnalystPanel } from './components/AiAnalystPanel';
import { BinanceSettingsModal } from './components/BinanceSettingsModal';
import { TradeHistoryTable } from './components/TradeHistoryTable';
import { TradingStats } from './components/TradingStats';
import { CoffeeDonation } from './components/CoffeeDonation';

/**
 * Calculates equal-weight / fixed / percentage position size based on Total Portfolio Equity.
 */
function calculateOrderSize(config: BotConfig, account: PaperAccount): number {
  const maxPositions = config.maxOpenPositions || 5;
  if (account.activePositions.length >= maxPositions) return 0;

  const totalPositionsValue = account.activePositions.reduce((sum, p) => sum + (p.usdtInvested || 0), 0);
  const totalEquity = account.usdtBalance + totalPositionsValue;

  const mode = config.positionSizingMode || 'EQUAL_WEIGHT';
  let targetUsdt = 0;

  if (mode === 'EQUAL_WEIGHT') {
    // 🎯 ถัวเฉลี่ยเท่ากันเป๊ะ: ทุนรวม (Total Equity) / จำนวนไม้สูงสุด (Max Slots)
    targetUsdt = totalEquity / maxPositions;
  } else if (mode === 'PERCENT_EQUITY') {
    // 🎯 % ของมูลค่าพอร์ตรวม (Total Equity %)
    targetUsdt = (totalEquity * (config.balancePercent || 20)) / 100;
  } else {
    // 🎯 จำนวนเงินดอลลาร์คงที่
    targetUsdt = config.tradeAmountUsdt || 100;
  }

  // ไม่เกินเงินสดคงเหลือที่มี
  return Math.min(targetUsdt, account.usdtBalance);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chart' | 'backtest' | 'scanner' | 'ai' | 'history' | 'stats' | 'coffee'>('chart');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Core Persistent State
  const [botConfig, setBotConfig] = useState<BotConfig>(getStoredBotConfig);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>(() => getStoredBotConfig().timeframe || '1d');
  const [paperAccount, setPaperAccount] = useState<PaperAccount>(getStoredPaperAccount);
  const [binanceKeys, setBinanceKeys] = useState<BinanceApiKeys>(getStoredBinanceKeys);
  const [tradeHistory, setTradeHistory] = useState<ExecutedTrade[]>(getStoredTradeHistory);
  const [botLogs, setBotLogs] = useState<string[]>(getStoredLogs);

  // Market & Kline State
  const [candles, setCandles] = useState<KlineData[]>([]);
  const [botCandles, setBotCandles] = useState<KlineData[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number | undefined>(undefined);
  const [ethPrice, setEthPrice] = useState<number | undefined>(undefined);
  const [allTickers, setAllTickers] = useState<BinanceTicker24h[]>([]);

  // Notification Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'buy' | 'sell' | 'info' } | null>(null);

  const showToast = (text: string, type: 'buy' | 'sell' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const [currentPriceInfo, setCurrentPriceInfo] = useState<{ symbol: string; price: number }>({
    symbol: 'BTCUSDT',
    price: 0,
  });

  // 1. Fetch Market Candlestick Data (Separating Chart View from Bot Engine)
  const loadCandles = useCallback(async () => {
    setIsLoadingCandles(true);
    try {
      // A. Load Chart Viewing Candles (on chartTimeframe)
      const chartRaw = await fetchBinanceKlines(botConfig.symbol, chartTimeframe, 300);
      const chartCdc = calculateCDCActionZone(chartRaw, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod);
      setCandles(chartCdc);
      if (chartCdc.length > 0) {
        const latest = chartCdc[chartCdc.length - 1];
        setCurrentPriceInfo({ symbol: botConfig.symbol, price: latest.close });
      }

      // B. Load Bot Strategy Candles (strictly on botConfig.timeframe)
      if (chartTimeframe === botConfig.timeframe) {
        setBotCandles(chartCdc);
      } else {
        const botRaw = await fetchBinanceKlines(botConfig.symbol, botConfig.timeframe, 300);
        const botCdc = calculateCDCActionZone(botRaw, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod);
        setBotCandles(botCdc);
      }
    } catch (err) {
      console.error('Error loading klines:', err);
    } finally {
      setIsLoadingCandles(false);
    }
  }, [botConfig.symbol, botConfig.timeframe, chartTimeframe, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod]);

  // 2. Fetch All Crypto Ticker Prices for Header Running Ticker Tape
  const loadTickers = useCallback(async () => {
    try {
      const raw = await fetchBinanceTicker24h();
      if (raw && raw.length > 0) {
        const popularSet = new Set(POPULAR_PAIRS);
        const filtered = raw
          .filter((t) => popularSet.has(t.symbol) || (t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN')))
          .sort((a, b) => {
            const indexA = POPULAR_PAIRS.indexOf(a.symbol);
            const indexB = POPULAR_PAIRS.indexOf(b.symbol);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return b.quoteVolume - a.quoteVolume;
          })
          .slice(0, 30);

        setAllTickers(filtered);

        const btc = raw.find((t) => t.symbol === 'BTCUSDT');
        const eth = raw.find((t) => t.symbol === 'ETHUSDT');
        if (btc) setBtcPrice(btc.lastPrice);
        if (eth) setEthPrice(eth.lastPrice);
      }
    } catch (err) {
      console.warn('Ticker update failed:', err);
    }
  }, []);

  // Initial Load & Polling Intervals
  useEffect(() => {
    loadCandles();
    loadTickers();

    const candleInterval = setInterval(loadCandles, 10000); // refresh candles every 10s
    const tickerInterval = setInterval(loadTickers, 8000); // refresh tickers every 8s

    return () => {
      clearInterval(candleInterval);
      clearInterval(tickerInterval);
    };
  }, [loadCandles, loadTickers]);

  // Real-time PnL update effect for ALL open positions when ticker prices update
  useEffect(() => {
    if (!allTickers || allTickers.length === 0) return;
    const tickerPriceMap = new Map<string, number>();
    for (const t of allTickers) {
      tickerPriceMap.set(t.symbol, t.lastPrice);
    }

    setPaperAccount((prev) => {
      let hasChanges = false;
      const updatedPositions = prev.activePositions.map((pos) => {
        const livePrice = tickerPriceMap.get(pos.symbol) || (pos.symbol === currentPriceInfo.symbol ? currentPriceInfo.price : 0);
        if (livePrice > 0) {
          const pnlPercent = pos.side === 'SHORT'
            ? ((pos.entryPrice - livePrice) / pos.entryPrice) * 100
            : ((livePrice - pos.entryPrice) / pos.entryPrice) * 100;
          const pnlUsdt = (pos.usdtInvested * pnlPercent) / 100;

          if (Math.abs((pos.currentPnlUsdt || 0) - pnlUsdt) > 0.001) {
            hasChanges = true;
            return {
              ...pos,
              currentPnlUsdt: Number(pnlUsdt.toFixed(2)),
              currentPnlPercent: Number(pnlPercent.toFixed(2)),
            };
          }
        }
        return pos;
      });

      if (hasChanges) {
        const newAcc = { ...prev, activePositions: updatedPositions };
        savePaperAccount(newAcc);
        return newAcc;
      }
      return prev;
    });
  }, [allTickers, currentPriceInfo]);

  // Save config state updates to storage
  const handleSaveBotConfig = (updated: BotConfig) => {
    setBotConfig(updated);
    saveBotConfig(updated);
    addBotLog(`อัปเดตการตั้งค่าบอท: ${updated.symbol} (${updated.timeframe}), SL: ${updated.stopLossPercent}%, TP: ${updated.takeProfitPercent}%`);
    setBotLogs(getStoredLogs());
  };

  const handleSaveBinanceKeys = (updatedKeys: BinanceApiKeys) => {
    setBinanceKeys(updatedKeys);
    saveBinanceKeys(updatedKeys);
    addBotLog(`อัปเดต Binance API Key เรียบร้อยแล้ว (${updatedKeys.isTestnet ? 'Testnet' : 'Live'})`);
    setBotLogs(getStoredLogs());
  };

  const handleResetPaperAccount = () => {
    if (confirm('คุณต้องการรีเซ็ตยอดเงินบัญชีทดลอง (Paper Trading) เป็น $1,000 USDT หรือไม่?')) {
      setPaperAccount(DEFAULT_PAPER_ACCOUNT);
      savePaperAccount(DEFAULT_PAPER_ACCOUNT);
      addBotLog('รีเซ็ตยอดเงินบัญชีทดลอง (Paper Account) เป็น $1,000 USDT');
      setBotLogs(getStoredLogs());
      showToast('รีเซ็ตยอดเงินพอร์ตจำลองเป็น $1,000 USDT แล้ว', 'info');
    }
  };

  // Adjust existing account balance if it was set to 10000
  useEffect(() => {
    const current = getStoredPaperAccount();
    if (current.initialUsdtBalance === 10000 || current.usdtBalance === 10000) {
      const updated: PaperAccount = {
        ...current,
        initialUsdtBalance: 1000,
        usdtBalance: current.usdtBalance === 10000 ? 1000 : current.usdtBalance,
      };
      setPaperAccount(updated);
      savePaperAccount(updated);
    }
  }, []);

  const currentPrice = currentPriceInfo.price;
  const currentCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const botCurrentCandle = botCandles.length > 0 ? botCandles[botCandles.length - 1] : currentCandle;

  // Reset currentPriceInfo when botConfig.symbol changes
  useEffect(() => {
    setCurrentPriceInfo({ symbol: botConfig.symbol, price: 0 });
  }, [botConfig.symbol]);

  // 3. Single-Pair Bot Automated Execution Loop & SL/TP Check (Evaluated strictly on botConfig.timeframe)
  useEffect(() => {
    if (currentPriceInfo.symbol !== botConfig.symbol || currentPriceInfo.price === 0 || !botCurrentCandle) return;

    const price = currentPriceInfo.price;
    const symbol = botConfig.symbol;

    // A. Check Active Positions for Stop Loss / Take Profit / Signal Exit
    setPaperAccount((prevAccount) => {
      let updatedPositions = [...prevAccount.activePositions];
      let updatedBalance = prevAccount.usdtBalance;
      let positionClosed = false;

      updatedPositions = updatedPositions.filter((pos) => {
        if (pos.symbol !== symbol) return true;

        const pnlPercent = pos.side === 'SHORT'
          ? ((pos.entryPrice - price) / pos.entryPrice) * 100
          : ((price - pos.entryPrice) / pos.entryPrice) * 100;
        const pnlUsdt = (pos.usdtInvested * pnlPercent) / 100;

        let closeReason: string | null = null;

        // Check Stop Loss
        if (botConfig.stopLossPercent > 0 && pnlPercent <= -botConfig.stopLossPercent) {
          closeReason = `Stop Loss (-${botConfig.stopLossPercent}%)`;
        }
        // Check Take Profit
        else if (botConfig.takeProfitPercent > 0 && pnlPercent >= botConfig.takeProfitPercent) {
          closeReason = `Take Profit (+${botConfig.takeProfitPercent}%)`;
        }
        // Check CDC Signal Exit (Always active for open positions including Manual trades)
        else if (botCurrentCandle && botCurrentCandle.zone) {
          const isExit = pos.side === 'SHORT'
            ? botConfig.buyOnSignal.includes(botCurrentCandle.zone as any)
            : botConfig.sellOnSignal.includes(botCurrentCandle.zone as any);
          if (isExit) {
            closeReason = `CDC Exit Signal ${botCurrentCandle.colorNameTh}`;
          }
        }

        if (closeReason) {
          positionClosed = true;
          const returnUsdt = pos.usdtInvested + pnlUsdt;
          updatedBalance += returnUsdt;

          if (botConfig.mode === 'BINANCE_LIVE' && binanceKeys.apiKey && binanceKeys.apiSecret) {
            fetchSymbolExchangeInfo(symbol, binanceKeys.isTestnet).then((rules) => {
              const stepSize = rules ? rules.stepSize : 0.0001;
              const formattedQty = formatQuantityByStepSize(pos.amount, stepSize);
              executeLiveBinanceOrder({
                apiKey: binanceKeys.apiKey,
                apiSecret: binanceKeys.apiSecret,
                isTestnet: binanceKeys.isTestnet,
                symbol: pos.symbol,
                side: pos.side === 'LONG' ? 'SELL' : 'BUY',
                quantity: formattedQty,
                orderType: 'MARKET',
              }).then((res) => {
                if (res.success) {
                  addBotLog(`✅ [LIVE EXIT SUCCESS] Order ID: ${res.order?.orderId} | ปิด ${pos.side} ${pos.symbol}`);
                } else {
                  addBotLog(`❌ [LIVE EXIT ERROR] ${pos.symbol}: ${res.error}`);
                }
                setBotLogs(getStoredLogs());
              });
            });
          }

          const trade: ExecutedTrade = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            symbol: pos.symbol,
            timeframe: botConfig.timeframe,
            side: pos.side === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT',
            price: price,
            amount: pos.amount,
            usdtValue: returnUsdt,
            pnlUsdt: Number(pnlUsdt.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2)),
            reason: `[${pos.side} ${botConfig.mode}] ${closeReason}`,
            timestamp: Date.now(),
            mode: botConfig.mode,
          };

          addTradeToHistory(trade);
          setTradeHistory(getStoredTradeHistory());

          const logMsg = `🛑 [AUTO CLOSE ${pos.side}] ปิดสัญญา ${pos.symbol} @ ${formatCryptoPrice(price)} | PnL: ${pnlUsdt >= 0 ? '+' : ''}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%) | เหตุผล: ${closeReason}`;
          addBotLog(logMsg);
          setBotLogs(getStoredLogs());
          showToast(`ปิดสัญญา ${pos.side} ${pos.symbol} แล้ว | PnL: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`, pnlUsdt >= 0 ? 'buy' : 'sell');

          return false;
        }

        // Update unrealized PnL
        pos.currentPnlUsdt = pnlUsdt;
        pos.currentPnlPercent = pnlPercent;
        return true;
      });

      if (positionClosed) {
        const newAccount = {
          ...prevAccount,
          usdtBalance: updatedBalance,
          activePositions: updatedPositions,
        };
        savePaperAccount(newAccount);
        return newAccount;
      }

      return prevAccount;
    });

    // B. Check Bot Entry Conditions for SINGLE Coin Mode
    if (!botConfig.isActive || botConfig.scanMode === 'MULTI_SCAN') return;

    const maxPositions = botConfig.maxOpenPositions || 5;
    if (paperAccount.activePositions.length >= maxPositions) return;

    const hasPosition = paperAccount.activePositions.some((p) => p.symbol === botConfig.symbol);
    if (hasPosition) return;

    const dirMode = botConfig.directionMode ?? 'LONG_ONLY';
    const evalCandles = botCandles.length > 0 ? botCandles : candles;
    const crossInfo = getCrossoverInfo(evalCandles);

    // 🎯 กลยุทธ์ลุงโฉลก: ตรวจสอบจุดตัด Crossover ล่าสุด (ต้องเกิดขึ้นไม่เกิน 0-1 แท่งเท่านั้น)
    // 1. Long Entry: เฉพาะเมื่อเกิด Golden Cross สดใหม่ (isFreshGoldenCross) และแท่งเป็นสีฟ้าหรือเขียวคอนเฟิร์ม
    // 2. Short Entry: เฉพาะเมื่อเกิด Dead Cross สดใหม่ (isFreshDeadCross) และแท่งเป็นสีแดงคอนเฟิร์ม
    const isBuySignal = crossInfo.isFreshGoldenCross && (
      (botConfig.buyOnSignal.includes('BLUE') && botCurrentCandle.zone === 'BLUE') ||
      (botConfig.buyOnSignal.includes('GREEN') && botCurrentCandle.zone === 'GREEN') ||
      (botConfig.buyOnSignal.includes('BLUE') && botConfig.buyOnSignal.includes('GREEN') && (botCurrentCandle.zone === 'BLUE' || botCurrentCandle.zone === 'GREEN'))
    );

    const isSellSignal = crossInfo.isFreshDeadCross && (
      (botConfig.sellOnSignal.includes('RED') && botCurrentCandle.zone === 'RED') ||
      (botConfig.sellOnSignal.includes('YELLOW') && botCurrentCandle.zone === 'YELLOW')
    );

    let targetSide: 'LONG' | 'SHORT' | null = null;
    if ((dirMode === 'LONG_ONLY' || dirMode === 'BOTH') && isBuySignal) {
      targetSide = 'LONG';
    } else if ((dirMode === 'SHORT_ONLY' || dirMode === 'BOTH') && isSellSignal) {
      targetSide = 'SHORT';
    }

    if (targetSide) {
      const tradeUsdt = calculateOrderSize(botConfig, paperAccount);

      if (tradeUsdt >= 10 && paperAccount.usdtBalance >= tradeUsdt) {
        const coinAmount = tradeUsdt / price;

        if (botConfig.mode === 'BINANCE_LIVE') {
          if (!binanceKeys.apiKey || !binanceKeys.apiSecret) {
            const errLog = `⚠️ [LIVE MODE REJECTED] ไม่พบ Binance API Key กรุณาตั้งค่า API Key ในเมนูการเชื่อมต่อ Binance`;
            addBotLog(errLog);
            setBotLogs(getStoredLogs());
            showToast(errLog, 'sell');
            return;
          }

          fetchSymbolExchangeInfo(symbol, binanceKeys.isTestnet).then((rules) => {
            const stepSize = rules ? rules.stepSize : 0.0001;
            const minNotional = rules ? rules.minNotional : 5;
            const formattedQty = formatQuantityByStepSize(coinAmount, stepSize);

            if (formattedQty * price < minNotional) {
              const errLog = `⚠️ [LIVE REJECTED] มูลค่าออเดอร์ ($${(formattedQty * price).toFixed(2)}) ต่ำกว่าขั้นต่ำ Binance MIN_NOTIONAL ($${minNotional})`;
              addBotLog(errLog);
              setBotLogs(getStoredLogs());
              showToast(errLog, 'sell');
              return;
            }

            executeLiveBinanceOrder({
              apiKey: binanceKeys.apiKey,
              apiSecret: binanceKeys.apiSecret,
              isTestnet: binanceKeys.isTestnet,
              symbol: symbol,
              side: targetSide === 'LONG' ? 'BUY' : 'SELL',
              quantity: formattedQty,
              orderType: 'MARKET',
            }).then((res) => {
              if (res.success) {
                const logMsg = `✅ [LIVE ${targetSide} FILLED] Order ID: ${res.order?.orderId} | เปิด ${targetSide} ${symbol} @ ${formatCryptoPrice(price)} | มูลค่า $${tradeUsdt.toFixed(2)} USDT`;
                addBotLog(logMsg);
                showToast(`Binance Live: เปิดสัญญา ${targetSide} ${symbol} สำเร็จ`, targetSide === 'LONG' ? 'buy' : 'sell');
              } else {
                const errLog = `❌ [LIVE ORDER FAILED] ${symbol}: ${res.error}`;
                addBotLog(errLog);
                showToast(errLog, 'sell');
              }
              setBotLogs(getStoredLogs());
            });
          });
        }

        const newPos: PaperPosition = {
          symbol: botConfig.symbol,
          side: targetSide,
          entryPrice: price,
          amount: coinAmount,
          usdtInvested: tradeUsdt,
          entryTime: Date.now(),
          currentPnlUsdt: 0,
          currentPnlPercent: 0,
        };

        const updatedAccount: PaperAccount = {
          ...paperAccount,
          usdtBalance: paperAccount.usdtBalance - tradeUsdt,
          activePositions: [...paperAccount.activePositions, newPos],
        };

        setPaperAccount(updatedAccount);
        savePaperAccount(updatedAccount);

        const trade: ExecutedTrade = {
          id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          symbol: botConfig.symbol,
          timeframe: botConfig.timeframe,
          side: targetSide === 'LONG' ? 'LONG' : 'SHORT',
          price: price,
          amount: coinAmount,
          usdtValue: tradeUsdt,
          reason: `[SINGLE-PAIR ${botConfig.mode} ${targetSide}] CDC ${currentCandle.colorNameTh}`,
          timestamp: Date.now(),
          mode: botConfig.mode,
        };

        addTradeToHistory(trade);
        setTradeHistory(getStoredTradeHistory());

        if (botConfig.mode !== 'BINANCE_LIVE') {
          const logMsg = `🟢 [SINGLE-PAIR ${targetSide}] เปิดสัญญา ${botConfig.symbol} @ ${formatCryptoPrice(price)} | มูลค่า $${tradeUsdt.toFixed(2)} USDT | เหตุผล: CDC ${currentCandle.colorNameTh}`;
          addBotLog(logMsg);
          setBotLogs(getStoredLogs());
          showToast(`เปิดสัญญา ${targetSide} ${botConfig.symbol} เรียบร้อยแล้ว`, targetSide === 'LONG' ? 'buy' : 'sell');
        }
      }
    }
  }, [currentPriceInfo, currentCandle, botConfig, paperAccount, binanceKeys]);

  // 4. Multi-Coin Auto Scan & Auto Entry/Exit Loop
  useEffect(() => {
    if (!botConfig.isActive || botConfig.scanMode !== 'MULTI_SCAN') return;

    let isSubscribed = true;

    const runMultiCoinScan = async () => {
      try {
        const symbolsToScan = getStoredSymbols();
        for (const sym of symbolsToScan) {
          if (!isSubscribed) break;

          const rawCandles = await fetchBinanceKlines(sym, botConfig.timeframe, 100);
          if (!isSubscribed) break;

          const cdcCandles = calculateCDCActionZone(rawCandles, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod);
          if (cdcCandles.length === 0) continue;

          const latest = cdcCandles[cdcCandles.length - 1];
          const freshAcc = getStoredPaperAccount();
          const holdingPos = freshAcc.activePositions.find((p) => p.symbol === sym);

          // A. If holding position for sym, update live PnL and check Auto Exit using sym's real price
          if (holdingPos) {
            const pnlPercent = holdingPos.side === 'SHORT'
              ? ((holdingPos.entryPrice - latest.close) / holdingPos.entryPrice) * 100
              : ((latest.close - holdingPos.entryPrice) / holdingPos.entryPrice) * 100;
            const pnlUsdt = (holdingPos.usdtInvested * pnlPercent) / 100;

            const isTp = botConfig.takeProfitPercent > 0 && pnlPercent >= botConfig.takeProfitPercent;
            const isSl = botConfig.stopLossPercent > 0 && pnlPercent <= -botConfig.stopLossPercent;
            const isSignalExit = holdingPos.side === 'SHORT'
              ? (latest.zone && botConfig.buyOnSignal.includes(latest.zone as any))
              : (latest.zone && botConfig.sellOnSignal.includes(latest.zone as any));

            if (isTp || isSl || isSignalExit) {
              const returnUsdt = holdingPos.usdtInvested + pnlUsdt;
              const updatedAccount: PaperAccount = {
                ...freshAcc,
                usdtBalance: freshAcc.usdtBalance + returnUsdt,
                activePositions: freshAcc.activePositions.filter((p) => p.symbol !== sym),
              };

              setPaperAccount(updatedAccount);
              savePaperAccount(updatedAccount);

              if (botConfig.mode === 'BINANCE_LIVE' && binanceKeys.apiKey && binanceKeys.apiSecret) {
                fetchSymbolExchangeInfo(sym, binanceKeys.isTestnet).then((rules) => {
                  const stepSize = rules ? rules.stepSize : 0.0001;
                  const formattedQty = formatQuantityByStepSize(holdingPos.amount, stepSize);
                  executeLiveBinanceOrder({
                    apiKey: binanceKeys.apiKey,
                    apiSecret: binanceKeys.apiSecret,
                    isTestnet: binanceKeys.isTestnet,
                    symbol: sym,
                    side: holdingPos.side === 'LONG' ? 'SELL' : 'BUY',
                    quantity: formattedQty,
                    orderType: 'MARKET',
                  }).then((res) => {
                    if (res.success) {
                      addBotLog(`✅ [LIVE MULTI EXIT] Order ID: ${res.order?.orderId} | ปิด ${holdingPos.side} ${sym}`);
                    } else {
                      addBotLog(`❌ [LIVE MULTI EXIT ERROR] ${sym}: ${res.error}`);
                    }
                    setBotLogs(getStoredLogs());
                  });
                });
              }

              const tradeReason = isTp
                ? `Take Profit (+${botConfig.takeProfitPercent}%)`
                : isSl
                ? `Stop Loss (-${botConfig.stopLossPercent}%)`
                : `CDC Exit Signal (${latest.colorNameTh})`;

              const trade: ExecutedTrade = {
                id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                symbol: sym,
                timeframe: botConfig.timeframe,
                side: holdingPos.side === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT',
                price: latest.close,
                amount: holdingPos.amount,
                usdtValue: returnUsdt,
                pnlUsdt: Number(pnlUsdt.toFixed(2)),
                pnlPercent: Number(pnlPercent.toFixed(2)),
                reason: `[${holdingPos.side} ${botConfig.mode}] ${tradeReason}`,
                timestamp: Date.now(),
                mode: botConfig.mode,
              };

              addTradeToHistory(trade);
              setTradeHistory(getStoredTradeHistory());

              const logMsg = `🛑 [MULTI-SCAN EXIT ${holdingPos.side}] ปิดสัญญา ${sym} @ ${formatCryptoPrice(latest.close)} | PnL: ${pnlUsdt >= 0 ? '+' : ''}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%) | เหตุผล: ${tradeReason}`;
              addBotLog(logMsg);
              setBotLogs(getStoredLogs());
              showToast(`[MULTI-SCAN EXIT] ปิด ${sym} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`, pnlPercent >= 0 ? 'buy' : 'sell');
            }
            continue; // Already holding this coin, skip entry check
          }

          // B. If not holding position for sym, check entry conditions
          const symCandles = cdcCandles;
          const dirMode = botConfig.directionMode ?? 'LONG_ONLY';
          const symCrossInfo = getCrossoverInfo(symCandles);

          // 🎯 กลยุทธ์ลุงโฉลก Multi-Scan: ตรวจสอบจุดตัด Crossover สดใหม่ไม่เกิน 0-1 แท่ง
          const isBuySignal = symCrossInfo.isFreshGoldenCross && (
            (botConfig.buyOnSignal.includes('BLUE') && latest.zone === 'BLUE') ||
            (botConfig.buyOnSignal.includes('GREEN') && latest.zone === 'GREEN') ||
            (botConfig.buyOnSignal.includes('BLUE') && botConfig.buyOnSignal.includes('GREEN') && (latest.zone === 'BLUE' || latest.zone === 'GREEN'))
          );

          const isSellSignal = symCrossInfo.isFreshDeadCross && (
            (botConfig.sellOnSignal.includes('RED') && latest.zone === 'RED') ||
            (botConfig.sellOnSignal.includes('YELLOW') && latest.zone === 'YELLOW')
          );

          let targetSide: 'LONG' | 'SHORT' | null = null;
          if ((dirMode === 'LONG_ONLY' || dirMode === 'BOTH') && isBuySignal) {
            targetSide = 'LONG';
          } else if ((dirMode === 'SHORT_ONLY' || dirMode === 'BOTH') && isSellSignal) {
            targetSide = 'SHORT';
          }

          const maxPositions = botConfig.maxOpenPositions || 5;
          if (freshAcc.activePositions.length >= maxPositions) {
            break; // All slots are filled
          }

          if (targetSide) {
            const tradeUsdt = calculateOrderSize(botConfig, freshAcc);

            if (tradeUsdt >= 10 && freshAcc.usdtBalance >= tradeUsdt) {
              const coinAmount = tradeUsdt / latest.close;

              if (botConfig.mode === 'BINANCE_LIVE') {
                if (!binanceKeys.apiKey || !binanceKeys.apiSecret) {
                  addBotLog(`⚠️ [MULTI-SCAN LIVE REJECTED] ไม่พบ Binance API Key สำหรับ ${sym}`);
                  setBotLogs(getStoredLogs());
                  continue;
                }

                const rules = await fetchSymbolExchangeInfo(sym, binanceKeys.isTestnet);
                const stepSize = rules ? rules.stepSize : 0.0001;
                const minNotional = rules ? rules.minNotional : 5;
                const formattedQty = formatQuantityByStepSize(coinAmount, stepSize);

                if (formattedQty * latest.close < minNotional) {
                  addBotLog(`⚠️ [MULTI-SCAN LIVE REJECTED] ${sym}: มูลค่าออเดอร์ต่ำกว่า MIN_NOTIONAL ($${minNotional})`);
                  setBotLogs(getStoredLogs());
                  continue;
                }

                const liveRes = await executeLiveBinanceOrder({
                  apiKey: binanceKeys.apiKey,
                  apiSecret: binanceKeys.apiSecret,
                  isTestnet: binanceKeys.isTestnet,
                  symbol: sym,
                  side: targetSide === 'LONG' ? 'BUY' : 'SELL',
                  quantity: formattedQty,
                  orderType: 'MARKET',
                });

                if (liveRes.success) {
                  addBotLog(`✅ [MULTI-SCAN LIVE FILLED] ${sym}: Order ID ${liveRes.order?.orderId}`);
                } else {
                  addBotLog(`❌ [MULTI-SCAN LIVE FAILED] ${sym}: ${liveRes.error}`);
                  setBotLogs(getStoredLogs());
                  continue;
                }
              }

              const newPos: PaperPosition = {
                symbol: sym,
                side: targetSide,
                entryPrice: latest.close,
                amount: coinAmount,
                usdtInvested: tradeUsdt,
                entryTime: Date.now(),
                currentPnlUsdt: 0,
                currentPnlPercent: 0,
              };

              const updatedAccount: PaperAccount = {
                ...freshAcc,
                usdtBalance: freshAcc.usdtBalance - tradeUsdt,
                activePositions: [...freshAcc.activePositions, newPos],
              };

              setPaperAccount(updatedAccount);
              savePaperAccount(updatedAccount);

              const trade: ExecutedTrade = {
                id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                symbol: sym,
                timeframe: botConfig.timeframe,
                side: targetSide === 'LONG' ? 'LONG' : 'SHORT',
                price: latest.close,
                amount: coinAmount,
                usdtValue: tradeUsdt,
                reason: `[MULTI-SCAN ${targetSide}] CDC ${latest.colorNameTh}`,
                timestamp: Date.now(),
                mode: botConfig.mode,
              };

              addTradeToHistory(trade);
              setTradeHistory(getStoredTradeHistory());

              const logMsg = `🌐 [MULTI-SCAN AUTO ${targetSide}] เปิดสัญญา ${sym} @ ${formatCryptoPrice(latest.close)} | มูลค่า $${tradeUsdt.toFixed(2)} USDT | เหตุผล: CDC ${latest.colorNameTh}`;
              addBotLog(logMsg);
              setBotLogs(getStoredLogs());
              showToast(`[MULTI-SCAN] เปิดสัญญา ${targetSide} ${sym} สำเร็จ`, targetSide === 'LONG' ? 'buy' : 'sell');
            }
          }
        }
      } catch (err) {
        console.warn('Multi-coin auto scan error:', err);
      }
    };

    runMultiCoinScan();
    const interval = setInterval(runMultiCoinScan, 25000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [
    botConfig.isActive,
    botConfig.scanMode,
    botConfig.directionMode,
    botConfig.timeframe,
    botConfig.fastEmaPeriod,
    botConfig.slowEmaPeriod,
    botConfig.buyOnSignal,
    botConfig.sellOnSignal,
    botConfig.usePercentBalance,
    botConfig.balancePercent,
    botConfig.tradeAmountUsdt,
    botConfig.mode,
  ]);

  // Manual Buy Handler (Manual LONG)
  const handleManualBuy = async (customAmountUsdt?: number) => {
    const price = currentPriceInfo.price;
    if (!price || price === 0) return;
    const currentAcc = getStoredPaperAccount();
    const existingPos = currentAcc.activePositions.find((p) => p.symbol === botConfig.symbol);
    if (existingPos) {
      showToast(`คุณมีโพซิชัน ${botConfig.symbol} อยู่แล้ว`, 'info');
      return;
    }

    const tradeUsdt = customAmountUsdt !== undefined && customAmountUsdt > 0
      ? Math.min(customAmountUsdt, currentAcc.usdtBalance)
      : botConfig.usePercentBalance
      ? (currentAcc.usdtBalance * botConfig.balancePercent) / 100
      : Math.min(botConfig.tradeAmountUsdt, currentAcc.usdtBalance);

    if (tradeUsdt < 10) {
      showToast('ยอดเงินคงเหลือไม่พอสำหรับเปิดสัญญา (ขั้นต่ำ $10)', 'info');
      return;
    }

    const coinAmount = tradeUsdt / price;

    if (botConfig.mode === 'BINANCE_LIVE') {
      if (!binanceKeys.apiKey || !binanceKeys.apiSecret) {
        showToast('ไม่พบ Binance API Key กรุณาตั้งค่าก่อนเปิดสัญญา Live', 'sell');
        return;
      }
      const rules = await fetchSymbolExchangeInfo(botConfig.symbol, binanceKeys.isTestnet);
      const stepSize = rules ? rules.stepSize : 0.0001;
      const minNotional = rules ? rules.minNotional : 5;
      const formattedQty = formatQuantityByStepSize(coinAmount, stepSize);

      if (formattedQty * price < minNotional) {
        showToast(`มูลค่าออเดอร์ ($${(formattedQty * price).toFixed(2)}) ต่ำกว่า MIN_NOTIONAL ($${minNotional})`, 'sell');
        return;
      }

      const res = await executeLiveBinanceOrder({
        apiKey: binanceKeys.apiKey,
        apiSecret: binanceKeys.apiSecret,
        isTestnet: binanceKeys.isTestnet,
        symbol: botConfig.symbol,
        side: 'BUY',
        quantity: formattedQty,
        orderType: 'MARKET',
      });

      if (!res.success) {
        showToast(`Binance API Error: ${res.error}`, 'sell');
        addBotLog(`❌ [MANUAL LIVE BUY ERROR] ${res.error}`);
        setBotLogs(getStoredLogs());
        return;
      }
      addBotLog(`✅ [MANUAL LIVE BUY FILLED] Order ID: ${res.order?.orderId} | LONG ${botConfig.symbol}`);
      setBotLogs(getStoredLogs());
    }

    const newPos: PaperPosition = {
      symbol: botConfig.symbol,
      side: 'LONG',
      entryPrice: price,
      amount: coinAmount,
      usdtInvested: tradeUsdt,
      entryTime: Date.now(),
      currentPnlUsdt: 0,
      currentPnlPercent: 0,
    };

    const updatedAccount: PaperAccount = {
      ...currentAcc,
      usdtBalance: currentAcc.usdtBalance - tradeUsdt,
      activePositions: [...currentAcc.activePositions, newPos],
    };

    setPaperAccount(updatedAccount);
    savePaperAccount(updatedAccount);

    const trade: ExecutedTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      symbol: botConfig.symbol,
      timeframe: botConfig.timeframe,
      side: 'LONG',
      price: price,
      amount: coinAmount,
      usdtValue: tradeUsdt,
      reason: `Manual Long Entry (${botConfig.mode})`,
      timestamp: Date.now(),
      mode: botConfig.mode,
    };

    addTradeToHistory(trade);
    setTradeHistory(getStoredTradeHistory());
    addBotLog(`🟢 [MANUAL LONG ${botConfig.mode}] เปิดสัญญา Long ${botConfig.symbol} @ ${formatCryptoPrice(price)} | มูลค่า $${tradeUsdt.toFixed(2)} USDT`);
    setBotLogs(getStoredLogs());
    showToast(`เปิดสัญญา Long ${botConfig.symbol} ($${tradeUsdt.toFixed(2)}) เรียบร้อยแล้ว`, 'buy');
  };

  // Manual Short Handler (Manual SHORT)
  const handleManualShort = async (customAmountUsdt?: number) => {
    const price = currentPriceInfo.price;
    if (!price || price === 0) return;
    const currentAcc = getStoredPaperAccount();
    const existingPos = currentAcc.activePositions.find((p) => p.symbol === botConfig.symbol);
    if (existingPos) {
      showToast(`คุณมีโพซิชัน ${botConfig.symbol} อยู่แล้ว`, 'info');
      return;
    }

    const tradeUsdt = customAmountUsdt !== undefined && customAmountUsdt > 0
      ? Math.min(customAmountUsdt, currentAcc.usdtBalance)
      : botConfig.usePercentBalance
      ? (currentAcc.usdtBalance * botConfig.balancePercent) / 100
      : Math.min(botConfig.tradeAmountUsdt, currentAcc.usdtBalance);

    if (tradeUsdt < 10) {
      showToast('ยอดเงินคงเหลือไม่พอสำหรับเปิดสัญญา (ขั้นต่ำ $10)', 'info');
      return;
    }

    const coinAmount = tradeUsdt / price;

    if (botConfig.mode === 'BINANCE_LIVE') {
      if (!binanceKeys.apiKey || !binanceKeys.apiSecret) {
        showToast('ไม่พบ Binance API Key กรุณาตั้งค่าก่อนเปิดสัญญา Live', 'sell');
        return;
      }
      const rules = await fetchSymbolExchangeInfo(botConfig.symbol, binanceKeys.isTestnet);
      const stepSize = rules ? rules.stepSize : 0.0001;
      const minNotional = rules ? rules.minNotional : 5;
      const formattedQty = formatQuantityByStepSize(coinAmount, stepSize);

      if (formattedQty * price < minNotional) {
        showToast(`มูลค่าออเดอร์ ($${(formattedQty * price).toFixed(2)}) ต่ำกว่า MIN_NOTIONAL ($${minNotional})`, 'sell');
        return;
      }

      const res = await executeLiveBinanceOrder({
        apiKey: binanceKeys.apiKey,
        apiSecret: binanceKeys.apiSecret,
        isTestnet: binanceKeys.isTestnet,
        symbol: botConfig.symbol,
        side: 'SELL',
        quantity: formattedQty,
        orderType: 'MARKET',
      });

      if (!res.success) {
        showToast(`Binance API Error: ${res.error}`, 'sell');
        addBotLog(`❌ [MANUAL LIVE SHORT ERROR] ${res.error}`);
        setBotLogs(getStoredLogs());
        return;
      }
      addBotLog(`✅ [MANUAL LIVE SHORT FILLED] Order ID: ${res.order?.orderId} | SHORT ${botConfig.symbol}`);
      setBotLogs(getStoredLogs());
    }

    const newPos: PaperPosition = {
      symbol: botConfig.symbol,
      side: 'SHORT',
      entryPrice: price,
      amount: coinAmount,
      usdtInvested: tradeUsdt,
      entryTime: Date.now(),
      currentPnlUsdt: 0,
      currentPnlPercent: 0,
    };

    const updatedAccount: PaperAccount = {
      ...currentAcc,
      usdtBalance: currentAcc.usdtBalance - tradeUsdt,
      activePositions: [...currentAcc.activePositions, newPos],
    };

    setPaperAccount(updatedAccount);
    savePaperAccount(updatedAccount);

    const trade: ExecutedTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      symbol: botConfig.symbol,
      timeframe: botConfig.timeframe,
      side: 'SHORT',
      price: price,
      amount: coinAmount,
      usdtValue: tradeUsdt,
      reason: `Manual Short Entry (${botConfig.mode})`,
      timestamp: Date.now(),
      mode: botConfig.mode,
    };

    addTradeToHistory(trade);
    setTradeHistory(getStoredTradeHistory());
    addBotLog(`🔴 [MANUAL SHORT ${botConfig.mode}] เปิดสัญญา Short ${botConfig.symbol} @ ${formatCryptoPrice(price)} | มูลค่า $${tradeUsdt.toFixed(2)} USDT`);
    setBotLogs(getStoredLogs());
    showToast(`เปิดสัญญา Short ${botConfig.symbol} ($${tradeUsdt.toFixed(2)}) เรียบร้อยแล้ว`, 'sell');
  };

  // Close Specific Position Handler
  const handleCloseSpecificPosition = async (symbolToClose: string) => {
    const currentAcc = getStoredPaperAccount();
    const pos = currentAcc.activePositions.find((p) => p.symbol === symbolToClose);
    if (!pos) return;

    const price = (symbolToClose === currentPriceInfo.symbol && currentPriceInfo.price > 0)
      ? currentPriceInfo.price
      : pos.entryPrice * (1 + (pos.currentPnlPercent / 100) * (pos.side === 'SHORT' ? -1 : 1));

    const pnlPercent = pos.currentPnlPercent;
    const pnlUsdt = pos.currentPnlUsdt;
    const returnUsdt = pos.usdtInvested + pnlUsdt;

    if (botConfig.mode === 'BINANCE_LIVE' && binanceKeys.apiKey && binanceKeys.apiSecret) {
      const rules = await fetchSymbolExchangeInfo(symbolToClose, binanceKeys.isTestnet);
      const stepSize = rules ? rules.stepSize : 0.0001;
      const formattedQty = formatQuantityByStepSize(pos.amount, stepSize);

      const liveRes = await executeLiveBinanceOrder({
        apiKey: binanceKeys.apiKey,
        apiSecret: binanceKeys.apiSecret,
        isTestnet: binanceKeys.isTestnet,
        symbol: symbolToClose,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        quantity: formattedQty,
        orderType: 'MARKET',
      });

      if (!liveRes.success) {
        showToast(`Live Exit Error: ${liveRes.error}`, 'sell');
        addBotLog(`❌ [MANUAL LIVE CLOSE ERROR] ${symbolToClose}: ${liveRes.error}`);
        setBotLogs(getStoredLogs());
        return;
      }
      addBotLog(`✅ [MANUAL LIVE CLOSE SUCCESS] Order ID: ${liveRes.order?.orderId} | ปิด ${pos.side} ${symbolToClose}`);
      setBotLogs(getStoredLogs());
    }

    const updatedAccount: PaperAccount = {
      ...currentAcc,
      usdtBalance: currentAcc.usdtBalance + returnUsdt,
      activePositions: currentAcc.activePositions.filter((p) => p.symbol !== symbolToClose),
    };

    setPaperAccount(updatedAccount);
    savePaperAccount(updatedAccount);

    const trade: ExecutedTrade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      symbol: pos.symbol,
      timeframe: botConfig.timeframe,
      side: pos.side === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT',
      price: price,
      amount: pos.amount,
      usdtValue: returnUsdt,
      pnlUsdt: Number(pnlUsdt.toFixed(2)),
      pnlPercent: Number(pnlPercent.toFixed(2)),
      reason: `Manual Close ${pos.side} Position`,
      timestamp: Date.now(),
      mode: botConfig.mode,
    };

    addTradeToHistory(trade);
    setTradeHistory(getStoredTradeHistory());
    addBotLog(`🛑 [MANUAL CLOSE] ปิดสัญญา ${pos.side} ${pos.symbol} | PnL: ${pnlUsdt >= 0 ? '+' : ''}$${pnlUsdt.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    setBotLogs(getStoredLogs());
    showToast(`ปิดสัญญา ${pos.side} ${pos.symbol} เรียบร้อยแล้ว`, pnlUsdt >= 0 ? 'buy' : 'sell');
  };

  // Manual Sell / Close Current Position Handler
  const handleManualSell = () => {
    handleCloseSpecificPosition(botConfig.symbol);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12 antialiased overflow-x-hidden">
      {/* Toast Notification Popup */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-2 text-xs font-bold transition-all animate-bounce ${
            toastMessage.type === 'buy'
              ? 'bg-emerald-600 text-white border-emerald-400'
              : toastMessage.type === 'sell'
              ? 'bg-rose-600 text-white border-rose-400'
              : 'bg-slate-800 text-white border-slate-700'
          }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        botConfig={botConfig}
        paperAccount={paperAccount}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetPaperAccount={handleResetPaperAccount}
        onToggleBot={() => {
          const nextState = !botConfig.isActive;
          handleSaveBotConfig({ ...botConfig, isActive: nextState });
          showToast(nextState ? 'เปิดระบบอัตโนมัติ CDC Bot แล้ว' : 'หยุดระบบอัตโนมัติ CDC Bot แล้ว', 'info');
        }}
        btcPrice={btcPrice}
        ethPrice={ethPrice}
        tickers={allTickers}
        onSelectSymbol={(selectedSymbol) => {
          handleSaveBotConfig({ ...botConfig, symbol: selectedSymbol });
          setActiveTab('chart');
          showToast(`เลือกเหรียญ ${selectedSymbol} ขึ้นชาร์ตเรียบร้อยแล้ว`, 'info');
        }}
      />

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {activeTab === 'chart' && (
          <div className="space-y-6">
            <CDCChart
              candles={candles}
              symbol={botConfig.symbol}
              timeframe={chartTimeframe}
              botTimeframe={botConfig.timeframe}
              isBotActive={botConfig.isActive}
              onSymbolChange={(newSym) => handleSaveBotConfig({ ...botConfig, symbol: newSym })}
              onTimeframeChange={(newTf) => setChartTimeframe(newTf)}
              onBotTimeframeChange={(newBotTf) => {
                handleSaveBotConfig({ ...botConfig, timeframe: newBotTf });
                showToast(`เปลี่ยนไทม์เฟรมบอทเป็น ${newBotTf.toUpperCase()} เรียบร้อยแล้ว`, 'info');
              }}
              onRefresh={loadCandles}
              isLoading={isLoadingCandles}
            />

            <BotControlPanel
              botConfig={botConfig}
              paperAccount={paperAccount}
              currentPrice={currentPrice}
              onSaveConfig={handleSaveBotConfig}
              onToggleBot={() => handleSaveBotConfig({ ...botConfig, isActive: !botConfig.isActive })}
              onManualBuy={handleManualBuy}
              onManualShort={handleManualShort}
              onManualSell={handleManualSell}
              botLogs={botLogs}
              onClearLogs={() => {
                localStorage.removeItem('cdc_bot_logs_v2');
                setBotLogs([]);
              }}
            />
          </div>
        )}

        {activeTab === 'backtest' && <BacktestingView />}

        {activeTab === 'stats' && (
          <TradingStats
            trades={tradeHistory}
            onClearStats={() => {
              localStorage.removeItem('cdc_trade_history_v2');
              setTradeHistory([]);
              showToast('ล้างสถิติและประวัติการเทรดทั้งหมดแล้ว', 'info');
            }}
          />
        )}

        {activeTab === 'scanner' && (
          <MarketScanner
            onSelectCoin={(selectedSymbol) => {
              handleSaveBotConfig({ ...botConfig, symbol: selectedSymbol });
              setActiveTab('chart');
              showToast(`เลือกเหรียญ ${selectedSymbol} ขึ้นชาร์ตและบอทเรียบร้อย`, 'info');
            }}
          />
        )}

        {activeTab === 'ai' && (
          <AiAnalystPanel
            symbol={botConfig.symbol}
            timeframe={botConfig.timeframe}
            latestCandle={currentCandle}
            recentCandles={candles}
          />
        )}

        {activeTab === 'coffee' && <CoffeeDonation />}

        {activeTab === 'history' && (
          <TradeHistoryTable
            trades={tradeHistory}
            onClearHistory={() => {
              localStorage.removeItem('cdc_trade_history_v2');
              setTradeHistory([]);
              showToast('ล้างประวัติการเทรดแล้ว', 'info');
            }}
            activePositions={paperAccount.activePositions}
            onClosePosition={handleCloseSpecificPosition}
            allTickers={allTickers}
          />
        )}
      </main>

      {/* Binance Settings Modal */}
      <BinanceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        keys={binanceKeys}
        botConfig={botConfig}
        onSaveKeys={handleSaveBinanceKeys}
        onSaveConfig={handleSaveBotConfig}
      />
    </div>
  );
}
