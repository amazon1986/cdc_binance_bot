import React, { useState, useEffect } from 'react';
import { TelegramConfig } from '../types';
import {
  X,
  Send,
  Bell,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { testTelegramNotification } from '../lib/botApi';

interface TelegramSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TelegramConfig;
  onSave: (newConfig: TelegramConfig) => Promise<void> | void;
}

export const TelegramSettingsModal: React.FC<TelegramSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [botToken, setBotToken] = useState(config.botToken || '');
  const [chatId, setChatId] = useState(config.chatId || '');
  const [enabled, setEnabled] = useState(config.enabled ?? false);
  const [notifyOnBuy, setNotifyOnBuy] = useState(config.notifyOnBuy ?? true);
  const [notifyOnSell, setNotifyOnSell] = useState(config.notifyOnSell ?? true);
  const [notifyOnSignal, setNotifyOnSignal] = useState(config.notifyOnSignal ?? true);
  const [notifyOnBotStatus, setNotifyOnBotStatus] = useState(config.notifyOnBotStatus ?? true);

  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Sync initial state whenever modal opens or config updates
  useEffect(() => {
    if (isOpen) {
      setBotToken(config.botToken || '');
      setChatId(config.chatId || '');
      setEnabled(config.enabled ?? false);
      setNotifyOnBuy(config.notifyOnBuy ?? true);
      setNotifyOnSell(config.notifyOnSell ?? true);
      setNotifyOnSignal(config.notifyOnSignal ?? true);
      setNotifyOnBotStatus(config.notifyOnBotStatus ?? true);
      setTestResult(null);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setTestResult({
        success: false,
        message: 'กรุณากรอก Telegram Bot Token และ Chat ID ก่อนกดทดสอบ',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testTelegramNotification({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
      });

      if (res.success) {
        setTestResult({
          success: true,
          message: 'ส่งข้อความทดสอบสำเร็จ! ตรวจสอบข้อความในแอป Telegram ของคุณได้เลย 🚀',
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'ไม่สามารถส่งข้อความได้ กรุณาตรวจสอบ Bot Token และ Chat ID (และกด Start กับบอทก่อน)',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Telegram API',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: TelegramConfig = {
      botToken: botToken.trim(),
      chatId: chatId.trim(),
      enabled,
      notifyOnBuy,
      notifyOnSell,
      notifyOnSignal,
      notifyOnBotStatus,
    };
    await onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-8 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-sky-500 to-blue-600 rounded-xl text-white shadow-md">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                ตั้งค่าระบบแจ้งเตือนผ่าน Telegram Bot
              </h3>
              <p className="text-[11px] text-slate-400">
                รับการแจ้งเตือนสัญญาณเทรดและการเข้า/ออกออเดอร์แบบเรียลไทม์ 24 ชม.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Enable/Disable Toggle Card */}
        <div
          onClick={() => setEnabled(!enabled)}
          className={`cursor-pointer p-4 rounded-xl border transition flex items-center justify-between ${
            enabled
              ? 'bg-sky-500/10 border-sky-500/40 text-white'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`p-2 rounded-lg ${
                enabled ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm flex items-center gap-2">
                เปิดระบบแจ้งเตือน Telegram
                {enabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                    ACTIVE 🟢
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                เมื่อเปิดใช้งาน เซิร์ฟเวอร์จะส่งข้อความแจ้งเตือนไปยัง Telegram ของคุณอัตโนมัติ
              </p>
            </div>
          </div>

          <div>
            {enabled ? (
              <ToggleRight className="w-8 h-8 text-sky-400 fill-current" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-slate-600" />
            )}
          </div>
        </div>

        {/* Setup Guide Toggle */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-sky-400 hover:text-sky-300 transition"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              วิธีสร้าง Telegram Bot และหา Chat ID (3 ขั้นตอนง่ายๆ)
            </span>
            <span className="text-[11px] text-slate-400">{showGuide ? 'ซ่อนคำแนะนำ ▲' : 'ดูคำแนะนำ ▼'}</span>
          </button>

          {showGuide && (
            <div className="p-4 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300 space-y-2.5 bg-slate-950/90">
              <div className="space-y-1">
                <p className="font-bold text-amber-400">1. สร้าง Telegram Bot:</p>
                <p className="text-slate-400">
                  ค้นหา <span className="text-sky-400 font-mono font-bold">@BotFather</span> ใน Telegram
                  แล้วพิมพ์คำสั่ง <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded">/newbot</span> เพื่อสร้างบอท
                  จากนั้นคัดลอก <b>HTTP API Token</b> มาใส่ในช่อง Bot Token ด้านล่าง
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-amber-400">2. หา Telegram Chat ID ของคุณ:</p>
                <p className="text-slate-400">
                  ค้นหา <span className="text-sky-400 font-mono font-bold">@userinfobot</span> หรือ{' '}
                  <span className="text-sky-400 font-mono font-bold">@GetIDsBot</span> ใน Telegram แล้วกด Start
                  เพื่อดูตัวเลข <b>Id</b> ของคุณ (เช่น <code>123456789</code>)
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-amber-400">3. เริ่มต้นแชทกับบอทของคุณ:</p>
                <p className="text-slate-400">
                  ⚠️ <b>สำคัญมาก:</b> ต้องกดค้นหาชื่อบอทที่คุณสร้างไว้ แล้วกดปุ่ม <b>START</b> ในแชทก่อน
                  เพื่อให้บอทมีสิทธิ์ส่งข้อความหาคุณได้ จากนั้นกด <b>"ทดสอบส่งข้อความ"</b> ในหน้านี้
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Bot Token Input */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold block flex items-center justify-between">
              <span>Telegram Bot Token</span>
              <span className="text-[10px] text-slate-500 font-normal">ได้จาก @BotFather</span>
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                placeholder="เช่น 1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ..."
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 pr-10 text-white font-mono text-xs focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Chat ID Input */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold block flex items-center justify-between">
              <span>Telegram Chat ID / Group ID</span>
              <span className="text-[10px] text-slate-500 font-normal">ได้จาก @userinfobot</span>
            </label>
            <input
              type="text"
              placeholder="เช่น 123456789 หรือ -1001234567890 (สำหรับกลุ่ม/แชนแนล)"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono text-xs focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Granular Notification Triggers */}
          <div className="space-y-2.5 pt-1">
            <label className="text-slate-300 font-bold block text-xs">
              เลือกประเภทเหตุการณ์ที่ต้องการรับการแจ้งเตือน
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={notifyOnBuy}
                  onChange={(e) => setNotifyOnBuy(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-emerald-400 block">🟢 เปิดออเดอร์ใหม่</span>
                  <span className="text-[10px] text-slate-400">Buy / Long / Short orders</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={notifyOnSell}
                  onChange={(e) => setNotifyOnSell(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-rose-400 block">🛑 ปิดออเดอร์ / TP / SL</span>
                  <span className="text-[10px] text-slate-400">Take Profit, Stop Loss, Exit</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={notifyOnSignal}
                  onChange={(e) => setNotifyOnSignal(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-sky-400 block">📡 สัญญาณ CDC Action Zone</span>
                  <span className="text-[10px] text-slate-400">จุดตัด Golden/Dead Cross</span>
                </div>
              </label>

              <label className="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={notifyOnBotStatus}
                  onChange={(e) => setNotifyOnBotStatus(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-semibold text-amber-400 block">⚙️ สถานะระบบบอท</span>
                  <span className="text-[10px] text-slate-400">Start / Stop / Config change</span>
                </div>
              </label>
            </div>
          </div>

          {/* Test Button & Result Feedback */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !botToken.trim() || !chatId.trim()}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white border border-sky-500/30 rounded-xl font-bold transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className={`w-3.5 h-3.5 ${isTesting ? 'animate-bounce' : ''}`} />
              <span>{isTesting ? 'กำลังทดสอบส่งข้อความ...' : '🧪 ทดสอบส่งข้อความแจ้งเตือน (Test Alert)'}</span>
            </button>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start space-x-2.5 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <div className="leading-relaxed">{testResult.message}</div>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-sky-600/30 transition"
            >
              บันทึกการตั้งค่า Telegram
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
