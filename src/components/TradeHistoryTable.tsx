import React, { useState, useEffect, useCallback } from 'react';
import {
  ExecutedTrade,
  PaperPosition,
  BinanceTicker24h,
  BinanceApiKeys,
  BotConfig,
  BinanceLiveTradeItem,
  FuturesPositionItem,
} from '../types';
import {
  History,
  Download,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Activity,
  XCircle,
  Zap,
  Layers,
  RefreshCw,
  Key,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Coins,
  DollarSign,
  Filter,
} from 'lucide-react';
import {
  formatCryptoPrice,
  formatCryptoAmount,
  fetchBinanceLiveTradeHistory,
  closeLiveBinancePosition,
} from '../lib/binanceApi';

interface TradeHistoryTableProps {
  trades: ExecutedTrade[];
  onClearHistory: () => void;
  activePositions?: PaperPosition[];
  onClosePosition?: (symbol: string) => void;
  allTickers?: BinanceTicker24h[];
  binanceKeys?: BinanceApiKeys;
  botConfig?: BotConfig;
  onOpenSettings?: () => void;
  onSelectSymbol?: (symbol: string) => void;
}

export const TradeHistoryTable: React.FC<TradeHistoryTableProps> = ({
  trades,
  onClearHistory,
  activePositions = [],
  onClosePosition,
  allTickers = [],
  binanceKeys,
  botConfig,
  onOpenSettings,
  onSelectSymbol,
}) => {
  // Mode switcher: 'live' vs 'paper'
  const initialMode = botConfig?.mode === 'BINANCE_LIVE' ? 'live' : 'paper';
  const [historyMode, setHistoryMode] = useState<'live' | 'paper'>(initialMode);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT' | 'CLOSE'>('ALL');

  // Live History State
  const [liveTrades, setLiveTrades] = useState<BinanceLiveTradeItem[]>([]);
  const [livePositions, setLivePositions] = useState<FuturesPositionItem[]>([]);
  const [liveRealizedPnl, setLiveRealizedPnl] = useState<number>(0);
  const [liveWinCount, setLiveWinCount] = useState<number>(0);
  const [liveLossCount, setLiveLossCount] = useState<number>(0);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [liveErrorMsg, setLiveErrorMsg] = useState<string | null>(null);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  const hasApiKeys = Boolean(binanceKeys?.apiKey && binanceKeys?.apiSecret);

  // Fetch Live Trade History from Binance API
  const loadLiveTradeHistory = useCallback(async () => {
    if (!binanceKeys || !hasApiKeys) {
      setIsLoadingLive(false);
      return;
    }

    setIsLoadingLive(true);
    setLiveErrorMsg(null);

    const res = await fetchBinanceLiveTradeHistory(
      {
        apiKey: binanceKeys.apiKey,
        apiSecret: binanceKeys.apiSecret,
        isTestnet: binanceKeys.isTestnet,
        marketType: binanceKeys.marketType || 'FUTURES',
      },
      { limit: 100 }
    );

    if (res.success) {
      setLiveTrades(res.trades || []);
      setLivePositions(res.livePositions || []);
      setLiveRealizedPnl(res.totalRealizedPnl || 0);
      setLiveWinCount(res.winCount || 0);
      setLiveLossCount(res.lossCount || 0);
    } else {
      setLiveErrorMsg(res.error || 'ไม่สามารถโหลดประวัติการเทรดจาก Binance ได้');
    }

    setIsLoadingLive(false);
  }, [binanceKeys, hasApiKeys]);

  useEffect(() => {
    if (historyMode === 'live') {
      loadLiveTradeHistory();
      const interval = setInterval(() => {
        if (hasApiKeys) loadLiveTradeHistory();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [historyMode, loadLiveTradeHistory, hasApiKeys]);

  // Handle closing a live futures position
  const handleCloseLivePosition = async (pos: FuturesPositionItem) => {
    if (!binanceKeys || !hasApiKeys) return;
    const isLong = pos.positionAmt > 0 || pos.positionSide === 'LONG';
    const side = isLong ? 'LONG' : 'SHORT';
    const qty = Math.abs(pos.positionAmt);

    const confirmMsg = `ยืนยันการปิดสัญญาจริง ${pos.symbol} (${side} จำนวน ${qty}) ด้วยราคาตลาด (Market Order)?`;
    if (!window.confirm(confirmMsg)) return;

    setClosingSymbol(pos.symbol);
    const res = await closeLiveBinancePosition(binanceKeys, {
      symbol: pos.symbol,
      side,
      quantity: qty,
    });

    if (res.success) {
      alert(`✅ ส่งคำสั่งปิดสัญญา ${pos.symbol} สำเร็จเรียบร้อย`);
      loadLiveTradeHistory();
    } else {
      alert(`❌ ปิดสัญญาไม่สำเร็จ: ${res.error || 'เกิดข้อผิดพลาด'}`);
    }
    setClosingSymbol(null);
  };

  // Helper badge renderer
  const renderSideBadge = (side: string, reason = '') => {
    const rLower = (reason || '').toLowerCase();
    const isTransfer = side === 'TRANSFER' || side === 'TRANSFER_IN' || side === 'TRANSFER_OUT' || rLower.includes('transfer') || rLower.includes('โอน');
    const isFunding = side === 'FUNDING' || rLower.includes('funding');
    const isFee = side === 'FEE' || rLower.includes('commission');

    if (isTransfer) {
      const isOut = side === 'TRANSFER_OUT' || rLower.includes('ออก');
      return (
        <span className={`px-2 py-0.5 rounded font-extrabold text-[11px] border whitespace-nowrap ${
          isOut
            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        }`}>
          {isOut ? 'โอนออก (Transfer Out)' : 'โอนเข้า (Transfer In)'}
        </span>
      );
    }

    if (isFunding) {
      return (
        <span className="px-2 py-0.5 rounded font-extrabold text-[11px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 whitespace-nowrap">
          FUNDING
        </span>
      );
    }

    if (isFee) {
      return (
        <span className="px-2 py-0.5 rounded font-extrabold text-[11px] bg-slate-700/60 text-slate-300 border border-slate-600 whitespace-nowrap">
          FEE
        </span>
      );
    }

    const isClose =
      side === 'CLOSE_LONG' ||
      side === 'CLOSE_SHORT' ||
      side === 'CLOSE' ||
      rLower.includes('close') ||
      rLower.includes('exit') ||
      rLower.includes('ปิด');

    if (isClose) {
      const isShortClose = side === 'CLOSE_SHORT' || rLower.includes('short');
      if (isShortClose) {
        return (
          <span className="px-2 py-0.5 rounded font-extrabold text-[11px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 whitespace-nowrap">
            CLOSE SHORT
          </span>
        );
      }
      return (
        <span className="px-2 py-0.5 rounded font-extrabold text-[11px] bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">
          CLOSE LONG
        </span>
      );
    }

    if (side === 'SHORT' || side === 'SELL') {
      return (
        <span className="px-2 py-0.5 rounded font-extrabold text-[11px] bg-rose-500/20 text-rose-400 border border-rose-500/30 whitespace-nowrap">
          {side}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded font-extrabold text-[11px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
        {side}
      </span>
    );
  };

  // Filter Paper Trades
  const filteredPaperTrades = trades.filter((t) => {
    const matchesSymbol = t.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSymbol) return false;
    if (filterSide === 'ALL') return true;

    const reasonLower = (t.reason || '').toLowerCase();
    const isClose =
      t.side === 'CLOSE_LONG' ||
      t.side === 'CLOSE_SHORT' ||
      reasonLower.includes('close') ||
      reasonLower.includes('exit');

    if (filterSide === 'CLOSE') return isClose;
    if (filterSide === 'LONG') return !isClose && (t.side === 'LONG' || t.side === 'BUY');
    if (filterSide === 'SHORT') return !isClose && (t.side === 'SHORT' || t.side === 'SELL');
    return true;
  });

  // Filter Live Trades
  const filteredLiveTrades = liveTrades.filter((t) => {
    const matchesSymbol = t.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSymbol) return false;
    if (filterSide === 'ALL') return true;

    const reasonLower = (t.reason || '').toLowerCase();
    const isTransfer = t.side === 'TRANSFER' || t.side === 'TRANSFER_IN' || t.side === 'TRANSFER_OUT' || reasonLower.includes('transfer');
    const isFunding = t.side === 'FUNDING' || reasonLower.includes('funding');
    const isFee = t.side === 'FEE' || reasonLower.includes('commission');
    const isClose =
      (t.side === 'CLOSE_LONG' || t.side === 'CLOSE_SHORT' || t.side === 'CLOSE' || (t.realizedPnl !== undefined && t.realizedPnl !== 0)) &&
      !isTransfer && !isFunding && !isFee;

    if (filterSide === 'CLOSE') return isClose;
    if (filterSide === 'LONG') return !isClose && !isTransfer && !isFunding && !isFee && (t.side === 'LONG' || t.side === 'BUY');
    if (filterSide === 'SHORT') return !isClose && !isTransfer && !isFunding && !isFee && (t.side === 'SHORT' || t.side === 'SELL');
    return true;
  });

  // Paper totals
  const totalPaperInvested = activePositions.reduce((sum, pos) => sum + pos.usdtInvested, 0);
  const totalPaperUnrealizedPnlUsdt = activePositions.reduce((sum, pos) => sum + (pos.currentPnlUsdt || 0), 0);
  const totalPaperUnrealizedPnlPercent =
    totalPaperInvested > 0 ? (totalPaperUnrealizedPnlUsdt / totalPaperInvested) * 100 : 0;

  // Live totals
  const totalLiveInvested = livePositions.reduce((sum, pos) => sum + (pos.initialMargin || 0), 0);
  const totalLiveUnrealizedPnlUsdt = livePositions.reduce((sum, pos) => sum + (pos.unrealizedProfit || 0), 0);
  const totalLiveUnrealizedPnlPercent =
    totalLiveInvested > 0 ? (totalLiveUnrealizedPnlUsdt / totalLiveInvested) * 100 : 0;

  // CSV Export for Paper
  const exportPaperCsv = () => {
    if (trades.length === 0) return;
    const headers = ['ID', 'Date', 'Symbol', 'Timeframe', 'Side', 'Price', 'Amount', 'USDT Value', 'PnL ($)', 'Reason', 'Mode'];
    const rows = trades.map((t) => [
      t.id,
      new Date(t.timestamp).toLocaleString('th-TH'),
      t.symbol,
      t.timeframe,
      t.side,
      t.price,
      t.amount,
      t.usdtValue,
      t.pnlUsdt ?? 0,
      `"${t.reason}"`,
      t.mode,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `CDC_Paper_Trade_History_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export for Live
  const exportLiveCsv = () => {
    if (liveTrades.length === 0) return;
    const headers = ['ID', 'Date', 'Symbol', 'Market', 'Side', 'Price', 'Quantity', 'Quote USDT', 'Realized PnL ($)', 'Commission', 'Reason'];
    const rows = liveTrades.map((t) => [
      t.id,
      new Date(t.time).toLocaleString('th-TH'),
      t.symbol,
      t.marketType,
      t.side,
      t.price,
      t.qty,
      t.quoteQty,
      t.realizedPnl ?? 0,
      `${t.commission ?? 0} ${t.commissionAsset ?? 'USDT'}`,
      `"${t.reason || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Binance_Live_Trade_History_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Header Toolbar & Sub-tab Switcher (Binance Live API vs Paper) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl backdrop-blur shadow-xl">
        <div className="flex items-center space-x-3.5">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-600 p-3 rounded-xl shadow-lg shadow-emerald-900/30">
            <History className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {historyMode === 'live' ? 'ประวัติการเทรดกระเป๋าจริง (Binance Live History)' : 'ประวัติการเทรดพอร์ตจำลอง (Paper Trade History)'}
              </h2>
              {historyMode === 'live' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-xs">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  {binanceKeys?.isTestnet ? 'Testnet' : 'Live'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {historyMode === 'live'
                ? 'ประวัติการส่งคำสั่งซื้อขาย รายการกำไร/ขาดทุนสะสม (Realized PnL) และสัญญาที่เปิดอยู่ในบัญชี Binance'
                : 'บันทึกคำสั่งซื้อขายและสถานะโพซิชันที่กำลังเปิดอยู่ของพอร์ตจำลอง'}
            </p>
          </div>
        </div>

        {/* Action Controls & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sub-tab Switch: Live vs Paper (Matching Image 1) */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1">
            <button
              onClick={() => setHistoryMode('live')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                historyMode === 'live'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Binance Live API</span>
            </button>
            <button
              onClick={() => setHistoryMode('paper')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                historyMode === 'paper'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>พอร์ตจำลอง (Paper)</span>
            </button>
          </div>

          {/* Refresh Button for Live Mode */}
          {historyMode === 'live' && hasApiKeys && (
            <button
              onClick={loadLiveTradeHistory}
              disabled={isLoadingLive}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition disabled:opacity-50"
              title="ดึงประวัติการเทรดใหม่อีกครั้ง"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLive ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">รีเฟรช</span>
            </button>
          )}

          {/* API Settings Button */}
          {historyMode === 'live' && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>ตั้งค่า API Key</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BINANCE LIVE MODE CONTENT                                             */}
      {/* ========================================================================= */}
      {historyMode === 'live' && (
        <div className="space-y-6">
          {/* Missing API Keys State */}
          {!hasApiKeys ? (
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-8 rounded-2xl text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-inner">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-lg font-bold text-white">ยังไม่ได้เชื่อมต่อ Binance API Key</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  เพื่อดูประวัติการส่งคำสั่งซื้อขายจริง และสัญญาที่เปิดอยู่ในบัญชี Binance ของคุณ กรุณาระบุ API Key และ API Secret ในหน้าต่างตั้งค่า
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-3">
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/30 transition flex items-center space-x-2"
                  >
                    <Key className="w-4 h-4" />
                    <span>ตั้งค่า Binance API Key ทันที</span>
                  </button>
                )}
                <button
                  onClick={() => setHistoryMode('paper')}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition"
                >
                  สลับไปดูประวัติพอร์ตจำลอง (Paper)
                </button>
              </div>
            </div>
          ) : liveErrorMsg ? (
            <div className="bg-rose-950/40 border border-rose-800/60 p-6 rounded-2xl flex items-start space-x-4">
              <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-rose-300">เกิดข้อผิดพลาดในการดึงประวัติการเทรด Binance</h4>
                <p className="text-xs text-rose-200/80">{liveErrorMsg}</p>
                <div className="pt-2 flex space-x-3">
                  <button
                    onClick={loadLiveTradeHistory}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition"
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                    >
                      ตรวจสอบ API Key
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Top Overview Metric Cards for Live */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Realized PnL */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>กำไรปิดสัญญาจริง (Realized PnL)</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`text-2xl font-black font-mono tracking-tight ${
                        liveRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {liveRealizedPnl >= 0 ? '+' : ''}${liveRealizedPnl.toFixed(2)}{' '}
                      <span className="text-xs text-slate-500 font-sans">USDT</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Win Rate:{' '}
                      <span className="text-slate-200 font-bold font-mono">
                        {liveWinCount + liveLossCount > 0
                          ? `${((liveWinCount / (liveWinCount + liveLossCount)) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </span>{' '}
                      ({liveWinCount}W / {liveLossCount}L)
                    </div>
                  </div>
                </div>

                {/* 2. Active Live Positions */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>โพซิชันจริงที่เปิดอยู่ (Live Positions)</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black font-mono text-amber-400 tracking-tight">
                      {livePositions.length} <span className="text-xs text-slate-500 font-sans">โพซิชัน</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      ทุนประกันรวม (Margin):{' '}
                      <strong className="text-slate-200 font-mono">${totalLiveInvested.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. Live Unrealized PnL */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>กำไร/ขาดทุน Realtime รวม</span>
                    <Coins className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="space-y-1">
                    <div
                      className={`text-2xl font-black font-mono tracking-tight ${
                        totalLiveUnrealizedPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {totalLiveUnrealizedPnlUsdt >= 0 ? '+' : ''}${totalLiveUnrealizedPnlUsdt.toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      {totalLiveUnrealizedPnlPercent >= 0 ? '+' : ''}
                      {totalLiveUnrealizedPnlPercent.toFixed(2)}% ของเงินทุน
                    </div>
                  </div>
                </div>

                {/* 4. Total Executed Orders Recorded */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 p-5 rounded-2xl shadow-lg relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 text-xs mb-2 font-medium">
                    <span>ประวัติรายการที่บันทึก (Live Orders)</span>
                    <History className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-black font-mono text-white tracking-tight">
                      {liveTrades.length} <span className="text-xs text-slate-500 font-sans">รายการ</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      อัปเดตล่าสุด: {new Date().toLocaleTimeString('th-TH')}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2.1 Active Live Open Positions Table (Matching Image 2 for Live) */}
              {livePositions.length > 0 && (
                <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                      <h3 className="text-base font-bold text-white">
                        โพซิชันจริงที่กำลังเปิดอยู่ (Active Live Positions - {livePositions.length} ไม้)
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                      <span className="text-slate-400">
                        เงินลงทุนรวม: <strong className="text-slate-100">${totalLiveInvested.toFixed(2)} USDT</strong>
                      </span>
                      <div
                        className={`px-3 py-1.5 rounded-xl font-extrabold flex items-center space-x-1.5 border shadow-sm ${
                          totalLiveUnrealizedPnlUsdt >= 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        <span>กำไร/ขาดทุน Realtime ทั้งหมด:</span>
                        <span className="text-sm">
                          {totalLiveUnrealizedPnlUsdt >= 0 ? '+' : ''}${totalLiveUnrealizedPnlUsdt.toFixed(2)} (
                          {totalLiveUnrealizedPnlPercent >= 0 ? '+' : ''}
                          {totalLiveUnrealizedPnlPercent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-72 overflow-y-auto scrollbar-thin">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <th className="p-2.5">เหรียญ</th>
                          <th className="p-2.5">ฝั่ง & Leverage</th>
                          <th className="p-2.5">ราคาเข้า (Entry)</th>
                          <th className="p-2.5">ราคาปัจจุบัน (Mark)</th>
                          <th className="p-2.5">ทุนประกัน (Margin)</th>
                          <th className="p-2.5">ราคาล้างพอร์ต (Liq)</th>
                          <th className="p-2.5">กำไร/ขาดทุน Realtime</th>
                          <th className="p-2.5 text-right">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200">
                        {livePositions.map((pos) => {
                          const isLong = pos.positionAmt > 0 || pos.positionSide === 'LONG';
                          const pnlUsdt = pos.unrealizedProfit || 0;
                          const pnlPercent = pos.pnlPercent || 0;
                          const isClosing = closingSymbol === pos.symbol;

                          return (
                            <tr key={pos.symbol} className="hover:bg-slate-800/50">
                              <td className="p-2.5 font-bold text-white text-sm">
                                <div className="flex items-center space-x-1.5">
                                  <span>{pos.symbol}</span>
                                  {onSelectSymbol && (
                                    <button
                                      onClick={() => onSelectSymbol(pos.symbol)}
                                      className="text-slate-400 hover:text-emerald-400 p-0.5"
                                      title="ดูกราฟ CDC"
                                    >
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5 flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded font-extrabold text-[11px] border ${
                                    isLong
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                  }`}
                                >
                                  {isLong ? 'LONG' : 'SHORT'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  {pos.leverage || 1}x
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-300">{formatCryptoPrice(pos.entryPrice)}</td>
                              <td className="p-2.5 font-bold text-white">{formatCryptoPrice(pos.markPrice)}</td>
                              <td className="p-2.5 text-emerald-400 font-bold">${pos.initialMargin.toFixed(2)}</td>
                              <td className="p-2.5 text-rose-400 font-bold">
                                {pos.liquidationPrice ? formatCryptoPrice(pos.liquidationPrice) : '-'}
                              </td>
                              <td className="p-2.5">
                                <div
                                  className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg font-extrabold border shadow-sm ${
                                    pnlUsdt >= 0
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                      : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                                  }`}
                                >
                                  {pnlUsdt >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                  <span>
                                    {pnlUsdt >= 0 ? '+' : ''}${pnlUsdt.toFixed(2)} ({pnlPercent >= 0 ? '+' : ''}
                                    {pnlPercent.toFixed(2)}%)
                                  </span>
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <button
                                  onClick={() => handleCloseLivePosition(pos)}
                                  disabled={isClosing}
                                  className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ml-auto disabled:opacity-50"
                                >
                                  <XCircle className={`w-3.5 h-3.5 ${isClosing ? 'animate-spin' : ''}`} />
                                  <span>{isClosing ? 'กำลังปิด...' : 'ปิดสัญญา'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2.2 Binance Live Trade History Log */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <History className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white">ประวัติคำสั่งซื้อขายจริง (Binance Live Trade Log)</h3>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={exportLiveCsv}
                      disabled={liveTrades.length === 0}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ส่งออก CSV (Live)</span>
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex space-x-2">
                    {(['ALL', 'LONG', 'SHORT', 'CLOSE'] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => setFilterSide(side)}
                        className={`px-3 py-1 rounded-lg font-medium transition ${
                          filterSide === side
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-white bg-slate-950'
                        }`}
                      >
                        {side === 'ALL'
                          ? 'ทั้งหมด'
                          : side === 'LONG'
                          ? 'LONG / BUY'
                          : side === 'SHORT'
                          ? 'SHORT / SELL'
                          : 'ปิดสัญญา (CLOSE)'}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="ค้นหาชื่อเหรียญ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-44"
                  />
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-96 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <th className="p-2.5">เวลา</th>
                        <th className="p-2.5">เหรียญ</th>
                        <th className="p-2.5">ฝั่งคำสั่ง</th>
                        <th className="p-2.5">ราคาแมตช์</th>
                        <th className="p-2.5">จำนวน</th>
                        <th className="p-2.5">มูลค่า (USDT)</th>
                        <th className="p-2.5">PnL Realized ($)</th>
                        <th className="p-2.5">ค่าธรรมเนียม (Fee)</th>
                        <th className="p-2.5">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {filteredLiveTrades.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                            {isLoadingLive ? 'กำลังโหลดข้อมูลจาก Binance API...' : 'ไม่พบประวัติออเดอร์ในกระเป๋าจริง'}
                          </td>
                        </tr>
                      ) : (
                        filteredLiveTrades.map((t, idx) => {
                          const hasPnl = t.realizedPnl !== undefined && t.realizedPnl !== 0;
                          const isWin = (t.realizedPnl || 0) >= 0;

                          return (
                            <tr key={t.id ? `${t.id}_${idx}` : `livetrade_${idx}`} className="hover:bg-slate-800/40">
                              <td className="p-2.5 text-slate-400 font-sans">
                                {new Date(t.time).toLocaleTimeString('th-TH')}
                                <span className="block text-[10px] text-slate-500">
                                  {new Date(t.time).toLocaleDateString('th-TH')}
                                </span>
                              </td>
                              <td className="p-2.5 font-bold text-white">{t.symbol}</td>
                              <td className="p-2.5">{renderSideBadge(t.side, t.reason)}</td>
                              <td className="p-2.5 font-bold text-white">
                                {t.price > 0 ? formatCryptoPrice(t.price) : '-'}
                              </td>
                              <td className="p-2.5 font-mono">
                                {t.qty > 0 ? formatCryptoAmount(t.qty) : '-'}
                              </td>
                              <td className="p-2.5">${t.quoteQty.toFixed(2)}</td>
                              <td className="p-2.5">
                                {hasPnl ? (
                                  <span
                                    className={`px-2 py-0.5 rounded font-extrabold ${
                                      isWin
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}
                                  >
                                    {isWin ? '+' : ''}${t.realizedPnl?.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-400">
                                {t.commission && t.commission > 0
                                  ? `${t.commission.toFixed(4)} ${t.commissionAsset || 'USDT'}`
                                  : '-'}
                              </td>
                              <td className="p-2.5 font-sans text-slate-400">{t.reason || '-'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PAPER TRADING MODE CONTENT                                            */}
      {/* ========================================================================= */}
      {historyMode === 'paper' && (
        <div className="space-y-6">
          {/* Active Open Positions Banner */}
          {activePositions.length > 0 && (
            <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <h3 className="text-base font-bold text-white">
                    โพซิชันที่กำลังเปิดอยู่ (Active Open Positions - {activePositions.length} ไม้)
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-slate-400">
                    เงินลงทุนรวม: <strong className="text-slate-100">${totalPaperInvested.toFixed(2)} USDT</strong>
                  </span>
                  <div
                    className={`px-3 py-1.5 rounded-xl font-extrabold flex items-center space-x-1.5 border shadow-sm ${
                      totalPaperUnrealizedPnlUsdt >= 0
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    <span>กำไร/ขาดทุน Realtime ทั้งหมด:</span>
                    <span className="text-sm">
                      {totalPaperUnrealizedPnlUsdt >= 0 ? '+' : ''}${totalPaperUnrealizedPnlUsdt.toFixed(2)} (
                      {totalPaperUnrealizedPnlPercent >= 0 ? '+' : ''}
                      {totalPaperUnrealizedPnlPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-72 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="p-2.5">เหรียญ</th>
                      <th className="p-2.5">ฝั่ง & Leverage</th>
                      <th className="p-2.5">ราคาเข้า (Entry)</th>
                      <th className="p-2.5">ราคาปัจจุบัน</th>
                      <th className="p-2.5">ทุนประกัน (Margin)</th>
                      <th className="p-2.5">ราคาล้างพอร์ต (Liq)</th>
                      <th className="p-2.5">กำไร/ขาดทุน Realtime</th>
                      <th className="p-2.5 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {activePositions.map((pos) => {
                      const ticker = (allTickers || []).find((t) => t.symbol === pos.symbol);
                      const livePrice = ticker ? ticker.lastPrice : pos.entryPrice;
                      const pnlUsdt = pos.currentPnlUsdt ?? 0;
                      const pnlPercent = pos.currentPnlPercent ?? 0;
                      const margin = pos.marginUsdt || pos.usdtInvested;
                      const lev = pos.leverage || 1;

                      return (
                        <tr key={pos.symbol} className="hover:bg-slate-800/50">
                          <td className="p-2.5 font-bold text-white text-sm">
                            <div className="flex items-center space-x-1.5">
                              <span>{pos.symbol}</span>
                              {onSelectSymbol && (
                                <button
                                  onClick={() => onSelectSymbol(pos.symbol)}
                                  className="text-slate-400 hover:text-emerald-400 p-0.5"
                                  title="ดูกราฟ CDC"
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded font-extrabold text-[11px] border ${
                                pos.side === 'SHORT'
                                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              {pos.side}
                            </span>
                            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {lev}x
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-300">{formatCryptoPrice(pos.entryPrice)}</td>
                          <td className="p-2.5 font-bold text-white">
                            {formatCryptoPrice(livePrice > 0 ? livePrice : pos.entryPrice)}
                          </td>
                          <td className="p-2.5 text-emerald-400 font-bold">${margin.toFixed(2)}</td>
                          <td className="p-2.5 text-rose-400 font-bold">
                            {pos.liquidationPrice ? formatCryptoPrice(pos.liquidationPrice) : '-'}
                          </td>
                          <td className="p-2.5">
                            <div
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg font-extrabold border shadow-sm ${
                                pnlUsdt >= 0
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                              }`}
                            >
                              {pnlUsdt >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              <span>
                                {pnlUsdt >= 0 ? '+' : ''}${pnlUsdt.toFixed(2)} ({pnlPercent >= 0 ? '+' : ''}
                                {pnlPercent.toFixed(2)}%)
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            {onClosePosition && (
                              <button
                                onClick={() => onClosePosition(pos.symbol)}
                                className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ml-auto"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>ปิดสัญญา</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Paper Trade History Log Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">ประวัติการส่งคำสั่งซื้อขาย (Paper Trade Log)</h3>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={exportPaperCsv}
                  disabled={trades.length === 0}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ส่งออก CSV</span>
                </button>
                <button
                  onClick={onClearHistory}
                  disabled={trades.length === 0}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition disabled:opacity-40"
                  title="ล้างประวัติ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex space-x-2">
                {(['ALL', 'LONG', 'SHORT', 'CLOSE'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => setFilterSide(side)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      filterSide === side
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white bg-slate-950'
                    }`}
                  >
                    {side === 'ALL'
                      ? 'ทั้งหมด'
                      : side === 'LONG'
                      ? 'LONG'
                      : side === 'SHORT'
                      ? 'SHORT'
                      : 'ปิดสัญญา (CLOSE)'}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="ค้นหาชื่อเหรียญ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-44"
              />
            </div>

            {/* History Table */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-2.5">เวลา</th>
                    <th className="p-2.5">เหรียญ</th>
                    <th className="p-2.5">ฝั่ง</th>
                    <th className="p-2.5">ราคา</th>
                    <th className="p-2.5">จำนวน</th>
                    <th className="p-2.5">มูลค่า (USDT)</th>
                    <th className="p-2.5">PnL Realtime ($)</th>
                    <th className="p-2.5">เหตุผล</th>
                    <th className="p-2.5">โหมด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredPaperTrades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-500 font-sans">
                        ไม่พบประวัติออเดอร์
                      </td>
                    </tr>
                  ) : (
                    filteredPaperTrades.map((t, idx) => {
                      const activePosForTrade = activePositions.find(
                        (p) =>
                          p.symbol === t.symbol &&
                          (p.side === t.side ||
                            (p.side === 'LONG' && t.side === 'BUY') ||
                            (p.side === 'SHORT' && t.side === 'SELL'))
                      );

                      return (
                        <tr key={t.id ? `${t.id}_${idx}` : `trade_${idx}`} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-slate-400 font-sans">
                            {new Date(t.timestamp).toLocaleTimeString('th-TH')}
                          </td>
                          <td className="p-2.5 font-bold text-white">{t.symbol}</td>
                          <td className="p-2.5">{renderSideBadge(t.side, t.reason)}</td>
                          <td className="p-2.5 font-bold text-white">{formatCryptoPrice(t.price)}</td>
                          <td className="p-2.5 font-mono">{formatCryptoAmount(t.amount)}</td>
                          <td className="p-2.5">${t.usdtValue.toFixed(2)}</td>
                          <td className="p-2.5">
                            {activePosForTrade ? (
                              <div
                                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded font-extrabold animate-pulse border ${
                                  (activePosForTrade.currentPnlUsdt ?? 0) >= 0
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                <span>
                                  ⚡ {(activePosForTrade.currentPnlUsdt ?? 0) >= 0 ? '+' : ''}$
                                  {(activePosForTrade.currentPnlUsdt ?? 0).toFixed(2)} (
                                  {(activePosForTrade.currentPnlPercent ?? 0) >= 0 ? '+' : ''}
                                  {(activePosForTrade.currentPnlPercent ?? 0).toFixed(2)}%)
                                </span>
                              </div>
                            ) : t.pnlUsdt !== undefined ? (
                              <span className={`font-bold ${t.pnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {t.pnlUsdt >= 0 ? '+' : ''}${t.pnlUsdt.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="p-2.5 font-sans text-slate-400">{t.reason}</td>
                          <td className="p-2.5">
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                              {t.mode}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
