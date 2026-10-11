import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  Receipt,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowUpRight,
  Layers
} from 'lucide-react';

interface RfqQuotaProgressWidgetProps {
  tenantData: any;
  tenantId?: string;
  className?: string;
}

export const RfqQuotaProgressWidget: React.FC<RfqQuotaProgressWidgetProps> = ({
  tenantData,
  tenantId,
  className
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';

  const [masterTenantData, setMasterTenantData] = useState<any>(null);
  const [loadingMaster, setLoadingMaster] = useState(false);

  useEffect(() => {
    if (tenantData?.parentEnterpriseId) {
      setLoadingMaster(true);
      getDoc(doc(db, "tenants", tenantData.parentEnterpriseId))
        .then((pSnap) => {
          if (pSnap.exists()) {
            setMasterTenantData(pSnap.data());
          }
        })
        .catch((err) => console.error("Error loading master pool data for RFQ:", err))
        .finally(() => setLoadingMaster(false));
    } else {
      setMasterTenantData(null);
    }
  }, [tenantData?.parentEnterpriseId]);

  if (tenantData?.parentEnterpriseId && !masterTenantData && loadingMaster) {
    return null;
  }

  const activeTenant = (tenantData?.parentEnterpriseId && masterTenantData)
    ? masterTenantData
    : tenantData;

  const rfqLicensing = activeTenant?.rfqLicensing;
  if (!rfqLicensing) return null;

  const isRfqActive = Boolean(
    rfqLicensing &&
    rfqLicensing.status === 'active' &&
    rfqLicensing.tier &&
    rfqLicensing.tier !== 'disabled'
  );

  if (!isRfqActive) return null;

  const tier = (rfqLicensing.tier || 'starter').toLowerCase();

  const tierNames: Record<string, string> = {
    starter: t('RfqQuota.tierStarter', 'מתחילים (Starter)'),
    basic: t('RfqQuota.tierBasic', 'בסיסי (Basic)'),
    standard: t('RfqQuota.tierStandard', 'סטנדרט (Standard)'),
    growth: t('RfqQuota.tierGrowth', 'צמיחה (Growth)'),
    enterprise: t('RfqQuota.tierEnterprise', 'ארגוני (Enterprise)'),
    custom: t('RfqQuota.tierCustom', 'התאמה אישית (Custom)')
  };

  const annualQuota = Number(rfqLicensing.annualQuota ?? 0);
  const dispatchedCount = Number(rfqLicensing.currentAnnualUsage?.dispatchedCount ?? 0);
  const enforcementMode = rfqLicensing.enforcementMode || 'hard';
  const overageRate = Number(rfqLicensing.overageRate ?? 45);

  const usagePercentage = annualQuota > 0
    ? Math.min(100, Math.round((dispatchedCount / annualQuota) * 100))
    : 0;

  const licenseExpiresAt = rfqLicensing.licenseExpiresAt;
  const isExpired = licenseExpiresAt
    ? new Date(licenseExpiresAt).getTime() < Date.now()
    : false;

  let daysRemaining: number | null = null;
  if (licenseExpiresAt) {
    const end = new Date(licenseExpiresAt).getTime();
    const now = Date.now();
    const diffTime = Math.max(0, end - now);
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const isAtOrAboveQuota = annualQuota > 0 && dispatchedCount >= annualQuota;
  const isHardCapBlocked = isAtOrAboveQuota && enforcementMode === 'hard';
  const isSoftCapOverage = isAtOrAboveQuota && enforcementMode === 'soft';
  const isWarning80 = usagePercentage >= 80 && !isAtOrAboveQuota;

  // Progress Bar Color Logic
  const getProgressBarColor = () => {
    if (isExpired) return 'bg-slate-400';
    if (isHardCapBlocked) return 'bg-red-500';
    if (isSoftCapOverage) return 'bg-amber-500';
    if (isWarning80) return 'bg-amber-500';
    return 'bg-purple-600';
  };

  const resolvedTenantId = tenantId || tenantData?.id;
  const isPooled = Boolean(tenantData?.usesParentPool || tenantData?.parentEnterpriseId);

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 transition-all duration-200 hover:shadow-md flex flex-col justify-between ${
        className !== undefined ? className : 'mb-6'
      }`}
    >
      <div>
        {/* Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 tracking-wider">
                  RFQ
                </span>
                <span className="font-bold text-slate-900 text-base">
                  {tierNames[tier] || tier.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                  {annualQuota} {t('RfqQuota.rfqsPerYear', 'מכרזים/שנה')}
                </span>
                {isPooled && (
                  <span className="px-2 py-0.5 text-xs font-extrabold rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {isEn ? 'Shared Fleet Pool' : 'מאגר משותף'}
                  </span>
                )}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    enforcementMode === 'hard'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {enforcementMode === 'hard'
                    ? 'Hard Cap'
                    : `Soft Cap (₪${overageRate})`}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('RfqQuota.annualQuota', 'מכסה שנתית')}:{' '}
                <strong className="text-slate-700">{annualQuota}</strong>
                <span className="ms-1.5 text-slate-400 font-normal">
                  {enforcementMode === 'hard'
                    ? `• ${t('RfqQuota.hardCapPolicy', 'מדיניות חסימה מלאה (Hard Cap)')}`
                    : `• ${t('RfqQuota.overagePolicy', 'חריגה: ₪{{rate}} למכרז נוסף (Soft Cap)', { rate: overageRate })}`}
                </span>
              </p>
            </div>
          </div>

          {/* Days remaining or expiration badge */}
          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">
            {isExpired ? (
              <>
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-600 font-bold">
                  {t('RfqQuota.licenseExpired', 'פג תוקף הרישוי השנתי!')}
                </span>
              </>
            ) : daysRemaining !== null ? (
              <>
                <Clock className="w-4 h-4 text-purple-500" />
                <span>
                  {daysRemaining === 1
                    ? t('RfqQuota.daysRemainingOne', 'נותר יום אחד לתוקף השנתי')
                    : t('RfqQuota.daysRemaining', 'נותרו {{days}} ימים לתוקף השנתי', { days: daysRemaining })}
                </span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-slate-500" />
                <span>{t('RfqQuota.licenseActive', 'רישוי שנתי פעיל')}</span>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="relative w-full bg-slate-100 rounded-full h-3.5 overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor()}`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {/* Footer Stats Row */}
      <div className="flex flex-wrap items-center justify-between text-xs gap-2 pt-1 border-t border-slate-50">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-700">
            {t('RfqQuota.netUsed', 'ניצול שנתי בפועל')}:{' '}
            <strong className="text-slate-900">{dispatchedCount}</strong> / {annualQuota} ({usagePercentage}%)
          </span>

          {resolvedTenantId && (
            <Link
              to={`/admin/${resolvedTenantId}/quotes/active`}
              className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-bold hover:underline transition-colors"
              title={isEn ? 'View and manage active RFQ tenders' : 'מעבר למסך מעקב וניהול מכרזים פעילים'}
            >
              <span>{t('RfqQuota.viewQuotes', 'לניהול מכרזים')}</span>
              <ArrowUpRight className="w-3.5 h-3.5 rtl:rotate-[-90deg]" />
            </Link>
          )}
        </div>

        {/* Dynamic Status Pill */}
        <div>
          {isExpired && (
            <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
              {t('RfqQuota.statusExpired', 'תוקף הרישוי השנתי פג')}
            </span>
          )}

          {!isExpired && isHardCapBlocked && (
            <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              {t('RfqQuota.statusAlert100', 'המכסה השנתית התמלאה (Hard Cap)')}
            </span>
          )}

          {!isExpired && isSoftCapOverage && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {t('RfqQuota.statusOverage', 'חריגה מהמכסה השנתית (Soft Cap)')}
            </span>
          )}

          {!isExpired && isWarning80 && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {t('RfqQuota.statusWarning80', 'הגעתם ל-80% מניצול המכסה השנתית')}
            </span>
          )}

          {!isExpired && !isHardCapBlocked && !isSoftCapOverage && !isWarning80 && (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {t('RfqQuota.statusNormal', 'שימוש תקין במכסה')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
