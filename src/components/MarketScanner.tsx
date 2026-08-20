import React, { useState, useEffect, useMemo } from 'react';
import { Timeframe, ScannerCoinResult, CDCZoneColor, ConfirmationStatus } from '../types';
import { fetchBinanceKlines, fetchBinanceTicker24h, POPULAR_PAIRS, formatCryptoPrice } from '../lib/binanceApi';
import { calculateCDCActionZone, getZoneColorHex, getZoneNameTh, evaluateCoinQuality } from '../lib/cdcIndicator';
import { getStoredSymbols, saveStoredSymbols, getStoredPaperAccount } from '../lib/botStore';
import {
  Search,
  RefreshCw,
  Zap,
  Plus,
  Trash2,
  SlidersHorizontal,
  RotateCcw,
  Coins,
  AlertCircle,
  Check,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Award,
  Flame,
  ArrowUpDown,
  Filter,
  ShieldCheck,
  Info,
} from 'lucide-react';

interface MarketScannerProps {
  onSelectCoin: (symbol: string) => void;
}

const PRESET_WATCHLISTS: { [key: string]: string[] } = {
  TOP_CAP: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
    'AVAXUSDT', 'DOGEUSDT', 'LINKUSDT', 'SUIUSDT', 'DOTUSDT', 'NEARUSDT'
  ],
  DEFI_L1: [
    'SOLUSDT', 'AVAXUSDT', 'NEARUSDT', 'SUIUSDT', 'APTUSDT', 'INJUSDT',
    'TIAUSDT', 'SEIUSDT', 'RENDERUSDT', 'FETUSDT', 'TAOUSDT', 'KASUSDT'
  ],
  MEMES: [
    'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'BONKUSDT', 'WIFUSDT', 'FLOKIUSDT',
    'BOMEUSDT', 'MEMEUSDT', '1000SATSUSDT', 'NEIROUSDT'
  ],
  ALL_POPULAR: POPULAR_PAIRS,
};

type FilterCategory = 'ALL' | 'BEST_PICKS' | 'CONFIRMED_PLUS_1' | 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';
type SortOption = 'SCORE' | 'RECENCY' | 'VOLUME' | 'CHANGE';

export const MarketScanner: React.FC<MarketScannerProps> = ({ onSelectCoin }) => {
  const [coinList, setCoinList] = useState<string[]>(() => getStoredSymbols());
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isManageOpen, setIsManageOpen] = useState(false);

  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('SCORE');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScannerCoinResult[]>([]);
  const [scanProgress, setScanProgress] = useState(0);

  const runScanner = async (symbolsToScan = coinList) => {
    if (symbolsToScan.length === 0) {
      setScanResults([]);
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    const results: ScannerCoinResult[] = [];

    // Fetch 24h tickers first for real-time prices, volume and changes
    const tickers = await fetchBinanceTicker24h();
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    for (let i = 0; i < symbolsToScan.length; i++) {
      const sym = symbolsToScan[i];
      try {
        const rawCandles = await fetchBinanceKlines(sym, timeframe, 100);
        const cdcCandles = calculateCDCActionZone(rawCandles, 12, 26);

        if (cdcCandles.length > 0) {
          const latest = cdcCandles[cdcCandles.length - 1];
          const ticker = tickerMap.get(sym);
          const priceChange24h = ticker ? ticker.priceChangePercent : 0;
          const volume24h = ticker ? ticker.quoteVolume : 0;

          const emaFast = latest.emaFast ?? latest.close;
          const emaSlow = latest.emaSlow ?? latest.close;
          const diffPct = emaSlow > 0 ? ((emaFast - emaSlow) / emaSlow) * 100 : 0;

          // Uncle Chaloke Extended Quality Analysis
          const evaluation = evaluateCoinQuality(cdcCandles, priceChange24h, volume24h);

          results.push({
            symbol: sym,
            currentPrice: latest.close,
            priceChange24h,
            volume24h,
            timeframe,
            zone: latest.zone || 'CYAN',
            signal: latest.signal || 'NEUTRAL',
            emaFast,
            emaSlow,
            trendStrength: Number(diffPct.toFixed(2)),
            lastSignalTime: new Date(latest.time).toLocaleTimeString('th-TH', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            barsSinceGoldenCross: evaluation.barsSinceGoldenCross,
            barsSinceDeadCross: evaluation.barsSinceDeadCross,
            isFreshGoldenCross: evaluation.isFreshGoldenCross,
            isFreshDeadCross: evaluation.isFreshDeadCross,
            confirmationStatus: evaluation.confirmationStatus,
            rankType: evaluation.rankType,
            signalQualityScore: evaluation.signalQualityScore,
            reasonTh: evaluation.reasonTh,
            actionRecommendationTh: evaluation.actionRecommendationTh,
          });
        }
      } catch (err) {
        console.warn(`Failed scanning ${sym}:`, err);
      }
      setScanProgress(Math.round(((i + 1) / symbolsToScan.length) * 100));
    }

    setScanResults(results);
    setIsScanning(false);
  };

  useEffect(() => {
    runScanner(coinList);
  }, [timeframe]);

  // Handle Adding Symbol
  const handleAddSymbol = (symbolToAdd?: string) => {
    setInputError(null);
    setSuccessMsg(null);

    const raw = (symbolToAdd || newSymbolInput).trim().toUpperCase().replace(/[\/\s_-]/g, '');
    if (!raw) {
      setInputError('กรุณากรอกชื่อคู่เหรียญ (เช่น SOLUSDT)');
      return;
    }

    const formatted = raw.endsWith('USDT') || raw.endsWith('BTC') || raw.endsWith('FDUSD') || raw.endsWith('USDC')
      ? raw
      : `${raw}USDT`;

    if (!/^[A-Z0-9]{4,16}$/.test(formatted)) {
      setInputError('รูปแบบสัญลักษณ์ไม่ถูกต้อง ต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลข (เช่น SOLUSDT)');
      return;
    }

    if (coinList.includes(formatted)) {
      setInputError(`คู่เหรียญ ${formatted} มีอยู่ในรายการแล้ว`);
      return;
    }

    const updated = [...coinList, formatted];
    setCoinList(updated);
    saveStoredSymbols(updated);
    setNewSymbolInput('');
    setSuccessMsg(`เพิ่มเหรียญ ${formatted} เรียบร้อยแล้ว`);

    setTimeout(() => setSuccessMsg(null), 3000);
    runScanner(updated);
  };

  // Handle Deleting Symbol
  const handleDeleteSymbol = (symbolToDelete: string) => {
    const paperAccount = getStoredPaperAccount();
    const hasOpenPos = paperAccount.activePositions.some((p) => p.symbol === symbolToDelete);

    if (hasOpenPos) {
      const confirmDelete = window.confirm(
        `⚠️ เหรียญ ${symbolToDelete} มีโพซิชันที่เปิดอยู่ในการเทรดจำลอง คุณแน่ใจหรือไม่ว่าต้องการลบออกจากรายการสแกน?`
      );
      if (!confirmDelete) return;
    }

    const updated = coinList.filter((s) => s !== symbolToDelete);
    if (updated.length === 0) {
      alert('ต้องมีเหรียญอย่างน้อย 1 คู่ในรายการ');
      return;
    }

    setCoinList(updated);
    saveStoredSymbols(updated);
    setSuccessMsg(`ลบเหรียญ ${symbolToDelete} เรียบร้อยแล้ว`);
    setTimeout(() => setSuccessMsg(null), 3000);
    setScanResults((prev) => prev.filter((r) => r.symbol !== symbolToDelete));
  };

  // Load Preset List
  const handleLoadPreset = (presetKey: string) => {
    const list = PRESET_WATCHLISTS[presetKey] || POPULAR_PAIRS;
    setCoinList(list);
    saveStoredSymbols(list);
    setSuccessMsg(`โหลดชุดเหรียญ ${presetKey} (${list.length} เหรียญ) สำเร็จ`);
    setTimeout(() => setSuccessMsg(null), 3000);
    runScanner(list);
  };

  // Top Best Buys (Uncle Chaloke: เขียวซื้อ / Golden Cross +1 แท่ง)
  const topBuyCandidates = useMemo(() => {
    return scanResults
      .filter((c) => c.rankType === 'BEST_BUY' || (c.isFreshGoldenCross && (c.zone === 'BLUE' || c.zone === 'GREEN')))
      .sort((a, b) => b.signalQualityScore - a.signalQualityScore)
      .slice(0, 4);
  }, [scanResults]);

  // Top Best Sells / Shorts (Uncle Chaloke: แดงขาย / Dead Cross +1 แท่ง)
  const topSellCandidates = useMemo(() => {
    return scanResults
      .filter((c) => c.rankType === 'BEST_SELL' || (c.isFreshDeadCross && (c.zone === 'RED' || c.zone === 'YELLOW')))
      .sort((a, b) => b.signalQualityScore - a.signalQualityScore)
      .slice(0, 4);
  }, [scanResults]);

  // Filtered and Sorted Coins List
  const processedCoins = useMemo(() => {
    let filtered = scanResults.filter((coin) => {
      const matchesSearch = coin.symbol.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filterCategory === 'ALL') return true;
      if (filterCategory === 'BEST_PICKS') {
        return coin.rankType === 'BEST_BUY' || coin.rankType === 'BEST_SELL' || coin.isFreshGoldenCross || coin.isFreshDeadCross;
      }
      if (filterCategory === 'CONFIRMED_PLUS_1') {
        return coin.confirmationStatus === 'CONFIRMED_PLUS_1' || coin.barsSinceGoldenCross === 1 || coin.barsSinceDeadCross === 1;
      }
      return coin.zone === filterCategory;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'SCORE') {
        return b.signalQualityScore - a.signalQualityScore;
      }
      if (sortBy === 'RECENCY') {
        const minBarsA = Math.min(a.barsSinceGoldenCross, a.barsSinceDeadCross);
        const minBarsB = Math.min(b.barsSinceGoldenCross, b.barsSinceDeadCross);
        return minBarsA - minBarsB;
      }
      if (sortBy === 'VOLUME') {
        return b.volume24h - a.volume24h;
      }
      if (sortBy === 'CHANGE') {
        return Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h);
      }
      return 0;
    });
  }, [scanResults, searchQuery, filterCategory, sortBy]);

  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(2)}K`;
    return `$${vol.toFixed(0)}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-6">
      {/* Top Header & Scan Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-xl shadow-md">
              <Sparkles className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                ระบบสแกนหาเหรียญที่ดีที่สุดตามทฤษฎีลุงโฉลก
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                  เขียวซื้อ แดงขาย (+1 แท่ง)
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ค้นหาเหรียญที่เกิดจุดตัด <strong className="text-emerald-400">Golden Cross</strong> และ <strong className="text-rose-400">Dead Cross</strong> ที่สดใหม่ตรงจุดตัด +1 แท่ง เพื่อเข้าซื้อและขายจุดต้นเทรนด์
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle Manage Coins Panel Button */}
          <button
            onClick={() => setIsManageOpen(!isManageOpen)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border ${
              isManageOpen
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isManageOpen ? 'ซ่อนการจัดการ' : '⚙️ จัดการเหรียญ'}</span>
          </button>

          {/* Timeframe Selector */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['15m', '1h', '4h', '1d', '1w'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  timeframe === tf
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => runScanner(coinList)}
            disabled={isScanning}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center space-x-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? `กำลังสแกน ${scanProgress}%` : 'เริ่มสแกนใหม่'}</span>
          </button>
        </div>
      </div>

      {/* ==================== HERO SECTION: BEST COIN PICKS ==================== */}
      {!isScanning && (topBuyCandidates.length > 0 || topSellCandidates.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider">
                ⭐ เหรียญแนะนำที่ดีที่สุดประจำรอบ (Uncle Chaloke Top Picks)
              </h4>
            </div>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ตรวจจับจุดตัด EMA 12/26 + คอนเฟิร์มแท่งปิด
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 🟢 TOP BUY CANDIDATES */}
            <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wide">
                    🟢 เหรียญที่ดีที่สุดสำหรับเข้าซื้อ (Top Buy Candidates)
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  เขียวซื้อ / Golden Cross +1 แท่ง
                </span>
              </div>

              {topBuyCandidates.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  ยังไม่พบเหรียญที่เกิดจุดตัด Golden Cross +1 แท่งในรอบนี้
                </div>
              ) : (
                <div className="space-y-2">
                  {topBuyCandidates.map((coin, index) => (
                    <div
                      key={coin.symbol}
                      className="group bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition shadow-sm"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                          index === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}>
                          #{index + 1}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-white text-sm font-mono">{coin.symbol}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {coin.confirmationStatus === 'CONFIRMED_PLUS_1' ? '🎯 จุดตัด +1 แท่ง' : '✨ จุดตัดแท่งแรก'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5 line-clamp-1">
                            {coin.reasonTh}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right font-mono">
                          <span className="text-xs font-bold text-white block">{formatCryptoPrice(coin.currentPrice)}</span>
                          <span className={`text-[10px] font-bold ${coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                          </span>
                        </div>

                        <div className="text-center px-2.5 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                          <span className="text-[9px] text-slate-400 block">คะแนน</span>
                          <span className="text-xs font-black text-emerald-400 font-mono">{coin.signalQualityScore}/100</span>
                        </div>

                        <button
                          onClick={() => onSelectCoin(coin.symbol)}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center space-x-1 shrink-0"
                          title={`เปิดชาร์ตและตั้งค่าบอท ${coin.symbol}`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>เทรด</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 🔴 TOP SELL / SHORT CANDIDATES */}
            <div className="bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border border-rose-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between pb-2 border-b border-rose-500/20">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-rose-500/20 rounded-lg text-rose-400">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-extrabold text-rose-400 uppercase tracking-wide">
                    🔴 เหรียญที่ดีที่สุดสำหรับขาย / Short (Top Sell Candidates)
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30">
                  แดงขาย / Dead Cross +1 แท่ง
                </span>
              </div>

              {topSellCandidates.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  ยังไม่พบเหรียญที่เกิดจุดตัด Dead Cross +1 แท่งในรอบนี้
                </div>
              ) : (
                <div className="space-y-2">
                  {topSellCandidates.map((coin, index) => (
                    <div
                      key={coin.symbol}
                      className="group bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/50 rounded-xl p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition shadow-sm"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                          index === 0 ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300'
                        }`}>
                          #{index + 1}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-white text-sm font-mono">{coin.symbol}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              {coin.confirmationStatus === 'CONFIRMED_PLUS_1' ? '🎯 จุดตัด +1 แท่ง' : '⚡ จุดตัดแท่งแรก'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5 line-clamp-1">
                            {coin.reasonTh}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right font-mono">
                          <span className="text-xs font-bold text-white block">{formatCryptoPrice(coin.currentPrice)}</span>
                          <span className={`text-[10px] font-bold ${coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {coin.priceChange24h >= 0 ? '+' : ''}{coin.priceChange24h.toFixed(2)}%
                          </span>
                        </div>

                        <div className="text-center px-2.5 py-1 bg-rose-500/10 rounded-lg border border-rose-500/20">
                          <span className="text-[9px] text-slate-400 block">คะแนน</span>
                          <span className="text-xs font-black text-rose-400 font-mono">{coin.signalQualityScore}/100</span>
                        </div>

                        <button
                          onClick={() => onSelectCoin(coin.symbol)}
                          className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center space-x-1 shrink-0"
                          title={`เปิดชาร์ตและตั้งค่าบอท ${coin.symbol}`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>เทรด</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MANAGE COINS & PRESET PANEL ==================== */}
      {isManageOpen && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">จัดการรายชื่อเหรียญสำหรับสแกน (Watchlist)</h4>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleLoadPreset('TOP_CAP')}
                className="text-xs text-slate-300 hover:text-white px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
              >
                Top Cap (12)
              </button>
              <button
                onClick={() => handleLoadPreset('DEFI_L1')}
                className="text-xs text-slate-300 hover:text-white px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
              >
                Layer 1/2 (12)
              </button>
              <button
                onClick={() => handleLoadPreset('MEMES')}
                className="text-xs text-slate-300 hover:text-white px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
              >
                Meme Coins (10)
              </button>
              <button
                onClick={() => handleLoadPreset('ALL_POPULAR')}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
                title="คืนค่ากลับเป็นคู่เหรียญหลักเริ่มต้นของ Binance"
              >
                <RotateCcw className="w-3 h-3" />
                <span>รีเซ็ต ({POPULAR_PAIRS.length} เหรียญ)</span>
              </button>
            </div>
          </div>

          {/* Add Coin Form Input */}
          <div className="space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddSymbol();
              }}
              className="flex flex-wrap sm:flex-nowrap gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อเหรียญ เช่น SOLUSDT, XRPUSDT, KASUSDT, PEPEUSDT, SUIUSDT..."
                  value={newSymbolInput}
                  onChange={(e) => {
                    setNewSymbolInput(e.target.value.toUpperCase());
                    if (inputError) setInputError(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center space-x-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มคู่เหรียญ</span>
              </button>
            </form>

            {/* Error or Success notification */}
            {inputError && (
              <div className="flex items-center space-x-1.5 text-xs text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{inputError}</span>
              </div>
            )}
            {successMsg && (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {/* Active Monitored Coins List */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>รายการเหรียญในระบบสแกน ({coinList.length} คู่):</span>
              <span className="text-[10px] text-slate-500">กดปุ่ม ✖ บนเหรียญเพื่อลบ</span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto scrollbar-thin p-1">
              {coinList.map((sym) => (
                <div
                  key={sym}
                  className="group flex items-center space-x-2 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-mono text-white shadow-sm transition"
                >
                  <span className="font-bold">{sym}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSymbol(sym)}
                    className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 p-0.5 rounded transition"
                    title={`ลบ ${sym} ออกจากรายการ`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar when scanning */}
      {isScanning && (
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full transition-all duration-300 shadow-md"
            style={{ width: `${scanProgress}%` }}
          />
        </div>
      )}

      {/* ==================== FILTERS & SEARCH BAR ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filterCategory === 'ALL'
                ? 'bg-slate-800 text-white border border-slate-700 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ทั้งหมด ({scanResults.length})
          </button>

          <button
            onClick={() => setFilterCategory('CONFIRMED_PLUS_1')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
              filterCategory === 'CONFIRMED_PLUS_1'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow'
                : 'text-emerald-400/80 hover:text-emerald-400'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>🎯 จุดตัด +1 แท่ง</span>
            <span>({scanResults.filter((c) => c.confirmationStatus === 'CONFIRMED_PLUS_1' || c.barsSinceGoldenCross === 1 || c.barsSinceDeadCross === 1).length})</span>
          </button>

          <button
            onClick={() => setFilterCategory('BEST_PICKS')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
              filterCategory === 'BEST_PICKS'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow'
                : 'text-amber-400/80 hover:text-amber-400'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>⭐ แนะนำ (Top Picks)</span>
            <span>({scanResults.filter((c) => c.rankType === 'BEST_BUY' || c.rankType === 'BEST_SELL').length})</span>
          </button>

          <button
            onClick={() => setFilterCategory('BLUE')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
              filterCategory === 'BLUE'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                : 'text-blue-400/70 hover:text-blue-400'
            }`}
          >
            <span>🟦 โซนฟ้า ({scanResults.filter((c) => c.zone === 'BLUE').length})</span>
          </button>

          <button
            onClick={() => setFilterCategory('GREEN')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
              filterCategory === 'GREEN'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-emerald-400/70 hover:text-emerald-400'
            }`}
          >
            <span>🟩 โซนเขียว ({scanResults.filter((c) => c.zone === 'GREEN').length})</span>
          </button>

          <button
            onClick={() => setFilterCategory('YELLOW')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
              filterCategory === 'YELLOW'
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                : 'text-yellow-400/70 hover:text-yellow-400'
            }`}
          >
            <span>🟨 โซนเหลือง ({scanResults.filter((c) => c.zone === 'YELLOW').length})</span>
          </button>

          <button
            onClick={() => setFilterCategory('RED')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1 ${
              filterCategory === 'RED'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'text-rose-400/70 hover:text-rose-400'
            }`}
          >
            <span>🟥 โซนแดง ({scanResults.filter((c) => c.zone === 'RED').length})</span>
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 space-x-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="SCORE" className="bg-slate-900">เรียงตาม: คะแนนสัญญาณ</option>
              <option value="RECENCY" className="bg-slate-900">เรียงตาม: ความสดของจุดตัด</option>
              <option value="VOLUME" className="bg-slate-900">เรียงตาม: Volume 24h</option>
              <option value="CHANGE" className="bg-slate-900">เรียงตาม: % เปลี่ยนแปลง</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="ค้นหาเหรียญ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-36"
          />
        </div>
      </div>

      {/* ==================== MAIN GRID RESULTS ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {processedCoins.length === 0 && !isScanning ? (
          <div className="col-span-full p-12 text-center bg-slate-950/60 border border-dashed border-slate-800 rounded-2xl text-slate-400 text-xs space-y-2">
            <Coins className="w-8 h-8 mx-auto text-slate-600" />
            <p className="font-bold text-white text-sm">ไม่พบเหรียญที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรอง</p>
            <p className="text-slate-500">
              ลองกดปุ่ม <span className="text-emerald-400">"⚙️ จัดการเหรียญ"</span> เพื่อเพิ่มเหรียญใหม่ หรือเปลี่ยนตัวกรอง
            </p>
          </div>
        ) : (
          processedCoins.map((coin) => {
            const isPlus1Bar = coin.confirmationStatus === 'CONFIRMED_PLUS_1' || coin.barsSinceGoldenCross === 1 || coin.barsSinceDeadCross === 1;
            const isBuyType = coin.rankType === 'BEST_BUY' || coin.zone === 'BLUE' || coin.zone === 'GREEN';

            return (
              <div
                key={coin.symbol}
                className={`bg-slate-950 border rounded-2xl p-4 shadow-xl space-y-3 transition-all flex flex-col justify-between hover:shadow-2xl ${
                  isPlus1Bar && isBuyType
                    ? 'border-emerald-500/50 ring-1 ring-emerald-500/20'
                    : isPlus1Bar && !isBuyType
                    ? 'border-rose-500/50 ring-1 ring-rose-500/20'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Card Header */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-extrabold text-white text-base font-mono">{coin.symbol}</span>
                        {isPlus1Bar && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            +1 แท่ง
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Vol: {formatVolume(coin.volume24h)}</span>
                    </div>

                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-black text-slate-950 shadow-sm"
                      style={{ backgroundColor: getZoneColorHex(coin.zone) }}
                    >
                      {getZoneNameTh(coin.zone)}
                    </span>
                  </div>

                  {/* Price & Score Row */}
                  <div className="flex items-baseline justify-between font-mono pt-1">
                    <span className="text-lg font-extrabold text-white">
                      {formatCryptoPrice(coin.currentPrice)}
                    </span>
                    <span
                      className={`text-xs font-bold flex items-center ${
                        coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {coin.priceChange24h >= 0 ? '+' : ''}
                      {coin.priceChange24h.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Crossover Status Box */}
                <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-medium">สถานะจุดตัด:</span>
                    {coin.isFreshGoldenCross ? (
                      <span className="font-bold text-emerald-400 flex items-center gap-1 font-mono">
                        ✨ Golden Cross ({coin.barsSinceGoldenCross} แท่ง)
                      </span>
                    ) : coin.isFreshDeadCross ? (
                      <span className="font-bold text-rose-400 flex items-center gap-1 font-mono">
                        ⚡ Dead Cross ({coin.barsSinceDeadCross} แท่ง)
                      </span>
                    ) : coin.zone === 'GREEN' || coin.zone === 'BLUE' ? (
                      <span className="text-slate-300 font-mono">ขาขึ้น ({coin.barsSinceGoldenCross} แท่ง)</span>
                    ) : (
                      <span className="text-slate-400 font-mono">ขาลง ({coin.barsSinceDeadCross} แท่ง)</span>
                    )}
                  </div>

                  {/* Quality Score Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                      <span>คะแนนสัญญาณ</span>
                      <span className={`font-bold ${
                        coin.signalQualityScore >= 75 ? 'text-emerald-400' : coin.signalQualityScore >= 50 ? 'text-cyan-400' : 'text-slate-400'
                      }`}>
                        {coin.signalQualityScore}/100
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          coin.signalQualityScore >= 75
                            ? 'bg-emerald-500'
                            : coin.signalQualityScore >= 50
                            ? 'bg-cyan-500'
                            : 'bg-slate-600'
                        }`}
                        style={{ width: `${coin.signalQualityScore}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 line-clamp-2">
                    💡 {coin.reasonTh}
                  </p>
                </div>

                {/* EMA 12 / 26 Technical Details */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-900">
                  <div>
                    <span className="block text-slate-500">EMA 12 (Fast):</span>
                    <span className="text-cyan-400">{formatCryptoPrice(coin.emaFast)}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500">EMA 26 (Slow):</span>
                    <span className="text-purple-400">{formatCryptoPrice(coin.emaSlow)}</span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => onSelectCoin(coin.symbol)}
                    className="flex-1 py-2 bg-gradient-to-r from-slate-800 to-slate-750 hover:from-emerald-600 hover:to-teal-600 hover:text-white text-emerald-400 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 border border-slate-700 hover:border-emerald-500 shadow"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>เปิดชาร์ต & บอท</span>
                  </button>

                  <button
                    onClick={() => handleDeleteSymbol(coin.symbol)}
                    className="p-2 bg-slate-900 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 rounded-xl transition"
                    title={`ลบ ${coin.symbol} ออกจากรายการ`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
