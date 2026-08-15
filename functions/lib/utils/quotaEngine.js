"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIERS = void 0;
exports.calculateBillingCycleDates = calculateBillingCycleDates;
exports.createInitialSubscription = createInitialSubscription;
exports.getTenantQuotaStats = getTenantQuotaStats;
exports.calculateRetroactiveOverage = calculateRetroactiveOverage;
exports.buildBillingCycleSummary = buildBillingCycleSummary;
exports.calculateCycleReset = calculateCycleReset;
exports.TIERS = {
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
function calculateBillingCycleDates(startDay, fromDate = new Date()) {
    const year = fromDate.getFullYear();
    const month = fromDate.getMonth();
    const maxStartDayInMonth = new Date(year, month + 1, 0).getDate();
    const actualStartDay = Math.min(startDay, maxStartDayInMonth);
    const cycleStart = new Date(Date.UTC(year, month, actualStartDay, 0, 0, 0, 0));
    if (fromDate < cycleStart) {
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const maxPrevStartDay = new Date(prevYear, prevMonth + 1, 0).getDate();
        const actualPrevStartDay = Math.min(startDay, maxPrevStartDay);
        cycleStart.setUTCFullYear(prevYear, prevMonth, actualPrevStartDay);
    }
    const nextMonth = cycleStart.getUTCMonth() === 11 ? 0 : cycleStart.getUTCMonth() + 1;
    const nextYear = cycleStart.getUTCMonth() === 11 ? cycleStart.getUTCFullYear() + 1 : cycleStart.getUTCFullYear();
    const maxNextStartDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    const actualNextStartDay = Math.min(startDay, maxNextStartDay);
    const cycleEnd = new Date(Date.UTC(nextYear, nextMonth, actualNextStartDay, 0, 0, 0, 0));
    cycleEnd.setTime(cycleEnd.getTime() - 1);
    return {
        cycleStartDate: cycleStart.toISOString(),
        cycleEndDate: cycleEnd.toISOString()
    };
}
function createInitialSubscription(tierName = 'starter', customStartDay) {
    const tierConfig = exports.TIERS[tierName] || exports.TIERS.starter;
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
function getTenantQuotaStats(tenantData) {
    const sub = tenantData?.subscription || {};
    const tier = sub.tier || 'starter';
    const tierConfig = exports.TIERS[tier] || exports.TIERS.starter;
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
function calculateRetroactiveOverage(netUsed, baseQuota, overageRate, bufferAllowance = 5) {
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
function buildBillingCycleSummary(tenantId, tenantData) {
    const stats = getTenantQuotaStats(tenantData);
    const tierConfig = exports.TIERS[stats.tier] || exports.TIERS.starter;
    const baseFee = tierConfig.monthlyPrice;
    const overageResult = calculateRetroactiveOverage(stats.netUsedTickets, stats.monthlyQuota, stats.overageRate, 5);
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
function calculateCycleReset(tenantData) {
    const currentSub = getTenantQuotaStats(tenantData);
    const sub = tenantData?.subscription || {};
    const monthlyQuota = sub.monthlyQuota || exports.TIERS.starter.monthlyQuota;
    const unusedTickets = currentSub.remainingTickets;
    const maxRollover = Math.floor(monthlyQuota * 0.20);
    const newRollover = Math.min(unusedTickets, maxRollover);
    const startDay = sub.billingCycleStartDay || 1;
    const oldEndDate = sub.cycleEndDate ? new Date(sub.cycleEndDate) : new Date();
    const nextCycleFromDate = new Date(oldEndDate.getTime() + 1000);
    const newDates = calculateBillingCycleDates(startDay, nextCycleFromDate);
    const tier = sub.tier || 'starter';
    const tierConfig = exports.TIERS[tier] || exports.TIERS.starter;
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
//# sourceMappingURL=quotaEngine.js.map