import React, { useState, useEffect } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserPlus, Trash2, Mail, Phone, ShieldCheck, Key, Loader2, X, Pencil, Info } from 'lucide-react';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
}

interface UserManagementProps {
  tenantId: string;
  callerUid: string;
}

export const UserManagement: React.FC<UserManagementProps> = ({ tenantId, callerUid }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    password: ''
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "tenants", tenantId, "adminUsers"));
      const snapshot = await getDocs(q);
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    } catch (err: any) {
      console.error(err);
      setError('נכשלה טעינת המשתמשים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [tenantId]);

  const callManager = async (action: string, data: any) => {
    setActionLoading(true);
    setError('');
    setMsg('');
    try {
      // Validation (Client-side)
      if (action === 'create' || action === 'update') {
        if (!data.email?.includes('@')) throw new Error("כתובת אימייל לא תקינה");
        if (data.firstName.length > 20 || data.lastName.length > 20) throw new Error("שם חייב להיות עד 20 תווים");
      }

      const response = await fetch('/api/manageTenantUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tenantId, callerUid, userData: data })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');

      setMsg('הפעולה בוצעה בהצלחה');
      setModalOpen(false);
      setEditingId(null);
      setFormData({ firstName: '', lastName: '', email: '', mobile: '', password: '' });
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData({ firstName: '', lastName: '', email: '', mobile: '', password: '' });
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile || '',
      password: ''
    });
    setModalOpen(true);
  };

  const handleDelete = (uid: string) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו סופית.')) {
      callManager('delete', { uid });
    }
  };

  const handleResetPassword = (email: string) => {
    if (window.confirm('האם לשלוח קישור לאיפוס סיסמה למשתמש?')) {
      callManager('resetPassword', { email });
    }
  };

  const handlePhoneChange = (val: string) => {
    const cleaned = val.replace(/\D/g, ''); // Digits only
    setFormData({ ...formData, mobile: cleaned });
  };

  const isLimitReached = users.length >= 5;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="text-blue-600" size={16} />
            <h3 className="font-bold text-slate-800 text-sm whitespace-nowrap">ניהול משתמשים</h3>
          </div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter shrink-0">
             <span className={isLimitReached ? 'text-amber-600' : 'text-blue-600'}>{users.length}/5</span>
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={isLimitReached}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 shadow-sm"
        >
          <UserPlus size={14} />
          משתמש חדש
        </button>
      </div>

      <div className="p-3">
        {error && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold border border-red-100">{error}</div>}
        {msg && <div className="mb-3 p-2 bg-green-50 text-green-600 rounded-lg text-[11px] font-bold border border-green-100">{msg}</div>}

        {loading ? (
          <div className="flex flex-col items-center py-8 gap-2 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest">טוען...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-slate-400 italic text-xs">אין משתמשים נוספים</div>
        ) : (
          <div className="flex flex-col gap-3">
            {users.map(u => {
              const isSelf = u.id === callerUid;
              const isLastAdmin = users.length <= 1;
              const canDelete = !isSelf && !isLastAdmin;

              return (
                <div key={u.id} className="p-3 border border-slate-100 rounded-xl hover:border-blue-100 transition-colors shadow-sm bg-slate-50/20 flex flex-col gap-2">
                  <div className="flex flex-col text-right">
                    <p className="font-black text-slate-800 text-sm flex items-center justify-between">
                      <span className="truncate">
                        {u.firstName} {u.lastName}
                      </span>
                      {isSelf && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-black shrink-0 ms-2">אתה</span>}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                      <Mail size={10} className="shrink-0" /> 
                      <span className="truncate opacity-80" title={u.email}>{u.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Phone size={10} className="shrink-0" /> 
                      <span className="opacity-80">{u.mobile || '---'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-0.5 pt-2 border-t border-slate-100/30">
                    <button
                      onClick={() => openEdit(u)}
                      disabled={actionLoading}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="עריכה"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleResetPassword(u.email)}
                      disabled={actionLoading}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title="איפוס סיסמה"
                    >
                      <Key size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={actionLoading || !canDelete}
                      className={`p-1.5 rounded-md transition-colors ${!canDelete ? 'text-slate-100 cursor-not-allowed' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                      title={isSelf ? 'לא ניתן למחוק' : (isLastAdmin ? 'לא ניתן למחוק את המנהל האחרון' : 'מחיקה')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h4 className="font-bold text-slate-800">{editingId ? 'עריכת משתמש' : 'הוספת משתמש חדש'}</h4>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              callManager(editingId ? 'update' : 'create', editingId ? { uid: editingId, ...formData } : formData);
            }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">שם פרטי</label>
                  <input type="text" required maxLength={20} value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">שם משפחה</label>
                  <input type="text" required maxLength={20} value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">אימייל</label>
                <input
                  type="email"
                  required
                  readOnly={!!editingId} // Email is immutable in Auth for this simplified flow
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full border border-slate-200 rounded-lg p-2 text-sm outline-none text-left ${editingId ? 'bg-slate-50 text-slate-400' : 'focus:ring-2 focus:ring-blue-100'}`}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">טלפון נייד</label>
                <input type="tel" value={formData.mobile} onChange={e => handlePhoneChange(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left" dir="ltr" placeholder="ספרות בלבד" />
              </div>

              {!editingId && (
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-1 px-1">סיסמה זמנית</label>
                  <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="מושאר ריק לסיסמה אקראית" className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left font-mono" dir="ltr" />
                </div>
              )}

              {editingId && (
                <div className="p-3 bg-blue-50/50 rounded-lg flex items-start gap-2 text-xs text-blue-700 leading-relaxed font-bold">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  לשינוי סיסמה, השתמש באפשרות "איפוס סיסמה" שבתפריט המשתמש.
                </div>
              )}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 flex justify-center items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={18} /> : (editingId ? <Pencil size={18} /> : <UserPlus size={18} />)}
                  {editingId ? 'עדכן משתמש' : 'צור משתמש'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
