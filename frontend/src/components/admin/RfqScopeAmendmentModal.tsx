import { useState } from 'react';
import {
  X,
  Lock,
  FileEdit,
  Clock,
  Calendar,
  Send,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Info
} from 'lucide-react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import { WorkQuoteRequest, ScopeAmendmentRecord } from '../../types/rfq';
import { logAction } from '../../utils/auditLogger';

// Helper to remove any undefined properties recursively while preserving Firestore FieldValues
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'object' && (obj._methodName || (obj.constructor && obj.constructor.name === 'FieldValue'))) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        clean[k] = (typeof v === 'object' && v !== null) ? sanitizeForFirestore(v) : v;
      }
    }
    return clean;
  }
  return obj;
}

interface RfqScopeAmendmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  rfq: WorkQuoteRequest;
  tenantId: string;
  onSuccess: (updatedRfq: WorkQuoteRequest) => void;
}

export default function RfqScopeAmendmentModal({
  isOpen,
  onClose,
  rfq,
  tenantId,
  onSuccess
}: RfqScopeAmendmentModalProps) {
  const { user } = useAuthState();
  const currentVersion = rfq.scopeVersion || 1;
  const nextVersion = currentVersion + 1;

  // Form states
  const [title, setTitle] = useState(rfq.title || '');
  const [description, setDescription] = useState(rfq.description || '');
  const [allowedWorkHours, setAllowedWorkHours] = useState(
    rfq.allowedWorkHours || 'בימים א\'-ה\' בין השעות 08:00 - 17:00, ובימי ו\' וערבי חג עד השעה 13:00'
  );
  
  // Format deadline for datetime-local input
  const initialDeadline = rfq.deadlineAt
    ? new Date(rfq.deadlineAt).toISOString().slice(0, 16)
    : '';
  const [deadlineAt, setDeadlineAt] = useState(initialDeadline);

  // Mandatory change summary
  const [changeSummary, setChangeSummary] = useState('');
  const [notifyVendors, setNotifyVendors] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Check if contract is sealed or RFQ is closed (completed, cancelled, or expired)
  const isContractSealed = Boolean(
    rfq.contractExecution?.status === 'signed_by_admin' ||
    rfq.contractExecution?.status === 'fully_signed'
  );

  const isRfqClosed = Boolean(
    rfq.status === 'completed' ||
    rfq.status === 'cancelled' ||
    (rfq.deadlineAt && new Date(rfq.deadlineAt).getTime() < Date.now())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isContractSealed) {
      setErrorMsg('הסכם העבודה כבר נחתם - לא ניתן לערוך את מפרט הבקשה.');
      return;
    }
    if (isRfqClosed) {
      setErrorMsg('פנייה זו הושלמה או נסגרה (הושלמה / בוטלה / פג תוקפה) - לא ניתן לערוך את המפרט.');
      return;
    }

    const trimmedSummary = changeSummary.trim();
    if (!trimmedSummary || trimmedSummary.length < 5) {
      setErrorMsg('נא להזין פירוט קצר ותמציתי של מה שהשתנה או התווסף למפרט (לפחות 5 תווים).');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('תיאור המשימות והמפרט אינו יכול להישאר ריק.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const nowIso = new Date().toISOString();
      const adminName = user?.displayName || user?.email || 'ועד הבית';

      const changes: Record<string, any> = {};
      if (title.trim() !== rfq.title) {
        changes.title = title.trim();
      }
      if (description.trim() !== rfq.description) {
        changes.description = description.trim();
      }
      if (allowedWorkHours.trim() !== rfq.allowedWorkHours) {
        changes.allowedWorkHours = allowedWorkHours.trim();
      }
      if (deadlineAt && new Date(deadlineAt).toISOString() !== rfq.deadlineAt) {
        changes.deadlineAt = new Date(deadlineAt).toISOString();
      }

      const amendmentRecord: ScopeAmendmentRecord = {
        version: nextVersion,
        amendedAt: nowIso,
        amendedBy: {
          uid: user?.uid || 'admin',
          name: adminName,
          ...(user?.email ? { email: user.email } : {})
        },
        changeSummary: trimmedSummary,
        ...(rfq.description ? { previousDescription: rfq.description } : {}),
        ...(rfq.allowedWorkHours ? { previousAllowedWorkHours: rfq.allowedWorkHours } : {}),
        ...(rfq.deadlineAt ? { previousDeadlineAt: rfq.deadlineAt } : {}),
        changes,
        notifiedVendorsCount: notifyVendors ? (rfq.dispatchedVendors?.length || 0) : 0
      };

      const existingHistory = rfq.scopeHistory || [];
      const updatedHistory = [...existingHistory, amendmentRecord];

      const rfqRef = doc(db, 'tenants', tenantId, 'rfqs', rfq.id);

      const updates: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        allowedWorkHours: allowedWorkHours.trim(),
        scopeVersion: nextVersion,
        scopeHistory: updatedHistory,
        updatedAt: nowIso
      };

      if (rfq.workStartDate) updates.workStartDate = rfq.workStartDate;
      if (rfq.workTargetEndDate) updates.workTargetEndDate = rfq.workTargetEndDate;
      if (deadlineAt) {
        updates.deadlineAt = new Date(deadlineAt).toISOString();
      }

      // If RFQ was previously awarded, un-award it and reopen for bidding on the new scope
      const isCurrentlyAwarded = Boolean(rfq.status === 'awarded' || rfq.awardedVendorId);
      if (isCurrentlyAwarded) {
        updates.status = 'open';
        updates.awardedVendorId = deleteField();
        updates.awardedVendorName = deleteField();
        updates.awardedPrice = deleteField();
        updates.awardedAt = deleteField();
        updates.awardReasoning = deleteField();
      }

      const cleanUpdates = sanitizeForFirestore(updates);
      await updateDoc(rfqRef, cleanUpdates);

      // Audit Log
      const auditChangedFields: Record<string, any> = {};
      if (title.trim() !== rfq.title) {
        auditChangedFields.title = { before: rfq.title || '', after: title.trim() };
      }
      if (description.trim() !== rfq.description) {
        auditChangedFields.description = { before: rfq.description || '', after: description.trim() };
      }
      if (allowedWorkHours.trim() !== rfq.allowedWorkHours) {
        auditChangedFields.allowedWorkHours = { before: rfq.allowedWorkHours || '', after: allowedWorkHours.trim() };
      }
      if (deadlineAt && new Date(deadlineAt).toISOString() !== rfq.deadlineAt) {
        auditChangedFields.deadlineAt = { before: rfq.deadlineAt || '', after: new Date(deadlineAt).toISOString() };
      }

      const auditDetails: Record<string, any> = {
        rfqId: rfq.id,
        rfqTitle: title.trim(),
        previousVersion: currentVersion,
        newVersion: nextVersion,
        changeSummary: trimmedSummary,
        category: rfq.category, // Proves category was preserved
        changedFields: auditChangedFields,
        notifiedVendorsCount: notifyVendors ? (rfq.dispatchedVendors?.length || 0) : 0
      };

      if (isCurrentlyAwarded) {
        auditDetails.previousAwardRevoked = {
          vendorId: rfq.awardedVendorId || '',
          vendorName: rfq.awardedVendorName || '',
          awardedPrice: rfq.awardedPrice || 0,
          reason: 'מכרז נפתח מחדש לקבלת הצעות עקב שינוי מפרט ודרישות לפני חתימת הסכם'
        };
      }

      await logAction({
        tenantId,
        action: 'RFQ_SCOPE_UPDATED',
        actor: {
          uid: user?.uid || 'admin',
          name: adminName,
          ...(user?.email ? { email: user.email } : {}),
          type: 'admin'
        },
        details: auditDetails
      });

      // Dispatch WhatsApp Addendum if requested
      if (notifyVendors && rfq.dispatchedVendors && rfq.dispatchedVendors.length > 0) {
        try {
          await fetch('/api/dispatchRfqAddendum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId,
              rfqId: rfq.id,
              scopeVersion: nextVersion,
              changeSummary: trimmedSummary,
              actor: {
                uid: user?.uid || 'admin',
                name: adminName,
                email: user?.email || undefined
              }
            })
          });
        } catch (dispatchErr) {
          console.warn('Could not auto-dispatch WhatsApp addendum:', dispatchErr);
        }
      }

      const updatedRfq: WorkQuoteRequest = {
        ...rfq,
        title: title.trim(),
        description: description.trim(),
        allowedWorkHours: allowedWorkHours.trim(),
        workStartDate: rfq.workStartDate,
        workTargetEndDate: rfq.workTargetEndDate,
        scopeVersion: nextVersion,
        scopeHistory: updatedHistory,
        updatedAt: nowIso,
        ...(deadlineAt ? { deadlineAt: new Date(deadlineAt).toISOString() } : {}),
        status: isCurrentlyAwarded ? 'open' : rfq.status,
        awardedVendorId: isCurrentlyAwarded ? undefined : rfq.awardedVendorId,
        awardedVendorName: isCurrentlyAwarded ? undefined : rfq.awardedVendorName,
        awardedPrice: isCurrentlyAwarded ? undefined : rfq.awardedPrice,
        awardedAt: isCurrentlyAwarded ? undefined : rfq.awardedAt,
        awardReasoning: isCurrentlyAwarded ? undefined : rfq.awardReasoning
      };

      onSuccess(updatedRfq);
      onClose();
    } catch (err: any) {
      console.error('Error amending RFQ scope:', err);
      setErrorMsg(`שגיאה בעדכון מפרט המכרז: ${err.message || 'אנא נסה שוב'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-right"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
              <FileEdit size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  עריכת מפרט ועדכון דרישות מכרז
                </h3>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  v{currentVersion} ➔ v{nextVersion}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                הוספת משימות, התאמת זמני עבודה והפצת נספח מעודכן לקבלנים
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 font-bold animate-in fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Anti-Abuse Category Lock Banner */}
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5">
            <Lock size={16} className="text-amber-700 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="font-black text-amber-900 flex items-center gap-1.5">
                <span>תחום מקצוע נעול:</span>
                <span className="px-2 py-0.5 bg-amber-200/80 text-amber-950 rounded-md font-extrabold text-[11px]">
                  {rfq.category}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-snug">
                על פי תקנות השקיפות ומניעת מחזור מכרזים, לא ניתן לשנות את תחום הפרויקט. באפשרותך להרחיב ולהוסיף משימות באותו התחום.
              </p>
            </div>
          </div>

          {/* Un-Award Notice if RFQ is already awarded */}
          {Boolean(rfq.status === 'awarded' || rfq.awardedVendorId) && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-black text-amber-950">
                  שים לב: מכרז זה הוכרז עם זוכה ({rfq.awardedVendorName || 'קבלן זוכה'}).
                </div>
                <p className="font-medium text-amber-900 leading-relaxed text-[11px]">
                  מכיוון שהמפרט והמשימות משתנים כעת בטרם נחתם הסכם, שמירת העדכון <strong>תבטל אוטומטית את הזכייה הקודמת</strong> ותחזיר את המכרז לסטטוס <strong>"פתוח לקבלת הצעות"</strong>.
                  הקבלן הזוכה וכלל הקבלנים ברשימת התפוצה יוכלו לתמחר מחדש את תוספת העבודה בהתאם למפרט החדש.
                </p>
              </div>
            </div>
          )}

          {/* RFQ Title */}
          <div className="space-y-1.5">
            <label className="block font-black text-slate-800 text-xs">
              כותרת המכרז
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          {/* Scope / Tasks Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-black text-slate-800 text-xs">
                מפרט העבודה ופירוט המשימות הנדרשות
              </label>
              <span className="text-[10px] text-slate-400">
                פרט בבירור את כל המשימות (ישנות וחדשות)
              </span>
            </div>
            <textarea
              rows={6}
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              placeholder="פרט כאן את המשימות לביצוע, דגשים טכניים, חומרים נדרשים..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 leading-relaxed font-medium focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          {/* Working Hours & Deadlines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-black text-slate-800 text-xs flex items-center gap-1.5">
                <Clock size={13} className="text-slate-400" />
                <span>שעות עבודה מותרות</span>
              </label>
              <input
                type="text"
                value={allowedWorkHours}
                onChange={e => setAllowedWorkHours(e.target.value)}
                placeholder="למשל: ימים א'-ה' 08:00 - 17:00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-black text-slate-800 text-xs flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <span>מועד אחרון להגשה (Deadline)</span>
              </label>
              <input
                type="datetime-local"
                value={deadlineAt}
                onChange={e => setDeadlineAt(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
          </div>

          {/* Mandatory Change Summary */}
          <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-blue-950 font-black text-xs">
              <Info size={14} className="text-blue-600" />
              <span>פירוט השינוי או הנספח לקבלנים (שדה חובה לבקרת איכות) *</span>
            </div>
            <p className="text-[11px] text-blue-800 font-medium leading-relaxed">
              הסבר קצר על מה שהשתנה. טקסט זה יופיע בהודעת ה-WhatsApp לקבלנים ויירשם ביומן הבקרה (Audit Log).
            </p>
            <textarea
              rows={2}
              value={changeSummary}
              onChange={e => setChangeSummary(e.target.value)}
              required
              placeholder="לדוגמה: התווספו משימת כיוונון מחזיר דלת ופירוק מנעול ישן; הורחבו שעות העבודה בשישי."
              className="w-full bg-white border border-blue-300 rounded-xl p-3 text-xs text-slate-800 leading-relaxed font-medium focus:ring-2 focus:ring-blue-200 outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Notification Checkbox */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notifyVendors"
                checked={notifyVendors}
                onChange={e => setNotifyVendors(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="notifyVendors" className="font-bold text-slate-800 text-xs cursor-pointer select-none">
                שלח הודעת עדכון / נספח לקבלנים ב-WhatsApp 📲
              </label>
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              {rfq.dispatchedVendors?.length || 0} קבלנים ברשימה
            </span>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={loading || isContractSealed}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-200 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              <span>{notifyVendors ? 'שמור ושלח נספח שינויים 📲' : 'שמור מפרט מעודכן במערכת'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
