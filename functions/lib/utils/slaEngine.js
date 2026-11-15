"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateWorkingDays = calculateWorkingDays;
exports.getSlaStatus = getSlaStatus;
exports.diffMinutes = diffMinutes;
exports.emptyPhaseTimer = emptyPhaseTimer;
exports.createInitialPhaseMetrics = createInitialPhaseMetrics;
exports.pausePhaseTimer = pausePhaseTimer;
exports.resumePhaseTimer = resumePhaseTimer;
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
function diffMinutes(startIso, endIso) {
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs)
        return 0;
    return Math.round((endMs - startMs) / (1000 * 60));
}
function emptyPhaseTimer() {
    return {
        startedAt: null,
        endedAt: null,
        currentStartedAt: null,
        accumulatedMinutes: 0
    };
}
function createInitialPhaseMetrics(createdAtIso) {
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
function pausePhaseTimer(timer, nowIso, markEnded = true) {
    const base = timer
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
function resumePhaseTimer(timer, nowIso) {
    const base = timer
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
//# sourceMappingURL=slaEngine.js.map