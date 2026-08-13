import { useState, useEffect } from 'react';
import { useParams, useLocation, Outlet, Navigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import { AdminNavbar } from './AdminNavbar';
import { HelpModal } from './HelpModal';

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
  const { user, loading: authLoading } = useAuthState();

  const [tenantConfig, setTenantConfig] = useState<any>(null);
  const [myTenants, setMyTenants] = useState<{ id: string; name?: string }[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardCount, setDashboardCount] = useState<number | undefined>(undefined);
  const [backlogCount, setBacklogCount] = useState<number | undefined>(undefined);

  // Determine current active tab from pathname
  const getCurrentPage = (): 'dashboard' | 'backlog' | 'settings' => {
    const path = location.pathname;
    if (path.endsWith('/settings')) return 'settings';
    if (path.endsWith('/backlog')) return 'backlog';
    return 'dashboard';
  };

  useEffect(() => {
    if (!user || !tenantId) return;

    async function loadLayoutData() {
      setLoading(true);
      try {
        // Fetch current tenant info
        const bDoc = await getDoc(doc(db, "tenants", tenantId as string));
        if (bDoc.exists()) {
          setTenantConfig(bDoc.data());
        }

        // Fetch user permissions and tenant list
        const token = await user!.getIdTokenResult();
        const superRole = token.claims.role === 'super';
        setIsSuper(superRole);

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
        setMyTenants(userTenants);
      } catch (err) {
        console.error("Layout data load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadLayoutData();
  }, [user, tenantId]);

  // Real-time listener for ticket counters
  useEffect(() => {
    if (!user || !tenantId) return;

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
    });

    return () => unsubscribe();
  }, [user, tenantId]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
        טוען מערכת ניהול...
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace />;

  const isEn = tenantConfig?.language === 'en';
  const currentPage = getCurrentPage();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Persistent Top Admin Navbar */}
      <AdminNavbar
        tenantId={tenantId as string}
        tenantName={tenantConfig?.name}
        currentPage={currentPage}
        myTenants={myTenants}
        isSuper={isSuper}
        isEn={isEn}
        onOpenHelp={() => setIsHelpOpen(true)}
        dashboardCount={dashboardCount}
        backlogCount={backlogCount}
      />

      {/* Page Body Content */}
      <Outlet context={{
        tenantConfig,
        myTenants,
        isSuper,
        isEn,
        openHelp: () => setIsHelpOpen(true),
        dashboardCount,
        backlogCount
      } satisfies AdminLayoutContext} />

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
