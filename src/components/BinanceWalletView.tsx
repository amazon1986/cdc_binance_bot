import React, { useState, useEffect, useCallback } from 'react';
import {
  BinanceApiKeys,
  BinanceWalletData,
  PaperAccount,
  BotConfig,
  BinanceTicker24h,
} from '../types';
import { fetchFullBinanceWallet, formatCryptoPrice, formatCryptoAmount } from '../lib/binanceApi';
import {
  Wallet,
  Coins,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  Key,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  PieChart,
  Eye,
  EyeOff,
  Zap,
  Activity,
  Layers,
  ChevronRight,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';

interface BinanceWalletViewProps {
  binanceKeys: BinanceApiKeys;
  paperAccount: PaperAccount;
  botConfig: BotConfig;
  allTickers?: BinanceTicker24h[];
  onOpenSettings: () => void;
  onSelectSymbol?: (symbol: string) => void;
  onClosePaperPosition?: (symbol: string) => void;
  onResetPaperAccount?: () => void;
}

export const BinanceWalletView: React.FC<BinanceWalletViewProps> = ({
  binanceKeys,
  paperAccount,
  botConfig,
  allTickers = [],
  onOpenSettings,
  onSelectSymbol,
  onClosePaperPosition,
  onResetPaperAccount,
}) => {
  const [walletSubTab, setWalletSubTab] = useState<'live' | 'paper'>('live');
  const [walletData, setWalletData] = useState<BinanceWalletData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideSmallBalances, setHideSmallBalances] = useState(true);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'spot' | 'futures'>('all');

  const hasApiKeys = Boolean(binanceKeys?.apiKey && binanceKeys?.apiSecret);

  // Fetch Live Binance Wallet data
  const loadWalletData = useCallback(async () => {
    if (!hasApiKeys) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    const res = await fetchFullBinanceWallet(binanceKeys);
    if (res.success && res.data) {
      setWalletData(res.data);
    } else {
      setErrorMsg(res.error || 'ไม่สามารถโหลดข้อมูลกระเป๋า Binance ได้');
    }
    setIsLoading(false);
  }, [binanceKeys, hasApiKeys]);

  useEffect(() => {
    loadWalletData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (hasApiKeys) loadWalletData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadWalletData, hasApiKeys]);

  // Total Paper Equity Calculation
  const paperPositionsValue = paperAccount.activePositions.reduce(
    (sum, p) => sum + (p.usdtInvested || 0) + (p.currentPnlUsdt || 0),
    0
  );
  const totalPaperEquity = paperAccount.usdtBalance + paperPositionsValue;
  const paperUnrealizedPnl = paperAccount.activePositions.reduce(
    (sum, p) => sum + (p.currentPnlUsdt || 0),
    0
  );

  // Filter Spot Balances
  const filteredSpotBalances = (walletData?.spotBalances || []).filter((item) => {
    const matchesSearch = item.asset.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSmall = hideSmallBalances ? item.usdValue >= 1.0 : true;
    return matchesSearch && matchesSmall;
  });

  // Calculate Exchange Rate Estimate (1 USD ~ 35.00 THB)
  const USD_TO_THB = 35.0;

  // Mask balance helper
  const maskValue = (val: string | number) => {
    if (isBalanceHidden) return '••••••';
    return typeof val === 'number' ? val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : val;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Header Toolbar & Quick Switchers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl backdrop-blur shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-600 p-3 rounded-xl shadow-lg shadow-emerald-900/30">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">กระเป๋าเหรียญ (Binance Wallet)</h2>
              <button
                onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                className="text-slate-400 hover:text-slate-200 transition p-1 rounded hover:bg-slate-800"
                title={isBalanceHidden ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
              >
                {isBalanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              ตรวจสอบยอดเงินคงเหลือ สินทรัพย์ Spot และสัญญา Futures จากบัญชี Binance แบบ Real-time
            </p>
          </div>
        </div>

        {/* Action Buttons: Refresh, Sub-tab switch, Settings */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sub-tab Switch: Live vs Paper */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1">
            <button
              onClick={() => setWalletSubTab('live')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                walletSubTab === 'live'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Binance Live API</span>
            </button>
            <button
              onClick={() => setWalletSubTab('paper')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                walletSubTab === 'paper'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>พอร์ตจำลอง (Paper)</span>
            </button>
          </div>

          {/* Reset Paper Account Button */}
          {walletSubTab === 'paper' && onResetPaperAccount && (
            <button
              onClick={onResetPaperAccount}
              className="flex items-center space-x-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white rounded-xl text-xs font-semibold border border-rose-500/30 transition cursor-pointer shadow-sm"
              title="รีเซ็ตยอดเงินพอร์ตจำลองกลับเป็น $10,000 USDT และล้างสัญญาจำลองทั้งหมด"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>รีเซ็ตพอร์ต ($10,000)</span>
            </button>
          )}

          {/* Refresh Button */}
          {walletSubTab === 'live' && hasApiKeys && (
            <button
              onClick={loadWalletData}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition disabled:opacity-50"
              title="ดึงข้อมูลกระเป๋าใหม่อีกครั้ง"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">รีเฟรช</span>
            </button>
          )}

          {/* API Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>ตั้งค่า API Key</span>
          </button>
        </div>
      </div>

      {/* 2. Content Body: Binance Live Tab */}
      {walletSubTab === 'live' && (
        <div className="space-y-6">
          {/* Missing API Key Warning / Prompt */}
          {!hasApiKeys ? (
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-8 rounded-2xl text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-inner">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-lg font-bold text-white">ยังไม่ได้เชื่อมต่อ Binance API Key</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  เพื่อดูยอดเงินคงเหลือในกระเป๋า Spot และ Futures จากบัญชี Binance ของคุณ กรุณาตั้งค่า API Key และ API Secret (สามารถใช้ Read-only Key เพื่อความปลอดภัยสูงสุด)
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={onOpenSettings}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition flex items-center space-x-2"
                >
                  <Key className="w-4 h-4" />
                  <span>ตั้งค่า Binance API Key ทันที</span>
                </button>
                <button
                  onClick={() => setWalletSubTab('paper')}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition"
                >
                  สลับไปดูกระเป๋าจำลอง (Paper)
                </button>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="bg-rose-950/40 border border-rose-800/60 p-6 rounded-2xl flex items-start space-x-4">
              <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-rose-300">เกิดข้อผิดพลาดในการเชื่อมต่อ Binance API</h4>
                <p className="text-xs text-rose-200/80">{errorMsg}</p>
                <div className="pt-2 flex space-x-3">
                  <button
                    onClick={loadWalletData}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition"
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                  <button
                    onClick={onOpenSettings}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    ตรวจสอบ API Key
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Top Overview Metric Cards (Spot + Futures Combined) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Net Worth & Combined Available USDT */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition" />
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>มูลค่าพอร์ตรวม (Total Net Worth)</span>
                    <Coins className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black font-mono text-white tracking-tight">
                      ${maskValue(walletData?.totalNetWorthUsd || 0)} <span className="text-xs text-slate-500 font-sans">USD</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      ≈ ฿{maskValue(((walletData?.totalNetWorthUsd || 0) * USD_TO_THB))} <span className="text-[10px] text-slate-500">THB</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/60">
                    <span className="text-slate-400">USDT พร้อมเทรดรวม:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      ${maskValue(walletData?.combinedAvailableUsdt || ((walletData?.spotUsdtFree || 0) + (walletData?.futuresUsdtAvailable || 0)))}
                    </span>
                  </div>
                </div>

                {/* 2. Spot Wallet Value */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>กระเป๋า Spot (Spot Balance)</span>
                    <Wallet className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                      ${maskValue(walletData?.totalSpotUsd || 0)} <span className="text-xs text-slate-500 font-sans">USD</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      USDT ว่าง: <strong className="text-slate-200 font-mono">${maskValue(walletData?.spotUsdtFree || 0)}</strong> | ถือครอง <span className="text-slate-200 font-bold font-mono">{walletData?.spotBalances.length || 0}</span> เหรียญ
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <span>สัดส่วนในพอร์ต</span>
                    <span className="font-mono font-bold text-slate-200">
                      {walletData && walletData.totalNetWorthUsd > 0
                        ? `${((walletData.totalSpotUsd / walletData.totalNetWorthUsd) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </span>
                  </div>
                </div>

                {/* 3. Futures Equity & Margin */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>กระเป๋า Futures (Futures Equity)</span>
                    <Zap className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black font-mono text-amber-400 tracking-tight">
                      ${maskValue(walletData?.totalFuturesEquityUsd || 0)} <span className="text-xs text-slate-500 font-sans">USD</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      USDT พร้อมใช้: <strong className="text-slate-200 font-mono">${maskValue(walletData?.futuresUsdtAvailable || 0)}</strong> | สัญญา <span className="text-slate-200 font-bold font-mono">{walletData?.futuresPositions.length || 0}</span> ไม้
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60">
                    <span>สัดส่วนในพอร์ต</span>
                    <span className="font-mono font-bold text-slate-200">
                      {walletData && walletData.totalNetWorthUsd > 0
                        ? `${((walletData.totalFuturesEquityUsd / walletData.totalNetWorthUsd) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </span>
                  </div>
                </div>

                {/* 4. Futures Unrealized PnL */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>กำไร/ขาดทุนที่ยังไม่ปิด (Unrealized PnL)</span>
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`text-2xl font-black font-mono tracking-tight flex items-center space-x-1 ${
                        (walletData?.totalFuturesUnrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {(walletData?.totalFuturesUnrealizedPnl || 0) >= 0 ? (
                        <TrendingUp className="w-5 h-5 inline mr-1" />
                      ) : (
                        <TrendingDown className="w-5 h-5 inline mr-1" />
                      )}
                      <span>
                        {(walletData?.totalFuturesUnrealizedPnl || 0) >= 0 ? '+' : ''}
                        ${maskValue(walletData?.totalFuturesUnrealizedPnl || 0)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Margin รวม: <span className="text-slate-200 font-mono">${maskValue(walletData?.totalFuturesMarginUsd || 0)}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
                    อัปเดตล่าสุด: {walletData ? new Date(walletData.lastUpdated).toLocaleTimeString('th-TH') : '-'}
                  </div>
                </div>
              </div>

              {/* 3. Asset Allocation Breakdown Bar */}
              {walletData && walletData.spotBalances.length > 0 && walletData.totalSpotUsd > 0 && (
                <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300 flex items-center space-x-2 uppercase tracking-wider">
                      <PieChart className="w-4 h-4 text-emerald-400" />
                      <span>สัดส่วนสินทรัพย์ในกระเป๋า Spot (Asset Allocation)</span>
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      รวม ${maskValue(walletData.totalSpotUsd)} USD
                    </span>
                  </div>

                  {/* Multi-color Progress Distribution Bar */}
                  <div className="h-3.5 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800/80">
                    {walletData.spotBalances.slice(0, 6).map((item, idx) => {
                      const colors = [
                        'bg-emerald-500',
                        'bg-teal-400',
                        'bg-cyan-500',
                        'bg-blue-500',
                        'bg-indigo-500',
                        'bg-violet-500',
                      ];
                      const color = colors[idx % colors.length];
                      const widthPct = Math.max(1, item.percentOfPortfolio || 0);

                      return (
                        <div
                          key={item.asset}
                          style={{ width: `${widthPct}%` }}
                          className={`${color} h-full transition-all duration-500 relative group/bar`}
                          title={`${item.asset}: ${item.percentOfPortfolio?.toFixed(1)}% ($${item.usdValue.toFixed(2)})`}
                        />
                      );
                    })}
                  </div>

                  {/* Badges Legend */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {walletData.spotBalances.slice(0, 6).map((item, idx) => {
                      const dotColors = [
                        'bg-emerald-500',
                        'bg-teal-400',
                        'bg-cyan-500',
                        'bg-blue-500',
                        'bg-indigo-500',
                        'bg-violet-500',
                      ];
                      return (
                        <div
                          key={item.asset}
                          className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs font-mono"
                        >
                          <span className={`w-2 h-2 rounded-full ${dotColors[idx % dotColors.length]}`} />
                          <span className="text-slate-300 font-bold">{item.asset}:</span>
                          <span className="text-slate-400">{item.percentOfPortfolio?.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Category Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                {/* Category Buttons */}
                <div className="grid grid-cols-3 sm:flex sm:items-center space-x-0 sm:space-x-1 gap-1 sm:gap-0 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setActiveCategory('all')}
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition text-center ${
                      activeCategory === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    onClick={() => setActiveCategory('spot')}
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition text-center ${
                      activeCategory === 'spot'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Spot ({walletData?.spotBalances.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveCategory('futures')}
                    className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition text-center ${
                      activeCategory === 'futures'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Futures ({walletData?.futuresPositions.length || 0})
                  </button>
                </div>

                {/* Search & Hide Small Balances Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideSmallBalances}
                      onChange={(e) => setHideSmallBalances(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <span>ซ่อนเหรียญมูลค่าน้อย (&lt; $1.00)</span>
                  </label>

                  <div className="relative w-full sm:w-auto">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="ค้นหาเหรียญ..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 sm:py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition w-full sm:w-48"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Spot Balances Table & Mobile Cards */}
              {(activeCategory === 'all' || activeCategory === 'spot') && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Wallet className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white">รายการสินทรัพย์ในกระเป๋า Spot (Spot Balances)</h3>
                      <span className="text-xs text-slate-400 font-mono">({filteredSpotBalances.length} รายการ)</span>
                    </div>
                  </div>

                  {filteredSpotBalances.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      {searchQuery ? `ไม่พบเหรียญที่ตรงกับคำค้นหา "${searchQuery}"` : 'ไม่มียอดคงเหลือในกระเป๋า Spot'}
                    </div>
                  ) : (
                    <>
                      {/* Mobile Card List (md:hidden) */}
                      <div className="divide-y divide-slate-800/80 md:hidden">
                        {filteredSpotBalances.map((item) => {
                          const pairSymbol = `${item.asset}USDT`;
                          const isPositive = (item.priceChange24h || 0) >= 0;

                          return (
                            <div key={item.asset} className="p-4 space-y-3 hover:bg-slate-800/30 transition">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2.5">
                                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs">
                                    {item.asset.slice(0, 3)}
                                  </div>
                                  <div>
                                    <div className="font-bold text-white flex items-center space-x-1.5">
                                      <span>{item.asset}</span>
                                      {item.usdValue >= 100 && (
                                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-sans">
                                          Major
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      {item.percentOfPortfolio ? `${item.percentOfPortfolio.toFixed(1)}% ของพอร์ต` : ''}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="text-base font-bold font-mono text-emerald-400">
                                    ${maskValue(item.usdValue)}
                                  </div>
                                  {item.priceChange24h !== undefined && (
                                    <div className={`text-[11px] font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {isPositive ? `+${item.priceChange24h.toFixed(2)}%` : `${item.priceChange24h.toFixed(2)}%`}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-xs font-mono">
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">ยอดทั้งหมด (Total)</span>
                                  <span className="text-slate-100 font-bold">{isBalanceHidden ? '••••••' : formatCryptoAmount(item.total)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">พร้อมใช้ (Free)</span>
                                  <span className="text-slate-300">{isBalanceHidden ? '••••••' : formatCryptoAmount(item.free)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">ราคาตลาด ($)</span>
                                  <span className="text-slate-300">{item.usdPrice > 0 ? formatCryptoPrice(item.usdPrice) : '-'}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">อยู่ในคำสั่ง (Locked)</span>
                                  <span className={item.locked > 0 ? 'text-amber-400' : 'text-slate-500'}>
                                    {item.locked > 0 ? (isBalanceHidden ? '••••••' : formatCryptoAmount(item.locked)) : '0'}
                                  </span>
                                </div>
                              </div>

                              {item.asset !== 'USDT' && onSelectSymbol && (
                                <button
                                  onClick={() => onSelectSymbol(pairSymbol)}
                                  className="w-full py-2 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center justify-center space-x-1.5 active:scale-[0.98]"
                                >
                                  <span>ดูกราฟ CDC {pairSymbol}</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table View (hidden md:block) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800/80">
                            <tr>
                              <th className="py-3 px-4">เหรียญ (Asset)</th>
                              <th className="py-3 px-4 text-right">ยอดคงเหลือ (Total)</th>
                              <th className="py-3 px-4 text-right">พร้อมใช้ (Free)</th>
                              <th className="py-3 px-4 text-right">อยู่ในคำสั่ง (Locked)</th>
                              <th className="py-3 px-4 text-right">ราคาตลาด ($)</th>
                              <th className="py-3 px-4 text-right">มูลค่ารวม ($ USD)</th>
                              <th className="py-3 px-4 text-right">สัดส่วน (%)</th>
                              <th className="py-3 px-4 text-right">24h Change</th>
                              <th className="py-3 px-4 text-center">แอ็กชัน</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {filteredSpotBalances.map((item) => {
                              const pairSymbol = `${item.asset}USDT`;
                              const isPositive = (item.priceChange24h || 0) >= 0;

                              return (
                                <tr
                                  key={item.asset}
                                  className="hover:bg-slate-800/40 transition group"
                                >
                                  {/* Asset Name & Icon */}
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center space-x-2.5">
                                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs group-hover:border-emerald-500/50 transition">
                                        {item.asset.slice(0, 3)}
                                      </div>
                                      <div>
                                        <div className="font-bold text-white flex items-center space-x-1.5">
                                          <span>{item.asset}</span>
                                          {item.usdValue >= 100 && (
                                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-sans">
                                              Major
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Total Amount */}
                                  <td className="py-3.5 px-4 text-right font-bold text-slate-100">
                                    {isBalanceHidden ? '••••••' : formatCryptoAmount(item.total)}
                                  </td>

                                  {/* Free Amount */}
                                  <td className="py-3.5 px-4 text-right text-slate-300">
                                    {isBalanceHidden ? '••••••' : formatCryptoAmount(item.free)}
                                  </td>

                                  {/* Locked Amount */}
                                  <td className="py-3.5 px-4 text-right text-slate-400">
                                    {item.locked > 0 ? (
                                      <span className="text-amber-400">
                                        {isBalanceHidden ? '••••••' : formatCryptoAmount(item.locked)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">0</span>
                                    )}
                                  </td>

                                  {/* Current USD Price */}
                                  <td className="py-3.5 px-4 text-right text-slate-300">
                                    {item.usdPrice > 0 ? formatCryptoPrice(item.usdPrice) : '-'}
                                  </td>

                                  {/* Total USD Value */}
                                  <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                                    ${maskValue(item.usdValue)}
                                  </td>

                                  {/* Percent of Portfolio */}
                                  <td className="py-3.5 px-4 text-right text-slate-300 font-sans">
                                    <div className="inline-flex items-center space-x-1">
                                      <span className="font-mono">{item.percentOfPortfolio?.toFixed(1)}%</span>
                                    </div>
                                  </td>

                                  {/* 24h Change */}
                                  <td className="py-3.5 px-4 text-right">
                                    {item.priceChange24h !== undefined ? (
                                      <span
                                        className={`font-bold ${
                                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                                        }`}
                                      >
                                        {isPositive ? `+${item.priceChange24h.toFixed(2)}%` : `${item.priceChange24h.toFixed(2)}%`}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">-</span>
                                    )}
                                  </td>

                                  {/* Action Buttons */}
                                  <td className="py-3.5 px-4 text-center">
                                    {item.asset !== 'USDT' && onSelectSymbol && (
                                      <button
                                        onClick={() => onSelectSymbol(pairSymbol)}
                                        className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 transition flex items-center space-x-1 mx-auto"
                                        title={`ดูกราฟ ${pairSymbol}`}
                                      >
                                        <span>ดูกราฟ CDC</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 6. Futures Active Positions Table & Mobile Cards */}
              {(activeCategory === 'all' || activeCategory === 'futures') && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-white">สัญญาที่เปิดอยู่ใน Binance Futures (Open Positions)</h3>
                      <span className="text-xs text-slate-400 font-mono">({walletData?.futuresPositions.length || 0} โพซิชัน)</span>
                    </div>
                  </div>

                  {(!walletData?.futuresPositions || walletData.futuresPositions.length === 0) ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      ไม่มีสัญญาที่เปิดอยู่ใน Binance Futures
                    </div>
                  ) : (
                    <>
                      {/* Mobile Card List (md:hidden) */}
                      <div className="divide-y divide-slate-800/80 md:hidden">
                        {walletData.futuresPositions.map((pos) => {
                          const isLong = pos.positionAmt > 0 || pos.positionSide === 'LONG';
                          const isWin = pos.unrealizedProfit >= 0;

                          return (
                            <div key={pos.symbol} className="p-4 space-y-3 hover:bg-slate-800/30 transition">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-white font-mono text-sm">{pos.symbol}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      isLong
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}
                                  >
                                    {isLong ? 'LONG' : 'SHORT'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                                    {pos.leverage}x
                                  </span>
                                </div>

                                <div className="text-right">
                                  <div className={`text-base font-bold font-mono ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isWin ? '+' : ''}${maskValue(pos.unrealizedProfit)}
                                  </div>
                                  <div className={`text-[11px] font-bold font-mono ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isWin ? '+' : ''}{(pos.pnlPercent || 0).toFixed(2)}%
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-xs font-mono">
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">ขนาดสัญญา (Amt)</span>
                                  <span className="text-slate-100">{formatCryptoAmount(Math.abs(pos.positionAmt))}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">หลักประกัน (Margin)</span>
                                  <span className="text-slate-200">${maskValue(pos.initialMargin)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">ราคาเข้า (Entry)</span>
                                  <span className="text-slate-300">{formatCryptoPrice(pos.entryPrice)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-sans block">ราคาปัจจุบัน (Mark)</span>
                                  <span className="text-slate-100 font-bold">{formatCryptoPrice(pos.markPrice)}</span>
                                </div>
                                {pos.liquidationPrice && (
                                  <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-800/60">
                                    <span className="text-[10px] text-rose-400/90 font-sans">ราคา Liquidation:</span>
                                    <span className="text-rose-400 font-bold">{formatCryptoPrice(pos.liquidationPrice)}</span>
                                  </div>
                                )}
                              </div>

                              {onSelectSymbol && (
                                <button
                                  onClick={() => onSelectSymbol(pos.symbol)}
                                  className="w-full py-2 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center justify-center space-x-1.5 active:scale-[0.98]"
                                >
                                  <span>ดูกราฟ CDC {pos.symbol}</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table View (hidden md:block) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800/80">
                            <tr>
                              <th className="py-3 px-4">เหรียญ & ฝั่ง</th>
                              <th className="py-3 px-4 text-right">Leverage</th>
                              <th className="py-3 px-4 text-right">ขนาดสัญญา (Amt)</th>
                              <th className="py-3 px-4 text-right">ราคาเข้า (Entry)</th>
                              <th className="py-3 px-4 text-right">ราคาปัจจุบัน (Mark)</th>
                              <th className="py-3 px-4 text-right">ราคา Liquidation</th>
                              <th className="py-3 px-4 text-right">หลักประกัน (Margin)</th>
                              <th className="py-3 px-4 text-right">Unrealized PnL ($)</th>
                              <th className="py-3 px-4 text-right">PnL (%)</th>
                              <th className="py-3 px-4 text-center">แอ็กชัน</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {walletData.futuresPositions.map((pos) => {
                              const isLong = pos.positionAmt > 0 || pos.positionSide === 'LONG';
                              const isWin = pos.unrealizedProfit >= 0;

                              return (
                                <tr
                                  key={pos.symbol}
                                  className="hover:bg-slate-800/40 transition"
                                >
                                  {/* Symbol & Side Badge */}
                                  <td className="py-3.5 px-4 font-sans">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-white font-mono">{pos.symbol}</span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          isLong
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        }`}
                                      >
                                        {isLong ? 'LONG' : 'SHORT'}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Leverage */}
                                  <td className="py-3.5 px-4 text-right font-bold text-amber-400">
                                    {pos.leverage}x
                                  </td>

                                  {/* Position Size */}
                                  <td className="py-3.5 px-4 text-right text-slate-100">
                                    {formatCryptoAmount(Math.abs(pos.positionAmt))}
                                  </td>

                                  {/* Entry Price */}
                                  <td className="py-3.5 px-4 text-right text-slate-300">
                                    {formatCryptoPrice(pos.entryPrice)}
                                  </td>

                                  {/* Mark Price */}
                                  <td className="py-3.5 px-4 text-right text-slate-100 font-bold">
                                    {formatCryptoPrice(pos.markPrice)}
                                  </td>

                                  {/* Liquidation Price */}
                                  <td className="py-3.5 px-4 text-right text-rose-400/90 font-medium">
                                    {pos.liquidationPrice ? formatCryptoPrice(pos.liquidationPrice) : '-'}
                                  </td>

                                  {/* Margin */}
                                  <td className="py-3.5 px-4 text-right text-slate-200">
                                    ${maskValue(pos.initialMargin)}
                                  </td>

                                  {/* Unrealized PnL USDT */}
                                  <td className={`py-3.5 px-4 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isWin ? '+' : ''}${maskValue(pos.unrealizedProfit)}
                                  </td>

                                  {/* PnL Percent */}
                                  <td className={`py-3.5 px-4 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isWin ? '+' : ''}{(pos.pnlPercent || 0).toFixed(2)}%
                                  </td>

                                  {/* Action */}
                                  <td className="py-3.5 px-4 text-center">
                                    {onSelectSymbol && (
                                      <button
                                        onClick={() => onSelectSymbol(pos.symbol)}
                                        className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 transition"
                                      >
                                        ดูกราฟ
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 3. Content Body: Paper Trading Wallet Tab */}
      {walletSubTab === 'paper' && (
        <div className="space-y-6">
          {/* Top Paper Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Paper Total Equity */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg relative">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>มูลค่าพอร์ตจำลองรวม (Paper Equity)</span>
                <Coins className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black font-mono text-white">
                ${maskValue(totalPaperEquity)} <span className="text-xs text-slate-500 font-sans">USDT</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                เงินสดคงเหลือ: <span className="text-emerald-400 font-mono font-bold">${maskValue(paperAccount.usdtBalance)}</span>
              </div>
            </div>

            {/* Paper Total Realized Profit */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>กำไรสะสมปิดสัญญา (Realized PnL)</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div
                className={`text-2xl font-black font-mono ${
                  paperAccount.totalProfitUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {paperAccount.totalProfitUsdt >= 0 ? '+' : ''}${maskValue(paperAccount.totalProfitUsdt)}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Win Rate:{' '}
                <span className="text-slate-200 font-bold font-mono">
                  {paperAccount.totalTrades > 0
                    ? `${((paperAccount.winningTrades / paperAccount.totalTrades) * 100).toFixed(1)}%`
                    : '0.0%'}
                </span>{' '}
                ({paperAccount.winningTrades}W / {paperAccount.losingTrades}L)
              </div>
            </div>

            {/* Paper Active Margin Invested */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>เงินทุนในสัญญาที่เปิดอยู่ (Margin)</span>
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-black font-mono text-cyan-400">
                ${maskValue(paperAccount.activePositions.reduce((s, p) => s + p.usdtInvested, 0))}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                เปิดอยู่ <span className="text-slate-200 font-bold font-mono">{paperAccount.activePositions.length}</span> จากสูงสุด {botConfig.maxOpenPositions || 5} โพซิชัน
              </div>
            </div>

            {/* Paper Unrealized PnL */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-2xl shadow-lg">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Unrealized PnL (สัญญาปัจจุบัน)</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div
                className={`text-2xl font-black font-mono ${
                  paperUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {paperUnrealizedPnl >= 0 ? '+' : ''}${maskValue(paperUnrealizedPnl)}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                คำนวณตามราคา Real-time ล่าสุด
              </div>
            </div>
          </div>

          {/* Paper Active Positions Table & Mobile Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">สัญญาที่เปิดอยู่ในพอร์ตจำลอง (Active Paper Positions)</h3>
                <span className="text-xs text-slate-400 font-mono">({paperAccount.activePositions.length} โพซิชัน)</span>
              </div>
            </div>

            {paperAccount.activePositions.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                ขณะนี้ไม่มีสัญญาที่เปิดอยู่ในพอร์ตจำลอง
              </div>
            ) : (
              <>
                {/* Mobile Card List (md:hidden) */}
                <div className="divide-y divide-slate-800/80 md:hidden">
                  {paperAccount.activePositions.map((pos) => {
                    const isWin = (pos.currentPnlUsdt || 0) >= 0;

                    return (
                      <div key={pos.symbol} className="p-4 space-y-3 hover:bg-slate-800/30 transition">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white font-mono text-sm">{pos.symbol}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                pos.side === 'LONG'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {pos.side}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                              {pos.leverage || 1}x
                            </span>
                          </div>

                          <div className="text-right">
                            <div className={`text-base font-bold font-mono ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}${maskValue(pos.currentPnlUsdt || 0)}
                            </div>
                            <div className={`text-[11px] font-bold font-mono ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}{(pos.currentPnlPercent || 0).toFixed(2)}%
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 text-xs font-mono">
                          <div>
                            <span className="text-[10px] text-slate-400 font-sans block">เงินทุน (Margin)</span>
                            <span className="text-slate-100 font-bold">${maskValue(pos.usdtInvested)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-sans block">ราคาเข้า (Entry)</span>
                            <span className="text-slate-300">{formatCryptoPrice(pos.entryPrice)}</span>
                          </div>
                          {pos.liquidationPrice && (
                            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-800/60">
                              <span className="text-[10px] text-rose-400/90 font-sans">ราคา Liquidation:</span>
                              <span className="text-rose-400 font-bold">{formatCryptoPrice(pos.liquidationPrice)}</span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {onSelectSymbol && (
                            <button
                              onClick={() => onSelectSymbol(pos.symbol)}
                              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center justify-center space-x-1 active:scale-[0.98]"
                            >
                              <span>ดูกราฟ</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onClosePaperPosition && (
                            <button
                              onClick={() => onClosePaperPosition(pos.symbol)}
                              className="py-2.5 px-3 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold border border-rose-500/30 transition shadow-sm active:scale-[0.98]"
                            >
                              ปิดสัญญา
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View (hidden md:block) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800/80">
                      <tr>
                        <th className="py-3 px-4">เหรียญ & ฝั่ง</th>
                        <th className="py-3 px-4 text-right">Leverage</th>
                        <th className="py-3 px-4 text-right">เงินทุน (Margin)</th>
                        <th className="py-3 px-4 text-right">ราคาเข้า (Entry)</th>
                        <th className="py-3 px-4 text-right">ราคา Liquidation</th>
                        <th className="py-3 px-4 text-right">Unrealized PnL ($)</th>
                        <th className="py-3 px-4 text-right">PnL (%)</th>
                        <th className="py-3 px-4 text-center">แอ็กชัน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {paperAccount.activePositions.map((pos) => {
                        const isWin = (pos.currentPnlUsdt || 0) >= 0;

                        return (
                          <tr key={pos.symbol} className="hover:bg-slate-800/40 transition">
                            <td className="py-3.5 px-4 font-sans">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-white font-mono">{pos.symbol}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    pos.side === 'LONG'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {pos.side}
                                </span>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-right font-bold text-amber-400">
                              {pos.leverage || 1}x
                            </td>

                            <td className="py-3.5 px-4 text-right text-slate-100">
                              ${maskValue(pos.usdtInvested)}
                            </td>

                            <td className="py-3.5 px-4 text-right text-slate-300">
                              {formatCryptoPrice(pos.entryPrice)}
                            </td>

                            <td className="py-3.5 px-4 text-right text-rose-400 font-medium">
                              {pos.liquidationPrice ? formatCryptoPrice(pos.liquidationPrice) : '-'}
                            </td>

                            <td className={`py-3.5 px-4 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}${maskValue(pos.currentPnlUsdt || 0)}
                            </td>

                            <td className={`py-3.5 px-4 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isWin ? '+' : ''}{(pos.currentPnlPercent || 0).toFixed(2)}%
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                {onSelectSymbol && (
                                  <button
                                    onClick={() => onSelectSymbol(pos.symbol)}
                                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 transition"
                                  >
                                    ดูกราฟ
                                  </button>
                                )}
                                {onClosePaperPosition && (
                                  <button
                                    onClick={() => onClosePaperPosition(pos.symbol)}
                                    className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white rounded-lg text-[11px] font-semibold border border-rose-500/30 transition"
                                  >
                                    ปิดสัญญา
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
