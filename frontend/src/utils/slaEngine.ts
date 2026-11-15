/**
 * Calculates the number of working days between two dates, 
 * respecting the tenant's work week and a list of holidays.
 */
export function calculateWorkingDays(
  start: string | Date,
  end: string | Date,
  workingDays: number[],
  holidays: string[]
): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (startDate > endDate) return 0;

  let count = 0;
  const current = new Date(startDate);
  current.setDate(current.getDate() + 1);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const isWorkDay = workingDays.includes(dayOfWeek);
    const isHoliday = holidays.includes(dateStr);

    if (isWorkDay && !isHoliday) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Determines the SLA status based on stagnation days.
 */
export function getSlaStatus(days: number): 'none' | 'stale-2' | 'stale-5' | 'stale-9' {
  if (days >= 9) return 'stale-9';
  if (days >= 5) return 'stale-5';
  if (days >= 2) return 'stale-2';
  return 'none';
}

/**
 * Returns the CSS classes for a given SLA status.
 */
export function getSlaColorClasses(status: string): string {
  switch (status) {
    case 'stale-9': return 'bg-red-200 border-red-600 border-2 shadow-red-100 shadow-lg';
    case 'stale-5': return 'bg-orange-100 border-orange-500 border-2';
    case 'stale-2': return 'bg-yellow-100 border-yellow-500 border-2';
    default: return 'bg-white border-slate-200';
  }
}

export type PhaseKey = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

export interface ComputedPhaseDuration {
  minutes: number | null;
  startedAt: string | null;
  endedAt: string | null;
  isActive: boolean;
  isNa: boolean;
  vendorName?: string;
}

function safeDiffMinutes(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / (1000 * 60));
}

/**
 * Formats a duration in minutes into exact human-readable units (e.g., 103 -> 1h 43m).
 */
export function formatDurationMinutes(totalMinutes: number | null | undefined, isEn = false): string {
  if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) {
    return 'N/A';
  }
  const rounded = Math.max(0, Math.round(totalMinutes));
  if (rounded < 60) {
    return isEn ? `${rounded}m` : `${rounded} דק'`;
  }
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  const mins = rounded % 60;

  if (days === 0) {
    if (isEn) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    const hLabel = hours === 1 ? 'שעה' : `${hours} שעות`;
    const hText = hours === 1 ? '1 שעה' : hLabel;
    return mins > 0 ? `${hText} ו-${mins} דק'` : hText;
  }

  if (isEn) {
    const parts = [`${days}d`];
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    return parts.join(' ');
  }

  const dText = days === 1 ? 'יום 1' : `${days} ימים`;
  const parts = [dText];
  if (hours > 0) parts.push(hours === 1 ? 'שעה' : `${hours} שעות`);
  if (mins > 0) parts.push(`${mins} דק'`);
  return parts.join(', ');
}

function resolveTimer(timer: any, nowIso: string): ComputedPhaseDuration {
  if (!timer || (!timer.startedAt && !timer.currentStartedAt && !timer.accumulatedMinutes)) {
    return { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  }
  const isActive = Boolean(timer.currentStartedAt);
  const liveExtra = isActive ? safeDiffMinutes(timer.currentStartedAt, nowIso) : 0;
  const minutes = (timer.accumulatedMinutes || 0) + liveExtra;
  return {
    minutes,
    startedAt: timer.startedAt || timer.currentStartedAt || null,
    endedAt: isActive ? null : (timer.endedAt || null),
    isActive,
    isNa: false
  };
}

/**
 * Computes all 5 lifecycle phase durations for a ticket (including in-flight tickets and historical fallback).
 */
export function computeTicketPhaseDurations(
  ticket: any,
  now: Date = new Date()
): Record<PhaseKey, ComputedPhaseDuration> {
  const nowIso = now.toISOString();
  const status = String(ticket?.status || '').toLowerCase();
  const isClosed = status === 'resolved' || status === 'dismissed';
  const vendors: any[] = Array.isArray(ticket?.vendors) ? ticket.vendors : [];
  const hasVendor = vendors.length > 0;
  const pm = ticket?.phaseMetrics;

  // Phase 1: New (open) -> In-Progress
  let p1: ComputedPhaseDuration;
  if (pm?.p1) {
    p1 = resolveTimer(pm.p1, nowIso);
  } else if (ticket?.createdAt) {
    if (status === 'open') {
      p1 = {
        minutes: safeDiffMinutes(ticket.createdAt, nowIso),
        startedAt: ticket.createdAt,
        endedAt: null,
        isActive: true,
        isNa: false
      };
    } else {
      const endFallback = ticket.lastStatusChangeAt || ticket.resolvedAt || ticket.updatedAt || ticket.createdAt;
      p1 = {
        minutes: safeDiffMinutes(ticket.createdAt, endFallback),
        startedAt: ticket.createdAt,
        endedAt: endFallback,
        isActive: false,
        isNa: false
      };
    }
  } else {
    p1 = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  }

  // Phase 2: In-Progress -> Sent to Vendor (or Closed if no vendor)
  let p2: ComputedPhaseDuration;
  if (pm?.p2 && (pm.p2.startedAt || pm.p2.currentStartedAt || pm.p2.accumulatedMinutes > 0)) {
    p2 = resolveTimer(pm.p2, nowIso);
  } else if (status === 'open') {
    p2 = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  } else if (hasVendor && vendors[0]?.sentAt) {
    const startFallback = ticket.lastStatusChangeAt && ticket.lastStatusChangeAt <= vendors[0].sentAt
      ? ticket.lastStatusChangeAt
      : ticket.createdAt;
    p2 = startFallback
      ? {
          minutes: safeDiffMinutes(startFallback, vendors[0].sentAt),
          startedAt: startFallback,
          endedAt: vendors[0].sentAt,
          isActive: false,
          isNa: false
        }
      : { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  } else if (status === 'in-progress') {
    const startFallback = ticket.lastStatusChangeAt || ticket.createdAt;
    p2 = startFallback
      ? {
          minutes: safeDiffMinutes(startFallback, nowIso),
          startedAt: startFallback,
          endedAt: null,
          isActive: true,
          isNa: false
        }
      : { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  } else if (isClosed && !hasVendor) {
    const closeTime = ticket.resolvedAt || ticket.closedAt || ticket.lastStatusChangeAt || ticket.updatedAt;
    const startFallback = ticket.lastStatusChangeAt && ticket.lastStatusChangeAt < closeTime
      ? ticket.lastStatusChangeAt
      : ticket.createdAt;
    p2 = startFallback && closeTime
      ? {
          minutes: safeDiffMinutes(startFallback, closeTime),
          startedAt: startFallback,
          endedAt: closeTime,
          isActive: false,
          isNa: false
        }
      : { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  } else {
    p2 = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  }

  // Phases 3, 4, 5: Vendor & Post-Vendor phases (N/A if no vendor dispatched)
  if (!hasVendor) {
    const na: ComputedPhaseDuration = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
    return { p1, p2, p3: na, p4: { ...na }, p5: { ...na } };
  }

  // Pick the most relevant vendor dispatch (completed > acknowledged > latest sent)
  const completedVendor = [...vendors].reverse().find(v => v.completedAt);
  const ackedVendor = [...vendors].reverse().find(v => v.acknowledgedAt);
  const latestVendor = vendors[vendors.length - 1];
  const activeVendor = completedVendor || ackedVendor || latestVendor;
  const vendorName = activeVendor?.name || activeVendor?.phone;

  // Phase 3: Sent to Vendor -> Vendor Ack
  let p3: ComputedPhaseDuration;
  if (activeVendor?.completedAt && !activeVendor?.acknowledgedAt) {
    // Skipped "קיבלתי את ההודעה": Phase 3 = 0
    p3 = {
      minutes: 0,
      startedAt: activeVendor.sentAt || null,
      endedAt: activeVendor.sentAt || null,
      isActive: false,
      isNa: false,
      vendorName
    };
  } else if (activeVendor?.acknowledgedAt) {
    const mins = typeof activeVendor.responseTimeMinutes === 'number'
      ? activeVendor.responseTimeMinutes
      : safeDiffMinutes(activeVendor.sentAt, activeVendor.acknowledgedAt);
    p3 = {
      minutes: mins,
      startedAt: activeVendor.sentAt || null,
      endedAt: activeVendor.acknowledgedAt,
      isActive: false,
      isNa: false,
      vendorName
    };
  } else if (activeVendor?.sentAt && !isClosed) {
    p3 = {
      minutes: safeDiffMinutes(activeVendor.sentAt, nowIso),
      startedAt: activeVendor.sentAt,
      endedAt: null,
      isActive: true,
      isNa: false,
      vendorName
    };
  } else if (pm?.p3?.minutes !== null && pm?.p3?.minutes !== undefined) {
    p3 = {
      minutes: pm.p3.minutes,
      startedAt: pm.p3.startedAt || null,
      endedAt: pm.p3.endedAt || null,
      isActive: false,
      isNa: false,
      vendorName
    };
  } else {
    p3 = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true, vendorName };
  }

  // Phase 4: Vendor Ack -> Vendor Complete (or sentAt -> completedAt if Ack skipped)
  let p4: ComputedPhaseDuration;
  if (activeVendor?.completedAt) {
    const startIso = activeVendor.acknowledgedAt || activeVendor.sentAt || null;
    const mins = typeof activeVendor.executionTimeMinutes === 'number'
      ? activeVendor.executionTimeMinutes
      : safeDiffMinutes(startIso, activeVendor.completedAt);
    p4 = {
      minutes: mins,
      startedAt: startIso,
      endedAt: activeVendor.completedAt,
      isActive: false,
      isNa: false,
      vendorName
    };
  } else if (activeVendor?.acknowledgedAt && !isClosed) {
    p4 = {
      minutes: safeDiffMinutes(activeVendor.acknowledgedAt, nowIso),
      startedAt: activeVendor.acknowledgedAt,
      endedAt: null,
      isActive: true,
      isNa: false,
      vendorName
    };
  } else if (pm?.p4?.minutes !== null && pm?.p4?.minutes !== undefined) {
    p4 = {
      minutes: pm.p4.minutes,
      startedAt: pm.p4.startedAt || null,
      endedAt: pm.p4.endedAt || null,
      isActive: false,
      isNa: false,
      vendorName
    };
  } else {
    p4 = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true, vendorName };
  }

  // Phase 5: Vendor Complete -> Ticket Closed
  let p5: ComputedPhaseDuration;
  const vendorDoneAt = ticket.vendorCompletedAt || completedVendor?.completedAt || null;
  if (pm?.p5 && (pm.p5.startedAt || pm.p5.currentStartedAt || pm.p5.accumulatedMinutes > 0)) {
    p5 = resolveTimer(pm.p5, nowIso);
  } else if (vendorDoneAt) {
    if (isClosed) {
      const closeTime = ticket.resolvedAt || ticket.closedAt || ticket.lastStatusChangeAt || ticket.updatedAt;
      p5 = {
        minutes: safeDiffMinutes(vendorDoneAt, closeTime),
        startedAt: vendorDoneAt,
        endedAt: closeTime || null,
        isActive: false,
        isNa: false
      };
    } else {
      p5 = {
        minutes: safeDiffMinutes(vendorDoneAt, nowIso),
        startedAt: vendorDoneAt,
        endedAt: null,
        isActive: true,
        isNa: false
      };
    }
  } else {
    p5 = { minutes: null, startedAt: null, endedAt: null, isActive: false, isNa: true };
  }

  return { p1, p2, p3, p4, p5 };
}
