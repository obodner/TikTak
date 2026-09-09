import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where, startAfter, QueryConstraint } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Search, EyeOff, X, Filter, Copy, Check, Download, FileSpreadsheet, FileCode, Loader2 } from 'lucide-react';
import { format, parseISO, subMonths, startOfDay } from 'date-fns';

interface AuditLog {
    id: string;
    tenantId: string;
    action: string;
    level: string;
    actor: {
        uid: string;
        name: string;
        email?: string;
        type: string;
    };
    details: any;
    changes?: { previousValue: any; newValue: any } | null;
    createdAt: string;
    metadata: any;
}

interface AuditExplorerProps {
    isEn?: boolean;
}

export const AuditExplorer = ({ isEn = false }: AuditExplorerProps) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
    const [showRaw, setShowRaw] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        tenantId: 'all',
        action: 'all',
        actorSearch: '',
        category: 'all',
        urgency: 'all',
        timeRange: '1m',
        customStartDate: '',
        search: '',
        hasImage: 'all',
        hasAudio: 'all',
    });

    const handleCopy = (log: AuditLog) => {
        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
        setCopiedId(log.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const applyClientFilters = (rawLogs: AuditLog[]) => {
        let filtered = rawLogs;

        if (filters.tenantId !== 'all') {
            filtered = filtered.filter(l => (l.tenantId === filters.tenantId || l.metadata?.tenantId === filters.tenantId));
        }

        if (filters.action !== 'all') {
            filtered = filtered.filter(l => l.action === filters.action);
        }

        if (filters.category !== 'all') {
            filtered = filtered.filter(l => l.details?.category === filters.category);
        }

        if (filters.urgency !== 'all') {
            filtered = filtered.filter(l => l.details?.urgency === filters.urgency);
        }

        if (filters.actorSearch) {
            const s = filters.actorSearch.toLowerCase();
            filtered = filtered.filter(l =>
                l.actor?.email?.toLowerCase().includes(s) ||
                l.actor?.name?.toLowerCase().includes(s)
            );
        }

        if (filters.search) {
            const s = filters.search.toLowerCase();
            filtered = filtered.filter(l =>
                getHumanReadable(l).toLowerCase().includes(s) ||
                JSON.stringify(l.details || {}).toLowerCase().includes(s) ||
                l.action.toLowerCase().includes(s) ||
                (l.actor?.name && l.actor.name.toLowerCase().includes(s)) ||
                (l.actor?.email && l.actor.email.toLowerCase().includes(s))
            );
        }

        if (filters.hasImage !== 'all') {
            const wantImage = filters.hasImage === 'yes';
            filtered = filtered.filter(l => !!l.details?.hasImage === wantImage);
        }

        if (filters.hasAudio !== 'all') {
            const wantAudio = filters.hasAudio === 'yes';
            filtered = filtered.filter(l => !!l.details?.hasAudio === wantAudio);
        }

        return filtered;
    };

    const fetchAllMatchingLogs = async (): Promise<AuditLog[]> => {
        setIsExporting(true);
        try {
            const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

            let startDate: Date | null = null;
            if (filters.timeRange === '1m') startDate = subMonths(new Date(), 1);
            else if (filters.timeRange === '3m') startDate = subMonths(new Date(), 3);
            else if (filters.timeRange === '6m') startDate = subMonths(new Date(), 6);
            else if (filters.timeRange === '12m') startDate = subMonths(new Date(), 12);
            else if (filters.timeRange === 'custom' && filters.customStartDate) {
                startDate = startOfDay(new Date(filters.customStartDate));
            }

            if (startDate) {
                constraints.push(where('createdAt', '>=', startDate.toISOString()));
            }

            let allRawLogs: AuditLog[] = [];
            let lastExportDoc: any = null;
            let hasMore = true;

            while (hasMore) {
                const batchConstraints: QueryConstraint[] = [...constraints, limit(500)];
                if (lastExportDoc) {
                    batchConstraints.push(startAfter(lastExportDoc));
                }

                const q = query(collection(db, 'audit_logs'), ...batchConstraints);
                const snap = await getDocs(q);

                if (snap.empty) {
                    hasMore = false;
                    break;
                }

                const batchLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
                allRawLogs = [...allRawLogs, ...batchLogs];

                lastExportDoc = snap.docs[snap.docs.length - 1];
                if (snap.docs.length < 500) {
                    hasMore = false;
                }
            }

            return applyClientFilters(allRawLogs);
        } catch (err) {
            console.error('Failed to fetch all matching logs for export:', err);
            return applyClientFilters(logs);
        } finally {
            setIsExporting(false);
        }
    };

    const exportToCSV = async () => {
        const targetLogs = await fetchAllMatchingLogs();
        if (targetLogs.length === 0) return;

        const headers = [
            isEn ? 'Log ID' : 'מזהה',
            isEn ? 'Date' : 'תאריך',
            isEn ? 'Level' : 'רמה',
            isEn ? 'Action Code' : 'קוד פעולה',
            isEn ? 'Action Label' : 'שם פעולה',
            isEn ? 'Actor' : 'מבצע',
            isEn ? 'Actor Email' : 'אימייל מבצע',
            isEn ? 'Building/Tenant' : 'בניין/לקוח',
            isEn ? 'Description' : 'תיאור מפורט',
            isEn ? 'Details (JSON)' : 'פרטים (JSON)'
        ];

        const rows = targetLogs.map(l => {
            const dateStr = format(parseISO(l.createdAt), 'dd/MM/yyyy HH:mm:ss');
            const actionLabel = isEn
                ? (actionLabels[l.action]?.en || l.action)
                : (actionLabels[l.action]?.he || l.action);
            const logTenantId = l.tenantId || l.metadata?.tenantId;
            const tenantName = tenants.find(t => t.id === logTenantId)?.name || logTenantId || '';
            const humanDesc = getHumanReadable(l);
            const detailsJson = JSON.stringify(l.details || {}).replace(/"/g, '""');

            return [
                `"${l.id}"`,
                `"${dateStr}"`,
                `"${l.level}"`,
                `"${l.action}"`,
                `"${actionLabel.replace(/"/g, '""')}"`,
                `"${(l.actor?.name || '').replace(/"/g, '""')}"`,
                `"${(l.actor?.email || '').replace(/"/g, '""')}"`,
                `"${tenantName.replace(/"/g, '""')}"`,
                `"${humanDesc.replace(/"/g, '""')}"`,
                `"${detailsJson}"`
            ].join(',');
        });

        // Add UTF-8 BOM \uFEFF for Hebrew Excel compatibility
        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_logs_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportModal(false);
    };

    const exportToJSON = async () => {
        const targetLogs = await fetchAllMatchingLogs();
        if (targetLogs.length === 0) return;
        const jsonContent = JSON.stringify(targetLogs, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_logs_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportModal(false);
    };

    const categories = ['חשמל', 'ניקיון', 'מעלית', 'אינסטלציה', 'אחר'];

    const uiLabels = {
        title: isEn ? 'Global Audit Explorer' : 'סייר תיעוד פעולות (Audit)',
        search_placeholder: isEn ? 'Search details...' : 'חפש בפרטי הפעולה...',
        filters: isEn ? 'Filters' : 'מסננים',
        tenant: isEn ? 'Tenant' : 'בניין',
        action: isEn ? 'Action' : 'פעולה',
        actor: isEn ? 'Actor' : 'מבצע (שם/אימייל)',
        category: isEn ? 'Category' : 'קטגוריה',
        urgency: isEn ? 'Urgency' : 'דחיפות',
        time: isEn ? 'Time' : 'זמן',
        all: isEn ? 'All' : 'הכל',
        yes: isEn ? 'Yes' : 'כן',
        no: isEn ? 'No' : 'לא',
        hasImage: isEn ? 'Has Image' : 'כולל תמונה',
        hasAudio: isEn ? 'Has Audio' : 'כולל שמע',
        load_more: isEn ? 'Load More' : 'טען עוד',
        showing: isEn ? 'Showing' : 'מציג',
        records: isEn ? 'records' : 'רשומות',
        custom_date: isEn ? 'Custom Date' : 'תאריך התחלה',
    };

    const actions = [
        'TICKET_CREATED', 'TICKET_STATUS_UPDATE', 'TICKET_URGENCY_UPDATE',
        'COMMENT_CREATED', 'COMMENT_DELETED', 'USER_ADDED', 'USER_DELETED', 'USER_UPDATE',
        'VENDOR_ADDED', 'VENDOR_UPDATED', 'VENDOR_DELETED',
        'CONFIGURATION_UPDATE', 'QUICKTAP_CONFIG_UPDATE', 'REPORTER_LIST_UPDATE', 'LOGIN',
        'APP_FEEDBACK_SUBMITTED', 'APP_FEEDBACK_SUBMMITTED', 'SERVICE_FEEDBACK_SUBMITTED',
        'RESIDENT_COMMENT_ADDED', 'RESIDENT_METOO_INCREMENTED',
        'TICKET_FORWARDED_TO_VENDOR', 'VENDOR_ACKNOWLEDGED_TICKET', 'VENDOR_COMPLETED_TICKET',
        'TICKET_BACKLOG_MOVED', 'BACKLOG_TICKET_REORDERED',
        'QUOTA_NON_BILLABLE_FLAGGED', 'QUOTA_ALERT_DISPATCHED', 'BILLING_CYCLE_CLOSED',
        'SUPPORT_INQUIRY_SUBMITTED', 'SUPPORT_INQUIRY_CLOSED', 'SUPPORT_INQUIRY_REOPENED'
    ];

    const actionLabels: Record<string, { he: string; en: string }> = {
        'TICKET_CREATED': { he: 'דיווח ע״י תושב', en: 'Ticket Created' },
        'TICKET_STATUS_UPDATE': { he: 'עדכון סטטוס פנייה', en: 'Ticket Status Update' },
        'TICKET_URGENCY_UPDATE': { he: 'עדכון דחיפות פנייה', en: 'Ticket Urgency Update' },
        'COMMENT_CREATED': { he: 'הוספת הערה ניהולית', en: 'Comment Created' },
        'COMMENT_DELETED': { he: 'מחיקת הערה', en: 'Comment Deleted' },
        'WHATSAPP_UPDATE_SENT': { he: 'עדכון וואטסאפ לתושב', en: 'WhatsApp Update Sent' },
        'USER_ADDED': { he: 'הוספת משתמש ניהול', en: 'User Added' },
        'USER_DELETED': { he: 'הסרת משתמש ניהול', en: 'User Deleted' },
        'USER_UPDATE': { he: 'עדכון פרטי מנהל', en: 'User Updated' },
        'VENDOR_ADDED': { he: 'הוספת איש שירות/ספק', en: 'Vendor Added' },
        'VENDOR_UPDATED': { he: 'עדכון איש שירות/ספק', en: 'Vendor Updated' },
        'VENDOR_DELETED': { he: 'הסרת איש שירות/ספק', en: 'Vendor Deleted' },
        'CONFIGURATION_UPDATE': { he: 'עדכון הגדרות בניין', en: 'Configuration Update' },
        'QUICKTAP_CONFIG_UPDATE': { he: 'עדכון כפתורי דיווח מהיר', en: 'QuickTap Config Update' },
        'REPORTER_LIST_UPDATE': { he: 'עדכון רשימת מורשים', en: 'Reporter List Update' },
        'LOGIN': { he: 'התחברות למערכת', en: 'Login' },
        'APP_FEEDBACK_SUBMITTED': { he: 'דירוג חוויית דיווח', en: 'App Feedback Submitted' },
        'APP_FEEDBACK_SUBMMITTED': { he: 'דירוג חוויית דיווח', en: 'App Feedback Submitted' },
        'SERVICE_FEEDBACK_SUBMITTED': { he: 'דירוג שירות', en: 'Service Feedback Submitted' },
        'RESIDENT_COMMENT_ADDED': { he: 'הערת תושב', en: 'Resident Comment Added' },
        'RESIDENT_METOO_INCREMENTED': { he: 'הצטרפות לפנייה (תוסיף אותי)', en: 'Joined Ticket (Add Me)' },
        'RESIDENT_METOO_REMOVED': { he: 'ביטול הצטרפות לפנייה', en: 'Unjoined Ticket (Removed)' },
        'TICKET_FORWARDED_TO_VENDOR': { he: 'העברה לספק בוואטסאפ', en: 'Ticket Forwarded to Vendor' },
        'VENDOR_ACKNOWLEDGED_TICKET': { he: 'אישור קבלה ע״י ספק', en: 'Vendor Acknowledged Ticket' },
        'VENDOR_COMPLETED_TICKET': { he: 'דיווח ביצוע ע״י ספק', en: 'Vendor Completed Ticket' },
        'TICKET_BACKLOG_MOVED': { he: 'העברה למצבור משימות', en: 'Ticket Moved to Backlog' },
        'BACKLOG_TICKET_REORDERED': { he: 'שינוי סדר/עדיפות במצבור', en: 'Backlog Ticket Reordered' },
        'QUOTA_NON_BILLABLE_FLAGGED': { he: 'זיכוי מכסה (פנייה ללא חיוב)', en: 'Quota Non-Billable Flagged' },
        'QUOTA_ALERT_DISPATCHED': { he: 'התראת מכסת פניות', en: 'Quota Alert Dispatched' },
        'BILLING_CYCLE_CLOSED': { he: 'סגירת מחזור חיוב חודשי', en: 'Billing Cycle Closed' },
        'SUPPORT_INQUIRY_SUBMITTED': { he: 'פתיחת פניית תמיכה', en: 'Support Call Opened' },
        'SUPPORT_INQUIRY_CLOSED': { he: 'סגירת פניית תמיכה', en: 'Support Call Closed' },
        'SUPPORT_INQUIRY_REOPENED': { he: 'פתיחה מחדש של פניית תמיכה', en: 'Support Call Reopened' },
    };

    const statusMap: Record<string, { he: string; en: string }> = {
        'open': { he: 'פתוחה', en: 'Open' },
        'in_progress': { he: 'בטיפול', en: 'In Progress' },
        'resolved': { he: 'טופל', en: 'Resolved' },
        'fixed': { he: 'טופל', en: 'Fixed' },
        'dismissed': { he: 'נדחתה', en: 'Dismissed' },
        'rejected': { he: 'נדחה', en: 'Rejected' },
        'closed': { he: 'סגור', en: 'Closed' },
        'vendor': { he: 'בטיפול ספק', en: 'Vendor Dispatched' },
        'duplicate': { he: 'כפילות', en: 'Duplicate' },
        'irrelevant': { he: 'לא רלוונטי', en: 'Irrelevant' },
        'outside': { he: 'מחוץ לאחריות', en: 'Outside Scope' },
    };

    function formatStatus(rawStatus: string) {
        if (!rawStatus) return '';
        const statusKey = String(rawStatus).toLowerCase();
        return isEn ? (statusMap[statusKey]?.en || rawStatus) : (statusMap[statusKey]?.he || rawStatus);
    }

    useEffect(() => {
        fetchTenants();
    }, []);

    useEffect(() => {
        fetchLogs(true);
    }, [filters]);

    const fetchTenants = async () => {
        try {
            const snap = await getDocs(collection(db, 'tenants'));
            setTenants(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
        } catch (err) {
            console.error('Failed to fetch tenants:', err);
        }
    };

    const fetchLogs = async (isNew = false) => {
        setLoading(true);
        try {
            // Keep only Time and OrderBy on server-side to avoid complex composite indexes
            const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(100)];

            let startDate: Date | null = null;
            if (filters.timeRange === '1m') startDate = subMonths(new Date(), 1);
            else if (filters.timeRange === '3m') startDate = subMonths(new Date(), 3);
            else if (filters.timeRange === '6m') startDate = subMonths(new Date(), 6);
            else if (filters.timeRange === '12m') startDate = subMonths(new Date(), 12);
            else if (filters.timeRange === 'custom' && filters.customStartDate) {
                startDate = startOfDay(new Date(filters.customStartDate));
            }

            if (startDate) {
                constraints.push(where('createdAt', '>=', startDate.toISOString()));
            }

            if (!isNew && lastDoc) {
                constraints.push(startAfter(lastDoc));
            }

            const q = query(collection(db, 'audit_logs'), ...constraints);
            const snap = await getDocs(q);

            const rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
            const filtered = applyClientFilters(rawLogs);

            setLogs(prev => isNew ? filtered : [...prev, ...filtered]);
            setLastDoc(snap.docs[snap.docs.length - 1]);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const resetFilters = () => {
        setFilters({
            tenantId: 'all',
            action: 'all',
            actorSearch: '',
            category: 'all',
            urgency: 'all',
            timeRange: '1m',
            customStartDate: '',
            search: '',
            hasImage: 'all',
            hasAudio: 'all',
        });
    };

    function getHumanReadable(log: AuditLog) {
        let actor = log.actor?.name || log.actor?.email || 'Unknown';
        if (actor.toLowerCase() === 'system' || actor === 'Admin' || actor === 'system') {
            actor = isEn ? 'System' : 'מערכת';
        } else if (actor.includes('@') && actor.includes('.')) {
            actor = actor.split('@')[0];
        }
        const logTenantId = log.tenantId || log.metadata?.tenantId;
        const tenantName = tenants.find(t => t.id === logTenantId)?.name || logTenantId || 'Unknown';

        switch (log.action) {
            case 'TICKET_CREATED':
                const createRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const summaryText = log.details.summary ? `: ${log.details.summary}` : '';
                return isEn
                    ? `${actor} reported a new ${log.details.category} issue ${createRef} in ${tenantName}${summaryText}`
                    : `${actor} דיווח על תקלה חדשה ${createRef} (${log.details.category}) בבניין ${tenantName}${summaryText}`;
            case 'TICKET_STATUS_UPDATE': {
                const ticketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const formattedNewStatus = formatStatus(log.details.newStatus);
                return isEn
                    ? `${actor} updated ticket ${ticketRef} status to ${formattedNewStatus} in ${tenantName}`
                    : `${actor} עדכן סטטוס של פנייה ${ticketRef} ל-${formattedNewStatus} בבניין ${tenantName}`;
            }
            case 'QUOTA_NON_BILLABLE_FLAGGED': {
                const qRef = (log.details?.ticketNumber !== undefined && log.details?.ticketNumber !== null)
                    ? `#${log.details.ticketNumber}`
                    : (log.details?.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const reasonStr = log.details?.reason ? ` (${log.details.reason})` : '';
                return isEn
                    ? `Ticket ${qRef} flagged as non-billable quota deduction${reasonStr} in ${tenantName}`
                    : `זיכוי מכסה: פנייה ${qRef} סומנה כפטורה מחיוב במכסה${reasonStr} בבניין ${tenantName}`;
            }
            case 'QUOTA_ALERT_DISPATCHED': {
                const threshold = log.details?.threshold || '';
                const netUsed = log.details?.netUsedTickets ?? '';
                const quota = log.details?.effectiveQuota ?? '';
                const usageStr = (netUsed !== '' && quota !== '') ? ` (${netUsed}/${quota})` : '';
                return isEn
                    ? `Quota alert dispatched (${threshold})${usageStr} for ${tenantName}`
                    : `התראת ניצול מכסה נשלחה (${threshold})${usageStr} עבור ${tenantName}`;
            }
            case 'BILLING_CYCLE_CLOSED': {
                return isEn
                    ? `Monthly billing cycle closed for ${tenantName}`
                    : `סיכום מחזור חיוב חודשי נסגר עבור ${tenantName}`;
            }
            case 'COMMENT_CREATED':
                const commTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `${actor} added a comment to ticket ${commTicketRef}`
                    : `${actor} הוסיף הערה לפנייה ${commTicketRef}`;
            case 'COMMENT_DELETED':
                const delCommTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `${actor} deleted a comment from ticket ${delCommTicketRef}`
                    : `${actor} מחק הערה מפנייה ${delCommTicketRef}`;
            case 'WHATSAPP_UPDATE_SENT':
                const waTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const waCommentSnippet = log.details.commentText ? ` ("${log.details.commentText}")` : '';
                return isEn
                    ? `${actor} sent WhatsApp update to resident for ticket ${waTicketRef}${waCommentSnippet}`
                    : `${actor} שלח עדכון בוואטסאפ לתושב עבור פנייה ${waTicketRef}${waCommentSnippet}`;
            case 'TICKET_FORWARDED_TO_VENDOR': {
                const fwdTicketRef = (log.details?.ticketNumber !== undefined && log.details?.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details?.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const vPhone = (log.details?.vendorPhone || '').trim();
                const vName = (log.details?.vendorName || '').trim();
                const cleanPhone = vPhone.replace(/\D/g, '');
                const cleanName = vName.replace(/\D/g, '');
                const isPhoneSame = !vName || vName === vPhone || (cleanPhone.length > 0 && cleanName === cleanPhone);
                const vNameStr = isPhoneSame ? (vPhone || vName) : (vPhone ? `${vName} (${vPhone})` : vName);
                return isEn
                    ? `${actor} forwarded ticket ${fwdTicketRef} to vendor ${vNameStr} via WhatsApp`
                    : `${actor} העביר פנייה ${fwdTicketRef} לספק ${vNameStr} בוואטסאפ`;
            }
            case 'VENDOR_ACKNOWLEDGED_TICKET': {
                const ackTicketRef = (log.details?.ticketNumber !== undefined && log.details?.ticketNumber !== null)
                    ? `#${log.details.ticketNumber}`
                    : (log.details?.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const rawVName = (log.details?.vendorName || '').trim();
                const vPhone = (log.details?.vendorPhone || '').trim();
                const cleanPhone = vPhone.replace(/\D/g, '');
                const cleanName = rawVName.replace(/\D/g, '');
                const isPhoneSame = !rawVName || rawVName === vPhone || (cleanPhone.length > 0 && cleanName === cleanPhone);
                const vName = isPhoneSame ? (vPhone || rawVName || log.actor?.name || actor) : (vPhone ? `${rawVName} (${vPhone})` : rawVName);
                const timeStr = log.details?.responseTimeMinutes !== undefined && log.details?.responseTimeMinutes !== null
                    ? (isEn ? ` (Response time: ${log.details.responseTimeMinutes}m)` : ` (זמן תגובה: ${log.details.responseTimeMinutes} דק׳)`)
                    : '';
                return isEn
                    ? `Vendor (${vName}) acknowledged receipt of ticket ${ackTicketRef} via WhatsApp${timeStr}`
                    : `הספק (${vName}) אישר קבלת פנייה ${ackTicketRef} בוואטסאפ${timeStr}`;
            }
            case 'VENDOR_COMPLETED_TICKET': {
                const doneTicketRef = (log.details?.ticketNumber !== undefined && log.details?.ticketNumber !== null)
                    ? `#${log.details.ticketNumber}`
                    : (log.details?.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const rawVName = (log.details?.vendorName || '').trim();
                const vPhone = (log.details?.vendorPhone || '').trim();
                const cleanPhone = vPhone.replace(/\D/g, '');
                const cleanName = rawVName.replace(/\D/g, '');
                const isPhoneSame = !rawVName || rawVName === vPhone || (cleanPhone.length > 0 && cleanName === cleanPhone);
                const vName = isPhoneSame ? (vPhone || rawVName || log.actor?.name || actor) : (vPhone ? `${rawVName} (${vPhone})` : rawVName);
                const timeStr = log.details?.totalResolutionTimeMinutes !== undefined && log.details?.totalResolutionTimeMinutes !== null
                    ? (isEn ? ` (Total time: ${log.details.totalResolutionTimeMinutes}m)` : ` (זמן ביצוע כולל: ${log.details.totalResolutionTimeMinutes} דק׳)`)
                    : '';
                return isEn
                    ? `Vendor (${vName}) marked ticket ${doneTicketRef} as completed (Done) via WhatsApp${timeStr}`
                    : `הספק (${vName}) דיווח על ביצוע (בוצע) עבור פנייה ${doneTicketRef} בוואטסאפ${timeStr}`;
            }
            case 'TICKET_BACKLOG_MOVED': {
                const bkgRef = (log.details?.ticketNumber !== undefined && log.details?.ticketNumber !== null) 
                    ? `#${log.details.ticketNumber}` 
                    : (log.details?.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `${actor} moved ticket ${bkgRef} to Tasks Backlog (Important & Urgent)`
                    : `${actor} העביר/ה את פנייה ${bkgRef} למצבור משימות (חשוב ודחוף)`;
            }
            case 'BACKLOG_TICKET_REORDERED': {
                const reordRef = (log.details?.ticketNumber !== undefined && log.details?.ticketNumber !== null) 
                    ? `#${log.details.ticketNumber}` 
                    : (log.details?.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                const colNames: Record<string, { he: string; en: string }> = {
                    'important-urgent': { he: 'חשוב ודחוף', en: 'Important & Urgent' },
                    'important-not-urgent': { he: 'חשוב ולא דחוף', en: 'Important & Not Urgent' },
                    'not-important-urgent': { he: 'לא חשוב ודחוף', en: 'Not Important & Urgent' }
                };
                const colKey = log.details?.toColumn || 'important-urgent';
                const colName = isEn ? (colNames[colKey]?.en || colKey) : (colNames[colKey]?.he || colKey);
                return isEn
                    ? `${actor} updated priority/position of ticket ${reordRef} in Backlog (${colName})`
                    : `${actor} עדכן/ה מיקום/עדיפות פנייה ${reordRef} במצבור משימות (${colName})`;
            }
            case 'TICKET_URGENCY_UPDATE':
                const urgTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `${actor} updated ticket ${urgTicketRef} urgency to ${log.details.newUrgency}`
                    : `${actor} עדכן דחיפות של פנייה ${urgTicketRef} ל-${log.details.newUrgency}`;
            case 'CONFIGURATION_UPDATE':
                return isEn
                    ? `${actor} updated building settings for ${tenantName}`
                    : `${actor} עדכן את הגדרות הבניין עבור ${tenantName}`;
            case 'QUICKTAP_CONFIG_UPDATE':
                const itemsCount = log.details.quickTapItemsCount !== undefined ? ` (${log.details.quickTapItemsCount} כפתורים)` : '';
                return isEn
                    ? `${actor} updated QuickTap configuration for ${tenantName}${itemsCount}`
                    : `${actor} עדכן את הגדרות הדיווח המהיר (QuickTap) עבור ${tenantName}${itemsCount}`;
            case 'REPORTER_LIST_UPDATE': {
                const subAction = log.details.actionName;
                const residentName = log.details.name || '';
                const oldName = log.details.oldName || '';
                const newName = log.details.newName || '';
                
                if (subAction === 'REPORTER_CREATED') {
                    return isEn
                        ? `${actor} added resident ${residentName}`
                        : `${actor} הוסיף את התושב ${residentName}`;
                }
                if (subAction === 'REPORTER_DELETED') {
                    return isEn
                        ? `${actor} removed resident ${residentName}`
                        : `${actor} הסיר את התושב ${residentName}`;
                }
                if (subAction === 'REPORTER_UPDATED') {
                    return isEn
                        ? `${actor} updated resident ${oldName} to ${newName}`
                        : `${actor} עדכן את התושב ${oldName} ל-${newName}`;
                }
                
                return isEn
                    ? `${actor} imported/updated the reporter list for ${tenantName}`
                    : `${actor} ייבא/עדכן את רשימת המורשים עבור ${tenantName}`;
            }
            case 'USER_ADDED':
                const targetUser = log.details.email || log.details.uid || '';
                return isEn
                    ? `${actor} added a new admin user (${targetUser}) to ${tenantName}`
                    : `${actor} הוסיף משתמש ניהול חדש (${targetUser}) עבור ${tenantName}`;
            case 'USER_DELETED':
                const delUser = log.details.email || log.details.uid || '';
                return isEn
                    ? `${actor} removed admin user (${delUser}) from ${tenantName}`
                    : `${actor} הסיר משתמש ניהול (${delUser}) עבור ${tenantName}`;
            case 'USER_UPDATE': {
                const target = log.details.targetEmail || log.details.targetUid || '';
                const isReset = log.details.actionName === 'resetPassword';
                if (isReset) {
                    return isEn
                        ? `${actor} requested password reset for ${target} in ${tenantName}`
                        : `${actor} ביקש איפוס סיסמה עבור ${target} בבניין ${tenantName}`;
                }
                
                let changeStr = '';
                const changes = log.changes;
                if (changes?.previousValue && changes?.newValue) {
                    const fields = Object.keys(changes.newValue);
                    if (fields.length > 0) {
                        const fieldLabels: Record<string, string> = {
                            firstName: isEn ? 'first name' : 'שם פרטי',
                            lastName: isEn ? 'last name' : 'שם משפחה',
                            mobile: isEn ? 'mobile' : 'טלפון'
                        };
                        const list = fields.map(f => {
                            const label = fieldLabels[f] || f;
                            const oldVal = changes.previousValue[f] || (isEn ? 'empty' : 'ריק');
                            const newVal = changes.newValue[f] || (isEn ? 'empty' : 'ריק');
                            return `${label} (${oldVal} ➔ ${newVal})`;
                        }).join(', ');
                        changeStr = isEn ? ` (changes: ${list})` : ` (שינויים: ${list})`;
                    }
                }
                
                return isEn
                    ? `${actor} updated user ${target} in ${tenantName}${changeStr}`
                    : `${actor} עדכן את משתמש הניהול ${target} בבניין ${tenantName}${changeStr}`;
            }
            case 'VENDOR_ADDED': {
                const vName = log.details?.fullName || log.details?.vendorId || '';
                return isEn
                    ? `${actor} added service vendor ${vName} to ${tenantName}`
                    : `${actor} הוסיף/ה איש שירות חדש: ${vName} עבור ${tenantName}`;
            }
            case 'VENDOR_UPDATED': {
                const vName = log.details?.fullName || log.details?.vendorId || '';
                return isEn
                    ? `${actor} updated service vendor ${vName} in ${tenantName}`
                    : `${actor} עדכן/ה את איש השירות ${vName} עבור ${tenantName}`;
            }
            case 'VENDOR_DELETED': {
                const vName = log.details?.fullName || log.details?.vendorId || '';
                return isEn
                    ? `${actor} removed service vendor ${vName} from ${tenantName}`
                    : `${actor} הסיר/ה את איש השירות ${vName} עבור ${tenantName}`;
            }
            case 'LOGIN':
                return isEn ? `${actor} logged in` : `${actor} התחבר למערכת`;
            case 'APP_FEEDBACK_SUBMITTED':
            case 'APP_FEEDBACK_SUBMMITTED': {
                const appFeedbackTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `${actor} submitted app feedback (rating: ${log.details.rating}/5) for ticket ${appFeedbackTicketRef}`
                    : `${actor} דירג/ה את חוויית הדיווח ב-${log.details.rating}/5 עבור פנייה ${appFeedbackTicketRef}`;
            }
            case 'SERVICE_FEEDBACK_SUBMITTED': {
                const svcFeedbackTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `${actor} submitted service feedback (rating: ${log.details.rating}/5) for ticket ${svcFeedbackTicketRef}`
                    : `${actor} דירג/ה את השירות ב-${log.details.rating}/5 עבור פנייה ${svcFeedbackTicketRef}`;
            }
            case 'RESIDENT_COMMENT_ADDED': {
                const commTicketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `Resident ${actor} added comment to ticket ${commTicketRef}: "${log.details.comment}"`
                    : `תושב (${actor}) הוסיף הערה לפנייה ${commTicketRef}: "${log.details.comment}"`;
            }
            case 'RESIDENT_METOO_INCREMENTED': {
                const ticketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `Resident joined ticket ${ticketRef} ("Add me") in ${tenantName}`
                    : `תושב הצטרף לפנייה ${ticketRef} ("תוסיף אותי") בבניין ${tenantName}`;
            }
            case 'RESIDENT_METOO_REMOVED': {
                const ticketRef = (log.details.ticketNumber !== undefined && log.details.ticketNumber !== null) ? `#${log.details.ticketNumber}` : (log.details.ticketId ? `(${log.details.ticketId.substring(0, 5)}...)` : '');
                return isEn
                    ? `Resident removed addition from ticket ${ticketRef} in ${tenantName}`
                    : `תושב ביטל הצטרפות לפנייה ${ticketRef} בבניין ${tenantName}`;
            }
            case 'SUPPORT_INQUIRY_SUBMITTED': {
                const bName = log.details?.tenantName || (tenantName !== 'general' && tenantName !== 'Unknown' ? tenantName : '');
                const bNameStr = bName ? (isEn ? ` for ${bName}` : ` בבניין ${bName}`) : '';
                return isEn
                    ? `${actor} opened a support call${bNameStr}`
                    : `${actor} פתח/ה פניית תמיכה${bNameStr}`;
            }
            case 'SUPPORT_INQUIRY_CLOSED': {
                const bName = log.details?.tenantName || (tenantName !== 'general' && tenantName !== 'Unknown' ? tenantName : '');
                const bNameStr = bName ? (isEn ? ` for ${bName}` : ` בבניין ${bName}`) : '';
                const caller = log.details?.callerName ? (isEn ? ` from ${log.details.callerName}` : ` מאת ${log.details.callerName}`) : '';
                return isEn
                    ? `${actor} closed/addressed support call${caller}${bNameStr}`
                    : `${actor} סימן/ה כטופלה פניית תמיכה${caller}${bNameStr}`;
            }
            case 'SUPPORT_INQUIRY_REOPENED': {
                const bName = log.details?.tenantName || (tenantName !== 'general' && tenantName !== 'Unknown' ? tenantName : '');
                const bNameStr = bName ? (isEn ? ` for ${bName}` : ` בבניין ${bName}`) : '';
                const caller = log.details?.callerName ? ` (${log.details.callerName})` : '';
                return isEn
                    ? `${actor} reopened support call${caller}${bNameStr}`
                    : `${actor} פתח/ה מחדש פניית תמיכה${caller}${bNameStr}`;
            }
            default: {
                const actionLabel = isEn
                    ? (actionLabels[log.action]?.en || log.action)
                    : (actionLabels[log.action]?.he || log.action);
                return `${actor}: ${actionLabel}`;
            }
        }
    }

    return (
        <div className="space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <Filter size={18} className="text-blue-600" />
                    <h2 className="font-bold text-slate-800">{uiLabels.filters}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4 items-end">
                    {/* Time Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.time}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.timeRange}
                            onChange={e => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
                        >
                            <option value="1m">חודש אחרון</option>
                            <option value="3m">3 חודשים</option>
                            <option value="6m">6 חודשים</option>
                            <option value="12m">שנה אחרונה</option>
                            <option value="custom">טווח מותאם</option>
                        </select>
                    </div>

                    {/* Custom Date (if selected) */}
                    {filters.timeRange === 'custom' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.custom_date}</label>
                            <input
                                type="date"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                value={filters.customStartDate}
                                onChange={e => setFilters(prev => ({ ...prev, customStartDate: e.target.value }))}
                            />
                        </div>
                    )}

                    {/* Building Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.tenant}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.tenantId}
                            onChange={e => setFilters(prev => ({ ...prev, tenantId: e.target.value }))}
                        >
                            <option value="all">{uiLabels.all}</option>
                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>

                    {/* Action Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.action}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.action}
                            onChange={e => setFilters(prev => ({ ...prev, action: e.target.value }))}
                        >
                            <option value="all">{uiLabels.all}</option>
                            {actions.map(a => (
                                <option key={a} value={a}>
                                    {isEn ? (actionLabels[a]?.en || a) : (actionLabels[a]?.he || a)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Category Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.category}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.category}
                            onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
                        >
                            <option value="all">{uiLabels.all}</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* Actor Search */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.actor}</label>
                        <div className="relative">
                            <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder={isEn ? 'Name or email...' : 'חפש שם או אימייל...'}
                                className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                value={filters.actorSearch}
                                onChange={e => setFilters(prev => ({ ...prev, actorSearch: e.target.value }))}
                            />
                        </div>
                    </div>

                    {/* Urgency Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.urgency}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.urgency}
                            onChange={e => setFilters(prev => ({ ...prev, urgency: e.target.value }))}
                        >
                            <option value="all">{uiLabels.all}</option>
                            <option value="High">High</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>

                    {/* General Search */}
                    <div className="space-y-1.5 lg:col-span-2">
                        <label className="text-xs font-bold text-slate-500 block px-1">חיפוש חופשי</label>
                        <input
                            type="text"
                            placeholder={uiLabels.search_placeholder}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.search}
                            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        />
                    </div>

                    {/* Image Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.hasImage}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.hasImage}
                            onChange={e => setFilters(prev => ({ ...prev, hasImage: e.target.value }))}
                        >
                            <option value="all">{uiLabels.all}</option>
                            <option value="yes">{uiLabels.yes}</option>
                            <option value="no">{uiLabels.no}</option>
                        </select>
                    </div>

                    {/* Audio Filter */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block px-1">{uiLabels.hasAudio}</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={filters.hasAudio}
                            onChange={e => setFilters(prev => ({ ...prev, hasAudio: e.target.value }))}
                        >
                            <option value="all">{uiLabels.all}</option>
                            <option value="yes">{uiLabels.yes}</option>
                            <option value="no">{uiLabels.no}</option>
                        </select>
                    </div>

                    {/* Reset Button */}
                    <div className="flex justify-end">
                        <button
                            onClick={resetFilters}
                            className="p-2.5 bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
                            title="נקה מסננים"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center px-2">
                <p className="text-sm font-bold text-slate-500">
                    {uiLabels.showing} <span className="text-blue-600">{logs.length}</span> {uiLabels.records}
                </p>

                <button
                    onClick={() => setShowExportModal(true)}
                    disabled={logs.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                    <Download size={16} />
                    <span>{isEn ? 'Export Logs' : 'ייצוא רשומות'}</span>
                </button>
            </div>

            {/* Export Format Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                    <Download size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">
                                    {isEn ? 'Export Audit Logs' : 'ייצוא תיעוד פעולות'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 font-medium">
                            {isEn
                                ? `Exporting all records matching the current filter options:`
                                : `ייצוא של כל הרשומות התואמות למסננים שנבחרו:`}
                        </p>

                        {isExporting ? (
                            <div className="py-8 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-slate-200">
                                <Loader2 size={32} className="text-blue-600 animate-spin" />
                                <span className="text-sm font-bold text-slate-700">
                                    {isEn ? 'Fetching all matching logs...' : 'אוסף את כל הרשומות התואמות...'}
                                </span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={exportToCSV}
                                    className="flex flex-col items-center justify-center gap-3 p-5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-2xl transition-all group cursor-pointer"
                                >
                                    <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-md group-hover:scale-110 transition-transform">
                                        <FileSpreadsheet size={24} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block font-bold text-sm">קובץ Excel (CSV)</span>
                                        <span className="text-[11px] text-emerald-600 font-medium">{isEn ? 'For Excel / Sheets' : 'מתאים לאקסל ולגיליונות'}</span>
                                    </div>
                                </button>

                                <button
                                    onClick={exportToJSON}
                                    className="flex flex-col items-center justify-center gap-3 p-5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-2xl transition-all group cursor-pointer"
                                >
                                    <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md group-hover:scale-110 transition-transform">
                                        <FileCode size={24} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block font-bold text-sm">קובץ נתונים (JSON)</span>
                                        <span className="text-[11px] text-blue-600 font-medium">{isEn ? 'Raw JSON format' : 'פורמט מפתחים / מפתח'}</span>
                                    </div>
                                </button>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setShowExportModal(false)}
                                disabled={isExporting}
                                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors"
                            >
                                {isEn ? 'Cancel' : 'ביטול'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {logs.map(log => (
                        <div
                            key={log.id}
                            className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group/row"
                            onClick={() => setShowRaw(showRaw === log.id ? null : log.id)}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                            {format(parseISO(log.createdAt), 'dd/MM HH:mm')}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${log.level === 'WARN' ? 'bg-amber-100 text-amber-700' :
                                                log.level === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            {log.level}
                                        </span>
                                        <span className="text-xs text-slate-500 font-medium">{log.actor.email || log.actor.name}</span>
                                    </div>
                                    <p className="text-sm text-slate-800 font-medium">{getHumanReadable(log)}</p>

                                    {showRaw === log.id && (
                                        <div className="relative mt-3 rounded-lg overflow-hidden border border-slate-800" onClick={(e) => e.stopPropagation()}>
                                            <div className="absolute top-2.5 left-2.5 z-20">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCopy(log);
                                                    }}
                                                    id={`copy-${log.id}`}
                                                    className={`p-1.5 rounded-md transition-all flex items-center justify-center border shadow-md ${copiedId === log.id
                                                            ? 'bg-green-600 text-white border-green-500'
                                                            : 'bg-slate-800/95 hover:bg-slate-700 text-slate-200 border-slate-700 backdrop-blur-sm'
                                                        }`}
                                                    title={isEn ? 'Copy JSON' : 'העתק JSON'}
                                                >
                                                    {copiedId === log.id ? (
                                                        <Check size={14} className="text-white" />
                                                    ) : (
                                                        <Copy size={14} className="text-slate-300" />
                                                    )}
                                                </button>
                                            </div>
                                            <pre
                                                className="p-3 pt-11 bg-slate-900 text-green-400 text-[11px] leading-relaxed max-h-96 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all break-words font-mono text-left relative selection:bg-green-900 selection:text-white"
                                                dir="ltr"
                                            >
                                                {JSON.stringify(log, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => setShowRaw(showRaw === log.id ? null : log.id)}
                                    className={`p-2 rounded-lg transition-colors ${showRaw === log.id ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100'}`}
                                >
                                    {showRaw === log.id ? <EyeOff size={18} /> : <Search size={18} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {loading && <div className="p-8 text-center text-slate-400">{isEn ? 'Loading logs...' : 'טוען נתונים...'}</div>}

                {!loading && lastDoc && (
                    <button
                        onClick={() => fetchLogs(false)}
                        className="w-full p-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-100"
                    >
                        {uiLabels.load_more}
                    </button>
                )}
            </div>
        </div>
    );
};
