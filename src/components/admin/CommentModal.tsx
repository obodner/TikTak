import React, { useState } from 'react';
import { X, MessageSquare, Trash2, Clock, Send, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  authorName?: string;
}

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: {
    id: string;
    category: string;
    adminComments?: Comment[];
  } | null;
  onSave: (ticketId: string, text: string) => Promise<void>;
  onDelete: (ticketId: string, commentId: string) => Promise<void>;
  isEn: boolean;
}

export const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  ticket,
  onSave,
  onDelete,
  isEn
}) => {
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !ticket) return null;

  const labels = {
    title: isEn ? 'Internal Comments' : 'הערות פנימיות',
    placeholder: isEn ? 'Add a note...' : 'הוסף הערה...',
    save: isEn ? 'Save' : 'שמור',
    cancel: isEn ? 'Cancel' : 'ביטול',
    discard: isEn ? 'Discard' : 'נקה',
    noComments: isEn ? 'No notes yet.' : 'אין הערות עדיין.',
    deleteConfirm: isEn ? 'Delete this note?' : 'למחוק הערה זו?',
  };

  const handleSave = async () => {
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      await onSave(ticket.id, newComment.trim());
      setNewComment('');
    } finally {
      setLoading(false);
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
                <div className="flex justify-between items-start mb-1">
                  <div className="flex flex-col">
                    {c.authorName && (
                      <span className="text-[10px] font-black text-blue-700 mb-0.5">{c.authorName}</span>
                    )}
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock size={10} />
                      <span className="text-[9px] font-bold">{formatDate(c.createdAt)}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => onDelete(ticket.id, c.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title={labels.discard}
                  >
                    <Trash2 size={14} />
                  </button>
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
          <div className="flex justify-between gap-3">
            <button 
              onClick={() => setNewComment('')}
              disabled={!newComment || loading}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <AlertCircle size={14} />
              {labels.discard}
            </button>
            <div className="flex gap-2">
              <button 
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
              >
                {labels.cancel}
              </button>
              <button 
                onClick={handleSave}
                disabled={!newComment.trim() || loading}
                className="px-6 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-all shadow-md flex items-center gap-2"
              >
                <Send size={14} />
                {labels.save}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
