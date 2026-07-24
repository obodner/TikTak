import React from 'react';
import { AlertTriangle, CheckCircle2, Info, AlertCircle } from 'lucide-react';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: ConfirmType;
  isEn?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  type = 'warning',
  isEn = false
}) => {
  if (!isOpen) return null;

  const defaultLabels = {
    confirm: isEn ? 'Confirm' : 'אישור',
    cancel: isEn ? 'Cancel' : 'ביטול',
  };

  const icons = {
    danger: <AlertTriangle className="text-red-600" size={24} />,
    warning: <AlertCircle className="text-amber-600" size={24} />,
    info: <Info className="text-blue-600" size={24} />,
    success: <CheckCircle2 className="text-blue-600" size={24} />,
  };

  const colors = {
    danger: 'bg-red-50 text-red-700 border-red-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    info: 'bg-blue-50 text-blue-700 border-blue-100',
    success: 'bg-blue-50 text-blue-700 border-blue-100',
  };

  const buttonColors = {
    danger: 'bg-red-600 hover:bg-red-700 shadow-red-100',
    warning: 'bg-amber-600 hover:bg-amber-700 shadow-amber-100',
    info: 'bg-blue-600 hover:bg-blue-700 shadow-blue-100',
    success: 'bg-blue-600 hover:bg-blue-700 shadow-blue-100',
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />

      {/* Modal Content */}
      <div 
        className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl border ${colors[type]} shrink-0`}>
              {icons[type]}
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed font-medium">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          {onConfirm && (
            <>
              <button 
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
              >
                {cancelLabel || defaultLabels.cancel}
              </button>
              <button 
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`px-6 py-2 text-xs font-black text-white rounded-lg transition-all shadow-lg active:scale-95 ${buttonColors[type]}`}
              >
                {confirmLabel || defaultLabels.confirm}
              </button>
            </>
          )}
          {!onConfirm && (
            <button 
              onClick={onClose}
              className={`px-6 py-2 text-xs font-black text-white rounded-lg transition-all shadow-lg active:scale-95 ${buttonColors[type]}`}
            >
              {confirmLabel || defaultLabels.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
