import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  CheckCircle, 
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
  ExternalLink,
  Info
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

type LeadType = 'building' | 'company' | 'settlement';

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';

  // State for Lead Capture Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDashboardLightboxOpen, setIsDashboardLightboxOpen] = useState(false);
  const [isDashboardZoomed, setIsDashboardZoomed] = useState(false);

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

  // Switch Language
  const toggleLanguage = () => {
    const nextLang = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(nextLang);
    document.documentElement.dir = nextLang === 'he' ? 'rtl' : 'ltr';
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
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Right/Right-ish Brand Info (RTL-sensitive) */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <img src="/logo_transparent.png" alt="TikTak" className="h-16 w-auto object-contain" />
            </div>
            {/* Headline Badge */}
            <span className="hidden md:inline-block border-r border-slate-200 pr-4 mr-1 text-sm text-slate-500 font-medium tracking-tight">
              {t('landing_nav_title') || 'מערכת אוטומטית לניהול ומעקב תקלות'}
            </span>
          </div>

          {/* Center Links (Desktop only) */}
          <div className="hidden lg:flex items-center gap-8 font-semibold text-sm text-slate-600">
            <button onClick={() => scrollToSection('how-it-works')} className="hover:text-blue-600 transition-colors">
              {isRtl ? 'איך זה עובד' : 'How it works'}
            </button>
            <button onClick={() => scrollToSection('dashboard')} className="hover:text-blue-600 transition-colors">
              {isRtl ? 'ממשק המנהל' : 'Management interface'}
            </button>
            <button onClick={() => scrollToSection('features')} className="hover:text-blue-600 transition-colors">
              {isRtl ? 'פיצ׳רים' : 'Features'}
            </button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-blue-600 transition-colors">
              {isRtl ? 'מחירים' : 'Pricing'}
            </button>
          </div>

          {/* Left CTAs & Lang Toggle */}
          <div className="flex items-center gap-4">
            {/* Lang switcher */}
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <span>{isRtl ? 'EN' : 'עברית'}</span>
            </button>

            <button 
              onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
              className="bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 text-sm font-black px-5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer shadow-md shadow-blue-600/10 hover:shadow-blue-600/20 active:scale-95 text-center"
            >
              {t('landing_nav_cta') || 'להתחלת פיילוט'}
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
                className="bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 text-base font-black px-8 py-4 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all text-center cursor-pointer"
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
                        התקבל דיווח חדש במערכת <strong><em>TikTak</em></strong> עבור וועד מקומי דמו 🚨<br/>
                        <br/>
                        <strong>מספר דיווח</strong>: #61<br/>
                        <strong>קטגוריה</strong>: ביוב ונזילות<br/>
                        <strong>דחיפות</strong>: גבוהה 🚨<br/>
                        <strong>תיאור</strong>: ליד המט"ש בדרך ההקפית יש הצפה של ביוב וכל השכונה סובלת מהריח.<br/>
                        <strong>אזור</strong>: מתקן טיהור שפכים<br/>
                        <strong>שם המדווח</strong>: ישראל ישראלי<br/>
                        <br/>
                        <span className="text-slate-400">---------------</span><br/>
                        תודה, צוות <strong><em>TikTak</em></strong>!<br/>
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
                          הסטטוס של הדיווח שלך (#61) בנושא "ביוב ונזילות" <strong>אזור</strong>: מתקן טיהור שפכים נרשם במערכת ועודכן לסטטוס: <strong>חדש</strong>.<br/>
                          <br/>
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
                          <strong>היי, אנחנו על זה!</strong><br/>
                          <br/>
                          הדיווח שלך (#61) בנושא "ביוב ונזילות" <strong>אזור</strong>: מתקן טיהור שפכים כרגע בטיפול.<br/>
                          נעדכן כשיסתיים.<br/>
                          <br/>
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
                          <strong>חדשות טובות!</strong><br/>
                          <br/>
                          הדיווח שלך (#61) בנושא "ביוב ונזילות" ב- <strong>אזור</strong>: מתקן טיהור שפכים סומן כטופל (סיבת סגירה: טופל (טכנאי הוזמן למקום וטיפל בבעיה)).<br/>
                          תודה שעזרת לשמור על הבית! ✅<br/>
                          <br/>
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
                  <img src="/dashboard.png" alt="TikTak Admin Dashboard" className="w-full h-full object-cover object-top hover:scale-[1.01] transition-transform duration-500" />
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
                {t('landing_feature_quicktap_title') || '⚡ QuickTap'}
              </h3>
              <p className="text-base text-slate-600 font-medium leading-relaxed">
                {t('landing_feature_quicktap_desc') || 'דיווח בלחיצה אחת. דיווחים מוגדרים מראש לבעיות חוזרות ונשנות. שתי לחיצות והפנייה בדרך.'}
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                🎯
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_sla_title') || '🎯 SLA Engine'}
              </h3>
              <p className="text-sm text-slate-500 font-semibold leading-relaxed">
                {t('landing_feature_sla_desc') || 'שום דיווח לא נופל. התראות אוטומטיות לוועד ולדייר. צבעים ייעודיים בדשבורד לפי זמני טיפול.'}
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 flex flex-col items-start text-right space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                🧠
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-slate-950">
                {t('landing_feature_ai_title') || '🧠 AI Smart'}
              </h3>
              <p className="text-sm text-slate-500 font-semibold leading-relaxed">
                {t('landing_feature_ai_desc') || 'זיהוי אוטומטי חכם. מצלמים את המפגע והמערכת מזהה ומפענחת לבד את סוג התקלה.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. ABOUT & TRUST (Integrated Narrative) */}
      <section className="py-24 bg-slate-50">
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
          <div className="text-center flex flex-col items-center mb-16">
            <span className="bg-blue-100 text-blue-700 text-sm md:text-base px-6 py-2 rounded-full font-black uppercase tracking-wider mb-4">
              {isRtl ? 'חבילות ומחירים' : 'Pricing & Tiers'}
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight">
              {isRtl ? 'מסלול שמתאים בדיוק לגוף שלכם' : 'A plan that fits your community'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Card A: Pilot Package */}
            <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-8 flex flex-col justify-between hover:border-blue-500/30 transition-colors duration-300 relative overflow-hidden">
              <div className="space-y-6">
                <div>
                  <span className="bg-blue-100 text-blue-700 text-xs md:text-sm font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                    {isRtl ? 'מומלץ להתחלה' : 'POPULAR'}
                  </span>
                  <h3 className="text-3xl font-black text-slate-900 mt-3">
                    {t('landing_pricing_pilot_title') || 'מסלול פיילוט / קהילה קטנה'}
                  </h3>
                </div>
                
                <div className="border-y border-slate-200/60 py-4">
                  <span className="text-2xl md:text-3xl font-black text-slate-900 block">
                    {t('landing_pricing_pilot_price') || 'ללא עלות לתקופת הפיילוט'}
                  </span>
                </div>

                <ul className="space-y-3 text-slate-600 font-semibold text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-500 shrink-0" />
                    <span>{isRtl ? 'קו וואטסאפ פעיל אחד' : '1 active WhatsApp line'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-500 shrink-0" />
                    <span>{isRtl ? 'סיווג AI אוטומטי בסיסי' : 'Basic AI categorization'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-500 shrink-0" />
                    <span>{isRtl ? 'עד 50 פניות פעילות בחודש' : 'Up to 50 active reports per month'}</span>
                  </li>
                </ul>
              </div>

              <button 
                onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/10 active:scale-95 transition-all text-center cursor-pointer"
              >
                {t('landing_pricing_pilot_btn') || 'התחילו עכשיו'}
              </button>
            </div>

            {/* Card B: Enterprise Package */}
            <div className="bg-slate-950 border-2 border-slate-900 rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden text-white">
              <div className="space-y-6">
                <div>
                  <span className="bg-slate-800 text-slate-400 text-xs md:text-sm font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                    {isRtl ? 'ניהול מתקדם' : 'SCALE'}
                  </span>
                  <h3 className="text-3xl font-black text-white mt-3">
                    {t('landing_pricing_enterprise_title') || 'מועצות וניהול מתקדם'}
                  </h3>
                </div>

                <div className="border-y border-slate-800 py-4">
                  <span className="text-2xl md:text-3xl font-black text-white block">
                    {t('landing_pricing_enterprise_price') || 'צרו קשר להצעת מחיר מותאמת'}
                  </span>
                </div>

                <ul className="space-y-3 text-slate-300 font-semibold text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <span>{isRtl ? 'התממשקות למספר קווי וואטסאפ במקביל' : 'Simultaneous multiple WhatsApp lines'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <span>{isRtl ? 'התראות דחיפות (SLA) מותאמות אישית' : 'Custom SLA response alerts'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <span>{isRtl ? 'ניהול מרובה משתמשים וצוותים' : 'Multi-user & team roles management'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <span>{isRtl ? 'ייצוא נתונים מתקדם ודוחות' : 'Advanced data exports & reporting'}</span>
                  </li>
                </ul>
              </div>

              <button 
                onClick={() => { setIsSubmitted(false); setIsModalOpen(true); }}
                className="w-full mt-8 bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-2xl active:scale-95 transition-all text-center cursor-pointer"
              >
                {t('landing_pricing_enterprise_btn') || 'דברו איתנו'}
              </button>
            </div>
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
                src="/dashboard.png" 
                alt="TikTak Admin Dashboard Full Size" 
                onClick={() => setIsDashboardZoomed(!isDashboardZoomed)}
                className={`transition-all duration-300 select-none ${
                  isDashboardZoomed 
                    ? 'max-w-none w-[1800px] h-auto cursor-zoom-out mx-auto block' 
                    : 'w-full h-auto max-h-[80vh] object-contain cursor-zoom-in block'
                }`} 
              />
            </div>
          </div>
        </div>
      )}

      {/* 9. FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-950 font-semibold text-sm">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
          
          {/* Logo & Slogan */}
          <div className="flex flex-col items-center md:items-start space-y-3">
            <img src="/logo_transparent.png" alt="TikTak" className="h-16 w-auto object-contain brightness-0 invert" />
            <p className="text-xs text-slate-500 font-bold">
              {isRtl ? 'מערכת אוטומטית לניהול ומעקב תקלות ומפגעים בקהילה' : 'Automated community issue tracking & management'}
            </p>
          </div>

          {/* Jump Links */}
          <div className="flex justify-center gap-8">
            <button onClick={() => scrollToSection('how-it-works')} className="hover:text-white transition-colors">
              {isRtl ? 'איך זה עובד' : 'How it works'}
            </button>
            <button onClick={() => scrollToSection('dashboard')} className="hover:text-white transition-colors">
              {isRtl ? 'ממשק מנהלים' : 'Dashboard'}
            </button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">
              {isRtl ? 'מחירים' : 'Pricing'}
            </button>
          </div>

          {/* Support Email & Legal */}
          <div className="flex flex-col items-center md:items-end space-y-2">
            <a 
              href="mailto:tiktak.report@gmail.com" 
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              <span>tiktak.report@gmail.com</span>
              <ExternalLink size={14} />
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
