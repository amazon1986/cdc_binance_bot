import React, { useState, useMemo } from 'react';
import { BotConfig, PaperAccount, BinanceTicker24h, BinanceWalletData, AuthUser } from '../types';
import { formatCryptoPrice } from '../lib/binanceApi';
import {
  TrendingUp,
  Cpu,
  BarChart3,
  Search,
  History,
  Settings,
  ShieldAlert,
  Wallet,
  Play,
  Pause,
  RefreshCw,
  PieChart,
  Coffee,
  Send,
  Zap,
  User,
  LogIn,
  LogOut,
  Menu,
  X,
  MoreHorizontal,
  ChevronRight,
  Sliders,
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'chart' | 'wallet' | 'backtest' | 'scanner' | 'ai' | 'history' | 'stats' | 'coffee';
  setActiveTab: (tab: 'chart' | 'wallet' | 'backtest' | 'scanner' | 'ai' | 'history' | 'stats' | 'coffee') => void;
  botConfig: BotConfig;
  paperAccount: PaperAccount;
  liveWallet?: BinanceWalletData | null;
  onRefreshLiveWallet?: () => void;
  isLoadingLiveWallet?: boolean;
  onOpenSettings: () => void;
  onOpenTelegramSettings?: () => void;
  isTelegramEnabled?: boolean;
  onResetPaperAccount: () => void;
  onToggleBot: () => void;
  btcPrice?: number;
  ethPrice?: number;
  tickers?: BinanceTicker24h[];
  onSelectSymbol?: (symbol: string) => void;
  authUser?: AuthUser | null;
  onOpenLogin?: () => void;
  onOpenProfile?: () => void;
  onLogout?: () => void;
}

export const Header = React.memo<HeaderProps>(({
  activeTab,
  setActiveTab,
  botConfig,
  paperAccount,
  liveWallet,
  onRefreshLiveWallet,
  isLoadingLiveWallet,
  onOpenSettings,
  onOpenTelegramSettings,
  isTelegramEnabled,
  onResetPaperAccount,
  onToggleBot,
  btcPrice,
  ethPrice,
  tickers = [],
  onSelectSymbol,
  authUser,
  onOpenLogin,
  onOpenProfile,
  onLogout,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const displayTickerItems = useMemo(() => {
    return tickers && tickers.length > 0 ? [...tickers, ...tickers] : [];
  }, [tickers]);

  // Live Wallet computed balance
  const spotUsdt = liveWallet?.spotUsdtFree ?? (liveWallet?.spotBalances?.find((b) => b.asset === 'USDT')?.free ?? 0);
  const futUsdt = liveWallet?.futuresUsdtAvailable ?? (liveWallet?.futuresAssets?.find((a) => a.asset === 'USDT')?.availableBalance ?? 0);
  const combinedUsdt = liveWallet?.combinedAvailableUsdt ?? (spotUsdt + futUsdt);
  const netWorth = liveWallet?.totalNetWorthUsd ?? ((liveWallet?.totalSpotUsd || 0) + (liveWallet?.totalFuturesEquityUsd || 0));
  const displayLiveUsdt = combinedUsdt > 0 ? combinedUsdt : netWorth;

  const currentBalance = botConfig.mode === 'PAPER' ? paperAccount.usdtBalance : displayLiveUsdt;

  const handleTabSelect = (tab: HeaderProps['activeTab']) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="bg-[#0F172B] border-b border-[#1E293B] text-slate-100 sticky top-0 z-40 shadow-xl">
        {/* Top Bar: Title, Live Status & Controls */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand & Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 shrink-0">
            <div className="bg-gradient-to-tr from-emerald-500 via-teal-500 to-blue-600 p-2 sm:p-2.5 rounded-xl shadow-md flex items-center justify-center">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1 sm:gap-2">
                  <span>CDC Action Zone</span>
                  <span className="text-emerald-400 font-extrabold">V2</span>
                </h1>
                <span className="text-[10px] sm:text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                  Binance
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                ระบบบอทเทรดคริปโตตามสัญญาณอินดิเคเตอร์ Chaloke.org
              </p>
            </div>
          </div>

          {/* Desktop Right Action Controls (hidden on mobile, visible on sm/md+) */}
          <div className="hidden md:flex items-center space-x-2 lg:space-x-2.5">
            {authUser && (
              <>
                {/* Balance Badge (Paper vs Live Spot+Futures) */}
                {botConfig.mode === 'PAPER' ? (
                  <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-slate-400 block text-[10px] leading-tight">Paper Capital</span>
                      <span className="font-mono font-bold text-white text-xs">
                        ${paperAccount.usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <button
                      onClick={onResetPaperAccount}
                      title="Reset Paper Account Balance ($10,000)"
                      className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs text-amber-400"
                    title={`Spot: $${spotUsdt.toFixed(2)} USDT | Futures: $${futUsdt.toFixed(2)} USDT | มูลค่ารวมสุทธิ: $${netWorth.toFixed(2)} USD`}
                  >
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="text-amber-300/80 text-[10px] leading-tight">Live (Spot + Fut)</span>
                        {liveWallet?.isCached && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-mono">Cached</span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-white text-xs">
                        ${displayLiveUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {onRefreshLiveWallet && (
                      <button
                        onClick={onRefreshLiveWallet}
                        disabled={isLoadingLiveWallet}
                        title="ซิงก์ยอดเงินกระเป๋าจริง (Spot + Futures)"
                        className="text-amber-400 hover:text-white p-1 rounded hover:bg-amber-500/20 transition ml-0.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLiveWallet ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Bot Toggle Button */}
                <button
                  onClick={onToggleBot}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition ${
                    botConfig.isActive
                      ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {botConfig.isActive ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>หยุด บอท</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>เปิดใช้งาน บอท</span>
                    </>
                  )}
                </button>

                {/* Telegram Notification Button */}
                {onOpenTelegramSettings && (
                  <button
                    onClick={onOpenTelegramSettings}
                    className={`p-2 rounded-lg border transition relative flex items-center justify-center ${
                      isTelegramEnabled
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-400 hover:bg-sky-500/25'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                    title="ตั้งค่าแจ้งเตือน Telegram Bot"
                  >
                    <Send className="w-4 h-4" />
                    {isTelegramEnabled && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
                    )}
                  </button>
                )}

                {/* Settings Modal Button */}
                <button
                  onClick={onOpenSettings}
                  className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition"
                  title="ตั้งค่า Binance API Key / Mode"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {/* Profile Button */}
                <button
                  onClick={onOpenProfile}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700/80 text-emerald-400 text-xs font-semibold transition"
                  title={`ผู้ใช้งาน: ${authUser.username}`}
                >
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="max-w-[80px] truncate">{authUser.username}</span>
                </button>

                {/* Logout Button */}
                <button
                  onClick={onLogout}
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold transition"
                  title="ออกจากระบบ"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>ออก</span>
                </button>
              </>
            )}

            {!authUser && (
              <button
                onClick={onOpenLogin}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition"
                title="เข้าสู่ระบบ"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>เข้าสู่ระบบ</span>
              </button>
            )}
          </div>

          {/* Mobile Right Controls: Compact Balance, Quick Bot Toggle & Menu Button */}
          <div className="flex md:hidden items-center space-x-1.5">
            {authUser ? (
              <>
                {/* Mobile Compact Balance Badge */}
                <button
                  onClick={() => handleTabSelect('wallet')}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-[11px] font-mono font-bold transition active:scale-95 ${
                    botConfig.mode === 'BINANCE_LIVE'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-emerald-400'
                  }`}
                  title="คลิกเพื่อดูกระเป๋าเหรียญ"
                >
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>${currentBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                </button>

                {/* Quick Bot Toggle (Icon Only on Mobile) */}
                <button
                  onClick={onToggleBot}
                  className={`p-1.5 rounded-lg text-xs font-bold transition active:scale-95 flex items-center justify-center ${
                    botConfig.isActive
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40 animate-pulse'
                      : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                  }`}
                  title={botConfig.isActive ? 'แตะเพื่อหยุดบอท' : 'แตะเพื่อเปิดบอท'}
                >
                  {botConfig.isActive ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                </button>

                {/* Mobile Menu Hamburger Button */}
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 rounded-lg transition flex items-center justify-center"
                  aria-label="เปิดเมนูบอท"
                >
                  <Menu className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={onOpenLogin}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold transition active:scale-95"
              >
                เข้าสู่ระบบ
              </button>
            )}
          </div>
        </div>

        {/* Desktop Navigation Tabs Bar (Visible on md+, hidden on mobile in favor of bottom nav) */}
        <div className="hidden md:block bg-[#03081A] border-t border-[#1E293B]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {authUser ? (
              <div className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none touch-pan-x overscroll-x-contain">
                <button
                  onClick={() => setActiveTab('chart')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'chart'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>ชาร์ต & ควบคุมบอท</span>
                </button>

                <button
                  onClick={() => setActiveTab('wallet')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'wallet'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>กระเป๋าเหรียญ (Wallet)</span>
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'history'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>ประวัติการเทรด</span>
                </button>

                <button
                  onClick={() => setActiveTab('stats')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'stats'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <PieChart className="w-4 h-4" />
                  <span>สถิติการเทรด</span>
                </button>

                <button
                  onClick={() => setActiveTab('backtest')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'backtest'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>ทดสอบย้อนหลัง (Backtest)</span>
                </button>

                <button
                  onClick={() => setActiveTab('scanner')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'scanner'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>สแกนเหรียญ CDC</span>
                </button>

                <button
                  onClick={() => setActiveTab('ai')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'ai'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Cpu className="w-4 h-4" />
                  <span>วิเคราะห์ด้วย AI</span>
                </button>

                <button
                  onClick={() => setActiveTab('coffee')}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    activeTab === 'coffee'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-semibold'
                      : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10'
                  }`}
                >
                  <Coffee className="w-4 h-4 text-amber-400" />
                  <span>เลี้ยงกาแฟ ☕</span>
                </button>
              </div>
            ) : (
              <div className="py-2.5 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>🔒 กรุณาเข้าสู่ระบบเพื่อเข้าถึงแดชบอร์ด ควบคุมบอท และดูกระเป๋าเหรียญ</span>
                </div>
                <button
                  onClick={onOpenLogin}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4 cursor-pointer"
                >
                  เข้าสู่ระบบทันที &rarr;
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Running Price Ticker Tape Strip */}
        <div className="bg-[#0F172B] border-t border-b border-[#1E293B] py-1 sm:py-1.5">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden group">
              <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-r from-[#0F172B] to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-l from-[#0F172B] to-transparent z-10 pointer-events-none" />

              {displayTickerItems.length > 0 ? (
                <div className="animate-marquee flex items-center text-[11px] sm:text-xs whitespace-nowrap select-none">
                  {displayTickerItems.map((t, idx) => {
                    const isPositive = t.priceChangePercent >= 0;
                    const formattedPrice = formatCryptoPrice(t.lastPrice);
                    const cleanSymbol = t.symbol.replace('USDT', '');

                    return (
                      <div
                        key={`${t.symbol}-${idx}`}
                        onClick={() => onSelectSymbol && onSelectSymbol(t.symbol)}
                        className="flex items-center cursor-pointer hover:bg-slate-800/80 px-1.5 sm:px-2 py-0.5 rounded transition group/item shrink-0"
                        title={`คลิกเพื่อดูชาร์ต ${t.symbol}`}
                      >
                        <span className="text-slate-400 font-semibold group-hover/item:text-emerald-400 transition">
                          {cleanSymbol}:
                        </span>
                        <span className="font-mono font-bold text-white ml-1">
                          {formattedPrice}
                        </span>
                        <span
                          className={`font-mono font-bold ml-1 ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? `+${t.priceChangePercent.toFixed(1)}%` : `${t.priceChangePercent.toFixed(1)}%`}
                        </span>
                        <span className="text-slate-700 font-bold ml-3 mr-2 sm:ml-5 sm:mr-3 select-none">|</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3 text-[11px] text-slate-400 py-0.5">
                  <span className="animate-pulse">กำลังดึงราคาเหรียญ...</span>
                  {btcPrice && (
                    <span className="font-mono text-emerald-400">BTC: ${btcPrice.toLocaleString()}</span>
                  )}
                  {ethPrice && (
                    <span className="font-mono text-cyan-400">ETH: ${ethPrice.toLocaleString()}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM NAVIGATION BAR (md:hidden)                           */}
      {/* ========================================================================= */}
      {authUser && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 bg-[#0F172B]/95 backdrop-blur-xl border-t border-[#1E293B] pb-safe md:hidden shadow-[0_-8px_25px_rgba(0,0,0,0.6)]"
          aria-label="เมนูหลักบนมือถือ"
        >
          <div className="grid grid-cols-5 h-14 items-center">
            {/* 1. Chart / Bot */}
            <button
              onClick={() => handleTabSelect('chart')}
              className={`flex flex-col items-center justify-center h-full transition active:scale-90 relative ${
                activeTab === 'chart' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">ชาร์ต/บอท</span>
              {activeTab === 'chart' && (
                <span className="absolute top-1 w-1 h-1 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              )}
            </button>

            {/* 2. Wallet */}
            <button
              onClick={() => handleTabSelect('wallet')}
              className={`flex flex-col items-center justify-center h-full transition active:scale-90 relative ${
                activeTab === 'wallet' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wallet className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">กระเป๋า</span>
              {activeTab === 'wallet' && (
                <span className="absolute top-1 w-1 h-1 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              )}
            </button>

            {/* 3. Scanner */}
            <button
              onClick={() => handleTabSelect('scanner')}
              className={`flex flex-col items-center justify-center h-full transition active:scale-90 relative ${
                activeTab === 'scanner' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">สแกน</span>
              {activeTab === 'scanner' && (
                <span className="absolute top-1 w-1 h-1 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              )}
            </button>

            {/* 4. History */}
            <button
              onClick={() => handleTabSelect('history')}
              className={`flex flex-col items-center justify-center h-full transition active:scale-90 relative ${
                activeTab === 'history' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">ประวัติ</span>
              {activeTab === 'history' && (
                <span className="absolute top-1 w-1 h-1 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              )}
            </button>

            {/* 5. More Menu Drawer Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className={`flex flex-col items-center justify-center h-full transition active:scale-90 relative ${
                ['stats', 'backtest', 'ai', 'coffee'].includes(activeTab) || isMobileMenuOpen
                  ? 'text-cyan-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <MoreHorizontal className="w-5 h-5 mb-0.5" />
                {botConfig.isActive && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-400 border border-[#0F172B] animate-ping" />
                )}
              </div>
              <span className="text-[10px] leading-tight">เพิ่มเติม</span>
            </button>
          </div>
        </nav>
      )}

      {/* ========================================================================= */}
      {/* MOBILE ACTION DRAWER / BOTTOM SHEET (md:hidden)                           */}
      {/* ========================================================================= */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-black/75 backdrop-blur-xs animate-fadeIn">
          {/* Backdrop Tap to Close */}
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />

          {/* Drawer Sheet Body */}
          <div className="bg-[#0F172B] border-t border-slate-800 rounded-t-3xl max-h-[88vh] overflow-y-auto pb-safe shadow-2xl flex flex-col animate-slideUp">
            {/* Sheet Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-slate-700" />
            </div>

            {/* Drawer Header: User & Status */}
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center font-black text-white text-sm shadow-md">
                  {authUser?.username?.slice(0, 2).toUpperCase() || 'US'}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-sm">{authUser?.username}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${
                      botConfig.mode === 'BINANCE_LIVE'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {botConfig.mode === 'BINANCE_LIVE' ? '⚡ Live' : '🗂️ Paper'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    เงินทุน: ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content Sections */}
            <div className="p-4 space-y-4 text-xs">
              {/* 1. Quick Bot Switch Banner */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-sm block">สถานะระบบบอท CDC</span>
                  <span className="text-slate-400 text-[11px]">
                    {botConfig.isActive ? '🟢 บอทกำลังเฝ้าระวังสัญญาณ' : '🔴 บอทหยุดทำงานชั่วคราว'}
                  </span>
                </div>
                <button
                  onClick={onToggleBot}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow ${
                    botConfig.isActive
                      ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {botConfig.isActive ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{botConfig.isActive ? 'หยุดบอท' : 'เปิดบอท'}</span>
                </button>
              </div>

              {/* 2. All App Views */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 block mb-1">
                  หน้าแดชบอร์ดและการวิเคราะห์
                </span>

                <button
                  onClick={() => handleTabSelect('chart')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'chart' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span>ชาร์ต & ควบคุมบอท</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('wallet')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'wallet' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span>กระเป๋าเหรียญ (Binance & Paper)</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('scanner')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'scanner' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Search className="w-4 h-4 text-emerald-400" />
                    <span>สแกนเหรียญ CDC ตามลุงโฉลก</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('history')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'history' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <History className="w-4 h-4 text-emerald-400" />
                    <span>ประวัติการส่งคำสั่งซื้อขาย</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('stats')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'stats' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <PieChart className="w-4 h-4 text-emerald-400" />
                    <span>สถิติการเทรด & Win Rate</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('backtest')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'backtest' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span>ทดสอบย้อนหลัง (Backtesting)</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('ai')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'ai' ? 'bg-emerald-500/15 text-emerald-400 font-bold' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>วิเคราะห์แท่งเทียนด้วย AI</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                <button
                  onClick={() => handleTabSelect('coffee')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                    activeTab === 'coffee' ? 'bg-amber-500/20 text-amber-400 font-bold' : 'text-amber-400 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Coffee className="w-4 h-4 text-amber-400" />
                    <span>เลี้ยงกาแฟผู้พัฒนา ☕</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* 3. Settings & Account Controls */}
              <div className="pt-2 border-t border-slate-800 space-y-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 block mb-1">
                  การตั้งค่าและบัญชี
                </span>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/60 transition"
                >
                  <div className="flex items-center space-x-2.5">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span>ตั้งค่า Binance API Key & โหมดบอท</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                {onOpenTelegramSettings && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenTelegramSettings();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/60 transition"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Send className="w-4 h-4 text-sky-400" />
                      <span>ตั้งค่าแจ้งเตือน Telegram Bot</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {isTelegramEnabled ? 'เปิดแล้ว 🟢' : 'ปิดอยู่'}
                    </span>
                  </button>
                )}

                {botConfig.mode === 'PAPER' && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onResetPaperAccount();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/60 transition"
                  >
                    <div className="flex items-center space-x-2.5">
                      <RefreshCw className="w-4 h-4 text-emerald-400" />
                      <span>รีเซ็ตยอดเงินพอร์ตจำลอง ($10,000)</span>
                    </div>
                  </button>
                )}

                {onOpenProfile && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenProfile();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/60 transition"
                  >
                    <div className="flex items-center space-x-2.5">
                      <User className="w-4 h-4 text-emerald-400" />
                      <span>ข้อมูลโปรไฟล์ ({authUser.username})</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                )}

                {onLogout && (
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition mt-2"
                  >
                    <div className="flex items-center space-x-2.5">
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span className="font-bold">ออกจากระบบ</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
