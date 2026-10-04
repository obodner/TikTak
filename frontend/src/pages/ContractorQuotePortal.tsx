import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Upload,
  Play,
  Pause,
  Mic,
  Image as ImageIcon,
  ExternalLink,
  ShieldCheck,
  Send,
  Loader2,
  Calendar,
  Lock,
  Trophy,
  FileCheck2,
  Coins,
  Truck,
  PenTool,
  AlertTriangle
} from 'lucide-react';
import { WorkQuoteRequest, VendorQuoteSubmission, DispatchedVendorRecord, ContractExecutionData } from '../types/rfq';
import { logAction } from '../utils/auditLogger';
import WorkOrderContractModal from '../components/admin/WorkOrderContractModal';
import SignaturePadModal from '../components/common/SignaturePadModal';

const DURATION_PRESETS = [
  'עד שעתיים ⚡',
  'חצי יום עבודה ⏱️',
  'יום עבודה מלא 🛠️',
  '2-3 ימי עבודה 📅',
  'מעל שבוע 🏗️'
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'];

const BLOCKED_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'vbs', 'msi', 'zip', 'scr', 'dll', 'bin', 'apk',
  'com', 'jar', 'app', 'gadget', 'pif', 'wsf', 'jse', 'vbe', 'reg', 'ps1',
  'php', 'asp', 'aspx', 'jsp', 'js', 'html', 'htm', 'shtml', 'svg', 'xml',
  'py', 'rb', 'pl', 'iso', 'img', 'dmg', '7z', 'rar', 'tar', 'gz', 'hta', 'cpl'
];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
];

// Binary magic bytes inspection to detect disguised executables and viruses
async function validateFileSignature(file: File): Promise<{ valid: boolean; reason?: string }> {
  try {
    const buffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // 1. Windows PE Executable / DOS (MZ header)
    if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
      return { valid: false, reason: 'הקובץ מכיל חתימה של קובץ הפעלה (Executable / PE) ונחסם כהגנה מפני וירוסים.' };
    }

    // 2. Linux ELF binary (0x7F, 'E', 'L', 'F')
    if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
      return { valid: false, reason: 'הקובץ מכיל חתימת הרצה (ELF Binary) ונחסם מטעמי אבטחה.' };
    }

    // 3. Shell script (0x23, 0x21 -> "#!")
    if (bytes[0] === 0x23 && bytes[1] === 0x21) {
      return { valid: false, reason: 'הקובץ מכיל סקריפט הרצה (Shell Script) ונחסם מטעמי אבטחה.' };
    }

    // 4. Archive (ZIP / JAR / APK: 0x50, 0x4B -> "PK")
    // Note: docx and xlsx are modern OpenXML packages which are ZIP-based containers
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      if (ext !== 'docx' && ext !== 'xlsx') {
        return { valid: false, reason: 'ארכיונים וקובצי ZIP אינם מורשים להעלאה.' };
      }
    }

    // 5. OpenXML verification for DOCX and XLSX (must have PK zip container header)
    if (ext === 'docx' || ext === 'xlsx') {
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      if (!isZip) {
        return { valid: false, reason: 'תוכן הקובץ אינו תואם מבנה מסמך Word/Excel (OpenXML תקין).' };
      }
    }

    // 6. Legacy OLE2 verification for DOC and XLS (0xD0, 0xCF, 0x11, 0xE0)
    if (ext === 'doc' || ext === 'xls') {
      const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
      if (!isOle) {
        return { valid: false, reason: 'תוכן הקובץ אינו תואם מבנה מסמך Word/Excel מקורי.' };
      }
    }

    // 7. PDF verification: starts with "%PDF-" (0x25, 0x50, 0x44, 0x46)
    if (ext === 'pdf') {
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (!isPdf) {
        return { valid: false, reason: 'תוכן הקובץ אינו תואם מבנה מסמך PDF אמיתי (חשד לקובץ מוסווה).' };
      }
    }

    // 8. JPEG verification: starts with 0xFF, 0xD8, 0xFF
    if (ext === 'jpg' || ext === 'jpeg') {
      const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!isJpg) {
        return { valid: false, reason: 'תוכן הקובץ אינו תואם מבנה תמונת JPG אמיתית.' };
      }
    }

    // 9. PNG verification: starts with 0x89, 0x50, 0x4E, 0x47
    if (ext === 'png') {
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      if (!isPng) {
        return { valid: false, reason: 'תוכן הקובץ אינו תואם מבנה תמונת PNG אמיתית.' };
      }
    }

    // 10. WEBP verification: starts with "RIFF" and bytes 8-11 are "WEBP"
    if (ext === 'webp') {
      const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
      const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
      if (!isRiff || !isWebp) {
        return { valid: false, reason: 'תוכן הקובץ אינו תואם מבנה תמונת WEBP אמיתית.' };
      }
    }

    return { valid: true };
  } catch (sigErr) {
    console.warn('File signature validation fallback:', sigErr);
    return { valid: true };
  }
}

export default function ContractorQuotePortal() {
  const { tenantId: routeTenantId, rfqId: rawRfqId } = useParams<{ tenantId?: string; rfqId?: string }>();
  const [searchParams] = useSearchParams();

  // Helper to extract parameters from all possible formats (plain query, URL-encoded %3F/%26 from WhatsApp, path, etc.)
  const extractParams = () => {
    let rfq = rawRfqId || '';
    let vendor = searchParams.get('v') || searchParams.get('vendorId') || '';
    let token = searchParams.get('t') || searchParams.get('token') || '';
    let tenant = routeTenantId || searchParams.get('tid') || searchParams.get('tenant') || searchParams.get('tenantId') || '';

    // Check full URL (including any encoded query strings like %3F, %26)
    const href = typeof window !== 'undefined' ? window.location.href : '';
    const decodedHref = decodeURI(href);

    // If rfq contains '?' or '%3F'
    if (rfq.includes('?') || rfq.includes('%3F')) {
      const decodedRfq = decodeURIComponent(rfq);
      const [cleanId, qStr] = decodedRfq.split('?');
      rfq = cleanId;
      if (qStr) {
        const qp = new URLSearchParams(qStr);
        if (!vendor) vendor = qp.get('v') || qp.get('vendorId') || '';
        if (!token) token = qp.get('t') || qp.get('token') || '';
        if (!tenant) tenant = qp.get('tid') || qp.get('tenant') || '';
      }
    }

    // If query parameters weren't parsed by React Router because %3F was in the pathname
    if (!vendor || !token || !tenant) {
      const qIdx = decodedHref.indexOf('?');
      if (qIdx !== -1) {
        const qp = new URLSearchParams(decodedHref.slice(qIdx));
        if (!vendor) vendor = qp.get('v') || qp.get('vendorId') || '';
        if (!token) token = qp.get('t') || qp.get('token') || '';
        if (!tenant) tenant = qp.get('tid') || qp.get('tenant') || '';
      }
    }

    // Strip literal {{1}}, %7B%7B1%7D%7D, or raw brackets if Meta prepended it
    try {
      rfq = decodeURIComponent(rfq);
    } catch (_) {}
    rfq = rfq
      .replace(/%7B%7B\d+%7D%7D/gi, '')
      .replace(/\{\{\d+\}\}/g, '')
      .replace(/[{}]/g, '')
      .trim();

    // If rfq contains slug delimiters tenant__rfq__vendor__token
    if (rfq.includes('__')) {
      const parts = rfq.split('__');
      if (parts.length >= 2) {
        if (!tenant) tenant = parts[0]?.trim();
        rfq = parts[1]?.trim();
        if (parts[2] && !vendor) vendor = parts[2]?.trim();
        if (parts[3] && !token) token = parts[3]?.trim();
      }
    }

    return {
      rfq: rfq.trim(),
      vendor: vendor.trim(),
      token: token.trim(),
      tenant: tenant.trim()
    };
  };

  const initialParams = extractParams();
  const rfqId = initialParams.rfq;
  const vendorId = initialParams.vendor;
  const tokenHash = initialParams.token;
  const queryTenantId = initialParams.tenant;

  // Effective tenant ID
  const [resolvedTenantId, setResolvedTenantId] = useState<string>(initialParams.tenant || '');

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  // Data States
  const [rfq, setRfq] = useState<WorkQuoteRequest | null>(null);
  const [tenantInfo, setTenantInfo] = useState<{ name: string; type: string; address?: string } | null>(null);
  const [matchedVendor, setMatchedVendor] = useState<DispatchedVendorRecord | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<VendorQuoteSubmission | null>(null);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Device Whitelist Authentication States
  const [isDeviceAuthenticated, setIsDeviceAuthenticated] = useState<boolean>(false);
  const [authPhoneInput, setAuthPhoneInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isVerifyingPhone, setIsVerifyingPhone] = useState<boolean>(false);

  // Form State
  const [priceInput, setPriceInput] = useState<string>('');
  const [priceIncludesVat, setPriceIncludesVat] = useState<boolean>(false);
  const [selectedDuration, setSelectedDuration] = useState<string>('יום עבודה מלא 🛠️');
  const [customDuration, setCustomDuration] = useState<string>('');
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  // Attachment upload state
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [quoteFileUrl, setQuoteFileUrl] = useState<string>('');
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string>('');

  // Audio player state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Image lightbox preview
  const [showImageModal, setShowImageModal] = useState(false);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  // Digital Contract / Work Order Modal State
  const [showContractModal, setShowContractModal] = useState(false);
  const [showVendorSignModal, setShowVendorSignModal] = useState(false);
  const [showPhoneChallengeModal, setShowPhoneChallengeModal] = useState(false);
  const [vendorLast4Input, setVendorLast4Input] = useState('');
  const [vendorLast4Error, setVendorLast4Error] = useState('');
  const [contractSignedSuccess, setContractSignedSuccess] = useState(false);

  // 1. Fetch RFQ details, verify whitelist & phone, and identify tenant
  useEffect(() => {
    async function loadPortalData() {
      let { rfq: cleanRfqId, vendor: extractedVendorId, token: extractedTokenHash, tenant: extractedTenantId } = extractParams();

      cleanRfqId = cleanRfqId
        .replace(/%7B%7B\d+%7D%7D/gi, '')
        .replace(/\{\{\d+\}\}/g, '')
        .trim();

      if (!cleanRfqId) {
        setErrorMessage('קישור הצעת המחיר אינו תקין (חסר מזהה פנייה).');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage('');

      try {
        let tenantToUse = extractedTenantId || resolvedTenantId || 'demo';
        let rfqData: WorkQuoteRequest | null = null;

        // 1. Fetch RFQ Document
        try {
          const docRef = doc(db, "tenants", tenantToUse, "rfqs", cleanRfqId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            rfqData = { id: snap.id, ...snap.data() } as WorkQuoteRequest;
          }
        } catch (e) {
          console.warn("Error fetching RFQ with candidate tenant:", e);
        }

        // Fallback to demo tenant if not found
        if (!rfqData && tenantToUse !== 'demo') {
          try {
            const docRef = doc(db, "tenants", "demo", "rfqs", cleanRfqId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              rfqData = { id: snap.id, ...snap.data() } as WorkQuoteRequest;
              tenantToUse = 'demo';
            }
          } catch (e) {
            console.warn("Error fetching RFQ with demo tenant fallback:", e);
          }
        }

        if (!rfqData) {
          setErrorMessage('בקשת הצעת המחיר לא נמצאה במערכת או שהקישור שגוי.');
          setLoading(false);
          return;
        }

        setRfq(rfqData);
        setResolvedTenantId(tenantToUse);

        // Fetch dynamic tenant information (Customer Type & Customer Name)
        try {
          const infoRes = await fetch(`/api/buildingInfo?tenantId=${tenantToUse}`);
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            setTenantInfo({
              name: infoData.name || rfqData.tenantName || tenantToUse,
              type: infoData.type || rfqData.tenantType || 'building',
              address: infoData.address || ''
            });
          } else {
            setTenantInfo({
              name: rfqData.tenantName || tenantToUse,
              type: rfqData.tenantType || 'building',
              address: ''
            });
          }
        } catch (fetchErr) {
          console.warn("Failed to fetch buildingInfo, falling back to rfq info:", fetchErr);
          setTenantInfo({
            name: rfqData.tenantName || tenantToUse,
            type: rfqData.tenantType || 'building',
            address: ''
          });
        }

        // Check if RFQ is closed or awarded
        if (rfqData.status !== 'open') {
          setIsClosed(true);
        }

        // Check if deadline has passed
        const deadlineTime = new Date(rfqData.deadlineAt).getTime();
        if (deadlineTime < Date.now()) {
          setIsExpired(true);
        }

        let finalVendorId = extractedVendorId;
        const finalTokenHash = extractedTokenHash;

        // Auto-match vendor if vendorId was missing but tokenHash matched
        if (!finalVendorId && finalTokenHash) {
          const matchedByToken = rfqData.dispatchedVendors?.find(v => v.tokenHash === finalTokenHash);
          if (matchedByToken) {
            finalVendorId = matchedByToken.vendorId;
          }
        } else if (!finalVendorId && rfqData.dispatchedVendors?.length === 1) {
          finalVendorId = rfqData.dispatchedVendors[0].vendorId;
        }

        // 1. Mandatory Whitelist Verification: vendorId MUST be provided
        if (!finalVendorId) {
          setErrorMessage('גישה חסומה: הקישור אינו מורשה. חסר מזהה קבלן מורשה. יש להיכנס אך ורק באמצעות הקישור האישי שנשלח אליך בהודעת ה-WhatsApp (שגיאה 403).');
          setLoading(false);
          return;
        }

        // 2. Check if this vendor was dispatched in this specific RFQ
        const found = rfqData.dispatchedVendors?.find(v => v.vendorId === finalVendorId);
        if (!found) {
          setErrorMessage('גישה חסומה: קבלן זה אינו מופיע ברשימת התפוצה המורשית עבור פנייה זו (שגיאה 403).');
          setLoading(false);
          return;
        }

        // 3. Security token hash verification if token exists
        if (finalTokenHash && found.tokenHash && finalTokenHash !== found.tokenHash) {
          setErrorMessage('גישה חסומה: מפתח האבטחה (Token) אינו תואם. אנא פתח את הקישור המקורי שנשלח אליך (שגיאה 403).');
          setLoading(false);
          return;
        }

        // 4. Verify vendor against the Firestore tenant whitelist (tenants/{tenantId}/vendors/{vendorId})
        const vendorDocRef = doc(db, "tenants", tenantToUse, "vendors", finalVendorId);
        const vendorSnap = await getDoc(vendorDocRef);
        if (!vendorSnap.exists()) {
          setErrorMessage('גישה חסומה: פרטי הקבלן אינם קיימים עוד ברשימת הספקים המורשים של הלקוח (שגיאה 403).');
          setLoading(false);
          return;
        }

        const dbVendorData = vendorSnap.data();

        // 5. Verify Phone Number against whitelist (last 9 digits normalized comparison)
        const cleanPhone = (p: string) => (p || '').replace(/\D/g, '');
        const last9Dispatched = cleanPhone(found.phone).slice(-9);
        const last9Db = cleanPhone(dbVendorData.phone || '').slice(-9);

        if (!last9Db || (last9Dispatched && last9Dispatched !== last9Db)) {
          setErrorMessage('גישה חסומה: מספר הטלפון של הקבלן אינו תואם את רשימת הספקים המורשים המאושרת במערכת (שגיאה 403).');
          setLoading(false);
          return;
        }

        // Whitelist verified successfully!
        const resolvedVendorRecord = {
          ...found,
          vendorName: dbVendorData.fullName || found.vendorName,
          phone: dbVendorData.phone || found.phone,
          vendorType: dbVendorData.vendorType || found.vendorType
        };
        setMatchedVendor(resolvedVendorRecord);

        // 6. Check if this device is authenticated with the contractor's whitelisted phone
        const expectedPhoneDigits = cleanPhone(resolvedVendorRecord.phone).slice(-9);
        let storedDevicePhone = '';
        try {
          storedDevicePhone = localStorage.getItem('tiktak_contractor_phone') || 
                              localStorage.getItem('tiktak_reporter_phone') || '';
        } catch (storageErr) {
          console.warn('Storage read warning:', storageErr);
        }

        const storedDigits = cleanPhone(storedDevicePhone).slice(-9);
        if (storedDigits && storedDigits === expectedPhoneDigits) {
          setIsDeviceAuthenticated(true);
        } else {
          setIsDeviceAuthenticated(false);
        }

        // Check if vendor already submitted a quote previously
        const subRef = doc(db, "tenants", tenantToUse, "rfqs", cleanRfqId, "submissions", finalVendorId);
        const subSnap = await getDoc(subRef);
        if (subSnap.exists()) {
          const subData = { id: subSnap.id, ...subSnap.data() } as VendorQuoteSubmission;
          setExistingSubmission(subData);
          // Pre-populate form
          setPriceInput(String(subData.price || ''));
          setPriceIncludesVat(subData.priceIncludesVat ?? false);
          if (DURATION_PRESETS.includes(subData.estimatedDuration)) {
            setSelectedDuration(subData.estimatedDuration);
            setIsCustomDuration(false);
          } else {
            setIsCustomDuration(true);
            setCustomDuration(subData.estimatedDuration || '');
          }
          setNotes(subData.notes || '');
          if (subData.quoteDocumentUrl) {
            setQuoteFileUrl(subData.quoteDocumentUrl);
          }
        }

        if (searchParams.get('view') === 'contract') {
          setShowContractModal(true);
        }
      } catch (err: any) {
        console.error("Error loading contractor portal data:", err);
        setErrorMessage('אירעה שגיאה בטעינת נתוני הבקשה. אנא נסה לרענן.');
      } finally {
        setLoading(false);
      }
    }

    loadPortalData();
  }, [rfqId, routeTenantId, queryTenantId, vendorId]);

  // Audio Toggle
  const togglePlayAudio = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!audioPlayerRef.current) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play().then(() => {
        setIsPlayingAudio(true);
      }).catch(err => {
        console.error("Audio playback error:", err);
        setIsPlayingAudio(false);
      });
    }
  };

  // Device Whitelist Phone Verification Handler
  const handleVerifyDevicePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedVendor || !resolvedTenantId || !rfqId) return;

    setAuthError('');
    setIsVerifyingPhone(true);

    try {
      const cleanPhone = (p: string) => (p || '').replace(/\D/g, '');
      const cleanEntered = cleanPhone(authPhoneInput);
      const cleanExpected = cleanPhone(matchedVendor.phone);

      if (cleanEntered.length < 9) {
        setAuthError('מספר הטלפון חייב להכיל לפחות 9 ספרות (לדוגמה: 0501234567).');
        setIsVerifyingPhone(false);
        return;
      }

      const last9Entered = cleanEntered.slice(-9);
      const last9Expected = cleanExpected.slice(-9);

      if (last9Entered !== last9Expected) {
        // Audit log failed verification attempt from unauthorized device
        await logAction({
          tenantId: resolvedTenantId,
          action: 'CONTRACTOR_AUTH_FAILED',
          actor: {
            uid: vendorId || 'unauthorized_device',
            name: 'מכשיר לא מאומת',
            type: 'vendor'
          },
          details: {
            rfqId,
            vendorId,
            enteredPhoneTail: cleanEntered.slice(-4)
          }
        });

        setAuthError('מספר הטלפון שהוזן אינו תואם את רשימת הספקים המורשים של הלקוח עבור פנייה זו (שגיאה 403). הגישה חסומה.');
        setIsVerifyingPhone(false);
        return;
      }

      // Successful verification!
      try {
        localStorage.setItem('tiktak_contractor_phone', cleanEntered);
      } catch (err) {
        console.warn('Failed to save to localStorage:', err);
      }

      await logAction({
        tenantId: resolvedTenantId,
        action: 'CONTRACTOR_AUTH_SUCCESS',
        actor: {
          uid: vendorId,
          name: matchedVendor.vendorName,
          type: 'vendor'
        },
        details: {
          rfqId,
          vendorId
        }
      });

      setIsDeviceAuthenticated(true);
    } catch (err: any) {
      console.error('Device phone verification error:', err);
      setAuthError('אירעה שגיאה בבדיקת מספר הטלפון. אנא נסה שוב.');
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  // Handler for Contractor 4-digit Whitelist Phone Challenge
  const handleVerifyLast4Digits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedVendor?.phone) {
      setVendorLast4Error('מספר הטלפון של הקבלן אינו רשום במערכת.');
      return;
    }
    const cleanRegistered = matchedVendor.phone.replace(/\D/g, '');
    const expectedLast4 = cleanRegistered.slice(-4);
    const enteredLast4 = vendorLast4Input.replace(/\D/g, '');

    if (enteredLast4.length !== 4 || enteredLast4 !== expectedLast4) {
      setVendorLast4Error('4 הספרות האחרונות שהוקלדו אינן תואמות את מספר הטלפון הרשום של הקבלן ב-Whitelist.');
      return;
    }

    // Success: close challenge and open signature canvas
    setVendorLast4Error('');
    setShowPhoneChallengeModal(false);
    setShowVendorSignModal(true);
  };

  // Handler for Contractor Online Signature Submission
  const handleVendorContractSign = async (
    signatureDataUrl: string,
    signerName: string,
    extraData?: { companyId?: string }
  ) => {
    if (!rfq || !resolvedTenantId || !rfq.id) return;
    try {
      const signedAt = new Date().toISOString();
      const committeeSig = rfq.contractExecution?.committeeSignature;
      const vendorCompanyId = extraData?.companyId || matchedVendor?.companyId || '';

      const vendorSignatureObj: any = {
        signerName,
        signerRole: 'קבלן מבצע מורשה',
        signatureDataUrl,
        signedAt
      };
      if (vendorCompanyId) vendorSignatureObj.companyId = vendorCompanyId.trim();
      if (matchedVendor?.phone) vendorSignatureObj.signerPhone = matchedVendor.phone.trim();
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        vendorSignatureObj.userAgent = navigator.userAgent;
      }

      const updatedExecution: any = {
        status: 'fully_signed',
        contractVersion: (rfq.contractExecution?.contractVersion || 1),
        vendorSignature: vendorSignatureObj,
        fullySignedAt: signedAt
      };
      if (committeeSig) {
        updatedExecution.committeeSignature = committeeSig;
      }

      // Persist to Firestore
      const rfqDocRef = doc(db, "tenants", resolvedTenantId, "rfqs", rfq.id);
      await setDoc(rfqDocRef, {
        contractExecution: updatedExecution,
        updatedAt: signedAt
      }, { merge: true });

      // Update local state
      setRfq(prev => prev ? { ...prev, contractExecution: updatedExecution as ContractExecutionData } : null);
      setShowVendorSignModal(false);
      setContractSignedSuccess(true);

      // Audit Log Event
      await logAction({
        tenantId: resolvedTenantId,
        action: 'CONTRACT_FULLY_SIGNED',
        actor: {
          uid: matchedVendor?.vendorId || vendorId || 'vendor',
          name: signerName || matchedVendor?.vendorName || 'קבלן זוכה',
          type: 'vendor'
        },
        details: {
          rfqId: rfq.id,
          rfqTitle: rfq.title,
          winningVendorName: matchedVendor?.vendorName,
          companyId: vendorCompanyId,
          totalWithVat: rfq.awardedPrice
        }
      });
    } catch (err) {
      console.error('Error submitting vendor contract signature:', err);
      alert('אירעה שגיאה בחתימת ההסכם. אנא נסה שוב.');
    }
  };

  // VAT Calculations
  const numericPrice = parseFloat(priceInput) || 0;
  const calculatedTotalWithVat = priceIncludesVat
    ? numericPrice
    : Math.round(numericPrice * 1.18);
  const calculatedBasePrice = priceIncludesVat
    ? Math.round(numericPrice / 1.18)
    : numericPrice;

  // File Upload Handler with Antivirus & Whitelist Validation
  const handleQuoteFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const files = e.target.files;
    if (!files || files.length === 0 || !resolvedTenantId || !rfqId) return;

    const file = files[0];
    const fileNameLower = file.name.toLowerCase();
    const nameParts = fileNameLower.split('.');
    const ext = nameParts[nameParts.length - 1] || '';

    // 1. Block any file with multiple extensions containing blocked extensions (e.g., invoice.pdf.exe)
    if (nameParts.some(part => BLOCKED_EXTENSIONS.includes(part))) {
      setFileError(`הקובץ "${file.name}" נחסם מטעמי אבטחה (מכיל סיומת מסוכנת או חשד להסוואת קובץ מזיק).`);
      e.target.value = '';
      return;
    }

    // 2. Strict Whitelist Check
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`סיומת הקובץ .${ext} אינה מורשית. ניתן לצרף קובצי Word, Excel, PDF או תמונות (DOC, DOCX, XLS, XLSX, PDF, JPG, PNG, WEBP).`);
      e.target.value = '';
      return;
    }

    // 3. MIME-Type Check
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      setFileError(`סוג הקובץ (${file.type}) אינו מורשה להעלאה. יש לצרף מסמך Word, Excel, PDF או תמונה תקינים.`);
      e.target.value = '';
      return;
    }

    // 4. File Size Check (5MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setFileError(`גודל הקובץ (${sizeMb}MB) חורג מהמקסימום המותר של 5MB.`);
      e.target.value = '';
      return;
    }

    // 5. Binary Magic Bytes (Signature) Inspection for Viruses & Disguised Executables
    const sigCheck = await validateFileSignature(file);
    if (!sigCheck.valid) {
      setFileError(sigCheck.reason || 'הקובץ נחסם מטעמי אבטחה כהגנה מפני קבצים מזיקים.');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    try {
      // Sanitize filename to prevent directory traversal or script injection
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const rfqDocId = rfq?.id || rawRfqId || 'general';
      const storageRef = ref(storage, `tenants/${resolvedTenantId}/rfqs/${rfqDocId}/quotes/temp_${Date.now()}_${sanitizedName}`);
      
      const resolveMimeType = (extStr: string, originalType: string) => {
        if (originalType && originalType !== 'application/octet-stream') return originalType;
        switch (extStr) {
          case 'pdf': return 'application/pdf';
          case 'doc': return 'application/msword';
          case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          case 'xls': return 'application/vnd.ms-excel';
          case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          case 'jpg':
          case 'jpeg': return 'image/jpeg';
          case 'png': return 'image/png';
          case 'webp': return 'image/webp';
          default: return originalType || 'application/octet-stream';
        }
      };

      const metadata = {
        contentType: resolveMimeType(ext, file.type),
        customMetadata: {
          originalName: file.name,
          uploadedByVendorId: matchedVendor?.vendorId || vendorId || 'contractor',
          uploadedAt: new Date().toISOString()
        }
      };

      const uploadResult = await uploadBytes(storageRef, file, metadata);
      const downloadUrl = await getDownloadURL(uploadResult.ref);
      setQuoteFile(file);
      setQuoteFileUrl(downloadUrl);
    } catch (err: any) {
      console.error("Quote file upload error:", err);
      setFileError('שגיאה בהעלאת הקובץ לשרת. אנא ודא שהקובץ תקין ונסה שוב.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // Form Submit Handler
  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfq || !resolvedTenantId) return;

    if (numericPrice <= 0) {
      alert('נא להזין מחיר תקין להצעת המחיר.');
      return;
    }

    const durationToSave = isCustomDuration ? customDuration.trim() : selectedDuration;
    if (!durationToSave) {
      alert('נא לציין משך ביצוע משוער לעבודה.');
      return;
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const submissionDocId = matchedVendor?.vendorId || vendorId || `vendor_${Date.now()}`;

      const payload: VendorQuoteSubmission = {
        id: submissionDocId,
        rfqId: rfq.id,
        tenantId: resolvedTenantId,
        vendorId: matchedVendor?.vendorId || vendorId || 'unknown',
        vendorName: matchedVendor?.vendorName || 'קבלן עצמאי',
        vendorPhone: matchedVendor?.phone || '',
        vendorType: matchedVendor?.vendorType || 'occasional',
        price: numericPrice,
        priceIncludesVat,
        totalPriceWithVat: calculatedTotalWithVat,
        estimatedDuration: durationToSave,
        status: 'submitted',
        submittedAt: nowIso,
        updatedAt: nowIso,
        basedOnScopeVersion: rfq.scopeVersion || 1
      };

      if (rfq.ticketId) payload.ticketId = rfq.ticketId;
      if (notes.trim()) payload.notes = notes.trim();
      if (quoteFileUrl) payload.quoteDocumentUrl = quoteFileUrl;
      if (matchedVendor?.tokenHash || tokenHash) payload.tokenHash = matchedVendor?.tokenHash || tokenHash;

      // Remove any undefined properties to ensure Firestore setDoc compatibility
      const cleanFirestorePayload = Object.fromEntries(
        Object.entries(payload).filter(([_, val]) => val !== undefined)
      );

      // Save submission document
      const subRef = doc(db, "tenants", resolvedTenantId, "rfqs", rfq.id, "submissions", submissionDocId);
      await setDoc(subRef, cleanFirestorePayload, { merge: true });

      // Audit Log
      await logAction({
        tenantId: resolvedTenantId,
        action: existingSubmission ? 'VENDOR_QUOTE_UPDATED' : 'VENDOR_QUOTE_SUBMITTED',
        actor: {
          uid: vendorId || 'contractor',
          name: matchedVendor?.vendorName || 'קבלן',
          type: 'vendor'
        },
        details: {
          rfqId: rfq.id,
          rfqTitle: rfq.title,
          vendorId: matchedVendor?.vendorId || vendorId,
          vendorName: matchedVendor?.vendorName || 'קבלן',
          price: numericPrice,
          priceIncludesVat,
          totalPriceWithVat: calculatedTotalWithVat,
          duration: durationToSave,
          basedOnScopeVersion: rfq.scopeVersion || 1
        }
      });

      // Haptic confirmation
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }

      // Server-side Push WhatsApp Notification to Admin (Pillar 1)
      fetch('/api/notifyQuoteSubmission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: resolvedTenantId,
          rfqId: rfq.id,
          submissionId: submissionDocId
        })
      }).catch(pushErr => {
        console.warn("Background admin WhatsApp notification error:", pushErr);
      });

      setExistingSubmission(payload);
      setSubmittedSuccessfully(true);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error("Error submitting quote:", err);
      alert('אירעה שגיאה בשליחת ההצעה. אנא נסה שוב.');
    } finally {
      setSubmitting(false);
    }
  };

  // Dynamic Customer Type & Name Resolution (Point 3)
  const resolvedType = (tenantInfo?.type || rfq?.tenantType || '').toLowerCase();
  const resolvedName = tenantInfo?.name || rfq?.tenantName || '';
  const isSettlement = resolvedType === 'settlement' || resolvedType === 'municipality';
  const isCompany = resolvedType === 'company';

  const customerHeaderTitle = resolvedName || (isSettlement ? 'מזכירות היישוב' : isCompany ? 'חברת הניהול' : 'ועד הבית');
  const recipientRole = isSettlement ? 'המזכירות' : isCompany ? 'ההנהלה' : 'הוועד';
  const directRecipientText = isSettlement
    ? (resolvedName ? `למזכירות ${resolvedName}` : 'למזכירות היישוב')
    : isCompany
    ? (resolvedName ? `להנהלת ${resolvedName}` : 'להנהלת המתחם')
    : (resolvedName ? `לוועד ${resolvedName}` : 'לוועד הבית');

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-slate-500" dir="rtl">
        <Loader2 className="animate-spin text-blue-600 mb-3" size={36} />
        <span className="text-sm font-bold">טוען מפרט הצעת מחיר...</span>
      </div>
    );
  }

  // Error / Expired / Closed Screen
  if (errorMessage || !rfq) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900">הקישור אינו זמין</h2>
          <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
            {errorMessage || 'בקשת הצעת המחיר אינה קיימת או שהקישור פג תוקף.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16 font-sans" dir="rtl">
      {/* Brand Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3.5 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo_transparent.png" alt="TikTak" className="h-8 w-auto object-contain" />
            <div>
              <span className="text-xs font-black tracking-tight text-slate-900 block leading-none">TikTak RFQ</span>
              <span className="text-[10px] text-slate-500 font-bold block">פורטל קבלנים וספקים</span>
            </div>
          </div>

          <div className="text-left">
            <span className="text-xs font-extrabold text-blue-700 block line-clamp-1">
              {customerHeaderTitle}
            </span>
            <span className="text-[10px] text-slate-400 block font-medium">
              {isDeviceAuthenticated ? `פנייה #${rfq.ticketNumber || rfq.id.slice(0, 6)}` : 'אימות מאובטח 🔒'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Contractor Greeting Banner */}
        {matchedVendor && (
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                {matchedVendor.vendorName.charAt(0)}
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 block leading-none">הצעה מיועדת עבור:</span>
                <span className="text-sm font-black text-slate-900">{matchedVendor.vendorName}</span>
              </div>
            </div>
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
              matchedVendor.vendorType === 'retainer'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              {matchedVendor.vendorType === 'retainer' ? 'ספק קבוע 🏢' : 'קבלן מורשה 🛠️'}
            </span>
          </div>
        )}

        {/* Device Whitelist Verification Gate (QA Security Gate: Unauthenticated devices cannot view or submit RFQ) */}
        {!isDeviceAuthenticated ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm text-center space-y-6 animate-in fade-in">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
              <ShieldCheck size={36} />
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                אימות זהות קבלן מורשה (Whitelist)
              </span>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                שלום {matchedVendor?.vendorName || 'קבלן מורשה'}
              </h2>
              <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium max-w-sm mx-auto">
                לצורך הגנה על פרטי הפנייה ומניעת גישה ממכשירים לא מורשים, נא לאמת את מספר הטלפון הנייד המשויך להזמנה זו:
              </p>
            </div>

            {authError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-start gap-2.5 text-right animate-in fade-in">
                <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="block font-black">שגיאת אימות הרשאה (403):</span>
                  <span>{authError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleVerifyDevicePhone} className="space-y-4 max-w-sm mx-auto">
              <div className="relative">
                <input
                  type="tel"
                  dir="ltr"
                  required
                  autoFocus
                  value={authPhoneInput}
                  onChange={e => {
                    setAuthPhoneInput(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  placeholder="05X-XXXXXXX"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 text-center text-lg font-black text-slate-900 tracking-widest outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-slate-300"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingPhone || !authPhoneInput.trim()}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-black shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isVerifyingPhone ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>בודק מול רשימת המורשים...</span>
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    <span>אימות מספר טלפון וכניסה לפנייה</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>אימות מאובטח מול רשימת המורשים של {customerHeaderTitle}</span>
            </div>
          </div>
        ) : (
          <>
            {/* Awarded Winner Banner & Contract Access with Online Signing */}
            {rfq.status === 'awarded' && rfq.awardedVendorId === matchedVendor?.vendorId ? (
              <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/70 border-2 border-emerald-400 text-emerald-950 space-y-3 shadow-md animate-in fade-in">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-sm shrink-0">
                    <Trophy size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-emerald-950 flex items-center gap-2 flex-wrap">
                      <span>ברכות! הצעתך אושרה והמכרז הוענק לך 🏆</span>
                      {rfq.contractExecution?.status === 'fully_signed' ? (
                        <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 size={12} />
                          <span>הסכם חתום ומחייב ✓</span>
                        </span>
                      ) : rfq.contractExecution?.status === 'signed_by_admin' ? (
                        <span className="text-[10px] bg-blue-600 text-white font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs animate-pulse">
                          <PenTool size={12} />
                          <span>ממתין לחתימתך הדיגיטלית ✍️</span>
                        </span>
                      ) : null}
                    </h3>
                    <p className="text-xs text-emerald-800 font-medium">
                      {rfq.contractExecution?.status === 'fully_signed'
                        ? 'הסכם העבודה חתום דיגיטלית במלואו ע״י שני הצדדים. באפשרותך לצפות ולהוריד עותק.'
                        : rfq.contractExecution?.status === 'signed_by_admin'
                        ? 'הסכם העבודה נחתם ע״י הנהלת המתחם וממתין לחתימתך הדיגיטלית לאישור תחילת העבודה.'
                        : 'הסכם ההתקשרות והזמנת העבודה המחייבת מוכנים לצפייה ולהדפסה.'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white/90 rounded-2xl border border-emerald-200 text-xs space-y-1">
                  <div><strong>תמורה מוסכמת:</strong> ₪{rfq.awardedPrice?.toLocaleString()} (כולל מע"מ)</div>
                  <div><strong>אתר ביצוע:</strong> {tenantInfo?.name || rfq.tenantName}</div>
                  {tenantInfo?.address && <div><strong>כתובת:</strong> {tenantInfo.address}</div>}
                  {rfq.contractExecution?.committeeSignature?.signedAt && (
                    <div className="text-blue-700 font-bold pt-1 border-t border-slate-100 flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-blue-600" />
                      <span>נחתם ע״י נציגות הוועד: {rfq.contractExecution.committeeSignature.signerName}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  {/* Action 1: Sign button if signed by admin and not yet signed by vendor */}
                  {rfq.contractExecution?.status === 'signed_by_admin' && !rfq.contractExecution.vendorSignature && (
                    <button
                      type="button"
                      onClick={() => {
                        setVendorLast4Input('');
                        setVendorLast4Error('');
                        setShowPhoneChallengeModal(true);
                      }}
                      className="flex-1 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      <PenTool size={16} />
                      <span>אישור וחתימה על ההסכם ✍️</span>
                    </button>
                  )}

                  {/* Action 2: View full contract modal */}
                  <button
                    type="button"
                    onClick={() => setShowContractModal(true)}
                    className={`py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                      rfq.contractExecution?.status === 'signed_by_admin' && !rfq.contractExecution.vendorSignature
                        ? 'px-4 bg-white/80 hover:bg-white text-emerald-900 border border-emerald-300'
                        : 'w-full bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <FileCheck2 size={16} />
                    <span>{rfq.contractExecution?.status === 'fully_signed' ? 'צפה בהסכם החתום (PDF) 📄' : 'צפה בהסכם העבודה 📄'}</span>
                  </button>
                </div>
              </div>
            ) : isClosed ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2.5">
                <Lock size={18} className="text-amber-600 shrink-0" />
                <span>בקשת הצעת המחיר נסגרה לקבלת הצעות נוספות. תודה רבה על שיתוף הפעולה!</span>
              </div>
            ) : null}

            {isExpired && !isClosed && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2.5">
                <Clock size={18} className="text-amber-600 shrink-0" />
                <span>
                  מועד הגשת הצעות המחיר הסתיים ב-{new Date(rfq.deadlineAt).toLocaleDateString('he-IL')}.
                </span>
              </div>
            )}

            {/* Success Confirmation Card (if already submitted or just submitted) */}
            {(submittedSuccessfully || existingSubmission) && !isClosed && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2 animate-in fade-in shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  <span className="text-sm font-black">הצעת המחיר שלך נקלטה במערכת! 🎉</span>
                </div>
                <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                  {recipientRole} קיבל/ה את הצעתך בסך <strong>₪{existingSubmission?.price?.toLocaleString()}</strong> ({existingSubmission?.priceIncludesVat ? 'כולל מע"מ' : '+ מע"מ'}).
                  תוכל לעדכן את הפרטים בטופס מטה בכל עת עד למועד הסגירה.
                </p>
              </div>
            )}

            {/* Scope Amendment / Addendum Banner (if amended) */}
            {rfq.scopeVersion && rfq.scopeVersion > 1 && (
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2.5 shadow-sm text-right animate-in fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-200 text-amber-800 rounded-lg">
                      <AlertTriangle size={18} />
                    </div>
                    <span className="text-sm font-black">
                      שים לב: מפרט הפנייה עודכן (גרסה {rfq.scopeVersion}) 📝
                    </span>
                  </div>
                  {rfq.scopeHistory && rfq.scopeHistory.length > 0 && (
                    <span className="text-[11px] font-bold text-amber-800">
                      עודכן ב-{new Date(rfq.scopeHistory[rfq.scopeHistory.length - 1].amendedAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {rfq.scopeHistory && rfq.scopeHistory.length > 0 && (
                  <div className="bg-white/90 p-3 rounded-xl border border-amber-200/80 text-xs space-y-1">
                    <div className="font-extrabold text-amber-900">דברי הסבר לעדכון המפרט והמשימות:</div>
                    <div className="font-medium text-slate-800 whitespace-pre-line leading-relaxed">
                      {rfq.scopeHistory[rfq.scopeHistory.length - 1].changeSummary}
                    </div>
                    {rfq.scopeHistory[rfq.scopeHistory.length - 1].changes?.allowedWorkHours && (
                      <div className="pt-1 text-[11px] text-slate-600 font-bold border-t border-slate-100">
                        שעות עבודה מעודכנות באתר: {rfq.scopeHistory[rfq.scopeHistory.length - 1].changes?.allowedWorkHours}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-amber-900 font-medium">
                  אנא וודא שהצעת המחיר שלך מתייחסת לדרישות המעודכנות במפרט זה.
                </p>
              </div>
            )}

        {/* 1. Job Scope Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black border border-blue-100">
              תחום: {rfq.category}
            </span>
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
              <Calendar size={13} />
              <span>תוקף: {new Date(rfq.deadlineAt).toLocaleDateString('he-IL')}</span>
            </span>
          </div>

          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-snug">
              {rfq.title}
            </h1>
            {rfq.location && (
              <p className="text-xs font-bold text-blue-600 mt-1">
                📍 {rfq.location}
              </p>
            )}
          </div>

          {rfq.description && (
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs md:text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-line break-words">
              {rfq.description}
            </div>
          )}

          {/* Fault Photo Preview */}
          {rfq.imageId && (
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-extrabold text-slate-700 block">תמונת התקלה מהמקום:</span>
              <div
                onClick={() => setShowImageModal(true)}
                className="relative rounded-2xl overflow-hidden border border-slate-200 cursor-pointer group aspect-video bg-slate-100"
              >
                <img
                  src={`/img/${resolvedTenantId}/${rfq.imageId}`}
                  alt="תמונת התקלה"
                  className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="bg-white/90 text-slate-800 text-xs font-black px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1">
                    <ImageIcon size={14} />
                    <span>לחץ להגדלה</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Voice Note Player */}
          {rfq.audioId && (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm cursor-pointer transition-all ${
                    isPlayingAudio
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                      : 'bg-white text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  {isPlayingAudio ? <Pause size={18} /> : <Play size={18} className="fill-emerald-700 translate-x-[-1px]" />}
                </button>
                <div>
                  <span className="text-xs font-black text-emerald-950 block">הקלטה קולית מהמקום</span>
                  <span className="text-[11px] text-emerald-700 font-medium block">
                    {isPlayingAudio ? 'משמיע כעת...' : 'לחץ להאזנה להסבר הדייר/הוועד'}
                  </span>
                </div>
              </div>
              <Mic size={20} className="text-emerald-500 opacity-60" />
              <audio
                ref={audioPlayerRef}
                src={`/aud/${resolvedTenantId}/${String(rfq.audioId).split('/').pop()}`}
                preload="metadata"
                onEnded={() => setIsPlayingAudio(false)}
                onPause={() => setIsPlayingAudio(false)}
                className="hidden"
              />
            </div>
          )}

          {/* Technical Attachments */}
          {rfq.attachments && rfq.attachments.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-xs font-extrabold text-slate-700 block">מסמכים ומפרטים מצורפים:</span>
              <div className="space-y-1.5">
                {rfq.attachments.map((att, idx) => (
                  <a
                    key={idx}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-xs font-bold text-slate-800 hover:text-blue-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip size={14} className="text-blue-600 shrink-0" />
                      <span className="truncate">{att.name}</span>
                    </div>
                    <ExternalLink size={13} className="opacity-50 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Requested Payment Terms & Site Conditions Card */}
        {(rfq.paymentTerms || rfq.wasteClause || rfq.allowedWorkHours) && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3.5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <Coins size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  תנאי תשלום ודרישות המזמין
                </h3>
                <span className="text-xs text-slate-400 font-medium">הנחיות מחייבות להגשת הצעת המחיר</span>
              </div>
            </div>

            {/* Payment Terms */}
            {rfq.paymentTerms && (
              <div className="space-y-2">
                <span className="text-xs font-extrabold text-slate-700 block">
                  {rfq.paymentTerms.mode === 'milestones'
                    ? `פריסת תשלום מבוקשת לפי שלבי ביצוע (${rfq.paymentTerms.phases?.length || 0} שלבים):`
                    : 'תנאי תשלום מבוקשים:'}
                </span>

                {rfq.paymentTerms.mode === 'milestones' && rfq.paymentTerms.phases && rfq.paymentTerms.phases.length > 0 ? (
                  <div className="space-y-1.5">
                    {rfq.paymentTerms.phases.map((phase, pIdx) => (
                      <div key={pIdx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{phase.stageName}</div>
                          {phase.description && (
                            <div className="text-[11px] text-slate-500 font-medium truncate">{phase.description}</div>
                          )}
                        </div>
                        <span className="font-black text-blue-700 shrink-0 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                          {phase.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                    {rfq.paymentTerms.singleTermText || 'שוטף + 30 יום מגמר העבודה ומסירת האתר'}
                  </div>
                )}
              </div>
            )}

            {/* Waste Policy */}
            {rfq.wasteClause && (
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <Truck size={14} className="text-blue-600" />
                  <span>הנחיות פינוי פסולת וניקיון:</span>
                </span>
                <p className="text-xs text-slate-700 bg-amber-50/60 border border-amber-200/70 p-2.5 rounded-xl leading-relaxed font-medium">
                  {rfq.wasteClause}
                </p>
              </div>
            )}

            {/* Allowed Work Hours */}
            {rfq.allowedWorkHours && (
              <div className="pt-1 text-xs text-slate-600">
                <strong>שעות עבודה מותרות באתר:</strong> {rfq.allowedWorkHours}
              </div>
            )}
          </div>
        )}

        {/* 2. Interactive Contractor Quote Submission Form */}
        {!isClosed && !isExpired && (
          <form onSubmit={handleSubmitQuote} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <FileText size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  {existingSubmission ? 'עדכון הצעת מחיר' : 'הגשת הצעת מחיר'}
                </h2>
                <span className="text-xs text-slate-400 font-medium">ללא צורך בהרשמה • נשלח ישירות {directRecipientText}</span>
              </div>
            </div>

            {/* Price & VAT */}
            <div className="space-y-2">
              <label className="block text-sm font-extrabold text-slate-800">
                מחיר מוצע לעבודה <span className="text-red-500">*</span>
              </label>

              <div className="relative">
                <input
                  type="number"
                  required
                  min={1}
                  step="any"
                  value={priceInput}
                  onChange={e => setPriceInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-4 pl-12 py-3.5 text-xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all"
                />
                <span className="absolute left-4 top-4 text-base font-black text-slate-400">
                  ₪
                </span>
              </div>

              {/* VAT Switcher */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPriceIncludesVat(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    !priceIncludesVat
                      ? 'bg-blue-50 border-blue-400 text-blue-700 font-extrabold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  לפני מע"מ (+18%)
                </button>
                <button
                  type="button"
                  onClick={() => setPriceIncludesVat(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    priceIncludesVat
                      ? 'bg-blue-50 border-blue-400 text-blue-700 font-extrabold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  כולל מע"מ
                </button>
              </div>

              {/* Dynamic Price Summary Helper */}
              {numericPrice > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-slate-500 font-medium">סה"כ לתשלום (כולל מע"מ):</span>
                    {priceIncludesVat && (
                      <span className="text-[11px] text-slate-400">
                        מחיר בסיס לפני מע"מ: ₪{calculatedBasePrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-black text-slate-900">
                    ₪{calculatedTotalWithVat.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Estimated Duration */}
            <div className="space-y-2">
              <label className="block text-sm font-extrabold text-slate-800">
                משך ביצוע משוער לעבודה <span className="text-red-500">*</span>
              </label>

              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map(preset => {
                  const isSelected = !isCustomDuration && selectedDuration === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setSelectedDuration(preset);
                        setIsCustomDuration(false);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setIsCustomDuration(true)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isCustomDuration
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  אחר...
                </button>
              </div>

              {isCustomDuration && (
                <input
                  type="text"
                  required
                  placeholder="ציין משך עבודה (לדוגמה: תלוי באספקת חלפים / יומיים)..."
                  value={customDuration}
                  onChange={e => setCustomDuration(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 text-slate-800"
                />
              )}
            </div>

            {/* Notes & Warranty */}
            <div className="space-y-2">
              <label className="block text-sm font-extrabold text-slate-800">
                הערות, תנאים ותקופת אחריות (רשות)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="לדוגמה: כולל חלפים מקוריים, אחריות לשנה, גישה למשאבות..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-100 resize-none text-slate-800 font-medium"
              />
            </div>

            {/* Formal Quote Document / Attachment */}
            <div className="space-y-2">
              <label className="block text-sm font-extrabold text-slate-800">
                קובץ הצעה רשמי / צילום מסמך (רשות)
              </label>

              {fileError && (
                <p className="text-xs text-red-500 font-bold">{fileError}</p>
              )}

              {quoteFileUrl ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs font-bold text-blue-900">
                  <div className="flex items-center gap-2 truncate">
                    <Paperclip size={14} className="text-blue-600 shrink-0" />
                    <span className="truncate">{quoteFile?.name || 'מסמך הצעת מחיר מצורף'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setQuoteFile(null); setQuoteFileUrl(''); }}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    הסר קובץ
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/40 rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                    onChange={handleQuoteFileUpload}
                    disabled={uploadingFile}
                    className="hidden"
                  />
                  {uploadingFile ? (
                    <div className="flex items-center gap-2 text-blue-600 font-bold text-xs">
                      <Loader2 className="animate-spin" size={16} />
                      <span>מעלה מסמך...</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={18} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-700">לחץ לצירוף קובץ הצעה (Word, Excel, PDF או תמונה)</span>
                      <span className="text-[10px] text-slate-400">DOC, DOCX, XLS, XLSX, PDF, תמונות עד 5MB</span>
                    </>
                  )}
                </label>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || uploadingFile || numericPrice <= 0}
                className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-base font-black shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>שולח הצעת מחיר...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>{existingSubmission ? 'עדכן הצעת מחיר 🚀' : `שלח הצעת מחיר ${directRecipientText} 🚀`}</span>
                  </>
                )}
              </button>
              <div className="mt-2 text-center flex items-center justify-center gap-1 text-[11px] text-slate-400 font-medium">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span>ההצעה מאובטחת ותועבר ישירות {directRecipientText}</span>
              </div>
            </div>
          </form>
        )}
      </>
    )}
  </main>

      {/* Lightbox Image Preview Modal */}
      {showImageModal && rfq.imageId && (
        <div
          onClick={() => setShowImageModal(false)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs cursor-pointer animate-in fade-in"
        >
          <div className="max-w-xl max-h-[90vh] overflow-hidden rounded-2xl bg-black">
            <img
              src={`/img/${resolvedTenantId}/${rfq.imageId}`}
              alt="תמונת התקלה בהגדלה"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Centered Submission Confirmation Modal (Point 5) */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm md:max-w-md w-full p-6 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50/60">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">הצעת המחיר נשלחה בהצלחה! 🎉</h3>
              <p className="text-xs md:text-sm text-slate-600 mt-1 leading-relaxed">
                הצעתך נמסרה ישירות <strong>{directRecipientText}</strong> ונרשמה במערכת.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2 text-right">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">סכום ההצעה:</span>
                <span className="font-black text-slate-900 text-sm">
                  ₪{numericPrice.toLocaleString()} {priceIncludesVat ? '(כולל מע"מ)' : '(+ מע"מ)'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">משך ביצוע משוער:</span>
                <span className="font-bold text-slate-800">
                  {isCustomDuration ? customDuration.trim() : selectedDuration}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">קובץ הצעה:</span>
                <span className="font-bold text-slate-800">
                  {quoteFileUrl ? 'קובץ הצעת מחיר מצורף ✅' : 'ללא קובץ'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              באפשרותך לחזור לקישור זה ולעדכן את פרטי ההצעה במידת הצורך עד למועד סגירת הפנייה.
            </p>

            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-sm shadow-md transition-all cursor-pointer"
            >
              הבנתי, תודה!
            </button>
          </div>
        </div>
      )}

      {/* Digital Work Order / Contract Modal for Contractor (Bug #4) */}
      {showContractModal && rfq && (
        <WorkOrderContractModal
          isOpen={showContractModal}
          onClose={() => setShowContractModal(false)}
          rfq={rfq}
          submission={
            existingSubmission || {
              id: rfq.awardedQuoteId || matchedVendor?.vendorId || 'awarded',
              rfqId: rfq.id,
              tenantId: resolvedTenantId,
              vendorId: matchedVendor?.vendorId || 'unknown',
              vendorName: matchedVendor?.vendorName || 'קבלן זוכה',
              vendorPhone: matchedVendor?.phone || '',
              vendorType: matchedVendor?.vendorType || 'occasional',
              price: rfq.awardedPrice || 0,
              priceIncludesVat: true,
              totalPriceWithVat: rfq.awardedPrice || 0,
              estimatedDuration: 'לפי תיאום',
              notes: '',
              status: 'accepted',
              submittedAt: rfq.awardedAt || new Date().toISOString()
            }
          }
          tenantInfo={tenantInfo}
          currentAdminName={rfq.createdBy?.name || undefined}
          isReadOnly={true}
          onContractorSignClick={() => {
            setVendorLast4Input('');
            setVendorLast4Error('');
            setShowPhoneChallengeModal(true);
          }}
        />
      )}

      {/* Step 1: Whitelist 4-Digits Verification Modal for Contractor Signing */}
      {showPhoneChallengeModal && matchedVendor && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto ring-6 ring-blue-50/60">
              <Lock size={28} />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">אימות זהות קבלן מורשה 🔒</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                לחתימה על הסכם העבודה מול <strong>{customerHeaderTitle}</strong>, אנא הקלד את <strong>4 הספרות האחרונות</strong> של מספר הטלפון הרשום שלך ב-Whitelist:
              </p>
            </div>

            {vendorLast4Error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold flex items-center gap-1.5 text-right">
                <span>⚠️</span>
                <span>{vendorLast4Error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyLast4Digits} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={vendorLast4Input}
                onChange={e => {
                  setVendorLast4Input(e.target.value.replace(/\D/g, '').slice(0, 4));
                  if (vendorLast4Error) setVendorLast4Error('');
                }}
                placeholder="XXXX"
                className="w-full py-3 text-center text-2xl font-black tracking-widest bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPhoneChallengeModal(false)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={vendorLast4Input.length !== 4}
                  className="flex-1 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  המשך לחתימה ✍️
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Step 2: Contractor Signature Canvas Modal */}
      {showVendorSignModal && rfq && matchedVendor && (
        <SignaturePadModal
          isOpen={showVendorSignModal}
          onClose={() => setShowVendorSignModal(false)}
          onSave={handleVendorContractSign}
          title="חתימה ואישור הסכם התקשרות"
          subtitle={`מול ${customerHeaderTitle} • מכרז #${rfq.ticketNumber || rfq.id.slice(0, 6)}`}
          defaultSignerName={matchedVendor.vendorName}
          defaultSignerPhone={matchedVendor.phone}
          requireCompanyId={true}
          requireConsentCheckbox={true}
          consentCheckboxText="אני מצהיר ומאשר כי קראתי את כל סעיפי ההסכם, לוחות הזמנים ושלבי התשלום, וחתימתי זו מהווה התחייבות חוזית ומשפטית מלאה ומחייבת של הקבלן המבצע בהתאם לחוק חתימה אלקטרונית, התשס״א-2001."
        />
      )}

      {/* Step 3: Success Confirmation Modal after Contractor Signs */}
      {contractSignedSuccess && (
        <div className="fixed inset-0 z-[130] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50/60">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">ההסכם נחתם בהצלחה! 🎉</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                חתימתך הדיגיטלית הוטבעה בהצלחה בהזמנת העבודה ונשמרה בכספת המשפטית המאובטחת. ההסכם כעת חתום וסופי ע״י שני הצדדים.
              </p>
            </div>

            <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-xs font-bold text-emerald-900 space-y-1 text-right">
              <div>✓ חתימת המזמין: מאושרת</div>
              <div>✓ חתימת הקבלן: מאושרת</div>
              <div>✓ תוקף משפטי: חוק חתימה אלקטרונית (2001)</div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setContractSignedSuccess(false);
                  setShowContractModal(true);
                }}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <FileCheck2 size={16} />
                <span>צפה בהסכם החתום (PDF) 📄</span>
              </button>
              <button
                type="button"
                onClick={() => setContractSignedSuccess(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
