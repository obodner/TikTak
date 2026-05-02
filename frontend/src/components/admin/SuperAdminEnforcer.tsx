import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export function SuperAdminEnforcer({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/admin/login');
        return;
      }

      try {
        const idTokenResult = await user.getIdTokenResult();
        if (idTokenResult.claims.role !== 'super') {
          console.warn("Unauthorized access: User is not a Super Admin.");
          navigate('/admin/login');
          return;
        }
        setIsVerifying(false);
      } catch (err) {
        console.error("Failed to verify Super Admin status:", err);
        navigate('/admin/login');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  if (isVerifying) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-blue-500 font-bold tracking-widest text-xs uppercase animate-pulse">Verifying God Mode</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
