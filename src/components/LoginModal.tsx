import React, { useState, useEffect } from 'react';
import { AuthUser } from '../types';
import { X, Lock, User, Eye, EyeOff, ShieldCheck, LogIn, KeyRound } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('amazon1986');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [configuredUser, setConfiguredUser] = useState('amazon1986');

  // Load configured username from server's .env if available
  useEffect(() => {
    if (isOpen) {
      fetch('/api/auth/info')
        .then((r) => r.json())
        .then((data) => {
          if (data?.username) {
            setConfiguredUser(data.username);
            setUsername((prev) => (prev ? prev : data.username));
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
      onClose();
    } catch {
      setIsLoading(false);
      setErrorMsg('ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleQuickFill = () => {
    setUsername(configuredUser);
    setErrorMsg('พิมพ์รหัสผ่านที่คุณตั้งไว้ในไฟล์ .env (AUTH_PASSWORD) แล้วกดเข้าสู่ระบบ');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header Decorator */}
        <div className="bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-blue-600/30 p-6 border-b border-slate-800 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3">
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-400 shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                เข้าสู่ระบบ CDC Binance Bot
              </h2>
              <p className="text-xs text-slate-400">
                ระบบจัดการและบริหารพอร์ตอัตโนมัติ 24/7
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 animate-shake">
              <Lock className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Username */}
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
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                required
              />
            </div>
          </div>

          {/* Password */}
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
                className="w-full pl-10 pr-11 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
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

          {/* Options: Remember Me */}
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
            <span className="text-[11px] text-emerald-400 font-mono">Status: Secure 🔒</span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-emerald-950/40 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="animate-pulse">กำลังเข้าสู่ระบบ...</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบ (Login)</span>
              </>
            )}
          </button>

          {/* Info Hint */}
          <div className="pt-2 border-t border-slate-800 text-center space-y-1">
            <button
              type="button"
              onClick={handleQuickFill}
              className="text-xs text-slate-400 hover:text-emerald-400 transition cursor-pointer"
            >
              กรอก Username: <b className="text-white font-mono">{configuredUser}</b> อัตโนมัติ
            </button>
            <p className="text-[10px] text-slate-500">
              💡 ตั้งค่า Username & Password ได้อิสระที่ไฟล์ <code className="text-emerald-400">.env</code>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
