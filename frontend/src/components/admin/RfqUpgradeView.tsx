import React, { useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import {
  Lock,
  Sparkles,
  CheckCircle2,
  Mail,
  Send,
  Smartphone,
  ShieldCheck,
  FileSignature,
  Trophy,
  MessageCircle,
  Calendar,
  Wrench,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import type { AdminLayoutContext } from './AdminLayout';

interface PreviewQuote {
  id: string;
  vendorName: string;
  badge: string;
  price: number;
  timeline: string;
  timelineIcon: 'clock' | 'wrench' | 'zap';
  note?: string;
  isLowest?: boolean;
}

const PREVIEW_QUOTES: PreviewQuote[] = [
  {
    id: 'q1',
    vendorName: 'מאיר זינתי',
    badge: 'מזדמן',
    price: 1800,
    timeline: 'חצי יום עבודה',
    timelineIcon: 'clock',
    note: '"כולל חלפים ואחריות לשנה."',
    isLowest: true
  },
  {
    id: 'q2',
    vendorName: 'חיים בורשטיין',
    badge: 'מזדמן',
    price: 2400,
    timeline: 'יום עבודה מלא',
    timelineIcon: 'wrench'
  },
  {
    id: 'q3',
    vendorName: 'ניסים ונטורה',
    badge: 'מזדמן',
    price: 2200,
    timeline: 'עד שעתיים',
    timelineIcon: 'zap'
  }
];

export const RfqUpgradeView: React.FC = () => {
  const { tenantId } = useParams();
  const layoutCtx = useOutletContext<AdminLayoutContext | undefined>();
  const isEn = layoutCtx?.isEn ?? false;
  const tenantName = layoutCtx?.tenantConfig?.name || tenantId || '';

  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('q1');
  const [isScopeExpanded, setIsScopeExpanded] = useState<boolean>(true);

  const selectedWinner = PREVIEW_QUOTES.find((q) => q.id === selectedWinnerId) || PREVIEW_QUOTES[0];

  const mailtoSubject = encodeURIComponent(
    isEn
      ? `Request to Activate RFQ Module - ${tenantName}`
      : `בקשה להפעלת מודול הצעות מחיר (RFQ) - ${tenantName}`
  );
  const mailtoBody = encodeURIComponent(
    isEn
      ? `Hello TikTak team,\n\nWe would like to learn more and activate the RFQ (Work Quotes) module for: ${tenantName} (ID: ${tenantId || ''}).\n\nPlease reach out with details on annual quota packages.\nThank you!`
      : `שלום צוות TikTak,\n\nאנו מעוניינים לקבל פרטים ולהפעיל את מודול הצעות המחיר (RFQ) עבור: ${tenantName} (מזהה: ${tenantId || ''}).\n\nנשמח לשיחה קצרה והתאמת חבילת מכרזים שנתית.\nתודה!`
  );
  const mailtoHref = `mailto:tiktak.support@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`;

  const valueBullets = isEn
    ? [
        {
          icon: Send,
          title: 'Standardized Tender from Any Ticket',
          desc: 'Send a structured quote request to all relevant category contractors straight from a maintenance ticket.'
        },
        {
          icon: Smartphone,
          title: 'Zero-Friction Mobile Quote Submission',
          desc: 'Contractors submit quotes via a dedicated mobile link — no app download or login required.'
        },
        {
          icon: ShieldCheck,
          title: 'Side-by-Side Comparison & 7-Year Audit Log',
          desc: 'Compare quotes side-by-side with an automatic 7-year audit log for full committee transparency.'
        },
        {
          icon: FileSignature,
          title: 'Automated Work Contract & Digital Signature',
          desc: 'Once you select a winner, the system automatically generates a binding work agreement (timelines, locked VAT declaration, warranty period, and agreed penalties) and sends it straight to the contractor for digital signature via WhatsApp.'
        }
      ]
    : [
        {
          icon: Send,
          title: 'מכרז אחיד ישירות מתוך התקלה',
          desc: 'שליחת בקשת הצעת מחיר מסודרת ואחידה לכל הקבלנים הרלוונטיים בקטגוריה ישירות מתוך קריאת השירות.'
        },
        {
          icon: Smartphone,
          title: 'הגשת הצעות במובייל ללא אפליקציה',
          desc: 'הקבלנים מגישים הצעות מחיר דרך קישור מובייל ייעודי — ללא הורדת אפליקציה וללא צורך בהרשמה או סיסמה.'
        },
        {
          icon: ShieldCheck,
          title: 'השוואה מהירה ויומן ביקורת ל-7 שנים',
          desc: 'השוואת הצעות מחיר זו לצד זו ותיעוד אוטומטי של החלטת הוועד ביומן ביקורת למשך 7 שנים לשקיפות מלאה.'
        },
        {
          icon: FileSignature,
          title: 'הזמנת עבודה אוטומטית וחתימה דיגיטלית',
          desc: 'מיד עם בחירת הזוכה, המערכת מפיקה הסכם עבודה מחייב (כולל לוחות זמנים, הצהרת מע"מ נעולה, תקופת אחריות וקנסות איחור מוסכמים) ושולחת אותו ישירות לקבלן לחתימה דיגיטלית בוואטסאפ.'
        }
      ];

  return (
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6"
      dir={isEn ? 'ltr' : 'rtl'}
      data-testid="rfq-upgrade-view"
    >
      {/* Top Hero & Value Proposition Card */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 lg:p-10 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white relative">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold">
              <Lock size={13} />
              <span>{isEn ? 'PRO Module • Work Quotes & Tenders (RFQ)' : 'מודול PRO • מכרזים והצעות מחיר (RFQ)'}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight text-white">
              {isEn
                ? 'Stop chasing contractors on WhatsApp – compare quotes in one click'
                : 'מפסיקים לרדוף אחרי קבלנים בוואטסאפ – משווים הצעות מחיר בקליק'}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              {isEn
                ? 'Turn every building repair into an organized, transparent tender process — from sending the spec to digital contract signature.'
                : 'הפכו כל תיקון או פרויקט בבניין לתהליך מכרזי מסודר, שקוף ומתועד — משליחת המפרט ועד חתימה דיגיטלית על הזמנת עבודה.'}
            </p>

            {/* Primary Low-Friction CTA + Landing Page Link */}
            <div className="pt-2 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <a
                  href={mailtoHref}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm sm:text-base font-extrabold shadow-lg shadow-blue-900/40 transition-all cursor-pointer"
                  data-testid="rfq-upgrade-cta"
                >
                  <Mail size={18} />
                  <span>{isEn ? 'Request Activation & Details' : 'לפרטים והפעלת המודול'}</span>
                </a>
                <a
                  href="https://www.mytiktak.com/rfq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white border border-white/20 text-sm font-bold transition-all cursor-pointer"
                  data-testid="rfq-upgrade-info-link"
                >
                  <span>{isEn ? 'More Info & Pricing Plans' : 'למידע נוסף ותוכניות מחיר'}</span>
                  <ExternalLink size={16} />
                </a>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {isEn
                  ? 'Flexible annual quota banks (e.g., 5 or 10 tenders/year) • Quick setup'
                  : 'זמין בחבילות בנק מכרזים שנתיות (למשל 5 או 10 מכרזים בשנה) • הפעלה מיידית'}
              </p>
            </div>
          </div>
        </div>

        {/* 4 Concrete Value Bullets */}
        <div className="p-6 sm:p-8 bg-white grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {valueBullets.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-50 border border-slate-200/80"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Icon size={20} />
                </div>
                <div className="space-y-1 min-w-0">
                  <h2 className="text-sm font-extrabold text-slate-900">{item.title}</h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Visual Preview: Quote Comparison Table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-lg font-extrabold text-slate-900">
              {isEn ? 'Live Preview: Quote Comparison Matrix' : 'תצוגה מקדימה: מטריצת השוואת הצעות מחיר'}
            </h2>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">
            {isEn ? 'Interactive preview — click any quote to simulate selection' : 'תצוגה אינטראקטיבית — לחצו על הצעה לבדיקת בחירת זוכה'}
          </span>
        </div>

        {/* Preview Frame modeled on ActiveQuotesPage comparison view */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
          {/* RFQ Header Row */}
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  אינטרקום ושערים
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  התקבלו 3 מתוך 3 הצעות
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                תיקון אינטרקום והחלפת מנעול מגנטי
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar size={13} />
                <span>נוצר ב: 28.09.2026, 20:23</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsScopeExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span>{isScopeExpanded ? 'הסתר מפרט עבודה' : 'הצג מפרט עבודה'}</span>
              {isScopeExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Scope Summary Box */}
          {isScopeExpanded && (
            <div className="px-4 sm:px-5 pt-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm text-slate-700 space-y-1.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-500">פרטי הבקשה והנחיות לביצוע</span>
                  <span className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 text-[11px] font-bold">גרסה 1</span>
                </div>
                <p className="font-bold text-slate-800">1. מהות העבודה הנדרשת</p>
                <p>* בדיקה ותיקון יחידת האינטרקום: בדיקת לוח המקשים/פאנל החוץ, איתור ותיקון נתק בחיווט.</p>
                <p>* החלפת מנעול מגנטי (אלקטרומגנט): פירוק מנעול ישן, אספקה והתקנה של מנעול מגנטי 600 ליברות כולל מתאמים וכיוון מלא.</p>
              </div>
            </div>
          )}

          {/* Comparison Matrix Header & Protocol Banner */}
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-extrabold text-slate-700 text-sm">מטריצת השוואת הצעות מחיר מספקים</span>
              <span>3 קבלנים ברשימת התפוצה</span>
            </div>

            {/* Winning Decision Protocol Banner */}
            <div className="p-4 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Trophy size={18} />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-600 text-white">
                      הצעה זוכה • החלטת ועד הבית
                    </span>
                    <span className="text-sm font-extrabold text-emerald-950">
                      הקבלן שנבחר: {selectedWinner.vendorName} (₪{selectedWinner.price.toLocaleString()})
                    </span>
                  </div>
                  <p className="text-xs font-bold text-emerald-800">
                    נימוק בחירת הקבלן לפרוטוקול:{' '}
                    {selectedWinner.isLowest ? 'ההצעה הזולה ביותר 💰' : 'יחס עלות-זמינות מיטבי ⚡'}
                  </p>
                </div>
              </div>
            </div>

            {/* 3 Contractor Quote Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PREVIEW_QUOTES.map((quote) => {
                const isWinner = quote.id === selectedWinnerId;
                const TimelineIcon =
                  quote.timelineIcon === 'clock'
                    ? Clock
                    : quote.timelineIcon === 'zap'
                    ? Zap
                    : Wrench;

                return (
                  <div
                    key={quote.id}
                    onClick={() => setSelectedWinnerId(quote.id)}
                    className={`rounded-xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isWinner
                        ? 'border-emerald-400 bg-emerald-50/30 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Card Top Row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-extrabold text-slate-900 text-sm truncate">
                            {quote.vendorName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            {quote.badge}
                          </span>
                        </div>
                        {isWinner ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-600 text-white shrink-0">
                            <Trophy size={11} />
                            <span>הצעה זוכה</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            <CheckCircle2 size={11} />
                            <span>הוגשה הצעה</span>
                          </span>
                        )}
                      </div>

                      {/* Price & Timeline Box */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-semibold">מחיר מוצע:</span>
                          <span className="text-base font-black text-slate-900">
                            ₪{quote.price.toLocaleString()}{' '}
                            <span className="text-[11px] font-semibold text-slate-500">+ מע"מ</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-semibold">לוח זמנים משוער:</span>
                          <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                            <TimelineIcon size={12} className="text-blue-600" />
                            <span>{quote.timeline}</span>
                          </span>
                        </div>
                        {quote.note && (
                          <p className="text-[11px] text-slate-600 italic pt-1 border-t border-slate-200/70">
                            {quote.note}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons Preview */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWinnerId(quote.id);
                        }}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                          isWinner
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-amber-500/90 hover:bg-amber-600 text-white'
                        }`}
                      >
                        <Trophy size={13} />
                        <span>{isWinner ? 'נבחר כהצעה זוכה' : 'בחר כהצעה זוכה'}</span>
                      </button>
                      <span className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold bg-white border border-emerald-300 text-emerald-700">
                        <MessageCircle size={13} />
                        <span>וואטסאפ</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Low-Friction CTA Banner */}
      <section className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-start">
          <h3 className="text-base font-extrabold text-slate-900">
            {isEn
              ? 'Ready to save hours on contractor quotes?'
              : 'רוצים להתחיל לקבל הצעות מחיר מסודרות כבר מהתקלה הבאה?'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600">
            {isEn
              ? 'Contact us to activate your annual RFQ tender quota bank for your building.'
              : 'שלחו לנו פנייה מהירה ונתאים עבורכם חבילת מכרזים שנתית ללא התחייבות מיותרת.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <a
            href={mailtoHref}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-extrabold shadow-md transition-all shrink-0 cursor-pointer"
          >
            <Mail size={17} />
            <span>{isEn ? 'Request Activation' : 'לפרטים והפעלת המודול'}</span>
          </a>
          <a
            href="https://www.mytiktak.com/rfq"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-blue-700 border border-blue-200 text-sm font-bold transition-all shrink-0 cursor-pointer"
          >
            <span>{isEn ? 'Pricing & Details' : 'תוכניות מחיר ומידע נוסף'}</span>
            <ExternalLink size={15} />
          </a>
        </div>
      </section>
    </div>
  );
};
