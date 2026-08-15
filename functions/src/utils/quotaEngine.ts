/**
 * Ticket Quota & Usage-Based Pricing Engine Utility
 */

export interface TierConfig {
  tier: 'starter' | 'basic' | 'standard' | 'growth' | 'enterprise';
  nameHe: string;
  nameEn: string;
  monthlyQuota: number;
  overageRate: number; // ILS per extra ticket
  monthlyPrice: number; // ILS
}

export const TIERS: Record<string, TierConfig> = {
  starter: {
    tier: 'starter',
    nameHe: 'מתחילים (Micro / Starter)',
    nameEn: 'Starter',
    monthlyQuota: 15,
    overageRate: 12.0,
    monthlyPrice: 99
  },
  basic: {
    tier: 'basic',
    nameHe: 'בסיסי (Basic)',
    nameEn: 'Basic',
    monthlyQuota: 35,
    overageRate: 10.0,
    monthlyPrice: 199
  },
  standard: {
    tier: 'standard',
    nameHe: 'סטנדרט (Standard)',
    nameEn: 'Standard',
    monthlyQuota: 80,
    overageRate: 8.0,
    monthlyPrice: 399
  },
  growth: {
    tier: 'growth',
    nameHe: 'צמיחה (Growth)',
    nameEn: 'Growth',
    monthlyQuota: 160,
    overageRate: 7.0,
    monthlyPrice: 699
  },
  enterprise: {
    tier: 'enterprise',
    nameHe: 'ארגוני / מועצות (Enterprise)',
    nameEn: 'Enterprise',
    monthlyQuota: 300,
    overageRate: 5.5,
    monthlyPrice: 1199
  }
};

export interface TenantSubscriptionData {
  tier: 'starter' | 'basic' | 'standard' | 'growth' | 'enterprise';
  status: 'active' | 'frozen' | 'cancelled' | 'trial';
  autoRenew: boolean;
  monthlyQuota: number;
  overageRate: number;
  billingCycleStartDay: number;
  cycleStartDate: string;
  cycleEndDate: string;
  frozenAt?: string | null;
  warned80PercentAt?: string | null;
  warned100PercentAt?: string | null;
  currentCycleTicketCount: number;
  currentCycleExclusions: number;
  rolloverTickets: number;
}

/**
 * Calculates the cycleStartDate and cycleEndDate for an anniversary billing cycle (Day X to Day X-1).
 * Handles short-month edge cases (e.g. Feb 28/29 for startDay 31).
 */
export function calculateBillingCycleDates(startDay: number, fromDate: Date = new Date()): { cycleStartDate: string; cycleEndDate: string } {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)

  // Start date in current month
  const maxStartDayInMonth = new Date(year, month + 1, 0).getDate();
  const actualStartDay = Math.min(startDay, maxStartDayInMonth);
  const cycleStart = new Date(Date.UTC(year, month, actualStartDay, 0, 0, 0, 0));

  // If fromDate is prior to this month's anniversary date, start was last month
  if (fromDate < cycleStart) {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const maxPrevStartDay = new Date(prevYear, prevMonth + 1, 0).getDate();
    const actualPrevStartDay = Math.min(startDay, maxPrevStartDay);
    cycleStart.setUTCFullYear(prevYear, prevMonth, actualPrevStartDay);
  }

  // End date is 1 month later minus 1 ms (Day X-1 at 23:59:59.999)
  const nextMonth = cycleStart.getUTCMonth() === 11 ? 0 : cycleStart.getUTCMonth() + 1;
  const nextYear = cycleStart.getUTCMonth() === 11 ? cycleStart.getUTCFullYear() + 1 : cycleStart.getUTCFullYear();
  const maxNextStartDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const actualNextStartDay = Math.min(startDay, maxNextStartDay);

  const cycleEnd = new Date(Date.UTC(nextYear, nextMonth, actualNextStartDay, 0, 0, 0, 0));
  cycleEnd.setTime(cycleEnd.getTime() - 1); // 23:59:59.999 of previous day

  return {
    cycleStartDate: cycleStart.toISOString(),
    cycleEndDate: cycleEnd.toISOString()
  };
}

/**
 * Initializes a new subscription object for a tenant.
 */
export function createInitialSubscription(tierName: string = 'starter', customStartDay?: number): TenantSubscriptionData {
  const tierConfig = TIERS[tierName] || TIERS.starter;
  const now = new Date();
  const startDay = customStartDay || now.getDate();
  const dates = calculateBillingCycleDates(startDay, now);

  return {
    tier: tierConfig.tier,
    status: 'active',
    autoRenew: true,
    monthlyQuota: tierConfig.monthlyQuota,
    overageRate: tierConfig.overageRate,
    billingCycleStartDay: startDay,
    cycleStartDate: dates.cycleStartDate,
    cycleEndDate: dates.cycleEndDate,
    frozenAt: null,
    warned80PercentAt: null,
    warned100PercentAt: null,
    currentCycleTicketCount: 0,
    currentCycleExclusions: 0,
    rolloverTickets: 0
  };
}

export interface QuotaStats {
  tier: string;
  status: 'active' | 'frozen' | 'cancelled' | 'trial';
  autoRenew: boolean;
  monthlyQuota: number;
  rolloverTickets: number;
  effectiveQuota: number; // monthlyQuota + rolloverTickets
  totalCreatedInCycle: number;
  totalExclusionsInCycle: number;
  netUsedTickets: number; // max(0, totalCreatedInCycle - totalExclusionsInCycle)
  remainingTickets: number; // max(0, effectiveQuota - netUsedTickets)
  overageTickets: number; // max(0, netUsedTickets - effectiveQuota)
  usagePercentage: number; // Math.min(100, (netUsedTickets / effectiveQuota) * 100)
  isOverage: boolean;
  isFrozen: boolean;
  warned80PercentAt?: string | null;
  warned100PercentAt?: string | null;
  estimatedOverageCost: number; // overageTickets * overageRate
  overageRate: number;
  cycleStartDate: string;
  cycleEndDate: string;
}

/**
 * Calculates current quota utilization statistics for a tenant.
 */
export function getTenantQuotaStats(tenantData: any): QuotaStats {
  const sub: Partial<TenantSubscriptionData> = tenantData?.subscription || {};
  const tier = sub.tier || 'starter';
  const tierConfig = TIERS[tier] || TIERS.starter;
  const status = sub.status || (tenantData?.isActive === false ? 'frozen' : 'active');
  const autoRenew = sub.autoRenew !== false;

  const monthlyQuota = typeof sub.monthlyQuota === 'number' ? sub.monthlyQuota : tierConfig.monthlyQuota;
  const rolloverTickets = sub.rolloverTickets || 0;
  const effectiveQuota = monthlyQuota + rolloverTickets;

  const totalCreatedInCycle = sub.currentCycleTicketCount || 0;
  const totalExclusionsInCycle = sub.currentCycleExclusions || 0;
  const netUsedTickets = Math.max(0, totalCreatedInCycle - totalExclusionsInCycle);

  const remainingTickets = Math.max(0, effectiveQuota - netUsedTickets);
  const overageTickets = Math.max(0, netUsedTickets - effectiveQuota);

  const usagePercentage = effectiveQuota > 0 
    ? Math.round((netUsedTickets / effectiveQuota) * 100) 
    : 0;

  const overageRate = sub.overageRate || tierConfig.overageRate;
  const estimatedOverageCost = parseFloat((overageTickets * overageRate).toFixed(2));

  return {
    tier,
    status,
    autoRenew,
    monthlyQuota,
    rolloverTickets,
    effectiveQuota,
    totalCreatedInCycle,
    totalExclusionsInCycle,
    netUsedTickets,
    remainingTickets,
    overageTickets,
    usagePercentage,
    isOverage: overageTickets > 0,
    isFrozen: status === 'frozen' || status === 'cancelled' || tenantData?.isActive === false,
    warned80PercentAt: sub.warned80PercentAt || null,
    warned100PercentAt: sub.warned100PercentAt || null,
    estimatedOverageCost,
    overageRate,
    cycleStartDate: sub.cycleStartDate || new Date().toISOString(),
    cycleEndDate: sub.cycleEndDate || new Date().toISOString()
  };
}

export interface RetroactiveOverageResult {
  baseQuota: number;
  bufferAllowance: number; // 5 tickets
  netUsed: number;
  isWithinBuffer: boolean; // true if netUsed <= baseQuota + 5
  overageTickets: number; // 0 if within buffer, else netUsed - baseQuota
  overageRate: number;
  totalOverageFee: number; // overageTickets * overageRate
}

/**
 * Calculates retroactive overage charges according to the 5-ticket buffer rule:
 * - If netUsed <= baseQuota + 5: overage = 0 (Grace zone).
 * - If netUsed > baseQuota + 5: overage applies retroactively to ALL extra tickets above baseQuota.
 */
export function calculateRetroactiveOverage(
  netUsed: number,
  baseQuota: number,
  overageRate: number,
  bufferAllowance: number = 5
): RetroactiveOverageResult {
  const isWithinBuffer = netUsed <= (baseQuota + bufferAllowance);
  const overageTickets = isWithinBuffer ? 0 : Math.max(0, netUsed - baseQuota);
  const totalOverageFee = parseFloat((overageTickets * overageRate).toFixed(2));

  return {
    baseQuota,
    bufferAllowance,
    netUsed,
    isWithinBuffer,
    overageTickets,
    overageRate,
    totalOverageFee
  };
}

export interface BillingCycleRecord {
  tenantId: string;
  tenantName: string;
  cycleStartDate: string;
  cycleEndDate: string;
  closedAt: string;
  tier: string;
  monthlyQuota: number;
  baseFee: number;
  totalTicketsCreated: number;
  totalExclusions: number;
  netUsedTickets: number;
  rolloverFromPrevious: number;
  effectiveQuota: number;
  bufferAllowance: number;
  isWithinBuffer: boolean;
  overageTickets: number;
  overageRate: number;
  totalOverageFee: number;
  totalAmountDue: number;
}

/**
 * Constructs a structured Billing Cycle Summary record for logging and invoicing.
 */
export function buildBillingCycleSummary(tenantId: string, tenantData: any): BillingCycleRecord {
  const stats = getTenantQuotaStats(tenantData);
  const tierConfig = TIERS[stats.tier] || TIERS.starter;
  const baseFee = tierConfig.monthlyPrice;

  const overageResult = calculateRetroactiveOverage(
    stats.netUsedTickets,
    stats.monthlyQuota,
    stats.overageRate,
    5
  );

  const totalAmountDue = parseFloat((baseFee + overageResult.totalOverageFee).toFixed(2));

  return {
    tenantId,
    tenantName: tenantData.name || tenantId,
    cycleStartDate: stats.cycleStartDate,
    cycleEndDate: stats.cycleEndDate,
    closedAt: new Date().toISOString(),
    tier: stats.tier,
    monthlyQuota: stats.monthlyQuota,
    baseFee,
    totalTicketsCreated: stats.totalCreatedInCycle,
    totalExclusions: stats.totalExclusionsInCycle,
    netUsedTickets: stats.netUsedTickets,
    rolloverFromPrevious: stats.rolloverTickets,
    effectiveQuota: stats.effectiveQuota,
    bufferAllowance: 5,
    isWithinBuffer: overageResult.isWithinBuffer,
    overageTickets: overageResult.overageTickets,
    overageRate: stats.overageRate,
    totalOverageFee: overageResult.totalOverageFee,
    totalAmountDue
  };
}

/**
 * Calculates reset data for a tenant advancing to a new billing cycle.
 * Rollover cushion: up to 20% of monthlyQuota from unused tickets.
 * Resets warned80PercentAt and warned100PercentAt to null.
 */
export function calculateCycleReset(tenantData: any): TenantSubscriptionData {
  const currentSub = getTenantQuotaStats(tenantData);
  const sub: Partial<TenantSubscriptionData> = tenantData?.subscription || {};

  const monthlyQuota = sub.monthlyQuota || TIERS.starter.monthlyQuota;
  const unusedTickets = currentSub.remainingTickets;
  const maxRollover = Math.floor(monthlyQuota * 0.20);
  const newRollover = Math.min(unusedTickets, maxRollover);

  const startDay = sub.billingCycleStartDay || 1;
  const oldEndDate = sub.cycleEndDate ? new Date(sub.cycleEndDate) : new Date();
  // Next cycle starts immediately after previous cycleEnd
  const nextCycleFromDate = new Date(oldEndDate.getTime() + 1000);
  const newDates = calculateBillingCycleDates(startDay, nextCycleFromDate);

  const tier = sub.tier || 'starter';
  const tierConfig = TIERS[tier] || TIERS.starter;

  return {
    tier: tier,
    status: sub.status || 'active',
    autoRenew: sub.autoRenew !== false,
    monthlyQuota: monthlyQuota,
    overageRate: sub.overageRate || tierConfig.overageRate,
    billingCycleStartDay: startDay,
    cycleStartDate: newDates.cycleStartDate,
    cycleEndDate: newDates.cycleEndDate,
    frozenAt: sub.frozenAt || null,
    warned80PercentAt: null,
    warned100PercentAt: null,
    currentCycleTicketCount: 0,
    currentCycleExclusions: 0,
    rolloverTickets: newRollover
  };
}
