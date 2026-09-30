import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import {
  Receipt,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Paperclip,
  Trophy,
  Loader2,
  Copy,
  ExternalLink,
  Check,
  FileSpreadsheet,
  X,
  Send,
  Maximize2,
  AlertTriangle,
  RotateCcw,
  FileCheck2,
  FileEdit,
  Trash2
} from 'lucide-react';
import { WorkQuoteRequest, VendorQuoteSubmission, RfqStatus } from '../../types/rfq';
import { logAction } from '../../utils/auditLogger';
import WorkOrderContractModal from '../../components/admin/WorkOrderContractModal';
import { ConfirmModal } from '../../components/admin/ConfirmModal';
import { normalizePhone } from '../../utils/whatsapp';

const AWARD_REASON_PRESETS = [
  'ההצעה הזולה ביותר 💰',
  'תקופת אחריות ארוכה יותר 🛡️',
  'זמינות מיידית / ביצוע מהיר ⚡',
  'ניסיון קודם ושביעות רצון ⭐',
  'מפרט ואיכות חומרים עדיפה 🛠️',
  'אחר...'
];

const HEBREW_MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

interface MonthGroup {
  key: string;
  label: string;
  rfqs: WorkQuoteRequest[];
}

export default function ActiveQuotesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthState();

  // URL Banner & Deep Link params
  const newRfqId = searchParams.get('newRfqId');
  const rfqIdParam = searchParams.get('rfqId');
  const targetRfqId = rfqIdParam || newRfqId;
  const modalParam = searchParams.get('modal');
  const isQuoteAlert = searchParams.get('alert') === 'quote' || modalParam === 'compare';
  const sentCount = searchParams.get('sentCount');
  const draftSaved = searchParams.get('draftSaved');

  // State
  const [rfqs, setRfqs] = useState<WorkQuoteRequest[]>([]);
  const [submissionsByRfq, setSubmissionsByRfq] = useState<Record<string, VendorQuoteSubmission[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedRfqIds, setExpandedRfqIds] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'open' | 'closed' | 'drafts'>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'drafts') return 'drafts';
    if (tab === 'open' || tab === 'closed') return tab;
    return 'all';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Draft deletion state
  const [draftToDelete, setDraftToDelete] = useState<WorkQuoteRequest | null>(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);

  // Month grouping collapse state
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);

  // Tenant Info for dynamic customer type, building address, and customer logo
  const [tenantInfo, setTenantInfo] = useState<{ name: string; type: string; address?: string; logoUrl?: string; vaadPhone?: string } | null>(null);

  // Award Winner Modal State (QA-105 & Phase 5 Reasoning)
  const [awardModalData, setAwardModalData] = useState<{
    rfq: WorkQuoteRequest;
    submission: VendorQuoteSubmission;
    message: string;
    updateTicketStatus: boolean;
    awardReason: string;
    customReasonText: string;
    isLowestPrice: boolean;
    minPrice: number;
  } | null>(null);

  // Work Order / Contract Modal State (Phase 5)
  const [contractModalData, setContractModalData] = useState<{
    rfq: WorkQuoteRequest;
    submission: VendorQuoteSubmission;
  } | null>(null);

  // Full Screen Comparison Modal State (QA-110)
  const [comparisonModalRfq, setComparisonModalRfq] = useState<WorkQuoteRequest | null>(null);

  // Status Change Confirmation Modal State (Replaces native browser window.confirm)
  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    rfq: WorkQuoteRequest;
    newStatus: RfqStatus;
  } | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [dispatchingVendorId, setDispatchingVendorId] = useState<string | null>(null);

  // Current logged in admin profile (from adminUsers collection / Users tab)
  const [adminProfile, setAdminProfile] = useState<{
    firstName?: string;
    lastName?: string;
    fullName?: string;
    mobile?: string;
  } | null>(null);

  useEffect(() => {
    if (!tenantId || !user?.uid) return;
    getDoc(doc(db, "tenants", tenantId, "adminUsers", user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim();
        setAdminProfile({
          firstName: d.firstName,
          lastName: d.lastName,
          fullName: fullName || undefined,
          mobile: d.mobile || d.phone
        });
      }
    }).catch(e => console.warn('Could not load current admin profile:', e));
  }, [tenantId, user?.uid]);

  // 1. Real-time listener for RFQ requests
  useEffect(() => {
    if (!tenantId) return;

    setLoading(true);
    const rfqsRef = collection(db, "tenants", tenantId, "rfqs");
    const q = query(rfqsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: WorkQuoteRequest[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as WorkQuoteRequest));

      setRfqs(items);
      setLoading(false);

      // Auto-open comparison modal & auto-expand target RFQ if present in query params
      if (targetRfqId) {
        const targetRfq = items.find(item => item.id === targetRfqId);
        if (targetRfq) {
          setExpandedRfqIds(prev => Array.from(new Set([...prev, targetRfqId])));
          if (modalParam === 'compare' || isQuoteAlert) {
            setComparisonModalRfq(targetRfq);
          }
        }
      }
    }, (err) => {
      console.error("Error loading RFQs:", err);
      setLoading(false);
    });

    // Fetch tenant info reliably from Firestore and API
    const loadTenantData = async () => {
      let resolvedName = tenantId;
      let resolvedType = 'building';
      let resolvedAddress = '';
      let resolvedLogoUrl = '';

      let resolvedVaadPhone = '';
      try {
        const snap = await getDoc(doc(db, "tenants", tenantId));
        if (snap.exists()) {
          const d = snap.data();
          if (d.name) resolvedName = d.name;
          if (d.type) resolvedType = d.type;
          if (d.address) resolvedAddress = d.address;
          if (d.logoUrl) resolvedLogoUrl = d.logoUrl;
          if (d.vaadPhone) resolvedVaadPhone = d.vaadPhone;
        }
      } catch (err) {
        console.warn('Firestore tenant fetch error:', err);
      }

      try {
        const res = await fetch(`/api/buildingInfo?tenantId=${tenantId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.name) resolvedName = data.name;
          if (data.type) resolvedType = data.type;
          if (data.address) resolvedAddress = data.address;
          if (data.logoUrl) resolvedLogoUrl = data.logoUrl;
          if (data.vaadPhone) resolvedVaadPhone = data.vaadPhone;
        }
      } catch (err) {
        console.warn('API buildingInfo fetch error:', err);
      }

      setTenantInfo({
        name: resolvedName,
        type: resolvedType,
        address: resolvedAddress,
        logoUrl: resolvedLogoUrl,
        vaadPhone: resolvedVaadPhone
      });
    };

    loadTenantData();

    return () => unsubscribe();
  }, [tenantId, newRfqId]);

  // Auto-scroll to target RFQ card smoothly if specified in URL params
  useEffect(() => {
    if (!targetRfqId || loading) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`rfq-${targetRfqId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [targetRfqId, loading]);

  // 2. Fetch submissions for all RFQs
  useEffect(() => {
    if (!tenantId || rfqs.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    rfqs.forEach(rfq => {
      const subColRef = collection(db, "tenants", tenantId, "rfqs", rfq.id, "submissions");
      const unsub = onSnapshot(subColRef, (subSnap) => {
        const subs: VendorQuoteSubmission[] = subSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as VendorQuoteSubmission));

        setSubmissionsByRfq(prev => ({
          ...prev,
          [rfq.id]: subs
        }));
      }, (err) => {
        console.warn(`Could not load submissions for RFQ ${rfq.id}:`, err);
      });

      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach(u => u());
    };
  }, [tenantId, rfqs]);

  // Toggle card expansion
  const toggleExpand = (rfqId: string) => {
    setExpandedRfqIds(prev =>
      prev.includes(rfqId) ? prev.filter(id => id !== rfqId) : [...prev, rfqId]
    );
  };

  // Helper: Format deadline & calculate remaining hours/days
  const formatDeadline = (isoString: string) => {
    const deadline = new Date(isoString);
    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { label: 'פג תוקף ⚠️', isExpired: true, color: 'text-red-700 bg-red-50 border-red-200' };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return {
        label: `נותרו ${diffDays} ימים (${deadline.toLocaleDateString('he-IL')})`,
        isExpired: false,
        color: diffDays <= 2 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-blue-700 bg-blue-50 border-blue-200'
      };
    } else {
      return {
        label: `נותרו ${diffHours} שעות לסגירה`,
        isExpired: false,
        color: 'text-amber-700 bg-amber-50 border-amber-200'
      };
    }
  };

  // Lifecycle helpers: check if RFQ is expired based on status or past deadline
  const isRfqExpired = (rfq: WorkQuoteRequest) => {
    if (rfq.status === 'expired') return true;
    if (rfq.status === 'open' && rfq.deadlineAt) {
      return new Date(rfq.deadlineAt).getTime() <= Date.now();
    }
    return false;
  };

  const isRfqOpen = (rfq: WorkQuoteRequest) => {
    return rfq.status === 'open' && !isRfqExpired(rfq);
  };

  const isRfqClosed = (rfq: WorkQuoteRequest) => {
    return rfq.status === 'awarded' || rfq.status === 'cancelled' || isRfqExpired(rfq);
  };

  // Helper: Copy contractor link
  const handleCopyContractorLink = (rfqId: string, vendorId: string, tokenHash?: string) => {
    const origin = window.location.origin;
    const portalUrl = `${origin}/quote/${rfqId}?tid=${tenantId}&v=${vendorId}${tokenHash ? `&t=${tokenHash}` : ''}`;
    navigator.clipboard.writeText(portalUrl);
    setCopiedTokenId(`${rfqId}-${vendorId}`);
    setTimeout(() => setCopiedTokenId(null), 2500);
  };

  // Helper: Generate WhatsApp link for vendor
  const buildVendorWhatsAppUrl = (rfq: WorkQuoteRequest, vendor: any) => {
    const origin = window.location.origin;
    const portalUrl = `${origin}/quote/${rfq.id}?tid=${rfq.tenantId}&v=${vendor.vendorId}${vendor.tokenHash ? `&t=${vendor.tokenHash}` : ''}`;
    const cleanPhone = normalizePhone(vendor.phone || '');

    const senderName = rfq.createdBy?.name || 'ועד הבית';
    const customerSite = rfq.tenantName || 'ועד הבית / היישוב';

    const message = `שלום ${vendor.vendorName},\n` +
      `התקבלה בקשה להצעת מחיר עבור: *${rfq.title}*\n\n` +
      `לקוח / אתר: ${customerSite}\n` +
      `איש קשר: ${senderName}\n` +
      `תחום מקצועי: ${rfq.category}\n` +
      (rfq.location ? `מיקום מדויק: ${rfq.location}\n` : '') +
      `\nלצפייה בפרטי התקלה, מסמכים והקלטות, ולהגשת הצעת מחיר ישירה לחץ על הקישור:\n` +
      `${portalUrl}`;

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  // Helper: Build tailored WhatsApp discussion URL based on RFQ status and winner state
  const buildVendorDiscussionWhatsAppUrl = (
    rfq: WorkQuoteRequest,
    vendor: any,
    quote?: VendorQuoteSubmission
  ) => {
    const rawPhone = quote?.vendorPhone || vendor.phone || '';
    const cleanPhone = normalizePhone(rawPhone);
    const senderName = rfq.createdBy?.name || user?.displayName || 'ועד הבית';
    const customerSite = tenantInfo?.name || rfq.tenantName || 'ועד הבית / היישוב';

    let message = '';

    if (rfq.status === 'awarded') {
      if (rfq.awardedVendorId === vendor.vendorId) {
        // Winning contractor: Coordinate work execution!
        message =
          `שלום ${vendor.vendorName},\n` +
          `בהמשך לזכייתך במכרז *${rfq.title}* עבור ${customerSite},\n` +
          `פונה אליך לתיאום מועד תחילת העבודה והתארגנות לביצוע בשטח.\n\n` +
          `בברכה,\n${senderName}`;
      } else {
        // Declined contractor after award
        message =
          `שלום ${vendor.vendorName},\n` +
          `פונה אליך בהמשך להצעת המחיר שהגשת עבור המכרז *${rfq.title}* (${customerSite}).\n` +
          `רצינו לעדכן כי המכרז הסתיים. תודה רבה על השתתפותך ונשמח להזמינך למכרזים נוספים בהמשך.\n\n` +
          `בברכה,\n${senderName}`;
      }
    } else if (quote) {
      // Open RFQ: Clarify quote details with contractor
      const vatText = quote.priceIncludesVat ? 'כולל מע"מ' : 'לפני מע"מ';
      message =
        `שלום ${vendor.vendorName},\n` +
        `בהמשך להצעת המחיר שלך ע"ס ₪${quote.price.toLocaleString()} (${vatText}) עבור המכרז *${rfq.title}* (${customerSite}),\n` +
        `רציתי לברר איתך מספר פרטים לגבי ההצעה ולוחות הזמנים לביצוע.\n\n` +
        `בברכה,\n${senderName}`;
    } else {
      // Dispatched vendor who has not submitted yet
      return buildVendorWhatsAppUrl(rfq, vendor);
    }

    return cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  // Helper: Default award WhatsApp message (QA-105)
  const buildDefaultAwardMessage = (rfq: WorkQuoteRequest, submission: VendorQuoteSubmission) => {
    const vatText = submission.priceIncludesVat ? 'כולל מע"מ' : 'לפני מע"מ';
    return (
      `שלום ${submission.vendorName},\n` +
      `שמחים לעדכן כי הצעת המחיר שלך ע"ס ₪${submission.price.toLocaleString()} (${vatText}) עבור: *${rfq.title}* אושרה! 🏆\n\n` +
      `נשמח לתאם איתך את מועד תחילת העבודה בהקדם.\n` +
      `בברכה,\n` +
      `${rfq.tenantName || 'ועד הבית / הנהלת המתחם'}`
    );
  };

  // Re-send automated WhatsApp template to contractor
  const handleResendWhatsApp = async (rfq: WorkQuoteRequest, vendor: any) => {
    setDispatchingVendorId(`${rfq.id}-${vendor.vendorId}`);
    try {
      const res = await fetch('/api/dispatchRfqToVendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          rfqId: rfq.id,
          vendorIds: [vendor.vendorId],
          actor: {
            uid: user?.uid || 'admin',
            name: user?.displayName || user?.email || 'ועד הבית',
            email: user?.email || undefined
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'שליחת WhatsApp נכשלה. תוכל לשלוח ידנית באמצעות הקישור.');
      }
    } catch (e: any) {
      alert(`שגיאה בשיגור WhatsApp: ${e.message}`);
    } finally {
      setDispatchingVendorId(null);
    }
  };

  // Open Award Winner Confirmation Modal with Decision Reasoning
  const handleOpenAwardModal = (rfq: WorkQuoteRequest, submission: VendorQuoteSubmission) => {
    const subs = submissionsByRfq[rfq.id] || [];
    const prices = subs.map(s => s.price).filter(p => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : submission.price;
    const isLowest = submission.price <= minPrice;

    setAwardModalData({
      rfq,
      submission,
      message: buildDefaultAwardMessage(rfq, submission),
      updateTicketStatus: Boolean(rfq.ticketId),
      awardReason: isLowest ? 'ההצעה הזולה ביותר 💰' : 'תקופת אחריות ארוכה יותר 🛡️',
      customReasonText: '',
      isLowestPrice: isLowest,
      minPrice
    });
  };

  // Open Contract / Work Order Modal (Phase 5)
  const handleOpenContractModal = (rfq: WorkQuoteRequest, targetSubmission?: VendorQuoteSubmission) => {
    let sub = targetSubmission;
    if (!sub) {
      const subs = submissionsByRfq[rfq.id] || [];
      sub = subs.find(s => s.id === rfq.awardedQuoteId || s.vendorId === rfq.awardedVendorId);
    }

    if (!sub && rfq.awardedVendorId) {
      sub = {
        id: rfq.awardedQuoteId || 'awarded',
        rfqId: rfq.id,
        tenantId: rfq.tenantId,
        vendorId: rfq.awardedVendorId,
        vendorName: rfq.awardedVendorName || 'קבלן זוכה',
        vendorPhone: rfq.dispatchedVendors?.find(v => v.vendorId === rfq.awardedVendorId)?.phone || '',
        vendorType: rfq.dispatchedVendors?.find(v => v.vendorId === rfq.awardedVendorId)?.vendorType || 'occasional',
        price: rfq.awardedPrice || 0,
        priceIncludesVat: true,
        totalPriceWithVat: rfq.awardedPrice || 0,
        estimatedDuration: 'לפי תיאום',
        notes: rfq.awardReasoning?.reasonType || '',
        status: 'accepted',
        submittedAt: rfq.awardedAt || new Date().toISOString()
      };
    }

    if (sub) {
      setContractModalData({ rfq, submission: sub });
    }
  };

  // Confirm Award Action (QA-105 & QA-106 & Phase 5 Reasoning)
  const handleConfirmAward = async (sendWhatsApp: boolean) => {
    if (!tenantId || !awardModalData) return;
    const { rfq, submission, message, updateTicketStatus, awardReason, customReasonText } = awardModalData;

    setActionLoadingId(submission.id);
    try {
      const nowIso = new Date().toISOString();
      const rfqRef = doc(db, "tenants", tenantId, "rfqs", rfq.id);

      const finalReasonNote = awardReason === 'אחר...'
        ? customReasonText.trim()
        : customReasonText.trim();

      const awardReasoningPayload: Record<string, any> = {
        reasonType: awardReason,
        awardedAt: nowIso,
        awardedBy: user?.displayName || user?.email || 'ועד הבית'
      };
      if (finalReasonNote) {
        awardReasoningPayload.note = finalReasonNote;
      }

      await updateDoc(rfqRef, {
        status: 'awarded',
        awardedQuoteId: submission.id,
        awardedVendorId: submission.vendorId,
        awardedVendorName: submission.vendorName,
        awardedPrice: submission.price,
        awardedAt: nowIso,
        awardedMessageSent: message,
        awardReasoning: awardReasoningPayload,
        updatedAt: nowIso
      });

      // Update submission status to accepted
      const subRef = doc(db, "tenants", tenantId, "rfqs", rfq.id, "submissions", submission.id);
      await updateDoc(subRef, {
        status: 'accepted',
        updatedAt: nowIso
      });

      // Update other submissions to declined
      const otherSubs = (submissionsByRfq[rfq.id] || []).filter(s => s.id !== submission.id);
      for (const other of otherSubs) {
        const otherRef = doc(db, "tenants", tenantId, "rfqs", rfq.id, "submissions", other.id);
        await updateDoc(otherRef, {
          status: 'declined',
          updatedAt: nowIso
        });
      }

      // QA-106: Conditional linked ticket update
      if (updateTicketStatus && rfq.ticketId) {
        try {
          const ticketRef = doc(db, "tenants", tenantId, "tickets", rfq.ticketId);
          const ticketSnap = await getDoc(ticketRef);
          if (ticketSnap.exists()) {
            const ticketData = ticketSnap.data();
            const ticketUpdates: any = {
              assignedVendor: {
                id: submission.vendorId,
                name: submission.vendorName,
                phone: submission.vendorPhone,
                vendorType: submission.vendorType,
                assignedAt: nowIso,
                awardedPrice: submission.price
              },
              updatedAt: nowIso
            };
            // Only tickets in 'open' state change to 'in-progress'. If already in-progress or other, preserve status.
            if (ticketData.status === 'open') {
              ticketUpdates.status = 'in-progress';
            }
            await updateDoc(ticketRef, ticketUpdates);
          }
        } catch (tErr) {
          console.warn("Could not update linked ticket:", tErr);
        }
      }

      // Audit Log
      const isCustomMessage = message.trim() !== buildDefaultAwardMessage(rfq, submission).trim();
      await logAction({
        tenantId,
        action: 'RFQ_AWARDED',
        actor: {
          uid: user?.uid || 'admin',
          name: user?.displayName || user?.email || 'ועד הבית',
          email: user?.email || undefined,
          type: 'admin'
        },
        details: {
          rfqId: rfq.id,
          rfqTitle: rfq.title,
          ticketId: rfq.ticketId,
          winningVendorId: submission.vendorId,
          winningVendorName: submission.vendorName,
          winningPrice: submission.price,
          editedMessage: isCustomMessage,
          whatsappSent: sendWhatsApp,
          awardReason: awardReason + (finalReasonNote ? ` (${finalReasonNote})` : '')
        }
      });

      // Send WhatsApp if requested
      const rawVendorPhone =
        submission.vendorPhone ||
        rfq.dispatchedVendors?.find(v => v.vendorId === submission.vendorId)?.phone ||
        '';
      if (sendWhatsApp && rawVendorPhone) {
        const cleanPhone = normalizePhone(rawVendorPhone);
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      }

      setAwardModalData(null);
      if (comparisonModalRfq?.id === rfq.id) {
        setComparisonModalRfq(null);
      }
    } catch (err: any) {
      console.error("Error awarding quote:", err);
      alert("שגיאה בעדכון ההצעה הזוכה: " + (err.message || ''));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Status Confirmation Modal (replaces browser confirm)
  const handleOpenStatusConfirmModal = (rfq: WorkQuoteRequest, newStatus: RfqStatus) => {
    setStatusConfirmModal({ rfq, newStatus });
  };

  // Confirm Status Change
  const handleConfirmStatusChange = async () => {
    if (!tenantId || !statusConfirmModal) return;
    const { rfq, newStatus } = statusConfirmModal;

    setStatusChanging(true);
    try {
      const nowIso = new Date().toISOString();
      const rfqRef = doc(db, "tenants", tenantId, "rfqs", rfq.id);
      const updates: Record<string, any> = {
        status: newStatus,
        updatedAt: nowIso
      };
      if (newStatus === 'open' && isRfqExpired(rfq)) {
        const extendedDate = new Date();
        extendedDate.setDate(extendedDate.getDate() + 7);
        updates.deadlineAt = extendedDate.toISOString();
      }
      await updateDoc(rfqRef, updates);

      // Audit Log
      await logAction({
        tenantId,
        action: newStatus === 'cancelled' ? 'RFQ_CANCELLED' : 'RFQ_CREATED',
        actor: {
          uid: user?.uid || 'admin',
          name: user?.displayName || user?.email || 'ועד הבית',
          email: user?.email || undefined,
          type: 'admin'
        },
        details: {
          rfqId: rfq.id,
          rfqTitle: rfq.title,
          newStatus
        }
      });

      setStatusConfirmModal(null);
    } catch (err: any) {
      console.error("Error updating RFQ status:", err);
      alert("שגיאה בעדכון סטטוס הבקשה: " + (err.message || ''));
    } finally {
      setStatusChanging(false);
    }
  };

  // Sync active tab with URL searchParams if changed externally
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'drafts') setActiveFilter('drafts');
    else if (tab === 'open' || tab === 'closed') setActiveFilter(tab);
    else if (tab === 'all') setActiveFilter('all');
  }, [searchParams]);

  // Delete Draft RFQ
  const handleDeleteDraft = async () => {
    if (!tenantId || !draftToDelete) return;
    setIsDeletingDraft(true);
    try {
      await deleteDoc(doc(db, "tenants", tenantId, "rfqs", draftToDelete.id));

      await logAction({
        tenantId,
        action: 'RFQ_DRAFT_DELETED',
        actor: {
          uid: user?.uid || 'admin',
          name: adminProfile?.fullName || user?.displayName || user?.email || 'ועד הבית',
          email: user?.email || undefined,
          type: 'admin'
        },
        details: {
          draftId: draftToDelete.id,
          title: draftToDelete.title,
          category: draftToDelete.category,
          ticketNumber: draftToDelete.ticketNumber
        }
      });

      setRfqs(prev => prev.filter(r => r.id !== draftToDelete.id));
      setDraftToDelete(null);
    } catch (err: any) {
      console.error("Error deleting draft RFQ:", err);
      alert("שגיאה במחיקת הטיוטה: " + (err.message || ''));
    } finally {
      setIsDeletingDraft(false);
    }
  };

  // Filter & Search Logic
  const filteredRfqs = rfqs.filter(rfq => {
    // Filter by Tab
    if (activeFilter === 'drafts' && rfq.status !== 'draft') return false;
    if (activeFilter === 'open' && !isRfqOpen(rfq)) return false;
    if (activeFilter === 'closed' && !isRfqClosed(rfq)) return false;

    // Search query
    if (searchQuery.trim()) {
      const qLower = searchQuery.toLowerCase().trim();
      const matchTitle = rfq.title?.toLowerCase().includes(qLower);
      const matchCat = rfq.category?.toLowerCase().includes(qLower);
      const matchNum = rfq.ticketNumber ? String(rfq.ticketNumber).includes(qLower) : false;
      const matchVendor = rfq.dispatchedVendors?.some(v => v.vendorName?.toLowerCase().includes(qLower));
      return matchTitle || matchCat || matchNum || matchVendor;
    }

    return true;
  });

  // Tab counters
  const openCount = rfqs.filter(r => isRfqOpen(r)).length;
  const closedCount = rfqs.filter(r => isRfqClosed(r)).length;
  const draftsCount = rfqs.filter(r => r.status === 'draft').length;

  // Month-Year Key Helper
  const getMonthYearKey = (isoString?: string) => {
    if (!isoString) return { key: 'unknown', label: 'תאריך לא ידוע' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { key: 'unknown', label: 'תאריך לא ידוע' };
    const year = d.getFullYear();
    const month = d.getMonth();
    return {
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${HEBREW_MONTH_NAMES[month]} ${year}`
    };
  };

  // Group filtered RFQs by Month-Year (Bug requirement #2)
  const groupedRfqs = useMemo<MonthGroup[]>(() => {
    const groupsMap = new Map<string, { label: string; rfqs: WorkQuoteRequest[] }>();

    filteredRfqs.forEach(rfq => {
      const { key, label } = getMonthYearKey(rfq.createdAt);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { label, rfqs: [] });
      }
      groupsMap.get(key)!.rfqs.push(rfq);
    });

    // Sort descending (latest month first)
    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map(key => ({
      key,
      label: groupsMap.get(key)!.label,
      rfqs: groupsMap.get(key)!.rfqs
    }));
  }, [filteredRfqs]);

  const handleExpandAllGroups = () => setCollapsedGroupKeys([]);
  const handleCollapseAllGroups = () => setCollapsedGroupKeys(groupedRfqs.map(g => g.key));
  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroupKeys(prev =>
      prev.includes(groupKey)
        ? prev.filter(k => k !== groupKey)
        : [...prev, groupKey]
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 shadow-sm">
            <Receipt size={26} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">הצעות מחיר ומעקב קבלנים (RFQ)</h1>
            <p className="text-sm text-slate-500 font-medium">מעקב אחר פניות פעילות, הצעות מחיר שהוגשו מספקים והשוואה לקראת סגירה</p>
          </div>
        </div>

        <Link
          to={`/admin/${tenantId}/quotes/new`}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-200 transition-all cursor-pointer shrink-0"
        >
          <Plus size={18} />
          <span>בקשת הצעה חדשה</span>
        </Link>
      </div>

      {/* Alert Notification Banner for Incoming Quote */}
      {targetRfqId && isQuoteAlert && (
        <div className="mt-4 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-between gap-3 animate-in fade-in shadow-sm">
          <div className="flex items-center gap-2.5">
            <Receipt size={22} className="text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-extrabold">התקבלה הצעת מחיר חדשה עבור פנייה זו! 📥</p>
              <p className="text-xs text-blue-700">
                מסך השוואת ההצעות המלא נפתח אוטומטית. תוכל גם לצפות ולנהל את ההצעות ישירות מהכרטיס המורחב מטה.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              searchParams.delete('modal');
              searchParams.delete('alert');
              searchParams.delete('rfqId');
              searchParams.delete('newRfqId');
              setSearchParams(searchParams);
            }}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 px-2 py-1 rounded-lg hover:bg-blue-100/50 cursor-pointer"
          >
            סגור הודעה
          </button>
        </div>
      )}

      {/* Success Notification Banner after creation */}
      {newRfqId && !isQuoteAlert && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 animate-in fade-in shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-extrabold">בקשת הצעת המחיר נוצרה בהצלחה! 🚀</p>
              <p className="text-xs text-emerald-700">
                הבקשה הופצה והקישורים מוכנים עבור {sentCount || 'כל'} הקבלנים. תוכל להעתיק או לשלוח מחדש ב-WhatsApp ישירות מרשימת הקבלנים מטה.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              searchParams.delete('newRfqId');
              searchParams.delete('sentCount');
              setSearchParams(searchParams);
            }}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 px-2 py-1 rounded-lg hover:bg-emerald-100/50 cursor-pointer"
          >
            סגור הודעה
          </button>
        </div>
      )}

      {/* Success Notification Banner after saving Draft */}
      {draftSaved === '1' && (
        <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-3 animate-in fade-in shadow-sm">
          <div className="flex items-center gap-2.5">
            <FileEdit size={22} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-extrabold">טיוטת המכרז נשמרה בהצלחה! 📝</p>
              <p className="text-xs text-amber-700">
                הטיוטה שמורה בבטחה ואינה גלויה לקבלנים. תוכל לחזור לערוך ולהפיץ אותה בכל עת, או למחוק אותה במידת הצורך.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              searchParams.delete('draftSaved');
              setSearchParams(searchParams);
            }}
            className="text-xs font-bold text-amber-800 hover:text-amber-950 px-2 py-1 rounded-lg hover:bg-amber-100/50 cursor-pointer"
          >
            סגור הודעה
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl w-full md:w-auto overflow-x-auto">
          {[
            { id: 'all', label: `כל הפניות (${rfqs.length})` },
            { id: 'open', label: `הצעות פתוחות (${openCount})` },
            { id: 'closed', label: `הצעות שנסגרו / נבחרו (${closedCount}) 🏆` },
            { id: 'drafts', label: `טיוטות (${draftsCount}) 📝` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveFilter(tab.id as any);
                if (tab.id === 'drafts') {
                  searchParams.set('tab', 'drafts');
                } else if (tab.id === 'all') {
                  searchParams.delete('tab');
                } else {
                  searchParams.set('tab', tab.id);
                }
                setSearchParams(searchParams);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${activeFilter === tab.id
                  ? 'bg-white text-blue-600 shadow-sm font-black'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="חיפוש לפי כותרת, קטגוריה, קבלן..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
          />
        </div>
      </div>

      {/* Quick Grouping Controls Bar */}
      {!loading && filteredRfqs.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">
              מציג {filteredRfqs.length} פניות מקובצות לפי {groupedRfqs.length} חודשים
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExpandAllGroups}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
            >
              פתח הכל
            </button>
            <button
              type="button"
              onClick={handleCollapseAllGroups}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
            >
              סגור הכל
            </button>
          </div>
        </div>
      )}

      {/* Body: RFQ List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <span className="text-sm font-bold">טוען בקשות להצעות מחיר...</span>
        </div>
      ) : filteredRfqs.length === 0 ? (
        <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileSpreadsheet size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {searchQuery || activeFilter !== 'all' ? 'לא נמצאו פניות תואמות לסינון' : 'אין עדיין בקשות הצעת מחיר (RFQ)'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            {searchQuery || activeFilter !== 'all'
              ? 'נסה לשנות את תנאי החיפוש או לבחור בלשונית אחרת.'
              : 'יצירת בקשת מחיר תאפשר לך לשגר קישור ישיר לקבלנים ב-WhatsApp ולקבל הצעות להשוואה בקליק אחד.'}
          </p>
          <Link
            to={`/admin/${tenantId}/quotes/new`}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-bold shadow-md shadow-blue-200 transition-colors"
          >
            <Plus size={16} />
            <span>צור בקשת הצעה חדשה</span>
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groupedRfqs.map(group => {
            const isGroupCollapsed = collapsedGroupKeys.includes(group.key);
            const openInGroup = group.rfqs.filter(r => isRfqOpen(r)).length;
            const closedInGroup = group.rfqs.filter(r => isRfqClosed(r)).length;
            const hasQuotesInGroup = group.rfqs.filter(r => r.status !== 'draft' && (submissionsByRfq[r.id] || []).length > 0).length;
            const draftsInGroup = group.rfqs.filter(r => r.status === 'draft').length;

            return (
              <div key={group.key} className="space-y-3">
                {/* Month Group Header */}
                <div
                  onClick={() => toggleGroupCollapse(group.key)}
                  className="flex items-center justify-between p-3.5 bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200 rounded-2xl cursor-pointer transition-all select-none shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-600 text-white shadow-2xs">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm md:text-base font-black text-slate-900 flex items-center gap-2">
                        <span>{group.label}</span>
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                          {group.rfqs.length} {group.rfqs.length === 1 ? 'פנייה' : 'פניות'}
                        </span>
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Quick badges for month */}
                    <div className="hidden sm:flex items-center gap-1.5 text-xs">
                      {draftsInGroup > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                          {draftsInGroup} טיוטות 📝
                        </span>
                      )}
                      {openInGroup > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                          {openInGroup} פתוחות
                        </span>
                      )}
                      {hasQuotesInGroup > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
                          {hasQuotesInGroup} עם הצעות 📥
                        </span>
                      )}
                      {closedInGroup > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                          {closedInGroup} סגורות / נבחרו 🏆
                        </span>
                      )}
                    </div>

                    <div className="p-1 rounded-lg text-slate-500 hover:text-slate-800">
                      {isGroupCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </div>
                  </div>
                </div>

                {/* RFQs in this Month Group */}
                {!isGroupCollapsed && (
                  <div className="space-y-4">
                    {group.rfqs.map(rfq => {
                      const isExpanded = expandedRfqIds.includes(rfq.id);
                      const submissions = submissionsByRfq[rfq.id] || [];
                      const deadlineInfo = formatDeadline(rfq.deadlineAt);

                      return (
                        <div
                          key={rfq.id}
                          id={`rfq-${rfq.id}`}
                          className={`bg-white border rounded-2xl shadow-sm transition-all overflow-hidden ${rfq.id === targetRfqId ? 'ring-2 ring-blue-500 border-blue-400 shadow-md' : 'border-slate-200'
                            }`}
                        >
                          {/* RFQ Card Summary Header */}
                          <div
                            onClick={() => toggleExpand(rfq.id)}
                            className="p-5 md:p-6 cursor-pointer hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 select-none"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Ticket link badge */}
                                {rfq.ticketNumber && (
                                  <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white text-xs font-black">
                                    #{rfq.ticketNumber}
                                  </span>
                                )}

                                {/* Category Pill */}
                                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-extrabold border border-slate-200">
                                  {rfq.category}
                                </span>

                                {/* Status Badge */}
                                {rfq.status === 'draft' ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-black flex items-center gap-1">
                                    <FileEdit size={12} />
                                    <span>טיוטה - טרם הופצה 📝</span>
                                  </span>
                                ) : rfq.status === 'awarded' ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black flex items-center gap-1">
                                      <Trophy size={13} className="text-amber-600" />
                                      <span>נבחרה הצעה זוכה: {rfq.awardedVendorName} (₪{rfq.awardedPrice?.toLocaleString()})</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenContractModal(rfq);
                                      }}
                                      className="px-2.5 py-0.5 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                                      title="צפה בהסכם העבודה ובהזמנה המחייבת"
                                    >
                                      <FileCheck2 size={12} />
                                      <span>הסכם עבודה (חוזה) 📄</span>
                                    </button>
                                  </div>
                                ) : rfq.status === 'cancelled' ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                                    בוטל / נסגר
                                  </span>
                                ) : isRfqExpired(rfq) ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 text-xs font-bold flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>פג תוקף (נסגר להצעות)</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                                    פתוח להצעות
                                  </span>
                                )}

                                {/* Deadline remaining badge (only when open and NOT expired) */}
                                {rfq.status === 'open' && !isRfqExpired(rfq) && (
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 ${deadlineInfo.color}`}>
                                    <Clock size={12} />
                                    <span>{deadlineInfo.label}</span>
                                  </span>
                                )}
                              </div>

                              <h3 className="text-base md:text-lg font-black text-slate-900 leading-snug">
                                {rfq.title}
                              </h3>

                              {rfq.location && (
                                <p className="text-xs text-slate-500 font-medium">
                                  מיקום: {rfq.location}
                                </p>
                              )}
                            </div>

                            {/* Right side stats & toggle */}
                            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                              {/* Submissions Count Pill or Draft Action Controls */}
                              {rfq.status === 'draft' ? (
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                  <Link
                                    to={`/admin/${tenantId}/quotes/new?draftId=${rfq.id}`}
                                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                                    title="המשך עריכת טיוטה"
                                  >
                                    <FileEdit size={13} />
                                    <span>המשך עריכה</span>
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => setDraftToDelete(rfq)}
                                    className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors cursor-pointer"
                                    title="מחק טיוטה לצמיתות"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className={`px-3.5 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 ${submissions.length > 0
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-amber-50 border-amber-200 text-amber-800'
                                  }`}>
                                  <span>
                                    {submissions.length > 0
                                      ? `התקבלו ${submissions.length} מתוך ${rfq.dispatchedVendors?.length || 0} הצעות 📥`
                                      : `ממתין להצעות (0/${rfq.dispatchedVendors?.length || 0}) ⏳`}
                                  </span>
                                </div>
                              )}

                              <button
                                type="button"
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                title={isExpanded ? 'צמצם פרטים' : 'הרחב פרטים והשוואת הצעות'}
                              >
                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Details & Comparison Matrix */}
                          {isExpanded && (
                            <div className="border-t border-slate-200 p-5 md:p-6 bg-slate-50/40 space-y-6 animate-in fade-in">
                              {/* Job Scope & Files */}
                              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">
                                  פרטי הבקשה והנחיות לביצוע
                                </h4>
                                <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-line break-words">
                                  {rfq.description || 'ללא תיאור מורחב'}
                                </p>

                                {/* Attachments */}
                                {rfq.attachments && rfq.attachments.length > 0 && (
                                  <div className="pt-2 border-t border-slate-100">
                                    <span className="text-xs font-bold text-slate-500 block mb-2">מסמכים ומדיה שצורפו:</span>
                                    <div className="flex flex-wrap gap-2">
                                      {rfq.attachments.map((att, idx) => (
                                        <a
                                          key={idx}
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-xs font-bold text-slate-700 hover:text-blue-700 transition-all shadow-2xs"
                                        >
                                          <Paperclip size={13} className="text-blue-500" />
                                          <span>{att.name}</span>
                                          <ExternalLink size={11} className="opacity-50" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Dispatched Contractors & Quotes Comparison Matrix */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                      <FileSpreadsheet size={18} className="text-blue-600" />
                                      <span>מטריצת השוואת הצעות מחיר מספקים</span>
                                    </h4>
                                    <span className="text-xs text-slate-400 font-bold">
                                      {rfq.dispatchedVendors?.length || 0} קבלנים ברשימת התפוצה
                                    </span>
                                  </div>

                                  {/* Full Screen Comparison Button (QA-110) */}
                                  <button
                                    type="button"
                                    onClick={() => setComparisonModalRfq(rfq)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all cursor-pointer border border-blue-200 shadow-2xs"
                                  >
                                    <Maximize2 size={13} />
                                    <span>תצוגה מלאה והשוואה מרוכזת</span>
                                  </button>
                                </div>

                                {/* Awarded Winner & Reasoning Banner (if awarded) */}
                                {(rfq.status === 'awarded' || rfq.awardedVendorId) && (
                                  <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-xl flex items-start gap-3 shadow-2xs text-right">
                                    <div className="p-2 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5 shadow-sm">
                                      <Trophy size={18} />
                                    </div>
                                    <div className="space-y-1 flex-1">
                                      <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-xs font-black text-emerald-900 bg-emerald-200/80 px-2 py-0.5 rounded-md border border-emerald-300/60">
                                            הצעה זוכה • החלטת ועד הבית
                                          </span>
                                          <span className="text-xs font-extrabold text-slate-800">
                                            הקבלן שנבחר: <strong className="text-emerald-950 font-black">{rfq.awardedVendorName || 'קבלן זוכה'}</strong>
                                            {rfq.awardedPrice && ` (₪${rfq.awardedPrice.toLocaleString()})`}
                                          </span>
                                        </div>
                                        {(rfq.awardReasoning?.awardedAt || rfq.awardedAt) && (
                                          <span className="text-[11px] text-slate-500 font-bold">
                                            תאריך אישור: {new Date(rfq.awardReasoning?.awardedAt || rfq.awardedAt || '').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        )}
                                      </div>

                                      {rfq.awardReasoning ? (
                                        <div className="text-xs text-slate-800 pt-0.5">
                                          <span className="text-emerald-950 font-black">נימוק בחירת הקבלן לפרוטוקול: </span>
                                          <span className="text-slate-900 font-bold">{rfq.awardReasoning.reasonType}</span>
                                          {rfq.awardReasoning.note && (
                                            <span className="text-slate-700 font-medium mr-1.5 bg-white px-2 py-0.5 rounded border border-emerald-200 inline-block">
                                              "{rfq.awardReasoning.note}"
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-xs text-slate-500 italic">
                                          לא תועד נימוק מפורט לבחירה זו
                                        </div>
                                      )}

                                      {rfq.awardReasoning?.awardedBy && (
                                        <div className="text-[11px] text-slate-500 font-medium">
                                          נרשם ואושר ע"י: {rfq.awardReasoning.awardedBy}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {rfq.dispatchedVendors?.map(vendor => {
                                    const quote = submissions.find(s => s.vendorId === vendor.vendorId);
                                    const isAwardedWinner = rfq.awardedVendorId === vendor.vendorId;

                                    return (
                                      <div
                                        key={vendor.vendorId}
                                        className={`p-4 rounded-xl border transition-all space-y-3 ${isAwardedWinner
                                            ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-200'
                                            : quote
                                              ? 'bg-white border-blue-200 shadow-2xs'
                                              : 'bg-white border-slate-200 opacity-90'
                                          }`}
                                      >
                                        {/* Contractor Header */}
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-black text-slate-900">{vendor.vendorName}</span>
                                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${vendor.vendorType === 'retainer'
                                                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                {vendor.vendorType === 'retainer' ? 'קבוע 🏢' : 'מזדמן 🛠️'}
                                              </span>
                                            </div>
                                            <span className="text-xs text-slate-500" dir="ltr">{vendor.phone}</span>
                                          </div>

                                          {isAwardedWinner ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center gap-1 shadow-sm">
                                                <Trophy size={13} />
                                                <span>הצעה זוכה</span>
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleOpenContractModal(rfq, quote)}
                                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                                title="צפה והדפס הסכם עבודה מחייב"
                                              >
                                                <FileCheck2 size={13} />
                                                <span>הפק הסכם עבודה 📄</span>
                                              </button>
                                            </div>
                                          ) : quote ? (
                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                                              הוגשה הצעה ✓
                                            </span>
                                          ) : (
                                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 flex items-center gap-1">
                                              <Clock size={11} className="text-slate-400" />
                                              <span>שוגר ב-WhatsApp • ממתין להצעה</span>
                                            </span>
                                          )}
                                        </div>

                                        {/* Quote Details if submitted */}
                                        {quote ? (
                                          <div className="space-y-3">
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                                              <div className="flex items-baseline justify-between">
                                                <span className="text-xs text-slate-500 font-bold">מחיר מוצע:</span>
                                                <span className="text-lg font-black text-slate-900">
                                                  ₪{quote.price.toLocaleString()}
                                                  <span className="text-[10px] text-slate-400 font-normal mr-1">
                                                    {quote.priceIncludesVat ? '(כולל מע"מ)' : '+ מע"מ'}
                                                  </span>
                                                </span>
                                              </div>

                                              {quote.estimatedDuration && (
                                                <div className="flex items-center justify-between text-xs">
                                                  <span className="text-slate-500 font-bold">לוח זמנים משוער:</span>
                                                  <span className="font-extrabold text-slate-800">{quote.estimatedDuration}</span>
                                                </div>
                                              )}

                                              {quote.notes && (
                                                <div className="pt-1 text-xs text-slate-600 italic border-t border-slate-200/60 whitespace-pre-line break-words">
                                                  "{quote.notes}"
                                                </div>
                                              )}

                                              {quote.quoteDocumentUrl && (
                                                <a
                                                  href={quote.quoteDocumentUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline pt-1"
                                                >
                                                  <Paperclip size={12} />
                                                  <span>צפה במסמך ההצעה שצורף</span>
                                                </a>
                                              )}
                                            </div>

                                            {/* Award Reasoning Badge on Winning Contractor Card */}
                                            {isAwardedWinner && rfq.awardReasoning && (
                                              <div className="p-2.5 bg-emerald-100/70 border border-emerald-300 rounded-lg text-xs space-y-0.5 text-right">
                                                <div className="font-black text-emerald-950 flex items-center gap-1">
                                                  <CheckCircle2 size={13} className="text-emerald-700 shrink-0" />
                                                  <span>נימוק הבחירה: {rfq.awardReasoning.reasonType}</span>
                                                </div>
                                                {rfq.awardReasoning.note && (
                                                  <div className="text-emerald-900 font-medium text-[11px] pr-4 italic">
                                                    "{rfq.awardReasoning.note}"
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {/* Actions Bar for contractor with submitted quote */}
                                            <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                                              {/* Discussion / Coordination Button */}
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <a
                                                  href={buildVendorDiscussionWhatsAppUrl(rfq, vendor, quote)}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors ${rfq.status === 'awarded' && rfq.awardedVendorId === vendor.vendorId
                                                      ? 'border-emerald-400 bg-emerald-100/90 hover:bg-emerald-200 text-emerald-950 font-black shadow-sm'
                                                      : 'border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-800'
                                                    }`}
                                                  title={
                                                    rfq.status === 'awarded'
                                                      ? (rfq.awardedVendorId === vendor.vendorId ? 'תיאום מועד ביצוע עם הקבלן הזוכה' : 'שיחה עם הקבלן ב-WhatsApp')
                                                      : 'פתח שיחה עם הקבלן ב-WhatsApp לבירור פרטי ההצעה'
                                                  }
                                                >
                                                  <MessageCircle size={13} className={rfq.status === 'awarded' && rfq.awardedVendorId === vendor.vendorId ? 'text-emerald-700' : 'text-emerald-600'} />
                                                  <span>
                                                    {rfq.status === 'awarded'
                                                      ? (rfq.awardedVendorId === vendor.vendorId ? 'תיאום ביצוע עם הזוכה 📲' : 'שיחה עם הקבלן 💬')
                                                      : 'שיחה לבירור ההצעה 💬'}
                                                  </span>
                                                </a>

                                                {/* If awarded to this vendor: Quick access to Contract / Work Order */}
                                                {rfq.status === 'awarded' && rfq.awardedVendorId === vendor.vendorId && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleOpenContractModal(rfq, quote)}
                                                    className="px-2.5 py-1.5 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                                                    title="צפה בהסכם העבודה ובהזמנת העבודה החתומה (להדפסה / PDF)"
                                                  >
                                                    <FileCheck2 size={13} className="text-blue-600" />
                                                    <span>הסכם עבודה חתום 📄</span>
                                                  </button>
                                                )}
                                              </div>

                                              {/* Award button if quote exists and not yet awarded */}
                                              {rfq.status === 'open' && (
                                                <button
                                                  type="button"
                                                  disabled={actionLoadingId === quote.id}
                                                  onClick={() => handleOpenAwardModal(rfq, quote)}
                                                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                                                >
                                                  {actionLoadingId === quote.id ? (
                                                    <Loader2 size={13} className="animate-spin" />
                                                  ) : (
                                                    <Trophy size={13} />
                                                  )}
                                                  <span>בחר כהצעה זוכה 🏆</span>
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          /* Pending State: Clean info with automated WhatsApp resend & link copy */
                                          <div className="p-3 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 flex items-center justify-between text-xs gap-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                              {(vendor as any).whatsappSent ? (
                                                <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                  <CheckCircle2 size={12} className="text-emerald-600" />
                                                  שוגר ב-WhatsApp
                                                </span>
                                              ) : (
                                                <span className="text-amber-700 font-bold flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                  טרם שוגר ב-WhatsApp
                                                </span>
                                              )}
                                              <span className="text-slate-500 font-medium hidden sm:inline">
                                                ממתין להצעת מחיר
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                disabled={dispatchingVendorId === `${rfq.id}-${vendor.vendorId}`}
                                                onClick={() => handleResendWhatsApp(rfq, vendor)}
                                                className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                                title="שגר תבנית WhatsApp רשמית לקבלן"
                                              >
                                                {dispatchingVendorId === `${rfq.id}-${vendor.vendorId}` ? (
                                                  <Loader2 size={12} className="animate-spin text-blue-600" />
                                                ) : (
                                                  <Send size={12} />
                                                )}
                                                <span>שלח ב-WhatsApp</span>
                                              </button>

                                              <a
                                                href={buildVendorWhatsAppUrl(rfq, vendor)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                title="פתח שיחה ישירה ב-WhatsApp (ידני)"
                                              >
                                                <MessageCircle size={15} />
                                              </a>

                                              <button
                                                type="button"
                                                onClick={() => handleCopyContractorLink(rfq.id, vendor.vendorId, vendor.tokenHash)}
                                                className="text-slate-400 hover:text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0 px-2 py-1 rounded hover:bg-white"
                                                title="העתק קישור ישיר להגשה (למקרה שהקבלן מבקש שוב)"
                                              >
                                                {copiedTokenId === `${rfq.id}-${vendor.vendorId}` ? (
                                                  <>
                                                    <Check size={13} className="text-emerald-600 stroke-[3]" />
                                                    <span className="text-emerald-700">הועתק!</span>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Copy size={13} />
                                                    <span>העתק קישור</span>
                                                  </>
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Bottom RFQ controls */}
                              <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-200">
                                <span>נוצר על ידי {rfq.createdBy?.name || 'ועד הבית'} ב-{new Date(rfq.createdAt).toLocaleDateString('he-IL')}</span>

                                <div className="flex items-center gap-2">
                                  {rfq.status === 'draft' ? (
                                    <div className="flex items-center gap-3">
                                      <Link
                                        to={`/admin/${tenantId}/quotes/new?draftId=${rfq.id}`}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        <FileEdit size={13} />
                                        <span>המשך עריכת טיוטה</span>
                                      </Link>
                                      <span className="text-slate-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => setDraftToDelete(rfq)}
                                        className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        <Trash2 size={13} />
                                        <span>מחק טיוטה לצמיתות</span>
                                      </button>
                                    </div>
                                  ) : isRfqOpen(rfq) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStatusConfirmModal(rfq, 'cancelled')}
                                      className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                                    >
                                      סגור וסיים בקשה זו
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStatusConfirmModal(rfq, 'open')}
                                      className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                                    >
                                      פתח מחדש לקבלת הצעות
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Award Winner Confirmation Modal (QA-105 & QA-106) */}
      {awardModalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-right animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                  <Trophy size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">אישור הצעה זוכה והודעה לקבלן</h3>
                  <p className="text-xs text-slate-500 font-medium">עריכת נוסח ההודעה וסנכרון סטטוס הקריאה</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAwardModalData(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Winning Vendor Summary Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">קבלן נבחר:</span>
                <span className="font-black text-slate-900 text-sm">
                  {awardModalData.submission.vendorName} ({awardModalData.submission.vendorType === 'retainer' ? 'ריטיינר 🏢' : 'מזדמן 🛠️'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">מחיר שנקבע:</span>
                <span className="font-black text-emerald-700 text-base">
                  ₪{awardModalData.submission.price.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {awardModalData.submission.priceIncludesVat ? '(כולל מע"מ)' : '(+ מע"מ)'}
                  </span>
                </span>
              </div>
              {awardModalData.submission.estimatedDuration && (
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">משך ביצוע משוער:</span>
                  <span className="font-extrabold text-slate-800">{awardModalData.submission.estimatedDuration}</span>
                </div>
              )}
              {awardModalData.rfq.ticketNumber && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="font-bold text-slate-500">קריאה מקושרת:</span>
                  <span className="font-bold text-blue-600">
                    #{awardModalData.rfq.ticketNumber} • {awardModalData.rfq.title}
                  </span>
                </div>
              )}
            </div>

            {/* Checkbox to update linked ticket status (QA-106) */}
            {awardModalData.rfq.ticketId && (
              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-blue-50/70 border border-blue-200 cursor-pointer text-xs font-bold text-blue-900 select-none">
                <input
                  type="checkbox"
                  checked={awardModalData.updateTicketStatus}
                  onChange={e => setAwardModalData(prev => prev ? { ...prev, updateTicketStatus: e.target.checked } : null)}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                <span>
                  סנכרן סטטוס קריאה #{awardModalData.rfq.ticketNumber || ''} ל-"בטיפול" (אם היא פתוחה) ושייך את הקבלן
                </span>
              </label>
            )}

            {/* Decision Reasoning Selection (Phase 5) */}
            <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span>נימוק בחירת הקבלן (לפרוטוקול ולתיעוד הדיירים):</span>
                </label>
                <span className="text-[10px] text-slate-400 font-bold">נשמר ב-Audit Log</span>
              </div>

              {!awardModalData.isLowestPrice && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-bold flex items-start gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    שים לב: קיימת הצעה נמוכה יותר (₪{awardModalData.minPrice.toLocaleString()}).
                    נא לבחור נימוק מקצועי לתיעוד הבחירה לשקיפות מלאה מול הדיירים.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                {AWARD_REASON_PRESETS.map(preset => {
                  const isSelected = awardModalData.awardReason === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAwardModalData(prev => prev ? { ...prev, awardReason: preset } : null)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-black'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              {awardModalData.awardReason === 'אחר...' && (
                <input
                  type="text"
                  required
                  placeholder="פרט את נימוק הבחירה (לדוגמה: המלצות ועד קודם / מומחיות ספציפית)..."
                  value={awardModalData.customReasonText}
                  onChange={e => setAwardModalData(prev => prev ? { ...prev, customReasonText: e.target.value } : null)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>

            {/* Editable Textarea for WhatsApp message (QA-105) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800">
                  נוסח הודעת וואטסאפ לקבלן (ניתן לעריכה אישית):
                </label>
                <span className="text-[10px] text-slate-400">יישלח ישירות לוואטסאפ</span>
              </div>
              <textarea
                rows={6}
                value={awardModalData.message}
                onChange={e => setAwardModalData(prev => prev ? { ...prev, message: e.target.value } : null)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-sans resize-none"
                dir="rtl"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                disabled={actionLoadingId === awardModalData.submission.id}
                onClick={() => handleConfirmAward(true)}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoadingId === awardModalData.submission.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                <span>אישור ושליחת וואטסאפ לקבלן 💬</span>
              </button>
              <button
                type="button"
                disabled={actionLoadingId === awardModalData.submission.id}
                onClick={() => handleConfirmAward(false)}
                className="w-full sm:w-auto py-3 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                אישור במערכת בלבד
              </button>
              <button
                type="button"
                onClick={() => setAwardModalData(null)}
                className="w-full sm:w-auto py-3 px-3 rounded-xl text-slate-400 hover:text-slate-600 font-bold text-xs transition-colors cursor-pointer"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Comparison Matrix Modal (QA-110) */}
      {comparisonModalRfq && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600 text-white rounded-xl">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">{comparisonModalRfq.title}</h3>
                    {comparisonModalRfq.ticketNumber && (
                      <span className="text-xs font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        קריאה #{comparisonModalRfq.ticketNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    תחום: <span className="font-bold text-slate-700">{comparisonModalRfq.category}</span> • השוואה מרוכזת של כל ההצעות שהתקבלו
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setComparisonModalRfq(null)}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Description & Location */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
                <div className="font-extrabold text-slate-800">תיאור העבודה:</div>
                <div className="text-slate-600 leading-relaxed font-medium whitespace-pre-line break-words">{comparisonModalRfq.description}</div>
                {comparisonModalRfq.location && (
                  <div className="text-slate-500 pt-1 font-bold">מיקום מדויק: {comparisonModalRfq.location}</div>
                )}
              </div>

              {/* Awarded Winner & Committee Reasoning Banner (in Modal) */}
              {(comparisonModalRfq.status === 'awarded' || comparisonModalRfq.awardedVendorId) && (
                <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-2xl flex items-start gap-3 shadow-xs text-right">
                  <div className="p-2.5 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
                    <Trophy size={20} />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-emerald-900 bg-emerald-200/80 px-2.5 py-0.5 rounded-md border border-emerald-300/60">
                          הצעה זוכה • החלטת ועד הבית
                        </span>
                        <span className="text-xs font-extrabold text-slate-800">
                          הקבלן שנבחר: <strong className="text-emerald-950 font-black">{comparisonModalRfq.awardedVendorName || 'קבלן זוכה'}</strong>
                          {comparisonModalRfq.awardedPrice && ` (₪${comparisonModalRfq.awardedPrice.toLocaleString()})`}
                        </span>
                      </div>
                      {(comparisonModalRfq.awardReasoning?.awardedAt || comparisonModalRfq.awardedAt) && (
                        <span className="text-[11px] text-slate-500 font-bold">
                          תאריך אישור: {new Date(comparisonModalRfq.awardReasoning?.awardedAt || comparisonModalRfq.awardedAt || '').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {comparisonModalRfq.awardReasoning ? (
                      <div className="text-xs text-slate-800 pt-0.5">
                        <span className="text-emerald-950 font-black">נימוק בחירת הקבלן לפרוטוקול: </span>
                        <span className="text-slate-900 font-bold">{comparisonModalRfq.awardReasoning.reasonType}</span>
                        {comparisonModalRfq.awardReasoning.note && (
                          <span className="text-slate-700 font-medium mr-1.5 bg-white px-2 py-0.5 rounded border border-emerald-200 inline-block">
                            "{comparisonModalRfq.awardReasoning.note}"
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        לא תועד נימוק מפורט לבחירה זו
                      </div>
                    )}

                    {comparisonModalRfq.awardReasoning?.awardedBy && (
                      <div className="text-[11px] text-slate-500 font-medium">
                        נרשם ואושר ע"י: {comparisonModalRfq.awardReasoning.awardedBy}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Submissions Matrix Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {comparisonModalRfq.dispatchedVendors?.map(vendor => {
                  const subs = submissionsByRfq[comparisonModalRfq.id] || [];
                  const quote = subs.find(s => s.vendorId === vendor.vendorId);
                  const isWinner = comparisonModalRfq.awardedVendorId === vendor.vendorId;

                  return (
                    <div
                      key={vendor.vendorId}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${isWinner
                          ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-300'
                          : quote
                            ? 'bg-white border-blue-200 shadow-sm'
                            : 'bg-slate-50/60 border-slate-200 opacity-80'
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900">{vendor.vendorName}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${vendor.vendorType === 'retainer'
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                              {vendor.vendorType === 'retainer' ? 'ריטיינר 🏢' : 'מזדמן 🛠️'}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500" dir="ltr">{vendor.phone}</span>
                        </div>

                        {isWinner ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center gap-1 shadow-sm">
                              <Trophy size={13} />
                              <span>הצעה זוכה</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenContractModal(comparisonModalRfq, quote)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                              title="צפה והדפס הסכם עבודה מחייב"
                            >
                              <FileCheck2 size={13} />
                              <span>הפק הסכם עבודה 📄</span>
                            </button>
                          </div>
                        ) : quote ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                            הוגשה הצעה ✓
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
                            ממתין למענה
                          </span>
                        )}
                      </div>

                      {quote ? (
                        <div className="space-y-2.5 text-xs">
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-slate-500 font-bold">מחיר מוצע:</span>
                              <span className="text-lg font-black text-slate-900">
                                ₪{quote.price.toLocaleString()}
                                <span className="text-[10px] text-slate-400 font-normal mr-1">
                                  {quote.priceIncludesVat ? '(כולל מע"מ)' : '+ מע"מ'}
                                </span>
                              </span>
                            </div>
                            {quote.estimatedDuration && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 font-bold">משך ביצוע:</span>
                                <span className="font-extrabold text-slate-800">{quote.estimatedDuration}</span>
                              </div>
                            )}
                            {quote.notes && (
                              <div className="pt-1 text-slate-600 italic border-t border-slate-200/60 whitespace-pre-line break-words">
                                "{quote.notes}"
                              </div>
                            )}
                            {quote.quoteDocumentUrl && (
                              <a
                                href={quote.quoteDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline pt-1"
                              >
                                <Paperclip size={12} />
                                <span>צפה במסמך שצורף</span>
                              </a>
                            )}
                          </div>

                          {/* Award Reasoning on Winner in Modal */}
                          {isWinner && comparisonModalRfq.awardReasoning && (
                            <div className="p-2.5 bg-emerald-100/70 border border-emerald-300 rounded-xl text-xs space-y-0.5 text-right">
                              <div className="font-black text-emerald-950 flex items-center gap-1">
                                <CheckCircle2 size={13} className="text-emerald-700 shrink-0" />
                                <span>נימוק הבחירה: {comparisonModalRfq.awardReasoning.reasonType}</span>
                              </div>
                              {comparisonModalRfq.awardReasoning.note && (
                                <div className="text-emerald-900 font-medium text-[11px] pr-4 italic">
                                  "{comparisonModalRfq.awardReasoning.note}"
                                </div>
                              )}
                            </div>
                          )}

                          {comparisonModalRfq.status === 'open' && !isWinner && (
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenAwardModal(comparisonModalRfq, quote);
                              }}
                              className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <Trophy size={14} />
                              <span>בחר כהצעה זוכה 🏆</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-white/60 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 font-medium text-center">
                          טרם הוגשה הצעה מקבלן זה
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 flex justify-end bg-slate-50">
              <button
                type="button"
                onClick={() => setComparisonModalRfq(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                סגור תצוגה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RFQ Status Confirmation Modal (Replaces browser confirm) */}
      {statusConfirmModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${statusConfirmModal.newStatus === 'cancelled'
                    ? 'bg-red-50 text-red-600 border border-red-100'
                    : 'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>
                  {statusConfirmModal.newStatus === 'cancelled' ? (
                    <AlertTriangle size={24} />
                  ) : (
                    <RotateCcw size={24} />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {statusConfirmModal.newStatus === 'cancelled'
                      ? 'סגירת בקשת הצעת מחיר'
                      : 'פתיחה מחדש של בקשת הצעת מחיר'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {statusConfirmModal.newStatus === 'cancelled'
                      ? 'אישור סיום וסגירת התהליך'
                      : 'חידוש קבלת הצעות מקבלנים'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatusConfirmModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* RFQ Summary Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs">
              <div className="font-extrabold text-slate-800 text-sm">
                {statusConfirmModal.rfq.title}
              </div>
              <div className="flex items-center justify-between text-slate-500 font-medium">
                <span>תחום: <strong className="text-slate-700">{statusConfirmModal.rfq.category}</strong></span>
                {statusConfirmModal.rfq.ticketNumber && (
                  <span className="font-bold text-blue-600">קריאה #{statusConfirmModal.rfq.ticketNumber}</span>
                )}
              </div>
            </div>

            {/* Explanation Warning */}
            <div className="text-xs text-slate-600 leading-relaxed font-medium">
              {statusConfirmModal.newStatus === 'cancelled' ? (
                <p>
                  האם ברצונך לסגור ולבטל בקשה זו?
                  <br />
                  לאחר הסגירה, הבקשה תעבור ללשונית <strong>"הצעות סגורות"</strong> וקבלנים לא יוכלו להגיש הצעות חדשות דרך הקישור הישיר.
                </p>
              ) : (
                <p>
                  האם ברצונך לפתוח מחדש בקשה זו?
                  <br />
                  הבקשה תחזור להיות פעילה, וקבלנים יוכלו שוב להגיש הצעות מחיר דרך הקישור.
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStatusConfirmModal(null)}
                disabled={statusChanging}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                disabled={statusChanging}
                className={`px-5 py-2.5 rounded-xl text-xs font-black text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 ${statusConfirmModal.newStatus === 'cancelled'
                    ? 'bg-red-600 hover:bg-red-700 active:scale-95'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  }`}
              >
                {statusChanging ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                <span>
                  {statusConfirmModal.newStatus === 'cancelled'
                    ? 'סגור וסיים בקשה זו'
                    : 'פתח מחדש לקבלת הצעות'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Work Order / Contract Generator Modal (Phase 5) */}
      {contractModalData && (
        <WorkOrderContractModal
          isOpen={Boolean(contractModalData)}
          onClose={() => setContractModalData(null)}
          rfq={contractModalData.rfq}
          submission={contractModalData.submission}
          tenantInfo={tenantInfo}
          currentAdminName={adminProfile?.fullName || user?.displayName || user?.email || undefined}
          currentAdminPhone={adminProfile?.mobile || user?.phoneNumber || undefined}
        />
      )}

      {/* Delete Draft Confirmation Modal */}
      {draftToDelete && (
        <ConfirmModal
          isOpen={Boolean(draftToDelete)}
          onClose={() => !isDeletingDraft && setDraftToDelete(null)}
          onConfirm={handleDeleteDraft}
          title="מחיקת טיוטת מכרז"
          message={`האם אתה בטוח שברצונך למחוק את טיוטת המכרז "${draftToDelete.title}"? הטופס והנתונים שהוזנו יימחקו לצמיתות ולא ניתן יהיה לשחזרם.`}
          confirmLabel={isDeletingDraft ? "מוחק..." : "כן, מחק טיוטה"}
          cancelLabel="ביטול"
          type="danger"
        />
      )}
    </div>
  );
}
