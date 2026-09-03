import React, { useState } from 'react';
import { BinanceApiKeys, BotConfig } from '../types';
import { X, Key, Shield, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface BinanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  keys: BinanceApiKeys;
  botConfig: BotConfig;
  onSaveKeys: (newKeys: BinanceApiKeys) => void;
  onSaveConfig: (newConfig: BotConfig) => void;
}

export const BinanceSettingsModal: React.FC<BinanceSettingsModalProps> = ({
  isOpen,
  onClose,
  keys,
  botConfig,
  onSaveKeys,
  onSaveConfig,
}) => {
  const [apiKey, setApiKey] = useState(keys.apiKey);
  const [apiSecret, setApiSecret] = useState(keys.apiSecret);
  const [isTestnet, setIsTestnet] = useState(keys.isTestnet);
  const [marketType, setMarketType] = useState<'SPOT' | 'FUTURES'>(keys.marketType || botConfig.marketType || 'SPOT');
  const [marginType, setMarginType] = useState<'ISOLATED' | 'CROSSED'>(keys.marginType || 'ISOLATED');
  const [tradingMode, setTradingMode] = useState<'PAPER' | 'BINANCE_LIVE'>(botConfig.mode);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    success: boolean;
    message: string;
    canTrade?: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const testConnection = async () => {
    setIsVerifying(true);
    setVerifyStatus(null);
    try {
      const endpoint = marketType === 'FUTURES' ? '/api/binance/futures/account' : '/api/binance/account';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret, isTestnet }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setVerifyStatus({
          success: true,
          message: `เชื่อมต่อบัญชี Binance ${marketType} สัมฤทธิผล! (สิทธิ์การเทรด: ${data.canTrade ? 'พร้อมเทรด 🟢' : 'อ่านอย่างเดียว 🟡'})`,
          canTrade: data.canTrade,
        });
      } else {
        setVerifyStatus({
          success: false,
          message: data.error || 'การเชื่อมต่อล้มเหลว กรุณาตรวจสอบ API Key และ Secret',
        });
      }
    } catch (err: any) {
      setVerifyStatus({
        success: false,
        message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKeys({ apiKey, apiSecret, isTestnet, marketType, marginType });
    onSaveConfig({ ...botConfig, mode: tradingMode, marketType });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl my-auto text-slate-200 overflow-hidden animate-fadeIn">
        {/* Header (Pinned) */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 sm:p-5 shrink-0 bg-slate-900/95">
          <div className="flex items-center space-x-2">
            <Key className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">ตั้งค่าการเชื่อมต่อ Binance API & Mode</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          {/* Scrollable Form Body with Mouse Wheel support */}
          <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto overscroll-contain flex-1">
            {/* Trading Mode Radio */}
            <div className="space-y-2">
              <label className="text-slate-300 font-semibold block">เลือกโหมดการทำงานของ บอท</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTradingMode('PAPER')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                    tradingMode === 'PAPER'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="text-emerald-400 font-bold">🟢 Paper Trading (จำลอง)</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    ใช้เงินจำลอง ($10,000) ไม่มีความเสี่ยง ปลอดภัย 100%
                  </span>
                </button>

              <button
                type="button"
                onClick={() => setTradingMode('BINANCE_LIVE')}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between space-y-1 ${
                  tradingMode === 'BINANCE_LIVE'
                    ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-amber-400 font-bold">⚡ Binance Live/Testnet API</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ส่งคำสั่งซื้อขายจริงเข้า Binance API โดยตรง
                </span>
              </button>
            </div>
          </div>

          {/* Binance Market Type Selector: Spot vs Futures */}
          <div className="space-y-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <label className="text-slate-200 font-bold block">เลือกประเภทตลาด Binance (Market Type)</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMarketType('SPOT')}
                className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between space-y-0.5 ${
                  marketType === 'SPOT'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-emerald-400 font-bold">🛒 Binance Spot</span>
                <span className="text-[10px] text-slate-400">ซื้อขายเหรียญจริง (LONG 1x)</span>
              </button>

              <button
                type="button"
                onClick={() => setMarketType('FUTURES')}
                className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between space-y-0.5 ${
                  marketType === 'FUTURES'
                    ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="text-amber-400 font-bold">⚡ USDT-M Futures</span>
                <span className="text-[10px] text-slate-400">LONG / SHORT & Leverage (1x-10x)</span>
              </button>
            </div>

            {marketType === 'FUTURES' && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400">ประเภท Margin (Futures):</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMarginType('ISOLATED')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold border transition ${
                      marginType === 'ISOLATED'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    ISOLATED (แนะนำ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarginType('CROSSED')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold border transition ${
                      marginType === 'CROSSED'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    CROSSED
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Binance API Key Input */}
          <div className="space-y-1">
            <label className="text-slate-300 font-medium block">Binance API Key</label>
            <input
              type="text"
              placeholder="กรอก API Key จาก Binance..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500"
            />
          </div>

          {/* Binance API Secret Input */}
          <div className="space-y-1">
            <label className="text-slate-300 font-medium block">Binance API Secret Key</label>
            <input
              type="password"
              placeholder="กรอก API Secret..."
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500"
            />
          </div>

          {/* Network Switch: Testnet vs Mainnet */}
          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-200 font-semibold block">ใช้งาน Binance {marketType} Testnet</span>
              <span className="text-[10px] text-slate-500">
                สลับไปใช้ Testnet ({marketType === 'FUTURES' ? 'testnet.binancefuture.com' : 'testnet.binance.vision'}) ทดสอบโดยไม่ใช้เงินจริง
              </span>
            </div>
            <input
              type="checkbox"
              checked={isTestnet}
              onChange={(e) => setIsTestnet(e.target.checked)}
              className="w-4 h-4 text-emerald-500 rounded focus:ring-0"
            />
          </div>

          {/* Verify Connection Button */}
          <button
            type="button"
            onClick={testConnection}
            disabled={isVerifying || !apiKey || !apiSecret}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-semibold transition flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>ทดสอบการเชื่อมต่อ API ({marketType})</span>
          </button>

          {/* Verification Result Message */}
          {verifyStatus && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                verifyStatus.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
              }`}
            >
              {verifyStatus.success ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{verifyStatus.message}</span>
            </div>
          )}
        </div>

        {/* Sticky Footer Action Buttons */}
        <div className="p-4 sm:px-5 border-t border-slate-800/90 bg-slate-950/80 flex justify-end space-x-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-950/50 transition cursor-pointer"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};
