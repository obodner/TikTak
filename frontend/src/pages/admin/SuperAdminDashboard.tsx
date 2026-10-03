import React, { useEffect, useState, useMemo } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuditExplorer } from '../../components/admin/AuditExplorer';
import { SupportInquiriesExplorer } from '../../components/admin/SupportInquiriesExplorer';
import { OnboardTenantModal } from '../../components/admin/OnboardTenantModal';
import {
  Building,
  Shield,
  LogOut,
  Search,
  Activity,
  Globe,
  Calendar,
  X,
  RefreshCw,
  Headphones,
  MoreVertical,
  ExternalLink,
  CreditCard,
  FileText,
  Snowflake,
  Play,
  Trash2,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { signOut } from 'firebase/auth';

interface Tenant {
  id: string;
  name: string;
  address: string;
  adminUids: string[];
  type?: 'building' | 'municipality';
  createdAt?: any;
  lastLogin?: any;
  isActive?: boolean;
  isPoolMaster?: boolean;
  parentEnterpriseId?: string;
  usesParentPool?: boolean;
  childTenantIds?: string[];
  subscription?: {
    tier?: string;
    monthlyQuota?: number;
    overageRate?: number;
    currentCycleTicketCount?: number;
    status?: string;
    cycleEndDate?: string;
  };
  rfqLicensing?: {
    tier?: string;
    status?: string;
    annualQuota?: number;
    overageRate?: number;
    enforcementMode?: 'hard' | 'soft';
    licenseStartDate?: string;
    licenseExpiresAt?: string;
    currentAnnualUsage?: {
      dispatchedCount?: number;
      alertsSent?: any;
    };
  };
}

interface AdminUserRecord {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  role?: string;
  lastLogin?: any;
}

export default function SuperAdminDashboard() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language !== 'en';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'single' | 'master' | 'child' | 'frozen'>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'tenants' | 'support' | 'audit' | 'holidays') || 'tenants';

  const setActiveTab = (tab: 'tenants' | 'support' | 'audit' | 'holidays') => {
    setSearchParams({ tab });
  };

  const navigate = useNavigate();

  const [stats, setStats] = useState({ activeUsers: 0, activeTenantsCount: 0 });
  const [unaddressedInquiriesCount, setUnaddressedInquiriesCount] = useState<number>(0);

  // 3-Dots Menu & Modals State
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [expandedMasterIds, setExpandedMasterIds] = useState<Set<string>>(new Set());
  const [activeMenuTenantId, setActiveMenuTenantId] = useState<string | null>(null);
  const [editingTicketTenant, setEditingTicketTenant] = useState<Tenant | null>(null);
  const [editingRfqTenant, setEditingRfqTenant] = useState<Tenant | null>(null);
  const [freezeTenant, setFreezeTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [viewingAdminsTenant, setViewingAdminsTenant] = useState<Tenant | null>(null);
  const [adminsList, setAdminsList] = useState<AdminUserRecord[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form states for modals
  const [ticketForm, setTicketForm] = useState({ tier: 'standard', monthlyQuota: 80, overageRate: 8.0 });
  const [rfqForm, setRfqForm] = useState({
    tier: 'standard',
    annualQuota: 12,
    overageRate: 45.0,
    enforcementMode: 'hard' as 'hard' | 'soft',
    licenseExpiresAt: ''
  });

  useEffect(() => {
    fetchTenants();
    fetchStats();
    fetchSupportInquiriesBadge();
  }, []);

  // Close 3-dots dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-menu-container')) {
        setActiveMenuTenantId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const fetchSupportInquiriesBadge = async () => {
    try {
      const q = query(collection(db, 'support_inquiries'), where('status', '==', 'new'));
      const snap = await getDocs(q);
      setUnaddressedInquiriesCount(snap.size);
    } catch (e) {
      // Non-blocking fallback
    }
  };

  const fetchStats = async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const q = query(
        collection(db, 'audit_logs'),
        where('createdAt', '>=', twentyFourHoursAgo)
      );
      const snap = await getDocs(q);
      const activeTenants = new Set<string>();
      const activeUsers = new Set<string>();

      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const tid = data.tenantId || data.metadata?.tenantId;
        const uid = data.actor?.uid;
        if (tid) activeTenants.add(tid);
        if (uid) activeUsers.add(uid);
      });
      setStats({ activeUsers: activeUsers.size, activeTenantsCount: activeTenants.size });
    } catch (err) {
      console.error('Failed to fetch global stats:', err);
    }
  };

  const fetchTenants = async () => {
    try {
      const q = query(collection(db, 'tenants'), orderBy('name', 'asc'));
      const snap = await getDocs(q);
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant)));
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => signOut(auth).then(() => navigate('/admin/login'));

  // Definite Date & Time formatters
  const formatDefiniteDate = (val: any): string => {
    if (!val) return '—';
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatDefiniteDateTime = (val: any): string => {
    if (!val) return t('super_never_logged_in');
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return t('super_never_logged_in');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Open Edit TikTak Modal
  const openEditTicketModal = (tenant: Tenant) => {
    setEditingTicketTenant(tenant);
    setTicketForm({
      tier: tenant.subscription?.tier || 'standard',
      monthlyQuota: tenant.subscription?.monthlyQuota ?? 80,
      overageRate: tenant.subscription?.overageRate ?? 8.0
    });
    setActionError(null);
    setActiveMenuTenantId(null);
  };

  // Open Edit RFQ Modal
  const openEditRfqModal = (tenant: Tenant) => {
    setEditingRfqTenant(tenant);
    const existingExpiry = tenant.rfqLicensing?.licenseExpiresAt;
    const defaultExpiryDate = existingExpiry
      ? new Date(existingExpiry).toISOString().split('T')[0]
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    setRfqForm({
      tier: tenant.rfqLicensing?.tier || 'standard',
      annualQuota: tenant.rfqLicensing?.annualQuota ?? 12,
      overageRate: tenant.rfqLicensing?.overageRate ?? 45.0,
      enforcementMode: tenant.rfqLicensing?.enforcementMode || 'hard',
      licenseExpiresAt: defaultExpiryDate
    });
    setActionError(null);
    setActiveMenuTenantId(null);
  };

  // Save Ticket License
  const handleSaveTicketLicensing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicketTenant) return;
    setSubmittingAction(true);
    setActionError(null);

    try {
      const response = await fetch('/api/updateTenantLicensing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerUid: auth.currentUser?.uid,
          tenantId: editingTicketTenant.id,
          ticketSubscription: ticketForm
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update ticket licensing');
      }

      // Update in local state
      setTenants(prev => prev.map(tItem => {
        if (tItem.id === editingTicketTenant.id) {
          return {
            ...tItem,
            subscription: {
              ...tItem.subscription,
              ...ticketForm
            }
          };
        }
        return tItem;
      }));

      setEditingTicketTenant(null);
    } catch (err: any) {
      setActionError(err.message || 'Operation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Save RFQ License
  const handleSaveRfqLicensing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRfqTenant) return;
    setSubmittingAction(true);
    setActionError(null);

    try {
      const response = await fetch('/api/updateTenantLicensing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerUid: auth.currentUser?.uid,
          tenantId: editingRfqTenant.id,
          rfqLicensing: {
            tier: rfqForm.tier,
            annualQuota: Number(rfqForm.annualQuota),
            overageRate: Number(rfqForm.overageRate),
            enforcementMode: rfqForm.enforcementMode,
            licenseExpiresAt: rfqForm.licenseExpiresAt ? new Date(rfqForm.licenseExpiresAt).toISOString() : undefined,
            status: rfqForm.tier !== 'disabled' ? 'active' : 'disabled'
          }
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update RFQ licensing');
      }

      // Update local state
      setTenants(prev => prev.map(tItem => {
        if (tItem.id === editingRfqTenant.id) {
          return {
            ...tItem,
            rfqLicensing: {
              ...tItem.rfqLicensing,
              tier: rfqForm.tier,
              annualQuota: Number(rfqForm.annualQuota),
              overageRate: Number(rfqForm.overageRate),
              enforcementMode: rfqForm.enforcementMode,
              licenseExpiresAt: rfqForm.licenseExpiresAt,
              status: rfqForm.tier !== 'disabled' ? 'active' : 'disabled'
            }
          };
        }
        return tItem;
      }));

      setEditingRfqTenant(null);
    } catch (err: any) {
      setActionError(err.message || 'Operation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Toggle Freeze
  const handleToggleFreeze = async () => {
    if (!freezeTenant) return;
    setSubmittingAction(true);
    setActionError(null);

    const targetActiveState = freezeTenant.isActive === false; // toggle
    try {
      const response = await fetch('/api/toggleTenantFreeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerUid: auth.currentUser?.uid,
          tenantId: freezeTenant.id,
          isActive: targetActiveState
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to toggle freeze state');
      }

      const resData = await response.json().catch(() => ({}));
      const cascadedSet = new Set<string>(resData.cascadedChildren || []);

      setTenants(prev => prev.map(tItem => {
        const isTarget = tItem.id === freezeTenant.id;
        const isChild = cascadedSet.has(tItem.id) ||
          tItem.parentEnterpriseId === freezeTenant.id ||
          (Array.isArray(freezeTenant.childTenantIds) && freezeTenant.childTenantIds.includes(tItem.id));

        if (isTarget || isChild) {
          return {
            ...tItem,
            isActive: targetActiveState,
            subscription: {
              ...tItem.subscription,
              status: targetActiveState ? 'active' : 'frozen'
            }
          };
        }
        return tItem;
      }));

      setFreezeTenant(null);
    } catch (err: any) {
      setActionError(err.message || 'Operation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Permanent Delete
  const handleDeletePermanently = async () => {
    if (!deletingTenant) return;
    if (deleteConfirmationInput !== deletingTenant.id) return;
    setSubmittingAction(true);
    setActionError(null);

    try {
      const response = await fetch('/api/deleteTenantPermanently', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerUid: auth.currentUser?.uid,
          tenantId: deletingTenant.id,
          confirmationId: deleteConfirmationInput
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete tenant');
      }

      setTenants(prev => prev.filter(tItem => tItem.id !== deletingTenant.id));
      setDeletingTenant(null);
      setDeleteConfirmationInput('');
    } catch (err: any) {
      setActionError(err.message || 'Operation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  // View Admins Popover/Modal
  const handleOpenAdminsModal = async (tenant: Tenant) => {
    setViewingAdminsTenant(tenant);
    setLoadingAdmins(true);
    setAdminsList([]);

    try {
      const snap = await getDocs(collection(db, 'tenants', tenant.id, 'adminUsers'));
      const list: AdminUserRecord[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setAdminsList(list);
    } catch (e) {
      console.error('Failed to fetch admin users:', e);
    } finally {
      setLoadingAdmins(false);
    }
  };

  // Preset mappings for quick selects
  const TICKET_TIER_PRESETS: Record<string, { monthlyQuota: number; overageRate: number }> = {
    starter: { monthlyQuota: 15, overageRate: 12.0 },
    basic: { monthlyQuota: 35, overageRate: 10.0 },
    standard: { monthlyQuota: 80, overageRate: 8.0 },
    growth: { monthlyQuota: 160, overageRate: 7.0 },
    enterprise: { monthlyQuota: 300, overageRate: 5.5 }
  };

  const RFQ_TIER_PRESETS: Record<string, { annualQuota: number; overageRate: number }> = {
    disabled: { annualQuota: 0, overageRate: 59.0 },
    starter: { annualQuota: 3, overageRate: 59.0 },
    basic: { annualQuota: 6, overageRate: 49.0 },
    standard: { annualQuota: 12, overageRate: 45.0 },
    growth: { annualQuota: 25, overageRate: 39.0 },
    enterprise: { annualQuota: 50, overageRate: 35.0 }
  };

  // 1. Group master tenants and children
  const masterTenantsMap = useMemo(() => {
    const map = new Map<string, Tenant>();
    tenants.forEach(t => {
      if (t.isPoolMaster || (t.childTenantIds && t.childTenantIds.length > 0)) {
        map.set(t.id, t);
      }
    });
    return map;
  }, [tenants]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, Tenant[]>();
    tenants.forEach(t => {
      const parentId = t.parentEnterpriseId;
      if (parentId && masterTenantsMap.has(parentId)) {
        const list = map.get(parentId) || [];
        list.push(t);
        map.set(parentId, list);
      }
    });
    // Sort each group of children alphabetically
    map.forEach(childList => {
      childList.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
    });
    return map;
  }, [tenants, masterTenantsMap]);

  // Identify all child IDs that belong to known masters
  const knownChildIds = useMemo(() => {
    const set = new Set<string>();
    childrenByParentId.forEach(list => {
      list.forEach(c => set.add(c.id));
    });
    return set;
  }, [childrenByParentId]);

  const toggleExpandMaster = (masterId: string) => {
    setExpandedMasterIds(prev => {
      const next = new Set(prev);
      if (next.has(masterId)) {
        next.delete(masterId);
      } else {
        next.add(masterId);
      }
      return next;
    });
  };

  const expandAllMasters = () => {
    const all = new Set<string>();
    masterTenantsMap.forEach((_, id) => all.add(id));
    setExpandedMasterIds(all);
  };

  const collapseAllMasters = () => {
    setExpandedMasterIds(new Set());
  };

  const matchesSearch = (tItem: Tenant): boolean => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    return (
      (tItem.name || '').toLowerCase().includes(s) ||
      (tItem.address || '').toLowerCase().includes(s) ||
      (tItem.id || '').toLowerCase().includes(s)
    );
  };

  const sortAlphabetically = (a: Tenant, b: Tenant) => {
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
  };

  interface VisibleRowItem {
    tenant: Tenant;
    isChild: boolean;
    childCount?: number;
    isExpanded?: boolean;
  }

  const visibleRows = useMemo<VisibleRowItem[]>(() => {
    const rows: VisibleRowItem[] = [];

    if (filterType === 'child') {
      // Show all child tenants flat, sorted alphabetically
      const allChildren = tenants.filter(t => knownChildIds.has(t.id) && matchesSearch(t));
      allChildren.sort(sortAlphabetically);
      allChildren.forEach(child => rows.push({ tenant: child, isChild: true }));
      return rows;
    }

    if (filterType === 'single') {
      // Show only single tenants, sorted alphabetically
      const singles = tenants.filter(t => !masterTenantsMap.has(t.id) && !knownChildIds.has(t.id) && matchesSearch(t));
      singles.sort(sortAlphabetically);
      singles.forEach(single => rows.push({ tenant: single, isChild: false }));
      return rows;
    }

    if (filterType === 'frozen') {
      // Show frozen tenants, sorted alphabetically
      const frozen = tenants.filter(t => (t.isActive === false || t.subscription?.status === 'frozen') && matchesSearch(t));
      frozen.sort(sortAlphabetically);
      frozen.forEach(f => rows.push({ tenant: f, isChild: knownChildIds.has(f.id) }));
      return rows;
    }

    // Default 'all' or 'master'
    const candidateMastersOrSingles = tenants.filter(t => {
      if (knownChildIds.has(t.id)) return false; // Children will be rendered beneath their parent
      if (filterType === 'master') return masterTenantsMap.has(t.id);
      return true;
    });

    // Sort top-level alphabetically by name
    candidateMastersOrSingles.sort(sortAlphabetically);

    candidateMastersOrSingles.forEach(parentOrSingle => {
      const children = childrenByParentId.get(parentOrSingle.id) || [];
      const hasChildren = children.length > 0;
      const parentMatches = matchesSearch(parentOrSingle);
      const matchingChildren = children.filter(matchesSearch);
      const childMatches = matchingChildren.length > 0;

      // If search is active, include if parent matches or any child matches
      if (searchTerm.trim() && !parentMatches && !childMatches) {
        return;
      }

      // If a child matches search, auto-expand so user can see it!
      const isExpanded = expandedMasterIds.has(parentOrSingle.id) || (Boolean(searchTerm.trim()) && childMatches);

      rows.push({
        tenant: parentOrSingle,
        isChild: false,
        childCount: children.length,
        isExpanded
      });

      if (hasChildren && isExpanded) {
        const childrenToDisplay = searchTerm.trim() && !parentMatches ? matchingChildren : children;
        childrenToDisplay.forEach(child => {
          rows.push({
            tenant: child,
            isChild: true
          });
        });
      }
    });

    return rows;
  }, [tenants, filterType, searchTerm, expandedMasterIds, knownChildIds, masterTenantsMap, childrenByParentId]);

  return (
    <div className="min-h-screen bg-slate-50" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{t('super_control_center')}</h1>
              <p className="text-xs text-slate-400 font-medium">{t('super_god_eye')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <LogOut size={18} /> {t('super_logout')}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 mb-8 max-w-2xl">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'tenants' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Building size={18} /> {t('super_tab_tenants')}
          </button>
          <button
            onClick={() => setActiveTab('support')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 relative ${
              activeTab === 'support' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Headphones size={18} /> {t('super_tab_support')}
            {unaddressedInquiriesCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {unaddressedInquiriesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'audit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Activity size={18} /> {t('super_tab_audit')}
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'holidays' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Calendar size={18} /> {t('super_tab_holidays')}
          </button>
        </div>

        {activeTab === 'tenants' ? (
          <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-blue-50 text-blue-600 p-3 rounded-xl"><Globe size={24} /></div>
                <div>
                  <p className="text-sm text-slate-500 font-bold">{t('super_total_tenants')}</p>
                  <p className="text-2xl font-black text-slate-900">{tenants.length}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-amber-50 text-amber-600 p-3 rounded-xl"><Activity size={24} /></div>
                <div>
                  <p className="text-sm text-slate-500 font-bold">{t('super_active_24h')}</p>
                  <p className="text-xl font-black text-slate-900">
                    {t('super_active_users_summary', { users: stats.activeUsers, tenants: stats.activeTenantsCount })}
                  </p>
                </div>
              </div>
            </div>

            {/* Toolbar: Search, Filters & Onboard Button */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
                <div className="relative w-full sm:w-80">
                  <Search className={`absolute ${isRtl ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400`} size={18} />
                  <input
                    type="text"
                    placeholder={t('super_search_placeholder')}
                    className={`w-full ${isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4'} py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all`}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  {(['all', 'single', 'master', 'child', 'frozen'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterType(f)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                        filterType === f
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t(`super_filter_${f}`)}
                    </button>
                  ))}
                </div>

                {/* Quick Expand / Collapse All */}
                {masterTenantsMap.size > 0 && (filterType === 'all' || filterType === 'master') && (
                  <div className="flex items-center gap-1 shrink-0 text-xs ps-2 border-s border-slate-200">
                    <button
                      type="button"
                      onClick={expandAllMasters}
                      className="px-2 py-1 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg font-bold transition-colors whitespace-nowrap text-[11px]"
                    >
                      {t('super_btn_expand_all')}
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={collapseAllMasters}
                      className="px-2 py-1 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg font-bold transition-colors whitespace-nowrap text-[11px]"
                    >
                      {t('super_btn_collapse_all')}
                    </button>
                  </div>
                )}
              </div>

              {/* Action Button: Provision Tenant or Fleet */}
              <button
                onClick={() => setIsOnboardingOpen(true)}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-95 whitespace-nowrap"
              >
                <Plus size={16} />
                {t('super_btn_create_tenant')}
              </button>
            </div>

            {/* High-Density Tenants Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-visible">
              <div className="overflow-x-auto lg:overflow-visible">
                <table className="w-full text-start text-xs border-collapse table-auto lg:table-fixed">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold border-b border-slate-200 uppercase tracking-wider">
                      <th className="py-3 px-3 text-start w-[24%] rounded-tr-2xl">{t('super_col_name_id')}</th>
                      <th className="py-3 px-2 text-start w-[11%]">{t('super_col_admins')}</th>
                      <th className="py-3 px-2 text-start w-[14%]">{t('super_col_tickets')}</th>
                      <th className="py-3 px-2 text-start w-[14%]">{t('super_col_rfq')}</th>
                      <th className="py-3 px-2 text-start w-[10%]">{t('super_col_created_at')}</th>
                      <th className="py-3 px-2 text-start w-[13%]">{t('super_col_last_login')}</th>
                      <th className="py-3 px-2 text-center w-[8%]">{t('super_col_status')}</th>
                      <th className="py-3 px-2 text-center w-[6%] rounded-tl-2xl">{t('super_col_actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((rowItem, index) => {
                      const tenant = rowItem.tenant;
                      const isChild = rowItem.isChild;
                      const childCount = rowItem.childCount || 0;
                      const isExpanded = rowItem.isExpanded || false;
                      const isFrozen = tenant.isActive === false || tenant.subscription?.status === 'frozen';
                      const isBottomRow = index >= Math.max(1, visibleRows.length - 2);
                      const ticketsUsed = tenant.subscription?.currentCycleTicketCount || 0;
                      const ticketsQuota = tenant.subscription?.monthlyQuota || 0;
                      const ticketRatio = ticketsQuota > 0 ? (ticketsUsed / ticketsQuota) : 0;

                      const rfqTier = tenant.rfqLicensing?.tier || 'disabled';
                      const rfqActive = rfqTier !== 'disabled' && tenant.rfqLicensing?.status !== 'disabled';
                      const rfqUsed = tenant.rfqLicensing?.currentAnnualUsage?.dispatchedCount || 0;
                      const rfqQuota = tenant.rfqLicensing?.annualQuota || 0;
                      const rfqRatio = rfqQuota > 0 ? (rfqUsed / rfqQuota) : 0;

                      return (
                        <tr
                          key={tenant.id}
                          className={`transition-colors group ${
                            isChild
                              ? 'bg-purple-50/15 hover:bg-purple-50/30 border-s-4 border-s-purple-400'
                              : 'hover:bg-slate-50/80 bg-white'
                          } ${activeMenuTenantId === tenant.id ? 'relative z-40' : ''}`}
                        >
                          {/* 1. Name & ID */}
                          <td className="py-2.5 px-3">
                            {isChild ? (
                              <div className={`flex items-start gap-2 ${isRtl ? 'pr-8' : 'pl-8'}`}>
                                <div className="mt-0.5 text-purple-600 shrink-0 font-black text-sm">
                                  ↳
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                    <span className="truncate">{tenant.name}</span>
                                    <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1 py-0.2 rounded border border-slate-200 shrink-0">
                                      {t('super_badge_child')}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono bg-white px-1.5 py-0.2 rounded text-[10px] text-slate-600 border border-slate-200 shrink-0">
                                      {tenant.id}
                                    </span>
                                    {tenant.address && (
                                      <span className="truncate text-slate-400 max-w-[140px]">{tenant.address}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5">
                                {tenant.isPoolMaster && childCount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpandMaster(tenant.id);
                                    }}
                                    className="p-1 -ms-1 text-slate-400 hover:text-purple-700 hover:bg-purple-100/70 rounded-md transition-colors shrink-0 mt-0.5"
                                    title={isExpanded ? t('super_collapse_fleet') : t('super_expand_fleet')}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown size={16} className="text-purple-600 stroke-[2.5]" />
                                    ) : isRtl ? (
                                      <ChevronLeft size={16} className="text-slate-400 hover:text-purple-600 stroke-[2.5]" />
                                    ) : (
                                      <ChevronRight size={16} className="text-slate-400 hover:text-purple-600 stroke-[2.5]" />
                                    )}
                                  </button>
                                ) : (
                                  <div className="w-5 shrink-0" />
                                )}

                                <div className="mt-0.5 text-slate-500 shrink-0">
                                  {tenant.isPoolMaster ? (
                                    <span title={t('super_badge_master')} className="text-purple-600 text-sm">🏙️</span>
                                  ) : (
                                    <Building size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                    <span className="truncate">{tenant.name}</span>
                                    {tenant.isPoolMaster && (
                                      <button
                                        type="button"
                                        onClick={() => childCount > 0 && toggleExpandMaster(tenant.id)}
                                        className={`text-[9px] font-black bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded border border-purple-200 shrink-0 inline-flex items-center gap-1 ${
                                          childCount > 0 ? 'hover:bg-purple-100 cursor-pointer' : ''
                                        }`}
                                      >
                                        <span>{t('super_badge_master')}</span>
                                        {childCount > 0 && (
                                          <span className="text-[9px] font-bold text-purple-600">
                                            ({t('super_buildings_count', { count: childCount })})
                                          </span>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-600 shrink-0">
                                      {tenant.id}
                                    </span>
                                    {tenant.address && (
                                      <span className="truncate text-slate-400 max-w-[140px]">{tenant.address}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 2. Registered Admins */}
                          <td className="py-2.5 px-2">
                            <button
                              onClick={() => handleOpenAdminsModal(tenant)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-100 whitespace-nowrap"
                            >
                              <Users size={12} />
                              {t('super_admins_count', { count: tenant.adminUids?.length || 0 })}
                            </button>
                            {(tenant.usesParentPool || tenant.parentEnterpriseId) && (
                              <div className="text-[9px] text-slate-400 mt-0.5 truncate">{t('super_admins_shared')}</div>
                            )}
                          </td>

                          {/* 3. TikTak Tickets (Monthly) */}
                          <td className="py-2.5 px-2">
                            {tenant.usesParentPool ? (
                              <div className="text-[11px] text-slate-500 font-medium">
                                <span className="bg-slate-100 px-1.5 py-0.2 rounded text-[10px] font-bold text-slate-600">
                                  {t('super_uses_pool')}
                                </span>
                                <div className="text-[10px] text-slate-400 mt-0.5">{ticketsUsed} נוצלו</div>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="uppercase text-[10px] font-black px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                    {tenant.subscription?.tier || 'starter'}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-600">
                                    {ticketsUsed}/{ticketsQuota}
                                  </span>
                                </div>
                                <div className="w-16 bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      ticketRatio >= 1.0 ? 'bg-red-500' : ticketRatio >= 0.8 ? 'bg-amber-500' : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.round(ticketRatio * 100))}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 4. RFQ License (Annual) */}
                          <td className="py-2.5 px-2">
                            {!rfqActive ? (
                              <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                {t('disabled') || 'לא פעיל'}
                              </span>
                            ) : (
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                    {rfqTier}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-600">
                                    {rfqUsed}/{rfqQuota}
                                  </span>
                                </div>
                                <div className="w-16 bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      rfqRatio >= 1.0 ? 'bg-red-500' : rfqRatio >= 0.8 ? 'bg-amber-500' : 'bg-purple-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.round(rfqRatio * 100))}%` }}
                                  />
                                </div>
                                {tenant.rfqLicensing?.licenseExpiresAt && (
                                  <div className="text-[9px] text-slate-400 mt-0.5 truncate">
                                    {t('super_expires_label')}: {formatDefiniteDate(tenant.rfqLicensing.licenseExpiresAt)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 5. Created At (Definite Date) */}
                          <td className="py-2.5 px-2 text-[11px] font-medium text-slate-600 font-mono whitespace-nowrap">
                            {formatDefiniteDate(tenant.createdAt)}
                          </td>

                          {/* 6. Last Login (Definite Date & Time) */}
                          <td className="py-2.5 px-2 text-[11px] font-medium text-slate-600 font-mono whitespace-nowrap">
                            {formatDefiniteDateTime(tenant.lastLogin)}
                          </td>

                          {/* 7. Status */}
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            {isFrozen ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 border border-slate-300">
                                <Snowflake size={11} className="text-blue-400" /> {t('super_status_frozen')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-green-50 text-green-700 border border-green-200">
                                <CheckCircle2 size={11} className="text-green-600" /> {t('super_status_active')}
                              </span>
                            )}
                          </td>

                          {/* 8. Actions (3-Dots Menu) */}
                          <td className="py-2.5 px-2 text-center relative action-menu-container">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuTenantId(activeMenuTenantId === tenant.id ? null : tenant.id);
                              }}
                              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {/* Dropdown Menu */}
                            {activeMenuTenantId === tenant.id && (
                              <div
                                className={`absolute ${isRtl ? 'left-0' : 'right-0'} ${
                                  isBottomRow ? 'bottom-8 mb-1 origin-bottom' : 'top-8 mt-1 origin-top'
                                } w-52 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 text-start animate-in fade-in zoom-in-95`}
                              >
                                {/* Direct Redirect: Instant navigation (no modal) */}
                                <Link
                                  to={`/admin/${tenant.id}/dashboard`}
                                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                >
                                  <ExternalLink size={14} />
                                  {t('super_action_redirect')}
                                </Link>

                                <hr className="my-1 border-slate-100" />

                                {/* Edit TikTak License Modal Trigger */}
                                <button
                                  onClick={() => openEditTicketModal(tenant)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <CreditCard size={14} className="text-blue-500" />
                                  {t('super_action_edit_tickets')}
                                </button>

                                {/* Edit RFQ License Modal Trigger */}
                                <button
                                  onClick={() => openEditRfqModal(tenant)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <FileText size={14} className="text-purple-500" />
                                  {t('super_action_edit_rfq')}
                                </button>

                                <hr className="my-1 border-slate-100" />

                                {/* Freeze / Unfreeze Modal Trigger */}
                                <button
                                  onClick={() => {
                                    setFreezeTenant(tenant);
                                    setActiveMenuTenantId(null);
                                    setActionError(null);
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold ${
                                    isFrozen ? 'text-green-600 hover:bg-green-50' : 'text-amber-600 hover:bg-amber-50'
                                  } transition-colors`}
                                >
                                  {isFrozen ? <Play size={14} /> : <Snowflake size={14} />}
                                  {isFrozen ? t('super_action_unfreeze') : t('super_action_freeze')}
                                </button>

                                {/* Delete Modal Trigger */}
                                <button
                                  onClick={() => {
                                    setDeletingTenant(tenant);
                                    setDeleteConfirmationInput('');
                                    setActiveMenuTenantId(null);
                                    setActionError(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={14} />
                                  {t('super_action_delete')}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {visibleRows.length === 0 && !loading && (
                <div className="text-center py-16 bg-white">
                  <p className="text-slate-400 font-bold">{t('super_no_tenants_found')}</p>
                </div>
              )}
            </div>

            {/* ======================================================== */}
            {/* MODAL 1: EDIT TIKTAK TICKETS LICENSE                     */}
            {/* ======================================================== */}
            {editingTicketTenant && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <CreditCard className="text-blue-600" size={20} />
                      {t('super_modal_edit_tickets_title')}
                    </h3>
                    <button
                      onClick={() => setEditingTicketTenant(null)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mb-4">
                    {editingTicketTenant.name} ({editingTicketTenant.id})
                  </p>

                  {actionError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl mb-4 font-bold">
                      {actionError}
                    </div>
                  )}

                  <form onSubmit={handleSaveTicketLicensing} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_tier')}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['starter', 'basic', 'standard', 'growth', 'enterprise'] as const).map(tierKey => (
                          <button
                            type="button"
                            key={tierKey}
                            onClick={() => {
                              const preset = TICKET_TIER_PRESETS[tierKey];
                              setTicketForm({
                                tier: tierKey,
                                monthlyQuota: preset.monthlyQuota,
                                overageRate: preset.overageRate
                              });
                            }}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all text-center uppercase ${
                              ticketForm.tier === tierKey
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {tierKey}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_quota')}</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={ticketForm.monthlyQuota}
                          onChange={e => setTicketForm({ ...ticketForm, monthlyQuota: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_overage')}</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          required
                          value={ticketForm.overageRate}
                          onChange={e => setTicketForm({ ...ticketForm, overageRate: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditingTicketTenant(null)}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                      >
                        {t('super_modal_cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={submittingAction}
                        className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                      >
                        {submittingAction ? t('super_modal_saving') : t('super_modal_save')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* MODAL 2: EDIT RFQ PROCUREMENT LICENSE                    */}
            {/* ======================================================== */}
            {editingRfqTenant && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="text-purple-600" size={20} />
                      {t('super_modal_edit_rfq_title')}
                    </h3>
                    <button
                      onClick={() => setEditingRfqTenant(null)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mb-4">
                    {editingRfqTenant.name} ({editingRfqTenant.id})
                  </p>

                  {actionError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl mb-4 font-bold">
                      {actionError}
                    </div>
                  )}

                  <form onSubmit={handleSaveRfqLicensing} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_tier')}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['disabled', 'starter', 'basic', 'standard', 'growth', 'enterprise'] as const).map(rfqKey => (
                          <button
                            type="button"
                            key={rfqKey}
                            onClick={() => {
                              const preset = RFQ_TIER_PRESETS[rfqKey] || { annualQuota: 0, overageRate: 59.0 };
                              setRfqForm({
                                ...rfqForm,
                                tier: rfqKey,
                                annualQuota: preset.annualQuota,
                                overageRate: preset.overageRate
                              });
                            }}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all text-center uppercase ${
                              rfqForm.tier === rfqKey
                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {rfqKey}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_annual_quota')}</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={rfqForm.annualQuota}
                          onChange={e => setRfqForm({ ...rfqForm, annualQuota: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_rfq_overage')}</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          required
                          value={rfqForm.overageRate}
                          onChange={e => setRfqForm({ ...rfqForm, overageRate: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_enforcement')}</label>
                        <select
                          value={rfqForm.enforcementMode}
                          onChange={e => setRfqForm({ ...rfqForm, enforcementMode: e.target.value as 'hard' | 'soft' })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        >
                          <option value="hard">{t('super_enforcement_hard')}</option>
                          <option value="soft">{t('super_enforcement_soft')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">{t('super_field_expires_at')}</label>
                        <input
                          type="date"
                          value={rfqForm.licenseExpiresAt}
                          onChange={e => setRfqForm({ ...rfqForm, licenseExpiresAt: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditingRfqTenant(null)}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                      >
                        {t('super_modal_cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={submittingAction}
                        className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                      >
                        {submittingAction ? t('super_modal_saving') : t('super_modal_save')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* MODAL 3: FREEZE / UNFREEZE CONFIRMATION MODAL            */}
            {/* ======================================================== */}
            {freezeTenant && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2.5 rounded-xl ${freezeTenant.isActive === false ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                      {freezeTenant.isActive === false ? <Play size={22} /> : <Snowflake size={22} />}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {freezeTenant.isActive === false ? t('super_modal_unfreeze_title') : t('super_modal_freeze_title')}
                      </h3>
                      <p className="text-xs text-slate-500">{freezeTenant.name} ({freezeTenant.id})</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed my-4">
                    {freezeTenant.isActive === false ? t('super_modal_unfreeze_desc') : t('super_modal_freeze_desc')}
                  </p>

                  {actionError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl mb-4 font-bold">
                      {actionError}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setFreezeTenant(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      {t('super_modal_cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={handleToggleFreeze}
                      className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 ${
                        freezeTenant.isActive === false ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                    >
                      {submittingAction ? t('super_modal_saving') : (freezeTenant.isActive === false ? t('super_action_unfreeze') : t('super_action_freeze'))}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* MODAL 4: SAFE PERMANENT DELETE (EXACT ID TYPING)         */}
            {/* ======================================================== */}
            {deletingTenant && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-red-600">
                        {t('super_modal_delete_title')}
                      </h3>
                      <p className="text-xs text-slate-500">{deletingTenant.name}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    {t('super_modal_delete_desc')}
                  </p>

                  <div className="bg-red-50/50 p-3.5 rounded-xl border border-red-100 mb-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t('super_modal_delete_type_confirm')}
                    </label>
                    <div className="font-mono text-xs font-black text-red-600 mb-2 select-all">
                      {deletingTenant.id}
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={deleteConfirmationInput}
                      onChange={e => setDeleteConfirmationInput(e.target.value)}
                      placeholder={deletingTenant.id}
                      className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                  </div>

                  {actionError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl mb-4 font-bold">
                      {actionError}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingTenant(null);
                        setDeleteConfirmationInput('');
                      }}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      {t('super_modal_cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={submittingAction || deleteConfirmationInput !== deletingTenant.id}
                      onClick={handleDeletePermanently}
                      className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submittingAction ? t('super_modal_deleting') : t('super_modal_delete_btn')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* MODAL 5: REGISTERED ADMINS POPOVER / MODAL               */}
            {/* ======================================================== */}
            {viewingAdminsTenant && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Users className="text-blue-600" size={20} />
                      {t('super_modal_admins_title', { name: viewingAdminsTenant.name })}
                    </h3>
                    <button
                      onClick={() => setViewingAdminsTenant(null)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {loadingAdmins ? (
                    <div className="py-8 flex justify-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin" />
                    </div>
                  ) : adminsList.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">
                      {t('super_modal_no_admins')}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {adminsList.map(adminUser => (
                        <div
                          key={adminUser.id}
                          className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {adminUser.name || `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || 'Admin'}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              {adminUser.email && (
                                <a
                                  href={`mailto:${adminUser.email}`}
                                  className="inline-flex items-center gap-1 hover:text-blue-600"
                                >
                                  <Mail size={12} /> {adminUser.email}
                                </a>
                              )}
                              {adminUser.mobile && (
                                <span className="inline-flex items-center gap-1 font-mono">
                                  <Phone size={12} /> {adminUser.mobile}
                                </span>
                              )}
                            </div>
                            {adminUser.lastLogin && (
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                <Clock size={11} /> {t('super_col_last_login')}: {formatDefiniteDateTime(adminUser.lastLogin)}
                              </div>
                            )}
                          </div>

                          {adminUser.mobile && (
                            <a
                              href={`https://wa.me/972${adminUser.mobile.replace(/\D/g, '').replace(/^0/, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center gap-1 shadow-sm shrink-0"
                            >
                              WhatsApp
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-4 mt-4 border-t border-slate-100">
                    <button
                      onClick={() => setViewingAdminsTenant(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      {t('close') || 'סגור'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* ONBOARD TENANT / FLEET WIZARD MODAL                      */}
            {/* ======================================================== */}
            <OnboardTenantModal
              isOpen={isOnboardingOpen}
              onClose={() => setIsOnboardingOpen(false)}
              onSuccess={fetchTenants}
            />
          </div>
        ) : activeTab === 'support' ? (
          <SupportInquiriesExplorer />
        ) : activeTab === 'audit' ? (
          <AuditExplorer isEn={!isRtl} />
        ) : (
          <HolidayManager />
        )}
      </main>
    </div>
  );
}

function HolidayManager() {
  const [holidaysByCountry, setHolidaysByCountry] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHoliday, setNewHoliday] = useState({ country: 'IL', name: '', date: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  async function fetchHolidays() {
    const snap = await getDocs(collection(db, 'holidays'));
    setHolidaysByCountry(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday.name || !newHoliday.date) return;
    setIsAdding(true);

    try {
      const countryRef = doc(db, 'holidays', newHoliday.country);
      await updateDoc(countryRef, {
        holidays: arrayUnion({ name: newHoliday.name, date: newHoliday.date })
      });
      setNewHoliday({ ...newHoliday, name: '', date: '' });
      await fetchHolidays();
    } catch (err) {
      console.error("Failed to add holiday:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const removeHoliday = async (countryId: string, holiday: any) => {
    if (!window.confirm(`האם למחוק את החג ${holiday.name}?`)) return;
    try {
      const countryRef = doc(db, 'holidays', countryId);
      await updateDoc(countryRef, {
        holidays: arrayRemove(holiday)
      });
      await fetchHolidays();
    } catch (err) {
      console.error("Failed to remove holiday:", err);
    }
  };

  const syncHolidays = async (countryCode: string) => {
    setIsSyncing(countryCode);
    const year = new Date().getFullYear();
    const yearsToSync = [year, year + 1];
    
    try {
      let fetchedHolidays: { name: string, date: string }[] = [];
      
      for (const y of yearsToSync) {
        if (countryCode === 'IL') {
          const res = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year=${y}&month=x&ss=on&mf=on&c=off&geo=none&i=on`);
          const data = await res.json();
          const items = data.items || [];
          items.forEach((item: any) => {
            if (item.category === 'holiday') {
              fetchedHolidays.push({ 
                name: item.title, 
                date: item.date.split('T')[0] 
              });
            }
          });
        } else if (countryCode === 'US') {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/US`);
          const data = await res.json();
          data.forEach((item: any) => {
            fetchedHolidays.push({ 
              name: item.name, 
              date: item.date 
            });
          });
        }
      }
      
      const countryRef = doc(db, 'holidays', countryCode);
      const docSnap = await getDoc(countryRef);
      const existing = docSnap.exists() ? (docSnap.data().holidays || []) : [];
      const existingDates = new Set(existing.map((h: any) => h.date));
      
      const newOnly = fetchedHolidays.filter(h => !existingDates.has(h.date));
      
      if (newOnly.length > 0) {
        await updateDoc(countryRef, {
          holidays: arrayUnion(...newOnly)
        });
        alert(`סונכרנו ${newOnly.length} חגים חדשים עבור ${countryCode}`);
        await fetchHolidays();
      } else {
        alert(`לא נמצאו חגים חדשים לסנכרון עבור ${countryCode}`);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      alert("הסנכרון נכשל. בדוק חיבור לאינטרנט או נסה שוב מאוחר יותר.");
    } finally {
      setIsSyncing(null);
    }
  };

  if (loading) return <div className="text-center py-10">טוען חגים...</div>;

  return (
    <div className="space-y-8">
      {/* Add Holiday Form */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-blue-600" /> הוספת חג חדש
        </h3>
        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            className="border border-slate-200 rounded-xl p-2.5 text-sm font-bold bg-slate-50"
            value={newHoliday.country}
            onChange={(e) => setNewHoliday(prev => ({ ...prev, country: e.target.value }))}
          >
            <option value="IL">ישראל (IL)</option>
            <option value="US">USA (US)</option>
          </select>
          <input
            type="text"
            placeholder="שם החג"
            className="border border-slate-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
            value={newHoliday.name}
            onChange={(e) => setNewHoliday(prev => ({ ...prev, name: e.target.value }))}
          />
          <input
            type="date"
            className="border border-slate-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
            value={newHoliday.date}
            onChange={(e) => setNewHoliday(prev => ({ ...prev, date: e.target.value }))}
          />
          <button
            type="submit"
            disabled={isAdding || !newHoliday.name || !newHoliday.date}
            className="bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {isAdding ? 'מוסיף...' : 'הוסף ללוח'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {holidaysByCountry.map(country => (
        <div key={country.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Globe size={18} className="text-blue-600" />
              {country.countryName} ({country.id})
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-400">{country.holidays.length} חגים מוזנים</span>
              <button 
                onClick={() => syncHolidays(country.id)}
                disabled={!!isSyncing}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSyncing === country.id ? 'animate-spin' : ''} />
                {isSyncing === country.id ? 'מסנכרן...' : 'סנכרון גלובלי'}
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {country.holidays.sort((a: any, b: any) => a.date.localeCompare(b.date)).map((h: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg transition-all group">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => removeHoliday(country.id, h)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={14} />
                    </button>
                    <span className="text-sm font-medium text-slate-700">{h.name}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400 group-hover:text-slate-600">{h.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
