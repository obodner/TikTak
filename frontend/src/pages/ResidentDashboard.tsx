import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MessageSquare, AlertTriangle, Send, Clock, User, Eye, EyeOff } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Comment {
  text: string;
  createdAt: string;
  author: string;
}

interface Ticket {
  id: string;
  ticketNumber: number;
  createdAt: string;
  summary: string;
  category: string;
  urgency: string;
  location?: string;
  subLocation?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'dismissed';
  imageId?: string;
  audioId?: string;
  meToo?: number;
  timeline?: Comment[];
  isMyTicket?: boolean;
}

export default function ResidentDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t, i18n } = useTranslation();
  const isHe = i18n.language === 'he';

  const [activeTab, setActiveTab] = useState<'my-reports' | 'open-reports'>('my-reports');

  // Input Preservation states
  const [phoneInput, setPhoneInput] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // Auth / Loading states
  const [reporterPhone, setReporterPhone] = useState<string | null>(null);
  const [isPhoneLoading, setIsPhoneLoading] = useState(true);
  const [phoneError, setPhoneError] = useState('');
  const [isSubmittingPhone, setIsSubmittingPhone] = useState(false);

  // Tenant meta
  const [tenantName, setTenantName] = useState('');
  const [address, setAddress] = useState('');

  // Ticket data
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [openTickets, setOpenTickets] = useState<Ticket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [ticketError, setTicketError] = useState('');

  // Card expansion & loading state
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);
  const [meTooClickingId, setMeTooClickingId] = useState<string | null>(null);

  // Local storage map for Me Too clicks
  const [meTooMap, setMeTooMap] = useState<Record<string, boolean>>({});

  // 1. Initial Local Phone Caching
  useEffect(() => {
    const savedPhone = localStorage.getItem('tiktak_reporter_phone');
    if (savedPhone) {
      setReporterPhone(savedPhone);
    }
    setIsPhoneLoading(false);

    // Load Me Too records
    try {
      const storedMap = localStorage.getItem('tiktak_resident_metoo_map');
      if (storedMap) {
        setMeTooMap(JSON.parse(storedMap));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 2. Fetch Tenant metadata (same as ResidentFlow)
  useEffect(() => {
    if (!tenantId) return;
    async function loadTenantMeta() {
      try {
        const response = await fetch(`/api/buildingInfo?tenantId=${tenantId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.name) setTenantName(data.name);
          if (data.address) setAddress(data.address);
          if (data.language) {
            i18n.changeLanguage(data.language);
          }
        }
      } catch (err) {
        console.error("Failed to load tenant metadata", err);
      }
    }
    loadTenantMeta();
  }, [tenantId]);

  // 3. Fetch Tickets
  const fetchTickets = async (phone: string | null) => {
    if (!tenantId) return;
    setIsLoadingTickets(true);
    setTicketError('');
    try {
      const response = await fetch('/api/getResidentTickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          reporterPhone: phone || undefined
        })
      });

      if (response.status === 403) {
        const errData = await response.json().catch(() => ({}));
        setPhoneError(errData.message || t('phone_not_registered_notice'));
        setReporterPhone(null);
        localStorage.removeItem('tiktak_reporter_phone');
      } else if (!response.ok) {
        throw new Error('Failed to load tickets');
      } else {
        const data = await response.json();
        setMyTickets(data.myTickets || []);
        setOpenTickets(data.openTickets || []);
        setPhoneError('');
      }
    } catch (err: any) {
      console.error(err);
      setTicketError(t('error') || 'שגיאה בטעינת נתונים');
    } finally {
      setIsLoadingTickets(false);
    }
  };

  // Trigger fetch when phone state updates
  useEffect(() => {
    if (!isPhoneLoading) {
      fetchTickets(reporterPhone);
    }
  }, [reporterPhone, isPhoneLoading, tenantId]);

  // 4. Phone Number Submission
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/\D/g, '');
    const isPhoneValid = /^0\d{8,9}$/.test(cleanPhone);

    if (!isPhoneValid) {
      setPhoneError(t('phone_error') || 'מספר תקין מתחיל ב-0 ומכיל 9-10 ספרות');
      return;
    }

    setPhoneError('');
    setIsSubmittingPhone(true);

    try {
      // Pre-check authentication via backend
      const response = await fetch('/api/checkAuth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          reporterPhone: cleanPhone
        })
      });

      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        setPhoneError(data.message || t('phone_not_registered_notice'));
      } else if (!response.ok) {
        throw new Error('Failed to authenticate phone number');
      } else {
        localStorage.setItem('tiktak_reporter_phone', cleanPhone);
        setReporterPhone(cleanPhone);
      }
    } catch (err) {
      setPhoneError(t('error') || 'ארעה שגיאה בבדיקת מספר הטלפון');
    } finally {
      setIsSubmittingPhone(false);
    }
  };

  // 5. Submit Comment
  const handleAddComment = async (ticketId: string) => {
    const text = commentDrafts[ticketId]?.trim();
    if (!text || !reporterPhone || !tenantId) return;

    setSubmittingCommentId(ticketId);
    try {
      const response = await fetch('/api/addResidentComment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ticketId,
          commentText: text,
          reporterPhone
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update local tickets in memory to show the comment instantly
        const updateTicketsList = (prev: Ticket[]) =>
          prev.map(t => {
            if (t.id === ticketId) {
              const updatedTimeline = [...(t.timeline || []), data.comment];
              return { ...t, timeline: updatedTimeline };
            }
            return t;
          });

        setMyTickets(updateTicketsList);
        setOpenTickets(updateTicketsList);

        // Clear comment draft
        setCommentDrafts(prev => ({ ...prev, [ticketId]: '' }));

        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      } else {
        alert(t('error') || 'שגיאה בשליחת תגובה');
      }
    } catch (err) {
      console.error(err);
      alert(t('error') || 'שגיאה בשליחת תגובה');
    } finally {
      setSubmittingCommentId(null);
    }
  };

  // 6. Increment Me Too
  const handleMeToo = async (ticketId: string) => {
    if (meTooClickingId || meTooMap[ticketId] || !reporterPhone || !tenantId) return;

    setMeTooClickingId(ticketId);
    try {
      const response = await fetch('/api/incrementMeToo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ticketId,
          reporterPhone
        })
      });

      if (response.ok) {
        // Toggle active design & lock click
        const nextMap = { ...meTooMap, [ticketId]: true };
        setMeTooMap(nextMap);
        localStorage.setItem('tiktak_resident_metoo_map', JSON.stringify(nextMap));

        // Increment locally
        const updateList = (prev: Ticket[]) =>
          prev.map(t => (t.id === ticketId ? { ...t, meToo: (t.meToo || 0) + 1 } : t));

        setMyTickets(updateList);
        setOpenTickets(updateList);

        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMeTooClickingId(null);
    }
  };

  // Helpers
  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'dd/MM/yyyy HH:mm', { locale: isHe ? he : undefined });
    } catch (e) {
      return dateStr;
    }
  };

  const getStatusStyle = (status: Ticket['status']) => {
    if (status === 'resolved' || status === 'dismissed') {
      return 'bg-emerald-500 text-white font-extrabold shadow-sm shadow-emerald-100';
    }
    if (status === 'in-progress') {
      return 'bg-amber-500 text-white font-extrabold shadow-sm shadow-amber-100';
    }
    return 'bg-white text-slate-700 border border-slate-200 font-extrabold';
  };

  const getStatusLabel = (status: Ticket['status']) => {
    if (status === 'resolved') return isHe ? 'טופל ונסגר' : 'Resolved';
    if (status === 'dismissed') return isHe ? 'נדחה / לא רלוונטי' : 'Dismissed';
    if (status === 'in-progress') return isHe ? 'בטיפול' : 'In Progress';
    return isHe ? 'חדש' : 'New';
  };

  const getUrgencyLabel = (urgency: string) => {
    const mapping: Record<string, string> = {
      'High': isHe ? 'דחוף' : 'High',
      'Moderate': isHe ? 'בינוני' : 'Moderate',
      'Low': isHe ? 'נמוך' : 'Low'
    };
    return mapping[urgency] || urgency;
  };

  const getCategoryLabel = (category: string) => {
    const mapping: Record<string, string> = {
      'Electrical': isHe ? 'חשמל' : 'Electrical',
      'Plumbing': isHe ? 'אינסטלציה' : 'Plumbing',
      'Elevator': isHe ? 'מעלית' : 'Elevator',
      'Cleaning': isHe ? 'ניקיון' : 'Cleaning',
      'Safety': isHe ? 'בטיחות' : 'Safety',
      'Other': isHe ? 'אחר' : 'Other'
    };
    return mapping[category] || category;
  };

  // Rendering loading state
  if (isPhoneLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans" dir={isHe ? 'rtl' : 'ltr'}>
      {/* Sticky Header and Tabs wrapper */}
      <div className="sticky top-0 z-40 bg-slate-50 border-b border-slate-100 shadow-sm">
        {/* 1. Header Area */}
        <header className="bg-white py-3 px-4 flex items-center gap-3">
          <Link
            to={`/report/${tenantId}`}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors duration-150 active:scale-90"
          >
            <ChevronRight className={`w-6 h-6 text-slate-700 ${isHe ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-black text-slate-900 leading-tight">
              {address || tenantName || t('view_previous_reports')}
            </h1>
            <p className="text-xs text-slate-400 font-bold">
              {isHe ? 'מעקב וסטטוס פניות הבניין' : 'Building Incidents Status Tracking'}
            </p>
          </div>
          <div className="h-8 w-auto shrink-0 select-none">
            <img src="/logo_transparent.png" alt="TikTak" className="h-full object-contain" />
          </div>
        </header>

        {/* 2. Tabs Selector (placed in sticky container) */}
        <div className="w-full max-w-sm mx-auto px-4 pt-2 pb-3">
          <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
            <button
              onClick={() => setActiveTab('my-reports')}
              className={`flex-1 py-3 text-sm font-black rounded-xl transition-all duration-200 active:scale-95 ${
                activeTab === 'my-reports'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('my_reports_tab')}
            </button>
            <button
              onClick={() => setActiveTab('open-reports')}
              className={`flex-1 py-3 text-sm font-black rounded-xl transition-all duration-200 active:scale-95 ${
                activeTab === 'open-reports'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t('open_reports_tab')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <main className="flex-1 w-full max-w-sm mx-auto px-4 py-4 flex flex-col gap-6">

        {/* Tab Contents */}
        {activeTab === 'my-reports' ? (
          /* TAB 1: My Reports */
          !reporterPhone ? (
            /* Missing Phone Notice Component */
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-md text-center flex flex-col items-center gap-4 animate-in slide-in-from-bottom-3 duration-300">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-800 text-lg">
                  {t('phone_not_registered_notice')}
                </h3>
                <p className="text-xs text-slate-400 font-bold px-4">
                  {t('enter_phone_label')}
                </p>
              </div>

              {phoneError && (
                <div className="bg-red-50 text-red-600 text-xs font-bold py-2.5 px-4 rounded-xl border border-red-100 w-full">
                  {phoneError}
                </div>
              )}

              <form onSubmit={handlePhoneSubmit} className="w-full space-y-3">
                <input
                  type="tel"
                  placeholder="05X-XXXXXXX"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-2xl py-3 px-4 text-center font-bold text-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all bg-slate-50"
                  disabled={isSubmittingPhone}
                />
                <button
                  type="submit"
                  disabled={isSubmittingPhone || !phoneInput.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-black text-base shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingPhone ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : (
                    t('submit_phone_btn')
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Vertical List of Personal Reports */
            <div className="space-y-4">
              {isLoadingTickets && (
                <div className="text-center py-10">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-bold">{isHe ? 'טוען פניות...' : 'Loading...'}</p>
                </div>
              )}

              {ticketError && (
                <div className="bg-red-50 border border-red-200 text-red-700 py-3 px-4 rounded-2xl text-xs font-bold text-center">
                  {ticketError}
                </div>
              )}

              {!isLoadingTickets && !ticketError && myTickets.length > 0 && (
                <div className="grid grid-cols-4 gap-2 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
                  {/* Total */}
                  <div className="flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1.5 mb-1 justify-center w-full">
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{isHe ? 'סה"כ' : 'Total'}</span>
                    </div>
                    <span className="text-xl font-black text-slate-800">{myTickets.length}</span>
                  </div>
                  {/* New */}
                  <div className="flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1.5 mb-1 justify-center w-full">
                      <span className="w-2 h-2 rounded-full bg-white border border-slate-800 shrink-0" />
                      <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{isHe ? 'חדש' : 'New'}</span>
                    </div>
                    <span className="text-xl font-black text-slate-800">{myTickets.filter(t => t.status === 'open').length}</span>
                  </div>
                  {/* In Progress */}
                  <div className="flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1.5 mb-1 justify-center w-full">
                      <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                      <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{isHe ? 'בטיפול' : 'In Progress'}</span>
                    </div>
                    <span className="text-xl font-black text-slate-800">{myTickets.filter(t => t.status === 'in-progress').length}</span>
                  </div>
                  {/* Closed */}
                  <div className="flex flex-col items-center justify-center p-1 text-center">
                    <div className="flex items-center gap-1.5 mb-1 justify-center w-full">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{isHe ? 'סגור' : 'Closed'}</span>
                    </div>
                    <span className="text-xl font-black text-slate-800">{myTickets.filter(t => ['resolved', 'dismissed'].includes(t.status)).length}</span>
                  </div>
                </div>
              )}

              {!isLoadingTickets && !ticketError && myTickets.length === 0 && (
                <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm">
                  <p className="text-slate-400 font-bold text-sm italic">
                    {isHe ? 'לא נמצאו דיווחים שלך ב-12 החודשים האחרונים.' : 'No reports found in the last 12 months.'}
                  </p>
                </div>
              )}

              {!isLoadingTickets && !ticketError && myTickets.map(ticket => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  tenantId={tenantId!}
                  isHe={isHe}
                  t={t}
                  formatDate={formatDate}
                  getStatusStyle={getStatusStyle}
                  getStatusLabel={getStatusLabel}
                  getUrgencyLabel={getUrgencyLabel}
                  getCategoryLabel={getCategoryLabel}
                  isExpanded={expandedTicketId === ticket.id}
                  onToggleExpand={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                  commentDraft={commentDrafts[ticket.id] || ''}
                  onChangeCommentDraft={(val) => setCommentDrafts(prev => ({ ...prev, [ticket.id]: val }))}
                  onSubmitComment={() => handleAddComment(ticket.id)}
                  submittingComment={submittingCommentId === ticket.id}
                  onMeToo={() => handleMeToo(ticket.id)}
                  isMeTooClicked={!!meTooMap[ticket.id]}
                  meTooClicking={meTooClickingId === ticket.id}
                  showMeToo={false}
                />
              ))}
            </div>
          )
        ) : (
          /* TAB 2: Open Reports */
          <div className="flex flex-col gap-6">
            {isLoadingTickets && (
              <div className="text-center py-10">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-bold">{isHe ? 'טוען פניות...' : 'Loading...'}</p>
              </div>
            )}

            {ticketError && (
              <div className="bg-red-50 border border-red-200 text-red-700 py-3 px-4 rounded-2xl text-xs font-bold text-center">
                {ticketError}
              </div>
            )}

            {!isLoadingTickets && !ticketError && (
              <div className="grid grid-cols-2 gap-3">
                {/* Column 1: New ("חדשים") */}
                <div className="flex flex-col gap-3">
                  <div className="bg-slate-200/50 py-2 px-3 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-xs font-black text-slate-600">{t('new_column_label')}</span>
                    <span className="ms-1.5 bg-slate-300/80 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                      {openTickets.filter(t => t.status === 'open').length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 min-h-[300px]">
                    {openTickets.filter(t => t.status === 'open').map(ticket => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        tenantId={tenantId!}
                        isHe={isHe}
                        t={t}
                        formatDate={formatDate}
                        getStatusStyle={getStatusStyle}
                        getStatusLabel={getStatusLabel}
                        getUrgencyLabel={getUrgencyLabel}
                        getCategoryLabel={getCategoryLabel}
                        isExpanded={expandedTicketId === ticket.id}
                        onToggleExpand={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                        commentDraft={commentDrafts[ticket.id] || ''}
                        onChangeCommentDraft={(val) => setCommentDrafts(prev => ({ ...prev, [ticket.id]: val }))}
                        onSubmitComment={() => handleAddComment(ticket.id)}
                        submittingComment={submittingCommentId === ticket.id}
                        onMeToo={() => handleMeToo(ticket.id)}
                        isMeTooClicked={!!meTooMap[ticket.id]}
                        meTooClicking={meTooClickingId === ticket.id}
                        showMeToo={!!reporterPhone && !ticket.isMyTicket}
                        isMiniCard={true}
                      />
                    ))}
                    {openTickets.filter(t => t.status === 'open').length === 0 && (
                      <div className="border border-dashed border-slate-200 rounded-2xl flex items-center justify-center p-6 text-center text-slate-300 text-xs italic flex-1 bg-white/20 select-none">
                        {isHe ? 'אין פניות' : 'No tickets'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: In Progress ("בטיפול") */}
                <div className="flex flex-col gap-3">
                  <div className="bg-slate-200/50 py-2 px-3 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-xs font-black text-slate-600">{t('in_progress_column_label')}</span>
                    <span className="ms-1.5 bg-slate-300/80 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                      {openTickets.filter(t => t.status === 'in-progress').length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 min-h-[300px]">
                    {openTickets.filter(t => t.status === 'in-progress').map(ticket => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        tenantId={tenantId!}
                        isHe={isHe}
                        t={t}
                        formatDate={formatDate}
                        getStatusStyle={getStatusStyle}
                        getStatusLabel={getStatusLabel}
                        getUrgencyLabel={getUrgencyLabel}
                        getCategoryLabel={getCategoryLabel}
                        isExpanded={expandedTicketId === ticket.id}
                        onToggleExpand={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                        commentDraft={commentDrafts[ticket.id] || ''}
                        onChangeCommentDraft={(val) => setCommentDrafts(prev => ({ ...prev, [ticket.id]: val }))}
                        onSubmitComment={() => handleAddComment(ticket.id)}
                        submittingComment={submittingCommentId === ticket.id}
                        onMeToo={() => handleMeToo(ticket.id)}
                        isMeTooClicked={!!meTooMap[ticket.id]}
                        meTooClicking={meTooClickingId === ticket.id}
                        showMeToo={!!reporterPhone && !ticket.isMyTicket}
                        isMiniCard={true}
                      />
                    ))}
                    {openTickets.filter(t => t.status === 'in-progress').length === 0 && (
                      <div className="border border-dashed border-slate-200 rounded-2xl flex items-center justify-center p-6 text-center text-slate-300 text-xs italic flex-1 bg-white/20 select-none">
                        {isHe ? 'אין פניות' : 'No tickets'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  tenantId: string;
  isHe: boolean;
  t: any;
  formatDate: (d: string) => string;
  getStatusStyle: (status: Ticket['status']) => string;
  getStatusLabel: (status: Ticket['status']) => string;
  getUrgencyLabel: (urg: string) => string;
  getCategoryLabel: (cat: string) => string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  commentDraft: string;
  onChangeCommentDraft: (val: string) => void;
  onSubmitComment: () => void;
  submittingComment: boolean;
  onMeToo: () => void;
  isMeTooClicked: boolean;
  meTooClicking: boolean;
  showMeToo: boolean;
  isMiniCard?: boolean;
}

function TicketCard({
  ticket,
  tenantId,
  isHe,
  t,
  formatDate,
  getStatusStyle,
  getStatusLabel,
  getUrgencyLabel,
  getCategoryLabel,
  isExpanded,
  onToggleExpand,
  commentDraft,
  onChangeCommentDraft,
  onSubmitComment,
  submittingComment,
  onMeToo,
  isMeTooClicked,
  meTooClicking,
  showMeToo,
  isMiniCard = false
}: TicketCardProps) {

  return (
    <div
      onClick={onToggleExpand}
      className={`bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden animate-in fade-in duration-300 flex flex-col ${isMiniCard ? 'p-3 gap-2' : 'p-4 gap-3'
        } ${isExpanded ? 'ring-2 ring-blue-500/20 shadow-lg' : ''}`}
    >
      {/* Upper row: Header Info */}
      <div className="flex justify-between items-start gap-2">
        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full select-none">
          #{ticket.ticketNumber}
        </span>
        <div className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusStyle(ticket.status)}`}>
          {getStatusLabel(ticket.status)}
        </div>
      </div>

      {/* Description / Summary */}
      <div className="text-slate-800 font-extrabold text-sm leading-snug break-words">
        {ticket.summary || (isHe ? 'אין תיאור' : 'No description')}
      </div>

      {/* Location / Meta row */}
      {!isMiniCard && (
        <div className="flex flex-wrap gap-2 text-[10px] font-bold">
          <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg">
            {getCategoryLabel(ticket.category)}
          </span>
          <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg">
            {getUrgencyLabel(ticket.urgency)}
          </span>
          {ticket.location && (
            <span className="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg">
              {ticket.location}
            </span>
          )}
          {ticket.subLocation && (
            <span className="bg-purple-50 text-purple-600 px-2.5 py-1 rounded-lg">
              {ticket.subLocation}
            </span>
          )}
        </div>
      )}

      {/* Mini layout metadata summary */}
      {isMiniCard && (
        <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
          <span>{getCategoryLabel(ticket.category)}</span>
          {ticket.location && <span>{ticket.location}</span>}
        </div>
      )}

      {/* Timestamp */}
      {!isMiniCard && (
        <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formatDate(ticket.createdAt)}</span>
        </div>
      )}

      {/* Attachment Image Grid */}
      {(!isMiniCard || isExpanded) && ticket.imageId && (
        <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-105 border border-slate-50 relative mt-1">
          <img
            src={`/img/${tenantId}/${ticket.imageId}`}
            alt={ticket.summary}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Me Too and Comment Badges row */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-50 mt-1 select-none">
        <div className="flex items-center gap-2">
          <button
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            title={isExpanded ? (isHe ? 'סגור פרטים' : 'Close details') : (isHe ? 'הצג פרטים' : 'Show details')}
          >
            {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>

          {ticket.timeline && ticket.timeline.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
              <MessageSquare size={13} className="text-slate-300" />
              <span>{ticket.timeline.length}</span>
            </div>
          )}
        </div>

        {ticket.meToo !== undefined && ticket.meToo > 0 && (
          <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 bg-blue-50/60 px-2 py-0.5 rounded-lg border border-blue-100/30">
            <span>🙋</span>
            <span>{ticket.meToo}</span>
          </div>
        )}
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-4 animate-in slide-in-from-top-3 duration-250 cursor-default"
        >
          {isMiniCard && (
            <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
              <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{getCategoryLabel(ticket.category)}</span>
              <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-lg">{getUrgencyLabel(ticket.urgency)}</span>
              {ticket.location && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg">{ticket.location}</span>}
              {ticket.subLocation && <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-lg">{ticket.subLocation}</span>}
              <span className="text-slate-400 py-0.5 select-none">{formatDate(ticket.createdAt)}</span>
            </div>
          )}

          {showMeToo && (
            <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <span className="text-xs text-slate-500 font-bold pr-1 select-none">
                {isHe ? 'מכירים את התקלה הזו?' : 'Facing this issue too?'}
              </span>
              <button
                onClick={onMeToo}
                disabled={isMeTooClicked || meTooClicking}
                title={t('me_too_tooltip')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all duration-150 active:scale-95 ${isMeTooClicked
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
              >
                <span>🙋</span>
                <span>{isHe ? 'גם לי יש את זה' : 'Me Too'}</span>
                {ticket.meToo !== undefined && ticket.meToo > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isMeTooClicked ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {ticket.meToo}
                  </span>
                )}
              </button>
            </div>
          )}

          <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
            <h4 className="text-xs font-black text-slate-600 border-b border-slate-50 pb-1 select-none">
              {isHe ? 'עדכונים והערות' : 'Timeline Updates'}
            </h4>

            {ticket.timeline && ticket.timeline.length > 0 ? (
              ticket.timeline.map((c, i) => (
                <div key={i} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100/50 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                    <span className="flex items-center gap-1 font-black text-blue-700">
                      <User size={10} />
                      {c.author || (isHe ? 'תושב' : 'Resident')}
                    </span>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-normal">{c.text}</p>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-slate-400 font-bold italic py-1 select-none">
                {isHe ? 'אין עדכונים עדיין פתוחים לתקלה זו.' : 'No updates for this ticket yet.'}
              </p>
            )}
          </div>

          {showMeToo && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <textarea
                  placeholder={t('add_comment_placeholder')}
                  value={commentDraft}
                  onChange={(e) => onChangeCommentDraft(e.target.value)}
                  className="w-full border border-slate-200 rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all resize-none min-h-[60px] bg-slate-50/50"
                  maxLength={200}
                />
              </div>
              <button
                onClick={onSubmitComment}
                disabled={submittingComment || !commentDraft.trim()}
                className="self-end bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
              >
                {submittingComment ? (
                  <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    <span>{t('send_comment_btn')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
