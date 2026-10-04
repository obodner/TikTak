import { useRef, useState, useEffect } from 'react';
import {
  X,
  Printer,
  MessageCircle,
  FileCheck2,
  Building2,
  ShieldCheck,
  Clock,
  MapPin,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Truck,
  PenTool,
  CheckCircle2
} from 'lucide-react';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { WorkQuoteRequest, VendorQuoteSubmission, ContractExecutionData } from '../../types/rfq';
import { normalizePhone } from '../../utils/whatsapp';
import { numberToHebrewWords } from '../../utils/hebrewNumberWords';
import { logAction } from '../../utils/auditLogger';
import SignaturePadModal from '../common/SignaturePadModal';

export interface ContractPaymentMilestone {
  id: string;
  stageName: string;
  description: string;
  percentage: number;
  amount: number;
  condition: string;
}

export interface ContractCustomClause {
  id: string;
  title: string;
  content: string;
}

interface WorkOrderContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  rfq: WorkQuoteRequest;
  submission: VendorQuoteSubmission;
  tenantInfo?: {
    name: string;
    type: string;
    address?: string;
    logoUrl?: string;
    vaadPhone?: string;
  } | null;
  currentAdminName?: string;
  currentAdminPhone?: string;
  isReadOnly?: boolean;
  onContractSigned?: (updatedExecution: ContractExecutionData) => void;
  onContractorSignClick?: () => void;
}

export default function WorkOrderContractModal({
  isOpen,
  onClose,
  rfq,
  submission,
  tenantInfo,
  currentAdminName,
  currentAdminPhone,
  isReadOnly = false,
  onContractSigned,
  onContractorSignClick
}: WorkOrderContractModalProps) {
  const [contractExecution, setContractExecution] = useState<ContractExecutionData | undefined>(
    rfq.contractExecution
  );
  const [showAdminSignatureModal, setShowAdminSignatureModal] = useState(false);

  // If signed by admin or fully signed, terms are locked from further editing
  const isTermsLocked = Boolean(contractExecution?.status === 'signed_by_admin' || contractExecution?.status === 'fully_signed');
  const isContractorOrReadOnly = Boolean(isReadOnly || !auth.currentUser || isTermsLocked);
  const printRef = useRef<HTMLDivElement>(null);
  const [customerLogo, setCustomerLogo] = useState<string | null>(tenantInfo?.logoUrl || null);
  const [adminPhone, setAdminPhone] = useState<string>(rfq.createdBy?.phone || currentAdminPhone || '');
  const [resolvedContactName, setResolvedContactName] = useState<string>(
    rfq.createdBy?.name || currentAdminName || ''
  );
  const [contractorCompanyId, setContractorCompanyId] = useState<string>(
    contractExecution?.vendorSignature?.companyId ||
    submission.companyId ||
    rfq.dispatchedVendors?.find(v => v.vendorId === submission.vendorId)?.companyId ||
    ''
  );

  // Keep contractExecution in sync if rfq updates
  useEffect(() => {
    if (rfq.contractExecution) {
      setContractExecution(rfq.contractExecution);
      if (rfq.contractExecution.vendorSignature?.companyId) {
        setContractorCompanyId(rfq.contractExecution.vendorSignature.companyId);
      }
    }
  }, [rfq.contractExecution]);

  // Format phone display nicely (e.g. 052-8376101)
  const formatDisplayPhone = (p?: string) => {
    if (!p) return '';
    const digits = p.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('05')) {
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    return p;
  };

  useEffect(() => {
    if (tenantInfo?.logoUrl) {
      setCustomerLogo(tenantInfo.logoUrl);
      return;
    }
    const tid = rfq.tenantId;
    if (!tid) return;
    getDoc(doc(db, "tenants", tid)).then(snap => {
      if (snap.exists() && snap.data()?.logoUrl) {
        setCustomerLogo(snap.data()!.logoUrl);
      }
    }).catch(err => console.warn('Could not load tenant logo:', err));
  }, [tenantInfo?.logoUrl, rfq.tenantId]);

  // Primary resolution for the ordering contact's phone and name from adminUsers
  useEffect(() => {
    const tid = rfq.tenantId;
    if (!tid) return;

    let isMounted = true;

    async function resolveContact() {
      // 1. If RFQ already contains createdBy.phone, set it immediately
      if (rfq.createdBy?.phone && isMounted) {
        setAdminPhone(rfq.createdBy.phone);
      }

      const creatorUid = rfq.createdBy?.uid;
      const contactEmail = (rfq.createdBy?.email || auth.currentUser?.email || '').trim().toLowerCase();
      const rawContactName = (currentAdminName || rfq.createdBy?.name || '').trim();

      // 2. Query adminUsers collection (the authoritative source for committee / admin phone numbers)
      try {
        const adminsSnap = await getDocs(collection(db, "tenants", tid, "adminUsers"));
        let matchedDoc: any = null;

        // Match priority A: by creatorUid
        if (creatorUid && creatorUid !== 'admin') {
          matchedDoc = adminsSnap.docs.find(d => d.id === creatorUid);
        }

        // Match priority B: by current logged-in admin UID
        if (!matchedDoc && auth.currentUser?.uid) {
          matchedDoc = adminsSnap.docs.find(d => d.id === auth.currentUser?.uid);
        }

        // Match priority C: by email
        if (!matchedDoc && contactEmail) {
          matchedDoc = adminsSnap.docs.find(d => (d.data()?.email || '').trim().toLowerCase() === contactEmail);
        }

        // Match priority D: by full name or first name
        if (!matchedDoc && rawContactName && !rawContactName.includes('@') && rawContactName !== 'נציגות הבית' && rawContactName !== 'ועד הבית') {
          matchedDoc = adminsSnap.docs.find(d => {
            const data = d.data();
            const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            return fullName === rawContactName || data.firstName === rawContactName;
          });
        }

        // Match priority E: If only 1 admin user exists in the building, that admin IS the contact person!
        if (!matchedDoc && adminsSnap.docs.length === 1) {
          matchedDoc = adminsSnap.docs[0];
        }

        if (matchedDoc) {
          const data = matchedDoc.data();
          const phone = data?.mobile || data?.phone;
          const fullName = `${data?.firstName || ''} ${data?.lastName || ''}`.trim();

          if (phone && isMounted) {
            setAdminPhone(phone);
          }
          if (fullName && isMounted) {
            setResolvedContactName(fullName);
          }

          // If rfq didn't have createdBy.phone saved yet, persist it on the RFQ document
          if (phone && !rfq.createdBy?.phone && auth.currentUser) {
            updateDoc(doc(db, "tenants", tid, "rfqs", rfq.id), {
              "createdBy.phone": phone,
              ...(fullName ? { "createdBy.name": fullName } : {})
            }).catch(() => { });
          }

          if (phone) return;
        }
      } catch (e) {
        console.warn('Error querying adminUsers for contact:', e);
      }

      // 3. Fallback: currentAdminPhone prop if provided
      if (currentAdminPhone && isMounted) {
        setAdminPhone(currentAdminPhone);
        return;
      }

      // 4. Fallback: Firebase Auth currentUser phoneNumber
      if (auth.currentUser?.phoneNumber && isMounted) {
        setAdminPhone(auth.currentUser.phoneNumber);
        return;
      }

      // 5. Fallback: reporters collection (if ticket reporter was used)
      if (rawContactName) {
        try {
          const reportersSnap = await getDocs(collection(db, "tenants", tid, "reporters"));
          for (const rDoc of reportersSnap.docs) {
            const rData = rDoc.data();
            const rName = (rData.name || '').trim();
            if (rName && (rName === rawContactName || rName.includes(rawContactName) || rawContactName.includes(rName))) {
              const phone = rData.phone || rDoc.id;
              if (phone && isMounted) {
                setAdminPhone(phone);
                return;
              }
            }
          }
        } catch (e) {
          console.warn('Error querying reporters for contact:', e);
        }
      }

      // 6. Fallback: tenant vaadPhone
      try {
        const tenantSnap = await getDoc(doc(db, "tenants", tid));
        if (tenantSnap.exists()) {
          const tData = tenantSnap.data();
          const phone = tData.vaadPhone || tData.phone || tData.contactPhone;
          if (phone && isMounted) {
            setAdminPhone(phone);
            return;
          }
        }
      } catch (e) {
        console.warn('Error fetching tenant vaadPhone:', e);
      }

      if (tenantInfo?.vaadPhone && isMounted) {
        setAdminPhone(tenantInfo.vaadPhone);
      }
    }

    resolveContact();

    return () => {
      isMounted = false;
    };
  }, [rfq.tenantId, rfq.id, rfq.createdBy?.uid, rfq.createdBy?.name, rfq.createdBy?.email, rfq.createdBy?.phone, currentAdminName, currentAdminPhone, tenantInfo?.vaadPhone]);

  useEffect(() => {
    if (contractorCompanyId) return;
    const tid = rfq.tenantId;
    const vId = submission.vendorId;
    if (!tid || !vId) return;

    let isMounted = true;
    getDoc(doc(db, "tenants", tid, "vendors", vId)).then(snap => {
      if (snap.exists() && isMounted) {
        const data = snap.data();
        if (data?.companyId) {
          setContractorCompanyId(data.companyId);
        }
      }
    }).catch(err => console.warn('Could not load vendor companyId:', err));

    return () => {
      isMounted = false;
    };
  }, [rfq.tenantId, submission.vendorId, contractorCompanyId]);

  if (!isOpen) return null;

  // Resolve Customer Type Label
  const getCustomerTypeLabel = (type?: string, name?: string) => {
    const rawType = (type || '').toLowerCase();
    const rawName = (name || '').toLowerCase();

    if (
      rawName.includes('ועד מקומי') ||
      rawName.includes('יישוב') ||
      rawName.includes('קיבוץ') ||
      rawName.includes('מושב') ||
      rawType === 'municipality' ||
      rawType === 'settlement'
    ) {
      return 'ועד מקומי / מזכירות היישוב';
    }
    if (rawType === 'commercial') {
      return 'הנהלת המבנה / הנהלת המתחם';
    }
    if (rawType === 'building' || !rawType) {
      return 'נציגות הבית המשותף (ועד הבית)';
    }
    return type || 'נציגות הבית המשותף (ועד הבית)';
  };

  const customerTypeLabel = getCustomerTypeLabel(tenantInfo?.type || rfq.tenantType, tenantInfo?.name || rfq.tenantName);
  const siteName = tenantInfo?.name || rfq.tenantName || 'ועד הבית';
  const siteAddress = tenantInfo?.address || '';
  const adminName = resolvedContactName || currentAdminName || rfq.createdBy?.name || 'נציגות הבית';

  // Financial calculations
  const price = submission.price || rfq.awardedPrice || 0;
  const isVatIncluded = submission.priceIncludesVat;
  const basePrice = isVatIncluded ? Math.round(price / 1.18) : price;
  const vatAmount = isVatIncluded ? price - basePrice : Math.round(price * 0.18);
  const totalWithVat = isVatIncluded ? price : basePrice + vatAmount;

  // Execution dates (DD-MM-YYYY format, e.g. 27-09-2026)
  const formatDateDMY = (dateInput?: string | Date) => {
    if (!dateInput) return '';
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const todayFormatted = formatDateDMY(new Date());
  const awardedDateFormatted = rfq.awardedAt ? formatDateDMY(rfq.awardedAt) : todayFormatted;

  const isSettlementTenant =
    (tenantInfo?.type || rfq.tenantType)?.toLowerCase() === 'municipality' ||
    (tenantInfo?.type || rfq.tenantType)?.toLowerCase() === 'settlement' ||
    (tenantInfo?.type || rfq.tenantType)?.toLowerCase() === 'community' ||
    (tenantInfo?.name || rfq.tenantName || '').includes('יישוב') ||
    (tenantInfo?.name || rfq.tenantName || '').includes('ועד מקומי');

  // Waste Clause Presets
  const WASTE_PRESETS = {
    construction: {
      id: 'construction',
      label: 'פסולת בניין והריסה (אתר מורשה חיצוני בלבד)',
      text: `הקבלן מתחייב לפנות את כל פסולת הבנייה, ההריסה, שקי המלט ושאריות החומרים אך ורק לאתר הטמנה/מיחזור מורשה כדין מחוץ לגבולות ${isSettlementTenant ? 'היישוב' : 'הבניין'}. חל איסור מוחלט על השלכת פסולת בניין לפחי האשפה של ${isSettlementTenant ? 'היישוב' : 'הבניין'} או בשטחים הציבוריים. כל קנס או הוצאה שייגרמו בגין השלכה שלא כדין יחולו על הקבלן במלואם.`
    },
    garden: {
      id: 'garden',
      label: isSettlementTenant ? 'גזם וגינון (נקודת איסוף מורשית ביישוב)' : 'גזם וגינון (נקודת איסוף מורשית בבניין)',
      text: `הקבלן מתחייב לרכז ולפנות את כל הגזם וענפי הגינון אך ורק אל נקודת הריכוז המורשית לפי הנחיות ${isSettlementTenant ? 'מזכירות היישוב' : 'נציגות הבניין'}, ולהשאיר את כל השטח והשבילים נקיים ומסודרים בסיום כל יום עבודה.`
    },
    general: {
      id: 'general',
      label: 'אחזקה ואירועים (החזרת המקום נקי ומסודר לפחים מורשים)',
      text: 'בסיום כל יום עבודה ועם מסירת האתר, מתחייב הקבלן להחזיר את המקום נקי, מסודר ופנוי מכל ציוד, לכלוך או שאריות חומרים, ולפנות את האשפה לפחים המיועדים לכך בלבד.'
    },
    custom: {
      id: 'custom',
      label: 'נוסח מותאם אישית',
      text: ''
    }
  };

  // Customization drawer & tab states
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<'payments' | 'schedule' | 'waste' | 'clauses'>('payments');

  // Work dates & schedule (from RFQ, contractCustomizations, or agreed with contractor)
  const [workStartDate, setWorkStartDate] = useState<string>(
    rfq.contractCustomizations?.workStartDate ?? (rfq.workStartDate || '')
  );
  const [workEndDate, setWorkEndDate] = useState<string>(
    rfq.contractCustomizations?.workEndDate ?? (rfq.workTargetEndDate || '')
  );

  // Scope of work (editable in case contractor & admin agreed on modifications)
  const [contractScopeText, setContractScopeText] = useState<string>(
    rfq.contractCustomizations?.scopeText ?? (rfq.description || '')
  );

  // Custom agreement clauses added between contractor and admin pre-signature
  const [customClauses, setCustomClauses] = useState<ContractCustomClause[]>(
    rfq.contractCustomizations?.customClauses ?? []
  );

  const handleAddCustomClause = () => {
    setCustomClauses(prev => [
      ...prev,
      {
        id: `clause-${Date.now()}`,
        title: `סעיף ${5 + prev.length}: תנאי מיוחד / הסכמה נוספת`,
        content: ''
      }
    ]);
  };

  const handleUpdateCustomClause = (id: string, field: 'title' | 'content', value: string) => {
    setCustomClauses(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleRemoveCustomClause = (id: string) => {
    setCustomClauses(prev => prev.filter(c => c.id !== id));
  };

  // Payment configuration (initialized from RFQ or contractCustomizations if set)
  const [paymentMode, setPaymentMode] = useState<'milestones' | 'single'>(
    rfq.contractCustomizations?.paymentMode ?? (rfq.paymentTerms?.mode || 'milestones')
  );
  const [singlePaymentTerm, setSinglePaymentTerm] = useState(
    rfq.contractCustomizations?.singlePaymentTerm ?? (rfq.paymentTerms?.singleTermText || 'שוטף + 30 יום מגמר העבודה ומסירת האתר')
  );

  const initialMilestones: ContractPaymentMilestone[] =
    rfq.contractCustomizations?.milestones && rfq.contractCustomizations.milestones.length > 0
      ? rfq.contractCustomizations.milestones
      : rfq.paymentTerms?.phases && rfq.paymentTerms.phases.length > 0
        ? rfq.paymentTerms.phases.map((p, idx) => ({
            id: `m-${idx + 1}`,
            stageName: p.stageName,
            description: p.description || '',
            percentage: p.percentage,
            amount: Math.round((totalWithVat * (p.percentage || 0)) / 100),
            condition: 'לאחר בדיקת נציג המזמין ואישורו בכתב'
          }))
        : [
            {
              id: 'm-1',
              stageName: 'שלב 1 - גמר הריסות ופינוי',
              description: 'בסיום מלא של עבודות ההריסה ופינוי פסולת מהאתר',
              percentage: 30,
              amount: Math.round(totalWithVat * 0.3),
              condition: 'לאחר בדיקת נציג המזמין ואישורו בכתב'
            },
            {
              id: 'm-2',
              stageName: 'שלב 2 - גמר עבודות הבינוי',
              description: 'בסיום עבודות הבינוי, התשתיות וההתקנות לפי המפרט',
              percentage: 40,
              amount: Math.round(totalWithVat * 0.4),
              condition: 'לאחר בדיקת נציג המזמין ואישורו בכתב'
            },
            {
              id: 'm-3',
              stageName: 'שלב 3 - מסירת האתר ובדיקת שביעות רצון',
              description: 'בגמר כל העבודות, השלמת תיקונים ומסירת המקום נקי ומסודר',
              percentage: 30,
              amount: totalWithVat - Math.round(totalWithVat * 0.3) - Math.round(totalWithVat * 0.4),
              condition: 'בכפוף למסירה סופית, בדיקת שביעות רצון מלאה וקבלת חשבונית מס'
            }
          ];

  // Initial payment milestones
  const [milestones, setMilestones] = useState<ContractPaymentMilestone[]>(initialMilestones);

  // Synchronize milestone amounts whenever totalWithVat updates
  useEffect(() => {
    if (totalWithVat > 0) {
      setMilestones(prev => {
        let runningSum = 0;
        return prev.map((m, idx) => {
          if (idx === prev.length - 1) {
            const lastAmt = Math.max(0, totalWithVat - runningSum);
            return { ...m, amount: lastAmt };
          }
          const amt = Math.round((totalWithVat * (Number(m.percentage) || 0)) / 100);
          runningSum += amt;
          return { ...m, amount: amt };
        });
      });
    }
  }, [totalWithVat]);

  // Waste clause state
  const [wastePresetKey, setWastePresetKey] = useState<string>(
    rfq.contractCustomizations?.wasteClauseText ? 'custom' : rfq.wasteClause ? 'custom' : 'construction'
  );
  const [wasteClauseText, setWasteClauseText] = useState<string>(
    rfq.contractCustomizations?.wasteClauseText ?? (rfq.wasteClause || WASTE_PRESETS.construction.text)
  );

  // Persistence handler for contract customizations
  const [isSavingCustomizations, setIsSavingCustomizations] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);

  const handleSaveContractCustomizations = async () => {
    if (isContractorOrReadOnly || !rfq.tenantId || !rfq.id) return;
    setIsSavingCustomizations(true);
    try {
      const dataToSave = {
        contractCustomizations: {
          scopeText: contractScopeText,
          workStartDate,
          workEndDate,
          customClauses,
          paymentMode,
          singlePaymentTerm,
          milestones,
          wasteClauseText,
          updatedAt: new Date().toISOString()
        }
      };
      await updateDoc(doc(db, "tenants", rfq.tenantId, "rfqs", rfq.id), dataToSave);
      setSaveSuccessMessage(true);
      setTimeout(() => setSaveSuccessMessage(false), 3000);
    } catch (err) {
      console.error('Failed to save contract customizations:', err);
      alert('שגיאה בשמירת השינויים בהסכם');
    } finally {
      setIsSavingCustomizations(false);
    }
  };

  // Handler for Admin / Committee Online Digital Signature
  const handleSignByAdmin = async (signatureDataUrl: string, signerName: string, extraData?: { signerPhone?: string }) => {
    if (!rfq.tenantId || !rfq.id) return;
    try {
      const signedAt = new Date().toISOString();
      const committeeSignatureObj: any = {
        signerName,
        signerRole: customerTypeLabel || 'נציגות ועד הבית',
        signatureDataUrl,
        signedAt
      };
      if (extraData?.signerPhone || adminPhone) {
        committeeSignatureObj.signerPhone = (extraData?.signerPhone || adminPhone).trim();
      }
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        committeeSignatureObj.userAgent = navigator.userAgent;
      }

      const updatedExecution: any = {
        status: 'signed_by_admin',
        contractVersion: (contractExecution?.contractVersion || 0) + 1,
        committeeSignature: committeeSignatureObj
      };
      if (contractExecution?.vendorSignature) {
        updatedExecution.vendorSignature = contractExecution.vendorSignature;
      }

      // Also ensure contract customizations are persisted alongside the signature
      const updatePayload: any = {
        contractExecution: updatedExecution,
        contractCustomizations: {
          scopeText: contractScopeText || '',
          customClauses: customClauses || [],
          paymentMode,
          singlePaymentTerm: singlePaymentTerm || '',
          milestones: milestones || [],
          wasteClauseText: wasteClauseText || '',
          updatedAt: signedAt
        }
      };

      if (workStartDate) updatePayload.contractCustomizations.workStartDate = workStartDate;
      if (workEndDate) updatePayload.contractCustomizations.workEndDate = workEndDate;

      await updateDoc(doc(db, "tenants", rfq.tenantId, "rfqs", rfq.id), updatePayload);
      setContractExecution(updatedExecution as ContractExecutionData);
      setShowAdminSignatureModal(false);
      if (onContractSigned) {
        onContractSigned(updatedExecution as ContractExecutionData);
      }

      // Audit log event
      await logAction({
        tenantId: rfq.tenantId,
        action: 'CONTRACT_SIGNED_BY_ADMIN',
        actor: {
          uid: auth.currentUser?.uid || 'admin',
          name: signerName || resolvedContactName || 'נציג ועד הבית',
          type: 'admin'
        },
        details: {
          rfqId: rfq.id,
          rfqTitle: rfq.title,
          winningVendorName: submission.vendorName,
          winningPrice: totalWithVat,
          paymentMode,
          milestonesCount: milestones.length
        }
      });
    } catch (err) {
      console.error('Error signing contract by admin:', err);
      alert('אירעה שגיאה בשמירת החתימה הדיגיטלית. אנא נסה שוב.');
    }
  };

  // Additional clauses & working hours (from sample contract or RFQ)
  const [includeSiteInspection, setIncludeSiteInspection] = useState<boolean>(true);
  const [siteInspectionText, setSiteInspectionText] = useState<string>(
    'הקבלן מצהיר ומאשר כי ביקר באתר העבודה, בדק את המקום, דרכי הגישה, תשתיות האתר ותנאי השטח, ומצא אותם מתאימים לחלוטין לביצוע העבודה. הקבלן מוותר על כל טענה בגין אי-התאמה, קשיי גישה או דרישה לתוספת תשלום מסיבה זו.'
  );

  const [includeEmployerWaiver, setIncludeEmployerWaiver] = useState<boolean>(true);
  const [employerWaiverText, setEmployerWaiverText] = useState<string>(
    'מוצהר ומוסכם במפורש כי היחסים בין המזמין לבין הקבלן הינם יחסי מזמין וקבלן עצמאי בלבד. אין ולא ייווצרו בין הצדדים, עובדיהם או מי מטעמם כל יחסי עובד ומעביד לכל דבר ועניין.'
  );

  const [allowedWorkHours, setAllowedWorkHours] = useState<string>(
    rfq.allowedWorkHours || 'בימים א\'-ה\' בין השעות 08:00 - 17:00, ובימי ו\' וערבי חג עד השעה 13:00'
  );

  // Recalculate milestone amounts helper
  const recalculateAmounts = (list: ContractPaymentMilestone[], currentTotal: number) => {
    let runningSum = 0;
    return list.map((m, idx) => {
      if (idx === list.length - 1) {
        const lastAmt = Math.max(0, currentTotal - runningSum);
        return { ...m, amount: lastAmt };
      }
      const amt = Math.round((currentTotal * (Number(m.percentage) || 0)) / 100);
      runningSum += amt;
      return { ...m, amount: amt };
    });
  };

  const handleUpdateMilestone = (index: number, field: keyof ContractPaymentMilestone, value: any) => {
    setMilestones(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'percentage') {
        return recalculateAmounts(updated, totalWithVat);
      }
      return updated;
    });
  };

  const handleAddMilestone = () => {
    setMilestones(prev => {
      const currentPercentSum = prev.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0);
      const remainingPercent = Math.max(0, 100 - currentPercentSum);
      const newStageNum = prev.length + 1;
      const newMilestone: ContractPaymentMilestone = {
        id: `m-${Date.now()}`,
        stageName: `שלב ${newStageNum}`,
        description: 'לפי התקדמות ביצוע העבודה',
        percentage: remainingPercent > 0 ? remainingPercent : 10,
        amount: Math.round((totalWithVat * (remainingPercent > 0 ? remainingPercent : 10)) / 100),
        condition: 'לאחר אישור נציג המזמין'
      };
      return recalculateAmounts([...prev, newMilestone], totalWithVat);
    });
  };

  const handleRemoveMilestone = (index: number) => {
    if (milestones.length <= 1) return;
    setMilestones(prev => {
      const updated = prev.filter((_, idx) => idx !== index);
      return recalculateAmounts(updated, totalWithVat);
    });
  };

  const applyMilestonePreset = (preset: 'demolition-3' | 'equal-3' | 'two-stage' | 'four-stage') => {
    if (preset === 'demolition-3') {
      setMilestones([
        {
          id: `m-${Date.now()}-1`,
          stageName: 'שלב 1 - גמר הריסות ופינוי',
          description: 'בסיום מלא של עבודות ההריסה ופינוי פסולת מהאתר',
          percentage: 30,
          amount: Math.round(totalWithVat * 0.3),
          condition: 'לאחר בדיקת נציג המזמין ואישורו בכתב'
        },
        {
          id: `m-${Date.now()}-2`,
          stageName: 'שלב 2 - גמר עבודות הבינוי',
          description: 'בסיום עבודות הבינוי, התשתיות וההתקנות לפי המפרט',
          percentage: 40,
          amount: Math.round(totalWithVat * 0.4),
          condition: 'לאחר בדיקת נציג המזמין ואישורו בכתב'
        },
        {
          id: `m-${Date.now()}-3`,
          stageName: 'שלב 3 - מסירת האתר ובדיקת שביעות רצון',
          description: 'בגמר כל העבודות, השלמת תיקונים ומסירת המקום נקי ומסודר',
          percentage: 30,
          amount: totalWithVat - Math.round(totalWithVat * 0.3) - Math.round(totalWithVat * 0.4),
          condition: 'בכפוף למסירה סופית, בדיקת שביעות רצון מלאה וקבלת חשבונית מס'
        }
      ]);
    } else if (preset === 'equal-3') {
      setMilestones([
        {
          id: `m-${Date.now()}-1`,
          stageName: 'שלב 1 - תחילת עבודה והתארגנות',
          description: 'עם הגעת הציוד והתחלת העבודה בפועל',
          percentage: 33,
          amount: Math.round(totalWithVat * 0.33),
          condition: 'באישור נציג המזמין'
        },
        {
          id: `m-${Date.now()}-2`,
          stageName: 'שלב 2 - אמצע ביצוע (50% התקדמות)',
          description: 'בהשלמת מחצית מעבודות הפרויקט',
          percentage: 33,
          amount: Math.round(totalWithVat * 0.33),
          condition: 'באישור נציג המזמין'
        },
        {
          id: `m-${Date.now()}-3`,
          stageName: 'שלב 3 - גמר ומסירה סופית',
          description: 'בגמר מלא של כל העבודות ושביעות רצון',
          percentage: 34,
          amount: totalWithVat - Math.round(totalWithVat * 0.33) * 2,
          condition: 'בכפוף למסירה סופית וחשבונית מס כחוק'
        }
      ]);
    } else if (preset === 'two-stage') {
      setMilestones([
        {
          id: `m-${Date.now()}-1`,
          stageName: 'שלב 1 - מקדמה / תחילת עבודה',
          description: 'עם פריסת הציוד ותחילת העבודה באתר',
          percentage: 50,
          amount: Math.round(totalWithVat * 0.5),
          condition: 'באישור נציג המזמין'
        },
        {
          id: `m-${Date.now()}-2`,
          stageName: 'שלב 2 - גמר ביצוע ומסירת האתר',
          description: 'בסיום מלא של כל העבודות ומסירה לשביעות רצון',
          percentage: 50,
          amount: totalWithVat - Math.round(totalWithVat * 0.5),
          condition: 'בכפוף למסירה סופית וחשבונית מס כדין'
        }
      ]);
    } else if (preset === 'four-stage') {
      setMilestones([
        {
          id: `m-${Date.now()}-1`,
          stageName: 'שלב 1 - מקדמה והתארגנות באתר',
          description: 'הבאת חומרים והתחלת ביצוע',
          percentage: 25,
          amount: Math.round(totalWithVat * 0.25),
          condition: 'באישור נציג המזמין'
        },
        {
          id: `m-${Date.now()}-2`,
          stageName: 'שלב 2 - גמר שלב א\' (תשתיות והריסות)',
          description: 'סיום עבודות ההכנה והתשתיות',
          percentage: 25,
          amount: Math.round(totalWithVat * 0.25),
          condition: 'באישור נציג המזמין'
        },
        {
          id: `m-${Date.now()}-3`,
          stageName: 'שלב 3 - גמר שלב ב\' (בינוי והרכבות)',
          description: 'התקנת הרכיבים והשלמת המבנה',
          percentage: 25,
          amount: Math.round(totalWithVat * 0.25),
          condition: 'באישור נציג המזמין'
        },
        {
          id: `m-${Date.now()}-4`,
          stageName: 'שלב 4 - מסירה סופית ובדיקת שביעות רצון',
          description: 'בגמר מלא של כל העבודות, נקיון ומסירה',
          percentage: 25,
          amount: totalWithVat - Math.round(totalWithVat * 0.25) * 3,
          condition: 'בכפוף למסירה סופית וחשבונית מס כדין'
        }
      ]);
    }
  };

  const totalMilestonesPercentage = milestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0);
  const totalMilestonesAmount = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  // Trigger isolated iframe print to completely avoid multi-page duplication and overlap
  const handlePrint = () => {
    const content = document.getElementById('printable-contract');
    if (!content) {
      window.print();
      return;
    }

    // Create an invisible iframe for isolated printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc) {
      window.print();
      return;
    }

    // Build standalone HTML with precise A4 styles and avoid-break containers
    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
        <head>
          <meta charset="utf-8">
          <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
          <title>הסכם התקשרות והזמנת עבודה - RFQ-${rfq.id.slice(0, 8).toUpperCase()}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 12mm 15mm 12mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #0f172a;
              background: #ffffff;
              margin: 0 !important;
              padding: 0 !important;
              font-size: 12px;
              line-height: 1.45;
              direction: rtl;
            }
            #printable-contract {
              margin: 0 !important;
              padding: 0 !important;
            }
            .space-y-6 > * + * { margin-top: 14px; }
            .space-y-4 > * + * { margin-top: 10px; }
            .space-y-2 > * + * { margin-top: 6px; }
            .space-y-1\\.5 > * + * { margin-top: 4px; }
            .space-y-0\\.5 > * + * { margin-top: 2px; }
            .border-b-2 { border-bottom: 2px solid #0f172a; }
            .border-t-2 { border-top: 2px solid #cbd5e1; }
            .border-b { border-bottom: 1px solid #e2e8f0; }
            .border-t { border-top: 1px solid #e2e8f0; }
            .border-l { border-left: 1px solid #e2e8f0; }
            .border { border: 1px solid #cbd5e1; }
            .rounded-2xl { border-radius: 12px; }
            .rounded-xl { border-radius: 10px; }
            .rounded-lg { border-radius: 8px; }
            .rounded-full { border-radius: 9999px; }
            .p-4 { padding: 12px 14px; }
            .p-3 { padding: 10px 12px; }
            .p-2 { padding: 8px; }
            .pt-4 { padding-top: 12px; }
            .pt-3 { padding-top: 8px; }
            .pt-2 { padding-top: 6px; }
            .pt-1 { padding-top: 4px; }
            .pb-4 { padding-bottom: 12px; }
            .pb-3 { padding-bottom: 8px; }
            .bg-slate-50 { background-color: #f8fafc; }
            .bg-slate-100 { background-color: #f1f5f9; }
            .bg-slate-200 { background-color: #e2e8f0; }
            .bg-white { background-color: #ffffff; }
            .bg-blue-50\\/60 { background-color: #eff6ff; }
            .bg-emerald-50\\/80 { background-color: #ecfdf5; }
            .bg-slate-900 { background-color: #0f172a; }
            .text-blue-600 { color: #2563eb; }
            .text-emerald-600 { color: #059669; }
            .text-emerald-700 { color: #047857; }
            .text-emerald-800 { color: #065f46; }
            .text-emerald-950 { color: #022c22; }
            .text-slate-900 { color: #0f172a; }
            .text-slate-800 { color: #1e293b; }
            .text-slate-700 { color: #334155; }
            .text-slate-600 { color: #475569; }
            .text-slate-500 { color: #64748b; }
            .text-slate-400 { color: #94a3b8; }
            .font-black { font-weight: 900; }
            .font-extrabold { font-weight: 800; }
            .font-bold { font-weight: 700; }
            .font-medium { font-weight: 500; }
            .text-xl { font-size: 18px; }
            .text-lg { font-size: 15px; }
            .text-sm { font-size: 13px; }
            .text-xs { font-size: 11px; }
            .text-\\[10px\\] { font-size: 10px; }
            .text-\\[11px\\] { font-size: 11px; }
            .grid { display: grid; }
            .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .gap-4 { gap: 12px; }
            .gap-2 { gap: 8px; }
            .gap-8 { gap: 24px; }
            .flex { display: flex; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .justify-between { justify-content: space-between; }
            .justify-center { justify-content: center; }
            .shrink-0 { flex-shrink: 0; }
            .whitespace-pre-line { white-space: pre-line; }
            .leading-relaxed { line-height: 1.5; }
            .leading-normal { line-height: 1.4; }
            .tracking-tight { letter-spacing: -0.025em; }
            .tracking-wider { letter-spacing: 0.05em; }
            .uppercase { text-transform: uppercase; }
            .text-left { text-align: left; }
            .text-center { text-align: center; }
            .italic { font-style: italic; }
            .block { display: block; }
            
            /* Table & Milestones styling */
            .milestone-table {
              width: 100% !important;
              border-collapse: collapse !important;
              margin-top: 6px !important;
              margin-bottom: 6px !important;
            }
            .milestone-table th {
              background-color: #f1f5f9 !important;
              color: #0f172a !important;
              font-weight: 700 !important;
              padding: 5px 8px !important;
              border: 1px solid #cbd5e1 !important;
              font-size: 11px !important;
              text-align: right !important;
            }
            .milestone-table td {
              padding: 5px 8px !important;
              border: 1px solid #e2e8f0 !important;
              font-size: 11px !important;
              vertical-align: top !important;
            }
            .milestone-table tfoot td {
              background-color: #f8fafc !important;
              font-weight: 800 !important;
              border-top: 2px solid #94a3b8 !important;
            }
            .milestone-table tr {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            /* Prevent multi-page overlap and ensure natural page breaks */
            .contract-border, .grid, .border, .rounded-xl, .rounded-2xl, .parties-grid, .financial-grid, .space-y-2, .space-y-6, .audit-vault-block, .signatures-block {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .parties-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 12px !important;
            }
            .parties-client {
              border-left: 1px solid #e2e8f0 !important;
              border-bottom: none !important;
              padding-left: 12px !important;
              padding-bottom: 0 !important;
            }
            .financial-grid {
              display: grid !important;
              grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
              gap: 8px !important;
            }
            .contract-watermark-container {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              width: 100% !important;
              height: 100% !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              pointer-events: none !important;
              z-index: 0 !important;
            }
            .contract-watermark-logo {
              max-width: 460px !important;
              max-height: 460px !important;
              width: 60% !important;
              object-fit: contain !important;
              opacity: 0.08 !important;
              filter: grayscale(100%) contrast(115%) !important;
              pointer-events: none !important;
            }
            .relative { position: relative !important; }
            .z-10 { z-index: 10 !important; }
            .contract-customer-logo {
              height: 52px !important;
              max-height: 52px !important;
              max-width: 156px !important;
              width: auto !important;
              object-fit: contain !important;
              flex-shrink: 0 !important;
            }
            .contract-tiktak-logo {
              height: 30px !important;
              max-height: 30px !important;
              width: auto !important;
              object-fit: contain !important;
              flex-shrink: 0 !important;
            }
            .contract-header-divider {
              height: 34px !important;
              width: 1px !important;
              background-color: #cbd5e1 !important;
              flex-shrink: 0 !important;
              margin: 0 4px !important;
            }
            .gap-5 { gap: 20px !important; }
            .gap-6 { gap: 24px !important; }
            .whitespace-nowrap { white-space: nowrap !important; }
          </style>
        </head>
        <body>
          ${content.outerHTML}
        </body>
      </html>
    `);
    frameDoc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3000);
    }, 350);
  };

  // Build WhatsApp share URL for contractor including digital contract link
  const handleSendWhatsApp = () => {
    const rawPhone =
      submission.vendorPhone ||
      rfq.dispatchedVendors?.find(v => v.vendorId === submission.vendorId)?.phone ||
      '';
    const cleanPhone = normalizePhone(rawPhone);

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tiktak2026.web.app';
    const contractPortalUrl = `${origin}/quote/${rfq.id}?tid=${rfq.tenantId}&v=${submission.vendorId}${submission.tokenHash ? `&t=${submission.tokenHash}` : ''}&view=contract`;

    const paymentNote =
      paymentMode === 'milestones'
        ? ` (ב-${milestones.length} שלבי ביצוע לפי אבני דרך)`
        : '';

    const isCommitteeSigned = contractExecution?.status === 'signed_by_admin';
    const isFullySigned = contractExecution?.status === 'fully_signed';

    let actionPrompt = `\n📄 לצפייה בהסכם המלא, בהזמנת העבודה ולהורדת ה-PDF:\n${contractPortalUrl}\n\n`;
    if (isCommitteeSigned) {
      actionPrompt = 
        `\n✍️ *הסכם העבודה נחתם דיגיטלית ע״י הנהלת ${siteName}!*` +
        `\nלחתימתך הדיגיטלית המאשרת את תנאי העבודה והתשלום:\n${contractPortalUrl}\n\n`;
    } else if (isFullySigned) {
      actionPrompt = 
        `\n✅ *הסכם העבודה חתום במלואו ע״י שני הצדדים ומחייב כדין.*` +
        `\nלצפייה ולהורדת עותק חתום:\n${contractPortalUrl}\n\n`;
    }

    const message =
      `שלום ${submission.vendorName},\n` +
      `בהמשך לאישור הצעת המחיר שלך למכרז *#RFQ-${rfq.id.slice(0, 8).toUpperCase()}* (${rfq.title}),\n` +
      `מצורפים עיקרי הסכם העבודה והזמנת העבודה המחייבת:\n\n` +
      `📍 אתר ביצוע: ${siteName}${siteAddress ? ` (${siteAddress})` : ''}\n` +
      `💰 סה"כ תמורה מוסכמת: ₪${totalWithVat.toLocaleString()} (כולל מע"מ)${paymentNote}\n` +
      `⏱️ משך ביצוע מוסכם: ${submission.estimatedDuration || 'לפי תיאום'}\n` +
      (submission.notes ? `🛡️ תנאי אחריות: ${submission.notes}\n` : '') +
      actionPrompt +
      `נא לתאם מועד תחילת עבודה מול ${adminName}${adminPhone ? ` (${formatDisplayPhone(adminPhone)})` : ''}.\n` +
      `בברכה,\n${customerTypeLabel} - ${siteName}`;

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="contract-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="contract-modal-content bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-right"
        dir="rtl"
      >
        {/* Top Header - Not visible on print */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
              <FileCheck2 size={22} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2 flex-wrap">
                <span>הסכם התקשרות והזמנת עבודה מחייבת</span>
                {contractExecution?.status === 'fully_signed' ? (
                  <span className="text-xs bg-emerald-600 text-white font-extrabold px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    <span>הסכם חתום ומחייב כדין ✓</span>
                  </span>
                ) : contractExecution?.status === 'signed_by_admin' ? (
                  <span className="text-xs bg-blue-100 text-blue-900 font-extrabold px-2.5 py-0.5 rounded-full border border-blue-300 flex items-center gap-1">
                    <PenTool size={12} className="text-blue-600" />
                    <span>נחתם ע״י הוועד • ממתין לחתימת הקבלן</span>
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    הצעה מאושרת (טיוטת הסכם)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {contractExecution?.status === 'fully_signed'
                  ? 'ההסכם נחתם דיגיטלית ע״י נציגות המזמין והקבלן המבצע • מאובטח בכספת המשפטית ל-7 שנים'
                  : contractExecution?.status === 'signed_by_admin'
                  ? 'נציגות המזמין חתמה על ההסכם • תנאי ההסכם נעולים • קישור לחתימה נשלח לקבלן'
                  : isContractorOrReadOnly
                  ? 'הסכם עבודה והזמנה מחייבת שאושרה ע״י המזמין • להדפסה ולתיעוד'
                  : 'הופק אוטומטית מנתוני המכרז • מסמך משפטי תקני להדפסה ולחתימה'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="הדפס או שמור כ-PDF"
            >
              <Printer size={15} />
              <span>הדפסה / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Lock Banner when terms are locked */}
        {isTermsLocked && !isReadOnly && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-900 font-medium flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-bold">🔒 תנאי ההסכם נעולים לעריכה:</span>
              <span>
                {contractExecution?.status === 'fully_signed'
                  ? 'ההסכם נחתם סופית ע״י שני הצדדים ולא ניתן לשינוי.'
                  : 'נציגות הוועד חתמה על ההסכם. התנאים נעולים כדי להבטיח את אמינות המסמך לחתימת הקבלן.'}
              </span>
            </div>
            {contractExecution?.committeeSignature?.signedAt && (
              <span className="text-[11px] text-blue-700 font-bold">
                נחתם בתאריך: {formatDateDMY(contractExecution.committeeSignature.signedAt)}
              </span>
            )}
          </div>
        )}

        {/* Customization Bar & Drawer - Visible only for Admin, hidden in Read-Only / Contractor View */}
        {!isContractorOrReadOnly && (
          <div className="border-b border-slate-200 bg-slate-100/80 no-print transition-all">
          <div className="px-6 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsCustomizeOpen(prev => !prev)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <SlidersHorizontal size={14} className="text-blue-600" />
                <span>התאמת סעיפי ההסכם (שלבי תשלום, פינוי פסולת, שעות)</span>
                {isCustomizeOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {/* Status pills */}
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold border border-blue-200">
                {paymentMode === 'milestones' ? `פריסה ל-${milestones.length} שלבים` : 'תשלום יחיד'}
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200 truncate max-w-[220px]">
                פינוי: {wastePresetKey === 'construction' ? 'פסולת בניין מוסדרת' : wastePresetKey === 'garden' ? 'גזם' : wastePresetKey === 'general' ? 'ניקיון כללי' : 'מותאם אישית'}
              </span>
            </div>

            {isCustomizeOpen && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCustomizeTab('payments')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      customizeTab === 'payments' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    💰 שלבי תשלום
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomizeTab('schedule')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      customizeTab === 'schedule' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    📅 מועדים ועבודה
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomizeTab('waste')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      customizeTab === 'waste' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    🚛 פינוי פסולת
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomizeTab('clauses')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      customizeTab === 'clauses' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    ⚖️ סעיפים מותאמים {customClauses.length > 0 ? `(${customClauses.length})` : ''}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveContractCustomizations}
                  disabled={isSavingCustomizations}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                  title="שמור שינויים אלו בהסכם העבודה של המכרז"
                >
                  {isSavingCustomizations ? (
                    <span>שומר...</span>
                  ) : saveSuccessMessage ? (
                    <span>נשמר בהצלחה! ✓</span>
                  ) : (
                    <span>💾 שמור שינויים בחוזה</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Drawer Body */}
          {isCustomizeOpen && (
            <div className="px-6 py-4 border-t border-slate-200 bg-white space-y-4 max-h-[380px] overflow-y-auto">
              {/* Tab 1: Payments & Milestones */}
              {customizeTab === 'payments' && (
                <div className="space-y-4">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-6 border-b border-slate-200 pb-3">
                    <span className="text-xs font-black text-slate-800">אופן פריסת התשלום:</span>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="contractPaymentMode"
                        checked={paymentMode === 'milestones'}
                        onChange={() => setPaymentMode('milestones')}
                        className="accent-blue-600"
                      />
                      <span>שלבי ביצוע / אבני דרך</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="contractPaymentMode"
                        checked={paymentMode === 'single'}
                        onChange={() => setPaymentMode('single')}
                        className="accent-blue-600"
                      />
                      <span>תשלום יחיד בגמר העבודה</span>
                    </label>
                  </div>

                  {paymentMode === 'milestones' ? (
                    <div className="space-y-3">
                      {/* Quick Presets */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-slate-500 font-bold">תבניות מהירות:</span>
                        <button
                          type="button"
                          onClick={() => applyMilestonePreset('demolition-3')}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          3 שלבים: הריסה (30%) / בינוי (40%) / מסירה (30%)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyMilestonePreset('equal-3')}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          3 שלבים שווים (33% / 33% / 34%)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyMilestonePreset('two-stage')}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          2 שלבים: מקדמה (50%) / מסירה (50%)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyMilestonePreset('four-stage')}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          4 שלבים שווים (25% כל שלב)
                        </button>
                      </div>

                      {/* Milestones List */}
                      <div className="space-y-2">
                        {milestones.map((m, idx) => (
                          <div key={m.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                value={m.stageName}
                                onChange={(e) => handleUpdateMilestone(idx, 'stageName', e.target.value)}
                                placeholder="שם השלב (לדוגמה: שלב 1 - גמר הריסות ופינוי)"
                                className="flex-1 px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-blue-500"
                              />
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs text-slate-500">שיעור:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={m.percentage}
                                  onChange={(e) => handleUpdateMilestone(idx, 'percentage', Number(e.target.value))}
                                  className="w-16 px-2 py-1.5 text-xs font-bold text-center bg-white border border-slate-300 rounded-lg focus:outline-blue-500"
                                />
                                <span className="text-xs font-bold text-slate-700">%</span>
                              </div>
                              <div className="w-28 text-left font-black text-xs text-slate-800 shrink-0" dir="ltr">
                                ₪{m.amount.toLocaleString()}
                              </div>
                              {milestones.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMilestone(idx)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                  title="מחק שלב זה"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-0.5">תיאור מהות השלב:</label>
                                <input
                                  type="text"
                                  value={m.description}
                                  onChange={(e) => handleUpdateMilestone(idx, 'description', e.target.value)}
                                  placeholder="בסיום מלא של עבודות ההריסה..."
                                  className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-blue-500"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block mb-0.5">תנאי שחרור התשלום:</label>
                                <input
                                  type="text"
                                  value={m.condition}
                                  onChange={(e) => handleUpdateMilestone(idx, 'condition', e.target.value)}
                                  placeholder="לאחר בדיקת נציג המזמין ואישורו בכתב"
                                  className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Footer Controls */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={handleAddMilestone}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>הוסף שלב תשלום נוסף</span>
                        </button>

                        <div className="flex items-center gap-3 text-xs">
                          <span className={`font-bold ${totalMilestonesPercentage === 100 ? 'text-emerald-700' : 'text-amber-600'}`}>
                            סה"כ אחוזים: {totalMilestonesPercentage}% {totalMilestonesPercentage === 100 ? '✓' : '(מומלץ להשלים ל-100%)'}
                          </span>
                          <span className="text-slate-400">|</span>
                          <span className="font-extrabold text-slate-900" dir="ltr">
                            סה"כ: ₪{totalMilestonesAmount.toLocaleString()} מתוך ₪{totalWithVat.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">נוסח תנאי תשלום יחיד:</label>
                      <input
                        type="text"
                        value={singlePaymentTerm}
                        onChange={(e) => setSinglePaymentTerm(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-blue-500"
                        placeholder="לדוגמה: שוטף + 30 יום מגמר העבודה ומסירת האתר"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Waste & Cleanliness */}
              {customizeTab === 'waste' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-700">
                    הנחיות פינוי פסולת וניקיון ({isSettlementTenant ? 'מדיניות היישוב' : 'מדיניות הבניין'}):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(WASTE_PRESETS).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setWastePresetKey(preset.id);
                          if (preset.id !== 'custom') {
                            setWasteClauseText(preset.text);
                          }
                        }}
                        className={`p-2.5 text-right rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          wastePresetKey === preset.id
                            ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">נוסח סעיף פינוי הפסולת בהסכם (עריכה חופשית):</label>
                    <textarea
                      rows={3}
                      value={wasteClauseText}
                      onChange={(e) => {
                        setWasteClauseText(e.target.value);
                        setWastePresetKey('custom');
                      }}
                      className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 leading-relaxed focus:outline-blue-500"
                      placeholder="רשום כאן הנחיות ספציפיות לפינוי פסולת, מקום המכולה וכיוצ״ב..."
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Schedule & Hours */}
              {customizeTab === 'schedule' && (
                <div className="space-y-4">
                  <div className="text-xs font-bold text-slate-700">הגדרת מועדי תחילת וסיום עבודה מוסכמים מול הקבלן:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">תאריך תחילת עבודה מוסכם:</label>
                      <input
                        type="date"
                        value={workStartDate}
                        onChange={(e) => setWorkStartDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">תאריך סיום ומסירת האתר:</label>
                      <input
                        type="date"
                        value={workEndDate}
                        onChange={(e) => setWorkEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-blue-500"
                      />
                    </div>
                  </div>
                  <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                    💡 <strong>הערה:</strong> במידה ותשאיר את התאריכים ריקים, החוזה יציין אוטומטית כי העבודה תחל בתיאום מראש תוך לא יאוחר מ-3 ימי עסקים ממועד החתימה, ומשך הביצוע יהיה לפי התחייבות הקבלן ({submission.estimatedDuration || 'לפי תיאום'}).
                  </div>
                  <div className="space-y-1 pt-1 border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-700 block">שעות עבודה והרעשה מותרות באתר הבניין / היישוב:</label>
                    <input
                      type="text"
                      value={allowedWorkHours}
                      onChange={(e) => setAllowedWorkHours(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-blue-500"
                      placeholder="בימים א'-ה' בין השעות 08:00 - 17:00, ובימי ו' עד 13:00"
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Waste & Cleanliness */}
              {customizeTab === 'waste' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-700">
                    הנחיות פינוי פסולת וניקיון ({isSettlementTenant ? 'מדיניות היישוב' : 'מדיניות הבניין'}):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(WASTE_PRESETS).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setWastePresetKey(preset.id);
                          if (preset.id !== 'custom') {
                            setWasteClauseText(preset.text);
                          }
                        }}
                        className={`p-2.5 text-right rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          wastePresetKey === preset.id
                            ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-xs'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">נוסח סעיף פינוי הפסולת בהסכם (עריכה חופשית):</label>
                    <textarea
                      rows={3}
                      value={wasteClauseText}
                      onChange={(e) => {
                        setWasteClauseText(e.target.value);
                        setWastePresetKey('custom');
                      }}
                      className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 leading-relaxed focus:outline-blue-500"
                      placeholder="רשום כאן הנחיות ספציפיות לפינוי פסולת, מקום המכולה וכיוצ״ב..."
                    />
                  </div>
                </div>
              )}

              {/* Tab 4: Clauses & Custom Agreements */}
              {customizeTab === 'clauses' && (
                <div className="space-y-4">
                  {/* Scope description editor */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">עריכת תיאור מהות העבודה והמפרט (אם הוסכם על שינוי מול הקבלן):</label>
                    <textarea
                      rows={2}
                      value={contractScopeText}
                      onChange={(e) => setContractScopeText(e.target.value)}
                      className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 leading-relaxed focus:outline-blue-500"
                      placeholder="תיאור העבודה לפי המפרט..."
                    />
                  </div>

                  {/* Site Inspection Clause */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSiteInspection}
                        onChange={(e) => setIncludeSiteInspection(e.target.checked)}
                        className="accent-blue-600 rounded"
                      />
                      <span>כלול סעיף בדיקת המקום ודרכי הגישה ע"י הקבלן מראש</span>
                    </label>
                    {includeSiteInspection && (
                      <textarea
                        rows={2}
                        value={siteInspectionText}
                        onChange={(e) => setSiteInspectionText(e.target.value)}
                        className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-blue-500 leading-relaxed"
                      />
                    )}
                  </div>

                  {/* Employer Waiver */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeEmployerWaiver}
                        onChange={(e) => setIncludeEmployerWaiver(e.target.checked)}
                        className="accent-blue-600 rounded"
                      />
                      <span>כלול הגנה משפטית: היעדר יחסי עובד-מעביד (מעמד קבלן עצמאי)</span>
                    </label>
                    {includeEmployerWaiver && (
                      <textarea
                        rows={2}
                        value={employerWaiverText}
                        onChange={(e) => setEmployerWaiverText(e.target.value)}
                        className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-blue-500 leading-relaxed"
                      />
                    )}
                  </div>

                  {/* Custom Clauses Agreed With Contractor */}
                  <div className="pt-2 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <span>סעיפים מותאמים אישית / הסכמות נוספות שסוכמו מול הקבלן:</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleAddCustomClause}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>הוסף סעיף מותאם אישית</span>
                      </button>
                    </div>

                    {customClauses.length === 0 ? (
                      <div className="p-3 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50">
                        <p className="text-[11px] text-slate-500">
                          לא נוספו סעיפים מיוחדים. אם שוחחת עם הקבלן וסיכמתם על תנאי נוסף (למשל: שימוש במעלית משא, אספקת חומרים, הסדרי חניה), לחץ על "הוסף סעיף מותאם אישית".
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customClauses.map((clause, idx) => (
                          <div key={clause.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={clause.title}
                                onChange={(e) => handleUpdateCustomClause(clause.id, 'title', e.target.value)}
                                placeholder={`סעיף ${5 + idx}: כותרת הסעיף (לדוגמה: שימוש בחשמל ומים של הבניין)`}
                                className="flex-1 px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:outline-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomClause(clause.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
                                title="מחק סעיף"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={clause.content}
                              onChange={(e) => handleUpdateCustomClause(clause.id, 'content', e.target.value)}
                              placeholder="רשום כאן את נוסח הסעיף וההסכמה כפי שסוכמה בין הצדדים..."
                              className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-blue-500 leading-relaxed"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Printable Contract Body */}
        <div ref={printRef} className="p-4 sm:p-6 md:p-8 overflow-y-auto space-y-6 text-slate-800 print:p-0 print:space-y-4">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 15mm 12mm 15mm 12mm;
              }
              body {
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
              .contract-modal-backdrop {
                position: static !important;
                background: none !important;
                padding: 0 !important;
                margin: 0 !important;
                display: block !important;
                overflow: visible !important;
                height: auto !important;
                max-height: none !important;
              }
              .contract-modal-content {
                position: static !important;
                box-shadow: none !important;
                border: none !important;
                max-height: none !important;
                overflow: visible !important;
                width: 100% !important;
                max-width: 100% !important;
              }
              #printable-contract {
                position: static !important;
                width: 100% !important;
                box-sizing: border-box !important;
                padding: 0 !important;
                margin: 0 !important;
                color: black !important;
                background: white !important;
              }
              #printable-contract * {
                color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
              }
              .contract-border, .grid, .border, .rounded-xl, .rounded-2xl, .parties-grid, .financial-grid, .space-y-2, .space-y-6, .audit-vault-block, .signatures-block {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .milestone-table {
                width: 100% !important;
                border-collapse: collapse !important;
                margin-top: 6px !important;
                margin-bottom: 6px !important;
              }
              .milestone-table th {
                background-color: #f1f5f9 !important;
                color: #0f172a !important;
                font-weight: 700 !important;
                padding: 5px 8px !important;
                border: 1px solid #cbd5e1 !important;
                font-size: 11px !important;
                text-align: right !important;
              }
              .milestone-table td {
                padding: 5px 8px !important;
                border: 1px solid #e2e8f0 !important;
                font-size: 11px !important;
                vertical-align: top !important;
              }
              .milestone-table tfoot td {
                background-color: #f8fafc !important;
                font-weight: 800 !important;
                border-top: 2px solid #94a3b8 !important;
              }
              .milestone-table tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .parties-grid {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 1rem !important;
              }
              .contract-customer-logo {
                height: 52px !important;
                max-height: 52px !important;
                max-width: 156px !important;
                width: auto !important;
                object-fit: contain !important;
                flex-shrink: 0 !important;
              }
              .contract-tiktak-logo {
                height: 30px !important;
                max-height: 30px !important;
                width: auto !important;
                object-fit: contain !important;
                flex-shrink: 0 !important;
              }
              .contract-header-divider {
                height: 34px !important;
                width: 1px !important;
                background-color: #cbd5e1 !important;
                flex-shrink: 0 !important;
                margin: 0 4px !important;
              }
              .parties-client {
                border-left: 1px solid #e2e8f0 !important;
                border-bottom: none !important;
                padding-left: 0.75rem !important;
                padding-bottom: 0 !important;
              }
              .financial-grid {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                gap: 0.5rem !important;
              }
              .contract-watermark-container {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                pointer-events: none !important;
                z-index: 0 !important;
              }
              .contract-watermark-logo {
                max-width: 460px !important;
                max-height: 460px !important;
                width: 60% !important;
                object-fit: contain !important;
                opacity: 0.08 !important;
                filter: grayscale(100%) contrast(115%) !important;
                pointer-events: none !important;
              }
            }
          `}</style>

          <div id="printable-contract" className="relative space-y-6">
            {/* Background Watermark on every page */}
            {customerLogo && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden contract-watermark-container" aria-hidden="true">
                <img
                  src={customerLogo}
                  alt=""
                  className="max-w-[460px] max-h-[460px] w-3/5 object-contain opacity-[0.08] grayscale contrast-125 contract-watermark-logo pointer-events-none"
                />
              </div>
            )}

            <div className="relative z-10 space-y-6">
              {/* Document Header */}
              <div className="border-b-2 border-slate-900 pb-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-5 min-w-0 flex-1">
                  <div className="flex items-center justify-between sm:justify-start gap-3 shrink-0">
                    <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                      {customerLogo && (
                        <>
                          <img
                            src={customerLogo}
                            alt={siteName}
                            className="contract-customer-logo shrink-0"
                            style={{ height: '42px', maxHeight: '52px', maxWidth: '130px', objectFit: 'contain' }}
                          />
                          <div className="contract-header-divider shrink-0" />
                        </>
                      )}
                      <img
                        src="/logo_transparent.png"
                        alt="TikTak"
                        className="contract-tiktak-logo shrink-0"
                        style={{ height: '26px', maxHeight: '30px', width: 'auto', objectFit: 'contain' }}
                      />
                    </div>
                    {/* Mobile Ref box */}
                    <div className="text-left text-[11px] space-y-0.5 shrink-0 sm:hidden" dir="ltr">
                      <div className="font-extrabold text-slate-900">Ref: RFQ-{rfq.id.slice(0, 8).toUpperCase()}</div>
                      {rfq.ticketNumber && <div className="text-blue-600 font-bold">Ticket #{rfq.ticketNumber}</div>}
                      <div className="text-slate-400 text-[10px]">{todayFormatted}</div>
                    </div>
                  </div>

                  <div className="contract-header-divider shrink-0 hidden sm:block" />

                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h1 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                      הזמנת עבודה והסכם התקשרות מחייב
                    </h1>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-relaxed">
                      הופק בהתאם לחוק החוזים (חלק כללי), תשל"ג-1973 ולהוראות התקנון המצוי
                    </p>
                  </div>
                </div>

                {/* Desktop Ref box */}
                <div className="text-left text-xs space-y-0.5 shrink-0 hidden sm:block" dir="ltr">
                  <div className="font-extrabold text-slate-900">Ref: RFQ-{rfq.id.slice(0, 8).toUpperCase()}</div>
                  {rfq.ticketNumber && <div className="text-blue-600 font-bold">Ticket #{rfq.ticketNumber}</div>}
                  <div className="text-slate-500">{todayFormatted}</div>
                </div>
              </div>

              {/* Parties Metadata Box */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs contract-border parties-grid">
                {/* Client Info */}
                <div className="space-y-1.5 border-l border-slate-200 pl-3 parties-client">
                  <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <Building2 size={16} className="text-blue-600" />
                    <span>המזמין: {customerTypeLabel}</span>
                  </div>
                  <div className="text-slate-700"><strong>אתר / בניין:</strong> {siteName}</div>
                  {siteAddress && <div className="text-slate-600"><strong>כתובת:</strong> {siteAddress}</div>}
                  <div className="text-slate-600"><strong>איש קשר מורשה:</strong> {adminName}</div>
                  <div className="text-slate-600">
                    <strong>טלפון איש קשר:</strong> {adminPhone ? <span dir="ltr">{formatDisplayPhone(adminPhone)}</span> : '---'}
                  </div>
                </div>

                {/* Contractor Info */}
                <div className="space-y-1.5">
                  <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    <span>המבצע: {submission.vendorName}</span>
                  </div>
                  <div className="text-slate-700"><strong>ח.פ. / ת.ז.:</strong> {contractorCompanyId || '---'}</div>
                  <div className="text-slate-600" dir="ltr"><strong>טלפון:</strong> {submission.vendorPhone}</div>
                  <div className="text-slate-500"><strong>תחום מקצועי:</strong> {rfq.category}</div>
                </div>
              </div>


              {/* Section 1: Scope of Work */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">1</span>
                  <span>מהות העבודה והמפרט הטכני</span>
                </h2>
                <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs space-y-2 leading-relaxed contract-border">
                  <div className="font-extrabold text-sm text-slate-900">{rfq.title}</div>
                  <div className="text-slate-700 whitespace-pre-line font-medium">{contractScopeText || rfq.description || 'לפי המפרט שנמסר'}</div>
                  {rfq.location && (
                    <div className="flex items-center gap-1 pt-1 text-slate-500 font-bold border-t border-slate-100">
                      <MapPin size={13} className="text-red-500" />
                      <span>מיקום מדויק בבניין: {rfq.location}</span>
                    </div>
                  )}
                  {rfq.attachments && rfq.attachments.length > 0 && (
                    <div className="pt-1 text-[11px] text-slate-500">
                      <strong>מסמכים ומפרטים שצורפו למכרז:</strong> {rfq.attachments.map(a => a.name).join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Financial Terms & Milestones */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">2</span>
                  <span>התמורה הכספית ותנאי תשלום</span>
                </h2>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 contract-border">
                  <div className="grid grid-cols-3 gap-2 py-1 border-b border-slate-200 financial-grid">
                    <div>
                      <span className="text-slate-500 block">מחיר בסיס:</span>
                      <span className="text-sm font-bold text-slate-800">₪{basePrice.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">מע"מ (18%):</span>
                      <span className="text-sm font-bold text-slate-800">₪{vatAmount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-bold">סה"כ מוסכם לתשלום:</span>
                      <span className="text-base font-black text-emerald-700">₪{totalWithVat.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-slate-800 pt-0.5">
                    סה"כ במילים: <span className="text-emerald-900 font-extrabold">{numberToHebrewWords(totalWithVat)}</span>
                  </div>

                  {paymentMode === 'milestones' ? (
                    <div className="pt-1.5 space-y-2">
                      <div className="font-extrabold text-xs text-slate-900 flex items-center justify-between">
                        <span>פריסת שלבי תשלום לפי אבני דרך בביצוע:</span>
                        <span className="text-[10px] text-slate-500 font-normal">שחרור כל שלב מותנה באישור נציגות המזמין</span>
                      </div>
                      <table className="w-full text-right border-collapse text-[11px] milestone-table">
                        <thead>
                          <tr className="bg-slate-200/80 text-slate-900 font-bold border-b border-slate-300">
                            <th className="py-1 px-2 w-28">שלב ביצוע</th>
                            <th className="py-1 px-2">מהות השלב ותנאי שחרור התשלום</th>
                            <th className="py-1 px-2 text-center w-20">שיעור</th>
                            <th className="py-1 px-2 text-left w-28">סכום לתשלום (כולל מע"מ)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {milestones.map((m, idx) => (
                            <tr key={m.id || idx} className="border-b border-slate-200">
                              <td className="py-1.5 px-2 font-bold text-slate-900 align-top">{m.stageName || `שלב ${idx + 1}`}</td>
                              <td className="py-1.5 px-2 text-slate-700 align-top">
                                <div className="font-medium text-slate-900">{m.description}</div>
                                {m.condition && (
                                  <div className="text-[10px] text-slate-500 italic mt-0.5">• תנאי שחרור: {m.condition}</div>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-center font-bold text-slate-800 align-top">{m.percentage}%</td>
                              <td className="py-1.5 px-2 text-left font-black text-slate-900 align-top" dir="ltr">₪{m.amount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                            <td colSpan={2} className="py-1.5 px-2 text-right">סה"כ תמורה מלאה (כולל מע"מ):</td>
                            <td className="py-1.5 px-2 text-center">{milestones.reduce((acc, m) => acc + (Number(m.percentage) || 0), 0)}%</td>
                            <td className="py-1.5 px-2 text-left" dir="ltr">₪{totalWithVat.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                      <p className="text-slate-600 text-[11px] leading-relaxed pt-0.5">
                        • כל תשלום ישוחרר כנגד חשבונית מס / קבלה כחוק, תוך 7 ימי עסקים לאחר בדיקת נציג המזמין ואישורו בכתב כי שלב הביצוע הושלם במלואו ולשביעות רצונו.
                        <br />
                        • המחיר המוסכם לעיל הינו סופי וכולל את כל החומרים, הציוד, הובלה, עבודה ופינוי פסולת. אין תוספת מחיר ללא אישור מראש ובכתב.
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-600 text-[11px] leading-relaxed pt-1">
                      • תנאי תשלום: <strong>{singlePaymentTerm}</strong>.
                      <br />
                      • התמורה תשולם כנגד חשבונית מס / קבלה כחוק, לאחר סיום מלא של העבודה ובכפוף לבדיקת נציגות הבניין ושביעות רצונה המלאה.
                      <br />
                      • המחיר המוסכם לעיל הינו סופי וכולל את כל החומרים, הציוד, הובלה, עבודה ופינוי פסולת. אין תוספת מחיר ללא אישור מראש ובכתב.
                    </p>
                  )}
                </div>
              </div>

              {/* Section 3: Timeline, Permitted Hours & Site Pre-Inspection */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">3</span>
                  <span>מועד ושעות תחילת וסיום עבודה ובדיקת האתר</span>
                </h2>
                <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs space-y-2.5 contract-border">
                  {(workStartDate || workEndDate) ? (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div>
                        <span className="text-slate-500 block text-[11px] font-bold">מועד תחילת עבודה מוסכם:</span>
                        <span className="text-sm font-extrabold text-slate-900">{formatDateDMY(workStartDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px] font-bold">מועד סיום ומסירת האתר:</span>
                        <span className="text-sm font-extrabold text-slate-900">
                          {workEndDate ? formatDateDMY(workEndDate) : `משך ביצוע: ${submission.estimatedDuration || 'לפי תיאום'}`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Clock size={14} className="text-blue-600" />
                      <span>משך ביצוע שהתחייב הקבלן: <strong>{submission.estimatedDuration || 'לפי תיאום'}</strong></span>
                    </div>
                  )}

                  {allowedWorkHours && (
                    <div className="text-slate-700 text-[11px]">
                      <strong>שעות עבודה והרעשה מותרות באתר:</strong> {allowedWorkHours}
                    </div>
                  )}

                  {includeSiteInspection && siteInspectionText && (
                    <div className="text-slate-700 text-[11px] pt-1 border-t border-slate-100">
                      <strong>בדיקת האתר ודרכי גישה:</strong> {siteInspectionText}
                    </div>
                  )}

                  <p className="text-slate-600 text-[11px] leading-relaxed pt-0.5">
                    {workStartDate ? (
                      <>
                        • העבודה תחל במועד שנקבע לעיל (תאריך {formatDateDMY(workStartDate)}){workEndDate ? ` ותסתיים לא יאוחר ממועד המסירה המוסכם (תאריך ${formatDateDMY(workEndDate)})` : ''}, בתיאום מראש עם נציגות המזמין.
                        <br />
                        • הקבלן מתחייב לבצע את העבודה ברצף ובמועד, תוך מזעור ההפרעה לשגרת החיים של דיירי {isSettlementTenant ? 'היישוב' : 'הבניין'} והסביבה.
                      </>
                    ) : (
                      <>
                        • העבודה תחל בתיאום מראש תוך לא יאוחר מ-3 ימי עסקים ממועד חתימת הזמנה זו, אלא אם הוסכם אחרת בכתב.
                        <br />
                        • הקבלן מתחייב לבצע את העבודה ברצף ובמועד, תוך מזעור ההפרעה לשגרת החיים של דיירי {isSettlementTenant ? 'היישוב' : 'הבניין'} והסביבה.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Section 4: Warranty, Cleanliness, Safety & Independence */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">4</span>
                  <span>תנאי אחריות, בטיחות, פינוי פסולת ומעמד הקבלן</span>
                </h2>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2.5 contract-border leading-relaxed">
                  {submission.notes ? (
                    <div>
                      <strong>תנאי אחריות והערות שהוגשו ע"י הקבלן:</strong>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200 mt-1 italic text-slate-700 whitespace-pre-line break-words">
                        "{submission.notes}"
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-600">• הקבלן מתחייב לאחריות מלאה על טיב העבודה והחלקים למשך שנה ממועד המסירה כחוק.</p>
                  )}


                  {/* Dynamic Waste Disposal & Cleanliness Clause */}
                  {wasteClauseText && (
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-800 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-slate-900">
                        <Truck size={14} className="text-blue-600 shrink-0" />
                        <span>הנחיות פינוי פסולת וניקיון האתר:</span>
                      </div>
                      <div className="leading-relaxed text-slate-700">{wasteClauseText}</div>
                    </div>
                  )}

                  <p className="text-slate-600 text-[11px] pt-0.5">
                    • הקבלן נושא באחריות בלעדית לבטיחות עובדיו, לרבות עבודה בגובה ושימוש באמצעי מיגון תקניים.
                    <br />
                    • הקבלן אחראי לתיקון כל נזק שייגרם לרכוש המשותף או לדירות פרטיות בעת ביצוע העבודה.
                  </p>

                  {/* Employer Waiver Clause */}
                  {includeEmployerWaiver && employerWaiverText && (
                    <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-600">
                      <strong>היעדר יחסי עובד-מעביד:</strong> {employerWaiverText}
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Agreed Custom Clauses */}
              {customClauses.map((clause, idx) => (
                <div key={clause.id} className="space-y-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">
                      {5 + idx}
                    </span>
                    <span>{clause.title || `סעיף ${5 + idx}: תנאים מיוחדים והסכמות נוספות`}</span>
                  </h2>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed contract-border">
                    {clause.content}
                  </div>
                </div>
              ))}

              {/* Signatures Block */}
              <div className="pt-4 border-t-2 border-slate-300">
                <div className="text-xs font-bold text-slate-700 mb-6 flex items-center justify-between">
                  <span>ולראיה באו הצדדים על החתום בתאריך {awardedDateFormatted}:</span>
                  {contractExecution?.status === 'fully_signed' && (
                    <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                      <CheckCircle2 size={13} />
                      <span>הסכם חתום דיגיטלית ומחייב ע״י שני הצדדים ✓</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-8 text-xs">
                  {/* Committee Signature */}
                  <div className="border-t border-slate-400 pt-2 text-center flex flex-col items-center">
                    <div className="font-black text-slate-900">{customerTypeLabel} - {siteName}</div>
                    <div className="text-slate-500 pt-1">
                      נציג מורשה: {contractExecution?.committeeSignature?.signerName || adminName}
                      {(contractExecution?.committeeSignature?.signerPhone || adminPhone) ? ` (${formatDisplayPhone(contractExecution?.committeeSignature?.signerPhone || adminPhone)})` : ''}
                    </div>

                    {/* Stamped Graphical Signature or blank line */}
                    {contractExecution?.committeeSignature?.signatureDataUrl ? (
                      <div className="pt-2 flex flex-col items-center">
                        <img 
                          src={contractExecution.committeeSignature.signatureDataUrl} 
                          alt="חתימת נציגות הוועד"
                          className="h-16 max-w-[180px] object-contain" 
                        />
                        <div className="text-[9px] text-emerald-700 font-bold flex items-center gap-1 pt-0.5">
                          <CheckCircle2 size={10} />
                          <span>נחתם דיגיטלית: {formatDateDMY(contractExecution.committeeSignature.signedAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 pt-3">חתימה וחותמת: ____________________</div>
                    )}
                  </div>

                  {/* Contractor Signature */}
                  <div className="border-t border-slate-400 pt-2 text-center flex flex-col items-center">
                    <div className="font-black text-slate-900">
                      {contractExecution?.vendorSignature?.signerName || submission.vendorName}
                    </div>
                    <div className="text-slate-500 pt-1">
                      קבלן מבצע מורשה
                      {(contractExecution?.vendorSignature?.companyId || contractorCompanyId) ? ` (ח.פ./ת.ז. ${contractExecution?.vendorSignature?.companyId || contractorCompanyId})` : ''}
                    </div>

                    {/* Stamped Graphical Signature or blank line */}
                    {contractExecution?.vendorSignature?.signatureDataUrl ? (
                      <div className="pt-2 flex flex-col items-center">
                        <img 
                          src={contractExecution.vendorSignature.signatureDataUrl} 
                          alt="חתימת הקבלן המבצע"
                          className="h-16 max-w-[180px] object-contain" 
                        />
                        <div className="text-[9px] text-emerald-700 font-bold flex items-center gap-1 pt-0.5">
                          <CheckCircle2 size={10} />
                          <span>נחתם דיגיטלית: {formatDateDMY(contractExecution.vendorSignature.signedAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2">
                        {contractExecution?.status === 'signed_by_admin' && onContractorSignClick ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onContractorSignClick();
                            }}
                            className="no-print mt-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer animate-pulse"
                          >
                            <PenTool size={12} />
                            <span>לחץ כאן לחתימת אישור ✍️</span>
                          </button>
                        ) : (
                          <div className="text-[10px] text-slate-400 pt-3">
                            {contractExecution?.status === 'signed_by_admin' 
                              ? 'ממתין לחתימת הקבלן המבצע...' 
                              : 'חתימה וחותמת: ____________________'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Legal 7-Year Retention Notice */}
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-[10px] text-slate-500 leading-normal contract-border">
                <strong>כספת תיעוד משפטית (TikTak Audit Vault):</strong> הזמנת עבודה זו הופקה דיגיטלית באמצעות מערכת TikTak.
                כל מסמכי המכרז, הצעות המחיר המתחרות, קובצי המפרט, רישומי החתימות האלקטרוניות המאובטחות ורישומי ה-Audit נשמרים ומאובטחים למשך <strong>7 שנים מלאות</strong> בהתאם לחוק חתימה אלקטרונית (תשס"א-2001), חוק ההתיישנות (תשי"ח-1958) וסעיף 16 לתקנון המצוי.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions - Not visible on print */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 no-print">
          <div className="text-[11px] text-slate-500 font-medium space-y-0.5 text-right w-full sm:w-auto">
            {contractExecution?.status === 'fully_signed' ? (
              <div className="text-emerald-700 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                <span>ההסכם נחתם סופית ע״י שני הצדדים! ניתן להדפיס או לשמור כ-PDF.</span>
              </div>
            ) : contractExecution?.status === 'signed_by_admin' ? (
              <div>
                <div className="text-blue-700 font-bold flex items-center gap-1">
                  <span>✍️ נחתם ע״י הוועד.</span>
                  <span>שלח קישור לקבלן בוואטסאפ לחתימת אישור סופית.</span>
                </div>
              </div>
            ) : !isReadOnly && auth.currentUser ? (
              <div>
                <div className="text-slate-700 font-bold">1️⃣ התאם את הסעיפים 2️⃣ חתום על ההסכם 3️⃣ שלח לקבלן בוואטסאפ.</div>
                <div className="text-[10px] text-slate-500">חתימתך תנעל את תנאי ההסכם ותאפשר לקבלן לחתום דיגיטלית.</div>
              </div>
            ) : (
              <div>📄 הסכם זה הופק ונשמר במערכת. באפשרותך להדפיס או לשמור כ-PDF לצורך תיעוד וביצוע.</div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap justify-end">
            {/* Contractor Sign Button (Visible when contractor opens contract and it has been signed by admin) */}
            {isReadOnly && onContractorSignClick && contractExecution?.status === 'signed_by_admin' && !contractExecution.vendorSignature && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onContractorSignClick();
                }}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer animate-pulse"
              >
                <PenTool size={14} />
                <span>חתימה ואישור ההסכם ✍️</span>
              </button>
            )}

            {/* Admin Signature Button (Visible when not signed by admin and user is authorized admin) */}
            {!isReadOnly && auth.currentUser && !contractExecution?.committeeSignature && (
              <button
                type="button"
                onClick={() => setShowAdminSignatureModal(true)}
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <PenTool size={14} />
                <span>חתום ואשר הסכם ✍️</span>
              </button>
            )}

            {/* WhatsApp Share Button */}
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className={`flex-1 sm:flex-initial px-4 py-2.5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                  contractExecution?.committeeSignature 
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95' 
                    : 'bg-emerald-600/80 hover:bg-emerald-700 text-white'
                }`}
              >
                <MessageCircle size={15} />
                <span>
                  {contractExecution?.committeeSignature ? 'שלח הסכם לקבלן בוואטסאפ 📲' : 'שלח הסכם בוואטסאפ 📲'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer size={15} />
              <span>הדפס / שמור כ-PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              סגור
            </button>
          </div>
        </div>

        {/* Signature Pad Modal for Admin / Committee */}
        {showAdminSignatureModal && (
          <SignaturePadModal
            isOpen={showAdminSignatureModal}
            onClose={() => setShowAdminSignatureModal(false)}
            onSave={handleSignByAdmin}
            title={`חתימת נציגות ${siteName}`}
            subtitle="חתימתך מהווה אישור רשמי של המזמין לתנאי העבודה והתשלום שנקבעו בהסכם זה"
            defaultSignerName={resolvedContactName || currentAdminName || rfq.createdBy?.name || ''}
            defaultSignerPhone={adminPhone}
            requireCompanyId={false}
            requireConsentCheckbox={true}
            consentCheckboxText="אני מאשר בזאת את תנאי ההסכם, הסכום ולוחות הזמנים כפי שנקבעו בהזמנת עבודה זו בשם נציגות המזמין."
          />
        )}
      </div>
    </div>
  );
}
