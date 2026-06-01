import React, { useState } from 'react';
import { X, BookOpen, User, Shield, Settings, Database, Copy, Check, ExternalLink } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'he' | 'en';
  tenantId: string;
  tenantName: string;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, language, tenantId, tenantName }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isHe = language === 'he';
  const reportUrl = `https://tiktak2026.web.app/report/${tenantId}`;

  const handleCopy = () => {
    const message = isHe 
      ? `*הודעה מ-TikTak* 🚀\n\nשלום, מצורף לינק לדיווח תקלות ב-${tenantName || 'בניין/רשות'}:\n${reportUrl}`
      : `*Message from TikTak* 🚀\n\nHello, here is the link to report issues at ${tenantName || 'your building/area'}:\n${reportUrl}`;
    
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              <h2 className="text-xl font-black text-slate-900">{isHe ? 'מדריך למשתמש TikTak' : 'TikTak User Guide'}</h2>
              <p className="text-xs text-slate-500 font-bold">{isHe ? 'Snap. Send. Solved.' : 'Snap. Send. Solved.'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-12">
          {isHe ? (
            <>
              {/* Hebrew Content */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 mb-6">
                  <User size={24} />
                  <h3 className="text-2xl font-black">1. מדריך לתושב</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col justify-between">
                    <div>
                      <h4 className="font-black text-slate-900 mb-2">שלב א': סריקה וזיהוי</h4>
                      <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        חפשו את ה-QR וסרקו אותו או ליחצו על הלינק למטה. בעת הדיווח הראשון תתבקשו להזין טלפון לאימות מול רשימת המורשים. המערכת תזכור אתכם לדיווחים הבאים.
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
                          title="העתק הודעה לוואטסאפ"
                        >
                          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                          <span className="text-[10px] font-black uppercase tracking-tighter">{copied ? 'הועתק' : 'העתק'}</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold px-1 italic">* לחיצה על העתק תייצר הודעת TikTak מוכנה לשליחה בוואטסאפ</p>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h4 className="font-black text-slate-900 mb-2">שלב ב': תיעוד המפגע</h4>
                    <ul className="text-sm text-slate-600 space-y-3">
                      <li className="flex gap-2">
                        <span className="text-red-500">📸</span>
                        <span><strong>Snap</strong>: לחצו על המצלמה האדומה. ה-AI יסווג את התקלה אוטומטית.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">📝</span>
                        <span><strong>Manual</strong>: מיועד לרעשים, ריחות ומפגעים שקשה לתעד חזותית. ניתן להוסיף הקלטה קולית בתוך הטופס.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">⚡</span>
                        <span><strong>QuickTap</strong>: דיווח ב-2 לחיצות על אייקונים מוגדרים מראש (למשל: "אור שרוף").</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mt-6">
                  <h4 className="font-black text-blue-900 mb-2">שלב ג' וד': דיוק ושליחה</h4>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    ודאו את המיקום והקטגוריה, ולחצו על הכפתור הירוק למטה. המערכת תשלח את הדיווח אוטומטית דרך השרת, ללא צורך בפתיחת וואטסאפ או לחיצה ידנית על "שלח"!
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 mb-6">
                  <Shield size={24} />
                  <h3 className="text-2xl font-black">2. מדריך למנהל</h3>
                </div>

                <div className="space-y-6">
                  <div className="border-r-4 border-blue-500 pr-6 space-y-4">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <Database size={20} className="text-blue-500" />
                      ניהול תקלות
                    </h4>
                    <ul className="text-sm text-slate-600 space-y-3">
                      <li><strong>לוח בקרה דינמי</strong>: כל פילטר משפיע על הגרפים והסטטיסטיקות למעלה בזמן אמת.</li>
                      <li><strong>עדכון סטטוס בגרירה</strong>: גררו כרטיסים בין העמודות כדי לעדכן סטטוס מיידית (מתועד ביומן הפעילות).</li>
                      <li><strong>זיהוי QuickTap</strong>: תקלות אלו מסומנות בתג כחול בולט ⚡ QuickTap.</li>
                      <li><strong>ניתוח תקלה</strong>: הקליקו על כרטיס לצפייה במדיה. מומלץ להשתמש באוזניות להקלטות.</li>
                    </ul>
                  </div>

                  <div className="border-r-4 border-green-500 pr-6 space-y-4">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <span className="text-green-500">⏱️</span>
                      מדדי SLA והתראות וואטסאפ
                    </h4>
                    <div className="text-sm text-slate-600 space-y-4">
                      <div>
                        <strong className="block text-slate-900 mb-1">עמידה בזמני טיפול (SLA):</strong>
                        <p className="leading-relaxed mb-2">המערכת מודדת אוטומטית את ימי העבודה שחלפו מרגע פתיחת התקלה או עדכון הסטטוס שלה:</p>
                        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <li className="flex items-center gap-2 bg-yellow-50 text-yellow-800 px-3 py-1.5 rounded-xl border border-yellow-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></span>
                            <span><strong>מעל 2 ימים:</strong> אזהרה (צהוב)</span>
                          </li>
                          <li className="flex items-center gap-2 bg-orange-50 text-orange-800 px-3 py-1.5 rounded-xl border border-orange-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                            <span><strong>מעל 5 ימים:</strong> דחוף (כתום)</span>
                          </li>
                          <li className="flex items-center gap-2 bg-red-50 text-red-800 px-3 py-1.5 rounded-xl border border-red-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                            <span><strong>מעל 9 ימים:</strong> חריגה (אדום)</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <strong className="block text-blue-950 mb-1">💬 התראות וואטסאפ אוטומטיות (ללא מאמץ):</strong>
                        <ul className="space-y-1.5 text-blue-900 leading-relaxed pr-2 list-disc list-inside">
                          <li><strong>פתיחת דיווח:</strong> ברגע שתושב שולח דיווח, נשלחת לו מיידית הודעת אישור לוואטסאפ, ובמקביל נשלחת התראה מפורטת לוואטסאפ של חברי הוועד / המנהלים.</li>
                          <li><strong>עדכון סטטוס:</strong> כאשר אתם גוררים תקלה ל-<em>"בטיפול"</em> או מסמנים אותה כ-<em>"טופל" / "נדחה"</em>, המערכת שולחת אוטומטית עדכון וואטסאפ מנוסח ומקצועי ישירות לתושב שדיווח.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="border-r-4 border-amber-500 pr-6 space-y-4">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <Settings size={20} className="text-amber-500" />
                      הגדרות ישות
                    </h4>
                    <ul className="text-sm text-slate-600 space-y-3">
                      <li><strong className="text-red-600">הרשאות (CSV Upload)</strong>: הלב של המערכת. רשימת האימות (Whitelist) של המדווחים.</li>
                      <li><strong>ניהול משתמשים</strong>: הוספת ועריכת מנהלים בעלי גישה למערכת.</li>
                      <li><strong>ניהול QuickTap</strong>: הגדרת עד 5 כפתורים מקוצרים לתקלות נפוצות.</li>
                      <li><strong>מיתוג ונתונים</strong>: עדכון שמות, תוויות, מיקומים וקטגוריות.</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="bg-slate-900 text-slate-100 p-8 rounded-3xl">
                <h3 className="text-xl font-black mb-4 flex items-center gap-2">
                  <Shield size={20} className="text-blue-400" />
                  פרטיות וטיפול בנתונים
                </h3>
                <ul className="text-sm space-y-2 opacity-90">
                  <li>• תמונות והקלטות נמחקות אוטומטית לאחר שנה אחת.</li>
                  <li>• מספר הטלפון משמש לאימות בלבד ואינו מועבר לצד שלישי.</li>
                  <li>• המידע נשמר בצורה מאובטחת ומנוהל תחת תקני אבטחה מחמירים.</li>
                </ul>
              </section>
            </>
          ) : (
            <>
              {/* English Content */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 mb-6">
                  <User size={24} />
                  <h3 className="text-2xl font-black">1. Resident Guide</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col justify-between">
                    <div>
                      <h4 className="font-black text-slate-900 mb-2">Step 1: Scan & ID</h4>
                      <p className="text-sm text-slate-600 leading-relaxed mb-4">
                        Find and scan the QR code or click the link below. On your first report, enter your phone number to verify against the building list. The system will remember you.
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
                          title="Copy WhatsApp Message"
                        >
                          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                          <span className="text-[10px] font-black uppercase tracking-tighter">{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold px-1 italic">* Clicking copy will generate a pre-formatted TikTak WhatsApp message</p>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h4 className="font-black text-slate-900 mb-2">Step 2: Document Issue</h4>
                    <ul className="text-sm text-slate-600 space-y-3">
                      <li className="flex gap-2">
                        <span className="text-red-500">📸</span>
                        <span><strong>Snap</strong>: Use the red camera button. AI automatically categorizes the issue.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">📝</span>
                        <span><strong>Manual</strong>: For non-visual issues like noises or smells. Voice recording available inside.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-amber-500">⚡</span>
                        <span><strong>QuickTap</strong>: Report instantly with pre-set buttons in just 2 clicks.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mt-6">
                  <h4 className="font-black text-blue-900 mb-2">Step 3 & 4: Refine & Send</h4>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    Verify the location/category and click the green button. The system sends the report automatically via our backend – no need to open WhatsApp or click "Send" manually!
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 mb-6">
                  <Shield size={24} />
                  <h3 className="text-2xl font-black">2. Manager Guide</h3>
                </div>

                <div className="space-y-6">
                  <div className="border-l-4 border-blue-500 pl-6 space-y-4">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <Database size={20} className="text-blue-500" />
                      Admin Dashboard
                    </h4>
                    <ul className="text-sm text-slate-600 space-y-3">
                      <li><strong>Dynamic Panel</strong>: Filters update stats and charts in real-time.</li>
                      <li><strong>Drag & Drop Status</strong>: Move cards between columns to update status instantly (recorded in Audit Log).</li>
                      <li><strong>QuickTap ID</strong>: These tickets are marked with a blue ⚡ QuickTap tag.</li>
                      <li><strong>Ticket Analysis</strong>: Click cards to view media. Use headphones for audio.</li>
                    </ul>
                  </div>

                  <div className="border-l-4 border-green-500 pl-6 space-y-4">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <span className="text-green-500">⏱️</span>
                      SLA Thresholds & WhatsApp Alerts
                    </h4>
                    <div className="text-sm text-slate-600 space-y-4">
                      <div>
                        <strong className="block text-slate-900 mb-1">Service Level Agreement (SLA):</strong>
                        <p className="leading-relaxed mb-2">The system automatically calculates working days spent on each ticket from creation or status update:</p>
                        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <li className="flex items-center gap-2 bg-yellow-50 text-yellow-800 px-3 py-1.5 rounded-xl border border-yellow-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></span>
                            <span><strong>Over 2 Days:</strong> Warning (Yellow)</span>
                          </li>
                          <li className="flex items-center gap-2 bg-orange-50 text-orange-800 px-3 py-1.5 rounded-xl border border-orange-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                            <span><strong>Over 5 Days:</strong> Urgent (Orange)</span>
                          </li>
                          <li className="flex items-center gap-2 bg-red-50 text-red-800 px-3 py-1.5 rounded-xl border border-red-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                            <span><strong>Over 9 Days:</strong> Breach (Red)</span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <strong className="block text-blue-950 mb-1">💬 Automated WhatsApp Notifications:</strong>
                        <ul className="space-y-1.5 text-blue-900 leading-relaxed pl-2 list-disc list-inside">
                          <li><strong>Ticket Creation:</strong> Instantly notifies the resident with a confirmation, and alerts building administrators with a high-density structured summary.</li>
                          <li><strong>Status Updates:</strong> Moving a ticket to <em>"In Progress"</em> or marking it as <em>"Resolved" / "Rejected"</em> automatically triggers a professionally drafted WhatsApp update straight to the reporter's phone.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="border-l-4 border-amber-500 pl-6 space-y-4">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <Settings size={20} className="text-amber-500" />
                      Tenant Settings
                    </h4>
                    <ul className="text-sm text-slate-600 space-y-3">
                      <li><strong className="text-red-600">Permissions (CSV)</strong>: The heart of the system. The Whitelist for authorized reporters.</li>
                      <li><strong>User Management</strong>: Add/Edit admin users with system access.</li>
                      <li><strong>QuickTap Setup</strong>: Configure up to 5 pre-set buttons for common issues.</li>
                      <li><strong>Branding</strong>: Update names, labels, and data lists.</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="bg-slate-900 text-slate-100 p-8 rounded-3xl">
                <h3 className="text-xl font-black mb-4 flex items-center gap-2">
                  <Shield size={20} className="text-blue-400" />
                  Privacy & Data Handling
                </h3>
                <ul className="text-sm space-y-2 opacity-90">
                  <li>• Media is automatically deleted after 1 year.</li>
                  <li>• Phone numbers are used for authentication only.</li>
                  <li>• Data is stored securely under strict industry standards.</li>
                </ul>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-center bg-slate-50">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TikTak • {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
};
