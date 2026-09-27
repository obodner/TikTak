import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserPlus, Trash2, Mail, Phone, Wrench, Loader2, X, Pencil, AlertCircle, Plus, Check } from 'lucide-react';
import { ConfirmModal, ConfirmType } from './ConfirmModal';
import { logAction } from '../../utils/auditLogger';
import { Vendor, VendorType } from '../../types/rfq';

export type { Vendor, VendorType };

interface VendorManagementProps {
  tenantId: string;
  callerUid: string;
  callerName: string;
  availableCategories?: string[];
}

const MAX_VENDORS = 25;

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

export const VendorManagement: React.FC<VendorManagementProps> = ({
  tenantId,
  callerUid,
  callerName,
  availableCategories = []
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Category pool state
  const [categoryPool, setCategoryPool] = useState<string[]>(DEFAULT_CATEGORIES);
  const [customTagInput, setCustomTagInput] = useState('');
  const [showAddCustomTag, setShowAddCustomTag] = useState(false);

  // Form State
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

  // Load building categories from prop or tenant doc
  useEffect(() => {
    async function loadBuildingCategories() {
      if (availableCategories && availableCategories.length > 0) {
        setCategoryPool(Array.from(new Set([...availableCategories, ...DEFAULT_CATEGORIES])));
        return;
      }

      if (!tenantId) return;
      try {
        const snap = await getDoc(doc(db, "tenants", tenantId));
        if (snap.exists()) {
          const configCats: string[] = snap.data()?.config?.categories || [];
          if (configCats.length > 0) {
            setCategoryPool(Array.from(new Set([...configCats, ...DEFAULT_CATEGORIES])));
          }
        }
      } catch (e) {
        console.warn("Could not load tenant categories:", e);
      }
    }
    loadBuildingCategories();
  }, [tenantId, availableCategories]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "tenants", tenantId, "vendors"));
      const snapshot = await getDocs(q);
      setVendors(snapshot.docs.map(d => {
        const data = d.data();
        // Support legacy vendors where profession was free-text
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
          updatedAt: data.updatedAt
        } as Vendor;
      }));
    } catch (err: any) {
      console.error("Failed to load vendors:", err);
      setError('נכשלה טעינת אנשי השירות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [tenantId]);

  const handlePhoneChange = (val: string) => {
    // Allows '+' only as the very first character, followed by digits, up to 15 chars
    let cleaned = val.replace(/(?!^\+)[^\d]/g, '');
    if (cleaned.length > 15) {
      cleaned = cleaned.slice(0, 15);
    }
    setFormData(prev => ({ ...prev, phone: cleaned }));
  };

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
    setMsg('');
    setModalOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    const initialCats = Array.isArray(vendor.categories) && vendor.categories.length > 0
      ? vendor.categories
      : (vendor.profession ? [vendor.profession] : []);

    setFormData({
      fullName: vendor.fullName,
      phone: vendor.phone || '',
      email: vendor.email || '',
      companyId: vendor.companyId || '',
      categories: initialCats,
      vendorType: vendor.vendorType || 'occasional',
      notes: vendor.notes || ''
    });

    // Ensure any custom categories from this vendor are visible in the pool
    setCategoryPool(prev => Array.from(new Set([...prev, ...initialCats])));
    setCustomTagInput('');
    setShowAddCustomTag(false);
    setError('');
    setMsg('');
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
        await updateDoc(doc(db, "tenants", tenantId), {
          "config.categories": arrayUnion(cleanTag),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn("Could not sync custom tag to tenant config:", err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    const cleanFullName = formData.fullName.trim();
    const cleanPhone = formData.phone.trim();
    const cleanEmail = formData.email.trim();
    const cleanCompanyId = formData.companyId.trim();
    const cleanNotes = formData.notes.trim();

    // Validation
    if (!cleanFullName) {
      setError("שם מלא הינו שדה חובה");
      return;
    }
    if (cleanFullName.length > 30) {
      setError("שם מלא חייב להיות עד 30 תווים");
      return;
    }

    if (!cleanPhone) {
      setError("מספר טלפון הינו שדה חובה");
      return;
    }
    if (cleanPhone.length > 15) {
      setError("מספר טלפון חייב להיות עד 15 תווים");
      return;
    }
    // Must start with 0 or + and contain digits
    const phoneRegex = /^(0|\+)[0-9]{6,14}$/;
    if (!phoneRegex.test(cleanPhone.replace(/[-\s]/g, ''))) {
      setError("מספר טלפון חייב להתחיל ב-0 או + ולהכיל ספרות תקינות");
      return;
    }

    if (cleanEmail && !cleanEmail.includes('@')) {
      setError("כתובת אימייל לא תקינה");
      return;
    }

    if (!editingId && vendors.length >= MAX_VENDORS) {
      setError(`הגעת למכסה המרבית של ${MAX_VENDORS} אנשי שירות`);
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
        profession: formData.categories.join(', ') || null, // legacy backward compatibility
        vendorType: formData.vendorType,
        notes: cleanNotes || null,
        updatedAt: nowIso
      };

      if (editingId) {
        // Update existing vendor
        const docRef = doc(db, "tenants", tenantId, "vendors", editingId);
        await updateDoc(docRef, vendorData);

        const oldVendor = vendors.find(v => v.id === editingId);
        await logAction({
          tenantId,
          action: 'VENDOR_UPDATED',
          actor: { uid: callerUid, name: callerName, type: 'admin' },
          details: { vendorId: editingId, fullName: cleanFullName },
          changes: oldVendor ? {
            previousValue: {
              fullName: oldVendor.fullName,
              phone: oldVendor.phone,
              email: oldVendor.email,
              categories: oldVendor.categories,
              vendorType: oldVendor.vendorType,
              notes: oldVendor.notes
            },
            newValue: vendorData
          } : null
        });
        setMsg('איש השירות עודכן בהצלחה');
      } else {
        // Create new vendor
        const colRef = collection(db, "tenants", tenantId, "vendors");
        const docRef = await addDoc(colRef, {
          ...vendorData,
          createdAt: nowIso
        });

        await logAction({
          tenantId,
          action: 'VENDOR_ADDED',
          actor: { uid: callerUid, name: callerName, type: 'admin' },
          details: { vendorId: docRef.id, fullName: cleanFullName, phone: cleanPhone, categories: formData.categories }
        });
        setMsg('איש שירות חדש נוצר בהצלחה');
      }

      // Also ensure all selected categories are registered in tenant config
      if (formData.categories.length > 0 && tenantId) {
        try {
          await updateDoc(doc(db, "tenants", tenantId), {
            "config.categories": arrayUnion(...formData.categories),
            updatedAt: nowIso
          });
        } catch (err) {
          console.warn("Could not sync categories to tenant config:", err);
        }
      }

      setModalOpen(false);
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
      await fetchVendors();
    } catch (err: any) {
      console.error("Error saving vendor:", err);
      setError(err.message || 'שגיאה בשמירת איש השירות');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = (vendor: Vendor) => {
    setConfirmState({
      isOpen: true,
      title: 'מחיקת איש שירות',
      message: `האם אתה בטוח שברצונך למחוק את ${vendor.fullName}? פעולה זו סופית.`,
      type: 'danger',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const docRef = doc(db, "tenants", tenantId, "vendors", vendor.id);
          await deleteDoc(docRef);

          await logAction({
            tenantId,
            action: 'VENDOR_DELETED',
            actor: { uid: callerUid, name: callerName, type: 'admin' },
            details: { vendorId: vendor.id, fullName: vendor.fullName }
          });

          setMsg('איש השירות נמחק בהצלחה');
          await fetchVendors();
        } catch (err: any) {
          console.error("Error deleting vendor:", err);
          setError(err.message || 'שגיאה במחיקת איש השירות');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const isLimitReached = vendors.length >= MAX_VENDORS;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <Wrench className="text-blue-600" size={16} />
            <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">קבלנים וספקים</h3>
          </div>
          <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {vendors.length} / {MAX_VENDORS}
          </span>
        </div>

        <p className="text-[11px] text-slate-500 leading-tight">
          אנשי שירות וקבלנים מוגדרים עבור הפצת קריאות שירות ובקשת הצעות מחיר (RFQ).
        </p>

        <div>
          <button
            onClick={openCreate}
            disabled={isLimitReached || actionLoading}
            className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${
              isLimitReached
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-blue-100'
            }`}
          >
            <UserPlus size={14} />
            <span>הוסף איש שירות חדש</span>
          </button>
        </div>
      </div>

      <div className="p-4">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold border border-red-100">{error}</div>}
        {msg && <div className="mb-3 p-2 bg-green-50 text-green-600 rounded-lg text-[11px] font-bold border border-green-100">{msg}</div>}

        {loading ? (
          <div className="flex flex-col items-center py-8 gap-2 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest">טוען...</span>
          </div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-8 text-slate-400 italic text-xs">טרם הוגדרו אנשי שירות</div>
        ) : (
          <div className="flex flex-col gap-3">
            {vendors.map(v => (
              <div key={v.id} className="p-3 border border-slate-100 rounded-xl hover:border-blue-100 transition-colors shadow-sm bg-slate-50/20 flex flex-col gap-2">
                <div className="flex flex-col text-right">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">
                        {v.fullName}
                      </p>
                      {/* Vendor Type Badge */}
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 border ${
                        v.vendorType === 'retainer'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {v.vendorType === 'retainer' ? 'ספק קבוע 🏢' : 'קבלן מזדמן 🛠️'}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => openEdit(v)}
                        disabled={actionLoading}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="עריכה"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(v)}
                        disabled={actionLoading}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="מחיקה"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Categories Tags */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {v.categories && v.categories.length > 0 ? (
                      v.categories.map((cat, i) => (
                        <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200/80">
                          {cat}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">ללא קטגוריות</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-2">
                    <Phone size={10} className="shrink-0" />
                    <span className="opacity-80" dir="ltr">{v.phone}</span>
                  </div>
                  {v.email && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Mail size={10} className="shrink-0" />
                      <span className="truncate opacity-80" title={v.email} dir="ltr">{v.email}</span>
                    </div>
                  )}
                  {v.companyId && (
                    <div className="text-[11px] text-slate-500 font-medium mt-1">
                      <span className="font-bold text-slate-700">ח.פ./ת.ז.:</span> <span dir="ltr">{v.companyId}</span>
                    </div>
                  )}
                  {v.notes && (
                    <p className="text-[11px] text-slate-500 mt-1 italic line-clamp-1 bg-amber-50/50 p-1.5 rounded-lg border border-amber-100/50">
                      📝 {v.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h4 className="font-extrabold text-slate-800 text-base">{editingId ? 'עריכת איש שירות' : 'הוספת איש שירות חדש'}</h4>
              <button onClick={() => { setModalOpen(false); setError(''); }} className="text-slate-400 hover:text-slate-600 p-1">
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
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  {formData.vendorType === 'retainer'
                    ? 'ספק בהסכם שירות חודשי קבוע (גינון שוטף, ניקיון, מעליות)'
                    : 'קבלן המוזמן לקריאות שירות והצעות מחיר לפי דרישה'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  שם מלא <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={30}
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="לדוגמה: ישראל ישראלי"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

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
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  ח.פ. / ת.ז. (רשות)
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={formData.companyId}
                  onChange={e => setFormData({ ...formData, companyId: e.target.value })}
                  placeholder="לדוגמה: 512345678 או 012345678"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">אימייל (רשות)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="vendor@example.com"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              {/* Multi-Select Category Pills */}
              <div>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <label className="text-xs font-black text-slate-500 uppercase">
                    תחומי עיסוק וקטגוריות ({formData.categories.length} נבחרו)
                  </label>
                  {!showAddCustomTag && (
                    <button
                      type="button"
                      onClick={() => setShowAddCustomTag(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>הוסף תגית מותאמת</span>
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
                      onClick={() => { setShowAddCustomTag(false); setCustomTagInput(''); }}
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
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  קבלן זה יופיע אוטומטית ברשימת הספקים כאשר תפתח בקשת הצעת מחיר (RFQ) באחת מקטגוריות אלו.
                </p>
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
                  placeholder="לדוגמה: הומלץ ע״י דירה 12, זמין בסופי שבוע..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 flex justify-center items-center gap-2 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={18} /> : (editingId ? <Pencil size={18} /> : <UserPlus size={18} />)}
                  {editingId ? 'שמור שינויים' : 'צור איש שירות'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
      />
    </div>
  );
};
