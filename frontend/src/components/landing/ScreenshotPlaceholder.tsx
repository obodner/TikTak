import { useState, useRef, useEffect } from 'react';
import { Image, Sparkles, AlertCircle } from 'lucide-react';

interface ScreenshotPlaceholderProps {
  src: string;
  alt: string;
  aspectRatio?: '16/9' | '4/3' | '9/16' | '16/10' | '1/1' | 'auto';
  className?: string;
  title: string;
  badge?: string;
  filename: string;
  mockType: 'new-rfq' | 'rfq-matrix' | 'contract' | 'contractor-portal' | 'bi-analytics' | 'whatsapp-notification' | 'general';
  onClick?: () => void;
  objectFit?: 'cover' | 'contain';
}

export default function ScreenshotPlaceholder({
  src,
  alt,
  aspectRatio = '16/9',
  className = '',
  title,
  badge = 'תצוגת מערכת חיה',
  filename,
  mockType,
  onClick,
  objectFit = 'cover'
}: ScreenshotPlaceholderProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle cached images that are already complete on mount
  useEffect(() => {
    setHasError(false);
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
      } else if (imgRef.current.src) {
        setHasError(true);
      }
    }
  }, [src]);

  return (
    <div
      onClick={onClick}
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200/90 shadow-xl bg-slate-50 group select-none ${
        onClick ? 'cursor-zoom-in' : ''
      } ${className}`}
      style={{ aspectRatio }}
    >
      {/* Zoom badge on hover */}
      {onClick && !hasError && isLoaded && (
        <div className="absolute top-3 left-3 bg-slate-900/80 hover:bg-slate-900 text-white text-[11px] font-black px-3 py-1 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shadow-md z-10 pointer-events-none">
          <span>🔍</span>
          <span>לחץ להגדלה</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-slate-100/90 animate-pulse flex flex-col items-center justify-center gap-2 text-slate-400 z-0">
          <div className="w-7 h-7 rounded-full border-2 border-slate-300 border-t-emerald-600 animate-spin" />
          <span className="text-[11px] font-bold text-slate-500">טוען תצוגת מסך...</span>
        </div>
      )}

      {/* Real image if exists */}
      {!hasError && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={() => {
            setIsLoaded(true);
            setHasError(false);
          }}
          onError={() => {
            setHasError(true);
            setIsLoaded(false);
          }}
          className={`w-full h-full relative z-[1] ${
            objectFit === 'contain' ? 'object-contain object-center bg-slate-100/40' : 'object-cover object-top'
          } ${onClick ? 'group-hover:scale-[1.01]' : ''} transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* High-Fidelity Mockup Placeholder ONLY if image failed to load */}
      {hasError && (
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-4 md:p-6 flex flex-col justify-between text-white overflow-hidden relative font-sans" dir="rtl">
          {/* Top Window Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-700/60 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="text-[11px] font-mono text-slate-400 mr-2 tracking-tight">tiktak.app</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                <Sparkles size={10} />
                <span>{badge}</span>
              </span>
            </div>
          </div>

          {/* Dynamic Mock Graphic based on type */}
          <div className="flex-1 flex flex-col justify-center my-auto py-2">
            {mockType === 'rfq-matrix' && (
              <div className="space-y-3 max-w-lg mx-auto w-full">
                <div className="flex items-center justify-between bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📋</span>
                    <div>
                      <div className="text-xs font-black text-white">מכרז #104: איטום גג עליון (300 מ"ר)</div>
                      <div className="text-[10px] text-slate-400">הוגשו 3 מתוך 3 הצעות קבלנים</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    מוכן לבחירת זוכה 🏆
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-800/90 p-2.5 rounded-xl border border-emerald-500/50 shadow-lg relative">
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-emerald-600 text-white font-black px-1.5 py-0.2 rounded-full">
                      ההצעה הזולה 💰
                    </div>
                    <div className="font-bold text-slate-300 text-[11px] truncate">י.ד. גורדון</div>
                    <div className="text-sm font-black text-emerald-400 mt-1">₪14,500</div>
                    <div className="text-[9px] text-slate-400">כולל מע"מ | 3 ימים</div>
                  </div>
                  <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700">
                    <div className="font-bold text-slate-300 text-[11px] truncate">אופק איטום</div>
                    <div className="text-sm font-black text-white mt-1">₪16,800</div>
                    <div className="text-[9px] text-slate-400">כולל מע"מ | 5 ימים</div>
                  </div>
                  <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700">
                    <div className="font-bold text-slate-300 text-[11px] truncate">רם פרויקטים</div>
                    <div className="text-sm font-black text-white mt-1">₪18,200</div>
                    <div className="text-[9px] text-slate-400">+ מע"מ | 2 ימים</div>
                  </div>
                </div>
              </div>
            )}

            {mockType === 'contract' && (
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 max-w-sm mx-auto w-full space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                  <span className="font-black text-white">הסכם עבודה והזמנה מחייבת</span>
                  <span className="text-[10px] text-blue-400">PDF / הדפסה 🖨️</span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1">
                  <div><strong>מזמין:</strong> נציגות הבית המשותף (הברוש 12)</div>
                  <div><strong>ספק זוכה:</strong> י.ד. גורדון עבודות איטום (ח.פ: 514829103)</div>
                  <div><strong>סכום מוסכם:</strong> ₪14,500 כולל מע"מ (אחריות 5 שנים)</div>
                </div>
                <div className="pt-2 flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-700/60">
                  <span>חתימת ועד: ________</span>
                  <span>חתימת קבלן: ________</span>
                </div>
              </div>
            )}

            {mockType === 'contractor-portal' && (
              <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 max-w-xs mx-auto w-full space-y-2.5 text-xs text-center">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto text-sm">
                  🛠️
                </div>
                <div className="font-black text-sm text-white">פורטל הצעת מחיר לקבלן</div>
                <div className="text-[11px] text-slate-400">הגשת הצעה ללא הורדת אפליקציה וללא הרשמה</div>
                <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-700 text-right">
                  <div className="text-[10px] text-slate-400">סכום ההצעה שלך (₪):</div>
                  <div className="text-base font-black text-emerald-400">₪ 14,500</div>
                </div>
                <div className="w-full py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs shadow-md">
                  שלח הצעה לוועד 🚀
                </div>
              </div>
            )}

            {mockType === 'bi-analytics' && (
              <div className="space-y-3 max-w-md mx-auto w-full">
                <div className="grid grid-cols-2 gap-2 text-right">
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <div className="text-[10px] text-slate-400 font-bold">זמן ממוצע לפתרון (MTTR)</div>
                    <div className="text-lg font-black text-emerald-400 mt-1">4.2 שעות</div>
                    <div className="text-[9px] text-emerald-500 font-bold">↓ 35% שיפור בחודש האחרון</div>
                  </div>
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <div className="text-[10px] text-slate-400 font-bold">עמידה בזמני תקן (SLA)</div>
                    <div className="text-lg font-black text-blue-400 mt-1">98.4%</div>
                    <div className="text-[9px] text-blue-300 font-bold">בקרת קבלנים שוטפת</div>
                  </div>
                </div>
                {/* Mini Bar Chart Mock */}
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/80 flex items-end justify-between h-14 px-4 pt-2">
                  <div className="w-5 bg-blue-500/40 rounded-t h-6" title="חשמל" />
                  <div className="w-5 bg-blue-500/60 rounded-t h-9" title="אינסטלציה" />
                  <div className="w-5 bg-blue-500/80 rounded-t h-12" title="מעליות" />
                  <div className="w-5 bg-emerald-500 rounded-t h-8" title="איטום" />
                  <div className="w-5 bg-blue-500/50 rounded-t h-5" title="גינון" />
                </div>
              </div>
            )}

            {mockType === 'whatsapp-notification' && (
              <div className="bg-[#075E54] text-white p-3 rounded-2xl max-w-xs mx-auto w-full shadow-lg space-y-2 text-xs text-right">
                <div className="flex items-center gap-1.5 border-b border-white/20 pb-1.5">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">📢</div>
                  <span className="font-black text-[11px]">התראות TikTak לניהול מבנים</span>
                </div>
                <div className="bg-white text-slate-900 p-2.5 rounded-xl space-y-1 shadow-sm text-[11px] leading-relaxed">
                  <div className="font-extrabold text-blue-700">🔔 התקבלה הצעת מחיר חדשה!</div>
                  <div className="text-slate-600">הקבלן <strong>י.ד. גורדון</strong> הגיש הצעה עבור <strong>איטום גג עליון</strong> ע״ס <strong>₪14,500</strong>.</div>
                  <div className="mt-2 pt-1 border-t border-slate-100 flex justify-center">
                    <span className="w-full text-center py-1 rounded-lg bg-blue-600 text-white font-black text-[11px] shadow-xs cursor-pointer">
                      לצפייה בהצעה והשוואה 📊
                    </span>
                  </div>
                </div>
              </div>
            )}

            {mockType === 'general' && (
              <div className="text-center py-4 space-y-1">
                <Image size={32} className="mx-auto text-slate-500 opacity-60" />
                <div className="text-xs font-bold text-slate-300">{title}</div>
              </div>
            )}
          </div>

          {/* Bottom Placement Helper Bar */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <AlertCircle size={11} />
              <span>שטח שמור לצילום מסך:</span>
              <code className="text-slate-300 font-mono text-[9px] bg-slate-800 px-1 py-0.5 rounded">{filename}</code>
            </span>
            <span className="text-slate-500 text-[9px]">החלף קובץ בתיקיית public/</span>
          </div>
        </div>
      )}
    </div>
  );
}
