import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  Flame, 
  Clock, 
  Layers, 
  ExternalLink, 
  Check, 
  RotateCcw,
  CheckCheck,
  Briefcase,
  CreditCard,
  AlertOctagon
} from 'lucide-react';
import { NotificationItem } from '../../utils/notificationsEngine';
import heJson from '../../locales/he.json';
import enJson from '../../locales/en.json';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  isEn?: boolean;
  notifications: NotificationItem[];
  backlogCount?: number;
  onToggleRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onSelectTicket?: (ticketId: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  isEn = false,
  notifications = [],
  backlogCount = 0,
  onToggleRead,
  onMarkAllRead,
  onSelectTicket
}) => {
  const navigate = useNavigate();
  const [showOnlyUnread, setShowOnlyUnread] = useState<boolean>(true);

  const t = isEn ? enJson.Notifications : heJson.Notifications;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const visibleItems = showOnlyUnread ? notifications.filter(n => !n.isRead) : notifications;

  const handleGoToBacklog = () => {
    onClose();
    navigate(`/admin/${tenantId}/backlog`);
  };

  const handleTicketClick = (ticketId: string) => {
    onClose();
    if (onSelectTicket) {
      onSelectTicket(ticketId);
    } else {
      navigate(`/admin/${tenantId}/dashboard?ticket=${ticketId}`);
      try {
        window.dispatchEvent(new CustomEvent('tiktak:open-ticket-details', { detail: { ticketId } }));
      } catch (e) {
        console.error("Error dispatching open ticket event:", e);
      }
    }
  };

  const formatTimeAgo = (isoDate: string) => {
    try {
      const now = new Date();
      const past = new Date(isoDate);
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return isEn 
          ? `${diffDays}d ago` 
          : `לפני ${diffDays} ימים`;
      }
      if (diffHours > 0) {
        return isEn 
          ? `${diffHours}h ago` 
          : `לפני ${diffHours} שעות`;
      }
      if (diffMins > 0) {
        return isEn 
          ? `${diffMins}m ago` 
          : `לפני ${diffMins} דקות`;
      }
      return isEn ? 'Just now' : 'ממש עכשיו';
    } catch {
      return '';
    }
  };

  const renderBadge = (item: NotificationItem) => {
    switch (item.type) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <Flame size={12} className="animate-pulse text-red-400" />
            {t.urgentTag}
          </span>
        );
      case 'sla_stale_9':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle size={12} />
            {t.slaStale9Tag}
          </span>
        );
      case 'sla_stale_5':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock size={12} />
            {t.slaStale5Tag}
          </span>
        );
      case 'vendor_stalled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Briefcase size={12} />
            {t.vendorStalledTag}
          </span>
        );
      case 'duplicate_spike':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Layers size={12} />
            {t.duplicateSpikeTag}
          </span>
        );
      case 'quota_warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <CreditCard size={12} />
            {t.quotaWarningTag}
          </span>
        );
      case 'quota_alert':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertOctagon size={12} className="animate-pulse" />
            {t.quotaAlertTag}
          </span>
        );
      case 'new_ticket':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Bell size={12} />
            {t.newTicketTag}
          </span>
        );
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative w-full max-w-lg bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 overflow-hidden z-10 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-extrabold text-white ring-2 ring-slate-900 animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {t.title}
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-medium">
                    {unreadCount} {isEn ? 'unread' : 'שלא נקראו'}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              aria-label={isEn ? 'Close' : 'סגור'}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter & Action Subheader */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between text-xs shrink-0">
          {/* Switch: Only Unread */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
            <input 
              type="checkbox" 
              checked={showOnlyUnread}
              onChange={(e) => setShowOnlyUnread(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="font-medium">{t.onlyUnread}</span>
          </label>

          {/* Mark all as read button */}
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="flex items-center gap-1.5 text-slate-400 hover:text-blue-400 transition-colors py-1 px-2 rounded-lg hover:bg-slate-800/60"
            >
              <CheckCheck size={14} />
              <span>{t.markAllRead}</span>
            </button>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {/* Backlog Scope Counter Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-slate-800/90 to-slate-800/40 border border-slate-700/80 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Layers size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  {t.backlogBannerTitle}
                </h4>
                <p className="text-xs text-slate-400">
                  {backlogCount === 1 
                    ? t.backlogCountTextOne 
                    : t.backlogCountText.replace('{{count}}', String(backlogCount || 0))}
                </p>
              </div>
            </div>
            <button
              onClick={handleGoToBacklog}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-all"
            >
              <span>{t.backlogBannerAction}</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {/* Grouped Notification Categories */}
          {(() => {
            const categories = [
              {
                id: 'urgent_critical',
                title: t.groupUrgentCritical || (isEn ? 'Urgent & Critical Alerts' : 'מפגעים דחופים וחריגות קריטיות'),
                icon: Flame,
                color: 'text-red-400 bg-red-500/10 border-red-500/20',
                badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
                items: visibleItems.filter(i => ['urgent', 'sla_stale_9', 'quota_alert'].includes(i.type))
              },
              {
                id: 'sla_vendor',
                title: t.groupSlaVendor || (isEn ? 'SLA & Vendor Follow-ups' : 'חריגות SLA ועיכובי ספקים'),
                icon: Clock,
                color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                items: visibleItems.filter(i => ['sla_stale_5', 'vendor_stalled'].includes(i.type))
              },
              {
                id: 'activity_quota',
                title: t.groupActivityQuota || (isEn ? 'Activity Spikes & Quota' : 'גל דיווחים ומכסה'),
                icon: Layers,
                color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
                badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
                items: visibleItems.filter(i => ['duplicate_spike', 'quota_warning'].includes(i.type))
              },
              {
                id: 'new_reports',
                title: t.groupNewReports || (isEn ? 'New Incoming Reports' : 'פניות חדשות'),
                icon: Bell,
                color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
                badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                items: visibleItems.filter(i => ['new_ticket'].includes(i.type))
              }
            ];

            const activeCategories = categories.filter(cat => cat.items.length > 0);

            if (activeCategories.length === 0) {
              return null;
            }

            return (
              <div className="space-y-4">
                {activeCategories.map(cat => {
                  const CategoryIcon = cat.icon;
                  return (
                    <div key={cat.id} className="space-y-2">
                      <div className="flex items-center justify-between px-1 pt-1 pb-0.5 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded-md border ${cat.color}`}>
                            <CategoryIcon size={13} />
                          </div>
                          <h4 className="text-xs font-bold text-slate-300">
                            {cat.title}
                          </h4>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${cat.badgeColor}`}>
                          {cat.items.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {cat.items.map((item) => {
                          const isCritical = item.severity === 'critical';
                          const isWarning = item.severity === 'warning';
                          
                          let borderClass = 'border-blue-500/30 bg-blue-950/15 hover:bg-blue-950/25';
                          if (isCritical) {
                            borderClass = 'border-red-500/40 bg-red-950/20 hover:bg-red-950/30';
                          } else if (isWarning) {
                            borderClass = 'border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/30';
                          }

                          if (item.isRead) {
                            borderClass = 'border-slate-800 bg-slate-900/40 opacity-60 hover:opacity-100';
                          }

                          return (
                            <div
                              key={item.id}
                              className={`p-3.5 rounded-xl border transition-all relative flex flex-col gap-2 ${borderClass}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {renderBadge(item)}
                                  {item.category && (
                                    <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                                      {item.category}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-slate-400">
                                    {formatTimeAgo(item.createdAt)}
                                  </span>
                                </div>

                                {/* Read / Unread toggle icon */}
                                <button
                                  onClick={() => onToggleRead(item.id)}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    item.isRead 
                                      ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' 
                                      : 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
                                  }`}
                                  title={item.isRead ? t.markUnread : t.markRead}
                                  aria-label={item.isRead ? t.markUnread : t.markRead}
                                >
                                  {item.isRead ? <RotateCcw size={15} /> : <Check size={16} />}
                                </button>
                              </div>

                              {/* Content */}
                              <div>
                                <h4 className={`text-sm font-bold ${item.isRead ? 'text-slate-300' : 'text-white'}`}>
                                  {item.title}
                                </h4>
                                <p className="text-xs text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
                                  {item.description}
                                </p>
                                {(item.location || item.subLocation) && (
                                  <p className="text-[11px] text-slate-400 mt-1">
                                    📍 {[item.location, item.subLocation].filter(Boolean).join(' • ')}
                                  </p>
                                )}
                              </div>

                              {/* Action Row */}
                              <div className="flex items-center justify-end pt-1 border-t border-slate-800/60">
                                {item.actionUrl ? (
                                  <button
                                    onClick={() => {
                                      onClose();
                                      navigate(item.actionUrl!);
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors py-1 px-2 rounded-lg hover:bg-blue-500/10"
                                  >
                                    <span>{item.actionLabel || t.viewQuota}</span>
                                    <ExternalLink size={12} />
                                  </button>
                                ) : item.ticketId ? (
                                  <button
                                    onClick={() => handleTicketClick(item.ticketId!)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors py-1 px-2 rounded-lg hover:bg-blue-500/10"
                                  >
                                    <span>{t.viewTicket}</span>
                                    <ExternalLink size={12} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })() || (
            /* Empty State */
            <div className="py-10 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-3 text-slate-400">
                <CheckCircle2 size={28} className="text-green-400" />
              </div>
              <h4 className="text-base font-bold text-slate-100 mb-1">
                {showOnlyUnread ? t.emptyUnreadTitle : t.emptyAllTitle}
              </h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                {showOnlyUnread ? t.emptyUnreadDesc : t.emptyAllDesc}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800/80 flex justify-between items-center shrink-0">
          <span className="text-[11px] text-slate-500">
            TikTak Notification Center
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700"
          >
            {isEn ? 'Close' : 'סגור'}
          </button>
        </div>
      </div>
    </div>
  );
};
