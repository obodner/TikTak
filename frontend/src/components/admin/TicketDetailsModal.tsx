import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Phone,
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
  Send,
  History,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
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
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(true);

  // Fetch complete audit logs & status lifecycle history for the ticket
  useEffect(() => {
    if (!isOpen || !ticket || !tenantId) return;

    const curTicket = ticket;
    const curTenantId = tenantId;
    let isMounted = true;
    setLoadingTimeline(true);

    async function loadTimeline() {
      const events: any[] = [];

      // 1. Initial Creation Event (always baseline)
      events.push({
        id: 'creation',
        type: 'creation',
        status: 'open',
        title: isEn ? 'Ticket Created' : 'פנייה נפתחה (דיווח ראשוני)',
        subtitle: isEn ? 'Report submitted by resident' : 'הדיווח נקלט במערכת',
        timestamp: curTicket.createdAt,
        actor: curTicket.reporterName || (isEn ? 'Resident' : 'דייר/ת'),
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        badgeText: isEn ? 'Open' : 'חדש',
        dotClass: 'bg-blue-600 ring-2 ring-blue-100'
      });

      try {
        const q = query(
          collection(db, 'audit_logs'),
          where('tenantId', '==', curTenantId),
          where('details.ticketId', '==', curTicket.id)
        );
        const snap = await getDocs(q);

        snap.forEach(d => {
          const data = d.data();
          const action = data.action;
          const createdAt = data.createdAt;
          const actorName = data.actor?.name;

          if (action === 'TICKET_STATUS_UPDATE') {
            const newStatus = data.details?.newStatus;
            const closureReason = data.details?.closureReason;
            const resolutionNote = data.details?.resolutionNote;

            let statusText = isEn ? 'Status changed' : 'סטטוס עודכן';
            let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
            let badgeText = newStatus;
            let dotClass = 'bg-slate-500';

            if (newStatus === 'in-progress') {
              statusText = isEn ? 'Moved to In Progress' : 'הועבר לטיפול';
              badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
              badgeText = isEn ? 'In Progress' : 'בטיפול';
              dotClass = 'bg-amber-500 ring-2 ring-amber-100';
            } else if (newStatus === 'resolved' || newStatus === 'closed') {
              statusText = isEn ? 'Marked as Resolved' : 'הפנייה טופלה ונסגרה';
              badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
              badgeText = isEn ? 'Resolved' : 'טופל';
              dotClass = 'bg-emerald-600 ring-2 ring-emerald-100';
            } else if (newStatus === 'dismissed') {
              statusText = isEn ? 'Dismissed' : 'פנייה נדחתה / בוטלה';
              badgeClass = 'bg-red-100 text-red-800 border-red-200';
              badgeText = isEn ? 'Dismissed' : 'בוטל';
              dotClass = 'bg-red-500 ring-2 ring-red-100';
            } else if (newStatus === 'backlog') {
              statusText = isEn ? 'Moved to Backlog' : 'הועבר לבקלוג';
              badgeClass = 'bg-purple-100 text-purple-800 border-purple-200';
              badgeText = isEn ? 'Backlog' : 'בקלוג';
              dotClass = 'bg-purple-500 ring-2 ring-purple-100';
            } else if (newStatus === 'open') {
              statusText = isEn ? 'Reopened' : 'הפנייה נפתחה מחדש';
              badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
              badgeText = isEn ? 'Open' : 'פתוח';
              dotClass = 'bg-blue-500 ring-2 ring-blue-100';
            }

            events.push({
              id: d.id,
              type: 'status_change',
              status: newStatus,
              title: statusText,
              subtitle: actorName ? (isEn ? `Updated by ${actorName}` : `עודכן ע"י ${actorName}`) : undefined,
              timestamp: createdAt,
              actor: actorName,
              closureReason,
              resolutionNote,
              badgeClass,
              badgeText,
              dotClass
            });
          } else if (action === 'TICKET_FORWARDED_TO_VENDOR') {
            const vendorName = data.details?.vendorName || data.details?.vendorPhone;
            events.push({
              id: d.id,
              type: 'vendor_forward',
              title: isEn ? `Forwarded to Vendor (${vendorName})` : `פנייה הועברה לספק (${vendorName})`,
              subtitle: actorName ? (isEn ? `Dispatched by ${actorName}` : `נשלח ע"י ${actorName}`) : undefined,
              timestamp: createdAt,
              actor: actorName,
              badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
              badgeText: isEn ? 'Forwarded' : 'נשלח לספק',
              dotClass: 'bg-blue-400'
            });
          } else if (action === 'VENDOR_ACKNOWLEDGED_TICKET') {
            const respMins = data.details?.responseTimeMinutes;
            events.push({
              id: d.id,
              type: 'vendor_ack',
              title: isEn ? 'Vendor Confirmed Receipt' : 'הספק אישר קבלה בוואטסאפ',
              subtitle: isEn ? '"Received the message"' : '"קיבלתי את ההודעה"',
              timestamp: createdAt || data.details?.acknowledgedAt,
              actor: data.details?.vendorName,
              badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              badgeText: respMins ? `${respMins} ${isEn ? 'min' : 'דק\''}` : (isEn ? 'Confirmed' : 'אושר'),
              dotClass: 'bg-emerald-500'
            });
          } else if (action === 'VENDOR_COMPLETED_TICKET') {
            events.push({
              id: d.id,
              type: 'vendor_done',
              title: isEn ? 'Vendor Completed Task' : 'הספק דיווח על סיום הביצוע',
              subtitle: isEn ? 'Task completed on site' : 'הספק סיים את הטיפול בשטח',
              timestamp: createdAt || data.details?.completedAt,
              badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
              badgeText: isEn ? 'Done' : 'בוצע',
              dotClass: 'bg-emerald-600 ring-2 ring-emerald-100'
            });
          } else if (action === 'SERVICE_FEEDBACK_SUBMITTED') {
            const rating = data.details?.rating || ticket?.vaadRating;
            const ratingHebrew = rating === 'good' ? 'טוב מאוד' : rating === 'bad' ? 'טעון שיפור' : rating;
            events.push({
              id: d.id,
              type: 'feedback',
              title: isEn ? 'Resident Service Feedback' : 'משוב שירות מהדייר',
              subtitle: isEn ? `Rating: ${rating}` : `דירוג: ${ratingHebrew}`,
              timestamp: createdAt,
              actor: actorName || ticket?.reporterName,
              badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
              badgeText: isEn ? 'Rating' : 'משוב שירות',
              dotClass: 'bg-amber-400'
            });
          }
        });
      } catch (err) {
        console.warn('Could not load audit logs for ticket timeline, falling back to document fields:', err);
      }

      // If no status updates were found in audit_logs, synthesize from ticket fields
      const hasStatusUpdate = events.some(e => e.type === 'status_change');
      if (!hasStatusUpdate) {
        if (Array.isArray(ticket?.statusHistory) && ticket.statusHistory.length > 0) {
          ticket.statusHistory.forEach((sh: any, idx: number) => {
            events.push({
              id: `sh_${idx}`,
              type: 'status_change',
              status: sh.status,
              title: sh.status === 'in-progress' ? (isEn ? 'Moved to In Progress' : 'הועבר לטיפול') :
                sh.status === 'resolved' ? (isEn ? 'Marked as Resolved' : 'הפנייה טופלה ונסגרה') :
                  sh.status === 'dismissed' ? (isEn ? 'Dismissed' : 'פנייה נדחתה / בוטלה') :
                    sh.status === 'backlog' ? (isEn ? 'Moved to Backlog' : 'הועבר לבקלוג') : (isEn ? 'Status Updated' : 'סטטוס עודכן'),
              subtitle: sh.changedBy ? (isEn ? `By ${sh.changedBy}` : `עודכן ע"י ${sh.changedBy}`) : undefined,
              timestamp: sh.changedAt,
              closureReason: sh.closureReason,
              resolutionNote: sh.resolutionNote,
              badgeClass: sh.status === 'resolved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                sh.status === 'in-progress' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-slate-100 text-slate-700 border-slate-200',
              badgeText: sh.status === 'resolved' ? (isEn ? 'Resolved' : 'טופל') :
                sh.status === 'in-progress' ? (isEn ? 'In Progress' : 'בטיפול') : sh.status,
              dotClass: sh.status === 'resolved' ? 'bg-emerald-600 ring-2 ring-emerald-100' : 'bg-slate-500'
            });
          });
        } else if (ticket?.status && ticket.status !== 'open') {
          const changeTime = ticket.lastStatusChangeAt || ticket.resolvedAt || ticket.closedAt || ticket.updatedAt;
          if (changeTime && changeTime !== ticket.createdAt) {
            events.push({
              id: 'current_status_change',
              type: 'status_change',
              status: ticket.status,
              title: ticket.status === 'in-progress' ? (isEn ? 'Moved to In Progress' : 'הועבר לטיפול') :
                ticket.status === 'resolved' ? (isEn ? 'Marked as Resolved' : 'הפנייה טופלה ונסגרה') :
                  ticket.status === 'dismissed' ? (isEn ? 'Dismissed' : 'פנייה נדחתה / בוטלה') :
                    ticket.status === 'backlog' ? (isEn ? 'Moved to Backlog' : 'הועבר לבקלוג') : (isEn ? 'Status Updated' : 'סטטוס עודכן'),
              subtitle: ticket.status === 'resolved' && ticket.closureReason ? `${isEn ? 'Reason' : 'סיבה'}: ${ticket.closureReason}` : undefined,
              timestamp: changeTime,
              closureReason: ticket.closureReason,
              resolutionNote: ticket.resolutionNote,
              badgeClass: ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                ticket.status === 'in-progress' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-slate-100 text-slate-700 border-slate-200',
              badgeText: ticket.status === 'resolved' ? (isEn ? 'Resolved' : 'טופל') :
                ticket.status === 'in-progress' ? (isEn ? 'In Progress' : 'בטיפול') : ticket.status,
              dotClass: ticket.status === 'resolved' ? 'bg-emerald-600 ring-2 ring-emerald-100' : 'bg-slate-500'
            });
          }
        }
      }

      // Sort chronological
      events.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

      if (isMounted) {
        setTimelineEvents(events);
        setLoadingTimeline(false);
      }
    }

    loadTimeline();
    return () => { isMounted = false; };
  }, [isOpen, ticket?.id, ticket?.status, ticket?.updatedAt, tenantId, isEn]);

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
                  className={`w-full transition-all cursor-pointer ${isImageExpanded ? 'max-h-[550px] object-contain' : 'max-h-64 object-cover'
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

          {/* Status History & Lifecycle Timeline */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700 shrink-0">
                  <History size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>{t.statusHistory || (isEn ? 'Status History & Timeline' : 'ציר זמן והיסטוריית סטטוסים')}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                      {timelineEvents.length}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t.reportedAt}: <strong>{formatDateTime(ticket.createdAt)}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {typeof ticket.stagnationDays === 'number' && ticket.stagnationDays > 0 && (
                  <div className="flex items-center gap-1">
                    <Clock size={13} className={ticket.stagnationDays >= 5 ? 'text-amber-600' : 'text-slate-400'} />
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ticket.stagnationDays >= 9 ? 'bg-red-100 text-red-700' :
                        ticket.stagnationDays >= 5 ? 'bg-amber-100 text-amber-700' :
                          'bg-yellow-50 text-yellow-800'
                      }`}>
                      {t.stagnationDays}: {ticket.stagnationDays}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                  title={isTimelineExpanded ? (isEn ? 'Collapse' : 'כווץ') : (isEn ? 'Expand' : 'הרחב')}
                >
                  {isTimelineExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {isTimelineExpanded && (
              <div className="pt-2 border-t border-slate-200/70">
                {loadingTimeline ? (
                  <div className="py-3 flex items-center justify-center gap-2 text-xs text-slate-400">
                    <Clock size={14} className="animate-spin text-blue-500" />
                    <span>{isEn ? 'Loading history...' : 'טוען ציר זמן...'}</span>
                  </div>
                ) : (
                  <div className="relative border-s-2 border-blue-200 ms-3.5 ps-4 py-1 space-y-3.5">
                    {timelineEvents.map((evt, idx) => {
                      const isLast = idx === timelineEvents.length - 1;
                      return (
                        <div key={evt.id || idx} className="relative group">
                          {/* Dot / Indicator */}
                          <div className={`absolute -start-[23px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${evt.dotClass || (isLast ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-slate-400')
                            }`} />

                          <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="font-extrabold text-xs text-slate-900">
                                {evt.title}
                              </span>
                              {evt.badgeText && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${evt.badgeClass || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                  {evt.badgeText}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                              <span className="font-bold text-slate-700">
                                {formatDateTime(evt.timestamp)}
                              </span>
                              {evt.actor && (
                                <>
                                  <span>•</span>
                                  <bdi className="text-slate-600">{evt.actor}</bdi>
                                </>
                              )}
                            </div>

                            {evt.subtitle && (
                              <p className="text-[11px] text-slate-600 font-medium">
                                {evt.subtitle}
                              </p>
                            )}

                            {evt.closureReason && (
                              <p className="text-[10px] text-slate-500 font-medium">
                                <strong>{isEn ? 'Reason:' : 'סיבת סגירה:'}</strong> {evt.closureReason}
                              </p>
                            )}

                            {evt.resolutionNote && (
                              <div className="mt-1 p-2 rounded-lg bg-emerald-50/80 border border-emerald-100 text-[11px] text-emerald-950">
                                <span className="font-bold block text-[10px] text-emerald-700 uppercase mb-0.5">
                                  {isEn ? 'Resolution Note:' : 'הערת סגירה / טיפול:'}
                                </span>
                                <span className="whitespace-pre-wrap">{evt.resolutionNote}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                          <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${isDone
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
                          <div className={`flex items-start gap-2.5 p-2 rounded-lg border ${isAck ? 'bg-blue-50/60 border-blue-100' : 'bg-slate-50/50 border-slate-100 text-slate-400'
                            }`}>
                            <div className={`p-1 rounded-full mt-0.5 shrink-0 ${isAck ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
                              }`}>
                              <CheckCheck size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`font-bold ${isAck ? 'text-blue-950' : 'text-slate-500'}`}>
                                  {isEn ? '"Received the message"' : '"קיבלתי את ההודעה"'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${isAck
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
                          <div className={`flex items-start gap-2.5 p-2 rounded-lg border ${isDone
                              ? 'bg-emerald-50/70 border-emerald-200'
                              : isTicketClosed
                                ? 'bg-slate-50 border-slate-200'
                                : 'bg-slate-50/50 border-slate-100 text-slate-400'
                            }`}>
                            <div className={`p-1 rounded-full mt-0.5 shrink-0 ${isDone
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
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${isDone
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
                                    {(v.completedAt || v.updatedAt || ticket.resolvedAt || ticket.closedAt || ticket.lastStatusChangeAt) &&
                                      ` • ${formatDateTime(v.completedAt || v.updatedAt || ticket.resolvedAt || ticket.closedAt || ticket.lastStatusChangeAt)}`
                                    }
                                    {typeof v.executionTimeMinutes === 'number' && ` (${isEn ? 'Execution time' : 'משך ביצוע'}: ${v.executionTimeMinutes} ${isEn ? 'min' : 'דק\''})`}
                                    {!v.executionTimeMinutes && typeof v.totalResolutionTimeMinutes === 'number' && ` (${isEn ? 'Total time' : 'משך כולל'}: ${v.totalResolutionTimeMinutes} ${isEn ? 'min' : 'דק\''})`}
                                  </>
                                ) : isTicketClosed ? (
                                  <>
                                    {isEn ? 'Ticket was marked resolved in system' : 'הפנייה נסגרה וסומנה כטופלה במערכת'}
                                    {(ticket.resolvedAt || ticket.closedAt || ticket.lastStatusChangeAt || ticket.updatedAt) &&
                                      ` • ${formatDateTime(ticket.resolvedAt || ticket.closedAt || ticket.lastStatusChangeAt || ticket.updatedAt)}`
                                    }
                                  </>
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
