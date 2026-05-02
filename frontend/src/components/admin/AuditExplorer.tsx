import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where, startAfter, QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Search, EyeOff, X, Filter, Copy, Check } from 'lucide-react';
import { format, parseISO, subMonths, startOfDay } from 'date-fns';

interface AuditLog {
  id: string;
  tenantId: string;
  action: string;
  level: string;
  actor: {
    uid: string;
    name: string;
    email?: string;
    type: string;
  };
  details: any;
  changes?: { previousValue: any; newValue: any } | null;
  createdAt: string;
  metadata: any;
}

interface AuditExplorerProps {
  isEn?: boolean;
}

export const AuditExplorer = ({ isEn = false }: AuditExplorerProps) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [showRaw, setShowRaw] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    tenantId: 'all',
    action: 'all',
    actorSearch: '',
    category: 'all',
    urgency: 'all',
    timeRange: '1m',
    customStartDate: '',
    search: '',
    hasImage: 'all',
    hasAudio: 'all',
  });

  const handleCopy = (log: AuditLog) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const categories = ['חשמל', 'ניקיון', 'מעלית', 'אינסטלציה', 'אחר'];

  const uiLabels = {
    title: isEn ? 'Global Audit Explorer' : 'סייר תיעוד פעולות (Audit)',
    search_placeholder: isEn ? 'Search details...' : 'חפש בפרטי הפעולה...',
    filters: isEn ? 'Filters' : 'מסננים',
    tenant: isEn ? 'Tenant' : 'בניין',
    action: isEn ? 'Action' : 'פעולה',
    actor: isEn ? 'Actor' : 'מבצע (שם/אימייל)',
    category: isEn ? 'Category' : 'קטגוריה',
    urgency: isEn ? 'Urgency' : 'דחיפות',
    time: isEn ? 'Time' : 'זמן',
    all: isEn ? 'All' : 'הכל',
    yes: isEn ? 'Yes' : 'כן',
    no: isEn ? 'No' : 'לא',
    hasImage: isEn ? 'Has Image' : 'כולל תמונה',
    hasAudio: isEn ? 'Has Audio' : 'כולל שמע',
    load_more: isEn ? 'Load More' : 'טען עוד',
    showing: isEn ? 'Showing' : 'מציג',
    records: isEn ? 'records' : 'רשומות',
    custom_date: isEn ? 'Custom Date' : 'תאריך התחלה',
  };

  const actions = [
    'TICKET_CREATED', 'TICKET_STATUS_UPDATE', 'TICKET_URGENCY_UPDATE',
    'COMMENT_CREATED', 'COMMENT_DELETED', 'USER_ADDED', 'USER_DELETED',
    'CONFIGURATION_UPDATE', 'REPORTER_LIST_UPDATE', 'LOGIN'
  ];

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    fetchLogs(true);
  }, [filters]);

  const fetchTenants = async () => {
    try {
      const snap = await getDocs(collection(db, 'tenants'));
      setTenants(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    }
  };

  const fetchLogs = async (isNew = false) => {
    setLoading(true);
    try {
      // Keep only Time and OrderBy on server-side to avoid complex composite indexes
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(100)];
      
      let startDate: Date | null = null;
      if (filters.timeRange === '1m') startDate = subMonths(new Date(), 1);
      else if (filters.timeRange === '3m') startDate = subMonths(new Date(), 3);
      else if (filters.timeRange === '6m') startDate = subMonths(new Date(), 6);
      else if (filters.timeRange === '12m') startDate = subMonths(new Date(), 12);
      else if (filters.timeRange === 'custom' && filters.customStartDate) {
        startDate = startOfDay(new Date(filters.customStartDate));
      }

      if (startDate) {
        constraints.push(where('createdAt', '>=', startDate.toISOString()));
      }
      
      if (!isNew && lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(collection(db, 'audit_logs'), ...constraints);
      const snap = await getDocs(q);
      
      const rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
      
      // Client-side filtering for everything else
      let filtered = rawLogs;

      if (filters.tenantId !== 'all') {
        filtered = filtered.filter(l => (l.tenantId === filters.tenantId || l.metadata?.tenantId === filters.tenantId));
      }

      if (filters.action !== 'all') {
        filtered = filtered.filter(l => l.action === filters.action);
      }

      if (filters.category !== 'all') {
        filtered = filtered.filter(l => l.details?.category === filters.category);
      }

      if (filters.urgency !== 'all') {
        filtered = filtered.filter(l => l.details?.urgency === filters.urgency);
      }

      if (filters.actorSearch) {
        const s = filters.actorSearch.toLowerCase();
        filtered = filtered.filter(l => 
          l.actor.email?.toLowerCase().includes(s) || 
          l.actor.name?.toLowerCase().includes(s)
        );
      }

      if (filters.search) {
        const s = filters.search.toLowerCase();
        filtered = filtered.filter(l => 
          JSON.stringify(l.details).toLowerCase().includes(s) ||
          l.action.toLowerCase().includes(s)
        );
      }

      if (filters.hasImage !== 'all') {
        const wantImage = filters.hasImage === 'yes';
        filtered = filtered.filter(l => !!l.details?.hasImage === wantImage);
      }

      if (filters.hasAudio !== 'all') {
        const wantAudio = filters.hasAudio === 'yes';
        filtered = filtered.filter(l => !!l.details?.hasAudio === wantAudio);
      }

      setLogs(prev => isNew ? filtered : [...prev, ...filtered]);
      setLastDoc(snap.docs[snap.docs.length - 1]);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      tenantId: 'all',
      action: 'all',
      actorSearch: '',
      category: 'all',
      urgency: 'all',
      timeRange: '1m',
      customStartDate: '',
      search: '',
      hasImage: 'all',
      hasAudio: 'all',
    });
  };

  const getHumanReadable = (log: AuditLog) => {
    let actor = log.actor.name || 'Unknown';
    // If actor name is an email, show only the prefix for a cleaner look
    if (actor.includes('@') && actor.includes('.')) {
      actor = actor.split('@')[0];
    }
    const logTenantId = log.tenantId || log.metadata?.tenantId;
    const tenantName = tenants.find(t => t.id === logTenantId)?.name || logTenantId || 'Unknown';

    switch (log.action) {
      case 'TICKET_CREATED':
        const createRef = log.details.ticketNumber ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
        const summaryText = log.details.summary ? `: ${log.details.summary}` : '';
        return isEn 
          ? `${actor} reported a new ${log.details.category} issue ${createRef} in ${tenantName}${summaryText}`
          : `${actor} דיווח על תקלה חדשה ${createRef} (${log.details.category}) בבניין ${tenantName}${summaryText}`;
      case 'TICKET_STATUS_UPDATE':
        const ticketRef = log.details.ticketNumber ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
        return isEn
          ? `${actor} updated ticket ${ticketRef} status to ${log.details.newStatus} in ${tenantName}`
          : `${actor} עדכן סטטוס של פנייה ${ticketRef} ל-${log.details.newStatus} בבניין ${tenantName}`;
      case 'COMMENT_CREATED':
        const commTicketRef = log.details.ticketNumber ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
        return isEn
          ? `${actor} added a comment to ticket ${commTicketRef}`
          : `${actor} הוסיף הערה לפנייה ${commTicketRef}`;
      case 'COMMENT_DELETED':
        const delCommTicketRef = log.details.ticketNumber ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
        return isEn
          ? `${actor} deleted a comment from ticket ${delCommTicketRef}`
          : `${actor} מחק הערה מפנייה ${delCommTicketRef}`;
      case 'TICKET_URGENCY_UPDATE':
        const urgTicketRef = log.details.ticketNumber ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
        return isEn
          ? `${actor} updated ticket ${urgTicketRef} urgency to ${log.details.newUrgency}`
          : `${actor} עדכן דחיפות של פנייה ${urgTicketRef} ל-${log.details.newUrgency}`;
      case 'LOGIN':
        return isEn ? `${actor} logged in` : `${actor} התחבר למערכת`;
      default:
        return `${actor}: ${log.action}`;
    }
  };

  return (
    <div className="space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Filter size={18} className="text-blue-600" />
          <h2 className="font-bold text-slate-800">{uiLabels.filters}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4 items-end">
          {/* Time Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.time}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.timeRange}
              onChange={e => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
            >
              <option value="1m">חודש אחרון</option>
              <option value="3m">3 חודשים</option>
              <option value="6m">6 חודשים</option>
              <option value="12m">שנה אחרונה</option>
              <option value="custom">טווח מותאם</option>
            </select>
          </div>

          {/* Custom Date (if selected) */}
          {filters.timeRange === 'custom' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.custom_date}</label>
              <input
                type="date"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                value={filters.customStartDate}
                onChange={e => setFilters(prev => ({ ...prev, customStartDate: e.target.value }))}
              />
            </div>
          )}

          {/* Building Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.tenant}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.tenantId}
              onChange={e => setFilters(prev => ({ ...prev, tenantId: e.target.value }))}
            >
              <option value="all">{uiLabels.all}</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Action Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.action}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.action}
              onChange={e => setFilters(prev => ({ ...prev, action: e.target.value }))}
            >
              <option value="all">{uiLabels.all}</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Category Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.category}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.category}
              onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
            >
              <option value="all">{uiLabels.all}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Actor Search */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.actor}</label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={isEn ? 'Name or email...' : 'חפש שם או אימייל...'}
                className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                value={filters.actorSearch}
                onChange={e => setFilters(prev => ({ ...prev, actorSearch: e.target.value }))}
              />
            </div>
          </div>

          {/* Urgency Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.urgency}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.urgency}
              onChange={e => setFilters(prev => ({ ...prev, urgency: e.target.value }))}
            >
              <option value="all">{uiLabels.all}</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* General Search */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-xs font-bold text-slate-500 block px-1">חיפוש חופשי</label>
            <input
              type="text"
              placeholder={uiLabels.search_placeholder}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>

          {/* Image Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.hasImage}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.hasImage}
              onChange={e => setFilters(prev => ({ ...prev, hasImage: e.target.value }))}
            >
              <option value="all">{uiLabels.all}</option>
              <option value="yes">{uiLabels.yes}</option>
              <option value="no">{uiLabels.no}</option>
            </select>
          </div>

          {/* Audio Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.hasAudio}</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              value={filters.hasAudio}
              onChange={e => setFilters(prev => ({ ...prev, hasAudio: e.target.value }))}
            >
              <option value="all">{uiLabels.all}</option>
              <option value="yes">{uiLabels.yes}</option>
              <option value="no">{uiLabels.no}</option>
            </select>
          </div>

          {/* Reset Button */}
          <div className="flex justify-end">
            <button
              onClick={resetFilters}
              className="p-2.5 bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
              title="נקה מסננים"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-2">
        <p className="text-sm font-bold text-slate-500">
          {uiLabels.showing} <span className="text-blue-600">{logs.length}</span> {uiLabels.records}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {logs.map(log => (
            <div 
              key={log.id} 
              className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group/row"
              onClick={() => setShowRaw(showRaw === log.id ? null : log.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {format(parseISO(log.createdAt), 'dd/MM HH:mm')}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      log.level === 'WARN' ? 'bg-amber-100 text-amber-700' : 
                      log.level === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {log.level}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{log.actor.email || log.actor.name}</span>
                  </div>
                  <p className="text-sm text-slate-800 font-medium">{getHumanReadable(log)}</p>
                  
                  {showRaw === log.id && (
                    <div className="relative group/json mt-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(log);
                        }}
                        id={`copy-${log.id}`}
                        className={`absolute top-3 left-3 p-2 rounded-lg transition-all border shadow-xl opacity-0 group-hover/json:opacity-100 z-10 ${
                          copiedId === log.id 
                            ? 'bg-green-600 text-white border-green-500' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                        title="Copy JSON"
                      >
                        {copiedId === log.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <pre className="p-3 bg-slate-900 text-green-400 text-[10px] rounded-lg overflow-x-auto font-mono text-left relative" dir="ltr">
                        {JSON.stringify(log, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowRaw(showRaw === log.id ? null : log.id)}
                  className={`p-2 rounded-lg transition-colors ${showRaw === log.id ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                  {showRaw === log.id ? <EyeOff size={18} /> : <Search size={18} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {loading && <div className="p-8 text-center text-slate-400">{isEn ? 'Loading logs...' : 'טוען נתונים...'}</div>}
        
        {!loading && lastDoc && (
          <button
            onClick={() => fetchLogs(false)}
            className="w-full p-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-100"
          >
            {uiLabels.load_more}
          </button>
        )}
      </div>
    </div>
  );
};
