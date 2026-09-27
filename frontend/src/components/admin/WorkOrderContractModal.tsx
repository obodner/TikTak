import { useRef, useState, useEffect } from 'react';
import {
  X,
  Printer,
  MessageCircle,
  FileCheck2,
  Building2,
  ShieldCheck,
  Clock,
  MapPin
} from 'lucide-react';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { WorkQuoteRequest, VendorQuoteSubmission } from '../../types/rfq';
import { normalizePhone } from '../../utils/whatsapp';

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
}

export default function WorkOrderContractModal({
  isOpen,
  onClose,
  rfq,
  submission,
  tenantInfo,
  currentAdminName,
  currentAdminPhone
}: WorkOrderContractModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [customerLogo, setCustomerLogo] = useState<string | null>(tenantInfo?.logoUrl || null);
  const [adminPhone, setAdminPhone] = useState<string>(rfq.createdBy?.phone || currentAdminPhone || '');
  const [resolvedContactName, setResolvedContactName] = useState<string>(
    rfq.createdBy?.name || currentAdminName || ''
  );
  const [contractorCompanyId, setContractorCompanyId] = useState<string>(
    submission.companyId ||
    rfq.dispatchedVendors?.find(v => v.vendorId === submission.vendorId)?.companyId ||
    ''
  );

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
          if (fullName && isMounted && (!rawContactName || rawContactName.includes('@') || rawContactName === 'נציגות הבית' || rawContactName === 'ועד הבית')) {
            setResolvedContactName(fullName);
          }

          // If rfq didn't have createdBy.phone saved yet, persist it on the RFQ document
          if (phone && !rfq.createdBy?.phone && auth.currentUser) {
            updateDoc(doc(db, "tenants", tid, "rfqs", rfq.id), {
              "createdBy.phone": phone,
              ...(fullName ? { "createdBy.name": fullName } : {})
            }).catch(() => {});
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
              margin: 0;
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
              margin: 0;
              padding: 14mm 12mm;
              font-size: 12px;
              line-height: 1.45;
              direction: rtl;
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
            .bg-white { background-color: #ffffff; }
            .bg-blue-50\\/60 { background-color: #eff6ff; }
            .bg-slate-900 { background-color: #0f172a; }
            .text-blue-600 { color: #2563eb; }
            .text-emerald-600 { color: #059669; }
            .text-emerald-700 { color: #047857; }
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
            
            /* Prevent multi-page overlap and ensure natural page breaks */
            .contract-border, .grid, .border, .rounded-xl, .rounded-2xl {
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

    const message =
      `שלום ${submission.vendorName},\n` +
      `בהמשך לאישור הצעת המחיר שלך למכרז *#RFQ-${rfq.id.slice(0, 8).toUpperCase()}* (${rfq.title}),\n` +
      `מצורפים עיקרי הסכם העבודה והזמנת העבודה המחייבת:\n\n` +
      `📍 אתר ביצוע: ${siteName}${siteAddress ? ` (${siteAddress})` : ''}\n` +
      `💰 סה"כ תמורה מוסכמת: ₪${totalWithVat.toLocaleString()} (כולל מע"מ)\n` +
      `⏱️ משך ביצוע מוסכם: ${submission.estimatedDuration || 'לפי תיאום'}\n` +
      (submission.notes ? `🛡️ תנאי אחריות: ${submission.notes}\n` : '') +
      `\n📄 לצפייה בהסכם המלא, בהזמנת העבודה ולהורדת ה-PDF:\n` +
      `${contractPortalUrl}\n\n` +
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
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>הסכם התקשרות והזמנת עבודה מחייבת</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  הצעה מאושרת ✓
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                הופק אוטומטית מנתוני המכרז • מסמך משפטי תקני להדפסה ולחתימה
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

        {/* Printable Contract Body */}
        <div ref={printRef} className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-800 print:p-0 print:space-y-4">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 0;
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
                padding: 14mm 12mm 14mm 12mm !important;
                margin: 0 !important;
                color: black !important;
                background: white !important;
              }
              #printable-contract * {
                color-adjust: exact !important;
                -webkit-print-color-adjust: exact !important;
              }
              .contract-border, .grid, .border, .rounded-xl, .rounded-2xl {
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
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 gap-6">
                <div className="flex items-center gap-5 shrink-0">
                  {customerLogo && (
                    <>
                      <img
                        src={customerLogo}
                        alt={siteName}
                        className="contract-customer-logo shrink-0"
                        style={{ height: '52px', maxHeight: '52px', maxWidth: '156px', objectFit: 'contain' }}
                      />
                      <div className="contract-header-divider shrink-0" />
                    </>
                  )}
                  <img
                    src="/logo_transparent.png"
                    alt="TikTak"
                    className="contract-tiktak-logo shrink-0"
                    style={{ height: '30px', maxHeight: '30px', width: 'auto', objectFit: 'contain' }}
                  />
                  <div className="contract-header-divider shrink-0" />
                  <div className="space-y-0.5">
                    <h1 className="text-base font-black text-slate-900 leading-tight whitespace-nowrap">הזמנת עבודה והסכם התקשרות מחייב</h1>
                    <p className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                      הופק בהתאם לחוק החוזים (חלק כללי), תשל"ג-1973 ולהוראות התקנון המצוי
                    </p>
                  </div>
                </div>

                <div className="text-left text-xs space-y-0.5 shrink-0" dir="ltr">
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
                <div className="text-slate-700 whitespace-pre-line font-medium">{rfq.description || 'לפי המפרט שנמסר'}</div>
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

            {/* Section 2: Financial Terms */}
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
                <p className="text-slate-600 text-[11px] leading-relaxed pt-1">
                  • התמורה תשולם כנגד חשבונית מס / קבלה כחוק, לאחר סיום מלא של העבודה ובכפוף לבדיקת נציגות הבניין ושביעות רצונה המלאה.
                  <br />
                  • המחיר המוסכם לעיל הינו סופי וכולל את כל החומרים, הציוד, הובלה, עבודה ופינוי פסולת. אין תוספת מחיר ללא אישור מראש ובכתב.
                </p>
              </div>
            </div>

            {/* Section 3: Timeline & Duration */}
            <div className="space-y-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">3</span>
                <span>לוחות זמנים ומועדי ביצוע</span>
              </h2>
              <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs space-y-1.5 contract-border">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Clock size={14} className="text-blue-600" />
                  <span>משך ביצוע שהתחייב הקבלן: <strong>{submission.estimatedDuration || 'לפי תיאום'}</strong></span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  • העבודה תחל בתיאום מראש תוך לא יאוחר מ-3 ימי עסקים ממועד חתימת הזמנה זו, אלא אם הוסכם אחרת בכתב.
                  <br />
                  • הקבלן מתחייב לבצע את העבודה ברצף ובמועד, תוך מזעור ההפרעה לשגרת החיים של דיירי הבניין.
                </p>
              </div>
            </div>

            {/* Section 4: Warranty, Cleanliness & Committee Selection Reasoning */}
            <div className="space-y-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">4</span>
                <span>תנאי אחריות, בטיחות ונקיון</span>
              </h2>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 contract-border leading-relaxed">
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

                {rfq.awardReasoning && (
                  <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-600">
                    <strong>נימוק אישור הוועד לפרוטוקול:</strong> {rfq.awardReasoning.reasonType}
                    {rfq.awardReasoning.note && ` (${rfq.awardReasoning.note})`}
                  </div>
                )}

                <p className="text-slate-600 text-[11px] pt-1">
                  • הקבלן נושא באחריות בלעדית לבטיחות עובדיו, לרבות עבודה בגובה ושימוש באמצעי מיגון תקניים.
                  <br />
                  • הקבלן אחראי לתיקון כל נזק שייגרם לרכוש המשותף או לדירות פרטיות בעת ביצוע העבודה, ולפינוי מוחלט של פסולת הבנייה בסיום העבודה.
                </p>
              </div>
            </div>

            {/* Signatures Block */}
            <div className="pt-4 border-t-2 border-slate-300">
              <div className="text-xs font-bold text-slate-700 mb-6">
                ולראיה באו הצדדים על החתום בתאריך {awardedDateFormatted}:
              </div>

              <div className="grid grid-cols-2 gap-8 text-xs">
                {/* Committee Signature */}
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-black text-slate-900">{customerTypeLabel} - {siteName}</div>
                  <div className="text-slate-500 pt-1">נציג מורשה: {adminName}{adminPhone ? ` (${formatDisplayPhone(adminPhone)})` : ''}</div>
                  <div className="text-[10px] text-slate-400 pt-3">חתימה וחותמת: ____________________</div>
                </div>

                {/* Contractor Signature */}
                <div className="border-t border-slate-400 pt-2 text-center">
                  <div className="font-black text-slate-900">{submission.vendorName}</div>
                  <div className="text-slate-500 pt-1">
                    קבלן מבצע מורשה{contractorCompanyId ? ` (ח.פ./ת.ז. ${contractorCompanyId})` : ''}
                  </div>
                  <div className="text-[10px] text-slate-400 pt-3">חתימה וחותמת: ____________________</div>
                </div>
              </div>
            </div>

            {/* Legal 7-Year Retention Notice */}
            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-[10px] text-slate-500 leading-normal contract-border">
              <strong>כספת תיעוד משפטית (TikTak Audit Vault):</strong> הזמנת עבודה זו הופקה דיגיטלית באמצעות מערכת TikTak.
              כל מסמכי המכרז, הצעות המחיר המתחרות, קובצי המפרט ורישומי ה-Audit נשמרים ומאובטחים למשך <strong>7 שנים מלאות</strong> בהתאם להוראות חוק ההתיישנות (תשי"ח-1958) וסעיף 16 לתקנון המצוי (חוק המקרקעין).
            </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions - Not visible on print */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 no-print">
          <div className="text-[11px] text-slate-500 font-medium space-y-0.5 text-right w-full sm:w-auto">
            <div>📄 ההודעה לוואטסאפ כוללת <strong>קישור ישיר</strong> לצפייה בהסכם המלא ע"י הקבלן.</div>
            <div className="text-blue-600 font-bold">💡 לשליחת קובץ ה-PDF: לחץ "הדפס / שמור כ-PDF" וצרף אותו ישירות לצ'אט.</div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <MessageCircle size={15} />
              <span>שלח הסכם בוואטסאפ 📲</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
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
      </div>
    </div>
  );
}
