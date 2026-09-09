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
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Boxes,
  Users2,
  Sliders
} from 'lucide-react';
import { NotificationsModal } from './NotificationsModal';
import { ContactModal } from './ContactModal';

export interface AdminSidebarProps {
  tenantId: string;
  tenantName?: string;
  currentPage: 'dashboard' | 'backlog' | 'settings' | 'fleet';
  myTenants?: { id: string; name?: string }[];
  isFleet?: boolean;
  isSuper?: boolean;
  isEn?: boolean;
  dashboardCount?: number;
  backlogCount?: number;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  tenantId,
  tenantName,
  currentPage,
  myTenants = [],
  isFleet = false,
  isSuper = false,
  isEn = false,
  dashboardCount,
  backlogCount
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

  // Modals
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);

  // Sync accordion if user navigates to settings
  useEffect(() => {
    if (currentPage === 'settings') {
      setIsAccordionOpen(true);
    }
  }, [currentPage]);

  // Click outside listener for collapsed mode flyout
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setIsFlyoutOpen(false);
      }
    };
    if (isFlyoutOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFlyoutOpen]);

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
    // Close flyout when expanding
    setIsFlyoutOpen(false);
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
        className={`hidden md:flex flex-col bg-slate-900 text-white h-screen sticky top-0 z-40 transition-all duration-300 ease-in-out shrink-0 select-none ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${isEn ? 'border-r border-slate-800' : 'border-l border-slate-800'}`}
        dir={isEn ? 'ltr' : 'rtl'}
        data-testid="admin-sidebar"
        data-collapsed={isCollapsed}
      >
        {/* Header Section */}
        <div className="p-3.5 border-b border-slate-800 flex flex-col justify-center min-h-[82px]">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2.5">
              <Link 
                to={`/admin/${tenantId}/dashboard`}
                className="flex items-center justify-center p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="TikTak"
              >
                <img
                  src="/logo_transparent.png"
                  alt="TikTak"
                  className="h-9 w-auto object-contain drop-shadow"
                />
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
            <div className="flex flex-col gap-2.5">
              {/* Top Row: Larger TikTak Logo & Collapse Button */}
              <div className="flex items-center justify-between">
                <Link 
                  to={`/admin/${tenantId}/dashboard`}
                  className="shrink-0 transition-transform hover:scale-105 flex items-center"
                >
                  <img
                    src="/logo_transparent.png"
                    alt="TikTak"
                    className="h-11 w-auto object-contain drop-shadow"
                  />
                </Link>

                {/* Collapse button inside header */}
                <button
                  onClick={handleToggleCollapse}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                  title={isEn ? "Collapse menu" : "כווץ תפריט"}
                  aria-label={isEn ? "Collapse menu" : "כווץ תפריט"}
                  data-testid="sidebar-toggle-collapse"
                >
                  <CollapseIcon size={18} />
                </button>
              </div>

              {/* Bottom Row: Customer / Building Name underneath logo */}
              {myTenants.length > 1 ? (
                <div className="relative w-full">
                  <select
                    value={tenantId}
                    onChange={(e) => handleTenantChange(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-slate-700/80 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer hover:bg-slate-750 transition-colors truncate"
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
                <div 
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-750 text-slate-300 min-w-0"
                  title={tenantName || tenantId}
                >
                  <Building2 size={13} className="text-slate-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-200 truncate">
                    {tenantName || tenantId}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Items (Scrollable Middle Section) */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Dashboard */}
          <Link
            to={`/admin/${tenantId}/dashboard`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group relative ${
              currentPage === 'dashboard'
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
                className={`px-2 py-0.5 rounded-full text-xs font-extrabold transition-colors ${
                  currentPage === 'dashboard'
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group relative ${
              currentPage === 'backlog'
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
                className={`px-2 py-0.5 rounded-full text-xs font-extrabold transition-colors ${
                  currentPage === 'backlog'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800 text-slate-300 border border-slate-700/80'
                } ${isCollapsed ? 'absolute -top-1 -end-1 px-1.5 py-0 text-[10px]' : ''}`}
              >
                {backlogCount}
              </span>
            )}
          </Link>

          {/* Settings Section (Accordion in Expanded / Flyout in Collapsed) */}
          <div className="relative">
            {isCollapsed ? (
              // Collapsed Mode Settings Button (Triggers Flyout)
              <div>
                <button
                  type="button"
                  onClick={() => setIsFlyoutOpen(prev => !prev)}
                  className={`w-full flex items-center justify-center p-2.5 rounded-xl text-sm font-bold transition-all group ${
                    currentPage === 'settings'
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
                    className={`fixed z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl py-2 px-1.5 w-60 animate-in fade-in zoom-in-95 duration-150 ${
                      isEn ? 'left-22' : 'right-22'
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
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                              sub.isActive
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
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group ${
                    currentPage === 'settings'
                      ? 'bg-slate-800/80 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                  data-testid="sidebar-settings-accordion-trigger"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Settings 
                      size={20} 
                      className={`shrink-0 transition-transform duration-300 ease-out ${
                        isAccordionOpen ? 'rotate-90 text-blue-400' : 'group-hover:rotate-45'
                      }`} 
                    />
                    <span className="truncate">{isEn ? 'Settings' : 'הגדרות'}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-300 ease-out text-slate-400 group-hover:text-white ${
                      isAccordionOpen ? 'transform rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Rolling Sub-items list */}
                <div
                  className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-in-out ${
                    isAccordionOpen
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
                            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                              sub.isActive
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group ${
                currentPage === 'fleet'
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

          {/* Conditional: God View */}
          {isSuper && (
            <Link
              to="/admin/god-view"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all group ${
                location.pathname === '/admin/god-view'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? (isEn ? 'God Mode' : 'מצב אל') : undefined}
            >
              <Shield size={20} className="shrink-0" />
              {!isCollapsed && (
                <span className="flex-1 truncate">{isEn ? 'God Mode' : 'מצב אל'}</span>
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
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title={isCollapsed ? (isEn ? 'Notifications' : 'התראות') : undefined}
            data-testid="sidebar-notifications-btn"
          >
            <Bell size={20} className="shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 text-start truncate">{isEn ? 'Notifications' : 'התראות'}</span>
            )}
          </button>

          {/* New Item: Contact Us (Monochrome black & white) */}
          <button
            type="button"
            onClick={() => setIsContactOpen(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title={isCollapsed ? (isEn ? 'Contact & Support' : 'צור קשר') : undefined}
            data-testid="sidebar-contact-btn"
          >
            <Headphones size={20} className="shrink-0" />
            {!isCollapsed && (
              <span className="flex-1 text-start truncate">{isEn ? 'Contact Support' : 'צור קשר'}</span>
            )}
          </button>
        </nav>

        {/* Footer Section (Pinned Bottom) */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20 ${
              isCollapsed ? 'justify-center px-2' : ''
            }`}
            title={isEn ? "Logout" : "התנתק"}
            data-testid="sidebar-logout-btn"
          >
            <LogOut size={18} className="shrink-0" />
            {!isCollapsed && (
              <span className="truncate">{isEn ? 'Logout' : 'התנתק'}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Modals */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        isEn={isEn}
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
