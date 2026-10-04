import React, { useState, useEffect } from 'react';
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
  const [rfqShowcaseTab, setRfqShowcaseTab] = useState<'request' | 'mobile' | 'whatsapp' | 'matrix' | 'contract'>('request');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Lightbox for full screenshot preview
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string; title: string } | null>(null);
  const [isLightboxZoomed, setIsLightboxZoomed] = useState(false);

  useEffect(() => {
    if (!lightboxImage) {
      setIsLightboxZoomed(false);
    }
  }, [lightboxImage]);

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
    <div className={`min-h-screen bg-slate-50 text-slate-800 antialiased font-sans selection:bg-emerald-600 selection:text-white ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* 1. TOP NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Return Link */}
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/" className="flex items-center gap-3 group">
              <img
                src="/logo_transparent.png"
                alt="TikTak"
                className="h-12 sm:h-14 w-auto object-contain group-hover:scale-105 transition-transform"
              />
              <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                RFQ
              </span>
            </Link>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <Link
              to="/"
              className="text-xs font-bold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 transition-colors px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white sm:border-transparent sm:bg-transparent hover:bg-slate-100"
            >
              {isRtl ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
              <span className="hidden sm:inline">{isRtl ? 'חזרה לדף הבית (דיווחי תקלות)' : 'Back to Home (Incident Reporting)'}</span>
              <span className="sm:hidden font-black text-slate-700">{isRtl ? 'דף הבית' : 'Home'}</span>
            </Link>
          </div>

          {/* Nav Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => i18n.changeLanguage(isRtl ? 'en' : 'he')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer"
            >
              <Globe size={14} className="text-blue-600" />
              <span>{isRtl ? 'EN' : 'עברית'}</span>
            </button>

            <Link
              to="/admin/login"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-slate-100 border border-slate-200 transition-all"
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
      <section className="relative pt-36 pb-20 md:pt-44 md:pb-28 overflow-hidden bg-gradient-to-b from-white via-slate-50 to-slate-100/60 border-b border-slate-200/80">
        <div className="absolute top-10 right-10 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Right Column: Hero Pitch */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-right">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black shadow-2xs">
                <Sparkles size={14} className="text-emerald-600" />
                <span>{isRtl ? 'פתרון B2B לוועדי בתים, חברות ניהול ויישובים' : 'B2B Procurement for Committees & Managers'}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
                {isRtl ? (
                  <>
                    מכרזי מחיר ורכש קבלנים – <span className="text-emerald-600">מהתקלה להסכם חתום.</span>
                  </>
                ) : (
                  <>
                    Contractor RFQs & Tenders – <span className="text-emerald-600">From Fault to Contract.</span>
                  </>
                )}
              </h1>

              <p className="text-base sm:text-lg text-slate-600 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
                {isRtl
                  ? 'נפרדים מהצעות מחיר כאוטיות בוואטסאפ ושיחות טלפון מתישות. מודול ה-RFQ של TikTak הופך כל תקלה גדולה למכרז ממוחשב ותחרותי: הפצה לקבלנים ב-WhatsApp, השוואת מחירים שקופה, חיסכון של 10%-20%, והפקת חוזה עבודה מחייב ב-60 שניות.'
                  : 'Stop chasing contractor quotes over chaotic WhatsApp groups. TikTak RFQ turns major repairs into competitive digital tenders: 1-click broadcast, transparent bid comparison, 10%-20% savings, and binding work order generation in 60 seconds.'}
              </p>

              {/* Value Chips */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 text-xs font-bold text-slate-700">
                <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow-xs">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>{isRtl ? 'חיסכון של ₪1,500 עד ₪3,000 במכרז ראשון' : 'Avg. ₪1,500–₪3,000 savings on job #1'}</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow-xs">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>{isRtl ? 'הגנה משפטית ותיעוד ל-7 שנים כחוק' : '7-year legal condominium retention'}</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow-xs">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>{isRtl ? 'הקבלנים מגישים הצעה ללא הורדת אפליקציה' : 'Zero-friction contractor quoting'}</span>
                </span>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start pt-3">
                <button
                  onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-base font-extrabold px-8 py-4 rounded-2xl shadow-xl shadow-emerald-600/20 transition-all cursor-pointer text-center"
                >
                  {isRtl ? 'התחלת פיילוט מכרזים בחינם 🚀' : 'Start Free RFQ Pilot 🚀'}
                </button>
                <a
                  href="#pricing"
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-base font-extrabold px-6 py-4 rounded-2xl transition-all text-center flex items-center justify-center gap-2 shadow-xs"
                >
                  <Receipt size={18} className="text-emerald-600" />
                  <span>{isRtl ? 'מחירון בנק מכרזים שנתי' : 'Annual Pricing Tiers'}</span>
                </a>
              </div>
            </div>

            {/* Left Column: Hero Interactive Preview */}
            <div className="lg:col-span-6 space-y-4">
              <ScreenshotPlaceholder
                src="/rfq_comparison_preview.png?v=3"
                alt="מטריצת השוואת הצעות מחיר מקבלנים ב-TikTak"
                aspectRatio="16/10"
                objectFit="contain"
                title="מטריצת השוואת הצעות מחיר (RFQ)"
                badge="מכרז חי לדוגמה"
                filename="public/rfq_comparison_preview.png"
                mockType="rfq-matrix"
                onClick={() => setLightboxImage({
                  src: '/rfq_comparison_preview.png?v=3',
                  alt: 'מטריצת השוואת הצעות מחיר מקבלנים ב-TikTak',
                  title: 'מטריצת השוואת הצעות מחיר (RFQ)'
                })}
              />
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700 shadow-xs">
                <span className="flex items-center gap-2">
                  <Trophy size={16} className="text-amber-500" />
                  <span>{isRtl ? '3 הצעות קבלנים מתחרות • מחיר נעול כולל מע"מ' : '3 competitive contractor bids • Locked price inc. VAT'}</span>
                </span>
                <span className="text-emerald-700 font-extrabold">{isRtl ? 'סגירת חוזה ב-60 שניות' : '1-Click Contract'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. THE 4 FINANCIAL LEAKAGE PROBLEMS WE SOLVE */}
      <section className="py-20 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <span className="px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black uppercase tracking-wider">
              {isRtl ? 'החיסכון הכספי שלך' : 'Direct Financial Savings'}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {isRtl ? 'איך ועדי בתים מפסידים אלפי שקלים במכרזים ידניים?' : 'How Traditional Manual Quotes Cost You Thousands'}
            </h2>
            <p className="text-base text-slate-600 font-medium">
              {isRtl
                ? 'שיחות טלפון אקראיות והודעות בוואטסאפ עולות לוועד ביוקר. הנה 4 מלכודות ש-TikTak מבטלת לחלוטין:'
                : 'Scattered phone calls and informal WhatsApp messages cause massive budget leaks. Here is how TikTak fixes them:'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-bold">
                ⚡
              </div>
              <h4 className="font-black text-slate-900 text-base">{isRtl ? 'אפקט התחרות הממוחשב' : 'Competitive Bid Urgency'}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isRtl
                  ? 'בשיחה אישית קבלנים מתמחרים גבוה ("שיטת מצליח"). כשהם מקבלים קישור רשמי עם תוקף מתוחם של 48 שעות מול ספקים נוספים, הם מגישים מיד את המחיר החד ביותר (10%-20% פחות).'
                  : 'On informal phone calls, contractors quote high. When receiving a formal 48h digital tender alongside peers, they submit their sharpest rate upfront.'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">
                ⚖️
              </div>
              <h4 className="font-black text-slate-900 text-base">{isRtl ? 'מניעת מלכודת המפרט השונה' : 'Identical Scope Comparison'}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isRtl
                  ? 'נמנעת טעות של השוואת "תפוחים לתפוזים". כל הקבלנים מקבלים את אותו מפרט תקלות מדויק, תמונות והקלטות קול, ולא יכולים לטעון לאי-הבנה.'
                  : 'Eliminates apples-to-oranges trap. All contractors bid on the exact same fault blueprints, measurements and photos.'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold">
                🔒
              </div>
              <h4 className="font-black text-slate-900 text-base">{isRtl ? 'בלי הפתעות מע״מ ופינוי' : 'Zero Hidden VAT Surprises'}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isRtl
                  ? 'הקבלן מחויב מראש להצהיר כולל/לפני מע"מ, התחייבות לזמן ביצוע, אחריות ופינוי פסולת. המחיר נעול וחתום דיגיטלית.'
                  : 'Contractors explicitly commit to VAT inclusion, duration, and warranty. The price is digitally locked and binding.'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-6 rounded-3xl space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-bold">
                🛡️
              </div>
              <h4 className="font-black text-slate-900 text-base">{isRtl ? 'שריון משפטי מפני שכנים' : 'Legal Shield Against Disputes'}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isRtl
                  ? 'תיעוד מלא ונימוק בחירת הזוכה לפרוטוקול. מונע טענות של דיירים על משוא פנים ועומד בדרישות המפקח על המקרקעין ל-7 שנות שמירה.'
                  : 'Transparent audit logs and award reasoning shield committees from resident disputes and Land Inspector inquiries.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. WORKFLOW SHOWCASE: 3 TABS PREVIEW */}
      <section className="py-20 md:py-28 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <Receipt className="text-emerald-600" />
                <span>{isRtl ? 'תהליך המכרז מקצה לקצה' : 'End-to-End RFQ Workflow'}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {isRtl ? 'בחרו שלב להצגת התצוגה המלאה' : 'Select a stage to view UI preview'}
              </p>
            </div>

            {/* Showcase Tab Switcher */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white rounded-2xl border border-slate-200 shadow-xs text-xs font-bold">
              <button
                onClick={() => setRfqShowcaseTab('request')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${rfqShowcaseTab === 'request' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {isRtl ? '1. בקשה להצעת מחיר' : '1. New RFQ Request'}
              </button>
              <button
                onClick={() => setRfqShowcaseTab('mobile')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${rfqShowcaseTab === 'mobile' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {isRtl ? '2. פורטל הקבלן בנייד' : '2. Contractor Portal'}
              </button>
              <button
                onClick={() => setRfqShowcaseTab('whatsapp')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${rfqShowcaseTab === 'whatsapp' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {isRtl ? '3. התראות WhatsApp' : '3. WhatsApp Dispatch'}
              </button>
              <button
                onClick={() => setRfqShowcaseTab('matrix')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${rfqShowcaseTab === 'matrix' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {isRtl ? '4. מטריצת השוואת הצעות' : '4. Bids Matrix'}
              </button>
              <button
                onClick={() => setRfqShowcaseTab('contract')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${rfqShowcaseTab === 'contract' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {isRtl ? '5. הסכם עבודה חתום' : '5. Signed Work Order'}
              </button>
            </div>
          </div>

          {/* Tab Content Display */}
          <div>
            {/* Step 1: New RFQ Request */}
            {rfqShowcaseTab === 'request' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8">
                  <ScreenshotPlaceholder
                    src="/create_new_rfq.png?v=3"
                    alt="יצירת בקשה להצעת מחיר ומכרז קבלנים ב-TikTak"
                    aspectRatio="16/10"
                    objectFit="contain"
                    title="בקשה להצעת מחיר (New RFQ)"
                    badge="הגדרת מכרז מהירה"
                    filename="public/create_new_rfq.png"
                    mockType="new-rfq"
                    onClick={() => setLightboxImage({
                      src: '/create_new_rfq.png?v=3',
                      alt: 'יצירת בקשה להצעת מחיר ומכרז קבלנים ב-TikTak',
                      title: 'יצירת בקשה חדשה להצעת מחיר (RFQ)'
                    })}
                  />
                </div>
                <div className="lg:col-span-4 space-y-4 text-xs font-medium text-slate-700">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>📝</span>
                      <span className="text-emerald-700">הגדרת תקלה ומפרט מכרז ב-60 שניות</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      פתיחת מכרז ישירות מתקלה קיימת שדווחה במערכת או כפנייה עצמאית. הזנת כותרת, תיאור מדויק, דחיפות ומועד יעד לקבלת הצעות.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>🏗️</span>
                      <span className="text-blue-700">הנחיות פינוי פסולת, ביטוחים ושלבי ביצוע</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      הגדרה מובנית של תנאי העבודה לפי סוג המקום (בניין / יישוב), דרישה להצגת ביטוח בתוקף וחלוקה לשלבי תשלום (Milestones).
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>👥</span>
                      <span className="text-purple-700">הפצה מרוכזת לספקים נבחרים בלחיצה</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      בחירת קבלנים ממאגר הספקים המאושרים והפקת קישורים אישיים ומאובטחים לכל קבלן ישירות לוואטסאפ.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Contractor Mobile Portal */}
            {rfqShowcaseTab === 'mobile' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-6 xl:col-span-5 flex justify-center">
                  <div className="w-full max-w-[300px]">
                    <ScreenshotPlaceholder
                      src="/contractor_mobile_portal.png?v=3"
                      alt="פורטל הקבלן להגשת הצעת מחיר מהנייד"
                      aspectRatio="9/16"
                      objectFit="contain"
                      title="פורטל קבלנים ללא צורך בהתחברות"
                      badge="חוויית קבלן ב-60 שניות"
                      filename="public/contractor_mobile_portal.png"
                      mockType="contractor-portal"
                      onClick={() => setLightboxImage({
                        src: '/contractor_mobile_portal.png?v=3',
                        alt: 'פורטל הקבלן להגשת הצעת מחיר מהנייד ב-TikTak',
                        title: 'פורטל קבלנים להגשת הצעה מהנייד'
                      })}
                    />
                  </div>
                </div>
                <div className="lg:col-span-6 xl:col-span-7 space-y-4 text-xs font-medium text-slate-700">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>🚀</span>
                      <span className="text-emerald-700">אפס חיכוך לקבלנים (Zero-Barrier)</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      קבלנים לא אוהבים להירשם או להוריד אפליקציות. הקישור האישי מאפשר להם לפתוח את הפורטל בנייד, לצפות בתיאור התקלה ובתמונות ברזולוציה מלאה, ולהגיש מחיר תוך דקה.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>🔒</span>
                      <span className="text-blue-700">מחיר נעול ותנאים ברורים מראש</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      הקבלן מצהיר האם המחיר כולל מע"מ, מציין את מספר ימי העבודה ותקופת האחריות. אין "הפתעות" ביום הביצוע.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>📎</span>
                      <span className="text-purple-700">העלאת קובץ הצעת מחיר וביטוחים</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      קבלנים שמעוניינים לצרף הצעת מחיר מפורטת ב-PDF או פוליסת ביטוח בתוקף יכולים להעלות קובץ ישירות מהסמארטפון.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: WhatsApp Dispatch */}
            {rfqShowcaseTab === 'whatsapp' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-6 xl:col-span-5 flex justify-center">
                  <div className="w-full max-w-[300px]">
                    <ScreenshotPlaceholder
                      src="/whatsapp_notification_preview.png?v=3"
                      alt="פנייה והתראת וואטסאפ לקבלן להגשת הצעת מחיר"
                      aspectRatio="9/16"
                      objectFit="contain"
                      title="הזמנת קבלן למכרז בוואטסאפ"
                      badge="הפצה ישירה ב-WhatsApp"
                      filename="public/whatsapp_notification_preview.png"
                      mockType="whatsapp-notification"
                      onClick={() => setLightboxImage({
                        src: '/whatsapp_notification_preview.png?v=3',
                        alt: 'הזמנת קבלן למכרז בוואטסאפ ב-TikTak',
                        title: 'פנייה והתראה ישירה לקבלן בוואטסאפ'
                      })}
                    />
                  </div>
                </div>
                <div className="lg:col-span-6 xl:col-span-7 space-y-4 text-xs font-medium text-slate-700">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>📲</span>
                      <span className="text-emerald-700">הפצה ישירה לקבלן ב-WhatsApp בלחיצה</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      המערכת מפיקה קישור wa.me רשמי ומעוצב עם כותרת המכרז, הכתובת, מהות התקלה ותאריך יעד להגשה.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>⏱️</span>
                      <span className="text-blue-700">חיסכון של שעות שיחה וטלפונים</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      במקום להסביר בעל פה ל-4 קבלנים שונים מה התקלה, כל קבלן מקבל את כל הפרטים והתמונות ישירות לשיחה האישית שלו.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>🔔</span>
                      <span className="text-purple-700">עדכון מיידי לוועד בעת הגשת הצעה</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      ברגע שהקבלן מגיש את הצעתו בפורטל, מנהל המבנה מקבל התראה אוטומטית והנתונים נקלטים מיד במטריצת ההשוואה.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Bids Matrix */}
            {rfqShowcaseTab === 'matrix' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8">
                  <ScreenshotPlaceholder
                    src="/rfq_comparison_preview.png?v=3"
                    alt="מטריצת השוואת הצעות מחיר מקבלנים"
                    aspectRatio="16/10"
                    objectFit="contain"
                    title="מטריצת השוואת הצעות מחיר (RFQ)"
                    badge="מטריצה מרוכזת"
                    filename="public/rfq_comparison_preview.png"
                    mockType="rfq-matrix"
                    onClick={() => setLightboxImage({
                      src: '/rfq_comparison_preview.png?v=3',
                      alt: 'מטריצת השוואת הצעות מחיר מקבלנים',
                      title: 'מטריצת השוואת הצעות מחיר (RFQ)'
                    })}
                  />
                </div>
                <div className="lg:col-span-4 space-y-4 text-xs font-medium text-slate-700">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>💰</span>
                      <span className="text-emerald-700">זיהוי אוטומטי של ההצעה הזולה</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      המערכת מחשבת מחיר סופי (כולל/לפני מע"מ) ומסמנת את ההצעה האטרקטיבית ביותר. אם הוועד בוחר בהצעה יקרה יותר (עקב אחריות ארוכה או ניסיון מוכח), המערכת מתעדת את הנימוק להגנה משפטית.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>⚡</span>
                      <span className="text-blue-700">סגירת פנייה והודעה לקבלנים בלחיצה</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      בחירת הזוכה מעדכנת את התקלה, שולחת הודעת תודה מותאמת לספקים שלא נבחרו, ומפיקה מיד הסכם עבודה משפטי.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Signed Contract */}
            {rfqShowcaseTab === 'contract' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8">
                  <ScreenshotPlaceholder
                    src="/work_order_contract_preview.png?v=3"
                    alt="הסכם עבודה והזמנה מחייבת שהופקה ב-TikTak"
                    aspectRatio="4/3"
                    objectFit="contain"
                    title="הסכם עבודה והזמנה מחייבת (Work Order)"
                    badge="הסכם משפטי להדפסה / PDF"
                    filename="public/work_order_contract_preview.png"
                    mockType="contract"
                    onClick={() => setLightboxImage({
                      src: '/work_order_contract_preview.png?v=3',
                      alt: 'הסכם עבודה והזמנה מחייבת שהופקה ב-TikTak',
                      title: 'הסכם עבודה והזמנה מחייבת (Work Order)'
                    })}
                  />
                </div>
                <div className="lg:col-span-4 space-y-4 text-xs font-medium text-slate-700">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>📄</span>
                      <span className="text-amber-700">הזמנת עבודה מותאמת לסטנדרט הישראלי</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      המסמך כולל ח.פ./ת.ז. של הקבלן, פרטי איש הקשר בוועד, מפרט העבודה המוסכם, לוחות זמנים, תנאי תשלום בגמר העבודה ופינוי פסולת.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                      <span>📲</span>
                      <span className="text-blue-700">שליחה ישירה לקבלן לחתימה בוואטסאפ</span>
                    </div>
                    <p className="leading-relaxed text-slate-600">
                      בלחיצת כפתור אחת מופק קישור WhatsApp ישיר לקבלן עם סיכום התנאים וקישור דיגיטלי למסמך.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 5. PRICING: ANNUAL RFQ CREDIT BANK */}
      <section id="pricing" className="py-20 md:py-28 bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black uppercase tracking-wider">
              {isRtl ? 'מודל רישוי שנתי' : 'Annual License Tiers'}
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              {isRtl ? 'מחירון בנק מכרזים שנתי' : 'Annual RFQ Credit Bank Pricing'}
            </h2>
            <p className="text-base text-slate-600 font-medium">
              {isRtl
                ? 'שיפוצים ועבודות קבלניות הם עונתיים. לכן מודל ה-RFQ פועל כבנק פניות שנתי מותאם לתקציב אסיפת הדיירים, עם צבירת יתרות לשנה הבאה (Rollover).'
                : 'Capital repairs are seasonal (autumn waterproofing, spring painting). The RFQ module operates as a pre-paid annual credit bank aligned with annual AGM budgets, with rollover of unused credits.'}
            </p>
          </div>

          {/* Pricing Table Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 sm:p-10 space-y-8 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-black text-[11px] uppercase">
                    <th className="py-3 px-3">{isRtl ? 'חבילת מכרזים' : 'RFQ Tier'}</th>
                    <th className="py-3 px-3">{isRtl ? 'הקצאה שנתית' : 'Allocation'}</th>
                    <th className="py-3 px-3">{isRtl ? 'מחיר שנתי' : 'Annual Fee'}</th>
                    <th className="py-3 px-3">{isRtl ? 'עלות אפקטיבית למכרז' : 'Rate per RFQ'}</th>
                    <th className="py-3 px-3">{isRtl ? 'פעולה' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold text-slate-700">
                  <tr className="hover:bg-white transition-colors">
                    <td className="py-4 px-3 font-black text-slate-900">RFQ Starter</td>
                    <td className="py-4 px-3">{isRtl ? '5 מכרזים בשנה' : '5 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-700">₪249 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-500">₪49.80 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-600 hover:text-white border border-slate-300 text-slate-700 text-xs font-black transition-all cursor-pointer shadow-2xs"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-white transition-colors">
                    <td className="py-4 px-3 font-black text-slate-900">RFQ Basic</td>
                    <td className="py-4 px-3">{isRtl ? '10 מכרזים בשנה' : '10 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-700">₪449 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-500">₪44.90 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-600 hover:text-white border border-slate-300 text-slate-700 text-xs font-black transition-all cursor-pointer shadow-2xs"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  {/* Standard Tier */}
                  <tr className="bg-emerald-50/70 hover:bg-emerald-50 transition-colors border-y-2 border-emerald-500">
                    <td className="py-4 px-3 font-black text-slate-900 flex items-center gap-2">
                      <span>RFQ Standard</span>
                      <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black">
                        {isRtl ? 'המומלץ ביותר ⭐' : 'Most Popular ⭐'}
                      </span>
                    </td>
                    <td className="py-4 px-3 font-black text-slate-900">{isRtl ? '15 מכרזים בשנה' : '15 RFQs / year'}</td>
                    <td className="py-4 px-3 font-black text-emerald-700 text-base">₪599 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-emerald-800 font-extrabold">₪39.93 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition-all cursor-pointer"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-white transition-colors">
                    <td className="py-4 px-3 font-black text-slate-900">RFQ Growth</td>
                    <td className="py-4 px-3">{isRtl ? '25 מכרזים בשנה' : '25 RFQs / year'}</td>
                    <td className="py-4 px-3 text-emerald-700">₪899 / {isRtl ? 'שנה' : 'yr'}</td>
                    <td className="py-4 px-3 text-slate-500">₪35.96 / {isRtl ? 'מכרז' : 'RFQ'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-600 hover:text-white border border-slate-300 text-slate-700 text-xs font-black transition-all cursor-pointer shadow-2xs"
                      >
                        {isRtl ? 'בחר חבילה' : 'Select'}
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-white transition-colors">
                    <td className="py-4 px-3 font-black text-slate-900">{isRtl ? 'RFQ Custom / Enterprise' : 'RFQ Custom / Enterprise'}</td>
                    <td className="py-4 px-3">{isRtl ? 'התאמה אישית (N מכרזים)' : 'Custom Allocation'}</td>
                    <td className="py-4 px-3 text-emerald-700">{isRtl ? 'בהתאם למתחם' : 'Custom Quote'}</td>
                    <td className="py-4 px-3 text-slate-500">{isRtl ? 'תמחור כמותי' : 'Volume-tiered'}</td>
                    <td className="py-4 px-3">
                      <button
                        onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-600 hover:text-white border border-slate-300 text-slate-700 text-xs font-black transition-all cursor-pointer shadow-2xs"
                      >
                        {isRtl ? 'צור קשר' : 'Contact'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <span>{isRtl ? 'פניות שלא נוצלו עוברות אוטומטית לשנה הבאה בעת חידוש (Rollover)' : 'Unused RFQ credits roll over into the following year upon renewal'}</span>
              </span>
              <span className="text-slate-700 font-bold">{isRtl ? 'רכישת פניות בודדות (Top-Up / חריגה): החל מ-₪36 למכרז' : 'On-demand top-ups / overage: from ₪36 / RFQ'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ */}
      <section className="py-20 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
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
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden text-right shadow-xs">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-4 flex items-center justify-between text-right font-black text-slate-900 text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="text-slate-400">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-0 text-xs text-slate-600 font-medium leading-relaxed border-t border-slate-100">
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
      <footer className="bg-slate-900 text-slate-400 py-10 text-xs border-t border-slate-950 font-semibold">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div className="flex items-center gap-3">
            <img
              src="/logo_transparent.png"
              alt="TikTak"
              className="h-10 w-auto object-contain brightness-0 invert"
            />
            <span className="font-black text-slate-300 text-xs">TikTak RFQ Procurement Platform</span>
          </div>

          <div className="flex gap-4 font-bold text-slate-400">
            <Link to="/" className="hover:text-white transition-colors">{isRtl ? 'דיווחי תקלות שוטפים' : 'Routine Maintenance'}</Link>
            <a href="#pricing" className="hover:text-white transition-colors">{isRtl ? 'מחירים' : 'Pricing'}</a>
            <a href="mailto:tiktak.report@gmail.com" className="hover:text-white transition-colors">{isRtl ? 'צור קשר' : 'Contact'}</a>
          </div>

          <div className="text-slate-500">© {new Date().getFullYear()} TikTak. All rights reserved.</div>
        </div>
      </footer>

      {/* LEAD CAPTURE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative text-right text-slate-900">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            {isSubmitted ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto font-black">
                  ✓
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  {isRtl ? 'תודה! הפנייה נקלטה בהצלחה 🚀' : 'Request Received 🚀'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  {isRtl
                    ? 'נציג מצוות TikTak יחזור אליכם בהקדם לפתיחת פיילוט במודול המכרזים ללא עלות.'
                    : 'A TikTak representative will contact you shortly to activate your free RFQ pilot.'}
                </p>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md cursor-pointer transition-colors"
                >
                  {isRtl ? 'סגור' : 'Close'}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-black text-slate-900">
                    {isRtl ? 'התחלת פיילוט מודול מכרזים (RFQ)' : 'Start Free RFQ Pilot'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isRtl ? 'השאירו פרטים ונחבר אתכם למערכת המכרזים תוך דקות' : 'Leave your details to access the procurement module'}
                  </p>
                </div>

                {submitError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-700 block">{isRtl ? 'שם מלא' : 'Full Name'} *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={isRtl ? 'לדוגמה: ישראל ישראלי' : 'e.g. John Doe'}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-700 block">{isRtl ? 'טלפון נייד' : 'Mobile Phone'} *</label>
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="050-1234567"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-700 block">{isRtl ? 'כתובת הבניין / המתחם' : 'Building Address'} *</label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isRtl ? 'לדוגמה: רוטשילד 45, תל אביב' : 'e.g. 45 Rothschild, Tel Aviv'}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-700 block">{isRtl ? 'סוג לקוח' : 'Property Type'}</label>
                    <select
                      value={leadType}
                      onChange={(e) => setLeadType(e.target.value as LeadType)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
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

      {/* SCREENSHOT LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[92vh] overflow-auto rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center p-4 text-white"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Lightbox Header Bar */}
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-slate-800 text-xs font-bold text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-base">📸</span>
                <span className="text-white font-black text-sm">{lightboxImage.title}</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">(לחץ על התמונה לזום)</span>
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="סגור"
              >
                <X size={18} />
              </button>
            </div>

            <div className={`p-2 w-full flex items-center justify-center ${isLightboxZoomed ? 'overflow-auto py-6' : 'min-h-[60vh] max-h-[80vh]'}`}>
              <img
                src={lightboxImage.src}
                alt={lightboxImage.alt}
                onClick={() => setIsLightboxZoomed(!isLightboxZoomed)}
                className={`transition-all duration-300 select-none rounded-xl ${
                  isLightboxZoomed
                    ? 'scale-125 sm:scale-150 origin-top cursor-zoom-out my-6 max-h-none block shadow-2xl'
                    : 'w-auto max-w-full h-auto max-h-[78vh] object-contain cursor-zoom-in block shadow-lg'
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
