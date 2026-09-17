export type NotificationType = 
  | 'urgent' 
  | 'sla_stale_9' 
  | 'sla_stale_5' 
  | 'new_ticket'
  | 'vendor_stalled'
  | 'duplicate_spike'
  | 'quota_warning'
  | 'quota_alert';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface NotificationItem {
  id: string; // Deterministic milestone ID (e.g. "urgent_tk123", "sla_stale_9_tk123", "quota_alert_...")
  ticketId?: string;
  ticketNumber?: number;
  type: NotificationType;
  title: string;
  description: string;
  severity: NotificationSeverity;
  createdAt: string;
  isRead: boolean;
  location?: string;
  subLocation?: string;
  category?: string;
  actionUrl?: string;
  actionLabel?: string;
}

const STORAGE_PREFIX = 'tiktak_dismissed_notifications_';

/**
 * Get map of dismissed notification milestone IDs from localStorage
 */
export function getDismissedMap(tenantId: string): Record<string, boolean> {
  if (typeof window === 'undefined' || !tenantId) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tenantId}`);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Error loading dismissed notifications:', err);
    return {};
  }
}

/**
 * Persist dismissal state for a specific notification ID
 */
export function setDismissed(tenantId: string, notificationId: string, isDismissed: boolean): Record<string, boolean> {
  if (typeof window === 'undefined' || !tenantId) return {};
  try {
    const current = getDismissedMap(tenantId);
    if (isDismissed) {
      current[notificationId] = true;
    } else {
      delete current[notificationId];
    }
    localStorage.setItem(`${STORAGE_PREFIX}${tenantId}`, JSON.stringify(current));
    return { ...current };
  } catch (err) {
    console.error('Error saving dismissed notification:', err);
    return {};
  }
}

/**
 * Mark all current notification IDs as dismissed (read)
 */
export function setAllDismissed(tenantId: string, notificationIds: string[]): Record<string, boolean> {
  if (typeof window === 'undefined' || !tenantId) return {};
  try {
    const current = getDismissedMap(tenantId);
    notificationIds.forEach(id => {
      current[id] = true;
    });
    localStorage.setItem(`${STORAGE_PREFIX}${tenantId}`, JSON.stringify(current));
    return { ...current };
  } catch (err) {
    console.error('Error saving all dismissed notifications:', err);
    return {};
  }
}

/**
 * Evaluates active tickets and building config to generate deterministic notification items
 */
export function generateNotifications(
  tickets: any[],
  tenantId: string,
  dismissedMap: Record<string, boolean>,
  isEn: boolean = false,
  tenantConfig?: any
): NotificationItem[] {
  if (!tickets || !Array.isArray(tickets)) return [];

  const items: NotificationItem[] = [];
  const nowMs = Date.now();
  const locationGroups: Record<string, any[]> = {};

  for (const ticket of tickets) {
    // Resolved and dismissed tickets auto-clear notifications
    if (ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'dismissed') {
      continue;
    }

    const ticketNumberDisplay = ticket.ticketNumber ? `#${ticket.ticketNumber}` : '';

    // 1. High Urgency / Safety Hazard
    if (ticket.urgency === 'High') {
      const id = `urgent_${ticket.id}`;
      items.push({
        id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: 'urgent',
        title: isEn ? `Urgent Issue ${ticketNumberDisplay}` : `קריאה דחופה ${ticketNumberDisplay}`,
        description: ticket.summary || (isEn ? 'High urgency hazard reported' : 'דווח מפגע ברמת דחיפות גבוהה'),
        severity: 'critical',
        createdAt: ticket.createdAt || new Date().toISOString(),
        isRead: Boolean(dismissedMap[id]),
        location: ticket.location,
        subLocation: ticket.subLocation,
        category: ticket.category
      });
    }

    // 2. SLA Stale-9 (Severe Escalation - 9+ working days)
    if (ticket.slaStatus === 'stale-9' && ticket.status !== 'backlog') {
      const id = `sla_stale_9_${ticket.id}`;
      items.push({
        id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: 'sla_stale_9',
        title: isEn ? `Critical SLA Breach (9+ Days) ${ticketNumberDisplay}` : `חריגת SLA חמורה (9+ ימים) ${ticketNumberDisplay}`,
        description: ticket.summary || (isEn ? 'Ticket inactive for over 9 business days' : 'הפנייה ללא עדכון מעל 9 ימי עבודה'),
        severity: 'critical',
        createdAt: ticket.lastStatusChangeAt || ticket.createdAt || new Date().toISOString(),
        isRead: Boolean(dismissedMap[id]),
        location: ticket.location,
        subLocation: ticket.subLocation,
        category: ticket.category
      });
    }
    // 3. SLA Stale-5 (Warning - 5+ working days)
    else if (ticket.slaStatus === 'stale-5' && ticket.status !== 'backlog') {
      const id = `sla_stale_5_${ticket.id}`;
      items.push({
        id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: 'sla_stale_5',
        title: isEn ? `SLA Breach (5+ Days) ${ticketNumberDisplay}` : `חריגת SLA (5+ ימים) ${ticketNumberDisplay}`,
        description: ticket.summary || (isEn ? 'Ticket inactive for over 5 business days' : 'הפנייה ללא עדכון מעל 5 ימי עבודה'),
        severity: 'warning',
        createdAt: ticket.lastStatusChangeAt || ticket.createdAt || new Date().toISOString(),
        isRead: Boolean(dismissedMap[id]),
        location: ticket.location,
        subLocation: ticket.subLocation,
        category: ticket.category
      });
    }

    // 4. New Unhandled Ticket (in status 'open' with no comments yet, created within recent days)
    if (ticket.status === 'open' && ticket.urgency !== 'High') {
      const id = `new_open_${ticket.id}`;
      const hasComments = Array.isArray(ticket.adminComments) && ticket.adminComments.length > 0;
      if (!hasComments) {
        items.push({
          id,
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          type: 'new_ticket',
          title: isEn ? `New Report ${ticketNumberDisplay}` : `פנייה חדשה ${ticketNumberDisplay}`,
          description: ticket.summary || (isEn ? 'New ticket awaiting triage' : 'קריאה חדשה הממתינה לבדיקה וסיווג'),
          severity: 'info',
          createdAt: ticket.createdAt || new Date().toISOString(),
          isRead: Boolean(dismissedMap[id]),
          location: ticket.location,
          subLocation: ticket.subLocation,
          category: ticket.category
        });
      }
    }

    // 5. Vendor Follow-up Stalled (Forwarded to vendor >48h ago without status change or closure)
    if (ticket.vendorForwardCount && ticket.vendorForwardCount > 0 && ticket.lastVendorForwardAt) {
      const forwardTime = new Date(ticket.lastVendorForwardAt).getTime();
      const hoursStalled = (nowMs - forwardTime) / (1000 * 60 * 60);
      if (hoursStalled >= 48) {
        const id = `vendor_stalled_${ticket.id}`;
        items.push({
          id,
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          type: 'vendor_stalled',
          title: isEn ? `Vendor Follow-up Stalled ${ticketNumberDisplay}` : `עיכוב בספק ${ticketNumberDisplay}`,
          description: isEn
            ? 'Ticket forwarded to vendor over 48 hours ago with no status update.'
            : 'הפנייה הועברה לספק לפני מעל 48 שעות ללא מענה או עדכון סטטוס.',
          severity: 'warning',
          createdAt: ticket.lastVendorForwardAt,
          isRead: Boolean(dismissedMap[id]),
          location: ticket.location,
          subLocation: ticket.subLocation,
          category: ticket.category
        });
      }
    }

    // Accumulate for Duplicate Reports Spike (only active tickets created in last 48h with a location)
    if (ticket.location && ticket.createdAt) {
      const createdTime = new Date(ticket.createdAt).getTime();
      const hoursSinceCreated = (nowMs - createdTime) / (1000 * 60 * 60);
      if (hoursSinceCreated <= 48) {
        const normLoc = ticket.location.trim().toLowerCase();
        if (!locationGroups[normLoc]) {
          locationGroups[normLoc] = [];
        }
        locationGroups[normLoc].push(ticket);
      }
    }
  }

  // 6. Duplicate Reports Spike Processing (2+ reports in same location in 48h)
  Object.entries(locationGroups).forEach(([normLoc, groupedTickets]) => {
    if (groupedTickets.length >= 2) {
      const id = `duplicate_spike_${normLoc}`;
      const displayLocation = groupedTickets[0].location || normLoc;
      const newestTicket = groupedTickets[groupedTickets.length - 1];

      items.push({
        id,
        ticketId: newestTicket.id,
        ticketNumber: newestTicket.ticketNumber,
        type: 'duplicate_spike',
        title: isEn 
          ? `Duplicate Reports Spike: ${displayLocation}` 
          : `ריבוי דיווחים במיקום: ${displayLocation}`,
        description: isEn
          ? `${groupedTickets.length} active reports logged for this location in the last 48 hours.`
          : `התקבלו ${groupedTickets.length} דיווחים פעילים באותו מיקום ב-48 השעות האחרונות.`,
        severity: 'warning',
        createdAt: newestTicket.createdAt || new Date().toISOString(),
        isRead: Boolean(dismissedMap[id]),
        location: displayLocation
      });
    }
  });

  // 7. Building Quota Capacity Warnings (80% and 100%)
  if (tenantConfig?.subscription) {
    const sub = tenantConfig.subscription;
    if (tenantConfig.isActive !== false && sub.status !== 'frozen' && sub.status !== 'cancelled') {
      const monthlyQuota = typeof sub.monthlyQuota === 'number' ? sub.monthlyQuota : 15;
      const rolloverTickets = Number(sub.rolloverTickets || 0);
      const effectiveQuota = monthlyQuota + rolloverTickets;
      const totalCreated = Number(sub.currentCycleTicketCount || 0);
      const exclusions = Number(sub.currentCycleExclusions || 0);
      const netUsed = Math.max(0, totalCreated - exclusions);
      const usagePercentage = effectiveQuota > 0
        ? Math.min(100, Math.round((netUsed / effectiveQuota) * 100))
        : 0;
      const cycleKey = sub.cycleEndDate ? sub.cycleEndDate.split('T')[0] : 'current';

      if (usagePercentage >= 100) {
        const id = `quota_alert_100_${cycleKey}`;
        items.push({
          id,
          type: 'quota_alert',
          title: isEn ? 'Quota Alert: 100% Capacity Reached' : 'חריגת מכסה: 100% ניצול',
          description: isEn
            ? `Monthly quota has reached 100% capacity (${netUsed}/${effectiveQuota} tickets used).`
            : `המכסה החודשית מוצתה במלואה (נוצלו ${netUsed} מתוך ${effectiveQuota} פניות).`,
          severity: 'critical',
          createdAt: new Date().toISOString(),
          isRead: Boolean(dismissedMap[id]),
          actionUrl: `/admin/${tenantId}/settings?tab=general`,
          actionLabel: isEn ? 'Subscription Settings' : 'הגדרות מנוי'
        });
      } else if (usagePercentage >= 80) {
        const id = `quota_warning_80_${cycleKey}`;
        items.push({
          id,
          type: 'quota_warning',
          title: isEn ? 'Quota Warning: 80% Capacity Reached' : 'התראת מכסה: 80% ניצול',
          description: isEn
            ? `Building has reached ${usagePercentage}% of its monthly quota (${netUsed}/${effectiveQuota} tickets used).`
            : `הבניין הגיע ל-${usagePercentage}% מניצול המכסה החודשית (נוצלו ${netUsed} מתוך ${effectiveQuota} פניות).`,
          severity: 'warning',
          createdAt: new Date().toISOString(),
          isRead: Boolean(dismissedMap[id]),
          actionUrl: `/admin/${tenantId}/settings?tab=general`,
          actionLabel: isEn ? 'Subscription Settings' : 'הגדרות מנוי'
        });
      }
    }
  }

  // Sort order:
  // 1. Unread first
  // 2. Severity: critical (0) -> warning (1) -> info (2)
  // 3. Newest createdAt first
  const severityRank: Record<NotificationSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2
  };

  return items.sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }
    const rankDiff = severityRank[a.severity] - severityRank[b.severity];
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
