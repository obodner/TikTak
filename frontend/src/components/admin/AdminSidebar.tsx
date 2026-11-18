import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import {
  LayoutDashboard,
  ListTodo,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
  Building2,
  Bell,
  Headphones,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Boxes,
  Users2,
  Sliders,
  BarChart3,
  FileSpreadsheet,
  FilePlus,
  Receipt
} from 'lucide-react';
import { NotificationsModal } from './NotificationsModal';
import { ContactModal } from './ContactModal';
import { NotificationItem } from '../../utils/notificationsEngine';

export interface AdminSidebarProps {
  tenantId: string;
  tenantName?: string;
  tenantLogoUrl?: string;
  currentPage: 'dashboard' | 'backlog' | 'settings' | 'fleet' | 'analytics' | 'quotes';
  myTenants?: { id: string; name?: string }[];
  isFleet?: boolean;
  isSuper?: boolean;
  isEn?: boolean;
  onOpenHelp?: () => void;
  dashboardCount?: number;
  backlogCount?: number;
  notifications?: NotificationItem[];
  unreadNotificationsCount?: number;
  onToggleRead?: (notificationId: string) => void;
  onMarkAllRead?: () => void;
  onSelectTicket?: (ticketId: string) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  tenantId,
  tenantName,
  tenantLogoUrl,
  currentPage,
  myTenants = [],
  isFleet = false,
  isSuper = false,
  isEn = false,
  onOpenHelp,
  dashboardCount,
  backlogCount,
  notifications = [],
  unreadNotificationsCount = 0,
  onToggleRead,
  onMarkAllRead,
  onSelectTicket
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Persistent collapsed state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tiktak_admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Settings submenu states
  const [isAccordionOpen, setIsAccordionOpen] = useState<boolean>(currentPage === 'settings');
  const [isFlyoutOpen, setIsFlyoutOpen] = useState<boolean>(false);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Quotes submenu states
  const isQuotesActive = currentPage === 'quotes' || location.pathname.includes('/quotes');
  const [isQuotesAccordionOpen, setIsQuotesAccordionOpen] = useState<boolean>(isQuotesActive);
  const [isQuotesFlyoutOpen, setIsQuotesFlyoutOpen] = useState<boolean>(false);
  const quotesFlyoutRef = useRef<HTMLDivElement>(null);

  // Modals
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  useEffect(() => {
    setLogoError(false);
  }, [tenantLogoUrl]);

  const showTenantLogo = Boolean(tenantLogoUrl && !logoError);

  // Sync accordion if user navigates to settings or quotes
  useEffect(() => {
    if (currentPage === 'settings') {
      setIsAccordionOpen(true);
    }
  }, [currentPage]);

  useEffect(() => {
    if (isQuotesActive) {
      setIsQuotesAccordionOpen(true);
    }
  }, [isQuotesActive]);

  // Click outside listener for collapsed mode flyout
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setIsFlyoutOpen(false);
      }
      if (quotesFlyoutRef.current && !quotesFlyoutRef.current.contains(e.target as Node)) {
        setIsQuotesFlyoutOpen(false);
      }
    };
    if (isFlyoutOpen || isQuotesFlyoutOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFlyoutOpen, isQuotesFlyoutOpen]);

  const handleToggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('tiktak_admin_sidebar_collapsed', String(next));
      } catch (err) {
        console.error('Failed saving sidebar preference:', err);
      }
      return next;
    });
    // Close flyouts when expanding/collapsing
    setIsFlyoutOpen(false);
    setIsQuotesFlyoutOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleTenantChange = (newTenantId: string) => {
    navigate(`/admin/${newTenantId}/${currentPage}`);
  };

  // Determine active tab from URL query params if in settings
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'infrastructure';

  const quotesSubItems = [
    {
      id: 'new',
      label: isEn ? 'New Quote Request' : 'בקשת הצעה חדשה',
      path: `/admin/${tenantId}/quotes/new`,
      icon: FilePlus,
      isActive: location.pathname.includes('/quotes/new')
    },
    {
      id: 'active',
      label: isEn ? 'Received Quotes & Tracking' : 'הצעות מחיר שהתקבלו',
      path: `/admin/${tenantId}/quotes/active`,
      icon: FileSpreadsheet,
      isActive: location.pathname.includes('/quotes/active') || location.pathname.endsWith('/quotes')
    }
  ];

  const settingsSubItems = [
    {
      id: 'infrastructure',
      label: isEn ? 'Infrastructure & Resources' : 'משאבי מבנה ותשתית',
      path: `/admin/${tenantId}/settings?tab=infrastructure`,
      icon: Boxes,
      isActive: currentPage === 'settings' && currentTab === 'infrastructure'
    },
    {
      id: 'users',
      label: isEn ? 'Admins & Vendors' : 'ניהול מנהלים וספקים',
      path: `/admin/${tenantId}/settings?tab=users`,
      icon: Users2,
      isActive: currentPage === 'settings' && currentTab === 'users'
    },
    {
      id: 'general',
      label: isEn ? 'General Settings' : 'הגדרות כלליות',
      path: `/admin/${tenantId}/settings?tab=general`,
      icon: Sliders,
      isActive: currentPage === 'settings' && currentTab === 'general'
    }
  ];

  // Icons for collapse/expand depending on language
  const CollapseIcon = isEn ? PanelLeftClose : PanelRightClose;
  const ExpandIcon = isEn ? PanelLeftOpen : PanelRightOpen;

  return (
    <>
      <aside
        className={`hidden md:flex flex-col bg-slate-900 text-white h-screen sticky top-0 z-40 transition-all duration-300 ease-in-out shrink-0 select-none ${isCollapsed ? 'w-20' : 'w-64'
          } ${isEn ? 'border-r border-slate-800' : 'border-l border-slate-800'}`}
        dir={isEn ? 'ltr' : 'rtl'}
        data-testid="admin-sidebar"
        data-collapsed={isCollapsed}
      >
        {/* Header Section: Customer-First Branding */}
        <div className="p-3 border-b border-slate-800 flex flex-col justify-center">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2.5">
              <Link
                to={`/admin/${tenantId}/dashboard`}
                className={`w-11 h-11 rounded-xl p-1.5 flex items-center justify-center overflow-hidden shadow-sm border transition-transform hover:scale-105 ${
                  showTenantLogo
                    ? 'bg-white border-slate-700/80'
                    : 'bg-slate-800 border-slate-700/80 text-white'
                }`}
                title={tenantName || tenantId}
                data-testid="sidebar-tenant-avatar-collapsed"
              >
                {showTenantLogo ? (
                  <img
                    src={tenantLogoUrl}
                    alt={tenantName || 'Customer Logo'}
                    onError={() => setLogoError(true)}
                    className="max-h-full max-w-full w-auto h-auto object-contain"
                  />
                ) : (
                  <span className="text-base font-extrabold text-white">
                    {(tenantName || tenantId || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>
              <button
                onClick={handleToggleCollapse}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title={isEn ? "Expand menu" : "הרחב תפריט"}
                aria-label={isEn ? "Expand menu" : "הרחב תפריט"}
                data-testid="sidebar-toggle-expand"
              >
                <ExpandIcon size={18} />
              </button>
            </div>
          ) : (
            <div
              className="relative w-full bg-slate-800/70 text-white rounded-xl p-3 shadow-sm border border-slate-700/80 flex flex-col items-center text-center gap-2.5"
              data-testid="sidebar-tenant-card"
            >
              {/* Collapse button pinned to top-end corner so logo & name stay centered */}
              <button
                onClick={handleToggleCollapse}
                className={`absolute top-2 ${isEn ? 'right-2' : 'left-2'} p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/70 rounded-lg transition-colors z-10`}
                title={isEn ? "Collapse menu" : "כווץ תפריט"}
                aria-label={isEn ? "Collapse menu" : "כווץ תפריט"}
                data-testid="sidebar-toggle-collapse"
              >
                <CollapseIcon size={17} />
              </button>

              {showTenantLogo && (
                <Link
                  to={`/admin/${tenantId}/dashboard`}
                  className="inline-flex items-center justify-center bg-white rounded-xl px-3 py-2 shadow-sm border border-slate-700/50 max-w-[172px] overflow-hidden hover:opacity-95 transition-opacity"
                  title={tenantName || tenantId}
                >
                  <img
                    src={tenantLogoUrl}
                    alt={tenantName || 'Customer Logo'}
                    onError={() => setLogoError(true)}
                    className="h-14 max-w-full w-auto object-contain"
                    data-testid="sidebar-tenant-logo"
                  />
                </Link>
              )}

              {/* Customer / Building Name or Switcher */}
              {myTenants.length > 1 ? (
                <div className={`relative w-full ${!showTenantLogo ? (isEn ? 'pr-8' : 'pl-8') : ''}`}>
                  <select
                    value={tenantId}
                    onChange={(e) => handleTenantChange(e.target.value)}
                    className="w-full bg-slate-900/70 text-white text-xs font-bold py-1.5 px-2.5 rounded-lg border border-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer hover:bg-slate-900 transition-colors truncate text-center"
                    style={{ paddingInlineEnd: '1.75rem' }}
                    dir={isEn ? "ltr" : "rtl"}
                  >
                    {myTenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.id}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className={`absolute top-1/2 -translate-y-1/2 ${isEn ? 'right-2' : 'left-2'} text-slate-400 pointer-events-none`}
                    size={14}
                  />
                </div>
              ) : (
                <Link
                  to={`/admin/${tenantId}/dashboard`}
                  className={`text-base font-extrabold text-white tracking-tight truncate leading-tight w-full text-center ${!showTenantLogo ? 'px-7 py-0.5' : ''}`}
                  title={tenantName || tenantId}
                >
                  {tenantName || tenantId}
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Navigation Items (Scrollable Middle Section) */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Dashboard */}
          <Link
            to={`/admin/${tenantId}/dashboard`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group relative ${currentPage === 'dashboard'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              } ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? (isEn ? 'Dashboard' : 'דשבורד') : undefined}
          >
            <LayoutDashboard size={20} className="shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 truncate">{isEn ? 'Dashboard' : 'דשבורד'}</span>
            )}
            {typeof dashboardCount === 'number' && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-extrabold transition-colors ${currentPage === 'dashboard'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800 text-slate-300 border border-slate-700/80'
                  } ${isCollapsed ? 'absolute -top-1 -end-1 px-1.5 py-0 text-[10px]' : ''}`}
              >
                {dashboardCount}
              </span>
            )}
          </Link>

          {/* Tasks Backlog */}
          <Link
            to={`/admin/${tenantId}/backlog`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group relative ${currentPage === 'backlog'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              } ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? (isEn ? 'Tasks Backlog' : 'מצבור משימות') : undefined}
          >
            <ListTodo size={20} className="shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 truncate">{isEn ? 'Tasks Backlog' : 'מצבור משימות'}</span>
            )}
            {typeof backlogCount === 'number' && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-extrabold transition-colors ${currentPage === 'backlog'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800 text-slate-300 border border-slate-700/80'
                  } ${isCollapsed ? 'absolute -top-1 -end-1 px-1.5 py-0 text-[10px]' : ''}`}
              >
                {backlogCount}
              </span>
            )}
          </Link>

          {/* Analytics & BI */}
          <Link
            to={`/admin/${tenantId}/analytics`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group relative ${currentPage === 'analytics'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              } ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? (isEn ? 'Analytics & BI' : 'סטטיסטיקה ודוחות') : undefined}
          >
            <BarChart3 size={20} className="shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 truncate">{isEn ? 'Analytics & BI' : 'סטטיסטיקה ודוחות'}</span>
            )}
          </Link>

          {/* Work Quotes (RFQ) Section (Accordion in Expanded / Flyout in Collapsed) */}
          <div className="relative">
            {isCollapsed ? (
              // Collapsed Mode Quotes Button (Triggers Flyout)
              <div>
                <button
                  type="button"
                  onClick={() => setIsQuotesFlyoutOpen(prev => !prev)}
                  className={`w-full flex items-center justify-center p-2.5 rounded-xl text-sm font-bold transition-all group ${isQuotesActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  title={isEn ? 'Work Quotes (RFQ)' : 'הצעות מחיר (RFQ)'}
                  aria-expanded={isQuotesFlyoutOpen}
                  data-testid="sidebar-quotes-flyout-trigger"
                >
                  <Receipt size={20} className="shrink-0" />
                </button>

                {/* Floating Flyout Popover */}
                {isQuotesFlyoutOpen && (
                  <div
                    ref={quotesFlyoutRef}
                    className={`fixed z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl py-2 px-1.5 w-60 animate-in fade-in zoom-in-95 duration-150 ${isEn ? 'left-22' : 'right-22'
                      }`}
                    style={{ top: '140px' }}
                    dir={isEn ? 'ltr' : 'rtl'}
                    data-testid="quotes-flyout-popover"
                  >
                    <div className="px-3 py-1.5 border-b border-slate-800 mb-1">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                        {isEn ? 'Work Quotes (RFQ)' : 'הצעות מחיר מספקים (RFQ)'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {quotesSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <Link
                            key={sub.id}
                            to={sub.path}
                            onClick={() => setIsQuotesFlyoutOpen(false)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${sub.isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800'
                              }`}
                          >
                            <SubIcon size={16} className="shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Expanded Mode Quotes Accordion
              <div>
                <button
                  type="button"
                  onClick={() => setIsQuotesAccordionOpen(prev => !prev)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group ${isQuotesActive
                      ? 'bg-slate-800/80 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  data-testid="sidebar-quotes-accordion-trigger"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Receipt
                      size={20}
                      className={`shrink-0 transition-transform duration-300 ease-out ${isQuotesAccordionOpen ? 'text-blue-400 scale-105' : 'group-hover:scale-105'
                        }`}
                    />
                    <span className="truncate">{isEn ? 'Work Quotes (RFQ)' : 'הצעות מחיר (RFQ)'}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-300 ease-out text-slate-400 group-hover:text-white ${isQuotesAccordionOpen ? 'transform rotate-180' : ''
                      }`}
                  />
                </button>

                {/* Rolling Sub-items list with identical smooth CSS Grid slide effect */}
                <div
                  className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-in-out ${isQuotesAccordionOpen
                      ? 'grid-rows-[1fr] opacity-100 mt-1'
                      : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
                    }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-1 ps-4 border-s border-slate-800 ms-5 me-1 py-1">
                      {quotesSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <Link
                            key={sub.id}
                            to={sub.path}
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${sub.isActive
                                ? 'bg-blue-600 text-white font-bold shadow-sm'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                              }`}
                          >
                            <SubIcon size={14} className="shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Settings Section (Accordion in Expanded / Flyout in Collapsed) */}
          <div className="relative">
            {isCollapsed ? (
              // Collapsed Mode Settings Button (Triggers Flyout)
              <div>
                <button
                  type="button"
                  onClick={() => setIsFlyoutOpen(prev => !prev)}
                  className={`w-full flex items-center justify-center p-2.5 rounded-xl text-sm font-bold transition-all group ${currentPage === 'settings'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  title={isEn ? 'Settings' : 'הגדרות'}
                  aria-expanded={isFlyoutOpen}
                  data-testid="sidebar-settings-flyout-trigger"
                >
                  <Settings size={20} className="shrink-0" />
                </button>

                {/* Floating Flyout Popover */}
                {isFlyoutOpen && (
                  <div
                    ref={flyoutRef}
                    className={`fixed z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl py-2 px-1.5 w-60 animate-in fade-in zoom-in-95 duration-150 ${isEn ? 'left-22' : 'right-22'
                      }`}
                    style={{
                      top: '180px'
                    }}
                    dir={isEn ? 'ltr' : 'rtl'}
                    data-testid="settings-flyout-popover"
                  >
                    <div className="px-3 py-1.5 border-b border-slate-800 mb-1">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                        {isEn ? 'Settings Tabs' : 'לשוניות הגדרות'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {settingsSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <Link
                            key={sub.id}
                            to={sub.path}
                            onClick={() => setIsFlyoutOpen(false)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${sub.isActive
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800'
                              }`}
                          >
                            <SubIcon size={16} className="shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Expanded Mode Settings Accordion
              <div>
                <button
                  type="button"
                  onClick={() => setIsAccordionOpen(prev => !prev)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group ${currentPage === 'settings'
                      ? 'bg-slate-800/80 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  data-testid="sidebar-settings-accordion-trigger"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Settings
                      size={20}
                      className={`shrink-0 transition-transform duration-300 ease-out ${isAccordionOpen ? 'rotate-90 text-blue-400' : 'group-hover:rotate-45'
                        }`}
                    />
                    <span className="truncate">{isEn ? 'Settings' : 'הגדרות'}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-300 ease-out text-slate-400 group-hover:text-white ${isAccordionOpen ? 'transform rotate-180' : ''
                      }`}
                  />
                </button>

                {/* Rolling Sub-items list */}
                <div
                  className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-in-out ${isAccordionOpen
                      ? 'grid-rows-[1fr] opacity-100 mt-1'
                      : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
                    }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-1 ps-4 border-s border-slate-800 ms-5 me-1 py-1">
                      {settingsSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        return (
                          <Link
                            key={sub.id}
                            to={sub.path}
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${sub.isActive
                                ? 'bg-blue-600 text-white font-bold shadow-sm'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                              }`}
                          >
                            <SubIcon size={14} className="shrink-0" />
                            <span className="truncate">{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conditional: Fleet Overlook */}
          {isFleet && (
            <Link
              to={`/admin/${tenantId}/fleet`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group ${currentPage === 'fleet'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? (isEn ? 'Fleet Overlook' : 'דשבורד צי') : undefined}
            >
              <Building2 size={20} className="shrink-0" />
              {!isCollapsed && (
                <span className="flex-1 truncate">{isEn ? 'Fleet Overlook' : 'דשבורד צי'}</span>
              )}
            </Link>
          )}

          {/* Divider */}
          <div className="py-2">
            <div className="border-t border-slate-800/80" />
          </div>

          {/* New Item: Notifications (Monochrome) */}
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all relative ${isCollapsed ? 'justify-center' : ''
              }`}
            title={isCollapsed ? (isEn ? 'Notifications' : 'התראות') : undefined}
            data-testid="sidebar-notifications-btn"
          >
            <div className="relative flex items-center justify-center">
              <Bell size={20} className="shrink-0" />
              {isCollapsed && unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white ring-2 ring-slate-900 animate-pulse">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <>
                <span className="flex-1 text-start truncate">{isEn ? 'Notifications' : 'התראות'}</span>
                {unreadNotificationsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-xs font-bold text-white">
                    {unreadNotificationsCount}
                  </span>
                )}
              </>
            )}
          </button>

          {/* New Item: Contact Us (Monochrome black & white) */}
          <button
            type="button"
            onClick={() => setIsContactOpen(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all ${isCollapsed ? 'justify-center' : ''
              }`}
            title={isCollapsed ? (isEn ? 'Contact & Support' : 'צור קשר') : undefined}
            data-testid="sidebar-contact-btn"
          >
            <Headphones size={20} className="shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 text-start truncate">{isEn ? 'Contact Support' : 'צור קשר'}</span>
            )}
          </button>

          {/* New Item: Help & Guide */}
          {onOpenHelp && (
            <button
              type="button"
              onClick={onOpenHelp}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all ${isCollapsed ? 'justify-center' : ''
                }`}
              title={isCollapsed ? (isEn ? 'Help & Guide' : 'עזרה ומדריך') : undefined}
              data-testid="sidebar-help-btn"
            >
              <HelpCircle size={20} className="shrink-0" />
              {!isCollapsed && (
                <span className="flex-1 text-start truncate">{isEn ? 'Help & Guide' : 'עזרה ומדריך'}</span>
              )}
            </button>
          )}

          {/* Conditional: God View - Positioned at the bottom of the items list with distinctive amber styling */}
          {isSuper && (
            <div className="pt-2">
              <Link
                to="/admin/god-view"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black transition-all group border ${location.pathname === '/admin/god-view'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/50'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? (isEn ? 'God Mode' : 'מצב אל') : undefined}
                data-testid="sidebar-god-mode-btn"
              >
                <Shield size={20} className="shrink-0 text-amber-400 group-hover:text-amber-300 transition-colors" />
                {!isCollapsed && (
                  <span className="flex-1 truncate tracking-wide text-amber-400 group-hover:text-amber-300 font-extrabold">
                    {isEn ? 'God Mode' : 'מצב אל'}
                  </span>
                )}
              </Link>
            </div>
          )}
        </nav>

        {/* Footer Section (Pinned Bottom) */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2.5">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20 ${isCollapsed ? 'justify-center px-2' : ''
              }`}
            title={isEn ? "Logout" : "התנתק"}
            data-testid="sidebar-logout-btn"
          >
            <LogOut size={18} className="shrink-0" />
            {!isCollapsed && (
              <span className="truncate">{isEn ? 'Logout' : 'התנתק'}</span>
            )}
          </button>

          {/* Subtle Powered by TikTak Credit */}
          <div
            className="pt-2 border-t border-slate-800/70 flex items-center justify-center gap-2 opacity-90 hover:opacity-100 transition-opacity"
            dir="ltr"
            title="Powered by: TikTak"
            data-testid="sidebar-powered-by"
          >
            {!isCollapsed && (
              <span className="text-[11px] font-medium text-slate-400 tracking-wide shrink-0">
                Powered by:
              </span>
            )}
            <img
              src="/logo_transparent.png"
              alt="TikTak"
              className={`${isCollapsed ? 'h-9' : 'h-10'} w-auto object-contain drop-shadow`}
            />
          </div>
        </div>
      </aside>

      {/* Modals */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        tenantId={tenantId}
        isEn={isEn}
        notifications={notifications}
        backlogCount={backlogCount}
        onToggleRead={onToggleRead || (() => { })}
        onMarkAllRead={onMarkAllRead || (() => { })}
        onSelectTicket={onSelectTicket}
      />

      <ContactModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        tenantName={tenantName}
        tenantId={tenantId}
        isEn={isEn}
      />
    </>
  );
};
