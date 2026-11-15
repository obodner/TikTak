/**
 * Calculates the number of working days between two dates, 
 * respecting the tenant's work week and a list of holidays.
 * 
 * @param start ISO string or Date
 * @param end ISO string or Date
 * @param workingDays Array of numbers (0-6) representing working days (e.g., [0,1,2,3,4] for Sun-Thu)
 * @param holidays Array of ISO date strings (YYYY-MM-DD) representing holidays
 * @returns number of working days
 */
export function calculateWorkingDays(
  start: string | Date,
  end: string | Date,
  workingDays: number[],
  holidays: string[]
): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  // Set both to midnight for pure day comparison
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

export interface PhaseTimer {
  startedAt: string | null;
  endedAt: string | null;
  currentStartedAt: string | null;
  accumulatedMinutes: number;
}

export interface SimplePhaseRecord {
  startedAt: string | null;
  endedAt: string | null;
  minutes: number | null;
}

export interface TicketPhaseMetrics {
  p1: PhaseTimer; // New (open) -> In-Progress
  p2: PhaseTimer; // In-Progress -> Sent to Vendor
  p3: SimplePhaseRecord; // Sent to Vendor -> Vendor Ack
  p4: SimplePhaseRecord; // Vendor Ack -> Vendor Complete
  p5: PhaseTimer; // Vendor Complete -> Ticket Closed
}

/**
 * Computes elapsed non-negative minutes between two ISO timestamps.
 */
export function diffMinutes(startIso: string, endIso: string): number {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / (1000 * 60));
}

export function emptyPhaseTimer(): PhaseTimer {
  return {
    startedAt: null,
    endedAt: null,
    currentStartedAt: null,
    accumulatedMinutes: 0
  };
}

export function createInitialPhaseMetrics(createdAtIso: string): TicketPhaseMetrics {
  return {
    p1: {
      startedAt: createdAtIso,
      endedAt: null,
      currentStartedAt: createdAtIso,
      accumulatedMinutes: 0
    },
    p2: emptyPhaseTimer(),
    p3: { startedAt: null, endedAt: null, minutes: null },
    p4: { startedAt: null, endedAt: null, minutes: null },
    p5: emptyPhaseTimer()
  };
}

export function pausePhaseTimer(timer: PhaseTimer | undefined, nowIso: string, markEnded = true): PhaseTimer {
  const base: PhaseTimer = timer
    ? { ...timer }
    : emptyPhaseTimer();

  if (base.currentStartedAt) {
    base.accumulatedMinutes = (base.accumulatedMinutes || 0) + diffMinutes(base.currentStartedAt, nowIso);
    base.currentStartedAt = null;
  }
  if (markEnded) {
    base.endedAt = nowIso;
  }
  return base;
}

export function resumePhaseTimer(timer: PhaseTimer | undefined, nowIso: string): PhaseTimer {
  const base: PhaseTimer = timer
    ? { ...timer }
    : emptyPhaseTimer();

  if (!base.startedAt) {
    base.startedAt = nowIso;
  }
  if (!base.currentStartedAt) {
    base.currentStartedAt = nowIso;
  }
  base.endedAt = null;
  return base;
}
