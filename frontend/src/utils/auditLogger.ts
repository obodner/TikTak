import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
  | 'WHATSAPP_UPDATE_SENT';

export interface AuditActor {
  uid: string;
  name: string;
  email?: string;
  type: 'admin' | 'resident';
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

  // Set expireAt to 7 years from now
  const expireAt = new Date();
  expireAt.setFullYear(expireAt.getFullYear() + 7);

  const logData = {
    tenantId, // Top-level for easy filtering
    action,
    level,
    actor,
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
