import React, { useState, useEffect } from 'react';
import { X, Pin, Check, Copy, AlertTriangle, Info, Wrench, Trash2 } from 'lucide-react';
import { db, auth } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { logAction } from '../../utils/auditLogger';

export interface NoticeBannerData {
  active: boolean;
  message: string;
  location?: string;
  category?: string;
  type?: 'warning' | 'info' | 'maintenance';
  createdAt?: string;
  durationHours?: number | 'manual';
  expiresAt?: string | null;
  authorName?: string;
}

interface HotspotNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  buildingName?: string;
  initialLocation?: string;
  initialCategory?: string;
  currentBanner?: NoticeBannerData | null;
  onBannerUpdated?: (banner: NoticeBannerData | null) => void;
  isEn?: boolean;
}

export const HotspotNoticeModal: React.FC<HotspotNoticeModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  buildingName,
  initialLocation = '',
  initialCategory = '',
  currentBanner,
  onBannerUpdated,
  isEn = false
}) => {
  const [location, setLocation] = useState(initialLocation);
  const [message, setMessage] = useState('');
  const [bannerType, setBannerType] = useState<'warning' | 'info' | 'maintenance'>('warning');
  const [durationHours, setDurationHours] = useState<number | 'manual'>(48);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const loc = initialLocation || currentBanner?.location || '';
      setLocation(loc);
      setBannerType(currentBanner?.type || 'warning');
      setDurationHours(currentBanner?.durationHours !== undefined ? currentBanner.durationHours : 48);

      if (currentBanner?.active && currentBanner.message) {
        setMessage(currentBanner.message);
      } else {
        const defaultMsg = isEn
          ? `Notice: The issue at ${loc ? loc : 'the building'} is known and currently being addressed. No need to report again.`
          : `שימו לב: תקלה ב${loc ? loc : 'בניין'} ידועה ונמצאת בטיפול. אין צורך לפתוח קריאה נוספת.`;
        setMessage(defaultMsg);
      }
    }
  }, [isOpen, initialLocation, currentBanner, isEn]);

  if (!isOpen) return null;

  const handleSave = async (active: boolean) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const now = new Date();
      let expiresAt: string | null = null;
      if (active && durationHours !== 'manual') {
        expiresAt = new Date(now.getTime() + Number(durationHours) * 3600 * 1000).toISOString();
      }

      const bannerPayload: NoticeBannerData = {
        active,
        message: message.trim(),
        location: location.trim(),
        category: initialCategory || '',
        type: bannerType,
        durationHours,
        expiresAt,
        createdAt: now.toISOString()
      };

      await updateDoc(doc(db, 'tenants', tenantId), {
        noticeBanner: bannerPayload
      });

      // Audit Logging
      try {
        const user = auth.currentUser;
        const auditActor = {
          uid: user?.uid || 'unknown_admin',
          name: user?.displayName || user?.email || 'מנהל ועד',
          email: user?.email || undefined,
          type: 'admin' as const
        };

        if (active) {
          await logAction({
            tenantId,
            action: 'NOTICE_BANNER_PINNED',
            actor: auditActor,
            details: {
              location: location.trim(),
              category: initialCategory || '',
              type: bannerType,
              durationHours,
              expiresAt,
              message: message.trim()
            }
          });
        } else {
          await logAction({
            tenantId,
            action: 'NOTICE_BANNER_REMOVED',
            actor: auditActor,
            details: {
              previousLocation: currentBanner?.location,
              previousMessage: currentBanner?.message
            }
          });
        }
      } catch (logErr) {
        console.warn("Audit log error:", logErr);
      }

      if (onBannerUpdated) {
        onBannerUpdated(active ? bannerPayload : null);
      }
      setSaving(false);
      onClose();
    } catch (err) {
      console.error("Failed to update notice banner:", err);
      setSaving(false);
    }
  };

  const handleCopyWhatsApp = () => {
    const title = isEn
      ? `📢 *Building Notice${buildingName ? ` - ${buildingName}` : ''}*`
      : `📢 *הודעת ועד הבית${buildingName ? ` - ${buildingName}` : ''}*`;
    const footer = isEn ? `Thank you,\nBuilding Committee` : `בברכה,\nועד הבית`;
    const fullText = `${title}\n\n${message}\n\n${footer}`;

    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <Pin size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                {isEn ? 'Resident Notice Banner' : 'באנר הודעות לדיירים'}
              </h3>
              <p className="text-xs text-slate-500">
                {isEn ? 'Pins an alert on the resident reporting page' : 'הצמדת הודעת עדכון בראש דף הדיווח של הדיירים'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          
          {/* Active status / Option A Replacement Alert */}
          {currentBanner?.active && (
            <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block text-amber-900">
                      {isEn ? 'Active Banner Notice (Option A)' : 'שים לב: קיים כבר באנר פעיל לדיירים'}
                    </span>
                    <p className="text-slate-700 mt-0.5 leading-snug">
                      {isEn 
                        ? `Saving this notice will replace the currently active banner (${currentBanner.location ? `"${currentBanner.location}"` : 'General'}) for residents.` 
                        : `שמירת הודעה זו תחליף את הבאנר המוצג כרגע (${currentBanner.location ? `עבור "${currentBanner.location}"` : 'כללי'}) עבור הדיירים.`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 size={13} />
                  <span>{isEn ? 'Remove Existing' : 'הסר קיים'}</span>
                </button>
              </div>
              <div className="bg-white/80 p-2 rounded-xl border border-amber-200 text-slate-600 text-[11px] truncate">
                <span className="font-bold text-slate-800">{isEn ? 'Current: ' : 'נוסח פעיל: '}</span>
                "{currentBanner.message}"
              </div>
            </div>
          )}

          {/* Location field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isEn ? 'Incident Location / Asset' : 'מיקום התקלה / מוקד כשל'}
            </label>
            <input 
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={isEn ? 'e.g. Elevator B, Parking -1' : 'לדוגמה: מעלית B, חניון תחתון, לובי'}
              className="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
            />
          </div>

          {/* Banner Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {isEn ? 'Notice Severity / Style' : 'סגנון התראה'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBannerType('warning')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  bannerType === 'warning' 
                    ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 shadow-xs' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle size={15} className="text-amber-600" />
                <span>{isEn ? 'Warning' : 'אזהרה'}</span>
              </button>

              <button
                type="button"
                onClick={() => setBannerType('maintenance')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  bannerType === 'maintenance' 
                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Wrench size={15} className="text-blue-600" />
                <span>{isEn ? 'Maintenance' : 'בטיפול'}</span>
              </button>

              <button
                type="button"
                onClick={() => setBannerType('info')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  bannerType === 'info' 
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Info size={15} className="text-emerald-600" />
                <span>{isEn ? 'Update' : 'עדכון'}</span>
              </button>
            </div>
          </div>

          {/* Expiration Duration Selector (Requirement 1) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                {isEn ? 'Banner Expiration (Auto-turnoff)' : 'תוקף ההודעה (כיבוי אוטומטי)'}
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                {durationHours === 24 ? (isEn ? 'Turns off in 24 hours' : 'ייכבה בעוד 24 שעות') :
                 durationHours === 48 ? (isEn ? 'Turns off in 48 hours' : 'ייכבה בעוד 48 שעות') :
                 durationHours === 168 ? (isEn ? 'Turns off in 7 days' : 'ייכבה בעוד 7 ימים') :
                 (isEn ? 'Until manual removal' : 'עד לביטול ידני')}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setDurationHours(24)}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                  durationHours === 24
                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isEn ? '24 Hours' : '24 שעות'}
              </button>
              <button
                type="button"
                onClick={() => setDurationHours(48)}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                  durationHours === 48
                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isEn ? '48 Hours' : '48 שעות'}
              </button>
              <button
                type="button"
                onClick={() => setDurationHours(168)}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                  durationHours === 168
                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isEn ? '7 Days' : '7 ימים'}
              </button>
              <button
                type="button"
                onClick={() => setDurationHours('manual')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                  durationHours === 'manual'
                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isEn ? 'Manual' : 'עד לביטול'}
              </button>
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {isEn ? 'Notice Content for Residents' : 'תוכן ההודעה לדיירים'}
            </label>
            <textarea 
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isEn ? 'Enter message...' : 'הזן את נוסח ההודעה...'}
              className="w-full text-sm border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {isEn 
                ? 'This banner is displayed at the top of the reporting screen before taking photos, preventing duplicates.' 
                : 'באנר זה מוצג בראש מסך הדיווח לפני צילום תמונה וחוסך עשרות פניות כפולות.'}
            </p>
          </div>

          {/* Live Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-500">
                {isEn ? 'Live Resident Preview (with dismiss "X"):' : 'תצוגה מקדימה לדיירים (כולל כפתור סגירה X):'}
              </label>
              <span className="text-[10px] text-slate-400 font-bold">
                {durationHours === 'manual' ? (isEn ? 'No expiration' : 'ללא תפוגה') : (isEn ? `Expires: ${durationHours === 168 ? '7d' : `${durationHours}h`}` : `תוקף: ${durationHours === 168 ? 'שבוע' : `${durationHours} שעות`}`)}
              </span>
            </div>
            {(() => {
              const styleConfig = {
                warning: {
                  container: 'bg-amber-50 border-amber-300 text-amber-950',
                  iconBg: 'bg-amber-500 text-white',
                  badge: 'bg-amber-200/80 text-amber-900',
                  locationText: 'text-amber-800',
                  label: isEn ? 'Warning' : 'אזהרה',
                  Icon: AlertTriangle
                },
                maintenance: {
                  container: 'bg-blue-50 border-blue-300 text-blue-950',
                  iconBg: 'bg-blue-600 text-white',
                  badge: 'bg-blue-200/80 text-blue-900',
                  locationText: 'text-blue-800',
                  label: isEn ? 'In Progress' : 'בטיפול',
                  Icon: Wrench
                },
                info: {
                  container: 'bg-emerald-50 border-emerald-300 text-emerald-950',
                  iconBg: 'bg-emerald-600 text-white',
                  badge: 'bg-emerald-200/80 text-emerald-900',
                  locationText: 'text-emerald-800',
                  label: isEn ? 'Update' : 'עדכון',
                  Icon: Info
                }
              }[bannerType];
              const IconComp = styleConfig.Icon;

              return (
                <div className={`p-3.5 rounded-2xl border shadow-xs flex items-start gap-3 text-start transition-all ${styleConfig.container}`}>
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 shadow-2xs ${styleConfig.iconBg}`}>
                    <IconComp size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-extrabold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md ${styleConfig.badge}`}>
                        {styleConfig.label}
                      </span>
                      {location && (
                        <span className={`font-bold text-xs truncate ${styleConfig.locationText}`}>
                          • {location}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-800 leading-snug">
                      {message || (isEn ? 'Banner message...' : 'תוכן ההודעה...')}
                    </p>
                  </div>
                  <div className="p-1 text-slate-400 rounded-md shrink-0">
                    <X size={14} />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* WhatsApp Copy Preview Bar */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-98 cursor-pointer"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-emerald-600" />}
              <span>{copied ? (isEn ? 'Copied to Clipboard!' : 'הנוסח הועתק!') : (isEn ? 'Copy formatted WhatsApp text' : 'העתק נוסח להודעת וואטסאפ של הבניין')}</span>
            </button>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          {currentBanner?.active ? (
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="text-xs font-bold text-slate-600 hover:text-red-600 transition-colors cursor-pointer"
            >
              {isEn ? 'Remove Banner' : 'הסר באנר קיים'}
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              {isEn ? 'Cancel' : 'ביטול'}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || !message.trim()}
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Pin size={15} />
              <span>{saving ? (isEn ? 'Saving...' : 'שומר...') : (isEn ? 'Pin Banner' : 'הצמד באנר')}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
