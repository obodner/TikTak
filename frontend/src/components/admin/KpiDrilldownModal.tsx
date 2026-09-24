import React, { useMemo } from 'react';
import { 
  X, 
  Clock, 
  CheckCircle2, 
  MapPin, 
  Eye
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface KpiDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'mttr' | 'first_touch';
  periodLabel: string;
  tickets: any[];
  isEn?: boolean;
  onSelectTicket?: (ticket: any) => void;
  avgValueFormatted?: string;
  totalWorkingDays?: number;
}

export const KpiDrilldownModal: React.FC<KpiDrilldownModalProps> = ({
  isOpen,
  onClose,
  type,
  periodLabel,
  tickets,
  isEn = false,
  onSelectTicket,
  avgValueFormatted,
  totalWorkingDays
}) => {
  if (!isOpen) return null;

  const isMttr = type === 'mttr';
  const title = isMttr
    ? (isEn ? 'Mean Time to Resolution (MTTR) Breakdown' : 'פירוט פניות למדד זמן סגירה ממוצע (MTTR)')
    : (isEn ? 'First-Touch Response Breakdown' : 'פירוט פניות למדד זמן מענה ראשוני');

  const subtitle = isEn
    ? `Detailed tickets contributing to the KPI calculation (${periodLabel})`
    : `הפניות שנכללו בחישוב המדד לתקופה (${periodLabel})`;

  // Sort tickets by ticket number from new to old (descending)
  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const numA = typeof a.ticketNumber === 'number' ? a.ticketNumber : (parseInt(a.ticketNumber, 10) || 0);
      const numB = typeof b.ticketNumber === 'number' ? b.ticketNumber : (parseInt(b.ticketNumber, 10) || 0);
      if (numA !== numB) {
        return numB - numA;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [tickets]);

  const formatDateStr = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return '—';
      return format(d, 'dd/MM/yy HH:mm');
    } catch {
      return '—';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isMttr ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {isMttr ? <Clock size={22} /> : <CheckCircle2 size={22} />}
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-900 leading-tight">
                {title}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
            title={isEn ? 'Close' : 'סגור'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {sortedTickets.length > 0 ? (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs border-collapse min-w-[650px]">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase">
                      <th className="py-3 px-4 text-start">{isEn ? 'Ticket' : 'פנייה'}</th>
                      <th className="py-3 px-4 text-start">{isEn ? 'Summary & Location' : 'תיאור ומיקום'}</th>
                      <th className="py-3 px-3 text-start">{isEn ? 'Created' : 'פתיחה'}</th>
                      <th className="py-3 px-3 text-start">
                        {isMttr ? (isEn ? 'Resolved' : 'סגירה') : (isEn ? 'First Touch' : 'מענה ראשון')}
                      </th>
                      <th className="py-3 px-4 text-center">
                        {isMttr ? (isEn ? 'Working Days' : 'ימי עבודה') : (isEn ? 'Duration' : 'משך מענה')}
                      </th>
                      <th className="py-3 px-3 text-center">{isEn ? 'Action' : 'צפייה'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedTickets.map((t, idx) => {
                      const ticketNum = t.ticketNumber || (t.id ? t.id.slice(0, 5) : idx + 1);
                      const days = typeof t.calculatedDays === 'number' ? t.calculatedDays : 0;
                      
                      let durationText = '—';
                      if (isMttr) {
                        durationText = days === 0 
                          ? (isEn ? '0 (Immediate)' : '0 (מיידי)') 
                          : `${days.toFixed(1)} ${isEn ? 'days' : 'ימים'}`;
                      } else {
                        const mins = typeof t.responseMinutes === 'number' ? t.responseMinutes : 0;
                        durationText = mins < 60 
                          ? `${Math.round(mins)} ${isEn ? 'min' : 'דק\''}` 
                          : `${(mins / 60).toFixed(1)} ${isEn ? 'hrs' : 'שעות'}`;
                      }

                      return (
                        <tr 
                          key={t.id || idx} 
                          className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                          onClick={() => onSelectTicket && onSelectTicket(t)}
                        >
                          {/* Ticket Number & Category */}
                          <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-700">#{ticketNum}</span>
                            </div>
                            <span className="inline-block text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5">
                              {t.category || (isEn ? 'General' : 'כללי')}
                            </span>
                          </td>

                          {/* Summary & Location */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 line-clamp-1 max-w-[240px] text-xs">
                              {t.summary || t.category}
                            </div>
                            {(t.location || t.subLocation) && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 truncate max-w-[240px]">
                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                <span>{[t.location, t.subLocation].filter(Boolean).join(' - ')}</span>
                              </div>
                            )}
                          </td>

                          {/* Created At */}
                          <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                            {formatDateStr(t.createdAt)}
                          </td>

                          {/* Resolved At / First Touch At */}
                          <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                            {isMttr ? (
                              formatDateStr(t.resolvedDate || t.resolvedAt || t.closedAt || t.updatedAt)
                            ) : (
                              <div>
                                <div>{formatDateStr(t.firstTouchTime)}</div>
                                {t.firstTouchType && (
                                  <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded mt-0.5">
                                    {t.firstTouchType}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Duration / Working Days */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black ${
                              isMttr
                                ? days <= 2 ? 'bg-emerald-100 text-emerald-800' : days <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {durationText}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td className="py-3 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => onSelectTicket && onSelectTicket(t)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100/70 rounded-lg transition-colors cursor-pointer"
                              title={isEn ? 'View full ticket' : 'צפה בפרטי הפנייה המלאים'}
                            >
                              <Eye size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              {isEn ? 'No resolved tickets found for this period' : 'לא נמצאו פניות מתאימות בתקופה זו'}
            </div>
          )}
        </div>

        {/* Footer with Calculation Breakdown */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-slate-700">
            <div>
              <span className="text-slate-500 font-medium">{isEn ? 'Sample Size:' : 'מדגם פניות:'}</span>{' '}
              <strong className="font-black text-slate-900">{sortedTickets.length}</strong> {isEn ? 'tickets' : 'פניות'}
            </div>

            {isMttr && typeof totalWorkingDays === 'number' && (
              <div>
                <span className="text-slate-500 font-medium">{isEn ? 'Total Working Days:' : 'סה"כ ימי עבודה:'}</span>{' '}
                <strong className="font-black text-blue-700">{totalWorkingDays.toFixed(1)}</strong>
              </div>
            )}

            {avgValueFormatted && (
              <div className="p-1.5 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs font-extrabold text-slate-900">
                <span className="text-slate-500 font-medium">{isEn ? 'Calculated KPI Average:' : 'ממוצע מחושב:'}</span>{' '}
                <span className={isMttr ? 'text-blue-700 font-black' : 'text-emerald-700 font-black'}>{avgValueFormatted}</span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold transition-all cursor-pointer active:scale-95 ms-auto"
          >
            {isEn ? 'Close' : 'סגור'}
          </button>
        </div>
      </div>
    </div>
  );
};
