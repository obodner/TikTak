import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Trash2, Save, Users, Download, Database } from 'lucide-react';
import { collection, doc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface CsvUploadPanelProps {
  tenantId: string;
}

interface ParsedRecord {
  name: string;
  phone: string;
}

export const CsvUploadPanel: React.FC<CsvUploadPanelProps> = ({ tenantId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ParsedRecord[]>([]);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [dbRecords, setDbRecords] = useState<ParsedRecord[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchReporters = async () => {
    setIsLoadingDb(true);
    try {
      const snapshot = await getDocs(collection(db, 'tenants', tenantId, 'reporters'));
      const existing = snapshot.docs.map(doc => ({
        name: doc.data().name,
        phone: doc.data().phone
      }));
      setDbRecords(existing);
    } catch (err) {
      console.error('Failed to load existing reporters', err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchReporters();
  }, [tenantId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setSuccessMessage('');
    setRecords([]);
    
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.endsWith('.csv')) {
        setError('אנא העלה קובץ CSV חוקי.');
        return;
      }
      setFile(selectedFile);
      parseCsv(selectedFile);
    }
  };

  const parseCsv = (file: File) => {
    setIsProcessing(true);
    const reader = new FileReader();

    // Use UTF-8 to ensure Hebrew characters are read correctly
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('הקובץ ריק');

        const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('הקובץ חייב להכיל שורת כותרת ולפחות שורת נתונים אחת');

        // Parse Headers
        const headers = lines[0].split(',').map(h => h.trim());
        const nameIdx = headers.findIndex(h => h === 'שם');
        const phoneIdx = headers.findIndex(h => h === 'טלפון');

        if (nameIdx === -1 || phoneIdx === -1) {
          throw new Error('הקובץ חייב לכלול את העמודות המדויקות: "שם" ו-"טלפון"');
        }

        const parsedRecords: ParsedRecord[] = [];
        const nameRegex = /^[\u0590-\u05FFa-zA-Z0-9\s-]+$/;
        const phoneRegex = /^0\d{8,9}$/;
        const duplicates = new Set<string>();
        const seenPhones = new Set<string>();
        
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          const name = cols[nameIdx] || '';
          const phone = cols[phoneIdx] || '';

          // Allow empty rows at the end to be skipped silently
          if (!name && !phone) continue;

          if (!name) {
            throw new Error(`שורה ${i + 1}: שדה "שם" חסר או ריק.`);
          }

          if (!nameRegex.test(name)) {
            throw new Error(`שורה ${i + 1}: השם מכיל תווים לא חוקיים ("${name}"). מותרים רק אותיות, מספרים, רווחים ומקפים.`);
          }

          const cleanPhone = phone.replace(/-/g, '');
          if (!phoneRegex.test(cleanPhone)) {
            throw new Error(`שורה ${i + 1}: מספר הטלפון לא תקין ("${phone}"). מספר תקין מתחיל ב-0 ומכיל 9-10 ספרות (ניתן לכלול מקפים).`);
          }

          // Check duplicates within the file
          if (seenPhones.has(cleanPhone)) {
            duplicates.add(cleanPhone);
          } else {
            seenPhones.add(cleanPhone);
          }

          parsedRecords.push({ name, phone: cleanPhone });
        }

        if (duplicates.size > 0) {
          const dupList = Array.from(duplicates).join(', ');
          throw new Error(`נמצאו כפילויות בקובץ עבור מספרי הטלפון הבאים: ${dupList}. לא ניתן להעלות קובץ המכיל רשומות כפולות.`);
        }

        setRecords(parsedRecords);
      } catch (err: any) {
        setError(err.message || 'שגיאה בפענוח הקובץ.');
        setRecords([]);
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      setError('שגיאה בקריאת הקובץ.');
      setIsProcessing(false);
    };

    reader.readAsText(file, 'UTF-8');
  };

  const handleClear = () => {
    setFile(null);
    setRecords([]);
    setError('');
    setSuccessMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveToDb = async () => {
    if (records.length === 0) return;
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const reportersRef = collection(db, 'tenants', tenantId, 'reporters');
      
      // 1. Fetch all existing records to delete them
      const existingDocs = await getDocs(reportersRef);
      
      // 2. We need to respect Firestore's 500 operations per batch limit.
      // Every reporter replacement is potentially 1 delete + 1 set = 2 operations.
      // We'll chunk operations.
      let batch = writeBatch(db);
      let opCount = 0;

      for (const d of existingDocs.docs) {
        batch.delete(d.ref);
        opCount++;
        if (opCount === 400) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }

      for (const record of records) {
        const docRef = doc(reportersRef, record.phone);
        batch.set(docRef, {
          name: record.name,
          phone: record.phone,
          addedAt: new Date().toISOString()
        });
        opCount++;
        if (opCount === 400) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      setSuccessMessage(`נשמרו ${records.length} מדווחים בהצלחה למסד הנתונים (כל הרשומות הקודמות הוחלפו).`);
      setFile(null); // Clear the staged file
      setRecords([]); // Clear the staged records
      await fetchReporters(); // Refresh the DB list
    } catch (err: any) {
      setError(`שגיאה בשמירת נתונים: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (records.length === 0) return;
    
    // Add BOM for Hebrew support in Excel
    const BOM = "\uFEFF";
    const header = "שם,טלפון\n";
    const csvContent = records.map(r => `${r.name},${r.phone}`).join('\n');
    const blob = new Blob([BOM + header + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `tiktak_reporters_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <Users className="text-blue-600" size={18} />
        <h3 className="font-bold text-slate-800">העלאת רשימת מדווחים מורשים (CSV)</h3>
      </div>

      <div className="text-sm text-slate-500 mb-6">
        <p>העלה קובץ CSV המכיל בדיוק שתי עמודות עם הכותרות: <strong>שם</strong>, <strong>טלפון</strong>.</p>
        <p>מספרי טלפון חייבים להתחיל ב-0 ולהכיל 9 או 10 ספרות.</p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-bold text-sm">שגיאה בקובץ</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center gap-2 font-bold text-sm">
          <CheckCircle2 size={18} />
          {successMessage}
        </div>
      )}

      {!isProcessing && records.length === 0 && (
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <Upload className="text-slate-400 mb-3" size={32} />
          <p className="font-bold text-slate-700">לחץ להעלאת קובץ CSV</p>
        </div>
      )}

      {isLoadingDb && records.length === 0 && (
        <div className="flex justify-center p-4 mt-4">
          <p className="text-slate-500 font-medium animate-pulse">טוען רשומות קיימות...</p>
        </div>
      )}

      {!isLoadingDb && dbRecords.length > 0 && records.length === 0 && (
        <div className="mt-6 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-slate-700">
              <Database size={18} className="shrink-0" />
              <span className="font-bold text-sm">רשומות קיימות במסד הנתונים ({dbRecords.length})</span>
            </div>
          </div>
          
          <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[360px]">
            <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-200 p-3 font-black text-xs text-slate-500 uppercase shrink-0">
              <div>שם</div>
              <div>טלפון</div>
            </div>
            <div className="overflow-y-auto p-1 bg-white">
              {dbRecords.map((r, i) => (
                <div key={i} className="grid grid-cols-2 p-2 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className="font-medium text-slate-800 truncate px-1">{r.name}</div>
                  <div className="text-slate-600 font-mono text-right truncate px-1" dir="ltr">{r.phone}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="flex justify-center p-8">
          <p className="text-blue-600 font-bold animate-pulse">מפענח קובץ...</p>
        </div>
      )}



      {records.length > 0 && (
        <div className="mt-6 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 text-blue-800 truncate">
              <FileSpreadsheet size={18} className="shrink-0" />
              <span className="font-bold text-sm truncate" dir="ltr">{file?.name}</span>
              <span className="font-bold text-sm shrink-0">({records.length} רשומות)</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleDownload} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="הורד רשימה">
                <Download size={18} />
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="העלה קובץ חדש">
                <Upload size={18} />
              </button>
              <button onClick={handleClear} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="נקה">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[360px]">
            {/* Table Header */}
            <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-200 p-3 font-black text-xs text-slate-500 uppercase shrink-0">
              <div>שם</div>
              <div>טלפון</div>
            </div>
            
            {/* Scrollable Table Body */}
            <div className="overflow-y-auto p-1 bg-white">
              {records.map((r, i) => (
                <div key={i} className="grid grid-cols-2 p-2 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className="font-medium text-slate-800 truncate px-1">{r.name}</div>
                  <div className="text-slate-600 font-mono text-right truncate px-1" dir="ltr">{r.phone}</div>
                </div>
              ))}
            </div>
          </div>

          {!successMessage && (
            <button
              onClick={handleSaveToDb}
              disabled={isSaving}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              <Save size={18} />
              {isSaving ? 'שומר במסד נתונים...' : 'שמור רשימה מורשית'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
