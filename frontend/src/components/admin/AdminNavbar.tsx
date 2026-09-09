import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { 
  LayoutDashboard, 
  ListTodo, 
  Settings, 
  Shield, 
  LogOut, 
  HelpCircle, 
  Menu, 
  X, 
  ChevronDown,
  Building2,
  Bell,
  Headphones,
  Boxes,
  Users2,
  Sliders
} from 'lucide-react';
import { NotificationsModal } from './NotificationsModal';
import { ContactModal } from './ContactModal';

interface AdminNavbarProps {
  tenantId: string;
  tenantName?: string;
  currentPage: 'dashboard' | 'backlog' | 'settings' | 'fleet';
  myTenants?: { id: string; name?: string }[];
  isFleet?: boolean;
  isSuper?: boolean;
  isEn?: boolean;
  onOpenHelp?: () => void;
  dashboardCount?: number;
  backlogCount?: number;
}

export function AdminNavbar({
  tenantId,
  tenantName,
  currentPage,
  myTenants = [],
  isFleet = false,
  isSuper = false,
  isEn = false,
  onOpenHelp,
  dashboardCount,
  backlogCount
}: AdminNavbarProps) {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isSettingsAccordionOpen, setIsSettingsAccordionOpen] = useState(currentPage === 'settings');

  const settingsSubItems = [
    {
      id: 'infrastructure',
      label: isEn ? 'Infrastructure & Resources' : 'משאבי מבנה ותשתית',
      path: `/admin/${tenantId}/settings?tab=infrastructure`,
      icon: Boxes,
    },
    {
      id: 'users',
      label: isEn ? 'Admins & Vendors' : 'ניהול מנהלים וספקים',
      path: `/admin/${tenantId}/settings?tab=users`,
      icon: Users2,
    },
    {
      id: 'general',
      label: isEn ? 'General Settings' : 'הגדרות כלליות',
      path: `/admin/${tenantId}/settings?tab=general`,
      icon: Sliders,
    }
  ];

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

  const navItems: {
    id: 'dashboard' | 'backlog' | 'settings' | 'fleet';
    label: string;
    path: string;
    icon: typeof LayoutDashboard;
    count?: number;
  }[] = [
    {
      id: 'dashboard',
      label: isEn ? 'Dashboard' : 'דשבורד',
      path: `/admin/${tenantId}/dashboard`,
      icon: LayoutDashboard,
      count: dashboardCount,
    },
    {
      id: 'backlog',
      label: isEn ? 'Tasks Backlog' : 'מצבור משימות',
      path: `/admin/${tenantId}/backlog`,
      icon: ListTodo,
      count: backlogCount,
    },
    {
      id: 'settings',
      label: isEn ? 'Settings' : 'הגדרות',
      path: `/admin/${tenantId}/settings`,
      icon: Settings,
    },
  ];

  if (isFleet) {
    navItems.push({
      id: 'fleet',
      label: isEn ? 'Fleet Overlook' : 'דשבורד צי',
      path: `/admin/${tenantId}/fleet`,
      icon: Building2,
    });
  }

  return (
    <>
      <header className="md:hidden bg-slate-900 text-white p-3 sticky top-0 z-50 shadow-md border-b border-slate-800" dir={isEn ? 'ltr' : 'rtl'}>
        <div className="max-w-7xl mx-auto flex justify-between items-center px-2">
          {/* Right/Start Section: Logo & Building Switcher */}
          <div className="flex items-center gap-2 md:gap-4">
            <Link 
              to={`/admin/${tenantId}/dashboard`}
              className="flex items-center justify-center transition-transform hover:scale-105 shrink-0"
            >
              <img
                src="/logo_transparent.png"
                alt="TikTak"
                className="h-10 md:h-16 w-auto object-contain filter drop-shadow-[0_0_1px_rgba(255,255,255,0.5)]"
              />
            </Link>

            <span className="text-slate-700 font-light text-xl md:text-2xl hidden sm:inline">|</span>

            {/* Tenant Selector or Name */}
            {myTenants.length > 1 ? (
              <div className="relative">
                <select
                  value={tenantId}
                  onChange={(e) => handleTenantChange(e.target.value)}
                  className="bg-slate-800 text-slate-200 text-xs md:text-base font-semibold py-1.5 pl-8 pr-3 md:px-4 md:pl-10 rounded-lg border border-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none cursor-pointer hover:bg-slate-750 transition-colors truncate max-w-[130px] sm:max-w-[200px] md:max-w-none"
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
                  size={16} 
                />
              </div>
            ) : (
              <span className="text-xs md:text-base text-slate-300 font-semibold truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
                {tenantName || tenantId}
              </span>
            )}
          </div>

          {/* Desktop Top Nav Tabs (Option 1) */}
          <nav className="hidden md:flex items-center bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {typeof item.count === 'number' && (
                    <span
                      className={`ms-1.5 px-2 py-0.5 rounded-full text-xs font-extrabold transition-colors ${
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-slate-800 text-slate-300 border border-slate-700/80'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-2.5">
            {isSuper && (
              <Link
                to="/admin/god-view"
                className="flex items-center gap-1.5 text-xs font-bold bg-blue-600/90 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-all shadow-md shadow-blue-900/20"
                title={isEn ? "God View" : "מצב אל"}
              >
                <Shield size={15} />
                <span>{isEn ? 'God Mode' : 'מצב אל'}</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setIsNotificationsOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title={isEn ? "Notifications" : "התראות"}
              aria-label={isEn ? "Notifications" : "התראות"}
              data-testid="navbar-desktop-notifications-btn"
            >
              <Bell size={20} />
            </button>

            <button
              type="button"
              onClick={() => setIsContactOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title={isEn ? "Contact Support" : "צור קשר"}
              aria-label={isEn ? "Contact Support" : "צור קשר"}
              data-testid="navbar-desktop-contact-btn"
            >
              <Headphones size={20} />
            </button>

            {onOpenHelp && (
              <button
                onClick={onOpenHelp}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                title={isEn ? "Help & Guide" : "עזרה ומדריך"}
              >
                <HelpCircle size={20} />
              </button>
            )}

            <button
              onClick={handleLogout}
              className="text-xs font-bold bg-red-600/15 hover:bg-red-600/30 text-red-400 hover:text-red-300 px-3 py-2 rounded-lg transition-all border border-red-500/20 flex items-center gap-1.5"
              title={isEn ? "Logout" : "התנתק"}
            >
              <LogOut size={15} />
              <span>{isEn ? 'Logout' : 'התנתק'}</span>
            </button>
          </div>

          {/* Mobile Hamburger & Quick Action Buttons */}
          <div className="flex md:hidden items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title={isEn ? "Notifications" : "התראות"}
              aria-label={isEn ? "Notifications" : "התראות"}
              data-testid="navbar-header-notifications-btn"
            >
              <Bell size={22} />
            </button>

            {onOpenHelp && (
              <button
                onClick={onOpenHelp}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                title={isEn ? "Help" : "עזרה"}
                aria-label={isEn ? "Help" : "עזרה"}
              >
                <HelpCircle size={22} />
              </button>
            )}

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              aria-label={isEn ? "Open Menu" : "פתח תפריט"}
              data-testid="navbar-mobile-menu-btn"
            >
              <Menu size={26} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer Menu (RTL Native) */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200"
          dir={isEn ? 'ltr' : 'rtl'}
          data-testid="navbar-mobile-drawer"
        >
          {/* Backdrop click listener */}
          <div 
            className="fixed inset-0" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />

          {/* Drawer Container */}
          <div className="relative w-4/5 max-w-sm bg-slate-900 text-white h-full shadow-2xl flex flex-col z-10 border-s border-slate-800 transform transition-transform duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-start bg-slate-950">
              <div className="flex flex-col gap-1.5 min-w-0">
                <img
                  src="/logo_transparent.png"
                  alt="TikTak"
                  className="h-11 w-auto object-contain self-start drop-shadow"
                />
                <span className="text-xs text-slate-300 font-semibold truncate max-w-[190px]">
                  {tenantName || tenantId}
                </span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all shrink-0"
                aria-label={isEn ? "Close Menu" : "סגור תפריט"}
              >
                <X size={22} />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="p-4 flex-1 space-y-2 overflow-y-auto">
              <div className="text-xs font-bold text-slate-400 px-3 uppercase tracking-wider mb-2">
                {isEn ? 'Navigation' : 'ניווט במערכת'}
              </div>

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;

                if (item.id === 'settings') {
                  return (
                    <div key={item.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setIsSettingsAccordionOpen(prev => !prev)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-bold transition-all ${
                          isActive
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                        data-testid="navbar-settings-accordion-trigger"
                      >
                        <div className="flex items-center gap-3">
                          <Settings
                            size={20}
                            className={`shrink-0 transition-transform duration-300 ease-out ${
                              isSettingsAccordionOpen ? 'rotate-90 text-blue-400' : ''
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        <ChevronDown
                          size={18}
                          className={`transition-transform duration-300 ease-out text-slate-400 ${
                            isSettingsAccordionOpen ? 'transform rotate-180' : ''
                          }`}
                        />
                      </button>

                      {/* Rolling Sub-items list */}
                      <div
                        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-in-out ${
                          isSettingsAccordionOpen
                            ? 'grid-rows-[1fr] opacity-100'
                            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-1 ps-4 border-s border-slate-800 ms-6 me-2 py-1">
                            {settingsSubItems.map((sub) => {
                              const SubIcon = sub.icon;
                              return (
                                <Link
                                  key={sub.id}
                                  to={sub.path}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                                >
                                  <SubIcon size={16} className="shrink-0" />
                                  <span>{sub.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-bold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.label}</span>
                    </div>
                    {typeof item.count === 'number' && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                          isActive
                            ? 'bg-white/25 text-white'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}

              {isSuper && (
                <div className="pt-4 mt-4 border-t border-slate-800">
                  <Link
                    to="/admin/god-view"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-bold bg-blue-950/60 border border-blue-800/50 text-blue-300 hover:bg-blue-900/50"
                  >
                    <Shield size={20} />
                    <span>{isEn ? 'God Mode' : 'מצב אל'}</span>
                  </Link>
                </div>
              )}

              {/* Divider */}
              <div className="py-2">
                <div className="border-t border-slate-800/80" />
              </div>

              {/* Notifications Menu Item */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsNotificationsOpen(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                data-testid="navbar-notifications-btn"
              >
                <div className="flex items-center gap-3">
                  <Bell size={20} className="shrink-0" />
                  <span>{isEn ? 'Notifications' : 'התראות'}</span>
                </div>
              </button>

              {/* Contact Us Menu Item */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsContactOpen(true);
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                data-testid="navbar-contact-btn"
              >
                <div className="flex items-center gap-3">
                  <Headphones size={20} className="shrink-0" />
                  <span>{isEn ? 'Contact Support' : 'צור קשר'}</span>
                </div>
              </button>
            </nav>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950">
              {onOpenHelp && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenHelp();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-all"
                >
                  <HelpCircle size={18} />
                  <span>{isEn ? 'Help & Guide' : 'עזרה ומדריך'}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold text-sm border border-red-500/30 transition-all"
              >
                <LogOut size={18} />
                <span>{isEn ? 'Logout' : 'התנתק'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
}
