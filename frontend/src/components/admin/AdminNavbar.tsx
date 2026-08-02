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
  ChevronDown 
} from 'lucide-react';

interface AdminNavbarProps {
  tenantId: string;
  tenantName?: string;
  currentPage: 'dashboard' | 'backlog' | 'settings';
  myTenants?: { id: string; name?: string }[];
  isSuper?: boolean;
  isEn?: boolean;
  onOpenHelp?: () => void;
}

export function AdminNavbar({
  tenantId,
  tenantName,
  currentPage,
  myTenants = [],
  isSuper = false,
  isEn = false,
  onOpenHelp
}: AdminNavbarProps) {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const navItems = [
    {
      id: 'dashboard',
      label: isEn ? 'Dashboard' : 'דשבורד',
      path: `/admin/${tenantId}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      id: 'backlog',
      label: isEn ? 'Tasks Backlog' : 'מצבור משימות',
      path: `/admin/${tenantId}/backlog`,
      icon: ListTodo,
    },
    {
      id: 'settings',
      label: isEn ? 'Settings' : 'הגדרות',
      path: `/admin/${tenantId}/settings`,
      icon: Settings,
    },
  ];

  return (
    <>
      <header className="bg-slate-900 text-white p-3 md:p-4 sticky top-0 z-50 shadow-md border-b border-slate-800" dir={isEn ? 'ltr' : 'rtl'}>
        <div className="max-w-7xl mx-auto flex justify-between items-center px-2 md:px-4">
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

          {/* Mobile Hamburger Toggle Button (Option 2) */}
          <div className="flex md:hidden items-center gap-2">
            {onOpenHelp && (
              <button
                onClick={onOpenHelp}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                title={isEn ? "Help" : "עזרה"}
              >
                <HelpCircle size={22} />
              </button>
            )}

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              aria-label={isEn ? "Open Menu" : "פתח תפריט"}
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
        >
          {/* Backdrop click listener */}
          <div 
            className="fixed inset-0" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />

          {/* Drawer Container */}
          <div className="relative w-4/5 max-w-sm bg-slate-900 text-white h-full shadow-2xl flex flex-col z-10 border-s border-slate-800 transform transition-transform duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2">
                <img
                  src="/logo_transparent.png"
                  alt="TikTak"
                  className="h-9 w-auto object-contain"
                />
                <span className="text-xs text-slate-400 font-medium truncate max-w-[150px]">
                  {tenantName || tenantId}
                </span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
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
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-bold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
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
    </>
  );
}
