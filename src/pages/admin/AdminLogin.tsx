import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // 2. Lookup tenant where this user is an admin
      const tenantsRef = collection(db, "tenants");
      const q = query(tenantsRef, where("adminUids", "array-contains", uid), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('חשבון זה אינו משויך לאף ישות במערכת. נא לפנות לתמיכה.');
        await auth.signOut(); // Clean up session
        return;
      }

      // 3. Automated redirect to the detected tenant
      const tenantId = querySnapshot.docs[0].id;
      navigate(`/admin/${tenantId}/dashboard`);
    } catch (err: any) {
      setError('התחברות נכשלה. נא לבדוק פרטים.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50" dir="rtl">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-lg border border-slate-200">
        <h1 className="text-2xl font-bold text-center mb-6 text-slate-800">TikTak Admin</h1>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">{error}</div>}
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">כתובת אימייל</label>
            <input 
              type="email" 
              required
              className="w-full border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-blue-600 focus:outline-none text-left text-slate-900" 
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
              className="w-full border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-blue-600 focus:outline-none text-left text-slate-900" 
              dir="ltr"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>
      </div>
    </div>
  );
}
