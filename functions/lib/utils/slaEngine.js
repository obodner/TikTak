"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateWorkingDays = calculateWorkingDays;
exports.getSlaStatus = getSlaStatus;
function calculateWorkingDays(start, end, workingDays, holidays) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (startDate > endDate)
        return 0;
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
function getSlaStatus(days) {
    if (days >= 9)
        return 'stale-9';
    if (days >= 5)
        return 'stale-5';
    if (days >= 2)
        return 'stale-2';
    return 'none';
}
//# sourceMappingURL=slaEngine.js.map