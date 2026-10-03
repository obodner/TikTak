import { collection, addDoc, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// In-memory cache for admin user full names: `${tenantId}_${uid}` => `${firstName} ${lastName}`
const adminNameCache = new Map<string, string>();

export type AuditAction = 
  | 'TICKET_CREATED' 
  | 'TICKET_STATUS_UPDATE' 
  | 'TICKET_URGENCY_UPDATE' 
  | 'COMMENT_CREATED' 
  | 'COMMENT_DELETED' 
  | 'USER_ADDED' 
  | 'USER_DELETED' 
  | 'USER_UPDATE' 
  | 'CONFIGURATION_UPDATE' 
  | 'QUICKTAP_CONFIG_UPDATE'
  | 'REPORTER_LIST_UPDATE'
  | 'LOGIN'
  | 'APP_FEEDBACK_SUBMITTED'
  | 'APP_FEEDBACK_SUBMMITTED'
  | 'SERVICE_FEEDBACK_SUBMITTED'
  | 'WHATSAPP_UPDATE_SENT'
  | 'TICKET_FORWARDED_TO_VENDOR'
  | 'VENDOR_ACKNOWLEDGED_TICKET'
  | 'VENDOR_COMPLETED_TICKET'
  | 'VENDOR_ADDED'
  | 'VENDOR_UPDATED'
  | 'VENDOR_DELETED'
  | 'TICKET_BACKLOG_MOVED'
  | 'BACKLOG_TICKET_REORDERED'
  | 'SUPPORT_INQUIRY_SUBMITTED'
  | 'SUPPORT_INQUIRY_CLOSED'
  | 'SUPPORT_INQUIRY_REOPENED'
  | 'NOTICE_BANNER_PINNED'
  | 'NOTICE_BANNER_REMOVED'
  | 'ANALYTICS_REPORT_EXPORTED'
  | 'RFQ_CREATED'
  | 'RFQ_BROADCAST_SENT'
  | 'RFQ_WHATSAPP_DISPATCHED'
  | 'RFQ_DRAFT_SAVED'
  | 'RFQ_DRAFT_DELETED'
  | 'VENDOR_QUOTE_SUBMITTED'
  | 'VENDOR_QUOTE_UPDATED'
  | 'RFQ_AWARDED'
  | 'RFQ_CANCELLED'
  | 'RFQ_EXPIRED'
  | 'CONTRACTOR_AUTH_SUCCESS'
  | 'CONTRACTOR_AUTH_FAILED'
  | 'QUOTE_NOTIFICATION_SENT'
  | 'VENDORS_BULK_IMPORTED'
  | 'TAG_MERGED'
  | 'TAG_DELETED';

export interface AuditActor {
  uid: string;
  name: string;
  email?: string;
  type: 'admin' | 'resident' | 'vendor';
}

export const resetAuditSession = () => {
  const newId = Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('tiktak_session_id', newId);
  return newId;
};

export const logAction = async (params: {
  tenantId: string;
  action: AuditAction;
  actor: AuditActor;
  details?: any;
  changes?: { previousValue: any; newValue: any } | null;
  level?: 'INFO' | 'WARN' | 'ERROR';
}) => {
  const { tenantId, action, actor, details = {}, changes = null, level = 'INFO' } = params;

  // Resolve authoritative admin name from adminUsers collection (Users tab in settings)
  let resolvedActorName = actor.name;
  if (actor.type === 'admin' && actor.uid && actor.uid !== 'admin' && tenantId) {
    const cacheKey = `${tenantId}_${actor.uid}`;
    if (adminNameCache.has(cacheKey)) {
      resolvedActorName = adminNameCache.get(cacheKey)!;
    } else {
      const sessionCached = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`tiktak_admin_name_${cacheKey}`) : null;
      if (sessionCached) {
        resolvedActorName = sessionCached;
        adminNameCache.set(cacheKey, sessionCached);
      } else {
        try {
          const uDoc = await getDoc(doc(db, "tenants", tenantId, "adminUsers", actor.uid));
          if (uDoc.exists()) {
            const uData = uDoc.data();
            const fullName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
            if (fullName) {
              resolvedActorName = fullName;
              adminNameCache.set(cacheKey, fullName);
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(`tiktak_admin_name_${cacheKey}`, fullName);
              }
            }
          }
        } catch (e) {
          // If Firestore read fails, fallback to provided name
        }
      }
    }
  }

  const effectiveActor: AuditActor = {
    ...actor,
    name: resolvedActorName || actor.name
  };

  // Set expireAt to 7 years from now
  const expireAt = new Date();
  expireAt.setFullYear(expireAt.getFullYear() + 7);

  const logData = {
    tenantId, // Top-level for easy filtering
    action,
    level,
    actor: effectiveActor,
    details,
    changes,
    metadata: {
      tenantId,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    },
    createdAt: new Date().toISOString(),
    expireAt: Timestamp.fromDate(expireAt),
    expireAtHuman: expireAt.toISOString(),
    appId: 'tiktak',
    sessionId: 'session_' + (sessionStorage.getItem('tiktak_session_id') || 'unregistered')
  };

  const cleanData = JSON.parse(JSON.stringify(logData, (_, v) => v === undefined ? null : v));

  try {
    const logsRef = collection(db, 'audit_logs');
    await addDoc(logsRef, cleanData);
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
};
