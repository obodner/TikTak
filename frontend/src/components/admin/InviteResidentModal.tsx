import React, { useState, useEffect } from 'react';
import {
  X,
  Link,
  Copy,
  Check,
  Share2,
  Clock,
  Users,
  UserCheck,
  AlertCircle,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { auth } from '../../lib/firebase';

interface InviteItem {
  id: string;
  token: string;
  tenantId: string;
  inviteType: 'single' | 'group';
  maxUses: number;
  useCount: number;
  status: 'active' | 'used' | 'expired' | 'revoked';
  createdAt: string | null;
  expiresAt: string | null;
  createdBy: { uid: string; name: string } | null;
  usedBy?: { phone: string; name: string; registeredAt: string; apartment?: string }[];
}

interface InviteResidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  callerName: string;
  tenantType?: 'building' | 'municipality';
  onResidentListChange?: () => void;
}

export const InviteResidentModal: React.FC<InviteResidentModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  callerName,
  tenantType = 'building',
  onResidentListChange
}) => {
  const isMunicipality = tenantType === 'municipality';
  const residentLabel = isMunicipality ? 'תושב' : 'דייר';
  const residentsLabel = isMunicipality ? 'תושבים' : 'דיירים';
  const targetScope = isMunicipality ? 'היישוב / הרשות' : 'הבניין';
  const entityAuthority = isMunicipality ? 'מוקד השירות' : 'ועד הבית';
  const systemPurpose = isMunicipality ? 'מערכת דיווח המפגעים' : 'מערכת דיווח התקלות';

  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  
  // Creation form state
  const [inviteType, setInviteType] = useState<'single' | 'group'>('group');
  const [expiresInHours, setExpiresInHours] = useState<number>(48);
  const [isCreating, setIsCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdExpiresAt, setCreatedExpiresAt] = useState<string | null>(null);
  const [createdInviteType, setCreatedInviteType] = useState<'single' | 'group' | null>(null);
  const [copied, setCopied] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invites list state
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const selectInviteType = (type: 'single' | 'group') => {
    setInviteType(type);
    // Clear any previous result so user doesn't see a stale link from the old type
    if (createdUrl) {
      setCreatedUrl(null);
      setCreatedExpiresAt(null);
      setCreatedInviteType(null);
      setCopied(false);
      setCreateError(null);
    }
  };

  const selectExpiresInHours = (hours: number) => {
    setExpiresInHours(hours);
    if (createdUrl) {
      setCreatedUrl(null);
      setCreatedExpiresAt(null);
      setCreatedInviteType(null);
      setCopied(false);
      setCreateError(null);
    }
  };

  const shareButtonText = (createdInviteType || inviteType) === 'single'
    ? `שתף קישור אישי עם ה${residentLabel}`
    : `שתף בוואטסאפ של ${targetScope}`;

  const fetchInvites = async () => {
    if (!tenantId) return;
    setLoadingList(true);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : '';
      const callerUid = user?.uid || '';

      const res = await fetch(`/api/getResidentInvites?tenantId=${tenantId}&callerUid=${callerUid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.invites) {
        setInvites(data.invites);
      }
    } catch (err) {
      console.error('Failed to load invites:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCreatedUrl(null);
      setCreatedExpiresAt(null);
      setCreatedInviteType(null);
      setCreateError(null);
      setCopied(false);
      fetchInvites();
    }
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError(null);
    setCopied(false);

    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const callerUid = user?.uid || '';

      const res = await fetch('/api/createResidentInvite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          tenantId,
          callerUid,
          callerName,
          expiresInHours,
          inviteType
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const origin = window.location.origin;
        const fullUrl = `${origin}/join/${data.slug}`;
        setCreatedUrl(fullUrl);
        setCreatedExpiresAt(data.expiresAt);
        setCreatedInviteType(data.inviteType || inviteType);
        fetchInvites();
        if (onResidentListChange) onResidentListChange();
      } else {
        setCreateError(data.error || 'חלה שגיאה ביצירת הקישור.');
      }
    } catch (err: any) {
      console.error('Error creating invite:', err);
      setCreateError('שגיאת תקשורת ביצירת הקישור.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (tokenToRevoke: string) => {
    if (!confirm('האם אתה בטוח שברצונך לבטל קישור זה? לאחר הביטול לא ניתן יהיה להירשם דרכו.')) {
      return;
    }

    setRevokingToken(tokenToRevoke);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const callerUid = user?.uid || '';

      const res = await fetch('/api/revokeResidentInvite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          tenantId,
          callerUid,
          token: tokenToRevoke
        })
      });

      if (res.ok) {
        fetchInvites();
      }
    } catch (err) {
      console.error('Failed to revoke:', err);
    } finally {
      setRevokingToken(null);
    }
  };

  const handleCopy = () => {
    if (!createdUrl) return;
    navigator.clipboard.writeText(createdUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    if (!createdUrl) return;
    const timeLimit = expiresInHours === 24 ? '24 שעות' : expiresInHours === 48 ? '48 שעות' : '7 ימים';
    const activeType = createdInviteType || inviteType;
    let msg = '';
    if (activeType === 'single') {
      msg = `שלום! ${entityAuthority} מזמין אותך להצטרף ל${systemPurpose} של ${targetScope} TikTak.
לחץ/י כאן להרשמה אישית מהירה (בתוקף ל-${timeLimit}):
${createdUrl}`;
    } else {
      msg = `שלום לכל ה${residentsLabel}! ${entityAuthority} מזמין אתכם להצטרף ל${systemPurpose} של ${targetScope} TikTak.
לחצו כאן להרשמה מהירה (בתוקף ל-${timeLimit}):
${createdUrl}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    onClose();
  };

  const formatExpiryTime = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Link size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">הזמנת {residentsLabel} בקישור</h3>
              <p className="text-xs text-slate-500">הצטרפות עצמית לרשימת המורשים (Whitelist)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 px-6 pt-2 bg-white">
          <button
            onClick={() => setActiveTab('create')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'create'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            יצירת קישור חדש
          </button>
          <button
            onClick={() => {
              setActiveTab('list');
              fetchInvites();
            }}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'list'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>קישורים שנוצרו</span>
            {invites.length > 0 && (
              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded-full font-bold">
                {invites.length}
              </span>
            )}
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'create' ? (
            <div className="space-y-5">
              
              {/* Type selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  סוג הקישור:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => selectInviteType('group')}
                    className={`p-3 rounded-xl border text-right transition flex flex-col justify-between cursor-pointer ${
                      inviteType === 'group'
                        ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">קישור קבוצתי ל{targetScope}</span>
                      <Users size={16} className={inviteType === 'group' ? 'text-blue-600' : 'text-slate-400'} />
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      מתאים לשליחה בקבוצת הוואטסאפ של {targetScope}. כל מספר טלפון יכול להירשם פעם אחת בלבד.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => selectInviteType('single')}
                    className={`p-3 rounded-xl border text-right transition flex flex-col justify-between cursor-pointer ${
                      inviteType === 'single'
                        ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">קישור אישי (חד-פעמי)</span>
                      <UserCheck size={16} className={inviteType === 'single' ? 'text-blue-600' : 'text-slate-400'} />
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      מיועד ל{residentLabel} יחיד. הקישור פג וננעל אוטומטית מיד לאחר ההרשמה הראשונה.
                    </p>
                  </button>
                </div>
              </div>

              {/* Expiration presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Clock size={14} className="text-slate-400" />
                  <span>תוקף הקישור:</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '24 שעות', hours: 24 },
                    { label: '48 שעות (מומלץ)', hours: 48 },
                    { label: 'שבוע (7 ימים)', hours: 168 }
                  ].map((preset) => (
                    <button
                      key={preset.hours}
                      type="button"
                      onClick={() => selectExpiresInHours(preset.hours)}
                      className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition text-center cursor-pointer ${
                        expiresInHours === preset.hours
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {createError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Generated Result Card */}
              {createdUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                      <Check size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        {createdInviteType === 'single'
                          ? 'נוצר קישור אישי (חד-פעמי) בהצלחה!'
                          : 'נוצר קישור קבוצתי בהצלחה!'}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-medium">
                      תוקף עד: {formatExpiryTime(createdExpiresAt)}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-700 truncate select-all" dir="ltr">
                      {createdUrl}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold flex items-center gap-1 shrink-0 transition cursor-pointer"
                      title="העתק ללוח"
                    >
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      <span>{copied ? 'הועתק!' : 'העתק'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleWhatsAppShare}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <Share2 size={15} />
                      <span>{shareButtonText}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Primary generate button */}
              {!createdUrl && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {isCreating ? (
                    <span>יוצר קישור... ⏳</span>
                  ) : (
                    <>
                      <Link size={16} />
                      <span>
                        {inviteType === 'single'
                          ? `צור קישור אישי (חד-פעמי) ⚡`
                          : `צור קישור קבוצתי ל${targetScope} ⚡`}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Action when link is already generated */}
              {createdUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setCreatedUrl(null);
                    setCreatedExpiresAt(null);
                    setCreatedInviteType(null);
                    setCopied(false);
                  }}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>צור קישור נוסף</span>
                </button>
              )}

            </div>
          ) : (
            /* Invites list view */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>קישורים שנוצרו עבור {targetScope} (פעילים וקודמים):</span>
                <button
                  onClick={fetchInvites}
                  disabled={loadingList}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
                >
                  <RefreshCw size={12} className={loadingList ? 'animate-spin' : ''} />
                  <span>רענן</span>
                </button>
              </div>

              {loadingList && (
                <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
                  טוען קישורים...
                </div>
              )}

              {!loadingList && invites.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  עדיין לא נוצרו קישורי הצטרפות עבור {targetScope}.
                </div>
              )}

              {!loadingList && invites.map((inv) => {
                const isExpired = inv.status === 'expired' || (inv.expiresAt && new Date(inv.expiresAt) < new Date());
                const isRevoked = inv.status === 'revoked';
                const isUsed = inv.status === 'used';
                const isActive = inv.status === 'active' && !isExpired && !isRevoked;

                const origin = window.location.origin;
                const fullUrl = `${origin}/join/${inv.tenantId}__${inv.token}`;

                return (
                  <div
                    key={inv.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : isUsed
                            ? 'bg-blue-100 text-blue-800'
                            : isRevoked
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {isActive ? 'פעיל' : isUsed ? 'נוצל' : isRevoked ? 'בוטל' : 'פג תוקף'}
                        </span>

                        <span className="text-[11px] font-bold text-slate-700">
                          {inv.inviteType === 'group' ? 'קבוצתי' : 'אישי (חד-פעמי)'}
                        </span>

                        <span className="text-[11px] text-slate-400">
                          ({inv.useCount} הצטרפו)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(fullUrl);
                              alert('הקישור הועתק ללוח!');
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-600 transition cursor-pointer"
                            title="העתק קישור"
                          >
                            <Copy size={14} />
                          </button>
                        )}

                        {isActive && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(inv.token)}
                            disabled={revokingToken === inv.token}
                            className="p-1 hover:bg-red-100 text-red-600 rounded transition cursor-pointer"
                            title="בטל קישור"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expiry and Registered users */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>תוקף עד: <strong>{formatExpiryTime(inv.expiresAt)}</strong></span>
                      {inv.usedBy && inv.usedBy.length > 0 && (
                        <span className="text-emerald-700 font-bold">
                          {residentLabel} אחרון: {inv.usedBy[inv.usedBy.length - 1].name}
                        </span>
                      )}
                    </div>

                    {/* Used By list preview if group link */}
                    {inv.usedBy && inv.usedBy.length > 0 && (
                      <div className="mt-1 pt-2 border-t border-slate-200/60 text-[10px] text-slate-600 space-y-1">
                        <div className="font-bold text-slate-500">{residentsLabel} שהצטרפו דרך קישור זה:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {inv.usedBy.map((u, idx) => (
                            <span key={idx} className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                              {u.name} ({u.phone})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition cursor-pointer"
          >
            סגור
          </button>
        </div>

      </div>
    </div>
  );
};
