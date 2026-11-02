import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, AlertCircle, Clock, ArrowRight, UserPlus, ShieldCheck, Phone, User } from 'lucide-react';

interface InviteInfo {
  valid: boolean;
  tenantId: string;
  token: string;
  buildingName: string;
  buildingAddress: string;
  tenantType?: 'building' | 'municipality';
  inviteType: 'single' | 'group';
  expiresAt: string;
}

export default function ResidentSelfJoinPage() {
  const { slug, tenantId: paramTenantId, token: paramToken } = useParams<{
    slug?: string;
    tenantId?: string;
    token?: string;
  }>();
  const navigate = useNavigate();

  // Parse effective slug and token
  const effectiveSlug = slug || (paramTenantId && paramToken ? `${paramTenantId}__${paramToken}` : '');

  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states - Name and Phone only
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Success state
  const [isSuccess, setIsSuccess] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const isMunicipality = inviteInfo?.tenantType === 'municipality';
  const systemTargetName = isMunicipality ? 'למערכת הישוב / רשות' : 'למערכת הבניין';
  const targetScope = isMunicipality ? 'היישוב / רשות' : 'הבניין';
  const entityAuthority = isMunicipality ? 'מוקד השירות' : 'ועד הבית';
  const systemReports = isMunicipality ? 'מפגעים ופניות' : 'תקלות';

  useEffect(() => {
    async function validateToken() {
      if (!effectiveSlug) {
        setLoading(false);
        setErrorReason('INVALID_LINK');
        setErrorMessage('קישור ההצטרפות אינו תקין.');
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/validateInvite?token=${encodeURIComponent(effectiveSlug)}`);
        const data = await res.json();

        if (res.ok && data.valid) {
          setInviteInfo(data);
          setErrorReason(null);
          setErrorMessage(null);
        } else {
          setErrorReason(data.reason || 'INVALID');
          setErrorMessage(data.message || 'הקישור אינו תקין או שפג תוקפו.');
        }
      } catch (err: any) {
        console.error('Validation error:', err);
        setErrorReason('NETWORK_ERROR');
        setErrorMessage('שגיאת תקשורת בבדיקת הקישור. אנא נסה שנית.');
      } finally {
        setLoading(false);
      }
    }

    validateToken();
  }, [effectiveSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('אנא הזן שם מלא.');
      return;
    }

    if (!/^[\u0590-\u05FFa-zA-Z0-9\s-]+$/.test(trimmedName)) {
      setFormError('השם יכול להכיל אותיות בעברית או באנגלית, מספרים ומקפים בלבד.');
      return;
    }

    let cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('972') && cleanPhone.length === 12) {
      cleanPhone = '0' + cleanPhone.substring(3);
    }
    if (cleanPhone.length === 9 && !cleanPhone.startsWith('0')) {
      cleanPhone = '0' + cleanPhone;
    }

    if (!/^0\d{8,9}$/.test(cleanPhone)) {
      setFormError('מספר הטלפון אינו תקין. יש להזין מספר נייד תקין בישראל (9-10 ספרות).');
      return;
    }

    if (!inviteInfo) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/submitResidentSelfOnboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId: inviteInfo.tenantId,
          token: inviteInfo.token,
          name: trimmedName,
          phone: cleanPhone
        })
      });

      const result = await res.json();

      if (res.ok && result.success) {
        try {
          localStorage.setItem(`tiktak_reporter_phone_${inviteInfo.tenantId}`, cleanPhone);
          localStorage.setItem(`tiktak_reporter_name_${inviteInfo.tenantId}`, trimmedName);
          localStorage.setItem('tiktak_reporter_phone', cleanPhone);
          sessionStorage.setItem(`tiktak_joined_${inviteInfo.tenantId}`, 'true');
        } catch {
          // ignore storage errors
        }

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50);
        }

        setAlreadyRegistered(!!result.alreadyRegistered);
        setIsSuccess(true);
      } else {
        setFormError(result.error || 'חלה שגיאה בהרשמה. אנא נסה שוב.');
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      setFormError('שגיאת תקשורת. אנא בדוק את החיבור לאינטרנט ונסה שוב.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatExpiryTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6" dir="rtl">
      {/* Container Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        {/* Brand Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-200">TikTak Resident</div>
              <h1 className="text-lg font-bold">הצטרפות לדיווח {systemReports}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-blue-800/40 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-400/30">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-200" />
            <span>מורשה</span>
          </div>
        </div>

        {/* State 1: Loading Skeleton */}
        {loading && (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-6 bg-slate-200 rounded-lg w-3/4 mx-auto"></div>
            <div className="h-4 bg-slate-100 rounded-lg w-1/2 mx-auto"></div>
            <div className="space-y-3 pt-4">
              <div className="h-10 bg-slate-100 rounded-xl"></div>
              <div className="h-10 bg-slate-100 rounded-xl"></div>
              <div className="h-12 bg-blue-200 rounded-xl"></div>
            </div>
          </div>
        )}

        {/* State 2: Invalid / Expired / Revoked */}
        {!loading && !inviteInfo && (
          <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2 border border-red-100">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              {errorReason === 'EXPIRED'
                ? 'תוקף הקישור פג'
                : errorReason === 'ALREADY_USED'
                ? 'הקישור כבר נוצל'
                : errorReason === 'REVOKED'
                ? 'הקישור בוטל'
                : 'קישור לא תקין'}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {errorMessage || `קישור ההצטרפות אינו פעיל. אנא פנה ל${entityAuthority} לקבלת קישור חדש.`}
            </p>
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 px-4 rounded-xl font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                חזרה לדף הבית
              </button>
            </div>
          </div>
        )}

        {/* State 3: Success Screen */}
        {!loading && inviteInfo && isSuccess && (
          <div className="p-6 sm:p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-200 shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-slate-900 mb-1">
                {alreadyRegistered ? 'אתה כבר רשום במערכת! 👏' : 'הצטרפת בהצלחה! 🎉'}
              </h2>
              <p className="text-sm text-slate-600">
                מספר הטלפון שלך מורשה מעכשיו לדיווח על {systemReports} ולקבל עדכונים ב-
                <span className="font-semibold text-slate-900 block mt-1">{inviteInfo.buildingName}</span>
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 text-right space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-blue-700">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>מוכן לדיווח מיידי (Snap & Send)</span>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                תוכל/י לצלם {systemReports} ({isMunicipality ? 'בור בכביש, תאורת רחוב, גינון' : 'נורה שרופה, מעלית תקועה, ניקיון'}) והמערכת תפענח אותם אוטומטית ותעביר ל{entityAuthority}.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => navigate(`/report/${inviteInfo.tenantId}`)}
                className="w-full py-3.5 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-95 transition flex items-center justify-center gap-2"
              >
                <span>לדיווח על {isMunicipality ? 'מפגע' : 'תקלה'} עכשיו 📸</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>

              <button
                onClick={() => navigate(`/report/${inviteInfo.tenantId}/dashboard`)}
                className="w-full py-2.5 px-4 rounded-xl font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition text-sm"
              >
                לצפייה בלוח ה{systemReports} של {targetScope}
              </button>
            </div>
          </div>
        )}

        {/* State 4: Active Onboarding Form */}
        {!loading && inviteInfo && !isSuccess && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Building / Municipality Context Badge */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="text-right flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-base truncate">{inviteInfo.buildingName}</div>
                {inviteInfo.buildingAddress && (
                  <div className="text-xs text-slate-500 truncate">{inviteInfo.buildingAddress}</div>
                )}
              </div>
            </div>

            {/* Time limit badge */}
            <div className="flex items-center justify-between text-xs text-slate-500 bg-amber-50 border border-amber-200/70 text-amber-800 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>הקישור בתוקף עד: <strong>{formatExpiryTime(inviteInfo.expiresAt)}</strong></span>
              </div>
              <span className="text-[11px] bg-amber-100 px-2 py-0.5 rounded font-semibold">
                {inviteInfo.inviteType === 'group' ? 'קבוצתי' : 'אישי'}
              </span>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form Fields: Full Name & Phone only */}
            <div className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>שם מלא <strong className="text-red-500">*</strong></span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="לדוגמה: ישראל ישראלי"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>מספר טלפון נייד <strong className="text-red-500">*</strong></span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="050-1234567"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-right bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  מספר הטלפון ישמש לזיהוי שקט ללא צורך בסיסמאות בעת פתיחת קריאות.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-60 disabled:pointer-events-none transition flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span>רושם אותך למערכת... ⏳</span>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>הצטרפות מהירה {systemTargetName} ⚡</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-center text-[11px] text-slate-400">
              TikTak • הרשמה מאובטחת ומבודדת בלבד
            </p>
          </form>
        )}

      </div>
    </div>
  );
}
