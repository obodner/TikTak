import React, { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Phone, 
  Calendar, 
  MessageSquare, 
  Share2, 
  Flame, 
  Clock, 
  User, 
  Maximize2, 
  Minimize2,
  Volume2,
  Camera,
  Briefcase,
  CheckCircle2,
  CheckCheck,
  Send
} from 'lucide-react';
import heJson from '../../locales/he.json';
import enJson from '../../locales/en.json';

export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'dismissed' | 'backlog';

export interface Ticket {
  id: string;
  ticketNumber?: number;
  category: string;
  status: TicketStatus;
  urgency: 'High' | 'Moderate' | 'Low';
  summary: string;
  location?: string;
  subLocation?: string;
  floor?: string;
  imageId?: string;
  audioId?: string;
  createdAt: string;
  reporterName?: string;
  reporterPhone?: string;
  source?: 'ai_camera' | 'manual' | 'quicktap' | 'web' | 'whatsapp';
  reportingMethod?: 'ai_camera' | 'manual' | 'quicktap';
  slaStatus?: 'none' | 'stale-2' | 'stale-5' | 'stale-9';
  stagnationDays?: number;
  adminComments?: { id: string; text: string; createdAt: string; authorName?: string }[];
  closureReason?: string;
  resolutionNote?: string;
  vaadRating?: string;
  vendorForwardCount?: number;
  lastVendorForwardAt?: string;
  vendors?: { phone: string; name: string; status: string; sentAt: string; updatedAt?: string }[];
  [key: string]: any;
}

interface TicketDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  tenantId: string;
  isEn?: boolean;
  onOpenComments?: (ticket: Ticket) => void;
  onForwardToVendor?: (ticket: Ticket) => void;
  onUpdateStatus?: (ticket: Ticket, newStatus: Ticket['status']) => void;
}

export const TicketDetailsModal: React.FC<TicketDetailsModalProps> = ({
  isOpen,
  onClose,
  ticket,
  tenantId,
  isEn = false,
  onOpenComments,
  onForwardToVendor,
  onUpdateStatus
}) => {
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImageExpanded) {
          setIsImageExpanded(false);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isImageExpanded, onClose]);

  if (!isOpen || !ticket) return null;

  const t = isEn ? enJson.TicketDetails : heJson.TicketDetails;

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(isEn ? 'en-US' : 'he-IL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const getCleanPhone = (phone?: string) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '972' + cleaned.substring(1);
    }
    return cleaned;
  };

  const cleanPhone = getCleanPhone(ticket.reporterPhone);

  const getUrgencyBadge = () => {
    switch (ticket.urgency) {
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700 border border-red-200">
            <Flame size={13} className="animate-pulse" />
            {isEn ? 'High' : 'דחוף'}
          </span>
        );
      case 'Moderate':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
            {isEn ? 'Moderate' : 'בינוני'}
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {isEn ? 'Low' : 'נמוך'}
          </span>
        );
    }
  };

  const getStatusBadge = () => {
    switch (ticket.status as string) {
      case 'open':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
            {isEn ? 'Open / New' : 'חדש'}
          </span>
        );
      case 'in-progress':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
            {isEn ? 'In Progress' : 'בטיפול'}
          </span>
        );
      case 'resolved':
      case 'closed':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
            {isEn ? 'Resolved' : 'טופל'}
          </span>
        );
      case 'backlog':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
            {isEn ? 'Backlog' : 'בקלוג'}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {ticket.status}
          </span>
        );
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative w-full max-w-2xl bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-slate-900">
                  {t.ticketNumber} #{ticket.ticketNumber || ticket.id.slice(0, 6)}
                </span>
                {getStatusBadge()}
                {getUrgencyBadge()}
              </div>
              <p className="text-xs text-slate-500 font-bold mt-0.5">
                {ticket.category}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
            aria-label={t.close}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Issue Summary */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t.summary}
            </h4>
            <p className="text-base text-slate-800 font-medium leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {ticket.summary || (isEn ? 'No description provided' : 'לא צוין תיאור')}
            </p>
          </div>

          {/* Embedded Image (Direct Rendering, Not a Link!) */}
          {ticket.imageId && typeof ticket.imageId === 'string' && ticket.imageId.length > 5 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera size={15} className="text-blue-600" />
                  {t.imagePreview}
                </h4>
                <button
                  onClick={() => setIsImageExpanded(!isImageExpanded)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {isImageExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span>{isImageExpanded ? (isEn ? 'Shrink' : 'הקטן') : (isEn ? 'Expand' : 'הגדל')}</span>
                </button>
              </div>
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group shadow-sm">
                <img 
                  src={`/img/${tenantId}/${ticket.imageId}`} 
                  alt="Incident capture" 
                  className={`w-full transition-all cursor-pointer ${
                    isImageExpanded ? 'max-h-[550px] object-contain' : 'max-h-64 object-cover'
                  }`}
                  onClick={() => setIsImageExpanded(!isImageExpanded)}
                  loading="lazy"
                />
              </div>
            </div>
          )}

          {/* Embedded Audio Player (Direct HTML5 audio player, Not a Link!) */}
          {ticket.audioId && typeof ticket.audioId === 'string' && ticket.audioId.length > 3 && (
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
              <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Volume2 size={16} className="text-blue-600 animate-pulse" />
                {t.audioRecording}
              </h4>
              <audio 
                controls 
                src={`/audio/${tenantId}/${ticket.audioId}`}
                className="w-full rounded-xl focus:outline-none" 
                preload="metadata"
              />
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Location Info */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-100 text-blue-600 shrink-0">
                <MapPin size={18} />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-0.5">
                  {t.location}
                </span>
                <p className="text-sm font-black text-slate-800">
                  {[ticket.location, ticket.subLocation].filter(Boolean).join(' • ') || (isEn ? 'General' : 'כללי')}
                </p>
                {ticket.floor && (
                  <p className="text-xs text-slate-500 font-bold mt-0.5">
                    {isEn ? `Floor: ${ticket.floor}` : `קומה: ${ticket.floor}`}
                  </p>
                )}
              </div>
            </div>

            {/* Reporter Info */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-green-100 text-green-600 shrink-0">
                <User size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-400 block mb-0.5">
                  {t.reporter}
                </span>
                <p className="text-sm font-black text-slate-800 truncate">
                  {ticket.reporterName || t.anonymous}
                </p>
                {cleanPhone ? (
                  <a
                    href={`https://wa.me/${cleanPhone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700 mt-1"
                  >
                    <Phone size={12} />
                    <span>{ticket.reporterPhone} ({t.chatOnWhatsApp})</span>
                  </a>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">{isEn ? 'No phone provided' : 'ללא טלפון'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Time & SLA Tracking */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar size={15} className="text-slate-400" />
              <span>{t.reportedAt}: <strong>{formatDateTime(ticket.createdAt)}</strong></span>
            </div>

            {typeof ticket.stagnationDays === 'number' && ticket.stagnationDays > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock size={15} className={ticket.stagnationDays >= 5 ? 'text-amber-600' : 'text-slate-400'} />
                <span className={`font-bold px-2 py-0.5 rounded-md ${
                  ticket.stagnationDays >= 9 ? 'bg-red-100 text-red-700' :
                  ticket.stagnationDays >= 5 ? 'bg-amber-100 text-amber-700' :
                  'bg-yellow-50 text-yellow-800'
                }`}>
                  {t.stagnationDays}: {ticket.stagnationDays}
                </span>
              </div>
            )}
          </div>

          {/* Vendor Dispatches (if any) - Active in all statuses including closed tickets */}
          {(() => {
            const hasVendorActivity = (ticket.vendors && ticket.vendors.length > 0) || 
              (ticket.vendorForwardCount && ticket.vendorForwardCount > 0) || 
              ticket.closureReason === 'vendor' ||
              Boolean(ticket.lastVendorForwardAt);

            if (!hasVendorActivity) return null;

            const vendorList = (ticket.vendors && ticket.vendors.length > 0)
              ? ticket.vendors
              : [{
                  name: isEn ? 'Dispatched Vendor' : 'ספק שנשלח לטיפול',
                  phone: '',
                  status: (ticket.status === 'resolved' || ticket.status === 'dismissed') ? 'בוצע' : 'ממתין לתשובה מהספק ...',
                  sentAt: ticket.lastVendorForwardAt || ticket.createdAt
                }];

            const isTicketClosed = ticket.status === 'resolved' || ticket.status === 'dismissed';

            return (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase size={15} className="text-blue-600" />
                    <span>{t.vendorInfo}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                      {vendorList.length}
                    </span>
                  </h4>

                  {isTicketClosed && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                      {isEn ? 'Closed Ticket' : 'פנייה סגורה'}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {vendorList.map((v: any, i: number) => {
                    const isAck = v.status === 'קיבלתי את ההודעה' || v.status === 'בוצע' || Boolean(v.acknowledgedAt);
                    const isDone = v.status === 'בוצע' || Boolean(v.completedAt);
                    const cleanPhone = (v.phone || '').replace(/[^0-9+]/g, '');

                    return (
                      <div key={i} className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
                        {/* Vendor Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">{v.name || (isEn ? 'Vendor' : 'ספק')}</span>
                            {v.phone && (
                              <a
                                href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-md border border-green-200 transition-colors"
                                title={isEn ? "Chat with vendor on WhatsApp" : "שוחח עם הספק בוואטסאפ"}
                              >
                                <Phone size={11} />
                                <span dir="ltr">{v.phone}</span>
                              </a>
                            )}
                          </div>

                          {/* Main Status Badge */}
                          <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                            isDone 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : isAck 
                                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {v.status || (isEn ? 'Awaiting response ...' : 'ממתין לתשובה מהספק ...')}
                          </span>
                        </div>

                        {/* 3 Milestone Action Records */}
                        <div className="space-y-2 text-xs">
                          {/* 1. Action: "ממתין לתשובה מהספק ..." (Dispatched) */}
                          <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-100/80">
                            <div className="p-1 rounded-full bg-blue-100 text-blue-700 mt-0.5 shrink-0">
                              <Send size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-800">
                                  {isEn ? 'Awaiting vendor response ...' : 'ממתין לתשובה מהספק ...'}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100/70 text-blue-800 shrink-0">
                                  {isEn ? 'Dispatched' : 'נשלח בוואטסאפ'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {isEn ? 'Ticket forwarded to vendor' : 'פנייה הועברה לספק בוואטסאפ'} • {formatDateTime(v.sentAt || ticket.createdAt)}
                              </p>
                            </div>
                          </div>

                          {/* 2. Action: "קיבלתי את ההודעה" (Acknowledged) */}
                          <div className={`flex items-start gap-2.5 p-2 rounded-lg border ${
                            isAck ? 'bg-blue-50/60 border-blue-100' : 'bg-slate-50/50 border-slate-100 text-slate-400'
                          }`}>
                            <div className={`p-1 rounded-full mt-0.5 shrink-0 ${
                              isAck ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
                            }`}>
                              <CheckCheck size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-bold ${isAck ? 'text-blue-950' : 'text-slate-500'}`}>
                                  {isEn ? '"Received the message"' : '"קיבלתי את ההודעה"'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  isAck 
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                                    : 'bg-slate-200/60 text-slate-500'
                                }`}>
                                  {isAck 
                                    ? (isEn ? 'Confirmed' : 'אושר ע"י הספק') 
                                    : (isEn ? 'Pending' : 'טרם התקבל אישור')}
                                </span>
                              </div>
                              <p className={`text-[11px] mt-0.5 ${isAck ? 'text-blue-800/80' : 'text-slate-400'}`}>
                                {isAck ? (
                                  <>
                                    {isEn ? 'Vendor confirmed reception' : 'הספק אישר קבלת הפנייה בוואטסאפ'}
                                    {(v.acknowledgedAt || v.updatedAt) && ` • ${formatDateTime(v.acknowledgedAt || v.updatedAt)}`}
                                    {typeof v.responseTimeMinutes === 'number' && ` (${isEn ? 'Response time' : 'זמן מענה'}: ${v.responseTimeMinutes} ${isEn ? 'min' : 'דק\''})`}
                                  </>
                                ) : (
                                  isEn ? 'Waiting for vendor confirmation click' : 'טרם נלחץ כפתור אישור ע"י הספק'
                                )}
                              </p>
                            </div>
                          </div>

                          {/* 3. Action: "בוצע" (Done / Completed) */}
                          <div className={`flex items-start gap-2.5 p-2 rounded-lg border ${
                            isDone 
                              ? 'bg-emerald-50/70 border-emerald-200' 
                              : isTicketClosed 
                                ? 'bg-slate-50 border-slate-200' 
                                : 'bg-slate-50/50 border-slate-100 text-slate-400'
                          }`}>
                            <div className={`p-1 rounded-full mt-0.5 shrink-0 ${
                              isDone 
                                ? 'bg-emerald-600 text-white' 
                                : isTicketClosed 
                                  ? 'bg-slate-400 text-white' 
                                  : 'bg-slate-200 text-slate-400'
                            }`}>
                              <CheckCircle2 size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-bold ${isDone ? 'text-emerald-950' : isTicketClosed ? 'text-slate-700' : 'text-slate-500'}`}>
                                  {isEn ? '"Completed"' : '"בוצע"'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                  isDone 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : isTicketClosed 
                                      ? 'bg-slate-200 text-slate-700' 
                                      : 'bg-slate-200/60 text-slate-500'
                                }`}>
                                  {isDone 
                                    ? (isEn ? 'Done' : 'בוצע בהצלחה') 
                                    : isTicketClosed 
                                      ? (isEn ? 'Closed Ticket' : 'פנייה סגורה') 
                                      : (isEn ? 'In Progress' : 'בטיפול / טרם הושלם')}
                                </span>
                              </div>
                              <p className={`text-[11px] mt-0.5 ${isDone ? 'text-emerald-800/80' : isTicketClosed ? 'text-slate-500' : 'text-slate-400'}`}>
                                {isDone ? (
                                  <>
                                    {isEn ? 'Vendor reported task completed' : 'הספק דיווח על סיום הטיפול בהצלחה'}
                                    {(v.completedAt || v.updatedAt) && ` • ${formatDateTime(v.completedAt || v.updatedAt)}`}
                                    {typeof v.executionTimeMinutes === 'number' && ` (${isEn ? 'Execution time' : 'משך ביצוע'}: ${v.executionTimeMinutes} ${isEn ? 'min' : 'דק\''})`}
                                    {!v.executionTimeMinutes && typeof v.totalResolutionTimeMinutes === 'number' && ` (${isEn ? 'Total time' : 'משך כולל'}: ${v.totalResolutionTimeMinutes} ${isEn ? 'min' : 'דק\''})`}
                                  </>
                                ) : isTicketClosed ? (
                                  isEn ? 'Ticket was marked resolved in system' : 'הפנייה נסגרה וסומנה כטופלה במערכת'
                                ) : (
                                  isEn ? 'Waiting for vendor to report completion' : 'ממתין לדיווח סיום הטיפול מהספק'
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Comments History (if any) */}
          {ticket.adminComments && ticket.adminComments.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare size={15} className="text-blue-600" />
                {t.comments} ({ticket.adminComments.length})
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {ticket.adminComments.map((c) => (
                  <div key={c.id} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs">
                    <div className="flex justify-between items-center text-slate-400 mb-1">
                      <span className="font-bold text-slate-600">{c.authorName || 'Admin'}</span>
                      <span>{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {onOpenComments && (
              <button
                onClick={() => {
                  onClose();
                  onOpenComments(ticket);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all shadow-sm cursor-pointer"
              >
                <MessageSquare size={15} className="text-blue-600" />
                <span>{t.openComments}</span>
              </button>
            )}

            {onForwardToVendor && ticket.status !== 'resolved' && (
              <button
                onClick={() => {
                  onClose();
                  onForwardToVendor(ticket);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition-all shadow-sm cursor-pointer"
              >
                <Share2 size={15} />
                <span>{t.forwardToVendor}</span>
              </button>
            )}

            {onUpdateStatus && ticket.status !== 'resolved' && (
              <button
                onClick={() => {
                  onUpdateStatus(ticket, 'resolved');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all shadow-sm cursor-pointer"
              >
                <span>{isEn ? 'Resolve Ticket' : 'סגור פנייה'}</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-colors cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
