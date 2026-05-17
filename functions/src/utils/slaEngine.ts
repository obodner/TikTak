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
