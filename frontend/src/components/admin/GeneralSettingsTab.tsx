import React, { useState, useEffect } from 'react';
import { Globe, ListTodo, Layout, Save } from 'lucide-react';

interface GeneralSettingsTabProps {
  initialTenantName: string;
  initialType: 'building' | 'municipality';
  initialLanguage: 'he' | 'en';
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
  initialTenantName,
  initialType,
  initialLanguage,
  initialSlaConfig,
  initialUiConfig,
  isBuilding,
  onSave,
}) => {
  const [tenantName, setTenantName] = useState<string>(initialTenantName);
  const [type, setType] = useState<'building' | 'municipality'>(initialType);
  const [language, setLanguage] = useState<'he' | 'en'>(initialLanguage);
  
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

  // Sync state if initial props change (e.g. after successful save in parent)
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
    setSlaConfig(initialSlaConfig);
  }, [initialSlaConfig]);

  useEffect(() => {
    setUiConfig(initialUiConfig);
  }, [initialUiConfig]);

  // Check if anything has changed compared to initial props
  const isChanged =
    tenantName !== initialTenantName ||
    type !== initialType ||
    language !== initialLanguage ||
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
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="showLocation" className="text-sm font-bold text-slate-700 select-none cursor-pointer">הצג שדה מיקום ראשי</label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: SLA Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
            <ListTodo className="text-blue-600" size={18} />
            <h3 className="font-bold text-slate-800">SLA ושקיפות קהילתית</h3>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="slaEnabled"
                checked={slaConfig.enabled}
                onChange={(e) => setSlaConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 mt-1"
              />
              <label htmlFor="slaEnabled" className="text-sm font-bold text-slate-700 leading-normal select-none cursor-pointer">
                הפעל מודול SLA (צבעי דחיפות והודעות)
              </label>
            </div>

            {slaConfig.enabled && (
              <div className="space-y-3">
                <label className="block text-xs font-black text-slate-400 uppercase">ימי עבודה פעילים</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
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
                        className={`py-2 rounded-lg text-xs font-bold transition-all border ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  ימי העבודה משמשים לחישוב "ימי סטגנציה" של דיווחים במערכת (למשל, כדי לא לחשב סופי שבוע).
                </p>
              </div>
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
          className="w-full sm:w-auto min-w-[160px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <Save size={18} />
          <span>{saving ? 'שומר...' : 'שמור שינויים'}</span>
        </button>
      </div>
    </div>
  );
};
