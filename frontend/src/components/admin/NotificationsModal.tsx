import React, { useEffect } from 'react';
import { X, Bell, CheckCircle2 } from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEn?: boolean;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  isEn = false
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative w-full max-w-md bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEn ? 'Notifications' : 'התראות מערכת'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEn ? 'Building alert center' : 'מרכז עדכוני המבנה'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            aria-label={isEn ? 'Close' : 'סגור'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body - Empty State */}
        <div className="p-8 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-4 text-slate-400">
            <CheckCircle2 size={32} />
          </div>
          <h4 className="text-lg font-bold text-slate-100 mb-1">
            {isEn ? 'All caught up!' : 'אין התראות חדשות'}
          </h4>
          <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
            {isEn 
              ? 'There are no active system alerts or notifications for this building right now.' 
              : 'כרגע אין התראות דחופות או הודעות מערכת חדשות עבור המבנה שלך.'}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/40 border-t border-slate-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700"
          >
            {isEn ? 'Close' : 'סגור'}
          </button>
        </div>
      </div>
    </div>
  );
};
