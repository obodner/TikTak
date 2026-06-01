import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CameraTrigger } from '../components/CameraTrigger';
import { ReportingForm } from '../components/ReportingForm';
import { QuickTapPills } from '../components/QuickTapPills';
import { QuickTapItem } from '../components/admin/QuickTapEditor';
import { compressImage } from '../utils/compression';
import { AlertTriangle } from 'lucide-react';

type FlowState = 'idle' | 'analyzing' | 'editing' | 'sending' | 'success' | 'error' | 'invalid' | 'rate-limited';

type TicketData = {
  summary: string;
  category: string;
  urgency: string;
  imageId?: string;
  location?: string;
  subLocation?: string;
  ticketType: 'visible' | 'hidden';
  audioBase64?: string;
};

export default function ResidentFlow() {
  const { t, i18n } = useTranslation();
  const { tenantId: routeTenantId } = useParams();
  const [searchParams] = useSearchParams();
  const [tenantName, setTenantName] = useState('');
  const [address, setAddress] = useState('');

  // URL Params - Support both short (f/r/b) and long (floor/resource/building) variants
  const tenantId = routeTenantId || searchParams.get('t') || searchParams.get('tenant') || searchParams.get('b') || searchParams.get('building') || 'default-tenant';
  const location = searchParams.get('l') || searchParams.get('location') || searchParams.get('f') || searchParams.get('floor');
  const subLocation = searchParams.get('sl') || searchParams.get('subLocation') || searchParams.get('r') || searchParams.get('resource');

  const [state, setState] = useState<FlowState>('idle');
  const [authError, setAuthError] = useState('');
  const [ticketData, setTicketData] = useState<TicketData>({ 
    summary: '', 
    category: '', 
    urgency: 'Low',
    ticketType: 'visible'
  });
  const [vaadPhone, setVaadPhone] = useState('');
  const [admins, setAdmins] = useState<{ name: string; phone: string }[]>([]);

  interface SentTicketInfo {
    summary: string;
    category: string;
    urgency: string;
    location?: string;
    subLocation?: string;
    imageId?: string;
    audioId?: string;
    reporterName: string;
    ticketNumber: number;
    isQuickTap?: boolean;
  }
  const [sentTicket, setSentTicket] = useState<SentTicketInfo | null>(null);
  if (vaadPhone && admins && sentTicket) { /* no-op */ }

  const [isConfigLoading, setIsConfigLoading] = useState(true);
  
  // New: Configuration for dropdowns
  const [config, setConfig] = useState<{
    locations: string[];
    subLocations: string[];
    categories: string[];
    tenantType?: 'building' | 'municipality';
    locationLabel?: string;
    subLocationLabel?: string;
    uiConfig?: {
      locationLabel?: string;
      subLocationLabel?: string;
      showLocation?: boolean;
    };
    quickTap?: {
      enabled: boolean;
      items: QuickTapItem[];
    };
  }>({ locations: [], subLocations: [], categories: [], tenantType: 'building' });
  
  const [activeQuickTap, setActiveQuickTap] = useState<QuickTapItem | null>(null);
  const [isQuickTapSending, setIsQuickTapSending] = useState(false);
  
  const [selectedLocation, setSelectedLocation] = useState(location || '');
  const [selectedSubLocation, setSelectedSubLocation] = useState(subLocation || '');
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [reporterPhone, setReporterPhone] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');

  useEffect(() => {
    const saved = localStorage.getItem('tiktak_reporter_phone');
    if (saved) {
      setReporterPhone(saved);
      setPhoneInput(saved);
    }
  }, []);
  
  const isMunicipality = config.tenantType === 'municipality';
  const locationLabel = config.uiConfig?.locationLabel || config.locationLabel || (isMunicipality ? (t('area') || 'אזור') : (t('floor') || 'קומה'));
  const subLocationLabel = config.uiConfig?.subLocationLabel || config.subLocationLabel || (isMunicipality ? (t('street') || 'רחוב') : (t('resource') || 'מיקום'));

  // Fetch tenant metadata
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch(`/api/buildingInfo?tenantId=${tenantId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.language) {
            i18n.changeLanguage(data.language);
          }
          if (data.name) {
            setTenantName(data.name);
          }
          if (data.address) {
            setAddress(data.address);
          }
          if (data.vaadPhone) {
            setVaadPhone(data.vaadPhone);
          }
          if (data.admins) {
            setAdmins(data.admins);
          }
          
          setConfig({
            locations: data.config?.locations || data.config?.floors || [],
            subLocations: data.config?.subLocations || data.config?.resources || [],
            categories: data.config?.categories || [],
            tenantType: data.type || 'building',
            locationLabel: data.config?.locationLabel,
            subLocationLabel: data.config?.subLocationLabel,
            uiConfig: data.uiConfig,
            quickTap: data.quickTap
          });
        }
      } catch (err) {
        console.error("Failed to load tenant localization", err);
      } finally {
        setIsConfigLoading(false);
      }
    }
    loadConfig();
  }, [tenantId]);

  const handleCapture = async (file: File) => {
    setState('analyzing');

    try {
      const compressed = await compressImage(file);

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(compressed);
      });
      const dataUrl = await base64Promise;
      const base64Image = dataUrl.split(',')[1];

      setAuthError(''); // Clear previous error
      
      // Step 0: Pre-check Authorization (if phone is known) to save AI overhead
      if (reporterPhone) {
        const authCheckResponse = await fetch('/api/checkAuth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, reporterPhone })
        });
        
        if (authCheckResponse.status === 403) {
          const authData = await authCheckResponse.json().catch(() => ({}));
          // Option B: Clear localStorage and show error
          localStorage.removeItem('tiktak_reporter_phone');
          setReporterPhone('');
          setAuthError(authData.message || 'מספר הטלפון השמור אינו מורשה. אנא נסה שוב והזן את מספרך האמיתי.');
          setState('idle');
          return;
        }
      }

      // Step 1: Analyze & Upload Image (No DB write yet)
      const response = await fetch('/api/analyzeImage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Image,
          mimeType: compressed.type,
          tenantId,
          location: selectedLocation || location,
          subLocation: selectedSubLocation || subLocation
        })
      });

      if (!response.ok) throw new Error('Analysis failed');

      const data = await response.json();

      if (data.is_valid_issue === false) {
        setState('invalid');
        return;
      }

      setTicketData({
        summary: data.summary || "Summary unavailable",
        category: data.category || "Maintenance",
        urgency: data.urgency || "Moderate",
        imageId: data.imageId,
        location: selectedLocation || undefined,
        subLocation: selectedSubLocation || undefined,
        ticketType: 'visible'
      });

      setState('editing');
    } catch (err) {
      console.error(err);
      setState('error');
    }
  };

  const handleManualReport = () => {
    // Manual report without camera capture
    
    setTicketData({
      summary: '',
      category: '',
      urgency: 'Low',
      imageId: undefined,
      location: selectedLocation || undefined,
      subLocation: selectedSubLocation || undefined,
      ticketType: 'hidden'
    });
    
    setState('editing');
  };

  const updateTicketContext = (updates: Partial<TicketData>) => {
    setTicketData(prev => ({ ...prev, ...updates }));
    if (updates.location) setSelectedLocation(updates.location);
    if (updates.subLocation) setSelectedSubLocation(updates.subLocation);
  };

  const handleFinalSend = async (finalSummary: string, phone: string) => {
    setState('sending');

    try {
      setAuthError(''); // Clear previous error
      // Step 2: Final Ticket Creation in DB
      const createResponse = await fetch('/api/createTicket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          imageId: ticketData.imageId,
          summary: finalSummary,
          category: ticketData.category,
          urgency: ticketData.urgency,
          location: ticketData.location || null,
          subLocation: ticketData.subLocation || null,
          ticketType: ticketData.ticketType,
          audioBase64: ticketData.audioBase64,
          reporterPhone: phone
        })
      });

      if (!createResponse.ok) {
        if (createResponse.status === 429) {
          setState('rate-limited');
          return;
        }
        if (createResponse.status === 403) {
          const errorData = await createResponse.json().catch(() => ({}));
          setAuthError(errorData.message || 'מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ועד הבית לאישור.');
          setState('editing'); // revert to editing so user can fix phone number
          return;
        }
        throw new Error(`Failed to save ticket`);
      }

      const createData = await createResponse.json();
      const reporterName = createData.reporterName || phone;
      const tNum = createData.ticketNumber;
      setTicketNumber(tNum);

      const sentInfo: SentTicketInfo = {
        summary: finalSummary,
        category: ticketData.category,
        urgency: ticketData.urgency,
        location: ticketData.location,
        subLocation: ticketData.subLocation,
        imageId: ticketData.ticketType === 'visible' ? ticketData.imageId : undefined,
        audioId: createData.audioId,
        reporterName: reporterName,
        ticketNumber: tNum,
        isQuickTap: false
      };
      setSentTicket(sentInfo);

      setState('success');
    } catch (err: any) {
      setState('error');
    }
  };

  const handleQuickTapConfirm = async () => {
    if (!activeQuickTap) return;
    setIsQuickTapSending(true);
    
    // QuickTap logic: Pre-fill ticket data and send immediately
    const q = activeQuickTap;
    const finalPhone = reporterPhone || phoneInput;
    const isPhoneValid = /^0\d{8,9}$/.test(finalPhone);
    
    if (!isPhoneValid) {
        setIsQuickTapSending(false);
        return;
    }

    // Persist if valid
    localStorage.setItem('tiktak_reporter_phone', finalPhone);
    setReporterPhone(finalPhone);

    try {
      const quickTicketData = {
        summary: q.summary,
        category: q.category,
        urgency: q.urgency,
        location: q.location || null,
        subLocation: q.subLocation || null,
        ticketType: 'hidden' as const,
        source: 'quicktap'
      };

      const response = await fetch('/api/createTicket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ...quickTicketData,
          reporterPhone: finalPhone
        })
      });

      if (!response.ok) {
        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          setAuthError(errorData.message || 'מספר הטלפון לא מזוהה במערכת. אנא צור קשר עם ועד הבית לאישור.');
          setActiveQuickTap(null); // Close the modal
          return; // Stay on current state (idle)
        }
        throw new Error('Failed to create QuickTap ticket');
      }
      
      const createData = await response.json();
      const reporterName = createData.reporterName || finalPhone;
      const tNum = createData.ticketNumber;
      setTicketNumber(tNum);

      const sentInfo: SentTicketInfo = {
        summary: quickTicketData.summary,
        category: quickTicketData.category,
        urgency: quickTicketData.urgency,
        location: quickTicketData.location || undefined,
        subLocation: quickTicketData.subLocation || undefined,
        reporterName: reporterName,
        ticketNumber: tNum,
        isQuickTap: true
      };
      setSentTicket(sentInfo);

      setState('success');
      setActiveQuickTap(null);
    } catch (err) {
      console.error(err);
      setState('error');
    } finally {
      setIsQuickTapSending(false);
    }
  };


  return (
    <div className="flex flex-col min-h-[100dvh] bg-white relative overflow-hidden" dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
      {/* 1. TOP BAR (IDENTITY + CONTEXT) - Persistent across all states */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md px-6 py-2 flex flex-col items-center border-b border-slate-50">
        <div className="select-none">
          <img src="/logo_transparent.png" alt="TikTak" className="h-[100px] w-auto object-contain" />
        </div>
        <p className="text-slate-600 text-lg font-bold tracking-tight -mt-1">
          {address || tenantName || '...'}
        </p>
      </header>

      {/* Main Flow Area */}
      <main className="flex-1 flex flex-col items-center pt-[160px] pb-10 px-6 w-full max-w-sm mx-auto">
        {tenantId === 'default-tenant' && state === 'idle' && (
          <div className="mb-6 bg-red-50 px-6 py-4 rounded-3xl border-2 border-red-200 shadow-xl animate-pulse w-full">
            <p className="text-red-700 font-black text-sm text-center">
              ⚠️ {i18n.language === 'he' ? 'שגיאה: לא נבחר מזהה (סרוק קוד QR שוב)' : 'Error: No ID Selected (Rescan QR)'}
            </p>
          </div>
        )}

        {state === 'idle' || state === 'analyzing' ? (
          <div className="flex-1 flex flex-col items-center justify-between w-full">
            {authError && (
              <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2 mb-4 w-full">
                <AlertTriangle className="shrink-0 mt-0.5 text-red-600" size={20} />
                <p className="text-sm font-bold leading-tight">{authError}</p>
              </div>
            )}
            {/* 2. HERO SECTION */}
            <section className="text-center mb-4 animate-in fade-in slide-in-from-top-4 duration-1000">
              <h1 className="text-blue-900 font-black text-2xl mb-2 leading-tight tracking-tight">
                {t('hero_headline')}
              </h1>
              <p className="text-blue-700/60 text-lg font-bold">
                {t('hero_subheadline')}
              </p>
            </section>

            {/* 3. PRIMARY & SECONDARY ACTIONS */}
            <CameraTrigger
              onCapture={handleCapture}
              onManualReport={handleManualReport}
              isLoading={state === 'analyzing' || isConfigLoading}
              middleContent={
                config.quickTap?.items && config.quickTap.items.length > 0 ? (
                  <QuickTapPills 
                    items={config.quickTap.items} 
                    onSelect={setActiveQuickTap} 
                  />
                ) : null
              }
            />
          </div>
        ) : state === 'invalid' ? (
        <div className="flex flex-col items-center justify-center gap-6 p-8 bg-white rounded-3xl border border-slate-200 shadow-xl animate-in zoom-in duration-300 text-center">
          <div className="bg-amber-500/10 p-4 rounded-full">
            <AlertTriangle size={64} className="text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              {t('invalid_issue')}
            </h2>
          </div>
          <button
            onClick={() => setState('idle')}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white px-8 py-4 rounded-2xl font-extrabold text-xl shadow-lg active:scale-95 transition-all"
          >
            {t('try_again')}
          </button>
        </div>
      ) : state === 'success' ? (
        <div className="w-full flex flex-col items-center justify-center gap-8 py-12 px-6 animate-in zoom-in duration-300 text-center" dir="rtl">
          {/* Green Checkmark Circle */}
          <div className="w-24 h-24 rounded-full border-[5px] border-[#22C55E] flex items-center justify-center bg-white">
            <svg className="w-12 h-12 text-[#22C55E]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          {/* Success Title */}
          <h2 className="text-3xl font-extrabold text-[#1E3A8A] tracking-tight leading-tight">
            הדיווח נשלח בהצלחה!
          </h2>

          {/* Ticket Number Pill */}
          {ticketNumber && (
            <div className="bg-[#EFF6FF] px-8 py-3 rounded-full border border-blue-100">
              <p className="text-[#2563EB] font-black text-2xl tracking-wide">#{ticketNumber}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col gap-4">
          {authError && (
            <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 flex items-start gap-3 shadow-sm animate-in slide-in-from-top-2">
              <AlertTriangle className="shrink-0 mt-0.5 text-red-600" size={20} />
              <p className="text-sm font-bold leading-tight">{authError}</p>
            </div>
          )}
          <ReportingForm
            initialData={{
              ...ticketData,
              urgency: (ticketData.urgency as 'High' | 'Moderate' | 'Low') || 'Low'
            }}
            onSend={handleFinalSend}
            onUpdate={updateTicketContext}
            config={{
              locations: config.locations,
              subLocations: config.subLocations,
              categories: config.categories,
              tenantType: config.tenantType,
              locationLabel: config.locationLabel,
              subLocationLabel: config.subLocationLabel,
              uiConfig: config.uiConfig
            }}
            status={state === 'rate-limited' ? 'error' : state as any}
            errorType={state === 'rate-limited' ? 'rate-limit' : undefined}
            ticketNumber={ticketNumber}
          />
        </div>
      )}
    </main>

    {/* QUICKTAP CONFIRMATION MODAL */}
    {activeQuickTap && (
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isQuickTapSending && setActiveQuickTap(null)} />
        
        <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
          <div className="p-8 text-center">
            <div className="text-6xl mb-4">{activeQuickTap.emoji}</div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 leading-tight">
              {activeQuickTap.summary}
            </h2>
            
            <div className="space-y-3 my-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-right" dir="rtl">
              {activeQuickTap.summary && (
                <div className="flex justify-between items-center gap-4">
                  <span className="text-slate-400 text-xs font-bold uppercase">תיאור</span>
                  <span className="text-slate-800 font-bold">{activeQuickTap.summary}</span>
                </div>
              )}
              {activeQuickTap.location && (
                <div className="flex justify-between items-center gap-4">
                  <span className="text-slate-400 text-xs font-bold uppercase">{locationLabel}</span>
                  <span className="text-slate-800 font-bold">{activeQuickTap.location}</span>
                </div>
              )}
              {activeQuickTap.subLocation && (
                <div className="flex justify-between items-center gap-4">
                  <span className="text-slate-400 text-xs font-bold uppercase">{subLocationLabel}</span>
                  <span className="text-slate-800 font-bold">{activeQuickTap.subLocation}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-4">
                <span className="text-slate-400 text-xs font-bold uppercase">דחיפות</span>
                <span className={cn(
                    "font-black px-2 py-0.5 rounded text-xs",
                    activeQuickTap.urgency === 'High' ? "bg-red-100 text-red-700" :
                    activeQuickTap.urgency === 'Moderate' ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                )}>
                    {activeQuickTap.urgency === 'High' ? 'גבוהה' : 
                     activeQuickTap.urgency === 'Moderate' ? 'בינונית' : 'נמוכה'}
                </span>
              </div>
            </div>

            {/* Phone Input if missing in localStorage */}
            {!localStorage.getItem('tiktak_reporter_phone') && (
               <div className="mb-6 text-right" dir="rtl">
                 <label className="block text-xs font-bold text-slate-500 mb-1 mr-1">מספר טלפון לזיהוי</label>
                 <input 
                   type="tel"
                   value={phoneInput}
                   placeholder="05X-XXXXXXX"
                   className="w-full border border-slate-200 rounded-xl p-3 text-center font-bold text-lg focus:ring-2 focus:ring-blue-100 outline-none"
                   onChange={(e) => {
                     const val = e.target.value.replace(/\D/g, '');
                     setPhoneInput(val);
                   }}
                 />
               </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleQuickTapConfirm}
                disabled={isQuickTapSending || !/^0\d{8,9}$/.test(phoneInput || reporterPhone)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isQuickTapSending ? 'שולח...' : 'שליחה ⚡'}
              </button>
              <button
                onClick={() => setActiveQuickTap(null)}
                disabled={isQuickTapSending}
                className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

// Helper for conditional classes
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
