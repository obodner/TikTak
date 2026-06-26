import { useEffect, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import { HelpModal } from '../../components/admin/HelpModal';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { logAction } from '../../utils/auditLogger';
import { InfrastructureTab } from '../../components/admin/InfrastructureTab';
import { UsersTab } from '../../components/admin/UsersTab';
import { GeneralSettingsTab } from '../../components/admin/GeneralSettingsTab';
import { QuickTapItem } from '../../components/admin/QuickTapEditor';

export default function TenantSettings() {
  const { tenantId } = useParams();
  const { user, loading: authLoading } = useAuthState();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'infrastructure' | 'users' | 'general'>('infrastructure');

  // Configuration State
  const [type, setType] = useState<'building' | 'municipality'>('building');
  const [language, setLanguage] = useState<'he' | 'en'>('he');
  const [locations, setLocations] = useState<string[]>([]);
  const [subLocations, setSubLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [quickTap, setQuickTap] = useState<{ items: QuickTapItem[] }>({ items: [] });

  const [uiConfig, setUiConfig] = useState({
    locationLabel: '',
    subLocationLabel: '',
    showLocation: true
  });
  
  const [slaConfig, setSlaConfig] = useState({
    enabled: true,
    workingDays: [0, 1, 2, 3, 4], // Default Sun-Thu
    country: 'IL'
  });

  const [adminProfile, setAdminProfile] = useState<{ firstName: string; lastName: string } | null>(null);
  const [initialConfig, setInitialConfig] = useState<any>(null);

  const getAuditActor = () => ({
    uid: user?.uid || 'unknown',
    name: adminProfile
      ? `${adminProfile.firstName} ${adminProfile.lastName}`
      : (user?.displayName || user?.email || 'Admin'),
    email: user?.email || undefined,
    type: 'admin' as const
  });

  useEffect(() => {
    if (!user || !tenantId) return;
    async function loadData() {
      try {
        const docRef = doc(db, "tenants", tenantId as string);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const config = data.config || {};

          setTenantName(data.name || '');
          setType((data.type?.toLowerCase() || 'building') as 'building' | 'municipality');
          setLanguage(data.language || 'he');
          setLocations(config.locations || config.floors || []);
          setSubLocations(config.subLocations || config.resources || []);
          setCategories(config.categories || []);
          setQuickTap(data.quickTap || { items: [] });
          setUiConfig(data.uiConfig || {
            locationLabel: '',
            subLocationLabel: '',
            showLocation: true
          });
          setSlaConfig({
            enabled: data.slaConfig?.enabled ?? true,
            workingDays: data.slaConfig?.workingDays || [0, 1, 2, 3, 4],
            country: data.country || 'IL'
          });

          // Store initial state for audit log changes
          setInitialConfig({
            name: data.name || '',
            type: data.type || 'building',
            language: data.language || 'he',
            config: {
              locations: config.locations || config.floors || [],
              subLocations: config.subLocations || config.resources || [],
              categories: config.categories || []
            },
            quickTap: data.quickTap || { items: [] },
            uiConfig: data.uiConfig || { locationLabel: '', subLocationLabel: '', showLocation: true },
            slaConfig: {
              enabled: data.slaConfig?.enabled ?? true,
              workingDays: data.slaConfig?.workingDays || [0, 1, 2, 3, 4],
              country: data.country || 'IL'
            }
          });
        } else {
          setError(`Error: Tenant ${tenantId} not found.`);
        }
      } catch (err: any) {
        console.error("Failed to load tenant", err);
        setError(`Failed to load data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, tenantId]);

  useEffect(() => {
    if (!user || !tenantId) return;
    async function loadProfile() {
      try {
        const pRef = doc(db, "tenants", tenantId as string, "adminUsers", user!.uid);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          setAdminProfile(pSnap.data() as any);
        } else {
          // Fallback: search other tenants
          const adminQuery = query(
            collection(db, "tenants"),
            where("adminUids", "array-contains", user!.uid),
            limit(1)
          );
          const adminSnap = await getDocs(adminQuery);
          if (!adminSnap.empty) {
            const fallbackTenantId = adminSnap.docs[0].id;
            const fallbackDoc = await getDoc(doc(db, "tenants", fallbackTenantId, "adminUsers", user!.uid));
            if (fallbackDoc.exists()) {
              setAdminProfile(fallbackDoc.data() as any);
            }
          }
        }
      } catch (err) {
        console.error("Profile load failed", err);
      }
    }
    loadProfile();
  }, [user, tenantId]);

  // Tab 1 Isolated Save Action
  const handleSaveInfrastructure = async (data: {
    locations: string[];
    subLocations: string[];
    categories: string[];
    quickTap: { items: QuickTapItem[] };
  }) => {
    if (!user || !tenantId) return;

    try {
      const docRef = doc(db, "tenants", tenantId);
      await updateDoc(docRef, {
        config: {
          locations: data.locations,
          subLocations: data.subLocations,
          categories: data.categories
        },
        quickTap: data.quickTap,
        updatedAt: new Date().toISOString()
      });

      // Audit Log - Data Reduction (only log changed fields)
      if (initialConfig) {
        const diff: any = { previous: {}, next: {} };
        let hasChanges = false;

        const compare = (key: string, oldVal: any, newVal: any) => {
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            diff.previous[key] = oldVal;
            diff.next[key] = newVal;
            hasChanges = true;
          }
        };

        compare('locations', initialConfig.config.locations, data.locations);
        compare('subLocations', initialConfig.config.subLocations, data.subLocations);
        compare('categories', initialConfig.config.categories, data.categories);
        compare('quickTap', initialConfig.quickTap, data.quickTap);

        if (hasChanges) {
          const isQuickTapOnly = Object.keys(diff.next).length === 1 && diff.next.quickTap;
          await logAction({
            tenantId,
            action: isQuickTapOnly ? 'QUICKTAP_CONFIG_UPDATE' : 'CONFIGURATION_UPDATE',
            actor: getAuditActor(),
            details: {
              changedFields: Object.keys(diff.next),
              ...(isQuickTapOnly && { itemCount: data.quickTap.items.length })
            },
            changes: {
              previousValue: diff.previous,
              newValue: diff.next
            }
          });
        }
      }

      // Sync state and initialConfig in parent
      setLocations(data.locations);
      setSubLocations(data.subLocations);
      setCategories(data.categories);
      setQuickTap(data.quickTap);

      setInitialConfig((prev: any) => ({
        ...prev,
        config: {
          locations: data.locations,
          subLocations: data.subLocations,
          categories: data.categories
        },
        quickTap: data.quickTap
      }));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  // Tab 3 Isolated Save Action
  const handleSaveGeneral = async (data: {
    tenantName: string;
    type: 'building' | 'municipality';
    language: 'he' | 'en';
    slaConfig: { enabled: boolean; workingDays: number[]; country: string; };
    uiConfig: { locationLabel: string; subLocationLabel: string; showLocation: boolean; };
  }) => {
    if (!user || !tenantId) return;

    try {
      const docRef = doc(db, "tenants", tenantId);
      await updateDoc(docRef, {
        name: data.tenantName,
        type: data.type,
        language: data.language,
        uiConfig: data.uiConfig,
        slaConfig: {
          enabled: data.slaConfig.enabled,
          workingDays: data.slaConfig.workingDays
        },
        country: data.slaConfig.country,
        updatedAt: new Date().toISOString()
      });

      // Audit Log - Data Reduction (only log changed fields)
      if (initialConfig) {
        const diff: any = { previous: {}, next: {} };
        let hasChanges = false;

        const compare = (key: string, oldVal: any, newVal: any) => {
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            diff.previous[key] = oldVal;
            diff.next[key] = newVal;
            hasChanges = true;
          }
        };

        compare('name', initialConfig.name, data.tenantName);
        compare('type', initialConfig.type, data.type);
        compare('language', initialConfig.language, data.language);
        compare('uiConfig', initialConfig.uiConfig, data.uiConfig);
        compare('slaConfig', initialConfig.slaConfig, data.slaConfig);

        if (hasChanges) {
          await logAction({
            tenantId,
            action: 'CONFIGURATION_UPDATE',
            actor: getAuditActor(),
            details: {
              changedFields: Object.keys(diff.next)
            },
            changes: {
              previousValue: diff.previous,
              newValue: diff.next
            }
          });
        }
      }

      // Sync state and initialConfig in parent
      setTenantName(data.tenantName);
      setType(data.type);
      setLanguage(data.language);
      setUiConfig(data.uiConfig);
      setSlaConfig(data.slaConfig);

      setInitialConfig((prev: any) => ({
        ...prev,
        name: data.tenantName,
        type: data.type,
        language: data.language,
        uiConfig: data.uiConfig,
        slaConfig: data.slaConfig
      }));
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  if (!user) return <Navigate to="/admin/login" />;

  const isBuilding = type === 'building';

  return (
    <div key={tenantId} className="min-h-screen bg-slate-50" dir="rtl">
      <header className="bg-slate-900 text-white p-3 md:p-5 sticky top-0 z-50 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-2 md:px-4">
          <div className="flex items-center gap-2 md:gap-4 text-right" dir="rtl">
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
              {tenantName || tenantId}
            </span>

            <span className="text-slate-600 font-light text-xl md:text-2xl hidden md:inline">|</span>

            {/* Left: Page Name */}
            <span className="text-sm md:text-lg text-white font-bold whitespace-nowrap hidden md:inline">
              הגדרות {isBuilding ? 'בניין' : 'עירייה'}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <Link
              to={`/admin/${tenantId}/dashboard`}
              className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-3 md:px-4 py-2 rounded-lg transition-all border border-slate-700 flex items-center gap-2 shrink-0"
            >
              <ArrowRight size={16} />
              <span className="hidden md:inline">חזרה לדשבורד</span>
            </Link>

            <button
              onClick={() => setIsHelpOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all"
              title="עזרה"
            >
              <HelpCircle size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Horizontal Sub-navigation Tab Bar */}
      <div className="border-b border-slate-200 bg-white sticky top-[72px] md:top-[104px] z-40 shadow-sm">
        <div className="max-w-4xl mx-auto flex justify-around sm:justify-start sm:gap-8 px-4" dir="rtl">
          <button
            onClick={() => setActiveTab('infrastructure')}
            className={`py-4 px-2 text-sm md:text-base font-bold transition-all relative border-b-2 outline-none ${
              activeTab === 'infrastructure'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            {isBuilding ? 'משאבי הבניין והתשתית' : 'משאבי היישוב והתשתית'}
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`py-4 px-2 text-sm md:text-base font-bold transition-all relative border-b-2 outline-none ${
              activeTab === 'users'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            ניהול משתמשים
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`py-4 px-2 text-sm md:text-base font-bold transition-all relative border-b-2 outline-none ${
              activeTab === 'general'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            הגדרות כלליות
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-4 md:p-6 mt-6 md:mt-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-medium mb-6 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500 font-bold">
            טוען נתונים...
          </div>
        ) : (
          <>
            {/* Tab 1: Infrastructure & Resources */}
            <div className={activeTab === 'infrastructure' ? '' : 'hidden'}>
              <InfrastructureTab
                initialLocations={locations}
                initialSubLocations={subLocations}
                initialCategories={categories}
                initialQuickTap={quickTap}
                uiConfig={uiConfig}
                isBuilding={isBuilding}
                onSave={handleSaveInfrastructure}
              />
            </div>

            {/* Tab 2: User Management */}
            <div className={activeTab === 'users' ? '' : 'hidden'}>
              <UsersTab
                tenantId={tenantId as string}
                callerUid={user?.uid || ''}
                callerName={adminProfile ? `${adminProfile.firstName} ${adminProfile.lastName}` : (user?.email || 'Admin')}
              />
            </div>

            {/* Tab 3: General Settings */}
            <div className={activeTab === 'general' ? '' : 'hidden'}>
              <GeneralSettingsTab
                initialTenantName={tenantName}
                initialType={type}
                initialLanguage={language}
                initialSlaConfig={slaConfig}
                initialUiConfig={uiConfig}
                isBuilding={isBuilding}
                onSave={handleSaveGeneral}
              />
            </div>
          </>
        )}
      </main>

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        language={language === 'he' ? 'he' : 'en'}
        tenantId={tenantId || ''}
        tenantName={tenantName}
      />
    </div>
  );
}
