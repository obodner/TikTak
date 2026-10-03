import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Star, ThumbsUp, ThumbsDown, X, Loader2, Calendar, Wrench, MessageSquare } from 'lucide-react';
import { Vendor, VendorReviewRecord } from '../../types/rfq';

interface VendorReviewHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  vendor: Vendor;
}

export const VendorReviewHistoryModal: React.FC<VendorReviewHistoryModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  vendor
}) => {
  const [reviews, setReviews] = useState<VendorReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !tenantId || !vendor?.id) return;

    let isMounted = true;
    setLoading(true);

    async function fetchReviews() {
      try {
        const reviewsRef = collection(db, 'tenants', tenantId, 'vendors', vendor.id, 'reviews');
        const q = query(reviewsRef, orderBy('ratedAt', 'desc'));
        const snap = await getDocs(q);

        if (isMounted) {
          const list: VendorReviewRecord[] = snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          } as VendorReviewRecord));
          setReviews(list);
        }
      } catch (err) {
        console.warn('Could not fetch reviews with orderBy, falling back:', err);
        try {
          const snap = await getDocs(collection(db, 'tenants', tenantId, 'vendors', vendor.id, 'reviews'));
          if (isMounted) {
            const list: VendorReviewRecord[] = snap.docs.map(d => ({
              id: d.id,
              ...d.data()
            } as VendorReviewRecord));
            list.sort((a, b) => new Date(b.ratedAt || 0).getTime() - new Date(a.ratedAt || 0).getTime());
            setReviews(list);
          }
        } catch (fallbackErr) {
          console.error('Failed to load reviews:', fallbackErr);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchReviews();

    return () => {
      isMounted = false;
    };
  }, [isOpen, tenantId, vendor?.id]);

  if (!isOpen) return null;

  const summary = vendor.ratingSummary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
                <Wrench size={18} />
              </span>
              <div>
                <h3 className="font-black text-slate-900 text-base md:text-lg">
                  מוניטין והיסטוריית ביצועים — {vendor.fullName}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {vendor.categories?.join(', ') || 'ספק רשום'} {vendor.phone ? `• ${vendor.phone}` : ''}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top KPI Metrics Banner */}
        <div className="p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/40 border-b border-slate-100 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-white/90 rounded-2xl border border-blue-100/80 shadow-2xs">
            <span className="text-[11px] font-black text-slate-400 block mb-0.5">ציון ממוצע</span>
            <div className="flex items-center justify-center gap-1">
              <Star size={16} className="fill-amber-400 text-amber-500" />
              <span className="text-lg font-black text-slate-900">
                {summary && summary.totalReviews > 0 ? summary.averageScore.toFixed(1) : '—'}
              </span>
              <span className="text-[10px] text-slate-400">/ 5</span>
            </div>
          </div>

          <div className="p-3 bg-white/90 rounded-2xl border border-blue-100/80 shadow-2xs">
            <span className="text-[11px] font-black text-slate-400 block mb-0.5">סה״כ עבודות</span>
            <div className="text-lg font-black text-slate-900">
              {summary ? summary.totalReviews : reviews.length}
            </div>
          </div>

          <div className="p-3 bg-white/90 rounded-2xl border border-blue-100/80 shadow-2xs">
            <span className="text-[11px] font-black text-slate-400 block mb-0.5">מדד חזרה (Rehire)</span>
            <div className="text-lg font-black text-emerald-600 flex items-center justify-center gap-1">
              <ThumbsUp size={14} className="fill-emerald-500" />
              <span>{summary && summary.totalReviews > 0 ? `${summary.rehirePercentage}%` : '—'}</span>
            </div>
          </div>
        </div>

        {/* Top Tags Chips (if any) */}
        {summary?.topTags && summary.topTags.length > 0 && (
          <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black text-slate-400">יתרונות מובילים:</span>
            {summary.topTags.map(tag => (
              <span key={tag} className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-blue-100/70 text-blue-800 border border-blue-200">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Review List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <Loader2 className="animate-spin" size={24} />
              <span className="text-xs font-bold">טוען דירוגים...</span>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 text-slate-400 italic text-sm">
              טרם הושלמו או דורגו עבודות עבור ספק זה במערכת.
            </div>
          ) : (
            reviews.map(rev => (
              <div key={rev.id} className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs">
                {/* Review Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">
                      {rev.rfqTitle || 'מכרז שבוצע'}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      {rev.rfqCategory && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                          {rev.rfqCategory}
                        </span>
                      )}
                      {rev.ratedAt && (
                        <span className="flex items-center gap-1 font-medium">
                          <Calendar size={11} />
                          {new Date(rev.ratedAt).toLocaleDateString('he-IL')}
                        </span>
                      )}
                      {rev.awardedPrice && (
                        <span className="font-extrabold text-slate-700">
                          ₪{rev.awardedPrice.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stars Pill */}
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-black text-xs shrink-0">
                    <Star size={13} className="fill-amber-400 text-amber-500" />
                    <span>{rev.stars} / 5</span>
                  </div>
                </div>

                {/* Rehire Verdict & Tags */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 ${
                    rev.wouldRehire
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {rev.wouldRehire ? (
                      <>
                        <ThumbsUp size={11} className="fill-emerald-600" />
                        <span>יזמין שוב ✓</span>
                      </>
                    ) : (
                      <>
                        <ThumbsDown size={11} className="fill-red-600" />
                        <span>לא יזמין שוב ✗</span>
                      </>
                    )}
                  </span>

                  {rev.tags?.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                      {t}
                    </span>
                  ))}
                </div>

                {/* Reviewer Note */}
                {rev.comment && (
                  <div className="p-2.5 bg-slate-50 rounded-xl text-xs text-slate-700 font-medium border border-slate-200/70 flex items-start gap-1.5">
                    <MessageSquare size={13} className="text-slate-400 shrink-0 mt-0.5" />
                    <p className="italic leading-relaxed">"{rev.comment}"</p>
                  </div>
                )}

                {/* Reviewer signature */}
                {rev.ratedBy?.name && (
                  <div className="text-[10px] text-slate-400 font-medium text-left">
                    דורג ע״י: {rev.ratedBy.name}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default VendorReviewHistoryModal;
