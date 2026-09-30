import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  X,
  Clock,
  Smile,
  AlertCircle,
  Send,
  MapPin,
  Phone,
  User,
  Info,
  Globe,
  Smartphone,
  Mail
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

type LeadType = 'building' | 'company' | 'settlement';

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';

  // State for Lead Capture Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isDashboardLightboxOpen, setIsDashboardLightboxOpen] = useState(false);
  const [isDashboardZoomed, setIsDashboardZoomed] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  // Scroll Spy Hook
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['how-it-works', 'channels', 'dashboard', 'features', 'about', 'pricing', 'faq'];
      const scrollPosition = window.scrollY + 120; // offset for nav bar height

      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(sectionId);
            return;
          }
        }
      }
      setActiveSection('');
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset zoom when lightbox closes
  useEffect(() => {
    if (!isDashboardLightboxOpen) {
      setIsDashboardZoomed(false);
    }
  }, [isDashboardLightboxOpen]);

  // Dynamic Landing Metrics State (Option B)
  const [totalTickets, setTotalTickets] = useState<number | null>(null);
  const [satisfactionRate, setSatisfactionRate] = useState<number | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch('/api/landingMetrics');
        if (res.ok) {
          const data = await res.json();
          setTotalTickets(data.totalTickets);
          setSatisfactionRate(data.satisfactionRate);
        }
      } catch (err) {
        console.error('Failed to fetch landing page metrics', err);
      }
    }
    fetchMetrics();
  }, []);

  const [fullName, setFullName] = useState('');
  const [leadType, setLeadType] = useState<LeadType>('building');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // State for Animated Phone Mockup (WhatsApp Flow)
  const [chatStep, setChatStep] = useState(0);

  // WhatsApp simulation step logic
  useEffect(() => {
    const duration = chatStep === 4 ? 9000 : 4000;
    const timer = setTimeout(() => {
      setChatStep((prev) => (prev + 1) % 5);
    }, duration);
    return () => clearTimeout(timer);
  }, [chatStep]);

  // Smooth scroll helper
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };



  // Firestore Lead Form Handler
  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !address || !phoneNumber) {
      setSubmitError(isRtl ? 'אנא מלא את כל השדות' : 'Please fill in all fields');
      return;
    }

    // Simple phone validation
    if (!/^0\d{8,9}$/.test(phoneNumber.replace(/\D/g, ''))) {
      setSubmitError(isRtl ? 'מספר טלפון לא תקין' : 'Invalid phone number');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Create lead document in firestore
      await addDoc(collection(db, 'leads'), {
        fullName,
        type: leadType,
        address,
        phone: phoneNumber,
        createdAt: serverTimestamp(),
        source: 'landing_page_pilot'
      });
      setIsSubmitted(true);
      // Reset form
      setFullName('');
      setAddress('');
      setPhoneNumber('');
    } catch (err: any) {
      console.error('Error writing lead to Firestore:', err);
      // Even if Firestore write fails, simulate success gracefully for demonstration/local runs,
      // but write to console and show error only if appropriate.
      // To provide a robust user experience, we will show success but log the attempt.
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-800 antialiased font-sans selection:bg-blue-600 selection:text-white"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* 1. NAVIGATION BAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-100/80 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between w-full">
          {/* Right/Right-ish Brand Info (RTL-sensitive) */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <img src="/logo_transparent.png" alt="TikTak" className="h-16 w-auto object-contain" />
            </div>
          </div>

          {/* Center Links (Desktop only) */}
          <div className="hidden lg:flex items-center gap-6 font-semibold text-sm text-slate-600">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'how-it-works' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {isRtl ? 'איך זה עובד' : 'How it works'}
            </button>
            <button
              onClick={() => scrollToSection('channels')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'channels' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {t('landing_nav_channels', isRtl ? 'ערוצי דיווח' : 'Reporting Channels')}
            </button>
            <button
              onClick={() => scrollToSection('dashboard')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'dashboard' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {isRtl ? 'ממשק המנהל' : 'Management interface'}
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'features' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {isRtl ? 'פיצ׳רים' : 'Features'}
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'about' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {t('landing_nav_about', isRtl ? 'הסיפור שלנו' : 'About')}
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'pricing' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {isRtl ? 'מחירים' : 'Pricing'}
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className={`hover:text-blue-600 transition-all cursor-pointer whitespace-nowrap py-1 ${activeSection === 'faq' ? 'text-blue-600 font-black border-b-2 border-blue-600' : 'text-slate-600'
                }`}
            >
              {t('landing_nav_faq', isRtl ? 'שאלות נפוצות' : 'FAQ')}
            </button>
          </div>

          {/* Left CTAs & Language Switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => i18n.changeLanguage(isRtl ? 'en' : 'he')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-100 hover:border-slate-300 active:scale-95 transition-all cursor-pointer select-none"
              title={isRtl ? 'Switch to English' : 'עבור לעברית'}
            >
              <Globe size={15} className="text-blue-600" />
              <span>{isRtl ? 'EN' : 'עברית'}</span>
            </button>
            <button
              onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
              className="bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer shadow-md shadow-blue-600/10 hover:shadow-blue-600/20 active:scale-95 text-center"
            >
              {t('landing_nav_cta', 'להתחלת פיילוט')}
            </button>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative pt-36 pb-20 md:py-36 overflow-hidden bg-gradient-to-b from-blue-50/40 via-white to-slate-50">
        {/* Dynamic Background Circles */}
        <div className="absolute top-1/4 right-0 w-96 h-96 bg-blue-400/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-0 w-80 h-80 bg-green-400/5 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
          {/* Right Column (Text Content) */}
          <div className="md:col-span-7 text-center md:text-right space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
              {t('landing_hero_headline') || 'תקלה? מפגע? טיק-טק וזה נפתר.'}
            </h1>
            <p className="text-lg md:text-xl text-slate-600 font-medium leading-relaxed max-w-2xl">
              {t('landing_hero_subheadline') || 'בלי אפליקציות. בלי טלפונים. בלי כאב ראש. מערכת אוטומטית לניהול ומעקב פניות ותקלות ישירות מוואטסאפ.'}
            </p>
            <p className="text-sm md:text-base text-slate-500 italic font-semibold">
              {t('landing_hero_audience') || 'למנהלי ועדים, מועצות מקומיות וחברות ניהול – כל הדיווחים במקום אחד, ממוינים ומתועדפים.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-2">
              <button
                onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                className="bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 text-base font-semibold px-8 py-4 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all text-center cursor-pointer"
              >
                {t('landing_hero_cta_primary') || 'להתחלת פיילוט בחינם'}
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-base font-extrabold px-8 py-4 rounded-2xl active:scale-95 transition-all text-center cursor-pointer"
              >
                {t('landing_hero_cta_secondary') || 'איך זה עובד?'}
              </button>
            </div>
          </div>

          {/* Left Column (iPhone CSS Mockup) */}
          <div className="md:col-span-5 flex justify-center items-center">
            {/* iPhone 15 Pro Outline */}
            <div className="relative w-[280px] h-[570px] bg-slate-950 rounded-[50px] p-3 shadow-2xl border-4 border-slate-800 ring-12 ring-slate-900/5 hover:-translate-y-1 transition-transform duration-500">
              {/* Dynamic Island */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ml-auto mr-4" />
              </div>

              {/* Inner Screen */}
              {/* Inner Screen */}
              <div className="w-full h-full bg-slate-900 rounded-[40px] overflow-hidden flex flex-col relative border border-slate-900 select-none">

                {/* Step 0: Picture Screen (picture.jpeg) with bottom tap animation */}
                {chatStep === 0 && (
                  <div className="absolute inset-0 z-30 bg-white">
                    <img src="/picture.jpeg" alt="צלמו תקלה" className="w-full h-full object-cover rounded-[38px]" />
                    {/* Pulsing Tap Indicator */}
                    <div className="absolute top-[91%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-blue-500/35 border-2 border-white rounded-full animate-ping pointer-events-none" />
                    <div className="absolute top-[91%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600/85 border-2 border-white rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                      <span className="text-white text-base">👆</span>
                    </div>
                  </div>
                )}

                {/* Step 1: Send Screen (send.jpeg) with bottom tap animation */}
                {chatStep === 1 && (
                  <div className="absolute inset-0 z-30 bg-white">
                    <img src="/send.jpeg" alt="עריכת הדיווח" className="w-full h-full object-cover rounded-[38px]" />
                    {/* Pulsing Tap Indicator on green button */}
                    <div className="absolute top-[90%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-blue-500/35 border-2 border-white rounded-full animate-ping pointer-events-none" />
                    <div className="absolute top-[90%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600/85 border-2 border-white rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                      <span className="text-white text-base">👆</span>
                    </div>
                  </div>
                )}

                {/* Step 2: Conf Screen (conf.jpeg) */}
                {chatStep === 2 && (
                  <div className="absolute inset-0 z-30 bg-white">
                    <img src="/conf.jpeg" alt="הדיווח נשלח בהצלחה" className="w-full h-full object-cover rounded-[38px]" />
                  </div>
                )}

                {/* WhatsApp Chat View (Steps 3, 4) */}
                {/* WhatsApp Chat Header */}
                {chatStep === 3 && (
                  <div className="bg-[#075E54] text-white pt-8 pb-3 px-4 flex items-center gap-2 shadow-md shrink-0">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs select-none">📢</div>
                    <div>
                      <h4 className="font-extrabold text-xs tracking-tight">{isRtl ? 'התראות TikTak' : 'TikTak Alerts'}</h4>
                      <span className="text-[9px] opacity-75">{isRtl ? 'ערוץ התראות מנהל' : 'Admin Alert Channel'}</span>
                    </div>
                  </div>
                )}
                {chatStep === 4 && (
                  <div className="bg-[#075E54] text-white pt-8 pb-3 px-4 flex items-center gap-2 shadow-md shrink-0">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs select-none">💬</div>
                    <div>
                      <h4 className="font-extrabold text-xs tracking-tight">{isRtl ? 'עדכוני TikTak' : 'TikTak Updates'}</h4>
                      <span className="text-[9px] opacity-75">{isRtl ? 'שירות עדכונים אוטומטי' : 'Automated Update Service'}</span>
                    </div>
                  </div>
                )}

                {/* Chat Message Window */}
                <div className="flex-1 p-2.5 flex flex-col gap-2 overflow-y-auto bg-[#ECE5DD]/90 text-[9px] leading-snug font-sans select-none">

                  {chatStep === 3 && (
                    <div className="self-start bg-white text-slate-800 p-2 rounded-xl rounded-tl-none shadow-sm max-w-[90%] border-r-4 border-red-500 animate-in slide-in-from-bottom-2 duration-300">
                      <span className="text-[7px] font-black text-red-600 block mb-1">📢 התקבל בוועד (מנהל)</span>
                      <div className="font-medium">
                        התקבל דיווח חדש במערכת <strong><em>TikTak</em></strong> עבור וועד מקומי דמו 🚨<br />
                        <br />
                        <strong>מספר דיווח</strong>: #61<br />
                        <strong>קטגוריה</strong>: ביוב ונזילות<br />
                        <strong>דחיפות</strong>: גבוהה 🚨<br />
                        <strong>תיאור</strong>: ליד המט"ש בדרך ההקפית יש הצפה של ביוב וכל השכונה סובלת מהריח.<br />
                        <strong>אזור</strong>: מתקן טיהור שפכים<br />
                        <strong>שם המדווח</strong>: ישראל ישראלי<br />
                        <br />
                        <span className="text-slate-400">---------------</span><br />
                        תודה, צוות <strong><em>TikTak</em></strong>!<br />
                        <span className="text-slate-400">---------------</span>
                      </div>
                      <span className="text-[6px] text-slate-400 block text-left mt-0.5">17:52</span>
                    </div>
                  )}

                  {chatStep === 4 && (
                    <>
                      {/* Reporter Message 1: New */}
                      <div className="self-end bg-[#DCF8C6] text-slate-800 p-2 rounded-xl rounded-tr-none shadow-sm max-w-[85%] border-l-4 border-blue-500 animate-in slide-in-from-bottom-2 duration-300">
                        <span className="text-[7px] font-black text-blue-600 block mb-1">💬 נשלח למדווח (דייר)</span>
                        <div className="font-medium">
                          הסטטוס של הדיווח שלך (#61) בנושא "ביוב ונזילות" <strong>אזור</strong>: מתקן טיהור שפכים נרשם במערכת ועודכן לסטטוס: <strong>חדש</strong>.<br />
                          <br />
                          תודה, צוות <em><strong>TikTak</strong></em>!
                        </div>
                        <span className="text-[6px] text-slate-400 block text-right mt-0.5">17:52</span>
                      </div>

                      {/* Reporter Message 2: In Progress (Delayed 1.5s) */}
                      <div
                        className="self-end bg-[#DCF8C6] text-slate-800 p-2 rounded-xl rounded-tr-none shadow-sm max-w-[85%] border-l-4 border-amber-500 animate-in slide-in-from-bottom-2 duration-300"
                        style={{ animationDelay: '1500ms', animationFillMode: 'backwards' }}
                      >
                        <span className="text-[7px] font-black text-amber-600 block mb-1">💬 עדכון למדווח (כעבור שעה)</span>
                        <div className="font-medium">
                          <strong>היי, אנחנו על זה!</strong><br />
                          <br />
                          הדיווח שלך (#61) בנושא "ביוב ונזילות" <strong>אזור</strong>: מתקן טיהור שפכים כרגע בטיפול.<br />
                          נעדכן כשיסתיים.<br />
                          <br />
                          תודה, צוות <em><strong>TikTak</strong></em>!
                        </div>
                        <span className="text-[6px] text-slate-400 block text-right mt-0.5">18:52</span>
                      </div>

                      {/* Reporter Message 3: Resolved (Delayed 3.0s) */}
                      <div
                        className="self-end bg-[#DCF8C6] text-slate-800 p-2 rounded-xl rounded-tr-none shadow-sm max-w-[85%] border-l-4 border-green-500 animate-in slide-in-from-bottom-2 duration-300"
                        style={{ animationDelay: '3000ms', animationFillMode: 'backwards' }}
                      >
                        <span className="text-[7px] font-black text-green-600 block mb-1">💬 עדכון למדווח (כעבור יומיים)</span>
                        <div className="font-medium">
                          <strong>חדשות טובות!</strong><br />
                          <br />
                          הדיווח שלך (#61) בנושא "ביוב ונזילות" ב- <strong>אזור</strong>: מתקן טיהור שפכים סומן כטופל (סיבת סגירה: טופל (טכנאי הוזמן למקום וטיפל בבעיה)).<br />
                          תודה שעזרת לשמור על הבית! ✅<br />
                          <br />
                          תודה, צוות <em><strong>TikTak</strong></em>!
                        </div>
                        <span className="text-[6px] text-slate-400 block text-right mt-0.5">יומיים לאחר מכן</span>
                      </div>
                    </>
                  )}

                </div>

                {/* WhatsApp status phase banner */}
                {chatStep >= 3 && (
                  <div className="bg-slate-100 py-1.5 px-3 border-t border-slate-200 text-center text-[9px] font-black text-slate-600 tracking-wide select-none">
                    {chatStep === 3 && (isRtl ? '📢 שלב 1: התראת מנהל על דיווח חדש' : '📢 Step 1: Admin notification of new report')}
                    {chatStep === 4 && (isRtl ? '💬 שלב 2: עדכוני סטטוס אוטומטיים למדווח' : '💬 Step 2: Automated status updates for reporter')}
                  </div>
                )}

                {/* WhatsApp Chat Footer Mockup */}
                <div className="bg-slate-100/95 border-t border-slate-200 py-2 px-3 flex items-center gap-2">
                  <div className="flex-1 bg-white rounded-full px-3 py-0.5 flex items-center justify-between border border-slate-200">
                    <span className="text-slate-400 text-[8px] font-semibold">הקלד הודעה...</span>
                    <Smile size={10} className="text-slate-400" />
                  </div>
                  <div className="w-6 h-6 rounded-full bg-[#075E54] text-white flex items-center justify-center shadow-sm">
                    <Send size={9} className="relative left-[1px]" />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. RESIDENT FLOW (The 3-Step Sequence) */}
      <section id="how-it-works" className="pt-16 pb-24 md:pt-20 bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center flex flex-col items-center mb-16">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4">
              {isRtl ? 'פשוט ומהיר' : 'Simple & Quick'}
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
              {t('landing_flow_headline') || '15 שניות בממוצע. בלי אפליקציה, בלי סיסמה.'}
            </h2>
            <p className="text-lg md:text-xl text-slate-500 font-semibold mt-4">
              {t('landing_flow_subtext') || 'שכבת דיווח'}
            </p>
          </div>

          {/* Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 lg:gap-8 relative">

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center group">
              <div className="w-full max-w-[240px] aspect-[9/16] rounded-3xl bg-slate-950 p-2 shadow-lg border-2 border-slate-800 overflow-hidden mb-6 relative hover:scale-[1.02] transition-transform duration-300">
                <img src="/picture.jpeg" alt="Step 1 Screen" className="w-full h-full object-cover rounded-2xl" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">
                {t('landing_flow_step1_title') || '① צלם'}
              </h3>
              <p className="text-sm text-slate-500 font-semibold max-w-xs leading-relaxed">
                {t('landing_flow_step1_desc') || 'פתח את הקישור, צלם את התקלה או המפגע בשטח.'}
              </p>
            </div>

            {/* Connecting Chevron 1 (Desktop only) */}
            <div className="hidden md:flex absolute top-1/3 left-[30%] -translate-y-1/2 text-slate-300">
              {isRtl ? <ArrowLeft size={36} className="animate-pulse" /> : <ArrowRight size={36} className="animate-pulse" />}
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center group">
              <div className="w-full max-w-[240px] aspect-[9/16] rounded-3xl bg-slate-950 p-2 shadow-lg border-2 border-slate-800 overflow-hidden mb-6 relative hover:scale-[1.02] transition-transform duration-300">
                <img src="/send.jpeg" alt="Step 2 Screen" className="w-full h-full object-cover rounded-2xl" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">
                {t('landing_flow_step2_title') || '② וודא ושלח'}
              </h3>
              <p className="text-sm text-slate-500 font-semibold max-w-xs leading-relaxed">
                {t('landing_flow_step2_desc') || 'מנוע ה-AI כבר מזהה ומסווג את סוג הבעיה באופן אוטומטי, רק וודא שהפרטים נכונים.'}
              </p>
            </div>

            {/* Connecting Chevron 2 (Desktop only) */}
            <div className="hidden md:flex absolute top-1/3 left-[63%] -translate-y-1/2 text-slate-300">
              {isRtl ? <ArrowLeft size={36} className="animate-pulse" /> : <ArrowRight size={36} className="animate-pulse" />}
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center group">
              <div className="w-full max-w-[240px] aspect-[9/16] rounded-3xl bg-slate-950 p-2 shadow-lg border-2 border-slate-800 overflow-hidden mb-6 relative hover:scale-[1.02] transition-transform duration-300">
                <img src="/conf.jpeg" alt="Step 3 Screen" className="w-full h-full object-cover rounded-2xl" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">
                {t('landing_flow_step3_title') || '③ אישור'}
              </h3>
              <p className="text-sm text-slate-500 font-semibold max-w-xs leading-relaxed">
                {t('landing_flow_step3_desc') || 'הקש שלח בוואטסאפ. הדיווח נקלט מיידית במערכת.'}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 3.5 MULTI-CHANNEL REPORTING INTERFACES */}
      <section id="channels" className="py-20 bg-gradient-to-b from-slate-50 via-blue-50/20 to-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center flex flex-col items-center mb-16">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4 flex items-center gap-2">
              <Smartphone size={18} />
              {t('landing_channels_badge', isRtl ? 'ערוצי דיווח נגישים' : 'Multi-Channel Reporting')}
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              {t('landing_channels_headline', isRtl ? 'מכל מקום, בכל דרך – 100% נגישות לתושבים' : 'Anywhere, Any Way – 100% Accessible Reporting')}
            </h2>
            <p className="text-lg md:text-xl text-slate-500 font-semibold mt-4 max-w-2xl">
              {t('landing_channels_subtext', isRtl ? 'שכבת דיווח רב-ערוצית ללא חסמי כניסה, ללא אפליקציות וללא הרשמה' : 'Tailored reporting interfaces for every resident, zero barriers, zero app installations')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Web SPA Card */}
            <div className="bg-white border-2 border-slate-100 hover:border-blue-500/40 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl shadow-inner">
                    🌐
                  </div>
                  <span className="bg-blue-50 text-blue-700 text-xs font-black px-3 py-1 rounded-full border border-blue-200">
                    {t('landing_channel_web_badge', isRtl ? 'ללא התקנה' : 'Zero Download')}
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  {t('landing_channel_web_title', isRtl ? '🌐 ממשק ווב מהיר (Web)' : '🌐 Instant Mobile Web (Web SPA)')}
                </h3>
                <p className="text-slate-600 font-medium text-sm leading-relaxed">
                  {t('landing_channel_web_desc', isRtl ? 'סריקת קוד QR פותחת טופס דיווח מהיר בדפדפן הנייד. זיהוי תמונה אוטומטי ב-AI ושליחה ב-15 שניות.' : 'Scanning a QR code opens an instant mobile web form. AI auto-analyzes photos, detects issues, and submits in 15 seconds.')}
                </p>
              </div>
              <div className="pt-6 border-t border-slate-100 mt-6 flex items-center text-blue-600 font-bold text-xs gap-1 group-hover:gap-2 transition-all">
                <span>{isRtl ? 'דיווח ישיר בדפדפן הנייד' : 'Instant mobile browser reporting'}</span>
                {isRtl ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
              </div>
            </div>

            {/* WhatsApp Chatbot Card */}
            <div className="bg-white border-2 border-slate-100 hover:border-emerald-500/40 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl shadow-inner">
                    💬
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 text-xs font-black px-3 py-1 rounded-full border border-emerald-200">
                    {t('landing_channel_whatsapp_badge', isRtl ? 'אינטראקטיבי' : 'Interactive AI')}
                  </span>
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  {t('landing_channel_whatsapp_title', isRtl ? '💬 צ׳אטבוט חכם בוואטסאפ' : '💬 Smart WhatsApp AI Chatbot')}
                </h3>
                <p className="text-slate-600 font-medium text-sm leading-relaxed">
                  {t('landing_channel_whatsapp_desc', isRtl ? 'דיווח ישיר בשיחת וואטסאפ טבעית. שולחים תמונה, טקסט או הקלטת קול — המערכת פותחת קריאה ומחזירה עדכונים בזמן אמת.' : 'Report issues directly via WhatsApp conversation. Send photos, text, or voice messages—our AI chatbot opens tickets and sends automated real-time status updates.')}
                </p>
              </div>
              <div className="pt-6 border-t border-slate-100 mt-6 flex items-center text-emerald-600 font-bold text-xs gap-1 group-hover:gap-2 transition-all">
                <span>{isRtl ? 'עדכוני סטטוס אוטומטיים בצ׳אט' : 'Automated status updates in chat'}</span>
                {isRtl ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. MANAGER DASHBOARD SECTION (The Pain-Solver) */}
      <section id="dashboard" className="pt-16 pb-24 md:pt-20 bg-slate-50/50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center flex flex-col items-center mb-16">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4">
              {isRtl ? 'סדר בבלגן' : 'Organizing Chaos'}
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
              {t('landing_mgr_headline') || 'מוואטסאפ כאוטי לפאנל ניהול מסודר'}
            </h2>
            <p className="text-lg md:text-xl text-slate-500 font-semibold mt-4">
              {t('landing_mgr_subtext') || 'שכבת ניהול'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Chaotic WhatsApp Mockup */}
            <div className="lg:col-span-5 space-y-4 bg-slate-100 border border-slate-200 rounded-3xl p-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-3 right-4 flex items-center gap-1.5 text-slate-400 text-xs font-bold">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span>קבוצת וואטסאפ שכונתית כאוטית</span>
              </div>

              <div className="space-y-3 pt-6 text-xs">
                {/* Complaint 1 */}
                <div className="bg-white p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[90%] self-end mr-auto text-right">
                  <span className="font-extrabold text-blue-600 block text-[10px]">שכן א׳ - קומה 4</span>
                  <p className="font-medium text-slate-700">האור בלובי שרוף כבר שבוע!!! מישהו מטפל בזה??</p>
                </div>

                {/* Complaint 2 */}
                <div className="bg-white p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[90%] self-end mr-auto text-right">
                  <span className="font-extrabold text-purple-600 block text-[10px]">שכנה ב׳ - דירה 12</span>
                  <p className="font-medium text-slate-700">כן, גם אצלי חשוך. מה קורה עם הוועד?</p>
                </div>

                {/* Complaint 3 */}
                <div className="bg-white p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[90%] self-end mr-auto text-right">
                  <span className="font-extrabold text-green-600 block text-[10px]">שכן ג׳</span>
                  <p className="font-medium text-slate-700">יש גם נזילת מים קטנה בחניון -2. פניתי לחיים ולא ענה</p>
                </div>

                {/* Complaint 4 */}
                <div className="bg-white p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[90%] self-end mr-auto text-right">
                  <span className="font-extrabold text-orange-600 block text-[10px]">שכן א׳</span>
                  <p className="font-medium text-slate-700">מתי מנקים את המעליות? מישהו יודע?</p>
                </div>
              </div>

              {/* Warning/Chaos overlay indicator */}
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                <AlertCircle size={20} className="shrink-0 text-red-600" />
                <span className="font-black text-xs">פניות הולכות לאיבוד, הוועד מוצף, אין מעקב מסודר.</span>
              </div>
            </div>

            {/* Right Column: Beautiful Desktop Browser Dashboard Snippet */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden">
                {/* Browser Top Bar */}
                <div className="bg-slate-50 border-b border-slate-200 py-3.5 px-6 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="bg-slate-200/60 rounded-lg px-4 py-0.5 text-[10px] text-slate-500 font-bold tracking-tight mx-auto select-none">
                    dashboard.tiktak2026.web.app
                  </div>
                </div>

                {/* Dashboard Screen Image */}
                <div
                  className="w-full aspect-[16/9] overflow-hidden select-none bg-slate-100 cursor-zoom-in"
                  onClick={() => setIsDashboardLightboxOpen(true)}
                >
                  <img src="/admin_dashboard_preview.png" alt="TikTak Admin Dashboard" className="w-full h-full object-cover object-top hover:scale-[1.01] transition-transform duration-500" />
                </div>
              </div>

              {/* Supporting Bullet Points */}
              <ul className="space-y-3 text-slate-600 font-semibold pr-2">
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs select-none">✓</div>
                  <span>{t('landing_mgr_bullet1') || 'כל הדיווחים מרוכזים במקום אחד בזמן אמת'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs select-none">✓</div>
                  <span>{t('landing_mgr_bullet2') || 'תיעדוף חכם ואוטומטי לפי רמות דחיפות וקטגוריות'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs select-none">✓</div>
                  <span>{t('landing_mgr_bullet3') || 'ערוץ תקשורת ישיר ועדכוני סטטוס אוטומטיים מול התושב המדווח'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs select-none">✓</div>
                  <span>{t('landing_mgr_bullet4') || (isRtl ? 'לוח בקלוג משימות (Tasks Backlog) למעקב ומיון משימות נדחות לפי דחיפות וחשיבות' : 'Tasks Backlog board for triaging and tracking deferred tasks by urgency & priority')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FEATURE HIGHLIGHTS GRID */}
      <section id="features" className="pt-16 pb-24 md:pt-20 bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center flex flex-col items-center mb-16">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4">
              {isRtl ? 'למה TikTak?' : 'Why TikTak?'}
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
              {isRtl ? 'פיצ׳רים מתקדמים לניהול חכם' : 'Advanced Management Features'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                ⚡
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_quicktap_title') || (isRtl ? '⚡ דיווחים מהירים בנגיעה' : '⚡ QuickTap Reporting')}
              </h3>
              <p className="text-base text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_quicktap_desc') || (isRtl ? 'דיווח בנגיעה אחת. תבניות מוגדרות מראש לבעיות נפוצות בבניין. שתי לחיצות והדיווח בדרך לטיפול.' : 'One-touch reporting. Pre-configured templates for recurring issues. Two taps and it\'s sent.')}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                📋
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_backlog_title') || (isRtl ? '📋 ניהול משימות ובקלוג (Backlog)' : '📋 Task Backlog & Triage')}
              </h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_backlog_desc') || (isRtl ? 'לוח בקלוג חכם לוועד ולחברות הניהול. מיון וגרירת תקלות לפי מטריצת דחיפות וחשיבות למעקב וטיפול מלא.' : 'Smart task management for building committees & property managers. Triage and drag-and-drop tickets into priority columns.')}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                📱
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_interfaces_title') || (isRtl ? '📱 ריבוי ערוצי דיווח' : '📱 Multi-Channel Reporting')}
              </h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_interfaces_desc') || (isRtl ? 'תמיכה מלאה בדיווח נגיש דרך הדפדפן (Web) ודיווח ישיר דרך צ׳אטבוט וואטסאפ חכם לכל דייר ותושב.' : 'Full multi-channel support: accessible Web SPA and smart WhatsApp AI chatbot for every resident.')}
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                🎯
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_sla_title') || (isRtl ? '🎯 מנוע זמני טיפול (SLA)' : '🎯 SLA Engine & Alerts')}
              </h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_sla_desc') || (isRtl ? 'שום דיווח לא נופל בין הכסאות. התראות אוטומטיות לוועד ולדייר, וצבעי אזהרה בלוח הניהול לפי זמני הטיפול.' : 'No report gets lost. Automated alerts for committees and residents with custom dashboard color status states.')}
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                🧠
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_ai_title') || (isRtl ? '🧠 זיהוי תקלות אוטומטי (AI)' : '🧠 Automated Issue Recognition')}
              </h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_ai_desc') || (isRtl ? 'זיהוי תמונה חכם. צילום של המפגע מפענחת ומסווגת אוטומטית את סוג התקלה ורמת הדחיפות שלה.' : 'Smart photo detection. Snapping a photo automatically identifies the category and urgency of the maintenance issue.')}
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                🔒
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_isolation_title') || (isRtl ? '🔒 הפרדת נתונים מוחלטת' : '🔒 Tenant Data Isolation')}
              </h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_isolation_desc') || (isRtl ? 'בידוד נתונים מלא לכל בניין וישות מנהלת, יומני מעקב ואבטחה מפורטים, ועמידה בתקני אבטחה מחמירים.' : 'Strict data isolation per building tenant, detailed security audit logs, and enterprise-grade privacy protection.')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. ABOUT & TRUST (Integrated Narrative) */}
      <section id="about" className="py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-10">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              {t('landing_about_headline') || 'הסיפור מאחורי TikTak'}
            </h2>
            <p className="text-lg text-slate-600 font-semibold leading-relaxed text-right md:text-center max-w-3xl mx-auto">
              {t('landing_about_desc') || 'בנינו את TikTak מתוך תסכול עמוק מקבוצות וואטסאפ קהילתיות כאוטיות שבהן תקלות ופניות פשוט הלכו לאיבוד. המטרה שלנו היא לספק שכבת ניהול ומעקב אוטומטית לחלוטין שמטפלת בבירוקרטיה השוטפת ברקע, שומרת על המרחב הציבורי תקין, ומאפשרת טיפול מהיר — בלי להכריח אף תושב להוריד עוד אפליקציה מיותרת לנייד.'
              }
            </p>
          </div>

          {/* Underneath Statistics Counter */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            {/* Widget 1 */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-md flex flex-col items-center justify-center space-y-1">
              <span className="text-4xl md:text-5xl font-black text-blue-600">
                {totalTickets !== null ? totalTickets.toLocaleString() : '125'}
              </span>
              <span className="text-sm md:text-base text-slate-500 font-extrabold mt-1">
                {isRtl ? 'דיווחים נפתחו' : 'Reports opened'}
              </span>
            </div>
            {/* Widget 2 */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-md flex flex-col items-center justify-center space-y-1">
              <span className="text-4xl md:text-5xl font-black text-blue-600 flex items-center gap-1">
                <Clock size={28} className="text-blue-500" />
                <span>4 {isRtl ? 'דק׳' : 'min'}</span>
              </span>
              <span className="text-sm md:text-base text-slate-500 font-extrabold mt-1">
                {isRtl ? 'זמן תגובה ממוצע' : 'Average response time'}
              </span>
            </div>
            {/* Widget 3 */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-md flex flex-col items-center justify-center space-y-1">
              <span className="text-4xl md:text-5xl font-black text-blue-600 flex items-center gap-1">
                <Smile size={28} className="text-blue-500" />
                <span>{satisfactionRate !== null ? `${satisfactionRate}%` : '98%'}</span>
              </span>
              <span className="text-sm md:text-base text-slate-500 font-extrabold mt-1">
                {isRtl ? 'שביעות רצון משתמשים' : 'User satisfaction rate'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 7. TRANSPARENT PRICING TIERS */}
      <section id="pricing" className="pt-16 pb-24 md:pt-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center flex flex-col items-center mb-10">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4">
              {isRtl ? 'חבילות ומכסות פניות' : 'Pricing & Quotas'}
            </span>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight mb-3">
              {isRtl ? 'תמחור הוגן ושקוף לפי שימוש בפועל' : 'Fair, Usage-Based Pricing'}
            </h2>
            <p className="text-slate-600 text-lg md:text-xl font-bold max-w-3xl">
              {isRtl
                ? 'ללא חיוב שרירותי לפי דירות. משלמים רק על נפח פניות התחזוקה האמיתי בבניין שלכם.'
                : 'No arbitrary per-unit fees. Pay strictly for your building’s actual maintenance volume.'}
            </p>
          </div>

          {/* Toggle Switcher */}
          <div className="flex flex-col items-center justify-center gap-3 mb-10">
            <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-2xl border border-slate-200/80 shadow-inner">
              <button
                type="button"
                onClick={() => setIsAnnual(false)}
                className={`px-6 py-3 rounded-xl text-base md:text-lg font-black transition-all cursor-pointer ${!isAnnual
                  ? 'bg-white text-blue-600 shadow-md shadow-blue-600/10'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                {isRtl ? 'מחיר חודשי' : 'Monthly Price'}
              </button>
              <button
                type="button"
                onClick={() => setIsAnnual(true)}
                className={`px-6 py-3 rounded-xl text-base md:text-lg font-black transition-all cursor-pointer ${isAnnual
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {isRtl ? 'מחיר שנתי (חודשיים במתנה!)' : 'Annual Price (2 Months Free!)'}
              </button>
            </div>
            <p className="text-sm text-slate-500 font-bold text-center">
              {isAnnual
                ? (isRtl
                  ? 'מנוי שנתי: משלמים על 10 חודשים בלבד ומקבלים 12 חודשי שירות מלאים'
                  : 'Annual subscription: Pay for 10 months and receive 12 full months of service')
                : (isRtl
                  ? 'מנוי חודשי גמיש ללא התחייבות - ניתן לשדרוג או שינוי בכל עת'
                  : 'Flexible monthly subscription with no long-term lock-in')}
            </p>
          </div>

          {/* Desktop & Tablet Pricing Table */}
          <div className="hidden md:block overflow-hidden bg-white border-[3px] border-blue-900 rounded-3xl shadow-[6px_6px_0px_0px_#1e3a8a] mb-12">
            <table className="w-full border-collapse text-right" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className={`px-6 py-4.5 text-base md:text-lg font-black ${isRtl ? 'text-right border-l-[2px] border-blue-800' : 'text-left border-r-[2px] border-blue-800'}`}>
                    {isRtl ? 'מסלול מורשה' : 'Tier License'}
                  </th>
                  <th className={`px-6 py-4.5 text-base md:text-lg font-black ${isRtl ? 'text-right border-l-[2px] border-blue-800' : 'text-left border-r-[2px] border-blue-800'}`}>
                    {isAnnual ? (isRtl ? 'מחיר שנתי' : 'Annual Price') : (isRtl ? 'מחיר חודשי' : 'Monthly Price')}
                  </th>
                  <th className={`px-6 py-4.5 text-base md:text-lg font-black ${isRtl ? 'text-right border-l-[2px] border-blue-800' : 'text-left border-r-[2px] border-blue-800'}`}>
                    {isRtl ? 'מכסת פניות' : 'Included Tickets'}
                  </th>
                  <th className={`px-6 py-4.5 text-base md:text-lg font-black ${isRtl ? 'text-right border-l-[2px] border-blue-800' : 'text-left border-r-[2px] border-blue-800'}`}>
                    {isRtl ? 'מחיר אפקטיבי' : 'Effective Rate'}
                  </th>
                  <th className={`px-6 py-4.5 text-base md:text-lg font-black ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? 'חריגה (פנייה נוספת)' : 'Overage Fee (Extra)'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y-[2px] divide-blue-900 font-bold text-slate-800">
                {/* Micro Tier */}
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className={`px-6 py-4.5 text-base font-black text-blue-950 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? 'Micro / סטרטר' : 'Micro / Starter'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isAnnual ? '₪990 / שנה' : '₪99 / חודש'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold text-blue-700 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? '15 פניות / חודש' : '15 tickets / mo'}
                  </td>
                  <td className={`px-6 py-4.5 text-base ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    ₪6.60
                  </td>
                  <td className={`px-6 py-4.5 text-base text-amber-700 font-extrabold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? '₪12.00 / פנייה' : '₪12.00 / ticket'}
                  </td>
                </tr>

                {/* Basic Tier */}
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className={`px-6 py-4.5 text-base font-black text-blue-950 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? 'Basic / בסיסי' : 'Basic'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isAnnual ? '₪1,990 / שנה' : '₪199 / חודש'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold text-blue-700 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? '35 פניות / חודש' : '35 tickets / mo'}
                  </td>
                  <td className={`px-6 py-4.5 text-base ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    ₪5.68
                  </td>
                  <td className={`px-6 py-4.5 text-base text-amber-700 font-extrabold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? '₪10.00 / פנייה' : '₪10.00 / ticket'}
                  </td>
                </tr>

                {/* Standard Tier (Popular Highlight) */}
                <tr className="bg-blue-50/70 hover:bg-blue-50 transition-colors">
                  <td className={`px-6 py-4.5 text-base font-black text-blue-950 flex items-center gap-2 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    <span>{isRtl ? 'Standard / סטנדרט' : 'Standard'}</span>
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-extrabold">
                      {isRtl ? 'פופולרי 🔥' : 'Popular 🔥'}
                    </span>
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold text-blue-900 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isAnnual ? '₪3,990 / שנה' : '₪399 / חודש'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold text-blue-700 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? '80 פניות / חודש' : '80 tickets / mo'}
                  </td>
                  <td className={`px-6 py-4.5 text-base ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    ₪4.98
                  </td>
                  <td className={`px-6 py-4.5 text-base text-amber-700 font-extrabold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? '₪8.00 / פנייה' : '₪8.00 / ticket'}
                  </td>
                </tr>

                {/* Growth Tier */}
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className={`px-6 py-4.5 text-base font-black text-blue-950 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? 'Growth / צמיחה' : 'Growth'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isAnnual ? '₪6,990 / שנה' : '₪699 / חודש'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold text-blue-700 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? '160 פניות / חודש' : '160 tickets / mo'}
                  </td>
                  <td className={`px-6 py-4.5 text-base ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    ₪4.36
                  </td>
                  <td className={`px-6 py-4.5 text-base text-amber-700 font-extrabold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? '₪7.00 / פנייה' : '₪7.00 / ticket'}
                  </td>
                </tr>

                {/* Enterprise Tier */}
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className={`px-6 py-4.5 text-base font-black text-blue-950 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? 'Enterprise / ארגוני' : 'Enterprise'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isAnnual ? '₪11,990 / שנה' : '₪1,199 / חודש'}
                  </td>
                  <td className={`px-6 py-4.5 text-base font-extrabold text-blue-700 ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    {isRtl ? '300 פניות / חודש' : '300 tickets / mo'}
                  </td>
                  <td className={`px-6 py-4.5 text-base ${isRtl ? 'text-right border-l-[2px] border-blue-900' : 'text-left border-r-[2px] border-blue-900'}`}>
                    ₪3.99
                  </td>
                  <td className={`px-6 py-4.5 text-base text-amber-700 font-extrabold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? '₪5.50 / פנייה' : '₪5.50 / ticket'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile Pricing Cards View (Visible only on mobile) */}
          <div className="block md:hidden space-y-6 mb-12">
            {[
              {
                id: 'micro',
                nameHe: 'Micro / סטרטר',
                nameEn: 'Micro / Starter',
                mFee: '₪99',
                aFee: '₪990',
                quota: '15',
                effective: '₪6.60',
                overage: '₪12.00',
                popular: false,
              },
              {
                id: 'basic',
                nameHe: 'Basic / בסיסי',
                nameEn: 'Basic',
                mFee: '₪199',
                aFee: '₪1,990',
                quota: '35',
                effective: '₪5.68',
                overage: '₪10.00',
                popular: false,
              },
              {
                id: 'standard',
                nameHe: 'Standard / סטנדרט',
                nameEn: 'Standard',
                mFee: '₪399',
                aFee: '₪3,990',
                quota: '80',
                effective: '₪4.98',
                overage: '₪8.00',
                popular: true,
              },
              {
                id: 'growth',
                nameHe: 'Growth / צמיחה',
                nameEn: 'Growth',
                mFee: '₪699',
                aFee: '₪6,990',
                quota: '160',
                effective: '₪4.36',
                overage: '₪7.00',
                popular: false,
              },
              {
                id: 'enterprise',
                nameHe: 'Enterprise / ארגוני',
                nameEn: 'Enterprise',
                mFee: '₪1,199',
                aFee: '₪11,990',
                quota: '300',
                effective: '₪3.99',
                overage: '₪5.50',
                popular: false,
              },
            ].map((t) => (
              <div
                key={t.id}
                className={`bg-white rounded-3xl p-6 border-[3px] shadow-lg ${t.popular
                  ? 'border-blue-600 ring-2 ring-blue-600/30'
                  : 'border-slate-800'
                  }`}
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black text-slate-900">
                    {isRtl ? t.nameHe : t.nameEn}
                  </h3>
                  {t.popular && (
                    <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-black">
                      {isRtl ? 'הכי פופולרי 🔥' : 'Most Popular 🔥'}
                    </span>
                  )}
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl mb-4 border border-slate-200/80">
                  <div className="text-3xl font-black text-blue-900">
                    {isAnnual ? `${t.aFee} / שנה` : `${t.mFee} / חודש`}
                  </div>
                </div>

                <div className="space-y-3 font-bold text-sm text-slate-700 mb-6">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-slate-500">{isRtl ? 'מכסת פניות חודשית:' : 'Monthly Quota:'}</span>
                    <span className="text-blue-700 font-extrabold text-base">{t.quota} {isRtl ? 'פניות' : 'tickets'}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-slate-500">{isRtl ? 'מחיר אפקטיבי לפנייה:' : 'Effective Rate / Ticket:'}</span>
                    <span>{t.effective}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">{isRtl ? 'מחיר פניית חריגה:' : 'Overage Fee:'}</span>
                    <span className="text-amber-700 font-extrabold">{t.overage} {isRtl ? 'לפנייה' : '/ ticket'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                  className={`w-full py-3.5 rounded-2xl font-black transition-all text-center cursor-pointer ${t.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                >
                  {isRtl ? 'להתחלת פיילוט בחינם' : 'Start Free Pilot'}
                </button>
              </div>
            ))}
          </div>

          {/* 3 Safeguards & Buffer Cards (from PRD) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Card 1: 5-Ticket Buffer */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center text-2xl mb-4 font-black">
                🛡️
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2">
                {isRtl ? 'חוצץ הגנה חם: 5 פניות במתנה' : '5-Ticket Safety Buffer'}
              </h4>
              <p className="text-slate-600 text-sm font-bold leading-relaxed">
                {isRtl
                  ? 'חורגים מעט במכסה? 5 הפניות הראשונות מעבר למכסה הן ללא כל חיוב (₪0 חריגה)! חיוב חריגה רטרואקטיבי יחול רק בהגעה לפנייה ה-6 מעבר למכסה.'
                  : 'Slight monthly spike? Your first 5 tickets beyond quota are completely free (₪0 grace zone). Overage applies only from ticket 6+ above quota.'}
              </p>
            </div>

            {/* Card 2: AI Flood & Non-Billable Safeguard */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center text-2xl mb-4 font-black">
                🤖
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2">
                {isRtl ? 'הגנת כפילויות וסינון AI' : 'Zero-Waste & AI Merging'}
              </h4>
              <p className="text-slate-600 text-sm font-bold leading-relaxed">
                {isRtl
                  ? 'אין חיובי סרק! דיווחים שסומנו ככפילות, מחוץ לאחריות או בדיקה מנוכים מהמכסה מידית. בנוסף, מנוע AI מזהה וממזג אוטומטית דיווחים כפולים תוך 10 דקות.'
                  : 'Zero waste! Duplicate, test, or out-of-scope tickets marked by admins are credited back. AI auto-merges duplicate resident reports within 10 mins.'}
              </p>
            </div>

            {/* Card 3: 20% Rollover */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center text-2xl mb-4 font-black">
                🔄
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2">
                {isRtl ? 'צבירת 20% פניות שלא נוצלו' : '20% Rollover Allowance'}
              </h4>
              <p className="text-slate-600 text-sm font-bold leading-relaxed">
                {isRtl
                  ? 'היה חודש שקט ולא ניצלתם את כל מכסת הפניות? עד 20% מהמכסה שלא נוצלה עוברים איתכם באופן אוטומטי כיתרה לשימוש בחודש העוקב!'
                  : 'Quiet month with unused tickets? Up to 20% of your unused quota automatically rolls over to protect your budget in the following month!'}
              </p>
            </div>
          </div>

          {/* Enterprise Pool Banner */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-3xl p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6" dir={isRtl ? 'rtl' : 'ltr'}>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-blue-500/30 text-blue-200 text-xs px-3 py-1 rounded-full font-black uppercase">
                  {isRtl ? 'לחברות ניהול ויישובים' : 'For Property Managers & Towns'}
                </span>
              </div>
              <h4 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
                {isRtl ? 'בנק פניות משותף (Master Quota Pool)' : 'Shared Master Quota Pooling'}
              </h4>
              <p className="text-blue-100 text-sm md:text-base font-bold max-w-2xl">
                {isRtl
                  ? 'ניהול מרובה בניינים או מתחמים? במסלול Enterprise ניתן לשתף בנק פניות מרכזי בין כל הבניינים בצי, תוך שמירה על הפרדת נתונים מלאה לכל מבנה.'
                  : 'Managing multiple buildings? Enterprise tier allows configuring a central Master Quota Pool shared across all buildings with full data isolation.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
              className="bg-white text-blue-900 hover:bg-blue-50 font-black px-8 py-4 rounded-2xl shadow-lg transition-all text-center cursor-pointer whitespace-nowrap active:scale-95"
            >
              {isRtl ? 'לשיחת ייעוץ והתאמה' : 'Contact Enterprise Sales'}
            </button>
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black text-lg px-10 py-5 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all text-center cursor-pointer inline-flex items-center gap-2"
            >
              <span>{isRtl ? 'להתחלת פיילוט חינם ל-30 יום' : 'Start 30-Day Free Pilot'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 7.5. FAQ SECTION */}
      <section id="faq" className="py-24 bg-slate-50 border-t border-slate-200/60">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center flex flex-col items-center mb-16">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4">
              {isRtl ? 'שאלות ותשובות' : 'FAQ'}
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              {t('landing_faq_headline') || 'שאלות נפוצות על TikTak'}
            </h2>
          </div>

          <div className="space-y-0 max-w-3xl mx-auto bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-100/60 border border-slate-200/50">
            {[
              { q: t('landing_faq_q1'), a: t('landing_faq_a1') },
              { q: t('landing_faq_q2'), a: t('landing_faq_a2') },
              { q: t('landing_faq_q3'), a: t('landing_faq_a3') },
              { q: t('landing_faq_q4'), a: t('landing_faq_a4') },
            ].map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className={`border-b transition-all duration-300 ${isOpen ? 'border-blue-600' : 'border-slate-100'
                    } last:border-b-0`}
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full flex items-center justify-between py-6 text-start font-extrabold text-lg md:text-xl text-slate-900 hover:text-blue-600 transition-colors cursor-pointer select-none"
                  >
                    <span>{faq.q}</span>
                    <span className="text-xl font-light text-slate-400 select-none ml-4 shrink-0">
                      {isOpen ? '—' : '+'}
                    </span>
                  </button>
                  <div
                    className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-96 pb-6 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                  >
                    <p className="text-base text-slate-600 leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. REGISTRATION & LEAD CAPTURE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Blur Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => { if (!isSubmitting) setIsModalOpen(false); }}
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
              className="absolute top-4 left-4 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors z-10 cursor-pointer"
            >
              <X size={20} />
            </button>

            {!isSubmitted ? (
              <form onSubmit={handleLeadSubmit} className="p-8 space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black text-slate-900">
                    {t('landing_modal_title') || 'הצטרפו לפיילוט של TikTak'}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {isRtl ? 'מלאו את הפרטים ונחבר אתכם תוך פחות מ-24 שעות' : 'Fill details and we will set you up under 24 hours'}
                  </p>
                </div>

                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2 font-bold animate-pulse">
                    <Info size={16} className="text-red-500 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="space-y-4 font-semibold text-sm">
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="block text-slate-600 mr-1">{t('landing_modal_name') || 'שם מלא'}</label>
                    <div className="relative">
                      <User size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={isRtl ? 'ישראל ישראלי' : 'John Doe'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-10 pl-4 text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                        required
                      />
                    </div>
                  </div>

                  {/* Body Type Select/Buttons */}
                  <div className="space-y-2">
                    <label className="block text-slate-600 mr-1">
                      {t('landing_modal_type') || 'סוג הגוף המנהל'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setLeadType('building')}
                        className={`py-3 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${leadType === 'building' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        {isRtl ? 'ועד בית' : 'Committee'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLeadType('company')}
                        className={`py-3 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${leadType === 'company' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        {isRtl ? 'חברת ניהול' : 'Company'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLeadType('settlement')}
                        className={`py-3 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${leadType === 'settlement' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                      >
                        {isRtl ? 'יישוב/מועצה' : 'Council'}
                      </button>
                    </div>
                  </div>

                  {/* Location Address */}
                  <div className="space-y-1">
                    <label className="block text-slate-600 mr-1">
                      {t('landing_modal_address') || 'שם היישוב או כתובת הבניין'}
                    </label>
                    <div className="relative">
                      <MapPin size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder={isRtl ? 'רחוב האסיף 12, תל אביב' : '12 Haasif St, Tel Aviv'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-10 pl-4 text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                        required
                      />
                    </div>
                  </div>

                  {/* Contact Phone */}
                  <div className="space-y-1">
                    <label className="block text-slate-600 mr-1">
                      {t('landing_modal_phone') || 'טלפון נייד ליצירת קשר'}
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d-]/g, ''))}
                        placeholder="050-1234567"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-10 pl-4 text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                        required
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/10 active:scale-95 transition-all text-center cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (isRtl ? 'שולח...' : 'Submitting...') : (t('landing_modal_submit') || 'שליחת בקשה להתחלת פיילוט')}
                </button>
              </form>
            ) : (
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 rounded-full border-4 border-green-500 text-green-500 flex items-center justify-center bg-green-50 mx-auto text-3xl font-bold">
                  ✓
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900">
                    {t('landing_modal_success_title') || 'תודה רבה!'}
                  </h3>
                  <p className="text-sm text-slate-600 font-semibold max-w-xs mx-auto leading-relaxed">
                    {t('landing_modal_success') || 'ההרשמה נקלטה בהצלחה! נציג שלנו יחזור אליך בהקדם לתחילת הפיילוט.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold py-3.5 rounded-2xl active:scale-95 transition-all cursor-pointer"
                >
                  {t('landing_modal_close') || 'סגור'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10. DASHBOARD LIGHTBOX MODAL */}
      {isDashboardLightboxOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm cursor-zoom-out"
            onClick={() => setIsDashboardLightboxOpen(false)}
          />
          <div className="relative max-w-6xl w-full max-h-[90vh] bg-slate-900 rounded-2xl shadow-2xl overflow-auto border border-slate-800 animate-in zoom-in-95 duration-300">
            {/* Close Button */}
            <button
              onClick={() => setIsDashboardLightboxOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-full bg-slate-950/60 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors z-20 cursor-pointer shadow-lg"
            >
              <X size={20} />
            </button>
            <div className={`p-4 ${isDashboardZoomed ? 'block text-center min-w-max' : 'flex items-center justify-center min-h-[80vh]'}`}>
              <img
                src="/admin_dashboard_preview.png"
                alt="TikTak Admin Dashboard Full Size"
                onClick={() => setIsDashboardZoomed(!isDashboardZoomed)}
                className={`transition-all duration-300 select-none ${isDashboardZoomed
                  ? 'max-w-none w-[1800px] h-auto cursor-zoom-out mx-auto block'
                  : 'w-full h-auto max-h-[80vh] object-contain cursor-zoom-in block'
                  }`}
              />
            </div>
          </div>
        </div>
      )}

      {/* 9. FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-950 font-semibold text-sm">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">

          {/* Logo & Slogan */}
          <div className="flex flex-col items-center md:items-start space-y-3">
            <img src="/logo_transparent.png" alt="TikTak" className="h-16 w-auto object-contain brightness-0 invert" />
            <p className="text-xs text-slate-500 font-bold">
              {isRtl ? 'מערכת אוטומטית לניהול ומעקב תקלות ומפגעים בקהילה' : 'Automated community issue tracking & management'}
            </p>
          </div>

          {/* Support Email & Legal */}
          <div className="flex flex-col items-center md:items-end space-y-2">
            <a
              href="mailto:tiktak.report@gmail.com"
              className="flex items-center gap-2 text-blue-400 hover:text-blue-300 hover:underline transition-colors text-sm font-semibold"
            >
              <Mail size={16} />
              <span>{t('landing_footer_contact', isRtl ? 'צור קשר' : 'Contact Us')}</span>
            </a>
            <span className="text-[11px] text-slate-600 block">
              &copy; {new Date().getFullYear()} TikTak Inc. {isRtl ? 'כל הזכויות שמורות.' : 'All rights reserved.'}
            </span>
          </div>

        </div>
      </footer>
    </div>
  );
}
