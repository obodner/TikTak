import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  getDoc,
  arrayUnion,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Wrench,
  Download,
  Upload,
  UserPlus,
  Search,
  X,
  Pencil,
  Trash2,
  Phone,
  Star,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tag,
  Check,
  Plus,
  ArrowUpDown,
  FileSpreadsheet,
  Save,
  Database,
  Building2,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { ConfirmModal, ConfirmType } from './ConfirmModal';
import { VendorReviewHistoryModal } from './VendorReviewHistoryModal';
import { ManageTagsModal } from './ManageTagsModal';
import { logAction } from '../../utils/auditLogger';
import { Vendor, VendorType } from '../../types/rfq';
import {
  normalizeVendorPhone,
  isValidVendorPhone,
  parseVendorCsv,
  exportVendorsToCsv,
  ParsedVendorRecord
} from '../../utils/vendorCsvEngine';

export type { Vendor, VendorType };

interface VendorManagementProps {
  tenantId: string;
  callerUid: string;
  callerName: string;
  availableCategories?: string[];
}

const DEFAULT_CATEGORIES = [
  'אינסטלציה',
  'חשמל',
  'גינון',
  'בינוי / צבע',
  'מעליות',
  'ניקיון',
  'מיזוג אוויר',
  'אינטרקום ושערים',
  'משאבות מים',
  'איטום וגגות'
];

type SortOption = 'name' | 'category' | 'type' | 'rating';

export const VendorManagement: React.FC<VendorManagementProps> = ({
  tenantId,
  callerUid,
  callerName,
  availableCategories = []
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fleet Governance & Multi-Tenancy State (Single: 80, Fleet: 150)
  const [isFleet, setIsFleet] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [isChild, setIsChild] = useState(false);
  const [parentTenantName, setParentTenantName] = useState('');
  const [targetTenantId, setTargetTenantId] = useState(tenantId);
  const maxQuota = isFleet ? 150 : 80;

  // Search & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyModalVendor, setHistoryModalVendor] = useState<Vendor | null>(null);
  const [manageTagsModalOpen, setManageTagsModalOpen] = useState(false);

  // Category pool state
  const [categoryPool, setCategoryPool] = useState<string[]>(DEFAULT_CATEGORIES);
  const [customTagInput, setCustomTagInput] = useState('');
  const [showAddCustomTag, setShowAddCustomTag] = useState(false);

  // CSV Staged Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [isSavingCsv, setIsSavingCsv] = useState(false);
  const [stagedRecords, setStagedRecords] = useState<ParsedVendorRecord[]>([]);
  const [stagedErrors, setStagedErrors] = useState<string[]>([]);
  const [stagedNewTags, setStagedNewTags] = useState<string[]>([]);
  const [stagedNewCount, setStagedNewCount] = useState(0);
  const [stagedExistingCount, setStagedExistingCount] = useState(0);

  // Manual Form State
  const [formData, setFormData] = useState<{
    fullName: string;
    phone: string;
    email: string;
    companyId: string;
    categories: string[];
    vendorType: VendorType;
    notes: string;
  }>({
    fullName: '',
    phone: '',
    email: '',
    companyId: '',
    categories: [],
    vendorType: 'occasional',
    notes: ''
  });

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: ConfirmType;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning'
  });

  // Load building categories, fleet status, and vendors
  const loadTenantAndVendors = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'tenants', tenantId));
      let resolvedTargetTenantId = tenantId;
      let fleetStatus = false;
      let masterStatus = false;
      let childStatus = false;
      let pTenantId = '';
      let pTenantName = '';

      if (snap.exists()) {
        const data = snap.data();
        masterStatus = Boolean(
          data?.isPoolMaster ||
          data?.isFleet ||
          data?.type === 'fleet' ||
          data?.fleet ||
          data?.config?.isPoolMaster
        );
        childStatus = Boolean(
          (data?.usesParentPool || data?.config?.usesParentPool) &&
          (data?.parentEnterpriseId || data?.config?.parentEnterpriseId)
        );
        pTenantId = data?.parentEnterpriseId || data?.config?.parentEnterpriseId || '';
        fleetStatus = masterStatus || childStatus;

        if (childStatus && pTenantId) {
          resolvedTargetTenantId = pTenantId;
          try {
            const pSnap = await getDoc(doc(db, 'tenants', pTenantId));
            if (pSnap.exists()) {
              const pData = pSnap.data();
              pTenantName = pData?.name || '';
              if (Array.isArray(pData?.config?.categories)) {
                setCategoryPool(pData.config.categories);
              }
            }
          } catch (pErr) {
            console.warn('Could not load parent tenant metadata:', pErr);
          }
        } else {
          if (Array.isArray(data?.config?.categories)) {
            setCategoryPool(data.config.categories);
          } else {
            const initial = Array.from(
              new Set([...(availableCategories || []), ...DEFAULT_CATEGORIES])
            );
            setCategoryPool(initial);
            try {
              await updateDoc(doc(db, 'tenants', tenantId), {
                'config.categories': initial,
                updatedAt: new Date().toISOString()
              });
            } catch (initErr) {
              console.warn('Could not initialize tenant categories:', initErr);
            }
          }
        }
      }

      setIsFleet(fleetStatus);
      setIsMaster(masterStatus);
      setIsChild(childStatus);
      setParentTenantName(pTenantName);
      setTargetTenantId(resolvedTargetTenantId);

      // Fetch vendors from resolvedTargetTenantId (Parent enterprise pool if child building)
      const q = query(collection(db, 'tenants', resolvedTargetTenantId, 'vendors'));
      const snapshot = await getDocs(q);
      setVendors(
        snapshot.docs.map(d => {
          const data = d.data();
          let resolvedCategories: string[] = Array.isArray(data.categories) ? data.categories : [];
          if (resolvedCategories.length === 0 && data.profession) {
            resolvedCategories = [data.profession];
          }

          return {
            id: d.id,
            fullName: data.fullName || '',
            phone: data.phone || '',
            email: data.email || undefined,
            profession: data.profession || undefined,
            companyId: data.companyId || undefined,
            categories: resolvedCategories,
            vendorType: (data.vendorType as VendorType) || 'occasional',
            notes: data.notes || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            ratingSummary: data.ratingSummary || undefined
          } as Vendor;
        })
      );
    } catch (err: any) {
      console.error('Failed to load vendors / metadata:', err);
      setError('נכשלה טעינת אנשי השירות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenantAndVendors();
  }, [tenantId, availableCategories]);

  const fetchVendors = async () => {
    await loadTenantAndVendors();
  };

  const loadTenantMetadata = async () => {
    await loadTenantAndVendors();
  };

  // Phone input formatting (numbers only or leading +, hyphens stripped)
  const handlePhoneChange = (val: string) => {
    const cleaned = normalizeVendorPhone(val);
    setFormData(prev => ({ ...prev, phone: cleaned.slice(0, 15) }));
  };

  // CSV Import Workflow
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setSuccessMessage('');
    setStagedRecords([]);
    setStagedErrors([]);
    setStagedNewTags([]);
    setStagedNewCount(0);
    setStagedExistingCount(0);

    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (!selectedFile.name.endsWith('.csv') && !selectedFile.type.includes('csv')) {
        setError('אנא העלה קובץ CSV חוקי.');
        return;
      }
      setFile(selectedFile);
      parseCsvFile(selectedFile);
    }
  };

  const parseCsvFile = (selectedFile: File) => {
    setIsProcessingCsv(true);
    const reader = new FileReader();

    reader.onload = event => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer) throw new Error('הקובץ ריק');

        const encodings = ['utf-8', 'windows-1255', 'iso-8859-8', 'utf-16'];
        let parsedResult = null;
        let lastError = null;

        for (const encoding of encodings) {
          try {
            const decoder = new TextDecoder(encoding);
            const text = decoder.decode(arrayBuffer);
            parsedResult = parseVendorCsv(text, vendors, maxQuota);
            break;
          } catch (err: any) {
            lastError = err;
          }
        }

        if (!parsedResult) {
          throw lastError || new Error('שגיאה בפענוח קובץ ה-CSV.');
        }

        setStagedRecords(parsedResult.records);
        setStagedErrors(parsedResult.allErrors);
        setStagedNewTags(parsedResult.newTags);
        setStagedNewCount(parsedResult.newCount);
        setStagedExistingCount(parsedResult.existingCount);
      } catch (err: any) {
        setError(err.message || 'שגיאה בפענוח הקובץ.');
        setStagedRecords([]);
        setStagedErrors([]);
        setStagedNewTags([]);
        setStagedNewCount(0);
        setStagedExistingCount(0);
      } finally {
        setIsProcessingCsv(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      setError('שגיאה בקריאת הקובץ מהמכשיר.');
      setIsProcessingCsv(false);
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleCancelStagedUpload = () => {
    setFile(null);
    setStagedRecords([]);
    setStagedErrors([]);
    setStagedNewTags([]);
    setStagedNewCount(0);
    setStagedExistingCount(0);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveStagedToDb = async () => {
    if (stagedRecords.length === 0 || stagedErrors.length > 0) return;
    if (isChild) {
      setError('לא ניתן לעדכן מאגר ספקים מרכזי מבניין כפוף. פעולה זו שמורה להנהלת הצי.');
      return;
    }
    setIsSavingCsv(true);
    setError('');
    setSuccessMessage('');

    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      const vendorsColRef = collection(db, 'tenants', tenantId, 'vendors');

      // Map existing vendors by normalized phone to support smart upsert
      const existingByPhone = new Map<string, Vendor>();
      vendors.forEach(v => {
        existingByPhone.set(normalizeVendorPhone(v.phone), v);
      });

      let updatedCount = 0;
      let createdCount = 0;

      for (const record of stagedRecords) {
        const existing = existingByPhone.get(record.phone);
        const vendorData = {
          fullName: record.fullName,
          phone: record.phone,
          email: record.email || null,
          companyId: record.companyId || null,
          categories: record.categories,
          profession: record.categories.join(', ') || null,
          vendorType: record.vendorType,
          notes: record.notes || null,
          updatedAt: nowIso
        };

        if (existing) {
          // Smart Upsert: preserve existing document ID and live review ratings
          const docRef = doc(db, 'tenants', tenantId, 'vendors', existing.id);
          batch.update(docRef, vendorData);
          updatedCount++;
        } else {
          // Create new vendor document
          const newDocRef = doc(vendorsColRef);
          batch.set(newDocRef, {
            ...vendorData,
            createdAt: nowIso
          });
          createdCount++;
        }
      }

      // Sync new tags to tenant config pool
      if (stagedNewTags.length > 0) {
        const tenantRef = doc(db, 'tenants', tenantId);
        batch.update(tenantRef, {
          'config.categories': arrayUnion(...stagedNewTags),
          updatedAt: nowIso
        });
      }

      await batch.commit();

      // Audit Log
      await logAction({
        tenantId,
        action: 'VENDORS_BULK_IMPORTED',
        actor: { uid: callerUid, name: callerName, type: 'admin' },
        details: {
          fileName: file?.name,
          createdCount,
          updatedCount,
          totalRecords: stagedRecords.length
        }
      });

      setSuccessMessage(
        `הייבוא הושלם בהצלחה: ${createdCount} ספקים חדשים נוספו, ${updatedCount} ספקים קיימים עודכנו (כל הדירוגים וחוות הדעת נשמרו במלואם).`
      );
      setFile(null);
      setStagedRecords([]);
      setStagedErrors([]);
      setStagedNewTags([]);
      setStagedNewCount(0);
      setStagedExistingCount(0);
      await fetchVendors();
      await loadTenantMetadata();
    } catch (err: any) {
      console.error('Failed to commit staged vendors:', err);
      setError(err.message || 'שגיאה בשמירת הספקים למסד הנתונים');
    } finally {
      setIsSavingCsv(false);
    }
  };

  // CSV Export Workflow (UTF-8 with BOM and 4 split rating columns)
  const handleDownloadCsv = () => {
    if (vendors.length === 0) return;
    try {
      const csvContent = exportVendorsToCsv(vendors);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'tiktak_vendors_list.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export vendors:', err);
      setError('שגיאה בהורדת קובץ ה-CSV');
    }
  };

  // Manual Vendor Addition / Edit Modal
  const openCreate = () => {
    setEditingId(null);
    setFormData({
      fullName: '',
      phone: '',
      email: '',
      companyId: '',
      categories: [],
      vendorType: 'occasional',
      notes: ''
    });
    setCustomTagInput('');
    setShowAddCustomTag(false);
    setError('');
    setSuccessMessage('');
    setModalOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    const initialCats =
      Array.isArray(vendor.categories) && vendor.categories.length > 0
        ? vendor.categories
        : vendor.profession
        ? [vendor.profession]
        : [];

    setFormData({
      fullName: vendor.fullName,
      phone: normalizeVendorPhone(vendor.phone || ''),
      email: vendor.email || '',
      companyId: vendor.companyId || '',
      categories: initialCats,
      vendorType: vendor.vendorType || 'occasional',
      notes: vendor.notes || ''
    });

    setCategoryPool(prev => Array.from(new Set([...prev, ...initialCats])));
    setCustomTagInput('');
    setShowAddCustomTag(false);
    setError('');
    setSuccessMessage('');
    setModalOpen(true);
  };

  const toggleCategory = (cat: string) => {
    setFormData(prev => {
      const exists = prev.categories.includes(cat);
      if (exists) {
        return { ...prev, categories: prev.categories.filter(c => c !== cat) };
      } else {
        return { ...prev, categories: [...prev.categories, cat] };
      }
    });
  };

  const handleAddCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = customTagInput.trim();
    if (!cleanTag) return;

    if (!categoryPool.includes(cleanTag)) {
      setCategoryPool(prev => [...prev, cleanTag]);
    }
    if (!formData.categories.includes(cleanTag)) {
      setFormData(prev => ({ ...prev, categories: [...prev.categories, cleanTag] }));
    }
    setCustomTagInput('');
    setShowAddCustomTag(false);

    if (tenantId) {
      try {
        await updateDoc(doc(db, 'tenants', tenantId), {
          'config.categories': arrayUnion(cleanTag),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Could not sync custom tag to tenant config:', err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isChild) {
      setError('לא ניתן להוסיף או לערוך ספק במאגר הצי מבניין כפוף. פעולה זו שמורה להנהלת הצי.');
      return;
    }
    setError('');
    setSuccessMessage('');

    const cleanFullName = formData.fullName.trim();
    const cleanPhone = normalizeVendorPhone(formData.phone);
    const cleanEmail = formData.email.trim();
    const cleanCompanyId = formData.companyId.trim();
    const cleanNotes = formData.notes.trim();

    if (!cleanFullName) {
      setError('שם מלא הינו שדה חובה');
      return;
    }
    if (cleanFullName.length < 2 || cleanFullName.length > 50) {
      setError('שם מלא חייב להכיל בין 2 ל-50 תווים');
      return;
    }

    if (!cleanPhone) {
      setError('מספר טלפון הינו שדה חובה');
      return;
    }
    if (!isValidVendorPhone(cleanPhone)) {
      setError('מספר טלפון לא תקין. יש להזין ספרות בלבד או קידומת + בהתחלה (ללא מקפים)');
      return;
    }

    // Duplicate phone check: ensure cleanPhone does not already belong to another registered vendor
    const existingWithPhone = vendors.find(
      v => normalizeVendorPhone(v.phone) === cleanPhone && v.id !== editingId
    );
    if (existingWithPhone) {
      setError(
        `מספר הטלפון ${cleanPhone} כבר קיים במערכת ומשויך לספק "${existingWithPhone.fullName}". לא ניתן לשמור ספק עם מספר טלפון כפול.`
      );
      return;
    }

    if (formData.categories.length === 0) {
      setError('חובה לבחור לפחות תגית / תחום עיסוק אחד');
      return;
    }

    if (cleanEmail && !cleanEmail.includes('@')) {
      setError('כתובת אימייל לא תקינה');
      return;
    }

    if (!editingId && vendors.length >= maxQuota) {
      setError(`הגעת למכסה המרבית של ${maxQuota} ספקים (${isFleet ? 'צי' : 'ספק יחיד'})`);
      return;
    }

    setActionLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const vendorData = {
        fullName: cleanFullName,
        phone: cleanPhone,
        email: cleanEmail || null,
        companyId: cleanCompanyId || null,
        categories: formData.categories,
        profession: formData.categories.join(', ') || null,
        vendorType: formData.vendorType,
        notes: cleanNotes || null,
        updatedAt: nowIso
      };

      if (editingId) {
        const docRef = doc(db, 'tenants', tenantId, 'vendors', editingId);
        await updateDoc(docRef, vendorData);

        const oldVendor = vendors.find(v => v.id === editingId);
        await logAction({
          tenantId,
          action: 'VENDOR_UPDATED',
          actor: { uid: callerUid, name: callerName, type: 'admin' },
          details: { vendorId: editingId, fullName: cleanFullName },
          changes: oldVendor
            ? {
                previousValue: {
                  fullName: oldVendor.fullName,
                  phone: oldVendor.phone,
                  email: oldVendor.email,
                  categories: oldVendor.categories,
                  vendorType: oldVendor.vendorType,
                  notes: oldVendor.notes
                },
                newValue: vendorData
              }
            : null
        });
        setSuccessMessage('איש השירות עודכן בהצלחה');
      } else {
        const colRef = collection(db, 'tenants', tenantId, 'vendors');
        const docRef = await addDoc(colRef, {
          ...vendorData,
          createdAt: nowIso
        });

        await logAction({
          tenantId,
          action: 'VENDOR_ADDED',
          actor: { uid: callerUid, name: callerName, type: 'admin' },
          details: {
            vendorId: docRef.id,
            fullName: cleanFullName,
            phone: cleanPhone,
            categories: formData.categories
          }
        });
        setSuccessMessage('איש שירות חדש נוצר בהצלחה');
      }

      if (formData.categories.length > 0 && tenantId) {
        try {
          await updateDoc(doc(db, 'tenants', tenantId), {
            'config.categories': arrayUnion(...formData.categories),
            updatedAt: nowIso
          });
        } catch (err) {
          console.warn('Could not sync categories to tenant config:', err);
        }
      }

      setModalOpen(false);
      setEditingId(null);
      await fetchVendors();
      await loadTenantMetadata();
    } catch (err: any) {
      console.error('Error saving vendor:', err);
      setError(err.message || 'שגיאה בשמירת איש השירות');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = (vendor: Vendor) => {
    if (isChild) {
      setError('לא ניתן למחוק ספק ממאגר הצי מבניין כפוף. פעולה זו שמורה להנהלת הצי.');
      return;
    }
    setConfirmState({
      isOpen: true,
      title: 'מחיקת איש שירות',
      message: `האם אתה בטוח שברצונך למחוק את ${vendor.fullName}? פעולה זו סופית.`,
      type: 'danger',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const docRef = doc(db, 'tenants', tenantId, 'vendors', vendor.id);
          await deleteDoc(docRef);

          await logAction({
            tenantId,
            action: 'VENDOR_DELETED',
            actor: { uid: callerUid, name: callerName, type: 'admin' },
            details: { vendorId: vendor.id, fullName: vendor.fullName }
          });

          setSuccessMessage('איש השירות נמחק בהצלחה');
          await fetchVendors();
        } catch (err: any) {
          console.error('Error deleting vendor:', err);
          setError(err.message || 'שגיאה במחיקת איש השירות');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  // Live Filtering & Sorting
  const filteredVendors = vendors
    .filter(v => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        v.fullName.toLowerCase().includes(q) ||
        v.phone.includes(q) ||
        (v.categories && v.categories.some(c => c.toLowerCase().includes(q))) ||
        (v.companyId && v.companyId.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.fullName.localeCompare(b.fullName, 'he');
        case 'category': {
          const catA = (a.categories && a.categories[0]) || '';
          const catB = (b.categories && b.categories[0]) || '';
          return catA.localeCompare(catB, 'he');
        }
        case 'type':
          if (a.vendorType === b.vendorType) {
            return a.fullName.localeCompare(b.fullName, 'he');
          }
          return a.vendorType === 'retainer' ? -1 : 1;
        case 'rating': {
          const scoreA = a.ratingSummary?.averageScore || 0;
          const scoreB = b.ratingSummary?.averageScore || 0;
          return scoreB - scoreA;
        }
        default:
          return 0;
      }
    });

  const isLimitReached = vendors.length >= maxQuota;

  // Real-time duplicate phone detection for manual vendor form
  const duplicateVendor = formData.phone
    ? vendors.find(
        v => normalizeVendorPhone(v.phone) === normalizeVendorPhone(formData.phone) && v.id !== editingId
      )
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
      {/* Header (Matching CsvUploadPanel style & layout) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shrink-0">
            <Wrench size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-slate-800 text-base">קבלנים וספקים מורשים</h3>
              {/* Prominent Total Vendors Counter Badge */}
              <span className="text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                {isChild
                  ? `מאגר ספקים מרכזי של הצי • ${vendors.length} ספקים מורשים`
                  : isMaster
                  ? `מאגר ספקים מרכזי (ניהול צי) • ${vendors.length} / ${maxQuota}`
                  : `סה"כ ספקים: ${vendors.length} / ${maxQuota}`}
              </span>
              {isFleet && !isChild && (
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                  ניהול צי (Fleet Master)
                </span>
              )}
              {isChild && (
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                  בניין בצי (Child Building)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isChild
                ? 'ספקים קבועים וקבלנים מורשים של הצי עבור הפצת קריאות שירות ובקשת הצעות מחיר (RFQ)'
                : 'ספקים קבועים וקבלנים מזדמנים עבור הפצת קריאות שירות ובקשת הצעות מחיר (RFQ)'}
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {/* Download CSV - Accessible to both Fleet Master and Child */}
          <button
            onClick={handleDownloadCsv}
            disabled={vendors.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all disabled:opacity-30 cursor-pointer"
            title="הורד רשימת קבלנים כקובץ CSV (UTF-8)"
          >
            <Download size={14} />
            <span>הורדה</span>
          </button>

          {/* Upload CSV - Available to Master & Single tenants only */}
          {!isChild && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingCsv || isSavingCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              title="העלה רשימת קבלנים מקובץ CSV"
            >
              <Upload size={14} />
              <span>העלאה</span>
            </button>
          )}

          {/* Manage Tags Trigger - Available to Master & Single tenants only */}
          {!isChild && (
            <button
              onClick={() => setManageTagsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
              title="ניהול תגיות: מחיקה ומיזוג"
            >
              <Tag size={14} />
              <span>ניהול תגיות</span>
            </button>
          )}
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv,text/csv"
        className="hidden"
      />

      {/* Child Building Enterprise Inheritance Banner */}
      {isChild && (
        <div className="mb-4 p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center justify-between gap-3 text-indigo-950 text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Building2 size={20} className="text-indigo-600 shrink-0" />
            <div>
              <p className="font-extrabold text-indigo-900">
                מאגר ספקים מרכזי (סנכרון ניהול צי)
                {parentTenantName ? ` • ${parentTenantName}` : ''}
              </p>
              <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                רשימת הקבלנים והספקים נקבעת ומנוהלת באופן בלעדי על ידי הנהלת הצי המרכזית.
                הספקים המאושרים זמינים כאן לצפייה, הורדה לאקסל, פנייה ישירה ושילוח במכרזי RFQ של הבניין.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 font-bold rounded-lg text-[10px] shrink-0 border border-indigo-200">
            קריאה בלבד
          </span>
        </div>
      )}

      {/* Global Alert Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="shrink-0 mt-0.5 text-red-500" size={18} />
          <div className="flex-1">
            <p className="font-bold text-sm">שגיאה</p>
            <p className="text-xs mt-0.5 leading-relaxed">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center justify-between gap-2 font-bold text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage('')} className="text-green-600 hover:text-green-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. STAGED CSV PREVIEW PANEL (Matches CsvUploadPanel)     */}
      {/* ========================================================= */}
      {file && (
        <div className="mb-6 p-4 bg-blue-50/50 border border-blue-200 rounded-2xl animate-in fade-in">
          <div className="flex items-center justify-between mb-3 border-b border-blue-100 pb-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-blue-600" size={20} />
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm">תצוגה מקדימה של קובץ ה-CSV</h4>
                <p className="text-[11px] text-slate-500" dir="ltr">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelStagedUpload}
                disabled={isSavingCsv}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSaveStagedToDb}
                disabled={isSavingCsv || isProcessingCsv || stagedErrors.length > 0 || stagedRecords.length === 0}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isSavingCsv ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>
                  שמור למסד הנתונים ({stagedNewCount} חדשים{stagedExistingCount > 0 ? `, ${stagedExistingCount} עדכונים` : ''})
                </span>
              </button>
            </div>
          </div>

          {/* Validation Feedback */}
          {stagedErrors.length > 0 ? (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs space-y-1 mb-3">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle size={14} />
                <span>נמצאו שגיאות המונעות את שמירת הקובץ:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 max-h-36 overflow-y-auto pr-1">
                {stagedErrors.map((err, idx) => (
                  <li key={idx} className="font-medium text-[11px]">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-2.5 mb-3">
              <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                <span>
                  הקובץ נבדק בהצלחה! סה"כ רשומות תקינות: {stagedRecords.filter(r => r.errors.length === 0).length}
                  {stagedNewTags.length > 0 && ` (${stagedNewTags.length} תגיות חדשות יתווספו למאגר)`}
                </span>
              </div>

              {/* Explicit New vs Existing Breakdown & Rating Guarantee Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2.5">
                  <UserPlus size={18} className="text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-extrabold text-xs">{stagedNewCount} ספקים חדשים</span>
                    <span className="text-emerald-700 text-[11px] block mt-0.5">
                      ייווצרו כרשומות חדשות במאגר
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 rounded-xl flex items-center gap-2.5 ${
                  stagedExistingCount > 0
                    ? 'bg-amber-50/90 border border-amber-300 text-amber-950'
                    : 'bg-slate-50 border border-slate-200 text-slate-600'
                }`}>
                  <ShieldCheck size={18} className={stagedExistingCount > 0 ? "text-amber-600 shrink-0" : "text-slate-400 shrink-0"} />
                  <div>
                    <span className="font-extrabold text-xs">{stagedExistingCount} ספקים קיימים (עדכון פרטים)</span>
                    <span className={`text-[11px] block mt-0.5 ${stagedExistingCount > 0 ? 'text-amber-800 font-medium' : 'text-slate-500'}`}>
                      {stagedExistingCount > 0
                        ? 'זוהה מספר טלפון קיים — פרטי הספק יתרעננו, וכל הדירוגים וחוות הדעת יישמרו במלואם ✓'
                        : 'לא זוהו ספקים קיימים בקובץ'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Staged Table Preview */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">#</th>
                  <th className="p-2.5">סוג</th>
                  <th className="p-2.5">שם מלא</th>
                  <th className="p-2.5">טלפון</th>
                  <th className="p-2.5">תגיות</th>
                  <th className="p-2.5">אימייל / ח.פ.</th>
                  <th className="p-2.5">סטטוס שורה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {stagedRecords.map((r, i) => (
                  <tr key={i} className={r.errors.length > 0 ? 'bg-red-50/40 text-red-900' : 'hover:bg-slate-50'}>
                    <td className="p-2.5 text-slate-400 font-mono text-[11px]">{r.rowNumber}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.vendorType === 'retainer'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.vendorType === 'retainer' ? 'קבוע' : 'מזדמן'}
                      </span>
                    </td>
                    <td className="p-2.5 font-bold text-slate-800">{r.fullName || '—'}</td>
                    <td className="p-2.5 font-mono text-slate-600" dir="ltr">
                      {r.phone || '—'}
                    </td>
                    <td className="p-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {r.categories.map((c, ci) => (
                          <span key={ci} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5 text-slate-500 text-[11px]" dir="ltr">
                      {r.email || r.companyId || '—'}
                    </td>
                    <td className="p-2.5">
                      {r.errors.length > 0 ? (
                        <span className="text-red-600 font-bold text-[10px] bg-red-100/70 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <AlertCircle size={11} className="shrink-0" />
                          <span>שגיאה בשורה</span>
                        </span>
                      ) : r.isExisting ? (
                        <div className="flex flex-col gap-0.5">
                          <span
                            className="text-amber-900 font-bold text-[10px] bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                            title={`ספק קיים: "${r.existingVendorName || 'רשום במערכת'}". פרטי קשר ותגיות יעודכנו ללא פגיעה בדירוגים.`}
                          >
                            <RefreshCw size={10} className="text-amber-700 shrink-0" />
                            <span>ספק קיים (עדכון)</span>
                          </span>
                          <span className="text-[9px] text-emerald-700 font-bold px-1 inline-flex items-center gap-0.5">
                            <Check size={9} className="stroke-[3]" />
                            <span>דירוגים נשמרים</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Plus size={11} className="shrink-0" />
                          <span>ספק חדש</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. DIRECTORY CONTROLS: Add, Search, Sort & Counter        */}
      {/* ========================================================= */}
      {!file && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Direct Add Contractor Button - Available to Master & Single tenants only */}
            {!isChild && (
              <button
                onClick={openCreate}
                disabled={isLimitReached || actionLoading}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                  isLimitReached
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-blue-100'
                }`}
              >
                <UserPlus size={15} />
                <span>הוסף איש שירות</span>
              </button>
            )}

            {/* Search Input Bar (Matching CsvUploadPanel style) */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="חיפוש קבלן לפי שם, טלפון, תחום עיסוק או ח.פ..."
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

            {/* Sort Selector Dropdown */}
            <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <ArrowUpDown size={14} className="text-slate-500" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="name">מיון: שם מלא (א-ת)</option>
                <option value="category">מיון: תחום עיסוק (א-ת)</option>
                <option value="type">מיון: סוג ספק (קבועים תחילה)</option>
                <option value="rating">מיון: דירוג (גבוה לנמוך)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. VENDORS TABLE (Matching Residents Whitelist Table)    */}
      {/* ========================================================= */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Table summary sub-header bar */}
        <div className="flex items-center justify-between mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 text-slate-700">
            <Database size={18} className="shrink-0 text-blue-600" />
            <span className="font-bold text-sm">
              {isChild ? 'קבלנים וספקים מאושרים (צי)' : 'קבלנים וספקים רשומים'} (
              {filteredVendors.length === vendors.length
                ? vendors.length
                : `${filteredVendors.length} מתוך ${vendors.length}`}
              )
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {isChild ? `ספקים בצי: ${vendors.length}` : `מכסה: ${vendors.length} / ${maxQuota}`}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center p-8">
            <p className="text-blue-600 font-bold animate-pulse">טוען קבלנים ואנשי שירות...</p>
          </div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-10 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-500 font-bold text-sm">
              {isChild ? 'טרם הוגדרו אנשי שירות במאגר הצי' : 'טרם הוגדרו אנשי שירות במערכת'}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {isChild
                ? 'אנשי שירות יופיעו כאן באופן אוטומטי לאחר שיוספו על ידי הנהלת הצי.'
                : 'העלה קובץ CSV או לחץ על "הוסף איש שירות" כדי להוסיף קבלנים ראשונים.'}
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col relative w-full">
            {/* Table Header */}
            <div className="grid grid-cols-[85px_1fr_115px_1.4fr_135px_65px] bg-slate-50 border-b border-slate-200 p-3 font-black text-xs text-slate-500 uppercase shrink-0">
              <div>סוג</div>
              <div>שם מלא</div>
              <div>טלפון</div>
              <div>תחומי עיסוק</div>
              <div>דירוג</div>
              <div className="text-center">{isChild ? 'סטטוס' : 'פעולות'}</div>
            </div>

                {/* Table Body */}
                <div className="overflow-y-auto p-1 bg-white max-h-[460px] divide-y divide-slate-100">
                  {filteredVendors.length === 0 ? (
                    <div className="text-center text-slate-400 p-8 text-xs font-medium">
                      לא נמצאו ספקים מתאימים עבור הסינון הנוכחי.
                    </div>
                  ) : (
                    filteredVendors.map(v => (
                      <div
                        key={v.id}
                        className="grid grid-cols-[85px_1fr_115px_1.4fr_135px_65px] p-2.5 text-xs items-center transition-colors rounded-lg hover:bg-slate-50/80"
                      >
                        {/* 1. סוג ספק */}
                        <div>
                          <span
                            className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full border ${
                              v.vendorType === 'retainer'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {v.vendorType === 'retainer' ? 'קבוע 🏢' : 'מזדמן 🛠️'}
                          </span>
                        </div>

                        {/* 2. שם מלא */}
                        <div className="min-w-0 pr-1">
                          <div className="font-bold text-slate-800 truncate" title={v.fullName}>
                            {v.fullName}
                          </div>
                          {(v.companyId || v.notes) && (
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {v.companyId && <span className="font-mono">ח.פ: {v.companyId}</span>}
                              {v.companyId && v.notes && <span> • </span>}
                              {v.notes && <span className="italic">{v.notes}</span>}
                            </div>
                          )}
                        </div>

                        {/* 3. טלפון */}
                        <div className="font-mono text-slate-700 text-right truncate pr-1" dir="ltr">
                          <a
                            href={`tel:${v.phone}`}
                            className="hover:text-blue-600 transition-colors inline-flex items-center gap-1 font-bold"
                          >
                            <Phone size={11} className="text-slate-400 shrink-0" />
                            <span>{v.phone}</span>
                          </a>
                        </div>

                        {/* 4. תחומי עיסוק (תגיות) */}
                        <div className="flex flex-wrap gap-1 pr-1 overflow-hidden">
                          {v.categories && v.categories.length > 0 ? (
                            v.categories.map((cat, ci) => (
                              <span
                                key={ci}
                                className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200/80 truncate max-w-[110px]"
                                title={cat}
                              >
                                {cat}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">ללא תגיות</span>
                          )}
                        </div>

                        {/* 5. דירוג */}
                        <div className="pr-1">
                          {v.ratingSummary && v.ratingSummary.totalReviews > 0 ? (
                            <button
                              type="button"
                              onClick={() => setHistoryModalVendor(v)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                              title="צפה בהיסטוריית הביצועים וחוות הדעת"
                            >
                              <Star size={11} className="fill-amber-400 text-amber-500" />
                              <span>{v.ratingSummary.averageScore.toFixed(1)}</span>
                              <span className="text-slate-400 font-normal text-[10px]">
                                ({v.ratingSummary.totalReviews})
                              </span>
                              <span className="text-emerald-700 font-black text-[10px]">
                                {v.ratingSummary.rehirePercentage}%
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[10px] font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                              טרם דורג
                            </span>
                          )}
                        </div>

                        {/* 6. פעולות / סטטוס */}
                        <div className="flex items-center justify-center gap-1.5">
                          {isChild ? (
                            <span
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"
                              title="ספק מורשה ע״י הנהלת הצי"
                            >
                              מורשה
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => openEdit(v)}
                                disabled={actionLoading}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1 cursor-pointer rounded hover:bg-blue-50"
                                title="ערוך ספק"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(v)}
                                disabled={actionLoading}
                                className="text-slate-400 hover:text-red-600 transition-colors p-1 cursor-pointer rounded hover:bg-red-50"
                                title="מחק ספק"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
      </div>

      {/* ========================================================= */}
      {/* 4. MANUAL ADDITION / EDIT MODAL                           */}
      {/* ========================================================= */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h4 className="font-extrabold text-slate-800 text-base">
                {editingId ? 'עריכת איש שירות' : 'הוספת איש שירות חדש'}
              </h4>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setError('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form className="p-6 space-y-4 overflow-y-auto flex-1" onSubmit={handleSubmit}>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {/* Vendor Type Classification */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5 px-1">
                  סיווג ספק <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, vendorType: 'occasional' })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      formData.vendorType === 'occasional'
                        ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span>🛠️</span>
                    <span>קבלן מזדמן</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, vendorType: 'retainer' })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      formData.vendorType === 'retainer'
                        ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span>🏢</span>
                    <span>ספק קבוע (ריטיינר)</span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  שם מלא <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="לדוגמה: ישראל ישראלי"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              {/* Phone (Numbers only or leading +, hyphens stripped) */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  טלפון נייד <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={15}
                  value={formData.phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="0501234567 או 972501234567+"
                  className={`w-full border rounded-lg p-2.5 text-sm outline-none text-left transition-colors ${
                    duplicateVendor
                      ? 'border-red-400 bg-red-50/40 text-red-900 focus:ring-2 focus:ring-red-200'
                      : 'border-slate-200 focus:ring-2 focus:ring-blue-100'
                  }`}
                  dir="ltr"
                />
                {duplicateVendor ? (
                  <p className="text-[11px] text-red-600 font-bold mt-1 px-1 flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0 text-red-500" />
                    <span>
                      מספר זה כבר רשום במערכת ומשויך לספק "{duplicateVendor.fullName}"
                    </span>
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1 px-1">
                    ספרות בלבד או קידומת + בהתחלה (ללא מקפים או רווחים).
                  </p>
                )}
              </div>

              {/* Multi-Select Category Pills */}
              <div>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <label className="text-xs font-black text-slate-500 uppercase">
                    תחומי עיסוק ותגיות ({formData.categories.length} נבחרו) <span className="text-red-500">*</span>
                  </label>
                  {!showAddCustomTag && (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomTag(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>הוסף תגית חדשה</span>
                    </button>
                  )}
                </div>

                {showAddCustomTag && (
                  <div className="flex items-center gap-1.5 mb-2 bg-blue-50/70 p-2 rounded-xl border border-blue-100">
                    <input
                      type="text"
                      maxLength={25}
                      value={customTagInput}
                      onChange={e => setCustomTagInput(e.target.value)}
                      placeholder="שם תגית חדשה (לדוגמה: הדברה)..."
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold"
                    >
                      הוסף
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCustomTag(false);
                        setCustomTagInput('');
                      }}
                      className="text-slate-400 hover:text-slate-600 px-1 text-xs"
                    >
                      ביטול
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                  {categoryPool.map(cat => {
                    const isSelected = formData.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-300'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && <Check size={12} className="stroke-[3]" />}
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Fields: Company ID & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                    ח.פ. / ת.ז. (רשות)
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={formData.companyId}
                    onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                    placeholder="512345678"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-blue-100 outline-none text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                    אימייל (רשות)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="vendor@example.com"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-blue-100 outline-none text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  הערות פנימיות לוועד (רשות)
                </label>
                <textarea
                  rows={2}
                  maxLength={150}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="זמין לקריאות חירום בסופי שבוע..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={actionLoading || Boolean(duplicateVendor)}
                  className={`w-full font-bold py-3 rounded-xl transition-all flex justify-center items-center gap-2 cursor-pointer ${
                    duplicateVendor
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100'
                  }`}
                  title={duplicateVendor ? `מספר טלפון זה כבר רשום במערכת (${duplicateVendor.fullName})` : undefined}
                >
                  {actionLoading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : editingId ? (
                    <Pencil size={18} />
                  ) : (
                    <UserPlus size={18} />
                  )}
                  <span>{editingId ? 'שמור שינויים' : 'צור איש שירות'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
      />

      {/* Vendor Review & Performance History Modal */}
      {historyModalVendor && (
        <VendorReviewHistoryModal
          isOpen={Boolean(historyModalVendor)}
          onClose={() => setHistoryModalVendor(null)}
          tenantId={targetTenantId}
          vendor={historyModalVendor}
        />
      )}

      {/* Tag Governance Modal (Merge / Delete) */}
      <ManageTagsModal
        isOpen={manageTagsModalOpen}
        onClose={() => setManageTagsModalOpen(false)}
        tenantId={tenantId}
        callerUid={callerUid}
        callerName={callerName}
        categoryPool={categoryPool}
        vendors={vendors}
        onTagsUpdated={async updatedPool => {
          if (updatedPool) {
            setCategoryPool(updatedPool);
          }
          await fetchVendors();
          await loadTenantMetadata();
        }}
      />
    </div>
  );
};
