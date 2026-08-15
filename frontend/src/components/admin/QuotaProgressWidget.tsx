import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { CreditCard, AlertTriangle, Clock, CheckCircle2, RotateCcw, AlertCircle, Layers } from 'lucide-react';

interface QuotaProgressWidgetProps {
  tenantData: any;
}

export const QuotaProgressWidget: React.FC<QuotaProgressWidgetProps> = ({ tenantData }) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';

  const [masterTenantData, setMasterTenantData] = useState<any>(null);

  // If this tenant uses a parent pool, fetch the master pool host tenant data
  useEffect(() => {
    if (tenantData?.usesParentPool && tenantData?.parentEnterpriseId) {
      getDoc(doc(db, "tenants", tenantData.parentEnterpriseId))
        .then((pSnap) => {
          if (pSnap.exists()) {
            setMasterTenantData(pSnap.data());
          }
        })
        .catch((err) => console.error("Error loading master pool data:", err));
    }
  }, [tenantData]);

  const activeTenant = masterTenantData || tenantData;
  const sub = activeTenant?.subscription || {};
  const tier = (sub.tier || 'starter').toLowerCase();
  
  const tierNames: Record<string, string> = {
    starter: t('Quota.tierStarter', 'מתחילים (Starter)'),
    basic: t('Quota.tierBasic', 'בסיסי (Basic)'),
    standard: t('Quota.tierStandard', 'סטנדרט (Standard)'),
    growth: t('Quota.tierGrowth', 'צמיחה (Growth)'),
    enterprise: t('Quota.tierEnterprise', 'ארגוני (Enterprise)')
  };

  const monthlyQuota = typeof sub.monthlyQuota === 'number' ? sub.monthlyQuota : 15;
  const rolloverTickets = Number(sub.rolloverTickets || 0);
  const effectiveQuota = monthlyQuota + rolloverTickets;

  const totalCreated = Number(sub.currentCycleTicketCount || 0);
  const exclusions = Number(sub.currentCycleExclusions || 0);

  // Safeguard: Clamp net used to at least 0
  const netUsedTickets = Math.max(0, totalCreated - exclusions);

  // Safeguard: Division by zero protection
  const usagePercentage = effectiveQuota > 0
    ? Math.min(100, Math.round((netUsedTickets / effectiveQuota) * 100))
    : 0;

  const isFrozen = activeTenant?.isActive === false || sub.status === 'frozen' || sub.status === 'cancelled';
  const isWarning80 = usagePercentage >= 80 && usagePercentage < 100;
  const isAlert100 = usagePercentage >= 100;

  // Days remaining calculation
  let daysRemaining = 0;
  if (sub.cycleEndDate) {
    const end = new Date(sub.cycleEndDate).getTime();
    const now = new Date().getTime();
    const diffTime = Math.max(0, end - now);
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Progress Bar Color Logic
  const getProgressBarColor = () => {
    if (isFrozen) return 'bg-slate-400';
    if (isAlert100) return 'bg-red-500';
    if (isWarning80) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const isPooled = Boolean(tenantData?.usesParentPool);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 mb-6 transition-all duration-200 hover:shadow-md">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-base">
                {tierNames[tier] || tier.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                {monthlyQuota} {t('Reporting.send', 'פניות')}/{isEn ? 'mo' : 'חודש'}
              </span>
              {isPooled && (
                <span className="px-2 py-0.5 text-xs font-extrabold rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {isEn ? 'Shared Fleet Pool' : 'מאגר משותף'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('Quota.monthlyQuota', 'מכסה חודשית')}: <strong className="text-slate-700">{monthlyQuota}</strong>
              {rolloverTickets > 0 && (
                <span className="ms-1.5 text-emerald-600 font-medium">
                  (+{rolloverTickets} {t('Quota.rolloverTickets', 'פניות מגושרות')})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Days remaining badge */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
          <Clock className="w-4 h-4 text-slate-500" />
          <span>
            {daysRemaining === 1
              ? t('Quota.daysRemainingOne', 'נותר יום אחד למחזור החיוב')
              : t('Quota.daysRemaining', 'נותרו {{days}} ימים למחזור החיוב', { days: daysRemaining })}
          </span>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative w-full bg-slate-100 rounded-full h-3.5 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor()}`}
          style={{ width: `${usagePercentage}%` }}
        />
      </div>

      {/* Footer Stats Row */}
      <div className="flex flex-wrap items-center justify-between text-xs gap-2 pt-1">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-700">
            {t('Quota.netUsed', 'ניצול בפועל')}: <strong className="text-slate-900">{netUsedTickets}</strong> / {effectiveQuota} ({usagePercentage}%)
          </span>

          {exclusions > 0 && (
            <span className="flex items-center gap-1 text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              <RotateCcw className="w-3 h-3 text-slate-400" />
              {exclusions} {t('Quota.exclusions', 'פניות שקוזזו')}
            </span>
          )}
        </div>

        {/* Dynamic Status Pill */}
        <div>
          {isFrozen && (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
              <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
              {t('Quota.statusFrozen', 'חשבון מוקפא')}
            </span>
          )}

          {!isFrozen && isAlert100 && (
            <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              {t('Quota.statusAlert100', 'המכסה התמלאה - 5 פניות בחוצץ ללא חיוב חריגה')}
            </span>
          )}

          {!isFrozen && isWarning80 && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {t('Quota.statusWarning80', 'הגעתם ל-80% מניצול המכסה החודשית')}
            </span>
          )}

          {!isFrozen && !isWarning80 && !isAlert100 && (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {t('Quota.statusNormal', 'שימוש תקין במכסה')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
