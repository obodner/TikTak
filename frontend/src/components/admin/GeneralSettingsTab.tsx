import React, { useState, useEffect, useRef } from 'react';
import { Globe, ListTodo, Layout, Save, Upload, Image as ImageIcon, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';

interface GeneralSettingsTabProps {
  tenantId: string;
  initialTenantName: string;
  initialType: 'building' | 'municipality';
  initialLanguage: 'he' | 'en';
  initialLogoUrl?: string;
  initialSlaConfig: {
    enabled: boolean;
    workingDays: number[];
    country: string;
  };
  initialUiConfig: {
    locationLabel: string;
    subLocationLabel: string;
    showLocation: boolean;
  };
  isBuilding: boolean;
  onSave: (data: {
    tenantName: string;
    type: 'building' | 'municipality';
    language: 'he' | 'en';
    logoUrl?: string;
    slaConfig: {
      enabled: boolean;
      workingDays: number[];
      country: string;
    };
    uiConfig: {
      locationLabel: string;
      subLocationLabel: string;
      showLocation: boolean;
    };
  }) => Promise<void>;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  tenantId,
  initialTenantName,
  initialType,
  initialLanguage,
  initialLogoUrl = '',
  initialSlaConfig,
  initialUiConfig,
  isBuilding,
  onSave,
}) => {
  const [tenantName, setTenantName] = useState<string>(initialTenantName);
  const [type, setType] = useState<'building' | 'municipality'>(initialType);
  const [language, setLanguage] = useState<'he' | 'en'>(initialLanguage);
  const [logoUrl, setLogoUrl] = useState<string>(initialLogoUrl || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [slaConfig, setSlaConfig] = useState({
    enabled: initialSlaConfig.enabled,
    workingDays: initialSlaConfig.workingDays,
    country: initialSlaConfig.country,
  });

  const [uiConfig, setUiConfig] = useState({
    locationLabel: initialUiConfig.locationLabel,
    subLocationLabel: initialUiConfig.subLocationLabel,
    showLocation: initialUiConfig.showLocation,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Sync state if initial props change
  useEffect(() => {
    setTenantName(initialTenantName);
  }, [initialTenantName]);

  useEffect(() => {
    setType(initialType);
  }, [initialType]);

  useEffect(() => {
    setLanguage(initialLanguage);
  }, [initialLanguage]);

  useEffect(() => {
    setLogoUrl(initialLogoUrl || '');
  }, [initialLogoUrl]);

  useEffect(() => {
    setSlaConfig(initialSlaConfig);
  }, [initialSlaConfig]);

  useEffect(() => {
    setUiConfig(initialUiConfig);
  }, [initialUiConfig]);

  // Handle Logo File Upload
  const handleLogoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLogoError('יש לבחור קובץ תמונה תקין (PNG, JPG, SVG, WebP).');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoError('גודל הקובץ חורג מהמקסימום המותר של 5MB.');
      e.target.value = '';
      return;
    }

    setUploadingLogo(true);
    setLogoError('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileRef = ref(storage, `tenants/${tenantId}/branding/logo_${Date.now()}_${safeName}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(fileRef);
      setLogoUrl(downloadUrl);
    } catch (err: any) {
      console.error('Logo upload error:', err);
      setLogoError('שגיאה בהעלאת הלוגו: ' + (err.message || 'נסה שוב'));
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    setLogoError('');
  };

  // Check if anything has changed compared to initial props
  const isChanged =
    tenantName !== initialTenantName ||
    type !== initialType ||
    language !== initialLanguage ||
    logoUrl !== (initialLogoUrl || '') ||
    JSON.stringify(slaConfig) !== JSON.stringify(initialSlaConfig) ||
    JSON.stringify(uiConfig) !== JSON.stringify(initialUiConfig);

  const handleLocalSave = async () => {
    if (!isChanged) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await onSave({
        tenantName,
        type,
        language,
        logoUrl,
        slaConfig,
        uiConfig,
      });
      setMessage('השינויים נשמרו בהצלחה!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      console.error(err);
      setError('שגיאה בשמירת השינויים.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-medium text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Left Column: General Config & UI Branding */}
        <div className="flex flex-col gap-6">
          {/* Card 1: General Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <Globe className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-800">הגדרות כלליות</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">סוג ישות (לקריאה בלבד)</label>
                <div className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-100 text-sm font-bold text-slate-500">
                  {isBuilding ? 'בניין מגורים' : 'עירייה / רשות'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">שפת דיווח</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                >
                  <option value="he">עברית</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">מדינה (עבור לוח חגים)</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  value={slaConfig.country}
                  onChange={(e) => setSlaConfig(prev => ({ ...prev, country: e.target.value }))}
                >
                  <option value="IL">ישראל (IL)</option>
                  <option value="US">USA (US)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Interface Branding */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <Layout className="text-blue-600" size={18} />
              <h3 className="font-bold text-slate-800">מיתוג ממשק (Labeling)</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">שם הישות (תצוגה)</label>
                <input
                  type="text"
                  placeholder="שם העירייה / הבניין"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">תווית מיקום ראשי</label>
                <input
                  type="text"
                  placeholder={isBuilding ? "קומה" : "שכונה"}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                  value={uiConfig.locationLabel}
                  onChange={(e) => setUiConfig(prev => ({ ...prev, locationLabel: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1">תווית תת-מיקום</label>
                <input
                  type="text"
                  placeholder={isBuilding ? "משאב" : "רחוב"}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                  value={uiConfig.subLocationLabel}
                  onChange={(e) => setUiConfig(prev => ({ ...prev, subLocationLabel: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="showLocation"
                  checked={uiConfig.showLocation}
                  onChange={(e) => setUiConfig(prev => ({ ...prev, showLocation: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="showLocation" className="text-sm font-bold text-slate-700 select-none cursor-pointer">
                  הצג שדה מיקום ראשי
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Customer Logo (Positioned above SLA) + Shortened SLA Panel */}
        <div className="flex flex-col gap-6">
          {/* Card 3: Customer Logo Upload */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="text-blue-600" size={18} />
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">לוגו הלקוח (הוועד / הרשות)</h3>
                  <p className="text-[11px] text-slate-500 font-medium">מוטמע בראש ובסימן מים בכל עמודי הסכם העבודה (PDF)</p>
                </div>
              </div>
              {logoUrl && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shrink-0">
                  <CheckCircle2 size={11} />
                  <span>לוגו מוגדר</span>
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoSelected}
              className="hidden"
            />

            {logoError && (
              <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200 mb-3">
                {logoError}
              </div>
            )}

            {logoUrl ? (
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-24 h-16 bg-white rounded-lg border border-slate-200 p-1.5 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                  <img src={logoUrl} alt="לוגו לקוח" className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 mb-1">לוגו נוכחי שמור במערכת</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      {uploadingLogo ? 'מעלה...' : 'החלף לוגו'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="הסר לוגו"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => !uploadingLogo && fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
              >
                {uploadingLogo ? (
                  <div className="flex items-center gap-2 text-blue-600 text-xs font-bold py-2">
                    <Loader2 size={18} className="animate-spin" />
                    <span>מעלה לוגו...</span>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Upload size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">לחץ כאן להעלאת לוגו הלקוח</span>
                      <span className="text-[11px] text-slate-400">PNG, JPG, SVG עד 5MB (מומלץ לוגו עם רקע שקוף)</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Card 4: Shortened SLA Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <ListTodo className="text-blue-600" size={18} />
                <h3 className="font-bold text-slate-800 text-sm">SLA ושקיפות קהילתית</h3>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="slaEnabled"
                  checked={slaConfig.enabled}
                  onChange={(e) => setSlaConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="slaEnabled" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
                  פעיל
                </label>
              </div>
            </div>

            {slaConfig.enabled ? (
              <div className="space-y-2.5">
                <label className="block text-[11px] font-black text-slate-400 uppercase">ימי עבודה פעילים</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((day, index) => {
                    const isActive = slaConfig.workingDays.includes(index);
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          const newDays = isActive
                            ? slaConfig.workingDays.filter(d => d !== index)
                            : [...slaConfig.workingDays, index].sort();
                          setSlaConfig(prev => ({ ...prev, workingDays: newDays }));
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  משמש לחישוב ימי סטגנציה של דיווחים (אינו סופר סופי שבוע).
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">מודול SLA מנוטרל עבור ישות זו.</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Save Button */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {message ? (
          <div className="text-sm font-bold text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-100 w-full sm:w-auto text-center">
            {message}
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={handleLocalSave}
          disabled={!isChanged || saving}
          className="w-full sm:w-auto min-w-[160px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
        >
          <Save size={18} />
          <span>{saving ? 'שומר...' : 'שמור שינויים'}</span>
        </button>
      </div>
    </div>
  );
};
