import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserPlus, Trash2, Mail, Phone, Wrench, Loader2, X, Pencil, Briefcase, AlertCircle } from 'lucide-react';
import { ConfirmModal, ConfirmType } from './ConfirmModal';
import { logAction } from '../../utils/auditLogger';

export interface Vendor {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  profession?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface VendorManagementProps {
  tenantId: string;
  callerUid: string;
  callerName: string;
}

const MAX_VENDORS = 25;

export const VendorManagement: React.FC<VendorManagementProps> = ({ tenantId, callerUid, callerName }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    profession: ''
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

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "tenants", tenantId, "vendors"));
      const snapshot = await getDocs(q);
      setVendors(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
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
    setFormData({ fullName: '', phone: '', email: '', profession: '' });
    setError('');
    setMsg('');
    setModalOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setFormData({
      fullName: vendor.fullName,
      phone: vendor.phone || '',
      email: vendor.email || '',
      profession: vendor.profession || ''
    });
    setError('');
    setMsg('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');

    const cleanFullName = formData.fullName.trim();
    const cleanPhone = formData.phone.trim();
    const cleanEmail = formData.email.trim();
    const cleanProfession = formData.profession.trim();

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

    if (cleanProfession.length > 30) {
      setError("מקצוע/תחום עיסוק חייב להיות עד 30 תווים");
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
        profession: cleanProfession || null,
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
            previousValue: { fullName: oldVendor.fullName, phone: oldVendor.phone, email: oldVendor.email, profession: oldVendor.profession },
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
          details: { vendorId: docRef.id, fullName: cleanFullName, phone: cleanPhone }
        });
        setMsg('איש שירות חדש נוצר בהצלחה');
      }

      setModalOpen(false);
      setEditingId(null);
      setFormData({ fullName: '', phone: '', email: '', profession: '' });
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
            <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">ניהול אנשי שירות</h3>
          </div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter shrink-0">
            <span className={isLimitReached ? 'text-amber-600' : 'text-blue-600'}>
              {vendors.length}/{MAX_VENDORS}
            </span>
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={isLimitReached}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 shadow-sm"
        >
          <UserPlus size={14} />
          איש שירות חדש
        </button>
      </div>

      <div className="p-3">
        {!modalOpen && error && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold border border-red-100">{error}</div>}
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
                  <div className="flex items-center justify-between">
                    <p className="font-black text-slate-800 text-sm truncate">
                      {v.fullName}
                    </p>
                    {v.profession && (
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full shrink-0 ms-2 flex items-center gap-1">
                        <Briefcase size={10} />
                        {v.profession}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                    <Phone size={10} className="shrink-0" />
                    <span className="opacity-80" dir="ltr">{v.phone}</span>
                  </div>
                  {v.email && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Mail size={10} className="shrink-0" />
                      <span className="truncate opacity-80" title={v.email} dir="ltr">{v.email}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-0.5 pt-2 border-t border-slate-100/30">
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
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h4 className="font-bold text-slate-800">{editingId ? 'עריכת איש שירות' : 'הוספת איש שירות חדש'}</h4>
              <button onClick={() => { setModalOpen(false); setError(''); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} className="shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">
                  שם מלא <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={30}
                  value={formData.fullName}
                  onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="לדוגמה: ישראל ישראלי"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">
                  טלפון נייד <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={15}
                  value={formData.phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="0501234567 או 972501234567+"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">אימייל (רשות)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="vendor@example.com"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">מקצוע / תחום עיסוק (רשות)</label>
                <input
                  type="text"
                  maxLength={30}
                  value={formData.profession}
                  onChange={e => setFormData({ ...formData, profession: e.target.value })}
                  placeholder="לדוגמה: אינסטלטור, חשמלאי"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 flex justify-center items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={18} /> : (editingId ? <Pencil size={18} /> : <UserPlus size={18} />)}
                  {editingId ? 'עדכן איש שירות' : 'צור איש שירות'}
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
