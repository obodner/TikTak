import React, { useState, useEffect } from 'react';
import { X, Tag, Trash2, ArrowRightLeft, AlertCircle, Loader2, Check } from 'lucide-react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { logAction } from '../../utils/auditLogger';
import { Vendor } from '../../types/rfq';
import { ConfirmModal } from './ConfirmModal';

interface ManageTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  callerUid: string;
  callerName: string;
  categoryPool: string[];
  vendors: Vendor[];
  onTagsUpdated: (updatedPool?: string[]) => Promise<void>;
}

export const ManageTagsModal: React.FC<ManageTagsModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  callerUid,
  callerName,
  categoryPool,
  vendors,
  onTagsUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Local active pool to ensure instant UI responsiveness
  const [activePool, setActivePool] = useState<string[]>(categoryPool);

  // Merge state
  const [mergingSourceTag, setMergingSourceTag] = useState<string | null>(null);
  const [targetTag, setTargetTag] = useState('');
  const [isCustomTarget, setIsCustomTarget] = useState(false);

  // Confirm delete state
  const [deletingTag, setDeletingTag] = useState<{ tag: string; count: number } | null>(null);

  useEffect(() => {
    setActivePool(categoryPool);
  }, [categoryPool, isOpen]);

  if (!isOpen) return null;

  // Aggregate all unique tags from activePool and current vendors
  const allUniqueTags = Array.from(
    new Set([
      ...activePool,
      ...vendors.flatMap(v => v.categories || [])
    ])
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'he'));

  const getTagCount = (tag: string) => {
    return vendors.filter(v => v.categories && v.categories.includes(tag)).length;
  };

  const handleStartMerge = (sourceTag: string) => {
    setError('');
    setSuccessMsg('');
    setMergingSourceTag(sourceTag);
    const firstOther = allUniqueTags.find(t => t !== sourceTag) || '';
    setTargetTag(firstOther);
    setIsCustomTarget(false);
  };

  const handleCancelMerge = () => {
    setMergingSourceTag(null);
    setTargetTag('');
    setIsCustomTarget(false);
  };

  const executeMerge = async () => {
    const cleanTarget = targetTag.trim();
    if (!mergingSourceTag || !cleanTarget) {
      setError('יש לבחור או להזין תגית יעד למיזוג.');
      return;
    }
    if (cleanTarget === mergingSourceTag) {
      setError('תגית היעד חייבת להיות שונה מתגית המקור.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const tenantRef = doc(db, 'tenants', tenantId);
      const tenantSnap = await getDoc(tenantRef);
      const tenantData = tenantSnap.data();
      const currentCats: string[] = Array.isArray(tenantData?.config?.categories)
        ? tenantData.config.categories
        : activePool;

      const updatedCategories = Array.from(
        new Set(currentCats.map(c => (c === mergingSourceTag ? cleanTarget : c)))
      );
      if (!updatedCategories.includes(cleanTarget)) {
        updatedCategories.push(cleanTarget);
      }

      const batch = writeBatch(db);

      // 1. Update all affected vendors
      const affectedVendors = vendors.filter(
        v => v.categories && v.categories.includes(mergingSourceTag)
      );

      for (const vendor of affectedVendors) {
        const newVendorCats = Array.from(
          new Set(vendor.categories.map(c => (c === mergingSourceTag ? cleanTarget : c)))
        );
        const vRef = doc(db, 'tenants', tenantId, 'vendors', vendor.id);
        batch.update(vRef, {
          categories: newVendorCats,
          profession: newVendorCats.join(', ') || null,
          updatedAt: new Date().toISOString()
        });
      }

      // 2. Save explicit updated categories array
      batch.update(tenantRef, {
        'config.categories': updatedCategories,
        updatedAt: new Date().toISOString()
      });

      await batch.commit();

      // Audit Log
      await logAction({
        tenantId,
        action: 'TAG_MERGED',
        actor: { uid: callerUid, name: callerName, type: 'admin' },
        details: {
          sourceTag: mergingSourceTag,
          targetTag: cleanTarget,
          affectedVendorsCount: affectedVendors.length
        }
      });

      setSuccessMsg(
        `התגית "${mergingSourceTag}" מוזגה בהצלחה לתוך "${cleanTarget}" (${affectedVendors.length} ספקים עודכנו).`
      );
      setMergingSourceTag(null);
      setTargetTag('');
      setActivePool(updatedCategories);
      await onTagsUpdated(updatedCategories);
    } catch (err: any) {
      console.error('Failed to merge tag:', err);
      setError(err.message || 'שגיאה במיזוג התגית');
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async (tagToDelete: string) => {
    if (!tagToDelete) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const tenantRef = doc(db, 'tenants', tenantId);
      const tenantSnap = await getDoc(tenantRef);
      const tenantData = tenantSnap.data();
      const currentCats: string[] = Array.isArray(tenantData?.config?.categories)
        ? tenantData.config.categories
        : activePool;

      const updatedCategories = currentCats.filter(c => c !== tagToDelete);

      const batch = writeBatch(db);

      // 1. Remove tag from affected vendors
      const affectedVendors = vendors.filter(
        v => v.categories && v.categories.includes(tagToDelete)
      );

      for (const vendor of affectedVendors) {
        const newVendorCats = vendor.categories.filter(c => c !== tagToDelete);
        const vRef = doc(db, 'tenants', tenantId, 'vendors', vendor.id);
        batch.update(vRef, {
          categories: newVendorCats,
          profession: newVendorCats.join(', ') || null,
          updatedAt: new Date().toISOString()
        });
      }

      // 2. Set the updated categories array explicitly on tenant config
      batch.update(tenantRef, {
        'config.categories': updatedCategories,
        updatedAt: new Date().toISOString()
      });

      await batch.commit();

      // Audit Log
      await logAction({
        tenantId,
        action: 'TAG_DELETED',
        actor: { uid: callerUid, name: callerName, type: 'admin' },
        details: {
          tag: tagToDelete,
          affectedVendorsCount: affectedVendors.length
        }
      });

      setSuccessMsg(`התגית "${tagToDelete}" נמחקה בהצלחה מרשימת הקטגוריות.`);
      setActivePool(updatedCategories);
      await onTagsUpdated(updatedCategories);
    } catch (err: any) {
      console.error('Failed to delete tag:', err);
      setError(err.message || 'שגיאה במחיקת התגית');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/70 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Tag size={18} />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-800 text-base">ניהול תגיות ותחומי עיסוק</h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  מחיקה או מיזוג תגיות ועדכון אוטומטי של כל הקבלנים המשויכים
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Feedback banners */}
          <div className="px-6 pt-4 shrink-0">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <Check size={16} className="shrink-0 text-green-500" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {/* Merge Active Subpanel */}
          {mergingSourceTag && (
            <div className="m-6 p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col gap-3 animate-in fade-in shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <ArrowRightLeft size={16} className="text-indigo-600" />
                  <span>מיזוג תגית: "{mergingSourceTag}"</span>
                  <span className="text-[10px] bg-indigo-200/70 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                    {getTagCount(mergingSourceTag)} ספקים מושפעים
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelMerge}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ביטול
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <span className="text-xs font-bold text-slate-600 shrink-0">מזג לתוך תגית:</span>
                {!isCustomTarget ? (
                  <select
                    value={targetTag}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setIsCustomTarget(true);
                        setTargetTag('');
                      } else {
                        setTargetTag(e.target.value);
                      }
                    }}
                    className="w-full sm:flex-1 text-xs font-bold border border-indigo-200 bg-white rounded-lg p-2 focus:ring-2 focus:ring-indigo-300 outline-none"
                  >
                    {allUniqueTags
                      .filter(t => t !== mergingSourceTag)
                      .map(t => (
                        <option key={t} value={t}>
                          {t} ({getTagCount(t)} ספקים)
                        </option>
                      ))}
                    <option value="__custom__">+ הזן שם תגית חדשה...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5 w-full sm:flex-1">
                    <input
                      type="text"
                      maxLength={30}
                      value={targetTag}
                      onChange={e => setTargetTag(e.target.value)}
                      placeholder="שם תגית יעד חדשה..."
                      className="flex-1 text-xs font-bold border border-indigo-200 bg-white rounded-lg p-2 focus:ring-2 focus:ring-indigo-300 outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomTarget(false)}
                      className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                    >
                      בחר מרשימה
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={executeMerge}
                  disabled={loading || !targetTag.trim()}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>בצע מיזוג</span>
                </button>
              </div>

              <p className="text-[11px] text-indigo-700 leading-relaxed">
                ℹ️ פעולה זו תחליף את התגית <strong>"{mergingSourceTag}"</strong> ב-
                <strong>"{targetTag || '...'}"</strong> אצל כל הספקים המשויכים, ותסיר את תגית המקור מהמערכת.
              </p>
            </div>
          )}

          {/* Tags List */}
          <div className="p-6 overflow-y-auto flex-1 divide-y divide-slate-100">
            {allUniqueTags.length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-xs">לא נמצאו תגיות מוגדרות</div>
            ) : (
              <div className="space-y-2">
                {allUniqueTags.map(tag => {
                  const count = getTagCount(tag);
                  const isCurrentMerging = mergingSourceTag === tag;

                  return (
                    <div
                      key={tag}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrentMerging
                          ? 'bg-indigo-50/50 border-indigo-200'
                          : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-800 text-xs truncate">{tag}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            count > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {count} {count === 1 ? 'ספק' : 'ספקים'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Merge Trigger */}
                        <button
                          type="button"
                          onClick={() => handleStartMerge(tag)}
                          disabled={loading || allUniqueTags.length < 2}
                          className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 cursor-pointer"
                          title="מזג תגית זו לתוך תגית אחרת"
                        >
                          <ArrowRightLeft size={13} />
                          <span className="hidden sm:inline">מיזוג</span>
                        </button>

                        {/* Delete Trigger */}
                        <button
                          type="button"
                          onClick={() => setDeletingTag({ tag, count })}
                          disabled={loading}
                          className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 cursor-pointer"
                          title="מחק תגית זו מהמערכת"
                        >
                          <Trash2 size={13} />
                          <span className="hidden sm:inline">מחיקה</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              סגור
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingTag)}
        onClose={() => setDeletingTag(null)}
        onConfirm={() => {
          if (deletingTag) {
            const tag = deletingTag.tag;
            setDeletingTag(null);
            executeDelete(tag);
          }
        }}
        title="מחיקת תגית"
        message={
          deletingTag && deletingTag.count > 0
            ? `האם אתה בטוח שברצונך למחוק את התגית "${deletingTag?.tag}"? פעולה זו תסיר את התגית מ-${deletingTag?.count} קבלנים ומרשימת הקטגוריות.`
            : `האם אתה בטוח שברצונך למחוק את התגית "${deletingTag?.tag}" מרשימת הקטגוריות?`
        }
        type="danger"
        confirmLabel="מחק תגית"
      />
    </>
  );
};
