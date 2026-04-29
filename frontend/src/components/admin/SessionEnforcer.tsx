import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const SESSION_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 hours

export function SessionEnforcer({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/admin/login');
        return;
      }

      const lastSignInTime = user.metadata.lastSignInTime;
      if (lastSignInTime) {
        const timeSinceLogin = Date.now() - new Date(lastSignInTime).getTime();
        
        if (timeSinceLogin > SESSION_LIMIT_MS) {
          console.warn("Session expired (8 hour limit). Logging out.");
          await signOut(auth);
          navigate('/admin/login');
          return;
        }
      }

      setIsValidating(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  if (isValidating) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="animate-pulse bg-slate-200 h-12 w-12 rounded-full"></div>
      </div>
    );
  }

  return <>{children}</>;
}
