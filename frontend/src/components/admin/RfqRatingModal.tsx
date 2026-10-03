import React, { useState, useEffect } from 'react';
import { Star, ThumbsUp, ThumbsDown, X, Loader2, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { WorkQuoteRequest, RfqRating } from '../../types/rfq';
import { saveVendorReview } from '../../utils/vendorReviewService';

interface RfqRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  rfq: WorkQuoteRequest;
  vendorId?: string;
  vendorName?: string;
  currentAdmin: { uid: string; name: string };
  onSuccess: (updatedRating: RfqRating) => void;
}

const POSITIVE_TAGS = [
  '⏰ עמידה בזמנים',
  '🛠️ מקצועיות גבוהה',
  '💰 מחיר הוגן',
  '🧹 נקי ומסודר',
  '📞 תקשורת מצוינת'
];

const CONSTRUCTIVE_TAGS = [
  '⌛ איחור בביצוע',
  '📈 ניסיון לייקר מחיר',
  '🚯 השאיר לכלוך',
  '🔇 לא זמין בטלפון'
];

const STAR_LABELS: Record<number, string> = {
  1: 'גרוע מאוד 😞',
  2: 'טעון שיפור 😕',
  3: 'בינוני / סביר 😐',
  4: 'טוב מאוד 🙂',
  5: 'מצוין, מעל המצופה! 🌟'
};

export const RfqRatingModal: React.FC<RfqRatingModalProps> = ({
  isOpen,
  onClose,
  rfq,
  vendorId,
  vendorName,
  currentAdmin,
  onSuccess
}) => {
  const targetVendorId = vendorId || rfq.awardedVendorId || '';
  const targetVendorName = vendorName || rfq.awardedVendorName || 'הקבלן הזוכה';

  const [stars, setStars] = useState<number>(5);
  const [hoveredStars, setHoveredStars] = useState<number | null>(null);
  const [wouldRehire, setWouldRehire] = useState<boolean>(true);
  const [selectedTags, setSelectedTags] = useState<string[]>(['⏰ עמידה בזמנים', '🛠️ מקצועיות גבוהה']);
  const [comment, setComment] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prepopulate if rating already exists
  useEffect(() => {
    if (rfq.rating) {
      setStars(rfq.rating.stars || 5);
      setWouldRehire(rfq.rating.wouldRehire ?? true);
      setSelectedTags(rfq.rating.tags || []);
      setComment(rfq.rating.comment || '');
    } else {
      setStars(5);
      setWouldRehire(true);
      setSelectedTags(['⏰ עמידה בזמנים', '🛠️ מקצועיות גבוהה']);
      setComment('');
    }
  }, [rfq.rating, isOpen]);

  // Adjust default wouldRehire when stars change
  const handleSelectStars = (val: number) => {
    setStars(val);
    if (val >= 4) {
      setWouldRehire(true);
    } else if (val <= 2) {
      setWouldRehire(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetVendorId) {
      setError('לא נמצא מזהה קבלן לדירוג');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const savedRating = await saveVendorReview({
        tenantId: rfq.tenantId,
        rfqId: rfq.id,
        rfqTitle: rfq.title,
        rfqCategory: rfq.category,
        awardedPrice: rfq.awardedPrice,
        vendorId: targetVendorId,
        rating: {
          stars,
          wouldRehire,
          tags: selectedTags,
          comment: comment.trim()
        },
        admin: currentAdmin
      });

      onSuccess(savedRating);
      onClose();
    } catch (err: any) {
      console.error('Error saving contractor rating:', err);
      setError(err.message || 'שגיאה בשמירת הדירוג');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentDisplayStars = hoveredStars !== null ? hoveredStars : stars;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-blue-50/60 to-indigo-50/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-100 text-amber-700">
                <Star size={18} className="fill-amber-400 stroke-amber-500" />
              </span>
              <h3 className="font-black text-slate-900 text-lg">
                דירוג ביצוע עבודה — {targetVendorName}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {rfq.title} {rfq.awardedPrice ? `• סכום סגירה: ₪${rfq.awardedPrice.toLocaleString()}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-200 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Action 1: 1-5 Stars Rating */}
          <div className="text-center space-y-2 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
              איך הייתה איכות הביצוע הכוללת?
            </label>
            <div className="flex items-center justify-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map(val => {
                const isActive = val <= currentDisplayStars;
                return (
                  <button
                    key={val}
                    type="button"
                    onMouseEnter={() => setHoveredStars(val)}
                    onMouseLeave={() => setHoveredStars(null)}
                    onClick={() => handleSelectStars(val)}
                    className="p-1.5 transition-transform hover:scale-125 active:scale-95 cursor-pointer focus:outline-none"
                    title={`${val} כוכבים`}
                  >
                    <Star
                      size={36}
                      className={
                        isActive
                          ? 'fill-amber-400 text-amber-500 drop-shadow-xs transition-colors'
                          : 'fill-slate-100 text-slate-300 transition-colors'
                      }
                    />
                  </button>
                );
              })}
            </div>
            <p className="text-sm font-extrabold text-blue-700 h-5 transition-all">
              {STAR_LABELS[currentDisplayStars] || ''}
            </p>
          </div>

          {/* Action 2: Would Rehire Toggle */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 block">
              האם תזמין אותו שוב לעבודות בבניין? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWouldRehire(true)}
                className={`py-3 px-4 rounded-2xl border font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  wouldRehire
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200 font-black shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ThumbsUp size={16} className={wouldRehire ? 'text-emerald-600 fill-emerald-600' : 'text-slate-400'} />
                <span>כן, בהחלט 👍</span>
              </button>

              <button
                type="button"
                onClick={() => setWouldRehire(false)}
                className={`py-3 px-4 rounded-2xl border font-bold text-xs md:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  !wouldRehire
                    ? 'bg-red-50 border-red-400 text-red-900 ring-2 ring-red-200 font-black shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ThumbsDown size={16} className={!wouldRehire ? 'text-red-600 fill-red-600' : 'text-slate-400'} />
                <span>לא, עדיף שלא 👎</span>
              </button>
            </div>
          </div>

          {/* Action 3: Quick Tags */}
          <div className="space-y-2.5">
            <label className="text-xs font-black text-slate-700 flex items-center justify-between">
              <span>תגיות מהירות (בחר מאפיינים בולטים)</span>
              <span className="text-[11px] text-slate-400 font-medium">רשות</span>
            </label>

            {/* Positive Tags */}
            <div className="flex flex-wrap gap-2">
              {POSITIVE_TAGS.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-2xs ring-1 ring-blue-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                    }`}
                  >
                    {isSelected && <CheckCircle2 size={12} className="stroke-[3]" />}
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>

            {/* Constructive / Warning Tags */}
            <div className="flex flex-wrap gap-2 pt-1">
              {CONSTRUCTIVE_TAGS.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-600 text-white shadow-2xs ring-1 ring-amber-300'
                        : 'bg-amber-50/60 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    {isSelected && <CheckCircle2 size={12} className="stroke-[3]" />}
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action 4: Optional Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
              <MessageSquare size={13} className="text-slate-400" />
              <span>הערה פנימית לוועד ולמנהלים אחרים (אופציונלי)</span>
            </label>
            <textarea
              rows={2}
              maxLength={200}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="לדוגמה: ביצע עבודה נקייה מאוד, החליף לוח חשמל במהירות..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none text-slate-800"
            />
            <span className="text-[10px] text-slate-400 font-medium block text-left">
              {comment.length}/200 תווים
            </span>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-sm transition-all shadow-md shadow-blue-100 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>שומר דירוג...</span>
                </>
              ) : (
                <span>שמור דירוג וסגור ⭐</span>
              )}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
            >
              דלג כעת
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RfqRatingModal;
