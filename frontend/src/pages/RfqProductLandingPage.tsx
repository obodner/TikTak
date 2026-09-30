import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  X,
  Globe,
  Receipt,
  Trophy,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  LogIn
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ScreenshotPlaceholder from '../components/landing/ScreenshotPlaceholder';

type LeadType = 'building' | 'company' | 'settlement';

export default function RfqProductLandingPage() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'he';

  React.useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rfqShowcaseTab, setRfqShowcaseTab] = useState<'matrix' | 'contract' | 'mobile'>('matrix');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Lead Form State
  const [fullName, setFullName] = useState('');
  const [leadType, setLeadType] = useState<LeadType>('building');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !address || !phoneNumber) {
      setSubmitError(isRtl ? 'אנא מלא את כל השדות' : 'Please fill in all fields');
      return;
    }

    if (!/^0\d{8,9}$/.test(phoneNumber.replace(/\D/g, ''))) {
      setSubmitError(isRtl ? 'מספר טלפון לא תקין' : 'Invalid phone number');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await addDoc(collection(db, 'leads'), {
        fullName,
        type: leadType,
        address,
        phone: phoneNumber,
        createdAt: serverTimestamp(),
        source: 'rfq_product_page'
      });
      setIsSubmitted(true);
      setFullName('');
      setAddress('');
      setPhoneNumber('');
    } catch (err: any) {
      console.error('Lead submission failed:', err);
      setSubmitError(isRtl ? 'אירעה שגיאה. נסו שוב.' : 'Error submitting. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen bg-slate-900 text-white font-sans ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* 1. TOP NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Return Link */}
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/" className="flex items-center gap-3 group">
              <img
                src="/logo_transparent.png"
                alt="TikTak"
                className="h-12 sm:h-14 w-auto object-contain group-hover:scale-105 transition-transform"
              />
              <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                RFQ
              </span>
            </Link>

            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            <Link
              to="/"
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors hidden sm:flex"
            >
              {isRtl ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
              <span>{isRtl ? 'חזרה לדף הבית (דיווחי תקלות)' : 'Back to Home (Incident Reporting)'}</span>
            </Link>
          </div>

          {/* Nav Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => i18n.changeLanguage(isRtl ? 'en' : 'he')}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-black text-slate-300 hover:bg-slate-800 transition-all cursor-pointer"
            >
              <Globe size={14} className="text-blue-400" />
              <span>{isRtl ? 'EN' : 'עברית'}</span>
            </button>

            <Link
              to="/admin/login"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition-all"
            >
              <LogIn size={15} />
              <span className="hidden sm:inline">{isRtl ? 'כניסת מנהלים' : 'Admin Login'}</span>
            </Link>

            <button
              onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm font-extrabold px-4 sm:px-5 py-2.5 rounded-xl shadow-md shadow-emerald-500/20 transition-all cursor-pointer shrink-0"
            >
              {isRtl ? 'התחלת פיילוט מכרזים 🚀' : 'Start RFQ Pilot 🚀'}
            </button>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative pt-36 pb-20 md:pt-44 md:pb-28 overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800">
        <div className="absolute top-10 right-10 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Right Column: Hero Pitch */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-right">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black">
                <Sparkles size={14} className="text-emerald-400" />
                <span>{isRtl ? 'פתרון B2B לוועדי בתים, חברות ניהול ויישובים' : 'B2B Procurement for Committees & Managers'}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">
                {isRtl ? (
                  <>
                    מכרזי מחיר ורכש קבלנים – <span className="text-emerald-400">מהתקלה להסכם חתום.</span>
                  </>
                ) : (
                  <>
                    Contractor RFQs & Tenders – <span className="text-emerald-400">From Fault to Contract.</span>
                  </>
                )}
              </h1>

              <p className="text-base sm:text-lg text-slate-300 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
                {isRtl
                  ? 'נפרדים מהצעות מחיר כאוטיות בוואטסאפ ושיחות טלפון מתישות. מודול ה-RFQ של TikTak הופך כל תקלה גדולה למכרז ממוחשב ותחרותי: הפצה לקבלנים ב-WhatsApp, השוואת מחירים שקופה, חיסכון של 10%-20%, והפקת חוזה עבודה מחייב ב-60 שניות.'
                  : 'Stop chasing contractor quotes over chaotic WhatsApp groups. TikTak RFQ turns major repairs into competitive digital tenders: 1-click broadcast, transparent bid comparison, 10%-20% savings, and binding work order generation in 60 seconds.'}
              </p>

              {/* Value Chips */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 text-xs font-bold text-slate-300">
                <span className="px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>{isRtl ? 'חיסכון של ₪1,500 עד ₪3,000 במכרז ראשון' : 'Avg. ₪1,500–₪3,000 savings on job #1'}</span>
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>{isRtl ? 'הגנה משפטית ותיעוד ל-7 שנים כחוק' : '7-year legal condominium retention'}</span>
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>{isRtl ? 'הקבלנים מגישים הצעה ללא הורדת אפליקציה' : 'Zero-friction contractor quoting'}</span>
                </span>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start pt-3">
                <button
                  onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-base font-extrabold px-8 py-4 rounded-2xl shadow-xl shadow-emerald-500/25 transition-all cursor-pointer text-center"
                >
                  {isRtl ? 'התחלת פיילוט מכרזים בחינם 🚀' : 'Start Free RFQ Pilot 🚀'}
                </button>
                <a
                  href="#pricing"
                  className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white text-base font-extrabold px-6 py-4 rounded-2xl transition-all text-center flex items-center justify-center gap-2"
                >
                  <Receipt size={18} className="text-emerald-400" />
                  <span>{isRtl ? 'מחירון בנק מכרזים שנתי' : 'Annual Pricing Tiers'}</span>
                </a>
              </div>
            </div>

            {/* Left Column: Hero Interactive Preview */}
            <div className="lg:col-span-6 space-y-4">
              <ScreenshotPlaceholder
                src="/rfq_comparison_preview.png"
                alt="מטריצת השוואת הצעות מחיר מקבלנים ב-TikTak"
                aspectRatio="16/9"
                title="מטריצת השוואת הצעות מחיר (RFQ)"
                badge="מכרז חי לדוגמה"
                filename="public/rfq_comparison_preview.png"
                mockType="rfq-matrix"
              />
              <div className="p-3.5 bg-slate-800/60 border border-slate-700 rounded-xl flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-2">
                  <Trophy size={16} className="text-amber-400" />
                  <span>{isRtl ? '3 הצעות קבלנים מתחרות • מחיר נעול כולל מע"מ' : '3 competitive contractor bids • Locked price inc. VAT'}</span>
                </span>
                <span className="text-emerald-400 font-extrabold">{isRtl ? 'סגירת חוזה ב-60 שניות' : '1-Click Contract'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. THE 4 FINANCIAL LEAKAGE PROBLEMS WE SOLVE */}
      <section className="py-20 bg-slate-950 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <span className="px-4 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-black uppercase tracking-wider">
              {isRtl ? 'החיסכון הכספי שלך' : 'Direct Financial Savings'}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {isRtl ? 'איך ועדי בתים מפסידים אלפי שקלים במכרזים ידניים?' : 'How Traditional Manual Quotes Cost You Thousands'}
            </h2>
            <p className="text-base text-slate-400 font-medium">
              {isRtl
                ? 'שיחות טלפון אקראיות והודעות בוואטסאפ עולות לוועד ביוקר. הנה 4 מלכודות ש-TikTak מבטלת לחלוטין:'
                : 'Scattered phone calls and informal WhatsApp messages cause massive budget leaks. Here is how TikTak fixes them:'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-xl font-bold">
                ⚡
              </div>
              <h4 className="font-black text-white text-base">{isRtl ? 'אפקט התחרות הממוחשב' : 'Competitive Bid Urgency'}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isRtl
                  ? 'בשיחה אישית קבלנים מתמחרים גבוה ("שיטת מצליח"). כשהם מקבלים קישור רשמי עם תוקף מתוחם של 48 שעות מול ספקים נוספים, הם מגישים מיד את המחיר החד ביותר (10%-20% פחות).'
                  : 'On informal phone calls, contractors quote high. When receiving a formal 48h digital tender alongside peers, they submit their sharpest rate upfront.'}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-xl font-bold">
                ⚖️
              </div>
              <h4 className="font-black text-white text-base">{isRtl ? 'מניעת מלכודת המפרט השונה' : 'Identical Scope Comparison'}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isRtl
                  ? 'נמנעת טעות של השוואת "תפוחים לתפוזים". כל הקבלנים מקבלים את אותו מפרט תקלות מדויק, תמונות והקלטות קול, ולא יכולים לטעון לאי-הבנה.'
                  : 'Eliminates apples-to-oranges trap. All contractors bid on the exact same fault blueprints, measurements and photos.'}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xl font-bold">
                🔒
              </div>
              <h4 className="font-black text-white text-base">{isRtl ? 'בלי הפתעות מע״מ ופינוי' : 'Zero Hidden VAT Surprises'}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isRtl
                  ? 'הקבלן מחויב מראש להצהיר כולל/לפני מע"מ, התחייבות לזמן ביצוע, אחריות ופינוי פסולת. המחיר נעול וחתום דיגיטלית.'
                  : 'Contractors explicitly commit to VAT inclusion, duration, and warranty. The price is digitally locked and binding.'}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-xl font-bold">
                🛡️
              </div>
              <h4 className="font-black text-white text-base">{isRtl ? 'שריון משפטי מפני שכנים' : 'Legal Shield Against Disputes'}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isRtl
                  ? 'תיעוד מלא ונימוק בחירת הזוכה לפרוטוקול. מונע טענות של דיירים על משוא פנים ועומד בדרישות המפקח על המקרקעין ל-7 שנות שמירה.'
                  : 'Transparent audit logs and award reasoning shield committees from resident disputes and Land Inspector inquiries.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. WORKFLOW SHOWCASE: 3 TABS PREVIEW */}
      <section className="py-20 md:py-28 bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-2xl font-black text-white flex items-center gap-2">
                <Receipt className="text-emerald-400" />
                <span>{isRtl ? 'תהליך המכרז מקצה לקצה' : 'End-to-End RFQ Workflow'}</span>
              </h3>
              <p className="text-xs text-slate-400">
                {isRtl ? 'בחרו שלב להצגת התצוגה המלאה' : 'Select a stage to view UI preview'}
              </p>
            </div>

            {/* Showcase Tab Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
              <button
                onClick={() => setRfqShowcaseTab('matrix')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${rfqShowcaseTab === 'matrix' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
              >
                {isRtl ? '1. מטריצת השוואת הצעות' : '1. Bids Matrix'}
              </button>
              <button
                onClick={() => setRfqShowcaseTab('contract')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${rfqShowcaseTab === 'contract' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
              >
                {isRtl ? '2. הסכם עבודה חתום' : '2. Signed Work Order'}
              </button>
              <button
                onClick={() => setRfqShowcaseTab('mobile')}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${rfqShowcaseTab === 'mobile' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
              >
                {isRtl ? '3. פורטל הקבלן בנייד' : '3. Contractor Portal'}
              </button>
            </div>
          </div>

          {/* Tab Content Display */}
          <div>
            {rfqShowcaseTab === 'matrix' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8">
                  <ScreenshotPlaceholder
                    src="/rfq_comparison_preview.png"
                    alt="מטריצת השוואת הצעות מחיר מקבלנים"
                    aspectRatio="16/9"
                    title="מטריצת השוואת הצעות מחיר (RFQ)"
                    badge="מטריצה מרוכזת"
                    filename="public/rfq_comparison_preview.png"
                    mockType="rfq-matrix"
                  />
                </div>
                <div className="lg:col-span-4 space-y-4 text-xs font-medium text-slate-300">
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-black text-white text-sm flex items-center gap-1.5 text-emerald-400">
                      <span>💰</span>
                      <span>זיהוי אוטומטי של ההצעה הזולה</span>
                    </div>
                    <p className="leading-relaxed">
                      המערכת מחשבת מחיר סופי (כולל/לפני מע"מ) ומסמנת את ההצעה האטרקטיבית ביותר. אם הוועד בוחר בהצעה יקרה יותר (עקב אחריות ארוכה או ניסיון מוכח), המערכת מתעדת את הנימוק להגנה משפטית.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-black text-white text-sm flex items-center gap-1.5 text-blue-400">
                      <span>⚡</span>
                      <span>סגירת פנייה והודעה לקבלנים בלחיצה</span>
                    </div>
                    <p className="leading-relaxed">
                      בחירת הזוכה מעדכנת את התקלה, שולחת הודעת תודה מותאמת לספקים שלא נבחרו, ומפיקה מיד הסכם עבודה משפטי.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {rfqShowcaseTab === 'contract' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8">
                  <ScreenshotPlaceholder
                    src="/work_order_contract_preview.png"
                    alt="הסכם עבודה והזמנה מחייבת שהופקה ב-TikTak"
                    aspectRatio="16/9"
                    title="הסכם עבודה והזמנה מחייבת (Work Order)"
                    badge="הסכם משפטי להדפסה / PDF"
                    filename="public/work_order_contract_preview.png"
                    mockType="contract"
                  />
                </div>
                <div className="lg:col-span-4 space-y-4 text-xs font-medium text-slate-300">
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-black text-white text-sm flex items-center gap-1.5 text-amber-400">
                      <span>📄</span>
                      <span>הזמנת עבודה מותאמת לסטנדרט הישראלי</span>
                    </div>
                    <p className="leading-relaxed">
                      המסמך כולל ח.פ./ת.ז. של הקבלן, פרטי איש הקשר בוועד, מפרט העבודה המוסכם, לוחות זמנים, תנאי תשלום בגמר העבודה ופינוי פסולת.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-black text-white text-sm flex items-center gap-1.5 text-blue-400">
                      <span>📲</span>
                      <span>שליחה ישירה לקבלן לחתימה בוואטסאפ</span>
                    </div>
                    <p className="leading-relaxed">
                      בלחיצת כפתור אחת מופק קישור WhatsApp ישיר לקבלן עם סיכום התנאים וקישור דיגיטלי למסמך.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {rfqShowcaseTab === 'mobile' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8 flex justify-center">
                  <div className="w-full max-w-sm">
                    <ScreenshotPlaceholder
                      src="/contractor_mobile_portal.png"
                      alt="פורטל הקבלן להגשת הצעת מחיר מהנייד"
                      aspectRatio="16/9"
                      title="פורטל קבלנים ללא צורך בהתחברות"
                      badge="חוויית קבלן ב-60 שניות"
                      filename="public/contractor_mobile_portal.png"
                      mockType="contractor-portal"
                    />
                  </div>
                </div>
                <div className="lg:col-span-4 space-y-4 text-xs font-medium text-slate-300">
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-black text-white text-sm flex items-center gap-1.5 text-emerald-400">
                      <span>🚀</span>
                      <span>אפס חיכוך לקבלנים (Zero-Barrier)</span>
                    </div>
                    <p className="leading-relaxed">
                      קבלנים לא אוהבים להירשם או להוריד אפליקציות. הקישור האישי מאפשר להם לפתוח את הפורטל בנייד, לראות תמונות ולהגיש מחיר תוך דקה.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-black text-white text-sm flex items-center gap-1.5 text-blue-400">
                      <span>📎</span>
                      <span>צירוף קובץ הצעת מחיר ורישיונות</span>
                    </div>
                    <p className="leading-relaxed">
                      הקבלן יכול להעלות PDF של הצעת המחיר הרשמית שלו או תעודת ביטוח ישירות מהסמארטפון.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. PRICING: ANNUAL RFQ CREDIT BANK */}
      <section id="pricing" className="py-20 md:py-28 bg-slate-950 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="px-4 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black uppercase tracking-wider">
              {isRtl ? 'מודל רישוי שנתי' : 'Annual License Tiers'}
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
              {isRtl ? 'מחירון בנק מכרזים שנתי' : 'Annual RFQ Credit Bank Pricing'}
            </h2>
            <p className="text-base text-slate-300 font-medium">
              {isRtl
                ? 'שיפוצים ועבודות קבלניות הם עונתיים. לכן מודל ה-RFQ פועל כבנק פניות שנתי מותאם לתקציב אסיפת הדיירים, עם צבירת יתרות לשנה הבאה (Rollover).'
                : 'Capital repairs are seasonal (autumn waterproofing, spring painting). The RFQ module operates as a pre-paid annual credit bank aligned with annual AGM budgets, with rollover of unused credits.'}
            </p>
          </div>

          {/* Pricing Table Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 space-y-8 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-black text-[11px] uppercase">
                    <th className="py-3 px-3">{isRtl ? 'חבילת מכרזים' : 'RFQ Tier'}</th>
                    <th className="py-3 px-3">{isRtl ? 'הקצאה שנתית' : 'Allocation'}</th>
                    <th className="py-3 px-3">{isRtl ? 'מחיר שנתי' : 'Annual Fee'}</th>
                    <th className="py-3 px-3">{isRtl ? 'עלות אפקטיבית למכרז' : 'Rate per RFQ'}</th>
                    <th className="py-3 px-3">{isRtl ? 'פעולה' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-bold text-slate-200">
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-3 font-black text-white">RFQ Starter</td>
                    <td className="py-4 px-3">{isRtl ? '3 מכרזים בשנה' : '3 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-400">₪179 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-400">₪59.60 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-white text-xs font-black transition-all cursor-pointer"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-3 font-black text-white">RFQ Basic</td>
                    <td className="py-4 px-3">{isRtl ? '6 מכרזים בשנה' : '6 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-400">₪299 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-400">₪49.80 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-white text-xs font-black transition-all cursor-pointer"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  {/* Standard Tier */}
                  <tr className="bg-emerald-950/40 hover:bg-emerald-950/60 transition-colors border-y-2 border-emerald-500/50">
                    <td className="py-4 px-3 font-black text-white flex items-center gap-2">
                      <span>RFQ Standard</span>
                      <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.2 rounded-full font-black">
                        {isRtl ? 'המומלץ ביותר ⭐' : 'Most Popular ⭐'}
                      </span>
                    </td>
                    <td className="py-4 px-3 font-black text-white">{isRtl ? '12 מכרזים בשנה' : '12 RFQs / year'}</td>
                    <td className="py-4 px-3 font-black text-emerald-400 text-base">₪499 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-emerald-300 font-extrabold">₪41.50 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all cursor-pointer"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-3 font-black text-white">RFQ Growth</td>
                    <td className="py-4 px-3">{isRtl ? '25 מכרזים בשנה' : '25 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-400">₪899 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-400">₪35.90 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-white text-xs font-black transition-all cursor-pointer"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-3 font-black text-white">RFQ Enterprise</td>
                    <td className="py-4 px-3">{isRtl ? '50 מכרזים בשנה' : '50 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-400">₪1,599 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-400">₪31.90 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-white text-xs font-black transition-all cursor-pointer"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-400" />
                <span>{isRtl ? 'פניות שלא נוצלו עוברות אוטומטית לשנה הבאה בעת חידוש (Rollover)' : 'Unused RFQ credits roll over into the following year upon renewal'}</span>
              </span>
              <span className="text-slate-300 font-bold">{isRtl ? 'רכישת פניות בודדות (Top-Up) זמינה בכל עת' : 'On-demand top-ups available'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ */}
      <section className="py-20 bg-slate-900 border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-black text-white tracking-tight">
              {isRtl ? 'שאלות נפוצות על מודול ה-RFQ' : 'Frequently Asked Questions'}
            </h2>
          </div>

          <div className="space-y-3">
            {[
              {
                q: isRtl ? 'האם הקבלנים חייבים להירשם או להוריד אפליקציה?' : 'Do contractors need an account or app?',
                a: isRtl
                  ? 'לא. הקבלן מקבל קישור אישי מאובטח בוואטסאפ, פותח אותו בסמארטפון ומגיש מחיר, תנאי אחריות ומסמכים תוך דקה.'
                  : 'No. Contractors receive a secure personalized link via WhatsApp and submit prices in 60 seconds without any login.'
              },
              {
                q: isRtl ? 'האם הסכם העבודה (Work Order) תקף משפטית בישראל?' : 'Is the generated Work Order legally binding?',
                a: isRtl
                  ? 'כן. המסמך כולל את ח.פ./ת.ז. של הקבלן, פרטי הוועד, מפרט העבודה, תנאי תשלום בגמר העבודה, אחריות ונימוק בחירת הזוכה לפרוטוקול כנדרש בתקנון המצוי של חוק המקרקעין.'
                  : 'Yes. It meets standard Israeli contract requirements and Condominium bylaws, detailing contractor legal IDs, scopes, milestones, and warranties.'
              },
              {
                q: isRtl ? 'האם מודול ה-RFQ מחייב מנוי במערכת הדיווח של TikTak?' : 'Does RFQ require a base TikTak subscription?',
                a: isRtl
                  ? 'מודול ה-RFQ מתוכנן לעבוד בסינרגיה מושלמת מתוך קריאות התקלה הקיימות ב-TikTak, אך ניתן להשתמש בו גם כמודול עצמאי להפצת מכרזי תחזוקה.'
                  : 'TikTak RFQ works seamlessly escalating from routine tickets, but can also be utilized as a standalone procurement tool.'
              }
            ].map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden text-right">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-4 flex items-center justify-between text-right font-black text-white text-sm hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="text-slate-400">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-0 text-xs text-slate-400 font-medium leading-relaxed border-t border-slate-800/60">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. BOTTOM CTA */}
      <section className="py-20 bg-gradient-to-br from-emerald-600 to-teal-800 text-white text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            {isRtl ? 'רוצים לחסוך אלפי שקלים במכרז הבא של הבניין?' : 'Ready to Save Thousands on Your Next Repair?'}
          </h2>
          <p className="text-base text-emerald-100 max-w-2xl mx-auto font-medium">
            {isRtl
              ? 'הצטרפו לפיילוט חינם ללא כל התחייבות. הפיצו מכרז ראשון ותראו בעצמכם את מהירות התגובה והחיסכון הכספי.'
              : 'Start a free RFQ pilot with zero commitments. Broadcast your first tender and experience competitive pricing.'}
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
              className="bg-white hover:bg-slate-100 text-emerald-800 font-black text-base px-8 py-4 rounded-2xl shadow-xl shadow-black/10 active:scale-95 transition-all cursor-pointer"
            >
              {isRtl ? 'התחילו פיילוט מכרזים עכשיו 🚀' : 'Start Free Pilot Now 🚀'}
            </button>
          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="bg-slate-950 text-slate-500 py-10 text-xs border-t border-slate-850">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div className="flex items-center gap-3">
            <img
              src="/logo_transparent.png"
              alt="TikTak"
              className="h-8 w-auto object-contain"
            />
            <span className="font-black text-slate-300 text-xs">TikTak RFQ Procurement Platform</span>
          </div>

          <div className="flex gap-4 font-bold text-slate-400">
            <Link to="/" className="hover:text-white transition-colors">{isRtl ? 'דיווחי תקלות שוטפים' : 'Routine Maintenance'}</Link>
            <a href="#pricing" className="hover:text-white transition-colors">{isRtl ? 'מחירים' : 'Pricing'}</a>
          </div>

          <div>© {new Date().getFullYear()} TikTak. All rights reserved.</div>
        </div>
      </footer>

      {/* LEAD CAPTURE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-850 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative text-right text-white">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            {isSubmitted ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto">
                  ✓
                </div>
                <h3 className="text-2xl font-black text-white">
                  {isRtl ? 'תודה! הפנייה נקלטה בהצלחה 🚀' : 'Request Received 🚀'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 font-medium">
                  {isRtl
                    ? 'נציג מצוות TikTak יחזור אליכם בהקדם לפתיחת פיילוט במודול המכרזים ללא עלות.'
                    : 'A TikTak representative will contact you shortly to activate your free RFQ pilot.'}
                </p>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-md cursor-pointer"
                >
                  {isRtl ? 'סגור' : 'Close'}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-black text-white">
                    {isRtl ? 'התחלת פיילוט מודול מכרזים (RFQ)' : 'Start Free RFQ Pilot'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isRtl ? 'השאירו פרטים ונחבר אתכם למערכת המכרזים תוך דקות' : 'Leave your details to access the procurement module'}
                  </p>
                </div>

                {submitError && (
                  <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-300 block">{isRtl ? 'שם מלא' : 'Full Name'} *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={isRtl ? 'לדוגמה: ישראל ישראלי' : 'e.g. John Doe'}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-300 block">{isRtl ? 'טלפון נייד' : 'Mobile Phone'} *</label>
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="050-1234567"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-300 block">{isRtl ? 'כתובת הבניין / המתחם' : 'Building Address'} *</label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isRtl ? 'לדוגמה: רוטשילד 45, תל אביב' : 'e.g. 45 Rothschild, Tel Aviv'}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-300 block">{isRtl ? 'סוג לקוח' : 'Property Type'}</label>
                    <select
                      value={leadType}
                      onChange={(e) => setLeadType(e.target.value as LeadType)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="building">{isRtl ? 'ועד בית / בניין מגורים' : 'Building Committee / Residential'}</option>
                      <option value="company">{isRtl ? 'חברת ניהול ואחזקה' : 'Property Management Company'}</option>
                      <option value="settlement">{isRtl ? 'יישוב / קיבוץ / מועצה' : 'Community / Settlement'}</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (isRtl ? 'שולח נתונים...' : 'Submitting...') : (isRtl ? 'שלח בקשה לפיילוט מכרזים 🚀' : 'Start Free RFQ Pilot 🚀')}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
