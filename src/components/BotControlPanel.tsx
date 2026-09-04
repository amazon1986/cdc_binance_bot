import React, { useState } from 'react';
import { BotConfig, PaperAccount, PaperPosition, ExecutedTrade, Timeframe, BinanceWalletData, BinanceApiKeys } from '../types';
import { formatCryptoPrice, formatCryptoAmount, POPULAR_PAIRS } from '../lib/binanceApi';
import {
  Play,
  Pause,
  Sliders,
  Terminal,
  Shield,
  Zap,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  RefreshCw,
  Wallet,
  ExternalLink,
  Star,
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const ALL_BINANCE_USDT_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT',
  'SUIUSDT', 'LINKUSDT', 'NEARUSDT', 'DOTUSDT', 'PEPEUSDT', 'SHIBUSDT', 'APTUSDT', 'ARBUSDT',
  'OPUSDT', 'LTCUSDT', 'UNIUSDT', 'RENDERUSDT', 'FETUSDT', 'INJUSDT', 'TIAUSDT', 'BONKUSDT',
  'FLOKIUSDT', 'TAOUSDT', 'ONDOUSDT', 'WIFUSDT', 'KASUSDT', 'JUPUSDT', 'WLDUSDT', 'AAVEUSDT',
  'CRVUSDT', 'POLUSDT', 'SEIUSDT', 'DYDXUSDT', 'IMXUSDT', 'STXUSDT', 'BEAMUSDT', 'BLURUSDT',
  'SAHARAUSDT', 'PENGUUSDT', 'BOMEUSDT', 'MEWUSDT', 'POPCATUSDT', 'FARTCOINUSDT', 'TRUMPUSDT',
  'PYTHUSDT', 'JTOUSDT', 'STRKUSDT', 'ZKUSDT', 'ENAUSDT', 'NOTUSDT', 'TONUSDT', 'ATOMUSDT',
  'FILUSDT', 'FTMUSDT', 'HBARUSDT', 'ALGOUSDT', 'VETUSDT', 'SANDUSDT', 'MANAUSDT', 'GALAUSDT',
  'AXSUSDT', 'THETAUSDT', 'EGLDUSDT', 'KAVAUSDT', 'FLOWUSDT', 'CHZUSDT', 'ENJUSDT', 'ROSEUSDT',
  '1000SATSUSDT', 'NEIROUSDT', 'PNUTUSDT', 'MOVEUSDT', 'ACTUSDT', 'MEUSDT', 'KAIAUSDT', 'VIRTUALUSDT',
  'AIUSDT', 'NFPUSDT', 'XAIUSDT', 'PORTALUSDT', 'AEVOUSDT', 'ETHFIUSDT', 'OMNIUSDT', 'IOUSDT',
  'PLUMEUSDT', 'MAJORUSDT', 'THEUSDT', 'CHILLGUYUSDT'
];

interface BotControlPanelProps {
  botConfig: BotConfig;
  paperAccount: PaperAccount;
  currentPrice: number;
  onSaveConfig: (updated: BotConfig) => void;
  onToggleBot: () => void;
  onManualBuy: (customAmountUsdt?: number) => void;
  onManualShort?: (customAmountUsdt?: number) => void;
  onManualSell: () => void;
  botLogs: string[];
  onClearLogs: () => void;
  liveWallet?: BinanceWalletData | null;
  isLoadingLiveWallet?: boolean;
  onRefreshLiveWallet?: () => void;
  binanceKeys?: BinanceApiKeys;
  onOpenSettings?: () => void;
  onSelectSymbol?: (symbol: string) => void;
}

export const BotControlPanel: React.FC<BotControlPanelProps> = ({
  botConfig,
  paperAccount,
  currentPrice,
  onSaveConfig,
  onToggleBot,
  onManualBuy,
  onManualShort,
  onManualSell,
  botLogs,
  onClearLogs,
  liveWallet,
  isLoadingLiveWallet,
  onRefreshLiveWallet,
  binanceKeys,
  onOpenSettings,
  onSelectSymbol,
}) => {
  const [configForm, setConfigForm] = useState<BotConfig>({ ...botConfig });
  const [isEditing, setIsEditing] = useState(false);
  const [manualPercent, setManualPercent] = useState<number>(botConfig.balancePercent || 25);
  const [inputMode, setInputMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [fixedUsdt, setFixedUsdt] = useState<number | string>(botConfig.tradeAmountUsdt || 20);
  const [selectedAddSymbol, setSelectedAddSymbol] = useState<string>('');
  const [watchlistSearchInput, setWatchlistSearchInput] = useState<string>('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);
  const [watchlistToast, setWatchlistToast] = useState<{ msg: string; type: 'success' | 'warning' } | null>(null);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setConfigForm({ ...botConfig });
    }
  }, [botConfig, isEditing]);

  const isLiveMode = botConfig.mode === 'BINANCE_LIVE';

  // Live Position from Binance if in LIVE mode, else Paper Position
  const livePos = isLiveMode ? liveWallet?.futuresPositions?.find((p) => p.symbol === botConfig.symbol) : null;
  const paperPos = paperAccount.activePositions.find((p) => p.symbol === botConfig.symbol);

  // Unified Active Position display
  const activeDisplayPos = isLiveMode && livePos
    ? {
        symbol: livePos.symbol,
        side: (livePos.positionSide || (livePos.positionAmt > 0 ? 'LONG' : 'SHORT')) as 'LONG' | 'SHORT',
        entryPrice: livePos.entryPrice,
        markPrice: livePos.markPrice,
        amount: Math.abs(livePos.positionAmt),
        usdtInvested: livePos.initialMargin,
        marginUsdt: livePos.initialMargin,
        leverage: livePos.leverage,
        currentPnlUsdt: livePos.unrealizedProfit,
        currentPnlPercent: livePos.pnlPercent || 0,
        liquidationPrice: livePos.liquidationPrice,
        isLive: true,
      }
    : paperPos
    ? {
        ...paperPos,
        markPrice: currentPrice,
        isLive: false,
      }
    : null;

  // Real available USDT in wallet (Combined Spot + Futures)
  const liveSpotUsdt = liveWallet?.spotUsdtFree ?? (liveWallet?.spotBalances?.find((b) => b.asset === 'USDT')?.free ?? 0);
  const liveFuturesUsdt = liveWallet?.futuresUsdtAvailable ?? (liveWallet?.futuresAssets?.find((a) => a.asset === 'USDT')?.availableBalance ?? 0);
  const liveCombinedUsdt = liveWallet?.combinedAvailableUsdt ?? (liveSpotUsdt + liveFuturesUsdt);
  const liveTotalNetWorth = liveWallet?.totalNetWorthUsd ?? ((liveWallet?.totalSpotUsd || 0) + (liveWallet?.totalFuturesEquityUsd || 0));

  // Determine real usable capital so balance is never zeroed out if funds exist in Spot or Futures
  const liveUsableCapital = liveCombinedUsdt > 0
    ? liveCombinedUsdt
    : (liveSpotUsdt > 0 ? liveSpotUsdt : (liveFuturesUsdt > 0 ? liveFuturesUsdt : (liveTotalNetWorth > 0 ? liveTotalNetWorth : 0)));

  const effectiveBalance = isLiveMode ? liveUsableCapital : paperAccount.usdtBalance;

  // Computed Manual Trade USDT amount based on selected percentage or fixed amount
  const numericFixedUsdt = Math.max(5, Number(fixedUsdt) || 5);
  const computedManualUsdt = inputMode === 'FIXED'
    ? numericFixedUsdt
    : effectiveBalance > 0
      ? Math.max(5, (effectiveBalance * manualPercent) / 100)
      : numericFixedUsdt;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedConfig: BotConfig = {
      ...configForm,
      fastEmaPeriod: Number(configForm.fastEmaPeriod) || 12,
      slowEmaPeriod: Number(configForm.slowEmaPeriod) || 26,
      balancePercent: Number(configForm.balancePercent) || 20,
      tradeAmountUsdt: Number(configForm.tradeAmountUsdt) || 100,
      stopLossPercent: Number(configForm.stopLossPercent) || 0,
      takeProfitPercent: Number(configForm.takeProfitPercent) || 0,
      maxOpenPositions: Number(configForm.maxOpenPositions) || 5,
      trailingStopPercent: Number(configForm.trailingStopPercent) || 7,
      leverage: Math.min(Math.max(1, Number(configForm.leverage) || 1), 10),
      longLeverage: Math.min(Math.max(1, Number(configForm.longLeverage) || 2), 10),
      shortLeverage: Math.min(Math.max(1, Number(configForm.shortLeverage) || 3), 10),
      isSeparateLeverage: configForm.isSeparateLeverage ?? false,
    };
    onSaveConfig(sanitizedConfig);
    setConfigForm(sanitizedConfig);
    setIsEditing(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Column 1 & 2: Bot Strategy Configuration & Active Position */}
      <div className="lg:col-span-2 space-y-6">
        {/* Active Position / Quick Execution Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">สถานะการถือครองสัญญา ({botConfig.symbol})</h3>
            </div>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                botConfig.isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {botConfig.isActive
                ? `🟢 Bot Auto (${(botConfig.scanMode ?? 'WATCHLIST') === 'WATCHLIST' ? 'สแกน Watchlist' : botConfig.scanMode === 'MULTI_SCAN' ? 'สแกนทั้งตลาด' : botConfig.symbol})`
                : '🔴 Bot ปิดการทำงาน'}
            </span>
          </div>

          {/* Trading Scope Mode Selector (ตรงตามภาพตัวอย่าง) */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>โหมดการสแกนของบอท (Trading Scope Mode)</span>
              </label>

              {/* Quota Badge (ตรงตามภาพตัวอย่าง: 🎯 โควต้าไม้: 0 / 5 ไม้ (ว่าง 5 ไม้)) */}
              {(() => {
                const maxPositions = botConfig.maxOpenPositions || 5;
                const currentPositionsCount = isLiveMode
                  ? (liveWallet?.futuresPositions?.filter((p) => Math.abs(p.positionAmt) > 0)?.length || 0)
                  : (paperAccount.activePositions?.length || 0);
                const freeSlots = Math.max(0, maxPositions - currentPositionsCount);

                return (
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs">
                    <span>🎯</span>
                    <span className="font-semibold text-slate-300">
                      โควต้าไม้: <span className="font-mono text-white font-bold">{currentPositionsCount}</span> / <span className="font-mono text-white font-bold">{maxPositions}</span> ไม้
                    </span>
                    <span className="text-slate-400 font-normal">
                      (ว่าง <span className="font-mono text-emerald-400 font-bold">{freeSlots}</span> ไม้)
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* 3 Scope Cards in Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* 1. เล่นเฉพาะเหรียญปัจจุบัน */}
              <button
                type="button"
                onClick={() => {
                  const updated: BotConfig = { ...botConfig, scanMode: 'SINGLE' };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between space-y-2 cursor-pointer ${
                  botConfig.scanMode === 'SINGLE'
                    ? 'bg-slate-900 border-emerald-500/60 text-white font-bold ring-1 ring-emerald-500/30 shadow-lg'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-100 flex items-center space-x-1.5">
                    <span>🎯</span>
                    <span>เล่นเฉพาะเหรียญปัจจุบัน</span>
                  </span>
                  {botConfig.scanMode === 'SINGLE' && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
                  เฝ้าระวังและส่งคำสั่งซื้อเฉพาะเหรียญ {botConfig.symbol} ที่เลือกอยู่นี้เท่านั้น
                </p>
              </button>

              {/* 2. เล่นเฉพาะใน Watchlist (สี Amber ตามแบบตัวอย่าง) */}
              <button
                type="button"
                onClick={() => {
                  const updated: BotConfig = { ...botConfig, scanMode: 'WATCHLIST' };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between space-y-2 cursor-pointer ${
                  (botConfig.scanMode ?? 'WATCHLIST') === 'WATCHLIST'
                    ? 'bg-[#181308] border-amber-500/70 text-white font-bold ring-1 ring-amber-500/40 shadow-lg'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-amber-300 flex items-center space-x-1.5">
                    <span>⭐</span>
                    <span>เล่นเฉพาะใน Watchlist</span>
                  </span>
                  {(botConfig.scanMode ?? 'WATCHLIST') === 'WATCHLIST' && (
                    <span className="text-[10px] bg-amber-500/25 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-full font-bold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
                  สแกนและคัดเลือกเฉพาะเหรียญใน Watchlist ที่ตั้งไว้ ตามโควต้าไม้
                </p>
              </button>

              {/* 3. สแกนทั้งตลาด (Top Picks) */}
              <button
                type="button"
                onClick={() => {
                  const updated: BotConfig = { ...botConfig, scanMode: 'MULTI_SCAN' };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between space-y-2 cursor-pointer ${
                  botConfig.scanMode === 'MULTI_SCAN'
                    ? 'bg-blue-500/10 border-blue-500/60 text-white font-bold ring-1 ring-blue-500/30 shadow-lg'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-100 flex items-center space-x-1.5">
                    <span>🌐</span>
                    <span>สแกนทั้งตลาด (Top Picks)</span>
                  </span>
                  {botConfig.scanMode === 'MULTI_SCAN' && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded-full font-bold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-normal leading-relaxed">
                  สแกนทุกเหรียญใน Binance และคัดเลือกเหรียญคะแนนสูงสุดเข้าซื้อตามจำนวนไม้
                </p>
              </button>
            </div>

            {/* Watchlist Manager Sub-Panel (เมื่ออยู่ในโหมด Watchlist) */}
            {(botConfig.scanMode ?? 'WATCHLIST') === 'WATCHLIST' && (() => {
              const currentWatchlist = Array.isArray(botConfig.watchlist) && botConfig.watchlist.length > 0
                ? botConfig.watchlist
                : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT', 'XRPUSDT', 'SUIUSDT'];

              const handleApplyPreset = (list: string[]) => {
                const updated: BotConfig = { ...botConfig, scanMode: 'WATCHLIST', watchlist: list };
                onSaveConfig(updated);
                setConfigForm(updated);
              };

              const handleRemoveSymbol = (sym: string) => {
                const nextList = currentWatchlist.filter((s) => s !== sym);
                const updated: BotConfig = { ...botConfig, scanMode: 'WATCHLIST', watchlist: nextList };
                onSaveConfig(updated);
                setConfigForm(updated);
              };

              const handleAddSymbol = (sym: string) => {
                if (!currentWatchlist.includes(sym)) {
                  const nextList = [...currentWatchlist, sym];
                  const updated: BotConfig = { ...botConfig, scanMode: 'WATCHLIST', watchlist: nextList };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }
              };

              const triggerToast = (msg: string, type: 'success' | 'warning' = 'success') => {
                setWatchlistToast({ msg, type });
                setTimeout(() => setWatchlistToast(null), 3500);
              };

              const handleAddCustomSymbol = (rawSymbol: string) => {
                const clean = rawSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!clean) return;
                const formatted = clean.endsWith('USDT') ? clean : `${clean}USDT`;

                if (currentWatchlist.includes(formatted)) {
                  triggerToast(`เหรียญ ${formatted} มีอยู่ใน Watchlist แล้ว`, 'warning');
                  setWatchlistSearchInput('');
                  setIsSearchDropdownOpen(false);
                  return;
                }

                const nextList = [...currentWatchlist, formatted];
                const updated: BotConfig = { ...botConfig, scanMode: 'WATCHLIST', watchlist: nextList };
                onSaveConfig(updated);
                setConfigForm(updated);
                triggerToast(`เพิ่ม ${formatted.replace('USDT', '')} เข้า Watchlist สำเร็จ ⭐`, 'success');
                setWatchlistSearchInput('');
                setIsSearchDropdownOpen(false);
              };

              const cleanQuery = watchlistSearchInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
              const suggestions = cleanQuery
                ? ALL_BINANCE_USDT_PAIRS.filter((sym) => {
                    const base = sym.replace('USDT', '');
                    return (
                      (sym.includes(cleanQuery) || base.includes(cleanQuery)) &&
                      !currentWatchlist.includes(sym)
                    );
                  }).slice(0, 8)
                : [];

              const formattedQuery = cleanQuery.endsWith('USDT') ? cleanQuery : `${cleanQuery}USDT`;
              const isQueryAlreadyInList = cleanQuery ? currentWatchlist.includes(formattedQuery) : false;

              return (
                <div className="pt-3 border-t border-slate-800/80 bg-slate-900/60 rounded-xl p-3.5 space-y-3 animate-fadeIn">
                  {/* Toast Alert Feedback */}
                  {watchlistToast && (
                    <div
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center justify-between transition animate-fadeIn ${
                        watchlistToast.type === 'success'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <span>{watchlistToast.msg}</span>
                      <button onClick={() => setWatchlistToast(null)} className="text-slate-400 hover:text-white ml-2">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-amber-400 font-bold text-xs flex items-center space-x-1">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>เหรียญใน Watchlist ปัจจุบัน:</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded-full">
                        {currentWatchlist.length} เหรียญ
                      </span>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex items-center space-x-1.5 text-[11px]">
                      <span className="text-slate-500">พรีเซ็ตด่วน:</span>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyPreset(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']);
                          triggerToast('เปลี่ยนเป็นพรีเซ็ต Top 5 สำเร็จ', 'success');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                      >
                        Top 5
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyPreset(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'SUIUSDT', 'LINKUSDT']);
                          triggerToast('เปลี่ยนเป็นพรีเซ็ต Top 10 สำเร็จ', 'success');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                      >
                        Top 10
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyPreset(['DOGEUSDT', 'PEPEUSDT', 'SHIBUSDT', 'BONKUSDT', 'FLOKIUSDT']);
                          triggerToast('เปลี่ยนเป็นพรีเซ็ต Meme Coins สำเร็จ', 'success');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                      >
                        Meme
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyPreset(['SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'AVAXUSDT', 'NEARUSDT', 'SUIUSDT', 'APTUSDT']);
                          triggerToast('เปลี่ยนเป็นพรีเซ็ต Layer 1 สำเร็จ', 'success');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                      >
                        Layer 1
                      </button>
                    </div>
                  </div>

                  {/* Coin Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {currentWatchlist.map((sym) => (
                      <span
                        key={sym}
                        className="inline-flex items-center space-x-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold group"
                      >
                        <span
                          className="cursor-pointer hover:underline hover:text-white transition"
                          onClick={() => onSelectSymbol && onSelectSymbol(sym)}
                          title="คลิกเพื่อดูกราฟเหรียญนี้"
                        >
                          {sym.replace('USDT', '')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleRemoveSymbol(sym);
                            triggerToast(`ลบ ${sym.replace('USDT', '')} ออกจาก Watchlist เรียบร้อย`, 'warning');
                          }}
                          className="text-amber-400/60 hover:text-rose-400 p-0.5 transition cursor-pointer"
                          title={`ลบ ${sym} ออกจาก Watchlist`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* 🔍 Search Box & Quick Add Symbol */}
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <div className="flex items-center space-x-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-amber-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={watchlistSearchInput}
                            onChange={(e) => {
                              setWatchlistSearchInput(e.target.value.toUpperCase());
                              setIsSearchDropdownOpen(true);
                            }}
                            onFocus={() => setIsSearchDropdownOpen(true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && watchlistSearchInput.trim()) {
                                handleAddCustomSymbol(watchlistSearchInput);
                              }
                            }}
                            placeholder="พิมพ์ค้นหาหรือใส่ชื่อเหรียญ เช่น NEAR, PEPE, TAO, ONDO, WIF..."
                            className="w-full pl-9 pr-8 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 font-mono transition"
                          />
                          {watchlistSearchInput && (
                            <button
                              type="button"
                              onClick={() => {
                                setWatchlistSearchInput('');
                                setIsSearchDropdownOpen(false);
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddCustomSymbol(watchlistSearchInput)}
                          disabled={!watchlistSearchInput.trim()}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ เพิ่มเหรียญ</span>
                        </button>
                      </div>

                      {/* Autocomplete Search Dropdown */}
                      {isSearchDropdownOpen && cleanQuery.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-30 overflow-hidden divide-y divide-slate-800/80 max-h-56 overflow-y-auto">
                          {suggestions.map((sym) => (
                            <button
                              key={sym}
                              type="button"
                              onClick={() => handleAddCustomSymbol(sym)}
                              className="w-full px-3.5 py-2 text-left hover:bg-slate-800 flex items-center justify-between text-xs transition group cursor-pointer"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-white group-hover:text-amber-300">
                                  {sym.replace('USDT', '')}
                                </span>
                                <span className="text-[10px] text-slate-400">/USDT</span>
                              </div>
                              <span className="text-[11px] text-amber-400/80 group-hover:text-amber-300 flex items-center space-x-1">
                                <span>+ เพิ่มเข้า Watchlist</span>
                              </span>
                            </button>
                          ))}

                          {/* Direct Custom Add Button */}
                          {!isQueryAlreadyInList && (
                            <button
                              type="button"
                              onClick={() => handleAddCustomSymbol(formattedQuery)}
                              className="w-full px-3.5 py-2.5 text-left bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 flex items-center justify-between text-xs font-medium transition cursor-pointer"
                            >
                              <span>+ เพิ่มเหรียญ <b className="font-mono font-bold text-white">{formattedQuery}</b> เข้า Watchlist ทันที</span>
                              <span className="text-[10px] bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded text-amber-200">
                                กด Enter ↵
                              </span>
                            </button>
                          )}

                          {isQueryAlreadyInList && suggestions.length === 0 && (
                            <div className="px-3.5 py-2.5 text-xs text-slate-400 italic">
                              เหรียญ {formattedQuery} มีอยู่ใน Watchlist แล้ว
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quick Select from popular pairs as fallback */}
                    <div className="flex items-center space-x-2 pt-0.5">
                      <span className="text-[11px] text-slate-500">หรือเลือกจากลิสต์:</span>
                      <select
                        value={selectedAddSymbol}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddCustomSymbol(e.target.value);
                            setSelectedAddSymbol('');
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="">-- เลือกเหรียญยอดนิยมอื่นๆ --</option>
                        {ALL_BINANCE_USDT_PAIRS.filter((p) => !currentWatchlist.includes(p)).map((p) => (
                          <option key={p} value={p}>
                            {p.replace('USDT', '')} (USDT)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Trading Direction Mode Selector */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
            <label className="text-xs font-bold text-slate-200 block">
              ทิศทางการเทรด (Trading Direction)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const updated = { ...botConfig, directionMode: 'LONG_ONLY' as const };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-between space-y-1 ${
                  (botConfig.directionMode ?? 'LONG_ONLY') === 'LONG_ONLY'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400">📈 LONG Only</span>
                  {(botConfig.directionMode ?? 'LONG_ONLY') === 'LONG_ONLY' && (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-extrabold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">
                  เล่นเฉพาะฝั่งขาขึ้น
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const updated = { ...botConfig, directionMode: 'SHORT_ONLY' as const };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-between space-y-1 ${
                  botConfig.directionMode === 'SHORT_ONLY'
                    ? 'bg-rose-500/10 border-rose-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-rose-400">📉 SHORT Only</span>
                  {botConfig.directionMode === 'SHORT_ONLY' && (
                    <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full font-extrabold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">
                  เล่นเฉพาะฝั่งขาลง
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const updated = { ...botConfig, directionMode: 'BOTH' as const };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-between space-y-1 ${
                  botConfig.directionMode === 'BOTH'
                    ? 'bg-purple-500/10 border-purple-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-purple-400">🔄 BOTH (Long & Short)</span>
                  {botConfig.directionMode === 'BOTH' && (
                    <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-extrabold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">
                  เล่นทั้งสองฝั่งตามสัญญาณ
                </span>
              </button>
            </div>
          </div>

          {/* Active Position Card */}
          {activeDisplayPos ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 block">สถานะโพสิชันปัจจุบัน</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold border ${
                      activeDisplayPos.isLive
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    }`}>
                      {activeDisplayPos.isLive ? '⚡ สัญญาจริง Binance' : '🗂️ พอร์ตจำลอง'} ({activeDisplayPos.leverage || 1}x)
                    </span>
                  </div>
                  <span className={`text-lg font-black font-mono ${activeDisplayPos.side === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {activeDisplayPos.side} {activeDisplayPos.symbol}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">กำไร/ขาดทุน (Unrealized PnL)</span>
                  <div
                    className={`text-lg font-black font-mono flex items-center justify-end ${
                      activeDisplayPos.currentPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {activeDisplayPos.currentPnlUsdt >= 0 ? (
                      <ArrowUpRight className="w-5 h-5 mr-1" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5 mr-1" />
                    )}
                    {activeDisplayPos.currentPnlUsdt >= 0 ? '+' : ''}${activeDisplayPos.currentPnlUsdt.toFixed(2)} ({activeDisplayPos.currentPnlPercent >= 0 ? '+' : ''}{activeDisplayPos.currentPnlPercent.toFixed(2)}%)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">ราคาเข้า (Entry)</span>
                  <span className="text-slate-200 font-bold">{formatCryptoPrice(activeDisplayPos.entryPrice)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ทุนประกัน (Margin)</span>
                  <span className="text-emerald-400 font-bold">${(activeDisplayPos.marginUsdt || activeDisplayPos.usdtInvested).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">มูลค่าสัญญา ({activeDisplayPos.leverage || 1}x)</span>
                  <span className="text-slate-200 font-bold">
                    ${(activeDisplayPos.amount * (activeDisplayPos.markPrice || currentPrice)).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ราคาล้างพอร์ต (Liq)</span>
                  <span className="text-rose-400 font-bold">
                    {activeDisplayPos.liquidationPrice ? formatCryptoPrice(activeDisplayPos.liquidationPrice) : '-'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 text-center space-y-1">
              <p className="text-xs text-slate-400">ยังไม่มีโพสิชันถือครองในเหรียญ {botConfig.symbol}</p>
              <p className="text-[11px] text-slate-500">
                บอทจะส่งคำสั่งเข้าซื้อเมื่อเกิดสัญญาณ <span className="text-blue-400">ฟ้า/เขียว (Long)</span> หรือ <span className="text-amber-400">เหลือง/แดง (Short)</span>
              </p>
            </div>
          )}

          {/* Quick Manual Order Execution Controls with Portfolio % Slider */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">ส่งคำสั่งซื้อขายเอง (Manual Trade Execution)</span>
                {isLiveMode && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    ⚡ Binance Live
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {isLiveMode && onRefreshLiveWallet && (
                  <button
                    type="button"
                    onClick={onRefreshLiveWallet}
                    disabled={isLoadingLiveWallet}
                    className="p-1 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-900 transition"
                    title="ซิงก์ยอดเงินกระเป๋าจริง"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLiveWallet ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                )}
                <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setInputMode('PERCENT')}
                    className={`px-2 py-0.5 rounded font-semibold transition ${
                      inputMode === 'PERCENT' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    % พอร์ต
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('FIXED')}
                    className={`px-2 py-0.5 rounded font-semibold transition ${
                      inputMode === 'FIXED' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    จำนวน USDT ($)
                  </button>
                </div>
              </div>
            </div>

            {/* Wallet Balance Indicator */}
            <div className="bg-slate-900/80 px-3 py-2.5 rounded-lg border border-slate-800/80 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5 font-sans font-medium">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isLiveMode ? 'ยอดเงินพร้อมเทรดในกระเป๋าจริง (Spot + Futures):' : 'ยอดเงินพอร์ตจำลอง (Paper):'}</span>
                </span>
                <div className="flex items-center space-x-1.5">
                  {isLiveMode && liveWallet?.isCached && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-sans font-semibold">
                      Auto-Cached 🛡️
                    </span>
                  )}
                  <span className="font-extrabold text-emerald-400 text-sm">
                    ${effectiveBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                </div>
              </div>

              {isLiveMode && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                  <span>
                    Spot: <strong className="text-slate-200">${liveSpotUsdt.toFixed(2)}</strong>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    Futures: <strong className="text-slate-200">${liveFuturesUsdt.toFixed(2)}</strong>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    มูลค่าสุทธิรวม: <strong className="text-emerald-400">${liveTotalNetWorth.toFixed(2)}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Slider / Fixed Input */}
            {inputMode === 'PERCENT' ? (
              <div className="space-y-2 bg-slate-900/80 p-3 rounded-lg border border-slate-800/60">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">สัดส่วนเงินทุน (% ของพอร์ต):</span>
                  <div className="text-right">
                    <span className="text-emerald-400 font-extrabold text-sm mr-1">{manualPercent}%</span>
                    <span className="text-slate-300 font-bold">(≈ ${computedManualUsdt.toFixed(2)} USDT)</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={manualPercent}
                  onChange={(e) => setManualPercent(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />

                <div className="flex items-center justify-between gap-1.5 pt-1">
                  {[10, 25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setManualPercent(pct)}
                      className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition border ${
                        manualPercent === pct
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2 bg-slate-900/80 p-3 rounded-lg border border-slate-800/60">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">ระบุจำนวนเงินทุน (USDT):</span>
                  <span className="text-emerald-400 font-extrabold text-sm">${computedManualUsdt.toFixed(2)} USDT</span>
                </div>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={fixedUsdt}
                  onChange={(e) => setFixedUsdt(e.target.value === '' ? '' : e.target.value)}
                  onBlur={() => setFixedUsdt((prev) => Math.max(5, Number(prev) || 20))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono text-sm font-bold focus:border-emerald-500"
                  placeholder="เช่น 20 USDT"
                />
                <div className="flex items-center justify-between gap-1.5 pt-1">
                  {[10, 20, 50, 100, 200].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFixedUsdt(amt)}
                      className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition border ${
                        fixedUsdt === amt
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CDC Exit Strategy Protection Notice */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5 flex items-start space-x-2 text-[11px] text-blue-200">
              <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="leading-normal">
                <span className="font-bold text-blue-300 block">การเฝ้าระวังปิดสัญญาตามกลยุทธ์ CDC Action Zone:</span>
                คำสั่ง Manual จะถูกเฝ้าระวังและปิดสัญญาอัตโนมัติเมื่อเกิดสัญญาณ CDC Exit Zone หรือเมื่อถึง Stop Loss ({botConfig.stopLossPercent}%) / Take Profit ({botConfig.takeProfitPercent}%)
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-400">ราคาตลาด {botConfig.symbol}:</span>
                <span className="font-mono font-extrabold text-white text-sm">${currentPrice.toLocaleString()}</span>
              </div>

              {/* Responsive Action Buttons Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onManualBuy(computedManualUsdt)}
                  className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition cursor-pointer"
                  title={`เปิดสัญญา Long ด้วยเงิน $${computedManualUsdt.toFixed(2)} USDT`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Manual LONG (${computedManualUsdt.toFixed(0)})</span>
                </button>

                {onManualShort && (
                  <button
                    type="button"
                    onClick={() => onManualShort(computedManualUsdt)}
                    className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-purple-600 hover:bg-purple-500 active:scale-98 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition cursor-pointer"
                    title={`เปิดสัญญา Short ด้วยเงิน $${computedManualUsdt.toFixed(2)} USDT`}
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    <span>Manual SHORT (${computedManualUsdt.toFixed(0)})</span>
                  </button>
                )}
              </div>

              {activeDisplayPos && (
                <button
                  type="button"
                  onClick={onManualSell}
                  className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 active:scale-98 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-900/40 transition cursor-pointer"
                  title="ปิดโพสิชันปัจจุบันทันที"
                >
                  <X className="w-4 h-4" />
                  <span>ปิดสัญญาปัจจุบัน (Close Position - {activeDisplayPos.symbol})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bot Strategy Configuration Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Sliders className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">ตั้งค่ากลยุทธ์ CDC Action Zone V2</h3>
            </div>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                แก้ไขพารามิเตอร์
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 bg-slate-800 text-slate-400 hover:text-white text-xs rounded-lg transition"
              >
                ยกเลิก
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              {/* Bot Trading Timeframe */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">ไทม์เฟรมกลยุทธ์บอท</label>
                <select
                  disabled={!isEditing}
                  value={configForm.timeframe || '1d'}
                  onChange={(e) => setConfigForm({ ...configForm, timeframe: e.target.value as Timeframe })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-bold font-mono focus:border-emerald-500 disabled:opacity-60"
                >
                  <option value="15m">15m</option>
                  <option value="1h">1H</option>
                  <option value="4h">4H</option>
                  <option value="1d">1D (แนะนำ ⭐)</option>
                  <option value="1w">1W</option>
                </select>
              </div>

              {/* Fast EMA Period */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">Fast EMA (เส้นเร็ว)</label>
                <input
                  type="number"
                  disabled={!isEditing}
                  value={configForm.fastEmaPeriod ?? ''}
                  onChange={(e) => setConfigForm({ ...configForm, fastEmaPeriod: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                />
              </div>

              {/* Slow EMA Period */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">Slow EMA (เส้นช้า)</label>
                <input
                  type="number"
                  disabled={!isEditing}
                  value={configForm.slowEmaPeriod ?? ''}
                  onChange={(e) => setConfigForm({ ...configForm, slowEmaPeriod: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                />
              </div>

              {/* Stop Loss % */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">Stop Loss Cut-Loss (%)</label>
                <input
                  type="number"
                  step="0.5"
                  disabled={!isEditing}
                  value={configForm.stopLossPercent ?? ''}
                  onChange={(e) => setConfigForm({ ...configForm, stopLossPercent: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                />
              </div>

              {/* Take Profit % */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">Target Take Profit (%)</label>
                <input
                  type="number"
                  step="0.5"
                  disabled={!isEditing}
                  value={configForm.takeProfitPercent ?? ''}
                  onChange={(e) => setConfigForm({ ...configForm, takeProfitPercent: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Leverage Control (1x - 10x) with Separate Long/Short option */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>อัตราคูณ เลเวอเรจ (Leverage Multiplier: 1x - 10x)</span>
                </span>

                {/* Mode Toggle: Unified vs Separate Long/Short */}
                <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                  <button
                    type="button"
                    disabled={!isEditing}
                    onClick={() => setConfigForm({ ...configForm, isSeparateLeverage: false })}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition ${
                      !configForm.isSeparateLeverage
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white disabled:opacity-50'
                    }`}
                  >
                    เท่ากันทุกฝั่ง
                  </button>
                  <button
                    type="button"
                    disabled={!isEditing}
                    onClick={() => setConfigForm({ ...configForm, isSeparateLeverage: true })}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition flex items-center space-x-1 ${
                      configForm.isSeparateLeverage
                        ? 'bg-gradient-to-r from-emerald-500 to-rose-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white disabled:opacity-50'
                    }`}
                  >
                    <span>⚡ แยก Long / Short</span>
                  </button>
                </div>
              </div>

              {!configForm.isSeparateLeverage ? (
                /* Unified Leverage Control */
                <div className="space-y-2 bg-slate-900/80 p-3 rounded-lg border border-slate-800/60">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Leverage ทั้งสองฝั่ง:</span>
                    <span className="text-amber-400 font-extrabold text-sm">{configForm.leverage || 1}x</span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    disabled={!isEditing}
                    value={configForm.leverage || 1}
                    onChange={(e) => setConfigForm({ ...configForm, leverage: Number(e.target.value) })}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
                  />

                  <div className="flex items-center justify-between gap-1.5 pt-1">
                    {[1, 2, 3, 5, 10].map((lev) => (
                      <button
                        key={lev}
                        type="button"
                        disabled={!isEditing}
                        onClick={() => setConfigForm({ ...configForm, leverage: lev })}
                        className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition border ${
                          (configForm.leverage || 1) === lev
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800 disabled:opacity-50'
                        }`}
                      >
                        {lev}x
                      </button>
                    ))}
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 pt-1 flex items-center justify-between">
                    <span>พลังซื้อสัญญา:</span>
                    <span className="text-amber-300 font-semibold">ทุน $100 ➔ ${(100 * (configForm.leverage || 1)).toLocaleString()} USDT ({configForm.leverage || 1}x)</span>
                  </div>
                </div>
              ) : (
                /* Separate Long and Short Leverage Controls */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Long Leverage (Buy) */}
                  <div className="space-y-2 bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/30">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-emerald-400 font-bold flex items-center space-x-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>🟢 ขาซื้อ (Long / Buy):</span>
                      </span>
                      <span className="text-emerald-400 font-extrabold text-sm">{configForm.longLeverage || 2}x</span>
                    </div>

                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      disabled={!isEditing}
                      value={configForm.longLeverage || 2}
                      onChange={(e) => setConfigForm({ ...configForm, longLeverage: Number(e.target.value) })}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
                    />

                    <div className="flex items-center justify-between gap-1 pt-1">
                      {[1, 2, 3, 5, 10].map((lev) => (
                        <button
                          key={lev}
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setConfigForm({ ...configForm, longLeverage: lev })}
                          className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition border ${
                            (configForm.longLeverage || 2) === lev
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800 disabled:opacity-50'
                          }`}
                        >
                          {lev}x
                        </button>
                      ))}
                    </div>

                    <div className="text-[10px] font-mono text-emerald-300/80 pt-0.5">
                      ทุน $100 ➔ ซื้อได้ ${(100 * (configForm.longLeverage || 2)).toLocaleString()} USDT
                    </div>
                  </div>

                  {/* Short Leverage (Sell) */}
                  <div className="space-y-2 bg-rose-950/20 p-3 rounded-lg border border-rose-500/30">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-rose-400 font-bold flex items-center space-x-1">
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        <span>🔴 ขาชอร์ต (Short / Sell):</span>
                      </span>
                      <span className="text-rose-400 font-extrabold text-sm">{configForm.shortLeverage || 3}x</span>
                    </div>

                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      disabled={!isEditing}
                      value={configForm.shortLeverage || 3}
                      onChange={(e) => setConfigForm({ ...configForm, shortLeverage: Number(e.target.value) })}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500 disabled:opacity-50"
                    />

                    <div className="flex items-center justify-between gap-1 pt-1">
                      {[1, 2, 3, 4, 5, 10].map((lev) => (
                        <button
                          key={lev}
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setConfigForm({ ...configForm, shortLeverage: lev })}
                          className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition border ${
                            (configForm.shortLeverage || 3) === lev
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-sm'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800 disabled:opacity-50'
                          }`}
                        >
                          {lev}x
                        </button>
                      ))}
                    </div>

                    <div className="text-[10px] font-mono text-rose-300/80 pt-0.5">
                      ทุน $100 ➔ ชอร์ตได้ ${(100 * (configForm.shortLeverage || 3)).toLocaleString()} USDT
                    </div>
                  </div>
                </div>
              )}

              {/* High Leverage Alert */}
              {((!configForm.isSeparateLeverage && (configForm.leverage || 1) > 5) ||
                (configForm.isSeparateLeverage && ((configForm.longLeverage || 2) > 5 || (configForm.shortLeverage || 3) > 5))) && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start space-x-2 text-[11px] text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="leading-normal">
                    <span className="font-bold text-amber-300 block">⚡ แจ้งเตือนความเสี่ยง Leverage สูง:</span>
                    การตั้งค่า Leverage มากกว่า 5x จะเพิ่มอัตราเร่งของผลตอบแทนและขาดทุนอย่างรวดเร็ว โปรดควบคุมความเสี่ยงและกำหนด Stop Loss ให้เหมาะสม
                  </div>
                </div>
              )}
            </div>

            {/* Position Sizing & Equal Weight Money Management */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>การจัดสรรเงินทุนต่อไม้ ({isLiveMode ? 'คำนวณจากยอดพอร์ตจริง' : 'พอร์ตจำลอง'})</span>
                </span>
                <span className="text-[11px] font-mono text-emerald-300/90 font-bold">
                  {configForm.positionSizingMode === 'EQUAL_WEIGHT'
                    ? `แบ่งเท่ากันไม้ละ ≈ $${(
                        (isLiveMode ? (effectiveBalance > 0 ? effectiveBalance : 50) : (paperAccount.usdtBalance + paperAccount.activePositions.reduce((s, p) => s + (p.usdtInvested || 0), 0))) /
                        (configForm.maxOpenPositions || 3)
                      ).toFixed(2)} USDT`
                    : configForm.positionSizingMode === 'PERCENT_EQUITY'
                    ? `ไม้ละ ${configForm.balancePercent}% ของพอร์ตรวม`
                    : `ไม้ละ $${configForm.tradeAmountUsdt} USDT`}
                </span>
              </div>

              {/* Low Capital Guide Note */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 flex items-start space-x-2 text-[11px] text-emerald-200">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold text-emerald-300 block">💡 สำหรับพอร์ตทุนเริ่มต้นน้อย (เช่น $50 - $100 USDT):</span>
                  สามารถตั้งถือครอง 2-3 เหรียญ (เฉลี่ยไม้ละ $15 - $25) ร่วมกับ Leverage 2x - 3x บอทจะเปิดสัญญาได้อย่างราบรื่นและผ่านเกณฑ์ขั้นต่ำ $5 USDT ของ Binance เสมอ
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Sizing Mode */}
                <div>
                  <label className="text-slate-300 font-medium block mb-1">รูปแบบการจัดสรรเงิน</label>
                  <select
                    disabled={!isEditing}
                    value={configForm.positionSizingMode || 'EQUAL_WEIGHT'}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        positionSizingMode: e.target.value as any,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                  >
                    <option value="EQUAL_WEIGHT">ถัวเฉลี่ยเท่ากันทุกไม้ (Equal Weight ⭐ แนะนำ)</option>
                    <option value="PERCENT_EQUITY">% ของมูลค่าพอร์ตรวม (Total Equity %)</option>
                    <option value="FIXED_USDT">ระบุเงินดอลลาร์คงที่ (Fixed USDT)</option>
                  </select>
                </div>

                {/* Max Concurrent Positions */}
                <div>
                  <label className="text-slate-300 font-medium block mb-1">จำนวนเหรียญถือสูงสุด (Slots)</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    disabled={!isEditing}
                    value={configForm.maxOpenPositions !== undefined && configForm.maxOpenPositions !== null ? configForm.maxOpenPositions : ''}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        maxOpenPositions: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
                    onBlur={() => {
                      if (configForm.maxOpenPositions === '' || configForm.maxOpenPositions === undefined) {
                        setConfigForm((prev) => ({ ...prev, maxOpenPositions: 5 }));
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                  />
                </div>

                {/* Dynamic Value Input */}
                {configForm.positionSizingMode === 'PERCENT_EQUITY' ? (
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">% ต่อนัด</label>
                    <input
                      type="number"
                      disabled={!isEditing}
                      value={configForm.balancePercent ?? ''}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          balancePercent: e.target.value === '' ? ('' as any) : Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                    />
                  </div>
                ) : configForm.positionSizingMode === 'FIXED_USDT' ? (
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">เงินลงทุนต่อไม้ (USDT)</label>
                    <input
                      type="number"
                      disabled={!isEditing}
                      value={configForm.tradeAmountUsdt ?? ''}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          tradeAmountUsdt: e.target.value === '' ? ('' as any) : Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 disabled:opacity-60"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-slate-400 font-medium block mb-1">สัดส่วนต่อเหรียญโดยประมาณ</label>
                    <div className="bg-slate-900 border border-slate-800/80 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold">
                      {Math.round(100 / (configForm.maxOpenPositions || 5))}% / ไม้
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trailing Stop & Whipsaw Protection Engines */}
            <div className="p-4 bg-slate-950/90 border border-purple-500/20 rounded-2xl space-y-3 shadow-lg">
              <div className="flex items-center space-x-2 text-purple-400">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-slate-100 tracking-tight">
                  Trailing Stop & Whipsaw Protection Engines
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* 1. Trailing Stop Box */}
                <div
                  className={`p-3.5 rounded-xl border transition flex flex-col justify-between space-y-2.5 ${
                    configForm.useTrailingStop
                      ? 'bg-purple-950/20 border-purple-500/40 text-purple-100'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                  }`}
                >
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditing}
                      checked={configForm.useTrailingStop}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, useTrailingStop: e.target.checked })
                      }
                      className="mt-0.5 rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-0 cursor-pointer w-4 h-4"
                    />
                    <div className="space-y-1">
                      <span className="font-bold text-slate-100 block text-xs">
                        เปิดใช้ Trailing Stop (ล็อคกำไรสูงสุดตามการวิ่งของราคา)
                      </span>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                        เลื่อนจุดตัดขาดทุนขึ้นตามราคาสูงสุด และปิดทำกำไรเมื่อราคาย่อตัวลงมาตาม % ที่ตั้งไว้
                      </p>
                    </div>
                  </label>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center space-x-2">
                    <span className="text-slate-300 font-mono text-[11px]">Trailing %:</span>
                    <input
                      type="number"
                      min="0.5"
                      max="50"
                      step="0.5"
                      disabled={!isEditing || !configForm.useTrailingStop}
                      value={configForm.trailingStopPercent !== undefined && configForm.trailingStopPercent !== null ? configForm.trailingStopPercent : ''}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          trailingStopPercent: e.target.value === '' ? ('' as any) : Number(e.target.value),
                        })
                      }
                      onBlur={() => {
                        if (configForm.trailingStopPercent === '' || configForm.trailingStopPercent === undefined) {
                          setConfigForm((prev) => ({ ...prev, trailingStopPercent: 7 }));
                        }
                      }}
                      className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-purple-300 font-bold font-mono text-center focus:border-purple-500 disabled:opacity-50"
                    />
                    <span className="text-slate-400 text-[11px] font-mono">% จากจุดสูงสุด</span>
                  </div>
                </div>

                {/* 2. Whipsaw Protection Box */}
                <div
                  className={`p-3.5 rounded-xl border transition flex flex-col justify-between space-y-2.5 ${
                    configForm.useWhipsawProtection !== false
                      ? 'bg-blue-950/20 border-blue-500/40 text-blue-100'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                  }`}
                >
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditing}
                      checked={configForm.useWhipsawProtection !== false}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          useWhipsawProtection: e.target.checked,
                        })
                      }
                      className="mt-0.5 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer w-4 h-4"
                    />
                    <div className="space-y-1">
                      <span className="font-bold text-slate-100 block text-xs">
                        เปิดใช้ Stop Loss Lock (Whipsaw Protection)
                      </span>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                        ล็อคเหรียญที่โดน Stop Loss ไม่ให้เข้าซื้อซ้ำในรอบเดิม ป้องกันการโดนสับขาหลอกซ้ำๆ
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Triggers Checkboxes */}
            <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 font-medium block mb-1.5">เงื่อนไขการเข้าซื้อ (Entry Signals)</span>
                <div className="space-y-1.5">
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditing}
                      checked={configForm.buyOnSignal.includes('BLUE')}
                      onChange={(e) => {
                        const newBuy = e.target.checked
                          ? [...configForm.buyOnSignal, 'BLUE' as const]
                          : configForm.buyOnSignal.filter((s) => s !== 'BLUE');
                        setConfigForm({ ...configForm, buyOnSignal: newBuy });
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-blue-500 focus:ring-0"
                    />
                    <span className="font-semibold text-blue-400">โซนฟ้า (Buy Trigger - แท่งฟ้าแรกหลังจุดตัด ⭐)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditing}
                      checked={configForm.buyOnSignal.includes('GREEN')}
                      onChange={(e) => {
                        const newBuy = e.target.checked
                          ? [...configForm.buyOnSignal, 'GREEN' as const]
                          : configForm.buyOnSignal.filter((s) => s !== 'GREEN');
                        setConfigForm({ ...configForm, buyOnSignal: newBuy });
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span className="font-semibold text-emerald-400">โซนเขียว (Green Confirmation - แท่งเขียวแรกคอนเฟิร์มตามลุงโฉลก ⭐)</span>
                  </label>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium block mb-1.5">เงื่อนไขการขายออก (Exit Signals)</span>
                <div className="space-y-1.5">
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditing}
                      checked={configForm.sellOnSignal.includes('RED')}
                      onChange={(e) => {
                        const newSell = e.target.checked
                          ? [...configForm.sellOnSignal, 'RED' as const]
                          : configForm.sellOnSignal.filter((s) => s !== 'RED');
                        setConfigForm({ ...configForm, sellOnSignal: newSell });
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-rose-500 focus:ring-0"
                    />
                    <span className="font-semibold text-rose-400">โซนแดง (Bearish Cash Out / Short คอนเฟิร์มแรก ⭐)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditing}
                      checked={configForm.sellOnSignal.includes('YELLOW')}
                      onChange={(e) => {
                        const newSell = e.target.checked
                          ? [...configForm.sellOnSignal, 'YELLOW' as const]
                          : configForm.sellOnSignal.filter((s) => s !== 'YELLOW');
                        setConfigForm({ ...configForm, sellOnSignal: newSell });
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span className="text-amber-400">โซนเหลือง (Warning - เตือนพักตัว)</span>
                  </label>
                </div>
              </div>
            </div>

            {isEditing && (
              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg transition"
              >
                บันทึกการตั้งค่าพารามิเตอร์
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Column 3: Live Bot Terminal Logs (Collapsible on mobile) */}
      <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between transition-all duration-300 ${
        isConsoleExpanded ? 'h-[500px]' : 'h-64 lg:h-[520px]'
      }`}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Bot Activity Console</h3>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {botLogs.length} logs
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            {/* Mobile Toggle Expand / Collapse Button */}
            <button
              type="button"
              onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
              className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title={isConsoleExpanded ? 'ย่อหน้าต่างบันทึก' : 'ขยายหน้าต่างบันทึก'}
            >
              {isConsoleExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <button
              onClick={onClearLogs}
              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
              title="ล้างบันทึก"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Console Log Window */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 my-2.5 flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] text-slate-300 scrollbar-thin">
          {botLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs">
              ยังไม่มีบันทึกกิจกรรมบอท
            </div>
          ) : (
            botLogs.map((log, idx) => (
              <div
                key={idx}
                className={`leading-relaxed border-b border-slate-900/60 pb-1 ${
                  log.includes('BUY') || log.includes('ซื้อ')
                    ? 'text-emerald-400 font-semibold'
                    : log.includes('SELL') || log.includes('ขาย')
                    ? 'text-rose-400 font-semibold'
                    : log.includes('BLUE')
                    ? 'text-blue-400'
                    : log.includes('GREEN')
                    ? 'text-emerald-300'
                    : log.includes('YELLOW')
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }`}
              >
                {log}
              </div>
            ))
          )}
        </div>

        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1">
          <span>ตรวจสอบสัญญาณ CDC ทุกๆ 10 วินาที</span>
          <span>โหมด: {botConfig.mode}</span>
        </div>
      </div>
    </div>
  );
};
