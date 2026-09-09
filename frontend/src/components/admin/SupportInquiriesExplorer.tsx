import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { logAction } from '../../utils/auditLogger';
import { 
  Headphones, 
  Search, 
  CheckCircle2, 
  Clock, 
  MessageSquare, 
  Mail, 
  ExternalLink, 
  RefreshCw, 
  Check, 
  X, 
  Building2, 
  User, 
  Settings2,
  AlertCircle
} from 'lucide-react';

interface SupportInquiry {
  id: string;
  tenantId: string;
  tenantName: string;
  uid: string;
  adminName: string;
  adminPhone: string;
  adminEmail: string;
  question: string;
  status: 'new' | 'addressed';
  addressedAt?: string | null;
  addressedBy?: string | null;
  whatsappDispatched?: boolean;
  whatsappError?: string | null;
  createdAt: string;
}

export const SupportInquiriesExplorer: React.FC = () => {
  const [inquiries, setInquiries] = useState<SupportInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'addressed'>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<SupportInquiry | null>(null);

  // Support phone configuration state
  const [supportPhone, setSupportPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaveMsg, setPhoneSaveMsg] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    fetchInquiries();
    fetchSupportConfig();
  }, []);

  const fetchSupportConfig = async () => {
    try {
      const snap = await getDoc(doc(db, 'global_config', 'support'));
      if (snap.exists() && snap.data()?.whatsappPhone) {
        setSupportPhone(snap.data()?.whatsappPhone);
      }
    } catch (e) {
      console.error('Failed to fetch support config:', e);
    }
  };

  const handleSaveSupportPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPhone(true);
    setPhoneSaveMsg('');
    try {
      const clean = supportPhone.trim().replace(/[^\d+]/g, '');
      await setDoc(doc(db, 'global_config', 'support'), {
        whatsappPhone: clean,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || 'super_admin'
      }, { merge: true });
      setPhoneSaveMsg('מספר הטלפון עודכן בהצלחה!');
      setTimeout(() => setPhoneSaveMsg(''), 3000);
    } catch (e: any) {
      setPhoneSaveMsg(`שגיאה בשמירה: ${e.message}`);
    } finally {
      setSavingPhone(false);
    }
  };

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      let snap;
      try {
        const q = query(collection(db, 'support_inquiries'), orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        snap = await getDocs(collection(db, 'support_inquiries'));
      }

      const list: SupportInquiry[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as SupportInquiry));

      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setInquiries(list);
    } catch (err) {
      console.error('Failed to fetch support inquiries:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (inquiry: SupportInquiry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = inquiry.status === 'addressed' ? 'new' : 'addressed';
    const nowIso = new Date().toISOString();
    const currentUser = auth.currentUser;
    const userEmail = currentUser?.email || 'super_admin';
    const userName = currentUser?.displayName || userEmail;
    const userUid = currentUser?.uid || 'super_admin';

    setInquiries(prev => prev.map(item => {
      if (item.id === inquiry.id) {
        return {
          ...item,
          status: newStatus,
          addressedAt: newStatus === 'addressed' ? nowIso : null,
          addressedBy: newStatus === 'addressed' ? userEmail : null
        };
      }
      return item;
    }));

    if (selectedInquiry?.id === inquiry.id) {
      setSelectedInquiry(prev => prev ? {
        ...prev,
        status: newStatus,
        addressedAt: newStatus === 'addressed' ? nowIso : null,
        addressedBy: newStatus === 'addressed' ? userEmail : null
      } : null);
    }

    try {
      await updateDoc(doc(db, 'support_inquiries', inquiry.id), {
        status: newStatus,
        addressedAt: newStatus === 'addressed' ? nowIso : null,
        addressedBy: newStatus === 'addressed' ? userEmail : null
      });

      const auditAction = newStatus === 'addressed' ? 'SUPPORT_INQUIRY_CLOSED' : 'SUPPORT_INQUIRY_REOPENED';
      await logAction({
        tenantId: inquiry.tenantId || 'general',
        action: auditAction,
        level: 'INFO',
        actor: {
          uid: userUid,
          name: userName,
          email: userEmail,
          type: 'admin'
        },
        details: {
          inquiryId: inquiry.id,
          tenantName: inquiry.tenantName || inquiry.tenantId,
          callerName: inquiry.adminName,
          callerEmail: inquiry.adminEmail,
          callerPhone: inquiry.adminPhone,
          newStatus,
          previousStatus: inquiry.status
        },
        changes: {
          previousValue: { status: inquiry.status },
          newValue: { status: newStatus }
        }
      });
    } catch (err) {
      console.error('Failed to update inquiry status:', err);
      fetchInquiries();
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const getCleanWaPhone = (phone?: string) => {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('05')) {
      clean = '972' + clean.slice(1);
    }
    return clean;
  };

  const filteredInquiries = inquiries.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      (item.tenantName || '').toLowerCase().includes(term) ||
      (item.tenantId || '').toLowerCase().includes(term) ||
      (item.adminName || '').toLowerCase().includes(term) ||
      (item.adminPhone || '').toLowerCase().includes(term) ||
      (item.adminEmail || '').toLowerCase().includes(term) ||
      (item.question || '').toLowerCase().includes(term)
    );
  });

  const totalCount = inquiries.length;
  const newCount = inquiries.filter(i => i.status !== 'addressed').length;
  const addressedCount = inquiries.filter(i => i.status === 'addressed').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Stats & Action Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Headphones size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">סך כל הפניות</p>
            <p className="text-2xl font-black text-slate-900">{totalCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">ממתינות לטיפול</p>
            <p className="text-2xl font-black text-amber-600">{newCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">טופלו בהצלחה</p>
            <p className="text-2xl font-black text-emerald-600">{addressedCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center justify-between text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Settings2 size={16} />
              <span>יעד התראות WhatsApp</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {supportPhone || 'לא מוגדר'}
            </span>
          </button>
          <p className="text-[11px] text-slate-400">
            מספר הטלפון של צוות התמיכה המקבל פניות דרך ה-Meta API
          </p>
        </div>
      </div>

      {/* Support WhatsApp Configuration Drawer/Box */}
      {showConfig && (
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg border border-slate-800 animate-in fade-in duration-200">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <Settings2 size={16} className="text-blue-400" />
              הגדרת מספר וואטסאפ של מוקד התמיכה (לקבלת התראות Meta Business API)
            </h4>
            <button
              onClick={() => setShowConfig(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleSaveSupportPhone} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              dir="ltr"
              placeholder="9725XXXXXXXX (בפורמט בינלאומי)"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              className="bg-slate-800 text-white text-xs font-mono px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            <button
              type="submit"
              disabled={savingPhone || !supportPhone}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              {savingPhone ? 'שומר...' : 'שמור מספר'}
            </button>
            {phoneSaveMsg && (
              <span className="text-xs font-semibold text-emerald-400">
                {phoneSaveMsg}
              </span>
            )}
          </form>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="חיפוש לפי בניין, שם מנהל, טלפון או תוכן שאלה..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              הכל ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('new')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'new'
                  ? 'bg-white text-amber-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ממתינות ({newCount})
            </button>
            <button
              onClick={() => setStatusFilter('addressed')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'addressed'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              טופלו ({addressedCount})
            </button>
          </div>

          <button
            onClick={fetchInquiries}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-all"
            title="רענן רשימה"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Tabular View */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
            <span className="text-sm font-bold">טוען פניות תמיכה...</span>
          </div>
        ) : filteredInquiries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">לא נמצאו פניות תמיכה</p>
            <p className="text-xs text-slate-400">
              {searchTerm ? 'נסה לשנות את מונח החיפוש' : 'פניות שיישלחו ע"י מנהלים יופיעו כאן בזמן אמת.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">תאריך ושעה</th>
                  <th className="py-3.5 px-4">בניין / לקוח</th>
                  <th className="py-3.5 px-4">מנהל פונה</th>
                  <th className="py-3.5 px-4">פרטי קשר ומענה ישיר</th>
                  <th className="py-3.5 px-4">תוכן הפנייה</th>
                  <th className="py-3.5 px-4 text-center">סטטוס טיפול</th>
                  <th className="py-3.5 px-4 text-center">פעולה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredInquiries.map((inquiry) => {
                  const isAddressed = inquiry.status === 'addressed';
                  const cleanPhone = getCleanWaPhone(inquiry.adminPhone);
                  const waUrl = cleanPhone 
                    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(`שלום ${inquiry.adminName || 'מנהל'}, פנייתך למוקד TikTak התקבלה. כיצד נוכל לעזור?`)}`
                    : null;

                  return (
                    <tr 
                      key={inquiry.id}
                      onClick={() => setSelectedInquiry(inquiry)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatDate(inquiry.createdAt)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={14} className="text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900 truncate max-w-[150px]" title={inquiry.tenantName}>
                            {inquiry.tenantName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {inquiry.tenantId}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <User size={14} className="text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate max-w-[130px]">
                            {inquiry.adminName || 'מנהל'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {inquiry.adminPhone ? (
                            <>
                              <span className="font-mono text-slate-700" dir="ltr">
                                {inquiry.adminPhone}
                              </span>
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="מענה מיידי בוואטסאפ"
                                  className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                                >
                                  <MessageSquare size={13} />
                                  <span>וואטסאפ</span>
                                </a>
                              )}
                            </>
                          ) : inquiry.adminEmail ? (
                            <a
                              href={`mailto:${inquiry.adminEmail}`}
                              className="text-blue-600 hover:underline flex items-center gap-1 font-mono"
                            >
                              <Mail size={13} />
                              <span className="truncate max-w-[120px]">{inquiry.adminEmail}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">ללא פרטים</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <p className="text-slate-700 line-clamp-2" title={inquiry.question}>
                          {inquiry.question}
                        </p>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isAddressed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check size={12} />
                            <span>טופל</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={12} />
                            <span>ממתין לטיפול</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => toggleStatus(inquiry, e)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            isAddressed
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 shadow-sm'
                          }`}
                        >
                          {isAddressed ? 'פתח מחדש' : 'סמן כטופל'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedInquiry && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedInquiry(null)}
        >
          <div 
            className="bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Headphones size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">פרטי פניית תמיכה</h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {formatDate(selectedInquiry.createdAt)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedInquiry(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block font-medium">בניין / לקוח:</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedInquiry.tenantName}</span>
                  <span className="text-[10px] text-slate-400 font-mono block">{selectedInquiry.tenantId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">מנהל פונה:</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedInquiry.adminName || 'מנהל'}</span>
                  {selectedInquiry.adminPhone && (
                    <span className="text-slate-600 font-mono block" dir="ltr">{selectedInquiry.adminPhone}</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold block mb-1.5">תוכן השאלה / הבקשה:</span>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedInquiry.question}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 text-slate-500">
                <span>סטטוס שיגור בוואטסאפ למוקד:</span>
                {selectedInquiry.whatsappDispatched ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <Check size={14} /> שוגר בהצלחה
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium">
                    {selectedInquiry.whatsappError || 'לא שוגר'}
                  </span>
                )}
              </div>

              {selectedInquiry.status === 'addressed' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
                  טופל בתאריך: <strong>{formatDate(selectedInquiry.addressedAt || undefined)}</strong> ע"י {selectedInquiry.addressedBy || 'מנהל מערכת'}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {getCleanWaPhone(selectedInquiry.adminPhone) ? (
                <a
                  href={`https://api.whatsapp.com/send?phone=${getCleanWaPhone(selectedInquiry.adminPhone)}&text=${encodeURIComponent(`שלום ${selectedInquiry.adminName || 'מנהל'}, פנייתך למוקד TikTak התקבלה. כיצד נוכל לעזור?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all text-xs"
                >
                  <MessageSquare size={15} />
                  <span>מענה בוואטסאפ למנהל</span>
                  <ExternalLink size={12} />
                </a>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleStatus(selectedInquiry)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedInquiry.status === 'addressed'
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {selectedInquiry.status === 'addressed' ? 'פתח פנייה מחדש' : 'סמן כטופל'}
                </button>
                <button
                  onClick={() => setSelectedInquiry(null)}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  סגור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
