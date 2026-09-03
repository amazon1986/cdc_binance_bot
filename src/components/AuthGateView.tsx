import React, { useState, useEffect } from 'react';
import { AuthUser } from '../types';
import { Lock, User, KeyRound, Eye, EyeOff, ShieldCheck, LogIn, Cpu, BellRing, TrendingUp } from 'lucide-react';

interface AuthGateViewProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const AuthGateView: React.FC<AuthGateViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('amazon1986');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [configuredUser, setConfiguredUser] = useState('amazon1986');

  // Load configured username from server's .env
  useEffect(() => {
    fetch('/api/auth/info')
      .then((r) => r.json())
      .then((data) => {
        if (data?.username) {
          setConfiguredUser(data.username);
          setUsername(data.username);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setErrorMsg('กรุณากรอกชื่อผู้ใช้งาน (Username)');
      return;
    }
    if (!cleanPass) {
      setErrorMsg('กรุณากรอกรหัสผ่าน (Password)');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setIsLoading(false);
        setErrorMsg(data.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        return;
      }

      const userObj: AuthUser = data.user || {
        username: cleanUser,
        name: cleanUser === 'amazon1986' ? 'Amazon Quantitative Trader' : cleanUser,
        role: 'admin',
        loginTime: Date.now(),
      };

      if (rememberMe) {
        localStorage.setItem('cdc_auth_session', JSON.stringify(userObj));
      } else {
        sessionStorage.setItem('cdc_auth_session', JSON.stringify(userObj));
      }

      setIsLoading(false);
      onLoginSuccess(userObj);
    } catch {
      setIsLoading(false);
      setErrorMsg('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="min-h-[92vh] flex flex-col items-center justify-center py-6 px-4">
      {/* Container Box */}
      <div className="w-full max-w-md bg-slate-900/95 border border-slate-800/90 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden animate-fadeIn">
        {/* Top Header Decorator */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-7 text-center border-b border-slate-800/80">
          <div className="inline-flex p-3.5 bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 rounded-2xl text-emerald-400 shadow-lg shadow-emerald-950/50 mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-white tracking-wide">
            เข้าสู่ระบบ CDC Action Zone V2
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            ระบบความปลอดภัยสำหรับบริหารจัดการพอร์ตและบอทเทรด Binance อัตโนมัติ 24/7
          </p>

          <div className="inline-flex items-center space-x-1.5 mt-3 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">Server Status: Online 24/7</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2.5">
              <Lock className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              ชื่อผู้ใช้งาน (Username)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="เช่น amazon1986"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono transition"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านของคุณ"
                className="w-full pl-10 pr-11 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono transition"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-xs text-slate-400">จดจำการเข้าสู่ระบบในเครื่องนี้</span>
            </label>
            <span className="text-[11px] text-emerald-400 font-mono">Status: Locked 🔒</span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-950/50 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="animate-pulse">กำลังตรวจสอบข้อมูล...</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบ (Login)</span>
              </>
            )}
          </button>

          {/* Helper Hint */}
          <div className="pt-2 border-t border-slate-800 text-center space-y-1">
            <p className="text-[11px] text-slate-400">
              ชื่อผู้ใช้เริ่มต้น: <b className="text-white font-mono">{configuredUser}</b>
            </p>
            <p className="text-[10px] text-slate-500">
              💡 กำหนดรหัสผ่านได้ที่ไฟล์ <code className="text-emerald-400 font-mono">.env</code> (AUTH_PASSWORD)
            </p>
          </div>
        </form>
      </div>

      {/* Feature Highlights beneath */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 max-w-md w-full text-center">
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col items-center space-y-1">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-semibold text-slate-300">CDC Action Zone V2</span>
          <span className="text-[10px] text-slate-500">สัญญาณแท่งเทียนแท้ลุงโฉลก</span>
        </div>
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col items-center space-y-1">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-300">บอทเทรด Binance 24/7</span>
          <span className="text-[10px] text-slate-500">Long & Short อัตโนมัติ</span>
        </div>
        <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col items-center space-y-1">
          <BellRing className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] font-semibold text-slate-300">Telegram Alert</span>
          <span className="text-[10px] text-slate-500">แจ้งเตือนคำสั่งซื้อขายทันที</span>
        </div>
      </div>
    </div>
  );
};
