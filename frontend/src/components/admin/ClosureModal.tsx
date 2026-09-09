import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Copy, ExternalLink, HelpCircle, Ban, Send } from 'lucide-react';

interface ClosureReason {
  id: string;
  labelHe: string;
  labelEn: string;
  icon: React.ReactNode;
  color: string;
}

interface ClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: {
    id: string;
    category: string;
    summary: string;
  } | null;
  onConfirm: (ticketId: string, reasonId: string, notes: string) => Promise<void>;
  isEn: boolean;
}

const REASONS: ClosureReason[] = [
  { id: 'fixed', labelHe: 'טופל', labelEn: 'Fixed', icon: <CheckCircle2 size={16} />, color: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'duplicate', labelHe: 'כפילות', labelEn: 'Duplicate', icon: <Copy size={16} />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'irrelevant', labelHe: 'לא רלוונטי', labelEn: 'Irrelevant', icon: <HelpCircle size={16} />, color: 'bg-slate-50 text-slate-700 border-slate-200' },
  { id: 'vendor', labelHe: 'בטיפול ספק', labelEn: 'Vendor Dispatched', icon: <ExternalLink size={16} />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'outside', labelHe: 'מחוץ לאחריות', labelEn: 'Outside Scope', icon: <AlertCircle size={16} />, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'rejected', labelHe: 'נדחה', labelEn: 'Rejected', icon: <Ban size={16} />, color: 'bg-red-50 text-red-700 border-red-200' },
];

export const ClosureModal: React.FC<ClosureModalProps> = ({
  isOpen,
  onClose,
  ticket,
  onConfirm,
  isEn
}) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(null);
      setNotes('');
    }
  }, [isOpen, ticket?.id]);

  if (!isOpen || !ticket) return null;

  const isReasonRequired = selectedReason === 'duplicate' || selectedReason === 'outside';
  const canSubmit = Boolean(selectedReason && (!isReasonRequired || notes.trim().length > 0));

  const labels = {
    title: isEn ? 'Close Ticket' : 'סגירת פנייה',
    subtitle: isEn ? 'Select closure reason' : 'בחרו את סיבת הסגירה',
    notesLabel: isEn ? 'Notes / Details' : 'הערות / פירוט',
    placeholder: isReasonRequired
      ? (isEn ? 'Please specify reason (required)...' : 'נא לפרט את סיבת הסגירה (שדה חובה)...')
      : (isEn ? 'Optional notes...' : 'הערות נוספות (אופציונלי)...'),
    requiredWarning: isEn ? 'Reason is required for this closure type' : 'חובה להזין פירוט עבור סיבת סגירה זו',
    confirm: isEn ? 'Close Ticket' : 'סגור פנייה',
    cancel: isEn ? 'Cancel' : 'ביטול',
  };

  const handleSelectReason = (reasonId: string) => {
    setSelectedReason(reasonId);
    if (reasonId === 'duplicate' || reasonId === 'outside') {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onConfirm(ticket.id, selectedReason!, notes.trim());
      setSelectedReason(null);
      setNotes('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-green-600" size={20} />
            <div>
              <h2 className="font-bold text-slate-900">{labels.title}</h2>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{ticket.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6">
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 px-1">{labels.subtitle}</h3>
            <div className="grid grid-cols-2 gap-3">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectReason(r.id)}
                  className={`
                    flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-sm font-bold
                    ${selectedReason === r.id
                      ? `${r.color} ring-2 ring-blue-500/20`
                      : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'
                    }
                  `}
                >
                  <span className={selectedReason === r.id ? 'opacity-100' : 'opacity-40'}>
                    {r.icon}
                  </span>
                  {isEn ? r.labelEn : r.labelHe}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <label className="text-xs font-bold text-slate-700">
                {labels.notesLabel}
                {isReasonRequired && (
                  <span className="text-red-500 font-bold ms-1 text-[11px]">
                    * ({isEn ? 'Required' : 'חובה'})
                  </span>
                )}
              </label>
            </div>
            <textarea
              ref={textareaRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={labels.placeholder}
              className={`w-full bg-slate-50 border rounded-xl p-3 text-sm focus:ring-2 outline-none transition-all resize-none min-h-[90px] ${isReasonRequired && !notes.trim()
                  ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-100 bg-amber-50/20'
                  : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                }`}
            />
            {isReasonRequired && !notes.trim() && (
              <p className="text-[11px] text-amber-600 font-medium px-1 mt-1 flex items-center gap-1">
                <span>⚠️</span>
                <span>{labels.requiredWarning}</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-white rounded-lg transition-colors"
          >
            {labels.cancel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit || loading}
            title={!canSubmit && isReasonRequired ? labels.requiredWarning : undefined}
            className={`
              px-6 py-2.5 text-xs font-black rounded-xl transition-all shadow-md flex items-center gap-2
              ${canSubmit
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 cursor-pointer'
                : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'
              }
            `}
          >
            <Send size={14} />
            {loading ? '...' : labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
};
