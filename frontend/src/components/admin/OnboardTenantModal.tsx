import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../../lib/firebase';
import {
  Building2,
  X,
  CreditCard,
  FileText,
  UserCheck,
  CheckCircle2,
  Copy,
  Check,
  Share2,
  Plus,
  Trash2,
  Shield,
  Layers
} from 'lucide-react';

interface OnboardTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FleetBuildingItem {
  id: string;
  name: string;
}

const TICKET_PRESETS: Record<string, { monthlyQuota: number; overageRate: number }> = {
  starter: { monthlyQuota: 15, overageRate: 12.0 },
  basic: { monthlyQuota: 35, overageRate: 10.0 },
  standard: { monthlyQuota: 80, overageRate: 8.0 },
  growth: { monthlyQuota: 160, overageRate: 7.0 },
  enterprise: { monthlyQuota: 300, overageRate: 5.5 }
};

const RFQ_PRESETS: Record<string, { annualQuota: number; overageRate: number }> = {
  disabled: { annualQuota: 0, overageRate: 59.0 },
  starter: { annualQuota: 3, overageRate: 59.0 },
  basic: { annualQuota: 6, overageRate: 49.0 },
  standard: { annualQuota: 12, overageRate: 45.0 },
  growth: { annualQuota: 25, overageRate: 39.0 },
  enterprise: { annualQuota: 50, overageRate: 35.0 }
};

export function OnboardTenantModal({ isOpen, onClose, onSuccess }: OnboardTenantModalProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language !== 'en';

  const [mode, setMode] = useState<'single' | 'fleet'>('single');

  // Single Tenant State
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');

  // Fleet State
  const [fleetMasterId, setFleetMasterId] = useState('');
  const [fleetMasterName, setFleetMasterName] = useState('');
  const [fleetMasterAddress, setFleetMasterAddress] = useState('');
  const [fleetBuildings, setFleetBuildings] = useState<FleetBuildingItem[]>([
    { id: '', name: '' },
    { id: '', name: '' }
  ]);

  // Admin User State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminMobile, setAdminMobile] = useState('');

  // TikTak Subscription
  const [ticketTier, setTicketTier] = useState('standard');
  const [monthlyQuota, setMonthlyQuota] = useState(80);
  const [ticketOverageRate, setTicketOverageRate] = useState(8.0);

  // RFQ Licensing
  const [rfqTier, setRfqTier] = useState('standard');
  const [annualQuota, setAnnualQuota] = useState(12);
  const [rfqOverageRate, setRfqOverageRate] = useState(45.0);
  const [enforcementMode, setEnforcementMode] = useState<'hard' | 'soft'>('hard');
  const defaultNextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [licenseExpiresAt, setLicenseExpiresAt] = useState(defaultNextYear);

  // Form State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    tenantId: string;
    adminEmail: string;
    resetLink: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Reset modal state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setSuccessData(null);
      setError(null);
      setCopiedLink(false);
      setMode('single');
      setTenantId('');
      setTenantName('');
      setTenantAddress('');
      setFleetMasterId('');
      setFleetMasterName('');
      setFleetMasterAddress('');
      setFleetBuildings([
        { id: '', name: '' },
        { id: '', name: '' }
      ]);
      setAdminEmail('');
      setAdminFirstName('');
      setAdminLastName('');
      setAdminMobile('');
      setTicketTier('standard');
      setMonthlyQuota(80);
      setTicketOverageRate(8.0);
      setRfqTier('standard');
      setAnnualQuota(12);
      setRfqOverageRate(45.0);
      setEnforcementMode('hard');
      setLicenseExpiresAt(defaultNextYear);
    }
  }, [isOpen]);

  const handleClose = () => {
    setSuccessData(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleTicketTierSelect = (tierKey: string) => {
    setTicketTier(tierKey);
    const preset = TICKET_PRESETS[tierKey];
    if (preset) {
      setMonthlyQuota(preset.monthlyQuota);
      setTicketOverageRate(preset.overageRate);
    }
  };

  const handleRfqTierSelect = (tierKey: string) => {
    setRfqTier(tierKey);
    const preset = RFQ_PRESETS[tierKey];
    if (preset) {
      setAnnualQuota(preset.annualQuota);
      setRfqOverageRate(preset.overageRate);
    }
  };

  const handleAddFleetBuilding = () => {
    setFleetBuildings([...fleetBuildings, { id: '', name: '' }]);
  };

  const handleRemoveFleetBuilding = (index: number) => {
    if (fleetBuildings.length <= 1) return;
    setFleetBuildings(fleetBuildings.filter((_, i) => i !== index));
  };

  const handleUpdateFleetBuilding = (index: number, field: 'id' | 'name', value: string) => {
    const next = [...fleetBuildings];
    next[index][field] = value;
    setFleetBuildings(next);
  };

  const handleCopyLink = () => {
    if (!successData?.resetLink) return;
    navigator.clipboard.writeText(successData.resetLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const isFleet = mode === 'fleet';
      const resolvedTenantId = mode === 'single' ? tenantId.trim().toLowerCase() : fleetMasterId.trim().toLowerCase();
      const resolvedTenantName = mode === 'single' ? tenantName.trim() : fleetMasterName.trim();
      const resolvedAddress = mode === 'single' ? tenantAddress.trim() : fleetMasterAddress.trim();

      const tenantData = {
        tenantId: resolvedTenantId,
        name: resolvedTenantName,
        address: resolvedAddress
      };

      const validChildBuildings = isFleet
        ? fleetBuildings
            .filter(b => b.id.trim() && b.name.trim())
            .map(b => ({
              tenantId: b.id.trim().toLowerCase(),
              id: b.id.trim().toLowerCase(),
              name: b.name.trim()
            }))
        : [];

      if (isFleet && validChildBuildings.length === 0) {
        throw new Error('יש להזין לפחות מבנה אחד תקין במתחם');
      }

      const fullName = `${adminFirstName.trim()} ${adminLastName.trim()}`.trim();
      const adminPayload = {
        email: adminEmail.trim().toLowerCase(),
        firstName: adminFirstName.trim(),
        lastName: adminLastName.trim(),
        name: fullName,
        fullName: fullName,
        mobile: adminMobile.trim(),
        role: 'superadmin'
      };

      const ticketPayload = {
        tier: ticketTier,
        monthlyQuota: Number(monthlyQuota),
        overageRate: Number(ticketOverageRate)
      };

      const rfqPayload = {
        tier: rfqTier,
        status: rfqTier !== 'disabled' ? 'active' : 'disabled',
        annualQuota: Number(annualQuota),
        overageRate: Number(rfqOverageRate),
        enforcementMode,
        licenseExpiresAt: new Date(licenseExpiresAt).toISOString()
      };

      const currentUser = auth.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : null;

      const payload: any = {
        callerUid: currentUser?.uid,
        isFleet,
        type: mode,
        entityType: 'building',
        tenantData,
        childBuildings: validChildBuildings,
        adminUserData: adminPayload,
        ticketTier: ticketPayload,
        rfqTier: rfqPayload,
        // Legacy / fallback mappings
        admin: adminPayload,
        ticketSubscription: ticketPayload,
        rfqLicensing: rfqPayload,
        singleTenant: mode === 'single' ? { id: resolvedTenantId, name: resolvedTenantName, address: resolvedAddress } : undefined,
        fleet: isFleet ? { fleetMasterId: resolvedTenantId, fleetMasterName: resolvedTenantName, address: resolvedAddress, buildings: validChildBuildings } : undefined
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/provisionTenantOrFleet', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const resData = await res.json().catch(() => ({}));
        throw new Error(resData.error || 'הקמת הלקוח נכשלה');
      }

      const resData = await res.json();
      setSuccessData({
        tenantId: resolvedTenantId,
        adminEmail: adminEmail.trim().toLowerCase(),
        resetLink: resData.passwordResetLink || ''
      });
    } catch (err: any) {
      setError(err.message || 'שגיאה בהקמת הלקוח');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Building2 size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t('super_modal_create_title')}</h2>
              <p className="text-xs text-slate-500">{t('super_modal_create_desc')}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {successData ? (
            /* SUCCESS VIEW */
            <div className="space-y-6 py-4 text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">{t('super_provision_success_title')}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  מזהה: <span className="font-mono font-bold text-slate-700">{successData.tenantId}</span> | מנהל:{' '}
                  <span className="font-bold text-slate-700">{successData.adminEmail}</span>
                </p>
              </div>

              {successData.resetLink && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-start space-y-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                    <Shield size={14} className="text-blue-600" />
                    {t('super_provision_reset_link_label')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      dir="ltr"
                      value={successData.resetLink}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-600 outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
                    >
                      {copiedLink ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      {copiedLink ? t('super_link_copied') : t('super_copy_link')}
                    </button>
                  </div>
                </div>
              )}

              {adminMobile && successData.resetLink && (
                <div className="flex justify-center">
                  <a
                    href={`https://wa.me/972${adminMobile.replace(/\D/g, '').replace(/^0/, '')}?text=${encodeURIComponent(
                      `שלום ${adminFirstName.trim() || 'מנהל'},\nברוך הבא למערכת TikTak!\nהחשבון שלך הוקם בהצלחה. להגדרת סיסמה ראשונית וכניסה למערכת הניהול, היכנס לקישור הבא:\n${successData.resetLink}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-md shadow-green-600/20 transition-all active:scale-95"
                  >
                    <Share2 size={16} />
                    {t('super_send_whatsapp_invite')}
                  </a>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    onSuccess();
                    handleClose();
                  }}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
                >
                  {t('super_provision_done')}
                </button>
              </div>
            </div>
          ) : (
            /* WIZARD FORM */
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
                  {error}
                </div>
              )}

              {/* Step 1: Mode Selection (Single vs Fleet) */}
              <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    mode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 size={15} />
                  {t('super_tab_mode_single')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('fleet')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    mode === 'fleet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers size={15} />
                  {t('super_tab_mode_fleet')}
                </button>
              </div>

              {/* Step 2: Tenant Identity */}
              {mode === 'single' ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    פרטי הבניין / הלקוח
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_tenant_id')}</label>
                      <input
                        type="text"
                        dir="ltr"
                        required
                        placeholder="rotshild-10"
                        value={tenantId}
                        onChange={e => setTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_tenant_name')}</label>
                      <input
                        type="text"
                        required
                        placeholder="רוטשילד 10, תל אביב"
                        value={tenantName}
                        onChange={e => setTenantName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_tenant_address')}</label>
                    <input
                      type="text"
                      placeholder="שדרות רוטשילד 10, תל אביב-יפו"
                      value={tenantAddress}
                      onChange={e => setTenantAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-purple-600">
                    {t('super_section_fleet_settings')}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">מזהה המתחם (Master Slug)</label>
                      <input
                        type="text"
                        dir="ltr"
                        required
                        placeholder="sarona-fleet"
                        value={fleetMasterId}
                        onChange={e => setFleetMasterId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                        className="w-full px-3 py-2 bg-slate-50 border border-purple-200 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">שם המתחם (Master Name)</label>
                      <input
                        type="text"
                        required
                        placeholder="מתחם שרונה"
                        value={fleetMasterName}
                        onChange={e => setFleetMasterName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-purple-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">כתובת המתחם</label>
                    <input
                      type="text"
                      placeholder="רחוב קפלן 1, תל אביב"
                      value={fleetMasterAddress}
                      onChange={e => setFleetMasterAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  {/* Child Buildings List */}
                  <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-purple-900">{t('super_field_fleet_buildings')}</label>
                      <button
                        type="button"
                        onClick={handleAddFleetBuilding}
                        className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 transition-colors"
                      >
                        <Plus size={14} /> {t('super_btn_add_building')}
                      </button>
                    </div>

                    {fleetBuildings.map((building, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          placeholder={`מזהה מבנה ${idx + 1} (למשל: bldg-a)`}
                          value={building.id}
                          onChange={e => handleUpdateFleetBuilding(idx, 'id', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                          className="flex-1 px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-mono font-bold outline-none"
                        />
                        <input
                          type="text"
                          placeholder={`שם מבנה ${idx + 1} (למשל: בניין A - מגורים)`}
                          value={building.name}
                          onChange={e => handleUpdateFleetBuilding(idx, 'name', e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold outline-none"
                        />
                        {fleetBuildings.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFleetBuilding(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Primary Admin Info */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-blue-600" />
                  פרטי מנהל ראשי
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_admin_first_name')}</label>
                    <input
                      type="text"
                      required
                      placeholder="ישראל"
                      value={adminFirstName}
                      onChange={e => setAdminFirstName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_admin_last_name')}</label>
                    <input
                      type="text"
                      required
                      placeholder="ישראלי"
                      value={adminLastName}
                      onChange={e => setAdminLastName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_admin_email')}</label>
                    <input
                      type="email"
                      dir="ltr"
                      required
                      placeholder="admin@building.co.il"
                      value={adminEmail}
                      onChange={e => setAdminEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_admin_phone')}</label>
                    <input
                      type="tel"
                      dir="ltr"
                      required
                      placeholder="0501234567"
                      value={adminMobile}
                      onChange={e => setAdminMobile(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: TikTak Tickets Licensing */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <CreditCard size={14} className="text-blue-600" />
                  {t('super_section_tiktak_licensing')}
                </h4>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['starter', 'basic', 'standard', 'growth', 'enterprise'] as const).map(tierKey => (
                    <button
                      type="button"
                      key={tierKey}
                      onClick={() => handleTicketTierSelect(tierKey)}
                      className={`p-2 rounded-xl text-[11px] font-bold border transition-all text-center uppercase ${
                        ticketTier === tierKey
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tierKey}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_quota')}</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={monthlyQuota}
                      onChange={e => setMonthlyQuota(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_overage')}</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      required
                      value={ticketOverageRate}
                      onChange={e => setTicketOverageRate(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Step 5: RFQ Licensing */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText size={14} className="text-purple-600" />
                  {t('super_section_rfq_licensing')}
                </h4>
                <div className="grid grid-cols-6 gap-1">
                  {(['disabled', 'starter', 'basic', 'standard', 'growth', 'enterprise'] as const).map(tierKey => (
                    <button
                      type="button"
                      key={tierKey}
                      onClick={() => handleRfqTierSelect(tierKey)}
                      className={`p-1.5 rounded-xl text-[10px] font-bold border transition-all text-center uppercase ${
                        rfqTier === tierKey
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tierKey}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="h-5 flex items-center text-xs font-bold text-slate-700 mb-1 whitespace-nowrap truncate" title={t('super_field_annual_quota')}>
                      {t('super_field_annual_quota')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={annualQuota}
                      onChange={e => setAnnualQuota(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="h-5 flex items-center text-xs font-bold text-slate-700 mb-1 whitespace-nowrap truncate" title={t('super_field_rfq_overage')}>
                      {t('super_field_rfq_overage')}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      required
                      value={rfqOverageRate}
                      onChange={e => setRfqOverageRate(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="h-5 flex items-center text-xs font-bold text-slate-700 mb-1 whitespace-nowrap truncate" title={t('super_field_enforcement')}>
                      {t('super_field_enforcement')}
                    </label>
                    <select
                      value={enforcementMode}
                      onChange={e => setEnforcementMode(e.target.value as 'hard' | 'soft')}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    >
                      <option value="hard">Hard Cap</option>
                      <option value="soft">Soft Cap</option>
                    </select>
                  </div>
                  <div>
                    <label className="h-5 flex items-center text-xs font-bold text-slate-700 mb-1 whitespace-nowrap truncate" title={t('super_field_expires_at')}>
                      {t('super_field_expires_at')}
                    </label>
                    <input
                      type="date"
                      required
                      value={licenseExpiresAt}
                      onChange={e => setLicenseExpiresAt(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  {t('super_modal_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'מקים לקוח...' : t('super_btn_provision_submit')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
