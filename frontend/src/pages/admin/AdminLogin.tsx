import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Snowflake } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { logAction, resetAuditSession } from '../../utils/auditLogger';

export default function AdminLogin() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Security
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // Multi-tenancy
  const [tenants, setTenants] = useState<{ id: string; name?: string; address?: string; isFrozen?: boolean }[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  
  // Forgot Password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('reason') === 'expired') {
      setError(t('Auth.sessionExpired', 'פג תוקף ההתחברות. נא להתחבר מחדש.'));
    }
  }, [location.search, t]);

  useEffect(() => {
    if (lockoutUntil) {
      const remaining = lockoutUntil - Date.now();
      if (remaining > 0) {
        const timer = setTimeout(() => {
          setLockoutUntil(null);
          setFailedAttempts(0);
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        setLockoutUntil(null);
        setFailedAttempts(0);
      }
    }
  }, [lockoutUntil]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutUntil && Date.now() < lockoutUntil) {
      setError(`ננעלת. נסה שוב בעוד ${Math.ceil((lockoutUntil - Date.now())/1000)} שניות.`);
      return;
    }

    if (!email || !password) {
      setError('נא למלא את כל השדות');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      // 1. Authenticate user
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      resetAuditSession(); // New: Generate new session ID upon successful login

      // Reset strikes
      setFailedAttempts(0);

      // 2. Check for Super Admin role via Custom Claims
      const idTokenResult = await userCredential.user.getIdTokenResult();
      const isSuperAdmin = idTokenResult.claims.role === 'super';
      setIsSuper(isSuperAdmin);

      const tenantsRef = collection(db, "tenants");
      let foundTenants: { id: string; name?: string; address?: string; isFrozen?: boolean }[] = [];

      if (isSuperAdmin) {
        // Super Admins get access to all tenants
        const allTenantsSnapshot = await getDocs(tenantsRef);
        foundTenants = allTenantsSnapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name,
            address: d.address,
            isFrozen: d.isActive === false || d.subscription?.status === 'frozen'
          };
        });
      } else {
        // Regular Admins only see their assigned tenants
        const q = query(tenantsRef, where("adminUids", "array-contains", uid));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError('חשבון זה אינו משויך לאף ישות במערכת. נא לפנות לתמיכה.');
          await auth.signOut();
          return;
        }

        foundTenants = querySnapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name,
            address: d.address,
            isFrozen: d.isActive === false || d.subscription?.status === 'frozen'
          };
        });

        // Check if all assigned tenants are frozen
        const activeTenants = foundTenants.filter(t => !t.isFrozen);
        if (foundTenants.length > 0 && activeTenants.length === 0) {
          setError('חשבון הישות מוקפא זמנית על ידי הנהלת המערכת. לפתיחת החשבון וחידוש הפעילות, נא לפנות לתמיכה או למנהל המערכת.');
          await auth.signOut();
          return;
        }
      }

      // 3. Handle multi-tenancy or single tenant
      if (foundTenants.length === 1) {
        const t = foundTenants[0];

        if (!isSuperAdmin && t.isFrozen) {
          setError('חשבון הישות מוקפא זמנית על ידי הנהלת המערכת. לפתיחת החשבון וחידוש הפעילות, נא לפנות לתמיכה או למנהל המערכת.');
          await auth.signOut();
          return;
        }
        
        // Fetch full name for audit log
        let actorName = email.split('@')[0];
        try {
          const uDoc = await getDoc(doc(db, "tenants", t.id, "adminUsers", uid));
          if (uDoc.exists()) {
            const uData = uDoc.data();
            actorName = `${uData.firstName} ${uData.lastName}`;
          }
        } catch (e) { console.error(e); }

        await logAction({
          tenantId: t.id,
          action: 'LOGIN',
          actor: { uid: uid, name: actorName, email, type: 'admin' },
          details: { tenantName: t.name }
        });

        // Track definite lastLogin on tenant
        try {
          await updateDoc(doc(db, "tenants", t.id), {
            lastLogin: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          await updateDoc(doc(db, "tenants", t.id, "adminUsers", uid), {
            lastLogin: serverTimestamp()
          });
        } catch (trackErr) {
          console.warn("Could not record lastLogin:", trackErr);
        }

        navigate(`/admin/${t.id}/dashboard`);
      } else {
        setTenants(foundTenants);
      }
    } catch (err: any) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= 3) {
        setLockoutUntil(Date.now() + 30000); // 30 seconds lockout
        setError('יותר מדי ניסיונות שגויים. ננעלת למשך 30 שניות.');
      } else {
        setError('התחברות נכשלה. נא לבדוק פרטים.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('נא להזין כתובת אימייל לאיפוס סיסמה.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('קישור לאיפוס סיסמה נשלח למייל שלך.');
      setIsForgotPassword(false);
    } catch (err: any) {
      setError('שגיאה בשליחת אימייל לאיפוס סיסמה. אנא ודא שהאימייל תקין.');
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockoutUntil !== null && Date.now() < lockoutUntil;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50" dir="rtl">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg border border-slate-200">
        <div className="flex justify-center mb-6 select-none">
          <img src="/logo_transparent.png" alt="TikTak" className="h-[80px] w-auto object-contain" />
        </div>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4 animate-in slide-in-from-top-2">{error}</div>}
        {message && <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm mb-4 animate-in slide-in-from-top-2">{message}</div>}
        
        {tenants.length > 1 ? (
          <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-xl font-bold text-slate-800 text-center mb-4">בחר סביבת ניהול</h2>
            {tenants.map(t => {
              const isBlocked = Boolean(t.isFrozen && !isSuper);
              return (
                <button 
                  key={t.id}
                  disabled={isBlocked}
                  onClick={async () => {
                    if (isBlocked) return;
                    let actorName = auth.currentUser?.email?.split('@')[0] || 'Admin';
                    try {
                      const uDoc = await getDoc(doc(db, "tenants", t.id, "adminUsers", auth.currentUser?.uid as string));
                      if (uDoc.exists()) {
                        const uData = uDoc.data();
                        actorName = `${uData.firstName} ${uData.lastName}`;
                      }
                    } catch (e) { console.error(e); }

                    await logAction({
                      tenantId: t.id,
                      action: 'LOGIN',
                      actor: { 
                        uid: auth.currentUser?.uid || 'unknown', 
                        name: actorName, 
                        email: auth.currentUser?.email || undefined, 
                        type: 'admin' 
                      },
                      details: { tenantName: t.name }
                    });

                    // Track definite lastLogin on tenant
                    try {
                      const loggedUid = auth.currentUser?.uid;
                      await updateDoc(doc(db, "tenants", t.id), {
                        lastLogin: serverTimestamp(),
                        updatedAt: serverTimestamp()
                      });
                      if (loggedUid) {
                        await updateDoc(doc(db, "tenants", t.id, "adminUsers", loggedUid), {
                          lastLogin: serverTimestamp()
                        });
                      }
                    } catch (trackErr) {
                      console.warn("Could not record lastLogin:", trackErr);
                    }

                    navigate(`/admin/${t.id}/dashboard`);
                  }}
                  className={`p-4 border rounded-lg transition-all text-right shadow-sm flex items-center justify-between ${
                    isBlocked 
                      ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed' 
                      : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50 active:scale-95 cursor-pointer'
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-800">{t.name || 'מבנה ללא שם'}</div>
                    <div className="text-sm text-slate-500 mt-1">{t.address || t.id}</div>
                  </div>
                  {t.isFrozen && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                      <Snowflake size={12} />
                      <span>מוקפא</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : isForgotPassword ? (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">כתובת אימייל</label>
              <input 
                type="email" 
                required
                className="w-full border border-slate-300 rounded-md p-3 focus:ring-2 focus:ring-blue-600 focus:outline-none text-left text-slate-900 bg-slate-50" 
                dir="ltr"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
            </div>
            <button 
              type="submit" 
              disabled={loading || isLocked}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'שולח...' : 'שלח קישור לאיפוס'}
            </button>
            <button 
              type="button" 
              onClick={() => { setIsForgotPassword(false); setError(''); setMessage(''); }}
              className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors text-center mt-2"
            >
              חזור להתחברות
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">כתובת אימייל</label>
              <input 
                type="email" 
                required
                className="w-full border border-slate-300 rounded-md p-3 focus:ring-2 focus:ring-blue-600 focus:outline-none text-left text-slate-900 bg-slate-50" 
                dir="ltr"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה</label>
              <input 
                type="password" 
                required
                className="w-full border border-slate-300 rounded-md p-3 focus:ring-2 focus:ring-blue-600 focus:outline-none text-left text-slate-900 bg-slate-50" 
                dir="ltr"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
            </div>
            
            <div className="flex justify-end -mt-2">
              <button 
                type="button" 
                onClick={() => { setIsForgotPassword(true); setError(''); setMessage(''); }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                שכחת סיסמה?
              </button>
            </div>

            <button 
              type="submit" 
              disabled={loading || isLocked}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'מתחבר...' : isLocked ? `ננעל (${Math.ceil(((lockoutUntil || 0) - Date.now())/1000)}s)` : 'התחבר'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
