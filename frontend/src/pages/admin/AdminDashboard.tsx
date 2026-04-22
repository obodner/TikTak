import { useEffect, useState, useMemo } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { collection, getDocs, getDoc, orderBy, query, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { CommentModal } from '../../components/admin/CommentModal';
import { useAuthState } from '../../hooks/useAuthState';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { AlertCircle, Clock, CheckCircle2, Check, Search, X, Calendar, MessageSquare, LogOut, Mic } from 'lucide-react';
import { format, parseISO, subMonths, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { he } from 'date-fns/locale';

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
};

export default function AdminDashboard() {
  const { tenantId } = useParams();
  const { user, loading: authLoading } = useAuthState();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantConfig, setTenantConfig] = useState<any>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'progress' | 'resolved'>('new');
  const [commentTicketId, setCommentTicketId] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<{ firstName: string; lastName: string } | null>(null);

  // Filter State
  const [filters, setFilters] = useState({
    timeRange: 'all',
    startDate: '',
    endDate: '',
    location: 'all',
    subLocation: 'all',
    category: 'all',
    severity: 'all',
    search: ''
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
    filters: {
      search: isHe ? 'חפש בתיאור התקלה...' : 'Search in description...',
      time: isHe ? 'טווח זמן' : 'Time Range',
      severity: isHe ? 'חומרה' : 'Severity',
      category: isHe ? 'קטגוריה' : 'Category',
      all: isHe ? 'הכל' : 'All',
      clear: isHe ? 'נקה הכל' : 'Clear All',
      ranges: {
        all: isHe ? 'כל הזמן' : 'All Time',
        '1m': isHe ? 'חודש אחרון' : 'Last Month',
        '3m': isHe ? '3 חודשים אחרונים' : 'Last 3 Months',
        '6m': isHe ? 'חצי שנה אחרונה' : 'Last 6 Months',
        '12m': isHe ? 'שנה אחרונה' : 'Last Year',
        custom: isHe ? 'טווח מותאם' : 'Custom Range'
      }
    }
  };

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  // 2. Data Fetching
  const fetchData = async () => {
    if (!user || !tenantId) return;
    setError('');
    try {
      const bDoc = await getDoc(doc(db, "tenants", tenantId));
      const currentTenant = bDoc.exists() ? bDoc.data() : null;
      setTenantConfig(currentTenant);

      const q = query(
        collection(db, "tenants", tenantId as string, "tickets"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const parsed: Ticket[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
      setTickets(parsed);

      // Fetch current admin profile
      if (user.uid) {
        const uDoc = await getDoc(doc(db, "tenants", tenantId, "adminUsers", user.uid));
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

  const handleStatusUpdate = async (ticketId: string, newStatus: Ticket['status']) => {
    if (!tenantId) return;
    setUpdatingId(ticketId);
    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", ticketId);
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      await fetchData();
    } catch (err) {
      console.error("Update failed:", err);
    } finally {
      setUpdatingId(null);
    }
  };
  const handleUrgencyUpdate = async (ticketId: string, newUrgency: Ticket['urgency']) => {
    if (!tenantId) return;
    setUpdatingId(ticketId);
    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", ticketId);
      await updateDoc(ticketRef, {
        urgency: newUrgency,
        updatedAt: new Date().toISOString()
      });
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, urgency: newUrgency } : t));
    } catch (err) {
      console.error("Urgency update failed:", err);
      alert(isEn ? 'Failed to update urgency' : 'עדכון הדחיפות נכשל');
    } finally {
      setUpdatingId(null);
    }
  };


  const handleSaveComment = async (ticketId: string, text: string) => {
    if (!tenantId) return;
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
      setTickets(prev => prev.map(t => 
        t.id === ticketId 
          ? { ...t, adminComments: [...(t.adminComments || []), newComment] } 
          : t
      ));
    } catch (err: any) {
      console.error(err);
      alert(isEn ? 'Failed to save comment' : 'שמירת ההערה נכשלה');
    }
  };

  const handleDeleteComment = async (ticketId: string, commentId: string) => {
    if (!tenantId) return;
    if (!window.confirm(isEn ? 'Delete this comment?' : 'למחוק הערה זו?')) return;

    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket || !ticket.adminComments) return;

      const updatedComments = ticket.adminComments.filter(c => c.id !== commentId);
      await updateDoc(doc(db, "tenants", tenantId, "tickets", ticketId), {
        adminComments: updatedComments
      });
      setTickets(prev => prev.map(t => 
        t.id === ticketId ? { ...t, adminComments: updatedComments } : t
      ));
    } catch (err: any) {
      console.error(err);
      alert(isEn ? 'Failed to delete' : 'המחיקה נכשלה');
    }
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
      search: ''
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

    const months: Record<string, number> = {};
    filteredTickets.forEach(t => {
      const mo = format(parseISO(t.createdAt), 'MMM yyyy', { locale: isEn ? undefined : he });
      months[mo] = (months[mo] || 0) + 1;
    });
    const monthlyData = Object.entries(months).map(([name, count]) => ({ name, count })).reverse();

    return { open, resolved, categoryData, monthlyData };
  }, [filteredTickets, isEn]);

  const renderColumn = (title: string, status: string[], icon: any, colorClass: string) => {
    const colTickets = filteredTickets.filter(t => status.includes(t.status));

    return (
      <div className={`flex flex-col bg-slate-100 rounded-xl p-4 min-h-[500px] border-t-4 ${colorClass}`}>
        <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-lg">
          {icon}
          <h2>{title} ({colTickets.length})</h2>
        </div>

        <div className="flex flex-col gap-3">
          {colTickets.map(t => (
            <div key={t.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <select
                  value={t.urgency}
                  disabled={updatingId === t.id}
                  onChange={(e) => handleUrgencyUpdate(t.id, e.target.value as Ticket['urgency'])}
                  className={`text-[10px] font-black px-2 py-1 rounded border-none appearance-none cursor-pointer transition-colors focus:ring-2 focus:ring-blue-200 outline-none ${t.urgency === 'High' ? 'bg-red-100 text-red-700' :
                    t.urgency === 'Moderate' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}
                >
                  <option value="High">{uiLabels.urgency.High}</option>
                  <option value="Moderate">{uiLabels.urgency.Moderate}</option>
                  <option value="Low">{uiLabels.urgency.Low}</option>
                </select>
                <span className="text-xs text-slate-500">
                  {new Date(t.createdAt).toLocaleDateString(isEn ? 'en-US' : 'he-IL')} {new Date(t.createdAt).toLocaleTimeString(isEn ? 'en-US' : 'he-IL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="font-bold text-slate-800 mb-1 leading-snug">{translateCategory(t.category)}</p>
              <p className="text-sm text-slate-600 mb-3 line-clamp-4 break-words leading-relaxed">{t.summary}</p>

              <div className="flex flex-wrap gap-1 mb-3">
                {t.location && (
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-sm font-bold flex items-center gap-1">
                    {uiLabels.location}: <span dir="ltr">{t.location}</span>
                  </span>
                )}
                {t.subLocation && (
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-sm font-bold flex items-center gap-1">
                    {uiLabels.subLocation}: <span dir="ltr">{t.subLocation}</span>
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setCommentTicketId(t.id)}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 transition-all shadow-sm relative group"
                  title={isEn ? "Internal Notes" : "הערות פנימיות"}
                >
                  <MessageSquare size={16} className={t.adminComments?.length ? 'text-blue-600' : ''} />
                  {t.adminComments && t.adminComments.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white animate-in zoom-in">
                      {t.adminComments.length}
                    </span>
                  )}
                </button>
                {t.imageId && !t.imageId.startsWith('hidden-') && (
                  <a href={`/img/${tenantId}/${t.imageId}`} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs font-medium text-blue-600 bg-blue-50 py-2 rounded border border-blue-100 hover:bg-blue-100 flex items-center justify-center">
                    {uiLabels.image}
                  </a>
                )}
                {t.audioId && (
                  <a href={`/aud/${tenantId}/${t.audioId}`} target="_blank" rel="noreferrer" className="w-10 flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors" title={isEn ? "Play Audio" : "נגן הקלטה"}>
                    <Mic size={16} />
                  </a>
                )}
                {t.status === 'open' && (
                  <button
                    onClick={() => handleStatusUpdate(t.id, 'in-progress')}
                    disabled={updatingId === t.id}
                    className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 py-2 rounded border border-amber-100 hover:bg-amber-100"
                  >
                    <Clock size={12} /> {uiLabels.start}
                  </button>
                )}
                {(t.status === 'open' || t.status === 'in-progress') && (
                  <button
                    onClick={() => handleStatusUpdate(t.id, 'resolved')}
                    disabled={updatingId === t.id}
                    className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-green-600 bg-green-50 py-2 rounded border border-green-100 hover:bg-green-100"
                  >
                    <Check size={12} /> {uiLabels.close}
                  </button>
                )}
              </div>
            </div>
          ))}
          {colTickets.length === 0 && <p className="text-slate-400 text-sm text-center py-8">{uiLabels.no_tickets}</p>}
        </div>
      </div>
    );
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50">{isEn ? 'Loading...' : 'טוען...'}</div>;
  if (!user) return <Navigate to="/admin/login" />;

  const hasActiveFilters = filters.search || filters.timeRange !== 'all' || filters.category !== 'all' || filters.location !== 'all' || filters.subLocation !== 'all' || filters.severity !== 'all';

  return (
    <div className="min-h-screen bg-white" dir={isEn ? 'ltr' : 'rtl'}>
      <header className="bg-slate-900 text-white p-3 md:p-5 sticky top-0 z-50 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-2 md:px-4">
          <div className="flex items-center gap-2 md:gap-4 text-right" dir={isEn ? "ltr" : "rtl"}>
            {/* Right: Logo */}
            <div className="flex items-center justify-center transition-transform hover:scale-105 shrink-0">
              <img 
                src="/logo_transparent.png" 
                alt="TikTak" 
                className="h-12 md:h-20 w-auto object-contain filter drop-shadow-[0_0_1px_rgba(255,255,255,0.5)]" 
              />
            </div>
            
            <span className="text-slate-600 font-light text-xl md:text-2xl hidden sm:inline">|</span>
            
            {/* Middle: Tenant Name */}
            <span className="text-sm md:text-lg text-slate-300 font-medium truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
              {tenantConfig?.name || tenantId}
            </span>
            
            <span className="text-slate-600 font-light text-xl md:text-2xl hidden md:inline">|</span>
            
            {/* Left: Page Name */}
            <span className="text-sm md:text-lg text-white font-bold whitespace-nowrap hidden md:inline">
              {isEn ? 'Dashboard' : 'דשבורד'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex flex-col gap-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-medium">
            {error}
          </div>
        )}

        {/* Analytics Top Bar */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-center">
            <h3 className="text-slate-500 font-medium mb-1">{uiLabels.stats_open}</h3>
            <p className="text-5xl font-black text-blue-700">{stats.open}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl border border-green-100 shadow-sm flex flex-col justify-center">
            <h3 className="text-slate-500 font-medium mb-1">{uiLabels.stats_closed}</h3>
            <p className="text-5xl font-black text-green-700">{stats.resolved}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-64 flex flex-col items-center justify-center">
            <h3 className="text-sm font-bold text-slate-700 mb-2 w-full text-center">{uiLabels.pie_title}</h3>
            {stats.categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                    {stats.categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [val, isEn ? 'Tickets' : 'פניות']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">{isEn ? 'No category data' : 'אין נתוני קטגוריות'}</div>
            )}
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-64 flex flex-col items-center justify-center">
            <h3 className="text-sm font-bold text-slate-700 mb-2 w-full text-center">{uiLabels.bar_title}</h3>
            {stats.monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={10} interval={0} tick={{ fontSize: 8 }} />
                  <YAxis fontSize={10} width={40} tick={{ fontSize: 8 }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs italic">{isEn ? 'No trends data' : 'אין נתוני מגמות'}</div>
            )}
          </div>
        </section>

        {/* Filter Bar */}
        <section className="bg-slate-50/50 p-3 rounded-2xl border border-slate-200 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col lg:flex-row items-end gap-4">
            {/* Dropdowns - Fixed width or compact */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:flex xl:flex-nowrap gap-3 w-full lg:w-auto">
              {/* Time Range */}
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

              {/* Severity */}
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

              {/* Category */}
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

              {/* Location */}
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

              {/* Sub-Location */}
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

              {/* Clear Highlights - Unified Button */}
              {hasActiveFilters && (
                <div className="flex flex-col justify-end">
                  <button
                    onClick={clearFilters}
                    className="h-[38px] flex items-center justify-center gap-2 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 px-4 rounded-xl transition-all shadow-sm group border border-slate-200"
                    title={uiLabels.filters.clear}
                  >
                    <X size={16} className="group-hover:rotate-90 transition-transform" />
                    <span className="text-xs font-bold hidden xl:inline">{uiLabels.filters.clear}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Search - Flexible width - Move to LEFT (logical end in RTL) */}
            <div className="flex-1 w-full lg:w-auto flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 px-1">{uiLabels.filters.search}</label>
              <div className="relative">
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
            </div>
          </div>

          {/* Custom Dates Row - Secondary */}
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

        {/* Kanban Board */}
        {loading ? (
          <div className="py-20 text-center text-slate-500">{uiLabels.loading}</div>
        ) : (
          <section className="flex flex-col gap-4">
            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden bg-slate-100 p-1 rounded-xl">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className={activeTab === 'new' ? 'block' : 'hidden lg:block'}>
                {renderColumn(uiLabels.new, ['open'], <AlertCircle className="text-red-500" />, 'border-red-500')}
              </div>
              <div className={activeTab === 'progress' ? 'block' : 'hidden lg:block'}>
                {renderColumn(uiLabels.progress, ['in-progress'], <Clock className="text-amber-500" />, 'border-amber-500')}
              </div>
              <div className={activeTab === 'resolved' ? 'block' : 'hidden lg:block'}>
                {renderColumn(uiLabels.resolved, ['resolved', 'dismissed'], <CheckCircle2 className="text-green-500" />, 'border-green-500')}
              </div>
            </div>
          </section>
        )}

        <CommentModal
          isOpen={!!commentTicketId}
          onClose={() => setCommentTicketId(null)}
          ticket={tickets.find(t => t.id === commentTicketId) || null}
          onSave={handleSaveComment}
          onDelete={handleDeleteComment}
          isEn={isEn}
        />
      </main>
    </div>
  );
}
