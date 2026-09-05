import React, { useState, useEffect } from 'react';
import { Share2, X, Send, Phone, AlertCircle, MessageSquare, Briefcase, UserCheck } from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import heMessages from '../../locales/he.json';
import enMessages from '../../locales/en.json';

export interface Ticket {
  id: string;
  ticketNumber?: number;
  buildingId?: string;
  category: string;
  urgency: 'High' | 'Moderate' | 'Low';
  status: string;
  summary?: string;
  location?: string;
  subLocation?: string;
  imageId?: string;
  audioId?: string;
  createdAt: string;
  [key: string]: any;
}

export interface VendorItem {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  profession?: string;
}

export interface ForwardToVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  tenantName?: string;
  tenantType?: string;
  tenantId?: string;
  adminName?: string;
  onSend: (vendorPhone: string, messageText: string, vendorName?: string) => Promise<void>;
  isEn?: boolean;
}

export const ForwardToVendorModal: React.FC<ForwardToVendorModalProps> = ({
  isOpen,
  onClose,
  ticket,
  tenantName,
  tenantType,
  tenantId,
  adminName,
  onSend,
  isEn = false,
}) => {
  const [vendorName, setVendorName] = useState('');
  const [phone, setPhone] = useState('');
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedVendors, setSavedVendors] = useState<VendorItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const dict = (isEn ? (enMessages as any).ForwardToVendor : (heMessages as any).ForwardToVendor) || {};

  useEffect(() => {
    if (ticket) {
      setVendorName('');
      setPhone('');
      setError(null);
      setShowDropdown(false);
      setMessageText(buildDefaultVendorMessage(ticket, tenantName, tenantType, tenantId, adminName, isEn));
    }
  }, [ticket, tenantName, tenantType, tenantId, adminName, isEn]);

  useEffect(() => {
    if (!isOpen || !tenantId) return;
    const activeTenantId = tenantId;
    async function loadSavedVendors() {
      try {
        const q = query(collection(db, "tenants", activeTenantId, "vendors"));
        const snap = await getDocs(q);
        const list: VendorItem[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VendorItem));
        setSavedVendors(list);
      } catch (err) {
        console.error("Error loading saved vendors:", err);
      }
    }
    loadSavedVendors();
  }, [isOpen, tenantId]);

  if (!isOpen || !ticket) return null;

  const labels = {
    title: dict.title,
    phoneLabel: dict.phoneLabel,
    phonePlaceholder: dict.phonePlaceholder,
    vendorNameLabel: dict.vendorNameLabel,
    vendorNamePlaceholder: dict.vendorNamePlaceholder,
    messageLabel: dict.messageLabel,
    send: dict.send,
    cancel: dict.cancel,
    sending: dict.sending,
    invalidPhone: dict.invalidPhone,
    emptyMessage: dict.emptyMessage,
    vendorStatusTitle: dict.vendorStatusTitle,
  };

  const handleSendAction = async () => {
    setError(null);
    const cleanPhone = phone.trim().replace(/[-\s]/g, '');
    const isPhoneValid = /^(0|\+)[0-9]{6,14}$/.test(cleanPhone);

    if (!isPhoneValid) {
      setError(labels.invalidPhone);
      return;
    }

    if (!messageText.trim()) {
      setError(labels.emptyMessage);
      return;
    }

    setLoading(true);
    try {
      await onSend(cleanPhone, messageText.trim(), vendorName.trim());
      onClose();
    } catch (err: any) {
      let rawMsg = err.message || dict.metaApiError;
      if (rawMsg.includes('132001') || rawMsg.includes('does not exist')) {
        rawMsg = dict.metaTemplateNotApproved;
      }
      setError(rawMsg);
    } finally {
      setLoading(false);
    }
  };

  const cleanPhone = phone.trim().replace(/[-\s]/g, '');
  const isPhoneValid = /^(0|\+)[0-9]{6,14}$/.test(cleanPhone);
  const vendorList: any[] = Array.isArray(ticket.vendors) ? ticket.vendors : [];

  const filteredVendors = savedVendors.filter(v => {
    if (!vendorName.trim()) return true;
    const term = vendorName.trim().toLowerCase();
    return (
      v.fullName.toLowerCase().includes(term) ||
      (v.profession && v.profession.toLowerCase().includes(term)) ||
      (v.phone && v.phone.includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Box */}
      <div 
        className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#25D366]/15 p-2 rounded-xl text-[#25D366]">
              <Share2 size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">{labels.title}</h2>
              <p className="text-[11px] text-slate-500 font-semibold">
                #{ticket.ticketNumber || ticket.id} • {ticket.category}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Vendor Status History if exists */}
          {vendorList.length > 0 && (
            <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-xs space-y-1.5">
              <span className="font-extrabold text-emerald-900 block">{labels.vendorStatusTitle}</span>
              <div className="space-y-1">
                {vendorList.map((v, i) => (
                  <div key={i} className="flex justify-between items-center text-[11px] font-semibold text-slate-700">
                    <span>👤 {v.name || v.phone}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      v.status === 'בוצע' ? 'bg-emerald-100 text-emerald-800' :
                      v.status === 'קיבלתי את ההודעה' ? 'bg-blue-100 text-blue-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {v.status || dict.pendingStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor Name Input with Saved Vendors Dropdown */}
          <div className="relative">
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck size={14} className="text-emerald-600" />
                <span>{labels.vendorNameLabel}</span>
              </span>
              {savedVendors.length > 0 && (
                <span className="text-[10px] text-slate-400 font-normal">
                  ({savedVendors.length} אנשי שירות שמורים)
                </span>
              )}
            </label>
            <input 
              type="text"
              value={vendorName}
              onChange={(e) => {
                setVendorName(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => {
                // Short delay to allow onMouseDown on dropdown items to execute
                setTimeout(() => setShowDropdown(false), 200);
              }}
              placeholder={labels.vendorNamePlaceholder}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />

            {/* Dropdown list of saved vendors */}
            {showDropdown && savedVendors.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredVendors.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400 text-center italic">
                    לא נמצא איש שירות מתאים
                  </div>
                ) : (
                  filteredVendors.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onMouseDown={() => {
                        setVendorName(v.fullName);
                        setPhone(v.phone);
                        if (error) setError(null);
                        setShowDropdown(false);
                      }}
                      className="w-full text-right px-3.5 py-2.5 hover:bg-emerald-50/60 transition-colors flex items-center justify-between gap-2 group cursor-pointer"
                    >
                      <div className="flex flex-col text-right">
                        <span className="font-bold text-slate-800 text-xs group-hover:text-emerald-700 transition-colors">
                          {v.fullName}
                        </span>
                        {v.profession && (
                          <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                            <Briefcase size={10} className="text-slate-400" />
                            {v.profession}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 group-hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors" dir="ltr">
                        {v.phone}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Phone Number Input */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Phone size={14} className="text-emerald-600" />
              <span>{labels.phoneLabel}</span>
            </label>
            <input 
              type="tel"
              value={phone}
              onChange={(e) => {
                const val = e.target.value.replace(/(?!^\+)[^\d]/g, '');
                setPhone(val);
                if (error) setError(null);
              }}
              placeholder={labels.phonePlaceholder}
              maxLength={15}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-wider text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dir-ltr text-right"
              autoFocus
            />
          </div>

          {/* Message Textarea */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-emerald-600" />
              <span>{labels.messageLabel}</span>
            </label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={8}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs leading-relaxed font-sans text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-y min-h-[140px]"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            {labels.cancel}
          </button>

          <button
            onClick={handleSendAction}
            disabled={loading || !isPhoneValid || !messageText.trim()}
            className="px-5 py-2.5 text-xs font-extrabold text-white bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Send size={14} />
            <span>{loading ? labels.sending : labels.send}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const buildDefaultVendorMessage = (
  ticket: Ticket, 
  tenantName?: string, 
  tenantType?: string,
  tenantId?: string,
  adminName?: string,
  isEn?: boolean
): string => {
  const dict = (isEn ? (enMessages as any).ForwardToVendor : (heMessages as any).ForwardToVendor) || {};
  const parts: string[] = [];

  const ticketRef = (ticket.ticketNumber !== undefined && ticket.ticketNumber !== null)
    ? ticket.ticketNumber.toString()
    : ticket.id;

  parts.push(dict.dispatchHeader.replace('{{ticketNumber}}', ticketRef));

  if (adminName) {
    parts.push(dict.sentBy.replace('{{adminName}}', adminName));
  }

  if (tenantName) {
    const getCustomerTypeLabel = (type?: string, isEnglish?: boolean) => {
      if (!type) return isEnglish ? 'Building' : 'בניין';
      const lower = type.toLowerCase();
      if (lower === 'building') return isEnglish ? 'Building' : 'בניין';
      if (lower === 'municipality') return isEnglish ? 'Municipality' : 'רשות מקומית';
      return type;
    };
    const typeLabel = getCustomerTypeLabel(tenantType, isEn);

    if (tenantType?.toLowerCase() === 'municipality') {
      parts.push(dict.municipalityLabel.replace('{{tenantName}}', tenantName));
    } else if (!tenantType || tenantType.toLowerCase() === 'building') {
      parts.push(dict.buildingLabel.replace('{{tenantName}}', tenantName));
    } else {
      parts.push(dict.genericCustomerLabel.replace('{{typeLabel}}', typeLabel).replace('{{tenantName}}', tenantName));
    }
  }

  if (ticket.category) {
    parts.push(dict.category.replace('{{category}}', ticket.category));
  }

  if (ticket.urgency) {
    const urgencyMap: Record<string, { he: string; en: string }> = {
      High: { he: 'גבוהה 🚨', en: 'High 🚨' },
      Moderate: { he: 'בינונית ⚠️', en: 'Medium ⚠️' },
      Low: { he: 'נמוכה ℹ️', en: 'Low ℹ️' },
    };
    const u = urgencyMap[ticket.urgency] || { he: ticket.urgency, en: ticket.urgency };
    parts.push(dict.urgency.replace('{{urgency}}', isEn ? u.en : u.he));
  }

  if (ticket.location || ticket.subLocation) {
    const locStr = [ticket.location, ticket.subLocation].filter(Boolean).join(' - ');
    parts.push(dict.location.replace('{{location}}', locStr));
  }

  if (ticket.summary) {
    parts.push(dict.description.replace('{{summary}}', ticket.summary));
  }

  const tenantIdStr = tenantId || ticket.building_id || ticket.buildingId || ticket.tenantId || '';

  if (ticket.imageId && typeof ticket.imageId === 'string' && ticket.imageId.length > 5 && ticket.imageId !== 'null') {
    const imgUrl = `${window.location.origin}/img/${tenantIdStr}/${ticket.imageId}`;
    parts.push(dict.imageAttachment.replace('{{url}}', imgUrl));
  } else if (dict.noImageAttachment) {
    parts.push(dict.noImageAttachment);
  }

  const resolvedAudioId = ticket.audioId || ticket.audioUrl || ticket.audio;
  if (resolvedAudioId && typeof resolvedAudioId === 'string' && resolvedAudioId.length > 5 && resolvedAudioId !== 'null') {
    const audUrl = `${window.location.origin}/aud/${tenantIdStr}/${resolvedAudioId}`;
    parts.push(dict.audioAttachment.replace('{{url}}', audUrl));
  } else if (dict.noAudioAttachment) {
    parts.push(dict.noAudioAttachment);
  }

  if (Array.isArray(ticket.attachments) && ticket.attachments.length > 0) {
    ticket.attachments.forEach((att: any, idx: number) => {
      const url = typeof att === 'string' ? att : att.url || att.link;
      if (url) {
        parts.push(dict.attachment.replace('{{num}}', (idx + 1).toString()).replace('{{url}}', url));
      }
    });
  }

  if (ticket.createdAt) {
    try {
      const dateObj = new Date(ticket.createdAt);
      if (!isNaN(dateObj.getTime())) {
        const dateStr = dateObj.toLocaleString(isEn ? 'en-US' : 'he-IL');
        parts.push(dict.reportDate.replace('{{date}}', dateStr));
      }
    } catch (e) {
      // Ignore formatting error
    }
  }

  if (dict.doNotReplyNotice) {
    const contactName = adminName || (isEn ? 'the Admin' : 'המנהל המטפל');
    parts.push(`\n${dict.doNotReplyNotice.replace('{{adminName}}', contactName)}`);
  }

  return parts.join('\n');
};
