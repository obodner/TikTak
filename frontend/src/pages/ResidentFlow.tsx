import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
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
    const [ticketId, setTicketId] = useState<string | null>(null);
    const [appRating, setAppRating] = useState<number | null>(null);
    const [isRatingSubmitting, setIsRatingSubmitting] = useState(false);
    const [isRatingSubmitted, setIsRatingSubmitted] = useState(false);
    const [reporterPhone, setReporterPhone] = useState<string>('');
    const [phoneInput, setPhoneInput] = useState<string>('');

    useEffect(() => {
        const saved = localStorage.getItem('tiktak_reporter_phone');
        if (saved) {
            setReporterPhone(saved);
            setPhoneInput(saved);
        }
    }, []);

    const handleRatingSelect = async (rating: number) => {
        if (!ticketId || isRatingSubmitting) return;
        setAppRating(rating);
        setIsRatingSubmitting(true);

        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        try {
            const response = await fetch('/api/submitAppFeedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    ticketId,
                    rating
                })
            });

            if (response.ok) {
                setIsRatingSubmitted(true);
            }
        } catch (err) {
            console.error('Failed to submit rating', err);
        } finally {
            setIsRatingSubmitting(false);
        }
    };

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

    // Scroll to top when entering editing state (opening manual form or after image analysis)
    useEffect(() => {
        if (state === 'editing') {
            window.scrollTo(0, 0);
        }
    }, [state]);

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
            setTicketId(createData.ticketId);

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
            setTicketId(createData.ticketId);

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
                            <div className="bg-[#EFF6FF] px-8 py-3 rounded-full border border-blue-100 mb-2">
                                <p className="text-[#2563EB] font-black text-2xl tracking-wide">#{ticketNumber}</p>
                            </div>
                        )}

                        {/* 5-Star App Experience Survey */}
                        <div className="mt-8 pt-8 border-t border-slate-100 w-full flex flex-col items-center">
                            {isRatingSubmitted ? (
                                <p className="text-emerald-600 font-extrabold text-lg animate-in fade-in duration-300">
                                    תודה! המשוב שלך עוזר לנו להשתפר ⚡
                                </p>
                            ) : (
                                <>
                                    <p className="text-slate-600 font-bold text-base mb-4">
                                        איך היתה חווית הדיווח?
                                    </p>
                                    <div className="flex flex-col items-center">
                                        <div className="flex gap-2.5">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    disabled={isRatingSubmitting}
                                                    onClick={() => handleRatingSelect(star)}
                                                    className="text-slate-200 hover:text-amber-400 focus:outline-none transition-all duration-150 active:scale-110"
                                                >
                                                    <svg
                                                        className={`w-10 h-10 transition-colors ${(appRating !== null && star <= appRating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                                                            }`}
                                                        fill="currentColor"
                                                        viewBox="0 0 20 20"
                                                    >
                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                    </svg>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex justify-between w-full max-w-[210px] px-1 mt-2.5 text-xs text-slate-400 font-extrabold select-none" dir="rtl">
                                            <span>חלש (1)</span>
                                            <span>מעולה (5)</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="w-full flex flex-col gap-4">

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

            {/* Unobtrusive hyperlink bar for Resident Dashboard at the bottom viewport edge */}
            {state === 'idle' && (
                <div className="absolute bottom-4 left-0 right-0 text-center z-10">
                    <Link
                        to={`/report/${tenantId}/dashboard`}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors py-2 px-4"
                    >
                        {t('view_previous_reports')}
                    </Link>
                </div>
            )}

            {/* Centered Warning Modal for Auth Errors */}
            {authError && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" dir={i18n.language === 'he' ? 'rtl' : 'ltr'}>
                    <div className="absolute inset-0" onClick={() => setAuthError('')} />
                    <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-200 border border-slate-100">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-4">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="font-extrabold text-slate-800 text-lg mb-2">
                            {i18n.language === 'he' ? 'שגיאת אימות' : 'Authentication Error'}
                        </h3>
                        <p className="text-slate-600 text-sm font-bold leading-relaxed mb-6">
                            {authError}
                        </p>
                        <button
                            onClick={() => setAuthError('')}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-black transition-all active:scale-95 shadow-lg shadow-red-600/10"
                        >
                            {i18n.language === 'he' ? 'הבנתי' : 'Got it'}
                        </button>
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
