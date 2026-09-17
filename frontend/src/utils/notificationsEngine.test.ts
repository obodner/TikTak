import { describe, it, expect, beforeEach } from 'vitest';
import { 
  generateNotifications, 
  getDismissedMap, 
  setDismissed, 
  setAllDismissed 
} from './notificationsEngine';

describe('notificationsEngine', () => {
  const tenantId = 'test-building';

  beforeEach(() => {
    localStorage.clear();
  });

  it('generates urgent notifications for High urgency tickets', () => {
    const tickets = [
      {
        id: 't1',
        ticketNumber: 101,
        urgency: 'High',
        status: 'open',
        summary: 'Elevator trapped on 4th floor',
        createdAt: new Date().toISOString()
      },
      {
        id: 't2',
        ticketNumber: 102,
        urgency: 'Low',
        status: 'open',
        summary: 'Bulb replaced',
        adminComments: [{ text: 'done' }],
        createdAt: new Date().toISOString()
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, {});
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('urgent_t1');
    expect(notifications[0].type).toBe('urgent');
    expect(notifications[0].severity).toBe('critical');
    expect(notifications[0].isRead).toBe(false);
  });

  it('generates critical SLA breach notification for stale-9 tickets', () => {
    const tickets = [
      {
        id: 't3',
        ticketNumber: 103,
        urgency: 'Low',
        slaStatus: 'stale-9',
        status: 'in-progress',
        summary: 'Stagnant garden repair',
        createdAt: new Date().toISOString()
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, {});
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('sla_stale_9_t3');
    expect(notifications[0].severity).toBe('critical');
  });

  it('generates warning SLA breach notification for stale-5 tickets', () => {
    const tickets = [
      {
        id: 't4',
        ticketNumber: 104,
        urgency: 'Low',
        slaStatus: 'stale-5',
        status: 'in-progress',
        summary: 'Stagnant gate check',
        createdAt: new Date().toISOString()
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, {});
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe('sla_stale_5_t4');
    expect(notifications[0].severity).toBe('warning');
  });

  it('ignores closed, resolved, and dismissed tickets', () => {
    const tickets = [
      {
        id: 't5',
        urgency: 'High',
        slaStatus: 'stale-9',
        status: 'resolved',
        summary: 'Fixed issue'
      },
      {
        id: 't6',
        urgency: 'High',
        status: 'closed',
        summary: 'Closed issue'
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, {});
    expect(notifications).toHaveLength(0);
  });

  it('correctly tracks and updates dismissed state', () => {
    let map = getDismissedMap(tenantId);
    expect(map).toEqual({});

    map = setDismissed(tenantId, 'urgent_t1', true);
    expect(map['urgent_t1']).toBe(true);

    const tickets = [
      {
        id: 't1',
        ticketNumber: 101,
        urgency: 'High',
        status: 'open',
        summary: 'Elevator problem'
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, map);
    expect(notifications[0].isRead).toBe(true);

    // Un-dismiss
    map = setDismissed(tenantId, 'urgent_t1', false);
    expect(map['urgent_t1']).toBeUndefined();

    const notificationsAfterUndismiss = generateNotifications(tickets, tenantId, map);
    expect(notificationsAfterUndismiss[0].isRead).toBe(false);
  });

  it('setAllDismissed marks all provided IDs as read', () => {
    const ids = ['urgent_t1', 'sla_stale_5_t2'];
    const map = setAllDismissed(tenantId, ids);
    expect(map['urgent_t1']).toBe(true);
    expect(map['sla_stale_5_t2']).toBe(true);
  });

  it('generates vendor_stalled notification when forward is older than 48 hours', () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const tickets = [
      {
        id: 'v1',
        ticketNumber: 201,
        status: 'in-progress',
        vendorForwardCount: 1,
        lastVendorForwardAt: threeDaysAgo,
        summary: 'Intercom repair waiting for vendor'
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, {});
    const stalled = notifications.find(n => n.type === 'vendor_stalled');
    expect(stalled).toBeDefined();
    expect(stalled?.id).toBe('vendor_stalled_v1');
    expect(stalled?.severity).toBe('warning');
  });

  it('generates duplicate_spike notification when 2+ tickets share the same location in 48h', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const tickets = [
      {
        id: 'd1',
        ticketNumber: 301,
        status: 'open',
        location: 'מעלית 1',
        createdAt: oneHourAgo,
        summary: 'Door stuck'
      },
      {
        id: 'd2',
        ticketNumber: 302,
        status: 'open',
        location: 'מעלית 1',
        createdAt: oneHourAgo,
        summary: 'Buttons not lighting'
      }
    ];

    const notifications = generateNotifications(tickets, tenantId, {});
    const spike = notifications.find(n => n.type === 'duplicate_spike');
    expect(spike).toBeDefined();
    expect(spike?.severity).toBe('warning');
    expect(spike?.location).toBe('מעלית 1');
  });

  it('generates quota warnings at 80% and quota alerts at 100%', () => {
    const tenantConfig80 = {
      subscription: {
        monthlyQuota: 10,
        rolloverTickets: 0,
        currentCycleTicketCount: 8,
        cycleEndDate: '2026-09-30T00:00:00Z',
        status: 'active'
      }
    };

    const notifs80 = generateNotifications([], tenantId, {}, false, tenantConfig80);
    const quota80 = notifs80.find(n => n.type === 'quota_warning');
    expect(quota80).toBeDefined();
    expect(quota80?.severity).toBe('warning');

    const tenantConfig100 = {
      subscription: {
        monthlyQuota: 10,
        rolloverTickets: 0,
        currentCycleTicketCount: 10,
        cycleEndDate: '2026-09-30T00:00:00Z',
        status: 'active'
      }
    };

    const notifs100 = generateNotifications([], tenantId, {}, false, tenantConfig100);
    const quota100 = notifs100.find(n => n.type === 'quota_alert');
    expect(quota100).toBeDefined();
    expect(quota100?.severity).toBe('critical');
  });
});

