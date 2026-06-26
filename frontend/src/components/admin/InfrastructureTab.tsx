import React, { useState, useEffect } from 'react';
import { ListEditor } from './ListEditor';
import { QuickTapEditor, QuickTapItem } from './QuickTapEditor';
import { Save } from 'lucide-react';

interface InfrastructureTabProps {
  initialLocations: string[];
  initialSubLocations: string[];
  initialCategories: string[];
  initialQuickTap: { items: QuickTapItem[] };
  uiConfig: {
    locationLabel: string;
    subLocationLabel: string;
    showLocation: boolean;
  };
  isBuilding: boolean;
  onSave: (data: {
    locations: string[];
    subLocations: string[];
    categories: string[];
    quickTap: { items: QuickTapItem[] };
  }) => Promise<void>;
}

export const InfrastructureTab: React.FC<InfrastructureTabProps> = ({
  initialLocations,
  initialSubLocations,
  initialCategories,
  initialQuickTap,
  uiConfig,
  isBuilding,
  onSave,
}) => {
  const [locations, setLocations] = useState<string[]>(initialLocations);
  const [subLocations, setSubLocations] = useState<string[]>(initialSubLocations);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [quickTap, setQuickTap] = useState<{ items: QuickTapItem[] }>(initialQuickTap);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Sync state if initial props change (e.g. after a successful save in the parent)
  useEffect(() => {
    setLocations(initialLocations);
  }, [initialLocations]);

  useEffect(() => {
    setSubLocations(initialSubLocations);
  }, [initialSubLocations]);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  useEffect(() => {
    setQuickTap(initialQuickTap);
  }, [initialQuickTap]);

  // Check if anything has changed compared to initial props
  const isChanged =
    JSON.stringify(locations) !== JSON.stringify(initialLocations) ||
    JSON.stringify(subLocations) !== JSON.stringify(initialSubLocations) ||
    JSON.stringify(categories) !== JSON.stringify(initialCategories) ||
    JSON.stringify(quickTap) !== JSON.stringify(initialQuickTap);

  const handleLocalSave = async () => {
    if (!isChanged) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await onSave({
        locations,
        subLocations,
        categories,
        quickTap,
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

  const handleQuickTapSave = (items: QuickTapItem[]) => {
    setQuickTap({ items });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8 flex flex-col gap-8">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-medium text-sm">
          {error}
        </div>
      )}

      <ListEditor
        label={uiConfig.locationLabel || (isBuilding ? "קומות" : "שכונות")}
        items={locations}
        onChange={setLocations}
        allowRanges={isBuilding}
        hideSortButton={false}
        showNumericSort={isBuilding}
        isLtr={isBuilding}
        placeholder={isBuilding ? "הוסף קומה או טווח (-2-5)" : "הוסף שם שכונה"}
        helperText={isBuilding ? "ניתן להוסיף קומות בודדות או טווחי מספרים." : "רשימת השכונות או האזורים הראשיים."}
      />

      <ListEditor
        label={uiConfig.subLocationLabel || (isBuilding ? "משאבים/מתקנים" : "רחובות/מיקומים")}
        items={subLocations}
        onChange={setSubLocations}
        placeholder={isBuilding ? "למשל: מעלית, בריכה, מועדון" : "למשל: רחוב הרצל, פארק מרכזי"}
        helperText="אלו המקומות המדויקים שהדיירים יכולים לדווח עליהם."
      />

      <ListEditor
        label="קטגוריות דיווח"
        items={categories}
        onChange={setCategories}
        placeholder="למשל: חשמל, ניקיון, בור בכביש"
        helperText="הקטגוריות שה-AI יסווג אליהן את הדיווחים."
      />

      <QuickTapEditor
        items={quickTap.items}
        categories={categories}
        locations={locations}
        subLocations={subLocations}
        onChange={(items) => setQuickTap({ items })}
        onSave={handleQuickTapSave}
      />

      {/* Action Save Button */}
      <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
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
