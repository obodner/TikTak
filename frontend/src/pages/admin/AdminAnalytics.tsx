import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { collection, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { logAction } from '../../utils/auditLogger';
import { AdminLayoutContext } from '../../components/admin/AdminLayout';
import { 
  BarChart3, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Printer, 
  RefreshCw, 
  MapPin, 
  Filter, 
  ThumbsUp, 
  Sparkles, 
  Info,
  Lightbulb,
  Pin,
  Users,
  LayoutDashboard
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { format, subMonths, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, eachMonthOfInterval, eachWeekOfInterval } from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { calculateWorkingDays, getSlaStatus } from '../../utils/slaEngine';
import { MonthYearRangePicker } from '../../components/admin/MonthYearRangePicker';
import { HotspotNoticeModal, NoticeBannerData } from '../../components/admin/HotspotNoticeModal';
import { generateServiceInsights } from '../../utils/serviceInsightsEngine';
import heJson from '../../locales/he.json';
import enJson from '../../locales/en.json';

type DateRange = 'current_month' | 'last_3_months' | 'last_12_months' | 'this_year' | 'all' | 'custom';

interface VendorTelemetry {
  id: string;
  name: string;
  phone: string;
  profession?: string;
  dispatches: number;
  totalAckMinutes: number;
  ackRecordsCount: number;
  totalExecutionMinutes: number;
  executionRecordsCount: number;
  completedCount: number;
}

const CATEGORY_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#64748B'  // Slate
];

export default function AdminAnalytics() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const outletCtx = useOutletContext<AdminLayoutContext>();

  const isEn = outletCtx?.isEn || false;
  const dict = isEn ? enJson.Analytics : heJson.Analytics;
  const dateLocale = isEn ? enUS : he;

  const [dateRange, setDateRange] = useState<DateRange>('last_3_months');
  const [customStartDate, setCustomStartDate] = useState<Date>(() => startOfMonth(subMonths(new Date(), 2)));
  const [customEndDate, setCustomEndDate] = useState<Date>(() => endOfMonth(new Date()));
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [savedVendors, setSavedVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Option A: Categorized Tabs State
  type AnalyticsTab = 'overview' | 'funnel_workload' | 'hotspots_vendors' | 'insights';
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

  // Phase 2: Resident Notice Banner State
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [noticeModalLocation, setNoticeModalLocation] = useState('');
  const [noticeModalCategory, setNoticeModalCategory] = useState('');
  const [activeBanner, setActiveBanner] = useState<NoticeBannerData | null>(null);

  useEffect(() => {
    if (outletCtx?.tenantConfig?.noticeBanner) {
      setActiveBanner(outletCtx.tenantConfig.noticeBanner);
    }
  }, [outletCtx?.tenantConfig?.noticeBanner]);

  // Real-time listener for tenant tickets
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);

    const ticketsRef = collection(db, 'tenants', tenantId, 'tickets');
    const unsubTickets = onSnapshot(ticketsRef, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTickets(docs);
      setLoading(false);
      setRefreshing(false);
      setLastRefreshedAt(new Date());
    }, (err) => {
      console.error("Failed to load tickets for analytics:", err);
      setLoading(false);
      setRefreshing(false);
    });

    // Load registered vendors for directory lookup
    async function loadVendors() {
      try {
        const vSnap = await getDocs(collection(db, 'tenants', tenantId as string, 'vendors'));
        setSavedVendors(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to load vendors:", err);
      }
    }
    loadVendors();

    return () => unsubTickets();
  }, [tenantId]);

  // Working days and holidays from tenantConfig
  const tenantConfig = outletCtx?.tenantConfig;
  const workingDays = useMemo(() => {
    return tenantConfig?.workingDays || [0, 1, 2, 3, 4]; // Sunday - Thursday in IL
  }, [tenantConfig]);

  const holidays = useMemo(() => {
    return tenantConfig?.holidays || [];
  }, [tenantConfig]);

  // If this tenant uses a parent enterprise pool, fetch master pool host tenant data
  const [masterTenantData, setMasterTenantData] = useState<any>(null);
  useEffect(() => {
    if (tenantConfig?.usesParentPool && tenantConfig?.parentEnterpriseId) {
      getDoc(doc(db, "tenants", tenantConfig.parentEnterpriseId))
        .then((pSnap) => {
          if (pSnap.exists()) {
            setMasterTenantData(pSnap.data());
          }
        })
        .catch((err) => console.error("Error loading master pool data for analytics:", err));
    } else {
      setMasterTenantData(null);
    }
  }, [tenantConfig?.usesParentPool, tenantConfig?.parentEnterpriseId]);

  // Date Interval Calculation (Whole Months)
  const activeInterval = useMemo<{ start: Date; end: Date }>(() => {
    const now = new Date();
    switch (dateRange) {
      case 'current_month':
        return {
          start: startOfMonth(now),
          end: endOfMonth(now)
        };
      case 'last_3_months':
        return {
          start: startOfMonth(subMonths(now, 2)),
          end: endOfMonth(now)
        };
      case 'last_12_months':
        return {
          start: startOfMonth(subMonths(now, 11)),
          end: endOfMonth(now)
        };
      case 'this_year':
        return {
          start: startOfYear(now),
          end: endOfYear(now)
        };
      case 'custom':
        return {
          start: startOfMonth(customStartDate),
          end: endOfMonth(customEndDate)
        };
      case 'all':
      default:
        return {
          start: new Date(0),
          end: new Date(8640000000000000)
        };
    }
  }, [dateRange, customStartDate, customEndDate]);

  // Filtered tickets based on active date interval
  const rangeTickets = useMemo(() => {
    return tickets.filter(t => {
      if (!t.createdAt) return false;
      const created = parseISO(t.createdAt);
      if (isNaN(created.getTime())) return false;
      return isWithinInterval(created, activeInterval);
    });
  }, [tickets, activeInterval]);

  // 1. TOP KPI: MTTR (Mean Time to Resolution)
  const mttrMetrics = useMemo(() => {
    const validClosures = rangeTickets.filter(t => {
      if (t.status !== 'resolved') return false;
      // Exclude non-billable / noise closures from MTTR to avoid skewing operational turnaround
      const reason = (t.closureReason || '').toLowerCase();
      return !['duplicate', 'irrelevant', 'outside'].includes(reason);
    });

    if (validClosures.length === 0) {
      return { avgDays: null, count: 0, text: dict.kpi_mttr_no_data };
    }

    let totalWorkingDays = 0;
    validClosures.forEach(t => {
      const start = t.createdAt;
      const end = t.resolvedAt || t.closedAt || t.updatedAt || new Date().toISOString();
      const days = calculateWorkingDays(start, end, workingDays, holidays);
      totalWorkingDays += Math.max(0.1, days);
    });

    const avg = totalWorkingDays / validClosures.length;
    return {
      avgDays: avg,
      count: validClosures.length,
      formatted: avg < 1 ? `${Math.round(avg * 24)} ${isEn ? 'hrs' : 'שעות'}` : `${avg.toFixed(1)} ${dict.kpi_mttr_unit}`
    };
  }, [rangeTickets, workingDays, holidays, dict, isEn]);

  // 2. TOP KPI: Active Stagnation Count (SLA Inactive Zones within active time range)
  const slaStaleMetrics = useMemo(() => {
    const openTickets = rangeTickets.filter(t => t.status === 'open' || t.status === 'in-progress');
    let yellow = 0;
    let orange = 0;
    let red = 0;

    openTickets.forEach(t => {
      const workingDaysList = tenantConfig?.slaConfig?.workingDays || workingDays;
      const days = calculateWorkingDays(t.lastStatusChangeAt || t.createdAt, new Date(), workingDaysList, holidays);
      const status = t.slaStatus || getSlaStatus(days);
      if (status === 'stale-9') red++;
      else if (status === 'stale-5') orange++;
      else if (status === 'stale-2') yellow++;
    });

    return { yellow, orange, red, totalOpen: openTickets.length };
  }, [rangeTickets, tenantConfig, workingDays, holidays]);

  // 3. TOP KPI: First-Touch Response Rate
  const firstTouchMetrics = useMemo(() => {
    let touchedCount = 0;
    let totalMinutes = 0;

    rangeTickets.forEach(t => {
      if (!t.createdAt) return;
      const created = parseISO(t.createdAt).getTime();
      let touchTime: number | null = null;

      if (t.firstTouchAt) {
        touchTime = parseISO(t.firstTouchAt).getTime();
      } else if (Array.isArray(t.adminComments) && t.adminComments.length > 0 && t.adminComments[0].createdAt) {
        touchTime = parseISO(t.adminComments[0].createdAt).getTime();
      } else if (Array.isArray(t.vendors) && t.vendors.length > 0 && t.vendors[0].sentAt) {
        touchTime = parseISO(t.vendors[0].sentAt).getTime();
      } else if (t.lastVendorForwardAt) {
        touchTime = parseISO(t.lastVendorForwardAt).getTime();
      }

      if (touchTime && touchTime >= created) {
        const diffMinutes = (touchTime - created) / (1000 * 60);
        totalMinutes += diffMinutes;
        touchedCount++;
      }
    });

    if (touchedCount === 0) {
      return { formatted: dict.kpi_first_touch_no_data, touchedCount: 0 };
    }

    const avgMinutes = totalMinutes / touchedCount;
    if (avgMinutes < 60) {
      return { formatted: `${Math.round(avgMinutes)} ${isEn ? 'min' : 'דקות'}`, touchedCount };
    }
    const hours = avgMinutes / 60;
    return { formatted: `${hours.toFixed(1)} ${isEn ? 'hrs' : 'שעות'}`, touchedCount };
  }, [rangeTickets, dict, isEn]);

  // 4. TOP KPI: Period Quota Consumption (aligned with active time filter)
  const quotaMetrics = useMemo(() => {
    // Subtract non-billable noise within selected period
    const billable = rangeTickets.filter(t => {
      const reason = (t.closureReason || '').toLowerCase();
      return !['duplicate', 'outside', 'irrelevant'].includes(reason);
    });

    const activeTenant = masterTenantData || tenantConfig;
    const sub = activeTenant?.subscription || {};
    const monthlyQuota = typeof sub.monthlyQuota === 'number'
      ? sub.monthlyQuota
      : (typeof activeTenant?.monthlyQuota === 'number'
          ? activeTenant.monthlyQuota
          : (typeof activeTenant?.planQuota === 'number'
              ? activeTenant.planQuota
              : (typeof activeTenant?.ticketQuota === 'number'
                  ? activeTenant.ticketQuota
                  : 15)));
    const baseMonthlyQuota = monthlyQuota;

    let monthsCount = 1;
    if (dateRange === 'last_3_months') {
      monthsCount = 3;
    } else if (dateRange === 'last_12_months') {
      monthsCount = 12;
    } else if (dateRange === 'this_year') {
      const now = new Date();
      monthsCount = now.getMonth() + 1;
    } else if (dateRange === 'custom') {
      const startYear = activeInterval.start.getFullYear();
      const startMonth = activeInterval.start.getMonth();
      const endYear = activeInterval.end.getFullYear();
      const endMonth = activeInterval.end.getMonth();
      monthsCount = Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
    } else if (dateRange === 'all') {
      const earliest = tickets.reduce((min, t) => {
        if (!t.createdAt) return min;
        const d = parseISO(t.createdAt);
        return !isNaN(d.getTime()) && d < min ? d : min;
      }, new Date());
      monthsCount = Math.max(1, (new Date().getFullYear() - earliest.getFullYear()) * 12 + (new Date().getMonth() - earliest.getMonth()) + 1);
    }

    const rolloverTickets = dateRange === 'current_month' ? Number(sub.rolloverTickets || 0) : 0;
    const effectiveQuota = (baseMonthlyQuota * monthsCount) + rolloverTickets;
    const used = billable.length;
    const percentage = effectiveQuota > 0 ? Math.min(100, Math.round((used / effectiveQuota) * 100)) : 0;

    return { 
      used, 
      baseQuota: effectiveQuota, 
      percentage,
      monthsCount,
      subLabel: rolloverTickets > 0
        ? `${dict.kpi_quota_sub} (+${rolloverTickets} ${isEn ? 'rollover' : 'מגושרות'})`
        : monthsCount > 1 
        ? `${dict.kpi_quota_sub} (${monthsCount} ${isEn ? 'months' : 'חודשים'})`
        : dict.kpi_quota_sub
    };
  }, [rangeTickets, tickets, tenantConfig, masterTenantData, dateRange, activeInterval, dict, isEn]);

  // 5. Category Distribution (Donut Chart Data)
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    rangeTickets.forEach(t => {
      const cat = t.category || (isEn ? 'General' : 'כללי');
      map[cat] = (map[cat] || 0) + 1;
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rangeTickets, isEn]);

  // 6. Seasonality & Trends (Dynamic based on active time filter)
  const seasonalityData = useMemo(() => {
    let monthDates: Date[] = [];
    const now = new Date();

    if (dateRange === 'all') {
      const earliest = tickets.reduce((min, t) => {
        if (!t.createdAt) return min;
        const d = parseISO(t.createdAt);
        return !isNaN(d.getTime()) && d < min ? d : min;
      }, new Date());
      const start = startOfMonth(earliest);
      const end = endOfMonth(now);
      monthDates = eachMonthOfInterval({ start, end });
      if (monthDates.length > 24) {
        monthDates = monthDates.slice(monthDates.length - 24);
      }
    } else {
      monthDates = eachMonthOfInterval({
        start: activeInterval.start,
        end: activeInterval.end
      });
    }

    // If single month selected (e.g. current_month or 1-month custom range), display weekly breakdown
    if (monthDates.length <= 1) {
      const targetMonth = monthDates[0] || now;
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);
      const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 0 });

      return weeks.map((wStart, idx) => {
        const wEnd = new Date(wStart);
        wEnd.setDate(wEnd.getDate() + 6);
        const actualEnd = wEnd > monthEnd ? monthEnd : wEnd;

        const weekTickets = tickets.filter(t => {
          if (!t.createdAt) return false;
          const d = parseISO(t.createdAt);
          return isWithinInterval(d, { start: wStart, end: actualEnd });
        });

        const label = isEn 
          ? `W${idx + 1} (${format(wStart, 'd/M')})`
          : `שבוע ${idx + 1} (${format(wStart, 'd/M')})`;

        return {
          month: label,
          total: weekTickets.length
        };
      });
    }

    // Multi-month breakdown
    return monthDates.map(mDate => {
      const start = startOfMonth(mDate);
      const end = endOfMonth(mDate);
      const label = format(mDate, 'MMM yy', { locale: dateLocale });

      const monthTickets = tickets.filter(t => {
        if (!t.createdAt) return false;
        const d = parseISO(t.createdAt);
        return isWithinInterval(d, { start, end });
      });

      return {
        month: label,
        total: monthTickets.length
      };
    });
  }, [tickets, dateRange, activeInterval, dateLocale, isEn]);

  // 7. Geographic & Resource Hotspots (Top 5 locations)
  const hotspotData = useMemo(() => {
    const locMap: Record<string, { count: number; categories: Record<string, number> }> = {};

    rangeTickets.forEach(t => {
      let loc = (t.location || '').trim();
      if (t.subLocation && t.subLocation.trim()) {
        loc = loc ? `${loc} - ${t.subLocation.trim()}` : t.subLocation.trim();
      }
      if (!loc && t.floor) {
        loc = isEn ? `Floor ${t.floor}` : `קומה ${t.floor}`;
      }
      if (!loc) {
        loc = isEn ? 'Unspecified Location' : 'מיקום כללי / לא צוין';
      }

      if (!locMap[loc]) {
        locMap[loc] = { count: 0, categories: {} };
      }
      locMap[loc].count++;
      const cat = t.category || (isEn ? 'General' : 'כללי');
      locMap[loc].categories[cat] = (locMap[loc].categories[cat] || 0) + 1;
    });

    return Object.entries(locMap)
      .map(([location, data]) => {
        const topCategory = Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return {
          location,
          count: data.count,
          topCategory
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [rangeTickets, isEn]);

  // 8. The Noise Filter & Duplicate Ratio
  const noiseMetrics = useMemo(() => {
    const closed = rangeTickets.filter(t => t.status === 'resolved' || t.status === 'dismissed');
    let duplicate = 0;
    let outside = 0;
    let irrelevant = 0;
    let fixed = 0;

    closed.forEach(t => {
      const reason = (t.closureReason || '').toLowerCase();
      if (reason === 'duplicate') duplicate++;
      else if (reason === 'outside') outside++;
      else if (reason === 'irrelevant') irrelevant++;
      else fixed++;
    });

    const total = closed.length;
    const noiseTotal = duplicate + outside + irrelevant;
    const noiseRatio = total > 0 ? Math.round((noiseTotal / total) * 100) : 0;
    const outsideRatio = total > 0 ? outside / total : 0;

    return {
      total,
      duplicate,
      outside,
      irrelevant,
      fixed,
      noiseTotal,
      noiseRatio,
      showAdvisory: outsideRatio > 0.15
    };
  }, [rangeTickets]);

  // 9. "Me Too" (📢) Community Demand Leaderboard
  const meTooLeaderboard = useMemo(() => {
    const openWithVotes = tickets.filter(t => {
      const isOpen = t.status === 'open' || t.status === 'in-progress';
      const votes = typeof t.meToo === 'number' ? t.meToo : 0;
      return isOpen && votes > 0;
    });

    return openWithVotes
      .sort((a, b) => (b.meToo || 0) - (a.meToo || 0))
      .slice(0, 6);
  }, [tickets]);

  // 10. Live Vendor Performance Scorecard (Gracefully handles legacy vendor records)
  const vendorScorecard = useMemo(() => {
    const vendorMap: Record<string, VendorTelemetry> = {};

    // Seed from registered vendors
    savedVendors.forEach(sv => {
      const cleanPhone = String(sv.phone || '').replace(/\D/g, '');
      const key = cleanPhone || sv.fullName || sv.id;
      vendorMap[key] = {
        id: sv.id,
        name: sv.fullName || sv.name || (isEn ? 'Unknown Vendor' : 'ספק ללא שם'),
        phone: sv.phone || '',
        profession: sv.profession || '',
        dispatches: 0,
        totalAckMinutes: 0,
        ackRecordsCount: 0,
        totalExecutionMinutes: 0,
        executionRecordsCount: 0,
        completedCount: 0
      };
    });

    // Aggregate from ticket dispatches
    rangeTickets.forEach(t => {
      if (!Array.isArray(t.vendors)) return;

      t.vendors.forEach((vItem: any) => {
        const cleanPhone = String(vItem.phone || vItem.rawPhone || '').replace(/\D/g, '');
        const key = cleanPhone || vItem.name || 'unknown';

        if (!vendorMap[key]) {
          vendorMap[key] = {
            id: key,
            name: vItem.name || (isEn ? 'Vendor' : 'ספק'),
            phone: vItem.phone || '',
            profession: '',
            dispatches: 0,
            totalAckMinutes: 0,
            ackRecordsCount: 0,
            totalExecutionMinutes: 0,
            executionRecordsCount: 0,
            completedCount: 0
          };
        }

        const vRec = vendorMap[key];
        vRec.dispatches++;

        // Note: Check for valid recorded ackTimeMinutes (graceful check for legacy tickets)
        if (typeof vItem.ackTimeMinutes === 'number' && !isNaN(vItem.ackTimeMinutes)) {
          vRec.totalAckMinutes += vItem.ackTimeMinutes;
          vRec.ackRecordsCount++;
        }

        // Note: Check for valid recorded executionTimeMinutes (graceful check for legacy tickets)
        if (typeof vItem.executionTimeMinutes === 'number' && !isNaN(vItem.executionTimeMinutes)) {
          vRec.totalExecutionMinutes += vItem.executionTimeMinutes;
          vRec.executionRecordsCount++;
        }

        if (vItem.status === 'בוצע' || vItem.status === 'completed') {
          vRec.completedCount++;
        }
      });
    });

    return Object.values(vendorMap)
      .filter(v => v.dispatches > 0)
      .sort((a, b) => b.dispatches - a.dispatches);
  }, [rangeTickets, savedVendors, isEn]);

  // 11. Phase 2: Time-in-State Funnel (Intake vs. Field Execution)
  const funnelMetrics = useMemo(() => {
    const resolved = rangeTickets.filter(t => {
      if (t.status !== 'resolved') return false;
      const reason = (t.closureReason || '').toLowerCase();
      return !['duplicate', 'irrelevant', 'outside'].includes(reason);
    });

    if (resolved.length === 0) {
      return {
        hasData: false,
        avgIntakeHours: 0,
        avgExecutionHours: 0,
        intakePercent: 50,
        executionPercent: 50,
        bottleneck: 'balanced' as const,
        sampleCount: 0
      };
    }

    let totalIntakeMinutes = 0;
    let totalExecutionMinutes = 0;

    resolved.forEach(t => {
      if (!t.createdAt) return;
      const created = parseISO(t.createdAt).getTime();
      const resolvedTime = parseISO(t.resolvedAt || t.closedAt || t.updatedAt || t.createdAt).getTime();

      let intakeTime = created;
      if (t.firstTouchAt) {
        intakeTime = parseISO(t.firstTouchAt).getTime();
      } else if (Array.isArray(t.adminComments) && t.adminComments.length > 0 && t.adminComments[0].createdAt) {
        intakeTime = parseISO(t.adminComments[0].createdAt).getTime();
      } else if (Array.isArray(t.vendors) && t.vendors.length > 0 && t.vendors[0].sentAt) {
        intakeTime = parseISO(t.vendors[0].sentAt).getTime();
      } else if (t.lastVendorForwardAt) {
        intakeTime = parseISO(t.lastVendorForwardAt).getTime();
      } else if (t.lastStatusChangeAt) {
        intakeTime = parseISO(t.lastStatusChangeAt).getTime();
      } else {
        intakeTime = created + (resolvedTime - created) * 0.2;
      }

      intakeTime = Math.max(created, Math.min(intakeTime, resolvedTime));
      const intakeMins = (intakeTime - created) / (1000 * 60);
      const execMins = (resolvedTime - intakeTime) / (1000 * 60);

      totalIntakeMinutes += Math.max(0, intakeMins);
      totalExecutionMinutes += Math.max(0, execMins);
    });

    const avgIntakeHours = (totalIntakeMinutes / resolved.length) / 60;
    const avgExecutionHours = (totalExecutionMinutes / resolved.length) / 60;
    const totalHours = avgIntakeHours + avgExecutionHours;

    const intakePercent = totalHours > 0 ? Math.round((avgIntakeHours / totalHours) * 100) : 0;
    const executionPercent = 100 - intakePercent;

    let bottleneck: 'intake' | 'execution' | 'balanced' = 'balanced';
    if (intakePercent > 45) bottleneck = 'intake';
    else if (executionPercent > 70) bottleneck = 'execution';

    return {
      hasData: true,
      avgIntakeHours,
      avgExecutionHours,
      intakePercent,
      executionPercent,
      bottleneck,
      sampleCount: resolved.length
    };
  }, [rangeTickets]);

  // 12. Phase 2: Committee & Volunteer Workload Balancing
  const workloadMetrics = useMemo(() => {
    const adminMap: Record<string, { name: string; handled: Set<string>; actions: number; closed: number }> = {};

    rangeTickets.forEach(t => {
      if (Array.isArray(t.adminComments)) {
        t.adminComments.forEach((c: any) => {
          const author = (c.authorName || c.author || '').trim();
          if (!author) return;
          if (!adminMap[author]) {
            adminMap[author] = { name: author, handled: new Set(), actions: 0, closed: 0 };
          }
          adminMap[author].handled.add(t.id);
          adminMap[author].actions++;
        });
      }

      if (t.closedBy) {
        const closer = String(t.closedBy).trim();
        if (closer) {
          if (!adminMap[closer]) {
            adminMap[closer] = { name: closer, handled: new Set(), actions: 0, closed: 0 };
          }
          adminMap[closer].handled.add(t.id);
          adminMap[closer].actions++;
          adminMap[closer].closed++;
        }
      }

      if (Array.isArray(t.vendors)) {
        t.vendors.forEach((v: any) => {
          const dispatcher = (v.forwardedBy || '').trim();
          if (dispatcher) {
            if (!adminMap[dispatcher]) {
              adminMap[dispatcher] = { name: dispatcher, handled: new Set(), actions: 0, closed: 0 };
            }
            adminMap[dispatcher].handled.add(t.id);
            adminMap[dispatcher].actions++;
          }
        });
      }
    });

    const adminsList = Object.values(adminMap).map(a => ({
      name: a.name,
      handledCount: a.handled.size,
      actionsCount: a.actions,
      closedCount: a.closed
    })).sort((a, b) => b.actionsCount - a.actionsCount);

    const totalActions = adminsList.reduce((sum, a) => sum + a.actionsCount, 0);
    const maxShare = totalActions > 0 && adminsList.length > 0
      ? Math.round((adminsList[0].actionsCount / totalActions) * 100)
      : 0;

    const isConcentrated = adminsList.length > 1 && maxShare >= 70;

    return {
      admins: adminsList,
      totalActions,
      isConcentrated,
      topLeader: adminsList[0]?.name || null,
      maxShare
    };
  }, [rangeTickets]);

  // 13. Phase 2: Smart Insights & Resident Service Optimization Section
  const insightsList = useMemo(() => {
    let firstTouchHours: number | null = null;
    if (firstTouchMetrics.touchedCount > 0) {
      if (firstTouchMetrics.formatted.includes('min') || firstTouchMetrics.formatted.includes('דקות')) {
        firstTouchHours = parseFloat(firstTouchMetrics.formatted) / 60;
      } else {
        firstTouchHours = parseFloat(firstTouchMetrics.formatted);
      }
    }

    return generateServiceInsights({
      firstTouchAvgHours: isNaN(firstTouchHours as any) ? null : firstTouchHours,
      firstTouchCount: firstTouchMetrics.touchedCount,
      noiseRatio: noiseMetrics.noiseRatio || 0,
      duplicateCount: noiseMetrics.duplicate,
      outsideScopeCount: noiseMetrics.outside,
      irrelevantCount: noiseMetrics.irrelevant,
      totalClosed: noiseMetrics.total,
      hotspots: hotspotData,
      vendorScorecard: vendorScorecard.map(v => ({
        name: v.name,
        avgAckMinutes: v.ackRecordsCount > 0 ? Math.round(v.totalAckMinutes / v.ackRecordsCount) : null,
        avgExecutionHours: v.executionRecordsCount > 0 ? (v.totalExecutionMinutes / v.executionRecordsCount) / 60 : null,
        dispatches: v.dispatches,
        completedCount: v.completedCount
      })),
      meTooTickets: meTooLeaderboard,
      intakeExecutionSplit: funnelMetrics.hasData ? {
        intakeHours: funnelMetrics.avgIntakeHours,
        executionHours: funnelMetrics.avgExecutionHours,
        intakePercent: funnelMetrics.intakePercent
      } : undefined,
      isEn
    });
  }, [firstTouchMetrics, noiseMetrics, hotspotData, vendorScorecard, meTooLeaderboard, funnelMetrics, isEn]);

  // Print Report Handler
  const handlePrint = async () => {
    try {
      const user = auth.currentUser;
      await logAction({
        tenantId: tenantId || '',
        action: 'ANALYTICS_REPORT_EXPORTED',
        actor: {
          uid: user?.uid || 'unknown_admin',
          name: user?.displayName || user?.email || 'מנהל ועד',
          email: user?.email || undefined,
          type: 'admin'
        },
        details: {
          timeRange: dateRange,
          customRange: dateRange === 'custom' ? { start: customStartDate.toISOString(), end: customEndDate.toISOString() } : null,
          totalTickets: rangeTickets.length
        }
      });
    } catch (err) {
      console.warn("Audit log error:", err);
    }
    window.print();
  };

  const handleManualRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setLastRefreshedAt(new Date());
      setRefreshing(false);
    }, 600);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
        <div className="h-10 bg-slate-200 rounded-xl animate-pulse w-64 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-28 bg-white border border-slate-200/80 rounded-2xl p-5 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-white border border-slate-200/80 rounded-2xl p-6 animate-pulse" />
          <div className="h-80 bg-white border border-slate-200/80 rounded-2xl p-6 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-slate-50 min-h-screen print:p-0 print:bg-white print:max-w-none text-slate-900" dir={isEn ? 'ltr' : 'rtl'}>
      
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER BAR & CONTROLS (Hidden in print)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">
                {dict.title}
              </h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                {outletCtx?.tenantConfig?.name ? `${outletCtx.tenantConfig.name} • ` : ''}
                {dict.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: Date Range & PDF Export */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Range Selector */}
          <div className="relative">
            <div className="bg-white border border-slate-200 rounded-xl p-1 shadow-sm flex items-center gap-1 text-xs font-bold flex-wrap sm:flex-nowrap">
              {(['current_month', 'last_3_months', 'last_12_months', 'this_year', 'all'] as DateRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setDateRange(r);
                    setShowCustomPicker(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    dateRange === r
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {dict[`range_${r}` as keyof typeof dict]}
                </button>
              ))}

              <button
                onClick={() => {
                  setDateRange('custom');
                  setShowCustomPicker(!showCustomPicker);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  dateRange === 'custom'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>📅</span>
                <span>
                  {dateRange === 'custom'
                    ? `${format(customStartDate, 'MM/yy')} – ${format(customEndDate, 'MM/yy')}`
                    : dict.range_custom}
                </span>
              </button>
            </div>

            {/* Floating Month & Year Calendar Picker Popover */}
            {showCustomPicker && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowCustomPicker(false)} 
                />
                <div className="absolute top-full mt-2 end-0 z-50 shadow-2xl">
                  <MonthYearRangePicker
                    startDate={customStartDate}
                    endDate={customEndDate}
                    onChange={(start, end) => {
                      setCustomStartDate(start);
                      setCustomEndDate(end);
                      setDateRange('custom');
                      setShowCustomPicker(false);
                    }}
                    onClose={() => setShowCustomPicker(false)}
                    isEn={isEn}
                  />
                </div>
              </>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            title={`${isEn ? 'Last updated' : 'עודכן לאחרונה'}: ${format(lastRefreshedAt, 'HH:mm:ss')}`}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-blue-600' : ''} />
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs md:text-sm font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Printer size={16} />
            <span>{dict.exportPdf}</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PRINT-ONLY EXECUTIVE REPORT HEADER
      ───────────────────────────────────────────────────────────── */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{dict.print_report_title}</h1>
            <p className="text-sm font-bold text-slate-700">{outletCtx?.tenantConfig?.name || tenantId}</p>
          </div>
          <div className="text-end text-xs text-slate-500">
            <p>{dict.print_generated_at}: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            <p>
              {dateRange === 'custom'
                ? `${format(customStartDate, 'MM/yyyy')} – ${format(customEndDate, 'MM/yyyy')}`
                : dict[`range_${dateRange}` as keyof typeof dict]}
            </p>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. TOP KPI RIBBON (Executive Pulse)
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: MTTR */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">{dict.kpi_mttr}</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Clock size={18} />
            </div>
          </div>
          <div className="text-2xl md:text-3xl font-black text-slate-900">
            {mttrMetrics.formatted || mttrMetrics.text}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {mttrMetrics.count > 0 ? `${mttrMetrics.count} ${isEn ? 'resolved tickets' : 'פניות שטופלו'}` : dict.kpi_mttr_sub}
          </p>
        </div>

        {/* KPI 2: Active SLA Stagnation (Clickable Traffic-Light Zone) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">{dict.kpi_sla_stale}</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle size={18} />
            </div>
          </div>
          
          <div className="flex items-center gap-2 mt-1">
            {/* Red zone (9+ days) */}
            <button
              onClick={() => {
                let url = `/admin/${tenantId}/dashboard?sla=stale-9&timeRange=${dateRange}`;
                if (dateRange === 'custom') {
                  url += `&startDate=${format(customStartDate, 'yyyy-MM-dd')}&endDate=${format(customEndDate, 'yyyy-MM-dd')}`;
                }
                navigate(url);
              }}
              className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 py-1 px-2 rounded-xl text-center transition-all cursor-pointer"
              title={isEn ? 'Filter Red SLA (9+ days) on Kanban' : 'סינון חריגות 9+ ימים בדשבורד'}
            >
              <div className="text-base font-black">{slaStaleMetrics.red}</div>
              <div className="text-[10px] font-bold">{dict.kpi_sla_red}</div>
            </button>

            {/* Orange zone (5+ days) */}
            <button
              onClick={() => {
                let url = `/admin/${tenantId}/dashboard?sla=stale-5&timeRange=${dateRange}`;
                if (dateRange === 'custom') {
                  url += `&startDate=${format(customStartDate, 'yyyy-MM-dd')}&endDate=${format(customEndDate, 'yyyy-MM-dd')}`;
                }
                navigate(url);
              }}
              className="flex-1 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 py-1 px-2 rounded-xl text-center transition-all cursor-pointer"
              title={isEn ? 'Filter Orange SLA (5+ days) on Kanban' : 'סינון חריגות 5+ ימים בדשבורד'}
            >
              <div className="text-base font-black">{slaStaleMetrics.orange}</div>
              <div className="text-[10px] font-bold">{dict.kpi_sla_orange}</div>
            </button>

            {/* Yellow zone (2+ days) */}
            <button
              onClick={() => {
                let url = `/admin/${tenantId}/dashboard?sla=stale-2&timeRange=${dateRange}`;
                if (dateRange === 'custom') {
                  url += `&startDate=${format(customStartDate, 'yyyy-MM-dd')}&endDate=${format(customEndDate, 'yyyy-MM-dd')}`;
                }
                navigate(url);
              }}
              className="flex-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 py-1 px-2 rounded-xl text-center transition-all cursor-pointer"
              title={isEn ? 'Filter Yellow SLA (2+ days) on Kanban' : 'סינון חריגות 2+ ימים בדשבורד'}
            >
              <div className="text-base font-black">{slaStaleMetrics.yellow}</div>
              <div className="text-[10px] font-bold">{dict.kpi_sla_yellow}</div>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-medium">
            {isEn ? 'Click any zone to filter live board' : 'הקלק על אזור לסינון מיידי בדשבורד'}
          </p>
        </div>

        {/* KPI 3: First-Touch Response Rate */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">{dict.kpi_first_touch}</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="text-2xl md:text-3xl font-black text-slate-900">
            {firstTouchMetrics.formatted}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {dict.kpi_first_touch_sub}
          </p>
        </div>

        {/* KPI 4: Monthly Quota Gauge */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">{dict.kpi_quota}</span>
            <span className="text-xs font-extrabold text-blue-600">{quotaMetrics.percentage}%</span>
          </div>
          <div className="text-2xl md:text-3xl font-black text-slate-900">
            {quotaMetrics.used} <span className="text-sm font-semibold text-slate-400">/ {quotaMetrics.baseQuota}</span>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                quotaMetrics.percentage >= 90 ? 'bg-red-500' :
                quotaMetrics.percentage >= 70 ? 'bg-amber-500' : 'bg-blue-600'
              }`}
              style={{ width: `${quotaMetrics.percentage}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            {quotaMetrics.subLabel || dict.kpi_quota_sub}
          </p>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          SUB-TABS NAVIGATION BAR (Option A - Categorized Views)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-200/70 backdrop-blur-xs rounded-2xl border border-slate-200 print:hidden">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <LayoutDashboard size={16} className={activeTab === 'overview' ? 'text-blue-600' : 'text-slate-500'} />
          <span>{dict.tab_overview}</span>
        </button>

        <button
          onClick={() => setActiveTab('funnel_workload')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'funnel_workload'
              ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Clock size={16} className={activeTab === 'funnel_workload' ? 'text-blue-600' : 'text-slate-500'} />
          <span>{dict.tab_funnel_workload}</span>
        </button>

        <button
          onClick={() => setActiveTab('hotspots_vendors')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'hotspots_vendors'
              ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <MapPin size={16} className={activeTab === 'hotspots_vendors' ? 'text-blue-600' : 'text-slate-500'} />
          <span>{dict.tab_hotspots_vendors}</span>
          {activeBanner?.active && (
            <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              <Pin size={10} className="text-amber-700" />
              <span>{dict.tab_active_banner_badge}</span>
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            activeTab === 'insights'
              ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Lightbulb size={16} className={activeTab === 'insights' ? 'text-amber-600' : 'text-slate-500'} />
          <span>{dict.tab_insights}</span>
          {insightsList.length > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
              {insightsList.length}
            </span>
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: OVERVIEW & TRENDS
      ───────────────────────────────────────────────────────────── */}
      <div className={`${activeTab === 'overview' ? 'block' : 'hidden'} print:block space-y-6`}>
        {/* Category Breakdown Donut & Seasonality Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Category Breakdown Donut */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">{dict.chart_categories}</h2>
                <p className="text-xs text-slate-500">{rangeTickets.length} {isEn ? 'total tickets in period' : 'פניות בתקופה זו'}</p>
              </div>
            </div>

            {categoryData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <RechartsLegend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                {isEn ? 'No tickets found in this period' : 'אין פניות מתועדות בתקופה זו'}
              </div>
            )}
          </div>

          {/* 6-Month Category Seasonality Trends */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{dict.chart_seasonality}</span>
                  {seasonalityData.length > 0 && (
                    <span className="text-xs font-semibold text-slate-500">
                      ({dateRange === 'current_month' && seasonalityData.length <= 5
                        ? (isEn ? 'Weekly breakdown' : 'פילוח שבועי')
                        : `${seasonalityData.length} ${isEn ? 'months' : 'חודשים'}`})
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500">{isEn ? 'Volume history for selected period' : 'מגמות וצבר תקלות לתקופה שנבחרה'}</p>
              </div>
            </div>

            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonalityData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis allowDecimals={false} width={35} tickMargin={6} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="total" fill="#3B82F6" radius={[6, 6, 0, 0]} name={isEn ? 'Tickets' : 'פניות'} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* "ME TOO" (📢) COMMUNITY DEMAND LEADERBOARD */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ThumbsUp size={18} className="text-blue-600" />
                <span>{dict.me_too_title}</span>
              </h2>
              <p className="text-xs text-slate-500">{dict.me_too_sub}</p>
            </div>
          </div>

          {meTooLeaderboard.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {meTooLeaderboard.map(ticket => (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/admin/${tenantId}/dashboard?ticket=${ticket.id}`)}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50/40 hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-black text-slate-500">
                        #{ticket.ticketNumber || ticket.id.slice(0, 5)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-700">
                        <ThumbsUp size={12} />
                        {ticket.meToo} {dict.me_too_upvotes}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 line-clamp-2">
                      {ticket.summary || ticket.category}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200/60">
                    <span className="truncate">{ticket.location || ticket.category}</span>
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                      ticket.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {ticket.status === 'open' ? (isEn ? 'Open' : 'חדש') : (isEn ? 'In Progress' : 'בטיפול')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-sm">
              {dict.me_too_no_data}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: SLA DEEP TRIAGE: TIME-IN-STATE FUNNEL & WORKLOAD BALANCING
      ───────────────────────────────────────────────────────────── */}
      <div className={`${activeTab === 'funnel_workload' ? 'block' : 'hidden'} print:block space-y-6`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Time-in-State Resolution Funnel */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Clock size={18} className="text-blue-600" />
                    <span>{dict.funnel_title}</span>
                  </h2>
                  <p className="text-xs text-slate-500">{dict.funnel_sub}</p>
                </div>

                {/* Diagnostic Badge */}
                {funnelMetrics.hasData && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${
                    funnelMetrics.bottleneck === 'intake'
                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                      : funnelMetrics.bottleneck === 'execution'
                      ? 'bg-blue-100 text-blue-900 border border-blue-200'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  }`}>
                    {funnelMetrics.bottleneck === 'intake'
                      ? dict.funnel_bottleneck_intake
                      : funnelMetrics.bottleneck === 'execution'
                      ? dict.funnel_bottleneck_exec
                      : dict.funnel_balanced}
                  </span>
                )}
              </div>

              {funnelMetrics.hasData ? (
                <div className="space-y-4 my-2">
                  {/* 2-Step Connected Pipeline */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    
                    {/* Step 1: Intake */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 relative">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-bold mb-1">
                        <span>{dict.funnel_stage_intake}</span>
                        <span className="text-blue-600 font-black">{funnelMetrics.intakePercent}%</span>
                      </div>
                      <div className="text-xl font-black text-slate-900">
                        {funnelMetrics.avgIntakeHours < 1
                          ? `${Math.round(funnelMetrics.avgIntakeHours * 60)} ${isEn ? 'min' : 'דקות'}`
                          : funnelMetrics.avgIntakeHours < 24
                          ? `${funnelMetrics.avgIntakeHours.toFixed(1)} ${isEn ? 'hrs' : 'שעות'}`
                          : `${(funnelMetrics.avgIntakeHours / 24).toFixed(1)} ${isEn ? 'days' : 'ימים'}`}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{dict.funnel_stage_intake_sub}</p>
                    </div>

                    {/* Step 2: Field Execution */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 relative">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-bold mb-1">
                        <span>{dict.funnel_stage_exec}</span>
                        <span className="text-emerald-600 font-black">{funnelMetrics.executionPercent}%</span>
                      </div>
                      <div className="text-xl font-black text-slate-900">
                        {funnelMetrics.avgExecutionHours < 24
                          ? `${funnelMetrics.avgExecutionHours.toFixed(1)} ${isEn ? 'hrs' : 'שעות'}`
                          : `${(funnelMetrics.avgExecutionHours / 24).toFixed(1)} ${isEn ? 'days' : 'ימים'}`}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{dict.funnel_stage_exec_sub}</p>
                    </div>

                  </div>

                  {/* Progress Bar Split */}
                  <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden">
                    <div 
                      className="bg-blue-600 transition-all duration-500"
                      style={{ width: `${funnelMetrics.intakePercent}%` }}
                      title={`${dict.funnel_stage_intake}: ${funnelMetrics.intakePercent}%`}
                    />
                    <div 
                      className="bg-emerald-500 transition-all duration-500"
                      style={{ width: `${funnelMetrics.executionPercent}%` }}
                      title={`${dict.funnel_stage_exec}: ${funnelMetrics.executionPercent}%`}
                    />
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-sm">
                  {dict.kpi_mttr_no_data}
                </div>
              )}
            </div>

            <div className="text-xs text-slate-400 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span>{isEn ? 'Sample size' : 'גודל מדגם'}: {funnelMetrics.sampleCount} {isEn ? 'resolved tickets' : 'פניות שטופלו'}</span>
              <span>MTTR: {mttrMetrics.formatted || mttrMetrics.text}</span>
            </div>
          </div>

          {/* Committee Workload Balancing */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <Users size={18} className="text-indigo-600" />
                    <span>{dict.workload_title}</span>
                  </h2>
                  <p className="text-xs text-slate-500">{dict.workload_sub}</p>
                </div>

                {/* Concentration Warning / Balance Badge */}
                <span className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 ${
                  workloadMetrics.isConcentrated
                    ? 'bg-amber-100 text-amber-900 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                }`}>
                  {workloadMetrics.isConcentrated ? dict.workload_single_lead : dict.workload_balanced}
                </span>
              </div>

              {workloadMetrics.admins.length > 0 ? (
                <div className="space-y-3 my-2">
                  {workloadMetrics.admins.slice(0, 4).map((adm, idx) => {
                    const share = workloadMetrics.totalActions > 0
                      ? Math.round((adm.actionsCount / workloadMetrics.totalActions) * 100)
                      : 0;

                    return (
                      <div key={adm.name} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                        <div className="flex items-center justify-between mb-1.5 text-xs">
                          <div className="flex items-center gap-2 font-bold text-slate-900">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">
                              {idx + 1}
                            </span>
                            <span className="truncate">{adm.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 shrink-0">
                            <span>{adm.handledCount} {dict.workload_handled}</span>
                            <span className="font-black text-slate-900">({share}%)</span>
                          </div>
                        </div>

                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-sm">
                  {dict.workload_no_data}
                </div>
              )}
            </div>

            <div className="text-xs text-slate-400 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span>{isEn ? 'Total Actions' : 'סה"כ פעולות ניהול'}: {workloadMetrics.totalActions}</span>
              {workloadMetrics.topLeader && (
                <span>{isEn ? 'Lead' : 'מוביל/ה'}: <strong>{workloadMetrics.topLeader}</strong></span>
              )}
            </div>
          </div>

        </div>

        {/* The Noise Filter & Duplicate Ratio */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Filter size={18} className="text-purple-600" />
                  <span>{dict.noise_title}</span>
                </h2>
                <p className="text-xs text-slate-500">{dict.noise_sub}</p>
              </div>
              <span className="text-2xl font-black text-purple-600">
                {noiseMetrics.noiseRatio}%
              </span>
            </div>

            {/* Noise Breakdown Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden mb-5">
              <div 
                className="bg-amber-400" 
                style={{ width: `${noiseMetrics.total > 0 ? (noiseMetrics.duplicate / noiseMetrics.total) * 100 : 0}%` }} 
                title={`${dict.noise_duplicate}: ${noiseMetrics.duplicate}`}
              />
              <div 
                className="bg-purple-500" 
                style={{ width: `${noiseMetrics.total > 0 ? (noiseMetrics.outside / noiseMetrics.total) * 100 : 0}%` }} 
                title={`${dict.noise_outside}: ${noiseMetrics.outside}`}
              />
              <div 
                className="bg-slate-400" 
                style={{ width: `${noiseMetrics.total > 0 ? (noiseMetrics.irrelevant / noiseMetrics.total) * 100 : 0}%` }} 
                title={`${dict.noise_irrelevant}: ${noiseMetrics.irrelevant}`}
              />
              <div 
                className="bg-emerald-500" 
                style={{ width: `${noiseMetrics.total > 0 ? (noiseMetrics.fixed / noiseMetrics.total) * 100 : 0}%` }} 
                title={`${dict.noise_real}: ${noiseMetrics.fixed}`}
              />
            </div>

            {/* Legend / Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 border border-amber-100">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-600 truncate">{dict.noise_duplicate}:</span>
                <span className="font-extrabold ms-auto text-slate-900">{noiseMetrics.duplicate}</span>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50/50 border border-purple-100">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                <span className="text-slate-600 truncate">{dict.noise_outside}:</span>
                <span className="font-extrabold ms-auto text-slate-900">{noiseMetrics.outside}</span>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100/50 border border-slate-200">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                <span className="text-slate-600 truncate">{dict.noise_irrelevant}:</span>
                <span className="font-extrabold ms-auto text-slate-900">{noiseMetrics.irrelevant}</span>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-600 truncate">{dict.noise_real}:</span>
                <span className="font-extrabold ms-auto text-slate-900">{noiseMetrics.fixed}</span>
              </div>
            </div>
          </div>

          {/* Automated Advisory Banner if municipal scope > 15% */}
          {noiseMetrics.showAdvisory && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-start gap-2.5 text-xs text-purple-900">
              <Info size={16} className="text-purple-600 shrink-0 mt-0.5" />
              <span>{dict.noise_advisory}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: SPATIAL HOTSPOTS & VENDOR PERFORMANCE
      ───────────────────────────────────────────────────────────── */}
      <div className={`${activeTab === 'hotspots_vendors' ? 'block' : 'hidden'} print:block space-y-6`}>
        
        {/* Hotspots Density Ranking */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <MapPin size={18} className="text-red-500" />
                <span>{dict.hotspots_title}</span>
              </h2>
              <p className="text-xs text-slate-500">{dict.hotspots_sub}</p>
            </div>
          </div>

          {/* Active Banner Indicator if currently pinned */}
          {activeBanner?.active && (() => {
            const isExpired = activeBanner.expiresAt ? new Date(activeBanner.expiresAt) <= new Date() : false;
            const bType = activeBanner.type || 'warning';
            
            const getRemainingText = () => {
              if (isExpired) return isEn ? 'Expired' : 'פג תוקף';
              if (!activeBanner.expiresAt) return isEn ? 'Until cancelled' : 'עד לביטול ידני';
              const diffHours = Math.max(1, Math.round((new Date(activeBanner.expiresAt).getTime() - Date.now()) / (3600 * 1000)));
              if (diffHours > 24) {
                const diffDays = Math.round(diffHours / 24);
                return isEn ? `Expires in ${diffDays}d` : `תוקף: עוד ${diffDays} ימים`;
              }
              return isEn ? `Expires in ${diffHours}h` : `תוקף: עוד ${diffHours} שעות`;
            };

            const style = isExpired ? {
              bg: 'bg-slate-100/90 border-slate-300 text-slate-600',
              pin: 'text-slate-400',
              text: 'text-slate-700',
              btn: 'text-blue-700 hover:text-blue-900',
              label: isEn ? 'Expired Banner' : 'באנר שפג תוקפו'
            } : {
              warning: {
                bg: 'bg-amber-50 border-amber-200',
                pin: 'text-amber-600',
                text: 'text-amber-900',
                btn: 'text-amber-800 hover:text-amber-950',
                label: isEn ? 'Warning' : 'אזהרה'
              },
              maintenance: {
                bg: 'bg-blue-50 border-blue-200',
                pin: 'text-blue-600',
                text: 'text-blue-900',
                btn: 'text-blue-800 hover:text-blue-950',
                label: isEn ? 'In Progress' : 'בטיפול'
              },
              info: {
                bg: 'bg-emerald-50 border-emerald-200',
                pin: 'text-emerald-600',
                text: 'text-emerald-900',
                btn: 'text-emerald-800 hover:text-emerald-950',
                label: isEn ? 'Update' : 'עדכון'
              }
            }[bType];

            return (
              <div className={`mb-4 p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${style.bg}`}>
                <div className="flex items-center gap-2 truncate">
                  <Pin size={15} className={`${style.pin} shrink-0`} />
                  <span className={`font-bold truncate ${style.text}`}>
                    <span className="font-black mr-1">[{style.label}]</span>
                    {dict.hotspots_active_banner}: "{activeBanner.message}"
                  </span>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0 ${
                    isExpired ? 'bg-red-100 text-red-800' : 'bg-white/80 text-slate-600 border border-slate-200'
                  }`}>
                    {getRemainingText()}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setNoticeModalLocation(activeBanner.location || '');
                    setNoticeModalCategory(activeBanner.category || '');
                    setIsNoticeModalOpen(true);
                  }}
                  className={`font-extrabold underline shrink-0 cursor-pointer ${style.btn}`}
                >
                  {isExpired ? (isEn ? 'Renew / Edit' : 'חדש / ערוך') : dict.hotspots_edit_banner}
                </button>
              </div>
            );
          })()}

          {hotspotData.length > 0 ? (
            <div className="space-y-3">
              {hotspotData.map((spot, idx) => (
                <div 
                  key={spot.location} 
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-white border border-slate-200 text-xs font-black flex items-center justify-center text-slate-700 shrink-0 shadow-xs">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {spot.location}
                      </div>
                      {spot.topCategory && (
                        <span className="inline-block text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md mt-0.5">
                          {spot.topCategory}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => {
                        setNoticeModalLocation(spot.location);
                        setNoticeModalCategory(spot.topCategory || '');
                        setIsNoticeModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-800 transition-all flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer"
                      title={dict.hotspots_pin_banner}
                    >
                      <Pin size={12} className="text-amber-600" />
                      <span className="hidden sm:inline">{dict.hotspots_pin_banner}</span>
                    </button>

                    <div className="text-end">
                      <span className="text-base font-black text-slate-900">{spot.count}</span>
                      <span className="text-xs text-slate-500 ms-1">{dict.hotspots_reports}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              {dict.hotspots_clean}
            </div>
          )}
        </div>

        {/* Vendor & Contractor Performance Scorecard */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                <span>{dict.vendor_scorecard_title}</span>
              </h2>
              <p className="text-xs text-slate-500">{dict.vendor_scorecard_sub}</p>
            </div>
          </div>

          {vendorScorecard.length > 0 ? (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-start text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50/80 border-y border-slate-200 text-slate-500 font-bold uppercase">
                    <th className="py-3 px-6 text-start">{dict.vendor_col_name}</th>
                    <th className="py-3 px-4 text-start">{dict.vendor_col_specialty}</th>
                    <th className="py-3 px-4 text-center">{dict.vendor_col_dispatches}</th>
                    <th className="py-3 px-4 text-center">{dict.vendor_col_ack}</th>
                    <th className="py-3 px-4 text-center">{dict.vendor_col_fix}</th>
                    <th className="py-3 px-4 text-center">{dict.vendor_col_completion}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendorScorecard.map(v => {
                    const avgAckMin = v.ackRecordsCount > 0 ? Math.round(v.totalAckMinutes / v.ackRecordsCount) : null;
                    const avgFixMin = v.executionRecordsCount > 0 ? Math.round(v.totalExecutionMinutes / v.executionRecordsCount) : null;
                    const completionRate = v.dispatches > 0 ? Math.round((v.completedCount / v.dispatches) * 100) : 0;

                    return (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                        {/* Name & Phone */}
                        <td className="py-3 px-6 font-bold text-slate-900">
                          <div>{v.name}</div>
                          {v.phone && <div className="text-[11px] font-normal text-slate-400">{v.phone}</div>}
                        </td>

                        {/* Specialty */}
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {v.profession || dict.vendor_na}
                        </td>

                        {/* Dispatches */}
                        <td className="py-3 px-4 text-center font-black text-slate-900">
                          {v.dispatches}
                        </td>

                        {/* Avg Ack Time */}
                        <td className="py-3 px-4 text-center font-bold text-slate-700">
                          {avgAckMin !== null 
                            ? (avgAckMin < 60 ? `${avgAckMin} ${isEn ? 'min' : 'דק\''}` : `${(avgAckMin / 60).toFixed(1)} ${isEn ? 'hrs' : 'שעות'}`)
                            : dict.vendor_na}
                        </td>

                        {/* Avg Fix Time */}
                        <td className="py-3 px-4 text-center font-bold text-slate-700">
                          {avgFixMin !== null 
                            ? (avgFixMin < 60 ? `${avgFixMin} ${isEn ? 'min' : 'דק\''}` : `${(avgFixMin / 60).toFixed(1)} ${isEn ? 'hrs' : 'שעות'}`)
                            : dict.vendor_na}
                        </td>

                        {/* Completion Rate */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-extrabold ${
                            completionRate >= 80 ? 'bg-emerald-100 text-emerald-800' :
                            completionRate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {completionRate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-slate-400 text-sm">
              {dict.vendor_no_data}
            </div>
          )}
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: SMART INSIGHTS & RESIDENT SERVICE OPTIMIZATION
      ───────────────────────────────────────────────────────────── */}
      <div className={`${activeTab === 'insights' ? 'block' : 'hidden'} print:block space-y-6`}>
        <div className="bg-gradient-to-br from-amber-50/60 via-white to-blue-50/40 border border-amber-200/80 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-md shadow-amber-500/20">
                <Lightbulb size={24} />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
                  <span>{dict.insights_title}</span>
                </h2>
                <p className="text-xs md:text-sm text-slate-600 font-medium">
                  {dict.insights_sub}
                </p>
              </div>
            </div>
          </div>

          {/* Insights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {insightsList.map(item => (
              <div 
                key={item.id}
                className={`p-5 rounded-2xl border transition-all shadow-2xs flex flex-col justify-between ${
                  item.type === 'warning'
                    ? 'bg-white border-amber-300/80 hover:border-amber-400 hover:shadow-md'
                    : item.type === 'tip'
                    ? 'bg-white border-blue-200 hover:border-blue-300 hover:shadow-md'
                    : 'bg-white border-emerald-200 hover:border-emerald-300 hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-md ${
                      item.type === 'warning'
                        ? 'bg-amber-100 text-amber-900'
                        : item.type === 'tip'
                        ? 'bg-blue-100 text-blue-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}>
                      {item.type === 'warning' 
                        ? (isEn ? '⚠️ Attention' : '⚠️ שים לב') 
                        : item.type === 'tip' 
                        ? (isEn ? '💡 Pro Tip' : '💡 טיפ לשיפור') 
                        : (isEn ? '⭐ Strength' : '⭐ נקודת חוזק')}
                    </span>
                  </div>

                  <h3 className="font-black text-sm text-slate-900 mb-1.5 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs font-semibold text-slate-800 leading-relaxed mb-3">
                    <span className="text-blue-700 font-bold block mb-0.5">{isEn ? 'Actionable Recommendation:' : 'המלצה לפעולה:'}</span>
                    {item.recommendation}
                  </div>

                  {item.actionType === 'pin_notice' && (
                    <button
                      onClick={() => {
                        setNoticeModalLocation(item.actionPayload?.location || '');
                        setNoticeModalCategory(item.actionPayload?.category || '');
                        setIsNoticeModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-all cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <Pin size={13} className="text-amber-700" />
                      <span>{dict.hotspots_pin_banner}</span>
                    </button>
                  )}

                  {item.actionType === 'filter_ticket' && (
                    <button
                      onClick={() => navigate(`/admin/${tenantId}/dashboard?ticket=${item.actionPayload?.ticketId}`)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <span>{isEn ? 'View High-Demand Ticket' : 'צפה בפנייה המבוקשת'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notice Banner Modal */}
      <HotspotNoticeModal
        isOpen={isNoticeModalOpen}
        onClose={() => setIsNoticeModalOpen(false)}
        tenantId={tenantId || ''}
        buildingName={outletCtx?.tenantConfig?.name || ''}
        initialLocation={noticeModalLocation}
        initialCategory={noticeModalCategory}
        currentBanner={activeBanner}
        onBannerUpdated={(b) => setActiveBanner(b)}
        isEn={isEn}
      />

    </div>
  );
}
