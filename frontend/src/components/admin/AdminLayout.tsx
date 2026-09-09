import { useState, useEffect } from 'react';
import { useParams, useLocation, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import { AdminNavbar } from './AdminNavbar';
import { AdminSidebar } from './AdminSidebar';
import { HelpModal } from './HelpModal';
import { ShieldAlert, Building2, LogOut, ArrowLeft } from 'lucide-react';

export interface AdminLayoutContext {
  tenantConfig: any;
  myTenants: { id: string; name?: string }[];
  isSuper: boolean;
  isEn: boolean;
  openHelp: () => void;
  dashboardCount?: number;
  backlogCount?: number;
}

export function AdminLayout() {
  const { tenantId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthState();

  const [tenantConfig, setTenantConfig] = useState<any>(null);
  const [myTenants, setMyTenants] = useState<{ id: string; name?: string }[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardCount, setDashboardCount] = useState<number | undefined>(undefined);
  const [backlogCount, setBacklogCount] = useState<number | undefined>(undefined);

  // Determine current active tab from pathname
  const getCurrentPage = (): 'dashboard' | 'backlog' | 'settings' | 'fleet' => {
    const path = location.pathname;
    if (path.endsWith('/settings')) return 'settings';
    if (path.endsWith('/backlog')) return 'backlog';
    if (path.endsWith('/fleet')) return 'fleet';
    return 'dashboard';
  };

  useEffect(() => {
    if (!user || !tenantId) return;

    let isMounted = true;

    async function loadLayoutData() {
      setLoading(true);
      setIsUnauthorized(false);
      try {
        // 1. Fetch user permissions and their authorized tenant list first
        const token = await user!.getIdTokenResult();
        const superRole = token.claims.role === 'super';
        if (isMounted) setIsSuper(superRole);

        let userTenants: { id: string; name?: string }[] = [];
        if (superRole) {
          const allTenantsSnap = await getDocs(collection(db, "tenants"));
          userTenants = allTenantsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
        } else {
          const tQuery = query(
            collection(db, "tenants"),
            where("adminUids", "array-contains", user!.uid)
          );
          const tSnap = await getDocs(tQuery);
          userTenants = tSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
        }
        if (isMounted) setMyTenants(userTenants);

        // 2. Strict authorization check for the requested tenantId
        const hasAccess = superRole || userTenants.some(t => t.id === tenantId);
        if (!hasAccess) {
          if (isMounted) {
            setIsUnauthorized(true);
            setLoading(false);
          }
          return;
        }

        // 3. If authorized, fetch current tenant info
        const bDoc = await getDoc(doc(db, "tenants", tenantId as string));
        if (bDoc.exists()) {
          if (isMounted) setTenantConfig(bDoc.data());
        } else {
          if (isMounted) setIsUnauthorized(true);
        }
      } catch (err: any) {
        console.error("Layout data load error:", err);
        if (err?.code === 'permission-denied' || err?.message?.toLowerCase().includes('permission')) {
          if (isMounted) setIsUnauthorized(true);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadLayoutData();

    return () => {
      isMounted = false;
    };
  }, [user, tenantId]);

  // Real-time listener for ticket counters - only run if authorized
  useEffect(() => {
    if (!user || !tenantId || isUnauthorized || loading) return;

    const ticketsRef = collection(db, "tenants", tenantId, "tickets");
    const unsubscribe = onSnapshot(ticketsRef, (snapshot) => {
      let openCount = 0;
      let backlogTicketCount = 0;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'open') {
          openCount++;
        } else if (data.status === 'backlog') {
          backlogTicketCount++;
        }
      });

      setDashboardCount(openCount);
      setBacklogCount(backlogTicketCount);
    }, (err) => {
      console.error("Error listening to tickets for counts:", err);
      if (err?.code === 'permission-denied' || err?.message?.toLowerCase().includes('permission')) {
        setIsUnauthorized(true);
      }
    });

    return () => unsubscribe();
  }, [user, tenantId, isUnauthorized, loading]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/admin/login', { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
        טוען מערכת ניהול...
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace />;

  const isEn = tenantConfig?.language === 'en';

  if (isUnauthorized) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir={isEn ? 'ltr' : 'rtl'}>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-8 text-center animate-in fade-in zoom-in duration-200">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
            <ShieldAlert size={36} />
          </div>

          <h1 className="text-2xl font-black text-slate-900 mb-2">
            {isEn ? 'Access Denied' : 'אין לך הרשאת גישה למבנה זה'}
          </h1>

          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            {isEn ? (
              <>
                The signed-in account <span className="font-bold text-slate-800">({user.email || user.displayName || user.uid})</span> is not authorized as an admin for tenant <span className="font-bold text-slate-900">"{tenantId}"</span>.
              </>
            ) : (
              <>
                החשבון המחובר <span className="font-bold text-slate-800" dir="ltr">({user.email || user.displayName || user.uid})</span> אינו מוגדר כמנהל במבנה <span className="font-bold text-slate-900">"{tenantId}"</span>.
              </>
            )}
          </p>

          <div className="space-y-3">
            {myTenants.length === 1 && (
              <button
                onClick={() => navigate(`/admin/${myTenants[0].id}/dashboard`, { replace: true })}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-base cursor-pointer"
              >
                <Building2 size={20} />
                <span>
                  {isEn
                    ? `Go to your building: ${myTenants[0].name || myTenants[0].id}`
                    : `מעבר למבנה שלך: ${myTenants[0].name || myTenants[0].id}`}
                </span>
              </button>
            )}

            {myTenants.length > 1 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-start">
                <span className="text-xs font-bold text-slate-500 mb-2 block">
                  {isEn ? 'Select from your authorized buildings:' : 'בחר מבנה מהרשימה המורשית שלך:'}
                </span>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {myTenants.map(t => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/admin/${t.id}/dashboard`, { replace: true })}
                      className="w-full bg-white hover:bg-blue-50 text-slate-800 hover:text-blue-700 font-bold py-2.5 px-4 rounded-xl border border-slate-200 hover:border-blue-300 flex items-center justify-between transition-colors text-sm cursor-pointer shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-blue-600" />
                        <span>{t.name || t.id}</span>
                      </div>
                      <ArrowLeft size={16} className={`text-slate-400 ${isEn ? 'rotate-180' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {myTenants.length === 0 && (
              <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-xl border border-amber-200 mb-2">
                {isEn
                  ? 'This account is not associated with any active building. Please contact system support.'
                  : 'חשבון זה אינו משויך לאף מבנה פעיל במערכת. פנה למנהל המערכת לקבלת הרשאות.'}
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold py-3 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <LogOut size={18} />
              <span>{isEn ? 'Log out / Switch account' : 'התנתקות מהמערכת / החלפת משתמש'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentPage = getCurrentPage();

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Mobile Top Admin Navbar (< 768px) */}
      <AdminNavbar
        tenantId={tenantId as string}
        tenantName={tenantConfig?.name}
        currentPage={currentPage}
        myTenants={myTenants}
        isFleet={Boolean(tenantConfig?.isPoolMaster || tenantConfig?.usesParentPool)}
        isSuper={isSuper}
        isEn={isEn}
        onOpenHelp={() => setIsHelpOpen(true)}
        dashboardCount={dashboardCount}
        backlogCount={backlogCount}
      />

      <div className="flex flex-col md:flex-row min-h-screen">
        {/* Desktop Collapsible Admin Sidebar (>= 768px) */}
        <AdminSidebar
          tenantId={tenantId as string}
          tenantName={tenantConfig?.name}
          currentPage={currentPage}
          myTenants={myTenants}
          isFleet={Boolean(tenantConfig?.isPoolMaster || tenantConfig?.usesParentPool)}
          isSuper={isSuper}
          isEn={isEn}
          dashboardCount={dashboardCount}
          backlogCount={backlogCount}
        />

        {/* Page Body Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet context={{
            tenantConfig,
            myTenants,
            isSuper,
            isEn,
            openHelp: () => setIsHelpOpen(true),
            dashboardCount,
            backlogCount
          } satisfies AdminLayoutContext} />
        </main>
      </div>

      {/* Global Admin Help Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        language={isEn ? 'en' : 'he'}
        tenantId={tenantId as string}
        tenantName={tenantConfig?.name || tenantId || ''}
      />
    </div>
  );
}
