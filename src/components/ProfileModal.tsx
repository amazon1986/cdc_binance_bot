import React from 'react';
import { AuthUser } from '../types';
import { X, User, Shield, LogOut, CheckCircle2, Clock, Globe } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: AuthUser;
  onLogout: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  authUser,
  onLogout,
}) => {
  if (!isOpen) return null;

  const loginDate = authUser.loginTime ? new Date(authUser.loginTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-blue-600/30 p-6 border-b border-slate-800 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner text-2xl font-bold font-mono">
              <User className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {authUser.username}
                </h2>
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Online</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">{authUser.name}</p>
            </div>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
              <span className="text-slate-400 flex items-center space-x-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>ระดับสิทธิ์ (Role):</span>
              </span>
              <span className="font-semibold text-white bg-slate-700 px-2 py-0.5 rounded">
                ผู้ดูแลระบบ (Admin)
              </span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
              <span className="text-slate-400 flex items-center space-x-1.5">
                <Globe className="w-4 h-4 text-cyan-400" />
                <span>แพลตฟอร์มที่เชื่อมต่อ:</span>
              </span>
              <span className="font-mono text-cyan-300 font-medium">
                Binance (Spot & Futures)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>เข้าสู่ระบบเมื่อ:</span>
              </span>
              <span className="font-mono text-slate-300">
                {loginDate}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center space-x-3">
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="flex-1 py-2.5 px-4 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 hover:text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>ออกจากระบบ (Logout)</span>
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold rounded-xl text-xs transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
