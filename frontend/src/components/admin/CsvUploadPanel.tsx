import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Trash2, Save, Users, Download, Database, Plus, Search, Edit2, X, Check } from 'lucide-react';
import { collection, doc, writeBatch, getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { logAction } from '../../utils/auditLogger';

interface CsvUploadPanelProps {
  tenantId: string;
  callerName: string;
}

interface ParsedRecord {
  name: string;
  phone: string;
}

export const CsvUploadPanel: React.FC<CsvUploadPanelProps> = ({ tenantId, callerName }) => {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ParsedRecord[]>([]);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [dbRecords, setDbRecords] = useState<ParsedRecord[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [lastUpload, setLastUpload] = useState<{ fileName: string, uploadedAt: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Whitelist Management States
  const [newResidentName, setNewResidentName] = useState('');
  const [newResidentPhone, setNewResidentPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isDeletingPhone, setIsDeletingPhone] = useState<string | null>(null);

  const nameRegex = /^[\u0590-\u05FFa-zA-Z0-9\s-]+$/;
  const phoneRegex = /^0\d{8,9}$/;

  const fetchReporters = async () => {
    setIsLoadingDb(true);
    try {
      // Fetch Metadata from Tenant doc
      const tSnap = await getDoc(doc(db, "tenants", tenantId));
      if (tSnap.exists()) {
        setLastUpload(tSnap.data().lastReporterUpload || null);
      }

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

    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer) throw new Error('הקובץ ריק');

        const encodings = ['utf-8', 'windows-1255', 'iso-8859-8', 'utf-16'];

        let text = '';
        let headers: string[] = [];
        let delimiter = ',';
        let lines: string[] = [];
        let nameIdx = -1;
        let phoneIdx = -1;

        // Try different encodings
        for (const encoding of encodings) {
          try {
            const decoder = new TextDecoder(encoding);
            text = decoder.decode(arrayBuffer);
            
            // Strip BOM and invisible chars
            text = text.replace(/^\uFEFF/, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
            
            lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
            if (lines.length < 1) continue;

            const firstLine = lines[0];
            // Detect delimiter: comma, semicolon, or tab
            const commaCount = (firstLine.match(/,/g) || []).length;
            const semiCount = (firstLine.match(/;/g) || []).length;
            const tabCount = (firstLine.match(/\t/g) || []).length;
            
            if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
            else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
            else delimiter = ',';

            headers = firstLine.split(delimiter).map(h => h.trim().replace(/["']/g, ''));
            
            // Look for headers that CONTAIN "שם" and "טלפון"
            nameIdx = headers.findIndex(h => h.includes('שם'));
            phoneIdx = headers.findIndex(h => h.includes('טלפון'));

            if (nameIdx !== -1 && phoneIdx !== -1) {
              console.log(`Successfully detected encoding: ${encoding} with delimiter: ${delimiter}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (nameIdx === -1 || phoneIdx === -1) {
          console.log('Headers found (last attempt):', headers);
          throw new Error(`העמודות "שם" ו-"טלפון" לא נמצאו. נא לוודא שהקובץ נשמר בפורמט CSV (UTF-8) או CSV רגיל.`);
        }

        if (lines.length < 2) throw new Error('הקובץ חייב להכיל שורת כותרת ולפחות שורת נתונים אחת');

        const parsedRecords: ParsedRecord[] = [];
        const duplicates = new Set<string>();
        const seenPhones = new Set<string>();
        
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/["']/g, ''));
          const name = cols[nameIdx] || '';
          let phone = cols[phoneIdx] || '';

          // Allow empty rows at the end to be skipped silently
          if (!name && !phone) continue;

          if (!name) {
            throw new Error(`שורה ${i + 1}: שדה "שם" חסר או ריק.`);
          }

          if (!nameRegex.test(name)) {
            throw new Error(`שורה ${i + 1}: השם מכיל תווים לא חוקיים ("${name}"). מותרים רק אותיות, מספרים, רווחים ומקפים.`);
          }

          // Fix for Excel stripping leading zeros
          let cleanPhone = phone.replace(/[^0-9]/g, '');
          if (cleanPhone.length === 9 && !cleanPhone.startsWith('0')) {
            cleanPhone = '0' + cleanPhone;
          }

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

    reader.readAsArrayBuffer(file);
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

      // 3. Update Metadata in Tenant Doc
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'tenants', tenantId), {
        lastReporterUpload: {
          fileName: file?.name || 'unknown.csv',
          uploadedAt: now
        }
      });
      setLastUpload({ fileName: file?.name || 'unknown.csv', uploadedAt: now });

      // Audit Log
      await logAction({
        tenantId,
        action: 'REPORTER_LIST_UPDATE',
        actor: { 
          uid: auth.currentUser?.uid || 'unknown', 
          name: callerName, 
          type: 'admin' 
        },
        details: { 
          actionName: 'REPORTER_LIST_UPLOAD', 
          recordCount: records.length,
          fileName: file?.name,
          uploadedAt: now
        }
      });

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

  // Add a single resident manually
  const handleAddResident = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const trimmedName = newResidentName.trim();
    let trimmedPhone = newResidentPhone.trim().replace(/[^0-9]/g, '');

    if (trimmedPhone.length === 9 && !trimmedPhone.startsWith('0')) {
      trimmedPhone = '0' + trimmedPhone;
    }

    if (!trimmedName) {
      setError('אנא הזן שם מלא.');
      return;
    }

    if (!nameRegex.test(trimmedName)) {
      setError('השם מכיל תווים לא חוקיים. מותרים רק אותיות, מספרים, רווחים ומקפים.');
      return;
    }

    if (!phoneRegex.test(trimmedPhone)) {
      setError('מספר הטלפון לא תקין. מספר תקין מתחיל ב-0 ומכיל 9-10 ספרות.');
      return;
    }

    const exists = dbRecords.some(r => r.phone === trimmedPhone);
    if (exists) {
      setError('מספר הטלפון כבר קיים ברשימה המורשית.');
      return;
    }

    setIsSaving(true);
    try {
      const docRef = doc(db, 'tenants', tenantId, 'reporters', trimmedPhone);
      await writeBatch(db)
        .set(docRef, {
          name: trimmedName,
          phone: trimmedPhone,
          addedAt: new Date().toISOString()
        })
        .commit();

      await logAction({
        tenantId,
        action: 'REPORTER_LIST_UPDATE',
        actor: { 
          uid: auth.currentUser?.uid || 'unknown', 
          name: callerName, 
          type: 'admin' 
        },
        details: { 
          actionName: 'REPORTER_CREATED',
          name: trimmedName,
          phone: trimmedPhone
        }
      });

      setNewResidentName('');
      setNewResidentPhone('');
      setSuccessMessage(`התושב ${trimmedName} נוסף בהצלחה לרשימה המורשית.`);
      await fetchReporters();
    } catch (err: any) {
      setError(`שגיאה בהוספת תושב: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a single resident
  const handleDeleteResident = async (phone: string) => {
    setError('');
    setSuccessMessage('');
    
    const targetRecord = dbRecords.find(r => r.phone === phone);
    if (!targetRecord) return;

    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את ${targetRecord.name} מהרשימה המורשית?`)) {
      return;
    }

    setIsDeletingPhone(phone);
    try {
      const docRef = doc(db, 'tenants', tenantId, 'reporters', phone);
      const batch = writeBatch(db);
      batch.delete(docRef);
      await batch.commit();

      await logAction({
        tenantId,
        action: 'REPORTER_LIST_UPDATE',
        actor: { 
          uid: auth.currentUser?.uid || 'unknown', 
          name: callerName, 
          type: 'admin' 
        },
        details: { 
          actionName: 'REPORTER_DELETED',
          name: targetRecord.name,
          phone
        }
      });

      setSuccessMessage(`התושב ${targetRecord.name} נמחק בהצלחה מהרשימה.`);
      await fetchReporters();
    } catch (err: any) {
      setError(`שגיאה במחיקת תושב: ${err.message}`);
    } finally {
      setIsDeletingPhone(null);
    }
  };

  // Start inline editing
  const startEdit = (record: ParsedRecord) => {
    setEditingPhone(record.phone);
    setEditName(record.name);
    setEditPhone(record.phone);
  };

  // Save inline edit
  const handleSaveEdit = async (oldPhone: string) => {
    setError('');
    setSuccessMessage('');

    const trimmedName = editName.trim();
    let trimmedPhone = editPhone.trim().replace(/[^0-9]/g, '');

    if (trimmedPhone.length === 9 && !trimmedPhone.startsWith('0')) {
      trimmedPhone = '0' + trimmedPhone;
    }

    if (!trimmedName) {
      setError('שם מלא אינו יכול להיות ריק.');
      return;
    }

    if (!nameRegex.test(trimmedName)) {
      setError('השם מכיל תווים לא חוקיים. מותרים רק אותיות, מספרים, רווחים ומקפים.');
      return;
    }

    if (!phoneRegex.test(trimmedPhone)) {
      setError('מספר הטלפון לא תקין. מספר תקין מתחיל ב-0 ומכיל 9-10 ספרות.');
      return;
    }

    if (trimmedPhone !== oldPhone) {
      const exists = dbRecords.some(r => r.phone === trimmedPhone);
      if (exists) {
        setError('מספר הטלפון החדש כבר קיים ברשימה עבור תושב אחר.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const reportersRef = collection(db, 'tenants', tenantId, 'reporters');
      const oldDocRef = doc(reportersRef, oldPhone);
      
      const batch = writeBatch(db);
      
      if (trimmedPhone !== oldPhone) {
        const newDocRef = doc(reportersRef, trimmedPhone);
        batch.delete(oldDocRef);
        batch.set(newDocRef, {
          name: trimmedName,
          phone: trimmedPhone,
          addedAt: new Date().toISOString()
        });
      } else {
        batch.update(oldDocRef, {
          name: trimmedName,
          updatedAt: new Date().toISOString()
        });
      }

      await batch.commit();

      await logAction({
        tenantId,
        action: 'REPORTER_LIST_UPDATE',
        actor: { 
          uid: auth.currentUser?.uid || 'unknown', 
          name: callerName, 
          type: 'admin' 
        },
        details: { 
          actionName: 'REPORTER_UPDATED',
          oldName: dbRecords.find(r => r.phone === oldPhone)?.name || '',
          newName: trimmedName,
          oldPhone,
          newPhone: trimmedPhone
        }
      });

      setEditingPhone(null);
      setSuccessMessage('הרשומה עודכנה בהצלחה.');
      await fetchReporters();
    } catch (err: any) {
      setError(`שגיאה בעדכון רשומה: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingPhone(null);
    setEditName('');
    setEditPhone('');
  };

  const handleDownload = (isDb = false) => {
    const listToDownload = isDb ? dbRecords : records;
    if (listToDownload.length === 0) return;
    
    const BOM = "\uFEFF";
    const header = "שם,טלפון\n";
    const csvContent = listToDownload.map(r => `${r.name},${r.phone}`).join('\n');
    const blob = new Blob([BOM + header + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const fileName = `tiktak_reporters_list.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter records based on name and phone query
  const filteredDbRecords = dbRecords.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.phone.includes(searchQuery)
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="text-blue-600" size={18} />
          <h3 className="font-bold text-slate-800">העלאת רשימת מדווחים מורשים (CSV)</h3>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleDownload(records.length === 0)}
            disabled={dbRecords.length === 0 && records.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
            title="הורד רשימה כקובץ CSV"
          >
            <Download size={16} />
            <span className="hidden sm:inline">הורדה</span>
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing || isSaving}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            title="העלה רשימה חדשה"
          >
            <Upload size={16} />
            <span className="hidden sm:inline">העלאה</span>
          </button>

          {lastUpload && (
            <div className="flex flex-col items-start text-[10px] bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 hidden md:flex min-w-[100px]">
              <span className="text-slate-400 font-bold mb-0.5">קובץ אחרון:</span>
              <span 
                className="text-slate-700 font-bold truncate max-w-[120px] mb-0.5" 
                dir="ltr"
                title={lastUpload.fileName}
              >
                {lastUpload.fileName}
              </span>
              <span className="text-slate-400 font-bold">
                {new Date(lastUpload.uploadedAt).toLocaleString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}, {new Date(lastUpload.uploadedAt).toLocaleDateString('he-IL')}
              </span>
            </div>
          )}
        </div>
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

      {/* Manual Input and Search Bar - displays when database is ready */}
      {!isLoadingDb && records.length === 0 && (
        <div className="space-y-3 mb-5">
          {/* Add resident inline form */}
          <form onSubmit={handleAddResident} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2">
            <div className="font-bold text-xs text-slate-500 shrink-0 w-24 sm:w-auto">הוספה ידנית:</div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="שם מלא"
                value={newResidentName}
                onChange={(e) => setNewResidentName(e.target.value)}
                disabled={isSaving}
                className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex-1">
              <input
                type="tel"
                placeholder="מספר טלפון (05xxxxxxxx)"
                value={newResidentPhone}
                onChange={(e) => setNewResidentPhone(e.target.value)}
                disabled={isSaving}
                className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-right"
                dir="ltr"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !newResidentName || !newResidentPhone}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold transition-all disabled:opacity-30 shrink-0 cursor-pointer"
            >
              <Plus size={14} />
              <span>הוסף</span>
            </button>
          </form>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="חיפוש לפי שם או מספר טלפון..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-9 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-2 text-slate-400 hover:text-slate-600 font-bold p-0.5 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {isLoadingDb && records.length === 0 && (
        <div className="flex justify-center p-4 mt-4">
          <p className="text-slate-500 font-medium animate-pulse">טוען רשומות קיימות...</p>
        </div>
      )}

      {!isLoadingDb && dbRecords.length > 0 && records.length === 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-slate-700">
              <Database size={18} className="shrink-0" />
              <span className="font-bold text-sm">
                רשומות קיימות ({filteredDbRecords.length === dbRecords.length ? dbRecords.length : `${filteredDbRecords.length} מתוך ${dbRecords.length}`})
              </span>
            </div>
          </div>
          
          <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[360px] relative">
            <div className="grid grid-cols-[1fr_120px_75px] bg-slate-50 border-b border-slate-200 p-3 font-black text-xs text-slate-500 uppercase shrink-0">
              <div>שם</div>
              <div>טלפון</div>
              <div className="text-center">פעולות</div>
            </div>
            
            <div className="overflow-y-auto p-1 bg-white">
              {filteredDbRecords.length === 0 ? (
                <div className="text-center text-slate-400 p-6 text-sm">לא נמצאו רשומות מתאימות.</div>
              ) : (
                filteredDbRecords.map((r) => {
                  const isEditing = editingPhone === r.phone;
                  const isDeleting = isDeletingPhone === r.phone;

                  return (
                    <div 
                      key={r.phone} 
                      className={`grid grid-cols-[1fr_120px_75px] p-2 text-sm border-b border-slate-50 last:border-0 items-center transition-colors rounded-lg ${isEditing ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}
                    >
                      {isEditing ? (
                        <>
                          <div className="px-1">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              disabled={isSaving}
                              className="w-full text-xs font-semibold px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                          </div>
                          <div className="px-1" dir="ltr">
                            <input
                              type="tel"
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              disabled={isSaving}
                              className="w-full text-xs font-mono px-2 py-1 border border-slate-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                          </div>
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => handleSaveEdit(r.phone)}
                              disabled={isSaving}
                              className="text-green-600 hover:text-green-800 transition-colors p-1 cursor-pointer"
                              title="שמור"
                            >
                              <Check size={16} />
                            </button>
                            <button 
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
                              title="ביטול"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-slate-800 truncate px-1">{r.name}</div>
                          <div className="text-slate-600 font-mono text-right truncate px-1" dir="ltr">{r.phone}</div>
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => startEdit(r)}
                              disabled={isSaving || !!editingPhone || isDeleting}
                              className="text-slate-400 hover:text-blue-600 transition-colors p-1 disabled:opacity-30 cursor-pointer"
                              title="ערוך"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button 
                              onClick={() => handleDeleteResident(r.phone)}
                              disabled={isSaving || !!editingPhone || isDeleting}
                              className="text-slate-400 hover:text-red-600 transition-colors p-1 disabled:opacity-30 cursor-pointer"
                              title="מחק"
                            >
                              {isDeleting ? (
                                <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
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
              <button onClick={handleClear} className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer" title="נקה">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[360px]">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_120px_75px] bg-slate-50 border-b border-slate-200 p-3 font-black text-xs text-slate-500 uppercase shrink-0">
              <div>שם</div>
              <div>טלפון</div>
              <div className="text-center">מצב</div>
            </div>
            
            {/* Scrollable Table Body */}
            <div className="overflow-y-auto p-1 bg-white">
              {records.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_75px] p-2 text-sm border-b border-slate-55 last:border-0 hover:bg-slate-50 items-center rounded-lg transition-colors">
                  <div className="font-semibold text-slate-800 truncate px-1">{r.name}</div>
                  <div className="text-slate-600 font-mono text-right truncate px-1" dir="ltr">{r.phone}</div>
                  <div className="text-center text-blue-500 font-bold text-xs shrink-0 select-none">חדש 🆕</div>
                </div>
              ))}
            </div>
          </div>

          {!successMessage && (
            <button
              onClick={handleSaveToDb}
              disabled={isSaving}
              className="mt-6 w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
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
