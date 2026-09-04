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
  TelegramConfig,
  BinanceWalletData,
  AuthUser,
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
  saveStoredSymbols,
  getStoredTelegramConfig,
  saveTelegramConfig,
  DEFAULT_PAPER_ACCOUNT,
} from './lib/botStore';
import {
  fetchBotServerState,
  saveBotServerConfig,
  toggleBotServer,
  sendManualOrderToServer,
  closePositionOnServer,
  clearBotServerLogs,
  clearBotServerTradeHistory,
  resetBotServerPaperAccount,
  saveBinanceKeysToServer,
  fetchTelegramConfig,
  saveTelegramConfigToServer,
} from './lib/botApi';
import {
  fetchBinanceKlines,
  fetchBinanceTicker24h,
  POPULAR_PAIRS,
  fetchSymbolExchangeInfo,
  formatQuantityByStepSize,
  executeLiveBinanceOrder,
  fetchLiveBinanceUsdtBalance,
  fetchFullBinanceWallet,
  formatCryptoPrice,
  getClientBannedUntil,
} from './lib/binanceApi';
import { subscribeAllMiniTickers, subscribeKline } from './lib/binanceWs';
import { calculateCDCActionZone, getCrossoverInfo } from './lib/cdcIndicator';
import { Header } from './components/Header';
import { CDCChart } from './components/CDCChart';
import { BotControlPanel } from './components/BotControlPanel';
import { BacktestingView } from './components/BacktestingView';
import { MarketScanner } from './components/MarketScanner';
import { AiAnalystPanel } from './components/AiAnalystPanel';
import { BinanceSettingsModal } from './components/BinanceSettingsModal';
import { TelegramSettingsModal } from './components/TelegramSettingsModal';
import { TradeHistoryTable } from './components/TradeHistoryTable';
import { TradingStats } from './components/TradingStats';
import { CoffeeDonation } from './components/CoffeeDonation';
import { BinanceWalletView } from './components/BinanceWalletView';
import { LoginModal } from './components/LoginModal';
import { ProfileModal } from './components/ProfileModal';
import { AuthGateView } from './components/AuthGateView';


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
    targetUsdt = totalEquity / maxPositions;
  } else if (mode === 'PERCENT_EQUITY') {
    targetUsdt = (totalEquity * (config.balancePercent || 20)) / 100;
  } else {
    targetUsdt = config.tradeAmountUsdt || 100;
  }

  return Math.min(targetUsdt, account.usdtBalance);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chart' | 'wallet' | 'backtest' | 'scanner' | 'ai' | 'history' | 'stats' | 'coffee'>('chart');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);

  // Core Central State (Synchronized with Server)
  const [botConfig, setBotConfig] = useState<BotConfig>(getStoredBotConfig);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>(() => getStoredBotConfig().timeframe || '1d');
  const [paperAccount, setPaperAccount] = useState<PaperAccount>(getStoredPaperAccount);
  const [binanceKeys, setBinanceKeys] = useState<BinanceApiKeys>(getStoredBinanceKeys);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(getStoredTelegramConfig);
  const [tradeHistory, setTradeHistory] = useState<ExecutedTrade[]>(getStoredTradeHistory);
  const [botLogs, setBotLogs] = useState<string[]>(getStoredLogs);

  // Live Binance Wallet State
  const [liveWalletData, setLiveWalletData] = useState<BinanceWalletData | null>(null);
  const [isLoadingLiveWallet, setIsLoadingLiveWallet] = useState(false);

  // Market & Kline State
  const [candles, setCandles] = useState<KlineData[]>([]);
  const [botCandles, setBotCandles] = useState<KlineData[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number | undefined>(undefined);
  const [ethPrice, setEthPrice] = useState<number | undefined>(undefined);
  const [allTickers, setAllTickers] = useState<BinanceTicker24h[]>([]);

  // Notification Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'buy' | 'sell' | 'info' } | null>(null);
  const [bannedUntil, setBannedUntil] = useState<number>(0);

  const showToast = (text: string, type: 'buy' | 'sell' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Auth State & Modals (Restore session if exists, otherwise null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('cdc_auth_session') || sessionStorage.getItem('cdc_auth_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.username) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const handleOpenLogin = useCallback(() => setIsLoginModalOpen(true), []);
  const handleOpenProfile = useCallback(() => setIsProfileModalOpen(true), []);
  const handleLogout = useCallback(() => {
    localStorage.removeItem('cdc_auth_session');
    sessionStorage.removeItem('cdc_auth_session');
    setAuthUser(null);
    setIsLoginModalOpen(false);
    showToast('ออกจากระบบเรียบร้อยแล้ว หน้าจอและบอทถูกล็อค 🔒', 'info');
  }, []);
  const handleLoginSuccess = useCallback((user: AuthUser) => {
    setAuthUser(user);
    setIsLoginModalOpen(false);
    showToast(`ยินดีต้อนรับคุณ ${user.username} เข้าสู่ระบบเรียบร้อยแล้ว`, 'info');
  }, []);

  const [currentPriceInfo, setCurrentPriceInfo] = useState<{ symbol: string; price: number }>({
    symbol: 'BTCUSDT',
    price: 0,
  });

  // 1. Fetch Market Candlestick Data (Chart View and Bot Engine)
  const loadCandles = useCallback(async () => {
    setIsLoadingCandles(true);
    try {
      // A. Load Chart Viewing Candles (on chartTimeframe)
      const chartRaw = await fetchBinanceKlines(botConfig.symbol, chartTimeframe, 1000);
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
        const botRaw = await fetchBinanceKlines(botConfig.symbol, botConfig.timeframe, 500);
        const botCdc = calculateCDCActionZone(botRaw, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod);
        setBotCandles(botCdc);
      }
    } catch (err) {
      console.error('Error loading klines:', err);
    } finally {
      setIsLoadingCandles(false);
    }
  }, [botConfig.symbol, botConfig.timeframe, chartTimeframe, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod]);

  // 2. Fetch All Crypto Ticker Prices for Header Running Ticker Tape (Stable Fixed Order)
  const loadTickers = useCallback(async () => {
    try {
      const raw = await fetchBinanceTicker24h();
      if (raw && raw.length > 0) {
        const tickerMap = new Map<string, BinanceTicker24h>();
        for (const t of raw) {
          tickerMap.set(t.symbol, t);
        }
        const stableList: BinanceTicker24h[] = [];
        for (const sym of POPULAR_PAIRS) {
          const item = tickerMap.get(sym);
          if (item) stableList.push(item);
        }
        setAllTickers(stableList);

        const btc = tickerMap.get('BTCUSDT');
        const eth = tickerMap.get('ETHUSDT');
        if (btc) setBtcPrice(btc.lastPrice);
        if (eth) setEthPrice(eth.lastPrice);
      }
    } catch (err) {
      console.warn('Ticker update failed:', err);
    }
  }, []);

  // 3. Real-Time WebSocket Streaming for All Market Tickers (Throttled to 3.5s for 60fps buttery-smooth scrolling)
  useEffect(() => {
    let lastTickerUpdate = 0;
    const unsubscribe = subscribeAllMiniTickers((tickers) => {
      if (!tickers || tickers.length === 0) return;
      const now = Date.now();
      // Throttle React state updates to every 12s so the browser GPU can run the marquee smoothly without main thread interruptions
      if (now - lastTickerUpdate < 12000 && lastTickerUpdate !== 0) return;
      lastTickerUpdate = now;

      const tickerMap = new Map<string, BinanceTicker24h>();
      for (const t of tickers) {
        tickerMap.set(t.symbol, t);
      }
      const stableList: BinanceTicker24h[] = [];
      for (const sym of POPULAR_PAIRS) {
        const item = tickerMap.get(sym);
        if (item) stableList.push(item);
      }
      setAllTickers(stableList);

      const btc = tickerMap.get('BTCUSDT');
      const eth = tickerMap.get('ETHUSDT');
      if (btc) setBtcPrice(btc.lastPrice);
      if (eth) setEthPrice(eth.lastPrice);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 4. Real-Time WebSocket Streaming for Active Candlestick (0 REST Weight)
  useEffect(() => {
    const unsubscribe = subscribeKline(botConfig.symbol, chartTimeframe, (update) => {
      setCurrentPriceInfo({ symbol: update.symbol, price: update.candle.close });
      setCandles((prev) => {
        if (!prev || prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        let nextCandles: KlineData[];
        if (last.time === update.candle.time) {
          nextCandles = [...prev.slice(0, -1), update.candle];
        } else if (update.candle.time > last.time) {
          nextCandles = [...prev, update.candle];
        } else {
          return prev;
        }
        return calculateCDCActionZone(nextCandles, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [botConfig.symbol, chartTimeframe, botConfig.fastEmaPeriod, botConfig.slowEmaPeriod]);

  // Synchronize state with Cloud Server (every 3.5s) for 24/7 cross-device consistency
  useEffect(() => {
    let isMounted = true;
    const syncServerState = async () => {
      try {
        const serverData = await fetchBotServerState();
        if (serverData && isMounted) {
          setBotConfig((prev) => ({ ...prev, ...serverData.botConfig }));
          setPaperAccount(serverData.paperAccount);
          setTradeHistory(serverData.tradeHistory);
          setBotLogs(serverData.botLogs);
          if ((serverData as any).bannedUntil) {
            setBannedUntil((serverData as any).bannedUntil);
          } else {
            const clientBan = getClientBannedUntil();
            if (clientBan > 0) setBannedUntil(clientBan);
          }
          if (serverData.telegramConfig && !isTelegramModalOpen) {
            setTelegramConfig((prev) => {
              if (
                prev.botToken === serverData.telegramConfig?.botToken &&
                prev.chatId === serverData.telegramConfig?.chatId &&
                prev.enabled === serverData.telegramConfig?.enabled &&
                prev.notifyOnBuy === serverData.telegramConfig?.notifyOnBuy &&
                prev.notifyOnSell === serverData.telegramConfig?.notifyOnSell &&
                prev.notifyOnSignal === serverData.telegramConfig?.notifyOnSignal &&
                prev.notifyOnBotStatus === serverData.telegramConfig?.notifyOnBotStatus
              ) {
                return prev;
              }
              return { ...prev, ...serverData.telegramConfig };
            });
          }
        }
      } catch {
        // Fallback to local storage if offline
      }
    };

    syncServerState();
    const syncInterval = setInterval(syncServerState, 3500);
    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, [isTelegramModalOpen]);

  // Live Wallet Refresh Handler
  const refreshLiveWallet = useCallback(async () => {
    if (!binanceKeys.apiKey || !binanceKeys.apiSecret) return;
    setIsLoadingLiveWallet(true);
    try {
      const res = await fetchFullBinanceWallet(binanceKeys);
      if (res.success && res.data) {
        setLiveWalletData(res.data);
      }
    } catch (err) {
      console.warn('Failed to refresh live wallet:', err);
    } finally {
      setIsLoadingLiveWallet(false);
    }
  }, [binanceKeys]);

  // Auto-refresh live wallet every 45 seconds if API keys present
  useEffect(() => {
    if (binanceKeys.apiKey && binanceKeys.apiSecret) {
      refreshLiveWallet();
      const walletInterval = setInterval(refreshLiveWallet, 45000);
      return () => clearInterval(walletInterval);
    }
  }, [binanceKeys, refreshLiveWallet]);

  // Initial Load & Safe Fallback Intervals (Optimized for 1h, 4h, 1d to prevent Rate Limit)
  useEffect(() => {
    loadCandles();
    loadTickers();

    // Higher timeframes (1h, 4h, 1d) update slower so we use larger poll intervals to preserve rate limit
    const candlePollMs = (chartTimeframe === '1d' || chartTimeframe === '1w')
      ? 60000
      : chartTimeframe === '4h'
        ? 60000
        : chartTimeframe === '1h'
          ? 45000
          : 30000;

    const candleInterval = setInterval(loadCandles, candlePollMs);
    const tickerInterval = setInterval(loadTickers, 60000); // 60s fallback as WebSocket updates live prices

    return () => {
      clearInterval(candleInterval);
      clearInterval(tickerInterval);
    };
  }, [loadCandles, loadTickers, chartTimeframe]);

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
          const posLev = pos.leverage || 1;
          const margin = pos.marginUsdt || pos.usdtInvested;
          const pnlPercent = pos.side === 'SHORT'
            ? ((pos.entryPrice - livePrice) / pos.entryPrice) * 100 * posLev
            : ((livePrice - pos.entryPrice) / pos.entryPrice) * 100 * posLev;
          const pnlUsdt = (margin * pnlPercent) / 100;

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

  // Save config state updates to storage and cloud server
  const handleSaveBotConfig = useCallback(async (updated: BotConfig) => {
    setBotConfig(updated);
    saveBotConfig(updated);
    if (updated.watchlist && updated.watchlist.length > 0) {
      saveStoredSymbols(updated.watchlist);
    }
    await saveBotServerConfig(updated);
  }, []);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleOpenTelegramSettings = useCallback(() => setIsTelegramModalOpen(true), []);
  const handleToggleBot = useCallback(async (forcedState?: boolean) => {
    const nextState = typeof forcedState === 'boolean' ? forcedState : !botConfig.isActive;

    // 1. Immediate optimistic UI state update
    setBotConfig((prev) => {
      const updated = { ...prev, isActive: nextState };
      saveBotConfig(updated);
      return updated;
    });

    // 2. Call atomic server endpoint /api/bot/toggle
    try {
      const res = await toggleBotServer(nextState);
      if (res.success) {
        setBotConfig((prev) => {
          const updated = { ...prev, isActive: res.isActive };
          saveBotConfig(updated);
          return updated;
        });
        showToast(res.isActive ? 'เปิดระบบอัตโนมัติ CDC Bot เรียบร้อย 🟢' : 'หยุดระบบอัตโนมัติ CDC Bot แล้ว 🔴', 'info');
      } else {
        const fallbackConfig = { ...botConfig, isActive: nextState };
        await saveBotServerConfig(fallbackConfig);
        showToast(nextState ? 'เปิดระบบอัตโนมัติ CDC Bot แล้ว 🟢' : 'หยุดระบบอัตโนมัติ CDC Bot แล้ว 🔴', 'info');
      }
    } catch {
      const fallbackConfig = { ...botConfig, isActive: nextState };
      await saveBotServerConfig(fallbackConfig);
      showToast(nextState ? 'เปิดระบบอัตโนมัติ CDC Bot แล้ว 🟢' : 'หยุดระบบอัตโนมัติ CDC Bot แล้ว 🔴', 'info');
    }
  }, [botConfig]);

  const handleSelectSymbol = useCallback((selectedSymbol: string) => {
    setBotConfig((prev) => {
      handleSaveBotConfig({ ...prev, symbol: selectedSymbol });
      return { ...prev, symbol: selectedSymbol };
    });
    setActiveTab('chart');
    showToast(`เลือกเหรียญ ${selectedSymbol} ขึ้นชาร์ตเรียบร้อยแล้ว`, 'info');
  }, [handleSaveBotConfig]);

  const handleSaveBinanceKeys = async (updatedKeys: BinanceApiKeys) => {
    setBinanceKeys(updatedKeys);
    saveBinanceKeys(updatedKeys);
    await saveBinanceKeysToServer(updatedKeys);
    showToast(`อัปเดต Binance API Key เรียบร้อย (${updatedKeys.isTestnet ? 'Testnet' : 'Live'} | ${updatedKeys.marketType || 'SPOT'})`, 'info');
  };

  const handleSaveTelegramConfig = async (updatedTelegram: TelegramConfig) => {
    setTelegramConfig(updatedTelegram);
    saveTelegramConfig(updatedTelegram);
    await saveTelegramConfigToServer(updatedTelegram);
    showToast(`บันทึกการตั้งค่า Telegram เรียบร้อย (${updatedTelegram.enabled ? 'เปิดใช้งาน 🟢' : 'ปิดใช้งาน 🔴'})`, 'info');
  };


  const handleResetPaperAccount = async () => {
    if (confirm('คุณต้องการรีเซ็ตยอดเงินบัญชีทดลอง (Paper Trading) เป็น $10,000 USDT หรือไม่?')) {
      await resetBotServerPaperAccount();
      setPaperAccount(DEFAULT_PAPER_ACCOUNT);
      savePaperAccount(DEFAULT_PAPER_ACCOUNT);
      showToast('รีเซ็ตยอดเงินพอร์ตจำลองเป็น $10,000 USDT แล้ว', 'info');
    }
  };

  const currentPrice = currentPriceInfo.price;
  const currentCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  // Manual Buy Handler (Manual LONG)
  const handleManualBuy = async (customAmountUsdt?: number) => {
    const price = currentPriceInfo.price;
    if (!price || price === 0) {
      showToast('ไม่สามารถดึงราคาปัจจุบันได้ กรุณาลองใหม่อีกครั้ง', 'sell');
      return;
    }

    if (botConfig.mode === 'PAPER') {
      const existingPos = paperAccount.activePositions.find((p) => p.symbol === botConfig.symbol);
      if (existingPos) {
        showToast(`คุณมีโพซิชันจำลอง ${botConfig.symbol} อยู่แล้ว`, 'info');
        return;
      }
    }

    const tradeUsdt = customAmountUsdt !== undefined && customAmountUsdt > 0
      ? customAmountUsdt
      : (botConfig.mode === 'PAPER' ? calculateOrderSize(botConfig, paperAccount) : (botConfig.tradeAmountUsdt || 20));

    if (tradeUsdt < 5) {
      showToast('ระบุจำนวนเงินขั้นต่ำ $5 USDT', 'info');
      return;
    }

    const res = await sendManualOrderToServer({
      symbol: botConfig.symbol,
      side: 'LONG',
      amountUsdt: tradeUsdt,
      currentPrice: price,
    });

    if (res.success) {
      showToast(`เปิดสัญญา Long ${botConfig.symbol} สำเร็จ (${botConfig.mode === 'BINANCE_LIVE' ? 'พอร์ตจริง Binance 🟢' : 'พอร์ตจำลอง 🗂️'})`, 'buy');
      refreshLiveWallet();
      const data = await fetchBotServerState();
      if (data) {
        setPaperAccount(data.paperAccount);
        setTradeHistory(data.tradeHistory);
        setBotLogs(data.botLogs);
      }
    } else {
      showToast(res.error || 'เกิดข้อผิดพลาดในการเปิดสัญญา', 'sell');
    }
  };

  // Manual Short Handler (Manual SHORT)
  const handleManualShort = async (customAmountUsdt?: number) => {
    const price = currentPriceInfo.price;
    if (!price || price === 0) {
      showToast('ไม่สามารถดึงราคาปัจจุบันได้ กรุณาลองใหม่อีกครั้ง', 'sell');
      return;
    }

    if (botConfig.mode === 'PAPER') {
      const existingPos = paperAccount.activePositions.find((p) => p.symbol === botConfig.symbol);
      if (existingPos) {
        showToast(`คุณมีโพซิชันจำลอง ${botConfig.symbol} อยู่แล้ว`, 'info');
        return;
      }
    }

    const tradeUsdt = customAmountUsdt !== undefined && customAmountUsdt > 0
      ? customAmountUsdt
      : (botConfig.mode === 'PAPER' ? calculateOrderSize(botConfig, paperAccount) : (botConfig.tradeAmountUsdt || 20));

    if (tradeUsdt < 5) {
      showToast('ระบุจำนวนเงินขั้นต่ำ $5 USDT', 'info');
      return;
    }

    const res = await sendManualOrderToServer({
      symbol: botConfig.symbol,
      side: 'SHORT',
      amountUsdt: tradeUsdt,
      currentPrice: price,
    });

    if (res.success) {
      showToast(`เปิดสัญญา Short ${botConfig.symbol} สำเร็จ (${botConfig.mode === 'BINANCE_LIVE' ? 'พอร์ตจริง Binance 🟢' : 'พอร์ตจำลอง 🗂️'})`, 'sell');
      refreshLiveWallet();
      const data = await fetchBotServerState();
      if (data) {
        setPaperAccount(data.paperAccount);
        setTradeHistory(data.tradeHistory);
        setBotLogs(data.botLogs);
      }
    } else {
      showToast(res.error || 'เกิดข้อผิดพลาดในการเปิดสัญญา', 'sell');
    }
  };

  // Manual Close Handler
  const handleManualSell = async (symbolToSell?: string) => {
    const sym = symbolToSell || botConfig.symbol;

    let price = 0;
    if (sym === currentPriceInfo.symbol && currentPriceInfo.price > 0) {
      price = currentPriceInfo.price;
    } else {
      const ticker = allTickers.find((t) => t.symbol === sym);
      if (ticker && ticker.lastPrice > 0) {
        price = ticker.lastPrice;
      } else {
        try {
          const tData = await fetchBinanceTicker24h(sym);
          if (tData.length > 0 && tData[0].lastPrice > 0) {
            price = tData[0].lastPrice;
          }
        } catch (e) {
          console.error(`Failed to fetch price for ${sym}:`, e);
        }
      }
    }

    if (!price || price === 0) {
      showToast(`ไม่สามารถดึงราคาปัจจุบันของ ${sym} ได้`, 'sell');
      return;
    }

    const res = await closePositionOnServer({
      symbol: sym,
      currentPrice: price,
      reason: 'Manual Close Button',
    });

    if (res.success) {
      showToast(`ปิดสัญญา ${sym} เรียบร้อยแล้ว`, 'info');
      refreshLiveWallet();
      const data = await fetchBotServerState();
      if (data) {
        setPaperAccount(data.paperAccount);
        setTradeHistory(data.tradeHistory);
        setBotLogs(data.botLogs);
      }
    } else {
      showToast(res.error || 'ไม่พบสัญญาที่ต้องการปิด', 'sell');
    }
  };

  const handleCloseSpecificPosition = async (sym: string) => {
    await handleManualSell(sym);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-28 md:pb-12 antialiased overflow-x-hidden">
      {/* Toast Notification Popup (Positioned above mobile bottom bar) */}
      {toastMessage && (
        <div
          className={`fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 px-4 py-2.5 sm:py-3 rounded-2xl shadow-2xl border flex items-center space-x-2 text-xs font-bold transition-all animate-bounce ${
            toastMessage.type === 'buy'
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-900/40'
              : toastMessage.type === 'sell'
              ? 'bg-rose-600 text-white border-rose-400 shadow-rose-900/40'
              : 'bg-slate-800 text-white border-slate-700 shadow-slate-900/50'
          }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar (Only visible after login) */}
      {authUser && (
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          botConfig={botConfig}
          paperAccount={paperAccount}
          liveWallet={liveWalletData}
          onRefreshLiveWallet={refreshLiveWallet}
          isLoadingLiveWallet={isLoadingLiveWallet}
          onOpenSettings={handleOpenSettings}
          onOpenTelegramSettings={handleOpenTelegramSettings}
          isTelegramEnabled={telegramConfig.enabled}
          onResetPaperAccount={handleResetPaperAccount}
          onToggleBot={handleToggleBot}
          btcPrice={btcPrice}
          ethPrice={ethPrice}
          tickers={allTickers}
          onSelectSymbol={handleSelectSymbol}
          authUser={authUser}
          onOpenLogin={handleOpenLogin}
          onOpenProfile={handleOpenProfile}
          onLogout={handleLogout}
        />
      )}

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-4 sm:space-y-6">
        {!authUser ? (
          <AuthGateView onLoginSuccess={handleLoginSuccess} />
        ) : (
          <>
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
              onToggleBot={handleToggleBot}
              onManualBuy={handleManualBuy}
              onManualShort={handleManualShort}
              onManualSell={handleManualSell}
              botLogs={botLogs}
              liveWallet={liveWalletData}
              isLoadingLiveWallet={isLoadingLiveWallet}
              onRefreshLiveWallet={refreshLiveWallet}
              binanceKeys={binanceKeys}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onSelectSymbol={handleSelectSymbol}
              onClearLogs={async () => {
                localStorage.removeItem('cdc_bot_logs_v2');
                setBotLogs([]);
                await clearBotServerLogs();
                showToast('ล้างบันทึกกิจกรรมบอท (Console Logs) เรียบร้อยแล้ว', 'info');
              }}
            />
          </div>
        )}

        {activeTab === 'wallet' && (
          <BinanceWalletView
            binanceKeys={binanceKeys}
            paperAccount={paperAccount}
            botConfig={botConfig}
            allTickers={allTickers}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSelectSymbol={(selectedSymbol) => {
              handleSaveBotConfig({ ...botConfig, symbol: selectedSymbol });
              setActiveTab('chart');
              showToast(`เลือกเหรียญ ${selectedSymbol} ขึ้นชาร์ตเรียบร้อยแล้ว`, 'info');
            }}
            onClosePaperPosition={handleCloseSpecificPosition}
            onResetPaperAccount={handleResetPaperAccount}
          />
        )}

        {activeTab === 'backtest' && <BacktestingView />}

        {activeTab === 'stats' && (
          <TradingStats
            trades={tradeHistory}
            onClearStats={async () => {
              localStorage.removeItem('cdc_trade_history_v2');
              setTradeHistory([]);
              await clearBotServerTradeHistory('ALL');
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
            watchlist={botConfig.watchlist}
            onUpdateWatchlist={(newWatchlist) => {
              const updatedConfig = { ...botConfig, watchlist: newWatchlist };
              handleSaveBotConfig(updatedConfig);
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
                onClearHistory={async () => {
                  localStorage.removeItem('cdc_trade_history_v2');
                  await clearBotServerTradeHistory('PAPER');
                  setTradeHistory([]);
                  showToast('ล้างประวัติการเทรดพอร์ตจำลองแล้ว', 'info');
                }}
                onClearLiveHistory={async () => {
                  await clearBotServerTradeHistory('BINANCE_LIVE');
                  const remaining = tradeHistory.filter((t) => t.mode !== 'BINANCE_LIVE');
                  setTradeHistory(remaining);
                  saveTradeHistory(remaining);
                  showToast('ลบประวัติคำสั่งซื้อขายจริง (Binance Live Log) เรียบร้อยแล้ว', 'info');
                }}
                activePositions={paperAccount.activePositions}
                onClosePosition={handleCloseSpecificPosition}
                allTickers={allTickers}
                binanceKeys={binanceKeys}
                botConfig={botConfig}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onSelectSymbol={(selectedSymbol) => {
                  handleSaveBotConfig({ ...botConfig, symbol: selectedSymbol });
                  setActiveTab('chart');
                  showToast(`เลือกเหรียญ ${selectedSymbol} ขึ้นชาร์ตเรียบร้อยแล้ว`, 'info');
                }}
              />
            )}
          </>
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

      {/* Telegram Notification Settings Modal */}
      <TelegramSettingsModal
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        config={telegramConfig}
        onSave={handleSaveTelegramConfig}
      />

      {/* User Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* User Profile Modal */}
      {authUser && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          authUser={authUser}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

