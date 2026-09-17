import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Check, X } from 'lucide-react';
import { startOfMonth, endOfMonth, isAfter, isBefore } from 'date-fns';

interface MonthYearRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
  onClose?: () => void;
  isEn?: boolean;
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const ENGLISH_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const MonthYearRangePicker: React.FC<MonthYearRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  onClose,
  isEn = false
}) => {
  const months = isEn ? ENGLISH_MONTHS : HEBREW_MONTHS;

  const [activeTab, setActiveTab] = useState<'start' | 'end'>('start');
  
  // Temporary state while picking before applying
  const [tempStart, setTempStart] = useState<Date>(startOfMonth(startDate));
  const [tempEnd, setTempEnd] = useState<Date>(endOfMonth(endDate));

  // Current year view for the active tab
  const [viewYearStart, setViewYearStart] = useState<number>(startDate.getFullYear());
  const [viewYearEnd, setViewYearEnd] = useState<number>(endDate.getFullYear());

  const currentViewYear = activeTab === 'start' ? viewYearStart : viewYearEnd;
  const setViewYear = activeTab === 'start' ? setViewYearStart : setViewYearEnd;

  const handleSelectMonth = (monthIndex: number) => {
    if (activeTab === 'start') {
      const newStart = startOfMonth(new Date(viewYearStart, monthIndex, 1));
      setTempStart(newStart);
      // If new start is after current end, adjust end to match or be end of that month
      if (isAfter(newStart, tempEnd)) {
        setTempEnd(endOfMonth(newStart));
        setViewYearEnd(viewYearStart);
      }
      // Auto-switch to end month tab for smooth flow
      setActiveTab('end');
    } else {
      const newEnd = endOfMonth(new Date(viewYearEnd, monthIndex, 1));
      // If new end is before current start, adjust start to match
      if (isBefore(newEnd, tempStart)) {
        setTempStart(startOfMonth(newEnd));
        setViewYearStart(viewYearEnd);
      }
      setTempEnd(newEnd);
    }
  };

  const handleApply = () => {
    onChange(tempStart, tempEnd);
    if (onClose) onClose();
  };

  return (
    <div 
      className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 w-[310px] sm:w-[340px] z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800"
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={e => e.stopPropagation()}
    >
      {/* Header with Title & Close */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Calendar size={16} />
          </div>
          <span className="font-extrabold text-sm text-slate-900">
            {isEn ? 'Select Month Range' : 'בחירת טווח חודשים'}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Start / End Tabs */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-4 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('start')}
          className={`py-2 px-3 rounded-lg transition-all text-center ${
            activeTab === 'start'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">
            {isEn ? 'From Month' : 'מחודש'}
          </div>
          <div className="font-black text-xs text-slate-800">
            {months[tempStart.getMonth()]} {tempStart.getFullYear()}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('end')}
          className={`py-2 px-3 rounded-lg transition-all text-center ${
            activeTab === 'end'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">
            {isEn ? 'To Month' : 'עד חודש'}
          </div>
          <div className="font-black text-xs text-slate-800">
            {months[tempEnd.getMonth()]} {tempEnd.getFullYear()}
          </div>
        </button>
      </div>

      {/* Year Navigation Bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          type="button"
          onClick={() => setViewYear(prev => isEn ? prev - 1 : prev + 1)}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          title={isEn ? 'Previous Year' : 'שנה קודמת'}
        >
          <ChevronRight size={16} className={isEn ? 'rotate-180' : ''} />
        </button>

        <span className="font-black text-base text-slate-900">
          {currentViewYear}
        </span>

        <button
          type="button"
          onClick={() => setViewYear(prev => isEn ? prev + 1 : prev - 1)}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          title={isEn ? 'Next Year' : 'שנה הבאה'}
        >
          <ChevronLeft size={16} className={isEn ? 'rotate-180' : ''} />
        </button>
      </div>

      {/* 12-Month Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {months.map((mName, idx) => {
          const monthStart = startOfMonth(new Date(currentViewYear, idx, 1));
          const monthEnd = endOfMonth(new Date(currentViewYear, idx, 1));

          const isStart = tempStart.getFullYear() === currentViewYear && tempStart.getMonth() === idx;
          const isEnd = tempEnd.getFullYear() === currentViewYear && tempEnd.getMonth() === idx;
          const isInRange = monthStart >= tempStart && monthEnd <= tempEnd;

          let btnClass = 'bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200/60';
          if (isStart && isEnd) {
            btnClass = 'bg-blue-600 text-white font-black shadow-md border-blue-600';
          } else if (isStart) {
            btnClass = 'bg-blue-600 text-white font-black shadow-sm border-blue-600';
          } else if (isEnd) {
            btnClass = 'bg-blue-600 text-white font-black shadow-sm border-blue-600';
          } else if (isInRange) {
            btnClass = 'bg-blue-50 text-blue-700 font-bold border-blue-200';
          }

          return (
            <button
              key={mName}
              type="button"
              onClick={() => handleSelectMonth(idx)}
              className={`py-2 px-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer font-bold ${btnClass}`}
            >
              {mName}
            </button>
          );
        })}
      </div>

      {/* Selected Summary & Apply Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-slate-500 truncate">
          {months[tempStart.getMonth()]} {tempStart.getFullYear()} – {months[tempEnd.getMonth()]} {tempEnd.getFullYear()}
        </div>

        <button
          type="button"
          onClick={handleApply}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
        >
          <Check size={14} />
          <span>{isEn ? 'Apply' : 'החל'}</span>
        </button>
      </div>
    </div>
  );
};
