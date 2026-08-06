import React, { useState, useRef } from 'react';
import { X, BookOpen, User, Shield, Settings, Database, Copy, Check, ExternalLink, Download, ChevronDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import heMessages from '../../locales/he.json';
import enMessages from '../../locales/en.json';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'he' | 'en';
  tenantId: string;
  tenantName: string;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, language, tenantId, tenantName }) => {
  const [copied, setCopied] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const residentSectionRef = useRef<HTMLDivElement>(null);
  const managerSectionRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const isHe = language === 'he';
  const reportUrl = `https://tiktak2026.web.app/report/${tenantId}`;
  const dict = (isHe ? (heMessages as any).HelpGuide : (enMessages as any).HelpGuide) || {};

  const handleCopy = () => {
    const message = isHe
      ? `*הודעה מ-TikTak* 🚀\n\nשלום, מצורף לינק לדיווח תקלות ב-${tenantName || 'בניין/רשות'}:\n${reportUrl}`
      : `*Message from TikTak* 🚀\n\nHello, here is the link to report issues at ${tenantName || 'your building/area'}:\n${reportUrl}`;

    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportImage = async (type: 'resident' | 'manager') => {
    const node = type === 'resident' ? residentSectionRef.current : managerSectionRef.current;
    if (!node) return;

    try {
      setIsExporting(true);
      setIsExportOpen(false);

      await new Promise(r => setTimeout(r, 100));

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: {
          padding: '24px',
          borderRadius: '24px',
          overflow: 'hidden'
        }
      });

      const link = document.createElement('a');
      const filenameType = type === 'resident' ? 'User_Guide' : 'Admin_Guide';
      link.download = `TikTak_${filenameType}_${language}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error exporting image:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        dir={isHe ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">{dict.title}</h2>
              <p className="text-xs text-slate-500 font-bold">{dict.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Export to Image Action Menu */}
            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                disabled={isExporting}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Download size={15} />
                <span>{isExporting ? (dict.exporting || 'מייצא...') : (dict.export_btn || 'ייצוא לתמונה')}</span>
                <ChevronDown size={14} className={`transition-transform ${isExportOpen ? 'rotate-180' : ''}`} />
              </button>

              {isExportOpen && (
                <div
                  className={`absolute top-full ${isHe ? 'left-0' : 'right-0'} mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1 animate-in zoom-in-95 duration-150`}
                >
                  <button
                    onClick={() => handleExportImage('resident')}
                    className="w-full px-4 py-2.5 text-right flex items-center gap-2 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer"
                    dir={isHe ? 'rtl' : 'ltr'}
                  >
                    <User size={16} className="text-blue-500 shrink-0" />
                    <span>{dict.export_user_guide || 'מדריך לתושב (תמונה)'}</span>
                  </button>
                  <button
                    onClick={() => handleExportImage('manager')}
                    className="w-full px-4 py-2.5 text-right flex items-center gap-2 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer"
                    dir={isHe ? 'rtl' : 'ltr'}
                  >
                    <Shield size={16} className="text-emerald-500 shrink-0" />
                    <span>{dict.export_admin_guide || 'מדריך למנהל (תמונה)'}</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 cursor-pointer"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-12 bg-slate-50/50">
          {/* 1. Resident Guide Section */}
          <div
            ref={residentSectionRef}
            className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6"
            dir={isHe ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center gap-3 text-blue-600 pb-4 border-b border-slate-100">
              <User size={26} />
              <h3 className="text-2xl font-black">{dict.resident_section_title}</h3>
            </div>

            <section className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <h4 className="font-black text-slate-900 mb-2">{dict.step1_title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      {dict.step1_desc}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 group">
                      <a
                        href={reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-blue-600 truncate hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={12} />
                        {reportUrl}
                      </a>
                      <button
                        onClick={handleCopy}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-blue-600 flex items-center gap-1"
                        title={dict.copy_btn}
                      >
                        {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        <span className="text-[10px] font-black uppercase tracking-tighter">{copied ? dict.copied_btn : dict.copy_btn}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold px-1 italic">{dict.copy_notice}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h4 className="font-black text-slate-900 mb-2">{dict.step2_title}</h4>
                  <ul className="text-sm text-slate-600 space-y-3">
                    <li className="flex gap-2">
                      <span className="text-red-500">📸</span>
                      <span><strong>Snap</strong>: {dict.step2_snap}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-blue-500">📝</span>
                      <span><strong>Manual</strong>: {dict.step2_manual}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-500">⚡</span>
                      <span><strong>{isHe ? 'דיווחים מהירים' : 'QuickTap'}</strong>: {dict.step2_quicktap}</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-500">💬</span>
                      <span dangerouslySetInnerHTML={{ __html: dict.step2_bot }} />
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mt-6">
                <h4 className="font-black text-blue-900 mb-2">{dict.step3_4_title}</h4>
                <p className="text-sm text-blue-800 leading-relaxed">
                  {dict.step3_4_desc}
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mt-6">
                <h4 className="font-black text-slate-900 mb-2">{dict.resident_dashboard_title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                  {dict.resident_dashboard_desc}
                </p>
                <ul className={`text-sm text-slate-600 space-y-3.5 list-disc list-inside ${isHe ? 'pr-2' : 'pl-2'}`}>
                  <li><strong>{dict.res_my_reports_label || (isHe ? 'טאב "הדיווחים שלי"' : '"My Reports" Tab')}</strong>: {dict.res_my_reports}</li>
                  <li><strong>{dict.res_open_reports_label || (isHe ? 'טאב "דיווחים פתוחים"' : '"Open Reports" Tab')}</strong>: {dict.res_open_reports}</li>
                  <li><strong>{dict.res_me_too_label || (isHe ? 'הצבעת "גם לי יש את זה" (Me Too)' : '"Me Too" Voting')}</strong>: {dict.res_me_too}</li>
                  <li><strong>{dict.res_comments_label || (isHe ? 'הערות ועדכונים' : 'Comments & Media')}</strong>: {dict.res_comments}</li>
                  <li><strong>{dict.res_sticky_ui_label || (isHe ? 'ממשק קבוע ונוח (Sticky UI)' : 'Frozen Header & Tabs (Sticky UI)')}</strong>: {dict.res_sticky_ui}</li>
                </ul>
              </div>
            </section>
          </div>

          {/* 2. Manager Guide Section */}
          <div
            ref={managerSectionRef}
            className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6"
            dir={isHe ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center gap-3 text-blue-600 pb-4 border-b border-slate-100">
              <Shield size={26} />
              <h3 className="text-2xl font-black">{dict.manager_section_title}</h3>
            </div>

            <section className="space-y-6">
              <div className="space-y-6">
                <div className={`${isHe ? 'border-r-4 pr-6' : 'border-l-4 pl-6'} border-blue-500 space-y-4`}>
                  <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Database size={20} className="text-blue-500" />
                    {dict.mgr_ticket_mgmt}
                  </h4>
                  <ul className="text-sm text-slate-600 space-y-3">
                    <li><strong>{dict.mgr_dynamic_panel_label || (isHe ? 'לוח בקרה דינמי' : 'Dynamic Panel')}</strong>: {dict.mgr_dynamic_panel}</li>
                    <li><strong>{dict.mgr_drag_drop_label || (isHe ? 'עדכון סטטוס בגרירה' : 'Drag & Drop Status')}</strong>: {dict.mgr_drag_drop}</li>
                    <li><strong>{dict.mgr_quicktap_id_label || (isHe ? 'זיהוי דיווחים מהירים' : 'QuickTap ID')}</strong>: {dict.mgr_quicktap_id}</li>
                    <li dangerouslySetInnerHTML={{ __html: `<strong>${dict.mgr_backlog_label || (isHe ? 'מצבור משימות (Backlog)' : 'Tasks Backlog')}</strong>: ${dict.mgr_backlog}` }} />
                    <li dangerouslySetInnerHTML={{ __html: `<strong>${dict.mgr_forward_vendor_label || (isHe ? 'העברה לספק (Forward to Vendor)' : 'Forward to Vendor')}</strong>: ${dict.mgr_forward_vendor}` }} />
                    <li dangerouslySetInnerHTML={{ __html: `<strong>${dict.mgr_comments_whatsapp_label || (isHe ? 'כתיבת הערה ועדכון המדווח בוואטסאפ' : 'Comments & Reporter Notifications')}</strong>: ${dict.mgr_comments_whatsapp}` }} />
                    <li><strong>{dict.mgr_ticket_analysis_label || (isHe ? 'ניתוח תקלה' : 'Ticket Analysis')}</strong>: {dict.mgr_ticket_analysis}</li>
                  </ul>
                </div>

                <div className={`${isHe ? 'border-r-4 pr-6' : 'border-l-4 pl-6'} border-green-500 space-y-4`}>
                  <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <span className="text-green-500">⏱️</span>
                    {dict.mgr_sla_title}
                  </h4>
                  <div className="text-sm text-slate-600 space-y-4">
                    <div>
                      <strong className="block text-slate-900 mb-1">{dict.mgr_sla_subhead}</strong>
                      <p className="leading-relaxed mb-2">{dict.mgr_sla_desc}</p>
                      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <li className="flex items-center gap-2 bg-yellow-50 text-yellow-800 px-3 py-1.5 rounded-xl border border-yellow-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></span>
                          <span><strong>{dict.mgr_sla_2days}</strong></span>
                        </li>
                        <li className="flex items-center gap-2 bg-orange-50 text-orange-800 px-3 py-1.5 rounded-xl border border-orange-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                          <span><strong>{dict.mgr_sla_5days}</strong></span>
                        </li>
                        <li className="flex items-center gap-2 bg-red-50 text-red-800 px-3 py-1.5 rounded-xl border border-red-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                          <span><strong>{dict.mgr_sla_9days}</strong></span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <strong className="block text-blue-950 mb-1">{dict.mgr_wa_subhead}</strong>
                      <ul className={`space-y-1.5 text-blue-900 leading-relaxed list-disc list-inside ${isHe ? 'pr-2' : 'pl-2'}`}>
                        <li><strong>{isHe ? 'פתיחת דיווח:' : 'Ticket Creation:'}</strong> {dict.mgr_wa_creation}</li>
                        <li dangerouslySetInnerHTML={{ __html: `<strong>${isHe ? 'עדכון סטטוס:' : 'Status Updates:'}</strong> ${dict.mgr_wa_status}` }} />
                      </ul>
                    </div>
                  </div>
                </div>

                <div className={`${isHe ? 'border-r-4 pr-6' : 'border-l-4 pl-6'} border-amber-500 space-y-4`}>
                  <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Settings size={20} className="text-amber-500" />
                    {dict.mgr_settings_title}
                  </h4>
                  <ul className="text-sm text-slate-600 space-y-3">
                    <li><strong className="text-red-600">{isHe ? 'ניהול מורשים (Whitelist)' : 'Permissions & Whitelist'}</strong>: {dict.mgr_settings_whitelist}</li>
                    <li><strong>{isHe ? 'ניהול מנהלים' : 'User Management'}</strong>: {dict.mgr_settings_users}</li>
                    <li><strong>{isHe ? 'ניהול אנשי שירות (ספקים)' : 'Vendors Management'}</strong>: {dict.mgr_settings_vendors}</li>
                    <li><strong>{isHe ? 'ניהול דיווחים מהירים' : 'QuickTap Setup'}</strong>: {dict.mgr_settings_quicktap}</li>
                    <li><strong>{isHe ? 'מיתוג ונתונים' : 'Branding'}</strong>: {dict.mgr_settings_branding}</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          {/* Privacy Section */}
          <section className="bg-slate-900 text-slate-100 p-8 rounded-3xl">
            <h3 className="text-xl font-black mb-4 flex items-center gap-2">
              <Shield size={20} className="text-blue-400" />
              {dict.privacy_title}
            </h3>
            <ul className="text-sm space-y-2 opacity-90">
              <li>{dict.privacy_media}</li>
              <li>{dict.privacy_phone}</li>
              <li>{dict.privacy_security}</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-center bg-slate-50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TikTak • {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
};
