import React, { useState, useEffect, useRef } from 'react';
import { X, Headphones, Mail, Copy, Check, Send, Loader2, Building2, User, Phone } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName?: string;
  tenantId?: string;
  isEn?: boolean;
}

const SUPPORT_EMAIL = 'tiktak.support@gmail.com';
const COOLDOWN_SECONDS = 60;

export const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  tenantName,
  tenantId,
  isEn = false
}) => {
  const [question, setQuestion] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [showToast, setShowToast] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const toastTimersRef = useRef<{ fade?: NodeJS.Timeout; close?: NodeJS.Timeout }>({});

  useEffect(() => {
    return () => {
      if (toastTimersRef.current.fade) clearTimeout(toastTimersRef.current.fade);
      if (toastTimersRef.current.close) clearTimeout(toastTimersRef.current.close);
    };
  }, []);

  // Admin user context preview
  const [adminDetails, setAdminDetails] = useState<{ name?: string; phone?: string; email?: string }>({});

  // Check cooldown timer from sessionStorage
  useEffect(() => {
    const checkCooldown = () => {
      const storedUntil = sessionStorage.getItem('tiktak_support_cooldown_until');
      if (storedUntil) {
        const remaining = Math.ceil((parseInt(storedUntil, 10) - Date.now()) / 1000);
        if (remaining > 0) {
          setCooldownRemaining(remaining);
        } else {
          sessionStorage.removeItem('tiktak_support_cooldown_until');
          setCooldownRemaining(0);
        }
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch admin user profile when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setSuccessMsg('');
    setErrorMsg('');

    const fetchAdminProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      let name = user.displayName || '';
      let phone = user.phoneNumber || '';
      let email = user.email || '';

      if (tenantId && user.uid) {
        try {
          const userDoc = await getDoc(doc(db, 'tenants', tenantId, 'adminUsers', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            if (fullName) name = fullName;
            if (data.mobile) phone = data.mobile;
            if (data.email) email = data.email;
          }
        } catch (e) {
          console.error('Failed to fetch admin profile for contact modal:', e);
        }
      }

      setAdminDetails({ name, phone, email });
    };

    fetchAdminProfile();
  }, [isOpen, tenantId]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || cooldownRemaining > 0) return;

    const trimmed = question.trim();
    if (trimmed.length < 5) {
      setErrorMsg(isEn ? 'Please enter at least 5 characters.' : 'אנא הזן לפחות 5 תווים בשאלתך.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';

      const response = await fetch('/api/submitSupportInquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          tenantId: tenantId || '',
          question: trimmed,
          callerUid: user?.uid || ''
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const waitSec = data.retryAfterSeconds || COOLDOWN_SECONDS;
          const targetTime = Date.now() + waitSec * 1000;
          sessionStorage.setItem('tiktak_support_cooldown_until', targetTime.toString());
          setCooldownRemaining(waitSec);
        }
        throw new Error(data.error || (isEn ? 'Failed to submit inquiry' : 'שליחת הפנייה נכשלה'));
      }

      setQuestion('');

      const targetTime = Date.now() + COOLDOWN_SECONDS * 1000;
      sessionStorage.setItem('tiktak_support_cooldown_until', targetTime.toString());
      setCooldownRemaining(COOLDOWN_SECONDS);

      // Close the modal immediately as requested by user
      onClose();

      // Show pop-up window with fade out after 2-3 seconds
      if (toastTimersRef.current.fade) clearTimeout(toastTimersRef.current.fade);
      if (toastTimersRef.current.close) clearTimeout(toastTimersRef.current.close);

      setShowToast(true);
      setIsFadingOut(false);

      toastTimersRef.current.fade = setTimeout(() => {
        setIsFadingOut(true);
      }, 2300);

      toastTimersRef.current.close = setTimeout(() => {
        setShowToast(false);
        setIsFadingOut(false);
      }, 2800);
    } catch (err: any) {
      setErrorMsg(err.message || (isEn ? 'Failed to send inquiry' : 'אירעה שגיאה בשליחת הפנייה'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen && !showToast) return null;

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          dir={isEn ? 'ltr' : 'rtl'}
        >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative w-full max-w-lg bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Headphones size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEn ? 'Contact & Support' : 'צור קשר ותמיכה'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEn ? 'TikTak Administrator Support Desk' : 'מוקד הליווי והתמיכה למנהלי TikTak'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            aria-label={isEn ? 'Close' : 'סגור'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Option 1: Direct Support Email */}
          <div className="bg-slate-850/70 rounded-xl p-4 border border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg shrink-0">
                <Mail size={20} />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-400 block font-medium">
                  {isEn ? 'Option 1: Direct Support Email' : 'אפשרות 1: דוא"ל ישיר למוקד התמיכה'}
                </span>
                <a 
                  href={`mailto:${SUPPORT_EMAIL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-slate-200 hover:text-blue-400 transition-colors truncate block"
                  title={SUPPORT_EMAIL}
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyEmail}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all shrink-0 ${
                copied
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  <span>{isEn ? 'Copied!' : 'הועתק!'}</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>{isEn ? 'Copy' : 'העתק כתובת'}</span>
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-1">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-4 py-1 text-base md:text-lg text-slate-300 font-bold uppercase rounded-full border border-slate-700/80 shadow-sm absolute select-none">
              {isEn ? 'OR' : 'או'}
            </span>
          </div>

          {/* Option 2: Short Question Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <label 
                htmlFor="support-question" 
                className="text-xs font-bold text-slate-300 flex items-center gap-1.5"
              >
                <span>{isEn ? 'Option 2: Ask a Question' : 'אפשרות 2: שאלתך למוקד התמיכה'}</span>
                <span className="text-red-400">*</span>
              </label>

              {cooldownRemaining > 0 && (
                <span className="text-xs text-amber-400 font-medium">
                  {isEn ? `Wait ${cooldownRemaining}s` : `המתן ${cooldownRemaining} שניות`}
                </span>
              )}
            </div>

            <div className="relative">
              <textarea
                id="support-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                maxLength={1000}
                disabled={submitting || cooldownRemaining > 0}
                placeholder={
                  isEn
                    ? 'Type your question or request here (e.g. assistance with vendor setup, quota increase, etc.)...'
                    : 'תאר כאן את שאלתך או בקשתך (למשל: סיוע בהגדרת ספקים, שדרוג חבילה, תמיכה טכנית)...'
                }
                className="w-full bg-slate-950/80 text-slate-100 placeholder-slate-500 text-sm rounded-xl p-3 border border-slate-750 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all disabled:opacity-60 resize-none"
              />
              <div className="absolute bottom-2.5 left-3 text-[11px] text-slate-500 font-mono">
                {question.length}/1000
              </div>
            </div>

            {/* Context Auto-Attached Notice */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 space-y-1.5">
              <span className="font-semibold text-slate-300 block">
                {isEn ? 'Your inquiry will automatically include:' : 'הפנייה תישלח באופן אוטומטי בצירוף פרטיך:'}
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300 text-[11px]">
                {(tenantName || tenantId) && (
                  <span className="flex items-center gap-1">
                    <Building2 size={12} className="text-slate-400" />
                    <strong>{tenantName || tenantId}</strong>
                  </span>
                )}
                {adminDetails.name && (
                  <span className="flex items-center gap-1">
                    <User size={12} className="text-slate-400" />
                    <span>{adminDetails.name}</span>
                  </span>
                )}
                {adminDetails.phone && (
                  <span className="flex items-center gap-1" dir="ltr">
                    <Phone size={12} className="text-slate-400" />
                    <span>{adminDetails.phone}</span>
                  </span>
                )}
                {adminDetails.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} className="text-slate-400" />
                    <span>{adminDetails.email}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Status Messages */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-xs text-emerald-200">
                {successMsg}
              </div>
            )}

            {/* Submit Action */}
            <button
              type="submit"
              disabled={submitting || question.trim().length < 5 || cooldownRemaining > 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{isEn ? 'Sending...' : 'שולח פנייה...'}</span>
                </>
              ) : cooldownRemaining > 0 ? (
                <span>
                  {isEn 
                    ? `Please wait ${cooldownRemaining}s before next inquiry` 
                    : `ניתן לשלוח פנייה נוספת בעוד ${cooldownRemaining} שניות`}
                </span>
              ) : (
                <>
                  <Send size={16} />
                  <span>{isEn ? 'Submit Question' : 'שלח פנייה לצוות התמיכה'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            {isEn ? 'Close' : 'סגור'}
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Floating Success Pop-up Window */}
  {showToast && (
    <div
      className={`fixed top-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 ease-out transform ${
        isFadingOut
          ? 'opacity-0 -translate-y-3 scale-95 pointer-events-none'
          : 'opacity-100 translate-y-0 scale-100'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
      role="status"
      aria-live="polite"
      data-testid="contact-success-toast"
    >
      <div className="bg-slate-900/95 text-white border border-emerald-500/40 shadow-2xl shadow-emerald-950/60 rounded-2xl px-5 py-4 flex items-center gap-3.5 backdrop-blur-md">
        <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
          <Check size={22} className="stroke-[2.5]" />
        </div>
        <div className="flex flex-col">
          <span className="font-extrabold text-sm sm:text-base text-white">
            {isEn ? 'We received your message' : 'קיבלנו את הודעתך'}
          </span>
          <span className="text-xs text-slate-300 font-medium">
            {isEn
              ? 'Our support team will get back to you within 1 working day.'
              : 'צוות התמיכה שלנו יחזור אליך תוך יום עסקים אחד.'}
          </span>
        </div>
      </div>
    </div>
  )}
</>
  );
};
