import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CameraTrigger } from '../components/CameraTrigger';
import { ReportingForm } from '../components/ReportingForm';
import { compressImage } from '../utils/compression';
import { generateWhatsAppLink } from '../utils/whatsapp';
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

  // State
  const [state, setState] = useState<FlowState>('idle');
  const [ticketData, setTicketData] = useState<TicketData>({ 
    summary: '', 
    category: '', 
    urgency: 'Low',
    ticketType: 'visible'
  });
  const [vaadPhone, setVaadPhone] = useState('');
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  
  // New: Configuration for dropdowns
  const [config, setConfig] = useState<{
    locations: string[];
    subLocations: string[];
    categories: string[];
    uiConfig?: {
      locationLabel?: string;
      subLocationLabel?: string;
      showLocation?: boolean;
    };
  }>({ locations: [], subLocations: [], categories: [] });
  
  const [selectedLocation, setSelectedLocation] = useState(location || '');
  const [selectedSubLocation, setSelectedSubLocation] = useState(subLocation || '');

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
          
          setConfig({
            locations: data.config?.locations || data.config?.floors || [],
            subLocations: data.config?.subLocations || data.config?.resources || [],
            categories: data.config?.categories || [],
            uiConfig: data.uiConfig
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
    // Generate a unique ID for the hidden ticket
    const tempId = `hidden-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    setTicketData({
      summary: '',
      category: '',
      urgency: 'Low',
      imageId: tempId,
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

  const handleFinalSend = async (finalSummary: string) => {
    setState('sending');

    try {
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
          audioBase64: ticketData.audioBase64
        })
      });

      if (!createResponse.ok) {
        if (createResponse.status === 429) {
          setState('rate-limited');
          return;
        }
        throw new Error(`Failed to save ticket`);
      }

      // Generate WhatsApp Link
      const waLink = generateWhatsAppLink({
        phone: vaadPhone || '972522684838', // Fallback to Oren's test phone
        summary: finalSummary,
        tenantId, // Mapping tenantId to buildingId for util compatibility or updating util
        tenantName: tenantName || address,
        location: ticketData.location,
        subLocation: ticketData.subLocation,
        category: ticketData.category,
        urgency: ticketData.urgency,
        imageId: ticketData.ticketType === 'visible' ? ticketData.imageId : undefined,
        audioId: ticketData.audioBase64 ? ticketData.imageId : undefined
      });

      // Redirect to WhatsApp
      window.location.href = waLink;
      setState('success');
    } catch (err: any) {
      setState('error');
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
      ) : (
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
            uiConfig: config.uiConfig
          }}
          status={state === 'rate-limited' ? 'error' : state as any}
          errorType={state === 'rate-limited' ? 'rate-limit' : undefined}
        />
      )}
    </main>
    </div>
  );
}
