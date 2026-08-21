import React, { useState } from 'react';
import { BotConfig, PaperAccount, PaperPosition, ExecutedTrade, Timeframe, BinanceWalletData, BinanceApiKeys } from '../types';
import { formatCryptoPrice, formatCryptoAmount } from '../lib/binanceApi';
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
} from 'lucide-react';

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
}) => {
  const [configForm, setConfigForm] = useState<BotConfig>({ ...botConfig });
  const [isEditing, setIsEditing] = useState(false);
  const [manualPercent, setManualPercent] = useState<number>(botConfig.balancePercent || 25);
  const [inputMode, setInputMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [fixedUsdt, setFixedUsdt] = useState<number>(botConfig.tradeAmountUsdt || 20);

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

  // Real available USDT in wallet
  const liveAvailableUsdt = liveWallet?.futuresAssets?.find((a) => a.asset === 'USDT')?.availableBalance ?? liveWallet?.totalFuturesMarginUsd ?? 0;
  const effectiveBalance = isLiveMode ? (liveAvailableUsdt > 0 ? liveAvailableUsdt : (liveWallet?.totalFuturesMarginUsd || 0)) : paperAccount.usdtBalance;

  // Computed Manual Trade USDT amount based on selected percentage or fixed amount
  const computedManualUsdt = inputMode === 'FIXED'
    ? Math.max(5, fixedUsdt)
    : effectiveBalance > 0
      ? Math.max(5, (effectiveBalance * manualPercent) / 100)
      : Math.max(5, fixedUsdt);

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
      leverage: Math.min(Math.max(1, Number(configForm.leverage) || 1), 10),
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
                ? `🟢 Bot Auto (${botConfig.scanMode === 'MULTI_SCAN' ? 'สแกนทุกเหรียญ' : botConfig.symbol})`
                : '🔴 Bot ปิดการทำงาน'}
            </span>
          </div>

          {/* Trading Scope Mode Selector */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
            <label className="text-xs font-bold text-slate-200 block">
              โหมดการสแกนของบอท (Trading Scope Mode)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const updated = { ...botConfig, scanMode: 'SINGLE' as const };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  (botConfig.scanMode ?? 'SINGLE') === 'SINGLE'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🎯 เล่นเฉพาะเหรียญปัจจุบัน</span>
                  {(botConfig.scanMode ?? 'SINGLE') === 'SINGLE' && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-extrabold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-normal leading-normal">
                  เฝ้าระวังและส่งคำสั่งซื้อเฉพาะเหรียญ {botConfig.symbol} ที่เลือกอยู่นี้เท่านั้น
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  const updated = { ...botConfig, scanMode: 'MULTI_SCAN' as const };
                  onSaveConfig(updated);
                  setConfigForm(updated);
                }}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  botConfig.scanMode === 'MULTI_SCAN'
                    ? 'bg-blue-500/10 border-blue-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🌐 สแกนเปิดออเดอร์ทุกเหรียญอัตโนมัติ</span>
                  {botConfig.scanMode === 'MULTI_SCAN' && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-extrabold">
                      ใช้งานอยู่
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-normal leading-normal">
                  สแกนเหรียญทั้งหมดใน Binance และส่งคำสั่งเข้าซื้อทุกเหรียญที่เกิดสัญญาณ CDC
                </p>
              </button>
            </div>
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
            <div className="flex items-center justify-between text-xs bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-800/60 font-mono">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isLiveMode ? 'ยอดเงินพร้อมเทรดในกระเป๋าจริง (Binance):' : 'ยอดเงินพอร์ตจำลอง (Paper):'}</span>
              </span>
              <span className="font-extrabold text-emerald-400 text-sm">
                ${effectiveBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
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
                  onChange={(e) => setFixedUsdt(Math.max(5, parseFloat(e.target.value) || 5))}
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
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs">
                <span className="block text-[10px] text-slate-500">ราคา {botConfig.symbol}:</span>
                <span className="font-mono font-bold text-white text-sm">${currentPrice.toLocaleString()}</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onManualBuy(computedManualUsdt)}
                  className="flex items-center space-x-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition"
                  title={`เปิดสัญญา Long ด้วยเงิน $${computedManualUsdt.toFixed(2)} USDT`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Manual LONG (${computedManualUsdt.toFixed(0)})</span>
                </button>

                {onManualShort && (
                  <button
                    type="button"
                    onClick={() => onManualShort(computedManualUsdt)}
                    className="flex items-center space-x-1 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow transition"
                    title={`เปิดสัญญา Short ด้วยเงิน $${computedManualUsdt.toFixed(2)} USDT`}
                  >
                    <ArrowDownRight className="w-4 h-4" />
                    <span>Manual SHORT (${computedManualUsdt.toFixed(0)})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onManualSell}
                  disabled={!activeDisplayPos}
                  className="flex items-center space-x-1 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow transition disabled:opacity-40 disabled:cursor-not-allowed"
                  title="ปิดโพสิชันปัจจุบันทันที"
                >
                  <span>ปิดสัญญา (Close)</span>
                </button>
              </div>
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

            {/* Leverage Control (1x - 10x) */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>อัตราคูณ เลเวอเรจ (Leverage Multiplier: 1x - 10x)</span>
                </span>
                <span className="text-[11px] font-mono text-amber-300 font-semibold">
                  ทุน $100 ➔ เปิดสัญญาได้ ${(100 * (configForm.leverage || 1)).toLocaleString()} USDT ({configForm.leverage || 1}x)
                </span>
              </div>

              <div className="space-y-2 bg-slate-900/80 p-3 rounded-lg border border-slate-800/60">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">เลือก Leverage:</span>
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
              </div>

              {(configForm.leverage || 1) > 5 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start space-x-2 text-[11px] text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="leading-normal">
                    <span className="font-bold text-amber-300 block">⚡ แจ้งเตือนความเสี่ยง Leverage สูง ({configForm.leverage}x):</span>
                    เลเวอเรจ {configForm.leverage}x จะขยายทั้งกำไรและขาดทุน {configForm.leverage} เท่า หากราคาขยับผิดทางเพียง -{(100 / (configForm.leverage || 1)).toFixed(1)}% พอร์ตจะถูก Auto-Liquidate (ขาดทุน 100% ของ Margin)
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
                    value={configForm.maxOpenPositions ?? 5}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        maxOpenPositions: e.target.value === '' ? ('' as any) : Number(e.target.value),
                      })
                    }
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
                      min="1"
                      max="50"
                      step="0.5"
                      disabled={!isEditing || !configForm.useTrailingStop}
                      value={configForm.trailingStopPercent ?? 7}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          trailingStopPercent: Number(e.target.value) || 7,
                        })
                      }
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

      {/* Column 3: Live Bot Terminal Logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-[520px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Bot Activity Console</h3>
          </div>
          <button
            onClick={onClearLogs}
            className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition"
            title="ล้างบันทึก"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Console Log Window */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 my-3 flex-1 overflow-y-auto space-y-2 font-mono text-[11px] text-slate-300 scrollbar-thin">
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
                    ? 'text-emerald-400'
                    : log.includes('SELL') || log.includes('ขาย')
                    ? 'text-rose-400'
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

        <div className="text-[10px] text-slate-500 flex items-center justify-between">
          <span>ตรวจสอบสัญญาณ CDC ทุกๆ 10 วินาที</span>
          <span>โหมด: {botConfig.mode}</span>
        </div>
      </div>
    </div>
  );
};
