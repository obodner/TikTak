import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  query,
  where
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import {
  FilePlus,
  Search,
  Check,
  X,
  Plus,
  Upload,
  AlertCircle,
  Paperclip,
  Share2,
  Trash2,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Image as ImageIcon,
  Mic,
  Play,
  Pause,
  ExternalLink,
  Save
} from 'lucide-react';
import { Vendor, VendorType, RfqAttachment, DispatchedVendorRecord, PaymentPhaseItem } from '../../types/rfq';
import { logAction } from '../../utils/auditLogger';

const DEFAULT_CATEGORIES = [
  'אינסטלציה',
  'חשמל',
  'גינון',
  'בינוי / צבע',
  'מעליות',
  'ניקיון',
  'מיזוג אוויר',
  'אינטרקום ושערים',
  'משאבות מים',
  'איטום וגגות'
];

const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'mp3',
  'mp4',
  'm4a',
  'wav',
  'aac'
];

const BLOCKED_EXTENSIONS = [
  'exe',
  'key',
  'bat',
  'cmd',
  'sh',
  'vbs',
  'msi',
  'zip',
  'scr',
  'dll',
  'bin',
  'apk'
];

const MAX_FILES = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function NewRfqPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthState();

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

  // Tenant metadata & categories
  const [tenantName, setTenantName] = useState('');
  const [tenantType, setTenantType] = useState<string>('building');
  const isSettlement = tenantType?.toLowerCase() === 'municipality' || tenantType?.toLowerCase() === 'settlement' || tenantType?.toLowerCase() === 'community';
  const [categoryPool, setCategoryPool] = useState<string[]>(DEFAULT_CATEGORIES);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Audio player state for linked ticket
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Draft editing state
  const draftId = searchParams.get('draftId') || searchParams.get('draft') || '';
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [loadedDraftCreatedAt, setLoadedDraftCreatedAt] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);
  const prevCategoryRef = useRef<string | null>(null);

  // Form State
  const [ticketLookupNumber, setTicketLookupNumber] = useState(
    searchParams.get('ticketNumber') || searchParams.get('ticket') || ''
  );
  const [linkedTicket, setLinkedTicket] = useState<any | null>(null);
  const [ticketSearchLoading, setTicketSearchLoading] = useState(false);
  const [ticketSearchError, setTicketSearchError] = useState('');

  const [category, setCategory] = useState<string>('אינסטלציה');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  // Payment Terms & Milestones
  const [paymentMode, setPaymentMode] = useState<'milestones' | 'single'>('milestones');
  const [singlePaymentTerm, setSinglePaymentTerm] = useState('שוטף + 30 יום מגמר העבודה ומסירת האתר');
  const [paymentPhases, setPaymentPhases] = useState<PaymentPhaseItem[]>([]);

  // Waste Policy Presets (Dynamic based on customer entity type: Settlement/Municipality vs Building)
  const WASTE_PRESETS = {
    construction: {
      id: 'construction',
      label: 'פסולת בניין והריסה (אתר מורשה חיצוני בלבד)',
      text: isSettlement
        ? 'הקבלן מתחייב לפנות את כל פסולת הבנייה, ההריסה, שקי המלט ושאריות החומרים אך ורק לאתר הטמנה/מיחזור מורשה כדין מחוץ לגבולות היישוב. חל איסור מוחלט על השלכת פסולת בניין לפחי האשפה של היישוב או בשטחים הציבוריים.'
        : 'הקבלן מתחייב לפנות את כל פסולת הבנייה, ההריסה, שקי המלט ושאריות החומרים אך ורק לאתר הטמנה/מיחזור מורשה כדין מחוץ לגבולות הבניין. חל איסור מוחלט על השלכת פסולת בניין לפחי האשפה של הבניין או בשטחים הציבוריים.'
    },
    garden: {
      id: 'garden',
      label: isSettlement ? 'גזם וגינון (נקודת איסוף מורשית ביישוב)' : 'גזם וגינון (נקודת איסוף מורשית בבניין)',
      text: isSettlement
        ? 'הקבלן מתחייב לרכז ולפנות את כל הגזם וענפי הגינון אך ורק אל נקודת הריכוז המורשית לפי הנחיות המזמין, ולהשאיר את השטח נקי ומסודר בסיום כל יום עבודה.'
        : 'הקבלן מתחייב לרכז ולפנות את כל הגזם וענפי הגינון אך ורק אל נקודת הריכוז המורשית לפי הנחיות נציגות הבניין, ולהשאיר את השטח נקי ומסודר בסיום כל יום עבודה.'
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

  const [wastePresetKey, setWastePresetKey] = useState<string>('construction');
  const [wasteClause, setWasteClause] = useState<string>(WASTE_PRESETS.construction.text);
  const [allowedWorkHours, setAllowedWorkHours] = useState<string>(
    'בימים א\'-ה\' בין השעות 08:00 - 17:00, ובימי ו\' וערבי חג עד השעה 13:00'
  );
  const [workStartDate, setWorkStartDate] = useState<string>('');
  const [workTargetEndDate, setWorkTargetEndDate] = useState<string>('');

  // Sync waste clause when customer type (isSettlement) or preset changes, unless user typed custom text
  useEffect(() => {
    if (wastePresetKey !== 'custom' && WASTE_PRESETS[wastePresetKey as keyof typeof WASTE_PRESETS]) {
      setWasteClause(WASTE_PRESETS[wastePresetKey as keyof typeof WASTE_PRESETS].text);
    }
  }, [isSettlement, wastePresetKey]);

  const handleUpdatePhase = (index: number, field: keyof PaymentPhaseItem, value: any) => {
    setPaymentPhases(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddPhase = () => {
    setPaymentPhases(prev => {
      const currentSum = prev.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0);
      const rem = Math.max(0, 100 - currentSum);
      const nextNum = prev.length + 1;
      return [
        ...prev,
        {
          stageName: `שלב ${nextNum}`,
          percentage: prev.length === 0 ? 100 : (rem > 0 ? rem : 10),
          description: ''
        }
      ];
    });
  };

  const handleRemovePhase = (index: number) => {
    setPaymentPhases(prev => prev.filter((_, idx) => idx !== index));
  };

  const totalPhasesPercentage = paymentPhases.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0);

  // Attachments
  const [attachments, setAttachments] = useState<RfqAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [fileError, setFileError] = useState('');

  // Deadline selection
  const [deadlinePreset, setDeadlinePreset] = useState<'48h' | '7d' | '14d' | 'custom'>('7d');
  const [customDeadline, setCustomDeadline] = useState('');

  // Selected Vendor IDs
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);

  // Submitting
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Quick Add Vendor state
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState<{
    fullName: string;
    phone: string;
    email: string;
    companyId: string;
    vendorType: VendorType;
  }>({
    fullName: '',
    phone: '',
    email: '',
    companyId: '',
    vendorType: 'occasional'
  });
  const [newVendorSaving, setNewVendorSaving] = useState(false);
  const [newVendorError, setNewVendorError] = useState('');

  // Customer Type Helpers
  const locationFieldLabel = isSettlement ? 'מיקום מדויק בישוב' : 'מיקום מדויק בבניין';
  const locationFieldPlaceholder = isSettlement
    ? 'לדוגמה: ליד גן השעשועים המרכזי, רחוב הזית 4'
    : 'לדוגמה: חניון תחתון קומה -2, ליד עמוד 14';

  // Audio player toggle
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

  // Category addition state
  const [showAddCustomCategory, setShowAddCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  const handleAddCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = customCategoryInput.trim();
    if (!cleanTag) return;

    if (!categoryPool.includes(cleanTag)) {
      setCategoryPool(prev => [...prev, cleanTag]);
    }
    setCategory(cleanTag);
    setCustomCategoryInput('');
    setShowAddCustomCategory(false);

    if (tenantId) {
      try {
        await updateDoc(doc(db, "tenants", tenantId), {
          "config.categories": arrayUnion(cleanTag),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn("Could not save new category to tenant config:", err);
      }
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewVendorError('');
    const cleanName = newVendorForm.fullName.trim();
    const cleanPhone = newVendorForm.phone.trim();
    const cleanEmail = newVendorForm.email.trim();
    const cleanCompanyId = newVendorForm.companyId.trim();

    if (!cleanName) {
      setNewVendorError('שם הקבלן הינו שדה חובה');
      return;
    }
    if (!cleanPhone) {
      setNewVendorError('מספר טלפון הינו שדה חובה');
      return;
    }

    setNewVendorSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const vendorPayload = {
        fullName: cleanName,
        phone: cleanPhone,
        email: cleanEmail || null,
        companyId: cleanCompanyId || null,
        categories: [category],
        profession: category,
        vendorType: newVendorForm.vendorType,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const docRef = await addDoc(collection(db, "tenants", tenantId as string, "vendors"), vendorPayload);
      const createdVendor: Vendor = {
        id: docRef.id,
        fullName: cleanName,
        phone: cleanPhone,
        email: cleanEmail || undefined,
        companyId: cleanCompanyId || undefined,
        categories: [category],
        profession: category,
        vendorType: newVendorForm.vendorType,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      setVendors(prev => [...prev, createdVendor]);
      setSelectedVendorIds(prev => Array.from(new Set([...prev, docRef.id])));

      await logAction({
        tenantId: tenantId as string,
        action: 'VENDOR_ADDED',
        actor: {
          uid: user?.uid || 'admin',
          name: adminProfile?.fullName || user?.email?.split('@')[0] || 'ועד הבית',
          email: user?.email || undefined,
          type: 'admin'
        },
        details: { vendorId: docRef.id, fullName: cleanName, phone: cleanPhone, categories: [category], companyId: cleanCompanyId }
      });

      setShowAddVendorModal(false);
      setNewVendorForm({
        fullName: '',
        phone: '',
        email: '',
        companyId: '',
        vendorType: 'occasional'
      });
    } catch (err: any) {
      console.error("Error creating vendor in RFQ form:", err);
      setNewVendorError(err.message || 'שגיאה ביצירת איש השירות');
    } finally {
      setNewVendorSaving(false);
    }
  };

  // 1. Load initial tenant config & vendor directory
  useEffect(() => {
    if (!tenantId) return;

    async function loadData() {
      setLoadingInitial(true);
      try {
        // Load Tenant
        const tenantSnap = await getDoc(doc(db, "tenants", tenantId as string));
        let tenantCategories: string[] = [];
        if (tenantSnap.exists()) {
          const tData = tenantSnap.data();
          setTenantName(tData.name || tenantId);
          if (tData.type) {
            setTenantType(tData.type);
          }
          tenantCategories = [
            ...(Array.isArray(tData.config?.categories) ? tData.config.categories : []),
            ...(Array.isArray(tData.categories) ? tData.categories : [])
          ];
        }

        // Load Vendors
        const vendorsSnap = await getDocs(collection(db, "tenants", tenantId as string, "vendors"));
        const vList: Vendor[] = vendorsSnap.docs.map(d => {
          const vData = d.data();
          let resolvedCats: string[] = Array.isArray(vData.categories) ? vData.categories : [];
          if (resolvedCats.length === 0 && vData.profession) {
            resolvedCats = [vData.profession];
          }
          return {
            id: d.id,
            fullName: vData.fullName || '',
            phone: vData.phone || '',
            email: vData.email,
            profession: vData.profession,
            companyId: vData.companyId || undefined,
            categories: resolvedCats,
            vendorType: (vData.vendorType as VendorType) || 'occasional',
            notes: vData.notes
          };
        });
        setVendors(vList);

        // Merge all categories: Tenant Config + Vendor Tags + Default Categories
        const vendorCategories = vList.flatMap(v => v.categories);
        const combinedCategories = Array.from(new Set([
          ...tenantCategories,
          ...vendorCategories,
          ...DEFAULT_CATEGORIES
        ])).filter(Boolean);

        setCategoryPool(combinedCategories);
        if (combinedCategories.length > 0) {
          setCategory(prev => (prev && combinedCategories.includes(prev)) ? prev : combinedCategories[0]);
        }
      } catch (err) {
        console.error("Error loading initial RFQ data:", err);
      } finally {
        setLoadingInitial(false);
      }
    }

    loadData();
  }, [tenantId]);

  // 2. Auto-trigger ticket lookup if query parameter present (only when creating brand new RFQ, not when loading draft)
  useEffect(() => {
    const queryParam = searchParams.get('ticketNumber') || searchParams.get('ticket');
    if (queryParam && tenantId && !draftId) {
      handleLookupTicket(queryParam);
    }
  }, [tenantId, draftId]);

  // 3. Filter contractors based on active category
  const matchingVendors = vendors.filter(v => {
    if (!category) return false;
    const catLower = category.toLowerCase();
    const hasCategory = v.categories.some(c => c.toLowerCase() === catLower || c.toLowerCase().includes(catLower));
    const hasLegacy = v.profession ? v.profession.toLowerCase().includes(catLower) : false;
    return hasCategory || hasLegacy;
  });

  // Whenever matchingVendors change, auto-select all matching by default (unless loading a draft with preserved selection)
  useEffect(() => {
    if (draftId && draftLoadedRef.current) {
      if (prevCategoryRef.current && prevCategoryRef.current !== category) {
        prevCategoryRef.current = category;
        setSelectedVendorIds(matchingVendors.map(v => v.id));
      }
      return;
    }
    prevCategoryRef.current = category;
    setSelectedVendorIds(matchingVendors.map(v => v.id));
  }, [category, vendors, draftId, matchingVendors.length]);

  // 2b. Auto-load draft if draftId is present
  useEffect(() => {
    if (!draftId || !tenantId) return;

    let isMounted = true;
    getDoc(doc(db, "tenants", tenantId, "rfqs", draftId)).then(async snap => {
      if (snap.exists() && isMounted) {
        const d = snap.data();

        // 1. Mark draft loaded immediately to protect vendor selection
        draftLoadedRef.current = true;

        // 2. Link ticket if linked to this draft, but strictly SKIP overwriting form fields!
        if (d.ticketNumber) {
          setTicketLookupNumber(String(d.ticketNumber));
          await handleLookupTicket(String(d.ticketNumber), true);
        } else if (d.ticketId) {
          await handleLookupTicket(d.ticketId, true);
        }

        if (!isMounted) return;

        // 3. Populate draft fields (guaranteed to reflect latest saved state)
        if (d.title !== undefined) setTitle(d.title);
        if (d.category) {
          setCategoryPool(prev => prev.includes(d.category) ? prev : [d.category, ...prev]);
          setCategory(d.category);
          prevCategoryRef.current = d.category;
        }
        if (d.description !== undefined) setDescription(d.description);
        if (d.location !== undefined) setLocation(d.location);
        if (Array.isArray(d.attachments)) setAttachments(d.attachments);
        if (d.createdAt) setLoadedDraftCreatedAt(d.createdAt);

        if (d.paymentTerms) {
          if (d.paymentTerms.mode) setPaymentMode(d.paymentTerms.mode);
          if (d.paymentTerms.singleTermText) setSinglePaymentTerm(d.paymentTerms.singleTermText);
          if (Array.isArray(d.paymentTerms.phases) && d.paymentTerms.phases.length > 0) {
            setPaymentPhases(d.paymentTerms.phases);
          }
        }
        if (d.wasteClause) setWasteClause(d.wasteClause);
        if (d.allowedWorkHours) setAllowedWorkHours(d.allowedWorkHours);
        if (d.workStartDate) setWorkStartDate(d.workStartDate);
        if (d.workTargetEndDate) setWorkTargetEndDate(d.workTargetEndDate);

        if (Array.isArray(d.dispatchedVendors) && d.dispatchedVendors.length > 0) {
          setSelectedVendorIds(d.dispatchedVendors.map((v: any) => v.vendorId));
        }

        if (d.deadlineAt) {
          setDeadlinePreset('custom');
          try {
            const dt = new Date(d.deadlineAt);
            if (!isNaN(dt.getTime())) {
              setCustomDeadline(dt.toISOString().slice(0, 16));
            }
          } catch (e) {}
        }
      }
    }).catch(err => console.warn('Could not load draft RFQ:', err));

    return () => {
      isMounted = false;
    };
  }, [draftId, tenantId]);

  const handleSelectAllToggle = () => {
    if (selectedVendorIds.length === matchingVendors.length) {
      setSelectedVendorIds([]);
    } else {
      setSelectedVendorIds(matchingVendors.map(v => v.id));
    }
  };

  const handleVendorToggle = (vendorId: string) => {
    setSelectedVendorIds(prev =>
      prev.includes(vendorId) ? prev.filter(id => id !== vendorId) : [...prev, vendorId]
    );
  };

  // Ticket Lookup Logic
  const handleLookupTicket = async (numToSearch?: string, skipFieldsOverwrite = false) => {
    const rawVal = (numToSearch !== undefined ? numToSearch : ticketLookupNumber).trim();
    if (!rawVal || !tenantId) return;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setIsPlayingAudio(false);

    setTicketSearchLoading(true);
    setTicketSearchError('');

    try {
      const ticketsRef = collection(db, "tenants", tenantId, "tickets");
      let foundTicket: any = null;

      // Try numeric match first
      const numericVal = Number(rawVal.replace('#', ''));
      if (!isNaN(numericVal)) {
        const qNum = query(ticketsRef, where("ticketNumber", "==", numericVal));
        const snapNum = await getDocs(qNum);
        if (!snapNum.empty) {
          foundTicket = { id: snapNum.docs[0].id, ...snapNum.docs[0].data() };
        }
      }

      // If not found by number, try doc ID lookup
      if (!foundTicket) {
        const docSnap = await getDoc(doc(db, "tenants", tenantId, "tickets", rawVal));
        if (docSnap.exists()) {
          foundTicket = { id: docSnap.id, ...docSnap.data() };
        }
      }

      if (!foundTicket) {
        setTicketSearchError(`לא נמצאה קריאת שירות עם מספר ${rawVal}`);
        return;
      }

      // Link ticket to RFQ
      setLinkedTicket(foundTicket);

      // Only auto-populate form fields if not explicitly requested to skip (e.g. when loading a saved draft)
      if (!skipFieldsOverwrite) {
        if (foundTicket.category) {
          setCategory(foundTicket.category);
        }
        if (foundTicket.summary) {
          setTitle(foundTicket.summary);
          setDescription(foundTicket.summary);
        }
        const locStr = [foundTicket.location, foundTicket.subLocation, foundTicket.floor]
          .filter(Boolean)
          .join(' - ');
        if (locStr) {
          setLocation(locStr);
        }
      }
    } catch (err: any) {
      console.error("Ticket lookup error:", err);
      setTicketSearchError('שגיאה בחיפוש קריאת השירות');
    } finally {
      setTicketSearchLoading(false);
    }
  };

  const handleDetachTicket = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setIsPlayingAudio(false);
    setLinkedTicket(null);
    setTicketLookupNumber('');
    setTicketSearchError('');
  };

  // File Upload Logic with Whitelist Validation and Granular Error Handling
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError('');
    const files = e.target.files;
    if (!files || files.length === 0 || !tenantId) return;

    // Rule: In a case of uploading more than 3 files, notify that all failed because of number of files limit reach
    if (files.length > MAX_FILES || attachments.length + files.length > MAX_FILES) {
      setFileError(`ההעלאה נכשלה: חריגה ממגבלת הקבצים. ניתן לצרף עד ${MAX_FILES} קבצים בסך הכל (ניסית להעלות ${files.length} קבצים, כרגע קיימים ${attachments.length}).`);
      e.target.value = '';
      return;
    }

    setUploadingFiles(true);
    const successfullyUploaded: RfqAttachment[] = [];
    const failedDetails: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      // Check blocked extension
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        failedDetails.push(`"${file.name}" נחסם (סיומת .${ext} מסוכנת)`);
        continue;
      }

      // Check whitelist
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        failedDetails.push(`"${file.name}" נחסם (סיומת .${ext} אינה מורשית)`);
        continue;
      }

      // Check file size (> 5MB)
      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        failedDetails.push(`"${file.name}" נכשל (גודל ${sizeMb}MB עולה על 5MB)`);
        continue;
      }

      try {
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
            case 'mp3': return 'audio/mpeg';
            case 'wav': return 'audio/wav';
            case 'm4a': return 'audio/mp4';
            case 'mp4': return 'video/mp4';
            default: return originalType || 'application/octet-stream';
          }
        };

        const resolvedMime = resolveMimeType(ext, file.type);

        // Upload to Storage
        const fileRef = ref(storage, `tenants/${tenantId}/rfqs/temp_${Date.now()}_${file.name}`);
        const uploadResult = await uploadBytes(fileRef, file, { contentType: resolvedMime });
        const downloadUrl = await getDownloadURL(uploadResult.ref);

        successfullyUploaded.push({
          name: file.name,
          url: downloadUrl,
          sizeBytes: file.size,
          mimeType: resolvedMime
        });
      } catch (uploadErr: any) {
        console.error(`Upload error for file ${file.name}:`, uploadErr);
        failedDetails.push(`"${file.name}" נכשל בהעלאה לשרת (${uploadErr.message || 'שגיאת הרשאה או שרת'})`);
      }
    }

    // Add successfully uploaded files
    if (successfullyUploaded.length > 0) {
      setAttachments(prev => [...prev, ...successfullyUploaded]);
    }

    // Notify about failures if any
    if (failedDetails.length > 0) {
      if (successfullyUploaded.length > 0) {
        setFileError(`הועלו ${successfullyUploaded.length} קבצים בהצלחה. הקבצים הבאים נכשלו: ${failedDetails.join(' | ')}`);
      } else {
        setFileError(`כל הקבצים נכשלו בהעלאה: ${failedDetails.join(' | ')}`);
      }
    }

    setUploadingFiles(false);
    e.target.value = '';
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Calculate deadline date
  const computeDeadlineIso = (): string => {
    const now = new Date();
    if (deadlinePreset === '48h') {
      now.setHours(now.getHours() + 48);
      return now.toISOString();
    }
    if (deadlinePreset === '7d') {
      now.setDate(now.getDate() + 7);
      return now.toISOString();
    }
    if (deadlinePreset === '14d') {
      now.setDate(now.getDate() + 14);
      return now.toISOString();
    }
    if (deadlinePreset === 'custom' && customDeadline) {
      const parsed = new Date(customDeadline);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    // Fallback 7 days
    now.setDate(now.getDate() + 7);
    return now.toISOString();
  };

  // Save RFQ as Draft (Pillar 1)
  const handleSaveDraft = async () => {
    if (!tenantId) return;
    setIsSavingDraft(true);
    setFormError('');

    try {
      const deadlineIso = computeDeadlineIso();
      const nowIso = new Date().toISOString();

      const selectedVendorsList = vendors.filter(v => selectedVendorIds.includes(v.id));
      const dispatchedRecords: DispatchedVendorRecord[] = selectedVendorsList.map(v => {
        const tokenHash = btoa(`${tenantId}:${v.id}:${Date.now()}:${v.phone}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
        return {
          vendorId: v.id,
          vendorName: v.fullName,
          phone: v.phone,
          vendorType: v.vendorType || 'occasional',
          companyId: v.companyId || '',
          sentAt: nowIso,
          tokenHash
        };
      });

      let creatorName = adminProfile?.fullName || 'ועד הבית';
      let creatorPhone: string | undefined = adminProfile?.mobile;
      if (!adminProfile?.fullName && user?.uid && tenantId) {
        try {
          const uSnap = await getDoc(doc(db, "tenants", tenantId, "adminUsers", user.uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            const fullName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
            if (fullName) creatorName = fullName;
            if (uData.mobile || uData.phone) creatorPhone = uData.mobile || uData.phone;
          }
        } catch (e) {
          console.warn('Could not fetch admin user details for RFQ creator:', e);
        }
      }

      const draftTitle = title.trim() || `טיוטת מכרז - ${category}`;

      const draftPayload: Record<string, any> = {
        tenantId,
        tenantName: tenantName || tenantId,
        tenantType: tenantType || 'building',
        title: draftTitle,
        category,
        description: description.trim(),
        attachments: attachments || [],
        targetCategory: category,
        paymentTerms: {
          mode: paymentMode,
          ...(paymentMode === 'single' ? { singleTermText: singlePaymentTerm } : { phases: paymentPhases })
        },
        ...(wasteClause.trim() ? { wasteClause: wasteClause.trim() } : {}),
        ...(allowedWorkHours.trim() ? { allowedWorkHours: allowedWorkHours.trim() } : {}),
        ...(workStartDate ? { workStartDate } : {}),
        ...(workTargetEndDate ? { workTargetEndDate } : {}),
        dispatchedVendors: dispatchedRecords,
        deadlineAt: deadlineIso,
        status: 'draft',
        createdBy: {
          uid: user?.uid || 'admin',
          name: creatorName,
          ...(user?.email ? { email: user.email } : {}),
          ...(creatorPhone ? { phone: creatorPhone } : {})
        },
        updatedAt: nowIso
      };

      if (linkedTicket?.id) {
        draftPayload.ticketId = linkedTicket.id;
      }
      if (linkedTicket?.ticketNumber !== undefined && linkedTicket?.ticketNumber !== null) {
        draftPayload.ticketNumber = linkedTicket.ticketNumber;
      }
      if (location.trim()) {
        draftPayload.location = location.trim();
      }
      if (linkedTicket?.imageId) {
        draftPayload.imageId = linkedTicket.imageId;
      }
      if (linkedTicket?.audioId) {
        draftPayload.audioId = linkedTicket.audioId;
      }

      let savedDraftId = draftId;
      if (draftId) {
        await updateDoc(doc(db, "tenants", tenantId, "rfqs", draftId), draftPayload);
      } else {
        draftPayload.createdAt = nowIso;
        const newDocRef = await addDoc(collection(db, "tenants", tenantId, "rfqs"), draftPayload);
        savedDraftId = newDocRef.id;
      }

      await logAction({
        tenantId,
        action: 'RFQ_DRAFT_SAVED',
        actor: {
          uid: user?.uid || 'admin',
          name: creatorName,
          email: user?.email || undefined,
          type: 'admin'
        },
        details: {
          rfqId: savedDraftId,
          title: draftTitle,
          category,
          isUpdate: Boolean(draftId)
        }
      });

      // Redirect to quotes page with drafts tab open
      navigate(`/admin/${tenantId}/quotes?tab=drafts&draftSaved=1`);
    } catch (err: any) {
      console.error("Error saving draft RFQ:", err);
      setFormError("שגיאה בשמירת הטיוטה: " + (err.message || ""));
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit & Dispatch RFQ
  const handleSubmitRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!tenantId) return;

    if (!title.trim()) {
      setFormError('כותרת העבודה הינה שדה חובה');
      return;
    }

    if (!category) {
      setFormError('יש לבחור קטגוריה לעבודה');
      return;
    }

    if (selectedVendorIds.length === 0) {
      setFormError('יש לבחור לפחות קבלן אחד לקבלת הצעת המחיר');
      return;
    }

    setSubmitting(true);
    try {
      const deadlineIso = computeDeadlineIso();
      const nowIso = new Date().toISOString();

      const selectedVendorsList = vendors.filter(v => selectedVendorIds.includes(v.id));

      const dispatchedRecords = selectedVendorsList.map(v => {
        // Generate pseudo-token hash for security verification
        const tokenHash = btoa(`${tenantId}:${v.id}:${Date.now()}:${v.phone}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
        return {
          vendorId: v.id,
          vendorName: v.fullName,
          phone: v.phone,
          vendorType: v.vendorType || 'occasional',
          companyId: v.companyId || '',
          sentAt: nowIso,
          tokenHash
        };
      });

      // Grab work ordering contact info from adminUsers (Users tab)
      let creatorName = adminProfile?.fullName || 'ועד הבית';
      let creatorPhone: string | undefined = adminProfile?.mobile;
      if (!adminProfile?.fullName && user?.uid && tenantId) {
        try {
          const uSnap = await getDoc(doc(db, "tenants", tenantId, "adminUsers", user.uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            const fullName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
            if (fullName) creatorName = fullName;
            if (uData.mobile || uData.phone) creatorPhone = uData.mobile || uData.phone;
          }
        } catch (e) {
          console.warn('Could not fetch admin user details for RFQ creator:', e);
        }
      }

      const rfqPayload: Record<string, any> = {
        tenantId,
        tenantName: tenantName || tenantId,
        tenantType: tenantType || 'building',
        title: title.trim(),
        category,
        description: description.trim(),
        attachments: attachments || [],
        targetCategory: category,
        paymentTerms: {
          mode: paymentMode,
          ...(paymentMode === 'single' ? { singleTermText: singlePaymentTerm } : { phases: paymentPhases })
        },
        ...(wasteClause.trim() ? { wasteClause: wasteClause.trim() } : {}),
        ...(allowedWorkHours.trim() ? { allowedWorkHours: allowedWorkHours.trim() } : {}),
        ...(workStartDate ? { workStartDate } : {}),
        ...(workTargetEndDate ? { workTargetEndDate } : {}),
        dispatchedVendors: dispatchedRecords,
        deadlineAt: deadlineIso,
        status: 'open',
        createdBy: {
          uid: user?.uid || 'admin',
          name: creatorName,
          ...(user?.email ? { email: user.email } : {}),
          ...(creatorPhone ? { phone: creatorPhone } : {})
        },
        createdAt: loadedDraftCreatedAt || nowIso,
        updatedAt: nowIso
      };

      if (linkedTicket?.id) {
        rfqPayload.ticketId = linkedTicket.id;
      }
      if (linkedTicket?.ticketNumber !== undefined && linkedTicket?.ticketNumber !== null) {
        rfqPayload.ticketNumber = linkedTicket.ticketNumber;
      }
      if (location.trim()) {
        rfqPayload.location = location.trim();
      }
      if (linkedTicket?.imageId) {
        rfqPayload.imageId = linkedTicket.imageId;
      }
      if (linkedTicket?.audioId) {
        rfqPayload.audioId = linkedTicket.audioId;
      }

      let publishedRfqId = draftId;
      if (draftId) {
        await updateDoc(doc(db, "tenants", tenantId, "rfqs", draftId), rfqPayload);
      } else {
        const docRef = await addDoc(collection(db, "tenants", tenantId, "rfqs"), rfqPayload);
        publishedRfqId = docRef.id;
      }

      // Audit Logs
      const auditDetails: Record<string, any> = {
        rfqId: publishedRfqId,
        category,
        title: title.trim(),
        recipientCount: dispatchedRecords.length,
        deadlineAt: deadlineIso
      };
      if (linkedTicket?.id) {
        auditDetails.ticketId = linkedTicket.id;
      }
      if (linkedTicket?.ticketNumber !== undefined && linkedTicket?.ticketNumber !== null) {
        auditDetails.ticketNumber = linkedTicket.ticketNumber;
      }

      await logAction({
        tenantId,
        action: 'RFQ_CREATED',
        actor: {
          uid: user?.uid || 'admin',
          name: creatorName,
          email: user?.email || undefined,
          type: 'admin'
        },
        details: auditDetails
      });

      await logAction({
        tenantId,
        action: 'RFQ_BROADCAST_SENT',
        actor: {
          uid: user?.uid || 'admin',
          name: creatorName,
          email: user?.email || undefined,
          type: 'admin'
        },
        details: {
          rfqId: publishedRfqId,
          targetVendors: dispatchedRecords.map(d => ({ vendorId: d.vendorId, name: d.vendorName, phone: d.phone }))
        }
      });

      // Trigger automated WhatsApp dispatch for contractors using approved template contractor_rfq_invite
      try {
        const dispatchRes = await fetch('/api/dispatchRfqToVendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            rfqId: publishedRfqId,
            actor: {
              uid: user?.uid || 'admin',
              name: creatorName,
              email: user?.email || undefined
            }
          })
        });
        const dispatchResult = await dispatchRes.json();
        console.log("RFQ WhatsApp dispatch response:", dispatchResult);
      } catch (dispatchErr) {
        console.warn("Automated WhatsApp dispatch call failed, links available in Active Quotes:", dispatchErr);
      }

      // Redirect to Active Quotes Page
      navigate(`/admin/${tenantId}/quotes/active?newRfqId=${publishedRfqId}&sentCount=${dispatchedRecords.length}`);
    } catch (err: any) {
      console.error("Error creating RFQ:", err);
      setFormError(err.message || 'שגיאה ביצירת בקשת הצעת המחיר');
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400" dir="rtl">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <span className="text-xs font-bold">טוען נתונים...</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto" dir="rtl">
      {/* Header & Breadcrumb */}
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <Link to={`/admin/${tenantId}/quotes/active`} className="hover:text-blue-600 transition-colors">
            הצעות מחיר
          </Link>
          <span>/</span>
          <span className="text-slate-600">בקשת הצעה חדשה</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 shadow-sm">
              <FilePlus size={26} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">יצירת בקשת הצעת מחיר (RFQ)</h1>
              <p className="text-sm text-slate-500 font-medium">
                הפצת בקשה להצעת מחיר ב-WhatsApp עבור {tenantName || (isSettlement ? 'היישוב' : 'המבנה')} לקבלנים נבחרים עם קישור ישיר להגשה
              </p>
            </div>
          </div>

          <Link
            to={`/admin/${tenantId}/quotes/active`}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1.5"
          >
            <ArrowRight size={14} />
            <span>חזרה לרשימה</span>
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmitRfq} className="space-y-6">
        {draftId && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs md:text-sm font-bold flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800 text-base">📝</span>
              <span>אתה עורך כעת טיוטת מכרז שמורה. ניתן לשמור עדכונים כטיוטה או להפיץ לקבלנים.</span>
            </div>
            <Link
              to={`/admin/${tenantId}/quotes?tab=drafts`}
              className="text-amber-800 underline hover:text-amber-950 shrink-0 font-extrabold"
            >
              חזרה לרשימת הטיוטות
            </Link>
          </div>
        )}

        {formError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-bold flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle size={20} className="shrink-0 text-red-500" />
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Ticket Link (Optional) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-base font-black text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">1</span>
              <span>שיוך לקריאת שירות קיימת (רשות)</span>
            </label>
            {linkedTicket && (
              <button
                type="button"
                onClick={handleDetachTicket}
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <X size={14} />
                <span>נתק פנייה</span>
              </button>
            )}
          </div>

          {!linkedTicket ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={ticketLookupNumber}
                    onChange={e => setTicketLookupNumber(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLookupTicket(); } }}
                    placeholder="הזן מספר פנייה (לדוגמה: 127 או #127)..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleLookupTicket()}
                  disabled={ticketSearchLoading || !ticketLookupNumber.trim()}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {ticketSearchLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                  <span>משוך פרטי פנייה</span>
                </button>
              </div>
              {ticketSearchError && (
                <p className="text-xs text-red-500 font-bold px-1">{ticketSearchError}</p>
              )}
              <p className="text-xs text-slate-400 px-1">
                משיכת פנייה תטען אוטומטית את הקטגוריה, התיאור, המיקום והמדיה (תמונות והקלטות קוליות) ישירות מקריאת התושב.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white text-xs font-black">
                    #{linkedTicket.ticketNumber || linkedTicket.id}
                  </span>
                  <span className="font-black text-slate-800 text-sm">{linkedTicket.category}</span>
                  {linkedTicket.urgency && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      דחיפות: {linkedTicket.urgency}
                    </span>
                  )}
                </div>
                <p className="text-xs md:text-sm text-slate-700 font-medium line-clamp-2">{linkedTicket.summary}</p>
              </div>

              {/* Media Attachments & Audio Player in Linked Ticket */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {linkedTicket.imageId && (
                  <a
                    href={`/img/${tenantId}/${linkedTicket.imageId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 shadow-2xs transition-all"
                    title="פתח תמונה מצורפת בחלון חדש"
                  >
                    <ImageIcon size={14} className="text-blue-500" />
                    <span>צפה בתמונה</span>
                    <ExternalLink size={12} className="opacity-60" />
                  </a>
                )}
                {linkedTicket.audioId && (
                  <div className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={togglePlayAudio}
                      className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border shadow-2xs cursor-pointer transition-all ${
                        isPlayingAudio
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-2 ring-emerald-200 font-black'
                          : 'bg-white text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                      }`}
                      title={isPlayingAudio ? "השהה הקלטה" : "האזן להקלטה קולית"}
                    >
                      {isPlayingAudio ? (
                        <>
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                          </span>
                          <Pause size={13} className="text-emerald-700 fill-emerald-700" />
                          <span>השהה הקלטה</span>
                        </>
                      ) : (
                        <>
                          <Play size={13} className="text-emerald-600 fill-emerald-600" />
                          <Mic size={13} className="text-emerald-600" />
                          <span>האזן להקלטה</span>
                        </>
                      )}
                    </button>
                    <audio
                      ref={audioPlayerRef}
                      src={`/aud/${tenantId}/${String(linkedTicket.audioId).split('/').pop()}`}
                      preload="metadata"
                      onEnded={() => setIsPlayingAudio(false)}
                      onPause={() => setIsPlayingAudio(false)}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Job Scope & Category */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
          <label className="text-base font-black text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">2</span>
            <span>פרטי העבודה והדרישות</span>
          </label>

          {/* Category Chips Selector */}
          <div>
            <label className="block text-sm font-extrabold text-slate-700 mb-2 px-1">
              קטגוריית העבודה <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              {categoryPool.map(cat => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected && <Check size={14} className="stroke-[3]" />}
                    <span>{cat}</span>
                  </button>
                );
              })}

              {/* Inline Add Category Tag */}
              {showAddCustomCategory ? (
                <div className="flex items-center gap-1.5 p-1 bg-white rounded-lg border border-blue-300 shadow-2xs">
                  <input
                    type="text"
                    autoFocus
                    placeholder="שם קטגוריה חדשה..."
                    value={customCategoryInput}
                    onChange={e => setCustomCategoryInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomCategory(e);
                      } else if (e.key === 'Escape') {
                        setShowAddCustomCategory(false);
                      }
                    }}
                    className="px-2 py-1 text-xs font-bold text-slate-800 outline-none w-36"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCategory}
                    disabled={!customCategoryInput.trim()}
                    className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    שמור
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddCustomCategory(false); setCustomCategoryInput(''); }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddCustomCategory(true)}
                  className="px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50/70 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>קטגוריה חדשה</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-extrabold text-slate-700 mb-1.5 px-1">
              כותרת קצרה לעבודה <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={70}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="לדוגמה: תיקון פיצוץ צינור מים ראשי בחניון..."
              className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-extrabold text-slate-700 mb-1.5 px-1">
              פירוט והנחיות לביצוע
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="תאר את הבעיה, גישה למקום, חלקי חילוף נדרשים וכל מידע חשוב לקבלן..."
              className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none text-slate-800 placeholder:text-slate-400 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-extrabold text-slate-700 mb-1.5 px-1">
              {locationFieldLabel}
            </label>
            <input
              type="text"
              maxLength={60}
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={locationFieldPlaceholder}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800 placeholder:text-slate-400 font-medium"
            />
          </div>
        </div>

        {/* Section 3: Payment Terms, Waste Policy & Working Hours */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <label className="text-base font-black text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">3</span>
              <span>תנאי ושלבי תשלום, פינוי פסולת ושעות עבודה</span>
            </label>
            <span className="text-xs text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              {paymentMode === 'milestones' ? (paymentPhases.length > 0 ? `פריסה ל-${paymentPhases.length} שלבים` : 'שלבי ביצוע') : 'תשלום יחיד'}
            </span>
          </div>

          {/* Mode Selector */}
          <div className="space-y-3">
            <div className="flex items-center gap-6 border-b border-slate-100 pb-3 flex-wrap">
              <span className="text-sm font-extrabold text-slate-700">אופן פריסת התשלום:</span>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="rfqPaymentMode"
                  checked={paymentMode === 'milestones'}
                  onChange={() => setPaymentMode('milestones')}
                  className="accent-blue-600 w-4 h-4 cursor-pointer"
                />
                <span>שלבי ביצוע / אבני דרך</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="rfqPaymentMode"
                  checked={paymentMode === 'single'}
                  onChange={() => setPaymentMode('single')}
                  className="accent-blue-600 w-4 h-4 cursor-pointer"
                />
                <span>תשלום יחיד בגמר העבודה</span>
              </label>
            </div>

            {paymentMode === 'milestones' ? (
              <div className="space-y-3 pt-1">
                {/* Phases List */}
                {paymentPhases.length === 0 ? (
                  <div className="py-4 px-3 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50">
                    <p className="text-xs text-slate-500 font-medium">
                      לא הוגדרו עדיין שלבי תשלום. לחץ על כפתור ״הוסף שלב תשלום״ להגדרת אבני דרך.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {paymentPhases.map((phase, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={phase.stageName}
                            onChange={e => handleUpdatePhase(idx, 'stageName', e.target.value)}
                            placeholder="שם השלב (לדוגמה: שלב 1 - גמר הריסות ופינוי)"
                            className="flex-1 px-3 py-1.5 text-xs md:text-sm font-bold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-slate-500 font-bold">שיעור:</span>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={phase.percentage}
                              onChange={e => handleUpdatePhase(idx, 'percentage', Number(e.target.value))}
                              className="w-16 px-2 py-1.5 text-xs md:text-sm font-bold text-center bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                            />
                            <span className="text-xs font-bold text-slate-700">%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePhase(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors cursor-pointer shrink-0"
                            title="מחק שלב"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={phase.description || ''}
                          onChange={e => handleUpdatePhase(idx, 'description', e.target.value)}
                          placeholder="תיאור מהות השלב (לדוגמה: בסיום מלא של עבודות ההריסה ופינוי הפסולת)"
                          className="w-full px-3 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Phase & Total Indicator */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleAddPhase}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>הוסף שלב תשלום</span>
                  </button>

                  {paymentPhases.length > 0 && (
                    <div className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      totalPhasesPercentage === 100
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      סה"כ: {totalPhasesPercentage}% {totalPhasesPercentage === 100 ? '✓' : '(מומלץ להגיע ל-100%)'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <label className="block text-xs font-bold text-slate-600 mb-1">נוסח תנאי תשלום יחיד:</label>
                <input
                  type="text"
                  value={singlePaymentTerm}
                  onChange={e => setSinglePaymentTerm(e.target.value)}
                  placeholder="לדוגמה: שוטף + 30 יום מגמר העבודה ומסירת האתר"
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
                />
              </div>
            )}
          </div>

          {/* Waste Disposal Policy */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <label className="block text-sm font-extrabold text-slate-700">
              הנחיות פינוי פסולת וניקיון ({isSettlement ? 'מדיניות היישוב' : 'מדיניות הבניין'}):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.values(WASTE_PRESETS).map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setWastePresetKey(preset.id);
                    if (preset.id !== 'custom') {
                      setWasteClause(preset.text);
                    }
                  }}
                  className={`p-2.5 text-right rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    wastePresetKey === preset.id
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 shadow-2xs'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={wasteClause}
              onChange={e => {
                setWasteClause(e.target.value);
                setWastePresetKey('custom');
              }}
              placeholder="רשום כאן הנחיות ספציפיות לפינוי פסולת, מקום המכולה וכיוצ״ב..."
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs md:text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800 font-medium leading-relaxed resize-none"
            />
          </div>

          {/* Allowed Work Hours */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-600 mb-1">
              שעות עבודה והרעשה מותרות באתר:
            </label>
            <input
              type="text"
              value={allowedWorkHours}
              onChange={e => setAllowedWorkHours(e.target.value)}
              placeholder="בימים א'-ה' בין השעות 08:00 - 17:00, ובימי ו' עד 13:00"
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
            />
          </div>

          {/* Target Work Schedule / Dates */}
          <div className="pt-2 border-t border-slate-100">
            <span className="block text-xs font-extrabold text-slate-700 mb-2">
              מועדי ביצוע מבוקשים (אופציונלי):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  מועד תחילת עבודה מבוקש:
                </label>
                <input
                  type="date"
                  value={workStartDate}
                  onChange={e => setWorkStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  מועד סיום / מסירה מבוקש:
                </label>
                <input
                  type="date"
                  value={workTargetEndDate}
                  onChange={e => setWorkTargetEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs md:text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              במידה ולא יוגדרו תאריכים מראש, ברירת המחדל בהסכם הינה תחילת עבודה תוך 3 ימי עסקים מחתימה ומשך ביצוע לפי הצעת הקבלן.
            </p>
          </div>
        </div>

        {/* Section 4: File Attachments */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-base font-black text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">4</span>
              <span>מסמכים ומדיה מצורפים ({attachments.length} / {MAX_FILES})</span>
            </label>
            <span className="text-xs text-slate-500 font-bold">
              Word, Excel, PDF, תמונות, אודיו (עד 5MB לקובץ)
            </span>
          </div>

          {fileError && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs md:text-sm font-bold flex items-start gap-2.5">
              <ShieldAlert size={18} className="shrink-0 text-amber-600 mt-0.5" />
              <span className="leading-relaxed">{fileError}</span>
            </div>
          )}

          {/* Upload Dropzone */}
          {attachments.length < MAX_FILES && (
            <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.m4a,.wav,.aac"
                onChange={handleFileUpload}
                disabled={uploadingFiles}
                className="hidden"
              />
              {uploadingFiles ? (
                <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
                  <Loader2 className="animate-spin" size={20} />
                  <span>מעלה ומאמת קבצים...</span>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-full bg-white text-slate-600 shadow-sm border border-slate-100">
                    <Upload size={20} />
                  </div>
                  <span className="text-sm font-bold text-slate-800">לחץ להעלאת מפרט טכני, מסמך, תמונה או קובץ קולי</span>
                  <span className="text-xs text-slate-400">פורמטים מורשים: Word, Excel, PDF, JPG, PNG, WEBP, MP3, MP4, WAV (עד 5MB לקובץ)</span>
                </>
              )}
            </label>
          )}

          {/* Uploaded Attachments List */}
          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Paperclip size={16} className="text-blue-600 shrink-0" />
                    <span className="font-bold text-slate-800 truncate" title={att.name}>{att.name}</span>
                    {att.sizeBytes && (
                      <span className="text-xs text-slate-400 shrink-0 font-medium">
                        ({Math.round(att.sizeBytes / 1024)} KB)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
                    title="הסר קובץ"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Expiration / Validity */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
          <label className="text-base font-black text-slate-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">5</span>
            <span>מועד אחרון להגשת הצעות (תוקף הקישור לקבלנים)</span>
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { id: '48h', label: '48 שעות' },
              { id: '7d', label: 'שבוע (ברירת מחדל)' },
              { id: '14d', label: 'שבועיים' },
              { id: 'custom', label: 'מותאם אישית' },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDeadlinePreset(item.id as any)}
                className={`py-2.5 px-3.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                  deadlinePreset === item.id
                    ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-2xs font-extrabold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {deadlinePreset === 'custom' && (
            <div className="pt-2 animate-in fade-in">
              <label className="block text-sm font-bold text-slate-700 mb-1.5 px-1">בחר תאריך ושעת סגירה:</label>
              <input
                type="datetime-local"
                value={customDeadline}
                onChange={e => setCustomDeadline(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 text-slate-800"
              />
            </div>
          )}
        </div>

        {/* Section 6: Target Contractor Selection */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-base font-black text-slate-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">6</span>
              <span>בחירת קבלנים לשליחה (תחום: {category})</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddVendorModal(true)}
                className="text-xs font-extrabold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>הוסף קבלן חדש</span>
              </button>

              {matchingVendors.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllToggle}
                  className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  {selectedVendorIds.length === matchingVendors.length ? 'בטל בחירת הכל' : 'בחר הכל'}
                </button>
              )}
            </div>
          </div>

          {matchingVendors.length === 0 ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3">
              <p className="text-sm text-slate-600 font-bold">
                לא נמצאו אנשי שירות רשומים תחת הקטגוריה "{category}".
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>הוסף קבלן חדש לתחום זה</span>
                </button>
                <Link
                  to={`/admin/${tenantId}/settings?tab=users`}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
                >
                  ניהול ספקים בהגדרות
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500 font-bold px-1">
                נבחרו {selectedVendorIds.length} מתוך {matchingVendors.length} קבלנים מתאימים
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {matchingVendors.map(vendor => {
                  const isChecked = selectedVendorIds.includes(vendor.id);
                  return (
                    <label
                      key={vendor.id}
                      onClick={() => handleVendorToggle(vendor.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isChecked
                          ? 'bg-blue-50/60 border-blue-300 shadow-2xs'
                          : 'bg-slate-50/40 border-slate-200 hover:bg-slate-100/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent label click
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-sm">{vendor.fullName}</span>
                            {vendor.companyId && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                ח.פ./ת.ז. {vendor.companyId}
                              </span>
                            )}
                            <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                              vendor.vendorType === 'retainer'
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {vendor.vendorType === 'retainer' ? 'קבוע 🏢' : 'מזדמן 🛠️'}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500 font-medium" dir="ltr">{vendor.phone}</span>
                        </div>
                      </div>

                      {vendor.notes && (
                        <span className="text-xs text-slate-400 italic line-clamp-1 max-w-[180px]">
                          {vendor.notes}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 6: Action Footer */}
        <div className="pt-2 flex flex-col md:flex-row items-center justify-between gap-4">
          <Link
            to={`/admin/${tenantId}/quotes/active`}
            className="w-full md:w-auto px-6 py-3.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-bold text-center transition-colors"
          >
            ביטול
          </Link>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || submitting}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSavingDraft ? (
                <>
                  <Loader2 className="animate-spin text-slate-500" size={18} />
                  <span>שומר טיוטה...</span>
                </>
              ) : (
                <>
                  <Save size={18} className="text-slate-500" />
                  <span>{draftId ? 'עדכן טיוטה' : 'שמור כטיוטה'}</span>
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={submitting || isSavingDraft || selectedVendorIds.length === 0}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-black shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>מפיץ בקשת הצעות מחיר...</span>
                </>
              ) : (
                <>
                  <Share2 size={18} />
                  <span>שגר בקשת הצעת מחיר ל-{selectedVendorIds.length} קבלנים ב-WhatsApp 🚀</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Quick Add Vendor Modal */}
      {showAddVendorModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] text-right" dir="rtl">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                <Plus size={16} className="text-blue-600" />
                <span>הוספת קבלן / איש מקצוע לתחום {category}</span>
              </h4>
              <button
                type="button"
                onClick={() => { setShowAddVendorModal(false); setNewVendorError(''); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="p-5 space-y-3.5 overflow-y-auto flex-1">
              {newVendorError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-500" />
                  <span>{newVendorError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  שם מלא / שם העסק <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={newVendorForm.fullName}
                  onChange={e => setNewVendorForm({ ...newVendorForm, fullName: e.target.value })}
                  placeholder="לדוגמה: כהן אינסטלציה בע״מ"
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  טלפון נייד לוואטסאפ <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={15}
                  value={newVendorForm.phone}
                  onChange={e => setNewVendorForm({ ...newVendorForm, phone: e.target.value })}
                  placeholder="0501234567"
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  ח.פ. / ת.ז. (רשות)
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={newVendorForm.companyId}
                  onChange={e => setNewVendorForm({ ...newVendorForm, companyId: e.target.value })}
                  placeholder="לדוגמה: 512345678 או 012345678"
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">
                  סיווג קבלן
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setNewVendorForm({ ...newVendorForm, vendorType: 'occasional' })}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                      newVendorForm.vendorType === 'occasional'
                        ? 'bg-white text-slate-900 shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    🛠️ מזדמן
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewVendorForm({ ...newVendorForm, vendorType: 'retainer' })}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                      newVendorForm.vendorType === 'retainer'
                        ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    🏢 קבוע (ריטיינר)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1">אימייל (רשות)</label>
                <input
                  type="email"
                  value={newVendorForm.email}
                  onChange={e => setNewVendorForm({ ...newVendorForm, email: e.target.value })}
                  placeholder="contractor@example.com"
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-left"
                  dir="ltr"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={newVendorSaving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {newVendorSaving && <Loader2 size={14} className="animate-spin" />}
                  <span>שמור ובחר קבלן זה</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
