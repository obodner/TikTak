import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Navigate, Link, useNavigate } from 'react-router-dom';
import { logAction } from '../../utils/auditLogger';
import { ConfirmModal, ConfirmType } from '../../components/admin/ConfirmModal';
import { collection, getDocs, getDoc, orderBy, query, doc, updateDoc, arrayUnion, arrayRemove, where, limit } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { CommentModal } from '../../components/admin/CommentModal';
import { ClosureModal } from '../../components/admin/ClosureModal';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAuthState } from '../../hooks/useAuthState';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChevronDown, MessageSquare, Mic, Download, Search, X, LogOut, Calendar, Shield, HelpCircle, Image as ImageIcon, Pause, GripVertical } from 'lucide-react';
import { format, parseISO, subMonths, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { HelpModal } from '../../components/admin/HelpModal';
import { calculateWorkingDays, getSlaStatus, getSlaColorClasses } from '../../utils/slaEngine';
import { he } from 'date-fns/locale';

const InlineAudioPlayer = ({ src, isEn }: { src: string; isEn?: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      const audios = document.querySelectorAll('audio');
      audios.forEach(aud => {
        if (aud !== audioRef.current) {
          aud.pause();
        }
      });
      audioRef.current.play().catch(err => {
        console.error("Playback failed:", err);
      });
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        onClick={togglePlay}
        className={`p-1.5 rounded-lg transition-all flex items-center justify-center
          ${isPlaying 
            ? 'bg-blue-100 text-blue-600' 
            : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
          }`}
        title={isPlaying ? (isEn ? "Pause Audio" : "השהה הקלטה") : (isEn ? "Play Audio" : "נגן הקלטה")}
      >
        {isPlaying ? (
          <span className="relative flex h-[18px] w-[18px] items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <Pause size={14} className="relative z-10" fill="currentColor" />
          </span>
        ) : (
          <Mic size={18} />
        )}
      </button>
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      />
    </div>
  );
};

type Ticket = {
  id: string;
  category: string;
  createdAt: string;
  imageId?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'dismissed';
  summary: string;
  urgency: 'High' | 'Moderate' | 'Low';
  location?: string;
  subLocation?: string;
  ticketType?: 'visible' | 'hidden';
  audioId?: string;
  adminComments?: { id: string; text: string; createdAt: string; authorName?: string }[];
  closureReason?: string;
  resolutionNote?: string;
  reporterName?: string;
  reporterPhone?: string;
  ticketNumber?: number;
  source?: 'ai_camera' | 'manual' | 'quicktap' | 'web' | 'whatsapp';
  reportingMethod?: 'ai_camera' | 'manual' | 'quicktap';
  // SLA Fields
  slaStatus?: 'none' | 'stale-2' | 'stale-5' | 'stale-9';
  stagnationDays?: number;
  lastStatusChangeAt?: string;
  appRating?: number;
  vaadRating?: string;
  meToo?: number;
  meTooReporters?: { name: string; phone: string; votedAt: string }[];
};

const CustomTooltip = ({ active, payload, label, isEn }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry.value) || 0), 0);
    const isHe = !isEn;
    return (
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-lg text-right" dir={isHe ? 'rtl' : 'ltr'}>
        <p className="font-bold text-slate-800 mb-1 text-xs">{label}</p>
        <div className="space-y-1 text-[11px]">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between gap-4 items-center">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-slate-500 font-medium">{entry.name}</span>
              </span>
              <span className="font-bold text-slate-800">{entry.value}</span>
            </div>
          ))}
          <div className="border-t border-slate-100 pt-1 mt-1 flex justify-between gap-4 font-bold text-blue-600">
            <span>{isEn ? 'Total' : 'סה"כ פניות'}</span>
            <span>{total}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function AdminDashboard() {
  const { tenantId } = useParams();
  const [isSuper, setIsSuper] = useState(false);
  const { user, loading: authLoading } = useAuthState();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantConfig, setTenantConfig] = useState<any>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'progress' | 'resolved'>('new');
  const [commentTicketId, setCommentTicketId] = useState<string | null>(null);
  const [closureTicketId, setClosureTicketId] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<{ firstName: string; lastName: string } | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [myTenants, setMyTenants] = useState<{ id: string, name?: string }[]>([]);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: ConfirmType;
    onConfirm?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning'
  });

  const showConfirm = (title: string, message: string, onConfirm?: () => void, type: ConfirmType = 'warning', confirmLabel?: string, cancelLabel?: string) => {
    setConfirmState({ isOpen: true, title, message, onConfirm, type, confirmLabel, cancelLabel });
  };

  const showAlert = (title: string, message: string, type: ConfirmType = 'info') => {
    setConfirmState({ isOpen: true, title, message, type });
  };
  const navigate = useNavigate();


  // Filter State
  const [filters, setFilters] = useState({
    timeRange: 'all',
    startDate: '',
    endDate: '',
    location: 'all',
    subLocation: 'all',
    category: 'all',
    severity: 'all',
    search: '',
    statuses: ['new', 'in-progress', 'closed'],
    source: 'all',
    channel: 'all'
  });

  const getAuditActor = () => ({
    uid: user?.uid || 'unknown',
    name: adminProfile
      ? `${adminProfile.firstName} ${adminProfile.lastName}`
      : (user?.displayName || user?.email || 'Admin'),
    email: user?.email || undefined,
    type: 'admin' as const
  });

  // 1. Localization & Language Setup
  const lang = tenantConfig?.language || 'he';
  const isEn = lang === 'en';
  const isHe = !isEn;

  const translateCategory = (cat: string) => {
    const mapping: Record<string, string> = {
      'Electrical': 'חשמל',
      'Plumbing': 'אינסטלציה',
      'Elevator': 'מעלית',
      'Cleaning': 'ניקיון',
      'Safety': 'בטיחות',
      'Other': 'אחר',
      'חשמל': 'Electrical',
      'אינסטלציה': 'Plumbing',
      'מעלית': 'Elevator',
      'ניקיון': 'Cleaning',
      'בטיחות': 'Safety',
      'אחר': 'Other'
    };
    if (isEn && mapping[cat] && !cat.match(/[a-z]/i)) return mapping[cat];
    if (!isEn && mapping[cat] && cat.match(/[a-z]/i)) return mapping[cat];
    return cat;
  };



  const uiLabels = {
    new: isEn ? 'New Reports' : 'דיווחים חדשים',
    progress: isEn ? 'In Progress' : 'בטיפול הוועד',
    resolved: isEn ? 'Resolved' : 'טופל ונסגר',
    stats_open: isEn ? 'Open Tickets' : 'פניות פתוחות',
    stats_closed: isEn ? 'Resolved' : 'פניות שטופלו',
    loading: isEn ? 'Loading reports...' : 'טוען פניות מן השרת...',
    no_tickets: isEn ? 'No reports yet' : 'אין דיווחים',
    image: isEn ? 'Image' : 'תמונה',
    start: isEn ? 'Start' : 'התחל',
    close: isEn ? 'Close' : 'סגור',
    reopen: isEn ? 'Reopen' : 'פתח מחדש',
    back: isEn ? 'Back to New' : 'החזר לחדש',
    location: tenantConfig?.uiConfig?.locationLabel || (isEn ? 'Location' : 'קומה'),
    subLocation: tenantConfig?.uiConfig?.subLocationLabel || (isEn ? 'Sub-Location' : 'מקום'),
    settings: isEn ? 'Tenant Settings' : 'הגדרות',
    urgency: {
      High: isEn ? 'High' : 'דחוף',
      Moderate: isEn ? 'Moderate' : 'בינוני',
      Low: isEn ? 'Low' : 'נמוך'
    },
    admin: isEn ? 'Admin' : 'מנהל',
    pie_title: isEn ? 'Category Distribution' : 'התפלגות לפי קטגוריה',
    bar_title: isEn ? 'Monthly Trends' : 'מגמות דיווח',
    tab_new: isEn ? 'New' : 'חדש',
    tab_progress: isEn ? 'In Progress' : 'בטיפול',
    tab_resolved: isEn ? 'Resolved' : 'טופל',
    quicktap: isEn ? 'QuickTap' : 'דיווח מהיר',
    filters: {
      search: isHe ? 'חפש בתיאור התקלה...' : 'Search in description...',
      time: isHe ? 'טווח זמן' : 'Time Range',
      severity: isHe ? 'חומרה' : 'Severity',
      category: isHe ? 'קטגוריה' : 'Category',
      status: isHe ? 'דיווח' : 'Status',
      all: isHe ? 'הכל' : 'All',
      clear: isHe ? 'נקה הכל' : 'Clear All',
      export: isHe ? 'ייצא לאקסל' : 'Export CSV',
      ranges: {
        all: isHe ? 'כל הזמן' : 'All Time',
        '1m': isHe ? 'חודש אחרון' : 'Last Month',
        '3m': isHe ? '3 חודשים אחרונים' : 'Last 3 Months',
        '6m': isHe ? 'חצי שנה אחרונה' : 'Last 6 Months',
        '12m': isHe ? 'שנה אחרונה' : 'Last Year',
        custom: isHe ? 'טווח מותאם' : 'Custom Range'
      },
      source: isHe ? 'מקור' : 'Source'
    }
  };

  const statusOptions = [
    { id: 'new', label: isHe ? 'חדש' : 'New', values: ['open'] },
    { id: 'in-progress', label: isHe ? 'בטיפול' : 'In Progress', values: ['in-progress'] },
    { id: 'closed', label: isHe ? 'סגור' : 'Closed', values: ['resolved', 'dismissed'] },
  ];

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  // 2. Data Fetching
  const fetchData = async () => {
    if (!user || !tenantId) return;
    setError('');
    try {
      const bDoc = await getDoc(doc(db, "tenants", tenantId));
      const currentTenant = bDoc.exists() ? bDoc.data() : null;
      setTenantConfig(currentTenant);

      if (currentTenant) {
        const country = currentTenant.country || 'IL';
        const hDoc = await getDoc(doc(db, "holidays", country));
        if (hDoc.exists()) {
          setHolidays(hDoc.data().holidays.map((h: any) => h.date));
        }
      }

      const q = query(
        collection(db, "tenants", tenantId as string, "tickets"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const parsed: Ticket[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
      setTickets(parsed);

      // Fetch current admin profile and user's tenants
      if (user.uid) {
        const token = await user.getIdTokenResult();
        const superRole = token.claims.role === 'super';
        setIsSuper(superRole);

        let userTenants: { id: string, name?: string }[] = [];
        if (superRole) {
          const allTenantsSnap = await getDocs(collection(db, "tenants"));
          userTenants = allTenantsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
        } else {
          const tenantsRef = collection(db, "tenants");
          const tQuery = query(tenantsRef, where("adminUids", "array-contains", user.uid));
          const tSnap = await getDocs(tQuery);
          userTenants = tSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
        }
        setMyTenants(userTenants);

        let uDoc = await getDoc(doc(db, "tenants", tenantId, "adminUsers", user.uid));

        // Fallback: If not found in current tenant (common for Super Admins switching context),
        // find ANY tenant where this user is an admin and fetch their profile from there.
        if (!uDoc.exists()) {
          try {
            const adminQuery = query(
              collection(db, "tenants"),
              where("adminUids", "array-contains", user.uid),
              limit(1)
            );
            const adminSnap = await getDocs(adminQuery);
            if (!adminSnap.empty) {
              const fallbackTenantId = adminSnap.docs[0].id;
              const fallbackDoc = await getDoc(doc(db, "tenants", fallbackTenantId, "adminUsers", user.uid));
              if (fallbackDoc.exists()) {
                uDoc = fallbackDoc;
              }
            }
          } catch (e) {
            console.error("Profile fallback search failed:", e);
          }
        }

        if (uDoc.exists()) {
          setAdminProfile({ firstName: uDoc.data().firstName, lastName: uDoc.data().lastName });
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch dashboard data:", err);
      setError(`שגיאה בגישה לנתוני הבניין: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, tenantId]);

  // 3. Filtering Logic
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // a. Search
      if (filters.search && !t.summary.toLowerCase().includes(filters.search.toLowerCase())) return false;

      // b. Dimensions
      if (filters.category !== 'all' && t.category !== filters.category) return false;
      if (filters.location !== 'all' && t.location !== filters.location) return false;
      if (filters.subLocation !== 'all' && t.subLocation !== filters.subLocation) return false;
      if (filters.severity !== 'all' && t.urgency !== filters.severity) return false;

      // c. Time
      const ticketDate = parseISO(t.createdAt);
      if (filters.timeRange !== 'all') {
        if (filters.timeRange === 'custom') {
          if (filters.startDate && filters.endDate) {
            const start = startOfDay(parseISO(filters.startDate));
            const end = endOfDay(parseISO(filters.endDate));
            if (!isWithinInterval(ticketDate, { start, end })) return false;
          }
        } else {
          const monthsBack = parseInt(filters.timeRange);
          const cutoff = subMonths(new Date(), monthsBack);
          if (ticketDate < cutoff) return false;
        }
      }

      // d. Status
      const mappedStatuses = filters.statuses.flatMap(s => {
        if (s === 'new') return ['open'];
        if (s === 'in-progress') return ['in-progress'];
        if (s === 'closed') return ['resolved', 'dismissed'];
        return [];
      });
      if (!mappedStatuses.includes(t.status)) return false;

      // e. Source / Reporting Method
      if (filters.source !== 'all') {
        const method = t.reportingMethod || t.source;
        if (method !== filters.source) return false;
      }

      // f. Channel / Platform
      if (filters.channel !== 'all') {
        const channel = (t.source === 'whatsapp' || t.source === 'web') ? t.source : 'web';
        if (channel !== filters.channel) return false;
      }

      return true;
    });
  }, [tickets, filters]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleStatusUpdate = async (ticketId: string, newStatus: Ticket['status'], ticketObj?: Ticket) => {
    if (!tenantId) return;
    setUpdatingId(ticketId);
    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", ticketId);
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // Audit Log
      const ticket = ticketObj || tickets.find(t => t.id === ticketId);
      await logAction({
        tenantId,
        action: 'TICKET_STATUS_UPDATE',
        actor: getAuditActor(),
        details: {
          ticketId,
          ticketNumber: ticket?.ticketNumber,
          newStatus
        },
        changes: ticket ? { previousValue: { status: ticket.status }, newValue: { status: newStatus } } : null
      });

      await fetchData();
    } catch (err) {
      console.error("Update failed:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUrgencyUpdate = async (ticket: Ticket, newUrgency: Ticket['urgency']) => {
    if (!tenantId) return;
    setUpdatingId(ticket.id);
    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", ticket.id);
      await updateDoc(ticketRef, {
        urgency: newUrgency,
        updatedAt: new Date().toISOString()
      });

      // Audit Log
      await logAction({
        tenantId,
        action: 'TICKET_URGENCY_UPDATE',
        actor: getAuditActor(),
        details: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          newUrgency
        },
        changes: { previousValue: { urgency: ticket.urgency }, newValue: { urgency: newUrgency } }
      });

      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, urgency: newUrgency } : t));
    } catch (err) {
      console.error("Urgency update failed:", err);
      showAlert(
        isEn ? 'Error' : 'שגיאה',
        isEn ? 'Failed to update urgency' : 'עדכון הדחיפות נכשל'
      );
    } finally {
      setUpdatingId(null);
    }
  };


  const handleConfirmResolution = async (ticket: Ticket, reason: string, notes: string) => {
    if (!tenantId) return;
    setUpdatingId(ticket.id);
    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", ticket.id);
      await updateDoc(ticketRef, {
        status: 'resolved',
        closureReason: reason,
        resolutionNote: notes,
        updatedAt: new Date().toISOString()
      });

      // Audit Log
      await logAction({
        tenantId,
        action: 'TICKET_STATUS_UPDATE',
        actor: getAuditActor(),
        details: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          newStatus: 'resolved',
          closureReason: reason,
          resolutionNote: notes
        },
        changes: {
          previousValue: { status: ticket.status },
          newValue: { status: 'resolved', closureReason: reason }
        }
      });

      // Update local state immediately for snappy UI
      setTickets(prev => prev.map(t =>
        t.id === ticket.id ? { ...t, status: 'resolved', closureReason: reason, resolutionNote: notes } : t
      ));

      // Automated resident notifications are now handled by the backend Firestore trigger.
    } catch (err) {
      console.error("Resolution failed:", err);
      showAlert(
        isEn ? 'Error' : 'שגיאה',
        isEn ? 'Failed to close ticket' : 'סגירת הפנייה נכשלה'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveComment = async (ticket: any, text: string) => {
    if (!tenantId || !ticket) return;
    const ticketId = ticket.id;
    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      createdAt: new Date().toISOString(),
      authorName: adminProfile ? `${adminProfile.firstName} ${adminProfile.lastName}` : (isEn ? 'Admin' : 'מנהל')
    };

    try {
      await updateDoc(doc(db, "tenants", tenantId, "tickets", ticketId), {
        adminComments: arrayUnion(newComment)
      });

      // Audit Log
      await logAction({
        tenantId,
        action: 'COMMENT_CREATED',
        actor: getAuditActor(),
        details: {
          ticketId,
          ticketNumber: ticket.ticketNumber,
          commentId: newComment.id,
          text: newComment.text
        }
      });

      setTickets(prev => prev.map(t =>
        t.id === ticketId
          ? { ...t, adminComments: [...(t.adminComments || []), newComment] }
          : t
      ));
    } catch (err: any) {
      console.error(err);
      showAlert(
        isEn ? 'Error' : 'שגיאה',
        isEn ? 'Failed to save comment' : 'שמירת ההערה נכשלה'
      );
    }
  };

  const handleSendWhatsAppComment = async (ticket: any, comment: any) => {
    if (!tenantId || !ticket) return;
    const authorName = adminProfile ? `${adminProfile.firstName} ${adminProfile.lastName}` : (isEn ? 'Admin' : 'מנהל');
    
    try {
      const response = await fetch('https://sendwhatsappcommentnotification-xzfu3ennuq-uc.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ticketId: ticket.id,
          commentId: comment.id,
          commentText: comment.text,
          actorName: authorName
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || (isEn ? 'Failed to send WhatsApp update' : 'שליחת עדכון בוואטסאפ נכשלה'));
      }

      // Audit Log
      await logAction({
        tenantId,
        action: 'WHATSAPP_UPDATE_SENT',
        actor: getAuditActor(),
        details: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          commentId: comment.id,
          commentText: comment.text,
          sentViaTemplate: data.sentViaTemplate
        }
      });

      // Update local state
      const nowIso = data.sentToWhatsAppAt || new Date().toISOString();
      setTickets(prev => prev.map(t => {
        if (t.id !== ticket.id) return t;
        const updatedComments = (t.adminComments || []).map(c => {
          if (c.id === comment.id) {
            return {
              ...c,
              sentToWhatsApp: true,
              sentToWhatsAppAt: nowIso,
              sentViaTemplate: data.sentViaTemplate
            };
          }
          return c;
        });
        return { ...t, adminComments: updatedComments };
      }));

      showAlert(
        isEn ? 'WhatsApp Update Sent' : 'עדכון וואטסאפ נשלח',
        isEn ? 'WhatsApp message dispatched to reporter successfully.' : 'הודעת הוואטסאפ נשלחה בהצלחה לתושב/דייר.',
        'info'
      );
    } catch (err: any) {
      console.error('WhatsApp dispatch error:', err);
      showAlert(
        isEn ? 'Error' : 'שגיאה',
        err.message || (isEn ? 'Failed to send WhatsApp message' : 'שליחת הודעת הוואטסאפ נכשלה'),
        'danger'
      );
    }
  };

  const handleSaveAndSendWhatsAppComment = async (ticket: any, text: string) => {
    if (!tenantId || !ticket) return;
    const ticketId = ticket.id;
    const authorName = adminProfile ? `${adminProfile.firstName} ${adminProfile.lastName}` : (isEn ? 'Admin' : 'מנהל');
    const commentId = Math.random().toString(36).substr(2, 9);
    
    const newComment = {
      id: commentId,
      text,
      createdAt: new Date().toISOString(),
      authorName
    };

    try {
      // First save comment internally
      await updateDoc(doc(db, "tenants", tenantId, "tickets", ticketId), {
        adminComments: arrayUnion(newComment)
      });

      // Log comment creation
      await logAction({
        tenantId,
        action: 'COMMENT_CREATED',
        actor: getAuditActor(),
        details: {
          ticketId,
          ticketNumber: ticket.ticketNumber,
          commentId: newComment.id,
          text: newComment.text
        }
      });

      // Optimistically add comment to local state
      setTickets(prev => prev.map(t =>
        t.id === ticketId
          ? { ...t, adminComments: [...(t.adminComments || []), newComment] }
          : t
      ));

      // Dispatch WhatsApp message
      await handleSendWhatsAppComment(ticket, newComment);
    } catch (err: any) {
      console.error(err);
      showAlert(
        isEn ? 'Error' : 'שגיאה',
        err.message || (isEn ? 'Failed to save comment' : 'שמירת ההערה נכשלה')
      );
    }
  };

  const handleDeleteComment = async (ticket: any, comment: any) => {
    if (!tenantId || !ticket) return;
    const ticketId = ticket.id;
    showConfirm(
      isEn ? 'Delete Comment' : 'מחיקת הערה',
      isEn ? 'Are you sure you want to delete this comment?' : 'האם אתה בטוח שברצונך למחוק הערה זו?',
      async () => {
        try {
          await updateDoc(doc(db, "tenants", tenantId!, "tickets", ticketId), {
            adminComments: arrayRemove(comment)
          });

          // Audit Log
          await logAction({
            tenantId: tenantId!,
            action: 'COMMENT_DELETED',
            actor: getAuditActor(),
            details: { ticketId, ticketNumber: ticket.ticketNumber, commentId: comment.id }
          });

          setTickets(prev => prev.map(t =>
            t.id === ticketId
              ? { ...t, adminComments: (t.adminComments || []).filter(c => c.id !== comment.id) }
              : t
          ));
        } catch (err) {
          console.error("Delete failed:", err);
          showAlert(isEn ? 'Error' : 'שגיאה', isEn ? 'Failed to delete' : 'המחיקה נכשלה');
        }
      },
      'danger'
    );
  };



  const handleExportCSV = () => {
    const headers = [
      '#',
      isHe ? 'תאריך' : 'Date',
      isHe ? 'קטגוריה' : 'Category',
      isHe ? 'תיאור' : 'Description',
      uiLabels.location,
      uiLabels.subLocation,
      isHe ? 'סטטוס' : 'Status',
      isHe ? 'סיבת סגירה' : 'Closure Reason',
      isHe ? 'הערת סגירה' : 'Resolution Note',
      isHe ? 'חומרה' : 'Urgency',
      isHe ? 'תמונה' : 'Image',
      isHe ? 'אודיו' : 'Audio',
      isHe ? 'דירוג אפליקציה' : 'App Rating',
      isHe ? 'דירוג ועד (WhatsApp)' : 'Vaad Feedback'
    ];

    const translateStatus = (status: string) => {
      const mapping: Record<string, { he: string, en: string }> = {
        'open': { he: 'חדש', en: 'New' },
        'in-progress': { he: 'בטיפול', en: 'In Progress' },
        'resolved': { he: 'טופל', en: 'Resolved' },
        'dismissed': { he: 'בוטל', en: 'Dismissed' }
      };
      const entry = mapping[status];
      if (!entry) return status;
      return isEn ? entry.en : entry.he;
    };

    const rows = filteredTickets.map(t => [
      t.ticketNumber || '',
      format(parseISO(t.createdAt), 'dd/MM/yyyy HH:mm'),
      translateCategory(t.category),
      t.summary.replace(/"/g, '""'),
      t.location || '',
      t.subLocation || '',
      translateStatus(t.status),
      t.closureReason ? (() => {
        const mapping: Record<string, { he: string, en: string }> = {
          'fixed': { he: 'טופל', en: 'Fixed' },
          'duplicate': { he: 'כפילות', en: 'Duplicate' },
          'irrelevant': { he: 'לא רלוונטי', en: 'Irrelevant' },
          'vendor': { he: 'בטיפול ספק', en: 'Vendor Dispatched' },
          'outside': { he: 'מחוץ לאחריות', en: 'Outside Scope' },
          'rejected': { he: 'נדחה', en: 'Rejected' }
        };
        const entry = mapping[t.closureReason];
        return entry ? (isEn ? entry.en : entry.he) : t.closureReason;
      })() : '',
      t.resolutionNote ? t.resolutionNote.replace(/"/g, '""') : '',
      uiLabels.urgency[t.urgency],
      t.imageId ? 'V' : '',
      t.audioId ? 'V' : '',
      t.appRating || '',
      t.vaadRating ? (t.vaadRating === 'good' ? (isHe ? 'מצוין' : 'Excellent') : t.vaadRating === 'ok' ? (isHe ? 'בסדר' : 'Satisfactory') : (isHe ? 'לא מרוצה' : 'Dissatisfied')) : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const fileName = `${tenantConfig?.name || tenantId}_${format(new Date(), 'ddMMyyyy')}_${format(new Date(), 'HHmm')}.csv`;
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFilters = () => {
    setFilters({
      timeRange: 'all',
      startDate: '',
      endDate: '',
      location: 'all',
      subLocation: 'all',
      category: 'all',
      severity: 'all',
      search: '',
      statuses: ['new', 'in-progress', 'closed'],
      source: 'all',
      channel: 'all'
    });
  };

  // 4. Stats logic (uses filteredTickets)
  const stats = useMemo(() => {
    const open = filteredTickets.filter(t => t.status === 'open' || t.status === 'in-progress').length;
    const resolved = filteredTickets.filter(t => t.status === 'resolved').length;

    const cats: Record<string, number> = {};
    filteredTickets.forEach(t => {
      const translated = translateCategory(t.category);
      cats[translated] = (cats[translated] || 0) + 1;
    });
    const categoryData = Object.entries(cats).map(([name, value]) => ({ name, value }));

    const months: Record<string, { ai: number; quicktap: number; manual: number }> = {};
    filteredTickets.forEach(t => {
      const mo = format(parseISO(t.createdAt), 'MMM yyyy', { locale: isEn ? undefined : he });
      if (!months[mo]) {
        months[mo] = { ai: 0, quicktap: 0, manual: 0 };
      }
      const method = t.reportingMethod || t.source || 'manual';
      if (method === 'ai_camera') {
        months[mo].ai += 1;
      } else if (method === 'quicktap') {
        months[mo].quicktap += 1;
      } else {
        months[mo].manual += 1;
      }
    });
    const monthlyData = Object.entries(months).map(([name, data]) => ({
      name,
      ai: data.ai,
      quicktap: data.quicktap,
      manual: data.manual
    })).reverse();

    return { open, resolved, categoryData, monthlyData };
  }, [filteredTickets, isEn]);

  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const ticketId = draggableId;
    const ticket = tickets.find(t => t.id === ticketId);
    const newStatus = destination.droppableId as Ticket['status'];

    // If resolving, open the modal and don't update status yet
    if (newStatus === 'resolved') {
      setClosureTicketId(ticketId);
      return;
    }

    // Optimistically update local state for smoothness
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));

    try {
      await handleStatusUpdate(ticketId, newStatus, ticket);
    } catch (error) {
      console.error("Failed to update status via drag and drop:", error);
      fetchData(); // Revert on failure
    }
  };

  const renderColumn = (statusKey: string, title: string, colorClass: string, statuses: string[]) => {
    const columnTickets = filteredTickets.filter(t => statuses.includes(t.status));

    return (
      <div className="flex flex-col bg-slate-100/50 rounded-2xl p-4 min-h-[500px]">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800">{title}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${colorClass}`}>
              {columnTickets.length}
            </span>
          </div>
        </div>

        <Droppable droppableId={statusKey}>
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={`flex-1 flex flex-col gap-4 transition-colors rounded-xl p-1 ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                }`}
            >
              {columnTickets.map((t, index) => (
                <Draggable key={t.id} draggableId={t.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`${getSlaColorClasses(
                        tenantConfig?.slaConfig?.enabled !== false && (t.status === 'open' || t.status === 'in-progress')
                          ? (t.slaStatus || getSlaStatus(calculateWorkingDays(
                            t.lastStatusChangeAt || t.createdAt,
                            new Date(),
                            tenantConfig?.slaConfig?.workingDays || [0, 1, 2, 3, 4],
                            holidays
                          )))
                          : 'none'
                      )} p-4 rounded-2xl shadow-sm border transition-all relative group ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl ring-2 ring-blue-500/20 z-50' : 'hover:shadow-md'
                        }`}
                      onClick={() => {
                        if (snapshot.isDragging) return;
                      }}
                    >
                      {/* Top Row: #/Urgency (Right) and Date/Time (Left) */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            {...provided.dragHandleProps}
                            className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100 shrink-0"
                            title={isEn ? "Drag to move status" : "גרור כדי לשנות סטטוס"}
                          >
                            <GripVertical size={16} />
                          </div>
                          <select
                            value={t.urgency}
                            disabled={updatingId === t.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleUrgencyUpdate(t, e.target.value as Ticket['urgency'])}
                            className={`text-xs font-black px-2 py-0.5 rounded border-none appearance-none cursor-pointer transition-colors focus:ring-2 focus:ring-blue-200 outline-none ${t.urgency === 'High' ? 'bg-red-600 text-white shadow-sm' :
                              t.urgency === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}
                          >
                            <option value="High">{uiLabels.urgency.High}</option>
                            <option value="Moderate">{uiLabels.urgency.Moderate}</option>
                            <option value="Low">{uiLabels.urgency.Low}</option>
                          </select>
                          <select
                            value={(t.status as string) === 'progress' ? 'in-progress' : (t.status as string) === 'closed' ? 'resolved' : t.status}
                            disabled={updatingId === t.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const newStatus = e.target.value as Ticket['status'];
                              if (newStatus === 'resolved') {
                                setClosureTicketId(t.id);
                              } else {
                                handleStatusUpdate(t.id, newStatus, t);
                              }
                            }}
                            className="text-xs font-black px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-700 cursor-pointer transition-colors focus:ring-2 focus:ring-blue-200 outline-none"
                          >
                            <option value="open">{isEn ? 'New' : 'חדש'}</option>
                            <option value="in-progress">{isEn ? 'In Progress' : 'בטיפול'}</option>
                            <option value="resolved">{isEn ? 'Resolved' : 'טופל'}</option>
                            <option value="dismissed">{isEn ? 'Dismissed' : 'בוטל'}</option>
                          </select>
                          
                        </div>
                        <div className="text-xs text-slate-400 font-bold text-left shrink-0">
                          {new Date(t.createdAt).toLocaleTimeString(isHe ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })} {new Date(t.createdAt).toLocaleDateString(isHe ? 'he-IL' : 'en-US')}
                        </div>
                      </div>

                      {/* Tags block (below top row) */}
                      <div className="mb-2 flex flex-wrap gap-1.5 justify-start items-center">
                        <span className="text-[11px] font-extrabold text-slate-500 bg-slate-100/60 border border-slate-200/50 px-1.5 py-0.5 rounded select-none">
                          #{t.ticketNumber}
                        </span>

                        <span className="text-[11px] font-extrabold text-slate-600 bg-slate-100/80 border border-slate-200/60 px-1.5 py-0.5 rounded flex items-center gap-1 select-none" title={t.source === 'whatsapp' ? (isEn ? 'WhatsApp Bot' : 'בוט וואטסאפ') : (isEn ? 'Resident Web' : 'ווב דייר')}>
                          {t.source === 'whatsapp'
                            ? (isEn ? '🤖 Bot' : '🤖 בוט')
                            : (isEn ? '📱 Web' : '📱 ווב')}
                        </span>
                        
                        {(t.reportingMethod === 'quicktap' || t.source === 'quicktap') && (
                          <span className="bg-blue-600 text-white text-[11px] font-black px-2 py-0.5 rounded flex items-center gap-1 shadow-sm select-none" title={isEn ? "QuickTap" : "דיווח מהיר"}>
                            ⚡ {isEn ? "QuickTap" : "דיווח מהיר ⚡"}
                          </span>
                        )}
                        {(t.reportingMethod === 'ai_camera' || t.source === 'ai_camera') && (
                          <span className="bg-blue-600 text-white text-[11px] font-black px-2 py-0.5 rounded flex items-center gap-1 shadow-sm select-none" title={isEn ? "AI Camera" : "צילום AI"}>
                            📸 {isEn ? "AI Camera" : "צילום AI 📸"}
                          </span>
                        )}
                      </div>

                      {/* Category & Summary */}
                      <div className="mb-4">
                        <div className="text-lg font-black text-slate-900 mb-1 leading-tight">
                          {translateCategory(t.category)}
                        </div>
                        <p
                          className="text-base text-slate-700 line-clamp-3 leading-relaxed font-medium cursor-help"
                          title={t.summary || (isEn ? 'No summary' : 'אין תיאור')}
                        >
                          {t.summary || (isEn ? 'No summary' : 'אין תיאור')}
                        </p>

                        {/* Closure Reason & Resolution Notes */}
                        {(t.status === 'resolved' || t.status === 'dismissed') && (t.closureReason || t.resolutionNote || t.vaadRating) && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1.5 text-right" dir={isHe ? 'rtl' : 'ltr'}>
                            {t.closureReason && (
                              <div className="flex items-center gap-1.5 font-bold">
                                <span className="text-slate-400 font-medium">
                                  {isEn ? "Closure Reason:" : "סיבת סגירה:"}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-700">
                                  {(() => {
                                    const mapping: Record<string, { he: string, en: string }> = {
                                      'fixed': { he: 'טופל', en: 'Fixed' },
                                      'duplicate': { he: 'כפילות', en: 'Duplicate' },
                                      'irrelevant': { he: 'לא רלוונטי', en: 'Irrelevant' },
                                      'vendor': { he: 'בטיפול ספק', en: 'Vendor Dispatched' },
                                      'outside': { he: 'מחוץ לאחריות', en: 'Outside Scope' },
                                      'rejected': { he: 'נדחה', en: 'Rejected' }
                                    };
                                    const entry = mapping[t.closureReason];
                                    return entry ? (isEn ? entry.en : entry.he) : t.closureReason;
                                  })()}
                                </span>
                              </div>
                            )}
                            {t.resolutionNote && (
                              <div className="text-slate-600 italic leading-normal">
                                <span className="font-bold text-slate-400 not-italic">
                                  {isEn ? "Notes: " : "הערת סגירה: "}
                                </span>
                                "{t.resolutionNote}"
                              </div>
                            )}
                            {t.vaadRating && (
                              <div className="flex items-center gap-1.5 font-bold mt-1">
                                <span className="text-slate-400 font-medium">
                                  {isEn ? "Vaad Feedback:" : "משוב דייר על הטיפול:"}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full font-bold ${t.vaadRating === 'good' ? 'bg-green-100 text-green-700' :
                                    t.vaadRating === 'ok' ? 'bg-amber-100 text-amber-700' :
                                      'bg-red-100 text-red-700'
                                  }`}>
                                  {(() => {
                                    if (t.vaadRating === 'good') return isEn ? 'Excellent 🤩' : 'מצוין 🤩';
                                    if (t.vaadRating === 'ok') return isEn ? 'Satisfactory 👍' : 'בסדר 👍';
                                    return isEn ? 'Dissatisfied 👎' : 'לא מרוצה 👎';
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Interaction Row: Comment (Right), Image, Audio */}
                      <div className="flex items-center gap-3 pt-3 border-t border-slate-50 mb-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCommentTicketId(t.id);
                          }}
                          className="flex items-center gap-1.5 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <MessageSquare size={18} className={t.adminComments?.length ? 'text-blue-500' : ''} />
                          {t.adminComments && t.adminComments.length > 0 && (
                            <span className="text-xs font-bold text-slate-500">{t.adminComments.length}</span>
                          )}
                        </button>

                        {t.meToo && t.meToo > 0 ? (
                          <div 
                            className="flex items-center gap-1 bg-blue-50 text-blue-600 rounded-lg px-2 py-1 text-xs font-bold select-none cursor-default" 
                            title={(() => {
                              const prefix = isEn ? "Joined the report:" : "הצטרפו לדיווח:";
                              if (!t.meTooReporters || t.meTooReporters.length === 0) {
                                return prefix;
                              }
                              const names = t.meTooReporters.map((r: any) => `- ${r.name || (isEn ? 'Resident' : 'תושב')}`).join('\n');
                              return `${prefix}\n${names}`;
                            })()}
                          >
                            <span>🙋</span>
                            <span>{t.meToo}</span>
                          </div>
                        ) : null}

                        {t.imageId && typeof t.imageId === 'string' && t.imageId.length > 5 && (
                          <a
                            href={`/img/${tenantId}/${t.imageId}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title={isEn ? "View Image" : "צפה בתמונה"}
                          >
                            <ImageIcon size={18} />
                          </a>
                        )}

                        {t.audioId && typeof t.audioId === 'string' && t.audioId.length > 5 && t.audioId !== 'null' && (
                          <InlineAudioPlayer src={`/aud/${tenantId}/${t.audioId}`} isEn={isEn} />
                        )}
                      </div>

                      {/* Bottom Info: Reporter (Right), Location, Sublocation */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-black">
                        {t.reporterName && (
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                            {t.reporterName}
                          </span>
                        )}
                        {t.location && (
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg">
                            {t.location}
                          </span>
                        )}
                        {t.subLocation && (
                          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">
                            {t.subLocation}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50">{isEn ? 'Loading...' : 'טוען...'}</div>;
  if (!user) return <Navigate to="/admin/login" />;

  const hasActiveFilters = filters.search || filters.timeRange !== 'all' || filters.category !== 'all' || filters.location !== 'all' || filters.subLocation !== 'all' || filters.severity !== 'all' || filters.statuses.length < 3;

  return (
    <div className="min-h-screen bg-white" dir={isEn ? 'ltr' : 'rtl'}>
      <header className="bg-slate-900 text-white p-3 md:p-5 sticky top-0 z-50 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-2 md:px-4">
          <div className="flex items-center gap-2 md:gap-4 text-right" dir={isEn ? "ltr" : "rtl"}>
            <div className="flex items-center justify-center transition-transform hover:scale-105 shrink-0">
              <img
                src="/logo_transparent.png"
                alt="TikTak"
                className="h-12 md:h-20 w-auto object-contain filter drop-shadow-[0_0_1px_rgba(255,255,255,0.5)]"
              />
            </div>

            <span className="text-slate-600 font-light text-xl md:text-2xl hidden sm:inline">|</span>

            {myTenants.length > 1 ? (
              <div className="relative">
                <select
                  value={tenantId}
                  onChange={(e) => navigate(`/admin/${e.target.value}/dashboard`)}
                  className="bg-slate-800 text-slate-200 text-sm md:text-lg font-medium py-1 pl-8 pr-3 md:px-4 md:pl-10 rounded-lg border border-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer hover:bg-slate-700 transition-colors truncate max-w-[150px] sm:max-w-[200px] md:max-w-none"
                  dir={isEn ? "ltr" : "rtl"}
                >
                  {myTenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.id}
                    </option>
                  ))}
                </select>
                <ChevronDown className={`absolute top-1/2 -translate-y-1/2 ${isEn ? 'right-2' : 'left-2'} text-slate-400 pointer-events-none`} size={16} />
              </div>
            ) : (
              <span className="text-sm md:text-lg text-slate-300 font-medium truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
                {tenantConfig?.name || tenantId}
              </span>
            )}

            <span className="text-slate-600 font-light text-xl md:text-2xl hidden md:inline">|</span>

            <span className="text-sm md:text-lg text-white font-bold whitespace-nowrap hidden md:inline">
              {isEn ? 'Dashboard' : 'דשבורד'}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {isSuper && (
              <Link
                to="/admin/god-view"
                className="hidden sm:flex items-center gap-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 px-3 md:px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-900/20"
              >
                <Shield size={14} /> {isEn ? 'God Mode' : 'מצב אל'}
              </Link>
            )}
            <Link
              to={`/admin/${tenantId}/settings`}
              className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-3 md:px-4 py-2 rounded-lg transition-all border border-slate-700 flex items-center gap-2"
              title={uiLabels.settings}
            >
              <span className="hidden md:inline">{uiLabels.settings}</span>
              <span className="md:hidden">⚙️</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-500 px-3 md:px-4 py-2 rounded-lg transition-all border border-red-500/30 flex items-center gap-2"
              title={isEn ? "Logout" : "התנתק"}
            >
              <LogOut size={16} />
              <span className="hidden md:inline">{isEn ? 'Logout' : 'התנתק'}</span>
            </button>
            <button
              onClick={() => setIsHelpOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all shrink-0"
              title={isHe ? "עזרה ומדריך" : "Help & Guide"}
            >
              <HelpCircle size={24} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex flex-col gap-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-medium">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-center">
            <h3 className="text-slate-500 font-medium mb-1">{uiLabels.stats_open}</h3>
            <p className="text-5xl font-black text-blue-700">{stats.open}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl border border-green-100 shadow-sm flex flex-col justify-center">
            <h3 className="text-slate-500 font-medium mb-1">{uiLabels.stats_closed}</h3>
            <p className="text-5xl font-black text-green-700">{stats.resolved}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-[320px] flex flex-col items-center">
            <h3 className="text-sm font-bold text-slate-700 mb-2 w-full text-center">{uiLabels.pie_title}</h3>
            {stats.categoryData.length > 0 ? (
              <div className="w-full flex-1 min-h-0">
                <ResponsiveContainer width="99%" height={250}>
                  <PieChart margin={{ top: 10, bottom: 10 }}>
                    <Pie
                      data={stats.categoryData}
                      cx="50%"
                      cy="45%"
                      innerRadius={35}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {stats.categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value} ${isEn ? 'Tickets' : 'פניות'}`, name]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: '10px',
                        paddingTop: '20px',
                        maxHeight: '100px',
                        overflowY: 'auto'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">{isEn ? 'No category data' : 'אין נתוני קטגוריות'}</div>
            )}
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-[320px] flex flex-col items-center justify-center">
            <h3 className="text-sm font-bold text-slate-700 mb-2 w-full text-center">{uiLabels.bar_title}</h3>
            {stats.monthlyData.length > 0 ? (
              <div className="w-full flex-1 min-h-0" dir="ltr">
                <ResponsiveContainer width="99%" height={250}>
                  <BarChart data={stats.monthlyData} margin={{ left: 5, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} interval={0} tick={{ fontSize: 8 }} />
                    <YAxis fontSize={10} width={35} tick={{ fontSize: 8 }} tickMargin={5} />
                    <Tooltip content={<CustomTooltip isEn={isEn} />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="ai" name={isEn ? "AI Camera" : "מצלמת AI"} stackId="a" fill="#3b82f6" />
                    <Bar dataKey="quicktap" name={isEn ? "QuickTap ⚡" : "דיווח מהיר ⚡"} stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="manual" name={isEn ? "Manual" : "דיווח ידני"} stackId="a" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">{isEn ? 'No trends data' : 'אין נתוני מגמות'}</div>
            )}
          </div>
        </section>

        <section className="bg-slate-50/50 p-3 rounded-2xl border border-slate-200 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col lg:flex-row items-end gap-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:flex xl:flex-nowrap gap-3 w-full lg:w-auto">
              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.filters.time}</label>
                <select
                  value={filters.timeRange}
                  onChange={e => setFilters({ ...filters, timeRange: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  {Object.entries(uiLabels.filters.ranges).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[120px] relative">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.filters.status}</label>
                <button
                  onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer flex items-center justify-between gap-2 min-h-[34px]"
                >
                  <span className="truncate">
                    {filters.statuses.length === 3
                      ? uiLabels.filters.all
                      : filters.statuses.map(s => statusOptions.find(opt => opt.id === s)?.label).join(', ')}
                  </span>
                  <ChevronDown size={14} className={`transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {isStatusFilterOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsStatusFilterOpen(false)}
                    />
                    <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-2 min-w-[140px] animate-in fade-in zoom-in-95 duration-100">
                      {statusOptions.map(option => (
                        <label
                          key={option.id}
                          className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={filters.statuses.includes(option.id)}
                            onChange={(e) => {
                              const newStatuses = e.target.checked
                                ? [...filters.statuses, option.id]
                                : filters.statuses.filter(s => s !== option.id);
                              if (newStatuses.length > 0) {
                                setFilters({ ...filters, statuses: newStatuses });
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-bold text-slate-700">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-1.5 min-w-[100px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.filters.severity}</label>
                <select
                  value={filters.severity}
                  onChange={e => setFilters({ ...filters, severity: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  <option value="all">{uiLabels.filters.all}</option>
                  <option value="High">{uiLabels.urgency.High}</option>
                  <option value="Moderate">{uiLabels.urgency.Moderate}</option>
                  <option value="Low">{uiLabels.urgency.Low}</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.filters.category}</label>
                <select
                  value={filters.category}
                  onChange={e => setFilters({ ...filters, category: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  <option value="all">{uiLabels.filters.all}</option>
                  {tenantConfig?.config?.categories?.map((c: string) => <option key={c} value={c}>{translateCategory(c)}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.location}</label>
                <select
                  value={filters.location}
                  onChange={e => setFilters({ ...filters, location: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  <option value="all">{uiLabels.filters.all}</option>
                  {(tenantConfig?.config?.locations || tenantConfig?.config?.floors || [])?.map((l: string) => <option key={l} value={l}>{l.startsWith('-') || !isNaN(Number(l)) ? `\u200E${l}` : l}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.subLocation}</label>
                <select
                  value={filters.subLocation}
                  onChange={e => setFilters({ ...filters, subLocation: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  <option value="all">{uiLabels.filters.all}</option>
                  {(tenantConfig?.config?.subLocations || tenantConfig?.config?.resources || [])?.map((sl: string) => <option key={sl} value={sl}>{sl.startsWith('-') || !isNaN(Number(sl)) ? `\u200E${sl}` : sl}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{uiLabels.filters.source}</label>
                <select
                  value={filters.source}
                  onChange={e => setFilters({ ...filters, source: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  <option value="all">{uiLabels.filters.all}</option>
                  <option value="ai_camera">{isEn ? 'AI Camera' : 'מצלמת AI'}</option>
                  <option value="manual">{isEn ? 'Manual' : 'ידני'}</option>
                  <option value="quicktap">{isEn ? 'QuickTap' : 'דיווח מהיר ⚡'}</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[120px]">
                <label className="text-xs font-bold text-slate-500 px-1 whitespace-nowrap">{isEn ? 'Channel' : 'ערוץ דיווח'}</label>
                <select
                  value={filters.channel}
                  onChange={e => setFilters({ ...filters, channel: e.target.value })}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm cursor-pointer"
                >
                  <option value="all">{uiLabels.filters.all}</option>
                  <option value="web">{isEn ? 'Web App 📱' : 'ווב דייר 📱'}</option>
                  <option value="whatsapp">{isEn ? 'WhatsApp 🤖' : 'וואטסאפ 🤖'}</option>
                </select>
              </div>

            </div>

            <div className="flex-1 w-full lg:w-auto flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 px-1">{uiLabels.filters.search}</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder={uiLabels.filters.search}
                    value={filters.search}
                    onChange={e => setFilters({ ...filters, search: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-10 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-inner"
                  />
                  {filters.search && (
                    <button
                      onClick={() => setFilters({ ...filters, search: '' })}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleExportCSV}
                  className="h-[38px] w-[38px] flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md group border border-blue-500 shrink-0"
                  title="ייצא מסנן"
                >
                  <Download size={18} />
                </button>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="h-[38px] w-[38px] flex items-center justify-center bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-200 shadow-sm group shrink-0"
                    title={uiLabels.filters.clear}
                  >
                    <X size={18} className="group-hover:rotate-90 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {filters.timeRange === 'custom' && (
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-4 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-slate-400" />
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <span className="text-slate-400 font-bold">→</span>
                  <div className="flex flex-col gap-1">
                    <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {loading ? (
          <div className="py-20 text-center text-slate-500">{uiLabels.loading}</div>
        ) : (
          <section className="mt-8">
            <div className="flex lg:hidden bg-slate-100 p-1 rounded-xl mb-6">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'new' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                {uiLabels.tab_new}
              </button>
              <button
                onClick={() => setActiveTab('progress')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'progress' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}
              >
                {uiLabels.tab_progress}
              </button>
              <button
                onClick={() => setActiveTab('resolved')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'resolved' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}
              >
                {uiLabels.tab_resolved}
              </button>
            </div>
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={activeTab === 'new' ? 'block' : 'hidden lg:block'}>
                  {renderColumn('open', uiLabels.new, 'bg-blue-100 text-blue-700', ['open'])}
                </div>
                <div className={activeTab === 'progress' ? 'block' : 'hidden lg:block'}>
                  {renderColumn('in-progress', uiLabels.progress, 'bg-amber-100 text-amber-700', ['in-progress', 'progress'])}
                </div>
                <div className={activeTab === 'resolved' ? 'block' : 'hidden lg:block'}>
                  {renderColumn('resolved', uiLabels.resolved, 'bg-green-100 text-green-700', ['resolved', 'dismissed'])}
                </div>
              </div>
            </DragDropContext>
          </section>
        )}

        <CommentModal
          isOpen={!!commentTicketId}
          onClose={() => setCommentTicketId(null)}
          ticket={tickets.find(t => t.id === commentTicketId) || null}
          onSave={handleSaveComment}
          onSaveAndSendWhatsApp={handleSaveAndSendWhatsAppComment}
          onSendWhatsApp={handleSendWhatsAppComment}
          onDelete={handleDeleteComment}
          isEn={isEn}
        />
        {closureTicketId && (
          <ClosureModal
            isOpen={!!closureTicketId}
            onClose={() => setClosureTicketId(null)}
            ticket={tickets.find(t => t.id === closureTicketId) || null}
            onConfirm={(_, reason, notes) => handleConfirmResolution(tickets.find(t => t.id === closureTicketId)!, reason, notes)}
            isEn={isEn}
          />
        )}

        <HelpModal
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
          language={isEn ? 'en' : 'he'}
          tenantId={tenantId || ''}
          tenantName={tenantConfig?.name || ''}
        />

        <ConfirmModal
          isOpen={confirmState.isOpen}
          onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmState.onConfirm}
          title={confirmState.title}
          message={confirmState.message}
          type={confirmState.type}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          isEn={isEn}
        />
      </main>
    </div>
  );
}
