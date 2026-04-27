import React, { useState, useEffect, useRef } from 'react';
import { Send, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VoiceRecorder } from './VoiceRecorder';

interface TicketData {
  summary: string;
  category: string;
  location?: string;
  subLocation?: string;
  urgency: 'High' | 'Moderate' | 'Low';
  ticketType: 'visible' | 'hidden';
  audioBase64?: string;
}

interface ReportingFormProps {
  initialData: TicketData;
  onSend: (finalSummary: string) => void;
  onUpdate: (updates: Partial<TicketData>) => void;
  config: {
    locations: string[];
    subLocations: string[];
    categories: string[];
    uiConfig?: {
      locationLabel?: string;
      subLocationLabel?: string;
      showLocation?: boolean;
    };
  };
  status: 'editing' | 'sending' | 'success' | 'error';
  errorType?: 'rate-limit';
}

export const ReportingForm: React.FC<ReportingFormProps> = ({ 
  initialData, 
  onSend,
  onUpdate,
  config,
  status,
  errorType
}) => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(initialData.summary);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const locationLabel = config.uiConfig?.locationLabel || t('floor');
  const subLocationLabel = config.uiConfig?.subLocationLabel || t('resource');
  const showLocation = config.uiConfig?.showLocation !== false;

  useEffect(() => {
    if (status === 'editing' && textAreaRef.current) {
      textAreaRef.current.focus();
      const length = textAreaRef.current.value.length;
      textAreaRef.current.setSelectionRange(length, length);
    }
  }, [status]);

  const MAX_CHARS = 250;

  const isFormValid = summary.trim().length > 0 
    && initialData.category !== '' 
    && (showLocation 
      ? (!!initialData.location || !!initialData.subLocation) 
      : !!initialData.subLocation);

  const handleSubmit = () => {
    if (!isFormValid) return;
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
    onSend(summary);
  };

  const clearText = () => {
    setSummary('');
    textAreaRef.current?.focus();
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 animate-in zoom-in duration-300">
        <CheckCircle2 size={80} className="text-green-500" />
        <h2 className="text-2xl font-black text-blue-900">{t('success')}</h2>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-red-500">
        <AlertCircle size={80} />
        <h2 className="text-2xl font-black text-red-600">
          {errorType === 'rate-limit' ? t('rate_limit_error') : t('error')}
        </h2>
        <button 
          onClick={() => window.location.reload()}
          className="bg-red-500 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all"
        >
          {t('try_again')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-100 relative">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-black text-blue-900/40 block">
            {t('editing')}
          </label>
          <button 
            onClick={clearText} 
            className="text-slate-400 hover:text-red-500 transition-colors p-1"
            title="נקה תיאור"
            aria-label="Clear contents"
          >
            <X size={20} />
          </button>
        </div>
        
        <textarea
          ref={textAreaRef}
          value={summary}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CHARS) setSummary(e.target.value);
          }}
          maxLength={MAX_CHARS}
          className="w-full text-xl font-bold text-blue-900 border-none focus:ring-0 p-0 resize-none min-h-[100px] outline-none mb-1"
          placeholder={t('summary_placeholder') || 'סיכום התקלה...'}
          dir="rtl"
        />
        <div className="flex justify-between items-center mb-4">
          <span className={`text-xs font-bold ${summary.length >= MAX_CHARS ? 'text-red-500' : 'text-slate-300'}`}>
            {summary.length}/{MAX_CHARS}
          </span>
          
          <VoiceRecorder 
            onRecordingComplete={(base64) => onUpdate({ audioBase64: base64 })}
            onDelete={() => onUpdate({ audioBase64: undefined })}
          />
        </div>

        {/* Editable Context Area */}
        <div className="space-y-4 pt-4 border-t border-slate-50">
          <div className="grid grid-cols-2 gap-3">
            {showLocation && (
              <div className="relative">
                <label className="text-[10px] font-black text-blue-900/40 uppercase block mb-1 px-1">{locationLabel}</label>
                <select
                  value={initialData.location || ''}
                  onChange={(e) => onUpdate({ location: e.target.value })}
                  className={`w-full bg-slate-50 border-none rounded-xl px-3 py-2.5 appearance-none font-bold text-sm outline-none text-right ${
                    !initialData.location ? 'text-slate-400' : 'text-blue-900'
                  }`}
                  dir="rtl"
                >
                  <option value="">{t('select_placeholder', { label: locationLabel })}</option>
                  {config.locations.map(f => <option key={f} value={f}>{f.startsWith('-') || !isNaN(Number(f)) ? `\u200E${f}` : f}</option>)}
                </select>
                <ChevronDown size={14} className="absolute left-3 top-[34px] text-slate-400 pointer-events-none" />
              </div>
            )}

            <div className={`relative ${!showLocation ? 'col-span-2' : ''}`}>
              <label className="text-[10px] font-black text-blue-900/40 uppercase block mb-1 px-1">{subLocationLabel}</label>
              <select
                value={initialData.subLocation || ''}
                onChange={(e) => onUpdate({ subLocation: e.target.value })}
                className={`w-full bg-slate-50 border-none rounded-xl px-3 py-2.5 appearance-none font-bold text-sm outline-none text-right ${
                  !initialData.subLocation ? 'text-slate-400' : 'text-blue-900'
                }`}
                dir="rtl"
              >
                <option value="">{t('select_placeholder', { label: subLocationLabel })}</option>
                {config.subLocations.map(r => <option key={r} value={r}>{r.startsWith('-') || !isNaN(Number(r)) ? `\u200E${r}` : r}</option>)}
              </select>
              <ChevronDown size={14} className="absolute left-3 top-[34px] text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="relative">
            <label className="text-[10px] font-black text-blue-900/40 uppercase block mb-1 px-1">{t('category_label') || 'קטגוריה'}</label>
            <select
              value={initialData.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              className={`w-full bg-blue-50/50 border-none rounded-xl px-3 py-2.5 appearance-none font-bold text-sm outline-none text-right ${
                initialData.category === '' ? 'text-slate-400' : 'text-blue-700'
              }`}
              dir="rtl"
            >
              {initialData.category === '' && (
                <option value="" disabled>{t('select_category') || 'בחר קטגוריה...'}</option>
              )}
              {config.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="absolute left-3 top-[34px] text-blue-400 pointer-events-none" />
          </div>

          <div>
            <label className="text-[10px] font-black text-blue-900/40 uppercase block mb-2 px-1">{t('urgency_label') || 'דחיפות הדיווח'}</label>
            <div className="flex gap-2" dir="rtl">
              {(['High', 'Moderate', 'Low'] as const).map((level) => {
                const isActive = initialData.urgency === level;
                const labels = { High: 'דחוף', Moderate: 'רגיל', Low: 'נמוך' };
                const colors = {
                  High: isActive ? 'bg-red-500 text-white ring-red-200 shadow-lg' : 'bg-red-50 text-red-600 hover:bg-red-100',
                  Moderate: isActive ? 'bg-amber-500 text-white ring-amber-200 shadow-lg' : 'bg-amber-50 text-amber-600 hover:bg-amber-100',
                  Low: isActive ? 'bg-green-500 text-white ring-green-200 shadow-lg' : 'bg-green-50 text-green-600 hover:bg-green-100',
                };

                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onUpdate({ urgency: level })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm ${colors[level]} ${isActive ? 'ring-4 scale-105 z-10' : ''}`}
                  >
                    {labels[level]}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={status === 'sending' || !isFormValid}
        className={`
          flex items-center justify-center gap-3
          w-full h-16 rounded-2xl font-extrabold text-xl
          transition-all
          ${status === 'sending' || !isFormValid
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
            : 'bg-[#25D366] text-white active:scale-95 shadow-[0_8px_20px_rgba(37,211,102,0.3)] hover:bg-[#20bd5a] hover:shadow-[0_12px_25px_rgba(37,211,102,0.4)]'
          }
        `}
      >
        <Send size={24} />
        {status === 'sending' ? (t('sending') || 'שולח...') : t('send')}
      </button>
    </div>
  );
};

