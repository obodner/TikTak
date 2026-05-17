import { useEffect, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import { HelpModal } from '../../components/admin/HelpModal';
import { Save, ArrowRight, Globe, Layout, ListTodo, HelpCircle } from 'lucide-react';
import { ListEditor } from '../../components/admin/ListEditor';
import { UserManagement } from '../../components/admin/UserManagement';
import { CsvUploadPanel } from '../../components/admin/CsvUploadPanel';
import { QuickTapEditor, QuickTapItem } from '../../components/admin/QuickTapEditor';
import { logAction } from '../../utils/auditLogger';

export default function TenantSettings() {
  const { tenantId } = useParams();
  const { user, loading: authLoading } = useAuthState();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

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

  const handleSave = async (quickTapOverrideItems?: QuickTapItem[]) => {
    if (!user || !tenantId) return;
    setSaving(true);
    setMessage('');

    const currentQuickTap = quickTapOverrideItems
      ? { ...quickTap, items: quickTapOverrideItems }
      : quickTap;

    try {
      const docRef = doc(db, "tenants", tenantId);
      await updateDoc(docRef, {
        name: tenantName,
        type,
        language,
        config: {
          locations,
          subLocations,
          categories
        },
        quickTap: currentQuickTap,
        uiConfig,
        slaConfig: {
          enabled: slaConfig.enabled,
          workingDays: slaConfig.workingDays
        },
        country: slaConfig.country,
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

        compare('name', initialConfig.name, tenantName);
        compare('type', initialConfig.type, type);
        compare('language', initialConfig.language, language);
        compare('locations', initialConfig.config.locations, locations);
        compare('subLocations', initialConfig.config.subLocations, subLocations);
        compare('categories', initialConfig.config.categories, categories);
        compare('quickTap', initialConfig.quickTap, currentQuickTap);
        compare('uiConfig', initialConfig.uiConfig, uiConfig);
        compare('slaConfig', initialConfig.slaConfig, slaConfig);

        if (hasChanges) {
          const isQuickTapOnly = Object.keys(diff.next).length === 1 && diff.next.quickTap;
          await logAction({
            tenantId,
            action: isQuickTapOnly ? 'QUICKTAP_CONFIG_UPDATE' : 'CONFIGURATION_UPDATE',
            actor: getAuditActor(),
            details: {
              changedFields: Object.keys(diff.next),
              ...(isQuickTapOnly && { itemCount: currentQuickTap.items.length })
            },
            changes: {
              previousValue: diff.previous,
              newValue: diff.next
            }
          });
        }
      }

      // Update initial config for next potential save in same session
      setInitialConfig({
        name: tenantName,
        type,
        language,
        config: { locations, subLocations, categories },
        quickTap: currentQuickTap,
        uiConfig,
        slaConfig
      });

      setMessage('ההגדרות נשמרו בהצלחה!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('שגיאה בשמירת ההגדרות.');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
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

      <main className="max-w-4xl mx-auto p-6 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-medium">
              {error}
            </div>
          )}

          {/* Section 1: Core Content */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center gap-2 mb-6 border-b pb-4">
              <ListTodo className="text-blue-600" size={20} />
              <h2 className="text-xl font-bold text-slate-800">תצורת נתונים</h2>
            </div>

            {loading ? (
              <p className="text-slate-500">טוען נתונים...</p>
            ) : (
              <div className="flex flex-col gap-8">
                <ListEditor
                  label={uiConfig.locationLabel || (isBuilding ? "קומות" : "שכונות")}
                  items={locations}
                  onChange={setLocations}
                  allowRanges={isBuilding}
                  hideSortButton={false}
                  showNumericSort={isBuilding}
                  isLtr={isBuilding}
                  placeholder={isBuilding ? "הוסף קומה או טווח (-2-5)" : "הוסף שם שכונה"}
                  helperText={isBuilding ? "ניתן להוסיף קומות בודדות או טווחי מספרים." : "רשימת השכונות או האזורים הראשיים."}
                />

                <ListEditor
                  label={uiConfig.subLocationLabel || (isBuilding ? "משאבים/מתקנים" : "רחובות/מיקומים")}
                  items={subLocations}
                  onChange={setSubLocations}
                  placeholder={isBuilding ? "למשל: מעלית, בריכה, מועדון" : "למשל: רחוב הרצל, פארק מרכזי"}
                  helperText="אלו המקומות המדויקים שהדיירים יכולים לדווח עליהם."
                />

                <ListEditor
                  label="קטגוריות דיווח"
                  items={categories}
                  onChange={setCategories}
                  placeholder="למשל: חשמל, ניקיון, בור בכביש"
                  helperText="הקטגוריות שה-AI יסווג אליהן את הדיווחים."
                />

                <QuickTapEditor
                  items={quickTap.items}
                  categories={categories}
                  locations={locations}
                  subLocations={subLocations}
                  onChange={(items) => setQuickTap({ items })}
                  onSave={handleSave}
                />
              </div>
            )}
          </div>

          {/* Section 2: CSV Upload Panel */}
          <CsvUploadPanel
            tenantId={tenantId as string}
            callerName={adminProfile ? `${adminProfile.firstName} ${adminProfile.lastName}` : (user?.email || 'Admin')}
          />
        </div>

        {/* Sidebar: UI & Meta Config */}
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-800">הגדרות כלליות</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">סוג ישות (לקריאה בלבד)</label>
                <div className="w-full border border-slate-200 rounded-lg p-2 bg-slate-100 text-sm font-bold text-slate-500">
                  {isBuilding ? 'בניין מגורים' : 'עירייה / רשות'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">שפת דיווח</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-sm font-bold"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                >
                  <option value="he">עברית</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">מדינה (עבור לוח חגים)</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-sm font-bold"
                  value={slaConfig.country}
                  onChange={(e) => setSlaConfig(prev => ({ ...prev, country: e.target.value }))}
                >
                  <option value="IL">ישראל (IL)</option>
                  <option value="US">USA (US)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SLA Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <ListTodo className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-800">SLA ושקיפות קהילתית</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="slaEnabled"
                  checked={slaConfig.enabled}
                  onChange={(e) => setSlaConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600"
                />
                <label htmlFor="slaEnabled" className="text-sm font-bold text-slate-700">הפעל מודול SLA (צבעי דחיפות והודעות)</label>
              </div>

              {slaConfig.enabled && (
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">ימי עבודה פעילים</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((day, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          const newDays = slaConfig.workingDays.includes(index)
                            ? slaConfig.workingDays.filter(d => d !== index)
                            : [...slaConfig.workingDays, index].sort();
                          setSlaConfig(prev => ({ ...prev, workingDays: newDays }));
                        }}
                        className={`py-2 rounded-lg text-xs font-bold transition-all border ${
                          slaConfig.workingDays.includes(index)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">ימי העבודה משמשים לחישוב "ימי סטגנציה" של דיווחים.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layout className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-800">מיתוג ממשק (Labeling)</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">שם הישות (תצוגה)</label>
                <input
                  type="text"
                  placeholder="שם העירייה / הבניין"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm font-bold"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">תווית מיקום ראשי</label>
                <input
                  type="text"
                  placeholder={isBuilding ? "קומה" : "שכונה"}
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm"
                  value={uiConfig.locationLabel}
                  onChange={(e) => setUiConfig(prev => ({ ...prev, locationLabel: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">תווית תת-מיקום</label>
                <input
                  type="text"
                  placeholder={isBuilding ? "משאב" : "רחוב"}
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm"
                  value={uiConfig.subLocationLabel}
                  onChange={(e) => setUiConfig(prev => ({ ...prev, subLocationLabel: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="showLocation"
                  checked={uiConfig.showLocation}
                  onChange={(e) => setUiConfig(prev => ({ ...prev, showLocation: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600"
                />
                <label htmlFor="showLocation" className="text-sm font-bold text-slate-700">הצג שדה מיקום ראשי</label>
              </div>
            </div>
          </div>

          {!loading && (
            <UserManagement
              tenantId={tenantId as string}
              callerUid={user?.uid || ''}
              callerName={adminProfile ? `${adminProfile.firstName} ${adminProfile.lastName}` : (user?.email || 'Admin')}
            />
          )}

          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'שומר...' : 'שמור הגדרות'}
          </button>
          {message && <div className="text-center text-sm font-bold text-green-600 bg-green-50 py-2 rounded-lg border border-green-100">{message}</div>}
        </div>
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
