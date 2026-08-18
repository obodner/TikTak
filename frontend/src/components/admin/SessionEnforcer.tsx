import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

const SESSION_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 hours

export function SessionEnforcer({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isValidating, setIsValidating] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  const handleSessionExpired = async () => {
    console.warn("Session expired (8 hour limit). Logging out automatically.");
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error during session expiry:", err);
    }
    navigate('/admin/login?reason=expired', { replace: true });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/admin/login', { replace: true });
        return;
      }

      setCurrentUser(user);

      const lastSignInTime = user.metadata.lastSignInTime;
      if (lastSignInTime) {
        const timeSinceLogin = Date.now() - new Date(lastSignInTime).getTime();
        
        if (timeSinceLogin >= SESSION_LIMIT_MS) {
          handleSessionExpired();
          return;
        }

        // Schedule precise timer for remaining session duration
        const remainingMs = SESSION_LIMIT_MS - timeSinceLogin;
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = setTimeout(() => {
          handleSessionExpired();
        }, remainingMs);
      }

      setIsValidating(false);
    });

    return () => {
      unsubscribe();
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    };
  }, [navigate]);

  // Periodic check (every 30 seconds) and tab visibility listener for wake/focus events
  useEffect(() => {
    if (!currentUser) return;

    const checkExpiration = () => {
      const lastSignInTime = currentUser.metadata.lastSignInTime;
      if (lastSignInTime) {
        const timeSinceLogin = Date.now() - new Date(lastSignInTime).getTime();
        if (timeSinceLogin >= SESSION_LIMIT_MS) {
          handleSessionExpired();
        }
      }
    };

    const intervalId = setInterval(checkExpiration, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExpiration();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser]);

  if (isValidating) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="animate-pulse bg-slate-200 h-12 w-12 rounded-full"></div>
      </div>
    );
  }

  return <>{children}</>;
}
