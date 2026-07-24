import React, { useState } from 'react';
import { X, MessageSquare, Trash2, Clock, Send, AlertCircle, CheckCircle2, MessageCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  authorName?: string;
  sentToWhatsApp?: boolean;
  sentToWhatsAppAt?: string;
  sentViaTemplate?: boolean;
}

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: {
    id: string;
    category: string;
    ticketNumber?: number;
    source?: string;
    reporterPhone?: string;
    from?: string;
    adminComments?: Comment[];
  } | null;
  onSave: (ticket: any, text: string) => Promise<void>;
  onSaveAndSendWhatsApp: (ticket: any, text: string) => Promise<void>;
  onSendWhatsApp: (ticket: any, comment: Comment) => Promise<void>;
  onDelete: (ticket: any, comment: Comment) => Promise<void>;
  isEn: boolean;
}

export const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  ticket,
  onSave,
  onSaveAndSendWhatsApp,
  onSendWhatsApp,
  onDelete,
  isEn
}) => {
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | null>(null);

  if (!isOpen || !ticket) return null;

  const hasWhatsAppPhone = !!(
    ticket.reporterPhone ||
    ticket.from ||
    ticket.source === 'whatsapp'
  );

  const labels = {
    title: isEn ? 'Internal Comments' : 'הערות פנימיות',
    placeholder: isEn ? 'Add a note...' : 'הוסף הערה...',
    save: isEn ? 'Save Note' : 'שמור הערה',
    saveAndSendWhatsApp: isEn ? 'Save & Send WhatsApp' : 'שמור ושלח בוואטסאפ',
    cancel: isEn ? 'Cancel' : 'ביטול',
    discard: isEn ? 'Discard' : 'נקה',
    noComments: isEn ? 'No notes yet.' : 'אין הערות עדיין.',
    deleteConfirm: isEn ? 'Delete this note?' : 'למחוק הערה זו?',
  };

  const handleSaveInternal = async () => {
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      await onSave(ticket, newComment.trim());
      setNewComment('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndSendWhatsAppAction = async () => {
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      await onSaveAndSendWhatsApp(ticket, newComment.trim());
      setNewComment('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSendExistingCommentWhatsApp = async (comment: Comment) => {
    setSendingWhatsAppId(comment.id);
    try {
      await onSendWhatsApp(ticket, comment);
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'HH:mm dd/MM', { locale: isEn ? undefined : he });
    } catch (e) {
      return dateStr;
    }
  };

  const recipientName = (ticket as any).reporterName || (ticket as any).name || (ticket as any).reporter || (isEn ? 'Resident' : 'תושב/דייר');
  const tNumber = ticket.ticketNumber || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Container */}
      <div 
        className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-blue-600" size={20} />
            <div>
              <h2 className="font-bold text-slate-900">{labels.title}</h2>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">{ticket.category}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Comment History */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/30">
          {ticket.adminComments && ticket.adminComments.length > 0 ? (
            ticket.adminComments.map((c) => (
              <div key={c.id} className="group bg-white p-3 rounded-xl border border-slate-100 shadow-sm relative animate-in slide-in-from-bottom-2">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    {c.authorName && (
                      <span className="text-xs font-extrabold text-blue-700 mb-0.5">
                        {c.authorName.replace(/\s*\(תושב\)/g, '').replace(/\s*\(Resident\)/g, '')}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock size={10} />
                      <span className="text-[9px] font-bold">{formatDate(c.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.sentToWhatsApp ? (
                      <div 
                        className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md select-none"
                        title={isEn ? `Sent via WhatsApp on ${formatDate(c.sentToWhatsAppAt || c.createdAt)}` : `נשלח בוואטסאפ ב-${formatDate(c.sentToWhatsAppAt || c.createdAt)}`}
                      >
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        <span>{isEn ? 'WhatsApp Sent' : 'עדכון נשלח בוואטסאפ'}</span>
                      </div>
                    ) : (
                      <div className="relative group/whatsapp-item-btn">
                        <button
                          onClick={() => handleSendExistingCommentWhatsApp(c)}
                          disabled={!hasWhatsAppPhone || sendingWhatsAppId === c.id}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all shadow-sm ${
                            hasWhatsAppPhone 
                              ? 'bg-[#25D366] hover:bg-[#20bd5a] text-white active:scale-95 cursor-pointer' 
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                          }`}
                        >
                          <MessageCircle size={13} />
                          <span>{sendingWhatsAppId === c.id ? (isEn ? 'Sending...' : 'שולח...') : (isEn ? 'Send to WhatsApp' : 'עדכן בוואטסאפ')}</span>
                        </button>

                        {/* Rich WhatsApp Message Preview Tooltip */}
                        {hasWhatsAppPhone && (
                          <div className={`pointer-events-none absolute bottom-full mb-2.5 hidden group-hover/whatsapp-item-btn:flex flex-col w-72 bg-slate-900 text-white rounded-xl p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 border border-slate-700/80 ${isEn ? 'right-0' : 'left-0'}`}>
                            <div className="text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                              <MessageCircle size={13} className="text-[#25D366]" />
                              <span>{isEn ? 'Send this note as a WhatsApp update to reporter:' : 'שלח הערה זו כהודעת וואטסאפ לתושב:'}</span>
                            </div>

                            {/* WhatsApp Note Bubble */}
                            <div className="bg-[#075E54] text-white text-[11px] leading-relaxed p-2.5 rounded-xl border border-emerald-600/40 shadow-inner font-sans text-right" dir={isEn ? 'ltr' : 'rtl'}>
                              <div className="text-emerald-200 font-semibold mb-1">
                                {isEn ? `Hello ${recipientName}, new update for ticket #${tNumber}:` : `שלום ${recipientName},\nנשלח עבורך עדכון חדש במערכת לגבי פנייה מספר #${tNumber}:`}
                              </div>
                              <div className="bg-white/10 p-2 rounded-lg my-1.5 text-white font-medium break-words whitespace-pre-wrap border border-white/15 shadow-sm">
                                {c.text}
                              </div>
                              <div className="text-[10px] text-emerald-300/80 mt-1 italic">
                                {isEn ? '*Automated update from TikTak. Please do not reply.*' : '*שימו לב: זוהי הודעה אוטומטית ממערכת TikTak ואין להשיב עליה.*'}
                              </div>
                            </div>

                            <div className={`absolute top-full -mt-1 border-4 border-transparent border-t-slate-900 ${isEn ? 'right-6' : 'left-6'}`} />
                          </div>
                        )}
                      </div>
                    )}

                    <button 
                      onClick={() => onDelete(ticket, c)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title={labels.discard}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed break-words whitespace-pre-wrap">{c.text}</p>
              </div>
            ))
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400">
              <div className="bg-slate-100 p-4 rounded-full mb-3">
                <MessageSquare size={32} className="opacity-20" />
              </div>
              <p className="text-sm font-medium italic">{labels.noComments}</p>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-100 bg-white">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={labels.placeholder}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none mb-3 min-h-[80px]"
            autoFocus
          />
          <div className="flex justify-between items-center gap-3">
            <button 
              onClick={() => setNewComment('')}
              disabled={!newComment || loading}
              className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <AlertCircle size={14} />
              {labels.discard}
            </button>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSaveInternal}
                disabled={!newComment.trim() || loading}
                className="px-4 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Send size={13} />
                {labels.save}
              </button>
              <div className="relative group/whatsapp-footer-btn">
                <button 
                  onClick={handleSaveAndSendWhatsAppAction}
                  disabled={!newComment.trim() || loading || !hasWhatsAppPhone}
                  className="px-4 py-2 text-xs font-black text-white bg-[#25D366] hover:bg-[#20bd5a] disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <MessageCircle size={14} />
                  {labels.saveAndSendWhatsApp}
                </button>

                {/* Rich WhatsApp Message Preview Tooltip for footer button */}
                {hasWhatsAppPhone && newComment.trim() && (
                  <div className={`pointer-events-none absolute bottom-full mb-2.5 hidden group-hover/whatsapp-footer-btn:flex flex-col w-72 bg-slate-900 text-white rounded-xl p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 border border-slate-700/80 ${isEn ? 'right-0' : 'left-0'}`}>
                    <div className="text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <MessageCircle size={13} className="text-[#25D366]" />
                      <span>{isEn ? 'Send this note as a WhatsApp update to reporter:' : 'שלח הערה זו כהודעת וואטסאפ לתושב:'}</span>
                    </div>

                    {/* WhatsApp Note Bubble */}
                    <div className="bg-[#075E54] text-white text-[11px] leading-relaxed p-2.5 rounded-xl border border-emerald-600/40 shadow-inner font-sans text-right" dir={isEn ? 'ltr' : 'rtl'}>
                      <div className="text-emerald-200 font-semibold mb-1">
                        {isEn ? `Hello ${recipientName}, new update for ticket #${tNumber}:` : `שלום ${recipientName},\nנשלח עבורך עדכון חדש במערכת לגבי פנייה מספר #${tNumber}:`}
                      </div>
                      <div className="bg-white/10 p-2 rounded-lg my-1.5 text-white font-medium break-words whitespace-pre-wrap border border-white/15 shadow-sm">
                        {newComment.trim()}
                      </div>
                      <div className="text-[10px] text-emerald-300/80 mt-1 italic">
                        {isEn ? '*Automated update from TikTak. Please do not reply.*' : '*שימו לב: זוהי הודעה אוטומטית ממערכת TikTak ואין להשיב עליה.*'}
                      </div>
                    </div>

                    <div className={`absolute top-full -mt-1 border-4 border-transparent border-t-slate-900 ${isEn ? 'right-6' : 'left-6'}`} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
