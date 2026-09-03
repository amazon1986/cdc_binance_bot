import React, { useMemo } from 'react';
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
  const displayTickerItems = useMemo(() => {
    return tickers && tickers.length > 0 ? [...tickers, ...tickers] : [];
  }, [tickers]);

  return (
    <header className="bg-[#0F172B] border-b border-[#1E293B] text-slate-100 sticky top-0 z-40 shadow-xl">
      {/* Top Bar: Title, Running Live Ticker, Paper Account & Settings */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Title */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="bg-gradient-to-tr from-emerald-500 via-teal-500 to-blue-600 p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                CDC Action Zone <span className="text-emerald-400 font-extrabold">V2</span>
              </h1>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                Binance Bot
              </span>
            </div>
            <p className="text-xs text-slate-400">ระบบบอทเทรดคริปโตตามสัญญาณอินดิเคเตอร์ Chaloke.org</p>
          </div>
        </div>

        {/* Right Action Controls: Mode, Balance, Bot Switch, Settings */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
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
            (() => {
              const spotUsdt = liveWallet?.spotUsdtFree ?? (liveWallet?.spotBalances?.find((b) => b.asset === 'USDT')?.free ?? 0);
              const futUsdt = liveWallet?.futuresUsdtAvailable ?? (liveWallet?.futuresAssets?.find((a) => a.asset === 'USDT')?.availableBalance ?? 0);
              const combinedUsdt = liveWallet?.combinedAvailableUsdt ?? (spotUsdt + futUsdt);
              const netWorth = liveWallet?.totalNetWorthUsd ?? ((liveWallet?.totalSpotUsd || 0) + (liveWallet?.totalFuturesEquityUsd || 0));
              const displayLiveUsdt = combinedUsdt > 0 ? combinedUsdt : netWorth;

              return (
                <div
                  className="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs text-amber-400"
                  title={`Spot: $${spotUsdt.toFixed(2)} USDT | Futures: $${futUsdt.toFixed(2)} USDT | มูลค่ารวมสุทธิ: $${netWorth.toFixed(2)} USD`}
                >
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="flex items-center space-x-1">
                      <span className="text-amber-300/80 text-[10px] leading-tight">
                        Live (Spot + Fut)
                      </span>
                      {liveWallet?.isCached && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-mono">
                          Cached
                        </span>
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
              );
            })()
          )}

          {/* Quick Bot Toggle Button */}
          <button
            onClick={onToggleBot}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow transition ${
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

          {/* Telegram Notification Modal Button */}
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
            </>
          )}

          {/* User Profile / Username & Logout (ตามแบบตัวอย่าง) */}
          {authUser ? (
            <>
              {/* Profile Button */}
              <button
                onClick={onOpenProfile}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700/80 text-emerald-400 text-xs font-semibold transition"
                title={`ผู้ใช้งาน: ${authUser.username} (คลิกเพื่อดูโปรไฟล์)`}
              >
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>{authUser.username}</span>
              </button>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold transition"
                title="ออกจากระบบ"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>ออกจากระบบ</span>
              </button>
            </>
          ) : (
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
      </div>

      {/* Navigation Tabs Bar (Exact sampled color: #03081A) */}
      <div className="bg-[#03081A] border-t border-[#1E293B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {authUser ? (
            <div className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none touch-pan-x overscroll-x-contain">
              {/* 1. Chart & Bot Control */}
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

          {/* 2. Wallet (Binance & Paper) */}
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

          {/* 3. Trade History */}
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

      {/* 3. Dedicated Running Price Ticker Tape Strip (Exact sampled color: #0F172B) */}
      <div className="bg-[#0F172B] border-t border-b border-[#1E293B] py-1.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden group">
            {/* Subtle gradient edge masks matching #0F172B background exactly */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0F172B] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0F172B] to-transparent z-10 pointer-events-none" />

            {displayTickerItems.length > 0 ? (
              <div className="animate-marquee flex items-center text-xs whitespace-nowrap select-none">
                {displayTickerItems.map((t, idx) => {
                  const isPositive = t.priceChangePercent >= 0;
                  const formattedPrice = formatCryptoPrice(t.lastPrice);
                  const cleanSymbol = t.symbol.replace('USDT', '');

                  return (
                    <div
                      key={`${t.symbol}-${idx}`}
                      onClick={() => onSelectSymbol && onSelectSymbol(t.symbol)}
                      className="flex items-center cursor-pointer hover:bg-slate-800/80 px-2 py-0.5 rounded transition group/item shrink-0"
                      title={`คลิกเพื่อดูชาร์ต ${t.symbol}`}
                    >
                      <span className="text-slate-400 font-semibold group-hover/item:text-emerald-400 transition">
                        {cleanSymbol}/USDT:
                      </span>
                      <span className="font-mono font-bold text-white ml-1.5">
                        {formattedPrice}
                      </span>
                      <span
                        className={`font-mono font-bold ml-1.5 ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? `+${t.priceChangePercent.toFixed(2)}%` : `${t.priceChangePercent.toFixed(2)}%`}
                      </span>
                      <span className="text-slate-700/80 font-bold ml-5 mr-3 select-none">|</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-4 text-xs text-slate-400 py-0.5">
                <span className="animate-pulse">กำลังดึงราคาเหรียญทั้งหมดในระบบ...</span>
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
  );
});
