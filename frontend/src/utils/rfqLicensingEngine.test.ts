import { describe, it, expect } from 'vitest';

/**
 * Domain Logic under test: RFQ Licensing & Quota Calculations
 */

export const RFQ_TIER_PRESETS: Record<string, { annualQuota: number; overageRate: number }> = {
  disabled: { annualQuota: 0, overageRate: 59.0 },
  starter: { annualQuota: 5, overageRate: 49.0 },
  basic: { annualQuota: 10, overageRate: 45.0 },
  standard: { annualQuota: 15, overageRate: 40.0 },
  growth: { annualQuota: 25, overageRate: 36.0 },
  enterprise: { annualQuota: 50, overageRate: 35.0 }
};

export function evaluateRfqDispatchEligibility(licensing: {
  status?: string;
  tier?: string;
  annualQuota?: number;
  currentAnnualUsage?: { dispatchedCount?: number };
  enforcementMode?: 'hard' | 'soft';
  licenseExpiresAt?: string;
  overageRate?: number;
}): {
  canDispatch: boolean;
  isHardCapBlocked: boolean;
  isSoftCapOverage: boolean;
  isExpired: boolean;
  overageFee: number;
} {
  const isRfqActive = Boolean(
    licensing &&
    licensing.status === 'active' &&
    licensing.tier &&
    licensing.tier !== 'disabled'
  );
  if (!isRfqActive) {
    return { canDispatch: false, isHardCapBlocked: true, isSoftCapOverage: false, isExpired: false, overageFee: 0 };
  }

  const isExpired = licensing.licenseExpiresAt
    ? new Date(licensing.licenseExpiresAt).getTime() < Date.now()
    : false;

  if (isExpired) {
    return { canDispatch: false, isHardCapBlocked: false, isSoftCapOverage: false, isExpired: true, overageFee: 0 };
  }

  const annualQuota = Number(licensing.annualQuota ?? 0);
  const dispatchedCount = Number(licensing.currentAnnualUsage?.dispatchedCount ?? 0);
  const enforcementMode = licensing.enforcementMode || 'hard';
  const overageRate = Number(licensing.overageRate ?? 45);

  const isAtOrAboveQuota = annualQuota > 0 && dispatchedCount >= annualQuota;
  const isHardCapBlocked = isAtOrAboveQuota && enforcementMode === 'hard';
  const isSoftCapOverage = isAtOrAboveQuota && enforcementMode === 'soft';

  return {
    canDispatch: !isHardCapBlocked && !isExpired,
    isHardCapBlocked,
    isSoftCapOverage,
    isExpired,
    overageFee: isSoftCapOverage ? overageRate : 0
  };
}

export function formatDefiniteDateTime(val: any, fallback = 'טרם התחבר'): string {
  if (!val) return fallback;
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (isNaN(d.getTime())) return fallback;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function checkQuotaThresholdAlerts(
  dispatchedCount: number,
  annualQuota: number,
  alertsSent: { '80_percent'?: string; '100_percent'?: string } = {}
): { shouldAlert80: boolean; shouldAlert100: boolean } {
  if (annualQuota <= 0) return { shouldAlert80: false, shouldAlert100: false };
  const ratio = dispatchedCount / annualQuota;
  return {
    shouldAlert80: ratio >= 0.8 && !alertsSent['80_percent'],
    shouldAlert100: ratio >= 1.0 && !alertsSent['100_percent']
  };
}

export function evaluateLicenseExpiryMilestone(
  expiresAtIso: string,
  now: Date = new Date(),
  existingAlerts: Record<string, string> = {}
): 'expiry_30d' | 'expiry_7d' | 'expiry_0d' | null {
  const expiresAt = new Date(expiresAtIso);
  if (isNaN(expiresAt.getTime())) return null;

  const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 30 && diffDays > 7 && !existingAlerts['expiry_30d']) {
    return 'expiry_30d';
  }
  if (diffDays <= 7 && diffDays > 0 && !existingAlerts['expiry_7d']) {
    return 'expiry_7d';
  }
  if (diffDays <= 0 && !existingAlerts['expiry_0d']) {
    return 'expiry_0d';
  }
  return null;
}

export function calculateLicenseRenewalUpdate(params: {
  renewalMode: 'midterm' | 'restart';
  existingExpiresAt?: string;
  currentDispatchedCount?: number;
  now?: Date;
}): {
  licenseExpiresAt: string;
  resetUsage: boolean;
  expectedDispatchedCount: number;
} {
  const now = params.now || new Date();
  const currentDispatched = Number(params.currentDispatchedCount ?? 0);
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (params.renewalMode === 'restart') {
    return {
      licenseExpiresAt: oneYearFromNow,
      resetUsage: true,
      expectedDispatchedCount: 0
    };
  }

  // Midterm upgrade: preserve existing expiration date and current usage
  const existingDateStr = params.existingExpiresAt
    ? new Date(params.existingExpiresAt).toISOString().split('T')[0]
    : oneYearFromNow;

  return {
    licenseExpiresAt: existingDateStr,
    resetUsage: false,
    expectedDispatchedCount: currentDispatched
  };
}

describe('RFQ Licensing & Quota Engine Tests', () => {
  it('correctly maps all 5 PRD tiers and overage rates', () => {
    expect(RFQ_TIER_PRESETS.starter).toEqual({ annualQuota: 5, overageRate: 49.0 });
    expect(RFQ_TIER_PRESETS.basic).toEqual({ annualQuota: 10, overageRate: 45.0 });
    expect(RFQ_TIER_PRESETS.standard).toEqual({ annualQuota: 15, overageRate: 40.0 });
    expect(RFQ_TIER_PRESETS.growth).toEqual({ annualQuota: 25, overageRate: 36.0 });
    expect(RFQ_TIER_PRESETS.enterprise).toEqual({ annualQuota: 50, overageRate: 35.0 });
  });

  describe('Eligibility & Hard/Soft Cap Enforcement', () => {
    it('allows dispatch when under annual quota', () => {
      const res = evaluateRfqDispatchEligibility({
        status: 'active',
        tier: 'standard',
        annualQuota: 12,
        currentAnnualUsage: { dispatchedCount: 5 },
        enforcementMode: 'hard'
      });

      expect(res.canDispatch).toBe(true);
      expect(res.isHardCapBlocked).toBe(false);
      expect(res.isSoftCapOverage).toBe(false);
      expect(res.overageFee).toBe(0);
    });

    it('blocks dispatch when at 100% quota under Hard Cap policy', () => {
      const res = evaluateRfqDispatchEligibility({
        status: 'active',
        tier: 'standard',
        annualQuota: 12,
        currentAnnualUsage: { dispatchedCount: 12 },
        enforcementMode: 'hard'
      });

      expect(res.canDispatch).toBe(false);
      expect(res.isHardCapBlocked).toBe(true);
      expect(res.isSoftCapOverage).toBe(false);
    });

    it('allows dispatch when at or above 100% quota under Soft Cap policy with overage fee', () => {
      const res = evaluateRfqDispatchEligibility({
        status: 'active',
        tier: 'growth',
        annualQuota: 25,
        overageRate: 39.0,
        currentAnnualUsage: { dispatchedCount: 25 },
        enforcementMode: 'soft'
      });

      expect(res.canDispatch).toBe(true);
      expect(res.isHardCapBlocked).toBe(false);
      expect(res.isSoftCapOverage).toBe(true);
      expect(res.overageFee).toBe(39.0);
    });

    it('blocks dispatch when license has expired even if quota remains', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = evaluateRfqDispatchEligibility({
        status: 'active',
        tier: 'standard',
        annualQuota: 12,
        currentAnnualUsage: { dispatchedCount: 2 },
        licenseExpiresAt: yesterday,
        enforcementMode: 'hard'
      });

      expect(res.canDispatch).toBe(false);
      expect(res.isExpired).toBe(true);
    });

    it('blocks dispatch when customer is disabled or tier/status missing', () => {
      const resDisabled = evaluateRfqDispatchEligibility({
        status: 'disabled',
        tier: 'disabled'
      });
      expect(resDisabled.canDispatch).toBe(false);

      const resMissingTier = evaluateRfqDispatchEligibility({
        status: undefined,
        tier: undefined
      });
      expect(resMissingTier.canDispatch).toBe(false);
    });
  });

  describe('Multi-Admin Quota Alerts (80% and 100%)', () => {
    it('triggers 80% alert when reaching 80% for the first time', () => {
      // 10 out of 12 = 83.3%
      const res = checkQuotaThresholdAlerts(10, 12, {});
      expect(res.shouldAlert80).toBe(true);
      expect(res.shouldAlert100).toBe(false);
    });

    it('does NOT re-trigger 80% alert if already sent in this cycle', () => {
      const res = checkQuotaThresholdAlerts(11, 12, { '80_percent': '2026-09-01T10:00:00Z' });
      expect(res.shouldAlert80).toBe(false);
      expect(res.shouldAlert100).toBe(false);
    });

    it('triggers 100% alert when reaching 12 out of 12', () => {
      const res = checkQuotaThresholdAlerts(12, 12, { '80_percent': '2026-09-01T10:00:00Z' });
      expect(res.shouldAlert80).toBe(false);
      expect(res.shouldAlert100).toBe(true);
    });
  });

  describe('Definite Date Formatting (Senior QA Requirement)', () => {
    it('formats ISO timestamps to exact DD/MM/YYYY HH:mm without relative wording', () => {
      const sample = new Date(2026, 9, 2, 14, 30); // 02/10/2026 14:30
      const formatted = formatDefiniteDateTime(sample);
      expect(formatted).toBe('02/10/2026 14:30');
      expect(formatted).not.toContain('ago');
      expect(formatted).not.toContain('לפני');
    });

    it('returns exact fallback when null or undefined', () => {
      expect(formatDefiniteDateTime(null)).toBe('טרם התחבר');
      expect(formatDefiniteDateTime(undefined)).toBe('טרם התחבר');
    });
  });

  describe('Annual License Expiration Milestones (30d, 7d, 0d)', () => {
    const baseNow = new Date('2026-10-02T12:00:00Z');

    it('identifies 30-day milestone when expiration is between 8 and 30 days away', () => {
      const expiresAt = new Date('2026-10-22T12:00:00Z').toISOString(); // 20 days
      const milestone = evaluateLicenseExpiryMilestone(expiresAt, baseNow, {});
      expect(milestone).toBe('expiry_30d');
    });

    it('does not re-trigger 30-day milestone if already recorded', () => {
      const expiresAt = new Date('2026-10-22T12:00:00Z').toISOString();
      const milestone = evaluateLicenseExpiryMilestone(expiresAt, baseNow, { expiry_30d: '2026-10-01T06:00:00Z' });
      expect(milestone).toBeNull();
    });

    it('identifies 7-day milestone when expiration is between 1 and 7 days away', () => {
      const expiresAt = new Date('2026-10-06T12:00:00Z').toISOString(); // 4 days
      const milestone = evaluateLicenseExpiryMilestone(expiresAt, baseNow, { expiry_30d: '2026-09-15T06:00:00Z' });
      expect(milestone).toBe('expiry_7d');
    });

    it('identifies 0-day milestone on expiration day or when expired', () => {
      const expiresAt = new Date('2026-10-02T05:00:00Z').toISOString(); // same day / past
      const milestone = evaluateLicenseExpiryMilestone(expiresAt, baseNow, { expiry_30d: '...', expiry_7d: '...' });
      expect(milestone).toBe('expiry_0d');
    });

    it('returns null if all alerts were already dispatched', () => {
      const expiresAt = new Date('2026-10-01T00:00:00Z').toISOString();
      const milestone = evaluateLicenseExpiryMilestone(expiresAt, baseNow, {
        expiry_30d: '...',
        expiry_7d: '...',
        expiry_0d: '2026-10-01T06:00:00Z'
      });
      expect(milestone).toBeNull();
    });
  });

  describe('License Renewal & Midterm Upgrade Modes (Option 1 vs Option 2)', () => {
    const fixedNow = new Date('2026-10-06T12:00:00Z');
    const existingExpiry = '2026-12-31T23:59:59.000Z';

    it('Option 1 (Midterm Upgrade): preserves countdown and maintains existing usage', () => {
      const result = calculateLicenseRenewalUpdate({
        renewalMode: 'midterm',
        existingExpiresAt: existingExpiry,
        currentDispatchedCount: 12,
        now: fixedNow
      });

      expect(result.resetUsage).toBe(false);
      expect(result.expectedDispatchedCount).toBe(12);
      expect(result.licenseExpiresAt).toBe('2026-12-31');
    });

    it('Option 2 (Full 1-Year Renewal): resets countdown to 365 days from now and resets usage to 0', () => {
      const result = calculateLicenseRenewalUpdate({
        renewalMode: 'restart',
        existingExpiresAt: existingExpiry,
        currentDispatchedCount: 12,
        now: fixedNow
      });

      expect(result.resetUsage).toBe(true);
      expect(result.expectedDispatchedCount).toBe(0);
      expect(result.licenseExpiresAt).toBe('2027-10-06');
    });
  });
});

