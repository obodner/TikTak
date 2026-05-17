import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, where, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { AuditExplorer } from '../../components/admin/AuditExplorer';
import { Building, Shield, LogOut, ChevronRight, Search, Activity, Globe, Calendar, X, RefreshCw } from 'lucide-react';
import { signOut } from 'firebase/auth';

interface Tenant {
  id: string;
  name: string;
  address: string;
  adminUids: string[];
  type?: 'building' | 'municipality';
  createdAt?: string;
}

export default function SuperAdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'tenants' | 'audit' | 'holidays') || 'tenants';
  
  const setActiveTab = (tab: 'tenants' | 'audit' | 'holidays') => {
    setSearchParams({ tab });
  };

  const navigate = useNavigate();

  const [stats, setStats] = useState({ activeUsers: 0, activeTenantsCount: 0 });

  useEffect(() => {
    fetchTenants();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // Fetch ALL logs from last 24h to avoid composite index requirements
      // and to count ALL types of activity (not just ticket creation)
      const q = query(
        collection(db, 'audit_logs'),
        where('createdAt', '>=', twentyFourHoursAgo)
      );
      const snap = await getDocs(q);
      const activeTenants = new Set<string>();
      const activeUsers = new Set<string>();

      snap.docs.forEach(doc => {
        const data = doc.data();
        const tid = data.tenantId || data.metadata?.tenantId;
        const uid = data.actor?.uid;
        
        // Count all activities as engagement
        if (tid) activeTenants.add(tid);
        if (uid) activeUsers.add(uid);
      });
      setStats({ activeUsers: activeUsers.size, activeTenantsCount: activeTenants.size });
    } catch (err) {
      console.error('Failed to fetch global stats:', err);
    }
  };

  const fetchTenants = async () => {
    try {
      const q = query(collection(db, 'tenants'), orderBy('name', 'asc'));
      const snap = await getDocs(q);
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => signOut(auth).then(() => navigate('/admin/login'));

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">TikTak Control Center</h1>
              <p className="text-xs text-slate-400 font-medium">God's Eye View • Super Admin Mode</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <LogOut size={18} /> התנתק
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 mb-8 max-w-lg">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'tenants' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Building size={18} /> ניהול לקוחות
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'audit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Activity size={18} /> תיעוד פעולות
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'holidays' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Calendar size={18} /> לוח חגים
          </button>
        </div>

        {activeTab === 'tenants' ? (
          <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-blue-50 text-blue-600 p-3 rounded-xl"><Globe size={24} /></div>
                <div>
                  <p className="text-sm text-slate-500 font-bold">סך הכל לקוחות</p>
                  <p className="text-2xl font-black text-slate-900">{tenants.length}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-amber-50 text-amber-600 p-3 rounded-xl"><Activity size={24} /></div>
                <div>
                  <p className="text-sm text-slate-500 font-bold">משתמשי קצה פעילים ב 24 שעות האחרונות</p>
                  <p className="text-xl font-black text-slate-900">
                    {stats.activeUsers} משתמשים ב-{stats.activeTenantsCount} לקוחות
                  </p>
                </div>
              </div>
            </div>

            {/* Tenant Search */}
            <div className="relative group">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
              <input
                type="text"
                placeholder="חפש בניין לפי שם, כתובת או ID..."
                className="w-full pr-12 pl-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Tenant Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTenants.map(tenant => (
                <div key={tenant.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="bg-slate-50 p-3 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <Building size={24} />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tenant.id}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-1">{tenant.name}</h3>
                      <p className="text-sm text-slate-500 font-medium">{tenant.address}</p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">
                        {tenant.adminUids.length} מנהלים
                      </span>
                    </div>
                  </div>
                  <Link 
                    to={`/admin/${tenant.id}/dashboard`}
                    className="w-full bg-slate-50 p-4 flex items-center justify-center gap-2 text-sm font-bold text-slate-600 group-hover:bg-blue-600 group-hover:text-white transition-all border-t border-slate-100"
                  >
                    כניסה לניהול {tenant.type === 'municipality' ? 'הרשות' : 'הבניין'} <ChevronRight size={18} />
                  </Link>
                </div>
              ))}
            </div>
            
            {filteredTenants.length === 0 && !loading && (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                <p className="text-slate-400 font-bold">לא נמצאו בניינים תואמים לחיפוש</p>
              </div>
            )}
          </div>
        ) : activeTab === 'audit' ? (
          <AuditExplorer isEn={false} />
        ) : (
          <HolidayManager />
        )}
      </main>
    </div>
  );
}

function HolidayManager() {
  const [holidaysByCountry, setHolidaysByCountry] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHoliday, setNewHoliday] = useState({ country: 'IL', name: '', date: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  async function fetchHolidays() {
    const snap = await getDocs(collection(db, 'holidays'));
    setHolidaysByCountry(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday.name || !newHoliday.date) return;
    setIsAdding(true);

    try {
      const countryRef = doc(db, 'holidays', newHoliday.country);
      await updateDoc(countryRef, {
        holidays: arrayUnion({ name: newHoliday.name, date: newHoliday.date })
      });
      setNewHoliday({ ...newHoliday, name: '', date: '' });
      await fetchHolidays();
    } catch (err) {
      console.error("Failed to add holiday:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const removeHoliday = async (countryId: string, holiday: any) => {
    if (!window.confirm(`האם למחוק את החג ${holiday.name}?`)) return;
    try {
      const countryRef = doc(db, 'holidays', countryId);
      await updateDoc(countryRef, {
        holidays: arrayRemove(holiday)
      });
      await fetchHolidays();
    } catch (err) {
      console.error("Failed to remove holiday:", err);
    }
  };

  const syncHolidays = async (countryCode: string) => {
    setIsSyncing(countryCode);
    const year = new Date().getFullYear();
    const yearsToSync = [year, year + 1];
    
    try {
      let fetchedHolidays: { name: string, date: string }[] = [];
      
      for (const y of yearsToSync) {
        if (countryCode === 'IL') {
          const res = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=${y}&month=x&ss=on&mf=on&c=off&geo=none&i=on`);
          const data = await res.json();
          const items = data.items || [];
          items.forEach((item: any) => {
            if (item.category === 'holiday') {
              fetchedHolidays.push({ 
                name: item.title, 
                date: item.date.split('T')[0] 
              });
            }
          });
        } else if (countryCode === 'US') {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/US`);
          const data = await res.json();
          data.forEach((item: any) => {
            fetchedHolidays.push({ 
              name: item.name, 
              date: item.date 
            });
          });
        }
      }
      
      const countryRef = doc(db, 'holidays', countryCode);
      const docSnap = await getDoc(countryRef);
      const existing = docSnap.exists() ? (docSnap.data().holidays || []) : [];
      const existingDates = new Set(existing.map((h: any) => h.date));
      
      const newOnly = fetchedHolidays.filter(h => !existingDates.has(h.date));
      
      if (newOnly.length > 0) {
        await updateDoc(countryRef, {
          holidays: arrayUnion(...newOnly)
        });
        alert(`סונכרנו ${newOnly.length} חגים חדשים עבור ${countryCode}`);
        await fetchHolidays();
      } else {
        alert(`לא נמצאו חגים חדשים לסנכרון עבור ${countryCode}`);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      alert("הסנכרון נכשל. בדוק חיבור לאינטרנט או נסה שוב מאוחר יותר.");
    } finally {
      setIsSyncing(null);
    }
  };

  if (loading) return <div className="text-center py-10">טוען חגים...</div>;

  return (
    <div className="space-y-8">
      {/* Add Holiday Form */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-blue-600" /> הוספת חג חדש
        </h3>
        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            className="border border-slate-200 rounded-xl p-2.5 text-sm font-bold bg-slate-50"
            value={newHoliday.country}
            onChange={(e) => setNewHoliday(prev => ({ ...prev, country: e.target.value }))}
          >
            <option value="IL">ישראל (IL)</option>
            <option value="US">USA (US)</option>
          </select>
          <input
            type="text"
            placeholder="שם החג"
            className="border border-slate-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
            value={newHoliday.name}
            onChange={(e) => setNewHoliday(prev => ({ ...prev, name: e.target.value }))}
          />
          <input
            type="date"
            className="border border-slate-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
            value={newHoliday.date}
            onChange={(e) => setNewHoliday(prev => ({ ...prev, date: e.target.value }))}
          />
          <button
            type="submit"
            disabled={isAdding || !newHoliday.name || !newHoliday.date}
            className="bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {isAdding ? 'מוסיף...' : 'הוסף ללוח'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {holidaysByCountry.map(country => (
        <div key={country.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Globe size={18} className="text-blue-600" />
              {country.countryName} ({country.id})
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-400">{country.holidays.length} חגים מוזנים</span>
              <button 
                onClick={() => syncHolidays(country.id)}
                disabled={!!isSyncing}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSyncing === country.id ? 'animate-spin' : ''} />
                {isSyncing === country.id ? 'מסנכרן...' : 'סנכרון גלובלי'}
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {country.holidays.sort((a: any, b: any) => a.date.localeCompare(b.date)).map((h: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg transition-all group">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => removeHoliday(country.id, h)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={14} />
                    </button>
                    <span className="text-sm font-medium text-slate-700">{h.name}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400 group-hover:text-slate-600">{h.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
