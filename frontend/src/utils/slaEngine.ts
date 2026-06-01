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
